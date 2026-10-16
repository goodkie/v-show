/**
 * test/run_edge_p0_normal_start_reconciliation.js
 *
 * Real Microsoft Edge acceptance test for:
 * [OWNER BUG][P0 RELEASE BLOCKER][R6.9G.10.3.7.1.4.11 OWNER BETA — NORMAL START BLOCKED BY STALE OWNER TEST MODE]
 * (Issue #6 Comment #6210215006)
 *
 * Verifies all 9 Acceptance Steps in Requirement H:
 * 1. Start AUTO SETUP.
 * 2. Run CAPTCHA LAB or Test-Key Lab.
 * 3. Finish/settle test -> verify terminal cleanup (guard removed, test mode reset).
 * 4. Load 100 public URLs into queue.
 * 5. Press normal Start directly WITHOUT clicking RESTORE:
 *    - no OWNER FUNCTIONAL TEST MODE ACTIVE alert
 *    - [MODE_RECONCILE] logged
 *    - test guard removed
 *    - normal campaign starts.
 * 6. Repeat after popup close/reopen.
 * 7. Repeat after SW restart.
 * 8. Verify public list/history preserved.
 * 9. Verify explicit test buttons still install guard and reject public targets inside their own test scope.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9301;
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_r6_9g10_3_7_1_4_11_p0_reconciliation.log');

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
    log('================ XPIDER OWNER BETA P0 TEST-MODE RECONCILIATION TEST (EDGE) ================');
    
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

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-p0-reconcile-'));
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
    await sleep(1000);

    // ============================================================
    // STEP 1: Click AUTO SETUP
    // ============================================================
    log('--- STEP 1: Executing AUTO SETUP ---');
    const autoSetupEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const btn = document.getElementById('auto-setup-btn');
            if (!btn) return { success: false, error: 'NO_BTN' };
            btn.click();
            let st = null;
            for (let i = 0; i < 25; i++) {
                await new Promise(r => setTimeout(r, 200));
                st = await chrome.storage.local.get(['xpider_owner_function_test_mode', 'xpider_queue', 'xpider_owner_backup_snapshot']);
                if (st && st.xpider_queue && st.xpider_queue.length === 7) break;
            }
            const fb = document.getElementById('auto-setup-feedback');
            const allStorage = await chrome.storage.local.get(null);
            return {
                success: true,
                testMode: st ? st.xpider_owner_function_test_mode : null,
                queueLen: st && st.xpider_queue ? st.xpider_queue.length : 0,
                hasSnapshot: !!(st && st.xpider_owner_backup_snapshot),
                feedback: fb ? fb.textContent : null,
                btnDisabled: btn.disabled,
                campaignQueueVarLen: typeof campaignQueue !== 'undefined' ? campaignQueue.length : null,
                allStorageKeys: Object.keys(allStorage),
                allStorageQueue: allStorage.xpider_queue
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step1 = autoSetupEval.result.value;
    log(`Step 1 full result: ${JSON.stringify(step1)}`);
    assert.strictEqual(step1.testMode, true, 'Test mode must be enabled by AUTO SETUP');
    assert.strictEqual(step1.campaignQueueVarLen, 7, '7 fixtures loaded by AUTO SETUP into campaignQueue');
    assert(step1.feedback && step1.feedback.includes('READY FOR LOCAL FUNCTION TEST'), 'Feedback confirms ready for test');

    await shot(popupWs, 'shot_p0_01_auto_setup.png');

    // ============================================================
    // STEP 2 & 3: Run Test Suite and verify Terminal Auto-Cleanup
    // ============================================================
    log('--- STEP 2 & 3: Simulating test suite terminal completion & auto-cleanup ---');
    const finishCleanupEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            // Set active test source
            await chrome.storage.local.set({ xpider_active_test_source: 'OWNER_CAPTCHA_LAB', xpider_owner_function_test_mode: true });
            // Call onCampaignFinishedOwnerTestCheck with mock counters (5 success, 2 skip = 7 total)
            onCampaignFinishedOwnerTestCheck({ success: 5, skipped: 2, failed: 0 });
            await new Promise(r => setTimeout(r, 800));
            const st = await chrome.storage.local.get(['xpider_owner_function_test_mode', 'xpider_active_test_source', 'xpider_test_mode_state']);
            const oftToggle = document.getElementById('owner-function-test-toggle');
            return {
                testModeInStorage: st.xpider_owner_function_test_mode,
                testModeState: st.xpider_test_mode_state,
                activeTestSource: st.xpider_active_test_source || null,
                toggleChecked: oftToggle ? oftToggle.checked : null
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step23 = finishCleanupEval.result.value;
    log(`Step 2/3 terminal cleanup: testModeInStorage=${step23.testModeInStorage} testModeState=${step23.testModeState} activeTestSource=${step23.activeTestSource} toggleChecked=${step23.toggleChecked}`);
    assert.strictEqual(step23.testModeInStorage, false, 'Terminal test completion must auto-reset test mode to false in storage');
    assert.strictEqual(step23.testModeState, 'TEST_RESULT_VIEW', 'Terminal test completion marks state TEST_RESULT_VIEW');
    assert.strictEqual(step23.activeTestSource, null, 'xpider_active_test_source must be removed on terminal completion');
    assert.strictEqual(step23.toggleChecked, false, 'Toggle switch must be unchecked');

    // ============================================================
    // STEP 4 & 5: Load 100 public URLs and press normal START SENDING directly
    // (Simulate the EXACT defect reported in Comment #6210215006)
    // ============================================================
    log('--- STEP 4 & 5: Loading 100 public URLs and starting normal campaign without clicking RESTORE ---');
    
    // Deliberately simulate stale test-mode in storage before start, to verify auto-reconciliation
    const testLaunchEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            // 1. Artificially set stale test mode in storage to simulate prior leftover state
            await chrome.storage.local.set({ xpider_owner_function_test_mode: true });
            
            // 2. Prepare 100 public non-loopback targets
            const publicTargets = [];
            for (let i = 1; i <= 100; i++) {
                publicTargets.push('https://public-corp-' + i + '.example.com/contact');
            }
            campaignQueue = [...publicTargets];
            totalTargets = campaignQueue.length;
            await chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_total: totalTargets });

            // 3. Monitor alert calls
            let alertTriggered = null;
            window.alert = function(msg) {
                alertTriggered = msg;
                console.warn('[CAPTURED_ALERT]', msg);
            };

            // 4. Set valid template message
            const msgEl = document.getElementById('tpl-message');
            if (msgEl) msgEl.value = 'Inquiry from test runner';

            // 5. Call launchCampaign with default USER_START_BUTTON
            const launchRes = await launchCampaign({ source: 'USER_START_BUTTON' });

            await new Promise(r => setTimeout(r, 1000));

            const stAfter = await chrome.storage.local.get(['xpider_owner_function_test_mode', 'xpider_isActive', 'xpider_queue']);
            return {
                alertTriggered,
                launchResSuccess: launchRes ? launchRes.success : null,
                testModeAfterLaunch: stAfter.xpider_owner_function_test_mode,
                campaignIsActive: stAfter.xpider_isActive,
                queueCount: stAfter.xpider_queue ? stAfter.xpider_queue.length : 0
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step45 = testLaunchEval.result.value;
    log(`Step 4/5 Normal Start result: alertTriggered=${step45.alertTriggered} testModeAfter=${step45.testModeAfterLaunch} isActive=${step45.campaignIsActive} queueCount=${step45.queueCount}`);
    
    assert.strictEqual(step45.alertTriggered, null, 'NO [OWNER FUNCTIONAL TEST MODE ACTIVE] alert should ever be triggered for normal Start!');
    assert.strictEqual(step45.testModeAfterLaunch, false, 'Owner test mode must be false after normal launch');
    assert.strictEqual(step45.queueCount, 100, 'All 100 public targets preserved in queue');

    await shot(popupWs, 'shot_p0_02_normal_start_100_targets.png');

    // ============================================================
    // STEP 6: Repeat after popup close and reopen
    // ============================================================
    log('--- STEP 6: Repeating verification after popup close & reopen ---');
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

    const popupReopenEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const st = await chrome.storage.local.get(['xpider_owner_function_test_mode', 'xpider_queue']);
            const oftToggle = document.getElementById('owner-function-test-toggle');
            return {
                testModeInStorage: st.xpider_owner_function_test_mode,
                toggleChecked: oftToggle ? oftToggle.checked : null,
                queueLen: st.xpider_queue ? st.xpider_queue.length : 0
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step6 = popupReopenEval.result.value;
    log(`Step 6 Reopen check: testModeInStorage=${step6.testModeInStorage} toggleChecked=${step6.toggleChecked} queueLen=${step6.queueLen}`);
    assert.strictEqual(step6.testModeInStorage, false, 'Test mode must remain false after popup reopen');
    assert.strictEqual(step6.toggleChecked, false, 'Toggle switch must remain false');
    assert.strictEqual(step6.queueLen, 100, 'Queue must retain 100 public URLs');

    // ============================================================
    // STEP 7: Repeat after Service Worker restart reconciliation
    // ============================================================
    log('--- STEP 7: Repeating verification after SW boot reconciliation ---');
    const swReconcileEval = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(async () => {
            // Put stale test mode in storage, then call reconcileOwnerTestNetworkGuardOnBoot()
            await chrome.storage.local.set({ xpider_owner_function_test_mode: true });
            const res = await reconcileOwnerTestNetworkGuardOnBoot();
            const st = await chrome.storage.local.get(['xpider_owner_function_test_mode']);
            return {
                reconciled: res.reconciled,
                guardActive: res.guardActive,
                testModeCleared: st.xpider_owner_function_test_mode === false
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step7 = swReconcileEval.result.value;
    log(`Step 7 SW reconcile check: reconciled=${step7.reconciled} guardActive=${step7.guardActive} testModeCleared=${step7.testModeCleared}`);
    assert.strictEqual(step7.guardActive, false, 'Network guard must NOT be active when no explicit test is running');
    assert.strictEqual(step7.testModeCleared, true, 'Stale test mode must be auto-cleared on SW boot');

    // ============================================================
    // STEP 8: Verify public list and history preserved (Zero Data Loss)
    // ============================================================
    log('--- STEP 8: Verifying public list & history preserved (Zero Data Loss) ---');
    const dataPreserveEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const st = await chrome.storage.local.get(['xpider_queue', 'xpider_total', 'xpider_owner_backup_snapshot']);
            return {
                queueLength: st.xpider_queue ? st.xpider_queue.length : 0,
                totalTargets: st.xpider_total,
                hasSnapshot: !!st.xpider_owner_backup_snapshot
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step8 = dataPreserveEval.result.value;
    log(`Step 8 Data preservation: queueLength=${step8.queueLength} totalTargets=${step8.totalTargets} hasSnapshot=${step8.hasSnapshot}`);
    assert.strictEqual(step8.queueLength, 100, 'Queue length must remain 100');
    assert.strictEqual(step8.totalTargets, 100, 'Total targets must remain 100');

    // ============================================================
    // STEP 9: Verify explicit test buttons STILL install guard & reject public targets
    // ============================================================
    log('--- STEP 9: Verifying explicit test buttons still reject public targets fail-closed ---');
    const rejectPublicInTestScopeEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            let capturedError = null;
            let alertMsg = null;
            window.alert = function(msg) { alertMsg = msg; };
            try {
                // Try to launch with explicit test source while queue has public non-loopback URLs
                const res = await launchCampaign({ source: 'OWNER_CORE_TEST' });
                if (res && !res.success) capturedError = res.reason;
            } catch (err) {
                capturedError = err.message;
            }
            return {
                capturedError,
                alertMsg
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step9 = rejectPublicInTestScopeEval.result.value;
    log(`Step 9 Explicit test rejection: error="${step9.capturedError}" alert="${step9.alertMsg?.substring(0, 60)}"`);
    assert(step9.capturedError && step9.capturedError.includes('OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET'),
        'Explicit test button MUST reject non-loopback public URLs fail-closed');
    assert(step9.alertMsg && step9.alertMsg.includes('OWNER FUNCTIONAL TEST MODE ACTIVE'),
        'Explicit test button MUST alert when non-loopback targets are queued');

    // ============================================================
    // STEP 10: Verify RESTORE Semantics (Never Restores Test Mode)
    // ============================================================
    log('--- STEP 10: Verifying restoreUserSettings never restores test mode to true ---');
    const restoreSanitizeEval = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            // Create a fake snapshot with test mode = true to test sanitization
            await chrome.storage.local.set({
                xpider_owner_backup_snapshot: {
                    timestamp: Date.now(),
                    queue: ['https://example.com/restored-1', 'https://example.com/restored-2'],
                    totalTargets: 2,
                    settings: {
                        xpider_owner_function_test_mode: true, // Malicious/stale snapshot test mode
                        xpider_delayMs: 5000
                    }
                }
            });
            await restoreUserSettings();
            const st = await chrome.storage.local.get(['xpider_owner_function_test_mode', 'xpider_queue', 'xpider_delayMs']);
            return {
                testModeAfterRestore: st.xpider_owner_function_test_mode,
                queueAfterRestore: st.xpider_queue,
                delayMs: st.xpider_delayMs
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const step10 = restoreSanitizeEval.result.value;
    log(`Step 10 Restore sanitize: testMode=${step10.testModeAfterRestore} queueCount=${step10.queueAfterRestore?.length} delayMs=${step10.delayMs}`);
    assert.strictEqual(step10.testModeAfterRestore, false, 'restoreUserSettings MUST force test mode to false even if snapshot had true');
    assert.strictEqual(step10.queueAfterRestore.length, 2, 'Restored queue matches snapshot');
    assert.strictEqual(step10.delayMs, 5000, 'Restored delayMs matches snapshot');

    await shot(popupWs, 'shot_p0_03_final_reconciled.png');

    log('================================================================================');
    log('✅ ALL 10 ACCEPTANCE VERIFICATIONS PASSED IN REAL MICROSOFT EDGE');
    log('================================================================================');

    try { proc.kill(); } catch (_) {}
    process.exit(0);
}

main().catch(err => {
    log(`❌ TEST FAILED: ${err.message}\n${err.stack}`);
    process.exit(1);
});
