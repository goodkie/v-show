/**
 * X PIDER Sender Pro - Logic v1.2.0 (Side Panel & Full Settings)
 * [v4.17.0] XPIDER DevLog Bridge + 개발자 스텔스 트리거 적용됨
 */

// ── XPIDER DEV LOG BRIDGE (Popup) ────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[AutoFormSender/Popup]';
  const _xDL = (lvl, msg) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl, source: _EXT_NAME,
        msg: String(msg).substring(0, 2048)
      }).catch(() => {});
    } catch(_) {}
  };
  ['log','warn','error','debug','info'].forEach(m => {
    const _o = console[m].bind(console);
    console[m] = (...a) => {
      _o(...a);
      const lvlMap = { log:'INFO', warn:'WARN', error:'ERROR', debug:'DEBUG', info:'INFO' };
      _xDL(lvlMap[m] || 'INFO', a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '));
    };
  });
})();

// ── 🕵️ 개발자 전용 시크릿 키 트리거 ──────────────────────────────────────
// Ctrl+Shift+D 를 2초 이내 2회 입력 시 DevConsole 오픈 (UI에 표시되지 않음)
(function() {
  let _devKeyCount = 0;
  let _devKeyTimer = null;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      _devKeyCount++;
      if (_devKeyTimer) clearTimeout(_devKeyTimer);
      if (_devKeyCount >= 2) {
        _devKeyCount = 0;
        // In Chrome extension runtime, direct operator to Chrome DevTools without dead IPC
        console.log('[DEV] DevConsole: To view extension console and network logs, open Chrome DevTools (right-click popup -> Inspect, or chrome://extensions -> Inspect service worker).');
      } else {
        _devKeyTimer = setTimeout(() => { _devKeyCount = 0; }, 2000);
      }
    }
  }, true);
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

// [v20.0] Explicit Transport Policy: chrome-extension (Service Worker Background Engine)
const RUNTIME_MODE = 'chrome-extension';

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
        'xpider_collected_emails'
    ]
};

let currentTpl = {};
let campaignQueue = [];
let campaignActive = false;
let campaignPaused = false;
let successCount = 0;
let totalTargets = 0;
let i18nData = null;
let lastLogMessage = "Ready...";
let remainingTargets = 0;

// ── [IPC DIAGNOSTIC TRACE & BUFFER SUBSYSTEM] ──────────────────────────────
const DIAG_LOG_CAPACITY = 500;
const diagnosticLogBuffer = [];
const diagnosticSessionId = 'diag_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

/**
 * Privacy-safe Redaction Engine
 * Automatically redacts:
 * - Email addresses
 * - Phone numbers
 * - Template message body, secrets, auth tokens, passwords, cookies
 * - Full target URL lists (hostnames or counts only)
 */
function redactSensitiveText(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') {
        try {
            str = JSON.stringify(str);
        } catch (_) {
            str = String(str);
        }
    }
    return str
        // Email addresses
        .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
        // Phone numbers (international, Korean, standard dash/space formats)
        .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[REDACTED_PHONE]')
        // API Keys, Bearer tokens, secrets, passwords
        .replace(/(?:key|token|secret|authorization|bearer|auth|password)[\s:="']+[a-zA-Z0-9_\-\.]{8,}/gi, (match) => {
            const prefix = match.split(/[\s:="']+/)[0];
            return `${prefix}: [REDACTED_SECRET]`;
        })
        // Cookie headers
        .replace(/Cookie:\s*[^;\r\n]+(?:;\s*[^;\r\n]+)*/gi, 'Cookie: [REDACTED_COOKIE]')
        // URLs with query params/paths that may leak customer data -> retain protocol + hostname only
        .replace(/https?:\/\/[^\s"'`<>]+(?:\/[^\s"'`<>]*)?/gi, (url) => {
            try {
                const u = new URL(url);
                return `${u.protocol}//${u.hostname}${u.pathname.length > 1 ? '/[PATH]' : ''}`;
            } catch (_) {
                return '[REDACTED_URL]';
            }
        });
}

function addDiagnosticLog(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const redacted = redactSensitiveText(message);
    const entry = `[${timestamp}][${level}] ${redacted}`;
    diagnosticLogBuffer.push(entry);
    if (diagnosticLogBuffer.length > DIAG_LOG_CAPACITY) {
        diagnosticLogBuffer.shift();
    }
    if (level === 'ERROR') {
        console.error(`[XPIDER_DIAG] ${redacted}`);
    } else if (level === 'WARN') {
        console.warn(`[XPIDER_DIAG] ${redacted}`);
    } else {
        console.log(`[XPIDER_DIAG] ${redacted}`);
    }
}

async function clearDiagnosticLog() {
    diagnosticLogBuffer.length = 0;
    const logContainer = document.getElementById('log-container');
    if (logContainer) logContainer.innerHTML = '';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'CLEAR_DIAGNOSTIC_LOGS' }, () => {});
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.diagnostics);
    }
    if (typeof addLog === 'function') {
        addLog("Diagnostic log cleared.", "info");
    }
}

function getDiagnosticBuffer() {
    return [...diagnosticLogBuffer];
}

function getDiagnosticReport() {
    const extVer = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) 
        ? chrome.runtime.getManifest()?.version 
        : '1.2.0';
    const runtimeId = (typeof chrome !== 'undefined' && chrome.runtime?.id) ? chrome.runtime.id : 'N/A';
    const docVis = (typeof document !== 'undefined' && document.visibilityState) ? document.visibilityState : 'unknown';
    const originPath = (typeof window !== 'undefined' && window.location) 
        ? `${window.location.origin}${window.location.pathname}` 
        : 'unknown';

    const header = [
        "=================================================================",
        "        XPIDER EXTENSION RUNTIME IPC DIAGNOSTIC REPORT          ",
        "=================================================================",
        `Session ID:         ${diagnosticSessionId}`,
        `Report Timestamp:   ${new Date().toISOString()}`,
        `Extension Version:  ${extVer}`,
        `Chrome Runtime ID:  ${runtimeId}`,
        `Document Origin:    ${originPath}`,
        `Visibility State:   ${docVis}`,
        `Campaign Active:    ${typeof campaignActive !== 'undefined' ? campaignActive : false}`,
        `Campaign Paused:    ${typeof campaignPaused !== 'undefined' ? campaignPaused : false}`,
        `Queue Count:        ${typeof campaignQueue !== 'undefined' && Array.isArray(campaignQueue) ? campaignQueue.length : 0}`,
        `Template ID:        ${currentTpl?.templateId || currentTpl?.id || 'none'}`,
        `Template Version:   ${currentTpl?.templateVersion || currentTpl?.version || 1}`,
        "Privacy Status:     AUTOMATICALLY REDACTED (Zero customer PII / Hostnames only)",
        "=================================================================",
        "DIAGNOSTIC TRACE LOG (Last 300-500 lines):",
        "-----------------------------------------------------------------"
    ];

    const lines = diagnosticLogBuffer.slice(-500);
    const body = lines.length > 0 ? lines.join('\n') : "  (No diagnostic entries recorded)";
    const footer = [
        "-----------------------------------------------------------------",
        "END OF XPIDER IPC DIAGNOSTIC REPORT",
        "================================================================="
    ];

    return `${header.join('\n')}\n${body}\n${footer.join('\n')}`;
}

async function copyDiagnosticReport() {
    const report = getDiagnosticReport();
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(report);
            if (typeof addLog === 'function') addLog("📋 Diagnostic report copied to clipboard!", "success");
            return true;
        } catch (e) {
            console.warn('[Diag] Clipboard API failed, falling back to execCommand:', e);
        }
    }
    if (typeof document !== 'undefined' && document.body) {
        try {
            const ta = document.createElement('textarea');
            ta.value = report;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof addLog === 'function') addLog("📋 Diagnostic report copied to clipboard!", "success");
            return true;
        } catch (err) {
            if (typeof addLog === 'function') addLog("❌ Failed to copy diagnostic report.", "error");
            return false;
        }
    }
    return false;
}

function downloadDiagnosticTxt() {
    const report = getDiagnosticReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `xpider_diagnostic_${timestamp}.txt`;
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
        try {
            const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (typeof addLog === 'function') addLog(`💾 Saved ${filename}`, "success");
            return true;
        } catch (e) {
            console.error('[Diag] Download failed:', e);
            if (typeof addLog === 'function') addLog(`❌ Failed to download report: ${e.message}`, "error");
            return false;
        }
    }
    return false;
}

function calculatePayloadBytes(args) {
    if (!args) return 0;
    try {
        const serialized = JSON.stringify(args);
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(serialized).length;
        }
        return serialized.length;
    } catch (_) {
        return 0;
    }
}

// [v19.0] XPIDER_INVOKE: Direct IPC bridge to main process with High-Detail Privacy-Safe Diagnostics
function xpiderInvoke(channel, args, options = {}) {
    return new Promise((resolve, reject) => {
        const requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
        const shortId = requestId.slice(-6);
        const startPerf = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const wallClockISO = new Date().toISOString();
        const callerStack = (new Error().stack) ? new Error().stack.split('\n')[2]?.trim() || 'N/A' : 'N/A';
        const docVis = (typeof document !== 'undefined' && document.visibilityState) ? document.visibilityState : 'unknown';
        const locHref = (typeof window !== 'undefined' && window.location) ? `${window.location.origin}${window.location.pathname}` : 'unknown';
        const rtId = (typeof chrome !== 'undefined' && chrome.runtime?.id) ? chrome.runtime.id : 'N/A';
        const mfVer = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) ? chrome.runtime.getManifest()?.version : '1.2.0';
        const queueCount = Array.isArray(args?.queue) ? args.queue.length : (typeof campaignQueue !== 'undefined' && Array.isArray(campaignQueue) ? campaignQueue.length : 0);
        const tplId = args?.templateId || currentTpl?.templateId || currentTpl?.id || 'N/A';
        const tplVer = args?.templateVersion || currentTpl?.templateVersion || currentTpl?.version || 1;
        const payloadBytes = calculatePayloadBytes(args);

        // A. IPC correlation trace log
        addDiagnosticLog(`[IPC][REQ ${shortId}] channel=${channel} queue=${queueCount} templateId=${tplId} v=${tplVer} payloadBytes=${payloadBytes} docVis=${docVis} origin=${locHref} rtId=${rtId} mfVer=${mfVer}`);

        // B. Bridge availability snapshot BEFORE send
        const postMessageAvail = (typeof window !== 'undefined' && typeof window.postMessage === 'function');
        const isTop = (typeof window !== 'undefined' && window === window.top);
        const hasEventListener = (typeof window !== 'undefined' && typeof window.addEventListener === 'function');
        const knownBridges = [];
        if (typeof window !== 'undefined') {
            if (window.xpiderBridge) knownBridges.push('window.xpiderBridge');
            if (window.electronAPI) knownBridges.push('window.electronAPI');
            if (window.nativeBridge) knownBridges.push('window.nativeBridge');
        }
        const extAvail = (typeof chrome !== 'undefined' && !!chrome.runtime?.id);

        if (knownBridges.length === 0) {
            addDiagnosticLog(`[IPC][BRIDGE] No native XPIDER response bridge detected before request`);
        } else {
            addDiagnosticLog(`[IPC][BRIDGE] Known bridge detected: ${knownBridges.join(', ')}`);
        }

        let bgPingAlive = null;
        let bgStateSummary = 'not_queried';
        if (extAvail && chrome.runtime?.sendMessage) {
            try {
                chrome.runtime.sendMessage({ action: 'PING' }, (resp) => {
                    bgPingAlive = !chrome.runtime.lastError && !!resp && (resp.success !== false);
                });
                chrome.runtime.sendMessage({ action: 'GET_STATE' }, (resp) => {
                    if (resp && resp.success) {
                        bgStateSummary = `isActive=${resp.isActive},hasActiveLock=${resp.hasActiveLock}`;
                    }
                });
            } catch (_) {
                bgPingAlive = false;
            }
        }

        // C. Capture window message traffic
        let windowMessagesObserved = 0;
        let matchingResponses = 0;
        let lastRelevantMessage = 'none';
        let responseSeen = false;
        let timeoutId = null;
        let checkpointTimers = [];

        const cleanup = () => {
            if (typeof window !== 'undefined' && window.removeEventListener) {
                window.removeEventListener('message', handler);
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            checkpointTimers.forEach(t => clearTimeout(t));
            checkpointTimers = [];
        };

        const handler = (e) => {
            windowMessagesObserved++;
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsedMs = Math.round(now - startPerf);
            const origin = e.origin || ((typeof window !== 'undefined' && e.source === window) ? 'window' : 'external');
            const d = e.data || {};
            const msgType = d.type || 'unknown';
            const msgChannel = d.channel || 'none';
            const msgId = d.id || 'none';
            const idMatch = (msgId === requestId);

            lastRelevantMessage = `type=${msgType} idMatch=${idMatch} elapsedMs=${elapsedMs}`;
            addDiagnosticLog(`[IPC][RX ${shortId}][+${elapsedMs}ms] type=${msgType} idMatch=${idMatch} origin=${origin}`);

            if (idMatch && msgType === 'XPIDER_RESPONSE') {
                responseSeen = true;
                matchingResponses++;
                addDiagnosticLog(`[IPC][SUCCESS ${shortId}][+${elapsedMs}ms] Matching XPIDER_RESPONSE accepted`);
                cleanup();
                if (d.error) {
                    reject(new Error(d.error));
                } else {
                    resolve(d.result);
                }
            }
        };

        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('message', handler);
            addDiagnosticLog(`[IPC][REQ ${shortId}] listener=registered`);
        }

        if (typeof window !== 'undefined' && window.postMessage) {
            window.postMessage({ type: 'XPIDER_INVOKE', channel, args, id: requestId }, '*');
            addDiagnosticLog(`[IPC][REQ ${shortId}] postMessage dispatched`);
        } else {
            addDiagnosticLog(`[IPC][REQ ${shortId}] window.postMessage unavailable`, "ERROR");
        }

        // Operator concise log
        if (typeof addLog === 'function') {
            addLog(`[IPC] Request ${shortId} sent: ${channel}`, "info");
            addLog(`[IPC] Waiting for native response...`, "info");
        }

        // D. Pending checkpoints
        const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
        const defaultCheckpoints = [1000, 5000, 10000, 20000, 29000];
        const checkpointDelays = Array.isArray(options.checkpoints) ? options.checkpoints : defaultCheckpoints;

        checkpointTimers = checkpointDelays.filter(d => d < timeoutMs).map(delayMs => {
            return setTimeout(() => {
                if (responseSeen) return;
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const elapsed = Math.round(now - startPerf);
                const bgAliveStr = bgPingAlive === null ? 'checking' : (bgPingAlive ? 'alive' : 'dead');
                addDiagnosticLog(`[IPC][WAIT ${shortId}][+${(elapsed / 1000).toFixed(1)}s] responseSeen=false windowMessages=${windowMessagesObserved} matching=${matchingResponses} bgAlive=${bgAliveStr} campaignActive=${typeof campaignActive !== 'undefined' ? campaignActive : false}`);
                if (delayMs >= 5000 && typeof addLog === 'function') {
                    addLog(`[IPC] +${Math.round(elapsed / 1000)}s no response yet (background alive: ${bgAliveStr})`, "debug");
                }
            }, delayMs);
        });

        // E. Timeout diagnostic dump
        timeoutId = setTimeout(() => {
            cleanup();
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsedMs = Math.round(now - startPerf);
            const bgAliveStr = bgPingAlive === null ? 'unknown' : (bgPingAlive ? 'alive' : 'dead');
            const curAttemptStatus = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? 'queried' : 'none';

            const timeoutDump = [
                "===== XPIDER IPC TIMEOUT DIAGNOSTIC =====",
                `requestId:              ${requestId}`,
                `channel:                ${channel}`,
                `elapsedMs:              ${elapsedMs}`,
                `extensionVersion:       ${mfVer}`,
                `queueCount:             ${queueCount}`,
                `templateId:             ${tplId}`,
                `templateVersion:        ${tplVer}`,
                `payloadBytes:           ${payloadBytes}`,
                `backgroundPing:         ${bgAliveStr}`,
                `backgroundState:        ${bgStateSummary}`,
                `windowMessagesObserved: ${windowMessagesObserved}`,
                `matchingResponses:      ${matchingResponses}`,
                `lastRelevantMessage:    ${lastRelevantMessage}`,
                `documentVisibility:     ${docVis}`,
                `campaignActive:         ${typeof campaignActive !== 'undefined' ? campaignActive : false}`,
                `currentAttemptStatus:   ${curAttemptStatus}`,
                `stack:                  ${callerStack}`,
                "========================================="
            ].join('\n');

            addDiagnosticLog(timeoutDump, "ERROR");
            if (typeof addLog === 'function') {
                addLog(`[IPC] TIMEOUT after ${elapsedMs} ms — use "Copy Diagnostic Report"`, "error");
            }
            reject(new Error(`IPC timeout: ${channel}`));
        }, timeoutMs);
    });
}

// [v1.1.1] Global error handler for debugging & diagnostic collection
window.onerror = function(msg, url, line, col, error) {
    const sanitizedMsg = redactSensitiveText(msg);
    addDiagnosticLog(`[GLOBAL_ERROR] ${sanitizedMsg} at ${url}:${line}:${col || 0} stack=${error?.stack ? redactSensitiveText(error.stack) : 'N/A'}`, "ERROR");
    console.error(`[Popup Error] ${msg} at ${url}:${line}`);
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        const div = document.createElement('div');
        div.className = 'log-entry error';
        div.textContent = `[System Error] ${sanitizedMsg}`;
        logContainer.appendChild(div);
    }
    return false;
};

if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('unhandledrejection', function(event) {
        const reason = event.reason ? (event.reason.message || event.reason.stack || String(event.reason)) : 'unknown';
        addDiagnosticLog(`[UNHANDLED_REJECTION] ${redactSensitiveText(reason)}`, "ERROR");
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // ── [VITAL] Step 0: Register messaging listener IMMEDIATELY and SYNCHRONOUSLY
    // Ensures that we never miss SENDER_LOG or UPDATE_STATS events, even if translations or settings load slowly.
    
    // 1. Direct Chrome Runtime message listener (Custom bridge fallback)
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request) return;
            if (request.action === 'SENDER_LOG') {
                addLog(request.message, request.logType);
            } else if (request.action === 'UPDATE_STATS') {
                updateRealTimeStatus(request.data);
            } else if (request.action === 'CORE_RUNTIME_BROKEN_ALERT') {
                addLog(`🚨 [CIRCUIT BREAKER] Core runtime broken: ${request.symbol} is not defined. Campaign paused.`, 'error');
            }
        });
        console.log("✅ [Popup] Real-time messaging listener registered via chrome.runtime.");
    } catch(e) { console.error('[Popup] Fatal: onMessage listener failed:', e); }

    // 2. [VITAL 2차 방어벽] Direct window postMessage listener
    // Electron renderer_ui가 executeJavaScript로 window.postMessage릴레이를 보낼 때 직접 가로채어 수신
    try {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'runtime-on-message') {
                const request = event.data.data;
                if (!request) return;
                console.log("📥 [Popup postMessage Relay] Received action:", request.action);
                if (request.action === 'SENDER_LOG') {
                    addLog(request.message, request.logType);
                } else if (request.action === 'UPDATE_STATS') {
                    updateRealTimeStatus(request.data);
                }
            }
        });
        console.log("✅ [Popup] Dual-path postMessage real-time listener active.");
    } catch(e) { console.error('[Popup] Fatal: postMessage listener failed:', e); }

    // ── Step 1: Bind ALL events FIRST (no async, cannot fail) ──
    try { bindEvents(); } catch(e) { console.error('[Popup] bindEvents failed:', e); }
    
    // ── Step 2: Connect to runtime (non-critical, ignore errors) ──
    try { chrome.runtime.connect({ name: 'xpider_popup' }); } catch(e) {}

    // Execute all asynchronous/slower initializations in background to prevent hanging
    initializeAsyncComponents();
});

async function initializeAsyncComponents() {
    // ── Step 3: Load localizer ──
    try { await initLocalizer(); } catch(e) { console.error('[Popup] initLocalizer failed:', e); }

    // ── Step 4: Load settings ──
    try { await loadSettings(); } catch(e) { console.error('[Popup] loadSettings failed:', e); }

    // ── Step 5: Restore persistent logs ──
    try { await loadBlackBoxLogs(); } catch(e) {}

    // ── Step 6: Passive Keep-Alive heartbeat ──
    try {
        setInterval(() => {
            chrome.runtime.sendMessage({ action: 'UI_HEARTBEAT' }).catch(() => {});
        }, 30000);
    } catch(e) {}

    // ── Step 8: Speed slider ──
    try {
        ['delay-input-collect', 'delay-input-fill', 'delay-input-submit'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSpeedLabels);
        });

        // [v4.15.0] 폼 자동 입력 방식 변경 리스너 등록 및 실시간 세이브
        document.querySelectorAll('input[name="fill-mode"]').forEach(el => {
            el.addEventListener('change', (e) => {
                chrome.storage.local.set({ xpider_fill_mode: e.target.value });
            });
        });
    } catch(e) {}

    console.log("✅ X PIDER Sender Pro initialized.");

    // ── Step 9: State Handshake (Directly with Chrome Background Service Worker) ──
    try {
        chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Popup] Initial GET_STATE error:', chrome.runtime.lastError.message);
                return;
            }
            if (response && response.success) {
                if (response.isActive) {
                    campaignActive = true;
                    totalTargets = response.totalTargets || 0;
                    successCount = response.successCount || 0;
                    remainingTargets = response.remainingCount || 0;
                    campaignPaused = !!response.isPaused;
                    
                    const completedCount = response.completedCount || 0;
                    
                    document.getElementById('status-box').classList.remove('hidden');
                    document.getElementById('multi-actions').classList.remove('hidden');
                    document.getElementById('start-btn').classList.add('hidden');
                    
                    updateRealTimeStatus({
                        successCount: successCount,
                        completedCount: completedCount,
                        remainingCount: remainingTargets,
                        totalTargets: totalTargets
                    });
                    
                    const btn = document.getElementById('pause-btn');
                    const langSelect = document.getElementById('language-select');
                    const lang = langSelect ? langSelect.value : 'en';
                    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                    if (btn) {
                        if (campaignPaused) {
                            btn.textContent = dict.btn_resume || "▶️ Resume";
                            btn.style.backgroundColor = "#22c55e";
                        } else {
                            btn.textContent = dict.btn_pause || "⏸️ Pause";
                            btn.style.backgroundColor = "#f59e0b";
                        }
                    }
                    addDiagnosticLog(`[Engine] Initial handshake synced: active=true, remaining=${remainingTargets}`);
                } else {
                    campaignActive = false;
                    document.getElementById('start-btn').classList.remove('hidden');
                    document.getElementById('multi-actions').classList.add('hidden');
                    addDiagnosticLog(`[Engine] Initial handshake synced: active=false`);
                }
            }
        });
    } catch(e) { console.error('[Popup] Direct state handshake failed:', e); }

    // ── Step 10: Hard Reset Button ──
    try {
        const hardResetBtn = document.getElementById('hard-reset-engine-btn');
        if (hardResetBtn) {
            hardResetBtn.addEventListener('click', () => {
                if (confirm("Are you sure? This will reload the extension and reset its state.")) {
                    chrome.runtime.reload();
                }
            });
        }
    } catch(e) {}

    // ── Step 11: Engine status indicator ──
    try {
        const footer = document.querySelector('.popup-footer');
        if (footer && !document.getElementById('engine-status-indicator')) {
            const span = document.createElement('span');
            span.id = 'engine-status-indicator';
            span.style.cssText = 'font-size:0.7rem;margin-left:auto;opacity:0.8';
            span.textContent = "Checking...";
            footer.appendChild(span);
        }
    } catch(e) {}

    // ── Step 12: Pulse check ──
    try { startPulseCheck(); } catch(e) {}

    // ── Step 13: Authoritative Counters Restore & Storage Listener ──
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['xpider_campaign_counters_v1'], (res) => {
                if (res && res.xpider_campaign_counters_v1) {
                    const c = res.xpider_campaign_counters_v1;
                    updateRealTimeStatus({
                        totalTargets: c.total,
                        successCount: c.success,
                        failedCount: c.failed,
                        completedCount: c.completed,
                        remainingCount: c.remaining,
                        failureBreakdown: c.failureBreakdown
                    });
                }
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.xpider_campaign_counters_v1 && changes.xpider_campaign_counters_v1.newValue) {
                    const c = changes.xpider_campaign_counters_v1.newValue;
                    updateRealTimeStatus({
                        totalTargets: c.total,
                        successCount: c.success,
                        failedCount: c.failed,
                        completedCount: c.completed,
                        remainingCount: c.remaining,
                        failureBreakdown: c.failureBreakdown
                    });
                }
            });
        }
    } catch (_) {}

    // [WitKey] Audio STT API Key (Wit.ai) load directly from chrome.storage.local
    _loadInitialWitKey();

    function _loadInitialWitKey() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['xpider_stt_api_key', 'audioSttKey', 'witKey'], (res) => {
                const latestKey = (res && (res.xpider_stt_api_key || res.audioSttKey || res.witKey)) || '';
                const witStatusText = document.getElementById('wit-status-text');
                if (latestKey.trim() === '') {
                    if (witStatusText) {
                        witStatusText.textContent = "Key Required";
                        witStatusText.style.color = "#ffaa00";
                    }
                    const setupModal = document.getElementById('stt-setup-modal-overlay');
                    if (setupModal) setupModal.classList.remove('hidden');
                } else {
                    if (witStatusText) {
                        witStatusText.textContent = `Configured (${latestKey.substring(0, 6)}...)`;
                        witStatusText.style.color = "#00ffcc";
                    }
                    const sttKeyInput = document.getElementById('audio-stt-key');
                    if (sttKeyInput) sttKeyInput.value = latestKey;
                    const setupInput = document.getElementById('setup-stt-key-input');
                    if (setupInput) setupInput.value = latestKey;
                    const setupModal = document.getElementById('stt-setup-modal-overlay');
                    if (setupModal) setupModal.classList.add('hidden');
                }
            });
        }
    }
}

async function initLocalizer() {
    // Wait a bit to ensure translations.js is parsed if needed
    i18nData = window.I18N_DATA;
    if (!i18nData) {
        console.warn("I18N_DATA not found, retrying...");
        await new Promise(r => setTimeout(r, 100));
        i18nData = window.I18N_DATA;
    }
    
    if (!i18nData) {
        console.error("Fatal: I18N_DATA could not be loaded.");
        return;
    }

    const storage = await chrome.storage.local.get(['xpider_lang']);
    const lang = storage.xpider_lang || 'en';
    applyTranslations(lang);
}

function applyTranslations(lang) {
    if (!i18nData) return;
    const dict = i18nData[lang] || i18nData['en'] || {};

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        let text = dict[key] || (i18nData['en'] ? i18nData['en'][key] : null) || key;
        
        if (key === 'status_finished') {
            const parts = text.split('{count}');
            const prefixText = parts[0] ? parts[0].trim() : 'Campaign Status:';
            const suffixText = parts[1] ? parts[1].trim() : 'sent';
            
            el.textContent = prefixText;
            
            const suffixLabel = document.querySelector('.status-suffix');
            if (suffixLabel) suffixLabel.textContent = suffixText;
            
            updateRealTimeStatus({ successCount });
        } else {
            el.textContent = text;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = dict[key] || (i18nData['en'] ? i18nData['en'][key] : null);
        if (val) el.placeholder = val;
    });

    // Update API Link Tip
    const methodSelect = document.getElementById('captcha-method-select');
    const apiLinkTip = document.getElementById('api-link-tip');
    if (apiLinkTip && methodSelect) {
        const method = methodSelect.value;
        if (method === 'nopecha') {
            apiLinkTip.innerHTML = '<a href="https://nopecha.com/" target="_blank">NopeCHA API Key 받기</a>';
        } else {
            apiLinkTip.innerHTML = '<a href="https://2captcha.com?from=18329628" target="_blank">2Captcha Key 받기</a>';
        }
    }
}

function updateRealTimeStatus(data) {
    if (data.totalTargets !== undefined) {
        totalTargets = data.totalTargets;
    }
    
    let completedCount = 0;
    if (data.completedCount !== undefined) {
        completedCount = data.completedCount;
    } else if (data.remainingCount !== undefined) {
        completedCount = totalTargets - data.remainingCount;
    }
    if (completedCount < 0) completedCount = 0;
    
    // Update Completed count display
    const completedDisplay = document.getElementById('completed-count-display');
    if (completedDisplay) completedDisplay.textContent = completedCount;

    if (data.successCount !== undefined) {
        successCount = data.successCount;
        const display = document.getElementById('success-count-display');
        if (display) display.textContent = successCount;

        // Refresh the label if it has a placeholder
        const statusLabel = document.querySelector('[data-i18n="status_finished"]');
        if (statusLabel) {
            const lang = document.getElementById('language-select')?.value || 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            let text = dict['status_finished'] || 'Campaign Status: {count} sent';
            
            const parts = text.split('{count}');
            const prefixText = parts[0] ? parts[0].trim() : 'Campaign Status:';
            const suffixText = parts[1] ? parts[1].trim() : 'sent';
            
            statusLabel.textContent = prefixText;
            
            const suffixLabel = document.querySelector('.status-suffix');
            if (suffixLabel) {
                suffixLabel.textContent = suffixText;
            }
        }
    }

    if (data.failedCount !== undefined) {
        const failedDisplay = document.getElementById('failed-count-display');
        if (failedDisplay) failedDisplay.textContent = data.failedCount;
    }

    if (data.failureBreakdown && typeof data.failureBreakdown === 'object') {
        renderFailureBreakdown(data.failureBreakdown);
    }
    
    if (data.remainingCount !== undefined) {
        remainingTargets = data.remainingCount;
        
        // Update Remaining count display
        const remainingDisplay = document.getElementById('remaining-count-display');
        if (remainingDisplay) remainingDisplay.textContent = totalTargets - completedCount;

        const progress = totalTargets > 0 ? Math.round((completedCount / totalTargets) * 100) : 0;
        updateProgress(progress);
        
        refreshStatusDetailUI();

        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) {
            const lang = document.getElementById('language-select')?.value || 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            const remainingLabel = dict.remaining_suffix || 'remaining';
            countDisplay.textContent = `${remainingTargets} (${remainingLabel}) / ${totalTargets} URLs`;
        }
    }
}

function renderFailureBreakdown(breakdown) {
    const listEl = document.getElementById('failure-breakdown-list');
    if (!listEl) return;
    const entries = Object.entries(breakdown || {}).filter(([_, count]) => count > 0);
    if (entries.length === 0) {
        listEl.innerHTML = '<div class="empty-breakdown" style="color: #64748b;">No failures recorded.</div>';
        return;
    }
    listEl.innerHTML = entries
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `
            <div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed rgba(255,255,255,0.06);">
                <span style="color: #fda4af;">- ${reason}</span>
                <span style="font-weight: bold; color: #ef4444;">${count}</span>
            </div>
        `).join('');
}

/**
 * [v2.5.5] Unified UI Refresh for 3-line monitor format:
 * [Last Log Message]: [Remaining Count] remaining.
 */
function refreshStatusDetailUI() {
    const statusDetail = document.getElementById('status-detail');
    if (!statusDetail) return;

    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
    const suffix = dict.remaining_suffix || 'remaining.';
    
    // [v2.8.9] Simplified UI: Only show remaining count, remove log noise
    const statusText = campaignPaused ? `⏸️ PAUSED (${remainingTargets} ${suffix})` : `${remainingTargets} ${suffix}`;
    statusDetail.textContent = statusText;
    statusDetail.style.fontWeight = '700';
    statusDetail.style.fontSize = '0.85rem'; // Smaller font as requested
    statusDetail.style.color = campaignPaused ? '#ff3366' : '#facc15'; 
}

function updateSpeedLabels() {
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
    
    // 1. 수집 속도 매핑 라벨
    const collectSlider = document.getElementById('delay-input-collect');
    const collectDisplay = document.getElementById('speed-collect-display');
    if (collectSlider && collectDisplay) {
        const level = collectSlider.value;
        const msArr = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
        const sec = (msArr[parseInt(level)] || 10000) / 1000;
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${sec}s)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        collectDisplay.innerHTML = label;
        
        // 레거시 연동용으로 hidden delay-input의 value도 대변 업데이트
        const legacyInput = document.getElementById('delay-input');
        if (legacyInput) legacyInput.value = level;
    }

    // 2. 자동 입력 속도 매핑 라벨
    const fillSlider = document.getElementById('delay-input-fill');
    const fillDisplay = document.getElementById('speed-fill-display');
    if (fillSlider && fillDisplay) {
        const level = fillSlider.value;
        const msArr = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
        const ms = msArr[parseInt(level)] || 300;
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${ms}ms)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        fillDisplay.innerHTML = label;
    }

    // 3. 등록 속도 매핑 라벨
    const submitSlider = document.getElementById('delay-input-submit');
    const submitDisplay = document.getElementById('speed-submit-display');
    if (submitSlider && submitDisplay) {
        const level = submitSlider.value;
        const msArr = [5000, 4000, 3000, 2500, 2000, 1800, 1500, 1000, 700, 500];
        const sec = ((msArr[parseInt(level)] || 1500) / 1000).toFixed(1);
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${sec}s)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        submitDisplay.innerHTML = label;
    }
}

function updateSpeedLabel() {
    updateSpeedLabels();
}

function bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(`${btn.dataset.tab}-tab`);
            if (target) target.classList.add('active');
            
            // [v2.3.0] Hide status/log areas when in Template, History, or Email Collector Tab
            if (btn.dataset.tab === 'template' || btn.dataset.tab === 'history' || btn.dataset.tab === 'email-collector') {
                document.body.classList.add('template-active');
            } else {
                document.body.classList.remove('template-active');
            }

            if (btn.dataset.tab === 'history') {
                renderLedgerUI();
            } else if (btn.dataset.tab === 'email-collector') {
                renderEmailCollectorUI();
            }
        });
    });

    // File Upload
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', handleFileUpload);

    // Campaign Buttons
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', startCampaign);
    
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
    
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) stopBtn.addEventListener('click', stopCampaign);

    const stopSaveBtn = document.getElementById('stop-save-btn');
    if (stopSaveBtn) stopSaveBtn.addEventListener('click', stopAndSaveCampaign);

    const endCampaignBtn = document.getElementById('end-campaign-btn');
    if (endCampaignBtn) endCampaignBtn.addEventListener('click', endCampaign);

    const resumeBtn = document.getElementById('resume-campaign-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', resumeCampaign);

    const discardBtn = document.getElementById('discard-checkpoint-btn');
    if (discardBtn) discardBtn.addEventListener('click', discardCheckpoint);

    // Diagnostic Action Buttons
    const copyDiagBtn = document.getElementById('copy-diagnostic-btn');
    if (copyDiagBtn) copyDiagBtn.addEventListener('click', copyDiagnosticReport);

    const dlDiagBtn = document.getElementById('download-diagnostic-btn');
    if (dlDiagBtn) dlDiagBtn.addEventListener('click', downloadDiagnosticTxt);

    const clearDiagBtn = document.getElementById('clear-diagnostic-btn');
    if (clearDiagBtn) clearDiagBtn.addEventListener('click', clearDiagnosticLog);

    // FAILED Breakdown Card Toggle
    const failedCardBtn = document.getElementById('failed-card-btn');
    const breakdownContainer = document.getElementById('failure-breakdown-container');
    const breakdownToggle = document.getElementById('failure-breakdown-toggle');
    if (failedCardBtn && breakdownContainer) {
        failedCardBtn.addEventListener('click', () => {
            breakdownContainer.classList.toggle('hidden');
        });
    }
    if (breakdownToggle && breakdownContainer) {
        breakdownToggle.addEventListener('click', () => {
            breakdownContainer.classList.add('hidden');
        });
    }

    // Settings
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) settingsToggle.addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.remove('hidden');
    });
    
    const settingsClose = document.getElementById('settings-close');
    if (settingsClose) settingsClose.addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.add('hidden');
    });
    
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    // [WitKey-Sync v2] #audio-stt-key 실시간 입력 → debounce 후 즉시 스토리지 동기화
    // Crawler의 onChanged 리스너가 감지하여 Crawler UI도 자동 업데이트됨
    (function bindSttKeyRealTimeSync() {
        let _sttDebounceTimer = null;
        const sttKeyEl = document.getElementById('audio-stt-key');
        if (!sttKeyEl) return;
        sttKeyEl.addEventListener('input', () => {
            clearTimeout(_sttDebounceTimer);
            _sttDebounceTimer = setTimeout(() => {
                const key = sttKeyEl.value.trim();
                chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key }, () => {
                    console.log(`[WitKey-Sync v2] Sender 실시간 입력 동기화: ${key ? key.substring(0, 8) + '...' : 'NONE'}`);
                });
            }, 600); // 600ms 타이핑 중지 후 저장
        });
    })();

    // [v18.46.0] Wit.ai STT Key Setup Modal Save Button
    const saveSetupSttBtn = document.getElementById('save-setup-stt-btn');
    if (saveSetupSttBtn) {
        saveSetupSttBtn.addEventListener('click', async () => {
            const input = document.getElementById('setup-stt-key-input');
            const key = input ? input.value.trim() : '';
            if (key === '') {
                alert("Please enter a valid Wit.ai Key.");
                return;
            }
            
            // [WitKey-Sync v2] 3개 키 모두 저장하여 Crawler와 실시간 동기화
            await chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key });
            const settingsInput = document.getElementById('audio-stt-key');
            if (settingsInput) settingsInput.value = key;
            
            // [WitKey] Sync to background service worker via UPDATE_WIT_KEY
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: 'UPDATE_WIT_KEY', key }).catch(() => {});
            }
            
            const setupModal = document.getElementById('stt-setup-modal-overlay');
            if (setupModal) setupModal.classList.add('hidden');
            
            const langSelect = document.getElementById('language-select');
            const lang = langSelect ? langSelect.value : 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            alert(dict.msg_saved || "Saved!");
        });
    }

    const quickWitBtn = document.getElementById('quick-wit-setup-btn');
    if (quickWitBtn) {
        quickWitBtn.addEventListener('click', () => {
            const setupModal = document.getElementById('stt-setup-modal-overlay');
            if (setupModal) setupModal.classList.remove('hidden');
        });
    }

    // [v19.1.0] Wit.ai Link - Open via Chrome Tabs API or window.open
    const witAiLink = document.getElementById('wit-ai-link');
    if (witAiLink) {
        witAiLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = witAiLink.href || 'https://wit.ai';
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url });
            } else {
                window.open(url, '_blank');
            }
        });
    }
    // [v19.1.0] 모든 premium-link 클래스의 외부 링크도 동일한 방식으로 처리
    document.querySelectorAll('a.premium-link, a[target="_blank"]').forEach(link => {
        if (link.id === 'wit-ai-link') return; // 이미 위에서 처리
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = link.href;
            if (!url || url === '#') return;
            try {
                window.postMessage({ type: 'XPIDER_SEND', channel: 'auth-open-external', data: url }, '*');
            } catch (err) {}
            try { window.open(url, '_blank'); } catch (err) {}
        });
    });

    // [v2.4.0] Template Save Buttons - Combined
    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', saveTemplateChanges);
    });
    
    // [v2.2.0] Drop area styled as button label
    const dropArea = document.getElementById('drop-area');
    if (dropArea) {
        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-active'); });
        dropArea.addEventListener('dragleave', () => { dropArea.classList.remove('drag-active'); });
        dropArea.addEventListener('drop', handleFileUpload);
    }
    
    const loadFileBtn = document.getElementById('load-tpl-file-btn');
    const tplFileInput = document.getElementById('tpl-file-input');
    if (loadFileBtn && tplFileInput) {
        loadFileBtn.addEventListener('click', () => tplFileInput.click());
        tplFileInput.addEventListener('change', importMessageFromFile);
    }
    
    const closeAppBtn = document.getElementById('close-app-btn');
    if (closeAppBtn) closeAppBtn.addEventListener('click', () => window.close());

    // Captcha Logic Toggles
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    if (captchaToggle) {
        captchaToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            const methodGroup = document.getElementById('captcha-method-group');
            if (methodGroup) methodGroup.style.display = enabled ? 'block' : 'none';
            toggleCaptchaApiVisibility();
        });
    }

    const methodSelect = document.getElementById('captcha-method-select');
    if (methodSelect) {
        methodSelect.addEventListener('change', () => {
            toggleCaptchaApiVisibility();
            const langSelect = document.getElementById('language-select');
            if (langSelect) applyTranslations(langSelect.value);
        });
    }

    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            applyTranslations(e.target.value);
        });
    }

    // Persistence for Template
    ['tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-phone', 'tpl-subject', 'tpl-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveTemplate);
    });

    // Single URL & List Management
    // Single URL & List Management
    const addUrlBtn = document.getElementById('add-url-btn');
    if (addUrlBtn) {
        addUrlBtn.classList.add('plus-btn-circle');
        addUrlBtn.addEventListener('click', addSingleUrl);
    }
    
    const manualUrlInput = document.getElementById('manual-url-input');
    if (manualUrlInput) {
        manualUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addSingleUrl();
        });
    }

    // Clear List Button
    const clearListBtn = document.getElementById('clear-list-btn');
    if (clearListBtn) {
        clearListBtn.addEventListener('click', clearCampaignQueue);
    }

    // [Phase 2B] Template CRUD Action Toolbar
    const newTplBtn = document.getElementById('new-tpl-btn');
    if (newTplBtn) newTplBtn.addEventListener('click', () => handleCreateNewTemplate());

    const dupTplBtn = document.getElementById('dup-tpl-btn');
    if (dupTplBtn) dupTplBtn.addEventListener('click', () => handleDuplicateTemplate());

    const defTplBtn = document.getElementById('default-tpl-btn');
    if (defTplBtn) defTplBtn.addEventListener('click', () => handleSetDefaultTemplate());

    const delTplBtn = document.getElementById('del-tpl-btn');
    if (delTplBtn) {
        delTplBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to delete this template?")) {
                handleDeleteTemplate().catch(e => alert(e.message));
            }
        });
    }

    const tplSelect = document.getElementById('tpl-library-select');
    if (tplSelect) tplSelect.addEventListener('change', loadTemplateFromLibrary);

    // [Phase 2B] History Ledger Action Toolbar & Filtering
    document.querySelectorAll('.ledger-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.ledger-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            ledgerState.filter = chip.dataset.filter || 'ALL';
            ledgerState.page = 1;
            renderLedgerUI();
        });
    });

    const ledgerSearchInput = document.getElementById('ledger-search-input');
    if (ledgerSearchInput) {
        let searchTimer = null;
        ledgerSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                ledgerState.search = ledgerSearchInput.value.trim();
                ledgerState.page = 1;
                renderLedgerUI();
            }, 300);
        });
    }

    const ledgerSelectAllCb = document.getElementById('ledger-select-all-cb');
    if (ledgerSelectAllCb) {
        ledgerSelectAllCb.addEventListener('change', () => {
            const cbs = document.querySelectorAll('.ledger-item-cb');
            cbs.forEach(cb => {
                cb.checked = ledgerSelectAllCb.checked;
                const tgt = cb.dataset.target;
                if (ledgerSelectAllCb.checked) ledgerState.selectedTargets.add(tgt);
                else ledgerState.selectedTargets.delete(tgt);
                cb.closest('.ledger-item-card')?.classList.toggle('is-selected', ledgerSelectAllCb.checked);
            });
            updateSelectionCountUI();
        });
    }

    const ledgerExportAllGSheetsBtn = document.getElementById('ledger-export-all-gsheets-btn');
    if (ledgerExportAllGSheetsBtn) ledgerExportAllGSheetsBtn.addEventListener('click', () => triggerGoogleSheetsCsvExport({ exportCurrentFilter: false }));

    const ledgerExportFilterGSheetsBtn = document.getElementById('ledger-export-filter-gsheets-btn');
    if (ledgerExportFilterGSheetsBtn) ledgerExportFilterGSheetsBtn.addEventListener('click', () => triggerGoogleSheetsCsvExport({ exportCurrentFilter: true }));

    const ledgerExportBtn = document.getElementById('ledger-export-csv-btn');
    if (ledgerExportBtn) ledgerExportBtn.addEventListener('click', () => triggerGoogleSheetsCsvExport({ exportCurrentFilter: false }));

    const ledgerResetSelBtn = document.getElementById('ledger-reset-selected-btn');
    if (ledgerResetSelBtn) {
        ledgerResetSelBtn.addEventListener('click', async () => {
            try {
                await dispatchSelectiveReset();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const ledgerRetryFailedBtn = document.getElementById('ledger-retry-failed-btn');
    if (ledgerRetryFailedBtn) {
        ledgerRetryFailedBtn.addEventListener('click', async () => {
            try {
                await dispatchRetryFailed();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const ledgerClearBtn = document.getElementById('ledger-clear-btn');
    const ledgerResetAllBtn = document.getElementById('ledger-reset-all-btn');
    const resetAllModal = document.getElementById('reset-all-modal-overlay');
    const cancelResetAllBtn = document.getElementById('cancel-reset-all-btn');
    const confirmResetAllBtn = document.getElementById('confirm-reset-all-btn');

    if (ledgerClearBtn && resetAllModal) {
        ledgerClearBtn.addEventListener('click', () => {
            if (campaignActive) {
                alert("Cannot clear history while campaign is actively running!");
                return;
            }
            resetAllModal.classList.remove('hidden');
        });
    }
    if (ledgerResetAllBtn && resetAllModal) {
        ledgerResetAllBtn.addEventListener('click', () => {
            if (campaignActive) {
                alert("Cannot clear history while campaign is actively running!");
                return;
            }
            resetAllModal.classList.remove('hidden');
        });
    }
    if (cancelResetAllBtn && resetAllModal) {
        cancelResetAllBtn.addEventListener('click', () => {
            resetAllModal.classList.add('hidden');
        });
    }
    if (confirmResetAllBtn && resetAllModal) {
        confirmResetAllBtn.addEventListener('click', async () => {
            resetAllModal.classList.add('hidden');
            try {
                await dispatchClearHistoryLedger();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // [Issue #6 R4.1] RESET ALL LIST DATA Modal & Event Listeners
    const resetAllListsBtn = document.getElementById('reset-all-lists-btn');
    const settingsResetAllListsBtn = document.getElementById('settings-reset-all-lists-btn');
    const resetAllListsModal = document.getElementById('reset-all-lists-modal-overlay');
    const cancelResetAllListsBtn = document.getElementById('cancel-reset-all-lists-btn');
    const confirmResetAllListsBtn = document.getElementById('confirm-reset-all-lists-btn');

    const openResetAllListsModal = () => {
        if (campaignActive) {
            alert("Cannot reset list data while campaign is actively running!");
            return;
        }
        if (resetAllListsModal) resetAllListsModal.classList.remove('hidden');
    };

    if (resetAllListsBtn) resetAllListsBtn.addEventListener('click', openResetAllListsModal);
    if (settingsResetAllListsBtn) settingsResetAllListsBtn.addEventListener('click', openResetAllListsModal);
    if (cancelResetAllListsBtn && resetAllListsModal) {
        cancelResetAllListsBtn.addEventListener('click', () => {
            resetAllListsModal.classList.add('hidden');
        });
    }
    if (confirmResetAllListsBtn && resetAllListsModal) {
        confirmResetAllListsBtn.addEventListener('click', async () => {
            resetAllListsModal.classList.add('hidden');
            try {
                await dispatchResetAllListData();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const ledgerPrevBtn = document.getElementById('ledger-prev-btn');
    if (ledgerPrevBtn) {
        ledgerPrevBtn.addEventListener('click', () => {
            if (ledgerState.page > 1) {
                ledgerState.page--;
                renderLedgerUI();
            }
        });
    }

    const ledgerNextBtn = document.getElementById('ledger-next-btn');
    if (ledgerNextBtn) {
        ledgerNextBtn.addEventListener('click', () => {
            ledgerState.page++;
            renderLedgerUI();
        });
    }

    try { bindEmailCollectorEvents(); } catch (_) {}
}

function toggleCaptchaApiVisibility() {
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    if (!captchaToggle || !methodSelect) return;

    const enabled = captchaToggle.checked;
    const method = methodSelect.value;
    
    const isApi = (method === 'api' || method === 'nopecha');
    const isAudio = (method === 'audio' || method === 'native');
    
    const apiGroup = document.getElementById('captcha-api-group');
    if (apiGroup) apiGroup.style.display = (enabled && isApi) ? 'block' : 'none';
    
    const sttGroup = document.getElementById('audio-stt-group');
    if (sttGroup) sttGroup.style.display = (enabled && isAudio) ? 'block' : 'none';
}

function renderUrlsPreview(urls) {
    const previewArea = document.getElementById('file-urls-preview');
    const previewList = document.getElementById('preview-list');
    if (!previewArea || !previewList) return;

    previewList.innerHTML = '';
    if (!urls || urls.length === 0) {
        previewArea.classList.add('hidden');
        return;
    }

    urls.forEach(url => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.textContent = url;
        div.title = url;
        previewList.appendChild(div);
    });

    previewArea.classList.remove('hidden');
}

async function handleFileUpload(e) {
    e.preventDefault();
    const file = e.target.files ? e.target.files[0] : e.dataTransfer.files[0];
    if (!file) return;

    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = file.name;
    
    const text = await file.text();
    const importId = `import_${Date.now()}`;
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    // [F7] Step 1: Parse source file into LOGICAL records BEFORE URL extraction.
    // CSV: use RFC-4180-aware parser to handle quoted fields with embedded commas/newlines.
    // TXT: use physical newline splitting (one record per line).
    let rawSourceRows;
    if (isCsv) {
        rawSourceRows = _parseRfc4180Records(text);
    } else {
        rawSourceRows = text.split(/\r?\n/);
    }

    // [F7] Step 2: Build per-row records preserving exact source structure
    // Guarantee 1:1 row-to-target linkage: exactly one primary target URL per source row
    const urlRegex = /(https?:\/\/[^\s,"]+)|((?:www\.)?[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(?:\/[^\s,"]*)?)/g;
    const rowsForLedger = rawSourceRows.map((rawRecord, idx) => {
        let matches = rawRecord.match(urlRegex) || [];
        matches = matches.map(u => {
            u = u.trim().replace(/[.,;)]+$/, '');
            if (u && !u.startsWith('http')) u = 'https://' + u;
            return u;
        }).filter(u => { try { new URL(u); return true; } catch(err) { return false; } });

        // Exactly one primary execution target per source row (guarantees 1:1 row-to-target traceability)
        const primaryTarget = matches.length > 0 ? matches[0] : null;

        return {
            sourceRowNumber: idx + 1,   // 1-indexed logical record number
            rawInput: rawRecord,        // exact original record content unchanged
            targetIdentity: primaryTarget // [F7] explicit 1:1 link to executed target
        };
    });

    // [F7] Step 3: Persist ALL source rows (AWAITED — fail-closed: reject import if ledger write fails)
    try {
        const importRes = await chrome.runtime.sendMessage({
            action: 'RECORD_IMPORT_ROWS',
            rows: rowsForLedger,
            importId
        });
        if (!importRes || !importRes.success) {
            throw new Error((importRes && importRes.error) || 'Ledger write rejected by background service worker');
        }
    } catch (err) {
        addLog(`❌ [F7] Import rejected: durable ledger write failed (${err.message}). Import aborted; no targets queued.`, 'error');
        if (nameDisplay) nameDisplay.textContent = 'Import failed (ledger error)';
        return;
    }

    // [F7] Step 4: Queue ONLY the linked targets from preserved rows (strictly 1:1 linked)
    const blacklist = window.XPIDER_BLACKLIST || [];
    const executionTargets = rowsForLedger
        .map(r => r.targetIdentity)
        .filter(Boolean)
        .filter(url => {
            const lowerUrl = url.toLowerCase();
            return !blacklist.some(domain => lowerUrl.includes(domain));
        });

    campaignQueue = [...new Set(executionTargets)];

    totalTargets = campaignQueue.length;
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = `${totalTargets} URLs found`;
    
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.remove('hidden');
    
    await saveListToStorage(file.name, campaignQueue);
    renderUrlsPreview(campaignQueue);
    chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_total: totalTargets, xpider_success: 0 });
    addLog(`Loaded ${totalTargets} business URLs from ${rawSourceRows.length} source record(s) (${isCsv ? 'CSV logical records' : 'TXT lines'}).`, 'info');
}

/**
 * [F7] RFC-4180 CSV logical-record parser.
 * Handles: quoted fields, embedded commas, embedded CRLF/LF within quoted fields.
 * Preserves the EXACT original source substring for audit integrity (no unescaping).
 */
function _parseRfc4180Records(text) {
    const records = [];
    let recordStart = 0;
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                i += 2; // skip escaped quote pair without modifying raw slice
                continue;
            }
            inQuotes = !inQuotes;
            i++;
        } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
            const end = i;
            if (ch === '\r' && text[i + 1] === '\n') i++;
            records.push(text.slice(recordStart, end));
            i++;
            recordStart = i;
        } else {
            i++;
        }
    }
    if (recordStart < text.length || records.length === 0) {
        records.push(text.slice(recordStart));
    }
    return records;
}

if (typeof window !== 'undefined') {
    window._parseRfc4180Records = _parseRfc4180Records;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports._parseRfc4180Records = _parseRfc4180Records;
}

async function saveListToStorage(name, urls) {
    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    let lists = data.xpider_saved_lists || [];
    
    // Check for duplicates and update or append
    const existingIdx = lists.findIndex(l => l.name === name);
    if (existingIdx > -1) {
        lists[existingIdx] = { name, urls, date: new Date().toISOString() };
    } else {
        lists.push({ name, urls, date: new Date().toISOString() });
    }
    
    await chrome.storage.local.set({ xpider_saved_lists: lists });
    await updateSavedListsUI();
}

async function updateSavedListsUI() {
    const listContainer = document.getElementById('saved-lists-container');
    if (!listContainer) return;

    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    const savedLists = data.xpider_saved_lists || [];

    listContainer.innerHTML = '';
    
    if (savedLists.length === 0) {
        listContainer.innerHTML = '<div class="empty-list-note">No lists saved.</div>';
        return;
    }

    savedLists.forEach((list, index) => {
        const div = document.createElement('div');
        div.className = 'list-item-unified';
        div.innerHTML = `
            <span class="list-item-name">${list.name} (${list.urls.length})</span>
            <button class="list-item-delete" title="Delete">&times;</button>
        `;

        div.onclick = async () => {
            // Select this list
            campaignQueue = [...list.urls];
            totalTargets = campaignQueue.length;
            successCount = 0;
            
            document.querySelectorAll('.list-item-unified').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            
            const countDisplay = document.getElementById('url-count-display');
            if (countDisplay) countDisplay.textContent = `${campaignQueue.length} URLs found`;
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('status-box').classList.remove('hidden');

            // Show URLs Preview in UI
            renderUrlsPreview(campaignQueue);
            
            addLog(`Loaded saved list: ${list.name} (${list.urls.length} URLs)`, 'info');
            await chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_success: 0, xpider_total: totalTargets });
        };

        const delBtn = div.querySelector('.list-item-delete');
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete list "${list.name}"?`)) {
                savedLists.splice(index, 1);
                await chrome.storage.local.set({ xpider_saved_lists: savedLists });
                updateSavedListsUI();
                addLog(`Deleted list: ${list.name}`, 'warning');
            }
        };

        listContainer.appendChild(div);
    });
}

/**
 * [v19.0] Save template via native OS Save-As dialog (path + filename choosable)
 */
async function saveTemplateChanges() {
    const tpl = {
        firstName: document.getElementById('tpl-first-name').value.trim(),
        lastName:  document.getElementById('tpl-last-name').value.trim(),
        name:      document.getElementById('tpl-name').value.trim(),
        email:     document.getElementById('tpl-email').value.trim(),
        phone:     document.getElementById('tpl-phone').value.trim(),
        subject:   document.getElementById('tpl-subject').value.trim(),
        message:   document.getElementById('tpl-message').value.trim()
    };

    if (!tpl.message && !tpl.subject) return alert('Please enter at least a Subject or Message.');

    const safeName = (tpl.subject || tpl.name || 'XPIDER_Template').replace(/[<>:"/\\|?*]/g, '_');
    const defaultName = `${safeName}_template.txt`;
    const content = buildTemplateFileContent(tpl);

    addLog('📁 Saving template file...', 'info');
    let result = { success: true, fileName: defaultName, filePath: defaultName };
    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
        try {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const dlResult = await new Promise((resolve, reject) => {
                chrome.downloads.download({
                    url: url,
                    filename: defaultName,
                    saveAs: true
                }, (downloadId) => {
                    try { URL.revokeObjectURL(url); } catch (_) {}
                    if (chrome.runtime.lastError) {
                        const errMsg = chrome.runtime.lastError.message || '';
                        if (errMsg.toLowerCase().includes('cancel') || errMsg.toLowerCase().includes('user')) {
                            return resolve({ cancelled: true });
                        }
                        return reject(new Error(errMsg));
                    }
                    resolve({ success: true, downloadId });
                });
            });
            if (dlResult && dlResult.cancelled) {
                addLog('Template save cancelled by user.', 'info');
                return;
            }
        } catch (dlErr) {
            console.warn('[Template Save] chrome.downloads error, proceeding with store save:', dlErr.message);
        }
    }

    // [F9] Save to templates_v2 as authoritative store
    const tplId = `tpl_${Date.now()}`;
    const fullName = tpl.name || `${tpl.firstName} ${tpl.lastName}`.trim();
    const v2Item = {
        ...tpl,
        id: tplId,
        fullName: fullName,
        fileName: result.fileName,
        filePath: result.filePath,
        sender: {
            fullName: fullName,
            firstName: tpl.firstName,
            lastName: tpl.lastName,
            company: '',
            email: tpl.email,
            phone: tpl.phone,
            website: ''
        },
        content: {
            subject: tpl.subject,
            message: tpl.message
        },
        updatedAt: Date.now()
    };
    const v2Data = await chrome.storage.local.get(['templates_v2']);
    const v2Store = v2Data.templates_v2 || { version: 2, templates: {}, defaultId: null, recentIds: [] };
    v2Store.templates[tplId] = v2Item;
    if (!v2Store.defaultId) v2Store.defaultId = tplId;
    v2Store.recentIds = [tplId, ...(v2Store.recentIds || []).filter(id => id !== tplId)].slice(0, 6);
    // Dual-write: legacy xpider_recent_templates for compatibility
    const legacyItem = { ...tpl, fileName: result.fileName, filePath: result.filePath, timestamp: new Date().toISOString() };
    const legacyData = await chrome.storage.local.get(['xpider_recent_templates']);
    let recent = (legacyData.xpider_recent_templates || []).filter(t => t.filePath !== result.filePath);
    recent.unshift(legacyItem);
    if (recent.length > 6) recent = recent.slice(0, 6);
    await chrome.storage.local.set({ templates_v2: v2Store, xpider_recent_templates: recent, xpider_tpl: tpl });

    await updateTemplateDropdown();

    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { const t = btn.textContent; btn.textContent = '✅ Saved!'; setTimeout(() => btn.textContent = t, 1800); }
    });
    addLog(`✅ Template saved: ${result.fileName}`, 'success');
}

function buildTemplateFileContent(tpl) {
    return `[XPIDER MESSAGE TEMPLATE]
-----------------------------------------
Full Name:  ${tpl.name || 'N/A'}
First Name: ${tpl.firstName || 'N/A'}
Last Name:  ${tpl.lastName || 'N/A'}
Email:      ${tpl.email || 'N/A'}
Phone:      ${tpl.phone || 'N/A'}
Subject:    ${tpl.subject || 'N/A'}

[MESSAGE BODY]
-----------------------------------------
${tpl.message || ''}
-----------------------------------------
Generated by XPIDER AutoForm Sender Pro
Saved: ${new Date().toLocaleString()}
`;
}

async function addSingleUrl() {
    const input = document.getElementById('manual-url-input');
    if (!input || !input.value.trim()) return;
    
    let url = input.value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    
    try {
        new URL(url); // Validation
        
        // [v1.3.5] Apply Blacklist to manual entries as well
        const lowerUrl = url.toLowerCase();
        const blacklist = window.XPIDER_BLACKLIST || [];
        if (blacklist.some(domain => lowerUrl.includes(domain))) {
            addLog(`⚠️ Blacklisted domain: ${url}`, 'warning');
            input.value = '';
            return;
        }
        
        // Add to ACTIVE queue
        if (!campaignQueue.includes(url)) {
            campaignQueue.push(url);
            totalTargets = campaignQueue.length;
            const countDisplay = document.getElementById('url-count-display');
            if (countDisplay) {
                const lang = document.getElementById('language-select')?.value || 'en';
                const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                const suffix = dict.remaining_suffix || 'URLs';
                countDisplay.textContent = `${totalTargets} ${suffix}`;
            }
            const fileInfo = document.getElementById('file-info');
            if (fileInfo) fileInfo.classList.remove('hidden');

            // Show URLs Preview in UI for manually added items as well
            renderUrlsPreview(campaignQueue);
            
            // Sync active queue to storage so background can access if needed
            chrome.storage.local.set({ 
                xpider_queue: campaignQueue,
                xpider_total: totalTargets
            });
        }
        
        // [v1.2.1] NEW: Save to Permanent "Manual Entries" List
        const lang = document.getElementById('language-select')?.value || 'en';
        const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});
        const manualListName = dict.list_manual_entries || 'Manual Entries';
        
        const storageData = await chrome.storage.local.get(['xpider_saved_lists']);
        let lists = Array.isArray(storageData.xpider_saved_lists) ? storageData.xpider_saved_lists : [];
        
        let manualList = lists.find(l => l.name === manualListName);
        if (!manualList) {
            manualList = { name: manualListName, urls: [], date: new Date().toISOString() };
            lists.unshift(manualList); // Put at top
        }
        
        // Avoid duplicate in the manual list
        if (!manualList.urls.includes(url)) {
            manualList.urls.push(url);
            manualList.date = new Date().toISOString();
        }
        
        await chrome.storage.local.set({ xpider_saved_lists: lists });
        if (typeof updateSavedListsUI === 'function') {
            await updateSavedListsUI();
        }
        
        addLog(`Manual URL saved: ${url}`, 'info');
        input.value = '';
    } catch (e) {
        console.error("[AddSingleUrl Error]", e);
        addLog(`❌ URL Add Error: ${e.message} (${url})`, 'error');
    }
}

async function startCampaign() {
    const manualInput = document.getElementById('manual-url-input');
    if (manualInput && manualInput.value.trim() && campaignQueue.length === 0) {
        await addSingleUrl();
    }

    if (campaignQueue.length === 0) return alert("Please upload a file or enter a URL first.");

    currentTpl = {
        firstName: document.getElementById('tpl-first-name')?.value || '',
        lastName: document.getElementById('tpl-last-name')?.value || '',
        name: document.getElementById('tpl-name')?.value || '',
        email: document.getElementById('tpl-email')?.value || '',
        phone: document.getElementById('tpl-phone')?.value || '',
        subject: document.getElementById('tpl-subject')?.value || '',
        message: document.getElementById('tpl-message')?.value || ''
    };

    if (!currentTpl.message) return alert("Please enter a message body.");

    // [Phase 2B Component D / R1] Authoritatively bind template metadata to execution state & payload
    bindCampaignTemplateMetadata(currentTpl);
    currentTpl.id = currentTpl.templateId;
    currentTpl.version = currentTpl.templateVersion;

    // UI state: STARTING (Do NOT set campaignActive=true yet!)
    campaignPaused = false;
    successCount = 0;
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = "⏳ Starting...";
    }

    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    
    const levelCollect = parseInt(delayCollectInput ? delayCollectInput.value : 6);
    const levelFill = parseInt(delayFillInput ? delayFillInput.value : 6);
    const levelSubmit = parseInt(delaySubmitInput ? delaySubmitInput.value : 6);
    
    const levelToCollectMs = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
    const levelToFillMs = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
    const levelToSubmitMs = [5000, 4000, 3000, 2500, 2000, 1800, 1500, 1000, 700, 500];
    
    const delayMs = levelToCollectMs[levelCollect] || 10000;
    const fillDelayMs = levelToFillMs[levelFill] || 300;
    const submitDelayMs = levelToSubmitMs[levelSubmit] || 1500;

    // [v4.15.0] 폼 자동 입력 방식 획득 및 동기화 저장
    const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
    const fillMode = fillModeEl ? fillModeEl.value : 'instant';
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ xpider_fill_mode: fillMode });
    }

    const skipAttemptedEl = document.getElementById('skip-attempted-toggle');
    const skipPreviouslyAttempted = skipAttemptedEl ? skipAttemptedEl.checked : true;

    const startPayload = {
        queue: campaignQueue,
        template: currentTpl,
        delayMs,
        fillDelayMs,
        submitDelayMs,
        fillMode,
        templateId: currentTpl.templateId || 'default',
        templateVersion: currentTpl.templateVersion || 1,
        skipPreviouslyAttempted
    };
    bindCampaignTemplateMetadata(startPayload, currentTpl);

    // Hide resumable banner if starting a fresh campaign
    const banner = document.getElementById('resumable-campaign-banner');
    if (banner) banner.style.display = 'none';

    // [v20.0 Chrome Runtime Transport] Dispatch START_CAMPAIGN directly to background service worker
    addLog("[Engine] START_CAMPAIGN request sent", "info");
    const sendTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    addDiagnosticLog(`[Engine][TX] action=START_CAMPAIGN queue=${startPayload.queue.length} templateId=${startPayload.templateId} v=${startPayload.templateVersion} skipAttempted=${skipPreviouslyAttempted}`);

    function _restoreStartButton() {
        campaignActive = false;
        if (startBtn) {
            startBtn.classList.remove('hidden');
            startBtn.disabled = false;
            startBtn.textContent = "🚀 START SENDING";
        }
        const multiActions = document.getElementById('multi-actions');
        if (multiActions) multiActions.classList.add('hidden');
    }

    return new Promise((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            const err = new Error("Chrome runtime messaging is not available");
            _restoreStartButton();
            addLog(`❌ [Fatal Error] ${err.message}`, "error");
            return reject(err);
        }

        chrome.runtime.sendMessage({
            action: 'START_CAMPAIGN',
            queue: startPayload.queue,
            template: startPayload.template,
            delayMs: startPayload.delayMs,
            fillDelayMs: startPayload.fillDelayMs,
            submitDelayMs: startPayload.submitDelayMs,
            fillMode: startPayload.fillMode,
            templateId: startPayload.templateId,
            templateVersion: startPayload.templateVersion,
            skipPreviouslyAttempted: startPayload.skipPreviouslyAttempted
        }, (response) => {
            const ackTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsedAckMs = Math.round(ackTime - sendTime);

            if (chrome.runtime.lastError) {
                const err = new Error(chrome.runtime.lastError.message || "Failed to contact background engine");
                _restoreStartButton();
                addDiagnosticLog(`[Engine][RX_FAIL][+${elapsedAckMs}ms] error=${err.message}`, "ERROR");
                addLog(`❌ [Background Engine] Start failed: ${err.message}`, "error");
                return reject(err);
            }

            if (!response || response.success === false) {
                const errMsg = (response && response.error) || "Start rejected by background engine";
                const err = new Error(errMsg);
                _restoreStartButton();
                addDiagnosticLog(`[Engine][RX_REJECT][+${elapsedAckMs}ms] error=${errMsg}`, "ERROR");
                addLog(`❌ [Background Engine] Start failed: ${errMsg}`, "error");
                return reject(err);
            }

            // SUCCESS ACK: Now transition UI state to active
            campaignActive = true;
            addDiagnosticLog(`[Engine][ACK][+${elapsedAckMs}ms] status=${response.status || 'acknowledged'}`);
            addLog(`[Engine] ACK received in ${elapsedAckMs} ms`, "success");
            addLog("✅ [Background Engine] Campaign started!", "success");

            // Show active controls
            const statusBox = document.getElementById('status-box');
            if (statusBox) statusBox.classList.remove('hidden');
            const multiActions = document.getElementById('multi-actions');
            if (multiActions) multiActions.classList.remove('hidden');
            if (startBtn) {
                startBtn.classList.add('hidden');
                startBtn.disabled = false;
                startBtn.textContent = "🚀 START SENDING";
            }
            updateRealTimeStatus({ successCount: 0, remainingCount: campaignQueue.length });
            updateProgress(0);

            // Post-ACK GET_STATE verification
            chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
                if (stateResp && stateResp.success) {
                    const qCount = stateResp.remainingCount !== undefined ? stateResp.remainingCount : campaignQueue.length;
                    addLog(`[Engine] Background state: active=${stateResp.isActive}, queue=${qCount}`, "info");
                    addDiagnosticLog(`[Engine][VERIFY] active=${stateResp.isActive} queue=${qCount}`);
                }
            });

            resolve(response);
        });
    });
}

function togglePause() {
    campaignPaused = !campaignPaused;
    const btn = document.getElementById('pause-btn');
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};

    const extAction = campaignPaused ? 'PAUSE_CAMPAIGN' : 'RESUME_CAMPAIGN';
    addDiagnosticLog(`[Engine][TX] action=${extAction}`);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: extAction }).catch(e => console.error('[Pause Ext Error]', e));
    }

    if (btn) {
        btn.textContent = campaignPaused ? (dict.btn_resume || "▶️ Resume") : (dict.btn_pause || "⏸️ Pause");
        btn.style.backgroundColor = campaignPaused ? "#22c55e" : "#f59e0b";
    }
    refreshStatusDetailUI();
}

function stopCampaign() {
    campaignActive = false;
    campaignPaused = false;
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.remove('hidden');
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    addDiagnosticLog(`[Engine][TX] action=STOP_CAMPAIGN`);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'STOP_CAMPAIGN' }, () => {
            checkResumableCheckpoint();
        });
    }
    addLog("Campaign stopped by user.", "stop");
}

function stopAndSaveCampaign() {
    return stopCampaign();
}

function endCampaign() {
    campaignActive = false;
    campaignPaused = false;
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.remove('hidden');
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    const banner = document.getElementById('resumable-campaign-banner');
    if (banner) banner.style.display = 'none';
    addDiagnosticLog(`[Engine][TX] action=END_CAMPAIGN`);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'END_CAMPAIGN' }, () => {
            checkResumableCheckpoint();
        });
    }
    addLog("🛑 Campaign ended. Remaining queue discarded.", "stop");
}

function resumeCampaign() {
    addDiagnosticLog(`[Engine][TX] action=RESUME_CAMPAIGN`);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'RESUME_CAMPAIGN' }, (res) => {
            if (res && res.success) {
                campaignActive = true;
                campaignPaused = false;
                const banner = document.getElementById('resumable-campaign-banner');
                if (banner) banner.style.display = 'none';
                const startBtn = document.getElementById('start-btn');
                if (startBtn) startBtn.classList.add('hidden');
                const multiActions = document.getElementById('multi-actions');
                if (multiActions) multiActions.classList.remove('hidden');
                const statusBox = document.getElementById('status-box');
                if (statusBox) statusBox.classList.remove('hidden');
                addLog(`▶️ Campaign resumed (${res.remainingCount} remaining).`, "start");
            } else {
                addLog(`❌ Resume failed: ${res?.error || 'Unknown error'}`, "error");
            }
        });
    }
}

function discardCheckpoint() {
    endCampaign();
}

function checkResumableCheckpoint() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
        const banner = document.getElementById('resumable-campaign-banner');
        const countEl = document.getElementById('resumable-remaining-count');
        if (!banner) return;
        if (stateResp && stateResp.hasPausedCheckpoint && !stateResp.isActive) {
            banner.style.display = 'block';
            if (countEl) countEl.textContent = stateResp.pausedRemainingCount || 0;
        } else {
            banner.style.display = 'none';
        }
    });
}

// processNext in popup is now obsolete as background handles routing
// But we keep it as a fallback or for UI-only updates if needed
async function processNext() {
    console.log("processNext called in popup (Ignored - background handling it)");
}

// [v18.21.5] Pulse Check: Monitor background engine health in real-time
function startPulseCheck() {
    setInterval(() => {
        chrome.runtime.sendMessage({ action: 'PING' }, (response) => {
            const indicator = document.getElementById('engine-status-indicator');
            if (!indicator) return;

            if (chrome.runtime.lastError || !response || !response.success) {
                indicator.textContent = "⚠️ Engine Disconnected";
                indicator.style.color = "#ef4444";
            } else {
                indicator.textContent = "✅ Engine Alive";
                indicator.style.color = "#22c55e";
            }
        });
        checkResumableCheckpoint();
    }, 2000);
}

function finishCampaign() {
    campaignActive = false;
    addLog("Campaign finished!", "complete");
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.remove('hidden');
    
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    
    chrome.storage.local.remove(['xpider_queue', 'xpider_success', 'xpider_total']);
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
    
    const text = document.getElementById('progress-text');
    if (text) {
        text.textContent = `${percent}%`;
        text.style.fontSize = '0.9rem'; // Smaller font as requested
    }
}

let localLogQueue = [];
let localLogSaveTimer = null;

function saveBlackBoxLog(message, type, timestamp) {
    localLogQueue.push({ message, type, timestamp });
    if (localLogQueue.length > 150) localLogQueue.shift();

    const isCritical = ['start', 'stop', 'complete', 'error', 'success'].includes(type);

    const saveBatch = () => {
        try {
            chrome.storage.local.get(['xpider_blackbox_logs'], (data) => {
                const logs = data.xpider_blackbox_logs || [];
                const combined = [...logs, ...localLogQueue].slice(-300); // Max 300 logs
                chrome.storage.local.set({ xpider_blackbox_logs: combined });
                localLogQueue = [];
            });
        } catch (e) {
            console.error('[BlackBox Save Error]', e);
        }
    };

    if (isCritical) {
        if (localLogSaveTimer) clearTimeout(localLogSaveTimer);
        saveBatch();
    } else {
        if (localLogSaveTimer) clearTimeout(localLogSaveTimer);
        localLogSaveTimer = setTimeout(saveBatch, 1500);
    }
}

function addLog(msg, type = 'info', forcedTime = null) {
    const container = document.getElementById('log-container');
    if (!container) return;

    // [v2.5.5] Update real-time status summary
    const techKeywords = ['Precision targeting', 'Pre-scan', 'Sniper Mode', 'Target lost', 'Processing:', 'Opening target'];
    const isTechLog = techKeywords.some(k => msg.includes(k)) && !msg.includes('Skipping') && !msg.includes('error');
    
    if (!isTechLog) {
        lastLogMessage = msg.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        refreshStatusDetailUI();
    }

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const time = forcedTime || new Date().toLocaleTimeString('ko-KR', { hour12: false });
    
    // [v1.3.8] Premium Color Set for High Visibility
    let color = '#ccc';
    if (type === 'success') color = '#22c55e'; // Bright Green
    if (type === 'error') color = '#ef4444';   // Bright Red
    if (type === 'start') color = '#facc15';   // XSpider Yellow
    if (type === 'visit') color = '#ffffff';   // Pure White for "Processing:"
    if (type === 'info') color = '#60a5fa';    // Soft Blue
    if (type === 'mapping') color = '#a855f7'; // Purple for mapping steps
    if (type === 'debug') color = '#52525b';   // Darker gray for debug/tech logs

    logEntry.style.color = color;
    logEntry.style.fontWeight = (type === 'visit' || type === 'success') ? 'bold' : 'normal';
    logEntry.style.marginBottom = '2px';
    logEntry.style.fontSize = type === 'debug' ? '0.75rem' : '0.85rem';
    logEntry.innerHTML = `<span class="log-time" style="color: #666; font-size: 0.7rem;">[${time}]</span> ${msg}`;
    
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;

    // Persist real-time logs to chrome storage blackbox
    if (!forcedTime) {
        saveBlackBoxLog(msg, type, time);
    }
}

async function saveTemplate() {
    const tpl = {
        firstName: document.getElementById('tpl-first-name')?.value || '',
        lastName:  document.getElementById('tpl-last-name')?.value || '',
        name:      document.getElementById('tpl-name')?.value || '',
        email:     document.getElementById('tpl-email')?.value || '',
        phone:     document.getElementById('tpl-phone')?.value || '',
        subject:   document.getElementById('tpl-subject')?.value || '',
        message:   document.getElementById('tpl-message')?.value || ''
    };
    // [F9 Unified Schema] Canonical FormTemplateV2 record with both flat and nested properties
    const fullName = tpl.name || `${tpl.firstName} ${tpl.lastName}`.trim();
    const canonicalTpl = {
        ...tpl,
        fullName: fullName,
        sender: {
            fullName: fullName,
            firstName: tpl.firstName,
            lastName: tpl.lastName,
            company: '',
            email: tpl.email,
            phone: tpl.phone,
            website: ''
        },
        content: {
            subject: tpl.subject,
            message: tpl.message
        },
        updatedAt: Date.now()
    };
    // [F9] templates_v2 is the primary authoritative store — await its completion; propagate errors
    await _syncTemplateToV2(canonicalTpl);
    // Legacy compatibility update ONLY after authoritative v2 write succeeds
    await chrome.storage.local.set({ xpider_tpl: tpl });
    return canonicalTpl;
}

// [F9] Sync a template object into templates_v2 default slot (propagates persistence errors)
async function _syncTemplateToV2(tpl) {
    const data = await chrome.storage.local.get(['templates_v2']);
    const store = data.templates_v2 || { version: 2, templates: {}, defaultId: null, recentIds: [] };
    const id = store.defaultId || 'default';
    const fullName = tpl.name || tpl.fullName || `${tpl.firstName || ''} ${tpl.lastName || ''}`.trim();
    const updatedTpl = {
        ...tpl,
        id,
        fullName,
        sender: tpl.sender || {
            fullName,
            firstName: tpl.firstName || '',
            lastName: tpl.lastName || '',
            company: tpl.company || '',
            email: tpl.email || '',
            phone: tpl.phone || '',
            website: tpl.website || ''
        },
        content: tpl.content || {
            subject: tpl.subject || '',
            message: tpl.message || ''
        },
        updatedAt: Date.now()
    };
    store.templates[id] = updatedTpl;
    store.defaultId = id;
    if (!store.recentIds) store.recentIds = [];
    if (!store.recentIds.includes(id)) store.recentIds.unshift(id);
    await chrome.storage.local.set({ templates_v2: store });
    return updatedTpl;
}

// [v18.10.0] Diagnostic Recovery: Load persistent logs from storage
async function loadBlackBoxLogs() {
    const data = await chrome.storage.local.get(['xpider_blackbox_logs']);
    const logs = data.xpider_blackbox_logs || [];
    
    const container = document.getElementById('log-container');
    if (!container || logs.length === 0) return;

    // Clear and re-populate to avoid duplicate confusion on refresh
    container.innerHTML = '';
    
    logs.forEach(log => {
        addLog(log.message, log.type, log.timestamp || "Past");
    });
    
    addLog("--- Persistent Session Restored ---", "info");
}

// [v1.7.0] Advanced Template Library Logic
async function saveTemplateToLibrary() {
    await saveTemplateChanges();
}

// =========================================================================
// Phase 2B: Module Store Adapters & Controller Methods
// =========================================================================

let _templateStoreInstance = null;
let _historyStoreInstance = null;

function getPopupTemplateStore() {
    if (!_templateStoreInstance) {
        const TS = (typeof TemplateStore !== 'undefined') ? TemplateStore : (typeof require !== 'undefined' ? require('./modules/template-store.js').TemplateStore : null);
        if (TS) {
            _templateStoreInstance = new TS(typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
        }
    }
    return _templateStoreInstance;
}

function getPopupHistoryStore() {
    if (!_historyStoreInstance) {
        const HS = (typeof HistoryStore !== 'undefined') ? HistoryStore : (typeof require !== 'undefined' ? require('./modules/history-store.js').HistoryStore : null);
        if (HS) {
            _historyStoreInstance = new HS(typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
        }
    }
    return _historyStoreInstance;
}

// Ledger State
let ledgerState = {
    filter: 'ALL',
    search: '',
    page: 1,
    limit: 50,
    selectedTargets: new Set()
};

/**
 * Phase 2B (Component A): Create a new blank template and persist to TemplateStore
 */
async function handleCreateNewTemplate(initialName = 'New Template') {
    const tStore = getPopupTemplateStore();
    const newTplData = {
        name: initialName,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        subject: initialName,
        message: ''
    };
    let saved;
    if (tStore) {
        saved = await tStore.saveTemplateRecord(newTplData);
    } else {
        saved = await saveTemplate();
    }
    populateFormFromTemplate(saved);
    await updateTemplateDropdown(saved.id);
    addLog(`➕ Created new template: ${saved.subject || saved.name}`, 'success');
    return saved;
}

/**
 * Phase 2B (Component A): Authoritatively save current form fields into the active template
 */
async function handleSaveTemplate(tplData = null) {
    const select = document.getElementById('tpl-library-select');
    const activeId = (select && select.value && select.value !== 'default') ? select.value : null;

    const data = tplData || {
        id: activeId || undefined,
        firstName: document.getElementById('tpl-first-name')?.value || '',
        lastName: document.getElementById('tpl-last-name')?.value || '',
        name: document.getElementById('tpl-name')?.value || '',
        email: document.getElementById('tpl-email')?.value || '',
        phone: document.getElementById('tpl-phone')?.value || '',
        subject: document.getElementById('tpl-subject')?.value || '',
        message: document.getElementById('tpl-message')?.value || ''
    };

    const tStore = getPopupTemplateStore();
    let saved;
    if (tStore) {
        saved = await tStore.saveTemplateRecord(data);
    } else {
        saved = await saveTemplate();
    }

    await updateTemplateDropdown(saved.id);
    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Saved!';
            setTimeout(() => { btn.textContent = originalText; }, 1800);
        }
    });
    addLog(`💾 Template saved: ${saved.subject || saved.name}`, 'success');
    return saved;
}

/**
 * Phase 2B (Component A): Duplicate the selected template with [Copy] suffix
 */
async function handleDuplicateTemplate(templateId = null) {
    const select = document.getElementById('tpl-library-select');
    const idToClone = templateId || (select && select.value) || null;
    if (!idToClone) throw new Error("No template selected to duplicate");

    const tStore = getPopupTemplateStore();
    if (!tStore) throw new Error("TemplateStore unavailable");

    const duplicated = await tStore.duplicateAndSaveTemplate(idToClone);
    populateFormFromTemplate(duplicated);
    await updateTemplateDropdown(duplicated.id);
    addLog(`📋 Duplicated template: ${duplicated.subject || duplicated.name}`, 'success');
    return duplicated;
}

/**
 * Phase 2B (Component A): Delete the selected non-default template
 */
async function handleDeleteTemplate(templateId = null) {
    const select = document.getElementById('tpl-library-select');
    const idToDelete = templateId || (select && select.value) || null;
    if (!idToDelete) throw new Error("No template selected to delete");

    const tStore = getPopupTemplateStore();
    if (!tStore) throw new Error("TemplateStore unavailable");

    const store = await tStore.getStore();
    if (store && store.defaultId === idToDelete) {
        throw new Error("Cannot delete the default template. Set another template as default first.");
    }

    const result = await tStore.deleteTemplate(idToDelete);
    await updateTemplateDropdown(result.defaultId);
    if (result.defaultId) {
        const nextDefault = await tStore.getTemplate(result.defaultId);
        if (nextDefault) populateFormFromTemplate(nextDefault);
    }
    addLog(`🗑️ Deleted template: ${idToDelete}`, 'info');
    return result;
}

/**
 * Phase 2B (Component A): Set active template as defaultId and sync legacy xpider_tpl
 */
async function handleSetDefaultTemplate(templateId = null) {
    const select = document.getElementById('tpl-library-select');
    const idToDefault = templateId || (select && select.value) || null;
    if (!idToDefault) throw new Error("No template selected to set as default");

    const tStore = getPopupTemplateStore();
    if (!tStore) throw new Error("TemplateStore unavailable");

    const updated = await tStore.setDefaultTemplate(idToDefault);
    await updateTemplateDropdown(idToDefault);
    addLog(`⭐ Set default template: ${updated.subject || updated.name}`, 'success');
    return updated;
}

/**
 * Dual accessors: populate DOM form inputs from template object
 */
function populateFormFromTemplate(tpl) {
    if (!tpl) return null;
    const firstName = tpl.firstName || (tpl.sender && tpl.sender.firstName) || '';
    const lastName  = tpl.lastName  || (tpl.sender && tpl.sender.lastName)  || '';
    const name      = tpl.name      || tpl.fullName || (tpl.sender && (tpl.sender.fullName || tpl.sender.name)) || '';
    const email     = tpl.email     || (tpl.sender && tpl.sender.email)     || '';
    const phone     = tpl.phone     || (tpl.sender && tpl.sender.phone)     || '';
    const subject   = tpl.subject   || (tpl.content && tpl.content.subject) || '';
    const message   = tpl.message   || (tpl.content && tpl.content.message) || '';

    const elFn = document.getElementById('tpl-first-name'); if (elFn) elFn.value = firstName;
    const elLn = document.getElementById('tpl-last-name');  if (elLn) elLn.value = lastName;
    const elNm = document.getElementById('tpl-name');       if (elNm) elNm.value = name;
    const elEm = document.getElementById('tpl-email');      if (elEm) elEm.value = email;
    const elPh = document.getElementById('tpl-phone');      if (elPh) elPh.value = phone;
    const elSb = document.getElementById('tpl-subject');    if (elSb) elSb.value = subject;
    const elMs = document.getElementById('tpl-message');    if (elMs) elMs.value = message;

    return { firstName, lastName, name, email, phone, subject, message };
}

/**
 * [F9 & Phase 2B] Update template selector dropdown with full list of templates
 */
async function updateTemplateDropdown(selectId = null) {
    const select = document.getElementById('tpl-library-select');
    if (!select) return;

    const tStore = getPopupTemplateStore();
    let templates = [];
    let defaultId = null;

    if (tStore) {
        const all = await tStore.getAllTemplates();
        templates = all.templates;
        defaultId = all.defaultId;
    } else {
        const data = await chrome.storage.local.get(['templates_v2', 'xpider_recent_templates']);
        const v2Store = data.templates_v2;
        if (v2Store && v2Store.templates) {
            templates = Object.values(v2Store.templates);
            defaultId = v2Store.defaultId;
        } else {
            templates = (data.xpider_recent_templates || []).slice(0, 6);
        }
    }

    select.innerHTML = '';
    if (templates.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'default';
        opt.textContent = 'Default Template';
        select.appendChild(opt);
        return;
    }

    const targetSelectId = selectId || defaultId || templates[0].id;

    templates.forEach((tpl, idx) => {
        const opt = document.createElement('option');
        const id = tpl.id || String(idx);
        opt.value = id;
        opt.dataset.tplId = id;
        opt.dataset.tplVersion = String(tpl.version || 1);
        const isDef = (id === defaultId);
        const label = tpl.subject || tpl.name || `Template ${idx + 1}`;
        opt.textContent = `${isDef ? '⭐ ' : ''}${label}${isDef ? ' (Default)' : ''}`;
        if (id === targetSelectId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

/**
 * [F9 & Phase 2B] Load selected template from dropdown into the form
 */
async function loadTemplateFromLibrary() {
    const select = document.getElementById('tpl-library-select');
    const selectedOpt = select?.options[select.selectedIndex];
    if (!selectedOpt || selectedOpt.disabled) return;

    const tplId = selectedOpt.dataset.tplId || selectedOpt.value;
    const tStore = getPopupTemplateStore();
    let tpl = null;

    if (tStore) {
        tpl = await tStore.getTemplate(tplId);
    } else {
        const data = await chrome.storage.local.get(['templates_v2', 'xpider_recent_templates']);
        if (tplId && data.templates_v2?.templates?.[tplId]) {
            tpl = data.templates_v2.templates[tplId];
        } else {
            const idx = parseInt(selectedOpt.value);
            tpl = (data.xpider_recent_templates || [])[idx] || null;
        }
    }

    if (tpl) {
        populateFormFromTemplate(tpl);
        addLog(`📂 Loaded template: ${tpl.subject || tpl.name || 'Template'}`, 'info');
    }
}

// =========================================================================
// Phase 2B (Component B & C): History Ledger, Filtering & Reset Controls
// =========================================================================

/**
 * Query ledger records with filtering, searching, and pagination
 */
async function filterHistoryRecords(options = {}) {
    const hs = getPopupHistoryStore();
    if (!hs) return { totalCount: 0, offset: 0, limit: 50, records: [] };
    await hs.load();
    const filter = options.status !== undefined ? options.status : ledgerState.filter;
    const search = options.search !== undefined ? options.search : ledgerState.search;
    const limit = options.limit !== undefined ? options.limit : ledgerState.limit;
    const offset = options.offset !== undefined ? options.offset : ((ledgerState.page - 1) * limit);

    return hs.getFilteredRecords({ status: filter, search, limit, offset });
}

/**
 * Render the History & Audit Ledger Dashboard in Popup
 */
async function renderLedgerUI() {
    const hs = getPopupHistoryStore();
    if (!hs) return;
    await hs.load();

    // Summary stats
    const allRecordsResult = hs.getFilteredRecords({ status: 'ALL', search: '', limit: 10000 });
    const allRecords = allRecordsResult.records;

    const totalCount = allRecords.length;
    const successCount = allRecords.filter(r => r.status === 'CONFIRMED_SUCCESS').length;
    const suppressedCount = allRecords.filter(r => r.isSuppressed).length;
    const unknownCount = allRecords.filter(r => r.status === 'DELIVERY_UNKNOWN').length;
    const failedCount = allRecords.filter(r => r.status === 'FAILURE').length;

    const elTot = document.getElementById('stat-ledger-total'); if (elTot) elTot.textContent = totalCount;
    const elSuc = document.getElementById('stat-ledger-success'); if (elSuc) elSuc.textContent = successCount;
    const elSup = document.getElementById('stat-ledger-suppressed'); if (elSup) elSup.textContent = suppressedCount;
    const elUnk = document.getElementById('stat-ledger-unknown'); if (elUnk) elUnk.textContent = unknownCount;
    const elFld = document.getElementById('stat-ledger-failed'); if (elFld) elFld.textContent = failedCount;

    // Filtered page
    const pageData = await filterHistoryRecords();
    const container = document.getElementById('ledger-list-container');
    if (!container) return;

    container.innerHTML = '';
    if (pageData.records.length === 0) {
        container.innerHTML = '<div class="ledger-empty-note">No ledger entries match the current filter.</div>';
    } else {
        pageData.records.forEach(rec => {
            const card = document.createElement('div');
            card.className = `ledger-item-card ${ledgerState.selectedTargets.has(rec.targetIdentity) ? 'is-selected' : ''}`;
            
            let badgeClass = 'status-ready';
            let badgeLabel = rec.status;
            if (rec.status === 'CONFIRMED_SUCCESS' || rec.status === 'SUCCESS') {
                badgeClass = 'status-success';
                badgeLabel = 'SUCCESS';
            } else if (rec.isSuppressed) {
                badgeClass = 'status-suppressed';
                badgeLabel = 'SUPPRESSED';
            } else if (rec.status === 'DELIVERY_UNKNOWN' || rec.status === 'UNKNOWN') {
                badgeClass = 'status-unknown';
                badgeLabel = 'UNKNOWN';
            } else if (rec.status === 'FAILURE' || rec.status === 'FAILED') {
                badgeClass = 'status-failed';
                badgeLabel = 'FAILED';
            } else if (rec.status === 'PREPARING') {
                badgeClass = 'status-ready';
                badgeLabel = 'PREPARING';
            } else if (rec.status === 'SUBMIT_PENDING') {
                badgeClass = 'status-ready';
                badgeLabel = 'PENDING';
            } else if (rec.status === 'SKIPPED') {
                badgeClass = 'status-suppressed';
                badgeLabel = 'SKIPPED';
            } else if (rec.status === 'INTERRUPTED') {
                badgeClass = 'status-unknown';
                badgeLabel = 'INTERRUPTED';
            } else if (rec.status === 'INVALID_INPUT' || rec.status === 'INVALID') {
                badgeClass = 'status-invalid';
                badgeLabel = 'INVALID';
            }

            const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString() : '';
            const checked = ledgerState.selectedTargets.has(rec.targetIdentity) ? 'checked' : '';

            // Section J: Format shortened display for Source and Contact URLs
            const sourceUrl = rec.sourceUrl || rec.rawUrl || rec.targetIdentity || '';
            const contactUrl = rec.contactPageUrl || rec.selectedCandidateUrl || '';

            const formatShortUrl = (urlStr) => {
                if (!urlStr) return '-';
                try {
                    const u = new URL(urlStr);
                    let display = u.hostname + (u.pathname !== '/' ? u.pathname : '');
                    if (display.length > 34) display = display.substring(0, 31) + '...';
                    return display;
                } catch (_) {
                    return urlStr.length > 34 ? urlStr.substring(0, 31) + '...' : urlStr;
                }
            };

            const sourceDisplay = formatShortUrl(sourceUrl);
            const contactDisplay = contactUrl ? formatShortUrl(contactUrl) : 'Not verified';
            const contactElement = contactUrl 
                ? `<a href="${contactUrl}" target="_blank" rel="noopener noreferrer" class="ledger-contact-link" style="color: #38bdf8; text-decoration: underline;" title="${contactUrl}">📍 ${contactDisplay}</a>`
                : `<span style="color: #64748b;">Not verified</span>`;

            card.innerHTML = `
                <div class="ledger-item-top">
                    <div class="ledger-item-left">
                        <input type="checkbox" class="ledger-item-cb" data-target="${rec.targetIdentity || ''}" ${checked}>
                        <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="ledger-item-domain ledger-link" style="color: #60a5fa; text-decoration: underline;" title="${sourceUrl}">🌐 ${sourceDisplay}</a>
                    </div>
                    <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="ledger-item-sublinks" style="display: flex; gap: 8px; font-size: 11px; margin: 3px 0 3px 22px;">
                    <span style="color: #94a3b8;">Contact:</span>
                    ${contactElement}
                    ${rec.emailsFound ? `<span style="color: #4ade80;">📧 ${rec.emailsFound} emails</span>` : ''}
                </div>
                <div class="ledger-item-meta">
                    <span class="ledger-item-row-idx">Row #${rec.sourceRowId} · Gen ${rec.generationId || 1}</span>
                    <span class="ledger-item-reason" title="${rec.reasonCode}">${rec.reasonCode}</span>
                    <span>${timeStr}</span>
                </div>
            `;
            container.appendChild(card);
        });

        // Bind checkbox clicks
        container.querySelectorAll('.ledger-item-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const tgt = e.target.dataset.target;
                if (e.target.checked) {
                    ledgerState.selectedTargets.add(tgt);
                } else {
                    ledgerState.selectedTargets.delete(tgt);
                }
                updateSelectionCountUI();
                e.target.closest('.ledger-item-card')?.classList.toggle('is-selected', e.target.checked);
            });
        });
    }

    // Pagination info
    const totalPages = Math.ceil(pageData.totalCount / ledgerState.limit) || 1;
    const pageInfo = document.getElementById('ledger-page-info');
    if (pageInfo) pageInfo.textContent = `Page ${ledgerState.page} / ${totalPages} (${pageData.totalCount} items)`;

    const prevBtn = document.getElementById('ledger-prev-btn');
    if (prevBtn) prevBtn.disabled = (ledgerState.page <= 1);

    const nextBtn = document.getElementById('ledger-next-btn');
    if (nextBtn) nextBtn.disabled = (ledgerState.page >= totalPages);

    updateSelectionCountUI();
}

function updateSelectionCountUI() {
    const el = document.getElementById('ledger-selection-count');
    if (el) el.textContent = `${ledgerState.selectedTargets.size} selected`;
}

/**
 * Phase 2B (Component C / R1): Authoritatively query active submit lock from in-memory flag,
 * chrome.storage.local (xpider_currentAttempt), and background campaignState (GET_STATE).
 */
async function checkActiveSubmitLock() {
    if (typeof campaignActive !== 'undefined' && campaignActive) {
        return true;
    }
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const data = await new Promise((resolve) => {
                chrome.storage.local.get(['xpider_currentAttempt'], (items) => {
                    resolve(items || {});
                });
            });
            if (data && data.xpider_currentAttempt && data.xpider_currentAttempt.status === 'SUBMIT_PENDING') {
                return true;
            }
        }
    } catch (_) {}

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            const state = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
                    resolve(res);
                });
            });
            if (state && (state.hasActiveLock || (state.currentAttempt && state.currentAttempt.status === 'SUBMIT_PENDING') || state.isActive)) {
                return true;
            }
        }
    } catch (_) {}

    return false;
}

/**
 * Phase 2B (Component C): Selective Reset of checked target suppressions
 */
async function dispatchSelectiveReset(targetIdentities = [], activeSubmitCount = 0) {
    const isLocked = (activeSubmitCount > 0) || await checkActiveSubmitLock();
    if (isLocked) {
        throw new Error("RESET_LOCKED_ACTIVE_SUBMISSION: Active submission in flight.");
    }
    const list = (Array.isArray(targetIdentities) && targetIdentities.length > 0)
        ? targetIdentities
        : Array.from(ledgerState.selectedTargets);
    if (list.length === 0) {
        throw new Error("NO_TARGETS_SELECTED: Please select at least one target to reset.");
    }

    const hs = getPopupHistoryStore();
    let result;
    if (hs) {
        await hs.load();
        result = await hs.applySelectiveReset(list);
    } else {
        result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'SELECTED', targetIdentities: list }, (res) => {
                if (res && res.success) resolve(res);
                else reject(new Error(res?.error || 'Selective reset failed'));
            });
        });
    }

    ledgerState.selectedTargets.clear();
    await renderLedgerUI();
    addLog(`🎯 Selective reset applied for ${result.affectedCount} target(s)`, 'success');
    return result;
}

/**
 * Phase 2B (Correction 1): Query retryable failed targets and place into execution queue
 * Does NOT mutate suppression state or generation.
 */
async function dispatchRetryFailed() {
    const hs = getPopupHistoryStore();
    if (!hs) throw new Error("HistoryStore unavailable");
    await hs.load();

    const retryableIdentities = hs.getRetryableFailedIdentities();
    let newlyQueued = 0;
    for (const id of retryableIdentities) {
        if (!campaignQueue.includes(id)) {
            campaignQueue.push(id);
            newlyQueued++;
        }
    }
    totalTargets = campaignQueue.length;
    remainingTargets = campaignQueue.length;

    // Update count display
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) {
        countDisplay.textContent = `${campaignQueue.length} URLs queued`;
    }
    updateRealTimeStatus({ remainingCount: campaignQueue.length, totalTargets: campaignQueue.length });

    addLog(`⚡ Queued ${newlyQueued} failed target(s) for retry without mutating suppression`, 'success');
    return {
        retryableCount: retryableIdentities.length,
        newlyQueued,
        queueTotal: campaignQueue.length,
        identities: retryableIdentities
    };
}

/**
 * Phase 2B (Component C): Global Campaign Reset (advances generation, releases all suppression)
 */
async function dispatchGlobalReset(activeSubmitCount = 0) {
    const isLocked = (activeSubmitCount > 0) || await checkActiveSubmitLock();
    if (isLocked) {
        throw new Error("RESET_LOCKED_ACTIVE_SUBMISSION: Active submission in flight.");
    }

    const hs = getPopupHistoryStore();
    let result;
    if (hs) {
        await hs.load();
        result = await hs.applyGlobalReset(activeSubmitCount);
    } else {
        result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'ALL' }, (res) => {
                if (res && res.success) resolve(res);
                else reject(new Error(res?.error || 'Global reset failed'));
            });
        });
    }

    ledgerState.selectedTargets.clear();
    await renderLedgerUI();
    addLog(`🔄 Global campaign reset applied. Generation: ${result.newGeneration}`, 'success');
    return result;
}

/**
 * [Issue #6 R4.1] Authoritatively clear History & Ledger to 0 rows
 */
async function dispatchClearHistoryLedger() {
    const isLocked = await checkActiveSubmitLock();
    if (isLocked) {
        throw new Error("RESET_LOCKED_ACTIVE_SUBMISSION: Active submission in flight.");
    }
    const hs = getPopupHistoryStore();
    if (hs && typeof hs.clearAll === 'function') {
        await hs.clearAll();
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await new Promise(r => chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY_LEDGER' }, r));
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.history);
    }
    ledgerState.selectedTargets.clear();
    ledgerState.page = 1;
    await renderLedgerUI();
    ['stat-ledger-total', 'stat-ledger-success', 'stat-ledger-suppressed', 'stat-ledger-unknown', 'stat-ledger-failed'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    addLog("History and audit ledger cleared to 0 rows.", "stop");
    return { success: true };
}

/**
 * [Issue #6 R4.1] Authoritative Atomic Reset of All 4 Accumulated List Stores
 */
async function dispatchResetAllListData() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await new Promise(r => chrome.runtime.sendMessage({ action: 'RESET_ALL_LIST_DATA' }, r));
    }

    campaignQueue = [];
    totalTargets = 0;
    successCount = 0;
    remainingTargets = 0;
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.add('hidden');
    const previewList = document.getElementById('file-urls-preview');
    if (previewList) previewList.classList.add('hidden');
    const previewContainer = document.getElementById('preview-list');
    if (previewContainer) previewContainer.innerHTML = '';
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = 'No file selected';
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = '0 URLs found';
    const resumableBanner = document.getElementById('resumable-campaign-banner');
    if (resumableBanner) resumableBanner.style.display = 'none';

    const hs = getPopupHistoryStore();
    if (hs && typeof hs.clearAll === 'function') {
        await hs.clearAll();
    }
    ledgerState.selectedTargets.clear();
    ledgerState.page = 1;
    await renderLedgerUI();
    ['stat-ledger-total', 'stat-ledger-success', 'stat-ledger-suppressed', 'stat-ledger-unknown', 'stat-ledger-failed'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });

    const emailStore = getEmailCollectorStore();
    if (emailStore && typeof emailStore.clearAll === 'function') {
        await emailStore.clearAll();
    }
    renderEmailCollectorUI();

    diagnosticLogBuffer.length = 0;
    const logContainer = document.getElementById('log-container');
    if (logContainer) logContainer.innerHTML = '';

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const allKeys = [
            ...LIST_DATA_KEYS.autoform,
            ...LIST_DATA_KEYS.history,
            ...LIST_DATA_KEYS.diagnostics,
            ...LIST_DATA_KEYS.emailCollector
        ];
        await chrome.storage.local.remove(allKeys);
    }

    updateRealTimeStatus({ successCount: 0, remainingCount: 0, totalTargets: 0 });
    updateProgress(0);
    ['stat-success-count', 'stat-failed-count', 'stat-completed-count', 'stat-remaining-count', 'success-count-display', 'failed-count-display', 'completed-count-display', 'remaining-count-display'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });

    addLog("Diagnostic log cleared.", "info");
    return { success: true };
}

/**
 * [Issue #6 R4 True Full Reset] Atomically wipe all campaign targets, checkpoints, queues, and history to 0
 */
async function dispatchFullCampaignReset() {
    return dispatchResetAllListData();
}

/**
 * [Section K] Trigger Google Sheets RFC-4180 CSV export download
 */
async function triggerGoogleSheetsCsvExport({ exportCurrentFilter = false } = {}) {
    const hs = getPopupHistoryStore();
    let csv = '';
    let exportRecords = null;

    if (exportCurrentFilter && hs) {
        await hs.load();
        const fullFiltered = hs.getFilteredRecords({
            status: ledgerState.filter,
            search: ledgerState.search,
            limit: 100000,
            offset: 0
        });
        exportRecords = fullFiltered.records;
    }

    if (hs && typeof hs.exportGoogleSheetsCsv === 'function') {
        await hs.load();
        csv = hs.exportGoogleSheetsCsv({ records: exportRecords });
    } else {
        csv = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXPORT_GSHEETS_CSV', options: { records: exportRecords } }, (res) => {
                if (res && res.success && res.csv) resolve(res.csv);
                else reject(new Error(res?.error || 'Failed to generate Google Sheets CSV'));
            });
        });
    }

    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const mode = exportCurrentFilter ? `filter_${ledgerState.filter.toLowerCase()}` : 'all';
        a.download = `xpider_google_sheets_${mode}_${Date.now()}.csv`;
        if (typeof a.click === 'function') {
            a.click();
        }
        URL.revokeObjectURL(url);
        addLog(`📊 Google Sheets CSV (${exportCurrentFilter ? 'Filtered' : 'All'}) exported successfully.`, "success");
    }

    return csv;
}

/**
 * Phase 2B (Component B): Trigger RFC-4180 compliant CSV audit export download
 */
async function triggerCsvExport(options = {}) {
    const hs = getPopupHistoryStore();
    let csv = '';
    if (hs) {
        await hs.load();
        csv = hs.exportToCsv(options);
    } else {
        csv = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXPORT_HISTORY_CSV', options }, (res) => {
                if (res && res.success && res.csv) resolve(res.csv);
                else reject(new Error(res?.error || 'Failed to generate CSV'));
            });
        });
    }

    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xpider_audit_ledger_${Date.now()}.csv`;
        if (typeof a.click === 'function') {
            a.click();
        }
        URL.revokeObjectURL(url);
        addLog("📊 CSV Audit Ledger downloaded successfully.", "success");
    }

    return csv;
}

/**
 * Phase 2B (Component D & Correction 2): Bind additive template metadata to execution state
 */
function bindCampaignTemplateMetadata(targetState = {}, selectedTemplate = null) {
    const tpl = selectedTemplate || currentTpl || {};
    const select = document.getElementById('tpl-library-select');
    const selectedOpt = select?.options[select.selectedIndex];

    const templateId = tpl.id || selectedOpt?.dataset?.tplId || selectedOpt?.value || 'default';
    const templateVersion = tpl.version || (selectedOpt?.dataset?.tplVersion ? parseInt(selectedOpt.dataset.tplVersion) : 1);

    targetState.templateId = templateId;
    targetState.templateVersion = templateVersion;
    return targetState;
}

function parseTemplateText(content) {
    if (!content || typeof content !== 'string') {
        return { name: '', firstName: '', lastName: '', email: '', phone: '', subject: '', message: '' };
    }
    const isStructured = content.includes('[XPIDER MESSAGE TEMPLATE]');
    const fields = {
        name: '', firstName: '', lastName: '', email: '', phone: '', subject: '', message: ''
    };
    if (isStructured) {
        const lines = content.split('\n');
        let bodyStarted = false;
        let bodyLines = [];
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.includes('[MESSAGE BODY]')) {
                bodyStarted = true;
                return;
            }
            if (bodyStarted) {
                if (trimmedLine.startsWith('---') && bodyLines.length === 0) return;
                bodyLines.push(line);
                return;
            }
            const matchName = line.match(/Full Name:\s*(.*)/i);
            const matchFirst = line.match(/First Name:\s*(.*)/i);
            const matchLast = line.match(/Last Name:\s*(.*)/i);
            const matchEmail = line.match(/Email:\s*(.*)/i);
            const matchPhone = line.match(/Phone:\s*(.*)/i);
            const matchSubject = line.match(/Subject:\s*(.*)/i);

            if (matchName) fields.name = matchName[1].trim();
            if (matchFirst) fields.firstName = matchFirst[1].trim();
            if (matchLast) fields.lastName = matchLast[1].trim();
            if (matchEmail) fields.email = matchEmail[1].trim();
            if (matchPhone) fields.phone = matchPhone[1].trim();
            if (matchSubject) fields.subject = matchSubject[1].trim();
        });
        let bodyText = bodyLines.join('\n').trim();
        bodyText = bodyText.replace(/---+\s*Generated by XPIDER AutoForm Sender Pro.*/s, '').trim();
        bodyText = bodyText.replace(/---+\s*$/, '').trim();
        fields.message = bodyText;
    } else {
        fields.message = content.trim();
    }
    return fields;
}

// [F9 Unified Schema & Authoritative Persistence]
async function persistImportedTemplate(fields) {
    const fullName = fields.name || `${fields.firstName || ''} ${fields.lastName || ''}`.trim();
    const canonicalTpl = {
        ...fields,
        fullName,
        sender: {
            fullName,
            firstName: fields.firstName || '',
            lastName: fields.lastName || '',
            company: fields.company || '',
            email: fields.email || '',
            phone: fields.phone || '',
            website: fields.website || ''
        },
        content: {
            subject: fields.subject || '',
            message: fields.message || ''
        },
        updatedAt: Date.now()
    };
    // [F9] Authoritative templates_v2 write must be awaited first; propagates error on failure
    await _syncTemplateToV2(canonicalTpl);
    // Legacy compatibility update ONLY after authoritative v2 write succeeds
    await chrome.storage.local.set({ xpider_tpl: fields });
    return canonicalTpl;
}

function importMessageFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            const fields = parseTemplateText(content);

            if (fields.name) { const el = document.getElementById('tpl-name'); if (el) el.value = fields.name; }
            if (fields.firstName) { const el = document.getElementById('tpl-first-name'); if (el) el.value = fields.firstName; }
            if (fields.lastName) { const el = document.getElementById('tpl-last-name'); if (el) el.value = fields.lastName; }
            if (fields.email) { const el = document.getElementById('tpl-email'); if (el) el.value = fields.email; }
            if (fields.phone) { const el = document.getElementById('tpl-phone'); if (el) el.value = fields.phone; }
            if (fields.subject) { const el = document.getElementById('tpl-subject'); if (el) el.value = fields.subject; }
            if (fields.message) { const el = document.getElementById('tpl-message'); if (el) el.value = fields.message; }

            await persistImportedTemplate(fields);
            addLog("Intelligent template mapped and saved to authoritative store.", "success");
        } catch (err) {
            console.error('[F9] Failed to persist imported template:', err);
            addLog("Failed to save imported template to store: " + err.message, "error");
        } finally {
            if (event.target) event.target.value = ''; // Reset file input
        }
    };
    reader.readAsText(file);
}

async function saveSettings() {
    const langSelect = document.getElementById('language-select');
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    const apiKeyInput = document.getElementById('captcha-api-key');
    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    const randomToggle = document.getElementById('random-delay-toggle');

    const lang = langSelect ? langSelect.value : 'en';
    const sttKeyVal = sttKeyInput ? sttKeyInput.value.trim() : '';
    const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
    const fillMode = fillModeEl ? fillModeEl.value : 'instant';
    const settings = {
        xpider_lang: lang,
        xpider_captcha_enabled: captchaToggle ? captchaToggle.checked : false,
        xpider_captcha_method: methodSelect ? methodSelect.value : 'audio',
        xpider_captcha_api_key: apiKeyInput ? apiKeyInput.value : '',
        xpider_stt_api_key: sttKeyVal,
        // [WitKey-Sync v2] 공유 키 필드: Crawler와 실시간 동기화를 위해 모두 저장
        audioSttKey: sttKeyVal,
        witKey: sttKeyVal,
        xpider_stealth_mode: stealthToggle ? stealthToggle.checked : false,
        xpider_double_submit: doubleSubmitToggle ? doubleSubmitToggle.checked : false,
        xpider_delay: delayCollectInput ? delayCollectInput.value : 6, // 레거시 호환
        xpider_delay_collect: delayCollectInput ? delayCollectInput.value : 6,
        xpider_delay_fill: delayFillInput ? delayFillInput.value : 6,
        xpider_delay_submit: delaySubmitInput ? delaySubmitInput.value : 6,
        xpider_random_delay: randomToggle ? randomToggle.checked : false,
        xpider_fill_mode: fillMode
    };
    await chrome.storage.local.set(settings);
    
    // [WitKey] Sync to background engine via UPDATE_WIT_KEY without dead native IPC
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'UPDATE_WIT_KEY', key: settings.xpider_stt_api_key }).catch(() => {});
    }
    
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "✅ Applied!";
        setTimeout(() => saveBtn.textContent = originalText, 2000);
    }
    
    applyTranslations(lang);
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
}

async function loadSettings() {
    const data = await chrome.storage.local.get([
        'xpider_lang', 'xpider_tpl', 'templates_v2',
        'xpider_delay', 'xpider_delay_collect', 'xpider_delay_fill', 'xpider_delay_submit',
        'xpider_queue', 'xpider_success', 'xpider_total',
        'xpider_captcha_enabled', 'xpider_captcha_method', 'xpider_captcha_api_key',
        'xpider_stt_api_key', 'xpider_stealth_mode', 'xpider_double_submit', 'xpider_fill_mode'
    ]);
    
    if (data.xpider_lang) {
        const langSelect = document.getElementById('language-select');
        if (langSelect) langSelect.value = data.xpider_lang;
    }
    
    // Captcha Settings (v1.2.3: Set high-stability defaults if not present)
    const captchaEnabled = (data.xpider_captcha_enabled !== undefined) ? !!data.xpider_captcha_enabled : true;
    const captchaMethod = data.xpider_captcha_method || 'audio';

    if (document.getElementById('captcha-solve-toggle')) {
        document.getElementById('captcha-solve-toggle').checked = captchaEnabled;
    }
    if (document.getElementById('captcha-method-select')) {
        document.getElementById('captcha-method-select').value = captchaMethod;
    }
    if (document.getElementById('captcha-api-key')) {
        document.getElementById('captcha-api-key').value = data.xpider_captcha_api_key || '';
    }
    if (document.getElementById('audio-stt-key')) {
        document.getElementById('audio-stt-key').value = data.xpider_stt_api_key || '';
    }
    if (document.getElementById('stealth-mode-toggle')) {
        document.getElementById('stealth-mode-toggle').checked = (data.xpider_stealth_mode !== undefined) ? !!data.xpider_stealth_mode : true;
    }
    if (document.getElementById('double-submit-toggle')) {
        document.getElementById('double-submit-toggle').checked = !!data.xpider_double_submit;
    }
    
    const methodGroup = document.getElementById('captcha-method-group');
    if (methodGroup) methodGroup.style.display = captchaEnabled ? 'block' : 'none';
    toggleCaptchaApiVisibility();

    // [F9] Template: use templates_v2 default slot as authoritative source; fall back to xpider_tpl
    let tplToLoad = data.xpider_tpl || null;
    if (data.templates_v2 && data.templates_v2.defaultId && data.templates_v2.templates) {
        const v2default = data.templates_v2.templates[data.templates_v2.defaultId];
        if (v2default) tplToLoad = v2default;
    }
    if (tplToLoad) {
        // Dual accessors: support flat and nested FormTemplateV2 structures
        const firstName = tplToLoad.firstName || (tplToLoad.sender && tplToLoad.sender.firstName) || '';
        const lastName  = tplToLoad.lastName  || (tplToLoad.sender && tplToLoad.sender.lastName)  || '';
        const name      = tplToLoad.name      || tplToLoad.fullName || (tplToLoad.sender && (tplToLoad.sender.fullName || tplToLoad.sender.name)) || '';
        const email     = tplToLoad.email     || (tplToLoad.sender && tplToLoad.sender.email)     || '';
        const phone     = tplToLoad.phone     || (tplToLoad.sender && tplToLoad.sender.phone)     || '';
        const subject   = tplToLoad.subject   || (tplToLoad.content && tplToLoad.content.subject) || '';
        const message   = tplToLoad.message   || (tplToLoad.content && tplToLoad.content.message) || '';

        if (document.getElementById('tpl-first-name')) document.getElementById('tpl-first-name').value = firstName;
        if (document.getElementById('tpl-last-name'))  document.getElementById('tpl-last-name').value  = lastName;
        if (document.getElementById('tpl-name'))       document.getElementById('tpl-name').value       = name;
        if (document.getElementById('tpl-email'))      document.getElementById('tpl-email').value      = email;
        if (document.getElementById('tpl-phone'))      document.getElementById('tpl-phone').value      = phone;
        if (document.getElementById('tpl-subject'))    document.getElementById('tpl-subject').value    = subject;
        if (document.getElementById('tpl-message'))    document.getElementById('tpl-message').value    = message;
    }

    // 3중 속도 복원
    if (document.getElementById('delay-input-collect')) {
        document.getElementById('delay-input-collect').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    if (document.getElementById('delay-input-fill')) {
        document.getElementById('delay-input-fill').value = data.xpider_delay_fill || 6;
    }
    if (document.getElementById('delay-input-submit')) {
        document.getElementById('delay-input-submit').value = data.xpider_delay_submit || 6;
    }
    
    // 레거시 호환용 동기화
    if (document.getElementById('delay-input')) {
        document.getElementById('delay-input').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    
    updateSpeedLabels();
    
    if (document.getElementById('random-delay-toggle')) {
        document.getElementById('random-delay-toggle').checked = !!data.xpider_random_delay;
    }

    // [v4.15.0] 폼 자동 입력 방식 복원 (디폴트: instant)
    const fillMode = data.xpider_fill_mode || 'instant';
    const fillModeEl = document.getElementById(`fill-mode-${fillMode}`);
    if (fillModeEl) fillModeEl.checked = true;

    // Resuming Campaign
    if (data.xpider_queue && data.xpider_queue.length > 0) {
        campaignQueue = data.xpider_queue;
        totalTargets = data.xpider_total || campaignQueue.length;
        successCount = data.xpider_success || 0;
        campaignActive = true; // Mark as active to show Pause/Stop buttons

        updateRealTimeStatus({ successCount });
        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) countDisplay.textContent = `${campaignQueue.length} (remaining) / ${totalTargets} URLs`;
        
        if (document.getElementById('file-info')) document.getElementById('file-info').classList.remove('hidden');
        if (document.getElementById('status-box')) document.getElementById('status-box').classList.remove('hidden');
        if (document.getElementById('start-btn')) document.getElementById('start-btn').classList.add('hidden');
        if (document.getElementById('multi-actions')) document.getElementById('multi-actions').classList.remove('hidden');
        
        updateProgress(Math.round(((totalTargets - campaignQueue.length) / totalTargets) * 100));
        addLog(`Resumed campaign: ${campaignQueue.length} remaining.`, 'info');
    }

    // [v1.2.0] Populate saved lists
    await updateSavedListsUI();
    
    // [v1.7.0] Populate template library
    await updateTemplateDropdown();
}

// ─── [XPIDER] Browser Language-Change Broadcast Listener ──────────────
// When the XPIDER browser language setting changes, this extension updates instantly.
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
        const lang = event.data.data && event.data.data.lang;
        if (lang && typeof applyTranslations === 'function') {
            applyTranslations(lang);
            const langSelect = document.getElementById('language-select');
            if (langSelect) langSelect.value = lang;
            chrome.storage.local.set({ xpider_lang: lang });
        }
    }
});

async function clearCampaignQueue() {
    // 1. Authoritatively clear background
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await new Promise(r => chrome.runtime.sendMessage({ action: 'CLEAR_BUSINESS_URLS' }, r));
    }

    // 2. Reset campaign queue and counts
    campaignQueue = [];
    totalTargets = 0;
    successCount = 0;
    remainingTargets = 0;
    
    // 3. Hide file info and preview lists
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.add('hidden');
    
    const previewList = document.getElementById('file-urls-preview');
    if (previewList) previewList.classList.add('hidden');
    
    const previewContainer = document.getElementById('preview-list');
    if (previewContainer) previewContainer.innerHTML = '';
    
    // 4. Clear file input
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    
    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = 'No file selected';

    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = '0 URLs found';

    const resumableBanner = document.getElementById('resumable-campaign-banner');
    if (resumableBanner) resumableBanner.style.display = 'none';
    
    // 5. Update UI counts and progress
    updateRealTimeStatus({ successCount: 0, remainingCount: 0, totalTargets: 0 });
    updateProgress(0);
    
    // 6. Authoritatively remove all autoform keys from storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.autoform);
    }
    
    // 7. Log success
    addLog("Business URLs list cleared.", "stop");
}

// [WitKey-Sync] 실시간 스토리지 변경 시 UI 자동 업데이트 처리
chrome.storage.onChanged.addListener((changes) => {
    let newKey = null;
    if (changes.xpider_stt_api_key && changes.xpider_stt_api_key.newValue !== undefined) {
        newKey = changes.xpider_stt_api_key.newValue;
    } else if (changes.audioSttKey && changes.audioSttKey.newValue !== undefined) {
        newKey = changes.audioSttKey.newValue;
    } else if (changes.witKey && changes.witKey.newValue !== undefined) {
        newKey = changes.witKey.newValue;
    }
    
    if (newKey !== null) {
        console.log(`[WitKey-Sync] Sender Popup Storage changed → Syncing UI to new key: ${newKey ? newKey.substring(0, 8) + '...' : 'NONE'}`);
        
        // 1) 설정창의 STT API Key 입력창 갱신
        const sttKeyInput = document.getElementById('audio-stt-key');
        if (sttKeyInput) sttKeyInput.value = newKey;
        
        // 2) 최초 STT 설정 모달 입력 필드 갱신
        const setupInput = document.getElementById('setup-stt-key-input');
        if (setupInput) setupInput.value = newKey;
        
        // 3) 최초 STT 설정 모달 가시성 제어 및 상태 바 갱신
        const setupModal = document.getElementById('stt-setup-modal-overlay');
        const witStatusText = document.getElementById('wit-status-text');
        if (setupModal) {
            if (newKey) {
                setupModal.classList.add('hidden'); // 키가 존재하면 숨김
            } else {
                setupModal.classList.remove('hidden'); // 키가 없으면 노출
            }
        }
        if (witStatusText) {
            if (newKey) {
                witStatusText.textContent = `Configured (${newKey.substring(0, 6)}...)`;
                witStatusText.style.color = "#00ffcc";
            } else {
                witStatusText.textContent = "Key Required";
                witStatusText.style.color = "#ffaa00";
            }
        }
    }

    if (changes.xpider_email_collector_v1 || changes.xpider_email_current_site_v1) {
        if (typeof renderEmailCollectorUI === 'function') {
            renderEmailCollectorUI();
        }
    }
});

// [P2A Foundation UI Wiring]
document.addEventListener('DOMContentLoaded', () => {
    // 1. Trigger background single-writer migration
    try {
        chrome.runtime.sendMessage({ action: 'EXECUTE_MIGRATION' }, (res) => {
            if (res && res.success) {
                console.log('[Popup] Storage migration verified / initialized to v2.');
            }
        });
    } catch(e) {}

    // 2. Export CSV Report Button
    const exportBtn = document.getElementById('export-csv-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'EXPORT_HISTORY_CSV' }, (res) => {
                if (res && res.success && res.csv) {
                    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `xpider_campaign_report_${Date.now()}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addLog("📊 CSV Report downloaded successfully.", "success");
                } else {
                    addLog("⚠️ Failed to generate CSV report.", "warning");
                }
            });
        });
    }

    // 3. Reset All Suppression Button
    const resetBtn = document.getElementById('reset-all-history-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("Reset suppression for all targets? This will allow intentional resending while preserving historical audit rows.")) {
                chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'ALL' }, (res) => {
                    if (res && res.success) {
                        addLog(`🔄 All target suppressions reset. (New Generation: ${res.newGeneration})`, "success");
                        _renderHistoryPanel();
                    } else {
                        addLog(`❌ Reset rejected: ${res?.error || 'Active submission in progress'}`, "error");
                    }
                });
            }
        });
    }

    // [F10] Selective Reset Button - reset single URL's suppression state
    const selectiveResetBtn = document.getElementById('selective-reset-history-btn');
    if (selectiveResetBtn) {
        selectiveResetBtn.addEventListener('click', () => {
            const input = document.getElementById('selective-reset-url-input');
            const url = input ? input.value.trim() : '';
            if (!url) return alert('Enter a URL to selectively reset.');
            if (confirm(`Reset suppression for: ${url}?`)) {
                chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'SELECTED', targetIdentities: [url] }, (res) => {
                    if (res && res.success) {
                        addLog(`🔄 Selective reset applied for ${url} (${res.affectedCount} target(s) affected)`, "success");
                        if (input) input.value = '';
                        _renderHistoryPanel();
                    } else {
                        addLog(`❌ Selective reset failed: ${res?.error || 'Unknown error'}`, "error");
                    }
                });
            }
        });
    }

    // [F10] History status panel: load and display ImportRow/Attempt state
    async function _renderHistoryPanel() {
        const panel = document.getElementById('history-status-panel');
        if (!panel) return;
        try {
            const data = await chrome.storage.local.get(['xpider_history_rows', 'xpider_history_attempts', 'xpider_history_generation']);
            const rows = data.xpider_history_rows || [];
            const attempts = data.xpider_history_attempts || [];
            const gen = data.xpider_history_generation || 1;

            const pending = rows.filter(r => r.status === 'PENDING').length;
            const invalid = rows.filter(r => r.status === 'INVALID_INPUT').length;
            const succeeded = attempts.filter(a => a.status === 'CONFIRMED_SUCCESS').length;
            const failed = attempts.filter(a => a.status === 'FAILURE').length;

            panel.innerHTML = `
                <div class="history-stat-row">
                    <span>Generation:</span><span><b>${gen}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Total Import Rows:</span><span><b>${rows.length}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Pending:</span><span><b>${pending}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Invalid:</span><span><b style="color:#ef4444">${invalid}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Succeeded:</span><span><b style="color:#22c55e">${succeeded}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Failed:</span><span><b style="color:#f59e0b">${failed}</b></span>
                </div>
            `;
        } catch (e) {
            panel.innerHTML = `<span style="color:#ef4444">History load error: ${e.message}</span>`;
        }
    }

    // Initial render on popup open
    _renderHistoryPanel();
    checkResumableCheckpoint();
    try { renderEmailCollectorUI(); } catch (_) {}
});

// ── [ISSUE #6 EMAIL COLLECTOR CONTROLLER] ─────────────────────────────────
let emailActiveView = 'current'; // 'current' | 'all'
let emailCollectorStore = null;

function getEmailCollectorStore() {
    if (!emailCollectorStore) {
        const StoreClass = (typeof EmailCollectorStore !== 'undefined') ? EmailCollectorStore : (typeof window !== 'undefined' ? window.EmailCollectorStore : null);
        if (StoreClass) {
            emailCollectorStore = new StoreClass(chrome.storage.local);
        }
    }
    return emailCollectorStore;
}

async function renderEmailCollectorUI() {
    try {
        const store = getEmailCollectorStore();
        if (!store) return;

        const currentSiteData = await store.loadCurrentSiteStore();
        const globalData = await store.loadGlobalStore();

        const currentCount = currentSiteData && currentSiteData.emails ? currentSiteData.emails.length : 0;
        const globalCount = globalData ? (globalData.totalUnique || Object.keys(globalData.emails || {}).length || 0) : 0;

        const curStat = document.getElementById('stat-email-current-count');
        const globStat = document.getElementById('stat-email-global-count');
        const curChip = document.getElementById('email-chip-current-num');
        const globChip = document.getElementById('email-chip-all-num');

        if (curStat) curStat.textContent = currentCount;
        if (globStat) globStat.textContent = globalCount;
        if (curChip) curChip.textContent = currentCount;
        if (globChip) globChip.textContent = globalCount;

        const textarea = document.getElementById('email-collector-textarea');
        if (textarea) {
            if (emailActiveView === 'current') {
                const list = (currentSiteData && currentSiteData.emails) ? currentSiteData.emails : [];
                textarea.value = list.length > 0
                    ? list.join('\n')
                    : ((currentSiteData && currentSiteData.hostname) ? `// Scanned ${currentSiteData.hostname} — No emails found on this page` : '// No active site scanned yet');
            } else {
                const emails = Object.keys((globalData && globalData.emails) || {}).sort();
                textarea.value = emails.length > 0 ? emails.join('\n') : '// No emails accumulated yet';
            }
        }
    } catch (err) {
        console.warn('[EmailCollectorUI] Render failed:', err);
    }
}

function bindEmailCollectorEvents() {
    const curBtn = document.getElementById('email-view-current-btn');
    const allBtn = document.getElementById('email-view-all-btn');

    if (curBtn) {
        curBtn.addEventListener('click', () => {
            emailActiveView = 'current';
            curBtn.classList.add('active');
            if (allBtn) allBtn.classList.remove('active');
            renderEmailCollectorUI();
        });
    }

    if (allBtn) {
        allBtn.addEventListener('click', () => {
            emailActiveView = 'all';
            allBtn.classList.add('active');
            if (curBtn) curBtn.classList.remove('active');
            renderEmailCollectorUI();
        });
    }

    const copyBtn = document.getElementById('email-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const textarea = document.getElementById('email-collector-textarea');
            if (textarea && textarea.value && !textarea.value.startsWith('//')) {
                try {
                    await navigator.clipboard.writeText(textarea.value);
                    addLog(`📋 Copied ${textarea.value.split('\n').filter(Boolean).length} emails to clipboard.`, 'success');
                } catch (_) {
                    textarea.select();
                    document.execCommand('copy');
                    addLog("📋 Copied emails to clipboard.", 'success');
                }
            } else {
                addLog("ℹ️ No emails to copy.", 'info');
            }
        });
    }

    const exportCsvBtn = document.getElementById('email-export-csv-btn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', async () => {
            try {
                const store = getEmailCollectorStore();
                if (!store) return;
                const csv = await store.exportToCsv(emailActiveView);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const dateStr = new Date().toISOString().slice(0, 10);
                const filename = emailActiveView === 'current'
                    ? `xpider_current_site_emails_${dateStr}.csv`
                    : `xpider_collected_emails_${dateStr}.csv`;

                if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        chrome.downloads.download({
                            url: reader.result,
                            filename: filename,
                            saveAs: true
                        }, (downloadId) => {
                            if (chrome.runtime && chrome.runtime.lastError) {
                                _triggerBrowserDownload(blob, filename);
                            } else {
                                addLog(`📊 Exported ${filename}`, 'success');
                            }
                        });
                    };
                    reader.readAsDataURL(blob);
                } else {
                    _triggerBrowserDownload(blob, filename);
                    addLog(`📊 Exported ${filename}`, 'success');
                }
            } catch (err) {
                addLog(`❌ Export CSV failed: ${err.message}`, 'error');
            }
        });
    }

    const exportTxtBtn = document.getElementById('email-export-txt-btn');
    if (exportTxtBtn) {
        exportTxtBtn.addEventListener('click', async () => {
            try {
                const store = getEmailCollectorStore();
                if (!store) return;
                const txt = await store.exportToTxt(emailActiveView);
                const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
                const dateStr = new Date().toISOString().slice(0, 10);
                const filename = emailActiveView === 'current'
                    ? `xpider_current_site_emails_${dateStr}.txt`
                    : `xpider_collected_emails_${dateStr}.txt`;

                if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        chrome.downloads.download({
                            url: reader.result,
                            filename: filename,
                            saveAs: true
                        }, (downloadId) => {
                            if (chrome.runtime && chrome.runtime.lastError) {
                                _triggerBrowserDownload(blob, filename);
                            } else {
                                addLog(`📄 Exported ${filename}`, 'success');
                            }
                        });
                    };
                    reader.readAsDataURL(blob);
                } else {
                    _triggerBrowserDownload(blob, filename);
                    addLog(`📄 Exported ${filename}`, 'success');
                }
            } catch (err) {
                addLog(`❌ Export TXT failed: ${err.message}`, 'error');
            }
        });
    }

    const clearBtn = document.getElementById('email-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            const store = getEmailCollectorStore();
            if (!store) return;
            if (emailActiveView === 'current') {
                await store.clearCurrent();
                addLog("🧹 Cleared current site emails.", 'info');
                renderEmailCollectorUI();
            } else {
                const confirmed = (typeof confirm === 'function')
                    ? confirm("Are you sure you want to delete ALL accumulated emails?")
                    : true;
                if (confirmed) {
                    await store.clearAll();
                    addLog("🗑️ Cleared all accumulated emails.", 'info');
                    renderEmailCollectorUI();
                }
            }
        });
    }
}

function _triggerBrowserDownload(blob, filename) {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        _parseRfc4180Records,
        _syncTemplateToV2,
        saveTemplate,
        persistImportedTemplate,
        parseTemplateText,
        // Phase 2B Controller Functions (Auditor Correction 3)
        handleCreateNewTemplate,
        handleSaveTemplate,
        handleDuplicateTemplate,
        handleDeleteTemplate,
        handleSetDefaultTemplate,
        saveTemplateChanges,
        populateFormFromTemplate,
        updateTemplateDropdown,
        loadTemplateFromLibrary,
        filterHistoryRecords,
        renderLedgerUI,
        dispatchSelectiveReset,
        dispatchRetryFailed,
        dispatchGlobalReset,
        dispatchClearHistoryLedger,
        dispatchResetAllListData,
        dispatchFullCampaignReset,
        clearCampaignQueue,
        LIST_DATA_KEYS,
        triggerCsvExport,
        bindCampaignTemplateMetadata,
        startCampaign,
        togglePause,
        stopCampaign,
        stopAndSaveCampaign,
        endCampaign,
        resumeCampaign,
        discardCheckpoint,
        checkResumableCheckpoint,
        checkActiveSubmitLock,
        getPopupTemplateStore,
        getPopupHistoryStore,
        // Issue #6 Email Collector Subsystem Exports
        getEmailCollectorStore,
        renderEmailCollectorUI,
        bindEmailCollectorEvents,
        // IPC Diagnostic Subsystem Exports
        xpiderInvoke,
        addDiagnosticLog,
        getDiagnosticReport,
        getDiagnosticBuffer,
        clearDiagnosticLog,
        copyDiagnosticReport,
        downloadDiagnosticTxt,
        redactSensitiveText,
        calculatePayloadBytes
    };
}
