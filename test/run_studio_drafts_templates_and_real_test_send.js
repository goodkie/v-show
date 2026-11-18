'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const studioStorage = require('../extension/email-studio/studio-storage');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');

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
  console.log('ALL STUDIO DRAFT/TEMPLATE/REAL-TEST/PRODUCTION TESTS PASSED (7/7)');
})();
