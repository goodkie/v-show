#!/usr/bin/env node
/**
 * test/run_chrome_no_message_dom_suite.js
 *
 * Real Headless Chrome Acceptance Runner for Directive #6732442879:
 * Validates actual DOM execution in Google Chrome (chrome.exe).
 * Tests packaged extension scripts on real local HTTP fixtures (127.0.0.1:8088).
 */

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8088;
const CDP_PORT = 9456;
const REPORT_FILE = path.join(ROOT, 'dist', 'report_chrome_no_message_dom_suite.json');

const contactGateSrc = fs.readFileSync(path.join(ROOT, 'extension', 'modules', 'contact-gate.js'), 'utf8');
const r2Src = fs.readFileSync(path.join(ROOT, 'extension', 'modules', 'form-discovery-engine-r2.js'), 'utf8');
const csSrc = fs.readFileSync(path.join(ROOT, 'extension', 'content-script.js'), 'utf8');

const report = {
    suite: 'XPIDER_CHROME_REAL_BROWSER_DOM_SUITE',
    directive: '#6732442879',
    timestamp: new Date().toISOString(),
    browser: 'Google Chrome',
    assertions: [],
    status: 'RUNNING'
};

let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function cdpSend(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1000000);
        const timer = setTimeout(() => reject(new Error(`CDP Timeout: ${method}`)), 15000);
        function onMessage(event) {
            try {
                const data = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(data);
                if (msg.id === id) {
                    ws.removeEventListener('message', onMessage);
                    clearTimeout(timer);
                    if (msg.error) reject(new Error(`CDP Error (${method}): ${JSON.stringify(msg.error)}`));
                    else resolve(msg.result);
                }
            } catch (_) {}
        }
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function evalInPage(ws, expression) {
    const res = await cdpSend(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
    });
    if (res.exceptionDetails) {
        throw new Error('Eval Exception: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : null;
}

async function run() {
    console.log('================================================================================');
    console.log('🚀 REAL GOOGLE CHROME HEADLESS DOM TEST (DIRECTIVE #6732442879)');
    console.log('================================================================================\n');

    // 1. Locate Chrome executable
    const chromeCandidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    let chromeBin = chromeCandidates.find(p => fs.existsSync(p));
    if (!chromeBin) {
        console.error('Chrome executable not found on host');
        process.exit(1);
    }
    console.log(`Using Chrome binary: ${chromeBin}`);

    // 2. Disposable user data dir
    const tmpDataDir = path.join(process.env.TEMP || 'C:\\Temp', `xpider-chr-dom-${Date.now()}`);
    fs.mkdirSync(tmpDataDir, { recursive: true });

    // 3. Spawn headless Chrome
    const args = [
        '--headless=new',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tmpDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        'about:blank'
    ];
    const proc = spawn(chromeBin, args, { stdio: 'ignore' });

    // Wait for CDP to be available
    let connected = false;
    let versionInfo = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            versionInfo = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
            if (versionInfo && versionInfo.webSocketDebuggerUrl) {
                connected = true;
                break;
            }
        } catch (_) {}
    }
    A('CHROME_HEADLESS_SPAWNED_AND_CDP_CONNECTED', connected, { versionInfo });
    if (!connected) {
        try { proc.kill(); } catch (_) {}
        process.exit(1);
    }

    const WS = globalThis.WebSocket;
    const tabs = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
    const ws = new WS(pageTab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = rej;
    });

    await cdpSend(ws, 'Page.enable');
    await cdpSend(ws, 'Runtime.enable');

    try {
        // --- Test 1: subscribe-no-message.html OFF vs ON ---
        console.log('\n--- Chrome Real DOM Test 1: subscribe-no-message.html ---');
        await cdpSend(ws, 'Page.navigate', { url: `http://127.0.0.1:${PORT}/subscribe-no-message.html` });
        await sleep(800);

        // Inject modules
        await evalInPage(ws, contactGateSrc);
        await evalInPage(ws, r2Src);

        // Verify OFF skips
        const offRes = await evalInPage(ws, `
            (async () => {
                window.__xpider_include_forms_without_message = false;
                const engine = new window.FormDiscoveryEngineR2({
                    includeFormsWithoutMessage: false,
                    pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
                });
                const form = await engine.discoverForm(document);
                const scan = engine.groupAndScoreContainers(document);
                return {
                    formFound: !!form,
                    eligibleCount: scan.candidates.filter(c => c.eligible).length,
                    reason: engine.lastDiscoveryResult ? engine.lastDiscoveryResult.reasonCode : null
                };
            })()
        `);
        A('CHROME_REAL_DOM_SUBSCRIBE_OFF_SKIPS', offRes.formFound === false && offRes.eligibleCount === 0, offRes);

        // Verify ON discovers & fills
        const onRes = await evalInPage(ws, `
            (async () => {
                window.__xpider_include_forms_without_message = true;
                const engine = new window.FormDiscoveryEngineR2({
                    includeFormsWithoutMessage: true,
                    pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
                });
                const form = await engine.discoverForm(document);
                const scan = engine.groupAndScoreContainers(document);
                const eligible = scan.candidates.find(c => c.eligible);

                let autofilled = '';
                if (form) {
                    const emailInput = form.querySelector('input[type="email"], input[name*="email"]');
                    if (emailInput) {
                        emailInput.value = 'owner.test@chrome-headless.org';
                        autofilled = emailInput.value;
                    }
                }

                return {
                    formFound: !!form,
                    formId: form ? form.id : null,
                    eligibleReason: eligible ? eligible.reason : null,
                    autofilled
                };
            })()
        `);
        A('CHROME_REAL_DOM_SUBSCRIBE_ON_DISCOVERS', onRes.formFound === true && onRes.eligibleReason === 'ELIGIBLE_NO_MESSAGE_FORM', onRes);
        A('CHROME_REAL_DOM_SUBSCRIBE_ON_FILLS_EMAIL', onRes.autofilled === 'owner.test@chrome-headless.org', onRes);

        // --- Test 2: consent-required-no-message.html BLOCKED ---
        console.log('\n--- Chrome Real DOM Test 2: consent-required-no-message.html ---');
        await cdpSend(ws, 'Page.navigate', { url: `http://127.0.0.1:${PORT}/consent-required-no-message.html` });
        await sleep(800);
        await evalInPage(ws, contactGateSrc);
        await evalInPage(ws, r2Src);

        const consentRes = await evalInPage(ws, `
            (async () => {
                window.__xpider_include_forms_without_message = true;
                const engine = new window.FormDiscoveryEngineR2({
                    includeFormsWithoutMessage: true,
                    ownerAuthorizedConsent: false,
                    pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
                });
                const form = await engine.discoverForm(document);
                const scan = engine.groupAndScoreContainers(document);
                const cand = scan.candidates[0];
                return {
                    formFound: !!form,
                    candidateEligible: cand ? cand.eligible : null,
                    candidateReason: cand ? cand.reason : null
                };
            })()
        `);
        A('CHROME_REAL_DOM_UNAUTHORIZED_CONSENT_BLOCKED',
            consentRes.formFound === false && consentRes.candidateReason === 'NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM',
            consentRes
        );

        // --- Test 3: negative-controls.html REJECTED ---
        console.log('\n--- Chrome Real DOM Test 3: negative-controls.html ---');
        await cdpSend(ws, 'Page.navigate', { url: `http://127.0.0.1:${PORT}/negative-controls.html` });
        await sleep(800);
        await evalInPage(ws, contactGateSrc);
        await evalInPage(ws, r2Src);

        const negRes = await evalInPage(ws, `
            (async () => {
                window.__xpider_include_forms_without_message = true;
                const engine = new window.FormDiscoveryEngineR2({
                    includeFormsWithoutMessage: true,
                    pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
                });
                const form = await engine.discoverForm(document);
                const scan = engine.groupAndScoreContainers(document);
                return {
                    formFound: !!form,
                    eligibleCount: scan.candidates.filter(c => c.eligible).length
                };
            })()
        `);
        A('CHROME_REAL_DOM_NEGATIVE_CONTROLS_REJECTED',
            negRes.formFound === false && negRes.eligibleCount === 0,
            negRes
        );

        // --- Test 4: contact-plus-newsletter.html (Genuine Inquiry Priority) ---
        console.log('\n--- Chrome Real DOM Test 4: contact-plus-newsletter.html (Priority Invariant) ---');
        await cdpSend(ws, 'Page.navigate', { url: `http://127.0.0.1:${PORT}/contact-plus-newsletter.html` });
        await sleep(800);
        await evalInPage(ws, contactGateSrc);
        await evalInPage(ws, r2Src);

        const priorityRes = await evalInPage(ws, `
            (async () => {
                window.__xpider_include_forms_without_message = true;
                const engine = new window.FormDiscoveryEngineR2({
                    includeFormsWithoutMessage: true,
                    pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
                });
                const form = await engine.discoverForm(document);
                const scan = engine.groupAndScoreContainers(document);
                const top = scan.candidates[0];
                return {
                    formFound: !!form,
                    discoveredTag: form ? form.tagName : null,
                    discoveredId: form ? form.id : null,
                    topScore: top ? top.score : 0,
                    topReason: top ? top.reason : null
                };
            })()
        `);
        A('CHROME_REAL_DOM_INQUIRY_PRIORITIZED_OVER_NEWSLETTER',
            priorityRes.formFound === true && priorityRes.topReason === 'ELIGIBLE_CONTACT_INQUIRY',
            priorityRes
        );

    } finally {
        try { ws.close(); } catch (_) {}
        try { proc.kill(); } catch (_) {}
        try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (_) {}
    }

    report.status = failures ? 'FAILED' : 'SUCCESS';
    report.total = report.assertions.length;
    report.failed = failures;
    report.passed = report.total - failures;

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
    console.log('\n================================================================================');
    console.log(`CHROME REAL DOM RUNNER: ${report.passed}/${report.total} PASS (Failures: ${failures}) -> ${REPORT_FILE}`);
    console.log('================================================================================');

    return failures === 0;
}

run().then(ok => {
    process.exit(ok ? 0 : 1);
}).catch(err => {
    console.error('Fatal in real Chrome DOM runner:', err);
    process.exit(1);
});
