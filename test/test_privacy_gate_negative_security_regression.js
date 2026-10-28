/**
 * test/test_privacy_gate_negative_security_regression.js
 * 
 * Strict Negative Security Regression Suite for:
 * [Issue #6 Comment #6462338468 — RC3.60 .84 Live Authority & Negative Gate Validation]
 * 
 * Specifically proves:
 * 1. Storage-cached READY snapshot NEVER grants live authorization (isGateReady === false on init).
 * 2. If Companion Relay is offline/disconnected: gate remains BLOCKED, public target navigation refused.
 * 3. If Companion returns HTTP 401 (token mismatch/unauthorized): gate transitions to BLOCKED, public target navigation refused.
 * 4. If Chrome proxy settings are cleared or mismatch: gate transitions to BLOCKED, public target navigation refused.
 * 5. If egress canary probe fails: gate transitions to BLOCKED, public target navigation refused.
 * 6. Reconciliation race condition: target navigation attempted while preflight is pending is strictly held/blocked (fail-closed).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

console.log('========================================================================');
console.log('  XPIDER RC3.60 .84 PRIVACY GATE NEGATIVE SECURITY REGRESSION SUITE');
console.log('========================================================================\n');

(async () => {
    const pgModulePath = path.resolve(__dirname, '../extension/modules/privacy-gateway.js');
    assert(fs.existsSync(pgModulePath), 'privacy-gateway.js must exist');
    const { PrivacyGatewayEngine } = require(pgModulePath);

    const makeRecentSnapshot = (overrides = {}) => ({
        ready: true,
        mode: 'PRIVACY_RELAY',
        failClosed: true,
        webrtcGuard: 'PASS',
        directFallbackBlocked: 'BLOCKED',
        egressCheck: 'PASS',
        lastCheck: new Date(Date.now() - 30 * 1000).toISOString(), // 30s ago
        selectedEgressId: 'do-egress-tor1-611293905',
        egressFingerprint: '05b6b53daead49e7',
        dnsPrivacy: 'UNKNOWN',
        ipv6Protection: 'UNKNOWN',
        ...overrides
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: Cold Startup with Cached READY, but Companion Relay is OFFLINE
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 1] Cold startup with cached READY, Companion Relay OFFLINE...');
    {
        const mockStorage = {
            xpider_privacy_config: {
                enabled: true,
                failClosed: true,
                transportMode: 'PRIVACY_RELAY',
                selectedEgressId: 'do-egress-tor1-611293905'
            },
            xpider_last_privacy_preflight: makeRecentSnapshot()
        };

        global.chrome = {
            storage: {
                local: {
                    get: (keys) => Promise.resolve(mockStorage),
                    set: (obj) => { Object.assign(mockStorage, obj); return Promise.resolve(); },
                    remove: (keys) => { keys.forEach(k => delete mockStorage[k]); return Promise.resolve(); }
                }
            },
            proxy: {
                settings: {
                    get: (opts, cb) => cb({ value: { mode: 'direct' } }),
                    set: (opts, cb) => cb && cb(),
                    clear: (opts, cb) => cb && cb()
                }
            },
            runtime: { lastError: null }
        };

        const pg = new PrivacyGatewayEngine();
        // Mock offline companion fetch (ECONNREFUSED)
        pg._mockFetch = async (url) => {
            throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:18989');
        };

        await pg.init();

        // Check in-memory flags immediately after init (before live preflight)
        assert.strictEqual(pg.isGateReady, false, 'isGateReady MUST be false on init despite cached READY snapshot');
        assert.strictEqual(pg.isGateActive, false, 'isGateActive MUST be false on init');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() MUST return false');
        assert.strictEqual(pg.lastPreflightResult.provisional, true, 'Snapshot must be marked provisional');
        assert.strictEqual(pg.lastPreflightResult.ready, false, 'Provisional snapshot ready must be false');
        console.log('   ✔ Sub-step 1.1: Init loaded snapshot provisionally with isGateReady=false.');

        // Run live preflight (should fail-closed due to offline companion)
        const pfRes = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(pfRes.ready, false, 'Preflight must fail when companion is offline');
        assert.strictEqual(pg.isGateReady, false, 'isGateReady must remain false');
        assert.strictEqual(pg.isGateActive, false, 'isGateActive must remain false');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() must remain false');
        assert(pg.failureReason.includes('OFFLINE') || pg.failureReason.includes('ECONNREFUSED') || pg.failureReason.includes('FAIL'), `Failure reason must indicate offline: ${pg.failureReason}`);

        // Verify public campaign start is blocked
        const startRes = await pg.ensureEnforcedPrivacyForStart({ autoStart: false, ownerFunctionTestMode: false });
        assert.strictEqual(startRes.ready, false, 'ensureEnforcedPrivacyForStart MUST be blocked');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() MUST remain false');
        console.log('   ✔ Sub-step 1.2: Live preflight & campaign start strictly blocked with offline reason.');
        console.log('✅ SCENARIO 1 PASS: Offline companion cannot be bypassed by cached snapshot.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: Cold Startup with Cached READY, Companion returns HTTP 401 UNAUTHORIZED
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 2] Cold startup with cached READY, Companion returns HTTP 401...');
    {
        const mockStorage = {
            xpider_privacy_config: {
                enabled: true,
                failClosed: true,
                transportMode: 'PRIVACY_RELAY',
                selectedEgressId: 'do-egress-tor1-611293905'
            },
            xpider_last_privacy_preflight: makeRecentSnapshot()
        };

        global.chrome.storage.local.get = (keys) => Promise.resolve(mockStorage);
        const pg = new PrivacyGatewayEngine();
        pg.ephemeralRelayToken = 'invalid-expired-token';

        // Mock companion returning 401 Unauthorized
        pg._mockFetch = async (url) => ({
            ok: false,
            status: 401,
            json: async () => ({ error: 'UNAUTHORIZED_TOKEN' })
        });

        await pg.init();
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'Gate must not be ready on init');

        const pfRes = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(pfRes.ready, false, 'Preflight must fail on 401');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() must be false');
        assert.strictEqual(pfRes.failureReason, 'PRIVACY_RELAY_UNAUTHORIZED', `Must report PRIVACY_RELAY_UNAUTHORIZED: got ${pfRes.failureReason}`);

        const startRes = await pg.ensureEnforcedPrivacyForStart({ autoStart: false });
        assert.strictEqual(startRes.ready, false, 'Start must be blocked on 401');
        console.log('✅ SCENARIO 2 PASS: 401 Unauthorized strictly blocks gate and clears live readiness.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: Chrome Proxy Settings Unset / Cleared
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 3] Chrome proxy settings cleared or tampered...');
    {
        const pg = new PrivacyGatewayEngine();
        pg._mockFetch = async (url) => {
            if (url.includes('18989/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        lifecycleState: 'READY',
                        totalNodes: 1,
                        selectedEgressId: 'do-egress-tor1-611293905'
                    })
                };
            }
            return { ok: true, status: 200, text: async () => 'ip=143.198.40.33\n' };
        };

        // chrome.proxy reports 'direct' mode (proxy removed)
        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'direct' } }),
                set: (opts, cb) => cb && cb()
            }
        };

        await pg.init();
        const pfRes = await pg.runPreflight({ autoStart: false });
        // Proxy readback fails -> directFallbackBlocked !== 'BLOCKED'
        assert.strictEqual(pfRes.ready, false, 'Preflight must fail when proxy settings do not enforce proxy');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() must be false');
        console.log('✅ SCENARIO 3 PASS: Unenforced Chrome proxy settings fail-closed.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: Live Egress Canary Probe Failure
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 4] Live egress canary probe failure...');
    {
        const pg = new PrivacyGatewayEngine();
        // Companion is up, but outbound internet canary drops
        pg._mockFetch = async (url) => {
            if (url.includes('18989/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        lifecycleState: 'READY',
                        totalNodes: 1,
                        selectedEgressId: 'do-egress-tor1-611293905'
                    })
                };
            }
            if (url.includes('cloudflare.com') || url.includes('ipify.org')) {
                throw new Error('Canary network unreachable / timeout');
            }
            return { ok: false, status: 500 };
        };

        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 } } } }),
                set: (opts, cb) => cb && cb()
            }
        };

        await pg.init();
        const pfRes = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(pfRes.ready, false, 'Preflight must fail when egress canary drops');
        assert.strictEqual(pfRes.egressCheck, 'FAIL', 'Egress check must report FAIL');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() must be false');
        console.log('✅ SCENARIO 4 PASS: Canary egress failure blocks gate.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 5: Reconciliation Race Condition (Navigation during Startup In-Flight)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 5] Reconciliation race condition: navigation attempted while preflight is pending...');
    {
        const mockStorage = {
            xpider_privacy_config: {
                enabled: true,
                failClosed: true,
                transportMode: 'PRIVACY_RELAY',
                selectedEgressId: 'do-egress-tor1-611293905'
            },
            xpider_last_privacy_preflight: makeRecentSnapshot()
        };
        const pg = new PrivacyGatewayEngine();
        let isDelayed = true;
        pg._mockFetch = async (url) => {
            if (isDelayed && url.includes('18989/status')) {
                await new Promise(r => setTimeout(r, 100));
            }
            if (url.includes('18989/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ relayReady: true, lifecycleState: 'READY', totalNodes: 1, selectedEgressId: 'do-egress-tor1-611293905' })
                };
            }
            return {
                ok: true,
                status: 200,
                text: async () => 'ip=143.198.40.33\n'
            };
        };

        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 } } } }),
                set: (opts, cb) => cb && cb()
            }
        };

        global.chrome.storage.local.get = (keys) => Promise.resolve(mockStorage);
        await pg.init();

        // Background preflight started but has not completed
        const pendingPreflight = pg.runPreflight({ autoStart: false });

        // During the race, caller immediately queries isPrivacyGateReady()
        const gateStatusDuringRace = pg.isPrivacyGateReady();
        assert.strictEqual(gateStatusDuringRace, false, 'Gate must be FALSE during in-flight reconciliation race!');

        const settledPreflight = await pendingPreflight;
        assert.strictEqual(settledPreflight.ready, true, 'Settled preflight passes once live check completes');
        assert.strictEqual(pg.isPrivacyGateReady(), true, 'Gate is ready only AFTER live preflight settles');

        console.log('✅ SCENARIO 5 PASS: In-flight race strictly guards gate as false until settled.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 6: Authoritative Single-Method Verification
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 6] Single authoritative isPrivacyGateReady check...');
    {
        const pg = new PrivacyGatewayEngine();
        const prototypeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(pg));
        const matchingMethods = prototypeMethods.filter(m => m === 'isPrivacyGateReady');
        assert.strictEqual(matchingMethods.length, 1, 'There must be exactly ONE isPrivacyGateReady method on the prototype');
        console.log('✅ SCENARIO 6 PASS: Exactly one authoritative isPrivacyGateReady method present.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 7: Post-RESTORE Invalidation & Recovery with Healthy Authorized Relay
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 7] Post-RESTORE fail-closed invalidation & healthy node recovery...');
    {
        const pg = new PrivacyGatewayEngine();
        let relayHealthy = false;
        pg.ephemeralRelayToken = 'valid-test-token-rc3-60';

        pg._mockFetch = async (url) => {
            if (url.includes('18989/status')) {
                if (!relayHealthy) {
                    return { ok: false, status: 503, json: async () => ({ error: 'SERVICE_UNAVAILABLE' }) };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        lifecycleState: 'READY',
                        totalNodes: 1,
                        selectedEgressId: 'do-egress-tor1-611293905'
                    })
                };
            }
            if (url.includes('cloudflare.com') || url.includes('ipify.org')) {
                if (!relayHealthy) throw new Error('Egress unreachable');
                return { ok: true, status: 200, text: async () => 'ip=143.198.40.33\n' };
            }
            return { ok: true, status: 200 };
        };

        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 } } } }),
                set: (opts, cb) => cb && cb()
            }
        };

        await pg.init();

        // 7.1 Post-restore preflight attempted while relay is degraded/offline
        const postRestoreDegraded = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(postRestoreDegraded.ready, false, 'Preflight must fail post-restore if relay is degraded');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() must remain false');
        console.log('   ✔ Sub-step 7.1: Degraded post-restore strictly blocked.');

        // 7.2 Healthy authorized node comes online: live preflight recovers to READY
        relayHealthy = true;
        const postRestoreHealthy = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(postRestoreHealthy.ready, true, 'Preflight must pass once healthy node is confirmed');
        assert.strictEqual(pg.isPrivacyGateReady(), true, 'isPrivacyGateReady() must become true after live healthy verification');
        console.log('   ✔ Sub-step 7.2: Healthy authorized relay successfully recovers gate to READY.');
        console.log('✅ SCENARIO 7 PASS: Post-restore fail-closed and healthy recovery verified.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 8: Post-READY Chrome Proxy Tampered to DIRECT (Proxyless Canary 200)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 8] Post-READY proxy tampered to DIRECT with proxyless canary returning 200...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.ephemeralRelayToken = 'valid-test-token-rc3-60';

        let proxyMode = 'fixed_servers';
        let tabsCreated = 0;
        let tabsUpdated = 0;
        let formsSubmitted = 0;

        global.chrome.tabs = {
            create: (opts) => { tabsCreated++; return Promise.resolve({ id: 1001, url: opts.url }); },
            update: (tabId, opts) => { tabsUpdated++; return Promise.resolve({ id: tabId, url: opts.url }); }
        };

        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => {
                    if (proxyMode === 'fixed_servers') {
                        cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 }, bypassList: ['127.0.0.1:18989'] } }, levelOfControl: 'controlled_by_this_extension' });
                    } else {
                        cb({ value: { mode: 'direct' }, levelOfControl: 'controlled_by_this_extension' });
                    }
                },
                set: (opts, cb) => cb && cb(),
                onChange: { addListener: (fn) => { global.__proxyChangeListener = fn; } }
            }
        };

        // Canary returns 200 always (simulating direct unproxied internet access)
        pg._mockFetch = async (url) => {
            if (url.includes('18989/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        lifecycleState: 'READY',
                        totalNodes: 1,
                        selectedEgressId: 'do-egress-tor1-611293905',
                        egressFingerprint: '05b6b53daead49e7'
                    })
                };
            }
            // In direct mode or proxy mode, public canary returns HTTP 200
            return { ok: true, status: 200, text: async () => 'ip=159.26.98.240\n' };
        };

        await pg.init();

        // 8.1 Achieve verified live READY state
        const initialPf = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(initialPf.ready, true, 'Initial preflight must pass');
        assert.strictEqual(pg.isPrivacyGateReady(), true, 'Gate must be ready');
        console.log('   ✔ Sub-step 8.1: Confirmed initial live READY state.');

        // 8.2 Tamper Chrome proxy to DIRECT externally
        proxyMode = 'direct';
        if (global.__proxyChangeListener) {
            global.__proxyChangeListener({ value: { mode: 'direct' } });
        }

        // 8.3 Verify continuity check detects tampered proxy and fails closed
        const contCheck = await pg.checkEgressContinuity();
        assert.strictEqual(contCheck.pass, false, 'Continuity check must fail when proxy is switched to DIRECT');
        assert(contCheck.reason.includes('TAMPERED') || contCheck.reason.includes('DIRECT'), `Reason must indicate tampered proxy: ${contCheck.reason}`);
        console.log('   ✔ Sub-step 8.2: checkEgressContinuity() rejected tampered direct proxy.');

        // 8.4 Verify contemporaneous verifier rejects public-target navigation and submission
        const liveVerifier = await pg.verifyAuthoritativeEgressEnforcement('PUBLIC_TARGET_NAVIGATION');
        assert.strictEqual(liveVerifier.ready, false, 'Live verifier must fail-closed on tampered proxy');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'isPrivacyGateReady() must be false');
        console.log('   ✔ Sub-step 8.3: verifyAuthoritativeEgressEnforcement() rejected tampered direct proxy.');

        // 8.5 Attempt navigation and submission actions while blocked
        const targetUrl = 'https://example-public-site.com/contact';
        const isReadyForNav = await pg.verifyAuthoritativeEgressEnforcement('TARGET_TAB_CREATION');
        if (isReadyForNav.ready) {
            await global.chrome.tabs.create({ url: targetUrl });
            await global.chrome.tabs.update(1001, { url: targetUrl });
            formsSubmitted++;
        }

        assert.strictEqual(tabsCreated, 0, 'ZERO external tabs must be created under tampered direct proxy');
        assert.strictEqual(tabsUpdated, 0, 'ZERO external tabs must be updated under tampered direct proxy');
        assert.strictEqual(formsSubmitted, 0, 'ZERO form submissions must occur under tampered direct proxy');
        console.log('   ✔ Sub-step 8.4: Spies confirmed 0 tabs created, 0 updated, 0 forms submitted.');
        console.log('✅ SCENARIO 8 PASS: Post-READY direct proxy tamper strictly blocked with zero public actions.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 9: Post-READY Live Companion 401 Unauthorized / Relay Drop
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 9] Post-READY live companion returns 401 or drops connection...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.ephemeralRelayToken = 'valid-test-token-rc3-60';

        let companionState = 'healthy';
        pg._mockFetch = async (url) => {
            if (url.includes('18989/status')) {
                if (companionState === '401') {
                    return { ok: false, status: 401, json: async () => ({ error: 'UNAUTHORIZED' }) };
                }
                if (companionState === 'dropped') {
                    throw new Error('connect ECONNREFUSED 127.0.0.1:18989');
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        lifecycleState: 'READY',
                        totalNodes: 1,
                        selectedEgressId: 'do-egress-tor1-611293905',
                        egressFingerprint: '05b6b53daead49e7'
                    })
                };
            }
            return { ok: true, status: 200, text: async () => 'ip=143.198.40.33\n' };
        };

        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 }, bypassList: ['127.0.0.1:18989'] } }, levelOfControl: 'controlled_by_this_extension' }),
                set: (opts, cb) => cb && cb()
            }
        };

        await pg.init();
        const initialPf = await pg.runPreflight({ autoStart: false });
        assert.strictEqual(initialPf.ready, true, 'Preflight must pass initially');

        // Companion returns 401
        companionState = '401';
        const v401 = await pg.verifyAuthoritativeEgressEnforcement('SUBMIT_BARRIER');
        assert.strictEqual(v401.ready, false, 'Verifier must fail on companion 401');
        assert.strictEqual(v401.reason, 'PRIVACY_RELAY_UNAUTHORIZED', `Must be PRIVACY_RELAY_UNAUTHORIZED: got ${v401.reason}`);
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'Gate must be invalidated on 401');
        console.log('   ✔ Sub-step 9.1: Live companion 401 strictly blocks submit barrier.');

        // Companion drops completely
        companionState = 'dropped';
        const vDrop = await pg.verifyAuthoritativeEgressEnforcement('SUBMIT_BARRIER');
        assert.strictEqual(vDrop.ready, false, 'Verifier must fail on companion drop');
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'Gate must remain false on drop');
        console.log('   ✔ Sub-step 9.2: Live companion connection drop strictly blocks submit barrier.');
        console.log('✅ SCENARIO 9 PASS: Live companion 401/drop fail-closed enforcement verified.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 10: ensureEnforcedPrivacyForStart Updates Authoritative Preflight Coherently
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 10] ensureEnforcedPrivacyForStart updates authoritative preflight coherently...');
    {
        const pg = new PrivacyGatewayEngine();
        pg.ephemeralRelayToken = 'valid-test-token-rc3-60';

        pg._mockFetch = async (url) => {
            if (url.includes('18989/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        relayReady: true,
                        lifecycleState: 'READY',
                        totalNodes: 1,
                        selectedEgressId: 'do-egress-tor1-611293905',
                        egressFingerprint: '05b6b53daead49e7'
                    })
                };
            }
            return { ok: true, status: 200, text: async () => 'ip=143.198.40.33\n' };
        };

        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 }, bypassList: ['127.0.0.1:18989'] } }, levelOfControl: 'controlled_by_this_extension' }),
                set: (opts, cb) => cb && cb()
            }
        };

        await pg.init();
        assert.strictEqual(pg.isPrivacyGateReady(), false, 'Gate must not be ready before start prep');

        // Run ensureEnforcedPrivacyForStart directly (without running separate runPreflight first)
        const startRes = await pg.ensureEnforcedPrivacyForStart({ autoStart: true });
        assert.strictEqual(startRes.ready, true, 'ensureEnforcedPrivacyForStart must succeed');
        assert(pg.lastPreflightResult !== null, 'lastPreflightResult must be set');
        assert.strictEqual(pg.lastPreflightResult.ready, true, 'lastPreflightResult.ready must be true');
        assert.strictEqual(pg.lastPreflightResult.provisional, false, 'lastPreflightResult.provisional must be false');
        assert.strictEqual(pg.isPrivacyGateReady(), true, 'isPrivacyGateReady() must return true without deadlock');
        console.log('   ✔ Sub-step 10.1: ensureEnforcedPrivacyForStart synchronized lastPreflightResult and isPrivacyGateReady().');
        console.log('✅ SCENARIO 10 PASS: ensureEnforcedPrivacyForStart coherence verified.\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO 11: MV3 Service Worker Restart with Cached READY and Disconnected Relay
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('>>> [SCENARIO 11] MV3 SW restart with cached READY and disconnected relay...');
    {
        const mockStorage = {
            xpider_privacy_config: {
                enabled: true,
                failClosed: true,
                transportMode: 'PRIVACY_RELAY',
                selectedEgressId: 'do-egress-tor1-611293905'
            },
            xpider_last_privacy_preflight: makeRecentSnapshot()
        };

        global.chrome.storage.local.get = (keys) => Promise.resolve(mockStorage);
        global.chrome.proxy = {
            settings: {
                get: (opts, cb) => cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 }, bypassList: ['127.0.0.1:18989'] } }, levelOfControl: 'controlled_by_this_extension' }),
                set: (opts, cb) => cb && cb()
            }
        };

        // Fresh instance simulates worker restart
        const freshPg = new PrivacyGatewayEngine();
        freshPg._mockFetch = async (url) => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:18989');
        };

        await freshPg.init();

        assert.strictEqual(freshPg.isGateReady, false, 'Fresh SW MUST NOT have isGateReady=true from cache');
        assert.strictEqual(freshPg.isPrivacyGateReady(), false, 'isPrivacyGateReady() MUST return false');
        assert.strictEqual(freshPg.lastPreflightResult.provisional, true, 'Snapshot must be provisional');

        const liveCheck = await freshPg.verifyAuthoritativeEgressEnforcement('CAMPAIGN_START');
        assert.strictEqual(liveCheck.ready, false, 'Live check must fail closed when relay is disconnected');
        assert.strictEqual(freshPg.isPrivacyGateReady(), false, 'Gate must remain false');
        console.log('   ✔ Sub-step 11.1: Fresh MV3 worker strictly blocks cached READY without live relay.');
        console.log('✅ SCENARIO 11 PASS: MV3 restart fail-closed behavior verified.\n');
    }

    console.log('========================================================================');
    console.log('  🏆 ALL 11 NEGATIVE SECURITY REGRESSION SCENARIOS PASSED 100%');
    console.log('========================================================================');
})().catch(err => {
    console.error(`❌ REGRESSION SUITE FAILED: ${err.message}\n${err.stack}`);
    process.exit(1);
});
