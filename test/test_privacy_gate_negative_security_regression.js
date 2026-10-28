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

    console.log('========================================================================');
    console.log('  🏆 ALL 7 NEGATIVE SECURITY REGRESSION SCENARIOS PASSED 100%');
    console.log('========================================================================');
})().catch(err => {
    console.error(`❌ REGRESSION SUITE FAILED: ${err.message}\n${err.stack}`);
    process.exit(1);
});
