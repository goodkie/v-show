const fs = require('fs');
const path = require('path');

console.log('=== RC3.60 .93 PATCH: CAPTCHA CREDENTIAL PERSISTENCE, DIAGNOSTICS & FORM CLASSIFICATION REPAIR ===');

function normalizeCRLF(str) {
    return str.replace(/\r\n/g, '\n');
}

function restoreCRLF(str, origHadCRLF) {
    if (origHadCRLF) {
        return str.replace(/\r?\n/g, '\r\n');
    }
    return str;
}

// 1. Patch extension/background.js
{
    const bgPath = path.resolve('extension/background.js');
    let bgRaw = fs.readFileSync(bgPath, 'utf8');
    const origCRLF = bgRaw.includes('\r\n');
    let bg = normalizeCRLF(bgRaw);

    // Diagnostic state variable
    if (!bg.includes('let solverDiagnosticsState =')) {
        bg = bg.replace(
            `const solver = new self.XpiderSolverCore();`,
            `const solver = new self.XpiderSolverCore();\nlet solverDiagnosticsState = { provider: 'api', keyConfigured: false, keySource: 'none', lastSyncedAt: Date.now() };`
        );
        console.log('✓ Added solverDiagnosticsState variable');
    }

    // Startup credentials boot (lines ~1485-1510)
    const oldBootBlock = `// [Auto CAPTCHA Solver Boot] Restore CAPTCHA credentials from persistent storage on startup
(async () => {
    try {
        const stored = await chrome.storage.local.get([
            'xpider_captcha_method', 'xpider_captcha_api_key', 'captchaMethod', 'captchaApiKey',
            'xpider_stt_api_key', 'audioSttKey', 'witKey'
        ]);
        const method = stored.xpider_captcha_method || stored.captchaMethod || 'api';
        const apiKey = stored.xpider_captcha_api_key || stored.captchaApiKey || '';
        const witKey = stored.xpider_stt_api_key || stored.audioSttKey || stored.witKey || '';

        if (witKey) solver.config.witAiKey = witKey;
        if (method === 'api' || method === '2captcha') {
            if (apiKey) {
                solver.config.twoCaptchaKey = apiKey;
                logBg(null, \`[Auto CAPTCHA Solver Boot] 2Captcha key restored keyConfigured=true\`, 'info');
            }
        } else if (method === 'nopecha') {
            if (apiKey) {
                solver.config.nopeChaKey = apiKey;
                logBg(null, \`[Auto CAPTCHA Solver Boot] NopeCHA key restored\`, 'info');
            }
        }
    } catch (bootErr) {
        console.warn('[Auto CAPTCHA Solver Boot] Failed to restore credentials:', bootErr.message);
    }
})();`;

    const newBootBlock = `// [Auto CAPTCHA Solver Boot] Restore CAPTCHA credentials from persistent storage on startup
(async () => {
    try {
        const stored = await chrome.storage.local.get([
            'xpider_captcha_method', 'xpider_captcha_api_key', 'captchaMethod', 'captchaApiKey',
            'xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha',
            'xpider_stt_api_key', 'audioSttKey', 'witKey'
        ]);
        const method = stored.xpider_captcha_method || stored.captchaMethod || 'api';
        let apiKey = '';
        let keySource = 'none';

        if (method === 'nopecha') {
            if (stored.xpider_captcha_api_key_nopecha) {
                apiKey = stored.xpider_captcha_api_key_nopecha;
                keySource = 'storage.xpider_captcha_api_key_nopecha';
            } else if (stored.xpider_captcha_api_key) {
                apiKey = stored.xpider_captcha_api_key;
                keySource = 'storage.xpider_captcha_api_key';
            } else if (stored.captchaApiKey) {
                apiKey = stored.captchaApiKey;
                keySource = 'storage.captchaApiKey';
            }
        } else if (method === 'api' || method === '2captcha') {
            if (stored.xpider_captcha_api_key_2captcha) {
                apiKey = stored.xpider_captcha_api_key_2captcha;
                keySource = 'storage.xpider_captcha_api_key_2captcha';
            } else if (stored.xpider_captcha_api_key) {
                apiKey = stored.xpider_captcha_api_key;
                keySource = 'storage.xpider_captcha_api_key';
            } else if (stored.captchaApiKey) {
                apiKey = stored.captchaApiKey;
                keySource = 'storage.captchaApiKey';
            }
        }

        const witKey = stored.xpider_stt_api_key || stored.audioSttKey || stored.witKey || '';
        if (witKey) solver.config.witAiKey = witKey;

        solverDiagnosticsState = {
            provider: method,
            keyConfigured: Boolean(apiKey),
            keySource: keySource,
            lastSyncedAt: Date.now()
        };

        if (method === 'api' || method === '2captcha') {
            if (apiKey) {
                solver.config.twoCaptchaKey = apiKey;
                solver.config.nopeChaKey = null;
            }
            logBg(null, \`[Auto CAPTCHA Solver Boot] method=\${method} keyConfigured=\${Boolean(apiKey)} source=\${keySource}\`, 'info');
        } else if (method === 'nopecha') {
            if (apiKey) {
                solver.config.nopeChaKey = apiKey;
                solver.config.twoCaptchaKey = null;
            }
            logBg(null, \`[Auto CAPTCHA Solver Boot] method=nopecha keyConfigured=\${Boolean(apiKey)} source=\${keySource}\`, 'info');
        }
    } catch (bootErr) {
        console.warn('[Auto CAPTCHA Solver Boot] Failed to restore credentials:', bootErr.message);
    }
})();`;

    if (bg.includes(oldBootBlock)) {
        bg = bg.replace(oldBootBlock, newBootBlock);
        console.log('✓ Patched background.js startup boot loader');
    } else {
        console.warn('! Could not find oldBootBlock in background.js');
    }

    // UPDATE_CAPTCHA_KEY case in background.js
    const oldUpdateKeyBlock = `        case 'UPDATE_CAPTCHA_KEY':
            // [Auto CAPTCHA Solver] Live sync of CAPTCHA method + API key to solver engine
            (async () => {
                const method = request.method || 'api';
                const key = request.key || '';
                const shortKey = key ? key.substring(0, 8) + '...' : 'NONE';
                logBg(null, \`[CAPTCHA-Sync] method=\${method} key=\${shortKey}\`, 'info');
                await chrome.storage.local.set({
                    xpider_captcha_method: method,
                    xpider_captcha_api_key: key,
                    captchaMethod: method,
                    captchaApiKey: key
                });
                // Apply to live solver instance immediately
                if (method === 'api' || method === '2captcha') {
                    solver.config.twoCaptchaKey = key;
                    solver.config.nopeChaKey = null;
                } else if (method === 'nopecha') {
                    solver.config.nopeChaKey = key;
                    solver.config.twoCaptchaKey = null;
                } else {
                    solver.config.twoCaptchaKey = null;
                    solver.config.nopeChaKey = null;
                }
                sendResponse({ success: true, method, applied: !!key });
            })();
            return true;`;

    const newUpdateKeyBlock = `        case 'UPDATE_CAPTCHA_KEY':
            // [Auto CAPTCHA Solver] Live sync of CAPTCHA method + API key to solver engine
            (async () => {
                const method = request.method || 'api';
                let key = (typeof request.key === 'string') ? request.key.trim() : '';
                let keySource = 'runtime_update';

                // Prevent accidental key wipe on method toggle when caller passed empty key
                if (!key && !request.clearKey) {
                    const stored = await chrome.storage.local.get([
                        'xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha',
                        'xpider_captcha_api_key', 'captchaApiKey'
                    ]);
                    if (method === 'nopecha') {
                        key = stored.xpider_captcha_api_key_nopecha || stored.xpider_captcha_api_key || stored.captchaApiKey || '';
                        if (key) keySource = 'storage.xpider_captcha_api_key_nopecha';
                    } else if (method === 'api' || method === '2captcha') {
                        key = stored.xpider_captcha_api_key_2captcha || stored.xpider_captcha_api_key || stored.captchaApiKey || '';
                        if (key) keySource = 'storage.xpider_captcha_api_key_2captcha';
                    }
                }

                // Sanitize log: NEVER log the key or substring
                logBg(null, \`[CAPTCHA-Sync] method=\${method} keyConfigured=\${Boolean(key)} source=\${keySource}\`, 'info');
                
                const storagePayload = {
                    xpider_captcha_method: method,
                    xpider_captcha_api_key: key,
                    captchaMethod: method,
                    captchaApiKey: key
                };
                if (method === 'nopecha') {
                    storagePayload.xpider_captcha_api_key_nopecha = key;
                } else if (method === 'api' || method === '2captcha') {
                    storagePayload.xpider_captcha_api_key_2captcha = key;
                }
                await chrome.storage.local.set(storagePayload);

                // Apply to live solver instance immediately
                if (method === 'api' || method === '2captcha') {
                    solver.config.twoCaptchaKey = key || null;
                    solver.config.nopeChaKey = null;
                } else if (method === 'nopecha') {
                    solver.config.nopeChaKey = key || null;
                    solver.config.twoCaptchaKey = null;
                } else {
                    solver.config.twoCaptchaKey = null;
                    solver.config.nopeChaKey = null;
                }

                solverDiagnosticsState = {
                    provider: method,
                    keyConfigured: Boolean(key),
                    keySource: keySource,
                    lastSyncedAt: Date.now()
                };

                sendResponse({ success: true, method, applied: !!key, keyConfigured: !!key, source: keySource });
            })();
            return true;

        case 'QUERY_SOLVER_DIAGNOSTICS':
            // [Issue #6 RC3.60 .93] SAFE Administrative Solver Diagnostics
            (async () => {
                const stored = await chrome.storage.local.get([
                    'xpider_captcha_method', 'xpider_captcha_api_key',
                    'xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha',
                    'captchaMethod', 'captchaApiKey'
                ]);
                const method = stored.xpider_captcha_method || stored.captchaMethod || 'api';
                let apiKey = '';
                let keySource = 'none';
                if (method === 'nopecha') {
                    if (stored.xpider_captcha_api_key_nopecha) { apiKey = stored.xpider_captcha_api_key_nopecha; keySource = 'storage.xpider_captcha_api_key_nopecha'; }
                    else if (stored.xpider_captcha_api_key) { apiKey = stored.xpider_captcha_api_key; keySource = 'storage.xpider_captcha_api_key'; }
                    else if (stored.captchaApiKey) { apiKey = stored.captchaApiKey; keySource = 'storage.captchaApiKey'; }
                } else {
                    if (stored.xpider_captcha_api_key_2captcha) { apiKey = stored.xpider_captcha_api_key_2captcha; keySource = 'storage.xpider_captcha_api_key_2captcha'; }
                    else if (stored.xpider_captcha_api_key) { apiKey = stored.xpider_captcha_api_key; keySource = 'storage.xpider_captcha_api_key'; }
                    else if (stored.captchaApiKey) { apiKey = stored.captchaApiKey; keySource = 'storage.captchaApiKey'; }
                }
                const keyPresent = Boolean(apiKey && apiKey.trim().length > 0);
                sendResponse({
                    success: true,
                    diagnostics: {
                        provider: method,
                        mode: method,
                        keyPresent: keyPresent,
                        keyConfigured: keyPresent,
                        keySource: keySource,
                        authStatus: keyPresent ? 'CONFIGURED' : 'UNCONFIGURED',
                        providerConnected: keyPresent,
                        documentationRef: method === 'nopecha' ? 'https://developers.nopecha.com/guides/getting_started/' : 'https://2captcha.com/api-docs',
                        verifiedLiveProof: false // Mark UNVERIFIED without live owner runtime proof
                    }
                });
            })();
            return true;`;

    if (bg.includes(oldUpdateKeyBlock)) {
        bg = bg.replace(oldUpdateKeyBlock, newUpdateKeyBlock);
        console.log('✓ Patched UPDATE_CAPTCHA_KEY and added QUERY_SOLVER_DIAGNOSTICS');
    } else {
        console.warn('! Could not find oldUpdateKeyBlock in background.js');
    }

    // Replace silent skip with user-visible manual challenge wait in background.js (lines ~5583-5620)
    const oldSilentSkipBlock = `                        } else {
                            campaignState.captchaLedger.pendingOwner = Math.max(0, campaignState.captchaLedger.pendingOwner - 1);
                            campaignState.captchaLedger.manualSkip++;
                            campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
                            logBg(null, \`[OWNER_CAPTCHA] Auto-first: no configured solver key and popup disabled. Advancing as SKIPPED.\`, 'info');
                            
                            if (campaignState.currentAttempt?.attemptId) {
                                campaignState.captchaFailuresRecorded.add(campaignState.currentAttempt.attemptId);
                            }

                            if (campaignState.targetDeadlineController) {
                                campaignState.targetDeadlineController.cancel('CAPTCHA_SKIPPED_NO_SOLVER');
                            }

                            if (campaignState.currentTabId && chrome.alarms) {
                                chrome.alarms.clear(\`xpider_watchdog_\${campaignState.currentTabId}_\${campaignState.sessionId}\`);
                            }

                            chrome.tabs.sendMessage(campaignState.currentTabId, {
                                action: 'CAPTCHA_SKIP_DECISION',
                                attemptId: campaignState.currentAttempt?.attemptId,
                                targetToken: campaignState.currentTargetToken,
                                campaignRunId: campaignState.campaignRunId,
                                sessionId: campaignState.sessionId,
                                captchaEpoch: curEpoch,
                                tabId: campaignState.currentTabId,
                                result: 'SKIPPED',
                                reason: 'CAPTCHA_SKIPPED_NO_SOLVER'
                            }).catch(() => {});

                            if (typeof campaignState.targetResolve === 'function') {
                                const resolveTarget = campaignState.targetResolve;
                                campaignState.targetResolve = null;
                                resolveTarget({
                                    success: false,
                                    reasonCode: 'CAPTCHA_SKIPPED_NO_SOLVER',
                                    metadata: {
                                        captchaStatus: 'SKIPPED_NO_SOLVER',`;

    const newManualWaitBlock = `                        } else {
                            // [Issue #6 RC3.60 .93] Directive #6513087470 Item 3:
                            // Ensure manual challenge pause and accessible user-visible action when provider is unconfigured; NO silent SKIP!
                            const curAttemptId = campaignState.currentAttempt?.attemptId;
                            campaignState.manualFallbackAttemptId = curAttemptId;
                            campaignState.currentTargetStage = 'CAPTCHA_PENDING_MANUAL';
                            logBg(null, \`[OWNER_CAPTCHA] Solver key missing or unconfigured. Pausing for accessible manual challenge resolution.\`, 'warning');
                            
                            if (campaignState.targetDeadlineController) {
                                campaignState.targetDeadlineController.pause('CAPTCHA_PENDING_MANUAL');
                            }

                            if (campaignState.currentTabId) {
                                chrome.tabs.sendMessage(campaignState.currentTabId, {
                                    action: 'START_MANUAL_CAPTCHA_WAIT',
                                    attemptId: curAttemptId,
                                    targetToken: campaignState.currentTargetToken,
                                    campaignRunId: campaignState.campaignRunId,
                                    sessionId: campaignState.sessionId,
                                    captchaEpoch: curEpoch,
                                    tabId: campaignState.currentTabId,
                                    fallbackFrom: userSettings.xpider_captcha_method || 'provider',
                                    message: 'No solver key configured. Please solve CAPTCHA in browser.'
                                }).catch(() => {});
                            }
                            return;
                        } else if (false) {
                            campaignState.captchaLedger.pendingOwner = Math.max(0, campaignState.captchaLedger.pendingOwner - 1);
                            campaignState.captchaLedger.manualSkip++;
                            campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
                            logBg(null, \`[OWNER_CAPTCHA] Auto-first: no configured solver key and popup disabled. Advancing as SKIPPED.\`, 'info');
                            
                            if (campaignState.currentAttempt?.attemptId) {
                                campaignState.captchaFailuresRecorded.add(campaignState.currentAttempt.attemptId);
                            }

                            if (campaignState.targetDeadlineController) {
                                campaignState.targetDeadlineController.cancel('CAPTCHA_SKIPPED_NO_SOLVER');
                            }

                            if (campaignState.currentTabId && chrome.alarms) {
                                chrome.alarms.clear(\`xpider_watchdog_\${campaignState.currentTabId}_\${campaignState.sessionId}\`);
                            }

                            chrome.tabs.sendMessage(campaignState.currentTabId, {
                                action: 'CAPTCHA_SKIP_DECISION',
                                attemptId: campaignState.currentAttempt?.attemptId,
                                targetToken: campaignState.currentTargetToken,
                                campaignRunId: campaignState.campaignRunId,
                                sessionId: campaignState.sessionId,
                                captchaEpoch: curEpoch,
                                tabId: campaignState.currentTabId,
                                result: 'SKIPPED',
                                reason: 'CAPTCHA_SKIPPED_NO_SOLVER'
                            }).catch(() => {});

                            if (typeof campaignState.targetResolve === 'function') {
                                const resolveTarget = campaignState.targetResolve;
                                campaignState.targetResolve = null;
                                resolveTarget({
                                    success: false,
                                    reasonCode: 'CAPTCHA_SKIPPED_NO_SOLVER',
                                    metadata: {
                                        captchaStatus: 'SKIPPED_NO_SOLVER',`;

    if (bg.includes(oldSilentSkipBlock)) {
        bg = bg.replace(oldSilentSkipBlock, newManualWaitBlock);
        console.log('✓ Patched background.js unconfigured solver manual pause flow');
    } else {
        console.warn('! Could not find oldSilentSkipBlock in background.js');
    }

    fs.writeFileSync(bgPath, restoreCRLF(bg, origCRLF), 'utf8');
}

// 2. Patch extension/popup.js
{
    const popupPath = path.resolve('extension/popup.js');
    let popupRaw = fs.readFileSync(popupPath, 'utf8');
    const origCRLF = popupRaw.includes('\r\n');
    let popup = normalizeCRLF(popupRaw);

    // Method change listener: preserve fallback to generic key
    const oldMethodChange = `        methodSelect.addEventListener('change', async () => {
            const newMethod = methodSelect.value;
            const stored = await chrome.storage.local.get(['xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha']);
            if (apiKeyInput) {
                apiKeyInput.value = newMethod === 'nopecha'
                    ? (stored.xpider_captcha_api_key_nopecha || '')
                    : (stored.xpider_captcha_api_key_2captcha || '');
            }
            updateCaptchaMethodUI(newMethod);
        });`;

    const newMethodChange = `        methodSelect.addEventListener('change', async () => {
            const newMethod = methodSelect.value;
            const stored = await chrome.storage.local.get(['xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha', 'xpider_captcha_api_key']);
            if (apiKeyInput) {
                apiKeyInput.value = newMethod === 'nopecha'
                    ? (stored.xpider_captcha_api_key_nopecha || stored.xpider_captcha_api_key || '')
                    : (stored.xpider_captcha_api_key_2captcha || stored.xpider_captcha_api_key || '');
            }
            updateCaptchaMethodUI(newMethod);
        });`;

    if (popup.includes(oldMethodChange)) {
        popup = popup.replace(oldMethodChange, newMethodChange);
        console.log('✓ Patched popup.js methodSelect change fallback');
    } else {
        console.warn('! Could not find oldMethodChange in popup.js');
    }

    // SaveSettings: preserve existing key if user didn't change it or left it blank
    const oldEnteredApiKey = `const enteredApiKey = apiKeyInput ? apiKeyInput.value.trim() : '';`;
    const newEnteredApiKey = `let enteredApiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        if (!enteredApiKey) {
            const storedKeys = await chrome.storage.local.get(['xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha', 'xpider_captcha_api_key']);
            if (selectedMethod === 'nopecha') {
                enteredApiKey = storedKeys.xpider_captcha_api_key_nopecha || storedKeys.xpider_captcha_api_key || '';
            } else if (selectedMethod === '2captcha' || selectedMethod === 'api') {
                enteredApiKey = storedKeys.xpider_captcha_api_key_2captcha || storedKeys.xpider_captcha_api_key || '';
            }
        }`;

    if (popup.includes(oldEnteredApiKey) && !popup.includes('storedKeys.xpider_captcha_api_key_nopecha')) {
        popup = popup.replace(oldEnteredApiKey, newEnteredApiKey);
        console.log('✓ Patched popup.js enteredApiKey preservation');
    }

    fs.writeFileSync(popupPath, restoreCRLF(popup, origCRLF), 'utf8');
}

// 3. Patch extension/content-script.js
{
    const csPath = path.resolve('extension/content-script.js');
    let csRaw = fs.readFileSync(csPath, 'utf8');
    const origCRLF = csRaw.includes('\r\n');
    let cs = normalizeCRLF(csRaw);

    // Exclude captcha challenge fields from snapshot isRequired in freezeFieldValues
    const oldFreezeLoop = `        for (const el of fields) {
            const val = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            const checked = !!el.checked;
            const isReq = !!(el.required || el.getAttribute('aria-required') === 'true');`;

    const newFreezeLoop = `        for (const el of fields) {
            const isCaptcha = isCaptchaChallengeField(el);
            const val = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            const checked = !!el.checked;
            const isReq = !isCaptcha && !!(el.required || el.getAttribute('aria-required') === 'true');`;

    if (cs.includes(oldFreezeLoop)) {
        cs = cs.replace(oldFreezeLoop, newFreezeLoop);
        console.log('✓ Patched freezeFieldValues: excluded captcha challenge fields from isRequired snapshot');
    }

    // In checkForCaptcha, add input challenge selectors
    const oldCaptchaSelectors = `        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'iframe[src*="turnstile"]',
            '.g-recaptcha iframe',
            '.h-captcha iframe',
            '#turnstile-container iframe',
            'div[class*="captcha"] iframe',
            'iframe[title*="captcha"]',
            '.g-recaptcha',
            '.h-captcha',
            '.cf-turnstile',
            '#turnstile-container',
            '[data-sitekey]',
            'img[src*="captcha" i]',
            'img[id*="captcha" i]',
            'img[class*="captcha" i]'
        ];`;

    const newCaptchaSelectors = `        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'iframe[src*="turnstile"]',
            '.g-recaptcha iframe',
            '.h-captcha iframe',
            '#turnstile-container iframe',
            'div[class*="captcha"] iframe',
            'iframe[title*="captcha"]',
            '.g-recaptcha',
            '.h-captcha',
            '.cf-turnstile',
            '#turnstile-container',
            '[data-sitekey]',
            'img[src*="captcha" i]',
            'img[id*="captcha" i]',
            'img[class*="captcha" i]',
            'input[name*="captcha" i]',
            'input[id*="captcha" i]',
            '[class*="captcha" i] input'
        ];`;

    if (cs.includes(oldCaptchaSelectors)) {
        cs = cs.replace(oldCaptchaSelectors, newCaptchaSelectors);
        console.log('✓ Patched checkForCaptcha: added input challenge selectors');
    }

    // In rescueTarget: do NOT pick captcha fields as fallback message rescue!
    const oldRescueTarget = `            const rescueTarget = finalAllInputs.find(el => isMsgElement(el))
                || finalAllInputs.find(el => el.tagName === 'TEXTAREA' || el.contentEditable === 'true')
                || finalAllInputs.find(el => !el.value && !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(el.type));`;

    const newRescueTarget = `            const rescueTarget = finalAllInputs.find(el => isMsgElement(el) && !isCaptchaChallengeField(el))
                || finalAllInputs.find(el => (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') && !isCaptchaChallengeField(el));`;

    if (cs.includes(oldRescueTarget)) {
        cs = cs.replace(oldRescueTarget, newRescueTarget);
        console.log('✓ Patched rescueTarget: restricted to genuine message elements only');
    }

    // In autofill failure handler: if reasonCode is NO_LONG_TEXT_INQUIRY_FIELD, settle as SKIPPED!
    const oldAutofillFailHandler = `                // [RC3.60 P0] Terminal settlement on unhandled autofill failure — never hang in RUNNING
                logDev(\`❌ [Engine] Autofill failure terminal settlement: \${failReason}\`, "error");
                finishCampaign(false, failReason, 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT');
                return false;`;

    const newAutofillFailHandler = `                // [RC3.60 P0] Terminal settlement on unhandled autofill failure — never hang in RUNNING
                if (result && (result.reasonCode === 'NO_LONG_TEXT_INQUIRY_FIELD' || result.terminalStatus === 'SKIPPED')) {
                    logDev(\`ℹ️ [Engine] Non-inquiry form without message body: settling SKIPPED\`, "info");
                    finishCampaign(false, 'NO_LONG_TEXT_INQUIRY_FIELD', 'NO_LONG_TEXT_INQUIRY_FIELD');
                    return false;
                }
                logDev(\`❌ [Engine] Autofill failure terminal settlement: \${failReason}\`, "error");
                finishCampaign(false, failReason, 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT');
                return false;`;

    if (cs.includes(oldAutofillFailHandler)) {
        cs = cs.replace(oldAutofillFailHandler, newAutofillFailHandler);
        console.log('✓ Patched autofill failure handler: NO_LONG_TEXT_INQUIRY_FIELD settles as SKIPPED');
    }

    fs.writeFileSync(csPath, restoreCRLF(cs, origCRLF), 'utf8');
}

console.log('\n=== RC3.60 .93 PATCH COMPLETE ===');
