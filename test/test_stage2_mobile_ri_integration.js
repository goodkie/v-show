/**
 * test_stage2_mobile_ri_integration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic Test Suite for Stage 2 Mobile RI Integration & Security Contract
 *
 * Validates:
 *   [1] Gated Security: Unauthenticated report ingestion returns 403 FORBIDDEN
 *   [2] Capabilities: Unauthenticated capabilities query returns authorized: false
 *   [3] Token Hygiene: qaSessionToken is NEVER sent in JSON payload body
 *   [4] Fail-Closed: Invalid/tampered tokens are rejected
 *   [5] Report Ingestion: Authorized report ingestion persists to persistent volume
 *   [6] Receipt Verification: Server returns status=PERSISTED and matching sessionId
 *   [7] Report Inspection: Authorized retrieval returns persisted diagnostic artifacts
 *   [8] Inspection Security: Unauthorized retrieval is strictly rejected (403)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Stage2CaptureEngine, STATES } = require('../virtual-tradeshow-commercial-v1/client/capture/stage2-capture-engine.js');

const SERVER_PORT = 3899;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passCount++;
      console.log(`  [PASS] ${name}`);
    })
    .catch((err) => {
      failCount++;
      console.error(`  [FAIL] ${name}: ${err.message}`);
    });
}

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runMobileRiSuite() {
  console.log('================================================================');
  console.log('STAGE 2 MOBILE RI — DETERMINISTIC SECURITY & E2E TEST SUITE');
  console.log('================================================================\n');

  // [1] Gated Security
  await test('[1] Unauthenticated report ingestion is strictly rejected (403)', async () => {
    const res = await makeRequest('POST', '/api/internal-qa/mobile-ri/report', {}, { test: 1 });
    assert.strictEqual(res.status, 403, 'Unauthenticated POST must return 403');
    assert.strictEqual(res.json?.ok, false);
  });

  // [2] Capabilities Unauthenticated
  await test('[2] Unauthenticated capabilities query returns authorized: false', async () => {
    const res = await makeRequest('GET', '/api/internal-qa/capabilities');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json?.authorized, false);
    assert.strictEqual(res.json?.mobileRuntimeInspector, false);
  });

  // [3] Token Invariant in Stage2CaptureEngine
  await test('[3] Stage2CaptureEngine NEVER includes qaSessionToken in body payload', async () => {
    const engine = new Stage2CaptureEngine();
    const token = 'qa-sess-secret-token-12345';
    engine.initTelemetry(token, 'prj-free-b0c6f3ea');

    let interceptedBody = null;
    let interceptedHeaders = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      interceptedHeaders = opts.headers;
      interceptedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          status: 'PERSISTED',
          sessionId: interceptedBody.sessionId
        })
      };
    };

    const res = await engine.sendTelemetryReport('/api/internal-qa/mobile-ri/report');
    global.fetch = originalFetch;

    assert.strictEqual(res.success, true);
    assert.strictEqual(interceptedHeaders['x-qa-session'], token, 'Token must be sent in header');
    assert.strictEqual(interceptedBody.qaSessionToken, undefined, 'Token must NOT be in body');
  });

  // [4] Tampered/Fake Token Rejection
  await test('[4] Forged/fake token is rejected with 403', async () => {
    const res = await makeRequest('POST', '/api/internal-qa/mobile-ri/report', {
      'x-qa-session': 'forged-token-' + Date.now()
    }, { test: 1 });
    assert.strictEqual(res.status, 403, 'Forged token must return 403');
  });

  // [5] Authorized Ingestion & [6] Server Receipt
  let activeQaSessionToken = null;
  let testSessionId = null;

  await test('[5 & 6] Authorized report ingestion persists to volume and returns receipt', async () => {
    // Generate valid session in server memory for test
    const crypto = require('crypto');
    activeQaSessionToken = 'qa-sess-autotest-' + crypto.randomBytes(16).toString('hex');
    testSessionId = 'RI-S2-TEST-' + Date.now().toString(36).toUpperCase();

    // Inject valid session into server's persistent volume QA sessions file
    const sessionsFile = path.join(__dirname, '../virtual-tradeshow-commercial-v1/_clean_deploy/data/qa_sessions.json');
    let currentData = { captureSessions: [], qaBrowserSessions: [] };
    if (fs.existsSync(sessionsFile)) {
      try { currentData = JSON.parse(fs.readFileSync(sessionsFile, 'utf8')); } catch (e) {}
    }
    currentData.qaBrowserSessions.push([activeQaSessionToken, {
      qaSessionToken: activeQaSessionToken,
      projectId: 'prj-free-b0c6f3ea',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'AUTHORIZED',
      role: 'OWNER_QA'
    }]);
    fs.writeFileSync(sessionsFile, JSON.stringify(currentData, null, 2), 'utf8');

    // Engine reports with this token
    const engine = new Stage2CaptureEngine();
    engine.initTelemetry(activeQaSessionToken, 'prj-free-b0c6f3ea');
    engine.telemetry.sessionId = testSessionId;
    engine.processSensorInput({ alpha: 180, beta: 0, gamma: 0, rawBeta: 90, rawGamma: 0, source: 'deviceorientationabsolute', timestamp: 1000 });
    engine.processSensorInput({ alpha: 150, beta: 2, gamma: 1, rawBeta: 92, rawGamma: 1, source: 'deviceorientationabsolute', timestamp: 1100 });

    const sendRes = await engine.sendTelemetryReport(`${BASE_URL}/api/internal-qa/mobile-ri/report`);
    assert.strictEqual(sendRes.success, true, 'Report must be accepted by server');
    assert.strictEqual(sendRes.status, 'PERSISTED');
    assert.strictEqual(sendRes.sessionId, testSessionId);
  });

  // [7] Authorized Retrieval
  await test('[7] Authorized retrieval of persisted session returns artifacts', async () => {
    assert.ok(testSessionId, 'Test session must exist');
    const res = await makeRequest('GET', `/api/internal-qa/mobile-ri/session/${testSessionId}`, {
      'x-qa-session': activeQaSessionToken
    });
    assert.strictEqual(res.status, 200, 'Authorized retrieval must return 200');
    assert.strictEqual(res.json?.summary?.sessionId, testSessionId);
    assert.strictEqual(res.json?.summary?.sampleCount, 2);
    assert.strictEqual(res.json?.summary?.sensorSource, 'deviceorientationabsolute');
  });

  // [8] Unauthorized Retrieval
  await test('[8] Unauthorized retrieval of session is strictly rejected (403)', async () => {
    assert.ok(testSessionId, 'Test session must exist');
    const res = await makeRequest('GET', `/api/internal-qa/mobile-ri/session/${testSessionId}`);
    assert.strictEqual(res.status, 403, 'Unauthorized GET must return 403');
  });

  console.log('\n================================================================');
  console.log(`MOBILE RI TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

runMobileRiSuite();
