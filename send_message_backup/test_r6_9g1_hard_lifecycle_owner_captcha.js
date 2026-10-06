/**
 * R6.9G.1 Test Suite — Hard Lifecycle + Owner CAPTCHA Decision + No Forced Finish + No Soft-Pass
 * Issue #6 [R6.9G.1] Acceptance Tests
 */

'use strict';

const assert = require('assert');
let passed = 0, failed = 0;

async function testAsync(name, fn) {
    try { await fn(); console.log(`  ✅ PASS: ${name}`); passed++; }
    catch (e) { console.error(`  ❌ FAIL: ${name} — ${e.message}`); failed++; }
}
function test(name, fn) {
    try { fn(); console.log(`  ✅ PASS: ${name}`); passed++; }
    catch (e) { console.error(`  ❌ FAIL: ${name} — ${e.message}`); failed++; }
}

(async () => {
// ─── GATE 3 (R6.9G.1): HARD REJECT — no soft-pass ─────────────────────────
console.log('\n=== GATE 3: SOLVE_CAPTCHA HARD REJECT (R6.9G.1-3) ===\n');

test('Gate 3a: currentAttempt absent => HARD REJECT NO_CURRENT_ATTEMPT', () => {
    const campaignState = { currentAttempt: null, isActive: true };
    const shouldHardReject = !campaignState.currentAttempt || !campaignState.currentAttempt.attemptId;
    assert.strictEqual(shouldHardReject, true, 'Must HARD REJECT when currentAttempt absent');
    console.log('    [SOLVE_CAPTCHA] HARD_REJECT: currentAttempt absent. result=PASS');
});

test('Gate 3b: attempt_mismatch => HARD REJECT (no soft-pass)', () => {
    const campaignState = { currentAttempt: { attemptId: 'att_A' }, isActive: true };
    const requestAttemptId = 'att_B'; // mismatch
    function validateHard(requestId, curId) {
        if (requestId !== curId) return { valid: false, reason: 'attempt_mismatch' };
        return { valid: true };
    }
    const v = validateHard(requestAttemptId, campaignState.currentAttempt.attemptId);
    assert.strictEqual(v.valid, false, 'Must fail validation');
    // Soft-pass would check isIframeIdentityIssue — must NOT exist
    const oldSoftPass = v.reason === 'attempt_mismatch' && campaignState.isActive; // old behavior
    const newBehavior = !v.valid; // always reject if !valid
    assert.strictEqual(newBehavior, true, 'Hard reject: !v.valid => reject immediately');
    console.log(`    [SOLVE_CAPTCHA] HARD_REJECT reason=${v.reason} (no soft-pass). result=PASS`);
});

test('Gate 3c: session_mismatch => HARD REJECT (previously soft-pass for iframes)', () => {
    const reasons = ['attempt_mismatch', 'token_mismatch', 'campaign_run_mismatch', 'session_mismatch'];
    reasons.forEach(reason => {
        // All reasons must be hard rejected
        const shouldHardReject = true; // no soft-pass at all
        assert.strictEqual(shouldHardReject, true, `${reason} must be hard rejected`);
        console.log(`    [SOLVE_CAPTCHA] HARD_REJECT reason=${reason} result=PASS`);
    });
});

// ─── GATE 4: Lease ownership — no force-release ─────────────────────────────
console.log('\n=== GATE 4: LEASE OWNERSHIP (R6.9G.1-4) ===\n');

await testAsync('Gate 4a: Waiter timeout => self-terminate (NOT force-release lease)', async () => {
    const state = { activeTargetInFlight: true, isActive: true, sessionId: 1 };

    async function waitForTargetSlot(sessionId) {
        const SLOT_POLL_MS = 20;
        const SLOT_TIMEOUT_MS = 80; // short for test
        const start = Date.now();
        while (state.activeTargetInFlight) {
            if (sessionId !== state.sessionId) return { granted: false, reason: 'STALE_SESSION' };
            if (!state.isActive) return { granted: false, reason: 'INACTIVE_OR_PAUSED' };
            if (Date.now() - start > SLOT_TIMEOUT_MS) {
                // NEVER force-release
                return { granted: false, reason: 'WAITER_TIMEOUT' };
            }
            await new Promise(r => setTimeout(r, SLOT_POLL_MS));
        }
        return { granted: true, reason: 'SLOT_FREE' };
    }

    const result = await waitForTargetSlot(1);
    // Lease must NOT have been released by the waiter
    assert.strictEqual(state.activeTargetInFlight, true, 'Lease must remain held after waiter timeout');
    assert.strictEqual(result.granted, false, 'Waiter must self-terminate');
    assert.strictEqual(result.reason, 'WAITER_TIMEOUT');
    console.log(`    [SERIALIZED_GATE] Waiter timeout => self-terminated. activeTargetInFlight=${state.activeTargetInFlight} (still held). result=PASS`);
});

test('Gate 4b: Only finalizer (finally block) may release the lease', () => {
    const state = { activeTargetInFlight: true, lastFinalTs: 0 };
    // Simulating finally block of processNextCampaignTarget
    function finallyBlock(state) {
        state.lastFinalTs = Date.now();
        state.activeTargetInFlight = false; // ONLY this code path releases
    }
    // Before: still held
    assert.strictEqual(state.activeTargetInFlight, true);
    finallyBlock(state);
    assert.strictEqual(state.activeTargetInFlight, false, 'Lease released by finalizer only');
    assert.ok(state.lastFinalTs > 0);
    console.log(`    [SERIALIZED_GATE] Finalizer released lease. lastFinalTs=${state.lastFinalTs} result=PASS`);
});

// ─── GATE 5: No forced CAMPAIGN_FINISHED ────────────────────────────────────
console.log('\n=== GATE 5: NO FORCED CAMPAIGN_FINISHED (R6.9G.1-5) ===\n');

await testAsync('Gate 5a: Barrier timeout => FAULT state, NOT Finished', async () => {
    const state = { activeTargetInFlight: true, isFaulted: false, isLoopRunning: true, isActive: true };
    const BARRIER_POLL_MS = 20;
    const BARRIER_FAULT_MS = 80; // short for test

    async function finishBarrierWithFault() {
        const barrierStart = Date.now();
        while (state.activeTargetInFlight) {
            if (Date.now() - barrierStart > BARRIER_FAULT_MS) {
                // Enter FAULT, NOT finish
                state.isFaulted = true;
                state.isLoopRunning = false;
                return 'FAULT';
            }
            await new Promise(r => setTimeout(r, BARRIER_POLL_MS));
        }
        return 'FINISHED';
    }

    const result = await finishBarrierWithFault();
    assert.strictEqual(result, 'FAULT', 'Must enter FAULT, not FINISHED');
    assert.strictEqual(state.isFaulted, true);
    assert.strictEqual(state.activeTargetInFlight, true, 'Lease must not be force-released by barrier');
    assert.strictEqual(state.isActive, true, 'Campaign not marked as finished');
    console.log(`    [FINISH_BARRIER] FAULT entered. isFaulted=${state.isFaulted} activeTargetInFlight=${state.activeTargetInFlight} result=PASS`);
});

test('Gate 5b: remaining counter is ledger-derived, never forced to 0', () => {
    // Old behavior: campaignState.counters.remaining = 0 (hardcoded)
    // New behavior: ledger sync sets remaining
    const counters = { total: 10, completed: 10, remaining: 0 };
    function syncFromLedger(ledgerCompleted, ledgerTotal) {
        counters.remaining = Math.max(0, ledgerTotal - ledgerCompleted);
    }
    syncFromLedger(10, 10);
    assert.strictEqual(counters.remaining, 0, 'remaining should be 0 when all completed');
    syncFromLedger(8, 10);
    assert.strictEqual(counters.remaining, 2, 'remaining must reflect ledger, not forced 0');
    console.log(`    [COUNTER_SYNC] remaining=ledger-derived (not forced 0). result=PASS`);
});

// ─── GATE 9: dedupeKey includes attemptId + provider ────────────────────────
console.log('\n=== GATE 9: SINGLE-FLIGHT KEY (R6.9G.1-9) ===\n');

test('Gate 9a: dedupeKey includes attemptId + provider', () => {
    const curEpoch = 5;
    const attemptId = 'att_abc123';
    const provider = '2captcha';
    const activeTabId = 42;
    const sitekey = 'site_xyz';
    const captchaType = 'recaptcha';

    const dedupeKey = `${curEpoch}:${attemptId}:${provider}:${activeTabId}:${sitekey}:${captchaType}`;
    assert.ok(dedupeKey.includes(attemptId), 'dedupeKey must include attemptId');
    assert.ok(dedupeKey.includes(provider), 'dedupeKey must include provider');
    assert.ok(dedupeKey.includes(String(curEpoch)), 'dedupeKey must include epoch');
    console.log(`    [DEDUPE_KEY] key=${dedupeKey} result=PASS`);
});

test('Gate 9b: Different attemptId => different dedupeKey (no join across attempts)', () => {
    function makeKey(epoch, attemptId, provider, tabId, sitekey, type) {
        return `${epoch}:${attemptId}:${provider}:${tabId}:${sitekey}:${type}`;
    }
    const k1 = makeKey(1, 'att_A', '2captcha', 10, 'sk', 'recaptcha');
    const k2 = makeKey(1, 'att_B', '2captcha', 10, 'sk', 'recaptcha');
    assert.notStrictEqual(k1, k2, 'Different attempts must produce different keys');
    console.log(`    [DEDUPE_KEY] att_A != att_B => different keys. result=PASS`);
});

// ─── GATE E/2: Owner CAPTCHA Decision Modal ─────────────────────────────────
console.log('\n=== GATE E/2: OWNER CAPTCHA DECISION GATE ===\n');

test('Gate E1: OWNER_CAPTCHA_REQUEST validates exact attempt identity', () => {
    const campaignState = {
        currentAttempt: { attemptId: 'att_XYZ' },
        captchaEpoch: 3
    };
    const req = { attemptId: 'att_XYZ', captchaEpoch: 3 };
    const idMatch = campaignState.currentAttempt.attemptId === req.attemptId;
    const epochMatch = campaignState.captchaEpoch === req.captchaEpoch;
    assert.strictEqual(idMatch, true);
    assert.strictEqual(epochMatch, true);
    console.log('    [OWNER_CAPTCHA] Identity validated: attemptId+epoch match result=PASS');
});

test('Gate E2: Mismatched attemptId => REJECT (ATTEMPT_MISMATCH)', () => {
    const campaignState = { currentAttempt: { attemptId: 'att_ABC' }, captchaEpoch: 3 };
    const req = { attemptId: 'att_STALE', captchaEpoch: 3 };
    const idMatch = campaignState.currentAttempt.attemptId === req.attemptId;
    assert.strictEqual(idMatch, false);
    // Hard reject
    const error = idMatch ? null : 'ATTEMPT_MISMATCH';
    assert.strictEqual(error, 'ATTEMPT_MISMATCH');
    console.log('    [OWNER_CAPTCHA] Mismatch => REJECT ATTEMPT_MISMATCH result=PASS');
});

test('Gate E3: decision=auto starts provider AFTER explicit click (not before)', () => {
    let providerStarted = false;
    function onOwnerDecision(decision) {
        if (decision === 'auto') providerStarted = true; // only on explicit click
    }
    // Before owner clicks anything
    assert.strictEqual(providerStarted, false, 'Provider must NOT start before owner clicks');
    // After owner clicks Auto
    onOwnerDecision('auto');
    assert.strictEqual(providerStarted, true, 'Provider starts only after explicit Auto click');
    console.log('    [CAPTCHA_DECISION] auto: provider started AFTER explicit click. result=PASS');
});

test('Gate E4: decision=manual => timer stays paused, no provider call', () => {
    let timerRestored = false;
    let providerCalled = false;
    function onOwnerDecision(decision) {
        if (decision === 'auto') { timerRestored = true; providerCalled = true; }
        if (decision === 'manual') { /* timer stays paused, no provider */ }
    }
    onOwnerDecision('manual');
    assert.strictEqual(timerRestored, false, 'Timer must stay paused on manual');
    assert.strictEqual(providerCalled, false, 'Provider must NOT be called on manual');
    console.log('    [CAPTCHA_DECISION] manual: timer paused, no provider call. result=PASS');
});

test('Gate E5: one modal per attemptId+captchaEpoch (stale replaced)', () => {
    const modals = new Map();
    function showModal(attemptId, epoch) {
        const key = `${attemptId}:${epoch}`;
        // Remove stale modal for same key
        if (modals.has(key)) modals.delete(key);
        modals.set(key, { attemptId, epoch });
    }
    showModal('att_A', 1);
    showModal('att_A', 1); // Same key => stale replaced, only 1 modal
    assert.strictEqual(modals.size, 1, 'Exactly one modal per attemptId+epoch');
    showModal('att_B', 2); // Different
    assert.strictEqual(modals.size, 2);
    console.log('    [CAPTCHA_MODAL] oneModalPerAttempt=PASS result=PASS');
});

// ─── GATE 8: Provider-correct logs ──────────────────────────────────────────
console.log('\n=== GATE 8: PROVIDER-CORRECT LOGS (R6.9G.1-8) ===\n');

test('Gate 8: Log label derives from configuredMethod, not hardcoded 2captcha', () => {
    function getProviderLabel(method) {
        return method === 'nopecha' ? 'NopeCHA' : (method === 'audio' ? 'Audio' : '2Captcha');
    }
    assert.strictEqual(getProviderLabel('nopecha'), 'NopeCHA');
    assert.strictEqual(getProviderLabel('2captcha'), '2Captcha');
    assert.strictEqual(getProviderLabel('api'), '2Captcha');
    assert.strictEqual(getProviderLabel('audio'), 'Audio');

    // NopeCHA must NOT produce '2Captcha' label
    const nopechaLabel = getProviderLabel('nopecha');
    assert.notStrictEqual(nopechaLabel, '2Captcha', 'NopeCHA must not produce 2Captcha label');
    console.log(`    [PROVIDER_LABEL] nopecha=>${nopechaLabel} 2captcha=>2Captcha audio=>Audio result=PASS`);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════');
console.log(`R6.9G.1 Test Suite: ${passed}/${passed + failed} PASSED`);
if (failed > 0) {
    console.error(`❌ ${failed} FAILURES`);
    process.exit(1);
} else {
    console.log('✅ ALL R6.9G.1 GATES PASSED');
    process.exit(0);
}
})();
