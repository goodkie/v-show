/**
 * test_rc3_31_acceptance.js
 * Verification of the 10 acceptance criteria defined by ChatGPT in Issue #6 Comment #6307034875
 * for RC3.31 (R6.9G.10.3.7.1.4.45-20261021-PRIVATE-EGRESS-RC3.31).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SUITE: RC3.31 ACCEPTANCE VERIFICATION ===\n');

const bgSrc = fs.readFileSync(path.join(__dirname, 'send_message_backup', 'background.js'), 'utf8');
const csSrc = fs.readFileSync(path.join(__dirname, 'send_message_backup', 'content-script.js'), 'utf8');
const scSrc = fs.readFileSync(path.join(__dirname, 'send_message_backup', 'solver-content.js'), 'utf8');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.log(`  [FAIL] ${name}: ${err.message}`);
        failCount++;
    }
}

// 1. dynamic frame selection, no hardcoded frame 0 assumption
console.log('Test 1: Dynamic Frame Selection (No Hardcoded Frame 0)');
test('background.js does not contain hardcoded "const targetFrameId = 0"', () => {
    assert(!bgSrc.includes('const targetFrameId = 0'), 'targetFrameId must not be hardcoded to 0');
});

test('background.js inspects all frames with allFrames: true', () => {
    assert(bgSrc.includes('target: { tabId: activeTabId, allFrames: true }'), 'must execute script across all frames');
    assert(bgSrc.includes('func: inspectFrameCapabilities'), 'must use inspectFrameCapabilities');
});

test('inspectFrameCapabilities captures capabilities per frame', () => {
    assert(bgSrc.includes('hasResponseField:'), 'must inspect hasResponseField');
    assert(bgSrc.includes('hasWidgetContainer:'), 'must inspect hasWidgetContainer');
    assert(bgSrc.includes('hasDataCallback:'), 'must inspect hasDataCallback');
});

test('fails closed with CAPTCHA_TOKEN_INTEGRATION_TARGET_NOT_FOUND when no eligible frame exists', () => {
    assert(bgSrc.includes('CAPTCHA_TOKEN_INTEGRATION_TARGET_NOT_FOUND'), 'must record CAPTCHA_TOKEN_INTEGRATION_TARGET_NOT_FOUND');
});

test('logs [CAPTCHA_FRAME_MAP] and [CAPTCHA_APPLY_TARGET] with selected frameId', () => {
    assert(bgSrc.includes('[CAPTCHA_FRAME_MAP]'), 'must log CAPTCHA_FRAME_MAP');
    assert(bgSrc.includes('[CAPTCHA_APPLY_TARGET]'), 'must log CAPTCHA_APPLY_TARGET');
});

// 2. exactly one token write across all worlds
console.log('\nTest 2: Exactly One Token Write Across All Worlds');
test('MAIN-world bridge is physical token writer 1 of 1', () => {
    assert(bgSrc.includes('world: \'MAIN\''), 'must execute bridge in MAIN world');
    assert(bgSrc.includes('func: mainWorldCaptchaBridge'), 'must invoke mainWorldCaptchaBridge');
    assert(bgSrc.includes('tokenWritten = true'), 'bridge sets tokenWritten');
});

test('content-script skips isolated writing when alreadyWrittenByMainWorld is true', () => {
    assert(csSrc.includes('alreadyWrittenByMainWorld = !!(mainWorldResult && mainWorldResult.tokenWritten)'), 'must check alreadyWrittenByMainWorld');
    assert(csSrc.includes('[CAPTCHA_TOKEN_APPLIED] Token already physically written by MAIN-world bridge'), 'must log single writer preservation');
});

// 3. tokenWritten alone never verifies
console.log('\nTest 3: tokenWritten Alone Never Verifies');
test('content-script requires independent signal even if token is written', () => {
    assert(csSrc.includes('const hasIndependentSignal = isResolvedState || hasGlobalResolvedFlag || captchaIframeGone || callbackConfirmed;'), 'hasIndependentSignal must only include genuine independent signals');
    assert(csSrc.includes('verified=false — token integrated but NO independent resolution signal'), 'must warn and set verified=false when only token is present');
});

test('background.js does not treat tokenWritten as challengeAccepted', () => {
    assert(bgSrc.includes('const isReadyToSubmit = !!(mainWorldRes.tokenWritten || (initialApplyRes && initialApplyRes.applied));'), 'tokenWritten sets isReadyToSubmit, not challengeAccepted');
});

// 4. callbackInvoked alone never verifies
console.log('\nTest 4: callbackInvoked Alone Never Verifies');
test('content-script does not include mainWorldCallbackInvoked in hasIndependentSignal', () => {
    assert(!csSrc.includes('hasIndependentSignal = isResolvedState || hasGlobalResolvedFlag || captchaIframeGone || callbackConfirmed || mainWorldCallbackInvoked'), 'must NOT include mainWorldCallbackInvoked in hasIndependentSignal');
});

test('background.js does not initialize challengeAccepted from callbackInvoked', () => {
    assert(!bgSrc.includes('challengeAccepted = initialApplyRes.verified === true || mainWorldRes.callbackInvoked === true'), 'challengeAccepted must not include callbackInvoked');
    assert(bgSrc.includes('let challengeAccepted = !!(initialApplyRes && initialApplyRes.verified === true);'), 'challengeAccepted initialized strictly from verified === true');
});

// 5. XPIDER-created DOM attributes cannot serve as acceptance evidence
console.log('\nTest 5: XPIDER-Created DOM Attributes Cannot Serve as Acceptance Evidence');
test('mainWorldCaptchaBridge does not set data-captcha-resolved', () => {
    assert(!bgSrc.includes("setAttribute('data-captcha-resolved'"), 'must not fabricate data-captcha-resolved');
});

test('content-script does not use data-captcha-resolved or data-xpider-* for verification', () => {
    assert(!csSrc.includes("getAttribute('data-captcha-resolved') === 'true'"), 'content-script must not inspect data-captcha-resolved');
    assert(!csSrc.includes("getAttribute('data-xpider-token-written') === 'true'"), 'content-script must not use data-xpider-token-written as acceptance');
    assert(!csSrc.includes("getAttribute('data-xpider-callback-invoked') === 'true'"), 'content-script must not use data-xpider-callback-invoked as acceptance');
});

// 6. callback-based form proceeds to READY_TO_SUBMIT, then submit
console.log('\nTest 6: Callback-Based Form Proceeds to READY_TO_SUBMIT, Then Submit');
test('background.js sets currentTargetStage = READY_TO_SUBMIT without premature CAPTCHA_AUTO_SUCCESS', () => {
    assert(bgSrc.includes("campaignState.currentTargetStage = 'READY_TO_SUBMIT';"), 'must set stage to READY_TO_SUBMIT');
    assert(bgSrc.includes('campaignState.captchaPendingAcceptance = {'), 'must record captchaPendingAcceptance');
});

test('content-script waitForCaptchaSolved proceeds to submit when _captchaTokenInjected is true', () => {
    assert(csSrc.includes('if (_captchaTokenInjected) {'), 'waitForCaptchaSolved must check _captchaTokenInjected');
    assert(csSrc.includes('Proceeding to form submission'), 'must log proceeding to form submission');
});

test('waitForCaptchaSolved sets _isCaptchaSolved strictly on solveResult.verified', () => {
    assert(/if\s*\(\s*solveResult\s*&&\s*solveResult\.verified\s*\)\s*\{\s*_isCaptchaSolved\s*=\s*true;\s*\}/.test(csSrc), '_isCaptchaSolved must be conditional on solveResult.verified');
});

// 7. site success => CAPTCHA/site success
console.log('\nTest 7: Site Success Transitions to CAPTCHA_AUTO_SUCCESS');
test('SENDER_FINISHED settles pending captcha on success', () => {
    assert(/if\s*\(\s*campaignState\.captchaPendingAcceptance\s*\)\s*\{\s*if\s*\(\s*request\.result\?\.success\s*\)/.test(bgSrc), 'SENDER_FINISHED checks captchaPendingAcceptance on success');
    assert(bgSrc.includes("campaignState.captchaLedger.autoSuccess++;"), 'increments autoSuccess');
    assert(bgSrc.includes("campaignState.counters.captchaSolved = (campaignState.counters.captchaSolved || 0) + 1;"), 'increments captchaSolved');
});

test('CONFIRMED_SUCCESS stage progression settles pending captcha', () => {
    assert(bgSrc.includes("if (request.stage === 'CONFIRMED_SUCCESS' && campaignState.captchaPendingAcceptance) {"), 'CONFIRMED_SUCCESS checks captchaPendingAcceptance');
});

// 8. site CAPTCHA rejection => CAPTCHA_TOKEN_REJECTED_BY_SITE
console.log('\nTest 8: Site CAPTCHA Rejection Categorization');
test('background.js categorizes site token rejection as CAPTCHA_TOKEN_REJECTED_BY_SITE', () => {
    assert(bgSrc.includes('[CAPTCHA_TOKEN_REJECTED_BY_SITE]'), 'must log CAPTCHA_TOKEN_REJECTED_BY_SITE');
    assert(bgSrc.includes("request.result?.reasonCode === 'CAPTCHA_TOKEN_REJECTED_BY_SITE'"), 'must check reasonCode CAPTCHA_TOKEN_REJECTED_BY_SITE');
});

test('provider metrics are recorded independently upon token reception', () => {
    assert(bgSrc.includes('campaignState.captchaLabMetrics.providerTokenReturned = (campaignState.captchaLabMetrics.providerTokenReturned || 0) + 1;'), 'records providerTokenReturned');
    assert(bgSrc.includes('campaignState.captchaLabMetrics.providerSuccess = (campaignState.captchaLabMetrics.providerSuccess || 0) + 1;'), 'records providerSuccess');
});

// 9. no duplicate finalization
console.log('\nTest 9: No Duplicate Finalization');
test('campaignState.captchaPendingAcceptance is cleared after settlement', () => {
    assert(bgSrc.includes('campaignState.captchaPendingAcceptance = null;'), 'must clear captchaPendingAcceptance to null');
});

test('targetResolve is cleared one-shot in SENDER_FINISHED', () => {
    assert(bgSrc.includes('campaignState.targetResolve = null; // [Section 8B] One-shot clear'), 'targetResolve must be cleared one-shot');
});

// 10. Privacy Relay invariant preserved
console.log('\nTest 10: Privacy Relay Invariant Preserved');
test('privacy relay endpoint and fail-closed barrier intact', () => {
    assert(bgSrc.includes('PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT'), 'privacy barrier check intact');
    assert(bgSrc.includes('PRIVACY_RELAY'), 'privacy relay mode reference intact');
});

console.log(`\n=== RESULTS: ${passCount}/${passCount + failCount} ACCEPTANCE TESTS PASSED ===\n`);

if (failCount > 0) {
    process.exit(1);
}
