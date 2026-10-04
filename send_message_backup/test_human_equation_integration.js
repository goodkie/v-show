/**
 * test_human_equation_integration.js
 * End-to-end integration test for human equation quiz handling in:
 * 1. MathCaptchaSolver
 * 2. SmartFieldResolver
 * 3. FinalFormCompletionEngine
 */

const assert = require('assert');
const MathCaptchaSolver = require('./modules/math-captcha-solver.js');
const SmartFieldResolver = require('./modules/smart-field-resolver.js');
const FinalFormCompletionEngine = require('./modules/final-form-completion-engine.js');

console.log('======================================================================');
console.log(' [INTEGRATION TEST: Human Verification Equation Quiz Resolver]');
console.log('======================================================================\n');

const userQuizText = '6 + 1 = ?Please prove that you are human by solving the equation *';

// 1. MathCaptchaSolver direct resolution
const solved1 = MathCaptchaSolver.solveMathCaptcha(userQuizText);
assert.strictEqual(solved1, 7, 'MathCaptchaSolver must solve exact user quiz to 7');
console.log(`✅ 1. MathCaptchaSolver direct solve: "${userQuizText}" => ${solved1}`);

// 2. SmartFieldResolver integration
const resolver = new SmartFieldResolver();
const fieldCtx = {
    id: 'cfturnstile-field',
    name: 'human_verification',
    type: 'text',
    label: userQuizText,
    required: true
};
const res2 = resolver.resolve(fieldCtx, { name: 'Test User', email: 'test@example.com' });
assert.strictEqual(res2.action, 'fill', 'SmartFieldResolver action must be fill');
assert.strictEqual(res2.value, '7', 'SmartFieldResolver value must be "7"');
assert.strictEqual(res2.source, 'math_captcha_solver', 'SmartFieldResolver source must be math_captcha_solver');
console.log(`✅ 2. SmartFieldResolver resolved: action=${res2.action}, value=${res2.value}, source=${res2.source}`);

// 3. FinalFormCompletionEngine integration with mock DOM form
const mockInput = {
    tagName: 'INPUT',
    type: 'text',
    id: 'quiz',
    name: 'equation_quiz',
    value: '',
    required: true,
    labels: [{ textContent: userQuizText }],
    getAttribute: (attr) => attr === 'required' ? 'true' : null,
    dispatchEvent: () => true
};

const mockForm = {
    querySelectorAll: (selector) => {
        if (selector.includes('input')) return [mockInput];
        return [];
    }
};

const completionEngine = new FinalFormCompletionEngine({
    logger: () => {}
});

const classification = completionEngine.classifyControl(mockInput);
assert.strictEqual(classification.category, 'math_captcha', 'Classification category must be math_captcha');
assert.strictEqual(classification.value, '7', 'Classification value must be "7"');
console.log(`✅ 3. FinalFormCompletionEngine classified: category=${classification.category}, value=${classification.value}`);

completionEngine.run(mockForm, {}).then((auditResult) => {
    assert.strictEqual(mockInput.value, '7', 'mockInput value must be set to "7"');
    console.log(`✅ 4. FinalFormCompletionEngine executed: mockInput.value="${mockInput.value}"`);
    console.log('\n======================================================================');
    console.log(' ALL HUMAN VERIFICATION EQUATION INTEGRATION TESTS PASSED!');
    console.log('======================================================================\n');
}).catch((err) => {
    console.error('❌ FAIL:', err);
    process.exit(1);
});
