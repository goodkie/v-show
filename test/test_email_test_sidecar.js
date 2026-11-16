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
    ledgerFile: path.join(tmpDir, '.email_simulator_ledger.jsonl'),
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

    await runTest('SIDECAR_PROTECTED_LOCAL_KEY_FILE_FALLBACK', async () => {
      const keyFile = path.join(tmpDir, '.resend_api_key');
      fs.writeFileSync(keyFile, 're_local_protected_12345678\n', 'utf8');
      const prevEnv = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        const s2 = new EmailTestSidecar({
          port: 19992,
          tokenFile: path.join(tmpDir, '.tok2'),
          pidFile: path.join(tmpDir, '.pid2'),
          ledgerFile: path.join(tmpDir, '.ledger2.jsonl'),
          localKeyFile: keyFile
        });
        assert.equal(s2.resolveResendApiKey(), 're_local_protected_12345678');
        await s2.start();
        const st = await request(19992, 'GET', '/email/test-send/status', { Authorization: `Bearer ${s2.token}` });
        assert.equal(st.status, 200);
        assert.equal(st.json.resendApiKeyConfigured, true);
        assert.equal(st.json.pid, process.pid);
        assert.equal(st.json.controlPort, 19992);
        assert.equal(st.raw.includes('re_local_protected_12345678'), false);
        await s2.stop();
      } finally {
        if (prevEnv !== undefined) process.env.RESEND_API_KEY = prevEnv;
      }
    });

    await runTest('SIDECAR_LEDGER_PERSISTS_ACROSS_RESTART_AND_RECONCILES_TIMEOUT', async () => {
      const sharedLedger = path.join(tmpDir, '.shared_ledger.jsonl');
      let calls = 0;
      const sA = new EmailTestSidecar({
        port: 19993,
        token: 'ledger_test_token_0123456789',
        tokenFile: path.join(tmpDir, '.tok_ledger'),
        pidFile: path.join(tmpDir, '.pid_ledger'),
        ledgerFile: sharedLedger,
        apiKeyOverride: 're_test_ledger_key_123456',
        rateLimitMs: 0,
        transportImpl: async () => {
          calls++;
          if (calls === 1) {
            return {
              status: 'SUCCESS',
              provider: 'resend',
              mode: 'TEST_SIMULATOR',
              providerMessageId: 'msg_ledger_persist_001',
              to: 'delivered@resend.dev',
              from: 'onboarding@resend.dev',
              timestamp: new Date().toISOString()
            };
          }
          throw new Error('Request timeout ETIMEDOUT');
        }
      });
      await sA.start();
      const r1 = await request(19993, 'POST', '/email/test-send', {
        Authorization: 'Bearer ledger_test_token_0123456789',
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'L1', text: 'B1', idempotencyKey: 'ledger_persist_key_0001' });
      assert.equal(r1.status, 200);
      assert.equal(r1.json.deliveryStatus, 'PROVIDER_ACCEPTED_SIMULATOR_ONLY');

      const rTimeout = await request(19993, 'POST', '/email/test-send', {
        Authorization: 'Bearer ledger_test_token_0123456789',
        'Content-Type': 'application/json'
      }, { to: 'delivered@resend.dev', subject: 'L2', text: 'B2', idempotencyKey: 'ledger_timeout_key_0002' });
      assert.equal(rTimeout.status, 504);
      assert.equal(rTimeout.json.error, 'TIMEOUT');
      await sA.stop();

      // Restart new sidecar pointing to same ledgerFile
      const sB = new EmailTestSidecar({
        port: 19994,
        token: 'ledger_test_token_0123456789',
        tokenFile: path.join(tmpDir, '.tok_ledger'),
        pidFile: path.join(tmpDir, '.pid_ledger'),
        ledgerFile: sharedLedger,
        apiKeyOverride: 're_test_ledger_key_123456',
        rateLimitMs: 0,
        transportImpl: async () => { calls++; throw new Error('Should not re-POST'); }
      });
      await sB.start();
      try {
        const replay = await request(19994, 'POST', '/email/test-send', {
          Authorization: 'Bearer ledger_test_token_0123456789',
          'Content-Type': 'application/json'
        }, { to: 'delivered@resend.dev', subject: 'L1', text: 'B1', idempotencyKey: 'ledger_persist_key_0001' });
        assert.equal(replay.status, 200);
        assert.equal(replay.json.idempotentReplay, true);
        assert.equal(replay.json.providerMessageId, 'msg_ledger_persist_001');
        assert.equal(calls, 2, 'Replay across restart must NOT invoke transport');

        const ambig = await request(19994, 'POST', '/email/test-send', {
          Authorization: 'Bearer ledger_test_token_0123456789',
          'Content-Type': 'application/json'
        }, { to: 'delivered@resend.dev', subject: 'L2', text: 'B2', idempotencyKey: 'ledger_timeout_key_0002' });
        assert.equal(ambig.status, 409);
        assert.equal(ambig.json.reason, 'PRIOR_REQUEST_AMBIGUOUS');
        assert.equal(calls, 2, 'Ambiguous timeout must NOT silently re-POST');

        const ledgerGet = await request(19994, 'GET', '/email/test-send/ledger', {
          Authorization: 'Bearer ledger_test_token_0123456789'
        });
        assert.equal(ledgerGet.status, 200);
        assert.equal(ledgerGet.json.entries.length, 2);
        assert.equal(ledgerGet.raw.includes('re_test_ledger_key_123456'), false);
      } finally {
        await sB.stop();
      }
    });

    await runTest('SET_KEY_NO_ECHO_AND_FAIL_CLOSED_WINDOWS_DACL', async () => {
      const { writeKeySecurely, verifyWindowsDacl } = require('../companion/email-test-sidecar-set-key');
      const secPath = path.join(tmpDir, '.acl_test_key');
      writeKeySecurely(secPath, 're_acl_verify_key_123456');
      assert.ok(fs.existsSync(secPath));
      if (process.platform === 'win32') {
        assert.equal(verifyWindowsDacl(secPath, process.env.USERNAME), true);
      }

      // Fail-closed when icacls fails or returns inherited ACE
      const failPath = path.join(tmpDir, '.acl_fail_key');
      assert.throws(() => {
        writeKeySecurely(failPath, 're_acl_verify_key_123456', {
          platform: 'win32',
          username: 'tester',
          execSyncFn: () => { throw new Error('icacls exit 5'); }
        });
      }, /icacls exit 5/);
      assert.equal(fs.existsSync(failPath), false, 'Failed ACL must NOT leave unsafe key file');

      assert.throws(() => {
        writeKeySecurely(failPath, 're_acl_verify_key_123456', {
          platform: 'win32',
          username: 'tester',
          execSyncFn: (cmd, args) => {
            if (args.includes('/inheritance:r')) return '';
            return `${failPath} BUILTIN\\Users:(I)(RX)\nSuccessfully processed 1 files`;
          }
        });
      }, /DACL_VERIFICATION_FAILED/);
      assert.equal(fs.existsSync(failPath), false, 'Inherited ACE must fail closed and delete temp');
    });

    await runTest('LEDGER_DISK_FULL_FAILS_CLOSED_ZERO_OUTBOUND_POST', async () => {
      let postCalls = 0;
      const diskFullSidecar = new EmailTestSidecar({
        port: 19996,
        token: 'disk_full_test_token_123456',
        tokenFile: path.join(tmpDir, '.tok_df'),
        pidFile: path.join(tmpDir, '.pid_df'),
        ledgerFile: path.join(tmpDir, '.df_ledger.jsonl'),
        apiKeyOverride: 're_test_df_key_123456',
        rateLimitMs: 0,
        transportImpl: async () => { postCalls++; return { status: 'SUCCESS' }; }
      });
      diskFullSidecar.ledger.fsImpl = {
        ...fs,
        openSync: () => 999,
        writeSync: () => { const e = new Error('ENOSPC: no space left on device'); e.code = 'ENOSPC'; throw e; },
        fsyncSync: () => {},
        closeSync: () => {}
      };
      await diskFullSidecar.start();
      try {
        const resp = await request(19996, 'POST', '/email/test-send', {
          Authorization: 'Bearer disk_full_test_token_123456',
          'Content-Type': 'application/json'
        }, { to: 'delivered@resend.dev', subject: 'DF', text: 'DF', idempotencyKey: 'disk_full_key_0001' });
        assert.equal(resp.status, 500);
        assert.equal(resp.json.reason, 'LEDGER_PERSISTENCE_FAILED');
        assert.equal(postCalls, 0, 'Disk full before REQUESTED must prevent external POST');
      } finally {
        await diskFullSidecar.stop();
      }
    });

    await runTest('LEDGER_CORRUPT_LINE_RECOVERY_AND_SECRET_PII_SCRUBBING', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
      const corruptPath = path.join(tmpDir, '.corrupt_ledger.jsonl');
      const l1 = new EmailSimulatorLedger({ ledgerFile: corruptPath });
      l1.append({
        idempotencyKey: 'scrub_test_key_0001',
        recipient: 'delivered@resend.dev',
        status: 'PROVIDER_ERROR',
        message: 'Failed with re_secret_key_999888 Bearer tok_secret_123456 for victim@customer.com'
      });
      // Simulate crash partial trailing line
      fs.appendFileSync(corruptPath, '{"idempotencyKey":"partial_trunc\n', 'utf8');

      const l2 = new EmailSimulatorLedger({ ledgerFile: corruptPath });
      assert.equal(l2.corruptLineCount, 1);
      const rec = l2.getByIdempotencyKey('scrub_test_key_0001');
      assert.ok(rec);
      assert.equal(rec.message.includes('re_secret_key_999888'), false);
      assert.equal(rec.message.includes('tok_secret_123456'), false);
      assert.equal(rec.message.includes('victim@customer.com'), false);
      assert.ok(rec.message.includes('[REDACTED_API_KEY]'));
      assert.ok(rec.message.includes('[REDACTED_TOKEN]'));
      assert.ok(rec.message.includes('[REDACTED_EMAIL]'));
    });

    console.log(`\nALL SIDECAR TESTS PASSED (${pass}/${pass})`);
  } finally {
    await sidecar.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
