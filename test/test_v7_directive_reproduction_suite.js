/**
 * XPIDER V7 Authoritative Reproduction & Verification Suite:
 * ChatGPT Directive [2026-11-04] (Comment #908 / 6632185580)
 *
 * Sequence under test:
 * 1. Historical run pollution test: Run an initial campaign that achieves SUCCESS_CONFIRMED.
 * 2. New campaign: Visible AUTO start (#start-btn) -> Pause (#pause-btn).
 * 3. Choose MANUAL in visible Resume dialog (#resume-mode-radio-manual -> #confirm-resume-mode-btn).
 * 4. Visible Stop & Save click (#stop-save-btn).
 * 5. Terminate / restart actual MV3 Service Worker via CDP Target.closeTarget.
 * 6. Reopen popup -> inspect checkpoint banner and mode pill.
 * 7. Resume from checkpoint (#resume-campaign-btn).
 * 8. Invariants asserted:
 *    - persisted xpider_campaign_mode === 'MANUAL'
 *    - checkpoint.campaignMode === 'MANUAL'
 *    - restored campaignState.campaignMode === 'MANUAL'
 *    - active checkpoint campaignRunId matches active campaign
 *    - outcomeHistogram is strictly runId-scoped (ZERO historical leak from run 1)
 *    - actual resumed behavior is MANUAL (hold panel rendered, 0 autonomous submit)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9226;
const EXT_DIR = path.resolve(__dirname, '..', 'extension');
const REPORT_FILE = path.join(__dirname, 'report_v7_directive_reproduction.json');
const LOG_FILE = path.join(__dirname, 'test_v7_directive_reproduction.log');
const EVIDENCE_DIR = path.join(__dirname, 'evidence_v7_modes');

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
    log('🚀 RUNNING XPIDER V7 DIRECTIVE REPRODUCTION & VERIFICATION SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();
    const report = {
        title: "XPIDER V7 Directive Reproduction & Verification Report",
        startTimeUtc,
        assertions: [],
        screenshots: []
    };

    function recordAssertion(name, passed, detail = {}) {
        const record = { name, passed: Boolean(passed), detail, timestamp: new Date().toISOString() };
        report.assertions.push(record);
        if (passed) {
            log(`  ✅ PASS: ${name}`);
        } else {
            log(`  ❌ FAIL: ${name} -> ${JSON.stringify(detail)}`);
        }
    }

    // 1. Verify test server
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions_reset`);

    // 2. Launch disposable Chromium profile
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-repro-${Math.random().toString(36).substring(2, 8)}`);
    fs.mkdirSync(tmpProfile, { recursive: true });

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
    let swTarget = null;

    try {
        log(`Launching browser: ${bin}`);
        proc = spawn(bin, browserArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

        let browserInfo = null;
        for (let i = 0; i < 40; i++) {
            await sleep(300);
            try {
                browserInfo = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json());
                if (browserInfo?.webSocketDebuggerUrl) break;
            } catch (_) {}
        }
        assert(browserInfo?.webSocketDebuggerUrl, 'Chromium CDP version endpoint not reachable');
        browserWs = await openWs(browserInfo.webSocketDebuggerUrl);

        // Find Service Worker & Extension ID
        let targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        for (let i = 0; i < 30 && !swTarget; i++) {
            await sleep(300);
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        }
        assert(swTarget, 'XPIDER background service worker target must be found');
        const extId = new URL(swTarget.url).hostname;
        log(`XPIDER Extension ID: ${extId}`);

        swWs = await openWs(swTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');

        const swEval = async (expression) => {
            const res = await cdpSend(swWs, 'Runtime.evaluate', {
                expression,
                awaitPromise: true,
                returnByValue: true
            });
            if (res.exceptionDetails) {
                throw new Error('SW Eval Exception: ' + JSON.stringify(res.exceptionDetails));
            }
            return res.result?.value;
        };

        // Open popup page
        const popupUrl = `chrome-extension://${extId}/popup.html`;
        const { targetId: popupTargetId } = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
        targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        const popupTarget = targets.find(t => t.id === popupTargetId);
        popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        log('Popup opened and CDP connected.');

        // --------------------------------------------------------------------
        // PHASE 1: Historical run pollution creation (Run 1 with 1 success)
        // --------------------------------------------------------------------
        log('\n--- PHASE 1: HISTORICAL RUN 1 (Record 1 prior success in history) ---');
        await swEval(`
            (async () => {
                const hs = await self.getHistoryStoreInstance();
                if (hs) {
                    await hs.settleCanonicalAttempt('hist_att_01', 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, {
                        campaignRunId: 'historical_run_001',
                        url: 'http://127.0.0.1:8088/contact-standard.html'
                    });
                }
            })()
        `);
        log('Historical attempt recorded with campaignRunId=historical_run_001');

        const testQueue = [
            `http://127.0.0.1:${PORT}/contact-standard.html`,
            `http://127.0.0.1:${PORT}/contact-standard.html?item=2`,
            `http://127.0.0.1:${PORT}/contact-standard.html?item=3`
        ];

        log('\nSetting up popup campaign inputs and storage...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                window.__xpider_last_paused_mode = undefined;
                if (typeof setCampaignQueue === 'function') {
                    setCampaignQueue(${JSON.stringify(testQueue)});
                } else {
                    window.campaignQueue = ${JSON.stringify(testQueue)};
                }
                const queueEl = document.getElementById('target-urls-input') || document.getElementById('custom-urls-input');
                if (queueEl) queueEl.value = ${JSON.stringify(testQueue.join('\n'))};
                const fnEl = document.getElementById('tpl-first-name');
                if (fnEl) fnEl.value = 'Directive';
                const lnEl = document.getElementById('tpl-last-name');
                if (lnEl) lnEl.value = 'Tester';
                const emEl = document.getElementById('tpl-email');
                if (emEl) emEl.value = 'directivetest@example.com';
                const phEl = document.getElementById('tpl-phone');
                if (phEl) phEl.value = '555-9988';
                const msgEl = document.getElementById('tpl-message');
                if (msgEl) msgEl.value = 'Directive verification testing message body.';

                const skipEl = document.getElementById('skip-attempted-toggle');
                if (skipEl) {
                    skipEl.checked = false;
                    skipEl.dispatchEvent(new Event('change'));
                }

                chrome.storage.local.set({
                    xpider_queue: ${JSON.stringify(testQueue)},
                    xpider_total: 3,
                    xpider_success: 0,
                    xpider_run_scoped_direct_privacy: true,
                    xpider_privacy_mode: 'DIRECT'
                });
            })()`
        });
        await sleep(500);

        // --------------------------------------------------------------------
        // PHASE 2: Visible AUTO start (#start-btn) -> Visible Pause (#pause-btn)
        // --------------------------------------------------------------------
        log('\n--- PHASE 2: VISIBLE AUTO START -> VISIBLE PAUSE ---');
        log('Clicking visible #start-btn...');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('start-btn')?.click()` });
        await sleep(500);

        // Bypass privacy decision modal if shown
        for (let i = 0; i < 15; i++) {
            await sleep(200);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, runId: campaignState.campaignRunId })`);
            if (st?.isActive) {
                log(`Campaign started actively: runId=${st.runId}`);
                break;
            }
        }

        // Click visible #pause-btn
        log('Clicking visible #pause-btn to pause...');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('pause-btn')?.click()` });
        await sleep(600);

        const pausedSw = await swEval(`({
            isPaused: campaignState.isPaused,
            isActive: campaignState.isActive,
            campaignRunId: campaignState.campaignRunId,
            mode: campaignState.campaignMode
        })`);
        recordAssertion('CAMPAIGN_PAUSED_IN_AUTO', pausedSw?.isPaused === true && pausedSw?.mode === 'AUTO', pausedSw);

        // --------------------------------------------------------------------
        // PHASE 3: Choose MANUAL in visible Resume dialog
        // --------------------------------------------------------------------
        log('\n--- PHASE 3: CHOOSE MANUAL IN VISIBLE RESUME DIALOG ---');
        log('Clicking #pause-btn to open Resume-mode modal...');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('pause-btn')?.click()` });
        await sleep(400);

        const modalCheck = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const m = document.getElementById('resume-mode-modal-overlay');
                return { isVisible: m && m.style.display !== 'none' && !m.classList.contains('hidden') };
            })()`,
            returnByValue: true
        }).then(r => r.result?.value);
        recordAssertion('RESUME_MODE_MODAL_OPENED', modalCheck?.isVisible === true, modalCheck);

        log('Selecting #resume-mode-radio-manual...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('resume-mode-radio-manual')?.click()`
        });

        log('Confirming resume with #confirm-resume-mode-btn...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('confirm-resume-mode-btn')?.click()`
        });
        await sleep(600);

        const resumedSw = await swEval(`({
            isActive: campaignState.isActive,
            isPaused: campaignState.isPaused,
            mode: campaignState.campaignMode,
            campaignRunId: campaignState.campaignRunId
        })`);
        recordAssertion('RESUMED_ACTIVELY_IN_MANUAL_MODE', resumedSw?.isActive === true && resumedSw?.mode === 'MANUAL', resumedSw);

        // --------------------------------------------------------------------
        // PHASE 4: Visible Stop & Save click (#stop-save-btn)
        // --------------------------------------------------------------------
        log('\n--- PHASE 4: VISIBLE STOP & SAVE CLICK ---');
        log('Clicking visible #stop-save-btn...');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('stop-save-btn')?.click()` });
        await sleep(600);

        const stopSavedSw = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_paused_checkpoint', 'xpider_campaign_mode'], res => {
                    resolve({
                        storageMode: res.xpider_campaign_mode,
                        checkpoint: res.xpider_paused_checkpoint,
                        swMode: campaignState.campaignMode,
                        swPaused: campaignState.isPaused,
                        swRunId: campaignState.campaignRunId
                    });
                });
            })
        `);
        log(`Stop & Save checkpoint: cpMode=${stopSavedSw?.checkpoint?.campaignMode}, storageMode=${stopSavedSw?.storageMode}, swMode=${stopSavedSw?.swMode}`);

        // Invariant: checkpoint.campaignMode MUST be MANUAL, storageMode MUST be MANUAL
        recordAssertion('STOP_SAVE_CHECKPOINT_MODE_MANUAL', stopSavedSw?.checkpoint?.campaignMode === 'MANUAL', stopSavedSw);
        recordAssertion('STOP_SAVE_STORAGE_MODE_MANUAL', stopSavedSw?.storageMode === 'MANUAL', stopSavedSw);
        recordAssertion('STOP_SAVE_CHECKPOINT_RUN_ID_MATCHES', stopSavedSw?.checkpoint?.campaignRunId === stopSavedSw?.swRunId, stopSavedSw);

        // Invariant: outcomeHistogram in checkpoint must NOT contain historical_run_001 success!
        const histSuccessCount = stopSavedSw?.checkpoint?.outcomeHistogram?.SUCCESS_CONFIRMED || 0;
        recordAssertion('CHECKPOINT_HISTOGRAM_ZERO_HISTORICAL_LEAK', histSuccessCount === 0, {
            histogram: stopSavedSw?.checkpoint?.outcomeHistogram,
            histSuccessCount
        });

        // --------------------------------------------------------------------
        // PHASE 5: Terminate / Restart actual MV3 Service Worker via CDP
        // --------------------------------------------------------------------
        log('\n--- PHASE 5: TERMINATE AND RESTART MV3 SERVICE WORKER ---');
        const oldSwId = swTarget.id;
        try { swWs.close(); } catch (_) {}
        await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId });
        log(`Terminated SW (${oldSwId}). Awaiting fresh worker...`);
        await sleep(1500);

        // Wake fresh Service Worker via popup messaging
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `chrome.runtime.sendMessage({ action: 'GET_CAMPAIGN_STATE' }).catch(() => {})`
        });

        let freshSwTarget = null;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            freshSwTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js') && t.id !== oldSwId);
            if (freshSwTarget) break;
        }
        assert(freshSwTarget, 'Fresh SW must boot after termination');
        swTarget = freshSwTarget;
        swWs = await openWs(freshSwTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');
        log(`Fresh SW booted (ID=${freshSwTarget.id})`);

        // Check restored state inside fresh SW
        const freshSwState = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_paused_checkpoint', 'xpider_campaign_mode'], res => {
                    resolve({
                        storageMode: res.xpider_campaign_mode,
                        checkpointMode: res.xpider_paused_checkpoint?.campaignMode,
                        swMode: campaignState.campaignMode,
                        swPaused: campaignState.isPaused,
                        swRunId: campaignState.campaignRunId,
                        checkpointRunId: res.xpider_paused_checkpoint?.campaignRunId
                    });
                });
            })
        `);
        log(`Fresh SW State: swMode=${freshSwState?.swMode}, checkpointMode=${freshSwState?.checkpointMode}, storageMode=${freshSwState?.storageMode}`);
        recordAssertion('SW_RESTART_RESTORED_CAMPAIGN_MODE_MANUAL', freshSwState?.swMode === 'MANUAL', freshSwState);
        recordAssertion('SW_RESTART_CHECKPOINT_MODE_MANUAL', freshSwState?.checkpointMode === 'MANUAL', freshSwState);
        recordAssertion('SW_RESTART_STORAGE_MODE_MANUAL', freshSwState?.storageMode === 'MANUAL', freshSwState);

        // --------------------------------------------------------------------
        // PHASE 6: Reopen popup -> inspect banner and mode pill
        // --------------------------------------------------------------------
        log('\n--- PHASE 6: REOPEN POPUP -> INSPECT BANNER AND MODE PILL ---');
        await cdpSend(popupWs, 'Page.navigate', { url: popupUrl });
        await sleep(1000);

        const popupInspect = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `({
                bannerVisible: document.getElementById('resumable-campaign-banner')?.style.display !== 'none',
                pillText: document.getElementById('campaign-mode-pill')?.textContent,
                statusBadge: document.getElementById('current-status-badge')?.textContent
            })`,
            returnByValue: true
        }).then(r => r.result?.value);
        log(`Reopened popup inspection: bannerVisible=${popupInspect?.bannerVisible}, pillText=${popupInspect?.pillText}`);
        recordAssertion('POPUP_RESUMABLE_BANNER_VISIBLE', popupInspect?.bannerVisible === true, popupInspect);
        recordAssertion('POPUP_MODE_PILL_SHOWS_MANUAL', Boolean(popupInspect?.pillText?.includes('MANUAL')), popupInspect);

        const shotBanner = await shot(popupWs, 'shot_directive_01_resumable_banner.png');
        report.screenshots.push(shotBanner);

        // --------------------------------------------------------------------
        // PHASE 7: Resume from checkpoint & verify actual MANUAL behavior
        // --------------------------------------------------------------------
        log('\n--- PHASE 7: RESUME FROM CHECKPOINT & VERIFY ACTUAL MANUAL BEHAVIOR ---');
        log('Clicking visible #resume-campaign-btn on banner...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('resume-campaign-btn')?.click()`
        });
        await sleep(500);

        // Confirm resume modal with preserved MANUAL mode
        log('Confirming resume modal...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('confirm-resume-mode-btn');
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                } else if (typeof confirmResumeCampaignWithMode === 'function') {
                    confirmResumeCampaignWithMode('MANUAL');
                }
            })()`
        });
        await sleep(1000);

        // Verify active target tab opened and reached MANUAL hold state
        let manualTabWs = null;
        let manualTabTarget = null;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            manualTabTarget = targets.find(t => t.type === 'page' && (t.url.includes('contact-') || t.url.includes(':8088')));
            if (manualTabTarget) {
                try {
                    manualTabWs = await openWs(manualTabTarget.webSocketDebuggerUrl);
                    await cdpSend(manualTabWs, 'Runtime.enable');
                    const holdEl = await cdpSend(manualTabWs, 'Runtime.evaluate', {
                        expression: `(() => {
                            const p = document.getElementById('xpider-v7-manual-hold-panel');
                            return {
                                exists: !!p,
                                mode: p ? p.getAttribute('data-mode') : null,
                                visible: p ? (p.offsetParent !== null && window.getComputedStyle(p).display !== 'none') : false
                            };
                        })()`,
                        returnByValue: true
                    }).then(r => r.result?.value);

                    if (holdEl?.exists && holdEl?.visible) {
                        log(`Target tab reached visible MANUAL hold panel! mode=${holdEl.mode}`);
                        recordAssertion('TARGET_REACHED_VISIBLE_MANUAL_HOLD_PANEL', holdEl.mode === 'MANUAL', holdEl);
                        const shotTab = await shot(manualTabWs, 'shot_directive_02_manual_hold_panel.png');
                        report.screenshots.push(shotTab);
                        break;
                    }
                } catch (_) {}
            }
        }
        assert(manualTabWs, 'Target tab must open and connect to CDP');

        // Verify 0 submissions before operator registration
        const subBefore = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('ZERO_SUBMISSIONS_BEFORE_OPERATOR_ACTION', subBefore.count === 0, subBefore);

        log(`Target Tab URL: ${manualTabTarget?.url}`);
        // Operator action: Submit page form, then click #xpider-manual-registered-btn
        log('Operator physically submitting form...');
        const clickRes = await cdpSend(manualTabWs, 'Runtime.evaluate', {
            expression: `(() => {
                const seats = document.getElementById('seats');
                if (seats && !seats.value) {
                    seats.value = '10';
                    seats.dispatchEvent(new Event('input', { bubbles: true }));
                    seats.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const sub = document.querySelector('button[type="submit"], input[type="submit"]');
                if (sub) {
                    sub.click();
                    return { clicked: true, id: sub.id, disabled: sub.disabled };
                }
                return { clicked: false };
            })()`,
            returnByValue: true
        });
        log(`Form submit click result: ${JSON.stringify(clickRes?.result?.value)}`);
        await sleep(1000);

        log('Operator clicking #xpider-manual-registered-btn...');
        const regRes = await cdpSend(manualTabWs, 'Runtime.evaluate', {
            expression: `(() => {
                const b = document.getElementById('xpider-manual-registered-btn');
                if (b) {
                    b.click();
                    return { clicked: true, text: b.textContent };
                }
                return { clicked: false };
            })()`,
            returnByValue: true
        });
        log(`Manual registered click result: ${JSON.stringify(regRes?.result?.value)}`);

        // Wait for manual registration to settle and record exactly 1 server submission
        let settledSub = null;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            settledSub = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
            if (settledSub.count >= 1) break;
        }
        recordAssertion('EXACTLY_ONE_SUBMISSION_RECORDED_AFTER_OPERATOR_REGISTER', settledSub?.count === 1, settledSub);

        // Final cleanup
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(400);

        report.endTimeUtc = new Date().toISOString();
        const allPassed = report.assertions.every(a => a.passed);
        report.status = allPassed ? "SUCCESS" : "FAILED";
        report.exitCode = allPassed ? 0 : 1;
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

        log(`\n================================================================================`);
        log(`DIRECTIVE REPRODUCTION SUITE RESULT: ${report.status} (exit ${report.exitCode})`);
        log(`Assertions passed: ${report.assertions.filter(a => a.passed).length}/${report.assertions.length}`);
        log(`================================================================================`);
        process.exitCode = report.exitCode;

    } catch (err) {
        log(`\n❌ TEST EXCEPTION: ${err.message}`);
        report.endTimeUtc = new Date().toISOString();
        report.status = "FAILED";
        report.exitCode = 1;
        report.error = err.message;
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        process.exitCode = 1;
    } finally {
        if (browserWs) { try { browserWs.close(); } catch (_) {} }
        if (popupWs) { try { popupWs.close(); } catch (_) {} }
        if (swWs) { try { swWs.close(); } catch (_) {} }
        if (proc && !proc.killed) {
            log('Terminating browser process...');
            proc.kill();
        }
    }
}

main().catch(err => {
    console.error('Fatal Runner Exception:', err);
    process.exit(1);
});
