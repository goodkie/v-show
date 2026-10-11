/**
 * test_r6_9g10_3_7_1_4_physical_gate.js
 * 
 * [Issue #6 R6.9G.10.3.7.1.4 IMMUTABLE SAME-EGRESS ENROLLMENT SEAL]
 * Comprehensive Test Suite for Immutable Egress Trust Anchor Policy:
 * 
 * 1. Test 1: First enrollment creates immutable trust anchor (group=VPS-PRIMARY-1, FP-A).
 * 2. Test 2: Additional node in SAME group with matching FP-A succeeds (PASS).
 * 3. Test 3: Additional node in SAME group with DIFFERENT FP-B is rejected with HTTP 409 (EGRESS_PIN_MISMATCH).
 *            Asserts: Global pin remains FP-A, existing nodes unchanged, conflicting node not trusted.
 * 4. Test 4: Additional node with DIFFERENT group while anchor exists is rejected with HTTP 409 (EGRESS_IDENTITY_GROUP_MISMATCH).
 * 5. Test 5: Deterministic trust anchor restoration across Companion restart.
 *            Negative check: conflicting nodes in config without metadata fail closed without guessing.
 * 6. Test 6: Explicit destructive reset workflow (POST /physical-gate/reset-trust) clears anchor & resets nodes.
 * 7. Test 7: Fallback node (OPAL_OVPN) cannot be enrolled before primary OPAL_WG anchor exists.
 * 8. Test 8: Regression - Zero mockRouteTable / clean production attestation boundary preserved.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const { PrivacyRelayService } = require('./companion/privacy-relay-service');
const { PhysicalGate } = require('./companion/physical-gate');
const { WindowsNetworkAttestation } = require('./companion/windows-network-attestation');

async function runTests() {
  console.log('================================================================');
  console.log('XPIDER R6.9G.10.3.7.1.4 IMMUTABLE SAME-EGRESS ENROLLMENT SEAL');
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

  // Helper to spin up a mock control plane client
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

    // Mock verifyNodeEgress
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
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(b); } catch (_) {}
            resolve({ status: res.statusCode, body: json || b });
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
        cfgPath,
        setCanaryFp: (fp) => { currentCanaryFingerprint = fp; },
        setCanaryVerified: (v) => { canaryVerified = v; }
      });
    } finally {
      await relay.stop();
      try { fs.unlinkSync(cfgPath); } catch (_) {}
    }
  }

  // =========================================================================
  // TEST 1: First enrollment creates trust anchor
  // =========================================================================
  await test('Rule A: First enrollment establishes global trust anchor (FP-A / VPS-PRIMARY-1)', async () => {
    const initialConfig = {
      version: '1.0.3',
      nodes: [
        { id: 'node-wg-1', type: 'HTTP_PROXY', host: '10.66.66.1', port: 3128, transportBinding: 'OPAL_WG' },
        { id: 'node-ovpn-1', type: 'HTTP_PROXY', host: '10.67.67.1', port: 3128, transportBinding: 'OPAL_OVPN' }
      ]
    };

    await withRelay(initialConfig, async ({ relay, post, setCanaryFp }) => {
      setCanaryFp('sha256:fingerprint-alpha');

      const res = await post('/enroll-egress', {
        nodeId: 'node-wg-1',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.pinnedFingerprint, 'sha256:fingerprint-alpha');
      assert.strictEqual(res.body.egressIdentityGroup, 'VPS-PRIMARY-1');

      // Assert global trust anchor created
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fingerprint-alpha');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');

      // Assert node stored values
      const wgNode = relay.pool.nodes.find(n => n.id === 'node-wg-1');
      assert.strictEqual(wgNode.expectedEgressFingerprint, 'sha256:fingerprint-alpha');
      assert.strictEqual(wgNode.egressIdentityGroup, 'VPS-PRIMARY-1');
    });
  });

  // =========================================================================
  // TEST 2: Second node in SAME group with MATCHING fingerprint succeeds
  // =========================================================================
  await test('Rule B: Additional node in SAME group with matching FP-A succeeds', async () => {
    const initialConfig = {
      version: '1.0.3',
      nodes: [
        { id: 'node-wg-1', type: 'HTTP_PROXY', host: '10.66.66.1', port: 3128, transportBinding: 'OPAL_WG' },
        { id: 'node-ovpn-1', type: 'HTTP_PROXY', host: '10.67.67.1', port: 3128, transportBinding: 'OPAL_OVPN' }
      ]
    };

    await withRelay(initialConfig, async ({ relay, post, setCanaryFp }) => {
      setCanaryFp('sha256:fingerprint-alpha');

      // Enroll WG
      await post('/enroll-egress', {
        nodeId: 'node-wg-1',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      // Enroll OVPN with SAME fingerprint
      const res2 = await post('/enroll-egress', {
        nodeId: 'node-ovpn-1',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.success, true);
      assert.strictEqual(res2.body.pinnedFingerprint, 'sha256:fingerprint-alpha');

      // Both nodes now share identical values
      const wg = relay.pool.nodes.find(n => n.id === 'node-wg-1');
      const ovpn = relay.pool.nodes.find(n => n.id === 'node-ovpn-1');
      assert.strictEqual(wg.expectedEgressFingerprint, 'sha256:fingerprint-alpha');
      assert.strictEqual(ovpn.expectedEgressFingerprint, 'sha256:fingerprint-alpha');
      assert.strictEqual(wg.egressIdentityGroup, 'VPS-PRIMARY-1');
      assert.strictEqual(ovpn.egressIdentityGroup, 'VPS-PRIMARY-1');

      // Global anchor remains unchanged
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fingerprint-alpha');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');
    });
  });

  // =========================================================================
  // TEST 3: Second node in SAME group with DIFFERENT fingerprint is rejected
  // =========================================================================
  await test('Rule B & Final Blocker: Conflicting fingerprint (FP-B) returns HTTP 409 & preserves anchor FP-A', async () => {
    const initialConfig = {
      version: '1.0.3',
      nodes: [
        { id: 'node-wg-1', type: 'HTTP_PROXY', host: '10.66.66.1', port: 3128, transportBinding: 'OPAL_WG' },
        { id: 'node-ovpn-bad', type: 'HTTP_PROXY', host: '10.67.67.1', port: 3128, transportBinding: 'OPAL_OVPN' }
      ]
    };

    await withRelay(initialConfig, async ({ relay, post, setCanaryFp }) => {
      setCanaryFp('sha256:fingerprint-alpha');

      // 1. Establish anchor with WG
      await post('/enroll-egress', {
        nodeId: 'node-wg-1',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      // 2. Attempt to enroll bad OVPN node exiting via FP-B
      setCanaryFp('sha256:fingerprint-beta');

      const resBad = await post('/enroll-egress', {
        nodeId: 'node-ovpn-bad',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      // Must be rejected with HTTP 409
      assert.strictEqual(resBad.status, 409, 'Must return HTTP 409 Conflict');
      assert.strictEqual(resBad.body.success, false);
      assert.strictEqual(resBad.body.reason, 'EGRESS_PIN_MISMATCH');

      // Invariant: Global anchor MUST NOT BE MUTATED
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fingerprint-alpha', 'Global pin must remain FP-A');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');

      // Invariant: WG node remains untouched
      const wg = relay.pool.nodes.find(n => n.id === 'node-wg-1');
      assert.strictEqual(wg.expectedEgressFingerprint, 'sha256:fingerprint-alpha');

      // Invariant: Bad node is NOT marked trusted
      const bad = relay.pool.nodes.find(n => n.id === 'node-ovpn-bad');
      assert.strictEqual(bad.expectedEgressFingerprint, undefined, 'Bad node must not have expectedEgressFingerprint set');
    });
  });

  // =========================================================================
  // TEST 4: Enrollment with DIFFERENT group while anchor exists is rejected
  // =========================================================================
  await test('Rule B: Enrolling different identity group while anchor exists returns HTTP 409', async () => {
    const initialConfig = {
      version: '1.0.3',
      nodes: [
        { id: 'node-wg-1', type: 'HTTP_PROXY', host: '10.66.66.1', port: 3128, transportBinding: 'OPAL_WG' },
        { id: 'node-wg-2', type: 'HTTP_PROXY', host: '10.66.66.1', port: 3128, transportBinding: 'OPAL_WG' }
      ]
    };

    await withRelay(initialConfig, async ({ relay, post, setCanaryFp }) => {
      setCanaryFp('sha256:fingerprint-alpha');

      await post('/enroll-egress', {
        nodeId: 'node-wg-1',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      // Attempt to enroll node with DIFFERENT group
      const resDiffGroup = await post('/enroll-egress', {
        nodeId: 'node-wg-2',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'VPS-DIFFERENT-GROUP'
      });

      assert.strictEqual(resDiffGroup.status, 409);
      assert.strictEqual(resDiffGroup.body.success, false);
      assert.strictEqual(resDiffGroup.body.reason, 'EGRESS_IDENTITY_GROUP_MISMATCH');

      // Global pins remain intact
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:fingerprint-alpha');
    });
  });

  // =========================================================================
  // TEST 5: Deterministic trust anchor restoration across Companion restart
  // =========================================================================
  await test('Rule F: Deterministic trust anchor restoration across process restart', async () => {
    const savedConfig = {
      version: '1.0.3',
      physicalGate: {
        enabled: true,
        pinnedEgressFingerprint: 'sha256:persisted-fp-alpha',
        pinnedEgressIdentityGroup: 'VPS-PRIMARY-1'
      },
      nodes: [
        {
          id: 'node-wg-1',
          type: 'HTTP_PROXY',
          host: '10.66.66.1',
          port: 3128,
          transportBinding: 'OPAL_WG',
          egressIdentityGroup: 'VPS-PRIMARY-1',
          expectedEgressFingerprint: 'sha256:persisted-fp-alpha'
        },
        {
          id: 'node-ovpn-1',
          type: 'HTTP_PROXY',
          host: '10.67.67.1',
          port: 3128,
          transportBinding: 'OPAL_OVPN',
          egressIdentityGroup: 'VPS-PRIMARY-1',
          expectedEgressFingerprint: 'sha256:persisted-fp-alpha'
        }
      ]
    };

    const cfgPath = path.join(tmpDir, `test_restart_cfg_${Date.now()}.json`);
    fs.writeFileSync(cfgPath, JSON.stringify(savedConfig, null, 2), 'utf8');

    try {
      const restartedRelay = new PrivacyRelayService({
        configFile: cfgPath,
        controlToken: 'restart-token-secret-test-32-chars'
      });

      // Assert anchor restored deterministically on startup
      assert.strictEqual(restartedRelay.physicalGate.pinnedEgressFingerprint, 'sha256:persisted-fp-alpha');
      assert.strictEqual(restartedRelay.physicalGate.pinnedEgressIdentityGroup, 'VPS-PRIMARY-1');

      // Negative check: Disagreeing nodes without metadata fail closed
      const corruptConfig = {
        version: '1.0.3',
        physicalGate: { enabled: true },
        nodes: [
          { id: 'n1', egressIdentityGroup: 'GRP-1', expectedEgressFingerprint: 'FP-1' },
          { id: 'n2', egressIdentityGroup: 'GRP-2', expectedEgressFingerprint: 'FP-2' }
        ]
      };
      const corruptCfgPath = path.join(tmpDir, `test_corrupt_cfg_${Date.now()}.json`);
      fs.writeFileSync(corruptCfgPath, JSON.stringify(corruptConfig, null, 2), 'utf8');

      const corruptRelay = new PrivacyRelayService({
        configFile: corruptCfgPath,
        controlToken: 'restart-token-secret-test-32-chars'
      });
      assert.strictEqual(corruptRelay.physicalGate.pinnedEgressFingerprint, null, 'Conflicting nodes must not guess anchor');
      try { fs.unlinkSync(corruptCfgPath); } catch (_) {}
    } finally {
      try { fs.unlinkSync(cfgPath); } catch (_) {}
    }
  });

  // =========================================================================
  // TEST 6: Explicit destructive reset workflow
  // =========================================================================
  await test('Rule E: Explicit reset workflow (POST /physical-gate/reset-trust) clears anchor & resets nodes', async () => {
    const initialConfig = {
      version: '1.0.3',
      nodes: [
        { id: 'node-wg-1', type: 'HTTP_PROXY', host: '10.66.66.1', port: 3128, transportBinding: 'OPAL_WG' }
      ]
    };

    await withRelay(initialConfig, async ({ relay, post, setCanaryFp }) => {
      setCanaryFp('sha256:old-vps-fingerprint');

      // 1. Enroll initial anchor
      await post('/enroll-egress', {
        nodeId: 'node-wg-1',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'OLD-VPS-GROUP'
      });
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:old-vps-fingerprint');

      // 2. Perform explicit destructive reset
      const resetRes = await post('/physical-gate/reset-trust', {});
      assert.strictEqual(resetRes.status, 200);
      assert.strictEqual(resetRes.body.success, true);
      assert.strictEqual(resetRes.body.action, 'PHYSICAL_EGRESS_TRUST_RESET');

      // Assert global pins are cleared
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, null);
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, null);

      // Assert enrolled nodes are unverified
      const node = relay.pool.nodes.find(n => n.id === 'node-wg-1');
      assert.strictEqual(node.expectedEgressFingerprint, null);

      // 3. New anchor can now be enrolled cleanly
      setCanaryFp('sha256:new-vps-fingerprint');
      const reEnroll = await post('/enroll-egress', {
        nodeId: 'node-wg-1',
        transportBinding: 'OPAL_WG',
        egressIdentityGroup: 'NEW-VPS-GROUP'
      });
      assert.strictEqual(reEnroll.status, 200);
      assert.strictEqual(relay.physicalGate.pinnedEgressFingerprint, 'sha256:new-vps-fingerprint');
      assert.strictEqual(relay.physicalGate.pinnedEgressIdentityGroup, 'NEW-VPS-GROUP');
    });
  });

  // =========================================================================
  // TEST 7: Fallback node cannot be enrolled without primary WG anchor
  // =========================================================================
  await test('Rule C: Fallback OPAL_OVPN node enrollment rejected before primary OPAL_WG exists', async () => {
    const initialConfig = {
      version: '1.0.3',
      nodes: [
        { id: 'node-ovpn-1', type: 'HTTP_PROXY', host: '10.67.67.1', port: 3128, transportBinding: 'OPAL_OVPN' }
      ]
    };

    await withRelay(initialConfig, async ({ post, setCanaryFp }) => {
      setCanaryFp('sha256:fingerprint-ovpn');

      const res = await post('/enroll-egress', {
        nodeId: 'node-ovpn-1',
        transportBinding: 'OPAL_OVPN',
        egressIdentityGroup: 'VPS-PRIMARY-1'
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.reason, 'PRIMARY_WG_ANCHOR_REQUIRED');
    });
  });

  // =========================================================================
  // TEST 8: Zero mockRouteTable / clean production attestation preserved
  // =========================================================================
  await test('Blocker 3 Regression: WindowsNetworkAttestation has zero mockRouteTable or test branches', () => {
    const fileContent = fs.readFileSync(path.resolve('companion/windows-network-attestation.js'), 'utf8');
    assert.strictEqual(fileContent.includes('mockRouteTable'), false, 'mockRouteTable must not exist in production file');
    assert.strictEqual(fileContent.includes('mock_routes'), false, 'mock_routes must not exist in production file');
    assert.strictEqual(fileContent.includes('XPIDER_MOCK_ROUTES'), false, 'XPIDER_MOCK_ROUTES must not exist in production file');

    const instance = new WindowsNetworkAttestation();
    assert.strictEqual(instance.mockRouteTable, undefined);
  });

  console.log('\n================================================================');
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Test Suite Failed:', e);
  process.exit(1);
});
