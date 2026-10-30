/**
 * scripts/apply_v7_stage1.js
 * Applies Stage 1 Major Update (Dual Start Modes + Internal CAPTCHA Solver Retirement)
 * across extension/background.js, extension/content-script.js, extension/popup.html, and extension/popup.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function replaceExact(content, target, replacement, label) {
    if (content.includes(target)) {
        return content.replace(target, replacement);
    }
    // Try CRLF-normalized match
    const targetCrlf = target.replace(/\r?\n/g, '\r\n');
    const replacementCrlf = replacement.replace(/\r?\n/g, '\r\n');
    if (content.includes(targetCrlf)) {
        return content.replace(targetCrlf, replacementCrlf);
    }
    const targetLf = target.replace(/\r?\n/g, '\n');
    const replacementLf = replacement.replace(/\r?\n/g, '\n');
    if (content.includes(targetLf)) {
        return content.replace(targetLf, replacementLf);
    }
    throw new Error(`[apply_v7_stage1] Target not found for: ${label}`);
}

// ============================================================================
// 1. Patch extension/background.js
// ============================================================================
function patchBackgroundJs() {
    const filePath = path.join(ROOT, 'extension', 'background.js');
    let src = fs.readFileSync(filePath, 'utf8');

    // 1A. Add campaignMode & hold flags to campaignState
    src = replaceExact(
        src,
        `    isActive: false,\n    queue: [],\n    template: null,\n    campaignRunId: null,`,
        `    isActive: false,\n    campaignMode: 'AUTO', // [v7.0 Dual Mode] 'AUTO' | 'MANUAL'\n    manualHoldActive: false,\n    externalCaptchaWaitActive: false,\n    queue: [],\n    template: null,\n    campaignRunId: null,`,
        'background.js: campaignState init'
    );

    // 1B. Add JGMMA tab retention guard in closeOwnedTabVerified
    src = replaceExact(
        src,
        `async function closeOwnedTabVerified(tabId, reason = 'TARGET_FINAL') {\n    if (!tabId) return true;`,
        `async function closeOwnedTabVerified(tabId, reason = 'TARGET_FINAL') {\n    if (!tabId) return true;\n    if (tabId === campaignState.currentTabId &&\n        (campaignState.currentTargetStage === 'CAPTCHA_PENDING_EXTERNAL_USER' || campaignState.currentTargetStage === 'MANUAL_HOLD') &&\n        reason !== 'PAUSE_CAMPAIGN' && reason !== 'END_CAMPAIGN' && reason !== 'ABORTED') {\n        console.warn(\`[JGMMA_TAB_RETENTION_GUARD] Refusing to close active tabId=\${tabId} while stage=\${campaignState.currentTargetStage} (reason=\${reason})\`);\n        logBg(tabId, \`[JGMMA_TAB_RETENTION_GUARD] Refusing to close active tabId=\${tabId} while stage=\${campaignState.currentTargetStage}\`, 'warning');\n        return false;\n    }`,
        'background.js: JGMMA tab retention guard'
    );

    // 1C. Retire handleSolveCaptchaInternal active provider solving in v7
    src = replaceExact(
        src,
        `        async function handleSolveCaptchaInternal(request, sender, sendResponse) {\n            try {\n                const curEpoch = campaignState.captchaEpoch || 1;`,
        `        async function handleSolveCaptchaInternal(request, sender, sendResponse) {\n            try {\n                // [v7.0 Directive #6514763285] Internal API-based CAPTCHA solving is retired.\n                if (!campaignState.ownerFunctionTestMode || request.source !== 'LEGACY_LAB_OVERRIDE') {\n                    logBg(null, '[SOLVER_RETIRED_V7] Internal API solver is retired in v7. Returning INTERNAL_SOLVER_RETIRED_V7.', 'info');\n                    const retiredRes = { success: false, error: 'INTERNAL_SOLVER_RETIRED_V7', retired: true };\n                    if (typeof sendResponse === 'function') sendResponse(retiredRes);\n                    return retiredRes;\n                }\n                const curEpoch = campaignState.captchaEpoch || 1;`,
        'background.js: retire handleSolveCaptchaInternal'
    );

    // 1D. Pass campaignMode in START_CAMPAIGN -> startCampaignOrchestrator
    src = replaceExact(
        src,
        `                    await startCampaignOrchestrator(request.queue, request.template, request.delayMs, request.fillDelayMs, request.submitDelayMs, {\n                        skipPreviouslyAttempted: request.skipPreviouslyAttempted,\n                        overrideSkipAttempted: request.overrideSkipAttempted,\n                        ownerFunctionTestMode: isTestMode,\n                        ownerTestSource: request.source || null,\n                        campaignRunId: assignedRunId,\n                        targetTimeoutMs: request.targetTimeoutMs || request.options?.targetTimeoutMs\n                    });`,
        `                    const resolvedMode = (request.campaignMode === 'MANUAL' || request.options?.campaignMode === 'MANUAL') ? 'MANUAL' : 'AUTO';\n                    campaignState.campaignMode = resolvedMode;\n                    try { await chrome.storage.local.set({ xpider_campaign_mode: resolvedMode }); } catch (_) {}\n                    await startCampaignOrchestrator(request.queue, request.template, request.delayMs, request.fillDelayMs, request.submitDelayMs, {\n                        skipPreviouslyAttempted: request.skipPreviouslyAttempted,\n                        overrideSkipAttempted: request.overrideSkipAttempted,\n                        ownerFunctionTestMode: isTestMode,\n                        ownerTestSource: request.source || null,\n                        campaignRunId: assignedRunId,\n                        campaignMode: resolvedMode,\n                        targetTimeoutMs: request.targetTimeoutMs || request.options?.targetTimeoutMs\n                    });`,
        'background.js: START_CAMPAIGN campaignMode'
    );

    // 1E. Retire PERFORM_TRANSCRIPTION and add v7 Dual Mode message handlers
    src = replaceExact(
        src,
        `        case 'PERFORM_TRANSCRIPTION':\n            handleTranscription(request.audioData, request.url, sendResponse);\n            return true;`,
        `        case 'PERFORM_TRANSCRIPTION':\n            logBg(null, '[SOLVER_RETIRED_V7] Audio STT transcription retired in v7.', 'info');\n            sendResponse({ success: false, error: 'INTERNAL_SOLVER_RETIRED_V7', retired: true });\n            return true;\n\n        case 'GET_CAMPAIGN_MODE':\n            sendResponse({\n                success: true,\n                campaignMode: campaignState.campaignMode || 'AUTO',\n                currentTargetStage: campaignState.currentTargetStage || null,\n                manualHoldActive: Boolean(campaignState.manualHoldActive),\n                externalCaptchaWaitActive: Boolean(campaignState.externalCaptchaWaitActive)\n            });\n            return true;\n\n        case 'CAPTCHA_PENDING_EXTERNAL_USER': {\n            const validation = validateActiveExecution(request, sender, 'CAPTCHA_PENDING_EXTERNAL_USER', { allowBodyTabId: true });\n            if (!validation.valid) {\n                sendResponse({ success: false, reason: validation.reason, stale: true });\n                return true;\n            }\n            campaignState.currentTargetStage = 'CAPTCHA_PENDING_EXTERNAL_USER';\n            campaignState.externalCaptchaWaitActive = true;\n            if (campaignState.targetDeadlineController) {\n                campaignState.targetDeadlineController.pause('CAPTCHA_PENDING_EXTERNAL_USER');\n            }\n            if (campaignState.activeTimeoutId) {\n                clearTimeout(campaignState.activeTimeoutId);\n                campaignState.activeTimeoutId = null;\n            }\n            if (chrome.alarms && campaignState.sessionId) {\n                chrome.alarms.clear(\`xpider_timeout_\${campaignState.sessionId}\`);\n            }\n            const tabId = sender?.tab?.id || campaignState.currentTabId;\n            logBg(tabId, \`[CAPTCHA_PENDING_EXTERNAL_USER] tabId=\${tabId} challengeType=\${request.challengeType || 'unknown'} deadlinePaused=true tabRetained=true\`, 'info');\n            chrome.runtime.sendMessage({\n                action: 'V7_TARGET_HOLD_STATE',\n                state: 'CAPTCHA_PENDING_EXTERNAL_USER',\n                challengeType: request.challengeType || 'unknown',\n                targetUrl: request.url || campaignState.currentAttempt?.url || '',\n                tabId\n            }).catch(() => {});\n            sendResponse({ success: true, state: 'CAPTCHA_PENDING_EXTERNAL_USER', deadlinePaused: true, tabRetained: true });\n            return true;\n        }\n\n        case 'CAPTCHA_EXTERNAL_VERIFIED_RESUME': {\n            campaignState.externalCaptchaWaitActive = false;\n            campaignState.currentTargetStage = 'CAPTCHA_VERIFIED_SUBMITTING';\n            if (campaignState.targetDeadlineController) {\n                campaignState.targetDeadlineController.resume();\n            }\n            const tabId = sender?.tab?.id || campaignState.currentTabId;\n            logBg(tabId, \`[CAPTCHA_EXTERNAL_VERIFIED_RESUME] tabId=\${tabId} method=\${request.verificationMethod || 'dom_verified'} deadlineResumed=true\`, 'success');\n            sendResponse({ success: true, state: 'CAPTCHA_VERIFIED_SUBMITTING' });\n            return true;\n        }\n\n        case 'MANUAL_MODE_HOLD': {\n            const validation = validateActiveExecution(request, sender, 'MANUAL_MODE_HOLD', { allowBodyTabId: true });\n            if (!validation.valid) {\n                sendResponse({ success: false, reason: validation.reason, stale: true });\n                return true;\n            }\n            campaignState.currentTargetStage = 'MANUAL_HOLD';\n            campaignState.manualHoldActive = true;\n            if (campaignState.targetDeadlineController) {\n                campaignState.targetDeadlineController.pause('MANUAL_HOLD');\n            }\n            if (campaignState.activeTimeoutId) {\n                clearTimeout(campaignState.activeTimeoutId);\n                campaignState.activeTimeoutId = null;\n            }\n            if (chrome.alarms && campaignState.sessionId) {\n                chrome.alarms.clear(\`xpider_timeout_\${campaignState.sessionId}\`);\n            }\n            const tabId = sender?.tab?.id || campaignState.currentTabId;\n            logBg(tabId, \`[MANUAL_MODE_HOLD] tabId=\${tabId} url=\${request.url || campaignState.currentAttempt?.url || ''} challengeStatus=\${request.challengeStatus || 'NONE'} deadlinePaused=true tabRetained=true\`, 'info');\n            chrome.runtime.sendMessage({\n                action: 'V7_TARGET_HOLD_STATE',\n                state: 'MANUAL_HOLD',\n                challengeStatus: request.challengeStatus || 'NONE',\n                targetUrl: request.url || campaignState.currentAttempt?.url || '',\n                tabId\n            }).catch(() => {});\n            sendResponse({ success: true, state: 'MANUAL_HOLD', deadlinePaused: true, tabRetained: true });\n            return true;\n        }`,
        'background.js: v7 message handlers'
    );

    // 1F. Store campaignMode in startCampaignOrchestrator, pauseCampaignOrchestrator, resumeCampaignOrchestrator
    src = replaceExact(
        src,
        `        campaignState.fillDelayMs = fillDelayMs || 300;\n        campaignState.submitDelayMs = submitDelayMs || 1500;\n        campaignState.ownerFunctionTestMode = !!options.ownerFunctionTestMode;`,
        `        campaignState.fillDelayMs = fillDelayMs || 300;\n        campaignState.submitDelayMs = submitDelayMs || 1500;\n        campaignState.campaignMode = (options.campaignMode === 'MANUAL' || campaignState.campaignMode === 'MANUAL') ? 'MANUAL' : 'AUTO';\n        campaignState.manualHoldActive = false;\n        campaignState.externalCaptchaWaitActive = false;\n        campaignState.ownerFunctionTestMode = !!options.ownerFunctionTestMode;`,
        'background.js: startCampaignOrchestrator campaignMode'
    );

    src = replaceExact(
        src,
        `            counters: { ...(campaignState.counters || {}) },\n            restorationLogged: false,\n            ownerFunctionTestMode: Boolean(campaignState.ownerFunctionTestMode)`,
        `            counters: { ...(campaignState.counters || {}) },\n            campaignMode: campaignState.campaignMode || 'AUTO',\n            restorationLogged: false,\n            ownerFunctionTestMode: Boolean(campaignState.ownerFunctionTestMode)`,
        'background.js: pauseCampaignOrchestrator checkpoint campaignMode'
    );

    src = replaceExact(
        src,
        `    campaignState.delayMs = checkpoint.delayMs || 6000;\n    campaignState.fillDelayMs = checkpoint.fillDelayMs || 300;\n    campaignState.submitDelayMs = checkpoint.submitDelayMs || 1500;`,
        `    campaignState.delayMs = checkpoint.delayMs || 6000;\n    campaignState.fillDelayMs = checkpoint.fillDelayMs || 300;\n    campaignState.submitDelayMs = checkpoint.submitDelayMs || 1500;\n    campaignState.campaignMode = checkpoint.campaignMode || campaignState.campaignMode || 'AUTO';`,
        'background.js: resumeCampaignOrchestrator campaignMode'
    );

    // 1G. Clear hold flags and recognize MANUAL_OPERATOR_SKIP / CAPTCHA_OPERATOR_SKIP in finish()
    src = replaceExact(
        src,
        `        if (campaignState.currentTabId === tabId) {\n            campaignState.currentTabId = null;\n        }`,
        `        campaignState.manualHoldActive = false;\n        campaignState.externalCaptchaWaitActive = false;\n        if (campaignState.currentTargetStage === 'CAPTCHA_PENDING_EXTERNAL_USER' || campaignState.currentTargetStage === 'MANUAL_HOLD') {\n            campaignState.currentTargetStage = 'SETTLED';\n        }\n        if (campaignState.currentTabId === tabId) {\n            campaignState.currentTabId = null;\n        }`,
        'background.js: clear hold flags in finish'
    );

    src = replaceExact(
        src,
        `        } else if (finalReason === 'SKIPPED' || finalReason === 'WOULD_SUBMIT' || finalReason?.includes('SKIPPED') || finalReason?.includes('NON_INQUIRY') || finalReason?.startsWith('NON_INQUIRY') || finalReason === 'EXPECTED_FAIL_PASS' || finalReason?.includes('EXPECTED_FAIL_PASS') || res?.isExpectedFailPass || finalReason === 'NO_LONG_TEXT_INQUIRY_FIELD' || finalReason === 'NO_FORM_FOUND' || finalReason === 'NO_REACHABLE_CONTACT_PAGE') {\n            terminalStatus = 'SKIPPED';`,
        `        } else if (finalReason === 'SKIPPED' || finalReason === 'WOULD_SUBMIT' || finalReason?.includes('SKIPPED') || finalReason?.includes('NON_INQUIRY') || finalReason?.startsWith('NON_INQUIRY') || finalReason === 'EXPECTED_FAIL_PASS' || finalReason?.includes('EXPECTED_FAIL_PASS') || res?.isExpectedFailPass || finalReason === 'NO_LONG_TEXT_INQUIRY_FIELD' || finalReason === 'NO_FORM_FOUND' || finalReason === 'NO_REACHABLE_CONTACT_PAGE' || finalReason === 'MANUAL_OPERATOR_SKIP' || finalReason === 'CAPTCHA_OPERATOR_SKIP') {\n            terminalStatus = 'SKIPPED';`,
        'background.js: operator skip terminalStatus'
    );

    // 1H. Pass campaignMode in START_SENDING and inject challenge-gate.js without solver-content.js
    src = replaceExact(
        src,
        `        safeTabs.sendMessage(tabId, { \n            action: 'START_SENDING', \n            attemptId: _attemptId,\n            targetToken: targetToken,\n            campaignRunId: campaignState.campaignRunId,\n            sessionId: currentSession,\n            captchaEpoch: campaignState.captchaEpoch,\n            template: template, \n            delayMs: campaignState.delayMs,\n            fillDelayMs: campaignState.fillDelayMs || 300,\n            submitDelayMs: campaignState.submitDelayMs || 1500,\n            triedUrl: currentAttemptUrl\n        }).catch(() => {});`,
        `        safeTabs.sendMessage(tabId, { \n            action: 'START_SENDING', \n            attemptId: _attemptId,\n            targetToken: targetToken,\n            campaignRunId: campaignState.campaignRunId,\n            sessionId: currentSession,\n            captchaEpoch: campaignState.captchaEpoch,\n            campaignMode: campaignState.campaignMode || 'AUTO',\n            template: template, \n            delayMs: campaignState.delayMs,\n            fillDelayMs: campaignState.fillDelayMs || 300,\n            submitDelayMs: campaignState.submitDelayMs || 1500,\n            triedUrl: currentAttemptUrl\n        }).catch(() => {});`,
        'background.js: START_SENDING campaignMode'
    );

    src = replaceExact(
        src,
        `                await safeScripting.executeScript({ target: { tabId }, files: [\n                    'modules/contact-gate.js',\n                    'modules/math-captcha-solver.js',\n                    'modules/smart-field-resolver.js',\n                    'modules/contact-discovery-engine.js',\n                    'modules/checkbox-resolver-r2.js',\n                    'modules/select-resolver-r2.js',\n                    'modules/final-form-completion-engine.js',\n                    'modules/form-discovery-engine-r2.js',\n                    'modules/vision-submit-executor.js',\n                    'modules/email-collector.js',\n                    'content-script.js'\n                ] });\n                safeScripting.executeScript({ target: { tabId, allFrames: true }, files: ['solver-content.js'] }).catch(() => {});`,
        `                await safeScripting.executeScript({ target: { tabId }, files: [\n                    'modules/contact-gate.js',\n                    'modules/challenge-gate.js',\n                    'modules/math-captcha-solver.js',\n                    'modules/smart-field-resolver.js',\n                    'modules/contact-discovery-engine.js',\n                    'modules/checkbox-resolver-r2.js',\n                    'modules/select-resolver-r2.js',\n                    'modules/final-form-completion-engine.js',\n                    'modules/form-discovery-engine-r2.js',\n                    'modules/vision-submit-executor.js',\n                    'modules/email-collector.js',\n                    'content-script.js'\n                ] });\n                // [v7.0] solver-content.js frame injection retired`,
        'background.js: executeScript challenge-gate and retire solver-content'
    );

    fs.writeFileSync(filePath, src, 'utf8');
    console.log('[apply_v7_stage1] Patched extension/background.js');
}

// ============================================================================
// 2. Patch extension/content-script.js
// ============================================================================
function patchContentScriptJs() {
    const filePath = path.join(ROOT, 'extension', 'content-script.js');
    let src = fs.readFileSync(filePath, 'utf8');

    // 2A. Load _ChallengeGate at top of content-script.js
    src = replaceExact(
        src,
        `    const _ContactGate = (typeof ContactGate !== 'undefined' && ContactGate) || \n        (typeof window !== 'undefined' && window.ContactGate) || \n        (typeof require !== 'undefined' ? require('./modules/contact-gate.js') : null);`,
        `    const _ContactGate = (typeof ContactGate !== 'undefined' && ContactGate) || \n        (typeof window !== 'undefined' && window.ContactGate) || \n        (typeof require !== 'undefined' ? require('./modules/contact-gate.js') : null);\n\n    const _ChallengeGate = (typeof window !== 'undefined' && window.ChallengeGate) || \n        (typeof globalThis !== 'undefined' && globalThis.ChallengeGate) || \n        (typeof require !== 'undefined' ? (function(){ try { return require('./modules/challenge-gate.js'); } catch(_) { return null; } })() : null);`,
        'content-script.js: load _ChallengeGate'
    );

    // 2B. Bind window.__xpider_campaign_mode on START_SENDING
    src = replaceExact(
        src,
        `                // [Issue #6 R6.9E] Canonical Execution Identity Binding\n                window.__xpider_execution_identity = {\n                    attemptId: request.attemptId || attemptId,\n                    targetToken: request.targetToken || null,\n                    campaignRunId: request.campaignRunId || null,\n                    sessionId: (request.sessionId !== undefined && request.sessionId !== null) ? request.sessionId : null,\n                    captchaEpoch: request.captchaEpoch || 1\n                };`,
        `                // [Issue #6 R6.9E & v7.0] Canonical Execution Identity & Campaign Mode Binding\n                window.__xpider_campaign_mode = (request.campaignMode === 'MANUAL') ? 'MANUAL' : 'AUTO';\n                window.__xpider_execution_identity = {\n                    attemptId: request.attemptId || attemptId,\n                    targetToken: request.targetToken || null,\n                    campaignRunId: request.campaignRunId || null,\n                    sessionId: (request.sessionId !== undefined && request.sessionId !== null) ? request.sessionId : null,\n                    captchaEpoch: request.captchaEpoch || 1,\n                    campaignMode: window.__xpider_campaign_mode\n                };`,
        'content-script.js: START_SENDING campaignMode'
    );

    // 2C. Remove pre-audit captcha wait block in fillAndSubmit (we move challenge & manual-mode gate to post-audit after freezeFieldValues)
    const preAuditCaptchaTarget = `            logDev(\`✅ [FORM_PREP] COMPLETE\`, "info");
            
            let hasCaptcha = false;
            try {
                hasCaptcha = !_isCaptchaSolved && (await checkForCaptcha());
            } catch (err) {
                const errorClass = (err && err.name) || (err instanceof Error ? err.constructor.name : 'Error');
                const safeMessage = (err && err.message) ? String(err.message).replace(/[\\r\\n\\t]+/g, ' ').substring(0, 200) : 'Error checking captcha';
                logDev(\`❌ [Security] CAPTCHA check runtime exception: \${errorClass}: \${safeMessage}\`, "error");
                currentTargetLifecycleState = TargetLifecycleState.SETTLING;
                try {
                    (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({
                        action: 'CAPTCHA_RUNTIME_EXCEPTION',
                        errorClass: errorClass,
                        safeMessage: safeMessage,
                        attemptId: window.__xpider_execution_identity?.attemptId || null
                    });
                } catch (_) {}
                finishCampaign(false, \`CAPTCHA_RUNTIME_EXCEPTION: \${errorClass}: \${safeMessage}\`, 'CAPTCHA_RUNTIME_EXCEPTION', {
                    errorClass: errorClass,
                    safeMessage: safeMessage
                });
                return false;
            }

            if (hasCaptcha) {
                logDev("🤖 [Security] CAPTCHA detected. Engine paused for solver.", "info");
                try {
                    (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({ action: 'STAGE_PROGRESSION', stage: 'CAPTCHA', url: window.location.href });
                } catch (_) {}
                let solved = false;
                try {
                    solved = await waitForCaptchaSolved();
                } catch (err) {
                    const errorClass = (err && err.name) || (err instanceof Error ? err.constructor.name : 'Error');
                    const safeMessage = (err && err.message) ? String(err.message).replace(/[\\r\\n\\t]+/g, ' ').substring(0, 200) : 'Unknown captcha exception';
                    logDev(\`❌ [Security] CAPTCHA runtime exception: \${errorClass}: \${safeMessage}\`, "error");
                    currentTargetLifecycleState = TargetLifecycleState.SETTLING;
                    try {
                        (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({
                            action: 'CAPTCHA_RUNTIME_EXCEPTION',
                            errorClass: errorClass,
                            safeMessage: safeMessage,
                            attemptId: window.__xpider_execution_identity?.attemptId || null
                        });
                    } catch (_) {}
                    finishCampaign(false, \`CAPTCHA_RUNTIME_EXCEPTION: \${errorClass}: \${safeMessage}\`, 'CAPTCHA_RUNTIME_EXCEPTION', {
                        errorClass: errorClass,
                        safeMessage: safeMessage
                    });
                    return false;
                }
                if (!solved) {
                    if (currentTargetLifecycleState === TargetLifecycleState.SETTLED) {
                        logDev("ℹ️ [Security] CAPTCHA terminal decision settled. Halting sequence.", "info");
                    } else {
                        logDev("❌ [Security] CAPTCHA unsolved or solver unavailable. Halting sequence.", "error");
                        finishCampaign(false, 'CAPTCHA_UNRESOLVED_TIMEOUT', 'CAPTCHA_UNRESOLVED_TIMEOUT');
                    }
                    return false;
                }
                logDev("🔑 [Security] Bypass verified", "success");
            }`;

    src = replaceExact(
        src,
        preAuditCaptchaTarget,
        `            logDev(\`✅ [FORM_PREP] COMPLETE\`, "info");`,
        'content-script.js: remove pre-audit captcha wait block'
    );

    // 2D. Insert v7 Dual Mode Gate (MANUAL_HOLD and AUTO challenge verification + post-wait field integrity re-check) right after freezeFieldValues
    const postFreezeTarget = `            // [Section B] FREEZE_VALUES: Stop sweeper, snapshot field values, freeze further mutations
            stopActiveEmptyFieldSweeper();
            const frozenSnapshot = freezeFieldValues(form, template);`;

    const postFreezeReplacement = `            // [Section B] FREEZE_VALUES: Stop sweeper, snapshot field values, freeze further mutations
            stopActiveEmptyFieldSweeper();
            const frozenSnapshot = freezeFieldValues(form, template);

            // [v7.0 Directive #6514763285 & #6514783886] Post-Completion Dual Mode & Challenge Gate
            const activeCampaignMode = (typeof window !== 'undefined' && window.__xpider_campaign_mode === 'MANUAL') ||
                (template && template.campaignMode === 'MANUAL')
                ? 'MANUAL' : 'AUTO';
            const initialChallengeInfo = _ChallengeGate
                ? _ChallengeGate.detectChallenge(document)
                : { detected: false, verified: true, type: 'none' };

            logDev(\`[V7_DUAL_MODE_GATE] mode=\${activeCampaignMode} challengeDetected=\${initialChallengeInfo.detected} challengeType=\${initialChallengeInfo.type} challengeVerified=\${initialChallengeInfo.verified}\`, "info");

            if (activeCampaignMode === 'MANUAL') {
                const manualOutcome = await handleV7ManualModeHold(form, template, frozenSnapshot, initialChallengeInfo);
                return Boolean(manualOutcome && manualOutcome.success);
            }

            // AUTO mode: check verification state after form completion
            const autoDecision = _ChallengeGate
                ? _ChallengeGate.decideAction({
                    mode: 'AUTO',
                    fieldsComplete: true,
                    challenge: initialChallengeInfo,
                    alreadySubmitted: Boolean(window.__xpider_submitBoundaryReached && window.__xpider_submitBoundaryReached[window.__xpider_execution_identity?.attemptId || 'default']),
                    operatorVerified: false
                })
                : ((initialChallengeInfo.detected && !initialChallengeInfo.verified) ? 'CAPTCHA_PENDING_EXTERNAL_USER' : 'SUBMIT_ONCE');
            const autoAction = typeof autoDecision === 'string' ? autoDecision : (autoDecision && autoDecision.action);

            logDev(\`[V7_AUTO_DECISION] action=\${autoAction}\`, "info");

            if (autoAction === 'BLOCK_DUPLICATE') {
                logDev("[SUBMIT_DUPLICATE_BLOCK] Blocked by ChallengeGate duplicate guard", "warning");
                return false;
            }

            if (autoAction === 'CAPTCHA_PENDING_EXTERNAL_USER') {
                const waitOutcome = await waitForExternalOrUserChallengeV7(form, template, frozenSnapshot, initialChallengeInfo);
                if (!waitOutcome || !waitOutcome.resolved) {
                    return false;
                }
                // [Directive #6514783886] Re-verify live form validity and field integrity before single automatic submission
                let postWaitIntegrity = verifyFieldIntegrity(form, frozenSnapshot, template);
                if (!postWaitIntegrity || postWaitIntegrity.intact === false) {
                    const restoredCount = restoreFrozenSnapshot(form, frozenSnapshot);
                    logDev(\`[V7_POST_CHALLENGE_RESTORE] restoredFields=\${restoredCount} after challenge wait\`, "info");
                    postWaitIntegrity = verifyFieldIntegrity(form, frozenSnapshot, template);
                }
                if (!postWaitIntegrity || postWaitIntegrity.intact === false) {
                    logDev(\`❌ [V7_POST_CHALLENGE_INTEGRITY_FAIL] Form invalid after challenge wait: \${postWaitIntegrity?.reasonCode || postWaitIntegrity?.reason}\`, "error");
                    finishCampaign(false, 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT', postWaitIntegrity?.reasonCode || 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT');
                    return false;
                }
                logDev(\`✅ [V7_POST_CHALLENGE_VERIFY] Challenge verified (\${waitOutcome.method}) and live form integrity confirmed. Proceeding to single automatic submission.\`, "success");
            }`;

    src = replaceExact(
        src,
        postFreezeTarget,
        postFreezeReplacement,
        'content-script.js: insert v7 dual mode gate'
    );

    // 2E. Retire tryAutoSolveCaptcha and add restoreFrozenSnapshot, waitForExternalOrUserChallengeV7, handleV7ManualModeHold
    const tryAutoSolveTarget = `    let _activeCaptchaSolvePromise = null;\n\n    async function tryAutoSolveCaptcha(stage = 'MANUAL') {`;
    const v7HelpersAndTryAutoSolve = `    let _activeCaptchaSolvePromise = null;

    function isChallengeInputElement(el) {
        if (!el) return false;
        const attrs = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute && (el.getAttribute('placeholder') || '') || '')).toLowerCase();
        return /captcha|recaptcha|hcaptcha|turnstile|g-recaptcha-response|h-captcha-response|cf-turnstile-response/i.test(attrs);
    }

    function restoreFrozenSnapshot(form, frozenSnapshot) {
        if (!form || !frozenSnapshot || !( frozenSnapshot instanceof Map || typeof frozenSnapshot === 'object')) return 0;
        let restored = 0;
        try {
            if (frozenSnapshot instanceof Map) {
                for (const [el, expectedEntry] of frozenSnapshot.entries()) {
                    if (!el || isChallengeInputElement(el)) continue;
                    const expectedVal = (typeof expectedEntry === 'object' && expectedEntry !== null)
                        ? ((el.type === 'checkbox' || el.type === 'radio') ? expectedEntry.checked : expectedEntry.value)
                        : expectedEntry;
                    const curVal = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : (el.value || '');
                    if ((curVal === '' || curVal === false) && expectedVal !== undefined && expectedVal !== '') {
                        if (el.type === 'checkbox' || el.type === 'radio') {
                            el.checked = Boolean(expectedVal);
                        } else {
                            el.value = expectedVal;
                            try {
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            } catch (_) {}
                        }
                        restored++;
                    }
                }
            } else {
                const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
                for (const el of inputs) {
                    if (isChallengeInputElement(el)) continue;
                    const key = el.name || el.id;
                    if (key && frozenSnapshot[key] !== undefined && (!el.value || !String(el.value).trim())) {
                        el.value = frozenSnapshot[key];
                        try {
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        } catch (_) {}
                        restored++;
                    }
                }
            }
        } catch (_) {}
        return restored;
    }

    async function waitForExternalOrUserChallengeV7(form, template, frozenSnapshot, challengeInfo) {
        const sendFn = (typeof window !== 'undefined' && window.__xpider_sendExecutionMessage) ||
            (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage ? chrome.runtime.sendMessage.bind(chrome.runtime) : null);

        if (sendFn) {
            try {
                sendFn({
                    action: 'CAPTCHA_PENDING_EXTERNAL_USER',
                    challengeType: challengeInfo?.type || 'unknown',
                    url: (typeof window !== 'undefined' && window.location) ? window.location.href : ''
                }, () => {});
            } catch (_) {}
        }

        logDev(\`⏳ [CAPTCHA_PENDING_EXTERNAL_USER] Waiting for external extension or user challenge completion (type=\${challengeInfo?.type || 'unknown'}). Tab retained.\`, "info");

        return new Promise((resolve) => {
            let settled = false;
            let pollTimer = null;

            const cleanup = () => {
                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
                if (typeof document !== 'undefined') {
                    const hud = document.getElementById('xpider-v7-external-captcha-hud');
                    if (hud) hud.remove();
                }
                if (typeof window !== 'undefined') {
                    delete window.__xpiderTriggerExternalCaptchaAction;
                }
            };

            const finishWait = (outcome) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (outcome && outcome.resolved && sendFn) {
                    try {
                        sendFn({
                            action: 'CAPTCHA_EXTERNAL_VERIFIED_RESUME',
                            verificationMethod: outcome.method || 'dom_verified'
                        }, () => {});
                    } catch (_) {}
                }
                resolve(outcome);
            };

            const handleAction = (actionType) => {
                if (settled) return;
                if (actionType === 'REVERIFY_AND_SUBMIT') {
                    const latest = _ChallengeGate ? _ChallengeGate.detectChallenge(document) : { detected: false, verified: true, type: 'none' };
                    if (latest.verified || !latest.detected) {
                        finishWait({ resolved: true, method: latest.method || 'reverify_button_dom_verified' });
                        return;
                    }
                    if (latest.unverifiable) {
                        // Text/image captcha: check if captcha input field is non-empty or accept operator attestation
                        const textCapInput = document.querySelector('input[name*="captcha" i]:not([type="hidden"]), input[id*="captcha" i]:not([type="hidden"]), input[placeholder*="captcha" i]');
                        if (!textCapInput || (textCapInput.value && textCapInput.value.trim().length > 0)) {
                            finishWait({ resolved: true, method: 'operator_verified_unverifiable_captcha' });
                            return;
                        }
                    }
                    const msgEl = typeof document !== 'undefined' ? document.getElementById('xpider-v7-captcha-hud-msg') : null;
                    if (msgEl) {
                        msgEl.textContent = \`⚠️ Challenge (\${latest.type}) is not yet verified on the page. Please complete the challenge widget first.\`;
                        msgEl.style.color = '#fca5a5';
                    }
                } else if (actionType === 'SKIP') {
                    logDev("[CAPTCHA_PENDING_EXTERNAL_USER] Operator chose SKIP", "info");
                    finishCampaign(false, 'CAPTCHA_OPERATOR_SKIP', 'CAPTCHA_OPERATOR_SKIP', { challengeType: challengeInfo?.type || 'unknown' });
                    finishWait({ resolved: false, skipped: true });
                } else if (actionType === 'STOP_AND_SAVE') {
                    logDev("[CAPTCHA_PENDING_EXTERNAL_USER] Operator chose STOP_AND_SAVE", "info");
                    if (sendFn) {
                        try { sendFn({ action: 'STOP_AND_SAVE_CAMPAIGN' }, () => {}); } catch (_) {}
                    }
                    finishWait({ resolved: false, stopped: true });
                }
            };

            if (typeof window !== 'undefined') {
                window.__xpiderTriggerExternalCaptchaAction = handleAction;
            }

            // Render top HUD banner if document.body is available
            if (typeof document !== 'undefined' && document.body) {
                const existing = document.getElementById('xpider-v7-external-captcha-hud');
                if (existing) existing.remove();

                const hud = document.createElement('div');
                hud.id = 'xpider-v7-external-captcha-hud';
                hud.setAttribute('data-xpider-ui', 'true');
                hud.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:linear-gradient(90deg,#0f172a,#1e293b);color:#f8fafc;padding:10px 16px;border-bottom:2px solid #f59e0b;display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
                hud.innerHTML = \`
                    <div style="display:flex;align-items:center;gap:10px;flex:1;">
                        <span style="background:#f59e0b;color:#000;font-weight:700;padding:2px 8px;border-radius:4px;font-size:11px;">AUTO MODE — CHALLENGE PENDING</span>
                        <span id="xpider-v7-captcha-hud-msg" style="color:#fde68a;">Waiting for external extension or user completion (\${challengeInfo?.type || 'challenge'})...</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <button type="button" id="xpider-v7-captcha-reverify-btn" style="background:#10b981;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">✅ I Completed Challenge — Re-verify & Submit</button>
                        <button type="button" id="xpider-v7-captcha-skip-btn" style="background:#475569;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">⏭️ Skip</button>
                        <button type="button" id="xpider-v7-captcha-stop-save-btn" style="background:#d97706;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">⏸️ Stop & Save</button>
                    </div>
                \`;
                document.body.appendChild(hud);

                hud.querySelector('#xpider-v7-captcha-reverify-btn')?.addEventListener('click', () => handleAction('REVERIFY_AND_SUBMIT'));
                hud.querySelector('#xpider-v7-captcha-skip-btn')?.addEventListener('click', () => handleAction('SKIP'));
                hud.querySelector('#xpider-v7-captcha-stop-save-btn')?.addEventListener('click', () => handleAction('STOP_AND_SAVE'));
            }

            // Non-invasive DOM polling for independent page-level challenge completion
            pollTimer = setInterval(() => {
                if (settled) return;
                if (typeof window !== 'undefined' && window.__xpider_aborted) {
                    finishWait({ resolved: false, aborted: true });
                    return;
                }
                if (_ChallengeGate && typeof document !== 'undefined') {
                    const check = _ChallengeGate.detectChallenge(document);
                    if (!check.detected || check.verified) {
                        finishWait({ resolved: true, method: check.method || 'dom_polled_verified' });
                    }
                }
            }, 400);
        });
    }

    async function handleV7ManualModeHold(form, template, frozenSnapshot, initialChallengeInfo) {
        const sendFn = (typeof window !== 'undefined' && window.__xpider_sendExecutionMessage) ||
            (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage ? chrome.runtime.sendMessage.bind(chrome.runtime) : null);

        const initialHoldUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
        const challengeStatusStr = !initialChallengeInfo?.detected
            ? 'NONE'
            : (initialChallengeInfo.verified ? \`VERIFIED (\${initialChallengeInfo.type})\` : \`PENDING (\${initialChallengeInfo.type})\`);

        if (sendFn) {
            try {
                sendFn({
                    action: 'MANUAL_MODE_HOLD',
                    url: initialHoldUrl,
                    challengeStatus: challengeStatusStr
                }, () => {});
            } catch (_) {}
        }

        logDev(\`🖐️ [MANUAL_MODE_HOLD] Form prepared and frozen. Holding queue for operator registration (challenge=\${challengeStatusStr}).\`, "info");

        return new Promise((resolve) => {
            let settled = false;
            let manualRetryCount = 0;
            const MAX_MANUAL_RETRIES = 3;

            const cleanup = () => {
                if (typeof document !== 'undefined') {
                    const panel = document.getElementById('xpider-v7-manual-hold-panel');
                    if (panel) panel.remove();
                }
                if (typeof window !== 'undefined') {
                    delete window.__xpiderTriggerManualAction;
                }
            };

            const settleManual = (resObj) => {
                if (settled) return resObj;
                settled = true;
                cleanup();
                resolve(resObj);
                return resObj;
            };

            const executeManualAction = (actionType, actionOpts = {}) => {
                if (settled) return { settled: true };

                if (actionType === 'RETRY_EDIT') {
                    if (manualRetryCount >= MAX_MANUAL_RETRIES) {
                        logDev(\`[MANUAL_MODE_RETRY] Bounded retry limit (\${MAX_MANUAL_RETRIES}/\${MAX_MANUAL_RETRIES}) reached.\`, "warning");
                        return { retryCount: manualRetryCount, limitReached: true };
                    }
                    manualRetryCount++;
                    const restored = restoreFrozenSnapshot(form, frozenSnapshot);
                    const latestChallenge = _ChallengeGate ? _ChallengeGate.detectChallenge(document) : initialChallengeInfo;
                    const newChalStr = !latestChallenge?.detected
                        ? 'NONE'
                        : (latestChallenge.verified ? \`VERIFIED (\${latestChallenge.type})\` : \`PENDING (\${latestChallenge.type})\`);

                    if (typeof document !== 'undefined') {
                        const retryBtn = document.getElementById('xpider-manual-retry-btn');
                        if (retryBtn) {
                            retryBtn.textContent = manualRetryCount >= MAX_MANUAL_RETRIES
                                ? \`🔄 Max Retries (\${manualRetryCount}/\${MAX_MANUAL_RETRIES})\`
                                : \`🔄 Retry / Edit (\${manualRetryCount}/\${MAX_MANUAL_RETRIES})\`;
                            if (manualRetryCount >= MAX_MANUAL_RETRIES) {
                                retryBtn.disabled = true;
                                retryBtn.style.opacity = '0.5';
                            }
                        }
                        const chalBadge = document.getElementById('xpider-manual-challenge-status');
                        if (chalBadge) chalBadge.textContent = newChalStr;
                    }
                    logDev(\`[MANUAL_MODE_RETRY] retry=\${manualRetryCount}/\${MAX_MANUAL_RETRIES} restoredEmptyFields=\${restored} challenge=\${newChalStr}\`, "info");
                    return { retryCount: manualRetryCount, restored, limitReached: manualRetryCount >= MAX_MANUAL_RETRIES };
                }

                if (actionType === 'SKIP') {
                    logDev("[MANUAL_MODE_DECISION] action=SKIP reason=MANUAL_OPERATOR_SKIP", "info");
                    finishCampaign(false, 'MANUAL_OPERATOR_SKIP', 'MANUAL_OPERATOR_SKIP', { manualMode: true });
                    return settleManual({ success: false, status: 'SKIPPED', reasonCode: 'MANUAL_OPERATOR_SKIP' });
                }

                if (actionType === 'STOP_AND_SAVE') {
                    logDev("[MANUAL_MODE_DECISION] action=STOP_AND_SAVE", "info");
                    if (sendFn) {
                        try { sendFn({ action: 'STOP_AND_SAVE_CAMPAIGN' }, () => {}); } catch (_) {}
                    }
                    return settleManual({ success: false, status: 'PAUSED', reasonCode: 'STOP_AND_SAVE_CAMPAIGN' });
                }

                if (actionType === 'REGISTERED_CONTINUE') {
                    const currentUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
                    const urlChanged = Boolean(initialHoldUrl && currentUrl && currentUrl !== initialHoldUrl);
                    const bodyText = (typeof document !== 'undefined' && document.body)
                        ? (document.body.innerText || document.body.textContent || '')
                        : '';
                    const hasPositiveDomSuccess = Boolean(
                        actionOpts.hasPositiveDomSuccess ||
                        (_ChallengeGate && _ChallengeGate.hasSuccessText(bodyText))
                    );
                    const formRemovedOrHidden = Boolean(
                        actionOpts.formRemovedOrHidden ||
                        (typeof document !== 'undefined' && form && (!document.contains(form) || (form.offsetWidth === 0 && form.offsetHeight === 0 && typeof form.getClientRects === 'function' && form.getClientRects().length === 0)))
                    );
                    const hasUrlRedirectSuccess = Boolean(
                        actionOpts.hasUrlRedirectSuccess ||
                        (urlChanged && (/thank|success|confirm|complete|sent|submitted/i.test(currentUrl) || hasPositiveDomSuccess))
                    );
                    const hasServerAck = Boolean(
                        actionOpts.hasServerAck ||
                        (typeof window !== 'undefined' && window.__xpider_last_server_ack_ok) ||
                        (typeof document !== 'undefined' && document.querySelector('[data-xpider-submit-success="true"], .submission-success, #submission-success'))
                    );

                    const classification = _ChallengeGate
                        ? _ChallengeGate.classifyManualResume({
                            hasPositiveDomSuccess,
                            hasUrlRedirectSuccess,
                            hasServerAck,
                            formStillPresent: !formRemovedOrHidden,
                            operatorClaimedRegistered: true
                        })
                        : {
                            status: (hasPositiveDomSuccess || hasUrlRedirectSuccess || hasServerAck) ? 'SUCCESS' : 'DELIVERY_UNKNOWN',
                            reasonCode: (hasPositiveDomSuccess || hasUrlRedirectSuccess || hasServerAck) ? 'MANUAL_CONFIRMED_SUCCESS' : 'MANUAL_CLAIM_NO_EVIDENCE'
                        };

                    if (classification.status === 'SUCCESS') {
                        logDev(\`✅ [MANUAL_MODE_DECISION] action=REGISTERED_CONTINUE status=SUCCESS reason=\${classification.reasonCode}\`, "success");
                        finishCampaign(true, null, 'SUCCESS_CONFIRMED', {
                            manualMode: true,
                            ownerManualConfirmed: true,
                            outcomeEvidence: classification
                        });
                        return settleManual({ success: true, status: 'SUCCESS', reasonCode: classification.reasonCode });
                    } else {
                        logDev(\`⚠️ [MANUAL_MODE_DECISION] action=REGISTERED_CONTINUE status=DELIVERY_UNKNOWN reason=\${classification.reasonCode} operatorClaimOnly=true\`, "warning");
                        finishCampaign(false, 'DELIVERY_UNKNOWN', 'DELIVERY_UNKNOWN', {
                            manualMode: true,
                            ownerManualConfirmed: false,
                            operatorClaimOnly: true,
                            subReason: classification.reasonCode,
                            outcomeEvidence: classification
                        });
                        return settleManual({ success: false, status: 'DELIVERY_UNKNOWN', reasonCode: classification.reasonCode });
                    }
                }
            };

            if (typeof window !== 'undefined') {
                window.__xpiderTriggerManualAction = executeManualAction;
            }

            if (typeof document !== 'undefined' && document.body) {
                const existing = document.getElementById('xpider-v7-manual-hold-panel');
                if (existing) existing.remove();

                const hostLabel = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : initialHoldUrl;
                const fieldCount = (frozenSnapshot instanceof Map) ? frozenSnapshot.size : Object.keys(frozenSnapshot || {}).length;

                const panel = document.createElement('div');
                panel.id = 'xpider-v7-manual-hold-panel';
                panel.setAttribute('data-xpider-ui', 'true');
                panel.style.cssText = 'position:fixed;bottom:16px;right:16px;width:380px;max-width:94vw;z-index:2147483647;background:#0f172a;color:#f8fafc;border:2px solid #38bdf8;border-radius:10px;padding:14px 16px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,0.65);';
                panel.innerHTML = \`
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="background:#0284c7;color:#fff;font-weight:700;padding:3px 8px;border-radius:4px;font-size:11px;">🖐️ MANUAL MODE — HOLD FOR REGISTRATION</span>
                        <span style="color:#94a3b8;font-size:10px;font-family:monospace;">\${hostLabel}</span>
                    </div>
                    <div style="background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:6px;padding:8px;margin-bottom:10px;font-size:11px;line-height:1.5;">
                        <div>📋 <strong>Fields Prepared:</strong> <span style="color:#4ade80;">\${fieldCount} fields verified ✓</span></div>
                        <div>🧩 <strong>Challenge Status:</strong> <span id="xpider-manual-challenge-status" style="color:#fbbf24;">\${challengeStatusStr}</span></div>
                        <div style="color:#cbd5e1;font-size:10px;margin-top:4px;">Submit the form on the page when ready, then click <strong>I Registered — Continue</strong>.</div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        <button type="button" id="xpider-manual-registered-btn" style="grid-column:span 2;background:#10b981;color:#fff;border:none;border-radius:6px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;">✅ I Registered — Continue</button>
                        <button type="button" id="xpider-manual-retry-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:600;cursor:pointer;">🔄 Retry / Edit (0/3)</button>
                        <button type="button" id="xpider-manual-skip-btn" style="background:#64748b;color:#fff;border:none;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:600;cursor:pointer;">⏭️ Skip</button>
                        <button type="button" id="xpider-manual-stop-save-btn" style="grid-column:span 2;background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid #f59e0b;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:600;cursor:pointer;">⏸️ Stop & Save Checkpoint</button>
                    </div>
                \`;
                document.body.appendChild(panel);

                panel.querySelector('#xpider-manual-registered-btn')?.addEventListener('click', () => executeManualAction('REGISTERED_CONTINUE'));
                panel.querySelector('#xpider-manual-retry-btn')?.addEventListener('click', () => executeManualAction('RETRY_EDIT'));
                panel.querySelector('#xpider-manual-skip-btn')?.addEventListener('click', () => executeManualAction('SKIP'));
                panel.querySelector('#xpider-manual-stop-save-btn')?.addEventListener('click', () => executeManualAction('STOP_AND_SAVE'));
            }
        });
    }

    async function tryAutoSolveCaptcha(stage = 'MANUAL') {
        // [v7.0 Directive #6514763285] Internal API-based CAPTCHA solving and token injection are retired.
        logDev(\`[SOLVER_RETIRED_V7] tryAutoSolveCaptcha(stage=\${stage}) skipped: internal API solver retired in v7.\`, 'info');
        return {
            success: false,
            retired: true,
            terminalSettled: false,
            providerSolveAttempted: false,
            reason: 'INTERNAL_SOLVER_RETIRED_V7'
        };
    }

    async function _legacyTryAutoSolveCaptchaRetired(stage = 'MANUAL') {`;

    src = replaceExact(
        src,
        tryAutoSolveTarget,
        v7HelpersAndTryAutoSolve,
        'content-script.js: retire tryAutoSolveCaptcha and add v7 helpers'
    );

    // 2F. Export ChallengeGate and v7 helpers on window and module.exports
    src = replaceExact(
        src,
        `        window.__xpiderIsPageWafBlocked = isPageWafBlocked;\n        window.__xpider_initialized = true;`,
        `        window.__xpiderIsPageWafBlocked = isPageWafBlocked;\n        window.__xpiderChallengeGate = _ChallengeGate;\n        window.__xpiderWaitForExternalOrUserChallengeV7 = waitForExternalOrUserChallengeV7;\n        window.__xpiderHandleV7ManualModeHold = handleV7ManualModeHold;\n        window.__xpiderRestoreFrozenSnapshot = restoreFrozenSnapshot;\n        window.__xpider_initialized = true;`,
        'content-script.js: window exports'
    );

    src = replaceExact(
        src,
        `            ContactGate: _ContactGate,\n            SmartFieldResolver: _SmartFieldResolver,`,
        `            ContactGate: _ContactGate,\n            ChallengeGate: _ChallengeGate,\n            waitForExternalOrUserChallengeV7,\n            handleV7ManualModeHold,\n            restoreFrozenSnapshot,\n            SmartFieldResolver: _SmartFieldResolver,`,
        'content-script.js: module.exports'
    );

    fs.writeFileSync(filePath, src, 'utf8');
    console.log('[apply_v7_stage1] Patched extension/content-script.js');
}

// ============================================================================
// 3. Patch extension/popup.html
// ============================================================================
function patchPopupHtml() {
    const filePath = path.join(ROOT, 'extension', 'popup.html');
    let src = fs.readFileSync(filePath, 'utf8');

    // 3A. Hide legacy Wit.ai quick status bar and replace with v7 Challenge Mode info bar
    src = replaceExact(
        src,
        `                <!-- Wit.ai Audio Solver Quick Status Bar -->\n                <div id="wit-status-bar" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 255, 204, 0.06); border: 1px solid rgba(0, 255, 204, 0.25); border-radius: 6px; padding: 6px 12px; margin-bottom: 10px; font-size: 11px;">`,
        `                <!-- Wit.ai Audio Solver Quick Status Bar (Retired in v7.0, kept hidden for DOM safety) -->\n                <div id="wit-status-bar" style="display: none !important; justify-content: space-between; align-items: center; background: rgba(0, 255, 204, 0.06); border: 1px solid rgba(0, 255, 204, 0.25); border-radius: 6px; padding: 6px 12px; margin-bottom: 10px; font-size: 11px;">`,
        'popup.html: hide wit-status-bar'
    );

    // 3B. Hide legacy internal CAPTCHA solver settings and add v7 External/Operator Challenge notice
    src = replaceExact(
        src,
        `                        <!-- Captcha Solve Toggle -->\n                        <div class="settings-group">\n                            <label data-i18n="label_captcha_auto_solve">Auto CAPTCHA Solver</label>`,
        `                        <!-- [v7.0] Internal API Solver Retired Notice -->\n                        <div class="settings-group" id="v7-captcha-external-notice" style="background: rgba(16, 185, 129, 0.08); border: 1px solid #10b981; border-radius: 6px; padding: 10px; margin-bottom: 10px;">\n                            <div style="font-size: 11px; font-weight: 700; color: #34d399; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">\n                                <span>🛡️ CHALLENGE HANDLING (v7.0 DUAL MODE)</span>\n                                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); color: #6ee7b7; font-family: monospace;">EXTERNAL / USER ONLY</span>\n                            </div>\n                            <p class="settings-subtip" style="color: #cbd5e1; font-size: 10px; line-height: 1.4; margin: 0;">\n                                Internal API-based CAPTCHA solving (2Captcha / NopeCHA / Wit.ai Audio STT) and token injection are retired in v7.0. In <strong>Start Automatic</strong> mode, forms without human challenges submit automatically once; if a challenge is required, XPIDER pauses the target deadline, retains the tab, and awaits external extension or user completion before re-verifying form integrity and submitting once. In <strong>Start Manual</strong> mode, XPIDER prepares fields and holds the queue until you register and confirm.\n                            </p>\n                        </div>\n\n                        <!-- Captcha Solve Toggle (Retired in v7.0) -->\n                        <div class="settings-group" style="display: none !important;">\n                            <label data-i18n="label_captcha_auto_solve">Auto CAPTCHA Solver</label>`,
        'popup.html: v7 captcha notice and hide toggle'
    );

    src = replaceExact(
        src,
        `                        <!-- Captcha Method (Dynamic) -->\n                        <div class="settings-group" id="captcha-method-group" style="display: block;">`,
        `                        <!-- Captcha Method (Retired in v7.0) -->\n                        <div class="settings-group" id="captcha-method-group" style="display: none !important;">`,
        'popup.html: hide captcha-method-group'
    );

    src = replaceExact(
        src,
        `                        <!-- API Key Input (Dynamic) -->\n                        <div class="settings-group" id="captcha-api-group" style="display: block;">`,
        `                        <!-- API Key Input (Retired in v7.0) -->\n                        <div class="settings-group" id="captcha-api-group" style="display: none !important;">`,
        'popup.html: hide captcha-api-group'
    );

    src = replaceExact(
        src,
        `                        <!-- [Issue #6 RC3.22/RC3.23] CAPTCHA Decision Handling -->\n                        <div class="settings-group" style="background: rgba(139, 92, 246, 0.08); border: 1px solid #8b5cf6; border-radius: 6px; padding: 10px; margin-top: 10px;">`,
        `                        <!-- [Issue #6 RC3.22/RC3.23] CAPTCHA Decision Handling (Retired in v7.0) -->\n                        <div class="settings-group" style="display: none !important; background: rgba(139, 92, 246, 0.08); border: 1px solid #8b5cf6; border-radius: 6px; padding: 10px; margin-top: 10px;">`,
        'popup.html: hide legacy captcha decision handling group'
    );

    src = replaceExact(
        src,
        `                        <div class="settings-group" id="captcha-timing-group" style="display: block;">`,
        `                        <div class="settings-group" id="captcha-timing-group" style="display: none !important;">`,
        'popup.html: hide captcha-timing-group'
    );

    // 3C. Update #start-readiness-hud and #start-btn / #start-manual-btn in popup.html
    src = replaceExact(
        src,
        `            <div id="start-readiness-hud" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 10px; font-family: monospace; padding: 4px 8px; background: rgba(15, 23, 42, 0.4); border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">\n                <span id="campaign-ready-pill" style="color: #22c55e; font-weight: 600;">CAMPAIGN: READY</span>\n                <span id="privacy-ready-pill" style="color: #94a3b8; font-weight: 600;">PRIVACY: CHECKING...</span>\n            </div>`,
        `            <div id="start-readiness-hud" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 10px; font-family: monospace; padding: 4px 8px; background: rgba(15, 23, 42, 0.4); border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">\n                <span id="campaign-ready-pill" style="color: #22c55e; font-weight: 600;">CAMPAIGN: READY</span>\n                <span id="campaign-mode-pill" style="color: #38bdf8; font-weight: 700;">MODE: AUTO / MANUAL</span>\n                <span id="privacy-ready-pill" style="color: #94a3b8; font-weight: 600;">PRIVACY: CHECKING...</span>\n            </div>`,
        'popup.html: add campaign-mode-pill'
    );

    src = replaceExact(
        src,
        `            <div class="action-buttons">\n                <button id="start-btn" class="primary-btn pulse" data-i18n="btn_start">Start Sending</button>`,
        `            <div class="action-buttons">\n                <div id="start-buttons-row" style="display: flex; gap: 8px; width: 100%;">\n                    <button id="start-btn" data-mode="AUTO" class="primary-btn pulse" style="flex: 1;" title="Fill fields, check verification state, and automatically submit once when verified">🚀 Start Automatic</button>\n                    <button id="start-manual-btn" data-mode="MANUAL" class="secondary-btn" style="flex: 1; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: 1px solid #38bdf8; font-weight: 700;" title="Fill fields and hold queue on each site until you register and confirm">🖐️ Start Manual</button>\n                </div>`,
        'popup.html: dual start buttons'
    );

    fs.writeFileSync(filePath, src, 'utf8');
    console.log('[apply_v7_stage1] Patched extension/popup.html');
}

// ============================================================================
// 4. Patch extension/popup.js
// ============================================================================
function patchPopupJs() {
    const filePath = path.join(ROOT, 'extension', 'popup.js');
    let src = fs.readFileSync(filePath, 'utf8');

    // 4A. Bind both #start-btn (AUTO) and #start-manual-btn (MANUAL) in bindCriticalControls
    src = replaceExact(
        src,
        `    // 1. Start Button\n    const startBtn = document.getElementById('start-btn');\n    if (startBtn) {\n        if (!startBtn.dataset.bound) {\n            startBtn.dataset.bound = 'true';\n            startBtn.addEventListener('click', () => {\n                console.log('[BUTTON_CLICK] id=start-btn');\n                launchCampaign({ source: 'USER_START_BUTTON' }).catch(err => {\n                    console.error('[START_EXCEPTION]', err);\n                });\n            });\n        }\n        startBound = true;\n    } else {\n        displayControlPlaneError('START_HANDLER_NOT_BOUND', 'element #start-btn not found in DOM');\n    }`,
        `    // 1. Start Automatic & Start Manual Buttons (v7.0 Dual Mode)\n    const startBtn = document.getElementById('start-btn');\n    const startManualBtn = document.getElementById('start-manual-btn');\n    if (startBtn) {\n        if (!startBtn.dataset.bound) {\n            startBtn.dataset.bound = 'true';\n            startBtn.addEventListener('click', () => {\n                console.log('[BUTTON_CLICK] id=start-btn mode=AUTO');\n                launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'AUTO' }).catch(err => {\n                    console.error('[START_EXCEPTION]', err);\n                });\n            });\n        }\n        startBound = true;\n    } else {\n        displayControlPlaneError('START_HANDLER_NOT_BOUND', 'element #start-btn not found in DOM');\n    }\n    if (startManualBtn && !startManualBtn.dataset.bound) {\n        startManualBtn.dataset.bound = 'true';\n        startManualBtn.addEventListener('click', () => {\n            console.log('[BUTTON_CLICK] id=start-manual-btn mode=MANUAL');\n            launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'MANUAL' }).catch(err => {\n                console.error('[START_EXCEPTION]', err);\n            });\n        });\n    }`,
        'popup.js: bindCriticalControls dual buttons'
    );

    // 4B. Also update fallback binding around line 5164
    src = replaceExact(
        src,
        `        const startBtn = document.getElementById('start-btn');\n        if (startBtn && !startBtn.dataset.bound) {\n            startBtn.dataset.bound = 'true';\n            startBtn.addEventListener('click', () => {\n                console.log('[BUTTON_CLICK] id=start-btn');\n                launchCampaign({ source: 'USER_START_BUTTON' }).catch(err => {\n                    console.error('[START_EXCEPTION]', err);\n                });\n            });\n        }`,
        `        const startBtn = document.getElementById('start-btn');\n        if (startBtn && !startBtn.dataset.bound) {\n            startBtn.dataset.bound = 'true';\n            startBtn.addEventListener('click', () => {\n                console.log('[BUTTON_CLICK] id=start-btn mode=AUTO');\n                launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'AUTO' }).catch(err => {\n                    console.error('[START_EXCEPTION]', err);\n                });\n            });\n        }\n        const startManualBtn = document.getElementById('start-manual-btn');\n        if (startManualBtn && !startManualBtn.dataset.bound) {\n            startManualBtn.dataset.bound = 'true';\n            startManualBtn.addEventListener('click', () => {\n                console.log('[BUTTON_CLICK] id=start-manual-btn mode=MANUAL');\n                launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'MANUAL' }).catch(err => {\n                    console.error('[START_EXCEPTION]', err);\n                });\n            });\n        }`,
        'popup.js: fallback binding dual buttons'
    );

    // 4C. Update restoreStartButton and stopCampaign to restore both buttons
    src = replaceExact(
        src,
        `function restoreStartButton() {\n    _isCampaignLaunching = false;\n    campaignActive = false;\n    const btn = document.getElementById('start-btn');\n    if (btn) {\n        btn.classList.remove('hidden');\n        btn.disabled = false;\n        btn.removeAttribute('data-build-locked');\n        const lang = document.getElementById('language-select')?.value || 'en';\n        const dict = (typeof i18nData !== 'undefined' && i18nData) ? (i18nData[lang] || i18nData['en'] || {}) : {};\n        btn.textContent = dict.btn_start || "🚀 START SENDING";\n        btn.title = "";\n    }`,
        `function restoreStartButton() {\n    _isCampaignLaunching = false;\n    campaignActive = false;\n    const btn = document.getElementById('start-btn');\n    const manualBtn = document.getElementById('start-manual-btn');\n    const startRow = document.getElementById('start-buttons-row');\n    if (startRow) startRow.classList.remove('hidden');\n    if (btn) {\n        btn.classList.remove('hidden');\n        btn.disabled = false;\n        btn.removeAttribute('data-build-locked');\n        btn.textContent = "🚀 Start Automatic";\n        btn.title = "";\n    }\n    if (manualBtn) {\n        manualBtn.classList.remove('hidden');\n        manualBtn.disabled = false;\n        manualBtn.removeAttribute('data-build-locked');\n        manualBtn.textContent = "🖐️ Start Manual";\n        manualBtn.title = "";\n    }`,
        'popup.js: restoreStartButton dual buttons'
    );

    // 4D. Pass campaignMode in launchCampaign and update UI pills
    src = replaceExact(
        src,
        `        const startPayload = {\n            queue: campaignQueue,\n            template: currentTpl,\n            delayMs,\n            fillDelayMs,\n            submitDelayMs,\n            fillMode,\n            randomVariation: randomVariationActive,\n            templateId: currentTpl.templateId || 'default',\n            templateVersion: currentTpl.templateVersion || 1,\n            skipPreviouslyAttempted,\n            overrideSkipAttempted: isTestModeActive ? true : false,\n            ownerFunctionTestMode: isTestModeActive ? true : false,\n            campaignRunId: resolvedRunId\n        };`,
        `        const requestedCampaignMode = (options.campaignMode === 'MANUAL') ? 'MANUAL' : 'AUTO';\n        const modePill = document.getElementById('campaign-mode-pill');\n        if (modePill) {\n            modePill.textContent = \`MODE: \${requestedCampaignMode}\`;\n            modePill.style.color = requestedCampaignMode === 'MANUAL' ? '#fbbf24' : '#38bdf8';\n        }\n        const startPayload = {\n            queue: campaignQueue,\n            template: currentTpl,\n            delayMs,\n            fillDelayMs,\n            submitDelayMs,\n            fillMode,\n            randomVariation: randomVariationActive,\n            templateId: currentTpl.templateId || 'default',\n            templateVersion: currentTpl.templateVersion || 1,\n            skipPreviouslyAttempted,\n            overrideSkipAttempted: isTestModeActive ? true : false,\n            ownerFunctionTestMode: isTestModeActive ? true : false,\n            campaignRunId: resolvedRunId,\n            campaignMode: requestedCampaignMode\n        };`,
        'popup.js: launchCampaign startPayload campaignMode'
    );

    src = replaceExact(
        src,
        `                ownerFunctionTestMode: startPayload.ownerFunctionTestMode,\n                campaignRunId: startPayload.campaignRunId\n            }, (res) => {`,
        `                ownerFunctionTestMode: startPayload.ownerFunctionTestMode,\n                campaignRunId: startPayload.campaignRunId,\n                campaignMode: startPayload.campaignMode\n            }, (res) => {`,
        'popup.js: START_CAMPAIGN message campaignMode'
    );

    src = replaceExact(
        src,
        `        if (startBtn) startBtn.classList.add('hidden');\n        const multiActions = document.getElementById('multi-actions');`,
        `        if (startBtn) startBtn.classList.add('hidden');\n        const startManualBtn = document.getElementById('start-manual-btn');\n        if (startManualBtn) startManualBtn.classList.add('hidden');\n        const startRow = document.getElementById('start-buttons-row');\n        if (startRow) startRow.classList.add('hidden');\n        const multiActions = document.getElementById('multi-actions');`,
        'popup.js: hide both start buttons when running'
    );

    src = replaceExact(
        src,
        `function stopCampaign() {\n    campaignActive = false;\n    campaignPaused = false;\n    _isCampaignLaunching = false;\n    const startBtn = document.getElementById('start-btn');\n    if (startBtn) {\n        startBtn.classList.remove('hidden');\n        startBtn.disabled = false;\n        startBtn.textContent = (typeof dict !== 'undefined' && dict.btn_start) || "🚀 START SENDING";\n    }`,
        `function stopCampaign() {\n    campaignActive = false;\n    campaignPaused = false;\n    _isCampaignLaunching = false;\n    const startRow = document.getElementById('start-buttons-row');\n    if (startRow) startRow.classList.remove('hidden');\n    const startBtn = document.getElementById('start-btn');\n    if (startBtn) {\n        startBtn.classList.remove('hidden');\n        startBtn.disabled = false;\n        startBtn.textContent = "🚀 Start Automatic";\n    }\n    const startManualBtn = document.getElementById('start-manual-btn');\n    if (startManualBtn) {\n        startManualBtn.classList.remove('hidden');\n        startManualBtn.disabled = false;\n        startManualBtn.textContent = "🖐️ Start Manual";\n    }`,
        'popup.js: stopCampaign restore both buttons'
    );

    fs.writeFileSync(filePath, src, 'utf8');
    console.log('[apply_v7_stage1] Patched extension/popup.js');
}

patchBackgroundJs();
patchContentScriptJs();
patchPopupHtml();
patchPopupJs();
console.log('[apply_v7_stage1] ALL STAGE 1 PATCHES APPLIED SUCCESSFULLY.');
