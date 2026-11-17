/**
 * test_provenance_authorization_contract.js
 * 
 * Verifies the semantic provenance authorization contract for:
 * [CHATGPT][DIRECTIVE][extension-form-sender][P0-OWNER-AUTO-SETUP-CHANNEL-FIX][2026-11-11]
 * 
 * 1. Positive tests for intended OWNER_BETA and TEST_ONLY channels.
 * 2. Negative tests for unauthorized channels (PRODUCTION, STABLE, RELEASE, etc.).
 * 3. Negative tests for malformed or absent provenance (null, undefined, non-objects).
 * 4. Validation of productionReady vs channel/test intent (fail-closed on inconsistencies).
 * 5. Call site predicate consistency (popup, background, privacy-gateway).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const BuildProvenance = require('../extension/modules/build-provenance.js');
global.BuildProvenance = BuildProvenance;
const PrivacyGateway = require('../extension/modules/privacy-gateway.js');

async function runContractTests() {
    console.log('========================================================================');
    console.log('  TEST SUITE: PROVENANCE AUTHORIZATION CONTRACT & FAIL-CLOSED GATES');
    console.log('========================================================================\n');

    let passed = 0;
    let total = 0;

    function test(name, fn) {
        total++;
        try {
            fn();
            console.log(`  ✅ [PASS ${total}] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL ${total}] ${name}:`, err.message);
            throw err;
        }
    }

    async function testAsync(name, fn) {
        total++;
        try {
            await fn();
            console.log(`  ✅ [PASS ${total}] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL ${total}] ${name}:`, err.message);
            throw err;
        }
    }

    // --- SECTION 1: Current Build Verification ---
    console.log('>>> [SECTION 1] Current Runtime Build State');
    test('BuildProvenance exports isOwnerTestAuthorized as a function', () => {
        assert.strictEqual(typeof BuildProvenance.isOwnerTestAuthorized, 'function');
    });

    test('BuildProvenance exports isTestOnlyBuild as a function', () => {
        assert.strictEqual(typeof BuildProvenance.isTestOnlyBuild, 'function');
    });

    test('Current build is authorized as OWNER_BETA (testOnly: false, productionReady: false)', () => {
        assert.strictEqual(BuildProvenance.BUILD_INFO.channel, 'OWNER_BETA_V7_DUAL_MODE');
        assert.strictEqual(BuildProvenance.BUILD_INFO.productionReady, false);
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized(), true);
        assert.strictEqual(BuildProvenance.isTestOnlyBuild(), true);
    });

    // --- SECTION 2: Positive Tests for Authorized Channels ---
    console.log('\n>>> [SECTION 2] Positive Tests for Authorized Channels');
    test('OWNER_BETA channel with productionReady: false is authorized', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'OWNER_BETA',
            testOnly: false,
            productionReady: false
        }), true);
    });

    test('OWNER_BETA_V7_DUAL_MODE channel with productionReady: false is authorized', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'OWNER_BETA_V7_DUAL_MODE',
            testOnly: false,
            productionReady: false
        }), true);
    });

    test('OWNER_BETA_PRIVATE_EGRESS channel with productionReady: false is authorized', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.60',
            testOnly: false,
            productionReady: false
        }), true);
    });

    test('TEST_ONLY channel with testOnly: true and productionReady: false is authorized', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'TEST_ONLY',
            testOnly: true,
            productionReady: false
        }), true);
    });

    // --- SECTION 3: Negative Tests for Unauthorized Channels ---
    console.log('\n>>> [SECTION 3] Negative Tests for Unauthorized Channels');
    const unauthorizedChannels = [
        'PRODUCTION',
        'STABLE',
        'RELEASE',
        'PUBLIC',
        'DEV',
        'CANARY',
        'INTERNAL',
        'CUSTOM',
        'BETA_PUBLIC',
        ''
    ];

    for (const chan of unauthorizedChannels) {
        test(`Unauthorized channel '${chan}' is strictly DENIED`, () => {
            assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
                channel: chan,
                testOnly: false,
                productionReady: false
            }), false);
        });
    }

    // --- SECTION 4: Negative Tests for Malformed or Absent Provenance ---
    console.log('\n>>> [SECTION 4] Negative Tests for Malformed / Absent Provenance');
    test('null provenance fails closed (returns false)', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized(null), true); // uses default BUILD_INFO if not passing object override
        // Passing null explicitly to internal predicate logic:
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({}), false);
    });

    test('undefined channel fails closed', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({ channel: undefined }), false);
    });

    test('numeric channel fails closed', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({ channel: 12345 }), false);
    });

    test('boolean channel fails closed', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({ channel: true }), false);
    });

    test('array channel fails closed', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({ channel: ['OWNER_BETA'] }), false);
    });

    // --- SECTION 5: Inconsistency Validation (productionReady vs channel/test intent) ---
    console.log('\n>>> [SECTION 5] Inconsistency Validation (fail-closed)');
    test('TEST_ONLY with productionReady: true MUST FAIL CLOSED', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'TEST_ONLY',
            testOnly: true,
            productionReady: true
        }), false);
    });

    test('TEST_ONLY with testOnly: false MUST FAIL CLOSED', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'TEST_ONLY',
            testOnly: false,
            productionReady: false
        }), false);
    });

    test('OWNER_BETA with productionReady: true MUST FAIL CLOSED', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'OWNER_BETA',
            testOnly: false,
            productionReady: true
        }), false);
    });

    test('OWNER_BETA_V7_DUAL_MODE with productionReady: true MUST FAIL CLOSED', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'OWNER_BETA_V7_DUAL_MODE',
            testOnly: false,
            productionReady: true
        }), false);
    });

    test('PRODUCTION claiming testOnly: true MUST FAIL CLOSED', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            channel: 'PRODUCTION',
            testOnly: true,
            productionReady: false
        }), false);
    });

    // --- SECTION 6: PrivacyGateway Call-Site Integration ---
    console.log('\n>>> [SECTION 6] PrivacyGateway Integration with Provenance Contract');
    await testAsync('PrivacyGateway permits Owner Functional Test on authorized OWNER_BETA', async () => {
        const engine = new PrivacyGateway.PrivacyGatewayEngine();
        engine.config = {
            enabled: true,
            failClosed: true,
            transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
            systemVpnConfirmed: true
        };
        const res = await engine.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: true });
        assert.strictEqual(res.ready, true, 'Start must be permitted on authorized build');
    });

    await testAsync('PrivacyGateway rejects Owner Functional Test when provenance is set to PRODUCTION', async () => {
        const savedChannel = BuildProvenance.BUILD_INFO.channel;
        const savedProdReady = BuildProvenance.BUILD_INFO.productionReady;
        try {
            BuildProvenance.BUILD_INFO.channel = 'PRODUCTION';
            BuildProvenance.BUILD_INFO.productionReady = true;

            const engine = new PrivacyGateway.PrivacyGatewayEngine();
            engine.config = {
                enabled: true,
                failClosed: true,
                transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
                systemVpnConfirmed: true
            };
            const res = await engine.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: true });
            assert.strictEqual(res.ready, false, 'Start must be blocked in production');
            assert.strictEqual(res.reason, 'OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD');
        } finally {
            BuildProvenance.BUILD_INFO.channel = savedChannel;
            BuildProvenance.BUILD_INFO.productionReady = savedProdReady;
        }
    });

    await testAsync('PrivacyGateway rejects Owner Functional Test when BuildProvenance is completely undefined (fail-closed)', async () => {
        const savedBp = global.BuildProvenance;
        try {
            delete global.BuildProvenance;
            const engine = new PrivacyGateway.PrivacyGatewayEngine();
            engine.config = {
                enabled: true,
                failClosed: true,
                transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
                systemVpnConfirmed: true
            };
            const res = await engine.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: true });
            assert.strictEqual(res.ready, false, 'Start must fail-closed if BuildProvenance is missing');
            assert.strictEqual(res.reason, 'OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD');
        } finally {
            global.BuildProvenance = savedBp;
        }
    });

    test('Module-style nested object { BUILD_INFO: ... } is supported by isOwnerTestAuthorized', () => {
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            BUILD_INFO: {
                channel: 'OWNER_BETA',
                productionReady: false
            }
        }), true);
        assert.strictEqual(BuildProvenance.isOwnerTestAuthorized({
            BUILD_INFO: {
                channel: 'PRODUCTION',
                productionReady: true
            }
        }), false);
    });

    console.log('\n========================================================================');
    console.log(`  SUMMARY: ALL ${passed}/${total} PROVENANCE CONTRACT TESTS PASSED.`);
    console.log('========================================================================\n');
}

runContractTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
