'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');
const { EmailProductionPipeline } = require('../companion/email-production-pipeline');

function req(port, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text: d, json });
      });
    });
    r.on('error', reject);
    if (body !== null) r.write(body);
    r.end();
  });
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_unsub_auto_test_'));
  let pass = 0;
  async function run(name, fn) {
    await fn();
    pass++;
    console.log('PASS ' + name);
  }

  try {
    const extOrigin = 'chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj';

    await run('DISTINCT_PER_RECIPIENT_TOKENS_HASHED_AT_REST_AND_FULL_MIME_RENDERED', async () => {
      const stateDir = path.join(tmpDir, 's1');
      const captured = [];
      const sc = new EmailTestSidecar({
        port: 19011,
        stateDir,
        trustedTestMode: true,
        minIntervalMs: 0,
        apiKeyOverride: 're_test_key_123456789',
        transportImpl: async payload => {
          captured.push(payload);
          return { status: 'SUCCESS', providerMessageId: 'sim_' + captured.length };
        }
      });
      await sc.start();
      try {
        const authH = {
          'Origin': extOrigin,
          'Authorization': `Bearer ${sc.token}`,
          'Content-Type': 'application/json'
        };
        const r1 = await req(19011, 'POST', '/email/test-send', authH, JSON.stringify({
          to: 'delivered@resend.dev',
          subject: 'Auto Unsub Test 1',
          html: '<html><body><p>Hello</p><a href="https://vivpr.pro/unsubscribe/preview-sample-only">구독 취소</a></body></html>',
          text: 'Hello\n\n구독 취소: https://vivpr.pro/unsubscribe/preview-sample-only (발송 시 수신자별 고유 링크 자동 삽입)',
          idempotencyKey: 'idem_unsub_test_0001_aaaaaaaaaa'
        }));
        assert.equal(r1.statusCode, 200);
        assert.equal(r1.json.status, 'SUCCESS');

        sc.lastTestSendAt = 0;
        const r2 = await req(19011, 'POST', '/email/test-send', authH, JSON.stringify({
          to: 'bounced@resend.dev',
          subject: 'Auto Unsub Test 2',
          html: '<html><body><p>Hello 2</p></body></html>',
          text: 'Hello 2',
          idempotencyKey: 'idem_unsub_test_0002_bbbbbbbbbb'
        }));
        assert.equal(r2.statusCode, 200);
        assert.equal(r2.json.status, 'SUCCESS');

        assert.equal(captured.length, 2);
        const h1 = captured[0].headers['List-Unsubscribe'];
        const h2 = captured[1].headers['List-Unsubscribe'];
        assert.ok(h1 && h2 && h1 !== h2, 'Distinct recipients must get distinct List-Unsubscribe URLs');
        assert.equal(captured[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
        assert.equal(captured[1].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

        const u1 = h1.slice(1, -1);
        const u2 = h2.slice(1, -1);
        assert.ok(!captured[0].html.includes('preview-sample-only'), 'Preview placeholder must be replaced');
        assert.ok(captured[0].html.includes(u1), 'Rendered HTML must contain recipient-1 exact URL');
        assert.ok(captured[0].text.includes(u1), 'Rendered text must contain recipient-1 exact URL');
        assert.ok(captured[1].html.includes(u2), 'Rendered HTML without placeholder must get footer appended');
        assert.ok(captured[1].text.includes(u2), 'Rendered text without placeholder must get footer appended');

        // Verify token store on disk has SHA-256 hashes only (never raw token)
        const tokRaw = fs.readFileSync(path.join(stateDir, '.unsubscribe_tokens.json'), 'utf8');
        const tok1 = u1.split('/unsubscribe/')[1];
        assert.ok(!tokRaw.includes(tok1), 'Raw unsubscribe token must NEVER be stored plaintext on disk');
      } finally {
        await sc.stop();
      }
    });

    await run('SCANNER_GET_NO_MUTATION_CONFIRM_POST_RFC8058_IDEMPOTENT_AND_RESTART_SUPPRESSION', async () => {
      const stateDir = path.join(tmpDir, 's2');
      const captured = [];
      let sc = new EmailTestSidecar({
        port: 19012,
        stateDir,
        trustedTestMode: true,
        apiKeyOverride: 're_test_key_123456789',
        transportImpl: async payload => {
          captured.push(payload);
          return { status: 'SUCCESS', providerMessageId: 'sim_' + captured.length };
        }
      });
      await sc.start();
      let unsubPath = '';
      try {
        const authH = { 'Origin': extOrigin, 'Authorization': `Bearer ${sc.token}`, 'Content-Type': 'application/json' };
        await req(19012, 'POST', '/email/test-send', authH, JSON.stringify({
          to: 'delivered@resend.dev',
          subject: 'Scan Test',
          html: '<p>Hi</p>',
          text: 'Hi',
          idempotencyKey: 'idem_scan_0001_aaaaaaaaaaaaaa'
        }));
        const u = captured[0].headers['List-Unsubscribe'].slice(1, -1);
        unsubPath = new URL(u).pathname;

        // 1. Scanner GET must NOT suppress
        const getRes = await req(19012, 'GET', unsubPath, { 'Accept': 'text/html' });
        assert.equal(getRes.statusCode, 200);
        assert.ok(getRes.text.includes('confirmCsrf'));
        assert.equal(sc.pipeline.outbox.isSuppressed('delivered@resend.dev'), false);

        // 2. Bad confirmCsrf must fail 403
        const badCsrf = await req(19012, 'POST', unsubPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click&confirmCsrf=tampered');
        assert.equal(badCsrf.statusCode, 403);
        assert.equal(sc.pipeline.outbox.isSuppressed('delivered@resend.dev'), false);

        // 3. Valid confirmCsrf from GET form succeeds & suppresses
        const csrfMatch = getRes.text.match(/name="confirmCsrf" value="([^"]+)"/);
        assert.ok(csrfMatch);
        const goodForm = await req(19012, 'POST', unsubPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, `List-Unsubscribe=One-Click&confirmCsrf=${encodeURIComponent(csrfMatch[1])}`);
        assert.equal(goodForm.statusCode, 200);
        assert.equal(goodForm.json.status, 'UNSUBSCRIBED');
        assert.equal(sc.pipeline.outbox.isSuppressed('delivered@resend.dev'), true);

        // 4. Repeat RFC 8058 One-Click POST is idempotent
        const replay = await req(19012, 'POST', unsubPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
        assert.equal(replay.statusCode, 200);
        assert.equal(replay.json.idempotentReplay, true);

        // 5. Bad token rejected
        const badTok = await req(19012, 'POST', '/unsubscribe/not-a-valid-token', { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
        assert.equal(badTok.statusCode, 400);
      } finally {
        await sc.stop();
      }

      // 6. Restart Sidecar on same stateDir -> suppressed recipient MUST remain blocked on send & re-import!
      sc = new EmailTestSidecar({
        port: 19013,
        stateDir,
        trustedTestMode: true,
        apiKeyOverride: 're_test_key_123456789',
        transportImpl: async () => { throw new Error('MUST_NOT_SEND_TO_SUPPRESSED'); }
      });
      await sc.start();
      try {
        const authH = { 'Origin': extOrigin, 'Authorization': `Bearer ${sc.token}`, 'Content-Type': 'application/json' };
        const blockedSend = await req(19013, 'POST', '/email/test-send', authH, JSON.stringify({
          to: 'delivered@resend.dev',
          subject: 'After Unsub',
          html: '<p>Blocked</p>',
          text: 'Blocked',
          idempotencyKey: 'idem_after_unsub_0001_aaaaaaaa'
        }));
        assert.equal(blockedSend.json.status, 'BLOCKED');
        assert.equal(blockedSend.json.reason, 'RECIPIENT_SUPPRESSED');

        const reimport = sc.pipeline.importAndPersistRecipients({
          csvText: 'email,name\ndelivered@resend.dev,TestUser\nfresh@example.org,FreshUser',
          messageKind: 'marketing',
          consentAttested: true
        });
        assert.equal(reimport.summary.counts.PENDING, 1);
        assert.equal(reimport.summary.counts.SKIPPED_SUPPRESSED, 1);
      } finally {
        await sc.stop();
      }
    });

    await run('PUBLIC_HTTPS_CONFIG_VALIDATION_AND_FAIL_CLOSED_GATE', async () => {
      const p = new EmailProductionPipeline({ stateDir: path.join(tmpDir, 's3'), trustedTestMode: false });
      assert.equal(p.getUnsubscribePublicConfig().status, 'CONFIG_REQUIRED');

      const httpBad = p.saveUnsubscribePublicConfig({ publicBaseUrl: 'http://vivpr.pro' });
      assert.equal(httpBad.ok, false);
      assert.equal(httpBad.reason, 'HTTPS_REQUIRED');

      const localBad = p.saveUnsubscribePublicConfig({ publicBaseUrl: 'https://127.0.0.1:18990' });
      assert.equal(localBad.ok, false);
      assert.equal(localBad.reason, 'PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED');

      const good = p.saveUnsubscribePublicConfig({ publicBaseUrl: 'https://vivpr.pro/' });
      assert.equal(good.ok, true);
      assert.equal(good.status, 'READY');
      assert.equal(good.publicBaseUrl, 'https://vivpr.pro');

      const prodBlocked = await p.runQueue({ mode: 'LIVE_PRODUCTION', baseUrl: 'http://127.0.0.1:18990' });
      assert.equal(prodBlocked.ok, false);
      assert.equal(prodBlocked.reason, 'PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED');

      // Long-lived token check: remains valid beyond 90 days (e.g. 365 days later)
      const { verifyUnsubscribeToken, injectUnsubscribeFooter } = require('../companion/email-unsubscribe-server');
      const longToken = p.issueRecipientUnsubscribeHeaders('longlived@example.org', 'camp_long', 'https://vivpr.pro').token;
      const after1Year = verifyUnsubscribeToken(longToken, { keyRing: p.keyRing, now: Date.now() + 365 * 86400000 });
      assert.equal(after1Year.valid, true);
      assert.equal(after1Year.email, 'longlived@example.org');

      // Preview placeholder URL must NEVER pass injectUnsubscribeFooter
      assert.throws(() => injectUnsubscribeFooter({ html: '<p>x</p>', text: 'x', unsubscribeUrl: 'https://vivpr.pro/unsubscribe/preview-sample-only' }), /UNSUBSCRIBE_URL_REQUIRED/);
    });

    console.log(`\nALL UNSUBSCRIBE AUTO-INSERT TESTS PASSED (${pass}/${pass})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
