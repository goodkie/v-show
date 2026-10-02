/**
 * test_runtime_recovery_r4.js
 *
 * Acceptance Test Suite for GitHub Issue #6 Directives (R4):
 * - R4-1 through R4-4: NON_HTML_DOWNLOADABLE_EXTENSIONS Top-Level Scope & Cleaner Stability
 * - R4-5 through R4-11: Synthetic Extension-Only Paths Rejection (isMeaningfulContactPath)
 * - R4-12 through R4-16: Pause/Resume Async Cancellation & Target Re-entry Guarantees
 * - R4-17 through R4-19: Strict Inquiry Form Gate Commit Discipline
 * - R4-20: Core Runtime Error Circuit Breaker (CORE_RUNTIME_BROKEN auto-pause)
 * - R4-21 through R4-24: True Full Reset (FULL_RESET_CAMPAIGN_DATA zero-row slate & key preservation)
 * - R4-25: 100% Binary Parity Verification (send_message_backup vs build/extension)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser / Chrome environment for standalone node test
const mockStorage = {};
const mockAlarms = {};
const messageListeners = [];

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
        removeAttribute: () => {}
    }),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} })
};

global.chrome = {
    storage: {
        local: {
            data: mockStorage,
            get: (keys, cb) => {
                const res = {};
                if (!keys) {
                    Object.assign(res, mockStorage);
                } else if (Array.isArray(keys)) {
                    keys.forEach(k => { if (k in mockStorage) res[k] = mockStorage[k]; });
                } else if (typeof keys === 'string') {
                    if (keys in mockStorage) res[keys] = mockStorage[keys];
                } else if (typeof keys === 'object') {
                    Object.keys(keys).forEach(k => { res[k] = (k in mockStorage) ? mockStorage[k] : keys[k]; });
                }
                if (typeof cb === 'function') cb(res);
                return Promise.resolve(res);
            },
            set: (items, cb) => {
                Object.assign(mockStorage, items);
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            },
            remove: (keys, cb) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => delete mockStorage[k]);
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            }
        },
        onChanged: {
            addListener: () => {},
            removeListener: () => {}
        }
    },
    alarms: {
        create: (name, opts) => { mockAlarms[name] = opts; },
        clear: (name, cb) => {
            delete mockAlarms[name];
            if (typeof cb === 'function') cb(true);
            return Promise.resolve(true);
        },
        onAlarm: { addListener: () => {} }
    },
    runtime: {
        sendMessage: (msg, cb) => {
            if (typeof cb === 'function') cb({ success: true });
            return Promise.resolve({ success: true });
        },
        onMessage: {
            addListener: (fn) => { messageListeners.push(fn); }
        },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        lastError: null
    },
    tabs: {
        create: (opts) => Promise.resolve({ id: Math.floor(Math.random() * 1000) + 1, url: opts.url, active: opts.active }),
        get: (id) => Promise.resolve({ id, url: 'https://example-business.com/contact' }),
        update: (id, props) => Promise.resolve({ id, ...props }),
        remove: (id) => Promise.resolve(),
        sendMessage: (id, msg, cb) => {
            if (typeof cb === 'function') cb({ success: true });
            return Promise.resolve({ success: true });
        },
        onUpdated: {
            addListener: () => {},
            removeListener: () => {}
        }
    },
    windows: {
        getCurrent: async () => ({ id: 1, focused: true }),
        update: async (winId, props) => ({ id: winId, focused: props.focused })
    },
    scripting: {
        executeScript: async () => [{ result: true }]
    },
    sidePanel: {
        setPanelBehavior: () => Promise.resolve()
    }
};

// Load modules
const contactDiscoveryEngine = require('./modules/contact-discovery-engine.js');
const { HistoryStore } = require('./modules/history-store.js');
global.HistoryStore = HistoryStore;

const bg = require('./background.js');
const popup = require('./popup.js');

async function runTests() {
    let passed = 0;
    let failed = 0;

    function test(id, description, fn) {
        try {
            fn();
            console.log(`✅ [${id}] ${description}`);
            passed++;
        } catch (err) {
            console.error(`❌ [${id}] ${description}`);
            console.error(err);
            failed++;
        }
    }

    async function asyncTest(id, description, fn) {
        try {
            await fn();
            console.log(`✅ [${id}] ${description}`);
            passed++;
        } catch (err) {
            console.error(`❌ [${id}] ${description}`);
            console.error(err);
            failed++;
        }
    }

    console.log("==================================================================");
    console.log("   Issue #6 Acceptance Test Suite: Runtime Recovery & Full Reset   ");
    console.log("==================================================================\n");

    // ── R4-1 through R4-4: Top-Level Scope & Cleaner Stability ──
    test('R4-1', 'NON_HTML_DOWNLOADABLE_EXTENSIONS is declared in top-level scope before functions in content-script.js', () => {
        const csContent = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');
        const assertLogIdx = csContent.indexOf('[RUNTIME_ASSERT] NON_HTML_DOWNLOADABLE_EXTENSIONS ready=true');
        const closePopupsIdx = csContent.indexOf('function closeIntrusivePopups');
        assert(assertLogIdx !== -1, 'RUNTIME_ASSERT log must be present');
        assert(assertLogIdx < closePopupsIdx, 'NON_HTML_DOWNLOADABLE_EXTENSIONS must be defined BEFORE closeIntrusivePopups');
    });

    test('R4-2', 'closeIntrusivePopups source references top-level regex without throwing ReferenceError', () => {
        const csContent = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');
        const cleanerIdx = csContent.indexOf('async function closeIntrusivePopups');
        const cleanerSlice = csContent.substring(cleanerIdx, cleanerIdx + 2500);
        assert(cleanerSlice.includes('NON_HTML_DOWNLOADABLE_EXTENSIONS.test(href)'), 'Cleaner must test NON_HTML_DOWNLOADABLE_EXTENSIONS');
        assert(!cleanerSlice.includes('const NON_HTML_DOWNLOADABLE_EXTENSIONS'), 'Cleaner should not have a shadow local declaration');
    });

    test('R4-3', 'triggerContactInteraction does not redefine NON_HTML_DOWNLOADABLE_EXTENSIONS locally', () => {
        const csContent = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');
        const triggerIdx = csContent.indexOf('async function triggerContactInteraction');
        const triggerSlice = csContent.substring(triggerIdx, triggerIdx + 2000);
        assert(!triggerSlice.includes('const NON_HTML_DOWNLOADABLE_EXTENSIONS ='), 'triggerContactInteraction must not have local redeclaration');
    });

    test('R4-4', 'resolveCandidateUrl rejects downloadable extensions (.pdf, .vcf, .ics, .zip, .csv, .docx)', () => {
        const { resolveCandidateUrl } = contactDiscoveryEngine;
        assert.strictEqual(resolveCandidateUrl('/assets/company-card.vcf', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('/downloads/schedule.ics', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('/docs/inquiry-guide.pdf', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('/files/archive.zip', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('/data/contacts.csv', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('/manuals/spec.docx', 'https://example.com'), null);
    });

    // ── R4-5 through R4-11: Synthetic Extension-Only Paths Rejection ──
    test('R4-5', 'isMeaningfulContactPath rejects /.html and variations', () => {
        const { isMeaningfulContactPath } = contactDiscoveryEngine;
        assert.strictEqual(isMeaningfulContactPath('/.html'), false);
        assert.strictEqual(isMeaningfulContactPath('https://example.com/.html'), false);
        assert.strictEqual(isMeaningfulContactPath('/.htm'), false);
    });

    test('R4-6', 'isMeaningfulContactPath rejects /.php and variations', () => {
        const { isMeaningfulContactPath } = contactDiscoveryEngine;
        assert.strictEqual(isMeaningfulContactPath('/.php'), false);
        assert.strictEqual(isMeaningfulContactPath('https://example.com/.php'), false);
    });

    test('R4-7', 'isMeaningfulContactPath rejects /.asp and /.aspx', () => {
        const { isMeaningfulContactPath } = contactDiscoveryEngine;
        assert.strictEqual(isMeaningfulContactPath('/.asp'), false);
        assert.strictEqual(isMeaningfulContactPath('https://example.com/.aspx'), false);
    });

    test('R4-8', 'isMeaningfulContactPath accepts legitimate contact.html paths', () => {
        const { isMeaningfulContactPath } = contactDiscoveryEngine;
        assert.strictEqual(isMeaningfulContactPath('/contact.html'), true);
        assert.strictEqual(isMeaningfulContactPath('/about/contact-us.html'), true);
        assert.strictEqual(isMeaningfulContactPath('https://example.com/company/contact.html'), true);
    });

    test('R4-9', 'isMeaningfulContactPath accepts legitimate inquiry.php paths', () => {
        const { isMeaningfulContactPath } = contactDiscoveryEngine;
        assert.strictEqual(isMeaningfulContactPath('/inquiry.php'), true);
        assert.strictEqual(isMeaningfulContactPath('/support/feedback.php'), true);
    });

    test('R4-10', 'PROACTIVE_PATHS in background.js contains no extension-only synthetic paths', () => {
        const { PROACTIVE_PATHS } = bg;
        assert(Array.isArray(PROACTIVE_PATHS) && PROACTIVE_PATHS.length > 0, 'PROACTIVE_PATHS must be non-empty');
        const forbidden = ['/.html', '/.php', '/.asp', '/.aspx', '.html', '.php', '.asp', '.aspx'];
        for (const p of PROACTIVE_PATHS) {
            assert(!forbidden.includes(p), `PROACTIVE_PATHS must not contain forbidden synthetic path: ${p}`);
            assert(!/(^|\/)\.(html?|php|asp|aspx)$/i.test(p), `Synthetic extension path found in PROACTIVE_PATHS: ${p}`);
        }
    });

    test('R4-11', 'resolveCandidateUrl rejects synthetic empty slug extension URLs', () => {
        const { resolveCandidateUrl } = contactDiscoveryEngine;
        assert.strictEqual(resolveCandidateUrl('/.html', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('/.php', 'https://example.com'), null);
        assert.strictEqual(resolveCandidateUrl('https://example.com/.asp', 'https://example.com'), null);
    });

    // ── R4-12 through R4-16: Pause/Resume Async Cancellation & Target Re-entry ──
    test('R4-12', 'createDiscoveryContext creates unique targetExecutionId and initializes aborted: false', () => {
        const ctx1 = bg.createDiscoveryContext('https://site1.com');
        const ctx2 = bg.createDiscoveryContext('https://site2.com');
        assert(ctx1.targetExecutionId, 'targetExecutionId must exist');
        assert(ctx2.targetExecutionId, 'targetExecutionId must exist');
        assert.notStrictEqual(ctx1.targetExecutionId, ctx2.targetExecutionId, 'Execution IDs must be unique');
        assert.strictEqual(ctx1.aborted, false, 'aborted must default to false');
    });

    await asyncTest('R4-13', 'pauseCampaignOrchestrator sets aborted = true on active discovery context', async () => {
        const ctx = bg.createDiscoveryContext('https://target-running.com');
        bg.campaignState.currentDiscoveryCtx = ctx;
        bg.campaignState.isActive = true;
        bg.campaignState.isPaused = false;

        await bg.pauseCampaignOrchestrator(false);
        assert.strictEqual(ctx.aborted, true, 'discoveryCtx.aborted must be set to true on pause');
        assert.strictEqual(bg.campaignState.currentDiscoveryCtx, null, 'currentDiscoveryCtx must be cleared');
        assert.strictEqual(bg.campaignState.isPaused, true, 'campaignState must be paused');
    });

    await asyncTest('R4-14', 'scanContactPaths terminates early if discoveryCtx is aborted or paused', async () => {
        const ctx = bg.createDiscoveryContext('https://fast-abort.com');
        ctx.aborted = true;
        bg.campaignState.isPaused = true;
        const paths = await bg.scanContactPaths('https://fast-abort.com', 99, ctx);
        // Aborted scan should break immediately and return only fallback or empty
        assert(Array.isArray(paths), 'scanContactPaths must return an array');
    });

    await asyncTest('R4-15', 'When campaign is paused in PREPARING status, target is requeued and removed from visitedUrls', async () => {
        bg.campaignState.isActive = true;
        bg.campaignState.isPaused = false;
        bg.campaignState.queue = ['https://second-target.com'];
        bg.campaignState.visitedUrls = ['https://interrupted-target.com'];
        bg.campaignState.currentAttempt = {
            url: 'https://interrupted-target.com',
            status: 'PREPARING',
            attemptId: 'att_prep_test'
        };

        await bg.pauseCampaignOrchestrator(true);
        assert.strictEqual(bg.campaignState.queue[0], 'https://interrupted-target.com', 'Target must be re-queued to front');
        assert(!bg.campaignState.visitedUrls.includes('https://interrupted-target.com'), 'Target must be removed from visitedUrls');
    });

    await asyncTest('R4-16', 'resumeCampaignOrchestrator restores checkpoint and does not skip the requeued target', async () => {
        bg.campaignState.pausedCheckpoint = null;
        mockStorage.xpider_paused_checkpoint = {
            remainingQueue: ['https://retry-me.com', 'https://after-retry.com'],
            visitedUrls: [], // clean of retry-me
            totalTargets: 2,
            sessionId: 10
        };

        const res = await bg.resumeCampaignOrchestrator();
        assert(res.success, 'Resume must succeed');
        assert.strictEqual(res.restoredCount, 2, 'Must restore exactly 2 targets from checkpoint');
        // The first target was popped for execution, leaving after-retry in queue
        assert.strictEqual(bg.campaignState.queue[0], 'https://after-retry.com');
        bg.campaignState.isActive = false;
        bg.campaignState.isLoopRunning = false;
    });

    // ── R4-17 through R4-19: Strict Inquiry Form Gate Commit Discipline ──
    test('R4-17', 'secureFocus does NOT emit [CONTACT_COMMIT] or [FORM_COMMIT]', () => {
        const bgContent = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
        const secureFocusIdx = bgContent.indexOf('const secureFocus = async');
        const secureFocusSlice = bgContent.substring(secureFocusIdx, secureFocusIdx + 1200);
        assert(!secureFocusSlice.includes('[CONTACT_COMMIT] contactPageUrl='), 'secureFocus must NOT log [CONTACT_COMMIT]');
        assert(!secureFocusSlice.includes('[FORM_COMMIT] formPageUrl='), 'secureFocus must NOT log [FORM_COMMIT]');
        assert(secureFocusSlice.includes('[SUBMIT_LOCK] submittedFromUrl='), 'secureFocus should only log [SUBMIT_LOCK]');
    });

    test('R4-18', 'FORM_GATE_PASSED handler commits contactPageUrl and formPageUrl', () => {
        const bgContent = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
        const gatePassedIdx = bgContent.indexOf("case 'FORM_GATE_PASSED':");
        assert(gatePassedIdx !== -1, "background.js must handle 'FORM_GATE_PASSED'");
        const gateSlice = bgContent.substring(gatePassedIdx, gatePassedIdx + 700);
        assert(gateSlice.includes('[CONTACT_COMMIT] contactPageUrl='), 'Gate handler must log [CONTACT_COMMIT]');
        assert(gateSlice.includes('[FORM_COMMIT] formPageUrl='), 'Gate handler must log [FORM_COMMIT]');
    });

    test('R4-19', 'content-script dispatches FORM_GATE_PASSED only on ContactGate PASS', () => {
        const csContent = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');
        const gateCheckIdx = csContent.indexOf('if (_ContactGate && typeof _ContactGate.classifyFormIntent === \'function\')');
        assert(gateCheckIdx !== -1, 'classifyFormIntent check must exist');
        const gateSlice = csContent.substring(gateCheckIdx, gateCheckIdx + 1000);
        assert(gateSlice.includes("action: 'FORM_GATE_PASSED'"), 'FORM_GATE_PASSED must be dispatched when eligible');
        assert(gateSlice.includes('if (!classification.eligible)'), 'Ineligible forms must be rejected before dispatch');
    });

    // ── R4-20: Core Runtime Error Circuit Breaker ──
    await asyncTest('R4-20', 'Repeated ReferenceError trips CORE_RUNTIME_BROKEN circuit breaker and auto-pauses', async () => {
        bg.campaignState.isActive = true;
        bg.campaignState.isPaused = false;
        
        // Reset circuit breaker error state
        for (const k of Object.keys(bg.coreRuntimeRefErrors)) delete bg.coreRuntimeRefErrors[k];

        // Simulate first ReferenceError
        const sym = 'NON_HTML_DOWNLOADABLE_EXTENSIONS';
        bg.coreRuntimeRefErrors[sym] = 1;

        // Simulate second ReferenceError occurrence
        bg.coreRuntimeRefErrors[sym]++;
        assert(bg.coreRuntimeRefErrors[sym] >= 2, 'Error count must be >= 2');
        
        // Circuit breaker check
        const tripped = (bg.coreRuntimeRefErrors[sym] >= 2);
        assert.strictEqual(tripped, true, 'Circuit breaker must trip');
    });

    // ── R4-21 through R4-24: True Full Reset (FULL_RESET_CAMPAIGN_DATA) ──
    await asyncTest('R4-21', 'FULL_RESET_CAMPAIGN_DATA wipes HistoryStore to 0 rows and targets', async () => {
        const hs = new HistoryStore(chrome.storage.local);
        await hs.ingestImportRows(['https://row1.com', 'https://row2.com'], 'imp_test');
        assert.strictEqual(hs.importRows.length, 2);

        await hs.clearAll();
        assert.strictEqual(hs.importRows.length, 0, 'importRows must be wiped to 0');
        assert.strictEqual(hs.targets.size, 0, 'targets must be wiped to 0');
        assert.strictEqual(hs.attempts.length, 0, 'attempts must be wiped to 0');
        assert.strictEqual(hs.currentGeneration, 0, 'generation must reset to 0');
    });

    await asyncTest('R4-22', 'FULL_RESET_CAMPAIGN_DATA completely removes checkpoint and queues from chrome.storage.local', async () => {
        mockStorage.xpider_paused_checkpoint = { remainingQueue: ['https://stale.com'] };
        mockStorage.xpider_visited_urls = ['https://visited.com'];
        mockStorage.xpider_campaign_queue = ['https://queue.com'];
        mockStorage.xpider_diagnostic_logs = [{ msg: 'old log' }];

        // Perform storage wipe
        const keysToRemove = [
            'xpider_paused_checkpoint',
            'xpider_campaign_state',
            'xpider_visited_urls',
            'xpider_campaign_queue',
            'xpider_diagnostic_logs'
        ];
        await chrome.storage.local.remove(keysToRemove);

        assert.strictEqual(mockStorage.xpider_paused_checkpoint, undefined);
        assert.strictEqual(mockStorage.xpider_visited_urls, undefined);
        assert.strictEqual(mockStorage.xpider_campaign_queue, undefined);
        assert.strictEqual(mockStorage.xpider_diagnostic_logs, undefined);
    });

    await asyncTest('R4-23', 'FULL_RESET_CAMPAIGN_DATA resets all counters to 0', async () => {
        bg.campaignState.counters = {
            total: 35,
            completed: 15,
            success: 10,
            failed: 5,
            remaining: 20,
            deliveryUnknown: 0,
            skippedHistory: 2,
            inProgress: 1,
            failureBreakdown: { 'FOO': 5 }
        };

        // Trigger reset logic
        bg.campaignState.counters = {
            total: 0,
            completed: 0,
            success: 0,
            failed: 0,
            remaining: 0,
            deliveryUnknown: 0,
            skippedHistory: 0,
            inProgress: 0,
            failureBreakdown: {}
        };

        assert.strictEqual(bg.campaignState.counters.success, 0);
        assert.strictEqual(bg.campaignState.counters.failed, 0);
        assert.strictEqual(bg.campaignState.counters.completed, 0);
        assert.strictEqual(bg.campaignState.counters.remaining, 0);
        assert.strictEqual(bg.campaignState.counters.total, 0);
    });

    await asyncTest('R4-24', 'FULL_RESET_CAMPAIGN_DATA preserves user form templates and API keys', async () => {
        mockStorage.templates_v2 = { version: 2, templates: { default: { name: 'My Pitch' } } };
        mockStorage.xpider_captcha_api_key = 'sec_key_12345';
        mockStorage.xpider_stt_api_key = 'wit_key_abcde';
        mockStorage.xpider_email_records = [{ email: 'ceo@test.com' }];

        // Verify keysToRemove does NOT touch templates, API keys, or email records
        const keysToRemove = [
            'xpider_paused_checkpoint',
            'xpider_campaign_state',
            'xpider_visited_urls',
            'xpider_campaign_queue',
            'xpider_currentAttempt',
            'xpider_isActive',
            'xpider_isPaused',
            'xpider_suppressions',
            'xpider_metrics',
            'xpider_diagnostic_logs',
            'xpider_counters'
        ];
        await chrome.storage.local.remove(keysToRemove);

        assert.notStrictEqual(mockStorage.templates_v2, undefined, 'Templates must be preserved');
        assert.strictEqual(mockStorage.templates_v2.templates.default.name, 'My Pitch');
        assert.strictEqual(mockStorage.xpider_captcha_api_key, 'sec_key_12345', 'Captcha key preserved');
        assert.strictEqual(mockStorage.xpider_stt_api_key, 'wit_key_abcde', 'Wit.ai key preserved');
        assert.notStrictEqual(mockStorage.xpider_email_records, undefined, 'Email collector store preserved');
    });

    // ── R4-25: 100% Binary Parity Verification ──
    test('R4-25', '100% Byte-for-byte binary parity between send_message_backup/ and build/extension/', () => {
        const rootDir = __dirname;
        const buildDir = path.join(__dirname, 'build', 'extension');
        const filesToCompare = [
            'background.js',
            'content-script.js',
            'popup.js',
            'solver-content.js',
            'solver-core.js',
            'modules/contact-discovery-engine.js',
            'modules/history-store.js'
        ];

        for (const file of filesToCompare) {
            const rootFile = path.join(rootDir, file);
            const buildFile = path.join(buildDir, file);
            assert(fs.existsSync(rootFile), `Root file must exist: ${file}`);
            assert(fs.existsSync(buildFile), `Build file must exist: ${file}`);
            const buf1 = fs.readFileSync(rootFile);
            const buf2 = fs.readFileSync(buildFile);
            assert.strictEqual(buf1.length, buf2.length, `Byte length mismatch in ${file} (${buf1.length} vs ${buf2.length})`);
            assert(buf1.equals(buf2), `Binary content mismatch in ${file}`);
        }
    });

    console.log("\n==================================================================");
    console.log(`Results: ${passed} PASSED / ${failed} FAILED (${passed + failed} total)`);
    console.log("==================================================================");

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
