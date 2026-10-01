/**
 * Phase 2B Acceptance Test Suite (Remediation R1)
 * 
 * Validates:
 * 1. TC-2B-1: Multi-Template CRUD & Dropdown Selector Synchronization
 * 2. TC-2B-2: Authoritative Dual-Accessor CRUD & Atomic Error Propagation
 * 3. TC-2B-3: History Ledger Querying, Filtering, and Domain Search
 * 4. TC-2B-4: Selective Reset Controller Execution
 * 5. TC-2B-5: Retry Failed Controller Execution (Auditor Correction 1)
 * 6. TC-2B-6: Active Submission Reset Guard (Auditor Protection & Storage Query)
 * 7. TC-2B-7: CSV Audit Export Trigger & Additive Template Metadata (Auditor Correction 2)
 * 8. TC-2B-8: Production Controller Functions in popup.js Directly Invoked & startCampaign (Auditor Correction 3)
 */

const assert = require('assert');
const path = require('path');

// ── Environment Mock Setup ───────────────────────────────────────────────────

function createMockStorage(initialData = {}) {
    return {
        _data: { ...initialData },
        get(keys, callback) {
            const data = this._data;
            const result = {};
            if (typeof keys === 'string') {
                result[keys] = data[keys];
            } else if (Array.isArray(keys)) {
                keys.forEach(k => { result[k] = data[k]; });
            } else if (keys && typeof keys === 'object') {
                Object.keys(keys).forEach(k => {
                    result[k] = data[k] !== undefined ? data[k] : keys[k];
                });
            } else {
                Object.assign(result, data);
            }
            if (callback) callback(result);
            return Promise.resolve(result);
        },
        set(items, callback) {
            Object.assign(this._data, items);
            if (callback) callback();
            return Promise.resolve();
        }
    };
}

function createMockDOM() {
    const elements = new Map();

    const getElement = (id) => {
        if (!elements.has(id)) {
            const el = {
                id,
                value: '',
                textContent: '',
                innerHTML: '',
                checked: false,
                disabled: false,
                style: {},
                classList: {
                    _classes: new Set(),
                    add(c) { this._classes.add(c); },
                    remove(c) { this._classes.delete(c); },
                    contains(c) { return this._classes.has(c); },
                    toggle(c, force) {
                        if (force !== undefined) {
                            if (force) this._classes.add(c);
                            else this._classes.delete(c);
                        } else {
                            if (this._classes.has(c)) this._classes.delete(c);
                            else this._classes.add(c);
                        }
                    }
                },
                options: [],
                selectedIndex: 0,
                appendChild(child) {
                    this.options.push(child);
                },
                addEventListener(evt, fn) {
                    this._listeners = this._listeners || {};
                    this._listeners[evt] = this._listeners[evt] || [];
                    this._listeners[evt].push(fn);
                },
                dataset: {},
                closest() { return this; },
                scrollIntoView() {},
                querySelector(sel) { return null; },
                querySelectorAll(sel) { return []; },
                click() {}
            };
            elements.set(id, el);
        }
        return elements.get(id);
    };

    const doc = {
        getElementById: getElement,
        querySelector: (sel) => {
            if (sel.startsWith('#')) return getElement(sel.substring(1));
            return getElement(sel.replace(/[^a-zA-Z0-9_-]/g, '_'));
        },
        querySelectorAll: (sel) => [],
        createElement: (tag) => {
            const el = getElement(`mock_${tag}_${Math.random().toString(36).substring(2, 7)}`);
            el.tagName = tag.toUpperCase();
            return el;
        },
        addEventListener: (evt, fn) => {},
        removeEventListener: (evt, fn) => {},
        body: getElement('mock_body')
    };

    return doc;
}

// Global Mocks for Node testing of popup.js
const mockStorage = createMockStorage();
const mockDOM = createMockDOM();

let lastIpcInvoke = null;
let simulateIpcBehavior = 'AUTO_RESPOND'; // 'AUTO_RESPOND', 'NO_RESPONDER', 'DELAYED_RESPOND'
const messageListeners = [];

global.chrome = {
    storage: {
        local: mockStorage,
        onChanged: { addListener: () => {} }
    },
    runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
            if (msg.action === 'GET_STATE') {
                const isPending = !!(mockStorage._data.xpider_currentAttempt && mockStorage._data.xpider_currentAttempt.status === 'SUBMIT_PENDING');
                const resp = {
                    success: true,
                    isActive: false,
                    hasActiveLock: isPending,
                    currentAttempt: mockStorage._data.xpider_currentAttempt || null
                };
                if (cb) cb(resp);
                return Promise.resolve(resp);
            }
            if (cb) cb({ success: true });
            return Promise.resolve({ success: true });
        },
        connect: () => ({ onMessage: { addListener: () => {} } }),
        onMessage: { addListener: () => {} }
    }
};

global.document = mockDOM;
global.window = {
    addEventListener: (evt, fn) => {
        if (evt === 'message') messageListeners.push(fn);
    },
    removeEventListener: (evt, fn) => {
        if (evt === 'message') {
            const idx = messageListeners.indexOf(fn);
            if (idx >= 0) messageListeners.splice(idx, 1);
        }
    },
    postMessage: (msg) => {
        if (msg && msg.type === 'XPIDER_INVOKE') {
            lastIpcInvoke = msg;
            if (simulateIpcBehavior === 'NO_RESPONDER') {
                // Simulates real Chrome where no responder/bridge handles XPIDER_INVOKE
                return;
            }
            if (simulateIpcBehavior === 'DELAYED_RESPOND') {
                setTimeout(() => {
                    messageListeners.forEach(fn => fn({
                        data: { type: 'XPIDER_RESPONSE', id: msg.id, result: { success: true } }
                    }));
                }, 25);
                return;
            }
            messageListeners.forEach(fn => fn({
                data: { type: 'XPIDER_RESPONSE', id: msg.id, result: { success: true } }
            }));
        }
    },
    close: () => {}
};
global.alert = (msg) => { /* Mock alert */ };
global.confirm = (msg) => true;

// Load production modules
const { TemplateStore } = require('./modules/template-store.js');
const { HistoryStore } = require('./modules/history-store.js');
const popup = require('./popup.js');

// ── Test Runner ─────────────────────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        totalPassed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(e);
        totalFailed++;
    }
}

async function runPhase2BSuite() {
    console.log("=== [PHASE 2B ACCEPTANCE TEST RUNNER — AUDITOR GATED R1] ===");

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-1: Multi-Template CRUD & Dropdown Selector Synchronization
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-1: Multi-Template CRUD & Dropdown Selector Synchronization", async () => {
        const storage = createMockStorage();
        const tStore = new TemplateStore(storage);

        // 1. Create 3 named templates
        const t1 = await tStore.saveTemplateRecord({ subject: "Sales A", message: "Pitch A", name: "Alice", email: "alice@sales.com" });
        const t2 = await tStore.saveTemplateRecord({ subject: "Sales B", message: "Pitch B", name: "Bob", email: "bob@sales.com" });
        const t3 = await tStore.saveTemplateRecord({ subject: "Partner", message: "Partner Pitch", name: "Charlie", email: "charlie@partner.com" });

        assert(t1.id && t2.id && t3.id, "All templates must have generated IDs");

        const all = await tStore.getAllTemplates();
        assert.strictEqual(all.templates.length, 3, "All 3 templates stored");
        assert.strictEqual(all.defaultId, t1.id, "First template created must be defaultId");

        // 2. Switch template -> verify form field mapping
        const mappedT2 = popup.populateFormFromTemplate(t2);
        assert.strictEqual(mappedT2.name, "Bob", "Mapped name must match");
        assert.strictEqual(mappedT2.email, "bob@sales.com", "Mapped email must match");
        assert.strictEqual(mappedT2.subject, "Sales B", "Mapped subject must match");

        // 3. Attempting to delete the default template (t1) must REJECT
        await assert.rejects(
            async () => { await tStore.deleteTemplate(t1.id); },
            /Cannot delete the default template. Set another template as default first./,
            "Must reject deletion of default template"
        );

        // 4. Delete non-default template Sales B -> verify removed from templates & recentIds
        const delRes = await tStore.deleteTemplate(t2.id);
        assert.strictEqual(delRes.deleted, true, "Delete must report success");

        const afterDel = await tStore.getAllTemplates();
        assert.strictEqual(afterDel.templates.length, 2, "Only 2 templates remain");
        assert(!afterDel.templatesMap[t2.id], "Sales B must no longer exist");
        assert(!afterDel.recentIds.includes(t2.id), "Sales B removed from recentIds");

        // 5. Set Partner as default -> verify defaultId updated and xpider_tpl synchronized
        await tStore.setDefaultTemplate(t3.id);
        const storeAfterDefault = await tStore.getStore();
        assert.strictEqual(storeAfterDefault.defaultId, t3.id, "defaultId must be Partner template id");
        assert.strictEqual(storage._data.xpider_tpl.subject, "Partner", "xpider_tpl must synchronize with default");

        // 6. Now t1 is non-default, so it can be safely deleted
        const delT1 = await tStore.deleteTemplate(t1.id);
        assert.strictEqual(delT1.deleted, true, "t1 can now be deleted since it is not default");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-2: Authoritative Dual-Accessor CRUD & Atomic Error Propagation
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-2: Authoritative Dual-Accessor CRUD & Atomic Error Propagation", async () => {
        const storage = createMockStorage();
        const tStore = new TemplateStore(storage);

        // 1. Dual Accessor Validation
        const created = await tStore.saveTemplateRecord({
            firstName: "Jane",
            lastName: "Doe",
            email: "jane@doe.com",
            subject: "Dual Accessor Test",
            message: "Body text"
        });

        // Top-level flat accessors
        assert.strictEqual(created.firstName, "Jane");
        assert.strictEqual(created.lastName, "Doe");
        assert.strictEqual(created.fullName, "Jane Doe");
        assert.strictEqual(created.email, "jane@doe.com");
        assert.strictEqual(created.subject, "Dual Accessor Test");

        // Nested sender / content accessors
        assert.strictEqual(created.sender.firstName, "Jane");
        assert.strictEqual(created.sender.fullName, "Jane Doe");
        assert.strictEqual(created.sender.email, "jane@doe.com");
        assert.strictEqual(created.content.subject, "Dual Accessor Test");

        // 2. Clone template maintains dual accessors with (Copy) suffix
        const cloned = await tStore.duplicateAndSaveTemplate(created.id);
        assert(cloned.subject.includes("(Copy)") || cloned.name.includes("(Copy)"), "Cloned subject or name must include (Copy)");
        assert.strictEqual(cloned.sender.firstName, "Jane", "Cloned sender must match");
        assert.notStrictEqual(cloned.id, created.id, "Cloned template must have unique ID");

        // 3. Delete sole remaining template must cleanly reject (as it is default)
        const singleStorage = createMockStorage();
        const singleStore = new TemplateStore(singleStorage);
        const soleTpl = await singleStore.saveTemplateRecord({ subject: "Sole", message: "Only one" });

        await assert.rejects(
            async () => { await singleStore.deleteTemplate(soleTpl.id); },
            /Cannot delete the default template. Set another template as default first./,
            "Must reject deletion of default template when sole remaining"
        );

        // 4. Storage Rejection: chrome.runtime.lastError propagation
        const errorStorage = {
            get: (k, cb) => cb({}),
            set: (items, cb) => {
                global.chrome.runtime.lastError = new Error("STORAGE_WRITE_FAILURE_CHROME_LAST_ERROR");
                if (cb) cb();
            }
        };
        const errorStore = new TemplateStore(errorStorage);
        await assert.rejects(
            async () => { await errorStore.saveTemplateRecord({ subject: "Err", message: "Fail" }); },
            /STORAGE_WRITE_FAILURE_CHROME_LAST_ERROR/,
            "TemplateStore must reject on chrome.runtime.lastError"
        );
        global.chrome.runtime.lastError = null; // reset

        // 5. Storage Rejection: callback error argument
        const callbackErrStorage = {
            get: (k, cb) => cb({}),
            set: (items, cb) => {
                if (cb) cb(new Error("CALLBACK_ERR_QUOTA_EXCEEDED"));
            }
        };
        const callbackErrStore = new TemplateStore(callbackErrStorage);
        await assert.rejects(
            async () => { await callbackErrStore.saveTemplateRecord({ subject: "Err2", message: "Fail2" }); },
            /CALLBACK_ERR_QUOTA_EXCEEDED/,
            "TemplateStore must reject on callback error"
        );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-3: History Ledger Querying, Filtering, and Domain Search
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-3: History Ledger Querying, Filtering, and Domain Search", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);

        // Ingest diverse targets
        const rawUrls = [
            "https://alpha-success.com/contact",
            "https://beta-failed.com/contact",
            "https://gamma-unknown.com/reach",
            "invalid-url-entry",
            "https://delta-alpha-sub.com/form"
        ];
        await hs.ingestImportRows(rawUrls);

        // Settle attempts
        const id1 = hs.normalizeTargetIdentity(rawUrls[0]);
        const id2 = hs.normalizeTargetIdentity(rawUrls[1]);
        const id3 = hs.normalizeTargetIdentity(rawUrls[2]);
        const id5 = hs.normalizeTargetIdentity(rawUrls[4]);

        const a1 = (await hs.recordAttempt(id1, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(a1, true, 'CONFIRMED_SUCCESS');

        const a2 = (await hs.recordAttempt(id2, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(a2, false, 'CAPTCHA_FAIL');

        const a3 = (await hs.recordAttempt(id3, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(a3, false, 'DELIVERY_UNKNOWN');

        const a5 = (await hs.recordAttempt(id5, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(a5, true, 'CONFIRMED_SUCCESS');

        // 1. Query ALL
        const allRes = hs.getFilteredRecords({ status: 'ALL' });
        assert.strictEqual(allRes.totalCount, 5, "Total records must be 5");

        // 2. Query SUCCESS filter
        const successRes = hs.getFilteredRecords({ status: 'CONFIRMED_SUCCESS' });
        assert.strictEqual(successRes.totalCount, 2, "2 successful targets");
        assert(successRes.records.every(r => r.status === 'CONFIRMED_SUCCESS'));

        // 3. Query SUPPRESSED filter (SUCCESS and UNKNOWN suppress)
        const suppressedRes = hs.getFilteredRecords({ status: 'SUPPRESSED' });
        assert.strictEqual(suppressedRes.totalCount, 3, "3 suppressed targets (2 success + 1 unknown)");

        // 4. Query FAILED filter
        const failedRes = hs.getFilteredRecords({ status: 'FAILED' });
        assert.strictEqual(failedRes.totalCount, 1, "1 failure target");
        assert.strictEqual(failedRes.records[0].status, 'FAILURE');

        // 5. Query INVALID filter
        const invalidRes = hs.getFilteredRecords({ status: 'INVALID' });
        assert.strictEqual(invalidRes.totalCount, 1, "1 invalid row");
        assert.strictEqual(invalidRes.records[0].status, 'INVALID_INPUT');

        // 6. Substring domain search
        const searchRes = hs.getFilteredRecords({ status: 'ALL', search: 'alpha' });
        assert.strictEqual(searchRes.totalCount, 2, "Search for 'alpha' must match exactly 2 records");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-4: Selective Reset via UI Controller
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-4: Selective Reset via UI Controller", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);

        await hs.ingestImportRows([
            "https://target-1.com/contact",
            "https://target-2.com/contact",
            "https://target-3.com/contact"
        ]);

        const id1 = hs.normalizeTargetIdentity("https://target-1.com/contact");
        const id2 = hs.normalizeTargetIdentity("https://target-2.com/contact");
        const id3 = hs.normalizeTargetIdentity("https://target-3.com/contact");

        // All 3 succeed -> suppressed
        for (const id of [id1, id2, id3]) {
            const att = (await hs.recordAttempt(id, { status: 'PENDING_INTENT' })).attemptId;
            await hs.settleAttempt(att, true, 'CONFIRMED_SUCCESS');
        }

        assert(hs.isSuppressed(id1) && hs.isSuppressed(id2) && hs.isSuppressed(id3), "All 3 must be suppressed initially");

        // Selectively reset target 2
        const resetRes = await hs.applySelectiveReset([id2]);
        assert.strictEqual(resetRes.affectedCount, 1, "Exactly 1 target affected");

        assert.strictEqual(hs.isSuppressed(id1), true, "Target 1 must remain suppressed");
        assert.strictEqual(hs.isSuppressed(id2), false, "Target 2 must be released from suppression");
        assert.strictEqual(hs.isSuppressed(id3), true, "Target 3 must remain suppressed");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-5: Corrected Semantics: Retry Failed (Auditor Correction 1)
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-5: Retry Failed semantics - No mutation of suppression or generation", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);

        await hs.ingestImportRows([
            "https://success-1.com/contact",
            "https://success-2.com/contact",
            "https://unknown-1.com/contact",
            "https://fail-1.com/contact",
            "https://fail-2.com/contact"
        ]);

        const s1 = hs.normalizeTargetIdentity("https://success-1.com/contact");
        const s2 = hs.normalizeTargetIdentity("https://success-2.com/contact");
        const u1 = hs.normalizeTargetIdentity("https://unknown-1.com/contact");
        const f1 = hs.normalizeTargetIdentity("https://fail-1.com/contact");
        const f2 = hs.normalizeTargetIdentity("https://fail-2.com/contact");

        const attS1 = (await hs.recordAttempt(s1, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attS1, true, 'CONFIRMED_SUCCESS');

        const attS2 = (await hs.recordAttempt(s2, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attS2, true, 'CONFIRMED_SUCCESS');

        const attU1 = (await hs.recordAttempt(u1, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attU1, false, 'DELIVERY_UNKNOWN');

        const attF1 = (await hs.recordAttempt(f1, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attF1, false, 'CAPTCHA_FAIL');

        const attF2 = (await hs.recordAttempt(f2, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attF2, false, 'FORM_NOT_FOUND');

        const initialGen = hs.currentGeneration;

        // Query retryable failed targets via HistoryStore
        const retryable = hs.getRetryableFailedIdentities();
        assert.strictEqual(retryable.length, 2, "Must find exactly the 2 failed targets");
        assert(retryable.includes(f1) && retryable.includes(f2), "Must contain f1 and f2");
        assert(!retryable.includes(s1) && !retryable.includes(s2) && !retryable.includes(u1), "Must NOT contain suppressed targets");

        // Verify Correction 1 Mandate:
        // Generation must NOT be incremented
        assert.strictEqual(hs.currentGeneration, initialGen, "Generation must remain untouched");
        // Suppression states must remain intact
        assert.strictEqual(hs.isSuppressed(s1), true, "Success 1 remains suppressed");
        assert.strictEqual(hs.isSuppressed(s2), true, "Success 2 remains suppressed");
        assert.strictEqual(hs.isSuppressed(u1), true, "Unknown 1 remains suppressed");
        assert.strictEqual(hs.isSuppressed(f1), false, "Fail 1 remains unsuppressed/retryable");
        assert.strictEqual(hs.isSuppressed(f2), false, "Fail 2 remains unsuppressed/retryable");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-6: Active Submission Reset Guard (Auditor Protection & Storage Query)
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-6: Active Submission Reset Guard Rejection (Storage Lock Query)", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);

        // 1. HistoryStore direct guard check with explicit activeSubmitCount > 0
        await assert.rejects(
            async () => { await hs.applyGlobalReset(1); },
            /CANNOT_RESET_WITH_ACTIVE_SUBMIT_LOCK/,
            "HistoryStore must reject global reset when active submit lock > 0"
        );

        // 2. Controller level active submission guard with activeSubmitCount > 0
        await assert.rejects(
            async () => { await popup.dispatchSelectiveReset(["https://target.com"], 1); },
            /RESET_LOCKED_ACTIVE_SUBMISSION/,
            "Controller must reject selective reset when active submit lock > 0"
        );

        await assert.rejects(
            async () => { await popup.dispatchGlobalReset(1); },
            /RESET_LOCKED_ACTIVE_SUBMISSION/,
            "Controller must reject global reset when active submit lock > 0"
        );

        // 3. Controller level authoritative query of background SUBMIT_PENDING lock WITHOUT passing argument
        mockStorage._data.xpider_currentAttempt = {
            url: "https://in-flight-submission.com",
            attemptId: "att_active_123",
            status: "SUBMIT_PENDING",
            ts: Date.now()
        };

        // Assert checkActiveSubmitLock() evaluates to true
        const isLocked = await popup.checkActiveSubmitLock();
        assert.strictEqual(isLocked, true, "checkActiveSubmitLock must authoritatively detect SUBMIT_PENDING in storage");

        // Calling dispatchSelectiveReset() without arguments must reject due to storage lock
        await assert.rejects(
            async () => { await popup.dispatchSelectiveReset(["https://target.com"]); },
            /RESET_LOCKED_ACTIVE_SUBMISSION/,
            "dispatchSelectiveReset must reject when storage has active SUBMIT_PENDING lock"
        );

        // Calling dispatchGlobalReset() without arguments must reject due to storage lock
        await assert.rejects(
            async () => { await popup.dispatchGlobalReset(); },
            /RESET_LOCKED_ACTIVE_SUBMISSION/,
            "dispatchGlobalReset must reject when storage has active SUBMIT_PENDING lock"
        );

        // Clean up storage lock
        mockStorage._data.xpider_currentAttempt = null;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-7: CSV Audit Export Trigger & Additive Template Metadata (Auditor Correction 2)
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-7: CSV Audit Export Trigger & Additive Template Metadata", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);

        await hs.ingestImportRows([
            "https://audit-lead-1.com/contact",
            "https://audit-lead-2.com/contact",
            "=CMD|' /C calc'!A0", // Formula injection check
            "invalid-url"
        ]);

        const id1 = hs.normalizeTargetIdentity("https://audit-lead-1.com/contact");
        const id2 = hs.normalizeTargetIdentity("https://audit-lead-2.com/contact");

        // Record attempt with additive template metadata
        await hs.recordAttempt(id1, {
            templateId: "tpl_outreach_v1",
            templateVersion: 2,
            status: "CONFIRMED_SUCCESS",
            reasonCode: "SUCCESS_CONFIRMED"
        });

        // Record attempt WITHOUT template metadata (backward-compatibility check)
        await hs.recordAttempt(id2, {
            status: "FAILURE",
            reasonCode: "TIMEOUT"
        });

        const csv = hs.exportToCsv();

        // 1. Headers verification
        assert(csv.includes("TemplateId"), "CSV must include additive TemplateId column");
        assert(csv.includes("TemplateVersion"), "CSV must include additive TemplateVersion column");

        // 2. Template metadata present in row 1
        assert(csv.includes('"tpl_outreach_v1"'), "CSV must contain templateId for attempt 1");
        assert(csv.includes('"2"'), "CSV must contain templateVersion for attempt 1");

        // 3. Backward compatibility: missing metadata row renders safely without crash
        assert(csv.includes('"TIMEOUT"'), "Attempt 2 without template metadata must render cleanly");

        // 4. Formula injection safety
        assert(csv.includes("'\=CMD|"), "Formula injection must be safely escaped");

        // 5. Invalid row rendered
        assert(csv.includes('"INVALID_INPUT"'), "Invalid row must be included");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-8: Production Controller Functions in popup.js Directly Invoked (Auditor Correction 3)
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-8: Production Controller Functions in popup.js Directly Invoked & startCampaign Payload Wired", async () => {
        // Clean test environment
        mockStorage._data = {};
        mockStorage._data.xpider_currentAttempt = null;

        // 1. handleCreateNewTemplate(): creates template in store, returns it
        const tplA = await popup.handleCreateNewTemplate("Campaign Alpha");
        assert(tplA.id, "handleCreateNewTemplate must return created template with ID");
        assert.strictEqual(tplA.name, "Campaign Alpha", "Template name must match");

        // 2. handleSaveTemplate(): writes form fields into active template
        document.getElementById('tpl-first-name').value = "John";
        document.getElementById('tpl-last-name').value = "Doe";
        document.getElementById('tpl-name').value = "John Doe";
        document.getElementById('tpl-email').value = "john@example.com";
        document.getElementById('tpl-phone').value = "555-0199";
        document.getElementById('tpl-subject').value = "Special Proposal";
        document.getElementById('tpl-message').value = "Hello, please review our terms.";

        const savedTpl = await popup.handleSaveTemplate({
            id: tplA.id,
            firstName: "John",
            lastName: "Doe",
            name: "John Doe",
            email: "john@example.com",
            phone: "555-0199",
            subject: "Special Proposal",
            message: "Hello, please review our terms."
        });
        assert.strictEqual(savedTpl.id, tplA.id);
        assert.strictEqual(savedTpl.subject, "Special Proposal");

        // 3. handleDuplicateTemplate(): clones template with (Copy) suffix
        const clonedTpl = await popup.handleDuplicateTemplate(tplA.id);
        assert.notStrictEqual(clonedTpl.id, tplA.id, "Duplicate must produce a new unique ID");
        assert(clonedTpl.subject.includes("(Copy)"), "Duplicate must include (Copy) suffix");

        // 4. handleDeleteTemplate(): default template deletion MUST reject
        await assert.rejects(
            async () => { await popup.handleDeleteTemplate(tplA.id); },
            /Cannot delete the default template. Set another template as default first./,
            "handleDeleteTemplate must reject deletion of default template"
        );

        // 5. handleSetDefaultTemplate(): sets cloned template as default
        const updatedTpl = await popup.handleSetDefaultTemplate(clonedTpl.id);
        assert.strictEqual(updatedTpl.id, clonedTpl.id, "handleSetDefaultTemplate must return default template");
        assert.strictEqual(updatedTpl.isDefault, true, "isDefault must be true");
        const currentStore = await popup.getPopupTemplateStore().getStore();
        assert.strictEqual(currentStore.defaultId, clonedTpl.id, "defaultId must now be cloned template");
        assert.strictEqual(mockStorage._data.xpider_tpl.subject, clonedTpl.subject, "xpider_tpl must synchronize");

        // 6. handleDeleteTemplate(): now tplA is non-default, so it deletes successfully
        const delRes = await popup.handleDeleteTemplate(tplA.id);
        assert.strictEqual(delRes.deleted, true, "handleDeleteTemplate must succeed for non-default template");

        // 7. populateFormFromTemplate(): populates inputs from template object
        const formPopulated = popup.populateFormFromTemplate({
            firstName: "Jane",
            lastName: "Smith",
            name: "Jane Smith",
            email: "jane@smith.org",
            phone: "111-222",
            subject: "Inquiry",
            message: "Content"
        });
        assert.strictEqual(formPopulated.firstName, "Jane");
        assert.strictEqual(document.getElementById('tpl-first-name').value, "Jane");

        // 8. updateTemplateDropdown(): refreshes select options
        await popup.updateTemplateDropdown(clonedTpl.id);
        const selectEl = document.getElementById('tpl-library-select');
        assert(selectEl.options.length >= 1, "updateTemplateDropdown must populate select options");

        // 9. loadTemplateFromLibrary(): reads select value and loads into form
        selectEl.selectedIndex = 0;
        selectEl.options[0].dataset = { tplId: clonedTpl.id, tplVersion: "1" };
        selectEl.value = clonedTpl.id;
        await popup.loadTemplateFromLibrary();
        assert.strictEqual(document.getElementById('tpl-subject').value, clonedTpl.subject);

        // Set up HistoryStore records for ledger controllers
        const hs = popup.getPopupHistoryStore();
        await hs.ingestImportRows([
            "https://test-a.com/contact",
            "https://test-b.com/contact",
            "https://test-c.com/contact"
        ]);
        const idA = hs.normalizeTargetIdentity("https://test-a.com/contact");
        const idB = hs.normalizeTargetIdentity("https://test-b.com/contact");
        const idC = hs.normalizeTargetIdentity("https://test-c.com/contact");

        const attA = (await hs.recordAttempt(idA, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attA, true, 'CONFIRMED_SUCCESS');

        const attB = (await hs.recordAttempt(idB, { status: 'PENDING_INTENT' })).attemptId;
        await hs.settleAttempt(attB, false, 'CAPTCHA_FAIL');

        // 10. filterHistoryRecords(): queries records with filter
        const filtered = await popup.filterHistoryRecords({ status: 'CONFIRMED_SUCCESS' });
        assert.strictEqual(filtered.totalCount, 1, "filterHistoryRecords must find 1 success");

        // 11. renderLedgerUI(): renders dashboard summary and items
        await popup.renderLedgerUI();
        const statSuccessEl = document.getElementById('stat-ledger-success');
        assert.strictEqual(statSuccessEl.textContent, 1, "renderLedgerUI must update success count to 1");

        // 12. dispatchSelectiveReset(): releases target A
        const resetRes = await popup.dispatchSelectiveReset([idA]);
        assert.strictEqual(resetRes.affectedCount, 1, "dispatchSelectiveReset must reset 1 target");
        assert.strictEqual(hs.isSuppressed(idA), false, "target A must no longer be suppressed");

        // 13. dispatchRetryFailed(): queues failed target B into campaign queue
        const retryRes = await popup.dispatchRetryFailed();
        assert.strictEqual(retryRes.retryableCount, 1, "dispatchRetryFailed must find 1 failed target");
        assert(retryRes.identities.includes(idB), "Retryable identities must contain idB");

        // 14. dispatchGlobalReset(): advances generation and resets all targets
        const globalResetRes = await popup.dispatchGlobalReset();
        assert.strictEqual(globalResetRes.success, true, "dispatchGlobalReset must succeed");
        assert(globalResetRes.newGeneration > 1, "dispatchGlobalReset must increment generation");

        // 15. triggerCsvExport(): generates CSV string
        const exportedCsv = await popup.triggerCsvExport();
        assert(exportedCsv.includes("TargetIdentity"), "triggerCsvExport must return valid CSV with TargetIdentity");
        assert(exportedCsv.includes("TemplateId"), "triggerCsvExport must return valid CSV with TemplateId");

        // 16. bindCampaignTemplateMetadata(): binds templateId and templateVersion
        const stateToBind = {};
        popup.bindCampaignTemplateMetadata(stateToBind, clonedTpl);
        assert.strictEqual(stateToBind.templateId, clonedTpl.id, "bindCampaignTemplateMetadata must bind templateId");
        assert.strictEqual(stateToBind.templateVersion, clonedTpl.version || 1, "bindCampaignTemplateMetadata must bind templateVersion");

        // 17. startCampaign(): verifies payload wires templateId and templateVersion
        lastIpcInvoke = null;
        document.getElementById('manual-url-input').value = "https://example-test.com/contact";
        document.getElementById('tpl-subject').value = "Outreach 2026";
        document.getElementById('tpl-message').value = "Automated test message body";

        const startRes = await popup.startCampaign();
        assert(lastIpcInvoke, "startCampaign must invoke native engine IPC");
        assert.strictEqual(lastIpcInvoke.channel, 'xpider-campaign-start', "IPC channel must be xpider-campaign-start");
        assert(lastIpcInvoke.args.templateId, "Payload must contain templateId");
        assert(lastIpcInvoke.args.templateVersion, "Payload must contain templateVersion");
        assert.strictEqual(lastIpcInvoke.args.template.subject, "Outreach 2026", "Payload template subject must match");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DIAG-IPC-1: No Responder IPC Timeout & Structured Diagnostic Dump
    // ─────────────────────────────────────────────────────────────────────────
    await test("DIAG-IPC-1: No Responder Path — Rejection, Checkpoints, and Structured Diagnostic Dump", async () => {
        simulateIpcBehavior = 'NO_RESPONDER';
        popup.clearDiagnosticLog();

        const diagPayload = {
            queue: [{ url: "https://audit-target.com/contact" }],
            templateId: "tpl_diag_test",
            templateVersion: 3,
            template: { subject: "Test Diag", message: "Sensitive message content" }
        };

        // Execute xpiderInvoke with short timeout (150ms) and checkpoints
        await assert.rejects(
            async () => {
                await popup.xpiderInvoke('xpider-campaign-start', diagPayload, {
                    timeoutMs: 150,
                    checkpoints: [40, 80, 120]
                });
            },
            /IPC timeout: xpider-campaign-start/,
            "xpiderInvoke must reject with IPC timeout when no responder answers"
        );

        const buffer = popup.getDiagnosticBuffer();
        assert(buffer.length > 0, "Diagnostic buffer must record traces");

        // Verify A: IPC Request ID and postMessage dispatched
        const hasReqLog = buffer.some(l => l.includes('[IPC][REQ ') && l.includes('channel=xpider-campaign-start'));
        const hasDispatched = buffer.some(l => l.includes('postMessage dispatched'));
        assert(hasReqLog, "Diagnostic trace must include request ID and channel metadata");
        assert(hasDispatched, "Diagnostic trace must record postMessage dispatched");

        // Verify B: Bridge absence logged before request
        const hasBridgeLog = buffer.some(l => l.includes('[IPC][BRIDGE] No native XPIDER response bridge detected'));
        assert(hasBridgeLog, "Diagnostic trace must record bridge availability snapshot");

        // Verify C & D: Pending checkpoints recorded with matching=0
        const hasCheckpoint = buffer.some(l => l.includes('[IPC][WAIT ') && l.includes('matching=0'));
        assert(hasCheckpoint, "Diagnostic checkpoints must record zero matching responses");

        // Verify E: Structured timeout diagnostic block
        const hasTimeoutDump = buffer.some(l => l.includes('===== XPIDER IPC TIMEOUT DIAGNOSTIC ====='));
        const hasMatchingZero = buffer.some(l => l.includes('matchingResponses:      0'));
        assert(hasTimeoutDump, "Diagnostic buffer must contain structured timeout block");
        assert(hasMatchingZero, "Timeout block must confirm 0 matching responses");

        // Verify Diagnostic Report generation
        const report = popup.getDiagnosticReport();
        assert(report.includes("XPIDER EXTENSION RUNTIME IPC DIAGNOSTIC REPORT"), "Report must include standard header");
        assert(report.includes("Session ID:"), "Report must include session ID");
        assert(report.includes("Privacy Status:"), "Report must state privacy redaction status");

        console.log('    [QA NOTE] SIMULATED XPIDER_RESPONSE bridge test = PASS (Verified no-responder timeout & diagnostic dump)');
        console.log('    [QA NOTE] real Chrome native bridge = NOT_VERIFIED (Simulated test runner only; pending Owner live Chrome trace)');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DIAG-IPC-2: Responder Present Resolution & Latency Capture
    // ─────────────────────────────────────────────────────────────────────────
    await test("DIAG-IPC-2: Responder Present Path — ID Match, Latency Capture, and Clean Resolution", async () => {
        simulateIpcBehavior = 'DELAYED_RESPOND';
        popup.clearDiagnosticLog();

        const diagPayload = {
            queue: [{ url: "https://audit-target-2.com/contact" }],
            templateId: "tpl_diag_resp",
            templateVersion: 1
        };

        const res = await popup.xpiderInvoke('xpider-campaign-start', diagPayload, { timeoutMs: 500 });
        assert.strictEqual(res.success, true, "xpiderInvoke must resolve when matching XPIDER_RESPONSE arrives");

        const buffer = popup.getDiagnosticBuffer();
        const hasIdMatch = buffer.some(l => l.includes('idMatch=true'));
        const hasSuccess = buffer.some(l => l.includes('[IPC][SUCCESS') && l.includes('Matching XPIDER_RESPONSE accepted'));
        assert(hasIdMatch, "Diagnostic trace must capture matching response ID");
        assert(hasSuccess, "Diagnostic trace must capture success transition with latency");

        console.log('    [QA NOTE] SIMULATED XPIDER_RESPONSE bridge test = PASS (Responder present resolution verified)');
        console.log('    [QA NOTE] real Chrome native bridge = NOT_VERIFIED (Simulated mock only; does not prove unpacked Chrome bridge presence)');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC-2B-11: Privacy-Safe Redaction Engine & User Diagnostic Controls
    // ─────────────────────────────────────────────────────────────────────────
    await test("TC-2B-11: Privacy-Safe Redaction Engine & Diagnostic Buffer Management", async () => {
        // 1. Redaction of emails
        const emailRedacted = popup.redactSensitiveText("Contact lead at user.name+tag@example-domain.co.kr for inquiries");
        assert(!emailRedacted.includes("user.name+tag@example-domain.co.kr"), "Email address must be redacted");
        assert(emailRedacted.includes("[REDACTED_EMAIL]"), "Placeholder must be inserted");

        // 2. Redaction of phone numbers
        const phoneRedacted = popup.redactSensitiveText("Call customer service at 010-9876-5432 or +1-800-555-0199 now");
        assert(!phoneRedacted.includes("010-9876-5432"), "Korean phone number must be redacted");
        assert(!phoneRedacted.includes("800-555-0199"), "US phone number must be redacted");
        assert(phoneRedacted.includes("[REDACTED_PHONE]"), "Phone placeholder must be inserted");

        // 3. Redaction of API keys and auth tokens
        const tokenRedacted = popup.redactSensitiveText("Authorization: Bearer abcd1234efgh5678ijkl9012 and api_key: secret_token_xyz9999");
        assert(!tokenRedacted.includes("abcd1234efgh5678ijkl9012"), "Bearer token must be redacted");
        assert(!tokenRedacted.includes("secret_token_xyz9999"), "API key must be redacted");
        assert(tokenRedacted.includes("[REDACTED_SECRET]"), "Secret placeholder must be inserted");

        // 4. Redaction of URLs with sensitive path/queries
        const urlRedacted = popup.redactSensitiveText("Form target https://confidential-crm.com/leads/create?session=secret1234");
        assert(!urlRedacted.includes("session=secret1234"), "Query string must be redacted");
        assert(urlRedacted.includes("https://confidential-crm.com/[PATH]"), "Only protocol and hostname must be preserved");

        // 5. Buffer clearing
        popup.clearDiagnosticLog();
        const freshBuffer = popup.getDiagnosticBuffer();
        assert.strictEqual(freshBuffer.length, 1, "Cleared buffer must contain only clear acknowledgment");
        assert(freshBuffer[0].includes("Diagnostic buffer cleared"), "Acknowledgment text must match");

        // 6. Payload byte calculation
        const bytes = popup.calculatePayloadBytes({ sample: "hello world" });
        assert(bytes > 0, "Byte size calculation must be greater than zero");
    });

    console.log(`\n=== PHASE 2B ACCEPTANCE SUITE RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED ===\n`);
    if (totalFailed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

runPhase2BSuite().catch(err => {
    console.error("Fatal error running Phase 2B test suite:", err);
    process.exit(1);
});
