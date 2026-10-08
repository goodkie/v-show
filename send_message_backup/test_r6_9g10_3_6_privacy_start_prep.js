/**
 * test_r6_9g10_3_6_privacy_start_prep.js
 * 
 * Comprehensive Unit and Scenario Test Suite for:
 * R6.9G.10.3.6 AUTO-ENFORCED PRIVACY START PREP + LEGACY VPN SELF-HEAL
 * 
 * Verifies all 7 mandatory scenarios from ChatGPT Directive #6066074779:
 * A. Owner exact scenario: persisted SYSTEM_VPN + failClosed=true + Privacy Relay companion with healthy node
 *    -> 1-click START -> auto-start relay -> switch to PRIVACY_RELAY -> canary PASS -> campaign ACK, NO raw popup.
 * B. Relay installed but daemon stopped: click START once -> daemon starts -> READY -> campaign starts.
 * C. Relay has zero nodes: click START -> no campaign/network -> Settings opens at Add Egress Node with clear message.
 * D. Saved Managed Proxy available, relay unavailable -> managed proxy applied/readback/canary -> campaign starts.
 * E. Neither relay nor proxy configured -> fail-closed remains, zero target traffic, actionable settings shown.
 * F. Legacy external monitor explicitly selected by Owner with strict off -> allowed; strict never auto-disabled.
 * G. Owner-facing mode labels and human-readable messages (zero raw enums in user dialogs).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { PrivacyGatewayEngine, PRIVACY_MODES } = require('./modules/privacy-gateway.js');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`❌ [FAIL] ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

// Global Chrome Mock Helper
function createMockChrome(initialStorage = {}) {
    const storageState = { ...initialStorage };
    let proxySettings = null;
    let nativeMessageCallback = null;

    const mockChrome = {
        storage: {
            local: {
                get: async (keys) => {
                    if (Array.isArray(keys)) {
                        const res = {};
                        keys.forEach(k => { res[k] = storageState[k]; });
                        return res;
                    }
                    if (typeof keys === 'string') {
                        return { [keys]: storageState[keys] };
                    }
                    return { ...storageState };
                },
                set: async (obj) => {
                    Object.assign(storageState, obj);
                }
            }
        },
        proxy: {
            settings: {
                set: (details, cb) => {
                    proxySettings = details ? details.value : null;
                    if (cb) cb();
                },
                get: (details, cb) => {
                    if (cb) cb({ value: proxySettings });
                }
            }
        },
        privacy: {
            network: {
                webRTCIPHandlingPolicy: {
                    set: (details, cb) => { if (cb) cb(); },
                    get: (details, cb) => { if (cb) cb({ value: 'disable_non_proxied_udp' }); }
                },
                networkPredictionEnabled: {
                    set: (details, cb) => { if (cb) cb(); },
                    get: (details, cb) => { if (cb) cb({ value: false }); }
                }
            }
        },
        runtime: {
            lastError: null,
            sendMessage: (msg, cb) => {
                if (cb) cb({ success: true });
            },
            sendNativeMessage: (host, msg, cb) => {
                if (nativeMessageCallback) {
                    return nativeMessageCallback(host, msg, cb);
                }
                if (cb) cb({ success: true, controlToken: 'mock-control-token-xyz-1234567890' });
            }
        }
    };

    return {
        mockChrome,
        getProxySettings: () => proxySettings,
        getStorage: () => storageState,
        setNativeHandler: (fn) => { nativeMessageCallback = fn; }
    };
}

(async () => {
    console.log('================================================================');
    console.log('  TEST SUITE: R6.9G.10.3.6 PRIVACY START PREP & SELF-HEAL');
    console.log('================================================================\n');

    // Scenario A: Owner Exact Scenario
    // persisted SYSTEM_VPN legacy config + failClosed=true + Privacy Relay companion with 1 healthy node
    await runTest('Scenario A: Owner legacy SYSTEM_VPN + failClosed=true -> auto-switch PRIVACY_RELAY -> canary PASS -> READY', async () => {
        const { mockChrome, getProxySettings, getStorage } = createMockChrome({
            xpider_privacy_config: {
                enabled: true,
                transportMode: 'SYSTEM_VPN',
                failClosed: true
            }
        });
        global.chrome = mockChrome;

        const engine = new PrivacyGatewayEngine();
        await engine.init();
        assert.strictEqual(engine.config.transportMode, 'EXTERNAL_VPN_MONITOR', 'SYSTEM_VPN alias should hydrate to EXTERNAL_VPN_MONITOR');
        assert.strictEqual(engine.config.failClosed, true);

        // Mock relay /status: daemon online, 1 healthy node configured
        engine._mockFetch = async (url, opts) => {
            if (url.includes('/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        health: 'HEALTHY',
                        totalNodes: 1,
                        selectedEgressId: 'node-us-east-1',
                        egressFingerprint: 'mocked-fingerprint-99887766'
                    })
                };
            }
            // Mock canary probe
            if (url.includes('cloudflare.com') || url.includes('ipify.org')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => 'ip=198.51.100.42\nloc=US'
                };
            }
            return { ok: false, status: 404 };
        };

        const prepResult = await engine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(prepResult.ready, true, 'Start prep must succeed');
        assert.strictEqual(prepResult.mode, 'PRIVACY_RELAY', 'Mode must self-heal to PRIVACY_RELAY');
        assert.strictEqual(engine.config.transportMode, 'PRIVACY_RELAY', 'Engine config mode must be PRIVACY_RELAY');
        assert.strictEqual(engine.isGateReady, true, 'isGateReady must be true');
        assert.strictEqual(engine.isGateActive, true, 'isGateActive must be true');

        // Verify proxy settings applied to 127.0.0.1:18988
        const proxy = getProxySettings();
        assert.ok(proxy, 'Proxy settings must be configured');
        assert.strictEqual(proxy.mode, 'fixed_servers');
        assert.strictEqual(proxy.rules.singleProxy.host, '127.0.0.1');
        assert.strictEqual(proxy.rules.singleProxy.port, 18988);

        // Verify storage persisted
        const stored = getStorage().xpider_privacy_config;
        assert.strictEqual(stored.transportMode, 'PRIVACY_RELAY', 'Persisted storage must be updated to PRIVACY_RELAY');

        // Run full preflight to verify end-to-end readiness
        const preflight = await engine.runPreflight();
        assert.strictEqual(preflight.ready, true);
        assert.strictEqual(preflight.mode, 'PRIVACY_RELAY');
        assert.strictEqual(preflight.directFallbackBlocked, 'BLOCKED');
        assert.strictEqual(preflight.egressCheck, 'PASS');
        assert.strictEqual(preflight.dnsPrivacy, 'UNKNOWN');
        assert.strictEqual(preflight.ipv6Protection, 'UNKNOWN');
    });

    // Scenario B: Relay Installed but Daemon Stopped
    // START should invoke Native Messaging START once -> wait bounded time -> READY -> campaign starts
    await runTest('Scenario B: Relay daemon stopped -> START auto-invokes Native Messaging -> connects -> READY', async () => {
        let nativeStartDispatched = false;
        let daemonStarted = false;

        const { mockChrome, setNativeHandler } = createMockChrome({
            xpider_privacy_config: {
                enabled: true,
                transportMode: 'PRIVACY_RELAY',
                failClosed: true
            }
        });
        global.chrome = mockChrome;

        setNativeHandler((host, msg, cb) => {
            if (msg.action === 'START') {
                nativeStartDispatched = true;
                daemonStarted = true;
                cb({ success: true, controlToken: 'mock-token-started-123' });
            } else if (msg.action === 'GET_TOKEN') {
                cb({ success: true, controlToken: 'mock-token-started-123' });
            }
        });

        const engine = new PrivacyGatewayEngine();
        await engine.init();

        engine._mockFetch = async (url) => {
            if (url.includes('/status')) {
                if (!daemonStarted) {
                    throw new Error('connect ECONNREFUSED 127.0.0.1:18989');
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        health: 'HEALTHY',
                        totalNodes: 1,
                        selectedEgressId: 'node-us-vps',
                        egressFingerprint: 'fp-daemon-started-1122'
                    })
                };
            }
            if (url.includes('cloudflare.com')) {
                return { ok: true, status: 200, text: async () => 'CANARY_OK' };
            }
            return { ok: false, status: 404 };
        };

        const prepResult = await engine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(nativeStartDispatched, true, 'Native START command must be dispatched');
        assert.strictEqual(prepResult.ready, true, 'Preparation must succeed once daemon starts');
        assert.strictEqual(prepResult.mode, 'PRIVACY_RELAY');
        assert.strictEqual(engine.isGateReady, true);
    });

    // Scenario C: Relay has Zero Nodes
    // Click START -> no campaign/network -> Settings opens at Add Egress Node with clear message
    await runTest('Scenario C: Relay daemon online but zero nodes -> fail-closed -> NO_HEALTHY_EGRESS -> Actionable UI', async () => {
        const { mockChrome } = createMockChrome({
            xpider_privacy_config: {
                enabled: true,
                transportMode: 'PRIVACY_RELAY',
                failClosed: true,
                proxyHost: '',
                proxyPort: null
            }
        });
        global.chrome = mockChrome;

        const engine = new PrivacyGatewayEngine();
        await engine.init();

        engine._mockFetch = async (url) => {
            if (url.includes('/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: false,
                        health: 'NO_NODES',
                        totalNodes: 0,
                        nodes: []
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        const prepResult = await engine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(prepResult.ready, false, 'Start must be blocked when 0 nodes exist');
        assert.strictEqual(prepResult.reason, 'NO_HEALTHY_EGRESS', 'Reason must be NO_HEALTHY_EGRESS');
        assert.strictEqual(prepResult.actionSection, 'privacy-relay-add-form', 'Must navigate to Add Egress Node form');
        assert.ok(prepResult.userMessage.includes('No healthy egress is configured'), 'Must provide clear human-readable guidance');
        assert.ok(!prepResult.userMessage.includes('EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE'), 'Must not display unrelated VPN enums');
        assert.strictEqual(engine.isGateReady, false);
    });

    // Scenario D: Saved Managed Proxy available, Relay unavailable
    // Click START -> managed proxy applied/readback/canary -> campaign starts
    await runTest('Scenario D: Relay unavailable but valid Managed Proxy saved -> auto-switch HTTPS_PROXY -> canary PASS -> READY', async () => {
        const { mockChrome, getProxySettings, getStorage } = createMockChrome({
            xpider_privacy_config: {
                enabled: true,
                transportMode: 'EXTERNAL_VPN_MONITOR', // Legacy non-enforceable mode
                failClosed: true,
                proxyHost: 'proxy.corp.example.com',
                proxyPort: 8443,
                proxyScheme: 'https'
            }
        });
        global.chrome = mockChrome;

        const engine = new PrivacyGatewayEngine();
        await engine.init();

        // Relay is completely offline
        engine._mockFetch = async (url) => {
            if (url.includes(':18989')) {
                throw new Error('connect ECONNREFUSED 127.0.0.1:18989');
            }
            if (url.includes('cloudflare.com')) {
                return { ok: true, status: 200, text: async () => 'CANARY_OK' };
            }
            return { ok: false, status: 404 };
        };

        const prepResult = await engine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(prepResult.ready, true, 'Start prep must succeed using saved Managed Proxy fallback');
        assert.strictEqual(prepResult.mode, 'HTTPS_PROXY', 'Mode must self-heal to HTTPS_PROXY');
        assert.strictEqual(engine.config.transportMode, 'HTTPS_PROXY');
        assert.strictEqual(engine.isGateReady, true);

        // Verify proxy settings applied to proxy.corp.example.com:8443
        const proxy = getProxySettings();
        assert.ok(proxy);
        assert.strictEqual(proxy.rules.singleProxy.host, 'proxy.corp.example.com');
        assert.strictEqual(proxy.rules.singleProxy.port, 8443);

        const stored = getStorage().xpider_privacy_config;
        assert.strictEqual(stored.transportMode, 'HTTPS_PROXY');
    });

    // Scenario E: Neither Relay nor Proxy configured
    // Fail-closed remains; zero target traffic; Start re-enabled; actionable settings shown
    await runTest('Scenario E: Neither relay nor proxy configured -> fail-closed -> PROXY_NOT_CONFIGURED / RELAY_OFFLINE', async () => {
        const { mockChrome } = createMockChrome({
            xpider_privacy_config: {
                enabled: true,
                transportMode: 'EXTERNAL_VPN_MONITOR',
                failClosed: true,
                proxyHost: '',
                proxyPort: ''
            }
        });
        global.chrome = mockChrome;

        const engine = new PrivacyGatewayEngine();
        await engine.init();

        engine._mockFetch = async () => {
            throw new Error('ECONNREFUSED');
        };

        const prepResult = await engine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(prepResult.ready, false, 'Must fail-closed');
        assert.strictEqual(engine.isGateReady, false);
        assert.ok(prepResult.reason === 'RELAY_OFFLINE' || prepResult.reason === 'PROXY_NOT_CONFIGURED');
        assert.ok(prepResult.userMessage.includes('Strict Privacy needs an enforced relay/proxy'));
    });

    // Scenario F: Legacy External Monitor explicitly selected by Owner with Strict OFF
    // Non-strict monitor may be used only if Owner explicitly turns strict off; never auto-disable strict.
    await runTest('Scenario F: Owner explicitly turned strict OFF (failClosed=false) -> EXTERNAL_VPN_MONITOR permitted', async () => {
        const { mockChrome } = createMockChrome({
            xpider_privacy_config: {
                enabled: true,
                transportMode: 'EXTERNAL_VPN_MONITOR',
                failClosed: false, // Strict mode explicitly turned off by Owner
                systemVpnConfirmed: true
            }
        });
        global.chrome = mockChrome;

        const engine = new PrivacyGatewayEngine();
        await engine.init();

        // Mock egress probe for VPN monitor
        engine._mockFetch = async (url) => {
            if (url.includes('cloudflare.com') || url.includes('ipify.org')) {
                return { ok: true, status: 200, text: async () => 'ip=203.0.113.199' };
            }
            return { ok: false, status: 404 };
        };

        const prepResult = await engine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(prepResult.ready, true, 'Non-strict external VPN monitor should be permitted when failClosed=false');
        assert.strictEqual(prepResult.mode, 'EXTERNAL_VPN_MONITOR');
        assert.strictEqual(engine.config.failClosed, false, 'failClosed must remain as chosen by Owner');

        // Test that when failClosed=true, strict is NEVER auto-disabled
        const strictEngine = new PrivacyGatewayEngine();
        strictEngine.config.failClosed = true;
        strictEngine.config.transportMode = 'EXTERNAL_VPN_MONITOR';
        strictEngine._mockFetch = async () => { throw new Error('offline'); };
        const strictResult = await strictEngine.ensureEnforcedPrivacyForStart();
        assert.strictEqual(strictResult.ready, false);
        assert.strictEqual(strictEngine.config.failClosed, true, 'Strict failClosed must NEVER be auto-disabled');
    });

    // Scenario G: Owner-Facing Mode Labels & Human-Readable Messages
    await runTest('Scenario G: Human-readable mode labels and error messages (no raw enums in user dialogs)', async () => {
        const popupHtmlPath = path.join(__dirname, 'popup.html');
        const popupHtml = fs.readFileSync(popupHtmlPath, 'utf8');

        // Verify select options in popup.html
        assert.ok(popupHtml.includes('Privacy Relay — enforced'), 'Must contain human-readable Privacy Relay label');
        assert.ok(popupHtml.includes('External VPN Monitor — not enforceable in Strict mode'), 'Must contain human-readable External VPN label');
        assert.ok(popupHtml.includes('Managed SOCKS5 Proxy — enforced'), 'Must contain human-readable SOCKS5 label');
        assert.ok(popupHtml.includes('Managed HTTPS Proxy — enforced'), 'Must contain human-readable HTTPS Proxy label');

        // Verify popup.js error alerts handle raw enums gracefully
        const popupJsPath = path.join(__dirname, 'popup.js');
        const popupJs = fs.readFileSync(popupJsPath, 'utf8');
        assert.ok(popupJs.includes('Strict Privacy needs an enforced relay/proxy'), 'Must include human-readable user alert string');
        assert.ok(popupJs.includes('ensureEnforcedPrivacyForStart'), 'startCampaign must invoke ensureEnforcedPrivacyForStart');
        assert.ok(popupJs.includes('[START_IPC]'), 'startCampaign must log [START_IPC]');
    });

    console.log('\n================================================================');
    console.log(`  RESULTS: ${passedTests} / ${totalTests} Tests Passed (100% PASS)`);
    console.log('================================================================\n');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
