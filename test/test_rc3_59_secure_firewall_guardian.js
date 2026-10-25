'use strict';
/**
 * test/test_rc3_59_secure_firewall_guardian.js
 *
 * RC3.59 Secure Firewall Guardian & Dynamic VPN IP Allowlist Regression Suite
 * Protocol: OCA-DEV-1.4 (Issue #6 RC3.59 - P0 Security Hold Directive #6397334700)
 *
 * 11-Point Verification Matrix:
 *   [1]  Network & Routing Validation (Proton default route 10.2.0.x vs ambiguous / non-Proton routes)
 *   [2]  Allowlist already contains target IP (in-sync / no-op, 0 writes)
 *   [3]  Infrastructure Association Verification (droplet_ids & tag mismatch fail-closed)
 *   [4]  PAT Authentication & Scope Handling (401 TOKEN_INVALID, 403 MISSING_SCOPE, 429 backoff)
 *   [5]  Pre-Write Concurrency Guard (SHA256 snapshot check, aborts on mismatch with 0 writes)
 *   [6]  Rogue Wildcard Fail-Closed (throws ROGUE_WILDCARD_DETECTED, NO silent purge, 0 writes)
 *   [7]  Additive-Only Preservation (preserves port 22, 80, ICMP verbatim; additive 8443)
 *   [8]  Owner Approval Gate & CLI Security (requires confirmed: true; non-bypassable)
 *   [9]  Zero Secret Leakage (PAT redacted from logs, status, errors; no CLI token arg)
 *   [10] Safe Owner-Approved Mutation with Persisted Verification (mock DO API lifecycle)
 *   [11] Strictly Read-Only Service Startup & Reconcile (0 writes unattended, APPROVAL_REQUIRED)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  FirewallGuardian,
  isValidPublicIPv4,
  detectNetworkContext,
  detectNetworkInfo,
  getActiveDefaultRoute,
  computeFirewallSnapshot,
  buildDesiredInbound,
  generatePreviewDiff,
  redactSecrets,
  STATIC_ALLOWLIST,
  PORT,
  DEFAULT_FIREWALL_ID,
  DEFAULT_DROPLET_ID,
  DEFAULT_TRANSACTION_TAG
} = require('../companion/firewall-guardian');

const FAKE_PAT = 'dop_v1_' + '1'.repeat(64);

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: RC3.59 SECURE FIREWALL GUARDIAN (P0 VERIFICATION)');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  [PASS] Test ${total}: ${name}`);
    } catch (err) {
      console.error(`  [FAIL] Test ${total}: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // --- [TEST 1] Network & Routing Validation ---
  await test('Network & Routing Validation (Proton default route 10.2.0.x vs ambiguous / non-Proton routes)', async () => {
    // 1. IP format validation
    assert.strictEqual(isValidPublicIPv4('159.26.98.242'), true);
    assert.strictEqual(isValidPublicIPv4('74.39.42.139'), true);
    assert.strictEqual(isValidPublicIPv4('10.2.0.2'), false);
    assert.strictEqual(isValidPublicIPv4('192.168.1.1'), false);
    assert.strictEqual(isValidPublicIPv4('0.0.0.0'), false);
    assert.strictEqual(isValidPublicIPv4('bad-ip'), false);

    // 2. Mock routing table with Proton default route (metric 1 on 10.2.0.2, physical metric 25)
    const mockProtonRouteOutput = `
IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.8.1   192.168.8.211      25
          0.0.0.0          0.0.0.0          On-link        10.2.0.2       1
===========================================================================
`;
    const protonRoute = getActiveDefaultRoute(mockProtonRouteOutput);
    assert.strictEqual(protonRoute.interfaceIp, '10.2.0.2');
    assert.strictEqual(protonRoute.metric, 1);

    const netCtxProton = detectNetworkContext(mockProtonRouteOutput);
    assert.strictEqual(netCtxProton.isProtonDefaultRoute, true);

    // 3. Mock routing table where physical interface is default (no Proton VPN)
    const mockPhysicalOnlyOutput = `
IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.8.1   192.168.8.211      10
===========================================================================
`;
    const physicalRoute = getActiveDefaultRoute(mockPhysicalOnlyOutput);
    assert.strictEqual(physicalRoute.interfaceIp, '192.168.8.211');
    const netCtxPhysical = detectNetworkContext(mockPhysicalOnlyOutput);
    assert.strictEqual(netCtxPhysical.isProtonDefaultRoute, false);

    // 4. Ambiguous default routes (conflicting routes with same metric)
    const mockAmbiguousOutput = `
IPv4 Route Table
===========================================================================
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.8.1   192.168.8.211       5
          0.0.0.0          0.0.0.0          On-link        10.2.0.2       5
===========================================================================
`;
    assert.throws(
      () => getActiveDefaultRoute(mockAmbiguousOutput),
      /NETWORK_ROUTE_UNCERTAIN/
    );

    // 5. detectNetworkInfo with requireProtonRoute fails closed when non-Proton
    await assert.rejects(
      async () => {
        await detectNetworkInfo(
          [async () => '159.26.98.242', async () => '159.26.98.242'],
          { routeOutput: mockPhysicalOnlyOutput, requireProtonRoute: true }
        );
      },
      /NETWORK_ROUTE_UNCERTAIN/
    );
  });

  // --- [TEST 2] Allowlist already contains target IP (in-sync / no-op, 0 writes) ---
  await test('Allowlist already contains target IP (in-sync / no-op, 0 writes)', async () => {
    const mockFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        {
          protocol: 'tcp',
          ports: PORT,
          sources: { addresses: ['159.26.98.242/32', '74.39.42.139/32'] }
        }
      ]
    };

    const diff = generatePreviewDiff(mockFw, '159.26.98.242', STATIC_ALLOWLIST);
    assert.strictEqual(diff.noop, true);
    assert.strictEqual(diff.added.length, 0);
    assert.strictEqual(diff.removed.length, 0);
    assert.deepStrictEqual(diff.proposedAddresses, ['159.26.98.242/32', '74.39.42.139/32']);

    let writeCalls = 0;
    const guardian = new FirewallGuardian({
      detectNetwork: async () => ({ ip: '159.26.98.242', isProton: true, isProtonDefaultRoute: true }),
      request: async (t, m) => {
        if (m === 'PUT') writeCalls++;
        return { status: 200, json: { firewall: mockFw } };
      }
    });

    // Reconcile returns IN_SYNC with 0 writes
    const recRes = await guardian._reconcile();
    assert.strictEqual(recRes.ok, true);
    assert.strictEqual(recRes.status, 'IN_SYNC');
    assert.strictEqual(recRes.changed, false);
    assert.strictEqual(writeCalls, 0);

    // applyUpdate returns IN_SYNC with 0 writes
    const applyRes = await guardian.applyUpdate({
      token: FAKE_PAT,
      ip: '159.26.98.242',
      confirmed: true,
      expectedSnapshot: diff.snapshot
    });
    assert.strictEqual(applyRes.ok, true);
    assert.strictEqual(applyRes.status, 'IN_SYNC');
    assert.strictEqual(applyRes.changed, false);
    assert.strictEqual(writeCalls, 0);
  });

  // --- [TEST 3] Infrastructure Association Verification ---
  await test('Infrastructure Association Verification (droplet_ids & tag mismatch fail-closed)', async () => {
    const mockFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'unrelated-fw',
      droplet_ids: [999999999], // Wrong droplet!
      tags: ['other-tag'],      // Wrong tag!
      inbound_rules: []
    };

    const guardian = new FirewallGuardian({
      dropletId: DEFAULT_DROPLET_ID,
      expectedTag: DEFAULT_TRANSACTION_TAG,
      request: async () => ({ status: 200, json: { firewall: mockFw } })
    });

    await assert.rejects(
      async () => {
        await guardian.fetchFirewallState(FAKE_PAT, DEFAULT_FIREWALL_ID);
      },
      /FIREWALL_ASSOCIATION_MISMATCH/
    );
  });

  // --- [TEST 4] PAT Authentication & Scope Handling ---
  await test('PAT Authentication & Scope Handling (401 TOKEN_INVALID, 403 MISSING_SCOPE, 429 backoff)', async () => {
    // 401 Unauthorized
    const g401 = new FirewallGuardian({
      request: async () => ({ status: 401, json: { message: 'Bad credentials' } })
    });
    await assert.rejects(
      async () => { await g401.fetchFirewallState(FAKE_PAT); },
      (err) => err.code === 'TOKEN_INVALID'
    );

    // 403 Forbidden with insufficient scope
    const g403 = new FirewallGuardian({
      request: async () => ({
        status: 403,
        json: { message: 'You have insufficient permissions to access this resource.' }
      })
    });
    await assert.rejects(
      async () => { await g403.fetchFirewallState(FAKE_PAT); },
      (err) => err.code === 'MISSING_SCOPE'
    );

    // 429 Rate limiting backoff up to success
    let attempts = 0;
    const g429 = new FirewallGuardian({
      sleep: async () => {},
      request: async () => {
        attempts++;
        if (attempts <= 2) return { status: 429, json: {} };
        return {
          status: 200,
          json: {
            firewall: {
              id: DEFAULT_FIREWALL_ID,
              name: 'fw',
              droplet_ids: [DEFAULT_DROPLET_ID],
              tags: [DEFAULT_TRANSACTION_TAG],
              inbound_rules: []
            }
          }
        };
      }
    });
    const fw = await g429.fetchFirewallState(FAKE_PAT);
    assert.strictEqual(fw.id, DEFAULT_FIREWALL_ID);
    assert.strictEqual(attempts, 3);
  });

  // --- [TEST 5] Pre-Write Concurrency Guard ---
  await test('Pre-Write Concurrency Guard (SHA256 snapshot check, aborts on mismatch with 0 writes)', async () => {
    const originalFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        { protocol: 'tcp', ports: PORT, sources: { addresses: ['159.26.98.240/32', '74.39.42.139/32'] } }
      ]
    };
    const expectedSnapshot = computeFirewallSnapshot(originalFw);

    // Live firewall was modified concurrently by another process
    const concurrentlyModifiedFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        { protocol: 'tcp', ports: PORT, sources: { addresses: ['1.2.3.4/32', '74.39.42.139/32'] } }
      ]
    };

    let writes = 0;
    const guardian = new FirewallGuardian({
      request: async (t, m) => {
        if (m === 'PUT') writes++;
        return { status: 200, json: { firewall: concurrentlyModifiedFw } };
      }
    });

    // 1. Missing expectedSnapshot -> EXPECTED_SNAPSHOT_REQUIRED
    await assert.rejects(
      async () => {
        await guardian.applyUpdate({
          token: FAKE_PAT,
          ip: '159.26.98.242',
          confirmed: true
          // expectedSnapshot omitted!
        });
      },
      (err) => err.code === 'EXPECTED_SNAPSHOT_REQUIRED'
    );

    // 2. Mismatched expectedSnapshot -> CONCURRENT_MODIFICATION_DETECTED with 0 writes
    await assert.rejects(
      async () => {
        await guardian.applyUpdate({
          token: FAKE_PAT,
          ip: '159.26.98.242',
          confirmed: true,
          expectedSnapshot // from originalFw, but live is concurrentlyModifiedFw!
        });
      },
      (err) => err.code === 'CONCURRENT_MODIFICATION_DETECTED'
    );

    assert.strictEqual(writes, 0, 'Zero writes must occur if snapshot mismatch is detected');
  });

  // --- [TEST 6] Rogue Wildcard Fail-Closed ---
  await test('Rogue Wildcard Fail-Closed (throws ROGUE_WILDCARD_DETECTED, NO silent purge, 0 writes)', async () => {
    const rogueFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        {
          protocol: 'tcp',
          ports: PORT,
          sources: { addresses: ['0.0.0.0/0', '74.39.42.139/32'] } // Rogue entry!
        }
      ]
    };

    // buildDesiredInbound MUST throw and NOT silently strip 0.0.0.0/0
    assert.throws(
      () => buildDesiredInbound(rogueFw.inbound_rules, '159.26.98.242', STATIC_ALLOWLIST),
      (err) => err.code === 'ROGUE_WILDCARD_DETECTED'
    );

    // generatePreviewDiff MUST also throw and fail closed
    assert.throws(
      () => generatePreviewDiff(rogueFw, '159.26.98.242', STATIC_ALLOWLIST),
      (err) => err.code === 'ROGUE_WILDCARD_DETECTED'
    );

    // In preview / applyUpdate, fails closed with 0 writes
    let writes = 0;
    const guardian = new FirewallGuardian({
      detectNetwork: async () => ({ ip: '159.26.98.242', isProton: true, isProtonDefaultRoute: true }),
      request: async (t, m) => {
        if (m === 'PUT') writes++;
        return { status: 200, json: { firewall: rogueFw } };
      }
    });

    await assert.rejects(
      async () => { await guardian.preview({ token: FAKE_PAT }); },
      (err) => err.code === 'ROGUE_WILDCARD_DETECTED'
    );

    assert.strictEqual(writes, 0, 'Zero writes must occur when rogue wildcard is detected');
  });

  // --- [TEST 7] Additive-Only Preservation ---
  await test('Additive-Only Preservation (preserves port 22, 80, ICMP verbatim; additive 8443)', async () => {
    const complexFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        { protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.5/32'] } },
        { protocol: 'tcp', ports: '80', sources: { addresses: ['198.51.100.10/32'] } },
        { protocol: 'icmp', ports: '0', sources: { addresses: ['198.51.100.20/32'] } },
        { protocol: 'tcp', ports: PORT, sources: { addresses: ['159.26.98.240/32', '74.39.42.139/32'] } }
      ],
      outbound_rules: [
        { protocol: 'tcp', ports: 'all', destinations: { addresses: ['0.0.0.0/0'] } }
      ]
    };

    const diff = generatePreviewDiff(complexFw, '159.26.98.242', STATIC_ALLOWLIST);

    // 1. Verify port 8443 is strictly additive
    assert.deepStrictEqual(diff.proposedAddresses, ['159.26.98.240/32', '159.26.98.242/32', '74.39.42.139/32']);
    assert.deepStrictEqual(diff.added, ['159.26.98.242/32']);
    assert.deepStrictEqual(diff.removed, [], 'Additive-only mode must NOT remove existing valid IPs');

    // 2. Verify all other rules are preserved verbatim
    const proposedInbound = diff.proposedPayload.inbound_rules;
    const rule22 = proposedInbound.find(r => r.ports === '22');
    const rule80 = proposedInbound.find(r => r.ports === '80');
    const ruleIcmp = proposedInbound.find(r => r.protocol === 'icmp');

    assert.ok(rule22, 'Port 22 rule must be preserved verbatim');
    assert.deepStrictEqual(rule22.sources.addresses, ['198.51.100.5/32']);

    assert.ok(rule80, 'Port 80 rule must be preserved verbatim');
    assert.deepStrictEqual(rule80.sources.addresses, ['198.51.100.10/32']);

    assert.ok(ruleIcmp, 'ICMP rule must be preserved verbatim');
    assert.deepStrictEqual(ruleIcmp.sources.addresses, ['198.51.100.20/32']);

    // 3. Verify outbound rules preserved verbatim
    assert.strictEqual(diff.proposedPayload.outbound_rules.length, 1);
  });

  // --- [TEST 8] Owner Approval Gate & CLI Security ---
  await test('Owner Approval Gate & CLI Security (requires confirmed: true; non-bypassable)', async () => {
    let writes = 0;
    const guardian = new FirewallGuardian({
      detectNetwork: async () => ({ ip: '159.26.98.242', isProton: true, isProtonDefaultRoute: true }),
      request: async (t, m) => {
        if (m === 'PUT') writes++;
        return {
          status: 200,
          json: {
            firewall: {
              id: DEFAULT_FIREWALL_ID,
              name: 'xpider-fw',
              droplet_ids: [DEFAULT_DROPLET_ID],
              tags: [DEFAULT_TRANSACTION_TAG],
              inbound_rules: []
            }
          }
        };
      }
    });

    // Calling applyUpdate with confirmed: false or undefined
    await assert.rejects(
      async () => {
        await guardian.applyUpdate({
          token: FAKE_PAT,
          ip: '159.26.98.242',
          confirmed: false,
          expectedSnapshot: 'snapshot-hash'
        });
      },
      /CONFIRMATION_REQUIRED/
    );

    assert.strictEqual(writes, 0, 'Zero writes must occur without confirmed: true');

    // Verify CLI script source does NOT contain bypass flags (--yes/--confirm as accepted bypass)
    const cliSource = fs.readFileSync(path.resolve(__dirname, '../scripts/quick_update_firewall_ip.js'), 'utf8');
    assert.ok(cliSource.includes('Command-line confirmation bypass (--yes/--confirm) is strictly prohibited'));
    assert.ok(cliSource.includes("Type 'YES' (exact uppercase) to authorize"));
    assert.ok(cliSource.includes('!process.stdin.isTTY'));
  });

  // --- [TEST 9] Zero Secret Leakage ---
  await test('Zero Secret Leakage (PAT redacted from logs, status, errors; no CLI token arg)', async () => {
    const rawError = `Failed request with token ${FAKE_PAT} and Authorization: Bearer aaaaabbbbbcccccdddddeeeeefffff`;
    const scrubbed = redactSecrets(rawError);

    assert.ok(!scrubbed.includes(FAKE_PAT));
    assert.ok(!scrubbed.includes('dop_v1_'));
    assert.ok(!scrubbed.includes('aaaaabbbbbcccccdddddeeeeefffff'));
    assert.ok(scrubbed.includes('[REDACTED_DO_TOKEN]'));
    assert.ok(scrubbed.includes('Bearer [REDACTED_TOKEN]'));

    // CLI script source check: rejects --token CLI arg
    const cliSource = fs.readFileSync(path.resolve(__dirname, '../scripts/quick_update_firewall_ip.js'), 'utf8');
    assert.ok(cliSource.includes('Passing API tokens via command-line arguments (--token) is strictly prohibited'));
  });

  // --- [TEST 10] Safe Owner-Approved Mutation with Persisted Verification ---
  await test('Safe Owner-Approved Mutation with Persisted Verification (mock DO API lifecycle)', async () => {
    let persistedFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        { protocol: 'tcp', ports: PORT, sources: { addresses: ['159.26.98.240/32', '74.39.42.139/32'] } }
      ],
      outbound_rules: []
    };

    let putReceived = false;
    let putPayload = null;

    const guardian = new FirewallGuardian({
      detectNetwork: async () => ({ ip: '159.26.98.242', isProton: true, isProtonDefaultRoute: true }),
      request: async (t, m, p, body) => {
        if (m === 'GET') {
          return { status: 200, json: { firewall: persistedFw } };
        }
        if (m === 'PUT') {
          putReceived = true;
          putPayload = body;
          persistedFw = {
            ...persistedFw,
            inbound_rules: body.inbound_rules
          };
          return { status: 200, json: { firewall: persistedFw } };
        }
        return { status: 200, json: {} };
      }
    });

    // 1. Preview
    const preview = await guardian.preview({ token: FAKE_PAT });
    assert.ok(preview.snapshot);
    assert.deepStrictEqual(preview.diff.added, ['159.26.98.242/32']);

    // 2. Owner confirms and passes expectedSnapshot
    const result = await guardian.applyUpdate({
      token: FAKE_PAT,
      ip: '159.26.98.242',
      confirmed: true,
      expectedSnapshot: preview.diff.snapshot
    });

    assert.strictEqual(putReceived, true);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'UPDATED');
    assert.deepStrictEqual(result.persistedAddresses, ['159.26.98.240/32', '159.26.98.242/32', '74.39.42.139/32']);
    assert.ok(result.snapshot);
  });

  // --- [TEST 11] Strictly Read-Only Service Startup & Reconcile ---
  await test('Strictly Read-Only Service Startup & Reconcile (0 writes unattended, APPROVAL_REQUIRED)', async () => {
    // 1. Verify privacy-relay-service.js source has 0 unattended mutation calls
    const serviceSource = fs.readFileSync(path.resolve(__dirname, '../companion/privacy-relay-service.js'), 'utf8');

    // Check service startup
    assert.ok(!serviceSource.includes('await this.firewallGuardian.reconcile()'));
    assert.ok(!serviceSource.includes('this.firewallGuardian.start(60000)'));
    assert.ok(serviceSource.includes('interactive approval required for mutations'));

    // Check /firewall-guardian/reconcile POST endpoint
    assert.ok(!serviceSource.includes('const result = await this.firewallGuardian.reconcile();'));
    assert.ok(serviceSource.includes("status: 'APPROVAL_REQUIRED'"));
    assert.ok(serviceSource.includes("Automatic firewall mutations via HTTP endpoint are strictly prohibited"));

    // 2. Verify FirewallGuardian._reconcile() returns APPROVAL_REQUIRED when diff exists, with 0 writes
    const liveFw = {
      id: DEFAULT_FIREWALL_ID,
      name: 'xpider-fw',
      droplet_ids: [DEFAULT_DROPLET_ID],
      tags: [DEFAULT_TRANSACTION_TAG],
      inbound_rules: [
        { protocol: 'tcp', ports: PORT, sources: { addresses: ['159.26.98.240/32', '74.39.42.139/32'] } }
      ]
    };

    let writeCount = 0;
    const guardian = new FirewallGuardian({
      detectNetwork: async () => ({ ip: '159.26.98.242', isProton: true, isProtonDefaultRoute: true }),
      request: async (t, m) => {
        if (m === 'PUT') writeCount++;
        return { status: 200, json: { firewall: liveFw } };
      }
    });

    const recResult = await guardian._reconcile();
    assert.strictEqual(recResult.ok, true);
    assert.strictEqual(recResult.status, 'APPROVAL_REQUIRED');
    assert.strictEqual(recResult.changed, false);
    assert.strictEqual(writeCount, 0, 'Reconcile must make exactly 0 writes to Cloud Firewall');
    assert.ok(recResult.note.includes('0 mutations made'));
  });

  console.log('\n========================================================================');
  console.log(`  ALL 11 TESTS PASSED! (${passed}/${total}) — RC3.59 P0 SECURITY VERIFIED`);
  console.log('========================================================================\n');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
