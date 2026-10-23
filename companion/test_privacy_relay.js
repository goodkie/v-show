/**
 * test_privacy_relay.js
 * Comprehensive unit test suite for Companion Privacy Relay service
 * RC3.45 hardened:
 * - Bounded watchdog (15s) to guarantee no hang
 * - Isolated test directory and ports to prevent collision with live companion
 * - Deterministic egress verification stub for offline repeatability
 * - Bearer control token authentication on protected endpoints
 * - Clean teardown of servers, timers, and sockets
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { PrivacyRelayService } = require('./privacy-relay-service');

const WATCHDOG_MS = 15000;
const wd = setTimeout(() => {
  console.error('❌ [TEST] Bounded watchdog fired after 15s - forcing exit.');
  process.exit(2);
}, WATCHDOG_MS);

async function testRelay() {
  console.log('[TEST] Initializing PrivacyRelayService with isolated test ports and sandbox config...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-test-relay-'));
  const configFile = path.join(tmpDir, 'egress_pool_config.json');
  const tokenFile = path.join(tmpDir, '.control_token');
  const testToken = 'test_token_' + 'b'.repeat(48);

  const TEST_CONTROL_PORT = 29989;
  const TEST_PROXY_PORT = 29988;

  fs.writeFileSync(configFile, JSON.stringify({
    version: '1.0.3',
    rotationMode: 'FIXED',
    healthCheckTimeoutMs: 1500,
    healthTtlMs: 60000,
    selectedEgressId: 'egress-node-1',
    nodes: [
      {
        id: 'egress-node-1',
        type: 'HTTPS_PROXY',
        host: '127.0.0.1',
        port: 9,
        username: 'testuser',
        password: 'testpassword',
        privateOnly: true,
        active: true,
        lastHealth: 'UNKNOWN'
      },
      {
        id: 'egress-node-2',
        type: 'HTTPS_PROXY',
        host: '127.0.0.1',
        port: 9,
        username: 'testuser2',
        password: 'testpassword2',
        privateOnly: true,
        active: true,
        lastHealth: 'UNKNOWN'
      }
    ]
  }));

  const service = new PrivacyRelayService({
    companionDir: tmpDir,
    configFile,
    tokenFile,
    controlToken: testToken,
    controlPort: TEST_CONTROL_PORT,
    proxyPort: TEST_PROXY_PORT,
    enableContinuousHealthMonitor: false,
    allowedExtensionId: 'abcdefghijklmnopabcdefghijklmnop'
  });

  // Deterministic mock verification so unit test runs offline and reliably
  service.verifyNodeEgress = async (node) => ({
    verified: true,
    observedEgressIp: '198.51.100.1',
    fingerprint: 'sha256-mock-fingerprint-' + (node ? node.id : 'unknown')
  });

  const apiReq = (method, endpoint, body = null, useAuth = true) => new Promise((resolve, reject) => {
    const headers = {};
    if (useAuth) headers['Authorization'] = `Bearer ${testToken}`;
    if (body) headers['Content-Type'] = 'application/json';

    const req = http.request({
      host: '127.0.0.1',
      port: TEST_CONTROL_PORT,
      path: endpoint,
      method,
      headers,
      timeout: 4000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json || data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout on ${method} ${endpoint}`));
    });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });

  try {
    await service.start();
    await new Promise(r => setTimeout(r, 400));

    // 1. Test /health (Public, unauthenticated)
    console.log('[TEST] Checking /health...');
    const health = await apiReq('GET', '/health', null, false);
    if (health.status !== 200 || health.body.controlPort !== TEST_CONTROL_PORT) {
      throw new Error('Health check failed: ' + JSON.stringify(health));
    }
    console.log('[TEST_HEALTH] OK:', health.body.service, 'port:', health.body.controlPort);

    // 2. Test /status (Authenticated)
    console.log('[TEST] Checking /status with Bearer token...');
    const status = await apiReq('GET', '/status');
    if (status.status !== 200 || !status.body.selectedEgressId) {
      throw new Error('Status check failed: ' + JSON.stringify(status));
    }
    // Verify no password leak
    const statusStr = JSON.stringify(status.body);
    if (statusStr.includes('testpassword')) {
      throw new Error('Password leaked in status response!');
    }
    console.log('[TEST_STATUS] OK (no credentials leaked)');

    // 2b. Test /status unauthorized (Should be 401)
    const unauthStatus = await apiReq('GET', '/status', null, false);
    if (unauthStatus.status !== 401) {
      throw new Error('Expected 401 on unauthorized /status, got: ' + unauthStatus.status);
    }
    console.log('[TEST_AUTH] 401 verified on missing token');

    // 3. Test /rotate
    console.log('[TEST] Checking /rotate...');
    const rotate = await apiReq('POST', '/rotate', { reason: 'UNIT_TEST_ROTATE' });
    if (rotate.status !== 200 || !rotate.body.success) {
      throw new Error('Rotation check failed: ' + JSON.stringify(rotate));
    }
    console.log('[TEST_ROTATE] OK:', rotate.body.selectedEgressId, 'count:', rotate.body.rotationCount);

    // 4. Test /select
    console.log('[TEST] Checking /select...');
    const select = await apiReq('POST', '/select', { egressId: 'egress-node-1' });
    if (select.status !== 200 || !select.body.success || select.body.selectedEgressId !== 'egress-node-1') {
      throw new Error('Select check failed: ' + JSON.stringify(select));
    }
    console.log('[TEST_SELECT] OK:', select.body.selectedEgressId);

    // 5. Test /mode
    console.log('[TEST] Checking /mode...');
    const mode = await apiReq('POST', '/mode', { rotationMode: 'CAMPAIGN_BOUNDARY' });
    if (mode.status !== 200 || !mode.body.success || mode.body.rotationMode !== 'CAMPAIGN_BOUNDARY') {
      throw new Error('Mode check failed: ' + JSON.stringify(mode));
    }
    console.log('[TEST_MODE] OK:', mode.body.rotationMode);

    // 6. Test /pause & fail-closed drop
    console.log('[TEST] Checking /pause and fail-closed proxy drop...');
    const pause = await apiReq('POST', '/pause');
    if (pause.status !== 200 || !pause.body.paused) {
      throw new Error('Pause failed: ' + JSON.stringify(pause));
    }

    // Verify proxy drop when paused
    const proxyReqResult = await new Promise(resolve => {
      const q = http.request({
        host: '127.0.0.1',
        port: TEST_PROXY_PORT,
        path: 'http://example.com/test',
        method: 'GET',
        headers: { Host: 'example.com' },
        timeout: 2000
      }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      q.on('error', err => resolve('CONN_DROP_' + err.code));
      q.on('timeout', () => { q.destroy(); resolve('TIMEOUT'); });
      q.end();
    });
    console.log('✅ Fail-closed proxy response when paused (HTTP 502 expected):', proxyReqResult);
    if (proxyReqResult !== 502) {
      throw new Error('Expected 502 from proxy while paused, got ' + proxyReqResult);
    }

    // 7. Resume
    console.log('[TEST] Checking /resume...');
    const resume = await apiReq('POST', '/resume');
    if (resume.status !== 200 || resume.body.paused) {
      throw new Error('Resume failed: ' + JSON.stringify(resume));
    }
    console.log('[TEST_RESUME] OK (paused=false)');

    console.log('✅ ALL COMPANION PRIVACY RELAY TESTS PASSED!');
  } finally {
    try { await service.stop(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

testRelay().then(() => {
  clearTimeout(wd);
  console.log('[TEST] Clean exit (code 0)');
  process.exit(0);
}).catch(err => {
  clearTimeout(wd);
  console.error('❌ TEST FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
