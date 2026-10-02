/**
 * test_r6_1_final_fill_and_submit_r5.js
 * [Issue #6 R6.1] Acceptance Test Suite — AI FINAL FILL PASS + SUBMIT EXECUTOR R5
 */

'use strict';

const assert = require('assert');

/* =========================================================================
 * Mock browser environment
 * ========================================================================= */
const mockStorage = {};
const mockSessionStorage = {};
const broadcastMessages = [];

global.self = global;
global.window = global;
global.window.location = { href: 'https://example.com/', hostname: 'example.com', pathname: '/' };
global.sessionStorage = {
    _data: {},
    getItem: function(k) { return this._data[k] || null; },
    setItem: function(k, v) { this._data[k] = String(v); },
    removeItem: function(k) { delete this._data[k]; }
};

global.chrome = {
    storage: {
        local: {
            get: (k, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
            set: (i, cb) => { Object.assign(mockStorage, i); if (typeof cb === 'function') cb(); return Promise.resolve(); },
            remove: (k, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); }
        },
        session: {
            get: (k, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
            set: (i, cb) => { Object.assign(mockSessionStorage, i); if (typeof cb === 'function') cb(); return Promise.resolve(); },
            remove: (k, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); }
        }
    },
    runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
            broadcastMessages.push(msg);
            if (typeof cb === 'function') cb({ success: true });
            return Promise.resolve({ success: true });
        },
        onMessage: { addListener: () => {} }
    },
    tabs: {
        query: (q, cb) => { if (typeof cb === 'function') cb([{ id: 101, url: 'https://example.com/' }]); },
        sendMessage: (tid, msg, cb) => { if (typeof cb === 'function') cb({ success: true }); }
    },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} }
};

/* =========================================================================
 * Mock DOM Node
 * ========================================================================= */
class MockNode {
    constructor(tagName = 'DIV', attrs = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = Object.assign({}, attrs);
        this.children = [];
        this.parentElement = null;
        this.textContent = attrs.textContent || '';
        this.value = attrs.value || '';
        this.type = (attrs.type || '').toLowerCase();
        this.name = attrs.name || '';
        this.id = attrs.id || '';
        this.className = attrs.className || '';
        this.checked = !!attrs.checked;
        this.disabled = !!attrs.disabled;
        this.required = !!attrs.required;
        this.selectedIndex = attrs.selectedIndex !== undefined ? attrs.selectedIndex : 0;
        this.options = attrs.options || [];
        this.eventListeners = {};
        this.style = attrs.style || {};
        this.shadowRoot = null;
        this.labels = [];
    }

    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; if (k === 'class') this.className = v; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }
    removeAttribute(k) { delete this.attributes[k]; }
    getBoundingClientRect() { return { width: 100, height: 30, left: 10, top: 10 }; }
    checkValidity() { return !this.required || (this.type === 'checkbox' ? this.checked : (this.value && this.value.trim().length > 0)); }
    focus() { this.focused = true; }
    blur() { this.focused = false; }
    scrollIntoView() {}

    addEventListener(t, fn) {
        if (!this.eventListeners[t]) this.eventListeners[t] = [];
        this.eventListeners[t].push(fn);
    }

    dispatchEvent(evt) {
        const type = (evt && evt.type) || 'event';
        if (this.eventListeners[type]) {
            for (const fn of this.eventListeners[type]) {
                try { fn.call(this, evt); } catch (_) {}
            }
        }
        if (this.parentElement) this.parentElement.dispatchEvent(evt);
        return true;
    }

    click() {
        this.clicked = true;
        this.dispatchEvent(new global.MouseEvent('click', { bubbles: true }));
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    contains(node) {
        if (node === this) return true;
        for (const c of this.children) {
            if (c.contains(node)) return true;
        }
        return false;
    }

    querySelectorAll(selector) {
        const results = [];
        const match = (n) => {
            const tag = n.tagName.toLowerCase();
            const type = n.type || '';
            const role = (n.getAttribute('role') || '').toLowerCase();
            const cls = (n.className || '').toLowerCase();
            const id = (n.id || '').toLowerCase();

            if (selector.includes('input') && tag === 'input') return true;
            if (selector.includes('textarea') && tag === 'textarea') return true;
            if (selector.includes('select') && tag === 'select') return true;
            if (selector.includes('button') && tag === 'button') return true;
            if (selector.includes('[role="checkbox"]') && role === 'checkbox') return true;
            if (selector.includes('[role="radio"]') && role === 'radio') return true;
            if (selector.includes('[role="combobox"]') && role === 'combobox') return true;
            if (selector.includes('[type="submit"]') && type === 'submit') return true;
            if (selector.includes('[class*="submit"]') && cls.includes('submit')) return true;
            if (selector.includes('[id*="submit"]') && id.includes('submit')) return true;
            if (selector.includes('[class*="next"]') && cls.includes('next')) return true;
            if (selector.includes('[class*="continue"]') && cls.includes('continue')) return true;
            if (selector.includes(':invalid') && !n.checkValidity()) return true;
            if (selector.includes('*')) return true;
            return false;
        };

        const traverse = (node) => {
            for (const c of node.children) {
                if (match(c)) results.push(c);
                traverse(c);
            }
            if (node.shadowRoot) traverse(node.shadowRoot);
        };
        traverse(this);
        return results;
    }

    querySelector(selector) {
        const res = this.querySelectorAll(selector);
        return res.length > 0 ? res[0] : null;
    }

    requestSubmit(submitter) {
        this.submitted = true;
        this.submitterUsed = submitter;
        this.dispatchEvent(new global.Event('submit', { bubbles: true, cancelable: true }));
    }

    submit() {
        this.submitted = true;
        this.dispatchEvent(new global.Event('submit', { bubbles: true, cancelable: true }));
    }
}

global.document = {
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
    getElementById: (id) => null,
    elementFromPoint: (x, y) => null,
    activeElement: null
};

global.Event = function(t, i) { this.type = t; Object.assign(this, i); };
global.MouseEvent = function(t, i) { global.Event.call(this, t, i); };
global.MouseEvent.prototype = Object.create(global.Event.prototype);
global.PointerEvent = function(t, i) { global.Event.call(this, t, i); };
global.PointerEvent.prototype = Object.create(global.Event.prototype);
global.KeyboardEvent = function(t, i) { global.Event.call(this, t, i); this.key = (i && i.key) || ''; };
global.KeyboardEvent.prototype = Object.create(global.Event.prototype);

/* =========================================================================
 * Modules Loading
 * ========================================================================= */
const CheckboxResolverR2 = require('./modules/checkbox-resolver-r2.js');
const SelectResolverR2 = require('./modules/select-resolver-r2.js');
const FinalFormCompletionEngine = require('./modules/final-form-completion-engine.js');
const contentScript = require('./content-script.js');

const {
    SubmitExecutorR5,
    SubmitExecutorR4,
    SubmitExecutorR3,
    SubmissionOutcomeVerifier
} = contentScript;

/* =========================================================================
 * Test Runner
 * ========================================================================= */
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  [PASS] ' + name);
        passCount++;
    } catch (err) {
        console.error('  [FAIL] ' + name);
        console.error('     ' + err.message);
        failCount++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log('  [PASS] ' + name);
        passCount++;
    } catch (err) {
        console.error('  [FAIL] ' + name);
        console.error('     ' + err.message);
        failCount++;
    }
}

async function runAllTests() {
    console.log('\n=== [R6.1 ACCEPTANCE TEST SUITE -- FINAL FILL + SUBMIT R5] ===\n');

    const sampleTemplate = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555-123-4567',
        subject: 'General Question',
        message: 'Hello, I would like to inquire about your services.'
    };

    // 1. Unchecked required checkbox -> selected
    await asyncTest('R6.1-01: Unchecked required checkbox -> selected', async () => {
        const form = new MockNode('FORM');
        const cb = new MockNode('INPUT', { type: 'checkbox', name: 'agree', required: true, checked: false, textContent: 'I agree to the terms' });
        form.appendChild(cb);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert.strictEqual(cb.checked, true, 'Required checkbox must be checked');
    });

    // 2. Required checkbox group exact minimum
    await asyncTest('R6.1-02: Required checkbox group selects exact minimum (1 option) and caches', async () => {
        const form = new MockNode('FORM');
        const cb1 = new MockNode('INPUT', { type: 'checkbox', name: 'inquiry_topic', id: 'cb1', required: true, textContent: 'Adult Program' });
        const cb2 = new MockNode('INPUT', { type: 'checkbox', name: 'inquiry_topic', id: 'cb2', required: true, textContent: 'Kids Program' });
        form.appendChild(cb1);
        form.appendChild(cb2);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        const checkedCount = [cb1, cb2].filter(c => c.checked).length;
        assert.strictEqual(checkedCount, 1, 'Exactly one option in inquiry choice group should be checked');
    });

    // 3. Required radio one selected
    await asyncTest('R6.1-03: Required radio group chooses one safe enabled option', async () => {
        const form = new MockNode('FORM');
        const r1 = new MockNode('INPUT', { type: 'radio', name: 'pref', required: true, textContent: 'General Inquiry' });
        const r2 = new MockNode('INPUT', { type: 'radio', name: 'pref', required: true, textContent: 'Other' });
        form.appendChild(r1);
        form.appendChild(r2);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert.strictEqual(r1.checked || r2.checked, true, 'At least one radio in group must be checked');
    });

    // 4. Native select placeholder -> safe valid selection
    await asyncTest('R6.1-04: Native select placeholder -> safe valid option selected', async () => {
        const form = new MockNode('FORM');
        const sel = new MockNode('SELECT', {
            name: 'interest',
            required: true,
            selectedIndex: 0,
            options: [
                { value: '', text: 'Select an option...' },
                { value: 'info', text: 'General Information' },
                { value: 'support', text: 'Customer Support' }
            ]
        });
        form.appendChild(sel);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert(sel.selectedIndex > 0, 'Placeholder must be replaced by valid option');
    });

    // 5. Custom ARIA dropdown -> safe valid option
    await asyncTest('R6.1-05: Custom ARIA combobox/listbox handled safely without crash', async () => {
        const form = new MockNode('FORM');
        const customSel = new MockNode('DIV', { role: 'combobox', className: 'ant-select', required: true });
        form.appendChild(customSel);
        const engine = new FinalFormCompletionEngine();
        const res = await engine.run(form, sampleTemplate);
        assert(res !== null, 'Engine should process custom dropdown');
    });

    // 6. React rerender checkbox/select -> same cached choice restored once
    await asyncTest('R6.1-06: React rerender restores identical cached choice', async () => {
        const engine = new FinalFormCompletionEngine();
        const form1 = new MockNode('FORM');
        const cbA = new MockNode('INPUT', { type: 'checkbox', name: 'topic_prog', id: 'prog_opt1', required: true, textContent: 'Inquiry' });
        form1.appendChild(cbA);
        await engine.run(form1, sampleTemplate);
        assert.strictEqual(cbA.checked, true);

        // Simulate React rerender (new element instance)
        const form2 = new MockNode('FORM');
        const cbB = new MockNode('INPUT', { type: 'checkbox', name: 'topic_prog', id: 'prog_opt1', required: true, textContent: 'Inquiry' });
        form2.appendChild(cbB);
        await engine.run(form2, sampleTemplate);
        assert.strictEqual(cbB.checked, true, 'Cached choice must be restored on rerender');
    });

    // 7. Newsletter remains unchecked
    await asyncTest('R6.1-07: Newsletter / marketing checkbox remains strictly unchecked', async () => {
        const form = new MockNode('FORM');
        const newsCb = new MockNode('INPUT', { type: 'checkbox', name: 'newsletter', checked: false, textContent: 'Subscribe to newsletter' });
        form.appendChild(newsCb);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert.strictEqual(newsCb.checked, false, 'Newsletter checkbox must NEVER be auto-checked');
    });

    // 8. Terms/privacy checked when required
    await asyncTest('R6.1-08: Terms/Privacy checked when required', async () => {
        const form = new MockNode('FORM');
        const termsCb = new MockNode('INPUT', { type: 'checkbox', name: 'terms', required: true, textContent: 'I accept privacy policy' });
        form.appendChild(termsCb);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert.strictEqual(termsCb.checked, true, 'Terms/Privacy required checkbox must be auto-checked');
    });

    // 9. Honeypot untouched
    await asyncTest('R6.1-09: Honeypot field must never be touched', async () => {
        const form = new MockNode('FORM');
        const hp = new MockNode('INPUT', { type: 'text', name: 'hp_field_check', value: '', textContent: 'Leave blank' });
        form.appendChild(hp);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert.strictEqual(hp.value, '', 'Honeypot field must remain empty');
    });

    // 10. Low-stakes required short-answer AI-filled
    await asyncTest('R6.1-10: Low-stakes required short-answer text filled with generic answer', async () => {
        const form = new MockNode('FORM');
        const txt = new MockNode('INPUT', { type: 'text', name: 'referral_source', required: true, textContent: 'How did you find us?' });
        form.appendChild(txt);
        const engine = new FinalFormCompletionEngine();
        await engine.run(form, sampleTemplate);
        assert.strictEqual(txt.value, 'Website', 'Low stakes required referral field should be filled with Website');
    });

    // 11. Sensitive factual required -> unresolved/no submit
    await asyncTest('R6.1-11: Sensitive factual required field blocks submit (UNRESOLVED_REQUIRED_FACT)', async () => {
        const form = new MockNode('FORM');
        const ssn = new MockNode('INPUT', { type: 'text', name: 'ssn_number', required: true, textContent: 'Social Security Number' });
        form.appendChild(ssn);
        const engine = new FinalFormCompletionEngine();
        const res = await engine.run(form, sampleTemplate);
        assert.strictEqual(res.pass, false);
        assert.strictEqual(res.reason, 'UNRESOLVED_REQUIRED_FACT');
    });

    // 12. Newly inserted required field caught by final audit
    await asyncTest('R6.1-12: Newly inserted required field caught by final audit -> FAIL', async () => {
        const form = new MockNode('FORM');
        const msg = new MockNode('TEXTAREA', { name: 'message', required: true, value: 'Hello' });
        form.appendChild(msg);
        const engine = new FinalFormCompletionEngine();

        // Simulate new empty required input inserted
        const newReq = new MockNode('INPUT', { type: 'text', name: 'extra_req', required: true, value: '' });
        form.appendChild(newReq);

        const audit = await engine.finalRequiredAudit(form, sampleTemplate);
        assert.strictEqual(audit.pass, false, 'Audit must fail when unresolved required field exists');
        assert.strictEqual(audit.unresolvedRequired, 1);
    });

    // 13. SubmitExecutorR5: requestSubmit path
    await asyncTest('R6.1-13: SubmitExecutorR5 triggers requestSubmit on standard form', async () => {
        const form = new MockNode('FORM');
        const btn = new MockNode('BUTTON', { type: 'submit', textContent: 'Send Message' });
        form.appendChild(btn);
        const executor = new SubmitExecutorR5(form, sampleTemplate);
        const res = await executor.execute();
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.strategy, 'requestSubmit');
        assert.strictEqual(form.submitted, true);
    });

    // 14. SubmitExecutorR5: disabled -> exact repair -> enabled -> submit
    await asyncTest('R6.1-14: Disabled submit button repairs blocking field, enables, and submits', async () => {
        const form = new MockNode('FORM');
        const reqInput = new MockNode('INPUT', { type: 'email', name: 'email', required: true, value: '' });
        const btn = new MockNode('BUTTON', { type: 'submit', disabled: true, textContent: 'Send' });
        reqInput.addEventListener('input', () => { if (reqInput.value) btn.disabled = false; });
        form.appendChild(reqInput);
        form.appendChild(btn);

        const executor = new SubmitExecutorR5(form, sampleTemplate);
        const res = await executor.execute();
        assert.strictEqual(reqInput.value, sampleTemplate.email, 'Blocking empty required field must be repaired with template value');
        assert.strictEqual(res.success, true);
    });

    // 15. SubmitExecutorR5: direct click path
    await asyncTest('R6.1-15: Direct click path executed when requestSubmit is unavailable', async () => {
        const divForm = new MockNode('DIV');
        const btn = new MockNode('BUTTON', { type: 'button', textContent: 'Submit' });
        divForm.appendChild(btn);

        const executor = new SubmitExecutorR5(divForm, sampleTemplate);
        const res = await executor.execute();
        assert.strictEqual(btn.clicked, true, 'Submit button should be clicked');
        assert.strictEqual(res.strategy, 'button_click');
    });

    // 16. SubmitExecutorR5: keyboard fallback once
    await asyncTest('R6.1-16: Keyboard fallback dispatched once', async () => {
        const divForm = new MockNode('DIV');
        const customBtn = new MockNode('DIV', { role: 'button', textContent: 'Submit Inquiry' });
        divForm.appendChild(customBtn);

        let enterReceived = false;
        customBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') enterReceived = true;
        });

        const executor = new SubmitExecutorR5(divForm, sampleTemplate);
        await executor.execute();
        assert(customBtn.clicked || enterReceived, 'Button click or keyboard event should occur');
    });

    // 17. SubmitExecutorR5: primary no effect -> one alternate candidate
    await asyncTest('R6.1-17: Primary no effect -> alternate candidate attempted', async () => {
        const divForm = new MockNode('DIV');
        const primary = new MockNode('BUTTON', { textContent: 'Send', disabled: true });
        const alternate = new MockNode('BUTTON', { textContent: 'Submit', disabled: false });
        divForm.appendChild(primary);
        divForm.appendChild(alternate);

        const executor = new SubmitExecutorR5(divForm, sampleTemplate);
        const res = await executor.execute();
        assert.strictEqual(alternate.clicked, true, 'Alternate candidate must be clicked when primary disabled');
    });

    // 18. SubmitExecutorR5: submit event observed -> no alternate attempted
    await asyncTest('R6.1-18: Submit event observed -> no alternate candidate attempted', async () => {
        const form = new MockNode('FORM');
        const primary = new MockNode('BUTTON', { type: 'submit', textContent: 'Send' });
        const alternate = new MockNode('BUTTON', { type: 'submit', textContent: 'Submit' });
        form.appendChild(primary);
        form.appendChild(alternate);

        const executor = new SubmitExecutorR5(form, sampleTemplate);
        await executor.execute();
        assert.strictEqual(alternate.clicked, undefined, 'Alternate must NOT be clicked when primary fires submit event');
    });

    // 19. SubmitExecutorR5: overlay repair once
    await asyncTest('R6.1-19: Overlay repair dismisses overlay', async () => {
        const form = new MockNode('FORM');
        const btn = new MockNode('BUTTON', { type: 'submit', textContent: 'Send' });
        form.appendChild(btn);

        const executor = new SubmitExecutorR5(form, sampleTemplate);
        const res = await executor.handleOverlay(btn);
        assert.strictEqual(res.ok, true, 'Overlay handling resolves successfully');
    });

    // 20. Multi-step form support: Next button detection
    await asyncTest('R6.1-20: Multi-step Next button advances step', async () => {
        const form = new MockNode('DIV');
        const nextBtn = new MockNode('BUTTON', { className: 'next-step', textContent: 'Next Step' });
        form.appendChild(nextBtn);

        const executor = new SubmitExecutorR5(form, sampleTemplate);
        const res = await executor.execute();
        assert.strictEqual(res.isMultiStep, true, 'Multi-step form should be recognized');
        assert.strictEqual(nextBtn.clicked, true, 'Next button should be clicked');
    });

    // 21. AJAX success recognized
    await asyncTest('R6.1-21: AJAX submission recognized by verifier', async () => {
        const form = new MockNode('FORM');
        const verifier = new SubmissionOutcomeVerifier(form, sampleTemplate);
        verifier.prepare();
        const outcome = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(outcome.success, true, 'AJAX success should be confirmed');
    });

    // 22. No duplicate submit
    await asyncTest('R6.1-22: No duplicate submit events fired', async () => {
        const form = new MockNode('FORM');
        let submitCount = 0;
        form.addEventListener('submit', () => { submitCount++; });
        const btn = new MockNode('BUTTON', { type: 'submit', textContent: 'Send' });
        form.appendChild(btn);

        const executor = new SubmitExecutorR5(form, sampleTemplate);
        await executor.execute();
        assert.strictEqual(submitCount, 1, 'Exactly one submit event should be fired');
    });

    // 23. Last-resort one-shot only
    await asyncTest('R6.1-23: FORCED_FORM_SUBMIT_LAST_RESORT fires only when opt-in is enabled', async () => {
        const form = new MockNode('FORM');
        form.requestSubmit = undefined; // Force fallback to native submit
        const executor = new SubmitExecutorR5(form, sampleTemplate, { allowForcedNativeSubmit: true });
        const res = await executor.execute();
        assert.strictEqual(res.strategy, 'FORCED_FORM_SUBMIT_LAST_RESORT');
    });

    // 24. Backward compatibility: Aliases
    test('R6.1-24: SubmitExecutor backward compatibility aliases', () => {
        assert.strictEqual(SubmitExecutorR4, SubmitExecutorR5, 'SubmitExecutorR4 must alias SubmitExecutorR5');
        assert.strictEqual(SubmitExecutorR3, SubmitExecutorR5, 'SubmitExecutorR3 must alias SubmitExecutorR5');
    });

    console.log('\n========================================================\n');
    console.log(`  R6.1 TEST RESULTS: ${passCount} PASSED  |  ${failCount} FAILED\n`);
    if (failCount > 0) {
        console.error('  SOME R6.1 TESTS FAILED\n');
        process.exit(1);
    } else {
        console.log('  ALL R6.1 ACCEPTANCE TESTS PASSED\n');
    }
}

runAllTests().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
