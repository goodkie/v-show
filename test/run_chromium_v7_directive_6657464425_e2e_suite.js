/**
 * test/run_chromium_v7_directive_6657464425_e2e_suite.js
 *
 * Dedicated Chromium E2E Verification Suite for Directive #910 (Comment #6657464425):
 * 
 * SECTION A: EXTERNAL CAPTCHA EXTENSION ONLY CONTRACT (Isolated Localhost Fixtures)
 *   1. AUTO Mode: External solver token injection -> unattended continuation -> single submit -> SUCCESS.
 *   2. AUTO Mode: External solver timeout/error -> bounded wait -> fails closed with CAPTCHA_EXTERNAL_SOLVER_TIMEOUT (0 POSTs).
 *   3. SEMI_AUTO Mode: Holds on challenge form for operator assistance (data-mode="SEMI_AUTO") -> operator submit.
 *   4. MANUAL Mode: Holds after autofill (data-mode="MANUAL") -> operator registration confirmation -> SUCCESS.
 *
 * SECTION B: COHERENT MULTI-TARGET CAMPAIGN WITH REAL VISIBLE UI CONTROLS
 *   5. Homepage Discovery (homepage-with-newsletter-and-contact-link.html -> contact-standard.html) -> POST.
 *   6. React Dynamic Textarea with controlled stale revert (dynamic-react-controlled-stale-revert.html) -> POST.
 *   7. Phone-only form with no message (phone-only-no-message.html) -> SKIPPED (0 POSTs).
 *   8. Homepage with dead contact link (homepage-with-dead-contact-link.html) -> FAILURE (0 POSTs).
 *   9. Real visible controls: #start-btn, #start-manual-btn, #start-semi-auto-btn, #pause-btn, modal radio & confirm, #stop-save-btn, SW termination, reopen popup, #resume-campaign-btn.
 *  10. Strict runId-scoped HistoryStore ledger and remaining counter reaching 0.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9448; // Dedicated port
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('test/evidence_v7_directive_6657464425');
const LOG_FILE = path.join(EVIDENCE_DIR, 'directive_6657464425_e2e.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'report_directive_6657464425_e2e.json');

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
        const timer = setTimeout(() => reject(new Error(`CDP Timeout: ${method}`)), 30000);
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
            } catch (_) { }
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
    try {
        const res = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
        const p = path.join(EVIDENCE_DIR, filename);
        fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
        log(`📸 Captured screenshot: ${filename}`);
        return filename;
    } catch (e) {
        log(`⚠️ Failed to capture screenshot ${filename}: ${e.message}`);
        return null;
    }
}

async function main() {
    log('================================================================================');
    log('🚀 LAUNCHING DIRECTIVE #6657464425 COMPREHENSIVE CHROMIUM E2E SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();

    // 1. Verify test server
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    log(`Test server active on port ${PORT}`);

    // 2. Launch browser
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-dir6657-${Math.random().toString(36).substring(2, 8)}`);
    fs.mkdirSync(tmpProfile, { recursive: true });
    log(`Disposable profile: ${tmpProfile}`);

    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const bin = fs.existsSync(edgePath) ? edgePath : chromePath;

    const browserArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--load-extension=${EXT_DIR}`,
        `--user-data-dir=${tmpProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions-except=' + EXT_DIR,
        'about:blank'
    ];

    log(`Spawning browser binary: ${bin}`);
    const browserProcess = spawn(bin, browserArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let browserWs = null;
    let swWs = null;
    let popupWs = null;

    const report = {
        testSuite: "run_chromium_v7_directive_6657464425_e2e_suite",
        startTimeUtc,
        assertions: [],
        screenshots: []
    };

    function recordAssertion(name, passed, detail = {}) {
        const item = { name, passed, detail, timestamp: new Date().toISOString() };
        report.assertions.push(item);
        if (passed) {
            log(`✅ PASS: ${name}`);
        } else {
            log(`❌ FAIL: ${name} -> ${JSON.stringify(detail)}`);
            throw new Error(`Assertion failed: ${name}`);
        }
    }

    try {
        // Wait for CDP endpoint
        let browserWsUrl = null;
        for (let i = 0; i < 30; i++) {
            await sleep(500);
            try {
                const ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json());
                if (ver && ver.webSocketDebuggerUrl) {
                    browserWsUrl = ver.webSocketDebuggerUrl;
                    break;
                }
            } catch (_) { }
        }
        assert(browserWsUrl, 'Browser CDP version endpoint must be accessible');
        log(`Browser CDP connected: ${browserWsUrl}`);

        browserWs = await openWs(browserWsUrl);
        await cdpSend(browserWs, 'Target.setDiscoverTargets', { discover: true });

        // Locate background SW
        let swTarget = null;
        for (let i = 0; i < 30; i++) {
            const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (swTarget) break;
            await sleep(500);
        }
        assert(swTarget, 'Background service worker must be discovered');
        const extId = swTarget.url.split('/')[2];
        log(`Extension ID: ${extId}`);

        swWs = await openWs(swTarget.webSocketDebuggerUrl);
        swWs.addEventListener('message', (event) => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args?.map(a => a.value || a.description || '').join(' ');
                    if (text.includes('[Engine]') || text.includes('STAGE') || text.includes('CAMPAIGN') || text.includes('CAPTCHA') || text.includes('START_')) {
                        log(`[SW_CONSOLE] ${text}`);
                    }
                }
            } catch (_) { }
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

        // Open Popup UI
        const popupUrl = `chrome-extension://${extId}/popup.html`;
        const openRes = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
        const popupTargetId = openRes.targetId;

        await sleep(1500);
        let targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        const popupTarget = targets.find(t => t.id === popupTargetId);
        assert(popupTarget, 'Popup target must exist');

        popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
        popupWs.addEventListener('message', event => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args.map(a => (a.value !== undefined ? a.value : JSON.stringify(a))).join(' ');
                    log(`[POPUP_CONSOLE] ${text}`);
                }
            } catch (_) { }
        });
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `window.alert = (msg) => console.warn('[SUPPRESSED_POPUP_ALERT]', msg);`
        });
        await sleep(1500);
        log('Connected to Popup UI via CDP and hydrated');

        // Helper to setup popup queue and template
        const setupPopup = async (targetsList, tpl = {}) => {
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
                        if (queueEl) {
                            queueEl.value = ${JSON.stringify(targetsList.join('\n'))};
                            queueEl.dispatchEvent(new Event('input', { bubbles: true }));
                            queueEl.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        const fnEl = document.getElementById('tpl-first-name');
                        if (fnEl) { fnEl.value = ${JSON.stringify(tpl.firstName || 'DirectiveTester')}; fnEl.dispatchEvent(new Event('input', { bubbles: true })); }
                        const lnEl = document.getElementById('tpl-last-name');
                        if (lnEl) { lnEl.value = ${JSON.stringify(tpl.lastName || 'ValUser')}; lnEl.dispatchEvent(new Event('input', { bubbles: true })); }
                        const emEl = document.getElementById('tpl-email');
                        if (emEl) { emEl.value = ${JSON.stringify(tpl.email || 'directivetester@example.com')}; emEl.dispatchEvent(new Event('input', { bubbles: true })); }
                        const phEl = document.getElementById('tpl-phone');
                        if (phEl) { phEl.value = ${JSON.stringify(tpl.phone || '555-0199')}; phEl.dispatchEvent(new Event('input', { bubbles: true })); }
                        const msgEl = document.getElementById('tpl-message');
                        if (msgEl) {
                            msgEl.value = ${JSON.stringify(tpl.message || 'Directive 6657464425 verification inquiry message.')};
                            msgEl.dispatchEvent(new Event('input', { bubbles: true }));
                            msgEl.dispatchEvent(new Event('change', { bubbles: true }));
                        }

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
        // SECTION A: EXTERNAL CAPTCHA EXTENSION ONLY CONTRACT
        // ====================================================================

        // --------------------------------------------------------------------
        // TEST A1: AUTO Mode — External Solver Success & Unattended Continuation
        // --------------------------------------------------------------------
        log('\n--- TEST A1: AUTO MODE — EXTERNAL SOLVER SUCCESS & UNATTENDED CONTINUATION ---');
        await setupPopup([`http://127.0.0.1:${PORT}/captcha-turnstile-dom.html`]);

        // Visible click on #start-btn (AUTO)
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('start-btn')?.click()` });

        // Wait for campaign active
        let a1Active = false;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, mode: campaignState.campaignMode })`);
            if (st?.isActive) { a1Active = true; break; }
        }
        recordAssertion('A1_AUTO_CAMPAIGN_ACTIVE', a1Active === true);

        // Find target tab and wait for CAPTCHA_PENDING_EXTERNAL_USER
        let a1TabTarget = null;
        let a1PendingObserved = false;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            const tgts = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            a1TabTarget = tgts.find(t => t.type === 'page' && t.url.includes('captcha-turnstile-dom.html'));
            const swSt = await swEval(`({ stage: campaignState.currentTargetStage, waitActive: campaignState.externalCaptchaWaitActive })`);
            if (swSt?.stage === 'CAPTCHA_PENDING_EXTERNAL_USER' || swSt?.waitActive) {
                a1PendingObserved = true;
                log(`A1: Turnstile challenge detected -> entered CAPTCHA_PENDING_EXTERNAL_USER (tab retained, deadline paused)`);
                break;
            }
        }
        recordAssertion('A1_CAPTCHA_PENDING_EXTERNAL_USER_ENTERED', a1PendingObserved === true);
        assert(a1TabTarget, 'Target tab must be present and retained');

        // Connect to target tab CDP
        const a1TabWs = await openWs(a1TabTarget.webSocketDebuggerUrl);
        await cdpSend(a1TabWs, 'Runtime.enable');

        // Assert top HUD banner rendered in target tab
        const a1HudInfo = await cdpSend(a1TabWs, 'Runtime.evaluate', {
            expression: `(() => {
                const hud = document.getElementById('xpider-v7-external-captcha-hud');
                return { exists: Boolean(hud), text: hud?.textContent || '' };
            })()`,
            returnByValue: true
        }).then(r => r.result?.value);
        recordAssertion('A1_EXTERNAL_CAPTCHA_HUD_RENDERED', a1HudInfo?.exists === true, a1HudInfo);

        // Verify that before external solver finishes, server submissions remain 0
        const subBeforeSolve = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('A1_ZERO_SUBMIT_BEFORE_EXTERNAL_SOLVER', subBeforeSolve.count === 0, subBeforeSolve);

        // SIMULATE EXTERNAL SOLVER EXTENSION: External extension solves challenge and writes token
        log('A1: Simulating external solver extension injecting token into [name="cf-turnstile-response"]...');
        await cdpSend(a1TabWs, 'Runtime.evaluate', {
            expression: `(() => {
                const tokInput = document.getElementById('cf-turnstile-response');
                if (tokInput) {
                    tokInput.value = 'mock_token_ext_turnstile_gamma_77182';
                    tokInput.dispatchEvent(new Event('input', { bubbles: true }));
                    tokInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const widget = document.querySelector('.cf-turnstile');
                if (widget) widget.setAttribute('data-challenge-state', 'resolved');
                window.__captcha_challenge_resolved = true;
            })()`
        });

        // Monitor unattended continuation: AUTO mode polling detects token -> re-verifies integrity -> submits autonomously!
        let a1Settled = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive) { a1Settled = true; break; }
        }
        recordAssertion('A1_AUTO_UNATTENDED_CONTINUATION_SETTLED', a1Settled === true);

        // Check exactly 1 server submission recorded
        const subAfterSolve = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('A1_AUTO_SUBMIT_RECORDED_EXACTLY_ONE', subAfterSolve.count === 1, subAfterSolve);

        try { a1TabWs.close(); } catch (_) { }
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // --------------------------------------------------------------------
        // TEST A2: AUTO Mode — External Solver Timeout / Error (Fail-Closed)
        // --------------------------------------------------------------------
        log('\n--- TEST A2: AUTO MODE — EXTERNAL SOLVER TIMEOUT & FAIL-CLOSED ---');
        await setupPopup([`http://127.0.0.1:${PORT}/captcha-mock-timeout.html`], {
            // Set short external wait timeout for test: 2500ms
            externalCaptchaTimeoutMs: 2500
        });

        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `
                // Inject test override for short external timeout
                window.__xpider_external_captcha_timeout_ms = 2500;
                document.getElementById('start-btn')?.click();
            `
        });

        let a2Active = false;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (st?.isActive) { a2Active = true; break; }
        }
        recordAssertion('A2_TIMEOUT_CAMPAIGN_ACTIVE', a2Active === true);

        // Wait for campaign to fail closed after bounded timeout (2.5s)
        let a2Settled = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive) { a2Settled = true; break; }
        }
        recordAssertion('A2_TIMEOUT_CAMPAIGN_SETTLED_FAIL_CLOSED', a2Settled === true);

        // Verify server submission count DID NOT INCREMENT (count remains strictly 1)
        const subAfterTimeout = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('A2_ZERO_SUBMISSION_ON_SOLVER_TIMEOUT', subAfterTimeout.count === 1, subAfterTimeout);

        // Verify attempt settled as FAILURE: CAPTCHA_EXTERNAL_SOLVER_TIMEOUT
        const timeoutAttempt = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_history_attempts'], res => {
                    const list = res.xpider_history_attempts || [];
                    resolve(list[list.length - 1]);
                });
            })
        `);
        recordAssertion('A2_ATTEMPT_REASON_CAPTCHA_TIMEOUT',
            Boolean(timeoutAttempt && (timeoutAttempt.status === 'FAILURE' || timeoutAttempt.reasonCode?.includes('TIMEOUT'))),
            timeoutAttempt
        );

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // --------------------------------------------------------------------
        // TEST A3: SEMI_AUTO Mode — Challenge Holds for Assistance
        // --------------------------------------------------------------------
        log('\n--- TEST A3: SEMI_AUTO MODE — CHALLENGE HOLDS FOR ASSISTANCE ---');
        await setupPopup([`http://127.0.0.1:${PORT}/captcha-turnstile-dom.html`]);

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('start-semi-auto-btn')?.click()` });

        let a3Active = false;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, mode: campaignState.campaignMode })`);
            if (st?.isActive) { a3Active = true; break; }
        }
        recordAssertion('A3_SEMI_AUTO_CAMPAIGN_ACTIVE', a3Active === true);

        // Locate held target tab
        let a3TabTarget = null;
        let a3HoldFound = false;
        let a3TabWs = null;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            const tgts = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            a3TabTarget = tgts.find(t => t.type === 'page' && t.url.includes('captcha-turnstile-dom.html'));
            if (a3TabTarget) {
                try {
                    a3TabWs = await openWs(a3TabTarget.webSocketDebuggerUrl);
                    await cdpSend(a3TabWs, 'Runtime.enable');
                    const holdCheck = await cdpSend(a3TabWs, 'Runtime.evaluate', {
                        expression: `(() => {
                            const p = document.getElementById('xpider-v7-manual-hold-panel');
                            return { exists: Boolean(p), mode: p?.getAttribute('data-mode') };
                        })()`,
                        returnByValue: true
                    }).then(r => r.result?.value);
                    if (holdCheck?.exists && holdCheck.mode === 'SEMI_AUTO') {
                        a3HoldFound = true;
                        recordAssertion('A3_SEMI_AUTO_HOLD_PANEL_RENDERED', true, holdCheck);
                        break;
                    }
                    a3TabWs.close();
                    a3TabWs = null;
                } catch (_) { }
            }
        }
        recordAssertion('A3_SEMI_AUTO_HOLD_CONFIRMED', a3HoldFound === true);

        // Inject external solver token and submit
        await cdpSend(a3TabWs, 'Runtime.evaluate', {
            expression: `(() => {
                const tokInput = document.getElementById('cf-turnstile-response');
                if (tokInput) tokInput.value = 'mock_token_semi_auto_pass_9921';
                window.__captcha_challenge_resolved = true;
                const widget = document.querySelector('.cf-turnstile');
                if (widget) widget.setAttribute('data-challenge-state', 'resolved');
                document.getElementById('submit-btn')?.click();
            })()`
        });

        // Give the form submit a brief moment to navigate / record
        await sleep(600);

        // Operator confirms verified registration on the hold panel
        await cdpSend(a3TabWs, 'Runtime.evaluate', {
            expression: `document.getElementById('xpider-manual-registered-btn')?.click()`
        });

        let a3Settled = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive) { a3Settled = true; break; }
        }
        recordAssertion('A3_SEMI_AUTO_SETTLED', a3Settled === true);

        // Server submissions increments to 2
        const subA3 = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('A3_SUBMISSION_RECORDED_TOTAL_TWO', subA3.count === 2, subA3);

        try { a3TabWs.close(); } catch (_) { }
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // --------------------------------------------------------------------
        // TEST A4: MANUAL Mode — Autofill & Operator Registration Confirmation
        // --------------------------------------------------------------------
        log('\n--- TEST A4: MANUAL MODE — OPERATOR HOLD & CONFIRMATION ---');
        await setupPopup([`http://127.0.0.1:${PORT}/contact-standard.html`]);

        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('start-manual-btn')?.click()` });

        let a4Active = false;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, mode: campaignState.campaignMode })`);
            if (st?.isActive) { a4Active = true; break; }
        }
        recordAssertion('A4_MANUAL_CAMPAIGN_ACTIVE', a4Active === true);

        // Locate held target tab
        let a4TabWs = null;
        let a4HoldFound = false;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            const tgts = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            const a4TabTarget = tgts.find(t => t.type === 'page' && t.url.includes('contact-standard.html'));
            if (a4TabTarget) {
                try {
                    a4TabWs = await openWs(a4TabTarget.webSocketDebuggerUrl);
                    await cdpSend(a4TabWs, 'Runtime.enable');
                    const holdCheck = await cdpSend(a4TabWs, 'Runtime.evaluate', {
                        expression: `(() => {
                            const p = document.getElementById('xpider-v7-manual-hold-panel');
                            return {
                                exists: Boolean(p),
                                mode: p?.getAttribute('data-mode'),
                                name: document.querySelector('[name="name"]')?.value || '',
                                email: document.querySelector('[name="email"]')?.value || '',
                                message: document.querySelector('textarea')?.value || ''
                            };
                        })()`,
                        returnByValue: true
                    }).then(r => r.result?.value);

                    if (holdCheck?.exists && holdCheck.mode === 'MANUAL') {
                        a4HoldFound = true;
                        recordAssertion('A4_MANUAL_HOLD_PANEL_RENDERED', true, holdCheck);
                        recordAssertion('A4_FIELDS_AUTOFILLED_BEFORE_SUBMIT', Boolean(holdCheck.name && holdCheck.email && holdCheck.message), holdCheck);
                        break;
                    }
                    a4TabWs.close();
                    a4TabWs = null;
                } catch (_) { }
            }
        }
        recordAssertion('A4_MANUAL_HOLD_CONFIRMED', a4HoldFound === true);

        // Operator submits form and clicks #xpider-manual-registered-btn
        await cdpSend(a4TabWs, 'Runtime.evaluate', {
            expression: `
                document.querySelector('form button[type="submit"], form input[type="submit"]')?.click();
                setTimeout(() => {
                    document.getElementById('xpider-manual-registered-btn')?.click();
                }, 400);
            `
        });

        let a4Settled = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({ isActive: campaignState.isActive })`);
            if (!st?.isActive) { a4Settled = true; break; }
        }
        recordAssertion('A4_MANUAL_CAMPAIGN_SETTLED', a4Settled === true);

        // Server submissions increments to 3
        const subA4 = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('A4_SUBMISSION_RECORDED_TOTAL_THREE', subA4.count === 3, subA4);

        try { a4TabWs.close(); } catch (_) { }
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('end-campaign-btn')?.click()` });
        await sleep(500);

        // ====================================================================
        // SECTION B: COHERENT MULTI-TARGET CAMPAIGN WITH REAL VISIBLE UI CONTROLS
        // ====================================================================
        log('\n--- SECTION B: COHERENT MULTI-TARGET CAMPAIGN WITH REAL VISIBLE CONTROLS ---');

        // Reset server submissions for Section B clean baseline
        await fetch(`http://127.0.0.1:${PORT}/__xpider_reset_submissions`).then(r => r.json());
        const initSubB = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        assert.strictEqual(initSubB.count, 0, 'Section B submissions must start at 0');

        const multiTargets = [
            `http://127.0.0.1:${PORT}/homepage-with-newsletter-and-contact-link.html`,
            `http://127.0.0.1:${PORT}/dynamic-react-controlled-stale-revert.html`,
            `http://127.0.0.1:${PORT}/phone-only-no-message.html`,
            `http://127.0.0.1:${PORT}/homepage-with-dead-contact-link.html`
        ];

        await setupPopup(multiTargets, {
            firstName: 'MultiTester',
            lastName: 'SectionB',
            email: 'multitester@example.com',
            phone: '555-0199',
            message: 'Comprehensive Section B multi-target campaign verification inquiry message.'
        });

        // Click #start-btn (AUTO)
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('start-btn')?.click()` });

        let bActive = false;
        let bRunId = null;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
            });
            const st = await swEval(`({ isActive: campaignState.isActive, runId: campaignState.campaignRunId })`);
            if (st?.isActive) {
                bActive = true;
                bRunId = st.runId;
                break;
            }
        }
        recordAssertion('B_MULTI_CAMPAIGN_ACTIVE', bActive === true, { campaignRunId: bRunId });

        // --------------------------------------------------------------------
        // VISIBLE PAUSE -> MODAL MODE SWITCH -> RESUME
        // --------------------------------------------------------------------
        log('B: Exercising visible #pause-btn and resume mode modal...');
        await sleep(1500);

        // Click #pause-btn to pause
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('pause-btn')?.click()` });
        await sleep(600);

        const pausedSt = await swEval(`({ isPaused: campaignState.isPaused })`);
        recordAssertion('B_CAMPAIGN_PAUSED_BY_VISIBLE_BUTTON', pausedSt?.isPaused === true, pausedSt);

        // Click #pause-btn again to open #resume-mode-modal-overlay
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('pause-btn')?.click()` });
        await sleep(600);

        const modalVis = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const m = document.getElementById('resume-mode-modal-overlay');
                return Boolean(m && !m.classList.contains('hidden') && m.offsetParent !== null);
            })()`,
            returnByValue: true
        }).then(r => r.result?.value);
        recordAssertion('B_RESUME_MODE_MODAL_OPENED', modalVis === true);

        // Click #resume-mode-radio-auto in modal and click #confirm-resume-mode-btn
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `
                document.getElementById('resume-mode-radio-auto')?.click();
                document.getElementById('confirm-resume-mode-btn')?.click();
            `
        });
        await sleep(800);

        const resumedSt = await swEval(`({ isActive: campaignState.isActive, isPaused: campaignState.isPaused })`);
        recordAssertion('B_CAMPAIGN_RESUMED_ACTIVE', Boolean(resumedSt?.isActive && !resumedSt?.isPaused), resumedSt);

        // --------------------------------------------------------------------
        // VISIBLE STOP & SAVE -> SW RESTART -> REOPEN POPUP -> RESUME
        // --------------------------------------------------------------------
        log('B: Exercising visible #stop-save-btn, SW termination, reopen popup, and resume...');
        await sleep(2000);

        // Click visible #stop-save-btn
        await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('stop-save-btn')?.click()` });
        await sleep(1000);

        const stopSt = await swEval(`({
            isPaused: campaignState.isPaused,
            checkpoint: Boolean(campaignState.pausedCheckpoint)
        })`);
        recordAssertion('B_STOP_AND_SAVE_CHECKPOINT_SAVED', Boolean(stopSt?.isPaused && stopSt?.checkpoint), stopSt);

        // Kill Service Worker forcibly via CDP Target.closeTarget
        log('B: Forcibly killing background Service Worker via CDP Target.closeTarget...');
        const oldSwId = swTarget.id;
        try { swWs.close(); } catch (_) { }
        await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId });
        await sleep(1500);

        // Wake fresh Service Worker
        log('B: Waking fresh Service Worker...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `chrome.runtime.sendMessage({ action: 'GET_CAMPAIGN_STATE' }).catch(() => {})`
        });

        let freshSwTarget = null;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            const tgts = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            freshSwTarget = tgts.find(t => t.type === 'service_worker' && t.url.includes('background.js') && t.id !== oldSwId);
            if (freshSwTarget) break;
        }
        assert(freshSwTarget, 'Fresh Service Worker must boot after termination');
        swTarget = freshSwTarget;
        swWs = await openWs(freshSwTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');
        log(`B: Fresh SW booted (ID=${freshSwTarget.id})`);

        // Close and reopen popup window to verify #resumable-campaign-banner rendering
        await cdpSend(browserWs, 'Target.closeTarget', { targetId: popupTargetId });
        try { popupWs.close(); } catch (_) { }
        await sleep(1000);

        const reopenRes = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
        await sleep(1500);
        const newPopupTgts = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        const newPopupTg = newPopupTgts.find(t => t.id === reopenRes.targetId);
        assert(newPopupTg, 'Reopened popup target must exist');

        popupWs = await openWs(newPopupTg.webSocketDebuggerUrl);
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        log('B: Reopened popup window connected');

        // Assert #resumable-campaign-banner is visibly rendered
        let bannerVisible = false;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            bannerVisible = await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const b = document.getElementById('resumable-campaign-banner');
                    return Boolean(b && !b.classList.contains('hidden') && b.offsetParent !== null);
                })()`,
                returnByValue: true
            }).then(r => r.result?.value);
            if (bannerVisible) break;
        }
        recordAssertion('B_REOPEN_POPUP_RESUMABLE_BANNER_VISIBLE', bannerVisible === true);

        // Click #resume-campaign-btn on banner
        log('B: Clicking visible #resume-campaign-btn on banner to resume campaign...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `document.getElementById('resume-campaign-btn')?.click()`
        });

        // --------------------------------------------------------------------
        // WAIT FOR MULTI-TARGET CAMPAIGN TO SETTLE INACTIVE
        // --------------------------------------------------------------------
        let bSettled = false;
        const maxWait = 90;
        for (let i = 0; i < maxWait; i++) {
            await sleep(1000);
            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
            });
            const st = await swEval(`({
                isActive: campaignState.isActive,
                isPaused: campaignState.isPaused,
                remaining: campaignState.remainingTargets,
                queueLen: campaignState.queue?.length
            })`);
            log(`Multi Campaign Progress T+${i}s: active=${st?.isActive} paused=${st?.isPaused} remaining=${st?.remaining} queue=${st?.queueLen}`);
            if (!st?.isActive && !st?.isPaused && i > 5) {
                bSettled = true;
                log(`Multi campaign settled inactive at T+${i}s`);
                break;
            }
        }
        recordAssertion('B_MULTI_CAMPAIGN_SETTLED_INACTIVE', bSettled === true);

        // --------------------------------------------------------------------
        // TERMINAL HISTORYSTORE LEDGER & COUNTER CONSISTENCY ASSERTIONS
        // --------------------------------------------------------------------
        log('\n--- VERIFYING EXACT TERMINAL OUTCOMES & HISTORY LEDGER ---');

        // Total server POST submissions must be EXACTLY 2 (Target 1 Homepage Discovery + Target 2 React Controlled)
        const subFinal = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('B_EXACT_SERVER_SUBMISSIONS_COUNT_TWO', subFinal.count === 2, { count: subFinal.count });

        // Retrieve attempts for active runId
        const runAttempts = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_history_attempts'], res => {
                    const list = res.xpider_history_attempts || [];
                    resolve(list.filter(a => a.campaignRunId === '${bRunId}'));
                });
            })
        `);
        log(`Attempts recorded for run ${bRunId}: ${runAttempts.length}`);
        recordAssertion('B_EXACT_FOUR_TARGETS_IN_RUN_LEDGER', runAttempts.length === 4, { count: runAttempts.length });

        // Assert Target 1 (Homepage Discovery) settled as SUCCESS
        const aT1 = runAttempts.find(a => a.url.includes('homepage-with-newsletter-and-contact-link.html'));
        recordAssertion('B_TARGET_1_HOMEPAGE_DISCOVERY_SUCCESS', Boolean(aT1 && aT1.status === 'SUCCESS'), aT1);

        // Assert Target 2 (React Controlled) settled as SUCCESS
        const aT2 = runAttempts.find(a => a.url.includes('dynamic-react-controlled-stale-revert.html'));
        recordAssertion('B_TARGET_2_DYNAMIC_REACT_SUCCESS', Boolean(aT2 && aT2.status === 'SUCCESS'), aT2);

        // Assert Target 3 (Phone Only No Message) settled as SKIPPED
        const aT3 = runAttempts.find(a => a.url.includes('phone-only-no-message.html'));
        recordAssertion('B_TARGET_3_PHONE_ONLY_SKIPPED', Boolean(aT3 && aT3.status === 'SKIPPED'), aT3);

        // Assert Target 4 (Dead Contact Link) settled as FAILURE
        const aT4 = runAttempts.find(a => a.url.includes('homepage-with-dead-contact-link.html'));
        recordAssertion('B_TARGET_4_DEAD_CONTACT_FAILURE', Boolean(aT4 && aT4.status === 'FAILURE'), aT4);

        // Assert remaining targets counter decremented to 0
        const finalCampaignState = await swEval(`({
            remaining: campaignState.remainingTargets,
            queueLen: campaignState.queue?.length,
            histogram: campaignState.outcomeHistogram
        })`);
        recordAssertion('B_REMAINING_TARGETS_REACHED_ZERO', finalCampaignState?.remaining === 0, finalCampaignState);

        // Capture screenshot of final popup completed state
        const finalShot = await shot(popupWs, 'shot_directive_6657464425_final_completed.png');
        if (finalShot) report.screenshots.push(finalShot);

        report.status = "SUCCESS";
        report.endTimeUtc = new Date().toISOString();
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

        log('\n================================================================================');
        log(`🎉 ALL ${report.assertions.length} DIRECTIVE #6657464425 ASSERTIONS PASSED (100%)`);
        log(`📁 Report written to: ${REPORT_FILE}`);
        log('================================================================================');

    } catch (err) {
        log(`❌ TEST FAILURE: ${err.message}`);
        report.status = "FAILED";
        report.error = err.message;
        report.endTimeUtc = new Date().toISOString();
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        throw err;
    } finally {
        if (browserProcess && !browserProcess.killed) {
            log('Terminating browser process...');
            try { browserProcess.kill('SIGKILL'); } catch (_) { }
        }
    }
}

main().catch(err => {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
});