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
  if (typeof document !== 'undefined' && document.addEventListener) {
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
  }
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

let currentTpl = {};
let campaignQueue = [];
let campaignActive = false;
let campaignPaused = false;
let successCount = 0;
let failedCount = 0;
let completedCount = 0;
let totalTargets = 0;
let i18nData = null;
let lastLogMessage = "Ready...";
let remainingTargets = 0;
let lastStatsData = null;

// ── [IPC DIAGNOSTIC TRACE & BUFFER SUBSYSTEM] ──────────────────────────────
const DIAG_LOG_CAPACITY = 20000;
const diagnosticLogBuffer = [];
let diagnosticLogTruncated = false;
let _lastDiagnosticReportSnapshot = null;
const diagnosticSessionId = 'diag_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

async function loadPersistentDiagnostics() {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const data = await chrome.storage.local.get(['xpider_current_run_diagnostics']);
            const diag = data.xpider_current_run_diagnostics;
            if (diag && Array.isArray(diag.events) && diag.events.length > 0) {
                diagnosticLogBuffer.length = 0;
                diagnosticLogBuffer.push(...diag.events);
                if (diag.truncated) diagnosticLogTruncated = true;
            }
        }
    } catch (_) {}
}

/**
 * Privacy-safe Redaction Engine
 * Automatically redacts:
 * - Email addresses
 * - Phone numbers
 * - Template message body, secrets, auth tokens, passwords, cookies
 * - Sensitive query parameters (preserves full URL path for exact diagnostics)
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
        // 2Captcha / NopeCHA / hex API keys (32 hex characters)
        .replace(/\b[a-f0-9]{32}\b/gi, '[REDACTED_API_KEY]')
        // reCAPTCHA / hCaptcha long response tokens
        .replace(/\b(?:03[a-zA-Z0-9_-]{30,}|P1_[a-zA-Z0-9_-]{30,}|[a-zA-Z0-9_-]{60,})\b/g, (token) => `[REDACTED_TOKEN_LEN_${token.length}]`)
        // Cookie headers
        .replace(/Cookie:\s*[^;\r\n]+(?:;\s*[^;\r\n]+)*/gi, 'Cookie: [REDACTED_COOKIE]')
        // [R6.9G.8] Preserve exact URL paths (e.g. /contact-kaizen-karate-martial-arts-in-belmont-ma); redact sensitive query parameters only
        .replace(/https?:\/\/[^\s"'`<>]+/gi, (urlStr) => {
            try {
                const u = new URL(urlStr);
                const safeParams = new URLSearchParams();
                for (const [k, v] of u.searchParams.entries()) {
                    if (/token|key|secret|auth|email|phone|password|jwt/i.test(k)) {
                        safeParams.set(k, '[REDACTED]');
                    } else {
                        safeParams.set(k, v);
                    }
                }
                const qs = safeParams.toString();
                return `${u.origin}${u.pathname}${qs ? '?' + qs : ''}`;
            } catch (_) {
                return urlStr;
            }
        })
        // [R6.9G.9 Privacy Redaction] IPv4 Addresses (preserve local 127.0.0.1 / 0.0.0.0 for test fixtures)
        .replace(/\b(?:(?!127\.0\.0\.1)(?!0\.0\.0\.0)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g, '[REDACTED_IP]')
        // IPv6 Addresses
        .replace(/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, '[REDACTED_IPV6]')
        // Proxy Password & Credentials
        .replace(/proxy(?:-password|Pass|Password)[\s:="']+[^\s"'`]+/gi, 'proxyPassword: [REDACTED_SECRET]')
        .replace(/(?:socks5|http|https):\/\/[^:\s]+:[^@\s]+@/gi, (match) => {
            const protocol = match.split('://')[0];
            return `${protocol}://[REDACTED_USER]:[REDACTED_PASS]@`;
        });
}

let _diagStorageFlushTimer = null;
let _diagFlushInProgress = false;
let _diagNeedsReFlush = false;

async function flushDiagnosticStorage() {
    if (_diagStorageFlushTimer) {
        clearTimeout(_diagStorageFlushTimer);
        _diagStorageFlushTimer = null;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (_diagFlushInProgress) {
            _diagNeedsReFlush = true;
            return;
        }
        _diagFlushInProgress = true;
        try {
            await new Promise((resolve) => {
                chrome.storage.local.set({
                    xpider_current_run_diagnostics: {
                        events: [...diagnosticLogBuffer],
                        truncated: !!diagnosticLogTruncated
                    }
                }, () => resolve());
            });
        } catch (e) {
            console.error('[XPIDER_DIAG] Failed to flush diagnostic storage:', e);
        } finally {
            _diagFlushInProgress = false;
            if (_diagNeedsReFlush) {
                _diagNeedsReFlush = false;
                await flushDiagnosticStorage();
            }
        }
    }
}

function scheduleDiagnosticStorageFlush() {
    if (!_diagStorageFlushTimer) {
        _diagStorageFlushTimer = setTimeout(() => {
            _diagStorageFlushTimer = null;
            flushDiagnosticStorage();
        }, 50);
    }
}

if (typeof window !== 'undefined') {
    window.flushDiagnosticStorage = flushDiagnosticStorage;
    window.addEventListener('beforeunload', () => { flushDiagnosticStorage(); });
    window.addEventListener('pagehide', () => { flushDiagnosticStorage(); });
}

function addDiagnosticLog(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const redacted = redactSensitiveText(message);
    const entry = `[${timestamp}][${level}] ${redacted}`;
    diagnosticLogBuffer.push(entry);
    if (diagnosticLogBuffer.length > DIAG_LOG_CAPACITY) {
        diagnosticLogBuffer.shift();
        diagnosticLogTruncated = true;
    }
    _lastDiagnosticReportSnapshot = null; // Invalidate cached report snapshot

    scheduleDiagnosticStorageFlush();

    if (level === 'ERROR') {
        console.error(`[XPIDER_DIAG] ${redacted}`);
    } else if (level === 'WARN') {
        console.warn(`[XPIDER_DIAG] ${redacted}`);
    } else {
        console.log(`[XPIDER_DIAG] ${redacted}`);
    }
}

async function clearDiagnosticLog() {
    if (_diagStorageFlushTimer) {
        clearTimeout(_diagStorageFlushTimer);
        _diagStorageFlushTimer = null;
    }
    diagnosticLogBuffer.length = 0;
    diagnosticLogTruncated = false;
    _lastDiagnosticReportSnapshot = null;
    const logContainer = document.getElementById('log-container');
    if (logContainer) logContainer.innerHTML = '';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'CLEAR_DIAGNOSTIC_LOGS' }, () => {});
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(LIST_DATA_KEYS.diagnostics);
        await chrome.storage.local.set({ xpider_current_run_diagnostics: { runId: null, truncated: false, events: [] } });
    }
    // Always record a clear-acknowledgment entry in the diagnostic buffer
    // so getDiagnosticBuffer() returns exactly 1 entry after clear (testable contract)
    addDiagnosticLog('Diagnostic buffer cleared.', 'INFO');
}


function getDiagnosticBuffer() {
    return [...diagnosticLogBuffer];
}

function getDiagnosticReport(fresh = false) {
    if (!fresh && _lastDiagnosticReportSnapshot) {
        return _lastDiagnosticReportSnapshot;
    }

    const extVer = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) 
        ? chrome.runtime.getManifest()?.version 
        : '1.2.0';
    const runtimeId = (typeof chrome !== 'undefined' && chrome.runtime?.id) ? chrome.runtime.id : 'N/A';
    const docVis = (typeof document !== 'undefined' && document.visibilityState) ? document.visibilityState : 'unknown';
    const originPath = (typeof window !== 'undefined' && window.location) 
        ? `${window.location.origin}${window.location.pathname}` 
        : 'unknown';

    const buildInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : {};
    const hs = (typeof getPopupHistoryStore === 'function') ? getPopupHistoryStore() : null;
    const currentRunId = lastStatsData?.campaignRunId || 'N/A';
    const records = hs ? (hs.attempts || []) : [];
    const runRecords = currentRunId !== 'N/A' ? records.filter(a => a.campaignRunId === currentRunId) : records;

    const allEvents = [...diagnosticLogBuffer];
    const eventCount = allEvents.length;
    const targetCount = runRecords.length;

    // SECTION 1: BUILD
    const buildSection = [
        "=================================================================",
        "SECTION 1: BUILD",
        "=================================================================",
        `buildId:            ${buildInfo.buildId || 'R6.9G.8.1-20261007-REAL-PATH-MANUAL-ASSIST-PERSISTENT-DIAG'}`,
        `implementationHead: ${buildInfo.implementationHead || 'N/A'}`,
        `branch:             upgrade/phase-0-1`,
        `version:            ${extVer}`,
        `chromeRuntimeId:    ${runtimeId}`,
        `moduleHashes:       ${JSON.stringify(buildInfo.modules || buildInfo.moduleHashes || {})}`
    ];

    // SECTION 2: CAMPAIGN
    const isTruncated = !!diagnosticLogTruncated;
    const isComplete = !isTruncated;
    const campaignSection = [
        "=================================================================",
        "SECTION 2: CAMPAIGN",
        "=================================================================",
        `campaignRunId:      ${currentRunId}`,
        `sessionId:          ${diagnosticSessionId}`,
        `generation:         ${typeof campaignGeneration !== 'undefined' ? campaignGeneration : 1}`,
        `sourceImportCount:  ${lastStatsData?.totalTargets || records.length || 0}`,
        `executableCount:    ${lastStatsData?.remainingCount !== undefined ? lastStatsData.remainingCount : 0}`,
        `campaignActive:     ${typeof campaignActive !== 'undefined' ? campaignActive : false}`,
        `campaignPaused:     ${typeof campaignPaused !== 'undefined' ? campaignPaused : false}`,
        `reportTimestamp:    ${new Date().toISOString()}`,
        `documentOrigin:     ${originPath}`,
        `visibilityState:    ${docVis}`,
        `DIAG_REPORT_COMPLETE=${isComplete}`,
        `TRUNCATED=${isTruncated}`,
        `EVENT_COUNT=${eventCount}`,
        `TARGET_COUNT=${targetCount}`,
        "Privacy Status:     AUTOMATICALLY REDACTED (Zero customer PII / Zero API Secrets / URL paths preserved)"
    ];

    // SECTION 3: PER TARGET CHRONOLOGICAL TIMELINE
    const timelineLines = [
        "=================================================================",
        "SECTION 3: PER TARGET CHRONOLOGICAL TIMELINE",
        "================================================================="
    ];
    if (runRecords.length === 0) {
        timelineLines.push("  (No target attempts recorded in current run)");
    } else {
        runRecords.forEach((att, idx) => {
            timelineLines.push(`--- TARGET #${idx + 1} [${att.attemptId || 'no-id'}] ---`);
            timelineLines.push(`  sourceUrl:          ${att.sourceUrl || att.url || 'none'}`);
            timelineLines.push(`  contactPageUrl:     ${att.contactPageUrl || 'none'}`);
            timelineLines.push(`  formPageUrl:        ${att.formPageUrl || 'none'}`);
            timelineLines.push(`  externalFormUrl:    ${att.externalFormUrl || 'none'}`);
            timelineLines.push(`  resultUrl:          ${att.resultUrl || 'none'}`);
            timelineLines.push(`  formDetectionState: ${att.formDetectionStatus || (att.formPageUrl ? 'FOUND' : 'NOT_FOUND')}`);
            timelineLines.push(`  autofillState:      ${att.autofillStatus || 'N_A'}`);
            timelineLines.push(`  submissionState:    ${att.submissionStatus || att.status || 'UNKNOWN'}`);
            timelineLines.push(`  captchaState:       ${att.captchaStatus || 'NONE'}`);
            timelineLines.push(`  ownerManualConfirmed:${!!att.ownerManualConfirmed}`);
            timelineLines.push(`  canonicalStatus:    ${att.status || 'UNKNOWN'}`);
            timelineLines.push(`  reasonCode:         ${att.reasonCode || 'none'}`);
            timelineLines.push(`  startedAt:          ${att.startedAt ? new Date(att.startedAt).toISOString() : 'none'}`);
            timelineLines.push(`  resolvedAt:         ${att.resolvedAt ? new Date(att.resolvedAt).toISOString() : 'none'}`);
            timelineLines.push(`  emailsFound:        ${att.emailsFound || 0}`);
            if (att.evidence) {
                timelineLines.push(`  evidence:           ${JSON.stringify(att.evidence)}`);
            }
        });
    }

    // SECTION 4: COMPLETE EVENT TRACE
    const traceSection = [
        "=================================================================",
        `SECTION 4: COMPLETE EVENT TRACE (${eventCount} events)`,
        "=================================================================",
        ...(allEvents.length > 0 ? allEvents : ["  (No events recorded)"]),
        "=================================================================",
        "END OF COMPLETE XPIDER DIAGNOSTIC REPORT",
        "================================================================="
    ];

    const reportText = [
        ...buildSection,
        "",
        ...campaignSection,
        "",
        ...timelineLines,
        "",
        ...traceSection
    ].join('\n');
    _lastDiagnosticReportSnapshot = reportText;
    return reportText;
}

async function copyDiagnosticReport() {
    const report = getDiagnosticReport(true);
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
    const report = getDiagnosticReport(false);
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

// [R6.4] Control Plane Boot & Error Boundaries
window.__xpider_boot = {
    started: false,
    settingsHydrated: false,
    startHandlerBound: false,
    saveHandlerBound: false,
    getStateAck: false,
    ready: false
};

function displayControlPlaneError(code, detail) {
    console.error(`[CONTROL_PLANE_ERROR] code=${code} detail=${detail}`);
    try {
        let errBanner = document.getElementById('xpider-control-plane-error');
        if (!errBanner && typeof document !== 'undefined' && document.body) {
            errBanner = document.createElement('div');
            errBanner.id = 'xpider-control-plane-error';
            errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px 12px;font-size:12px;font-weight:700;z-index:999999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
            document.body.prepend(errBanner);
        }
        if (errBanner) {
            errBanner.textContent = `🚨 CONTROL_PLANE_ERROR: ${code} (${detail})`;
        }
    } catch (_) {}
}

function bindCriticalControls() {
    let startBound = false;
    let saveBound = false;

    // 1. Start Button
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        if (!startBtn.dataset.bound) {
            startBtn.dataset.bound = 'true';
            startBtn.addEventListener('click', () => {
                if (startBtn.hasAttribute('data-build-locked')) {
                    console.warn('[START_CLICK_IGNORED] button has data-build-locked attribute');
                    return;
                }
                startCampaign().catch(err => {
                    console.error('[START_EXCEPTION]', err);
                });
            });
        }
        startBound = true;
    } else {
        displayControlPlaneError('START_HANDLER_NOT_BOUND', 'element #start-btn not found in DOM');
    }

    // 2. Save Settings Button
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        if (!saveSettingsBtn.dataset.bound) {
            saveSettingsBtn.dataset.bound = 'true';
            saveSettingsBtn.addEventListener('click', () => {
                saveSettings().catch(err => {
                    console.error('[SETTINGS_SAVE_EXCEPTION]', err);
                });
            });
        }
        saveBound = true;
    } else {
        displayControlPlaneError('SETTINGS_HANDLER_NOT_BOUND', 'element #save-settings-btn not found in DOM');
    }

    // 3. Runtime & Storage checks
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        displayControlPlaneError('RUNTIME_UNAVAILABLE', 'chrome.runtime is not available');
    }
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        displayControlPlaneError('STORAGE_UNAVAILABLE', 'chrome.storage.local is not available');
    }

    window.__xpider_boot.startHandlerBound = startBound;
    window.__xpider_boot.saveHandlerBound = saveBound;
    console.log(`[POPUP_BOOT] startHandlerBound=${startBound}`);
    console.log(`[POPUP_BOOT] saveHandlerBound=${saveBound}`);

    return { startBound, saveBound };
}

let isMessageDirty = false;
let isTemplateDirty = false;

function _getTemplateMessageString(tpl) {
    if (!tpl || typeof tpl !== 'object') return '';
    if (typeof tpl.message === 'string' && tpl.message.trim().length > 0) return tpl.message.trim();
    if (tpl.content && typeof tpl.content.message === 'string' && tpl.content.message.trim().length > 0) return tpl.content.message.trim();
    if (typeof tpl.message_val === 'string' && tpl.message_val.trim().length > 0) return tpl.message_val.trim();
    return '';
}

/**
 * [R6.9G.10.3.4] Re-hydrate template form controls and dropdown from canonical or fallback store
 */
async function rehydrateTemplateUI(source = 'boot', overrideStore = null) {
    let v2Store = overrideStore;
    let legacyTpl = null;
    if (!v2Store) {
        try {
            const stored = await chrome.storage.local.get(['templates_v2', 'xpider_tpl']);
            v2Store = stored.templates_v2;
            legacyTpl = stored.xpider_tpl;
        } catch (_) {}
    } else {
        try {
            const stored = await chrome.storage.local.get(['xpider_tpl']);
            legacyTpl = stored.xpider_tpl;
        } catch (_) {}
    }

    let defaultId = v2Store?.defaultId || null;
    let defaultTpl = (defaultId && v2Store?.templates) ? v2Store.templates[defaultId] : null;
    let chosenSource = 'templates_v2';

    const defaultMsg = _getTemplateMessageString(defaultTpl);
    const legacyMsg = _getTemplateMessageString(legacyTpl);

    if (defaultMsg.length === 0 && legacyMsg.length > 0) {
        defaultTpl = legacyTpl;
        chosenSource = 'xpider_tpl';
    } else if (!defaultTpl && legacyTpl) {
        defaultTpl = legacyTpl;
        chosenSource = 'xpider_tpl';
    }

    if (defaultTpl) {
        populateFormFromTemplate(defaultTpl);
    }

    if (typeof updateTemplateDropdown === 'function') {
        try {
            await updateTemplateDropdown(defaultId);
        } catch (_) {}
    }

    const msgEl = document.getElementById('tpl-message');
    const hasMsg = !!(msgEl && msgEl.value && msgEl.value.trim().length > 0);
    console.log(`[TEMPLATE_HYDRATE] templateId=${defaultTpl?.id || defaultId || 'none'} source=${chosenSource} messagePresent=${hasMsg}`);
    addLog(`[TEMPLATE_HYDRATE] templateId=${defaultTpl?.id || defaultId || 'none'} source=${chosenSource} messagePresent=${hasMsg}`, 'info');

    return { templateId: defaultTpl?.id || defaultId || 'none', source: chosenSource, messagePresent: hasMsg };
}

/**
 * [R6.9G.10.3.4] Serialized Migration Promise: Single Writer Handshake before UI hydration
 */
async function ensureSchemaReady() {
    console.log('[POPUP_BOOT] ensureSchemaReady starting...');
    let migrationRes = null;
    try {
        migrationRes = await new Promise((resolve) => {
            const timer = setTimeout(() => {
                console.warn('[POPUP_BOOT] ensureSchemaReady timeout after 2500ms, proceeding with storage read');
                resolve({ success: false, reason: 'TIMEOUT' });
            }, 2500);

            chrome.runtime.sendMessage({ action: 'EXECUTE_MIGRATION' }, (res) => {
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                    console.warn('[POPUP_BOOT] EXECUTE_MIGRATION IPC error:', chrome.runtime.lastError.message);
                    resolve({ success: false, reason: 'IPC_ERROR', error: chrome.runtime.lastError.message });
                } else {
                    resolve(res || { success: false, reason: 'NO_RESPONSE' });
                }
            });
        });
    } catch (e) {
        console.warn('[POPUP_BOOT] ensureSchemaReady exception:', e);
        migrationRes = { success: false, reason: 'EXCEPTION', error: e.message };
    }

    const status = migrationRes?.repaired ? 'REPAIRED' : (migrationRes?.migrated ? 'MIGRATED' : (migrationRes?.reason || 'READY'));
    const sourceCounts = migrationRes?.sourceCounts || (migrationRes?.templates ? migrationRes.templates.length : (migrationRes?.templates_v2?.templates ? Object.keys(migrationRes.templates_v2.templates).length : 0));
    console.log(`[TEMPLATE_MIGRATION] status=${status} sourceCounts=${sourceCounts}`);
    addLog(`[TEMPLATE_MIGRATION] status=${status} sourceCounts=${sourceCounts}`, 'info');
    return migrationRes;
}

/**
 * [R6.9G.10.3.4] Start-time template readiness guard
 */
async function ensureTemplateReadyForStart() {
    const msgEl = document.getElementById('tpl-message');
    const domMsg = (msgEl ? msgEl.value : '').trim();
    const hasDomMsg = domMsg.length > 0;

    let stored = null;
    try {
        stored = await chrome.storage.local.get(['templates_v2', 'xpider_tpl']);
    } catch (_) {}

    const v2Store = stored?.templates_v2;
    const defaultId = v2Store?.defaultId || 'unknown';
    const canonicalTpl = (defaultId && v2Store?.templates) ? v2Store.templates[defaultId] : stored?.xpider_tpl;
    const canonicalMsg = _getTemplateMessageString(canonicalTpl);
    const hasCanonicalMsg = canonicalMsg.length > 0;

    console.log(`[TEMPLATE_START_GUARD] templateId=${defaultId} domMessage=${hasDomMsg} canonicalMessage=${hasCanonicalMsg} dirty=${isMessageDirty}`);

    if (!hasDomMsg) {
        if (!isMessageDirty && hasCanonicalMsg) {
            const hydResult = await rehydrateTemplateUI('start_guard', v2Store);
            return { ready: hydResult.messagePresent, message: (msgEl ? msgEl.value : '').trim() };
        }
        return { ready: false, message: '' };
    }

    return { ready: true, message: domMsg };
}

/**
 * [R6.9G.10.3.4] UI Safety: automatically switch to Message Template tab and highlight Message Body
 */
function switchToTemplateTabAndFocusMessage() {
    const tplTabBtn = document.querySelector('.tab-btn[data-tab="template"]');
    if (tplTabBtn) tplTabBtn.click();
    const msgEl = document.getElementById('tpl-message');
    if (msgEl) {
        msgEl.focus();
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgEl.style.outline = '2px solid #ef4444';
        setTimeout(() => { if (msgEl) msgEl.style.outline = ''; }, 3000);
    }
}

async function hydrateSettings(overrideV2Store = null) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.warn('[hydrateSettings] chrome.storage.local not available');
        return false;
    }
    const data = await chrome.storage.local.get([
        'xpider_lang', 'xpider_tpl', 'templates_v2',
        'xpider_delay', 'xpider_delay_collect', 'xpider_delay_fill', 'xpider_delay_submit',
        'xpider_captcha_enabled', 'xpider_captcha_method',
        'xpider_captcha_api_key',
        'xpider_captcha_api_key_nopecha',
        'xpider_captcha_api_key_2captcha',
        'xpider_captcha_poll_interval_sec',
        'xpider_captcha_poll_interval_ms',
        'xpider_captcha_max_wait_sec',
        'xpider_stt_api_key', 'xpider_stealth_mode', 'xpider_double_submit', 'xpider_fill_mode',
        'xpider_random_delay'
    ]);

    if (data.xpider_lang) {
        const langSelect = document.getElementById('language-select');
        if (langSelect) langSelect.value = data.xpider_lang;
    }

    const captchaEnabled = (data.xpider_captcha_enabled !== undefined) ? !!data.xpider_captcha_enabled : true;
    const captchaMethod = data.xpider_captcha_method || 'api';

    // [NopeCHA Fix] Load per-method API key: each method stores its own key separately
    function getMethodKey(method) {
        if (method === 'nopecha') return data.xpider_captcha_api_key_nopecha || data.xpider_captcha_api_key || '';
        return data.xpider_captcha_api_key_2captcha || data.xpider_captcha_api_key || '';
    }
    const captchaApiKey = getMethodKey(captchaMethod);

    const captchaToggle = document.getElementById('captcha-solve-toggle');
    if (captchaToggle) captchaToggle.checked = captchaEnabled;

    const methodSelect = document.getElementById('captcha-method-select');
    if (methodSelect) {
        methodSelect.value = captchaMethod;
        // [NopeCHA Fix] When method changes in UI, swap in the correct saved key & update timing placeholders
        methodSelect.addEventListener('change', async () => {
            const newMethod = methodSelect.value;
            const stored = await chrome.storage.local.get(['xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha']);
            const apiKeyEl = document.getElementById('captcha-api-key');
            if (apiKeyEl) {
                apiKeyEl.value = newMethod === 'nopecha'
                    ? (stored.xpider_captcha_api_key_nopecha || '')
                    : (stored.xpider_captcha_api_key_2captcha || '');
            }
            const pollInput = document.getElementById('captcha-poll-interval');
            const waitInput = document.getElementById('captcha-max-wait');
            if (pollInput) pollInput.placeholder = newMethod === 'nopecha' ? '3' : '5';
            if (waitInput) waitInput.placeholder = newMethod === 'nopecha' ? '120' : '200';
        });
    }

    const apiKeyInput = document.getElementById('captcha-api-key');
    if (apiKeyInput) apiKeyInput.value = captchaApiKey;

    // Load Solver Waiting & Polling Time settings
    const pollIntervalInput = document.getElementById('captcha-poll-interval');
    if (pollIntervalInput) {
        const storedSec = data.xpider_captcha_poll_interval_sec || (data.xpider_captcha_poll_interval_ms ? data.xpider_captcha_poll_interval_ms / 1000 : '');
        pollIntervalInput.value = storedSec || '';
        pollIntervalInput.placeholder = captchaMethod === 'nopecha' ? '3' : '5';
    }
    const maxWaitInput = document.getElementById('captcha-max-wait');
    if (maxWaitInput) {
        maxWaitInput.value = data.xpider_captcha_max_wait_sec || '';
        maxWaitInput.placeholder = captchaMethod === 'nopecha' ? '120' : '200';
    }

    const sttKeyInput = document.getElementById('audio-stt-key');
    if (sttKeyInput) sttKeyInput.value = data.xpider_stt_api_key || '';

    const stealthToggle = document.getElementById('stealth-mode-toggle');
    if (stealthToggle) stealthToggle.checked = (data.xpider_stealth_mode !== undefined) ? !!data.xpider_stealth_mode : true;

    const doubleSubmitToggle = document.getElementById('double-submit-toggle');
    if (doubleSubmitToggle) doubleSubmitToggle.checked = !!data.xpider_double_submit;

    const methodGroup = document.getElementById('captcha-method-group');
    if (methodGroup) methodGroup.style.display = captchaEnabled ? 'block' : 'none';
    if (typeof toggleCaptchaApiVisibility === 'function') toggleCaptchaApiVisibility();

    // [R6.9G.10.3.4] Template Hydration & Dropdown Sync
    await rehydrateTemplateUI('boot', overrideV2Store || data.templates_v2);

    if (document.getElementById('delay-input-collect')) {
        document.getElementById('delay-input-collect').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    if (document.getElementById('delay-input-fill')) {
        document.getElementById('delay-input-fill').value = data.xpider_delay_fill || 6;
    }
    if (document.getElementById('delay-input-submit')) {
        document.getElementById('delay-input-submit').value = data.xpider_delay_submit || 6;
    }
    if (document.getElementById('delay-input')) {
        document.getElementById('delay-input').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    if (typeof updateSpeedLabels === 'function') updateSpeedLabels();

    if (document.getElementById('random-delay-toggle')) {
        document.getElementById('random-delay-toggle').checked = !!data.xpider_random_delay;
    }

    const fillMode = data.xpider_fill_mode || 'instant';
    const fillModeEl = document.getElementById(`fill-mode-${fillMode}`);
    if (fillModeEl) fillModeEl.checked = true;

    // [R6.9G.9] Hydrate Privacy Gateway settings & Status Card
    try {
        const privData = await chrome.storage.local.get(['xpider_privacy_config']);
        const privCfg = privData.xpider_privacy_config || {};
        const privToggle = document.getElementById('privacy-gateway-toggle');
        if (privToggle) privToggle.checked = privCfg.enabled !== undefined ? !!privCfg.enabled : true;

        const privModeSelect = document.getElementById('privacy-transport-mode-select');
        const vpnSection = document.getElementById('privacy-system-vpn-fields');
        const vpnCheckbox = document.getElementById('privacy-vpn-confirm-checkbox');
        const vpnBadge = document.getElementById('privacy-vpn-status-badge');
        const vpnVerifyBtn = document.getElementById('privacy-vpn-verify-btn');
        const vpnRevokeBtn = document.getElementById('privacy-vpn-revoke-btn');

        const updateVpnStatusBadge = (confirmed) => {
            if (!vpnBadge) return;
            if (confirmed) {
                vpnBadge.textContent = 'CONFIRMED';
                vpnBadge.style.color = '#34d399';
                vpnBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                vpnBadge.style.border = '1px solid #10b981';
                if (vpnCheckbox) vpnCheckbox.checked = true;
            } else {
                vpnBadge.textContent = 'NOT CONFIRMED';
                vpnBadge.style.color = '#f87171';
                vpnBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                vpnBadge.style.border = '1px solid #ef4444';
                if (vpnCheckbox) vpnCheckbox.checked = false;
            }
        };

        if (privModeSelect) {
            const rawMode = privCfg.transportMode || 'PRIVACY_RELAY';
            privModeSelect.value = (rawMode === 'SYSTEM_VPN') ? 'EXTERNAL_VPN_MONITOR' : rawMode;
            const updateTransportVisibility = () => {
                const isProxy = privModeSelect.value === 'SOCKS5' || privModeSelect.value === 'HTTPS_PROXY';
                const isVpn = privModeSelect.value === 'EXTERNAL_VPN_MONITOR' || privModeSelect.value === 'SYSTEM_VPN';
                const isRelay = privModeSelect.value === 'PRIVACY_RELAY';
                const fields = document.getElementById('privacy-proxy-config-fields');
                const relayFields = document.getElementById('privacy-relay-config-fields');
                if (fields) fields.style.display = isProxy ? 'block' : 'none';
                if (vpnSection) vpnSection.style.display = isVpn ? 'block' : 'none';
                if (relayFields) relayFields.style.display = isRelay ? 'block' : 'none';
            };
            privModeSelect.addEventListener('change', async () => {
                updateTransportVisibility();
                if (privModeSelect.value !== 'EXTERNAL_VPN_MONITOR' && privModeSelect.value !== 'SYSTEM_VPN') {
                    updateVpnStatusBadge(false);
                }
                try {
                    const curData = await chrome.storage.local.get(['xpider_privacy_config']);
                    const curCfg = curData.xpider_privacy_config || {};
                    curCfg.transportMode = privModeSelect.value;
                    if (privModeSelect.value !== 'EXTERNAL_VPN_MONITOR' && privModeSelect.value !== 'SYSTEM_VPN') {
                        curCfg.systemVpnConfirmed = false;
                    }
                    await chrome.storage.local.set({ xpider_privacy_config: curCfg });
                    chrome.runtime.sendMessage({
                        action: 'SET_PRIVACY_CONFIG',
                        config: curCfg
                    }).catch(() => {});
                } catch (_) {}
            });
            updateTransportVisibility();
        }

        // [R6.9G.10] Hydrate Privacy Relay UI
        const relayModeSelect = document.getElementById('privacy-relay-mode-select');
        const relayDaemonBadge = document.getElementById('priv-relay-daemon-badge');
        const relayNodeDisplay = document.getElementById('priv-relay-active-node-display');
        const relayFpDisplay = document.getElementById('priv-relay-fingerprint-display');
        const relayRotateBtn = document.getElementById('priv-relay-rotate-btn');
        const relayRepairBtn = document.getElementById('priv-relay-repair-btn');

        const escapeRelayHtml = (str) => {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const updateRelayStatusUI = (statusData) => {
            if (relayDaemonBadge) {
                if (!statusData) {
                    relayDaemonBadge.textContent = 'OFFLINE';
                    relayDaemonBadge.style.color = '#f87171';
                    relayDaemonBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #ef4444';
                } else if (statusData.relayReady) {
                    relayDaemonBadge.textContent = 'ONLINE / READY';
                    relayDaemonBadge.style.color = '#34d399';
                    relayDaemonBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #10b981';
                } else if (statusData.totalNodes === 0 || !statusData.selectedEgressId) {
                    relayDaemonBadge.textContent = 'ONLINE / NO NODES';
                    relayDaemonBadge.style.color = '#fde047';
                    relayDaemonBadge.style.background = 'rgba(234, 179, 8, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #eab308';
                } else {
                    relayDaemonBadge.textContent = 'ONLINE / UNVERIFIED';
                    relayDaemonBadge.style.color = '#fde047';
                    relayDaemonBadge.style.background = 'rgba(234, 179, 8, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #eab308';
                }
            }

            if (relayNodeDisplay) {
                relayNodeDisplay.textContent = (statusData && statusData.selectedEgressId) ? statusData.selectedEgressId : '—';
            }

            if (relayFpDisplay) {
                if (statusData && statusData.egressFingerprint) {
                    relayFpDisplay.textContent = 'sha256:' + statusData.egressFingerprint;
                } else {
                    relayFpDisplay.textContent = (statusData && statusData.totalNodes > 0) ? 'Not verified' : 'Offline';
                }
            }

            if (relayModeSelect && statusData && statusData.rotationMode) {
                relayModeSelect.value = statusData.rotationMode;
            }

            if (relayRotateBtn) {
                const canRotate = !!(statusData && statusData.relayReady && statusData.totalNodes > 0);
                relayRotateBtn.disabled = !canRotate;
            }
        };

        const refreshRelayStatus = (cb) => {
            chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (res) => {
                if (res && res.success && res.result && res.result.status) {
                    updateRelayStatusUI(res.result.status);
                    onBackgroundMessageSuccess();
                    if (typeof cb === 'function') cb(res.result.status);
                } else {
                    updateRelayStatusUI(null);
                    if (relayDaemonBadge && res && res.result && res.result.reason === 'HTTP_401') {
                        relayDaemonBadge.textContent = 'UNAUTH';
                    }
                    if (typeof cb === 'function') cb(null);
                }
            });
        };
        window.refreshRelayStatus = refreshRelayStatus;
        window.updateRelayStatusUI = updateRelayStatusUI;
        refreshRelayStatus();

        if (relayModeSelect) {
            relayModeSelect.value = privCfg.relayRotationMode || 'FIXED';
            relayModeSelect.addEventListener('change', () => {
                chrome.runtime.sendMessage({
                    action: 'SET_PRIVACY_RELAY_MODE',
                    rotationMode: relayModeSelect.value
                }, () => refreshRelayStatus());
            });
        }

        if (relayRotateBtn) {
            relayRotateBtn.addEventListener('click', () => {
                relayRotateBtn.disabled = true;
                relayRotateBtn.textContent = '⏳ Rotating...';
                chrome.runtime.sendMessage({
                    action: 'ROTATE_PRIVACY_RELAY',
                    reason: 'OWNER_MANUAL_CLICK'
                }, (res) => {
                    relayRotateBtn.disabled = false;
                    relayRotateBtn.textContent = '🔄 Rotate Egress Now';
                    if (res && res.success && res.result) {
                        updateRelayStatusUI(res.result);
                        addLog(`🔄 [Privacy Relay] Egress rotated to: ${res.result.selectedEgressId} (FP: ${res.result.egressFingerprint})`, 'info');
                    }
                });
            });
        }

        if (relayRepairBtn) {
            relayRepairBtn.addEventListener('click', () => {
                relayRepairBtn.disabled = true;
                relayRepairBtn.textContent = '⚡ Starting...';
                if (relayDaemonBadge) {
                    relayDaemonBadge.textContent = 'STARTING...';
                    relayDaemonBadge.style.color = '#fde047';
                    relayDaemonBadge.style.background = 'rgba(234, 179, 8, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #eab308';
                }

                chrome.runtime.sendMessage({ action: 'START_PRIVACY_RELAY_NATIVE' }, (res) => {
                    if (res && res.success) {
                        addLog('⚡ [Privacy Relay] Native launch command dispatched. Polling daemon...', 'info');
                    }

                    // Bounded polling loop (up to 8 seconds, 1s interval)
                    let attempts = 0;
                    const maxAttempts = 8;
                    const pollTimer = setInterval(() => {
                        attempts++;
                        chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (pollRes) => {
                            if (pollRes && pollRes.success && pollRes.result && pollRes.result.status) {
                                clearInterval(pollTimer);
                                const st = pollRes.result.status;
                                updateRelayStatusUI(st);
                                refreshRelayNodes();
                                relayRepairBtn.disabled = false;
                                relayRepairBtn.textContent = '⚡ Start / Repair';
                                addLog(`⚡ [Privacy Relay] Daemon online (${st.relayReady ? 'READY' : (st.totalNodes === 0 ? 'ONLINE / NO NODES' : 'STANDBY')})`, 'success');
                            } else if (attempts >= maxAttempts) {
                                clearInterval(pollTimer);
                                updateRelayStatusUI(null);
                                relayRepairBtn.disabled = false;
                                relayRepairBtn.textContent = '⚡ Start / Repair';
                                addLog('⚠️ [Privacy Relay] Daemon not reachable after 8s bounded polling. Run install_companion.bat if needed.', 'warn');
                            }
                        });
                    }, 1000);
                });
            });
        }

        // [R6.9G.10.3 Blocker 4] Owner Egress Node Management Handlers
        const relayNodeCountEl = document.getElementById('priv-relay-node-count');
        const relayToggleAddBtn = document.getElementById('priv-relay-toggle-add-btn');
        const relayAddForm = document.getElementById('priv-relay-add-form');
        const relayNodeListContainer = document.getElementById('priv-relay-node-list-container');
        const nodeTypeEl = document.getElementById('priv-node-type');
        const nodeNameEl = document.getElementById('priv-node-name');
        const nodeHostEl = document.getElementById('priv-node-host');
        const nodePortEl = document.getElementById('priv-node-port');
        const nodeUserEl = document.getElementById('priv-node-user');
        const nodePassEl = document.getElementById('priv-node-pass');
        const nodeSaveBtn = document.getElementById('priv-node-save-btn');
        const nodeCancelBtn = document.getElementById('priv-node-cancel-btn');
        const nodeStatusMsgEl = document.getElementById('priv-node-status-msg');

        const showNodeStatus = (msg, isError = false) => {
            if (!nodeStatusMsgEl) return;
            nodeStatusMsgEl.style.display = 'block';
            nodeStatusMsgEl.textContent = msg;
            nodeStatusMsgEl.style.color = isError ? '#f87171' : '#34d399';
            nodeStatusMsgEl.style.background = isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
            nodeStatusMsgEl.style.border = isError ? '1px solid #ef4444' : '1px solid #10b981';
        };

        const renderRelayNodesList = (nodes = [], activeNodeId = null) => {
            if (!relayNodeListContainer) return;
            if (relayNodeCountEl) relayNodeCountEl.textContent = String(nodes.length);
            if (!nodes || nodes.length === 0) {
                relayNodeListContainer.innerHTML = '<div style="color: #64748b; text-align: center; padding: 6px;">No egress nodes configured. Add an HTTP/HTTPS proxy below to enable Relay privacy.</div>';
                return;
            }
            let html = '';
            nodes.forEach(n => {
                const isActive = n.id === activeNodeId;
                const activeBadge = isActive ? '<span style="color: #34d399; font-weight: 700; margin-right: 4px;">● ACTIVE</span>' : '';
                const safeId = escapeRelayHtml(n.id);
                const safeType = escapeRelayHtml(n.type);
                const safeHost = escapeRelayHtml(n.host);
                const safePort = escapeRelayHtml(n.port);
                const healthColor = n.lastHealth === 'HEALTHY' ? '#34d399' : (n.lastHealth === 'UNHEALTHY' ? '#f87171' : '#94a3b8');
                const healthBadge = `<span style="color: ${healthColor}; font-size: 9px; font-weight: 600; margin-left: 3px;">[${escapeRelayHtml(n.lastHealth || 'UNKNOWN')}]</span>`;
                const credBadge = n.username ? '<span style="color: #a78bfa; font-size: 9px; margin-left: 3px;" title="Secured via DPAPI">🔒 AUTH</span>' : '';
                html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 4px; border-bottom: 1px solid #1e293b; background: ${isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent'};">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;">
                        ${activeBadge}
                        <span style="color: #38bdf8; font-weight: 600;">${safeId}</span>
                        <span style="color: #94a3b8; font-size: 9px;">[${safeType}] ${safeHost}:${safePort}</span>
                        ${healthBadge}
                        ${credBadge}
                    </div>
                    <button type="button" class="priv-remove-node-btn" data-node-id="${safeId}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #f87171; border-radius: 3px; font-size: 8px; padding: 1px 4px; cursor: pointer;">Delete</button>
                </div>`;
            });
            relayNodeListContainer.innerHTML = html;

            relayNodeListContainer.querySelectorAll('.priv-remove-node-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idToRemove = e.target.getAttribute('data-node-id');
                    if (!idToRemove) return;
                    chrome.runtime.sendMessage({ action: 'REMOVE_PRIVACY_RELAY_NODE', nodeId: idToRemove }, (res) => {
                        if (res && res.success) {
                            addLog(`🗑️ [Privacy Relay] Removed egress node ${idToRemove}`, 'info');
                            refreshRelayNodes();
                            refreshRelayStatus();
                        }
                    });
                });
            });
        };

        const refreshRelayNodes = () => {
            chrome.runtime.sendMessage({ action: 'GET_PRIVACY_RELAY_NODES' }, (res) => {
                if (res && res.success && res.result && res.result.nodes) {
                    renderRelayNodesList(res.result.nodes, res.result.activeNodeId);
                }
            });
        };
        window.refreshRelayNodes = refreshRelayNodes;
        refreshRelayNodes();

        if (relayToggleAddBtn && relayAddForm) {
            relayToggleAddBtn.addEventListener('click', () => {
                const isHidden = relayAddForm.style.display === 'none';
                relayAddForm.style.display = isHidden ? 'block' : 'none';
                relayToggleAddBtn.textContent = isHidden ? '✖ Close Form' : '➕ Add Egress Node';
                if (nodeStatusMsgEl) nodeStatusMsgEl.style.display = 'none';
            });
        }

        if (nodeCancelBtn && relayAddForm) {
            nodeCancelBtn.addEventListener('click', () => {
                relayAddForm.style.display = 'none';
                if (relayToggleAddBtn) relayToggleAddBtn.textContent = '➕ Add Egress Node';
                if (nodeStatusMsgEl) nodeStatusMsgEl.style.display = 'none';
            });
        }

        if (nodeSaveBtn) {
            nodeSaveBtn.addEventListener('click', () => {
                const pType = nodeTypeEl ? nodeTypeEl.value : 'HTTP_PROXY';
                if (pType === 'SOCKS5') {
                    showNodeStatus('❌ SOCKS5 is not supported for Relay upstreams. Please select HTTP_PROXY or HTTPS_PROXY, or use Mode B (Managed SOCKS5 Proxy).', true);
                    return;
                }
                const pHost = nodeHostEl ? nodeHostEl.value.trim() : '';
                if (!pHost) {
                    showNodeStatus('❌ Please enter a proxy host.', true);
                    return;
                }
                const pPort = nodePortEl ? parseInt(nodePortEl.value.trim(), 10) : 0;
                if (!pPort || pPort < 1 || pPort > 65535) {
                    showNodeStatus('❌ Please enter a valid port (1-65535).', true);
                    return;
                }

                const nodePayload = {
                    type: pType,
                    host: pHost,
                    port: pPort,
                    name: nodeNameEl ? nodeNameEl.value.trim() : '',
                    username: nodeUserEl ? nodeUserEl.value.trim() : '',
                    password: nodePassEl ? nodePassEl.value : '',
                    enabled: true
                };

                nodeSaveBtn.disabled = true;
                nodeSaveBtn.textContent = '⏳ Saving & Verifying...';
                showNodeStatus('⏳ Step 1/2: Saving node to Companion pool...', false);

                chrome.runtime.sendMessage({ action: 'ADD_PRIVACY_RELAY_NODE', nodeData: nodePayload }, (res) => {
                    if (res && res.success && res.result && res.result.success) {
                        const addedNode = res.result.node;
                        showNodeStatus('⏳ Step 2/2: Probing canary & activating node...', false);

                        // Trigger 1-click select & canary verification
                        chrome.runtime.sendMessage({
                            action: 'SELECT_PRIVACY_RELAY_EGRESS',
                            egressId: addedNode.id
                        }, (selRes) => {
                            nodeSaveBtn.disabled = false;
                            nodeSaveBtn.textContent = '💾 Save Node to Pool';

                            // Clear input fields for safety
                            if (nodeHostEl) nodeHostEl.value = '';
                            if (nodePortEl) nodePortEl.value = '';
                            if (nodeUserEl) nodeUserEl.value = '';
                            if (nodePassEl) nodePassEl.value = '';
                            if (nodeNameEl) nodeNameEl.value = '';

                            if (selRes && selRes.success && selRes.result && selRes.result.success) {
                                const selData = selRes.result;
                                const fpSnippet = selData.egressFingerprint ? selData.egressFingerprint.substring(0, 8) : 'verified';
                                showNodeStatus(`✅ Node saved, probed & ACTIVE! (FP: sha256:${fpSnippet}...)`, false);
                                addLog(`🌐 [Privacy Relay] Added & activated node ${addedNode.id} (${addedNode.type} ${addedNode.host}:${addedNode.port}, FP: ${selData.egressFingerprint})`, 'success');
                                refreshRelayNodes();
                                refreshRelayStatus();
                                setTimeout(() => {
                                    if (relayAddForm) relayAddForm.style.display = 'none';
                                    if (relayToggleAddBtn) relayToggleAddBtn.textContent = '➕ Add Egress Node';
                                }, 1500);
                            } else {
                                const probeErr = (selRes && selRes.result && selRes.result.details) || (selRes && selRes.result && selRes.result.reason) || (selRes && selRes.error) || 'Canary probe failed';
                                showNodeStatus(`⚠️ Node saved, but canary probe failed: ${probeErr}`, true);
                                addLog(`⚠️ [Privacy Relay] Node ${addedNode.id} saved but canary probe failed: ${probeErr}`, 'warn');
                                refreshRelayNodes();
                                refreshRelayStatus();
                            }
                        });
                    } else {
                        nodeSaveBtn.disabled = false;
                        nodeSaveBtn.textContent = '💾 Save Node to Pool';
                        const errMsg = (res && res.result && res.result.reason) || (res && res.error) || 'Failed to save node';
                        showNodeStatus(`❌ ${errMsg}`, true);
                    }
                });
            });
        }

        const isVpnConfirmed = !!privCfg.systemVpnConfirmed;
        updateVpnStatusBadge(isVpnConfirmed);

        if (vpnVerifyBtn) {
            vpnVerifyBtn.addEventListener('click', async () => {
                vpnVerifyBtn.disabled = true;
                vpnVerifyBtn.textContent = '⏳ Verifying...';
                try {
                    if (vpnCheckbox) vpnCheckbox.checked = true;

                    const res = await new Promise(resolve => {
                        chrome.runtime.sendMessage({
                            action: 'VERIFY_SYSTEM_VPN'
                        }, resolve);
                    });

                    const isPreflightReady = !!(res && res.success && res.preflight && res.preflight.ready === true);
                    if (isPreflightReady) {
                        updateVpnStatusBadge(true);
                        onBackgroundMessageSuccess();
                        const curData = await chrome.storage.local.get(['xpider_privacy_config']);
                        const curCfg = curData.xpider_privacy_config || {};
                        curCfg.transportMode = 'SYSTEM_VPN';
                        curCfg.systemVpnConfirmed = true;
                        await chrome.storage.local.set({ xpider_privacy_config: curCfg });
                        if (res.preflight) {
                            _updatePrivacyCardUI(res.preflight);
                        }
                        addLog('✅ [Privacy Gateway] System VPN confirmed and verified ready.', 'success');
                    } else {
                        updateVpnStatusBadge(false);
                        const failureReason = (res && res.preflight && res.preflight.failureReason) || (res && res.error) || 'PREFLIGHT_VERIFICATION_FAILED';
                        const curData = await chrome.storage.local.get(['xpider_privacy_config']);
                        const curCfg = curData.xpider_privacy_config || {};
                        curCfg.transportMode = 'SYSTEM_VPN';
                        curCfg.systemVpnConfirmed = false;
                        await chrome.storage.local.set({ xpider_privacy_config: curCfg });
                        if (res && res.preflight) {
                            _updatePrivacyCardUI(res.preflight);
                        }
                        addLog(`❌ [Privacy Gateway] System VPN verification blocked: ${failureReason}`, 'error');
                        alert(`🛡️ PRIVACY GATEWAY FAIL-CLOSED\n\nSystem VPN verification failed:\n${failureReason}\n\nPlease verify your OS-level VPN is active and connected, then try again.`);
                    }
                } catch (e) {
                    updateVpnStatusBadge(false);
                    addLog(`❌ [Privacy Gateway] System VPN verify error: ${e.message}`, 'error');
                } finally {
                    vpnVerifyBtn.disabled = false;
                    vpnVerifyBtn.textContent = '✓ Verify & Use System VPN';
                }
            });
        }

        if (vpnRevokeBtn) {
            vpnRevokeBtn.addEventListener('click', async () => {
                try {
                    updateVpnStatusBadge(false);
                    const curData = await chrome.storage.local.get(['xpider_privacy_config']);
                    const curCfg = curData.xpider_privacy_config || {};
                    curCfg.transportMode = 'SYSTEM_VPN';
                    curCfg.systemVpnConfirmed = false;
                    await chrome.storage.local.set({ xpider_privacy_config: curCfg });

                    const res = await new Promise(resolve => {
                        chrome.runtime.sendMessage({
                            action: 'REVOKE_SYSTEM_VPN'
                        }, resolve);
                    });
                    if (res && res.preflight) {
                        _updatePrivacyCardUI(res.preflight);
                    }
                    addLog('⚠️ [Privacy Gateway] System VPN confirmation revoked. Fail-closed is active.', 'warn');
                } catch (e) {
                    addLog(`❌ [Privacy Gateway] Revoke error: ${e.message}`, 'error');
                }
            });
        }

        if (vpnCheckbox) {
            vpnCheckbox.addEventListener('change', () => {
                if (!vpnCheckbox.checked) {
                    updateVpnStatusBadge(false);
                }
            });
        }

        const privFailClosedToggle = document.getElementById('privacy-fail-closed-toggle');
        if (privFailClosedToggle) privFailClosedToggle.checked = privCfg.failClosed !== undefined ? !!privCfg.failClosed : true;

        const privHostEl = document.getElementById('privacy-proxy-host');
        if (privHostEl) privHostEl.value = privCfg.proxyHost || '';
        const privPortEl = document.getElementById('privacy-proxy-port');
        if (privPortEl) privPortEl.value = privCfg.proxyPort || 1080;
        const privUserEl = document.getElementById('privacy-proxy-user');
        if (privUserEl) privUserEl.value = privCfg.proxyUsername || '';
        const privPassEl = document.getElementById('privacy-proxy-pass');
        if (privPassEl) privPassEl.value = privCfg.proxyPassword || '';
        const privRememberEl = document.getElementById('privacy-proxy-remember-pass');
        if (privRememberEl) privRememberEl.checked = !!privCfg.rememberPassword;

        const preflightBtn = document.getElementById('priv-run-preflight-btn');
        if (preflightBtn) {
            preflightBtn.addEventListener('click', async () => {
                preflightBtn.disabled = true;
                preflightBtn.textContent = '⏳ Verifying Privacy Preflight...';
                try {
                    const res = await new Promise(resolve => {
                        chrome.runtime.sendMessage({ action: 'RUN_PRIVACY_PREFLIGHT' }, resolve);
                    });
                    if (res && res.preflight) {
                        _updatePrivacyCardUI(res.preflight);
                    }
                } catch (_) {}
                finally {
                    preflightBtn.disabled = false;
                    preflightBtn.textContent = '🔍 Run Privacy Preflight';
                }
            });
        }

        chrome.runtime.sendMessage({ action: 'GET_PRIVACY_CONFIG' }, (res) => {
            if (res && res.lastPreflight) {
                _updatePrivacyCardUI(res.lastPreflight);
            }
        });
    } catch (_) {}

    return true;
}

function _updatePrivacyCardUI(pf) {
    if (!pf) return;
    const elEn = document.getElementById('priv-card-enabled');
    const elTr = document.getElementById('priv-card-transport');
    const elFc = document.getElementById('priv-card-fail-closed');
    const elWb = document.getElementById('priv-card-webrtc');
    const elFb = document.getElementById('priv-card-fallback');
    const elEg = document.getElementById('priv-card-egress');
    const elDn = document.getElementById('priv-card-dns');
    const elIp = document.getElementById('priv-card-ipv6');
    const elLc = document.getElementById('priv-card-last-check');

    // [R6.9G.10.3.5 B.8] Truthful Transport Distinction
    let transportLabel = 'BLOCKED';
    let transportColor = '#f87171';
    const mode = pf.mode || '';

    if (mode === 'EXTERNAL_VPN_MONITOR' || mode === 'SYSTEM_VPN') {
        transportLabel = 'EXTERNAL VPN MONITORED (not enforced)';
        transportColor = '#fde047'; // Yellow: monitored, not enforced
    } else if (mode === 'SOCKS5' || mode === 'HTTPS_PROXY') {
        transportLabel = pf.ready ? 'MANAGED PROXY ENFORCED' : 'MANAGED PROXY (UNVERIFIED)';
        transportColor = pf.ready ? '#4ade80' : '#f87171';
    } else if (mode === 'PRIVACY_RELAY') {
        transportLabel = pf.ready ? 'PRIVACY RELAY ENFORCED' : 'PRIVACY RELAY (OFFLINE/UNVERIFIED)';
        transportColor = pf.ready ? '#4ade80' : '#f87171';
    } else if (mode === 'DIRECT') {
        transportLabel = 'DIRECT (PRIVACY OFF)';
        transportColor = '#94a3b8';
    }

    if (elTr) {
        elTr.textContent = transportLabel;
        elTr.style.color = transportColor;
    }

    if (elEn) {
        if (pf.ready) {
            elEn.textContent = 'ON (READY)';
            elEn.style.color = '#4ade80';
        } else if (mode === 'EXTERNAL_VPN_MONITOR' || mode === 'SYSTEM_VPN') {
            elEn.textContent = pf.failClosed ? 'BLOCKED (UNENFORCED)' : 'MONITORED ONLY';
            elEn.style.color = pf.failClosed ? '#f87171' : '#fde047';
        } else {
            elEn.textContent = pf.failureReason ? `BLOCKED (${pf.failureReason})` : 'NOT READY';
            elEn.style.color = '#f87171';
        }
    }

    if (elFc) elFc.textContent = pf.failClosed ? 'ON' : 'OFF';
    if (elWb) { elWb.textContent = pf.webrtcGuard; elWb.style.color = pf.webrtcGuard === 'PASS' ? '#4ade80' : '#f87171'; }
    if (elFb) {
        elFb.textContent = pf.directFallbackBlocked;
        elFb.style.color = pf.directFallbackBlocked === 'BLOCKED' ? '#4ade80' : (pf.directFallbackBlocked === 'UNVERIFIED' ? '#fde047' : '#f87171');
    }
    if (elEg) {
        elEg.textContent = pf.egressCheck;
        elEg.style.color = pf.egressCheck === 'PASS' ? '#4ade80' : (pf.egressCheck === 'FAIL' ? '#f87171' : '#fde047');
    }
    if (elDn) {
        elDn.textContent = pf.dnsPrivacy;
        elDn.style.color = pf.dnsPrivacy === 'PASS' ? '#4ade80' : '#94a3b8';
    }
    if (elIp) {
        elIp.textContent = pf.ipv6Protection;
        elIp.style.color = pf.ipv6Protection === 'PROTECTED' ? '#4ade80' : '#94a3b8';
    }
    if (elLc) elLc.textContent = pf.lastCheck ? new Date(pf.lastCheck).toLocaleTimeString() : 'Never';
}

async function hydrateCampaignState() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            console.warn('[hydrateCampaignState] chrome.runtime.sendMessage not available');
            return resolve(false);
        }

        chrome.runtime.sendMessage({ action: 'GET_STATE' }, async (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Popup] Initial GET_STATE error:', chrome.runtime.lastError.message);
                try {
                    const st = await chrome.storage.local.get(['xpider_queue', 'xpider_total', 'xpider_success']);
                    if (st.xpider_queue && st.xpider_queue.length > 0) {
                        campaignQueue = st.xpider_queue;
                        totalTargets = st.xpider_total || campaignQueue.length;
                        successCount = st.xpider_success || 0;
                        const countDisplay = document.getElementById('url-count-display');
                        if (countDisplay) countDisplay.textContent = `${campaignQueue.length} (remaining) / ${totalTargets} URLs`;
                    }
                } catch (_) {}
                return resolve(false);
            }

            if (response && response.success) {
                onBackgroundMessageSuccess();
                totalTargets = response.totalTargets || 0;
                successCount = response.successCount || 0;
                failedCount = response.failedCount || 0;
                completedCount = response.completedCount || 0;
                remainingTargets = response.remainingCount !== undefined ? response.remainingCount : 0;
                campaignPaused = !!response.isPaused;

                if (typeof updateRealTimeStatus === 'function') {
                    updateRealTimeStatus({
                        successCount: successCount,
                        failedCount: failedCount,
                        completedCount: completedCount,
                        remainingCount: remainingTargets,
                        totalTargets: totalTargets,
                        failureBreakdown: response.failureBreakdown || {}
                    });
                }

                if (response.isActive) {
                    campaignActive = true;
                    
                    const statusBox = document.getElementById('status-box');
                    if (statusBox) statusBox.classList.remove('hidden');
                    const multiActions = document.getElementById('multi-actions');
                    if (multiActions) multiActions.classList.remove('hidden');
                    const startBtn = document.getElementById('start-btn');
                    if (startBtn) startBtn.classList.add('hidden');
                    
                    const btn = document.getElementById('pause-btn');
                    const langSelect = document.getElementById('language-select');
                    const lang = langSelect ? langSelect.value : 'en';
                    const dict = (typeof i18nData !== 'undefined' && i18nData) ? (i18nData[lang] || i18nData['en'] || {}) : {};
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
                    const startBtn = document.getElementById('start-btn');
                    if (startBtn) startBtn.classList.remove('hidden');
                    const multiActions = document.getElementById('multi-actions');
                    if (multiActions) multiActions.classList.add('hidden');
                    if (totalTargets > 0 || completedCount > 0 || successCount > 0 || failedCount > 0) {
                        const statusBox = document.getElementById('status-box');
                        if (statusBox) statusBox.classList.remove('hidden');
                    }
                    addDiagnosticLog(`[Engine] Initial handshake synced: active=false, completed=${completedCount}, success=${successCount}, failed=${failedCount}`);
                }
                return resolve(true);
            }
            return resolve(false);
        });
    });
}

async function renderAuxiliaryUI() {
    try { await initLocalizer(); } catch(e) { console.warn('[Popup] initLocalizer non-fatal:', e); }
    try { await loadBlackBoxLogs(); } catch(e) {}
    try { await loadPersistentDiagnostics(); } catch(e) {}
    try { await updateSavedListsUI(); } catch(e) {}
    try { await updateTemplateDropdown(); } catch(e) {}

    // Speed slider listeners
    try {
        ['delay-input-collect', 'delay-input-fill', 'delay-input-submit'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSpeedLabels);
        });

        document.querySelectorAll('input[name="fill-mode"]').forEach(el => {
            el.addEventListener('change', (e) => {
                chrome.storage.local.set({ xpider_fill_mode: e.target.value }).catch(() => {});
            });
        });
    } catch(e) {}

    // Hard reset button
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

    // Engine status indicator
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

    // Pulse check
    try { startPulseCheck(); } catch(e) {}

    // Passive keep-alive
    try {
        setInterval(() => {
            chrome.runtime.sendMessage({ action: 'UI_HEARTBEAT' }).catch(() => {});
        }, 30000);
    } catch(e) {}
    // Counters restore & live sync
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
    try {
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
                        witStatusText.textContent = "Configured";
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
    } catch (_) {}
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[POPUP_BOOT] started');
    window.__xpider_boot.started = true;

    try {
        // 0. Synchronous messaging listeners
        try {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (!request) return;
                if (request.action === 'SENDER_LOG') {
                    addLog(request.message, request.logType);
                } else if (request.action === 'UPDATE_STATS') {
                    updateRealTimeStatus(request.data);
                } else if (request.action === 'CAMPAIGN_FINISHED') {
                    if (request.counters) {
                        updateRealTimeStatus({
                            totalTargets: request.counters.total,
                            successCount: request.counters.success,
                            failedCount: request.counters.failed,
                            completedCount: request.counters.completed,
                            remainingCount: 0,
                            failureBreakdown: request.counters.failureBreakdown
                        });
                    }
                    updateProgress(100);
                    const statusTitle = document.getElementById('status-title');
                    if (statusTitle) statusTitle.textContent = "Live Progress (Finished)";
                    const statusDetail = document.getElementById('status-detail');
                    if (statusDetail) statusDetail.textContent = "Campaign Complete: All targets finished.";
                } else if (request.action === 'CORE_RUNTIME_BROKEN_ALERT') {
                    addLog(`\uD83D\uDEA8 [CIRCUIT BREAKER] Core runtime broken: ${request.symbol} is not defined. Campaign paused.`, 'error');
                } else if (request.action === 'EMAIL_COLLECTOR_CLEARED') {
                    if (typeof renderEmailCollectorUI === 'function') {
                        renderEmailCollectorUI();
                    }
                } else if (request.action === 'CAMPAIGN_FAULT') {
                    // [R6.9G.1-5] Campaign FAULT state (barrier could not close)
                    addLog(`\uD83D\uDEA8 [CAMPAIGN_FAULT] reason=${request.reason}. Campaign in FAULT state \u2014 not Finished.`, 'error');
                    const statusTitle = document.getElementById('status-title');
                    if (statusTitle) statusTitle.textContent = 'Live Progress (FAULT)';
                    const statusDetail = document.getElementById('status-detail');
                    if (statusDetail) statusDetail.textContent = `Campaign FAULT: ${request.reason}. Check extension log.`;

                } else if (request.action === 'PRIVACY_GATEWAY_BLOCKED') {
                    // [R6.9G.9] Fail-closed privacy gateway blocked start or execution
                    if (typeof _restoreStartButton === 'function') _restoreStartButton();
                    const reason = request.reason || 'Privacy transport requirements not met';
                    addLog(`🛡️ [PRIVACY_GATEWAY_BLOCKED] ${reason}. Campaign cannot run without verified privacy transport.`, 'error');
                    if (reason === 'SYSTEM_VPN_EGRESS_CHANGED') {
                        const vpnBadge = document.getElementById('privacy-vpn-status-badge');
                        if (vpnBadge) {
                            vpnBadge.textContent = 'NOT CONFIRMED';
                            vpnBadge.style.color = '#f87171';
                            vpnBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                            vpnBadge.style.border = '1px solid #ef4444';
                        }
                        const vpnCheckbox = document.getElementById('privacy-vpn-confirm-checkbox');
                        if (vpnCheckbox) vpnCheckbox.checked = false;
                        alert('🚨 PRIVACY GATEWAY FAIL-CLOSED\n\nCampaign paused:\nEgress network fingerprint changed while campaign was active! Re-confirm VPN in Settings > Privacy Gateway before continuing.');
                    }
                    const statusTitle = document.getElementById('status-title');
                    if (statusTitle) statusTitle.textContent = 'Live Progress (BLOCKED)';
                    const statusDetail = document.getElementById('status-detail');
                    if (statusDetail) statusDetail.textContent = `Privacy Gateway: ${reason}. Check Privacy settings.`;
                    try {
                        chrome.runtime.sendMessage({ action: 'GET_PRIVACY_CONFIG' }, (res) => {
                            if (res && res.lastPreflight) _updatePrivacyCardUI(res.lastPreflight);
                        });
                    } catch (_) {}

                } else if (request.action === 'SHOW_CAPTCHA_DECISION_MODAL') {
                    // [R6.9G.1-1/2] Owner CAPTCHA Decision Modal with exact attempt-bound identity
                    const _cReq = request;
                    const _attemptId = _cReq.attemptId || '';
                    const _targetToken = _cReq.targetToken || '';
                    const _campaignRunId = _cReq.campaignRunId || '';
                    const _sessionId = _cReq.sessionId;
                    const _captchaEpoch = _cReq.captchaEpoch || 0;
                    const _tabId = _cReq.tabId || 0;
                    const _captchaType = _cReq.captchaType || 'recaptcha';
                    const _sitekey = _cReq.sitekey || '';
                    const _targetUrl = _cReq.targetUrl || '';

                    // Remove any stale modal
                    const _existingModal = document.getElementById('xpider-captcha-decision-modal');
                    if (_existingModal) _existingModal.remove();

                    const _modal = document.createElement('div');
                    _modal.id = 'xpider-captcha-decision-modal';
                    _modal.setAttribute('style', [
                        'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
                        'background:rgba(10,10,20,0.88)', 'z-index:99999',
                        'display:flex', 'align-items:center', 'justify-content:center',
                        'font-family:Inter,sans-serif'
                    ].join(';'));

                    const _typeLabel = _captchaType === 'hcaptcha' ? 'hCaptcha' : (_captchaType === 'turnstile' ? 'Cloudflare Turnstile' : 'reCAPTCHA');
                    let _shortUrl = '?';
                    try { _shortUrl = _targetUrl ? new URL(_targetUrl).hostname : '?'; } catch(_) {}

                    _modal.innerHTML = [
                        '<div style="background:#1a1d2e;border:1.5px solid #7c3aed;border-radius:14px;padding:28px 32px;max-width:400px;width:92%;box-shadow:0 8px 48px #0008;">',
                        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">',
                        '<span style="font-size:24px;">\uD83D\uDD10</span>',
                        '<div>',
                        '<div style="font-size:15px;font-weight:700;color:#e2e8f0;">CAPTCHA Detected</div>',
                        '<div style="font-size:11px;color:#a78bfa;margin-top:2px;">' + _typeLabel + ' \u00b7 ' + _shortUrl + '</div>',
                        '</div></div>',
                        '<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Attempt: <code style="color:#7c3aed;">' + (_attemptId ? _attemptId.substring(0, 16) + '\u2026' : 'none') + '</code></div>',
                        '<div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Token: <code style="color:#7c3aed;">' + (_targetToken ? _targetToken.substring(0, 12) + '\u2026' : 'none') + '</code></div>',
                        '<div style="font-size:12px;color:#94a3b8;margin-bottom:16px;">Epoch: <code style="color:#7c3aed;">' + _captchaEpoch + '</code> | Tab: <code style="color:#7c3aed;">' + _tabId + '</code></div>',
                        '<div style="font-size:13px;color:#e2e8f0;margin-bottom:20px;">Choose how to handle this CAPTCHA challenge:</div>',
                        '<div style="display:flex;gap:10px;flex-direction:column;">',
                        '<button id="xpider-captcha-auto-btn" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;">\u26a1 Auto-Solve (Selected Provider)</button>',
                        '<button id="xpider-captcha-manual-btn" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;">\u270B Manual Solve (Timer Paused)</button>',
                        '<button id="xpider-captcha-skip-btn" style="background:transparent;color:#64748b;border:1px solid #334155;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;">Skip this target</button>',
                        '</div>',
                        '<div id="xpider-captcha-status" style="margin-top:14px;font-size:12px;color:#64748b;text-align:center;"></div>',
                        '</div>'
                    ].join('');

                    document.body.appendChild(_modal);

                    function _sendCaptchaDecision(decision) {
                        const _statusEl = document.getElementById('xpider-captcha-status');
                        if (_statusEl) _statusEl.textContent = 'Sending decision: ' + decision + '\u2026';
                        chrome.runtime.sendMessage({
                            action: 'CAPTCHA_OWNER_DECISION',
                            decision: decision,
                            attemptId: _attemptId,
                            targetToken: _targetToken,
                            campaignRunId: _campaignRunId,
                            sessionId: _sessionId,
                            captchaEpoch: _captchaEpoch,
                            tabId: _tabId,
                            captchaType: _captchaType,
                            sitekey: _sitekey
                        }, function(resp) {
                            const _s = document.getElementById('xpider-captcha-status');
                            if (_s) {
                                if (decision === 'auto') {
                                    _s.innerHTML = (resp && resp.success)
                                        ? '<span style="color:#a78bfa;">⚡ Solving via provider... Modal remains open until verified.</span>'
                                        : '<span style="color:#ef4444;">❌ Auto-solve request failed: ' + (resp?.error || 'no response') + '</span>';
                                } else if (decision === 'manual') {
                                    _s.innerHTML = '<span style="color:#38bdf8;">✋ Manual solve active. Timer paused until resolution or Skip.</span>';
                                } else if (decision === 'skip') {
                                    _s.innerHTML = '<span style="color:#94a3b8;">⏭️ Target skipped.</span>';
                                    setTimeout(function() {
                                        const _m = document.getElementById('xpider-captcha-decision-modal');
                                        if (_m) _m.remove();
                                    }, 800);
                                }
                            }
                        });
                    }

                    document.getElementById('xpider-captcha-auto-btn')?.addEventListener('click', function() { _sendCaptchaDecision('auto'); });
                    document.getElementById('xpider-captcha-manual-btn')?.addEventListener('click', function() { _sendCaptchaDecision('manual'); });
                    document.getElementById('xpider-captcha-skip-btn')?.addEventListener('click', function() { _sendCaptchaDecision('skip'); });

                } else if (request.action === 'CAPTCHA_PROVIDER_FAILED') {
                    // [R6.9G.8 Directive 5] Provider failure: modal remains open and paused, shows safe error, offers Retry/Manual/Skip
                    const _modal = document.getElementById('xpider-captcha-decision-modal');
                    if (_modal) {
                        const _statusEl = document.getElementById('xpider-captcha-status');
                        if (_statusEl) {
                            _statusEl.innerHTML = [
                                '<div style="color:#ef4444;font-weight:600;margin-bottom:6px;">⚠️ Provider Error (' + (request.provider || 'Solver') + '): ' + (request.error || 'Failed') + '</div>',
                                '<div style="color:#cbd5e1;font-size:11px;margin-bottom:8px;">Target deadline remains frozen. Choose next action:</div>',
                                '<div style="display:flex;gap:6px;justify-content:center;">',
                                '<button id="xpider-provider-retry-btn" style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;font-weight:600;">🔄 Retry Provider</button>',
                                '<button id="xpider-provider-manual-btn" style="background:#0284c7;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;font-weight:600;">✋ Manual Solve</button>',
                                '<button id="xpider-provider-skip-btn" style="background:#334155;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;">⏭️ Skip</button>',
                                '</div>'
                            ].join('');

                            document.getElementById('xpider-provider-retry-btn')?.addEventListener('click', function() {
                                document.getElementById('xpider-captcha-auto-btn')?.click();
                            });
                            document.getElementById('xpider-provider-manual-btn')?.addEventListener('click', function() {
                                document.getElementById('xpider-captcha-manual-btn')?.click();
                            });
                            document.getElementById('xpider-provider-skip-btn')?.addEventListener('click', function() {
                                document.getElementById('xpider-captcha-skip-btn')?.click();
                            });
                        }
                    }

                } else if (request.action === 'SHOW_MANUAL_FORM_ASSIST_MODAL') {
                    // [R6.9G.8 Directive 2] Sticky Owner-Gated Manual Form Assist Modal
                    const _mReq = request;
                    const _attemptId = _mReq.attemptId || '';
                    const _targetToken = _mReq.targetToken || '';
                    const _campaignRunId = _mReq.campaignRunId || '';
                    const _sessionId = _mReq.sessionId;
                    const _sourceUrl = _mReq.sourceUrl || '';
                    const _contactUrl = _mReq.contactPageUrl || '';
                    const _formUrl = _mReq.formPageUrl || '';
                    const _extUrl = _mReq.externalFormUrl || '';
                    const _reason = _mReq.reason || 'MANUAL_ASSIST_REQUIRED';
                    const _unresolved = _mReq.unresolvedFields || [];
                    const _tpl = _mReq.template || {};

                    const _existingModal = document.getElementById('xpider-manual-assist-modal');
                    if (_existingModal) _existingModal.remove();

                    const _modal = document.createElement('div');
                    _modal.id = 'xpider-manual-assist-modal';
                    _modal.setAttribute('style', [
                        'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
                        'background:rgba(10,10,20,0.92)', 'z-index:99999',
                        'display:flex', 'align-items:center', 'justify-content:center',
                        'font-family:Inter,sans-serif', 'overflow-y:auto', 'padding:20px 0'
                    ].join(';'));

                    const _tVals = {
                        firstName: _tpl.firstName || _tpl.first_name || '',
                        lastName: _tpl.lastName || _tpl.last_name || '',
                        fullName: _tpl.fullName || _tpl.name || `${_tpl.firstName || ''} ${_tpl.lastName || ''}`.trim(),
                        email: _tpl.email || '',
                        phone: _tpl.phone || '',
                        subject: _tpl.subject || '',
                        message: _tpl.message || _tpl.messageBody || _tpl.body || ''
                    };

                    const copyItemHtml = (label, val) => `
                        <div style="display:flex;align-items:center;justify-content:space-between;background:#111322;border:1px solid #334155;border-radius:6px;padding:6px 10px;margin-bottom:6px;">
                            <div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;"><strong style="color:#e2e8f0;">${label}:</strong> <span style="color:#cbd5e1;">${val ? val : '<em style="color:#64748b;">(empty)</em>'}</span></div>
                            <button class="manual-copy-field-btn" data-val="${encodeURIComponent(val)}" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;font-weight:600;flex-shrink:0;">Copy</button>
                        </div>
                    `;

                    _modal.innerHTML = `
                        <div style="background:#1a1d2e;border:1.5px solid #f59e0b;border-radius:14px;padding:24px 28px;max-width:480px;width:92%;box-shadow:0 8px 48px #0008;max-height:90vh;overflow-y:auto;">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                                <span style="font-size:26px;">🛠️</span>
                                <div>
                                    <div style="font-size:16px;font-weight:700;color:#f59e0b;">Manual Form Assist Required</div>
                                    <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">Target deadline paused · Automation waiting for Owner</div>
                                </div>
                            </div>
                            <div style="background:#0f172a;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;">
                                <div style="margin-bottom:4px;color:#94a3b8;"><strong>Reason:</strong> <span style="color:#f59e0b;font-weight:600;">${_reason}</span></div>
                                <div style="margin-bottom:4px;color:#94a3b8;"><strong>Source:</strong> <a href="${_sourceUrl}" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:underline;">${_sourceUrl}</a></div>
                                <div style="margin-bottom:4px;color:#94a3b8;"><strong>Contact Page:</strong> <a href="${_contactUrl}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline;">${_contactUrl || 'None'}</a></div>
                                ${_extUrl ? `<div style="margin-bottom:4px;color:#94a3b8;"><strong>External Form / Widget:</strong> <a href="${_extUrl}" target="_blank" rel="noopener noreferrer" style="color:#ec4899;text-decoration:underline;">${_extUrl}</a></div>` : ''}
                                ${_unresolved.length > 0 ? `<div style="margin-top:6px;color:#f87171;"><strong>Unresolved Fields:</strong> ${_unresolved.join(', ')}</div>` : ''}
                            </div>
                            <div style="margin-bottom:12px;">
                                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                                    <span style="font-size:13px;font-weight:600;color:#e2e8f0;">Saved Template Values:</span>
                                    <button id="manual-copy-all-btn" style="background:#8b5cf6;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600;">📋 COPY ALL TEMPLATE</button>
                                </div>
                                ${copyItemHtml('First Name', _tVals.firstName)}
                                ${copyItemHtml('Last Name', _tVals.lastName)}
                                ${copyItemHtml('Full Name', _tVals.fullName)}
                                ${copyItemHtml('Email', _tVals.email)}
                                ${copyItemHtml('Phone', _tVals.phone)}
                                ${copyItemHtml('Subject', _tVals.subject)}
                                ${copyItemHtml('Message', _tVals.message)}
                            </div>
                            <div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">Owner Actions:</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                <button id="manual-action-retry-btn" style="background:#2563eb;color:#fff;border:none;border-radius:6px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;">🔄 Retry Detection/Autofill</button>
                                <button id="manual-action-wait-btn" style="background:#475569;color:#fff;border:none;border-radius:6px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;">✋ Manual Fill (Remain Paused)</button>
                                <button id="manual-action-confirmed-btn" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;">✅ I Submitted Manually</button>
                                <button id="manual-action-skip-btn" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;">⏭️ Could Not Submit / Skip</button>
                            </div>
                            <div id="manual-assist-status" style="margin-top:12px;font-size:12px;color:#94a3b8;text-align:center;"></div>
                        </div>
                    `;

                    document.body.appendChild(_modal);

                    // Copy handlers
                    _modal.querySelectorAll('.manual-copy-field-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const val = decodeURIComponent(e.target.dataset.val || '');
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(val);
                            }
                            e.target.textContent = 'Copied!';
                            setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
                        });
                    });
                    const copyAllBtn = document.getElementById('manual-copy-all-btn');
                    if (copyAllBtn) {
                        copyAllBtn.addEventListener('click', () => {
                            const allText = Object.entries(_tVals).map(([k, v]) => `${k}: ${v}`).join('\n');
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(allText);
                            }
                            copyAllBtn.textContent = '✅ Copied All!';
                            setTimeout(() => { copyAllBtn.textContent = '📋 COPY ALL TEMPLATE'; }, 1500);
                        });
                    }

                    // Action handlers
                    function _sendManualDecision(decision) {
                        const statusEl = document.getElementById('manual-assist-status');
                        if (statusEl) statusEl.textContent = `Applying decision: ${decision}...`;
                        chrome.runtime.sendMessage({
                            action: 'FORM_MANUAL_ASSIST_DECISION',
                            decision: decision,
                            attemptId: _attemptId,
                            targetToken: _targetToken,
                            campaignRunId: _campaignRunId,
                            sessionId: _sessionId,
                            reason: _reason
                        }, (resp) => {
                            if (statusEl) {
                                statusEl.textContent = (resp && resp.success)
                                    ? `Decision applied: ${decision}`
                                    : `Failed: ${resp?.error || 'no response'}`;
                            }
                            if (decision !== 'manual_fill') {
                                setTimeout(() => {
                                    const m = document.getElementById('xpider-manual-assist-modal');
                                    if (m) m.remove();
                                }, 1000);
                            }
                        });
                    }

                    document.getElementById('manual-action-retry-btn')?.addEventListener('click', () => _sendManualDecision('retry'));
                    document.getElementById('manual-action-wait-btn')?.addEventListener('click', () => _sendManualDecision('manual_fill'));
                    document.getElementById('manual-action-confirmed-btn')?.addEventListener('click', () => _sendManualDecision('submitted_manually'));
                    document.getElementById('manual-action-skip-btn')?.addEventListener('click', () => _sendManualDecision('skip'));

                } else if (request.action === 'CLOSE_ALL_MODALS') {
                    document.getElementById('xpider-captcha-decision-modal')?.remove();
                    document.getElementById('xpider-manual-assist-modal')?.remove();
                }
            });
        } catch(e) { console.error('[POPUP_BOOT] onMessage registration failed:', e); }

        try {
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'runtime-on-message') {
                    const request = event.data.data;
                    if (!request) return;
                    if (request.action === 'SENDER_LOG') {
                        addLog(request.message, request.logType);
                    } else if (request.action === 'UPDATE_STATS') {
                        updateRealTimeStatus(request.data);
                    }
                }
            });
        } catch(e) { console.error('[POPUP_BOOT] postMessage listener failed:', e); }

        // 1. Critical Controls Binding (Isolated synchronous error boundary)
        try {
            bindCriticalControls();
        } catch (e) {
            console.error('[POPUP_BOOT] bindCriticalControls error:', e);
            displayControlPlaneError('BIND_CRITICAL_CONTROLS_FAILED', e.message);
        }

        // 2. Full Secondary Events Binding (Tabs, secondary buttons, modals)
        try {
            bindEvents();
        } catch (e) {
            console.error('[POPUP_BOOT] bindEvents non-critical error:', e);
        }

        // 3. Runtime connection
        try { chrome.runtime.connect({ name: 'xpider_popup' }); } catch(e) {}

        // 3.5. Schema Migration / Repair Synchronization (Single Writer Handshake)
        let migrationResult = null;
        try {
            migrationResult = await ensureSchemaReady();
            window.__xpider_boot.schemaReady = true;
            console.log(`[POPUP_BOOT] schemaReady=true migrated=${!!migrationResult?.migrated} repaired=${!!migrationResult?.repaired}`);
        } catch (e) {
            window.__xpider_boot.schemaReady = false;
            console.warn('[POPUP_BOOT] ensureSchemaReady error:', e);
        }

        // 4. Settings Hydration (Isolated boundary - failure does NOT block Start button)
        try {
            const hydOk = await hydrateSettings(migrationResult?.templates_v2);
            window.__xpider_boot.settingsHydrated = !!hydOk;
            console.log(`[POPUP_BOOT] settingsHydrated=${!!hydOk}`);
        } catch (e) {
            window.__xpider_boot.settingsHydrated = false;
            console.error('[POPUP_BOOT] settingsHydrated=false error:', e);
        }

        // 5. Campaign State Handshake (Isolated boundary - failure does NOT block Save button)
        try {
            const stateAck = await hydrateCampaignState();
            window.__xpider_boot.getStateAck = !!stateAck;
            console.log(`[POPUP_BOOT] getStateAck=${!!stateAck}`);
        } catch (e) {
            window.__xpider_boot.getStateAck = false;
            console.error('[POPUP_BOOT] getStateAck=false error:', e);
        }

        // 6. Auxiliary UI (Localizer, logs, lists, templates)
        try {
            await renderAuxiliaryUI();
        } catch (e) {
            console.warn('[POPUP_BOOT] renderAuxiliaryUI non-fatal error:', e);
        }

        window.__xpider_boot.ready = true;
        console.log('[POPUP_BOOT] ready=true');
    } catch (fatalBootErr) {
        window.__xpider_boot.ready = false;
        console.error(`[POPUP_BOOT_FATAL] error=${fatalBootErr.message} stack=${fatalBootErr.stack || 'none'}`);
        displayControlPlaneError('POPUP_BOOT_FATAL', fatalBootErr.message);
    }
});

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
    if (!data) return;
    lastStatsData = data;
    if (data.scope || data.campaignRunId) {
        const _liveScope = data.scope || (data.campaignRunId ? 'currentRun' : 'currentGeneration');
        console.log(`[LEDGER_STATS] scope=${_liveScope}${data.campaignRunId ? ' campaignRunId=' + data.campaignRunId : ''} success=${data.successCount || 0} failed=${data.failedCount || 0} unknown=${data.deliveryUnknownCount || 0}`);
    }
    if (data.totalTargets !== undefined && data.totalTargets > 0) {
        totalTargets = data.totalTargets;
    }

    // 1. Success Count
    if (data.successCount !== undefined) {
        successCount = data.successCount;
    } else if (data.counters && data.counters.success !== undefined) {
        successCount = data.counters.success;
    }
    const successDisplay = document.getElementById('success-count-display');
    if (successDisplay) successDisplay.textContent = successCount;

    // Refresh the status label if finished
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
        if (suffixLabel) suffixLabel.textContent = suffixText;
    }

    // 2. Failed Count (deterministic failure only)
    if (data.failedCount !== undefined) {
        failedCount = data.failedCount;
    } else if (data.counters && data.counters.failed !== undefined) {
        failedCount = data.counters.failed;
    }
    const failedDisplay = document.getElementById('failed-count-display');
    if (failedDisplay) failedDisplay.textContent = failedCount;

    // 3. Timeout Count
    const timeoutCount = (data.timeoutCount !== undefined) 
        ? data.timeoutCount 
        : (data.counters && data.counters.timeout !== undefined ? data.counters.timeout : 0);
    const timeoutDisplay = document.getElementById('timeout-count-display');
    if (timeoutDisplay) timeoutDisplay.textContent = timeoutCount;

    // 4. Delivery Unknown Count
    const unknownCount = (data.deliveryUnknownCount !== undefined)
        ? data.deliveryUnknownCount
        : (data.counters && data.counters.deliveryUnknown !== undefined ? data.counters.deliveryUnknown : (data.unknownCount || 0));
    const unknownDisplay = document.getElementById('unknown-count-display');
    if (unknownDisplay) unknownDisplay.textContent = unknownCount;

    // 5. Skipped Count
    const skippedCount = (data.skippedCount !== undefined)
        ? data.skippedCount
        : (data.counters && data.counters.skipped !== undefined ? data.counters.skipped : 0);
    const skippedDisplay = document.getElementById('skipped-count-display');
    if (skippedDisplay) skippedDisplay.textContent = skippedCount;

    // 6. Completed Count (all terminal rows)
    if (data.completedCount !== undefined) {
        completedCount = data.completedCount;
    } else if (data.counters && data.counters.completed !== undefined) {
        completedCount = data.counters.completed;
    } else if (data.remainingCount !== undefined && totalTargets > 0) {
        completedCount = Math.max(0, totalTargets - data.remainingCount);
    } else if (data.successCount !== undefined || data.failedCount !== undefined) {
        completedCount = Math.max(completedCount, successCount + failedCount + timeoutCount + unknownCount + skippedCount);
    }
    const completedDisplay = document.getElementById('completed-count-display');
    if (completedDisplay) completedDisplay.textContent = completedCount;

    // 7. Remaining Count
    if (data.remainingCount !== undefined) {
        remainingTargets = data.remainingCount;
    } else if (data.counters && data.counters.remaining !== undefined) {
        remainingTargets = data.counters.remaining;
    } else if (totalTargets > 0) {
        remainingTargets = Math.max(0, totalTargets - completedCount);
    }
    const remainingDisplay = document.getElementById('remaining-count-display');
    if (remainingDisplay) remainingDisplay.textContent = remainingTargets;

    // Ensure status box is unhidden whenever there are counts or active campaign
    if (totalTargets > 0 || completedCount > 0 || successCount > 0 || failedCount > 0 || remainingTargets > 0 || campaignActive) {
        const statusBox = document.getElementById('status-box');
        if (statusBox) statusBox.classList.remove('hidden');
    }

    // 8. CAPTCHA Solver Counters [R6.9F.3]
    const captchaSolvedCount = (data.captchaSolvedCount !== undefined)
        ? data.captchaSolvedCount
        : (data.counters && data.counters.captchaSolved !== undefined ? data.counters.captchaSolved : null);
    const captchaFailedCount = (data.captchaFailedCount !== undefined)
        ? data.captchaFailedCount
        : (data.counters && data.counters.captchaFailed !== undefined ? data.counters.captchaFailed : null);
    const captchaSolvedDisplay = document.getElementById('captcha-solved-display');
    if (captchaSolvedDisplay && captchaSolvedCount !== null) captchaSolvedDisplay.textContent = captchaSolvedCount;
    const captchaFailedDisplay = document.getElementById('captcha-failed-display');
    if (captchaFailedDisplay && captchaFailedCount !== null) captchaFailedDisplay.textContent = captchaFailedCount;

    // Update Progress Bar
    const progress = totalTargets > 0 ? Math.min(100, Math.round((completedCount / totalTargets) * 100)) : (completedCount > 0 && remainingTargets === 0 ? 100 : 0);
    updateProgress(progress);

    refreshStatusDetailUI();

    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) {
        const lang = document.getElementById('language-select')?.value || 'en';
        const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
        const remainingLabel = dict.remaining_suffix || 'remaining';
        countDisplay.textContent = `${remainingTargets} (${remainingLabel}) / ${totalTargets} URLs`;
    }

    if (data.failureBreakdown && typeof data.failureBreakdown === 'object') {
        renderFailureBreakdown(data.failureBreakdown);
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

    // 3. 등록 완료 대기 속도 매핑 라벨
    const submitSlider = document.getElementById('delay-input-submit');
    const submitDisplay = document.getElementById('speed-submit-display');
    if (submitSlider && submitDisplay) {
        const level = submitSlider.value;
        const msArr = [15000, 12000, 10000, 8000, 6000, 5000, 4000, 3000, 2000, 1000];
        const sec = ((msArr[parseInt(level)] || 4000) / 1000).toFixed(1);
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
    if (startBtn && !startBtn.dataset.bound) {
        startBtn.dataset.bound = 'true';
        startBtn.addEventListener('click', startCampaign);
    }
    
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
    if (saveSettingsBtn && !saveSettingsBtn.dataset.bound) {
        saveSettingsBtn.dataset.bound = 'true';
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

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
                    console.log(`[WitKey-Sync v2] Sender 실시간 입력 동기화: keyConfigured=${!!key}`);
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
            
            // [WitKey-Sync v2] 3개 키 모두 저장하여 Crawler와 실시간 동기화 및 캡챠 모드를 audio로 전환
            await chrome.storage.local.set({ 
                xpider_stt_api_key: key, 
                audioSttKey: key, 
                witKey: key,
                xpider_captcha_method: 'audio'
            });
            const settingsInput = document.getElementById('audio-stt-key');
            if (settingsInput) settingsInput.value = key;
            const methodSelect = document.getElementById('captcha-method-select');
            if (methodSelect) methodSelect.value = 'audio';
            
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

    // Persistence for Template with Dirty Tracking
    ['tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-phone', 'tpl-subject', 'tpl-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                if (id === 'tpl-message') isMessageDirty = true;
                isTemplateDirty = true;
                saveTemplate();
            });
            el.addEventListener('change', () => {
                if (id === 'tpl-message') isMessageDirty = true;
                isTemplateDirty = true;
                saveTemplate();
            });
        }
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
    try { initBuildProvenanceBadge(); } catch (_) {}
}

// ── [R6.9G.10.3.3] Centralized Start Gate & Build Handshake Control Plane ──
var currentStartGateState = 'READY';

function setStartGateState(state, reason = '') {
    currentStartGateState = state;
    try { (typeof window !== 'undefined' ? window : globalThis).currentStartGateState = state; } catch (_) {}
    if (typeof document === 'undefined') return;
    const mismatchBanner = document.getElementById('build-mismatch-banner');
    const startBtn = document.getElementById('start-btn');

    if (state === 'READY') {
        if (mismatchBanner) mismatchBanner.style.display = 'none';
        if (startBtn) {
            startBtn.removeAttribute('data-build-locked');
            if (typeof campaignActive === 'undefined' || !campaignActive) {
                startBtn.disabled = false;
                startBtn.title = '';
                if (startBtn.textContent === '⏳ Starting...' || startBtn.textContent === '⏳ Waking...') {
                    startBtn.textContent = '🚀 START SENDING';
                }
            }
        }
    } else if (state === 'LOCKED_MISMATCH') {
        // Confirmed build mismatch: strictly FAIL-CLOSED
        if (mismatchBanner) {
            mismatchBanner.style.display = 'block';
            mismatchBanner.title = reason;
        }
        if (startBtn) {
            startBtn.setAttribute('data-build-locked', 'true');
            startBtn.disabled = true;
            startBtn.title = `⚠️ ${reason}`;
        }
    } else if (state === 'TRANSIENT_WAIT') {
        // Background temporarily unreachable during boot:
        // NEVER permanently lock start button!
        if (mismatchBanner) mismatchBanner.style.display = 'none';
        if (startBtn) {
            startBtn.removeAttribute('data-build-locked');
            if (typeof campaignActive === 'undefined' || !campaignActive) {
                startBtn.disabled = false;
                startBtn.title = reason ? `Background waking: ${reason}` : '';
            }
        }
    } else if (state === 'CAMPAIGN_ACTIVE') {
        if (startBtn) {
            startBtn.classList.add('hidden');
        }
    }
}

function onBackgroundMessageSuccess() {
    if (currentStartGateState !== 'LOCKED_MISMATCH') {
        setStartGateState('READY');
    }
}

function _applyHandshakeUiState(isPassedOrState, errorReason = '') {
    if (typeof isPassedOrState === 'string') {
        setStartGateState(isPassedOrState, errorReason);
    } else if (isPassedOrState) {
        setStartGateState('READY');
    } else {
        // Legacy boolean false: determine whether confirmed mismatch or transient
        if (errorReason && (errorReason.includes('mismatch') || errorReason.includes('MISMATCH'))) {
            setStartGateState('LOCKED_MISMATCH', errorReason);
        } else {
            setStartGateState('TRANSIENT_WAIT', errorReason);
        }
    }
}

async function verifyBuildHandshake(options = {}) {
    const { retryOnTransient = false, maxRetries = 2, retryDelayMs = 250 } = options;
    const localInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
        ? BuildProvenance.BUILD_INFO
        : {
            implementationHead: '78d13d2663e6437531fcddc286c3fb4cb59bcbfd',
            headShort: '78d13d26',
            buildId: 'R6.9G.10.3.3-20261008-START-CONTROL-PLANE-RECOVERY',
            manifestVersion: 3
        };

    const localHead = localInfo.implementationHead;
    const localBuild = localInfo.buildId;

    const performSingleCheck = () => {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
                console.warn('[BUILD_HANDSHAKE] chrome.runtime.sendMessage not available');
                resolve({ ok: true, state: 'MATCH', localInfo, bgInfo: localInfo });
                return;
            }

            chrome.runtime.sendMessage({ action: 'GET_BUILD_PROVENANCE' }, (res) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr || !res || !res.success) {
                    const err = (lastErr && lastErr.message) || (res && res.error) || 'Failed to contact background';
                    console.warn(`[BUILD_HANDSHAKE] localHead=${localHead} backgroundHead=UNREACHABLE result=TRANSIENT error=${err}`);
                    resolve({ ok: false, state: 'UNREACHABLE_TRANSIENT', error: err, localInfo, bgInfo: null });
                    return;
                }

                const bgInfo = res.provenance || res;
                const bgHead = bgInfo.implementationHead;
                const bgBuild = bgInfo.buildId;

                const localManifest = localInfo.manifestVersion || 3;
                const bgManifest = bgInfo.manifestVersion;
                const isMatch = (localHead === bgHead && localBuild === bgBuild && Number(localManifest) === Number(bgManifest));
                if (isMatch) {
                    console.log(`[BUILD_HANDSHAKE] localHead=${localHead} backgroundHead=${bgHead} result=PASS`);
                    resolve({ ok: true, state: 'MATCH', localInfo, bgInfo });
                } else {
                    console.error(`[BUILD_HANDSHAKE] localHead=${localHead} backgroundHead=${bgHead} result=REJECT mismatch`);
                    const reason = `Runtime build mismatch! Popup is ${localBuild} [${localHead ? localHead.substring(0, 7) : ''}], but background worker is ${bgBuild} [${bgHead ? bgHead.substring(0, 7) : ''}]. Please reload the extension.`;
                    resolve({ ok: false, state: 'CONFIRMED_MISMATCH', error: reason, localInfo, bgInfo });
                }
            });
        });
    };

    let result = await performSingleCheck();

    if (result.state === 'UNREACHABLE_TRANSIENT' && retryOnTransient) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            await new Promise(r => setTimeout(r, retryDelayMs * attempt));
            result = await performSingleCheck();
            if (result.state !== 'UNREACHABLE_TRANSIENT') break;
        }
    }

    // Apply UI state through centralized gate
    if (result.state === 'MATCH') {
        setStartGateState('READY');
    } else if (result.state === 'CONFIRMED_MISMATCH') {
        setStartGateState('LOCKED_MISMATCH', result.error);
    } else {
        // UNREACHABLE_TRANSIENT: DO NOT lock start button!
        setStartGateState('TRANSIENT_WAIT', result.error);
    }

    return result;
}

function getBadgeTextFromBuildInfo(info) {
    if (!info) return 'TEST-ONLY R6.9G.9.4';
    const m = (info.buildId || '').match(/R\d+\.\d+[A-Za-z0-9\.]*/);
    const ver = m ? m[0] : 'R6.9G.9.4';
    const sha = info.implementationHeadShort || info.headShort || (info.implementationHead ? info.implementationHead.substring(0, 7) : 'dev');
    return `TEST-ONLY ${ver} [${sha}]`;
}

function initBuildProvenanceBadge() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('build-provenance-badge');
    const localInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
        ? BuildProvenance.BUILD_INFO
        : null;
    if (badge && localInfo) {
        badge.textContent = getBadgeTextFromBuildInfo(localInfo);
        badge.title = `TEST-ONLY DIAGNOSTIC BUILD: ${localInfo.buildId} | SHA: ${localInfo.head} | Branch: ${localInfo.branch}`;
        badge.style.background = 'rgba(234, 179, 8, 0.2)';
        badge.style.color = '#eab308';
        badge.style.borderColor = 'rgba(234, 179, 8, 0.5)';
    }

    // [R6.9G.10.3.3] Non-fatal, bounded retry on transient boot race
    verifyBuildHandshake({ retryOnTransient: true, maxRetries: 3, retryDelayMs: 250 }).then((res) => {
        if (badge && res && res.bgInfo) {
            const b = res.bgInfo;
            badge.textContent = getBadgeTextFromBuildInfo(b);
            badge.title = `TEST-ONLY DIAGNOSTIC BUILD: ${b.buildId} | SHA: ${b.implementationHead || b.head} | Branch: ${b.branch}`;
            badge.style.background = 'rgba(234, 179, 8, 0.2)';
            badge.style.color = '#eab308';
            badge.style.borderColor = 'rgba(234, 179, 8, 0.5)';
        }
    }).catch((err) => {
        console.warn('[BUILD_HANDSHAKE_INIT_WARN]', err);
    });
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

    const timingGroup = document.getElementById('captcha-timing-group');
    if (timingGroup) timingGroup.style.display = (enabled && isApi) ? 'block' : 'none';
    
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
    // ── [R6.9G.10.3.3] Immediate Start Diagnostics & State Guards ──
    console.log('[START_UI] click');
    const queueLen = (campaignQueue && Array.isArray(campaignQueue)) ? campaignQueue.length : 0;
    const msgInput = document.getElementById('tpl-message');
    const hasMsg = !!(msgInput && msgInput.value && msgInput.value.trim().length > 0);
    const startBtn = document.getElementById('start-btn');
    const buildLockState = startBtn ? (startBtn.getAttribute('data-build-locked') || 'unlocked') : 'unknown';
    console.log(`[START_GUARD] queue=${queueLen} messagePresent=${hasMsg} buildLock=${buildLockState}`);
    addLog(`[START_UI] click (queue=${queueLen}, msgPresent=${hasMsg}, buildLock=${buildLockState})`, 'info');

    function _restoreStartButton() {
        campaignActive = false;
        const btn = document.getElementById('start-btn');
        if (btn) {
            btn.classList.remove('hidden');
            btn.disabled = false;
            btn.removeAttribute('data-build-locked');
            btn.textContent = "🚀 START SENDING";
            btn.title = "";
        }
        const multiActions = document.getElementById('multi-actions');
        if (multiActions) multiActions.classList.add('hidden');
    }

    const manualInput = document.getElementById('manual-url-input');
    if (manualInput && manualInput.value.trim() && campaignQueue.length === 0) {
        await addSingleUrl();
    }

    // Explicit diagnostic on empty queue (No silent returns!)
    if (campaignQueue.length === 0) {
        console.warn('[START_BLOCKED_EMPTY_QUEUE]');
        addLog('⚠️ [START_BLOCKED_EMPTY_QUEUE] Target URL queue is empty. Load URLs before starting.', 'warn');
        addDiagnosticLog('[Engine][GUARD_FAIL] reason=START_BLOCKED_EMPTY_QUEUE', 'WARN');
        _restoreStartButton();
        return alert("Please upload a file or enter a URL first.");
    }

    // [R6.9G.10.3.4] Start-time template readiness guard
    const tplReady = await ensureTemplateReadyForStart();
    if (tplReady && tplReady.ready && tplReady.message) {
        const msgEl = document.getElementById('tpl-message');
        if (msgEl && !msgEl.value) msgEl.value = tplReady.message;
    }

    currentTpl = {
        firstName: document.getElementById('tpl-first-name')?.value || '',
        lastName: document.getElementById('tpl-last-name')?.value || '',
        name: document.getElementById('tpl-name')?.value || '',
        email: document.getElementById('tpl-email')?.value || '',
        phone: document.getElementById('tpl-phone')?.value || '',
        subject: document.getElementById('tpl-subject')?.value || '',
        message: document.getElementById('tpl-message')?.value || (tplReady?.message || '')
    };

    // Explicit diagnostic on empty message (No silent returns!)
    if (!currentTpl.message || !currentTpl.message.trim()) {
        console.warn('[START_BLOCKED_EMPTY_MESSAGE]');
        addLog('⚠️ [START_BLOCKED_EMPTY_MESSAGE] Message body is empty. Enter message content before starting.', 'warn');
        addDiagnosticLog('[Engine][GUARD_FAIL] reason=START_BLOCKED_EMPTY_MESSAGE', 'WARN');
        _restoreStartButton();
        switchToTemplateTabAndFocusMessage();
        return;
    }

    // [Phase 2B Component D / R1] Authoritatively bind template metadata to execution state & payload
    try {
        bindCampaignTemplateMetadata(currentTpl);
        currentTpl.id = currentTpl.templateId;
        currentTpl.version = currentTpl.templateVersion;
    } catch (_) {}

    // [R6.9G.10.3.3 Fail-Closed Build Handshake with Self-Healing Recovery]
    const handshake = await verifyBuildHandshake({ retryOnTransient: true, maxRetries: 2, retryDelayMs: 250 });
    if (!handshake.ok) {
        if (handshake.state === 'CONFIRMED_MISMATCH') {
            console.error(`[START_BLOCKED] RUNTIME_BUILD_MISMATCH reason=${handshake.error}`);
            addLog(`❌ [START_BLOCKED] Runtime build mismatch: ${handshake.error}`, 'error');
            alert(`❌ CANNOT START CAMPAIGN: RUNTIME BUILD MISMATCH\n\n${handshake.error || 'Extension components are running different builds.'}\n\nPlease reload the extension.`);
            _restoreStartButton();
            return Promise.reject(new Error(handshake.error || 'RUNTIME_BUILD_MISMATCH'));
        } else {
            console.error(`[START_BLOCKED] BACKGROUND_UNREACHABLE error=${handshake.error}`);
            addLog(`⚠️ [START_BLOCKED] BACKGROUND_UNREACHABLE: Background service worker did not respond (${handshake.error}). Please click Start again to wake it.`, 'warn');
            _restoreStartButton();
            return Promise.reject(new Error(`BACKGROUND_UNREACHABLE: ${handshake.error}`));
        }
    }

    // UI state: STARTING (Do NOT set campaignActive=true yet!)
    campaignPaused = false;
    successCount = 0;
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
    const levelToSubmitMs = [15000, 12000, 10000, 8000, 6000, 5000, 4000, 3000, 2000, 1000];
    
    const delayMs = levelToCollectMs[levelCollect] || 10000;
    const fillDelayMs = levelToFillMs[levelFill] || 300;
    const submitDelayMs = levelToSubmitMs[levelSubmit] || 4000;

    // [v4.15.0] 폼 자동 입력 방식 획득 및 동기화 저장
    const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
    const fillMode = fillModeEl ? fillModeEl.value : 'instant';
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ xpider_fill_mode: fillMode }).catch(() => {});
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
    try {
        bindCampaignTemplateMetadata(startPayload, currentTpl);
    } catch (_) {}

    // Hide resumable banner if starting a fresh campaign
    const banner = document.getElementById('resumable-campaign-banner');
    if (banner) banner.style.display = 'none';

    // [R6.9G.10.3.6.1 Single-Authority Privacy Start Prep]
    // Background service worker is the sole authoritative privacy-prep state owner.
    // Popup delegates privacy preparation to background and does not directly mutate transport.
    const prepResponse = await new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            return resolve({ success: false, error: 'CHROME_RUNTIME_UNAVAILABLE' });
        }
        chrome.runtime.sendMessage({
            action: 'ENSURE_ENFORCED_PRIVACY_FOR_START'
        }, (res) => {
            if (chrome.runtime.lastError) {
                return resolve({ success: false, error: chrome.runtime.lastError.message });
            }
            resolve(res || { success: false, error: 'NO_RESPONSE_FROM_BACKGROUND' });
        });
    });

    const prepResult = (prepResponse && prepResponse.success && prepResponse.result) ? prepResponse.result : null;

    if (!prepResult || !prepResult.ready) {
        _restoreStartButton();
        const blockReason = prepResult ? prepResult.reason : (prepResponse ? prepResponse.error : 'PRIVACY_PREP_FAILED');
        const userMsg = prepResult ? prepResult.userMessage : 'Privacy transport could not be prepared by background engine.';
        console.error(`[START_BLOCKED] PRIVACY_START_BLOCKED reason=${blockReason}`);
        addLog(`🛡️ [START_BLOCKED] ${userMsg || blockReason}`, 'error');
        
        // Open settings overlay and focus actionable field
        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsOverlay) settingsOverlay.classList.remove('hidden');

        const privGroup = document.getElementById('privacy-gateway-group');
        if (privGroup) privGroup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        if (prepResult && prepResult.actionSection === 'privacy-relay-add-form') {
            const relayFields = document.getElementById('privacy-relay-config-fields');
            if (relayFields) relayFields.style.display = 'block';
            const addForm = document.getElementById('priv-relay-add-form');
            if (addForm) addForm.style.display = 'block';
            const nodeHost = document.getElementById('priv-node-host');
            if (nodeHost) nodeHost.focus();
        } else if (prepResult && prepResult.actionSection === 'privacy-proxy-config-fields') {
            const proxyFields = document.getElementById('privacy-proxy-config-fields');
            if (proxyFields) proxyFields.style.display = 'block';
            const proxyHost = document.getElementById('privacy-proxy-host');
            if (proxyHost) proxyHost.focus();
        }

        alert(`🛡️ STRICT PRIVACY REQUIREMENT\n\n${userMsg || 'Strict Privacy needs an enforced relay/proxy.'}`);
        return Promise.reject(new Error(blockReason || 'PRIVACY_START_BLOCKED'));
    }

    // [PRIVACY_START_READY] Logged after background confirms ready
    console.log(`[PRIVACY_START_READY] mode=${prepResult.mode}`);
    addLog(`🛡️ [PRIVACY_START_READY] mode=${prepResult.mode}`, 'info');

    // If background self-healed mode, sync mode dropdown in UI
    if (prepResult.mode) {
        const privModeSelect = document.getElementById('privacy-transport-mode-select');
        if (privModeSelect && privModeSelect.value !== prepResult.mode) {
            privModeSelect.value = prepResult.mode;
            try {
                privModeSelect.dispatchEvent(new Event('change'));
            } catch (_) {}
        }
    }

    // [v20.0 Chrome Runtime Transport] Dispatch START_CAMPAIGN directly to background service worker
    console.log(`[START_IPC] sent queue=${startPayload.queue.length}`);
    addLog("[Engine] START_CAMPAIGN request sent", "info");
    const sendTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    addDiagnosticLog(`[Engine][TX] action=START_CAMPAIGN queue=${startPayload.queue.length} templateId=${startPayload.templateId} v=${startPayload.templateVersion} skipAttempted=${skipPreviouslyAttempted}`);

    return new Promise((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            const err = new Error("Chrome runtime messaging is not available");
            console.error('[START_IPC_SEND_FAILED]', err);
            _restoreStartButton();
            addLog(`❌ [Fatal Error] ${err.message}`, "error");
            return reject(err);
        }

        const localInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
            ? BuildProvenance.BUILD_INFO
            : { implementationHead: '48c23c7f8b0e81099d45aeb584e65d8713db7b37', buildId: 'R6.9F.1-20261005-RUNTIME-SUBMIT-COUNTERS', manifestVersion: 3 };

        chrome.runtime.sendMessage({
            action: 'START_CAMPAIGN',
            expectedImplementationHead: localInfo.implementationHead,
            expectedBuildId: localInfo.buildId,
            expectedManifestVersion: localInfo.manifestVersion || 3,
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
                console.error('[START_BG_HANDLER_NOT_REACHED]', err);
                _restoreStartButton();
                addDiagnosticLog(`[Engine][RX_FAIL][+${elapsedAckMs}ms] error=${err.message}`, "ERROR");
                addLog(`❌ [Background Engine] Start failed: ${err.message}`, "error");
                return reject(err);
            }

            if (!response || response.success === false) {
                const errMsg = (response && (response.reason || response.error)) || "Start rejected by background engine";
                const err = new Error(errMsg);
                console.error('[START_BG_HANDLER_NOT_REACHED]', err);
                _restoreStartButton();
                if (response && response.status === 'PRIVACY_GATEWAY_BLOCKED') {
                    const blkMsg = `🛡️ [PRIVACY_GATEWAY_BLOCKED] ${response.userMessage || response.reason || 'Protected transport unconfirmed'}`;
                    addLog(blkMsg, "error");
                    let detailMsg = response.userMessage;
                    if (!detailMsg) {
                        if (response.reason === 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE') {
                            detailMsg = "Strict Privacy needs an enforced relay/proxy. External VPN Monitor is not enforceable in Strict mode.";
                        } else if (response.reason === 'NO_HEALTHY_EGRESS' || response.reason === 'PRIVACY_RELAY_NO_HEALTHY_EGRESS') {
                            detailMsg = "Strict Privacy needs an enforced relay/proxy. No healthy egress is configured. Please add an HTTP/HTTPS proxy node.";
                        } else if (response.reason === 'RELAY_OFFLINE' || response.reason === 'PRIVACY_RELAY_OFFLINE') {
                            detailMsg = "Privacy Relay companion is offline. Run companion/install_companion.bat or start the service.";
                        } else if (response.reason === 'SYSTEM_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED') {
                            detailMsg = "System VPN mode is selected, but VPN confirmation has not been completed.\n\nOpen Settings > Privacy Gateway, connect your VPN, then click 'Verify & Use System VPN'.";
                        } else {
                            detailMsg = response.reason || 'Privacy transport is not ready.';
                        }
                    }
                    alert(`🛡️ PRIVACY GATEWAY FAIL-CLOSED\n\nCampaign START blocked:\n${detailMsg}`);
                    const settingsOverlay = document.getElementById('settings-overlay');
                    if (settingsOverlay) settingsOverlay.classList.remove('hidden');
                } else if (errMsg === 'RUNTIME_BUILD_MISMATCH') {
                    _applyHandshakeUiState(false, response.detail || errMsg);
                    alert(`❌ RUNTIME BUILD MISMATCH DETECTED BY BACKGROUND\n\n${response.detail || errMsg}\n\nPlease reload extension.`);
                }
                addDiagnosticLog(`[Engine][RX_REJECT][+${elapsedAckMs}ms] error=${errMsg}`, "ERROR");
                addLog(`❌ [Background Engine] Start failed: ${errMsg}`, "error");
                return reject(err);
            }

            // SUCCESS ACK: Now transition UI state to active
            console.log(`[START_ACK] ok=true latencyMs=${elapsedAckMs}`);
            console.log(`[START_STATE] active=true queue=${campaignQueue.length}`);
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
            updateRealTimeStatus({
                successCount: 0,
                failedCount: 0,
                completedCount: 0,
                remainingCount: campaignQueue.length,
                totalTargets: campaignQueue.length
            });
            updateProgress(0);

            // Post-ACK GET_STATE verification
            chrome.runtime.sendMessage({ action: 'GET_STATE' }, (stateResp) => {
                if (stateResp && stateResp.success) {
                    const qCount = stateResp.remainingCount !== undefined ? stateResp.remainingCount : campaignQueue.length;
                    addLog(`[Engine] Background state: active=${stateResp.isActive}, queue=${qCount}`, "info");
                    addDiagnosticLog(`[Engine][VERIFY] active=${stateResp.isActive} queue=${qCount}`);
                    if (!stateResp.isActive) {
                        console.warn('[START_STATE_NOT_ACTIVE] stateResp.isActive is false post-ACK');
                    }
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
    // Also mirror to diagnostic buffer with automatic sensitive redaction
    if (typeof addDiagnosticLog === 'function') {
        addDiagnosticLog(msg, (type || 'info').toUpperCase());
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
    const unknownCount = allRecords.filter(r => r.status === 'DELIVERY_UNKNOWN' || r.status === 'PAUSED_UNKNOWN').length;
    const failedCount = allRecords.filter(r => r.status === 'FAILURE').length;
    const skippedCount = allRecords.filter(r => r.status === 'SKIPPED').length;

    const elTot = document.getElementById('stat-ledger-total'); if (elTot) elTot.textContent = totalCount;
    const elSuc = document.getElementById('stat-ledger-success'); if (elSuc) elSuc.textContent = successCount;
    const elSup = document.getElementById('stat-ledger-suppressed'); if (elSup) elSup.textContent = suppressedCount;
    const elUnk = document.getElementById('stat-ledger-unknown'); if (elUnk) elUnk.textContent = unknownCount;
    const elFld = document.getElementById('stat-ledger-failed'); if (elFld) elFld.textContent = failedCount;
    const elSkp = document.getElementById('stat-ledger-skipped'); if (elSkp) elSkp.textContent = skippedCount;

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
            if (rec.status === 'CONFIRMED_SUCCESS') {
                badgeClass = 'status-success';
                badgeLabel = 'CONFIRMED_SUCCESS';
            } else if (rec.status === 'SUCCESS') {
                badgeClass = 'status-success';
                badgeLabel = 'SUCCESS';
            } else if (rec.isSuppressed) {
                badgeClass = 'status-suppressed';
                badgeLabel = 'SUPPRESSED';
            } else if (rec.status === 'DELIVERY_UNKNOWN' || rec.status === 'UNKNOWN' || rec.status === 'PAUSED_UNKNOWN') {
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

            // [R6.9G.8 Directive 8] Canonical Reusable Link Record (Source, Contact, Form, External, Result)
            const sourceUrl = rec.sourceUrl || rec.rawUrl || rec.targetIdentity || '';
            const contactUrl = rec.contactPageUrl || rec.selectedCandidateUrl || '';
            const formUrl = rec.formPageUrl || '';
            const externalFormUrl = rec.externalFormUrl || '';
            const resultUrl = rec.resultUrl || '';

            const formatShortUrl = (urlStr) => {
                if (!urlStr) return '-';
                try {
                    const u = new URL(urlStr);
                    let display = u.hostname + (u.pathname !== '/' ? u.pathname : '');
                    if (display.length > 30) display = display.substring(0, 27) + '...';
                    return display;
                } catch (_) {
                    return urlStr.length > 30 ? urlStr.substring(0, 27) + '...' : urlStr;
                }
            };

            const sourceDisplay = formatShortUrl(sourceUrl);
            const contactDisplay = contactUrl ? formatShortUrl(contactUrl) : null;
            const formDisplay = formUrl ? formatShortUrl(formUrl) : null;
            const externalDisplay = externalFormUrl ? formatShortUrl(externalFormUrl) : null;
            const resultDisplay = (resultUrl && resultUrl !== sourceUrl && resultUrl !== contactUrl) ? formatShortUrl(resultUrl) : null;

            const contactElement = contactUrl 
                ? `<a href="${contactUrl}" target="_blank" rel="noopener noreferrer" class="ledger-contact-link" style="color: #38bdf8; text-decoration: underline;" title="${contactUrl}">📍 Contact: ${contactDisplay}</a>`
                : `<span style="color: #64748b;">📍 Contact: None</span>`;

            const formElement = formUrl
                ? `<a href="${formUrl}" target="_blank" rel="noopener noreferrer" class="ledger-form-link" style="color: #a78bfa; text-decoration: underline;" title="${formUrl}">📝 Form: ${formDisplay}</a>`
                : '';

            const externalElement = externalFormUrl
                ? `<a href="${externalFormUrl}" target="_blank" rel="noopener noreferrer" class="ledger-external-link" style="color: #f59e0b; text-decoration: underline;" title="${externalFormUrl}">🔗 External: ${externalDisplay}</a>`
                : '';

            const resultElement = resultDisplay
                ? `<a href="${resultUrl}" target="_blank" rel="noopener noreferrer" class="ledger-result-link" style="color: #34d399; text-decoration: underline;" title="${resultUrl}">🏁 Result: ${resultDisplay}</a>`
                : '';

            // Structured state badges
            const formDetStatus = rec.formDetectionStatus || (formUrl ? 'FOUND' : 'NOT_FOUND');
            const autofillStatus = rec.autofillStatus || 'N_A';
            const submissionStatus = rec.submissionStatus || rec.status || 'UNKNOWN';
            const captchaStatus = rec.captchaStatus || 'NONE';

            const badgePill = (label, bg, color) => `<span style="background:${bg};color:${color};font-size:9px;font-weight:600;padding:1px 5px;border-radius:4px;letter-spacing:0.3px;">${label}</span>`;

            const formPill = formDetStatus === 'FOUND' ? badgePill('FORM: FOUND', '#065f46', '#6ee7b7')
                : (formDetStatus === 'EXTERNAL_WIDGET' ? badgePill('FORM: EXTERNAL', '#78350f', '#fde68a') : badgePill('FORM: NOT_FOUND', '#334155', '#94a3b8'));

            const autoPill = autofillStatus === 'SUCCESS' ? badgePill('AUTOFILL: SUCCESS', '#065f46', '#6ee7b7')
                : (autofillStatus === 'PARTIAL' ? badgePill('AUTOFILL: PARTIAL', '#78350f', '#fde68a')
                : (autofillStatus === 'MANUAL_REQUIRED' ? badgePill('AUTOFILL: MANUAL_REQ', '#581c87', '#d8b4fe')
                : (autofillStatus === 'FAILED' ? badgePill('AUTOFILL: FAILED', '#7f1d1d', '#fca5a5') : badgePill('AUTOFILL: N/A', '#334155', '#94a3b8'))));

            const subPill = submissionStatus === 'CONFIRMED_SUCCESS' ? badgePill('SUB: CONFIRMED_SUCCESS', '#065f46', '#6ee7b7')
                : (submissionStatus === 'OWNER_MANUAL_CONFIRMED' ? badgePill('SUB: OWNER_CONFIRMED', '#047857', '#a7f3d0')
                : (submissionStatus === 'DELIVERY_UNKNOWN' ? badgePill('SUB: UNKNOWN', '#78350f', '#fde68a')
                : (submissionStatus.includes('TIMEOUT') ? badgePill('SUB: TIMEOUT', '#713f12', '#fef08a')
                : (submissionStatus === 'FAILURE' ? badgePill('SUB: FAILED', '#7f1d1d', '#fca5a5') : badgePill(`SUB: ${submissionStatus}`, '#334155', '#94a3b8')))));

            const capPill = captchaStatus === 'VERIFIED' ? badgePill('CAPTCHA: VERIFIED', '#065f46', '#6ee7b7')
                : (captchaStatus === 'PENDING_OWNER' ? badgePill('CAPTCHA: PENDING', '#78350f', '#fde68a')
                : (captchaStatus === 'MANUAL_WAIT' ? badgePill('CAPTCHA: MANUAL_WAIT', '#0c4a6e', '#7dd3fc')
                : (captchaStatus === 'AUTO_FAILED' ? badgePill('CAPTCHA: AUTO_FAIL', '#7f1d1d', '#fca5a5') : badgePill('CAPTCHA: NONE', '#1e293b', '#64748b'))));

            const isUnknown = (rec.status === 'DELIVERY_UNKNOWN' || rec.status === 'UNKNOWN' || rec.status === 'PAUSED_UNKNOWN');
            const reconcileHtml = isUnknown && rec.attemptId ? `
                <div class="ledger-reconcile-actions" style="display: flex; gap: 8px; margin: 6px 0 4px 22px;">
                    <button class="reconcile-btn success-btn" data-attempt-id="${rec.attemptId}" style="background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; color: #22c55e; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer; font-weight: 600;">✅ Mark as Success</button>
                    <button class="reconcile-btn failed-btn" data-attempt-id="${rec.attemptId}" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer; font-weight: 600;">❌ Mark as Failed</button>
                </div>
            ` : '';

            card.innerHTML = `
                <div class="ledger-item-top">
                    <div class="ledger-item-left">
                        <input type="checkbox" class="ledger-item-cb" data-target="${rec.targetIdentity || ''}" ${checked}>
                        <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="ledger-item-domain ledger-link" style="color: #60a5fa; text-decoration: underline;" title="${sourceUrl}">🌐 ${sourceDisplay}</a>
                    </div>
                    <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="ledger-item-sublinks" style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; margin: 3px 0 3px 22px;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${contactElement}
                        ${formElement}
                        ${externalElement}
                        ${resultElement}
                        ${rec.emailsFound ? `<span style="color: #4ade80;">📧 ${rec.emailsFound} emails</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                        ${formPill}
                        ${autoPill}
                        ${subPill}
                        ${capPill}
                    </div>
                </div>
                ${reconcileHtml}
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

        // Bind visual reconciliation clicks
        container.querySelectorAll('.reconcile-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const attemptId = e.currentTarget.dataset.attemptId;
                const isSuccess = e.currentTarget.classList.contains('success-btn');
                const targetStatus = isSuccess ? 'CONFIRMED_SUCCESS' : 'FAILURE';
                try {
                    btn.disabled = true;
                    btn.textContent = 'Updating...';
                    await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            action: 'RECONCILE_ATTEMPT_VISUAL',
                            attemptId: attemptId,
                            status: targetStatus
                        }, resolve);
                    });
                    await renderLedgerUI();
                    if (typeof _renderHistoryPanel === 'function') {
                        await _renderHistoryPanel();
                    }
                } catch (err) {
                    console.error('Visual reconciliation error:', err);
                }
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

    // [Issue #6 R6.9C Single-Writer Fix]: Background is authoritative writer for Email Collector reset.
    // Do NOT call clearAll on collector store or remove emailCollector keys in popup!
    // Discard cached store instance so popup reloads clean background-authoritative state.
    emailCollectorStore = null;
    if (typeof window !== 'undefined') {
        window.__xpiderEmailStore = null;
    }
    await renderEmailCollectorUI();

    diagnosticLogBuffer.length = 0;
    const logContainer = document.getElementById('log-container');
    if (logContainer) logContainer.innerHTML = '';

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // [Issue #6 R6.9C Single-Writer Fix]: Exclude LIST_DATA_KEYS.emailCollector from post-clear removal!
        const allKeys = [
            ...LIST_DATA_KEYS.autoform,
            ...LIST_DATA_KEYS.history,
            ...LIST_DATA_KEYS.diagnostics
        ];
        await chrome.storage.local.remove(allKeys);
    }

    updateRealTimeStatus({ successCount: 0, remainingCount: 0, totalTargets: 0 });
    updateProgress(0);
    ['stat-success-count', 'stat-failed-count', 'stat-completed-count', 'stat-remaining-count',
     'success-count-display', 'failed-count-display', 'completed-count-display', 'remaining-count-display',
     'captcha-solved-display', 'captcha-failed-display'].forEach(id => {
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
async function triggerGoogleSheetsCsvExport({ exportCurrentFilter = false, exportScope = 'currentGeneration' } = {}) {
    const hs = getPopupHistoryStore();
    let csv = '';
    let exportRecords = null;

    if (exportCurrentFilter && hs) {
        await hs.load();
        const fullFiltered = hs.getFilteredRecords({
            status: ledgerState.filter,
            search: ledgerState.search,
            limit: 100000,
            offset: 0,
            exportScope
        });
        exportRecords = fullFiltered.records;
    }

    if (hs && typeof hs.exportGoogleSheetsCsv === 'function') {
        await hs.load();
        csv = hs.exportGoogleSheetsCsv({ records: exportRecords, exportScope });
    } else {
        csv = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXPORT_GSHEETS_CSV', options: { records: exportRecords, exportScope } }, (res) => {
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
        addLog(`📊 Google Sheets CSV (${exportCurrentFilter ? 'Filtered' : 'All'}) [scope=${exportScope}] exported successfully.`, "success");
    }

    return csv;
}

/**
 * Phase 2B (Component B): Trigger RFC-4180 compliant CSV audit export download
 */
async function triggerCsvExport(options = {}) {
    const exportOptions = Object.assign({ exportScope: 'currentGeneration' }, options);
    const hs = getPopupHistoryStore();
    let csv = '';
    if (hs) {
        await hs.load();
        csv = hs.exportToCsv(exportOptions);
    } else {
        csv = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXPORT_HISTORY_CSV', options: exportOptions }, (res) => {
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
    console.log('[SETTINGS_UI] click');

    const langSelect = document.getElementById('language-select');
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    const apiKeyInput = document.getElementById('captcha-api-key');
    const sttKeyInput = document.getElementById('audio-stt-key');
    const stealthToggle = document.getElementById('stealth-mode-toggle');
    const doubleSubmitToggle = document.getElementById('double-submit-toggle');
    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    const randomToggle = document.getElementById('random-delay-toggle');

        // [R6.9G.9.1] Privacy Gateway Inputs & System VPN Confirmation
        const privToggle = document.getElementById('privacy-gateway-toggle');
        const privModeSelect = document.getElementById('privacy-transport-mode-select');
        const privFailClosedToggle = document.getElementById('privacy-fail-closed-toggle');
        const privHostEl = document.getElementById('privacy-proxy-host');
        const privPortEl = document.getElementById('privacy-proxy-port');
        const privUserEl = document.getElementById('privacy-proxy-user');
        const privPassEl = document.getElementById('privacy-proxy-pass');
        const privRememberEl = document.getElementById('privacy-proxy-remember-pass');
        const privVpnCheckbox = document.getElementById('privacy-vpn-confirm-checkbox');
        const privVpnBadge = document.getElementById('privacy-vpn-status-badge');
        const privRelayModeEl = document.getElementById('privacy-relay-mode-select');
        const isVpnConfirmed = (privVpnBadge && privVpnBadge.textContent === 'CONFIRMED') || (privVpnCheckbox && privVpnCheckbox.checked);

        const privacyConfig = {
            enabled: privToggle ? privToggle.checked : true,
            transportMode: privModeSelect ? privModeSelect.value : 'SYSTEM_VPN',
            failClosed: privFailClosedToggle ? privFailClosedToggle.checked : true,
            systemVpnConfirmed: (privModeSelect && privModeSelect.value === 'SYSTEM_VPN') ? !!isVpnConfirmed : false,
            proxyHost: privHostEl ? privHostEl.value.trim() : '',
            proxyPort: privPortEl ? (parseInt(privPortEl.value, 10) || 1080) : 1080,
            proxyUsername: privUserEl ? privUserEl.value.trim() : '',
            proxyPassword: (privRememberEl && privRememberEl.checked && privPassEl) ? privPassEl.value : (privPassEl ? privPassEl.value : ''),
            rememberPassword: privRememberEl ? privRememberEl.checked : false,
            relayHost: '127.0.0.1',
            relayProxyPort: 18988,
            relayControlPort: 18989,
            relayRotationMode: privRelayModeEl ? privRelayModeEl.value : 'FIXED'
        };

    let settings;
    try {
        const lang = langSelect ? langSelect.value : 'en';
        const sttKeyVal = sttKeyInput ? sttKeyInput.value.trim() : '';
        const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
        const fillMode = fillModeEl ? fillModeEl.value : 'instant';
        const selectedMethod = methodSelect ? methodSelect.value : 'audio';
        const enteredApiKey = apiKeyInput ? apiKeyInput.value : '';
        const pollIntervalInput = document.getElementById('captcha-poll-interval');
        const maxWaitInput = document.getElementById('captcha-max-wait');
        const pollIntervalVal = pollIntervalInput ? pollIntervalInput.value.trim() : '';
        const maxWaitVal = maxWaitInput ? maxWaitInput.value.trim() : '';
        const pollSecNum = pollIntervalVal !== '' ? Math.max(1, Number(pollIntervalVal)) : null;
        const maxWaitNum = maxWaitVal !== '' ? Math.max(5, Number(maxWaitVal)) : null;

        settings = {
            xpider_lang: lang,
            xpider_captcha_enabled: captchaToggle ? captchaToggle.checked : false,
            xpider_captcha_method: selectedMethod,
            // [NopeCHA Fix] Save generic key (for backward compat) AND per-method key
            xpider_captcha_api_key: enteredApiKey,
            // Per-method keys so switching methods doesn't erase the other method's key
            ...(selectedMethod === 'nopecha'
                ? { xpider_captcha_api_key_nopecha: enteredApiKey }
                : { xpider_captcha_api_key_2captcha: enteredApiKey }),
            ...(pollSecNum !== null
                ? {
                    xpider_captcha_poll_interval_sec: pollSecNum,
                    xpider_captcha_poll_interval_ms: pollSecNum * 1000
                }
                : {
                    xpider_captcha_poll_interval_sec: null,
                    xpider_captcha_poll_interval_ms: null
                }),
            ...(maxWaitNum !== null
                ? { xpider_captcha_max_wait_sec: maxWaitNum }
                : { xpider_captcha_max_wait_sec: null }),
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
            xpider_fill_mode: fillMode,
            // [R6.9G.9] Persist Privacy Gateway Config
            xpider_privacy_config: privacyConfig
        };
        console.log(`[SETTINGS_COLLECT] keys=${Object.keys(settings).length}`);
    } catch (collectErr) {
        console.error('[SETTINGS_COLLECT_EXCEPTION]', collectErr);
        addLog(`❌ Settings collect failed: ${collectErr.message}`, 'error');
        return false;
    }

    // [R6.4] Authoritative save with read-back verification
    const requestedKeys = Object.keys(settings);
    let writeOk = false;
    try {
        await chrome.storage.local.set(settings);
        writeOk = true;
        console.log('[SETTINGS_WRITE] ok=true');
    } catch (saveErr) {
        console.error('[SETTINGS_WRITE_FAILED]', saveErr);
        console.log('[SETTINGS_WRITE] ok=false');
        addLog(`❌ Settings write failed: ${saveErr.message}`, 'error');
        return false;
    }

    let readbackOk = false;
    let verified = false;
    try {
        const readback = await chrome.storage.local.get(requestedKeys);
        readbackOk = true;
        console.log('[SETTINGS_READBACK] ok=true');

        const mismatches = [];
        for (const key of requestedKeys) {
            const valW = settings[key];
            const valR = readback[key];
            const written = typeof valW === 'object' && valW !== null ? JSON.stringify(valW) : (typeof valW === 'boolean' ? valW : String(valW));
            const stored = typeof valR === 'object' && valR !== null ? JSON.stringify(valR) : (valR !== undefined ? (typeof valR === 'boolean' ? valR : String(valR)) : undefined);
            if (stored === undefined || written !== stored) {
                mismatches.push(`${key}: wrote=${written}, stored=${stored}`);
            }
        }
        if (mismatches.length === 0) {
            verified = true;
            console.log('[SETTINGS_SAVE] verified=true');
        } else {
            console.error('[SETTINGS_VERIFY_MISMATCH]', mismatches);
            console.log('[SETTINGS_SAVE] verified=false');
        }
    } catch (readErr) {
        console.error('[SETTINGS_READBACK_FAILED]', readErr);
        console.log('[SETTINGS_READBACK] ok=false');
        console.log('[SETTINGS_SAVE] verified=false');
    }
    
    // [WitKey] Sync to background engine via UPDATE_WIT_KEY without dead native IPC
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'UPDATE_WIT_KEY', key: settings.xpider_stt_api_key }).catch(() => {});
        // [Auto CAPTCHA Solver] Sync 2Captcha key to background solver engine
        chrome.runtime.sendMessage({ 
            action: 'UPDATE_CAPTCHA_KEY', 
            method: settings.xpider_captcha_method, 
            key: settings.xpider_captcha_api_key 
        }).catch(() => {});
        // [R6.9G.9] Sync Privacy Gateway config to background and update status card
        chrome.runtime.sendMessage({
            action: 'SET_PRIVACY_CONFIG',
            config: privacyConfig
        }).then(() => {
            chrome.runtime.sendMessage({ action: 'RUN_PRIVACY_PREFLIGHT' }, (res) => {
                if (res && res.preflight) {
                    _updatePrivacyCardUI(res.preflight);
                }
            });
        }).catch(() => {});
    }
    
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = verified ? "✅ Saved & Verified!" : "⚠️ Saved (Unverified)";
        setTimeout(() => saveBtn.textContent = originalText, 2000);
    }
    
    if (typeof applyTranslations === 'function' && settings.xpider_lang) {
        applyTranslations(settings.xpider_lang);
    }
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
    return verified;
}

// [R6.4] loadSettings alias to hydrateSettings
const loadSettings = hydrateSettings;

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
        console.log(`[WitKey-Sync] Sender Popup Storage changed → Syncing UI: keyConfigured=${!!newKey}`);
        
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
    // Note: Background migration is serialized during primary boot via ensureSchemaReady()

    // 2. Export CSV Report Button
    const exportBtn = document.getElementById('export-csv-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'EXPORT_HISTORY_CSV', options: { exportScope: 'currentGeneration' } }, (res) => {
                if (res && res.success && res.csv) {
                    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `xpider_campaign_report_${Date.now()}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addLog("📊 CSV Report [scope=currentGeneration] downloaded successfully.", "success");
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
            const hs = getPopupHistoryStore();
            const storedState = await chrome.storage.local.get(['xpider_active_campaign_run_id', 'xpider_isActive', 'xpider_isPaused', 'xpider_history_scope_preference', 'xpider_history_rows', 'xpider_history_attempts', 'xpider_history_generation']);
            const activeRunId = storedState.xpider_active_campaign_run_id || null;
            const isCampaignActive = storedState.xpider_isActive || storedState.xpider_isPaused;
            // [Issue #6 R6.9F.1] While a run is active (or a run id is persisted) the visible panel MUST be currentRun.
            let scopePref = storedState.xpider_history_scope_preference || (isCampaignActive || activeRunId ? 'currentRun' : 'currentGeneration');
            if (isCampaignActive && activeRunId) scopePref = 'currentRun';

            let stats = null;
            if (hs) {
                await hs.load();
                stats = hs.getLedgerStats(scopePref, activeRunId);
            }
            const rows = storedState.xpider_history_rows || [];
            const attempts = storedState.xpider_history_attempts || [];
            const gen = storedState.xpider_history_generation || 1;

            const pending = rows.filter(r => r.status === 'PENDING').length;
            const invalid = rows.filter(r => r.status === 'INVALID_INPUT').length;
            const succeeded = stats ? stats.success : attempts.filter(a => a.status === 'CONFIRMED_SUCCESS').length;
            const failed = stats ? stats.failure : attempts.filter(a => a.status === 'FAILURE').length;
            const timeout = stats ? (stats.timeout || 0) : attempts.filter(a => a.status === 'TIMEOUT_LOCAL' || a.status === 'TIMEOUT_GLOBAL').length;
            const unknown = stats ? stats.unknown : attempts.filter(a => a.status === 'DELIVERY_UNKNOWN' || a.status === 'PAUSED_UNKNOWN').length;
            const skipped = stats ? stats.skipped : attempts.filter(a => a.status === 'SKIPPED').length;

            const scopeLabel = scopePref === 'currentRun' 
                ? (activeRunId 
                    ? `<b style="color:#00ffcc">currentRun</b> <span style="font-size:10px;opacity:0.8;">(${activeRunId})</span>` 
                    : '<b style="color:#94a3b8">currentRun</b> <span style="font-size:10px;color:#cbd5e1;">(No active run)</span>')
                : '<b style="color:#f59e0b">currentGeneration</b> <span style="font-size:10px;color:#fca5a5;">(Generation totals — not current run)</span>';

            console.log(`[LEDGER_STATS] scope=${scopePref}${scopePref === 'currentRun' ? ' campaignRunId=' + (activeRunId || 'none') : ''} success=${succeeded} failed=${failed} timeout=${timeout} unknown=${unknown}`);

            panel.innerHTML = `
                <div class="history-stat-row">
                    <span>Scope:</span><span>${scopeLabel}</span>
                </div>
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
                <div class="history-stat-row">
                    <span>Timeout:</span><span><b style="color:#f97316">${timeout}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Unknown:</span><span><b style="color:#a855f7">${unknown}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Skipped:</span><span><b style="color:#64748b">${skipped}</b></span>
                </div>
            `;
        } catch (e) {
            panel.innerHTML = `<span style="color:#ef4444">History load error: ${e.message}</span>`;
        }
    }
    if (typeof window !== 'undefined') {
        window._renderHistoryPanel = _renderHistoryPanel;
    }

    // [Issue #6 R6.9F.1] Re-render History panel whenever run identity / run state changes
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area && area !== 'local') return;
            if (changes.xpider_active_campaign_run_id || changes.xpider_isActive || changes.xpider_isPaused) {
                console.log('[HISTORY_SCOPE_REFRESH] trigger=' + Object.keys(changes).filter(k => /^xpider_(active_campaign_run_id|isActive|isPaused)$/.test(k)).join(','));
                _renderHistoryPanel();
            }
        });
    } catch (_) {}

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
            if (emailActiveView === 'current') {
                if (store) await store.clearCurrentSite();
                chrome.runtime.sendMessage({ action: 'CLEAR_COLLECTED_EMAILS', mode: 'current' }, () => {});
                addLog("🧹 Cleared current site emails.", 'info');
                const curStat = document.getElementById('stat-email-current-count');
                const curChip = document.getElementById('email-chip-current-num');
                if (curStat) curStat.textContent = '0';
                if (curChip) curChip.textContent = '0';
                const textarea = document.getElementById('email-collector-textarea');
                if (textarea) textarea.value = '// Current site emails cleared (0 records)';
                renderEmailCollectorUI();
            } else {
                const confirmed = (typeof confirm === 'function')
                    ? confirm("Are you sure you want to delete ALL accumulated emails?")
                    : true;
                if (confirmed) {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                        await new Promise(r => chrome.runtime.sendMessage({ action: 'CLEAR_COLLECTED_EMAILS', mode: 'all' }, r));
                    }
                    emailCollectorStore = null;
                    if (typeof window !== 'undefined') {
                        window.__xpiderEmailStore = null;
                    }
                    addLog("🗑️ Cleared all accumulated emails.", 'info');
                    const curStat = document.getElementById('stat-email-current-count');
                    const globStat = document.getElementById('stat-email-global-count');
                    const curChip = document.getElementById('email-chip-current-num');
                    const globChip = document.getElementById('email-chip-all-num');
                    if (curStat) curStat.textContent = '0';
                    if (globStat) globStat.textContent = '0';
                    if (curChip) curChip.textContent = '0';
                    if (globChip) globChip.textContent = '0';
                    const textarea = document.getElementById('email-collector-textarea');
                    if (textarea) textarea.value = '// All emails cleared (0 records)';
                    await renderEmailCollectorUI();
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
        calculatePayloadBytes,
        // R6.9G.10.3.4 Template Hydration & Start Guard Exports
        ensureSchemaReady,
        rehydrateTemplateUI,
        ensureTemplateReadyForStart,
        switchToTemplateTabAndFocusMessage
    };
}
