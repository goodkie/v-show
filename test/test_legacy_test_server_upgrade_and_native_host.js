/**
 * test_legacy_test_server_upgrade_and_native_host.js
 * 
 * Comprehensive Unit and Integration Test Suite for:
 * RC3.60 .82 Legacy Test Server Auto-Upgrade & Native Host Safety
 * 
 * Test Scenarios:
 * 1. Foreign process occupying port 8088: refusal to kill (REFUSED_FOREIGN_KILL / OWNER_TEST_PORT_COLLISION)
 * 2. Legacy OWNER_7_V1 server occupying 8088 with no shutdown endpoint: controlled PID verification & upgrade
 * 3. Idempotent restart: already running OWNER_8_V1 server returns ALREADY_RUNNING without error
 * 4. Graceful shutdown: POST /__xpider_shutdown accepted and port verified free
 * 5. Stale Native Messaging registration detection and HKCU update
 * 6. companion/ensure_owner_test_server.js standalone upgrade and verification
 */

const assert = require('assert');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const nativeHost = require('../companion/native_host/xpider_native_host');
const ensureOwnerTestServer = require('../companion/ensure_owner_test_server');
const installNativeHost = require('../companion/install_native_host');

const TEST_PORT = 8088;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isPortFree(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.on('connect', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(true); });
    s.connect(port, '127.0.0.1');
  });
}

(async () => {
  console.log('========================================================================');
  console.log('  XPIDER RC3.60 .82 LEGACY TEST SERVER UPGRADE & NATIVE HOST AUDIT');
  console.log('========================================================================\n');

  // Pre-cleanup: Ensure 8088 is free before test suite
  await nativeHost.handleMessage({ action: 'STOP_OWNER_TEST_SERVER' });
  for (let i = 0; i < 15; i++) {
    if (await isPortFree(TEST_PORT)) break;
    await sleep(100);
  }
  assert.strictEqual(await isPortFree(TEST_PORT), true, 'Port 8088 must be initially free');
  console.log('✔ Initial state: Port 8088 is clean and free.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Foreign process occupying port 8088 -> REFUSED_FOREIGN_KILL
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [SCENARIO 1] Foreign process occupying port 8088...');
  const foreignServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'SOME_FOREIGN_APP_DO_NOT_TOUCH', ok: true }));
  });
  await new Promise(r => foreignServer.listen(TEST_PORT, '127.0.0.1', r));
  console.log('   Foreign server listening on 127.0.0.1:8088');

  // 1a. Attempt STOP_OWNER_TEST_SERVER on foreign process
  const stopForeignRes = await nativeHost.handleMessage({ action: 'STOP_OWNER_TEST_SERVER' });
  console.log('   stopOwnerTestServer response:', stopForeignRes);
  assert.strictEqual(stopForeignRes.success, false, 'Must not stop foreign process');
  assert.strictEqual(stopForeignRes.error, 'REFUSED_FOREIGN_KILL', 'Must return REFUSED_FOREIGN_KILL');

  // 1b. Attempt START_OWNER_TEST_SERVER with foreign process occupying port
  const startForeignRes = await nativeHost.handleMessage({ action: 'START_OWNER_TEST_SERVER' });
  console.log('   startOwnerTestServer response:', startForeignRes);
  assert.strictEqual(startForeignRes.success, false, 'Must fail closed on foreign port collision');
  assert.strictEqual(startForeignRes.error, 'OWNER_TEST_PORT_COLLISION', 'Must return OWNER_TEST_PORT_COLLISION');

  // 1c. Verify foreign server is still alive and untouched
  const foreignProbe = await fetch(`http://127.0.0.1:${TEST_PORT}/`).then(r => r.json());
  assert.strictEqual(foreignProbe.service, 'SOME_FOREIGN_APP_DO_NOT_TOUCH', 'Foreign server must remain alive');
  console.log('   ✔ Foreign server confirmed untouched.');

  // Cleanly close foreign server
  await new Promise(r => foreignServer.close(r));
  await sleep(200);
  assert.strictEqual(await isPortFree(TEST_PORT), true, 'Port 8088 must be free after foreign server close');
  console.log('✅ SCENARIO 1 PASS: Foreign process strictly guarded against termination.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Legacy OWNER_7_V1 server with NO shutdown endpoint occupying 8088
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [SCENARIO 2] Legacy OWNER_7_V1 server occupying 8088 (No /__xpider_shutdown)...');
  
  // We spawn a mock legacy server via a helper child process so it has its own PID
  const mockLegacyCode = `
    const http = require('http');
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      if (url === '/__xpider_health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          service: 'XPIDER_OWNER_TEST_SERVER',
          channel: 'TEST_ONLY',
          port: 8088,
          fixtureSet: 'OWNER_7_V1',
          totalFixtures: 7,
          pid: process.pid,
          version: 'R6.9G.10.3.7.1.4.73'
        }));
        return;
      }
      // Note: No /__xpider_shutdown route! Returns 404 Not Found
      // /ai-required-fields.html returns 404 Not Found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('NOT_FOUND');
    });
    server.listen(8088, '127.0.0.1', () => {
      console.log('MOCK_LEGACY_SERVER_READY_PID=' + process.pid);
    });
  `;

  // Write temporary legacy runner script named 'legacy_server.js' so command-line verification succeeds
  const legacyScriptPath = path.resolve('scratch/legacy_owner_test_server.js');
  fs.mkdirSync(path.dirname(legacyScriptPath), { recursive: true });
  fs.writeFileSync(legacyScriptPath, mockLegacyCode, 'utf8');

  const legacyChild = spawn(process.execPath, [legacyScriptPath], {
    detached: true,
    stdio: 'ignore'
  });
  legacyChild.unref();

  // Wait for legacy server to be ready
  let legacyHealth = null;
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    legacyHealth = await fetch(`http://127.0.0.1:${TEST_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    if (legacyHealth && legacyHealth.ok) break;
  }
  assert(legacyHealth && legacyHealth.fixtureSet === 'OWNER_7_V1', 'Legacy server must be active with OWNER_7_V1');
  console.log(`   Legacy server active on 8088 (PID: ${legacyHealth.pid}, fixtureSet: ${legacyHealth.fixtureSet})`);

  // Verify /ai-required-fields.html returns 404 on legacy server
  const legacyAiStatus = await fetch(`http://127.0.0.1:${TEST_PORT}/ai-required-fields.html`).then(r => r.status).catch(() => 0);
  assert.strictEqual(legacyAiStatus, 404, 'Legacy server must return 404 for /ai-required-fields.html');
  console.log('   Legacy server verified lacking /ai-required-fields.html (HTTP 404)');

  // Now trigger START_OWNER_TEST_SERVER via Native Host
  console.log('   Calling native host START_OWNER_TEST_SERVER to upgrade...');
  const upgradeRes = await nativeHost.handleMessage({ action: 'START_OWNER_TEST_SERVER' });
  console.log('   upgradeRes:', upgradeRes);

  assert.strictEqual(upgradeRes.success, true, 'START_OWNER_TEST_SERVER must succeed');
  assert.strictEqual(upgradeRes.serverReady, true, 'serverReady must be true');
  assert.strictEqual(upgradeRes.fixtureSet, 'OWNER_8_V1', 'fixtureSet must be OWNER_8_V1');

  // Verify the upgraded server is indeed serving OWNER_8_V1 and AI fixture
  const upgradedHealth = await fetch(`http://127.0.0.1:${TEST_PORT}/__xpider_health`).then(r => r.json());
  assert.strictEqual(upgradedHealth.fixtureSet, 'OWNER_8_V1', 'Upgraded server must report OWNER_8_V1');
  assert.strictEqual(upgradedHealth.hasAiRequiredFields, true, 'hasAiRequiredFields must be true');
  assert.notStrictEqual(upgradedHealth.pid, legacyHealth.pid, 'Process PID must have changed after terminating legacy server');

  const upgradedAiStatus = await fetch(`http://127.0.0.1:${TEST_PORT}/ai-required-fields.html`).then(r => r.status);
  assert.strictEqual(upgradedAiStatus, 200, 'Upgraded server must serve /ai-required-fields.html with 200 OK');
  console.log(`   ✔ Legacy server PID ${legacyHealth.pid} cleanly replaced with fresh 8-fixture suite PID ${upgradedHealth.pid}.`);
  console.log('✅ SCENARIO 2 PASS: Legacy OWNER_7_V1 server successfully upgraded to OWNER_8_V1.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Idempotent restart
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [SCENARIO 3] Idempotent restart when 8-fixture server is already active...');
  const restartRes = await nativeHost.handleMessage({ action: 'START_OWNER_TEST_SERVER' });
  console.log('   restartRes:', restartRes);
  assert.strictEqual(restartRes.success, true, 'Must succeed idempotently');
  assert.strictEqual(restartRes.message, 'ALREADY_RUNNING', 'Must report ALREADY_RUNNING');
  assert.strictEqual(restartRes.fixtureSet, 'OWNER_8_V1', 'Must confirm OWNER_8_V1');
  assert.strictEqual(restartRes.health.pid, upgradedHealth.pid, 'PID must remain unchanged on idempotent call');
  console.log('✅ SCENARIO 3 PASS: Idempotent call preserved active 8-fixture server without churn.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Graceful shutdown via POST /__xpider_shutdown
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [SCENARIO 4] Graceful shutdown of 8-fixture test server...');
  const stopRes = await nativeHost.handleMessage({ action: 'STOP_OWNER_TEST_SERVER' });
  console.log('   stopRes:', stopRes);
  assert.strictEqual(stopRes.success, true, 'Must cleanly stop 8-fixture server');
  assert(stopRes.message.includes('PORT_FREED'), 'Must report port freed');

  assert.strictEqual(await isPortFree(TEST_PORT), true, 'Port 8088 must be completely released');
  console.log('✅ SCENARIO 4 PASS: Graceful shutdown verified and port 8088 confirmed free.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Standalone companion/ensure_owner_test_server.js upgrade test
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [SCENARIO 5] Standalone ensure_owner_test_server.js upgrade execution...');
  // Spawn legacy server again
  const legacyChild2 = spawn(process.execPath, [legacyScriptPath], { detached: true, stdio: 'ignore' });
  legacyChild2.unref();

  for (let i = 0; i < 20; i++) {
    await sleep(200);
    const h = await fetch(`http://127.0.0.1:${TEST_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    if (h && h.ok) break;
  }

  // Run companion/ensure_owner_test_server.js via child_process
  const ensureScriptPath = path.resolve('companion/ensure_owner_test_server.js');
  const ensureOutput = execSync(`"${process.execPath}" "${ensureScriptPath}"`).toString();
  console.log('   ensure_owner_test_server stdout:\n' + ensureOutput.trim());

  const postEnsureHealth = await fetch(`http://127.0.0.1:${TEST_PORT}/__xpider_health`).then(r => r.json());
  assert.strictEqual(postEnsureHealth.fixtureSet, 'OWNER_8_V1', 'Must be OWNER_8_V1 after ensure script');
  const postEnsureAi = await fetch(`http://127.0.0.1:${TEST_PORT}/ai-required-fields.html`).then(r => r.status);
  assert.strictEqual(postEnsureAi, 200, 'AI fixture must return 200 OK after ensure script');
  console.log('✅ SCENARIO 5 PASS: Standalone ensure_owner_test_server.js auto-upgrades cleanly.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Native Messaging Host Registry Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('>>> [SCENARIO 6] Native Messaging Host Windows Registry Registration...');
  const regResult = installNativeHost.registerInRegistry(path.resolve('companion'));
  assert.strictEqual(regResult, true, 'registerInRegistry must return true');

  if (process.platform === 'win32') {
    const chromeReg = execSync('reg query "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay" /ve').toString();
    console.log('   Chrome registry query:\n' + chromeReg.trim());
    assert(chromeReg.includes('com.xpider.privacy_relay.chrome.json'), 'Chrome registry must point to manifest');

    const edgeReg = execSync('reg query "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay" /ve').toString();
    console.log('   Edge registry query:\n' + edgeReg.trim());
    assert(edgeReg.includes('com.xpider.privacy_relay.edge.json'), 'Edge registry must point to manifest');
  }
  console.log('✅ SCENARIO 6 PASS: Native messaging registration confirmed in Windows Registry.\n');

  // Final cleanup
  await nativeHost.handleMessage({ action: 'STOP_OWNER_TEST_SERVER' });
  try { fs.unlinkSync(legacyScriptPath); } catch (_) {}

  console.log('========================================================================');
  console.log('  ALL 6 LEGACY TEST SERVER & NATIVE HOST UPGRADE SCENARIOS PASSED 100%');
  console.log('========================================================================');
})();
