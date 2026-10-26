/**
 * audit_unpacked_rc3_59_78_zip.js
 * 
 * Strict Independent Packaging Integrity & Functionality Audit for:
 * [XPIDER R6.9G.10.3.7.1.4.78 OWNER BETA]
 * 
 * Directly tests the extracted ZIP artifact (not the git working tree).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { JSDOM } = require('jsdom');

const ZIP_NAME = 'XPIDER_R6.9G.10.3.7.1.4.78_OWNER_BETA.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const UNPACK_DIR = path.resolve('scratch/unpacked_rc3_59_78');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_rc3_59_78_unpacked_audit.log');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, '', 'utf8');

function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function sha256File(fp) {
    return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    log('========================================================================');
    log('  XPIDER RC3.59 .78 INDEPENDENT UNPACKED ZIP INTEGRITY & E2E AUDIT');
    log('========================================================================');

    // ── STAGE 1: Artifact Existence & Hashing ────────────────────────────────
    log('\n>>> [STAGE 1] Validating Package Archive Existence & SHA256...');
    assert(fs.existsSync(ZIP_PATH), `ZIP archive ${ZIP_PATH} must exist`);
    const zipBytes = fs.readFileSync(ZIP_PATH);
    const zipSha256 = sha256File(ZIP_PATH);
    log(`   ZIP Path:   ${ZIP_PATH}`);
    log(`   ZIP Size:   ${zipBytes.length} bytes`);
    log(`   ZIP SHA256: ${zipSha256}`);
    assert(zipBytes.length > 50000000, 'ZIP size must be > 50MB');
    log('   ✅ STAGE 1 PASS: Archive exists and SHA256 computed.');

    // ── STAGE 2: Extraction into Isolated Directory ──────────────────────────
    log('\n>>> [STAGE 2] Unpacking Archive into Isolated Directory...');
    if (fs.existsSync(UNPACK_DIR)) {
        fs.rmSync(UNPACK_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(UNPACK_DIR, { recursive: true });
    execSync(`tar -xf "${ZIP_PATH}" -C "${UNPACK_DIR}"`);
    log(`   Extracted into: ${UNPACK_DIR}`);

    // Verify inventory inside extracted directory
    const inventoryPath = path.join(UNPACK_DIR, 'PACKAGE_INVENTORY_SHA256.txt');
    assert(fs.existsSync(inventoryPath), 'PACKAGE_INVENTORY_SHA256.txt must exist in unpacked archive');
    const invLines = fs.readFileSync(inventoryPath, 'utf8').trim().split('\n');
    log(`   Inventory entries to verify: ${invLines.length}`);

    let checkedFiles = 0;
    for (const line of invLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
            const expectedHash = parts[0];
            const relPath = parts.slice(1).join(' ');
            const fullPath = path.join(UNPACK_DIR, relPath);
            assert(fs.existsSync(fullPath), `File in inventory must exist: ${relPath}`);
            const actualHash = sha256File(fullPath);
            assert.strictEqual(actualHash, expectedHash, `Hash mismatch in unpacked file: ${relPath}`);
            checkedFiles++;
        }
    }
    log(`   ✅ STAGE 2 PASS: All ${checkedFiles} inventory files verified byte-for-byte in unpacked archive.`);

    // ── STAGE 3: Build Provenance Inspection in Unpacked Extension ───────────
    log('\n>>> [STAGE 3] Checking Build Provenance in Unpacked Extension...');
    const unpackedExt = path.join(UNPACK_DIR, 'extension');
    const unpackedBpPath = path.join(unpackedExt, 'modules/build-provenance.js');
    assert(fs.existsSync(unpackedBpPath), 'build-provenance.js must exist in unpacked extension');
    
    // Clear require cache and require unpacked build-provenance
    delete require.cache[require.resolve(unpackedBpPath)];
    const UnpackedBP = require(unpackedBpPath);
    log(`   Unpacked Build ID: ${UnpackedBP.BUILD_INFO.buildId}`);
    log(`   Unpacked Channel:  ${UnpackedBP.BUILD_INFO.channel}`);
    log(`   Unpacked testOnly: ${UnpackedBP.BUILD_INFO.testOnly}`);
    assert.strictEqual(UnpackedBP.BUILD_INFO.buildId, 'R6.9G.10.3.7.1.4.78-20261026-P0-RC3.59-AI-REQUIRED-FIELDS');
    assert.strictEqual(UnpackedBP.BUILD_INFO.testOnly, false);
    assert.strictEqual(UnpackedBP.isTestOnlyBuild(), true);
    log('   ✅ STAGE 3 PASS: Unpacked build provenance contains correct .78 identifiers.');

    // ── STAGE 4: Direct Unit Tests Against Unpacked Extension Modules ────────
    log('\n>>> [STAGE 4] Executing AI Constraint, Legal Consent & Truthful Fact Tests from Unpacked Code...');
    const UnpackedCompletionEngine = require(path.join(unpackedExt, 'modules/final-form-completion-engine.js'));
    const UnpackedCheckboxResolver = require(path.join(unpackedExt, 'modules/checkbox-resolver-r2.js'));
    const UnpackedSelectResolver = require(path.join(unpackedExt, 'modules/select-resolver-r2.js'));

    const fixtureHtml = fs.readFileSync(path.resolve(__dirname, '../owner-extension-test-site/ai-required-fields.html'), 'utf8');
    const dom1 = new JSDOM(fixtureHtml, { url: 'http://127.0.0.1:8088/ai-required-fields.html' });
    const form1 = dom1.window.document.getElementById('ai-required-form');
    
    form1.querySelector('#f-name').value = 'Test User';
    form1.querySelector('#f-email').value = 'test@example.com';
    form1.querySelector('#f-message').value = 'Testing template message';

    const template1 = {
        name: 'Test User',
        email: 'test@example.com',
        message: 'Testing template message',
        company: 'XPIDER Automation Lab',
        city: 'Seoul',
        website: 'https://xpider.dev',
        ownerAuthorizedConsent: true
    };

    const engine1 = new UnpackedCompletionEngine({
        logger: console.log,
        checkboxResolver: new UnpackedCheckboxResolver(),
        selectResolver: new UnpackedSelectResolver(),
        ownerAuthorizedConsent: true
    });

    // 4.1 Constraint-Aware Completion Test
    const res1 = await engine1.run(form1, template1, { url: 'http://127.0.0.1:8088/ai-required-fields.html' });
    assert.strictEqual(res1.pass, true, `Unpacked completion must pass: ${res1.reason}`);
    assert.strictEqual(res1.unresolvedRequired, 0);
    assert.strictEqual(form1.querySelector('#f-terms').checked, true, 'Terms must be checked when authorized');
    assert.strictEqual(form1.querySelector('#f-marketing').checked, false, 'Marketing must stay unchecked');
    assert.strictEqual(form1.querySelector('#f-website').value, 'https://xpider.dev');
    log('   ✔ 4.1 PASS: Unpacked constraint completion verified.');

    // 4.2 Sensitive Fact Guard (SSN)
    const sensitiveHtml = fs.readFileSync(path.resolve(__dirname, '../owner-extension-test-site/ai-ambiguous-safe-skip.html'), 'utf8');
    const dom2 = new JSDOM(sensitiveHtml, { url: 'http://127.0.0.1:8088/ai-ambiguous-safe-skip.html' });
    const form2 = dom2.window.document.getElementById('sensitive-form');
    const res2 = await engine1.run(form2, template1);
    assert.strictEqual(res2.pass, false);
    assert.strictEqual(res2.reason, 'UNRESOLVED_REQUIRED_FACT');
    assert.strictEqual(form2.querySelector('#ssn').value, '');
    log('   ✔ 4.2 PASS: Unpacked sensitive fact guard halted with UNRESOLVED_REQUIRED_FACT.');

    // 4.3 Consent-Negative Fixture (Zero Fabricated Agreement)
    const consentHtml = fs.readFileSync(path.resolve(__dirname, '../owner-extension-test-site/ai-consent-unauthorized.html'), 'utf8');
    const dom3 = new JSDOM(consentHtml, { url: 'http://127.0.0.1:8088/ai-consent-unauthorized.html' });
    const form3 = dom3.window.document.getElementById('consent-negative-form');
    const engineUnauthorized = new UnpackedCompletionEngine({
        logger: console.log,
        checkboxResolver: new UnpackedCheckboxResolver(),
        selectResolver: new UnpackedSelectResolver(),
        ownerAuthorizedConsent: false
    });
    const res3 = await engineUnauthorized.run(form3, { ...template1, ownerAuthorizedConsent: false });
    assert.strictEqual(res3.pass, false);
    assert.strictEqual(res3.reason, 'OWNER_ACTION_REQUIRED');
    assert.strictEqual(form3.querySelector('#f-legal-terms').checked, false);
    log('   ✔ 4.3 PASS: Unpacked consent-negative fixture halted with OWNER_ACTION_REQUIRED.');

    // 4.4 Missing URL Truthful Business Fact Guard
    const dom4 = new JSDOM(fixtureHtml, { url: 'http://127.0.0.1:8088/ai-required-fields.html' });
    const form4 = dom4.window.document.getElementById('ai-required-form');
    const res4 = await engine1.run(form4, { ...template1, website: '', url: '' });
    assert.strictEqual(res4.pass, false);
    assert.strictEqual(res4.reason, 'UNRESOLVED_BUSINESS_FACT');
    assert.strictEqual(form4.querySelector('#f-website').value, '');
    log('   ✔ 4.4 PASS: Unpacked missing URL halted with UNRESOLVED_BUSINESS_FACT.');
    log('   ✅ STAGE 4 PASS: All unpacked unit test constraints passed 100%.');

    // ── STAGE 5: Real Microsoft Edge E2E Audit of Unpacked Extension ─────────
    log('\n>>> [STAGE 5] Launching Microsoft Edge Loading the UNPACKED Extension...');
    const CDP_PORT = 9391;
    const TEST_SERVER_PORT = 8088;

    let serverHealth = await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    if (!serverHealth || !serverHealth.ok) {
        log('   Starting in-process test server...');
        require('../owner-extension-test-site/server.js');
        await sleep(1000);
    }

    const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    assert(fs.existsSync(edgeExe), 'Edge executable must exist');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge_unpacked_rc3_59_78_'));

    const edgeArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--load-extension=${unpackedExt}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank'
    ];

    log(`   Spawning Edge with unpacked extension: ${unpackedExt}`);
    const edgeProcess = spawn(edgeExe, edgeArgs, { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
            if (targets && targets.length > 0) break;
        } catch (_) {}
    }
    assert(targets && targets.length > 0, 'Must connect to Edge CDP');

    let extId = null;
    let bgTarget = null;
    for (let i = 0; i < 20; i++) {
        targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json());
        bgTarget = targets.find(t => t.type === 'service_worker' && t.url && t.url.includes('background.js'));
        if (bgTarget) {
            const m = bgTarget.url.match(/chrome-extension:\/\/([a-z0-9_-]+)/);
            if (m) { extId = m[1]; break; }
        }
        await sleep(500);
    }
    assert(bgTarget && extId, 'Extension Service Worker ID must be detected in Edge CDP');
    log(`   Edge loaded unpacked extension ID: ${extId}`);

    const swWs = new WebSocket(bgTarget.webSocketDebuggerUrl);
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

    // Open popup
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const popupTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' }).then(r => r.json());
    assert(popupTargetRes && popupTargetRes.webSocketDebuggerUrl, 'Must create popup page target');

    const popupWs = new WebSocket(popupTargetRes.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
        popupWs.onopen = res;
        popupWs.onerror = rej;
    });

    await cdpSend(popupWs, 'Page.enable');
    await cdpSend(popupWs, 'Runtime.enable');
    await sleep(800);

    const evalPopup = async (expression) => {
        const res = await cdpSend(popupWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) throw new Error(`Popup Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
        return res.result ? res.result.value : null;
    };

    // Pre-populate owner queue
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

    // Auto Setup
    log('   Clicking #auto-setup-btn on unpacked extension...');
    await evalPopup(`document.getElementById('auto-setup-btn')?.click()`);
    await sleep(1500);

    let autoSetupResult = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        autoSetupResult = await evalPopup(`(async () => {
            const pill = document.getElementById('auto-setup-status-pill')?.textContent || '';
            const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
            const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
            return { pill, feedback, queueLen: q.length };
        })()`);
        if (autoSetupResult.pill.includes('READY')) break;
    }
    assert(autoSetupResult.pill.includes('READY'), `Status pill must indicate READY: ${autoSetupResult.pill}`);
    assert.strictEqual(autoSetupResult.queueLen, 8, '8 local fixtures armed');

    // Run Function Test
    log('   Clicking #run-function-test-btn on unpacked extension...');
    await evalPopup(`(() => {
        const sC = document.getElementById('delay-input-collect');
        if (sC) { sC.value = '9'; sC.dispatchEvent(new Event('change')); }
        const sF = document.getElementById('delay-input-fill');
        if (sF) { sF.value = '9'; sF.dispatchEvent(new Event('change')); }
        const sS = document.getElementById('delay-input-submit');
        if (sS) { sS.value = '9'; sS.dispatchEvent(new Event('change')); }
        const fInstant = document.getElementById('fill-mode-instant');
        if (fInstant) { fInstant.checked = true; fInstant.dispatchEvent(new Event('change')); }
        document.getElementById('run-function-test-btn')?.click();
    })()`);

    // Poll until completion (max 180s)
    let finished = false;
    let finalLedger = [];
    for (let sec = 0; sec < 120; sec++) {
        await sleep(1500);
        const finalState = await evalPopup(`(() => {
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
        if (sec % 5 === 0) {
            log(`   [Edge Progress] ${finalState.prog} | SUCCESS: ${finalState.succ} | SKIPPED: ${finalState.skip} | FAILURE: ${finalState.fail} | Remaining: ${finalState.rem} | Status: ${finalState.statusTitle}`);
        }
        if (completed >= 8 && (finalState.statusTitle.includes('Finished') || finalState.feedback.includes('PASS'))) {
            finished = true;
            break;
        }
    }
    assert(finished, 'Edge function test must finish in bounded time');

    // Retrieve ledger
    finalLedger = await evalSw(`(async () => {
        const hs = await getHistoryStoreInstance();
        return (hs.attempts || []).map(a => ({
            url: a.targetUrl || a.url || a.targetIdentity,
            status: a.status,
            reason: a.reasonCode,
            receiptId: a.receiptId || a.metadata?.receiptId
        }));
    })()`);
    log(`   Final Ledger Entries (${finalLedger.length}):`);
    console.log(JSON.stringify(finalLedger, null, 2));

    const successCount = finalLedger.filter(e => e.status === 'CONFIRMED_SUCCESS').length;
    const skippedCount = finalLedger.filter(e => e.status === 'SKIPPED').length;
    const failureCount = finalLedger.filter(e => e.status === 'FAILURE').length;
    log(`   Outcome: ${successCount} SUCCESS / ${skippedCount} SKIPPED / ${failureCount} FAILURE`);
    assert.strictEqual(successCount, 5, 'Must have exactly 5 successes');
    assert.strictEqual(skippedCount, 2, 'Must have exactly 2 skipped');
    assert.strictEqual(failureCount, 1, 'Must have exactly 1 failure');

    // Verify restore
    await evalPopup(`document.getElementById('restore-user-settings-btn')?.click()`);
    await sleep(1000);

    const restoreRes = await evalSw(`(async () => {
        const st = await chrome.storage.local.get(['xpider_queue', 'xpider_delayMs', 'xpider_private_egress_config']);
        return {
            urlsLength: (st.xpider_queue || []).length,
            delayMs: st.xpider_delayMs,
            egressMode: st.xpider_private_egress_config?.mode
        };
    })()`);
    log(`   Restored Queue Length:    ${restoreRes.urlsLength} (expected 50)`);
    log(`   Restored Delay Setting:   ${restoreRes.delayMs}ms (expected 7000ms)`);
    log(`   Private Egress Preserved: ${restoreRes.egressMode}`);
    assert.strictEqual(restoreRes.urlsLength, 50, '50 URLs restored');
    assert.strictEqual(restoreRes.delayMs, 7000, '7000ms delay restored');
    assert.strictEqual(restoreRes.egressMode, 'WIREGUARD_DISPOSABLE', 'Egress preserved');
    log('   ✔ 50 URLs and settings restored cleanly.');

    // Close Edge
    try { swWs.close(); } catch (_) {}
    try { popupWs.close(); } catch (_) {}
    try { edgeProcess.kill('SIGKILL'); } catch (_) {}
    log('   ✅ STAGE 5 PASS: Real Microsoft Edge E2E test against UNPACKED ZIP verified 100%.');

    log('\n========================================================================');
    log('  🏆 ALL UNPACKED RC3.59 .78 INTEGRITY & FUNCTIONALITY GATES PASSED 100%');
    log('========================================================================');
    process.exit(0);
})().catch(err => {
    log(`❌ AUDIT FAILED: ${err.message}\n${err.stack}`);
    process.exit(1);
});
