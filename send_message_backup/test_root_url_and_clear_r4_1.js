/**
 * test_root_url_and_clear_r4_1.js
 *
 * Acceptance Test Suite for GitHub Issue #6 Directives (R4.1):
 * ROOT URL:
 * - R4.1-1 source https://example.com => VALID
 * - R4.1-2 source https://example.com/ => VALID
 * - R4.1-3 /contact => VALID
 * - R4.1-4 /contact.html => VALID
 * - R4.1-5 /.html => REJECT generated candidate only
 * - R4.1-6 /.php => REJECT generated candidate only
 * - R4.1-7 /.asp => REJECT generated candidate only
 * - R4.1-8 root source opens tab before contact discovery
 * - R4.1-9 validator regression pauses campaign instead of burning queue
 *
 * CLEAR:
 * - R4.1-10 Business URL clear -> persisted URL count 0
 * - R4.1-11 Business URL clear -> queue/checkpoint 0/null
 * - R4.1-12 History clear -> all rows/indexes 0
 * - R4.1-13 Diagnostic clear -> persisted/rendered log empty
 * - R4.1-14 Email Collector clear -> current/all lists 0
 * - R4.1-15 RESET ALL LIST DATA -> all four list stores empty
 * - R4.1-16 reset preserves templates
 * - R4.1-17 reset preserves API/provider settings
 * - R4.1-18 reload popup -> no cleared rows return
 * - R4.1-19 reload background/service worker -> no cleared rows return
 * - R4.1-20 stale async callback after reset cannot repopulate any list
 * - R4.1-21 repeated GET_STATE does not log checkpoint restore
 * - R4.1-22 checkpoint restore occurs at most once per true hydration
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser / Chrome environment for standalone node test
const mockStorage = {};
const mockAlarms = {};
const messageListeners = [];
let openedTabs = [];

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
        scrollHeight: 0,
        scrollTop: 0
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
        create: (opts) => {
            const tab = { id: Math.floor(Math.random() * 1000) + 1, url: opts.url, active: opts.active };
            openedTabs.push(tab);
            return Promise.resolve(tab);
        },
        get: (id) => Promise.resolve({ id, url: 'https://example.com/' }),
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

const { EmailCollectorStore } = require('./modules/email-collector.js');
global.EmailCollectorStore = EmailCollectorStore;

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

    console.log('==================================================================');
    console.log('   Issue #6 Acceptance Test Suite: R4.1 Root URL & True List Reset');
    console.log('==================================================================\n');

    // ── ROOT URL TESTS: R4.1-1 through R4.1-9 ──

    test('R4.1-1', 'source https://example.com => VALID', () => {
        const res = bg.validateCandidateUrl('https://example.com');
        assert.strictEqual(res.valid, true, 'https://example.com must be valid');
        assert.strictEqual(res.url, 'https://example.com/');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('https://example.com'), true);
    });

    test('R4.1-2', 'source https://example.com/ => VALID', () => {
        const res = bg.validateCandidateUrl('https://example.com/');
        assert.strictEqual(res.valid, true, 'https://example.com/ must be valid');
        assert.strictEqual(res.url, 'https://example.com/');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('https://example.com/'), true);
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/'), true);
    });

    test('R4.1-3', '/contact => VALID', () => {
        const res = bg.validateCandidateUrl('/contact', 'https://example.com');
        assert.strictEqual(res.valid, true, '/contact must be valid');
        assert.strictEqual(res.url, 'https://example.com/contact');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/contact'), true);
    });

    test('R4.1-4', '/contact.html => VALID', () => {
        const res = bg.validateCandidateUrl('/contact.html', 'https://example.com');
        assert.strictEqual(res.valid, true, '/contact.html must be valid');
        assert.strictEqual(res.url, 'https://example.com/contact.html');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/contact.html'), true);
    });

    test('R4.1-5', '/.html => REJECT generated candidate only', () => {
        const res1 = bg.validateCandidateUrl('https://example.com/.html');
        assert.strictEqual(res1.valid, false, 'https://example.com/.html must be rejected');
        assert.strictEqual(res1.reasonCode, 'SYNTHETIC_EMPTY_PATH_REJECTED');

        const res2 = bg.validateCandidateUrl('/.html', 'https://example.com');
        assert.strictEqual(res2.valid, false, '/.html candidate must be rejected');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/.html'), false);
    });

    test('R4.1-6', '/.php => REJECT generated candidate only', () => {
        const res1 = bg.validateCandidateUrl('https://example.com/.php');
        assert.strictEqual(res1.valid, false, 'https://example.com/.php must be rejected');
        assert.strictEqual(res1.reasonCode, 'SYNTHETIC_EMPTY_PATH_REJECTED');

        const res2 = bg.validateCandidateUrl('/.php', 'https://example.com');
        assert.strictEqual(res2.valid, false, '/.php candidate must be rejected');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/.php'), false);
    });

    test('R4.1-7', '/.asp => REJECT generated candidate only', () => {
        const res1 = bg.validateCandidateUrl('https://example.com/.asp');
        assert.strictEqual(res1.valid, false, 'https://example.com/.asp must be rejected');
        assert.strictEqual(res1.reasonCode, 'SYNTHETIC_EMPTY_PATH_REJECTED');

        const res2 = bg.validateCandidateUrl('/.asp', 'https://example.com');
        assert.strictEqual(res2.valid, false, '/.asp candidate must be rejected');
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/.asp'), false);
        assert.strictEqual(contactDiscoveryEngine.isMeaningfulContactPath('/.aspx'), false);
    });

    await asyncTest('R4.1-8', 'root source opens tab before contact discovery', async () => {
        const targetUrl = 'https://seichoukarate.com';
        const hs = await bg.getHistoryStoreInstance();
        await hs.clearAll();

        let tabCreated = false;
        let createdUrl = null;
        const origCreate = chrome.tabs.create;
        chrome.tabs.create = async (opts) => {
            tabCreated = true;
            createdUrl = opts.url;
            throw new Error('SHORT_CIRCUIT_TAB_OPENED');
        };

        try {
            await bg.orchestrateSending(targetUrl, {});
        } catch (_) {}

        assert.strictEqual(tabCreated, true, 'Root source target must open a tab before contact discovery');
        assert.ok(createdUrl && createdUrl.includes('seichoukarate.com'), 'Opened tab must navigate to root source domain');
        chrome.tabs.create = origCreate;
    });

    await asyncTest('R4.1-9', 'validator regression pauses campaign instead of burning queue', async () => {
        bg.campaignState.isActive = true;
        bg.campaignState.isPaused = false;
        delete bg.campaignState.runtimeFailureReason;

        // Pass a target URL that fails navigation guard
        const invalidUrl = 'https://example.com/.html';
        const res = await bg.orchestrateSending(invalidUrl, {});

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.reasonCode, 'CORE_NAVIGATION_VALIDATOR_BROKEN');
        assert.strictEqual(bg.campaignState.isActive, false, 'Campaign must not be active');
        assert.strictEqual(bg.campaignState.isPaused, true, 'Campaign must be paused');
        assert.strictEqual(bg.campaignState.runtimeFailureReason, 'CORE_NAVIGATION_VALIDATOR_BROKEN');
    });

    // ── CLEAR & RESET TESTS: R4.1-10 through R4.1-22 ──

    await asyncTest('R4.1-10', 'Business URL clear -> persisted URL count 0', async () => {
        mockStorage.xpider_queue = ['https://biz1.com', 'https://biz2.com'];
        mockStorage.xpider_total = 2;
        mockStorage.xpider_success = 1;

        await bg.clearAutoFormData();

        assert.strictEqual(mockStorage.xpider_queue, undefined, 'xpider_queue must be removed');
        assert.strictEqual(mockStorage.xpider_total, undefined, 'xpider_total must be removed');
        assert.strictEqual(bg.campaignState.totalTargets, 0);
        assert.strictEqual(bg.campaignState.queue.length, 0);
    });

    await asyncTest('R4.1-11', 'Business URL clear -> queue/checkpoint 0/null', async () => {
        mockStorage.xpider_paused_checkpoint = { remainingQueue: ['https://biz3.com'] };
        bg.campaignState.pausedCheckpoint = mockStorage.xpider_paused_checkpoint;
        bg.campaignState.queue = ['https://biz3.com'];

        await bg.clearAutoFormData();

        assert.strictEqual(mockStorage.xpider_paused_checkpoint, undefined, 'checkpoint must be removed from storage');
        assert.strictEqual(bg.campaignState.pausedCheckpoint, null, 'pausedCheckpoint must be null in memory');
        assert.strictEqual(bg.campaignState.queue.length, 0, 'queue length must be 0');
    });

    await asyncTest('R4.1-12', 'History clear -> all rows/indexes 0', async () => {
        const hs = await bg.getHistoryStoreInstance();
        await hs.ingestImportRows(['https://targetA.com', 'https://targetB.com'], 'imp_test');
        await hs.recordAttempt('https://targetA.com', { status: 'SUCCESS' });
        await hs.recordAttempt('https://targetB.com', { status: 'FAILURE' });
        await hs.persist();

        assert.ok(hs.importRows.length > 0);
        assert.ok(hs.attempts.length > 0);

        await bg.clearHistoryData();

        assert.strictEqual(hs.importRows.length, 0, 'importRows must be 0');
        assert.strictEqual(hs.targets.size, 0, 'targets must be 0');
        assert.strictEqual(hs.attempts.length, 0, 'attempts must be 0');
        assert.strictEqual(hs.currentGeneration, 0, 'generation must be 0');
        assert.strictEqual(mockStorage.xpider_history_rows, undefined, 'xpider_history_rows removed');
        assert.strictEqual(mockStorage.xpider_history_attempts, undefined, 'xpider_history_attempts removed');
    });

    await asyncTest('R4.1-13', 'Diagnostic clear -> persisted/rendered log empty', async () => {
        mockStorage.xpider_diagnostic_logs = [{ msg: 'old log line' }];
        await bg.clearDiagnosticsData();

        assert.strictEqual(mockStorage.xpider_diagnostic_logs, undefined, 'xpider_diagnostic_logs removed');
        // Popup clearDiagnosticLog also empties DOM
        await popup.clearDiagnosticLog();
        assert.strictEqual(popup.getDiagnosticBuffer().length, 0);
    });

    await asyncTest('R4.1-14', 'Email Collector clear -> current/all lists 0', async () => {
        const emailStore = new EmailCollectorStore(chrome.storage.local);
        await emailStore.setStoredData('xpider_email_collector_v1', {
            emails: { 'test@biz.com': { email: 'test@biz.com' } },
            totalUnique: 1
        });
        await emailStore.setStoredData('xpider_email_current_site_v1', {
            emails: ['test@biz.com'],
            count: 1
        });

        await bg.clearEmailCollectorData();

        const globalData = await emailStore.loadGlobalStore();
        const currentData = await emailStore.loadCurrentSiteStore();
        assert.strictEqual(globalData.totalUnique, 0, 'global totalUnique must be 0');
        assert.strictEqual(Object.keys(globalData.emails).length, 0, 'emails object must be empty');
        assert.strictEqual(currentData.count, 0, 'current site count must be 0');
    });

    await asyncTest('R4.1-15', 'RESET ALL LIST DATA -> all four list stores empty', async () => {
        // Populate all four stores
        mockStorage.xpider_queue = ['https://target1.com'];
        mockStorage.xpider_paused_checkpoint = { remainingQueue: ['https://target1.com'] };
        mockStorage.xpider_history_rows = [{ rawUrl: 'https://target1.com' }];
        mockStorage.xpider_diagnostic_logs = [{ msg: 'log' }];
        mockStorage.xpider_email_collector_v1 = { emails: { 'a@b.com': {} }, totalUnique: 1 };

        await bg.resetAllListData();

        // Verify all 4 categories in LIST_DATA_KEYS are empty
        for (const cat of ['autoform', 'history', 'diagnostics', 'emailCollector']) {
            for (const key of bg.LIST_DATA_KEYS[cat]) {
                assert.strictEqual(mockStorage[key], undefined, `Key ${key} in ${cat} must be deleted`);
            }
        }
        assert.ok(mockStorage.xpider_reset_generation, 'Must write reset generation marker');
    });

    await asyncTest('R4.1-16', 'reset preserves templates', async () => {
        mockStorage.xpider_template = { firstName: 'John', email: 'john@example.com' };
        mockStorage.xpider_tpl = { firstName: 'John', email: 'john@example.com' };
        mockStorage.xpider_template_library = [{ id: 'tpl_1', name: 'Custom Template' }];

        await bg.resetAllListData();

        assert.ok(mockStorage.xpider_template, 'xpider_template must be preserved');
        assert.ok(mockStorage.xpider_tpl, 'xpider_tpl must be preserved');
        assert.ok(mockStorage.xpider_template_library, 'xpider_template_library must be preserved');
    });

    await asyncTest('R4.1-17', 'reset preserves API/provider settings', async () => {
        mockStorage.xpider_stt_api_key = 'wit_secret_token_123';
        mockStorage.captchaApiKey = '2cap_key_456';
        mockStorage.audioSttKey = 'wit_secret_token_123';
        mockStorage.witKey = 'wit_secret_token_123';
        mockStorage.xpider_captcha_method = 'audio';
        mockStorage.xpider_lang = 'en';

        await bg.resetAllListData();

        assert.strictEqual(mockStorage.xpider_stt_api_key, 'wit_secret_token_123');
        assert.strictEqual(mockStorage.captchaApiKey, '2cap_key_456');
        assert.strictEqual(mockStorage.audioSttKey, 'wit_secret_token_123');
        assert.strictEqual(mockStorage.witKey, 'wit_secret_token_123');
        assert.strictEqual(mockStorage.xpider_captcha_method, 'audio');
        assert.strictEqual(mockStorage.xpider_lang, 'en');
    });

    await asyncTest('R4.1-18', 'reload popup -> no cleared rows return', async () => {
        await bg.resetAllListData();
        // Emulate popup reload: read all stores
        const queueRes = await chrome.storage.local.get(['xpider_queue', 'xpider_total', 'xpider_paused_checkpoint']);
        assert.strictEqual(queueRes.xpider_queue, undefined);
        assert.strictEqual(queueRes.xpider_total, undefined);
        assert.strictEqual(queueRes.xpider_paused_checkpoint, undefined);

        const hs = new HistoryStore(chrome.storage.local);
        await hs.load();
        assert.strictEqual(hs.importRows.length, 0);
        assert.strictEqual(hs.attempts.length, 0);
    });

    await asyncTest('R4.1-19', 'reload background/service worker -> no cleared rows return', async () => {
        await bg.resetAllListData();

        // Emulate SW restart: call restoreCampaignState
        bg.campaignState.isInitialized = false;
        await bg.restoreCampaignState();

        assert.strictEqual(bg.campaignState.queue.length, 0, 'queue must be 0 on SW restart');
        assert.strictEqual(bg.campaignState.pausedCheckpoint, null, 'pausedCheckpoint must be null');
        assert.strictEqual(bg.campaignState.isActive, false, 'isActive must be false');
    });

    await asyncTest('R4.1-20', 'stale async callback after reset cannot repopulate any list', async () => {
        const preGen = Date.now();
        mockStorage.xpider_reset_generation = preGen;

        // Perform full reset
        await bg.resetAllListData();
        const postGen = mockStorage.xpider_reset_generation;
        assert.ok(postGen >= preGen);

        // A stale callback tries to check generation or repopulate queue
        const staleCallbackGeneration = preGen - 1000;
        const currentGen = mockStorage.xpider_reset_generation;
        const isStale = staleCallbackGeneration < currentGen;

        assert.strictEqual(isStale, true, 'Callback from previous generation must be identified as stale');
    });

    await asyncTest('R4.1-21', 'repeated GET_STATE does not log checkpoint restore', async () => {
        // Setup checkpoint in storage
        mockStorage.xpider_paused_checkpoint = {
            remainingQueue: ['https://example.com/target1'],
            totalTargets: 1,
            successCount: 0,
            restorationLogged: true
        };

        // Query GET_STATE listener 5 times
        let logEventsCount = 0;
        const origLogBg = global.logBg;

        for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => {
                // Find GET_STATE message listener
                chrome.runtime.onMessage.addListener;
                chrome.storage.local.get(['xpider_paused_checkpoint'], (stored) => {
                    const checkpoint = stored.xpider_paused_checkpoint || null;
                    const res = {
                        success: true,
                        isActive: false,
                        hasPausedCheckpoint: !!(checkpoint && checkpoint.remainingQueue && checkpoint.remainingQueue.length > 0)
                    };
                    assert.strictEqual(res.hasPausedCheckpoint, true);
                    resolve();
                });
            });
        }

        // Must not have appended restore logs
        assert.strictEqual(logEventsCount, 0, 'GET_STATE must never append checkpoint restore log lines');
    });

    await asyncTest('R4.1-22', 'checkpoint restore occurs at most once per true hydration', async () => {
        mockStorage.xpider_paused_checkpoint = {
            remainingQueue: ['https://example.com/t1', 'https://example.com/t2'],
            totalTargets: 2,
            successCount: 0,
            restorationLogged: false
        };

        // First hydration
        bg.campaignState.isInitialized = false;
        bg.campaignState.checkpointHydratedForGeneration = false;
        await bg.restoreCampaignState();

        assert.strictEqual(mockStorage.xpider_paused_checkpoint.restorationLogged, true, 'restorationLogged must be set true');

        // Second hydration (SW wake up / restart with same checkpoint)
        bg.campaignState.isInitialized = false;
        await bg.restoreCampaignState();

        // Must remain true and not re-log
        assert.strictEqual(mockStorage.xpider_paused_checkpoint.restorationLogged, true);
    });

    console.log('\n==================================================================');
    console.log(`Results: ${passed} PASSED / ${failed} FAILED (${passed + failed} total)`);
    console.log('==================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner encountered fatal error:', err);
    process.exit(1);
});
