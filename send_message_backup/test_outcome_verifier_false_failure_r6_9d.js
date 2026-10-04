/**
 * test_outcome_verifier_false_failure_r6_9d.js
 * 
 * Issue #6 R6.9D Outcome Verifier False-Failure & Delta-Based Negative Signals Test Suite
 * Minimum 17 Regression Tests + Real Runtime Acceptance Criteria (A-E)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Active timer tracking across tests
let activeTimers = [];
function safeSetTimeout(fn, ms) {
    const t = setTimeout(fn, ms);
    activeTimers.push(t);
    return t;
}

// Setup mock DOM & Chrome environment
class MockElement {
    constructor(tagName, attrs = {}, text = '') {
        this.tagName = (tagName || 'DIV').toUpperCase();
        this.id = attrs.id || '';
        this.className = attrs.className || '';
        this.name = attrs.name || '';
        this.textContent = text || '';
        this.innerText = text || '';
        this.value = attrs.value || '';
        this.attributes = { ...attrs };
        this.style = { display: attrs.display || 'block', visibility: 'visible', opacity: '1', ...(attrs.style || {}) };
        this.validity = attrs.validity || { valid: true };
        this.disabled = !!attrs.disabled;
        this.children = [];
        this.parentElement = null;
        this._listeners = {};
    }
    getAttribute(name) {
        return this.attributes[name] !== undefined ? String(this.attributes[name]) : null;
    }
    setAttribute(name, val) {
        this.attributes[name] = String(val);
    }
    removeAttribute(name) {
        delete this.attributes[name];
    }
    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }
    contains(el) {
        if (!el) return false;
        if (this === el) return true;
        if (this.children.includes(el)) return true;
        return this.children.some(c => c.contains && c.contains(el));
    }
    querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
        const matches = [];
        const matchFn = (el) => {
            if (sel.includes('#') && el.id && sel.includes('#' + el.id)) return true;
            if (sel.includes('.') && el.className) {
                const classes = el.className.split(/\s+/);
                for (const c of classes) {
                    if (c && sel.includes('.' + c)) return true;
                }
            }
            if (sel.includes('[aria-invalid="true"]') && el.getAttribute('aria-invalid') === 'true') return true;
            if (sel.includes('[role="alert"]') && el.getAttribute('role') === 'alert') return true;
            if (sel.includes('[role="status"]') && el.getAttribute('role') === 'status') return true;
            if (sel.includes('textarea') && el.tagName === 'TEXTAREA') return true;
            if (sel.includes('input') && el.tagName === 'INPUT') return true;
            if (sel.includes('button') && el.tagName === 'BUTTON') return true;
            if (sel.includes('div') && el.tagName === 'DIV') return true;
            if (sel.includes('p') && el.tagName === 'P') return true;
            if (sel.includes('span') && el.tagName === 'SPAN') return true;
            return false;
        };
        const walk = (node) => {
            if (matchFn(node)) matches.push(node);
            for (const c of node.children) walk(c);
        };
        for (const c of this.children) walk(c);
        return matches;
    }
    addEventListener(type, fn, opts) {
        this._listeners[type] = this._listeners[type] || [];
        this._listeners[type].push(fn);
    }
    removeEventListener(type, fn) {
        if (!this._listeners[type]) return;
        this._listeners[type] = this._listeners[type].filter(l => l !== fn);
    }
    dispatchEvent(ev) {
        if (this._listeners[ev.type]) {
            for (const fn of this._listeners[ev.type]) fn(ev);
        }
    }
}

class MockStorage {
    constructor() { this.store = {}; }
    get(keys, cb) {
        const res = {};
        const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
        for (const k of keyList) if (this.store[k] !== undefined) res[k] = this.store[k];
        if (typeof cb === 'function') cb(res);
        return Promise.resolve(res);
    }
    set(obj, cb) {
        Object.assign(this.store, obj);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
    }
    remove(keys, cb) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete this.store[k];
        if (typeof cb === 'function') cb();
        return Promise.resolve();
    }
}

global.window = {
    location: { href: 'https://seido.com/contact-honbu' },
    getComputedStyle: (el) => (el && el.style ? el.style : { display: 'block', visibility: 'visible', opacity: '1' })
};

const mockBody = new MockElement('BODY');
global.document = {
    body: mockBody,
    querySelectorAll: (sel) => mockBody.querySelectorAll(sel),
    querySelector: (sel) => mockBody.querySelector(sel),
    addEventListener: (ev, fn) => mockBody.addEventListener(ev, fn),
    removeEventListener: (ev, fn) => mockBody.removeEventListener(ev, fn)
};

const capturedLogs = [];
global.chrome = {
    runtime: {
        sendMessage: async (msg) => {
            capturedLogs.push(msg);
            return { success: true };
        },
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} }
    },
    storage: {
        local: {
            get: (k, cb) => cb ? cb({}) : Promise.resolve({}),
            set: (obj, cb) => cb ? cb() : Promise.resolve()
        }
    }
};

global.sessionStorage = {
    _s: {},
    getItem(k) { return this._s[k] || null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; }
};

global.self = global;

// Load Content Script
const contentScript = require('./content-script.js');
const SubmissionOutcomeVerifier = contentScript.SubmissionOutcomeVerifier || global.__xpiderSubmissionOutcomeVerifier;
const HistoryStoreModule = require('./modules/history-store.js');
const HistoryStore = HistoryStoreModule.HistoryStore || HistoryStoreModule;

async function runTests() {
    console.log('======================================================================');
    console.log(' [R6.9D TEST SUITE: Outcome Verifier False-Failure & Delta Signals]  ');
    console.log('======================================================================\n');

    let passed = 0;
    let failed = 0;

    function resetDOM() {
        activeTimers.forEach(clearTimeout);
        activeTimers = [];
        mockBody.children = [];
        mockBody.textContent = 'Contact Honbu Office - Inquiries';
        global.window.location.href = 'https://seido.com/contact-honbu';
    }

    async function runTest(name, fn) {
        resetDOM();
        try {
            await fn();
            console.log(`✅ PASS: [Test ${name}]`);
            passed++;
        } catch (e) {
            console.error(`❌ FAIL: [Test ${name}]`);
            console.error(`   Error: ${e.message}\n`, e.stack);
            failed++;
        }
    }

    // -------------------------------------------------------------
    // Test 1: pre-existing hidden "could not send message" + later thank-you => SUCCESS
    // -------------------------------------------------------------
    await runTest('1: pre-existing hidden "could not send message" + later thank-you => SUCCESS', async () => {
        const form = new MockElement('FORM', { id: 'contact_form' });
        mockBody.appendChild(form);
        const hiddenErr = new MockElement('DIV', { className: 'error-msg', style: { display: 'none' } }, 'Could not send message. Please retry later.');
        form.appendChild(hiddenErr);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        assert.strictEqual(verifier.preSnapshot.negativeSignals.serverErrorNodes.length, 1);
        assert.strictEqual(verifier.preSnapshot.negativeSignals.serverErrorNodes[0].wasVisible, false);

        // Later (after 100ms), thank you arrives while hidden error remains hidden
        safeSetTimeout(() => {
            const thankYou = new MockElement('DIV', { role: 'alert', className: 'message-success' }, 'Thank you! Your message has been sent successfully.');
            mockBody.appendChild(thankYou);
        }, 100);

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'CONFIRMED_SUCCESS');
        assert.strictEqual(res.success, true);
    });

    // -------------------------------------------------------------
    // Test 2: pre-existing visible "submission failed" text unchanged + submitEvent + no result => UNKNOWN, not FAILURE
    // -------------------------------------------------------------
    await runTest('2: pre-existing visible "submission failed" text unchanged + submitEvent => UNKNOWN', async () => {
        const form = new MockElement('FORM', { id: 'inquiry_form' });
        mockBody.appendChild(form);
        const staticText = new MockElement('DIV', { className: 'disclaimer' }, 'In case of submission failed notification, call office directly.');
        mockBody.appendChild(staticText);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { extendedWaitMs: 600, intervalMs: 50 });
        verifier.prepare();

        const res = await verifier.verify({ success: true, submitEventFired: true, networkCommitObserved: true });
        assert.strictEqual(res.decision, 'DELIVERY_UNKNOWN', 'Unchanged visible error text must not cause SUBMISSION_SERVER_ERROR');
        assert.strictEqual(res.success, false);
    });

    // -------------------------------------------------------------
    // Test 3: pre-existing "an error occurred while processing" unchanged => not server failure
    // -------------------------------------------------------------
    await runTest('3: pre-existing "an error occurred while processing" unchanged => not server failure', async () => {
        mockBody.textContent = 'Note: If an error occurred while processing, please contact support.';
        const form = new MockElement('FORM', { id: 'f_test' });
        mockBody.appendChild(form);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        const signals = verifier.evaluateSignals();
        assert.strictEqual(signals.serverErrorFound, false, 'Pre-existing server error in body text must not trigger serverErrorFound');
        assert.strictEqual(signals.serverErrorTransition, false);
    });

    // -------------------------------------------------------------
    // Test 4: NEW hidden->visible server error after submit => FAILURE
    // -------------------------------------------------------------
    await runTest('4: NEW hidden->visible server error after submit => FAILURE', async () => {
        const form = new MockElement('FORM', { id: 'f_err' });
        mockBody.appendChild(form);
        const hiddenErr = new MockElement('DIV', { id: 'server_err_div', style: { display: 'none' } }, '500 Internal Server Error: backend database unreachable');
        mockBody.appendChild(hiddenErr);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        // After submit, hidden error becomes visible
        hiddenErr.style.display = 'block';

        const signals = verifier.evaluateSignals();
        assert.strictEqual(signals.domServerErrorTransition, true);
        assert.strictEqual(signals.serverErrorTransition, true);
        assert.strictEqual(signals.matchedServerError, '500 internal server error');

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'SUBMISSION_SERVER_ERROR');
        assert.strictEqual(res.success, false);
    });

    // -------------------------------------------------------------
    // Test 5: NEW server-error text mutation after submit => FAILURE
    // -------------------------------------------------------------
    await runTest('5: NEW server-error text mutation after submit => FAILURE', async () => {
        const form = new MockElement('FORM', { id: 'f_mut' });
        mockBody.appendChild(form);
        const statusDiv = new MockElement('DIV', { id: 'form_status' }, 'Ready');
        mockBody.appendChild(statusDiv);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        // Post-submit text mutates to server error
        statusDiv.textContent = 'Submission failed: Internal server error';

        const signals = verifier.evaluateSignals();
        assert.strictEqual(signals.domServerErrorTransition, true);
        assert.strictEqual(signals.serverErrorTransition, true);
    });

    // -------------------------------------------------------------
    // Test 6: actual network 500 => FAILURE
    // -------------------------------------------------------------
    await runTest('6: actual network 500 => FAILURE', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        const res = await verifier.verify({ submitEventFired: true, networkStatus: 500 });
        assert.strictEqual(res.decision, 'SUBMISSION_SERVER_ERROR');
        assert.strictEqual(res.outcomeEvidence.serverErrorTransition, true);
        assert.strictEqual(res.latencyMs < 200, true, 'Actual transport 500 must terminate immediately');
    });

    // -------------------------------------------------------------
    // Test 7: actual network 400 framework rejection => FAILURE
    // -------------------------------------------------------------
    await runTest('7: actual network 400 framework rejection => FAILURE', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        const res = await verifier.verify({ submitEventFired: true, networkStatus: 400, transportRejected: true });
        assert.strictEqual(res.decision, 'SUBMISSION_SERVER_ERROR');
        assert.strictEqual(res.outcomeEvidence.serverErrorTransition, true);
        assert.strictEqual(res.latencyMs < 200, true, 'Actual transport rejection must terminate immediately');
    });

    // -------------------------------------------------------------
    // Test 8: submitEvent=true + no signal for bounded window => DELIVERY_UNKNOWN
    // -------------------------------------------------------------
    await runTest('8: submitEvent=true + no signal for bounded window => DELIVERY_UNKNOWN', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { extendedWaitMs: 600, intervalMs: 50 });
        verifier.prepare();

        const res = await verifier.verify({ success: true, submitEventFired: true, strategy: 'event_bridge' });
        assert.strictEqual(res.decision, 'DELIVERY_UNKNOWN');
        assert.strictEqual(res.success, false);
    });

    // -------------------------------------------------------------
    // Test 9: success appears at 300ms while stale error template exists => SUCCESS
    // -------------------------------------------------------------
    await runTest('9: success appears at 300ms while stale error template exists => SUCCESS', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const staleError = new MockElement('DIV', { className: 'error' }, 'Submission failed');
        mockBody.appendChild(staleError);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        safeSetTimeout(() => {
            const thankYou = new MockElement('DIV', { role: 'alert' }, 'Thank you! We received your message.');
            mockBody.appendChild(thankYou);
        }, 300);

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'CONFIRMED_SUCCESS');
        assert.strictEqual(res.success, true);
    });

    // -------------------------------------------------------------
    // Test 10: success appears at 2s => SUCCESS
    // -------------------------------------------------------------
    await runTest('10: success appears at 2s => SUCCESS', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { extendedWaitMs: 2500, intervalMs: 50 });
        verifier.prepare();

        safeSetTimeout(() => {
            const thankYou = new MockElement('DIV', { className: 'submitted-message' }, 'Thank you for your inquiry.');
            mockBody.appendChild(thankYou);
        }, 1000);

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'CONFIRMED_SUCCESS');
        assert.strictEqual(res.success, true);
    });

    // -------------------------------------------------------------
    // Test 11: pre-existing required helper text unchanged => not validation failure
    // -------------------------------------------------------------
    await runTest('11: pre-existing required helper text unchanged => not validation failure', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const reqHelper = new MockElement('SPAN', { className: 'field-error' }, 'Required field *');
        form.appendChild(reqHelper);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        const signals = verifier.evaluateSignals();
        assert.strictEqual(signals.validationErrorsCount, 0, 'Unchanged pre-existing helper text must not be counted as validation error');
        assert.strictEqual(signals.validationErrorTransition, false);
    });

    // -------------------------------------------------------------
    // Test 12: aria-invalid false->true after submit => validation failure
    // -------------------------------------------------------------
    await runTest('12: aria-invalid false->true after submit => validation failure', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const input = new MockElement('INPUT', { 'aria-invalid': 'false' });
        form.appendChild(input);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        // After submit: field becomes aria-invalid
        input.setAttribute('aria-invalid', 'true');

        const signals = verifier.evaluateSignals();
        assert.strictEqual(signals.validationErrorsCount > 0, true);
        assert.strictEqual(signals.validationErrorTransition, true);

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'SUBMIT_VALIDATION_BLOCKED');
    });

    // -------------------------------------------------------------
    // Test 13: server-error DOM signal cannot terminal before 750ms without transport evidence
    // -------------------------------------------------------------
    await runTest('13: server-error DOM signal cannot terminate before 750ms without transport evidence', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        // Immediately inject new server error
        const errNode = new MockElement('DIV', { className: 'server-error' }, 'Server error: could not send message');
        mockBody.appendChild(errNode);

        const start = Date.now();
        const res = await verifier.verify({ success: true, submitEventFired: true });
        const elapsed = Date.now() - start;

        assert.strictEqual(res.decision, 'SUBMISSION_SERVER_ERROR');
        assert.strictEqual(elapsed >= 750, true, `DOM-only server error elapsed (${elapsed}ms) must be >= 750ms`);
    });

    // -------------------------------------------------------------
    // Test 14: two-poll confirmation required for DOM-only server error
    // -------------------------------------------------------------
    await runTest('14: two-poll confirmation required for DOM-only server error', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        // Inject transient error node that disappears before 2nd poll threshold
        const transient = new MockElement('DIV', { className: 'server-error' }, '500 internal server error');
        mockBody.appendChild(transient);

        safeSetTimeout(() => {
            // Remove transient error before 2nd poll threshold
            mockBody.children = mockBody.children.filter(c => c !== transient);
            // Replace with success
            const thankYou = new MockElement('DIV', { role: 'status' }, 'Thank you! Message delivered.');
            mockBody.appendChild(thankYou);
        }, 150);

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'CONFIRMED_SUCCESS', 'Transient unconfirmed server error must not prevent subsequent success');
    });

    // -------------------------------------------------------------
    // Test 15: diagnostic log includes matched phrase/source/preExisting/transition
    // -------------------------------------------------------------
    await runTest('15: diagnostic log includes matched phrase/source/preExisting/transition', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const preHidden = new MockElement('DIV', { style: { display: 'none' } }, 'could not send message');
        mockBody.appendChild(preHidden);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        preHidden.style.display = 'block';
        verifier.evaluateSignals();

        assert.strictEqual(verifier.preSnapshot.negativeSignals.serverErrorNodes.length > 0, true);
        assert.strictEqual(verifier.preSnapshot.negativeSignals.serverErrorNodes[0].wasVisible, false);
    });

    // -------------------------------------------------------------
    // Test 16: "Sequence complete: Success" no longer exists in source/build
    // -------------------------------------------------------------
    await runTest('16: "Sequence complete: Success" no longer exists in source/build', async () => {
        const srcCS = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf-8');
        const bldCS = fs.readFileSync(path.join(__dirname, 'build/extension/content-script.js'), 'utf-8');

        assert.strictEqual(srcCS.includes('Sequence complete: Success'), false, 'source content-script.js must not contain "Sequence complete: Success"');
        assert.strictEqual(bldCS.includes('Sequence complete: Success'), false, 'build content-script.js must not contain "Sequence complete: Success"');
        assert.strictEqual(srcCS.includes('[FORM_PREP] COMPLETE'), true, 'source content-script.js must contain "[FORM_PREP] COMPLETE"');
        assert.strictEqual(bldCS.includes('[FORM_PREP] COMPLETE'), true, 'build content-script.js must contain "[FORM_PREP] COMPLETE"');
    });

    // -------------------------------------------------------------
    // Test 17: source/build parity
    // -------------------------------------------------------------
    await runTest('17: source/build parity', async () => {
        const filesToCompare = [
            'content-script.js',
            'background.js',
            'modules/build-provenance.js',
            'modules/final-form-completion-engine.js',
            'modules/smart-field-resolver.js',
            'modules/math-captcha-solver.js'
        ];

        for (const f of filesToCompare) {
            const srcPath = path.join(__dirname, f);
            const bldPath = path.join(__dirname, 'build/extension', f);
            assert.strictEqual(fs.existsSync(srcPath), true, `source ${f} must exist`);
            assert.strictEqual(fs.existsSync(bldPath), true, `build ${f} must exist`);
            const hSrc = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
            const hBld = crypto.createHash('sha256').update(fs.readFileSync(bldPath)).digest('hex');
            assert.strictEqual(hSrc, hBld, `Parity 100% mismatch on ${f}`);
        }
    });

    // -------------------------------------------------------------
    // REAL RUNTIME ACCEPTANCE TESTS (Criteria A - E)
    // -------------------------------------------------------------
    console.log('\n--- REAL RUNTIME ACCEPTANCE (A - E) ---');

    // Acceptance A: false-failure fixture => CONFIRMED_SUCCESS
    await runTest('Acceptance A: False-failure fixture (Seido template) => CONFIRMED_SUCCESS', async () => {
        global.window.location.href = 'https://www.seido.com/contact-honbu';
        const form = new MockElement('FORM', { id: 'contact-honbu-form' });
        mockBody.appendChild(form);

        // Pre-existing hidden error template in contact form
        const hiddenErrorTemplate = new MockElement('DIV', { className: 'error-notification', style: { display: 'none' } }, 'An error occurred while processing. Submission failed.');
        form.appendChild(hiddenErrorTemplate);

        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        // Submit happens, thank you message appears at 350ms
        safeSetTimeout(() => {
            const thankYouMessage = new MockElement('DIV', { className: 'message-success', role: 'alert' }, 'お問い合わせありがとうございます。送信が完了いたしました。(Thank you for your inquiry. Submission completed.)');
            mockBody.appendChild(thankYouMessage);
        }, 350);

        const res = await verifier.verify({ success: true, submitEventFired: true, networkCommitObserved: true });
        assert.strictEqual(res.decision, 'CONFIRMED_SUCCESS', 'Seido contact form with pre-existing error template must settle CONFIRMED_SUCCESS');
        assert.strictEqual(res.success, true);
    });

    // Acceptance B: actual error => FAILURE
    await runTest('Acceptance B: Actual server error => FAILURE', async () => {
        const form = new MockElement('FORM', { id: 'err_form' });
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        const res = await verifier.verify({ submitEventFired: true, networkStatus: 503 });
        assert.strictEqual(res.decision, 'SUBMISSION_SERVER_ERROR');
        assert.strictEqual(res.success, false);
    });

    // Acceptance C: ambiguous => DELIVERY_UNKNOWN
    await runTest('Acceptance C: Ambiguous submit => DELIVERY_UNKNOWN', async () => {
        const form = new MockElement('FORM', { id: 'ambig_form' });
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { extendedWaitMs: 600, intervalMs: 50 });
        verifier.prepare();

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res.decision, 'DELIVERY_UNKNOWN');
        assert.strictEqual(res.success, false);
    });

    // Acceptance D: counters exactly match HistoryStore
    await runTest('Acceptance D: Counters exactly match HistoryStore', async () => {
        const storage = new MockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();
        const runId = 'run_acceptance_d';
        hs.activeCampaignRunId = runId;

        const { attemptId: att1 } = await hs.recordAttempt('https://seido.com/contact-honbu', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att1, 'CONFIRMED_SUCCESS', 'SUBMISSION_CONFIRMED_SUCCESS', {}, { campaignRunId: runId });

        const { attemptId: att2 } = await hs.recordAttempt('https://ambiguous.com/contact', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att2, 'DELIVERY_UNKNOWN', 'DELIVERY_UNKNOWN', {}, { campaignRunId: runId });

        const { attemptId: att3 } = await hs.recordAttempt('https://broken.com/contact', { campaignRunId: runId });
        await hs.settleCanonicalAttempt(att3, 'FAILURE', 'SUBMISSION_SERVER_ERROR', {}, { campaignRunId: runId });

        const stats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(stats.success, 1, 'Only 1 confirmed success');
        assert.strictEqual(stats.unknown, 1, 'Only 1 ambiguous unknown');
        assert.strictEqual(stats.failure, 1, 'Only 1 deterministic failure');
    });

    // Acceptance E: no result settles in <750ms from DOM-only server-error text
    await runTest('Acceptance E: No result settles in <750ms from DOM-only server-error text', async () => {
        const form = new MockElement('FORM');
        mockBody.appendChild(form);
        const verifier = new SubmissionOutcomeVerifier(form, {}, { intervalMs: 50 });
        verifier.prepare();

        const newErr = new MockElement('DIV', { className: 'error-box' }, 'could not send message: server error');
        mockBody.appendChild(newErr);

        const t0 = Date.now();
        const res = await verifier.verify({ success: true, submitEventFired: true });
        const latency = Date.now() - t0;

        assert.strictEqual(res.decision, 'SUBMISSION_SERVER_ERROR');
        assert.strictEqual(latency >= 750, true, `Settlement latency (${latency}ms) must not be < 750ms`);
    });

    console.log('\n======================================================================');
    console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED`);
    console.log('======================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
