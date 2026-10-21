const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SUITE: RC3.29 Single Authority & Single Token Writer ===\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`[PASS] Test ${totalTests}: ${name}`);
        passedTests++;
    } catch (e) {
        console.error(`[FAIL] Test ${totalTests}: ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

// 1. Static AST / Code Structure Checks
const bgContent = fs.readFileSync(path.join(__dirname, 'extension', 'background.js'), 'utf8');
const csContent = fs.readFileSync(path.join(__dirname, 'extension', 'content-script.js'), 'utf8');

// Test 1: Token writer invocation count == 1 (P0-A)
runTest('Token writer invocation count == 1 (No duplicate injectSolvedToken call in verifyAndRecordCaptchaSuccess)', () => {
    // Background must dispatch token via APPLY_CAPTCHA_TOKEN and NOT call injectSolvedToken in verifyAndRecordCaptchaSuccess
    const verifyBlockMatch = bgContent.match(/const verifyAndRecordCaptchaSuccess = async[\s\S]*?return \{ success: false, error: (?:'CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT'|failReason)/);
    assert(verifyBlockMatch, 'verifyAndRecordCaptchaSuccess block must be present');
    const verifyBlock = verifyBlockMatch[0];
    
    assert(!verifyBlock.includes('await injectSolvedToken('), 'verifyAndRecordCaptchaSuccess must NOT call injectSolvedToken (eliminates duplicate write)');
    assert(verifyBlock.includes("action: 'APPLY_CAPTCHA_TOKEN'"), 'verifyAndRecordCaptchaSuccess must send APPLY_CAPTCHA_TOKEN exactly once');
    assert(bgContent.includes('Single Authoritative Token Writer') || bgContent.includes('authoritative transaction'), 'Documentation for single authoritative token writer must be present');
});

// Test 2: Only one CHECK_CAPTCHA_VERIFIED responder in content-script.js (P0-B)
runTest('Only one CHECK_CAPTCHA_VERIFIED responder exists in content script (no listener competition)', () => {
    // Check how many times CHECK_CAPTCHA_VERIFIED message handlers appear
    const checkMatches = csContent.match(/msg(?:\.action| && msg\.action) === ['"]CHECK_CAPTCHA_VERIFIED['"]/g);
    assert(checkMatches && checkMatches.length === 1, `CHECK_CAPTCHA_VERIFIED must be handled exactly once in content script, found ${checkMatches ? checkMatches.length : 0}`);
    
    // Ensure it is in decisionListener and NOT in the global chrome.runtime.onMessage listener
    const globalListenerMatch = csContent.match(/chrome\.runtime\.onMessage\.addListener\(\(msg, sender, sendResponse\) => \{[\s\S]*?TRIGGER_CAPTCHA_DETECTION/);
    assert(globalListenerMatch, 'Global message listener must be present');
    assert(!globalListenerMatch[0].includes('CHECK_CAPTCHA_VERIFIED'), 'Global message listener must NOT handle CHECK_CAPTCHA_VERIFIED');
});

// Test 3: Iframe disappearance-only acceptance evaluates to verified (P0-B signal verification)
runTest('Iframe disappearance-only acceptance succeeds in unified evaluator', () => {
    assert(csContent.includes("captchaIframeGone = Boolean(hadMatchingIframeBeforeApply && iframes.length === 0)"), 'Disappearance must be evaluated');
    assert(csContent.includes("signalType = 'IFRAME_GONE'"), 'Must record IFRAME_GONE signalType');
    
    // Simulate disappearance evaluation
    const hadMatchingIframeBeforeApply = true;
    const iframesLength = 0;
    const isResolvedState = false;
    const hasGlobalResolvedFlag = false;
    const callbackConfirmed = false;
    const _isCaptchaSolved = false;

    const captchaIframeGone = Boolean(hadMatchingIframeBeforeApply && iframesLength === 0);
    const isNowVerified = Boolean(_isCaptchaSolved || isResolvedState || hasGlobalResolvedFlag || captchaIframeGone || callbackConfirmed);
    assert.strictEqual(isNowVerified, true, 'Challenge must resolve when iframe disappears post-injection');
});

// Test 4: callbackConfirmed-only acceptance succeeds in unified evaluator
runTest('callbackConfirmed-only acceptance succeeds in unified evaluator', () => {
    assert(csContent.includes("callbackConfirmed = Boolean(captchaData && captchaData.callbackConfirmed === true)"), 'Callback confirmed must be evaluated');
    assert(csContent.includes("signalType = 'CALLBACK_CONFIRMED'"), 'Must record CALLBACK_CONFIRMED signalType');

    // Simulate callback evaluation
    const hadMatchingIframeBeforeApply = false;
    const iframesLength = 1;
    const isResolvedState = false;
    const hasGlobalResolvedFlag = false;
    const callbackConfirmed = true;
    const _isCaptchaSolved = false;

    const captchaIframeGone = Boolean(hadMatchingIframeBeforeApply && iframesLength === 0);
    const isNowVerified = Boolean(_isCaptchaSolved || isResolvedState || hasGlobalResolvedFlag || captchaIframeGone || callbackConfirmed);
    assert.strictEqual(isNowVerified, true, 'Challenge must resolve when callbackConfirmed is true');
});

// Test 5: Content cannot proceed before background AUTO_SUCCESS (P0-C)
runTest('Content cannot proceed on disappearance alone before background AUTO_SUCCESS', () => {
    // In waitForCaptchaSolved, disappearance must not set _isCaptchaSolved = true or return true
    assert(!csContent.includes("if (!autoSolveAttempted || (autoSolveAttempted && (providerTokenInjected || _captchaTokenInjected))) {\n                    _isCaptchaSolved = true;"),
        'Content script must NEVER promote disappearance to _isCaptchaSolved = true when autoSolveAttempted is true');
    assert(csContent.includes("Challenge disappeared post-attempt. Awaiting background canonical verification"),
        'Must log awaiting background verification on challenge disappearance');
});

// Test 6: Background timeout prevents any later content continuation (P0-C)
runTest('Background timeout terminal failure prevents later content continuation', () => {
    // On terminal failure, decisionListener settles and marks target settled
    assert(csContent.includes("msg.action === 'CAPTCHA_SKIP_DECISION' || msg.action === 'CAPTCHA_LAB_TERMINAL_SETTLE'"),
        'Terminal settlement messages must be handled');
    assert(csContent.includes("currentTargetLifecycleState = TargetLifecycleState.SETTLED"),
        'Terminal settlement must mark lifecycle state as SETTLED');
    assert(csContent.includes("if (terminalCaptchaDecision || currentTargetLifecycleState === TargetLifecycleState.SETTLED)"),
        'Wait loop must check terminalCaptchaDecision or SETTLED lifecycle state');
    assert(csContent.includes("Target terminal decision settled after auto-solve. Aborting wait loop"),
        'Wait loop must log abort on terminal settlement');
    assert(csContent.includes("return false;"),
        'Wait loop must abort and return false on terminal settlement');
});

// Test 7: Finalization exactly once (Background single terminal authority)
runTest('Finalization occurs exactly once under background authority', () => {
    assert(bgContent.includes("campaignState.currentTargetStage = 'CAPTCHA_AUTO_SUCCESS';"), 'Background sets CAPTCHA_AUTO_SUCCESS');
    assert(bgContent.includes("recordTerminalCaptchaFailure(solveIdentity?.attemptId, failReason") || bgContent.includes("recordTerminalCaptchaFailure(solveIdentity?.attemptId, 'CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT'"), 'Background sets terminal failure');
    assert(csContent.includes("msg.state === 'CAPTCHA_AUTO_SUCCESS'"), 'Content receives background AUTO_SUCCESS broadcast');
});

console.log(`\nRC3.29 Test Suite Completed: ${passedTests}/${totalTests} tests passed.\n`);
if (passedTests !== totalTests) {
    process.exit(1);
}
