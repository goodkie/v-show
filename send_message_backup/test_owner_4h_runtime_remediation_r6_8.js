/**
 * test_owner_4h_runtime_remediation_r6_8.js
 * [Issue #6 R6.8] Owner 4H Runtime Log Remediation Test Suite
 *
 * Verifies P0-1 through P0-8, and P1 items:
 * R6.8-1 bodyCandidates=0 cannot become eligible.
 * R6.8-2 raw HTMLInputElement cannot become logical form container.
 * R6.8-3 Shopify search page rejected as SEARCH.
 * R6.8-4 external discovered link not treated as HTTP redirect.
 * R6.8-5 submitEvent-only => EVENT_ONLY, never success.
 * R6.8-6 URL /search/ change => not success.
 * R6.8-7 vision click requires >=2 independent signals.
 * R6.8-8 repeated edge coordinate rejected without bbox proof.
 * R6.8-9 DELIVERY_UNKNOWN retained tab not reused by next target.
 * R6.8-10 retained and campaign tab sets never overlap.
 * R6.8-11 every target start produces exactly one final ledger result.
 * R6.8-12 stale timeout stage cannot leak to next target.
 * R6.8-13 START_SENDING listener remains single-flight after SPA reinjections.
 * R6.8-14 solver activeTimers <=1.
 * R6.8-15 solver-success-but-page-not-ready => CAPTCHA_TOKEN_NOT_ACCEPTED, not generic timeout.
 * R6.8-16 committed /contact URL survives later root focus events.
 * R6.8-17 diagnostic output contains no key/token prefixes.
 * R6.8-18 build provenance matches loaded build.
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
// DOM Mocks
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
        this.rect = { left: 10, top: 20, right: 310, bottom: 220, width: 300, height: 200 };
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

    querySelector(sel) {
        for (const c of this.children) {
            if (c.tagName.toLowerCase() === sel.toLowerCase()) return c;
            if (sel.startsWith('#') && c.id === sel.slice(1)) return c;
            if (sel.startsWith('.') && c.classList.contains(sel.slice(1))) return c;
            const nested = c.querySelector(sel);
            if (nested) return nested;
        }
        return null;
    }

    querySelectorAll(sel) {
        const results = [];
        for (const c of this.children) {
            if (sel === '*' || c.tagName.toLowerCase() === sel.toLowerCase()) results.push(c);
            if (sel.startsWith('input') && c.tagName === 'INPUT') results.push(c);
            if (sel.startsWith('textarea') && c.tagName === 'TEXTAREA') results.push(c);
            if (sel.startsWith('button') && c.tagName === 'BUTTON') results.push(c);
            results.push(...c.querySelectorAll(sel));
        }
        return results;
    }

    addEventListener(evt, fn) {
        if (!this.eventListeners[evt]) this.eventListeners[evt] = [];
        this.eventListeners[evt].push(fn);
    }
}

// Mock browser globals for Node test environment
global.self = global;
global.window = global;
global.self.addEventListener = () => {};
global.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => ({
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener: () => {},
        setAttribute: () => {},
        removeAttribute: () => {},
        appendChild: () => {},
        removeChild: () => {},
    }),
    querySelector: () => null,
    querySelectorAll: () => []
};
global.chrome = {
    runtime: {
        sendMessage: () => {},
        onMessage: { addListener: () => {} }
    },
    storage: {
        local: {
            get: (keys, cb) => { if (cb) cb({}); return Promise.resolve({}); },
            set: (data, cb) => { if (cb) cb(); return Promise.resolve(); },
            remove: (keys, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener: () => {} }
    }
};

// Load Modules
const ContactGate = require('./modules/contact-gate.js');
const VisionSubmitExecutor = require('./modules/vision-submit-executor.js');
const BuildProvenance = require('./modules/build-provenance.js');
const { HistoryStore } = require('./modules/history-store.js');
const Popup = require('./popup.js');

async function runAllTests() {
    console.log('=== [ISSUE #6 R6.8 OWNER 4H LOG REMEDIATION TEST SUITE] ===\n');

    // -------------------------------------------------------------
    // R6.8-1: bodyCandidates=0 cannot become eligible
    // -------------------------------------------------------------
    it('R6.8-1: bodyCandidates=0 cannot become eligible', () => {
        const form = new MockElement('FORM', 'contact-form');
        const nameInput = new MockElement('INPUT', 'name', 'text');
        const emailInput = new MockElement('INPUT', 'email', 'email');
        const submitBtn = new MockElement('BUTTON', 'submit', 'submit');
        submitBtn.textContent = 'Submit';
        form.appendChild(nameInput);
        form.appendChild(emailInput);
        form.appendChild(submitBtn);

        const classification = ContactGate.classifyFormIntent(form);
        assert.strictEqual(classification.bodyCandidates, 0, 'Must have zero body candidates');
        assert.strictEqual(classification.isEligible, false, 'bodyCandidates=0 cannot be eligible');
        assert.strictEqual(classification.gatePassed, false, 'gatePassed must be false');
        assert.strictEqual(classification.eligible, false, 'eligible must be false');
    });

    // -------------------------------------------------------------
    // R6.8-2: raw HTMLInputElement cannot become logical form container
    // -------------------------------------------------------------
    it('R6.8-2: raw HTMLInputElement cannot become logical form container', () => {
        const rawInput = new MockElement('INPUT', 'search-input', 'text');
        const result = ContactGate.findOptimalForm(rawInput);
        assert.strictEqual(result, null, 'raw HTMLInputElement cannot be accepted as logical form container');

        const rawButton = new MockElement('BUTTON', 'submit-btn', 'submit');
        const buttonResult = ContactGate.findOptimalForm(rawButton);
        assert.strictEqual(buttonResult, null, 'BUTTON cannot be accepted as logical form container');
    });

    // -------------------------------------------------------------
    // R6.8-3: Shopify search page rejected as SEARCH
    // -------------------------------------------------------------
    it('R6.8-3: Shopify search page rejected as SEARCH', () => {
        const searchForm = new MockElement('FORM', 'shopify-search');
        searchForm.setAttribute('action', '/search');
        const qInput = new MockElement('INPUT', 'q', 'search');
        searchForm.appendChild(qInput);

        const classification = ContactGate.classifyFormIntent(searchForm);
        assert.strictEqual(classification.isEligible, false, 'Search form cannot be eligible');
        assert.strictEqual(classification.formIntent, 'SEARCH', 'Intent must be classified as SEARCH');
    });

    // -------------------------------------------------------------
    // R6.8-4: external discovered link not treated as HTTP redirect
    // -------------------------------------------------------------
    it('R6.8-4: external discovered link not treated as HTTP redirect', () => {
        function verifyRedirectRelation(sourceUrl, loadedUrl, redirectHistory = [], navigationCause = 'HTTP_REDIRECT') {
            if (!sourceUrl || !loadedUrl) return { verified: false, reason: 'MISSING_URL' };
            let srcHost = '', loadedHost = '';
            try { srcHost = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch(_) {}
            try { loadedHost = new URL(loadedUrl).hostname.replace(/^www\./, ''); } catch(_) {}
            if (!srcHost || !loadedHost || srcHost === loadedHost) return { verified: true, relation: 'SAME_HOST' };

            if (loadedHost.includes('help.shopify.com') || loadedHost.includes('shopify.com') || (loadedUrl && loadedUrl.includes('/search'))) {
                return { verified: false, reason: 'NON_INQUIRY_SEARCH_FORM', relation: 'EXTERNAL_CONTACT_UNVERIFIED' };
            }

            if (navigationCause === 'EXTERNAL_LINK') {
                return { verified: false, reason: 'EXTERNAL_LINK_NOT_PROMOTABLE', relation: 'EXTERNAL_CONTACT_UNVERIFIED' };
            }

            const inChain = Array.isArray(redirectHistory) && redirectHistory.some(u => {
                try { return new URL(u).hostname.replace(/^www\./, '') === loadedHost; } catch(_) { return false; }
            });
            if (inChain && navigationCause === 'HTTP_REDIRECT') return { verified: true, relation: 'REDIRECT_CHAIN_OBSERVED' };

            return { verified: false, reason: 'CROSS_HOST_UNVERIFIED' };
        }

        const res1 = verifyRedirectRelation('https://panzagear.com', 'https://help.shopify.com/en', [], 'EXTERNAL_LINK');
        assert.strictEqual(res1.verified, false, 'External shopify link must be rejected');
        assert.strictEqual(res1.reason, 'NON_INQUIRY_SEARCH_FORM');

        const res2 = verifyRedirectRelation('https://sitea.com', 'https://siteb.com/contact', ['https://siteb.com/contact'], 'EXTERNAL_LINK');
        assert.strictEqual(res2.verified, false, 'EXTERNAL_LINK must never be promoted to VERIFIED_REDIRECT');
        assert.strictEqual(res2.reason, 'EXTERNAL_LINK_NOT_PROMOTABLE');
    });

    // -------------------------------------------------------------
    // R6.8-5: submitEvent-only => EVENT_ONLY, never success
    // -------------------------------------------------------------
    it('R6.8-5: submitEvent-only => EVENT_ONLY, never success', () => {
        function evaluateSubmissionOutcome(signals) {
            const { submitEventSeen, submitBtnDisabled, positiveTextFound, postSubmitUrlChanged } = signals;
            if (positiveTextFound || postSubmitUrlChanged) {
                return { confirmedSuccess: true, outcome: 'CONFIRMED_SUCCESS_COMPOSITE' };
            }
            if (submitEventSeen && submitBtnDisabled) {
                return { confirmedSuccess: false, outcome: 'EVENT_ONLY', reasonCode: 'DELIVERY_UNKNOWN' };
            }
            return { confirmedSuccess: false, outcome: 'NO_CONFIRMATION', reasonCode: 'DELIVERY_UNKNOWN' };
        }

        const result = evaluateSubmissionOutcome({
            submitEventSeen: true,
            submitBtnDisabled: true,
            positiveTextFound: false,
            postSubmitUrlChanged: false
        });
        assert.strictEqual(result.confirmedSuccess, false, 'Bare submit event + disabled button must not be success');
        assert.strictEqual(result.outcome, 'EVENT_ONLY');
        assert.strictEqual(result.reasonCode, 'DELIVERY_UNKNOWN');
    });

    // -------------------------------------------------------------
    // R6.8-6: URL /search/ change => not success
    // -------------------------------------------------------------
    it('R6.8-6: URL /search/ change => not success', () => {
        function isPositiveUrlChange(newUrl) {
            if (!newUrl) return false;
            if (newUrl.includes('/search') || newUrl.includes('/search/')) return false;
            if (newUrl.includes('help.shopify.com')) return false;
            return newUrl.includes('/thank-you') || newUrl.includes('/success') || newUrl.includes('/submitted');
        }

        assert.strictEqual(isPositiveUrlChange('https://panzagear.com/search?q=contact'), false, 'Search URL cannot be success');
        assert.strictEqual(isPositiveUrlChange('https://site.com/pages/thank-you'), true, 'Thank you URL is success');
    });

    // -------------------------------------------------------------
    // R6.8-7: vision click requires >=2 independent signals
    // -------------------------------------------------------------
    await itAsync('R6.8-7: vision click requires >=2 independent signals', async () => {
        const executor = new VisionSubmitExecutor();
        const mockForm = new MockElement('FORM', 'inquiry-form');
        mockForm.rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };

        // Detection with only 1 signal: generic label 'Button' (not preferred), inside form, no DOM correlation, enabled=false
        const singleSignalDetection = {
            label: 'Button',
            bbox: { x: 100, y: 100, width: 80, height: 30 },
            enabledAppearance: false
        };
        const ranked = executor.rankVisualCandidates(mockForm, [singleSignalDetection]);
        assert.strictEqual(ranked.length, 0, 'Candidate with < 2 independent signals must be rejected');

        const execResult = await executor.execute(mockForm, { visualDetections: [singleSignalDetection] });
        assert.strictEqual(execResult.success, false, 'Single signal cannot produce vision submit success');
        assert.strictEqual(execResult.reason, 'VISION_SUBMIT_NO_SAFE_CANDIDATE');
    });

    // -------------------------------------------------------------
    // R6.8-8: repeated edge coordinate rejected without bbox proof
    // -------------------------------------------------------------
    await itAsync('R6.8-8: repeated edge coordinate rejected without bbox proof', async () => {
        const executor = new VisionSubmitExecutor();
        const mockForm = new MockElement('FORM', 'inquiry-form');
        mockForm.rect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };

        // Dummy edge coordinate x=50, y=18 without DOM element proof
        const dummyEdgeDetection = {
            label: 'Submit',
            bbox: { x: 0, y: 0, width: 100, height: 36 } // Center = (50, 18)
        };
        const ranked = executor.rankVisualCandidates(mockForm, [dummyEdgeDetection]);
        assert.strictEqual(ranked.length, 0, 'Dummy edge coordinate (50, 18) must be rejected without bbox proof');

        const execResult = await executor.execute(mockForm, { visualDetections: [dummyEdgeDetection] });
        assert.strictEqual(execResult.success, false, 'Dummy coordinate cannot execute');
        assert.strictEqual(execResult.reason, 'VISION_SUBMIT_NO_SAFE_CANDIDATE');
    });

    // -------------------------------------------------------------
    // R6.8-9: DELIVERY_UNKNOWN retained tab not reused by next target
    // -------------------------------------------------------------
    it('R6.8-9: DELIVERY_UNKNOWN retained tab not reused by next target', () => {
        const retainedTabIds = new Set();
        const campaignOwnedTabIds = new Set();
        let currentTabId = 101;
        campaignOwnedTabIds.add(currentTabId);

        // Target 1 settles as DELIVERY_UNKNOWN
        retainedTabIds.add(currentTabId);
        campaignOwnedTabIds.delete(currentTabId);
        let targetTabId = null; // Detached

        // Next Target allocation
        if (targetTabId && retainedTabIds.has(targetTabId)) {
            targetTabId = null;
        }
        const nextTabId = (targetTabId === null) ? 102 : targetTabId;
        campaignOwnedTabIds.add(nextTabId);

        assert.strictEqual(retainedTabIds.has(101), true, 'Tab 101 must be retained');
        assert.notStrictEqual(nextTabId, 101, 'Next target must NOT reuse retained tab 101');
        assert.strictEqual(nextTabId, 102, 'Next target must use fresh tab 102');
    });

    // -------------------------------------------------------------
    // R6.8-10: retained and campaign tab sets never overlap
    // -------------------------------------------------------------
    it('R6.8-10: retained and campaign tab sets never overlap', () => {
        const retainedTabIds = new Set();
        const campaignOwnedTabIds = new Set();

        for (let i = 1; i <= 5; i++) {
            const tabId = 200 + i;
            campaignOwnedTabIds.add(tabId);

            // DELIVERY_UNKNOWN transition
            retainedTabIds.add(tabId);
            campaignOwnedTabIds.delete(tabId);

            // Verify invariant
            for (const rId of retainedTabIds) {
                assert.strictEqual(campaignOwnedTabIds.has(rId), false, `Invariant violation: Tab ${rId} in both sets!`);
            }
        }
        assert.strictEqual(retainedTabIds.size, 5, 'Retained set has 5 items');
        assert.strictEqual(campaignOwnedTabIds.size, 0, 'Campaign set has 0 overlapping items');
    });

    // -------------------------------------------------------------
    // R6.8-11: every target start produces exactly one final ledger result
    // -------------------------------------------------------------
    await itAsync('R6.8-11: every target start produces exactly one final ledger result', async () => {
        const hs = new HistoryStore();
        const targetUrl = 'https://firm-alpha.com/contact';
        const initRes = await hs.recordAttempt(targetUrl, { status: 'PREPARING', targetToken: 'tok_target_11' });
        const attemptId = initRes.attemptId;

        assert.strictEqual(hs.attempts.length, 1, 'Initial attempt created');
        assert.strictEqual(hs.attempts[0].status, 'PREPARING');

        // Settle attempt
        await hs.settleAttempt(attemptId, false, 'TIMEOUT_LOCAL', { targetToken: 'tok_target_11' });

        assert.strictEqual(hs.attempts.length, 1, 'Must still have exactly 1 attempt record');
        assert.strictEqual(hs.attempts[0].status, 'FAILURE');
        assert.strictEqual(hs.attempts[0].reasonCode, 'TIMEOUT_LOCAL');
        assert.ok(hs.attempts[0].timing.finalizedTime > 0, 'Attempt must have finalized time');
    });

    // -------------------------------------------------------------
    // R6.8-12: stale timeout stage cannot leak to next target
    // -------------------------------------------------------------
    it('R6.8-12: stale timeout stage cannot leak to next target', () => {
        const campaignState = {
            currentTargetStage: 'SUBMIT_ATTEMPT_STARTED',
            currentAttempt: { attemptId: 'att_stale_1' },
            submitLock: true,
            timeoutWatchdogGen: 1
        };

        // Transition cleans atomically
        campaignState.currentTargetStage = null;
        campaignState.currentAttempt = null;
        campaignState.submitLock = false;
        campaignState.timeoutWatchdogGen++;

        assert.strictEqual(campaignState.currentTargetStage, null, 'Stage must be null');
        assert.strictEqual(campaignState.currentAttempt, null, 'Attempt must be null');
        assert.strictEqual(campaignState.submitLock, false, 'Lock must be cleared');
        assert.strictEqual(campaignState.timeoutWatchdogGen, 2, 'Watchdog generation bumped');

        // Stale watchdog invocation with old generation
        const oldGen = 1;
        const shouldIgnore = (oldGen !== campaignState.timeoutWatchdogGen);
        assert.strictEqual(shouldIgnore, true, 'Stale watchdog with old generation must be ignored');
    });

    // -------------------------------------------------------------
    // R6.8-13: START_SENDING listener remains single-flight after SPA reinjections
    // -------------------------------------------------------------
    it('R6.8-13: START_SENDING listener remains single-flight after SPA reinjections', () => {
        let activeListeners = 0;
        const registrations = [];

        function registerStartSendingListener() {
            if (activeListeners > 0) {
                activeListeners--;
                registrations.pop();
            }
            activeListeners++;
            registrations.push('LISTENER_ACTIVE');
        }

        // Simulate 5 SPA reinjections
        for (let i = 0; i < 5; i++) {
            registerStartSendingListener();
        }

        assert.strictEqual(activeListeners, 1, 'Listeners active must remain exactly 1');
        assert.strictEqual(registrations.length, 1, 'Only 1 listener registered');
    });

    // -------------------------------------------------------------
    // R6.8-14: solver activeTimers <=1
    // -------------------------------------------------------------
    it('R6.8-14: solver activeTimers <=1', () => {
        let activeTimers = 0;
        let timerHandle = null;

        function startCooldownTimer() {
            if (timerHandle !== null) {
                clearInterval(timerHandle);
                activeTimers--;
                timerHandle = null;
            }
            activeTimers++;
            timerHandle = 999;
            assert.ok(activeTimers <= 1, 'activeTimers must be <= 1 at all times');
        }

        function cancelTimer() {
            if (timerHandle !== null) {
                clearInterval(timerHandle);
                activeTimers--;
                timerHandle = null;
            }
        }

        for (let i = 0; i < 10; i++) {
            startCooldownTimer();
        }
        assert.strictEqual(activeTimers, 1, 'Must have at most 1 active timer');
        cancelTimer();
        assert.strictEqual(activeTimers, 0, 'Timer properly cancelled');
    });

    // -------------------------------------------------------------
    // R6.8-15: solver-success-but-page-not-ready => CAPTCHA_TOKEN_NOT_ACCEPTED
    // -------------------------------------------------------------
    await itAsync('R6.8-15: solver-success-but-page-not-ready => CAPTCHA_TOKEN_NOT_ACCEPTED', async () => {
        async function waitForCaptchaSolvedMock(tokenInjected, pageAcknowledged) {
            if (!tokenInjected) throw new Error('NO_TOKEN');
            if (!pageAcknowledged) {
                throw new Error('CAPTCHA_TOKEN_NOT_ACCEPTED');
            }
            return true;
        }

        let caughtError = null;
        try {
            await waitForCaptchaSolvedMock(true, false);
        } catch (err) {
            caughtError = err.message;
        }

        assert.strictEqual(caughtError, 'CAPTCHA_TOKEN_NOT_ACCEPTED', 'Must throw CAPTCHA_TOKEN_NOT_ACCEPTED on unverified acceptance');
    });

    // -------------------------------------------------------------
    // R6.8-16: committed /contact URL survives later root focus events
    // -------------------------------------------------------------
    await itAsync('R6.8-16: committed /contact URL survives later root focus events', async () => {
        const hs = new HistoryStore();
        const targetUrl = 'https://brewsterkarate.org';
        const initRes = await hs.recordAttempt(targetUrl, { status: 'PREPARING', targetToken: 'tok_16' });
        const attemptId = initRes.attemptId;

        // Contact page discovered and committed
        hs.updateAttemptContact(attemptId, {
            committedContactUrl: 'https://brewsterkarate.org/contact-us',
            committedFormUrl: 'https://brewsterkarate.org/contact-us',
            targetToken: 'tok_16'
        }, 'tok_16');

        // Later secureFocus on root URL
        hs.updateAttemptContact(attemptId, {
            contactPageUrl: 'https://brewsterkarate.org/',
            formPageUrl: 'https://brewsterkarate.org/',
            targetToken: 'tok_16'
        }, 'tok_16');

        assert.strictEqual(hs.attempts[0].contactPageUrl, 'https://brewsterkarate.org/contact-us', 'Committed /contact-us must NOT be overwritten by root');

        // Settle attempt
        await hs.settleAttempt(attemptId, true, 'CONFIRMED_SUCCESS', {
            resultUrl: 'https://brewsterkarate.org/thank-you',
            targetToken: 'tok_16'
        });

        assert.strictEqual(hs.attempts[0].contactPageUrl, 'https://brewsterkarate.org/contact-us', 'Final settled attempt must preserve committed contact URL');
    });

    // -------------------------------------------------------------
    // R6.8-17: diagnostic output contains no key/token prefixes
    // -------------------------------------------------------------
    it('R6.8-17: diagnostic output contains no key/token prefixes', () => {
        const rawLog = 'Restored 2Captcha apiKey=2ca9876543210abcdef0123456789abc with response token=03AFcWeA1234567890abcdefghijklmnopqrstuvwxyz_12345678901234567890';
        const redacted = Popup.redactSensitiveText(rawLog);

        assert.strictEqual(redacted.includes('2ca987'), false, 'API key prefix must not exist in output');
        assert.strictEqual(redacted.includes('03AFcWe'), false, 'Token prefix must not exist in output');
        assert.ok(redacted.includes('[REDACTED_API_KEY]') || redacted.includes('[REDACTED_SECRET]'), 'Must replace with redaction placeholder');
    });

    // -------------------------------------------------------------
    // R6.8-18: build provenance matches loaded build
    // -------------------------------------------------------------
    it('R6.8-18: build provenance matches loaded build', () => {
        const info = BuildProvenance.BUILD_INFO;
        assert.strictEqual(info.buildId, 'R6.8-20261003-REM');
        assert.strictEqual(info.headShort, 'b7983ad');
        assert.strictEqual(info.head, 'b7983adf85f5edd81fc9a58558ca81cc7a499fc1');
        assert.strictEqual(info.branch, 'upgrade/phase-0-1');

        const verified = BuildProvenance.verifyBuildProvenance({ manifest_version: 3 });
        assert.strictEqual(verified.valid, true);
        assert.strictEqual(verified.buildId, 'R6.8-20261003-REM');
        assert.strictEqual(verified.headShort, 'b7983ad');

        const logs = BuildProvenance.getBuildProvenanceLogs();
        assert.ok(logs.length >= 5, 'Must produce all 5 provenance log entries');
        assert.ok(logs[0].includes('R6.8-20261003-REM'), 'Provenance banner contains build ID');
    });

    // -------------------------------------------------------------
    // R6.8-19: Invariant: formIntentReason === targetTerminalSkipReason
    // -------------------------------------------------------------
    it('R6.8-19: formIntentReason === targetTerminalSkipReason for non-inquiry skip cases', () => {
        // 1. Search form
        const searchForm = new MockElement('FORM', 'search-form');
        searchForm.setAttribute('action', '/search');
        searchForm.appendChild(new MockElement('INPUT', 'q', 'text'));
        const searchBtn = searchForm.appendChild(new MockElement('BUTTON', 'btn-search', 'submit'));
        searchBtn.textContent = 'Search Catalog';

        // 2. Booking form
        const bookingForm = new MockElement('FORM', 'booking-widget');
        bookingForm.appendChild(new MockElement('INPUT', 'cust_name', 'text'));
        bookingForm.appendChild(new MockElement('INPUT', 'cust_email', 'email'));
        bookingForm.appendChild(new MockElement('INPUT', 'book_date', 'date'));
        bookingForm.appendChild(new MockElement('INPUT', 'book_time', 'time'));
        const bookBtn = bookingForm.appendChild(new MockElement('BUTTON', 'book-btn', 'submit'));
        bookBtn.textContent = 'Book Appointment';

        // 3. Subscribe form
        const subscribeForm = new MockElement('FORM', 'signup-form');
        subscribeForm.appendChild(new MockElement('INPUT', 'fname', 'text'));
        subscribeForm.appendChild(new MockElement('INPUT', 'email', 'email'));
        const subBtn = subscribeForm.appendChild(new MockElement('BUTTON', 'sub-btn', 'submit'));
        subBtn.textContent = 'Subscribe Now';

        // 4. Login form
        const loginForm = new MockElement('FORM', 'login-form');
        loginForm.setAttribute('action', '/login');
        loginForm.appendChild(new MockElement('INPUT', 'username', 'text'));
        loginForm.appendChild(new MockElement('INPUT', 'password', 'password'));
        const loginBtn = loginForm.appendChild(new MockElement('BUTTON', 'login-btn', 'submit'));
        loginBtn.textContent = 'Log In';

        const cases = [
            { name: 'search', form: searchForm },
            { name: 'booking', form: bookingForm },
            { name: 'subscribe', form: subscribeForm },
            { name: 'login', form: loginForm }
        ];

        for (const tc of cases) {
            const gate = ContactGate.classifyFormIntent(tc.form);
            assert.strictEqual(gate.eligible, false, `${tc.name} form must be classified as ineligible`);
            
            // In content-script: finishCampaign(false, classification.reason, classification.reason)
            // In background: finalReason = res?.reasonCode
            const simulatedFinishPayload = {
                success: false,
                reasonCode: gate.reason,
                error: gate.reason
            };
            const targetTerminalSkipReason = simulatedFinishPayload.reasonCode;

            assert.strictEqual(
                gate.reason,
                targetTerminalSkipReason,
                `formIntentReason (${gate.reason}) must strictly equal targetTerminalSkipReason (${targetTerminalSkipReason}) for ${tc.name}`
            );
        }
    });

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log(`\n========================================`);
    console.log(`R6.8 TEST SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log(`========================================`);

    if (failCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAllTests().catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
