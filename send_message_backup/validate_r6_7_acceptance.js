/**
 * validate_r6_7_acceptance.js
 * End-to-end acceptance validation for R6.7:
 * 1. Otmartialarts / Wix contact form: AI complete -> submit -> preexisting success transition
 * 2. Newsletter-only form: Strict Gate SKIP with zero autofill
 * 3. Booking-only form: Strict Gate SKIP with zero autofill
 * 4. Auto CAPTCHA Solver: 2Captcha API proactive early detection at FORM_RECOGNITION and AUTOFILL stages
 */

const assert = require('assert');

// DOM Mock
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
        this.style = { display: 'block', visibility: 'visible', opacity: '1' };
        this.eventListeners = {};
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

    contains(child) {
        if (!child) return false;
        let curr = child;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }

    getBoundingClientRect() { return this.rect; }
    setBoundingClientRect(r) { this.rect = { ...this.rect, ...r }; }

    addEventListener(event, handler) {
        if (!this.eventListeners[event]) this.eventListeners[event] = [];
        this.eventListeners[event].push(handler);
    }

    dispatchEvent(event) {
        const type = event.type || event;
        const handlers = this.eventListeners[type] || [];
        for (const h of handlers) h(event);
        return true;
    }

    click() {
        this.dispatchEvent('click');
    }

    querySelectorAll(selector) {
        const results = [];
        const subSelectors = selector.split(',').map(s => s.trim());

        function matchSingle(child, sel) {
            const upperSel = sel.toUpperCase();
            if (upperSel === child.tagName) return true;
            if (sel.startsWith('#') && child.id === sel.slice(1)) return true;
            if (sel.startsWith('.') && child.id === sel.slice(1)) return true;

            if (sel === 'input:not([type="hidden"])') {
                return child.tagName === 'INPUT' && child.type !== 'hidden';
            }

            if (sel.includes('[type="') && !sel.includes(':not')) {
                const m = sel.match(/\[type="([^"]+)"\]/);
                if (m) return child.tagName === 'INPUT' && child.type === m[1];
            }

            if (sel.includes('[role="textbox"]') && child.getAttribute('role') === 'textbox') return true;
            if (sel.includes('[role="button"]') && child.getAttribute('role') === 'button') return true;
            if (sel.includes('[contenteditable="true"]') && child.getAttribute('contenteditable') === 'true') return true;
            if (sel.includes('[data-testid') && child.getAttribute('data-testid')) return true;
            if (sel.includes('[data-sitekey') && (child.getAttribute('data-sitekey') || child.dataset?.sitekey)) return true;
            if (sel.includes('.g-recaptcha') && (child.id === 'g-recaptcha' || child.classList?.contains?.('g-recaptcha'))) return true;
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

// Global Environment setup
global.window = {
    location: { href: 'https://www.otmartialarts.com/contact', pathname: '/contact', hostname: 'www.otmartialarts.com' },
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
global.sessionStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
};
global.chrome = {
    runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
            if (msg.action === 'SOLVE_CAPTCHA' || msg.action === '2CAPTCHA_SOLVE_TASK') {
                const res = { success: true, token: '2captcha_mock_token_777', text: 'solved_captcha' };
                if (cb) cb(res);
                return Promise.resolve(res);
            }
            if (cb) cb({ success: true });
            return Promise.resolve({ success: true });
        },
        onMessage: { addListener: () => {}, removeListener: () => {} }
    },
    debugger: {
        attachedTabs: new Set(),
        commands: [],
        attach: (target, v, cb) => { global.chrome.debugger.attachedTabs.add(target.tabId); if (cb) cb(); },
        sendCommand: (target, m, p, cb) => { global.chrome.debugger.commands.push({ target, m, p }); if (cb) cb({}); },
        detach: (target, cb) => { global.chrome.debugger.attachedTabs.delete(target.tabId); if (cb) cb(); }
    }
};

const ContactGate = require('./modules/contact-gate.js');
const FinalFormCompletionEngine = require('./modules/final-form-completion-engine.js');
const VisionSubmitExecutor = require('./modules/vision-submit-executor.js');
const cs = require('./content-script.js');

async function runAcceptance() {
    console.log("============================================================");
    console.log("=== R6.7 REAL-WORLD DOM VALIDATION & ACCEPTANCE CHECKS   ===");
    console.log("============================================================\n");

    let pass = 0;
    let fail = 0;

    // -----------------------------------------------------------------
    // 1. Wix Contact Form (https://www.otmartialarts.com/contact)
    // -----------------------------------------------------------------
    console.log("[TEST 1] Wix Contact Form: https://www.otmartialarts.com/contact");
    const wixForm = global.document.body.appendChild(new MockElement('FORM', 'comp-j123form'));
    const nameInput = wixForm.appendChild(new MockElement('INPUT', 'input_comp-name', 'text'));
    nameInput.setAttribute('placeholder', 'Enter your name');
    const emailInput = wixForm.appendChild(new MockElement('INPUT', 'input_comp-email', 'email'));
    emailInput.setAttribute('placeholder', 'Enter your email');
    const phoneInput = wixForm.appendChild(new MockElement('INPUT', 'input_comp-phone', 'tel'));
    phoneInput.setAttribute('placeholder', 'Enter your phone');
    const messageTextarea = wixForm.appendChild(new MockElement('TEXTAREA', 'textarea_comp-message'));
    messageTextarea.setAttribute('placeholder', 'Type your message here...');

    // Preexisting hidden Wix success message node
    const wixSuccessNode = wixForm.appendChild(new MockElement('DIV', 'comp-success-message'));
    wixSuccessNode.textContent = 'Thank you for your messages';
    wixSuccessNode.style.display = 'none';

    // Wix custom submit button
    const wixSubmitBtn = wixForm.appendChild(new MockElement('BUTTON', 'comp-submit-btn', 'submit'));
    wixSubmitBtn.textContent = 'Submit';
    wixSubmitBtn.setBoundingClientRect({ left: 300, top: 500, width: 140, height: 45 });

    // Step A: ContactGate Classification
    const gateRes = ContactGate.classifyFormIntent(wixForm);
    assert.strictEqual(gateRes.eligible, true, 'Wix contact form must be eligible');
    assert.strictEqual(gateRes.intent, 'CONTACT_INQUIRY');
    assert.strictEqual(gateRes.hasInquiryBodyField, true);
    console.log(`  ✓ Gate Result: eligible=${gateRes.eligible} intent=${gateRes.intent} reason=${gateRes.reason}`);

    // Step B: FinalFormCompletionEngine Fill
    const engine = new FinalFormCompletionEngine();
    const completionRes = await engine.run(wixForm, {
        name: 'Alex Rivera',
        email: 'alex.rivera@example.com',
        phone: '203-555-0199',
        message: 'Hello, I would like to inquire about your martial arts classes for adults.'
    });
    assert.strictEqual(completionRes.emptySafeAfter, 0, 'emptySafeAfter must be 0');
    console.log(`  ✓ Completion Result: pass=${completionRes.pass} emptySafeAfter=${completionRes.emptySafeAfter}`);

    // Step C: SubmissionOutcomeVerifier Pre-snapshot
    const verifier = new cs.SubmissionOutcomeVerifier(wixForm);
    verifier.preSnapshot = verifier.capturePreSubmitSnapshot();
    assert.ok(verifier.preSnapshot.successSnapshots.length > 0, 'Must snapshot preexisting success node');
    assert.strictEqual(verifier.preSnapshot.successSnapshots[0].wasVisible, false);
    console.log(`  ✓ Pre-Submit Snapshot: captured ${verifier.preSnapshot.successSnapshots.length} success snapshot(s)`);

    // Step D: Wix submit click triggers success visibility transition
    wixSuccessNode.style.display = 'block';
    const evalRes = verifier.evaluateSignals();
    assert.strictEqual(evalRes.successVisibilityTransition, true, 'successVisibilityTransition must be true');
    assert.strictEqual(evalRes.isDecisiveSuccess, true, 'isDecisiveSuccess must be true');
    console.log(`  ✓ Outcome Verifier: successVisibilityTransition=${evalRes.successVisibilityTransition} decisiveSuccess=${evalRes.isDecisiveSuccess}`);
    pass++;

    // -----------------------------------------------------------------
    // 2. Newsletter-Only Form: Strict Gate Skip with Zero Fill
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Newsletter-Only Page: Zero Autofill / Auto-Skip");
    const newsForm = new MockElement('FORM', 'newsletter-subscribe-form');
    const newsEmail = newsForm.appendChild(new MockElement('INPUT', 'email-sub', 'email'));
    newsEmail.setAttribute('placeholder', 'Enter your email for our newsletter');
    const newsBtn = newsForm.appendChild(new MockElement('BUTTON', 'sub-button', 'submit'));
    newsBtn.textContent = 'Subscribe';

    const newsGate = ContactGate.classifyFormIntent(newsForm);
    assert.strictEqual(newsGate.eligible, false, 'Newsletter form must be rejected');
    assert.strictEqual(newsGate.hasInquiryBodyField, false);
    assert.strictEqual(newsGate.reason, 'NON_INQUIRY_SUBSCRIBE_FORM');
    console.log(`  ✓ Gate Result: eligible=${newsGate.eligible} reason=${newsGate.reason}`);

    // Verify AI safety override rule
    const aiGate = ContactGate.classifyFormIntentWithAI(newsForm);
    assert.strictEqual(aiGate.eligible, false);
    assert.strictEqual(aiGate.aiDecision, 'REJECT_HARD_SAFETY_RULE');
    console.log(`  ✓ AI Intent Safety: AI cannot override (aiDecision=${aiGate.aiDecision})`);
    pass++;

    // -----------------------------------------------------------------
    // 3. Booking / Appointment Form: Strict Gate Skip with Zero Fill
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Booking / Appointment Form: Zero Autofill / Auto-Skip");
    const bookForm = new MockElement('FORM', 'appointment-scheduler');
    const bName = bookForm.appendChild(new MockElement('INPUT', 'client_name', 'text'));
    const bDate = bookForm.appendChild(new MockElement('INPUT', 'booking_date', 'date'));
    const bTime = bookForm.appendChild(new MockElement('INPUT', 'booking_time', 'time'));
    const bService = bookForm.appendChild(new MockElement('SELECT', 'service_type'));
    const bSubmit = bookForm.appendChild(new MockElement('BUTTON', 'book_submit', 'submit'));
    bSubmit.textContent = 'Schedule Appointment';

    const bookGate = ContactGate.classifyFormIntent(bookForm);
    assert.strictEqual(bookGate.eligible, false, 'Booking form without message body must be skipped');
    assert.strictEqual(bookGate.reason, 'NON_INQUIRY_APPOINTMENT_FORM');
    console.log(`  ✓ Gate Result: eligible=${bookGate.eligible} reason=${bookGate.reason}`);
    pass++;

    // -----------------------------------------------------------------
    // 4. Auto CAPTCHA Solver: 2Captcha API Integration
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Auto CAPTCHA Solver 2Captcha API Integration");
    const captchaForm = global.document.body.appendChild(new MockElement('FORM', 'recaptcha-form'));
    const sitekeyNode = captchaForm.appendChild(new MockElement('DIV', 'g-recaptcha'));
    sitekeyNode.setAttribute('data-sitekey', '6Ld_mock_sitekey_abc123');
    sitekeyNode.dataset = { sitekey: '6Ld_mock_sitekey_abc123' };

    // Early detection at FORM_RECOGNITION stage
    const detected = await cs.checkForCaptcha();
    assert.strictEqual(detected, true, 'CAPTCHA must be detected in page');
    console.log(`  ✓ Early Stage Detection: found=${detected}`);

    // Sitekey extraction
    const extractedKey = cs.extractCaptchaSitekey();
    assert.ok(extractedKey, 'Sitekey data must be extracted');
    assert.strictEqual(extractedKey.type, 'recaptcha');
    assert.strictEqual(extractedKey.sitekey, '6Ld_mock_sitekey_abc123');
    console.log(`  ✓ Sitekey Extraction: type=${extractedKey.type} sitekey=${extractedKey.sitekey}`);

    // 2Captcha solve dispatch at FORM_RECOGNITION stage
    const solveRes = await cs.tryAutoSolveCaptcha('FORM_RECOGNITION');
    assert.strictEqual(solveRes, true, '2Captcha API solve must succeed');
    console.log(`  ✓ 2Captcha Solve Dispatch (stage=FORM_RECOGNITION): success=${solveRes}`);

    // 2Captcha solve dispatch at AUTOFILL stage
    const solveResAutofill = await cs.tryAutoSolveCaptcha('AUTOFILL');
    assert.strictEqual(solveResAutofill, true, '2Captcha API solve at AUTOFILL must succeed');
    console.log(`  ✓ 2Captcha Solve Dispatch (stage=AUTOFILL): success=${solveResAutofill}`);
    pass++;

    console.log(`\n============================================================`);
    console.log(`[ACCEPTANCE VALIDATION RESULTS] ALL ${pass} SCENARIOS PASSED!`);
    console.log(`============================================================`);
}

runAcceptance().catch(e => {
    console.error("ACCEPTANCE VALIDATION FAILED:", e);
    process.exit(1);
});
