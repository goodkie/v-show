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
    assert(cgContent.includes('lead-inquiry-form'), 'contact-gate.js must contain lead-inquiry-form type');
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

    // Collect diagnostic and blackbox logs for stage timeline reconstruction
    const diagData = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const store = await chrome.storage.local.get(['xpider_current_run_diagnostics', 'xpider_blackbox_logs', 'xpider_diagnostic_logs']);
            const diagEvents = (store.xpider_current_run_diagnostics && store.xpider_current_run_diagnostics.events) || [];
            const bbLogs = (store.xpider_blackbox_logs || []).map(b => typeof b === 'string' ? b : ('[' + b.timestamp + '][' + b.type + '] ' + b.message));
            const logs = [...diagEvents, ...bbLogs];
            const hs = await getHistoryStoreInstance();
            const attempts = hs ? hs.attempts.filter(a => a.campaignRunId === campaignState.campaignRunId).map(a => ({
                target: a.sourceUrl,
                status: a.status,
                reason: a.reasonCode,
                metadata: a.metadata || {}
            })) : [];
            return { logs, attempts };
        })()`,
        awaitPromise: true,
        returnByValue: true
    });

    const fin = diagData.result.value || { logs: [], attempts: [] };
    const rawLogs = fin.logs.map(x => typeof x === 'string' ? x : JSON.stringify(x));
    log(`Captured ${rawLogs.length} diagnostic log entries.`);

    const STAGES = [
        ['START/PREFLIGHT', /PRIVACY|PREFLIGHT|Starting campaign|START_CAMPAIGN|BUILD_HANDSHAKE|START_STEP/i],
        ['EGRESS', /EGRESS|PROXY|RELAY|PRIVATE_EGRESS|DIRECT/i],
        ['CONTACT_DISCOVERY', /CONTACT|SNIPER|candidate|discover|Scanning paths/i],
        ['FORM_CLASSIFICATION', /classif|FORM_FOUND|findOptimalForm|inquiry form|NO_ACCESSIBLE|ELIGIBLE_FORM|LONG_TEXT_GATE|lead-inquiry/i],
        ['FIELD_MAPPING', /mapp|field|FIELD_CLASSIFY|FIELD_ASSIGN/i],
        ['AUTOFILL', /autofill|fill|typed|AUTOFILL_READY|HyperEngine/i],
        ['CAPTCHA_DETECT', /captcha|turnstile|recaptcha|hcaptcha|CAPTCHA_STATE/i],
        ['PROVIDER_REQUEST/TERMINAL', /provider|solver|2captcha|capsolver|nopecha/i],
        ['MANUAL_FALLBACK', /manual|MANUAL_ASSIST/i],
        ['SUBMIT', /submit|WOULD_SUBMIT|visionSubmit/i],
        ['OUTCOME', /outcome|SETTLED|finishCampaign|terminal|TARGET_COMPLETE|RESULT/i],
        ['LEDGER', /ledger|LEDGER_INIT|LEDGER_RECORD|history/i]
    ];

    log('--- STAGE MATRIX ---');
    const matrix = [];
    targets2.forEach((url, i) => {
        const host = new URL(url).hostname;
        const attempt = fin.attempts.find(a => a.target && a.target.includes(host));
        const rel = rawLogs.filter(x => x.includes(host));
        const hit = {};
        const stageTimestamps = {};
        STAGES.forEach(([n, re]) => {
            const matchLine = rel.find(x => re.test(x)) || (['START/PREFLIGHT', 'EGRESS', 'LEDGER'].includes(n) ? rawLogs.find(x => re.test(x)) : null);
            if (matchLine) {
                hit[n] = true;
                const tsMatch = matchLine.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\]/);
                stageTimestamps[n] = tsMatch ? tsMatch[1] : 'present';
            } else {
                hit[n] = false;
            }
        });
        const stagesSeen = Object.keys(hit).filter(k => hit[k]);
        const status = attempt ? attempt.status : 'UNKNOWN';
        const reason = attempt ? attempt.reason : 'UNKNOWN';
        const failed = !/WOULD_SUBMIT|AUTOFILL_READY|SUCCESS|CONFIRMED/i.test(`${status} ${reason}`);
        let firstFailStage = null;
        if (failed) {
            firstFailStage = (STAGES.find(([n]) => !hit[n]) || ['OUTCOME'])[0];
        }
        const entry = { target: `T${i+1}`, host, status, reason, stagesSeen, firstFailStage, stageTimestamps };
        log(JSON.stringify(entry));
        matrix.push(entry);
    });

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
