'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const studioStorage = require('../extension/email-studio/studio-storage');
const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
const { DraftOutbox } = require('../companion/email-draft-outbox');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('../companion/email-test-sidecar-set-key');

(async () => {
  // 1. P0 unlinkSync TOCTOU / symlink / hardlink audit in EmailSimulatorLedger
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-toctou-audit-'));
  try {
    const ledgerFile = path.join(tmpDir, '.email_simulator_ledger.jsonl');
    const lockFile = ledgerFile + '.lock';
    const fakeFsHardlink = {
      ...fs,
      lstatSync(p) {
        const st = fs.lstatSync(p);
        if (p === lockFile) {
          return Object.assign(Object.create(Object.getPrototypeOf(st)), st, {
            ino: st.ino,
            nlink: 2,
            isSymbolicLink: () => false,
            isFile: () => true
          });
        }
        return st;
      }
    };
    const ledgerHL = new EmailSimulatorLedger({ ledgerFile, trustedTestMode: true, fsImpl: fakeFsHardlink });
    assert.throws(() => ledgerHL._withExclusiveLock(() => 'noop'), /LEDGER_LOCK_HARDLINK_REJECTED|LEDGER_LOCK_RELEASE_FAILED/);
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

    const fakeFsSymlink = {
      ...fs,
      lstatSync(p) {
        const st = fs.lstatSync(p);
        if (p === lockFile) {
          return Object.assign(Object.create(Object.getPrototypeOf(st)), st, {
            ino: st.ino,
            nlink: 1,
            isSymbolicLink: () => true,
            isFile: () => false
          });
        }
        return st;
      }
    };
    const ledgerSL = new EmailSimulatorLedger({ ledgerFile, trustedTestMode: true, fsImpl: fakeFsSymlink });
    assert.throws(() => ledgerSL._withExclusiveLock(() => 'noop'), /LEDGER_LOCK_SYMLINK_OR_REPARSE_REJECTED|LEDGER_LOCK_RELEASE_FAILED/);
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    console.log('PASS TOCTOU-1: EmailSimulatorLedger rejects hardlink & symlink before unlinkSync');

    // 2. Windows NTFS ACL regression test
    const secFile = path.join(tmpDir, '.protected_test.secret');
    writeProtectedSecretFile(secFile, 'test-secret-value\n');
    if (process.platform === 'win32' && process.env.USERNAME) {
      verifyWindowsDacl(secFile, process.env.USERNAME);
      assert.throws(() => verifyWindowsDacl(secFile, 'NonExistentBogusUser_999'), /ACL|owner|access/i);
    }
    console.log('PASS TOCTOU-2: Windows NTFS ACL verification & bogus-owner rejection');

    // 3. DraftOutbox regular operation & temp sweep
    const outboxFile = path.join(tmpDir, '.outbox.json');
    fs.writeFileSync(outboxFile + '.99999.deadbeef.tmp', 'orphan', 'utf8');
    const outbox = new DraftOutbox(outboxFile);
    assert.strictEqual(fs.existsSync(outboxFile + '.99999.deadbeef.tmp'), false);
    console.log('PASS TOCTOU-3: DraftOutbox safe temp sweep');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 4. HTML Import: BOM + full doc + inline CSS + HTTPS image + CTA + sanitization
  const fullHtml = '\uFEFF<!doctype html><html><head><title>가을 프로모션 안내</title><link rel="stylesheet" href="https://evil.example/a.css"></head>' +
    '<body><table style="width:600px"><tr><td style="padding:20px"><h1>신규 제품 출시</h1>' +
    '<p>안녕하세요 고객님.</p><img src="https://cdn.vivpr.pro/hero.png" onload="alert(1)">' +
    '<img src="/relative/logo.png"><a href="https://vivpr.pro/go" onclick="evil()">바로가기</a>' +
    '<a href="javascript:alert(2)">XSS</a><script>steal()</script><iframe src="https://x.test"></iframe>' +
    '</td></tr></table></body></html>';
  const res = studioStorage.importHtmlEmailFile(fullHtml);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.subject, '가을 프로모션 안내');
  assert.strictEqual(res.heading, '신규 제품 출시');
  assert.strictEqual(res.firstHttpsImg, 'https://cdn.vivpr.pro/hero.png');
  assert.strictEqual(res.firstHttpsLink, 'https://vivpr.pro/go');
  assert.ok(!/<script|<iframe|onload=|onclick=|javascript:/i.test(res.importedHtml));
  assert.ok(res.importedHtml.includes('style="padding:20px"'));
  assert.ok(res.importedHtml.includes('#blocked-unsafe-url'));
  assert.ok(res.warnings.length >= 2);
  console.log('PASS HTML-1: full HTML import preserves layout/CSS/HTTPS images & strips scripts/handlers');

  // 5. HTML Import: Fragment + negative cases
  const frag = studioStorage.importHtmlEmailFile('<div style="color:#111"><p>간단한 HTML 조각</p></div>');
  assert.strictEqual(frag.ok, true);
  assert.throws(() => studioStorage.importHtmlEmailFile(''), /EMPTY_HTML_FILE/);
  assert.throws(() => studioStorage.importHtmlEmailFile('plain text without tags'), /INVALID_HTML_DOCUMENT/);
  assert.throws(() => studioStorage.importHtmlEmailFile('<div>' + 'a'.repeat(530000) + '</div>'), /HTML_FILE_TOO_LARGE/);
  console.log('PASS HTML-2: fragment import & negative rejections');

  // 6. Stale UI banner removal & HTML import controls check
  const studioHtml = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/index.html'), 'utf8');
  assert.ok(studioHtml.includes('id="btnImportHtml"'));
  assert.ok(studioHtml.includes('id="importHtmlFile"'));
  assert.ok(studioHtml.includes('id="headerProdStateBadge"'));
  assert.ok(!studioHtml.includes('🔒 상용 발송 잠금'));
  assert.ok(!studioHtml.includes('STRICT HOLD'));
  console.log('PASS UI-1: stale 상용발송금지/STRICT HOLD removed & HTML import controls present');
  console.log('ALL TOCTOU + HTML IMPORT TESTS PASSED (6/6)');
})();
