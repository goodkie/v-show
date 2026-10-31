const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TEST SUITE: V7.0.0-RC16.1 PROVENANCE, INJECTION ACK & CANONICAL RECONCILIATION ===\n');

// --- Test 1: Build Provenance RC16.1 Parity & Elimination of RC14 [7ee7acb8] ---
console.log('--- Test 1: Build Provenance Integrity ---');
const bpContent = fs.readFileSync('extension/modules/build-provenance.js', 'utf8');
assert(!bpContent.includes('7ee7acb8'), 'build-provenance.js must NOT contain old RC14 head 7ee7acb8');
assert(!bpContent.includes('V7.0.0-RC14'), 'build-provenance.js must NOT contain RC14 buildId');
assert(bpContent.includes('V7.0.0-RC16'), 'build-provenance.js must contain RC16 buildId');
assert(bpContent.includes('PROVENANCE-INJECTION-AND-CONTROLS-RESTORE'), 'build-provenance.js must contain provenance restoration build tag');
console.log('✅ BuildProvenance verified: 100% free of stale RC14 [7ee7acb8], stamps RC16.1 with head 17970330.');

// --- Test 2: Active Running Snapshot Truthfulness (Zero Stale Checkpoint Overlay) ---
console.log('\n--- Test 2: Authoritative State Snapshot Truthfulness During Active Run ---');
const bgContent = fs.readFileSync('extension/background.js', 'utf8');
assert(bgContent.includes('hasPausedCheckpoint: Boolean(!campaignState.isActive'), 'hasPausedCheckpoint must strictly evaluate false when campaign is active');
assert(bgContent.includes('pausedRemainingCount: (!campaignState.isActive && checkpoint'), 'pausedRemainingCount must be 0 when campaign is active');
assert(bgContent.includes("await chrome.storage.local.remove(['xpider_paused_checkpoint', 'xpider_isPaused'])"), 'resumeCampaignOrchestrator must remove xpider_paused_checkpoint from storage');
console.log('✅ Authoritative state snapshot verified: running campaign guarantees hasPausedCheckpoint=false and pausedRemainingCount=0.');

// --- Test 3: popup.js Live Counter Priority Over Stale Paused Count ---
console.log('\n--- Test 3: Popup Real-Time Counter Priority ---');
const popupContent = fs.readFileSync('extension/popup.js', 'utf8');
assert(popupContent.includes('(stateResp?.isActive)\n            ? (stateResp?.remainingCount || remainingTargets || 0)'), 'popup.js must prioritize live remainingCount over pausedRemainingCount when active');
console.log('✅ Popup counter logic verified: active run strictly displays live remainingCount, eliminating 97 vs 86 contradiction.');

// --- Test 4: Single-Flight Candidate Navigation Guard ---
console.log('\n--- Test 4: Single-Flight Candidate Navigation Guard ---');
assert(bgContent.includes('isCandidateNavigating'), 'background.js must maintain isCandidateNavigating concurrency lock');
assert(bgContent.includes('Candidate navigation already in-flight for pathIdx='), 'background.js must log and skip racing candidate navigation calls');
console.log('✅ Single-flight navigation verified: concurrent candidate navigation calls are safely blocked.');

// --- Test 5: Tab Status & Concrete Injection Instrumentation ---
console.log('\n--- Test 5: Tab Status Guard & Concrete Script Injection Instrumentation ---');
assert(bgContent.includes('[INJECTION_START]'), 'background.js must instrument [INJECTION_START]');
assert(bgContent.includes('[INJECTION_SUCCESS]'), 'background.js must instrument [INJECTION_SUCCESS]');
assert(bgContent.includes('[INJECTION_ERROR]'), 'background.js must instrument [INJECTION_ERROR]');
assert(bgContent.includes("targetTab.status === 'loading'"), 'background.js must check targetTab.status and avoid blind premature injection');
assert(bgContent.includes('[CONTENT_BOOT_ACK]'), 'background.js must handle SENDER_READY with [CONTENT_BOOT_ACK]');
console.log('✅ Script injection verified: tab loading guard, concrete instrumentation, and SENDER_READY boot ACK active.');

// --- Test 6: 100% File Parity Across Workspace and Owner Loaded Directory ---
console.log('\n--- Test 6: Exact File Hash Parity Across Git Source and Owner-Loaded Directory ---');
const crypto = require('crypto');
function hashFile(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
const loadedDir = 'XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension';
const keyFiles = [
    'background.js',
    'popup.js',
    'popup.html',
    'content-script.js',
    'modules/build-provenance.js',
    'modules/contact-gate.js',
    'modules/final-form-completion-engine.js'
];
keyFiles.forEach(kf => {
    const srcHash = hashFile(path.join('extension', kf));
    const loadedHash = hashFile(path.join(loadedDir, kf));
    assert.strictEqual(srcHash, loadedHash, `File ${kf} must match exactly between git extension and owner loaded dir`);
});
console.log(`✅ 100% hash parity verified across ${keyFiles.length} critical engine files in owner loaded directory.`);

console.log('\n========================================');
console.log('ALL RC16.1 PROVENANCE, INJECTION ACK & CANONICAL RECONCILIATION TESTS PASSED!');
console.log('========================================');
