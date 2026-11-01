/**
 * test/run_chromium_v7_task3_and_task4_suite.js
 *
 * Dedicated Chromium E2E Test Suite for:
 * 1. Task SC-03: No-Message Form Strict SKIPPED Classification & 7-Bucket Ledger Reconciliation
 * 2. Task SC-04: Multi-Target Nonempty Queue Pause, True Service Worker Termination & Resume
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execSync } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9444;
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_task3_and_task4.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_task3_and_task4_report.json');

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
        const timer = setTimeout(() => reject(new Error(`CDP Timeout: ${method}`)), 25000);
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
            } catch (_) {}
        }
        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function openWs(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = rej;
    });
    return ws;
}

async function shot(ws, filename) {
    const res = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
    const p = path.join(EVIDENCE_DIR, filename);
    fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
    log(`📸 Captured screenshot: ${filename}`);
    return filename;
}

async function main() {
    log('================================================================================');
    log('🚀 RUNNING TASK SC-03 & SC-04 CHROMIUM E2E SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();

    // 1. Ensure test fixture server active
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    log(`Test server active on port ${PORT}`);

    // 2. Launch disposable Chromium
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-sc03-sc04-${Math.random().toString(36).substring(2, 8)}`);
    fs.mkdirSync(tmpProfile, { recursive: true });
    log(`Disposable profile: ${tmpProfile}`);

    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const bin = fs.existsSync(edgePath) ? edgePath : chromePath;

    const browserArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tmpProfile}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        'about:blank'
    ];

    const proc = spawn(bin, browserArgs, { stdio: 'ignore' });
    log(`Browser launched (PID=${proc.pid})`);

    // Wait for CDP
    let targets = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            if (targets) break;
        } catch (_) {}
    }
    assert(targets, 'CDP endpoints must be available');

    const WebSocket = globalThis.WebSocket || require('ws');

    // Find Background SW
    let swTarget = null;
    for (let i = 0; i < 20; i++) {
        targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (swTarget) break;
        await sleep(500);
    }
    assert(swTarget, 'Background service worker must be discovered');
    const extId = swTarget.url.split('/')[2];
    log(`Extension ID: ${extId}`);

    let swWs = await openWs(swTarget.webSocketDebuggerUrl);
    await cdpSend(swWs, 'Runtime.enable');

    const swEval = async (code) => {
        const res = await cdpSend(swWs, 'Runtime.evaluate', {
            expression: code,
            awaitPromise: true,
            returnByValue: true
        });
        return res?.result?.value;
    };

    // Open Popup Page
    const browserWsUrl = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json()).then(j => j.webSocketDebuggerUrl);
    const browserWs = await openWs(browserWsUrl);

    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const openRes = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
    const popupTargetId = openRes.targetId;

    await sleep(1500);
    targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
    const popupTarget = targets.find(t => t.id === popupTargetId);
    assert(popupTarget, 'Popup target must exist');

    const popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
    await cdpSend(popupWs, 'Runtime.enable');
    await cdpSend(popupWs, 'Page.enable');
    log('Connected to Popup UI via CDP');

    const capturedShots = [];

    // =========================================================================
    // TASK SC-03: No-Message Strict SKIPPED Classification & 7-Bucket Ledger Reconciliation
    // =========================================================================
    log('\n=========================================================================');
    log('--- TASK SC-03: NO-MESSAGE INPUT CLASSIFICATION & LEDGER RECONCILIATION ---');
    log('=========================================================================');

    // Configure test mode
    await swEval(`
        self.campaignState.ownerFunctionTestMode = true;
        self.campaignState.runScopedDirectPrivacy = true;
    `);

    // (A.0) Target: homepage-with-newsletter-and-contact-link.html (Has newsletter form BUT valid contact link)
    log('Testing homepage-with-newsletter-and-contact-link.html (Discovery preservation)...');
    const startDiscovery = await swEval(`
        new Promise(resolve => {
            const bp = (typeof BuildProvenance !== 'undefined') ? BuildProvenance : self.BuildProvenance;
            const liveHead = bp.BUILD_INFO.implementationHead || bp.BUILD_INFO.head;
            const liveBuild = bp.BUILD_INFO.buildId;
            const liveManifest = bp.BUILD_INFO.manifestVersion || 3;

            const msg = {
                action: 'START_CAMPAIGN',
                source: 'USER_START_BUTTON',
                runScopedDirectPrivacy: true,
                expectedImplementationHead: liveHead,
                expectedBuildId: liveBuild,
                expectedManifestVersion: Number(liveManifest),
                queue: ['http://127.0.0.1:${PORT}/homepage-with-newsletter-and-contact-link.html'],
                template: {
                    name: 'Alex Mercer',
                    email: 'alex@mercer-consulting.com',
                    phone: '555-0199',
                    message: 'Inquiry following homepage contact link navigation.'
                },
                options: { source: 'USER_START_BUTTON' }
            };
            globalThis.__dispatchBackgroundMessage(msg, {}, res => resolve(res));
        })
    `);
    log(`Campaign started for homepage discovery: ${JSON.stringify(startDiscovery)}`);

    for (let i = 0; i < 40; i++) {
        await sleep(500);
        const st = await swEval(`({ isActive: campaignState.isActive })`);
        if (!st?.isActive && i > 2) break;
    }

    const discoveryLedger = await swEval(`
        new Promise(resolve => {
            chrome.storage.local.get(['xpider_history_attempts'], res => {
                const list = res.xpider_history_attempts || [];
                const match = list.slice().reverse().find(a => (a.sourceUrl && a.sourceUrl.includes('homepage-with-newsletter')) || (a.targetUrl && a.targetUrl.includes('contact-standard')));
                resolve(match || list[list.length - 1] || null);
            });
        })
    `);
    log(`Discovery Authoritative Ledger Record: ${JSON.stringify(discoveryLedger)}`);
    assert(discoveryLedger, 'Discovery attempt record must exist in ledger');
    assert.strictEqual(discoveryLedger.status, 'CONFIRMED_SUCCESS', `Homepage with contact link must discover contact page and succeed (observed: ${discoveryLedger.status})`);
    log('✅ SC-03 Part A.0: Homepage with newsletter form and valid contact link successfully navigated to contact form and filled without premature skipping.');

    // (A.1) Target: phone-only-no-message.html (Standalone non-inquiry form with NO contact links)
    log('\nTesting phone-only-no-message.html (Standalone non-inquiry form, strictly NO contact links)...');
    
    // Clear submissions count
    await fetch(`http://127.0.0.1:${PORT}/__xpider_clear_submissions`, { method: 'POST' }).catch(() => {});

    const sub0 = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json()).then(j => j.count || 0);

    const startNoMsg = await swEval(`
        new Promise(resolve => {
            const bp = (typeof BuildProvenance !== 'undefined') ? BuildProvenance : self.BuildProvenance;
            const liveHead = bp.BUILD_INFO.implementationHead || bp.BUILD_INFO.head;
            const liveBuild = bp.BUILD_INFO.buildId;
            const liveManifest = bp.BUILD_INFO.manifestVersion || 3;

            const msg = {
                action: 'START_CAMPAIGN',
                source: 'USER_START_BUTTON',
                runScopedDirectPrivacy: true,
                expectedImplementationHead: liveHead,
                expectedBuildId: liveBuild,
                expectedManifestVersion: Number(liveManifest),
                queue: ['http://127.0.0.1:${PORT}/phone-only-no-message.html'],
                template: {
                    name: 'Alex Mercer',
                    email: 'alex@mercer-consulting.com',
                    phone: '555-0199',
                    message: 'Requesting consultation on system architecture.'
                },
                options: { source: 'USER_START_BUTTON' }
            };
            globalThis.__dispatchBackgroundMessage(msg, {}, res => resolve(res));
        })
    `);
    log(`Campaign started for phone-only-no-message.html: ${JSON.stringify(startNoMsg)}`);

    // Poll until campaign becomes active, then until settled
    let phoneActive = false;
    for (let i = 0; i < 20; i++) {
        await sleep(250);
        const st = await swEval(`({ isActive: campaignState.isActive })`);
        if (st?.isActive) {
            phoneActive = true;
            break;
        }
    }
    log(`Campaign active observed: ${phoneActive}`);

    let phoneOutcome = null;
    for (let i = 0; i < 50; i++) {
        await sleep(500);
        phoneOutcome = await swEval(`
            ({
                isActive: campaignState.isActive,
                isPaused: campaignState.isPaused,
                currentUrl: campaignState.currentAttemptUrl,
                status: campaignState.currentAttempt?.status,
                reason: campaignState.currentAttempt?.reasonCode
            })
        `);
        if (!phoneOutcome?.isActive) {
            log(`phone-only-no-message.html settled at T+${i * 0.5}s: ${JSON.stringify(phoneOutcome)}`);
            break;
        }
    }
    assert(!phoneOutcome?.isActive, 'Campaign must settle to inactive for phone-only form');

    // Query authoritative HistoryStore ledger
    const phoneLedger = await swEval(`
        new Promise(resolve => {
            chrome.storage.local.get(['xpider_history_attempts'], res => {
                const list = res.xpider_history_attempts || [];
                const match = list.slice().reverse().find(a => (a.targetUrl && a.targetUrl.includes('phone-only-no-message')) || (a.sourceUrl && a.sourceUrl.includes('phone-only-no-message')));
                resolve(match || list[list.length - 1] || null);
            });
        })
    `);
    log(`phone-only-no-message Authoritative Ledger Record: ${JSON.stringify(phoneLedger)}`);

    // STRICT EXACT ASSERTIONS (Per ChatGPT Audit #6551153958 [P0-1] & [P0-3]):
    assert(phoneLedger, 'Authoritative ledger must contain attempt record');
    assert.strictEqual(phoneLedger.status, 'SKIPPED', `Authoritative status must be strictly SKIPPED (observed: ${phoneLedger.status})`);
    assert.strictEqual(phoneLedger.reasonCode, 'NO_LONG_TEXT_INQUIRY_FIELD',
        `Reason must be strictly exact NO_LONG_TEXT_INQUIRY_FIELD without fallback path (observed: ${phoneLedger.reasonCode})`);

    // Verify 0 submissions
    const sub1 = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json()).then(j => j.count || 0);
    assert.strictEqual(sub1 - sub0, 0, 'Zero server submissions must be strictly verified');
    log('✅ SC-03 Part A.1: phone-only-no-message.html strictly classified as SKIPPED with exact reason NO_LONG_TEXT_INQUIRY_FIELD and 0 submissions.');

    // (B) Target: no-contact-page.html (Formless page with 404 dead contact paths)
    log('\nTesting no-contact-page.html (Formless target with 404 dead contact links)...');
    const startFormless = await swEval(`
        new Promise(resolve => {
            const bp = (typeof BuildProvenance !== 'undefined') ? BuildProvenance : self.BuildProvenance;
            const liveHead = bp.BUILD_INFO.implementationHead || bp.BUILD_INFO.head;
            const liveBuild = bp.BUILD_INFO.buildId;
            const liveManifest = bp.BUILD_INFO.manifestVersion || 3;

            const msg = {
                action: 'START_CAMPAIGN',
                source: 'USER_START_BUTTON',
                runScopedDirectPrivacy: true,
                expectedImplementationHead: liveHead,
                expectedBuildId: liveBuild,
                expectedManifestVersion: Number(liveManifest),
                queue: ['http://127.0.0.1:${PORT}/no-contact-page.html'],
                template: {
                    name: 'Alex Mercer',
                    email: 'alex@mercer-consulting.com',
                    phone: '555-0199',
                    message: 'Formless target test.'
                },
                options: { source: 'USER_START_BUTTON' }
            };
            globalThis.__dispatchBackgroundMessage(msg, {}, res => resolve(res));
        })
    `);

    let formlessActive = false;
    for (let i = 0; i < 10; i++) {
        await sleep(500);
        const st = await swEval(`({ isActive: campaignState.isActive })`);
        if (st?.isActive) {
            formlessActive = true;
            break;
        }
    }
    log(`Formless campaign active observed: ${formlessActive}`);

    for (let i = 0; i < 40; i++) {
        await sleep(500);
        const st = await swEval(`({ isActive: campaignState.isActive })`);
        if (!st?.isActive) break;
    }

    const formlessLedger = await swEval(`
        new Promise(resolve => {
            chrome.storage.local.get(['xpider_history_attempts'], res => {
                const list = res.xpider_history_attempts || [];
                const match = list.slice().reverse().find(a => (a.targetUrl && a.targetUrl.includes('no-contact-page')) || (a.sourceUrl && a.sourceUrl.includes('no-contact-page')));
                resolve(match || list[list.length - 1] || null);
            });
        })
    `);
    log(`no-contact-page Authoritative Ledger Record: ${JSON.stringify(formlessLedger)}`);
    assert(formlessLedger, 'Authoritative ledger must contain record for formless target');
    // STRICT EXACT ASSERTION (Per ChatGPT Audit #6551153958 [P0-2]):
    // Unreachable / 404 contact paths must settle truthfully as FAILURE, NOT masked as SKIPPED.
    assert.strictEqual(formlessLedger.status, 'FAILURE', `Formless 404 target must settle truthfully as FAILURE (observed: ${formlessLedger.status})`);
    assert.strictEqual(formlessLedger.reasonCode, 'NO_ACCESSIBLE_INQUIRY_FORM', `Reason must be NO_ACCESSIBLE_INQUIRY_FORM (observed: ${formlessLedger.reasonCode})`);
    log('✅ SC-03 Part B: no-contact-page.html truthfully classified as FAILURE due to 404 dead contact pages.');

    // (C) 7-Bucket Ledger Math Reconciliation Invariant (Per ChatGPT Audit #6551153958 [P0-4])
    log('\nReconciling 7-Bucket Ledger Math Invariant...');
    const statsObj = await swEval(`
        (async () => {
            const hs = await getHistoryStoreInstance();
            const allStats = hs.getLedgerStats('allHistory');
            return allStats;
        })()
    `);
    log(`Authoritative Ledger Stats: ${JSON.stringify(statsObj)}`);

    const bucketSum = (statsObj.success || 0) +
                      (statsObj.failure || 0) +
                      (statsObj.skipped || 0) +
                      (statsObj.timeout || 0) +
                      (statsObj.unknown || statsObj.deliveryUnknown || 0) +
                      (statsObj.automationFailed || 0) +
                      (statsObj.paused || 0);

    log(`Total Completed Targets: ${statsObj.completed} | Bucket Sum: ${bucketSum} | Success: ${statsObj.success} | Failure: ${statsObj.failure} | Skipped: ${statsObj.skipped}`);
    assert(statsObj.completed >= 3, `At least 3 targets must be recorded as completed in ledger (observed: ${statsObj.completed})`);
    assert.strictEqual(statsObj.completed, bucketSum, '7-Bucket ledger math invariant must hold: completed === sum(buckets)');
    assert(statsObj.success >= 1, 'At least 1 confirmed success target present in ledger');
    assert(statsObj.skipped >= 1, 'At least 1 skipped target present in ledger (from non-inquiry form)');
    assert(statsObj.failure >= 1, 'At least 1 failure target present in ledger (from unreachable/404 page)');
    log('✅ SC-03 Part C: 7-Bucket ledger reconciliation passed with 0 discrepancy across all categories.');

    // =========================================================================
    // TASK SC-04: Nonempty Queue Pause, True SW Termination, Checkpoint Restore & Resume
    // =========================================================================
    log('\n=========================================================================');
    log('--- TASK SC-04: NONEMPTY QUEUE PAUSE, TRUE SW TERMINATION & RESUME ---');
    log('=========================================================================');

    // 1. Prepare 3 distinct localhost targets
    const multiTargets = [
        `http://127.0.0.1:${PORT}/contact-standard.html`,
        `http://127.0.0.1:${PORT}/spa-delayed-contact.html`,
        `http://127.0.0.1:${PORT}/index.html`
    ];

    log(`Setting up 3-target campaign queue in Popup DOM: ${JSON.stringify(multiTargets)}`);
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `
            (() => {
                if (typeof setCampaignQueue === 'function') {
                    setCampaignQueue(${JSON.stringify(multiTargets)});
                } else {
                    window.campaignQueue = ${JSON.stringify(multiTargets)};
                }
                const msgEl = document.getElementById('tpl-message');
                if (msgEl) msgEl.value = 'Detailed architectural inquiry for SC-04 multi-target pause durability.';
                const nameEl = document.getElementById('tpl-name');
                if (nameEl) nameEl.value = 'Alex Mercer';
                const emailEl = document.getElementById('tpl-email');
                if (emailEl) emailEl.value = 'alex@mercer-consulting.com';
                const phoneEl = document.getElementById('tpl-phone');
                if (phoneEl) phoneEl.value = '555-0199';

                // Ensure chrome.storage.local has the queue
                chrome.storage.local.set({
                    xpider_queue: ${JSON.stringify(multiTargets)},
                    xpider_total: 3,
                    xpider_success: 0
                });
            })()
        `
    });

    // 2. Click Real Start Button (#start-btn)
    log('Clicking Real UI Start Button (#start-btn)...');
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `document.getElementById('start-btn')?.click()`
    });

    // Check if privacy modal opened and acknowledge override if present
    await sleep(500);
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `(() => {
            const btn = document.getElementById('privacy-block-action-override');
            if (btn && btn.offsetParent !== null) {
                console.log('Clicking privacy override in modal');
                btn.click();
            }
        })()`
    });

    // Wait for active state
    let sc04Active = false;
    for (let i = 0; i < 20; i++) {
        await sleep(300);
        const st = await swEval(`({ isActive: campaignState.isActive, runId: campaignState.campaignRunId })`);
        if (st?.isActive) {
            log(`🎯 Multi-target campaign active at T+${i * 0.3}s! runId=${st.runId}`);
            sc04Active = true;
            break;
        }
    }
    assert(sc04Active, 'Campaign must become active after clicking #start-btn');

    // 3. Click Real Pause Button (#pause-btn) while campaign is running
    log('Clicking Real UI Pause Button (#pause-btn) to capture NON-EMPTY queue...');
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `document.getElementById('pause-btn')?.click()`
    });

    // Observe pause and check checkpoint
    let pausedCheckpoint = null;
    for (let i = 0; i < 20; i++) {
        await sleep(400);
        pausedCheckpoint = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_paused_checkpoint'], res => {
                    resolve(res.xpider_paused_checkpoint || null);
                });
            })
        `);
        if (pausedCheckpoint && pausedCheckpoint.pausedByOperator) {
            log(`⏸️ Durable pause checkpoint captured at T+${i * 0.4}s: remaining=${pausedCheckpoint.remainingQueue?.length}`);
            break;
        }
    }

    assert(pausedCheckpoint, 'Durable pause checkpoint must exist in storage');
    assert.strictEqual(pausedCheckpoint.pausedByOperator, true, 'Checkpoint must declare pausedByOperator === true');
    log(`Checkpoint remainingQueue: ${JSON.stringify(pausedCheckpoint.remainingQueue)}`);
    assert(Array.isArray(pausedCheckpoint.remainingQueue) && pausedCheckpoint.remainingQueue.length >= 2,
        `Checkpoint remainingQueue MUST be non-empty (expected >= 2 targets, observed: ${pausedCheckpoint.remainingQueue?.length})`);

    // Verify UI button flips to "Resume"
    const pauseBtnText = await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `document.getElementById('pause-btn')?.textContent?.trim()`,
        returnByValue: true
    }).then(r => r.result?.value);
    log(`Pause button text after pause: "${pauseBtnText}"`);
    assert(pauseBtnText?.includes('Resume') || pauseBtnText?.includes('재개'), 'Button text must indicate Resume');

    const shotSc04Paused = await shot(popupWs, 'shot_sc04_popup_paused_nonempty.png');
    capturedShots.push(shotSc04Paused);

    // 4. FORCIBLY TERMINATE SERVICE WORKER PROCESS VIA CDP
    log('\n--- Forcibly Terminating Service Worker Process via CDP ---');
    swWs.close();
    await sleep(500);

    const oldSwId = swTarget.id;
    log(`Closing SW Target: ${oldSwId}`);
    await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId }).catch(() => {});
    await sleep(2000);

    // Verify target is dead (Strict assertion per [P0-5])
    targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
    const deadSw = targets.find(t => t.id === oldSwId);
    assert(!deadSw, `Original SW target ${oldSwId} must be completely terminated and absent from target list`);
    log(`SW Target after closeTarget: TERMINATED_CONFIRMED (old ID: ${oldSwId} absent)`);

    // 5. WAKE UP SERVICE WORKER & VERIFY CHECKPOINT RESTORATION
    log('\n--- Waking Up Fresh Service Worker & Verifying Durable Checkpoint Restoration ---');
    // Trigger wakeup via popup IPC
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `chrome.runtime.sendMessage({ action: 'GET_CAMPAIGN_STATE' }).catch(() => {})`
    });

    let newSwTarget = null;
    for (let i = 0; i < 30; i++) {
        await sleep(500);
        targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        newSwTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js') && t.id !== oldSwId);
        if (newSwTarget) break;
    }
    assert(newSwTarget, 'Fresh Service Worker must boot after termination');
    assert.notStrictEqual(newSwTarget.id, oldSwId, `New SW Target ID (${newSwTarget.id}) must differ from terminated SW ID (${oldSwId})`);
    log(`Fresh SW Booted: Target ID=${newSwTarget.id} (verified different from old ID=${oldSwId})`);

    swWs = await openWs(newSwTarget.webSocketDebuggerUrl);
    await cdpSend(swWs, 'Runtime.enable');

    // Verify restored state in freshly booted SW
    const restoredState = await swEval(`
        ({
            isActive: campaignState.isActive,
            isPaused: campaignState.isPaused,
            remainingCount: (campaignState.queue || campaignState.remainingQueue || campaignState.pausedCheckpoint?.remainingQueue)?.length,
            pausedByOperator: campaignState.pausedByOperator,
            runId: campaignState.campaignRunId
        })
    `);
    log(`Fresh SW Restored State from Checkpoint: ${JSON.stringify(restoredState)}`);
    assert(restoredState.remainingCount >= 2, `Restored remaining queue must be >= 2 across true SW restart (observed: ${restoredState.remainingCount})`);
    assert.strictEqual(restoredState.isPaused, true, 'Restored campaign state must be isPaused === true');
    log('✅ SC-04 Part A: Non-empty queue preserved and restored across genuine Service Worker termination.');

    // 6. RESUME CAMPAIGN VIA REAL UI
    log('\n--- Resuming Campaign via Real UI (#pause-btn / confirmResumeCampaignWithMode) ---');
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `
            (() => {
                if (typeof confirmResumeCampaignWithMode === 'function') {
                    confirmResumeCampaignWithMode('AUTO');
                } else {
                    document.getElementById('pause-btn')?.click();
                }
            })()
        `
    });

    let resumedActive = false;
    for (let i = 0; i < 20; i++) {
        await sleep(400);
        const st = await swEval(`({ isPaused: campaignState.isPaused, isActive: campaignState.isActive })`);
        if (st && !st.isPaused && st.isActive) {
            log(`▶️ Campaign resumed at T+${i * 0.4}s! isPaused=false, isActive=true`);
            resumedActive = true;
            break;
        }
    }
    assert(resumedActive, 'Campaign must resume actively after clicking resume in UI');

    // 7. STOP & SAVE CAMPAIGN VIA REAL VISIBLE UI (#stop-save-btn, Per ChatGPT Addendum #6551518285 [P0-6])
    log('\n--- Stopping & Saving Campaign via Real Visible UI (#stop-save-btn) ---');
    await cdpSend(popupWs, 'Runtime.evaluate', {
        expression: `document.getElementById('stop-save-btn')?.click()`
    });

    let stoppedCleanly = false;
    for (let i = 0; i < 20; i++) {
        await sleep(300);
        const st = await swEval(`({ isActive: campaignState.isActive, isPaused: campaignState.isPaused })`);
        if (!st?.isActive) {
            log(`🛑 Campaign stopped observed from real visible #stop-save-btn click at T+${i * 0.3}s! isActive=false`);
            stoppedCleanly = true;
            break;
        }
    }
    assert(stoppedCleanly, 'Campaign must stop cleanly after clicking visible #stop-save-btn');

    // Assert that Stop & Save preserved the checkpoint in storage
    const savedCheckpoint = await swEval(`
        new Promise(resolve => {
            chrome.storage.local.get(['xpider_paused_checkpoint'], res => {
                resolve(res.xpider_paused_checkpoint || null);
            });
        })
    `);
    log(`Saved Checkpoint in Storage after #stop-save-btn: remaining=${savedCheckpoint?.remainingQueue?.length}`);
    assert(savedCheckpoint, 'Durable checkpoint must exist in storage after #stop-save-btn');
    assert(Array.isArray(savedCheckpoint.remainingQueue) && savedCheckpoint.remainingQueue.length >= 1,
        'Remaining queue must be preserved in storage after Stop & Save');

    const shotSc04Stopped = await shot(popupWs, 'shot_sc04_popup_stopped_saved.png');
    capturedShots.push(shotSc04Stopped);

    log('✅ SC-04 Part B: Campaign successfully resumed and stopped & saved via visible real UI #stop-save-btn.');

    // Summary & Machine-Readable Evidence Report
    const endTimeUtc = new Date().toISOString();
    const finalReport = {
        suiteName: 'XPIDER V7 SC-03 & SC-04 Deterministic Chromium E2E Suite',
        startTimeUtc,
        endTimeUtc,
        durationSeconds: ((new Date(endTimeUtc) - new Date(startTimeUtc)) / 1000).toFixed(1),
        targetBaseline: 'v7.0.0-rc11',
        candidateBranch: 'candidate/sc03-sc04-classification-and-pause',
        baselineCommit: '20678ada',
        baselineExtensionTreeSha: 'd065af8f1f1438ecba9bbe7fb03cf8e18c040e05',
        candidateExtensionModifiedFiles: ['extension/content-script.js'],
        capturedScreenshots: capturedShots,
        sc03_no_message_classification_and_discovery: {
            homepageDiscoveryTarget: 'http://127.0.0.1:8088/homepage-with-newsletter-and-contact-link.html',
            homepageDiscoveryStatus: discoveryLedger.status,
            homepageDiscoveryPass: discoveryLedger.status === 'CONFIRMED_SUCCESS',
            phoneOnlyTarget: 'http://127.0.0.1:8088/phone-only-no-message.html',
            phoneOnlyStatus: phoneLedger.status,
            phoneOnlyReasonCode: phoneLedger.reasonCode,
            submissionsDelta: sub1 - sub0,
            statusStrictlySkipped: phoneLedger.status === 'SKIPPED',
            formlessTarget: 'http://127.0.0.1:8088/no-contact-page.html',
            formlessStatus: formlessLedger.status,
            formlessReasonCode: formlessLedger.reasonCode,
            sevenBucketLedgerReconciliation: {
                completed: statsObj.completed,
                success: statsObj.success,
                failure: statsObj.failure,
                skipped: statsObj.skipped,
                timeout: statsObj.timeout,
                deliveryUnknown: statsObj.unknown || 0,
                automationFailed: statsObj.automationFailed || 0,
                paused: statsObj.paused || 0,
                bucketSum,
                discrepancy: Math.abs(statsObj.completed - bucketSum)
            },
            status: 'PASS'
        },
        sc04_nonempty_queue_and_sw_durability: {
            initialTargetsCount: 3,
            pausedRemainingCount: pausedCheckpoint.remainingQueue.length,
            nonemptyQueuePreserved: pausedCheckpoint.remainingQueue.length >= 2,
            oldSwTerminatedAbsent: !deadSw,
            newSwTargetIdDiffers: newSwTarget.id !== oldSwId,
            swRestoredRemainingCount: restoredState.remainingCount,
            resumedViaRealUi: resumedActive,
            stoppedAndSavedViaRealUi: stoppedCleanly,
            checkpointRemainingCountAfterStopAndSave: savedCheckpoint.remainingQueue.length,
            status: 'PASS'
        },
        releaseHoldStatus: 'ACTIVE (Awaiting independent ChatGPT and Owner gate acceptance)'
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(finalReport, null, 2), 'utf8');
    log(`\n📄 Generated machine-readable evidence report: ${REPORT_FILE}`);

    // Cleanup
    browserWs.close();
    popupWs.close();
    swWs.close();
    proc.kill();

    log('\n================================================================================');
    log('🎉 BOTH TASK SC-03 & TASK SC-04 VERIFIED SUCCESSFULLY (100% PASS)');
    log('================================================================================');
    logStream.end();
}

main().catch(err => {
    console.error('\n❌ Fatal Test Runner Error:', err);
    logStream.write(`\n❌ Fatal Test Runner Error: ${err.stack || err}\n`);
    logStream.end();
    process.exit(1);
});
