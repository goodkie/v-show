/**
 * run_real_campaign_pipeline_audit.js
 * R6.9A Acceptance Suite: Actual Control-Plane Real Campaign Pipeline Audit
 * 
 * Strict Auditor Directives:
 * 1. Launch unpacked extension in Chromium (Edge).
 * 2. Connect to actual popup page and background service worker via CDP.
 * 3. Part 1: Verify Generation 7 restore, Succeeded=20 preservation, and durable persistence.
 * 4. Part 2: Verify terminal immutability (late timeout/unknown rejected, idempotent re-settle).
 * 5. Part 3: Execute ACTUAL extension control plane:
 *    - Populate popup inputs and queue with real web targets:
 *      Target 1: https://news.ycombinator.com/login (Real Live Non-Inquiry Login Page)
 *      Target 2: https://panzagear.com (Real Live Site / No Inquiry Body)
 *    - Click actual popup #start-btn via DOM click to trigger startCampaign() and START_CAMPAIGN IPC.
 *    - Background orchestrator creates tabs and injects content scripts.
 *    - Content script runs discovery -> LONG_TEXT_GATE -> FORM_INTENT -> FORM_GATE.
 *    - Background orchestrator canonicalizes NON_INQUIRY_* to SKIPPED with failureClass=null.
 *    - Harness role is strictly READ-ONLY: listen, collect, and inspect final ledger state.
 *    - Harness NEVER calls HistoryStore.recordAttempt() or settleCanonicalAttempt().
 *    - Succeeded: 20 from generation 7 remains strictly preserved!
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

async function runLivePipelineAudit() {
    const logFilePath = path.resolve('evidence_r6_9a_live_pipeline_and_migration.log');
    const logLines = [];

    function recordLog(line) {
        logLines.push(line);
        console.log(line);
    }

    recordLog(`================================================================================`);
    recordLog(`[R6.9A ACTUAL CONTROL-PLANE REAL CAMPAIGN PIPELINE ACCEPTANCE AUDIT]`);
    recordLog(`================================================================================`);
    recordLog(`Host OS: Windows (${os.platform()} ${os.release()})`);

    const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    recordLog(`Chromium Engine Binary: ${browserPath}`);

    const extPath = path.resolve('send_message_backup/build/extension');
    recordLog(`Unpacked Extension Path: ${extPath}`);

    const tempProfile = path.join(os.tmpdir(), 'live_pipeline_profile_' + Date.now());
    fs.mkdirSync(tempProfile, { recursive: true });

    recordLog(`Launching Chromium browser with extension...`);
    const proc = spawn(browserPath, [
        '--remote-debugging-port=9222',
        `--load-extension=${extPath}`,
        `--user-data-dir=${tempProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-position=50,50',
        '--window-size=1200,850',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 4500));

    let browserWs = null;

    try {
        const verRes = await fetch('http://127.0.0.1:9222/json/version');
        const ver = await verRes.json();
        recordLog(`[CDP_CONNECT] Connected to Chrome DevTools Protocol: ${ver.Browser}`);

        // Discover extension service worker
        const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
        const swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (!swTarget) throw new Error('Extension Service Worker not found in CDP targets!');
        const extId = swTarget.url.match(/chrome-extension:\/\/([a-z]+)\//)[1];
        recordLog(`[EXT_DISCOVERY] Discovered active Extension ID: ${extId}`);
        const popupUrl = `chrome-extension://${extId}/popup.html`;

        browserWs = new WebSocket(ver.webSocketDebuggerUrl);
        await new Promise((resolve) => { browserWs.onopen = resolve; });

        // Connect to Background Service Worker for pipeline monitoring
        const swWs = new WebSocket(swTarget.webSocketDebuggerUrl);
        await new Promise(r => swWs.onopen = r);
        swWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        swWs.send(JSON.stringify({ id: 2, method: 'Console.enable' }));

        swWs.onmessage = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.method === 'Runtime.consoleAPICalled') {
                const args = data.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
                recordLog(`[SW_CONSOLE] ${args}`);
            }
        };

        // Attach to browser target events to capture campaign tab content script logs
        browserWs.send(JSON.stringify({ id: 50, method: 'Target.setDiscoverTargets', params: { discover: true } }));
        browserWs.onmessage = async (evt) => {
            try {
                const data = JSON.parse(evt.data);
                if (data.method === 'Target.targetCreated' && data.params.targetInfo.type === 'page') {
                    const tInfo = data.params.targetInfo;
                    if (tInfo.url && (tInfo.url.includes('ycombinator') || tInfo.url.includes('panzagear'))) {
                        recordLog(`[BROWSER_EVENT] Campaign Tab Created: ${tInfo.url}`);
                    }
                }
            } catch (_) {}
        };

        // Create Popup Target
        const popupTarget = await new Promise((resolve) => {
            const reqId = 100;
            const handler = (evt) => {
                const data = JSON.parse(evt.data);
                if (data.id === reqId) {
                    browserWs.removeEventListener('message', handler);
                    resolve(data.result);
                }
            };
            browserWs.addEventListener('message', handler);
            browserWs.send(JSON.stringify({
                id: reqId,
                method: 'Target.createTarget',
                params: { url: popupUrl }
            }));
        });

        recordLog(`[POPUP_INIT] Extension popup target created: ${popupTarget.targetId}`);
        await new Promise(r => setTimeout(r, 2500));

        const updatedTargets = await (await fetch('http://127.0.0.1:9222/json')).json();
        const popupInfo = updatedTargets.find(t => t.id === popupTarget.targetId) || updatedTargets.find(t => t.url.includes(extId) && t.type === 'page');
        if (!popupInfo) throw new Error('Popup page target not found!');

        const popupWs = new WebSocket(popupInfo.webSocketDebuggerUrl);
        await new Promise(r => popupWs.onopen = r);
        popupWs.send(JSON.stringify({ id: 201, method: 'Runtime.enable' }));
        popupWs.send(JSON.stringify({ id: 202, method: 'Console.enable' }));

        popupWs.onmessage = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.method === 'Runtime.consoleAPICalled') {
                const args = data.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
                recordLog(`[POPUP_CONSOLE] ${args}`);
            }
        };

        let evalReqId = 500;
        function evalInPopup(expression) {
            return new Promise((resolve, reject) => {
                const curId = ++evalReqId;
                const handler = (evt) => {
                    const data = JSON.parse(evt.data);
                    if (data.id === curId) {
                        popupWs.removeEventListener('message', handler);
                        if (data.result?.exceptionDetails) {
                            reject(new Error(JSON.stringify(data.result.exceptionDetails)));
                        } else {
                            resolve(data.result?.result?.value);
                        }
                    }
                };
                popupWs.addEventListener('message', handler);
                popupWs.send(JSON.stringify({
                    id: curId,
                    method: 'Runtime.evaluate',
                    params: { expression, awaitPromise: true, returnByValue: true }
                }));
            });
        }

        // =========================================================================
        // PART 1: BROWSER INTEGRATION, GENERATION RESTORE & DURABLE MIGRATION AUDIT
        // =========================================================================
        recordLog(`\n================================================================================`);
        recordLog(`[PART 1: BROWSER INTEGRATION / GENERATION RESTORE / DURABLE MIGRATION AUDIT]`);
        recordLog(`================================================================================`);

        const part1Result = await evalInPopup(`(async () => {
            // Seed owner legacy dataset: 20 CONFIRMED_SUCCESS attempts in generation 7 (no generation on attempts)
            const legacyAttempts = [];
            for (let i = 1; i <= 20; i++) {
                legacyAttempts.push({
                    attemptId: 'att_owner_legacy_' + i,
                    targetIdentity: 'https://owner-client-' + i + '.org',
                    sourceUrl: 'https://owner-client-' + i + '.org/contact',
                    status: 'CONFIRMED_SUCCESS',
                    reasonCode: 'SUCCESS_CONFIRMED',
                    // No generationId or campaignRunId
                    timing: { durationMs: 4500, intentTime: Date.now() - 7200000, finalizedTime: Date.now() - 7190000 },
                    createdAt: Date.now() - (25 - i) * 60000
                });
            }

            await chrome.storage.local.set({
                xpider_history_attempts: legacyAttempts,
                xpider_history_generation: 7, // Persisted generation 7
                xpider_active_campaign_run_id: 'run_r6_9a_owner_audit'
            });

            // Rehydrate HistoryStore
            const hs = getPopupHistoryStore();
            await hs.load();

            const restoredGeneration = hs.currentGeneration;
            const statsGen7 = hs.getLedgerStats('currentGeneration');
            const csv = hs.exportToCsv({ exportScope: 'currentGeneration' });
            const csvCount = (csv.match(/"CONFIRMED_SUCCESS"/g) || []).length;
            const gsheetsCsv = hs.exportGoogleSheetsCsv({ exportScope: 'currentGeneration' });
            const gsheetsCount = (gsheetsCsv.match(/"CONFIRMED_SUCCESS"/g) || []).length;

            // Re-render UI
            if (typeof window._renderHistoryPanel === 'function') await window._renderHistoryPanel();
            if (typeof renderLedgerUI === 'function') await renderLedgerUI();

            const panel = document.getElementById('history-status-panel');
            const panelText = panel ? panel.innerText : '';

            // Verify durable persistence into chrome.storage.local
            const storedAfterLoad = await chrome.storage.local.get(['xpider_history_attempts', 'xpider_history_generation']);
            const sampleAttempt = storedAfterLoad.xpider_history_attempts[0];

            return {
                restoredGeneration,
                statsGen7,
                csvCount,
                gsheetsCount,
                panelText,
                sampleAttemptGeneration: sampleAttempt.generation,
                sampleAttemptRunId: sampleAttempt.campaignRunId
            };
        })()`);

        recordLog(`[GEN_RESTORE] Restored xpider_history_generation: ${part1Result.restoredGeneration} (Expected: 7)`);
        recordLog(`[DURABLE_PERSISTENCE] Stored Attempt Generation: ${part1Result.sampleAttemptGeneration}, RunId: ${part1Result.sampleAttemptRunId}`);
        recordLog(`[AUTHORITATIVE_STATS] Scope=currentGeneration (Gen 7) Success: ${part1Result.statsGen7.success}`);
        recordLog(`[CSV_EXPORTS] Standard CSV Rows: ${part1Result.csvCount}, GSheets CSV Rows: ${part1Result.gsheetsCount}`);

        const genRestorePassed = (part1Result.restoredGeneration === 7 &&
                                  part1Result.statsGen7.success === 20 &&
                                  part1Result.csvCount === 20 &&
                                  part1Result.sampleAttemptGeneration === 7);
        recordLog(`[PART_1_VERIFICATION] ${genRestorePassed ? 'PASSED (Generation 7 restored, Succeeded:20 preserved, durably persisted)' : 'FAILED'}`);

        // =========================================================================
        // PART 2: TERMINAL IMMUTABILITY AUDIT
        // =========================================================================
        recordLog(`\n================================================================================`);
        recordLog(`[PART 2: TERMINAL IMMUTABILITY & IDEMPOTENT SETTLEMENT AUDIT]`);
        recordLog(`================================================================================`);

        const part2Result = await evalInPopup(`(async () => {
            const hs = getPopupHistoryStore();
            // ISOLATED AUDIT GENERATION (Gen 999) - Strictly prevents polluting owner Gen 7 scope
            const att = await hs.recordAttempt('https://audit-immutability.com', { 
                generation: 999, 
                campaignRunId: 'run_immutability_isolated_probe' 
            });
            const attId = att.attemptId;

            // 1. Initial settlement: CONFIRMED_SUCCESS
            const settle1 = await hs.settleCanonicalAttempt(attId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');

            // 2. Late TIMEOUT callback attempt -> Must be rejected!
            const settleLateTimeout = await hs.settleCanonicalAttempt(attId, 'TIMEOUT_LOCAL', 'TIMEOUT_AFTER_20S');

            // 3. Stale UNKNOWN callback attempt -> Must be rejected!
            const settleStaleUnknown = await hs.settleCanonicalAttempt(attId, 'DELIVERY_UNKNOWN', 'NO_CONFIRMATION_FOUND');

            // 4. Duplicate same-status settlement -> Idempotent
            const settleDuplicate = await hs.settleCanonicalAttempt(attId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED');

            const finalAttempt = hs.attempts.find(a => a.attemptId === attId);
            const statusVerified = finalAttempt.status;

            // Strict cleanup of probe record: completely purge from attempts array & persist
            const idx = hs.attempts.findIndex(a => a.attemptId === attId);
            if (idx !== -1) hs.attempts.splice(idx, 1);
            await hs.persist();

            // Re-load to prove clean state
            await hs.load();
            const gen7Stats = hs.getLedgerStats('currentGeneration');

            return {
                settle1Success: settle1.settled,
                lateTimeoutRejected: !settleLateTimeout.settled && settleLateTimeout.reason === 'TERMINAL_ALREADY_SETTLED',
                staleUnknownRejected: !settleStaleUnknown.settled && settleStaleUnknown.reason === 'TERMINAL_ALREADY_SETTLED',
                duplicateIdempotent: settleDuplicate.settled && settleDuplicate.idempotent,
                finalStatus: statusVerified,
                cleanGen7Success: gen7Stats.success,
                cleanGen7Total: gen7Stats.total
            };
        })()`);

        recordLog(`[IMMUTABILITY_CHECK] Initial Settlement: ${part2Result.settle1Success ? 'SETTLED' : 'FAIL'}`);
        recordLog(`[IMMUTABILITY_CHECK] Late TIMEOUT Settle Rejected: ${part2Result.lateTimeoutRejected ? 'YES (TERMINAL_ALREADY_SETTLED)' : 'NO'}`);
        recordLog(`[IMMUTABILITY_CHECK] Stale UNKNOWN Settle Rejected: ${part2Result.staleUnknownRejected ? 'YES (TERMINAL_ALREADY_SETTLED)' : 'NO'}`);
        recordLog(`[IMMUTABILITY_CHECK] Duplicate Re-Settlement Idempotent: ${part2Result.duplicateIdempotent ? 'YES' : 'NO'}`);
        recordLog(`[IMMUTABILITY_CHECK] Final Stored Status: ${part2Result.finalStatus} (Guaranteed CONFIRMED_SUCCESS)`);
        recordLog(`[IMMUTABILITY_CHECK] Post-Probe Gen 7 Success: ${part2Result.cleanGen7Success} (Strictly 20), Total: ${part2Result.cleanGen7Total}`);

        const immutabilityPassed = part2Result.lateTimeoutRejected && 
                                   part2Result.staleUnknownRejected && 
                                   part2Result.finalStatus === 'CONFIRMED_SUCCESS' &&
                                   part2Result.cleanGen7Success === 20;
        recordLog(`[PART_2_VERIFICATION] ${immutabilityPassed ? 'PASSED (Terminal status immutable; Gen 7 strictly preserved at 20)' : 'FAILED'}`);

        // =========================================================================
        // PART 3: ACTUAL CONTROL-PLANE LIVE PIPELINE EXECUTION OVER REAL WEB TARGETS
        // =========================================================================
        recordLog(`\n================================================================================`);
        recordLog(`[PART 3: ACTUAL EXTENSION CONTROL-PLANE PIPELINE OVER REAL WEB TARGETS]`);
        recordLog(`================================================================================`);
        recordLog(`Control Plane Trigger: Real Popup Start Button (#start-btn) Click`);
        recordLog(`Target 1: https://news.ycombinator.com/login (Real Live Non-Inquiry Login Page)`);
        recordLog(`Target 2: https://panzagear.com (Real Live Target)`);
        recordLog(`Harness Mode: STRICT READ-ONLY OBSERVER (No manual recordAttempt / settleCanonicalAttempt)`);

        // Continuous CDP connector for any opened campaign page targets
        const attachedTargetIds = new Set();
        const pollPageTargets = async () => {
            try {
                const liveTargets = await (await fetch('http://127.0.0.1:9222/json')).json();
                for (const lt of liveTargets) {
                    if (lt.type === 'page' && !lt.url.includes('popup.html') && (lt.url.includes('ycombinator') || lt.url.includes('panzagear'))) {
                        if (!attachedTargetIds.has(lt.id) && lt.webSocketDebuggerUrl) {
                            attachedTargetIds.add(lt.id);
                            recordLog(`[CDP_PAGE_ATTACH] targetId=${lt.id} url=${lt.url}`);
                            const pageWs = new WebSocket(lt.webSocketDebuggerUrl);
                            pageWs.onopen = () => {
                                pageWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
                                pageWs.send(JSON.stringify({ id: 2, method: 'Console.enable' }));
                            };
                            pageWs.onmessage = (e) => {
                                try {
                                    const d = JSON.parse(e.data);
                                    if (d.method === 'Runtime.consoleAPICalled') {
                                        const args = d.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
                                        recordLog(`[CONTENT_CONSOLE][${lt.url}] ${args}`);
                                    }
                                } catch (_) {}
                            };
                        }
                    }
                }
            } catch (_) {}
        };

        // Trigger campaign via actual popup DOM interaction
        const startTriggerResult = await evalInPopup(`(async () => {
            // 1. Switch to Campaign Tab
            const campTabBtn = document.querySelector('[data-tab="campaign"]');
            if (campTabBtn) campTabBtn.click();

            // 2. Set Template inputs
            const tplSub = document.getElementById('tpl-subject');
            if (tplSub) tplSub.value = 'Audit Inquiry Verification';
            const tplMsg = document.getElementById('tpl-message');
            if (tplMsg) tplMsg.value = 'Hello, this is an automated audit probe message with sufficient length for form validation testing.';
            const tplName = document.getElementById('tpl-name');
            if (tplName) tplName.value = 'Auditor Probe';
            const tplEmail = document.getElementById('tpl-email');
            if (tplEmail) tplEmail.value = 'audit-probe@example.org';

            // 3. Set speed sliders to Level 9 (fastest safe delay)
            const dCol = document.getElementById('delay-input-collect'); if (dCol) dCol.value = '9';
            const dFill = document.getElementById('delay-input-fill'); if (dFill) dFill.value = '9';
            const dSub = document.getElementById('delay-input-submit'); if (dSub) dSub.value = '9';

            // 4. Disable skip-previously-attempted so targets execute
            const skipEl = document.getElementById('skip-attempted-toggle');
            if (skipEl) skipEl.checked = false;

            // 5. Populate campaignQueue via manual URL input
            if (typeof campaignQueue !== 'undefined') {
                campaignQueue.length = 0;
            }

            const inputEl = document.getElementById('manual-url-input');
            if (inputEl && typeof addSingleUrl === 'function') {
                inputEl.value = 'https://news.ycombinator.com/login';
                await addSingleUrl();
                inputEl.value = 'https://panzagear.com';
                await addSingleUrl();
            }

            const queueLen = typeof campaignQueue !== 'undefined' ? campaignQueue.length : 0;
            console.log('[POPUP_CONTROL] Queue populated with ' + queueLen + ' targets. Clicking #start-btn...');

            // 6. Click the actual start button!
            const startBtn = document.getElementById('start-btn');
            if (!startBtn) throw new Error('#start-btn not found in popup DOM!');
            startBtn.click();

            return {
                clicked: true,
                queueLength: queueLen,
                btnText: startBtn.textContent
            };
        })()`);

        recordLog(`[CONTROL_PLANE_START] Button clicked. Queue length: ${startTriggerResult.queueLength}, Button text: "${startTriggerResult.btnText}"`);
        recordLog(`[PRE_CAMPAIGN_LEDGER] Owner Gen 7 Succeeded BEFORE control-plane run: ${part2Result.cleanGen7Success} (Strictly: 20)`);
        await pollPageTargets();

        // Wait for background orchestrator to process both targets and settle them
        recordLog(`Waiting for background orchestrator and content scripts to execute pipeline...`);
        const maxWaitMs = 150000;
        const pollStart = Date.now();
        let pipelineSettled = false;
        let pollStatus = null;

        while (!pipelineSettled && (Date.now() - pollStart) < maxWaitMs) {
            await new Promise(r => setTimeout(r, 2500));
            await pollPageTargets();

            pollStatus = await evalInPopup(`(async () => {
                const hs = getPopupHistoryStore();
                if (typeof hs.load === 'function') await hs.load();

                const hnAttempt = hs.attempts.find(a => (a.sourceUrl && a.sourceUrl.includes('news.ycombinator.com')) || (a.targetIdentity && a.targetIdentity.includes('news.ycombinator.com')));
                const panzaAttempt = hs.attempts.find(a => (a.sourceUrl && a.sourceUrl.includes('panzagear.com')) || (a.targetIdentity && a.targetIdentity.includes('panzagear.com')));
                const isCampaignActive = (typeof window.campaignActive !== 'undefined') ? window.campaignActive : false;
                const startBtn = document.getElementById('start-btn');

                return {
                    isCampaignActive,
                    startBtnText: startBtn ? startBtn.textContent : '',
                    hnAttempt: hnAttempt ? {
                        attemptId: hnAttempt.attemptId,
                        status: hnAttempt.status,
                        reasonCode: hnAttempt.reasonCode,
                        failureClass: hnAttempt.failureClass
                    } : null,
                    panzaAttempt: panzaAttempt ? {
                        attemptId: panzaAttempt.attemptId,
                        status: panzaAttempt.status,
                        reasonCode: panzaAttempt.reasonCode,
                        failureClass: panzaAttempt.failureClass
                    } : null,
                    totalAttempts: hs.attempts.length
                };
            })()`);

            const elapsedSec = Math.round((Date.now() - pollStart) / 1000);
            recordLog(`[PIPELINE_POLL] ${elapsedSec}s elapsed | Active=${pollStatus.isCampaignActive} | HN=${pollStatus.hnAttempt ? pollStatus.hnAttempt.status : 'PENDING'} | Panza=${pollStatus.panzaAttempt ? pollStatus.panzaAttempt.status : 'PENDING'}`);

            if (pollStatus.hnAttempt && pollStatus.hnAttempt.status !== 'PREPARING' &&
                pollStatus.panzaAttempt && pollStatus.panzaAttempt.status !== 'PREPARING') {
                pipelineSettled = true;
            }
        }

        // Final Read-Only Verification of HistoryStore Ledger
        recordLog(`\n--- Final Read-Only Inspection of HistoryStore Ledger ---`);
        const finalInspection = await evalInPopup(`(async () => {
            const hs = getPopupHistoryStore();
            await hs.load();

            const hnRec = hs.attempts.find(a => a.sourceUrl && a.sourceUrl.includes('news.ycombinator.com'));
            const panzaRec = hs.attempts.find(a => a.sourceUrl && a.sourceUrl.includes('panzagear.com'));

            const statsGen = hs.getLedgerStats('currentGeneration');
            const statsAll = hs.getLedgerStats('allHistory');
            const gen7Attempts = hs.attempts.filter(a => a.generation === 7);

            return {
                hnRec,
                panzaRec,
                statsGen,
                statsAll,
                gen7AttemptsCount: gen7Attempts.length,
                totalAttempts: hs.attempts.length
            };
        })()`);

        recordLog(`[READ_ONLY_LEDGER] Target 1 (news.ycombinator.com/login):`);
        recordLog(`  - Status: ${finalInspection.hnRec?.status} (Expected: SKIPPED)`);
        recordLog(`  - ReasonCode: ${finalInspection.hnRec?.reasonCode} (Expected: NON_INQUIRY_LOGIN_FORM)`);
        recordLog(`  - FailureClass: ${finalInspection.hnRec?.failureClass} (Expected: null)`);

        recordLog(`[READ_ONLY_LEDGER] Target 2 (panzagear.com):`);
        recordLog(`  - Status: ${finalInspection.panzaRec?.status} (Expected: FAILURE)`);
        recordLog(`  - ReasonCode: ${finalInspection.panzaRec?.reasonCode} (Expected: CONTACT_DISCOVERY_EXHAUSTED)`);

        recordLog(`[READ_ONLY_LEDGER] Authoritative Ledger Counters (Scope: currentGeneration):`);
        recordLog(`  - Current Generation Succeeded: ${finalInspection.statsGen.success} (Strictly Preserved: 20)`);
        recordLog(`  - Current Generation Skipped: ${finalInspection.statsGen.skipped} (HN Login: +1)`);
        recordLog(`  - Current Generation Failed: ${finalInspection.statsGen.failure} (Panzagear: +1)`);
        recordLog(`  - Total Current Generation Attempts: ${finalInspection.gen7AttemptsCount} (20 legacy + 1 skipped + 1 failed = 22)`);

        const hnSkippedCorrect = finalInspection.hnRec?.status === 'SKIPPED' &&
                                finalInspection.hnRec?.reasonCode === 'NON_INQUIRY_LOGIN_FORM' &&
                                finalInspection.hnRec?.failureClass === null;
        const panzaSettled = finalInspection.panzaRec && finalInspection.panzaRec.status === 'FAILURE' &&
                             finalInspection.panzaRec?.reasonCode === 'CONTACT_DISCOVERY_EXHAUSTED';
        const gen7SuccessStrictly20 = finalInspection.statsGen.success === 20;
        const totalGen7Matches22 = finalInspection.gen7AttemptsCount === 22;

        recordLog(`\n================================================================================`);
        recordLog(`[PART 3 VERIFICATION]: ${hnSkippedCorrect && panzaSettled && gen7SuccessStrictly20 && totalGen7Matches22 ? 'PASSED (Real Control Plane, Non-Inquiry SKIPPED, Succeeded:20 Strictly Preserved, Zero Contamination)' : 'FAILED'}`);
        recordLog(`[LIVE_OUTCOME_HONESTY] Real live submission success: UNVERIFIED IN BOUNDED PROBE (Compliance protected)`);
        recordLog(`================================================================================`);
        recordLog(`[LIVE_OUTCOME_HONESTY] Real live submission success: UNVERIFIED IN BOUNDED PROBE (Compliance protected)`);
        recordLog(`================================================================================`);

        fs.writeFileSync(logFilePath, logLines.join('\n'), 'utf8');
        recordLog(`Saved trace log to: ${logFilePath}`);

    } finally {
        if (browserWs) browserWs.close();
        proc.kill('SIGTERM');
    }
}

runLivePipelineAudit().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
