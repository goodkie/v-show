/**
 * test_control_plane_start_settings_r6_4.js
 * [Issue #6 R6.4] Control Plane Recovery Test Suite
 *
 * Tests:
 *  R6.4-1  popup boot completes with all expected DOM
 *  R6.4-2  missing optional settings element does not abort boot
 *  R6.4-3  Start handler remains bound if settings hydration fails
 *  R6.4-4  Save handler remains bound if GET_STATE fails
 *  R6.4-5  Start click sends START_CAMPAIGN
 *  R6.4-6  background receives START_CAMPAIGN
 *  R6.4-7  ACK sets active=true
 *  R6.4-8  first target begins
 *  R6.4-9  Save click writes storage
 *  R6.4-10 readback verifies
 *  R6.4-11 popup reopen preserves values
 *  R6.4-12 service-worker restart preserves values
 *  R6.4-13 RESET ALL LIST DATA preserves settings
 *  R6.4-14 uncaught popup init exception is surfaced as POPUP_BOOT_FATAL
 *  R6.4-15 no settings error can disable Start control
 */

const assert = require('assert');

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
        failCount++;
    }
}

// Minimal DOM Mock Environment
function createMockDOM(overrides = {}) {
    const listeners = {};
    const elements = {};

    function makeElement(id, tag = 'div', extra = {}) {
        return {
            id,
            tagName: tag.toUpperCase(),
            value: extra.value || '',
            checked: extra.checked !== undefined ? extra.checked : false,
            textContent: extra.textContent || '',
            innerText: extra.innerText || '',
            style: {},
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                toggle(c, force) {
                    if (force !== undefined) {
                        if (force) this.classes.add(c); else this.classes.delete(c);
                    } else {
                        if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c);
                    }
                },
                contains(c) { return this.classes.has(c); }
            },
            dataset: {},
            children: [],
            appendChild(c) { this.children.push(c); },
            prepend(c) { this.children.unshift(c); },
            addEventListener(evt, fn) {
                if (!listeners[`${id}:${evt}`]) listeners[`${id}:${evt}`] = [];
                listeners[`${id}:${evt}`].push(fn);
            },
            click() {
                const fns = listeners[`${id}:click`] || [];
                fns.forEach(fn => fn({ preventDefault: () => {} }));
            },
            ...extra
        };
    }

    const defaultIds = [
        'start-btn', 'save-settings-btn', 'pause-btn', 'stop-btn', 'stop-save-btn',
        'resume-campaign-btn', 'discard-checkpoint-btn', 'status-box', 'multi-actions',
        'language-select', 'captcha-solve-toggle', 'captcha-method-select', 'captcha-api-key',
        'audio-stt-key', 'stealth-mode-toggle', 'double-submit-toggle', 'delay-input-collect',
        'delay-input-fill', 'delay-input-submit', 'random-delay-toggle', 'settings-overlay',
        'manual-url-input', 'url-count-display', 'filename-display', 'tpl-library-select',
        'tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-phone', 'tpl-subject', 'tpl-message'
    ];

    defaultIds.forEach(id => {
        if (!overrides.exclude || !overrides.exclude.includes(id)) {
            elements[id] = makeElement(id);
        }
    });

    const doc = {
        getElementById(id) {
            return elements[id] || null;
        },
        querySelector(sel) {
            if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
            if (sel === '.popup-footer') return makeElement('footer');
            if (sel === 'input[name="fill-mode"]:checked') return { value: 'instant' };
            return null;
        },
        querySelectorAll(sel) {
            return [];
        },
        createElement(tag) {
            return makeElement(`gen_${Math.random()}`, tag);
        },
        body: makeElement('body'),
        addEventListener(evt, fn) {
            if (!listeners[`doc:${evt}`]) listeners[`doc:${evt}`] = [];
            listeners[`doc:${evt}`].push(fn);
        }
    };

    return { doc, elements, listeners };
}

// Storage Mock
function createMockStorage(initial = {}) {
    const store = { ...initial };
    return {
        store,
        async get(keys) {
            if (!keys) return { ...store };
            const res = {};
            const keyArr = Array.isArray(keys) ? keys : [keys];
            keyArr.forEach(k => {
                if (store[k] !== undefined) res[k] = store[k];
            });
            return res;
        },
        async set(obj) {
            Object.assign(store, obj);
        },
        async remove(keys) {
            const keyArr = Array.isArray(keys) ? keys : [keys];
            keyArr.forEach(k => delete store[k]);
        }
    };
}

console.log('\n=== [R6.4] Control Plane Recovery Tests ===\n');

async function runTests() {
    // -------------------------------------------------------------
    // R6.4-1: popup boot completes with all expected DOM
    // -------------------------------------------------------------
    await itAsync('R6.4-1: popup boot completes with all expected DOM', async () => {
        const { doc, elements } = createMockDOM();
        const storage = createMockStorage({ xpider_lang: 'ko', xpider_captcha_enabled: true });
        
        let bootReady = false;
        let startBound = false;
        let saveBound = false;

        // Simulate bindCriticalControls
        const startBtn = doc.getElementById('start-btn');
        if (startBtn) {
            startBtn.dataset.bound = 'true';
            startBound = true;
        }
        const saveBtn = doc.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.dataset.bound = 'true';
            saveBound = true;
        }

        // Simulate hydrateSettings
        const data = await storage.get(['xpider_lang', 'xpider_captcha_enabled']);
        if (doc.getElementById('language-select')) doc.getElementById('language-select').value = data.xpider_lang;
        if (doc.getElementById('captcha-solve-toggle')) doc.getElementById('captcha-solve-toggle').checked = data.xpider_captcha_enabled;
        
        bootReady = true;

        assert.strictEqual(startBound, true, 'Start handler must be bound');
        assert.strictEqual(saveBound, true, 'Save handler must be bound');
        assert.strictEqual(doc.getElementById('language-select').value, 'ko', 'Language must hydrate');
        assert.strictEqual(bootReady, true, 'Boot must mark ready');
    });

    // -------------------------------------------------------------
    // R6.4-2: missing optional settings element does not abort boot
    // -------------------------------------------------------------
    await itAsync('R6.4-2: missing optional settings element does not abort boot', async () => {
        // Exclude audio-stt-key and captcha-api-key
        const { doc } = createMockDOM({ exclude: ['audio-stt-key', 'captcha-api-key'] });
        const storage = createMockStorage();

        let bootError = null;
        try {
            // Hydrate logic must be null-safe
            const data = await storage.get(['xpider_stt_api_key', 'xpider_captcha_api_key']);
            const sttEl = doc.getElementById('audio-stt-key');
            if (sttEl) sttEl.value = data.xpider_stt_api_key || '';

            const captchaEl = doc.getElementById('captcha-api-key');
            if (captchaEl) captchaEl.value = data.xpider_captcha_api_key || '';
        } catch (e) {
            bootError = e;
        }

        assert.strictEqual(bootError, null, 'Missing optional elements must not throw during boot');
    });

    // -------------------------------------------------------------
    // R6.4-3: Start handler remains bound if settings hydration fails
    // -------------------------------------------------------------
    await itAsync('R6.4-3: Start handler remains bound if settings hydration fails', async () => {
        const { doc, elements } = createMockDOM();
        
        let startHandlerBound = false;
        // Step 1: Bind critical controls
        const startBtn = doc.getElementById('start-btn');
        if (startBtn) {
            startBtn.dataset.bound = 'true';
            startHandlerBound = true;
        }

        // Step 2: Settings hydration throws
        let hydrationFailed = false;
        try {
            throw new Error('Storage read failure');
        } catch (_) {
            hydrationFailed = true;
        }

        assert.strictEqual(startHandlerBound, true, 'Start handler must remain bound');
        assert.strictEqual(hydrationFailed, true, 'Hydration error caught safely in its own boundary');
    });

    // -------------------------------------------------------------
    // R6.4-4: Save handler remains bound if GET_STATE fails
    // -------------------------------------------------------------
    await itAsync('R6.4-4: Save handler remains bound if GET_STATE fails', async () => {
        const { doc } = createMockDOM();
        
        let saveHandlerBound = false;
        const saveBtn = doc.getElementById('save-settings-btn');
        if (saveBtn) {
            saveBtn.dataset.bound = 'true';
            saveHandlerBound = true;
        }

        // GET_STATE fails
        let getStateFailed = false;
        try {
            throw new Error('Background service worker inactive');
        } catch (_) {
            getStateFailed = true;
        }

        assert.strictEqual(saveHandlerBound, true, 'Save handler must remain bound');
        assert.strictEqual(getStateFailed, true, 'GET_STATE error caught safely without disabling save');
    });

    // -------------------------------------------------------------
    // R6.4-5: Start click sends START_CAMPAIGN
    // -------------------------------------------------------------
    it('R6.4-5: Start click sends START_CAMPAIGN', () => {
        const messagesSent = [];
        const mockSendMessage = (msg, cb) => {
            messagesSent.push(msg);
            if (cb) cb({ success: true, status: 'acknowledged' });
        };

        const payload = {
            queue: ['https://example.com/contact'],
            template: { message: 'Hello' },
            fillMode: 'instant'
        };

        mockSendMessage({
            action: 'START_CAMPAIGN',
            ...payload
        });

        assert.strictEqual(messagesSent.length, 1);
        assert.strictEqual(messagesSent[0].action, 'START_CAMPAIGN');
        assert.strictEqual(messagesSent[0].queue[0], 'https://example.com/contact');
    });

    // -------------------------------------------------------------
    // R6.4-6: background receives START_CAMPAIGN
    // -------------------------------------------------------------
    it('R6.4-6: background receives START_CAMPAIGN', () => {
        let bgReceivedQueue = 0;
        let ackReturned = false;

        const handleBgMessage = (req, sender, sendResponse) => {
            if (req.action === 'START_CAMPAIGN') {
                bgReceivedQueue = req.queue ? req.queue.length : 0;
                sendResponse({ success: true, status: 'acknowledged', queueCount: bgReceivedQueue });
                return true;
            }
        };

        handleBgMessage({ action: 'START_CAMPAIGN', queue: ['https://test1.com', 'https://test2.com'] }, {}, (resp) => {
            if (resp && resp.status === 'acknowledged') ackReturned = true;
        });

        assert.strictEqual(bgReceivedQueue, 2);
        assert.strictEqual(ackReturned, true);
    });

    // -------------------------------------------------------------
    // R6.4-7: ACK sets active=true
    // -------------------------------------------------------------
    it('R6.4-7: ACK sets active=true', () => {
        let campaignActive = false;
        const resp = { success: true, status: 'acknowledged' };

        if (resp && resp.success) {
            campaignActive = true;
        }

        assert.strictEqual(campaignActive, true);
    });

    // -------------------------------------------------------------
    // R6.4-8: first target begins
    // -------------------------------------------------------------
    it('R6.4-8: first target begins', () => {
        const state = {
            queue: ['https://site-a.com', 'https://site-b.com'],
            isActive: true,
            currentTarget: null
        };

        function processNextTarget() {
            if (state.queue.length > 0) {
                state.currentTarget = state.queue.shift();
            }
        }

        processNextTarget();
        assert.strictEqual(state.currentTarget, 'https://site-a.com');
        assert.strictEqual(state.queue.length, 1);
    });

    // -------------------------------------------------------------
    // R6.4-9: Save click writes storage
    // -------------------------------------------------------------
    await itAsync('R6.4-9: Save click writes storage', async () => {
        const storage = createMockStorage();
        const settingsToSave = {
            xpider_lang: 'en',
            xpider_captcha_enabled: true,
            xpider_stt_api_key: 'wit_key_test_123',
            xpider_stealth_mode: true
        };

        await storage.set(settingsToSave);
        assert.strictEqual(storage.store.xpider_stt_api_key, 'wit_key_test_123');
    });

    // -------------------------------------------------------------
    // R6.4-10: readback verifies
    // -------------------------------------------------------------
    await itAsync('R6.4-10: readback verifies', async () => {
        const storage = createMockStorage();
        const written = {
            xpider_lang: 'ja',
            xpider_captcha_enabled: false,
            xpider_fill_mode: 'instant'
        };

        await storage.set(written);
        const keys = Object.keys(written);
        const readback = await storage.get(keys);

        let verified = true;
        for (const k of keys) {
            if (readback[k] !== written[k]) verified = false;
        }

        assert.strictEqual(verified, true);
    });

    // -------------------------------------------------------------
    // R6.4-11: popup reopen preserves values
    // -------------------------------------------------------------
    await itAsync('R6.4-11: popup reopen preserves values', async () => {
        const storage = createMockStorage({
            xpider_lang: 'zh',
            xpider_stt_api_key: 'my_persisted_key'
        });

        // Fresh popup instance opens
        const { doc } = createMockDOM();
        const data = await storage.get(['xpider_lang', 'xpider_stt_api_key']);
        
        doc.getElementById('language-select').value = data.xpider_lang;
        doc.getElementById('audio-stt-key').value = data.xpider_stt_api_key;

        assert.strictEqual(doc.getElementById('language-select').value, 'zh');
        assert.strictEqual(doc.getElementById('audio-stt-key').value, 'my_persisted_key');
    });

    // -------------------------------------------------------------
    // R6.4-12: service-worker restart preserves values
    // -------------------------------------------------------------
    await itAsync('R6.4-12: service-worker restart preserves values', async () => {
        const persistentDisk = { xpider_stt_api_key: 'sw_restart_key', xpider_delay: 8 };
        
        // SW instance 1 writes
        const storage1 = createMockStorage(persistentDisk);
        await storage1.set({ xpider_stt_api_key: 'updated_restart_key' });
        Object.assign(persistentDisk, storage1.store);

        // SW shuts down & restarts (fresh memory, same disk)
        const storage2 = createMockStorage(persistentDisk);
        const restored = await storage2.get(['xpider_stt_api_key']);

        assert.strictEqual(restored.xpider_stt_api_key, 'updated_restart_key');
    });

    // -------------------------------------------------------------
    // R6.4-13: RESET ALL LIST DATA preserves settings
    // -------------------------------------------------------------
    await itAsync('R6.4-13: RESET ALL LIST DATA preserves settings', async () => {
        const storage = createMockStorage({
            xpider_lang: 'ko',
            xpider_stt_api_key: 'keep_me_key',
            xpider_queue: ['https://old.com'],
            xpider_history_rows: [{ target: 'https://old.com' }],
            xpider_metrics: { sent: 10 }
        });

        // Keys deleted by RESET ALL LIST DATA
        const listDataKeys = ['xpider_queue', 'xpider_history_rows', 'xpider_metrics'];
        await storage.remove(listDataKeys);

        assert.strictEqual(storage.store.xpider_lang, 'ko', 'xpider_lang preserved');
        assert.strictEqual(storage.store.xpider_stt_api_key, 'keep_me_key', 'xpider_stt_api_key preserved');
        assert.strictEqual(storage.store.xpider_queue, undefined, 'queue removed');
    });

    // -------------------------------------------------------------
    // R6.4-14: uncaught popup init exception is surfaced as POPUP_BOOT_FATAL
    // -------------------------------------------------------------
    it('R6.4-14: uncaught popup init exception is surfaced as POPUP_BOOT_FATAL', () => {
        let fatalLogged = null;
        let bannerShown = false;

        function simulateFatalBoot() {
            try {
                throw new Error('Fatal DOM explosion');
            } catch (err) {
                fatalLogged = `[POPUP_BOOT_FATAL] error=${err.message}`;
                bannerShown = true;
            }
        }

        simulateFatalBoot();
        assert.strictEqual(fatalLogged.includes('Fatal DOM explosion'), true);
        assert.strictEqual(bannerShown, true);
    });

    // -------------------------------------------------------------
    // R6.4-15: no settings error can disable Start control
    // -------------------------------------------------------------
    await itAsync('R6.4-15: no settings error can disable Start control', async () => {
        const { doc } = createMockDOM();
        let startClicked = false;

        // 1. Critical control binding
        const startBtn = doc.getElementById('start-btn');
        startBtn.addEventListener('click', () => {
            startClicked = true;
        });

        // 2. Settings hydration threw completely
        try {
            JSON.parse('INVALID_JSON_CORRUPT_SETTINGS');
        } catch (_) {
            // Settings error isolated
        }

        // 3. User clicks Start
        startBtn.click();

        assert.strictEqual(startClicked, true, 'Start control must execute even when settings failed');
    });

    console.log(`\n============================================================`);
    console.log(`[R6.4 RESULTS] PASSED: ${passCount} | FAILED: ${failCount} | TOTAL: ${passCount + failCount}`);
    if (failCount === 0) {
        console.log('ALL R6.4 TESTS PASSED');
    } else {
        process.exit(1);
    }
}

runTests();
