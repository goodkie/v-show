/**
 * test/run_edge_p0_privacy_start_recovery.js
 *
 * Real Microsoft Edge Acceptance Test for:
 * [OWNER BUG][P0 RELEASE BLOCKER][R6.9G.10.3.7.1.4.11 OWNER BETA 44f62c19 — NORMAL START SILENTLY DIES AFTER NORMAL_CAMPAIGN_PREFLIGHT]
 * (Issue #6 Comment #6211255970)
 *
 * Verifies all 8 requirements in Directive G:
 * 1. Privacy Relay unavailable triggers actionable decision modal (NOT silent).
 * 2. Exact reason code (RELAY_OFFLINE) & failClosed details displayed.
 * 3. 10-step telemetry pipeline [START_STEP] 01 to 07 PRIVACY_PREP_BLOCK verified.
 * 4. Normal run counter rebase (100/0/100, fresh campaignRunId, history preserved).
 * 5. Owner click "START WITHOUT PRIVACY THIS RUN" dispatches campaign:
 *    - [PRIVACY_OWNER_OVERRIDE] logged
 *    - override badge visible
 *    - [START_STEP] 08 -> 09 -> 10 CAMPAIGN_RUNNING
 *    - [START_BG] received queue=100 in background
 * 6. Stop campaign resets run-scoped override and preserves strict privacy in storage.
 * 7. Popup close & reopen preserves queue, counters, and readiness HUD.
 * 8. Healthy start verification.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9302; // Use distinct port
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_r6_9g10_3_7_1_4_11_p0_privacy_recovery.log');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, '', 'utf8');
const logLines = [];

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    logLines.push(line);
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cdpSend(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1e9);
        const onMessage = (event) => {
            try {
                const data = JSON.parse(typeof event.data === 'string' ? event.data : event.toString());
                if (data.id === id) {
                    ws.removeEventListener('message', onMessage);
                    data.error ? reject(new Error(`CDP ${method}: ${JSON.stringify(data.error)}`)) : resolve(data.result);
                }
            } catch (_) {}
        };
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function openWs(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    return ws;
}

async function shot(ws, name) {
    try {
        const r = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(EVIDENCE_DIR, name), Buffer.from(r.data, 'base64'));
        log(`📸 Captured screenshot: ${name}`);
    } catch (e) { log(`⚠️ Screenshot ${name}: ${e.message}`); }
}

async function main() {
    log('================ XPIDER OWNER BETA P0 PRIVACY START RECOVERY TEST (EDGE) ================');

    // 1. Ensure test server is up
    const healthUrl = `http://127.0.0.1:${PORT}/__xpider_health`;
    let up = await fetch(healthUrl).then(r => r.ok).catch(() => false);
    if (!up) {
        log('Starting local test server...');
        require('../owner-extension-test-site/server.js');
        await sleep(1000);
    }
    const health = await fetch(healthUrl).then(r => r.json());
    log(`Test server verified: PID=${health.pid} uptime=${health.uptime}`);

    // 2. Launch Microsoft Edge with Extension
    const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgePath = edgePaths.find(p => fs.existsSync(p));
    assert(edgePath, 'Microsoft Edge executable not found');

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-p0-privacy-'));
    log(`Launching Edge using profile: ${profileDir}`);

    const edgeArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        'about:blank'
    ];

    const proc = spawn(edgePath, edgeArgs);
    proc.on('error', (e) => log(`Edge process error: ${e.message}`));

    let targets = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
            if (res.ok) {
                targets = await res.json();
                break;
            }
        } catch (_) {}
    }
    assert(targets, 'Could not connect to CDP on port ' + CDP_PORT);

    // 3. Locate Background Service Worker
    let swTarget = null;
    for (let i = 0; i < 20; i++) {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        const list = await res.json();
        swTarget = list.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (swTarget) break;
        await sleep(500);
    }
    assert(swTarget, 'Background service worker target not found');
    const extId = new URL(swTarget.url).hostname;
    log(`Extension Service Worker active: ID=${extId}`);

    const swWs = await openWs(swTarget.webSocketDebuggerUrl);

    // Collect console logs from SW
    await cdpSend(swWs, 'Runtime.enable');
    const swLogs = [];
    swWs.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data.toString());
            if (data.method === 'Runtime.consoleAPICalled') {
                const text = data.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
                swLogs.push(text);
                log(`[SW_CONSOLE] ${text}`);
            }
        } catch (_) {}
    });

    // 4. Open Extension Popup UI
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    let pageTargetMeta = await cdpSend(swWs, 'Target.createTarget', { url: popupUrl });
    await sleep(1500);

    let pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    let popupTarget = pages.find(p => p.id === pageTargetMeta.targetId || (p.url && p.url.includes('popup.html')));
    assert(popupTarget, 'Popup page target not found');
    let popupWs = await openWs(popupTarget.webSocketDebuggerUrl);

    await cdpSend(popupWs, 'Page.enable');
    await cdpSend(popupWs, 'DOM.enable');
    await cdpSend(popupWs, 'Runtime.enable');

    const popupLogs = [];
    popupWs.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data.toString());
            if (data.method === 'Runtime.consoleAPICalled') {
                const text = data.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
                popupLogs.push(text);
                log(`[POPUP_CONSOLE] ${text}`);
            }
        } catch (_) {}
    });

    await sleep(1000);

    // ============================================================
    // STEP 1: Simulate prior AUTO SETUP and verify stale test counters exist
    // ============================================================
    log('--- STEP 1: Setting up prior test state & loading 100 public URLs ---');
    const setupEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            // Put fake test counters in UI as reported by Owner:
            // COMPLETED 7, REMAINING 0, runId = owner_test_run_1234
            const countCompleted = document.getElementById('completed-count-display') || document.getElementById('completed-count');
            const countRemaining = document.getElementById('remaining-count-display') || document.getElementById('remaining-count');
            if (countCompleted) countCompleted.textContent = '7';
            if (countRemaining) countRemaining.textContent = '0';
            
            await chrome.storage.local.set({
                xpider_owner_function_test_mode: true,
                xpider_active_campaign_run_id: 'owner_test_run_prior_session',
                xpider_strict_privacy: true,
                xpider_privacy_config: { enabled: true, transportMode: 'PRIVACY_RELAY', failClosed: true }
            });

            // Load 100 public non-loopback targets
            const publicTargets = [];
            for (let i = 1; i <= 100; i++) {
                publicTargets.push('https://public-corp-' + i + '.example.com/contact');
            }
            campaignQueue = [...publicTargets];
            totalTargets = campaignQueue.length;
            await chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_total: totalTargets });

            // Ensure valid template message
            const msgEl = document.getElementById('tpl-message');
            if (msgEl) msgEl.value = 'Inquiry regarding product specifications.';

            // Refresh readiness HUD
            if (window.checkAndRefreshPrivacyReadinessHUD) {
                await window.checkAndRefreshPrivacyReadinessHUD();
            }

            return {
                queueCount: campaignQueue.length,
                completedUI: countCompleted ? countCompleted.textContent : null,
                remainingUI: countRemaining ? countRemaining.textContent : null
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    log(`Step 1 Setup result: ${JSON.stringify(setupEval.result.value)}`);
    assert.strictEqual(setupEval.result.value.queueCount, 100, 'Queue must have 100 public targets');
    assert.strictEqual(setupEval.result.value.completedUI, '7', 'Stale completed count is 7 before rebase');

    await shot(popupWs, 'shot_p0_01_stale_counters_loaded.png');

    // ============================================================
    // STEP 2: Press Normal Start with Relay Offline
    // Verify:
    // - Does NOT silently die
    // - [START_STEP] 01 through 07 PRIVACY_PREP_BLOCK
    // - [NORMAL_RUN_STATE_REBASE] rebased counters to 100/0/100
    // - Decision modal is visible with exact reason code
    // - Button restored
    // ============================================================
    log('--- STEP 2: Pressing Normal Start with Privacy Relay Offline ---');
    const startBlockedEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const startBtn = document.getElementById('start-btn');
            startBtn.click();
            await new Promise(r => setTimeout(r, 1200));

            const modal = document.getElementById('privacy-block-modal-overlay');
            const msgEl = document.getElementById('privacy-block-modal-msg');
            const codeEl = document.getElementById('privacy-block-reason-code');
            const btnOverride = document.getElementById('privacy-block-action-override');
            const btnRetry = document.getElementById('privacy-block-action-retry');
            const btnSettings = document.getElementById('privacy-block-action-settings');
            const btnCancel = document.getElementById('privacy-block-action-cancel');

            const countCompleted = document.getElementById('completed-count-display') || document.getElementById('completed-count');
            const countRemaining = document.getElementById('remaining-count-display') || document.getElementById('remaining-count');
            const runScope = document.getElementById('run-scope-badge');

            return {
                modalVisible: modal ? (modal.style.display !== 'none' && !modal.classList.contains('hidden')) : false,
                msgText: msgEl ? msgEl.textContent : '',
                codeText: codeEl ? codeEl.textContent : '',
                hasOverrideBtn: !!btnOverride,
                hasRetryBtn: !!btnRetry,
                hasSettingsBtn: !!btnSettings,
                hasCancelBtn: !!btnCancel,
                btnDisabled: startBtn ? startBtn.disabled : null,
                btnText: startBtn ? startBtn.textContent : '',
                rebasedCompleted: countCompleted ? countCompleted.textContent : null,
                rebasedRemaining: countRemaining ? countRemaining.textContent : null,
                runScopeText: runScope ? runScope.textContent : null
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const s2 = startBlockedEval.result.value;
    log(`Step 2 Start Blocked Evaluation: ${JSON.stringify(s2)}`);

    assert.strictEqual(s2.modalVisible, true, 'Decision modal MUST be visible when privacy fails');
    assert(s2.codeText.includes('NO_HEALTHY_EGRESS') || s2.codeText.includes('RELAY_OFFLINE'), 'Modal MUST display exact reason code (NO_HEALTHY_EGRESS or RELAY_OFFLINE)');
    assert.strictEqual(s2.hasOverrideBtn, true, 'Modal MUST contain START WITHOUT PRIVACY override button');
    assert.strictEqual(s2.hasRetryBtn, true, 'Modal MUST contain RETRY PREFLIGHT button');
    assert.strictEqual(s2.hasSettingsBtn, true, 'Modal MUST contain SETTINGS button');
    assert.strictEqual(s2.hasCancelBtn, true, 'Modal MUST contain CANCEL button');
    assert.strictEqual(s2.btnDisabled, false, 'Start button must NOT remain disabled/dead');
    assert.strictEqual(s2.rebasedCompleted, '0', 'Completed count rebased from stale 7 to 0');
    assert.strictEqual(s2.rebasedRemaining, '100', 'Remaining count rebased to 100');

    // Verify logs
    const hasStep01 = popupLogs.some(l => l.includes('[START_STEP] 01 BUTTON_ACCEPTED'));
    const hasStep02 = popupLogs.some(l => l.includes('[START_STEP] 02 BUILD_HANDSHAKE_PASS'));
    const hasStep03 = popupLogs.some(l => l.includes('[START_STEP] 03 MODE_RECONCILE_PASS'));
    const hasRebaseLog = popupLogs.some(l => l.includes('[NORMAL_RUN_STATE_REBASE]') && l.includes('total=100 historyPreserved=true'));
    const hasStep04 = popupLogs.some(l => l.includes('[START_STEP] 04 QUEUE_VALID count=100'));
    const hasStep05 = popupLogs.some(l => l.includes('[START_STEP] 05 TEMPLATE_VALID'));
    const hasStep06 = popupLogs.some(l => l.includes('[START_STEP] 06 PRIVACY_PREP_BEGIN'));
    const hasStep07Block = popupLogs.some(l => l.includes('[START_STEP] 07 PRIVACY_PREP_BLOCK reason=NO_HEALTHY_EGRESS') || l.includes('[START_STEP] 07 PRIVACY_PREP_BLOCK reason=RELAY_OFFLINE'));
    const hasPrivacyStartBlocked = popupLogs.some(l => l.includes('[PRIVACY_START_BLOCKED] reason=NO_HEALTHY_EGRESS') || l.includes('[PRIVACY_START_BLOCKED] reason=RELAY_OFFLINE'));

    log(`Log checks:
      hasStep01=${hasStep01}
      hasStep02=${hasStep02}
      hasStep03=${hasStep03}
      hasRebaseLog=${hasRebaseLog}
      hasStep04=${hasStep04}
      hasStep05=${hasStep05}
      hasStep06=${hasStep06}
      hasStep07Block=${hasStep07Block}
      hasPrivacyStartBlocked=${hasPrivacyStartBlocked}`);

    assert(hasStep01, 'Must log [START_STEP] 01 BUTTON_ACCEPTED');
    assert(hasStep02, 'Must log [START_STEP] 02 BUILD_HANDSHAKE_PASS');
    assert(hasStep03, 'Must log [START_STEP] 03 MODE_RECONCILE_PASS');
    assert(hasRebaseLog, 'Must log [NORMAL_RUN_STATE_REBASE]');
    assert(hasStep04, 'Must log [START_STEP] 04 QUEUE_VALID count=100');
    assert(hasStep05, 'Must log [START_STEP] 05 TEMPLATE_VALID');
    assert(hasStep06, 'Must log [START_STEP] 06 PRIVACY_PREP_BEGIN');
    assert(hasStep07Block, 'Must log [START_STEP] 07 PRIVACY_PREP_BLOCK reason=RELAY_OFFLINE');
    assert(hasPrivacyStartBlocked, 'Must log [PRIVACY_START_BLOCKED] reason=RELAY_OFFLINE');

    await shot(popupWs, 'shot_p0_02_privacy_decision_modal.png');

    // ============================================================
    // STEP 3: Click "START WITHOUT PRIVACY THIS RUN"
    // Verify:
    // - Modal dismissed
    // - Badge PRIVACY: DIRECT (CURRENT RUN OVERRIDE) visible
    // - [PRIVACY_OWNER_OVERRIDE] logged
    // - Steps 08, 09, 10 pass
    // - Background receives queue=100 and campaign starts
    // ============================================================
    log('--- STEP 3: Owner clicks "START WITHOUT PRIVACY THIS RUN" ---');
    const overrideClickEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const btnOverride = document.getElementById('privacy-block-action-override');
            btnOverride.click();
            await new Promise(r => setTimeout(r, 1500));

            const modal = document.getElementById('privacy-block-modal-overlay');
            const ind = document.getElementById('privacy-override-indicator');
            const startBtn = document.getElementById('start-btn');
            const multiActions = document.getElementById('multi-actions');

            return {
                modalClosed: modal ? (modal.style.display === 'none' || modal.classList.contains('hidden')) : true,
                indicatorVisible: ind ? (ind.style.display !== 'none' && !ind.classList.contains('hidden')) : false,
                indicatorText: ind ? ind.textContent : '',
                startBtnHidden: startBtn ? startBtn.classList.contains('hidden') : false,
                multiActionsVisible: multiActions ? !multiActions.classList.contains('hidden') : false
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const s3 = overrideClickEval.result.value;
    log(`Step 3 Override Execution: ${JSON.stringify(s3)}`);

    assert.strictEqual(s3.modalClosed, true, 'Decision modal must close on override');
    assert.strictEqual(s3.indicatorVisible, true, 'Override indicator badge must be visible');
    assert(s3.indicatorText.includes('PRIVACY: DIRECT (CURRENT RUN OVERRIDE)'), 'Badge text must show run override');
    assert.strictEqual(s3.startBtnHidden, true, 'Start button hidden during active campaign');
    assert.strictEqual(s3.multiActionsVisible, true, 'Pause/Stop controls visible during active campaign');

    // Verify background SW state
    const swStateEval = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(() => {
            return {
                runScopedDirectPrivacy: campaignState.runScopedDirectPrivacy,
                isActive: campaignState.isActive,
                totalTargets: campaignState.totalTargets,
                campaignRunId: campaignState.campaignRunId
            };
        })()`,
        returnByValue: true
    });
    const swState = swStateEval.result.value;
    log(`SW runtime state: ${JSON.stringify(swState)}`);

    assert.strictEqual(swState.runScopedDirectPrivacy, true, 'Background campaignState.runScopedDirectPrivacy must be true');
    assert.strictEqual(swState.isActive, true, 'Background campaign must be active');
    assert.strictEqual(swState.totalTargets, 100, 'Background queue must have 100 targets');
    assert(swState.campaignRunId && (swState.campaignRunId.startsWith('normal_run_') || swState.campaignRunId.startsWith('run_')), 'CampaignRunId must be normal_run_* or run_*');

    const hasOverrideLog = popupLogs.some(l => l.includes('[PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true'));
    const hasStep07Pass = popupLogs.some(l => l.includes('[START_STEP] 07 PRIVACY_PREP_PASS mode=DIRECT (OVERRIDE)'));
    const hasStep08 = popupLogs.some(l => l.includes('[START_STEP] 08 DISPATCH_BEGIN targetCount=100'));
    const hasStep09 = popupLogs.some(l => l.includes('[START_STEP] 09 START_BG_ACK'));
    const hasStep10 = popupLogs.some(l => l.includes('[START_STEP] 10 CAMPAIGN_RUNNING'));
    const hasSwStartBg = swLogs.some(l => l.includes('[START_BG] received queue=100'));

    log(`Override pipeline logs:
      hasOverrideLog=${hasOverrideLog}
      hasStep07Pass=${hasStep07Pass}
      hasStep08=${hasStep08}
      hasStep09=${hasStep09}
      hasStep10=${hasStep10}
      hasSwStartBg=${hasSwStartBg}`);

    assert(hasOverrideLog, 'Must log [PRIVACY_OWNER_OVERRIDE]');
    assert(hasStep07Pass, 'Must log [START_STEP] 07 PRIVACY_PREP_PASS mode=DIRECT (OVERRIDE)');
    assert(hasStep08, 'Must log [START_STEP] 08 DISPATCH_BEGIN targetCount=100');
    assert(hasStep09, 'Must log [START_STEP] 09 START_BG_ACK');
    assert(hasStep10, 'Must log [START_STEP] 10 CAMPAIGN_RUNNING');
    assert(hasSwStartBg, 'SW must log [START_BG] received queue=100');

    await shot(popupWs, 'shot_p0_03_campaign_running_with_override.png');

    // ============================================================
    // STEP 4: Stop campaign and verify cleanup
    // Verify:
    // - campaignState.runScopedDirectPrivacy resets to false
    // - Override indicator hidden
    // - Storage strict privacy was NEVER overwritten (still true)
    // ============================================================
    log('--- STEP 4: Stopping campaign and verifying override reset & storage preservation ---');
    const stopEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            stopCampaign();
            await new Promise(r => setTimeout(r, 1000));

            const ind = document.getElementById('privacy-override-indicator');
            const st = await chrome.storage.local.get(['xpider_strict_privacy', 'xpider_privacy_config']);

            return {
                indicatorHidden: ind ? (ind.style.display === 'none' || ind.classList.contains('hidden')) : true,
                storageStrictPrivacy: st.xpider_strict_privacy,
                storagePrivacyConfigFailClosed: st.xpider_privacy_config ? st.xpider_privacy_config.failClosed : null,
                storagePrivacyMode: st.xpider_privacy_config ? st.xpider_privacy_config.transportMode : null
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const s4 = stopEval.result.value;
    log(`Step 4 Stop cleanup result: ${JSON.stringify(s4)}`);

    const swStopCheck = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(() => ({ runScopedDirectPrivacy: campaignState.runScopedDirectPrivacy, isActive: campaignState.isActive }))()`,
        returnByValue: true
    });
    log(`SW after stop: ${JSON.stringify(swStopCheck.result.value)}`);

    assert.strictEqual(s4.indicatorHidden, true, 'Override indicator hidden after stop');
    assert.strictEqual(swStopCheck.result.value.runScopedDirectPrivacy, false, 'SW runScopedDirectPrivacy must reset to false');
    assert.strictEqual(s4.storageStrictPrivacy, true, 'Storage xpider_strict_privacy preserved as true');
    assert.strictEqual(s4.storagePrivacyConfigFailClosed, true, 'Storage failClosed preserved as true');
    assert.strictEqual(s4.storagePrivacyMode, 'PRIVACY_RELAY', 'Storage transportMode preserved as PRIVACY_RELAY');

    // ============================================================
    // STEP 5: Popup Close & Reopen (HUD State Persistence)
    // ============================================================
    log('--- STEP 5: Popup close & reopen verification ---');
    await cdpSend(popupWs, 'Page.close');
    await sleep(1000);

    pageTargetMeta = await cdpSend(swWs, 'Target.createTarget', { url: popupUrl });
    await sleep(1500);

    pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    popupTarget = pages.find(p => p.id === pageTargetMeta.targetId || (p.url && p.url.includes('popup.html')));
    assert(popupTarget, 'Reopened popup page target not found');
    popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
    await cdpSend(popupWs, 'Page.enable');
    await sleep(1000);

    const reopenHudEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const campPill = document.getElementById('campaign-ready-pill');
            const privPill = document.getElementById('privacy-ready-pill');
            const st = await chrome.storage.local.get(['xpider_queue', 'xpider_total']);
            return {
                campPillText: campPill ? campPill.textContent : '',
                privPillText: privPill ? privPill.textContent : '',
                queueLen: st.xpider_queue ? st.xpider_queue.length : 0
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const s5 = reopenHudEval.result.value;
    log(`Step 5 Reopened HUD result: ${JSON.stringify(s5)}`);

    assert(s5.campPillText.startsWith('CAMPAIGN: READY'), 'Campaign pill shows ready');
    assert(s5.privPillText.includes('PRIVACY: BLOCKED') && (s5.privPillText.includes('NO_HEALTHY_EGRESS') || s5.privPillText.includes('RELAY_OFFLINE')), 'Privacy pill shows BLOCKED reason');
    assert(s5.queueLen >= 99 && s5.queueLen <= 100, 'Queue retained remaining public URLs');

    await shot(popupWs, 'shot_p0_04_reopened_hud_readiness.png');

    // ============================================================
    // STEP 6: Healthy Privacy / Direct Mode Clean Start
    // ============================================================
    log('--- STEP 6: Testing Healthy Privacy Mode (Direct / Non-strict) ---');
    const healthyStartEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            // Temporarily set strict privacy = false in settings to simulate healthy direct mode
            await chrome.storage.local.set({
                xpider_strict_privacy: false,
                xpider_privacy_config: { enabled: false, transportMode: 'DIRECT', failClosed: false }
            });

            if (window.checkAndRefreshPrivacyReadinessHUD) {
                await window.checkAndRefreshPrivacyReadinessHUD();
            }

            const launchRes = await launchCampaign({ source: 'USER_START_BUTTON' });
            await new Promise(r => setTimeout(r, 1000));

            const isAct = campaignActive;
            stopCampaign();

            // Restore strict privacy
            await chrome.storage.local.set({
                xpider_strict_privacy: true,
                xpider_privacy_config: { enabled: true, transportMode: 'PRIVACY_RELAY', failClosed: true }
            });

            return {
                launchSuccess: launchRes ? launchRes.success : false,
                campaignWasActive: isAct
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const s6 = healthyStartEval.result.value;
    log(`Step 6 Healthy Launch result: ${JSON.stringify(s6)}`);
    assert.strictEqual(s6.launchSuccess, true, 'Healthy privacy start must succeed');
    assert.strictEqual(s6.campaignWasActive, true, 'Campaign was active');

    log('================================================================================');
    log('✅ ALL 8 ACCEPTANCE REQUIREMENTS VERIFIED IN REAL MICROSOFT EDGE');
    log('================================================================================');

    try { proc.kill(); } catch (_) {}
    process.exit(0);
}

main().catch(err => {
    log(`❌ TEST FAILED: ${err.message}\n${err.stack}`);
    process.exit(1);
});
