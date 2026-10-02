/**
 * test_form_recognition_autofill_bridge_r6_2.js
 * [Issue #6 R6.2] Acceptance Test Suite — FORM RECOGNITION + AUTOFILL BRIDGE
 * 
 * Verifies:
 * R6.2-1  Native form textarea recognized.
 * R6.2-2  DIV-based form textarea/email/button recognized without FORM tag.
 * R6.2-3  React form appears 800ms later and is recognized (Multi-pass render wait).
 * R6.2-4  Textarea appears after bounded scroll.
 * R6.2-5  Form inside open Shadow DOM recognized.
 * R6.2-6  Same-origin iframe form recognized.
 * R6.2-7  Modal Contact trigger reveals form and is recognized.
 * R6.2-8  Real body field cannot be rejected solely by low numeric score.
 * R6.2-9  Body + email + role=button qualifies.
 * R6.2-10 Newsletter-only form rejected.
 * R6.2-11 Newly recognized form dispatches autofill exactly once.
 * R6.2-12 SPA duplicate guard does not suppress first start on new form.
 * R6.2-13 Framework node replacement rebinds.
 * R6.2-14 Eligible form but bridge failure reports AUTOFILL_BRIDGE_FAILED.
 * R6.2-15 No form after all 3 passes reports exact reason.
 */

'use strict';

const assert = require('assert');

/* =========================================================================
 * Mock Browser & DOM Environment
 * ========================================================================= */
const mockStorage = {};
const mockSessionStorage = {};
const broadcastMessages = [];

global.self = global;
global.window = global;
global.window.location = { href: 'https://example.com/contact', hostname: 'example.com', pathname: '/contact' };
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
    }
};

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
        this.style = attrs.style || {};
        this.shadowRoot = null;
        this.eventListeners = {};
        this.contentDocument = null;
        this.contentWindow = null;
    }

    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; if (k === 'class') this.className = v; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }
    removeAttribute(k) { delete this.attributes[k]; }

    appendChild(child) {
        if (!child) return;
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
        }
    }

    addEventListener(t, fn) {
        if (!this.eventListeners[t]) this.eventListeners[t] = [];
        this.eventListeners[t].push(fn);
    }

    dispatchEvent(evt) {
        const type = (evt && evt.type) || 'click';
        if (this.eventListeners[type]) {
            for (const fn of this.eventListeners[type]) fn(evt);
        }
        return true;
    }

    click() {
        this.dispatchEvent({ type: 'click', target: this });
    }

    closest(selector) {
        let curr = this;
        while (curr) {
            if (curr.matchesSelector && curr.matchesSelector(selector)) return curr;
            curr = curr.parentElement;
        }
        return null;
    }

    matchesSelector(sel) {
        if (!sel) return false;
        const parts = sel.split(',').map(s => s.trim().toUpperCase());
        for (const p of parts) {
            if (p === this.tagName) return true;
            if (p === 'FORM' && this.tagName === 'FORM') return true;
            if (p === 'FIELDSET' && this.tagName === 'FIELDSET') return true;
            if (p === 'SECTION' && this.tagName === 'SECTION') return true;
            if (p === 'ARTICLE' && this.tagName === 'ARTICLE') return true;
            if (p === 'MAIN' && this.tagName === 'MAIN') return true;
            if (p.includes('[ROLE="FORM"]') && this.getAttribute('role') === 'form') return true;
            if (p.includes('[ROLE="BUTTON"]') && this.getAttribute('role') === 'button') return true;
            if (p.startsWith('.') && this.className.includes(p.substring(1).toLowerCase())) return true;
            if (p.startsWith('#') && this.id.toUpperCase() === p.substring(1)) return true;
        }
        return false;
    }

    querySelectorAll(selector) {
        const results = [];
        const matchSingle = (node, sel) => {
            if (!node || !node.tagName) return false;
            const s = sel.trim().toLowerCase();
            if (s === '*' || s === node.tagName.toLowerCase()) return true;
            if (s === 'textarea' && node.tagName === 'TEXTAREA') return true;
            if (s === 'select' && node.tagName === 'SELECT') return true;
            if (s === 'button' && node.tagName === 'BUTTON') return true;
            if (s === 'iframe' && node.tagName === 'IFRAME') return true;
            if (s === 'form' && node.tagName === 'FORM') return true;
            if (s.startsWith('input')) {
                if (node.tagName !== 'INPUT') return false;
                if (s === 'input') return true;
                if (s.includes('type="email"') && node.type === 'email') return true;
                if (s.includes('type="tel"') && node.type === 'tel') return true;
                if (s.includes('type="submit"') && node.type === 'submit') return true;
                if (s.includes('type="checkbox"') && node.type === 'checkbox') return true;
                if (s.includes('type="radio"') && node.type === 'radio') return true;
                if (s.includes('type="text"') && (node.type === 'text' || !node.type)) return true;
                if (s.includes('name*="email"') && node.name.toLowerCase().includes('email')) return true;
                if (s.includes('id*="email"') && node.id.toLowerCase().includes('email')) return true;
                if (s.includes('name*="name"') && node.name.toLowerCase().includes('name')) return true;
                if (s.includes('id*="name"') && node.id.toLowerCase().includes('name')) return true;
                if (s.includes('name*="phone"') && node.name.toLowerCase().includes('phone')) return true;
                if (s.includes('id*="phone"') && node.id.toLowerCase().includes('phone')) return true;
                return true;
            }
            if (s.includes('[contenteditable="true"]') && (node.getAttribute('contenteditable') === 'true' || node.getAttribute('contenteditable') === '')) return true;
            if (s.includes('[role="textbox"]') && node.getAttribute('role') === 'textbox') return true;
            if (s.includes('[role="combobox"]') && node.getAttribute('role') === 'combobox') return true;
            if (s.includes('[role="checkbox"]') && node.getAttribute('role') === 'checkbox') return true;
            if (s.includes('[role="button"]') && node.getAttribute('role') === 'button') return true;
            if (s.startsWith('.') && node.className.toLowerCase().includes(s.substring(1))) return true;
            if (s.startsWith('#') && node.id.toLowerCase() === s.substring(1)) return true;
            return false;
        };

        const selectors = selector.split(',').map(s => s.trim());
        const walk = (n) => {
            for (const ch of n.children) {
                for (const sel of selectors) {
                    if (matchSingle(ch, sel)) {
                        results.push(ch);
                        break;
                    }
                }
                walk(ch);
            }
        };
        walk(this);
        return results;
    }

    querySelector(selector) {
        const all = this.querySelectorAll(selector);
        return all[0] || null;
    }
}

function createMockDocument() {
    const doc = new MockNode('HTML');
    const body = new MockNode('BODY');
    doc.appendChild(body);
    doc.body = body;
    return doc;
}

global.document = createMockDocument();

// Load modules under test
const formDiscoveryModule = require('./modules/form-discovery-engine-r2.js');
const {
    FormDiscoveryEngineR2,
    collectAccessibleRoots,
    findInquiryBodyControls,
    startAutofillForEligibleForm,
    resetAutofillLatch
} = formDiscoveryModule;

const contentScript = require('./content-script.js');

/* =========================================================================
 * Test Runner Framework
 * ========================================================================= */
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  [PASS] ${name}`);
    } catch (err) {
        failedTests++;
        console.error(`  [FAIL] ${name}: ${err.message}`);
    }
}

/* =========================================================================
 * R6.2 Acceptance Tests
 * ========================================================================= */
async function runSuite() {
    console.log('\n=== [R6.2 ACCEPTANCE TEST SUITE -- FORM RECOGNITION + AUTOFILL BRIDGE] ===\n');

    // R6.2-1: Native form textarea recognized
    await runTest('R6.2-1: native form textarea recognized', async () => {
        const doc = createMockDocument();
        const form = new MockNode('FORM', { id: 'contact-form' });
        const nameInput = new MockNode('INPUT', { type: 'text', name: 'user_name' });
        const emailInput = new MockNode('INPUT', { type: 'email', name: 'user_email' });
        const textarea = new MockNode('TEXTAREA', { name: 'message', placeholder: 'Write your inquiry here' });
        const submitBtn = new MockNode('BUTTON', { type: 'submit', textContent: 'Submit Message' });

        form.appendChild(nameInput);
        form.appendChild(emailInput);
        form.appendChild(textarea);
        form.appendChild(submitBtn);
        doc.body.appendChild(form);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'Discovered form must not be null');
        assert.strictEqual(discovered.tagName, 'FORM');
        assert.strictEqual(discovered.id, 'contact-form');
    });

    // R6.2-2: DIV-based form textarea/email/button recognized without FORM tag
    await runTest('R6.2-2: DIV-based form textarea/email/button recognized without FORM tag', async () => {
        const doc = createMockDocument();
        const wrapper = new MockNode('DIV', { className: 'contact-section-wrapper', id: 'contact-inquiry' });
        const emailInput = new MockNode('INPUT', { type: 'email', name: 'email', placeholder: 'Your email' });
        const textarea = new MockNode('TEXTAREA', { name: 'details', placeholder: 'Inquiry details' });
        const sendBtn = new MockNode('BUTTON', { textContent: 'Send Message' });

        wrapper.appendChild(emailInput);
        wrapper.appendChild(textarea);
        wrapper.appendChild(sendBtn);
        doc.body.appendChild(wrapper);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'DIV container must be recognized as eligible contact form');
        assert.strictEqual(discovered.id, 'contact-inquiry');
    });

    // R6.2-3: React form appears 800ms later and is recognized (multi-pass render wait)
    await runTest('R6.2-3: React form appears 800ms later and is recognized', async () => {
        const doc = createMockDocument();
        const engine = new FormDiscoveryEngineR2({
            pass1WaitMs: 0,
            pass2WaitMs: 100,
            pass3WaitMs: 150
        });

        // Initially no form
        setTimeout(() => {
            const reactForm = new MockNode('FORM', { id: 'react-hydrated-form' });
            reactForm.appendChild(new MockNode('INPUT', { type: 'email', name: 'email' }));
            reactForm.appendChild(new MockNode('TEXTAREA', { name: 'inquiry_text' }));
            reactForm.appendChild(new MockNode('BUTTON', { type: 'submit', textContent: 'Send' }));
            doc.body.appendChild(reactForm);
        }, 50);

        const discovered = await engine.discoverForm(doc);
        assert(discovered !== null, 'Delayed rendered React form must be discovered on subsequent pass');
        assert.strictEqual(discovered.id, 'react-hydrated-form');
    });

    // R6.2-4: Textarea appears after bounded scroll
    await runTest('R6.2-4: textarea appears after bounded scroll', async () => {
        const doc = createMockDocument();
        let scrollCalled = false;
        global.window.scrollBy = function() {
            scrollCalled = true;
            // Reveal lazy container on scroll
            const lazyContainer = new MockNode('DIV', { id: 'lazy-revealed-form' });
            lazyContainer.appendChild(new MockNode('INPUT', { type: 'text', name: 'name' }));
            lazyContainer.appendChild(new MockNode('TEXTAREA', { name: 'message', placeholder: 'Question' }));
            lazyContainer.appendChild(new MockNode('BUTTON', { textContent: 'Submit' }));
            doc.body.appendChild(lazyContainer);
        };

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 50, pass3WaitMs: 50 });
        const discovered = await engine.discoverForm(doc);

        assert(scrollCalled, 'Scroll must have been called on pass 3');
        assert(discovered !== null, 'Form revealed by scroll must be discovered');
        assert.strictEqual(discovered.id, 'lazy-revealed-form');
    });

    // R6.2-5: Form inside open Shadow DOM recognized
    await runTest('R6.2-5: form inside open Shadow DOM recognized', async () => {
        const doc = createMockDocument();
        const customElement = new MockNode('WEB-COMPONENT', { id: 'contact-widget' });
        const shadowRoot = new MockNode('SHADOW_ROOT');
        customElement.shadowRoot = shadowRoot;

        const shadowForm = new MockNode('FORM', { id: 'shadow-inner-form' });
        shadowForm.appendChild(new MockNode('INPUT', { type: 'email', name: 'email' }));
        shadowForm.appendChild(new MockNode('TEXTAREA', { name: 'question', placeholder: 'How can we help' }));
        shadowForm.appendChild(new MockNode('BUTTON', { type: 'submit', textContent: 'Submit' }));

        shadowRoot.appendChild(shadowForm);
        doc.body.appendChild(customElement);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'Form inside open Shadow DOM must be discovered');
        assert.strictEqual(discovered.id, 'shadow-inner-form');
    });

    // R6.2-6: Same-origin iframe form recognized
    await runTest('R6.2-6: same-origin iframe form recognized', async () => {
        const doc = createMockDocument();
        const iframe = new MockNode('IFRAME', { id: 'contact-iframe' });
        const ifrDoc = createMockDocument();
        const ifrForm = new MockNode('FORM', { id: 'iframe-form' });
        ifrForm.appendChild(new MockNode('INPUT', { type: 'text', name: 'full_name' }));
        ifrForm.appendChild(new MockNode('TEXTAREA', { name: 'message', placeholder: 'Message' }));
        ifrForm.appendChild(new MockNode('BUTTON', { type: 'submit', textContent: 'Send' }));
        ifrDoc.body.appendChild(ifrForm);

        iframe.contentDocument = ifrDoc;
        doc.body.appendChild(iframe);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'Form inside same-origin iframe must be discovered');
        assert.strictEqual(discovered.id, 'iframe-form');
    });

    // R6.2-7: Modal Contact trigger reveals form and is recognized
    await runTest('R6.2-7: modal Contact trigger reveals form and is recognized', async () => {
        const doc = createMockDocument();
        const modalBtn = new MockNode('BUTTON', { textContent: 'Contact Us', id: 'open-modal-btn' });
        doc.body.appendChild(modalBtn);

        modalBtn.addEventListener('click', () => {
            const modalForm = new MockNode('FORM', { id: 'modal-contact-form' });
            modalForm.appendChild(new MockNode('INPUT', { type: 'email', name: 'email' }));
            modalForm.appendChild(new MockNode('TEXTAREA', { name: 'comment', placeholder: 'Comments' }));
            modalForm.appendChild(new MockNode('BUTTON', { type: 'submit', textContent: 'Send' }));
            doc.body.appendChild(modalForm);
        });

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 50, pass3WaitMs: 50 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'Form revealed by clicking Contact Us trigger must be discovered');
        assert.strictEqual(discovered.id, 'modal-contact-form');
    });

    // R6.2-8: Real body field cannot be rejected solely by low numeric score
    await runTest('R6.2-8: real body field cannot be rejected solely by low numeric score', async () => {
        const doc = createMockDocument();
        // Minimalist form: only textarea and submit button (low score in legacy heuristic)
        const minimalForm = new MockNode('FORM', { id: 'minimal-inquiry' });
        minimalForm.appendChild(new MockNode('TEXTAREA', { name: 'message', placeholder: 'Ask us anything' }));
        minimalForm.appendChild(new MockNode('BUTTON', { textContent: 'Submit' }));
        doc.body.appendChild(minimalForm);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'Minimal form with real body field must qualify regardless of low numeric score');
        assert.strictEqual(discovered.id, 'minimal-inquiry');
    });

    // R6.2-9: Body + email + role=button qualifies
    await runTest('R6.2-9: body + email + role=button qualifies', async () => {
        const doc = createMockDocument();
        const divContainer = new MockNode('DIV', { id: 'custom-role-container' });
        divContainer.appendChild(new MockNode('INPUT', { type: 'email', name: 'contact_email' }));
        divContainer.appendChild(new MockNode('TEXTAREA', { name: 'inquiry_body' }));
        const roleBtn = new MockNode('SPAN', { textContent: 'Submit', role: 'button' });
        divContainer.appendChild(roleBtn);
        doc.body.appendChild(divContainer);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert(discovered !== null, 'Body + email + role=button must qualify as eligible form');
        assert.strictEqual(discovered.id, 'custom-role-container');
    });

    // R6.2-10: Newsletter-only form rejected
    await runTest('R6.2-10: newsletter-only form rejected', async () => {
        const doc = createMockDocument();
        const newsletterForm = new MockNode('FORM', { id: 'newsletter-subscribe', className: 'newsletter-signup' });
        newsletterForm.appendChild(new MockNode('INPUT', { type: 'email', name: 'newsletter_email', placeholder: 'Subscribe to newsletter' }));
        newsletterForm.appendChild(new MockNode('BUTTON', { textContent: 'Subscribe' }));
        doc.body.appendChild(newsletterForm);

        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0 });
        const discovered = await engine.discoverForm(doc);

        assert.strictEqual(discovered, null, 'Newsletter subscription form without inquiry body must be rejected');
        assert.strictEqual(engine.lastDiscoveryResult.reasonCode, 'NO_BODY_FIELD_FOUND');
    });

    // R6.2-11: Newly recognized form dispatches autofill exactly once
    await runTest('R6.2-11: newly recognized form dispatches autofill exactly once', async () => {
        resetAutofillLatch();
        const mockForm = new MockNode('FORM', { id: 'bridge-test-form' });
        let dispatchCount = 0;

        const res1 = startAutofillForEligibleForm('att_101', { form: mockForm }, () => {
            dispatchCount++;
        });

        assert.strictEqual(res1.dispatched, true);
        assert.strictEqual(dispatchCount, 1);

        // Immediate duplicate call with same attemptId & formSignature
        const res2 = startAutofillForEligibleForm('att_101', { form: mockForm }, () => {
            dispatchCount++;
        });

        assert.strictEqual(res2.dispatched, false);
        assert.strictEqual(res2.reason, 'ALREADY_DISPATCHED');
        assert.strictEqual(dispatchCount, 1, 'Autofill executor must be invoked exactly once');
    });

    // R6.2-12: SPA duplicate guard does not suppress first start on new form/URL
    await runTest('R6.2-12: SPA duplicate guard does not suppress first start on new form', async () => {
        resetAutofillLatch();
        const formA = new MockNode('FORM', { id: 'form-alpha' });
        const formB = new MockNode('FORM', { id: 'form-beta' });
        let dispatched = [];

        // First form dispatch
        startAutofillForEligibleForm('att_1', { form: formA }, () => dispatched.push('alpha'));
        assert.deepStrictEqual(dispatched, ['alpha']);

        // New form on new navigation / signature must be allowed immediately
        startAutofillForEligibleForm('att_2', { form: formB }, () => dispatched.push('beta'));
        assert.deepStrictEqual(dispatched, ['alpha', 'beta'], 'Second unique form must not be suppressed by prior latch');
    });

    // R6.2-13: Framework node replacement rebinds
    await runTest('R6.2-13: framework node replacement rebinds', async () => {
        const doc = createMockDocument();
        const oldForm = new MockNode('FORM', { id: 'hydrated-form-1', className: 'contact-form-cls' });
        oldForm.appendChild(new MockNode('TEXTAREA', { name: 'msg' }));
        doc.body.appendChild(oldForm);

        const engine = new FormDiscoveryEngineR2();
        const sig = formDiscoveryModule.computeFormSignature(oldForm);

        // Simulate React replacing the DOM node
        doc.body.removeChild(oldForm);
        const newForm = new MockNode('FORM', { id: 'hydrated-form-1', className: 'contact-form-cls' });
        newForm.appendChild(new MockNode('TEXTAREA', { name: 'msg' }));
        doc.body.appendChild(newForm);

        const rebound = engine.rebindFormNode(oldForm, sig, doc);
        assert(rebound !== null, 'Rebind must discover the replacement DOM node');
        assert.strictEqual(rebound, newForm);
    });

    // R6.2-14: Eligible form but bridge failure reports AUTOFILL_BRIDGE_FAILED
    await runTest('R6.2-14: eligible form but bridge failure reports AUTOFILL_BRIDGE_FAILED', async () => {
        resetAutofillLatch();
        const mockForm = new MockNode('FORM', { id: 'bridge-fail-form' });

        const res = startAutofillForEligibleForm('att_fail', { form: mockForm }, () => {
            throw new Error('Simulated runtime autofill throw');
        });

        assert.strictEqual(res.dispatched, false);
        assert.strictEqual(res.reason, 'AUTOFILL_BRIDGE_FAILED');
        assert(res.error.includes('Simulated runtime autofill throw'));
    });

    // R6.2-15: No form after all 3 passes reports exact reason
    await runTest('R6.2-15: no form after all 3 passes reports exact reason', async () => {
        const doc = createMockDocument();
        // Document has no inputs or textareas at all
        const engine = new FormDiscoveryEngineR2({ pass1WaitMs: 0, pass2WaitMs: 10, pass3WaitMs: 10 });
        const discovered = await engine.discoverForm(doc);

        assert.strictEqual(discovered, null);
        assert(engine.lastDiscoveryResult !== null);
        assert.strictEqual(engine.lastDiscoveryResult.reasonCode, 'NO_BODY_FIELD_FOUND');
        assert.strictEqual(engine.lastDiscoveryResult.bodyCandidatesSeen, 0);
    });

    console.log('\n========================================================');
    console.log(`  R6.2 TEST RESULTS: ${passedTests} PASSED  |  ${failedTests} FAILED`);
    if (failedTests === 0) {
        console.log('  ALL R6.2 ACCEPTANCE TESTS PASSED');
    } else {
        console.error('  SOME R6.2 ACCEPTANCE TESTS FAILED');
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test suite failed unexpectedly:', err);
    process.exit(1);
});
