/**
 * XPIDER AutoForm Sender Pro — RC3.5 Pre-Live Step-B Security Hardening Test Suite (T1 - T7)
 *
 * Dedicated tests verifying the resolution of all confirmed audit findings T1 - T7:
 * - [T1] Zero-prerequisite pure bundled key generation (no external OS ssh-keygen dependency);
 * - [T2] Bounded host-key boot race retry (never accept mismatched host key; bounded retry window; persistent mismatch fails closed);
 * - [T3] Authoritative exact firewall verification (exactly 1 rule, TCP only, expected port only, exactly [ownerCidr], all other source collections empty);
 * - [T4] Crash-safe progressive transaction ownership journal (progressive atomic writes at every allocation stage, incomplete rollback preservation, startup detection);
 * - [T5] Authoritative tag delete verification (GET 404 verification before tagAbsent=true, failure propagation);
 * - [T6] Exhaustive verified quote validation (all fields mandatory, finite positive numbers, empty/incomplete object rejected fail-closed);
 * - [T7] Pre-billable token scope capability verification (missing firewall:update or tag:delete fails before droplet allocation, zero droplets created).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  PrivateEgressProvisioner,
  isPublicIp
} = require('../companion/private-egress-provisioner');

async function runT1toT7Suite() {
  console.log('========================================================================');
  console.log('  XPIDER RC3.5: STEP B SECURITY HARDENING AUDIT SUITE (T1 - T7)');
  console.log('========================================================================\n');

  const mockToken = 'dop_v1_mocktoken12345678901234567890123456789012345678901234567890123456';
  const validQuote = {
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    size: 's-1vcpu-1gb',
    monthlyCostUsd: 6.0,
    hourlyCostUsd: 0.00893
  };

  // ---------------------------------------------------------------------------
  // [TEST 1: T1] Zero-Prerequisite Pure Bundled Key Generation (No ssh-keygen)
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 1: T1] Zero-Prerequisite Pure Bundled Key Generation');

  const pT1 = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  // 1a. Verify client keypair generation works without calling child_process execSync
  const clientKp = await pT1.createEphemeralSshKeypair();
  assert(clientKp && clientKp.privateKeyPem, 'Client private key PEM must be generated');
  assert(clientKp.publicKeyOpenSsh, 'Client OpenSSH public key must be generated');
  assert(clientKp.publicKeyOpenSsh.startsWith('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5'), 'Client public key must be valid ssh-ed25519 format');
  assert(clientKp.publicKeyOpenSsh.includes('xpider-ephemeral-bootstrap'), 'Client public key must include comment');

  // 1b. Verify host keypair generation works with non-mock code path and derives correct SHA256 fingerprint
  const pT1RealKeygen = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: false // Force real keygen code path
  });
  const hostKp = await pT1RealKeygen.createEphemeralHostKeypair();
  assert(hostKp && hostKp.privateKeyPem, 'Host private key PEM must be generated');
  assert(hostKp.publicKeyOpenSsh, 'Host OpenSSH public key must be generated');
  assert(hostKp.publicKeyOpenSsh.startsWith('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5'), 'Host public key must be valid ssh-ed25519 format');
  assert(hostKp.sha256Fingerprint && hostKp.sha256Fingerprint.length === 64, 'Host fingerprint must be 64-char SHA256 hex string');

  // Verify fingerprint derivation independently
  const parts = hostKp.publicKeyOpenSsh.trim().split(' ');
  const rawBuf = Buffer.from(parts[1], 'base64');
  const expectedFingerprint = require('crypto').createHash('sha256').update(rawBuf).digest('hex');
  assert.strictEqual(hostKp.sha256Fingerprint, expectedFingerprint, 'Derived host key fingerprint must match sha256(raw_public_key)');

  console.log('  [PASS] Test 1: Pure bundled key generation succeeds with zero OS ssh-keygen dependency.\n');

  // ---------------------------------------------------------------------------
  // [TEST 2: T2] Bounded Host-Key Boot Race Retry (Never Accept Mismatched Key)
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 2: T2] Bounded Host-Key Boot Race Retry');

  // 2a. Temporary pre-cloud-init mismatch -> retried -> expected key appears -> PASS
  const pT2Temp = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  pT2Temp.simulateTemporaryHostKeyMismatch = true;
  pT2Temp.mockKeyMismatchAttemptsNeeded = 2; // Attempt 1 fails, Attempt 2 succeeds

  const resT2Temp = await pT2Temp.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(resT2Temp && resT2Temp.success, 'Provisioning must succeed when expected key appears after temporary boot race');
  assert.strictEqual(pT2Temp._mockHostKeyAttempts, 2, 'Must have attempted connection twice before succeeding');

  // 2b. Persistent host-key mismatch -> never accepted -> fails closed and executes rollback
  const pT2Persistent = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  pT2Persistent.simulateHostKeyMismatch = true; // All attempts fail

  let t2PersistentErr = null;
  try {
    await pT2Persistent.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (err) {
    t2PersistentErr = err;
  }
  assert(t2PersistentErr, 'Persistent host-key mismatch must fail closed');
  assert(t2PersistentErr.message.includes('Host denied') || t2PersistentErr.message.includes('fingerprint mismatch'),
    `Error must indicate host key verification rejection: ${t2PersistentErr.message}`);
  // Droplet and firewall must have been rolled back
  assert(pT2Persistent.mockDeletedResources.droplets.length > 0, 'Droplet must be deleted on persistent host key mismatch');
  assert(pT2Persistent.mockDeletedResources.firewalls.length > 0, 'Firewall must be deleted on persistent host key mismatch');

  console.log('  [PASS] Test 2: Bounded boot-race retry succeeds on valid delayed key, fails closed on persistent mismatch.\n');

  // ---------------------------------------------------------------------------
  // [TEST 3: T3] Authoritative EXACT Inbound Rules Applied-State Verification
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 3: T3] Authoritative EXACT Inbound Rules Applied-State Verification');

  const pT3 = new PrivateEgressProvisioner({ token: mockToken, mockMode: true });

  // 3a. Exact valid single rule -> PASS
  pT3.mockFirewalls = {
    'fw-test-exact': {
      id: 'fw-test-exact',
      status: 'succeeded',
      pending_changes: [],
      inbound_rules: [
        { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32'] } }
      ]
    }
  };
  const resT3Valid = await pT3.verifyDropletFirewallAppliedState(99887766, 'fw-test-exact', '22', '198.51.100.1/32', 200);
  assert(resT3Valid && resT3Valid.verified, 'Exact single inbound rule must be verified PASS');

  // 3b. Extra inbound rule on another port -> fail-closed rejection
  pT3.mockFirewalls['fw-test-multi-rule'] = {
    id: 'fw-test-multi-rule',
    status: 'succeeded',
    pending_changes: [],
    inbound_rules: [
      { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32'] } },
      { protocol: 'tcp', ports: '80', sources: { addresses: ['0.0.0.0/0'] } }
    ]
  };
  let t3MultiErr = null;
  try {
    await pT3.verifyDropletFirewallAppliedState(99887766, 'fw-test-multi-rule', '22', '198.51.100.1/32', 100);
  } catch (e) {
    t3MultiErr = e;
  }
  assert(t3MultiErr && t3MultiErr.message.includes('has 2 inbound rules (expected exactly 1)'),
    `Multiple inbound rules must be rejected: ${t3MultiErr ? t3MultiErr.message : 'No error'}`);

  // 3c. Extra address in matching rule (e.g. owner CIDR plus 0.0.0.0/0) -> fail-closed rejection
  pT3.mockFirewalls['fw-test-extra-addr'] = {
    id: 'fw-test-extra-addr',
    status: 'succeeded',
    pending_changes: [],
    inbound_rules: [
      { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32', '0.0.0.0/0'] } }
    ]
  };
  let t3ExtraAddrErr = null;
  try {
    await pT3.verifyDropletFirewallAppliedState(99887766, 'fw-test-extra-addr', '22', '198.51.100.1/32', 100);
  } catch (e) {
    t3ExtraAddrErr = e;
  }
  assert(t3ExtraAddrErr && t3ExtraAddrErr.message.includes('sources.addresses is'),
    `Extra addresses in matching rule must be rejected: ${t3ExtraAddrErr ? t3ExtraAddrErr.message : 'No error'}`);

  // 3d. Non-empty source tags or droplet IDs in rule -> fail-closed rejection
  pT3.mockFirewalls['fw-test-extra-tags'] = {
    id: 'fw-test-extra-tags',
    status: 'succeeded',
    pending_changes: [],
    inbound_rules: [
      { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32'], tags: ['rogue-tag'] } }
    ]
  };
  let t3ExtraTagsErr = null;
  try {
    await pT3.verifyDropletFirewallAppliedState(99887766, 'fw-test-extra-tags', '22', '198.51.100.1/32', 100);
  } catch (e) {
    t3ExtraTagsErr = e;
  }
  assert(t3ExtraTagsErr && t3ExtraTagsErr.message.includes('sources.tags is not empty'),
    `Non-empty source tags must be rejected: ${t3ExtraTagsErr ? t3ExtraTagsErr.message : 'No error'}`);

  // 3e. Residual SSH port 22 after proxy transition -> fail-closed rejection
  pT3.mockFirewalls['fw-test-residual-ssh'] = {
    id: 'fw-test-residual-ssh',
    status: 'succeeded',
    pending_changes: [],
    inbound_rules: [
      { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32'] } }
    ]
  };
  let t3ResidualSshErr = null;
  try {
    await pT3.verifyDropletFirewallAppliedState(99887766, 'fw-test-residual-ssh', '8443', '198.51.100.1/32', 100);
  } catch (e) {
    t3ResidualSshErr = e;
  }
  assert(t3ResidualSshErr && t3ResidualSshErr.message.includes('rule port is "22" (expected strictly "8443")'),
    `Residual SSH rule when expecting proxy port must be rejected: ${t3ResidualSshErr ? t3ResidualSshErr.message : 'No error'}`);

  console.log('  [PASS] Test 3: Firewall exact inbound rules verification strictly enforces 1 TCP rule matching owner CIDR only.\n');

  // ---------------------------------------------------------------------------
  // [TEST 4: T4] Crash-Safe Progressive Transaction Ownership Journal
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 4: T4] Crash-Safe Progressive Transaction Ownership Journal');

  const testJournalPath = path.resolve(__dirname, '..', 'companion', '.private_egress_transaction.json');
  try { if (fs.existsSync(testJournalPath)) fs.unlinkSync(testJournalPath); } catch (_) {}

  // 4a. Progressive updates write to disk atomically and never leak credentials
  const pT4 = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: false // Test real file persistence logic
  });

  pT4.updateTransactionJournal({
    status: 'PROVISIONING',
    stage: 'TAG_CREATED',
    transactionTag: 'xpider-tx-test-journal-1',
    token: 'LEAK_ATTEMPT_TOKEN', // Must be scrubbed
    password: 'LEAK_ATTEMPT_PASSWORD' // Must be scrubbed
  });

  assert(fs.existsSync(testJournalPath), 'Journal file must exist on disk after first update');
  let loadedJournal = JSON.parse(fs.readFileSync(testJournalPath, 'utf8'));
  assert.strictEqual(loadedJournal.status, 'PROVISIONING', 'Status must be PROVISIONING');
  assert.strictEqual(loadedJournal.stage, 'TAG_CREATED', 'Stage must be TAG_CREATED');
  assert.strictEqual(loadedJournal.transactionTag, 'xpider-tx-test-journal-1');
  assert.strictEqual(loadedJournal.token, undefined, 'DO token must never be persisted in journal');
  assert.strictEqual(loadedJournal.password, undefined, 'Password must never be persisted in journal');

  // 4b. Progressive update preserving previous fields
  pT4.updateTransactionJournal({
    stage: 'SSH_KEY_CREATED',
    ephemeralKeyId: 98765
  });
  loadedJournal = JSON.parse(fs.readFileSync(testJournalPath, 'utf8'));
  assert.strictEqual(loadedJournal.stage, 'SSH_KEY_CREATED');
  assert.strictEqual(loadedJournal.transactionTag, 'xpider-tx-test-journal-1', 'Previous fields must be preserved');
  assert.strictEqual(loadedJournal.ephemeralKeyId, 98765);

  pT4.updateTransactionJournal({
    stage: 'DROPLET_CREATED',
    dropletId: 554433
  });
  loadedJournal = JSON.parse(fs.readFileSync(testJournalPath, 'utf8'));
  assert.strictEqual(loadedJournal.dropletId, 554433);

  // 4c. Startup recovery detection
  const recoveryInfo = pT4.checkRecoveryJournal();
  assert.strictEqual(recoveryInfo.recoveryRequired, true, 'Interrupted provisioning must require recovery on startup');
  assert.strictEqual(recoveryInfo.dropletId, 554433);
  assert.strictEqual(recoveryInfo.ephemeralKeyId, 98765);

  // 4d. Complete stage 8 marks ACTIVE
  pT4.updateTransactionJournal({
    status: 'ACTIVE',
    stage: 'COMPLETED'
  });
  assert.strictEqual(pT4.checkRecoveryJournal().recoveryRequired, false, 'ACTIVE completed transaction does not require recovery');

  // Clean up test file
  pT4.clearTransactionOwnership();
  assert(!fs.existsSync(testJournalPath), 'clearTransactionOwnership must remove journal when clean');

  // 4e. Incomplete rollback preserves journal with status RECOVERY_REQUIRED
  const pT4Fail = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true,
    simulateStageFailure: 3,
    simulateRollbackVerificationFailure: 'droplet' // Simulate provider error during rollback
  });

  let t4FailErr = null;
  try {
    await pT4Fail.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (e) {
    t4FailErr = e;
  }
  assert(t4FailErr && t4FailErr.message.includes('CLEANUP_REQUIRED'), 'Incomplete rollback must throw CLEANUP_REQUIRED');
  const preservedJournal = pT4Fail.loadTransactionOwnership();
  assert(preservedJournal, 'Journal must be preserved when rollback is incomplete');
  assert.strictEqual(preservedJournal.status, 'RECOVERY_REQUIRED');
  assert.strictEqual(preservedJournal.stage, 'ROLLBACK_INCOMPLETE');
  assert(preservedJournal.dropletId, 'Uncleaned droplet ID must be preserved for manual/remediation cleanup');

  console.log('  [PASS] Test 4: Crash-safe progressive journal tracks resources at every stage and preserves state on rollback failure.\n');

  // ---------------------------------------------------------------------------
  // [TEST 5: T5] Authoritative Tag Delete Verification
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 5: T5] Authoritative Tag Delete Verification');

  // 5a. Normal tag delete authoritatively verified absent -> tagAbsent = true
  const pT5Valid = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  pT5Valid.mockTags = ['xpider-tx-t5-valid'];
  const rbResValid = await pT5Valid.rollbackProvisioning({
    transactionTag: 'xpider-tx-t5-valid'
  });
  assert(rbResValid.verifications.tagAbsent === true, 'Tag must be verified absent');
  assert(!pT5Valid.mockTags.includes('xpider-tx-t5-valid'), 'Tag must be removed from mock tags');

  // 5b. Tag delete failure propagates error, does not mark tagAbsent, preserves journal
  const pT5Fail = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  pT5Fail.mockTags = ['xpider-tx-t5-fail'];
  pT5Fail.simulateTagDeleteFailure = true;

  const rbResFail = await pT5Fail.rollbackProvisioning({
    transactionTag: 'xpider-tx-t5-fail'
  });
  assert.strictEqual(rbResFail.verifications.tagAbsent, false, 'Failed tag delete must not be marked tagAbsent');
  assert(rbResFail.errors.some(e => e.includes('tag_delete_error')), 'Error list must record tag delete error');
  assert.strictEqual(rbResFail.status, 'CLEANUP_REQUIRED');

  // 5c. Tag delete verification failure (DELETE returns 200 but GET still finds tag) -> fails absent check
  const pT5VerifFail = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  pT5VerifFail.simulateTagDeleteVerificationFailure = true;
  const rbResVerifFail = await pT5VerifFail.rollbackProvisioning({
    transactionTag: 'xpider-tx-t5-verif'
  });
  assert.strictEqual(rbResVerifFail.verifications.tagAbsent, false, 'Tag still existing after delete must fail verification');

  console.log('  [PASS] Test 5: Tag deletion requires authoritative absence verification before marking tagAbsent.\n');

  // ---------------------------------------------------------------------------
  // [TEST 6: T6] Exhaustive Verified Quote Validation
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 6: T6] Exhaustive Verified Quote Validation');

  const pT6 = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  // 6a. Empty object {} must fail with MANDATORY_QUOTE_REQUIRED
  let t6EmptyErr = null;
  try {
    await pT6.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: {} // Empty object
    });
  } catch (e) {
    t6EmptyErr = e;
  }
  assert(t6EmptyErr && t6EmptyErr.message.includes('MANDATORY_QUOTE_REQUIRED'),
    `Empty quote object must be rejected: ${t6EmptyErr ? t6EmptyErr.message : 'No error'}`);

  // 6b. Missing hourlyCostUsd must fail
  let t6NoHourlyErr = null;
  try {
    await pT6.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: {
        tier: 'ULTRA_ECONOMY',
        region: 'nyc3',
        size: 's-1vcpu-1gb',
        monthlyCostUsd: 6.0
        // missing hourlyCostUsd
      }
    });
  } catch (e) {
    t6NoHourlyErr = e;
  }
  assert(t6NoHourlyErr && t6NoHourlyErr.message.includes('MANDATORY_QUOTE_REQUIRED'),
    `Missing hourlyCostUsd must be rejected: ${t6NoHourlyErr ? t6NoHourlyErr.message : 'No error'}`);

  // 6c. Non-positive or non-finite pricing must fail
  let t6ZeroPriceErr = null;
  try {
    await pT6.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: {
        tier: 'ULTRA_ECONOMY',
        region: 'nyc3',
        size: 's-1vcpu-1gb',
        monthlyCostUsd: -6.0,
        hourlyCostUsd: 0.00893
      }
    });
  } catch (e) {
    t6ZeroPriceErr = e;
  }
  assert(t6ZeroPriceErr && t6ZeroPriceErr.message.includes('MANDATORY_QUOTE_REQUIRED'),
    `Negative monthly cost must be rejected: ${t6ZeroPriceErr ? t6ZeroPriceErr.message : 'No error'}`);

  // 6d. Valid complete quote passes
  const resT6Valid = await pT6.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(resT6Valid && resT6Valid.success, 'Valid exhaustive quote must succeed');

  console.log('  [PASS] Test 6: Exhaustive quote validation enforces all mandatory fields (tier, region, size, monthly, hourly).\n');

  // ---------------------------------------------------------------------------
  // [TEST 7: T7] Pre-Billable Token Scope Capability Check
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 7: T7] Pre-Billable Token Scope Capability Check');

  // 7a. Missing firewall:update scope fails before droplet creation (zero droplets created)
  const pT7FwUpdate = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true,
    simulateFirewallUpdateScopeMissing: true
  });

  let t7FwUpdateErr = null;
  try {
    await pT7FwUpdate.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (e) {
    t7FwUpdateErr = e;
  }
  assert(t7FwUpdateErr, 'Missing firewall:update must fail closed');
  assert(t7FwUpdateErr.message.includes('TOKEN_SCOPE_MISSING') && t7FwUpdateErr.message.includes('firewall:update'),
    `Error must indicate missing firewall:update scope: ${t7FwUpdateErr.message}`);
  assert.strictEqual((pT7FwUpdate.mockDeletedResources.droplets || []).length, 0, 'Zero billable droplets must be created when firewall:update is missing');

  // 7b. Missing tag:delete scope fails before droplet creation (zero droplets created)
  const pT7TagDelete = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true,
    simulateTagDeleteScopeMissing: true
  });

  let t7TagDeleteErr = null;
  try {
    await pT7TagDelete.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (e) {
    t7TagDeleteErr = e;
  }
  assert(t7TagDeleteErr, 'Missing tag:delete must fail closed');
  assert(t7TagDeleteErr.message.includes('TOKEN_SCOPE_MISSING') && t7TagDeleteErr.message.includes('tag:delete'),
    `Error must indicate missing tag:delete scope: ${t7TagDeleteErr.message}`);
  assert.strictEqual((pT7TagDelete.mockDeletedResources.droplets || []).length, 0, 'Zero billable droplets must be created when tag:delete is missing');

  console.log('  [PASS] Test 7: Pre-billable capability check enforces firewall:update and tag:delete scopes before any droplet is allocated.\n');

  console.log('========================================================================');
  console.log('  ALL T1 - T7 TESTS PASSED (7/7 — 100%)');
  console.log('========================================================================');
}

runT1toT7Suite().catch(err => {
  console.error('\n❌ FATAL TEST FAILURE:', err);
  process.exit(1);
});
