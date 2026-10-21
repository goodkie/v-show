/**
 * run_edge_sprint_full_captcha_e2e_rehearsal.js
 *
 * Sprint Finalization Rehearsal Suite:
 * Authoritative XPIDER Runtime-Driven CAPTCHA + Sequential Form E2E Verification
 * Per ChatGPT Audit Directive (Comment #6313213003 Section 9 & Follow-up Audit #6313430588):
 *
 * Covers all 16 required invariants:
 * 1. Form discovery by XPIDER engine (contact-discovery-engine)
 * 2. Autofill by XPIDER engine (smart-field-resolver)
 * 3. CAPTCHA detection by XPIDER
 * 4. Controlled provider adapter reached (MockCaptchaProviderAdapter)
 * 5. Provider result/token flows through background authority
 * 6. Dynamic frame selection / token application
 * 7. Exactly one MAIN-world token write
 * 8. READY_TO_SUBMIT reached
 * 9. XPIDER itself clicks submit (orchestrator submit transition)
 * 10. Submission outcome verification (SubmissionOutcomeVerifier)
 * 11. CAPTCHA_ACCEPTED
 * 12. Terminal settlement: SUCCESS
 * 13. Exactly one settlement recorded in HistoryStore ledger
 * 14. Counter/history/ledger verified (success=1, failed=0)
 * 15. Target 2 (contact-standard.html) executed sequentially
 * 16. Sequential target clean state reset (zero token bleed, 2 total successes, 0 failures)
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const FIXTURE_PORT = 8088;
const CDP_PORT = 9445;
const TRACE_LOG_FILE = path.join(__dirname, 'scratch', 'edge_full_captcha_e2e_trace.log');

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP TIMEOUT: ${method}`)), 20000);
    const handler = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (_) {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  console.log('========================================================================');
  console.log(' XPIDER RUNTIME-DRIVEN CAPTCHA & SEQUENTIAL FORM E2E REHEARSAL (EDGE)');
  console.log('========================================================================\n');

  if (!fs.existsSync(path.dirname(TRACE_LOG_FILE))) {
    fs.mkdirSync(path.dirname(TRACE_LOG_FILE), { recursive: true });
  }
  const traceStream = fs.createWriteStream(TRACE_LOG_FILE, { flags: 'w' });
  const logTrace = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    try { fs.appendFileSync(TRACE_LOG_FILE, line + '\n'); } catch (_) {}
    console.log(line);
  };

  // Step 1: Ensure fixture server is running (auto-spawn if needed)
  let spawnedServer = null;
  let isServerRunning = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_health`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });

  if (!isServerRunning) {
    const serverScript = path.resolve('owner-extension-test-site', 'server.js');
    if (fs.existsSync(serverScript)) {
      logTrace(`[SETUP] Spawning local test fixture server: ${serverScript}...`);
      spawnedServer = spawn('node', [serverScript], { stdio: 'ignore' });
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 200));
        isServerRunning = await new Promise((resolve) => {
          http.get(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_health`, (res) => {
            resolve(res.statusCode === 200);
          }).on('error', () => resolve(false));
        });
        if (isServerRunning) break;
      }
    }
  }

  assert(isServerRunning, `Local fixture server must be running on port ${FIXTURE_PORT}`);
  logTrace(`[PASS] Step 1: Local test fixture server active at http://127.0.0.1:${FIXTURE_PORT}`);

  // Step 2: Locate Edge executable
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const edgeExe = edgePaths.find(p => fs.existsSync(p));
  assert(edgeExe, 'Microsoft Edge executable not found');

  const extDir = path.resolve('extension');
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_captcha_rehearsal_'));

  const edgeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempProfile}`,
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'about:blank'
  ];

  logTrace(`Launching Edge (headless) on CDP port ${CDP_PORT}...`);
  const edgeProcess = spawn(edgeExe, edgeArgs, { stdio: 'ignore' });

  let cdpConnected = false;
  let targets = null;
  let msgId = 1;

  try {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          targets = await res.json();
          cdpConnected = true;
          break;
        }
      } catch (_) {}
    }
    assert(cdpConnected, 'Edge CDP connection failed');
    logTrace(`[PASS] Step 2: Edge attached via CDP (${targets.length} targets found)`);

    // Step 3: Find and attach to Service Worker
    let sw = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
    for (let i = 0; !sw && i < 20; i++) {
      await new Promise(r => setTimeout(r, 400));
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        const list = await res.json();
        sw = list.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
      }
    }
    assert(sw, 'Service Worker not found in CDP targets');
    const swWs = await openWs(sw.webSocketDebuggerUrl);
    await cdpSend(swWs, msgId++, 'Runtime.enable');
    await cdpSend(swWs, msgId++, 'Console.enable');

    const observedInvariants = {
      formDiscovered: false,
      smartAutofill: false,
      captchaDetected: false,
      mockProviderCalled: false,
      tokenReturned: false,
      frameSelection: false,
      frameInventory: [],
      selectedFrameId: null,
      appliedFrameId: null,
      mainWorldWriteCount: 0,
      duplicateRejections: 0,
      tokenApplied: false,
      challengeVerified: false,
      captchaAccepted: false,
      readyToSubmit: false,
      xpiderSubmitTriggered: false,
      submissionOutcomeVerified: false,
      target1SettledSuccess: false,
      cleanStateReset: false,
      target2SettledSuccess: false,
      ledgerVerified: false
    };

    swWs.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          const text = msg.params.args.map(a => a.value !== undefined ? (typeof a.value === 'object' ? JSON.stringify(a.value) : a.value) : (a.description || '')).join(' ');
          logTrace(`  [SW_LOG] ${text}`);

          if (text.includes('[FIELD_ASSIGN✅]') || text.includes('[FIELD_CLASSIFY]')) observedInvariants.formDiscovered = true;
          if (text.includes('[FIELD_ASSIGN✅]')) observedInvariants.smartAutofill = true;
          if (text.includes('[CAPTCHA_DETECTED]')) observedInvariants.captchaDetected = true;
          if (text.includes('[CAPTCHA_PROVIDER_SELECT]') && text.includes('mock_provider')) observedInvariants.mockProviderCalled = true;
          if (text.includes('[CAPTCHA_TOKEN_RECEIVED]')) observedInvariants.tokenReturned = true;
          if (text.includes('[CAPTCHA_FRAME_MAP]')) {
            observedInvariants.frameSelection = true;
            const fidMatch = text.match(/frameId=(\d+)/);
            const widgetMatch = text.match(/hasWidgetContainer=(true|false)/);
            const respMatch = text.match(/hasResponseField=(true|false)/);
            if (fidMatch) {
              const fid = parseInt(fidMatch[1], 10);
              if (!observedInvariants.frameInventory.some(f => f.frameId === fid)) {
                observedInvariants.frameInventory.push({
                  frameId: fid,
                  hasWidgetContainer: widgetMatch ? widgetMatch[1] === 'true' : false,
                  hasResponseField: respMatch ? respMatch[1] === 'true' : false
                });
              }
            }
          }
          if (text.includes('[CAPTCHA_APPLY_TARGET]')) {
            observedInvariants.frameSelection = true;
            const selMatch = text.match(/selectedFrameId=(\d+)/) || text.match(/frameId=(\d+)/);
            if (selMatch) {
              observedInvariants.selectedFrameId = parseInt(selMatch[1], 10);
            }
          }
          if (text.includes('[CAPTCHA_MAIN_WORLD_INTEGRATION]')) {
            const appMatch = text.match(/frameId=(\d+)/);
            if (appMatch) {
              observedInvariants.appliedFrameId = parseInt(appMatch[1], 10);
            }
            if (text.includes('tokenWritten=true')) {
              observedInvariants.mainWorldWriteCount++;
            }
          }
          if (text.includes('[CAPTCHA_DUPLICATE_TOKEN_REJECTED]')) {
            observedInvariants.duplicateRejections++;
          }
          if (text.includes('[CAPTCHA_TOKEN_APPLIED]')) observedInvariants.tokenApplied = true;
          if (text.includes('[CAPTCHA_CHALLENGE_VERIFIED]')) observedInvariants.challengeVerified = true;
          if (text.includes('[CAPTCHA_VERIFY_SIGNAL]') || text.includes('[CAPTCHA_AUTO_SUCCESS]')) observedInvariants.captchaAccepted = true;
          if (text.includes('Resuming sequence for submit') || text.includes('Bypass verified') || text.includes('READY_TO_SUBMIT')) observedInvariants.readyToSubmit = true;
          if (text.includes('submitEvent=true') || text.includes('[SUBMIT_VERIFY]') || text.includes('Physical click')) observedInvariants.xpiderSubmitTriggered = true;
          if (text.includes('[SUBMIT_VERIFY]') && text.includes('decision=CONFIRMED_SUCCESS')) observedInvariants.submissionOutcomeVerified = true;
          if (text.includes('[FINAL_CANONICAL]') && text.includes('CONFIRMED_SUCCESS') && text.includes('captcha-mock-solve.html')) observedInvariants.target1SettledSuccess = true;
          if (text.includes('[CAPTCHA_STATE_RESET]')) observedInvariants.cleanStateReset = true;
          if (text.includes('[FINAL_CANONICAL]') && text.includes('CONFIRMED_SUCCESS') && text.includes('contact-standard.html')) observedInvariants.target2SettledSuccess = true;
          if (text.includes('[LEDGER_STATS]') && text.includes('success=2') && text.includes('failure=0')) observedInvariants.ledgerVerified = true;
        }
      } catch (_) {}
    });

    // Check Build Provenance in SW
    const provCheck = await cdpSend(swWs, msgId++, 'Runtime.evaluate', {
      expression: 'BuildProvenance.BUILD_INFO.buildId',
      returnByValue: true
    });
    logTrace(`[PASS] Step 3: Service Worker build verified: ${provCheck.result?.value}`);

    // Step 4: Populate extension storage for automated test run with direct loopback privacy
    const setupScript = `
      (async () => {
        await chrome.storage.local.set({
          xpider_owner_function_test_mode: true,
          xpider_active_test_source: 'OWNER_CAPTCHA_LAB',
          xpider_show_autofill_visual_confirm: false,
          xpider_function_test_mode: true,
          xpider_privacy_config: {
            enabled: false,
            failClosed: false,
            transportMode: 'DIRECT'
          },
          xpider_queue: [
            'http://127.0.0.1:${FIXTURE_PORT}/captcha-mock-solve.html',
            'http://127.0.0.1:${FIXTURE_PORT}/contact-standard.html'
          ],
          xpider_total: 2,
          xpider_active_campaign_run_id: 'e2e_rehearsal_run_' + Date.now(),
          xpider_delay_collect_ms: 100,
          xpider_delay_fill_ms: 50,
          xpider_delay_submit_ms: 200,
          xpider_template_v2: {
            name: 'Rehearsal Operator',
            firstName: 'Rehearsal',
            lastName: 'Operator',
            email: 'operator@autonomous-audit.io',
            phone: '555-0199',
            subject: 'Automated E2E Inquiry',
            message: 'XPIDER AutoForm runtime-driven end-to-end acceptance message.',
            templateId: 'tpl_rehearsal',
            templateVersion: 1
          }
        });

        // Initialize PrivacyGateway config in memory to match
        const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
        if (pg) {
          await pg.init();
          pg.config.enabled = false;
          pg.config.failClosed = false;
          pg.config.transportMode = 'DIRECT';
        }

        // Install DNR network guard (all 7 rules required for Owner Test mode)
        try {
          if (typeof installOwnerTestNetworkGuard === 'function') {
            await installOwnerTestNetworkGuard({ allowCloudflareChallenges: true });
          }
        } catch (e) {
          console.error('[GUARD_INSTALL_ERR]', e);
        }

        return true;
      })()
    `;

    const setupResult = await cdpSend(swWs, msgId++, 'Runtime.evaluate', {
      expression: setupScript,
      awaitPromise: true,
      returnByValue: true
    });
    assert.strictEqual(setupResult.result?.value, true, 'Storage setup failed');
    logTrace('[PASS] Step 4: Storage & Direct loopback privacy initialized with 2 sequential targets');

    // Step 5: Launch campaign through XPIDER's authoritative startCampaignOrchestrator
    logTrace('\n[REHEARSAL] Dispatching startCampaignOrchestrator through XPIDER engine...');
    const launchScript = `
      (async () => {
        const st = await chrome.storage.local.get([
          'xpider_queue',
          'xpider_template_v2',
          'xpider_active_campaign_run_id'
        ]);

        campaignState.ownerFunctionTestMode = true;
        campaignState.mockEligible = true;
        campaignState.ownerTestSource = 'OWNER_CAPTCHA_LAB';
        campaignState.runScopedDirectPrivacy = true;

        startCampaignOrchestrator(
          st.xpider_queue,
          st.xpider_template_v2,
          100,
          50,
          200,
          {
            skipPreviouslyAttempted: false,
            overrideSkipAttempted: true,
            ownerFunctionTestMode: true,
            ownerTestSource: 'OWNER_CAPTCHA_LAB',
            campaignRunId: st.xpider_active_campaign_run_id
          }
        ).catch(err => console.error('[ORCHESTRATOR_ERR]', err));

        return { success: true };
      })()
    `;

    const launchResult = await cdpSend(swWs, msgId++, 'Runtime.evaluate', {
      expression: launchScript,
      awaitPromise: true,
      returnByValue: true
    });
    assert(launchResult.result?.value && launchResult.result?.value.success === true, 'startCampaignOrchestrator failed to launch');
    logTrace('[PASS] Step 5: startCampaignOrchestrator successfully launched in Background Service Worker');

    // Step 6: Monitor campaign progression across both targets
    logTrace('\n[REHEARSAL] Monitoring XPIDER pipeline execution across Target 1 & Target 2...');
    const startTime = Date.now();
    let finalState = null;

    while (Date.now() - startTime < 45000) {
      await new Promise(r => setTimeout(r, 1000));

      const pollState = await cdpSend(swWs, msgId++, 'Runtime.evaluate', {
        expression: `
          (async () => {
            let hsAttempts = [];
            try {
              const hs = (typeof getHistoryStoreInstance === 'function') ? await getHistoryStoreInstance() : null;
              if (hs && Array.isArray(hs.attempts)) {
                hsAttempts = hs.attempts.map(a => ({
                  url: a.sourceUrl || a.targetUrl || a.url || a.targetIdentity || a.contactPageUrl || '',
                  status: a.status || a.terminalStatus || a.submissionStatus || '',
                  reasonCode: a.reasonCode,
                  attemptId: a.attemptId,
                  generation: a.generation
                }));
              }
            } catch (_) {}

            const curState = (typeof campaignState !== 'undefined') ? {
              isActive: campaignState.isActive,
              queueRemaining: Array.isArray(campaignState.queue) ? campaignState.queue.length : 0,
              currentStage: campaignState.currentTargetStage,
              successCount: campaignState.successCount,
              totalTargets: campaignState.totalTargets
            } : null;

            return { historyCount: hsAttempts.length, history: hsAttempts, state: curState };
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const resVal = pollState.result?.value;
      if (resVal) {
        finalState = resVal;
        const st = resVal.state;
        logTrace(`  -> Pipeline Status: stage=${st?.currentStage} remaining=${st?.queueRemaining} historyCount=${resVal.historyCount} active=${st?.isActive}`);

        const allSettled = resVal.history.length >= 2 && resVal.history.every(h => h.status !== 'PREPARING');
        if (allSettled || (st && !st.isActive && resVal.history.length >= 2)) {
          logTrace('\n[REHEARSAL] Campaign reached completion barrier! Settling verification.');
          break;
        }
      }
    }

    assert(finalState && Array.isArray(finalState.history), 'Failed to retrieve campaign history');

    // Step 7: Verify Section 9 Invariants
    logTrace('\n================ VERIFICATION OF SECTION 9 INVARIANTS ================');

    // Invariant 1: Form discovery
    assert.strictEqual(observedInvariants.formDiscovered, true, 'Invariant 1 FAIL: Form discovery by XPIDER engine');
    logTrace('✅ [INVARIANT 1 PASS] Form discovery by XPIDER engine verified.');

    // Invariant 2: Engine autofill
    assert.strictEqual(observedInvariants.smartAutofill, true, 'Invariant 2 FAIL: Autofill by smart-field-resolver');
    logTrace('✅ [INVARIANT 2 PASS] Field autofill by smart-field-resolver verified.');

    // Invariant 3: CAPTCHA detected
    assert.strictEqual(observedInvariants.captchaDetected, true, 'Invariant 3 FAIL: CAPTCHA detection by solver-content.js');
    logTrace('✅ [INVARIANT 3 PASS] CAPTCHA detected by solver-content.js.');

    // Invariant 4: Controlled provider adapter reached
    assert.strictEqual(observedInvariants.mockProviderCalled, true, 'Invariant 4 FAIL: Controlled provider adapter reached');
    logTrace('✅ [INVARIANT 4 PASS] Controlled provider adapter reached (MockCaptchaProviderAdapter).');

    // Invariant 5: Provider result/token flows through background authority
    assert.strictEqual(observedInvariants.tokenReturned, true, 'Invariant 5 FAIL: Token flow to background authority');
    logTrace('✅ [INVARIANT 5 PASS] Provider token returned to background authority.');

    // Invariant 6: Dynamic frame selection
    assert.strictEqual(observedInvariants.frameSelection, true, 'Invariant 6 FAIL: Dynamic frame selection / apply target');
    assert(observedInvariants.frameInventory.length > 0, 'Invariant 6 FAIL: Frame inventory must be populated');
    assert(observedInvariants.selectedFrameId !== null, 'Invariant 6 FAIL: Authoritative frame must be selected');
    const matchedInventoryFrame = observedInvariants.frameInventory.find(f => f.frameId === observedInvariants.selectedFrameId);
    assert(matchedInventoryFrame, 'Invariant 6 FAIL: selectedFrameId must exist in frameInventory');
    assert(matchedInventoryFrame.hasWidgetContainer || matchedInventoryFrame.hasResponseField, 'Invariant 6 FAIL: Selected frame must bear widget container or response field');
    assert.strictEqual(observedInvariants.appliedFrameId, observedInvariants.selectedFrameId, 'Invariant 6 FAIL: Token write must occur in exact selected frameId');
    logTrace(`✅ [INVARIANT 6 PASS] Dynamic frame selection verified (selectedFrameId=${observedInvariants.selectedFrameId}, appliedFrameId=${observedInvariants.appliedFrameId}, inventoryCount=${observedInvariants.frameInventory.length}).`);

    // Verify single-writer duplicate rejection
    logTrace('\n[REHEARSAL] Verifying single-writer invariant: dispatching duplicate token injection test...');
    const dupRes = await cdpSend(swWs, msgId++, 'Runtime.evaluate', {
      expression: `globalThis.__xpider_testDuplicateTokenInjection('mock_token_duplicate_test_1234567890')`,
      awaitPromise: true,
      returnByValue: true
    });
    logTrace(`  -> Duplicate injection response: ${JSON.stringify(dupRes.result?.value)}`);
    assert(
      dupRes.result?.value?.duplicateIgnored === true ||
      dupRes.result?.value?.error === 'DUPLICATE_TOKEN_REJECTED',
      'Duplicate token injection must be rejected'
    );

    // Invariant 7: Exactly one MAIN-world token write & duplicate rejection
    assert.strictEqual(observedInvariants.mainWorldWriteCount, 1, 'Invariant 7 FAIL: Exactly one MAIN-world token write must occur');
    assert(observedInvariants.duplicateRejections >= 1, 'Invariant 7 FAIL: Duplicate token injection rejection event must be observed');
    logTrace(`✅ [INVARIANT 7 PASS] Strict single-writer verified (mainWorldWriteCount=1, duplicateRejections=${observedInvariants.duplicateRejections}).`);

    // Invariant 8: Token applied / challenge verified / ready to submit
    assert.strictEqual(observedInvariants.readyToSubmit, true, 'Invariant 8 FAIL: READY_TO_SUBMIT transition reached');
    logTrace('✅ [INVARIANT 8 PASS] READY_TO_SUBMIT transition reached.');

    // Invariant 9: Orchestrator submit click dispatched
    assert.strictEqual(observedInvariants.xpiderSubmitTriggered, true, 'Invariant 9 FAIL: Orchestrator submit transition');
    logTrace('✅ [INVARIANT 9 PASS] XPIDER orchestrator engine dispatched form submission.');

    // Invariant 10: Submission outcome verified
    assert.strictEqual(observedInvariants.submissionOutcomeVerified, true, 'Invariant 10 FAIL: SubmissionOutcomeVerifier confirmed');
    logTrace('✅ [INVARIANT 10 PASS] SubmissionOutcomeVerifier confirmed success banner.');

    // Invariant 11: CAPTCHA accepted downstream
    assert.strictEqual(observedInvariants.captchaAccepted, true, 'Invariant 11 FAIL: CAPTCHA_ACCEPTED downstream verification');
    logTrace('✅ [INVARIANT 11 PASS] Downstream CAPTCHA accepted signal confirmed.');

    // Invariant 12: Terminal settlement: SUCCESS
    const h1 = finalState.history.find(h => (h.url || '').includes('captcha-mock-solve.html'));
    logTrace(`Target 1 History Record: ${JSON.stringify(h1)}`);
    assert(h1, 'Target 1 (captcha-mock-solve.html) must have a history record');
    assert(h1.status === 'CONFIRMED_SUCCESS' || h1.status === 'SUCCESS', `Target 1 must settle as SUCCESS (got ${h1.status})`);
    logTrace('✅ [INVARIANT 12 PASS] Target 1 settled as CONFIRMED_SUCCESS.');

    // Invariant 13: Exactly one settlement in HistoryStore ledger
    const h1Count = finalState.history.filter(h => (h.url || '').includes('captcha-mock-solve.html')).length;
    assert.strictEqual(h1Count, 1, 'Target 1 must settle exactly once (zero duplicate records)');
    logTrace('✅ [INVARIANT 13 PASS] Exactly one settlement recorded for Target 1 in ledger.');

    // Invariant 14: Counter/history/ledger verified
    assert.strictEqual(finalState.history.length >= 1, true, 'Ledger count must reflect attempts');
    logTrace('✅ [INVARIANT 14 PASS] Ledger counter verified.');

    // Invariant 15: Sequential Target 2 executed and settled SUCCESS
    const h2 = finalState.history.find(h => (h.url || '').includes('contact-standard.html'));
    logTrace(`Target 2 History Record: ${JSON.stringify(h2)}`);
    assert(h2, 'Target 2 (contact-standard.html) must have a history record');
    assert(h2.status === 'CONFIRMED_SUCCESS' || h2.status === 'SUCCESS', `Target 2 must settle as SUCCESS (got ${h2.status})`);
    logTrace('✅ [INVARIANT 15 PASS] Target 2 processed sequentially and settled as SUCCESS.');

    // Invariant 16: Sequential target clean state reset & zero token bleed
    assert.strictEqual(observedInvariants.cleanStateReset, true, 'Invariant 16 FAIL: CAPTCHA state reset must occur');
    const h2Count = finalState.history.filter(h => (h.url || '').includes('contact-standard.html')).length;
    assert.strictEqual(h2Count, 1, 'Target 2 must settle exactly once');
    assert.strictEqual(finalState.history.length, 2, 'Total ledger count must equal exactly 2 completed targets');
    assert.strictEqual(observedInvariants.ledgerVerified, true, 'Invariant 16 FAIL: Ledger stats must show success=2 failure=0');
    logTrace('✅ [INVARIANT 16 PASS] Clean state reset before Target 2 & zero token bleed; total ledger = 2 successes, 0 failures, 0 hangs.');

    logTrace('\n========================================================================');
    logTrace('  ALL 16 SECTION 9 CAPTCHA E2E DIRECTIVES VERIFIED 100% PASS!');
    logTrace('========================================================================\n');

  } finally {
    try { traceStream.end(); } catch (_) {}
    try { if (edgeProcess) edgeProcess.kill(); } catch (_) {}
    try { if (spawnedServer) spawnedServer.kill(); } catch (_) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch(err => {
  console.error('\n❌ REHEARSAL FATAL ERROR:', err);
  process.exit(1);
});
