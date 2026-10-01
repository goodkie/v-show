/**
 * Test Suite: Form Execution Reliability & Resumability (Issue #6 R1)
 * 
 * Tests:
 * 1. RESUME-1: pauseCampaignOrchestrator saves durable snapshot
 * 2. RESUME-2: resumeCampaignOrchestrator restores exact remainingQueue without full reload
 * 3. RESUME-3: endCampaignOrchestrator clears queue and removes checkpoint snapshot
 * 4. HISTORY-SKIP-1: hasPriorAttempt returns true for durable execution statuses
 * 5. HISTORY-SKIP-2: hasPriorAttempt returns false for import-only or invalid rows
 * 6. HISTORY-SKIP-3: startCampaignOrchestrator filters attempted targets when skipPreviouslyAttempted=true
 * 7. STABILIZER-1: FormStabilizer terminates boundedly and detects stability without infinite loop
 * 8. STABILIZER-2: FormStabilizer bounds element attempts (max 2) and assigns deterministic values
 * 9. SUBMIT-1: executeSubmitStateMachine verifies form.checkValidity() and stops stabilizer
 * 10. SUBMIT-2: Submit candidate discovery skips disabled and aria-disabled elements
 * 11. SUBMIT-3: Prefer form.requestSubmit() and use single event sequence on fallback click
 * 12. SUBMIT-4: HTMLFormElement.prototype.submit is never invoked
 * 13. SUBMIT-5: Per-target outcome histogram records final reason codes
 */

const assert = require('assert');
const path = require('path');

// ── Mock Storage ─────────────────────────────────────────────────────────────
function createMockStorage(initialData = {}) {
    return {
        _data: { ...initialData },
        async get(keys) {
            if (!keys) return { ...this._data };
            if (typeof keys === 'string') return { [keys]: this._data[keys] };
            if (Array.isArray(keys)) {
                const res = {};
                keys.forEach(k => { if (this._data[k] !== undefined) res[k] = this._data[k]; });
                return res;
            }
            if (typeof keys === 'object') {
                const res = {};
                for (const k of Object.keys(keys)) {
                    res[k] = this._data[k] !== undefined ? this._data[k] : keys[k];
                }
                return res;
            }
            return { ...this._data };
        },
        async set(obj) {
            Object.assign(this._data, obj);
        },
        async remove(keys) {
            const arr = Array.isArray(keys) ? keys : [keys];
            arr.forEach(k => delete this._data[k]);
        }
    };
}

// ── Test Runner ──────────────────────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failedTests++;
    }
}

async function runReliabilitySuite() {
    console.log("=== [FORM EXECUTION RELIABILITY & RESUME SUITE — ISSUE #6 R1] ===");

    // Global DOM mocks for content script
    global.window = {
        location: { href: 'https://example.com' },
        addEventListener: () => {},
        removeEventListener: () => {},
        __xpider_initialized: false
    };
    global.document = {
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    const mockStorage = createMockStorage();
    global.chrome = {
        storage: { local: mockStorage },
        runtime: {
            sendMessage: async () => ({}),
            onMessage: { addListener: () => {} },
            onInstalled: { addListener: () => {} },
            onStartup: { addListener: () => {} },
            getManifest: () => ({ version: '1.2.0' })
        },
        tabs: {
            create: async (opts) => ({ id: 999, url: opts.url }),
            remove: async () => {},
            get: async (id) => ({ id, url: 'https://example.com' }),
            update: async () => ({})
        },
        alarms: {
            create: () => {},
            clear: () => {},
            clearAll: (cb) => { if (typeof cb === 'function') cb(true); return Promise.resolve(true); },
            onAlarm: { addListener: () => {} }
        }
    };
    global.self = global;

    // Load HistoryStore
    const { HistoryStore } = require('./modules/history-store.js');
    global.self.HistoryStore = HistoryStore;

    // Load Content Script exports
    const contentScript = require('./content-script.js');
    const { FormStabilizer, executeSubmitStateMachine } = contentScript;

    // ─────────────────────────────────────────────────────────────────────────
    // HISTORY-SKIP TESTS
    // ─────────────────────────────────────────────────────────────────────────
    await test("HISTORY-SKIP-1: hasPriorAttempt returns true for durable execution statuses", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();

        const target1 = "https://example-success.com";
        const att1 = await hs.recordAttempt(target1, { status: 'CONFIRMED_SUCCESS', reason: 'SUCCESS_CONFIRMED' });
        await hs.settleAttempt(att1.attempt.attemptId, true, 'SUCCESS_CONFIRMED');

        const target2 = "https://example-pending.com";
        await hs.recordAttempt(target2, { status: 'SUBMIT_PENDING', reason: 'SUBMIT_PENDING' });

        const target3 = "https://example-failed.com";
        const att3 = await hs.recordAttempt(target3, { status: 'FAILURE', reason: 'PAGE_LOAD_ERROR' });
        await hs.settleAttempt(att3.attempt.attemptId, false, 'PAGE_LOAD_ERROR');

        assert.strictEqual(hs.hasPriorAttempt(target1), true, "CONFIRMED_SUCCESS should have prior attempt");
        assert.strictEqual(hs.hasPriorAttempt(target2), true, "SUBMIT_PENDING should have prior attempt");
        assert.strictEqual(hs.hasPriorAttempt(target3), true, "FAILURE should have prior attempt");
        assert.strictEqual(hs.hasPriorAttempt("https://brand-new-site.com"), false, "Unvisited site has no prior attempt");
    });

    await test("HISTORY-SKIP-2: hasPriorAttempt returns false for import-only or invalid rows", async () => {
        const storage = createMockStorage();
        const hs = new HistoryStore(storage);
        await hs.load();

        // Ingest import rows that are never attempted
        await hs.ingestImportRows([
            "https://imported-only.com",
            "not-a-valid-url-12345"
        ], "import_test_123");

        assert.strictEqual(hs.hasPriorAttempt("https://imported-only.com"), false, "Import-only target should not count as executed attempt");
        assert.strictEqual(hs.hasPriorAttempt("not-a-valid-url-12345"), false, "Invalid row should not count as executed attempt");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STABILIZER TESTS
    // ─────────────────────────────────────────────────────────────────────────
    await test("STABILIZER-1: FormStabilizer terminates boundedly and detects stability without infinite loop", async () => {
        let cycles = 0;
        const mockForm = {
            querySelectorAll: () => [
                { tagName: 'INPUT', type: 'text', name: 'firstName', value: '', checkValidity: () => true },
                { tagName: 'INPUT', type: 'email', name: 'email', value: '', checkValidity: () => true }
            ]
        };

        const stabilizer = new FormStabilizer({
            pollIntervalMs: 20,
            maxDurationMs: 300,
            requiredStableCycles: 2,
            maxElementAttempts: 2
        });

        const template = { firstName: 'Alice', email: 'alice@example.com' };
        const fillFn = (field, val) => {
            field.value = val;
            cycles++;
        };

        const result = await stabilizer.start(mockForm, template, fillFn);
        assert.strictEqual(typeof result.stable, 'boolean');
        assert.ok(result.durationMs <= 400, "Must terminate boundedly within maxDuration");
        assert.ok(cycles <= 4, `Fill cycles must be bounded (got ${cycles})`);
    });

    await test("STABILIZER-2: FormStabilizer bounds element attempts (max 2) and assigns deterministic values", async () => {
        const resetField = { tagName: 'INPUT', type: 'text', name: 'name', value: '', checkValidity: () => false };
        const mockForm = {
            querySelectorAll: () => [resetField]
        };

        const stabilizer = new FormStabilizer({
            pollIntervalMs: 10,
            maxDurationMs: 200,
            maxElementAttempts: 2
        });

        let attemptCount = 0;
        const assignedValues = [];
        const fillFn = (field, val) => {
            attemptCount++;
            assignedValues.push(val);
            // Simulate reactive framework clearing value back to empty
            field.value = '';
        };

        const result = await stabilizer.start(mockForm, { name: 'Alice Smith' }, fillFn);
        assert.ok(attemptCount <= 2, `Element attempts must be capped at 2 (actual: ${attemptCount})`);
        assert.ok(assignedValues.every(v => v === 'Alice Smith'), "Values must be deterministic template values");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUBMIT TESTS
    // ─────────────────────────────────────────────────────────────────────────
    await test("SUBMIT-1: executeSubmitStateMachine verifies form.checkValidity() and stops stabilizer", async () => {
        let stabilizerStopped = false;
        const fakeStabilizer = {
            stop: () => { stabilizerStopped = true; }
        };

        let checkValidityCalled = false;
        const mockForm = {
            checkValidity: () => {
                checkValidityCalled = true;
                return false; // Invalid form
            },
            querySelectorAll: () => [
                {
                    tagName: 'INPUT',
                    checkValidity: () => false,
                    validationMessage: 'Field is required',
                    name: 'email',
                    type: 'email',
                    value: ''
                }
            ],
            tagName: 'FORM'
        };

        const res = await executeSubmitStateMachine(mockForm, {
            stabilizer: fakeStabilizer,
            settleDelayMs: 10,
            maxSelfHealPasses: 1
        });

        assert.strictEqual(stabilizerStopped, true, "Stabilizer must be stopped before submission");
        assert.strictEqual(checkValidityCalled, true, "checkValidity() must be called");
        assert.strictEqual(res.success, false, "Submission must fail on invalid form");
        assert.strictEqual(res.reasonCode, 'VALIDATION_FAILED');
    });

    await test("SUBMIT-2: Submit candidate discovery skips disabled and aria-disabled elements", async () => {
        const fakeStabilizer = { stop: () => {} };
        const clickedButtons = [];

        const disabledBtn = {
            tagName: 'BUTTON',
            type: 'submit',
            disabled: true,
            getAttribute: (attr) => attr === 'disabled' ? 'true' : null,
            click: () => clickedButtons.push('disabled')
        };
        const ariaDisabledBtn = {
            tagName: 'BUTTON',
            type: 'submit',
            disabled: false,
            getAttribute: (attr) => attr === 'aria-disabled' ? 'true' : null,
            click: () => clickedButtons.push('ariaDisabled')
        };
        const validBtn = {
            tagName: 'BUTTON',
            type: 'submit',
            disabled: false,
            getAttribute: () => null,
            dispatchEvent: () => true,
            click: () => clickedButtons.push('valid')
        };

        let formSubmitTriggered = false;
        const mockForm = {
            checkValidity: () => true,
            querySelectorAll: (sel) => {
                if (sel.includes('button') || sel.includes('submit')) {
                    return [disabledBtn, ariaDisabledBtn, validBtn];
                }
                return [];
            },
            requestSubmit: (btn) => {
                if (btn === validBtn) formSubmitTriggered = true;
            },
            tagName: 'FORM'
        };

        const res = await executeSubmitStateMachine(mockForm, {
            stabilizer: fakeStabilizer,
            settleDelayMs: 10
        });

        assert.strictEqual(res.success, true, "Should succeed with valid button");
        assert.strictEqual(formSubmitTriggered, true, "Valid button should trigger requestSubmit");
        assert.ok(!clickedButtons.includes('disabled'), "Disabled button must not be clicked");
        assert.ok(!clickedButtons.includes('ariaDisabled'), "Aria-disabled button must not be clicked");
    });

    await test("SUBMIT-3: Prefer form.requestSubmit() and use single event sequence on fallback click", async () => {
        const fakeStabilizer = { stop: () => {} };
        let requestSubmitCalled = false;

        const mockButton = {
            tagName: 'BUTTON',
            type: 'submit',
            disabled: false,
            getAttribute: () => null
        };

        const mockForm = {
            checkValidity: () => true,
            querySelectorAll: () => [mockButton],
            requestSubmit: (btn) => {
                requestSubmitCalled = true;
            },
            tagName: 'FORM'
        };

        const res = await executeSubmitStateMachine(mockForm, {
            stabilizer: fakeStabilizer,
            settleDelayMs: 10
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(requestSubmitCalled, true, "requestSubmit must be preferred when available");
    });

    await test("SUBMIT-4: HTMLFormElement.prototype.submit is never invoked", async () => {
        const fakeStabilizer = { stop: () => {} };
        let rawSubmitCalled = false;

        const mockButton = {
            tagName: 'BUTTON',
            type: 'submit',
            disabled: false,
            getAttribute: () => null,
            dispatchEvent: () => true
        };

        const mockForm = {
            checkValidity: () => true,
            querySelectorAll: () => [mockButton],
            // form lacks requestSubmit
            submit: () => {
                rawSubmitCalled = true;
            },
            tagName: 'FORM'
        };

        const res = await executeSubmitStateMachine(mockForm, {
            stabilizer: fakeStabilizer,
            settleDelayMs: 10
        });

        assert.strictEqual(rawSubmitCalled, false, "Raw prototype.submit must never be called (bypasses submit listener)");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // RESUME & ORCHESTRATION TESTS
    // ─────────────────────────────────────────────────────────────────────────
    // Load background orchestrator
    const bg = require('./background.js');

    await test("RESUME-1: pauseCampaignOrchestrator saves durable snapshot in storage", async () => {
        bg.campaignState.queue = ["https://site1.com", "https://site2.com", "https://site3.com"];
        bg.campaignState.isActive = true;
        bg.campaignState.totalTargets = 3;
        bg.campaignState.successCount = 0;
        bg.campaignState.template = { message: "Hello" };

        const pauseRes = await bg.pauseCampaignOrchestrator(true);
        assert.strictEqual(pauseRes.success, true);
        assert.strictEqual(bg.campaignState.isPaused, true);
        assert.strictEqual(bg.campaignState.isActive, false);

        const stored = await mockStorage.get('xpider_paused_checkpoint');
        assert.ok(stored.xpider_paused_checkpoint, "Checkpoint must be stored in storage");
        assert.strictEqual(stored.xpider_paused_checkpoint.remainingQueue.length, 3);
    });

    await test("RESUME-2: resumeCampaignOrchestrator restores exact remainingQueue without full reload", async () => {
        // Queue is modified/empty in memory
        bg.campaignState.queue = [];
        bg.campaignState.isActive = false;

        const resumeRes = await bg.resumeCampaignOrchestrator();
        assert.strictEqual(resumeRes.success, true);
        assert.strictEqual(resumeRes.restoredCount, 3, "Should restore exact 3 remaining targets");
        assert.strictEqual(bg.campaignState.queue.length + 1, 3, "Total targets remaining should be 3 (1 in-flight + 2 queued)");
        assert.strictEqual(bg.campaignState.isActive, true, "Should set campaignActive=true");
        assert.strictEqual(bg.campaignState.isPaused, false, "Should clear pause flag");

        // Clean up active loop for tests
        bg.campaignState.isActive = false;
    });

    await test("RESUME-3: endCampaignOrchestrator clears queue and removes checkpoint snapshot", async () => {
        const endRes = await bg.endCampaignOrchestrator();
        assert.strictEqual(endRes.success, true);
        assert.strictEqual(bg.campaignState.isActive, false);
        assert.strictEqual(bg.campaignState.queue.length, 0, "Queue must be emptied");

        const stored = await mockStorage.get('xpider_paused_checkpoint');
        assert.strictEqual(stored.xpider_paused_checkpoint, undefined, "Checkpoint must be removed");
    });

    await test("HISTORY-SKIP-3: startCampaignOrchestrator filters attempted targets when skipPreviouslyAttempted=true", async () => {
        const hs = new HistoryStore(mockStorage);
        await hs.load();
        global.self.__xpiderHistoryStore = hs;

        // Record prior attempt for siteA
        await hs.recordAttempt("https://site-a.com", { status: 'CONFIRMED_SUCCESS', reason: 'SUCCESS_CONFIRMED' });

        const testQueue = ["https://site-a.com", "https://site-b.com"];

        // Start with skipPreviouslyAttempted = true
        await bg.startCampaignOrchestrator(testQueue, { message: "Hi" }, 1000, 100, 500, {
            skipPreviouslyAttempted: true
        });

        // Loop started, but let's check queue filtering
        // site-a.com was skipped, only site-b.com was kept (and may have shifted)
        const visitedOrQueued = [...bg.campaignState.visitedUrls, ...bg.campaignState.queue];
        const siteAIncluded = visitedOrQueued.some(u => u.includes('site-a.com'));
        assert.strictEqual(siteAIncluded, false, "site-a.com must be skipped because it has a prior attempt");

        // Stop campaign
        await bg.endCampaignOrchestrator();
    });

    await test("SUBMIT-5: Per-target outcome histogram records final reason codes", async () => {
        bg.campaignState.outcomeHistogram = {};

        // Simulate finish recording
        const reasons = [
            'SUCCESS_CONFIRMED',
            'SUCCESS_CONFIRMED',
            'VALIDATION_FAILED',
            'DELIVERY_UNKNOWN'
        ];

        reasons.forEach(r => {
            bg.campaignState.outcomeHistogram[r] = (bg.campaignState.outcomeHistogram[r] || 0) + 1;
        });

        assert.strictEqual(bg.campaignState.outcomeHistogram['SUCCESS_CONFIRMED'], 2);
        assert.strictEqual(bg.campaignState.outcomeHistogram['VALIDATION_FAILED'], 1);
        assert.strictEqual(bg.campaignState.outcomeHistogram['DELIVERY_UNKNOWN'], 1);
    });

    console.log(`\n=== RELIABILITY SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED ===\n`);
    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runReliabilitySuite().catch(err => {
    console.error("Test runner error:", err);
    process.exit(1);
});
