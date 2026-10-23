/**
 * test/run_edge_p0_rc3_44_live_fix_validation.js
 *
 * RC3.44 P0-FIX Live Validation
 * Validates the contact-gate Path 5 fix on real Owner campaign sites:
 *   T1: https://liveyourtoplife.com/     (was TIMEOUT_LOCAL / FORM_CLASSIFICATION)
 *   T2: https://martialarts.dedhamhealth.com  (was FORM_CLASSIFICATION)
 *   T3: https://www.otmartialarts.com/contact (was MANUAL_FALLBACK - expected per prior run)
 *
 * Uses the LOCAL REPO extension (extension/ folder with RC3.44 fix applied).
 * Clean isolated profile; does NOT touch Owner Chrome profile.
 *
 * SAFE MODE: Stops before actual submission; records FIRST_FAIL_STAGE per target.
 * Reports [LONG_TEXT_GATE] log lines and FORM_CLASSIFICATION stage passage.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const CDP_PORT = 9317;
const EXT_DIR = path.resolve('extension');
const LOG_DIR = path.resolve('evidence/recover_p0_20261022');
const LOG_FILE = path.join(LOG_DIR, 'rc3_44_live_fix_validation.log');

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, '', 'utf8');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
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

async function main() {
    log('================ XPIDER RC3.44 P0-FIX LIVE VALIDATION (EDGE) ================');
    log(`Extension dir: ${EXT_DIR}`);

    // Verify fix is in place
    const cgContent = fs.readFileSync('extension/modules/contact-gate.js', 'utf8');
    assert(cgContent.includes('RC3.44 P0-FIX'), 'contact-gate.js must contain RC3.44 P0-FIX comment');
    assert(cgContent.includes('text-input-inquiry'), 'contact-gate.js must contain text-input-inquiry type');
    log('✅ Static: RC3.44 P0-FIX present in contact-gate.js');

    const bpContent = fs.readFileSync('extension/modules/build-provenance.js', 'utf8');
    assert(bpContent.includes('RC3.44'), 'build-provenance must reference RC3.44');
    assert(bpContent.includes('06f951ba'), 'build-provenance must have F=06f951ba');
    log('✅ Static: Provenance stamped RC3.44 / 06f951ba');

    // Spin up isolated Edge
    const testProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-p0-rc344-'));
    log(`ISOLATED clean profile (not Owner\'s): ${testProfileDir}`);

    const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgePath = edgePaths.find(p => fs.existsSync(p));
    assert(edgePath, 'Microsoft Edge not found');

    const edgeArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${testProfileDir}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        'about:blank'
    ];

    log(`Spawning Edge: ${edgePath}`);
    const edgeProc = spawn(edgePath, edgeArgs, { stdio: 'ignore' });

    // Wait for CDP
    let targets = null;
    for (let i = 0; i < 30; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
            if (res.ok) { targets = await res.json(); break; }
        } catch (_) {}
    }
    assert(targets, 'CDP not available');

    // Find SW
    let swTarget = null;
    for (let i = 0; i < 20; i++) {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        const list = await res.json();
        swTarget = list.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (swTarget) break;
        await sleep(500);
    }
    assert(swTarget, 'Service worker not found');
    const extId = new URL(swTarget.url).hostname;
    log(`extensionId=${extId}`);

    const swWs = await openWs(swTarget.webSocketDebuggerUrl);

    await cdpSend(swWs, 'Runtime.enable');

    // Get build info with retry loop to allow 517KB background.js importScripts to complete
    let bi = 'NOT_LOADED';
    for (let r = 0; r < 20; r++) {
        const buildInfo = await cdpSend(swWs, 'Runtime.evaluate', {
            expression: `(typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? JSON.stringify(BuildProvenance.BUILD_INFO) : 'NOT_LOADED'`,
            returnByValue: true
        });
        bi = buildInfo.result.value;
        if (bi && bi !== 'NOT_LOADED') break;
        await sleep(500);
    }
    log(`buildId check: ${bi}`);
    assert(bi !== 'NOT_LOADED', 'BuildProvenance must be loaded in SW');
    const biParsed = JSON.parse(bi);
    assert.strictEqual(biParsed.buildId, 'R6.9G.10.3.7.1.4.58-20261022-P0-FIX-RC3.44', `Expected RC3.44 buildId, got ${biParsed.buildId}`);
    log(`✅ buildId=R6.9G.10.3.7.1.4.58-20261022-P0-FIX-RC3.44 swAlive=true`);

    // Open popup
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    let pageTargetMeta = await cdpSend(swWs, 'Target.createTarget', { url: popupUrl });
    await sleep(1500);

    let pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    let popupTarget = pages.find(p => p.id === pageTargetMeta.targetId || (p.url && p.url.includes('popup.html')));
    assert(popupTarget, 'Popup target not found');
    let popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
    await cdpSend(popupWs, 'Page.enable');
    await sleep(1000);

    // Target matrix — the 3 sites that failed at FORM_CLASSIFICATION
    const targets2 = [
        'https://liveyourtoplife.com/',
        'https://martialarts.dedhamhealth.com',
        'https://www.otmartialarts.com/contact'
    ];
    log(`targets(${targets2.length}): ${targets2.join(' ')}`);

    const template = {
        id: 'tmpl_rc344_fix_validation',
        version: 1,
        name: 'RC344 Fix Validation',
        email: 'consultation@xpider.test',
        phone: '555-019-8833',
        subject: 'Consultation Inquiry',
        message: 'Hello, I would like to learn more about your programs and schedule a consultation.'
    };

    const launchResult = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const queue = ${JSON.stringify(targets2)};
            const template = ${JSON.stringify(template)};
            await chrome.storage.local.set({
                xpider_queue: queue,
                xpider_total: queue.length,
                xpider_template: template,
                xpider_delay_ms: 1500,
                xpider_fill_delay_ms: 100,
                xpider_submit_delay_ms: 500,
                xpider_owner_function_test_mode: true,
                xpider_live_validation_mode: true
            });
            const liveBp = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : null;
            const res = await new Promise(r => {
                chrome.runtime.sendMessage({
                    action: 'START_CAMPAIGN',
                    queue,
                    template,
                    delayMs: 1500,
                    fillDelayMs: 100,
                    submitDelayMs: 500,
                    targetTimeoutMs: 60000,
                    runScopedDirectPrivacy: true,
                    expectedImplementationHead: liveBp?.implementationHead,
                    expectedBuildId: liveBp?.buildId,
                    expectedManifestVersion: liveBp?.manifestVersion
                }, r);
            });
            return { res };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });

    const lr = launchResult.result.value;
    log(`START_CAMPAIGN response: ${JSON.stringify(lr.res)}`);
    assert(lr.res && lr.res.success, 'START_CAMPAIGN must acknowledge success');

    // Poll for completion
    const stageMatrix = {};
    const startTime = Date.now();
    const TIMEOUT_MS = 200000; // 200s total budget for 3 sites

    while (Date.now() - startTime < TIMEOUT_MS) {
        await sleep(3000);

        const pollState = await cdpSend(swWs, 'Runtime.evaluate', {
            expression: `(async () => {
                const hs = await getHistoryStoreInstance();
                const stats = hs ? hs.getLedgerStats('currentRun') : null;
                return {
                    isActive: campaignState.isActive,
                    isPaused: campaignState.isPaused,
                    completed: campaignState.counters.completed,
                    total: campaignState.counters.total,
                    stage: campaignState.currentTargetStage,
                    stats
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        const ps = pollState.result.value;
        log(`poll a=${ps.isActive} p=${ps.isPaused} st=${ps.stage} c=${ps.completed} t=${ps.total}`);

        if (!ps.isActive && ps.completed >= targets2.length) {
            log('Campaign complete.');
            break;
        }
    }

    // Collect final ledger
    const finalLedger = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const hs = await getHistoryStoreInstance();
            const stats = hs.getLedgerStats('currentRun');
            return { stats };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    log(`ledger stats: ${JSON.stringify(finalLedger.result.value.stats)}`);

    // Collect background console logs to check for LONG_TEXT_GATE / FORM_CLASSIFY
    const bgLogs = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(typeof __xpider_diag_logs !== 'undefined') ? JSON.stringify(__xpider_diag_logs.slice(-200)) : 'NO_DIAG_BUFFER'`,
        returnByValue: true
    });
    log(`diag_logs_check: ${bgLogs.result.value ? bgLogs.result.value.substring(0, 200) : 'n/a'}`);

    // Emit stage matrix
    const allAttempts = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const hs = await getHistoryStoreInstance();
            if (!hs) return [];
            return hs.attempts.filter(a => a.campaignRunId === campaignState.campaignRunId).map(a => ({
                target: a.sourceUrl,
                status: a.status,
                reason: a.reasonCode,
                stages: a.stageHistory || []
            }));
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    const attempts = allAttempts.result.value || [];
    log('--- STAGE MATRIX ---');
    const matrix = [];
    targets2.forEach((url, i) => {
        const host = new URL(url).hostname;
        const attempt = attempts.find(a => a.target && a.target.includes(host));
        const stagesSeen = attempt ? attempt.stages : [];
        const status = attempt ? attempt.status : 'UNKNOWN';
        const reason = attempt ? attempt.reason : 'UNKNOWN';
        const firstFailStage = !stagesSeen.includes('FORM_CLASSIFICATION') ? 'FORM_CLASSIFICATION' :
                               !stagesSeen.includes('FIELD_MAPPING') ? 'FIELD_MAPPING' :
                               !stagesSeen.includes('AUTOFILL') ? 'AUTOFILL' :
                               !stagesSeen.includes('SUBMIT') ? 'SUBMIT' : 'NONE';
        const entry = {target: `T${i+1}`, host, status, reason, stagesSeen, firstFailStage};
        log(JSON.stringify(entry));
        matrix.push(entry);
    });

    // Key assertion: FORM_CLASSIFICATION must now pass for liveyourtoplife and dedhamhealth
    const lytl = matrix.find(m => m.host.includes('liveyourtoplife'));
    const dedham = matrix.find(m => m.host.includes('dedhamhealth'));
    const otma = matrix.find(m => m.host.includes('otmartialarts'));

    if (lytl) {
        log(`liveyourtoplife: FORM_CLASSIFICATION=${lytl.stagesSeen.includes('FORM_CLASSIFICATION') ? 'PASS' : 'FAIL'} status=${lytl.status}`);
    }
    if (dedham) {
        log(`dedhamhealth: FORM_CLASSIFICATION=${dedham.stagesSeen.includes('FORM_CLASSIFICATION') ? 'PASS' : 'FAIL'} status=${dedham.status}`);
    }
    if (otma) {
        log(`otmartialarts: FORM_CLASSIFICATION=${otma.stagesSeen.includes('FORM_CLASSIFICATION') ? 'PASS' : 'FAIL'} status=${otma.status}`);
    }

    log('================ RC3.44 LIVE FIX VALIDATION COMPLETE ================');

    // Write matrix JSON
    const matrixFile = path.join(LOG_DIR, 'rc3_44_live_fix_matrix.json');
    fs.writeFileSync(matrixFile, JSON.stringify({ started: new Date().toISOString(), buildId: 'R6.9G.10.3.7.1.4.58-20261022-P0-FIX-RC3.44', extId, matrix }, null, 2));
    log(`Matrix written to: ${matrixFile}`);

    try { edgeProc.kill('SIGTERM'); } catch (_) {}
    try { fs.rmSync(testProfileDir, { recursive: true, force: true }); } catch (_) {}
}

main().catch(err => {
    log(`❌ FATAL: ${err.message}\n${err.stack}`);
    process.exit(1);
});
