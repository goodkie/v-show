'use strict';
/**
 * test/test_two_layer_network_delegation.js
 *
 * Automated verification suite for Owner Directive #6468052374:
 *  1. X25519 WireGuard keypair & local protected profile generation (zero private key disclosure)
 *  2. FirewallGuardian WireGuard UDP 51820 /32 preview & confirmed-only concurrency guard
 *  3. GLInetOpalDriver SSH RSA host-key compatibility for physical GL-SFT1200 Dropbear daemon
 *  4. Full Two-Layer Verifier execution (DO Precheck, Opal LAN/Route Audit, TLS HTTPS_PROXY CONNECT,
 *     DPAPI encryption, DO & ISP IP leak rejection, 401/407/Drop fail-closed 502)
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  generateWireGuardKeypair,
  ensureLocalOpalWireGuardProfile,
  runAll
} = require('../companion/two-layer-network-verifier');
const {
  FirewallGuardian,
  buildDesiredInboundWithWireGuard,
  generateWireGuardPreviewDiff,
  computeFirewallSnapshot
} = require('../companion/firewall-guardian');
const { GLInetOpalDriver } = require('../companion/router-drivers/glinet-opal');

(async () => {
  console.log('=== [TEST: TWO-LAYER NETWORK DELEGATION & RESIDENTIAL DATA-PLANE] ===');

  // 1. Verify X25519 WireGuard keypair & isolated local profile generation
  const kp = generateWireGuardKeypair();
  assert.strictEqual(Buffer.from(kp.privateKey, 'base64').length, 32, 'WireGuard private key must be 32 bytes');
  assert.strictEqual(Buffer.from(kp.publicKey, 'base64').length, 32, 'WireGuard public key must be 32 bytes');
  assert.notStrictEqual(kp.privateKey, kp.publicKey, 'Private and public keys must differ');

  const tmpWgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-wg-test-'));
  try {
    const profileMeta = ensureLocalOpalWireGuardProfile({
      companionDir: tmpWgDir,
      appDataRoot: path.join(tmpWgDir, 'wireguard')
    });
    assert.strictEqual(profileMeta.profileReady, true);
    assert.strictEqual(profileMeta.privateKeyDisclosed, false);
    assert.strictEqual(profileMeta.clientAddress, '10.66.66.2/32');
    assert.strictEqual(profileMeta.serverAddress, '10.66.66.1/24');
    assert.strictEqual(profileMeta.endpoint, '143.198.40.33:51820');
    assert.ok(!JSON.stringify(profileMeta).includes('PrivateKey'), 'Metadata must never contain private keys');

    const confText = fs.readFileSync(profileMeta.profilePath, 'utf8');
    assert.ok(confText.includes('Address = 10.66.66.2/32'), 'Profile must specify canonical 10.66.66.2/32');
    assert.ok(confText.includes('Endpoint = 143.198.40.33:51820'), 'Profile must specify 143.198.40.33:51820');
    assert.ok(confText.includes(`PublicKey = ${profileMeta.serverPublicKey}`), 'Profile must match server public key');

    // Verify idempotency across calls
    const profileMeta2 = ensureLocalOpalWireGuardProfile({
      companionDir: tmpWgDir,
      appDataRoot: path.join(tmpWgDir, 'wireguard')
    });
    assert.strictEqual(profileMeta2.clientPublicKey, profileMeta.clientPublicKey, 'Must idempotently reuse DPAPI-backed keypair');
    assert.strictEqual(profileMeta2.serverPublicKey, profileMeta.serverPublicKey, 'Must idempotently reuse DPAPI-backed server keypair');
    console.log('  [PASS] 1. Local X25519 WireGuard profile generation, DPAPI persistence, and zero private-key disclosure');
  } finally {
    try { fs.rmSync(tmpWgDir, { recursive: true, force: true }); } catch (_) {}
  }

  // 2. Verify FirewallGuardian WireGuard UDP 51820 /32 additive rule & confirmation gate
  const sampleFw = {
    id: 'd6fd3a95-d9d9-417d-9d27-c6b57e94240a',
    name: 'xpider-fw-xpider-tx-mviey6au-2afbc2f1',
    droplet_ids: [],
    tags: ['xpider-tx-mviey6au-2afbc2f1'],
    inbound_rules: [
      { protocol: 'tcp', ports: '8443', sources: { addresses: ['159.26.98.242/32'] } },
      { protocol: 'tcp', ports: '8443', sources: { addresses: ['74.39.42.139/32'] } }
    ],
    outbound_rules: [
      { protocol: 'tcp', ports: '0', destinations: { addresses: ['0.0.0.0/0', '::/0'] } }
    ]
  };
  const wgDiff = generateWireGuardPreviewDiff(sampleFw, '74.39.42.139', ['74.39.42.139/32']);
  assert.strictEqual(wgDiff.noop, false);
  assert.deepStrictEqual(wgDiff.addedWg, ['159.26.98.242/32', '74.39.42.139/32']);
  const wgRule = wgDiff.proposedPayload.inbound_rules.find(r => r.protocol === 'udp' && r.ports === '51820');
  assert.ok(wgRule, 'Proposed rules must include UDP 51820');
  assert.deepStrictEqual(wgRule.sources.addresses, ['159.26.98.242/32', '74.39.42.139/32']);

  // Confirm applyWireGuardUpdate refuses without confirmed=true
  const fgMock = new FirewallGuardian({
    dir: os.tmpdir(),
    request: async () => ({ status: 200, json: { firewall: sampleFw } }),
    detectIp: async () => '74.39.42.139'
  });
  let unconfirmedBlocked = false;
  try {
    await fgMock.applyWireGuardUpdate({ confirmed: false, expectedSnapshot: wgDiff.snapshot });
  } catch (e) {
    unconfirmedBlocked = e.code === 'CONFIRMATION_REQUIRED';
  }
  assert.strictEqual(unconfirmedBlocked, true, 'applyWireGuardUpdate must fail closed without confirmed: true');
  console.log('  [PASS] 2. FirewallGuardian UDP 51820 /32 additive preview and confirmation guard');

  // 3. Verify GLInetOpalDriver includes ssh-rsa host key compatibility
  const opalSource = fs.readFileSync(path.resolve(__dirname, '../companion/router-drivers/glinet-opal.js'), 'utf8');
  assert.ok(opalSource.includes('HostKeyAlgorithms=+ssh-rsa'), 'GLInetOpalDriver must enable ssh-rsa host key negotiation for Dropbear');
  assert.ok(opalSource.includes('PubkeyAcceptedAlgorithms=+ssh-rsa'), 'GLInetOpalDriver must enable ssh-rsa pubkey algorithm for Dropbear');
  console.log('  [PASS] 3. GLInetOpalDriver Dropbear ssh-rsa compatibility verified');

  // 4. Run full Two-Layer Verifier suite
  const fullReport = await runAll();
  assert.strictEqual(fullReport.precheck.liveMutationsMade, 0, 'Precheck must make 0 live mutations');
  assert.strictEqual(fullReport.precheck.probes.tcp8443.open, true, 'DO 143.198.40.33:8443 must be open');
  assert.strictEqual(fullReport.precheck.probes.tcp22Blocked, true, 'DO 143.198.40.33:22 must be blocked');
  assert.strictEqual(fullReport.localProfile.profileReady, true, 'Local Opal WG profile must be ready');
  assert.strictEqual(fullReport.localProfile.privateKeyDisclosed, false, 'Zero private keys disclosed');

  const rdp = fullReport.splitVerification.residentialDataPlaneVerification;
  assert.strictEqual(rdp.httpsConnectTlsSupported, true, 'Authenticated TLS HTTPS_PROXY CONNECT must succeed');
  assert.strictEqual(rdp.dpapiEncryptedZeroPlaintext, true, 'DPAPI encryption with zero plaintext on disk must succeed');
  assert.strictEqual(rdp.doIpLeakRejected, true, 'Upstream exiting via DO IP 143.198.40.33 must be rejected (502)');
  assert.strictEqual(rdp.ispIpLeakRejected, true, 'Upstream exiting via ISP IP must be rejected');
  assert.strictEqual(rdp.auth407FailClosed502, true, 'Upstream 407 must fail closed with 502');
  assert.strictEqual(rdp.auth401FailClosed502, true, 'Upstream 401 must fail closed with 502');
  assert.strictEqual(rdp.upstreamDropFailClosed502, true, 'Upstream socket drop must fail closed with 502');
  console.log('  [PASS] 4. Full Two-Layer Network Verifier & Split-Egress Data-Plane Suite (7/7 assertions)');

  console.log('=== ALL TWO-LAYER NETWORK DELEGATION TESTS PASSED (100%) ===');
})();

