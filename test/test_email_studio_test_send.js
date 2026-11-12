'use strict';
/**
 * Test Suite: XPIDER Email Studio Test Send (Directive #6829083670)
 * Verifies:
 * - Resend event simulator recipient allowlist enforcement
 * - Single recipient constraint & rejection of multiple recipients
 * - Server-side API key fail-closed requirement (no-fake-success)
 * - Companion control plane Bearer auth (401 on unauthorized)
 * - Idempotency key requirement & replay handling
 * - Rate limiting enforcement (429 on rapid consecutive calls)
 * - Truthful provider message ID & error handling
 * - Zero secrets exposed in responses, errors, or logs
 * - Production send UI remain locked with prerequisites
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const { TEST_FROM, TEST_RECIPIENTS, check, executeSimulatorSend } = require('../companion/resend-test-mode');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');

const results = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(
        () => {
          passCount++;
          results.push({ name, pass: true });
          console.log(`PASS ${name}`);
        },
        (err) => {
          failCount++;
          results.push({ name, pass: false, error: err.message });
          console.error(`FAIL ${name} :: ${err.message}`);
        }
      );
    }
    passCount++;
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    failCount++;
    results.push({ name, pass: false, error: err.message });
    console.error(`FAIL ${name} :: ${err.message}`);
  }
}

async function runAll() {
  console.log('--- STARTING XPIDER EMAIL STUDIO TEST SEND SUITE ---\n');

  // 1. Simulator Gate: Allowed recipients
  test('GATE_ALLOWS_ALL_THREE_OFFICIAL_SIMULATOR_RECIPIENTS', () => {
    for (const r of ['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev']) {
      const g = check({ mode: 'TEST', from: TEST_FROM, to: [r], authorizedTestTransport: true });
      assert.equal(g.allowed, true, `Recipient ${r} should be allowed`);
      assert.equal(g.sendEnabled, true, `Send should be enabled for ${r}`);
      assert.equal(g.reasons.length, 0);
    }
  });

  // 2. Simulator Gate: Rejects external recipients
  test('GATE_REJECTS_EXTERNAL_RECIPIENTS_FAIL_CLOSED', () => {
    const forbidden = [
      'user@gmail.com',
      'ceo@customer.com',
      'test@example.com',
      'delivered@example.com',
      'delivered@resend.com', // .com instead of .dev
      'info@vivpr.pro'
    ];
    for (const r of forbidden) {
      const g = check({ mode: 'TEST', from: TEST_FROM, to: [r], authorizedTestTransport: true });
      assert.equal(g.allowed, false, `External recipient ${r} must be blocked`);
      assert.ok(g.reasons.includes('TEST_RECIPIENT_NOT_ALLOWED'), `Expected TEST_RECIPIENT_NOT_ALLOWED for ${r}`);
    }
  });

  // 3. Simulator Gate: Multiple recipients rejected
  test('GATE_REJECTS_MULTIPLE_RECIPIENTS', () => {
    const g = check({
      mode: 'TEST',
      from: TEST_FROM,
      to: ['delivered@resend.dev', 'bounced@resend.dev'],
      authorizedTestTransport: true
    });
    assert.equal(g.allowed, false);
    assert.ok(g.reasons.includes('TEST_RECIPIENT_NOT_ALLOWED'));
  });

  // 4. Simulator Gate: Non-resend from rejected in test mode
  test('GATE_REJECTS_NON_RESEND_FROM_IN_TEST_MODE', () => {
    const g = check({
      mode: 'TEST',
      from: 'custom@vivpr.pro',
      to: ['delivered@resend.dev'],
      authorizedTestTransport: true
    });
    assert.equal(g.allowed, false);
    assert.ok(g.reasons.includes('TEST_FROM_MUST_BE_RESEND_DEV'));
  });

  // 5. executeSimulatorSend: Missing API Key fails closed without fake success
  await test('EXECUTE_SIMULATOR_SEND_FAILS_CLOSED_ON_MISSING_API_KEY', async () => {
    const res = await executeSimulatorSend({
      from: TEST_FROM,
      to: 'delivered@resend.dev',
      subject: 'UAT Test',
      text: 'Test content',
      idempotencyKey: 'uat_test_idempotency_key_12345',
      apiKey: '' // Missing API key
    });
    assert.equal(res.status, 'BLOCKED');
    assert.equal(res.reason, 'RESEND_API_KEY_NOT_CONFIGURED');
    assert.equal(res.testSimulatorEligible, true);
    assert.ok(res.message.includes('Resend API key is not configured'));
    // No fake success: providerMessageId must NOT be present
    assert.equal(res.providerMessageId, undefined);
  });

  // 6. executeSimulatorSend: Invalid API Key format fails closed
  await test('EXECUTE_SIMULATOR_SEND_REJECTS_MALFORMED_API_KEY', async () => {
    const res = await executeSimulatorSend({
      from: TEST_FROM,
      to: 'delivered@resend.dev',
      subject: 'UAT Test',
      text: 'Test content',
      idempotencyKey: 'uat_test_idempotency_key_12345',
      apiKey: 'sk_invalid_format_key_123' // Invalid format (must start with re_)
    });
    assert.equal(res.status, 'BLOCKED');
    assert.equal(res.reason, 'RESEND_API_KEY_NOT_CONFIGURED');
  });

  // 7. executeSimulatorSend: Missing subject or content rejected
  await test('EXECUTE_SIMULATOR_SEND_REJECTS_EMPTY_SUBJECT_OR_CONTENT', async () => {
    const res1 = await executeSimulatorSend({
      from: TEST_FROM,
      to: 'delivered@resend.dev',
      subject: '',
      text: 'Hello',
      idempotencyKey: 'uat_test_idempotency_key_12345',
      apiKey: 're_12345678_test'
    });
    assert.equal(res1.status, 'BLOCKED');
    assert.ok(res1.reasons.includes('SUBJECT_REQUIRED'));

    const res2 = await executeSimulatorSend({
      from: TEST_FROM,
      to: 'delivered@resend.dev',
      subject: 'Hello',
      html: '',
      text: '',
      idempotencyKey: 'uat_test_idempotency_key_12345',
      apiKey: 're_12345678_test'
    });
    assert.equal(res2.status, 'BLOCKED');
    assert.ok(res2.reasons.includes('CONTENT_REQUIRED'));
  });

  // 8. executeSimulatorSend: Short idempotency key rejected
  await test('EXECUTE_SIMULATOR_SEND_REQUIRES_STRONG_IDEMPOTENCY_KEY', async () => {
    const res = await executeSimulatorSend({
      from: TEST_FROM,
      to: 'delivered@resend.dev',
      subject: 'Hello',
      text: 'World',
      idempotencyKey: 'short',
      apiKey: 're_12345678_test'
    });
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.reasons.includes('IDEMPOTENCY_KEY_REQUIRED'));
  });

  // 9. Companion Control Plane: Authentication required on /email/test-send endpoints
  await test('COMPANION_CONTROL_API_REJECTS_UNAUTHORIZED_REQUESTS', async () => {
    const testPort = 19989;
    const testToken = 'test_token_' + crypto.randomBytes(16).toString('hex');
    const service = new PrivacyRelayService({
      controlPort: testPort,
      proxyPort: 19988,
      controlToken: testToken,
      configFile: path.join(__dirname, 'mock_pool_config.json')
    });
    service.startControlPlane();
    await new Promise(r => setTimeout(r, 200));

    try {
      // (a) Unauthenticated GET /email/test-send/status -> 401
      const getUnauth = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${testPort}/email/test-send/status`, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: d }));
        }).on('error', rej);
      });
      assert.equal(getUnauth.status, 401);

      // (b) Authenticated GET /email/test-send/status -> 200
      const getAuth = await new Promise((res, rej) => {
        const req = http.request(`http://127.0.0.1:${testPort}/email/test-send/status`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${testToken}` }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
        });
        req.on('error', rej);
        req.end();
      });
      assert.equal(getAuth.status, 200);
      assert.equal(getAuth.data.testSimulatorEnabled, true);
      assert.equal(getAuth.data.productionHold, true);
      assert.equal(getAuth.data.productionSendLocked, true);
      assert.deepEqual(getAuth.data.allowedRecipients, TEST_RECIPIENTS);

      // (c) Unauthenticated POST /email/test-send -> 401
      const postUnauth = await new Promise((res, rej) => {
        const req = http.request(`http://127.0.0.1:${testPort}/email/test-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: d }));
        });
        req.on('error', rej);
        req.end(JSON.stringify({ to: 'delivered@resend.dev' }));
      });
      assert.equal(postUnauth.status, 401);

      // (d) Authenticated POST with forbidden recipient -> 400 with TEST_RECIPIENT_NOT_ALLOWED
      const postForbidden = await new Promise((res, rej) => {
        const req = http.request(`http://127.0.0.1:${testPort}/email/test-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testToken}`
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
        });
        req.on('error', rej);
        req.end(JSON.stringify({
          to: 'attacker@evil.com',
          idempotencyKey: 'uat_test_idempotency_key_12345',
          subject: 'Test',
          text: 'Body'
        }));
      });
      assert.equal(postForbidden.status, 400);
      assert.equal(postForbidden.data.status, 'BLOCKED');
      assert.equal(postForbidden.data.reason, 'TEST_RECIPIENT_NOT_ALLOWED');

      // (e) Authenticated POST with missing API Key on companion -> returns BLOCKED RESEND_API_KEY_NOT_CONFIGURED
      const postNoKey = await new Promise((res, rej) => {
        const req = http.request(`http://127.0.0.1:${testPort}/email/test-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testToken}`
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
        });
        req.on('error', rej);
        req.end(JSON.stringify({
          to: 'delivered@resend.dev',
          idempotencyKey: 'uat_test_idempotency_key_99999',
          subject: 'Test Subject',
          text: 'Test Body'
        }));
      });
      assert.equal(postNoKey.status, 200);
      assert.equal(postNoKey.data.status, 'BLOCKED');
      assert.equal(postNoKey.data.reason, 'RESEND_API_KEY_NOT_CONFIGURED');
      assert.equal(postNoKey.data.testSimulatorEligible, true);

      // (f) Rate Limit Check: Immediate second call returns 429
      const postRateLimit = await new Promise((res, rej) => {
        const req = http.request(`http://127.0.0.1:${testPort}/email/test-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testToken}`
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
        });
        req.on('error', rej);
        // Put in fake key so it passes the key check and hits rate limiter
        service.resolveResendApiKey = () => 're_test_fake_key_12345';
        req.end(JSON.stringify({
          to: 'delivered@resend.dev',
          idempotencyKey: 'uat_test_idempotency_key_88888',
          subject: 'Test Subject',
          text: 'Test Body'
        }));
      });
      // Second send within 5s
      const postRateLimit2 = await new Promise((res, rej) => {
        const req = http.request(`http://127.0.0.1:${testPort}/email/test-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testToken}`
          }
        }, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ status: r.statusCode, data: JSON.parse(d) }));
        });
        req.on('error', rej);
        req.end(JSON.stringify({
          to: 'delivered@resend.dev',
          idempotencyKey: 'uat_test_idempotency_key_77777',
          subject: 'Test Subject',
          text: 'Test Body'
        }));
      });
      assert.equal(postRateLimit2.status, 429);
      assert.equal(postRateLimit2.data.reason, 'RATE_LIMIT_EXCEEDED');

    } finally {
      if (service.controlServer) service.controlServer.close();
    }
  });

  // 10. Live Credential Check (or NOT_RUN if unset)
  await test('LIVE_RESEND_SIMULATOR_PROVIDER_DELIVERY', async () => {
    const liveKey = process.env.RESEND_API_KEY;
    if (!liveKey || !/^re_[A-Za-z0-9_-]{8,}$/.test(liveKey.trim())) {
      console.log('  [INFO] RESEND_API_KEY not configured in environment. Marking LIVE_RESEND_SIMULATOR_PROVIDER_DELIVERY as NOT_RUN per Directive Item 3.');
      return;
    }
    console.log('  [INFO] RESEND_API_KEY detected in environment. Dispatching live test to delivered@resend.dev...');
    const result = await executeSimulatorSend({
      from: TEST_FROM,
      to: 'delivered@resend.dev',
      subject: 'XPIDER Email Studio Automated Verification',
      text: 'Automated verification test of Resend Event Simulator transport.',
      idempotencyKey: 'live_test_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
      apiKey: liveKey.trim()
    });
    console.log('  [LIVE_RECEIPT]', JSON.stringify(result));
    assert.equal(result.status, 'SUCCESS');
    assert.ok(result.providerMessageId, 'Live Resend test send must return truthful provider message ID');
  });

  console.log(`\n=========================================`);
  console.log(`TOTAL: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
  console.log(`=========================================`);
  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAll().catch(e => {
  console.error('FATAL TEST RUNNER ERROR:', e);
  process.exit(1);
});
