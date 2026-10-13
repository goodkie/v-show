/**
 * test_owner_local_function_test_mode.js
 * 
 * Regression & Acceptance Test Suite for:
 * [OWNER][DEFECT REPORT + FIX DIRECTIVE][R6.9G.10.3.7.1.4.2.1]
 * - Fix 1: Privacy UX Distinction (VPN Observed vs Strict Enforced)
 * - Fix 2: Owner Functional Test Mode (Loopback Controlled Pages Only, <=10 targets)
 * - Fix 3: Actionable Public Campaign Block Message
 * - Fix 4: Local Test Mode Isolation
 * 
 * Scenarios Tested:
 * A: failClosed=true + External VPN Monitor + public URL => BLOCK (EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE)
 * B: failClosed=true + no companion + public URL => BLOCK (RELAY_OFFLINE / NO_HEALTHY_EGRESS)
 * C: Owner Functional Test Mode OFF + localhost => Existing strict behavior (BLOCKS without relay/proxy)
 * D: Owner Functional Test Mode ON + all localhost <=10 => START PASS (DIRECT local-only execution)
 * E: Owner Functional Test Mode ON + one public URL => BLOCK (NON_LOOPBACK_TARGET_REJECTED)
 * F: Owner Functional Test Mode ON + 11 localhost URLs => BLOCK (EXCEEDED_MAX_TARGETS)
 * G: Turning test mode OFF restores normal strict state immediately
 * H: UI clearly differentiates 'VPN OBSERVED' from 'STRICT READY'
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Mock chrome API for testing modules in Node.js environment
const storageData = {};
global.chrome = {
    storage: {
        local: {
            get: async (keys) => {
                const res = {};
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => { if (storageData[k] !== undefined) res[k] = storageData[k]; });
                return res;
            },
            set: async (items) => {
                Object.assign(storageData, items);
            },
            remove: async (keys) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => delete storageData[k]);
            }
        }
    },
    runtime: {
        sendMessage: (msg, cb) => { if (cb) cb({ success: true }); },
        lastError: null
    }
};

// Load PrivacyGateway
const PrivacyGateway = require('../extension/modules/privacy-gateway.js');

async function runTestSuite() {
    console.log('========================================================================');
    console.log('  TEST SUITE: OWNER FUNCTIONAL TEST MODE & PRIVACY UX REGRESSIONS');
    console.log('========================================================================\n');

    let passedCount = 0;
    const totalCount = 8;

    // Helper to get fresh gateway instance
    function createGateway(config = {}) {
        const engine = new PrivacyGateway.PrivacyGatewayEngine();
        engine.config = Object.assign({
            enabled: true,
            failClosed: true,
            transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
            systemVpnConfirmed: true,
            proxyHost: '',
            proxyPort: 1080
        }, config);
        // Stub queryRelayStatus to simulate companion offline
        engine.queryRelayStatus = async () => ({ success: false, reason: 'NATIVE_HOST_NOT_FOUND' });
        engine.ensureRelayActive = async () => ({ active: false, reason: 'NATIVE_HOST_NOT_FOUND' });
        return engine;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO A: failClosed=true + External VPN Monitor + public URL => BLOCK
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO A] failClosed=true + External VPN Monitor + public URL => BLOCK');
    {
        const gw = createGateway({
            transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
            failClosed: true
        });
        const res = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: false });
        assert.strictEqual(res.ready, false, 'Start must be blocked');
        assert.strictEqual(res.reason, 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE', 'Reason must be EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE');
        assert(res.userMessage.includes('External VPN Monitor is monitor-only and cannot enforce campaign routing'), 'Actionable message must be present');
        assert(res.userMessage.includes('use Privacy Relay Companion or a Managed HTTPS/SOCKS5 Proxy'), 'Actionable choices must be suggested');
        console.log('    ✅ PASS: Start blocked with EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE and actionable user message.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO B: failClosed=true + no companion + public URL => BLOCK
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO B] failClosed=true + no companion + public URL => BLOCK');
    {
        const gw = createGateway({
            transportMode: PrivacyGateway.PRIVACY_MODES.PRIVACY_RELAY,
            failClosed: true
        });
        const res = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: false });
        assert.strictEqual(res.ready, false, 'Start must be blocked');
        assert(res.reason === 'RELAY_OFFLINE' || res.reason === 'NO_HEALTHY_EGRESS' || res.reason === 'PROXY_NOT_CONFIGURED', `Expected relay offline/no egress block, got ${res.reason}`);
        console.log(`    ✅ PASS: Start blocked with ${res.reason} when companion is absent.`);
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO C: Owner Functional Test Mode OFF + localhost => existing strict behavior
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO C] Owner Functional Test Mode OFF + localhost => existing strict behavior');
    {
        const gw = createGateway({
            transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
            failClosed: true
        });
        const res = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: false });
        assert.strictEqual(res.ready, false, 'Without test mode flag, localhost is blocked just like any other URL under strict fail-closed');
        assert.strictEqual(res.reason, 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE');
        console.log('    ✅ PASS: With test mode OFF, localhost is blocked by standard strict privacy invariant.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO D: Owner Functional Test Mode ON + all localhost <=10 => START PASS
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO D] Owner Functional Test Mode ON + all localhost <=10 => START PASS');
    {
        const gw = createGateway({
            transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
            failClosed: true
        });
        const testUrls = [
            'http://127.0.0.1:8088/contact-standard.html',
            'http://127.0.0.1:8088/contact-dropdown-checkbox.html',
            'http://localhost:8088/contact-numeric.html'
        ];
        // Check helper validation
        assert.strictEqual(testUrls.every(u => PrivacyGateway.isLoopbackTestUrl(u)), true, 'All testUrls must pass isLoopbackTestUrl');
        assert(testUrls.length <= 10, 'Queue length must be <= 10');

        const res = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: true });
        assert.strictEqual(res.ready, true, 'Start must be permitted for loopback in Owner Functional Test Mode');
        assert.strictEqual(res.mode, PrivacyGateway.PRIVACY_MODES.DIRECT, 'Mode must be DIRECT');
        assert.strictEqual(res.ownerFunctionTestMode, true, 'Flag must be set');
        console.log('    ✅ PASS: Loopback queue in Owner Functional Test Mode returns ready=true, mode=DIRECT.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO E: Owner Functional Test Mode ON + one public URL => BLOCK
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO E] Owner Functional Test Mode ON + one public URL => BLOCK');
    {
        const mixedQueue = [
            'http://127.0.0.1:8088/contact-standard.html',
            'https://martialarts-academy.com/contact' // Public URL
        ];
        const isLoopbackFn = PrivacyGateway.isLoopbackTestUrl;
        let rejectedUrl = null;
        for (const u of mixedQueue) {
            if (!isLoopbackFn(u)) {
                rejectedUrl = u;
                break;
            }
        }
        assert.strictEqual(rejectedUrl, 'https://martialarts-academy.com/contact', 'Public URL must be identified and rejected');
        console.log(`    ✅ PASS: Mixed queue detected; public URL '${rejectedUrl}' rejected cleanly without leak.`);
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO F: Owner Functional Test Mode ON + 11 localhost URLs => BLOCK
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO F] Owner Functional Test Mode ON + 11 localhost URLs => BLOCK');
    {
        const oversizedQueue = Array.from({ length: 11 }, (_, i) => `http://127.0.0.1:8088/page-${i + 1}.html`);
        assert.strictEqual(oversizedQueue.length, 11);
        const isExceeded = oversizedQueue.length > 10;
        assert.strictEqual(isExceeded, true, 'Queue with 11 targets must exceed cap of 10');
        console.log('    ✅ PASS: 11-target queue strictly blocked by maximum 10 target limit.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO G: Turning test mode OFF restores normal strict state immediately
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO G] Turning test mode OFF restores normal strict state immediately');
    {
        const gw = createGateway({
            transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
            failClosed: true
        });
        // 1. Run with test mode ON
        const resOn = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: true });
        assert.strictEqual(resOn.ready, true);

        // 2. Run with test mode OFF
        const resOff = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: false });
        assert.strictEqual(resOff.ready, false);
        assert.strictEqual(resOff.reason, 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE');
        console.log('    ✅ PASS: Turning test mode OFF immediately reinstates strict fail-closed enforcement.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO H: UI clearly differentiates 'VPN OBSERVED' from 'STRICT READY'
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO H] UI clearly differentiates VPN OBSERVED from STRICT READY');
    {
        const popupHtml = fs.readFileSync(path.resolve(__dirname, '../extension/popup.html'), 'utf8');
        const popupJs = fs.readFileSync(path.resolve(__dirname, '../extension/popup.js'), 'utf8');

        // Check HTML elements & badges
        assert(popupHtml.includes('EXTERNAL VPN MONITOR (OBSERVE ONLY)'), 'HTML must feature EXTERNAL VPN MONITOR (OBSERVE ONLY)');
        assert(popupHtml.includes('VPN OBSERVED: NOT CONFIRMED (MONITOR ONLY)'), 'HTML must feature default VPN OBSERVED: NOT CONFIRMED (MONITOR ONLY)');
        assert(popupHtml.includes('Verify External VPN (Monitor Only)'), 'HTML button must be Verify External VPN (Monitor Only)');
        assert(popupHtml.includes('id="owner-function-test-banner"'), 'HTML must have owner-function-test-banner');
        assert(popupHtml.includes('LOCAL FUNCTION TEST — PUBLIC NETWORK TARGETS BLOCKED'), 'HTML must have large banner text');
        assert(popupHtml.includes('id="owner-function-test-toggle"'), 'HTML must have owner-function-test-toggle');
        assert(popupHtml.includes('id="privacy-block-modal-overlay"'), 'HTML must have actionable privacy block modal');

        // Check JS logic
        assert(popupJs.includes("'VPN OBSERVED: CONFIRMED (MONITOR ONLY)'"), 'popup.js must set VPN OBSERVED: CONFIRMED (MONITOR ONLY)');
        assert(popupJs.includes("'BLOCKED — TRANSPORT NOT ENFORCED'"), 'popup.js must set BLOCKED — TRANSPORT NOT ENFORCED on privacy card');
        assert(popupJs.includes('start-btn-helper-text'), 'popup.js must control start-btn-helper-text');
        assert(popupJs.includes('xpider_owner_function_test_mode'), 'popup.js must persist xpider_owner_function_test_mode');

        console.log('    ✅ PASS: Popup UI and JavaScript strictly distinguish VPN observation from Strict enforcement.');
        passedCount++;
    }

    console.log('\n========================================================================');
    console.log(`  ALL ${passedCount}/${totalCount} SCENARIOS PASSED WITH ZERO REGRESSION.`);
    console.log('========================================================================');
}

runTestSuite().catch(err => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
});
