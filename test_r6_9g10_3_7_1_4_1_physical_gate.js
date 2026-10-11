/**
 * test_r6_9g10_3_7_1_4_1_physical_gate.js
 * 
 * [Issue #6 R6.9G.10.3.7.1.4.1 FINAL ENROLLMENT POLICY + OWNER RESET CONTROL]
 * Unit & Integration Test Suite for Strict Enrollment Policy, Rule C Invariant,
 * Approved Private Endpoints, and Synchronous Owner Reset Trust Control:
 * 
 * 1. Test 1: Invalid transport binding (OPAL_IKEV2) rejected with HTTP 400 (INVALID_TRANSPORT_BINDING)
 *            Asserts: Rejected before canary probe, no trust anchor created.
 * 2. Test 2: Unapproved private endpoint (127.0.0.1:8982 or 10.66.66.2:3128) rejected with HTTP 400
 *            (UNAPPROVED_VPN_PROXY_ENDPOINT) before canary probe.
 * 3. Test 3: Rule C Negative 1: Global pin exists in metadata, but NO enrolled OPAL_WG node in group
 *            -> Attempting OPAL_OVPN enrollment returns HTTP 400 (PRIMARY_WG_ANCHOR_REQUIRED).
 * 4. Test 4: Rule C Negative 2: Enrolled WG node deleted / untrusted
 *            -> Attempting OPAL_OVPN enrollment returns HTTP 400 (PRIMARY_WG_ANCHOR_REQUIRED).
 * 5. Test 5: Valid primary OPAL_WG (10.66.66.1:3128) enrollment creates immutable trust anchor (FP-A).
 * 6. Test 6: Fallback OPAL_OVPN (10.67.67.1:3128) in SAME group with matching FP-A succeeds (PASS).
 * 7. Test 7: Additional node in same group with divergent FP-B rejected with HTTP 409 (EGRESS_PIN_MISMATCH).
 *            Anchor FP-A strictly preserved.
 * 8. Test 8: Additional node in divergent group rejected with HTTP 409 (EGRESS_IDENTITY_GROUP_MISMATCH).
 *            Anchor group strictly preserved.
 * 9. Test 9: Destructive reset workflow (POST /physical-gate/reset-trust) synchronously returns
 *            ready = false and reasons including PHYSICAL_EGRESS_TRUST_RESET, clearing all anchors.
 * 10. Test 10: Deterministic trust anchor restoration across restart.
 * 11. Test 11: PrivacyGateway.resetPhysicalEgressTrust() extension integration.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const { PrivacyRelayService } = require('./companion/privacy-relay-service');
const { PhysicalGate } = require('./companion/physical-gate');
const { PrivacyGatewayEngine } = require('./send_message_backup/modules/privacy-gateway');

async function runTests() {
  console.log('================================================================');
  console.log('XPIDER R6.9G.10.3.7.1.4.1 FINAL ENROLLMENT POLICY + OWNER RESET');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;
  const tmpDir = os.tmpdir();

  function test(name, fn) {
    total++;
    process.stdout.write(`TEST [${total}] ${name} ... `);
    try {
      const res = fn();
      if (res && typeof res.then === 'function') {
        return res.then(() => {
          console.log('PASS');
          passed++;
        }).catch(err => {
          console.log('FAIL');
          console.error(err);
          process.exitCode = 1;
        });
      } else {
        console.log('PASS');
        passed++;
      }
    } catch (err) {
      console.log('FAIL');
      console.error(err);
      process.exitCode = 1;
    }
  }

  async function withRelay(initialConfig, fn) {
    const cfgPath = path.join(tmpDir, `test_pool_cfg_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    fs.writeFileSync(cfgPath, JSON.stringify(initialConfig, null, 2), 'utf8');

    const token = 'test-token-32-chars-long-secret-key-12345';
    const controlPort = 19890 + Math.floor(Math.random() * 500);
    const proxyPort = 19990 + Math.floor(Math.random() * 500);

    const relay = new PrivacyRelayService({
      controlPort,
      proxyPort,
      configFile: cfgPath,
      controlToken: token
    });

    let currentCanaryFingerprint = 'sha256:fingerprint-alpha';
    let canaryVerified = true;
    relay.verifyNodeEgress = async (node, timeout, url) => {
      if (!canaryVerified) return { verified: false, reason: 'SIMULATED_PROBE_ERROR' };
      return { verified: true, fingerprint: currentCanaryFingerprint };
    };

    await relay.start();

    async function post(pathname, body = {}) {
      return new Promise((resolve) => {
        const payload = JSON.stringify(body);
        const req = http.request({
          hostname: '127.0.0.1',
          port: controlPort,
          path: pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data) });
            } catch (_) {
              resolve({ status: res.statusCode, raw: data });
            }
          });
        });
        req.on('error', (e) => resolve({ status: 500, error: e.message }));
        req.write(payload);
        req.end();
      });
    }

    try {
      await fn({
        relay,
        post,
        token,
        controlPort,
        setCanaryFp: (fp) => { currentCanaryFingerprint = fp; },
        setCanaryVerified: (v) => { canaryVerified = v; },
        readSavedConfig: () => JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      });
    } finally {
      await relay.stop();
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    }
  }

  // 1. Test 1: Invalid transport binding (OPAL_IKEV2) rejected with HTTP 400
  await test('1. Invalid transport binding rejected with HTTP 400 before canary', async () => {
    await withRelay({
      nodes: [
        { id: 'node-ikev2', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, relay }) => {
      const res = await post('/enroll-egress', {
        nodeId: 'node-ikev2',
        transportBinding: 'OPAL_IKEV2',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.reason, 'INVALID_TRANSPORT_BINDING');
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, null, 'No trust anchor created');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, null, 'No anchor group created');
    });
  });

  // 2. Test 2: Unapproved private endpoint rejected with HTTP 400
  await test('2. Unapproved private endpoint rejected with HTTP 400 before canary', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wrong-host', host: '127.0.0.1', port: 3128, type: 'HTTP_PROXY', active: true },
        { id: 'node-wrong-port', host: '10.66.66.1', port: 8080, type: 'HTTP_PROXY', active: true },
        { id: 'node-ovpn-wrong-host', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, relay }) => {
      // OPAL_WG with 127.0.0.1:3128
      const res1 = await post('/enroll-egress', {
        nodeId: 'node-wrong-host',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(res1.status, 400);
      assert.strictEqual(res1.data.reason, 'UNAPPROVED_VPN_PROXY_ENDPOINT');

      // OPAL_WG with 10.66.66.1:8080
      const res2 = await post('/enroll-egress', {
        nodeId: 'node-wrong-port',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(res2.status, 400);
      assert.strictEqual(res2.data.reason, 'UNAPPROVED_VPN_PROXY_ENDPOINT');

      // OPAL_OVPN with 10.66.66.1:3128 (OVPN requires 10.67.67.1:3128)
      const res3 = await post('/enroll-egress', {
        nodeId: 'node-ovpn-wrong-host',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(res3.status, 400);
      assert.strictEqual(res3.data.reason, 'UNAPPROVED_VPN_PROXY_ENDPOINT');

      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, null, 'No trust anchor created');
    });
  });

  // 3. Test 3: Rule C Negative 1: Global pin exists, but NO enrolled OPAL_WG node in pool
  await test('3. Rule C: Global pin exists but NO enrolled OPAL_WG node -> OVPN rejected with 400', async () => {
    await withRelay({
      physicalGate: {
        pinnedEgressFingerprint: 'sha256:fingerprint-alpha',
        pinnedEgressIdentityGroup: 'VPS-PRIMARY-1'
      },
      nodes: [
        { id: 'node-ovpn', host: '10.67.67.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, relay }) => {
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fingerprint-alpha');
      
      const res = await post('/enroll-egress', {
        nodeId: 'node-ovpn',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.reason, 'PRIMARY_WG_ANCHOR_REQUIRED');
      assert.strictEqual(relay.pool.nodes[0].expectedEgressFingerprint, undefined, 'OVPN node must not be enrolled');
    });
  });

  // 4. Test 4: Rule C Negative 2: Enrolled WG node deleted / untrusted -> OVPN rejected with 400
  await test('4. Rule C: Enrolled WG node deleted / untrusted -> OVPN rejected with 400', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true },
        { id: 'node-ovpn', host: '10.67.67.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, relay }) => {
      // 1. Enroll WG
      const resWg = await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(resWg.status, 200);

      // 2. Remove / untrust WG node
      const removeRes = await post('/remove-node', { id: 'node-wg' });
      assert.strictEqual(removeRes.status, 200);

      // 3. Attempt OVPN enrollment -> must fail because WG anchor is gone
      const resOvpn = await post('/enroll-egress', {
        nodeId: 'node-ovpn',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(resOvpn.status, 400);
      assert.strictEqual(resOvpn.data.reason, 'PRIMARY_WG_ANCHOR_REQUIRED');
    });
  });

  // 5. Test 5: Valid primary OPAL_WG creates immutable trust anchor (FP-A)
  await test('5. Valid primary OPAL_WG (10.66.66.1:3128) creates immutable trust anchor', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, relay, setCanaryFp }) => {
      setCanaryFp('sha256:fp-anchor-alpha');
      const res = await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.pinnedFingerprint, 'sha256:fp-anchor-alpha');
      assert.strictEqual(res.data.egressIdentityGroup, 'VPS-PRIMARY-1');
      assert.strictEqual(res.data.transportBinding, 'OPAL_WG');

      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fp-anchor-alpha');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');
    });
  });

  // 6. Test 6: Fallback OPAL_OVPN (10.67.67.1:3128) in SAME group with matching FP-A succeeds
  await test('6. Fallback OPAL_OVPN (10.67.67.1:3128) in SAME group with matching FP succeeds', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true },
        { id: 'node-ovpn', host: '10.67.67.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, setCanaryFp, relay }) => {
      setCanaryFp('sha256:fp-anchor-alpha');
      const resWg = await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(resWg.status, 200);

      const resOvpn = await post('/enroll-egress', {
        nodeId: 'node-ovpn',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(resOvpn.status, 200);
      assert.strictEqual(resOvpn.data.pinnedFingerprint, 'sha256:fp-anchor-alpha');
      assert.strictEqual(resOvpn.data.transportBinding, 'OPAL_OVPN');
      assert.strictEqual(relay.pool.nodes.length, 2);
    });
  });

  // 7. Test 7: Additional node in same group with divergent FP-B rejected with HTTP 409
  await test('7. Divergent fingerprint in same group rejected with HTTP 409 (EGRESS_PIN_MISMATCH)', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true },
        { id: 'node-ovpn-divergent', host: '10.67.67.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, setCanaryFp, relay }) => {
      setCanaryFp('sha256:fp-anchor-alpha');
      await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      // Probe OVPN with different FP
      setCanaryFp('sha256:fp-divergent-beta');
      const resDivergent = await post('/enroll-egress', {
        nodeId: 'node-ovpn-divergent',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(resDivergent.status, 409);
      assert.strictEqual(resDivergent.data.reason, 'EGRESS_PIN_MISMATCH');
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fp-anchor-alpha', 'Anchor FP must remain untouched');
    });
  });

  // 8. Test 8: Additional node in divergent group rejected with HTTP 409 (EGRESS_IDENTITY_GROUP_MISMATCH)
  await test('8. Divergent identity group rejected with HTTP 409 (EGRESS_IDENTITY_GROUP_MISMATCH)', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true },
        { id: 'node-mismatch-group', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, setCanaryFp, relay }) => {
      setCanaryFp('sha256:fp-anchor-alpha');
      await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      const resMismatch = await post('/enroll-egress', {
        nodeId: 'node-mismatch-group',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-SECONDARY-2'
      });
      assert.strictEqual(resMismatch.status, 409);
      assert.strictEqual(resMismatch.data.reason, 'EGRESS_IDENTITY_GROUP_MISMATCH');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1', 'Anchor group must remain untouched');
    });
  });

  // 9. Test 9: Destructive reset workflow (POST /physical-gate/reset-trust)
  await test('9. Reset trust workflow synchronously returns ready=false and PHYSICAL_EGRESS_TRUST_RESET', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ post, relay, readSavedConfig, setCanaryFp }) => {
      setCanaryFp('sha256:fp-anchor-alpha');
      await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fp-anchor-alpha');

      const resetRes = await post('/physical-gate/reset-trust');
      assert.strictEqual(resetRes.status, 200);
      assert.strictEqual(resetRes.data.action, 'PHYSICAL_EGRESS_TRUST_RESET');
      assert.strictEqual(resetRes.data.status.ready, false, 'Synchronously ready must be false');
      assert.ok(resetRes.data.status.reasons.includes('PHYSICAL_EGRESS_TRUST_RESET'), 'Synchronous reasons must include reset tag');

      // State on relay
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, null);
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, null);
      assert.strictEqual(relay.isPaused, true);
      assert.strictEqual(relay.relayReady, false);

      // Persisted config
      const saved = readSavedConfig();
      assert.strictEqual(saved.physicalGate.pinnedEgressFingerprint, null);
      assert.strictEqual(saved.physicalGate.pinnedEgressIdentityGroup, null);
      assert.strictEqual(saved.nodes[0].expectedEgressFingerprint, null);
    });
  });

  // 10. Test 10: Deterministic trust anchor restoration across restart
  await test('10. Deterministic trust anchor restoration across restart', async () => {
    const cfgPath = path.join(tmpDir, `test_pool_restart_${Date.now()}.json`);
    const initialConfig = {
      physicalGate: {
        pinnedEgressFingerprint: 'sha256:fp-restored-anchor',
        pinnedEgressIdentityGroup: 'VPS-PRIMARY-1'
      },
      nodes: [
        {
          id: 'node-restored',
          host: '10.66.66.1',
          port: 3128,
          transportBinding: 'OPAL_WG',
          expectedEgressFingerprint: 'sha256:fp-restored-anchor',
          egressIdentityGroup: 'VPS-PRIMARY-1',
          active: true
        }
      ]
    };
    fs.writeFileSync(cfgPath, JSON.stringify(initialConfig, null, 2), 'utf8');

    const relay = new PrivacyRelayService({
      configFile: cfgPath,
      controlToken: 'test-token-32-chars-long-secret-key-12345'
    });
    try {
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fp-restored-anchor');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');
    } finally {
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    }
  });

  // 11. Test 11: PrivacyGateway.resetPhysicalEgressTrust() extension integration
  await test('11. PrivacyGateway.resetPhysicalEgressTrust() calls endpoint and clears client pin', async () => {
    await withRelay({
      nodes: [
        { id: 'node-wg', host: '10.66.66.1', port: 3128, type: 'HTTP_PROXY', active: true }
      ]
    }, async ({ relay, token, controlPort, setCanaryFp, post }) => {
      setCanaryFp('sha256:fp-anchor-alpha');
      await post('/enroll-egress', {
        nodeId: 'node-wg',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      const pg = new PrivacyGatewayEngine();
      await pg.init({
        relayHost: '127.0.0.1',
        relayControlPort: controlPort,
        relayControlToken: token
      });
      pg.ephemeralRelayToken = token;
      pg.pinnedPhysicalEgressFingerprint = 'sha256:fp-anchor-alpha';
      pg.isGateReady = true;

      const resetRes = await pg.resetPhysicalEgressTrust();
      assert.strictEqual(resetRes.action, 'PHYSICAL_EGRESS_TRUST_RESET');
      assert.strictEqual(resetRes.status.ready, false);
      assert.strictEqual(pg.pinnedPhysicalEgressFingerprint, null);
      assert.strictEqual(pg.isGateReady, false);
      assert.strictEqual(pg.failureReason, 'PHYSICAL_EGRESS_TRUST_RESET');
    });
  });

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('================================================================');
  if (passed === total) {
    console.log('ALL TESTS PASSED 100%');
  } else {
    throw new Error(`${total - passed} tests failed`);
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
