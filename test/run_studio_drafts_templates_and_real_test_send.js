'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const studioStorage = require('../extension/email-studio/studio-storage');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');
const { FROM_EMAIL, normalizeSenderDisplayName, formatResendSenderFrom } = require('../companion/email-sender-identity');

function createMockChromeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get(keys, cb) {
      const out = {};
      for (const k of keys) {
        if (map.has(k)) out[k] = map.get(k);
      }
      cb(out);
    },
    set(obj, cb) {
      for (const [k, v] of Object.entries(obj)) {
        map.set(k, v);
      }
      cb();
    }
  };
}

function createMockWebStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v))
  };
}

(async () => {
  // P0E: Public sender name is the campaign business name, not the XPIDER product name.
  assert.strictEqual(FROM_EMAIL, 'noreply@vivpr.pro');
  assert.strictEqual(formatResendSenderFrom('STUDIOBERRY PLUS'), 'STUDIOBERRY PLUS <noreply@vivpr.pro>');
  assert.strictEqual(formatResendSenderFrom('StudioBerry, Inc.'), '"StudioBerry, Inc." <noreply@vivpr.pro>');
  assert.strictEqual(formatResendSenderFrom(''), 'vivpr.pro <noreply@vivpr.pro>');
  assert.strictEqual(formatResendSenderFrom('Hello\r\nBcc: unintended@host.invalid'), '"Hello Bcc: unintended@host.invalid" <noreply@vivpr.pro>');
  assert.ok(normalizeSenderDisplayName('x'.repeat(120)).length <= 80);
  const studioSenderSource = fs.readFileSync(path.join(__dirname, '../extension/email-studio/email-template-studio.js'), 'utf8');
  assert.strictEqual((studioSenderSource.match(/senderName: v\.company/g) || []).length, 3,
    'Real test, production and second wave must all pass the business sender name');
  console.log('PASS P0E: business From name, safe display-name formatting and studio sender plumbing');

  // P0A-1: Empty store + legacy v1 migration
  const mockChrome = createMockChromeStorage();
  const mockWeb = createMockWebStorage({
    [studioStorage.LEGACY_DRAFT_KEY]: JSON.stringify({
      savedAt: '2026-11-18T00:00:00.000Z',
      draft: { kind: 'marketing', subject: '기존 제목', body: '기존 본문', cta: '자세히' }
    })
  });
  const mig = await studioStorage.loadDraftsStore({ chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(mig.ok, true);
  assert.strictEqual(mig.migrated, true);
  assert.strictEqual(mig.store.items.length, 1);
  assert.strictEqual(mig.store.items[0].data.subject, '기존 제목');
  console.log('PASS P0A-1: legacy v1 draft migrated to chrome.storage.local v2');

  // P0A-2: Multi-draft save + read-after-write verification + reload + delete
  const fullData = {
    kind: 'service',
    subject: '신규 초안 제목',
    preheader: '요약 문구',
    brand: 'XPIDER',
    heading: '헤더',
    body: '첫째 줄\n둘째 줄',
    image: 'https://cdn.vivpr.pro/banner.png',
    alt: '배너',
    cta: '확인하기',
    link: 'https://vivpr.pro',
    reply: 'support@vivpr.pro',
    company: 'VivPR',
    address: 'Seoul, KR',
    unsubscribe: ''
  };
  const saved = await studioStorage.saveDraft({ id: 'draft_test_1', name: '테스트 초안', data: fullData }, { chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(saved.backend, 'chrome.storage.local');
  const reloaded = await studioStorage.loadDraftsStore({ chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(reloaded.store.items.length, 2);
  assert.ok(studioStorage.draftsEqual(reloaded.store.items[0].data, fullData));
  await studioStorage.deleteDraft('draft_test_1', { chromeStorage: mockChrome, webStorage: mockWeb });
  const afterDel = await studioStorage.loadDraftsStore({ chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(afterDel.store.items.length, 1);
  console.log('PASS P0A-2: multi-draft save, readback verify, reload, delete');

  // P0A-3: Corrupt JSON recovery & secret pattern rejection
  const corruptChrome = createMockChromeStorage({ [studioStorage.DRAFTS_STORE_KEY]: '{broken-json' });
  const rec = await studioStorage.loadDraftsStore({ chromeStorage: corruptChrome, webStorage: null });
  assert.strictEqual(rec.ok, false);
  assert.strictEqual(rec.recovered, true);
  assert.deepStrictEqual(rec.store.items, []);
  await assert.rejects(
    () => studioStorage.saveDraft({ id: 'bad', data: { subject: 're_live_secret_1234567890123' } }, { chromeStorage: mockChrome, webStorage: mockWeb }),
    /SECRET_PATTERN_REJECTED/
  );
  console.log('PASS P0A-3: corrupt JSON recovery & secret rejection');

  // P0B-1: Template JSON export -> import roundtrip + security rejections
  const exportedJson = JSON.stringify({ version: 1, template: fullData, note: 'No secrets' });
  const imported = studioStorage.validateAndSanitizeImportedTemplate(exportedJson);
  assert.strictEqual(imported.ok, true);
  assert.ok(studioStorage.draftsEqual(imported.template, fullData));
  assert.throws(() => studioStorage.validateAndSanitizeImportedTemplate('{"version":1,"__proto__":{},"template":{}}'), /UNSAFE_TEMPLATE_KEYS/);
  assert.throws(() => studioStorage.validateAndSanitizeImportedTemplate('{"version":1,"template":{"body":"<script>alert(1)</script>"}}'), /UNSAFE_HTML_REJECTED/);
  assert.throws(() => studioStorage.validateAndSanitizeImportedTemplate('not json'), /INVALID_TEMPLATE_JSON/);
  assert.throws(() => studioStorage.validateAndSanitizeImportedTemplate('{"version":99,"template":{}}'), /UNSUPPORTED_TEMPLATE_VERSION/);
  console.log('PASS P0B-1: template JSON roundtrip & fail-closed rejections');

  // P0B-2: Reusable Template Library CRUD
  const tplSaved = await studioStorage.saveTemplateToLibrary({ id: 'tpl_1', name: '공지 템플릿', data: fullData }, { chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(tplSaved.ok, true);
  const tplList = await studioStorage.loadTemplatesLibrary({ chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(tplList.store.items.length, 1);
  await studioStorage.deleteTemplateFromLibrary('tpl_1', { chromeStorage: mockChrome, webStorage: mockWeb });
  const tplAfter = await studioStorage.loadTemplatesLibrary({ chromeStorage: mockChrome, webStorage: mockWeb });
  assert.strictEqual(tplAfter.store.items.length, 0);
  console.log('PASS P0B-2: reusable template library CRUD');

  // P0C: Real Test Email negative gates on Sidecar
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-real-test-neg-'));
  const sidecar = new EmailTestSidecar({ stateDir: tmpDir, port: 19992, trustedTestMode: true });
  await sidecar.start();
  try {
    const tok = fs.readFileSync(path.join(tmpDir, '.email_sidecar_token'), 'utf8').trim();
    const hdr = { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' };
    const r1 = await fetch('http://127.0.0.1:19992/email/production/real-test-send', {
      method: 'POST', headers: hdr, body: JSON.stringify({ recipient: 'owner@example.com', ownerTestConsentConfirmed: false })
    }).then(r => r.json());
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.reason, 'OWNER_TEST_CONSENT_REQUIRED');

    const r2 = await fetch('http://127.0.0.1:19992/email/production/real-test-send', {
      method: 'POST', headers: hdr, body: JSON.stringify({ recipient: 'delivered@resend.dev', ownerTestConsentConfirmed: true })
    }).then(r => r.json());
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.reason, 'SIMULATOR_ADDRESS_USE_SIMULATOR_BOX');
    console.log('PASS P0C: real-test-send negative gates (0 outbound)');
  } finally {
    await sidecar.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // P0D: UI DOM presence checks
  const html = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/index.html'), 'utf8');
  for (const id of [
    'btnSaveDraft', 'btnLoadDraft', 'draftSelect', 'draftNameInput', 'draftStatus',
    'btnImportTemplate', 'importTemplateFile', 'templateLibrarySelect', 'btnSaveToTemplateLibrary',
    'btnRealTestSend', 'realTestRecipient', 'realTestConsentCheck', 'realTestStatus', 'btnCheckRealTestStatus',
    'btnProdSend', 'btnProdStop', 'btnCheckProdPreflight', 'prodGateBadge', 'prodQueueBadge',
    'senderDisplayName', 'fromHeaderPreview'
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing UI element #${id}`);
  }
  console.log('PASS P0D: all Draft/Template/RealTest/Production UI controls present');
  // P0D-2: Lawful basis import (US CAN-SPAM vs non-US vs scraped rejection)
  const { EmailProductionPipeline } = require('../companion/email-production-pipeline');
  const tmpBasisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-lawful-basis-'));
  try {
    const p = new EmailProductionPipeline({ stateDir: tmpBasisDir, trustedTestMode: true });
    const usOk = p.importAndPersistRecipients({
      csvText: 'email,name\nusbuyer@example.com,US Buyer',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXISTING_CUSTOMER_US_CAN_SPAM',
      jurisdiction: 'US',
      authorizationSource: 'shopify_us_customers',
      campaignId: 'us-can-spam'
    });
    assert.strictEqual(usOk.summary.counts.PENDING, 1);

    const nonUsBlocked = p.importAndPersistRecipients({
      csvText: 'email,name\neubuyer@example.com,EU Buyer',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXISTING_CUSTOMER_US_CAN_SPAM',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'shopify_eu_customers',
      campaignId: 'non-us-blocked'
    });
    assert.strictEqual(nonUsBlocked.summary.counts.SKIPPED_NO_CONSENT, 1);

    const scrapedBlocked = p.importAndPersistRecipients({
      csvText: 'email,name\nscraped@example.com,Scraped',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'scraped_collector_csv',
      campaignId: 'scraped-blocked'
    });
    assert.strictEqual(scrapedBlocked.summary.counts.SKIPPED_NO_CONSENT, 1);
    console.log('PASS P0D-2: US CAN-SPAM allowed for US, blocked for non-US & scraped sources');
  } finally {
    fs.rmSync(tmpBasisDir, { recursive: true, force: true });
  }

  // P0D-3: Verified list one-check bulk send + re-import replay idempotency + provider error + stop/resume (mocked Resend, 0 real sends)
  const tmpBulkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-onecheck-bulk-'));
  try {
    let resendCalls = 0;
    const mockFetch = async (u) => {
      const s = String(u);
      if (s.includes('/api/sync/suppressions')) return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [] }) };
      if (s.includes('/api/sync/tokens')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      if (s.includes('api.resend.com/emails')) {
        resendCalls++;
        return { ok: true, status: 200, json: async () => ({ id: 'mock_msg_' + resendCalls }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    };
    const pBulk = new EmailProductionPipeline({
      stateDir: tmpBulkDir,
      trustedTestMode: true
    });
    pBulk.evaluatePreflight = async () => ({ deliverabilityGate: { action: 'REVIEW', reasons: [] } });
    const impBulk = pBulk.importAndPersistRecipients({
      csvText: 'email,name\nverified1@example.com,V1\nverified1@example.com,V1Dup\nsup@example.com,Sup',
      optOutText: 'sup@example.com',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'crm_verified_2026',
      campaignId: 'bulk-onecheck-1'
    });
    assert.strictEqual(impBulk.summary.counts.PENDING, 1);
    assert.strictEqual(impBulk.summary.counts.SKIPPED_SUPPRESSED, 1);

    const run1 = await pBulk.runQueue({
      mode: 'LIVE_PRODUCTION',
      subject: 'One-Check Bulk Test',
      html: '<p>Hello</p>',
      text: 'Hello',
      baseUrl: 'https://unsubscribe.vivpr.pro',
      syncToken: 'sync-tok-1234567890',
      syncFetchImpl: mockFetch,
      hasResendKey: true,
      apiKey: 're_test_mock_key',
      ownerExplicitApproval: true,
      publicUnsubscribeHttpsVerified: true
    });
    assert.strictEqual(run1.ok, true);
    assert.strictEqual(run1.sentInThisRun, 1);
    assert.strictEqual(resendCalls, 1);

    // Re-importing same CSV + campaignId marks prior accepted recipient as ALREADY_SENT_IDEMPOTENT (0 duplicate sends)
    const impReplay = pBulk.importAndPersistRecipients({
      csvText: 'email,name\nverified1@example.com,V1',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'crm_verified_2026',
      campaignId: 'bulk-onecheck-1'
    });
    assert.strictEqual(impReplay.summary.counts.PENDING, 0);
    assert.strictEqual(impReplay.summary.counts.ACCEPTED, 1);

    // P0D-4: Mixed CSV without checkbox: pre-verified ledger recipient stays PENDING, unknown is SKIPPED_NO_CONSENT (even for service)
    pBulk.consentLedger.recordConsent({
      email: 'preverified@example.com',
      name: 'PreVerified',
      authorizationSource: 'prior_verified_optin',
      authorizationAt: new Date().toISOString()
    });
    const impMixed = pBulk.importAndPersistRecipients({
      csvText: 'email,name\npreverified@example.com,Pre\nunknown@example.com,Unk',
      messageKind: 'service',
      consentAttested: false,
      campaignId: 'mixed-auth-check'
    });
    assert.strictEqual(impMixed.summary.counts.PENDING, 1);
    assert.strictEqual(impMixed.summary.counts.SKIPPED_NO_CONSENT, 1);
    const pfMixed = await pBulk.evaluatePreflight({ hasResendKey: true, ownerExplicitApproval: true, publicUnsubscribeHttpsVerified: true });
    assert.ok(!pfMixed.deliverabilityGate.reasons.includes('RECIPIENT_AUTHORIZATION_UNKNOWN'));
    console.log('PASS P0D-3 & P0D-4: one-check bulk + mixed pre-verified vs unknown authorization');

    // P0D-5: 5,786-row CSV import + checkbox attestation enables full eligible queue without XPIDER artificial cap
    const rows5786 = ['email,name'];
    for (let i = 0; i < 5786; i++) rows5786.push(`cust${i}@example.com,Cust ${i}`);
    const imp5786 = pBulk.importAndPersistRecipients({
      csvText: rows5786.join('\n'),
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'owner_crm_5786',
      campaignId: 'bulk-5786-test'
    });
    assert.strictEqual(imp5786.summary.counts.PENDING, 5786);
    assert.strictEqual(imp5786.summary.counts.SKIPPED_NO_CONSENT, 0);
    console.log('PASS P0D-5: 5,786-row verified CSV queued cleanly with zero artificial XPIDER cap');

    // P0D-6: Network failure on /api/sync/tokens in LIVE_PRODUCTION never leaves entry stuck in SENDING and returns structured Fail-Closed reason
    pBulk.importAndPersistRecipients({
      csvText: 'email,name\nsyncfail1@example.com,SF1\nsyncfail2@example.com,SF2',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'owner_crm_sync_test',
      campaignId: 'sync-fail-test'
    });
    const origEval = pBulk.evaluatePreflight.bind(pBulk);
    pBulk.evaluatePreflight = async () => ({ deliverabilityGate: { action: 'ALLOW', reasons: [] }, minimalAuthorizationNeededForSingleLiveSend: [] });
    let syncFailResendCalls = 0;
    const syncFailOut = await pBulk.runQueue({
      mode: 'LIVE_PRODUCTION',
      subject: 'Sync Fail Test',
      html: '<p>Hi</p>',
      text: 'Hi',
      baseUrl: 'https://unsubscribe.vivpr.pro',
      hasResendKey: true,
      apiKey: 're_test_12345678901234567890',
      ownerExplicitApproval: true,
      publicUnsubscribeHttpsVerified: true,
      syncToken: 'sync-tok',
      syncFetchImpl: async (url) => {
        if (String(url).includes('/api/sync/suppressions')) {
          return { ok: true, status: 200, json: async () => ({ hashes: [] }) };
        }
        if (String(url).includes('/api/sync/tokens')) {
          throw new Error('ECONNRESET simulated');
        }
        syncFailResendCalls++;
        return { ok: true, status: 200, json: async () => ({ id: 'msg_should_not_send' }) };
      }
    });
    assert.strictEqual(syncFailOut.ok, false);
    assert.strictEqual(syncFailOut.status, 'BLOCKED');
    assert.strictEqual(syncFailOut.reason, 'UNSUBSCRIBE_TOKEN_SYNC_FAILED');
    assert.ok(Array.isArray(syncFailOut.blockingReasons) && syncFailOut.blockingReasons.includes('UNSUBSCRIBE_TOKEN_SYNC_FAILED'));
    assert.ok(syncFailOut.koreanReason && syncFailOut.koreanReason.length > 10);
    assert.strictEqual(syncFailOut.summary.counts.SENDING, 0);
    assert.strictEqual(syncFailOut.summary.counts.PENDING, 2);
    assert.strictEqual(syncFailResendCalls, 0);
    console.log('PASS P0D-6: /api/sync/tokens exception reverts SENDING->PENDING with structured Fail-Closed reason');

    // P0D-7: Resend daily quota exceeded returns structured BLOCKED + preserves idempotency on restart
    let quotaCallNum = 0;
    const quotaOut = await pBulk.runQueue({
      mode: 'LIVE_PRODUCTION',
      subject: 'Quota Test',
      html: '<p>Hi</p>',
      text: 'Hi',
      baseUrl: 'https://unsubscribe.vivpr.pro',
      hasResendKey: true,
      apiKey: 're_test_12345678901234567890',
      ownerExplicitApproval: true,
      publicUnsubscribeHttpsVerified: true,
      syncToken: 'sync-tok',
      syncFetchImpl: async (url) => {
        if (String(url).includes('/api/sync/suppressions')) {
          return { ok: true, status: 200, json: async () => ({ hashes: [] }) };
        }
        if (String(url).includes('/api/sync/tokens')) {
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        quotaCallNum++;
        if (quotaCallNum === 1) {
          return { ok: true, status: 200, json: async () => ({ id: 'msg_quota_1' }) };
        }
        return { ok: false, status: 429, json: async () => ({ name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }) };
      }
    });
    assert.strictEqual(quotaOut.ok, true);
    assert.strictEqual(quotaOut.status, 'STOPPED');
    assert.strictEqual(quotaOut.reason, 'PROVIDER_DAILY_QUOTA_EXCEEDED');
    assert.strictEqual(quotaOut.stopReason, 'PROVIDER_DAILY_QUOTA_EXCEEDED');
    assert.ok(Array.isArray(quotaOut.blockingReasons) && quotaOut.blockingReasons.includes('PROVIDER_DAILY_QUOTA_EXCEEDED'));
    assert.ok(quotaOut.koreanReason && quotaOut.koreanReason.length > 10);
    assert.strictEqual(quotaOut.sentInThisRun, 1);
    assert.strictEqual(quotaOut.summary.counts.ACCEPTED, 1);
    assert.strictEqual(quotaOut.summary.counts.PENDING, 1);
    console.log('PASS P0D-7: Resend daily quota returns structured Fail-Closed reason and keeps accepted idempotent');

    // P0D-8: Transient /api/sync/tokens timeouts recover cleanly on retry (attempt 3) without halting queue
    pBulk.importAndPersistRecipients({
      csvText: 'email,name\nretryok@example.com,RetryOK',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'owner_retry_test',
      campaignId: 'retry-sync-test'
    });
    let syncTryCount = 0;
    let resendIdempKeys = [];
    const retryOut = await pBulk.runQueue({
      mode: 'LIVE_PRODUCTION',
      subject: 'Retry Sync Test',
      html: '<p>Hi</p>',
      text: 'Hi',
      baseUrl: 'https://unsubscribe.vivpr.pro',
      hasResendKey: true,
      apiKey: 're_test_12345678901234567890',
      ownerExplicitApproval: true,
      publicUnsubscribeHttpsVerified: true,
      syncToken: 'sync-tok',
      syncFetchImpl: async (url, init) => {
        if (String(url).includes('/api/sync/suppressions')) return { ok: true, status: 200, json: async () => ({ suppressions: [] }) };
        if (String(url).includes('/api/sync/tokens')) {
          syncTryCount++;
          if (syncTryCount < 3) throw new Error('The operation was aborted due to timeout');
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        // P0D-9 combined: fail first Resend call transiently, succeed second with identical Idempotency-Key
        resendIdempKeys.push(init.headers['Idempotency-Key']);
        if (resendIdempKeys.length === 1) throw new Error('ETIMEDOUT transient');
        return { ok: true, status: 200, json: async () => ({ id: 'msg_retry_ok_1' }) };
      }
    });
    assert.strictEqual(retryOut.ok, true);
    assert.strictEqual(retryOut.status, 'COMPLETED');
    assert.strictEqual(syncTryCount, 3);
    assert.strictEqual(resendIdempKeys.length, 2);
    assert.strictEqual(resendIdempKeys[0], resendIdempKeys[1], 'Resend retry reused identical Idempotency-Key');
    assert.strictEqual(retryOut.summary.counts.ACCEPTED, 1);
    console.log('PASS P0D-8 & P0D-9: /api/sync/tokens 3-attempt retry + idempotent Resend timeout retry');

    // P0D-10: startQueueBackground returns STARTED immediately and completes asynchronously with lastRunResult
    pBulk.importAndPersistRecipients({
      csvText: 'email,name\nbg1@example.com,BG1',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'owner_bg_test',
      campaignId: 'bg-run-test'
    });
    const bgStart = await pBulk.startQueueBackground({
      mode: 'LIVE_PRODUCTION',
      subject: 'BG Test',
      html: '<p>Hi</p>',
      text: 'Hi',
      baseUrl: 'https://unsubscribe.vivpr.pro',
      hasResendKey: true,
      apiKey: 're_test_12345678901234567890',
      ownerExplicitApproval: true,
      publicUnsubscribeHttpsVerified: true,
      syncToken: 'sync-tok',
      syncFetchImpl: async (url) => {
        if (String(url).includes('/api/sync/suppressions')) return { ok: true, status: 200, json: async () => ({ suppressions: [] }) };
        if (String(url).includes('/api/sync/tokens')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
        return { ok: true, status: 200, json: async () => ({ id: 'msg_bg_1' }) };
      }
    });
    assert.strictEqual(bgStart.ok, true);
    assert.strictEqual(bgStart.status, 'STARTED');
    await pBulk._activeBgPromise;
    assert.strictEqual(pBulk._queueRunning, false);
    assert.ok(pBulk.lastRunResult && pBulk.lastRunResult.status === 'COMPLETED' && pBulk.lastRunResult.sentInThisRun === 1);
    pBulk.evaluatePreflight = origEval;
    console.log('PASS P0D-10: startQueueBackground starts cleanly and records completed lastRunResult');
  } finally {
    fs.rmSync(tmpBulkDir, { recursive: true, force: true });
  }

  // P0D-11: senderDisplayName & company persist/restore across drafts, templates, and standalone HTML import
  {
    const c2 = createMockChromeStorage();
    const w2 = createMockWebStorage();
    const saved = await studioStorage.saveDraft({
      id: 'draft_sender_1',
      name: 'StudioBerry Campaign',
      data: {
        kind: 'marketing',
        subject: 'STUDIOBERRY PLUS 봄 시즌 안내',
        brand: 'StudioBerry',
        senderDisplayName: 'STUDIOBERRY PLUS',
        company: 'STUDIOBERRY PLUS',
        reply: 'support@vivpr.pro',
        heading: '안녕하세요',
        body: '본문 테스트입니다.'
      }
    }, { chromeStorage: c2, webStorage: w2 });
    assert.strictEqual(saved.ok, true);
    const loaded = await studioStorage.loadDraftsStore({ chromeStorage: c2, webStorage: w2 });
    assert.strictEqual(loaded.store.items[0].data.senderDisplayName, 'STUDIOBERRY PLUS');
    assert.strictEqual(loaded.store.items[0].data.company, 'STUDIOBERRY PLUS');
    assert.strictEqual(loaded.store.items[0].data.reply, 'support@vivpr.pro');

    const tpl = await studioStorage.saveTemplateToLibrary({
      id: 'tpl_sender_ko',
      name: 'Korean Sender Template',
      data: {
        kind: 'service',
        subject: '안내',
        senderDisplayName: '스튜디오베리 플러스',
        company: '스튜디오베리 주식회사',
        reply: 'help@vivpr.pro',
        body: '본문'
      }
    }, { chromeStorage: c2, webStorage: w2 });
    assert.strictEqual(tpl.ok, true);
    const tplLoaded = await studioStorage.loadTemplatesLibrary({ chromeStorage: c2, webStorage: w2 });
    assert.strictEqual(tplLoaded.store.items[0].data.senderDisplayName, '스튜디오베리 플러스');
    assert.strictEqual(tplLoaded.store.items[0].data.company, '스튜디오베리 주식회사');

    // Imported standalone HTML preserves existing senderDisplayName / company without overwriting them
    const htmlParsed = studioStorage.importHtmlEmailFile('<!doctype html><html><head><title>Imported Title</title></head><body><h1>Hello</h1><p>Imported body text here.</p></body></html>');
    assert.strictEqual(htmlParsed.subject, 'Imported Title');
    assert.strictEqual(htmlParsed.senderDisplayName, undefined);
    assert.strictEqual(htmlParsed.company, undefined);
    console.log('PASS P0D-11: senderDisplayName & company survive draft/template save/reload and HTML import');
  }

  // P0D-12: End-to-end mock Resend POST JSON capture across ALL 3 live routes (real-test-send, queue/run LIVE_PRODUCTION, second-wave/start) with 0 external calls
  const tmpRouteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-sender-routes-'));
  const origGlobalFetch = globalThis.fetch;
  let routeSidecar = null;
  try {
    const capturedResendPosts = [];
    globalThis.fetch = async (url, init = {}) => {
      const s = String(url);
      if (s.startsWith('http://127.0.0.1:')) {
        return origGlobalFetch(url, init);
      }
      if (s.includes('/api/sync/suppressions')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [] }) };
      }
      if (s.includes('/api/sync/events')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, events: [] }) };
      }
      if (s.includes('/api/sync/tokens')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (s.includes('api.resend.com/emails')) {
        const bodyObj = init && init.body ? JSON.parse(String(init.body)) : {};
        capturedResendPosts.push({ url: s, headers: init?.headers || {}, body: bodyObj });
        return { ok: true, status: 200, json: async () => ({ id: 'mock_resend_' + capturedResendPosts.length }) };
      }
      return { ok: false, status: 500, json: async () => ({ message: 'UNEXPECTED_URL:' + s }) };
    };

    fs.writeFileSync(path.join(tmpRouteDir, '.unsubscribe_sync_token'), 'mock-sync-token-1234567890', 'utf8');
    const rPort = 19995;
    routeSidecar = new EmailTestSidecar({
      port: rPort,
      stateDir: tmpRouteDir,
      trustedTestMode: true
    });
    routeSidecar.resolveResendApiKey = () => 're_test_mock_key_1234567890';
    routeSidecar.pipeline.saveUnsubscribePublicConfig({ publicBaseUrl: 'https://unsubscribe.vivpr.pro' });
    routeSidecar.pipeline.evaluatePreflight = async () => ({
      resendDomainConfig: { verified: true },
      dns: { allVerified: true },
      deliverabilityGate: { action: 'REVIEW', reasons: [] }
    });
    await routeSidecar.start();
    const rTok = fs.readFileSync(path.join(tmpRouteDir, '.email_sidecar_token'), 'utf8').trim();
    const postJson = async (p, body) => {
      const resp = await origGlobalFetch(`http://127.0.0.1:${rPort}${p}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${rTok}`,
          'Origin': 'chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj'
        },
        body: JSON.stringify(body)
      });
      return { status: resp.status, json: await resp.json() };
    };

    // Route 1A: real-test-send ASCII + Reply-To
    const rt1 = await postJson('/email/production/real-test-send', {
      recipient: 'owner-check@example.com',
      ownerTestConsentConfirmed: true,
      senderDisplayName: 'STUDIOBERRY PLUS',
      senderName: 'vivpr.pro',
      company: 'STUDIOBERRY PLUS',
      replyTo: 'support@vivpr.pro',
      subject: 'STUDIOBERRY PLUS 안내',
      html: '<p>Hello</p>',
      text: 'Hello'
    });
    assert.strictEqual(rt1.status, 200);
    assert.strictEqual(rt1.json.fromHeader, 'STUDIOBERRY PLUS <noreply@vivpr.pro>');
    assert.strictEqual(rt1.json.replyTo, 'support@vivpr.pro');
    assert.strictEqual(capturedResendPosts[0].body.from, 'STUDIOBERRY PLUS <noreply@vivpr.pro>');
    assert.strictEqual(capturedResendPosts[0].body.reply_to, 'support@vivpr.pro');
    assert.strictEqual(capturedResendPosts[0].body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

    // Route 1B: real-test-send Unicode Korean + quotes/comma + blank fallback -> vivpr.pro
    const rtKo = await postJson('/email/production/real-test-send', {
      recipient: 'owner-ko@example.com',
      ownerTestConsentConfirmed: true,
      senderDisplayName: '스튜디오베리 플러스',
      subject: '한글 발신자 테스트',
      html: '<p>안녕</p>',
      text: '안녕'
    });
    assert.strictEqual(rtKo.status, 200);
    assert.strictEqual(capturedResendPosts[1].body.from, '스튜디오베리 플러스 <noreply@vivpr.pro>');

    const rtQuote = await postJson('/email/production/real-test-send', {
      recipient: 'owner-q@example.com',
      ownerTestConsentConfirmed: true,
      senderDisplayName: 'STUDIOBERRY "PLUS", Inc.',
      subject: 'Quotes test',
      html: '<p>Q</p>',
      text: 'Q'
    });
    assert.strictEqual(rtQuote.status, 200);
    assert.strictEqual(capturedResendPosts[2].body.from, '"STUDIOBERRY \\"PLUS\\", Inc." <noreply@vivpr.pro>');

    const rtBlank = await postJson('/email/production/real-test-send', {
      recipient: 'owner-blank@example.com',
      ownerTestConsentConfirmed: true,
      senderDisplayName: '',
      senderName: '',
      company: '',
      brand: '',
      subject: '',
      html: '<p>Blank</p>',
      text: 'Blank'
    });
    assert.strictEqual(rtBlank.status, 200);
    assert.strictEqual(capturedResendPosts[3].body.from, 'vivpr.pro <noreply@vivpr.pro>');
    assert.ok(!capturedResendPosts[3].body.subject.includes('XPIDER'), 'Fallback subject must not use XPIDER');

    // Route 1C: CR/LF injection blocked with HTTP 400 and ZERO additional Resend calls
    const countBeforeInj = capturedResendPosts.length;
    const rtInj = await postJson('/email/production/real-test-send', {
      recipient: 'owner-inj@example.com',
      ownerTestConsentConfirmed: true,
      senderDisplayName: 'Evil\r\nBcc: steal@attacker.test',
      subject: 'Inj',
      html: '<p>No</p>',
      text: 'No'
    });
    assert.strictEqual(rtInj.status, 400);
    assert.strictEqual(rtInj.json.reason, 'SENDER_DISPLAY_NAME_HEADER_INJECTION_BLOCKED');
    assert.strictEqual(capturedResendPosts.length, countBeforeInj);

    // Route 2: production queue/run LIVE_PRODUCTION
    const impQ = await postJson('/email/production/import', {
      csvText: 'email,name\nprod1@example.com,Prod One',
      messageKind: 'marketing',
      consentAttested: true,
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      authorizationSource: 'owner_crm_verified',
      campaignId: 'default'
    });
    assert.strictEqual(impQ.status, 200);
    // Injection blocked fail-closed on queue/run with 0 Resend calls
    const qInj = await postJson('/email/production/queue/run', {
      mode: 'LIVE_PRODUCTION',
      senderDisplayName: 'Bad\nHeader',
      subject: 'Prod',
      html: '<p>Hi</p>',
      text: 'Hi'
    });
    assert.strictEqual(qInj.status, 409);
    assert.strictEqual(qInj.json.reason, 'SENDER_DISPLAY_NAME_HEADER_INJECTION_BLOCKED');
    assert.strictEqual(capturedResendPosts.length, countBeforeInj);

    const qOk = await postJson('/email/production/queue/run', {
      mode: 'LIVE_PRODUCTION',
      apiKey: 're_test_mock_key_1234567890',
      senderDisplayName: 'STUDIOBERRY PLUS',
      senderName: 'STUDIOBERRY PLUS',
      company: 'STUDIOBERRY PLUS',
      replyTo: 'support@vivpr.pro',
      subject: 'STUDIOBERRY PLUS 캠페인',
      html: '<p>Prod body</p>',
      text: 'Prod body'
    });
    assert.strictEqual(qOk.status, 200);
    assert.strictEqual(qOk.json.sentInThisRun, 1);
    assert.strictEqual(capturedResendPosts[4].body.from, 'STUDIOBERRY PLUS <noreply@vivpr.pro>');
    assert.strictEqual(capturedResendPosts[4].body.reply_to, 'support@vivpr.pro');
    assert.strictEqual(capturedResendPosts[4].body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

    // Route 3: second-wave/start on delivered non-opened recipient
    const deliveredMsgId = 'mock_resend_5';
    const cryptoMod = require('crypto');
    routeSidecar.analytics.recordEvent({
      event_id: 'svix_route3_delivered_1',
      type: 'email.delivered',
      email_id: deliveredMsgId,
      recipient_hashes: [cryptoMod.createHash('sha256').update('prod1@example.com').digest('hex')],
      created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    });
    const sw = await postJson('/email/campaigns/second-wave/start', {
      parentCampaignId: 'default',
      waveCampaignId: 'default-wave2-sender-test',
      cutoffHours: 0,
      apiKey: 're_test_mock_key_1234567890',
      senderDisplayName: '스튜디오베리 플러스',
      senderName: '스튜디오베리 플러스',
      company: '스튜디오베리 플러스',
      replyTo: 'support@vivpr.pro',
      subject: '스튜디오베리 플러스 2차 안내',
      html: '<p>Follow up</p>',
      text: 'Follow up',
      messageKind: 'marketing',
      ownerConfirmed: true
    });
    assert.strictEqual(sw.status, 200);
    assert.strictEqual(sw.json.sentInThisRun, 1);
    assert.strictEqual(capturedResendPosts[5].body.from, '스튜디오베리 플러스 <noreply@vivpr.pro>');
    assert.strictEqual(capturedResendPosts[5].body.reply_to, 'support@vivpr.pro');
    assert.ok(rt1.json.stepTimings && typeof rt1.json.stepTimings.totalMs === 'number', 'real-test-send must return stepTimings');

    // Verify GET /email/diagnostics/logs returns redacted server diagnostics
    const diagResp = await origGlobalFetch(`http://127.0.0.1:${rPort}/email/diagnostics/logs?limit=50`, {
      headers: { 'Authorization': `Bearer ${rTok}`, 'Origin': 'chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj' }
    });
    assert.strictEqual(diagResp.status, 200);
    const diagJson = await diagResp.json();
    assert.strictEqual(diagJson.ok, true);
    assert.ok(Array.isArray(diagJson.logs) && diagJson.logs.length > 0);
    const diagText = JSON.stringify(diagJson);
    assert.ok(!diagText.includes('re_test_mock_key'), 'Diagnostic logs must redact API keys');
    assert.ok(!diagText.includes('owner-check@example.com'), 'Diagnostic logs must mask raw emails');
    console.log('PASS P0D-12: mock Resend POST JSON From/Reply-To + stepTimings + redacted /email/diagnostics/logs verified across all 3 routes (0 external sends)');
  } finally {
    globalThis.fetch = origGlobalFetch;
    if (routeSidecar) await routeSidecar.stop().catch(() => {});
    fs.rmSync(tmpRouteDir, { recursive: true, force: true });
  }

  // P0D-13: Proxy 18990 bypass self-heal, native host clean exit with open stdin, concurrent DNS timeout safety, cumulative CSV & debug panel UI
  {
    const { spawn } = require('child_process');
    // 1. Native host exits cleanly with open stdin (matching Chrome sendNativeMessage)
    const nhScript = path.resolve(__dirname, '../companion/email-test-sidecar-native-host.js');
    const nhExit = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [nhScript], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = Buffer.alloc(0);
      const t = setTimeout(() => { try { child.kill(); } catch (_) {} reject(new Error('NATIVE_HOST_HUNG_WITH_OPEN_STDIN')); }, 4000);
      child.stdout.on('data', c => { out = Buffer.concat([out, c]); });
      child.on('exit', (code) => {
        clearTimeout(t);
        const len = out.length >= 4 ? out.readUInt32LE(0) : 0;
        const json = len > 0 ? JSON.parse(out.subarray(4, 4 + len).toString('utf8')) : null;
        resolve({ code, json });
      });
      const msg = Buffer.from(JSON.stringify({ action: 'PING' }), 'utf8');
      const hdr = Buffer.alloc(4);
      hdr.writeUInt32LE(msg.length, 0);
      child.stdin.write(Buffer.concat([hdr, msg])); // intentionally keep stdin open
    });
    assert.strictEqual(nhExit.code, 0);
    assert.strictEqual(nhExit.json.ok, true);

    // 2. Concurrent DNS verify runs 3 slow domains in parallel (< 900ms for 3 x 350ms)
    const tmpDnsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-dns-par-'));
    try {
      const pDns = new EmailProductionPipeline({ stateDir: tmpDnsDir, trustedTestMode: true });
      const dT0 = Date.now();
      const dnsOut = await pDns.verifyRecipientDomainsDns(
        { optInDnsCheck: true, domains: ['a.example.test', 'b.example.test', 'c.example.test'] },
        {
          resolveMx: async (d) => {
            await new Promise(r => setTimeout(r, 350));
            return [{ exchange: `mx.${d}`, priority: 10 }];
          },
          timeoutMs: 2000
        }
      );
      const wallMs = Date.now() - dT0;
      assert.strictEqual(dnsOut.ok, true);
      assert.strictEqual(dnsOut.checkedCount, 3);
      assert.ok(wallMs < 950, `Expected concurrent DNS (<950ms), got ${wallMs}ms`);
      assert.strictEqual(dnsOut.results['a.example.test'].validityStatus, 'DNS_MAIL_READY');
    } finally {
      fs.rmSync(tmpDnsDir, { recursive: true, force: true });
    }

    // 3. PrivacyGateway bypassList includes 18990 & ensureLoopbackPortBypass self-heals legacy proxy missing 18990
    const pgSrc = fs.readFileSync(path.resolve(__dirname, '../extension/modules/privacy-gateway.js'), 'utf8');
    assert.ok(pgSrc.includes('emailSidecarPort') && pgSrc.includes('ensureLoopbackPortBypass'), 'PrivacyGateway must include 18990 bypass & self-heal');
    const bgSrc = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
    assert.ok(bgSrc.includes('ensureLoopbackPortBypass') && bgSrc.includes('GET_EMAIL_SIDECAR_LOGS') && bgSrc.includes('NATIVE_HOST_TIMEOUT_8000MS') && bgSrc.includes('autoWakeAttempted') && bgSrc.includes('ensureEmailSidecarStarted') && bgSrc.includes('ENSURE_EMAIL_SIDECAR_RUNNING') && bgSrc.includes('onStartup'), 'background.js must include proxy self-heal, native timeout, startup/open auto-start & sidecar logs');

    // 3b. Native host auto-start spawns email-test-sidecar-cli.js via WMI detached breakout & CLI parses --port
    const nhSrc = fs.readFileSync(nhScript, 'utf8');
    assert.ok(nhSrc.includes('email-test-sidecar-cli.js') && nhSrc.includes('Win32_ProcessStartup') && nhSrc.includes('ENSURE_SIDECAR_RUNNING'), 'Native host must spawn email-test-sidecar-cli.js with Windows Job Object breakout');
    assert.ok(!nhSrc.includes("path.join(__dirname, 'email-test-sidecar.js')"), 'Native host must not spawn non-CLI module');
    const cliSrc = fs.readFileSync(path.resolve(__dirname, '../companion/email-test-sidecar-cli.js'), 'utf8');
    assert.ok(cliSrc.includes('--port') && cliSrc.includes('--skip-native-host-reg'), 'Sidecar CLI must accept --port and --skip-native-host-reg');
    const popupSrc = fs.readFileSync(path.resolve(__dirname, '../extension/popup.js'), 'utf8');
    assert.ok(popupSrc.includes('ENSURE_EMAIL_SIDECAR_RUNNING'), 'popup.js must wake Email Sidecar on popup open');

    // 4. Studio UI controls for cumulative CSV vault & debug log console
    const html2 = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/index.html'), 'utf8');
    for (const id of ['studioDebugPanel', 'studioDebugLogOutput', 'btnCopyDebugLog', 'btnDownloadDebugLog', 'btnPullSidecarLogs', 'btnClearDebugLog', 'debugLogFilter', 'btnClearRecipientStore', 'recipientVaultBadge']) {
      assert.ok(html2.includes(`id="${id}"`), `Missing debug/vault UI element #${id}`);
    }
    assert.ok(/id="recipientFile"[^>]*multiple/.test(html2), '#recipientFile must support multiple files');
    console.log('PASS P0D-13: native host clean exit, concurrent DNS, 18990 proxy bypass self-heal, cumulative CSV vault & debug console verified');
  }

  // ===== P0D-14: Large-Outbox Bulk Recipient Sync Speed + Consent Scope & Timeout Hardening =====
  {
    const tmpBulkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-bulk-sync-perf-'));
    try {
      const pBulk = new EmailProductionPipeline({ stateDir: tmpBulkDir, trustedTestMode: true });
      // Pre-seed ~3,000 existing outbox jobs (multi-MB outbox simulation, like Owner's 2.2MB store)
      const seedLines = ['email,name'];
      for (let i = 0; i < 3000; i++) seedLines.push(`seed_${i}@example.test,Seed ${i}`);
      const seedOut = pBulk.importAndPersistRecipients({
        csvText: seedLines.join('\n'),
        messageKind: 'marketing',
        consentAttested: true,
        lawfulBasis: 'EXPLICIT_OPT_IN',
        campaignId: 'seed-history'
      });
      assert.strictEqual(seedOut.ok, true);
      const outboxBytes = fs.statSync(path.join(tmpBulkDir, '.email_draft_outbox.json')).size;
      assert.ok(outboxBytes > 1000000, `Expected >1MB seeded outbox, got ${outboxBytes} bytes`);

      // Suppress 10 recipients in bulk and sync 1,000 production recipients
      const bulkLines = ['email,name'];
      const optOuts = [];
      for (let i = 0; i < 1000; i++) {
        bulkLines.push(`bulk_${i}@example.test,Bulk ${i}`);
        if (i < 10) optOuts.push(`bulk_${i}@example.test`);
      }
      const t0 = Date.now();
      const bulkOut = pBulk.importAndPersistRecipients({
        csvText: bulkLines.join('\n'),
        optOutText: optOuts.join('\n'),
        messageKind: 'marketing',
        consentAttested: true,
        lawfulBasis: 'EXPLICIT_OPT_IN',
        campaignId: 'default'
      });
      const firstElapsedMs = Date.now() - t0;
      assert.strictEqual(bulkOut.ok, true);
      assert.strictEqual(bulkOut.summary.counts.PENDING, 990);
      assert.strictEqual(bulkOut.summary.counts.SKIPPED_SUPPRESSED, 10);
      assert.ok(firstElapsedMs < 3500, `Expected fast 1000-recipient bulk sync on >1MB outbox (<3500ms), got ${firstElapsedMs}ms`);

      // Second re-sync of same 1,000 recipients must be even faster (no-op outbox skip + O(1) suppression set)
      const t1 = Date.now();
      const bulkOut2 = pBulk.importAndPersistRecipients({
        csvText: bulkLines.join('\n'),
        optOutText: optOuts.join('\n'),
        messageKind: 'marketing',
        consentAttested: true,
        lawfulBasis: 'EXPLICIT_OPT_IN',
        campaignId: 'default'
      });
      const secondElapsedMs = Date.now() - t1;
      assert.strictEqual(bulkOut2.summary.counts.PENDING, 990);
      assert.ok(secondElapsedMs < 2000, `Expected fast steady-state re-sync (<2000ms), got ${secondElapsedMs}ms`);
      console.log(`  [perf] seededOutbox=${Math.round(outboxBytes / 1024)}KB, 1000-sync=${firstElapsedMs}ms, re-sync=${secondElapsedMs}ms`);
    } finally {
      fs.rmSync(tmpBulkDir, { recursive: true, force: true });
    }

    // Verify handleConsentAttestChanged is inside initRecipientUi() scope (fixes ReferenceError: recipients is not defined)
    const studioSrc = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/email-template-studio.js'), 'utf8');
    const initIdx = studioSrc.indexOf('function initRecipientUi()');
    const letRecipIdx = studioSrc.indexOf('let recipients = [];');
    const consentFnIdx = studioSrc.indexOf('async function handleConsentAttestChanged(');
    assert.ok(initIdx > 0 && letRecipIdx > initIdx && consentFnIdx > letRecipIdx, 'handleConsentAttestChanged must be declared inside initRecipientUi after let recipients');
    assert.ok(studioSrc.includes('activeSyncPromise') && studioSrc.includes('buildSyncPayloadAndSig'), 'syncSidecarRecipients must deduplicate/serialize concurrent syncs');
    assert.ok(/action === 'SYNC_EMAIL_PRODUCTION_RECIPIENTS'\s*\?\s*50000/.test(studioSrc), 'callBg must allow 50000ms for SYNC_EMAIL_PRODUCTION_RECIPIENTS');
    const bgSrc2 = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
    assert.ok(/request\.action === 'SYNC_EMAIL_PRODUCTION_RECIPIENTS'\s*\?\s*45000/.test(bgSrc2), 'background.js must allow 45000ms for SYNC_EMAIL_PRODUCTION_RECIPIENTS');
    console.log('PASS P0D-14: large-outbox bulk sync O(1) speed, consent handler scope fix, sync coalescing & timeout hardening verified');
  }

  console.log('ALL STUDIO DRAFT/TEMPLATE/REAL-TEST/PRODUCTION TESTS PASSED (18/18)');
})();
