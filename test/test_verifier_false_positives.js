/**
 * test/test_verifier_false_positives.js
 *
 * Deterministic Regression Test Suite for ChatGPT Directive #6378917786:
 * Verify SubmissionOutcomeVerifier against False Positives:
 * - Generic /post and HTTP 200 alone must NOT confer SUCCESS_CONFIRMED.
 * - HTTP 4xx / 5xx transport or body responses must NOT confer SUCCESS_CONFIRMED.
 * - Validation error JSON payloads must NOT confer SUCCESS_CONFIRMED.
 * - Missing expected fields / empty JSON echoes must NOT confer SUCCESS_CONFIRMED.
 * - SPA error responses must NOT confer SUCCESS_CONFIRMED.
 * - Genuine echo with non-empty filled fields or explicit success flag MUST confer SUCCESS_CONFIRMED.
 */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

console.log('=== RUNNING SUBMISSION OUTCOME VERIFIER FALSE-POSITIVE REGRESSION TEST ===\n');

// Extract SubmissionOutcomeVerifier and helper constants from content-script.js
const contentScriptSource = fs.readFileSync('extension/content-script.js', 'utf8');

// Isolate SubmissionOutcomeVerifier class and required dependencies
const sandbox = {
    console,
    Date,
    Set,
    Array,
    Object,
    JSON,
    Boolean,
    RegExp,
    logDev: () => {},
    elementIsVisible: () => true,
    getElementSignature: (el) => el.id || el.className || 'elem',
    SERVER_ERROR_PATTERNS: [
        'internal server error',
        '500 internal server error',
        'server error',
        'service unavailable',
        '503 service unavailable',
        'bad gateway',
        '502 bad gateway',
        'error 500',
        'database error',
        'fatal error'
    ],
    CAPTCHA_REJECTION_PATTERNS: [
        /captcha.*incorrect/i,
        /captcha.*failed/i,
        /invalid.*captcha/i
    ],
    document: null,
    window: null
};

// Create a mock DOM environment generator
function createMockEnvironment({
    currentUrl = 'https://example.com/contact',
    initialUrl = 'https://example.com/contact',
    bodyText = '',
    title = 'Page Title',
    formEl = null
} = {}) {
    const doc = {
        title,
        body: {
            innerText: bodyText,
            textContent: bodyText,
            contains: (el) => el === formEl
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    const win = {
        location: {
            href: currentUrl
        },
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    return { doc, win };
}

// Extract the class from contentScriptSource
const classMatch = contentScriptSource.match(/class SubmissionOutcomeVerifier[\s\S]*?\n    \}/);
if (!classMatch) {
    throw new Error('Failed to find class SubmissionOutcomeVerifier in extension/content-script.js');
}

const scriptToRun = classMatch[0] + '\n; globalThis.SubmissionOutcomeVerifier = SubmissionOutcomeVerifier;';
vm.runInNewContext(scriptToRun, sandbox);
const SubmissionOutcomeVerifier = sandbox.SubmissionOutcomeVerifier;

let passedTests = 0;
let totalTests = 0;

function runCase(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`[PASS] Case ${totalTests}: ${name}`);
        passedTests++;
    } catch (e) {
        console.error(`[FAIL] Case ${totalTests}: ${name}\n  Error: ${e.message}`);
        throw e;
    }
}

// -------------------------------------------------------------
// Case 1: Generic /post navigation with HTTP 200 alone and no success keywords
// -------------------------------------------------------------
runCase('Generic /post URL change with HTTP 200 alone must NOT confer isDecisiveSuccess', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/post',
        initialUrl: 'https://example.com/contact',
        bodyText: '<html><body><h1>Processing Request</h1><p>Please wait...</p></body></html>',
        title: 'Processing Request'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 200 });
    assert.strictEqual(signals.isSuccessUrl, false, 'Generic /post must NOT be recognized as isSuccessUrl');
    assert.strictEqual(signals.isJsonFormReceipt, false, 'HTML body must NOT be recognized as JSON receipt');
    assert.strictEqual(signals.isDecisiveSuccess, false, 'Generic /post + HTTP 200 must NOT confer isDecisiveSuccess');
});

// -------------------------------------------------------------
// Case 2: HTTP 4xx transport failure (e.g. 400 Bad Request, 422 Unprocessable)
// -------------------------------------------------------------
runCase('HTTP 4xx transport rejection must assert failure and block decisive success', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/api/contact',
        initialUrl: 'https://example.com/contact',
        bodyText: JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'Missing fields' }),
        title: '400 Bad Request'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 400 });
    assert.strictEqual(signals.actualTransportFailure, true, 'networkStatus 400 must trigger actualTransportFailure');
    assert.strictEqual(signals.isJsonFormReceipt, false, 'HTTP 4xx must NOT be accepted as JSON form receipt');
    assert.strictEqual(signals.isDecisiveSuccess, false, 'HTTP 4xx must NOT confer isDecisiveSuccess');
    assert.strictEqual(signals.isDecisiveFailure, true, 'HTTP 4xx must be isDecisiveFailure');
});

// -------------------------------------------------------------
// Case 3: HTTP 5xx transport failure (e.g. 500 Internal Server Error)
// -------------------------------------------------------------
runCase('HTTP 5xx transport error must assert failure and block decisive success', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/api/contact',
        initialUrl: 'https://example.com/contact',
        bodyText: JSON.stringify({ status: 500, error: 'Internal Server Error' }),
        title: '500 Server Error'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 500 });
    assert.strictEqual(signals.actualTransportFailure, true, 'networkStatus 500 must trigger actualTransportFailure');
    assert.strictEqual(signals.serverErrorFound, true, 'serverErrorFound must be true on 5xx');
    assert.strictEqual(signals.isDecisiveSuccess, false, 'HTTP 5xx must NOT confer isDecisiveSuccess');
    assert.strictEqual(signals.isDecisiveFailure, true, 'HTTP 5xx must be isDecisiveFailure');
});

// -------------------------------------------------------------
// Case 4: JSON Validation Error payload with HTTP 200 (SPA validation fail)
// -------------------------------------------------------------
runCase('JSON validation error payload with HTTP 200 must NOT confer isDecisiveSuccess', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/api/submit',
        initialUrl: 'https://example.com/contact',
        bodyText: JSON.stringify({
            success: false,
            error: 'Validation failed: phone format is invalid',
            errors: ['Invalid phone format']
        }),
        title: 'Form Submission'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 200 });
    assert.strictEqual(signals.isJsonFormReceipt, false, 'Validation error JSON must NOT be accepted as success receipt');
    assert.strictEqual(signals.newErrorsFound, true, 'Validation error JSON must flag newErrorsFound');
    assert.strictEqual(signals.isDecisiveSuccess, false, 'Validation error JSON must NOT confer isDecisiveSuccess');
    assert.strictEqual(signals.isDecisiveFailure, true, 'Validation error JSON must trigger isDecisiveFailure');
});

// -------------------------------------------------------------
// Case 5: Empty JSON / Missing expected fields
// -------------------------------------------------------------
runCase('Empty form echo { form: {} } without positive evidence must NOT confer isDecisiveSuccess', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/post',
        initialUrl: 'https://example.com/contact',
        bodyText: JSON.stringify({ form: {}, origin: '143.198.40.33' }),
        title: 'Echo Service'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 200 });
    assert.strictEqual(signals.isJsonFormReceipt, false, 'Empty form object must NOT be accepted as form receipt');
    assert.strictEqual(signals.isDecisiveSuccess, false, 'Empty form echo must NOT confer isDecisiveSuccess');
});

// -------------------------------------------------------------
// Case 6: SPA Error Response (e.g. status: "fail", CSRF mismatch)
// -------------------------------------------------------------
runCase('SPA error response (status: "fail") must flag error and block decisive success', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/contact/post',
        initialUrl: 'https://example.com/contact',
        bodyText: JSON.stringify({
            status: 'fail',
            message: 'CSRF token mismatch or expired'
        }),
        title: 'Contact Form'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 200 });
    assert.strictEqual(signals.isJsonFormReceipt, false, 'SPA fail status must NOT be accepted as success receipt');
    assert.strictEqual(signals.newErrorsFound, true, 'SPA fail status must set newErrorsFound');
    assert.strictEqual(signals.isDecisiveSuccess, false, 'SPA fail status must NOT confer isDecisiveSuccess');
    assert.strictEqual(signals.isDecisiveFailure, true, 'SPA fail status must trigger isDecisiveFailure');
});

// -------------------------------------------------------------
// Case 7: Genuine JSON Form Receipt (e.g. httpbin.org/post with filled form fields)
// -------------------------------------------------------------
runCase('Genuine JSON Form Receipt with filled form fields MUST confer isDecisiveSuccess', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://httpbin.org/post',
        initialUrl: 'https://httpbin.org/forms/post',
        bodyText: JSON.stringify({
            form: {
                comments: 'Inquiry regarding enterprise consultation.',
                custemail: 'alex@example.com',
                custname: 'Alex Mercer',
                custtel: '415-555-0199'
            },
            origin: '143.198.40.33',
            url: 'https://httpbin.org/post'
        }),
        title: 'httpbin.org'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://httpbin.org/forms/post', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 200 });
    assert.strictEqual(signals.isJsonFormReceipt, true, 'Genuine filled form echo MUST be recognized as isJsonFormReceipt');
    assert.strictEqual(signals.newErrorsFound, false, 'Zero errors in genuine echo');
    assert.strictEqual(signals.isDecisiveSuccess, true, 'Genuine filled form echo MUST confer isDecisiveSuccess');
    assert.strictEqual(signals.isDecisiveFailure, false, 'Zero failure in genuine echo');
});

// -------------------------------------------------------------
// Case 8: Explicit JSON Success Receipt (e.g. { success: true, leadId: 9876 })
// -------------------------------------------------------------
runCase('Explicit JSON success flag (success: true) MUST confer isDecisiveSuccess', () => {
    const { doc, win } = createMockEnvironment({
        currentUrl: 'https://example.com/api/leads',
        initialUrl: 'https://example.com/contact',
        bodyText: JSON.stringify({
            success: true,
            status: 'ok',
            leadId: 98765
        }),
        title: 'Lead Management'
    });
    sandbox.document = doc;
    sandbox.window = win;

    const verifier = new SubmissionOutcomeVerifier(null);
    verifier.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };

    const signals = verifier.evaluateSignals({ networkStatus: 200 });
    assert.strictEqual(signals.isJsonFormReceipt, true, 'Explicit success: true MUST be recognized as isJsonFormReceipt');
    assert.strictEqual(signals.isDecisiveSuccess, true, 'Explicit success MUST confer isDecisiveSuccess');
    assert.strictEqual(signals.isDecisiveFailure, false, 'Zero failure in explicit success');
});

console.log(`\n=== ALL ${passedTests}/${totalTests} FALSE-POSITIVE REGRESSION TESTS PASSED 100% ===`);
