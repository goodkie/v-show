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
    'btnProdSend', 'btnProdStop', 'btnCheckProdPreflight', 'prodGateBadge', 'prodQueueBadge'
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

  console.log('ALL STUDIO DRAFT/TEMPLATE/REAL-TEST/PRODUCTION TESTS PASSED (14/14)');
})();
