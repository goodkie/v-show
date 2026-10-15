/**
 * test_math_captcha_field_local.js
 * R6.9G.10.3.7.1.4.8 Section A: Math CAPTCHA must be field-local and exclusive.
 * Lightweight DOM stubs (no jsdom dependency).
 */
const assert = require('assert');
const Math_ = require('../extension/modules/math-captcha-solver.js');

const EQ = 'Please solve the equation: 7 + 5 = ? *';

function mkEl(o) {
    const el = Object.assign({
        tagName: 'INPUT', type: 'text', name: '', id: '', placeholder: '',
        labels: [], previousElementSibling: null, parentElement: null,
        getAttribute(k) { return this['_attr_' + k] || null; }
    }, o);
    return el;
}
function container(children, text) {
    const c = { tagName: 'DIV', textContent: text, querySelectorAll: () => children, closest: () => null };
    children.forEach(ch => { ch.parentElement = c; });
    return c;
}

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('  ✅ ' + name); }

// Shared multi-field container whose text includes the equation (the CAP-02 contamination vector)
const name = mkEl({ name: 'name', id: 'name', placeholder: 'John Doe' });
const email = mkEl({ type: 'email', name: 'email', id: 'email', placeholder: 'john@example.com' });
const math = mkEl({ name: 'captcha_solution', id: 'math-captcha-field', placeholder: 'Your answer', labels: [{ textContent: EQ }] });
container([name, email, math], 'Name Email ' + EQ);

console.log('>>> MathCaptchaSolver.solveField field-local classification');
t('name input never classified as math (even with equation in shared container)', () => assert.strictEqual(Math_.solveField(name, () => EQ), null));
t('email input never classified as math', () => assert.strictEqual(Math_.solveField(email, () => EQ), null));
t('type=tel never classified as math', () => assert.strictEqual(Math_.solveField(mkEl({ type: 'tel', name: 'phone' }), () => EQ), null));
t('textarea never classified as math', () => assert.strictEqual(Math_.solveField(mkEl({ tagName: 'TEXTAREA', name: 'message' }), () => EQ), null));
t('captcha_solution input with direct label equation => 12', () => assert.strictEqual(Math_.solveField(math), 12));
t('getContextFn (broad ancestor context) is NOT used to classify', () => {
    const generic = mkEl({ name: 'q1', id: 'q1' });
    container([generic, mkEl({ name: 'x' })], EQ);
    assert.strictEqual(Math_.solveField(generic, () => EQ), null);
});
t('single-input dedicated wrapper with equation => 12', () => {
    const only = mkEl({ name: 'answer', id: 'answer' });
    container([only], EQ);
    assert.strictEqual(Math_.solveField(only), 12);
});

console.log(`\nALL ${pass} FIELD-LOCAL MATH CHECKS PASSED`);
