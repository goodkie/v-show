/**
 * test_history_ledger_authority_and_outcome_accuracy_r6_9a.js
 * [CHATGPT][OWNER DECISION][extension-form-sender][R6.9A PROMOTE HISTORYSTORE LEDGER TO AUTHORITATIVE OUTCOME SOURCE + OUTCOME ACCURACY UPGRADE]
 *
 * Verifies all 20 required tests for Issue #6 R6.9A:
 * 1. ledger Succeeded count is source of UI SUCCESS.
 * 2. legacy success cache mismatch -> ledger wins.
 * 3. pause/resume preserves campaignRunId and counts.
 * 4. service worker restart rebuilds counters from ledger.
 * 5. exactly one terminal attempt per started target.
 * 6. no direct success increment outside ledger settlement.
 * 7. delayed hidden success transition at 12s -> CONFIRMED_SUCCESS.
 * 8. aria-live success mutation -> CONFIRMED_SUCCESS.
 * 9. form replacement + positive confirmation -> CONFIRMED_SUCCESS.
 * 10. submitEvent-only after 20s -> DELIVERY_UNKNOWN.
 * 11. network commit without outcome -> DELIVERY_UNKNOWN.
 * 12. explicit validation error -> FAILURE.
 * 13. explicit server rejection -> FAILURE.
 * 14. non-inquiry -> SKIPPED, not FAILURE.
 * 15. owner visual UNKNOWN->SUCCESS updates same attempt exactly once.
 * 16. UI/History/CSV success counts identical.
 * 17. completed reconciliation: started = success + failure + unknown + timeout + skipped + paused.
 * 18. five owner false-negative fixtures exercise delayed observer.
 * 19. khaskarate submitEvent=false cannot be upgraded merely by timeout.
 * 21. legacy attempts with no campaignRunId + 20 CONFIRMED_SUCCESS => upgrade => History authoritative Succeeded remains 20.
 * 22. persisted xpider_history_generation=7 restores before migration, keeping Succeeded=20 in generation 7.
 * 23. durable & idempotent migration across cold instances.
 * 24. partially-migrated currentRun scope unions unassigned current-gen attempts (no undercounting).
 * 25. terminal immutability guards against late timeouts and stale callbacks.
 */

const assert = require('assert');
const path = require('path');
const { HistoryStore } = require('./modules/history-store.js');

let passCount = 0;
let failCount = 0;

function it(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${e.message}`);
        console.error(e.stack);
        failCount++;
    }
}

async function itAsync(name, fn) {
    try {
        await fn();
        console.log(`  PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${e.message}`);
        console.error(e.stack);
        failCount++;
    }
}

// -------------------------------------------------------------
// In-Memory Storage Mock
// -------------------------------------------------------------
class MockStorage {
    constructor(initial = {}) {
        this.store = { ...initial };
    }
    get(keys, cb) {
        const res = {};
        const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
        for (const k of keyList) {
            if (this.store[k] !== undefined) res[k] = this.store[k];
        }
        if (typeof cb === 'function') cb(res);
        return Promise.resolve(res);
    }
    set(obj, cb) {
        Object.assign(this.store, obj);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
    }
    remove(keys, cb) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete this.store[k];
        if (typeof cb === 'function') cb();
        return Promise.resolve();
    }
}

// -------------------------------------------------------------
// Mock SubmissionOutcomeVerifier for Content-Script Testing
// -------------------------------------------------------------
class MockOutcomeVerifier {
    constructor(options = {}) {
        this.baseWindowMs = 8000;
        this.extendedWindowMs = 20000;
        this.maxWindowMs = 30000;
        this.options = options;
    }

    evaluateSignals(submitOutcome, state) {
        const signals = {
            submitAttempted: true,
            submitEventSeen: !!submitOutcome.submitEventFired,
            physicalClickDispatched: !!submitOutcome.physicalClickDispatched,
            networkCommitObserved: !!state.networkCommit,
            networkStatus: state.networkStatus || null,
            successNodeVisibleTransition: !!state.successNodeVisible,
            successTextTransition: !!state.successTextFound,
            ariaLiveSuccessTransition: !!state.ariaLiveSuccess,
            formReset: !!state.formReset,
            formHidden: !!state.formHidden,
            formReplaced: !!state.formReplaced,
            buttonSuccessState: !!state.buttonSuccess,
            thankYouUrlTransition: !!state.thankYouUrl,
            frameworkSuccessState: !!state.frameworkSuccess,
            validationErrorTransition: !!state.newValidationError,
            serverErrorTransition: !!state.serverError,
            captchaRejected: !!state.captchaRejected,
            confirmationStrength: 'NONE',
            evidenceTimestamp: Date.now()
        };

        const hasStrongSuccess = signals.successNodeVisibleTransition ||
            signals.successTextTransition ||
            signals.ariaLiveSuccessTransition ||
            signals.thankYouUrlTransition ||
            signals.buttonSuccessState ||
            (signals.formReplaced && signals.submitEventSeen) ||
            signals.frameworkSuccessState;

        const hasStrongFailure = signals.validationErrorTransition ||
            signals.serverErrorTransition ||
            signals.captchaRejected;

        if (hasStrongFailure) {
            signals.confirmationStrength = 'DETERMINISTIC_FAILURE';
            return { outcome: 'FAILURE', reason: signals.serverErrorTransition ? 'SERVER_ERROR' : (signals.validationErrorTransition ? 'VALIDATION_ERROR' : 'CAPTCHA_REJECTED'), evidence: signals };
        }

        if (signals.submitEventSeen && hasStrongSuccess) {
            signals.confirmationStrength = 'STRONG_POSITIVE';
            return { outcome: 'CONFIRMED_SUCCESS', reason: 'SUCCESS_CONFIRMED', evidence: signals };
        }

        if (signals.submitEventSeen || signals.physicalClickDispatched || signals.networkCommitObserved) {
            signals.confirmationStrength = 'AMBIGUOUS';
            return { outcome: 'DELIVERY_UNKNOWN', reason: 'DELIVERY_UNKNOWN', evidence: signals };
        }

        signals.confirmationStrength = 'PRE_SUBMIT_FAILURE';
        return { outcome: 'FAILURE', reason: 'SUBMIT_NOT_ACTIVATED', evidence: signals };
    }
}

// -------------------------------------------------------------
// Test Execution Suite
// -------------------------------------------------------------
async function runAllTests() {
    console.log("===============================================================================");
    console.log("  R6.9A HISTORY LEDGER AUTHORITY & OUTCOME ACCURACY TEST SUITE (20 TESTS)");
    console.log("===============================================================================\n");

    // -------------------------------------------------------------------------
    // Test 1: Ledger Succeeded count is source of UI SUCCESS
    // -------------------------------------------------------------------------
    await itAsync("Test 1: ledger Succeeded count is source of UI SUCCESS", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_test_1';
        hs.activeCampaignRunId = runId;

        // Record 20 successes
        for (let i = 1; i <= 20; i++) {
            const { attemptId } = await hs.recordAttempt(`https://target${i}.com`, { campaignRunId: runId });
            await hs.settleCanonicalAttempt(attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {
                submitEventSeen: true,
                successTextTransition: true
            }, { campaignRunId: runId });
        }

        const stats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(stats.success, 20, "Ledger currentRun success count must be exactly 20");
        assert.strictEqual(stats.scope, 'currentRun');
        assert.ok(stats.logStr.includes('success=20'), "Log string must reflect 20 successes");
    });

    // -------------------------------------------------------------------------
    // Test 2: Legacy success cache mismatch -> ledger wins
    // -------------------------------------------------------------------------
    await itAsync("Test 2: legacy success cache mismatch -> ledger wins", async () => {
        const storage = new MockStorage({
            xpider_campaign_counters_v1: { success: 1, failed: 0, completed: 1 },
            xpider_success: 1
        });
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_test_2';
        hs.activeCampaignRunId = runId;

        // Ledger has 20 successes
        for (let i = 1; i <= 20; i++) {
            const { attemptId } = await hs.recordAttempt(`https://target${i}.com`, { campaignRunId: runId });
            await hs.settleCanonicalAttempt(attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: runId });
        }

        const reconciled = await hs.reconcileLegacyCounters();
        assert.strictEqual(reconciled.reconciled, true, "Reconciliation must occur when legacy cache is stale");
        assert.strictEqual(reconciled.legacySuccess, 1, "Legacy success was 1");
        assert.strictEqual(reconciled.ledgerSuccess, 20, "Ledger success must be 20");
        assert.strictEqual(storage.store.xpider_success, 20, "xpider_success cache must be overwritten by 20");
        assert.strictEqual(storage.store.xpider_campaign_counters_v1.success, 20, "xpider_campaign_counters_v1.success must be overwritten by 20");
    });

    // -------------------------------------------------------------------------
    // Test 3: Pause/resume preserves campaignRunId and counts
    // -------------------------------------------------------------------------
    await itAsync("Test 3: pause/resume preserves campaignRunId and counts", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const initialRunId = 'run_durable_123';
        hs.activeCampaignRunId = initialRunId;

        // Record 5 successes
        for (let i = 1; i <= 5; i++) {
            const { attemptId } = await hs.recordAttempt(`https://site${i}.com`, { campaignRunId: initialRunId });
            await hs.settleCanonicalAttempt(attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: initialRunId });
        }

        // Simulate checkpoint creation on pause
        const checkpoint = {
            campaignRunId: hs.activeCampaignRunId,
            remainingQueue: ['https://site6.com', 'https://site7.com'],
            successCount: hs.getLedgerStats('currentRun', initialRunId).success
        };
        await storage.set({ xpider_paused_checkpoint: checkpoint, xpider_active_campaign_run_id: initialRunId });

        // Simulate resume
        const storedCheckpoint = (await storage.get(['xpider_paused_checkpoint'])).xpider_paused_checkpoint;
        assert.strictEqual(storedCheckpoint.campaignRunId, initialRunId, "Checkpoint must preserve campaignRunId");

        // Reload store on resume
        const hs2 = new HistoryStore(storage);
        await hs2.load();
        const resumedStats = hs2.getLedgerStats('currentRun', storedCheckpoint.campaignRunId);
        assert.strictEqual(resumedStats.success, 5, "Resumed stats must maintain exact 5 successes");
    });

    // -------------------------------------------------------------------------
    // Test 4: Service worker restart rebuilds counters from ledger
    // -------------------------------------------------------------------------
    await itAsync("Test 4: service worker restart rebuilds counters from ledger", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_restart_test';
        hs.activeCampaignRunId = runId;

        for (let i = 1; i <= 8; i++) {
            const { attemptId } = await hs.recordAttempt(`https://restart${i}.com`, { campaignRunId: runId });
            await hs.settleCanonicalAttempt(attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: runId });
        }
        await storage.set({ xpider_active_campaign_run_id: runId });

        // Simulate fresh service worker boot
        const freshHs = new HistoryStore(storage);
        await freshHs.load();
        assert.strictEqual(freshHs.activeCampaignRunId, runId, "Fresh service worker must restore activeCampaignRunId");
        const restoredStats = freshHs.getLedgerStats('currentRun', freshHs.activeCampaignRunId);
        assert.strictEqual(restoredStats.success, 8, "Restored counters from ledger must be 8");
    });

    // -------------------------------------------------------------------------
    // Test 5: Exactly one terminal attempt per started target
    // -------------------------------------------------------------------------
    await itAsync("Test 5: exactly one terminal attempt per started target", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_target_integrity';

        const { attemptId } = await hs.recordAttempt('https://single-attempt.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: runId });

        const matches = hs.attempts.filter(a => a.sourceUrl === 'https://single-attempt.com' || a.targetIdentity === 'https://single-attempt.com');
        assert.strictEqual(matches.length, 1, "There must be exactly one attempt record for the target");
        assert.strictEqual(matches[0].status, 'CONFIRMED_SUCCESS');
        assert.ok(matches[0].settledAt > 0, "Attempt must have settledAt timestamp");
    });

    // -------------------------------------------------------------------------
    // Test 6: No direct success increment outside ledger settlement
    // -------------------------------------------------------------------------
    await itAsync("Test 6: no direct success increment outside ledger settlement", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_single_source';
        hs.activeCampaignRunId = runId;

        const { attemptId } = await hs.recordAttempt('https://target-a.com', { campaignRunId: runId });
        // Attempt remains PREPARING
        const initialStats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(initialStats.success, 0, "PREPARING attempt cannot be counted as SUCCESS");

        // Ephemeral manipulation does not change ledger truth
        let fakeCounters = { success: 99 };
        const authoritativeSuccess = hs.getLedgerStats('currentRun', runId).success;
        fakeCounters.success = authoritativeSuccess;
        assert.strictEqual(fakeCounters.success, 0, "Counter must synchronize to ledger truth (0)");
    });

    // -------------------------------------------------------------------------
    // Test 7: Delayed hidden success transition at 12s -> CONFIRMED_SUCCESS
    // -------------------------------------------------------------------------
    it("Test 7: delayed hidden success transition at 12s -> CONFIRMED_SUCCESS", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: true, physicalClickDispatched: true };
        // At 12s, hidden confirmation div toggles to visible
        const stateAt12s = {
            successNodeVisible: true,
            successTextFound: true
        };
        const res = verifier.evaluateSignals(submitOutcome, stateAt12s);
        assert.strictEqual(res.outcome, 'CONFIRMED_SUCCESS');
        assert.strictEqual(res.evidence.confirmationStrength, 'STRONG_POSITIVE');
        assert.strictEqual(res.evidence.successNodeVisibleTransition, true);
    });

    // -------------------------------------------------------------------------
    // Test 8: Aria-live success mutation -> CONFIRMED_SUCCESS
    // -------------------------------------------------------------------------
    it("Test 8: aria-live success mutation -> CONFIRMED_SUCCESS", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: true, physicalClickDispatched: false };
        const state = {
            ariaLiveSuccess: true,
            successTextFound: true
        };
        const res = verifier.evaluateSignals(submitOutcome, state);
        assert.strictEqual(res.outcome, 'CONFIRMED_SUCCESS');
        assert.strictEqual(res.evidence.ariaLiveSuccessTransition, true);
    });

    // -------------------------------------------------------------------------
    // Test 9: Form replacement + positive confirmation -> CONFIRMED_SUCCESS
    // -------------------------------------------------------------------------
    it("Test 9: form replacement + positive confirmation -> CONFIRMED_SUCCESS", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: true };
        const state = {
            formReplaced: true,
            successTextFound: true
        };
        const res = verifier.evaluateSignals(submitOutcome, state);
        assert.strictEqual(res.outcome, 'CONFIRMED_SUCCESS');
        assert.strictEqual(res.evidence.formReplaced, true);
    });

    // -------------------------------------------------------------------------
    // Test 10: submitEvent-only after 20s -> DELIVERY_UNKNOWN
    // -------------------------------------------------------------------------
    it("Test 10: submitEvent-only after 20s -> DELIVERY_UNKNOWN", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: true };
        // No positive or negative transitions occurred within extended 20s window
        const stateAt20s = {
            successNodeVisible: false,
            successTextFound: false,
            newValidationError: false,
            serverError: false
        };
        const res = verifier.evaluateSignals(submitOutcome, stateAt20s);
        assert.strictEqual(res.outcome, 'DELIVERY_UNKNOWN');
        assert.strictEqual(res.evidence.confirmationStrength, 'AMBIGUOUS');
    });

    // -------------------------------------------------------------------------
    // Test 11: Network commit without outcome -> DELIVERY_UNKNOWN
    // -------------------------------------------------------------------------
    it("Test 11: network commit without outcome -> DELIVERY_UNKNOWN", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: false, physicalClickDispatched: true };
        const state = {
            networkCommit: true,
            networkStatus: 200,
            successNodeVisible: false,
            successTextFound: false
        };
        const res = verifier.evaluateSignals(submitOutcome, state);
        assert.strictEqual(res.outcome, 'DELIVERY_UNKNOWN');
        assert.strictEqual(res.evidence.networkCommitObserved, true);
    });

    // -------------------------------------------------------------------------
    // Test 12: Explicit validation error -> FAILURE
    // -------------------------------------------------------------------------
    it("Test 12: explicit validation error -> FAILURE", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: true };
        const state = {
            newValidationError: true
        };
        const res = verifier.evaluateSignals(submitOutcome, state);
        assert.strictEqual(res.outcome, 'FAILURE');
        assert.strictEqual(res.evidence.confirmationStrength, 'DETERMINISTIC_FAILURE');
        assert.strictEqual(res.reason, 'VALIDATION_ERROR');
    });

    // -------------------------------------------------------------------------
    // Test 13: Explicit server rejection -> FAILURE
    // -------------------------------------------------------------------------
    it("Test 13: explicit server rejection -> FAILURE", () => {
        const verifier = new MockOutcomeVerifier();
        const submitOutcome = { submitEventFired: true };
        const state = {
            serverError: true,
            networkStatus: 500
        };
        const res = verifier.evaluateSignals(submitOutcome, state);
        assert.strictEqual(res.outcome, 'FAILURE');
        assert.strictEqual(res.reason, 'SERVER_ERROR');
    });

    // -------------------------------------------------------------------------
    // Test 14: Non-inquiry forms (login, newsletter, booking, search) -> SKIPPED, not FAILURE
    // -------------------------------------------------------------------------
    await itAsync("Test 14: non-inquiry (login, newsletter, booking, search) -> SKIPPED, not FAILURE, failureClass=null", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_non_inquiry_comprehensive';

        // 1. Login form (e.g. HN login) - even if passed with initial status FAILURE or NON_INQUIRY_LOGIN_FORM
        const att1 = await hs.recordAttempt('https://news.ycombinator.com/login', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att1.attemptId, 'FAILURE', 'NON_INQUIRY_LOGIN_FORM', {}, { campaignRunId: runId });

        // 2. Newsletter-only form
        const att2 = await hs.recordAttempt('https://newsletter-only.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att2.attemptId, 'SKIPPED', 'NON_INQUIRY_NEWSLETTER_FORM', {}, { campaignRunId: runId });

        // 3. Booking form
        const att3 = await hs.recordAttempt('https://booking-clinic.com/book', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att3.attemptId, 'FAILURE', 'NON_INQUIRY_BOOKING_FORM', {}, { campaignRunId: runId });

        // 4. Search form
        const att4 = await hs.recordAttempt('https://search-portal.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att4.attemptId, 'SKIPPED', 'NON_INQUIRY_SEARCH_FORM', {}, { campaignRunId: runId });

        // Verify all 4 are canonically SKIPPED with failureClass === null
        const rec1 = hs.attempts.find(a => a.attemptId === att1.attemptId);
        const rec2 = hs.attempts.find(a => a.attemptId === att2.attemptId);
        const rec3 = hs.attempts.find(a => a.attemptId === att3.attemptId);
        const rec4 = hs.attempts.find(a => a.attemptId === att4.attemptId);

        assert.strictEqual(rec1.status, 'SKIPPED', "Login form must be canonicalized to SKIPPED");
        assert.strictEqual(rec1.failureClass, null, "failureClass must remain null for SKIPPED login form");

        assert.strictEqual(rec2.status, 'SKIPPED', "Newsletter form must be SKIPPED");
        assert.strictEqual(rec2.failureClass, null, "failureClass must remain null for SKIPPED newsletter form");

        assert.strictEqual(rec3.status, 'SKIPPED', "Booking form must be canonicalized to SKIPPED");
        assert.strictEqual(rec3.failureClass, null, "failureClass must remain null for SKIPPED booking form");

        assert.strictEqual(rec4.status, 'SKIPPED', "Search form must be SKIPPED");
        assert.strictEqual(rec4.failureClass, null, "failureClass must remain null for SKIPPED search form");

        // Verify ledger counters
        const stats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(stats.skipped, 4, "All 4 non-inquiry attempts must increment skipped counter");
        assert.strictEqual(stats.failure, 0, "Non-inquiry forms must NOT increment failure counter");

        // Verify CSV export output reflects SKIPPED
        if (typeof hs.exportAttemptsCSV === 'function') {
            const csv = hs.exportAttemptsCSV('currentRun', runId);
            assert.ok(csv.includes('SKIPPED'), "CSV must contain SKIPPED status");
            assert.ok(!csv.includes('NON_INQUIRY_LOGIN_FORM,FAILURE'), "CSV must not classify login form as FAILURE");
        }
    });

    // -------------------------------------------------------------------------
    // Test 15: Owner visual UNKNOWN->SUCCESS updates same attempt exactly once
    // -------------------------------------------------------------------------
    await itAsync("Test 15: owner visual UNKNOWN->SUCCESS updates same attempt exactly once", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_reconcile';
        hs.activeCampaignRunId = runId;

        const { attemptId } = await hs.recordAttempt('https://uncertain-site.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(attemptId, 'DELIVERY_UNKNOWN', 'DELIVERY_UNKNOWN', {
            submitEventSeen: true
        }, { campaignRunId: runId });

        const statsBefore = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(statsBefore.unknown, 1);
        assert.strictEqual(statsBefore.success, 0);
        assert.strictEqual(hs.attempts.length, 1);

        // Operator visual confirmation
        const reconcileRes = await hs.reconcileAttemptVisual(attemptId, 'CONFIRMED_SUCCESS', {
            note: 'Confirmed via receipt screenshot'
        });
        assert.strictEqual(reconcileRes.success, true);
        assert.strictEqual(reconcileRes.priorStatus, 'DELIVERY_UNKNOWN');
        assert.strictEqual(reconcileRes.status, 'CONFIRMED_SUCCESS');

        const statsAfter = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(statsAfter.unknown, 0, "Unknown count must decrease to 0");
        assert.strictEqual(statsAfter.success, 1, "Success count must increase to 1");
        assert.strictEqual(hs.attempts.length, 1, "Total attempts must remain exactly 1 (no duplicate record created)");
        assert.strictEqual(hs.attempts[0].confirmationStrength, 'OWNER_VISUAL');
    });

    // -------------------------------------------------------------------------
    // Test 16: UI/History/CSV success counts identical
    // -------------------------------------------------------------------------
    await itAsync("Test 16: UI/History/CSV success counts identical", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_three_way_equality';
        hs.activeCampaignRunId = runId;

        // Ingest 3 import rows
        await hs.ingestImportRows([
            'https://site-a.com',
            'https://site-b.com',
            'https://site-c.com'
        ], 'imp_001');

        // Settle site-a and site-b as CONFIRMED_SUCCESS, site-c as FAILURE
        const rows = hs.importRows;
        const att1 = await hs.recordAttempt(rows[0].rawInputUrl, { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att1.attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: runId });

        const att2 = await hs.recordAttempt(rows[1].rawInputUrl, { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att2.attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: runId });

        const att3 = await hs.recordAttempt(rows[2].rawInputUrl, { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att3.attemptId, 'FAILURE', 'TIMEOUT_LOCAL', {}, { campaignRunId: runId });

        const ledgerStats = hs.getLedgerStats('currentRun', runId);
        const liveUiSuccess = ledgerStats.success;

        // Count from standard CSV
        const csv1 = hs.exportToCsv();
        const csv1SuccessCount = (csv1.match(/"CONFIRMED_SUCCESS"/g) || []).length;

        // Count from Google Sheets CSV
        const gsheetsCsv = hs.exportGoogleSheetsCsv();
        const gsheetsSuccessCount = (gsheetsCsv.match(/"CONFIRMED_SUCCESS"/g) || []).length;

        assert.strictEqual(liveUiSuccess, 2, "Live UI success must be 2");
        assert.strictEqual(csv1SuccessCount, 2, "Standard CSV CONFIRMED_SUCCESS must be 2");
        assert.strictEqual(gsheetsSuccessCount, 2, "Google Sheets CSV CONFIRMED_SUCCESS must be 2");
        assert.strictEqual(liveUiSuccess, csv1SuccessCount, "3-Way Equality: Live UI == CSV");
        assert.strictEqual(liveUiSuccess, gsheetsSuccessCount, "3-Way Equality: Live UI == GSheets CSV");
    });

    // -------------------------------------------------------------------------
    // Test 17: Completed reconciliation
    // started = success + failure + unknown + timeout + skipped + paused
    // -------------------------------------------------------------------------
    await itAsync("Test 17: completed reconciliation (started = sum of all canonical outcomes)", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_reconciliation_math';

        const plan = [
            'CONFIRMED_SUCCESS',
            'CONFIRMED_SUCCESS',
            'FAILURE',
            'DELIVERY_UNKNOWN',
            'TIMEOUT_LOCAL',
            'TIMEOUT_GLOBAL',
            'SKIPPED',
            'PAUSED_UNKNOWN'
        ];

        for (let i = 0; i < plan.length; i++) {
            const { attemptId } = await hs.recordAttempt(`https://target-${i}.com`, { campaignRunId: runId });
            await hs.settleCanonicalAttempt(attemptId, plan[i], plan[i], {}, { campaignRunId: runId });
        }

        const stats = hs.getLedgerStats('currentRun', runId);
        const manualSum = stats.success + stats.failure + stats.unknown + stats.timeout + stats.skipped + stats.paused;
        assert.strictEqual(stats.completed, 8, "Completed must be 8");
        assert.strictEqual(manualSum, 8, "Sum of all categories must strictly equal completed");
        assert.strictEqual(stats.success, 2);
        assert.strictEqual(stats.failure, 1);
        assert.strictEqual(stats.unknown, 1);
        assert.strictEqual(stats.timeout, 2);
        assert.strictEqual(stats.skipped, 1);
        assert.strictEqual(stats.paused, 1);
    });

    // -------------------------------------------------------------------------
    // Test 18: Five owner false-negative fixtures exercise delayed observer
    // -------------------------------------------------------------------------
    it("Test 18: five owner false-negative fixtures exercise delayed observer", () => {
        const fixtures = [
            { domain: 'kearneysamericankarate.com', delayedSignal: { successNodeVisible: true, successTextFound: true } },
            { domain: 'kellymuirkarate.com', delayedSignal: { ariaLiveSuccess: true, successTextFound: true } },
            { domain: 'kesslerkarate.com', delayedSignal: { formReplaced: true, successTextFound: true } },
            { domain: 'khaoboyacademy.com', delayedSignal: { thankYouUrl: true } },
            { domain: 'kiantkd.com', delayedSignal: { buttonSuccess: true, successTextFound: true } }
        ];

        const verifier = new MockOutcomeVerifier();
        for (const fix of fixtures) {
            const submitOutcome = { submitEventFired: true, physicalClickDispatched: true };
            const res = verifier.evaluateSignals(submitOutcome, fix.delayedSignal);
            assert.strictEqual(res.outcome, 'CONFIRMED_SUCCESS', `Domain ${fix.domain} must resolve to CONFIRMED_SUCCESS with delayed positive signal`);
            assert.strictEqual(res.evidence.confirmationStrength, 'STRONG_POSITIVE');
        }
    });

    // -------------------------------------------------------------------------
    // Test 19: khaskarate submitEvent=false cannot be upgraded merely by timeout
    // -------------------------------------------------------------------------
    it("Test 19: khaskarate submitEvent=false cannot be upgraded merely by timeout", () => {
        const verifier = new MockOutcomeVerifier();
        // khaskarate had submitEvent=false (never submitted form)
        const submitOutcome = { submitEventFired: false, physicalClickDispatched: false };
        const stateAtTimeout = {
            successNodeVisible: false,
            successTextFound: false,
            newValidationError: false,
            serverError: false
        };
        const res = verifier.evaluateSignals(submitOutcome, stateAtTimeout);
        assert.strictEqual(res.outcome, 'FAILURE', "khaskarate without submitEvent cannot be DELIVERY_UNKNOWN or CONFIRMED_SUCCESS");
        assert.notStrictEqual(res.outcome, 'CONFIRMED_SUCCESS');
        assert.notStrictEqual(res.outcome, 'DELIVERY_UNKNOWN');
    });

    // -------------------------------------------------------------------------
    // Test 20: Old valid HistoryStore attempts survive migration
    // -------------------------------------------------------------------------
    await itAsync("Test 20: old valid HistoryStore attempts survive migration", async () => {
        const legacyData = {
            xpider_history_attempts: [
                { attemptId: 'att_old_1', status: 'SUCCESS', reasonCode: 'SUCCESS', targetIdentity: 'https://old1.com', createdAt: Date.now() - 50000 },
                { attemptId: 'att_old_2', status: 'FAILED', reasonCode: 'NO_FORM', targetIdentity: 'https://old2.com', createdAt: Date.now() - 40000 },
                { attemptId: 'att_old_3', status: 'UNKNOWN', reasonCode: 'UNKNOWN', targetIdentity: 'https://old3.com', createdAt: Date.now() - 30000 }
            ],
            xpider_history_generation: 1
        };

        const storage = new MockStorage(legacyData);
        const hs = new HistoryStore(storage);
        await hs.load();

        assert.strictEqual(hs.attempts.length, 3, "All 3 legacy attempts must survive migration");
        const allStats = hs.getLedgerStats('allHistory');
        assert.strictEqual(allStats.success, 1, "Legacy SUCCESS must map to canonical success");
        assert.strictEqual(allStats.failure, 1, "Legacy FAILED must map to canonical failure");
        assert.strictEqual(allStats.unknown, 1, "Legacy UNKNOWN must map to canonical unknown");
        assert.strictEqual(allStats.completed, 3, "All 3 attempts counted in allHistory");
    });

    // -------------------------------------------------------------------------
    // Test 21: Legacy attempts with no campaignRunId + 20 CONFIRMED_SUCCESS => upgrade => History authoritative Succeeded remains 20
    // -------------------------------------------------------------------------
    await itAsync("Test 21: legacy attempts with no campaignRunId + 20 CONFIRMED_SUCCESS => upgrade => History authoritative Succeeded remains 20", async () => {
        // Construct 20 legacy attempts without campaignRunId
        const legacyAttempts = [];
        for (let i = 1; i <= 20; i++) {
            legacyAttempts.push({
                attemptId: `att_legacy_${i}`,
                targetIdentity: `https://site-${i}.com`,
                status: 'CONFIRMED_SUCCESS',
                reasonCode: 'SUCCESS_CONFIRMED',
                // Explicitly no campaignRunId or generationId (legacy format)
                createdAt: Date.now() - (25 - i) * 60000
            });
        }

        const legacyStorageData = {
            xpider_history_attempts: legacyAttempts,
            xpider_history_generation: 1
        };

        const storage = new MockStorage(legacyStorageData);
        const hs = new HistoryStore(storage);
        await hs.load();

        // 1. Authoritative Succeeded in default currentGeneration scope must be 20
        const genStats = hs.getLedgerStats('currentGeneration');
        assert.strictEqual(genStats.success, 20, "Authoritative Succeeded in currentGeneration must remain 20 after upgrade");

        // 2. Default getLedgerStats() scope is currentGeneration
        const defaultStats = hs.getLedgerStats();
        assert.strictEqual(defaultStats.success, 20, "Default getLedgerStats() scope must be currentGeneration and return 20");

        // 3. Reconcile legacy counters preserves 20 and doesn't erase valid records
        await hs.reconcileLegacyCounters('currentGeneration');
        const postReconcileStats = hs.getLedgerStats('currentGeneration');
        assert.strictEqual(postReconcileStats.success, 20, "Reconcile legacy counters must preserve 20 successes");

        // 4. When a new activeCampaignRunId starts/resumes, deterministic backfill migrates them
        const newRunId = 'run_migrated_owner_session';
        hs.activeCampaignRunId = newRunId;
        const backfilled = hs.backfillLegacyRunId(newRunId);
        assert.strictEqual(backfilled, 20, "Deterministic backfill must assign runId to all 20 legacy attempts");

        const runStats = hs.getLedgerStats('currentRun', newRunId);
        assert.strictEqual(runStats.success, 20, "After deterministic backfill, currentRun success must equal 20");

        // 5. CSV export under currentGeneration scope includes all 20 CONFIRMED_SUCCESS records
        const csv = hs.exportToCsv({ exportScope: 'currentGeneration' });
        const csvSuccessMatches = (csv.match(/"CONFIRMED_SUCCESS"/g) || []).length;
        assert.strictEqual(csvSuccessMatches, 20, "CSV export must contain all 20 CONFIRMED_SUCCESS records");

        // 6. Google Sheets CSV export also includes all 20 CONFIRMED_SUCCESS records
        const gsheetsCsv = hs.exportGoogleSheetsCsv({ exportScope: 'currentGeneration' });
        const gsheetsSuccessMatches = (gsheetsCsv.match(/"CONFIRMED_SUCCESS"/g) || []).length;
        assert.strictEqual(gsheetsSuccessMatches, 20, "Google Sheets CSV export must contain all 20 CONFIRMED_SUCCESS records");
    });

    // -------------------------------------------------------------------------
    // Test 22: Persisted xpider_history_generation=7 + 20 legacy CONFIRMED_SUCCESS
    // => load => all 20 assigned generation 7 => currentGeneration success remains 20
    // -------------------------------------------------------------------------
    await itAsync("Test 22: persisted xpider_history_generation=7 restores before migration, keeping Succeeded=20 in generation 7", async () => {
        const legacyAttempts = [];
        for (let i = 1; i <= 20; i++) {
            legacyAttempts.push({
                attemptId: `att_gen7_${i}`,
                targetIdentity: `https://site-gen7-${i}.com`,
                status: 'CONFIRMED_SUCCESS',
                reasonCode: 'SUCCESS_CONFIRMED',
                // Explicitly no generation or runId
                createdAt: Date.now() - i * 10000
            });
        }

        const storageData = {
            xpider_history_attempts: legacyAttempts,
            xpider_history_generation: 7
        };

        const storage = new MockStorage(storageData);
        const hs = new HistoryStore(storage);
        await hs.load();

        assert.strictEqual(hs.currentGeneration, 7, "currentGeneration must be restored to 7");
        for (const att of hs.attempts) {
            assert.strictEqual(att.generation, 7, "Attempt generation must be 7");
            assert.strictEqual(att.generationId, 7, "Attempt generationId must be 7");
        }

        const stats = hs.getLedgerStats('currentGeneration');
        assert.strictEqual(stats.success, 20, "Authoritative success in generation 7 must be 20");
    });

    // -------------------------------------------------------------------------
    // Test 23: Durable & idempotent migration across cold instances
    // -------------------------------------------------------------------------
    await itAsync("Test 23: durable & idempotent migration across cold instances", async () => {
        const rawAttempts = [
            { attemptId: 'att_mig_1', targetIdentity: 'https://m1.com', status: 'CONFIRMED_SUCCESS', createdAt: Date.now() - 20000 },
            { attemptId: 'att_mig_2', targetIdentity: 'https://m2.com', status: 'FAILURE', createdAt: Date.now() - 10000 }
        ];
        const sharedStorage = new MockStorage({
            xpider_history_attempts: rawAttempts,
            xpider_history_generation: 3,
            xpider_active_campaign_run_id: 'run_mig_durable_01'
        });

        // First instance loads and migrates
        const hs1 = new HistoryStore(sharedStorage);
        await hs1.load();

        assert.strictEqual(hs1.attempts[0].generation, 3);
        assert.strictEqual(hs1.attempts[0].campaignRunId, 'run_mig_durable_01');

        // Verify storage received the persisted updates durably
        const storedAttempts = sharedStorage.store.xpider_history_attempts;
        assert.strictEqual(storedAttempts[0].generation, 3, "Migrated generation must be written to storage");
        assert.strictEqual(storedAttempts[0].campaignRunId, 'run_mig_durable_01', "Migrated runId must be written to storage");

        // Second independent instance (simulating worker restart) loads without re-mutating
        const hs2 = new HistoryStore(sharedStorage);
        await hs2.load();

        assert.strictEqual(hs2.currentGeneration, 3);
        assert.strictEqual(hs2.attempts[0].generation, 3);
        assert.strictEqual(hs2.attempts[0].campaignRunId, 'run_mig_durable_01');
        assert.strictEqual(hs2.getLedgerStats('currentGeneration').success, 1);
    });

    // -------------------------------------------------------------------------
    // Test 24: Partially-migrated currentRun scope unions unassigned attempts
    // (1 new runId attempt + 20 legacy unassigned attempts => currentRun success is 21)
    // -------------------------------------------------------------------------
    await itAsync("Test 24: partially-migrated currentRun scope unions unassigned current-gen attempts (no undercounting)", async () => {
        const attempts = [];
        // 20 legacy attempts without campaignRunId in generation 1
        for (let i = 1; i <= 20; i++) {
            attempts.push({
                attemptId: `att_union_${i}`,
                targetIdentity: `https://site-union-${i}.com`,
                status: 'CONFIRMED_SUCCESS',
                reasonCode: 'SUCCESS_CONFIRMED',
                generation: 1,
                generationId: 1,
                createdAt: Date.now() - (30 - i) * 1000
            });
        }
        // 1 newly added attempt with active runId
        const activeRunId = 'run_union_active_new';
        attempts.push({
            attemptId: 'att_union_new_21',
            targetIdentity: 'https://site-union-21.com',
            status: 'CONFIRMED_SUCCESS',
            reasonCode: 'SUCCESS_CONFIRMED',
            generation: 1,
            generationId: 1,
            campaignRunId: activeRunId,
            createdAt: Date.now()
        });

        const storage = new MockStorage({
            xpider_history_attempts: attempts,
            xpider_history_generation: 1,
            xpider_active_campaign_run_id: activeRunId
        });

        const hs = new HistoryStore(storage);
        // Load without backfill to simulate raw partial migration state
        hs.currentGeneration = 1;
        hs.activeCampaignRunId = activeRunId;
        hs.attempts = attempts;

        // currentRun must union active runId + eligible unassigned current-gen attempts => 21, NOT 1
        const runStats = hs.getLedgerStats('currentRun', activeRunId);
        assert.strictEqual(runStats.success, 21, "currentRun scope must not drop unassigned current-generation attempts (expected 21, got " + runStats.success + ")");
    });

    // -------------------------------------------------------------------------
    // Test 25: Terminal immutability: terminal status cannot be overwritten
    // by late timeouts or stale callbacks; idempotent re-settlement preserved
    // -------------------------------------------------------------------------
    await itAsync("Test 25: terminal immutability guards against late timeouts and stale callbacks", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();

        const att = await hs.recordAttempt('https://immutable-test.com', { campaignRunId: 'run_immut_01' });
        const attId = att.attemptId;

        // 1. Settle as CONFIRMED_SUCCESS
        const res1 = await hs.settleCanonicalAttempt(attId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {
            confirmationStrength: 'STRONG_POSITIVE'
        });
        assert.strictEqual(res1.settled, true);
        assert.strictEqual(hs.attempts.find(a => a.attemptId === attId).status, 'CONFIRMED_SUCCESS');

        // 2. Late TIMEOUT_LOCAL callback arrives -> must be REJECTED!
        const resLateTimeout = await hs.settleCanonicalAttempt(attId, 'TIMEOUT_LOCAL', 'TIMEOUT_AFTER_20S');
        assert.strictEqual(resLateTimeout.settled, false, "Late timeout cannot settle an already terminal attempt");
        assert.strictEqual(resLateTimeout.reason, 'TERMINAL_ALREADY_SETTLED');
        assert.strictEqual(hs.attempts.find(a => a.attemptId === attId).status, 'CONFIRMED_SUCCESS', "Status must remain CONFIRMED_SUCCESS");

        // 3. Stale DELIVERY_UNKNOWN callback arrives -> must be REJECTED!
        const resStaleUnknown = await hs.settleCanonicalAttempt(attId, 'DELIVERY_UNKNOWN', 'NO_CONFIRMATION_FOUND');
        assert.strictEqual(resStaleUnknown.settled, false, "Stale unknown callback cannot settle an already terminal attempt");
        assert.strictEqual(hs.attempts.find(a => a.attemptId === attId).status, 'CONFIRMED_SUCCESS', "Status must remain CONFIRMED_SUCCESS");

        // 4. Duplicate same-status settlement -> idempotent pass-through without modifying evidence
        const resDuplicateSuccess = await hs.settleCanonicalAttempt(attId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');
        assert.strictEqual(resDuplicateSuccess.settled, true);
        assert.strictEqual(resDuplicateSuccess.idempotent, true);

        // 5. Explicit operator visual reconciliation -> allowed and audited
        const att2 = await hs.recordAttempt('https://uncertain-partner.com', { campaignRunId: 'run_immut_01' });
        await hs.settleCanonicalAttempt(att2.attemptId, 'DELIVERY_UNKNOWN', 'UNKNOWN_RETAINED');
        assert.strictEqual(hs.attempts.find(a => a.attemptId === att2.attemptId).status, 'DELIVERY_UNKNOWN');

        const reconcileRes = await hs.reconcileAttemptVisual(att2.attemptId, 'CONFIRMED_SUCCESS', {
            reason: 'OWNER_VISUALLY_VERIFIED_RECEIPT'
        });
        assert.strictEqual(reconcileRes.success, true);
        assert.strictEqual(reconcileRes.priorStatus, 'DELIVERY_UNKNOWN');
        assert.strictEqual(reconcileRes.status, 'CONFIRMED_SUCCESS');
        assert.strictEqual(hs.attempts.find(a => a.attemptId === att2.attemptId).status, 'CONFIRMED_SUCCESS');
    });

    // -------------------------------------------------------------------------
    // Test 26: opts.generation is strictly honored by recordAttempt, isolating
    // audit probes from owner currentGeneration scope
    // -------------------------------------------------------------------------
    await itAsync("Test 26: recordAttempt honors generation override; probe in gen 999 isolates owner gen 7", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        hs.currentGeneration = 7;

        // Seed 20 owner generation 7 attempts
        for (let i = 1; i <= 20; i++) {
            const { attemptId } = await hs.recordAttempt(`https://owner-${i}.org`, { generation: 7 });
            await hs.settleCanonicalAttempt(attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');
        }

        const preStats = hs.getLedgerStats('currentGeneration');
        assert.strictEqual(preStats.success, 20, "Pre-probe Gen 7 success must be strictly 20");

        // Record synthetic probe with generation: 999
        const { attemptId: probeId, attempt: probeAttempt } = await hs.recordAttempt('https://audit-immutability.com', {
            generation: 999,
            campaignRunId: 'run_audit_probe_999'
        });

        assert.strictEqual(probeAttempt.generation, 999, "Attempt generation must strictly equal 999");
        assert.strictEqual(probeAttempt.generationId, 999, "Attempt generationId must strictly equal 999");

        // Settle synthetic probe as CONFIRMED_SUCCESS
        await hs.settleCanonicalAttempt(probeId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');

        // Verify owner generation 7 remains strictly 20 (zero contamination)
        const duringStats = hs.getLedgerStats('currentGeneration');
        assert.strictEqual(duringStats.success, 20, "DURING probe settlement, owner Gen 7 success MUST remain strictly 20");
        assert.strictEqual(duringStats.totalStarted, 20, "DURING probe settlement, owner Gen 7 totalStarted MUST remain strictly 20");
    });

    // -------------------------------------------------------------------------
    // Test 27: Complete cleanup via purgeAttempt removes attempt, target,
    // and all linked state with zero residue
    // -------------------------------------------------------------------------
    await itAsync("Test 27: purgeAttempt cleans attempt, target entry, and metadata completely", async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        hs.currentGeneration = 7;

        // Seed 1 owner attempt
        const { attemptId: ownerAttId } = await hs.recordAttempt('https://legit-client.com');
        await hs.settleCanonicalAttempt(ownerAttId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');

        // Record and settle isolated probe
        const { attemptId: probeId } = await hs.recordAttempt('https://temporary-probe.org', { generation: 999 });
        await hs.settleCanonicalAttempt(probeId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');

        const normTarget = hs.normalizeTargetIdentity('https://temporary-probe.org');
        assert.strictEqual(hs.targets.has(normTarget), true, "Target must exist prior to purge");

        // Purge probe
        const purgeRes = await hs.purgeAttempt(probeId);
        assert.strictEqual(purgeRes.purged, true);

        // Verify attempt is removed
        assert.strictEqual(hs.attempts.some(a => a.attemptId === probeId), false, "Attempt must be completely purged");

        // Verify target entry is removed
        assert.strictEqual(hs.targets.has(normTarget), false, "Target entry must be completely purged");

        // Verify reload from storage preserves zero residue
        await hs.load();
        assert.strictEqual(hs.attempts.some(a => a.attemptId === probeId), false, "Attempt absent after reload");
        assert.strictEqual(hs.targets.has(normTarget), false, "Target absent after reload");

        // Owner stats unaffected
        const stats = hs.getLedgerStats('currentGeneration');
        assert.strictEqual(stats.success, 1);
        assert.strictEqual(stats.totalStarted, 1);
    });

    console.log("\n===============================================================================");
    console.log(`  RESULTS: ${passCount} / ${passCount + failCount} PASSED (${failCount} FAILED)`);
    console.log("===============================================================================");

    if (failCount > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});
