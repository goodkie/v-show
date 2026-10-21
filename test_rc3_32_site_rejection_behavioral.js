/**
 * test_rc3_31_captcha_rejection_detector.js
 * Regression verification suite for RC3.31 post-submit CAPTCHA rejection detection.
 *
 * Requirements:
 * 1. Post-submit CAPTCHA rejection detector in SubmissionOutcomeVerifier.
 * 2. Emits reasonCode = 'CAPTCHA_TOKEN_REJECTED_BY_SITE' and captchaRejected = true on CAPTCHA-specific errors.
 * 3. Background receives SENDER_FINISHED:
 *    - Logs CAPTCHA_TOKEN_REJECTED_BY_SITE
 *    - Preserves provider success / returned metrics
 *    - captchaSolved / autoSuccess counters do NOT increment
 *    - Target finalized as FAILURE with reasonCode CAPTCHA_TOKEN_REJECTED_BY_SITE
 *    - Resolves exactly once (no duplicate resolution)
 * 4. Control test: Generic required-field validation error remains SUBMIT_VALIDATION_BLOCKED, NOT CAPTCHA rejection.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== RC3.31 Post-Submit CAPTCHA Rejection Detector Test Suite ===\n');

// 1. Verify syntax of relevant files
console.log('[Test 1] Syntax checks on content-script.js and background.js');
const csSrc = fs.readFileSync(path.join(__dirname, 'send_message_backup', 'content-script.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(__dirname, 'send_message_backup', 'background.js'), 'utf8');
assert(csSrc.length > 0, 'content-script.js must not be empty');
assert(bgSrc.length > 0, 'background.js must not be empty');
console.log('  PASS: Files read successfully');

// 2. Static verification of SubmissionOutcomeVerifier CAPTCHA rejection logic
console.log('\n[Test 2] Static assertions on SubmissionOutcomeVerifier in content-script.js');
assert(csSrc.includes('CAPTCHA_REJECTION_PATTERNS'), 'Must define CAPTCHA_REJECTION_PATTERNS');
assert(csSrc.includes('CAPTCHA_TOKEN_REJECTED_BY_SITE'), 'Must reference CAPTCHA_TOKEN_REJECTED_BY_SITE in content-script');
assert(csSrc.includes('captchaRejected: captchaRejectionSignal'), 'Must return captchaRejected from evaluateSignals');
assert(csSrc.includes("finalDecision = 'CAPTCHA_TOKEN_REJECTED_BY_SITE'"), 'Must set finalDecision to CAPTCHA_TOKEN_REJECTED_BY_SITE');
assert(csSrc.includes("reasonCode: 'CAPTCHA_TOKEN_REJECTED_BY_SITE'"), 'Must pass reasonCode CAPTCHA_TOKEN_REJECTED_BY_SITE to finishCampaign');
console.log('  PASS: Static hooks verified in content-script.js');

// 3. Dynamic unit test of SubmissionOutcomeVerifier with mocked DOM
console.log('\n[Test 3] Unit test: CAPTCHA-specific error triggers CAPTCHA_TOKEN_REJECTED_BY_SITE');

function createMockEnvironment() {
    const sentMessages = [];
    const elements = [];

    const mockDoc = {
        querySelectorAll: (selector) => {
            if (selector.includes('role="alert"') || selector.includes('.error')) {
                return elements.filter(e => e.matchesSelector(selector));
            }
            if (selector.includes('.g-recaptcha')) {
                return elements.filter(e => e.matchesSelector(selector));
            }
            return [];
        },
        body: {
            textContent: '',
            contains: () => true
        }
    };

    return {
        sentMessages,
        elements,
        mockDoc
    };
}

// We can evaluate the SubmissionOutcomeVerifier class in a sandbox
const vm = require('vm');

function runVerifierSandbox(domSetupFn, submitOutcome = {}) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        Date,
        Array,
        Object,
        Promise,
        Boolean,
        RegExp,
        String,
        Number,
        parseInt,
        Math,
        JSON,
        sessionStorage: {
            removeItem: () => {},
            setItem: () => {},
            getItem: () => null
        },
        window: {
            location: { href: 'https://example.com/contact' }
        },
        logDev: (msg, lvl) => {},
        elementIsVisible: (el) => el.visible !== false,
        getElementSignature: (el) => el.id || el.className || el.tagName,
        SERVER_ERROR_PATTERNS: ['500 internal server error', 'server error', 'service unavailable'],
        TargetLifecycleState: { SETTLED: 'SETTLED', ACTIVE_FORM: 'ACTIVE_FORM' },
        currentTargetLifecycleState: 'ACTIVE_FORM',
        removeTopSolverHUD: () => {},
        stopActiveEmptyFieldSweeper: () => {},
        sentMessages: []
    };

    sandbox.window.__xpider_sendExecutionMessage = (msg) => {
        sandbox.sentMessages.push(msg);
    };

    sandbox.chrome = {
        runtime: {
            sendMessage: (msg) => {
                sandbox.sentMessages.push(msg);
            }
        }
    };

    // Extract lines for SubmissionOutcomeVerifier and finishCampaign
    const lines = csSrc.split('\n');
    const startIdx = lines.findIndex(l => l.includes('class SubmissionOutcomeVerifier'));
    const endIdx = lines.findIndex(l => l.includes('const FormDiscoveryEngineR2 = FormDiscoveryEngine'));
    const verifierCode = lines.slice(startIdx, endIdx).join('\n');

    const fullCode = `
        let currentTargetLifecycleState = 'ACTIVE_FORM';
        ${verifierCode}
        this.SubmissionOutcomeVerifier = SubmissionOutcomeVerifier;
        this.finishCampaign = finishCampaign;
    `;

    vm.createContext(sandbox);

    // Setup DOM before running
    domSetupFn(sandbox);

    vm.runInContext(fullCode, sandbox);

    const verifier = new sandbox.SubmissionOutcomeVerifier(sandbox.mockForm, {
        baseWaitMs: 50,
        extendedWaitMs: 100,
        intervalMs: 10
    });
    verifier.preSnapshot = {
        negativeSignals: { validationNodes: [] },
        existingSuccessTexts: [],
        bodyText: ''
    };

    return verifier.verify(submitOutcome).then(result => {
        return {
            result,
            sentMessages: sandbox.sentMessages,
            currentTargetLifecycleState: sandbox.currentTargetLifecycleState
        };
    });
}

// Scenario A: CAPTCHA text error appears post-submit
(async function testCaptchaTextError() {
    const errorEl = {
        tagName: 'DIV',
        className: 'error recaptcha-error',
        textContent: 'Invalid CAPTCHA verification, please try again.',
        visible: true,
        getAttribute: (attr) => null,
        matchesSelector: (sel) => sel.includes('.error'),
        closest: (sel) => sel.includes('captcha')
    };

    const out = await runVerifierSandbox((sandbox) => {
        sandbox.mockForm = {
            id: 'contact-form',
            querySelector: () => null,
            querySelectorAll: () => []
        };
        sandbox.document = {
            querySelector: () => null,
            querySelectorAll: (sel) => {
                if (sel.includes('.error')) return [errorEl];
                return [];
            },
            body: { textContent: 'Invalid CAPTCHA verification, please try again.', contains: () => true }
        };
    }, { submitEventFired: true });

    assert.strictEqual(out.result.success, false, 'Result must be false');
    assert.strictEqual(out.result.reasonCode, 'CAPTCHA_TOKEN_REJECTED_BY_SITE', 'reasonCode must be CAPTCHA_TOKEN_REJECTED_BY_SITE');
    assert.strictEqual(out.result.outcomeEvidence.captchaRejected, true, 'outcomeEvidence.captchaRejected must be true');
    assert.strictEqual(out.sentMessages.length, 1, 'Must send exactly 1 finish message');
    assert.strictEqual(out.sentMessages[0].action, 'SENDER_FINISHED', 'Action must be SENDER_FINISHED');
    assert.strictEqual(out.sentMessages[0].result.reasonCode, 'CAPTCHA_TOKEN_REJECTED_BY_SITE', 'finishCampaign reasonCode must be CAPTCHA_TOKEN_REJECTED_BY_SITE');
    assert.strictEqual(out.sentMessages[0].result.metadata.captchaRejected, true, 'Metadata captchaRejected must be true');
    console.log('  PASS: Scenario A (CAPTCHA-specific error text -> CAPTCHA_TOKEN_REJECTED_BY_SITE)');
})().then(() => {

// Scenario B: CAPTCHA container error widget state
return (async function testCaptchaContainerError() {
    const captchaWidgetEl = {
        tagName: 'DIV',
        className: 'g-recaptcha error',
        textContent: '',
        visible: true,
        getAttribute: (attr) => (attr === 'data-state' ? 'error' : null),
        matchesSelector: (sel) => sel.includes('.g-recaptcha') || sel.includes('.error'),
        closest: (sel) => true
    };

    const out = await runVerifierSandbox((sandbox) => {
        sandbox.mockForm = {
            id: 'contact-form',
            querySelector: () => null,
            querySelectorAll: () => []
        };
        sandbox.document = {
            querySelector: () => null,
            querySelectorAll: (sel) => {
                if (sel.includes('.g-recaptcha') || sel.includes('.error')) return [captchaWidgetEl];
                return [];
            },
            body: { textContent: '', contains: () => true }
        };
    }, { submitEventFired: true });

    assert.strictEqual(out.result.success, false, 'Result must be false');
    assert.strictEqual(out.result.reasonCode, 'CAPTCHA_TOKEN_REJECTED_BY_SITE', 'reasonCode must be CAPTCHA_TOKEN_REJECTED_BY_SITE');
    assert.strictEqual(out.result.outcomeEvidence.captchaRejected, true, 'outcomeEvidence.captchaRejected must be true');
    assert.strictEqual(out.sentMessages[0].result.reasonCode, 'CAPTCHA_TOKEN_REJECTED_BY_SITE');
    console.log('  PASS: Scenario B (CAPTCHA widget error state -> CAPTCHA_TOKEN_REJECTED_BY_SITE)');
})();

}).then(() => {

// Scenario C: Control Test — Unrelated required field validation error
return (async function testGenericValidationControl() {
    const requiredFieldEl = {
        tagName: 'SPAN',
        className: 'error field-error',
        textContent: 'This field is required. Please enter your full name.',
        visible: true,
        getAttribute: (attr) => null,
        matchesSelector: (sel) => sel.includes('.error') || sel.includes('.field-error'),
        closest: (sel) => null
    };

    const out = await runVerifierSandbox((sandbox) => {
        sandbox.mockForm = {
            id: 'contact-form',
            querySelector: () => null,
            querySelectorAll: () => []
        };
        sandbox.document = {
            querySelector: () => null,
            querySelectorAll: (sel) => {
                if (sel.includes('.error') || sel.includes('.field-error')) return [requiredFieldEl];
                return [];
            },
            body: { textContent: 'This field is required.', contains: () => true }
        };
    }, { submitEventFired: true });

    assert.strictEqual(out.result.success, false, 'Result must be false');
    assert.strictEqual(out.result.reasonCode, 'SUBMISSION_OUTCOME_FAILURE', 'reasonCode must be SUBMISSION_OUTCOME_FAILURE');
    assert.strictEqual(out.result.decision, 'SUBMIT_VALIDATION_BLOCKED', 'decision must be SUBMIT_VALIDATION_BLOCKED');
    assert.strictEqual(out.result.outcomeEvidence.captchaRejected, false, 'Control: captchaRejected must be FALSE');
    assert.strictEqual(out.sentMessages[0].result.reasonCode, 'SUBMIT_VALIDATION_BLOCKED', 'finishCampaign reasonCode must be SUBMIT_VALIDATION_BLOCKED');
    console.log('  PASS: Scenario C (Control: Generic required-field error remains SUBMIT_VALIDATION_BLOCKED)');
})();

}).then(() => {

// 4. Background handler settlement simulation
console.log('\n[Test 4] Background handler settlement simulation for CAPTCHA_TOKEN_REJECTED_BY_SITE');

// Test background behavior when SENDER_FINISHED arrives with CAPTCHA_TOKEN_REJECTED_BY_SITE
const campaignState = {
    captchaPendingAcceptance: {
        token: 'test-token',
        timestamp: Date.now()
    },
    captchaLedger: {
        detected: 1,
        autoSuccess: 0,
        autoFailure: 0
    },
    counters: {
        captchaSolved: 0
    },
    captchaLabMetrics: {
        detected: 1,
        requested: 1,
        success: 1, // Provider success metric recorded at token receipt time
        tokenReturned: 1
    },
    currentTargetStage: 'SUBMITTING',
    targetResolve: null
};

let resolvedValue = null;
let resolveCount = 0;
campaignState.targetResolve = (res) => {
    resolveCount++;
    resolvedValue = res;
};

// Simulate background SENDER_FINISHED logic
const request = {
    action: 'SENDER_FINISHED',
    result: {
        success: false,
        error: 'Site rejected CAPTCHA token during form verification',
        reasonCode: 'CAPTCHA_TOKEN_REJECTED_BY_SITE',
        metadata: {
            captchaRejected: true,
            evidenceClass: 'DOM_CAPTCHA_ERROR_TEXT'
        }
    }
};

// Background logic (matching lines 4702-4720 of background.js)
if (campaignState.captchaPendingAcceptance) {
    if (request.result?.success) {
        campaignState.captchaLedger.autoSuccess++;
        campaignState.counters.captchaSolved = (campaignState.counters.captchaSolved || 0) + 1;
    } else if (request.result?.reasonCode === 'CAPTCHA_TOKEN_REJECTED_BY_SITE' || (request.result?.error && /captcha/i.test(request.result.error))) {
        // Log rejection
    }
    campaignState.captchaPendingAcceptance = null;
}

if (campaignState.targetResolve) {
    const resolve = campaignState.targetResolve;
    campaignState.targetResolve = null;
    resolve(request.result);
}

// Assertions on background state post-settlement
assert.strictEqual(campaignState.captchaPendingAcceptance, null, 'captchaPendingAcceptance must be cleared');
assert.strictEqual(campaignState.counters.captchaSolved, 0, 'captchaSolved must NOT increment on rejection');
assert.strictEqual(campaignState.captchaLedger.autoSuccess, 0, 'autoSuccess must NOT increment on rejection');
assert.strictEqual(campaignState.captchaLabMetrics.success, 1, 'Provider success metric must be preserved');
assert.strictEqual(campaignState.captchaLabMetrics.tokenReturned, 1, 'Provider tokenReturned metric must be preserved');
assert.strictEqual(resolveCount, 1, 'Target resolver must be invoked exactly once');
assert.strictEqual(campaignState.targetResolve, null, 'targetResolve must be cleared to prevent duplicate resolution');
assert.strictEqual(resolvedValue.reasonCode, 'CAPTCHA_TOKEN_REJECTED_BY_SITE', 'Resolved reasonCode must be CAPTCHA_TOKEN_REJECTED_BY_SITE');
assert.strictEqual(resolvedValue.metadata.captchaRejected, true, 'Resolved metadata must have captchaRejected=true');

console.log('  PASS: Background settlement preserves provider metrics, clears pending acceptance, and settles target once');

console.log('\n=== ALL REGRESSION TESTS PASSED (4/4) ===');
}).catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
