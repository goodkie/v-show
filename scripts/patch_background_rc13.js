const fs = require('fs');
const path = require('path');

const bgPath = path.resolve('extension/background.js');
let bg = fs.readFileSync(bgPath, 'utf8');

// Normalize line endings to LF for patching
const isCRLF = bg.includes('\r\n');
bg = bg.replace(/\r\n/g, '\n');

console.log('=== PRECISE PATCHING BACKGROUND.JS FOR RC13 ===');

// 1. UPDATE_SPEED_SETTINGS case
const speedCaseAnchor = "case 'RESUME_CAMPAIGN':";
const nextCaseAnchor = "case 'GET_ACTIVE_EXECUTION_IDENTITY':";
const speedCaseBlock = `
        // [RC13 Speed Slider Runtime Audit] Live Speed Update Endpoint
        case 'UPDATE_SPEED_SETTINGS':
            try {
                if (typeof request.delayMs === 'number') campaignState.delayMs = request.delayMs;
                if (typeof request.fillDelayMs === 'number') campaignState.fillDelayMs = request.fillDelayMs;
                if (typeof request.submitDelayMs === 'number') campaignState.submitDelayMs = request.submitDelayMs;

                // Live propagation to active target content script
                if (campaignState.currentTabId) {
                    chrome.tabs.sendMessage(campaignState.currentTabId, {
                        action: 'UPDATE_ACTIVE_SPEED',
                        fillDelayMs: campaignState.fillDelayMs,
                        submitDelayMs: campaignState.submitDelayMs
                    }).catch(() => {});
                }
                logBg(null, \`[SPEED_UPDATE] liveApplied=true collectMs=\${campaignState.delayMs} fillMs=\${campaignState.fillDelayMs} submitMs=\${campaignState.submitDelayMs}\`, 'info');
                sendResponse({
                    success: true,
                    delayMs: campaignState.delayMs,
                    fillDelayMs: campaignState.fillDelayMs,
                    submitDelayMs: campaignState.submitDelayMs
                });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
            return true;
`;

if (!bg.includes(`case 'UPDATE_SPEED_SETTINGS':`)) {
    const resIdx = bg.indexOf(speedCaseAnchor);
    const nextIdx = bg.indexOf(nextCaseAnchor, resIdx);
    if (resIdx !== -1 && nextIdx !== -1) {
        bg = bg.slice(0, nextIdx) + speedCaseBlock + '\n        ' + bg.slice(nextIdx);
        console.log('[1] Added UPDATE_SPEED_SETTINGS case');
    } else {
        throw new Error('Case anchors not found');
    }
}

// 2. startCampaignOrchestrator signature and defaults
const startSigOld = "async function startCampaignOrchestrator(queue, template, delayMs, fillDelayMs = 300, submitDelayMs = 1500, options = {}) {";
const startSigNew = "async function startCampaignOrchestrator(queue, template, delayMs, fillDelayMs = 300, submitDelayMs = 4000, options = {}) {";
if (bg.indexOf(startSigOld) === -1) throw new Error("startCampaignOrchestrator signature not found");
bg = bg.replace(startSigOld, startSigNew);

const startDefaultsOld = "        campaignState.delayMs = delayMs || 6000;\n        campaignState.fillDelayMs = fillDelayMs || 300;\n        campaignState.submitDelayMs = submitDelayMs || 1500;";
const startDefaultsNew = "        campaignState.delayMs = delayMs || 10000;\n        campaignState.fillDelayMs = fillDelayMs || 300;\n        campaignState.submitDelayMs = submitDelayMs || 4000;";
if (bg.indexOf(startDefaultsOld) === -1) throw new Error("startCampaignOrchestrator defaults not found");
bg = bg.replace(startDefaultsOld, startDefaultsNew);
console.log('[2] Updated startCampaignOrchestrator signature & defaults');

// 3. pauseCampaignOrchestrator tab retention logic
const pauseCloseMarker = `    // [RC12 Item 4] Close all campaign tabs on pause; clean task boundary ensures never resurrecting a prior-mode hold\n    await closeAllCampaignTabsExcept(null, 'PAUSE_CAMPAIGN');\n    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {\n        chrome.storage.local.remove('xpider_v7_active_hold_state').catch(() => {});\n    }\n    campaignState.currentTabId = null;\n    campaignState.targetTabId = null;\n    campaignState.submitLock = false;\n    campaignState.timeoutWatchdogGen = (campaignState.timeoutWatchdogGen || 0) + 1;\n    chrome.storage.local.remove('xpider_currentAttempt').catch(() => {});`;

const pauseCloseReplacement = `    // [RC13 Audit Directive #6535593609] Preserve operator tab and work if pause occurs during active operator hold
    let preservedTabId = null;
    if (wasInV7Hold && campaignState.currentTabId) {
        preservedTabId = campaignState.currentTabId;
        logBg(preservedTabId, \`⏸️ [Pause] Operator hold active. Preserving operator tab (tabId=\${preservedTabId}) across pause barrier.\`, "info");
        await closeAllCampaignTabsExcept(preservedTabId, 'PAUSE_RETAIN_HOLD_TAB');
        campaignState.pausedHeldTabId = preservedTabId;
        campaignState.pausedHeldUrl = campaignState.currentTargetUrl;
        campaignState.pausedHeldStage = inFlightStage;
        
        // Notify tab content script that campaign is paused but hold is retained
        chrome.tabs.sendMessage(preservedTabId, {
            action: 'CAMPAIGN_PAUSED_HOLD_RETAINED',
            runId: campaignState.campaignRunId
        }).catch(() => {});
        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                xpider_v7_active_hold_state: {
                    tabId: preservedTabId,
                    url: campaignState.currentTargetUrl,
                    stage: inFlightStage,
                    reason: 'PAUSED_OPERATOR_HOLD_RETAINED',
                    timestamp: Date.now()
                }
            }).catch(() => {});
        }
    } else {
        await closeAllCampaignTabsExcept(null, 'PAUSE_CAMPAIGN');
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove('xpider_v7_active_hold_state').catch(() => {});
        }
        campaignState.pausedHeldTabId = null;
        campaignState.pausedHeldUrl = null;
        campaignState.pausedHeldStage = null;
        campaignState.currentTabId = null;
        campaignState.targetTabId = null;
    }
    campaignState.submitLock = false;
    campaignState.timeoutWatchdogGen = (campaignState.timeoutWatchdogGen || 0) + 1;
    chrome.storage.local.remove('xpider_currentAttempt').catch(() => {});`;

if (bg.indexOf(pauseCloseMarker) === -1) throw new Error("pauseCloseMarker not found");
bg = bg.replace(pauseCloseMarker, pauseCloseReplacement);
console.log('[3] Updated pauseCampaignOrchestrator tab retention logic');

// 4. Checkpoint snapshot additions in pauseCampaignOrchestrator
const chkOld = `        const checkpoint = {\n            campaignRunId: campaignState.campaignRunId,`;
const chkNew = `        const checkpoint = {\n            campaignRunId: campaignState.campaignRunId,\n            pausedHeldTabId: campaignState.pausedHeldTabId,\n            pausedHeldUrl: campaignState.pausedHeldUrl,\n            pausedHeldStage: campaignState.pausedHeldStage,`;
if (bg.indexOf(chkOld) === -1) throw new Error("checkpoint object start not found");
bg = bg.replace(chkOld, chkNew);
console.log('[4] Added held tab tracking to checkpoint');

// 5. resumeCampaignOrchestrator defaults and held tab restoration
const resumeDefaultsOld = `    campaignState.delayMs = checkpoint.delayMs || 6000;\n    campaignState.fillDelayMs = checkpoint.fillDelayMs || 300;\n    campaignState.submitDelayMs = checkpoint.submitDelayMs || 1500;`;
const resumeDefaultsNew = `    campaignState.delayMs = checkpoint.delayMs || 10000;\n    campaignState.fillDelayMs = checkpoint.fillDelayMs || 300;\n    campaignState.submitDelayMs = checkpoint.submitDelayMs || 4000;`;
if (bg.indexOf(resumeDefaultsOld) === -1) throw new Error("resumeDefaultsOld not found");
bg = bg.replace(resumeDefaultsOld, resumeDefaultsNew);

const resumeHeldOld = `    // If there is an active target tab from before pause, dismiss in-page hold if resuming in AUTO\n    if (campaignState.currentTabId || campaignState.targetTabId) {\n        const holdTabId = campaignState.currentTabId || campaignState.targetTabId;\n        if (requestedMode === 'AUTO') {\n            safeTabs.sendMessage(holdTabId, { action: 'DISMISS_MANUAL_HOLD_PANEL', reason: 'RESUMED_IN_AUTO' }).catch(() => {});\n        }\n    }`;

const resumeHeldNew = `    // [RC13 Hold Preservation] Re-attach to preserved operator hold tab if still open
    if (checkpoint.pausedHeldTabId) {
        let tabAlive = false;
        try {
            const t = await safeTabs.get(checkpoint.pausedHeldTabId);
            if (t && t.id) tabAlive = true;
        } catch (_) {}
        if (tabAlive) {
            campaignState.currentTabId = checkpoint.pausedHeldTabId;
            campaignState.targetTabId = checkpoint.pausedHeldTabId;
            logBg(checkpoint.pausedHeldTabId, \`▶️ [Resume] Operator tab \${checkpoint.pausedHeldTabId} preserved & alive. Resumed in \${requestedMode} mode.\`, "info");
            if (requestedMode === 'AUTO') {
                safeTabs.sendMessage(checkpoint.pausedHeldTabId, { action: 'DISMISS_MANUAL_HOLD_PANEL', autoSubmit: true, reason: 'RESUMED_IN_AUTO' }).catch(() => {});
            } else {
                safeTabs.sendMessage(checkpoint.pausedHeldTabId, { action: 'UPDATE_CAMPAIGN_MODE', mode: requestedMode }).catch(() => {});
            }
        } else {
            logBg(null, \`ℹ️ [Resume] Preserved operator tab \${checkpoint.pausedHeldTabId} was closed by user while paused. Proceeding with target queue.\`, "info");
        }
    } else if (campaignState.currentTabId || campaignState.targetTabId) {
        const holdTabId = campaignState.currentTabId || campaignState.targetTabId;
        if (requestedMode === 'AUTO') {
            safeTabs.sendMessage(holdTabId, { action: 'DISMISS_MANUAL_HOLD_PANEL', autoSubmit: true, reason: 'RESUMED_IN_AUTO' }).catch(() => {});
        }
    }`;

if (bg.indexOf(resumeHeldOld) === -1) throw new Error("resumeHeldOld not found");
bg = bg.replace(resumeHeldOld, resumeHeldNew);
console.log('[5] Updated resumeCampaignOrchestrator held tab restoration');

// 6. Clamping fix in orchestrateSending line 9159
const clampOld = `const holdMs = res?.metadata?.manualMode ? 20 : Math.max(3500, campaignState.submitDelayMs ? parseInt(campaignState.submitDelayMs) : 3500);`;
const clampNew = `const holdMs = res?.metadata?.manualMode ? 20 : Math.max(500, campaignState.submitDelayMs !== undefined ? parseInt(campaignState.submitDelayMs) : 4000);`;
if (bg.indexOf(clampOld) === -1) throw new Error("clampOld not found");
bg = bg.replace(clampOld, clampNew);
console.log('[6] Fixed submission holdMs clamping from Math.max(3500) to Math.max(500)');

// 7. Change line 9281 submitDelayMs
const sub9281Old = `submitDelayMs: campaignState.submitDelayMs || 1500,`;
const sub9281New = `submitDelayMs: campaignState.submitDelayMs || 4000,`;
if (bg.indexOf(sub9281Old) === -1) throw new Error("sub9281Old not found");
bg = bg.replace(sub9281Old, sub9281New);
console.log('[7] Updated line 9281 submitDelayMs to 4000');

// 8. saveCampaignState
const saveOld = `                    xpider_currentAttempt: campaignState.currentAttempt,\n                    xpider_active_campaign_run_id: campaignState.campaignRunId,\n                    xpider_owner_function_test_mode_active: Boolean(campaignState.ownerFunctionTestMode)\n                }, () => {`;
const saveNew = `                    xpider_currentAttempt: campaignState.currentAttempt,\n                    xpider_active_campaign_run_id: campaignState.campaignRunId,\n                    xpider_owner_function_test_mode_active: Boolean(campaignState.ownerFunctionTestMode),\n                    xpider_state_revision: campaignState.stateRevision || 0,\n                    xpider_run_epoch: campaignState.runEpoch || 0,\n                    xpider_campaign_mode: campaignState.campaignMode || 'AUTO'\n                }, () => {`;
if (bg.indexOf(saveOld) === -1) throw new Error("saveOld not found");
bg = bg.replace(saveOld, saveNew);
console.log('[8] Updated saveCampaignState with stateRevision and runEpoch');

// 9. restoreCampaignState
const restoreKeysOld = `'xpider_v7_active_hold_state', 'xpider_campaign_mode'`;
const restoreKeysNew = `'xpider_v7_active_hold_state', 'xpider_campaign_mode', 'xpider_state_revision', 'xpider_run_epoch'`;
if (bg.indexOf(restoreKeysOld) === -1) throw new Error("restoreKeysOld not found");
bg = bg.replace(restoreKeysOld, restoreKeysNew);

const restoreAssignOld = `                    if (hs && campaignState.campaignRunId) {\n                        hs.activeCampaignRunId = campaignState.campaignRunId;\n                    }\n                    if (hs && typeof hs.reconcileLegacyCounters === 'function') {`;
const restoreAssignNew = `                    if (hs && campaignState.campaignRunId) {\n                        hs.activeCampaignRunId = campaignState.campaignRunId;\n                    }\n                    if (typeof data.xpider_state_revision === 'number') {\n                        campaignState.stateRevision = data.xpider_state_revision;\n                    }\n                    if (typeof data.xpider_run_epoch === 'number') {\n                        campaignState.runEpoch = data.xpider_run_epoch;\n                    }\n                    if (hs && typeof hs.reconcileLegacyCounters === 'function') {`;
if (bg.indexOf(restoreAssignOld) === -1) throw new Error("restoreAssignOld not found");
bg = bg.replace(restoreAssignOld, restoreAssignNew);

const restoreDelayOld = `campaignState.submitDelayMs = data.xpider_submitDelayMs || 1500;`;
const restoreDelayNew = `campaignState.submitDelayMs = data.xpider_submitDelayMs || 4000;`;
if (bg.indexOf(restoreDelayOld) === -1) throw new Error("restoreDelayOld not found");
bg = bg.replace(restoreDelayOld, restoreDelayNew);
console.log('[9] Updated restoreCampaignState with stateRevision and runEpoch restoration');

if (isCRLF) {
    bg = bg.replace(/\n/g, '\r\n');
}

fs.writeFileSync(bgPath, bg, 'utf8');
console.log('=== ALL 9 PATCHES APPLIED TO BACKGROUND.JS SUCCESSFULLY ===');
