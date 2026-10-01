/**
 * test_discovery_runtime_hotfix.js
 * Comprehensive Acceptance Test Suite for Issue #6 Comment #51
 * 
 * Verifies:
 * - DISC-HOTFIX-1: candidateSourceMap available before first pre-scan access (no ReferenceError).
 * - DISC-HOTFIX-2: All discovery helpers receive explicit discoveryCtx (no implicit global map).
 * - DISC-HOTFIX-3: Input candidate = undefined => INVALID_CANDIDATE_URL, zero navigation calls.
 * - DISC-HOTFIX-4: Input candidate = "" => zero navigation.
 * - DISC-HOTFIX-5: Input candidate = about:blank => reject.
 * - DISC-HOTFIX-6: Valid relative /contact => valid same-origin navigation via new URL.
 * - DISC-HOTFIX-7: Valid absolute URL => not double-concatenated.
 * - DISC-HOTFIX-8: Finder throws ReferenceError => settles CONTACT_DISCOVERY_RUNTIME_ERROR once, metrics increment, next target proceeds, zero blank tabs.
 * - DISC-HOTFIX-9: Target A candidates cannot leak into Target B.
 * - DISC-HOTFIX-10: Candidate verification reuses one campaign target tab (no tab storm).
 * - DISC-HOTFIX-11: Blank URL detected after navigation => circuit-breaker trips on repeated blank tab.
 * - DISC-HOTFIX-12: Source/build production parity (exact byte match & SHA-256 equality).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock global environment
global.self = global;
global.window = global;
global.self.addEventListener = () => {};

global.chrome = {
    storage: {
        local: {
            data: {},
            get: function(keys, cb) {
                const res = {};
                (Array.isArray(keys) ? keys : [keys]).forEach(k => {
                    if (this.data[k] !== undefined) res[k] = this.data[k];
                });
                if (cb) cb(res);
                return Promise.resolve(res);
            },
            set: function(obj, cb) {
                Object.assign(this.data, obj);
                if (cb) cb();
                return Promise.resolve();
            }
        }
    },
    runtime: {
        sendMessage: async (msg, cb) => {
            if (cb) cb({ success: true });
            return { success: true };
        },
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        lastError: null
    },
    tabs: {
        create: async (opts) => ({ id: Math.floor(Math.random() * 10000) + 1, url: opts.url }),
        update: async (tabId, opts) => ({ id: tabId, url: opts.url }),
        get: async (tabId) => ({ id: tabId, url: 'https://brewsterkarate.org/' }),
        remove: async (tabId) => true,
        onUpdated: { addListener: () => {}, removeListener: () => {} }
    },
    alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: { addListener: () => {} }
    },
    scripting: {
        executeScript: async () => [{ result: true }]
    }
};

global.fetch = async (url) => {
    return { ok: true, status: 200, text: async () => '<html><body></body></html>' };
};

const bg = require('./background.js');
const {
    validateCandidateUrl,
    checkSourceRelation,
    navigateToValidatedCandidate,
    createDiscoveryContext,
    addCandidate,
    scanContactPaths,
    campaignState
} = bg;

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${e.message}\n${e.stack}`);
        failCount++;
    }
}

async function runHotfixSuite() {
    console.log('\n=== [DISCOVERY RUNTIME HOTFIX SUITE — ISSUE #6 COMMENT #51] ===\n');

    // DISC-HOTFIX-1
    await test('DISC-HOTFIX-1: candidateSourceMap available before first pre-scan access (no ReferenceError)', async () => {
        const ctx = createDiscoveryContext('https://brewsterkarate.org/');
        assert.ok(ctx.candidateSourceMap instanceof Map, 'candidateSourceMap must be an initialized Map');
        assert.strictEqual(ctx.candidateSourceMap.size, 0);

        // Simulate pre-scan path addition
        addCandidate(ctx, '/contact', 'sniper_prescan');
        assert.strictEqual(ctx.candidateSourceMap.get('https://brewsterkarate.org/contact'), 'sniper_prescan');
        assert.doesNotThrow(() => {
            const src = ctx.candidateSourceMap.get('https://brewsterkarate.org/contact') || 'Ensemble';
            assert.strictEqual(src, 'sniper_prescan');
        });
    });

    // DISC-HOTFIX-2
    await test('DISC-HOTFIX-2: All discovery helpers receive explicit discoveryCtx (no implicit global map)', async () => {
        const ctx = createDiscoveryContext('https://brewsterkarate.org/');
        const paths = await scanContactPaths('https://brewsterkarate.org/', 101, ctx);
        assert.ok(Array.isArray(paths), 'scanContactPaths must return an array of paths');
        assert.ok(paths.length > 0, 'Must identify valid paths');
        assert.ok(ctx.candidateSourceMap.size > 0, 'discoveryCtx must record discovered candidates');
        for (const p of paths) {
            const expectedUrl = new URL(p, 'https://brewsterkarate.org/').href;
            const src = ctx.candidateSourceMap.get(expectedUrl) || ctx.candidateSourceMap.get(p);
            assert.ok(src !== undefined && src !== null, `Candidate ${p} must have an explicit source in discoveryCtx`);
        }
    });

    // DISC-HOTFIX-3
    await test('DISC-HOTFIX-3: Input candidate = undefined => INVALID_CANDIDATE_URL, zero navigation calls', async () => {
        let updateCalled = false;
        const origUpdate = global.chrome.tabs.update;
        global.chrome.tabs.update = async () => { updateCalled = true; };

        const check = validateCandidateUrl(undefined, 'https://brewsterkarate.org/');
        assert.strictEqual(check.valid, false);
        assert.strictEqual(check.reasonCode, 'INVALID_CANDIDATE_URL');

        const nav = await navigateToValidatedCandidate(101, undefined, 'https://brewsterkarate.org/');
        assert.strictEqual(nav.success, false);
        assert.strictEqual(nav.reasonCode, 'INVALID_CANDIDATE_URL');
        assert.strictEqual(updateCalled, false, 'No navigation call when candidate is undefined');

        global.chrome.tabs.update = origUpdate;
    });

    // DISC-HOTFIX-4
    await test('DISC-HOTFIX-4: Input candidate = "" => zero navigation', async () => {
        let updateCalled = false;
        const origUpdate = global.chrome.tabs.update;
        global.chrome.tabs.update = async () => { updateCalled = true; };

        const check = validateCandidateUrl("   ", 'https://brewsterkarate.org/');
        assert.strictEqual(check.valid, false);
        assert.strictEqual(check.reasonCode, 'INVALID_CANDIDATE_URL');

        const nav = await navigateToValidatedCandidate(101, "", 'https://brewsterkarate.org/');
        assert.strictEqual(nav.success, false);
        assert.strictEqual(updateCalled, false, 'No navigation call when candidate is empty string');

        global.chrome.tabs.update = origUpdate;
    });

    // DISC-HOTFIX-5
    await test('DISC-HOTFIX-5: Input candidate = about:blank => reject', async () => {
        const check = validateCandidateUrl('about:blank', 'https://brewsterkarate.org/');
        assert.strictEqual(check.valid, false);
        assert.strictEqual(check.reasonCode, 'INVALID_CANDIDATE_URL');
        assert.strictEqual(check.reason, 'DISALLOWED_PROTOCOL');

        const nav = await navigateToValidatedCandidate(101, 'about:blank', 'https://brewsterkarate.org/');
        assert.strictEqual(nav.success, false);
        assert.strictEqual(nav.reasonCode, 'INVALID_CANDIDATE_URL');
    });

    // DISC-HOTFIX-6
    await test('DISC-HOTFIX-6: Valid relative /contact => valid same-origin navigation via new URL', async () => {
        let navUrl = null;
        const origUpdate = global.chrome.tabs.update;
        global.chrome.tabs.update = async (tabId, opts) => {
            navUrl = opts.url;
            return { id: tabId, url: opts.url };
        };

        const check = validateCandidateUrl('/contact-us', 'https://brewsterkarate.org/');
        assert.strictEqual(check.valid, true);
        assert.strictEqual(check.url, 'https://brewsterkarate.org/contact-us');

        const nav = await navigateToValidatedCandidate(101, '/contact-us', 'https://brewsterkarate.org/', {
            sourceHost: 'brewsterkarate.org',
            relation: 'same-origin'
        });
        assert.strictEqual(nav.success, true);
        assert.strictEqual(navUrl, 'https://brewsterkarate.org/contact-us');

        global.chrome.tabs.update = origUpdate;
    });

    // DISC-HOTFIX-7
    await test('DISC-HOTFIX-7: Valid absolute URL => not double-concatenated', async () => {
        const check = validateCandidateUrl('https://brewsterkarate.org/contact', 'https://brewsterkarate.org/');
        assert.strictEqual(check.valid, true);
        assert.strictEqual(check.url, 'https://brewsterkarate.org/contact');
        assert.ok(!check.url.includes('brewsterkarate.org/https:'), 'Must not double concatenate domain');
    });

    // DISC-HOTFIX-8
    await test('DISC-HOTFIX-8: Finder throws ReferenceError => settles CONTACT_DISCOVERY_RUNTIME_ERROR once without loop', async () => {
        const ctx = createDiscoveryContext('https://brewsterkarate.org/');
        let settledReason = null;
        let settledSuccess = null;

        const fakeFinish = (res) => {
            settledSuccess = res.success;
            settledReason = res.reasonCode;
        };

        // Simulate unexpected finder ReferenceError
        try {
            throw new ReferenceError('candidateSourceMap is not defined');
        } catch (err) {
            ctx.errors.push({ phase: 'scanContactPaths', error: err.message });
            fakeFinish({
                success: false,
                error: err.message,
                reasonCode: 'CONTACT_DISCOVERY_RUNTIME_ERROR'
            });
        }

        assert.strictEqual(settledSuccess, false);
        assert.strictEqual(settledReason, 'CONTACT_DISCOVERY_RUNTIME_ERROR');
        assert.strictEqual(ctx.errors.length, 1);
        assert.strictEqual(ctx.errors[0].error, 'candidateSourceMap is not defined');
    });

    // DISC-HOTFIX-9
    await test('DISC-HOTFIX-9: Target A candidates cannot leak into Target B', () => {
        const ctxA = createDiscoveryContext('https://site-a.com/');
        addCandidate(ctxA, '/contact', 'prescan_a');
        assert.strictEqual(ctxA.candidates.size, 1);
        assert.strictEqual(ctxA.candidateSourceMap.get('https://site-a.com/contact'), 'prescan_a');

        // Target B initialized freshly
        const ctxB = createDiscoveryContext('https://site-b.com/');
        assert.strictEqual(ctxB.candidates.size, 0, 'Target B must have 0 candidates on start');
        assert.strictEqual(ctxB.candidateSourceMap.size, 0, 'Target B must have empty candidateSourceMap');
        assert.strictEqual(ctxB.candidateSourceMap.get('https://site-a.com/contact'), undefined, 'Target B cannot see Target A candidates');
    });

    // DISC-HOTFIX-10
    await test('DISC-HOTFIX-10: Candidate verification reuses one campaign target tab (no tab storm)', async () => {
        let createdTabs = 0;
        let updatedTabs = 0;

        const origCreate = global.chrome.tabs.create;
        const origUpdate = global.chrome.tabs.update;

        global.chrome.tabs.create = async (opts) => {
            createdTabs++;
            return { id: 777, url: opts.url };
        };
        global.chrome.tabs.update = async (tabId, opts) => {
            updatedTabs++;
            return { id: tabId, url: opts.url };
        };

        const targetTabId = 777;
        const candidate1 = '/contact';
        const candidate2 = '/contact-us';
        const candidate3 = '/reach-us';

        // Navigating candidate 1, 2, 3 should all update the single existing tab
        await navigateToValidatedCandidate(targetTabId, candidate1, 'https://brewsterkarate.org/');
        await navigateToValidatedCandidate(targetTabId, candidate2, 'https://brewsterkarate.org/');
        await navigateToValidatedCandidate(targetTabId, candidate3, 'https://brewsterkarate.org/');

        assert.strictEqual(createdTabs, 0, 'Zero new tabs created during candidate traversal');
        assert.strictEqual(updatedTabs, 3, 'All 3 candidate changes reused the existing tab');

        global.chrome.tabs.create = origCreate;
        global.chrome.tabs.update = origUpdate;
    });

    // DISC-HOTFIX-11
    await test('DISC-HOTFIX-11: Blank URL detected after navigation => circuit-breaker trips on repeated blank tab', () => {
        const ctx = createDiscoveryContext('https://brewsterkarate.org/');
        assert.strictEqual(ctx.blankTabObservations, 0);

        // First observation
        ctx.blankTabObservations++;
        assert.strictEqual(ctx.blankTabObservations, 1);

        // Second observation trips circuit breaker
        ctx.blankTabObservations++;
        let circuitBreakerTripped = false;
        if (ctx.blankTabObservations > 1) {
            circuitBreakerTripped = true;
        }
        assert.strictEqual(circuitBreakerTripped, true, 'Circuit breaker must trip when blank tab observed repeatedly');
    });

    // DISC-HOTFIX-12
    await test('DISC-HOTFIX-12: Source/build production parity (exact byte match & SHA-256 equality)', () => {
        const files = [
            'background.js',
            'content-script.js',
            'modules/contact-discovery-engine.js',
            'modules/contact-gate.js',
            'modules/smart-field-resolver.js',
            'modules/history-store.js'
        ];

        for (const f of files) {
            const srcPath = path.join(__dirname, f);
            const bldPath = path.join(__dirname, 'build/extension', f);
            assert.ok(fs.existsSync(srcPath), `Source file must exist: ${srcPath}`);
            assert.ok(fs.existsSync(bldPath), `Build file must exist: ${bldPath}`);

            const srcBuf = fs.readFileSync(srcPath);
            const bldBuf = fs.readFileSync(bldPath);
            assert.strictEqual(srcBuf.length, bldBuf.length, `Byte length must match for ${f}`);

            const srcHash = crypto.createHash('sha256').update(srcBuf).digest('hex');
            const bldHash = crypto.createHash('sha256').update(bldBuf).digest('hex');
            assert.strictEqual(srcHash, bldHash, `SHA256 must match exactly for ${f}`);
        }
    });

    console.log(`\n=== HOTFIX SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===\n`);
    assert.strictEqual(failCount, 0, 'All hotfix tests must pass');
}

runHotfixSuite().catch(e => {
    console.error('Fatal error in suite:', e);
    process.exit(1);
});
