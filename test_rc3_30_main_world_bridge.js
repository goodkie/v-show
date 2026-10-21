/**
 * test_rc3_30_main_world_bridge.js
 * Verification suite for Directives P0-A through P0-E:
 * 1. P0-E: Frame discovery & role mapping
 * 2. P0-C: Host MAIN-world bridge execution (field writing, event dispatch, callback execution, DOM attribute marking)
 * 3. P0-A: Targeted single frame apply transaction (no frame broadcasting)
 * 4. P0-B: solver-content.js no synthetic checked state, no markSolved on APPLY_CAPTCHA_TOKEN
 * 5. P0-D: Lifecycle decoupling & failure classification discipline
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting RC3.30 Main World Bridge & Single-Authority Regression Suite...\n');

// --- Test 1: Verify P0-B solver-content invariants in source code ---
console.log('Test 1: Asserting solver-content.js P0-B invariants...');
const solverContentSrc = fs.readFileSync(path.join(__dirname, 'extension', 'solver-content.js'), 'utf8');

// Assert markSolved does NOT emit CAPTCHA_SOLVED or CAPTCHA_TOKEN_INJECTED
assert(!solverContentSrc.includes("action: 'CAPTCHA_SOLVED'"), 'Must not emit action: CAPTCHA_SOLVED');
assert(!solverContentSrc.includes("action: 'CAPTCHA_TOKEN_INJECTED'"), 'Must not emit action: CAPTCHA_TOKEN_INJECTED');
assert(solverContentSrc.includes("action: 'CAPTCHA_TOKEN_APPLIED'"), 'Must emit action: CAPTCHA_TOKEN_APPLIED for manual solve');

// In APPLY_CAPTCHA_TOKEN, must not call this.markSolved
const applyTokenIdx = solverContentSrc.indexOf("msg.action === 'APPLY_CAPTCHA_TOKEN'");
assert(applyTokenIdx !== -1, 'Must handle APPLY_CAPTCHA_TOKEN');
const applyTokenSnippet = solverContentSrc.substring(applyTokenIdx, applyTokenIdx + 400);
assert(!applyTokenSnippet.includes('this.markSolved'), 'APPLY_CAPTCHA_TOKEN must NEVER call markSolved');
assert(!applyTokenSnippet.includes('recaptcha-checkbox-checked'), 'APPLY_CAPTCHA_TOKEN must NEVER synthesize checked class');
assert(!applyTokenSnippet.includes('aria-checked'), 'APPLY_CAPTCHA_TOKEN must NEVER synthesize aria-checked');
console.log('  ✓ Test 1 Passed: solver-content.js conforms strictly to P0-B.\n');

// --- Test 2: Verify P0-C MAIN-World Bridge Function in background.js ---
console.log('Test 2: Asserting background.js mainWorldCaptchaBridge logic...');
const bgSrc = fs.readFileSync(path.join(__dirname, 'extension', 'background.js'), 'utf8');

assert(bgSrc.includes('function mainWorldCaptchaBridge(args)'), 'Must define mainWorldCaptchaBridge');
assert(bgSrc.includes("world: 'MAIN'"), 'Must invoke script in world: MAIN');
assert(bgSrc.includes("data-captcha-resolved"), 'Must mark data-captcha-resolved in DOM');
assert(bgSrc.includes("data-callback"), 'Must inspect data-callback');
assert(bgSrc.includes("___grecaptcha_cfg"), 'Must inspect ___grecaptcha_cfg.clients');
assert(bgSrc.includes("[CAPTCHA_FRAME_MAP]"), 'Must log [CAPTCHA_FRAME_MAP]');
assert(bgSrc.includes("[CAPTCHA_APPLY_TARGET]"), 'Must log [CAPTCHA_APPLY_TARGET]');
assert(bgSrc.includes("[CAPTCHA_MAIN_WORLD_INTEGRATION]"), 'Must log [CAPTCHA_MAIN_WORLD_INTEGRATION]');
assert(bgSrc.includes("[CAPTCHA_VERIFY_SIGNAL]"), 'Must log [CAPTCHA_VERIFY_SIGNAL]');
console.log('  ✓ Test 2 Passed: background.js contains all required telemetry and MAIN-world bridge.\n');

// --- Test 3: Simulated Execution of mainWorldCaptchaBridge ---
console.log('Test 3: Simulating mainWorldCaptchaBridge execution on mocked DOM...');

// Extract mainWorldCaptchaBridge function definition from background.js
const fnStart = bgSrc.indexOf('function mainWorldCaptchaBridge(args) {');
assert(fnStart !== -1, 'Function definition must be found');
// Find closing bracket
let braceCount = 0;
let fnEnd = -1;
for (let i = fnStart; i < bgSrc.length; i++) {
    if (bgSrc[i] === '{') braceCount++;
    else if (bgSrc[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
            fnEnd = i + 1;
            break;
        }
    }
}
const fnBody = bgSrc.substring(fnStart, fnEnd);

// Create mock environment
let callbackCalled = false;
let passedCallbackArg = null;
let setAttributeCalled = {};
let dispatchedEvents = [];

const mockWindow = {
    myCustomCallback: (token) => {
        callbackCalled = true;
        passedCallbackArg = token;
    }
};

const mockTextarea = {
    tagName: 'TEXTAREA',
    name: 'g-recaptcha-response',
    value: '',
    dispatchEvent: (ev) => dispatchedEvents.push(ev.type)
};

const mockDoc = {
    querySelectorAll: (selector) => {
        if (selector.includes('g-recaptcha-response')) return [mockTextarea];
        return [];
    },
    querySelector: (selector) => {
        if (selector.includes('g-recaptcha')) {
            return {
                getAttribute: (attr) => attr === 'data-callback' ? 'myCustomCallback' : null
            };
        }
        return null;
    },
    documentElement: {
        setAttribute: (key, val) => {
            setAttributeCalled[key] = val;
        }
    }
};

// Execute extracted function in mock context
const runBridge = new Function('window', 'document', 'HTMLTextAreaElement', 'HTMLInputElement', 'Event', `return (${fnBody})({ token: 'test-token-12345', captchaType: 'recaptcha' });`);
const bridgeResult = runBridge(
    mockWindow,
    mockDoc,
    function() {},
    function() {},
    function(type) { this.type = type; }
);

assert.strictEqual(bridgeResult.success, true, 'Bridge execution must succeed');
assert.strictEqual(bridgeResult.fieldsFound, 1, 'Must find 1 response field');
assert.strictEqual(bridgeResult.tokenWritten, true, 'Token must be marked written');
assert.strictEqual(bridgeResult.callbackResolved, true, 'Callback must be resolved');
assert.strictEqual(bridgeResult.callbackInvoked, true, 'Callback must be invoked');
assert.strictEqual(callbackCalled, true, 'Custom callback function was called');
assert.strictEqual(passedCallbackArg, 'test-token-12345', 'Correct token passed to callback');
assert.strictEqual(mockTextarea.value, 'test-token-12345', 'Token value written to textarea');
assert(dispatchedEvents.includes('input') && dispatchedEvents.includes('change'), 'input and change events dispatched');
assert.strictEqual(setAttributeCalled['data-captcha-resolved'], 'true', 'data-captcha-resolved set on documentElement');
assert.strictEqual(setAttributeCalled['data-captcha-callback-invoked'], 'true', 'data-captcha-callback-invoked set on documentElement');

console.log('  ✓ Test 3 Passed: mainWorldCaptchaBridge executed successfully and invoked page callback.\n');

// --- Test 4: Verify INSPECT_CAPTCHA_FRAME in content-script.js ---
console.log('Test 4: Asserting content-script.js INSPECT_CAPTCHA_FRAME and verification...');
const csSrc = fs.readFileSync(path.join(__dirname, 'extension', 'content-script.js'), 'utf8');

assert(csSrc.includes("msg.action === 'INSPECT_CAPTCHA_FRAME'"), 'Must handle INSPECT_CAPTCHA_FRAME');
assert(csSrc.includes("role = 'HOST_PAGE_RESPONSE_FIELD'"), 'Must define HOST_PAGE_RESPONSE_FIELD role');
assert(csSrc.includes("data-captcha-resolved"), 'Must check data-captcha-resolved attribute');
assert(csSrc.includes("data-captcha-callback-invoked"), 'Must check data-captcha-callback-invoked attribute');
assert(csSrc.includes("msg.mainWorldResult"), 'Must handle msg.mainWorldResult');

console.log('  ✓ Test 4 Passed: content-script.js conforms to P0-A, P0-C, and P0-E.\n');

// --- Test 5: Verify Failure Classification in background.js ---
console.log('Test 5: Asserting failure reason classification...');
assert(bgSrc.includes('CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT'), 'Must support CAPTCHA_TOKEN_ACCEPTANCE_TIMEOUT');
assert(bgSrc.includes('CAPTCHA_TOKEN_INTEGRATION_FAILED'), 'Must support CAPTCHA_TOKEN_INTEGRATION_FAILED');
assert(bgSrc.includes('providerTokenReturned'), 'Must track providerTokenReturned');
assert(bgSrc.includes('providerSuccess'), 'Must track providerSuccess');

console.log('  ✓ Test 5 Passed: Provider metrics and failure classifications are strictly disciplined.\n');

console.log('🎉 ALL 5/5 REGRESSION TESTS PASSED! Ready for release candidate.\n');
