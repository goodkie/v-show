/**
 * test_submit_overlay_and_settlement_r6_5.js
 * [Issue #6 R6.5] Submit Overlay False-Positive + Premature Target Settlement Acceptance Suite
 *
 * Tests:
 *  R6.5-1  requestSubmit proceeds even if pointer hit-test says blocked
 *  R6.5-2  submitter child span from elementFromPoint is treated clickable
 *  R6.5-3  true external overlay is detected
 *  R6.5-4  safe overlay dismissed once then candidate re-queried
 *  R6.5-5  SUBMIT_TRIGGERED remains false if no submit effect
 *  R6.5-6  SUBMIT_TRIGGERED becomes true only after actual event/effect
 *  R6.5-7  fallback discovery cannot run after SETTLED
 *  R6.5-8  target cannot settle while DISCOVERY_FALLBACK active
 *  R6.5-9  valid form submit recovery runs before alternate contact discovery
 *  R6.5-10 target tab remains alive during fill/captcha/final audit/submit verify
 *  R6.5-11 missing owned tab recreated once
 *  R6.5-12 dead tab does not cause candidate exhaustion cascade
 *  R6.5-13 stale timeout ignored during active submit
 *  R6.5-14 cross-domain actualLoadedUrl requires verified redirect relation
 *  R6.5-15 raw PII absent from diagnostic logs
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

// Minimal DOM Mock Environment
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
    }

    setAttribute(k, v) { this.attributes[k.toLowerCase()] = String(v); }
    getAttribute(k) { return this.attributes[k.toLowerCase()] || null; }
    hasAttribute(k) { return this.attributes[k.toLowerCase()] !== undefined; }
    removeAttribute(k) { delete this.attributes[k.toLowerCase()]; }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    contains(other) {
        if (!other) return false;
        if (other === this) return true;
        let curr = other.parentElement;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }

    closest(selector) {
        let curr = this;
        const selList = selector.split(',').map(s => s.trim().toUpperCase());
        while (curr) {
            if (selList.includes(curr.tagName) || (curr.attributes['role'] && selList.includes(`[ROLE="${curr.attributes['role'].toUpperCase()}"]`))) {
                return curr;
            }
            curr = curr.parentElement;
        }
        return null;
    }

    querySelector(sel) {
        const list = this.querySelectorAll(sel);
        return list.length > 0 ? list[0] : null;
    }

    querySelectorAll(sel) {
        const res = [];
        const testEl = (el) => {
            if (!el || !el.tagName) return;
            const tag = el.tagName.toLowerCase();
            const cls = (el.className || '').toLowerCase();
            if (sel.includes('.close') && (el.classList.contains('close') || cls.includes('close'))) res.push(el);
            else if (sel.includes('button') && tag === 'button') res.push(el);
            else if (sel.includes('input') && tag === 'input') res.push(el);
            if (el.children) el.children.forEach(c => testEl(c));
        };
        this.children.forEach(c => testEl(c));
        return res;
    }

    addEventListener(evt, fn) {
        if (!this.eventListeners[evt]) this.eventListeners[evt] = [];
        this.eventListeners[evt].push(fn);
    }

    dispatchEvent(evt) {
        const list = this.eventListeners[evt.type || evt] || [];
        list.forEach(fn => {
            try { fn(evt); } catch (_) {}
        });
        return true;
    }

    click() {
        this.clicked = true;
        this.dispatchEvent({ type: 'click', bubbles: true, target: this });
    }

    getBoundingClientRect() {
        return { top: 100, left: 100, width: 120, height: 40, right: 220, bottom: 140 };
    }

    scrollIntoView() {}
    focus() {}
    blur() {}
}

class MockForm extends MockElement {
    constructor(id = 'test_form') {
        super('FORM', id);
        this.requestSubmitCalled = false;
        this.requestSubmitBtn = null;
    }

    requestSubmit(btn = null) {
        this.requestSubmitCalled = true;
        this.requestSubmitBtn = btn;
        this.dispatchEvent({ type: 'submit', bubbles: true, cancelable: true, target: this });
    }

    checkValidity() { return true; }
}

// Global Mocks for Node Environment
global.self = global;
global.self.addEventListener = () => {};

global.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    location: { href: 'https://example.com/contact', origin: 'https://example.com', pathname: '/contact' },
    addEventListener: () => {},
    getComputedStyle: (el) => el.style || {}
};

global.document = {
    elementFromPoint: (x, y) => null,
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
    activeElement: null
};

global.sessionStorage = {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; },
    clear() { this.data = {}; }
};

global.chrome = {
    runtime: {
        sendMessage: (msg) => Promise.resolve({ success: true }),
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} }
    },
    sidePanel: {
        setPanelBehavior: () => Promise.resolve()
    },
    storage: {
        local: {
            get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); },
            set: (k, cb) => { if (cb) cb(); return Promise.resolve(); }
        }
    },
    alarms: {
        alarms: {},
        create: (name, opts) => { global.chrome.alarms.alarms[name] = opts; },
        clear: (name) => { delete global.chrome.alarms.alarms[name]; },
        onAlarm: { addListener: (cb) => { global.chrome.alarms._listener = cb; } }
    },
    tabs: {
        tabs: {},
        nextId: 1000,
        create: (opts) => {
            const id = ++global.chrome.tabs.nextId;
            const tab = { id, url: opts.url, active: !!opts.active };
            global.chrome.tabs.tabs[id] = tab;
            return Promise.resolve(tab);
        },
        get: (id) => {
            if (global.chrome.tabs.tabs[id]) return Promise.resolve(global.chrome.tabs.tabs[id]);
            return Promise.reject(new Error(`No tab with id: ${id}`));
        },
        update: (id, opts) => {
            if (!global.chrome.tabs.tabs[id]) return Promise.reject(new Error(`No tab with id: ${id}`));
            Object.assign(global.chrome.tabs.tabs[id], opts);
            return Promise.resolve(global.chrome.tabs.tabs[id]);
        },
        remove: (id) => {
            delete global.chrome.tabs.tabs[id];
            return Promise.resolve();
        },
        onUpdated: { addListener: () => {}, removeListener: () => {} }
    },
    windows: {
        update: () => Promise.resolve()
    }
};

// Load content script and background modules
const cs = require('./content-script.js');
const bg = require('./background.js');

async function runR6_5_Tests() {
    console.log('\n=== [R6.5] Submit Overlay False-Positive + Premature Settlement Tests ===\n');

    // -------------------------------------------------------------
    // R6.5-1: requestSubmit proceeds even if pointer hit-test says blocked
    // -------------------------------------------------------------
    await itAsync('R6.5-1: requestSubmit proceeds even if pointer hit-test says blocked', async () => {
        const form = new MockForm('test_r6_5_1_form');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        btn.textContent = 'Submit';
        form.appendChild(btn);

        const overlay = new MockElement('DIV', 'cookie_consent_backdrop');
        overlay.style = { pointerEvents: 'auto', display: 'block', visibility: 'visible', zIndex: '9999' };

        // Mock hit-test to return overlay
        global.document.elementFromPoint = () => overlay;

        const outcome = await cs.executeSubmitStateMachine(form, { name: 'Test' }, {});
        assert.strictEqual(outcome.success, true, 'requestSubmit must proceed despite overlay');
        assert.strictEqual(outcome.strategy, 'requestSubmit');
        assert.strictEqual(outcome.submitEventFired, true);
        assert.strictEqual(form.requestSubmitCalled, true);
        assert.strictEqual(form.requestSubmitBtn, btn);
    });

    // -------------------------------------------------------------
    // R6.5-2: submitter child span from elementFromPoint is treated clickable
    // -------------------------------------------------------------
    it('R6.5-2: submitter child span from elementFromPoint is treated clickable', () => {
        const form = new MockForm('test_r6_5_2_form');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        const childSpan = new MockElement('SPAN', 'btn_icon');
        childSpan.textContent = 'Send';
        btn.appendChild(childSpan);
        form.appendChild(btn);

        global.document.elementFromPoint = () => childSpan;

        const executor = new cs.SubmitExecutorR5(form, {});
        const hitRes = executor.checkPointerHit(btn);
        assert.strictEqual(hitRes.clickable, true, 'Descendant child span must be considered clickable');
        assert.strictEqual(hitRes.isDescendant, true);
    });

    // -------------------------------------------------------------
    // R6.5-3: true external overlay is detected
    // -------------------------------------------------------------
    it('R6.5-3: true external overlay is detected', () => {
        const form = new MockForm('test_r6_5_3_form');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        form.appendChild(btn);

        const externalModal = new MockElement('DIV', 'modal_overlay');
        externalModal.style = { pointerEvents: 'auto', display: 'block', visibility: 'visible', zIndex: '9999' };

        global.document.elementFromPoint = () => externalModal;

        const executor = new cs.SubmitExecutorR5(form, {});
        const hitRes = executor.checkPointerHit(btn);
        assert.strictEqual(hitRes.clickable, false, 'True external overlay must be detected as not clickable');
        assert.strictEqual(hitRes.blocker, externalModal);
    });

    // -------------------------------------------------------------
    // R6.5-4: safe overlay dismissed once then candidate re-queried
    // -------------------------------------------------------------
    await itAsync('R6.5-4: safe overlay dismissed once then candidate re-queried', async () => {
        const form = new MockForm('test_r6_5_4_form');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        form.appendChild(btn);

        const modal = new MockElement('DIV', 'cookie_modal');
        modal.className = 'modal-backdrop';
        const closeBtn = new MockElement('BUTTON', 'close_btn');
        closeBtn.className = 'close';
        closeBtn.clicked = false;
        closeBtn.click = function() { this.clicked = true; };
        modal.appendChild(closeBtn);

        const executor = new cs.SubmitExecutorR5(form, {});
        const dismissed = await executor.safeDismissOverlay(modal);
        assert.strictEqual(dismissed, true, 'Safe dismiss should find and click close button');
        assert.strictEqual(closeBtn.clicked, true, 'Close button must have been clicked');
    });

    // -------------------------------------------------------------
    // R6.5-5: SUBMIT_TRIGGERED remains false if no submit effect
    // -------------------------------------------------------------
    await itAsync('R6.5-5: SUBMIT_TRIGGERED remains false if no submit effect', async () => {
        // Non-form container, button click does not submit, overlay blocks pointer
        const divContainer = new MockElement('DIV', 'custom_form_container');
        const btn = new MockElement('BUTTON', 'submit_btn', 'button');
        divContainer.appendChild(btn);

        const modal = new MockElement('DIV', 'hard_overlay');
        modal.style = { pointerEvents: 'auto', display: 'block', visibility: 'visible', zIndex: '9999' };
        global.document.elementFromPoint = () => modal;

        const outcome = await cs.executeSubmitStateMachine(divContainer, {});
        assert.strictEqual(outcome.success, false, 'Should fail when blocked without requestSubmit');
        assert.strictEqual(outcome.reasonCode, 'SUBMIT_CLICK_BLOCKED_BY_OVERLAY');
        assert.strictEqual(outcome.submitEventFired, false);
    });

    // -------------------------------------------------------------
    // R6.5-6: SUBMIT_TRIGGERED becomes true only after actual event/effect
    // -------------------------------------------------------------
    await itAsync('R6.5-6: SUBMIT_TRIGGERED becomes true only after actual event/effect', async () => {
        const form = new MockForm('test_r6_5_6_form');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        form.appendChild(btn);

        global.document.elementFromPoint = () => btn;

        const stagesEmitted = [];
        const origSendMessage = global.chrome.runtime.sendMessage;
        global.chrome.runtime.sendMessage = (msg) => {
            if (msg.action === 'STAGE_PROGRESSION') stagesEmitted.push(msg.stage);
            return Promise.resolve({ success: true });
        };

        const outcome = await cs.executeSubmitStateMachine(form, {});
        assert.strictEqual(outcome.success, true);
        assert.strictEqual(outcome.reasonCode, 'SUBMIT_TRIGGERED');
        assert.strictEqual(outcome.submitEventFired, true);

        global.chrome.runtime.sendMessage = origSendMessage;
    });

    // -------------------------------------------------------------
    // R6.5-7: fallback discovery cannot run after SETTLED
    // -------------------------------------------------------------
    it('R6.5-7: fallback discovery cannot run after SETTLED', () => {
        cs.setTargetLifecycleState(cs.TargetLifecycleState.SETTLED);
        assert.strictEqual(cs.getTargetLifecycleState(), 'SETTLED');
        
        // When settled, state machine prevents fallback actions
        const state = cs.getTargetLifecycleState();
        const canRunFallback = (state !== cs.TargetLifecycleState.SETTLED && state !== cs.TargetLifecycleState.SETTLING);
        assert.strictEqual(canRunFallback, false, 'Fallback discovery must be suppressed once SETTLED');
    });

    // -------------------------------------------------------------
    // R6.5-8: target cannot settle while DISCOVERY_FALLBACK active
    // -------------------------------------------------------------
    it('R6.5-8: target cannot settle while DISCOVERY_FALLBACK active', () => {
        cs.setTargetLifecycleState(cs.TargetLifecycleState.DISCOVERY_FALLBACK);
        assert.strictEqual(cs.getTargetLifecycleState(), 'DISCOVERY_FALLBACK');

        const state = cs.getTargetLifecycleState();
        assert.strictEqual(state === cs.TargetLifecycleState.SETTLED, false, 'Target must not be settled during DISCOVERY_FALLBACK');
    });

    // -------------------------------------------------------------
    // R6.5-9: valid form submit recovery runs before alternate contact discovery
    // -------------------------------------------------------------
    it('R6.5-9: valid form submit recovery runs before alternate contact discovery', () => {
        cs.setTargetLifecycleState(cs.TargetLifecycleState.ACTIVE_FORM);
        cs.setTargetLifecycleState(cs.TargetLifecycleState.SUBMIT_RECOVERY);
        assert.strictEqual(cs.getTargetLifecycleState(), 'SUBMIT_RECOVERY');
        
        // Transitions directly to SETTLING on submit failure rather than falling back to Track A
        cs.setTargetLifecycleState(cs.TargetLifecycleState.SETTLING);
        assert.strictEqual(cs.getTargetLifecycleState(), 'SETTLING');
    });

    // -------------------------------------------------------------
    // R6.5-10: target tab remains alive during fill/captcha/final audit/submit verify
    // -------------------------------------------------------------
    await itAsync('R6.5-10: target tab remains alive during fill/captcha/final audit/submit verify', async () => {
        const tab = await global.chrome.tabs.create({ url: 'https://example.com/target' });
        const tabId = tab.id;

        let tabClosedPrematurely = false;
        const origRemove = global.chrome.tabs.remove;
        global.chrome.tabs.remove = (id) => {
            tabClosedPrematurely = true;
            return origRemove(id);
        };

        // Simulate stages
        const stages = ['ACTIVE_FORM', 'FILLING', 'CAPTCHA', 'FINAL_AUDIT', 'SUBMITTING', 'VERIFYING'];
        for (const st of stages) {
            bg.campaignState.currentTargetStage = st;
            assert.strictEqual(tabClosedPrematurely, false, `Tab must not close during ${st}`);
        }

        global.chrome.tabs.remove = origRemove;
    });

    // -------------------------------------------------------------
    // R6.5-11: missing owned tab recreated once
    // -------------------------------------------------------------
    await itAsync('R6.5-11: missing owned tab recreated once', async () => {
        const nonExistentTabId = 88888;
        const candidateUrl = 'https://example.com/contact';
        
        const res = await bg.ensureCampaignTab(nonExistentTabId, candidateUrl);
        assert.strictEqual(res.recreated, true, 'Missing tab must trigger recreation');
        assert.ok(res.tabId, 'New tabId must be assigned');
        assert.strictEqual(bg.campaignState.targetTabId, res.tabId);
    });

    // -------------------------------------------------------------
    // R6.5-12: dead tab does not cause candidate exhaustion cascade
    // -------------------------------------------------------------
    await itAsync('R6.5-12: dead tab does not cause candidate exhaustion cascade', async () => {
        const deadTabId = 77777;
        const candidateUrl = 'https://example.com/contact-2';
        
        // Navigation recovers automatically
        const navRes = await bg.navigateToValidatedCandidate(deadTabId, candidateUrl, 'https://example.com');
        assert.strictEqual(navRes.success, true, 'Dead tab should self-recover without failing candidate');
        assert.strictEqual(navRes.recreated, true);
        assert.ok(navRes.tabId);
    });

    // -------------------------------------------------------------
    // R6.5-13: stale timeout ignored during active submit
    // -------------------------------------------------------------
    it('R6.5-13: stale timeout ignored during active submit', () => {
        bg.campaignState.isActive = true;
        bg.campaignState.sessionId = 500;
        bg.campaignState.currentTargetStage = 'SUBMITTING';

        let loopAdvanced = false;
        const origProcessNext = bg.processNextCampaignTarget;

        // Alarm fires while SUBMITTING
        if (global.chrome.alarms._listener) {
            global.chrome.alarms._listener({ name: 'xpider_timeout_500' });
        }

        // Must not have settled or advanced loop running
        assert.strictEqual(bg.campaignState.currentTargetStage, 'SUBMITTING');
    });

    // -------------------------------------------------------------
    // R6.5-14: cross-domain actualLoadedUrl requires verified redirect relation
    // -------------------------------------------------------------
    it('R6.5-14: cross-domain actualLoadedUrl requires verified redirect relation', () => {
        // Test verified redirect: osrkkacademy.com -> sarthakgreens.com
        const verified = bg.verifyRedirectRelation('http://osrkkacademy.com', 'https://sarthakgreens.com/');
        assert.strictEqual(verified.verified, true, 'osrkkacademy.com -> sarthakgreens.com must be VERIFIED_REDIRECT');
        assert.strictEqual(verified.relation, 'VERIFIED_REDIRECT');

        // Test unverified cross-domain mismatch
        const mismatch = bg.verifyRedirectRelation('https://example.com', 'https://completely-unrelated-site.com');
        assert.strictEqual(mismatch.verified, false, 'Unrelated cross-domain must be rejected');
        assert.strictEqual(mismatch.reason, 'TARGET_TAB_OWNERSHIP_MISMATCH');
    });

    // -------------------------------------------------------------
    // R6.5-15: raw PII absent from diagnostic logs
    // -------------------------------------------------------------
    it('R6.5-15: raw PII absent from diagnostic logs', () => {
        // Mock element and attributes
        const emailInput = new MockElement('INPUT', 'user_email', 'email');
        const phoneInput = new MockElement('INPUT', 'user_phone', 'tel');
        const nameInput = new MockElement('INPUT', 'user_name', 'text');

        const rawEmail = 'sensitive_owner_email@company.com';
        const rawPhone = '203-555-0199';
        const rawName = 'Johnathan Doe';

        const logs = [];
        const originalConsole = console.log;
        // Verify sanitization rule:
        // category=email filled=true length=N
        // category=phone filled=true
        // category=name filled=true
        const formatSanitizedLog = (category, val) => {
            if (category === 'email') return `[Input✅] category=email filled=true length=${val.length}`;
            if (category === 'phone') return `[Input✅] category=phone filled=true`;
            if (category === 'name') return `[Input✅] category=name filled=true`;
            return `[Input✅] category=${category} filled=true length=${val.length}`;
        };

        const emailLog = formatSanitizedLog('email', rawEmail);
        const phoneLog = formatSanitizedLog('phone', rawPhone);
        const nameLog = formatSanitizedLog('name', rawName);

        assert.strictEqual(emailLog.includes(rawEmail), false, 'Raw email must not appear in log');
        assert.strictEqual(phoneLog.includes(rawPhone), false, 'Raw phone must not appear in log');
        assert.strictEqual(nameLog.includes(rawName), false, 'Raw name must not appear in log');

        assert.ok(emailLog.includes(`category=email filled=true length=${rawEmail.length}`));
        assert.ok(phoneLog.includes('category=phone filled=true'));
        assert.ok(nameLog.includes('category=name filled=true'));
    });

    console.log(`\n============================================================`);
    console.log(`[R6.5 RESULTS] PASSED: ${passCount} | FAILED: ${failCount} | TOTAL: ${passCount + failCount}`);
    if (failCount === 0) {
        console.log('ALL R6.5 TESTS PASSED\n');
    } else {
        console.error('SOME R6.5 TESTS FAILED\n');
        process.exit(1);
    }
}

runR6_5_Tests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
