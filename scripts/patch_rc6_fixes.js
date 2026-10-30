const fs = require('fs');
const path = require('path');

console.log('=== APPLYING RC6 FIXES: RESUME INERT + URL CONTRAST + QUEUE RECONCILIATION ===');

// =========================================================================
// 1. PATCH extension/popup.css
// =========================================================================
let css = fs.readFileSync('extension/popup.css', 'utf8');

// Replace .file-urls-preview styling
const previewRegex = /\/\* File URLs Preview Area \*\/[\s\S]*?\.file-urls-preview \.preview-item:hover\s*\{[\s\S]*?\}/;
const newPreviewCss = `/* File URLs Preview Area — High Contrast Dark Mode (RC6) */
.file-urls-preview {
    margin-top: 10px;
    background: #0f172a !important;
    border: 1px solid #38bdf8 !important;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 160px;
}

.file-urls-preview .preview-header {
    font-size: 0.8rem !important;
    font-weight: 700 !important;
    color: #38bdf8 !important;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid rgba(56, 189, 248, 0.3) !important;
    padding-bottom: 5px;
}

.file-urls-preview .preview-list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 120px;
    padding-right: 4px;
}

.file-urls-preview .preview-item,
.file-urls-preview .preview-item * {
    font-size: 0.82rem !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
    font-weight: 600 !important;
    color: #ffffff !important;
    opacity: 1 !important;
}

.file-urls-preview .preview-item {
    background: rgba(30, 41, 59, 0.95) !important;
    border: 1px solid rgba(148, 163, 184, 0.4) !important;
    border-left: 3px solid #38bdf8 !important;
    padding: 6px 10px !important;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.2s ease-in-out;
}

.file-urls-preview .preview-item:hover,
.file-urls-preview .preview-item:focus {
    background: rgba(56, 189, 248, 0.25) !important;
    border-color: #38bdf8 !important;
    color: #38bdf8 !important;
    outline: none !important;
}

.file-urls-preview .preview-item.selected {
    background: rgba(34, 197, 94, 0.25) !important;
    border-color: #22c55e !important;
    border-left: 3px solid #22c55e !important;
    color: #4ade80 !important;
}`;

if (previewRegex.test(css)) {
    css = css.replace(previewRegex, newPreviewCss);
    console.log('[popup.css] High-contrast preview styles updated.');
} else {
    // Append if not found
    css += '\n\n' + newPreviewCss;
    console.log('[popup.css] High-contrast preview styles appended.');
}

// Add explicit z-index for #resume-mode-modal-overlay
if (!css.includes('#resume-mode-modal-overlay')) {
    css += `\n\n/* [RC6] Resume Mode Modal Overlay Stacking */\n#resume-mode-modal-overlay {\n    z-index: 99999 !important;\n}\n`;
    console.log('[popup.css] Added #resume-mode-modal-overlay z-index rule.');
}

fs.writeFileSync('extension/popup.css', css, 'utf8');

// =========================================================================
// 2. PATCH extension/popup.html
// =========================================================================
let html = fs.readFileSync('extension/popup.html', 'utf8');

// Ensure resume modal has z-index: 99999 in inline style
html = html.replace(
    'id="resume-mode-modal-overlay" class="modal-overlay hidden" style="display: none;"',
    'id="resume-mode-modal-overlay" class="modal-overlay hidden" style="display: none; z-index: 99999;"'
);

fs.writeFileSync('extension/popup.html', html, 'utf8');
console.log('[popup.html] Updated resume modal inline style.');

// =========================================================================
// 3. PATCH extension/popup.js
// =========================================================================
let js = fs.readFileSync('extension/popup.js', 'utf8');

// A. Update checkAndRefreshPrivacyReadinessHUD to show CAMPAIGN: PAUSED (${remaining} remaining)
const oldHudPill = `                    } else if (qLen > 0) {
                        campPill.textContent = \`CAMPAIGN: READY (\${qLen} URLs)\`;
                        campPill.style.color = '#22c55e';
                    } else {`;

const newHudPill = `                    } else if (campaignPaused || window.__xpider_has_paused_checkpoint) {
                        const remDisplay = (typeof remainingTargets !== 'undefined' && remainingTargets > 0) ? remainingTargets : qLen;
                        campPill.textContent = \`CAMPAIGN: PAUSED (\${remDisplay} remaining)\`;
                        campPill.style.color = '#00ffcc';
                    } else if (qLen > 0) {
                        campPill.textContent = \`CAMPAIGN: READY (\${qLen} URLs)\`;
                        campPill.style.color = '#22c55e';
                    } else {`;

if (js.includes(oldHudPill)) {
    js = js.replace(oldHudPill, newHudPill);
    console.log('[popup.js] checkAndRefreshPrivacyReadinessHUD updated with PAUSED state.');
} else {
    console.warn('[popup.js] Warning: oldHudPill pattern not found.');
}

// B. Update storage hydration in initial GET_STATE
const oldHydrateSuccess = `                try {
                    const st = await chrome.storage.local.get(['xpider_queue', 'xpider_total', 'xpider_success']);
                    if (Array.isArray(st.xpider_queue) && st.xpider_queue.length > 0) {
                        campaignQueue = [...st.xpider_queue];
                        if (!totalTargets) totalTargets = st.xpider_total || campaignQueue.length;
                        if (!successCount) successCount = st.xpider_success || 0;
                        renderUrlsPreview(campaignQueue);
                        const countDisplay = document.getElementById('url-count-display');
                        if (countDisplay && !response.isActive) {
                            countDisplay.textContent = \`\${campaignQueue.length} (remaining) / \${totalTargets} URLs\`;
                        }
                    }
                } catch (_) {}`;

const newHydrateSuccess = `                try {
                    const st = await chrome.storage.local.get(['xpider_queue', 'xpider_total', 'xpider_success', 'xpider_paused_checkpoint', 'xpider_isPaused']);
                    const cp = (response && response.hasPausedCheckpoint) ? (response.checkpoint || st.xpider_paused_checkpoint) : st.xpider_paused_checkpoint;
                    const isPausedState = Boolean(response.isPaused || st.xpider_isPaused || (cp && Array.isArray(cp.remainingQueue) && cp.remainingQueue.length > 0 && !response.isActive));
                    if (isPausedState && cp && Array.isArray(cp.remainingQueue) && cp.remainingQueue.length > 0) {
                        campaignPaused = true;
                        window.__xpider_has_paused_checkpoint = true;
                        campaignQueue = [...cp.remainingQueue];
                        remainingTargets = cp.remainingQueue.length;
                        if (!totalTargets) totalTargets = cp.totalTargets || (cp.remainingQueue.length + (cp.visitedUrls ? cp.visitedUrls.length : 0));
                        renderUrlsPreview(campaignQueue);
                        const countDisplay = document.getElementById('url-count-display');
                        if (countDisplay) {
                            countDisplay.textContent = \`\${campaignQueue.length} (remaining) / \${totalTargets} URLs\`;
                        }
                    } else if (Array.isArray(st.xpider_queue) && st.xpider_queue.length > 0) {
                        campaignQueue = [...st.xpider_queue];
                        if (!totalTargets) totalTargets = st.xpider_total || campaignQueue.length;
                        if (!successCount) successCount = st.xpider_success || 0;
                        renderUrlsPreview(campaignQueue);
                        const countDisplay = document.getElementById('url-count-display');
                        if (countDisplay && !response.isActive) {
                            countDisplay.textContent = \`\${campaignQueue.length} (remaining) / \${totalTargets} URLs\`;
                        }
                    }
                } catch (_) {}`;

if (js.includes(oldHydrateSuccess)) {
    js = js.replace(oldHydrateSuccess, newHydrateSuccess);
    console.log('[popup.js] Initial storage hydration updated with paused checkpoint priority.');
} else {
    console.warn('[popup.js] Warning: oldHydrateSuccess pattern not found.');
}

// C. Update promptResumeCampaignMode to be completely synchronous and robust
const oldPromptFunc = `function promptResumeCampaignMode(defaultModeOverride) {
    wireResumeModeModalOnce();
    const openModalWithMode = (prevMode) => {
        const effectivePrev = (prevMode === 'MANUAL' || prevMode === 'AUTO')
            ? prevMode
            : ((window.__xpider_last_paused_mode === 'MANUAL' || window.__xpider_last_paused_mode === 'AUTO') ? window.__xpider_last_paused_mode : (currentCampaignMode || 'AUTO'));
        window.__xpider_last_paused_mode = effectivePrev;
        applyResumeModeSelectionUI(effectivePrev, effectivePrev);
        const modal = document.getElementById('resume-mode-modal-overlay');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
    };

    if (defaultModeOverride === 'MANUAL' || defaultModeOverride === 'AUTO') {
        openModalWithMode(defaultModeOverride);
        return;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
            const stateMode = stateResp && (stateResp.pausedCampaignMode || stateResp.campaignMode);
            openModalWithMode(stateMode);
        });
    } else {
        openModalWithMode(window.__xpider_last_paused_mode || currentCampaignMode || 'AUTO');
    }
}`;

const newPromptFunc = `function promptResumeCampaignMode(defaultModeOverride) {
    console.log('[RESUME_CLICK] promptResumeCampaignMode invoked, defaultModeOverride=', defaultModeOverride);
    wireResumeModeModalOnce();
    const openModalWithMode = (prevMode) => {
        const effectivePrev = (prevMode === 'MANUAL' || prevMode === 'AUTO')
            ? prevMode
            : ((window.__xpider_last_paused_mode === 'MANUAL' || window.__xpider_last_paused_mode === 'AUTO') ? window.__xpider_last_paused_mode : (currentCampaignMode || 'AUTO'));
        window.__xpider_last_paused_mode = effectivePrev;
        applyResumeModeSelectionUI(effectivePrev, effectivePrev);
        const modal = document.getElementById('resume-mode-modal-overlay');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.setProperty('display', 'flex', 'important');
            modal.style.setProperty('visibility', 'visible', 'important');
            modal.style.setProperty('opacity', '1', 'important');
            modal.style.setProperty('pointer-events', 'auto', 'important');
            console.log('[RESUME_MODAL_OPEN] Modal overlay displayed successfully. Mode=', effectivePrev);
        } else {
            console.error('[RESUME_MODAL_ERROR] #resume-mode-modal-overlay not found in DOM!');
        }
    };

    // 1. Open immediately and synchronously with best-known mode
    const initialMode = (defaultModeOverride === 'MANUAL' || defaultModeOverride === 'AUTO')
        ? defaultModeOverride
        : (window.__xpider_last_paused_mode || currentCampaignMode || 'AUTO');
    openModalWithMode(initialMode);

    // 2. Refresh mode asynchronously from background if available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
            if (chrome.runtime.lastError) return;
            const stateMode = stateResp && (stateResp.pausedCampaignMode || stateResp.campaignMode);
            if (stateMode === 'MANUAL' || stateMode === 'AUTO') {
                openModalWithMode(stateMode);
            }
        });
    }
}`;

if (js.includes(oldPromptFunc)) {
    js = js.replace(oldPromptFunc, newPromptFunc);
    console.log('[popup.js] promptResumeCampaignMode made synchronous & bulletproof.');
} else {
    console.warn('[popup.js] Warning: oldPromptFunc pattern not found.');
}

// D. Update cancelResumeCampaignModal with setProperty
const oldCancelFunc = `function cancelResumeCampaignModal() {
    const modal = document.getElementById('resume-mode-modal-overlay');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    // Strictly preserve paused state without dispatching RESUME_CAMPAIGN
    addDiagnosticLog('[Engine][ResumeModal] Cancel clicked — paused state preserved.');
    return { cancelled: true, campaignPaused: true, campaignActive: false };
}`;

const newCancelFunc = `function cancelResumeCampaignModal() {
    const modal = document.getElementById('resume-mode-modal-overlay');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
        modal.style.setProperty('visibility', 'hidden', 'important');
        modal.style.setProperty('pointer-events', 'none', 'important');
    }
    // Strictly preserve paused state without dispatching RESUME_CAMPAIGN
    addDiagnosticLog('[Engine][ResumeModal] Cancel clicked — paused state preserved.');
    return { cancelled: true, campaignPaused: true, campaignActive: false };
}`;

if (js.includes(oldCancelFunc)) {
    js = js.replace(oldCancelFunc, newCancelFunc);
    console.log('[popup.js] cancelResumeCampaignModal updated.');
} else {
    console.warn('[popup.js] Warning: oldCancelFunc pattern not found.');
}

// E. Update checkResumableCheckpoint to guarantee direct onclick wiring
const oldCheckCheckpoint = `function checkResumableCheckpoint() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
        const banner = document.getElementById('resumable-campaign-banner');
        const countEl = document.getElementById('resumable-remaining-count');
        if (!banner) return;
        if (stateResp && (stateResp.pausedCampaignMode || stateResp.campaignMode)) {
            window.__xpider_last_paused_mode = stateResp.pausedCampaignMode || stateResp.campaignMode;
        }
        if (stateResp && stateResp.hasPausedCheckpoint && !stateResp.isActive) {
            banner.classList.remove('hidden');
            banner.style.display = 'block';
            if (countEl) countEl.textContent = stateResp.pausedRemainingCount || 0;
        } else {
            banner.classList.add('hidden');
            banner.style.display = 'none';
        }
    });
}`;

const newCheckCheckpoint = `function checkResumableCheckpoint() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
        if (chrome.runtime.lastError) return;
        const banner = document.getElementById('resumable-campaign-banner');
        const countEl = document.getElementById('resumable-remaining-count');
        const resumeBtn = document.getElementById('resume-campaign-btn');
        const pauseBtn = document.getElementById('pause-btn');
        if (!banner) return;
        if (stateResp && (stateResp.pausedCampaignMode || stateResp.campaignMode)) {
            window.__xpider_last_paused_mode = stateResp.pausedCampaignMode || stateResp.campaignMode;
        }
        if (stateResp && stateResp.hasPausedCheckpoint && !stateResp.isActive) {
            campaignPaused = true;
            window.__xpider_has_paused_checkpoint = true;
            remainingTargets = stateResp.pausedRemainingCount || remainingTargets || 0;
            banner.classList.remove('hidden');
            banner.style.display = 'block';
            if (countEl) countEl.textContent = stateResp.pausedRemainingCount || 0;
            
            // Wire resume button directly to guarantee clickability
            if (resumeBtn) {
                resumeBtn.onclick = (e) => {
                    if (e) e.preventDefault();
                    resumeCampaign();
                };
            }
            if (pauseBtn) {
                pauseBtn.textContent = '▶️ Resume';
                pauseBtn.style.backgroundColor = '#22c55e';
            }
            if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                window.checkAndRefreshPrivacyReadinessHUD();
            }
        } else {
            banner.classList.add('hidden');
            banner.style.display = 'none';
        }
    });
}`;

if (js.includes(oldCheckCheckpoint)) {
    js = js.replace(oldCheckCheckpoint, newCheckCheckpoint);
    console.log('[popup.js] checkResumableCheckpoint updated with direct button wiring & pause sync.');
} else {
    console.warn('[popup.js] Warning: oldCheckCheckpoint pattern not found.');
}

// F. Update togglePause to handle checkpoint/paused condition cleanly
const oldTogglePause = `    if (campaignPaused) {
        promptResumeCampaignMode();
        return;
    }`;

const newTogglePause = `    if (campaignPaused || window.__xpider_has_paused_checkpoint) {
        promptResumeCampaignMode();
        return;
    }`;

if (js.includes(oldTogglePause)) {
    js = js.replace(oldTogglePause, newTogglePause);
    console.log('[popup.js] togglePause updated with checkpoint awareness.');
}

fs.writeFileSync('extension/popup.js', js, 'utf8');

// =========================================================================
// 4. PATCH extension/background.js
// =========================================================================
let bg = fs.readFileSync('extension/background.js', 'utf8');

// Ensure pauseCampaignOrchestrator syncs xpider_queue along with checkpoint
const oldBgPauseSet = `        await chrome.storage.local.set({
            xpider_paused_checkpoint: checkpoint,
            xpider_isPaused: true,
            xpider_isActive: false
        });`;

const newBgPauseSet = `        await chrome.storage.local.set({
            xpider_paused_checkpoint: checkpoint,
            xpider_queue: checkpoint.remainingQueue || campaignState.queue || [],
            xpider_isPaused: true,
            xpider_isActive: false
        });`;

if (bg.includes(oldBgPauseSet)) {
    bg = bg.replace(oldBgPauseSet, newBgPauseSet);
    console.log('[background.js] pauseCampaignOrchestrator updated to sync xpider_queue.');
}

// In restoreCampaignState, ensure xpider_queue is updated
const oldBgRestoreSet = `                            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                                chrome.storage.local.set({ xpider_paused_checkpoint: data.xpider_paused_checkpoint });
                            }`;

const newBgRestoreSet = `                            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                                chrome.storage.local.set({
                                    xpider_paused_checkpoint: data.xpider_paused_checkpoint,
                                    xpider_queue: campaignState.queue
                                });
                            }`;

if (bg.includes(oldBgRestoreSet)) {
    bg = bg.replace(oldBgRestoreSet, newBgRestoreSet);
    console.log('[background.js] restoreCampaignState updated to sync xpider_queue.');
}

fs.writeFileSync('extension/background.js', bg, 'utf8');

// =========================================================================
// 5. UPDATE extension/modules/build-provenance.js BUILD_ID
// =========================================================================
let prov = fs.readFileSync('extension/modules/build-provenance.js', 'utf8');
prov = prov.replace(/V7\.0\.0-RC5-[^"']+/g, 'V7.0.0-RC6-20261030-RESUME-CONTRAST-PARITY-PASS');
fs.writeFileSync('extension/modules/build-provenance.js', prov, 'utf8');
console.log('[build-provenance.js] BUILD_ID bumped to RC6.');

console.log('=== ALL RC6 CODE FIXES APPLIED SUCCESSFULLY ===');

