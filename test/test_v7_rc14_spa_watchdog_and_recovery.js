/**
 * test_v7_rc14_spa_watchdog_and_recovery.js
 * Verification suite for V7.0.0-RC14 fixes:
 * 1. Bounded Per-Stage Watchdog & SPA / Sniper candidate stall elimination
 * 2. SEMI_AUTO / MANUAL operator hold retention on exhausted paths or stage timeouts
 * 3. AUTO mode fail-fast on stage timeout (no 180s idle hang)
 * 4. Residential upstream 522 loop & probe thrash elimination (15s backoff + pause target deadline)
 * 5. Paused campaign protection against accidental full re-run rebasing
 * 6. Explicit safe re-audit (RESUME_AUTO_AUDIT) on resume to AUTO mode
 * 7. Elimination of duplicate click listeners / double dispatch on start buttons
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🚀 RUNNING V7.0.0-RC14 SPA WATCHDOG, RESIDENTIAL RECOVERY & AUDIT TEST SUITE');
console.log('================================================================\n');

const bgCode = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const csCode = fs.readFileSync(path.join(__dirname, '../extension/content-script.js'), 'utf8');
const popupCode = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
const pgCode = fs.readFileSync(path.join(__dirname, '../extension/modules/privacy-gateway.js'), 'utf8');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ [PASS] Test ${totalTests}: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ [FAIL] Test ${totalTests}: ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

// TEST 1: Bounded Per-Stage Watchdog in background.js
runTest('Bounded Per-Stage Watchdog: transitionStage defined and bounded to <=30s per stage', () => {
    assert(bgCode.includes('const transitionStage = (stageName, timeoutMs = 30000) =>'), 'Must define transitionStage with default 30s timeout');
    assert(bgCode.includes('transitionStage(\'PRE_SCAN\', 20000)'), 'Must track PRE_SCAN stage');
    assert(bgCode.includes('transitionStage(\'INJECTION\', 20000)'), 'Must track INJECTION stage');
    assert(bgCode.includes('transitionStage(\'FORM_DISCOVERY\', 30000)'), 'Must track FORM_DISCOVERY stage');
    assert(bgCode.includes('transitionStage(\'CANDIDATE_NAV\', 25000)'), 'Must track CANDIDATE_NAV stage');
    assert(bgCode.includes('STAGE_WATCHDOG_TIMEOUT'), 'Must log and handle stage watchdog timeouts');
});

// TEST 2: Stage Timeout & Paths Exhausted Behavior by Mode
runTest('Stage Timeout & Paths Exhausted: SEMI_AUTO/MANUAL enters hold; AUTO fails fast without 180s hang', () => {
    // In transitionStage timeout handler:
    assert(bgCode.includes('if (curMode === \'SEMI_AUTO\' || curMode === \'MANUAL\') {'), 'Must check mode in stage watchdog timeout');
    assert(bgCode.includes('campaignState.currentTargetStage = \'MANUAL_HOLD\''), 'SEMI_AUTO/MANUAL must enter MANUAL_HOLD on stage timeout');
    assert(bgCode.includes('TRIGGER_SIDE_PANEL_ASSIST'), 'Must trigger assist UI on stage timeout');
    assert(bgCode.includes('reasonCode: \'DISCOVERY_STAGE_TIMEOUT\''), 'AUTO mode must fail fast with DISCOVERY_STAGE_TIMEOUT instead of 180s hang');

    // In tryNext paths exhausted:
    assert(bgCode.includes('All contact discovery paths exhausted. Displaying operator assistance hold...'), 'Must log discovery hold on paths exhausted');
    // Ensure in SEMI_AUTO/MANUAL it returns without finishing:
    const exhaustedMatch = bgCode.match(/if \(pathIdx >= validPaths\.length\) \{[\s\S]*?return;/);
    assert(exhaustedMatch, 'Must return early in SEMI_AUTO/MANUAL hold without calling finish');
    assert(exhaustedMatch[0].includes('RESTORE_MANUAL_HOLD_PANEL'), 'Must restore hold panel on paths exhausted in SEMI_AUTO/MANUAL');
});

// TEST 3: SPA Re-injection & Stale Lock Release in content-script.js
runTest('SPA Re-injection: Stale processing lock released and re-execution permitted', () => {
    assert(csCode.includes('const isForceOrReinjected = Boolean(request.force || request.isSpaReinjected);'), 'Must detect SPA re-injection or forced execution');
    assert(csCode.includes('if (isForceOrReinjected && window.__xpider_releaseProcessingLock)'), 'Must release previous processing lock on SPA re-injection');
    assert(bgCode.includes('isSpaReinjected: true'), 'background.js must flag SPA re-injected START_SENDING calls');
});

// TEST 4: Upstream Residential 522 & Watchdog Probe Thrash Elimination
runTest('Residential 522 Recovery: Lifecycle state never false READY, 15s backoff, target deadline paused', () => {
    // In privacy-gateway.js:
    assert(pgCode.includes('const isActuallyReady = Boolean(st.relayReady && st.isHealthValid);'), 'Must check both relayReady and isHealthValid');
    assert(pgCode.includes('lifecycleState: isActuallyReady ? (st.lifecycleState || \'READY\') : \'DEGRADED\''), 'Degraded relay must never report READY');

    // In background.js startPrivacyRelayWatchdog:
    assert(bgCode.includes('now - lastRelayWatchdogProbeTime < 15000'), 'Must enforce 15s backoff during network degradation');
    assert(bgCode.includes('campaignState.targetDeadlineController.pause(\'NETWORK_DEGRADED\')'), 'Must pause target deadline while network degraded');
    assert(bgCode.includes('campaignState.targetDeadlineController.resume(\'NETWORK_RECOVERED\')'), 'Must resume target deadline upon recovery');
    assert(!bgCode.includes('Relay degraded (${res.lifecycleState || res.reason})'), 'Must not log degraded (READY)');
});

// TEST 5: Start Button Duplicate Listener Elimination & Speed Settings Source of Truth
runTest('Click Listener Guards & Speed Settings Source of Truth: No double dispatch, correct level mapping', () => {
    // Duplicate listeners removed from bindEvents:
    const startClickMatches = popupCode.match(/id=start-btn mode=AUTO/g);
    assert(startClickMatches && startClickMatches.length === 1, `Expected exactly 1 start-btn AUTO click listener, found ${startClickMatches?.length}`);

    // Speed slider level resolution:
    assert(popupCode.includes('let levelCollect = parseInt(delayCollectInput ? delayCollectInput.value'), 'Must read collection slider value');
    assert(popupCode.includes('const delayMs = levelToCollectMs[levelCollect] || 10000;'), 'Level 6 must resolve to 10000ms');
    assert(popupCode.includes('const fillDelayMs = levelToFillMs[levelFill] || 300;'), 'Level 6 must resolve to 300ms');
    assert(popupCode.includes('const submitDelayMs = levelToSubmitMs[levelSubmit] || 4000;'), 'Level 6 must resolve to 4000ms');
});

// TEST 6: Robust Paused-Resume Guard Against Accidental Full Re-run
runTest('Paused Checkpoint Protection: USER_START_BUTTON resumes paused run; does not rebase 91 targets', () => {
    // In popup.js launchCampaign:
    assert(popupCode.includes('START_RESUME_GUARD'), 'Must have START_RESUME_GUARD in launchCampaign');
    assert(popupCode.includes('action: \'RESUME_CAMPAIGN\''), 'Must redirect to RESUME_CAMPAIGN when paused checkpoint exists');
    assert(popupCode.includes('pausedCheckpoint.remainingQueue.length'), 'Must check remaining targets in paused checkpoint');

    // In background.js startCampaignOrchestrator:
    assert(bgCode.includes('START_REDIRECT_TO_RESUME'), 'Must have START_REDIRECT_TO_RESUME in startCampaignOrchestrator');
    assert(bgCode.includes('hasPausedChk'), 'Must check for active paused checkpoint');
});

// TEST 7: Safe Re-Audit on Resume to AUTO Mode (RESUME_AUTO_AUDIT)
runTest('Safe Re-Audit on Resume to AUTO: Implicit blind autoSubmit eliminated; explicit pre-submit audit enforced', () => {
    // In background.js resumeCampaignOrchestrator:
    assert(bgCode.includes('action: \'RESUME_AUTO_AUDIT\''), 'Must send RESUME_AUTO_AUDIT on resume in AUTO mode');
    assert(!bgCode.includes('action: \'DISMISS_MANUAL_HOLD_PANEL\', autoSubmit: true'), 'Must not send blind autoSubmit: true');

    // In content-script.js:
    assert(csCode.includes('request.action === \'RESUME_AUTO_AUDIT\''), 'content-script must handle RESUME_AUTO_AUDIT');
    assert(csCode.includes('REQUIRED_FIELDS_UNRESOLVED_ON_RESUME_AUTO'), 'Must settle cleanly if fields invalid, without blind submit');
    assert(csCode.includes('Safe re-audit passed all invariant gates. Proceeding to submit...'), 'Only submit if all invariant gates pass');
});

// TEST 8: Bounded Contact Alias Guessing (Max 1 attempt per target)
runTest('Bounded Contact Alias Navigation: Bounded to max 1 alias attempt per target', () => {
    assert(csCode.includes('const aliasAttempts = parseInt(sessionStorage.getItem(\'xpider_alias_attempts\')'), 'Must track alias attempts');
    assert(csCode.includes('aliasAttempts < 1'), 'Must bound alias guessing to < 1 attempt');
    assert(csCode.includes('sessionStorage.setItem(\'xpider_alias_attempts\''), 'Must increment alias attempt counter');
});

console.log('\n================================================================');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
    process.exit(1);
}
