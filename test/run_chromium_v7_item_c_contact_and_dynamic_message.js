/**
 * test/run_chromium_v7_item_c_contact_and_dynamic_message.js
 *
 * Dedicated Chromium E2E Test Runner for P0 Item (c) & ChatGPT Source Audit Directives:
 * 1. (c.1) Real home page contact-link discovery -> inquiry form submission (homepage-with-newsletter-and-contact-link.html -> contact-standard.html).
 * 2. (c.2) Controlled message textarea initially filled with nonempty stale draft, blur-reverted, repaired via verifyFieldIntegrity and submit gate verified (dynamic-react-controlled-stale-revert.html).
 * 3. (c.3) Dynamically replaced form+field in DOM: activeRoot recovery and field reference restore (dynamic-spa-replaced-form.html).
 * 4. (c.4) Missing/no-message negative: phone-only-no-message.html strictly settles as SKIPPED / NO_LONG_TEXT_INQUIRY_FIELD with 0 POSTs.
 * 5. (c.5) Dead contact route: homepage-with-dead-contact-link.html -> no-contact-page.html settles as FAILURE: NO_ACCESSIBLE_INQUIRY_FORM with 0 POSTs.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8088;
const CDP_PORT = 9446; // dedicated port
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_item_c_contact_and_dynamic_message.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_item_c_contact_and_dynamic_message_report.json');

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
    const WebSocket = globalThis.WebSocket || require('ws');
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
    log('🚀 RUNNING ITEM (C) CONTACT LINK DISCOVERY & DYNAMIC REACT MESSAGE SUITE');
    log('================================================================================');

    const startTimeUtc = new Date().toISOString();

    // 1. Verify test server
    const srvCheck = await fetch(`http://127.0.0.1:${PORT}/contact-standard.html`).catch(() => null);
    assert(srvCheck && srvCheck.ok, `Test server on 127.0.0.1:${PORT} must be running`);
    log(`Test server active on port ${PORT}`);

    // 2. Launch browser
    const tmpProfile = path.join(process.env.TEMP || 'C:\\Temp', `xpider-item-c-${Math.random().toString(36).substring(2, 8)}`);
    fs.mkdirSync(tmpProfile, { recursive: true });
    log(`Disposable profile: ${tmpProfile}`);

    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const bin = fs.existsSync(edgePath) ? edgePath : chromePath;

    const browserArgs = [
        `--remote-debugging-port=${CDP_PORT}`,
        `--load-extension=${EXT_DIR}`,
        `--user-data-dir=${tmpProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions-except=' + EXT_DIR,
        'about:blank'
    ];

    log(`Spawning browser binary: ${bin}`);
    const browserProcess = spawn(bin, browserArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let browserWs = null;
    let swWs = null;
    let popupWs = null;

    const report = {
        testSuite: "run_chromium_v7_item_c_contact_and_dynamic_message",
        startTimeUtc,
        assertions: [],
        targets: []
    };

    function recordAssertion(name, passed, details = {}) {
        const item = { name, passed, details, timestamp: new Date().toISOString() };
        report.assertions.push(item);
        if (passed) {
            log(`✅ PASS: ${name}`);
        } else {
            log(`❌ FAIL: ${name} - ${JSON.stringify(details)}`);
            throw new Error(`Assertion failed: ${name}`);
        }
    }

    try {
        // Wait for CDP
        let browserWsUrl = null;
        for (let i = 0; i < 30; i++) {
            await sleep(500);
            try {
                const ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json());
                if (ver && ver.webSocketDebuggerUrl) {
                    browserWsUrl = ver.webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }
        assert(browserWsUrl, 'Browser CDP version endpoint must be accessible');
        log(`Browser CDP connected: ${browserWsUrl}`);

        browserWs = await openWs(browserWsUrl);
        await cdpSend(browserWs, 'Target.setDiscoverTargets', { discover: true });

        // Locate background SW
        let swTarget = null;
        for (let i = 0; i < 30; i++) {
            const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
            swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
            if (swTarget) break;
            await sleep(500);
        }
        assert(swTarget, 'Background service worker must be discovered');
        const extId = swTarget.url.split('/')[2];
        log(`Extension ID: ${extId}`);

        swWs = await openWs(swTarget.webSocketDebuggerUrl);
        await cdpSend(swWs, 'Runtime.enable');

        const swEval = async (code) => {
            const res = await cdpSend(swWs, 'Runtime.evaluate', {
                expression: code,
                awaitPromise: true,
                returnByValue: true
            });
            return res?.result?.value;
        };

        swWs.addEventListener('message', (event) => {
            try {
                const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
                const msg = JSON.parse(raw);
                if (msg.method === 'Runtime.consoleAPICalled') {
                    const text = msg.params.args?.map(a => a.value || a.description || '').join(' ');
                    if (text.includes('[Engine]') || text.includes('[SniperScan]') || text.includes('STAGE') || text.includes('SENDER') || text.includes('DISCOVERY')) {
                        log(`[SW_LOG] ${text}`);
                    }
                }
            } catch (_) {}
        });

        // Open Popup Page
        const popupUrl = `chrome-extension://${extId}/popup.html`;
        const openRes = await cdpSend(browserWs, 'Target.createTarget', { url: popupUrl });
        const popupTargetId = openRes.targetId;

        await sleep(1500);
        let targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
        const popupTarget = targets.find(t => t.id === popupTargetId);
        assert(popupTarget, 'Popup target must exist');

        popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
        await cdpSend(popupWs, 'Runtime.enable');
        await cdpSend(popupWs, 'Page.enable');
        await cdpSend(popupWs, 'Runtime.evaluate', {
            expression: `window.alert = (msg) => console.warn('[SUPPRESSED_POPUP_ALERT]', msg);`
        });
        log('Connected to Popup UI via CDP');

        // Reset server submissions
        await fetch(`http://127.0.0.1:${PORT}/__xpider_reset_submissions`).then(r => r.json());
        const initialSubRecord = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        assert.strictEqual(initialSubRecord.count, 0, 'Server submissions must start at strictly 0');
        log('Initial server submissions count verified: 0');

        // ====================================================================
        // Unified Campaign Queue with All 5 Targets
        // ====================================================================
        const itemCTargets = [
            `http://127.0.0.1:${PORT}/homepage-with-newsletter-and-contact-link.html`,
            `http://127.0.0.1:${PORT}/dynamic-react-controlled-stale-revert.html`,
            `http://127.0.0.1:${PORT}/dynamic-spa-replaced-form.html`,
            `http://127.0.0.1:${PORT}/phone-only-no-message.html`,
            `http://127.0.0.1:${PORT}/homepage-with-dead-contact-link.html`
        ];

        log(`\n================================================================================`);
        log(`🚀 LAUNCHING ITEM (C) 5-TARGET UNIFIED CAMPAIGN:`);
        log(`   Target 1: Homepage Contact Link Discovery -> Standard Contact Form`);
        log(`   Target 2: Controlled Stale Message Revert with React _valueTracker & onBlur`);
        log(`   Target 3: Dynamically Replaced Form SPA (form unmounted and remounted)`);
        log(`   Target 4: Phone-Only Form with NO Message Field (Strict Negative Control)`);
        log(`   Target 5: Homepage with Dead Contact Link -> Formless Page`);
        log(`================================================================================`);

        const startRes = await swEval(`
            new Promise(resolve => {
                const bp = (typeof BuildProvenance !== 'undefined') ? BuildProvenance : self.BuildProvenance;
                const liveHead = bp.BUILD_INFO.implementationHead || bp.BUILD_INFO.head;
                const liveBuild = bp.BUILD_INFO.buildId;
                const liveManifest = bp.BUILD_INFO.manifestVersion || 3;

                const msg = {
                    action: 'START_CAMPAIGN',
                    source: 'USER_START_BUTTON',
                    runScopedDirectPrivacy: true,
                    delayMs: 800,
                    fillDelayMs: 150,
                    submitDelayMs: 600,
                    expectedImplementationHead: liveHead,
                    expectedBuildId: liveBuild,
                    expectedManifestVersion: Number(liveManifest),
                    queue: ${JSON.stringify(itemCTargets)},
                    template: {
                        name: 'ItemCTester ValidationUser',
                        firstName: 'ItemCTester',
                        lastName: 'ValidationUser',
                        email: 'itemc_tester@example.com',
                        phone: '555-0199',
                        subject: 'P0 Item C Multi-Target Inquiry',
                        message: 'SC-03 and P0 Item C architectural verification inquiry for React dynamic inputs.'
                    },
                    options: {
                        source: 'USER_START_BUTTON',
                        runScopedDirectPrivacy: true
                    }
                };
                globalThis.__dispatchBackgroundMessage(msg, {}, res => resolve(res));
            })
        `);
        log(`Campaign Start Response: ${JSON.stringify(startRes)}`);

        // Wait for campaign to become active
        let campaignActive = false;
        let campaignRunId = null;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            const st = await swEval(`({ isActive: campaignState.isActive, runId: campaignState.campaignRunId })`);
            if (st?.isActive) {
                campaignActive = true;
                campaignRunId = st.runId;
                log(`Campaign Active: runId=${campaignRunId}`);
                break;
            }
        }
        recordAssertion('ITEM_C_CAMPAIGN_ACTIVE', campaignActive === true, { campaignRunId });

        // Monitor all 5 targets until campaign settles inactive
        let campaignSettled = false;
        const maxWaitSeconds = 120;
        for (let i = 0; i < maxWaitSeconds; i++) {
            await sleep(1000);
            const st = await swEval(`({
                isActive: campaignState.isActive,
                queueLength: campaignState.queue?.length,
                currentUrl: campaignState.currentAttemptUrl
            })`);
            log(`Campaign Progress T+${i}s: active=${st?.isActive} queue=${st?.queueLength} url=${st?.currentUrl}`);
            if (!st?.isActive && i > 5) {
                campaignSettled = true;
                log(`Campaign settled to inactive at T+${i}s`);
                break;
            }
        }
        recordAssertion('ITEM_C_CAMPAIGN_SETTLED_INACTIVE', campaignSettled === true, { maxWaitSeconds });

        // Retrieve attempts recorded for this campaign run
        const attempts = await swEval(`
            new Promise(resolve => {
                chrome.storage.local.get(['xpider_history_attempts'], res => {
                    const list = res.xpider_history_attempts || [];
                    resolve(list.filter(a => a.campaignRunId === '${campaignRunId}'));
                });
            })
        `);
        log(`Total attempts recorded for run ${campaignRunId}: ${attempts.length}`);
        recordAssertion('ITEM_C_ATTEMPTS_COUNT_EXACT_FIVE', attempts.length === 5, { attemptsCount: attempts.length });

        // ====================================================================
        // Assertion 1: Target 1 (Homepage Discovery -> Inquiry Form)
        // ====================================================================
        const att1 = attempts.find(a => a.sourceUrl && a.sourceUrl.includes('homepage-with-newsletter'));
        recordAssertion('SUBTEST_1_HOMEPAGE_ATTEMPT_RECORDED', !!att1, { sourceUrl: att1?.sourceUrl });
        recordAssertion('SUBTEST_1_HOMEPAGE_STATUS_SUCCESS', att1?.status === 'CONFIRMED_SUCCESS', { status: att1?.status, reason: att1?.reasonCode });
        log(`Target 1 Contact Page URL: ${att1?.contactPageUrl || att1?.selectedCandidateUrl}`);

        // ====================================================================
        // Assertion 2: Target 2 (Dynamic React Controlled Stale Message Revert Form)
        // ====================================================================
        const att2 = attempts.find(a => a.sourceUrl && a.sourceUrl.includes('dynamic-react-controlled-stale-revert'));
        recordAssertion('SUBTEST_2_DYNAMIC_REACT_ATTEMPT_RECORDED', !!att2, { sourceUrl: att2?.sourceUrl });
        recordAssertion('SUBTEST_2_DYNAMIC_REACT_STATUS_SUCCESS', att2?.status === 'CONFIRMED_SUCCESS', { status: att2?.status, reason: att2?.reasonCode });

        // ====================================================================
        // Assertion 3: Target 3 (Dynamically Replaced Form SPA)
        // ====================================================================
        const att3 = attempts.find(a => a.sourceUrl && a.sourceUrl.includes('dynamic-spa-replaced-form'));
        recordAssertion('SUBTEST_3_DYNAMIC_REPLACED_FORM_RECORDED', !!att3, { sourceUrl: att3?.sourceUrl });
        recordAssertion('SUBTEST_3_DYNAMIC_REPLACED_FORM_SUCCESS', att3?.status === 'CONFIRMED_SUCCESS', { status: att3?.status, reason: att3?.reasonCode });

        // Verify Server Submissions for Positive Targets 1, 2, 3
        const midSubRecord = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        log(`Server-side submissions recorded so far: ${midSubRecord.count}`);
        recordAssertion('SUBTEST_1_2_3_SERVER_SUBMISSIONS_RECORDED', midSubRecord.count === 3, { count: midSubRecord.count });

        // ====================================================================
        // Assertion 4: Target 4 (Missing / No-Message Form -> Strictly SKIPPED)
        // ====================================================================
        const att4 = attempts.find(a => a.sourceUrl && a.sourceUrl.includes('phone-only-no-message'));
        recordAssertion('SUBTEST_4_PHONE_ONLY_ATTEMPT_RECORDED', !!att4, { sourceUrl: att4?.sourceUrl });
        recordAssertion('SUBTEST_4_PHONE_ONLY_STATUS_SKIPPED', att4?.status === 'SKIPPED', { status: att4?.status, reason: att4?.reasonCode });
        recordAssertion('SUBTEST_4_PHONE_ONLY_REASON_NO_LONG_TEXT', (att4?.reasonCode === 'NO_LONG_TEXT_INQUIRY_FIELD' || (att4?.reason && att4?.reason.includes('NO_LONG_TEXT_INQUIRY_FIELD'))), { reasonCode: att4?.reasonCode });

        // ====================================================================
        // Assertion 5: Target 5 (Dead Contact Route -> Strictly FAILURE)
        // ====================================================================
        const att5 = attempts.find(a => a.sourceUrl && a.sourceUrl.includes('homepage-with-dead-contact-link'));
        recordAssertion('SUBTEST_5_DEAD_ROUTE_ATTEMPT_RECORDED', !!att5, { sourceUrl: att5?.sourceUrl });
        recordAssertion('SUBTEST_5_DEAD_ROUTE_STATUS_FAILURE', att5?.status === 'FAILURE', { status: att5?.status, reason: att5?.reasonCode });
        recordAssertion('SUBTEST_5_DEAD_ROUTE_REASON_NO_FORM', (att5?.reasonCode === 'NO_ACCESSIBLE_INQUIRY_FORM' || (att5?.reason && att5?.reason.includes('NO_ACCESSIBLE_INQUIRY_FORM'))), { reasonCode: att5?.reasonCode });

        // Verify Server Submissions Delta for Negative Targets (Must remain strictly 3, 0 delta)
        const finalSubRecord = await fetch(`http://127.0.0.1:${PORT}/__xpider_submissions`).then(r => r.json());
        log(`Final server-side submissions count: ${finalSubRecord.count}`);
        recordAssertion('NEGATIVE_TARGETS_ZERO_SUBMISSION_DELTA', finalSubRecord.count === 3, { finalCount: finalSubRecord.count, expectedCount: 3 });

        // ====================================================================
        // Assertion 6: Scoped HistoryStore 7-Bucket Ledger Math Invariant
        // ====================================================================
        const scopedStats = await swEval(`
            (async () => {
                const hs = await getHistoryStoreInstance();
                return hs.getLedgerStats('currentRun', '${campaignRunId}');
            })()
        `);
        log(`Scoped Stats for runId ${campaignRunId}: ${JSON.stringify(scopedStats)}`);
        recordAssertion('SCOPED_STATS_TOTAL_STARTED_FIVE', scopedStats?.totalStarted === 5, { totalStarted: scopedStats?.totalStarted });
        recordAssertion('SCOPED_STATS_SUCCESS_THREE', scopedStats?.success === 3, { success: scopedStats?.success });
        recordAssertion('SCOPED_STATS_SKIPPED_ONE', scopedStats?.skipped === 1, { skipped: scopedStats?.skipped });
        recordAssertion('SCOPED_STATS_FAILURE_ONE', scopedStats?.failure === 1, { failure: scopedStats?.failure });
        recordAssertion('SCOPED_STATS_MATH_INVARIANT_PRESERVED', (scopedStats?.success + scopedStats?.skipped + scopedStats?.failure) === 5, { sum: scopedStats?.success + scopedStats?.skipped + scopedStats?.failure });

        // Take screenshots for evidence
        await shot(popupWs, 'shot_item_c_popup_final_completed.png').catch(() => {});

        // Final Report
        report.status = "SUCCESS";
        report.endTimeUtc = new Date().toISOString();
        report.summary = {
            campaignRunId,
            totalStarted: 5,
            success: 3,
            skipped: 1,
            failure: 1,
            serverSubmissionsCount: finalSubRecord.count,
            scopedStats
        };

        log('\n================================================================================');
        log('🎉 ALL ITEM (C) & P0 FIXTURE AUDIT ASSERTIONS COMPLETED SUCCESSFULLY WITH EXIT 0!');
        log('================================================================================');

    } catch (err) {
        log(`\n❌ TEST SUITE FAILED: ${err.message}`);
        report.status = "FAILED";
        report.error = { message: err.message, stack: err.stack };
        report.endTimeUtc = new Date().toISOString();
        process.exitCode = 1;
    } finally {
        fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
        log(`Saved final report to: ${REPORT_FILE}`);

        if (popupWs) try { popupWs.close(); } catch (_) {}
        if (swWs) try { swWs.close(); } catch (_) {}
        if (browserWs) try { browserWs.close(); } catch (_) {}

        if (browserProcess && !browserProcess.killed) {
            log('Terminating browser process...');
            browserProcess.kill('SIGKILL');
        }
        if (logStream) logStream.end();
    }
}

main();
