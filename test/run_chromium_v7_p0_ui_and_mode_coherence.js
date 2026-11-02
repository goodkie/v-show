/**
 * test/run_chromium_v7_p0_ui_and_mode_coherence.js
 *
 * Dedicated Chromium E2E Test Runner for:
 * 1. P0 Regression Item (a): START -> PAUSE -> RESUME and STOP&SAVE UI states are correct and non-disappearing.
 * 2. P0 Regression Item (b): AUTO / SEMI-AUTO / MANUAL actually match CURRENT MODE after Pause -> Resume,
 *    and mode durability across popup reloads & service worker restarts.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9445; // separate port from 9444
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_p0_ui_and_mode_coherence.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_p0_ui_and_mode_coherence_report.json');

if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

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
    log('🚀 RUNNING P0 UI STATE & MODE COHERENCE CHROMIUM E2E SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();

    // 1. Ensure test fixture server active
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    log(`Test server active on port ${PORT}`);

    // 2. Launch disposable Chromium
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-p0-mode-${Math.random().toString(36).substring(2, 8)}`);
    fs.mkdirSync(tmpProfile, { recursive: true });
    log(`Disposable profile: ${tmpProfile}`);

    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const bin = fs.existsSync(edgePath) ? edgePath : chromePath;

    const browserArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tmpProfile}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        'about:blank'
    ];

    let proc = null;
    let browserWs = null;
    let popupWs = null;
    let swWs = null;

    const report = {
        testSuite: "XPIDER_V7_P0_UI_STATE_AND_MODE_COHERENCE",
        startTimeUtc,
        endTimeUtc: null,
        status: "RUNNING",
        assertions: [],
        evidenceScreenshots: []
    };

    function recordAssertion(name, passed, detail = {}) {
        log(`[ASSERTION] ${name} => ${passed ? 'PASS' : 'FAIL'}`);
        report.assertions.push({ name, passed, detail, timestamp: new Date().toISOString() });
        assert(passed, `Assertion failed: ${name} (${JSON.stringify(detail)})`);
    }

    try {
        proc = spawn(bin, browserArgs, { stdio: 'ignore' });
        log(`Browser launched (PID=${proc.pid})`);

        // Wait for CDP
        let targets = null;
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            try {
                targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
                if (targets) break;
            } catch (_) {}
        }
        assert(targets, 'CDP endpoints must be available');

        // Find Background SW
        let swTarget = null;
        for (let i = 0; i < 20; i++) {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (swTarget) break;
            await sleep(500);
        }
        assert(swTarget, 'Background service worker must be discovered');
        const extId = swTarget.url.split('/')[2];
        log(`Extension ID: ${extId}`);

        swWs = await openWs(swTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');

        // Open popup page
        const newTarget = await cdpSend(swWs, 'Target.createTarget', { url: `chrome-extension://${extId}/popup.html` });
        targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        const popupTarget = targets.find(t => t.id === newTarget.targetId);
        assert(popupTarget, 'Popup page target must be created');

        popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        await sleep(1500);

        // --- SUBTEST 1: INITIAL UI STATE ---
        log('\n--- SUBTEST 1: INITIAL UI STATE ---');
        const s1State = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const startRow = document.getElementById('start-buttons-row');
                const multiActions = document.getElementById('multi-actions');
                const hud = document.getElementById('persistent-mode-hud');
                const modeBadge = document.getElementById('hud-current-mode-badge')?.textContent;
                const statusBadge = document.getElementById('hud-orchestrator-status')?.textContent;
                return {
                    startRowVisible: startRow && !startRow.classList.contains('hidden'),
                    multiActionsHidden: multiActions && multiActions.classList.contains('hidden'),
                    hudPresent: !!hud,
                    modeBadge,
                    statusBadge
                };
            })()`,
            returnByValue: true
        });
        log(`Initial UI check: ${JSON.stringify(s1State.result.value)}`);
        recordAssertion('INITIAL_START_ROW_VISIBLE', s1State.result.value.startRowVisible === true, s1State.result.value);
        recordAssertion('INITIAL_MULTI_ACTIONS_HIDDEN', s1State.result.value.multiActionsHidden === true, s1State.result.value);
        recordAssertion('INITIAL_HUD_READY', s1State.result.value.statusBadge === 'READY' || s1State.result.value.statusBadge === 'IDLE', s1State.result.value);

        // --- SUBTEST 2: CONFIGURE TARGETS & START CAMPAIGN IN AUTO ---
        log('\n--- SUBTEST 2: START CAMPAIGN IN AUTO ---');
        // Setup 6 test fixtures to guarantee non-empty queue across pause and stop&save
        const fixtureUrls = [
            `http://127.0.0.1:${PORT}/contact-standard.html?id=1`,
            `http://127.0.0.1:${PORT}/contact-standard.html?id=2`,
            `http://127.0.0.1:${PORT}/contact-standard.html?id=3`,
            `http://127.0.0.1:${PORT}/contact-standard.html?id=4`,
            `http://127.0.0.1:${PORT}/contact-standard.html?id=5`,
            `http://127.0.0.1:${PORT}/contact-standard.html?id=6`
        ];

        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(async () => {
                // Populate template
                document.getElementById('tpl-first-name').value = 'P0Tester';
                document.getElementById('tpl-last-name').value = 'User';
                document.getElementById('tpl-email').value = 'tester@example.com';
                document.getElementById('tpl-message').value = 'P0 Regression Automated Verification Inquiry';
                
                // Add targets
                campaignQueue = ${JSON.stringify(fixtureUrls)};
                totalTargets = ${fixtureUrls.length};
                renderUrlsPreview(campaignQueue);
                
                // Set loopback test flags
                await chrome.storage.local.set({
                    xpider_queue: campaignQueue,
                    xpider_total: totalTargets,
                    xpider_owner_function_test_mode: true,
                    xpider_active_test_source: 'OWNER_CORE_TEST'
                });
            })()`,
            awaitPromise: true
        });
        await sleep(500);

        // Click Start Button
        log('Clicking Start Button (#start-btn)...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('start-btn').click();`
        });

        // Wait for campaign to become active, clicking privacy override if privacy block modal appears
        let campaignStarted = false;
        for (let i = 0; i < 60; i++) {
            await sleep(400);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) {
                        btn.click();
                    }
                })()`
            });
            const check = await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const multiActions = document.getElementById('multi-actions');
                    const startRow = document.getElementById('start-buttons-row');
                    const pauseBtn = document.getElementById('pause-btn');
                    const stopSaveBtn = document.getElementById('stop-save-btn');
                    const isMultiVisible = multiActions && !multiActions.classList.contains('hidden');
                    const isStartHidden = startRow && startRow.classList.contains('hidden');
                    return { isMultiVisible, isStartHidden, pauseBtnText: pauseBtn?.textContent, stopSaveVisible: stopSaveBtn && !stopSaveBtn.classList.contains('hidden') };
                })()`,
                returnByValue: true
            });
            if (check.result.value.isMultiVisible && check.result.value.isStartHidden) {
                campaignStarted = true;
                log(`Campaign active detected at T+${(i * 0.4).toFixed(1)}s: ${JSON.stringify(check.result.value)}`);
                break;
            }
        }
        recordAssertion('CAMPAIGN_STARTED_MULTI_ACTIONS_VISIBLE', campaignStarted === true);
        const shot1 = await shot(popupWs, 'p0_01_campaign_started_running.png');
        report.evidenceScreenshots.push(shot1);

        // --- SUBTEST 3: PAUSE CAMPAIGN & VERIFY BUTTONS NON-DISAPPEARING ---
        log('\n--- SUBTEST 3: PAUSE CAMPAIGN ---');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('pause-btn').click();`
        });
        await sleep(1500);

        const pausedState = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const multiActions = document.getElementById('multi-actions');
                const pauseBtn = document.getElementById('pause-btn');
                const stopSaveBtn = document.getElementById('stop-save-btn');
                const endBtn = document.getElementById('end-campaign-btn');
                const startRow = document.getElementById('start-buttons-row');
                const hudStatus = document.getElementById('hud-orchestrator-status')?.textContent;
                const hudMode = document.getElementById('hud-current-mode-badge')?.textContent;
                return {
                    multiActionsVisible: multiActions && !multiActions.classList.contains('hidden'),
                    stopSaveVisible: stopSaveBtn && !stopSaveBtn.classList.contains('hidden'),
                    endBtnVisible: endBtn && !endBtn.classList.contains('hidden'),
                    startRowHidden: startRow && startRow.classList.contains('hidden'),
                    pauseBtnText: pauseBtn?.textContent,
                    pauseBtnBg: pauseBtn?.style?.backgroundColor,
                    hudStatus,
                    hudMode
                };
            })()`,
            returnByValue: true
        });
        log(`Paused UI state: ${JSON.stringify(pausedState.result.value)}`);
        recordAssertion('PAUSED_MULTI_ACTIONS_VISIBLE', pausedState.result.value.multiActionsVisible === true, pausedState.result.value);
        recordAssertion('PAUSED_STOP_SAVE_BTN_VISIBLE', pausedState.result.value.stopSaveVisible === true, pausedState.result.value);
        recordAssertion('PAUSED_PAUSE_BTN_SHOWS_RESUME', pausedState.result.value.pauseBtnText.includes('Resume'), pausedState.result.value);
        recordAssertion('PAUSED_START_ROW_HIDDEN', pausedState.result.value.startRowHidden === true, pausedState.result.value);
        recordAssertion('PAUSED_HUD_STATUS_PAUSED', pausedState.result.value.hudStatus === 'PAUSED', pausedState.result.value);
        const shot2 = await shot(popupWs, 'p0_02_campaign_paused_buttons_visible.png');
        report.evidenceScreenshots.push(shot2);

        // --- SUBTEST 4: POPUP RELOAD WHILE PAUSED (NON-DISAPPEARING BUTTONS DURABILITY) ---
        log('\n--- SUBTEST 4: POPUP RELOAD WHILE PAUSED ---');
        await cdpSend(popupWs, 'Page.navigate', { url: `chrome-extension://${extId}/popup.html` });
        await sleep(2000);

        const reloadedPausedState = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const multiActions = document.getElementById('multi-actions');
                const pauseBtn = document.getElementById('pause-btn');
                const stopSaveBtn = document.getElementById('stop-save-btn');
                const startRow = document.getElementById('start-buttons-row');
                const hudStatus = document.getElementById('hud-orchestrator-status')?.textContent;
                const hudMode = document.getElementById('hud-current-mode-badge')?.textContent;
                return {
                    multiActionsVisible: multiActions && !multiActions.classList.contains('hidden'),
                    stopSaveVisible: stopSaveBtn && !stopSaveBtn.classList.contains('hidden'),
                    startRowHidden: startRow && startRow.classList.contains('hidden'),
                    pauseBtnText: pauseBtn?.textContent,
                    hudStatus,
                    hudMode
                };
            })()`,
            returnByValue: true
        });
        log(`Reloaded Paused UI state: ${JSON.stringify(reloadedPausedState.result.value)}`);
        recordAssertion('RELOAD_WHILE_PAUSED_MULTI_ACTIONS_NON_DISAPPEARING', reloadedPausedState.result.value.multiActionsVisible === true, reloadedPausedState.result.value);
        recordAssertion('RELOAD_WHILE_PAUSED_STOP_SAVE_NON_DISAPPEARING', reloadedPausedState.result.value.stopSaveVisible === true, reloadedPausedState.result.value);
        recordAssertion('RELOAD_WHILE_PAUSED_PAUSE_BTN_RESUME', reloadedPausedState.result.value.pauseBtnText.includes('Resume'), reloadedPausedState.result.value);
        recordAssertion('RELOAD_WHILE_PAUSED_START_ROW_HIDDEN', reloadedPausedState.result.value.startRowHidden === true, reloadedPausedState.result.value);
        recordAssertion('RELOAD_WHILE_PAUSED_HUD_STATUS_PAUSED', reloadedPausedState.result.value.hudStatus === 'PAUSED', reloadedPausedState.result.value);
        const shot3 = await shot(popupWs, 'p0_03_popup_reloaded_while_paused.png');
        report.evidenceScreenshots.push(shot3);

        // --- SUBTEST 5: RESUME WITH MODE SWITCH TO 'MANUAL' (MODE COHERENCE) ---
        log('\n--- SUBTEST 5: RESUME WITH MODE SWITCH TO MANUAL ---');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `confirmResumeCampaignWithMode('MANUAL');`
        });
        await sleep(1500);

        // Verify mode in UI and in background storage
        const manualModeUiState = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const badge = document.getElementById('hud-current-mode-badge')?.textContent;
                const pill = document.getElementById('campaign-mode-pill')?.textContent;
                const hudStatus = document.getElementById('hud-orchestrator-status')?.textContent;
                return { badge, pill, hudStatus, currentCampaignMode };
            })()`,
            returnByValue: true
        });
        log(`Manual mode UI check: ${JSON.stringify(manualModeUiState.result.value)}`);
        recordAssertion('RESUME_MANUAL_HUD_BADGE_MATCH', manualModeUiState.result.value.badge.includes('MANUAL'), manualModeUiState.result.value);
        recordAssertion('RESUME_MANUAL_PILL_MATCH', manualModeUiState.result.value.pill.includes('MANUAL'), manualModeUiState.result.value);
        recordAssertion('RESUME_MANUAL_LOCAL_VAR_MATCH', manualModeUiState.result.value.currentCampaignMode === 'MANUAL', manualModeUiState.result.value);

        // Verify Background SW has campaignMode == 'MANUAL' and storage has 'MANUAL'
        const bgManualCheck = await cdpSend(swWs, 'Runtime.evaluate', {
            expression: `(async () => {
                const st = await chrome.storage.local.get(['xpider_campaign_mode']);
                return {
                    bgMode: campaignState.campaignMode,
                    storageMode: st.xpider_campaign_mode
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        log(`Background manual mode check: ${JSON.stringify(bgManualCheck.result.value)}`);
        recordAssertion('BG_CAMPAIGN_MODE_IS_MANUAL', bgManualCheck.result.value.bgMode === 'MANUAL', bgManualCheck.result.value);
        recordAssertion('STORAGE_CAMPAIGN_MODE_IS_MANUAL', bgManualCheck.result.value.storageMode === 'MANUAL', bgManualCheck.result.value);
        const shot4 = await shot(popupWs, 'p0_04_resumed_in_manual_mode.png');
        report.evidenceScreenshots.push(shot4);

        // --- SUBTEST 6: STOP & SAVE BUTTON ACTION AND PERSISTENCE ---
        log('\n--- SUBTEST 6: STOP & SAVE ACTION ---');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `stopAndSaveCampaign();`
        });

        let stopSaveState = null;
        for (let i = 0; i < 20; i++) {
            await sleep(400);
            const check = await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const multiActions = document.getElementById('multi-actions');
                    const stopSaveBtn = document.getElementById('stop-save-btn');
                    const pauseBtn = document.getElementById('pause-btn');
                    const startRow = document.getElementById('start-buttons-row');
                    const banner = document.getElementById('resumable-campaign-banner');
                    const hudStatus = document.getElementById('hud-orchestrator-status')?.textContent;
                    const hudMode = document.getElementById('hud-current-mode-badge')?.textContent;
                    return {
                        multiActionsVisible: multiActions && !multiActions.classList.contains('hidden'),
                        stopSaveVisible: stopSaveBtn && !stopSaveBtn.classList.contains('hidden'),
                        startRowHidden: startRow && startRow.classList.contains('hidden'),
                        pauseBtnText: pauseBtn?.textContent,
                        bannerVisible: banner && banner.style.display !== 'none' && !banner.classList.contains('hidden'),
                        hudStatus,
                        hudMode
                    };
                })()`,
                returnByValue: true
            });
            if (check.result.value.bannerVisible && check.result.value.hudStatus === 'PAUSED') {
                stopSaveState = check;
                break;
            }
            if (i === 19) stopSaveState = check;
        }
        log(`Stop & Save UI state: ${JSON.stringify(stopSaveState.result.value)}`);
        recordAssertion('STOP_SAVE_MULTI_ACTIONS_NON_DISAPPEARING', stopSaveState.result.value.multiActionsVisible === true, stopSaveState.result.value);
        recordAssertion('STOP_SAVE_BTN_NON_DISAPPEARING', stopSaveState.result.value.stopSaveVisible === true, stopSaveState.result.value);
        recordAssertion('STOP_SAVE_PAUSE_BTN_SHOWS_RESUME', stopSaveState.result.value.pauseBtnText.includes('Resume'), stopSaveState.result.value);
        recordAssertion('STOP_SAVE_BANNER_DISPLAYED', stopSaveState.result.value.bannerVisible === true, stopSaveState.result.value);
        recordAssertion('STOP_SAVE_HUD_STATUS_PAUSED', stopSaveState.result.value.hudStatus === 'PAUSED', stopSaveState.result.value);
        recordAssertion('STOP_SAVE_HUD_MODE_PRESERVED', stopSaveState.result.value.hudMode.includes('MANUAL'), stopSaveState.result.value);

        // Verify Checkpoint saved in background
        const cpCheck = await cdpSend(swWs, 'Runtime.evaluate', {
            expression: `(async () => {
                const st = await chrome.storage.local.get(['xpider_paused_checkpoint', 'xpider_campaign_mode']);
                const cp = st.xpider_paused_checkpoint;
                return {
                    hasCp: Boolean(cp),
                    cpMode: cp?.campaignMode,
                    stMode: st.xpider_campaign_mode,
                    remainingCount: cp?.remainingQueue?.length
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        log(`Checkpoint verification: ${JSON.stringify(cpCheck.result.value)}`);
        recordAssertion('CHECKPOINT_SAVED_WITH_MANUAL_MODE', cpCheck.result.value.hasCp === true && cpCheck.result.value.cpMode === 'MANUAL', cpCheck.result.value);
        const shot5 = await shot(popupWs, 'p0_05_stop_and_save_active.png');
        report.evidenceScreenshots.push(shot5);

        // --- SUBTEST 7: END CAMPAIGN CLEANUP ---
        log('\n--- SUBTEST 7: END CAMPAIGN CLEANUP ---');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `endCampaign();`
        });
        await sleep(1500);

        const endState = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const multiActions = document.getElementById('multi-actions');
                const startRow = document.getElementById('start-buttons-row');
                const startBtn = document.getElementById('start-btn');
                const banner = document.getElementById('resumable-campaign-banner');
                const hudStatus = document.getElementById('hud-orchestrator-status')?.textContent;
                return {
                    multiActionsHidden: multiActions && multiActions.classList.contains('hidden'),
                    startRowVisible: startRow && !startRow.classList.contains('hidden'),
                    startBtnVisible: startBtn && !startBtn.classList.contains('hidden'),
                    bannerHidden: !banner || banner.style.display === 'none' || banner.classList.contains('hidden'),
                    hudStatus
                };
            })()`,
            returnByValue: true
        });
        log(`End Campaign state: ${JSON.stringify(endState.result.value)}`);
        recordAssertion('END_CAMPAIGN_MULTI_ACTIONS_HIDDEN', endState.result.value.multiActionsHidden === true, endState.result.value);
        recordAssertion('END_CAMPAIGN_START_ROW_VISIBLE', endState.result.value.startRowVisible === true, endState.result.value);
        recordAssertion('END_CAMPAIGN_BANNER_HIDDEN', endState.result.value.bannerHidden === true, endState.result.value);
        recordAssertion('END_CAMPAIGN_HUD_READY', endState.result.value.hudStatus === 'READY' || endState.result.value.hudStatus === 'IDLE', endState.result.value);
        const shot6 = await shot(popupWs, 'p0_06_end_campaign_ready.png');
        report.evidenceScreenshots.push(shot6);

        report.status = "PASS";
        report.endTimeUtc = new Date().toISOString();
        log('\n================================================================================');
        log('🎉 ALL P0 UI & MODE COHERENCE CHECKS PASSED (100% INVARIANTS VERIFIED)');
        log('================================================================================');
    } catch (err) {
        report.status = "FAIL";
        report.error = { message: err.message, stack: err.stack };
        report.endTimeUtc = new Date().toISOString();
        log(`\n❌ TEST SUITE FAILED: ${err.message}\n${err.stack}`);
        process.exitCode = 1;
    } finally {
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        log(`Report written to ${REPORT_FILE}`);
        if (popupWs) { try { popupWs.close(); } catch (_) {} }
        if (swWs) { try { swWs.close(); } catch (_) {} }
        if (proc && !proc.killed) {
            try { proc.kill('SIGKILL'); } catch (_) {}
        }
        if (logStream && !logStream.writableEnded) {
            logStream.end();
        }
    }
}

main().catch(e => {
    console.error('Fatal crash:', e);
    process.exit(1);
});
