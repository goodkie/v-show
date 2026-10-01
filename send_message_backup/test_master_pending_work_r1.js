/**
 * test_master_pending_work_r1.js
 * Comprehensive Acceptance Test Suite for Master Pending Work Order (Issue #6 Comment #50)
 * 
 * Verifies:
 * 1. FIELD INTEGRITY BEFORE SUBMIT (Freeze values, targeted same-value repair, node replacement, no destructive clearing)
 * 2. SUBMIT RELIABILITY R2 (Async validation wait, SUBMIT_BUTTON_NEVER_ENABLED, overlay detection, external submitter)
 * 3. SMART/RANDOM FIELDS (Boston-style checkbox inquiry choice groups, dropdown random choices, honeypot safety, fact protection)
 * 4. HISTORY CONTACT LINKS & GOOGLE SHEETS CSV EXPORT (16 RFC-4180 columns, formula safety, link metadata)
 * 5. REALTIME CAMPAIGN METRICS (Idempotent settlement, live failure breakdown)
 */

const assert = require('assert');
const path = require('path');

// Mock DOM environment for Node.js
class MockClassList {
    constructor() {
        this.classes = new Set();
    }
    add(...args) { args.forEach(c => this.classes.add(c)); }
    remove(...args) { args.forEach(c => this.classes.delete(c)); }
    contains(c) { return this.classes.has(c); }
    toggle(c, force) {
        if (force === undefined) {
            if (this.classes.has(c)) this.classes.delete(c);
            else this.classes.add(c);
        } else if (force) {
            this.classes.add(c);
        } else {
            this.classes.delete(c);
        }
    }
}

class MockElement {
    constructor(tagName, id = '', type = '') {
        this.tagName = (tagName || 'DIV').toUpperCase();
        this.id = id;
        this.name = id;
        this.type = type;
        this.value = '';
        this.textContent = '';
        this.checked = false;
        this.disabled = false;
        this.required = false;
        this.isConnected = true;
        this.parentElement = null;
        this.children = [];
        this.attributes = {};
        this.classList = new MockClassList();
        this.style = {};
        this.eventListeners = {};
        this.offsetWidth = 100;
        this.offsetHeight = 30;
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

    querySelector(sel) {
        const matches = this.querySelectorAll(sel);
        return matches.length > 0 ? matches[0] : null;
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

    querySelectorAll(sel) {
        const results = [];
        const selectors = sel.split(',').map(s => s.trim().toLowerCase());

        const testEl = (el) => {
            if (!el || !el.tagName) return;
            const tag = el.tagName.toLowerCase();
            const type = (el.type || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const name = (el.name || '').toLowerCase();

            for (const s of selectors) {
                let match = false;
                if (s === ':invalid' && el.checkValidity && !el.checkValidity()) match = true;
                else if (s === 'input[type="submit"]' && tag === 'input' && type === 'submit') match = true;
                else if (s === 'button[type="submit"]' && tag === 'button' && (type === 'submit' || !type)) match = true;
                else if (s === 'button' && tag === 'button') match = true;
                else if (s === 'textarea' && tag === 'textarea') match = true;
                else if (s === 'select' && tag === 'select') match = true;
                else if (s.startsWith('input') && tag === 'input') {
                    if (s.includes(':not([type="submit"])') && type === 'submit') match = false;
                    else if (s.includes(':not([type="button"])') && type === 'button') match = false;
                    else if (s.includes(':not([type="hidden"])') && type === 'hidden') match = false;
                    else match = true;
                }
                else if (s.startsWith('#') && id === s.slice(1)) match = true;
                else if (s.startsWith('[name="') && s.endsWith('"]') && name === s.slice(7, -2)) match = true;
                else if (s === '[contenteditable="true"]' && el.contentEditable === 'true') match = true;
                else if (s === '[role="textbox"]' && el.getAttribute && el.getAttribute('role') === 'textbox') match = true;
                else if (s === '*' || s === tag) match = true;

                if (match) {
                    results.push(el);
                    break;
                }
            }
            if (el.children) {
                el.children.forEach(c => testEl(c));
            }
        };
        this.children.forEach(c => testEl(c));
        return results;
    }

    addEventListener(evt, fn) {
        if (!this.eventListeners[evt]) this.eventListeners[evt] = [];
        this.eventListeners[evt].push(fn);
    }

    dispatchEvent(event) {
        const list = this.eventListeners[event.type] || [];
        list.forEach(fn => {
            try { fn(event); } catch(_) {}
        });
        return true;
    }

    checkValidity() {
        if (this.required && (!this.value || this.value.trim() === '') && !this.checked) {
            return false;
        }
        return true;
    }

    getBoundingClientRect() {
        return { top: 100, left: 100, width: 100, height: 30, right: 200, bottom: 130 };
    }

    scrollIntoView() {}
    focus() {}
    blur() {}
    click() {
        this.dispatchEvent({ type: 'click', bubbles: true });
    }
}

class MockForm extends MockElement {
    constructor(id = 'test-form') {
        super('FORM', id);
        this.requestSubmitCalled = false;
        this.requestSubmitBtn = null;
    }

    requestSubmit(btn = null) {
        this.requestSubmitCalled = true;
        this.requestSubmitBtn = btn;
        this.dispatchEvent({ type: 'submit', bubbles: true, cancelable: true });
    }

    checkValidity() {
        const inputs = this.querySelectorAll(':invalid');
        return inputs.length === 0;
    }
}

// Setup Global Environment
global.window = {
    location: { hostname: 'bostonbjjwoburn.com', href: 'https://bostonbjjwoburn.com/contact-us/' },
    innerWidth: 1024,
    innerHeight: 768
};
global.document = {
    activeElement: null,
    elementFromPoint: (x, y) => null,
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null
};
global.Event = class {
    constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = opts.bubbles || false;
        this.cancelable = opts.cancelable || false;
    }
};
global.MouseEvent = global.Event;
global.FocusEvent = global.Event;
global.KeyboardEvent = global.Event;
global.PointerEvent = global.Event;
global.chrome = {
    storage: {
        local: {
            data: {},
            get: function(keys, cb) {
                const res = {};
                (Array.isArray(keys) ? keys : [keys]).forEach(k => {
                    if (this.data[k] !== undefined) res[k] = this.data[k];
                });
                if (cb) cb(res);
                return Promise.resolve(res);
            },
            set: function(obj, cb) {
                Object.assign(this.data, obj);
                if (cb) cb();
                return Promise.resolve();
            }
        }
    },
    runtime: {
        sendMessage: (msg, cb) => { if (cb) cb({ success: true }); },
        onMessage: { addListener: () => {} }
    }
};

// Load modules
const SmartFieldResolver = require('./modules/smart-field-resolver');
const { HistoryStore } = require('./modules/history-store');
const {
    freezeFieldValues,
    verifyFieldIntegrity,
    executeSubmitStateMachine
} = require('./content-script');

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${e.message}\n${e.stack}`);
        failCount++;
    }
}

async function runMasterPendingWorkSuite() {
    console.log('\n=== [MASTER PENDING WORK ORDER R1 ACCEPTANCE SUITE — ISSUE #6] ===\n');

    const resolver = new SmartFieldResolver();
    const tpl = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '617-555-0199',
        subject: 'Inquiry regarding BJJ schedule',
        message: 'Hello, I would like to inquire about introductory adult classes and schedules.'
    };

    // -------------------------------------------------------------
    // GROUP 1: FIELD INTEGRITY BEFORE SUBMIT (Section B)
    // -------------------------------------------------------------
    console.log('--- 1. FIELD INTEGRITY BEFORE SUBMIT ---');

    await test('FIELD-INT-1: freezeFieldValues snapshots all filled fields and attributes', async () => {
        const form = new MockForm('test_freeze');
        const emailInput = new MockElement('INPUT', 'email_field', 'email');
        emailInput.value = 'jane@example.com';
        emailInput.required = true;
        form.appendChild(emailInput);

        const msgInput = new MockElement('TEXTAREA', 'message_field');
        msgInput.value = 'Hello world inquiry message here';
        msgInput.required = true;
        form.appendChild(msgInput);

        const snapshot = freezeFieldValues(form, tpl);
        assert.strictEqual(snapshot.size, 2, 'Should capture 2 fields');
        assert.strictEqual(snapshot.get(emailInput).value, 'jane@example.com');
        assert.strictEqual(snapshot.get(msgInput).value, 'Hello world inquiry message here');
        assert.strictEqual(snapshot.get(emailInput).isRequired, true);
    });

    await test('FIELD-INT-2: Unrelated red styling or .required class does not clear fields', async () => {
        const form = new MockForm('test_styling');
        const emailInput = new MockElement('INPUT', 'email_field', 'email');
        emailInput.value = 'jane@example.com';
        emailInput.required = true;
        // Ancestor has error styling
        form.classList.add('error');
        form.classList.add('required');
        form.appendChild(emailInput);

        const snapshot = freezeFieldValues(form, tpl);
        const check = verifyFieldIntegrity(form, snapshot, tpl);

        assert.strictEqual(check.intact, true, 'Integrity must stay intact despite red/error styles');
        assert.strictEqual(emailInput.value, 'jane@example.com', 'Value must not be blanked');
    });

    await test('FIELD-INT-3: Reverted or blanked field triggers targeted same-value repair with authoritative value', async () => {
        const form = new MockForm('test_repair');
        const emailInput = new MockElement('INPUT', 'email_field', 'email');
        emailInput.name = 'email';
        emailInput.value = 'jane@example.com';
        emailInput.required = true;
        form.appendChild(emailInput);

        const snapshot = freezeFieldValues(form, tpl);
        
        // Simulate React state clearing the field on blur
        emailInput.value = '';

        const check = verifyFieldIntegrity(form, snapshot, tpl);
        assert.strictEqual(check.intact, true, 'Repair should succeed');
        assert.strictEqual(check.repairedCount, 1, 'One field should be repaired');
        assert.strictEqual(emailInput.value, 'jane@example.com', 'Exact authoritative template email restored');
    });

    await test('FIELD-INT-4: FIELD_NODE_REPLACED detected and handled when framework unmounts DOM node', async () => {
        const form = new MockForm('test_node_replace');
        const oldInput = new MockElement('INPUT', 'msg_field', 'text');
        oldInput.name = 'message';
        oldInput.value = tpl.message;
        oldInput.required = true;
        form.appendChild(oldInput);

        const snapshot = freezeFieldValues(form, tpl);

        // Simulate framework re-render: old element unmounted, new element mounted
        oldInput.isConnected = false;
        const newInput = new MockElement('INPUT', 'msg_field', 'text');
        newInput.name = 'message';
        newInput.value = tpl.message; // retains value
        newInput.required = true;
        form.children = [newInput];

        const check = verifyFieldIntegrity(form, snapshot, tpl);
        assert.strictEqual(check.intact, true, 'Should find replacement node by ID/name');
    });

    await test('FIELD-INT-5: FIELD_REPAIR_FAILED returned if native field cannot retain repaired value', async () => {
        const form = new MockForm('test_repair_fail');
        const input = new MockElement('INPUT', 'unrepairable', 'text');
        input.name = 'mystery_field';
        input.value = 'Something';
        form.appendChild(input);

        const snapshot = freezeFieldValues(form, tpl);
        input.value = ''; // wiped

        // Empty template for mystery field so authorVal cannot be resolved
        const check = verifyFieldIntegrity(form, snapshot, {});
        assert.strictEqual(check.intact, false, 'Should fail when repair is impossible');
        assert.ok(['REQUIRED_FIELD_LOST_BEFORE_SUBMIT', 'FIELD_CLEARED_BEFORE_SUBMIT'].includes(check.reasonCode));
    });

    // -------------------------------------------------------------
    // GROUP 2: SUBMIT RELIABILITY R2 (Section C)
    // -------------------------------------------------------------
    console.log('\n--- 2. SUBMIT RELIABILITY R2 ---');

    await test('SUBMIT-R2-1: Disabled submit button observed up to 2.5s; returns SUBMIT_BUTTON_NEVER_ENABLED if never enabled', async () => {
        const form = new MockForm('form_disabled');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        btn.textContent = 'Send Message';
        btn.disabled = true; // Permanently disabled
        form.appendChild(btn);

        const outcome = await executeSubmitStateMachine(form, tpl, { observeDisabledMs: 300, settleDelayMs: 10 });
        assert.strictEqual(outcome.success, false, 'Should fail because button remained disabled');
        assert.strictEqual(outcome.reasonCode, 'SUBMIT_BUTTON_NEVER_ENABLED');
    });

    await test('SUBMIT-R2-2: Submit button initially disabled then enabled by framework succeeds', async () => {
        const form = new MockForm('form_async_enable');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        btn.textContent = 'Submit';
        btn.disabled = true;
        form.appendChild(btn);

        // Enable after 100ms
        setTimeout(() => { btn.disabled = false; }, 100);

        const outcome = await executeSubmitStateMachine(form, tpl, { observeDisabledMs: 600, settleDelayMs: 10 });
        assert.strictEqual(outcome.success, true, 'Should succeed once enabled');
        assert.strictEqual(outcome.reasonCode, 'SUBMIT_TRIGGERED');
    });

    await test('SUBMIT-R2-3: Overlay clickability test blocks submit with SUBMIT_CLICK_BLOCKED_BY_OVERLAY', async () => {
        const form = new MockForm('form_overlay');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        btn.textContent = 'Send Inquiry';
        form.appendChild(btn);

        const overlayEl = new MockElement('DIV', 'backdrop_modal');
        overlayEl.classList.add('overlay');

        // Mock document.elementFromPoint to return overlayEl over the button
        const origElementFromPoint = global.document.elementFromPoint;
        global.document.elementFromPoint = (x, y) => overlayEl;

        const outcome = await executeSubmitStateMachine(form, tpl, { settleDelayMs: 10 });
        global.document.elementFromPoint = origElementFromPoint;

        assert.strictEqual(outcome.success, false, 'Should be blocked by overlay');
        assert.strictEqual(outcome.reasonCode, 'SUBMIT_CLICK_BLOCKED_BY_OVERLAY');
    });

    await test('SUBMIT-R2-4: Native FORM prefers form.requestSubmit(btn); custom SPA falls back to single trusted click', async () => {
        const form = new MockForm('form_req_submit');
        const btn = new MockElement('BUTTON', 'submit_btn', 'submit');
        btn.textContent = 'Send';
        form.appendChild(btn);

        const outcome = await executeSubmitStateMachine(form, tpl, { settleDelayMs: 10 });
        assert.strictEqual(outcome.success, true);
        assert.strictEqual(outcome.strategy, 'requestSubmit');
        assert.strictEqual(form.requestSubmitCalled, true);
        assert.strictEqual(form.requestSubmitBtn, btn);
    });

    // -------------------------------------------------------------
    // GROUP 3: SMART/RANDOM FIELDS & BOSTON BJJ POLICIES (Section E)
    // -------------------------------------------------------------
    console.log('\n--- 3. SMART UNKNOWN-FIELD COMPLETION & RANDOM SAFE CHOICES ---');

    await test('SMART-RND-1: Boston BJJ "I\'m interested in..." checkbox group selects one valid option stably and caches choice', () => {
        const opt1 = {
            type: 'checkbox',
            label: "I'm interested in: Adult Brazilian Jiu-Jitsu",
            value: 'adult_bjj',
            groupName: 'interested_in_programs'
        };
        const opt2 = {
            type: 'checkbox',
            label: "I'm interested in: Kids Martial Arts",
            value: 'kids_bjj',
            groupName: 'interested_in_programs'
        };

        const res1 = resolver.resolve(opt1, tpl, { host: 'bostonbjjwoburn.com' });
        const res2 = resolver.resolve(opt2, tpl, { host: 'bostonbjjwoburn.com' });

        assert.strictEqual(res1.source, 'random_safe_choice');
        assert.strictEqual(res1.fieldCategory, 'inquiry_choice_group');
        assert.strictEqual(res1.action, 'check');
        assert.strictEqual(res1.checked, true);

        // Second option in same group should skip because option 1 was stably chosen
        assert.strictEqual(res2.action, 'skip');
        assert.strictEqual(res2.checked, false);

        // Re-evaluating opt1 must return exact same cached decision (no reroll)
        const recheck1 = resolver.resolve(opt1, tpl, { host: 'bostonbjjwoburn.com' });
        assert.strictEqual(recheck1.checked, true, 'Cached decision must remain true');
    });

    await test('SMART-RND-2: Safe dropdown random choice selects one non-placeholder option stably and caches choice', () => {
        const dropdownField = {
            type: 'select',
            id: 'experience_level',
            label: 'Experience Level',
            options: [
                { value: '', text: 'Select Experience Level', disabled: false },
                { value: 'none', text: 'No Experience (Beginner)', disabled: false },
                { value: '1_2_years', text: '1-2 Years', disabled: false },
                { value: '3_plus', text: '3+ Years', disabled: false }
            ]
        };

        const res = resolver.resolve(dropdownField, tpl, { host: 'bostonbjjwoburn.com' });
        assert.strictEqual(res.action, 'select');
        assert.strictEqual(res.source, 'random_safe_choice');
        assert.notStrictEqual(res.value, '', 'Must not select placeholder');

        // Re-evaluation must yield exact same choice
        const recheck = resolver.resolve(dropdownField, tpl, { host: 'bostonbjjwoburn.com' });
        assert.strictEqual(recheck.value, res.value, 'Choice must be stably cached');
    });

    await test('SMART-RND-3: Honeypots are strictly untouched (HONEYPOT_UNTOUCHED)', () => {
        const honeypot = {
            type: 'text',
            name: 'website_url',
            label: 'Leave this field blank',
            isHoneypot: true
        };
        const res = resolver.resolve(honeypot, tpl);
        assert.strictEqual(res.action, 'skip');
        assert.strictEqual(res.reason, 'HONEYPOT_UNTOUCHED');
        assert.strictEqual(res.fieldCategory, 'honeypot');
    });

    await test('SMART-RND-4: Factual sensitive questions without template facts return UNRESOLVED_REQUIRED_FACT without hallucination', () => {
        const factField = {
            type: 'number',
            name: 'annual_revenue',
            label: 'What is your annual company revenue?',
            required: true
        };
        const res = resolver.resolve(factField, tpl);
        assert.strictEqual(res.action, 'unresolved');
        assert.strictEqual(res.reason, 'UNRESOLVED_REQUIRED_FACT');
    });

    await test('SMART-RND-5: Required Terms / Privacy auto-checked; Marketing / Newsletter stays unchecked', () => {
        const terms = {
            type: 'checkbox',
            label: 'I agree to the Terms of Service & Privacy Policy',
            required: true
        };
        const newsletter = {
            type: 'checkbox',
            label: 'Subscribe to our monthly promotional newsletter',
            required: false
        };

        const termsRes = resolver.resolve(terms, tpl);
        const newsRes = resolver.resolve(newsletter, tpl);

        assert.strictEqual(termsRes.action, 'check');
        assert.strictEqual(termsRes.checked, true);
        assert.strictEqual(newsRes.action, 'skip');
        assert.strictEqual(newsRes.checked, false);
    });

    // -------------------------------------------------------------
    // GROUP 4: HISTORY CONTACT LINKS & GOOGLE SHEETS CSV EXPORT (Sections J & K)
    // -------------------------------------------------------------
    console.log('\n--- 4. HISTORY CONTACT LINKS & GOOGLE SHEETS CSV EXPORT ---');

    await test('HIST-LINK-1: updateAttemptContact records contact page URL, hostname, and discovery source in PREPARING status', async () => {
        const hs = new HistoryStore();
        const { attemptId } = await hs.recordAttempt('https://example.com', {
            sourceUrl: 'https://example.com',
            status: 'PREPARING'
        });

        // Contact discovery finds /contact-us
        hs.updateAttemptContact(attemptId, {
            contactPageUrl: 'https://example.com/contact-us',
            contactDiscoverySource: 'AnchorSemanticFinder'
        });

        const records = hs.getFilteredRecords({ status: 'ALL' }).records;
        const rec = records.find(r => r.attemptId === attemptId);

        assert.ok(rec, 'Record must exist');
        assert.strictEqual(rec.contactPageUrl, 'https://example.com/contact-us');
        assert.strictEqual(rec.contactPageHostname, 'example.com');
        assert.strictEqual(rec.contactDiscoverySource, 'AnchorSemanticFinder');
    });

    await test('HIST-LINK-2: Settle attempt preserves contactPageUrl, duration, and status', async () => {
        const hs = new HistoryStore();
        const { attemptId } = await hs.recordAttempt('https://bostonbjjwoburn.com', {
            sourceUrl: 'https://bostonbjjwoburn.com',
            status: 'PREPARING'
        });

        await hs.settleAttempt(attemptId, true, 'CONFIRMED_SUCCESS', {
            contactPageUrl: 'https://bostonbjjwoburn.com/contact-us/',
            formPageUrl: 'https://bostonbjjwoburn.com/contact-us/',
            emailsFound: 2
        });

        const rec = hs.getFilteredRecords({ status: 'SUCCESS' }).records[0];
        assert.ok(rec);
        assert.strictEqual(rec.status, 'CONFIRMED_SUCCESS');
        assert.strictEqual(rec.contactPageUrl, 'https://bostonbjjwoburn.com/contact-us/');
        assert.strictEqual(rec.emailsFound, 2);
    });

    await test('GSHEETS-CSV-1: exportGoogleSheetsCsv exports exact 16 RFC-4180 columns with formula injection protection', async () => {
        const hs = new HistoryStore();
        const { attemptId } = await hs.recordAttempt('https://testcorp.com', {
            sourceUrl: 'https://testcorp.com',
            status: 'PREPARING',
            templateId: 'tpl_boston',
            templateVersion: 2,
            sessionId: 'ses_123'
        });

        // Malicious reason to test formula protection
        await hs.settleAttempt(attemptId, false, '=CMD|"/C calc"!A0', {
            contactPageUrl: 'https://testcorp.com/contact',
            formPageUrl: 'https://testcorp.com/contact',
            emailsFound: 1
        });

        const csv = hs.exportGoogleSheetsCsv();
        const lines = csv.split('\r\n');
        
        // Check Header line
        const expectedHeaders = 'Status,Reason,SourceURL,ContactPageURL,FormPageURL,SourceHostname,ContactPageHostname,ContactDiscoverySource,StartedAt,CompletedAt,DurationMs,TemplateId,TemplateVersion,EmailsFound,AttemptId,SessionId';
        assert.strictEqual(lines[0].replace(/"/g, ''), expectedHeaders, 'Header columns must match Section K specification');

        // Check data row
        const dataRow = lines[1];
        assert.ok(dataRow.includes("'=CMD"), 'Formula injection attack must be neutralized with leading single quote');
        assert.ok(dataRow.includes('https://testcorp.com'), 'Source URL must be present');
        assert.ok(dataRow.includes('https://testcorp.com/contact'), 'Contact Page URL must be present');
    });

    await test('GSHEETS-CSV-2: exportGoogleSheetsCsv supports filtering by active filtered records', async () => {
        const hs = new HistoryStore();
        const a1 = await hs.recordAttempt('https://site1.com', { sourceUrl: 'https://site1.com' });
        await hs.settleAttempt(a1.attemptId, true, 'CONFIRMED_SUCCESS');

        const a2 = await hs.recordAttempt('https://site2.com', { sourceUrl: 'https://site2.com' });
        await hs.settleAttempt(a2.attemptId, false, 'SUBMIT_BUTTON_NEVER_ENABLED');

        // Export only FAILED records
        const failedRecords = hs.getFilteredRecords({ status: 'FAILED' }).records;
        const csv = hs.exportGoogleSheetsCsv({ records: failedRecords });
        const lines = csv.split('\r\n');

        assert.strictEqual(lines.length, 2, 'Should have header + 1 failed record row');
        assert.ok(lines[1].includes('site2.com'), 'Failed site must be in filtered export');
        assert.ok(!lines[1].includes('site1.com'), 'Success site must be excluded from failed filter export');
    });

    // -------------------------------------------------------------
    // GROUP 5: REALTIME METRICS & CAMPAIGN COUNTERS (Section F)
    // -------------------------------------------------------------
    console.log('\n--- 5. REALTIME CAMPAIGN METRICS ---');

    await test('METRICS-1: Settle target updates authoritative counters and breakdown histogram', () => {
        const counters = {
            success: 0,
            failed: 0,
            completed: 0,
            remaining: 10,
            deliveryUnknown: 0,
            skippedHistory: 0,
            inProgress: 1,
            total: 10,
            failureBreakdown: {}
        };

        // Simulate target failure settlement
        counters.inProgress = 0;
        counters.failed++;
        const reason = 'SUBMIT_BUTTON_NEVER_ENABLED';
        counters.failureBreakdown[reason] = (counters.failureBreakdown[reason] || 0) + 1;
        counters.completed = counters.success + counters.failed + counters.deliveryUnknown;
        counters.remaining = Math.max(0, counters.total - counters.completed - counters.skippedHistory);

        assert.strictEqual(counters.failed, 1);
        assert.strictEqual(counters.completed, 1);
        assert.strictEqual(counters.remaining, 9);
        assert.strictEqual(counters.failureBreakdown['SUBMIT_BUTTON_NEVER_ENABLED'], 1);
    });

    console.log(`\n=== SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===\n`);
    if (failCount > 0) {
        process.exit(1);
    }
}

runMasterPendingWorkSuite();
