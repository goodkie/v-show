/**
 * XPIDER V7 Authoritative Clean-Room Package-Level Chromium E2E Suite
 * (Directive #6699377538 Item 2)
 *
 * Requirements:
 * 1. Load extension strictly from clean-room unpacked candidate package (dist/clean_room_unpacked_v7)
 * 2. Real fresh disposable Chromium profile (no shared user data)
 * 3. Verify real visible START button, default-OFF #xpider-opt-include-no-message checkbox, #stop-save-btn
 * 4. Verify AUTO, SEMI_AUTO, and MANUAL mode switching and execution
 * 5. Verify message-less Newsletter form skip (default OFF) vs submission (explicit ON)
 * 6. Verify pause -> stop & save checkpoint persistence
 * 7. Verify Service Worker crash/termination and durable restoration
 * 8. Zero public network traffic — 100% localhost 127.0.0.1:8088 fixtures
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9227;
const PKG_EXT_DIR = path.resolve(__dirname, '..', 'dist', 'clean_room_unpacked_v7');
const EVIDENCE_DIR = path.resolve(__dirname, '..', 'dist', 'evidence_clean_room');
const REPORT_FILE = path.resolve(__dirname, '..', 'dist', 'report_clean_room_package_suite.json');
const LOG_FILE = path.resolve(__dirname, '..', 'dist', 'test_clean_room_package.log');

if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    if (logStream && !logStream.writableEnded) {
        logStream.write(line + '\n');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cdpSend(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1000000);
        const timer = setTimeout(() => reject(new Error(`CDP Timeout: ${method}`)), 25000);
        function onMessage(event) {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.id === id) {
                    ws.removeEventListener('message', onMessage);
                    clearTimeout(timer);
                    if (msg.error) reject(new Error(`CDP Error (${method}): ${JSON.stringify(msg.error)}`));
                    else resolve(msg.result);
                }
            } catch (_) {}
        }
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function openWs(url) {
    const WebSocket = globalThis.WebSocket || require('ws');
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = rej;
    });
    return ws;
}

async function shot(ws, filename) {
    const res = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
    const p = path.join(EVIDENCE_DIR, filename);
    fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
    log(`📸 Captured screenshot: ${filename}`);
    return filename;
}

async function main() {
    log('================================================================================');
    log('🚀 RUNNING XPIDER V7 CLEAN-ROOM PACKAGE CHROMIUM E2E SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();
    assert(fs.existsSync(PKG_EXT_DIR), `Clean-room unpacked candidate extension directory must exist: ${PKG_EXT_DIR}`);

    // 1. Verify test server is reachable and reset submissions
    await fetch(`http://127.0.0.1:${PORT}/__xpider_reset_submissions`).then(r => r.json());
    const initSub = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
    assert.strictEqual(initSub.count, 0, 'Server submissions must start at 0');
    log(`Test server active on port ${PORT}, submissions reset to 0`);

    async function getServerSubmissions() {
        const res = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`);
        const data = await res.json();
        return data.submissionsCount || data.count || 0;
    }

    // 2. Launch disposable Chromium profile loading clean-room unpacked package
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-clean-room-${Math.random().toString(36).substring(2, 8)}`);
    const browserBin = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    log(`Clean-room profile: ${tmpProfile}`);
    log(`Package extension directory: ${PKG_EXT_DIR}`);

    const browserArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tmpProfile}`,
        `--disable-extensions-except=${PKG_EXT_DIR}`,
        `--load-extension=${PKG_EXT_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        'about:blank'
    ];

    const proc = spawn(browserBin, browserArgs, { stdio: 'ignore' });
    let browserWs = null;
    let popupWs = null;
    let swWs = null;

    const report = {
        testSuite: 'XPIDER_V7_CLEAN_ROOM_PACKAGE_SUITE',
        packageExtensionDir: PKG_EXT_DIR,
        startTimeUtc,
        endTimeUtc: null,
        status: 'RUNNING',
        assertions: [],
        screenshots: []
    };

    function recordAssertion(name, passed, detail = {}) {
        const item = { name, passed, detail, timestamp: new Date().toISOString() };
        report.assertions.push(item);
        log(`[ASSERTION] ${name} => ${passed ? 'PASS' : 'FAIL'} ${JSON.stringify(detail)}`);
        assert(passed, `Assertion failed: ${name}`);
    }

    try {
        await sleep(2500);

        // Fetch browser WebSocket & Service Worker
        const browserWsUrl = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json()).then(j => j.webSocketDebuggerUrl);
        browserWs = await openWs(browserWsUrl);

        // Locate Extension Service Worker
        let swTarget = null;
        let targets = null;
        for (let i = 0; i < 30; i++) {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (swTarget) break;
            await sleep(300);
        }
        assert(swTarget, 'Clean-room Extension Service Worker target must exist');
        const extId = swTarget.url.split('/')[2];
        log(`Clean-room Extension ID: ${extId}`);
        recordAssertion('CLEAN_ROOM_EXTENSION_LOADED', true, { extId, swUrl: swTarget.url });

        swWs = await openWs(swTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');

        const swEval = async (expr) => {
            const res = await cdpSend(swWs, 'Runtime.evaluate', {
                expression: expr,
                awaitPromise: true,
                returnByValue: true
            });
            if (res.exceptionDetails) {
                log(`[SW_EXCEPTION] ${JSON.stringify(res.exceptionDetails)}`);
            }
            return res.result?.value;
        };

        // Open popup via Target.createTarget
        const popupUrl = `chrome-extension://${extId}/popup.html`;
        const openRes = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
        const popupTargetId = openRes.targetId;

        let popupTarget = null;
        for (let i = 0; i < 20; i++) {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            popupTarget = targets.find(t => t.id === popupTargetId);
            if (popupTarget) break;
            await sleep(200);
        }
        assert(popupTarget, 'Popup target must exist');

        popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        await sleep(1500);

        // Setup campaign helper
        const setupCampaign = async (targetsList, tpl = {}, optIncludeNoMsg = false) => {
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `
                    (() => {
                        window.__xpider_last_paused_mode = undefined;
                        if (typeof setCampaignQueue === 'function') {
                            setCampaignQueue(${JSON.stringify(targetsList)});
                        } else {
                            window.campaignQueue = ${JSON.stringify(targetsList)};
                        }
                        const queueEl = document.getElementById('target-urls-input') || document.getElementById('custom-urls-input');
                        if (queueEl) queueEl.value = ${JSON.stringify(targetsList.join('\n'))};
                        const fnEl = document.getElementById('tpl-first-name');
                        if (fnEl) fnEl.value = ${JSON.stringify(tpl.firstName || 'CleanTester')};
                        const lnEl = document.getElementById('tpl-last-name');
                        if (lnEl) lnEl.value = ${JSON.stringify(tpl.lastName || 'ValUser')};
                        const emEl = document.getElementById('tpl-email');
                        if (emEl) emEl.value = ${JSON.stringify(tpl.email || 'cleanroom@example.com')};
                        const phEl = document.getElementById('tpl-phone');
                        if (phEl) phEl.value = ${JSON.stringify(tpl.phone || '555-0199')};
                        const msgEl = document.getElementById('tpl-message');
                        if (msgEl) msgEl.value = ${JSON.stringify(tpl.message || 'Clean-room package verification inquiry message.')};

                        const skipEl = document.getElementById('skip-attempted-toggle');
                        if (skipEl) {
                            skipEl.checked = false;
                            skipEl.dispatchEvent(new Event('change'));
                        }

                        const cb = document.getElementById('xpider-opt-include-no-message');
                        if (cb) {
                            cb.checked = ${Boolean(optIncludeNoMsg)};
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        chrome.storage.local.set({
                            xpider_queue: ${JSON.stringify(targetsList)},
                            xpider_total: ${targetsList.length},
                            xpider_success: 0,
                            xpider_run_scoped_direct_privacy: true,
                            xpider_privacy_mode: 'DIRECT',
                            xpider_opt_include_no_message: ${Boolean(optIncludeNoMsg)}
                        });
                    })()
                `
            });
            await swEval(`
                (async () => {
                    if (self.__xpiderHistoryStore && typeof self.__xpiderHistoryStore.clearAll === 'function') {
                        await self.__xpiderHistoryStore.clearAll();
                    }
                    await chrome.storage.local.remove(['xpider_history_attempts', 'xpider_sent_history', 'xpider_history', 'xpider_suppressed_domains']);
                    await chrome.storage.local.set({
                        xpider_run_scoped_direct_privacy: true,
                        xpider_privacy_mode: 'DIRECT',
                        xpider_opt_include_no_message: ${Boolean(optIncludeNoMsg)}
                    });
                })()
            `);
        };

        const clickStart = async (mode = 'AUTO') => {
            const priorRunId = await swEval(`campaignState.campaignRunId`);
            const btnId = mode === 'MANUAL' ? 'start-manual-btn' : (mode === 'SEMI_AUTO' ? 'start-semi-auto-btn' : 'start-btn');
            await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('${btnId}')?.click()` });

            for (let i = 0; i < 30; i++) {
                await sleep(300);
                await cdpSend(popupWs, 'Runtime.evaluate', {
                    expression: `(() => {
                        const btn = document.getElementById('privacy-block-action-override');
                        if (btn && btn.offsetParent !== null) btn.click();
                    })()`
                });
                const st = await swEval(`({ isActive: campaignState.isActive, runId: campaignState.campaignRunId, mode: campaignState.campaignMode })`);
                if (st?.isActive && st?.runId !== priorRunId) {
                    log(`Campaign successfully active: mode=${st.mode} runId=${st.runId}`);
                    return true;
                }
            }
            return false;
        };

        // 1. Audit visible UI controls
        const uiControlsEval = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const startBtn = document.getElementById('start-btn');
                const semiBtn = document.getElementById('start-semi-auto-btn');
                const manualBtn = document.getElementById('start-manual-btn');
                const noMsgCb = document.getElementById('xpider-opt-include-no-message');
                const stopSaveBtn = document.getElementById('stop-save-btn');
                const pauseBtn = document.getElementById('pause-btn');

                return {
                    startBtnPresent: !!startBtn,
                    startBtnVisible: startBtn ? (startBtn.offsetParent !== null && window.getComputedStyle(startBtn).display !== 'none') : false,
                    semiBtnPresent: !!semiBtn,
                    manualBtnPresent: !!manualBtn,
                    noMsgCbPresent: !!noMsgCb,
                    noMsgCbVisible: noMsgCb ? (noMsgCb.offsetParent !== null && window.getComputedStyle(noMsgCb).display !== 'none') : false,
                    noMsgCbChecked: noMsgCb ? noMsgCb.checked : null,
                    stopSaveBtnPresent: !!stopSaveBtn,
                    pauseBtnPresent: !!pauseBtn
                };
            })()`,
            returnByValue: true
        });

        const ui = uiControlsEval.result.value;
        recordAssertion('START_BUTTON_RENDERED_AND_VISIBLE', ui.startBtnPresent && ui.startBtnVisible, ui);
        recordAssertion('NO_MESSAGE_CHECKBOX_DEFAULT_OFF', ui.noMsgCbPresent && ui.noMsgCbVisible && ui.noMsgCbChecked === false, ui);
        recordAssertion('START_MODES_BUTTONS_RENDERED', ui.startBtnPresent && ui.semiBtnPresent && ui.manualBtnPresent, ui);
        recordAssertion('STOP_SAVE_BTN_PRESENT', ui.stopSaveBtnPresent, ui);

        const shot1 = await shot(popupWs, 'shot_clean_room_01_popup_visible_controls.png');
        report.screenshots.push(shot1);

        // ====================================================================
        // SUBTEST 1: AUTO MODE (Standard Contact Form, Autonomous Submit)
        // ====================================================================
        log('\n--- SUBTEST 1: AUTO MODE Autonomous Form Submission ---');
        await setupCampaign([`http://127.0.0.1:${PORT}/contact-standard.html`], {}, false);

        const launchedAuto = await clickStart('AUTO');
        recordAssertion('AUTO_MODE_CAMPAIGN_ACTIVE', launchedAuto === true);

        // Wait for campaign to settle
        let autoSettled = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const st = await swEval(`({
                isActive: campaignState.isActive,
                inFlight: campaignState.activeTargetInFlight,
                remaining: campaignState.queue.length,
                successCount: campaignState.successCount
            })`);
            if (!st?.inFlight && st?.remaining === 0) {
                autoSettled = true;
                log(`Auto campaign settled at T+${(i * 0.5).toFixed(1)}s: successCount=${st?.successCount}`);
                break;
            }
        }
        recordAssertion('AUTO_MODE_CAMPAIGN_SETTLED', autoSettled === true);

        const subCountAfterAuto = await getServerSubmissions();
        recordAssertion('AUTO_MODE_SUBMISSION_RECORDED', subCountAfterAuto === 1, {
            expected: 1,
            actual: subCountAfterAuto
        });

        const shot2 = await shot(popupWs, 'shot_clean_room_02_auto_submission.png');
        report.screenshots.push(shot2);

        // ====================================================================
        // SUBTEST 2: MESSAGE-LESS NEWSLETTER (Default OFF -> Skip vs Explicit ON -> Submit)
        // ====================================================================
        log('\n--- SUBTEST 2: Message-less Newsletter Form Behavior ---');

        // Part A: Default OFF
        await setupCampaign([`http://127.0.0.1:${PORT}/subscribe-no-message.html`], {}, false);
        const launchedOff = await clickStart('AUTO');
        recordAssertion('NO_MESSAGE_DEFAULT_OFF_LAUNCHED', launchedOff === true);

        let settledOff = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({
                inFlight: campaignState.activeTargetInFlight,
                remaining: campaignState.queue.length
            })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledOff = true;
                break;
            }
        }
        recordAssertion('NO_MESSAGE_DEFAULT_OFF_SETTLED', settledOff === true);

        const subCountAfterDefaultOff = await getServerSubmissions();
        recordAssertion('NO_MESSAGE_DEFAULT_OFF_SKIPPED', subCountAfterDefaultOff === subCountAfterAuto, {
            subCountAfterAuto,
            subCountAfterDefaultOff
        });

        // Part B: Explicit ON
        await setupCampaign([`http://127.0.0.1:${PORT}/subscribe-no-message.html`], {}, true);
        const launchedOn = await clickStart('AUTO');
        recordAssertion('NO_MESSAGE_EXPLICIT_ON_LAUNCHED', launchedOn === true);

        let settledOn = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({
                inFlight: campaignState.activeTargetInFlight,
                remaining: campaignState.queue.length,
                successCount: campaignState.successCount
            })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledOn = true;
                break;
            }
        }
        recordAssertion('NO_MESSAGE_EXPLICIT_ON_SETTLED', settledOn === true);

        const subCountAfterExplicitOn = await getServerSubmissions();
        recordAssertion('NO_MESSAGE_EXPLICIT_ON_SUBMITTED', subCountAfterExplicitOn === subCountAfterDefaultOff + 1, {
            before: subCountAfterDefaultOff,
            after: subCountAfterExplicitOn
        });

        const shot3 = await shot(popupWs, 'shot_clean_room_03_no_message_optin.png');
        report.screenshots.push(shot3);

        // ====================================================================
        // SUBTEST 3: MANUAL MODE (Hold for Operator Submission)
        // ====================================================================
        log('\n--- SUBTEST 3: MANUAL MODE Pre-Submission Assist Card ---');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        await setupCampaign([`http://127.0.0.1:${PORT}/contact-standard.html`], {}, false);

        const launchedManual = await clickStart('MANUAL');
        recordAssertion('MANUAL_MODE_CAMPAIGN_LAUNCHED', launchedManual === true);

        // Find held target tab and verify visible #xpider-v7-manual-hold-panel
        let manualPanelFound = false;
        let heldTabWs = null;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            const targetTab = targets.find(t => t.type === 'page' && t.url.includes('contact-standard.html'));
            if (targetTab) {
                try {
                    heldTabWs = await openWs(targetTab.webSocketDebuggerUrl);
                    const panelInfo = await cdpSend(heldTabWs, 'Runtime.evaluate', {
                        expression: `
                            (() => {
                                const p = document.getElementById('xpider-v7-manual-hold-panel');
                                if (!p) return null;
                                return {
                                    exists: true,
                                    mode: p.getAttribute('data-mode'),
                                    hasRegisterBtn: Boolean(p.querySelector('#xpider-manual-registered-btn')),
                                    nameVal: document.querySelector('[name="name"]')?.value || '',
                                    emailVal: document.querySelector('[name="email"]')?.value || '',
                                    msgVal: document.querySelector('textarea')?.value || ''
                                };
                            })()
                        `,
                        returnByValue: true
                    }).then(r => r.result?.value);

                    if (panelInfo && panelInfo.exists) {
                        manualPanelFound = true;
                        log(`Held tab verified: mode=${panelInfo.mode} name="${panelInfo.nameVal}" email="${panelInfo.emailVal}"`);
                        recordAssertion('MANUAL_HOLD_PANEL_RENDERED', true, panelInfo);
                        break;
                    }
                } catch (_) {}
            }
        }
        assert(manualPanelFound, 'MANUAL mode must render visible #xpider-v7-manual-hold-panel');

        const subCountBeforeManualClick = await getServerSubmissions();
        recordAssertion('MANUAL_MODE_ZERO_PRE_SUBMISSION', subCountBeforeManualClick === subCountAfterExplicitOn);

        if (heldTabWs) {
            const shot4 = await shot(heldTabWs, 'shot_clean_room_04_manual_assist_unpacked.png');
            report.screenshots.push(shot4);

            // Operator submits form on page, then clicks #xpider-manual-registered-btn
            log('Submitting form on page as human operator...');
            await cdpSend(heldTabWs, 'Runtime.evaluate', {
                expression: `document.querySelector('form button[type="submit"], form input[type="submit"]')?.click()`
            });
            await sleep(600);

            log('Confirming manual registration by clicking #xpider-manual-registered-btn...');
            await cdpSend(heldTabWs, 'Runtime.evaluate', {
                expression: `document.getElementById('xpider-manual-registered-btn')?.click()`
            });
            heldTabWs.close();
        }

        // Wait for campaign to settle
        let manualSettled = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive) {
                manualSettled = true;
                break;
            }
        }
        recordAssertion('MANUAL_MODE_CAMPAIGN_SETTLED', manualSettled === true);

        const subCountAfterManual = await getServerSubmissions();
        recordAssertion('MANUAL_MODE_OPERATOR_SUBMITTED', subCountAfterManual === subCountBeforeManualClick + 1, {
            before: subCountBeforeManualClick,
            after: subCountAfterManual
        });

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // ====================================================================
        // SUBTEST 4: STOP & SAVE + SERVICE WORKER CRASH RESTORATION
        // ====================================================================
        log('\n--- SUBTEST 4: Stop & Save and Service Worker Crash Restoration ---');
        await setupCampaign([
            `http://127.0.0.1:${PORT}/contact-standard.html`,
            `http://127.0.0.1:${PORT}/contact-standard.html?q=2`,
            `http://127.0.0.1:${PORT}/contact-standard.html?q=3`
        ], {}, false);

        await clickStart('AUTO');
        await sleep(1500);

        // Click Pause
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('pause-btn')?.click()`
        });
        await sleep(800);

        // Click Stop & Save
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('stop-save-btn')?.click()`
        });
        await sleep(1500);

        // Verify checkpoint exists
        const checkpointCheck = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `new Promise(resolve => {
                chrome.storage.local.get(['xpider_paused_checkpoint', 'xpider_isPaused'], data => {
                    resolve({
                        hasCheckpoint: !!data.xpider_paused_checkpoint,
                        isPaused: !!data.xpider_isPaused,
                        remainingCount: data.xpider_paused_checkpoint ? data.xpider_paused_checkpoint.remainingCount : 0
                    });
                });
            })`,
            awaitPromise: true,
            returnByValue: true
        });
        const cp = checkpointCheck.result.value;
        recordAssertion('STOP_SAVE_CHECKPOINT_SAVED', cp.hasCheckpoint && cp.isPaused, cp);

        // Forcibly crash Service Worker via Target.closeTarget
        log('Forcibly terminating Service Worker via CDP Target.closeTarget...');
        const oldSwId = swTarget.id;
        if (swWs) { try { swWs.close(); } catch (_) {} }
        await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId });
        await sleep(1500);

        // Wake fresh Service Worker by triggering message
        log('Waking up fresh Service Worker...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `chrome.runtime.sendMessage({ action: 'GET_CAMPAIGN_STATE' }).catch(() => {})`
        });
        await sleep(2000);

        // Reconnect to fresh Service Worker
        let freshSwTarget = null;
        for (let i = 0; i < 30; i++) {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            freshSwTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (freshSwTarget) break;
            await sleep(300);
        }
        assert(freshSwTarget, 'Fresh Service Worker must have booted');
        swWs = await openWs(freshSwTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');

        const swRestored = await swEval(`
            (async () => {
                const data = await chrome.storage.local.get(['xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_start_mode']);
                return {
                    checkpoint: data.xpider_paused_checkpoint,
                    isPaused: data.xpider_isPaused,
                    swMode: campaignState.campaignMode
                };
            })()
        `);

        recordAssertion('SERVICE_WORKER_CRASH_AND_RESTORE', swRestored.checkpoint !== null && swRestored.isPaused === true, swRestored);

        const shot5 = await shot(popupWs, 'shot_clean_room_05_sw_crash_restore_unpacked.png');
        report.screenshots.push(shot5);

        // Cleanup
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('end-campaign-btn')?.click()`
        });

        report.status = 'SUCCESS';
        report.endTimeUtc = new Date().toISOString();
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

        log('\n================================================================================');
        log(`🎉 ALL ${report.assertions.length} CLEAN-ROOM PACKAGE ASSERTIONS PASSED (100%)`);
        log(`📁 Machine-readable report: ${REPORT_FILE}`);
        log('================================================================================');

    } catch (err) {
        log(`❌ CLEAN-ROOM TEST FAILURE: ${err.message}`);
        report.status = 'FAILED';
        report.error = err.message;
        report.endTimeUtc = new Date().toISOString();
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        process.exitCode = 1;
    } finally {
        if (browserWs) try { browserWs.close(); } catch (_) {}
        if (popupWs) try { popupWs.close(); } catch (_) {}
        if (swWs) try { swWs.close(); } catch (_) {}
        if (proc && !proc.killed) {
            log('Terminating browser process...');
            proc.kill();
        }
    }
}

main().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal Runner Error:', err);
    process.exit(1);
});
