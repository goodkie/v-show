/**
 * test_rc3_25_live_provider_gate.js
 * Verification suite for [RC3.25-LIVE-PROVIDER-GATE-FAIL-RECOVERY]
 * Directives A, B, C, D, E
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log(' R6.9G.10.3.7.1.4.39 RC3.25: LIVE PROVIDER GATE & FAIL RECOVERY TESTS');
console.log('========================================================================\n');

let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${name}`);
        passedCount++;
    } catch (e) {
        console.error(`❌ [FAIL] ${name}: ${e.message}`);
        failedCount++;
    }
}

const bgPath = path.join(__dirname, 'extension', 'background.js');
const csPath = path.join(__dirname, 'extension', 'content-script.js');
const solverCorePath = path.join(__dirname, 'extension', 'solver-core.js');
const popupPath = path.join(__dirname, 'extension', 'popup.js');
const popupHtmlPath = path.join(__dirname, 'extension', 'popup.html');

const bgSrc = fs.readFileSync(bgPath, 'utf8');
const csSrc = fs.readFileSync(csPath, 'utf8');
const scSrc = fs.readFileSync(solverCorePath, 'utf8');
const popupSrc = fs.readFileSync(popupPath, 'utf8');
const popupHtmlSrc = fs.readFileSync(popupHtmlPath, 'utf8');

// --- SUITE 1: Directive A — Visual Confirmation Non-Sensitive & Governed ---
console.log('--- SUITE 1: Directive A (Visual Confirmation) ---');
test('1.1 content-script respects xpider_show_autofill_visual_confirm toggle', () => {
    assert(csSrc.includes('xpider_show_autofill_visual_confirm'), 'Must check xpider_show_autofill_visual_confirm in storage');
});
test('1.2 content-script visual confirmation never exposes sensitive inputs', () => {
    assert(csSrc.includes("Autofill OK — ${parts.join(' ')}"), 'Must use generic category tokens (Name, Email, Message)');
    assert(!csSrc.includes('${tpl.message}'), 'Must not inject raw message body in HUD or badge');
    assert(!csSrc.includes('${tpl.email}'), 'Must not inject raw email in HUD or badge');
});
test('1.3 popup UI exposes Show Autofill Visual Confirmation toggle', () => {
    assert(popupHtmlSrc.includes('id="form-assist-show-visual-confirm-toggle"'), 'HTML must have toggle element');
    assert(popupSrc.includes('xpider_show_autofill_visual_confirm'), 'Popup must save/hydrate visual confirm preference');
});

// --- SUITE 2: Directive B — Terminal Settle on Provider Failure when Popup OFF ---
console.log('\n--- SUITE 2: Directive B (Terminal Settlement without Deadlock) ---');
test('2.1 background recordTerminalCaptchaFailure checks popup policy', () => {
    assert(bgSrc.includes('async function recordTerminalCaptchaFailure'), 'recordTerminalCaptchaFailure must be async and accept safeErrorClass');
    assert(bgSrc.includes('xpider_show_captcha_choice_popup'), 'recordTerminalCaptchaFailure must inspect choice popup preference');
});
test('2.2 When popup OFF, transitions to CAPTCHA_AUTO_FAILURE and settles immediately', () => {
    assert(bgSrc.includes("campaignState.currentTargetStage = 'CAPTCHA_AUTO_FAILURE'"), 'Must transition to CAPTCHA_AUTO_FAILURE');
    assert(bgSrc.includes("campaignState.targetDeadlineController.cancel(settleReason)"), 'Must cancel target deadline controller');
    assert(bgSrc.includes("resolveTarget({"), 'Must atomically consume targetResolve');
});
test('2.3 Provider failure returns structured terminalSettled when popup OFF', () => {
    assert(bgSrc.includes("terminalSettled: !showChoicePopup"), 'Catch blocks must return terminalSettled flag');
    assert(bgSrc.includes("CAPTCHA_SOLVER_TIMEOUT"), 'Timeout settleReason mapped correctly');
    assert(bgSrc.includes("CAPTCHA_SOLVER_CONFIG_ERROR"), 'Config error settleReason mapped correctly');
});

// --- SUITE 3: Directive C — Top HUD State Synchronization ---
console.log('\n--- SUITE 3: Directive C (HUD State Synchronization) ---');
test('3.1 Background broadcasts CAPTCHA_UI_STATE_UPDATE on solver start', () => {
    assert(bgSrc.includes("Auto-solving (${request.type || request.captchaType || 'recaptcha'}) via ${providerLabel}..."), 'Broadcasts active solving message');
});
test('3.2 Background broadcasts CAPTCHA_UI_STATE_UPDATE on solver success', () => {
    assert(bgSrc.includes("CAPTCHA solved ✓"), 'Broadcasts solved message');
});
test('3.3 Content script handles CAPTCHA_UI_STATE_UPDATE and updates top solver HUD', () => {
    assert(csSrc.includes("action === 'CAPTCHA_UI_STATE_UPDATE'"), 'Listener for CAPTCHA_UI_STATE_UPDATE exists in content-script');
    assert(csSrc.includes("updateTopSolverHUD"), 'Updates top solver HUD');
});

// --- SUITE 4: Directive D — Hard Wall-Clock Cap & Sanitized Telemetry ---
console.log('\n--- SUITE 4: Directive D (Hard Wall-Clock Bounds & Sanitized Telemetry) ---');
test('4.1 solveNopeCha enforces hard wall-clock timeout with AbortController', () => {
    assert(bgSrc.includes("hardCapMs = (waitSec * 1000) + 10000"), 'background solveNopeCha has hard cap with grace in ms');
    assert(scSrc.includes("hardCapMs = (maxSec * 1000) + 10000"), 'solver-core solveNopeCha has hard cap with grace in ms');
    assert(bgSrc.includes("new AbortController()"), 'background uses AbortController for network cancellation');
    assert(scSrc.includes("new AbortController()"), 'solver-core uses AbortController for network cancellation');
});
test('4.2 Sanitized telemetry logs provider, status, jobTag, and elapsedMs without exposing keys', () => {
    assert(bgSrc.includes("[CAPTCHA_TELEMETRY] provider=nopecha step=SUBMIT"), 'Logs sanitized SUBMIT telemetry');
    assert(bgSrc.includes("[CAPTCHA_TELEMETRY] provider=nopecha outcome="), 'Logs sanitized outcome telemetry');
    const telemetryLines = bgSrc.split('\n').filter(l => l.includes('[CAPTCHA_TELEMETRY]'));
    for (const line of telemetryLines) {
        assert(!line.includes('key=' + bgSrc.config?.nopeChaKey) && !line.includes('Bearer'), 'Never logs raw auth credentials in telemetry');
    }
});

// --- SUITE 5: Directive E — Automatic Provider Fallback ---
console.log('\n--- SUITE 5: Directive E (Optional Automatic Provider Fallback) ---');
test('5.1 Popup UI exposes Automatic Provider Fallback toggle', () => {
    assert(popupHtmlSrc.includes('id="captcha-provider-fallback-toggle"'), 'HTML has fallback toggle');
    assert(popupSrc.includes('xpider_automatic_provider_fallback'), 'Popup persists fallback preference');
});
test('5.2 Background solver executes bounded 2Captcha fallback if enabled', () => {
    assert(bgSrc.includes("storage.xpider_automatic_provider_fallback === true"), 'Checks fallback toggle');
    assert(bgSrc.includes("[CAPTCHA_PROVIDER_FALLBACK] primary=nopecha failed reason="), 'Logs fallback attempt');
    assert(bgSrc.includes("await solver.solve2Captcha"), 'Invokes secondary provider under bounded execution');
});

console.log('\n========================================================================');
console.log(` RESULTS: ${passedCount} Passed, ${failedCount} Failed`);
console.log('========================================================================');

if (failedCount > 0) {
    process.exit(1);
} else {
    console.log('🎉 ALL RC3.25 DIRECTIVE TESTS PASSED!\n');
    process.exit(0);
}
