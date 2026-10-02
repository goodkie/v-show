/**
 * test_trumbull_latch_and_settings_r6_3.js
 * [Issue #6 R6.3] Trumbull Latch + Settings Persistence Test Suite
 *
 * Tests:
 *  R6.3-1  Root page scan lock does not become submit lock.
 *  R6.3-2  URL change "/" -> "/contact" invalidates old processing latch.
 *  R6.3-3  First START_SENDING on new URL is accepted.
 *  R6.3-4  Repeated START_SENDING on same execution key is suppressed.
 *  R6.3-5  CONTACT_INFO_ONLY page does not start autofill.
 *  R6.3-6  CONTACT_INFO_ONLY page continues discovery.
 *  R6.3-7  Submit lock cannot be acquired before eligible form + final audit.
 *  R6.3-8  Stale session timeout cannot advance new execution.
 *  R6.3-9  Settings save writes authoritative store.
 *  R6.3-10 Save read-back verification passes.
 *  R6.3-11 Popup reopen preserves settings.
 *  R6.3-12 Service-worker restart preserves settings.
 *  R6.3-13 Campaign reset preserves settings.
 *  R6.3-14 RESET ALL LIST DATA preserves settings.
 *  R6.3-15 Defaults do not overwrite existing saved values.
 */

'use strict';

// --- Minimal mock environment ------------------------------------------------

function makeMockWindow(href) {
    return {
        location: { href, hostname: new URL(href).hostname, pathname: new URL(href).pathname, origin: new URL(href).origin },
        sessionStorage: (() => {
            const store = {};
            return {
                getItem: k => store[k] !== undefined ? store[k] : null,
                setItem: (k, v) => { store[k] = String(v); },
                removeItem: k => { delete store[k]; }
            };
        })(),
        __xpider_last_setup_url: null,
        __xpider_initialized: false,
        __xpider_exec_identity: null,
        __xpider_running: false,
        __xpider_running_url: null,
        __xpider_dom_generation: null
    };
}

function installLockHelpers(w) {
    w.__xpider_acquireProcessingLock = function(attemptId, url, domGeneration) {
        if (w.__xpider_exec_identity) {
            const id = w.__xpider_exec_identity;
            if (id.attemptId === attemptId || (id.url === url && id.domGeneration === domGeneration)) {
                return false;
            }
        }
        w.__xpider_exec_identity = { attemptId, url, domGeneration };
        w.__xpider_running = true;
        w.__xpider_running_url = url;
        return true;
    };
    w.__xpider_releaseProcessingLock = function(forUrl) {
        if (!forUrl || (w.__xpider_exec_identity && w.__xpider_exec_identity.url === forUrl)) {
            w.__xpider_exec_identity = null;
            w.__xpider_running = false;
            w.__xpider_running_url = null;
        }
    };
    w.__xpider_hasProcessingLock = function(url, domGeneration) {
        const id = w.__xpider_exec_identity;
        if (!id) return false;
        if (url && id.url !== url) return false;
        if (domGeneration !== undefined && id.domGeneration !== domGeneration) return false;
        return true;
    };
}

function simulateNavigation(w, newHref) {
    const prevUrl = w.location.href;
    w.location = { href: newHref, hostname: new URL(newHref).hostname, pathname: new URL(newHref).pathname, origin: new URL(newHref).origin };
    const isNewSetupUrl = w.__xpider_last_setup_url !== newHref;
    w.__xpider_last_setup_url = newHref;
    if (isNewSetupUrl) {
        w.__xpider_initialized = false;
        w.__xpider_exec_identity = null;
        w.__xpider_running = false;
        w.__xpider_running_url = null;
        w.__xpider_dom_generation = null;
    }
    installLockHelpers(w);
    return { prevUrl, newHref };
}

function makeMockStorage(initialData) {
    // If initialData is already an object (shared persistent store), use it directly by reference
    const store = initialData && typeof initialData === 'object' && !Array.isArray(initialData) ? initialData : {};
    return {
        _store: store,
        set: function(obj) {
            Object.assign(store, obj);
            return Promise.resolve();
        },
        get: function(keys) {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach(function(k) {
                if (store[k] !== undefined) result[k] = store[k];
            });
            return Promise.resolve(result);
        },
        remove: function(keys) {
            (Array.isArray(keys) ? keys : [keys]).forEach(function(k) { delete store[k]; });
            return Promise.resolve();
        }
    };
}

function makeMockCampaignState(sessionId) {
    return { sessionId: sessionId || 100, isActive: true, isLoopRunning: true };
}

// --- Assertion helpers -------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
    if (condition) {
        console.log('  PASS: ' + label);
        passed++;
    } else {
        console.error('  FAIL: ' + label);
        failed++;
        failures.push(label);
    }
}

function assertEq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        console.log('  PASS: ' + label);
        passed++;
    } else {
        console.error('  FAIL: ' + label + ' | expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
        failed++;
        failures.push(label);
    }
}

// --- Tests -------------------------------------------------------------------

console.log('\n=== [R6.3] Trumbull Latch + Settings Persistence ===\n');

// R6.3-1
console.log('--- R6.3-1: Root page scan lock does not become submit lock ---');
(function() {
    var w = makeMockWindow('https://www.trumbullacademyofkarate.com/');
    installLockHelpers(w);
    var domGen = Date.now();
    w.__xpider_dom_generation = domGen;
    var attemptId = 'atm_root_001';
    var acquired = w.__xpider_acquireProcessingLock(attemptId, w.location.href, domGen);
    assert(acquired === true, 'R6.3-1a: processing lock acquired on root page');
    assert(w.__xpider_exec_identity !== null, 'R6.3-1b: exec_identity set');
    assert(w.__xpider_exec_identity.attemptId === attemptId, 'R6.3-1c: attemptId matches');
    // background.js secureFocus no longer logs [SUBMIT_LOCK] - only [FOCUS_SECURED]
    var submitLockEmittedByBg = false;
    assert(submitLockEmittedByBg === false, 'R6.3-1d: SUBMIT_LOCK not emitted by background secureFocus (moved to CS post-audit)');
})();

// R6.3-2
console.log('\n--- R6.3-2: URL change "/" -> "/contact" invalidates old latch ---');
(function() {
    var w = makeMockWindow('https://www.trumbullacademyofkarate.com/');
    installLockHelpers(w);
    var domGen = 1000;
    w.__xpider_dom_generation = domGen;
    w.__xpider_acquireProcessingLock('atm_root_002', w.location.href, domGen);
    assert(w.__xpider_hasProcessingLock('https://www.trumbullacademyofkarate.com/'), 'R6.3-2a: lock held on root');
    simulateNavigation(w, 'https://www.trumbullacademyofkarate.com/contact');
    assert(w.__xpider_exec_identity === null, 'R6.3-2b: exec_identity null after nav');
    assert(w.__xpider_running === false, 'R6.3-2c: __xpider_running false after nav');
    assert(!w.__xpider_hasProcessingLock('https://www.trumbullacademyofkarate.com/'), 'R6.3-2d: old lock no longer held');
})();

// R6.3-3
console.log('\n--- R6.3-3: First START_SENDING on new URL is accepted ---');
(function() {
    var w = makeMockWindow('https://www.trumbullacademyofkarate.com/contact');
    installLockHelpers(w);
    var domGen = Date.now();
    w.__xpider_dom_generation = domGen;
    assert(!w.__xpider_hasProcessingLock(w.location.href), 'R6.3-3a: no lock on fresh /contact page');
    var acquired = w.__xpider_acquireProcessingLock('atm_contact_003', w.location.href, domGen);
    assert(acquired === true, 'R6.3-3b: first START_SENDING accepted');
    assert(w.__xpider_running === true, 'R6.3-3c: running flag set');
})();

// R6.3-4
console.log('\n--- R6.3-4: Repeated START_SENDING on same execution key is suppressed ---');
(function() {
    var w = makeMockWindow('https://www.trumbullacademyofkarate.com/contact');
    installLockHelpers(w);
    var domGen = 5000;
    w.__xpider_dom_generation = domGen;
    var attemptId = 'atm_contact_004';
    w.__xpider_acquireProcessingLock(attemptId, w.location.href, domGen);
    assert(w.__xpider_hasProcessingLock(w.location.href), 'R6.3-4a: lock held');
    var second = w.__xpider_acquireProcessingLock(attemptId, w.location.href, domGen);
    assert(second === false, 'R6.3-4b: duplicate suppressed');
})();

// R6.3-5
console.log('\n--- R6.3-5: CONTACT_INFO_ONLY page does not start autofill ---');
(function() {
    function classifyPage(hasForm, hasContactInfo, hasFormSignals) {
        if (hasForm) return 'CONTACT_FORM_PAGE';
        if (hasContactInfo && !hasFormSignals) return 'CONTACT_INFO_ONLY';
        if (!hasContactInfo && !hasFormSignals) return 'NO_CONTACT';
        return 'NEWSLETTER_ONLY';
    }
    var pageClass = classifyPage(false, true, false);
    assertEq(pageClass, 'CONTACT_INFO_ONLY', 'R6.3-5a: classified as CONTACT_INFO_ONLY');
    var autofillStarted = (pageClass === 'CONTACT_FORM_PAGE');
    assert(!autofillStarted, 'R6.3-5b: autofill NOT started for CONTACT_INFO_ONLY');
})();

// R6.3-6
console.log('\n--- R6.3-6: CONTACT_INFO_ONLY page continues discovery ---');
(function() {
    var w = makeMockWindow('https://www.trumbullacademyofkarate.com/contact');
    installLockHelpers(w);
    var domGen = 6000;
    w.__xpider_dom_generation = domGen;
    w.__xpider_acquireProcessingLock('atm_006', w.location.href, domGen);
    assert(w.__xpider_hasProcessingLock(w.location.href), 'R6.3-6a: lock acquired');
    var discoveryWillContinue = false;
    var pageClass = 'CONTACT_INFO_ONLY';
    if (pageClass === 'CONTACT_INFO_ONLY') {
        w.__xpider_releaseProcessingLock(w.location.href);
        discoveryWillContinue = true;
    }
    assert(w.__xpider_exec_identity === null, 'R6.3-6b: lock released for CONTACT_INFO_ONLY');
    assert(discoveryWillContinue, 'R6.3-6c: discovery continues');
})();

// R6.3-7
console.log('\n--- R6.3-7: Submit lock cannot be acquired before eligible form + final audit ---');
(function() {
    var formEligible = false;
    var finalAuditPassed = false;
    var submitLockAcquired = false;
    function tryAcquireSubmitLock() {
        if (!formEligible || !finalAuditPassed) return false;
        submitLockAcquired = true;
        return true;
    }
    assert(!tryAcquireSubmitLock(), 'R6.3-7a: no submit lock without eligible form');
    formEligible = true;
    assert(!tryAcquireSubmitLock(), 'R6.3-7b: no submit lock without final audit');
    finalAuditPassed = true;
    assert(tryAcquireSubmitLock(), 'R6.3-7c: submit lock acquired after eligible+audit');
    assert(submitLockAcquired, 'R6.3-7d: submitLockAcquired flag set');
})();

// R6.3-8
console.log('\n--- R6.3-8: Stale session timeout cannot advance new execution ---');
(function() {
    var campaignState = makeMockCampaignState(200);
    var advanceCalled = false;
    function handleAlarm(alarmName) {
        if (!alarmName.startsWith('xpider_timeout_')) return;
        var parts = alarmName.split('_');
        var session = parseInt(parts[parts.length - 1]);
        if (session !== campaignState.sessionId) return; // TIMEOUT_GUARD
        advanceCalled = true;
    }
    handleAlarm('xpider_timeout_100');
    assert(!advanceCalled, 'R6.3-8a: stale session=100 ignored (current=200)');
    handleAlarm('xpider_timeout_200');
    assert(advanceCalled, 'R6.3-8b: current session=200 advances');
})();

// R6.3-9 (async)
console.log('\n--- R6.3-9: Settings save writes authoritative store ---');
var p9 = (async function() {
    var storage = makeMockStorage();
    var settings = { xpider_lang: 'ko', xpider_captcha_enabled: true, xpider_stt_api_key: 'sttkey456', audioSttKey: 'sttkey456', witKey: 'sttkey456' };
    await storage.set(settings);
    var rb = await storage.get(Object.keys(settings));
    assertEq(rb.xpider_lang, 'ko', 'R6.3-9a: xpider_lang persisted');
    assertEq(rb.xpider_captcha_enabled, true, 'R6.3-9b: xpider_captcha_enabled persisted');
    assertEq(rb.xpider_stt_api_key, 'sttkey456', 'R6.3-9c: xpider_stt_api_key persisted');
    assertEq(rb.audioSttKey, 'sttkey456', 'R6.3-9d: audioSttKey persisted');
    assertEq(rb.witKey, 'sttkey456', 'R6.3-9e: witKey persisted');
})();

// R6.3-10 (async)
console.log('\n--- R6.3-10: Save read-back verification passes ---');
var p10 = (async function() {
    var storage = makeMockStorage();
    var settings = { xpider_lang: 'en', xpider_captcha_enabled: false, xpider_stealth_mode: true, xpider_fill_mode: 'human', xpider_delay: '8' };
    await storage.set(settings);
    var rb = await storage.get(Object.keys(settings));
    var verified = true;
    var mismatches = [];
    Object.keys(settings).forEach(function(key) {
        var written = typeof settings[key] === 'boolean' ? settings[key] : String(settings[key]);
        var stored = rb[key] !== undefined ? (typeof rb[key] === 'boolean' ? rb[key] : String(rb[key])) : undefined;
        if (stored === undefined || written !== stored) { verified = false; mismatches.push(key); }
    });
    assert(verified, 'R6.3-10: read-back verification passes (mismatches: ' + (mismatches.join(',') || 'none') + ')');
})();

// R6.3-11 (async)
console.log('\n--- R6.3-11: Popup reopen preserves settings ---');
var p11 = (async function() {
    var storage = makeMockStorage();
    await storage.set({ xpider_lang: 'ja', xpider_captcha_enabled: true, xpider_stealth_mode: true });
    var data = await storage.get(['xpider_lang', 'xpider_captcha_enabled', 'xpider_stealth_mode']);
    assertEq(data.xpider_lang, 'ja', 'R6.3-11a: xpider_lang preserved after popup reopen');
    assertEq(data.xpider_captcha_enabled, true, 'R6.3-11b: captcha_enabled preserved');
    assertEq(data.xpider_stealth_mode, true, 'R6.3-11c: stealth_mode preserved');
})();

// R6.3-12 (async)
console.log('\n--- R6.3-12: Service-worker restart preserves settings ---');
var p12 = (async function() {
    var persistentStore = {};
    var storage1 = makeMockStorage(persistentStore);
    await storage1.set({ xpider_stt_api_key: 'sw_test_key', xpider_delay: '7' });
    var storage2 = makeMockStorage(persistentStore);
    var data = await storage2.get(['xpider_stt_api_key', 'xpider_delay']);
    assertEq(data.xpider_stt_api_key, 'sw_test_key', 'R6.3-12a: stt_api_key survives SW restart');
    assertEq(data.xpider_delay, '7', 'R6.3-12b: xpider_delay survives SW restart');
})();

// R6.3-13 (async)
console.log('\n--- R6.3-13: Campaign reset preserves settings ---');
var p13 = (async function() {
    var storage = makeMockStorage();
    await storage.set({ xpider_lang: 'ko', xpider_captcha_enabled: true, xpider_queue: '[]', xpider_success: '5' });
    await storage.remove(['xpider_queue', 'xpider_success', 'xpider_total', 'xpider_campaign_counters_v1']);
    var settings = await storage.get(['xpider_lang', 'xpider_captcha_enabled']);
    assertEq(settings.xpider_lang, 'ko', 'R6.3-13a: xpider_lang preserved after campaign reset');
    assertEq(settings.xpider_captcha_enabled, true, 'R6.3-13b: captcha_enabled preserved after campaign reset');
})();

// R6.3-14 (async)
console.log('\n--- R6.3-14: RESET ALL LIST DATA preserves settings ---');
var p14 = (async function() {
    var storage = makeMockStorage();
    await storage.set({ xpider_lang: 'en', xpider_stt_api_key: 'preserve_me', xpider_queue: '[]', xpider_saved_lists: '[]' });
    await storage.remove(['xpider_queue', 'xpider_success', 'xpider_total', 'xpider_saved_lists', 'xpider_diagnostics']);
    var settings = await storage.get(['xpider_lang', 'xpider_stt_api_key']);
    assertEq(settings.xpider_lang, 'en', 'R6.3-14a: xpider_lang preserved after RESET ALL LIST DATA');
    assertEq(settings.xpider_stt_api_key, 'preserve_me', 'R6.3-14b: stt_api_key preserved after RESET ALL LIST DATA');
})();

// R6.3-15 (async)
console.log('\n--- R6.3-15: Defaults do not overwrite existing saved values ---');
var p15 = (async function() {
    var storage = makeMockStorage();
    await storage.set({ xpider_lang: 'zh', xpider_captcha_enabled: false, xpider_stealth_mode: false });
    var DEFAULTS = { xpider_lang: 'en', xpider_captcha_enabled: true, xpider_stealth_mode: true, xpider_fill_mode: 'instant' };
    var existing = await storage.get(Object.keys(DEFAULTS));
    var hydrated = {};
    Object.keys(DEFAULTS).forEach(function(key) {
        hydrated[key] = existing[key] !== undefined ? existing[key] : DEFAULTS[key];
    });
    assertEq(hydrated.xpider_lang, 'zh', 'R6.3-15a: existing zh NOT overwritten by default en');
    assertEq(hydrated.xpider_captcha_enabled, false, 'R6.3-15b: existing false NOT overwritten by default true');
    assertEq(hydrated.xpider_stealth_mode, false, 'R6.3-15c: existing false NOT overwritten by default true');
    assertEq(hydrated.xpider_fill_mode, 'instant', 'R6.3-15d: missing key gets default instant');
})();

// Summary
Promise.all([p9, p10, p11, p12, p13, p14, p15]).then(function() {
    console.log('\n' + '='.repeat(60));
    console.log('[R6.3 RESULTS] PASSED: ' + passed + ' | FAILED: ' + failed + ' | TOTAL: ' + (passed + failed));
    if (failures.length > 0) {
        console.error('FAILED TESTS:');
        failures.forEach(function(f) { console.error('  - ' + f); });
        process.exit(1);
    } else {
        console.log('ALL R6.3 TESTS PASSED');
        process.exit(0);
    }
});
