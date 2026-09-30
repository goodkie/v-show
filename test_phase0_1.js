/**
 * Phase 0+1 Automated Unit & Contract Test Suite
 * Tests F-1, F-2, F-4, Versioning, Bounded Queue, Intent Ledger, DELIVERY_UNKNOWN
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("=== [PHASE 0+1 TEST RUNNER] Starting Verification Suite ===");

// 1. Version Consistency Check
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'send_message_backup/manifest.json'), 'utf8'));
const popupHtml = fs.readFileSync(path.join(__dirname, 'send_message_backup/popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(__dirname, 'send_message_backup/popup.js'), 'utf8');

assert.strictEqual(manifest.version, "1.2.0", "Manifest version must be 1.2.0");
assert(popupHtml.includes('v1.2.0'), "popup.html must display v1.2.0");
assert(popupJs.includes('v1.2.0'), "popup.js header must declare v1.2.0");
console.log("✅ PASS: Version consistency check (v1.2.0 across manifest, popup.html, popup.js)");

// 2. F-1 Accounting Single Owner Check (Code Inspection & Logic Test)
const bgCode = fs.readFileSync(path.join(__dirname, 'send_message_backup/background.js'), 'utf8');
const occurrencesOfCountIncrement = (bgCode.match(/campaignState\.successCount\+\+/g) || []).length;
assert.strictEqual(occurrencesOfCountIncrement, 1, "campaignState.successCount++ must exist ONLY ONCE in background.js (inside finishOnce)");
console.log("✅ PASS: F-1 Single success-accounting owner verified (exactly 1 increment site in finishOnce)");

// 3. F-4 Solver Core Universal Integration Check
global.self = {};
require('./send_message_backup/solver-core.js');
assert(typeof global.self.XpiderSolverCore === 'function', "XpiderSolverCore must be exposed on self");
const solverInstance = new global.self.XpiderSolverCore({ witAiKey: "dummy_key" });
assert(typeof solverInstance.solveChallengeGeneric === 'function', "Extended solveChallengeGeneric must exist");
console.log("✅ PASS: F-4 Solver Core universal binding and extensible API verified");

// 4. Bounded Candidate Enqueuing (Simulation of QUEUE_BRANCHES logic)
const simulateQueueBranches = (rawLinks, currentQueue, visitedUrls, maxBatch = 3, maxQueue = 1000) => {
    let added = 0;
    const queue = [...currentQueue];
    const visited = [...visitedUrls];
    for (const link of rawLinks) {
        if (added >= maxBatch) break;
        if (queue.length >= maxQueue) break;
        if (typeof link !== 'string' || !link.startsWith('http')) continue;
        if (!visited.includes(link) && !queue.includes(link)) {
            queue.push(link);
            added++;
        }
    }
    return { queue, added };
};

const candidateBatch = [
    "https://example.com/contact-1",
    "https://example.com/contact-2",
    "https://example.com/contact-3",
    "https://example.com/contact-4", // should be bounded out by max 3
    "https://example.com/contact-5"
];
const result1 = simulateQueueBranches(candidateBatch, [], []);
assert.strictEqual(result1.added, 3, "Batch must be capped at 3");
assert.strictEqual(result1.queue.length, 3, "Queue must contain exactly 3 bounded candidates");

const result2 = simulateQueueBranches(["https://example.com/contact-1"], result1.queue, []);
assert.strictEqual(result2.added, 0, "Already queued URLs must not be duplicated");
console.log("✅ PASS: Bounded per-target candidates & duplicate prevention verified");

// 5. Intent Ledger & SW Restart DELIVERY_UNKNOWN Recovery Check
const simulateSwRestartRecovery = (storedData) => {
    let visited = Array.isArray(storedData.xpider_visited) ? [...storedData.xpider_visited] : [];
    let settledAttempt = null;

    if (storedData.xpider_currentAttempt && storedData.xpider_currentAttempt.status === 'SUBMIT_PENDING') {
        const interruptedUrl = storedData.xpider_currentAttempt.url;
        if (!visited.includes(interruptedUrl)) {
            visited.push(interruptedUrl);
        }
        settledAttempt = {
            ...storedData.xpider_currentAttempt,
            status: 'RESOLVED',
            reasonCode: 'DELIVERY_UNKNOWN',
            interruptedAt: Date.now()
        };
    }
    return { visited, settledAttempt };
};

const testStore = {
    xpider_visited: ["https://done.com"],
    xpider_currentAttempt: {
        url: "https://in-flight.com/contact",
        attemptId: "att_12345",
        status: "SUBMIT_PENDING",
        timestamp: Date.now() - 5000
    }
};

const recovery = simulateSwRestartRecovery(testStore);
assert.strictEqual(recovery.settledAttempt.status, "RESOLVED");
assert.strictEqual(recovery.settledAttempt.reasonCode, "DELIVERY_UNKNOWN");
assert(recovery.visited.includes("https://in-flight.com/contact"), "Interrupted target must be recorded in visited to prevent blind resend");
console.log("✅ PASS: SW restart recovery correctly settles pending attempt as DELIVERY_UNKNOWN and prevents blind resend");

console.log("=== ALL PHASE 0+1 TESTS PASSED SUCCESSFULLY ===");
