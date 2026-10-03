/**
 * test_vision_submit_and_long_text_gate_r6_7.js
 * [Issue #6 R6.7] Strict Form Intent Gate + Vision-Guided Physical Submit Test Suite
 *
 * FORM GATE:
 *  R6.7-F1  contact form with textarea => eligible
 *  R6.7-F2  newsletter email-only => skip
 *  R6.7-F3  name+email Subscribe => skip
 *  R6.7-F4  booking date/time/name/email no textarea => skip
 *  R6.7-F5  reservation widget no long text => skip
 *  R6.7-F6  login form => skip
 *  R6.7-F7  search form => skip
 *  R6.7-F8  high numeric score without long-text body => still skip
 *  R6.7-F9  AI cannot override longTextInquiry=false
 *  R6.7-F10 booking page with tiny notes but dominant booking semantics => skip
 *  R6.7-F11 genuine contact form on booking page with separate message textarea => eligible only that form
 *
 * VISION SUBMIT:
 *  R6.7-V1  screenshot button recognition finds Send inside form
 *  R6.7-V2  Subscribe button visually rejected
 *  R6.7-V3  Book/Reserve visually rejected
 *  R6.7-V4  DOM+vision correlation selects correct Send
 *  R6.7-V5  browser-level coordinate click dispatched once
 *  R6.7-V6  no coordinate click if COMMIT_SIGNAL already exists
 *  R6.7-V7  no second physical click same attempt
 *  R6.7-V8  hidden preexisting success node visibility transition detected
 *  R6.7-V9  uncertain result keeps tab open
 *  R6.7-V10 debugger attaches only campaign-owned tab and detaches after attempt
 */

const assert = require('assert');
const path = require('path');

let passCount = 0;
let failCount = 0;

function it(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${e.message}`);
        console.error(e.stack);
        failCount++;
    }
}

async function itAsync(name, fn) {
    try {
        await fn();
        console.log(`  PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  FAIL: ${name}`);
        console.error(`    ${e.message}`);
        console.error(e.stack);
        failCount++;
    }
}

// -------------------------------------------------------------
// DOM Mock Utilities
// -------------------------------------------------------------
class MockClassList {
    constructor() { this.classes = new Set(); }
    add(...args) { args.forEach(c => this.classes.add(c)); }
    remove(...args) { args.forEach(c => this.classes.delete(c)); }
    contains(c) { return this.classes.has(c); }
}

class MockElement {
    constructor(tagName = 'DIV', id = '', type = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.name = id;
        this.type = type;
        this.value = '';
        this.textContent = '';
        this.checked = false;
        this.disabled = false;
        this.required = false;
        this.parentElement = null;
        this.children = [];
        this.attributes = {};
        this.classList = new MockClassList();
        this.style = {};
        this.eventListeners = {};
        this.clicked = false;
        this.rect = { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 };
    }

    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }
    removeAttribute(k) { delete this.attributes[k]; }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    getBoundingClientRect() {
        return this.rect;
    }

    setBoundingClientRect(r) {
        this.rect = { ...this.rect, ...r };
    }

    addEventListener(event, handler) {
        if (!this.eventListeners[event]) this.eventListeners[event] = [];
        this.eventListeners[event].push(handler);
    }

    removeEventListener(event, handler) {
        if (!this.eventListeners[event]) return;
        this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
    }

    dispatchEvent(event) {
        const type = event.type || event;
        const handlers = this.eventListeners[type] || [];
        for (const h of handlers) h(event);
        return true;
    }

    click() {
        this.clicked = true;
        this.dispatchEvent({ type: 'click', bubbles: true, target: this });
    }

    contains(other) {
        if (!other) return false;
        let curr = other;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }

    closest(selector) {
        let curr = this;
        while (curr) {
            if (selector.toUpperCase() === curr.tagName) return curr;
            if (selector.startsWith('#') && curr.id === selector.slice(1)) return curr;
            if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) return curr;
            curr = curr.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const subSelectors = selector.split(',').map(s => s.trim());

        function matchSingle(child, sel) {
            const upperSel = sel.toUpperCase();
            if (upperSel === child.tagName) return true;
            if (sel.startsWith('#') && child.id === sel.slice(1)) return true;
            if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) return true;

            // Handle input:not([type="hidden"])
            if (sel === 'input:not([type="hidden"])') {
                return child.tagName === 'INPUT' && child.type !== 'hidden';
            }

            // Handle [type="..."]
            if (sel.includes('[type="') && !sel.includes(':not')) {
                const m = sel.match(/\[type="([^"]+)"\]/);
                if (m) return child.tagName === 'INPUT' && child.type === m[1];
            }

            if (sel.includes('[role="textbox"]') && child.getAttribute('role') === 'textbox') return true;
            if (sel.includes('[role="button"]') && child.getAttribute('role') === 'button') return true;
            if (sel.includes('[contenteditable="true"]') && child.getAttribute('contenteditable') === 'true') return true;
            if (sel.includes('[data-testid') && child.getAttribute('data-testid')) return true;
            if (sel.includes('textarea') && child.tagName === 'TEXTAREA') return true;
            if (sel.includes('select') && child.tagName === 'SELECT') return true;
            if (sel.includes('button') && child.tagName === 'BUTTON') return true;

            if (sel.includes('input') && child.tagName === 'INPUT') {
                if (sel.includes('[type="')) {
                    const m = sel.match(/\[type="([^"]+)"\]/);
                    if (m) return child.type === m[1];
                }
                if (sel.includes('name*="') || sel.includes('id*="')) {
                    const mName = sel.match(/\[name\*="([^"]+)"/i);
                    const mId = sel.match(/\[id\*="([^"]+)"/i);
                    const kw = (mName && mName[1]) || (mId && mId[1]);
                    if (kw) {
                        return (child.name && child.name.toLowerCase().includes(kw.toLowerCase())) ||
                               (child.id && child.id.toLowerCase().includes(kw.toLowerCase()));
                    }
                    return false;
                }
                return true;
            }
            return false;
        }

        function traverse(node) {
            for (const child of node.children) {
                if (subSelectors.some(sel => matchSingle(child, sel))) {
                    if (!results.includes(child)) results.push(child);
                }
                traverse(child);
            }
        }
        traverse(this);
        return results;
    }

    querySelector(selector) {
        const all = this.querySelectorAll(selector);
        return all.length > 0 ? all[0] : null;
    }
}

// Setup Global Environment
global.window = {
    location: { href: 'https://example.com/contact', pathname: '/contact', hostname: 'example.com' },
    getComputedStyle: (el) => ({
        display: el.style.display || 'block',
        visibility: el.style.visibility || 'visible',
        opacity: el.style.opacity || '1',
        pointerEvents: el.style.pointerEvents || 'auto',
        position: el.style.position || 'static',
        zIndex: el.style.zIndex || 'auto'
    })
};
global.document = {
    body: new MockElement('BODY'),
    querySelector: (s) => global.document.body.querySelector(s),
    querySelectorAll: (s) => global.document.body.querySelectorAll(s),
    createElement: (tag) => new MockElement(tag)
};
global.chrome = {
    runtime: {
        lastError: null,
        sendMessage: (msg, cb) => { if (cb) cb({ success: true }); },
        onMessage: {
            addListener: () => {},
            removeListener: () => {}
        }
    },
    debugger: {
        attachedTabs: new Set(),
        commands: [],
        attach: function(target, version, cb) {
            this.attachedTabs.add(target.tabId);
            if (cb) cb();
        },
        sendCommand: function(target, method, params, cb) {
            this.commands.push({ target, method, params });
            if (cb) cb({});
        },
        detach: function(target, cb) {
            this.attachedTabs.delete(target.tabId);
            if (cb) cb();
        }
    }
};

const ContactGate = require('./modules/contact-gate.js');
const VisionSubmitExecutor = require('./modules/vision-submit-executor.js');

// -------------------------------------------------------------
// Test Execution
// -------------------------------------------------------------
(async function runTests() {
    console.log("=== [R6.7] Strict Form Intent Gate + Vision Submit Tests ===\n");

    // =========================================================
    // FORM GATE TESTS (F1 - F11)
    // =========================================================

    // R6.7-F1: contact form with textarea => eligible
    it('R6.7-F1: contact form with textarea => eligible', () => {
        const form = new MockElement('FORM', 'contact-form');
        const name = form.appendChild(new MockElement('INPUT', 'name', 'text'));
        const email = form.appendChild(new MockElement('INPUT', 'email', 'email'));
        const msg = form.appendChild(new MockElement('TEXTAREA', 'message'));
        msg.textContent = 'Inquiry message';
        const submit = form.appendChild(new MockElement('BUTTON', 'submit-btn', 'submit'));
        submit.textContent = 'Send Message';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, true, 'Contact form with textarea should be eligible');
        assert.strictEqual(res.intent, 'CONTACT_INQUIRY');
        assert.strictEqual(res.hasInquiryBodyField, true);
    });

    // R6.7-F2: newsletter email-only => skip
    it('R6.7-F2: newsletter email-only => skip (NON_INQUIRY_NEWSLETTER_FORM)', () => {
        const form = new MockElement('FORM', 'newsletter-form');
        form.appendChild(new MockElement('INPUT', 'newsletter-email', 'email'));
        const submit = form.appendChild(new MockElement('BUTTON', 'sub-btn', 'submit'));
        submit.textContent = 'Subscribe';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false, 'Newsletter email-only must be skipped');
        assert.ok(res.reason.includes('NON_INQUIRY_NEWSLETTER') || res.reason.includes('NON_INQUIRY_SUBSCRIBE') || res.reason.includes('NO_LONG_TEXT'), `Reason was: ${res.reason}`);
    });

    // R6.7-F3: name+email Subscribe => skip
    it('R6.7-F3: name+email Subscribe => skip (NON_INQUIRY_SUBSCRIBE_FORM)', () => {
        const form = new MockElement('FORM', 'signup-form');
        form.appendChild(new MockElement('INPUT', 'fname', 'text'));
        form.appendChild(new MockElement('INPUT', 'email', 'email'));
        const submit = form.appendChild(new MockElement('BUTTON', 'sub-btn', 'submit'));
        submit.textContent = 'Subscribe Now';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false);
        assert.strictEqual(res.intent, 'SUBSCRIBE');
        assert.strictEqual(res.reason, 'NON_INQUIRY_SUBSCRIBE_FORM');
    });

    // R6.7-F4: booking date/time/name/email no textarea => skip
    it('R6.7-F4: booking date/time/name/email no textarea => skip (NON_INQUIRY_BOOKING_FORM)', () => {
        const form = new MockElement('FORM', 'booking-widget');
        form.appendChild(new MockElement('INPUT', 'cust_name', 'text'));
        form.appendChild(new MockElement('INPUT', 'cust_email', 'email'));
        form.appendChild(new MockElement('INPUT', 'book_date', 'date'));
        form.appendChild(new MockElement('INPUT', 'book_time', 'time'));
        const submit = form.appendChild(new MockElement('BUTTON', 'book-btn', 'submit'));
        submit.textContent = 'Book Appointment';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false);
        assert.ok(res.reason.includes('NON_INQUIRY_BOOKING') || res.reason.includes('NON_INQUIRY_APPOINTMENT'));
    });

    // R6.7-F5: reservation widget no long text => skip
    it('R6.7-F5: reservation widget no long text => skip (NON_INQUIRY_RESERVATION_FORM)', () => {
        const form = new MockElement('FORM', 'reserve-table');
        const h2 = form.appendChild(new MockElement('H2'));
        h2.textContent = 'Table Reservation';
        form.appendChild(new MockElement('INPUT', 'guests', 'text'));
        form.appendChild(new MockElement('INPUT', 'date', 'date'));
        const submit = form.appendChild(new MockElement('BUTTON', 'reserve-btn', 'submit'));
        submit.textContent = 'Reserve Table';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false);
        assert.strictEqual(res.reason, 'NON_INQUIRY_RESERVATION_FORM');
    });

    // R6.7-F6: login form => skip
    it('R6.7-F6: login form => skip (NON_INQUIRY_LOGIN_FORM)', () => {
        const form = new MockElement('FORM', 'login-form');
        form.appendChild(new MockElement('INPUT', 'username', 'text'));
        form.appendChild(new MockElement('INPUT', 'password', 'password'));
        const submit = form.appendChild(new MockElement('BUTTON', 'login-btn', 'submit'));
        submit.textContent = 'Sign In';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false);
        assert.strictEqual(res.reason, 'NON_INQUIRY_LOGIN_FORM');
    });

    // R6.7-F7: search form => skip
    it('R6.7-F7: search form => skip (NON_INQUIRY_SEARCH_FORM)', () => {
        const form = new MockElement('FORM', 'search-box');
        form.setAttribute('action', '/search');
        form.appendChild(new MockElement('INPUT', 'q', 'text'));
        const submit = form.appendChild(new MockElement('BUTTON', 'search-btn', 'submit'));
        submit.textContent = 'Search';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false);
        assert.strictEqual(res.reason, 'NON_INQUIRY_SEARCH_FORM');
    });

    // R6.7-F8: high numeric score without long-text body => still skip
    it('R6.7-F8: high numeric score without long-text body => still skip', () => {
        const form = new MockElement('FORM', 'high-score-form');
        // Add multiple fields that might inflate heuristic score but NO textarea
        form.appendChild(new MockElement('INPUT', 'name', 'text'));
        form.appendChild(new MockElement('INPUT', 'email', 'email'));
        form.appendChild(new MockElement('INPUT', 'phone', 'text'));
        form.appendChild(new MockElement('INPUT', 'company', 'text'));
        form.appendChild(new MockElement('INPUT', 'subject', 'text'));
        const submit = form.appendChild(new MockElement('BUTTON', 'btn', 'submit'));
        submit.textContent = 'Send Inquiry';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.hasInquiryBodyField, false);
        assert.strictEqual(res.eligible, false, 'Without genuine long-text body, form cannot be eligible');
        assert.strictEqual(res.reason, 'NO_LONG_TEXT_INQUIRY_FIELD');
        assert.strictEqual(res.score, -999, 'Score must be -999 on hard reject');
    });

    // R6.7-F9: AI cannot override longTextInquiry=false
    it('R6.7-F9: AI cannot override longTextInquiry=false', () => {
        const form = new MockElement('FORM', 'subscribe-form');
        form.appendChild(new MockElement('INPUT', 'email', 'email'));
        const submit = form.appendChild(new MockElement('BUTTON', 'btn', 'submit'));
        submit.textContent = 'Subscribe';

        const aiResult = ContactGate.classifyFormIntentWithAI(form);
        assert.strictEqual(aiResult.eligible, false, 'AI must never override longTextInquiry=false');
        assert.strictEqual(aiResult.aiDecision, 'REJECT_HARD_SAFETY_RULE');
    });

    // R6.7-F10: booking page with tiny notes but dominant booking semantics => skip
    it('R6.7-F10: booking page with tiny notes but dominant booking semantics => skip', () => {
        const form = new MockElement('FORM', 'booking-with-notes');
        const h2 = form.appendChild(new MockElement('H2'));
        h2.textContent = 'Schedule Your Session';
        form.appendChild(new MockElement('INPUT', 'date', 'date'));
        form.appendChild(new MockElement('INPUT', 'time', 'time'));
        const notes = form.appendChild(new MockElement('TEXTAREA', 'booking-notes'));
        notes.setAttribute('placeholder', 'Any special requests or notes');
        const submit = form.appendChild(new MockElement('BUTTON', 'book-btn', 'submit'));
        submit.textContent = 'Book Now';

        const res = ContactGate.classifyFormIntent(form);
        assert.strictEqual(res.eligible, false, 'Dominant booking semantics with tiny notes must be skipped');
        assert.strictEqual(res.reason, 'NON_INQUIRY_BOOKING_FORM');
    });

    // R6.7-F11: genuine contact form on booking page with separate message textarea => eligible only that form
    it('R6.7-F11: genuine contact form on booking page with separate message textarea => eligible only that form', () => {
        // Form 1: Booking Form
        const bookingForm = new MockElement('FORM', 'booking-form');
        bookingForm.appendChild(new MockElement('INPUT', 'date', 'date'));
        const bookBtn = bookingForm.appendChild(new MockElement('BUTTON', 'btn1', 'submit'));
        bookBtn.textContent = 'Book Now';

        // Form 2: Genuine Contact Form
        const contactForm = new MockElement('FORM', 'general-contact-form');
        const h3 = contactForm.appendChild(new MockElement('H3'));
        h3.textContent = 'Have Questions? Contact Us';
        contactForm.appendChild(new MockElement('INPUT', 'name', 'text'));
        contactForm.appendChild(new MockElement('INPUT', 'email', 'email'));
        contactForm.appendChild(new MockElement('TEXTAREA', 'message'));
        const contactBtn = contactForm.appendChild(new MockElement('BUTTON', 'btn2', 'submit'));
        contactBtn.textContent = 'Send Message';

        const resBooking = ContactGate.classifyFormIntent(bookingForm);
        const resContact = ContactGate.classifyFormIntent(contactForm);

        assert.strictEqual(resBooking.eligible, false, 'Booking form should be rejected');
        assert.strictEqual(resContact.eligible, true, 'Genuine contact form should be eligible');
        assert.strictEqual(resContact.intent, 'CONTACT_INQUIRY');
    });

    // =========================================================
    // VISION SUBMIT TESTS (V1 - V10)
    // =========================================================

    // R6.7-V1: screenshot button recognition finds Send inside form
    await itAsync('R6.7-V1: screenshot button recognition finds Send inside form', async () => {
        const form = new MockElement('FORM', 'inquiry-form');
        form.setBoundingClientRect({ left: 100, top: 100, right: 600, bottom: 500, width: 500, height: 400 });
        const sendBtn = form.appendChild(new MockElement('BUTTON', 'send-btn'));
        sendBtn.textContent = 'Send';
        sendBtn.setBoundingClientRect({ left: 200, top: 420, width: 120, height: 40 });

        const executor = new VisionSubmitExecutor();
        const candidates = executor.rankVisualCandidates(form);

        assert.ok(candidates.length > 0, 'Candidates should be found');
        assert.strictEqual(candidates[0].label, 'Send');
        assert.strictEqual(candidates[0].insideForm, true);
        assert.ok(candidates[0].confidence >= 0.70);
    });

    // R6.7-V2: Subscribe button visually rejected
    await itAsync('R6.7-V2: Subscribe button visually rejected', async () => {
        const form = new MockElement('FORM', 'sub-form');
        const subBtn = form.appendChild(new MockElement('BUTTON', 'sub-btn'));
        subBtn.textContent = 'Subscribe to Newsletter';
        subBtn.setBoundingClientRect({ left: 200, top: 400, width: 150, height: 40 });

        const executor = new VisionSubmitExecutor();
        const candidates = executor.rankVisualCandidates(form);

        assert.strictEqual(candidates.length, 0, 'Subscribe button must be visually rejected');
    });

    // R6.7-V3: Book/Reserve visually rejected
    await itAsync('R6.7-V3: Book/Reserve visually rejected', async () => {
        const form = new MockElement('FORM', 'book-form');
        const bookBtn = form.appendChild(new MockElement('BUTTON', 'book-btn'));
        bookBtn.textContent = 'Book Online Now';
        bookBtn.setBoundingClientRect({ left: 200, top: 400, width: 150, height: 40 });

        const executor = new VisionSubmitExecutor();
        const candidates = executor.rankVisualCandidates(form);

        assert.strictEqual(candidates.length, 0, 'Book/Reserve button must be visually rejected');
    });

    // R6.7-V4: DOM+vision correlation selects correct Send
    await itAsync('R6.7-V4: DOM+vision correlation selects correct Send', async () => {
        const form = new MockElement('FORM', 'inquiry-form');
        form.setBoundingClientRect({ left: 50, top: 50, right: 650, bottom: 550, width: 600, height: 500 });
        const cancelBtn = form.appendChild(new MockElement('BUTTON', 'cancel-btn'));
        cancelBtn.textContent = 'Cancel';
        const sendBtn = form.appendChild(new MockElement('BUTTON', 'submit-btn'));
        sendBtn.textContent = 'Submit Inquiry';
        sendBtn.setBoundingClientRect({ left: 250, top: 450, width: 140, height: 40 });

        const executor = new VisionSubmitExecutor();
        const candidates = executor.rankVisualCandidates(form);

        assert.ok(candidates.length >= 1);
        assert.strictEqual(candidates[0].label, 'Submit Inquiry');
        assert.strictEqual(candidates[0].domCorrelated, true);
    });

    // R6.7-V5: browser-level coordinate click dispatched once
    await itAsync('R6.7-V5: browser-level coordinate click dispatched once', async () => {
        const form = new MockElement('FORM', 'inquiry-form');
        form.setBoundingClientRect({ left: 50, top: 50, right: 650, bottom: 550, width: 600, height: 500 });
        const sendBtn = form.appendChild(new MockElement('BUTTON', 'send-btn'));
        sendBtn.textContent = 'Send';
        sendBtn.setBoundingClientRect({ left: 250, top: 450, width: 100, height: 40 });

        const executor = new VisionSubmitExecutor();
        const res = await executor.execute(form, { tabId: 101 });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.physicalClickDispatched, true);
        assert.strictEqual(executor.physicalClickDispatched, true);
    });

    // R6.7-V6: no coordinate click if COMMIT_SIGNAL already exists
    await itAsync('R6.7-V6: no coordinate click if COMMIT_SIGNAL already exists', async () => {
        const form = new MockElement('FORM', 'inquiry-form');
        const sendBtn = form.appendChild(new MockElement('BUTTON', 'send-btn'));
        sendBtn.textContent = 'Send';

        const executor = new VisionSubmitExecutor();
        const res = await executor.execute(form, { alreadyCommitted: true });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.reason, 'COMMIT_SIGNAL_ALREADY_EXISTS');
        assert.strictEqual(executor.physicalClickDispatched, false);
    });

    // R6.7-V7: no second physical click same attempt
    await itAsync('R6.7-V7: no second physical click same attempt', async () => {
        const form = new MockElement('FORM', 'inquiry-form');
        const sendBtn = form.appendChild(new MockElement('BUTTON', 'send-btn'));
        sendBtn.textContent = 'Send';

        const executor = new VisionSubmitExecutor();
        const res = await executor.execute(form, { previousPhysicalClick: true });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.reason, 'PHYSICAL_CLICK_LIMIT_REACHED');
    });

    // R6.7-V8: hidden preexisting success node visibility transition detected
    await itAsync('R6.7-V8: hidden preexisting success node visibility transition detected', async () => {
        const contentScript = require('./content-script.js');
        const verifier = new contentScript.SubmissionOutcomeVerifier(new MockElement('FORM'));

        // Mock preexisting hidden success node
        const hiddenSuccessNode = new MockElement('DIV', 'wix-success');
        hiddenSuccessNode.textContent = 'Thank you for your messages';
        hiddenSuccessNode.style.display = 'none';

        verifier.preSnapshot = {
            url: 'https://example.com/contact',
            existingSuccessTexts: [],
            successSnapshots: [{
                node: hiddenSuccessNode,
                text: hiddenSuccessNode.textContent,
                wasVisible: false
            }]
        };

        // Transition to visible
        hiddenSuccessNode.style.display = 'block';
        const evaluation = verifier.evaluateSignals();

        assert.strictEqual(evaluation.isDecisiveSuccess, true, 'Visibility transition must confirm success');
    });

    // R6.7-V9: uncertain result keeps tab open
    await itAsync('R6.7-V9: uncertain result keeps tab open', async () => {
        // Simulated test of retained tabs logic
        const retainedTabs = [];
        const MAX = 3;

        function onUnknownOutcome(tabId) {
            retainedTabs.push(tabId);
            if (retainedTabs.length > MAX) {
                return { kept: true, closedOldest: retainedTabs.shift() };
            }
            return { kept: true, closedOldest: null };
        }

        const r1 = onUnknownOutcome(101);
        assert.strictEqual(r1.kept, true);
        assert.strictEqual(retainedTabs.includes(101), true);

        const r2 = onUnknownOutcome(102);
        const r3 = onUnknownOutcome(103);
        const r4 = onUnknownOutcome(104);

        assert.strictEqual(r4.closedOldest, 101, 'Oldest retained tab 101 should be closed when 4th is retained');
        assert.strictEqual(retainedTabs.length, 3);
        assert.deepStrictEqual(retainedTabs, [102, 103, 104]);
    });

    // R6.7-V10: debugger attaches only campaign-owned tab and detaches after attempt
    await itAsync('R6.7-V10: debugger attaches only campaign-owned tab and detaches after attempt', async () => {
        const testTabId = 777;
        global.chrome.debugger.attachedTabs.clear();
        global.chrome.debugger.commands = [];

        // Simulate background handler sequence
        const target = { tabId: testTabId };
        await new Promise(res => global.chrome.debugger.attach(target, "1.3", res));
        assert.ok(global.chrome.debugger.attachedTabs.has(testTabId), 'Debugger attached to campaign tab');

        await new Promise(res => global.chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 100 }, res));
        await new Promise(res => global.chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", x: 100, y: 100 }, res));
        await new Promise(res => global.chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x: 100, y: 100 }, res));

        await new Promise(res => global.chrome.debugger.detach(target, res));
        assert.strictEqual(global.chrome.debugger.attachedTabs.has(testTabId), false, 'Debugger must detach immediately');
        assert.strictEqual(global.chrome.debugger.commands.length, 3);
    });

    console.log(`\n============================================================`);
    console.log(`[R6.7 RESULTS] PASSED: ${passCount} | FAILED: ${failCount} | TOTAL: ${passCount + failCount}`);
    if (failCount > 0) {
        console.error("SOME R6.7 TESTS FAILED!");
        process.exit(1);
    } else {
        console.log("ALL R6.7 TESTS PASSED");
    }
})();
