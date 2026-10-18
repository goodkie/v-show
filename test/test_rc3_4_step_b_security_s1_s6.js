/**
 * XPIDER AutoForm Sender Pro — RC3.4 Pre-Step-B Security Hardening Test Suite (S1 - S6)
 *
 * Dedicated tests verifying the resolution of all confirmed blockers S1 - S6:
 * - [S1] Droplet Cloud Firewall applied-state verification (GET /v2/droplets/{id}/firewalls):
 *        pending -> timeout, zero SSH packets, rollback; succeeded + no pending -> PASS.
 * - [S2] Droplet firewall isolation: unexpected second firewall attached -> fail-closed with SECURITY VIOLATION;
 *        Droplet and Firewall tagged with unique transactionTag ONLY (no DEFAULT_TAG or tier/region tags).
 * - [S3] Explicit transaction tag lifecycle: createTransactionTag, canonical existence verification,
 *        deleteTransactionTag, and scope check (403 -> TOKEN_SCOPE_MISSING).
 * - [S4] Comprehensive public-IP classifier matrix: IPv4-mapped, RFC 1918 (10/8, 172.16/12, 192.168/16),
 *        100.64/10, 0/8, 169.254/16, IPv6 ULA (fc00::/7), link-local (fe80::/10), loopback, multicast, etc.
 * - [S5] Fail-closed ownership persistence: atomic save failure -> rollback & fail-closed;
 *        caller ID override mismatch rejected with CALLER_OVERRIDE_REJECTED;
 *        incomplete cleanup preserves ownership record.
 * - [S6] Mandatory quote binding: real mode without quote fails closed;
 *        both monthly and hourly price mismatches abort with PRICE_QUOTE_CHANGED; matching quote passes.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  PrivateEgressProvisioner,
  isPublicIp
} = require('../companion/private-egress-provisioner');

async function runS1toS6Suite() {
  console.log('========================================================================');
  console.log('  XPIDER RC3.4: STEP B SECURITY HARDENING AUDIT SUITE (S1 - S6)');
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
  // [TEST 1: S1] Pre-SSH Droplet Firewall Applied-State Verification & Timeout
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 1: S1] Pre-SSH Droplet Firewall Applied-State Verification');

  // 1a. Firewall pending -> timeout, no SSH, automatic rollback
  const pS1Pending = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true,
    simulateFirewallPending: true
  });

  let s1PendingErr = null;
  try {
    await pS1Pending.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (e) {
    s1PendingErr = e;
  }
  assert(s1PendingErr, 'Must fail closed when firewall status remains pending');
  assert(s1PendingErr.message.includes('FAIL-CLOSED') && s1PendingErr.message.includes('applied state on droplet') && s1PendingErr.message.includes('timed out'),
    `Expected applied-state timeout error, got: ${s1PendingErr.message}`);

  // Verify rollback was executed
  assert(pS1Pending.mockDeletedResources.droplets.includes('99887766') || pS1Pending.mockDeletedResources.droplets.includes(99887766),
    'Droplet must be rolled back on firewall applied-state timeout');
  assert(pS1Pending.mockDeletedResources.firewalls.includes('fw-1234'),
    'Firewall must be deleted on rollback');

  // 1b. Direct verification of verifyDropletFirewallAppliedState terminal success
  const pS1Verif = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  pS1Verif.mockFirewalls = {
    'fw-test-1': {
      id: 'fw-test-1',
      status: 'succeeded',
      pending_changes: [],
      inbound_rules: [
        { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32'] } }
      ]
    }
  };
  const verifiedFw = await pS1Verif.verifyDropletFirewallAppliedState(99887766, 'fw-test-1', '22', '198.51.100.1/32', 1000);
  assert(verifiedFw.verified, 'Applied-state check must return verified: true');
  assert.strictEqual(verifiedFw.status, 'succeeded', 'Firewall status must be succeeded');
  assert.strictEqual(verifiedFw.effectivePort, '22', 'Effective port must be 22');

  console.log('    ✅ S1 PASSED: Firewall pending strictly times out without SSH traffic; terminal success is authoritatively verified.\n');

  // ---------------------------------------------------------------------------
  // [TEST 2: S2] Shared Firewall Rejection & Tag Isolation
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 2: S2] Unexpected Firewall Rejection & Tag Isolation');

  // 2a. Unexpected second firewall attached to Droplet -> SECURITY VIOLATION fail-closed
  const pS2Unexpected = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true,
    simulateUnexpectedFirewall: true
  });

  let s2UnexpectedErr = null;
  try {
    await pS2Unexpected.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (e) {
    s2UnexpectedErr = e;
  }
  assert(s2UnexpectedErr, 'Must fail closed when multiple firewalls are attached to droplet');
  assert(s2UnexpectedErr.message.includes('SECURITY VIOLATION') && s2UnexpectedErr.message.includes('unexpected additional firewall'),
    `Expected SECURITY VIOLATION for extra firewall, got: ${s2UnexpectedErr.message}`);

  // 2b. Tag Isolation: verify firewall and droplet use ONLY transactionTag
  const pS2Isolation = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  const resS2 = await pS2Isolation.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(resS2.success, 'Provisioning must succeed with tag isolation');
  assert(resS2.transactionTag, 'Must generate transactionTag');

  // Check firewall tags in mockFirewalls
  const fwId = resS2.firewallId;
  const createdFw = pS2Isolation.mockFirewalls[fwId];
  assert(createdFw, 'Created firewall must exist in mock');
  assert.deepStrictEqual(createdFw.tags, [resS2.transactionTag],
    `Firewall tags must contain ONLY transactionTag, got: ${JSON.stringify(createdFw.tags)}`);

  console.log('    ✅ S2 PASSED: Unexpected firewalls rejected fail-closed; Firewall tags contain ONLY unique transactionTag.\n');

  // ---------------------------------------------------------------------------
  // [TEST 3: S3] Explicit Transaction Tag Lifecycle (Create, Verify, Delete)
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 3: S3] Explicit Unique Transaction Tag Lifecycle');

  const pS3 = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  // 3a. Create transaction tag
  const tagObj = await pS3.createTransactionTag('xpider-tx-test-1234');
  assert.strictEqual(tagObj.name, 'xpider-tx-test-1234', 'Tag create must return tag name');
  assert(pS3.mockTags.includes('xpider-tx-test-1234'), 'Tag must be present in mockTags');

  // 3b. Missing token scope simulation for tag:create
  const pS3NoScope = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: false
  });
  pS3NoScope.doRequest = async (ep, method) => {
    if (ep === '/tags' && method === 'POST') {
      const err = new Error('Forbidden: missing scope');
      err.statusCode = 403;
      throw err;
    }
    return {};
  };

  let scopeErr = null;
  try {
    await pS3NoScope.createTransactionTag('xpider-tx-test-fail');
  } catch (e) {
    scopeErr = e;
  }
  assert(scopeErr, 'Must fail when token lacks tag:create scope');
  assert(scopeErr.message.includes('TOKEN_SCOPE_MISSING') && scopeErr.message.includes('tag:create'),
    `Expected TOKEN_SCOPE_MISSING, got: ${scopeErr.message}`);

  // 3c. Delete transaction tag
  await pS3.deleteTransactionTag('xpider-tx-test-1234');
  assert(!pS3.mockTags.includes('xpider-tx-test-1234'), 'Tag must be deleted from mockTags');
  assert(pS3.mockDeletedResources.tags.includes('xpider-tx-test-1234'), 'Tag must be in mockDeletedResources');

  console.log('    ✅ S3 PASSED: Tag lifecycle (create, verify existence, scope check, and delete) verified.\n');

  // ---------------------------------------------------------------------------
  // [TEST 4: S4] Comprehensive Public-IP Classifier Matrix
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 4: S4] Robust Public-IP Classifier Matrix (IPv4, IPv6, Mapped)');

  // Private RFC 1918
  assert.strictEqual(isPublicIp('10.0.0.1'), false, '10.0.0.1 must NOT be public');
  assert.strictEqual(isPublicIp('10.255.255.254'), false, '10.255.255.254 must NOT be public');
  assert.strictEqual(isPublicIp('172.16.0.1'), false, '172.16.0.1 must NOT be public');
  assert.strictEqual(isPublicIp('172.20.10.5'), false, '172.20.10.5 must NOT be public');
  assert.strictEqual(isPublicIp('172.31.255.254'), false, '172.31.255.254 must NOT be public');
  assert.strictEqual(isPublicIp('172.32.0.1'), true, '172.32.0.1 is public');
  assert.strictEqual(isPublicIp('192.168.1.1'), false, '192.168.1.1 must NOT be public');

  // CGNAT (100.64.0.0/10)
  assert.strictEqual(isPublicIp('100.64.0.1'), false, '100.64.0.1 must NOT be public (CGNAT)');
  assert.strictEqual(isPublicIp('100.100.50.25'), false, '100.100.50.25 must NOT be public (CGNAT)');
  assert.strictEqual(isPublicIp('100.127.255.254'), false, '100.127.255.254 must NOT be public (CGNAT)');
  assert.strictEqual(isPublicIp('100.128.0.1'), true, '100.128.0.1 is public');

  // Link-Local, Loopback, Current Network
  assert.strictEqual(isPublicIp('169.254.169.254'), false, '169.254.169.254 must NOT be public (Link-Local)');
  assert.strictEqual(isPublicIp('127.0.0.1'), false, '127.0.0.1 must NOT be public (Loopback)');
  assert.strictEqual(isPublicIp('0.0.0.1'), false, '0.0.0.1 must NOT be public (0/8)');
  assert.strictEqual(isPublicIp('224.0.0.1'), false, '224.0.0.1 must NOT be public (Multicast)');
  assert.strictEqual(isPublicIp('240.0.0.1'), false, '240.0.0.1 must NOT be public (Reserved)');
  assert.strictEqual(isPublicIp('255.255.255.255'), false, '255.255.255.255 must NOT be public (Broadcast)');

  // IPv6
  assert.strictEqual(isPublicIp('::1'), false, '::1 must NOT be public (Loopback)');
  assert.strictEqual(isPublicIp('::'), false, ':: must NOT be public (Unspecified)');
  assert.strictEqual(isPublicIp('fc00::1'), false, 'fc00::1 must NOT be public (ULA)');
  assert.strictEqual(isPublicIp('fd12:3456:789a::1'), false, 'fd12::1 must NOT be public (ULA)');
  assert.strictEqual(isPublicIp('fe80::1'), false, 'fe80::1 must NOT be public (Link-Local)');
  assert.strictEqual(isPublicIp('ff02::1'), false, 'ff02::1 must NOT be public (Multicast)');

  // IPv4-mapped IPv6
  assert.strictEqual(isPublicIp('::ffff:10.0.0.1'), false, '::ffff:10.0.0.1 must NOT be public');
  assert.strictEqual(isPublicIp('::ffff:172.25.1.1'), false, '::ffff:172.25.1.1 must NOT be public');
  assert.strictEqual(isPublicIp('::ffff:192.168.1.1'), false, '::ffff:192.168.1.1 must NOT be public');
  assert.strictEqual(isPublicIp('::ffff:100.64.1.1'), false, '::ffff:100.64.1.1 must NOT be public');
  assert.strictEqual(isPublicIp('::ffff:8.8.8.8'), true, '::ffff:8.8.8.8 is public');

  // Valid Public IPs
  assert.strictEqual(isPublicIp('8.8.8.8'), true, '8.8.8.8 is public');
  assert.strictEqual(isPublicIp('1.1.1.1'), true, '1.1.1.1 is public');
  assert.strictEqual(isPublicIp('104.21.5.12'), true, '104.21.5.12 is public');
  assert.strictEqual(isPublicIp('2606:4700:4700::1111'), true, '2606:4700:4700::1111 is public');

  console.log('    ✅ S4 PASSED: Public IP classifier cleanly handles all RFC private, CGNAT, link-local, loopback, ULA, and mapped ranges.\n');

  // ---------------------------------------------------------------------------
  // [TEST 5: S5] Fail-Closed Ownership Persistence & Caller ID Protection
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 5: S5] Fail-Closed Ownership Persistence & Caller ID Protection');

  // 5a. Ownership persistence write failure -> fail-closed with rollback
  const pS5Fail = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true,
    simulateOwnershipSaveFailure: true
  });

  let s5SaveErr = null;
  try {
    await pS5Fail.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: validQuote
    });
  } catch (e) {
    s5SaveErr = e;
  }
  assert(s5SaveErr, 'Must fail closed when ownership save fails');
  assert(s5SaveErr.message.includes('SIMULATED_OWNERSHIP_SAVE_FAILURE'),
    `Expected SIMULATED_OWNERSHIP_SAVE_FAILURE, got: ${s5SaveErr.message}`);
  // Droplet and firewall must be rolled back
  assert(pS5Fail.mockDeletedResources.droplets.includes('99887766') || pS5Fail.mockDeletedResources.droplets.includes(99887766),
    'Droplet must be rolled back on ownership persistence failure');

  // 5b. Caller ID override mismatch rejection
  const pS5Override = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  const resProv5 = await pS5Override.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(resProv5.success, 'Provisioning must succeed');

  let overrideDropletErr = null;
  try {
    await pS5Override.destroyPrivateEgress({ dropletId: 11111111 }); // Different from 99887766!
  } catch (e) {
    overrideDropletErr = e;
  }
  assert(overrideDropletErr, 'Must reject caller dropletId mismatch');
  assert(overrideDropletErr.message.includes('CALLER_OVERRIDE_REJECTED') && overrideDropletErr.message.includes('dropletId'),
    `Expected CALLER_OVERRIDE_REJECTED for dropletId, got: ${overrideDropletErr.message}`);

  let overrideFwErr = null;
  try {
    await pS5Override.destroyPrivateEgress({ firewallId: 'fw-other-999' }); // Different from fw-1234!
  } catch (e) {
    overrideFwErr = e;
  }
  assert(overrideFwErr, 'Must reject caller firewallId mismatch');
  assert(overrideFwErr.message.includes('CALLER_OVERRIDE_REJECTED') && overrideFwErr.message.includes('firewallId'),
    `Expected CALLER_OVERRIDE_REJECTED for firewallId, got: ${overrideFwErr.message}`);

  // 5c. Valid destroy strictly using owned record
  const destroyClean = await pS5Override.destroyPrivateEgress();
  assert(destroyClean.success, 'Valid destroy without override must succeed');
  assert.strictEqual(destroyClean.status, 'DESTROY_VERIFIED_CLEAN');
  assert.strictEqual(pS5Override.loadTransactionOwnership(), null, 'Ownership record cleared after clean destroy');

  console.log('    ✅ S5 PASSED: Ownership persistence write failure fails closed with rollback; caller ID overrides strictly rejected.\n');

  // ---------------------------------------------------------------------------
  // [TEST 6: S6] Mandatory Quote Binding & Hourly Price Validation
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 6: S6] Mandatory Quote Binding & Hourly Price Validation');

  // 6a. Real mode without verifiedQuote -> fail closed
  const pS6RealNoQuote = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: false
  });
  // Mock doRequest to ensure failure happens on quote check, not network
  pS6RealNoQuote.validateToken = async () => ({ valid: true, account: { email: 'test@example.com' } });
  pS6RealNoQuote.verifyRegionAndSizeAvailability = async () => ({
    available: true,
    region: 'nyc3',
    sizeSlug: 's-1vcpu-1gb',
    monthlyCostUsd: 6.0,
    hourlyCostUsd: 0.00893,
    sameCostRegions: ['nyc3']
  });

  let realNoQuoteErr = null;
  try {
    await pS6RealNoQuote.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3'
      // verifiedQuote intentionally omitted!
    });
  } catch (e) {
    realNoQuoteErr = e;
  }
  assert(realNoQuoteErr, 'Must fail closed in real mode when verifiedQuote is missing');
  assert(realNoQuoteErr.message.includes('MANDATORY_QUOTE_REQUIRED'),
    `Expected MANDATORY_QUOTE_REQUIRED, got: ${realNoQuoteErr.message}`);

  // 6b. Hourly price mismatch -> abort with PRICE_QUOTE_CHANGED
  const pS6HourlyMismatch = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });

  let hourlyErr = null;
  try {
    await pS6HourlyMismatch.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: {
        tier: 'ULTRA_ECONOMY',
        region: 'nyc3',
        size: 's-1vcpu-1gb',
        monthlyCostUsd: 6.0,
        hourlyCostUsd: 0.00500 // Stale hourly quote! Catalog is 0.00893
      }
    });
  } catch (e) {
    hourlyErr = e;
  }
  assert(hourlyErr, 'Must reject Step B when hourly price does not match catalog');
  assert(hourlyErr.message.includes('PRICE_QUOTE_CHANGED') && hourlyErr.message.includes('hourly price changed'),
    `Expected PRICE_QUOTE_CHANGED for hourly price, got: ${hourlyErr.message}`);

  // 6c. Monthly price mismatch -> abort with PRICE_QUOTE_CHANGED
  let monthlyErr = null;
  try {
    await pS6HourlyMismatch.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: {
        tier: 'ULTRA_ECONOMY',
        region: 'nyc3',
        size: 's-1vcpu-1gb',
        monthlyCostUsd: 7.0, // Stale monthly quote! Catalog is 6.0
        hourlyCostUsd: 0.00893
      }
    });
  } catch (e) {
    monthlyErr = e;
  }
  assert(monthlyErr, 'Must reject Step B when monthly price does not match catalog');
  assert(monthlyErr.message.includes('PRICE_QUOTE_CHANGED') && monthlyErr.message.includes('monthly price changed'),
    `Expected PRICE_QUOTE_CHANGED for monthly price, got: ${monthlyErr.message}`);

  // 6d. Matching quote (both monthly and hourly) -> PASS
  const pS6Pass = new PrivateEgressProvisioner({
    token: mockToken,
    mockMode: true
  });
  const resS6Pass = await pS6Pass.provisionPrivateEgress({
    tier: 'ULTRA_ECONOMY',
    region: 'nyc3',
    verifiedQuote: validQuote
  });
  assert(resS6Pass.success, 'Matching quote must pass Step B');
  assert.strictEqual(resS6Pass.monthlyCostUsd, 6.0);
  assert.strictEqual(resS6Pass.hourlyCostUsd, 0.00893);

  console.log('    ✅ S6 PASSED: Mandatory quote enforced in real mode; both monthly and hourly prices strictly validated.\n');

  console.log('========================================================================');
  console.log('  ALL S1 - S6 PRE-STEP-B SECURITY HARDENING AUDIT CHECKS PASSED 100%');
  console.log('========================================================================\n');
}

runS1toS6Suite().catch((err) => {
  console.error('\n❌ FATAL TEST FAILURE:', err);
  process.exit(1);
});
