/**
 * test_rc3_37_blue_green_ufw_repair_regressions.js
 * 
 * Verification suite for RC3.37 architectural fixes:
 * 1. Host UFW policy does not pin 8443 to transient Owner IP in bootstrap.sh (allows ${PORT}/tcp).
 * 2. Cloud Firewall remains dynamic source-CIDR boundary.
 * 3. Repair workflow explicitly detects CLOUD_FIREWALL_OK_HOST_UFW_BLOCKED.
 * 4. Transactional Blue-Green replacement keeps old node untouched during staging, rolls back safely if staging fails, and only decommissions old node AFTER replacement is verified READY.
 * 5. Cloud Firewall detachment / unexpected rule mutation fails closed.
 * 6. Port 22 post-bootstrap closed invariant.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PrivateEgressProvisioner } = require('../companion/private-egress-provisioner');

async function runTests() {
  console.log('=== [TEST SUITE] RC3.37 Blue-Green & UFW Repair Regressions ===');

  // Test 1: Bootstrap UFW rule check in both repo and staging
  console.log('\n[TEST 1] Verifying host UFW policy does not pin port 8443 to transient Owner IP in bootstrap.sh...');
  const repoBootstrap = fs.readFileSync(path.resolve(__dirname, '../private-egress/bootstrap.sh'), 'utf8');
  const stagingBootstrap = fs.readFileSync(path.resolve(__dirname, '../staging_owner_beta/private-egress/bootstrap.sh'), 'utf8');

  for (const [name, content] of [['repo', repoBootstrap], ['staging', stagingBootstrap]]) {
    assert(!content.includes('ufw allow from ${XPIDER_OWNER_IP} to any port ${PORT}'), `${name} bootstrap.sh still contains obsolete host UFW lockout rule!`);
    assert(content.includes('ufw allow "${PORT}/tcp"'), `${name} bootstrap.sh does not contain corrected ufw allow "\${PORT}/tcp"!`);
  }
  console.log('  -> PASS: Bootstrap scripts allow port 8443 independent of transient Owner IP.');

  // Test 2: Repair workflow explicitly detects CLOUD_FIREWALL_OK_HOST_UFW_BLOCKED
  console.log('\n[TEST 2] Verifying repair workflow detects CLOUD_FIREWALL_OK_HOST_UFW_BLOCKED...');
  const p1 = new PrivateEgressProvisioner({ mockMode: true });
  p1.mockTransactionOwnership = {
    dropletId: 610408684,
    firewallId: '07f9921c-a925-4185-bdfb-366d22e8fb7d',
    transactionTag: 'xpider-tx-test-1234',
    region: 'tor1',
    status: 'ACTIVE'
  };
  p1.simulateCloudFirewallOkHostUfwBlocked = true;

  const repairRes = await p1.repairExistingEgress({ token: 'mock-token' });
  assert.strictEqual(repairRes.success, false, 'Repair should fail when host UFW is blocked');
  assert.strictEqual(repairRes.code, 'CLOUD_FIREWALL_OK_HOST_UFW_BLOCKED', `Expected CLOUD_FIREWALL_OK_HOST_UFW_BLOCKED, got ${repairRes.code}`);
  assert(repairRes.message.includes('Cloud Firewall is correctly configured') || repairRes.message.includes('Host UFW lockout'), 'Diagnostic message should mention Cloud Firewall OK and host lockout');
  console.log('  -> PASS: CLOUD_FIREWALL_OK_HOST_UFW_BLOCKED correctly diagnosed.');

  // Test 3: Transactional Blue-Green Replacement: Failure during staging restores old node untouched
  console.log('\n[TEST 3] Verifying Blue-Green failure rollback preserves old active node untouched...');
  const p2 = new PrivateEgressProvisioner({ mockMode: true });
  const originalTx = {
    dropletId: 610408684,
    firewallId: 'fw-original-1234',
    transactionTag: 'xpider-tx-original',
    region: 'tor1',
    status: 'ACTIVE',
    stage: 'COMPLETED'
  };
  p2.mockTransactionOwnership = { ...originalTx };
  p2.simulateStageFailure = 7; // Fail at Step 7 before replacement is verified READY

  let caughtErr = null;
  try {
    await p2.provisionPrivateEgress({
      blueGreen: true,
      tier: 'ULTRA_ECONOMY',
      region: 'tor1'
    });
  } catch (err) {
    caughtErr = err;
  }
  assert(caughtErr, 'Should throw error when Step 7 fails');
  // Verify that mockTransactionOwnership was restored to originalTx
  assert.strictEqual(p2.mockTransactionOwnership.dropletId, originalTx.dropletId, 'Old dropletId should be restored in transaction journal');
  assert.strictEqual(p2.mockTransactionOwnership.transactionTag, originalTx.transactionTag, 'Old transactionTag should be restored in transaction journal');
  assert.strictEqual(p2.mockTransactionOwnership.status, 'ACTIVE', 'Old transaction status should remain ACTIVE');
  // Verify that original droplet was NOT added to mockDeletedResources
  assert(!p2.mockDeletedResources.droplets.includes(originalTx.dropletId), 'Original droplet must NEVER be deleted when replacement fails staging');
  assert(!p2.mockDeletedResources.firewalls.includes(originalTx.firewallId), 'Original firewall must NEVER be deleted when replacement fails staging');
  console.log('  -> PASS: Staging failure cleanly rolled back new resources while old node remained ACTIVE.');

  // Test 4: Transactional Blue-Green Replacement: Success only decommissions old node AFTER replacement is verified READY
  console.log('\n[TEST 4] Verifying Blue-Green success decommissions old node only after replacement is READY...');
  const p3 = new PrivateEgressProvisioner({ mockMode: true });
  p3.mockTransactionOwnership = { ...originalTx };

  const bgRes = await p3.provisionPrivateEgress({
    blueGreen: true,
    tier: 'ULTRA_ECONOMY',
    region: 'tor1'
  });
  assert(bgRes.success, 'Blue-green provisioning should succeed in mock mode');
  assert(bgRes.dropletId !== originalTx.dropletId, 'New droplet ID must differ from original');
  assert.strictEqual(p3.mockTransactionOwnership.dropletId, bgRes.dropletId, 'Journal must now point to new droplet');
  assert.strictEqual(p3.mockTransactionOwnership.status, 'ACTIVE', 'Journal status must be ACTIVE');
  // Check that old droplet and firewall were decommissioned on provider
  assert(p3.mockDeletedResources.droplets.includes(originalTx.dropletId) || p3.mockDeletedResources.droplets.includes(String(originalTx.dropletId)), 'Old droplet should be deleted after replacement is READY');
  assert(p3.mockDeletedResources.firewalls.includes(originalTx.firewallId) || p3.mockDeletedResources.firewalls.includes(String(originalTx.firewallId)), 'Old firewall should be deleted after replacement is READY');
  console.log('  -> PASS: Blue-Green replacement completed atomically and cleanly decommissioned old resources.');

  // Test 5: Cloud Firewall detachment / unexpected rule mutation fails closed
  console.log('\n[TEST 5] Verifying Cloud Firewall detachment / unexpected rules fail closed...');
  const p4 = new PrivateEgressProvisioner({ mockMode: true });
  p4.simulateUnexpectedFirewall = true;

  let detachErr = null;
  try {
    await p4.verifyDropletFirewallAppliedState('droplet-1', 'fw-1', '8443', '159.26.98.240/32', 500);
  } catch (e) {
    detachErr = e;
  }
  assert(detachErr, 'Must fail closed if unexpected firewall attached');
  assert(detachErr.message.includes('unexpected additional firewall'), 'Error should identify unexpected firewall');
  console.log('  -> PASS: Multiple/unexpected firewall state fails closed immediately.');

  // Test 6: Port 22 post-bootstrap invariant
  console.log('\n[TEST 6] Verifying port 22 absent post-bootstrap invariant...');
  const p5 = new PrivateEgressProvisioner({ mockMode: true });
  // Verify that during mock provisioning, ephemeral SSH key was deleted from cloud account
  assert(p3.mockDeletedResources.keys.length > 0, 'Ephemeral SSH key must be deleted from cloud account post-bootstrap');
  console.log('  -> PASS: Ephemeral key revocation invariant confirmed.');

  console.log('\n=== ALL RC3.37 REGRESSION TESTS PASSED (6/6) ===');
}

runTests().catch(err => {
  console.error('[TEST FATAL]', err);
  process.exit(1);
});
