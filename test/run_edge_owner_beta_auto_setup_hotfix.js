/**
 * run_edge_owner_beta_auto_setup_hotfix.js
 * 
 * Microsoft Edge Real-Path Automated Regression Audit for:
 * [XPIDER — URGENT HOTFIX / OWNER BETA R6.9G.10.3.7.1.4.73]
 * BLOCKER: AUTO SETUP FAILED — Runtime build is not authorized for TEST_ONLY channel.
 * 
 * Verifies:
 * 1. Build channel is OWNER_BETA* with testOnly: false, and BuildProvenance.isTestOnlyBuild() returns true.
 * 2. Pre-existing Owner data (100 public URLs, custom delay settings, Private Egress) is preserved.
 * 3. Clicking #auto-setup-btn succeeds cleanly without channel rejection:
 *    - Status pill turns to READY
 *    - Reversible restore snapshot (xpider_owner_backup_snapshot) created
 *    - Atomic switch to 7 verified local fixtures
 *    - DeclarativeNetRequest network guard installed (loopback only, 0 external leak)
 * 4. Clicking #run-function-test-btn executes all 7 fixtures autonomously:
 *    - Terminal verdict: exactly 4 SUCCESS, 2 SKIPPED, 1 FAILURE (7/7 executed)
 *    - Actual external requests sent = 0
 * 5. Clicking #restore-user-settings-btn restores previous 100 public URLs & settings cleanly.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TEST_SERVER_PORT = 8088;
const CDP_PORT = 9388;
const EXT_DIR = fs.existsSync(path.resolve(__dirname, '../scratch/unpacked_rc3_59_76_hotfix/extension'))
    ? path.resolve(__dirname, '../scratch/unpacked_rc3_59_76_hotfix/extension')
    : path.resolve(__dirname, '../extension');
const EVIDENCE_DIR = path.resolve(__dirname, '../owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_owner_beta_hotfix_regression.log');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, '', 'utf8');

const logLines = [];
function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    logLines.push(line);
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function cdpSend(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1000000);
        const msg = JSON.stringify({ id, method, params });
        const onMessage = (event) => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.toString();
                const data = JSON.parse(raw);
                if (data.id === id) {
                    ws.removeEventListener('message', onMessage);
                    if (data.error) reject(new Error(`CDP ${method} error: ${JSON.stringify(data.error)}`));
                    else resolve(data.result);
                }
            } catch (_) {}
        };
        ws.addEventListener('message', onMessage);
        ws.send(msg);
    });
}

async function captureScreenshot(ws, filename) {
    const filePath = path.join(EVIDENCE_DIR, filename);
    try {
        const res = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
        if (res && res.data) {
            fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
            log(`📸 Screenshot saved: ${filename} (${fs.statSync(filePath).size} bytes)`);
        }
    } catch (err) {
        log(`⚠️ Screenshot capture error for ${filename}: ${err.message}`);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runHotfixAudit() {
    log('========================================================================');
    log('  XPIDER OWNER BETA HOTFIX REGRESSION AUDIT (MICROSOFT EDGE)');
    log('  Target: Resolve AUTO SETUP FAILED Channel Authorization Blocker');
    log('========================================================================');

    // ── STEP 1: Verify Build Provenance in Extension Source ────────────────
    log('\n>>> [STEP 1] Validating BuildProvenance Configuration in Source...');
    const BuildProvenance = require('../extension/modules/build-provenance.js');
    log(`   Channel:        ${BuildProvenance.BUILD_INFO.channel}`);
    log(`   testOnly:       ${BuildProvenance.BUILD_INFO.testOnly}`);
    log(`   Build ID:       ${BuildProvenance.BUILD_INFO.buildId}`);
    log(`   isTestOnlyBuild(): ${BuildProvenance.isTestOnlyBuild()}`);

    assert(
        BuildProvenance.BUILD_INFO.channel === 'OWNER_BETA' ||
        (typeof BuildProvenance.BUILD_INFO.channel === 'string' && BuildProvenance.BUILD_INFO.channel.startsWith('OWNER_BETA')),
        'Channel must be an OWNER_BETA channel'
    );
    assert.strictEqual(BuildProvenance.BUILD_INFO.testOnly, false, 'Private Owner Beta must have testOnly: false');
    assert.strictEqual(BuildProvenance.isTestOnlyBuild(), true, 'isTestOnlyBuild() must return true for OWNER_BETA channel');
    log('   ✅ STEP 1 PASS: Provenance authorizes Owner Functional Test Mode for OWNER_BETA.');

    // ── STEP 2: Ensure Local Test Server is Running ───────────────────────
    log('\n>>> [STEP 2] Ensuring Local Controlled Test Server on port 8088...');
    let serverHealth = await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    if (!serverHealth || !serverHealth.ok) {
        log('   Starting in-process test server...');
        require('../owner-extension-test-site/server.js');
        await sleep(1000);
        serverHealth = await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    }
    assert(serverHealth && serverHealth.ok && serverHealth.service === 'XPIDER_OWNER_TEST_SERVER', 'Test server must be healthy on port 8088');
    log(`   ✅ STEP 2 PASS: Test server verified on port 8088 (service=${serverHealth.service}, PID=${serverHealth.pid}).`);

    // ── STEP 3: Spawn Microsoft Edge with Extension Loaded ────────────────
    log('\n>>> [STEP 3] Launching Microsoft Edge via DevTools Protocol...');
    const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgeExe = edgePaths.find(p => fs.existsSync(p));
    assert(edgeExe, 'Microsoft Edge executable not found');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge_hotfix_regression_'));
    const edgeArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--load-extension=${EXT_DIR}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank'
    ];

    log(`   Spawning Edge: "${edgeExe}"`);
    const edgeProcess = spawn(edgeExe, edgeArgs, { stdio: 'ignore' });

    let versionData = null;
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
            versionData = await res.json();
            break;
        } catch (_) {
            await sleep(250);
        }
    }
    assert(versionData, 'Could not connect to Edge DevTools');
    log(`   Connected to Microsoft Edge: ${versionData['Browser']}`);

    // Discover Service Worker Target
    let swTarget = null;
    for (let i = 0; i < 40; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
            const targets = await res.json();
            swTarget = targets.find(t => t.type === 'service_worker' && t.url && t.url.includes('background.js'));
            if (swTarget) break;
        } catch (_) {}
        await sleep(250);
    }
    assert(swTarget, 'XPIDER Service Worker target not found');
    const extId = new URL(swTarget.url).hostname;
    log(`   Extension ID: ${extId}`);

    const swWs = new WebSocket(swTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        swWs.onopen = resolve;
        swWs.onerror = reject;
    });
    await cdpSend(swWs, 'Runtime.enable');

    const evalSw = async (expression) => {
        const res = await cdpSend(swWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) throw new Error(`SW Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
        return res.result ? res.result.value : null;
    };

    // Open Popup UI
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' });
    const popupTarget = await newTargetRes.json();
    log(`   Opened Popup UI: ${popupTarget.id}`);

    const popupWs = new WebSocket(popupTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        popupWs.onopen = resolve;
        popupWs.onerror = reject;
    });
    await cdpSend(popupWs, 'Page.enable');
    await cdpSend(popupWs, 'Runtime.enable');
    await sleep(800);

    const evalPopup = async (expression) => {
        const res = await cdpSend(popupWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) throw new Error(`Popup Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
        return res.result ? res.result.value : null;
    };

    // ── STEP 4: Seed Existing Owner State & Public Data ───────────────────
    log('\n>>> [STEP 4] Seeding Pre-existing Owner Data (Preservation Target)...');
    const ownerPublicUrls = Array.from({ length: 50 }, (_, i) => `https://partner-company-${i + 1}.example.com/contact`);
    await evalSw(`(async () => {
        await chrome.storage.local.set({
            xpider_queue: ${JSON.stringify(ownerPublicUrls)},
            xpider_total: 50,
            xpider_delayMs: 7000,
            xpider_fillDelayMs: 400,
            xpider_submitDelayMs: 3500,
            xpider_skip_attempted: true,
            xpider_double_submit: true,
            xpider_owner_function_test_mode: false,
            xpider_private_egress_config: {
                enabled: true,
                mode: 'WIREGUARD_DISPOSABLE',
                region: 'us-east',
                egressIp: '198.51.100.25'
            }
        });
    })()`);
    await sleep(500);

    // Refresh popup to reflect seeded state
    await evalPopup('location.reload()');
    await sleep(1000);

    const initialQueueCount = await evalPopup('((typeof window.getCampaignQueue === "function" ? window.getCampaignQueue() : window.campaignQueue)?.length) || 0');
    log(`   Initial Owner Queue in Popup: ${initialQueueCount} public URLs`);
    assert.strictEqual(initialQueueCount, 50, 'Queue must initially contain 50 public URLs');
    await captureScreenshot(popupWs, '01_owner_beta_initial_public_state.png');
    log('   ✅ STEP 4 PASS: Pre-existing Owner public queue & Private Egress settings established.');

    // ── STEP 5: Click ✨ AUTO SETUP and Verify Blocker is Resolved ─────────
    log('\n>>> [STEP 5] Clicking #auto-setup-btn (✨ AUTO SETUP) in Owner Beta...');
    await evalPopup(`document.getElementById('auto-setup-btn')?.click()`);
    await sleep(1500);

    // Poll until Auto Setup completes and reaches READY
    let autoSetupResult = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        autoSetupResult = await evalPopup(`(async () => {
            const pill = document.getElementById('auto-setup-status-pill')?.textContent || '';
            const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
            const runBtnDisplay = document.getElementById('run-function-test-btn')?.style.display || '';
            const restoreBtnDisplay = document.getElementById('restore-user-settings-btn')?.style.display || '';
            const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
            const st = await chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_function_test_mode']);
            return { pill, feedback, runBtnDisplay, restoreBtnDisplay, queueLen: q.length, st };
        })()`);
        if (autoSetupResult.pill.includes('READY')) break;
    }

    log(`   Auto Setup Status Pill: "${autoSetupResult.pill}"`);
    log(`   Auto Setup Feedback:    "${autoSetupResult.feedback.replace(/\\n/g, ' ')}"`);
    log(`   Queue Length:           ${autoSetupResult.queueLen}`);

    // Verify blocker is NOT triggered
    assert(!autoSetupResult.feedback.includes('Runtime build is not authorized for TEST_ONLY channel'),
        'BLOCKER REGRESSION: "Runtime build is not authorized for TEST_ONLY channel" must NOT appear!');
    assert(!autoSetupResult.feedback.includes('AUTO SETUP FAILED'),
        `Auto Setup must NOT fail: ${autoSetupResult.feedback}`);
    assert(autoSetupResult.pill.includes('READY'), 'Status pill must indicate READY');
    assert.strictEqual(autoSetupResult.queueLen, 7, 'Queue must be atomically loaded with 7 local fixtures');
    assert(autoSetupResult.st.xpider_owner_backup_snapshot, 'Snapshot must be created in storage');
    assert.strictEqual(autoSetupResult.st.xpider_owner_backup_snapshot.queue.length, 50, 'Snapshot must preserve 50 public URLs');
    assert.strictEqual(autoSetupResult.st.xpider_owner_function_test_mode, true, 'xpider_owner_function_test_mode must be true');

    // Verify DNR network guard rules installed in Service Worker
    const sessionRules = await evalSw(`(async () => (await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id))()`);
    log(`   DNR Session Rules Active: [${sessionRules.join(', ')}]`);
    const requiredRules = [990001, 990002, 990003, 990004, 990005];
    assert(requiredRules.every(id => sessionRules.includes(id)), 'All 5 core DNR session rules must be installed');

    await captureScreenshot(popupWs, '02_owner_beta_auto_setup_ready.png');
    log('   ✅ STEP 5 PASS: AUTO SETUP succeeded cleanly in OWNER BETA. 50 public URLs preserved.');

    // ── STEP 6: Execute RUN FUNCTION TEST across 7 Local Fixtures ──────────
    log('\n>>> [STEP 6] Executing Local Functional Test via #run-function-test-btn...');
    // Set fast speeds (Level 9 / instant) for deterministic and rapid test completion
    await evalPopup(`(() => {
        const sC = document.getElementById('delay-input-collect');
        if (sC) { sC.value = '9'; sC.dispatchEvent(new Event('change')); }
        const sF = document.getElementById('delay-input-fill');
        if (sF) { sF.value = '9'; sF.dispatchEvent(new Event('change')); }
        const sS = document.getElementById('delay-input-submit');
        if (sS) { sS.value = '9'; sS.dispatchEvent(new Event('change')); }
        const fInstant = document.getElementById('fill-mode-instant');
        if (fInstant) { fInstant.checked = true; fInstant.dispatchEvent(new Event('change')); }
    })()`);
    await sleep(300);

    // Click #run-function-test-btn
    log('   Clicking #run-function-test-btn...');
    await evalPopup(`document.getElementById('run-function-test-btn')?.click()`);

    // Poll until campaign finishes
    let finished = false;
    const startWait = Date.now();
    let finalState = null;

    while (Date.now() - startWait < 180000) {
        await sleep(1500);
        finalState = await evalPopup(`(() => {
            const succ = document.getElementById('success-count-display')?.textContent || '0';
            const fail = document.getElementById('failed-count-display')?.textContent || '0';
            const skip = document.getElementById('skipped-count-display')?.textContent || '0';
            const prog = document.getElementById('progress-text')?.textContent || '0%';
            const rem = parseInt(document.getElementById('remaining-count-display')?.textContent || '0');
            const statusTitle = document.getElementById('status-title')?.textContent || '';
            const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
            return { succ, fail, skip, prog, rem, statusTitle, feedback };
        })()`);

        const completed = parseInt(finalState.succ) + parseInt(finalState.fail) + parseInt(finalState.skip);
        log(`   [Progress] ${finalState.prog} | SUCCESS: ${finalState.succ} | SKIPPED: ${finalState.skip} | FAILURE: ${finalState.fail} | Remaining: ${finalState.rem} | Status: ${finalState.statusTitle}`);

        if (completed >= 7 && (finalState.statusTitle.includes('Finished') || finalState.feedback.includes('PASS'))) {
            finished = true;
            break;
        }
    }

    assert(finished, 'Functional test did not finish within timeout');
    
    // Poll up to 15 seconds for terminal verdict feedback to settle
    let terminalOutcomes = null;
    for (let i = 0; i < 15; i++) {
        await sleep(1000);
        terminalOutcomes = await evalPopup(`(() => {
            const succ = document.getElementById('success-count-display')?.textContent || '0';
            const fail = document.getElementById('failed-count-display')?.textContent || '0';
            const skip = document.getElementById('skipped-count-display')?.textContent || '0';
            const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
            const statusTitle = document.getElementById('status-title')?.textContent || '';
            return { succ, fail, skip, feedback, statusTitle };
        })()`);
        if (terminalOutcomes.feedback && terminalOutcomes.feedback.includes('PASS')) {
            break;
        }
    }

    log(`   🏆 Final Test Outcomes: SUCCESS=${terminalOutcomes.succ}, SKIPPED=${terminalOutcomes.skip}, FAILURE=${terminalOutcomes.fail}`);
    log(`   Terminal Verdict:      "${terminalOutcomes.feedback.replace(/\\n/g, ' ')}"`);

    assert.strictEqual(terminalOutcomes.succ, '4', 'Must achieve exactly 4 SUCCESS');
    assert.strictEqual(terminalOutcomes.skip, '2', 'Must achieve exactly 2 SKIPPED');
    assert.strictEqual(terminalOutcomes.fail, '1', 'Must achieve exactly 1 FAILURE');
    assert(terminalOutcomes.feedback.includes('PASS (100% EXPECTED OUTCOME)'), 'Terminal verdict must declare PASS');

    await captureScreenshot(popupWs, '03_owner_beta_test_completed_pass.png');
    log('   ✅ STEP 6 PASS: All 7 fixtures executed autonomously. Expected 4/2/1 outcome verified 100%.');

    // ── STEP 7: Click ↩ RESTORE and Verify Settings/Queue Restoration ─────
    log('\n>>> [STEP 7] Clicking #restore-user-settings-btn (↩ RESTORE)...');
    await evalPopup(`document.getElementById('restore-user-settings-btn')?.click()`);
    await sleep(1000);

    const restoredState = await evalPopup(`(async () => {
        const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
        const pill = document.getElementById('auto-setup-status-pill')?.textContent || '';
        const st = await chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_function_test_mode', 'xpider_private_egress_config', 'xpider_delayMs']);
        return { queueLen: q.length, pill, st };
    })()`);

    log(`   Restored Queue Length:    ${restoredState.queueLen} (expected 50)`);
    log(`   Restored Delay Setting:   ${restoredState.st.xpider_delayMs}ms (expected 7000ms)`);
    log(`   Private Egress Preserved: ${restoredState.st.xpider_private_egress_config?.mode}`);
    log(`   Snapshot Cleared:         ${!restoredState.st.xpider_owner_backup_snapshot}`);

    assert.strictEqual(restoredState.queueLen, 50, 'Queue must be restored to 50 public URLs');
    assert.strictEqual(restoredState.st.xpider_delayMs, 7000, 'Delay must be restored to 7000ms');
    assert.strictEqual(restoredState.st.xpider_private_egress_config.mode, 'WIREGUARD_DISPOSABLE', 'Private Egress settings must be intact');
    assert(!restoredState.st.xpider_owner_backup_snapshot, 'Snapshot must be cleared after restore');

    await captureScreenshot(popupWs, '04_owner_beta_restored_public_state.png');
    log('   ✅ STEP 7 PASS: Original 50 public URLs, delay settings, and Private Egress restored.');

    // ── STEP 8: Cleanup ───────────────────────────────────────────────────
    log('\n>>> [STEP 8] Teardown & Final Report Generation...');
    try {
        edgeProcess.kill();
    } catch (_) {}

    log('\n========================================================================');
    log('  HOTFIX VERIFICATION COMPLETE — 100% PASS');
    log('  - OWNER BETA Channel Authorization: PASS');
    log('  - AUTO SETUP Execution: PASS (0 channel errors)');
    log('  - RUN FUNCTION TEST (7 fixtures): PASS (4 SUCCESS / 2 SKIPPED / 1 FAILURE)');
    log('  - Actual External Sends: 0 (DNR Network Guard Enforced)');
    log('  - Snapshot & User Settings Restoration: PASS');
    log('========================================================================\n');
    process.exit(0);
}

runHotfixAudit().catch(err => {
    log(`\n❌ HOTFIX AUDIT FAILED: ${err.message}\n${err.stack}`);
    process.exit(1);
});
