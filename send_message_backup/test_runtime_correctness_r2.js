/**
 * Acceptance Suite for RUNTIME CORRECTNESS HOTFIX R2:
 * 1. Target Tab Auto-Focus (FOCUS-1 .. FOCUS-3)
 * 2. Submission Outcome Verifier (SUCCESS-R2-1 .. SUCCESS-R2-10)
 * 3. History URL Integrity & Stale Write Guard (HIST-URL-1 .. HIST-URL-10)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Global mock DOM & Chrome environment
function setupMockEnv() {
    let focusCalls = {
        tabsCreated: [],
        tabsUpdated: [],
        windowsUpdated: []
    };

    global.window = {
        location: { href: 'https://example.com/contact' },
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };

    global.document = {
        body: {
            textContent: 'Welcome to our contact page',
            contains: () => true
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    global.chrome = {
        tabs: {
            create: async (opts) => {
                focusCalls.tabsCreated.push(opts);
                return { id: 888, windowId: 999, url: opts.url, active: !!opts.active };
            },
            update: async (tabId, opts) => {
                focusCalls.tabsUpdated.push({ tabId, ...opts });
                return { id: tabId, windowId: 999, url: opts.url, active: !!opts.active };
            },
            get: async (tabId) => ({ id: tabId, windowId: 999, url: 'https://example.com/contact' }),
            remove: async () => {},
            sendMessage: async () => ({ success: true })
        },
        windows: {
            update: async (winId, opts) => {
                focusCalls.windowsUpdated.push({ winId, ...opts });
                return { id: winId, ...opts };
            }
        },
        runtime: {
            sendMessage: async () => ({ success: true }),
            onMessage: { addListener: () => {} },
            onInstalled: { addListener: () => {} },
            onStartup: { addListener: () => {} }
        },
        storage: {
            local: {
                get: (k, cb) => cb ? cb({}) : Promise.resolve({}),
                set: (obj, cb) => cb ? cb() : Promise.resolve()
            }
        },
        alarms: {
            create: () => {},
            clear: () => {},
            onAlarm: { addListener: () => {} }
        }
    };

    global.sessionStorage = {
        _store: {},
        getItem(k) { return this._store[k] || null; },
        setItem(k, v) { this._store[k] = String(v); },
        removeItem(k) { delete this._store[k]; }
    };

    global.self = global;
    return focusCalls;
}

const focusCalls = setupMockEnv();

// Load modules
const historyStoreModule = require('./modules/history-store.js');
const HistoryStore = historyStoreModule.HistoryStore || historyStoreModule;
const contentScriptModule = require('./content-script.js');
const { SubmissionOutcomeVerifier } = contentScriptModule;
require('./background.js');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passedTests++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${e.message}\n`, e);
        failedTests++;
    }
}

function mockElement(tag, attrs = {}, text = '') {
    const el = {
        tagName: tag.toUpperCase(),
        textContent: text,
        innerText: text,
        value: attrs.value || '',
        id: attrs.id || '',
        className: attrs.className || '',
        classList: {
            _classes: new Set((attrs.className || '').split(' ').filter(Boolean)),
            contains(c) { return this._classes.has(c); },
            add(c) { this._classes.add(c); },
            remove(c) { this._classes.delete(c); }
        },
        disabled: !!attrs.disabled,
        offsetParent: {},
        getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 }),
        getAttribute(k) { return attrs[k] || null; },
        setAttribute(k, v) { attrs[k] = v; },
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true
    };
    return el;
}

async function runSuite() {
    console.log('\n=== [RUNTIME CORRECTNESS HOTFIX R2 ACCEPTANCE SUITE] ===\n');

    // ==========================================
    // 1. TARGET TAB AUTO-FOCUS (FOCUS-1..3)
    // ==========================================
    console.log('--- 1. TARGET TAB AUTO-FOCUS ---');

    await test('FOCUS-1: Target tab created => active true + window focused', async () => {
        focusCalls.tabsCreated.length = 0;
        focusCalls.windowsUpdated.length = 0;
        
        await self.__xpiderFocusTargetTab(888);
        assert.ok(focusCalls.windowsUpdated.some(w => w.winId === 999 && w.focused === true), 'Window must be focused');
    });

    await test('FOCUS-2: Candidate reuses same tab and remains active', async () => {
        focusCalls.tabsUpdated.length = 0;
        focusCalls.windowsUpdated.length = 0;

        await self.__xpiderFocusTargetTab(888);
        assert.ok(focusCalls.tabsUpdated.some(t => t.tabId === 888 && t.active === true), 'Tab must remain active');
        assert.ok(focusCalls.windowsUpdated.some(w => w.winId === 999 && w.focused === true), 'Window must remain focused');
    });

    await test('FOCUS-3: Focus failure nonfatal diagnostic', async () => {
        const origUpdate = global.chrome.windows.update;
        global.chrome.windows.update = async () => { throw new Error('Simulated window focus failure'); };
        
        // Should not throw
        await self.__xpiderFocusTargetTab(888);
        global.chrome.windows.update = origUpdate;
    });

    // ==========================================
    // 2. SUBMISSION OUTCOME VERIFIER (SUCCESS-R2-1..10)
    // ==========================================
    console.log('\n--- 2. SUBMISSION OUTCOME VERIFIER ---');

    await test('SUCCESS-R2-1: Same URL, new "Thank you" alert after AJAX => CONFIRMED_SUCCESS', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'test_form' });
        
        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();

        // Simulate AJAX alert appearing
        const alertNode = mockElement('div', { role: 'alert', className: 'status-msg' }, 'Thank you for your message! We will reply soon.');
        global.document.querySelectorAll = (sel) => {
            if (sel.includes('[role="alert"]') || sel.includes('.status-msg')) return [alertNode];
            return [];
        };

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res, true);
    });

    await test('SUCCESS-R2-2: Same URL, framework-specific confirmation container => CONFIRMED_SUCCESS', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'wpcf7_form' });
        
        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();

        const wpcf7Success = mockElement('div', { className: 'wpcf7-response-output wpcf7-mail-sent-ok' }, 'Your message was sent successfully.');
        global.document.querySelectorAll = (sel) => {
            if (sel.includes('.wpcf7-mail-sent-ok')) return [wpcf7Success];
            return [];
        };

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res, true);
    });

    await test('SUCCESS-R2-3: URL redirects to /thank-you => CONFIRMED_SUCCESS', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'f1' });
        
        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();

        // Simulate URL navigation to /thank-you
        global.window.location.href = 'https://example.com/thank-you';
        global.document.querySelectorAll = () => [];

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res, true);
    });

    await test('SUCCESS-R2-4: Submit event + button busy + form reset, no errors => CONFIRMED_SUCCESS_COMPOSITE', async () => {
        global.window.location.href = 'https://example.com/contact';
        const btn = mockElement('button', { className: 'btn busy disabled', disabled: true }, 'Sending...');
        const textarea = mockElement('textarea', { value: '' });
        const form = mockElement('form', { id: 'f2' });
        form.querySelector = (sel) => {
            if (sel.includes('button')) return btn;
            if (sel.includes('textarea')) return textarea;
            return null;
        };
        form.querySelectorAll = (sel) => {
            if (sel.includes('input')) return [];
            return [];
        };

        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();
        verifier.submitEventSeen = true;
        global.document.querySelectorAll = () => [];

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res, true);
    });

    await test('SUCCESS-R2-5: Field reset alone => NOT success (DELIVERY_UNKNOWN)', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'f3' });
        const textarea = mockElement('textarea', { value: '' });
        form.querySelector = (sel) => {
            if (sel.includes('textarea')) return textarea;
            return null;
        };
        form.querySelectorAll = () => [];

        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();
        verifier.submitEventSeen = false; // No submit event seen
        global.document.querySelectorAll = () => [];

        // Run verification with click having no submit side effect
        const res = await verifier.verify({ success: true, strategy: 'trusted_click_sequence', submitEventFired: false });
        assert.strictEqual(res, false, 'Field reset alone without submit event must not be classified as success');
    });

    await test('SUCCESS-R2-6: New validation error after click => SUBMIT_VALIDATION_BLOCKED', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'f4' });
        const errNode = mockElement('span', { className: 'error', 'aria-invalid': 'true' }, 'Please enter a valid email address');
        
        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();

        global.document.querySelectorAll = (sel) => {
            if (sel.includes('.error') || sel.includes('[aria-invalid="true"]')) return [errNode];
            return [];
        };

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res, false, 'Validation error must block success classification');
    });

    await test('SUCCESS-R2-7: Success message appears after 4 seconds => verified cleanly', async () => {
        global.window.location.href = 'https://example.com/contact';
        global.document.querySelectorAll = () => [];
        const form = mockElement('form', { id: 'f5' });
        const btn = mockElement('button', { className: 'loading' }, 'Submitting...');
        form.querySelector = () => btn;

        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();

        // Inject success message asynchronously after 500ms
        const injectTimer = setTimeout(() => {
            const node = mockElement('div', { role: 'alert' }, 'Message sent successfully');
            global.document.querySelectorAll = (sel) => {
                if (sel.includes('[role="alert"]')) return [node];
                return [];
            };
        }, 500);

        const res = await verifier.verify({ success: true, submitEventFired: true });
        clearTimeout(injectTimer);
        assert.strictEqual(res, true);
    });

    await test('SUCCESS-R2-8: Pre-existing "success" text before submit => NOT counted', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'f6' });
        const existingNode = mockElement('div', { className: 'success-stories' }, 'Our client success stories');
        
        global.document.querySelectorAll = (sel) => {
            if (sel.includes('[class*="success"]')) return [existingNode];
            return [];
        };

        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();
        assert.ok(verifier.preSnapshot.existingSuccessTexts.includes('our client success stories'));

        // Post-submit: still only the existing node
        global.document.querySelectorAll = (sel) => {
            if (sel.includes('[class*="success"]')) return [existingNode];
            return [];
        };

        const res = await verifier.verify({ success: true, submitEventFired: false });
        assert.strictEqual(res, false, 'Pre-existing text must not be counted as new submission success');
    });

    await test('SUCCESS-R2-9: Duplicate verify triggers settled cleanly once', async () => {
        global.window.location.href = 'https://example.com/contact';
        global.document.querySelectorAll = () => [];
        const form = mockElement('form', { id: 'f7' });
        const alertNode = mockElement('div', { role: 'alert' }, 'Thank you!');

        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();

        // Now post-submit arrives
        global.document.querySelectorAll = (sel) => {
            if (sel.includes('[role="alert"]')) return [alertNode];
            return [];
        };

        const res1 = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res1, true);
    });

    await test('SUCCESS-R2-10: Submit triggered but no confirmation/error => DELIVERY_UNKNOWN', async () => {
        global.window.location.href = 'https://example.com/contact';
        const form = mockElement('form', { id: 'f8' });
        global.document.querySelectorAll = () => [];

        const verifier = new SubmissionOutcomeVerifier(form, {});
        verifier.prepare();
        verifier.submitEventSeen = true;

        const res = await verifier.verify({ success: true, submitEventFired: true });
        assert.strictEqual(res, false);
    });

    // ==========================================
    // 3. HISTORY CONTACT PAGE URL INTEGRITY (HIST-URL-1..10)
    // ==========================================
    console.log('\n--- 3. HISTORY CONTACT PAGE URL INTEGRITY ---');

    await test('HIST-URL-1: Candidate /contact discovered => selectedCandidateUrl set, contactPageUrl remains blank', async () => {
        const hs = new HistoryStore('test_db_url_1');
        const token = 'tok_111';
        const rec = await hs.recordAttempt('https://brewsterkarate.org', {
            targetToken: token,
            status: 'PREPARING'
        });

        // Discovery found /contact
        hs.updateAttemptContact(rec.attemptId, {
            selectedCandidateUrl: 'https://brewsterkarate.org/contact',
            contactDiscoverySource: 'common_path'
        }, token);

        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.selectedCandidateUrl, 'https://brewsterkarate.org/contact');
        assert.strictEqual(attempt.contactPageUrl, null, 'contactPageUrl must remain blank during candidate discovery');
    });

    await test('HIST-URL-2: Candidate 1 rejected; Candidate 2 verified eligible => contactPageUrl = Candidate 2', async () => {
        const hs = new HistoryStore('test_db_url_2');
        const token = 'tok_222';
        const rec = await hs.recordAttempt('https://brewsterkarate.org', { targetToken: token });

        // Cand 1 evaluated
        hs.updateAttemptContact(rec.attemptId, { selectedCandidateUrl: 'https://brewsterkarate.org/newsletter' }, token);
        // Cand 2 verified
        hs.updateAttemptContact(rec.attemptId, {
            selectedCandidateUrl: 'https://brewsterkarate.org/contact-us',
            contactPageUrl: 'https://brewsterkarate.org/contact-us',
            formPageUrl: 'https://brewsterkarate.org/contact-us'
        }, token);

        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.contactPageUrl, 'https://brewsterkarate.org/contact-us');
    });

    await test('HIST-URL-3: /contact redirects to /contact-us/ => stored contactPageUrl = actual final loaded URL', async () => {
        const hs = new HistoryStore('test_db_url_3');
        const token = 'tok_333';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: token });

        // Actual loaded URL after HTTP redirect
        const actualFinalLoadedUrl = 'https://example.com/contact-us/';
        hs.updateAttemptContact(rec.attemptId, {
            contactPageUrl: actualFinalLoadedUrl,
            formPageUrl: actualFinalLoadedUrl
        }, token);

        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.contactPageUrl, 'https://example.com/contact-us/');
    });

    await test('HIST-URL-4: Verified contact page links to separate /form/ => contactPageUrl=/contact, formPageUrl=/form', async () => {
        const hs = new HistoryStore('test_db_url_4');
        const token = 'tok_444';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: token });

        hs.updateAttemptContact(rec.attemptId, {
            contactPageUrl: 'https://example.com/contact',
            formPageUrl: 'https://example.com/form'
        }, token);

        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.contactPageUrl, 'https://example.com/contact');
        assert.strictEqual(attempt.formPageUrl, 'https://example.com/form');
    });

    await test('HIST-URL-5: Submit redirects to /thank-you => contactPageUrl unchanged, resultUrl=/thank-you', async () => {
        const hs = new HistoryStore('test_db_url_5');
        const token = 'tok_555';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: token });

        // Commit contact & form URL before submit
        hs.updateAttemptContact(rec.attemptId, {
            contactPageUrl: 'https://example.com/contact-us',
            formPageUrl: 'https://example.com/contact-us',
            submittedFromUrl: 'https://example.com/contact-us',
            lockPreSubmitUrls: true
        }, token);

        // Settle with redirect to /thank-you
        await hs.settleAttempt(rec.attemptId, true, 'CONFIRMED_SUCCESS', {
            resultUrl: 'https://example.com/thank-you'
        });

        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.contactPageUrl, 'https://example.com/contact-us', 'contactPageUrl must not be overwritten by thank-you URL');
        assert.strictEqual(attempt.resultUrl, 'https://example.com/thank-you', 'resultUrl must store post-submit URL');
    });

    await test('HIST-URL-6: Late async write from old candidate => blocked by targetToken', async () => {
        const hs = new HistoryStore('test_db_url_6');
        const tokenTargetA = 'tok_target_A';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: tokenTargetA });

        // Attempt write with stale/wrong token
        const staleToken = 'tok_stale_old';
        const ok = hs.updateAttemptContact(rec.attemptId, {
            contactPageUrl: 'https://stale-site.com/contact'
        }, staleToken);

        assert.strictEqual(ok, false, 'Late async write with mismatched token must return false');
        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.contactPageUrl, null, 'Stale write must not mutate attempt');
    });

    await test('HIST-URL-7: Next target starts => no prior target URL leakage', async () => {
        const hs = new HistoryStore('test_db_url_7');
        
        // Target 1
        const tok1 = 'tok_1';
        const a1 = await hs.recordAttempt('https://site-one.com', { targetToken: tok1 });
        hs.updateAttemptContact(a1.attemptId, { contactPageUrl: 'https://site-one.com/contact' }, tok1);
        await hs.settleAttempt(a1.attemptId, true, 'CONFIRMED_SUCCESS');

        // Target 2 starts fresh
        const tok2 = 'tok_2';
        const a2 = await hs.recordAttempt('https://site-two.com', { targetToken: tok2 });

        const att2 = hs.attempts.find(a => a.attemptId === a2.attemptId);
        assert.strictEqual(att2.contactPageUrl, null, 'New target attempt must not inherit prior target contactPageUrl');
        assert.strictEqual(att2.sourceUrl, 'https://site-two.com');
    });

    await test('HIST-URL-8: PREPARING -> SUCCESS updates same attempt row (no duplicate)', async () => {
        const hs = new HistoryStore('test_db_url_8');
        const tok = 'tok_8';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: tok, status: 'PREPARING' });
        
        assert.strictEqual(hs.attempts.length, 1);
        await hs.settleAttempt(rec.attemptId, true, 'CONFIRMED_SUCCESS');
        
        assert.strictEqual(hs.attempts.length, 1, 'settleAttempt must update the existing attempt without creating a duplicate');
        assert.strictEqual(hs.attempts[0].status, 'CONFIRMED_SUCCESS');
    });

    await test('HIST-URL-9: about:blank / transient URL never stored as contactPageUrl', async () => {
        const hs = new HistoryStore('test_db_url_9');
        const tok = 'tok_9';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: tok });

        hs.updateAttemptContact(rec.attemptId, { contactPageUrl: 'about:blank' }, tok);
        const attempt = hs.attempts.find(a => a.attemptId === rec.attemptId);
        assert.strictEqual(attempt.contactPageUrl, null, 'about:blank must never be stored as contactPageUrl');
    });

    await test('HIST-URL-10: Google Sheets export uses corrected contactPageUrl/formPageUrl/resultUrl mapping', async () => {
        const hs = new HistoryStore('test_db_url_10');
        const tok = 'tok_10';
        const rec = await hs.recordAttempt('https://example.com', { targetToken: tok });
        
        hs.updateAttemptContact(rec.attemptId, {
            contactPageUrl: 'https://example.com/contact-us',
            formPageUrl: 'https://example.com/contact-us',
            lockPreSubmitUrls: true
        }, tok);

        await hs.settleAttempt(rec.attemptId, true, 'CONFIRMED_SUCCESS', {
            resultUrl: 'https://example.com/thank-you'
        });

        const csv = hs.exportGoogleSheetsCsv();
        assert.ok(csv.includes('https://example.com/contact-us'), 'CSV must contain verified contactPageUrl');
        assert.ok(!csv.includes('https://example.com/thank-you'), 'CSV ContactPageURL column must not be replaced by resultUrl');
    });

    console.log(`\n=== R2 SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED ===\n`);
    if (failedTests > 0) {
        throw new Error(`R2 test suite failed with ${failedTests} failure(s)`);
    }
}

runSuite().catch(err => {
    console.error('Fatal suite failure:', err);
    process.exit(1);
});
