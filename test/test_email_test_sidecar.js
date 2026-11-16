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
      trustedTestMode: true,
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
      trustedTestMode: true,
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
      trustedTestMode: true,
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
      trustedTestMode: true,
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
      trustedTestMode: true,
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
        openSync: (p, flags, m) => String(flags).includes('x') ? fs.openSync(p, flags, m) : 999,
        writeSync: (fd, buf) => {
          if (fd !== 999) return fs.writeSync(fd, buf);
          const e = new Error('ENOSPC: no space left on device'); e.code = 'ENOSPC'; throw e;
        },
        fsyncSync: () => {},
        closeSync: (fd) => { if (fd !== 999) fs.closeSync(fd); }
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

    await runTest('CORRUPT_LEDGER_FAILS_CLOSED_ON_RESTART_ZERO_POST', async () => {
      const badLedger = path.join(tmpDir, '.bad_restart_ledger.jsonl');
      fs.writeFileSync(badLedger, '{"idempotencyKey":"partial_corrupt\n', 'utf8');
      let postCalls = 0;
      const sc = new EmailTestSidecar({
      trustedTestMode: true,
        port: 19997,
        token: 'corrupt_ledger_tok_123456',
        tokenFile: path.join(tmpDir, '.tok_corrupt'),
        pidFile: path.join(tmpDir, '.pid_corrupt'),
        ledgerFile: badLedger,
        apiKeyOverride: 're_test_corrupt_key_123456',
        rateLimitMs: 0,
        transportImpl: async () => { postCalls++; return { status: 'SUCCESS' }; }
      });
      await sc.start();
      try {
        const resp = await request(19997, 'POST', '/email/test-send', {
          Authorization: 'Bearer corrupt_ledger_tok_123456',
          'Content-Type': 'application/json'
        }, { to: 'delivered@resend.dev', subject: 'C', text: 'C', idempotencyKey: 'corrupt_fail_closed_key_01' });
        assert.equal(resp.status, 409);
        assert.equal(resp.json.reason, 'LEDGER_CORRUPT_RECONCILIATION_REQUIRED');
        assert.equal(postCalls, 0, 'Corrupt ledger MUST fail closed with zero provider POST');
      } finally {
        await sc.stop();
      }
    });

    await runTest('CONCURRENT_SIDECARS_EXCLUSIVE_LOCK_AND_STALE_RECOVERY', async () => {
      const sharedLedger = path.join(tmpDir, '.concurrent_ledger.jsonl');
      let transportCalls = 0;
      const makeSc = (portNum) => new EmailTestSidecar({
      trustedTestMode: true,
        port: portNum,
        token: 'concurrent_tok_12345678',
        tokenFile: path.join(tmpDir, '.tok_conc'),
        pidFile: path.join(tmpDir, `.pid_conc_${portNum}`),
        ledgerFile: sharedLedger,
        apiKeyOverride: 're_test_conc_key_123456',
        rateLimitMs: 0,
        transportImpl: async () => {
          transportCalls++;
          await new Promise(r => setTimeout(r, 80));
          return {
            status: 'SUCCESS', provider: 'resend', mode: 'TEST_SIMULATOR',
            providerMessageId: 'msg_conc_001', to: 'delivered@resend.dev',
            from: 'onboarding@resend.dev', timestamp: new Date().toISOString()
          };
        }
      });

      // Stale/dead-PID lockfile must FAIL CLOSED (no auto-steal) with 0 outbound POST
      fs.writeFileSync(sharedLedger + '.lock', JSON.stringify({ pid: 999999, lockId: 'dead_crash_nonce', createdAt: Date.now() - 60000 }));
      const s1 = makeSc(19998);
      const s2 = makeSc(19999);
      s1.ledger.lockTimeoutMs = 150;
      s2.ledger.lockTimeoutMs = 150;
      await s1.start();
      await s2.start();
      try {
        const blockedStale = await request(19998, 'POST', '/email/test-send', { Authorization: 'Bearer concurrent_tok_12345678', 'Content-Type': 'application/json' },
          { to: 'delivered@resend.dev', subject: 'S', text: 'B', idempotencyKey: 'concurrent_race_key_0001' });
        assert.equal(blockedStale.status, 500);
        assert.equal(blockedStale.json.reason, 'LEDGER_STALE_LOCK_RECONCILIATION_REQUIRED');
        assert.equal(transportCalls, 0, 'Stale dead-PID lock MUST fail closed without provider POST');

        // After operator reconciliation removes stale lock, concurrent sidecars still permit only ONE provider POST
        fs.unlinkSync(sharedLedger + '.lock');
        const [r1, r2] = await Promise.all([
          request(19998, 'POST', '/email/test-send', { Authorization: 'Bearer concurrent_tok_12345678', 'Content-Type': 'application/json' },
            { to: 'delivered@resend.dev', subject: 'S', text: 'B', idempotencyKey: 'concurrent_race_key_0001' }),
          request(19999, 'POST', '/email/test-send', { Authorization: 'Bearer concurrent_tok_12345678', 'Content-Type': 'application/json' },
            { to: 'delivered@resend.dev', subject: 'S', text: 'B', idempotencyKey: 'concurrent_race_key_0001' })
        ]);
        assert.equal(transportCalls, 1, 'Exclusive lock must guarantee only ONE sidecar invokes provider');
        assert.ok(r1.status === 200 || r2.status === 200);
      } finally {
        await s1.stop();
        await s2.stop();
      }
    });

    await runTest('PREEXISTING_KEY_REPLACEMENT_AND_TOKEN_FILE_ACL_FAIL_CLOSED', async () => {
      const { writeKeySecurely, verifyWindowsDacl } = require('../companion/email-test-sidecar-set-key');
      const repPath = path.join(tmpDir, '.replace_acl_key');
      writeKeySecurely(repPath, 're_first_key_12345678');
      writeKeySecurely(repPath, 're_second_key_87654321');
      assert.equal(fs.readFileSync(repPath, 'utf8').trim(), 're_second_key_87654321');
      if (process.platform === 'win32') {
        assert.equal(verifyWindowsDacl(repPath, process.env.USERNAME), true);
      }

      const tokAclPath = path.join(tmpDir, '.fresh_acl_token');
      const sTok = new EmailTestSidecar({
      trustedTestMode: true,
        port: 20001,
        tokenFile: tokAclPath,
        pidFile: path.join(tmpDir, '.pid_tok'),
        ledgerFile: path.join(tmpDir, '.ledger_tok.jsonl')
      });
      assert.ok(sTok.token.length >= 16);
      if (process.platform === 'win32') {
        assert.equal(verifyWindowsDacl(tokAclPath, process.env.USERNAME), true);
      }

      // Unwritable/invalid token path must fail closed (throw, not silently return ephemeral)
      const badTokPath = path.join(tmpDir, 'nonexistent_dir_file_conflict');
      fs.writeFileSync(badTokPath, 'not_a_dir', 'utf8');
      assert.throws(() => new EmailTestSidecar({
      trustedTestMode: true,
        port: 20002,
        tokenFile: path.join(badTokPath, '.token'),
        pidFile: path.join(tmpDir, '.pid_bad'),
        ledgerFile: path.join(tmpDir, '.ledger_bad.jsonl')
      }));
    });

    await runTest('P0_A_LIVE_PID_LOCK_NEVER_STOLEN_EVEN_PAST_STALE_MS', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
      const lPath = path.join(tmpDir, '.live_pid_lock.jsonl');
      const lck = new EmailSimulatorLedger({ ledgerFile: lPath, lockTimeoutMs: 120, staleLockMs: 20 });
      // Write lock owned by LIVE process.pid aged 60s (> staleLockMs=20ms)
      fs.writeFileSync(lck.lockFile, JSON.stringify({
        pid: process.pid,
        lockId: 'foreign_live_nonce_999',
        createdAt: Date.now() - 60000
      }));
      assert.throws(() => lck.append({
        idempotencyKey: 'live_lock_blocked_0001',
        recipient: 'delivered@resend.dev',
        status: 'REQUESTED'
      }), /LEDGER_LOCK_CONTENTION/);
      // Verify live owner's lockfile was NOT stolen or deleted
      const stillThere = JSON.parse(fs.readFileSync(lck.lockFile, 'utf8'));
      assert.equal(stillThere.lockId, 'foreign_live_nonce_999');
      fs.unlinkSync(lck.lockFile);
    });

    await runTest('P0_B_C_APPEND_FAILS_CLOSED_ON_CORRUPT_UNREADABLE_SHORTWRITE_AND_DACL', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
      const { verifyWindowsDacl } = require('../companion/email-test-sidecar-set-key');

      // 1. Corrupt ledger blocks BOTH append() and reserveRequest()
      const cPath = path.join(tmpDir, '.p0b_corrupt.jsonl');
      fs.writeFileSync(cPath, '{"idempotencyKey":"broken_partial\n', 'utf8');
      const lCorrupt = new EmailSimulatorLedger({ ledgerFile: cPath });
      assert.throws(() => lCorrupt.append({
        idempotencyKey: 'should_block_append_001',
        recipient: 'delivered@resend.dev',
        status: 'ACCEPTED'
      }), /LEDGER_CORRUPT_RECONCILIATION_REQUIRED/);
      assert.equal(lCorrupt.reserveRequest({
        idempotencyKey: 'should_block_resv_001',
        recipient: 'delivered@resend.dev'
      }).action, 'CORRUPT_BLOCKED');

      // 2. Unreadable ledger blocks append()
      const lUnreadable = new EmailSimulatorLedger({
        ledgerFile: path.join(tmpDir, '.p0b_unreadable.jsonl'),
        fsImpl: {
          ...fs,
          existsSync: () => true,
          readFileSync: () => { throw new Error('EACCES: permission denied'); }
        }
      });
      assert.equal(lUnreadable.reconciliationRequired, true);
      assert.throws(() => lUnreadable.append({
        idempotencyKey: 'unreadable_block_001',
        recipient: 'delivered@resend.dev',
        status: 'ACCEPTED'
      }), /LEDGER_CORRUPT_RECONCILIATION_REQUIRED/);

      // 3. Short write throws LEDGER_PERSISTENCE_FAILED and real ledger gets Windows DACL
      const lShort = new EmailSimulatorLedger({
        ledgerFile: path.join(tmpDir, '.p0c_short.jsonl'),
        fsImpl: {
          ...fs,
          openSync: (p, flags, m) => flags.includes('wx') ? fs.openSync(p, flags, m) : 888,
          writeSync: (fd, buf) => typeof buf === 'string' ? fs.writeSync(fd, buf) : 3,
          fsyncSync: () => {},
          closeSync: (fd) => { if (fd !== 888) fs.closeSync(fd); }
        }
      });
      assert.throws(() => lShort.append({
        idempotencyKey: 'short_write_001',
        recipient: 'delivered@resend.dev',
        status: 'ACCEPTED'
      }), /SHORT_WRITE|LEDGER_PERSISTENCE_FAILED/);

      const daclLedger = path.join(tmpDir, '.p0c_dacl.jsonl');
      const lReal = new EmailSimulatorLedger({ ledgerFile: daclLedger });
      lReal.append({ idempotencyKey: 'dacl_ok_key_0001', recipient: 'delivered@resend.dev', status: 'ACCEPTED', providerMessageId: 'msg_dacl_1' });
      if (process.platform === 'win32') {
        assert.equal(verifyWindowsDacl(daclLedger, process.env.USERNAME), true);
      }
    });

    await runTest('LOCK_RECLAIM_RACE_AND_AMBIGUOUS_NON_RETRY_MESSAGE', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
      const raceLedger = new EmailSimulatorLedger({
        ledgerFile: path.join(tmpDir, '.race_reclaim.jsonl'),
        lockTimeoutMs: 100,
        staleLockMs: 50
      });
      // Inject a live lockfile owned by process.pid while testing reclaim path safety:
      // even if a stale-PID inspection raced, reclaimMutex re-reads and sees live PID, so it never unlinks it.
      fs.writeFileSync(raceLedger.lockFile, JSON.stringify({ pid: process.pid, lockId: 'race_winner_nonce', createdAt: Date.now() }));
      assert.throws(() => raceLedger.append({
        idempotencyKey: 'race_no_steal_001',
        recipient: 'delivered@resend.dev',
        status: 'REQUESTED'
      }), /LEDGER_LOCK_CONTENTION/);
      const preserved = JSON.parse(fs.readFileSync(raceLedger.lockFile, 'utf8'));
      assert.equal(preserved.lockId, 'race_winner_nonce');
      fs.unlinkSync(raceLedger.lockFile);

      // Verify PRIOR_REQUEST_AMBIGUOUS does NOT tell operator to retry with a new key
      const ambigLedger = path.join(tmpDir, '.ambig_msg.jsonl');
      const sAmb = new EmailTestSidecar({
      trustedTestMode: true,
        port: 20003,
        token: 'ambig_msg_tok_123456',
        tokenFile: path.join(tmpDir, '.tok_ambig'),
        pidFile: path.join(tmpDir, '.pid_ambig'),
        ledgerFile: ambigLedger,
        apiKeyOverride: 're_test_ambig_123456',
        rateLimitMs: 0,
        transportImpl: async () => { throw new Error('ETIMEDOUT'); }
      });
      await sAmb.start();
      try {
        await request(20003, 'POST', '/email/test-send', { Authorization: 'Bearer ambig_msg_tok_123456', 'Content-Type': 'application/json' },
          { to: 'delivered@resend.dev', subject: 'A', text: 'B', idempotencyKey: 'ambig_non_retry_key_01' });
        const conflict = await request(20003, 'POST', '/email/test-send', { Authorization: 'Bearer ambig_msg_tok_123456', 'Content-Type': 'application/json' },
          { to: 'delivered@resend.dev', subject: 'A', text: 'B', idempotencyKey: 'ambig_non_retry_key_01' });
        assert.equal(conflict.status, 409);
        assert.equal(conflict.json.reason, 'PRIOR_REQUEST_AMBIGUOUS');
        assert.ok(conflict.json.message.includes('Do not retry under a new key'));
        assert.equal(conflict.json.message.includes('새 idempotencyKey로 재시도'), false);

        // Even with a CHANGED idempotencyKey, unresolved AMBIGUOUS_TIMEOUT must fail closed with 0 POST
        const changedKeyResp = await request(20003, 'POST', '/email/test-send', { Authorization: 'Bearer ambig_msg_tok_123456', 'Content-Type': 'application/json' },
          { to: 'delivered@resend.dev', subject: 'A', text: 'B', idempotencyKey: 'ambig_changed_new_key_02' });
        assert.equal(changedKeyResp.status, 409);
        assert.equal(changedKeyResp.json.reason, 'PRIOR_REQUEST_AMBIGUOUS');
      } finally {
        await sAmb.stop();
      }
    });

    await runTest('REAL_WINDOWS_NTFS_ACL_FAILURE_BLOCKS_SEND_BEFORE_POST', async () => {
      if (process.platform !== 'win32') return;
      const { execFileSync } = require('node:child_process');
      const weakLedger = path.join(tmpDir, '.weak_acl_ledger.jsonl');
      fs.writeFileSync(weakLedger, '', 'utf8');
      execFileSync('icacls', [weakLedger, '/grant', 'Everyone:R'], { stdio: 'pipe' });
      let postCalls = 0;
      const sWeak = new EmailTestSidecar({
      trustedTestMode: true,
        port: 20004,
        token: 'weak_acl_tok_123456',
        tokenFile: path.join(tmpDir, '.tok_weak'),
        pidFile: path.join(tmpDir, '.pid_weak'),
        ledgerFile: weakLedger,
        apiKeyOverride: 're_test_weak_123456',
        rateLimitMs: 0,
        transportImpl: async () => { postCalls++; return { status: 'SUCCESS' }; }
      });
      await sWeak.start();
      try {
        const resp = await request(20004, 'POST', '/email/test-send', { Authorization: 'Bearer weak_acl_tok_123456', 'Content-Type': 'application/json' },
          { to: 'delivered@resend.dev', subject: 'W', text: 'W', idempotencyKey: 'weak_acl_test_key_0001' });
        assert.equal(resp.status, 500);
        assert.equal(resp.json.reason, 'LEDGER_ACL_VERIFICATION_FAILED');
        assert.equal(postCalls, 0, 'Weak pre-existing Windows DACL MUST fail closed with 0 provider POSTs');
      } finally {
        await sWeak.stop();
      }
    });

    await runTest('PASTE_CONTROL_CHAR_SANITIZATION_NTFS_STATE_DIR_AND_KEY_STATUS', async () => {
      const { EventEmitter } = require('node:events');
      const { readSecretNoEcho, verifyWindowsDacl, writeKeySecurely } = require('../companion/email-test-sidecar-set-key');
      const { getSidecarPaths } = require('../companion/sidecar-paths');

      // 1. Default sidecar paths resolve under LOCALAPPDATA\XPIDER\Sidecar (NTFS) with .email_sidecar_token (underscore)
      const paths = getSidecarPaths();
      assert.ok(paths.tokenFile.endsWith('.email_sidecar_token'));
      if (process.env.LOCALAPPDATA) {
        assert.ok(paths.stateDir.startsWith(path.resolve(process.env.LOCALAPPDATA)));
      }

      // 2. Ctrl+V (ASCII 22 / \x16) control chars stripped cleanly in non-TTY / raw input
      const fakeStream = new EventEmitter();
      fakeStream.isTTY = false;
      fakeStream.setEncoding = () => {};
      fakeStream.pause = () => {};
      fakeStream.resume = () => {};
      const p = readSecretNoEcho('', fakeStream);
      fakeStream.emit('data', '\x16re_ctrl_v_test_123456\r\n');
      assert.equal(await p, 're_ctrl_v_test_123456');

      // 3. Empty/invalid key rejected fail-closed
      assert.throws(() => writeKeySecurely(path.join(tmpDir, '.empty'), '   '), /EMPTY_KEY/);
      assert.throws(() => writeKeySecurely(path.join(tmpDir, '.bad'), 'bad_prefix_123'), /INVALID_KEY_FORMAT/);

      // 4. Non-NTFS / exFAT empty icacls output rejected fail-closed
      assert.throws(() => verifyWindowsDacl('E:\\exfat\\.resend_api_key', 'oPus', () => 'Successfully processed 0 files; Failed processing 1 files\n'), /DACL_VERIFICATION_FAILED/);

      // 5. Status & send distinguish KEY_MISSING vs MALFORMED_KEY
      const sMalformed = new EmailTestSidecar({
      trustedTestMode: true,
        port: 20006,
        stateDir: path.join(tmpDir, 'state_malformed'),
        apiKeyOverride: 'invalid_not_re_prefix',
        rateLimitMs: 0
      });
      await sMalformed.start();
      try {
        const st = await request(20006, 'GET', '/email/test-send/status', { Authorization: `Bearer ${sMalformed.token}` });
        assert.equal(st.status, 200);
        assert.equal(st.json.resendApiKeyConfigured, false);
        assert.equal(st.json.keyStatus, 'MALFORMED_KEY');
        const pBlocked = await request(20006, 'POST', '/email/test-send', {
          Authorization: `Bearer ${sMalformed.token}`,
          'Content-Type': 'application/json'
        }, { to: 'delivered@resend.dev', subject: 'M', text: 'M', idempotencyKey: 'malformed_key_test_0001' });
        assert.equal(pBlocked.json.reason, 'MALFORMED_RESEND_API_KEY');
        assert.equal(pBlocked.json.keyStatus, 'MALFORMED_KEY');
      } finally {
        await sMalformed.stop();
      }
    });

    await runTest('KEY_ACL_INVALID_AND_TOKEN_ACL_INVALID_FAIL_CLOSED', async () => {
      if (process.platform !== 'win32') return;
      const { execFileSync } = require('node:child_process');

      // 1. Pre-existing key file with broad Everyone:R ACE must fail closed with KEY_ACL_INVALID and 0 POSTs
      const weakKeyFile = path.join(tmpDir, '.weak_resend_key');
      fs.writeFileSync(weakKeyFile, 're_weak_acl_valid_format_123\n', 'utf8');
      execFileSync('icacls', [weakKeyFile, '/grant', 'Everyone:R'], { stdio: 'pipe' });
      let postCalls = 0;
      const sWeakKey = new EmailTestSidecar({
      trustedTestMode: true,
        port: 20007,
        stateDir: path.join(tmpDir, 'state_weak_key'),
        localKeyFile: weakKeyFile,
        rateLimitMs: 0,
        transportImpl: async () => { postCalls++; return { status: 'SUCCESS' }; }
      });
      await sWeakKey.start();
      try {
        const resp = await request(20007, 'POST', '/email/test-send', {
          Authorization: `Bearer ${sWeakKey.token}`,
          'Content-Type': 'application/json'
        }, { to: 'delivered@resend.dev', subject: 'K', text: 'K', idempotencyKey: 'weak_key_acl_test_0001' });
        assert.equal(resp.status, 500);
        assert.equal(resp.json.reason, 'KEY_ACL_INVALID');
        assert.equal(postCalls, 0);
      } finally {
        await sWeakKey.stop();
      }

      // 2. Existing token file with weak Everyone:R ACE must refuse sidecar startup (no silent repair)
      const weakTokFile = path.join(tmpDir, '.weak_token_file');
      fs.writeFileSync(weakTokFile, 'abcdef0123456789abcdef0123456789\n', 'utf8');
      execFileSync('icacls', [weakTokFile, '/grant', 'Everyone:R'], { stdio: 'pipe' });
      assert.throws(() => new EmailTestSidecar({
      trustedTestMode: true,
        port: 20008,
        tokenFile: weakTokFile,
        pidFile: path.join(tmpDir, '.pid_wt'),
        ledgerFile: path.join(tmpDir, '.ledger_wt.jsonl')
      }), /TOKEN_ACL_INVALID/);
    });

    await runTest('HOSTILE_LOCK_REPLACEMENT_TRIGGERS_RECONCILIATION_AND_CLI_CHECKS', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
      const { writeProtectedSecretFile } = require('../companion/email-test-sidecar-set-key');
      const { spawn } = require('node:child_process');

      // 1. Hostile lockfile replacement inside critical section MUST throw fail-closed, mark reconciliationRequired=true, and preserve foreign lock
      const hPath = path.join(tmpDir, '.hostile_lock.jsonl');
      const hLedger = new EmailSimulatorLedger({ ledgerFile: hPath });
      assert.throws(() => {
        hLedger._withExclusiveLock(() => {
          fs.writeFileSync(hLedger.lockFile, JSON.stringify({ pid: 777777, lockId: 'foreign_replaced_nonce', createdAt: Date.now() }));
        });
      }, /LEDGER_LOCK_OWNERSHIP_LOST/);
      assert.equal(hLedger.reconciliationRequired, true);
      assert.equal(hLedger.corruptReason, 'LOCK_OWNERSHIP_LOST_HOSTILE_REPLACEMENT');
      // Subsequent load() must NOT clear lockReconciliationRequired
      hLedger.load();
      assert.equal(hLedger.reconciliationRequired, true);
      const foreign = JSON.parse(fs.readFileSync(hLedger.lockFile, 'utf8'));
      assert.equal(foreign.lockId, 'foreign_replaced_nonce');
      fs.unlinkSync(hLedger.lockFile);

      // 2. CLI rejects AUTH_FAILED (exit 4) when token mismatch occurs under valid NTFS LOCALAPPDATA
      const cliStateDir = path.join(tmpDir, 'cli_auth_fail_state');
      const sReal = new EmailTestSidecar({ trustedTestMode: true, port: 20009, stateDir: cliStateDir });
      await sReal.start();
      try {
        const wrongLocalAppData = path.join(tmpDir, 'cli_wrong_localappdata');
        const wrongSidecarDir = path.join(wrongLocalAppData, 'XPIDER', 'Sidecar');
        writeProtectedSecretFile(path.join(wrongSidecarDir, '.email_sidecar_token'), 'wrong_token_0123456789abcdef\n');
        const exitCode = await new Promise(resolve => {
          const env = { ...process.env, XPIDER_EMAIL_SIDECAR_PORT: '20009', LOCALAPPDATA: wrongLocalAppData };
          delete env.XPIDER_SIDECAR_STATE_DIR;
          delete env.XPIDER_EMAIL_SIDECAR_TOKEN;
          const p = spawn(process.execPath, [path.join(__dirname, '..', 'companion', 'email-test-sidecar-cli.js')], {
            env,
            stdio: 'ignore'
          });
          p.on('exit', code => resolve(code));
        });
        assert.equal(exitCode, 4);
      } finally {
        await sReal.stop();
      }
    });

    await runTest('LOCK_OWNERSHIP_LOSS_FAIL_CLOSED_NO_TRANSPORT_AND_AMBIGUOUS_ACCEPTED', async () => {
      // P0-1a: Hostile lock replacement during reserveRequest() MUST fail closed and NEVER call transport (transportCalls === 0)
      let transportCallsA = 0;
      const ledgerA = path.join(tmpDir, '.p01a_ledger.jsonl');
      const lockA = ledgerA + '.lock';
      const fsWrapA = {
        ...fs,
        writeSync(fd, buf, off, len, pos) {
          const w = fs.writeSync(fd, buf, off, len, pos);
          const txt = Buffer.isBuffer(buf) ? buf.toString('utf8', off || 0, (off || 0) + (len || buf.length)) : String(buf);
          if (txt.includes('"REQUESTED"')) {
            fs.writeFileSync(lockA, JSON.stringify({ pid: 888888, lockId: 'stolen_before_release', createdAt: Date.now() }));
          }
          return w;
        }
      };
      const sA = new EmailTestSidecar({
        trustedTestMode: true,
        port: 20010,
        stateDir: path.join(tmpDir, 'p01a_state'),
        ledgerFile: ledgerA,
        fsImpl: fsWrapA,
        apiKeyOverride: 're_test_valid_format_123456',
        transportImpl: async () => {
          transportCallsA++;
          return { status: 'SUCCESS', providerMessageId: 'should_never_happen' };
        }
      });
      await sA.start();
      try {
        const resA = await request(20010, 'POST', '/email/test-send', {
          Authorization: `Bearer ${sA.token}`
        }, { to: 'delivered@resend.dev', idempotencyKey: 'p01a_hostile_reserve_000001' });
        assert.equal(resA.status, 500);
        assert.equal(resA.json.status, 'BLOCKED');
        assert.equal(resA.json.reconciliationRequired, true);
        assert.equal(resA.json.reason, 'LEDGER_LOCK_OWNERSHIP_LOST');
        assert.equal(transportCallsA, 0);

        // Retry with new key must also stay blocked (transportCallsA still 0)
        const resA2 = await request(20010, 'POST', '/email/test-send', {
          Authorization: `Bearer ${sA.token}`
        }, { to: 'delivered@resend.dev', idempotencyKey: 'p01a_hostile_reserve_000002' });
        assert.equal(resA2.status, 409);
        assert.equal(resA2.json.reconciliationRequired, true);
        assert.equal(transportCallsA, 0);
      } finally {
        await sA.stop();
        try { fs.unlinkSync(lockA); } catch (_) {}
      }

      // P0-1b: Hostile lock replacement during ACCEPTED append MUST return AMBIGUOUS_PERSISTENCE_FAILURE, never unqualified SUCCESS
      const ledgerB = path.join(tmpDir, '.p01b_ledger.jsonl');
      const lockB = ledgerB + '.lock';
      const fsWrapB = {
        ...fs,
        writeSync(fd, buf, off, len, pos) {
          const w = fs.writeSync(fd, buf, off, len, pos);
          const txt = Buffer.isBuffer(buf) ? buf.toString('utf8', off || 0, (off || 0) + (len || buf.length)) : String(buf);
          if (txt.includes('"ACCEPTED"')) {
            fs.writeFileSync(lockB, JSON.stringify({ pid: 999999, lockId: 'stolen_on_accepted', createdAt: Date.now() }));
          }
          return w;
        }
      };
      const sB = new EmailTestSidecar({
        trustedTestMode: true,
        port: 20011,
        stateDir: path.join(tmpDir, 'p01b_state'),
        ledgerFile: ledgerB,
        fsImpl: fsWrapB,
        apiKeyOverride: 're_test_valid_format_123456',
        transportImpl: async () => ({
          status: 'SUCCESS',
          providerMessageId: 'sim_msg_p01b',
          from: 'onboarding@resend.dev',
          timestamp: new Date().toISOString()
        })
      });
      await sB.start();
      try {
        const resB = await request(20011, 'POST', '/email/test-send', {
          Authorization: `Bearer ${sB.token}`
        }, { to: 'delivered@resend.dev', idempotencyKey: 'p01b_hostile_accept_000001' });
        assert.equal(resB.status, 500);
        assert.equal(resB.json.status, 'AMBIGUOUS_PERSISTENCE_FAILURE');
        assert.equal(resB.json.reconciliationRequired, true);
        assert.equal(resB.json.reason, 'LEDGER_LOCK_OWNERSHIP_LOST');
      } finally {
        await sB.stop();
        try { fs.unlinkSync(lockB); } catch (_) {}
      }
    });

    await runTest('LOCK_ACQUISITION_PARTIAL_FAILURE_GUARDS', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');
      const modes = ['SHORT_WRITE', 'WRITE_THROW', 'CLOSE_THROW'];
      for (const mode of modes) {
        const lPath = path.join(tmpDir, `.partial_${mode}.jsonl`);
        const lockPath = lPath + '.lock';
        let lockFdOpened = null;
        const mockFs = {
          ...fs,
          openSync(p, flags, m) {
            const fd = fs.openSync(p, flags, m);
            if (p === lockPath) lockFdOpened = fd;
            return fd;
          },
          writeSync(fd, buf, off, len, pos) {
            if (fd === lockFdOpened) {
              if (mode === 'SHORT_WRITE') return 3;
              if (mode === 'WRITE_THROW') throw new Error('EIO_SIMULATED_LOCK_WRITE');
            }
            return fs.writeSync(fd, buf, off, len, pos);
          },
          closeSync(fd) {
            const res = fs.closeSync(fd);
            if (fd === lockFdOpened && mode === 'CLOSE_THROW') {
              throw new Error('EIO_SIMULATED_LOCK_CLOSE');
            }
            return res;
          }
        };
        const pLedger = new EmailSimulatorLedger({ ledgerFile: lPath, fsImpl: mockFs });
        assert.throws(() => pLedger.reserveRequest({
          idempotencyKey: `partial_${mode}_000001`,
          recipient: 'delivered@resend.dev',
          from: 'onboarding@resend.dev'
        }), /LEDGER_LOCK_PARTIAL_FAILURE/);
        assert.equal(pLedger.reconciliationRequired, true);
        // Must NOT auto-clear potentially live/orphan lockfile
        assert.equal(fs.existsSync(lockPath), true);
        fs.unlinkSync(lockPath);
      }
    });

    await runTest('PACKAGED_MODE_REJECTS_TEST_INJECTIONS_ENV_AND_UNSAFE_FS', async () => {
      const { getSidecarPaths, assertSafeStateLocation } = require('../companion/sidecar-paths');

      // 1. Packaged mode rejects test-only constructor injections
      assert.throws(() => new EmailTestSidecar({ apiKeyOverride: 're_fake_12345678' }), /PACKAGED_MODE_TEST_INJECTION_REJECTED/);
      assert.throws(() => new EmailTestSidecar({ stateDir: tmpDir }), /PACKAGED_MODE_TEST_INJECTION_REJECTED/);
      assert.throws(() => new EmailTestSidecar({ token: '0123456789abcdef0123456789abcdef' }), /PACKAGED_MODE_TEST_INJECTION_REJECTED/);

      // 2. Packaged mode rejects XPIDER_SIDECAR_STATE_DIR env override
      const prevStateEnv = process.env.XPIDER_SIDECAR_STATE_DIR;
      process.env.XPIDER_SIDECAR_STATE_DIR = tmpDir;
      try {
        assert.throws(() => getSidecarPaths(), /UNSAFE_STATE_DIR_OVERRIDE_REJECTED/);
      } finally {
        if (prevStateEnv === undefined) delete process.env.XPIDER_SIDECAR_STATE_DIR;
        else process.env.XPIDER_SIDECAR_STATE_DIR = prevStateEnv;
      }

      // 3. Packaged mode rejects UNC / non-NTFS state locations
      assert.throws(() => assertSafeStateLocation('\\\\evil-host\\share\\sidecar', { platform: 'win32' }), /UNSAFE_STATE_FILESYSTEM_REJECTED/);
      assert.throws(() => assertSafeStateLocation('E:\\XPIDER\\Sidecar', {
        platform: 'win32',
        execSyncFn: () => 'exFAT\r\n'
      }), /UNSAFE_STATE_FILESYSTEM_REJECTED/);

      // 4. Packaged mode rejects XPIDER_EMAIL_SIDECAR_TOKEN and RESEND_API_KEY env overrides
      const prevTokEnv = process.env.XPIDER_EMAIL_SIDECAR_TOKEN;
      const prevResendEnv = process.env.RESEND_API_KEY;
      const prevLocalAppData = process.env.LOCALAPPDATA;
      const pkgLocalAppData = path.join(tmpDir, 'pkg_localappdata');
      fs.mkdirSync(pkgLocalAppData, { recursive: true });
      process.env.LOCALAPPDATA = pkgLocalAppData;
      try {
        process.env.XPIDER_EMAIL_SIDECAR_TOKEN = 'env_tok_0123456789abcdef';
        assert.throws(() => new EmailTestSidecar({ port: 20012 }), /UNSAFE_ENV_TOKEN_REJECTED/);
        delete process.env.XPIDER_EMAIL_SIDECAR_TOKEN;

        process.env.RESEND_API_KEY = 're_env_should_be_rejected_12345';
        const pkgSidecar = new EmailTestSidecar({ port: 20012 });
        assert.equal(pkgSidecar.resolveResendApiKey(), null);
        assert.equal(pkgSidecar.keyStatus, 'UNSAFE_ENV_KEY_REJECTED');
      } finally {
        if (prevTokEnv === undefined) delete process.env.XPIDER_EMAIL_SIDECAR_TOKEN;
        else process.env.XPIDER_EMAIL_SIDECAR_TOKEN = prevTokEnv;
        if (prevResendEnv === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = prevResendEnv;
        if (prevLocalAppData === undefined) delete process.env.LOCALAPPDATA;
        else process.env.LOCALAPPDATA = prevLocalAppData;
      }

      // 5. Key status never reports CONFIGURED from local regex alone
      const sFmt = new EmailTestSidecar({
        trustedTestMode: true,
        port: 20013,
        stateDir: path.join(tmpDir, 'fmt_state'),
        apiKeyOverride: 're_format_valid_only_12345'
      });
      assert.ok(sFmt.resolveResendApiKey());
      assert.equal(sFmt.keyStatus, 'FORMAT_VALID_KEY_PRESENT');
    });

    await runTest('CLI_AUTHENTICATED_STATUS_BUILD_AND_CAPABILITY_VERIFICATION', async () => {
      const http = require('node:http');
      const { spawn } = require('node:child_process');
      const { writeProtectedSecretFile } = require('../companion/email-test-sidecar-set-key');

      const mockLocalAppData = path.join(tmpDir, 'cli_status_mismatch_local');
      const tokFile = path.join(mockLocalAppData, 'XPIDER', 'Sidecar', '.email_sidecar_token');
      writeProtectedSecretFile(tokFile, 'mock_status_tok_0123456789abcdef\n');

      // Mock server returns matching /health, but mismatched companionBuildId on /email/test-send/status
      const mockSrv = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/health') {
          res.end(JSON.stringify({
            status: 'OK',
            pid: process.pid,
            companionBuildId: SIDECAR_BUILD_ID,
            apiCapabilities: ['email-test-send', 'email-test-sidecar-v1', 'email-test-ledger-v1']
          }));
        } else {
          res.end(JSON.stringify({
            status: 'OK',
            companionBuildId: 'V7.0.0-OLD-STALE-BUILD',
            apiCapabilities: ['email-test-send'],
            resendApiKeyConfigured: true,
            keyStatus: 'FORMAT_VALID_KEY_PRESENT'
          }));
        }
      });
      await new Promise(resolve => mockSrv.listen(20014, '127.0.0.1', resolve));
      try {
        const env1 = { ...process.env, XPIDER_EMAIL_SIDECAR_PORT: '20014', LOCALAPPDATA: mockLocalAppData };
        delete env1.XPIDER_SIDECAR_STATE_DIR;
        delete env1.XPIDER_EMAIL_SIDECAR_TOKEN;
        const exitBuildMismatch = await new Promise(resolve => {
          const p = spawn(process.execPath, [path.join(__dirname, '..', 'companion', 'email-test-sidecar-cli.js')], { env: env1, stdio: 'ignore' });
          p.on('exit', c => resolve(c));
        });
        assert.equal(exitBuildMismatch, 2);

        // Also CLI must reject XPIDER_SIDECAR_STATE_DIR env var in packaged mode
        const env2 = { ...process.env, XPIDER_EMAIL_SIDECAR_PORT: '20014', XPIDER_SIDECAR_STATE_DIR: tmpDir };
        const exitUnsafeEnv = await new Promise(resolve => {
          const p = spawn(process.execPath, [path.join(__dirname, '..', 'companion', 'email-test-sidecar-cli.js')], { env: env2, stdio: 'ignore' });
          p.on('exit', c => resolve(c));
        });
        assert.notEqual(exitUnsafeEnv, 0);
      } finally {
        await new Promise(resolve => mockSrv.close(resolve));
      }
    });

    await runTest('FN_THREW_STICKY_LOCK_RECONCILIATION_AND_INODE_MISMATCH_ZERO_DUPLICATE_POST', async () => {
      const { EmailSimulatorLedger } = require('../companion/email-simulator-ledger');

      // 1. fnThrew=true + hostile lock replacement: original error propagates, sticky lockReconciliationRequired blocks all subsequent requests + cold restart sees foreign lock
      const fPath = path.join(tmpDir, '.fn_threw_lock.jsonl');
      const fLedger = new EmailSimulatorLedger({ ledgerFile: fPath, lockTimeoutMs: 120 });
      assert.throws(() => {
        fLedger._withExclusiveLock(() => {
          fs.writeFileSync(fLedger.lockFile, JSON.stringify({ pid: 666666, lockId: 'foreign_during_fn_throw', createdAt: Date.now() }));
          throw new Error('ORIGINAL_FN_ERROR');
        });
      }, /ORIGINAL_FN_ERROR/);
      assert.equal(fLedger.reconciliationRequired, true);
      assert.equal(fLedger.lockReconciliationRequired, true);
      fLedger.load();
      assert.equal(fLedger.reconciliationRequired, true);
      assert.throws(() => fLedger.reserveRequest({
        idempotencyKey: 'after_fn_threw_000001',
        recipient: 'delivered@resend.dev',
        from: 'onboarding@resend.dev'
      }), /LEDGER_CORRUPT_RECONCILIATION_REQUIRED/);
      // Fresh instance on cold restart also fails closed on preserved foreign lock (no second lock owner)
      const fRestart = new EmailSimulatorLedger({ ledgerFile: fPath, lockTimeoutMs: 120 });
      assert.throws(() => fRestart.reserveRequest({
        idempotencyKey: 'restart_after_fn_threw_000001',
        recipient: 'delivered@resend.dev',
        from: 'onboarding@resend.dev'
      }), /LEDGER_STALE_LOCK_RECONCILIATION_REQUIRED/);
      fs.unlinkSync(fLedger.lockFile);

      // 2. Forged pid+lockId on a different inode (lstatSync.ino !== fstatSync.ino) is caught and rejected fail-closed
      const inoPath = path.join(tmpDir, '.ino_mismatch.jsonl');
      const inoLock = inoPath + '.lock';
      const inoMockFs = {
        ...fs,
        fstatSync: () => ({ ino: 1001 }),
        lstatSync: () => ({ ino: 2002 })
      };
      const inoLedger = new EmailSimulatorLedger({ ledgerFile: inoPath, fsImpl: inoMockFs });
      assert.throws(() => inoLedger._withExclusiveLock(() => 'ok'), /LEDGER_LOCK_OWNERSHIP_LOST/);
      assert.equal(inoLedger.reconciliationRequired, true);
      assert.equal(fs.existsSync(inoLock), true);
      fs.unlinkSync(inoLock);
    });

    console.log(`\nALL SIDECAR TESTS PASSED (${pass}/${pass})`);
  } finally {
    await sidecar.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
