/**
 * test/test_extracted_rc3_47_verifier_regression.js
 *
 * Independent Positive and Negative Verifier Regression Test Suite
 * Executing against EXTRACTED RC3.47 Release Asset:
 * scratch/extracted_rc3_47/extension/content-script.js
 *
 * Requirements from Owner Audit Directive #6379341031:
 * - Independent positive and negative verifier regression from extracted RC3.47 release.
 * - Raw sanitized evidence showing ZERO JSON/HTTP 200 false positives.
 * - Negative tests: Generic /post, HTTP 4xx, HTTP 5xx, JSON validation errors, empty form echoes, SPA error responses, CAPTCHA rejections.
 * - Positive tests: Genuine form field echo, explicit success: true, thank-you URL navigation, success DOM message.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

console.log('=== INDEPENDENT POSITIVE & NEGATIVE VERIFIER REGRESSION SUITE (EXTRACTED RC3.47) ===\n');

const targetPath = path.resolve('scratch/extracted_rc3_47/extension/content-script.js');
if (!fs.existsSync(targetPath)) {
    console.error('Target file does not exist:', targetPath);
    process.exit(1);
}

const contentScriptSource = fs.readFileSync(targetPath, 'utf8');
const fileSha256 = crypto.createHash('sha256').update(contentScriptSource).digest('hex');
console.log(`Target Content Script Path: ${targetPath}`);
console.log(`Target Content Script Size: ${contentScriptSource.length} bytes`);
console.log(`Target Content Script SHA256: ${fileSha256}\n`);

// Setup sandbox environment for SubmissionOutcomeVerifier
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
    getElementSignature: (el) => el.id || (el.classList && el.classList.toString()) || el.tagName || 'elem',
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

// Simple DOM Element Mock
class MockElement {
    constructor({ tagName = 'div', id = '', className = '', text = '', attributes = {} } = {}) {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = className;
        this.textContent = text;
        this.innerText = text;
        this.attributes = { ...attributes };
        this.classList = {
            contains: (cls) => this.className.split(/\s+/).includes(cls),
            toString: () => this.className
        };
        this.children = [];
    }
    getAttribute(name) {
        return this.attributes[name] || null;
    }
    closest(selector) {
        return null;
    }
}

function createMockEnvironment({
    currentUrl = 'https://example.com/contact',
    initialUrl = 'https://example.com/contact',
    bodyText = '',
    title = 'Page Title',
    elements = [],
    formEl = null
} = {}) {
    const allElements = [...elements];

    const doc = {
        title,
        body: {
            innerText: bodyText,
            textContent: bodyText,
            contains: (el) => el === formEl || allElements.includes(el)
        },
        querySelectorAll: (selector) => {
            const matches = [];
            for (const el of allElements) {
                const clsList = el.className.split(/\s+/).filter(Boolean);
                const hasClsMatch = clsList.some(c => selector.includes('.' + c));
                const hasRoleMatch = selector.includes('[role=') && el.attributes.role;
                const hasTagMatch = selector.split(/,\s*/).some(s => s.toLowerCase() === el.tagName.toLowerCase());
                if (hasClsMatch || hasRoleMatch || hasTagMatch || selector.includes('*')) {
                    matches.push(el);
                }
            }
            return matches;
        },
        querySelector: (selector) => {
            return doc.querySelectorAll(selector)[0] || null;
        },
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

    return { doc, win, allElements };
}

// Extract SubmissionOutcomeVerifier class from extracted content script
const classMatch = contentScriptSource.match(/class SubmissionOutcomeVerifier[\s\S]*?\n    \}/);
if (!classMatch) {
    throw new Error('Failed to find class SubmissionOutcomeVerifier in extracted content-script.js');
}

const scriptToRun = classMatch[0] + '\n; globalThis.SubmissionOutcomeVerifier = SubmissionOutcomeVerifier;';
vm.runInNewContext(scriptToRun, sandbox);
const SubmissionOutcomeVerifier = sandbox.SubmissionOutcomeVerifier;

const testResults = [];
let passedCount = 0;
let failedCount = 0;

function executeTestCase({ id, category, name, setup, expectations }) {
    const testRecord = {
        id,
        category,
        name,
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        signalsEvaluated: null,
        checks: [],
        error: null
    };

    try {
        const env = setup();
        sandbox.document = env.doc;
        sandbox.window = env.win;

        const verifier = new SubmissionOutcomeVerifier(env.formEl || null);
        verifier.preSnapshot = env.preSnapshot || {
            url: env.initialUrl || env.win.location.href,
            existingSuccessTexts: [],
            negativeSignals: { serverErrorPhrases: new Set(), serverErrorNodes: [], validationNodes: [] }
        };

        const signals = verifier.evaluateSignals(env.params || {});
        testRecord.signalsEvaluated = {
            networkStatus: env.params?.networkStatus,
            url: env.win.location.href,
            isSuccessUrl: signals.isSuccessUrl,
            isJsonFormReceipt: signals.isJsonFormReceipt,
            newSuccessNodes: signals.newSuccessNodes,
            successVisibilityTransition: signals.successVisibilityTransition,
            newErrorsFound: signals.newErrorsFound,
            validationErrorsCount: signals.validationErrorsCount,
            serverErrorFound: signals.serverErrorFound,
            captchaRejected: signals.captchaRejected,
            actualTransportFailure: signals.actualTransportFailure,
            hasStrongPositive: signals.hasStrongPositive,
            isDecisiveSuccess: signals.isDecisiveSuccess,
            isDecisiveFailure: signals.isDecisiveFailure
        };

        for (const [key, expectedVal] of Object.entries(expectations)) {
            const actualVal = signals[key];
            const pass = actualVal === expectedVal;
            testRecord.checks.push({
                signal: key,
                expected: expectedVal,
                actual: actualVal,
                pass
            });
            assert.strictEqual(actualVal, expectedVal, `Check failed for ${key}: expected ${expectedVal}, got ${actualVal}`);
        }

        testRecord.status = 'PASS';
        passedCount++;
        console.log(`[PASS] Case ${id} [${category}]: ${name}`);
    } catch (err) {
        testRecord.status = 'FAIL';
        testRecord.error = err.message;
        failedCount++;
        console.error(`[FAIL] Case ${id} [${category}]: ${name}\n  -> Error: ${err.message}`);
    }

    testResults.push(testRecord);
}

// =========================================================================
// NEGATIVE TEST CASES (False-Positive Elimination)
// =========================================================================

// Case 1: Generic /post URL with HTTP 200 alone
executeTestCase({
    id: 'NEG-01',
    category: 'NEGATIVE_REJECTION',
    name: 'Generic /post URL change with HTTP 200 alone and loading body must NOT confer isDecisiveSuccess',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/post',
            initialUrl: 'https://example.com/contact',
            bodyText: '<html><body><h1>Processing Request</h1><p>Please wait while we connect...</p></body></html>',
            title: 'Processing Request'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isSuccessUrl: false,
        isJsonFormReceipt: false,
        isDecisiveSuccess: false,
        isDecisiveFailure: false
    }
});

// Case 2: HTTP 400 Bad Request
executeTestCase({
    id: 'NEG-02',
    category: 'NEGATIVE_REJECTION',
    name: 'HTTP 400 Bad Request status with error body must assert failure and block decisive success',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/api/contact',
            initialUrl: 'https://example.com/contact',
            bodyText: JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'Required fields missing' }),
            title: '400 Bad Request'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 400 };
        return env;
    },
    expectations: {
        actualTransportFailure: true,
        isJsonFormReceipt: false,
        isDecisiveSuccess: false,
        isDecisiveFailure: true
    }
});

// Case 3: HTTP 422 Unprocessable Entity
executeTestCase({
    id: 'NEG-03',
    category: 'NEGATIVE_REJECTION',
    name: 'HTTP 422 Unprocessable Entity must assert failure and block decisive success',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/api/contact',
            initialUrl: 'https://example.com/contact',
            bodyText: JSON.stringify({ error: 'Unprocessable Entity', validation_errors: ['Invalid phone format'] }),
            title: '422 Validation Error'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 422 };
        return env;
    },
    expectations: {
        actualTransportFailure: true,
        isJsonFormReceipt: false,
        isDecisiveSuccess: false,
        isDecisiveFailure: true
    }
});

// Case 4: HTTP 500 Internal Server Error (Transport status 500)
executeTestCase({
    id: 'NEG-04',
    category: 'NEGATIVE_REJECTION',
    name: 'HTTP 500 transport error must flag serverErrorFound and trigger decisive failure',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/contact',
            initialUrl: 'https://example.com/contact',
            bodyText: '<html><body><h1>500 Internal Server Error</h1><p>Database connection failed.</p></body></html>',
            title: '500 Server Error'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 500 };
        return env;
    },
    expectations: {
        actualTransportFailure: true,
        serverErrorFound: true,
        isDecisiveSuccess: false,
        isDecisiveFailure: true
    }
});

// Case 5: HTTP 503 Service Unavailable in DOM element
executeTestCase({
    id: 'NEG-05',
    category: 'NEGATIVE_REJECTION',
    name: 'HTTP 503 text pattern in DOM node must flag serverErrorFound and trigger decisive failure',
    setup: () => {
        const errNode = new MockElement({
            tagName: 'div',
            className: 'server-error',
            text: 'Error 503 service unavailable. Please retry later.'
        });
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/gateway/submit',
            initialUrl: 'https://example.com/contact',
            bodyText: 'Error 503 service unavailable. Please retry later.',
            title: '503 Service Unavailable',
            elements: [errNode]
        });
        env.preSnapshot = {
            url: 'https://example.com/contact',
            existingSuccessTexts: [],
            negativeSignals: { serverErrorPhrases: new Set(), serverErrorNodes: [] }
        };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        serverErrorFound: true,
        isDecisiveSuccess: false
    }
});

// Case 6: SPA Validation Error JSON with HTTP 200 (success: false)
executeTestCase({
    id: 'NEG-06',
    category: 'NEGATIVE_REJECTION',
    name: 'SPA JSON validation failure payload with HTTP 200 must flag newErrorsFound and reject success',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/api/v1/submit',
            initialUrl: 'https://example.com/contact',
            bodyText: JSON.stringify({
                success: false,
                error: 'Validation failed: phone format is invalid',
                errors: ['Please enter a valid phone number']
            }),
            title: 'Form API'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isJsonFormReceipt: false,
        newErrorsFound: true,
        isDecisiveSuccess: false,
        isDecisiveFailure: true
    }
});

// Case 7: Empty JSON Echo { form: {} } without positive evidence
executeTestCase({
    id: 'NEG-07',
    category: 'NEGATIVE_REJECTION',
    name: 'Empty form echo { form: {} } without positive submitted data must NOT confer decisive success',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://httpbin.org/post',
            initialUrl: 'https://httpbin.org/forms/post',
            bodyText: JSON.stringify({
                args: {},
                data: '',
                files: {},
                form: {},
                origin: '143.198.40.33',
                url: 'https://httpbin.org/post'
            }),
            title: 'httpbin post'
        });
        env.preSnapshot = { url: 'https://httpbin.org/forms/post', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isJsonFormReceipt: false,
        isDecisiveSuccess: false
    }
});

// Case 8: SPA Error Response (status: "fail", message: "CSRF token mismatch")
executeTestCase({
    id: 'NEG-08',
    category: 'NEGATIVE_REJECTION',
    name: 'SPA JSON status: "fail" payload must flag newErrorsFound and trigger decisive failure',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/api/post',
            initialUrl: 'https://example.com/contact',
            bodyText: JSON.stringify({
                status: 'fail',
                message: 'CSRF token mismatch or session expired'
            }),
            title: 'Contact API'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isJsonFormReceipt: false,
        newErrorsFound: true,
        isDecisiveSuccess: false,
        isDecisiveFailure: true
    }
});

// Case 9: CAPTCHA Rejection in DOM node
executeTestCase({
    id: 'NEG-09',
    category: 'NEGATIVE_REJECTION',
    name: 'CAPTCHA rejection error node in DOM must flag captchaRejected and trigger decisive failure',
    setup: () => {
        const captchaErrNode = new MockElement({
            tagName: 'div',
            className: 'error',
            text: 'Security verification failed: captcha was incorrect. Try again.',
            attributes: { role: 'alert' }
        });
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/contact',
            initialUrl: 'https://example.com/contact',
            bodyText: 'Security verification failed: captcha was incorrect. Try again.',
            title: 'Captcha Error',
            elements: [captchaErrNode]
        });
        env.preSnapshot = {
            url: 'https://example.com/contact',
            existingSuccessTexts: [],
            negativeSignals: { serverErrorPhrases: new Set(), serverErrorNodes: [], validationNodes: [] }
        };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        captchaRejected: true,
        isDecisiveSuccess: false,
        isDecisiveFailure: true
    }
});

// =========================================================================
// POSITIVE TEST CASES (Decisive Success Affirmations)
// =========================================================================

// Case 10: Genuine JSON Form Receipt (httpbin.org/post with filled form fields)
executeTestCase({
    id: 'POS-10',
    category: 'POSITIVE_AFFIRMATION',
    name: 'Genuine JSON form receipt with filled fields and origin IP MUST confer isDecisiveSuccess',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://httpbin.org/post',
            initialUrl: 'https://httpbin.org/forms/post',
            bodyText: JSON.stringify({
                args: {},
                data: '',
                files: {},
                form: {
                    comments: 'Automated consultation inquiry regarding cloud privacy relay.',
                    custemail: 'ops-lead@enterprise.com',
                    custname: 'Jordan Vance',
                    custtel: '415-555-0188'
                },
                headers: {
                    Host: 'httpbin.org',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                origin: '143.198.40.33',
                url: 'https://httpbin.org/post'
            }),
            title: 'httpbin.org'
        });
        env.preSnapshot = { url: 'https://httpbin.org/forms/post', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isJsonFormReceipt: true,
        newErrorsFound: false,
        serverErrorFound: false,
        hasStrongPositive: true,
        isDecisiveSuccess: true,
        isDecisiveFailure: false
    }
});

// Case 11: Explicit JSON Success Receipt (success: true, recordId)
executeTestCase({
    id: 'POS-11',
    category: 'POSITIVE_AFFIRMATION',
    name: 'Explicit success: true JSON payload MUST confer isDecisiveSuccess',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/api/v2/contact',
            initialUrl: 'https://example.com/contact',
            bodyText: JSON.stringify({
                success: true,
                status: 'ok',
                ticketId: 'TKT-992014',
                message: 'Your inquiry has been received.'
            }),
            title: 'Inquiry Submitted'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isJsonFormReceipt: true,
        hasStrongPositive: true,
        isDecisiveSuccess: true,
        isDecisiveFailure: false
    }
});

// Case 12: Success URL Keyword Navigation (/thank-you)
executeTestCase({
    id: 'POS-12',
    category: 'POSITIVE_AFFIRMATION',
    name: 'Navigation to /thank-you with positive URL change MUST confer isDecisiveSuccess',
    setup: () => {
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/contact/thank-you',
            initialUrl: 'https://example.com/contact',
            bodyText: 'Thank you for reaching out! We will contact you within 24 hours.',
            title: 'Thank You'
        });
        env.preSnapshot = { url: 'https://example.com/contact', existingSuccessTexts: [] };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        isSuccessUrl: true,
        hasStrongPositive: true,
        isDecisiveSuccess: true,
        isDecisiveFailure: false
    }
});

// Case 13: DOM Success Message Node Appearance (.message-success)
executeTestCase({
    id: 'POS-13',
    category: 'POSITIVE_AFFIRMATION',
    name: 'Appearance of .message-success element in DOM MUST confer isDecisiveSuccess',
    setup: () => {
        const successNode = new MockElement({
            tagName: 'div',
            className: 'message-success',
            text: 'Your message has been sent successfully. Thank you for your inquiry.'
        });
        const env = createMockEnvironment({
            currentUrl: 'https://example.com/contact',
            initialUrl: 'https://example.com/contact',
            bodyText: 'Your message has been sent successfully. Thank you for your inquiry.',
            title: 'Contact Us',
            elements: [successNode]
        });
        env.preSnapshot = {
            url: 'https://example.com/contact',
            existingSuccessTexts: ['Sign up successfully today for newsletter']
        };
        env.params = { networkStatus: 200 };
        return env;
    },
    expectations: {
        hasStrongPositive: true,
        isDecisiveSuccess: true,
        isDecisiveFailure: false
    }
});

const summary = {
    testSuite: 'INDEPENDENT_VERIFIER_REGRESSION_RC3.47',
    targetFile: targetPath,
    targetSha256: fileSha256,
    executedAt: new Date().toISOString(),
    totalTests: testResults.length,
    passedCount,
    failedCount,
    allPassed: failedCount === 0,
    results: testResults
};

const evidenceDir = path.resolve('evidence/verifier_false_positive_regression');
if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
}
const evidencePath = path.join(evidenceDir, 'verifier_regression_rc3_47_evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(summary, null, 2), 'utf8');

console.log(`\n=========================================================================`);
console.log(`TOTAL EXECUTED: ${summary.totalTests} | PASSED: ${summary.passedCount} | FAILED: ${summary.failedCount}`);
console.log(`EVIDENCE WRITTEN: ${evidencePath}`);
console.log(`ALL TESTS PASSED: ${summary.allPassed ? 'YES (100%)' : 'NO'}`);
console.log(`=========================================================================\n`);

if (!summary.allPassed) {
    process.exit(1);
}
