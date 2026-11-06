/**
 * XPIDER V7 Authoritative Chromium E2E Suite:
 * Modes & Visible UI Controls Verification + Built-in CAPTCHA Solver Retirement
 *
 * Requirements & Invariants:
 * 1. AUTO mode: Autonomous completion, ZERO hold panel rendered.
 * 2. MANUAL mode: Pre-submission assist panel visible (data-mode="MANUAL"),
 *    zero form submissions before operator action, completes upon authorized submit.
 * 3. SEMI_AUTO mode: Autonomous on clean forms, holds only on challenge/error with
 *    visible assist panel (data-mode="SEMI_AUTO").
 * 4. Missing message form: Strictly SKIPPED (NO_LONG_TEXT_INQUIRY_FIELD), zero popups, zero submissions delta.
 * 5. Real visible Pause -> Resume Mode Modal selection (#resume-mode-radio-manual) -> CDP Service Worker termination
 *    -> Fresh SW reboot -> Verification of preserved MANUAL mode and checkpoint.
 * 6. Real visible Stop & Save click (#stop-save-btn) -> Resumable banner rendered -> SW durability.
 * 7. Verification that built-in CAPTCHA solver paths are retired across content-script and modules.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9225;
const EXT_DIR = path.resolve(__dirname, '..', 'extension');
const REPORT_FILE = path.join(__dirname, 'report_v7_modes_and_visible_controls.json');
const LOG_FILE = path.join(__dirname, 'test_v7_modes_and_visible_controls.log');
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
    log('🚀 RUNNING XPIDER V7 MODES & VISIBLE CONTROLS CHROMIUM E2E SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();

    // 1. Verify test server is reachable
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    log(`Test server active on port ${PORT}`);

    // 2. Launch disposable Chromium profile
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-modes-${Math.random().toString(36).substring(2, 8)}`);
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
        testSuite: "XPIDER_V7_MODES_AND_VISIBLE_CONTROLS_SUITE",
        startTimeUtc,
        endTimeUtc: null,
        status: "RUNNING",
        assertions: [],
        screenshots: [],
        serverSubmissions: 0
    };

    function recordAssertion(name, passed, detail = {}) {
        const item = { name, passed: Boolean(passed), detail, timestamp: new Date().toISOString() };
        report.assertions.push(item);
        if (passed) {
            log(`[ASSERTION] ${name} => PASS`);
        } else {
            log(`[ASSERTION FAILED] ${name} => FAIL | Detail: ${JSON.stringify(detail)}`);
            throw new assert.AssertionError({
                message: `Assertion failed: ${name} | Detail: ${JSON.stringify(detail)}`,
                actual: passed,
                expected: true
            });
        }
    }

    try {
        log(`Launching browser: ${bin}`);
        proc = spawn(bin, browserArgs, { stdio: 'ignore' });
        log(`Browser launched (PID=${proc.pid})`);

        // Wait for CDP readiness
        for (let i = 0; i < 40; i++) {
            await sleep(250);
            try {
                const ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json());
                if (ver && ver.webSocketDebuggerUrl) break;
            } catch (_) {}
        }

        // Locate Extension Service Worker
        let targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        let swTarget = null;
        for (let i = 0; i < 30; i++) {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (swTarget) break;
            await sleep(300);
        }
        assert(swTarget, 'Extension Service Worker target must exist');
        const extId = swTarget.url.split('/')[2];
        log(`Extension ID: ${extId}`);

        swWs = await openWs(swTarget.webSocketDebuggerUrl);
        swWs.addEventListener('message', event => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args.map(a => (a.value !== undefined ? a.value : JSON.stringify(a))).join(' ');
                    log(`[SW_CONSOLE] ${text}`);
                }
            } catch (_) {}
        });
        await cdpSend(swWs, 'Runtime.enable');

        const swEval = async (code) => {
            const res = await cdpSend(swWs, 'Runtime.evaluate', {
                expression: code,
                awaitPromise: true,
                returnByValue: true
            });
            return res?.result?.value;
        };

        // Connect to browser target and open Extension Popup
        const browserWsUrl = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json()).then(j => j.webSocketDebuggerUrl);
        browserWs = await openWs(browserWsUrl);

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
        popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
        popupWs.addEventListener('message', event => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args.map(a => (a.value !== undefined ? a.value : JSON.stringify(a))).join(' ');
                    log(`[POPUP_CONSOLE] ${text}`);
                }
            } catch (_) {}
        });
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        await sleep(1000);

        // Helper: configure campaign queue and inputs in popup DOM with direct privacy override & clean suppression
        const setupPopupCampaign = async (targetsList, tpl = {}) => {
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
                        if (fnEl) fnEl.value = ${JSON.stringify(tpl.firstName || 'ModeTester')};
                        const lnEl = document.getElementById('tpl-last-name');
                        if (lnEl) lnEl.value = ${JSON.stringify(tpl.lastName || 'ValUser')};
                        const emEl = document.getElementById('tpl-email');
                        if (emEl) emEl.value = ${JSON.stringify(tpl.email || 'modetester@example.com')};
                        const phEl = document.getElementById('tpl-phone');
                        if (phEl) phEl.value = ${JSON.stringify(tpl.phone || '555-0199')};
                        const msgEl = document.getElementById('tpl-message');
                        if (msgEl) msgEl.value = ${JSON.stringify(tpl.message || 'Modes and visible UI controls verification inquiry message.')};

                        const skipEl = document.getElementById('skip-attempted-toggle');
                        if (skipEl) {
                            skipEl.checked = false;
                            skipEl.dispatchEvent(new Event('change'));
                        }

                        chrome.storage.local.set({
                            xpider_queue: ${JSON.stringify(targetsList)},
                            xpider_total: ${targetsList.length},
                            xpider_success: 0,
                            xpider_run_scoped_direct_privacy: true,
                            xpider_privacy_mode: 'DIRECT'
                        });
                    })()
                `
            });
            // Reset history store and suppression between subtests
            await swEval(`
                (async () => {
                    if (self.__xpiderHistoryStore && typeof self.__xpiderHistoryStore.clearAll === 'function') {
                        await self.__xpiderHistoryStore.clearAll();
                    }
                    await chrome.storage.local.remove(['xpider_history_attempts', 'xpider_sent_history', 'xpider_history', 'xpider_suppressed_domains']);
                    await chrome.storage.local.set({ xpider_run_scoped_direct_privacy: true, xpider_privacy_mode: 'DIRECT' });
                })()
            `);
        };

        // Reset server submissions
        await fetch(`http://127.0.0.1:${PORT}/__xpider_reset_submissions`).then(r => r.json());
        const initSub = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        assert.strictEqual(initSub.count, 0, 'Server submissions must start at 0');

        // ====================================================================
        // SUBTEST 1: AUTO MODE (Real Visible #start-btn Click, Autonomous Submit, Zero Popup)
        // ====================================================================
        log('\n--- SUBTEST 1: AUTO MODE (Visible #start-btn, Autonomous Submit, Zero Popup) ---');
        await setupPopupCampaign([`http://127.0.0.1:${PORT}/contact-standard.html`]);

        // Click #start-btn
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('start-btn')?.click()`
        });

        // Wait for campaign to become active
        let autoActive = false;
        for (let i = 0; i < 40; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, mode: campaignState.campaignMode })`);
            if (st?.isActive) {
                autoActive = true;
                log(`Auto campaign active at T+${(i * 0.3).toFixed(1)}s: mode=${st.mode}`);
                break;
            }
        }
        recordAssertion('AUTO_MODE_CAMPAIGN_ACTIVE', autoActive === true);

        // Monitor target tab during AUTO: assert NO manual hold panel appears
        let autoSettled = false;
        let autoHoldPanelObserved = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const currentTargets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            const targetTab = currentTargets.find(t => t.type === 'page' && t.url.includes('contact-standard.html'));
            if (targetTab) {
                try {
                    const tabWs = await openWs(targetTab.webSocketDebuggerUrl);
                    const panelCheck = await cdpSend(tabWs, 'Runtime.evaluate', {
                        expression: `Boolean(document.getElementById('xpider-v7-manual-hold-panel'))`,
                        returnByValue: true
                    });
                    tabWs.close();
                    if (panelCheck?.result?.value) {
                        autoHoldPanelObserved = true;
                    }
                } catch (_) {}
            }
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive && i > 3) {
                autoSettled = true;
                break;
            }
        }
        recordAssertion('AUTO_MODE_CAMPAIGN_SETTLED', autoSettled === true);
        recordAssertion('AUTO_MODE_ZERO_OPERATOR_PANEL', autoHoldPanelObserved === false, { autoHoldPanelObserved });

        const autoSubRecord = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('AUTO_MODE_SUBMISSION_RECORDED', autoSubRecord.count === 1, { submissions: autoSubRecord.count });
        const shotAuto = await shot(popupWs, 'shot_v7_modes_01_auto_completed.png');
        report.screenshots.push(shotAuto);

        // Clear campaign state for next subtest
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // ====================================================================
        // SUBTEST 2: MANUAL MODE (Autofill -> Visible Hold Panel -> Operator Authorized Submit)
        // ====================================================================
        log('\n--- SUBTEST 2: MANUAL MODE (Autofill -> Visible Hold Panel -> User Submit) ---');
        await setupPopupCampaign([`http://127.0.0.1:${PORT}/contact-standard.html`]);

        // Real Click on #start-manual-btn
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('start-manual-btn')?.click()`
        });

        // Wait for manual campaign to become active
        let manualActive = false;
        for (let i = 0; i < 40; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, mode: campaignState.campaignMode })`);
            if (st?.isActive) {
                manualActive = true;
                log(`Manual campaign active at T+${(i * 0.3).toFixed(1)}s: mode=${st.mode}`);
                break;
            }
        }
        recordAssertion('MANUAL_MODE_CAMPAIGN_ACTIVE', manualActive === true);

        // Find held target tab and verify visible #xpider-v7-manual-hold-panel with data-mode="MANUAL"
        let manualPanelFound = false;
        let heldTabWs = null;
        let heldTargetId = null;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const currentTargets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            const targetTab = currentTargets.find(t => t.type === 'page' && t.url.includes('contact-standard.html'));
            if (targetTab) {
                try {
                    heldTabWs = await openWs(targetTab.webSocketDebuggerUrl);
                    heldTargetId = targetTab.id;
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
                        recordAssertion('MANUAL_HOLD_DATA_MODE_MANUAL', panelInfo.mode === 'MANUAL', { mode: panelInfo.mode });
                        recordAssertion('MANUAL_FIELDS_AUTOFILLED_BEFORE_SUBMIT', Boolean(panelInfo.nameVal && panelInfo.emailVal && panelInfo.msgVal), panelInfo);
                        break;
                    }
                } catch (_) {}
            }
        }
        assert(manualPanelFound, 'MANUAL mode must render visible #xpider-v7-manual-hold-panel in target tab');

        // Verify that before clicking register, submission count did NOT increment
        const subBeforeReg = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('MANUAL_MODE_HELD_BEFORE_SUBMIT', subBeforeReg.count === 1, { count: subBeforeReg.count });

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
        if (heldTabWs) heldTabWs.close();

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
        const subAfterReg = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('MANUAL_MODE_SUBMISSION_RECORDED', subAfterReg.count === 2, { count: subAfterReg.count });
        const shotManual = await shot(popupWs, 'shot_v7_modes_02_manual_completed.png');
        report.screenshots.push(shotManual);

        // Clear campaign state
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // ====================================================================
        // SUBTEST 3: SEMI_AUTO MODE (Autonomous on Clean Form, Holds on Challenge)
        // ====================================================================
        log('\n--- SUBTEST 3: SEMI_AUTO MODE (Clean Form Autonomous, Challenge Form Holds) ---');

        // Part 3A: Clean form in SEMI_AUTO (submits autonomously)
        log('Testing SEMI_AUTO on clean form...');
        await setupPopupCampaign([`http://127.0.0.1:${PORT}/contact-standard.html`]);
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('start-semi-auto-btn')?.click()`
        });

        let semiCleanSettled = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive && i > 3) {
                semiCleanSettled = true;
                break;
            }
        }
        recordAssertion('SEMI_AUTO_CLEAN_FORM_SETTLED_AUTONOMOUS', semiCleanSettled === true);
        const subSemiClean = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('SEMI_AUTO_CLEAN_SUBMISSION_RECORDED', subSemiClean.count === 3, { count: subSemiClean.count });

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // Part 3B: Challenge form in SEMI_AUTO (holds for assistance)
        log('Testing SEMI_AUTO on Turnstile challenge form...');
        await setupPopupCampaign([`http://127.0.0.1:${PORT}/captcha-turnstile-dom.html`]);
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('start-semi-auto-btn')?.click()`
        });

        let semiChallengePanelFound = false;
        let semiHeldTabWs = null;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const currentTargets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            const targetTab = currentTargets.find(t => t.type === 'page' && t.url.includes('captcha-turnstile-dom.html'));
            if (targetTab) {
                try {
                    semiHeldTabWs = await openWs(targetTab.webSocketDebuggerUrl);
                    const panelInfo = await cdpSend(semiHeldTabWs, 'Runtime.evaluate', {
                        expression: `
                            (() => {
                                const p = document.getElementById('xpider-v7-manual-hold-panel');
                                if (!p) return null;
                                return {
                                    exists: true,
                                    mode: p.getAttribute('data-mode'),
                                    validationFailed: p.getAttribute('data-validation-failed')
                                };
                            })()
                        `,
                        returnByValue: true
                    }).then(r => r.result?.value);

                    if (panelInfo && panelInfo.exists) {
                        semiChallengePanelFound = true;
                        log(`SEMI_AUTO challenge hold panel verified: mode=${panelInfo.mode}`);
                        recordAssertion('SEMI_AUTO_CHALLENGE_HOLD_PANEL_RENDERED', true, panelInfo);
                        recordAssertion('SEMI_AUTO_HOLD_DATA_MODE_SEMI_AUTO', panelInfo.mode === 'SEMI_AUTO', { mode: panelInfo.mode });
                        break;
                    }
                } catch (_) {}
            }
        }
        assert(semiChallengePanelFound, 'SEMI_AUTO mode must hold at challenge form with assistance panel');

        // Resolve challenge via operator assistance button in held tab
        log('Resolving SEMI_AUTO challenge via #xpider-manual-registered-btn...');
        await cdpSend(semiHeldTabWs, 'Runtime.evaluate', {
            expression: `document.getElementById('xpider-manual-registered-btn')?.click()`
        });
        if (semiHeldTabWs) semiHeldTabWs.close();

        let semiChallengeSettled = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive) {
                semiChallengeSettled = true;
                break;
            }
        }
        recordAssertion('SEMI_AUTO_CHALLENGE_CAMPAIGN_SETTLED', semiChallengeSettled === true);
        const shotSemi = await shot(popupWs, 'shot_v7_modes_03_semi_auto_completed.png');
        report.screenshots.push(shotSemi);

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // ====================================================================
        // SUBTEST 4: MISSING MESSAGE FIELD (Negative Control — Strictly SKIPPED)
        // ====================================================================
        log('\n--- SUBTEST 4: MISSING MESSAGE FIELD (Strictly SKIPPED Negative Control) ---');
        await setupPopupCampaign([`http://127.0.0.1:${PORT}/phone-only-no-message.html`]);
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('start-btn')?.click()`
        });

        let phoneSettled = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive && i > 3) {
                phoneSettled = true;
                break;
            }
        }
        recordAssertion('PHONE_ONLY_CAMPAIGN_SETTLED', phoneSettled === true);

        const phoneAttempts = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_history_attempts'], res => {
                    const list = res.xpider_history_attempts || [];
                    resolve(list.filter(a => a.sourceUrl && a.sourceUrl.includes('phone-only-no-message')));
                });
            })
        `);
        const phoneAtt = phoneAttempts[phoneAttempts.length - 1];
        recordAssertion('PHONE_ONLY_STATUS_SKIPPED', phoneAtt?.status === 'SKIPPED', { status: phoneAtt?.status });
        recordAssertion('PHONE_ONLY_REASON_NO_LONG_TEXT', phoneAtt?.reasonCode === 'NO_LONG_TEXT_INQUIRY_FIELD', { reasonCode: phoneAtt?.reasonCode });

        // Zero submissions delta on server
        const subPhone = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('PHONE_ONLY_ZERO_SUBMISSION_DELTA', subPhone.count === 3, { count: subPhone.count }); // unchanged

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // ====================================================================
        // SUBTEST 5: REAL VISIBLE PAUSE -> MODAL RESUME-MODE SELECTION -> SW RESTART
        // ====================================================================
        log('\n--- SUBTEST 5: REAL VISIBLE PAUSE -> MODAL RESUME-MODE SELECTION -> SW RESTART ---');
        const queue3 = [
            `http://127.0.0.1:${PORT}/contact-standard.html`,
            `http://127.0.0.1:${PORT}/captcha-turnstile-dom.html`,
            `http://127.0.0.1:${PORT}/dynamic-react-controlled-stale-revert.html`
        ];
        await setupPopupCampaign(queue3);

        // Start in AUTO
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('start-btn')?.click()` });
        for (let i = 0; i < 40; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('privacy-block-action-override');
                    if (btn && btn.offsetParent !== null) btn.click();
                })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (st?.isActive) break;
        }

        // Click visible #pause-btn
        log('Clicking visible #pause-btn...');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('pause-btn')?.click()` });
        await sleep(600);

        const pauseState = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `({ text: document.getElementById('pause-btn')?.textContent, isPaused: campaignPaused })`,
            returnByValue: true
        }).then(r => r.result?.value);
        recordAssertion('PAUSE_BTN_SHOWS_RESUME', Boolean(pauseState?.text?.includes('Resume') || pauseState?.text?.includes('재개')), pauseState);

        // Click #pause-btn to open #resume-mode-modal-overlay
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
        recordAssertion('RESUME_MODE_MODAL_OPENED_VISIBLE', modalCheck?.isVisible === true, modalCheck);
        const shotModal = await shot(popupWs, 'shot_v7_modes_04_resume_modal.png');
        report.screenshots.push(shotModal);

        // Visually select MANUAL mode in the modal via real click on #resume-mode-radio-manual
        log('Clicking #resume-mode-radio-manual in modal...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('resume-mode-radio-manual')?.click()`
        });

        // Click #confirm-resume-mode-btn
        log('Clicking #confirm-resume-mode-btn...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('confirm-resume-mode-btn')?.click()`
        });
        await sleep(600);

        // Assert mode switched to MANUAL in HUD (#campaign-mode-pill)
        const hudState = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `({
                badge: document.getElementById('current-mode-badge')?.textContent,
                pill: document.getElementById('campaign-mode-pill')?.textContent,
                status: document.getElementById('current-status-badge')?.textContent
            })`,
            returnByValue: true
        }).then(r => r.result?.value);
        recordAssertion('RESUMED_IN_MANUAL_MODE_HUD_BADGE', Boolean(hudState?.pill?.includes('MANUAL') || hudState?.badge?.includes('MANUAL')), hudState);

        // ====================================================================
        // SUBTEST 6: REAL VISIBLE STOP & SAVE CLICK, SW TERMINATION & RECOVERY
        // ====================================================================
        log('\n--- SUBTEST 6: REAL VISIBLE STOP & SAVE CLICK & SW TERMINATION DURABILITY ---');

        // Check visibility of #stop-save-btn
        const stopSaveCheck = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('stop-save-btn');
                if (!btn) return { exists: false };
                const st = window.getComputedStyle(btn);
                return {
                    exists: true,
                    visible: btn.offsetParent !== null && st.display !== 'none' && st.visibility !== 'hidden',
                    disabled: btn.disabled
                };
            })()`,
            returnByValue: true
        }).then(r => r.result?.value);
        recordAssertion('STOP_SAVE_BTN_VISIBLE_AND_ENABLED', stopSaveCheck?.visible === true && !stopSaveCheck?.disabled, stopSaveCheck);

        // Click visible #stop-save-btn
        log('Clicking visible #stop-save-btn...');
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('stop-save-btn')?.click()` });

        // Verify Stop & Save banner and storage snapshot
        let bannerVisible = false;
        let stopState = null;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            stopState = await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const b = document.getElementById('resumable-campaign-banner');
                    return {
                        bannerVisible: Boolean(b && b.style.display !== 'none' && !b.classList.contains('hidden')),
                        hudStatus: document.getElementById('current-status-badge')?.textContent
                    };
                })()`,
                returnByValue: true
            }).then(r => r.result?.value);
            if (stopState?.bannerVisible) {
                bannerVisible = true;
                break;
            }
        }
        recordAssertion('STOP_SAVE_BANNER_RENDERED', bannerVisible === true, stopState);
        const shotStop = await shot(popupWs, 'shot_v7_modes_05_stop_saved.png');
        report.screenshots.push(shotStop);

        // Forcibly terminate Service Worker
        log('Forcibly terminating Service Worker via CDP Target.closeTarget...');
        const oldSwId = swTarget.id;
        try { swWs.close(); } catch (_) {}
        await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId });
        await sleep(1500);

        // Wake fresh Service Worker
        log('Waking up fresh Service Worker...');
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

        // Assert checkpoint and MANUAL mode survived true SW restart
        const swRestored = await swEval(`
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
        recordAssertion('SW_RESTART_MANUAL_MODE_PRESERVED', swRestored?.storageMode === 'MANUAL', swRestored);
        recordAssertion('SW_RESTART_CHECKPOINT_SURVIVED', Boolean(swRestored?.checkpoint), swRestored);
        recordAssertion('SW_RESTART_CHECKPOINT_MODE_MANUAL', swRestored?.checkpoint?.campaignMode === 'MANUAL', swRestored);
        recordAssertion('SW_RESTART_CAMPAIGN_STATE_MODE_MANUAL', swRestored?.swMode === 'MANUAL', swRestored);
        recordAssertion('SW_RESTART_CHECKPOINT_RUN_ID_MATCHES', swRestored?.checkpoint?.campaignRunId === swRestored?.swRunId, swRestored);

        // End campaign cleanup
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(400);

        // ====================================================================
        // SUBTEST 7: BUILT-IN CAPTCHA SOLVER RETIREMENT VERIFICATION
        // ====================================================================
        log('\n--- SUBTEST 7: IN-APP CAPTCHA SOLVER RETIREMENT VERIFICATION ---');

        // 1. Verify MathCaptchaSolver module has retired stub
        const MathCaptchaSolverMod = require(path.join(EXT_DIR, 'modules', 'math-captcha-solver.js'));
        const mcsRetired = MathCaptchaSolverMod.retired === true &&
                           MathCaptchaSolverMod.solveField() === null &&
                           MathCaptchaSolverMod.solveMathCaptcha() === null &&
                           MathCaptchaSolverMod.isMathCaptchaContext() === false;
        log(`MathCaptchaSolver module test: retired=${mcsRetired}`);
        recordAssertion('MATH_CAPTCHA_SOLVER_RETIRED_STUB', mcsRetired, { mcsRetired });

        // 2. Verify content-script.js source code has _MathCaptchaSolver = null and zero solveMathCaptcha calls
        const csSource = fs.readFileSync(path.join(EXT_DIR, 'content-script.js'), 'utf8');
        const csRetired = csSource.includes('const _MathCaptchaSolver = null;') &&
                          !csSource.includes('await solveMathCaptcha(form);') &&
                          !csSource.includes("applyVal(el, 'MathCaptcha-Solved',");
        log(`content-script math solver retirement: ${csRetired}`);
        recordAssertion('CONTENT_SCRIPT_MATH_SOLVER_NULL', csRetired, { csRetired });

        // Final Report Assembly
        report.endTimeUtc = new Date().toISOString();
        report.status = "SUCCESS";
        report.exitCode = 0;
        const finalSubRecord = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        report.serverSubmissions = finalSubRecord.count;

        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        log(`\n================================================================================`);
        log(`🎉 ALL ${report.assertions.length} VISIBLE CONTROLS & MODE ASSERTIONS PASSED! EXIT 0`);
        log(`================================================================================`);

    } catch (err) {
        log(`\n❌ TEST SUITE FAILED: ${err.message}`);
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

main().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal Runner Exception:', err);
    process.exit(1);
});
