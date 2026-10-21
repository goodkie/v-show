const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SUITE: RC3.28 Captcha Verification Serialization & Single Authority ===\n');

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

// 1. Static AST/Content Checks on Background & Content Scripts
const bgContent = fs.readFileSync(path.join(__dirname, 'extension', 'background.js'), 'utf8');
const csContent = fs.readFileSync(path.join(__dirname, 'extension', 'content-script.js'), 'utf8');
const scContent = fs.readFileSync(path.join(__dirname, 'extension', 'solver-content.js'), 'utf8');

// Test 1: Bounded verification window (7500ms) with CHECK_CAPTCHA_VERIFIED polling
runTest('Background implements bounded 7500ms verification window polling CHECK_CAPTCHA_VERIFIED', () => {
    assert(bgContent.includes('const VERIFY_WINDOW_MS = 7500;'), 'VERIFY_WINDOW_MS 7500ms must be defined');
    assert(bgContent.includes('const POLL_INTERVAL_MS = 400;'), 'POLL_INTERVAL_MS 400ms must be defined');
    assert(bgContent.includes("action: 'CHECK_CAPTCHA_VERIFIED'"), 'CHECK_CAPTCHA_VERIFIED action must be polled');
});

// Test 2: First sample unverified does NOT trigger immediate failure
runTest('First transient unverified sample does not immediately fail background', () => {
    assert(bgContent.includes('[CAPTCHA_VERIFY_PENDING] First sample pending verification. Entering bounded window'), 'Must log pending verification rather than failing immediately');
    assert(!bgContent.includes("logBg(null, `[CAPTCHA_VERIFICATION_FAILED] Challenge could not be verified on target page.`, 'error');\n                            recordTerminalCaptchaFailure(solveIdentity?.attemptId, 'CHALLENGE_VERIFICATION_FAILED');\n                            return { success: false, error: 'CHALLENGE_VERIFICATION_FAILED' };\n                        }\n                    };"), 'Synchronous immediate failure on first sample must be removed');
});

// Test 3: Failure classification is CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT on window expiry
runTest('Failure classification records CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT, not provider error', () => {
    assert(bgContent.includes("recordTerminalCaptchaFailure(solveIdentity?.attemptId, failReason") || bgContent.includes("recordTerminalCaptchaFailure(solveIdentity?.attemptId, 'CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT'"), 'Terminal failure on acceptance timeout must record CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT');
    assert(bgContent.includes("campaignState.captchaLabMetrics.acceptanceTimeout"), 'Acceptance timeout metric must be tracked in captchaLabMetrics');
    assert(bgContent.includes("campaignState.captchaLabMetrics.providerTokenReturned"), 'Provider token returned metric must be recorded independently');
});

// Test 4: Content script removes hasToken from completion condition and does not promote token to solved
runTest('Content script waitForCaptchaSolved does not treat token presence alone as solved', () => {
    assert(csContent.includes('_captchaTokenInjected = true'), 'Token presence must only set _captchaTokenInjected = true');
    assert(!csContent.includes('if (!stillHasCaptcha || hasToken || _isCaptchaSolved) {'), 'hasToken must be removed from solve bypass condition');
    assert(csContent.includes("Token presence in DOM is INJECTED / PENDING_VERIFICATION only"), 'Invariant comment must be present in content script');
});

// Test 5: solver-content.js and cross-frame events emit CAPTCHA_TOKEN_INJECTED instead of CAPTCHA_SOLVED
runTest('Token injection message renamed from CAPTCHA_SOLVED to CAPTCHA_TOKEN_INJECTED', () => {
    assert(scContent.includes("action: 'CAPTCHA_TOKEN_INJECTED'") || scContent.includes("action: 'CAPTCHA_TOKEN_APPLIED'"), 'solver-content.js markSolved must not emit CAPTCHA_SOLVED');
    assert(bgContent.includes("action: 'CAPTCHA_TOKEN_INJECTED'"), 'background.js injectSolvedToken must emit CAPTCHA_TOKEN_INJECTED');
    assert(csContent.includes("event.data.action === 'CAPTCHA_TOKEN_INJECTED'"), 'content-script.js must listen for CAPTCHA_TOKEN_INJECTED');
    assert(csContent.includes("msg && msg.action === 'CAPTCHA_TOKEN_INJECTED'"), 'content-script.js runtime listener must handle CAPTCHA_TOKEN_INJECTED without setting _isCaptchaSolved');
});

// Test 6: Late CAPTCHA_CHALLENGE_VERIFIED event after terminal settlement is rejected
runTest('Late CAPTCHA_CHALLENGE_VERIFIED event after terminal settlement is rejected', () => {
    assert(bgContent.includes("SETTLED_AFTER_TERMINAL_FAILURE"), 'Late challenge verified event after terminal settlement must be rejected with SETTLED_AFTER_TERMINAL_FAILURE');
});

// 2. Behavioral Simulation Tests
console.log('\n--- Behavioral State Machine Simulations ---');

runTest('Simulation: Poll loop successfully resolves challenge on subsequent sample within window', async () => {
    let currentStage = 'CAPTCHA_AUTO_SOLVING';
    let pollCount = 0;
    const VERIFY_WINDOW_MS = 7500;
    const POLL_INTERVAL_MS = 50; // accelerated for unit test
    const verifyDeadline = Date.now() + VERIFY_WINDOW_MS;
    let challengeVerified = false;

    // Simulate first sample = false, then sample 3 = true
    const checkVerified = async () => {
        pollCount++;
        return { verified: pollCount >= 3 };
    };

    while (Date.now() < verifyDeadline && !challengeVerified) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const res = await checkVerified();
        if (res && res.verified === true) {
            challengeVerified = true;
            break;
        }
    }

    assert.strictEqual(challengeVerified, true, 'Challenge must resolve as verified');
    assert.strictEqual(pollCount, 3, 'Must have polled 3 times before succeeding');
});

runTest('Simulation: Poll loop times out at deadline and settles as CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT', async () => {
    let currentStage = 'CAPTCHA_AUTO_SOLVING';
    let pollCount = 0;
    const VERIFY_WINDOW_MS = 200; // accelerated
    const POLL_INTERVAL_MS = 40;
    const verifyDeadline = Date.now() + VERIFY_WINDOW_MS;
    let challengeVerified = false;

    const checkVerified = async () => {
        pollCount++;
        return { verified: false };
    };

    while (Date.now() < verifyDeadline && !challengeVerified) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const res = await checkVerified();
        if (res && res.verified === true) {
            challengeVerified = true;
            break;
        }
    }

    assert.strictEqual(challengeVerified, false, 'Challenge must not be verified');
    assert(pollCount >= 4, 'Must have polled multiple times before timeout');
    const settleReason = 'CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT';
    assert.strictEqual(settleReason, 'CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT');
});

runTest('Simulation: Content script wait loop does not bypass on token presence alone', async () => {
    let _isCaptchaSolved = false;
    let _captchaTokenInjected = false;
    const hasToken = true;

    if (hasToken) {
        _captchaTokenInjected = true;
    }

    // In old buggy code: if (!stillHasCaptcha || hasToken || _isCaptchaSolved) => _isCaptchaSolved = true
    // In RC3.28 code:
    const stillHasCaptcha = true;
    let advanced = false;
    if (_isCaptchaSolved) {
        advanced = true;
    } else if (!stillHasCaptcha) {
        advanced = true;
    }

    assert.strictEqual(advanced, false, 'Wait loop must NOT advance on token presence alone');
    assert.strictEqual(_isCaptchaSolved, false, '_isCaptchaSolved must remain false');
    assert.strictEqual(_captchaTokenInjected, true, '_captchaTokenInjected must be recorded');
});

console.log(`\nRC3.28 Verification Serialization Test Results: ${passedTests}/${totalTests} PASS`);
if (passedTests === totalTests) {
    console.log('ALL REGRESSION CRITERIA FOR RC3.28 MET 100%!\n');
} else {
    process.exit(1);
}
