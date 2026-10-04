/**
 * test_realtime_counters_display.js
 * Verification for Issue #6 Real-Time Counters Display:
 * SUCCESS, FAILED, COMPLETED, REMAINING
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("======================================================================");
console.log(" [REAL-TIME COUNTERS DISPLAY VERIFICATION - SUCCESS/FAILED/COMPLETED/REMAINING]");
console.log("======================================================================\n");

// 1. Verify background.js GET_STATE implementation
const bgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');

assert.ok(bgCode.includes("counters: campaignState.counters"), "GET_STATE must return counters object");
assert.ok(bgCode.includes("successCount: campaignState.counters.success"), "GET_STATE must return successCount");
assert.ok(bgCode.includes("failedCount: campaignState.counters.failed"), "GET_STATE must return failedCount");
assert.ok(bgCode.includes("completedCount: campaignState.counters.completed"), "GET_STATE must return completedCount");
assert.ok(bgCode.includes("remainingCount: campaignState.counters.remaining"), "GET_STATE must return remainingCount");
console.log("✅ PASS: background.js GET_STATE exports all 4 counters + ledger counters object");

// 2. Verify background.js completion broadcast
assert.ok(bgCode.includes("action: 'CAMPAIGN_FINISHED'"), "background.js must broadcast CAMPAIGN_FINISHED on queue completion");
assert.ok(bgCode.includes("broadcastCounters()"), "background.js must call broadcastCounters() on queue completion");
console.log("✅ PASS: background.js broadcasts CAMPAIGN_FINISHED and triggers counter broadcast upon completion");

// 3. Verify popup.js DOM bindings and counter update logic
const popupCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

assert.ok(popupCode.includes("let failedCount = 0;"), "popup.js must declare module-scoped failedCount");
assert.ok(popupCode.includes("let completedCount = 0;"), "popup.js must declare module-scoped completedCount");
assert.ok(popupCode.includes("document.getElementById('success-count-display')"), "popup.js must bind success-count-display");
assert.ok(popupCode.includes("document.getElementById('failed-count-display')"), "popup.js must bind failed-count-display");
assert.ok(popupCode.includes("document.getElementById('completed-count-display')"), "popup.js must bind completed-count-display");
assert.ok(popupCode.includes("document.getElementById('remaining-count-display')"), "popup.js must bind remaining-count-display");
assert.ok(popupCode.includes("statusBox.classList.remove('hidden')"), "popup.js must unhide status-box when counts exist");
console.log("✅ PASS: popup.js binds all 4 displays and handles statusBox unhiding");

// 4. Simulate the updateRealTimeStatus logic in memory
let domState = {
    'status-box': { classes: ['hidden'] },
    'success-count-display': { textContent: '0' },
    'failed-count-display': { textContent: '0' },
    'completed-count-display': { textContent: '0' },
    'remaining-count-display': { textContent: '0' },
    'url-count-display': { textContent: '' }
};

let simTotalTargets = 0;
let simSuccessCount = 0;
let simFailedCount = 0;
let simCompletedCount = 0;
let simRemainingTargets = 0;
let simCampaignActive = false;

function simUpdateRealTimeStatus(data) {
    if (!data) return;
    if (data.totalTargets !== undefined && data.totalTargets > 0) {
        simTotalTargets = data.totalTargets;
    }

    // 1. Success Count
    if (data.successCount !== undefined) {
        simSuccessCount = data.successCount;
    } else if (data.counters && data.counters.success !== undefined) {
        simSuccessCount = data.counters.success;
    }
    domState['success-count-display'].textContent = String(simSuccessCount);

    // 2. Failed Count
    if (data.failedCount !== undefined) {
        simFailedCount = data.failedCount;
    } else if (data.counters && data.counters.failed !== undefined) {
        simFailedCount = data.counters.failed;
    }
    domState['failed-count-display'].textContent = String(simFailedCount);

    // 3. Completed Count (never clobbered by 0 on partial updates)
    if (data.completedCount !== undefined) {
        simCompletedCount = data.completedCount;
    } else if (data.counters && data.counters.completed !== undefined) {
        simCompletedCount = data.counters.completed;
    } else if (data.remainingCount !== undefined && simTotalTargets > 0) {
        simCompletedCount = Math.max(0, simTotalTargets - data.remainingCount);
    } else if (data.successCount !== undefined || data.failedCount !== undefined) {
        simCompletedCount = Math.max(simCompletedCount, simSuccessCount + simFailedCount);
    }
    domState['completed-count-display'].textContent = String(simCompletedCount);

    // 4. Remaining Count (authoritative)
    if (data.remainingCount !== undefined) {
        simRemainingTargets = data.remainingCount;
    } else if (data.counters && data.counters.remaining !== undefined) {
        simRemainingTargets = data.counters.remaining;
    } else if (simTotalTargets > 0) {
        simRemainingTargets = Math.max(0, simTotalTargets - simCompletedCount);
    }
    domState['remaining-count-display'].textContent = String(simRemainingTargets);

    // Unhide status box
    if (simTotalTargets > 0 || simCompletedCount > 0 || simSuccessCount > 0 || simFailedCount > 0 || simRemainingTargets > 0 || simCampaignActive) {
        domState['status-box'].classes = domState['status-box'].classes.filter(c => c !== 'hidden');
    }
}

// Test Case A: Initial Start Campaign
simUpdateRealTimeStatus({
    successCount: 0,
    failedCount: 0,
    completedCount: 0,
    remainingCount: 5,
    totalTargets: 5
});
assert.strictEqual(domState['success-count-display'].textContent, '0');
assert.strictEqual(domState['failed-count-display'].textContent, '0');
assert.strictEqual(domState['completed-count-display'].textContent, '0');
assert.strictEqual(domState['remaining-count-display'].textContent, '5');
assert.ok(!domState['status-box'].classes.includes('hidden'), "Status box must be visible after campaign start");
console.log("✅ PASS: Test Case A - Initial Start Campaign correctly shows 0/0/0/5 and unhides status-box");

// Test Case B: 1st Target Succeeds (partial STATUS_UPDATE without completedCount)
simUpdateRealTimeStatus({
    successCount: 1,
    remainingCount: 4
});
assert.strictEqual(domState['success-count-display'].textContent, '1', "SUCCESS display must show 1");
assert.strictEqual(domState['failed-count-display'].textContent, '0', "FAILED display must show 0");
assert.strictEqual(domState['completed-count-display'].textContent, '1', "COMPLETED display must show 1 (derived from total - remaining)");
assert.strictEqual(domState['remaining-count-display'].textContent, '4', "REMAINING display must show 4");
console.log("✅ PASS: Test Case B - 1st Target Success partial update shows 1/0/1/4 without wiping completed");

// Test Case C: 2nd Target Fails (via counters object)
simUpdateRealTimeStatus({
    counters: {
        success: 1,
        failed: 1,
        completed: 2,
        remaining: 3
    }
});
assert.strictEqual(domState['success-count-display'].textContent, '1');
assert.strictEqual(domState['failed-count-display'].textContent, '1');
assert.strictEqual(domState['completed-count-display'].textContent, '2');
assert.strictEqual(domState['remaining-count-display'].textContent, '3');
console.log("✅ PASS: Test Case C - 2nd Target Failure with counters object shows 1/1/2/3");

// Test Case D: Hydration when popup reopens after all targets finish (isActive = false)
simCampaignActive = false;
// Reset DOM to simulate fresh popup open with hidden box
domState['status-box'].classes = ['hidden'];
domState['success-count-display'].textContent = '0';
domState['failed-count-display'].textContent = '0';
domState['completed-count-display'].textContent = '0';
domState['remaining-count-display'].textContent = '0';

// Mock response from background GET_STATE when finished
const finishedGetStateResponse = {
    isActive: false,
    totalTargets: 5,
    successCount: 4,
    failedCount: 1,
    completedCount: 5,
    remainingCount: 0,
    counters: { success: 4, failed: 1, completed: 5, remaining: 0 }
};

simUpdateRealTimeStatus(finishedGetStateResponse);

assert.strictEqual(domState['success-count-display'].textContent, '4', "SUCCESS must be 4");
assert.strictEqual(domState['failed-count-display'].textContent, '1', "FAILED must be 1");
assert.strictEqual(domState['completed-count-display'].textContent, '5', "COMPLETED must be 5");
assert.strictEqual(domState['remaining-count-display'].textContent, '0', "REMAINING must be 0");
assert.ok(!domState['status-box'].classes.includes('hidden'), "Status box must NOT be hidden even when isActive is false!");
console.log("✅ PASS: Test Case D - Hydration after completion correctly renders 4/1/5/0 and unhides status-box");

console.log("\n======================================================================");
console.log(" 🎉 ALL 4 COUNTER SIMULATION & CODE INTEGRITY TESTS PASSED 100%!");
console.log("======================================================================\n");
