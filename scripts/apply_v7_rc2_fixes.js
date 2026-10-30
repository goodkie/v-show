const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function replaceExact(filePath, target, replacement, label) {
  const content = fs.readFileSync(filePath, 'utf8');
  const normContent = content.replace(/\r\n/g, '\n');
  const normTarget = target.replace(/\r\n/g, '\n');
  const normReplacement = replacement.replace(/\r\n/g, '\n');
  if (normContent.includes(normReplacement)) {
    console.log(`ℹ️ Already patched ${path.basename(filePath)}: ${label}`);
    return;
  }
  if (!normContent.includes(normTarget)) {
    throw new Error(`[${label}] Target not found in ${filePath}`);
  }
  const updated = normContent.replace(normTarget, normReplacement);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`✅ Patched ${path.basename(filePath)}: ${label}`);
}

// 1. Patch extension/content-script.js
const csPath = path.join(ROOT, 'extension', 'content-script.js');
{
  // 1a. Pass pageText, currentUrl, urlChanged into classifyManualResume and support recovered options
  const targetManualResume = `                    const classification = _ChallengeGate
                        ? _ChallengeGate.classifyManualResume({
                            hasPositiveDomSuccess,
                            hasUrlRedirectSuccess,
                            hasServerAck,
                            formStillPresent: !formRemovedOrHidden,
                            operatorClaimedRegistered: true
                        })`;

  const replacementManualResume = `                    const classification = _ChallengeGate
                        ? _ChallengeGate.classifyManualResume({
                            pageText: bodyText,
                            currentUrl,
                            urlChanged,
                            hasPositiveDomSuccess,
                            hasUrlRedirectSuccess,
                            hasServerAck,
                            formStillPresent: !formRemovedOrHidden,
                            operatorClaimedRegistered: true
                        })`;

  replaceExact(csPath, targetManualResume, replacementManualResume, 'classifyManualResume full context');

  // 1b. Post-submit async/invisible challenge check in AUTO mode before verifier.verify
  const targetPostSubmit = `            try { sessionStorage.setItem('xpider_pending_verify', 'true'); } catch(_) {}

            return await verifier.verify(submitOutcome);`;

  const replacementPostSubmit = `            try { sessionStorage.setItem('xpider_pending_verify', 'true'); } catch(_) {}

            // [V7.0.0-RC2 Audit Item 1] If an invisible/enterprise challenge opened an interactive prompt
            // asynchronously upon submit click, transition into CAPTCHA_PENDING_EXTERNAL_USER instead of falsely settling.
            if (_ChallengeGate) {
                const postSubmitChallenge = _ChallengeGate.detectChallenge(document);
                if (postSubmitChallenge && postSubmitChallenge.present && postSubmitChallenge.interactive && !postSubmitChallenge.verified) {
                    logDev(\`🛡️ [V7_ASYNC_CHALLENGE_AFTER_SUBMIT] Interactive challenge (\${postSubmitChallenge.type}) opened after submit click. Entering CAPTCHA_PENDING_EXTERNAL_USER.\`, "warning");
                    const asyncWaitOutcome = await waitForExternalOrUserChallengeV7(form, template, frozenSnapshot, postSubmitChallenge);
                    if (!asyncWaitOutcome || !asyncWaitOutcome.resolved) {
                        verifier.cleanup();
                        return false;
                    }
                    let postAsyncIntegrity = verifyFieldIntegrity(form, frozenSnapshot, template);
                    if (!postAsyncIntegrity || postAsyncIntegrity.intact === false) {
                        restoreFrozenSnapshot(form, frozenSnapshot);
                    }
                    submitOutcome = await executeSubmitStateMachine(form, template, { expectedSnapshot: frozenSnapshot, allowVisionSubmit: true });
                }
            }

            return await verifier.verify(submitOutcome);`;

  replaceExact(csPath, targetPostSubmit, replacementPostSubmit, 'post-submit async challenge gate');

  // 1c. Support recovered initialHoldUrl in handleV7ManualModeHold + Content Script restart hold recovery
  const targetHoldSig = `    async function handleV7ManualModeHold(form, template, frozenSnapshot, initialChallengeInfo) {
        const sendFn = (typeof window !== 'undefined' && window.__xpider_sendExecutionMessage) ||
            (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage ? chrome.runtime.sendMessage.bind(chrome.runtime) : null);

        const initialHoldUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';`;

  const replacementHoldSig = `    async function handleV7ManualModeHold(form, template, frozenSnapshot, initialChallengeInfo, holdOptions = {}) {
        const sendFn = (typeof window !== 'undefined' && window.__xpider_sendExecutionMessage) ||
            (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage ? chrome.runtime.sendMessage.bind(chrome.runtime) : null);

        const initialHoldUrl = (holdOptions && holdOptions.originalUrl)
            ? holdOptions.originalUrl
            : ((typeof window !== 'undefined' && window.location) ? window.location.href : '');`;

  replaceExact(csPath, targetHoldSig, replacementHoldSig, 'handleV7ManualModeHold holdOptions.originalUrl');
}

// 2. Patch extension/background.js
const bgPath = path.join(ROOT, 'extension', 'background.js');
{
  // 2a. Persist xpider_v7_active_hold_state on CAPTCHA_PENDING_EXTERNAL_USER and MANUAL_MODE_HOLD, clear on resume
  const targetBgHoldCases = `        case 'GET_CAMPAIGN_MODE':
            sendResponse({
                success: true,
                campaignMode: campaignState.campaignMode || 'AUTO',
                currentTargetStage: campaignState.currentTargetStage || null,
                manualHoldActive: Boolean(campaignState.manualHoldActive),
                externalCaptchaWaitActive: Boolean(campaignState.externalCaptchaWaitActive)
            });
            return true;

        case 'CAPTCHA_PENDING_EXTERNAL_USER': {
            const validation = validateActiveExecution(request, sender, 'CAPTCHA_PENDING_EXTERNAL_USER', { allowBodyTabId: true });
            if (!validation.valid) {
                sendResponse({ success: false, reason: validation.reason, stale: true });
                return true;
            }
            campaignState.currentTargetStage = 'CAPTCHA_PENDING_EXTERNAL_USER';
            campaignState.externalCaptchaWaitActive = true;
            if (campaignState.targetDeadlineController) {
                campaignState.targetDeadlineController.pause('CAPTCHA_PENDING_EXTERNAL_USER');
            }
            if (campaignState.activeTimeoutId) {
                clearTimeout(campaignState.activeTimeoutId);
                campaignState.activeTimeoutId = null;
            }
            if (chrome.alarms && campaignState.sessionId) {
                chrome.alarms.clear(\`xpider_timeout_\${campaignState.sessionId}\`);
            }
            const tabId = sender?.tab?.id || campaignState.currentTabId;
            logBg(tabId, \`[CAPTCHA_PENDING_EXTERNAL_USER] tabId=\${tabId} challengeType=\${request.challengeType || 'unknown'} deadlinePaused=true tabRetained=true\`, 'info');
            chrome.runtime.sendMessage({
                action: 'V7_TARGET_HOLD_STATE',
                state: 'CAPTCHA_PENDING_EXTERNAL_USER',
                challengeType: request.challengeType || 'unknown',
                targetUrl: request.url || campaignState.currentAttempt?.url || '',
                tabId
            }).catch(() => {});
            sendResponse({ success: true, state: 'CAPTCHA_PENDING_EXTERNAL_USER', deadlinePaused: true, tabRetained: true });
            return true;
        }

        case 'CAPTCHA_EXTERNAL_VERIFIED_RESUME': {
            campaignState.externalCaptchaWaitActive = false;
            campaignState.currentTargetStage = 'CAPTCHA_VERIFIED_SUBMITTING';
            if (campaignState.targetDeadlineController) {
                campaignState.targetDeadlineController.resume();
            }
            const tabId = sender?.tab?.id || campaignState.currentTabId;
            logBg(tabId, \`[CAPTCHA_EXTERNAL_VERIFIED_RESUME] tabId=\${tabId} method=\${request.verificationMethod || 'dom_verified'} deadlineResumed=true\`, 'success');
            sendResponse({ success: true, state: 'CAPTCHA_VERIFIED_SUBMITTING' });
            return true;
        }

        case 'MANUAL_MODE_HOLD': {
            const validation = validateActiveExecution(request, sender, 'MANUAL_MODE_HOLD', { allowBodyTabId: true });
            if (!validation.valid) {
                sendResponse({ success: false, reason: validation.reason, stale: true });
                return true;
            }
            campaignState.currentTargetStage = 'MANUAL_HOLD';
            campaignState.manualHoldActive = true;
            if (campaignState.targetDeadlineController) {
                campaignState.targetDeadlineController.pause('MANUAL_HOLD');
            }
            if (campaignState.activeTimeoutId) {
                clearTimeout(campaignState.activeTimeoutId);
                campaignState.activeTimeoutId = null;
            }
            if (chrome.alarms && campaignState.sessionId) {
                chrome.alarms.clear(\`xpider_timeout_\${campaignState.sessionId}\`);
            }
            const tabId = sender?.tab?.id || campaignState.currentTabId;
            logBg(tabId, \`[MANUAL_MODE_HOLD] tabId=\${tabId} url=\${request.url || campaignState.currentAttempt?.url || ''} challengeStatus=\${request.challengeStatus || 'NONE'} deadlinePaused=true tabRetained=true\`, 'info');
            chrome.runtime.sendMessage({
                action: 'V7_TARGET_HOLD_STATE',
                state: 'MANUAL_HOLD',
                challengeStatus: request.challengeStatus || 'NONE',
                targetUrl: request.url || campaignState.currentAttempt?.url || '',
                tabId
            }).catch(() => {});
            sendResponse({ success: true, state: 'MANUAL_HOLD', deadlinePaused: true, tabRetained: true });
            return true;
        }`;

  const replacementBgHoldCases = `        case 'GET_CAMPAIGN_MODE': {
            const callerTabId = sender && sender.tab ? sender.tab.id : (request.tabId || null);
            const isCurrentHoldTab = Boolean(callerTabId && callerTabId === campaignState.currentTabId && (campaignState.manualHoldActive || campaignState.externalCaptchaWaitActive));
            sendResponse({
                success: true,
                campaignMode: campaignState.campaignMode || 'AUTO',
                manualHoldActive: Boolean(campaignState.manualHoldActive),
                externalCaptchaWaitActive: Boolean(campaignState.externalCaptchaWaitActive),
                isCurrentHoldTab,
                activeHoldState: isCurrentHoldTab ? {
                    active: true,
                    stage: campaignState.currentTargetStage,
                    tabId: campaignState.currentTabId,
                    url: campaignState.currentAttempt?.url || '',
                    campaignMode: campaignState.campaignMode || 'AUTO',
                    executionIdentity: {
                        tabId: campaignState.currentTabId,
                        attemptId: campaignState.currentAttempt?.attemptId || null,
                        targetToken: campaignState.currentTargetToken || null,
                        campaignRunId: campaignState.campaignRunId || null,
                        sessionId: campaignState.sessionId || 0
                    }
                } : null
            });
            return true;
        }

        case 'CAPTCHA_PENDING_EXTERNAL_USER': {
            const validation = validateActiveExecution(request, sender, 'CAPTCHA_PENDING_EXTERNAL_USER', { allowBodyTabId: true });
            if (!validation.valid) {
                sendResponse({ success: false, reason: validation.reason, stale: true });
                return true;
            }
            campaignState.currentTargetStage = 'CAPTCHA_PENDING_EXTERNAL_USER';
            campaignState.externalCaptchaWaitActive = true;
            if (campaignState.targetDeadlineController) {
                campaignState.targetDeadlineController.pause('CAPTCHA_PENDING_EXTERNAL_USER');
            }
            if (campaignState.activeTimeoutId) {
                clearTimeout(campaignState.activeTimeoutId);
                campaignState.activeTimeoutId = null;
            }
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({
                    xpider_v7_active_hold_state: {
                        active: true,
                        stage: 'CAPTCHA_PENDING_EXTERNAL_USER',
                        tabId: validation.resolvedTabId,
                        url: campaignState.currentAttempt?.url || request.url || '',
                        attemptId: campaignState.currentAttempt?.attemptId || null,
                        targetToken: campaignState.currentTargetToken || null,
                        campaignRunId: campaignState.campaignRunId || null,
                        campaignMode: campaignState.campaignMode || 'AUTO',
                        heldAt: Date.now()
                    }
                }).catch(() => {});
            }
            logBg(validation.resolvedTabId, \`⏳ [V7_EXTERNAL_CAPTCHA_WAIT] Challenge detected (\${request.challengeType || 'unknown'}). Pausing target deadline and awaiting external/user verification.\`, 'warning');
            sendResponse({ success: true, state: 'CAPTCHA_PENDING_EXTERNAL_USER', deadlinePaused: true });
            return true;
        }

        case 'CAPTCHA_EXTERNAL_VERIFIED_RESUME': {
            const validation = validateActiveExecution(request, sender, 'CAPTCHA_EXTERNAL_VERIFIED_RESUME', { allowBodyTabId: true });
            if (!validation.valid) {
                sendResponse({ success: false, reason: validation.reason, stale: true });
                return true;
            }
            campaignState.externalCaptchaWaitActive = false;
            campaignState.currentTargetStage = 'CAPTCHA_VERIFIED_SUBMITTING';
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove('xpider_v7_active_hold_state').catch(() => {});
            }
            if (campaignState.targetDeadlineController) {
                campaignState.targetDeadlineController.resume();
            }
            logBg(validation.resolvedTabId, \`✅ [V7_EXTERNAL_CAPTCHA_VERIFIED] External/user challenge verified via \${request.verificationMethod || 'dom_verified'} deadlineResumed=true\`, 'success');
            sendResponse({ success: true, state: 'CAPTCHA_VERIFIED_SUBMITTING' });
            return true;
        }

        case 'MANUAL_MODE_HOLD': {
            const validation = validateActiveExecution(request, sender, 'MANUAL_MODE_HOLD', { allowBodyTabId: true });
            if (!validation.valid) {
                sendResponse({ success: false, reason: validation.reason, stale: true });
                return true;
            }
            campaignState.currentTargetStage = 'MANUAL_HOLD';
            campaignState.manualHoldActive = true;
            if (campaignState.targetDeadlineController) {
                campaignState.targetDeadlineController.pause('MANUAL_HOLD');
            }
            if (campaignState.activeTimeoutId) {
                clearTimeout(campaignState.activeTimeoutId);
                campaignState.activeTimeoutId = null;
            }
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({
                    xpider_v7_active_hold_state: {
                        active: true,
                        stage: 'MANUAL_HOLD',
                        tabId: validation.resolvedTabId,
                        url: campaignState.currentAttempt?.url || request.url || '',
                        attemptId: campaignState.currentAttempt?.attemptId || null,
                        targetToken: campaignState.currentTargetToken || null,
                        campaignRunId: campaignState.campaignRunId || null,
                        campaignMode: campaignState.campaignMode || 'MANUAL',
                        heldAt: Date.now()
                    }
                }).catch(() => {});
            }
            logBg(validation.resolvedTabId, \`🖐️ [V7_MANUAL_MODE_HOLD] Form prepared on \${request.url || ''}. Holding campaign queue for manual operator action.\`, 'info');
            sendResponse({ success: true, state: 'MANUAL_HOLD', deadlinePaused: true });
            return true;
        }

        case 'AUTO_SOLVE_CAPTCHA':
        case 'POLL_2CAPTCHA':
        case 'NOPECHA_SOLVE': {
            sendResponse({ success: false, error: 'INTERNAL_SOLVER_RETIRED_V7', reasonCode: 'INTERNAL_SOLVER_RETIRED_V7' });
            return true;
        }

        case 'CHECK_STAGE0_RECOVERY_AVAILABLE': {
            (async () => {
                try {
                    const st = await chrome.storage.local.get(['xpider_total', 'xpider_queue', 'xpider_saved_lists', 'xpider_paused_checkpoint']);
                    const hasQueue = (Array.isArray(st.xpider_queue) && st.xpider_queue.length > 0) ||
                        (st.xpider_paused_checkpoint && Array.isArray(st.xpider_paused_checkpoint.remainingQueue) && st.xpider_paused_checkpoint.remainingQueue.length > 0);
                    const hasLists = Array.isArray(st.xpider_saved_lists) && st.xpider_saved_lists.length > 0;
                    if (hasQueue || hasLists || Number(st.xpider_total) > 0) {
                        sendResponse({ success: true, recoveryNeeded: false, reason: 'STORAGE_NOT_EMPTY' });
                        return;
                    }
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (pg && !pg.ephemeralRelayToken && typeof pg.fetchRelayControlToken === 'function') {
                        try { await pg.fetchRelayControlToken(); } catch (_) {}
                    }
                    const token = pg ? pg.ephemeralRelayToken : null;
                    const ctrlPort = (pg && pg.config && pg.config.relayControlPort) || 18989;
                    const resp = await fetch(\`http://127.0.0.1:\${ctrlPort}/storage-recovery/stage0-snapshot\`, {
                        method: 'GET',
                        headers: token ? { 'Authorization': \`Bearer \${token}\` } : {}
                    });
                    if (!resp.ok) {
                        sendResponse({ success: false, recoveryNeeded: false, reason: 'COMPANION_SNAPSHOT_UNAVAILABLE' });
                        return;
                    }
                    const data = await resp.json();
                    if (data && data.available && data.snapshot && data.snapshot.summary) {
                        sendResponse({
                            success: true,
                            recoveryNeeded: true,
                            summary: data.snapshot.summary
                        });
                    } else {
                        sendResponse({ success: false, recoveryNeeded: false });
                    }
                } catch (err) {
                    sendResponse({ success: false, recoveryNeeded: false, error: err.message });
                }
            })();
            return true;
        }

        case 'RESTORE_STAGE0_AUTHORITATIVE_SNAPSHOT': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (pg && !pg.ephemeralRelayToken && typeof pg.fetchRelayControlToken === 'function') {
                        try { await pg.fetchRelayControlToken(); } catch (_) {}
                    }
                    const token = pg ? pg.ephemeralRelayToken : null;
                    const ctrlPort = (pg && pg.config && pg.config.relayControlPort) || 18989;
                    const resp = await fetch(\`http://127.0.0.1:\${ctrlPort}/storage-recovery/stage0-snapshot\`, {
                        method: 'GET',
                        headers: token ? { 'Authorization': \`Bearer \${token}\` } : {}
                    });
                    if (!resp.ok) {
                        sendResponse({ success: false, error: \`HTTP_\${resp.status}\` });
                        return;
                    }
                    const data = await resp.json();
                    if (!data || !data.available || !data.snapshot || !data.snapshot.payload) {
                        sendResponse({ success: false, error: 'STAGE0_PAYLOAD_MISSING' });
                        return;
                    }
                    // 1. Save lossless pre-restore backup of current storage
                    const currentAll = await chrome.storage.local.get(null);
                    const preBackupKey = \`xpider_pre_stage0_restore_backup_\${Date.now()}\`;
                    await chrome.storage.local.set({ [preBackupKey]: currentAll });

                    // 2. Write authoritative 97/92 Stage 0 payload
                    const payload = data.snapshot.payload;
                    await chrome.storage.local.set(payload);

                    // 3. Re-hydrate in-memory campaignState and HistoryStore
                    const hs = await getHistoryStoreInstance();
                    if (hs && typeof hs.load === 'function') {
                        await hs.load();
                    }
                    if (payload.xpider_paused_checkpoint) {
                        campaignState.pausedCheckpoint = payload.xpider_paused_checkpoint;
                        campaignState.isPaused = true;
                        campaignState.isActive = false;
                        campaignState.queue = [...(payload.xpider_paused_checkpoint.remainingQueue || payload.xpider_queue || [])];
                        campaignState.totalTargets = payload.xpider_total || 97;
                        campaignState.visitedUrls = Array.isArray(payload.xpider_visited) ? [...payload.xpider_visited] : [];
                        campaignState.template = payload.xpider_tpl || null;
                        campaignState.campaignRunId = payload.xpider_active_campaign_run_id || payload.xpider_paused_checkpoint.campaignRunId;
                    }
                    if (hs) {
                        await syncCampaignCountersFromLedger(hs);
                    }
                    logBg(null, \`♻️ [STAGE0_RESTORE] Restored authoritative 97/92 Stage-0 snapshot (\${Object.keys(payload).length} keys, preBackup=\${preBackupKey})\`, 'success');
                    sendResponse({
                        success: true,
                        preBackupKey,
                        summary: data.snapshot.summary
                    });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;
        }`;

  replaceExact(bgPath, targetBgHoldCases, replacementBgHoldCases, 'background hold persistence + Stage-0 recovery handlers');

  // 2b. Retain held tab on PAUSE_CAMPAIGN / STOP_CAMPAIGN when in CAPTCHA_PENDING_EXTERNAL_USER or MANUAL_HOLD
  const targetTabRetain = `    if (tabId === campaignState.currentTabId &&
        (campaignState.currentTargetStage === 'CAPTCHA_PENDING_EXTERNAL_USER' || campaignState.currentTargetStage === 'MANUAL_HOLD') &&
        reason !== 'PAUSE_CAMPAIGN' && reason !== 'END_CAMPAIGN' && reason !== 'ABORTED') {`;

  const replacementTabRetain = `    if (tabId === campaignState.currentTabId &&
        (campaignState.currentTargetStage === 'CAPTCHA_PENDING_EXTERNAL_USER' || campaignState.currentTargetStage === 'MANUAL_HOLD' || campaignState.manualHoldActive || campaignState.externalCaptchaWaitActive) &&
        reason !== 'END_CAMPAIGN' && reason !== 'ABORTED') {`;

  replaceExact(bgPath, targetTabRetain, replacementTabRetain, 'closeOwnedTabVerified retain held tab on PAUSE_CAMPAIGN');

  // 2c. In pauseCampaignOrchestrator, keep held tab open when pausing during MANUAL_HOLD or CAPTCHA_PENDING_EXTERNAL_USER
  const targetPauseClose = `    // [Issue #6 R6.9E B5] 5. ONLY THEN close campaign tabs
    await closeAllCampaignTabsExcept(null, 'PAUSE_CAMPAIGN');`;

  const replacementPauseClose = `    // [Issue #6 R6.9E B5 & V7.0.0-RC2 Audit Item 2] 5. Close campaign tabs EXCEPT held tab if in MANUAL_HOLD or CAPTCHA_PENDING_EXTERNAL_USER
    const wasInV7Hold = Boolean(inFlightStage === 'MANUAL_HOLD' || inFlightStage === 'CAPTCHA_PENDING_EXTERNAL_USER' || campaignState.manualHoldActive || campaignState.externalCaptchaWaitActive);
    const retainTabOnPause = wasInV7Hold ? campaignState.currentTabId : null;
    await closeAllCampaignTabsExcept(retainTabOnPause, 'PAUSE_CAMPAIGN');
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove('xpider_v7_active_hold_state').catch(() => {});
    }`;

  replaceExact(bgPath, targetPauseClose, replacementPauseClose, 'pauseCampaignOrchestrator retain held tab');

  // 2d. In SW boot restoration, read xpider_v7_active_hold_state & xpider_campaign_mode and prevent premature next-target advance
  const targetSwBootGet = `                'xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_active_campaign_run_id',
                'xpider_owner_function_test_mode', 'xpider_owner_function_test_mode_active'
            ], async (data) => {`;

  const replacementSwBootGet = `                'xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_active_campaign_run_id',
                'xpider_owner_function_test_mode', 'xpider_owner_function_test_mode_active',
                'xpider_v7_active_hold_state', 'xpider_campaign_mode'
            ], async (data) => {`;

  replaceExact(bgPath, targetSwBootGet, replacementSwBootGet, 'SW boot storage keys');

  const targetSwBootAttempt = `                    // [v1.2.0 Delivery Protection on SW Restart]
                    let visited = Array.isArray(data.xpider_visited) ? [...data.xpider_visited] : [];
                    if (data.xpider_currentAttempt) {`;

  const replacementSwBootAttempt = `                    // [v1.2.0 Delivery Protection on SW Restart + V7.0.0-RC2 Hold State Preservation]
                    const v7HoldState = (data.xpider_v7_active_hold_state && data.xpider_v7_active_hold_state.active) ? data.xpider_v7_active_hold_state : null;
                    if (data.xpider_campaign_mode === 'MANUAL' || data.xpider_campaign_mode === 'AUTO') {
                        campaignState.campaignMode = data.xpider_campaign_mode;
                    }
                    let visited = Array.isArray(data.xpider_visited) ? [...data.xpider_visited] : [];
                    if (data.xpider_currentAttempt && !v7HoldState) {`;

  replaceExact(bgPath, targetSwBootAttempt, replacementSwBootAttempt, 'SW boot preserve currentAttempt during v7HoldState');

  const targetSwBootLoop = `                        logBg(null, \`Restored previous active campaign: \${campaignState.queue.length} targets remaining.\`, "info");
                        
                        if (!campaignState.isLoopRunning) processNextCampaignTarget(campaignState.sessionId);`;

  const replacementSwBootLoop = `                        if (v7HoldState) {
                            campaignState.currentAttempt = data.xpider_currentAttempt || null;
                            campaignState.currentTabId = v7HoldState.tabId || null;
                            campaignState.targetTabId = v7HoldState.tabId || null;
                            campaignState.currentTargetToken = v7HoldState.targetToken || null;
                            campaignState.currentTargetStage = v7HoldState.stage;
                            campaignState.campaignMode = v7HoldState.campaignMode || campaignState.campaignMode || 'AUTO';
                            campaignState.manualHoldActive = (v7HoldState.stage === 'MANUAL_HOLD');
                            campaignState.externalCaptchaWaitActive = (v7HoldState.stage === 'CAPTCHA_PENDING_EXTERNAL_USER');
                            campaignState.activeTargetInFlight = true;
                            if (v7HoldState.tabId) campaignOwnedTabIds.add(v7HoldState.tabId);
                            logBg(v7HoldState.tabId, \`🛡️ [V7_SW_RESTART_HOLD_PRESERVED] Restored active \${v7HoldState.stage} on tabId=\${v7HoldState.tabId} without closing tab or advancing queue.\`, "info");
                        } else {
                            logBg(null, \`Restored previous active campaign: \${campaignState.queue.length} targets remaining.\`, "info");
                            if (!campaignState.isLoopRunning) processNextCampaignTarget(campaignState.sessionId);
                        }`;

  replaceExact(bgPath, targetSwBootLoop, replacementSwBootLoop, 'SW boot hold state guard against advancing queue');
}

// 3. Patch extension/popup.html
const popupHtmlPath = path.join(ROOT, 'extension', 'popup.html');
{
  const targetBanner = `            <div id="build-mismatch-banner" class="alert-danger" style="display: none; color: #ff4d4f; background: rgba(255, 77, 79, 0.15); border: 1px solid #ff4d4f; padding: 8px 12px; border-radius: 6px; margin: 8px 0; font-weight: bold; text-align: center; font-size: 12px; letter-spacing: 0.5px;">
                ⚠️ RUNTIME BUILD MISMATCH — RELOAD EXTENSION
            </div>`;

  const replacementBanner = `            <div id="build-mismatch-banner" class="alert-danger" style="display: none; color: #ff4d4f; background: rgba(255, 77, 79, 0.15); border: 1px solid #ff4d4f; padding: 8px 12px; border-radius: 6px; margin: 8px 0; font-weight: bold; text-align: center; font-size: 12px; letter-spacing: 0.5px;">
                ⚠️ RUNTIME BUILD MISMATCH — RELOAD EXTENSION
            </div>
            <div id="v7-stage0-recovery-banner" style="display: none; background: rgba(234, 179, 8, 0.16); border: 1px solid #eab308; padding: 10px 12px; border-radius: 6px; margin: 8px 0; text-align: left; font-size: 11px;">
                <div style="font-weight: 700; color: #fde047; margin-bottom: 4px;">♻️ Stage-0 Campaign Backup Available (97 Total / 92 Remaining)</div>
                <div id="v7-stage0-recovery-desc" style="color: #e2e8f0; margin-bottom: 8px; line-height: 1.35;">Unpacked storage was reset when switching extension folders. Click below to losslessly restore your saved 97-URL list, 92-remaining checkpoint, 198 history rows, and 22 collected emails.</div>
                <button type="button" id="v7-stage0-restore-btn" style="width: 100%; background: linear-gradient(135deg, #eab308, #ca8a04); color: #0f172a; font-weight: 800; font-size: 11px; padding: 7px 10px; border-radius: 5px; border: none; cursor: pointer;">♻️ Restore Stage-0 97/92 Campaign Snapshot Now</button>
            </div>`;

  replaceExact(popupHtmlPath, targetBanner, replacementBanner, 'popup.html Stage-0 recovery banner');
}

// 4. Patch extension/popup.js
const popupJsPath = path.join(ROOT, 'extension', 'popup.js');
{
  const targetEgressUi = `            const isRouteVerified = routeStatus === 'VERIFIED' || bExit.status === 'BROWSER_VERIFIED';
            const isDegraded = routeStatus === 'DEGRADED' || bExit.status === 'COMPANION_PROBE_ONLY' || bExit.status === 'CANARY_FAILED';`;

  const replacementEgressUi = `            const isRouteVerified = routeStatus === 'VERIFIED' && bExit.status === 'BROWSER_VERIFIED';
            const isDegraded = routeStatus !== 'VERIFIED' || bExit.status === 'COMPANION_PROBE_ONLY' || bExit.status === 'CANARY_FAILED' || bExit.status === 'PROXY_NOT_ENFORCED' || bExit.status === 'DO_NODE_ONLY_NOT_DECODO';`;

  replaceExact(popupJsPath, targetEgressUi, replacementEgressUi, 'popup.js updateEgressIpMonitorUI route verification truthfulness');

  // Add Stage-0 Recovery check & button listener at end of popup.js DOMContentLoaded or file
  const popContent = fs.readFileSync(popupJsPath, 'utf8');
  if (!popContent.includes('v7-stage0-restore-btn')) {
    const stage0UiCode = `
// [V7.0.0-RC2] Lossless Stage-0 97/92 Snapshot Recovery Banner Controller (No Silent Rebase)
if (typeof document !== 'undefined') {
    const checkStage0RecoveryBanner = () => {
        const banner = document.getElementById('v7-stage0-recovery-banner');
        const restoreBtn = document.getElementById('v7-stage0-restore-btn');
        const descEl = document.getElementById('v7-stage0-recovery-desc');
        if (!banner || !restoreBtn) return;

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'CHECK_STAGE0_RECOVERY_AVAILABLE' }, (res) => {
                if (res && res.success && res.recoveryNeeded && res.summary) {
                    banner.style.display = 'block';
                    if (descEl) {
                        descEl.textContent = \`Storage reset detected. Stage-0 Backup ready: \${res.summary.total} Total / \${res.summary.remaining} Remaining / \${res.summary.completed} Completed / \${res.summary.historyRowsCount} History Rows / \${res.summary.collectedEmailsCount} Emails.\`;
                    }
                } else {
                    banner.style.display = 'none';
                }
            });

            restoreBtn.onclick = () => {
                restoreBtn.disabled = true;
                restoreBtn.textContent = '⏳ Restoring Stage-0 97/92 Snapshot...';
                chrome.runtime.sendMessage({ action: 'RESTORE_STAGE0_AUTHORITATIVE_SNAPSHOT' }, (res) => {
                    if (res && res.success) {
                        banner.style.background = 'rgba(34, 197, 94, 0.2)';
                        banner.style.borderColor = '#22c55e';
                        restoreBtn.textContent = '✅ Restored 97/92 Snapshot! Reloading UI...';
                        setTimeout(() => {
                            window.location.reload();
                        }, 600);
                    } else {
                        restoreBtn.disabled = false;
                        restoreBtn.textContent = '⚠️ Restore Failed — Click to Retry';
                    }
                });
            };
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(checkStage0RecoveryBanner, 350));
    } else {
        setTimeout(checkStage0RecoveryBanner, 350);
    }
}
`;
    fs.writeFileSync(popupJsPath, popContent + '\n' + stage0UiCode, 'utf8');
    console.log('✅ Appended Stage-0 recovery banner controller to popup.js');
  }
}
