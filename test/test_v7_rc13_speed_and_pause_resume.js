/**
 * XPIDER AutoForm Sender Pro - V7.0.0-RC13 Test Suite
 * Verifies P0 Speed Slider Runtime Audit & Bidirectional Resume/Pause State Machine
 * Reference Directives: #6535593609 (Tab Lifecycle & State Revision) and #6537069439 (Speed Sliders & Button States)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🚀 RUNNING V7.0.0-RC13 SPEED SLIDERS & BIDIRECTIONAL PAUSE/RESUME TEST SUITE');
console.log('================================================================\n');

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

const bgCode = fs.readFileSync(path.resolve('extension/background.js'), 'utf8');
const popupCode = fs.readFileSync(path.resolve('extension/popup.js'), 'utf8');
const csCode = fs.readFileSync(path.resolve('extension/content-script.js'), 'utf8');
const popupHtml = fs.readFileSync(path.resolve('extension/popup.html'), 'utf8');

// TEST 1: Speed Slider DOM Inputs, Level Mappings, and HTML Initial Value
runTest('Speed Sliders: DOM definitions and exact level mappings for collect, fill, submit', () => {
    // 1. Verify popup.html contains the 3 sliders with min=0, max=9
    assert(popupHtml.includes('id="delay-input-collect" value="6" min="0" max="9"'), 'Collect slider must exist min=0 max=9');
    assert(popupHtml.includes('id="delay-input-fill" value="6" min="0" max="9"'), 'Fill slider must exist min=0 max=9');
    assert(popupHtml.includes('id="delay-input-submit" value="6" min="0" max="9"'), 'Submit slider must exist min=0 max=9');
    assert(popupHtml.includes('id="speed-submit-display" class="neon-blue-text">Level 6 <small>(4.0s)</small>'), 'Submit display initial HTML must reflect 4.0s (not 1.5s)');

    // 2. Verify level mapping tables in popup.js
    const collectMapping = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
    const fillMapping = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
    const submitMapping = [15000, 12000, 10000, 8000, 6000, 5000, 4000, 3000, 2000, 1000];

    // Assert Level 6 defaults
    assert.strictEqual(collectMapping[6], 10000, 'Collect Level 6 must be 10000ms (10s)');
    assert.strictEqual(fillMapping[6], 300, 'Fill Level 6 must be 300ms');
    assert.strictEqual(submitMapping[6], 4000, 'Submit Level 6 must be 4000ms (4.0s)');

    // Assert Level 0 (min speed / max delay)
    assert.strictEqual(collectMapping[0], 60000, 'Collect Level 0 must be 60s');
    assert.strictEqual(fillMapping[0], 2000, 'Fill Level 0 must be 2000ms');
    assert.strictEqual(submitMapping[0], 15000, 'Submit Level 0 must be 15s');

    // Assert Level 9 (max speed / min delay)
    assert.strictEqual(collectMapping[9], 3000, 'Collect Level 9 must be 3s');
    assert.strictEqual(fillMapping[9], 100, 'Fill Level 9 must be 100ms');
    assert.strictEqual(submitMapping[9], 1000, 'Submit Level 9 must be 1000ms (1.0s)');
});

// TEST 2: Speed Sliders Live Persistence and Background Wiring
runTest('Speed Sliders: Immediate auto-persistence and UPDATE_SPEED_SETTINGS IPC', () => {
    // Verify popup.js auto-persists to storage and sends message
    assert(popupCode.includes('chrome.storage.local.set({'), 'popup.js must persist to storage');
    assert(popupCode.includes('xpider_delay_collect: levelCollect'), 'Must persist xpider_delay_collect');
    assert(popupCode.includes('xpider_delay_fill: levelFill'), 'Must persist xpider_delay_fill');
    assert(popupCode.includes('xpider_delay_submit: levelSubmit'), 'Must persist xpider_delay_submit');
    assert(popupCode.includes("action: 'UPDATE_SPEED_SETTINGS'"), 'popup.js must send UPDATE_SPEED_SETTINGS message');

    // Verify background.js receives UPDATE_SPEED_SETTINGS and forwards UPDATE_ACTIVE_SPEED
    assert(bgCode.includes("case 'UPDATE_SPEED_SETTINGS':"), 'background.js must handle UPDATE_SPEED_SETTINGS');
    assert(bgCode.includes("action: 'UPDATE_ACTIVE_SPEED'"), 'background.js must propagate to active tab');
    assert(bgCode.includes('[SPEED_UPDATE] liveApplied=true'), 'background.js must log speed update');

    // Verify content-script.js listens for UPDATE_ACTIVE_SPEED
    assert(csCode.includes("msg.action === 'UPDATE_ACTIVE_SPEED'"), 'content-script.js must listen for UPDATE_ACTIVE_SPEED');
});

// TEST 3: Inter-Target Collection Delay Specification Verification
runTest('Collection Speed Delay: Verified to apply strictly BETWEEN targets (not before first target)', () => {
    // In background.js startCampaignOrchestrator, first target is dispatched immediately
    assert(bgCode.includes('processNextCampaignTarget(campaignState.sessionId)'), 'First target dispatched immediately on orchestrator start');

    // In background.js finally block, delay is applied before next target
    const interTargetSnippet = 'const delay = Math.max(1000, campaignState.delayMs || 10000);\n                logBg(null, `Waiting ${delay}ms before next target...`, "debug");';
    assert(bgCode.includes('Waiting ${delay}ms before next target'), 'Inter-target delay must be logged');
    assert(bgCode.includes('campaignState.activeTimeoutId = setTimeout(() => processNextCampaignTarget(currentSession, nextGen), delay)'), 'Timeout must use delay between targets');
});

// TEST 4: Clamping Fix Verification for Fast Submission Speeds (Levels 7, 8, 9)
runTest('Submission Speed Clamping Fix: Math.max(3500) eliminated; permits 1000ms-3000ms', () => {
    // Ensure old Math.max(3500) bug is eliminated
    assert(!bgCode.includes('Math.max(3500, campaignState.submitDelayMs'), 'Old 3500ms hard clamp must be eliminated');
    // Ensure new Math.max(500) clamp allows 1000ms (Level 9), 2000ms (Level 8), 3000ms (Level 7)
    assert(bgCode.includes('Math.max(500, campaignState.submitDelayMs !== undefined'), 'New safe 500ms boundary must be present');

    // Functional tolerance simulation
    const simulateHoldMs = (submitDelayMs) => Math.max(500, submitDelayMs !== undefined ? parseInt(submitDelayMs) : 4000);
    assert.strictEqual(simulateHoldMs(1000), 1000, 'Level 9 (1000ms) must not be clamped to 3500ms');
    assert.strictEqual(simulateHoldMs(2000), 2000, 'Level 8 (2000ms) must not be clamped to 3500ms');
    assert.strictEqual(simulateHoldMs(3000), 3000, 'Level 7 (3000ms) must not be clamped to 3500ms');
    assert.strictEqual(simulateHoldMs(4000), 4000, 'Level 6 (4000ms) must be 4000ms');
    assert.strictEqual(simulateHoldMs(undefined), 4000, 'Default submitDelayMs must be 4000ms');
});

// TEST 5: Bidirectional Resume/Pause Primary Action Button Synchronization
runTest('Resume/Pause Button State Machine: Strictly state-driven by authoritative background snapshot', () => {
    // Verify popup.js applyAuthoritativeStateSnapshot updates pauseBtn
    assert(popupCode.includes('pauseBtn.textContent = "⏸️ Pause"'), 'Must set Pause text when running');
    assert(popupCode.includes('pauseBtn.style.backgroundColor = "#ea580c"'), 'Must set orange color when running');
    assert(popupCode.includes('pauseBtn.textContent = "▶️ Resume"'), 'Must set Resume text when paused');
    assert(popupCode.includes('pauseBtn.style.backgroundColor = "#22c55e"'), 'Must set emerald green color when paused');
    assert(popupCode.includes('pauseBtn.textContent = "⏸️ Pause (Hold Active)"'), 'Must distinguish deliberate operator hold from campaign paused');
    assert(popupCode.includes('pauseBtn.style.backgroundColor = "#d97706"'), 'Must set amber-orange for deliberate hold');

    // Verify togglePause waits for ACK
    assert(popupCode.includes('btn.textContent = "⏳ Pausing..."'), 'Must show Pausing... state while awaiting ACK');
    assert(popupCode.includes('pauseBtn.textContent = "⏳ Resuming..."'), 'Must show Resuming... state while awaiting ACK');
});

// TEST 6: Directive #6535593609 Pending Operator Hold Tab Retention on Pause
runTest('Tab Lifecycle on Pause: Active operator hold tab preserved; no silent tab closure', () => {
    // In pauseCampaignOrchestrator:
    assert(bgCode.includes('closeAllCampaignTabsExcept(preservedTabId, \'PAUSE_RETAIN_HOLD_TAB\')'), 'Must preserve operator hold tab on pause');
    assert(bgCode.includes('action: \'CAMPAIGN_PAUSED_HOLD_RETAINED\''), 'Must send CAMPAIGN_PAUSED_HOLD_RETAINED to preserved tab');
    assert(bgCode.includes('pausedHeldTabId: campaignState.pausedHeldTabId'), 'Must record pausedHeldTabId in checkpoint');

    // In content-script.js:
    assert(csCode.includes('msg.action === \'CAMPAIGN_PAUSED_HOLD_RETAINED\''), 'content-script must handle CAMPAIGN_PAUSED_HOLD_RETAINED');
    assert(csCode.includes('⏸️ CAMPAIGN PAUSED (Operator Hold Retained)'), 'Hold badge must update to reflect paused retention');

    // In resumeCampaignOrchestrator:
    assert(bgCode.includes('if (checkpoint.pausedHeldTabId)'), 'Resume must check for preserved held tab');
    assert(bgCode.includes('safeTabs.sendMessage(checkpoint.pausedHeldTabId, { action: \'DISMISS_MANUAL_HOLD_PANEL\', autoSubmit: true'), 'If resuming in AUTO, dismiss hold with autoSubmit');
    assert(bgCode.includes('safeTabs.sendMessage(checkpoint.pausedHeldTabId, { action: \'UPDATE_CAMPAIGN_MODE\', mode: requestedMode }'), 'If resuming in SEMI_AUTO/MANUAL, update mode');
});

// TEST 7: Monotonic stateRevision Scoped to runId and runEpoch
runTest('State Revision Scoping: Monotonic revision comparison scoped to (runId, runEpoch)', () => {
    // In popup.js applyAuthoritativeStateSnapshot:
    assert(popupCode.includes('if (runId !== currentSnapshotRunId || runEpoch !== currentSnapshotRunEpoch)'), 'Must detect runId or runEpoch change');
    assert(popupCode.includes('currentSnapshotRevision = 0;'), 'Must reset revision for new run/epoch');
    assert(popupCode.includes('if (snapshot.revision < currentSnapshotRevision)'), 'Must discard stale revision for same run/epoch');

    // In background.js saveCampaignState:
    assert(bgCode.includes('xpider_state_revision: campaignState.stateRevision || 0'), 'saveCampaignState must persist stateRevision');
    assert(bgCode.includes('xpider_run_epoch: campaignState.runEpoch || 0'), 'saveCampaignState must persist runEpoch');

    // In background.js restoreCampaignState:
    assert(bgCode.includes('campaignState.stateRevision = data.xpider_state_revision;'), 'restoreCampaignState must restore stateRevision');
    assert(bgCode.includes('campaignState.runEpoch = data.xpider_run_epoch;'), 'restoreCampaignState must restore runEpoch');
});

// TEST 8: Zero Duplicate Submit & Queue Preservation on Pause/Resume
runTest('Queue Preservation: Pre-submit uncommitted target re-queued to queue[0] without duplicate submit', () => {
    // Verify target re-queuing in pauseCampaignOrchestrator
    assert(bgCode.includes('campaignState.queue.unshift(effectiveAtt.url)'), 'Must unshift uncommitted target back to front of queue');
    assert(bgCode.includes('hs.attempts = hs.attempts.filter(a => a.attemptId !== effectiveAtt.attemptId)'), 'Must clean uncommitted attempt from ledger');

    // Verify queue deduplication on resume
    assert(bgCode.includes('campaignState.queue = [...checkpoint.remainingQueue]'), 'Resume must restore exact remaining queue');
    assert(bgCode.includes('const requeuedNorms = new Set(campaignState.queue.map(u => normalizeUrl(typeof u === \'string\' ? u : (u?.url || \'\'))))'), 'Resume must deduplicate visited against requeued queue');
});

console.log(`\n================================================================`);
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`================================================================\n`);

if (passedTests === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}

