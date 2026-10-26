const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FinalFormCompletionEngine = require('../extension/modules/final-form-completion-engine.js');
const CheckboxResolverR2 = require('../extension/modules/checkbox-resolver-r2.js');
const SelectResolverR2 = require('../extension/modules/select-resolver-r2.js');

console.log('=== [TEST] AI REQUIRED FIELDS & CONSTRAINT COMPLETION ENGINE ===');

// -----------------------------------------------------------------------------
// Test Case 1: ai-required-fields.html with unknown required fields & constraints
// -----------------------------------------------------------------------------
console.log('\n--- Test 1: Full Constraint-Aware Required Field Completion ---');
const fixtureHtml = fs.readFileSync(path.resolve(__dirname, '../owner-extension-test-site/ai-required-fields.html'), 'utf8');
const dom = new JSDOM(fixtureHtml, { url: 'http://127.0.0.1:8088/ai-required-fields.html', runScripts: 'outside-only' });
const { document } = dom.window;
global.document = document;
global.window = dom.window;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;

const form = document.getElementById('ai-required-form');
assert(form, 'ai-required-form must exist in fixture');

// Pre-fill standard template fields (name, email, message)
form.querySelector('#f-name').value = 'Test User';
form.querySelector('#f-email').value = 'test@example.com';
form.querySelector('#f-message').value = 'Testing template message';

const template = {
    name: 'Test User',
    email: 'test@example.com',
    message: 'Testing template message',
    company: 'XPIDER Automation Lab',
    city: 'Seoul'
};

const engine = new FinalFormCompletionEngine({
    logger: console.log,
    checkboxResolver: new CheckboxResolverR2(),
    selectResolver: new SelectResolverR2()
});

(async () => {
    const auditResult = await engine.run(form, template, { url: 'http://127.0.0.1:8088/ai-required-fields.html' });

    console.log('Audit Result:', {
        pass: auditResult.pass,
        reason: auditResult.reason,
        unresolvedRequired: auditResult.unresolvedRequired,
        filledByAI: auditResult.requiredResolved
    });

    // 1. Verify Pass
    assert.strictEqual(auditResult.pass, true, `Audit must pass: ${auditResult.reason}`);
    assert.strictEqual(auditResult.unresolvedRequired, 0, 'Zero unresolved required fields allowed');

    // 2. Verify Number Constraints (min=100, max=5000, step=50)
    const budgetEl = form.querySelector('#f-budget');
    const budgetVal = Number(budgetEl.value);
    console.log(`Budget value: ${budgetVal} (min=100, max=5000, step=50)`);
    assert(budgetVal >= 100 && budgetVal <= 5000, `Budget ${budgetVal} must be between 100 and 5000`);
    assert.strictEqual((budgetVal - 100) % 50, 0, `Budget ${budgetVal} must satisfy step=50`);
    assert.strictEqual(budgetEl.checkValidity(), true, 'Budget must pass native checkValidity()');

    // Team size (min=1, max=20)
    const teamSizeEl = form.querySelector('#f-team-size');
    const teamSizeVal = Number(teamSizeEl.value);
    console.log(`Team size value: ${teamSizeVal} (min=1, max=20)`);
    assert(teamSizeVal >= 1 && teamSizeVal <= 20, `Team size ${teamSizeVal} must be between 1 and 20`);
    assert.strictEqual(teamSizeEl.checkValidity(), true, 'Team size must pass native checkValidity()');

    // 3. Verify Date Constraint (min=2026-01-01, max=2027-12-31)
    const dateEl = form.querySelector('#f-date');
    console.log(`Date value: ${dateEl.value}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dateEl.value), 'Date must be formatted YYYY-MM-DD');
    assert(dateEl.value >= '2026-01-01' && dateEl.value <= '2027-12-31', 'Date must be within 2026-01-01 and 2027-12-31');
    assert.strictEqual(dateEl.checkValidity(), true, 'Date must pass native checkValidity()');

    // 4. Verify URL Constraint
    const urlEl = form.querySelector('#f-website');
    console.log(`Website URL value: ${urlEl.value}`);
    assert(/^https?:\/\/.+/.test(urlEl.value), 'URL must be a valid http(s) URL');
    assert.strictEqual(urlEl.checkValidity(), true, 'URL must pass native checkValidity()');

    // 5. Verify Select Resolver
    const serviceEl = form.querySelector('#f-service');
    console.log(`Service select value: ${serviceEl.value} (index=${serviceEl.selectedIndex})`);
    assert(serviceEl.selectedIndex > 0, 'Select must choose a non-placeholder option');
    assert(serviceEl.value.length > 0, 'Select value must not be empty');
    assert.strictEqual(serviceEl.checkValidity(), true, 'Select must pass native checkValidity()');

    // 6. Verify Radio Choice
    const radioChecked = form.querySelector('input[type="radio"][name="priority"]:checked');
    console.log(`Priority radio checked: ${radioChecked?.value}`);
    assert(radioChecked, 'One radio option must be selected');

    // 7. Verify Checkbox: Terms checked, Marketing left unchecked
    const termsEl = form.querySelector('#f-terms');
    const marketingEl = form.querySelector('#f-marketing');
    console.log(`Terms checked: ${termsEl.checked}, Marketing checked: ${marketingEl.checked}`);
    assert.strictEqual(termsEl.checked, true, 'Terms & privacy required checkbox must be checked');
    assert.strictEqual(marketingEl.checked, false, 'Optional marketing checkbox must strictly remain unchecked');

    // 8. Overall Native Form Validity
    assert.strictEqual(form.checkValidity(), true, 'Entire form must pass native checkValidity()');
    console.log('✔ Test 1 PASS: All constraints, field types, and native validity verified.');

    // -------------------------------------------------------------------------
    // Test Case 2: ai-ambiguous-safe-skip.html with Sensitive Required Fact (SSN)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Sensitive Fact Guard (SSN / Tax ID) Safe Halt ---');
    const sensitiveHtml = fs.readFileSync(path.resolve(__dirname, '../owner-extension-test-site/ai-ambiguous-safe-skip.html'), 'utf8');
    const dom2 = new JSDOM(sensitiveHtml, { url: 'http://127.0.0.1:8088/ai-ambiguous-safe-skip.html' });
    const form2 = dom2.window.document.getElementById('sensitive-form');

    const result2 = await engine.run(form2, template);
    console.log('Sensitive Field Result:', { pass: result2.pass, reason: result2.reason });

    assert.strictEqual(result2.pass, false, 'Engine must reject/halt when sensitive fact is required');
    assert.strictEqual(result2.reason, 'UNRESOLVED_REQUIRED_FACT', 'Must declare UNRESOLVED_REQUIRED_FACT');
    const ssnEl = form2.querySelector('#ssn');
    assert.strictEqual(ssnEl.value, '', 'Sensitive field must NEVER be fabricated with random strings');
    console.log('✔ Test 2 PASS: Sensitive fact guard strictly halted with UNRESOLVED_REQUIRED_FACT.');

    console.log('\n======================================================');
    console.log('  ALL AI REQUIRED FIELD TESTS: 100% PASS');
    console.log('======================================================');
    process.exit(0);
})().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
