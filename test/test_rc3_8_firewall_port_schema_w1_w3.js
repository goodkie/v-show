/**
 * test_rc3_8_firewall_port_schema_w1_w3.js
 * 
 * XPIDER AutoForm Sender Pro — RC3.8 DigitalOcean Firewall Port Schema (W1 - W3) Test Suite
 * Authority Source: goodkie/v-show Issue #6 (Comment #6253598514)
 * Protocol: OCA-DEV-1.4
 * 
 * Verifies:
 *   - W1: API port schema replaces literal 'all' with '0' across TCP, UDP, ICMP; shared constant helper.
 *   - W2: Provider contract validation for all 3 mutation paths (initial POST, pre-billable PUT, final proxy PUT).
 *   - W3: Live-style 422 provider validation rollback regression (tag + key deleted, journal cleared, zero droplet calls).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  PrivateEgressProvisioner,
  DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES,
  getDigitalOceanDefaultOutboundRules,
  validateDigitalOceanFirewallRule,
  validateDigitalOceanFirewallPayload
} = require('../companion/private-egress-provisioner');

async function runTests() {
  console.log('========================================================================');
  console.log('  RUNNING RC3.8 DIGITALOCEAN FIREWALL PORT-SCHEMA (W1 - W3) SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 7;

  // ---------------------------------------------------------------------------
  // TEST 1: [W1] Deterministic Outbound Rules Constant & Shared Helper
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 1: W1] Deterministic Outbound Rules Constant & Shared Helper');
  {
    assert(Array.isArray(DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES), 'Rules must be an array');
    assert.strictEqual(DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES.length, 3, 'Must have exactly 3 outbound rules (tcp, udp, icmp)');

    const protocols = ['tcp', 'udp', 'icmp'];
    for (const proto of protocols) {
      const rule = DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES.find(r => r.protocol === proto);
      assert(rule, `Must have outbound rule for protocol: ${proto}`);
      assert.strictEqual(rule.ports, '0', `Protocol ${proto} ports must strictly be '0' (never 'all')`);
      assert(rule.destinations && Array.isArray(rule.destinations.addresses), `${proto} rule must define destinations.addresses`);
      assert(rule.destinations.addresses.includes('0.0.0.0/0'), 'Must include 0.0.0.0/0');
      assert(rule.destinations.addresses.includes('::/0'), 'Must include ::/0');
    }

    // Verify ZERO occurrences of 'all' in the constant
    const jsonStr = JSON.stringify(DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES);
    assert(!jsonStr.includes('"all"'), 'DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES must not contain literal "all"');

    // Test getDigitalOceanDefaultOutboundRules() produces independent fresh objects
    const copy1 = getDigitalOceanDefaultOutboundRules();
    const copy2 = getDigitalOceanDefaultOutboundRules();
    assert.notStrictEqual(copy1, copy2, 'Helper must return fresh array instances');
    assert.notStrictEqual(copy1[0], copy2[0], 'Helper must return fresh object instances');
    copy1[0].ports = 'modified';
    assert.strictEqual(copy2[0].ports, '0', 'Mutations to returned array must not pollute other calls');
    assert.strictEqual(DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES[0].ports, '0', 'Constant must remain untouched');

    console.log('    ✅ W1 verified: Shared outbound rules constant uses ports "0" across tcp, udp, icmp with zero "all".\n');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 2: [W2] Provider Contract Rule & Payload Validator
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 2: W2] Provider Contract Rule & Payload Validator');
  {
    // Rejects literal 'all'
    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: 'all', destinations: { addresses: ['0.0.0.0/0'] } });
    }, (err) => err.statusCode === 422 && err.message.includes('you must specify a valid range for ports'), 'Must reject ports: "all" with 422');

    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'udp', ports: 'all', destinations: { addresses: ['0.0.0.0/0'] } });
    }, (err) => err.statusCode === 422 && err.message.includes('you must specify a valid range for ports'), 'Must reject UDP ports: "all" with 422');

    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'icmp', ports: 'all', destinations: { addresses: ['0.0.0.0/0'] } });
    }, (err) => err.statusCode === 422 && err.message.includes('you must specify a valid range for ports'), 'Must reject ICMP ports: "all" with 422');

    // Rejects ICMP with ports != '0'
    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'icmp', ports: '80', destinations: { addresses: ['0.0.0.0/0'] } });
    }, (err) => err.statusCode === 422, 'Must reject ICMP with ports != "0"');

    // Rejects invalid TCP/UDP port strings
    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: 'invalid' });
    }, (err) => err.statusCode === 422, 'Must reject non-numeric port string');

    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: '99999' });
    }, (err) => err.statusCode === 422, 'Must reject port > 65535');

    assert.throws(() => {
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: '8000-7000' });
    }, (err) => err.statusCode === 422, 'Must reject inverted port range');

    // Accepts valid specifications
    assert.doesNotThrow(() => {
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: '0', destinations: { addresses: ['0.0.0.0/0'] } });
      validateDigitalOceanFirewallRule({ protocol: 'udp', ports: '0', destinations: { addresses: ['0.0.0.0/0'] } });
      validateDigitalOceanFirewallRule({ protocol: 'icmp', ports: '0', destinations: { addresses: ['0.0.0.0/0'] } });
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: '22', sources: { addresses: ['198.51.100.1/32'] } });
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: '8443', sources: { addresses: ['198.51.100.1/32'] } });
      validateDigitalOceanFirewallRule({ protocol: 'tcp', ports: '8000-9000', destinations: { addresses: ['0.0.0.0/0'] } });
    });

    // Test validateDigitalOceanFirewallPayload
    assert.throws(() => {
      validateDigitalOceanFirewallPayload({
        inbound_rules: [{ protocol: 'tcp', ports: '22' }],
        outbound_rules: [{ protocol: 'tcp', ports: 'all' }]
      });
    }, (err) => err.statusCode === 422, 'Payload validator must reject outbound rules with ports: "all"');

    console.log('    ✅ W2 verified: Validator rejects ports "all" with 422 matching live provider error contract.\n');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 3: [W2] Mutation Path 1: Initial Firewall POST Contract
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 3: W2] Mutation Path 1: Initial Firewall POST Contract');
  {
    let capturedPost = null;
    const prov = new PrivateEgressProvisioner({
      token: 'dop_v1_mock_test_token_rc3_8',
      mockMode: true
    });

    const origMockDoRequest = prov.mockDoRequest.bind(prov);
    prov.mockDoRequest = async function(endpoint, method, body) {
      if (endpoint === '/firewalls' && method === 'POST') {
        capturedPost = JSON.parse(JSON.stringify(body));
      }
      return origMockDoRequest(endpoint, method, body);
    };

    const quote = {
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      size: 's-1vcpu-1gb',
      monthlyCostUsd: 6.00,
      hourlyCostUsd: 0.00893
    };

    await prov.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: quote
    });

    assert(capturedPost, 'Initial firewall POST must have been executed');
    assert(capturedPost.name.startsWith('xpider-fw-'), 'Firewall name must use transaction tag');
    assert.strictEqual(capturedPost.inbound_rules[0].protocol, 'tcp');
    assert.strictEqual(capturedPost.inbound_rules[0].ports, '22');

    // Outbound rules verification
    assert.strictEqual(capturedPost.outbound_rules.length, 3);
    for (const r of capturedPost.outbound_rules) {
      assert.strictEqual(r.ports, '0', `POST outbound rule for ${r.protocol} must have ports "0"`);
      assert.notStrictEqual(r.ports, 'all', `POST outbound rule for ${r.protocol} must NOT have ports "all"`);
    }

    // Verify entire payload passes provider schema validator
    assert.doesNotThrow(() => validateDigitalOceanFirewallPayload(capturedPost));

    console.log('    ✅ W2 Path 1 verified: Initial firewall POST uses ports "0" and passes provider schema validation.\n');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 4: [W2] Mutation Path 2: Pre-Billable firewall:update PUT Contract
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 4: W2] Mutation Path 2: Pre-Billable firewall:update PUT Contract');
  {
    const capturedPuts = [];
    const prov = new PrivateEgressProvisioner({
      token: 'dop_v1_mock_test_token_rc3_8',
      mockMode: true
    });

    const origMockDoRequest = prov.mockDoRequest.bind(prov);
    prov.mockDoRequest = async function(endpoint, method, body) {
      if (endpoint.startsWith('/firewalls/') && method === 'PUT') {
        capturedPuts.push({ endpoint, body: JSON.parse(JSON.stringify(body)) });
      }
      return origMockDoRequest(endpoint, method, body);
    };

    const quote = {
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      size: 's-1vcpu-1gb',
      monthlyCostUsd: 6.00,
      hourlyCostUsd: 0.00893
    };

    await prov.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: quote
    });

    assert(capturedPuts.length >= 2, 'Must have at least 2 PUT calls (pre-billable check + final proxy update)');
    const preBillablePut = capturedPuts[0].body;

    // Check pre-billable PUT outbound rules
    assert(preBillablePut.outbound_rules && preBillablePut.outbound_rules.length === 3, 'Pre-billable PUT must have 3 outbound rules');
    for (const r of preBillablePut.outbound_rules) {
      assert.strictEqual(r.ports, '0', `Pre-billable PUT outbound rule for ${r.protocol} must have ports "0"`);
      assert.notStrictEqual(r.ports, 'all', `Pre-billable PUT outbound rule for ${r.protocol} must NOT have ports "all"`);
    }
    assert.doesNotThrow(() => validateDigitalOceanFirewallPayload(preBillablePut));

    console.log('    ✅ W2 Path 2 verified: Pre-billable firewall:update PUT uses ports "0" and passes provider schema validation.\n');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 5: [W2] Mutation Path 3: Final Proxy Firewall PUT Contract
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 5: W2] Mutation Path 3: Final Proxy Firewall PUT Contract');
  {
    const capturedPuts = [];
    const prov = new PrivateEgressProvisioner({
      token: 'dop_v1_mock_test_token_rc3_8',
      mockMode: true
    });

    const origMockDoRequest = prov.mockDoRequest.bind(prov);
    prov.mockDoRequest = async function(endpoint, method, body) {
      if (endpoint.startsWith('/firewalls/') && method === 'PUT') {
        capturedPuts.push({ endpoint, body: JSON.parse(JSON.stringify(body)) });
      }
      return origMockDoRequest(endpoint, method, body);
    };

    const quote = {
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      size: 's-1vcpu-1gb',
      monthlyCostUsd: 6.00,
      hourlyCostUsd: 0.00893
    };

    await prov.provisionPrivateEgress({
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      verifiedQuote: quote
    });

    const finalProxyPut = capturedPuts[capturedPuts.length - 1].body;

    // Check final proxy PUT inbound rules (proxy port only, no port 22)
    assert.strictEqual(finalProxyPut.inbound_rules.length, 1);
    assert.strictEqual(finalProxyPut.inbound_rules[0].protocol, 'tcp');
    assert.notStrictEqual(finalProxyPut.inbound_rules[0].ports, '22', 'Port 22 must be closed in final proxy firewall');

    // Check final proxy PUT outbound rules
    assert.strictEqual(finalProxyPut.outbound_rules.length, 3);
    for (const r of finalProxyPut.outbound_rules) {
      assert.strictEqual(r.ports, '0', `Final PUT outbound rule for ${r.protocol} must have ports "0"`);
      assert.notStrictEqual(r.ports, 'all', `Final PUT outbound rule for ${r.protocol} must NOT have ports "all"`);
    }
    assert.doesNotThrow(() => validateDigitalOceanFirewallPayload(finalProxyPut));

    console.log('    ✅ W2 Path 3 verified: Final proxy firewall PUT uses ports "0" and passes provider schema validation.\n');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 6: [W3] Live-Style Provider Validation Failure (422) Rollback Regression
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 6: W3] Live-Style Provider Validation Failure (422) Rollback Regression');
  {
    let dropletCalls = 0;
    const prov = new PrivateEgressProvisioner({
      token: 'dop_v1_mock_test_token_rc3_8',
      mockMode: true,
      simulateFirewallSchema422: true
    });

    const origMockDoRequest = prov.mockDoRequest.bind(prov);
    prov.mockDoRequest = async function(endpoint, method, body) {
      if (endpoint === '/droplets' && method === 'POST') {
        dropletCalls++;
      }
      return origMockDoRequest(endpoint, method, body);
    };

    const quote = {
      tier: 'ULTRA_ECONOMY',
      region: 'nyc3',
      size: 's-1vcpu-1gb',
      monthlyCostUsd: 6.00,
      hourlyCostUsd: 0.00893
    };

    let caughtError = null;
    try {
      await prov.provisionPrivateEgress({
        tier: 'ULTRA_ECONOMY',
        region: 'nyc3',
        verifiedQuote: quote
      });
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError, 'Must fail closed on 422 firewall configuration error');
    assert(caughtError.message.includes('Cloud Firewall configuration failed: you must specify a valid range for ports'),
      `Error message must contain exact provider failure, got: "${caughtError.message}"`);

    // Must NOT contain CLEANUP_REQUIRED because rollback succeeded cleanly
    assert(!caughtError.message.includes('CLEANUP_REQUIRED'),
      'Clean rollback must not report CLEANUP_REQUIRED');

    // Verify ZERO droplet creation calls
    assert.strictEqual(dropletCalls, 0, 'EXACTLY ZERO Droplet allocation calls must occur when firewall fails');

    // Verify rollback deleted created SSH key and transaction tag
    assert(prov.mockDeletedResources.keys.length > 0, 'Ephemeral SSH key must be deleted in rollback');
    assert(prov.mockDeletedResources.tags.length > 0, 'Transaction tag must be deleted in rollback');

    // Verify journal cleared after clean rollback
    const journal = prov.loadTransactionOwnership();
    assert.strictEqual(journal, null, 'Transaction ownership journal must be completely cleared after verified clean rollback');

    console.log('    ✅ W3 verified: Provider 422 error rolls back SSH key and tag, leaves journal clean, and makes zero droplet calls.\n');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 7: [Hardening] Extension/Companion Version Mismatch Pre-Mutation Rejection
  // ---------------------------------------------------------------------------
  console.log('>>> [TEST 7: Hardening] Extension/Companion Version Mismatch Pre-Mutation Rejection');
  {
    const { handleMessage } = require('../companion/native_host/xpider_native_host');

    // 1. Older extension build (RC3.1) in VERIFY
    const oldVerifyRes = await handleMessage({
      action: 'VERIFY_PRIVATE_EGRESS_PLAN',
      payload: {
        token: 'dop_v1_mock_test_token_rc3_8',
        extensionBuildId: 'R6.9G.10.3.7.1.4.15-20261017-PRIVATE-EGRESS-RC3.1'
      }
    });
    assert.strictEqual(oldVerifyRes.success, false);
    assert(oldVerifyRes.error.includes('EXTENSION_COMPANION_VERSION_MISMATCH'),
      `Must reject mismatched extension with EXTENSION_COMPANION_VERSION_MISMATCH, got: ${oldVerifyRes.error}`);

    // 2. Older extension build (RC3.1) in PROVISION
    const oldProvisionRes = await handleMessage({
      action: 'PROVISION_PRIVATE_EGRESS',
      payload: {
        token: 'dop_v1_mock_test_token_rc3_8',
        extensionBuildId: 'R6.9G.10.3.7.1.4.15-20261017-PRIVATE-EGRESS-RC3.1'
      }
    });
    assert.strictEqual(oldProvisionRes.success, false);
    assert(oldProvisionRes.error.includes('EXTENSION_COMPANION_VERSION_MISMATCH'),
      `Must reject mismatched extension with EXTENSION_COMPANION_VERSION_MISMATCH, got: ${oldProvisionRes.error}`);

    console.log('    ✅ Version parity verified: Mismatched extension build is strictly rejected before any provider mutation.\n');
    passed++;
  }

  console.log('========================================================================');
  console.log(`  ALL ${passed}/${total} RC3.8 FIREWALL PORT-SCHEMA & PARITY CHECKS PASSED 100%`);
  console.log('========================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
