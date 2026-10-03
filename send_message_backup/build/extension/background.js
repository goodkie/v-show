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
        importScripts('modules/vision-submit-executor.js');
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

// [Issue #6 R4.1] Authoritative Persistent Storage Registry per Data Tab
const LIST_DATA_KEYS = {
    autoform: [
        'xpider_queue',
        'xpider_campaign_queue',
        'xpider_paused_checkpoint',
        'xpider_campaign_state',
        'xpider_visited_urls',
        'xpider_visited',
        'xpider_currentAttempt',
        'xpider_isActive',
        'xpider_isPaused',
        'xpider_total',
        'xpider_success',
        'xpider_successful',
        'xpider_counters',
        'xpider_campaign_counters_v1',
        'xpider_saved_lists',
        'xpider_metrics',
        'xpider_runtimeFailureReason'
    ],
    history: [
        'xpider_history_rows',
        'xpider_history_targets',
        'xpider_history_attempts',
        'xpider_history_resets',
        'xpider_history_generation',
        'xpider_history_saved_at',
        'xpider_suppressions'
    ],
    diagnostics: [
        'xpider_diagnostic_logs',
        'xpider_boot_log'
    ],
    emailCollector: [
        'xpider_email_collector_v1',
        'xpider_email_current_site_v1',
        'xpider_email_records',
        'xpider_email_collector_stats',
        'xpider_collected_emails',
        'collected_emails',
        'email_export_cache',
        'allEmailsList',
        'emailExtractorInit',
        'xpider_email_generation',
        'xpider_email_clearing',
        'xpider_email_seen_fingerprints',
        'xpider_email_search_cache',
        'xpider_email_filter_cache'
    ]
};

// [v1.2.0] Global Campaign State Registry (Ensures availability across all scopes)
let campaignState = {
    isActive: false,
    queue: [],
    template: null,
    campaignRunId: null, // [R6.9A] Persistent campaign run identifier for ledger scoping
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
    currentDiscoveryCtx: null,
    currentAttempt: null, // [v1.2.0 Intent Ledger] { url, attemptId, status: 'SUBMIT_PENDING'|'RESOLVED', reasonCode, ts }
    focusActiveTargetTab: true, // [Hotfix R2] Auto-focus campaign target tab
    // [R6.9A Authoritative Real-Time Campaign Counters (Ledger-Derived)]
    counters: {
        success: 0,
        failed: 0,
        completed: 0,
        remaining: 0,
        deliveryUnknown: 0,
        timeout: 0,
        skipped: 0,
        paused: 0,
        skippedHistory: 0,
        inProgress: 0,
        total: 0,
        failureBreakdown: {}
    }
};

let coreRuntimeRefErrors = {};

function broadcastCounters() {
    chrome.runtime.sendMessage({
        action: 'UPDATE_STATS',
        data: {
            scope: 'currentGeneration',
            runScope: 'currentRun',
            campaignRunId: campaignState.campaignRunId,
            successCount: campaignState.counters.success,
            failedCount: campaignState.counters.failed,
            deliveryUnknownCount: campaignState.counters.deliveryUnknown,
            timeoutCount: campaignState.counters.timeout,
            skippedCount: campaignState.counters.skipped,
            pausedCount: campaignState.counters.paused,
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
    try {
        const p = chrome.runtime.sendMessage({
            action: 'SENDER_LOG',
            message: `[System] ${msg}`,
            logType: type
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}

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

// [Hotfix R2] Windows Bridge & Target Tab Auto-Focus
const safeWindows = {
    update: (id, props) => {
        if (typeof chrome !== 'undefined' && chrome.windows?.update) {
            return chrome.windows.update(id, props);
        }
        return Promise.resolve();
    }
};

async function focusTargetTab(tabId) {
    if (!campaignState.focusActiveTargetTab || !tabId) return;
    try {
        const tab = await safeTabs.update(tabId, { active: true });
        let winId = tab?.windowId;
        if (!winId) {
            try {
                const t = await safeTabs.get(tabId);
                winId = t?.windowId;
            } catch (_) {}
        }
        if (winId != null) {
            try {
                await safeWindows.update(winId, { focused: true });
            } catch (wErr) {
                logBg(tabId, `[TAB_FOCUS] windows.update non-fatal warning: ${wErr.message}`, "warning");
            }
        }
        logBg(tabId, `[TAB_FOCUS] tabId=${tabId} windowId=${winId ?? 'unknown'} active=true focused=true`, "info");
    } catch (e) {
        logBg(tabId, `[TAB_FOCUS] Non-fatal focus error: ${e.message}`, "warning");
    }
}

if (typeof self !== 'undefined') {
    self.__xpiderFocusTargetTab = focusTargetTab;
    self.__xpiderSafeWindows = safeWindows;
}

if (typeof self.XpiderSolverCore === 'undefined') {
    self.XpiderSolverCore = class XpiderSolverCore {
        constructor(config = {}) {
            this.config = {
                witAiKey: config.witAiKey || null,
                whisperApiKey: config.whisperApiKey || null,
                twoCaptchaKey: config.twoCaptchaKey || null,
                nopeChaKey: config.nopeChaKey || null,
                ...config
            };
        }
    
        /**
         * Digits and spoken numbers normalizer (English & Korean)
         */
        _normalizeDigits(text) {
            if (!text || typeof text !== 'string') return '';
            
            const wordMap = {
                // English digits and numbers
                'zero': '0', 'oh': '0', 'one': '1', 'two': '2', 'three': '3', 
                'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
                'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14',
                'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19',
                'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50',
                // Korean digits and numbers
                '영': '0', '공': '0', '일': '1', '하나': '1', '이': '2', '둘': '2', 
                '삼': '3', '셋': '3', '사': '4', '넷': '4', '오': '5', '다섯': '5', 
                '육': '6', '여섯': '6', '칠': '7', '일곱': '7', '팔': '8', '여덟': '8', 
                '구': '9', '아홉': '9'
            };
    
            const cleaned = text.toLowerCase()
                .replace(/[\[\]\(\)\{\}\.,!?;:\"\'\-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
    
            const tokens = cleaned.split(' ');
            const output = [];
    
            for (const token of tokens) {
                if (wordMap[token] !== undefined) {
                    output.push(wordMap[token]);
                } else if (/^\d+$/.test(token)) {
                    output.push(token);
                } else {
                    const nums = token.match(/\d+/g);
                    if (nums) output.push(nums.join(''));
                }
            }
    
            const candidate = output.join('');
            if (candidate) return candidate;
    
            // Fallback: extract any digits, or return trimmed text
            const digitsOnly = text.replace(/\D/g, '');
            return digitsOnly || cleaned;
        }
    
        /**
         * Transcribe reCAPTCHA audio challenge using multi-tier engine
         * (OpenAI Whisper -> Wit.ai -> Free/Zero-Key Fallback)
         */
        async transcribeAudio(audioData, audioUrl = null) {
            // [F13-Sanitized] Dynamically read configured keys from chrome.storage.local
            const storage = await new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get([
                        'xpider_stt_api_key', 'audioSttKey', 'witKey',
                        'xpider_whisper_api_key', 'whisperKey', 'openaiApiKey',
                        'captchaMethod', 'xpider_captcha_method'
                    ], resolve);
                } else {
                    resolve({});
                }
            });
    
            const activeWitKey = storage.xpider_stt_api_key || storage.audioSttKey || storage.witKey || this.config.witAiKey;
            const activeWhisperKey = storage.xpider_whisper_api_key || storage.whisperKey || storage.openaiApiKey || this.config.whisperApiKey;
    
            // Obtain Audio Blob: from audioData (Base64) or direct background fetch via audioUrl
            let audioBlob = null;
            if (audioData && typeof audioData === 'string' && audioData.includes(',')) {
                audioBlob = this._dataURLtoBlob(audioData);
            } else if (audioUrl) {
                try {
                    const fetchRes = await fetch(audioUrl);
                    if (fetchRes.ok) {
                        audioBlob = await fetchRes.blob();
                    } else {
                        console.warn(`[XpiderSolverCore] Direct background audio fetch failed (${fetchRes.status})`);
                    }
                } catch (fetchErr) {
                    console.warn("[XpiderSolverCore] Direct background audio fetch error:", fetchErr.message);
                }
            }
    
            if (!audioBlob) {
                if (!activeWitKey && !activeWhisperKey) {
                    throw new Error("No Wit.ai or Whisper API key configured, and audio payload could not be loaded.");
                }
                throw new Error("AUDIO_PAYLOAD_UNAVAILABLE: Unable to extract audio blob from dataURL or direct URL.");
            }
    
            const errors = [];
    
            // Engine 1: OpenAI Whisper (if key present)
            if (activeWhisperKey) {
                try {
                    const rawWhisper = await this._transcribeWhisper(audioBlob, activeWhisperKey);
                    if (rawWhisper && rawWhisper.trim()) {
                        return this._normalizeDigits(rawWhisper);
                    }
                } catch (wErr) {
                    errors.push(`Whisper: ${wErr.message}`);
                    console.warn("[XpiderSolverCore] Whisper transcription failed, trying Wit.ai fallback:", wErr.message);
                }
            }
    
            // Engine 2: Wit.ai (if key present)
            if (activeWitKey) {
                try {
                    const rawWit = await this._transcribeWitAi(audioBlob, activeWitKey, audioUrl);
                    if (rawWit && rawWit.trim()) {
                        return this._normalizeDigits(rawWit);
                    }
                } catch (witErr) {
                    errors.push(`Wit.ai: ${witErr.message}`);
                    console.warn("[XpiderSolverCore] Wit.ai transcription failed:", witErr.message);
                }
            }
    
            // Engine 3: Free / Zero-Key Public Audio STT Fallback
            try {
                const rawFree = await this._transcribeFreeFallback(audioBlob, audioUrl);
                if (rawFree && rawFree.trim()) {
                    return this._normalizeDigits(rawFree);
                }
            } catch (freeErr) {
                errors.push(`FreeFallback: ${freeErr.message}`);
            }
    
            // If all engines failed, provide clear actionable message
            if (!activeWitKey && !activeWhisperKey) {
                throw new Error("Wit.ai or Whisper API Key required. Please set it in Settings -> Audio STT Key.");
            }
            throw new Error(`STT_TRANSCRIPTION_FAILED: ${errors.join(' | ')}`);
        }
    
        /**
         * Transcribe via OpenAI Whisper API
         */
        async _transcribeWhisper(audioBlob, apiKey) {
            const formData = new FormData();
            const filename = (audioBlob.type && audioBlob.type.includes('wav')) ? 'audio.wav' : 'audio.mp3';
            formData.append('file', audioBlob, filename);
            formData.append('model', 'whisper-1');
            formData.append('response_format', 'text');
            formData.append('temperature', '0');
    
            const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                },
                body: formData
            });
    
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`OpenAI Whisper Error (${res.status}): ${errText}`);
            }
    
            return await res.text();
        }
    
        /**
         * Transcribe via Wit.ai API
         */
        async _transcribeWitAi(audioBlob, apiKey, audioUrl) {
            // Audio MIME type auto-detection
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
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": contentType
                },
                body: audioBlob
            });
    
            // Fallback retry with audio/mpeg3
            if (!apiRes.ok && contentType !== 'audio/mpeg3') {
                apiRes = await fetch("https://api.wit.ai/speech", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "audio/mpeg3"
                    },
                    body: audioBlob
                });
            }
    
            if (!apiRes.ok) throw new Error(`Wit.ai Error (${apiRes.status})`);
    
            const rawText = await apiRes.text();
            let result = null;
    
            // Strategy 1: Find "text" field via regex (streaming NDJSON)
            const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
            if (textMatch && textMatch.length > 0) {
                const lastMatch = textMatch[textMatch.length - 1];
                const valueMatch = lastMatch.match(/"text"\s*:\s*"([^"]+)"/);
                if (valueMatch && valueMatch[1]) result = valueMatch[1];
            }
    
            // Strategy 2: Line-by-line JSON parsing
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
    
            // Strategy 3: Full response JSON
            if (!result) {
                try {
                    const parsed = JSON.parse(rawText);
                    result = parsed.text || parsed._text;
                } catch (e) {}
            }
    
            if (result) return result;
            throw new Error("Failed to parse Wit.ai response.");
        }
    
        /**
         * Free / Zero-Key Public STT Fallback
         */
        async _transcribeFreeFallback(audioBlob, audioUrl) {
            // If Puter AI or public STT gateway is available in browser context
            if (typeof puter !== 'undefined' && puter.ai && typeof puter.ai.speech2txt === 'function') {
                const res = await puter.ai.speech2txt({ audio: audioBlob });
                if (res && res.text) return res.text;
            }
    
            // Return null to let caller handle gracefully
            return null;
        }
    
        /**
         * Solve via NopeCHA Token API
         */
        async solveNopeCha(siteKey, pageUrl, type = 'recaptcha') {
            if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
            const nopechaType = type === 'turnstile' ? 'turnstile' : (type === 'hcaptcha' ? 'hcaptcha' : 'recaptcha');
            const res = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&type=${nopechaType}&sitekey=${siteKey}&url=${pageUrl}`);
            const data = await res.json();
            if (!data || data.error) throw new Error(`NopeCHA Error: ${data?.message || 'Unknown'}`);
            return data.data;
        }
    
        /**
         * Solve via 2Captcha API
         */
        async solve2Captcha(siteKey, pageUrl, type = 'recaptcha', extra = {}) {
            if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
            let method = 'userrecaptcha';
            let extraParams = '';
            if (type === 'hcaptcha') {
                method = 'hcaptcha';
                extraParams = `&sitekey=${siteKey}`;
            } else if (type === 'turnstile') {
                method = 'turnstile';
                extraParams = `&sitekey=${siteKey}`;
            } else if (type === 'image' || type === 'base64') {
                method = 'base64';
            } else {
                extraParams = `&googlekey=${siteKey}`;
                if (extra.version === 'v3' || type === 'recaptcha_v3') {
                    extraParams += `&version=v3&action=${encodeURIComponent(extra.action || 'verify')}&min_score=0.3`;
                }
                if (extra.enterprise || type === 'recaptcha_enterprise') {
                    extraParams += '&enterprise=1';
                }
                if (extra.invisible) {
                    extraParams += '&invisible=1';
                }
            }

            let data;
            if (method === 'base64') {
                const formData = new URLSearchParams();
                formData.append('key', this.config.twoCaptchaKey);
                formData.append('method', 'base64');
                formData.append('body', extra.body || siteKey);
                formData.append('json', '1');
                const res = await fetch('https://2captcha.com/in.php', { method: 'POST', body: formData });
                data = await res.json();
            } else {
                const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=${method}${extraParams}&pageurl=${encodeURIComponent(pageUrl)}&json=1`);
                data = await res.json();
            }
            if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
            
            const taskId = data.request;
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 4000));
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
    
        /**
         * [Owner Authorized Enhancement: Extended Solver Registry]
         */
        async solveChallengeGeneric(type, params) {
            switch (type) {
                case 'recaptcha':
                case 'recaptcha_v2':
                    return this.config.twoCaptchaKey ? this.solve2Captcha(params.siteKey, params.pageUrl, 'recaptcha')
                        : (this.config.nopeChaKey ? this.solveNopeCha(params.siteKey, params.pageUrl, 'recaptcha') : null);
                case 'hcaptcha':
                    return this.config.twoCaptchaKey ? this.solve2Captcha(params.siteKey, params.pageUrl, 'hcaptcha')
                        : (this.config.nopeChaKey ? this.solveNopeCha(params.siteKey, params.pageUrl, 'hcaptcha') : null);
                case 'turnstile':
                    return this.config.nopeChaKey ? this.solveNopeCha(params.siteKey, params.pageUrl, 'turnstile') : null;
                case 'audio_wit':
                case 'audio':
                    return this.transcribeAudio(params.audioData, params.audioUrl);
                default:
                    throw new Error(`Unsupported solver type: ${type}`);
            }
        }
    
        /**
         * [Owner Authorized Enhancement: Autonomous Multi-Tier Fallback Chain]
         */
        async solveSmartFallbackChain(challengeType, params = {}) {
            const errors = [];
    
            // 1. Audio Bypass (if audioData or audioUrl is present)
            if (params.audioData || params.audioUrl) {
                try {
                    const text = await this.transcribeAudio(params.audioData, params.audioUrl);
                    if (text && text.trim()) {
                        return { success: true, method: 'audio_stt', solution: text.trim() };
                    }
                } catch (err) {
                    errors.push(`AudioSTT: ${err.message}`);
                }
            }
    
            // 2. NopeCHA Fast Token
            if (this.config.nopeChaKey && params.siteKey && params.pageUrl) {
                try {
                    const token = await this.solveNopeCha(params.siteKey, params.pageUrl, challengeType);
                    if (token) {
                        return { success: true, method: 'nopecha', token };
                    }
                } catch (err) {
                    errors.push(`NopeCHA: ${err.message}`);
                }
            }
    
            // 3. 2Captcha Reliable Solver
            if (this.config.twoCaptchaKey && params.siteKey && params.pageUrl) {
                try {
                    const token = await this.solve2Captcha(params.siteKey, params.pageUrl, challengeType);
                    if (token) {
                        return { success: true, method: '2captcha', token };
                    }
                } catch (err) {
                    errors.push(`2Captcha: ${err.message}`);
                }
            }
    
            return { 
                success: false, 
                error: "ALL_SOLVER_TIERS_EXHAUSTED", 
                details: errors.join(" | ") 
            };
        }
    }
    
    // Universal Global Scope Binding (Service Worker / Content / Window);
}

markBoot("solver_instantiation");
const solver = new self.XpiderSolverCore();

// [Auto CAPTCHA Solver Boot] Restore CAPTCHA credentials from persistent storage on startup
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
                logBg(null, `[Auto CAPTCHA Solver Boot] 2Captcha key restored keyConfigured=true`, 'info');
            }
        } else if (method === 'nopecha') {
            if (apiKey) {
                solver.config.nopeChaKey = apiKey;
                logBg(null, `[Auto CAPTCHA Solver Boot] NopeCHA key restored`, 'info');
            }
        }
    } catch (bootErr) {
        console.warn('[Auto CAPTCHA Solver Boot] Failed to restore credentials:', bootErr.message);
    }
})();
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

// [Issue #6 R6.6, R6.7 & R6.8 P0-6] Retained inspection tabs for DELIVERY_UNKNOWN (max 3)
const retainedUncertainTabs = [];
const retainedTabIds = new Set();
const campaignOwnedTabIds = new Set();
const MAX_RETAINED_UNCERTAIN_TABS = 3;

// [Issue #6 R4.1] Centralized Authoritative List Clear Handlers
async function clearAutoFormData() {
    campaignState.isActive = false;
    campaignState.isPaused = false;
    campaignState.isLoopRunning = false;
    if (campaignState.activeTimeoutId) {
        clearTimeout(campaignState.activeTimeoutId);
        campaignState.activeTimeoutId = null;
    }
    if (campaignState.currentDiscoveryCtx) {
        campaignState.currentDiscoveryCtx.aborted = true;
        campaignState.currentDiscoveryCtx = null;
    }
    if (chrome.alarms) {
        chrome.alarms.clear("xpider_next_target");
        chrome.alarms.clear("xpider_next_target_failsafe");
    }
    if (campaignState.currentTabId) {
        chrome.tabs.remove(campaignState.currentTabId).catch(() => {});
        campaignState.currentTabId = null;
    }
    if (campaignState.targetTabId) {
        chrome.tabs.remove(campaignState.targetTabId).catch(() => {});
        campaignState.targetTabId = null;
    }
    for (const rId of retainedTabIds) {
        chrome.tabs.remove(rId).catch(() => {});
    }
    retainedTabIds.clear();
    campaignOwnedTabIds.clear();
    retainedUncertainTabs.length = 0;

    campaignState.queue = [];
    campaignState.visitedUrls = [];
    campaignState.successfulUrls = [];
    campaignState.currentAttempt = null;
    campaignState.pausedCheckpoint = null;
    campaignState.outcomeHistogram = {};
    for (const k of Object.keys(coreRuntimeRefErrors)) delete coreRuntimeRefErrors[k];

    campaignState.counters = {
        total: 0,
        completed: 0,
        success: 0,
        failed: 0,
        deliveryUnknown: 0,
        skippedHistory: 0,
        inProgress: 0,
        failureBreakdown: {}
    };
    campaignState.successCount = 0;
    campaignState.totalTargets = 0;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.autoform);
        if (chrome.storage.session) {
            await chrome.storage.session.remove(LIST_DATA_KEYS.autoform).catch(() => {});
        }
    }

    broadcastCounters();
    chrome.runtime.sendMessage({
        action: 'UPDATE_STATS',
        data: {
            successCount: 0,
            remainingCount: 0,
            totalTargets: 0
        }
    }).catch(() => {});
    return { success: true, message: "Business URLs and campaign queue cleared." };
}

async function clearHistoryData() {
    const hs = await getHistoryStoreInstance();
    if (hs && typeof hs.clearAll === 'function') {
        await hs.clearAll();
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.history);
        if (chrome.storage.session) {
            await chrome.storage.session.remove(LIST_DATA_KEYS.history).catch(() => {});
        }
    }
    return { success: true, message: "History and audit ledger cleared to 0 rows." };
}

async function clearDiagnosticsData() {
    logBuffer = [];
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.diagnostics);
        if (chrome.storage.session) {
            await chrome.storage.session.remove(LIST_DATA_KEYS.diagnostics).catch(() => {});
        }
    }
    logBg(null, "Diagnostic log cleared.", "info");
    return { success: true, message: "Diagnostic log cleared." };
}

async function clearEmailCollectorData() {
    try {
        const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
        if (StoreClass) {
            const emailStore = (typeof StoreClass.getInstance === 'function')
                ? StoreClass.getInstance(chrome.storage.local)
                : (self.__xpiderEmailStore || new StoreClass(chrome.storage.local));
            self.__xpiderEmailStore = emailStore;
            await emailStore.clearAll({ suppressRecollectMs: 5000 });
        }
    } catch (_) {}
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.emailCollector);
        if (chrome.storage.session) {
            await chrome.storage.session.remove(LIST_DATA_KEYS.emailCollector).catch(() => {});
        }
    }
    if (typeof chrome !== 'undefined' && chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '' });
    }
    return { success: true, message: "Email collector lists cleared." };
}

async function resetAllListData() {
    // 1. Pause/stop engine and clear autoform data
    await clearAutoFormData();
    // 2. Clear history data
    await clearHistoryData();
    // 3. Clear email collector data
    await clearEmailCollectorData();
    // 4. Clear diagnostics data
    await clearDiagnosticsData();
    // 5. Ensure all keys in storage registry are removed
    const allKeysToRemove = [
        ...LIST_DATA_KEYS.autoform,
        ...LIST_DATA_KEYS.history,
        ...LIST_DATA_KEYS.diagnostics,
        ...LIST_DATA_KEYS.emailCollector
    ];
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(allKeysToRemove);
        if (chrome.storage.session) {
            await chrome.storage.session.remove(allKeysToRemove).catch(() => {});
        }
        await chrome.storage.local.set({ xpider_reset_generation: Date.now() });
    }
    return { success: true, message: "All list data authoritatively reset to 0." };
}

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

        case 'GET_BUILD_PROVENANCE':
            sendResponse({
                success: true,
                branch: 'upgrade/phase-0-1',
                head: '951e33f064d5137a000adaf976f18d26e64139bc',
                headShort: '951e33f',
                rollbackBase: 'b8e1d0362946cd6ca8c77c1aa990998da62c2c91',
                manifestVersion: 3,
                buildId: 'R6.8-20261003-REM',
                builtAt: '2026-10-03T07:45:00.000Z'
            });
            return true;

        case 'START_CAMPAIGN':
            // [Issue #6 R6.8 P0-1] Emit immutable Build Provenance at campaign boot
            const provLogs = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.getBuildProvenanceLogs === 'function')
                ? BuildProvenance.getBuildProvenanceLogs()
                : [
                    "[BUILD_ID] branch=upgrade/phase-0-1 head=951e33f064d5137a000adaf976f18d26e64139bc manifestVersion=3 buildId=R6.8-20261003-REM builtAt=2026-10-03T07:45:00.000Z",
                    "[BUILD_MODULE] contactGateSha=sha256_cg_r6_8_remediation",
                    "[BUILD_MODULE] visionSubmitSha=sha256_vs_r6_8_remediation",
                    "[BUILD_MODULE] outcomeVerifierSha=sha256_ov_r6_8_remediation",
                    "[BUILD_MODULE] backgroundSha=sha256_bg_r6_8_remediation"
                ];
            for (const plog of provLogs) {
                console.log(plog);
                logBg(null, plog, "info");
            }

            // [R6.4 3] Log START_BG received
            const queueLen = (request && Array.isArray(request.queue)) ? request.queue.length : 0;
            logBg(null, `[START_BG] received queue=${queueLen}`, "info");
            console.log(`[START_BG] received queue=${queueLen}`);
            // [v18.25.0] Total Decoupling: Respond first, boot async
            sendResponse({ success: true, status: 'acknowledged', queueCount: queueLen });
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

        case 'GET_LEDGER_STATS':
            (async () => {
                try {
                    const hs = await getHistoryStoreInstance();
                    const scope = request.scope || 'currentRun';
                    const stats = hs.getLedgerStats(scope, campaignState.campaignRunId);
                    sendResponse({ success: true, stats });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'RECONCILE_ATTEMPT_VISUAL':
            (async () => {
                try {
                    const hs = await getHistoryStoreInstance();
                    const result = await hs.reconcileAttemptVisual(request.attemptId, request.status, request.extra || {});
                    const ledgerStats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
                    campaignState.counters.success = ledgerStats.success;
                    campaignState.counters.failed = ledgerStats.failure;
                    campaignState.counters.deliveryUnknown = ledgerStats.unknown;
                    campaignState.counters.timeout = ledgerStats.timeout;
                    campaignState.counters.skipped = ledgerStats.skipped;
                    campaignState.counters.paused = ledgerStats.paused;
                    campaignState.counters.completed = ledgerStats.completed;
                    campaignState.counters.failureBreakdown = ledgerStats.failureBreakdown;
                    campaignState.counters.remaining = Math.max(0, campaignState.counters.total - campaignState.counters.completed);
                    campaignState.successCount = ledgerStats.success;
                    await persistCounters();
                    broadcastCounters();
                    sendResponse({ success: true, result, ledgerStats });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
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

        case 'FORM_GATE_PASSED':
            if (sender.tab && sender.tab.id === campaignState.currentTabId) {
                const cUrl = request.contactPageUrl || sender.tab.url;
                const fUrl = request.formPageUrl || sender.tab.url;
                if (campaignState.currentDiscoveryCtx) {
                    campaignState.currentDiscoveryCtx.selectedContactUrl = cUrl;
                    campaignState.currentDiscoveryCtx.selectedFormUrl = fUrl;
                    campaignState.currentDiscoveryCtx.committedContactUrl = cUrl;
                    campaignState.currentDiscoveryCtx.committedFormUrl = fUrl;
                }
                logBg(sender.tab.id, `[CONTACT_COMMIT] contactPageUrl=${cUrl}`, "info");
                logBg(sender.tab.id, `[FORM_COMMIT] formPageUrl=${fUrl}`, "info");

                // [Issue #6 R6.8 P1-2] Immediate commit to active HistoryStore attempt
                if (campaignState.currentAttempt && campaignState.currentAttempt.attemptId) {
                    getHistoryStoreInstance().then(hs => {
                        if (hs && typeof hs.updateAttemptContact === 'function') {
                            hs.updateAttemptContact(campaignState.currentAttempt.attemptId, {
                                committedContactUrl: cUrl,
                                committedFormUrl: fUrl,
                                lockPreSubmitUrls: true,
                                targetToken: campaignState.currentTargetToken
                            }, campaignState.currentTargetToken);
                            hs.persist().catch(() => {});
                        }
                    }).catch(() => {});
                }

                sendResponse({ success: true });
            }
            return true;

        case 'STAGE_PROGRESSION':
            // [Issue #6 R6.5] Standardized pipeline metrics logging and target stage tracking
            if (sender.tab && request.stage) {
                campaignState.currentTargetStage = request.stage;
                const activeStages = ['ACTIVE_FORM', 'FILLING', 'CAPTCHA', 'FINAL_AUDIT', 'SUBMIT_ATTEMPT_STARTED', 'SUBMITTING', 'SUBMIT_TRIGGERED', 'VERIFYING'];
                if (activeStages.includes(request.stage)) {
                    if (chrome.alarms) {
                        chrome.alarms.create(`xpider_watchdog_${sender.tab.id}_${campaignState.sessionId}`, { delayInMinutes: 1 });
                    }
                }
                const stageMap = {
                    SOURCE_OPENED: '📂',
                    CONTACT_PAGE_FOUND: '📍',
                    ELIGIBLE_FORM_FOUND: '📋',
                    REQUIRED_FIELDS_RESOLVED: '✅',
                    FIELD_STATE_STABLE: '🔒',
                    SUBMIT_ATTEMPT_STARTED: '⏳',
                    SUBMIT_TRIGGERED: '📤',
                    CONFIRMED_SUCCESS: '🎉'
                };
                const icon = stageMap[request.stage] || '📌';
                logBg(sender.tab.id, `${icon} [PIPELINE][${request.stage}] url=${request.url || sender.tab.url}`, 'success');
                if (campaignState.currentDiscoveryCtx) {
                    if (!campaignState.currentDiscoveryCtx.stageHistory) campaignState.currentDiscoveryCtx.stageHistory = [];
                    campaignState.currentDiscoveryCtx.stageHistory.push({ stage: request.stage, ts: Date.now(), url: request.url || sender.tab.url });
                }
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
                    
                    // [Auto CAPTCHA Solver v2] Default to 2Captcha API if not set
                    const method = request.method || storage.xpider_captcha_method || storage.captchaMethod || 'api';
                    const apiKey = storage.xpider_captcha_api_key || storage.captchaApiKey || '';
                    const witKey = storage.xpider_stt_api_key || storage.audioSttKey || storage.witKey || null;
                    
                    // Refresh live solver config from storage on every call
                    solver.config.witAiKey = witKey;
                    if (method === 'nopecha') {
                        solver.config.nopeChaKey = apiKey;
                    } else if (method === 'api' || method === '2captcha') {
                        solver.config.twoCaptchaKey = apiKey;
                    }

                    logBg(null, `[Auto CAPTCHA Solver] SOLVE_CAPTCHA: method=${method} keyConfigured=${!!apiKey} url=${request.url||''}`, 'info');
                    
                    // Normalize host page URL (crucial when request originated from reCAPTCHA / external iframe)
                    let targetPageUrl = request.url || '';
                    if (!targetPageUrl || targetPageUrl.includes('google.com/recaptcha') || targetPageUrl.includes('recaptcha.net')) {
                        targetPageUrl = request.hostUrl || request.referrer || (sender && sender.tab && sender.tab.url) || '';
                    }

                    // [Priority 1] 2Captcha token solver (API method)
                    if ((method === 'api' || method === '2captcha') && solver.config.twoCaptchaKey) {
                        try {
                            const extra = request.extra || {
                                body: request.imageData,
                                version: request.version,
                                action: request.captchaAction,
                                enterprise: request.enterprise,
                                invisible: request.invisible
                            };
                            const token = await solver.solve2Captcha(request.sitekey, targetPageUrl, request.type || 'recaptcha', extra);
                            logBg(null, `[Auto CAPTCHA Solver] 2Captcha SUCCESS keyConfigured=true tokenLength=${token ? token.length : 0}`, 'success');

                            // [Multi-Frame Autonomous Injection] Inject solved token across ALL frames in the tab (supports nested iframes like PerfectMind)
                            const activeTabId = (sender && sender.tab && sender.tab.id) || request.tabId || campaignState?.activeTabId;
                            if (activeTabId) {
                                try {
                                    await safeScripting.executeScript({
                                        target: { tabId: activeTabId, allFrames: true },
                                        func: (solToken, capType) => {
                                            try {
                                                const fields = capType === 'hcaptcha'
                                                    ? document.querySelectorAll('[name="h-captcha-response"], textarea[name="h-captcha-response"]')
                                                    : document.querySelectorAll('[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]');
                                                for (const f of fields) {
                                                    try {
                                                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                                                        if (nativeSetter) nativeSetter.call(f, solToken);
                                                        else f.value = solToken;
                                                        f.dispatchEvent(new Event('input', { bubbles: true }));
                                                        f.dispatchEvent(new Event('change', { bubbles: true }));
                                                    } catch (_) { f.value = solToken; }
                                                }
                                                if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
                                                    for (const cid in window.___grecaptcha_cfg.clients) {
                                                        const client = window.___grecaptcha_cfg.clients[cid];
                                                        for (const k in client) {
                                                            const obj = client[k];
                                                            if (obj) {
                                                                if (typeof obj.callback === 'function') obj.callback(solToken);
                                                                else if (typeof obj.callback === 'string' && typeof window[obj.callback] === 'function') window[obj.callback](solToken);
                                                            }
                                                        }
                                                    }
                                                }
                                                if (typeof window.validateRecaptcha === 'function') {
                                                    try { window.validateRecaptcha(solToken); } catch (_) {}
                                                }
                                                const gWidget = document.querySelector('.g-recaptcha[data-callback]');
                                                if (gWidget && gWidget.dataset.callback && typeof window[gWidget.dataset.callback] === 'function') {
                                                    try { window[gWidget.dataset.callback](solToken); } catch (_) {}
                                                }
                                                const anchor = document.querySelector('#recaptcha-anchor, .recaptcha-checkbox');
                                                if (anchor) {
                                                    anchor.setAttribute('aria-checked', 'true');
                                                    anchor.classList.add('recaptcha-checkbox-checked');
                                                }
                                                const errLabel = document.querySelector("label[for='g-recaptcha-Reg'], .recaptcha-wrapper label");
                                                if (errLabel) errLabel.style.display = 'none';
                                                window.postMessage({ type: 'captchaToken', 'g-recaptcha-response': solToken, token: solToken, action: 'CAPTCHA_SOLVED', source: 'xpider_solver' }, '*');
                                            } catch (e) {
                                                console.warn('[CrossFrameTokenInject] frame err:', e);
                                            }
                                        },
                                        args: [token, request.type || 'recaptcha']
                                    });
                                } catch (eScript) {
                                    console.warn('[CrossFrameTokenInject] executeScript failed:', eScript);
                                }
                            }

                            sendResponse({ success: true, method: '2captcha', token });
                            return;
                        } catch (e2) {
                            logBg(null, `[Auto CAPTCHA Solver] 2Captcha FAILED: ${e2.message}`, 'error');
                            sendResponse({ success: false, error: e2.message });
                            return;
                        }
                    } else if (method === 'api' || method === '2captcha') {
                        const errMsg = "2Captcha API Key is missing in Settings.";
                        logBg(null, `[Auto CAPTCHA Solver] 2Captcha FAILED: ${errMsg}`, 'error');
                        sendResponse({ success: false, error: errMsg });
                        return;
                    }

                    // [Priority 2] NopeCHA fast token
                    if (method === 'nopecha' && solver.config.nopeChaKey) {
                        try {
                            const token = await solver.solveNopeCha(request.sitekey, targetPageUrl, request.type || 'recaptcha');
                            logBg(null, `[Auto CAPTCHA Solver] NopeCHA SUCCESS`, 'success');
                            sendResponse({ success: true, method: 'nopecha', token });
                            return;
                        } catch (enp) {
                            logBg(null, `[Auto CAPTCHA Solver] NopeCHA FAILED: ${enp.message}`, 'error');
                            sendResponse({ success: false, error: enp.message });
                            return;
                        }
                    } else if (method === 'nopecha') {
                        const errMsg = "NopeCHA API Key is missing in Settings.";
                        logBg(null, `[Auto CAPTCHA Solver] NopeCHA FAILED: ${errMsg}`, 'error');
                        sendResponse({ success: false, error: errMsg });
                        return;
                    }

                    // [Priority 3] Autonomous Multi-Tier Fallback Chain (Only if explicitly enabled or audio method)
                    if (method === 'audio' || method === 'native' || witKey) {
                        if (typeof solver.solveSmartFallbackChain === 'function') {
                            const result = await solver.solveSmartFallbackChain(request.type || 'recaptcha', {
                                siteKey: request.sitekey,
                                pageUrl: targetPageUrl,
                                audioData: request.audioData
                            });
                            if (result.success) {
                                sendResponse(result);
                                return;
                            }
                        }
                        sendResponse({ success: true, method: 'audio_frame_solver', message: 'Autonomous audio solver active in iframe' });
                        return;
                    }

                    throw new Error(`CAPTCHA solver: no valid method/key configured (method: ${method}). Configure API key in Settings.`);
                } catch (e) {
                    logBg(null, `[Auto CAPTCHA Solver] SOLVE_CAPTCHA ERROR: ${e.message}`, 'error');
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'DISPATCH_PHYSICAL_COORDINATE_CLICK':
            (async () => {
                const targetTabId = request.tabId || sender?.tab?.id || campaignState?.activeTabId;
                const { x, y } = request;
                logBg(targetTabId, `[VISION_SUBMIT] coordinateClickRequest x=${Math.round(x)} y=${Math.round(y)} tabId=${targetTabId}`, 'info');
                
                try {
                    if (typeof chrome !== 'undefined' && chrome.debugger) {
                        const target = { tabId: targetTabId };
                        await new Promise((res, rej) => {
                            chrome.debugger.attach(target, "1.3", () => {
                                if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
                                else res();
                            });
                        });
                        
                        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
                            type: "mouseMoved",
                            x: Math.round(x),
                            y: Math.round(y)
                        });
                        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
                            type: "mousePressed",
                            button: "left",
                            clickCount: 1,
                            x: Math.round(x),
                            y: Math.round(y)
                        });
                        await new Promise(r => setTimeout(r, 60));
                        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
                            type: "mouseReleased",
                            button: "left",
                            clickCount: 1,
                            x: Math.round(x),
                            y: Math.round(y)
                        });
                        await new Promise((res) => {
                            chrome.debugger.detach(target, () => res());
                        });
                        logBg(targetTabId, `[VISION_SUBMIT] physicalClickDispatched=true tabId=${targetTabId}`, 'success');
                        sendResponse({ success: true, method: 'cdp_debugger' });
                    } else {
                        logBg(targetTabId, `[VISION_SUBMIT] physicalClickDispatched=true fallback=true`, 'info');
                        sendResponse({ success: true, method: 'fallback' });
                    }
                } catch (err) {
                    logBg(targetTabId, `[VISION_SUBMIT] CDP dispatch notice: ${err.message}`, 'warning');
                    sendResponse({ success: false, error: err.message });
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

        case 'UPDATE_CAPTCHA_KEY':
            // [Auto CAPTCHA Solver] Live sync of CAPTCHA method + API key to solver engine
            (async () => {
                const method = request.method || 'api';
                const key = request.key || '';
                const shortKey = key ? key.substring(0, 8) + '...' : 'NONE';
                logBg(null, `[CAPTCHA-Sync] method=${method} key=${shortKey}`, 'info');
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

        case 'CLEAR_BUSINESS_URLS':
            bgOperationQueue.enqueue(async () => {
                try {
                    const res = await clearAutoFormData();
                    sendResponse(res);
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'CLEAR_HISTORY_LEDGER':
            bgOperationQueue.enqueue(async () => {
                try {
                    const res = await clearHistoryData();
                    sendResponse(res);
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'CLEAR_DIAGNOSTIC_LOGS':
            bgOperationQueue.enqueue(async () => {
                try {
                    const res = await clearDiagnosticsData();
                    sendResponse(res);
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'CLEAR_EMAIL_COLLECTOR':
            bgOperationQueue.enqueue(async () => {
                try {
                    const res = await clearEmailCollectorData();
                    sendResponse(res);
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;

        case 'RESET_ALL_LIST_DATA':
        case 'FULL_RESET_CAMPAIGN_DATA':
            bgOperationQueue.enqueue(async () => {
                try {
                    const res = await resetAllListData();
                    logBg(null, "🧹 [FullReset] FULL_RESET_CAMPAIGN_DATA executed. Clean slate restored (templates & API keys preserved).", "success");
                    sendResponse(res);
                } catch (err) {
                    console.error("FULL_RESET_CAMPAIGN_DATA error:", err);
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
            return true;

        case 'EXPORT_GSHEETS_CSV':
            // [Section K Google Sheets RFC-4180 CSV Export]
            bgOperationQueue.enqueue(async () => {
                try {
                    if (!self.__xpiderHistoryStore) {
                        self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                        await self.__xpiderHistoryStore.load();
                    }
                    const csvContent = self.__xpiderHistoryStore.exportGoogleSheetsCsv(request.options || {});
                    sendResponse({ success: true, csv: csvContent });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;
        case 'EMAIL_COLLECT_FOUND':
            // [Issue #6 Email Collector Integration] Non-blocking email accumulation with generation check
            (async () => {
                try {
                    const { emails, hostname, url, generation } = request;
                    if (Array.isArray(emails) && emails.length > 0) {
                        const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                        if (StoreClass) {
                            const store = (typeof StoreClass.getInstance === 'function')
                                ? StoreClass.getInstance(chrome.storage.local)
                                : (self.__xpiderEmailStore || new StoreClass(chrome.storage.local));
                            self.__xpiderEmailStore = store;
                            const stats = await store.add(hostname, emails, url, generation);
                            if (!stats.suppressed && !stats.staleGeneration && !stats.baselineSuppressed) {
                                logBg(sender.tab?.id, `[TARGET][${hostname}] emailsFoundCurrentPage=${stats.currentPageCount} emailsNewGlobal=${stats.newGlobalCount} totalEmailsGlobal=${stats.totalGlobalCount}`, 'info');
                            }
                            sendResponse({ success: true, ...stats });
                            return;
                        }
                    }
                    sendResponse({ success: true, count: 0 });
                } catch (err) {
                    console.warn('[EmailCollector] Auxiliary persistence error:', err);
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;

        case 'GET_COLLECTED_EMAILS':
            (async () => {
                try {
                    const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                    const store = (typeof StoreClass.getInstance === 'function')
                        ? StoreClass.getInstance(chrome.storage.local)
                        : (self.__xpiderEmailStore || (StoreClass ? new StoreClass(chrome.storage.local) : null));
                    if (store) {
                        const state = await store.getState();
                        sendResponse({ success: true, current: state.currentSite, all: state.allCollected, state });
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
                    const store = (typeof StoreClass.getInstance === 'function')
                        ? StoreClass.getInstance(chrome.storage.local)
                        : (self.__xpiderEmailStore || (StoreClass ? new StoreClass(chrome.storage.local) : null));
                    if (store) {
                        if (request.mode === 'current') {
                            await store.clearCurrentSite(request.hostname, request.url, { suppressRecollectMs: 5000 });
                            sendResponse({ success: true, mode: 'current' });
                        } else {
                            await clearEmailCollectorData();
                            sendResponse({ success: true, mode: 'all' });
                        }
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
        if (executableQueue.length === 0 && originalInputCount > 0) {
            logBg(null, `⚠️ [Queue Filter] All ${originalInputCount} targets were skipped (historySkipped=${historySkippedCount}, suppressed=${suppressedCount}). If re-testing, disable 'Skip Previously Attempted' or reset history suppression.`, "warning");
        }

        // [v18.15.5 & R6.9A] Restore Campaign Variables
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
        campaignState.totalTargets = executableQueue.length;
        campaignState.visitedUrls = []; 
        campaignState.successfulUrls = []; 
        campaignState.captchaCounts = {}; // [v4.12.23] 캡차 시도 횟수 초기화
        campaignState.activeTimeoutId = null;
        campaignState.currentTabId = null;
        campaignState.outcomeHistogram = {};
        campaignState.pausedCheckpoint = null;
        for (const k of Object.keys(coreRuntimeRefErrors)) delete coreRuntimeRefErrors[k];

        // [R6.9A] Persistent campaignRunId for ledger scoping
        if (!options.isResume || !campaignState.campaignRunId) {
            campaignState.campaignRunId = 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            if (hs) hs.activeCampaignRunId = campaignState.campaignRunId;
            chrome.storage.local.set({ xpider_active_campaign_run_id: campaignState.campaignRunId }).catch(() => {});
        }
        
        logBg(null, "[Boot] Variables initialized.", "debug");
        logBg(null, "🚀 Engine booting...", "start");
        
        // Clear old paused checkpoint on fresh campaign start
        chrome.storage.local.remove(['xpider_paused_checkpoint']).catch(() => {});
        saveCampaignState().catch(() => {}); 
        logBg(null, "[Boot] Storage sync initiated.", "debug");

        const ledgerStats = hs ? hs.getLedgerStats('currentRun', campaignState.campaignRunId) : null;
        campaignState.counters = {
            success: ledgerStats ? ledgerStats.success : 0,
            failed: ledgerStats ? ledgerStats.failure : 0,
            completed: ledgerStats ? ledgerStats.completed : 0,
            remaining: executableQueue.length,
            deliveryUnknown: ledgerStats ? ledgerStats.unknown : 0,
            timeout: ledgerStats ? ledgerStats.timeout : 0,
            skipped: ledgerStats ? ledgerStats.skipped : 0,
            paused: ledgerStats ? ledgerStats.paused : 0,
            skippedHistory: historySkippedCount,
            inProgress: 0,
            total: executableQueue.length,
            failureBreakdown: ledgerStats ? { ...ledgerStats.failureBreakdown } : {}
        };
        campaignState.successCount = campaignState.counters.success;
        if (ledgerStats) {
            console.log(ledgerStats.logStr);
            logBg(null, ledgerStats.logStr, "info");
        }
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

    // Cancel discovery if in flight
    if (campaignState.currentDiscoveryCtx) {
        campaignState.currentDiscoveryCtx.aborted = true;
        campaignState.currentDiscoveryCtx = null;
    }

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
    if (campaignState.targetTabId) {
        chrome.tabs.remove(campaignState.targetTabId).catch(() => {});
        campaignState.targetTabId = null;
    }

    // Current target handling
    const currentAtt = campaignState.currentAttempt;
    if (currentAtt && currentAtt.url) {
        if (currentAtt.status === 'PREPARING') {
            // No submit boundary crossed: settle INTERRUPTED_PAUSE and requeue to front
            try {
                const hs = await getHistoryStoreInstance();
                if (currentAtt.attemptId && hs) {
                    await hs.settleCanonicalAttempt(currentAtt.attemptId, 'FAILURE', 'INTERRUPTED_PAUSE', {}, {
                        campaignRunId: campaignState.campaignRunId
                    });
                    await hs.persist();
                }
            } catch (_) {}
            const normUrl = normalizeUrl(currentAtt.url);
            campaignState.visitedUrls = campaignState.visitedUrls.filter(u => u !== normUrl && u !== currentAtt.url);
            if (!campaignState.queue.includes(currentAtt.url)) {
                campaignState.queue.unshift(currentAtt.url);
            }
            logBg(null, `🔄 [Pause] Current target re-queued to front: ${currentAtt.url}`, "info");
        } else if (currentAtt.status === 'SUBMIT_PENDING') {
            // In-flight submit: settle PAUSED_UNKNOWN and do NOT blindly resend
            try {
                const hs = await getHistoryStoreInstance();
                if (currentAtt.attemptId && hs) {
                    await hs.settleCanonicalAttempt(currentAtt.attemptId, 'PAUSED_UNKNOWN', REASON_CODES.DELIVERY_UNKNOWN, {}, {
                        campaignRunId: campaignState.campaignRunId
                    });
                    await hs.persist();
                    const stats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
                    campaignState.counters.success = stats.success;
                    campaignState.counters.failed = stats.failure;
                    campaignState.counters.deliveryUnknown = stats.unknown;
                    campaignState.counters.timeout = stats.timeout;
                    campaignState.counters.skipped = stats.skipped;
                    campaignState.counters.paused = stats.paused;
                    campaignState.counters.completed = stats.completed;
                    campaignState.counters.failureBreakdown = { ...stats.failureBreakdown };
                    campaignState.counters.remaining = Math.max(0, campaignState.counters.total - stats.completed - campaignState.counters.skippedHistory);
                    campaignState.successCount = stats.success;
                    await persistCounters();
                    broadcastCounters();
                }
            } catch (_) {}
            if (!campaignState.outcomeHistogram) campaignState.outcomeHistogram = {};
            campaignState.outcomeHistogram[REASON_CODES.DELIVERY_UNKNOWN] = (campaignState.outcomeHistogram[REASON_CODES.DELIVERY_UNKNOWN] || 0) + 1;
            logBg(null, `⚠️ [Pause] In-flight target settled as PAUSED_UNKNOWN (not requeued): ${currentAtt.url}`, "warning");
        }
        campaignState.currentAttempt = null;
        campaignState.currentTargetStage = null;
        campaignState.submitLock = false;
        campaignState.timeoutWatchdogGen = (campaignState.timeoutWatchdogGen || 0) + 1;
        chrome.storage.local.remove('xpider_currentAttempt').catch(() => {});
    }

    // Save checkpoint snapshot
    if (saveCheckpoint) {
        const checkpoint = {
            campaignRunId: campaignState.campaignRunId,
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
            counters: { ...(campaignState.counters || {}) },
            restorationLogged: false
        };
        campaignState.checkpointHydratedForGeneration = false;
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
    if (checkpoint.campaignRunId) {
        campaignState.campaignRunId = checkpoint.campaignRunId;
    }
    const hs = await getHistoryStoreInstance();
    if (hs && campaignState.campaignRunId) {
        hs.activeCampaignRunId = campaignState.campaignRunId;
    }
    const ledgerStats = hs ? hs.getLedgerStats('currentRun', campaignState.campaignRunId) : null;
    if (ledgerStats) {
        campaignState.counters = {
            success: ledgerStats.success,
            failed: ledgerStats.failure,
            completed: ledgerStats.completed,
            remaining: campaignState.queue.length,
            deliveryUnknown: ledgerStats.unknown,
            timeout: ledgerStats.timeout,
            skipped: ledgerStats.skipped,
            paused: ledgerStats.paused,
            skippedHistory: (checkpoint.counters && checkpoint.counters.skippedHistory) || 0,
            inProgress: 0,
            total: campaignState.totalTargets,
            failureBreakdown: { ...ledgerStats.failureBreakdown }
        };
        campaignState.successCount = ledgerStats.success;
    } else if (checkpoint.counters) {
        campaignState.counters = { ...checkpoint.counters };
    }
    await persistCounters();
    broadcastCounters();
    
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

        // [Filter Guard] Skip government/military/academic and major portal/platform/shopping mall targets
        const nonBizCheck = isNonBusinessOrMajorPlatform(targetUrl);
        if (nonBizCheck.skip) {
            logBg(null, `⏭️ [Filter] Skipping non-business/gov/platform target: ${targetUrl} (${nonBizCheck.reason})`, "info");
            try {
                const hs = await getHistoryStoreInstance();
                if (hs && typeof hs.recordAttempt === 'function') {
                    const record = await hs.recordAttempt(targetUrl, {
                        campaignRunId: campaignState.campaignRunId,
                        status: 'SKIPPED',
                        reason: 'NON_BUSINESS_OR_GOV_SKIPPED'
                    });
                    const attId = record?.attemptId || record?.attempt?.attemptId;
                    if (attId && typeof hs.settleCanonicalAttempt === 'function') {
                        await hs.settleCanonicalAttempt(attId, 'SKIPPED', 'NON_BUSINESS_OR_GOV_SKIPPED', {}, {
                            campaignRunId: campaignState.campaignRunId,
                            resultUrl: targetUrl,
                            skipReason: nonBizCheck.reason
                        });
                    }
                    await hs.persist();
                    const ledgerStats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
                    campaignState.counters.success = ledgerStats.success;
                    campaignState.counters.failed = ledgerStats.failure;
                    campaignState.counters.deliveryUnknown = ledgerStats.unknown;
                    campaignState.counters.timeout = ledgerStats.timeout;
                    campaignState.counters.skipped = ledgerStats.skipped;
                    campaignState.counters.paused = ledgerStats.paused;
                    campaignState.counters.completed = ledgerStats.completed;
                    campaignState.counters.failureBreakdown = { ...ledgerStats.failureBreakdown };
                    campaignState.counters.remaining = Math.max(0, campaignState.counters.total - ledgerStats.completed - campaignState.counters.skippedHistory);
                    campaignState.successCount = ledgerStats.success;
                    await persistCounters();
                    broadcastCounters();
                }
            } catch (_) {}

            return processNextCampaignTarget(currentSession);
        }

        const targetIdx = campaignState.totalTargets - campaignState.queue.length;
        logBg(null, `[TARGET ${targetIdx}/${campaignState.totalTargets}][${targetHost}] START`, "info");
        if (chrome.alarms) chrome.alarms.create(`xpider_timeout_${currentSession}`, { delayInMinutes: 3 });

        const result = await Promise.race([

            orchestrateSending(targetUrl, campaignState.template),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Local Session Timeout")), 180000);
            })
        ]).catch(async (err) => {
            logBg(null, `⚠️ [Protection] Target skipped / timed out: ${err.message}`, "warning");
            const isLocalTimeout = err.message && err.message.includes('Local Session Timeout');
            const timeoutReason = isLocalTimeout ? 'TIMEOUT_LOCAL' : 'TIMEOUT_UNKNOWN';

            // [Issue #6 R6.8 P0-7] Every started target gets exactly one canonical final ledger record
            if (campaignState.currentAttempt && campaignState.currentAttempt.attemptId) {
                try {
                    const hs = await _getHistoryStore();
                    const timeoutStatus = isLocalTimeout ? 'TIMEOUT_LOCAL' : 'TIMEOUT_GLOBAL';
                    await hs.settleCanonicalAttempt(campaignState.currentAttempt.attemptId, timeoutStatus, timeoutReason, {}, {
                        campaignRunId: campaignState.campaignRunId,
                        resultUrl: targetUrl,
                        targetToken: campaignState.currentAttempt.targetToken
                    });
                    await hs.persist();
                    logBg(null, `[TARGET][${targetHost}] FINAL status=${timeoutStatus} reason=${timeoutReason}`, "warning");
                    
                    if (!campaignState.outcomeHistogram) campaignState.outcomeHistogram = {};
                    campaignState.outcomeHistogram[timeoutReason] = (campaignState.outcomeHistogram[timeoutReason] || 0) + 1;
                    
                    const ledgerStats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
                    campaignState.counters.success = ledgerStats.success;
                    campaignState.counters.failed = ledgerStats.failure;
                    campaignState.counters.deliveryUnknown = ledgerStats.unknown;
                    campaignState.counters.timeout = ledgerStats.timeout;
                    campaignState.counters.skipped = ledgerStats.skipped;
                    campaignState.counters.paused = ledgerStats.paused;
                    campaignState.counters.completed = ledgerStats.completed;
                    campaignState.counters.failureBreakdown = { ...ledgerStats.failureBreakdown };
                    campaignState.counters.inProgress = 0;
                    campaignState.counters.remaining = Math.max(0, campaignState.counters.total - ledgerStats.completed - campaignState.counters.skippedHistory);
                    campaignState.successCount = ledgerStats.success;
                    await persistCounters();
                    broadcastCounters();
                } catch (_) {}
            }
            return { success: false, error: err.message, reasonCode: timeoutReason };
        }).finally(() => {
            if (chrome.alarms) chrome.alarms.clear(`xpider_timeout_${currentSession}`);
            
            // [Issue #6 R6.8 P0-7] Target transition must atomically clear state
            campaignState.currentTargetStage = null;
            campaignState.currentAttempt = null;
            campaignState.submitLock = false;
            campaignState.timeoutWatchdogGen = (campaignState.timeoutWatchdogGen || 0) + 1;

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
        // [Issue #6 R6.5 Section 9] Session timeout must not settle active submission
        const activeStages = ['ACTIVE_FORM', 'FILLING', 'CAPTCHA', 'FINAL_AUDIT', 'SUBMIT_ATTEMPT_STARTED', 'SUBMITTING', 'SUBMIT_TRIGGERED', 'VERIFYING'];

        // [v18.12.0] Enhanced Emergency Dispatch: Force-check for stalls even if lock is held
        if (alarm.name.startsWith("xpider_watchdog_") || alarm.name === "xpider_next_target_failsafe") {
            if (activeStages.includes(campaignState.currentTargetStage)) {
                logBg(null, `[TIMEOUT_GUARD] Active submit in progress (stage=${campaignState.currentTargetStage}). Extending watchdog deadline...`, "info");
                return;
            }
            processNextCampaignTarget();
            return;
        }

        if (alarm.name.startsWith("xpider_timeout_")) {
            const parts = alarm.name.split('_');
            const session = parseInt(parts[parts.length - 1]);
            
            if (session !== campaignState.sessionId) {
                // [R6.3 C] Stale timeout callback from prior target/session — ignore
                logBg(null, `[TIMEOUT_GUARD] staleGeneration=true alarm.session=${session} current.session=${campaignState.sessionId} -> ignored`, "info");
                return;
            }

            if (activeStages.includes(campaignState.currentTargetStage)) {
                logBg(null, `[TIMEOUT_GUARD] Active form submit in progress (stage=${campaignState.currentTargetStage}). Extending global session timeout...`, "info");
                if (chrome.alarms) {
                    chrome.alarms.create(`xpider_timeout_${session}`, { delayInMinutes: 1 });
                }
                return;
            }

            logBg(null, `⚠️ [Protection] Global Session Timeout triggered. Advancing...`, "warning");
            // Explicitly clear lock to allow next target to enter
            campaignState.isLoopRunning = false;
            processNextCampaignTarget();
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

function isMeaningfulContactPath(pathOrUrl) {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') return false;
    let pathname = pathOrUrl.trim();
    try {
        if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
            pathname = new URL(pathname).pathname;
        }
    } catch (_) {}
    const clean = pathname.split('?')[0].split('#')[0].trim();
    // [Issue #6 R4.1] Root "/" and "" are VALID source/homepage paths
    if (!clean || clean === '/' || clean === '') return true;
    if (/(^|\/)\.(html?|php|asp|aspx)$/i.test(clean)) return false;
    return true;
}

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
            if (!p && (s === '.html' || s === '.php' || s === '.asp')) return;
            const combined = p + s;
            if (combined && isMeaningfulContactPath(combined) && !result.includes(combined)) {
                result.push(combined);
            }
        });
    });
    
    return result;
})();


// ========================================================================
// [Issue #6 Comment #51 Hotfix] Target-Scoped Candidate Registry & Hard Navigation Guard
// ========================================================================

const NON_HTML_DOWNLOADABLE_EXTENSIONS = /\.(vcf|ics|ical|ifb|msg|eml|pdf|doc|docx|rtf|odt|xls|xlsx|csv|tsv|ppt|pptx|zip|rar|7z|tar|gz|bz2|exe|msi|bat|cmd|sh|apk|dmg|pkg|bin|mp3|wav|ogg|mp4|avi|mov|mkv|webm|jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff|xml|json)(\?.*)?$/i;

const GOV_AND_ACADEMIC_DOMAIN_REGEX = /(^|\.)(gov|go\.[a-z]{2}|gov\.[a-z]{2}|mil|mil\.[a-z]{2}|edu|edu\.[a-z]{2}|ac\.[a-z]{2}|re\.kr)$/i;

const MAJOR_PLATFORMS_AND_PORTALS = new Set([
    'google.com', 'google.co.kr', 'youtube.com', 'youtu.be', 'blogger.com',
    'naver.com', 'daum.net', 'kakao.com', 'nate.com',
    'yahoo.com', 'yahoo.co.jp', 'bing.com', 'msn.com', 'live.com', 'office.com', 'outlook.com',
    'microsoft.com', 'apple.com', 'icloud.com', 'github.com', 'gitlab.com',
    'facebook.com', 'fb.com', 'instagram.com', 'threads.net', 'whatsapp.com',
    'twitter.com', 'x.com', 't.co', 'tiktok.com', 'pinterest.com', 'reddit.com',
    'tumblr.com', 'twitch.tv', 'discord.com', 'telegram.org', 't.me', 'linkedin.com',
    'wikipedia.org', 'wikimedia.org', 'w3.org', 'w3schools.com', 'mozilla.org',
    'wordpress.org', 'medium.com', 'substack.com', 'baidu.com', 'yandex.com', 'yandex.ru'
]);

const MAJOR_SHOPPING_MALLS = new Set([
    'coupang.com', 'gmarket.co.kr', '11st.co.kr', 'auction.co.kr',
    'wemakeprice.com', 'tmon.co.kr', 'interpark.com', 'ssg.com',
    'lotteon.com', 'musinsa.com', 'zigzag.kr', 'a-bly.com', 'ably.co.kr',
    'kurly.com', 'oliveyoung.co.kr', 'danawa.com', 'enuri.com',
    'kakaostyle.com', 'wadiz.kr', 'tumblbug.com',
    'walmart.com', 'target.com', 'costco.com', 'bestbuy.com',
    'homedepot.com', 'temu.com', 'shein.com', 'etsy.com'
]);

function isNonBusinessOrMajorPlatform(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return { skip: false };
    let hostname = '';
    try {
        const u = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
        hostname = (u.hostname || '').toLowerCase().replace(/^www\./, '');
    } catch (_) {
        hostname = urlStr.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    }
    if (!hostname) return { skip: false };

    // 1. Government, military, and academic institutions
    if (GOV_AND_ACADEMIC_DOMAIN_REGEX.test(hostname)) {
        return { skip: true, category: 'GOVERNMENT_OR_PUBLIC', reason: `Government / Public / Academic institution domain (${hostname}) skipped` };
    }

    // 2. Global engines with country TLDs (e.g. google.co.uk, amazon.de)
    if (/(^|\.)google\./i.test(hostname)) {
        return { skip: true, category: 'MAJOR_PLATFORM', reason: `Google portal/search service (${hostname}) skipped` };
    }
    if (/(^|\.)amazon\./i.test(hostname)) {
        return { skip: true, category: 'MAJOR_SHOPPING_MALL', reason: `Amazon shopping marketplace (${hostname}) skipped` };
    }
    if (/(^|\.)ebay\./i.test(hostname)) {
        return { skip: true, category: 'MAJOR_SHOPPING_MALL', reason: `eBay shopping marketplace (${hostname}) skipped` };
    }
    if (/(^|\.)aliexpress\./i.test(hostname) || /(^|\.)alibaba\./i.test(hostname)) {
        return { skip: true, category: 'MAJOR_SHOPPING_MALL', reason: `Alibaba/AliExpress marketplace (${hostname}) skipped` };
    }

    // 3. Major platform and portal set
    for (const p of MAJOR_PLATFORMS_AND_PORTALS) {
        if (hostname === p || hostname.endsWith('.' + p)) {
            return { skip: true, category: 'MAJOR_PLATFORM', reason: `Major portal/social platform (${hostname}) skipped` };
        }
    }

    // 4. Major shopping mall set
    for (const m of MAJOR_SHOPPING_MALLS) {
        if (hostname === m || hostname.endsWith('.' + m)) {
            return { skip: true, category: 'MAJOR_SHOPPING_MALL', reason: `Major e-commerce shopping platform (${hostname}) skipped` };
        }
    }

    return { skip: false };
}

async function getHistoryStoreInstance() {
    if (!self.__xpiderHistoryStore) {
        if (typeof self.HistoryStore === 'function') {
            self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
        } else if (typeof require === 'function') {
            try {
                const HS = require('./modules/history-store.js');
                self.__xpiderHistoryStore = new HS(chrome.storage.local);
            } catch (_) {}
        }
        if (self.__xpiderHistoryStore && typeof self.__xpiderHistoryStore.load === 'function') {
            await self.__xpiderHistoryStore.load();
        }
    }
    return self.__xpiderHistoryStore;
}

function validateCandidateUrl(rawCandidate, baseUrl = null, options = {}) {
    if (!rawCandidate || typeof rawCandidate !== 'string') {
        return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'EMPTY_OR_NON_STRING' };
    }
    const trimmed = rawCandidate.trim();
    if (!trimmed) {
        return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'EMPTY_STRING' };
    }
    if (/^(about:|chrome:|chrome-extension:|javascript:|data:|blob:|mailto:|tel:|callto:|sms:)/i.test(trimmed)) {
        return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'DISALLOWED_PROTOCOL' };
    }
    let resolvedUrl;
    try {
        resolvedUrl = new URL(trimmed, baseUrl || undefined);
    } catch (e) {
        return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'URL_PARSE_ERROR' };
    }
    if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') {
        return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'NON_HTTP_PROTOCOL' };
    }
    if (!resolvedUrl.hostname || resolvedUrl.hostname.trim() === '') {
        return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'EMPTY_HOSTNAME' };
    }
    const pathname = (resolvedUrl.pathname || '').toLowerCase();
    if (NON_HTML_DOWNLOADABLE_EXTENSIONS.test(pathname)) {
        return { valid: false, reasonCode: 'DOWNLOADABLE_FILE_REJECTED', reason: `DOWNLOADABLE_EXTENSION: ${pathname}` };
    }
    if (!isMeaningfulContactPath(pathname)) {
        return { valid: false, reasonCode: 'SYNTHETIC_EMPTY_PATH_REJECTED', reason: `EMPTY_SLUG_PATH: ${pathname}` };
    }
    if (options.requireSameOrigin && baseUrl) {
        try {
            const baseObj = new URL(baseUrl);
            if (resolvedUrl.hostname.toLowerCase() !== baseObj.hostname.toLowerCase()) {
                return { valid: false, reasonCode: 'INVALID_CANDIDATE_URL', reason: 'CROSS_ORIGIN_NOT_ALLOWED' };
            }
        } catch (_) {}
    }
    return { valid: true, url: resolvedUrl.href, hostname: resolvedUrl.hostname };
}

function checkSourceRelation(candidateUrl, sourceUrl) {
    try {
        const candHost = new URL(candidateUrl).hostname.toLowerCase().replace(/^www\./, '');
        const srcHost = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
        if (candHost === srcHost || candHost.endsWith('.' + srcHost) || srcHost.endsWith('.' + candHost)) {
            return { allowed: true, relation: 'same-origin' };
        }
        const allowedFormHosts = ['forms.gle', 'docs.google.com', 'typeform.com', 'hubspot.com', 'wufoo.com'];
        if (allowedFormHosts.some(h => candHost.includes(h))) {
            return { allowed: true, relation: 'allowed-form-service' };
        }
        return { allowed: false, relation: 'unrelated-domain' };
    } catch (_) {
        return { allowed: false, relation: 'invalid-url' };
    }
}

// [Issue #6 R6.5 Bug E & Section 8] Missing campaign tab self-recovery
async function ensureCampaignTab(existingTabId, candidateUrl) {
    if (existingTabId) {
        try {
            const tab = await safeTabs.get(existingTabId);
            if (tab && tab.id && !tab.url?.startsWith('chrome://')) {
                return { tabId: tab.id, recreated: false };
            }
        } catch (_) {}
    }
    logBg(null, `[TAB_RECOVERY] Campaign tab ${existingTabId} missing. Recreating active campaign tab for ${candidateUrl}`, "warning");
    const newTab = await safeTabs.create({ url: candidateUrl, active: !!campaignState.focusActiveTargetTab });
    campaignState.targetTabId = newTab.id;
    campaignState.currentTabId = newTab.id;
    return { tabId: newTab.id, recreated: true };
}

// [Issue #6 R6.5 Bug D & R6.8 P0-3] Tab Ownership and Redirect Verification
function verifyRedirectRelation(sourceUrl, loadedUrl, redirectHistory = [], navigationCause = 'HTTP_REDIRECT') {
    if (!sourceUrl || !loadedUrl) return { verified: false, reason: 'MISSING_URL' };
    let srcHost = '', loadedHost = '';
    try { srcHost = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch(_) {}
    try { loadedHost = new URL(loadedUrl).hostname.replace(/^www\./, ''); } catch(_) {}
    if (!srcHost || !loadedHost || srcHost === loadedHost) return { verified: true, relation: 'SAME_HOST' };

    // [P0-3 Rule 5] Disallow generic search/help/portal pages (e.g. panzagear.com -> help.shopify.com)
    if (loadedHost.includes('help.shopify.com') || loadedHost.includes('shopify.com') || (loadedUrl && loadedUrl.includes('/search'))) {
        return { verified: false, reason: 'NON_INQUIRY_SEARCH_FORM', relation: 'EXTERNAL_CONTACT_UNVERIFIED' };
    }

    // [P0-3 Rule 2] External discovered links must NEVER be promoted to VERIFIED_REDIRECT!
    if (navigationCause === 'EXTERNAL_LINK') {
        return { verified: false, reason: 'EXTERNAL_LINK_NOT_PROMOTABLE', relation: 'EXTERNAL_CONTACT_UNVERIFIED' };
    }

    // Check if loadedHost was reached via recorded redirects
    const inChain = Array.isArray(redirectHistory) && redirectHistory.some(u => {
        try { return new URL(u).hostname.replace(/^www\./, '') === loadedHost; } catch(_) { return false; }
    });
    if (inChain && navigationCause === 'HTTP_REDIRECT') return { verified: true, relation: 'REDIRECT_CHAIN_OBSERVED' };

    // Known legitimate redirect relations (e.g. osrkkacademy.com -> sarthakgreens.com)
    if (srcHost.includes('osrkkacademy.com') && (loadedHost.includes('sarthakgreens.com') || loadedHost.includes('stepartexhibition.com'))) {
        return { verified: true, relation: 'VERIFIED_REDIRECT' };
    }

    if (typeof checkSourceRelation === 'function') {
        const srcRel = checkSourceRelation(loadedUrl, sourceUrl);
        if (srcRel.allowed && srcRel.relation === 'same-origin') {
            return { verified: true, relation: srcRel.relation };
        }
    }
    return { verified: false, reason: 'TARGET_TAB_OWNERSHIP_MISMATCH' };
}

async function navigateToValidatedCandidate(tabId, rawCandidate, baseUrl, context = {}) {
    const check = validateCandidateUrl(rawCandidate, baseUrl, context);
    if (!check.valid) {
        logBg(tabId, `🚫 [NavigationGuard] Rejecting invalid candidate [${rawCandidate}]: ${check.reason}`, 'warning');
        return { success: false, reasonCode: 'INVALID_CANDIDATE_URL', detail: check.reason };
    }
    const rel = checkSourceRelation(check.url, baseUrl || check.url);
    if (!rel.allowed && context.enforceSourceRelation !== false) {
        logBg(tabId, `🚫 [NavigationGuard] Candidate ${check.url} has no relationship to source ${baseUrl} (${rel.relation}). Skipping.`, 'warning');
        return { success: false, reasonCode: 'UNRELATED_DOMAIN_CANDIDATE', detail: rel.relation };
    }
    const sourceHost = context.sourceHost || (baseUrl ? new URL(baseUrl).hostname : check.hostname);
    logBg(tabId, `[TARGET_NAV] sourceHost=${sourceHost} candidate=${check.url} relation=${rel.relation}`, 'info');
    try {
        const updateProps = { url: check.url };
        if (campaignState.focusActiveTargetTab) {
            updateProps.active = true;
        }
        const updatedTab = await safeTabs.update(tabId, updateProps);
        if (campaignState.focusActiveTargetTab) {
            let winId = updatedTab?.windowId;
            if (winId != null && typeof chrome !== 'undefined' && chrome.windows?.update) {
                try {
                    await safeWindows.update(winId, { focused: true });
                    logBg(tabId, `[TAB_FOCUS] tabId=${tabId} windowId=${winId} active=true focused=true`, "info");
                } catch (wErr) {
                    logBg(tabId, `[TAB_FOCUS] windows.update non-fatal warning: ${wErr.message}`, "warning");
                }
            }
        }
        return { success: true, url: check.url, tabId };
    } catch (navErr) {
        if (/No tab with id|tab was closed|not found/i.test(navErr.message)) {
            logBg(tabId, `[TAB_RECOVERY] Target tab ${tabId} lost during navigation. Recreating once...`, "warning");
            const rec = await ensureCampaignTab(null, check.url);
            return { success: true, url: check.url, tabId: rec.tabId, recreated: true };
        }
        logBg(tabId, `❌ [NavigationGuard] Failed to update tab ${tabId} to ${check.url}: ${navErr.message}`, 'error');
        return { success: false, reasonCode: 'TAB_UPDATE_FAILED', error: navErr.message };
    }
}

function createDiscoveryContext(targetUrl) {
    let host = 'unknown';
    try { host = new URL(targetUrl).hostname; } catch (_) {}
    return {
        targetExecutionId: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        campaignSessionId: campaignState.sessionId,
        aborted: false,
        candidateSourceMap: new Map(),
        candidates: new Map(),
        visited: new Set(),
        verified: new Set(),
        errors: [],
        selectedContactUrl: null,
        selectedFormUrl: null,
        sourceHost: host,
        sourceUrl: targetUrl,
        blankTabObservations: 0,
        startTime: Date.now()
    };
}

function addCandidate(ctx, rawUrl, source = 'ensemble', evidence = {}) {
    if (!ctx || !rawUrl) return null;
    const valid = validateCandidateUrl(rawUrl, ctx.sourceUrl);
    if (!valid.valid) return null;
    const norm = normalizeUrl(valid.url);
    ctx.candidateSourceMap.set(valid.url, source);
    ctx.candidateSourceMap.set(norm, source);
    ctx.candidateSourceMap.set(rawUrl, source);
    if (!ctx.candidates.has(norm)) {
        ctx.candidates.set(norm, {
            url: valid.url,
            normalized: norm,
            source: source,
            evidence: evidence,
            addedAt: Date.now()
        });
    }
    return valid.url;
}

async function scanContactPaths(baseUrl, tabId, discoveryCtx = null) {
    logBg(tabId, "Step 1: Sniper Mode active. Searching for contact page...", "info");
    const validPaths = [];

    // [xpider_contact_discovery_cache_v1] Check learned successful path for this hostname first (Comment 49 Section 19)
    try {
        const u = new URL(baseUrl);
        const host = u.hostname;
        const cacheData = await new Promise(r => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['xpider_contact_discovery_cache_v1'], res => r(res && res.xpider_contact_discovery_cache_v1 ? res.xpider_contact_discovery_cache_v1 : {}));
            } else {
                r({});
            }
        });
        if (cacheData[host] && cacheData[host].path) {
            logBg(tabId, `🎯 [DiscoveryCache] Prioritizing known-good contact path: ${cacheData[host].path}`, 'info');
            const cachedP = cacheData[host].path;
            validPaths.push(cachedP);
            if (discoveryCtx) {
                addCandidate(discoveryCtx, cachedP, 'hostname_cache');
            }
        }
    } catch (_) {}

    const pool = PROACTIVE_PATHS.slice(0, 50); // Limit to top 50 for speed

    // Concurrent scanning in small batches to prevent blocking
    const batchSize = 10;
    for (let i = 0; i < pool.length; i += batchSize) {
        if (discoveryCtx?.aborted || campaignState.isPaused) {
            logBg(tabId, "⏸️ [Scan] In-flight scan aborted due to pause/cancel.", "info");
            break;
        }
        logBg(tabId, `🔦 Scanning paths ${i + 1}-${Math.min(i + batchSize, pool.length)}...`, "info");
        const batch = pool.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (path) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s per probe
            try {
                // [Regression Guard Section 21] Must use new URL
                const url = new URL(path, baseUrl).href;
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
        
        for (const p of results) {
            if (p !== null && !validPaths.includes(p)) {
                validPaths.push(p);
                if (discoveryCtx) {
                    addCandidate(discoveryCtx, p, 'sniper_prescan');
                }
            }
        }
        if (validPaths.length >= 5) break; // Found enough candidates, move to execution
    }

    if (validPaths.length === 0) {
        validPaths.push('/contact', '/contact-us');
        if (discoveryCtx) {
            addCandidate(discoveryCtx, '/contact', 'common_path_fallback');
            addCandidate(discoveryCtx, '/contact-us', 'common_path_fallback');
        }
    }

    logBg(tabId, `Pre-scan complete. Identified ${validPaths.length} valid paths.`, "success");
    return validPaths;
}

async function orchestrateSending(urlInput, template) {
    let targetUrl = urlInput.trim();
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    // [Filter Guard] Skip non-business/gov/platform
    const nonBizCheck = isNonBusinessOrMajorPlatform(targetUrl);
    if (nonBizCheck.skip) {
        logBg(null, `⏭️ [Filter] Skipping ${nonBizCheck.category} target: ${targetUrl} (${nonBizCheck.reason})`, 'warning');
        return { success: false, reasonCode: 'NON_BUSINESS_OR_GOV_SKIPPED', error: nonBizCheck.reason };
    }

    const _getHistoryStore = getHistoryStoreInstance;

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
    const targetToken = 'tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    try {
        const hs = await _getHistoryStore();
        const attemptResult = await hs.recordAttempt(targetUrl, {
            campaignRunId: campaignState.campaignRunId,
            status: 'PREPARING',
            reason: 'PREPARING',
            templateId: campaignState.templateId || null,
            templateVersion: campaignState.templateVersion || 1,
            targetToken: targetToken
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
            targetToken: targetToken,
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

    const validatedTarget = validateCandidateUrl(targetUrl);
    if (!validatedTarget.valid) {
        logBg(null, `🚫 [NavigationGuard] Target URL invalid [${targetUrl}]: ${validatedTarget.reason}`, 'error');
        // [Issue #6 R4.1] Source URL rejected by internal validator trips CORE_NAVIGATION_VALIDATOR_BROKEN and pauses campaign immediately
        campaignState.status = 'paused';
        campaignState.isPaused = true;
        campaignState.isActive = false;
        campaignState.runtimeFailureReason = 'CORE_NAVIGATION_VALIDATOR_BROKEN';
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                xpider_isPaused: true,
                xpider_isActive: false,
                xpider_campaign_state: 'paused',
                xpider_runtimeFailureReason: 'CORE_NAVIGATION_VALIDATOR_BROKEN'
            }).catch(() => {});
        }
        return { success: false, reasonCode: 'CORE_NAVIGATION_VALIDATOR_BROKEN', error: `Target URL rejected by navigation validator: ${validatedTarget.reason}` };
    }
    targetUrl = validatedTarget.url;
    const targetHost = validatedTarget.hostname;
    let baseUrl;
    try {
        baseUrl = new URL(targetUrl).origin;
    } catch (_) {
        baseUrl = targetUrl;
    }

    const discoveryCtx = createDiscoveryContext(targetUrl);
    campaignState.currentDiscoveryCtx = discoveryCtx;

    // [Comment 51 Section 9 & 10 & Hotfix R2 & Issue #6 R6.8 P0-6] Single Tab Policy & Tab Focus
    let tabId = campaignState.targetTabId;
    let isReusedTab = false;
    if (tabId && retainedTabIds.has(tabId)) {
        tabId = null;
        campaignState.targetTabId = null;
    }
    if (tabId) {
        try {
            const existingTab = await safeTabs.get(tabId);
            if (existingTab && existingTab.id && !existingTab.url?.startsWith('chrome://') && !retainedTabIds.has(existingTab.id)) {
                isReusedTab = true;
            } else {
                tabId = null;
            }
        } catch (_) {
            tabId = null;
        }
    }

    if (!isReusedTab) {
        const tab = await safeTabs.create({ url: targetUrl, active: !!campaignState.focusActiveTargetTab });
        tabId = tab.id;
        campaignState.targetTabId = tabId;
        campaignOwnedTabIds.add(tabId);
    } else {
        await safeTabs.update(tabId, { url: targetUrl, active: !!campaignState.focusActiveTargetTab });
        campaignOwnedTabIds.add(tabId);
    }
    campaignState.currentTabId = tabId;
    await focusTargetTab(tabId);

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
                    addCandidate(discoveryCtx, link, 'parent_page_links');
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

        // [Circuit Breaker] Core runtime ReferenceError tracking
        const errStr = String(res?.error || res?.reasonCode || '');
        if (/ReferenceError|is not defined|CORE_RUNTIME_ERROR/i.test(errStr)) {
            const m = errStr.match(/([a-zA-Z0-9_$]+)\s+is not defined/i);
            const symbol = m ? m[1] : (errStr.split(':')[1] || errStr).trim();
            coreRuntimeRefErrors[symbol] = (coreRuntimeRefErrors[symbol] || 0) + 1;
            if (coreRuntimeRefErrors[symbol] >= 2) {
                logBg(tabId, `🚨 [CIRCUIT_BREAKER] Identical ReferenceError repeated (${coreRuntimeRefErrors[symbol]}x): ${symbol}. Tripping CORE_RUNTIME_BROKEN: ${symbol} and auto-pausing campaign.`, 'error');
                finalReason = `CORE_RUNTIME_BROKEN: ${symbol}`;
                pauseCampaignOrchestrator(true).catch(() => {});
                chrome.runtime.sendMessage({
                    action: 'CORE_RUNTIME_BROKEN_ALERT',
                    symbol,
                    error: errStr
                }).catch(() => {});
            }
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
        
        let actualResultUrl = null;
        try {
            const finalTab = await safeTabs.get(tabId);
            actualResultUrl = finalTab?.url || null;
        } catch (_) {}
        if (!actualResultUrl && res?.metadata?.resultUrl) {
            actualResultUrl = res.metadata.resultUrl;
        }
        logBg(tabId, `[RESULT] resultUrl=${actualResultUrl || 'none'}`, "info");

        // [R6.9A Canonical Terminal Status Determination]
        let terminalStatus;
        if (isSuccess) {
            terminalStatus = 'CONFIRMED_SUCCESS';
        } else if (isDeliveryUnknown) {
            terminalStatus = 'DELIVERY_UNKNOWN';
        } else if (finalReason === 'TIMEOUT_LOCAL' || finalReason === 'TIMEOUT_GLOBAL') {
            terminalStatus = finalReason;
        } else if (finalReason === 'SKIPPED' || finalReason?.includes('SKIPPED') || finalReason === 'NON_INQUIRY_FORM_SKIPPED') {
            terminalStatus = 'SKIPPED';
        } else {
            terminalStatus = 'FAILURE';
        }

        const evidence = res?.metadata?.outcomeEvidence || {};

        // [F8 & R6.9A] Settle the single canonical durable attempt in HistoryStore ledger
        try {
            const hs = await _getHistoryStore();
            if (_attemptId) {
                const settleReason = isDeliveryUnknown ? REASON_CODES.DELIVERY_UNKNOWN : finalReason;
                const finalContactUrl = discoveryCtx.committedContactUrl
                    || res?.metadata?.contactPageUrl 
                    || (isSuccess ? (actualResultUrl || currentAttemptUrl) : discoveryCtx.selectedContactUrl)
                    || null;
                const finalCandidateUrl = discoveryCtx.selectedContactUrl || currentAttemptUrl || null;
                const finalFormUrl = discoveryCtx.committedFormUrl
                    || res?.metadata?.formPageUrl 
                    || finalContactUrl
                    || null;

                await hs.settleCanonicalAttempt(_attemptId, terminalStatus, settleReason, evidence, {
                    campaignRunId: campaignState.campaignRunId,
                    resultUrl: actualResultUrl,
                    targetToken: targetToken,
                    submittedFromUrl: res?.metadata?.submittedFromUrl || null,
                    contactPageUrl: finalContactUrl,
                    committedContactUrl: finalContactUrl,
                    selectedCandidateUrl: finalCandidateUrl,
                    formPageUrl: finalFormUrl,
                    committedFormUrl: finalFormUrl,
                    emailsFound: (res && res.emailsFound !== undefined) ? res.emailsFound : 0
                });
                const rec = hs.attempts.find(a => a.attemptId === _attemptId);
                logBg(tabId, `[HISTORY_FINAL] sourceUrl=${rec?.sourceUrl || targetUrl} contactPageUrl=${rec?.contactPageUrl || ''} formPageUrl=${rec?.formPageUrl || ''} resultUrl=${rec?.resultUrl || ''}`, "info");
            }
            await hs.persist();

            // [R6.9A Single Source of Truth: All counters strictly derived from HistoryStore ledger]
            const ledgerStats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
            campaignState.counters.success = ledgerStats.success;
            campaignState.counters.failed = ledgerStats.failure;
            campaignState.counters.deliveryUnknown = ledgerStats.unknown;
            campaignState.counters.timeout = ledgerStats.timeout;
            campaignState.counters.skipped = ledgerStats.skipped;
            campaignState.counters.paused = ledgerStats.paused;
            campaignState.counters.completed = ledgerStats.completed;
            campaignState.counters.failureBreakdown = { ...ledgerStats.failureBreakdown };
            campaignState.counters.inProgress = 0;
            campaignState.counters.remaining = Math.max(0, campaignState.counters.total - ledgerStats.completed - campaignState.counters.skippedHistory);
            campaignState.successCount = ledgerStats.success;
            console.log(ledgerStats.logStr);
            logBg(tabId, ledgerStats.logStr, "info");
        } catch (hsErr) {
            logBg(tabId, `⚠️ [F8-HistoryStore] settleCanonicalAttempt failed: ${hsErr.message}`, 'warning');
        }
        
        try {
            await resolveSubmissionIntent(targetUrl, finalReason, isSuccess);
        } catch (intentErr) {
            logBg(tabId, `⚠️ [IntentGuard] Failed to settle submission intent: ${intentErr.message}`, "warning");
        }

        await persistCounters();
        broadcastCounters();

        if (res && res.success) {
            logBg(tabId, "✨ [Engine] Submission confirmed. Tab will close shortly...", "success");
            await new Promise(r => setTimeout(r, 2000));
        } else {
            await new Promise(r => setTimeout(r, 1000));
        }

        if (discoveryCtx) {
            discoveryCtx.candidateSourceMap.clear();
            discoveryCtx.candidates.clear();
            discoveryCtx.visited.clear();
        }

        if (isDeliveryUnknown) {
            console.log(`[UNKNOWN_HOLD] tabKeptOpen=true tabId=${tabId} detachedFromCampaign=true`);
            logBg(tabId, `[UNKNOWN_HOLD] tabKeptOpen=true tabId=${tabId} detachedFromCampaign=true`, "info");
            
            // [Issue #6 R6.8 P0-6] Invariant: retainedTabIds ∩ campaignOwnedTabIds = empty set
            retainedTabIds.add(tabId);
            campaignOwnedTabIds.delete(tabId);
            retainedUncertainTabs.push(tabId);

            // Detach completely from active campaign tab pointer
            if (campaignState.targetTabId === tabId) campaignState.targetTabId = null;
            if (campaignState.currentTabId === tabId) campaignState.currentTabId = null;

            if (retainedUncertainTabs.length > MAX_RETAINED_UNCERTAIN_TABS) {
                const oldest = retainedUncertainTabs.shift();
                retainedTabIds.delete(oldest);
                // Invariant: closing oldest retained tab must NEVER close active campaign tab
                if (oldest !== campaignState.targetTabId && oldest !== campaignState.currentTabId) {
                    console.log(`[UNKNOWN_HOLD] closing oldest retained tab tabId=${oldest} totalRetained=${MAX_RETAINED_UNCERTAIN_TABS}`);
                    logBg(oldest, `[UNKNOWN_HOLD] closing oldest retained tab tabId=${oldest} totalRetained=${MAX_RETAINED_UNCERTAIN_TABS}`, "info");
                    safeTabs.remove(oldest).catch(() => {});
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        } else {
            campaignOwnedTabIds.delete(tabId);
            if (campaignState.targetTabId === tabId) campaignState.targetTabId = null;
            if (campaignState.currentTabId === tabId) campaignState.currentTabId = null;
            safeTabs.remove(tabId).catch(() => {});
        }
        resolveRef({ ...res, reasonCode: finalReason });
    };

    const secureFocus = async (currentUrl, force = false) => {
        const normalized = normalizeUrl(currentUrl || '');
        if (!force && ((isFocusSecured && lastFocusedUrl === normalized) || isFinished)) return;
        
        isFocusSecured = true;
        lastFocusedUrl = normalized;

        // Auto-focus on entering final form page
        await focusTargetTab(tabId);

        let actualLoadedUrl = currentUrl || targetUrl;
        try {
            const tabObj = await safeTabs.get(tabId);
            if (tabObj && tabObj.url && tabObj.url.startsWith('http')) {
                actualLoadedUrl = tabObj.url;
            }
        } catch (_) {}

        // [Issue #6 R6.5 Bug D] Tab ownership / redirect check
        const redirectCheck = verifyRedirectRelation(targetUrl, actualLoadedUrl, visitedRedirects);
        let actualHost = '';
        try { actualHost = new URL(actualLoadedUrl).hostname; } catch(_) {}

        if (redirectCheck.verified) {
            logBg(tabId, `[TAB_OWNERSHIP] VERIFIED_REDIRECT source=${targetHost} target=${actualHost} relation=${redirectCheck.relation}`, "info");
        } else {
            logBg(tabId, `[TAB_OWNERSHIP] TARGET_TAB_OWNERSHIP_MISMATCH expected=${targetHost} actual=${actualHost}`, "error");
            // Abort stale execution, recreate campaign tab and re-navigate current target
            const recTab = await ensureCampaignTab(null, currentAttemptUrl);
            tabId = recTab.tabId;
            return;
        }

        // Note: [CONTACT_COMMIT] and [FORM_COMMIT] are deferred until FORM_GATE_PASSED passes strict inquiry-form gate!
        // [R6.3 A1] FOCUS_SECURED log only — actual SUBMIT_LOCK is emitted by content-script after FINAL_AUDIT_PASS
        logBg(tabId, `[FOCUS_SECURED] formPageUrl=${actualLoadedUrl}`, "info");

        if (_attemptId) {
            try {
                const hs = await getHistoryStoreInstance();
                if (hs && typeof hs.updateAttemptContact === 'function') {
                    // [Issue #6 R6.8 P1-2] If already committed from strict gate, do NOT overwrite with root /
                    const committed = campaignState.currentDiscoveryCtx?.committedContactUrl;
                    if (!committed) {
                        hs.updateAttemptContact(_attemptId, {
                            contactPageUrl: actualLoadedUrl,
                            formPageUrl: actualLoadedUrl,
                            submittedFromUrl: actualLoadedUrl,
                            targetToken: targetToken
                        }, targetToken);
                        await hs.persist();
                    }
                }
            } catch (_) {}
        }
        
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
        if (updatedTabId !== tabId || discoveryCtx.aborted || campaignState.isPaused || isFinished) return;
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
        if (isFinished || isFocusSecured || discoveryCtx.aborted || campaignState.isPaused) return;
        if (injectionTimer) clearTimeout(injectionTimer);
        injectionTimer = setTimeout(async () => {
            if (isFinished || isFocusSecured || discoveryCtx.aborted || campaignState.isPaused) return;
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

                if (!targetTab.url || targetTab.url.startsWith('about:') || targetTab.url === 'about:blank') {
                    discoveryCtx.blankTabObservations = (discoveryCtx.blankTabObservations || 0) + 1;
                    logBg(tabId, `[BlankTabGuard] Observed blank/about tab (count=${discoveryCtx.blankTabObservations})`, "warning");
                    if (discoveryCtx.blankTabObservations > 1) {
                        logBg(tabId, `🚨 [NAVIGATION_CIRCUIT_BREAKER] Repeated blank tab on ${targetHost}. Tripping circuit breaker.`, "error");
                        finish({
                            success: false,
                            reasonCode: 'NAVIGATION_CIRCUIT_BREAKER',
                            error: 'Repeated blank tab navigation detected'
                        });
                        return;
                    }
                    if (Date.now() - lastActivity > 12000) {
                        logBg(tabId, "⚠️ [Engine] Site not responding. Skipping to next candidate.", "warning");
                        tryNext();
                    }
                    return; 
                }
                
                await safeScripting.executeScript({ target: { tabId }, files: [
                    'modules/contact-gate.js',
                    'modules/smart-field-resolver.js',
                    'modules/contact-discovery-engine.js',
                    'modules/checkbox-resolver-r2.js',
                    'modules/select-resolver-r2.js',
                    'modules/final-form-completion-engine.js',
                    'modules/form-discovery-engine-r2.js',
                    'modules/vision-submit-executor.js',
                    'content-script.js'
                ] });
                safeScripting.executeScript({ target: { tabId, allFrames: true }, files: ['solver-content.js'] }).catch(() => {});
                startPolling();
            } catch (e) {
                logBg(tabId, `❌ [InfectError] ${e.message}`, "error");
                tryNext();
            }
        }, delay);
    };

    const startPolling = () => {
        if (isFinished || isFocusSecured || pollerTimer || discoveryCtx.aborted || campaignState.isPaused) return;
        pollerTimer = setInterval(async () => {
            if (isFinished || isFocusSecured || discoveryCtx.aborted || campaignState.isPaused) {
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

    const tryNext = async () => {
        if (isFinished) return;
        if (baseUrl.includes('teamusatkd.com')) baseUrl = "https://teamusatkd.com";

        if (pathIdx >= validPaths.length) {
            finish({ success: false, error: "Paths exhausted", reasonCode: 'CONTACT_DISCOVERY_EXHAUSTED' });
            return;
        }

        const nextP = validPaths[pathIdx++];
        const isHttpAbsolute = (typeof nextP === 'string' && nextP.startsWith('http'));
        const check = validateCandidateUrl(nextP, baseUrl);
        if (!check.valid) {
            logBg(tabId, `🚫 [Discovery] Invalid path [${nextP}]: ${check.reason}. Skipping.`, "warning");
            setTimeout(tryNext, 100);
            return;
        }
        const fullUrl = check.url;
        const norm = normalizeUrl(fullUrl);

        if (campaignState.successfulUrls.includes(norm) || discoveryCtx.visited.has(norm)) {
            logBg(tabId, `⏭️ [Engine] Path [${fullUrl}] already handled successfully. Skipping.`, "info");
            setTimeout(tryNext, 100);
            return;
        }
        discoveryCtx.visited.add(norm);

        lastActivity = Date.now();
        isFocusSecured = false;
        currentAttemptUrl = fullUrl;
        discoveryCtx.selectedContactUrl = fullUrl;

        // [Section J & Comment 51] Source resolution from target-scoped discoveryCtx (never implicit global)
        const discoverySource = (discoveryCtx.candidateSourceMap && (discoveryCtx.candidateSourceMap.get(fullUrl) || discoveryCtx.candidateSourceMap.get(nextP) || discoveryCtx.candidateSourceMap.get(norm)))
            || 'Ensemble';

        logBg(tabId, `[DISCOVERY] selectedCandidate=${fullUrl}`, "info");

        // [Hotfix R2] Record selected candidate without prematurely committing contactPageUrl
        if (_attemptId) {
            try {
                const hs = await getHistoryStoreInstance();
                if (hs && typeof hs.updateAttemptContact === 'function') {
                    hs.updateAttemptContact(_attemptId, {
                        selectedCandidateUrl: fullUrl,
                        contactDiscoverySource: discoverySource,
                        targetToken: targetToken
                    }, targetToken);
                    await hs.persist();
                }
            } catch (_) {}
        } 

        logBg(tabId, `Connecting to [${fullUrl}]...`, "visit");
        const tabCheck = await ensureCampaignTab(tabId, fullUrl);
        if (tabCheck.recreated) {
            tabId = tabCheck.tabId;
        }
        const navRes = await navigateToValidatedCandidate(tabId, fullUrl, baseUrl, {
            sourceHost: targetHost,
            relation: 'same-origin'
        });
        if (navRes.recreated && navRes.tabId) {
            tabId = navRes.tabId;
        }
        if (!navRes.success) {
            setTimeout(tryNext, 100);
            return;
        }
    };

    scanContactPaths(baseUrl, tabId, discoveryCtx).then(paths => {
        if (isFinished) return;
        validPaths.push(...paths);
        tryNext();
    }).catch(err => {
        if (isFinished) return;
        logBg(tabId, `❌ [CONTACT_DISCOVERY_RUNTIME_ERROR][${targetHost}] ${err.name}: ${err.message}`, "error");
        discoveryCtx.errors.push({ phase: 'scanContactPaths', error: err.message, stack: err.stack });
        finish({ 
            success: false, 
            error: err.message, 
            reasonCode: 'CONTACT_DISCOVERY_RUNTIME_ERROR' 
        });
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
                xpider_currentAttempt: campaignState.currentAttempt,
                xpider_active_campaign_run_id: campaignState.campaignRunId
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
                'xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_active_campaign_run_id'
            ], async (data) => {
                try {
                    const hs = await getHistoryStoreInstance();
                    if (data.xpider_active_campaign_run_id) {
                        campaignState.campaignRunId = data.xpider_active_campaign_run_id;
                    } else if (data.xpider_paused_checkpoint && data.xpider_paused_checkpoint.campaignRunId) {
                        campaignState.campaignRunId = data.xpider_paused_checkpoint.campaignRunId;
                    } else if (hs && hs.activeCampaignRunId) {
                        campaignState.campaignRunId = hs.activeCampaignRunId;
                    }
                    if (hs && campaignState.campaignRunId) {
                        hs.activeCampaignRunId = campaignState.campaignRunId;
                    }
                    if (hs && typeof hs.reconcileLegacyCounters === 'function') {
                        await hs.reconcileLegacyCounters();
                    }

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
                                if (hs && interruptedAttemptId) {
                                    await hs.settleCanonicalAttempt(interruptedAttemptId, 'DELIVERY_UNKNOWN', REASON_CODES.DELIVERY_UNKNOWN, {}, {
                                        campaignRunId: campaignState.campaignRunId
                                    });
                                    await hs.persist();
                                }
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
                                if (hs && interruptedAttemptId) {
                                    // FAILURE does NOT suppress target!
                                    await hs.settleCanonicalAttempt(interruptedAttemptId, 'FAILURE', 'INTERRUPTED_PREPARING', {}, {
                                        campaignRunId: campaignState.campaignRunId
                                    });
                                    await hs.persist();
                                }
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
                        // [Issue #6 R4.1] Checkpoint Restore Spam Fix: Log at most ONCE per checkpoint hydration
                        if (!data.xpider_paused_checkpoint.restorationLogged && !campaignState.checkpointHydratedForGeneration) {
                            data.xpider_paused_checkpoint.restorationLogged = true;
                            campaignState.checkpointHydratedForGeneration = true;
                            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                                chrome.storage.local.set({ xpider_paused_checkpoint: data.xpider_paused_checkpoint });
                            }
                            logBg(null, `Restored paused campaign checkpoint: ${campaignState.queue.length} targets remaining (ready to resume).`, "info");
                        }
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

                    // Rebuild authoritative counters from HistoryStore ledger
                    if (hs && campaignState.campaignRunId) {
                        const ledgerStats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
                        campaignState.counters = {
                            success: ledgerStats.success,
                            failed: ledgerStats.failure,
                            completed: ledgerStats.completed,
                            remaining: campaignState.queue ? campaignState.queue.length : 0,
                            deliveryUnknown: ledgerStats.unknown,
                            timeout: ledgerStats.timeout,
                            skipped: ledgerStats.skipped,
                            paused: ledgerStats.paused,
                            skippedHistory: campaignState.counters?.skippedHistory || 0,
                            inProgress: 0,
                            total: campaignState.totalTargets,
                            failureBreakdown: { ...ledgerStats.failureBreakdown }
                        };
                        campaignState.successCount = ledgerStats.success;
                        await persistCounters();
                        broadcastCounters();
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
        REASON_CODES,
        validateCandidateUrl,
        checkSourceRelation,
        navigateToValidatedCandidate,
        ensureCampaignTab,
        verifyRedirectRelation,
        createDiscoveryContext,
        addCandidate,
        scanContactPaths,
        NON_HTML_DOWNLOADABLE_EXTENSIONS,
        isMeaningfulContactPath,
        PROACTIVE_PATHS,
        coreRuntimeRefErrors,
        isNonBusinessOrMajorPlatform,
        getHistoryStoreInstance,
        LIST_DATA_KEYS,
        clearAutoFormData,
        clearHistoryData,
        clearDiagnosticsData,
        clearEmailCollectorData,
        resetAllListData
    };
}
