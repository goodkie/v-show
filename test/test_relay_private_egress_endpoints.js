/**
 * test_relay_private_egress_endpoints.js
 * 
 * Verifies that privacy-relay-service.js exposes the private egress endpoints:
 * 1. POST /provision-egress (Authenticated, mockMode)
 * 2. GET /provision-progress (Authenticated)
 * 3. GET /egress-telemetry (Authenticated)
 * 4. POST /destroy-egress (Authenticated, mockMode)
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');
const { PrivateEgressProvisioner } = require('../companion/private-egress-provisioner');

async function run() {
  console.log('[TEST] Starting PrivacyRelayService Private Egress Endpoint Tests...');

  const tmpConfig = path.join(os.tmpdir(), `xpider_test_pool_${Date.now()}.json`);
  fs.writeFileSync(tmpConfig, JSON.stringify({
    version: '1.0.3',
    nodes: [
      {
        id: 'node-test-1',
        name: 'Test Node',
        type: 'HTTPS_PROXY',
        host: '127.0.0.1',
        port: 8443,
        username: 'user',
        password: 'pass',
        active: true,
        lastHealth: 'HEALTHY'
      }
    ]
  }));

  const relay = new PrivacyRelayService({
    controlPort: 0,
    proxyPort: 0,
    configFile: tmpConfig,
    controlToken: 'test_token_secret_1234567890abcdef'
  });

  // Mock provisioner ssh execution for offline test
  PrivateEgressProvisioner.prototype.connectSshWithRetry = async () => ({ end: () => {} });
  PrivateEgressProvisioner.prototype.uploadSshFile = async () => {};
  PrivateEgressProvisioner.prototype.runSshCommand = async (c, cmd) => {
    if (cmd.includes('bootstrap.sh')) {
      const mockDesc = {
        status: 'READY',
        host: '198.51.100.12',
        port: 8443,
        username: 'xpider_owner',
        password: 'mock_password_12345',
        caCertPem: '-----BEGIN CERTIFICATE-----\nMOCK_CA\n-----END CERTIFICATE-----',
        fingerprint: 'a1b2c3d4e5f678901234567890abcdef',
        protocol: 'HTTPS_PROXY'
      };
      return `=== [XPIDER_BOOTSTRAP_SUCCESS] ===\n${JSON.stringify(mockDesc)}\n=== [XPIDER_BOOTSTRAP_END] ===`;
    }
    return 'OK';
  };

  relay.startControlPlane();
  const server = relay.controlServer;

  const controlPort = await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });

  console.log(`[TEST] Privacy Relay Control Plane running on 127.0.0.1:${controlPort}`);

  try {
    const authHeader = `Bearer ${relay.controlToken}`;

    // TEST 1: POST /provision-egress
    console.log('[TEST 1] Testing POST /provision-egress...');
    const postData = JSON.stringify({
      token: 'dop_v1_mock_test_token',
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      mockMode: true
    });

    const provRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: controlPort,
        path: '/provision-egress',
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    assert.strictEqual(provRes.statusCode, 200, 'Provision must return 200');
    assert(provRes.body.success, 'Provision result must report success');
    assert.strictEqual(provRes.body.monthlyCostUsd, 6, 'Must report Ultra Economy $6/mo');
    console.log('  -> PASS: POST /provision-egress succeeded with Ultra Economy ($6/mo)');

    // TEST 2: GET /provision-progress
    console.log('[TEST 2] Testing GET /provision-progress...');
    const progRes = await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: controlPort,
        path: '/provision-progress',
        headers: { 'Authorization': authHeader }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
    });

    assert.strictEqual(progRes.statusCode, 200);
    assert(progRes.body.provisioning.events.length > 0, 'Must have recorded progress events');
    console.log(`  -> PASS: GET /provision-progress returned ${progRes.body.provisioning.events.length} progress events`);

    // TEST 3: GET /egress-telemetry
    console.log('[TEST 3] Testing GET /egress-telemetry?mock=true...');
    const teleRes = await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: controlPort,
        path: '/egress-telemetry?mock=true',
        headers: { 'Authorization': authHeader }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
    });

    assert.strictEqual(teleRes.statusCode, 200);
    assert(teleRes.body.success);
    assert.strictEqual(teleRes.body.telemetry.status, 'GOOD');
    console.log('  -> PASS: GET /egress-telemetry returned status GOOD');

    // TEST 4: POST /destroy-egress
    console.log('[TEST 4] Testing POST /destroy-egress...');
    const destroyData = JSON.stringify({
      token: 'dop_v1_mock_test_token',
      mockMode: true
    });

    const destroyRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: controlPort,
        path: '/destroy-egress',
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(destroyData)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
      req.write(destroyData);
      req.end();
    });

    assert.strictEqual(destroyRes.statusCode, 200);
    assert(destroyRes.body.success);
    assert.strictEqual(destroyRes.body.destroyedDroplets, 1);
    console.log('  -> PASS: POST /destroy-egress teardown succeeded');

    console.log('\n[SUCCESS] ALL CONTROL PLANE PRIVATE EGRESS ENDPOINTS PASSED!');
  } finally {
    server.close();
    try { fs.unlinkSync(tmpConfig); } catch (_) {}
  }
}

run().catch(err => {
  console.error('[TEST_FAILURE]', err);
  process.exit(1);
});
