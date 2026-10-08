/**
 * test_r6_9g10_3_remediation.js
 * Verification of all R6.9G.10.3 remediations (Issue #6 ChatGPT Audit #6053727627):
 * - Blocker 2: Windows Secret Storage Fail-Closed & Scheme Enforcement
 * - Blocker 3: Transactional Installer with Fail-Closed Rollback
 * - Blocker 4: Owner Egress Node Management & Relay Protocol Boundary (SOCKS5 rejected in Relay mode)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const winsec = require('./companion/winsec');
const { PrivacyRelayService } = require('./companion/privacy-relay-service');
const PrivacyGateway = require('./send_message_backup/modules/privacy-gateway');

async function runTests() {
  console.log('====================================================');
  console.log('  XPIDER R6.9G.10.3 AUDIT REMEDIATION VERIFICATION  ');
  console.log('====================================================\n');

  // ------------------------------------------------------------------
  // BLOCKER 2: WINSEC TESTS
  // ------------------------------------------------------------------
  console.log('[TEST 1] Blocker 2 — Winsec Fail-Closed & Scheme Enforcement');

  // Test 1A: DPAPI unavailable -> credential save fails closed
  process.env.XPIDER_FORCE_DPAPI_FAIL = '1';
  winsec.clearMemoryCache();
  let failClosedThrown = false;
  try {
    winsec.sanitizeNodeForSave({
      id: 'node-fail-test',
      type: 'HTTP_PROXY',
      host: '127.0.0.1',
      port: 8080,
      username: 'user',
      password: 'test-password-123'
    });
  } catch (err) {
    failClosedThrown = true;
    console.log('  [PASS] Test 1A: DPAPI failure throws fail-closed error:', err.message);
  }
  assert.strictEqual(failClosedThrown, true, 'DPAPI failure MUST throw fail-closed error');

  // Test 1B: credentialRef="plain-secret" -> rejected, never returned as password
  delete process.env.XPIDER_FORCE_DPAPI_FAIL;
  winsec.clearMemoryCache();
  const rawDecrypted = winsec.decrypt('plain-secret');
  assert.strictEqual(rawDecrypted, '', 'decrypt("plain-secret") must return empty string');

  const resolved = winsec.resolveNodeCredentials({
    id: 'node-plain-ref',
    username: 'user',
    credentialRef: 'plain-secret'
  });
  assert.strictEqual(resolved.password, '', 'resolveNodeCredentials with raw credentialRef must return empty password');
  console.log('  [PASS] Test 1B: raw credentialRef="plain-secret" rejected, never returned as password');

  // Test 1C: persisted JSON contains zero plaintext secrets
  const sanitized = winsec.sanitizeNodeForSave({
    id: 'node-save-test',
    type: 'HTTP_PROXY',
    host: '127.0.0.1',
    port: 8080,
    username: 'user',
    password: 'sensitive-secret-999',
    observedEgressIp: '1.2.3.4',
    observedFingerprint: 'fp-xyz'
  });
  assert.strictEqual(sanitized.password, '', 'password field must be blanked');
  assert.ok(sanitized.credentialRef.startsWith('dpapi:'), 'credentialRef must be encrypted to dpapi:');
  assert.strictEqual(sanitized.observedEgressIp, undefined, 'observedEgressIp must be removed');
  assert.strictEqual(sanitized.observedFingerprint, undefined, 'observedFingerprint must be removed');

  const jsonStr = JSON.stringify(sanitized);
  assert.strictEqual(jsonStr.includes('sensitive-secret-999'), false, 'persisted JSON must contain zero plaintext secret');
  console.log('  [PASS] Test 1C: persisted JSON contains zero plaintext secret material');

  // ------------------------------------------------------------------
  // BLOCKER 3: INSTALLER TRANSACTIONAL & ROLLBACK VERIFICATION
  // ------------------------------------------------------------------
  console.log('\n[TEST 2] Blocker 3 — Installer Transactional & Rollback');

  // Test 2A: install_native_host.js exits with code 1 if discovery fails or invalid ID passed
  const { execSync } = require('child_process');
  let nativeHostExit1 = false;
  try {
    execSync('node companion/install_native_host.js --ext-id invalid-short-id', { stdio: 'pipe' });
  } catch (err) {
    nativeHostExit1 = (err.status !== 0);
  }
  assert.strictEqual(nativeHostExit1, true, 'install_native_host.js with invalid ID must exit with non-zero code');
  console.log('  [PASS] Test 2A: install_native_host.js with invalid ID exits with non-zero code');

  // Test 2B: Verify install_companion.bat contains rollback logic
  const batContent = fs.readFileSync('companion/install_companion.bat', 'utf8');
  assert.ok(batContent.includes('%ERRORLEVEL% NEQ 0'), 'install_companion.bat must check %ERRORLEVEL%');
  assert.ok(batContent.includes('install_autostart.js --uninstall'), 'install_companion.bat must rollback autostart on native host failure');
  assert.ok(batContent.includes('Installation aborted'), 'install_companion.bat must print abort on failure');
  console.log('  [PASS] Test 2B: install_companion.bat verifies errorlevel and rolls back on failure');

  // ------------------------------------------------------------------
  // BLOCKER 4: EGRESS NODE API & SOCKS5 PROTOCOL BOUNDARY
  // ------------------------------------------------------------------
  console.log('\n[TEST 3] Blocker 4 — Egress Node API & SOCKS5 Protocol Boundary');

  const tempConfigPath = path.resolve(__dirname, 'temp_test_r6_9g10_3_config.json');
  fs.writeFileSync(tempConfigPath, JSON.stringify({
    version: '1.0.3',
    rotationMode: 'HEALTH_FAILOVER',
    healthTtlMs: 60000,
    canaryUrl: 'https://cloudflare.com/cdn-cgi/trace',
    nodes: []
  }), 'utf8');

  const relay = new PrivacyRelayService({
    proxyPort: 19890,
    controlPort: 19891,
    configFile: tempConfigPath,
    allowedExtensionId: 'ldlijlaccfeelfdhgnjbibniocefckjj'
  });

  relay.start();
  await new Promise(r => setTimeout(r, 150));
  console.log('  Relay initialized for testing on control port 19891');

  const controlToken = relay.controlToken;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${controlToken}`,
    'Origin': 'chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj'
  };

  function request(method, pathUrl, data = null) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 19891,
        path: pathUrl,
        method: method,
        headers: authHeaders
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (_) {
            resolve({ statusCode: res.statusCode, body });
          }
        });
      });
      req.on('error', reject);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  // Test 3A: GET /nodes initially returns empty list
  const getInitial = await request('GET', '/nodes');
  assert.strictEqual(getInitial.statusCode, 200);
  assert.strictEqual(getInitial.data.nodes.length, 0, 'Initial pool must have 0 nodes');
  console.log('  [PASS] Test 3A: GET /nodes returns clean empty pool initially');

  // Test 3B: POST /add-node with SOCKS5 is REJECTED with 400
  const addSocks5 = await request('POST', '/add-node', {
    type: 'SOCKS5',
    host: '127.0.0.1',
    port: 1080
  });
  assert.strictEqual(addSocks5.statusCode, 400, 'Adding SOCKS5 node to Relay pool must return HTTP 400');
  assert.ok(addSocks5.data.reason.includes('UNSUPPORTED_RELAY_NODE_TYPE'), 'Reason must mention UNSUPPORTED_RELAY_NODE_TYPE');
  assert.ok(addSocks5.data.reason.includes('Direct Managed Proxy'), 'Reason must guide user to Direct Managed Proxy');
  console.log('  [PASS] Test 3B: POST /add-node with SOCKS5 strictly rejected with HTTP 400 and clear directive');

  // Test 3C: POST /add-node with HTTP_PROXY succeeds, encrypts password via DPAPI, saves to disk
  const addHttp = await request('POST', '/add-node', {
    type: 'HTTP_PROXY',
    name: 'test-node-alpha',
    host: '127.0.0.1',
    port: 18991,
    username: 'alpha-user',
    password: 'alpha-password-secret',
    region: 'US-East'
  });
  assert.strictEqual(addHttp.statusCode, 200);
  assert.strictEqual(addHttp.data.success, true);
  assert.strictEqual(addHttp.data.node.id, 'test-node-alpha');
  assert.strictEqual(addHttp.data.node.type, 'HTTP_PROXY');
  assert.strictEqual(addHttp.data.node.password, undefined, 'Returned node data must NOT expose password');

  // Check persisted JSON file
  const savedConfigData = JSON.parse(fs.readFileSync(tempConfigPath, 'utf8'));
  assert.strictEqual(savedConfigData.nodes.length, 1);
  assert.strictEqual(savedConfigData.nodes[0].password, '', 'Persisted config password must be blank');
  assert.ok(savedConfigData.nodes[0].credentialRef.startsWith('dpapi:'), 'Persisted config must store password as dpapi:');
  console.log('  [PASS] Test 3C: POST /add-node persists node with DPAPI encrypted password and blank plaintext');

  // Test 3D: POST /add-node with HTTPS_PROXY succeeds
  const addHttps = await request('POST', '/add-node', {
    type: 'HTTPS_PROXY',
    name: 'test-node-beta',
    host: '127.0.0.1',
    port: 18992,
    username: 'beta-user',
    password: 'beta-password-secret',
    region: 'EU-West'
  });
  assert.strictEqual(addHttps.statusCode, 200);
  assert.strictEqual(addHttps.data.totalNodes, 2);
  console.log('  [PASS] Test 3D: POST /add-node with HTTPS_PROXY succeeds (pool count: 2)');

  // Test 3E: GET /nodes returns both nodes with zero plaintext secrets
  const getUpdated = await request('GET', '/nodes');
  assert.strictEqual(getUpdated.statusCode, 200);
  assert.strictEqual(getUpdated.data.nodes.length, 2);
  for (const n of getUpdated.data.nodes) {
    assert.strictEqual(n.password, undefined, 'GET /nodes must never leak password');
    assert.strictEqual(n.credentialRef, undefined, 'GET /nodes must never leak credentialRef');
  }
  console.log('  [PASS] Test 3E: GET /nodes returns sanitized node list with zero credentials');

  // Test 3F: verifyNodeEgress rejects SOCKS5
  const probeSocks5 = await relay.verifyNodeEgress({
    id: 'socks5-probe',
    type: 'SOCKS5',
    host: '127.0.0.1',
    port: 1080
  });
  assert.strictEqual(probeSocks5.verified, false);
  assert.ok(probeSocks5.reason.includes('UNSUPPORTED_RELAY_NODE_TYPE'));
  console.log('  [PASS] Test 3F: verifyNodeEgress strictly rejects SOCKS5 node type');

  // Test 3G: POST /remove-node removes node from pool and disk
  const removeRes = await request('POST', '/remove-node', { id: 'test-node-alpha' });
  assert.strictEqual(removeRes.statusCode, 200);
  assert.strictEqual(removeRes.data.count, 1);

  const afterRemoveConfig = JSON.parse(fs.readFileSync(tempConfigPath, 'utf8'));
  assert.strictEqual(afterRemoveConfig.nodes.length, 1);
  assert.strictEqual(afterRemoveConfig.nodes[0].id, 'test-node-beta');
  console.log('  [PASS] Test 3G: POST /remove-node successfully removed node from pool and disk');

  // ------------------------------------------------------------------
  // CLEANUP
  // ------------------------------------------------------------------
  await relay.stop();
  if (fs.existsSync(tempConfigPath)) {
    fs.unlinkSync(tempConfigPath);
  }

  console.log('\n====================================================');
  console.log('  ALL R6.9G.10.3 AUDIT REMEDIATION TESTS PASSED 100% ');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('[TEST_FAILURE]', err);
  process.exit(1);
});
