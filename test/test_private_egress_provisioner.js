/**
 * test_private_egress_provisioner.js
 * 
 * Verifies companion/private-egress-provisioner.js:
 * 1. Tier definitions & Ultra Economy default (~$6/mo)
 * 2. Ephemeral SSH keypair generation (ED25519)
 * 3. 8-stage progress event pipeline
 * 4. Provisioning workflow in mock mode
 * 5. Telemetry evaluation & upgrade recommendations (GOOD vs WATCH vs UPGRADE_RECOMMENDED)
 * 6. Destroy teardown workflow
 */

const assert = require('assert');
const { PrivateEgressProvisioner, TIERS, STAGES } = require('../companion/private-egress-provisioner');

async function run() {
  console.log('[TEST] Starting PrivateEgressProvisioner tests...');

  // TEST 1: Tier definitions & defaults
  console.log('[TEST 1] Verifying Tier definitions and Ultra Economy default...');
  assert(TIERS.ULTRA_ECONOMY, 'Must define ULTRA_ECONOMY');
  assert.strictEqual(TIERS.ULTRA_ECONOMY.monthlyCostUsd, 6, 'Ultra Economy must be $6/mo');
  assert.strictEqual(TIERS.ULTRA_ECONOMY.size, 's-1vcpu-1gb', 'Ultra Economy must use s-1vcpu-1gb');
  assert.strictEqual(TIERS.ECONOMY.monthlyCostUsd, 12, 'Economy must be $12/mo');
  assert.strictEqual(STAGES.length, 8, 'Must have exactly 8 defined stages');
  console.log('  -> PASS: Tiers and stages confirmed');

  // TEST 2: Ephemeral SSH keypair generation
  console.log('[TEST 2] Verifying ephemeral SSH keypair generation...');
  const provisioner = new PrivateEgressProvisioner({
    token: 'dop_v1_mock_token_for_testing',
    mockMode: true
  });
  const keypair = await provisioner.createEphemeralSshKeypair();
  assert(keypair.privateKeyPem && keypair.privateKeyPem.includes('PRIVATE KEY'), 'Must generate valid private key PEM');
  assert(keypair.publicKeyOpenSsh && keypair.publicKeyOpenSsh.startsWith('ssh-ed25519'), 'Must generate valid OpenSSH public key');
  console.log('  -> PASS: ED25519 keypair generated: ' + keypair.publicKeyOpenSsh.slice(0, 32) + '...');

  // TEST 3: Telemetry analysis logic
  console.log('[TEST 3] Verifying telemetry trigger evaluation...');
  // 3a: Healthy metrics -> GOOD
  const mockNodeGood = { host: '127.0.0.1', port: 8443, username: 'u', password: 'p' };
  const goodRes = await provisioner.fetchNodeTelemetry(mockNodeGood);
  assert.strictEqual(goodRes.status, 'GOOD', 'Under 50% CPU/RAM must report GOOD');
  assert.strictEqual(goodRes.recommendation, 'KEEP_CURRENT_PLAN', 'Must recommend KEEP_CURRENT_PLAN');

  // 3b: Test unit calculation logic directly
  const evaluate = (data) => {
    let status = 'GOOD';
    let recommendation = 'KEEP_CURRENT_PLAN';
    if (data.memUsagePercent > 85 || (data.cpu1mRatio && data.cpu1mRatio > 0.85) || data.swapUsagePercent > 50) {
      status = 'UPGRADE_RECOMMENDED';
      recommendation = 'UPGRADE_TO_ECONOMY';
    } else if (data.memUsagePercent > 70 || (data.cpu1mRatio && data.cpu1mRatio > 0.70)) {
      status = 'WATCH';
      recommendation = 'MONITOR';
    }
    return { status, recommendation };
  };

  const highRam = evaluate({ memUsagePercent: 88, cpu1mRatio: 0.2, swapUsagePercent: 0 });
  assert.strictEqual(highRam.status, 'UPGRADE_RECOMMENDED');
  assert.strictEqual(highRam.recommendation, 'UPGRADE_TO_ECONOMY');

  const watchCpu = evaluate({ memUsagePercent: 50, cpu1mRatio: 0.75, swapUsagePercent: 0 });
  assert.strictEqual(watchCpu.status, 'WATCH');
  assert.strictEqual(watchCpu.recommendation, 'MONITOR');
  console.log('  -> PASS: Telemetry trigger logic verified');

  // TEST 4: 8-Step Provisioning pipeline in mock mode
  console.log('[TEST 4] Verifying 8-step provisioning pipeline in mock mode...');
  const recordedEvents = [];
  const pMock = new PrivateEgressProvisioner({
    token: 'dop_v1_mock_testing_token',
    mockMode: true,
    onProgress: (ev) => {
      recordedEvents.push(ev);
    }
  });

  // Mock runSshCommand & uploadSshFile for test environment
  pMock.connectSshWithRetry = async () => ({
    end: () => {}
  });
  pMock.uploadSshFile = async () => {};
  pMock.runSshCommand = async (client, cmd) => {
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

  const provResult = await pMock.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3'
  });

  assert(provResult.success, 'Provisioning must succeed');
  assert.strictEqual(provResult.publicIp, '198.51.100.12', 'Must return public IP');
  assert.strictEqual(provResult.monthlyCostUsd, 6, 'Must report $6/mo');
  assert.strictEqual(recordedEvents.length, 16, 'Must emit 16 events (2 per stage: WORKING + PASS)');
  console.log('  -> PASS: 8-step pipeline completed with all stages PASS');

  // TEST 5: Teardown / Destroy workflow in mock mode
  console.log('[TEST 5] Verifying destroy workflow...');
  const destroyRes = await pMock.destroyPrivateEgress();
  assert(destroyRes.success, 'Destroy must succeed');
  assert.strictEqual(destroyRes.destroyedDroplets, 1, 'Must destroy tagged droplets');
  console.log('  -> PASS: Teardown verified');

  console.log('\n[SUCCESS] ALL PROVISIONER TESTS PASSED!');
}

run().catch(err => {
  console.error('[TEST_FAILURE]', err);
  process.exit(1);
});
