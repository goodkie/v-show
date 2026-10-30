const assert = require('assert');
const { PrivacyGatewayEngine, PRIVACY_MODES } = require('../extension/modules/privacy-gateway');

console.log('=== TEST SUITE: RC3.60 .92 SUBGATE DIAGNOSTICS & PREFLIGHT ACTIONABILITY ===\n');

async function runTests() {
    // Test 1: Subgate diagnostic accuracy (Never mislabel as PHYSICAL_GATE_FAIL_CLOSED when physical gate is disabled)
    console.log('Test 1: Subgate Diagnostic Precision...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;
        pg.config.enabled = true;
        pg.config.failClosed = true;
        pg.config.physicalGateEnabled = false;

        // Mock fetch to simulate companion responding with unverified Decodo (e.g. HTTP_522)
        // while physicalGate is present in payload but disabled
        pg._mockFetch = async (url) => {
            if (url.includes('/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: false,
                        health: 'HEALTHY',
                        selectedEgressId: 'do-egress-tor1-611293905',
                        physicalGate: {
                            enabled: false,
                            ready: false,
                            reasons: []
                        },
                        residentialProxySelected: true,
                        residentialProxy: {
                            status: 'PROXY_UNREACHABLE',
                            detail: 'HTTP_522',
                            sendAllowed: false
                        }
                    })
                };
            }
            if (url.includes('/probe')) {
                return {
                    ok: false,
                    status: 503,
                    json: async () => ({
                        verified: false,
                        reason: 'RESIDENTIAL_UPSTREAM_PROXY_UNREACHABLE (HTTP_522)'
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        const pf = await pg.runPreflight();
        assert.strictEqual(pf.ready, false, 'Preflight must fail closed when upstream is unreachable');
        assert.notStrictEqual(pf.failureReason, 'PHYSICAL_GATE_FAIL_CLOSED', 'Must NOT report PHYSICAL_GATE_FAIL_CLOSED when physicalGate is disabled');
        assert.strictEqual(pf.failureReason.includes('RESIDENTIAL_UPSTREAM_BLOCKED'), true, 'Must truthfully report RESIDENTIAL_UPSTREAM_BLOCKED');
        console.log(`  [OK] Preflight truthfully reported: ${pf.failureReason}`);
        console.log('  PASS 1: Subgate diagnostic precision verified.');
    }

    // Test 2: True physical gate failure when enabled
    console.log('\nTest 2: Physical Gate Fail-Closed when Enabled...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;
        pg.config.enabled = true;
        pg.config.failClosed = true;
        pg.config.physicalGateEnabled = true;

        pg._mockFetch = async (url) => {
            if (url.includes('/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: false,
                        health: 'HEALTHY',
                        selectedEgressId: 'do-egress-tor1-611293905',
                        physicalGate: {
                            enabled: true,
                            ready: false,
                            reasons: ['ROUTER_ATTESTATION_FAILED']
                        },
                        residentialProxySelected: true,
                        residentialProxy: {
                            status: 'EGRESS_VERIFIED',
                            detail: 'OK',
                            sendAllowed: true
                        }
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        const pf = await pg.runPreflight();
        assert.strictEqual(pf.ready, false);
        assert.strictEqual(pf.failureReason, 'PHYSICAL_GATE_FAIL_CLOSED');
        console.log(`  [OK] Correctly reported PHYSICAL_GATE_FAIL_CLOSED when physicalGate is genuinely enabled`);
        console.log('  PASS 2: Genuine physical gate fail-closed verified.');
    }

    // Test 3: Standby companion with NO_NODES
    console.log('\nTest 3: Standby Companion with NO_NODES...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;
        pg.config.enabled = true;
        pg.config.failClosed = true;
        pg.config.physicalGateEnabled = false;

        pg._mockFetch = async (url) => {
            if (url.includes('/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: false,
                        health: 'NO_NODES',
                        selectedEgressId: null,
                        physicalGate: { enabled: false, ready: false }
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        const pf = await pg.runPreflight();
        assert.strictEqual(pf.ready, false);
        assert.strictEqual(pf.failureReason, 'PRIVACY_RELAY_NO_NODES');
        console.log(`  [OK] Correctly reported: ${pf.failureReason}`);
        console.log('  PASS 3: Standby NO_NODES verified.');
    }

    // Test 4: End-to-end verified stack returns READY
    console.log('\nTest 4: Full Dual-Layer Stack Verified -> READY...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;
        pg.config.enabled = true;
        pg.config.failClosed = true;
        pg.config.physicalGateEnabled = false;

        pg._mockFetch = async (url) => {
            if (url.includes('/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        health: 'HEALTHY',
                        selectedEgressId: 'do-egress-tor1-611293905',
                        egressFingerprint: '05b6b53daead49e7',
                        dnsProtection: 'VERIFIED_REMOTE_PROXY_CONNECT',
                        ipv6Protection: 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED',
                        physicalGate: { enabled: false, ready: false },
                        residentialProxySelected: true,
                        residentialProxy: {
                            status: 'EGRESS_VERIFIED',
                            detail: 'OK',
                            sendAllowed: true,
                            observedIpMasked: '70.140.*.*'
                        }
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        // Mock proxy canary probe
        pg.probeProxyCanary = async () => ({ success: true });
        pg.applyManagedProxy = async () => true;

        const pf = await pg.runPreflight();
        assert.strictEqual(pf.ready, true);
        assert.strictEqual(pf.failureReason, null);
        assert.strictEqual(pf.selectedEgressId, 'do-egress-tor1-611293905');
        assert.strictEqual(pf.egressCheck, 'PASS');
        assert.strictEqual(pf.dnsPrivacy, 'PASS');
        assert.strictEqual(pf.ipv6Protection, 'PROTECTED');
        console.log(`  [OK] Dual-layer stack preflight verified READY with zero failureReason`);
        console.log('  PASS 4: Verified stack transition verified.');
    }

    console.log('\n====================================================');
    console.log('  ALL RC3.60 .92 SUBGATE DIAGNOSTIC TESTS PASSED! (100%)');
    console.log('====================================================\n');
}

runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
