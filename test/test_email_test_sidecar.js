'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { EmailTestSidecar, SIDECAR_BUILD_ID } = require('../companion/email-test-sidecar');

function request(port, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(data), raw: data }); }
        catch (_) { resolve({ status: res.statusCode, headers: res.headers, json: null, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_sidecar_test_'));
  let transportCalls = 0;
  let nextTransportResult = null;
  let pass = 0;

  async function runTest(name, fn) {
    await fn();
    pass++;
    console.log('PASS', name);
  }

  const sidecar = new EmailTestSidecar({
    port: 19991,
    tokenFile: path.join(tmpDir, '.email_sidecar_token'),
    pidFile: path.join(tmpDir, '.email_sidecar.pid'),
    apiKeyOverride: '',
    rateLimitMs: 1200,
    transportImpl: async (payload) => {
      transportCalls++;
      if (typeof nextTransportResult === 'function') return nextTransportResult(payload);
      return nextTransportResult;
    }
  });

  await sidecar.start();
  const port = sidecar.port;
  const token = sidecar.token;
  const extOrigin = 'chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj';

  try {
    await runTest('SIDECAR_HEALTH_AND_CAPABILITIES', async () => {
      const r = await request(port, 'GET', '/health');
      assert.equal(r.status, 200);
      assert.equal(r.json.mode, 'TEST_ONLY_SIDECAR');
      assert.equal(r.json.companionBuildId, SIDECAR_BUILD_ID);
      assert.ok(r.json.apiCapabilities.includes('email-test-send'));
      assert.ok(r.json.apiCapabilities.includes('email-test-sidecar-v1'));
      assert.equal(r.json.productionSendLocked, true);
    });

    await runTest('SIDECAR_FORBIDDEN_ORIGIN_403_AND_EXACT_EXT_ORIGIN', async () => {
      const evil = await request(port, 'GET', '/health', { Origin: 'https://evil.com' });
      assert.equal(evil.status, 403);
      assert.equal(evil.json.reason, 'FORBIDDEN_ORIGIN');

      const good = await request(port, 'GET', '/health', { Origin: extOrigin });
      assert.equal(good.status, 200);
      assert.equal(good.headers['access-control-allow-origin'], extOrigin);
    });

    await runTest('SIDECAR_401_WITHOUT_OR_WRONG_BEARER_TOKEN', async () => {
      const noTok = await request(port, 'GET', '/email/test-send/status');
      assert.equal(noTok.status, 401);
      assert.equal(noTok.json.error, 'UNAUTHORIZED');

      const badTok = await request(port, 'POST', '/email/test-send', {
        Authorization: 'Bearer wrong_token_value',
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', idempotencyKey: 'sidecar_test_key_0001' });
      assert.equal(badTok.status, 401);
    });

    await runTest('SIDECAR_NO_KEY_FAIL_CLOSED_ZERO_OUTBOUND_POST', async () => {
      const st = await request(port, 'GET', '/email/test-send/status', { Authorization: `Bearer ${token}` });
      assert.equal(st.status, 200);
      assert.equal(st.json.resendApiKeyConfigured, false);

      const post = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        Origin: extOrigin,
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0002' });
      assert.equal(post.status, 200);
      assert.equal(post.json.status, 'BLOCKED');
      assert.equal(post.json.reason, 'RESEND_API_KEY_NOT_CONFIGURED');
      assert.equal(transportCalls, 0);
    });

    await runTest('SIDECAR_REJECTS_ARBITRARY_AND_MULTIPLE_RECIPIENTS_400', async () => {
      const bad = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }, { to: 'customer@example.com', subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0003' });
      assert.equal(bad.status, 400);
      assert.equal(bad.json.reason, 'TEST_RECIPIENT_NOT_ALLOWED');

      const multi = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }, { to: ['delivered@resend.dev', 'bounced@resend.dev'], subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0004' });
      assert.equal(multi.status, 400);
      assert.equal(multi.json.reason, 'MULTIPLE_RECIPIENTS_DENIED');
    });

    await runTest('SIDECAR_IDEMPOTENCY_REPLAY_AND_RATE_LIMIT', async () => {
      sidecar.apiKeyOverride = 're_test_mock_key_12345678';
      nextTransportResult = {
        status: 'SUCCESS',
        provider: 'resend',
        mode: 'TEST_SIMULATOR',
        providerMessageId: 'msg_mock_12345',
        to: 'delivered@resend.dev',
        from: 'onboarding@resend.dev',
        timestamp: new Date().toISOString()
      };

      const first = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        Origin: extOrigin,
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0005' });
      assert.equal(first.status, 200);
      assert.equal(first.json.providerMessageId, 'msg_mock_12345');
      assert.equal(transportCalls, 1);

      const replay = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        Origin: extOrigin,
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0005' });
      assert.equal(replay.status, 200);
      assert.equal(replay.json.idempotentReplay, true);
      assert.equal(transportCalls, 1);

      const rateLimited = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        Origin: extOrigin,
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0006' });
      assert.equal(rateLimited.status, 429);
      assert.equal(rateLimited.json.reason, 'RATE_LIMIT_EXCEEDED');
    });

    await runTest('SIDECAR_PROVIDER_ERROR_AND_404', async () => {
      await new Promise(r => setTimeout(r, 1300));
      nextTransportResult = { status: 'PROVIDER_ERROR', httpStatus: 500, error: 'UPSTREAM_500', message: 'Upstream failure' };
      const errResp = await request(port, 'POST', '/email/test-send', {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'T', text: 'Body', idempotencyKey: 'sidecar_test_key_0007' });
      assert.equal(errResp.status, 502);
      assert.equal(errResp.json.status, 'PROVIDER_ERROR');

      const r404 = await request(port, 'GET', '/nonexistent', { Authorization: `Bearer ${token}` });
      assert.equal(r404.status, 404);
      assert.equal(r404.json.error, 'ENDPOINT_NOT_FOUND');
    });

    console.log(`\nALL SIDECAR TESTS PASSED (${pass}/${pass})`);
  } finally {
    await sidecar.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
