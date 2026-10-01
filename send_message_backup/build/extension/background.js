/**
 * X PIDER Sender Pro - Background Service Worker (Unified Single-File)
 * [v4.17.0] XPIDER DevLog Bridge 패치 적용됨
 */

// ── XPIDER DEV LOG BRIDGE ─────────────────────────────────────────────────
// 개발자 전용 스텔스 로깅 브리지 (외부 노출 없음)
(function() {
  const _EXT_NAME = 'Ext[AutoFormSender]';
  const _xDL = (lvl, msg, ex) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl,
        source: _EXT_NAME, msg: String(msg).substring(0, 2048), extra: ex || undefined
      }).catch(() => {});
    } catch(_) {}
  };
  // console.* 전체 인터셉트
  ['log','warn','error','debug','info'].forEach(m => {
    const _o = console[m].bind(console);
    console[m] = (...a) => {
      _o(...a);
      const lvlMap = { log:'INFO', warn:'WARN', error:'ERROR', debug:'DEBUG', info:'INFO' };
      _xDL(lvlMap[m] || 'INFO', a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '));
    };
  });
  // 글로벌 에러 캡처
  if (typeof self.addEventListener === 'function') {
    self.addEventListener('error', (e) => _xDL('ERROR', `[Uncaught] ${e.message} at ${e.filename}:${e.lineno}`));
    self.addEventListener('unhandledrejection', (e) => _xDL('ERROR', `[UnhandledRejection] ${e.reason}`));
  }
  // 전역 devlog 단축 함수 노출
  self.__xDL = _xDL;
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

// [v1.2.0 Phase 2A] Connect external Foundation Modules
try {
    if (typeof importScripts === 'function') {
        importScripts('solver-core.js');
        importScripts('modules/operation-queue.js');
        importScripts('modules/template-store.js');
        importScripts('modules/history-store.js');
        importScripts('modules/email-collector.js');
    }
} catch (e) {
    console.warn('[SW Boot] importScripts modules fallback or handled inline:', e);
}

// [v18.25.0] Boot Diagnostic Telemetry: Track SW startup steps in real-time
function markBoot(step) {
    console.log(`[BootStep] ${step}`);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ xpider_boot_step: step, xpider_boot_ts: Date.now() }).catch(() => {});
    }
}

// [v18.26.0] Global Error Listener for registration/runtime crashes
self.onerror = function(message, source, lineno, colno, error) {
    const errInfo = `[SW Error] ${message} at ${source}:${lineno}`;
    console.error(errInfo);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ xpider_boot_error: errInfo, xpider_boot_ts: Date.now() });
    }
};

// [v1.2.0] Standard Canonical Delivery Reason Codes
const REASON_CODES = {
    SUCCESS_CONFIRMED: "SUCCESS_CONFIRMED",
    DELIVERY_UNKNOWN: "DELIVERY_UNKNOWN",
    TIMEOUT_LOCAL_SESSION: "TIMEOUT_LOCAL_SESSION",
    NO_FORM_DETECTED: "NO_FORM_DETECTED",
    VALIDATION_FAILED: "VALIDATION_FAILED",
    CAPTCHA_CHALLENGE_BLOCKED: "CAPTCHA_CHALLENGE_BLOCKED",
    BOT_DETECTED_BLOCKED: "BOT_DETECTED_BLOCKED",
    PAGE_LOAD_ERROR: "PAGE_LOAD_ERROR",
    ALREADY_VISITED: "ALREADY_VISITED",
    SW_RESTART_ABORTED: "SW_RESTART_ABORTED"
};

// [v1.2.0] Global Campaign State Registry (Ensures availability across all scopes)
let campaignState = {
    isActive: false,
    queue: [],
    template: null,
    successCount: 0,
    totalTargets: 0,
    delayMs: 12000,
    isPaused: false,
    activeTimeoutId: null,
    currentTabId: null,
    visitedUrls: [],
    successfulUrls: [],
    sessionId: 0,
    isLoopRunning: false,
    lastActionTime: Date.now(),
    isInitialized: false,
    targetResolve: null,
    targetReady: null,
    currentAttempt: null, // [v1.2.0 Intent Ledger] { url, attemptId, status: 'SUBMIT_PENDING'|'RESOLVED', reasonCode, ts }
    // [Authoritative Real-Time Campaign Counters]
    counters: {
        success: 0,
        failed: 0,
        completed: 0,
        remaining: 0,
        deliveryUnknown: 0,
        skippedHistory: 0,
        inProgress: 0,
        total: 0,
        failureBreakdown: {}
    }
};

function broadcastCounters() {
    chrome.runtime.sendMessage({
        action: 'UPDATE_STATS',
        data: {
            successCount: campaignState.counters.success,
            failedCount: campaignState.counters.failed,
            completedCount: campaignState.counters.completed,
            remainingCount: campaignState.counters.remaining,
            totalTargets: campaignState.counters.total,
            failureBreakdown: campaignState.counters.failureBreakdown,
            counters: campaignState.counters
        }
    }).catch(() => {});
}

async function persistCounters() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
            await chrome.storage.local.set({ xpider_campaign_counters_v1: campaignState.counters });
        } catch (_) {}
    }
}

// [v18.35.0] Mission-Critical API Wrapper: Native bridge for missing APIs
const safeTabs = {
    create: (opts) => {
        if (chrome.tabs?.create) return chrome.tabs.create(opts);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_CREATE', opts }, (res) => resolve(res || { id: Date.now() }));
        });
    },
    remove: (id) => {
        if (id && chrome.tabs?.remove) return chrome.tabs.remove(id);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_REMOVE', tabId: id }, () => resolve());
        });
    },
    get: (id) => {
        if (id && chrome.tabs?.get) return chrome.tabs.get(id);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_GET', tabId: id }, (res) => resolve(res || { id, url: '' }));
        });
    },
    update: (id, props) => {
        if (chrome.tabs?.update) {
            if (id) return chrome.tabs.update(id, props);
            return chrome.tabs.update(props);
        }
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_UPDATE', tabId: id, props }, (res) => resolve(res));
        });
    },
    sendMessage: (id, msg) => {
        if (id && chrome.tabs?.sendMessage) return chrome.tabs.sendMessage(id, msg);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_SEND_MESSAGE', tabId: id, message: msg }, (res) => resolve(res));
        });
    },
    onUpdated: chrome.tabs?.onUpdated || { 
        addListener: (cb) => {
            chrome.runtime.onMessage.addListener((m) => {
                if (m.action === 'NATIVE_TAB_UPDATED_EVENT') cb(m.tabId, m.changeInfo, m.tab);
            });
        }, 
        removeListener: () => {} 
    }
};

// [v18.35.0] Scripting Bridge
const safeScripting = {
    executeScript: (opts) => {
        if (chrome.scripting?.executeScript) return chrome.scripting.executeScript(opts);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_SCRIPTING_EXECUTE', opts }, (res) => resolve(res));
        });
    }
};

let bootPromise = null;

// [v18.25.0] Global Logging Core: Moved to top to prevent TDZ errors during boot
let logQueue = [];
let logSaveTimer = null;

function logBg(tabId, msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message: msg, type, tabId };
    
    // 1. Broadcast to open UI (Immediate)
    chrome.runtime.sendMessage({
        action: 'SENDER_LOG',
        message: `[System] ${msg}`,
        logType: type
    }).catch(() => {});

    // 2. Queue for persistent storage (Batched)
    logQueue.push(logEntry);
    if (logQueue.length > 50) logQueue.shift();
    
    // [v18.13.0] Critical Bypass: Always save immediately for start/stop/complete
    const isCritical = ['start', 'stop', 'complete', 'error'].includes(type);
    
    const saveBatch = () => {
        if (typeof chrome.storage === 'undefined' || !chrome.storage.local) return;
        chrome.storage.local.get(['xpider_blackbox_logs'], (data) => {
            const logs = data.xpider_blackbox_logs || [];
            const combined = [...logs, ...logQueue].slice(-50);
            chrome.storage.local.set({ xpider_blackbox_logs: combined });
            logQueue = [];
        });
    };

    if (isCritical) {
        if (logSaveTimer) clearTimeout(logSaveTimer);
        saveBatch();
    } else {
        if (logSaveTimer) clearTimeout(logSaveTimer);
        logSaveTimer = setTimeout(saveBatch, 1500);
    }
}

if (typeof self.XpiderSolverCore === 'undefined') {
    self.XpiderSolverCore = class XpiderSolverCore {
        constructor(config = {}) {
            this.config = {
                witAiKey: config.witAiKey || null,
            twoCaptchaKey: config.twoCaptchaKey || null,
            nopeChaKey: config.nopeChaKey || null,
            ...config
        };
    }

    async transcribeAudio(audioData, audioUrl = null) {
        // [BugFix v4.12.18] 세 가지 키 모두 읽어서 어떤 확장이 저장하든 인식
        const storage = await new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['xpider_stt_api_key', 'audioSttKey', 'witKey'], resolve);
            } else {
                resolve({});
            }
        });
        const activeKey = storage.xpider_stt_api_key || storage.audioSttKey || storage.witKey || this.config.witAiKey;
        
        if (!activeKey) throw new Error("Wit.ai API Key missing in configuration.");
        try {
            const audioBlob = this._dataURLtoBlob(audioData);
            // [v37.0] 오디오 MIME 타입 자동 감지
            const blobMime = audioBlob.type || '';
            let contentType;
            if (blobMime.includes('wav') || blobMime.includes('wave')) {
                contentType = 'audio/wav';
            } else if (blobMime.includes('ogg') || blobMime.includes('opus')) {
                contentType = 'audio/ogg;codecs=opus';
            } else if (blobMime.includes('webm')) {
                contentType = 'audio/webm';
            } else if (blobMime.includes('mp4')) {
                contentType = 'audio/mp4';
            } else {
                const urlLower = (audioUrl || '').toLowerCase();
                if (urlLower.includes('.wav')) contentType = 'audio/wav';
                else if (urlLower.includes('.ogg')) contentType = 'audio/ogg;codecs=opus';
                else contentType = 'audio/mpeg3';
            }

            let apiRes = await fetch("https://api.wit.ai/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${activeKey}`,
                    "Content-Type": contentType
                },
                body: audioBlob
            });

            // [v37.0] 첫 시도 실패 시, audio/mpeg3으로 폴백 재시도
            if (!apiRes.ok && contentType !== 'audio/mpeg3') {
                apiRes = await fetch("https://api.wit.ai/speech", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${activeKey}`,
                        "Content-Type": "audio/mpeg3"
                    },
                    body: audioBlob
                });
            }

            if (!apiRes.ok) throw new Error(`Wit.ai Error (${apiRes.status})`);
            const rawText = await apiRes.text();
            let result = null;
            const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
            if (textMatch && textMatch.length > 0) {
                const lastMatch = textMatch[textMatch.length - 1];
                const valueMatch = lastMatch.match(/"text"\s*:\s*"([^"]+)"/);
                if (valueMatch && valueMatch[1]) result = valueMatch[1];
            }
            if (!result) {
                const lines = rawText.trim().split(/[\r\n]+/).filter(l => l.trim());
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        const parsed = JSON.parse(lines[i]);
                        if (parsed.text) { result = parsed.text; break; }
                        if (parsed._text) { result = parsed._text; break; }
                    } catch (e) { continue; }
                }
            }
            if (result) return result;
            throw new Error("Failed to parse Wit.ai response.");
        } catch (e) {
            console.error("[XpiderSolverCore] Transcription failed:", e.message);
            throw e;
        }
    }

    async solveNopeCha(siteKey, pageUrl, type = 'recaptcha') {
        if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
        const nopechaType = type === 'turnstile' ? 'turnstile' : (type === 'hcaptcha' ? 'hcaptcha' : 'recaptcha');
        const res = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&type=${nopechaType}&sitekey=${siteKey}&url=${pageUrl}`);
        const data = await res.json();
        if (!data || data.error) throw new Error(`NopeCHA Error: ${data?.message || 'Unknown'}`);
        return data.data;
    }

    async solve2Captcha(siteKey, pageUrl, type = 'recaptcha') {
        if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
        let method = 'userrecaptcha';
        let extraParams = '';
        if (type === 'hcaptcha') {
            method = 'hcaptcha';
            extraParams = `&sitekey=${siteKey}`;
        } else if (type === 'turnstile') {
            method = 'turnstile';
            extraParams = `&sitekey=${siteKey}`;
        } else {
            extraParams = `&googlekey=${siteKey}`;
        }
        
        const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=${method}${extraParams}&pageurl=${pageUrl}&json=1`);
        const data = await res.json();
        if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
        const taskId = data.request;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const checkRes = await fetch(`https://2captcha.com/res.php?key=${this.config.twoCaptchaKey}&action=get&id=${taskId}&json=1`);
            const checkData = await checkRes.json();
            if (checkData.status === 1) return checkData.request;
            if (checkData.request !== "CAPCHA_NOT_READY") throw new Error(`2Captcha Error: ${checkData.request}`);
        }
        throw new Error("2Captcha Timeout");
    }

    _dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }
    };
}

markBoot("solver_instantiation");
const solver = new self.XpiderSolverCore();
console.log("[X PIDER] Background script initializing (Unified Mode)...");

markBoot("side_panel_config");
chrome.runtime.onInstalled.addListener(() => {
    if (typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("[SidePanel Error]", error));
    }
});

markBoot("campaign_state_init");

// [R3 Architecture] Serialized Background Execution Mutex
const bgOperationQueue = (typeof self.AsyncOperationQueue !== 'undefined')
    ? new self.AsyncOperationQueue()
    : { enqueue: (fn) => fn(), activeCount: 0 };

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'SEND_MESSAGE':
            handleSendMessage(request.url, request.template, sendResponse);
            return true;

        case 'GET_BOOT_LOG':
            chrome.storage.local.get(['xpider_boot_step', 'xpider_boot_ts'], (data) => {
                sendResponse({ 
                    step: data.xpider_boot_step || 'unknown',
                    ts: data.xpider_boot_ts || 0,
                    now: Date.now()
                });
            });
            return true;

        case 'START_CAMPAIGN':
            // [v18.25.0] Total Decoupling: Respond first, boot async
            sendResponse({ success: true, status: 'acknowledged' });
            (async () => {
                try {
                    if (bootPromise) {
                        // Wait max 1s for boot to finish during a fresh start message
                        await Promise.race([
                            bootPromise,
                            new Promise(res => setTimeout(res, 1000))
                        ]).catch(() => {});
                    }
                    await startCampaignOrchestrator(request.queue, request.template, request.delayMs, request.fillDelayMs, request.submitDelayMs, {
                        skipPreviouslyAttempted: request.skipPreviouslyAttempted,
                        overrideSkipAttempted: request.overrideSkipAttempted
                    });
                } catch (e) {
                    console.error("[StartError]", e);
                    logBg(null, `❌ Engine failed to start: ${e.message}`, "error");
                }
            })();
            return true;

        case 'PING':
            sendResponse({ success: true, timestamp: Date.now() });
            return true;

        case 'GET_CAMPAIGN_COUNTERS':
            sendResponse({ success: true, counters: campaignState.counters });
            return true;

        case 'STOP_CAMPAIGN':
        case 'STOP_AND_SAVE_CAMPAIGN':
            (async () => {
                const res = await pauseCampaignOrchestrator(true);
                sendResponse({ success: true, ...res });
            })();
            return true;

        case 'END_CAMPAIGN':
        case 'CLEAR_CAMPAIGN':
            (async () => {
                await endCampaignOrchestrator();
                sendResponse({ success: true });
            })();
            return true;

        case 'PERFORM_TRANSCRIPTION':
            handleTranscription(request.audioData, request.url, sendResponse);
            return true;

        case 'XPIDER_LOG':
            logBg(null, `[Solver] ${request.message}`, request.status === 'FAIL' ? 'error' : 'info');
            sendResponse({ success: true });
            return true;

        case 'UI_HEARTBEAT':
            sendResponse({ success: true, timestamp: Date.now() });
            return true;

        case 'SENDER_READY':
            // [v18.24.0] Direct Route: Handle content-script ready signal via global state
            if (sender.tab && sender.tab.id === campaignState.currentTabId && campaignState.targetReady) {
                campaignState.targetReady(sender.tab.url, true);
                sendResponse({ success: true });
            }
            return true;

        case 'SENDER_FINISHED':
            // [v18.24.0] Direct Route: Resolve current target process from main listener
            if (sender.tab && sender.tab.id === campaignState.currentTabId && campaignState.targetResolve) {
                const resolve = campaignState.targetResolve;
                resolve(request.result);
                sendResponse({ success: true });
            }
            return true;

        case 'QUEUE_BRANCHES':
            // [v1.2.0 Audit-Compliant] Parent-Owned Candidate Discovery
            // Candidates belong strictly to the active parent target's traversal context.
            // Main user input queue is preserved without contamination or silent truncation.
            (async () => {
                try {
                    const manager = campaignState.activeCandidateManager;
                    if (manager && typeof manager.addCandidates === 'function') {
                        const added = manager.addCandidates(request.links);
                        if (added > 0) {
                            logBg(null, `🌿 [Discovery] +${added} candidate(s) attached to parent target [${manager.parentTargetUrl}] (Target ID: ${manager.parentTargetId})`, "info");
                        }
                        sendResponse({ success: true, parentTargetId: manager.parentTargetId, added });
                    } else {
                        sendResponse({ success: true, added: 0, reason: "NO_ACTIVE_PARENT_TARGET" });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'GET_STATE':
            chrome.storage.local.get(['xpider_paused_checkpoint'], (stored) => {
                const checkpoint = campaignState.pausedCheckpoint || stored.xpider_paused_checkpoint || null;
                sendResponse({
                    success: true,
                    isActive: campaignState.isActive,
                    successCount: campaignState.successCount,
                    totalTargets: campaignState.totalTargets,
                    remainingCount: campaignState.queue.length,
                    isPaused: campaignState.isPaused,
                    hasPausedCheckpoint: !!(checkpoint && checkpoint.remainingQueue && checkpoint.remainingQueue.length > 0),
                    pausedRemainingCount: (checkpoint && checkpoint.remainingQueue) ? checkpoint.remainingQueue.length : 0,
                    hasActiveLock: !!(campaignState.currentAttempt && campaignState.currentAttempt.status === 'SUBMIT_PENDING'),
                    currentAttempt: campaignState.currentAttempt,
                    outcomeHistogram: campaignState.outcomeHistogram || {}
                });
            });
            return true;
            
        case 'PAUSE_CAMPAIGN':
            (async () => {
                const res = await pauseCampaignOrchestrator(true);
                sendResponse({ success: true, ...res });
            })();
            return true;
            
        case 'RESUME_CAMPAIGN':
            (async () => {
                try {
                    const res = await resumeCampaignOrchestrator();
                    sendResponse({ success: true, ...res });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;

        case 'SOLVE_CAPTCHA':
            (async () => {
                try {
                    const storage = await new Promise(resolve => chrome.storage.local.get([
                        'captchaMethod', 'captchaApiKey', 'xpider_captcha_method', 'xpider_captcha_api_key', 'xpider_stt_api_key', 'audioSttKey', 'witKey'
                    ], resolve));
                    
                    const method = request.method || storage.xpider_captcha_method || storage.captchaMethod || 'audio';
                    const apiKey = storage.xpider_captcha_api_key || storage.captchaApiKey;
                    // [F13-Sanitized] No hardcoded credentials. User must supply Wit.ai key via Settings UI.
                    const witKey = storage.xpider_stt_api_key || storage.audioSttKey || storage.witKey || null;
                    
                    solver.config.witAiKey = witKey;
                    if (method === 'nopecha') solver.config.nopeChaKey = apiKey;
                    if (method === 'api' || method === '2captcha') solver.config.twoCaptchaKey = apiKey;
                    
                    // [Owner Authorized Enhancement] Use Autonomous Multi-Tier Fallback Chain if available
                    if (typeof solver.solveSmartFallbackChain === 'function') {
                        const result = await solver.solveSmartFallbackChain(request.type || 'recaptcha', {
                            siteKey: request.sitekey,
                            pageUrl: request.url,
                            audioData: request.audioData
                        });
                        if (result.success) {
                            sendResponse(result);
                            return;
                        }
                    }
                    
                    // Direct method fallback
                    let token;
                    if (method === 'nopecha' && solver.config.nopeChaKey) {
                        token = await solver.solveNopeCha(request.sitekey, request.url, request.type);
                        sendResponse({ success: true, token });
                    } else if ((method === 'api' || method === '2captcha') && solver.config.twoCaptchaKey) {
                        token = await solver.solve2Captcha(request.sitekey, request.url, request.type);
                        sendResponse({ success: true, token });
                    } else if (method === 'audio' || method === 'native' || witKey) {
                        // Autonomous iframe solver (solver-content.js) is actively transcribing/solving
                        sendResponse({ success: true, method: 'audio_frame_solver', message: 'Autonomous audio solver active in iframe' });
                    } else {
                        throw new Error(`Solver API Key or method not configured (method: ${method}).`);
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'UPDATE_WIT_KEY':
            (async () => {
                const key = request.key || '';
                console.log(`[WitKey-Sync] Sender SW: Received update key: ${key ? key.substring(0, 8) + '...' : 'NONE'}`);
                await chrome.storage.local.set({ xpider_stt_api_key: key });
                solver.config.witAiKey = key; // Solver 인스턴스 설정도 갱신
                sendResponse({ success: true });
            })();
            return true;

        case 'EXECUTE_MIGRATION':
            // [P2A-1 & F11 Single Writer Serialized Migration with Restart-Safe Staged Protocol]
            bgOperationQueue.enqueue(async () => {
                try {
                    const data = await chrome.storage.local.get(null);

                    // [F11] Resume: STAGE_COMMIT detected — validate complete staged payload BEFORE promoting schema
                    if (data.xpider_migration_phase === 'STAGE_COMMIT' && data.xpider_schema_version !== 2) {
                        const v2DataPresent = data.templates_v2
                            && typeof data.templates_v2 === 'object'
                            && !Array.isArray(data.templates_v2)
                            && data.templates_v2.version === 2
                            && typeof data.templates_v2.templates === 'object';
                        const urlListsPresent = (data.savedUrlLists_v2 !== undefined || data.savedUrlLists !== undefined);

                        if (v2DataPresent && urlListsPresent) {
                            await chrome.storage.local.set({ xpider_migration_phase: 'COMPLETED', xpider_schema_version: 2 });
                            logBg(null, '📦 [Migration] Resumed: complete v2 payload verified — schema version promoted.', 'info');
                            sendResponse({ success: true, migrated: false, reason: 'RESUMED_FINALIZED' });
                            return;
                        } else {
                            logBg(null, '⚠️ [Migration] STAGE_COMMIT but staged payload missing/invalid — re-running migration.', 'warning');
                            await chrome.storage.local.set({ xpider_migration_phase: 'PENDING' });
                            // Fall through to full migration below
                        }
                    }

                    const tStore = new self.TemplateStore(chrome.storage.local);
                    const migrationResult = await tStore.migrateLegacyData(data);

                    if (migrationResult.migrated && migrationResult.commit) {
                        // [F11] Step 1: Verify backup can be written before touching live data
                        const backupOnly = {};
                        for (const [k, v] of Object.entries(migrationResult.commit)) {
                            if (k.startsWith('xpider_backup_')) backupOnly[k] = v;
                        }
                        await chrome.storage.local.set(backupOnly);

                        // [F11] Step 2: Mark STAGE_COMMIT (v2 data written, schema NOT yet promoted)
                        await chrome.storage.local.set({ xpider_migration_phase: 'STAGE_COMMIT' });

                        // [F11] Step 3: Write v2 data WITHOUT schema_version yet
                        const dataWithoutVersion = { ...migrationResult.commit };
                        delete dataWithoutVersion.xpider_schema_version;
                        await chrome.storage.local.set(dataWithoutVersion);

                        // [F11] Step 4: Verify complete staged payload was written, then promote schema version
                        const verification = await chrome.storage.local.get(['templates_v2', 'savedUrlLists_v2', 'savedUrlLists']);
                        const v2Ok = verification.templates_v2
                            && typeof verification.templates_v2 === 'object'
                            && !Array.isArray(verification.templates_v2)
                            && verification.templates_v2.version === 2
                            && typeof verification.templates_v2.templates === 'object';
                        const urlListsOk = (verification.savedUrlLists_v2 !== undefined || verification.savedUrlLists !== undefined);

                        if (!v2Ok || !urlListsOk) {
                            throw new Error('MIGRATION_VERIFY_FAILED: complete staged v2 payload not verified after write');
                        }
                        await chrome.storage.local.set({ xpider_schema_version: 2, xpider_migration_phase: 'COMPLETED' });

                        logBg(null, `📦 [Migration] Safely migrated to v2 (Backup: ${migrationResult.backupKey})`, 'info');
                    }
                    sendResponse({ success: true, ...migrationResult });
                } catch (err) {
                    console.error('[Migration Error]', err);
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'RECORD_IMPORT_ROWS':
            // [F7/P2A-2] Accept structured rows [{sourceRowNumber, rawInput, targetIdentity}] from popup's pass
            bgOperationQueue.enqueue(async () => {
                try {
                    if (!self.__xpiderHistoryStore) {
                        self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                        await self.__xpiderHistoryStore.load();
                    }
                    // Support structured rows format AND legacy url-array format
                    let res;
                    if (Array.isArray(request.rows) && request.rows.length > 0 && request.rows[0].rawInput !== undefined) {
                        // [F7] Structured path: pass raw record content, real record numbers, and extracted target identities
                        const rawInputs = request.rows.map(r => r.rawInput);
                        const sourceRowNumbers = request.rows.map(r => r.sourceRowNumber);
                        const targetIdentities = request.rows.map(r => r.targetIdentity !== undefined ? r.targetIdentity : null);
                        res = await self.__xpiderHistoryStore.ingestImportRows(rawInputs, request.importId, sourceRowNumbers, targetIdentities);
                    } else {
                        // Legacy: plain URL array (backwards compat)
                        res = await self.__xpiderHistoryStore.ingestImportRows(request.urls || [], request.importId);
                    }
                    sendResponse({ success: true, ...res });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'CHECK_SUPPRESSION':
            // [F8/P2A-3] Suppression check — normalize identity before lookup
            (async () => {
                try {
                    if (!self.__xpiderHistoryStore) {
                        self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                        await self.__xpiderHistoryStore.load();
                    }
                    // [F8] Normalize the raw URL to canonical identity before suppression lookup
                    const normalizedId = self.__xpiderHistoryStore.normalizeTargetIdentity(request.targetUrl);
                    const isSup = self.__xpiderHistoryStore.isSuppressed(normalizedId || request.targetUrl);
                    sendResponse({ success: true, isSuppressed: isSup, normalizedId });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;

        case 'EXECUTE_RESET':
            // [P2A-3 & R3 Reset with Strict In-Flight Submit Lock Check]
            bgOperationQueue.enqueue(async () => {
                try {
                    if (!self.__xpiderHistoryStore) {
                        self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                        await self.__xpiderHistoryStore.load();
                    }
                    const hasActiveLock = !!(campaignState.currentAttempt && campaignState.currentAttempt.status === 'SUBMIT_PENDING');
                    if (hasActiveLock) {
                        throw new Error("CANNOT_RESET_WITH_ACTIVE_SUBMIT_LOCK: Active submission in flight. Stop or pause campaign first.");
                    }

                    if (request.type === 'SELECTED') {
                        const res = await self.__xpiderHistoryStore.applySelectiveReset(request.targetIdentities);
                        sendResponse(res);
                    } else {
                        const res = await self.__xpiderHistoryStore.applyGlobalReset(0);
                        sendResponse(res);
                    }
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'EXPORT_HISTORY_CSV':
            // [P2A-5 Safe CSV Export]
            bgOperationQueue.enqueue(async () => {
                try {
                    if (!self.__xpiderHistoryStore) {
                        self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                        await self.__xpiderHistoryStore.load();
                    }
                    const csvContent = self.__xpiderHistoryStore.exportToCsv(request.options || {});
                    sendResponse({ success: true, csv: csvContent });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
        case 'EMAIL_COLLECT_FOUND':
            // [Issue #6 Email Collector Integration] Non-blocking email accumulation
            (async () => {
                try {
                    const { emails, hostname, url } = request;
                    if (Array.isArray(emails) && emails.length > 0) {
                        const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                        if (StoreClass) {
                            if (!self.__xpiderEmailStore) {
                                self.__xpiderEmailStore = new StoreClass(chrome.storage.local);
                            }
                            const stats = await self.__xpiderEmailStore.recordEmails(hostname, emails, url);
                            logBg(sender.tab?.id, `[TARGET][${hostname}] emailsFoundCurrentPage=${stats.currentPageCount} emailsNewGlobal=${stats.newGlobalCount} totalEmailsGlobal=${stats.totalGlobalCount}`, 'info');
                            sendResponse({ success: true, ...stats });
                            return;
                        }
                    }
                    sendResponse({ success: true, count: 0 });
                } catch (err) {
                    // Failures in email persistence must NEVER break form sending
                    console.warn('[EmailCollector] Auxiliary persistence error:', err);
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;

        case 'GET_COLLECTED_EMAILS':
            (async () => {
                try {
                    const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                    const store = self.__xpiderEmailStore || (StoreClass ? new StoreClass(chrome.storage.local) : null);
                    if (store) {
                        const current = await store.loadCurrentSiteStore();
                        const globalStore = await store.loadGlobalStore();
                        sendResponse({ success: true, current, all: globalStore });
                    } else {
                        sendResponse({ success: false, error: "Store unavailable" });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'CLEAR_COLLECTED_EMAILS':
            (async () => {
                try {
                    const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                    const store = self.__xpiderEmailStore || (StoreClass ? new StoreClass(chrome.storage.local) : null);
                    if (store) {
                        if (request.mode === 'current') {
                            await store.clearCurrent();
                        } else {
                            await store.clearAll();
                        }
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: "Store unavailable" });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'EXPORT_COLLECTED_EMAILS':
            (async () => {
                try {
                    const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                    const store = self.__xpiderEmailStore || (StoreClass ? new StoreClass(chrome.storage.local) : null);
                    if (store) {
                        const mode = request.mode || 'all';
                        const format = request.format || 'csv';
                        let content = '';
                        if (format === 'txt') {
                            content = await store.exportToTxt(mode);
                        } else {
                            content = await store.exportToCsv(mode);
                        }
                        sendResponse({ success: true, content, format, mode });
                    } else {
                        sendResponse({ success: false, error: "Store unavailable" });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        default:
            return false;
    }
});

function normalizeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        // Remove hash, trailing slashes, and standardize lowercase
        return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
    } catch (e) {
        // [v14.0.0] Silent Fallback: Prevent crash if URL is malformed
        return (url || '').split('#')[0].replace(/\/$/, '').toLowerCase();
    }
}

async function startCampaignOrchestrator(queue, template, delayMs, fillDelayMs = 300, submitDelayMs = 1500, options = {}) {
    // [v18.17.0] Emergency Diagnostic Sequence
    logBg(null, "[Boot] Orchestrator entered.", "debug");
    
    // [URL 세션 시작] 여분의 브라우저 새 탭 일괄 닫기 트리거
    chrome.runtime.sendMessage({ action: 'CLOSE_ALL_EXTRA_TABS' }).catch(() => {});

    try {
        // [v18.18.5] Deep Sanitization: Re-initialize the registry to avoid cross-session pollution
        campaignState.isActive = false; 
        campaignState.isLoopRunning = false;
        campaignState.lastActionTime = Date.now();
        campaignState.isInitialized = true; 
        
        // [v12.0.0] Mission Critical Timer/Tab Cleanup
        if (campaignState.activeTimeoutId) {
            clearTimeout(campaignState.activeTimeoutId);
            campaignState.activeTimeoutId = null;
        }
        if (campaignState.currentTabId) {
            chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
            campaignState.currentTabId = null;
        }
        if (chrome.alarms) chrome.alarms.clearAll(); 

        logBg(null, "[Boot] Previous state cleared.", "debug");

        // [Reliability R1] Queue Normalization & Skip Previously Attempted Filter
        let executableQueue = [];
        let dupCount = 0;
        let suppressedCount = 0;
        let historySkippedCount = 0;
        const originalInputCount = Array.isArray(queue) ? queue.length : 0;
        const seenInBatch = new Set();
        
        let hs = null;
        try {
            if (!self.__xpiderHistoryStore) {
                self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                await self.__xpiderHistoryStore.load();
            }
            hs = self.__xpiderHistoryStore;
        } catch (_) {}

        const shouldSkipAttempted = (options.skipPreviouslyAttempted !== false) && (!options.overrideSkipAttempted);

        for (const rawUrl of (Array.isArray(queue) ? queue : [])) {
            if (!rawUrl || typeof rawUrl !== 'string') continue;
            const norm = (hs && typeof hs.normalizeTargetIdentity === 'function') ? (hs.normalizeTargetIdentity(rawUrl) || rawUrl) : rawUrl;
            if (seenInBatch.has(norm)) {
                dupCount++;
                continue;
            }
            seenInBatch.add(norm);

            if (hs && typeof hs.isSuppressed === 'function' && hs.isSuppressed(norm)) {
                suppressedCount++;
                continue;
            }

            if (shouldSkipAttempted && hs && typeof hs.hasPriorAttempt === 'function' && hs.hasPriorAttempt(norm)) {
                historySkippedCount++;
                logBg(null, `⏭️ [HistorySkip] Skipping previously attempted target: ${norm}`, "info");
                continue;
            }

            executableQueue.push(rawUrl);
        }

        logBg(null, `📊 [Queue Filter] Input: ${originalInputCount} | Duplicates: ${dupCount} | Suppressed: ${suppressedCount} | History-Attempted: ${historySkippedCount} | Executable: ${executableQueue.length}`, "info");

        // [v18.15.5] Restore Campaign Variables
        campaignState.queue = executableQueue;
        campaignState.template = template;
        campaignState.templateId = (template && (template.id || template.templateId)) || 'default';
        campaignState.templateVersion = (template && (template.version || template.templateVersion)) || 1;
        campaignState.delayMs = delayMs || 6000;
        campaignState.fillDelayMs = fillDelayMs || 300;
        campaignState.submitDelayMs = submitDelayMs || 1500;
        campaignState.isActive = true;
        campaignState.isPaused = false; // [v18.7] Reset pause on new start
        campaignState.sessionId++; 
        campaignState.successCount = 0;
        campaignState.totalTargets = executableQueue.length;
        campaignState.visitedUrls = []; 
        campaignState.successfulUrls = []; 
        campaignState.captchaCounts = {}; // [v4.12.23] 캡차 시도 횟수 초기화
        campaignState.activeTimeoutId = null;
        campaignState.currentTabId = null;
        campaignState.outcomeHistogram = {};
        campaignState.pausedCheckpoint = null;
        
        logBg(null, "[Boot] Variables initialized.", "debug");
        logBg(null, "🚀 Engine booting...", "start");
        
        // Clear old paused checkpoint on fresh campaign start
        chrome.storage.local.remove(['xpider_paused_checkpoint']).catch(() => {});
        saveCampaignState().catch(() => {}); 
        logBg(null, "[Boot] Storage sync initiated.", "debug");

        campaignState.counters = {
            success: 0,
            failed: 0,
            completed: 0,
            remaining: executableQueue.length,
            deliveryUnknown: 0,
            skippedHistory: historySkippedCount,
            inProgress: 0,
            total: executableQueue.length,
            failureBreakdown: {}
        };
        await persistCounters();
        broadcastCounters();

        processNextCampaignTarget(campaignState.sessionId);
        logBg(null, "[Boot] Target loop triggered.", "debug");
        
        return { success: true };
    } catch (err) {
        console.error("Orchestrator Crash:", err);
        throw err;
    }
}

async function pauseCampaignOrchestrator(saveCheckpoint = true) {
    campaignState.isPaused = true;
    logBg(null, "⏸️ [Engine] Campaign PAUSED / STOP & SAVE requested.", "info");

    // Cancel pending next-target timer
    if (campaignState.activeTimeoutId) {
        clearTimeout(campaignState.activeTimeoutId);
        campaignState.activeTimeoutId = null;
    }
    if (chrome.alarms) {
        chrome.alarms.clear("xpider_next_target");
        chrome.alarms.clear("xpider_next_target_failsafe");
    }

    // Close current target tab if safe
    if (campaignState.currentTabId) {
        chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
        campaignState.currentTabId = null;
    }

    // Current target handling
    const currentAtt = campaignState.currentAttempt;
    if (currentAtt && currentAtt.url) {
        if (currentAtt.status === 'PREPARING') {
            // No submit boundary crossed: settle INTERRUPTED_PAUSE and requeue to front
            try {
                if (!self.__xpiderHistoryStore) {
                    self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                    await self.__xpiderHistoryStore.load();
                }
                if (currentAtt.attemptId) {
                    await self.__xpiderHistoryStore.settleAttempt(currentAtt.attemptId, false, 'INTERRUPTED_PAUSE');
                    await self.__xpiderHistoryStore.persist();
                }
            } catch (_) {}
            if (!campaignState.queue.includes(currentAtt.url)) {
                campaignState.queue.unshift(currentAtt.url);
            }
            logBg(null, `🔄 [Pause] Current target re-queued to front: ${currentAtt.url}`, "info");
        } else if (currentAtt.status === 'SUBMIT_PENDING') {
            // In-flight submit: settle DELIVERY_UNKNOWN and do NOT blindly resend
            try {
                if (!self.__xpiderHistoryStore) {
                    self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                    await self.__xpiderHistoryStore.load();
                }
                if (currentAtt.attemptId) {
                    await self.__xpiderHistoryStore.settleAttempt(currentAtt.attemptId, false, REASON_CODES.DELIVERY_UNKNOWN);
                    await self.__xpiderHistoryStore.persist();
                }
            } catch (_) {}
            logBg(null, `⚠️ [Pause] In-flight target settled as DELIVERY_UNKNOWN (not requeued): ${currentAtt.url}`, "warning");
        }
        campaignState.currentAttempt = null;
        chrome.storage.local.remove('xpider_currentAttempt').catch(() => {});
    }

    // Save checkpoint snapshot
    if (saveCheckpoint) {
        const checkpoint = {
            remainingQueue: [...campaignState.queue],
            visitedUrls: [...campaignState.visitedUrls],
            successfulUrls: [...campaignState.successfulUrls],
            successCount: campaignState.successCount,
            totalTargets: campaignState.totalTargets,
            template: campaignState.template,
            templateId: campaignState.templateId,
            templateVersion: campaignState.templateVersion,
            delayMs: campaignState.delayMs,
            fillDelayMs: campaignState.fillDelayMs,
            submitDelayMs: campaignState.submitDelayMs,
            sessionId: campaignState.sessionId,
            pausedAt: Date.now(),
            outcomeHistogram: { ...(campaignState.outcomeHistogram || {}) },
            counters: { ...(campaignState.counters || {}) }
        };
        campaignState.pausedCheckpoint = checkpoint;
        await chrome.storage.local.set({
            xpider_paused_checkpoint: checkpoint,
            xpider_isPaused: true,
            xpider_isActive: false
        });
        logBg(null, `💾 [Checkpoint] Campaign snapshot saved: ${checkpoint.remainingQueue.length} targets remaining.`, "success");
    }

    campaignState.isActive = false;
    printCampaignOutcomeSummary();
    return { success: true, remainingCount: campaignState.queue.length };
}

async function resumeCampaignOrchestrator() {
    logBg(null, "▶️ [Engine] RESUME_CAMPAIGN requested.", "info");

    let checkpoint = campaignState.pausedCheckpoint;
    if (!checkpoint) {
        const stored = await chrome.storage.local.get(['xpider_paused_checkpoint']);
        checkpoint = stored.xpider_paused_checkpoint || null;
    }

    if (!checkpoint || !Array.isArray(checkpoint.remainingQueue) || checkpoint.remainingQueue.length === 0) {
        throw new Error("NO_RESUMABLE_CHECKPOINT: No paused campaign snapshot found.");
    }

    // Restore exact snapshot without full queue reload!
    campaignState.queue = [...checkpoint.remainingQueue];
    campaignState.visitedUrls = [...(checkpoint.visitedUrls || [])];
    campaignState.successfulUrls = [...(checkpoint.successfulUrls || [])];
    campaignState.successCount = checkpoint.successCount || 0;
    campaignState.totalTargets = checkpoint.totalTargets || campaignState.queue.length;
    campaignState.template = checkpoint.template || campaignState.template;
    campaignState.templateId = checkpoint.templateId || 'default';
    campaignState.templateVersion = checkpoint.templateVersion || 1;
    campaignState.delayMs = checkpoint.delayMs || 6000;
    campaignState.fillDelayMs = checkpoint.fillDelayMs || 300;
    campaignState.submitDelayMs = checkpoint.submitDelayMs || 1500;
    campaignState.outcomeHistogram = { ...(checkpoint.outcomeHistogram || {}) };
    if (checkpoint.counters) {
        campaignState.counters = { ...checkpoint.counters };
        await persistCounters();
        broadcastCounters();
    }
    
    campaignState.sessionId = (checkpoint.sessionId || 0) + 1;
    campaignState.isActive = true;
    campaignState.isPaused = false;
    campaignState.isLoopRunning = false;
    campaignState.lastActionTime = Date.now();
    campaignState.pausedCheckpoint = null;

    await chrome.storage.local.set({ xpider_isActive: true, xpider_isPaused: false });
    logBg(null, `🚀 [Resume] Resuming campaign from target ${campaignState.totalTargets - campaignState.queue.length + 1} (${campaignState.queue.length} targets remaining)...`, "start");

    const restoredCount = checkpoint.remainingQueue.length;
    processNextCampaignTarget(campaignState.sessionId);
    return { success: true, restoredCount, remainingCount: campaignState.queue.length };
}

async function endCampaignOrchestrator() {
    logBg(null, "🛑 [Engine] END_CAMPAIGN requested. Clearing queue and snapshot.", "stop");
    campaignState.isActive = false;
    campaignState.isPaused = false;
    campaignState.queue = [];
    campaignState.pausedCheckpoint = null;
    if (campaignState.activeTimeoutId) {
        clearTimeout(campaignState.activeTimeoutId);
        campaignState.activeTimeoutId = null;
    }
    if (campaignState.currentTabId) {
        chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
        campaignState.currentTabId = null;
    }
    await chrome.storage.local.remove(['xpider_paused_checkpoint', 'xpider_currentAttempt', 'xpider_isActive', 'xpider_isPaused']);
    printCampaignOutcomeSummary();
    return { success: true };
}

function stopCampaignOrchestrator() {
    return pauseCampaignOrchestrator(true);
}

function printCampaignOutcomeSummary() {
    logBg(null, "=== CAMPAIGN OUTCOME SUMMARY ===", "info");
    const hist = campaignState.outcomeHistogram || {};
    const keys = Object.keys(hist);
    if (keys.length === 0) {
        logBg(null, "No target outcomes recorded.", "info");
    } else {
        for (const k of keys) {
            logBg(null, `${(k + ':').padEnd(28)} ${hist[k]}`, "info");
        }
    }
    logBg(null, "================================", "info");
}

/**
 * [v18.7] Pause Check Helper
 */
async function checkPause() {
    while (campaignState.isActive && campaignState.isPaused) {
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function processNextCampaignTarget(loopSessionId) {
    // [v18.21.0] Session Guard: If this loop belongs to a stale session, self-destruct
    if (loopSessionId !== undefined && loopSessionId !== campaignState.sessionId) {
        console.log(`[Engine] Stale session ${loopSessionId} detected (expected ${campaignState.sessionId}). Killing loop.`);
        return;
    }

    // [v18.12.0] Stall Recovery: If loop is already running, check if it's dead/stalled
    if (campaignState.isLoopRunning && loopSessionId === undefined) {
        const stallTime = Date.now() - campaignState.lastActionTime;
        if (stallTime > 210000) { // 3.5 minutes
            logBg(null, `⚠️ [Protection] Stall detected (${Math.round(stallTime/1000)}s). Force-recovering engine loop...`, "warning");
            campaignState.isLoopRunning = false; 
            if (campaignState.currentTabId) chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
        } else {
            return; 
        }
    }
    
    // Default to current session if none provided
    const currentSession = loopSessionId || campaignState.sessionId;

    campaignState.isLoopRunning = true;
    campaignState.lastActionTime = Date.now(); 

    try {
        await checkPause(); // [v18.7] First checkpoint
        
        if (!campaignState.isActive || campaignState.queue.length === 0) {
            if (campaignState.isActive) {
                logBg(null, "Campaign finished!", "complete");
                campaignState.isActive = false;
                // [URL 세션 성공 완료] 여분의 브라우저 새 탭 일괄 닫기 트리거
                chrome.runtime.sendMessage({ action: 'CLOSE_ALL_EXTRA_TABS' }).catch(() => {});
            }
            campaignState.isLoopRunning = false;
            return;
        }

        const currentUrl = campaignState.queue.shift();
        const normalized = normalizeUrl(currentUrl);

        if (campaignState.visitedUrls.includes(normalized)) {
            logBg(null, `Skipping already visited target: ${currentUrl}`, "info");
            return processNextCampaignTarget(currentSession);
        }
        campaignState.visitedUrls.push(normalized);
        const targetUrl = currentUrl.startsWith('http') ? currentUrl : 'https://' + currentUrl;
        let targetHost = 'unknown';
        try {
            targetHost = new URL(targetUrl).hostname;
        } catch (_) {
            targetHost = normalized || currentUrl;
        }
        const targetIdx = campaignState.totalTargets - campaignState.queue.length;
        logBg(null, `[TARGET ${targetIdx}/${campaignState.totalTargets}][${targetHost}] START`, "info");
        if (chrome.alarms) chrome.alarms.create(`xpider_timeout_${currentSession}`, { delayInMinutes: 3 });

        const result = await Promise.race([

            orchestrateSending(targetUrl, campaignState.template),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Local Session Timeout")), 180000);
            })
        ]).catch(err => {
            logBg(null, `⚠️ [Protection] Target skipped: ${err.message}`, "warning");
            return { success: false, error: err.message };
        }).finally(() => {
            if (chrome.alarms) chrome.alarms.clear(`xpider_timeout_${currentSession}`);
            
            // [v18.29.0] Forced Cleanup: Ensure any orphaned tab for this target is closed immediately
            if (campaignState.currentTabId) {
                const orphanId = campaignState.currentTabId;
                campaignState.currentTabId = null; // Clear first to prevent race
                safeTabs.remove(orphanId).catch(() => {});
            }
        });
        // [v1.2.0-Fix-F1] Single success-accounting owner:
        // successCount is strictly and exclusively incremented inside finishOnce() on line 886.
        // Duplicate increment removed here to prevent false accounting inflation.
    } catch (e) {
        logBg(null, `❌ Critical target error: ${e.message}. Skipping...`, "error");
    } finally {
        if (campaignState.isActive) {
            saveCampaignState(); // Sync after each target
            
            await checkPause(); // [v18.7] Pre-delay checkpoint
            
            // [v18.10.0] Hybrid Precise Scheduling: setTimeout for speed, Alarm for worker survival
            const delay = Math.max(1000, campaignState.delayMs || 10000);
            logBg(null, `Waiting ${delay}ms before next target...`, "debug");

            if (campaignState.activeTimeoutId) clearTimeout(campaignState.activeTimeoutId);
            campaignState.activeTimeoutId = setTimeout(processNextCampaignTarget, delay);

            // Fail-safe alarm (min 1 min) to wake up if worker is suspended
            if (chrome.alarms) chrome.alarms.create("xpider_next_target_failsafe", { delayInMinutes: 1 });
        }
        campaignState.isLoopRunning = false;
    }
}

// [v18.9.0] Master Alarm Central: Global dispatch for watchdog and emergency timeouts
if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
    if (campaignState.isActive) {
        // [v18.12.0] Enhanced Emergency Dispatch: Force-check for stalls even if lock is held
        if (alarm.name.startsWith("xpider_watchdog_") || alarm.name === "xpider_next_target_failsafe") {
            processNextCampaignTarget();
            return;
        }

        if (alarm.name.startsWith("xpider_timeout_")) {
            const parts = alarm.name.split('_');
            const session = parseInt(parts[parts.length - 1]);
            
            if (session === campaignState.sessionId) {
                logBg(null, `⚠️ [Protection] Global Session Timeout triggered. Advancing...`, "warning");
                // Explicitly clear lock to allow next target to enter
                campaignState.isLoopRunning = false;
                processNextCampaignTarget();
            }
        }
    }
    });
}

async function handleSendMessage(url, template, sendResponse) {
    let tabId = null;
    let targetUrl = url;
    
    // [v1.3.8] Protocol Normalization
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }

    try {
        logBg(null, `Opening target: ${targetUrl}`, "visit");
        
        // [v11.0.0] Fresh-Tab Protocol: Open a dedicated tab for each target
        const result = await orchestrateSending(targetUrl, template);
        
        // [v2.6.5] Hardened SSL Retry Logic: Only retry if it was a connection/DNS/Protocol failure.
        // Do NOT retry if we timed out after successfully mapping fields or encountering CAPTCHA.
        if (!result.success && targetUrl.startsWith('http://') && result.error && 
           (result.error.includes('Timeout') === false && result.error.includes('exhausted') === false)) {
            const sslUrl = targetUrl.replace('http://', 'https://');
            logBg(null, `Connection failure. Attempting SSL recovery: ${sslUrl}`, "info");
            const retryResult = await orchestrateSending(sslUrl, template);
            return sendResponse(retryResult);
        }

        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        sendResponse(result);
    } catch (e) {
        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
        sendResponse({ success: false, error: e.message });
    }
}

// [v1.5.0] Ultra Contact Library - 100+ patterns across all platforms
const LIBRARY_TIERS = {
    core: ['/contact', '/contact-us', '/contactus', '/inquiry', '/support', '/customer-service'],
    platform: [
        '/pages/contact', '/pages/contact-us', '/pages/get-in-touch', // Shopify/Wix
        '/contact-form', '/wp-contact', '/p/contact', // WordPress
        '/about/contact', '/info/contact', '/company/contact'
    ],
    l10n: [
        '/문의', '/문의하기', '/연락', '/연락처', // Korean
        '/お問い合わせ', '/コンタクト', // Japanese
        '/联系', '/留言', '/联系我们' // Chinese
    ],
    variants: [
        '/get-in-touch', '/write-to-us', '/send-message', '/message-us', 
        '/feedback', '/support-center', '/help-center', '/ask-a-question',
        '/request-info', '/reach-out', '/talk-to-us', '/online-inquiry'
    ]
};

// Generate full path list with suffixes
const PROACTIVE_PATHS = (() => {
    const baseSet = [
        "", // Homepage root
        ...LIBRARY_TIERS.core, 
        ...LIBRARY_TIERS.platform, 
        ...LIBRARY_TIERS.l10n, 
        ...LIBRARY_TIERS.variants
    ];
    const suffixes = ['', '/', '.html', '.php', '.asp'];
    const result = [];
    
    // Add Cased variants for high-priority core
    LIBRARY_TIERS.core.forEach(p => {
        const cased = p.charAt(1).toUpperCase() + p.slice(2);
        const upper = p.toUpperCase();
        baseSet.push(`/${cased}`, upper);
    });

    baseSet.forEach(p => {
        suffixes.forEach(s => {
            const combined = p + s;
            if (!result.includes(combined)) result.push(combined);
        });
    });
    
    return result;
})();


async function scanContactPaths(baseUrl, tabId) {
    logBg(tabId, "Step 1: Sniper Mode active. Searching for contact page...", "info");
    const validPaths = [];
    const pool = PROACTIVE_PATHS.slice(0, 50); // Limit to top 50 for speed

    // Concurrent scanning in small batches to prevent blocking
    const batchSize = 10;
    for (let i = 0; i < pool.length; i += batchSize) {
        logBg(tabId, `🔦 Scanning paths ${i + 1}-${Math.min(i + batchSize, pool.length)}...`, "info");
        const batch = pool.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (path) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s per probe
            try {
                const url = baseUrl + path;
                const response = await fetch(url, { 
                    method: 'GET',
                    signal: controller.signal,
                    mode: 'no-cors'
                });
                clearTimeout(timeout);
                return path;
            } catch (e) {
                clearTimeout(timeout);
                return null;
            }
        }));
        
        validPaths.push(...results.filter(p => p !== null));
        if (validPaths.length >= 3) break; // Found enough candidates, move to execution
    }

    logBg(tabId, `Pre-scan complete. Identified ${validPaths.length} valid paths.`, "success");
    return validPaths.length > 0 ? validPaths : ['/contact', '/contact-us']; // Fallback
}

async function orchestrateSending(urlInput, template) {
    let targetUrl = urlInput.trim();
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    // [F8] Lazy HistoryStore singleton shared across all orchestration calls
    const _getHistoryStore = async () => {
        if (!self.__xpiderHistoryStore) {
            self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
            await self.__xpiderHistoryStore.load();
        }
        return self.__xpiderHistoryStore;
    };

    // [F8] Step 1: Normalize identity and perform suppression check BEFORE any side effect
    // Fail-closed on error: if check throws, abort before tab open!
    let _canonicalId;
    try {
        const hs = await _getHistoryStore();
        _canonicalId = hs.normalizeTargetIdentity(targetUrl);
        if (hs.isSuppressed(_canonicalId || targetUrl)) {
            logBg(null, `🚫 [F8-Suppression] ${targetUrl} is suppressed — aborting before tab open.`, 'warning');
            return { success: false, reasonCode: 'SUPPRESSED', error: 'Target is suppressed' };
        }
    } catch (hsErr) {
        logBg(null, `❌ [F8-Suppression] check failed: ${hsErr.message} — aborting to fail closed.`, 'error');
        return { success: false, reasonCode: 'SUPPRESSION_CHECK_FAILED', error: hsErr.message };
    }

    // [F8] Step 2: Persist durable PREPARING record BEFORE opening tab.
    // If persistence fails, ABORT — do not open tab (prevents untracked side effects).
    let _attemptId = null;
    try {
        const hs = await _getHistoryStore();
        const attemptResult = await hs.recordAttempt(targetUrl, {
            status: 'PREPARING',
            reason: 'PREPARING',
            templateId: campaignState.templateId || null,
            templateVersion: campaignState.templateVersion || 1
        });
        _attemptId = attemptResult && attemptResult.attemptId ? attemptResult.attemptId : null;
        if (!_attemptId) throw new Error('recordAttempt returned no attemptId');
        await hs.persist();
        // [F8-A] Canonical attemptId — begins in PREPARING (not SUBMIT_PENDING until submit is imminent)
        campaignState.currentAttempt = {
            url: targetUrl,
            attemptId: _attemptId,     // [F8] canonical HistoryStore id
            status: 'PREPARING',
            reasonCode: 'PREPARING',
            timestamp: Date.now()
        };

        // Mark target as in progress
        campaignState.counters.inProgress = 1;
        campaignState.counters.remaining = Math.max(0, campaignState.counters.total - campaignState.counters.completed - campaignState.counters.inProgress - campaignState.counters.skippedHistory);
        persistCounters().catch(() => {});
        broadcastCounters();

        // Persist to chrome.storage.local immediately
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ xpider_currentAttempt: campaignState.currentAttempt }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve();
                });
            });
        }
    } catch (hsErr) {
        logBg(null, `❌ [F8-Intent] recordAttempt failed: ${hsErr.message} — aborting to prevent untracked send.`, 'error');
        return { success: false, reasonCode: 'INTENT_PERSISTENCE_FAILED', error: 'INTENT_PERSISTENCE_FAILED' };
    }

    const tab = await safeTabs.create({ url: 'about:blank', active: false });
    const tabId = tab.id;
    campaignState.currentTabId = tabId;

    let resolveRef;
    const resultPromise = new Promise(resolve => resolveRef = resolve);
    
    let isFinished = false;
    let isFocusSecured = false;
    let lastFocusedUrl = ''; // [v2.9.5] Track page-level focus to allow re-entry on redirects
    const currentSession = campaignState.sessionId; // [v18.1.0] Snap session ID
    
    let watchdogTimer = null;
    const resetWatchdog = () => {
        // [v18.9.0] Alarm-based Watchdog: Resistant to worker suspension
        if (chrome.alarms) chrome.alarms.create(`xpider_watchdog_${tabId}_${currentSession}`, { delayInMinutes: 1 });
    };
    resetWatchdog();

    let injectionTimer = null;
    let pollerTimer = null;
    let lastActivity = Date.now();
    let validPaths = [];
    let pathIdx = 0;
    let baseUrl;
    let currentAttemptUrl = targetUrl; // [v2.9.7] Track intended path for redirect detection
    let visitedRedirects = []; 
    let lastInjectedUrl = '';  

    // [v1.2.0 Parent Target Ownership] Scoped candidate manager
    const parentTargetId = `tgt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const MAX_CANDIDATES_PER_PARENT = 3;
    let parentCandidateCount = 0;

    campaignState.activeCandidateManager = {
        parentTargetId,
        parentTargetUrl: targetUrl,
        addCandidates: (links) => {
            if (isFinished) return 0;
            let added = 0;
            for (const link of (Array.isArray(links) ? links : [])) {
                if (parentCandidateCount >= MAX_CANDIDATES_PER_PARENT) break;
                if (typeof link !== 'string' || !link.startsWith('http')) continue;
                const norm = normalizeUrl(link);
                const isVisited = campaignState.visitedUrls.includes(norm);
                const isAlreadyInPaths = validPaths.some(p => normalizeUrl(p.startsWith('http') ? p : baseUrl + p) === norm);
                if (!isVisited && !isAlreadyInPaths) {
                    validPaths.push(link);
                    added++;
                    parentCandidateCount++;
                }
            }
            return added;
        }
    };

    const broadcastStats = () => {
        chrome.runtime.sendMessage({
            action: 'UPDATE_STATS',
            data: {
                successCount: campaignState.successCount,
                remainingCount: campaignState.queue.length,
                totalTargets: campaignState.totalTargets
            }
        }).catch(() => {});
    };

    try {
        const u = new URL(targetUrl);
        baseUrl = u.origin;
    } catch (e) {
        safeTabs.remove(tabId).catch(() => {});
        return { success: false, error: "Invalid URL" };
    }

    const finish = async (res) => {
        if (res && !res.success && res.error === "NO_FORM_ON_PAGE") {
            logBg(tabId, `⚠️ [Engine] No form on current path. Advancing to next candidate...`, "warning");
            campaignState.targetResolve = finish;
            tryNext();
            return;
        }

        if (isFinished) return;
        isFinished = true;
        
        if (campaignState.currentTabId === tabId) {
            campaignState.currentTabId = null;
        }
        campaignState.targetResolve = null;
        campaignState.targetReady = null;
        if (campaignState.activeCandidateManager && campaignState.activeCandidateManager.parentTargetId === parentTargetId) {
            campaignState.activeCandidateManager = null;
        }

        if (res && res.success) {
            campaignState.successCount++; 
            broadcastStats(); 
            try {
                const finalTab = await safeTabs.get(tabId);
                const norm = normalizeUrl(finalTab.url || '');
                if (!campaignState.successfulUrls.includes(norm)) campaignState.successfulUrls.push(norm);
            } catch(e) {}
        }

        if (chrome.alarms) chrome.alarms.clear(`xpider_watchdog_${tabId}_${currentSession}`);
        if (injectionTimer) clearTimeout(injectionTimer);
        if (pollerTimer) clearInterval(pollerTimer);
        safeTabs.onUpdated.removeListener(navWatcher);

        const isSuccess = !!(res && res.success);
        // [F8] Pre-submit persistence failures must remain retryable (not DELIVERY_UNKNOWN)
        const isPreSubmitFailure = !isSuccess && (
            res?.reasonCode === 'PRE_SUBMIT_PERSISTENCE_FAILED' ||
            res?.reasonCode === 'INTENT_PERSISTENCE_FAILED' ||
            res?.error === 'PRE_SUBMIT_PERSISTENCE_FAILED' ||
            res?.error === 'INTENT_PERSISTENCE_FAILED'
        );
        // [F8] DELIVERY_UNKNOWN is strictly reserved for true in-flight submission ambiguities
        const isDeliveryUnknown = !isSuccess && !isPreSubmitFailure && (
            (!res || (!res.error && !res.reasonCode)) ||
            res.reasonCode === REASON_CODES.DELIVERY_UNKNOWN
        );

        let finalReason;
        if (isSuccess) {
            finalReason = REASON_CODES.SUCCESS_CONFIRMED;
        } else if (isPreSubmitFailure) {
            finalReason = 'PRE_SUBMIT_PERSISTENCE_FAILED';
        } else if (isDeliveryUnknown) {
            finalReason = REASON_CODES.DELIVERY_UNKNOWN;
        } else {
            finalReason = res?.reasonCode || (res?.error ? String(res.error) : REASON_CODES.DELIVERY_UNKNOWN);
        }

        // Record outcome in campaign outcome histogram
        if (!campaignState.outcomeHistogram) campaignState.outcomeHistogram = {};
        campaignState.outcomeHistogram[finalReason] = (campaignState.outcomeHistogram[finalReason] || 0) + 1;

        let hostName = 'unknown';
        try {
            hostName = new URL(targetUrl).hostname;
        } catch (_) {
            hostName = targetUrl;
        }
        logBg(tabId, `[TARGET][${hostName}] FINAL status=${isSuccess ? 'CONFIRMED_SUCCESS' : (isDeliveryUnknown ? 'DELIVERY_UNKNOWN' : 'FAILURE')} reason=${finalReason}`, isSuccess ? "success" : "warning");
        
        // [F8] Settle the single canonical durable attempt (same HistoryStore record opened before tab)
        try {
            const hs = await _getHistoryStore();
            if (_attemptId) {
                // Settle with proper DELIVERY_UNKNOWN vs FAILURE distinction
                const settleSuccess = isSuccess;
                const settleReason = isDeliveryUnknown ? REASON_CODES.DELIVERY_UNKNOWN : finalReason;
                await hs.settleAttempt(_attemptId, settleSuccess, settleReason);
            }
            await hs.persist();
        } catch (hsErr) {
            logBg(tabId, `⚠️ [F8-HistoryStore] settleAttempt failed: ${hsErr.message}`, 'warning');
        }
        
        try {
            await resolveSubmissionIntent(targetUrl, finalReason, isSuccess);
        } catch (intentErr) {
            logBg(tabId, `⚠️ [IntentGuard] Failed to settle submission intent: ${intentErr.message}`, "warning");
        }

        // [Authoritative Real-Time Counter Settlement]
        campaignState.counters.inProgress = 0;
        if (isSuccess) {
            campaignState.counters.success++;
        } else if (isDeliveryUnknown) {
            campaignState.counters.deliveryUnknown++;
        } else {
            campaignState.counters.failed++;
            const reasonKey = finalReason || 'UNKNOWN_FAILURE';
            campaignState.counters.failureBreakdown[reasonKey] = (campaignState.counters.failureBreakdown[reasonKey] || 0) + 1;
        }
        campaignState.counters.completed = campaignState.counters.success + campaignState.counters.failed + campaignState.counters.deliveryUnknown;
        campaignState.counters.remaining = Math.max(0, campaignState.counters.total - campaignState.counters.completed - campaignState.counters.skippedHistory);
        await persistCounters();
        broadcastCounters();

        if (res && res.success) {
            logBg(tabId, "✨ [Engine] Submission confirmed. Tab will close shortly...", "success");
            await new Promise(r => setTimeout(r, 2000));
        } else {
            await new Promise(r => setTimeout(r, 1000));
        }

        safeTabs.remove(tabId).catch(() => {});
        resolveRef({ ...res, reasonCode: finalReason });
    };

    const secureFocus = async (currentUrl, force = false) => {
        const normalized = normalizeUrl(currentUrl || '');
        if (!force && ((isFocusSecured && lastFocusedUrl === normalized) || isFinished)) return;
        
        isFocusSecured = true;
        lastFocusedUrl = normalized;
        
        // [v1.2.0 & F2 & F8] Transition to SUBMIT_PENDING immediately BEFORE triggering submission side-effects
        // Reuses the single canonical _attemptId from HistoryStore (never generates a second ID)
        try {
            await recordSubmissionIntent(targetUrl, 'SUBMIT_PENDING', _attemptId);
        } catch (intentErr) {
            logBg(tabId, `❌ [IntentGuard] Failed to persist submission intent: ${intentErr.message}. Aborting submission.`, "error");
            // [F8-B] Pre-submit persistence failure MUST remain retryable, NOT DELIVERY_UNKNOWN!
            finish({ success: false, error: "PRE_SUBMIT_PERSISTENCE_FAILED", reasonCode: "PRE_SUBMIT_PERSISTENCE_FAILED" });
            return;
        }
        
        if (injectionTimer) clearTimeout(injectionTimer);
        logBg(tabId, "Extraction focus secured. Mapping template fields...", "info");
        safeTabs.sendMessage(tabId, { 
            action: 'START_SENDING', 
            template: template, 
            delayMs: campaignState.delayMs,
            fillDelayMs: campaignState.fillDelayMs || 300,
            submitDelayMs: campaignState.submitDelayMs || 1500,
            triedUrl: currentAttemptUrl
        }).catch(() => {});
    };

    const navWatcher = (updatedTabId, statusInfo) => {
        if (updatedTabId === tabId) {
            lastActivity = Date.now();
            if (chrome.alarms) chrome.alarms.create(`xpider_watchdog_${tabId}_${currentSession}`, { delayInMinutes: 1 });
            
            const norm = normalizeUrl(statusInfo.url || '');
            
            if (statusInfo.url && norm !== lastInjectedUrl) {
                if (isFocusSecured) {
                    logBg(tabId, "🔓 [Engine] URL path changed. Resetting focus lock for SPA re-injection.", "debug");
                    isFocusSecured = false;
                }
                logBg(tabId, "🔄 [Engine] Internal navigation detected (SPA). Preparing re-injection...", "debug");
                startInjection(1500); 
            }

            if (norm && !isFocusSecured && statusInfo.status === 'complete') {
                 if (campaignState.successfulUrls.includes(norm)) {
                    logBg(tabId, "⏭️ [Engine] Redirected to success page. Skipping.", "success");
                    finish({ success: true });
                    return;
                }
            }

            if (statusInfo.status === 'complete') startInjection(0);
            else if (statusInfo.status === 'loading' && !isFocusSecured) startInjection(2000);
        }
    };

    campaignState.targetResolve = finish;
    campaignState.targetReady = secureFocus;

    safeTabs.onUpdated.addListener(navWatcher);

    const startInjection = (delay) => {
        if (isFinished || isFocusSecured) return;
        if (injectionTimer) clearTimeout(injectionTimer);
        injectionTimer = setTimeout(async () => {
            if (isFinished || isFocusSecured) return;
            try {
                const targetTab = await safeTabs.get(tabId);
                
                const normalizedCurrent = normalizeUrl(targetTab.url || '');
                if (visitedRedirects.includes(normalizedCurrent) && normalizedCurrent !== lastInjectedUrl) {
                    logBg(tabId, "⏭️ [Engine] Redirected to formless page. Moving to next candidate.", "info");
                    tryNext();
                    return;
                }
                if (!visitedRedirects.includes(normalizedCurrent)) visitedRedirects.push(normalizedCurrent);
                lastInjectedUrl = normalizedCurrent; 

                if (!targetTab.url || targetTab.url.startsWith('about:')) {
                    logBg(tabId, "Handshaking... (Waiting for site response)", "debug");
                    if (Date.now() - lastActivity > 12000) {
                        logBg(tabId, "⚠️ [Engine] Site not responding. Skipping to next candidate.", "warning");
                        tryNext();
                    }
                    return; 
                }
                
                await safeScripting.executeScript({ target: { tabId }, files: ['modules/contact-gate.js', 'modules/smart-field-resolver.js', 'content-script.js'] });
                safeScripting.executeScript({ target: { tabId }, files: ['solver-content.js'] }).catch(() => {});
                startPolling();
            } catch (e) {
                logBg(tabId, `❌ [InfectError] ${e.message}`, "error");
                tryNext();
            }
        }, delay);
    };

    const startPolling = () => {
        if (isFinished || isFocusSecured || pollerTimer) return;
        pollerTimer = setInterval(async () => {
            if (isFinished || isFocusSecured) {
                clearInterval(pollerTimer);
                pollerTimer = null;
                return;
            }
            try {
                const r = await safeScripting.executeScript({ target: { tabId }, func: () => window.__xpider_initialized });
                if (r && r[0] && r[0].result) secureFocus();
            } catch (e) {}
        }, 1500);
    };

    const tryNext = () => {
        if (isFinished) return;
        if (baseUrl.includes('teamusatkd.com')) baseUrl = "https://teamusatkd.com";

        if (pathIdx >= validPaths.length) {
            finish({ success: false, error: "Paths exhausted" });
            return;
        }

        const nextP = validPaths[pathIdx++];
        const fullUrl = (typeof nextP === 'string' && nextP.startsWith('http'))
            ? nextP
            : (baseUrl + (nextP.startsWith('/') ? '' : '/') + nextP);
        const norm = normalizeUrl(fullUrl);
        if (campaignState.successfulUrls.includes(norm)) {
            logBg(tabId, `⏭️ [Engine] Path [${fullUrl}] already handled successfully. Skipping.`, "info");
            setTimeout(tryNext, 500);
            return;
        }

        lastActivity = Date.now();
        isFocusSecured = false;
        currentAttemptUrl = fullUrl; 
        logBg(tabId, `Connecting to [${fullUrl}]...`, "visit");
        safeTabs.update(tabId, { url: fullUrl });
    };

    scanContactPaths(baseUrl, tabId).then(paths => {
        if (isFinished) return;
        validPaths.push(...paths);
        tryNext();
    }).catch(err => {
        if (isFinished) return;
        logBg(tabId, `⚠️ [ScanError] ${err.message}`, "error");
        tryNext();
    });

    return resultPromise;
}

async function recordSubmissionIntent(targetUrl, status = 'SUBMIT_PENDING', existingAttemptId = null) {
    // [F8] Reuse existing canonical attemptId — NEVER overwrite with a newly generated ID
    const attemptId = existingAttemptId 
        || (campaignState.currentAttempt && campaignState.currentAttempt.url === targetUrl && campaignState.currentAttempt.attemptId)
        || `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    campaignState.currentAttempt = {
        url: targetUrl,
        attemptId: attemptId,
        status: status,
        reasonCode: null,
        timestamp: Date.now()
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ xpider_currentAttempt: campaignState.currentAttempt }, () => {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve();
            });
        });
    }
    return attemptId;
}

async function resolveSubmissionIntent(targetUrl, reasonCode, success = false) {
    if (campaignState.currentAttempt && campaignState.currentAttempt.url === targetUrl) {
        campaignState.currentAttempt.status = 'RESOLVED';
        campaignState.currentAttempt.reasonCode = reasonCode;
        campaignState.currentAttempt.success = success;
        campaignState.currentAttempt.resolvedAt = Date.now();
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ xpider_currentAttempt: campaignState.currentAttempt }, () => {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve();
                });
            });
        }
    }
}

async function saveCampaignState() {
    return new Promise((resolve) => {
        try {
            if (typeof chrome.storage === 'undefined' || !chrome.storage.local) return resolve();
            
            chrome.storage.local.set({ 
                xpider_isActive: campaignState.isActive,
                xpider_queue: campaignState.queue,
                xpider_tpl: campaignState.template,
                xpider_delayMs: campaignState.delayMs,
                xpider_fillDelayMs: campaignState.fillDelayMs,
                xpider_submitDelayMs: campaignState.submitDelayMs,
                xpider_sessionId: campaignState.sessionId,
                xpider_success: campaignState.successCount,
                xpider_total: campaignState.totalTargets,
                xpider_visited: campaignState.visitedUrls,
                xpider_successful: campaignState.successfulUrls,
                xpider_currentAttempt: campaignState.currentAttempt
            }, () => {
                if (chrome.runtime.lastError) console.error("Save error:", chrome.runtime.lastError);
                resolve();
            });
        } catch (e) {
            console.error("Failed to save campaign state:", e);
            resolve();
        }
    });
}

async function restoreCampaignState() {
    markBoot("restoring_campaign_state");
    if (campaignState.isInitialized) return;
    campaignState.isInitialized = true;
    console.log("[Boot] Initializing campaign state...");

    return new Promise((resolve) => {
        try {
            if (typeof chrome.storage === 'undefined' || !chrome.storage.local) {
                console.warn("[Boot] Storage API not available during restore.");
                markBoot("storage_unavailable");
                return resolve();
            }

            chrome.storage.local.get([
                'xpider_isActive', 'xpider_queue', 'xpider_tpl', 'xpider_delayMs', 'xpider_fillDelayMs', 'xpider_submitDelayMs',
                'xpider_sessionId', 'xpider_success', 'xpider_total', 'xpider_visited', 'xpider_successful', 'xpider_currentAttempt',
                'xpider_paused_checkpoint', 'xpider_isPaused'
            ], async (data) => {
                try {
                    // [v1.2.0 Delivery Protection on SW Restart]
                    let visited = Array.isArray(data.xpider_visited) ? [...data.xpider_visited] : [];
                    if (data.xpider_currentAttempt) {
                        const interruptedUrl = data.xpider_currentAttempt.url;
                        const interruptedAttemptId = data.xpider_currentAttempt.attemptId;

                        if (data.xpider_currentAttempt.status === 'SUBMIT_PENDING') {
                            // [F8] True submit-pending interruption: form submission may have crossed boundary -> DELIVERY_UNKNOWN (suppress)
                            const normInterrupted = normalizeUrl(interruptedUrl || '');
                            console.warn(`[Protection] Service worker restarted with pending submission for: ${interruptedUrl} (Attempt: ${interruptedAttemptId}). Flagging as DELIVERY_UNKNOWN.`);
                            
                            if (normInterrupted && !visited.includes(normInterrupted)) {
                                visited.push(normInterrupted);
                            }
                            
                            const settledAttempt = {
                                ...data.xpider_currentAttempt,
                                status: 'RESOLVED',
                                reasonCode: REASON_CODES.DELIVERY_UNKNOWN,
                                interruptedAt: Date.now()
                            };
                            chrome.storage.local.set({ 
                                xpider_currentAttempt: settledAttempt,
                                xpider_visited: visited 
                            });

                            try {
                                if (!self.__xpiderHistoryStore) {
                                    self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                                }
                                await self.__xpiderHistoryStore.load();
                                const hs = self.__xpiderHistoryStore;
                                if (interruptedAttemptId) {
                                    await hs.settleAttempt(interruptedAttemptId, false, REASON_CODES.DELIVERY_UNKNOWN);
                                }
                                await hs.persist();
                                logBg(null, `🛡️ [F8-Recovery] Settled HistoryStore attempt ${interruptedAttemptId} as DELIVERY_UNKNOWN (suppression active).`, "warning");
                            } catch (hsRecErr) {
                                console.error('[F8-Recovery] Failed to settle HistoryStore on SW restart:', hsRecErr);
                            }

                            logBg(null, `⚠️ [Protection] Unresolved submission for ${interruptedUrl} recovered as DELIVERY_UNKNOWN to avoid duplicate send.`, "warning");

                        } else if (data.xpider_currentAttempt.status === 'PREPARING') {
                            // [F8-A] Restart occurred during preparation / navigation BEFORE any submit attempt!
                            // Target was NEVER submitted -> DO NOT suppress! Target remains retryable!
                            console.warn(`[Protection] Service worker restarted during PREPARING for: ${interruptedUrl} (Attempt: ${interruptedAttemptId}). Settling as FAILURE; target remains retryable.`);
                            const settledAttempt = {
                                ...data.xpider_currentAttempt,
                                status: 'RESOLVED',
                                reasonCode: 'INTERRUPTED_PREPARING',
                                interruptedAt: Date.now()
                            };
                            chrome.storage.local.set({ 
                                xpider_currentAttempt: settledAttempt
                                // Visited is NOT updated — target remains retryable!
                            });

                            try {
                                if (!self.__xpiderHistoryStore) {
                                    self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                                }
                                await self.__xpiderHistoryStore.load();
                                const hs = self.__xpiderHistoryStore;
                                if (interruptedAttemptId) {
                                    // FAILURE does NOT suppress target!
                                    await hs.settleAttempt(interruptedAttemptId, false, 'INTERRUPTED_PREPARING');
                                }
                                await hs.persist();
                                logBg(null, `🔄 [F8-Recovery] Settled PREPARING attempt ${interruptedAttemptId} as FAILURE (target remains retryable).`, "info");
                            } catch (hsRecErr) {
                                console.error('[F8-Recovery] Failed to settle PREPARING attempt on SW restart:', hsRecErr);
                            }
                        }
                    }

                    if (data.xpider_paused_checkpoint && Array.isArray(data.xpider_paused_checkpoint.remainingQueue) && data.xpider_paused_checkpoint.remainingQueue.length > 0) {
                        campaignState.pausedCheckpoint = data.xpider_paused_checkpoint;
                        campaignState.isPaused = true;
                        campaignState.isActive = false;
                        campaignState.queue = [...data.xpider_paused_checkpoint.remainingQueue];
                        campaignState.totalTargets = data.xpider_paused_checkpoint.totalTargets || campaignState.queue.length;
                        campaignState.successCount = data.xpider_paused_checkpoint.successCount || 0;
                        campaignState.template = data.xpider_paused_checkpoint.template || null;
                        campaignState.outcomeHistogram = { ...(data.xpider_paused_checkpoint.outcomeHistogram || {}) };
                        logBg(null, `Restored paused campaign checkpoint: ${campaignState.queue.length} targets remaining (ready to resume).`, "info");
                    } else if (data.xpider_isActive && data.xpider_queue && data.xpider_queue.length > 0) {
                        campaignState.isActive = true;
                        campaignState.queue = data.xpider_queue;
                        campaignState.template = data.xpider_tpl;
                        campaignState.delayMs = data.xpider_delayMs || 10000;
                        campaignState.fillDelayMs = data.xpider_fillDelayMs || 300;
                        campaignState.submitDelayMs = data.xpider_submitDelayMs || 1500;
                        campaignState.sessionId = data.xpider_sessionId || 0;
                        campaignState.successCount = data.xpider_success || 0;
                        campaignState.totalTargets = data.xpider_total || 0;
                        campaignState.visitedUrls = visited;
                        campaignState.successfulUrls = data.xpider_successful || [];
                        campaignState.currentAttempt = null;
                        
                        logBg(null, `Restored previous active campaign: ${campaignState.queue.length} targets remaining.`, "info");
                        
                        if (!campaignState.isLoopRunning) processNextCampaignTarget(campaignState.sessionId);
                    }
                    markBoot("restore_complete");
                } catch (innerErr) {
                    console.error("[Boot] State application failed:", innerErr);
                    markBoot("restore_failed_inner");
                }
                resolve();
            });
        } catch (e) {
            console.error("[Boot] Failed to restore campaign state:", e);
            markBoot("restore_failed_outer");
            resolve();
        }
    });
}

markBoot("global_functions_defined");
markBoot("worker_online");

// [v18.26.0] Delayed Restore: Prevent boot-time message collisions
setTimeout(() => {
    bootPromise = restoreCampaignState();
}, 500);

async function handleTranscription(audioData, audioUrl, sendResponse) {
    try {
        // [v4.12.23] 같은 페이지(URL)에서 3번 이상 캡챠 해결 작동 제한
        const pageUrl = audioUrl || '';
        const normalizedUrl = pageUrl.split('?')[0].split('#')[0]; // 쿼리 스트링 및 해시 제거
        if (normalizedUrl) {
            if (!campaignState.captchaCounts) campaignState.captchaCounts = {};
            const count = (campaignState.captchaCounts[normalizedUrl] || 0) + 1;
            campaignState.captchaCounts[normalizedUrl] = count;
            if (count > 3) {
                logBg(null, `⚠️ [Engine] CAPTCHA solver disabled: Exceeded maximum attempts (3) on ${normalizedUrl}`, "error");
                throw new Error("EXCEEDED_MAX_CAPTCHA_ATTEMPTS: CAPTCHA solving limit (3 attempts per page) exceeded.");
            }
            logBg(null, `🤖 [Engine] CAPTCHA solver attempt ${count}/3 for page: ${normalizedUrl}`, "info");
        }

        const text = await solver.transcribeAudio(audioData, audioUrl);
        sendResponse({ text });
    } catch (err) {
        sendResponse({ error: err.message });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        orchestrateSending,
        recordSubmissionIntent,
        resolveSubmissionIntent,
        restoreCampaignState,
        startCampaignOrchestrator,
        pauseCampaignOrchestrator,
        resumeCampaignOrchestrator,
        endCampaignOrchestrator,
        stopCampaignOrchestrator,
        printCampaignOutcomeSummary,
        campaignState,
        REASON_CODES
    };
}
