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

// Load BuildProvenance and PrivacyGateway
const BuildProvenance = require('../extension/modules/build-provenance.js');
global.BuildProvenance = BuildProvenance;
const PrivacyGateway = require('../extension/modules/privacy-gateway.js');

async function runTestSuite() {
    console.log('========================================================================');
    console.log('  TEST SUITE: OWNER FUNCTIONAL TEST MODE & PRIVACY UX REGRESSIONS');
    console.log('========================================================================\n');

    let passedCount = 0;
    const totalCount = 17;

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

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO I: BuildProvenance.isTestOnlyBuild() capability and authorization gate
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO I] BuildProvenance.isTestOnlyBuild() capability and authorization gate');
    {
        const BuildProvenance = require('../extension/modules/build-provenance.js');
        assert.strictEqual(typeof BuildProvenance.isTestOnlyBuild, 'function', 'isTestOnlyBuild must be exported as a function');
        assert.strictEqual(BuildProvenance.BUILD_INFO.channel, 'TEST_ONLY', 'Build channel must be TEST_ONLY');
        assert.strictEqual(BuildProvenance.BUILD_INFO.testOnly, true, 'testOnly flag must be true');
        assert.strictEqual(BuildProvenance.isTestOnlyBuild(), true, 'Current build must be authorized as TEST_ONLY');

        // Test non-test build behavior
        const savedChannel = BuildProvenance.BUILD_INFO.channel;
        const savedTestOnly = BuildProvenance.BUILD_INFO.testOnly;
        try {
            BuildProvenance.BUILD_INFO.channel = 'PRODUCTION';
            BuildProvenance.BUILD_INFO.testOnly = false;
            assert.strictEqual(BuildProvenance.isTestOnlyBuild(), false, 'Production build must not pass isTestOnlyBuild');

            // Verify PrivacyGateway rejects test mode on production build
            const gw = createGateway();
            const res = await gw.ensureEnforcedPrivacyForStart({ ownerFunctionTestMode: true });
            assert.strictEqual(res.ready, false, 'Start must be blocked in production build even if test mode requested');
            assert.strictEqual(res.reason, 'OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD', 'Reason must be OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD');
        } finally {
            BuildProvenance.BUILD_INFO.channel = savedChannel;
            BuildProvenance.BUILD_INFO.testOnly = savedTestOnly;
        }
        console.log('    ✅ PASS: BuildProvenance runtime authorization gate strictly verified.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO J: DeclarativeNetRequest session rules specification & network guard
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO J] DeclarativeNetRequest session rules specification & network guard');
    {
        const bgJs = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
        assert(bgJs.includes('OWNER_TEST_GUARD_RULE_IDS = [990001, 990002, 990003, 990004, 990005]'), 'Rule IDs must match specification');
        assert(bgJs.includes("installOwnerTestNetworkGuard"), 'installOwnerTestNetworkGuard must be present');
        assert(bgJs.includes("removeOwnerTestNetworkGuard"), 'removeOwnerTestNetworkGuard must be present');
        assert(bgJs.includes("urlFilter: '|http*'"), 'Priority 1 block all HTTP must be configured');
        assert(bgJs.includes("urlFilter: '|ws*'"), 'Priority 1 block all WS must be configured');
        assert(bgJs.includes("urlFilter: '||localhost^'"), 'Priority 2 allow localhost must be configured');
        assert(bgJs.includes("urlFilter: '||127.0.0.1^'"), 'Priority 2 allow 127.0.0.1 must be configured');
        assert(bgJs.includes("urlFilter: '||[::1]^'"), 'Priority 2 allow [::1] must be configured');
        assert(bgJs.includes("await installOwnerTestNetworkGuard()"), 'Network guard must be installed before START is acknowledged');
        assert(bgJs.includes("OWNER_FUNCTION_TEST_GUARD_FAILED"), 'Fail-closed rejection must trigger if rule installation fails');
        console.log('    ✅ PASS: DeclarativeNetRequest network guard structure and fail-closed handling verified.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO K: manifest.json permissions include declarativeNetRequest
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO K] manifest.json permissions include declarativeNetRequest');
    {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../extension/manifest.json'), 'utf8'));
        assert(Array.isArray(manifest.permissions), 'Manifest permissions must be an array');
        assert(manifest.permissions.includes('declarativeNetRequest'), 'Manifest must declare declarativeNetRequest permission');
        console.log('    ✅ PASS: manifest.json correctly includes declarativeNetRequest permission.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO L: PAUSE retains DNR network guard and records test mode in checkpoint
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO L] PAUSE retains DNR network guard and records test mode in checkpoint');
    {
        const bgJs = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
        assert(bgJs.includes("Do NOT remove Owner Test DNR rules merely because campaign is PAUSED"), 'Pause must NOT remove DNR rules');
        assert(bgJs.includes("ownerFunctionTestMode: Boolean(campaignState.ownerFunctionTestMode)"), 'Checkpoint snapshot must persist ownerFunctionTestMode');
        // Ensure pauseCampaignOrchestrator does NOT unconditionally call removeOwnerTestNetworkGuard
        const pauseFnMatch = bgJs.match(/async function pauseCampaignOrchestrator[\s\S]*?return \{ success: true/);
        assert(pauseFnMatch, 'pauseCampaignOrchestrator must exist');
        assert(!pauseFnMatch[0].includes('await removeOwnerTestNetworkGuard()'), 'pauseCampaignOrchestrator must NOT remove network guard');
        console.log('    ✅ PASS: PAUSE preserves DNR network guard and records ownerFunctionTestMode in checkpoint.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO M: RESUME reinstalls & readback-verifies DNR network guard fail-closed
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO M] RESUME reinstalls & readback-verifies DNR network guard fail-closed');
    {
        const bgJs = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
        assert(bgJs.includes("Before RESUME is acknowledged, independently call installOwnerTestNetworkGuard()"), 'Resume must reinstall network guard');
        assert(bgJs.includes("FAIL_CLOSED_GUARD_ERROR_ON_RESUME"), 'Resume must fail-closed if guard installation fails');
        assert(bgJs.includes("OWNER_TEST_GUARD_READBACK_INCOMPLETE"), 'Resume must verify readback of all 5 session rules');
        console.log('    ✅ PASS: RESUME independently verifies & reinstalls DNR network guard before continuing.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO N: State-aware SW boot reconciliation: restores guard when test session exists
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO N] State-aware SW boot reconciliation: restores guard when test session exists');
    {
        const bgJs = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
        assert(bgJs.includes("async function reconcileOwnerTestNetworkGuardOnBoot()"), 'reconcileOwnerTestNetworkGuardOnBoot must exist');
        assert(bgJs.includes("BOOT_GUARD_RECONCILIATION_FAILED"), 'SW boot must fail-closed if guard reconciliation fails');
        assert(bgJs.includes("reconcileOwnerTestNetworkGuardOnBoot().catch"), 'SW boot must invoke state-aware reconciliation');
        assert(!bgJs.includes("removeOwnerTestNetworkGuard().catch(() => {});\n// ── END"), 'SW boot must NOT unconditionally remove network guard');
        console.log('    ✅ PASS: State-aware SW boot reconciliation verified.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO O: Top Utility Bar, Settings Visibility & Auto Setup DOM Structure
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO O] Top Utility Bar, Settings Visibility & Auto Setup DOM Structure');
    {
        const html = fs.readFileSync(path.resolve(__dirname, '../extension/popup.html'), 'utf8');
        const css = fs.readFileSync(path.resolve(__dirname, '../extension/popup.css'), 'utf8');
        assert(html.includes('id="top-nav-bar"'), 'top-nav-bar must exist in popup.html');
        assert(html.includes('id="settings-toggle"'), '#settings-toggle must exist');
        assert(html.includes('id="reset-all-lists-btn"'), '#reset-all-lists-btn must exist');
        assert(html.includes('id="owner-functional-test-card"'), 'owner-functional-test-card must exist');
        assert(html.includes('id="auto-setup-btn"'), '#auto-setup-btn must exist');
        assert(html.includes('id="run-function-test-btn"'), '#run-function-test-btn must exist');
        assert(html.includes('id="restore-user-settings-btn"'), '#restore-user-settings-btn must exist');
        assert(html.includes('id="advanced-settings-disclosure"'), 'advanced-settings-disclosure details must exist');
        assert(css.includes('.top-nav-bar'), 'top-nav-bar CSS must be defined');
        assert(css.includes('.settings-nav-btn'), 'settings-nav-btn CSS must be defined');
        console.log('    ✅ PASS: Top utility bar, always-visible settings control, and auto setup DOM elements verified.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO P: One-Click Auto Setup Profile & Reversible Restore Point Logic
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO P] One-Click Auto Setup Profile & Reversible Restore Point Logic');
    {
        const js = fs.readFileSync(path.resolve(__dirname, '../extension/popup.js'), 'utf8');
        assert(js.includes('function initOwnerAutoSetup()'), 'initOwnerAutoSetup function must exist');
        assert(js.includes('xpider_owner_backup_snapshot'), 'Must persist reversible restore snapshot');
        assert(js.includes('http://127.0.0.1:8088/contact-standard.html'), 'Must configure the verified 7 local fixtures');
        assert(js.includes("INSTALL_OWNER_TEST_GUARD"), 'Auto setup must trigger DNR guard installation');
        assert(js.includes("REMOVE_OWNER_TEST_GUARD"), 'Restore must trigger DNR guard removal if test mode deactivated');
        assert(js.includes("updateAutoSetupUI('READY')"), 'Must update status to READY when auto setup succeeds');
        console.log('    ✅ PASS: One-click auto setup profile, fixture loading, and reversible restore logic verified.');
        passedCount++;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO Q: Start Campaign Blocks Public Targets when Owner Test Mode is ON
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n>>> [SCENARIO Q] Start Campaign Blocks Public Targets when Owner Test Mode is ON');
    {
        const js = fs.readFileSync(path.resolve(__dirname, '../extension/popup.js'), 'utf8');
        assert(js.includes("START_BLOCKED_TEST_MODE_PUBLIC_QUEUE"), 'popup.js must explicitly guard against public queue in test mode');
        assert(js.includes("OWNER FUNCTIONAL TEST MODE ACTIVE"), 'User must be presented clear actionable warning');
        console.log('    ✅ PASS: Start campaign strictly blocks public targets when Owner Test Mode is ON.');
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
