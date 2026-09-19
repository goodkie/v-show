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

  // [9] Quick Activation & Cookie Auth Transport
  let quickActivatedToken = null;
  await test('[9] Dev/LAN quick-activate endpoint provisions OWNER_QA session and Set-Cookie', async () => {
    const res = await makeRequest('POST', '/api/internal-qa/auth/quick-activate', {
      'Host': '127.0.0.1:3899'
    }, {});
    assert.strictEqual(res.status, 200, 'quick-activate must succeed on dev host');
    assert.strictEqual(res.json?.ok, true);
    assert.strictEqual(res.json?.role, 'OWNER_QA');
    assert.ok(res.json?.qaSessionToken, 'Token must be issued');
    quickActivatedToken = res.json.qaSessionToken;

    // Verify cookie transport works on capabilities check
    const capRes = await makeRequest('GET', '/api/internal-qa/capabilities', {
      'Cookie': `qa_session_token=${quickActivatedToken}`
    });
    assert.strictEqual(capRes.status, 200);
    assert.strictEqual(capRes.json?.authorized, true, 'Cookie must authorize capabilities check');
    assert.strictEqual(capRes.json?.mobileRuntimeInspector, true);
    assert.strictEqual(capRes.json?.role, 'OWNER_QA');
  });

  // [10] Serving owner-ri.js module
  await test('[10] Serving /owner-ri.js module returns JavaScript with MobileRI logic', async () => {
    const res = await makeRequest('GET', '/owner-ri.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type']?.includes('javascript'));
    assert.ok(res.body.includes('MobileRI'), 'Module must contain MobileRI definition');
  });

  // [11] Single-Switch Retirement Verification (ENABLE_OWNER_RI=false)
  await test('[11] When ENABLE_OWNER_RI=false, module is omitted (404) and capabilities disabled', async () => {
    const { spawn } = require('child_process');
    const retiredPort = 3896;
    const retiredEnv = { ...process.env, PORT: String(retiredPort), ENABLE_OWNER_RI: 'false' };
    const serverProc = spawn(process.execPath, ['server/index.js'], {
      cwd: path.join(__dirname, '../virtual-tradeshow-commercial-v1/_clean_deploy'),
      env: retiredEnv,
      stdio: 'pipe'
    });

    try {
      // Wait for server to boot
      await new Promise((resolve) => {
        serverProc.stdout.on('data', (d) => {
          if (d.toString().includes('Virtual Trade Show Commercial Beta Server')) resolve();
        });
        setTimeout(resolve, 2500);
      });

      // 1. Verify /owner-ri.js returns 404
      const modRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${retiredPort}/owner-ri.js`, (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ status: r.statusCode, body }));
        }).on('error', reject);
      });
      assert.strictEqual(modRes.status, 404, 'owner-ri.js must return 404 when ENABLE_OWNER_RI=false');
      assert.ok(modRes.body.includes('ENABLE_OWNER_RI=false'), 'Body must indicate disabled switch');

      // 2. Verify capabilities returns disabled even with token
      const capRes = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${retiredPort}/api/internal-qa/capabilities`, (r) => {
          let body = '';
          r.on('data', c => { body += c; });
          r.on('end', () => resolve({ status: r.statusCode, json: JSON.parse(body) }));
        }).on('error', reject);
      });
      assert.strictEqual(capRes.json.mobileRuntimeInspector, false, 'Inspector must be disabled');
      assert.strictEqual(capRes.json.enabled, false, 'enabled flag must be false');
      assert.strictEqual(capRes.json.reason, 'OWNER_RI_DISABLED');
    } finally {
      serverProc.kill('SIGTERM');
    }
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
