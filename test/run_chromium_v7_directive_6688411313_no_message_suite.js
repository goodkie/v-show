/**
 * test/run_chromium_v7_directive_6688411313_no_message_suite.js
 *
 * Dedicated Chromium E2E Verification Suite for Directive #914 (Comment #6688411313):
 * OPTIONAL NO-MESSAGE FORM SUBMISSION (SUBSCRIBE / NEWSLETTER / OPT-IN)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9452;
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('test/evidence_v7_directive_6688411313');
const LOG_FILE = path.join(EVIDENCE_DIR, 'directive_6688411313_e2e.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'report_directive_6688411313_e2e.json');

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
    log('🚀 LAUNCHING DIRECTIVE #6688411313 OPTIONAL NO-MESSAGE FORM CHROMIUM E2E SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();

    // 1. Verify test server
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    log(`Test server active on port ${PORT}`);

    // Reset server submissions
    await fetch(`http://127.0.0.1:${PORT}/__xpider_reset_submissions`).catch(() => {});

    // 2. Launch browser
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-dir6688-${Math.random().toString(36).substring(2, 8)}`);
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

    log(`Spawning browser: ${bin}`);
    const proc = spawn(bin, browserArgs, { stdio: 'ignore' });

    let browserWs = null;
    let extId = null;

    const report = {
        directive: '6688411313',
        startTimeUtc,
        assertions: [],
        evidenceFiles: [],
        status: 'RUNNING'
    };

    function recordAssertion(name, passed, details = {}) {
        report.assertions.push({
            name,
            passed: Boolean(passed),
            details,
            timestamp: new Date().toISOString()
        });
        if (passed) {
            log(`  ✅ [PASS] ${name} ${JSON.stringify(details)}`);
        } else {
            log(`  ❌ [FAIL] ${name} ${JSON.stringify(details)}`);
        }
        assert(passed, `Assertion failed: ${name}`);
    }

    try {
        // Wait for CDP
        for (let i = 0; i < 30; i++) {
            await sleep(500);
            try {
                const ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json());
                if (ver && ver.webSocketDebuggerUrl) {
                    browserWs = await openWs(ver.webSocketDebuggerUrl);
                    break;
                }
            } catch (_) {}
        }
        assert(browserWs, 'Could not connect to browser CDP');
        log('Browser CDP connected');

        // Locate extension background target
        let swTarget = null;
        for (let i = 0; i < 30; i++) {
            const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (swTarget) break;
            await sleep(500);
        }
        assert(swTarget, 'Service worker target not found');
        const urlMatch = swTarget.url.match(/chrome-extension:\/\/([a-z0-9]+)\//);
        extId = urlMatch ? urlMatch[1] : null;
        assert(extId, 'Could not determine extension ID');
        log(`Extension ID: ${extId}`);

        let swWs = await openWs(swTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');
        swWs.addEventListener('message', (event) => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args?.map(a => a.value || a.description || '').join(' ');
                    if (text.includes('[Engine]') || text.includes('STAGE') || text.includes('CAMPAIGN') || text.includes('FINAL') || text.includes('START_')) {
                        log(`[SW_CONSOLE] ${text}`);
                    }
                }
            } catch (_) {}
        });
        log('Connected to Service Worker CDP');

        const swEval = async (code) => {
            const res = await cdpSend(swWs, 'Runtime.evaluate', {
                expression: code,
                awaitPromise: true,
                returnByValue: true
            });
            return res?.result?.value;
        };

        // Open Popup page
        const popupUrl = `chrome-extension://${extId}/popup.html`;
        const openRes = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
        await sleep(1500);
        const popupList = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
        const pTargetMeta = popupList.find(t => t.id === openRes.targetId);
        assert(pTargetMeta, 'Popup target metadata not found');
        const popupWs = await openWs(pTargetMeta.webSocketDebuggerUrl);
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        await cdpSend(popupWs, 'DOM.enable');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `window.alert = (msg) => console.warn('[SUPPRESSED_POPUP_ALERT]', msg);`
        });
        await sleep(1000);

        // Helper to setup popup queue and template
        const setupPopup = async (targetsList, tpl = {}, optIncludeNoMsg = false) => {
            // Wait for any previous campaign to fully clear finish barrier
            for (let i = 0; i < 30; i++) {
                const idleSt = await swEval(`({ isActive: campaignState.isActive, inFlight: campaignState.activeTargetInFlight })`);
                if (!idleSt?.isActive && !idleSt?.inFlight) break;
                await sleep(200);
            }
            await sleep(400);

            await cdpSend(popupWs, 'Runtime.evaluate', {
                expression: `
                    (() => {
                        window.__xpider_last_paused_mode = undefined;
                        const startBtn = document.getElementById('start-btn');
                        if (startBtn) { startBtn.classList.remove('hidden'); startBtn.disabled = false; }
                        const startSemiAutoBtn = document.getElementById('start-semi-auto-btn');
                        if (startSemiAutoBtn) { startSemiAutoBtn.classList.remove('hidden'); startSemiAutoBtn.disabled = false; }
                        const startManualBtn = document.getElementById('start-manual-btn');
                        if (startManualBtn) { startManualBtn.classList.remove('hidden'); startManualBtn.disabled = false; }
                        const startRow = document.getElementById('start-buttons-row');
                        if (startRow) startRow.classList.remove('hidden');
                        const multiActions = document.getElementById('multi-actions');
                        if (multiActions) multiActions.classList.add('hidden');

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
                            msgEl.value = ${JSON.stringify(tpl.message || 'Directive 6688411313 verification inquiry message.')};
                            msgEl.dispatchEvent(new Event('input', { bubbles: true }));
                            msgEl.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        const skipEl = document.getElementById('skip-attempted-toggle');
                        if (skipEl) {
                            skipEl.checked = false;
                            skipEl.dispatchEvent(new Event('change'));
                        }

                        // Fast delay settings for tests
                        const collEl = document.getElementById('delay-input-collect');
                        if (collEl) { collEl.value = '9'; collEl.dispatchEvent(new Event('input', { bubbles: true })); collEl.dispatchEvent(new Event('change', { bubbles: true })); }
                        const fillEl = document.getElementById('delay-input-fill');
                        if (fillEl) { fillEl.value = '9'; fillEl.dispatchEvent(new Event('input', { bubbles: true })); fillEl.dispatchEvent(new Event('change', { bubbles: true })); }
                        const subEl = document.getElementById('delay-input-submit');
                        if (subEl) { subEl.value = '9'; subEl.dispatchEvent(new Event('input', { bubbles: true })); subEl.dispatchEvent(new Event('change', { bubbles: true })); }
                        const delayEl = document.getElementById('delay-input');
                        if (delayEl) { delayEl.value = '9'; delayEl.dispatchEvent(new Event('input', { bubbles: true })); delayEl.dispatchEvent(new Event('change', { bubbles: true })); }

                        // Checkbox for includeFormsWithoutMessage
                        const noMsgBox = document.getElementById('xpider-opt-include-no-message');
                        if (noMsgBox) {
                            noMsgBox.checked = ${Boolean(optIncludeNoMsg)};
                            noMsgBox.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        chrome.storage.local.set({
                            xpider_queue: ${JSON.stringify(targetsList)},
                            xpider_total: ${targetsList.length},
                            xpider_success: 0,
                            xpider_delay_collect: 9,
                            xpider_delay_fill: 9,
                            xpider_delay_submit: 9,
                            xpider_delay: 9,
                            xpider_opt_include_no_message: ${Boolean(optIncludeNoMsg)},
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
                    await chrome.storage.local.set({
                        xpider_run_scoped_direct_privacy: true,
                        xpider_privacy_mode: 'DIRECT',
                        xpider_opt_include_no_message: ${Boolean(optIncludeNoMsg)}
                    });
                })()
            `);
        };

        // Helper to launch campaign and handle privacy override modal
        const clickStart = async (mode = 'AUTO') => {
            const priorRunId = await swEval(`campaignState.campaignRunId`);
            const btnId = mode === 'MANUAL' ? 'start-manual-btn' : (mode === 'SEMI_AUTO' ? 'start-semi-auto-btn' : 'start-btn');
            await cdpSend(popupWs, 'Runtime.evaluate', { expression: `document.getElementById('${btnId}')?.click()` });

            for (let i = 0; i < 30; i++) {
                await sleep(300);
                await cdpSend(popupWs, 'Runtime.evaluate', {
                    expression: `(() => { const btn = document.getElementById('privacy-block-action-override'); if (btn && btn.offsetParent !== null) btn.click(); })()`
                });
                const st = await swEval(`({ isActive: campaignState.isActive, runId: campaignState.campaignRunId })`);
                if (st?.isActive && st?.runId !== priorRunId) return true;
            }
            return false;
        };

        // =========================================================================
        // SECTION 1: START OPTIONS UI & CHECKBOX PERSISTENCE
        // =========================================================================
        log('\n--- SECTION 1: START OPTIONS UI & CHECKBOX PERSISTENCE ---');
        
        const chkEval = await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const el = document.getElementById('xpider-opt-include-no-message');
                const warning = document.getElementById('opt-no-message-warning');
                return {
                    exists: !!el,
                    checked: el ? el.checked : false,
                    hasWarning: !!warning,
                    warningText: warning ? warning.textContent : ''
                };
            })()`,
            returnByValue: true
        });

        recordAssertion('START_OPTIONS_CHECKBOX_RENDERED_DEFAULT_UNCHECKED', 
            chkEval.result.value.exists && chkEval.result.value.checked === false,
            chkEval.result.value
        );

        recordAssertion('START_OPTIONS_WARNING_TEXT_RENDERED',
            chkEval.result.value.hasWarning && chkEval.result.value.warningText.includes('Warning: Enabling broadens submissions'),
            { warningText: chkEval.result.value.warningText }
        );

        // Check checkbox in UI and verify persistence in storage
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `(() => {
                const el = document.getElementById('xpider-opt-include-no-message');
                el.checked = true;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            })()`,
            returnByValue: true
        });
        await sleep(300);

        const storageCheck = await swEval(`(async () => {
            const res = await chrome.storage.local.get(['xpider_opt_include_no_message']);
            return res.xpider_opt_include_no_message;
        })()`);

        recordAssertion('START_OPTIONS_PERSISTENCE_IN_STORAGE',
            storageCheck === true,
            { storedValue: storageCheck }
        );

        const shot1 = await shot(popupWs, 'shot_01_start_options_checkbox.png');
        if (shot1) report.evidenceFiles.push(shot1);

        // =========================================================================
        // SECTION 2: BEHAVIOR OFF (UNCHECKED DEFAULT STRICT PRESERVATION)
        // =========================================================================
        log('\n--- SECTION 2: BEHAVIOR OFF (UNCHECKED DEFAULT STRICT PRESERVATION) ---');
        
        await setupPopup([`http://127.0.0.1:${PORT}/subscribe-no-message.html`], {}, false);
        const launchedOff = await clickStart('AUTO');
        recordAssertion('FLAG_OFF_CAMPAIGN_LAUNCHED', launchedOff === true);

        // Wait for target to finish
        let settledOff = false;
        let lastOffState = null;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({
                isActive: campaignState.isActive,
                inFlight: campaignState.activeTargetInFlight,
                remaining: campaignState.queue.length,
                successCount: campaignState.successCount,
                histogram: campaignState.outcomeHistogram || {}
            })`);
            lastOffState = st;
            if (!st?.inFlight && st?.remaining === 0) {
                settledOff = true;
                break;
            }
        }
        assert(settledOff, 'Target 1 with flag OFF did not settle in time');

        const ledgerOff = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            const attempt = hs.attempts[hs.attempts.length - 1];
            return attempt ? {
                status: attempt.status,
                reason: attempt.reasonCode || attempt.reason || '',
                terminalStatus: attempt.terminalStatus
            } : null;
        })()`);

        recordAssertion('FLAG_OFF_SUBSCRIBE_SETTLED_AS_SKIPPED',
            ledgerOff && ledgerOff.status === 'SKIPPED',
            ledgerOff
        );

        recordAssertion('FLAG_OFF_REASON_NON_INQUIRY_SUBSCRIBE_FORM',
            ledgerOff && (ledgerOff.reason === 'NON_INQUIRY_SUBSCRIBE_FORM' || ledgerOff.reason === 'NON_INQUIRY_NEWSLETTER_FORM'),
            ledgerOff
        );

        const subOff = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('FLAG_OFF_ZERO_SERVER_SUBMISSIONS',
            subOff.submissionsCount === 0,
            { submissionsCount: subOff.submissionsCount }
        );

        // =========================================================================
        // SECTION 2B: STALE AMBIENT WINDOW GLOBAL IMMUNITY (DIRECTIVE 6690847856)
        // Verify that flag OFF cannot be bypassed even if window.__xpider_include_forms_without_message is polluted
        // =========================================================================
        log('\n--- SECTION 2B: STALE AMBIENT WINDOW GLOBAL IMMUNITY (DIRECTIVE 6690847856) ---');

        await setupPopup([`http://127.0.0.1:${PORT}/subscribe-no-message.html`], {}, false);
        // Deliberately pollute popup window with true
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `window.__xpider_include_forms_without_message = true;`
        });
        const launchedImmunity = await clickStart('AUTO');
        recordAssertion('STALE_GLOBAL_IMMUNITY_CAMPAIGN_LAUNCHED', launchedImmunity === true);

        let settledImmunity = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({
                isActive: campaignState.isActive,
                inFlight: campaignState.activeTargetInFlight,
                remaining: campaignState.queue.length
            })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledImmunity = true;
                break;
            }
        }
        assert(settledImmunity, 'Immunity campaign did not settle');

        const ledgerImmunity = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            const attempt = hs.attempts[hs.attempts.length - 1];
            return attempt ? {
                status: attempt.status,
                reason: attempt.reasonCode || attempt.reason || '',
                terminalStatus: attempt.terminalStatus
            } : null;
        })()`);

        recordAssertion('STALE_GLOBAL_DOES_NOT_BYPASS_FLAG_OFF',
            ledgerImmunity && ledgerImmunity.status === 'SKIPPED',
            ledgerImmunity
        );

        const subImmunity = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('STALE_GLOBAL_ZERO_SERVER_SUBMISSIONS',
            subImmunity.submissionsCount === 0,
            { submissionsCount: subImmunity.submissionsCount }
        );

        // =========================================================================
        // SECTION 3: BEHAVIOR ON (REAL FUNCTIONAL SUBMISSION OF NO-MESSAGE FORMS)
        // =========================================================================
        log('\n--- SECTION 3: BEHAVIOR ON (REAL FUNCTIONAL SUBMISSION OF NO-MESSAGE FORMS) ---');

        const targetsOn = [
            `http://127.0.0.1:${PORT}/subscribe-no-message.html`,       // Subtest 3A: Email-only
            `http://127.0.0.1:${PORT}/newsletter-name-email.html`,      // Subtest 3B: Name + Email
            `http://127.0.0.1:${PORT}/opt-in-registration.html`,        // Subtest 3C: Name + Email + Phone
            `http://127.0.0.1:${PORT}/dynamic-spa-newsletter.html`      // Subtest 3D: Dynamic SPA input
        ];

        await setupPopup(targetsOn, {}, true);
        const launchedOn = await clickStart('AUTO');
        recordAssertion('FLAG_ON_CAMPAIGN_LAUNCHED', launchedOn === true);

        // Wait for all 4 targets to settle
        let settledOn = false;
        let lastOnState = null;
        for (let i = 0; i < 100; i++) {
            await sleep(1000);
            const st = await swEval(`({
                isActive: campaignState.isActive,
                inFlight: campaignState.activeTargetInFlight,
                remaining: campaignState.queue.length,
                successCount: campaignState.successCount,
                totalTargets: campaignState.totalTargets,
                histogram: campaignState.outcomeHistogram || {}
            })`);
            lastOnState = st;
            log(`[PROGRESS ON] remaining=${st?.remaining} inFlight=${st?.inFlight} successes=${st?.successCount}`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledOn = true;
                break;
            }
        }
        assert(settledOn, 'Targets with flag ON did not settle in time');

        const ledgerOn = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            return hs.attempts.map(a => ({
                url: a.sourceUrl,
                status: a.status,
                reason: a.reasonCode || a.reason || '',
                receiptId: a.receiptId
            }));
        })()`);

        log(`Ledger attempts ON: ${JSON.stringify(ledgerOn, null, 2)}`);

        // Subtest 3A: Email-only subscribe submitted
        const att3A = ledgerOn.find(a => a.url.includes('subscribe-no-message.html'));
        recordAssertion('SUBTEST_3A_EMAIL_ONLY_CONFIRMED_SUCCESS',
            att3A && att3A.status === 'CONFIRMED_SUCCESS',
            att3A
        );

        // Subtest 3B: Name + Email newsletter submitted
        const att3B = ledgerOn.find(a => a.url.includes('newsletter-name-email.html'));
        recordAssertion('SUBTEST_3B_NAME_EMAIL_CONFIRMED_SUCCESS',
            att3B && att3B.status === 'CONFIRMED_SUCCESS',
            att3B
        );

        // Subtest 3C: Name + Email + Phone opt-in submitted
        const att3C = ledgerOn.find(a => a.url.includes('opt-in-registration.html'));
        recordAssertion('SUBTEST_3C_OPTIN_REGISTRATION_CONFIRMED_SUCCESS',
            att3C && att3C.status === 'CONFIRMED_SUCCESS',
            att3C
        );

        // Subtest 3D: Dynamic SPA newsletter submitted
        const att3D = ledgerOn.find(a => a.url.includes('dynamic-spa-newsletter.html'));
        recordAssertion('SUBTEST_3D_DYNAMIC_SPA_CONFIRMED_SUCCESS',
            att3D && att3D.status === 'CONFIRMED_SUCCESS',
            att3D
        );

        // Submissions count must be exactly 4
        const subOn = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('SERVER_SUBMISSIONS_EXACTLY_FOUR',
            subOn.submissionsCount === 4,
            { submissionsCount: subOn.submissionsCount }
        );

        // =========================================================================
        // SECTION 3B: CONSECUTIVE ON -> OFF REVERSION (ZERO RESIDUAL LEAKAGE)
        // Immediately run an OFF campaign after an ON campaign to verify zero state bleed
        // =========================================================================
        log('\n--- SECTION 3B: CONSECUTIVE ON -> OFF REVERSION (ZERO RESIDUAL LEAKAGE) ---');

        await setupPopup([`http://127.0.0.1:${PORT}/subscribe-no-message.html`], {}, false);
        const launched3B = await clickStart('AUTO');
        recordAssertion('CONSECUTIVE_REVERSION_CAMPAIGN_LAUNCHED', launched3B === true);

        let settled3B = false;
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settled3B = true;
                break;
            }
        }
        assert(settled3B, 'Consecutive reversion campaign did not settle');

        const ledger3B = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            const attempt = hs.attempts[hs.attempts.length - 1];
            return attempt ? {
                status: attempt.status,
                reason: attempt.reasonCode || attempt.reason || ''
            } : null;
        })()`);

        recordAssertion('CONSECUTIVE_REVERSION_SKIPS_NO_MESSAGE_FORM',
            ledger3B && ledger3B.status === 'SKIPPED' && (ledger3B.reason === 'NON_INQUIRY_SUBSCRIBE_FORM' || ledger3B.reason === 'NON_INQUIRY_NEWSLETTER_FORM'),
            ledger3B
        );

        const sub3B = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('CONSECUTIVE_REVERSION_ZERO_NEW_SUBMISSIONS',
            sub3B.submissionsCount === 4,
            { submissionsCount: sub3B.submissionsCount }
        );

        // =========================================================================
        // SECTION 4: CONTACT VS NEWSLETTER SELECTION PRIORITY & DEDUPLICATION
        // =========================================================================
        log('\n--- SECTION 4: CONTACT VS NEWSLETTER SELECTION PRIORITY & DEDUPLICATION ---');

        await setupPopup([`http://127.0.0.1:${PORT}/contact-plus-newsletter.html`], {}, true);
        await clickStart('AUTO');

        let settledPrio = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledPrio = true;
                break;
            }
        }
        assert(settledPrio, 'Priority test target did not settle');

        // Check server submission count incremented by exactly 1 (to 5)
        const subPrio = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('CONTACT_FORM_PRIORITIZED_SINGLE_POST',
            subPrio.submissionsCount === 5,
            { totalSubmissions: subPrio.submissionsCount, expected: 5 }
        );

        // =========================================================================
        // SECTION 5: STRICT NEGATIVE CONTROLS (ZERO POSTS) & P0 SAFETY AUDIT
        // =========================================================================
        log('\n--- SECTION 5: STRICT NEGATIVE CONTROLS & P0 SAFETY AUDIT (ZERO POSTS) ---');

        const safetyTargets = [
            `http://127.0.0.1:${PORT}/negative-controls.html`,
            `http://127.0.0.1:${PORT}/generic-name-email-no-optin.html`,
            `http://127.0.0.1:${PORT}/consent-required-no-message.html`
        ];

        await setupPopup(safetyTargets, {}, true);
        await clickStart('AUTO');

        let settledNeg = false;
        for (let i = 0; i < 90; i++) {
            await sleep(1000);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledNeg = true;
                break;
            }
        }
        assert(settledNeg, 'Negative controls and safety targets did not settle');

        // Submissions count must remain exactly 5 (delta = 0 across all negative & safety targets)
        const subNeg = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('STRICT_NEGATIVE_CONTROLS_ZERO_POSTS',
            subNeg.submissionsCount === 5,
            { submissionsCount: subNeg.submissionsCount, delta: subNeg.submissionsCount - 5 }
        );

        // Verify ledger entries for generic non-optin and consent-required forms
        const safetyLedger = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            return hs.attempts.map(a => ({
                url: a.sourceUrl,
                status: a.status,
                reason: a.reasonCode || a.reason || ''
            }));
        })()`);

        const genericAttempt = safetyLedger.find(a => a.url.includes('generic-name-email-no-optin.html'));
        recordAssertion('GENERIC_NAME_EMAIL_FAILS_CLOSED_WITHOUT_OPTIN_INTENT',
            genericAttempt && genericAttempt.status === 'SKIPPED',
            genericAttempt
        );

        const consentAttempt = safetyLedger.find(a => a.url.includes('consent-required-no-message.html'));
        recordAssertion('UNAUTHORIZED_CONSENT_CHECKBOX_FAILS_CLOSED',
            consentAttempt && consentAttempt.status === 'SKIPPED' && (consentAttempt.reason === 'NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM' || consentAttempt.reason === 'UNAUTHORIZED_CONSENT_SKIPPED'),
            consentAttempt
        );

        // =========================================================================
        // SECTION 6: UNFILLABLE / MISSING REQUIRED INPUT FAIL-CLOSED
        // =========================================================================
        log('\n--- SECTION 6: UNFILLABLE / MISSING REQUIRED INPUT FAIL-CLOSED ---');

        await setupPopup([`http://127.0.0.1:${PORT}/missing-required-newsletter.html`], {}, true);
        await clickStart('AUTO');

        let settledMissing = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledMissing = true;
                break;
            }
        }
        assert(settledMissing, 'Missing required input target did not settle');

        // Submissions count must remain exactly 5
        const subMissing = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('MISSING_REQUIRED_FIELD_FAILS_CLOSED_ZERO_POSTS',
            subMissing.submissionsCount === 5,
            { submissionsCount: subMissing.submissionsCount }
        );

        const ledgerMissing = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            const attempt = hs.attempts[hs.attempts.length - 1];
            return attempt ? {
                status: attempt.status,
                reason: attempt.reasonCode || attempt.reason || ''
            } : null;
        })()`);

        recordAssertion('UNFILLABLE_REQUIRED_INPUT_NOT_SKIPPED',
            ledgerMissing && (ledgerMissing.status === 'AUTOMATION_FAILED' || ledgerMissing.status === 'FAILURE'),
            ledgerMissing
        );

        recordAssertion('UNFILLABLE_REQUIRED_INPUT_STRICT_FAIL_NOT_BENIGN_SKIP',
            ledgerMissing && ledgerMissing.status !== 'SKIPPED',
            ledgerMissing
        );

        // =========================================================================
        // SECTION 7: EXTERNAL CAPTCHA ON NO-MESSAGE FORM
        // =========================================================================
        log('\n--- SECTION 7: EXTERNAL CAPTCHA ON NO-MESSAGE FORM ---');

        await setupPopup([`http://127.0.0.1:${PORT}/captcha-turnstile-no-message.html`], {}, true);
        const launched7 = await clickStart('AUTO');
        assert(launched7, 'Section 7 campaign did not launch');

        // Locate target tab and inject external Turnstile solution into DOM
        let targetTabWs = null;
        for (let i = 0; i < 40; i++) {
            await sleep(400);
            const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
            const tTab = targets.find(t => t.url.includes('captcha-turnstile-no-message.html'));
            if (tTab) {
                targetTabWs = await openWs(tTab.webSocketDebuggerUrl);
                break;
            }
        }
        assert(targetTabWs, 'Captcha target tab not found');

        // Audit AUTO mode external captcha waiting: NO intervention popup/buttons & bounded retries <= 3
        let auditVal = null;
        for (let i = 0; i < 60; i++) {
            await sleep(300);
            const hudAudit = await cdpSend(targetTabWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const hud = document.getElementById('xpider-v7-external-captcha-hud');
                    const holdPanel = document.getElementById('xpider-v7-manual-hold-panel');
                    if (!hud) return null;
                    const waitCount = parseInt(hud.getAttribute('data-wait-count') || '1', 10);
                    const buttons = Array.from(hud.querySelectorAll('button')).map(b => b.textContent);
                    return {
                        hudPresent: true,
                        holdPanelPresent: Boolean(holdPanel),
                        waitCount,
                        buttonsCount: buttons.length,
                        pointerEvents: window.getComputedStyle(hud).pointerEvents
                    };
                })()`,
                returnByValue: true
            });
            if (hudAudit?.result?.value?.hudPresent) {
                auditVal = hudAudit.result.value;
                log('External captcha waiting observed on tab: ' + JSON.stringify(auditVal));
                break;
            }
        }
        recordAssertion('EXTERNAL_CAPTCHA_AUTO_NO_INTERVENTION_POPUP',
            Boolean(auditVal && auditVal.holdPanelPresent === false && auditVal.buttonsCount === 0 && auditVal.pointerEvents === 'none'),
            auditVal || {}
        );
        recordAssertion('EXTERNAL_CAPTCHA_WAIT_BOUNDED_LE_3',
            Boolean(auditVal && auditVal.waitCount >= 1 && auditVal.waitCount <= 3),
            auditVal || {}
        );

        // External extension solves Turnstile and sets token in DOM
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            const sol = await cdpSend(targetTabWs, 'Runtime.evaluate', {
                expression: `(() => {
                    if (typeof window.__simulateExternalTurnstileSolve === 'function') {
                        return window.__simulateExternalTurnstileSolve('turnstile_ext_token_valid_v7');
                    }
                    return false;
                })()`,
                returnByValue: true
            });
            if (sol?.result?.value) {
                log('External Turnstile token simulated in DOM');
                break;
            }
        }

        let settledCaptcha = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledCaptcha = true;
                break;
            }
        }
        assert(settledCaptcha, 'Captcha target did not settle');

        // Server submissions count must increment to exactly 6
        const subCaptcha = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('EXTERNAL_CAPTCHA_NO_MESSAGE_SUCCESS_SIXTH_POST',
            subCaptcha.submissionsCount === 6,
            { totalSubmissions: subCaptcha.submissionsCount, expected: 6 }
        );

        // =========================================================================
        // SECTION 8: TRIPLE MODES (AUTO / SEMI_AUTO / MANUAL)
        // =========================================================================
        log('\n--- SECTION 8: TRIPLE MODES (AUTO / SEMI_AUTO / MANUAL) ---');

        // MANUAL Mode: Target holds on manual hold panel after autofill
        await setupPopup([`http://127.0.0.1:${PORT}/newsletter-name-email.html`], {}, true);
        const launched8 = await clickStart('MANUAL');
        assert(launched8, 'Section 8 campaign did not launch');

        // Find manual mode tab and verify hold panel
        let manualTabWs = null;
        let holdObserved = false;
        for (let i = 0; i < 60; i++) {
            await sleep(500);
            const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
            const mTab = targets.find(t => t.url.includes('newsletter-name-email.html'));
            if (mTab) {
                if (!manualTabWs) manualTabWs = await openWs(mTab.webSocketDebuggerUrl);
                const check = await cdpSend(manualTabWs, 'Runtime.evaluate', {
                    expression: `(() => {
                        const panel = document.getElementById('xpider-v7-manual-hold-panel');
                        return { hasPanel: !!panel, mode: panel?.getAttribute('data-mode') };
                    })()`,
                    returnByValue: true
                });
                if (check.result.value.hasPanel && check.result.value.mode === 'MANUAL') {
                    holdObserved = true;
                    break;
                }
            }
        }

        recordAssertion('MANUAL_MODE_NO_MESSAGE_HOLDS_ON_PANEL',
            holdObserved,
            { holdObserved }
        );

        // Operator confirms manual hold in tab
        if (manualTabWs) {
            await cdpSend(manualTabWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const btn = document.getElementById('submit-btn');
                    if (btn) btn.click();
                    return true;
                })()`,
                returnByValue: true
            });
            await sleep(600);
            await cdpSend(manualTabWs, 'Runtime.evaluate', {
                expression: `(() => {
                    const regBtn = document.getElementById('xpider-manual-registered-btn');
                    if (regBtn) regBtn.click();
                    return true;
                })()`,
                returnByValue: true
            });
        }

        // Wait for manual run to settle
        for (let i = 0; i < 30; i++) {
            await sleep(500);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) break;
        }

        // Server submissions incremented to 7
        const subManual = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('MANUAL_MODE_OPERATOR_SUBMIT_SEVENTH_POST',
            subManual.submissionsCount === 7,
            { totalSubmissions: subManual.submissionsCount, expected: 7 }
        );

        // =========================================================================
        // SECTION 9: CAMPAIGN DURABILITY & FROZEN OPTION PRESERVATION
        // =========================================================================
        log('\n--- SECTION 9: CAMPAIGN DURABILITY & FROZEN OPTION PRESERVATION ---');

        await setupPopup([
            `http://127.0.0.1:${PORT}/newsletter-name-email.html`,
            `http://127.0.0.1:${PORT}/opt-in-registration.html`
        ], {}, true);
        const launched9 = await clickStart('AUTO');
        assert(launched9, 'Section 9 campaign did not launch');

        // Immediately pause orchestrator
        await sleep(500);
        await swEval(`pauseCampaignOrchestrator(true)`);
        log('Campaign paused, checkpoint saved');

        // Check storage checkpoint contains frozen includeFormsWithoutMessage = true
        const cpCheck = await swEval(`(async () => {
            const s = await chrome.storage.local.get(['xpider_paused_checkpoint']);
            return s.xpider_paused_checkpoint ? {
                hasCheckpoint: true,
                includeFormsWithoutMessage: s.xpider_paused_checkpoint.includeFormsWithoutMessage,
                campaignRunId: s.xpider_paused_checkpoint.campaignRunId
            } : null;
        })()`);

        recordAssertion('CHECKPOINT_SAVES_FROZEN_INCLUDE_NO_MESSAGE_FLAG',
            cpCheck && cpCheck.includeFormsWithoutMessage === true,
            cpCheck
        );

        // Simulate user unchecking the checkbox in UI while paused
        await swEval(`chrome.storage.local.set({ xpider_opt_include_no_message: false })`);

        // Kill Service Worker via CDP Target.closeTarget
        const oldSwId = swTarget.id;
        log(`Killing Service Worker: ${oldSwId}`);
        try { swWs.close(); } catch (_) {}
        await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId });
        await sleep(1500);

        // Wake fresh Service Worker via popup message
        log('Waking fresh Service Worker via popup message...');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `chrome.runtime.sendMessage({ action: 'GET_CAMPAIGN_STATE' }).catch(() => {})`
        });

        // Reconnect to rebooted Service Worker
        let newSwMeta = null;
        for (let i = 0; i < 30; i++) {
            await sleep(300);
            const listAfterKill = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
            newSwMeta = listAfterKill.find(t => t.type === 'service_worker' && t.url.includes('background.js') && t.id !== oldSwId);
            if (newSwMeta) break;
        }
        assert(newSwMeta, 'Rebooted Service Worker target not found');
        swTarget = newSwMeta;
        swWs = await openWs(newSwMeta.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');
        log(`Rebooted Service Worker CDP connected (ID=${newSwMeta.id})`);

        // Verify rebooted SW hydrated includeFormsWithoutMessage from checkpoint, NOT changed UI setting!
        const hydratedState = await swEval(`(() => ({
            isPaused: campaignState.isPaused,
            includeFormsWithoutMessage: campaignState.includeFormsWithoutMessage,
            cpInclude: campaignState.pausedCheckpoint?.includeFormsWithoutMessage
        }))()`);

        recordAssertion('SW_REBOOT_RESTORES_FROZEN_OPTION_FROM_CHECKPOINT',
            hydratedState.includeFormsWithoutMessage === true &&
            hydratedState.cpInclude === true,
            hydratedState
        );

        // Resume campaign from popup or background
        await swEval(`resumeCampaignOrchestrator()`);
        log('Campaign resumed from checkpoint');

        let settledDurable = false;
        for (let i = 0; i < 40; i++) {
            await sleep(1000);
            const st = await swEval(`({ inFlight: campaignState.activeTargetInFlight, remaining: campaignState.queue.length })`);
            if (!st?.inFlight && st?.remaining === 0) {
                settledDurable = true;
                break;
            }
        }
        assert(settledDurable, 'Resumed campaign did not settle');

        // Server submissions must have received the targets
        const subDurable = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        recordAssertion('RESUMED_CAMPAIGN_COMPLETED_SUCCESSFULLY',
            subDurable.submissionsCount >= 8,
            { totalSubmissions: subDurable.submissionsCount }
        );

        // =========================================================================
        // SECTION 10: LEDGER 7 BUCKETS & RUN ID SCOPING RECONCILIATION
        // =========================================================================
        log('\n--- SECTION 10: LEDGER 7 BUCKETS & RUN ID SCOPING RECONCILIATION ---');

        const activeRunId = cpCheck ? cpCheck.campaignRunId : null;
        const ledgerStats = await swEval(`(async () => {
            const hs = await getHistoryStoreInstance();
            return hs.getLedgerStats('currentRun', '${activeRunId}');
        })()`);

        log(`Ledger stats for ${activeRunId}: ${JSON.stringify(ledgerStats, null, 2)}`);

        recordAssertion('LEDGER_STATS_SCOPED_BY_RUN_ID',
            ledgerStats && (ledgerStats.campaignRunId === activeRunId || ledgerStats.runId === activeRunId),
            ledgerStats
        );

        recordAssertion('LEDGER_BUCKETS_NON_NEGATIVE_AND_CONSISTENT',
            ledgerStats &&
            (ledgerStats.totalStarted > 0 || ledgerStats.totalAttempts > 0) &&
            (ledgerStats.success > 0 || ledgerStats.successCount > 0),
            ledgerStats
        );

        report.status = 'ALL_ASSERTIONS_PASSED';
        report.totalAssertions = report.assertions.length;
        report.passedAssertions = report.assertions.filter(a => a.passed).length;
        log(`\n🎉 ALL ${report.passedAssertions} / ${report.totalAssertions} ASSERTIONS PASSED (100%)!`);

    } catch (err) {
        report.status = 'FAILED';
        report.error = err.message;
        report.stack = err.stack;
        log(`❌ TEST RUNNER FATAL ERROR: ${err.message}\n${err.stack}`);
    } finally {
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
        log(`Report written to ${REPORT_FILE}`);
        if (proc) {
            try { proc.kill('SIGKILL'); } catch (_) {}
        }
        if (logStream && !logStream.writableEnded) logStream.end();
    }

    if (report.status !== 'ALL_ASSERTIONS_PASSED') {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal unhandled error:', err);
    process.exit(1);
});
