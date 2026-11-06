/**
 * test/run_edge_p0_rc3_44_diag_capture.js
 *
 * RC3.44 live diag capture — mirrors the run_edge_p0_owner_live_url_safe_validation.js
 * pattern for full console log capture. Targets liveyourtoplife.com specifically.
 * Uses RC3.44 extension (local repo), isolated profile.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const CDP_PORT = 9322;
const EXT_DIR = path.resolve('extension');
const LOG_DIR = path.resolve('evidence/recover_p0_20261022');
const LOG_FILE = path.join(LOG_DIR, 'rc3_44_diag_liveyour.log');

fs.mkdirSync(LOG_DIR, { recursive: true });
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

async function main() {
    log('===== RC3.44 DIAG CAPTURE: liveyourtoplife.com =====');

    const testProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-rc344-diag-'));
    log(`Profile: ${testProfileDir}`);

    const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgePath = edgePaths.find(p => fs.existsSync(p));
    if (!edgePath) throw new Error('Edge not found');

    const edgeProc = spawn(edgePath, [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${testProfileDir}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        'about:blank'
    ], { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 30; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
            if (res.ok) { targets = await res.json(); break; }
        } catch (_) {}
    }
    if (!targets) throw new Error('CDP not available');

    let swTarget = null;
    for (let i = 0; i < 20; i++) {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        const list = await res.json();
        swTarget = list.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (swTarget) break;
        await sleep(500);
    }
    if (!swTarget) throw new Error('SW not found');

    const extId = new URL(swTarget.url).hostname;
    log(`extId=${extId}`);
    const swWs = await openWs(swTarget.webSocketDebuggerUrl);

    // Enable SW console logging
    await cdpSend(swWs, 'Runtime.enable');
    const swLogs = [];
    swWs.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.toString());
            if (msg.method === 'Runtime.consoleAPICalled') {
                const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
                swLogs.push(text);
                if (text.includes('LONG_TEXT_GATE') || text.includes('FORM_CLASSIFY') || text.includes('FORM_INTENT') || text.includes('Supreme') || text.includes('Highest score') || text.includes('text-input')) {
                    log(`[SW_CONSOLE] ${text}`);
                }
            }
        } catch (_) {}
    });

    // Open popup
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    let pageTargetMeta = await cdpSend(swWs, 'Target.createTarget', { url: popupUrl });
    await sleep(1500);

    let pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    let popupTarget = pages.find(p => p.id === pageTargetMeta.targetId || (p.url && p.url.includes('popup.html')));
    if (!popupTarget) throw new Error('Popup not found');
    let popupWs = await openWs(popupTarget.webSocketDebuggerUrl);

    await cdpSend(popupWs, 'Runtime.enable');
    await cdpSend(popupWs, 'Page.enable');
    await sleep(1000);

    // Capture popup console (content-script logs surface here via xpider_diag)
    const popupLogs = [];
    popupWs.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.toString());
            if (msg.method === 'Runtime.consoleAPICalled') {
                const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
                popupLogs.push(text);
                if (text.includes('LONG_TEXT_GATE') || text.includes('FORM_CLASSIFY') || text.includes('FORM_INTENT') ||
                    text.includes('Supreme') || text.includes('Highest score') || text.includes('text-input') ||
                    text.includes('TIMEOUT') || text.includes('TARGET') || text.includes('ELIGIBLE') ||
                    text.includes('WAF') || text.includes('CONTACT_DISCOVERY') || text.includes('Discovery')) {
                    log(`[POPUP_CONSOLE] ${text.substring(0, 300)}`);
                }
            }
        } catch (_) {}
    });

    const template = {
        id: 'tmpl_rc344_diag',
        version: 1,
        name: 'Diag Test',
        email: 'consultation@xpider.test',
        phone: '555-019-8833',
        subject: 'Consultation Inquiry',
        message: 'Hello, I would like to learn more about your programs.'
    };

    const launchResult = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(async () => {
            const queue = ['https://liveyourtoplife.com/'];
            const template = ${JSON.stringify(template)};
            const liveBp = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : null;
            await chrome.storage.local.set({
                xpider_queue: queue, xpider_total: 1,
                xpider_template: template,
                xpider_delay_ms: 1500, xpider_fill_delay_ms: 100, xpider_submit_delay_ms: 500,
                xpider_owner_function_test_mode: true
            });
            const res = await new Promise(r => {
                chrome.runtime.sendMessage({
                    action: 'START_CAMPAIGN', queue, template,
                    delayMs: 1500, fillDelayMs: 100, submitDelayMs: 500,
                    targetTimeoutMs: 90000,
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
    log(`START_CAMPAIGN: ${JSON.stringify(launchResult.result.value.res)}`);

    // Wait up to 120s for completion
    const startMs = Date.now();
    while (Date.now() - startMs < 120000) {
        await sleep(3000);
        const st = await cdpSend(swWs, 'Runtime.evaluate', {
            expression: `({ isActive: campaignState.isActive, completed: campaignState.counters.completed, stage: campaignState.currentTargetStage })`,
            returnByValue: true
        });
        const v = st.result.value;
        log(`poll a=${v.isActive} st=${v.stage} c=${v.completed}`);
        if (!v.isActive && v.completed >= 1) { log('Campaign done.'); break; }
    }

    // Dump all captured popup logs to file
    log(`--- CAPTURED ${popupLogs.length} popup logs, ${swLogs.length} sw logs ---`);
    const allLogs = [...swLogs, ...popupLogs];
    const gateLines = allLogs.filter(l => l.includes('LONG_TEXT_GATE') || l.includes('FORM_CLASSIFY') || l.includes('text-input'));
    log('GATE LINES:');
    gateLines.forEach(l => log(l));

    const scoreLines = allLogs.filter(l => l.includes('Highest score') || l.includes('Target Score') || l.includes('Scanned'));
    log('SCORE LINES:');
    scoreLines.forEach(l => log(l));

    log('===== DONE =====');

    try { edgeProc.kill('SIGTERM'); } catch (_) {}
    try { fs.rmSync(testProfileDir, { recursive: true, force: true }); } catch (_) {}
}

main().catch(err => {
    log(`FATAL: ${err.message}\n${err.stack}`);
    process.exit(1);
});
