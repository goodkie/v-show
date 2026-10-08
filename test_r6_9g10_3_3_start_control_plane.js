/**
 * test_r6_9g10_3_3_start_control_plane.js
 * 
 * Issue #6 R6.9G.10.3.3: START Control-Plane Recovery Regression Suite
 * Covers Mandatory Regression Tests A through E:
 *   A. Transient Boot Race (Self-Heal background waking without locking Start)
 *   B. Owner Trace Reproduction (99 URLs + System VPN Verified + Click Start -> START_UI -> START_GUARD -> START_IPC -> ACK)
 *   C. Confirmed Build Mismatch (Fail-Closed persistent lock)
 *   D. Transient Unreachable on Click (Button restored, visible log, subsequent click succeeds)
 *   E. Duplicate Handler Guard (One click = exactly one message, dataset.bound preserved)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_DIR = path.join(__dirname, 'send_message_backup');
const popSrc = fs.readFileSync(path.join(SRC_DIR, 'popup.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(SRC_DIR, 'popup.css'), 'utf8');

function extractFunction(src, signature) {
    const start = src.indexOf(signature);
    if (start === -1) throw new Error('Not found: ' + signature);
    const bodyStart = src.indexOf('{', src.indexOf(')', start));
    let open = 1, end = -1;
    for (let i = bodyStart + 1; i < src.length; i++) {
        if (src[i] === '{') open++;
        else if (src[i] === '}') {
            open--;
            if (open === 0) { end = i + 1; break; }
        }
    }
    return src.substring(start, end);
}

const fnBindCritical = extractFunction(popSrc, 'function bindCriticalControls()');
const fnSetStartGate = extractFunction(popSrc, 'function setStartGateState(');
const fnOnBgSuccess = extractFunction(popSrc, 'function onBackgroundMessageSuccess()');
const fnApplyHandshake = extractFunction(popSrc, 'function _applyHandshakeUiState(');
const fnVerifyHandshake = extractFunction(popSrc, 'async function verifyBuildHandshake(');
const fnStartCampaign = extractFunction(popSrc, 'async function startCampaign()');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
        testsFailed++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
        testsFailed++;
    }
}

async function main() {
    console.log('================================================================');
    console.log(' R6.9G.10.3.3 START CONTROL-PLANE RECOVERY REGRESSION TESTS');
    console.log('================================================================');

    // -------------------------------------------------------------
    // Test 1: Static Source Code Assertions
    // -------------------------------------------------------------
    runTest('1.1 verifyBuildHandshake implements explicit states (MATCH, CONFIRMED_MISMATCH, UNREACHABLE_TRANSIENT)', () => {
        assert(popSrc.includes("state: 'MATCH'"), "must return state: 'MATCH'");
        assert(popSrc.includes("state: 'CONFIRMED_MISMATCH'"), "must return state: 'CONFIRMED_MISMATCH'");
        assert(popSrc.includes("state: 'UNREACHABLE_TRANSIENT'"), "must return state: 'UNREACHABLE_TRANSIENT'");
    });

    runTest('1.2 setStartGateState centralizes start button locking and prevents transient deadlock', () => {
        assert(popSrc.includes('function setStartGateState('), 'setStartGateState must be implemented');
        assert(popSrc.includes("'TRANSIENT_WAIT'"), 'setStartGateState must handle TRANSIENT_WAIT');
        assert(popSrc.includes('function onBackgroundMessageSuccess()'), 'onBackgroundMessageSuccess must be implemented');
    });

    runTest('1.3 startCampaign emits immediate [START_UI] and [START_GUARD] diagnostics', () => {
        assert(popSrc.includes("[START_UI] click"), "must log [START_UI] click");
        assert(popSrc.includes("[START_GUARD] queue="), "must log [START_GUARD]");
        assert(popSrc.includes("[START_BLOCKED_EMPTY_QUEUE]"), "must log [START_BLOCKED_EMPTY_QUEUE]");
        assert(popSrc.includes("[START_BLOCKED_EMPTY_MESSAGE]"), "must log [START_BLOCKED_EMPTY_MESSAGE]");
        assert(popSrc.includes("[START_BLOCKED] BACKGROUND_UNREACHABLE"), "must log [START_BLOCKED] BACKGROUND_UNREACHABLE");
    });

    runTest('1.4 popup.css defines explicit disabled styling for #start-btn and .primary-btn', () => {
        assert(cssSrc.includes('#start-btn:disabled') || cssSrc.includes('.primary-btn:disabled'), 'must style disabled buttons');
        assert(cssSrc.includes('cursor: not-allowed'), 'disabled buttons must show not-allowed cursor');
    });

    // -------------------------------------------------------------
    // Dynamic Runtime Environment Setup for Tests A - E
    // -------------------------------------------------------------
    function createMockDOMAndChrome(initialBgState = 'NORMAL') {
        const domElements = new Map();
        function createElement(id, tag = 'div') {
            const el = {
                id,
                tagName: tag.toUpperCase(),
                attributes: {},
                dataset: {},
                classList: {
                    classes: new Set(),
                    add: (c) => el.classList.classes.add(c),
                    remove: (c) => el.classList.classes.delete(c),
                    contains: (c) => el.classList.classes.has(c)
                },
                style: {},
                value: '',
                textContent: '',
                title: '',
                disabled: false,
                listeners: {},
                setAttribute: (k, v) => { el.attributes[k] = v; },
                getAttribute: (k) => el.attributes[k] || null,
                removeAttribute: (k) => { delete el.attributes[k]; },
                hasAttribute: (k) => Object.prototype.hasOwnProperty.call(el.attributes, k),
                addEventListener: (event, handler) => {
                    el.listeners[event] = el.listeners[event] || [];
                    el.listeners[event].push(handler);
                },
                click: () => {
                    if (el.disabled) return false;
                    const handlers = el.listeners['click'] || [];
                    for (const h of handlers) h({ target: el, preventDefault: () => {} });
                    return true;
                }
            };
            domElements.set(id, el);
            return el;
        }

        const startBtn = createElement('start-btn', 'button');
        startBtn.textContent = '🚀 START SENDING';
        const saveSettingsBtn = createElement('save-settings-btn', 'button');
        const mismatchBanner = createElement('build-mismatch-banner', 'div');
        mismatchBanner.style.display = 'none';
        const vpnBadge = createElement('privacy-vpn-status-badge', 'span');
        vpnBadge.textContent = 'NOT CONFIRMED';
        const vpnCheckbox = createElement('privacy-vpn-confirm-checkbox', 'input');
        const tplMsg = createElement('tpl-message', 'textarea');
        tplMsg.value = 'Hello from XPIDER test!';
        const manualInput = createElement('manual-url-input', 'input');
        const multiActions = createElement('multi-actions', 'div');
        multiActions.classList.add('hidden');

        let bgMode = initialBgState; // 'NORMAL' | 'SLEEPING' | 'MISMATCH'
        let messagesSent = [];

        const mockChrome = {
            runtime: {
                lastError: null,
                sendMessage: (msg, callback) => {
                    messagesSent.push(msg);
                    if (bgMode === 'SLEEPING') {
                        mockChrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
                        if (callback) callback(null);
                        mockChrome.runtime.lastError = null;
                        return;
                    }
                    if (msg.action === 'GET_BUILD_PROVENANCE') {
                        if (bgMode === 'MISMATCH') {
                            if (callback) callback({
                                success: true,
                                provenance: {
                                    implementationHead: 'deadbeef00000000000000000000000000000000',
                                    buildId: 'R6.9F.MISMATCH-STALE',
                                    manifestVersion: 3
                                }
                            });
                        } else {
                            if (callback) callback({
                                success: true,
                                provenance: {
                                    implementationHead: '78d13d2663e6437531fcddc286c3fb4cb59bcbfd',
                                    buildId: 'R6.9G.10.3.3-20261008-START-CONTROL-PLANE-RECOVERY',
                                    manifestVersion: 3
                                }
                            });
                        }
                    } else if (msg.action === 'START_CAMPAIGN') {
                        if (callback) callback({
                            success: true,
                            status: 'STARTED',
                            runId: 'run-test-123'
                        });
                    } else if (msg.action === 'GET_STATE') {
                        if (callback) callback({
                            success: true,
                            totalTargets: 99,
                            remainingCount: 99,
                            successCount: 0
                        });
                    } else if (msg.action === 'VERIFY_SYSTEM_VPN') {
                        if (callback) callback({
                            success: true,
                            preflight: { ready: true, fingerprint: 'abc123mock' }
                        });
                    } else {
                        if (callback) callback({ success: true });
                    }
                }
            },
            storage: {
                local: {
                    get: (keys, cb) => {
                        const res = { xpider_privacy_config: { enabled: true, transportMode: 'SYSTEM_VPN' } };
                        if (cb) cb(res);
                        return Promise.resolve(res);
                    },
                    set: (obj, cb) => {
                        if (cb) cb();
                        return Promise.resolve();
                    }
                }
            }
        };

        const logs = [];
        const sandbox = {
            window: null,
            globalThis: null,
            document: {
                getElementById: (id) => domElements.get(id) || null,
                querySelector: () => null,
                addEventListener: () => {}
            },
            chrome: mockChrome,
            console: {
                log: (...a) => logs.push(['LOG', a.join(' ')]),
                warn: (...a) => logs.push(['WARN', a.join(' ')]),
                error: (...a) => logs.push(['ERROR', a.join(' ')])
            },
            alert: (msg) => logs.push(['ALERT', msg]),
            addLog: (msg, type) => logs.push(['ADD_LOG', `[${type}] ${msg}`]),
            addDiagnosticLog: (msg, type) => logs.push(['DIAG_LOG', `[${type || 'INFO'}] ${msg}`]),
            displayControlPlaneError: () => {},
            saveSettings: () => Promise.resolve(),
            bindCampaignTemplateMetadata: () => {},
            updateRealTimeStatus: () => {},
            updateProgress: () => {},
            campaignQueue: [],
            campaignActive: false,
            campaignPaused: false,
            successCount: 0,
            failedCount: 0,
            totalTargets: 0,
            currentTpl: {},
            BuildProvenance: {
                BUILD_INFO: {
                    implementationHead: '78d13d2663e6437531fcddc286c3fb4cb59bcbfd',
                    headShort: '78d13d26',
                    buildId: 'R6.9G.10.3.3-20261008-START-CONTROL-PLANE-RECOVERY',
                    manifestVersion: 3
                }
            },
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: (id) => clearTimeout(id),
            performance: { now: () => Date.now() },
            setBgMode: (m) => { bgMode = m; },
            getMessagesSent: () => messagesSent,
            getLogs: () => logs
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        sandbox.__xpider_boot = {};

        // Inject verified runtime code into sandbox
        const runtimeCode = `
            var currentStartGateState = 'READY';
            ${fnSetStartGate}
            ${fnOnBgSuccess}
            ${fnApplyHandshake}
            ${fnVerifyHandshake}
            ${fnBindCritical}
            ${fnStartCampaign}
        `;
        vm.runInNewContext(runtimeCode, sandbox);

        return { sandbox, domElements, startBtn, mismatchBanner, vpnBadge, tplMsg };
    }

    // -------------------------------------------------------------
    // Test A: TRANSIENT BOOT RACE (Self-Heal background waking)
    // -------------------------------------------------------------
    await runAsyncTest('Test A: Transient Boot Race — Start does NOT permanently lock when BG is sleeping, auto-recovers when BG wakes', async () => {
        const { sandbox, startBtn, mismatchBanner } = createMockDOMAndChrome('SLEEPING');

        // 1. Initial verifyBuildHandshake while BG is SLEEPING
        const res = await sandbox.verifyBuildHandshake({ retryOnTransient: false });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.state, 'UNREACHABLE_TRANSIENT');
        
        // Assert Start button is NOT permanently data-build-locked!
        assert.strictEqual(startBtn.hasAttribute('data-build-locked'), false, 'Start button MUST NOT have data-build-locked on transient wake');
        assert.strictEqual(startBtn.disabled, false, 'Start button MUST remain clickable during transient background wake');
        assert.strictEqual(mismatchBanner.style.display, 'none', 'Mismatch banner MUST remain hidden for transient background wake');

        // 2. Background service worker wakes up
        sandbox.setBgMode('NORMAL');

        // 3. Control-plane activity occurs (e.g. onBackgroundMessageSuccess)
        sandbox.onBackgroundMessageSuccess();
        assert.strictEqual(sandbox.currentStartGateState, 'READY');
        assert.strictEqual(startBtn.disabled, false);
        assert.strictEqual(startBtn.hasAttribute('data-build-locked'), false);
    });

    // -------------------------------------------------------------
    // Test B: OWNER TRACE REPRODUCTION
    // (Load 99 URLs + System VPN Verified + Click Start -> START_UI -> START_GUARD -> START_IPC -> ACK)
    // -------------------------------------------------------------
    await runAsyncTest('Test B: Owner Trace Reproduction — 99 URLs + System VPN + Click Start yields complete diagnostic trace', async () => {
        const { sandbox, startBtn, tplMsg } = createMockDOMAndChrome('NORMAL');

        // Setup 99 URLs
        sandbox.campaignQueue = Array.from({ length: 99 }, (_, i) => ({ url: `https://example.com/target-${i + 1}` }));
        tplMsg.value = 'Authorized campaign test inquiry message';

        sandbox.bindCriticalControls();

        // Simulate System VPN verified -> triggers onBackgroundMessageSuccess
        sandbox.onBackgroundMessageSuccess();
        assert.strictEqual(startBtn.disabled, false, 'Start button must be enabled before click');

        // Click the Start button in the DOM
        const clickEmitted = startBtn.click();
        assert.strictEqual(clickEmitted, true, 'DOM click must fire on enabled button');

        // Allow microtasks to complete
        await new Promise(r => setTimeout(r, 50));

        const logs = sandbox.getLogs().map(l => l[1]);
        const msgs = sandbox.getMessagesSent();

        // Check required ordered evidence
        const hasStartUi = logs.some(l => l.includes('[START_UI] click'));
        const hasStartGuard = logs.some(l => l.includes('[START_GUARD] queue=99 messagePresent=true buildLock=unlocked'));
        const hasStartIpc = logs.some(l => l.includes('[START_IPC] sent queue=99'));
        const hasStartAck = logs.some(l => l.includes('[START_ACK] ok=true'));

        assert(hasStartUi, 'Must emit [START_UI] click');
        assert(hasStartGuard, 'Must emit [START_GUARD]');
        assert(hasStartIpc, 'Must emit [START_IPC]');
        assert(hasStartAck, 'Must emit [START_ACK]');

        const startMsg = msgs.find(m => m.action === 'START_CAMPAIGN');
        assert(startMsg, 'Background must receive START_CAMPAIGN message');
        assert.strictEqual(startMsg.queue.length, 99, 'Queue length must be 99');
    });

    // -------------------------------------------------------------
    // Test C: CONFIRMED BUILD MISMATCH (Fail-Closed persistent lock)
    // -------------------------------------------------------------
    await runAsyncTest('Test C: Confirmed Build Mismatch — Strictly fails closed with data-build-locked=true and startBtn.disabled=true', async () => {
        const { sandbox, startBtn, mismatchBanner } = createMockDOMAndChrome('MISMATCH');

        const res = await sandbox.verifyBuildHandshake({ retryOnTransient: false });
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.state, 'CONFIRMED_MISMATCH');

        assert.strictEqual(startBtn.hasAttribute('data-build-locked'), true, 'Start button MUST have data-build-locked on confirmed mismatch');
        assert.strictEqual(startBtn.disabled, true, 'Start button MUST be disabled on confirmed mismatch');
        assert.strictEqual(mismatchBanner.style.display, 'block', 'Mismatch banner MUST be visible on confirmed mismatch');
    });

    // -------------------------------------------------------------
    // Test D: TRANSIENT UNREACHABLE ON CLICK
    // (Button restored, visible reason logged, subsequent click succeeds)
    // -------------------------------------------------------------
    await runAsyncTest('Test D: Transient Unreachable on Click — Restores button, logs reason, subsequent click succeeds', async () => {
        const { sandbox, startBtn, tplMsg } = createMockDOMAndChrome('SLEEPING');

        sandbox.campaignQueue = [{ url: 'https://example.com/one' }];
        tplMsg.value = 'Valid message';

        sandbox.bindCriticalControls();

        // Click Start while background is SLEEPING
        startBtn.click();
        await new Promise(r => setTimeout(r, 850));

        const logs = sandbox.getLogs().map(l => l[1]);
        const hasBlockedLog = logs.some(l => l.includes('[START_BLOCKED] BACKGROUND_UNREACHABLE'));
        assert(hasBlockedLog, 'Must log [START_BLOCKED] BACKGROUND_UNREACHABLE');

        // Button MUST be restored, not deadlocked!
        assert.strictEqual(startBtn.disabled, false, 'Start button must be restored and enabled after transient click failure');
        assert.strictEqual(startBtn.hasAttribute('data-build-locked'), false, 'data-build-locked must not be present');

        // Now background wakes up
        sandbox.setBgMode('NORMAL');

        // Second click
        const click2 = startBtn.click();
        assert.strictEqual(click2, true, 'Second click must proceed');
        await new Promise(r => setTimeout(r, 50));

        const msgs = sandbox.getMessagesSent();
        const startMsg = msgs.find(m => m.action === 'START_CAMPAIGN');
        assert(startMsg, 'Background must receive START_CAMPAIGN on subsequent click after waking');
    });

    // -------------------------------------------------------------
    // Test E: DUPLICATE HANDLER GUARD
    // (one click = exactly one START_CAMPAIGN message, dataset.bound preserved)
    // -------------------------------------------------------------
    await runAsyncTest('Test E: Duplicate Handler Guard — Retains dataset.bound, one click emits exactly one START_CAMPAIGN', async () => {
        const { sandbox, startBtn, tplMsg } = createMockDOMAndChrome('NORMAL');
        sandbox.campaignQueue = [{ url: 'https://example.com/single' }];
        tplMsg.value = 'Message text';

        sandbox.bindCriticalControls();
        sandbox.bindCriticalControls(); // Second call simulating duplicate bind

        assert.strictEqual(startBtn.dataset.bound, 'true', 'dataset.bound must be set to true');

        startBtn.click();
        await new Promise(r => setTimeout(r, 50));

        const msgs = sandbox.getMessagesSent().filter(m => m.action === 'START_CAMPAIGN');
        assert.strictEqual(msgs.length, 1, 'Exactly one START_CAMPAIGN message must be dispatched');
    });

    console.log('================================================================');
    console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
    console.log('================================================================');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
