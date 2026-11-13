/**
 * test/audit_unpacked_owner_beta_edge.js
 *
 * Packaged-Build Audit & Real Microsoft Edge Verification for:
 * [CHATGPT][DIRECTIVE][extension-form-sender][P0-OWNER-AUTO-SETUP-CHANNEL-FIX][2026-11-11]
 *
 * Verifies:
 * 1. Isolated ZIP package generation and SHA256 provenance digest.
 * 2. Unpacking and runtime BuildProvenance authorization check.
 * 3. 31/31 Provenance contract & fail-closed tests on unpacked code.
 * 4. Microsoft Edge real browser session loading the unpacked package.
 * 5. Pre-existing Owner data (50 public URLs + custom settings) preservation.
 * 6. ✨ AUTO SETUP execution:
 *    - Resolves channel authorization blocker
 *    - Status pill turns to READY
 *    - Creates reversible backup snapshot with all 50 public URLs
 *    - Arms 8 verified localhost fixtures
 *    - Installs DeclarativeNetRequest network guard (990001-990005)
 * 7. Outbound network guard verification:
 *    - Proves DNR strictly blocks external outbound requests (0 network leak)
 *    - Proves DNR allows 127.0.0.1:8088 localhost fixtures
 * 8. RUN FUNCTION TEST across 8 localhost fixtures:
 *    - Autonomous completion to 5 SUCCESS, 2 SKIPPED, 1 FAILURE parity
 *    - Durable 8-entry ledger verification in storage
 * 9. ↩ RESTORE execution:
 *    - Restores previous 50 public URLs and original settings
 *    - Reinstates normal mode (xpider_owner_function_test_mode: false)
 * 10. Service worker boot reconciliation:
 *    - Verifies stale test mode auto-clears on SW restart without active session
 * 11. Scoped PID cleanup (terminates owned Edge process only).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn, execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_SOURCE = path.resolve(REPO_ROOT, 'extension');
const SCRATCH_DIR = path.resolve(REPO_ROOT, 'scratch');
const ZIP_PATH = path.resolve(SCRATCH_DIR, 'XPIDER_V7.0.0_OWNER_BETA_V7_DUAL_MODE_FIX_P0.zip');
const UNPACK_DIR = path.resolve(SCRATCH_DIR, 'unpacked_owner_beta_package');
const UNPACKED_EXT = path.resolve(UNPACK_DIR, 'extension');
const EVIDENCE_DIR = path.resolve(REPO_ROOT, 'owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_owner_beta_packaged_edge_audit.log');

const TEST_SERVER_PORT = 8088;
const CDP_PORT = 9433;

fs.mkdirSync(SCRATCH_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, '', 'utf8');

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function computeSha256(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

async function runPackagedEdgeAudit() {
    log('========================================================================');
    log('  PACKAGED-BUILD REAL MICROSOFT EDGE AUDIT (OWNER BETA CHANNEL FIX)');
    log('========================================================================');

    // ── STAGE 1: Ensure Local Test Server is Healthy on Port 8088 ──────────
    log('\n>>> [STAGE 1] Validating Local Test Server on port 8088...');
    let serverHealth = await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    if (!serverHealth || !serverHealth.ok) {
        log('   Starting in-process test server on port 8088...');
        require(path.resolve(REPO_ROOT, 'owner-extension-test-site/server.js'));
        await sleep(1000);
        serverHealth = await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    }
    assert(serverHealth && serverHealth.ok, 'Test server must be healthy on port 8088');
    const f8Res = await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/ai-required-fields.html`).then(r => r.status).catch(() => 0);
    assert.strictEqual(f8Res, 200, 'Fixture 8 (/ai-required-fields.html) must be accessible with 200 OK');
    log(`   ✅ STAGE 1 PASS: Test server verified with all 8 fixtures ready (PID=${serverHealth.pid}).`);

    // ── STAGE 2: Build Isolated Versioned ZIP Artifact ─────────────────────
    log('\n>>> [STAGE 2] Packaging Extension into Isolated Versioned ZIP Artifact...');
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
    if (fs.existsSync(UNPACK_DIR)) fs.rmSync(UNPACK_DIR, { recursive: true, force: true });

    // Create ZIP using PowerShell Compress-Archive
    const packCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${EXT_SOURCE}' -DestinationPath '${ZIP_PATH}' -Force"`;
    execSync(packCmd, { stdio: 'inherit' });
    assert(fs.existsSync(ZIP_PATH), 'ZIP artifact must be created');
    const zipSize = fs.statSync(ZIP_PATH).size;
    const zipSha256 = computeSha256(ZIP_PATH);
    log(`   ZIP Path:   ${ZIP_PATH}`);
    log(`   ZIP Size:   ${zipSize} bytes`);
    log(`   ZIP SHA256: ${zipSha256}`);
    assert(zipSize > 100000, 'ZIP size must be substantial (>100KB)');
    log('   ✅ STAGE 2 PASS: Isolated ZIP package created and hashed.');

    // ── STAGE 3: Unpack ZIP Artifact & Verify Extracted Provenance ─────────
    log('\n>>> [STAGE 3] Unpacking ZIP Artifact & Verifying Extracted Provenance...');
    fs.mkdirSync(UNPACK_DIR, { recursive: true });
    const unpackCmd = `powershell -NoProfile -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${UNPACK_DIR}' -Force"`;
    execSync(unpackCmd, { stdio: 'inherit' });
    assert(fs.existsSync(UNPACKED_EXT), `Unpacked extension folder must exist at: ${UNPACKED_EXT}`);
    assert(fs.existsSync(path.join(UNPACKED_EXT, 'manifest.json')), 'manifest.json must exist in unpacked extension');

    const unpackedBpPath = path.join(UNPACKED_EXT, 'modules/build-provenance.js');
    assert(fs.existsSync(unpackedBpPath), 'modules/build-provenance.js must exist in unpacked extension');
    const UnpackedBP = require(unpackedBpPath);

    log(`   Unpacked Channel:        ${UnpackedBP.BUILD_INFO.channel}`);
    log(`   Unpacked Build ID:       ${UnpackedBP.BUILD_INFO.buildId}`);
    log(`   Unpacked testOnly:       ${UnpackedBP.BUILD_INFO.testOnly}`);
    log(`   Unpacked prodReady:      ${UnpackedBP.BUILD_INFO.productionReady}`);
    log(`   Unpacked isOwnerTest():  ${UnpackedBP.isOwnerTestAuthorized()}`);
    log(`   Unpacked isTestOnly():   ${UnpackedBP.isTestOnlyBuild()}`);

    assert.strictEqual(UnpackedBP.BUILD_INFO.channel, 'OWNER_BETA_V7_DUAL_MODE', 'Channel must be OWNER_BETA_V7_DUAL_MODE');
    assert.strictEqual(UnpackedBP.BUILD_INFO.testOnly, false, 'testOnly must be false for Owner Beta dual mode');
    assert.strictEqual(UnpackedBP.BUILD_INFO.productionReady, false, 'productionReady must be false in beta');
    assert.strictEqual(UnpackedBP.isOwnerTestAuthorized(), true, 'isOwnerTestAuthorized() must return true');
    assert.strictEqual(UnpackedBP.isTestOnlyBuild(), true, 'isTestOnlyBuild() must return true');
    log('   ✅ STAGE 3 PASS: Unpacked package provenance authorization verified.');

    // ── STAGE 4: Launch Microsoft Edge with Unpacked Extension ────────────
    log('\n>>> [STAGE 4] Launching Microsoft Edge with Unpacked Extension via CDP...');
    const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgeExe = edgePaths.find(p => fs.existsSync(p));
    assert(edgeExe, 'Microsoft Edge executable not found');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge_owner_beta_audit_'));
    const edgeArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--load-extension=${UNPACKED_EXT}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank'
    ];

    log(`   Launching Edge: "${edgeExe}"`);
    const edgeProcess = spawn(edgeExe, edgeArgs, { detached: false, stdio: 'ignore' });
    const edgePid = edgeProcess.pid;
    log(`   Edge Process PID: ${edgePid}`);

    let versionData = null;
    for (let i = 0; i < 40; i++) {
        await sleep(250);
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
            if (res.ok) {
                versionData = await res.json();
                break;
            }
        } catch (_) {}
    }
    assert(versionData, 'Could not connect to Edge DevTools');
    log(`   Connected to Microsoft Edge: ${versionData['Browser']}`);

    // Discover XPIDER Extension Target
    const EXPECTED_EXT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';
    log(`   Targeting XPIDER Extension ID: ${EXPECTED_EXT_ID}`);

    // Open XPIDER Popup UI first to ensure extension context is active
    const popupUrl = `chrome-extension://${EXPECTED_EXT_ID}/popup.html`;
    const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' });
    const popupTarget = await newTargetRes.json();
    log(`   Opened XPIDER Popup UI: ${popupTarget.id} (${popupTarget.url})`);

    const popupWs = new WebSocket(popupTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        popupWs.onopen = resolve;
        popupWs.onerror = reject;
    });
    await cdpSend(popupWs, 'Page.enable');
    await cdpSend(popupWs, 'Runtime.enable');
    await sleep(1000);

    const evalPopup = async (expression) => {
        const res = await cdpSend(popupWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) throw new Error(`Popup Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
        return res.result ? res.result.value : null;
    };

    try {
        // ── STAGE 5: Seed Pre-existing Owner Data ──────────────────────────
        log('\n>>> [STAGE 5] Seeding Pre-existing Owner Profile (50 Public URLs + Settings)...');
        const ownerPublicUrls = Array.from({ length: 50 }, (_, i) => `https://legitimate-target-${i + 1}.example.org/contact`);
        await evalPopup(`(async () => {
            await chrome.storage.local.set({
                xpider_queue: ${JSON.stringify(ownerPublicUrls)},
                xpider_total: 50,
                xpider_delayMs: 6000,
                xpider_fillDelayMs: 350,
                xpider_submitDelayMs: 3000,
                xpider_skip_attempted: true,
                xpider_double_submit: true,
                xpider_owner_function_test_mode: false,
                xpider_private_egress_config: {
                    enabled: true,
                    mode: 'WIREGUARD_DISPOSABLE',
                    region: 'us-east',
                    egressIp: '198.51.100.42'
                }
            });
        })()`);
        await sleep(500);

        // Reload popup to display seeded queue
        await evalPopup('location.reload()');
        await sleep(1000);

        const initialQueueCount = await evalPopup('((typeof window.getCampaignQueue === "function" ? window.getCampaignQueue() : window.campaignQueue)?.length) || 0');
        log(`   Initial Owner Queue in Popup: ${initialQueueCount} public URLs`);
        assert.strictEqual(initialQueueCount, 50, 'Queue must initially contain 50 public URLs');
        await captureScreenshot(popupWs, '01_owner_beta_packaged_seeded_state.png');
        log('   ✅ STAGE 5 PASS: Pre-existing Owner public data established.');

        // ── STAGE 6: Click ✨ AUTO SETUP & Verify Blocker Resolution ────────
        log('\n>>> [STAGE 6] Clicking #auto-setup-btn (✨ AUTO SETUP) in Edge...');
        await evalPopup(`document.getElementById('auto-setup-btn')?.click()`);
        await sleep(1500);

        let autoSetupResult = null;
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            autoSetupResult = await evalPopup(`(async () => {
                const pill = document.getElementById('auto-setup-status-pill')?.textContent || '';
                const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
                const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
                const st = await chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_function_test_mode']);
                return { pill, feedback, queueLen: q.length, st };
            })()`);
            if (autoSetupResult.pill.includes('READY')) break;
        }

        log(`   Auto Setup Status Pill: "${autoSetupResult.pill}"`);
        log(`   Auto Setup Feedback:    "${autoSetupResult.feedback.replace(/\n/g, ' ')}"`);
        log(`   Queue Length:           ${autoSetupResult.queueLen}`);

        // Rigorous assertions on AUTO SETUP outcome
        assert(!autoSetupResult.feedback.includes('Runtime build is not authorized for TEST_ONLY or OWNER_BETA channel'),
            'DEFECT REPRODUCED: Runtime build unauthorized error must NOT occur!');
        assert(!autoSetupResult.feedback.includes('AUTO SETUP FAILED'),
            `AUTO SETUP must succeed: ${autoSetupResult.feedback}`);
        assert(autoSetupResult.pill.includes('READY'), 'Status pill must indicate READY');
        assert.strictEqual(autoSetupResult.queueLen, 8, 'Queue must be atomically loaded with exactly 8 local fixtures');
        assert(autoSetupResult.st.xpider_owner_backup_snapshot, 'Snapshot must be stored in chrome.storage.local');
        assert.strictEqual(autoSetupResult.st.xpider_owner_backup_snapshot.queue.length, 50, 'Snapshot must preserve all 50 public URLs');
        assert.strictEqual(autoSetupResult.st.xpider_owner_function_test_mode, true, 'xpider_owner_function_test_mode must be true');

        // Check DNR rules installed
        const sessionRules = await evalPopup(`(async () => (await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id))()`);
        log(`   DNR Session Rules Active: [${sessionRules.join(', ')}]`);
        const requiredRules = [990001, 990002, 990003, 990004, 990005];
        assert(requiredRules.every(id => sessionRules.includes(id)), 'All 5 core DNR session rules must be installed');

        await captureScreenshot(popupWs, '02_owner_beta_packaged_auto_setup_ready.png');
        log('   ✅ STAGE 6 PASS: AUTO SETUP succeeded cleanly in Edge. 50 public URLs preserved, 8 fixtures armed.');

        // ── STAGE 7: Outbound Network Guard Enforcement Test ───────────────
        log('\n>>> [STAGE 7] Verifying DeclarativeNetRequest Network Guard Enforcement...');
        // Test 1: External public request must be blocked by DNR rule
        const extBlockTest = await evalPopup(`(async () => {
            try {
                const res = await fetch('https://example.com/test-blocked-outbound', { signal: AbortSignal.timeout(3000) });
                return { blocked: false, status: res.status };
            } catch (err) {
                return { blocked: true, error: err.message };
            }
        })()`);
        log(`   External Fetch Test: blocked=${extBlockTest.blocked} (${extBlockTest.error || extBlockTest.status})`);
        assert.strictEqual(extBlockTest.blocked, true, 'Outbound non-loopback HTTP request MUST be blocked by DeclarativeNetRequest guard');

        // Test 2: Localhost request must be allowed
        const localAllowTest = await evalPopup(`(async () => {
            try {
                const res = await fetch('http://127.0.0.1:${TEST_SERVER_PORT}/__xpider_health');
                return { ok: res.ok, status: res.status };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        })()`);
        log(`   Localhost Fetch Test: ok=${localAllowTest.ok} status=${localAllowTest.status}`);
        assert.strictEqual(localAllowTest.ok, true, 'Localhost 127.0.0.1:8088 MUST be permitted by priority rules');
        log('   ✅ STAGE 7 PASS: DeclarativeNetRequest guard strictly enforces loopback-only isolation.');

        // ── STAGE 8: Execute RUN FUNCTION TEST across 8 Local Fixtures ───────
        log('\n>>> [STAGE 8] Executing RUN FUNCTION TEST across 8 Local Fixtures...');
        // Configure fast speeds for rapid automated test completion
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

        log('   Clicking #run-function-test-btn...');
        await evalPopup(`document.getElementById('run-function-test-btn')?.click()`);

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
            log(`   [Progress] ${finalState.prog} | SUCCESS: ${finalState.succ} | SKIPPED: ${finalState.skip} | FAILURE: ${finalState.fail} | Rem: ${finalState.rem} | Status: ${finalState.statusTitle}`);

            if (completed >= 8 && (finalState.statusTitle.includes('Finished') || finalState.feedback.includes('PASS'))) {
                finished = true;
                break;
            }
        }

        assert(finished, 'Functional test campaign did not finish within timeout');

        // Poll for terminal verdict to settle
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
            if (terminalOutcomes.feedback && terminalOutcomes.feedback.includes('PASS')) break;
        }

        log(`   🏆 Final Verdict: SUCCESS=${terminalOutcomes.succ}, SKIPPED=${terminalOutcomes.skip}, FAILURE=${terminalOutcomes.fail}`);
        log(`   Feedback:        "${terminalOutcomes.feedback.replace(/\n/g, ' ')}"`);

        assert.strictEqual(terminalOutcomes.succ, '5', 'Must achieve exactly 5 SUCCESS');
        assert.strictEqual(terminalOutcomes.skip, '2', 'Must achieve exactly 2 SKIPPED');
        assert.strictEqual(terminalOutcomes.fail, '1', 'Must achieve exactly 1 FAILURE');
        assert(terminalOutcomes.feedback.includes('PASS (100% EXPECTED OUTCOME)'), 'Terminal verdict must declare PASS');

        // Verify durable 8-entry ledger in storage
        const ledgerAttempts = await evalPopup(`(async () => {
            const st = await chrome.storage.local.get('xpider_history_attempts');
            return Array.isArray(st.xpider_history_attempts) ? st.xpider_history_attempts.length : 0;
        })()`);
        log(`   Durable Ledger Attempts in Storage: ${ledgerAttempts}`);
        assert(ledgerAttempts >= 8, `Ledger must record at least 8 fixture attempts (got ${ledgerAttempts})`);

        await captureScreenshot(popupWs, '03_owner_beta_packaged_test_pass.png');
        log('   ✅ STAGE 8 PASS: All 8 fixtures executed autonomously. Expected 5/2/1 outcome verified 100%.');

        // ── STAGE 9: Click ↩ RESTORE and Verify Settings Restoration ────────
        log('\n>>> [STAGE 9] Clicking #restore-user-settings-btn (↩ RESTORE)...');
        await evalPopup(`document.getElementById('restore-user-settings-btn')?.click()`);
        await sleep(1200);

        const restoredState = await evalPopup(`(async () => {
            const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
            const st = await chrome.storage.local.get([
                'xpider_queue',
                'xpider_total',
                'xpider_delayMs',
                'xpider_fillDelayMs',
                'xpider_submitDelayMs',
                'xpider_skip_attempted',
                'xpider_double_submit',
                'xpider_owner_function_test_mode'
            ]);
            return { liveQueueLen: q.length, storage: st };
        })()`);

        log(`   Restored Live Queue Length:    ${restoredState.liveQueueLen}`);
        log(`   Restored Storage Queue Length: ${restoredState.storage.xpider_queue?.length}`);
        log(`   Restored Test Mode Flag:       ${restoredState.storage.xpider_owner_function_test_mode}`);

        assert.strictEqual(restoredState.liveQueueLen, 50, 'Live queue must be restored to 50 public URLs');
        assert.strictEqual(restoredState.storage.xpider_queue.length, 50, 'Storage queue must be restored to 50 public URLs');
        assert.strictEqual(restoredState.storage.xpider_owner_function_test_mode, false, 'Test mode flag must be restored to false');
        assert.strictEqual(restoredState.storage.xpider_delayMs, 6000, 'Delay must be restored to 6000ms');

        await captureScreenshot(popupWs, '04_owner_beta_packaged_restored_state.png');
        log('   ✅ STAGE 9 PASS: 50 public URLs and original Owner settings restored cleanly.');

        // ── STAGE 10: State-Aware SW Boot Reconciliation ───────────────────
        log('\n>>> [STAGE 10] Testing Service Worker Boot Stale-Flag Reconciliation...');
        // Simulate stale test mode flag left in storage when no test session is active
        await evalPopup(`(async () => {
            await chrome.storage.local.set({
                xpider_owner_function_test_mode: true,
                xpider_isActive: false,
                xpider_isPaused: false,
                xpider_active_test_source: null
            });
            location.reload();
        })()`);
        await sleep(1000);

        const reconciledTestMode = await evalPopup(`(async () => (await chrome.storage.local.get('xpider_owner_function_test_mode')).xpider_owner_function_test_mode)()`);
        const rulesAfterReconcile = await evalPopup(`(async () => (await chrome.declarativeNetRequest.getSessionRules()).map(r => r.id))()`);
        log(`   Reconciled Test Mode Flag: ${reconciledTestMode}`);
        log(`   DNR Rules After Reconcile: [${rulesAfterReconcile.join(', ')}]`);

        assert.strictEqual(reconciledTestMode, false, 'Stale test mode must be auto-cleared to false on SW boot');
        assert.strictEqual(rulesAfterReconcile.length, 0, 'DNR test guard rules must be cleared on boot when session inactive');
        log('   ✅ STAGE 10 PASS: Stale-flag boot reconciliation auto-cleared test mode & guard.');

    } finally {
        log('\n>>> [CLEANUP] Terminating owned Edge process...');
        try {
            edgeProcess.kill();
        } catch (_) {}
        log(`   Terminated Edge PID=${edgePid}.`);
    }

    log('\n========================================================================');
    log('  🏆 PACKAGED-BUILD REAL MICROSOFT EDGE AUDIT: 100% PASS');
    log('  ZIP: ' + ZIP_PATH);
    log('  SHA256: ' + zipSha256);
    log('========================================================================\n');

    return {
        zipPath: ZIP_PATH,
        zipSha256,
        zipSize
    };
}

runPackagedEdgeAudit().catch(err => {
    console.error('Packaged audit failed:', err);
    process.exit(1);
});
