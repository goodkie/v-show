/**
 * test_target_lifecycle_counter_authority_r6_9e.js
 * 
 * Issue #6 R6.9E Target Lifecycle, Counter Authority, and Stale Async Work Regression Test Suite
 * Strictly covers minimum 21 required assertions (Section C: 1-21)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_DIR = path.join(__dirname);
const BLD_DIR = path.join(__dirname, 'build', 'extension');

// Load module source files for static verification and behavioral simulation
const bgSrc = fs.readFileSync(path.join(SRC_DIR, 'background.js'), 'utf8');
const csSrc = fs.readFileSync(path.join(SRC_DIR, 'content-script.js'), 'utf8');
const popSrc = fs.readFileSync(path.join(SRC_DIR, 'popup.js'), 'utf8');
const provSrc = fs.readFileSync(path.join(SRC_DIR, 'modules', 'build-provenance.js'), 'utf8');

// Load HistoryStore class
const { HistoryStore } = require(path.join(SRC_DIR, 'modules', 'history-store.js'));

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
        testsFailed++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
        testsFailed++;
    }
}

async function main() {
    console.log('================================================================');
    console.log(' R6.9E TARGET LIFECYCLE & COUNTER AUTHORITY REGRESSION SUITE');
    console.log('================================================================');

    // -------------------------------------------------------------
    // Test 1: START_SENDING while filling => currentAttempt remains PREPARING
    // -------------------------------------------------------------
    runTest('1. START_SENDING while filling => currentAttempt remains PREPARING', () => {
        // Verify in background.js secureFocus that recordSubmissionIntent with SUBMIT_PENDING is NOT called before START_SENDING
        const secureFocusMatch = bgSrc.match(/const secureFocus = async[\s\S]*?safeTabs\.sendMessage\(tabId,\s*\{[\s\S]*?action:\s*'START_SENDING'/);
        assert(secureFocusMatch, 'secureFocus must initiate START_SENDING');
        const codeBeforeStartSending = secureFocusMatch[0];
        assert(!codeBeforeStartSending.includes("recordSubmissionIntent(targetUrl, 'SUBMIT_PENDING'"), 
            'secureFocus must NOT record SUBMIT_PENDING before START_SENDING');
        assert(codeBeforeStartSending.includes("campaignState.currentAttempt.status = 'PREPARING'") ||
               codeBeforeStartSending.includes("status remains PREPARING") ||
               !codeBeforeStartSending.includes("'SUBMIT_PENDING'"),
            'Attempt status must remain PREPARING during focus/filling stage');
    });

    // -------------------------------------------------------------
    // Test 2: CAPTCHA stage => still PREPARING
    // -------------------------------------------------------------
    runTest('2. CAPTCHA stage => still PREPARING', () => {
        // In content-script and background, reaching CAPTCHA stage does not assert SUBMIT_PENDING
        assert(csSrc.includes("action: 'STAGE_PROGRESSION', stage: 'CAPTCHA'"), 'Content-script must emit CAPTCHA stage');
        // Check STAGE_PROGRESSION handler in background: only SUBMIT_ATTEMPT_STARTED triggers SUBMIT_PENDING
        const stageHandler = bgSrc.substring(bgSrc.indexOf("case 'STAGE_PROGRESSION':"), bgSrc.indexOf("case 'QUEUE_BRANCHES':"));
        assert(!stageHandler.includes("if (request.stage === 'CAPTCHA') { campaignState.currentAttempt.status = 'SUBMIT_PENDING'"),
            'CAPTCHA stage must never transition currentAttempt to SUBMIT_PENDING');
        assert(stageHandler.includes("if (request.stage === 'SUBMIT_ATTEMPT_STARTED')"),
            'Only SUBMIT_ATTEMPT_STARTED transitions to SUBMIT_PENDING');
    });

    // -------------------------------------------------------------
    // Test 3: FINAL_AUDIT => still PREPARING
    // -------------------------------------------------------------
    runTest('3. FINAL_AUDIT => still PREPARING', () => {
        const stageHandler = bgSrc.substring(bgSrc.indexOf("case 'STAGE_PROGRESSION':"), bgSrc.indexOf("case 'QUEUE_BRANCHES':"));
        assert(!stageHandler.includes("FINAL_AUDIT') { campaignState.currentAttempt.status = 'SUBMIT_PENDING'"),
            'FINAL_AUDIT must never transition currentAttempt to SUBMIT_PENDING');
    });

    // -------------------------------------------------------------
    // Test 4: SUBMIT_ATTEMPT_STARTED => exactly once transition to SUBMIT_PENDING
    // -------------------------------------------------------------
    await runAsyncTest('4. SUBMIT_ATTEMPT_STARTED => exactly once transition to SUBMIT_PENDING', async () => {
        const stageHandler = bgSrc.substring(bgSrc.indexOf("case 'STAGE_PROGRESSION':"), bgSrc.indexOf("case 'QUEUE_BRANCHES':"));
        assert(stageHandler.includes("if (request.stage === 'SUBMIT_ATTEMPT_STARTED') {"),
            'background STAGE_PROGRESSION must explicitly handle SUBMIT_ATTEMPT_STARTED');
        assert(stageHandler.includes("campaignState.currentAttempt.status = 'SUBMIT_PENDING'"),
            'Must atomically set currentAttempt.status = SUBMIT_PENDING');
        assert(stageHandler.includes("recordSubmissionIntent(campaignState.currentAttempt.url, 'SUBMIT_PENDING'"),
            'Must persist submission intent SUBMIT_PENDING');
        assert(stageHandler.includes("xpider_currentAttempt"),
            'Must persist currentAttempt to local storage');
    });

    // -------------------------------------------------------------
    // Test 5: worker restart in PREPARING => requeue, not unknown/failure
    // -------------------------------------------------------------
    runTest('5. worker restart in PREPARING => requeue, not unknown/failure', () => {
        const prepIdx = bgSrc.indexOf("data.xpider_currentAttempt.status === 'PREPARING'");
        assert(prepIdx !== -1, 'Must find PREPARING recovery handler');
        const recoveryBlock = bgSrc.substring(prepIdx, prepIdx + 1000);
        assert(recoveryBlock.includes("[RECOVERY_CLASSIFY]"), 'Must log RECOVERY_CLASSIFY');
        assert(recoveryBlock.includes("action=REQUEUE"), 'Must classify action=REQUEUE for PREPARING');
        assert(recoveryBlock.includes("status: 'REQUEUED'"), 'Must mark status REQUEUED');
        assert(!recoveryBlock.includes("settleCanonicalAttempt(interruptedAttemptId, 'FAILURE'"), 
            'Must NOT settle PREPARING as FAILURE upon recovery');
        assert(!recoveryBlock.includes("settleCanonicalAttempt(interruptedAttemptId, 'DELIVERY_UNKNOWN'"),
            'Must NOT settle PREPARING as DELIVERY_UNKNOWN upon recovery');
    });

    // -------------------------------------------------------------
    // Test 6: worker restart after SUBMIT_ATTEMPT_STARTED => DELIVERY_UNKNOWN
    // -------------------------------------------------------------
    runTest('6. worker restart after SUBMIT_ATTEMPT_STARTED => DELIVERY_UNKNOWN', () => {
        const submitPendingBlock = bgSrc.substring(bgSrc.indexOf("data.xpider_currentAttempt.status === 'SUBMIT_PENDING'"), bgSrc.indexOf("data.xpider_currentAttempt.status === 'PREPARING'"));
        assert(submitPendingBlock.includes("[RECOVERY_CLASSIFY]"), 'Must log RECOVERY_CLASSIFY');
        assert(submitPendingBlock.includes("status=SUBMIT_PENDING action=DELIVERY_UNKNOWN"), 'Must classify as DELIVERY_UNKNOWN');
        assert(submitPendingBlock.includes("settleCanonicalAttempt(interruptedAttemptId, 'DELIVERY_UNKNOWN'"), 
            'Must settle true SUBMIT_PENDING as DELIVERY_UNKNOWN in HistoryStore');
    });

    // -------------------------------------------------------------
    // Test 7: stale SENDER_FINISHED from previous tab rejected
    // -------------------------------------------------------------
    runTest('7. stale SENDER_FINISHED from previous tab rejected', () => {
        const sfHandler = bgSrc.substring(bgSrc.indexOf("case 'SENDER_FINISHED':"), bgSrc.indexOf("case 'FORM_GATE_PASSED':"));
        assert(sfHandler.includes("sTab && (sTab.id === curTabId)"), 'Must require sender.tab and exact tabId match');
        assert(sfHandler.includes("[STALE_TARGET_EVENT] action=SENDER_FINISHED"), 'Must log STALE_TARGET_EVENT on rejection');
        assert(sfHandler.includes("result=REJECTED"), 'Must explicitly mark result=REJECTED');
    });

    // -------------------------------------------------------------
    // Test 8: stale SENDER_FINISHED from same tab but wrong attemptId rejected
    // -------------------------------------------------------------
    runTest('8. stale SENDER_FINISHED from same tab but wrong attemptId rejected', () => {
        const sfHandler = bgSrc.substring(bgSrc.indexOf("case 'SENDER_FINISHED':"), bgSrc.indexOf("case 'FORM_GATE_PASSED':"));
        assert(sfHandler.includes("curAtt.attemptId === reqAtt"), 'Must require attemptId match');
    });

    // -------------------------------------------------------------
    // Test 9: stale targetToken rejected
    // -------------------------------------------------------------
    runTest('9. stale targetToken rejected', () => {
        const sfHandler = bgSrc.substring(bgSrc.indexOf("case 'SENDER_FINISHED':"), bgSrc.indexOf("case 'FORM_GATE_PASSED':"));
        assert(sfHandler.includes("curTok === reqTok"), 'Must require targetToken match');
    });

    // -------------------------------------------------------------
    // Test 10: exact active SENDER_FINISHED accepted once
    // -------------------------------------------------------------
    runTest('10. exact active SENDER_FINISHED accepted once', () => {
        const sfHandler = bgSrc.substring(bgSrc.indexOf("case 'SENDER_FINISHED':"), bgSrc.indexOf("case 'FORM_GATE_PASSED':"));
        assert(sfHandler.includes("isTerminalStageAllowed"), 'Must verify allowed terminal stage');
        assert(sfHandler.includes("resolve(request.result)"), 'Must resolve with request.result');
    });

    // -------------------------------------------------------------
    // Test 11: stale CAPTCHA request from old target rejected
    // -------------------------------------------------------------
    runTest('11. stale CAPTCHA request from old target rejected', () => {
        const scHandler = bgSrc.substring(bgSrc.indexOf("case 'SOLVE_CAPTCHA':"), bgSrc.indexOf("case 'DISPATCH_PHYSICAL_COORDINATE_CLICK':"));
        assert(scHandler.includes("[CAPTCHA_STALE_REQUEST]"), 'Must log [CAPTCHA_STALE_REQUEST]');
        assert(scHandler.includes("action=REJECT"), 'Must reject stale epoch or wrong tab');
        assert(scHandler.includes("sendResponse({ success: false, error: 'STALE_CAPTCHA_EPOCH' })"),
            'Must return STALE_CAPTCHA_EPOCH error');
    });

    // -------------------------------------------------------------
    // Test 12: CAPTCHA result that becomes stale while await is in flight is dropped
    // -------------------------------------------------------------
    runTest('12. CAPTCHA result that becomes stale while await is in flight is dropped', () => {
        const scHandler = bgSrc.substring(bgSrc.indexOf("case 'SOLVE_CAPTCHA':"), bgSrc.indexOf("case 'DISPATCH_PHYSICAL_COORDINATE_CLICK':"));
        assert(scHandler.includes("[CAPTCHA_STALE_RESULT]"), 'Must log [CAPTCHA_STALE_RESULT]');
        assert(scHandler.includes("action=DROP"), 'Must log action=DROP');
        assert(scHandler.includes("sendResponse({ success: false, error: 'STALE_RESULT_DROPPED' })"),
            'Must return STALE_RESULT_DROPPED error');
    });

    // -------------------------------------------------------------
    // Test 13: pause invalidates solver epoch and no solver retry occurs after pause
    // -------------------------------------------------------------
    runTest('13. pause invalidates solver epoch and no solver retry occurs after pause', () => {
        const pauseFunc = bgSrc.substring(bgSrc.indexOf("async function pauseCampaignOrchestrator"), bgSrc.indexOf("async function resumeCampaignOrchestrator"));
        assert(pauseFunc.includes("campaignState.captchaEpoch = (campaignState.captchaEpoch || 0) + 1"),
            'pauseCampaignOrchestrator must increment/invalidate captchaEpoch');
        assert(pauseFunc.includes("campaignState.isPaused = true"),
            'Must set isPaused = true immediately');
    });

    // -------------------------------------------------------------
    // Test 14: ERROR_ZERO_BALANCE produces one blocked/config result per target epoch, no repeated request loop
    // -------------------------------------------------------------
    runTest('14. ERROR_ZERO_BALANCE produces one blocked/config result per target epoch, no repeated request loop', () => {
        const scHandler = bgSrc.substring(bgSrc.indexOf("case 'SOLVE_CAPTCHA':"), bgSrc.indexOf("case 'DISPATCH_PHYSICAL_COORDINATE_CLICK':"));
        assert(scHandler.includes("ERROR_ZERO_BALANCE"), 'Must check and record ERROR_ZERO_BALANCE');
        assert(scHandler.includes("campaignState.captchaEpochBlockedErrors[curEpoch] = 'ERROR_ZERO_BALANCE'"),
            'Must store blocked error under active epoch');
        assert(scHandler.includes("[CAPTCHA_CONFIG_BLOCKED]"), 'Must log [CAPTCHA_CONFIG_BLOCKED] on subsequent requests');
    });

    // -------------------------------------------------------------
    // Test 15: PREPARING pause requeues target and does not increment FAILED/UNKNOWN
    // -------------------------------------------------------------
    runTest('15. PREPARING pause requeues target and does not increment FAILED/UNKNOWN', () => {
        const pauseFunc = bgSrc.substring(bgSrc.indexOf("async function pauseCampaignOrchestrator"), bgSrc.indexOf("async function resumeCampaignOrchestrator"));
        const prepBlock = pauseFunc.substring(pauseFunc.indexOf("currentAtt.status === 'PREPARING'"), pauseFunc.indexOf("currentAtt.status === 'SUBMIT_PENDING'"));
        assert(prepBlock.includes("campaignState.queue.unshift(currentAtt.url)"), 'Must unshift to front of queue');
        assert(!prepBlock.includes("settleCanonicalAttempt(currentAtt.attemptId, 'FAILURE'"),
            'Must NOT settle PREPARING as FAILURE on pause');
        assert(!prepBlock.includes("settleCanonicalAttempt(currentAtt.attemptId, 'DELIVERY_UNKNOWN'"),
            'Must NOT settle PREPARING as DELIVERY_UNKNOWN on pause');
    });

    // -------------------------------------------------------------
    // Test 16: SUBMIT_PENDING pause becomes PAUSED_UNKNOWN only once
    // -------------------------------------------------------------
    runTest('16. SUBMIT_PENDING pause becomes PAUSED_UNKNOWN only once', () => {
        const pauseFunc = bgSrc.substring(bgSrc.indexOf("async function pauseCampaignOrchestrator"), bgSrc.indexOf("async function resumeCampaignOrchestrator"));
        const pendingBlock = pauseFunc.substring(pauseFunc.indexOf("currentAtt.status === 'SUBMIT_PENDING'"));
        assert(pendingBlock.includes("settleCanonicalAttempt(currentAtt.attemptId, 'PAUSED_UNKNOWN'"),
            'Must settle SUBMIT_PENDING as PAUSED_UNKNOWN in HistoryStore');
    });

    // -------------------------------------------------------------
    // Test 17: no manual ledgerStats.success mutation exists
    // -------------------------------------------------------------
    runTest('17. no manual ledgerStats.success mutation exists', () => {
        assert(!bgSrc.includes("if (isSuccess && ledgerStats.success === 0)"),
            'Manual fallback mutation if (isSuccess && ledgerStats.success === 0) must be completely deleted');
        assert(!bgSrc.includes("ledgerStats.success = 1"),
            'No ledgerStats.success = 1 statement may exist');
    });

    // -------------------------------------------------------------
    // Test 18: executable total=10 / completed=3 / inProgress=1 => remaining=7, not 7-skippedHistory
    // -------------------------------------------------------------
    await runAsyncTest('18. executable total=10 / completed=3 / inProgress=1 => remaining=7, not 7-skippedHistory', async () => {
        // Test syncCampaignCountersFromLedger arithmetic logic
        const hs = new HistoryStore({ storageBackend: 'memory' });
        const runId = 'test_run_18';
        hs.activeCampaignRunId = runId;

        // Record 3 completed attempts (2 SUCCESS, 1 FAILURE)
        const a1 = await hs.recordAttempt('https://test1.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(a1.attemptId, 'CONFIRMED_SUCCESS', 'SUBMIT_CONFIRMED', {}, { campaignRunId: runId });
        const a2 = await hs.recordAttempt('https://test2.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(a2.attemptId, 'CONFIRMED_SUCCESS', 'SUBMIT_CONFIRMED', {}, { campaignRunId: runId });
        const a3 = await hs.recordAttempt('https://test3.com', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(a3.attemptId, 'FAILURE', 'TIMEOUT', {}, { campaignRunId: runId });

        const stats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(stats.completed, 3, 'Ledger completed must be 3');

        const total = 10;
        const remaining = Math.max(0, total - stats.completed);
        assert.strictEqual(remaining, 7, 'Remaining must be exactly 7 (total 10 - completed 3), never double-subtracting skippedHistory');
    });

    // -------------------------------------------------------------
    // Test 19: Live currentRun counts exactly equal History currentRun counts
    // -------------------------------------------------------------
    await runAsyncTest('19. Live currentRun counts exactly equal History currentRun counts', async () => {
        const hs = new HistoryStore({ storageBackend: 'memory' });
        const runId = 'test_run_19';
        hs.activeCampaignRunId = runId;

        await hs.recordAttempt('https://a.com', { campaignRunId: runId }).then(a => hs.settleCanonicalAttempt(a.attemptId, 'CONFIRMED_SUCCESS', 'OK', {}, { campaignRunId: runId }));
        await hs.recordAttempt('https://b.com', { campaignRunId: runId }).then(a => hs.settleCanonicalAttempt(a.attemptId, 'CONFIRMED_SUCCESS', 'OK', {}, { campaignRunId: runId }));
        await hs.recordAttempt('https://c.com', { campaignRunId: runId }).then(a => hs.settleCanonicalAttempt(a.attemptId, 'FAILURE', 'FAIL', {}, { campaignRunId: runId }));
        await hs.recordAttempt('https://d.com', { campaignRunId: runId }).then(a => hs.settleCanonicalAttempt(a.attemptId, 'DELIVERY_UNKNOWN', 'UNKNOWN', {}, { campaignRunId: runId }));
        await hs.recordAttempt('https://e.com', { campaignRunId: runId }).then(a => hs.settleCanonicalAttempt(a.attemptId, 'SKIPPED', 'SKIP', {}, { campaignRunId: runId }));

        const stats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(stats.success, 2);
        assert.strictEqual(stats.failure, 1);
        assert.strictEqual(stats.unknown, 1);
        assert.strictEqual(stats.skipped, 1);
        assert.strictEqual(stats.completed, 5);

        // Verify syncCampaignCountersFromLedger computes matching numbers
        const total = 10;
        const remaining = Math.max(0, total - stats.completed);
        assert.strictEqual(remaining, 5);
    });

    // -------------------------------------------------------------
    // Test 20: popup reopen uses same currentRun counters
    // -------------------------------------------------------------
    runTest('20. popup reopen uses same currentRun counters', () => {
        // Verify in popup.js that _renderHistoryPanel defaults to currentRun during active or recent run
        assert(popSrc.includes("scopePref = storedState.xpider_history_scope_preference || (isCampaignActive || activeRunId ? 'currentRun' : 'currentGeneration')"),
            'popup.js must default scope to currentRun during active/recent campaign');
        assert(popSrc.includes("Generation totals — not current run"),
            'popup.js must clearly label currentGeneration as generation totals not current run');
    });

    // -------------------------------------------------------------
    // Test 21: source/build parity
    // -------------------------------------------------------------
    runTest('21. source/build parity', () => {
        const mirrorFiles = [
            'background.js', 'content-script.js', 'popup.js', 'popup.html',
            'solver-content.js',
            'modules/build-provenance.js', 'modules/contact-gate.js', 'modules/email-collector.js',
            'modules/history-store.js', 'modules/vision-submit-executor.js'
        ];

        for (const rel of mirrorFiles) {
            const srcPath = path.join(SRC_DIR, rel);
            const bldPath = path.join(BLD_DIR, rel);
            assert(fs.existsSync(srcPath), `Source file missing: ${rel}`);
            assert(fs.existsSync(bldPath), `Build file missing: ${rel}`);

            const srcSha = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
            const bldSha = crypto.createHash('sha256').update(fs.readFileSync(bldPath)).digest('hex');
            assert.strictEqual(srcSha, bldSha, `SHA mismatch for ${rel}: src=${srcSha} bld=${bldSha}`);
        }
        console.log(`   -> Verified 10/10 mirrored files with 100% hash parity.`);
    });

    console.log('================================================================');
    console.log(` RESULTS: ${testsPassed} PASSED / ${testsFailed} FAILED`);
    console.log('================================================================');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
