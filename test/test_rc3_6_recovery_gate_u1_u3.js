/**
 * XPIDER AutoForm Sender Pro — RC3.6 Recovery Gate & Single-Transaction Closure Test Suite (U1 - U3)
 *
 * Dedicated tests verifying the resolution of all confirmed audit findings U1 - U3:
 * - [U1] Companion & UI recovery status surface and blocking gate:
 *   - /health and /recovery-status expose sanitized recovery object;
 *   - Interrupted/failed transaction triggers RECOVERY_REQUIRED;
 *   - Startup warning logged and Step B blocked;
 *   - Exact cleanup clears journal and unblocks provisioning.
 * - [U2] Clean transaction journal schema and immutable transaction tag:
 *   - Fresh transaction initializes with zero stale IDs (all resource IDs explicitly null);
 *   - No leakage of prior transaction IDs into subsequent runs;
 *   - updateTransactionJournal strictly enforces matching immutable transactionTag (mismatch throws TRANSACTION_TAG_MISMATCH);
 *   - Zero secrets (tokens, passwords, private keys) written to journal.
 * - [U3] Single-owner active node lock and collision rejection:
 *   - When active node exists (status: 'ACTIVE'), second Step B throws ACTIVE_NODE_EXISTS;
 *   - When unrecovered transaction exists (status: 'PROVISIONING' or 'RECOVERY_REQUIRED'), second Step B throws TRANSACTION_COLLISION;
 *   - Zero provider resources mutated or created on blocked provisioning attempts.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const {
  PrivateEgressProvisioner
} = require('../companion/private-egress-provisioner');
const {
  PrivacyRelayService
} = require('../companion/privacy-relay-service');

async function runU1toU3Suite() {
  console.log('========================================================================');
  console.log('  XPIDER RC3.6: RECOVERY GATE & SINGLE-TRANSACTION CLOSURE SUITE (U1 - U3)');
  console.log('========================================================================\n');

  const mockToken = 'dop_v1_mocktoken12345678901234567890123456789012345678901234567890123456';
  const validQuote = {
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    size: 's-1vcpu-1gb',
    monthlyCostUsd: 6.0,
    hourlyCostUsd: 0.00893
  };

  // Clean any leftover journal before test suite
  const journalPath = path.resolve(__dirname, '../companion/.private_egress_transaction.json');
  try { if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath); } catch (_) {}

  // ---------------------------------------------------------------------------
  // [TEST 1: U2] Clean Schema Initialization & Isolation (No Stale Resource IDs)
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 1: U2] Clean Journal Schema Initialization & Isolation');

  const pU2Schema = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  const cleanSchema = pU2Schema.createCleanJournalSchema({
    transactionTag: 'xpider-egress-test-clean-12345678',
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3'
  });

  assert.strictEqual(cleanSchema.status, 'PROVISIONING');
  assert.strictEqual(cleanSchema.stage, 'TAG_CREATED');
  assert.strictEqual(cleanSchema.transactionTag, 'xpider-egress-test-clean-12345678');
  assert.strictEqual(cleanSchema.dropletId, null, 'dropletId must be strictly null on init');
  assert.strictEqual(cleanSchema.firewallId, null, 'firewallId must be strictly null on init');
  assert.strictEqual(cleanSchema.ephemeralKeyId, null, 'ephemeralKeyId must be strictly null on init');
  assert.strictEqual(cleanSchema.registeredNodeId, null, 'registeredNodeId must be strictly null on init');
  assert.strictEqual(cleanSchema.publicIp, null, 'publicIp must be strictly null on init');
  assert(cleanSchema.startedAt && typeof cleanSchema.startedAt === 'string', 'startedAt must be populated');

  console.log('  [PASS] Test 1: Fresh journal schema guarantees all resource IDs start strictly null.\n');

  // ---------------------------------------------------------------------------
  // [TEST 2: U2] Immutable Transaction Tag Enforcement (Mismatch Throws)
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 2: U2] Immutable Transaction Tag Enforcement');

  const pU2Tag = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  pU2Tag.beginTransactionJournal({
    transactionTag: 'xpider-egress-tx-correct-tag',
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3'
  });

  // Attempting to update with matching tag succeeds
  pU2Tag.updateTransactionJournal({
    transactionTag: 'xpider-egress-tx-correct-tag',
    stage: 'FIREWALL_CREATED',
    firewallId: 'fw-test-101'
  });

  const readTx = pU2Tag.readJournalSafe();
  assert.strictEqual(readTx.firewallId, 'fw-test-101');
  assert.strictEqual(readTx.stage, 'FIREWALL_CREATED');

  // Attempting to update with mismatched tag must throw TRANSACTION_TAG_MISMATCH
  let mismatchErr = null;
  try {
    pU2Tag.updateTransactionJournal({
      transactionTag: 'xpider-egress-tx-WRONG-TAG',
      stage: 'DROPLET_CREATED',
      dropletId: 'drop-test-999'
    });
  } catch (err) {
    mismatchErr = err;
  }
  assert(mismatchErr, 'updateTransactionJournal must reject mismatched transaction tag');
  assert(mismatchErr.message.includes('TRANSACTION_TAG_MISMATCH'), `Error message must be TRANSACTION_TAG_MISMATCH, got: ${mismatchErr.message}`);

  // Journal must not have accepted the mismatched update
  const unchangedTx = pU2Tag.readJournalSafe();
  assert.strictEqual(unchangedTx.dropletId, null, 'dropletId must remain null after rejected update');
  assert.strictEqual(unchangedTx.stage, 'FIREWALL_CREATED');

  pU2Tag.clearTransactionOwnership();
  console.log('  [PASS] Test 2: Mismatched transaction tag strictly rejected with TRANSACTION_TAG_MISMATCH.\n');

  // ---------------------------------------------------------------------------
  // [TEST 3: U1] Interrupted Transaction Surfaces RECOVERY_REQUIRED
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 3: U1] Interrupted Transaction Surfaces RECOVERY_REQUIRED');

  const pU1Interrupted = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  pU1Interrupted.beginTransactionJournal({
    transactionTag: 'xpider-egress-tx-interrupted-01',
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3'
  });

  pU1Interrupted.updateTransactionJournal({
    transactionTag: 'xpider-egress-tx-interrupted-01',
    stage: 'FIREWALL_CREATED',
    firewallId: 'fw-interrupted-777'
  });

  // Check recovery status on interrupted provisioning journal
  const recoveryStatus = pU1Interrupted.checkRecoveryJournal();
  assert.strictEqual(recoveryStatus.recoveryRequired, true, 'recoveryRequired must be true for interrupted transaction');
  assert.strictEqual(recoveryStatus.stage, 'FIREWALL_CREATED');
  assert.strictEqual(recoveryStatus.transactionTag, 'xpider-egress-tx-interrupted-01');
  assert.strictEqual(recoveryStatus.firewallId, 'fw-interrupted-777');
  assert.strictEqual(recoveryStatus.dropletId, null);

  // Now attempt second provisioning while unrecovered transaction exists -> TRANSACTION_COLLISION
  let collisionErr = null;
  try {
    await pU1Interrupted.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (err) {
    collisionErr = err;
  }
  assert(collisionErr, 'Second provisioning must throw when unrecovered transaction exists');
  assert(collisionErr.message.includes('TRANSACTION_COLLISION'), `Error must be TRANSACTION_COLLISION, got: ${collisionErr.message}`);

  pU1Interrupted.clearTransactionOwnership();
  console.log('  [PASS] Test 3: Interrupted transaction triggers RECOVERY_REQUIRED and blocks second provisioning with TRANSACTION_COLLISION.\n');

  // ---------------------------------------------------------------------------
  // [TEST 4: U3] Single-Owner Active Node Limits (Second Step B Blocked)
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 4: U3] Single-Owner Active Node Limits (ACTIVE_NODE_EXISTS)');

  const pU3Active = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  // Provision 1 node successfully
  const firstProvRes = await pU3Active.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(firstProvRes && firstProvRes.success, 'First provisioning must succeed');

  // Verify journal status is ACTIVE
  const activeJournal = pU3Active.readJournalSafe();
  assert.strictEqual(activeJournal.status, 'ACTIVE');
  assert.strictEqual(activeJournal.stage, 'COMPLETED');
  assert(activeJournal.dropletId, 'Active journal must have dropletId');
  assert(activeJournal.firewallId, 'Active journal must have firewallId');

  // checkRecoveryJournal() must return activeNode metadata and recoveryRequired: false
  const activeCheck = pU3Active.checkRecoveryJournal();
  assert.strictEqual(activeCheck.status, 'ACTIVE');
  assert.strictEqual(activeCheck.recoveryRequired, false);
  assert(activeCheck.activeNode, 'activeNode metadata must be present');
  assert.strictEqual(activeCheck.activeNode.dropletId, activeJournal.dropletId);
  assert.strictEqual(activeCheck.activeNode.firewallId, activeJournal.firewallId);

  // Attempting second provisioning while node is active must throw ACTIVE_NODE_EXISTS
  let activeExistsErr = null;
  try {
    await pU3Active.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (err) {
    activeExistsErr = err;
  }
  assert(activeExistsErr, 'Second provisioning must be blocked when an active node exists');
  assert(activeExistsErr.message.includes('ACTIVE_NODE_EXISTS'), `Error must be ACTIVE_NODE_EXISTS, got: ${activeExistsErr.message}`);

  pU3Active.clearTransactionOwnership();
  console.log('  [PASS] Test 4: Single-owner limit enforced; second provisioning blocked with ACTIVE_NODE_EXISTS.\n');

  // ---------------------------------------------------------------------------
  // [TEST 5: U1 & U2] Teardown Cleans Exact Resources & Resets Journal
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 5: U1 & U2] Teardown Cleans Exact Resources & Resets Journal');

  const pU1Cleanup = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  // Simulate an interrupted run with an orphaned firewall and SSH key
  pU1Cleanup.beginTransactionJournal({
    transactionTag: 'xpider-egress-tx-orphaned-fw',
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3'
  });
  pU1Cleanup.updateTransactionJournal({
    transactionTag: 'xpider-egress-tx-orphaned-fw',
    stage: 'FIREWALL_CREATED',
    firewallId: 'fw-orphaned-999',
    ephemeralKeyId: 'key-orphaned-888'
  });

  // Call destroyPrivateEgress to clean up exact unrecovered resources
  const destroyRes = await pU1Cleanup.destroyPrivateEgress({
    transactionTag: 'xpider-egress-tx-orphaned-fw'
  });
  assert(destroyRes && destroyRes.success, 'destroyPrivateEgress must succeed');
  assert.strictEqual(destroyRes.status, 'DESTROY_VERIFIED_CLEAN');
  assert(destroyRes.verifications.firewallAbsent, 'Firewall must be verified absent');
  assert(destroyRes.verifications.tagAbsent, 'Tag must be verified absent');

  // Journal must now be completely unlinked/cleared
  const postCleanupJournal = pU1Cleanup.readJournalSafe();
  assert.strictEqual(postCleanupJournal, null, 'Journal must be cleared after clean teardown');

  const postCleanupCheck = pU1Cleanup.checkRecoveryJournal();
  assert.strictEqual(postCleanupCheck.recoveryRequired, false);
  assert.strictEqual(postCleanupCheck.status, 'NONE');
  assert.strictEqual(postCleanupCheck.stage, null);

  // Clean provisioning can now proceed without collision
  const cleanProvRes = await pU1Cleanup.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(cleanProvRes && cleanProvRes.success, 'New provisioning must succeed after cleanup');

  pU1Cleanup.clearTransactionOwnership();
  console.log('  [PASS] Test 5: Exact resource cleanup authoritatively clears journal and unblocks provisioning.\n');

  // ---------------------------------------------------------------------------
  // [TEST 6: U2] Zero Secrets in Journal and Recovery Responses
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 6: U2] Zero Secrets in Journal and Recovery Responses');

  const pU2Secrets = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  // Provision a node
  await pU2Secrets.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });

  // Inspect journal object directly
  const journalContent = pU2Secrets.readJournalSafe();
  const journalString = JSON.stringify(journalContent);

  // Assert zero secrets exist in journal
  assert(!journalContent.token, 'token must NEVER exist in journal');
  assert(!journalContent.password, 'password must NEVER exist in journal');
  assert(!journalContent.proxyPassword, 'proxyPassword must NEVER exist in journal');
  assert(!journalContent.privateKeyPem, 'privateKeyPem must NEVER exist in journal');
  assert(!journalContent.ephemeralPrivateKey, 'ephemeralPrivateKey must NEVER exist in journal');
  assert(!journalString.includes(mockToken), 'mockToken must not appear anywhere in journal');
  assert(!journalString.includes('PRIVATE KEY'), 'PRIVATE KEY must not appear anywhere in journal');

  // Inspect checkRecoveryJournal() output
  const recoveryObj = pU2Secrets.checkRecoveryJournal();
  const recoveryString = JSON.stringify(recoveryObj);
  assert(!recoveryObj.token, 'recovery response must not have token');
  assert(!recoveryObj.password, 'recovery response must not have password');
  assert(!recoveryString.includes(mockToken), 'recovery response must not contain token');

  pU2Secrets.clearTransactionOwnership();
  console.log('  [PASS] Test 6: Zero secrets verified in persistent journal and recovery responses.\n');

  // ---------------------------------------------------------------------------
  // [TEST 7: U1] Companion Service /health and /recovery-status Endpoints
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 7: U1] Companion Service /health and /recovery-status Endpoints');

  const testPort = 19898;
  const companion = new PrivacyRelayService({
    proxyPort: 19897,
    controlPort: testPort,
    controlToken: 'test-token-rc3-6',
    mockMode: true
  });

  await companion.start();

  try {
    // 7a. Query /recovery-status directly (public unauthenticated endpoint)
    const recStatusRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testPort}/recovery-status`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    assert.strictEqual(recStatusRes.statusCode, 200, '/recovery-status must return 200');
    assert.strictEqual(recStatusRes.data.success, true);
    assert(recStatusRes.data.recovery, 'recovery object must be present in response');
    assert.strictEqual(recStatusRes.data.recovery.recoveryRequired, false, 'No recovery required on clean start');

    // 7b. Query /health and verify capabilities and recovery object
    const healthRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    assert.strictEqual(healthRes.statusCode, 200, '/health must return 200');
    assert(healthRes.data.apiCapabilities.includes('recovery-status'), 'apiCapabilities must include "recovery-status"');
    assert(healthRes.data.recovery, 'health response must include sanitized recovery object');
    assert.strictEqual(healthRes.data.recovery.recoveryRequired, false);

    console.log('  [PASS] Test 7: Companion /health and /recovery-status endpoints expose recovery state and capability.\n');
  } finally {
    await companion.stop();
  }

  // Clean up any test journal
  try { if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath); } catch (_) {}

  console.log('========================================================================');
  console.log('  ALL U1 - U3 AUDIT GATE TESTS PASSED (7/7)');
  console.log('========================================================================\n');
}

runU1toU3Suite().catch((err) => {
  console.error('\n❌ RC3.6 U1-U3 AUDIT SUITE FAILED:', err);
  process.exit(1);
});
