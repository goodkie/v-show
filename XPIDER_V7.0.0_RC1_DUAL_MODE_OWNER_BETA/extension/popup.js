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
let currentCampaignMode = 'AUTO';
let successCount = 0;
let failedCount = 0;
let completedCount = 0;
let totalTargets = 0;
let skippedCount = 0;
let timeoutCount = 0;
let deliveryUnknownCount = 0;
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

// ── [OWNER DEBUG BUNDLE ZIP & SANITIZATION ENGINE] ──────────────────────────
function deepSanitizeDiagnosticObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        return redactSensitiveText(obj);
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepSanitizeDiagnosticObject(item));
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, val] of Object.entries(obj)) {
            if (/secret|token|password|key|auth|credential|cookie|bearer|stt|turnstile/i.test(key)) {
                result[key] = '[REDACTED_SECRET]';
            } else {
                result[key] = deepSanitizeDiagnosticObject(val);
            }
        }
        return result;
    }
    return String(obj);
}

function _makeZipCrcTable() {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c;
    }
    return table;
}
const _zipCrc32Table = _makeZipCrcTable();
function _calcZipCrc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ _zipCrc32Table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

function createZipArchive(files) {
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;
    const te = new TextEncoder();

    files.forEach(f => {
        const nameBytes = te.encode(f.name);
        const dataBytes = typeof f.content === 'string' ? te.encode(f.content) : new Uint8Array(f.content);
        const crc = _calcZipCrc32(dataBytes);
        const size = dataBytes.length;

        const lh = new Uint8Array(30 + nameBytes.length + size);
        const dvLh = new DataView(lh.buffer);
        dvLh.setUint32(0, 0x04034b50, true); // PK\x03\x04
        dvLh.setUint16(4, 20, true); // version
        dvLh.setUint16(6, 0x0800, true); // UTF-8 filename flag
        dvLh.setUint16(8, 0, true); // Method 0: STORE
        dvLh.setUint16(10, 0, true);
        dvLh.setUint16(12, 0, true);
        dvLh.setUint32(14, crc, true);
        dvLh.setUint32(18, size, true);
        dvLh.setUint32(22, size, true);
        dvLh.setUint16(26, nameBytes.length, true);
        dvLh.setUint16(28, 0, true);
        lh.set(nameBytes, 30);
        lh.set(dataBytes, 30 + nameBytes.length);
        localHeaders.push(lh);

        const ch = new Uint8Array(46 + nameBytes.length);
        const dvCh = new DataView(ch.buffer);
        dvCh.setUint32(0, 0x02014b50, true); // PK\x01\x02
        dvCh.setUint16(4, 20, true);
        dvCh.setUint16(6, 20, true);
        dvCh.setUint16(8, 0x0800, true);
        dvCh.setUint16(10, 0, true);
        dvCh.setUint16(12, 0, true);
        dvCh.setUint16(14, 0, true);
        dvCh.setUint32(16, crc, true);
        dvCh.setUint32(20, size, true);
        dvCh.setUint32(24, size, true);
        dvCh.setUint16(28, nameBytes.length, true);
        dvCh.setUint16(30, 0, true);
        dvCh.setUint16(32, 0, true);
        dvCh.setUint16(34, 0, true);
        dvCh.setUint16(36, 0, true);
        dvCh.setUint32(38, 0, true);
        dvCh.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        centralHeaders.push(ch);

        offset += lh.length;
    });

    const centralDirOffset = offset;
    let centralDirSize = 0;
    centralHeaders.forEach(ch => centralDirSize += ch.length);

    const eocd = new Uint8Array(22);
    const dvEocd = new DataView(eocd.buffer);
    dvEocd.setUint32(0, 0x06054b50, true); // PK\x05\x06
    dvEocd.setUint16(4, 0, true);
    dvEocd.setUint16(6, 0, true);
    dvEocd.setUint16(8, files.length, true);
    dvEocd.setUint16(10, files.length, true);
    dvEocd.setUint32(12, centralDirSize, true);
    dvEocd.setUint32(16, centralDirOffset, true);
    dvEocd.setUint16(20, 0, true);

    const totalLen = centralDirOffset + centralDirSize + 22;
    const result = new Uint8Array(totalLen);
    let cur = 0;
    localHeaders.forEach(lh => {
        result.set(lh, cur);
        cur += lh.length;
    });
    centralHeaders.forEach(ch => {
        result.set(ch, cur);
        cur += ch.length;
    });
    result.set(eocd, cur);
    return result;
}

async function exportOwnerDebugBundle() {
    try {
        const buildInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
            ? BuildProvenance.BUILD_INFO
            : { buildId: 'R6.9G.10.3.7.1.4.11-OWNER-BETA', head: 'UNKNOWN' };
        const buildId = buildInfo.buildId || 'R6.9G.10.3.7.1.4.11-OWNER-BETA';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `XPIDER_DEBUG_${buildId}_${timestamp}.zip`;

        if (typeof addLog === 'function') addLog(`📦 Compiling Owner Debug Bundle...`, "info");

        // 1. Gather all runtime data
        const reportText = getDiagnosticReport(false);
        const runtimeLogs = [...diagnosticLogBuffer];

        let storageAll = {};
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                storageAll = await chrome.storage.local.get(null);
            }
        } catch (_) {}

        // Redact settings
        const sanitizedSettings = deepSanitizeDiagnosticObject(storageAll);
        delete sanitizedSettings.xpider_current_run_diagnostics;
        delete sanitizedSettings.xpider_blackbox_logs;

        // 2. Campaign & target state
        const campaignSummary = {
            active: Boolean(campaignActive),
            counters: (typeof lastStatsData !== 'undefined' && lastStatsData) ? lastStatsData : {},
            targetCount: (typeof totalTargets !== 'undefined') ? totalTargets : 0,
            captchaLedger: storageAll.xpider_captcha_ledger || {},
            timestamp: new Date().toISOString()
        };

        // 3. Error and retry summary
        const errorEvents = runtimeLogs.filter(e => e.includes('[ERROR]') || e.includes('fail') || e.includes('timeout'));
        const retryEvents = runtimeLogs.filter(e => e.includes('retry') || e.includes('RETRY') || e.includes('attempt'));
        const errorSummary = {
            totalErrorsRecorded: errorEvents.length,
            recentErrors: errorEvents.slice(-25),
            totalRetryEvents: retryEvents.length,
            recentRetries: retryEvents.slice(-25)
        };

        // 4. History & Ledger records
        let historyRecords = [];
        try {
            if (storageAll.xpider_history_ledger && Array.isArray(storageAll.xpider_history_ledger)) {
                historyRecords = storageAll.xpider_history_ledger;
            } else if (storageAll.xpider_history_store && Array.isArray(storageAll.xpider_history_store.records)) {
                historyRecords = storageAll.xpider_history_store.records;
            }
        } catch (_) {}
        const sanitizedHistory = deepSanitizeDiagnosticObject(historyRecords);

        // 5. Consolidated Master Debug JSON
        const masterBundle = {
            bundleVersion: '1.0',
            exportedAt: new Date().toISOString(),
            buildProvenance: buildInfo,
            campaignSummary,
            errorSummary,
            sanitizedSettings,
            historyLedger: sanitizedHistory,
            runtimeLogsSample: runtimeLogs.slice(-100)
        };

        // 6. Build ZIP files array
        const files = [
            { name: 'XPIDER_DEBUG_REPORT.txt', content: reportText },
            { name: 'runtime_logs.json', content: JSON.stringify(runtimeLogs, null, 2) },
            { name: 'sanitized_settings.json', content: JSON.stringify(sanitizedSettings, null, 2) },
            { name: 'campaign_state.json', content: JSON.stringify(campaignSummary, null, 2) },
            { name: 'error_and_retry_summary.json', content: JSON.stringify(errorSummary, null, 2) },
            { name: 'history_ledger.json', content: JSON.stringify(sanitizedHistory, null, 2) },
            { name: 'build_provenance.json', content: JSON.stringify(buildInfo, null, 2) },
            { name: 'owner_debug_bundle.json', content: JSON.stringify(masterBundle, null, 2) }
        ];

        const zipBytes = createZipArchive(files);
        if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
            const blob = new Blob([zipBytes], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        if (typeof addLog === 'function') addLog(`✅ Exported Owner Debug Bundle: ${filename}`, "success");
        return { success: true, filename, filesCount: files.length, bundleBytes: zipBytes.length };
    } catch (err) {
        console.error('[EXPORT_DEBUG_BUNDLE_ERROR]', err);
        if (typeof addLog === 'function') addLog(`❌ Failed to export debug bundle: ${err.message}`, "error");
        return { success: false, error: err.message };
    }
}
if (typeof window !== 'undefined') {
    window.exportOwnerDebugBundle = exportOwnerDebugBundle;
    window.deepSanitizeDiagnosticObject = deepSanitizeDiagnosticObject;
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
    tabsBound: false,
    settingsBound: false,
    getStateAck: false,
    clickInterception: null,
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

// [Y3] Modal Overlay State Helpers (Pointer-events and visibility fail-safe)
function openModalOverlay(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
    el.style.visibility = 'visible';
}

function closeModalOverlay(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
    el.style.visibility = 'hidden';
}

function sanitizeAllStaticOverlays() {
    if (typeof document === 'undefined') return;
    try {
        const overlays = document.querySelectorAll('.overlay, .modal-overlay, [id$="-overlay"]');
        overlays.forEach(el => {
            if (el.classList.contains('hidden') || el.style.display === 'none') {
                closeModalOverlay(el);
            } else {
                el.style.pointerEvents = 'auto';
                el.style.visibility = 'visible';
            }
        });
    } catch (e) {
        console.warn('[POPUP_BOOT] sanitizeAllStaticOverlays error:', e);
    }
}

// [Y2] Stale Dynamic Modal Sanitization on Boot
function purgeStaleDynamicModals() {
    if (typeof document === 'undefined') return;
    try {
        const staleCaptcha = document.getElementById('xpider-captcha-decision-modal');
        if (staleCaptcha) {
            console.warn('[POPUP_BOOT] Purged stale dynamic modal: #xpider-captcha-decision-modal');
            staleCaptcha.remove();
        }
        const staleManual = document.getElementById('xpider-manual-assist-modal');
        if (staleManual) {
            console.warn('[POPUP_BOOT] Purged stale dynamic modal: #xpider-manual-assist-modal');
            staleManual.remove();
        }
    } catch (e) {
        console.warn('[POPUP_BOOT] purgeStaleDynamicModals error:', e);
    }
}

// [Y1] Side-Panel Click-Interception Diagnostic
function checkClickInterceptionDiagnostic() {
    if (typeof document === 'undefined' || !document.elementsFromPoint) return;
    try {
        // [RC3.21 Remediation] If an authorized modal is active, background controls are intentionally blocked.
        const authorizedModal = document.querySelector('#xpider-manual-assist-modal, #xpider-captcha-decision-modal, #settings-overlay:not(.hidden), #private-egress-modal-overlay:not(.hidden), #captcha-modal-overlay:not(.hidden), #privacy-block-modal-overlay:not(.hidden), #stt-setup-modal-overlay:not(.hidden), #reset-all-modal-overlay:not(.hidden), #reset-all-lists-modal-overlay:not(.hidden)');
        if (authorizedModal) {
            window.__xpider_boot.clickInterception = null;
            const banner = document.getElementById('xpider-click-interception-banner');
            if (banner) banner.remove();
            return;
        }

        const probeTargets = [
            { id: 'settings-toggle', label: '#settings-toggle' },
            { id: 'start-btn', label: '#start-btn' },
            { selector: '.tab-btn[data-tab="targets"]', label: '.tab-btn[data-tab="targets"]' }
        ];

        let intercepted = null;

        for (const target of probeTargets) {
            const el = target.id ? document.getElementById(target.id) : document.querySelector(target.selector);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            const cx = Math.floor(rect.left + rect.width / 2);
            const cy = Math.floor(rect.top + rect.height / 2);
            if (cx < 0 || cy < 0 || cx > (window.innerWidth || 1000) || cy > (window.innerHeight || 1000)) continue;

            const stack = document.elementsFromPoint(cx, cy);
            if (!stack || stack.length === 0) continue;

            const topEl = stack[0];
            // Explicitly ignore diagnostic banner itself and authorized modals
            if (topEl && (topEl.id === 'xpider-click-interception-banner' || topEl.closest('#xpider-click-interception-banner, #xpider-manual-assist-modal, #xpider-captcha-decision-modal'))) {
                continue;
            }

            if (topEl !== el && !el.contains(topEl)) {
                // Check if top element is inside an open overlay/modal
                const openOverlay = topEl.closest('#settings-overlay:not(.hidden), #private-egress-modal-overlay:not(.hidden), #captcha-modal-overlay:not(.hidden), #privacy-block-modal-overlay:not(.hidden), #stt-setup-modal-overlay:not(.hidden), #reset-all-modal-overlay:not(.hidden), #reset-all-lists-modal-overlay:not(.hidden), #xpider-manual-assist-modal, #xpider-captcha-decision-modal, #xpider-click-interception-banner');
                if (!openOverlay) {
                    const tagInfo = topEl.tagName.toLowerCase() + 
                        (topEl.id ? '#' + topEl.id : '') + 
                        (topEl.className && typeof topEl.className === 'string' ? '.' + topEl.className.trim().split(/\s+/).join('.') : '');
                    const zIndex = window.getComputedStyle ? window.getComputedStyle(topEl).zIndex : 'unknown';
                    intercepted = {
                        target: target.label,
                        coveringElement: tagInfo,
                        zIndex: zIndex
                    };
                    break;
                }
            }
        }

        if (intercepted) {
            console.error(`[CLICK_INTERCEPTION_DETECTED] Element "${intercepted.coveringElement}" (z-index: ${intercepted.zIndex}) covers "${intercepted.target}"!`);
            displayClickInterceptionBanner(intercepted);
            window.__xpider_boot.clickInterception = intercepted;
        } else {
            window.__xpider_boot.clickInterception = null;
            const banner = document.getElementById('xpider-click-interception-banner');
            if (banner) banner.remove();
        }
    } catch (err) {
        console.warn('[POPUP_BOOT] checkClickInterceptionDiagnostic error:', err);
    }
}

function displayClickInterceptionBanner(interception) {
    if (typeof document === 'undefined' || !document.body) return;
    try {
        let banner = document.getElementById('xpider-click-interception-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'xpider-click-interception-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px 12px;font-size:12px;font-weight:700;z-index:999999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none;';
            document.body.prepend(banner);
        }
        banner.textContent = `🚨 CLICK_INTERCEPTION_DETECTED: [${interception.coveringElement}] covers [${interception.target}].`;
    } catch (_) {}
}

function bindCriticalControls() {
    let startBound = false;
    let saveBound = false;

    // 1. Start Automatic & Start Manual Buttons (v7.0 Dual Mode)
    const startBtn = document.getElementById('start-btn');
    const startManualBtn = document.getElementById('start-manual-btn');
    if (startBtn) {
        if (!startBtn.dataset.bound) {
            startBtn.dataset.bound = 'true';
            startBtn.addEventListener('click', () => {
                console.log('[BUTTON_CLICK] id=start-btn mode=AUTO');
                launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'AUTO' }).catch(err => {
                    console.error('[START_EXCEPTION]', err);
                });
            });
        }
        startBound = true;
    } else {
        displayControlPlaneError('START_HANDLER_NOT_BOUND', 'element #start-btn not found in DOM');
    }
    if (startManualBtn && !startManualBtn.dataset.bound) {
        startManualBtn.dataset.bound = 'true';
        startManualBtn.addEventListener('click', () => {
            console.log('[BUTTON_CLICK] id=start-manual-btn mode=MANUAL');
            launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'MANUAL' }).catch(err => {
                console.error('[START_EXCEPTION]', err);
            });
        });
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
        'xpider_random_delay',
        // [Issue #6 RC3.22/RC3.23/RC3.25 UX Settings]
        'xpider_auto_recovery_first', 'xpider_show_manual_form_assist_popup',
        'xpider_default_captcha_handling', 'xpider_show_captcha_choice_popup',
        'xpider_show_autofill_visual_confirm', 'xpider_automatic_provider_fallback'
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
    const apiKeyInput = document.getElementById('captcha-api-key');
    const apiLinkTip = document.getElementById('api-link-tip');

    function updateCaptchaMethodUI(method) {
        let warnEl = document.getElementById('nopecha-sub-warning');
        if (warnEl) warnEl.remove();

        if (apiKeyInput) {
            apiKeyInput.placeholder = method === 'nopecha'
                ? 'Enter NopeCHA API Key (e.g. sub_... or key from nopecha.com/manage)'
                : 'Enter 2Captcha API Key';
        }
        if (apiLinkTip) {
            if (method === 'nopecha') {
                apiLinkTip.innerHTML = '<a href="https://nopecha.com/manage" target="_blank" style="color:#00ffcc;text-decoration:underline;font-size:11px;">NopeCHA Dashboard (Active Keys 확인) ↗</a>';
            } else {
                apiLinkTip.innerHTML = '<a href="https://2captcha.com" target="_blank" style="color:#00ffcc;text-decoration:underline;font-size:11px;">Get your 2Captcha API Key here ↗</a>';
            }
        }
        const waitInput = document.getElementById('captcha-max-wait');
        if (waitInput) {
            waitInput.placeholder = method === 'nopecha' ? '180' : '200';
        }
        const pollInput = document.getElementById('captcha-poll-interval');
        if (pollInput) {
            pollInput.placeholder = method === 'nopecha' ? '3' : '5';
        }
    }

    if (methodSelect) {
        methodSelect.value = captchaMethod;
        updateCaptchaMethodUI(captchaMethod);

        methodSelect.addEventListener('change', async () => {
            const newMethod = methodSelect.value;
            const stored = await chrome.storage.local.get(['xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha', 'xpider_captcha_api_key']);
            if (apiKeyInput) {
                apiKeyInput.value = newMethod === 'nopecha'
                    ? (stored.xpider_captcha_api_key_nopecha || stored.xpider_captcha_api_key || '')
                    : (stored.xpider_captcha_api_key_2captcha || stored.xpider_captcha_api_key || '');
            }
            updateCaptchaMethodUI(newMethod);
        });
    }

    if (apiKeyInput) {
        apiKeyInput.value = captchaApiKey;
    }

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

    // [Issue #6 RC3.22/RC3.23 UX Settings Hydration]
    const autoRecoveryToggle = document.getElementById('form-assist-auto-recovery-toggle');
    if (autoRecoveryToggle) autoRecoveryToggle.checked = data.xpider_auto_recovery_first !== false;

    const showAssistPopupToggle = document.getElementById('form-assist-show-popup-toggle');
    if (showAssistPopupToggle) showAssistPopupToggle.checked = !!data.xpider_show_manual_form_assist_popup;

    const captchaHandlingSelect = document.getElementById('captcha-default-handling-select');
    if (captchaHandlingSelect && data.xpider_default_captcha_handling) {
        captchaHandlingSelect.value = data.xpider_default_captcha_handling;
    }

    const showCaptchaPopupToggle = document.getElementById('captcha-show-choice-popup-toggle');
    if (showCaptchaPopupToggle) showCaptchaPopupToggle.checked = !!data.xpider_show_captcha_choice_popup;

    const visualConfirmToggle = document.getElementById('form-assist-show-visual-confirm-toggle');
    if (visualConfirmToggle) visualConfirmToggle.checked = data.xpider_show_autofill_visual_confirm !== false;

    const providerFallbackToggle = document.getElementById('captcha-provider-fallback-toggle');
    if (providerFallbackToggle) {
        providerFallbackToggle.checked = !!data.xpider_automatic_provider_fallback;
        providerFallbackToggle.onchange = () => {
            chrome.storage.local.set({ xpider_automatic_provider_fallback: providerFallbackToggle.checked });
        };
    }

    if (visualConfirmToggle) {
        visualConfirmToggle.onchange = () => {
            chrome.storage.local.set({ xpider_show_autofill_visual_confirm: visualConfirmToggle.checked });
        };
    }

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

        const privKeepRelayToggle = document.getElementById('privacy-keep-relay-enforced-toggle');
        if (privKeepRelayToggle) {
            privKeepRelayToggle.checked = privCfg.keepPrivacyRelayEnforcedBetweenCampaigns !== false;
        }

        const privModeSelect = document.getElementById('privacy-transport-mode-select');
        const vpnSection = document.getElementById('privacy-system-vpn-fields');
        const vpnCheckbox = document.getElementById('privacy-vpn-confirm-checkbox');
        const vpnBadge = document.getElementById('privacy-vpn-status-badge');
        const vpnVerifyBtn = document.getElementById('privacy-vpn-verify-btn');
        const vpnRevokeBtn = document.getElementById('privacy-vpn-revoke-btn');

        const updateVpnStatusBadge = (confirmed) => {
            if (!vpnBadge) return;
            if (confirmed) {
                vpnBadge.textContent = 'VPN OBSERVED: CONFIRMED (MONITOR ONLY)';
                vpnBadge.style.color = '#34d399';
                vpnBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                vpnBadge.style.border = '1px solid #10b981';
                if (vpnCheckbox) vpnCheckbox.checked = true;
            } else {
                vpnBadge.textContent = 'VPN OBSERVED: NOT CONFIRMED (MONITOR ONLY)';
                vpnBadge.style.color = '#f87171';
                vpnBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                vpnBadge.style.border = '1px solid #ef4444';
                if (vpnCheckbox) vpnCheckbox.checked = false;
            }
        };

        // [Fix 2 Hydrate Owner Functional Test Mode]
        const ownerTestToggle = document.getElementById('owner-function-test-toggle');
        const ownerTestBanner = document.getElementById('owner-function-test-banner');
        const ownerTestGroup = document.getElementById('owner-function-test-group');
        try {
            const isTestAuthorized = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function')
                ? BuildProvenance.isTestOnlyBuild()
                : Boolean(typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO && (
                    BuildProvenance.BUILD_INFO.channel === 'TEST_ONLY' ||
                    BuildProvenance.BUILD_INFO.channel === 'OWNER_BETA' ||
                    (typeof BuildProvenance.BUILD_INFO.channel === 'string' && BuildProvenance.BUILD_INFO.channel.startsWith('OWNER_BETA')) ||
                    BuildProvenance.BUILD_INFO.testOnly === true
                ));

            if (!isTestAuthorized) {
                if (ownerTestGroup) ownerTestGroup.style.display = 'none';
                if (ownerTestBanner) ownerTestBanner.style.display = 'none';
                if (ownerTestToggle) {
                    ownerTestToggle.checked = false;
                    ownerTestToggle.disabled = true;
                }
                await chrome.storage.local.set({ xpider_owner_function_test_mode: false });
            } else {
                if (ownerTestGroup) ownerTestGroup.style.display = 'block';
                // [R6.9G.10.3.7.1.4.11 OWNER BETA BOOT RECONCILE]
                // If channel=OWNER_BETA and xpider_owner_function_test_mode=true but no active explicit test run:
                // auto-clear stale flag and remove test guard.
                const bootSt = await chrome.storage.local.get([
                    'xpider_owner_function_test_mode',
                    'xpider_active_test_source',
                    'xpider_isActive',
                    'xpider_queue'
                ]);
                const EXPLICIT_TEST_SOURCES = ['OWNER_CORE_TEST', 'OWNER_CAPTCHA_LAB', 'OWNER_FULL_TEST', 'CLOUDFLARE_TESTKEY_LAB'];
                const isExplicitRunning = Boolean(
                    bootSt.xpider_isActive &&
                    EXPLICIT_TEST_SOURCES.includes(bootSt.xpider_active_test_source)
                );
                
                let isOwnerTestMode = false;
                if (bootSt.xpider_owner_function_test_mode && !isExplicitRunning) {
                    await chrome.storage.local.set({ xpider_owner_function_test_mode: false });
                    await chrome.storage.local.remove([
                        'xpider_active_test_source',
                        'xpider_owner_function_test_mode_active',
                        'xpider_test_mode_state'
                    ]);
                    try {
                        const gRes = await chrome.runtime.sendMessage({ action: 'REMOVE_OWNER_TEST_GUARD' });
                        if (gRes && gRes.success) {
                            console.log('[OWNER_TEST_GUARD] removed=true');
                        }
                    } catch (_) {}
                    console.log('[BOOT_RECONCILE] channel=OWNER_BETA staleTestMode=true action=AUTO_CLEAR');
                    addLog('🧹 [BOOT_RECONCILE] Stale test mode auto-cleared on boot. Normal mode active.', 'info');
                    isOwnerTestMode = false;
                } else {
                    isOwnerTestMode = Boolean(bootSt.xpider_owner_function_test_mode);
                }

                if (ownerTestToggle) {
                    ownerTestToggle.disabled = false;
                    ownerTestToggle.checked = isOwnerTestMode;
                    if (ownerTestBanner) {
                        ownerTestBanner.style.display = isOwnerTestMode ? 'block' : 'none';
                    }
                    ownerTestToggle.addEventListener('change', async () => {
                        const checked = ownerTestToggle.checked;
                        await chrome.storage.local.set({ xpider_owner_function_test_mode: checked });
                        if (ownerTestBanner) {
                            ownerTestBanner.style.display = checked ? 'block' : 'none';
                        }
                        if (!checked) {
                            try {
                                const gRes = await chrome.runtime.sendMessage({ action: 'REMOVE_OWNER_TEST_GUARD' });
                                if (gRes && gRes.success) {
                                    console.log('[OWNER_TEST_GUARD] removed=true verified=true');
                                    addLog('[OWNER_TEST_GUARD] removed=true verified=true', 'info');
                                } else {
                                    console.warn('[OWNER_TEST_GUARD_REMOVE_WARN]', gRes?.error);
                                }
                            } catch (err) {
                                console.warn('[OWNER_TEST_GUARD_REMOVE_ERROR]', err);
                            }
                        }
                        console.log(`[OWNER_FUNCTION_TEST] loopbackOnly=true strictPublicBypass=false toggled=${checked}`);
                        addLog(`🧪 [Owner Functional Test Mode] ${checked ? 'ENABLED (Local Controlled Pages Only: 127.0.0.1/localhost)' : 'DISABLED'}`, checked ? 'warning' : 'info');
                        chrome.runtime.sendMessage({ action: 'GET_PRIVACY_CONFIG' }, (res) => {
                            if (res && res.preflight) _updatePrivacyCardUI(res.preflight);
                        });
                    });
                }
            }
        } catch (_) {}

        // [P0 Actionable Privacy Block Decision Modal & Handlers]
        window.showPrivacyBlockDecisionModal = function(data = {}) {
            const { reason, userMessage, actionSection, source } = data;
            const privacyBlockModal = document.getElementById('privacy-block-modal-overlay');
            if (!privacyBlockModal) {
                alert(`🛡️ PRIVACY GATE BLOCKED START\n\n${userMessage || reason}\n\nReason: ${reason}`);
                return;
            }

            const msgEl = document.getElementById('privacy-block-modal-msg');
            if (msgEl) msgEl.textContent = userMessage || 'Strict Privacy is ON, but no healthy enforced transport was verified.';

            const codeEl = document.getElementById('privacy-block-reason-code');
            if (codeEl) codeEl.textContent = `Reason Code: ${reason || 'PRIVACY_START_BLOCKED'}`;

            const btnSetupEgress = document.getElementById('privacy-block-action-setup-egress');
            const btnOverride = document.getElementById('privacy-block-action-override');
            const btnRetry = document.getElementById('privacy-block-action-retry');
            const btnSettings = document.getElementById('privacy-block-action-settings');
            const btnCancel = document.getElementById('privacy-block-action-cancel');
            const btnCompanion = document.getElementById('privacy-block-action-companion');
            const btnProxy = document.getElementById('privacy-block-action-proxy');

            if (btnSetupEgress) {
                btnSetupEgress.onclick = () => {
                    privacyBlockModal.style.display = 'none';
                    privacyBlockModal.classList.add('hidden');
                    if (typeof window.openPrivateEgressWizard === 'function') {
                        window.openPrivateEgressWizard();
                    }
                };
            }

            if (btnOverride) {
                btnOverride.onclick = async () => {
                    privacyBlockModal.style.display = 'none';
                    privacyBlockModal.classList.add('hidden');
                    console.log('[PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true');
                    addLog('⚡ [PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true', 'warn');
                    const ind = document.getElementById('privacy-override-indicator');
                    if (ind) {
                        ind.style.display = 'flex';
                        ind.classList.remove('hidden');
                    }
                    await launchCampaign({ source: source || 'USER_START_BUTTON', runScopedDirectPrivacy: true });
                };
            }

            if (btnRetry) {
                btnRetry.onclick = async () => {
                    privacyBlockModal.style.display = 'none';
                    privacyBlockModal.classList.add('hidden');
                    addLog('🔄 [PRIVACY_PREFLIGHT_RETRY] Retrying privacy preflight...', 'info');
                    await launchCampaign({ source: source || 'USER_START_BUTTON' });
                };
            }

            const openSettingsHandler = () => {
                privacyBlockModal.style.display = 'none';
                privacyBlockModal.classList.add('hidden');
                const settingsOverlay = document.getElementById('settings-overlay');
                if (settingsOverlay) settingsOverlay.classList.remove('hidden');
                const targetId = actionSection || 'privacy-gateway-group';
                const targetSection = document.getElementById(targetId) || document.getElementById('privacy-gateway-group');
                if (targetSection) {
                    targetSection.style.display = 'block';
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            };

            if (btnSettings) btnSettings.onclick = openSettingsHandler;
            if (btnCompanion) btnCompanion.onclick = openSettingsHandler;
            if (btnProxy) btnProxy.onclick = openSettingsHandler;

            if (btnCancel) {
                btnCancel.onclick = () => {
                    privacyBlockModal.style.display = 'none';
                    privacyBlockModal.classList.add('hidden');
                    const btn = document.getElementById('start-btn');
                    if (btn) {
                        btn.classList.remove('hidden');
                        btn.disabled = false;
                        btn.textContent = "🚀 START SENDING";
                    }
                };
            }

            privacyBlockModal.classList.remove('hidden');
            privacyBlockModal.style.display = 'flex';
        };

        window.checkAndRefreshPrivacyReadinessHUD = async function() {
            try {
                const campPill = document.getElementById('campaign-ready-pill');
                const privPill = document.getElementById('privacy-ready-pill');
                const qLen = Array.isArray(campaignQueue) ? campaignQueue.length : 0;
                if (campPill) {
                    const cComp = (typeof completedCount !== 'undefined') ? completedCount : 0;
                    const cRem = (typeof remainingTargets !== 'undefined') ? remainingTargets : 0;
                    const isRunFinished = (!campaignActive) && (cComp > 0 && cRem === 0);
                    if (campaignActive) {
                        campPill.textContent = `CAMPAIGN: RUNNING (${cComp}/${totalTargets || qLen})`;
                        campPill.style.color = '#38bdf8';
                    } else if (isRunFinished) {
                        campPill.textContent = `CAMPAIGN: FINISHED (${cComp}/${totalTargets || qLen})`;
                        campPill.style.color = '#22c55e';
                    } else if (campaignPaused || window.__xpider_has_paused_checkpoint) {
                        const remDisplay = (typeof remainingTargets !== 'undefined' && remainingTargets > 0) ? remainingTargets : qLen;
                        campPill.textContent = `CAMPAIGN: PAUSED (${remDisplay} remaining)`;
                        campPill.style.color = '#00ffcc';
                    } else if (qLen > 0) {
                        campPill.textContent = `CAMPAIGN: READY (${qLen} URLs)`;
                        campPill.style.color = '#22c55e';
                    } else {
                        campPill.textContent = 'CAMPAIGN: QUEUE EMPTY';
                        campPill.style.color = '#94a3b8';
                    }
                }

                if (privPill) {
                    const st = await chrome.storage.local.get(['xpider_privacy_config', 'xpider_strict_privacy']);
                    const privCfg = st.xpider_privacy_config || {};
                    const isStrict = st.xpider_strict_privacy !== undefined ? st.xpider_strict_privacy : (privCfg.failClosed !== false);
                    
                    if (!isStrict || privCfg.enabled === false) {
                        privPill.textContent = 'PRIVACY: DIRECT (NORMAL)';
                        privPill.style.color = '#38bdf8';
                    } else {
                        chrome.runtime.sendMessage({ action: 'GET_PRIVACY_GATEWAY_STATE' }, (res) => {
                            if (chrome.runtime.lastError || !res || !res.success) {
                                const err = (res && res.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'RELAY_OFFLINE';
                                privPill.textContent = `PRIVACY: BLOCKED — ${err}`;
                                privPill.style.color = '#f87171';
                                return;
                            }
                            if (res.state?.egressMonitor && typeof window.updateEgressIpMonitorUI === 'function') {
                                window.updateEgressIpMonitorUI(res.state.egressMonitor);
                            }
                            if (res.state?.isGateReady) {
                                privPill.textContent = `PRIVACY: READY (${res.state.mode || 'ENFORCED'})`;
                                privPill.style.color = '#22c55e';
                            } else if (res.state?.lastPreflight?.verifying || res.state?.lastPreflight?.provisional) {
                                privPill.textContent = `PRIVACY: VERIFYING...`;
                                privPill.style.color = '#38bdf8';
                            } else {
                                const reason = res.state?.failureReason || 'RELAY_OFFLINE';
                                privPill.textContent = `PRIVACY: BLOCKED — ${reason}`;
                                privPill.style.color = '#f87171';
                            }
                        });

                    }
                }
            } catch (_) {}
        };
        setTimeout(window.checkAndRefreshPrivacyReadinessHUD, 300);

        // [RC3.60 .88 Directive #6497395270] Live Egress IP Monitor Controller
        let lastEgressData = null;
        window.updateEgressIpMonitorUI = function(data) {
            if (!data) return;
            lastEgressData = data;
            const showExact = localStorage.getItem('xpider_show_exact_ip') === 'true';

            // 1. Compact HUD elements
            const dot = document.getElementById('egress-status-dot');
            const routeLabel = document.getElementById('egress-route-label');
            const ipVal = document.getElementById('egress-ip-val');
            const toggleBtn = document.getElementById('egress-ip-toggle-btn');

            const route = data.activeRoute?.route || 'UNKNOWN';
            const routeStatus = data.activeRoute?.status || 'UNKNOWN';
            const bExit = data.browserExit || {};
            const decodo = data.decodoResidential || {};
            const dOcean = data.digitalOcean || {};
            const rawIsp = data.rawIspWan || {};

            const isRouteVerified = routeStatus === 'VERIFIED' && bExit.status === 'BROWSER_VERIFIED';
            const isDegraded = routeStatus !== 'VERIFIED' || bExit.status === 'COMPANION_PROBE_ONLY' || bExit.status === 'CANARY_FAILED' || bExit.status === 'PROXY_NOT_ENFORCED' || bExit.status === 'DO_NODE_ONLY_NOT_DECODO';
            const isBlocked = bExit.status === 'BLOCKED_HTTP_407' || decodo.status === 'BLOCKED_HTTP_407' || decodo.status === 'AUTH_FAILED';
            // [RC3.60 .89] Decodo LED truthfulness: companion emits 'CONNECTED / EGRESS_VERIFIED' (fresh upstream proof)
            // or 'IN_USE' (campaign-correlated CONNECT). Selected-but-not-fresh-verified must never read green.
            const decodoStatusStr = String(decodo.status || '');
            const decodoIsGood = decodoStatusStr.startsWith('CONNECTED') || decodoStatusStr === 'IN_USE';
            const decodoInactive = !decodoStatusStr || ['NOT_SELECTED', 'NOT_CONFIGURED', 'UNCONFIGURED'].includes(decodoStatusStr);
            const decodoSelectedUnverified = !decodoInactive && !decodoIsGood && !isBlocked;
            if (dot) {
                if (isBlocked) {
                    dot.style.background = '#ef4444';
                    dot.title = 'Route blocked / 407 error';
                } else if (decodoSelectedUnverified) {
                    dot.style.background = '#eab308';
                    dot.title = 'Decodo selected but upstream not freshly verified (' + decodoStatusStr + ')';
                } else if (isRouteVerified) {
                    dot.style.background = '#22c55e';
                    dot.title = 'Route verified';
                } else if (isDegraded) {
                    dot.style.background = '#eab308';
                    dot.title = 'Route degraded / companion probe only';
                } else {
                    dot.style.background = '#94a3b8';
                    dot.title = 'Route unverified / unknown';
                }
            }

            if (routeLabel) {
                routeLabel.textContent = 'ROUTE: ' + route;
                routeLabel.style.color = isRouteVerified ? '#38bdf8' : (isBlocked ? '#f87171' : '#cbd5e1');
            }

            const activeDisplayIp = showExact
                ? (bExit.observedIp || data.activeRoute?.egressIp || '...')
                : (bExit.observedIpMasked || data.activeRoute?.egressIpMasked || '...');

            if (ipVal) {
                ipVal.textContent = activeDisplayIp;
            }

            if (toggleBtn) {
                toggleBtn.textContent = showExact ? '🔒' : '👁️';
                toggleBtn.title = showExact ? 'Mask exact IPs' : 'Show exact IPs';
            }

            // 2. Settings table elements
            const tableToggleBtn = document.getElementById('egress-table-toggle-ip-btn');
            if (tableToggleBtn) {
                tableToggleBtn.textContent = showExact ? '🔒 Mask IPs' : '👁️ Show Exact';
            }

            // Row 1 Browser Exit
            const rBrowserStatus = document.getElementById('row-browser-status');
            const rBrowserIp = document.getElementById('row-browser-ip');
            const rBrowserSource = document.getElementById('row-browser-source');
            if (rBrowserStatus) {
                rBrowserStatus.textContent = bExit.status || 'UNKNOWN';
                rBrowserStatus.style.color = bExit.status === 'BROWSER_VERIFIED' ? '#22c55e' : (bExit.status === 'COMPANION_PROBE_ONLY' ? '#eab308' : (bExit.status === 'BLOCKED_HTTP_407' ? '#ef4444' : '#94a3b8'));
            }
            if (rBrowserIp) {
                rBrowserIp.textContent = showExact ? (bExit.observedIp || 'UNKNOWN') : (bExit.observedIpMasked || 'UNKNOWN');
            }
            if (rBrowserSource) {
                rBrowserSource.textContent = 'source: ' + (bExit.source || 'NONE');
            }

            // Row 2 Decodo Residential
            const rDecodoStatus = document.getElementById('row-decodo-status');
            const rDecodoIp = document.getElementById('row-decodo-ip');
            const rDecodoSource = document.getElementById('row-decodo-source');
            if (rDecodoStatus) {
                rDecodoStatus.textContent = decodo.status || 'NOT_CONFIGURED';
                rDecodoStatus.style.color = decodoIsGood ? '#22c55e' : (String(decodo.status).includes('407') || decodo.status === 'AUTH_FAILED' ? '#ef4444' : (decodoSelectedUnverified ? '#eab308' : '#94a3b8'));
            }
            if (rDecodoIp) {
                rDecodoIp.textContent = showExact ? (decodo.observedIp || 'NONE') : (decodo.observedIpMasked || 'NONE');
            }
            if (rDecodoSource) {
                const inUseTag = decodo.inUse ? ' (IN USE)' : '';
                rDecodoSource.textContent = 'source: ' + (decodo.source || 'UPSTREAM_PROBE') + inUseTag;
            }

            // Row 3 DigitalOcean
            const rDoStatus = document.getElementById('row-do-status');
            const rDoIp = document.getElementById('row-do-ip');
            const rDoSource = document.getElementById('row-do-source');
            if (rDoStatus) {
                rDoStatus.textContent = dOcean.status || 'CONFIGURED';
                rDoStatus.style.color = dOcean.status === 'HEALTHY' ? '#22c55e' : '#94a3b8';
            }
            if (rDoIp) {
                rDoIp.textContent = showExact ? (dOcean.configuredIp || 'NONE') : (dOcean.configuredIpMasked || 'NONE');
            }
            if (rDoSource) {
                rDoSource.textContent = 'source: ' + (dOcean.source || 'NODE_CONFIG');
            }

            // Row 4 Raw ISP WAN
            const rIspStatus = document.getElementById('row-isp-status');
            if (rIspStatus) {
                rIspStatus.textContent = rawIsp.status || 'UNKNOWN / NOT SAFELY MEASURED';
            }

            // Row 5 Active Route
            const rRouteVal = document.getElementById('row-route-val');
            const rRouteStatus = document.getElementById('row-route-status');
            const rRouteChecked = document.getElementById('row-route-checked');
            if (rRouteVal) {
                rRouteVal.textContent = route;
                rRouteVal.style.color = isRouteVerified ? '#38bdf8' : '#94a3b8';
            }
            if (rRouteStatus) {
                rRouteStatus.textContent = routeStatus;
                rRouteStatus.style.color = isRouteVerified ? '#22c55e' : (isBlocked ? '#ef4444' : '#eab308');
            }
            if (rRouteChecked) {
                rRouteChecked.textContent = data.activeRoute?.checkedAt ? new Date(data.activeRoute.checkedAt).toLocaleTimeString() : 'Never';
            }
        };

        const toggleIpVisibility = () => {
            const current = localStorage.getItem('xpider_show_exact_ip') === 'true';
            localStorage.setItem('xpider_show_exact_ip', (!current).toString());
            if (lastEgressData) {
                window.updateEgressIpMonitorUI(lastEgressData);
            }
        };

        const triggerCheckLiveEgressIp = (btnElement, force = true) => {
            if (btnElement) {
                btnElement.disabled = true;
                btnElement.textContent = 'Checking...';
            }
            chrome.runtime.sendMessage({ action: 'CHECK_LIVE_EGRESS_IP', force }, (res) => {
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.textContent = btnElement.id === 'egress-check-ip-btn' ? 'Check IP' : '🔄 Check IP';
                }
                if (res && res.success && res.egressMonitor) {
                    window.updateEgressIpMonitorUI(res.egressMonitor);
                }
            });
        };

        const bindEgressMonitorListeners = () => {
            const toggleBtn1 = document.getElementById('egress-ip-toggle-btn');
            const toggleBtn2 = document.getElementById('egress-table-toggle-ip-btn');
            const checkBtn1 = document.getElementById('egress-check-ip-btn');
            const checkBtn2 = document.getElementById('egress-table-refresh-btn');

            if (toggleBtn1) toggleBtn1.onclick = toggleIpVisibility;
            if (toggleBtn2) toggleBtn2.onclick = toggleIpVisibility;
            if (checkBtn1) checkBtn1.onclick = () => triggerCheckLiveEgressIp(checkBtn1, true);
            if (checkBtn2) checkBtn2.onclick = () => triggerCheckLiveEgressIp(checkBtn2, true);
        };
        setTimeout(bindEgressMonitorListeners, 200);
        setTimeout(() => triggerCheckLiveEgressIp(null, false), 500);


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

        // [Issue #6 DD4] Diagnostics Box Elements
        const relayDiagToggleBtn = document.getElementById('priv-relay-diag-toggle-btn');
        const relayDiagBox = document.getElementById('priv-relay-diagnostics-box');
        const relayDiagRefreshBtn = document.getElementById('priv-relay-diag-refresh-btn');
        const privDiagHost = document.getElementById('priv-diag-native-host');
        const privDiagBuild = document.getElementById('priv-diag-companion-build');
        const privDiagHealth = document.getElementById('priv-diag-port-health');
        const privDiagToken = document.getElementById('priv-diag-auth-token');
        const privDiagPool = document.getElementById('priv-diag-pool-state');
        const privDiagFailure = document.getElementById('priv-diag-failure-reason');

        const fetchAndRenderDiagnostics = (failureHint = null) => {
            chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_DIAGNOSTICS' }, (res) => {
                if (!res || !res.report) return;
                const r = res.report;
                const nh = r.nativeHost || {};
                const ph = r.port18989Health || {};

                if (privDiagHost) {
                    privDiagHost.textContent = nh.nativeHostPath || nh.error || 'Not registered / unavailable';
                }
                if (privDiagBuild) {
                    const b = nh.companionBuildId || (ph.data && ph.data.companionBuildId) || 'Unknown';
                    const exp = nh.expectedBuildId || 'R6.9G.10.3.7.1.4.31-20261019-PRIVATE-EGRESS-RC3.17';
                    privDiagBuild.textContent = `${b} ${b === exp ? '✓' : `(Expected: ${exp})`}`;
                }
                if (privDiagHealth) {
                    privDiagHealth.textContent = ph.ok ? `HTTP 200 OK (PID: ${ph.data?.pid || 'active'})` : (ph.error || `HTTP ${ph.status || 'UNREACHABLE'}`);
                }
                const isDesync = Boolean(r.tokenDesync || (r.statusAuth && r.statusAuth.status === 401) || nh.tokenDesync || nh.tokenValidity === 'TOKEN_PRESENT_REJECTED');
                if (privDiagToken) {
                    if (isDesync) {
                        privDiagToken.textContent = 'REJECTED (401 / TOKEN_DESYNC)';
                        privDiagToken.style.color = '#f87171';
                    } else if (r.hasTokenInMemory && r.statusAuth && r.statusAuth.ok) {
                        privDiagToken.textContent = 'AUTHENTICATED (In Extension Memory)';
                        privDiagToken.style.color = '#4ade80';
                    } else if (r.hasTokenInMemory) {
                        privDiagToken.textContent = 'In Extension Memory (Pending Verification)';
                        privDiagToken.style.color = '#fde047';
                    } else if (nh.hasControlToken) {
                        privDiagToken.textContent = `Present in package (${nh.tokenLength} chars) / Pending Extension load`;
                        privDiagToken.style.color = '#fde047';
                    } else {
                        privDiagToken.textContent = 'MISSING (Unauthenticated)';
                        privDiagToken.style.color = '#f87171';
                    }
                }
                if (privDiagPool) {
                    if (nh.poolConfigExists) {
                        privDiagPool.textContent = `${nh.poolNodesCount} Node(s) [Active: ${nh.selectedEgressId || 'none'}]`;
                    } else {
                        privDiagPool.textContent = 'egress_pool_config.json missing';
                    }
                }
                if (privDiagFailure) {
                    let fail = failureHint;
                    if (!fail) {
                        if (isDesync) fail = 'TOKEN_DESYNC_401';
                        else if (!ph.ok) fail = 'PORT_18989_OFFLINE';
                        else if (!r.hasTokenInMemory && !nh.hasControlToken) fail = 'AUTH_TOKEN_MISSING';
                        else if (nh.failureReason) fail = nh.failureReason;
                        else fail = 'HEALTHY';
                    }
                    privDiagFailure.textContent = fail;
                    privDiagFailure.style.color = (fail === 'HEALTHY' || fail === 'OPERATIONAL') ? '#4ade80' : '#f87171';
                }
            });
        };

        if (relayDiagToggleBtn && relayDiagBox) {
            relayDiagToggleBtn.addEventListener('click', () => {
                const isHidden = relayDiagBox.style.display === 'none';
                relayDiagBox.style.display = isHidden ? 'block' : 'none';
                if (isHidden) fetchAndRenderDiagnostics();
            });
        }

        if (relayDiagRefreshBtn) {
            relayDiagRefreshBtn.addEventListener('click', () => fetchAndRenderDiagnostics());
        }

        const escapeRelayHtml = (str) => {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const updateRelayStatusUI = (statusData, failureReason = null) => {
            if (relayDaemonBadge) {
                if (!statusData) {
                    if (failureReason === 'HTTP_401' || failureReason === 'HTTP_401_UNAUTHORIZED' || failureReason === 'AUTH_TOKEN_MISSING' || failureReason === 'TOKEN_DESYNC_401') {
                        relayDaemonBadge.textContent = 'UNAUTH (401)';
                        relayDaemonBadge.style.color = '#fbbf24';
                        relayDaemonBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                        relayDaemonBadge.style.border = '1px solid #f59e0b';
                    } else if (failureReason === 'STALE_COMPANION_BUILD' || failureReason === 'STALE_COMPANION_BUILD_NOT_UPGRADED' || failureReason === 'STALE_BUILD') {
                        relayDaemonBadge.textContent = 'STALE BUILD';
                        relayDaemonBadge.style.color = '#fbbf24';
                        relayDaemonBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                        relayDaemonBadge.style.border = '1px solid #f59e0b';
                    } else if (currentStartGateState === 'LOCKED_MISMATCH' || currentStartGateState === 'TRANSIENT_WAIT' || failureReason === 'BUILD_SYNC_REQUIRED' || failureReason === 'BUILD_UNRESOLVED') {
                        // [RC3.27 Directive 7] Show non-destructive BUILD SYNC REQUIRED during unresolved boot
                        relayDaemonBadge.textContent = 'BUILD SYNC REQUIRED';
                        relayDaemonBadge.style.color = '#fbbf24';
                        relayDaemonBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                        relayDaemonBadge.style.border = '1px solid #f59e0b';
                    } else {
                        relayDaemonBadge.textContent = 'OFFLINE';
                        relayDaemonBadge.style.color = '#f87171';
                        relayDaemonBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                        relayDaemonBadge.style.border = '1px solid #ef4444';
                    }
                } else if (statusData.lifecycleState === 'RECONNECTING') {
                    relayDaemonBadge.textContent = `RECONNECTING (${statusData.reconnectAttempt || 1}/10)`;
                    relayDaemonBadge.style.color = '#38bdf8';
                    relayDaemonBadge.style.background = 'rgba(56, 189, 248, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #38bdf8';
                } else if (statusData.lifecycleState === 'DEGRADED') {
                    relayDaemonBadge.textContent = 'DEGRADED / RECOVERING';
                    relayDaemonBadge.style.color = '#fbbf24';
                    relayDaemonBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                    relayDaemonBadge.style.border = '1px solid #f59e0b';
                } else if (statusData.lifecycleState === 'FAILED') {
                    relayDaemonBadge.textContent = 'RECOVERY EXHAUSTED';
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

            if (privDiagFailure) {
                let fail = failureReason;
                if (!fail || fail === 'ONLINE_STANDBY' || fail === 'DEGRADED') {
                    if (statusData) {
                        if (statusData.relayReady) {
                            fail = 'OPERATIONAL';
                        } else if (statusData.residentialProxySelected && (!statusData.residentialProxy || !statusData.residentialProxy.sendAllowed || statusData.residentialProxy.status !== 'EGRESS_VERIFIED')) {
                            const resDetail = statusData.residentialProxy ? (statusData.residentialProxy.detail || statusData.residentialProxy.status) : 'UNCONFIGURED';
                            fail = `UPSTREAM_WAIT: DECODO_${resDetail}`;
                        } else if (statusData.physicalGate && statusData.physicalGate.enabled && !statusData.physicalGate.ready) {
                            fail = 'PHYSICAL_GATE_FAIL_CLOSED';
                        } else if (statusData.totalNodes === 0 || !statusData.selectedEgressId) {
                            fail = 'NO_EGRESS_NODES';
                        } else {
                            fail = statusData.lastDisconnectReason || 'STANDBY_UNVERIFIED';
                        }
                    } else {
                        fail = 'OFFLINE';
                    }
                }
                privDiagFailure.textContent = fail;
                privDiagFailure.style.color = (fail === 'OPERATIONAL' || fail === 'HEALTHY') ? '#4ade80' : '#f87171';
            }

            if (statusData && statusData.egressIpMonitor && typeof window.updateEgressIpMonitorUI === 'function') {
                window.updateEgressIpMonitorUI(statusData.egressIpMonitor);
            }
            // [Issue #6 Comment #6273652325 EE2] Refresh main campaign HUD on relay readiness transitions
            if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                window.checkAndRefreshPrivacyReadinessHUD();
            }
        };


        const refreshRelayStatus = (cb) => {
            chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (res) => {
                if (res && res.success && res.result && res.result.status) {
                    updateRelayStatusUI(res.result.status);
                    onBackgroundMessageSuccess();
                    if (res.result.status.relayReady && typeof reconcilePrivacyReadiness === 'function') {
                        const curCard = document.getElementById('priv-card-enabled')?.textContent;
                        if (!curCard || !curCard.includes('ON (READY)')) {
                            reconcilePrivacyReadiness({ reason: 'RELAY_READY_TRANSITION' });
                        }
                    }
                    if (typeof cb === 'function') cb(res.result.status);
                } else {
                    const failReason = (res && (res.failureReason || (res.result && res.result.reason))) || 'OFFLINE';
                    updateRelayStatusUI(null, failReason);
                    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                        window.checkAndRefreshPrivacyReadinessHUD();
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
                        refreshRelayStatus();
                        refreshRelayNodes();
                        addLog(`🔄 [Privacy Relay] Egress rotated to: ${res.result.selectedEgressId} (FP: ${res.result.egressFingerprint})`, 'info');
                    } else {
                        refreshRelayStatus();
                        const err = (res && res.error) || (res && res.result && res.result.reason) || 'Rotation failed';
                        addLog(`⚠️ [Privacy Relay] Rotation failed: ${err}`, 'warn');
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

                // Show diagnostics box automatically on Start / Repair click
                if (relayDiagBox) {
                    relayDiagBox.style.display = 'block';
                    fetchAndRenderDiagnostics('STARTING...');
                }

                chrome.runtime.sendMessage({ action: 'START_PRIVACY_RELAY_NATIVE' }, (res) => {
                    if (res && !res.success) {
                        const failReason = res.failureReason || res.error || 'NATIVE_HOST_NOT_INSTALLED';
                        updateRelayStatusUI(null, failReason);
                        relayRepairBtn.disabled = false;
                        relayRepairBtn.textContent = '⚡ Start / Repair';
                        addLog(`⚠️ [Privacy Relay] Native host launch failed: ${failReason}. Check diagnostics below or run XPIDER_AUTO_SETUP.bat.`, 'warn');
                        fetchAndRenderDiagnostics(failReason);
                        return;
                    }

                    if (res && res.success) {
                        addLog('⚡ [Privacy Relay] Native launch command dispatched. Polling daemon...', 'info');
                        fetchAndRenderDiagnostics('POLLING_DAEMON...');
                    }

                    // Bounded polling loop (up to 8 seconds, 1s interval)
                    let attempts = 0;
                    const maxAttempts = 8;
                    let lastPollError = null;
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
                                fetchAndRenderDiagnostics(st.relayReady ? 'OPERATIONAL' : 'ONLINE_STANDBY');
                            } else {
                                lastPollError = (pollRes && (pollRes.failureReason || (pollRes.result && pollRes.result.reason))) || 'HTTP_401';
                                if (attempts >= maxAttempts) {
                                    clearInterval(pollTimer);
                                    updateRelayStatusUI(null, lastPollError);
                                    relayRepairBtn.disabled = false;
                                    relayRepairBtn.textContent = '⚡ Start / Repair';
                                    addLog(`⚠️ [Privacy Relay] Daemon not reachable/ready after 8s bounded polling: ${lastPollError}. Check diagnostics panel.`, 'warn');
                                    fetchAndRenderDiagnostics(lastPollError);
                                }
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

                const transportBindingEl = document.getElementById('priv-node-transport-binding');
                const identityGroupEl = document.getElementById('priv-node-identity-group');

                const nodePayload = {
                    type: pType,
                    host: pHost,
                    port: pPort,
                    name: nodeNameEl ? nodeNameEl.value.trim() : '',
                    username: nodeUserEl ? nodeUserEl.value.trim() : '',
                    password: nodePassEl ? nodePassEl.value : '',
                    transportBinding: transportBindingEl && transportBindingEl.value ? transportBindingEl.value : null,
                    egressIdentityGroup: identityGroupEl && identityGroupEl.value.trim() ? identityGroupEl.value.trim() : null,
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

                                if (nodePayload.transportBinding) {
                                    chrome.runtime.sendMessage({
                                        action: 'ENROLL_PHYSICAL_EGRESS',
                                        data: {
                                            nodeId: addedNode.id,
                                            transportBinding: nodePayload.transportBinding,
                                            egressIdentityGroup: nodePayload.egressIdentityGroup
                                        }
                                    }, () => {
                                        chrome.runtime.sendMessage({ action: 'QUERY_PHYSICAL_GATE' }, (pgRes) => {
                                            if (pgRes && pgRes.result && pgRes.result.status) {
                                                _updatePhysicalGateUI(pgRes.result.status);
                                            }
                                        });
                                    });
                                }

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

        // ==============================================================================
        // [Issue #6 R6.9G.10.3] One-Click Automated Private Egress Setup Wizard
        // ==============================================================================
        const initPrivateEgressWizard = () => {
            const modal = document.getElementById('private-egress-modal-overlay');
            const closeBtn = document.getElementById('wizard-close-btn');
            const toggleAdvBtn = document.getElementById('wizard-toggle-advanced-btn');
            const advPane = document.getElementById('wizard-advanced-pane');
            const tierSelect = document.getElementById('wizard-tier-select');
            const regionSelect = document.getElementById('wizard-region-select');
            const tokenInput = document.getElementById('wizard-do-token');
            const verifyBtn = document.getElementById('wizard-verify-btn');
            const stepBContainer = document.getElementById('wizard-step-b-container');
            const authCheck = document.getElementById('wizard-auth-check');
            const authLabel = document.getElementById('wizard-auth-label');
            const createBtn = document.getElementById('wizard-create-btn');
            const destroyBtn = document.getElementById('wizard-destroy-btn');
            const recoveryBanner = document.getElementById('wizard-recovery-banner');
            const recoveryBadge = document.getElementById('wizard-recovery-badge');
            const recoveryDetails = document.getElementById('wizard-recovery-details');
            const recoveryCleanupBtn = document.getElementById('wizard-recovery-cleanup-btn');
            const activeBanner = document.getElementById('wizard-active-banner');
            const activeDetails = document.getElementById('wizard-active-details');
            const activeKeepBtn = document.getElementById('wizard-active-keep-btn');
            const activeRepairBtn = document.getElementById('wizard-active-repair-btn');
            const activeDestroyBtn = document.getElementById('wizard-active-destroy-btn');
            const settingsRepairBtn = document.getElementById('priv-relay-repair-egress-btn');
            const progressHud = document.getElementById('wizard-progress-hud');
            const progressTitle = document.getElementById('wizard-progress-title');
            const progressPercent = document.getElementById('wizard-progress-percent');
            const progressBar = document.getElementById('wizard-progress-bar');
            const stageList = document.getElementById('wizard-stage-list');
            const planCard = document.getElementById('wizard-plan-card');
            const openWizardBtn = document.getElementById('priv-relay-open-wizard-btn');
            const telemetryBadge = document.getElementById('priv-telemetry-badge');

            if (!modal) return;

            let verifiedPlan = null;
            let verifiedPriceStr = '$6.00/MO';

            const TIERS_META = {
                ULTRA_ECONOMY: {
                    badge: 'ULTRA ECONOMY — RECOMMENDED FOR SINGLE OWNER',
                    price: '~$6 / month',
                    title: '1 Dedicated Private Egress Server (NYC3)',
                    desc: 'Basic 1 vCPU / 1 GiB RAM • Authenticated TLS Proxy • Cloud Firewall • Strict Fail-Closed • Pinned CA',
                    btnText: '⚡ STEP B: CREATE PRIVATE EGRESS — $6.00/MO'
                },
                ECONOMY: {
                    badge: 'TIER 2: ECONOMY (HIGH RAM)',
                    price: '~$12 / month',
                    title: '1 Dedicated Private Egress Server (NYC3)',
                    desc: 'Basic 1 vCPU / 2 GiB RAM • Upgrade only if measured resource pressure exists',
                    btnText: '⚡ STEP B: CREATE PRIVATE EGRESS — $12.00/MO'
                },
                PERFORMANCE: {
                    badge: 'TIER 3: PERFORMANCE',
                    price: '~$24 / month',
                    title: '1 Dedicated Performance Server (NYC3)',
                    desc: 'Basic 2 vCPU / 4 GiB RAM • High concurrent tunnel capacity for heavy usage',
                    btnText: '⚡ STEP B: CREATE PRIVATE EGRESS — $24.00/MO'
                },
                HA_DUAL: {
                    badge: 'TIER 4: HIGH AVAILABILITY (DUAL NODE)',
                    price: '~$12 / month',
                    title: '2 Independent Servers (NYC3 Primary + TOR1 Standby)',
                    desc: '2x 1 vCPU / 1 GiB RAM • Automatic Health Failover • Zero single point of failure',
                    btnText: '⚡ STEP B: CREATE PRIVATE EGRESS — $12.00/MO'
                }
            };

            const STAGES_META = [
                '1/8 VPS CONNECTION',
                '2/8 SERVER PREP',
                '3/8 TLS',
                '4/8 PRIVATE PROXY',
                '5/8 FIREWALL',
                '6/8 LOCAL RELAY REGISTRATION',
                '7/8 EGRESS VERIFICATION',
                '8/8 STRICT PRIVACY READY'
            ];

            const renderInitialStages = () => {
                if (!stageList) return;
                stageList.innerHTML = STAGES_META.map((stg, i) => {
                    const statusText = i === 0 ? 'WORKING' : 'PENDING';
                    const color = i === 0 ? '#38bdf8' : '#64748b';
                    return `<div style="display: flex; justify-content: space-between; color: ${color};">
                        <span>${stg}</span>
                        <span id="stg-badge-${i+1}">${statusText}</span>
                    </div>`;
                }).join('');
            };

            const updateStageStatus = (step, status) => {
                const badge = document.getElementById(`stg-badge-${step}`);
                if (badge) {
                    badge.textContent = status;
                    const parent = badge.parentElement;
                    if (status === 'PASS') {
                        badge.style.color = '#4ade80';
                        if (parent) parent.style.color = '#4ade80';
                    } else if (status === 'WORKING') {
                        badge.style.color = '#38bdf8';
                        if (parent) parent.style.color = '#38bdf8';
                    } else if (status === 'FAIL') {
                        badge.style.color = '#f87171';
                        if (parent) parent.style.color = '#f87171';
                    }
                }
            };

            const updatePlanUi = (tierId) => {
                const t = TIERS_META[tierId] || TIERS_META.ULTRA_ECONOMY;
                if (planCard && !verifiedPlan) {
                    planCard.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 10px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;">${t.badge}</span>
                            <span style="font-size: 12px; font-weight: 700; color: #4ade80;">${t.price}</span>
                        </div>
                        <div style="font-size: 11px; font-weight: 600; color: #f8fafc; margin-bottom: 2px;">${t.title}</div>
                        <div style="font-size: 10px; color: #94a3b8; line-height: 1.3;">${t.desc}</div>
                    `;
                }
                if (createBtn && !verifiedPlan) {
                    createBtn.textContent = t.btnText;
                }
            };

            // [RC3.14 CC2] Continuous Live Relay Status Polling & Dynamic UI Reflection
            let liveStatusPollTimer = null;

            const updateLiveRelayStatusUi = (statusData) => {
                const liveContainer = document.getElementById('wizard-live-status-container');
                const liveBadge = document.getElementById('wizard-live-status-badge');
                const liveAge = document.getElementById('wizard-live-health-age');
                const liveDetails = document.getElementById('wizard-live-status-details');
                const activeIndicator = document.getElementById('wizard-active-live-indicator');
                const activeBannerTitle = document.getElementById('wizard-active-banner-title');
                const activeBannerBadge = document.getElementById('wizard-active-banner-badge');

                if (!statusData) {
                    if (liveContainer) liveContainer.style.display = 'none';
                    if (activeIndicator) activeIndicator.innerHTML = '<span style="color: #94a3b8;">Live Relay: Offline or unreachable</span>';
                    return;
                }

                const isReady = Boolean(statusData.relayReady);
                const isHealthValid = Boolean(statusData.isHealthValid);
                const isExpired = Boolean(statusData.isExpired);
                const healthStr = statusData.health || 'UNKNOWN';
                const ttlSec = Math.round((statusData.healthTtlMs || 60000) / 1000);
                const ageSec = statusData.healthAgeMs != null ? Math.max(0, Math.round(statusData.healthAgeMs / 1000)) : null;

                // Show live container if progressHud is visible and at 100%
                if (progressHud && progressHud.style.display !== 'none' && progressBar && progressBar.style.width === '100%') {
                    if (liveContainer) liveContainer.style.display = 'block';
                }

                if (isReady && isHealthValid && !isExpired && healthStr === 'HEALTHY') {
                    // HEALTHY / READY
                    if (liveBadge) {
                        liveBadge.textContent = '🟢 OPERATIONAL: READY (HEALTHY)';
                        liveBadge.style.color = '#4ade80';
                        liveBadge.style.background = 'rgba(74, 222, 128, 0.2)';
                        liveBadge.style.border = '1px solid #4ade80';
                    }
                    if (liveAge) {
                        liveAge.textContent = `Health Age: ${ageSec !== null ? ageSec + 's' : '0s'} / TTL: ${ttlSec}s`;
                        liveAge.style.color = '#86efac';
                    }
                    if (liveDetails) {
                        liveDetails.textContent = `Continuous health refresh active (cadence: ${Math.round((statusData.healthRefreshIntervalMs || 20000) / 1000)}s). Traffic forwarding enabled.`;
                        liveDetails.style.color = '#cbd5e1';
                    }
                    if (activeIndicator) {
                        activeIndicator.innerHTML = `🟢 <b>LIVE STATUS: HEALTHY</b> — Verified ${ageSec !== null ? ageSec + 's' : '0s'} ago (TTL: ${ttlSec}s). Forwarding active.`;
                        activeIndicator.style.border = '1px solid #22c55e';
                        activeIndicator.style.color = '#86efac';
                    }
                    if (activeBannerTitle) activeBannerTitle.textContent = '🟢 ACTIVE PRIVATE EGRESS NODE EXISTS';
                    if (activeBannerBadge) {
                        activeBannerBadge.textContent = 'HEALTHY';
                        activeBannerBadge.style.color = '#4ade80';
                        activeBannerBadge.style.background = 'rgba(34, 197, 94, 0.25)';
                    }
                    if (activeBanner) {
                        activeBanner.style.border = '1px solid #22c55e';
                        activeBanner.style.background = 'rgba(34, 197, 94, 0.12)';
                    }
                    if (progressTitle && progressBar && progressBar.style.width === '100%') {
                        progressTitle.textContent = '8/8 STRICT PRIVACY READY';
                    }
                } else {
                    // NOT READY / DEGRADED / EXPIRED
                    const reason = isExpired ? 'HEALTH_TTL_EXPIRED' : (healthStr !== 'HEALTHY' ? healthStr : 'RELAY_NOT_READY');
                    if (liveBadge) {
                        liveBadge.textContent = `⚠️ OPERATIONAL: NOT READY / DEGRADED (${reason})`;
                        liveBadge.style.color = '#f87171';
                        liveBadge.style.background = 'rgba(239, 68, 68, 0.25)';
                        liveBadge.style.border = '1px solid #ef4444';
                    }
                    if (liveAge) {
                        liveAge.textContent = `Health Age: ${ageSec !== null ? ageSec + 's' : 'EXPIRED'} / TTL: ${ttlSec}s`;
                        liveAge.style.color = '#fca5a5';
                    }
                    if (liveDetails) {
                        liveDetails.textContent = `⚠️ Fail-Closed Active: Egress health TTL expired or probe failed. Proxy forwarding blocked until health check passes.`;
                        liveDetails.style.color = '#fca5a5';
                    }
                    if (activeIndicator) {
                        activeIndicator.innerHTML = `⚠️ <b>LIVE STATUS: DEGRADED / EXPIRED</b> (${reason}) — Health Age: ${ageSec !== null ? ageSec + 's' : 'N/A'}, TTL: ${ttlSec}s. Forwarding Blocked.`;
                        activeIndicator.style.border = '1px solid #ef4444';
                        activeIndicator.style.color = '#fca5a5';
                    }
                    if (activeBannerTitle) activeBannerTitle.textContent = '⚠️ ACTIVE NODE DEGRADED / EXPIRED';
                    if (activeBannerBadge) {
                        activeBannerBadge.textContent = 'DEGRADED';
                        activeBannerBadge.style.color = '#fca5a5';
                        activeBannerBadge.style.background = 'rgba(239, 68, 68, 0.3)';
                    }
                    if (activeBanner) {
                        activeBanner.style.border = '2px solid #ef4444';
                        activeBanner.style.background = 'rgba(239, 68, 68, 0.15)';
                    }

                    // If historical progress hud is at 100%, clearly distinguish historical provisioning from live status
                    if (progressTitle && progressBar && progressBar.style.width === '100%') {
                        progressTitle.textContent = `8/8 PROVISIONED — ⚠️ LIVE STATUS: DEGRADED`;
                    }
                }
            };

            const pollLiveRelayStatus = () => {
                chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (res) => {
                    if (res && res.success && res.result && res.result.status) {
                        updateLiveRelayStatusUi(res.result.status);
                    } else {
                        updateLiveRelayStatusUi(null);
                    }
                });
            };

            const startLiveRelayPolling = () => {
                if (liveStatusPollTimer) clearInterval(liveStatusPollTimer);
                pollLiveRelayStatus();
                liveStatusPollTimer = setInterval(pollLiveRelayStatus, 5000);
            };

            const stopLiveRelayPolling = () => {
                if (liveStatusPollTimer) {
                    clearInterval(liveStatusPollTimer);
                    liveStatusPollTimer = null;
                }
            };

            // [U1 & U3 Hardening] Check and display recovery or active node status
            const checkWizardRecoveryState = (onDone) => {
                // [Build Parity Check - Issue #6 Comment #6251236140] Check Extension & Companion builds
                chrome.runtime.sendMessage({ action: 'GET_COMPANION_BUILD_STATUS' }, (bRes) => {
                    const extBuildSpan = document.getElementById('wizard-ext-build-id');
                    const compBuildSpan = document.getElementById('wizard-companion-build-id');
                    const parityCard = document.getElementById('wizard-build-parity-card');
                    const extBuild = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.buildId : (bRes && bRes.extensionBuildId) || 'UNKNOWN';
                    if (extBuildSpan) {
                        extBuildSpan.textContent = extBuild.includes('RC') ? (extBuild.split('PRIVATE-EGRESS-')[1] || extBuild) : extBuild;
                    }
                    if (bRes && bRes.success && bRes.companionBuildId) {
                        const compBuild = bRes.companionBuildId;
                        if (compBuildSpan) {
                            compBuildSpan.textContent = compBuild.includes('RC') ? (compBuild.split('PRIVATE-EGRESS-')[1] || compBuild) : compBuild;
                        }
                        const extPrefix = extBuild.split('-')[0];
                        const compPrefix = compBuild.split('-')[0];
                        if (extPrefix !== compPrefix) {
                            if (parityCard) {
                                parityCard.style.border = '1px solid #ef4444';
                                parityCard.style.background = 'rgba(239, 68, 68, 0.2)';
                            }
                            if (compBuildSpan) {
                                compBuildSpan.style.color = '#f87171';
                                compBuildSpan.textContent += ' ⚠️ MISMATCH';
                            }
                        } else {
                            if (parityCard) {
                                parityCard.style.border = '1px solid rgba(34, 197, 94, 0.4)';
                                parityCard.style.background = 'rgba(34, 197, 94, 0.1)';
                            }
                            if (compBuildSpan) compBuildSpan.style.color = '#4ade80';
                        }
                    } else {
                        if (compBuildSpan) {
                            compBuildSpan.textContent = 'NOT RUNNING';
                            compBuildSpan.style.color = '#f87171';
                        }
                    }
                });

                chrome.runtime.sendMessage({ action: 'GET_RECOVERY_STATUS' }, (res) => {
                    const recovery = (res && res.success && res.recovery) ? res.recovery : null;
                    if (!recovery) {
                        if (recoveryBanner) recoveryBanner.style.display = 'none';
                        if (activeBanner) activeBanner.style.display = 'none';
                        if (typeof onDone === 'function') onDone(null);
                        return;
                    }

                    if (recovery.recoveryRequired) {
                        if (recoveryBanner) recoveryBanner.style.display = 'block';
                        if (activeBanner) activeBanner.style.display = 'none';
                        if (recoveryBadge) recoveryBadge.textContent = recovery.stage || 'RECOVERY REQUIRED';
                        if (recoveryDetails) {
                            const parts = [
                                `Tag: ${recovery.transactionTag || 'N/A'}`,
                                `Stage: ${recovery.stage || 'INTERRUPTED'}`,
                                recovery.dropletId ? `Droplet ID: ${recovery.dropletId}` : null,
                                recovery.firewallId ? `Firewall ID: ${recovery.firewallId}` : null,
                                recovery.error ? `Error: ${recovery.error}` : null
                            ].filter(Boolean);
                            recoveryDetails.innerHTML = parts.join('<br>');
                        }
                        if (verifyBtn) {
                            verifyBtn.disabled = true;
                            verifyBtn.textContent = '🔒 BLOCKED: Recovery Required';
                        }
                        if (createBtn) {
                            createBtn.disabled = true;
                            createBtn.textContent = '🔒 BLOCKED: Clean Up Cloud Resources First';
                        }
                        if (stepBContainer) {
                            stepBContainer.style.opacity = '0.5';
                            stepBContainer.style.pointerEvents = 'none';
                        }
                        if (authCheck) {
                            authCheck.disabled = true;
                            authCheck.checked = false;
                        }
                    } else if (recovery.status === 'ACTIVE' || recovery.activeNode) {
                        if (recoveryBanner) recoveryBanner.style.display = 'none';
                        if (activeBanner) activeBanner.style.display = 'block';
                        const node = recovery.activeNode || recovery;
                        if (activeDetails) {
                            const parts = [
                                `Droplet ID: ${node.dropletId || 'N/A'}`,
                                `Public IP: ${node.publicIp || 'N/A'}`,
                                `Tier: ${node.tier || 'N/A'} | Region: ${(node.region || 'NYC3').toUpperCase()}`,
                                node.transactionTag ? `Tag: ${node.transactionTag}` : null
                            ].filter(Boolean);
                            activeDetails.innerHTML = parts.join('<br>');
                        }
                        pollLiveRelayStatus();
                        if (createBtn) {
                            createBtn.disabled = true;
                            createBtn.textContent = '🔒 BLOCKED: Active Node Exists (Single-Owner Limit)';
                        }
                        if (stepBContainer) {
                            stepBContainer.style.opacity = '0.5';
                            stepBContainer.style.pointerEvents = 'none';
                        }
                        if (authCheck) {
                            authCheck.disabled = true;
                            authCheck.checked = false;
                        }
                    } else {
                        if (recoveryBanner) recoveryBanner.style.display = 'none';
                        if (activeBanner) activeBanner.style.display = 'none';
                        if (verifyBtn && verifyBtn.textContent.includes('BLOCKED')) {
                            verifyBtn.disabled = false;
                            verifyBtn.textContent = '🔍 STEP A: VERIFY PLAN & PRICE (Zero Cloud Creation)';
                        }
                    }

                    if (typeof onDone === 'function') onDone(recovery);
                });
            };

            window.openPrivateEgressWizard = () => {
                // [P0 UI Fix - Issue #6 Comment #6231022137 & Y3] Close settings overlay before opening wizard
                const settingsOverlay = document.getElementById('settings-overlay');
                if (settingsOverlay) {
                    closeModalOverlay(settingsOverlay);
                }
                const privacyBlockModal = document.getElementById('privacy-block-modal-overlay');
                if (privacyBlockModal) {
                    closeModalOverlay(privacyBlockModal);
                }

                openModalOverlay(modal);
                if (progressHud) progressHud.style.display = 'none';
                if (tokenInput) tokenInput.value = '';
                verifiedPlan = null;
                if (stepBContainer) {
                    stepBContainer.style.opacity = '0.5';
                    stepBContainer.style.pointerEvents = 'none';
                }
                if (authCheck) {
                    authCheck.checked = false;
                    authCheck.disabled = true;
                }
                if (createBtn) {
                    createBtn.disabled = true;
                    createBtn.textContent = '⚡ STEP B: CREATE PRIVATE EGRESS';
                }
                if (verifyBtn) {
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = '🔍 STEP A: VERIFY PLAN & PRICE (Zero Cloud Creation)';
                }
                updatePlanUi(tierSelect ? tierSelect.value : 'ULTRA_ECONOMY');
                checkWizardRecoveryState();
                pollTelemetry();
            };

            if (openWizardBtn) {
                openWizardBtn.onclick = () => window.openPrivateEgressWizard();
            }

            if (closeBtn) {
                closeBtn.onclick = () => {
                    closeModalOverlay(modal);
                };
            }

            if (toggleAdvBtn && advPane) {
                toggleAdvBtn.onclick = () => {
                    advPane.style.display = advPane.style.display === 'none' ? 'block' : 'none';
                };
            }

            if (tierSelect) {
                tierSelect.onchange = (e) => {
                    verifiedPlan = null;
                    if (stepBContainer) { stepBContainer.style.opacity = '0.5'; stepBContainer.style.pointerEvents = 'none'; }
                    if (authCheck) { authCheck.checked = false; authCheck.disabled = true; }
                    if (createBtn) { createBtn.disabled = true; }
                    updatePlanUi(e.target.value);
                };
            }

            if (regionSelect) {
                regionSelect.onchange = () => {
                    verifiedPlan = null;
                    if (stepBContainer) { stepBContainer.style.opacity = '0.5'; stepBContainer.style.pointerEvents = 'none'; }
                    if (authCheck) { authCheck.checked = false; authCheck.disabled = true; }
                    if (createBtn) { createBtn.disabled = true; }
                    updatePlanUi(tierSelect ? tierSelect.value : 'ULTRA_ECONOMY');
                };
            }

            if (authCheck) {
                authCheck.onchange = () => {
                    if (createBtn) {
                        createBtn.disabled = !authCheck.checked || !verifiedPlan;
                    }
                };
            }

            const pollTelemetry = () => {
                chrome.runtime.sendMessage({ action: 'GET_EGRESS_TELEMETRY' }, (res) => {
                    if (res && res.success && res.telemetry) {
                        const t = res.telemetry;
                        if (telemetryBadge) {
                            telemetryBadge.style.display = 'inline-block';
                            if (t.status === 'GOOD') {
                                telemetryBadge.style.color = '#4ade80';
                                telemetryBadge.style.borderColor = '#4ade80';
                                telemetryBadge.style.background = 'rgba(74, 222, 128, 0.15)';
                                telemetryBadge.textContent = 'VPS: GOOD';
                            } else if (t.status === 'WATCH') {
                                telemetryBadge.style.color = '#facc15';
                                telemetryBadge.style.borderColor = '#facc15';
                                telemetryBadge.style.background = 'rgba(250, 204, 21, 0.15)';
                                telemetryBadge.textContent = 'VPS: WATCH';
                            } else if (t.status === 'UPGRADE_RECOMMENDED') {
                                telemetryBadge.style.color = '#f87171';
                                telemetryBadge.style.borderColor = '#f87171';
                                telemetryBadge.style.background = 'rgba(248, 113, 113, 0.2)';
                                telemetryBadge.textContent = 'VPS: UPGRADE REC';
                            }
                        }
                    }
                });
            };

            // [Blocker I Hardening] STEP A: Verify Plan & Price (Zero Cloud Resources Created)
            if (verifyBtn) {
                verifyBtn.onclick = async () => {
                    const token = tokenInput ? tokenInput.value.trim() : '';
                    if (!token) {
                        alert('Please enter your DigitalOcean API token to verify plan and price.');
                        if (tokenInput) tokenInput.focus();
                        return;
                    }

                    const tier = tierSelect ? tierSelect.value : 'ULTRA_ECONOMY';
                    const region = regionSelect ? regionSelect.value : 'nyc3';

                    verifyBtn.disabled = true;
                    verifyBtn.textContent = '⏳ Verifying provider catalog (Zero cloud creation)...';

                    chrome.runtime.sendMessage({
                        action: 'VERIFY_PRIVATE_EGRESS_PLAN',
                        payload: {
                            token,
                            tier,
                            region,
                            extensionBuildId: (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO ? BuildProvenance.BUILD_INFO.buildId : null),
                            extensionFunctionalHead: (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO ? BuildProvenance.BUILD_INFO.implementationHead : null)
                        }
                    }, (res) => {
                        verifyBtn.disabled = false;
                        verifyBtn.textContent = '🔍 STEP A: VERIFY PLAN & PRICE (Zero Cloud Creation)';

                        if (res && res.success && res.result && res.result.valid) {
                            verifiedPlan = res.result;
                            const priceMonthly = verifiedPlan.monthlyCostUsd;
                            const priceHourly = verifiedPlan.hourlyCostUsd;
                            if (typeof priceMonthly !== 'number' || priceMonthly <= 0 || !Number.isFinite(priceMonthly) ||
                                typeof priceHourly !== 'number' || priceHourly <= 0 || !Number.isFinite(priceHourly)) {
                                verifiedPlan = null;
                                if (stepBContainer) {
                                    stepBContainer.style.opacity = '0.5';
                                    stepBContainer.style.pointerEvents = 'none';
                                }
                                if (authCheck) {
                                    authCheck.disabled = true;
                                    authCheck.checked = false;
                                }
                                if (createBtn) {
                                    createBtn.disabled = true;
                                }
                                const err = 'PROVIDER_PRICE_UNAVAILABLE: Provider catalog did not return a valid positive monthly and hourly price.';
                                addLog(`❌ [PLAN_VERIFY_FAIL] ${err}`, 'error');
                                alert(`Plan verification failed:\n\n[PROVIDER_PRICE_UNAVAILABLE]\n${err}`);
                                return;
                            }

                            verifiedPriceStr = `$${priceMonthly.toFixed(2)}/MO`;
                            const formatted = verifiedPlan.formattedPrice || `$${priceMonthly.toFixed(2)} / month ($${priceHourly} / hr)`;

                            if (planCard) {
                                planCard.innerHTML = `
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                        <span style="font-size: 10px; font-weight: 700; color: #4ade80; background: rgba(74, 222, 128, 0.15); padding: 2px 6px; border-radius: 4px; border: 1px solid #4ade80;">✅ PLAN & PRICE CONFIRMED (LIVE CATALOG)</span>
                                        <span style="font-size: 12px; font-weight: 700; color: #4ade80;">${formatted}</span>
                                    </div>
                                    <div style="font-size: 11px; font-weight: 600; color: #f8fafc; margin-bottom: 2px;">1 Dedicated Private Egress Server (${region.toUpperCase()}) — ${verifiedPlan.tierName || 'Ultra Economy'}</div>
                                    <div style="font-size: 10px; color: #94a3b8; line-height: 1.3;">Size: ${verifiedPlan.size} • Account: ${verifiedPlan.accountEmail} • Zero cloud resources created so far.</div>
                                `;
                            }

                            if (authLabel) {
                                authLabel.textContent = `I authorize creating 1 DigitalOcean server at $${priceMonthly.toFixed(2)}/mo ($${priceHourly}/hr) and cloud firewall in ${region.toUpperCase()}.`;
                            }
                            if (authCheck) {
                                authCheck.disabled = false;
                                authCheck.checked = false;
                            }
                            if (createBtn) {
                                createBtn.disabled = true;
                                createBtn.textContent = `⚡ STEP B: CREATE PRIVATE EGRESS — ${verifiedPriceStr}`;
                            }
                            if (stepBContainer) {
                                stepBContainer.style.opacity = '1';
                                stepBContainer.style.pointerEvents = 'auto';
                            }
                            addLog(`✅ [PLAN_VERIFIED] DigitalOcean plan verified: ${verifiedPlan.size} in ${region.toUpperCase()} at ${formatted} (Zero cloud resources created)`, 'success');
                        } else {
                            verifiedPlan = null;
                            if (stepBContainer) {
                                stepBContainer.style.opacity = '0.5';
                                stepBContainer.style.pointerEvents = 'none';
                            }
                            if (authCheck) {
                                authCheck.disabled = true;
                                authCheck.checked = false;
                            }
                            if (createBtn) {
                                createBtn.disabled = true;
                            }
                            const rawErr = (res && res.result && (res.result.reason || res.result.error)) || (res && res.error) || 'Failed to verify plan and price with provider';
                            const errCode = (res && res.result && res.result.error) || (res && res.error) || 'VERIFY_FAILED';

                            // [Issue #6 Comment #6244711545] Categorize into clean Owner UX error classes
                            let displayMsg = '';
                            if (errCode === 'TOKEN_INVALID' || rawErr.includes('401') || rawErr.includes('Unauthorized') || rawErr.includes('Invalid DigitalOcean API token')) {
                                displayMsg = `[TOKEN_INVALID / 401]\nYour DigitalOcean API token is invalid or expired.\nPlease generate a new personal access token in DigitalOcean Control Panel with read+write permissions.`;
                            } else if (errCode === 'TOKEN_SCOPE_MISSING' || rawErr.includes('403') || rawErr.includes('Forbidden') || rawErr.includes('scope')) {
                                displayMsg = `[TOKEN_SCOPE_MISSING / 403]\nYour DigitalOcean API token lacks required scopes.\nPlease ensure the token includes all required operations:\n- Droplet: Create, Read, Delete\n- Firewall: Create, Read, Update, Delete (specifically firewall:update)\n- Tag: Create, Read, Delete (specifically tag:delete)\n- SSH Key: Create, Read, Delete\n- Account: Read\n\nDetails: ${rawErr}`;
                            } else if (errCode === 'PROVIDER_NETWORK_ERROR' || rawErr.includes('ENOTFOUND') || rawErr.includes('ECONNREFUSED') || rawErr.includes('ETIMEDOUT') || rawErr.includes('Failed to connect to local companion')) {
                                displayMsg = `[PROVIDER_NETWORK_ERROR]\nCould not establish connection to provider API or local companion.\nDetails: ${rawErr}`;
                            } else if (errCode === 'PROVIDER_CATALOG_ERROR' || rawErr.includes('unavailable') || rawErr.includes('catalog')) {
                                displayMsg = `[PROVIDER_CATALOG_ERROR]\n${rawErr}`;
                            } else if (errCode === 'PROVIDER_PRICE_UNAVAILABLE' || rawErr.includes('PRICE_UNAVAILABLE')) {
                                displayMsg = `[PROVIDER_PRICE_UNAVAILABLE]\nLive pricing could not be derived from provider catalog.\nStep B remains disabled to prevent unconfirmed charges.`;
                            } else if (errCode === 'COMPANION_VERSION_MISMATCH' || rawErr.includes('COMPANION_VERSION_MISMATCH') || rawErr.includes('HTTP_404')) {
                                displayMsg = `[COMPANION_VERSION_MISMATCH]\nRunning Privacy Relay Companion does not match the active extension.\nPlease run XPIDER_AUTO_SETUP.bat to authoritatively upgrade the companion.`;
                            } else {
                                displayMsg = `[PLAN_VERIFY_ERROR]\n${rawErr}`;
                            }

                            addLog(`❌ [PLAN_VERIFY_FAIL] ${rawErr}`, 'error');
                            alert(`Plan verification failed:\n\n${displayMsg}`);
                        }
                    });
                };
            }

            // [Blocker I Hardening] STEP B: Create Private Egress after seeing verified provider price
            if (createBtn) {
                createBtn.onclick = async () => {
                    const token = tokenInput ? tokenInput.value.trim() : '';
                    if (!token) {
                        alert('Please enter your DigitalOcean API token.');
                        if (tokenInput) tokenInput.focus();
                        return;
                    }
                    if (!verifiedPlan) {
                        alert('Please complete Step A: Verify Plan & Price first.');
                        return;
                    }
                    if (!authCheck || !authCheck.checked) {
                        alert('Please check the authorization box to confirm server creation.');
                        return;
                    }

                    createBtn.disabled = true;
                    createBtn.textContent = '⏳ Provisioning in progress...';
                    if (progressHud) progressHud.style.display = 'block';
                    renderInitialStages();

                    if (progressBar) progressBar.style.width = '12%';
                    if (progressPercent) progressPercent.textContent = '12%';
                    if (progressTitle) progressTitle.textContent = '1/8 VPS CONNECTION';

                    const tier = tierSelect ? tierSelect.value : 'ULTRA_ECONOMY';
                    const region = regionSelect ? regionSelect.value : 'nyc3';

                    let pollTimer = setInterval(() => {
                        chrome.runtime.sendMessage({ action: 'GET_PROVISION_PROGRESS' }, (pRes) => {
                            if (pRes && pRes.success && pRes.result && pRes.result.provisioning) {
                                const prov = pRes.result.provisioning;
                                if (prov.events && prov.events.length > 0) {
                                    prov.events.forEach(ev => {
                                        updateStageStatus(ev.step, ev.status);
                                        const pct = Math.round((ev.step / 8) * 100);
                                        if (progressBar) progressBar.style.width = `${pct}%`;
                                        if (progressPercent) progressPercent.textContent = `${pct}%`;
                                        if (progressTitle) progressTitle.textContent = ev.title;
                                    });
                                }
                            }
                        });
                    }, 800);

                    chrome.runtime.sendMessage({
                        action: 'PROVISION_PRIVATE_EGRESS',
                        payload: {
                            token,
                            tier,
                            region,
                            verifiedQuote: verifiedPlan,
                            extensionBuildId: (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO ? BuildProvenance.BUILD_INFO.buildId : null),
                            extensionFunctionalHead: (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO ? BuildProvenance.BUILD_INFO.implementationHead : null)
                        }
                    }, async (res) => {
                        clearInterval(pollTimer);
                        createBtn.disabled = false;
                        createBtn.textContent = `⚡ STEP B: CREATE PRIVATE EGRESS — ${verifiedPriceStr}`;

                        if (tokenInput) tokenInput.value = ''; // Discard from memory

                        // [Blocker C Hardening] Two-Layer Authoritative Privacy Gate
                        // Layer 1: Check Companion-level provisioning and loopback relay CONNECT preflight
                        if (!res || !res.success || !res.result || !res.result.success || !res.result.preflight || !res.result.preflight.ready) {
                            updateStageStatus(8, 'FAIL');
                            const err = (res && res.result && ((res.result.preflight && !res.result.preflight.ready ? `COMPANION_PREFLIGHT_FAIL: ${res.result.preflight.reason}` : res.result.reason))) || (res && res.error) || 'Companion provisioning failed';
                            addLog(`❌ [PRIVATE_EGRESS_FAIL] ${err}`, 'error');
                            if (err.includes('PRICE_QUOTE') || err.includes('PROVIDER_PRICE')) {
                                verifiedPlan = null;
                                if (stepBContainer) {
                                    stepBContainer.style.opacity = '0.5';
                                    stepBContainer.style.pointerEvents = 'none';
                                }
                                if (authCheck) {
                                    authCheck.disabled = true;
                                    authCheck.checked = false;
                                }
                                if (createBtn) createBtn.disabled = true;
                                alert(`Provisioning aborted due to price quote change:\n\n${err}\n\nPlease re-run Step A to confirm current live pricing.`);
                            } else if (err.includes('ACTIVE_NODE_EXISTS')) {
                                alert(`Provisioning blocked: An active private egress node already exists.\n\nIn single-owner mode, you must destroy the existing node before creating a new one.`);
                            } else if (err.includes('TRANSACTION_COLLISION')) {
                                alert(`Provisioning blocked: An unrecovered transaction is in progress.\n\nPlease clean up unrecovered resources using the Recovery banner.`);
                            } else if (err.includes('TOKEN_SCOPE_MISSING') || err.includes('403') || err.includes('scope')) {
                                alert(`Provisioning aborted due to missing token scopes:\n\n${err}\n\nPlease verify that your DigitalOcean token has all required scopes:\n- Droplet: Create, Read, Delete\n- Firewall: Create, Read, Update, Delete (specifically firewall:update)\n- Tag: Create, Read, Delete (specifically tag:delete)\n- SSH Key: Create, Read, Delete\n- Account: Read`);
                            } else {
                                alert(`Provisioning failed: ${err}`);
                            }
                            checkWizardRecoveryState();
                            return;
                        }

                        // Refresh relay status & node pool in extension first so PrivacyGateway recognizes new node
                        if (typeof refreshRelayNodes === 'function') refreshRelayNodes();
                        if (typeof refreshRelayStatus === 'function') refreshRelayStatus();

                        // Layer 2: Authoritative Extension Background PrivacyGateway Verification
                        addLog('🛡️ [LAYER 2] Executing authoritative Extension Background PrivacyGateway preflight...', 'info');

                        let prepResult = null;
                        try {
                            const prepResponse = await new Promise((resolve) => {
                                chrome.runtime.sendMessage({
                                    action: 'ENSURE_ENFORCED_PRIVACY_FOR_START',
                                    options: { ownerFunctionTestMode: false }
                                }, (prepRes) => {
                                    if (chrome.runtime.lastError) return resolve({ success: false, error: chrome.runtime.lastError.message });
                                    resolve(prepRes || { success: false, error: 'NO_RESPONSE_FROM_BACKGROUND' });
                                });
                            });
                            prepResult = (prepResponse && prepResponse.success && prepResponse.result) ? prepResponse.result : null;
                        } catch (prepErr) {
                            prepResult = { ready: false, failureReason: prepErr.message, reason: prepErr.message };
                        }

                        const prepReason = prepResult?.failureReason || prepResult?.reason || 'ENSURE_ENFORCED_PRIVACY_BLOCKED';
                        addLog(`🛡️ [LAYER 2] ENSURE_ENFORCED_PRIVACY_FOR_START: ready=${prepResult?.ready} mode=${prepResult?.mode || 'none'} reason=${prepReason}`, prepResult?.ready ? 'info' : 'warn');

                        if (!prepResult || !prepResult.ready) {
                            updateStageStatus(8, 'FAIL');
                            addLog(`❌ [AUTHORITATIVE_PREFLIGHT_FAIL] Layer 2 PrivacyGateway blocked start: ${prepReason}`, 'error');
                            alert(`🛑 [AUTHORITATIVE PRIVACY GATE BLOCKED]\n\nCompanion node active, but Extension PrivacyGateway blocked strict privacy.\n\nReason: ${prepReason}`);
                            checkWizardRecoveryState();
                            return;
                        }

                        let pfResult = null;
                        try {
                            const preflightResponse = await new Promise((resolve) => {
                                chrome.runtime.sendMessage({
                                    action: 'RUN_PRIVACY_PREFLIGHT',
                                    options: {}
                                }, (pfRes) => {
                                    if (chrome.runtime.lastError) return resolve({ success: false, error: chrome.runtime.lastError.message });
                                    resolve(pfRes || { success: false, error: 'NO_RESPONSE_FROM_BACKGROUND' });
                                });
                            });
                            pfResult = (preflightResponse && preflightResponse.success && preflightResponse.preflight) ? preflightResponse.preflight : null;
                        } catch (pfErr) {
                            pfResult = { ready: false, failureReason: pfErr.message, reason: pfErr.message, directFallbackBlocked: 'UNKNOWN' };
                        }

                        const pfReason = pfResult?.failureReason || pfResult?.reason || (pfResult?.directFallbackBlocked !== 'BLOCKED' ? 'DIRECT_FALLBACK_NOT_BLOCKED' : 'PREFLIGHT_NOT_READY');
                        addLog(`🛡️ [LAYER 2] RUN_PRIVACY_PREFLIGHT: ready=${pfResult?.ready} directFallbackBlocked=${pfResult?.directFallbackBlocked} egressCheck=${pfResult?.egressCheck || 'UNKNOWN'} selectedEgress=${pfResult?.selectedEgressId || 'none'} reason=${pfReason}`, pfResult?.ready ? 'info' : 'warn');

                        if (!pfResult || !pfResult.ready || pfResult.directFallbackBlocked !== 'BLOCKED') {
                            updateStageStatus(8, 'FAIL');
                            addLog(`❌ [AUTHORITATIVE_PREFLIGHT_FAIL] Layer 2 Preflight failed or direct fallback unblocked: ${pfReason} (directFallbackBlocked=${pfResult?.directFallbackBlocked}, egressCheck=${pfResult?.egressCheck || 'UNKNOWN'})`, 'error');
                            alert(`🛑 [AUTHORITATIVE PREFLIGHT BLOCKED]\n\nPrivacyGateway check failed:\nReason: ${pfReason}\nDirect Fallback Blocked: ${pfResult?.directFallbackBlocked}\nEgress Check: ${pfResult?.egressCheck || 'UNKNOWN'}\nSelected Egress: ${pfResult?.selectedEgressId || 'none'}`);
                            checkWizardRecoveryState();
                            return;
                        }

                        // BOTH Layer 1 (Companion) and Layer 2 (PrivacyGateway) PASSED!
                        for (let s = 1; s <= 8; s++) updateStageStatus(s, 'PASS');
                        if (progressBar) progressBar.style.width = '100%';
                        if (progressPercent) progressPercent.textContent = '100%';
                        if (progressTitle) progressTitle.textContent = '8/8 STRICT PRIVACY READY';

                        addLog(`🛡️ [PRIVATE_EGRESS_SUCCESS] Droplet ${res.result.dropletId} deployed at ${res.result.publicIp} ($${res.result.monthlyCostUsd}/mo) — Both Companion & Extension PrivacyGateway preflights VERIFIED READY`, 'success');
                        if (typeof updatePrivacyHud === 'function') updatePrivacyHud();

                        alert(`✅ Private Egress successfully deployed & authoritative preflight VERIFIED!\nIP: ${res.result.publicIp}\nTier: ${res.result.tier} (~$${res.result.monthlyCostUsd}/mo)\n\nBoth Companion & Extension PrivacyGateway gates verified: Strict Privacy is READY.`);
                        checkWizardRecoveryState();
                        pollLiveRelayStatus();
                        pollTelemetry();
                    });
                };
            }

            if (recoveryCleanupBtn) {
                recoveryCleanupBtn.onclick = () => {
                    const token = tokenInput ? tokenInput.value.trim() : '';
                    const tokenToUse = token || prompt('Enter DigitalOcean API token to clean up exact unrecovered resources:');
                    if (!tokenToUse) return;

                    recoveryCleanupBtn.disabled = true;
                    recoveryCleanupBtn.textContent = '⏳ Cleaning up cloud resources...';

                    chrome.runtime.sendMessage({ action: 'GET_RECOVERY_STATUS' }, (stRes) => {
                        const curRec = stRes?.recovery;
                        const payload = { token: tokenToUse };
                        if (curRec && curRec.transactionTag) payload.transactionTag = curRec.transactionTag;
                        if (curRec && curRec.dropletId) payload.dropletId = curRec.dropletId;
                        if (curRec && curRec.firewallId) payload.firewallId = curRec.firewallId;

                        // [RC3.13 Teardown Proxy Clearing] Clear proxy before recovery cleanup to prevent proxy interception
                        if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                            try { chrome.proxy.settings.clear({ scope: 'regular' }); } catch (_) {}
                        }

                        chrome.runtime.sendMessage({
                            action: 'DESTROY_PRIVATE_EGRESS',
                            payload
                        }, (res) => {
                            recoveryCleanupBtn.disabled = false;
                            recoveryCleanupBtn.textContent = '🗑️ RECOVER / CLEAN UP EXACT RESOURCES';

                            if (res && res.success && res.result && res.result.success) {
                                addLog(`🗑️ [RECOVERY_CLEANUP] Exact cloud resources cleaned up: Droplet ${res.result.destroyedDropletId || 'none'}, Firewall ${res.result.destroyedFirewallId || 'none'}`, 'success');
                                alert('Recovery cleanup succeeded! Unrecovered cloud resources were destroyed and journal reset. You may now start a clean provisioning.');
                                checkWizardRecoveryState();
                                if (typeof refreshRelayNodes === 'function') refreshRelayNodes();
                                if (typeof refreshRelayStatus === 'function') refreshRelayStatus();
                                if (typeof updatePrivacyHud === 'function') updatePrivacyHud();
                            } else {
                                const resultObj = res && (res.result || res);
                                const statusStr = (resultObj && resultObj.status) ? `[${resultObj.status}] ` : '';
                                const err = (resultObj && (resultObj.reason || (Array.isArray(resultObj.errors) && resultObj.errors.length > 0 ? resultObj.errors.join('; ') : null))) || (res && res.error) || 'Cleanup failed';
                                addLog(`❌ [RECOVERY_CLEANUP_FAIL] ${statusStr}${err}`, 'error');
                                alert(`Recovery cleanup failed: ${statusStr}${err}`);
                            }
                        });
                    });
                };
            }

            if (activeKeepBtn) {
                activeKeepBtn.onclick = () => {
                    modal.style.display = 'none';
                    modal.classList.add('hidden');
                };
            }

            if (activeDestroyBtn) {
                activeDestroyBtn.onclick = () => {
                    if (destroyBtn) {
                        destroyBtn.click();
                    }
                };
            }

            if (destroyBtn) {
                destroyBtn.onclick = () => {
                    const token = tokenInput ? tokenInput.value.trim() : '';
                    const proceed = confirm('⚠️ WARNING: This will permanently destroy your dedicated XPIDER Private Egress server and Cloud Firewall.\n\nAre you sure you want to proceed?');
                    if (!proceed) return;

                    const tokenToUse = token || prompt('Enter DigitalOcean API token to authorize teardown:');
                    if (!tokenToUse) return;

                    destroyBtn.disabled = true;
                    destroyBtn.textContent = '⏳ Destroying...';

                    // [RC3.13 Teardown Proxy Clearing] Clear proxy before teardown to prevent proxy interception
                    if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                        try { chrome.proxy.settings.clear({ scope: 'regular' }); } catch (_) {}
                    }

                    chrome.runtime.sendMessage({
                        action: 'DESTROY_PRIVATE_EGRESS',
                        payload: { token: tokenToUse }
                    }, (res) => {
                        destroyBtn.disabled = false;
                        destroyBtn.textContent = '🗑️ Destroy Private Egress';
                        if (tokenInput) tokenInput.value = '';

                        if (res && res.success && res.result && res.result.success) {
                            addLog(`🗑️ [DESTROY_EGRESS] Cleaned up ${res.result.destroyedDroplets} Droplets and ${res.result.destroyedFirewalls} Firewalls`, 'info');
                            alert(`Teardown complete: ${res.result.destroyedDroplets} Droplets and ${res.result.destroyedFirewalls} Firewalls destroyed.`);
                            if (typeof refreshRelayNodes === 'function') refreshRelayNodes();
                            if (typeof refreshRelayStatus === 'function') refreshRelayStatus();
                            if (typeof updatePrivacyHud === 'function') updatePrivacyHud();
                            checkWizardRecoveryState();
                        } else {
                            const resultObj = res && (res.result || res);
                            const statusStr = (resultObj && resultObj.status) ? `[${resultObj.status}] ` : '';
                            const err = (resultObj && (resultObj.reason || (Array.isArray(resultObj.errors) ? resultObj.errors.join('; ') : null))) || (res && res.error) || 'Teardown failed';
                            addLog(`❌ [DESTROY_EGRESS] ${statusStr}${err}`, 'error');
                            alert(`Destroy failed: ${statusStr}${err}`);
                        }
                    });
                };
            }

            const executeEgressRepair = (tokenOverride = null, onComplete = null) => {
                const token = tokenOverride || (tokenInput ? tokenInput.value.trim() : '');
                const repairBtns = [settingsRepairBtn, activeRepairBtn].filter(Boolean);

                repairBtns.forEach(b => {
                    b.disabled = true;
                    b.dataset.prevText = b.textContent;
                    b.textContent = '⏳ Repairing...';
                });

                addLog('🛠️ [REPAIR_EGRESS] Dispatching in-place remote egress repair to companion...', 'info');

                chrome.runtime.sendMessage({
                    action: 'REPAIR_EXISTING_PRIVATE_EGRESS',
                    payload: { token: token || null }
                }, (res) => {
                    const resetBtns = () => {
                        repairBtns.forEach(b => {
                            b.disabled = false;
                            if (b.dataset.prevText) b.textContent = b.dataset.prevText;
                        });
                        if (typeof onComplete === 'function') onComplete(res);
                    };

                    const repairData = res?.result || res || {};

                    // Handle REMOTE_PROVIDER_AUTH_REQUIRED
                    if (repairData.code === 'REMOTE_PROVIDER_AUTH_REQUIRED' || repairData.error === 'MISSING_API_TOKEN' || repairData.code === 'MISSING_API_TOKEN') {
                        addLog('🔑 [REPAIR_EGRESS] Provider API token required for cloud repair.', 'warn');
                        const inputToken = prompt('DigitalOcean API token required to inspect & repair droplet / cloud firewall:');
                        if (inputToken && inputToken.trim()) {
                            if (tokenInput) tokenInput.value = inputToken.trim();
                            return executeEgressRepair(inputToken.trim(), onComplete);
                        } else {
                            resetBtns();
                            alert('Repair cancelled: DigitalOcean API token was not provided.');
                            return;
                        }
                    }

                    if (res && res.success && repairData.success && (repairData.code === 'REPAIRED_READY' || repairData.verified)) {
                        addLog(`✅ [REPAIR_EGRESS] Remote Private Egress repaired & verified ready! (IP: ${repairData.publicIp || 'active'})`, 'success');
                        alert(`✅ Private Egress Repaired Successfully!\n\nNode: ${repairData.publicIp || 'Active'}\nFirewall updated to current IP\nCanary probe passed.`);
                        resetBtns();
                        if (typeof checkWizardRecoveryState === 'function') checkWizardRecoveryState();
                        if (typeof refreshRelayNodes === 'function') refreshRelayNodes();
                        if (typeof refreshRelayStatus === 'function') refreshRelayStatus();
                        if (typeof updatePrivacyHud === 'function') updatePrivacyHud();
                    } else {
                        const errMsg = repairData.reason || repairData.code || res?.error || 'Repair failed';
                        addLog(`❌ [REPAIR_EGRESS_FAIL] ${errMsg}`, 'error');
                        resetBtns();
                        alert(`Remote Egress Repair Failed:\n\n${errMsg}\n\nCode: ${repairData.code || 'UNKNOWN'}`);
                    }
                });
            };

            if (settingsRepairBtn) {
                settingsRepairBtn.onclick = () => executeEgressRepair();
            }

            if (activeRepairBtn) {
                activeRepairBtn.onclick = () => executeEgressRepair();
            }

            // Initial telemetry & live relay status poll
            pollTelemetry();
            startLiveRelayPolling();
            window.addEventListener('unload', stopLiveRelayPolling);
        };
        initPrivateEgressWizard();

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
                        addLog('✅ [Privacy Gateway] External VPN observed active (Monitor Only). Strict mode requires Privacy Relay or Managed Proxy.', 'info');
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
                    vpnVerifyBtn.textContent = 'Verify External VPN (Monitor Only)';
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
                    chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (stRes) => {
                        if (stRes && stRes.result && stRes.result.status && typeof updateRelayStatusUI === 'function') {
                            updateRelayStatusUI(stRes.result.status);
                        }
                    });
                    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                        window.checkAndRefreshPrivacyReadinessHUD();
                    }
                } catch (_) {}
                finally {
                    preflightBtn.disabled = false;
                    preflightBtn.textContent = '🔍 Run Privacy Preflight';
                    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                        window.checkAndRefreshPrivacyReadinessHUD();
                    }
                }

            });
        }

        const physGateToggle = document.getElementById('physical-gate-toggle');
        if (physGateToggle) {
            if (privCfg && privCfg.physicalGateEnabled !== undefined) {
                physGateToggle.checked = Boolean(privCfg.physicalGateEnabled);
            }
            physGateToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                chrome.runtime.sendMessage({ action: 'SET_PHYSICAL_GATE_ENABLED', enabled }, (res) => {
                    if (res && res.result && res.result.status) {
                        _updatePhysicalGateUI(res.result.status);
                    }
                });
            });
        }

        const physVerifyBtn = document.getElementById('phys-gate-verify-btn');
        if (physVerifyBtn) {
            physVerifyBtn.addEventListener('click', async () => {
                physVerifyBtn.disabled = true;
                physVerifyBtn.textContent = '⏳ Verifying...';
                try {
                    const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'VERIFY_PHYSICAL_GATE' }, r));
                    if (res && res.result && res.result.status) {
                        _updatePhysicalGateUI(res.result.status);
                    }
                } catch (_) {}
                finally {
                    physVerifyBtn.disabled = false;
                    physVerifyBtn.textContent = '✓ Re-Verify Gate';
                }
            });
        }

        const physPairBtn = document.getElementById('phys-gate-pair-btn');
        if (physPairBtn) {
            physPairBtn.addEventListener('click', async () => {
                const ip = prompt('Enter GL.iNet Opal IP address:', '192.168.8.1');
                if (!ip) return;
                const transport = prompt('Enter pairing transport ("ssh" or "http"):', 'ssh') || 'ssh';
                const sshPortStr = prompt('Enter SSH port (1-65535):', '22') || '22';
                const sshUser = prompt('Enter SSH username:', 'root') || 'root';
                const token = prompt('Enter optional Router Attestation Token (leave empty if unconfigured):', '') || null;
                physPairBtn.disabled = true;
                physPairBtn.textContent = '⏳ Pairing...';
                try {
                    const res = await new Promise(r => chrome.runtime.sendMessage({
                        action: 'PAIR_PHYSICAL_ROUTER',
                        data: {
                            routerIp: ip.trim(),
                            transport: transport.trim(),
                            sshPort: parseInt(sshPortStr, 10) || 22,
                            sshUser: sshUser.trim(),
                            agentToken: token
                        }
                    }, r));
                    if (res && res.result && res.result.status) {
                        _updatePhysicalGateUI(res.result.status);
                    }
                    if (res && res.result && res.result.success) {
                        alert('✅ Opal Router successfully paired and verified!');
                    } else {
                        const reason = (res && res.result && res.result.attestation && res.result.attestation.reason) || (res && res.error) || 'Pairing verification failed';
                        alert('❌ Pairing failed: ' + reason);
                    }
                } catch (err) {
                    alert('❌ Pairing error: ' + err.message);
                }
                finally {
                    physPairBtn.disabled = false;
                    physPairBtn.textContent = 'Pair Opal';
                }
            });
        }

        const physKeyBtn = document.getElementById('phys-gate-key-btn');
        if (physKeyBtn) {
            physKeyBtn.addEventListener('click', async () => {
                physKeyBtn.disabled = true;
                physKeyBtn.textContent = '⏳ Key...';
                try {
                    let keyRes = await new Promise(r => chrome.runtime.sendMessage({ action: 'GET_PHYSICAL_ROUTER_PUBLIC_KEY' }, r));
                    if (!keyRes || !keyRes.result || !keyRes.result.success || !keyRes.result.publicKey) {
                        keyRes = await new Promise(r => chrome.runtime.sendMessage({ action: 'GENERATE_PHYSICAL_ROUTER_KEY', algorithm: 'ed25519' }, r));
                    }
                    if (keyRes && keyRes.result && keyRes.result.publicKey) {
                        const cmd = keyRes.result.installCommand || `echo "${keyRes.result.publicKey}" >> /etc/dropbear/authorized_keys`;
                        prompt('Copy this one-line command and run on your GL.iNet Opal terminal:', cmd);
                    } else {
                        alert('❌ Failed to retrieve or generate SSH key: ' + ((keyRes && keyRes.error) || 'UNKNOWN'));
                    }
                } catch (err) {
                    alert('❌ Key error: ' + err.message);
                } finally {
                    physKeyBtn.disabled = false;
                    physKeyBtn.textContent = 'SSH Key';
                }
            });
        }

        const physEnrollBtn = document.getElementById('phys-gate-enroll-btn');
        if (physEnrollBtn) {
            physEnrollBtn.addEventListener('click', async () => {
                const group = prompt('Enter Egress Identity Group (e.g. VPS-PRIMARY-1):', 'VPS-PRIMARY-1');
                if (!group) return;
                const binding = prompt('Enter Transport Binding (OPAL_WG or OPAL_OVPN):', 'OPAL_WG') || 'OPAL_WG';
                physEnrollBtn.disabled = true;
                physEnrollBtn.textContent = '⏳ Enrolling...';
                try {
                    const res = await new Promise(r => chrome.runtime.sendMessage({
                        action: 'ENROLL_PHYSICAL_EGRESS',
                        data: {
                            egressIdentityGroup: group.trim(),
                            transportBinding: binding.trim()
                        }
                    }, r));
                    if (res && res.result && res.result.success) {
                        alert(`✅ Fixed Egress Enrolled! Pinned FP: sha256:${res.result.pinnedFingerprint} (Group: ${res.result.egressIdentityGroup})`);
                        chrome.runtime.sendMessage({ action: 'QUERY_PHYSICAL_GATE' }, (pgRes) => {
                            if (pgRes && pgRes.result && pgRes.result.status) {
                                _updatePhysicalGateUI(pgRes.result.status);
                            }
                        });
                    } else {
                        const reason = (res && res.result && res.result.reason) || (res && res.error) || 'Enrollment failed';
                        alert('❌ Enrollment failed: ' + reason);
                    }
                } catch (err) {
                    alert('❌ Enrollment error: ' + err.message);
                } finally {
                    physEnrollBtn.disabled = false;
                    physEnrollBtn.textContent = 'Enroll Egress';
                }
            });
        }

        const physResetTrustBtn = document.getElementById('phys-gate-reset-trust-btn');
        if (physResetTrustBtn) {
            physResetTrustBtn.addEventListener('click', async () => {
                if (typeof campaignActive !== 'undefined' && campaignActive) {
                    alert('⚠️ Cannot reset egress trust during an active campaign or submit side effect. Please pause or stop the campaign first.');
                    return;
                }
                const confirm1 = confirm("This will pause XPIDER and invalidate all enrolled physical egress nodes. Are you sure?");
                if (!confirm1) return;

                const confirm2 = prompt('Type "RESET" to confirm destructive trust reset:');
                if (confirm2 !== 'RESET') {
                    alert('Reset cancelled. You must type "RESET" to confirm.');
                    return;
                }

                physResetTrustBtn.disabled = true;
                physResetTrustBtn.textContent = '⏳ Resetting...';
                try {
                    const res = await new Promise(r => chrome.runtime.sendMessage({
                        action: 'RESET_PHYSICAL_EGRESS_TRUST'
                    }, r));

                    if (res && res.result && res.result.success) {
                        alert('✅ Physical egress trust anchor successfully reset.');
                        chrome.runtime.sendMessage({ action: 'QUERY_PHYSICAL_GATE' }, (pgRes) => {
                            if (pgRes && pgRes.result && pgRes.result.status) {
                                _updatePhysicalGateUI(pgRes.result.status);
                            }
                        });
                        chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (pollRes) => {
                            if (pollRes && pollRes.success && pollRes.result && pollRes.result.status) {
                                if (typeof updateRelayStatusUI === 'function') updateRelayStatusUI(pollRes.result.status);
                            }
                        });
                        if (typeof refreshRelayNodes === 'function') refreshRelayNodes();
                    } else {
                        const reason = (res && res.result && res.result.reason) || (res && res.error) || 'Reset failed';
                        alert('❌ Reset failed: ' + reason);
                    }
                } catch (err) {
                    alert('❌ Reset error: ' + err.message);
                } finally {
                    physResetTrustBtn.disabled = false;
                    physResetTrustBtn.textContent = 'Reset Egress Trust';
                }
            });
        }

        chrome.runtime.sendMessage({ action: 'QUERY_PHYSICAL_GATE' }, (res) => {
            if (res && res.result && res.result.status) {
                _updatePhysicalGateUI(res.result.status);
            }
        });

        chrome.runtime.sendMessage({ action: 'GET_PRIVACY_CONFIG' }, (res) => {
            if (res && res.lastPreflight) {
                _updatePrivacyCardUI(res.lastPreflight);
            }
            // [Issue #6 Comment #6461672411] Safe automatic preflight reconciliation on startup
            if (typeof reconcilePrivacyReadiness === 'function') {
                reconcilePrivacyReadiness({ reason: 'POPUP_INIT' });
            }
        });
    } catch (_) {}

    return true;
}

function _updatePhysicalGateUI(gateState) {
    if (!gateState) return;
    const elToggle = document.getElementById('physical-gate-toggle');
    const elReady = document.getElementById('phys-gate-ready');
    const elRouter = document.getElementById('phys-router-id');
    const elOpal = document.getElementById('phys-opal-path');
    const elVpn = document.getElementById('phys-vpn-tunnel');
    const elKill = document.getElementById('phys-kill-switch');
    const elProxy = document.getElementById('phys-private-proxy');
    const elEgress = document.getElementById('phys-egress-fp');
    const elBypass = document.getElementById('phys-bypass-blocked');
    const elReasons = document.getElementById('phys-gate-reasons');

    if (elToggle && typeof gateState.enabled === 'boolean') {
        elToggle.checked = gateState.enabled;
    }

    if (elReady) {
        if (!gateState.enabled) {
            elReady.textContent = 'DISABLED';
            elReady.style.color = '#94a3b8';
        } else if (gateState.ready) {
            elReady.textContent = 'READY (ENFORCED)';
            elReady.style.color = '#4ade80';
        } else {
            elReady.textContent = 'BLOCKED (FAIL-CLOSED)';
            elReady.style.color = '#ef4444';
        }
    }

    if (elRouter) {
        elRouter.textContent = gateState.routerIdentityPass ? 'PASS (VERIFIED)' : 'FAIL';
        elRouter.style.color = gateState.routerIdentityPass ? '#4ade80' : '#ef4444';
    }
    if (elOpal) {
        elOpal.textContent = gateState.opalPathPass ? 'PASS (DEFAULT GW)' : 'FAIL';
        elOpal.style.color = gateState.opalPathPass ? '#4ade80' : '#ef4444';
    }
    if (elVpn) {
        elVpn.textContent = gateState.tunnelPass ? `UP (${gateState.vpnProtocol || 'VPN'})` : 'DOWN';
        elVpn.style.color = gateState.tunnelPass ? '#4ade80' : '#ef4444';
    }
    if (elKill) {
        elKill.textContent = gateState.killSwitchPass ? 'ENFORCED' : 'NOT ENFORCED';
        elKill.style.color = gateState.killSwitchPass ? '#4ade80' : '#ef4444';
    }
    if (elProxy) {
        elProxy.textContent = gateState.privateProxyPass ? 'PASS (PRIVATE RFC1918)' : 'FAIL';
        elProxy.style.color = gateState.privateProxyPass ? '#4ade80' : '#ef4444';
    }
    const elTransportBind = document.getElementById('phys-transport-bind');
    if (elTransportBind) {
        elTransportBind.textContent = gateState.transportBinding || 'NONE';
        elTransportBind.style.color = gateState.transportBindingPass ? '#4ade80' : (gateState.transportBinding ? '#ef4444' : '#94a3b8');
    }
    const elIdentityGroup = document.getElementById('phys-identity-group');
    if (elIdentityGroup) {
        const groupVal = gateState.egressIdentityGroup || gateState.pinnedEgressIdentityGroup || 'NONE';
        elIdentityGroup.textContent = groupVal;
        elIdentityGroup.style.color = (groupVal !== 'NONE') ? '#38bdf8' : '#94a3b8';
    }
    if (elEgress) {
        if (!gateState.expectedEgressFingerprint && !gateState.pinnedEgressFingerprint) {
            elEgress.textContent = 'UNVERIFIED';
            elEgress.style.color = '#94a3b8';
        } else if (gateState.egressFingerprintPass) {
            elEgress.textContent = gateState.observedEgressFingerprint || 'PASS';
            elEgress.style.color = '#4ade80';
        } else {
            elEgress.textContent = 'FAIL';
            elEgress.style.color = '#ef4444';
        }
    }
    if (elBypass) {
        elBypass.textContent = gateState.directBypassBlocked ? 'BLOCKED' : 'LEAK_DETECTED';
        elBypass.style.color = gateState.directBypassBlocked ? '#4ade80' : '#ef4444';
    }
    if (elReasons) {
        const reasons = (gateState.reasons && gateState.reasons.length > 0) ? gateState.reasons.join(', ') : 'NONE';
        elReasons.textContent = reasons;
        elReasons.style.color = (reasons === 'NONE' || gateState.ready) ? '#4ade80' : '#ef4444';
    }
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

    const isProvisional = Boolean(pf.provisional || pf.verifying);

    if (elTr) {
        if (isProvisional) {
            elTr.textContent = 'VERIFYING READINESS...';
            elTr.style.color = '#38bdf8';
        } else {
            elTr.textContent = transportLabel;
            elTr.style.color = transportColor;
        }
    }

    if (elEn) {
        if (isProvisional) {
            elEn.textContent = 'VERIFYING...';
            elEn.style.color = '#38bdf8';
        } else if (pf.ready) {
            elEn.textContent = 'ON (READY)';
            elEn.style.color = '#4ade80';
        } else if (mode === 'EXTERNAL_VPN_MONITOR' || mode === 'SYSTEM_VPN') {
            elEn.textContent = pf.failClosed ? 'BLOCKED — TRANSPORT NOT ENFORCED' : 'MONITORED ONLY';
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
        const isPass = pf.dnsPrivacy === 'PASS' || pf.dnsPrivacy === 'VERIFIED_REMOTE_PROXY_CONNECT';
        elDn.textContent = isPass ? 'PASS' : (pf.dnsPrivacy || 'UNKNOWN');
        elDn.style.color = isPass ? '#4ade80' : '#94a3b8';
        elDn.title = isPass ? 'Remote proxy CONNECT verified: 0 local OS DNS lookups' : (pf.dnsPrivacyDetail || 'Awaiting live probe');
    }
    if (elIp) {
        const isProtected = pf.ipv6Protection === 'PROTECTED' || pf.ipv6Protection === 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED' || pf.ipv6Protection === 'IPV6_ROUTE_ACTIVE_BLOCKED_AT_PROXY';
        elIp.textContent = isProtected ? 'PROTECTED' : (pf.ipv6Protection || 'UNKNOWN');
        elIp.style.color = isProtected ? '#4ade80' : '#94a3b8';
        elIp.title = isProtected ? 'Direct IPv6 unreachable; IPv6 literals blocked at proxy fail-closed' : (pf.ipv6ProtectionDetail || 'Awaiting live probe');
    }
    if (elLc) elLc.textContent = pf.lastCheck ? new Date(pf.lastCheck).toLocaleTimeString() : 'Never';

    // [Fix 1 Start Button Helper Text]
    const startHelper = document.getElementById('start-btn-helper-text');
    if (startHelper) {
        const isMonitorOnly = (mode === 'EXTERNAL_VPN_MONITOR' || mode === 'SYSTEM_VPN');
        if (pf.failClosed && isMonitorOnly) {
            startHelper.style.display = 'block';
        } else {
            startHelper.style.display = 'none';
        }
    }

    // [Issue #6 Comment #6273652325 EE1/FF3] Keep main campaign readiness HUD in sync with authoritative privacy state
    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
        window.checkAndRefreshPrivacyReadinessHUD();
    }
}

// [Issue #6 Comment #6461672411] Bounded fail-closed automatic PRIVACY_RELAY preflight & readiness reconciliation
let _isPrivacyReconciling = false;
let _lastPrivacyReconciliationTs = 0;

async function reconcilePrivacyReadiness(options = {}) {
    const force = Boolean(options.force);
    const reason = options.reason || 'AUTO';
    const now = Date.now();

    if (_isPrivacyReconciling) {
        console.log(`[PRIVACY_RECONCILE] skipped: already in progress (reason=${reason})`);
        return;
    }

    if (!force && (now - _lastPrivacyReconciliationTs < 4000)) {
        console.log(`[PRIVACY_RECONCILE] skipped: cooldown active (reason=${reason})`);
        return;
    }

    _isPrivacyReconciling = true;
    _lastPrivacyReconciliationTs = now;

    try {
        const privData = await chrome.storage.local.get(['xpider_privacy_config', 'xpider_strict_privacy']);
        const privCfg = privData.xpider_privacy_config || {};
        const isStrict = privData.xpider_strict_privacy !== undefined ? privData.xpider_strict_privacy : (privCfg.failClosed !== false);
        const transportMode = privCfg.transportMode || 'PRIVACY_RELAY';

        if (privCfg.enabled === false || !isStrict) {
            if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                window.checkAndRefreshPrivacyReadinessHUD();
            }
            return;
        }

        if (transportMode === 'PRIVACY_RELAY') {
            console.log(`[PRIVACY_RECONCILE] starting bounded preflight (reason=${reason}, force=${force})`);

            const preflightRes = await Promise.race([
                new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: 'RUN_PRIVACY_PREFLIGHT',
                        options: { autoStart: false }
                    }, (res) => {
                        if (chrome.runtime.lastError) {
                            return resolve({ success: false, error: chrome.runtime.lastError.message });
                        }
                        resolve(res || { success: false, error: 'NO_RESPONSE' });
                    });
                }),
                new Promise((resolve) => setTimeout(() => resolve({ success: false, error: 'PREFLIGHT_TIMEOUT' }), 4000))
            ]);

            if (preflightRes && preflightRes.success && preflightRes.preflight) {
                console.log(`[PRIVACY_RECONCILE] preflight success: ready=${preflightRes.preflight.ready}`);
                _updatePrivacyCardUI(preflightRes.preflight);
            } else {
                const failReason = (preflightRes && preflightRes.preflight && preflightRes.preflight.failureReason) ||
                                   (preflightRes && preflightRes.error) || 'RELAY_NOT_READY';
                console.warn(`[PRIVACY_RECONCILE] preflight failed/blocked: reason=${failReason}`);
                if (preflightRes && preflightRes.preflight) {
                    _updatePrivacyCardUI(preflightRes.preflight);
                } else {
                    _updatePrivacyCardUI({
                        ready: false,
                        mode: 'PRIVACY_RELAY',
                        failClosed: true,
                        webrtcGuard: 'PASS',
                        directFallbackBlocked: 'BLOCKED',
                        egressCheck: 'FAIL',
                        lastCheck: new Date().toISOString(),
                        failureReason: failReason
                    });
                }
            }

            if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                window.checkAndRefreshPrivacyReadinessHUD();
            }
        }
    } catch (err) {
        console.warn('[PRIVACY_RECONCILE_ERROR]', err);
    } finally {
        _isPrivacyReconciling = false;
    }
}
window.reconcilePrivacyReadiness = reconcilePrivacyReadiness;



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

                try {
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
                            countDisplay.textContent = `${campaignQueue.length} (remaining) / ${totalTargets} URLs`;
                        }
                    } else if (Array.isArray(st.xpider_queue) && st.xpider_queue.length > 0) {
                        campaignQueue = [...st.xpider_queue];
                        if (!totalTargets) totalTargets = st.xpider_total || campaignQueue.length;
                        if (!successCount) successCount = st.xpider_success || 0;
                        renderUrlsPreview(campaignQueue);
                        const countDisplay = document.getElementById('url-count-display');
                        if (countDisplay && !response.isActive) {
                            countDisplay.textContent = `${campaignQueue.length} (remaining) / ${totalTargets} URLs`;
                        }
                    }
                } catch (_) {}

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
                        skippedCount: c.skipped,
                        timeoutCount: c.timeout,
                        deliveryUnknownCount: c.deliveryUnknown,
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
                        skippedCount: c.skipped,
                        timeoutCount: c.timeout,
                        deliveryUnknownCount: c.deliveryUnknown,
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

    // [Y2] Purge stale dynamic modals on boot before any layout/binding
    purgeStaleDynamicModals();

    // [Y3] Enforce static overlay fail-safe (pointer-events: none, display: none when hidden)
    sanitizeAllStaticOverlays();

    // [R6.9G.1-1/2 & RC3.21] Owner CAPTCHA Decision Modal with exact attempt-bound identity
    function renderCaptchaDecisionModal(request) {
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
    }

    try {
        // 0. Synchronous messaging listeners
        try {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (!request) return;
                if (request.action === 'SENDER_LOG') {
                    addLog(request.message, request.logType);
                } else if (request.action === 'PAUSED_NETWORK_RECOVERY') {
                    window.isNetworkRecovery = true;
                    window.networkRecoveryPhase = request.phase || 'CHECKPOINTED';
                    const statusDetail = document.getElementById('status-detail');
                    if (statusDetail) {
                        statusDetail.textContent = `🔄 NETWORK RECOVERY (${request.phase || 'RECONNECTING'})...`;
                        statusDetail.style.color = '#38bdf8';
                    }
                } else if (request.action === 'NETWORK_RECOVERY_COMPLETED') {
                    window.isNetworkRecovery = false;
                    window.networkRecoveryPhase = null;
                    refreshStatusDetailUI();
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
                            skippedCount: request.counters.skipped,
                            timeoutCount: request.counters.timeout,
                            deliveryUnknownCount: request.counters.deliveryUnknown,
                            failureBreakdown: request.counters.failureBreakdown
                        });
                    }
                    updateProgress(100);
                    const statusTitle = document.getElementById('status-title');
                    if (statusTitle) statusTitle.textContent = "Live Progress (Finished)";
                    const statusDetail = document.getElementById('status-detail');
                    if (statusDetail) statusDetail.textContent = "Campaign Complete: All targets finished.";
                    restoreStartButton();
                    const ind = document.getElementById('privacy-override-indicator');
                    if (ind) {
                        ind.style.display = 'none';
                        ind.classList.add('hidden');
                    }
                    try { onCampaignFinishedOwnerTestCheck(request.counters); } catch (_) {}
                    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                        window.checkAndRefreshPrivacyReadinessHUD();
                    }
                } else if (request.action === 'OWNER_TEST_PRECONDITION_FAILED_ALL_FILTERED') {
                    if (typeof _restoreStartButton === 'function') _restoreStartButton();
                    updateAutoSetupUI('READY');
                    showAutoSetupFeedback(
                        `🛑 TEST NOT RUN — 0 OF 7 EXECUTED\n` +
                        `All targets were filtered out (history or suppression). Click '✨ AUTO SETUP' to re-arm test fixtures.`,
                        'error'
                    );
                    addLog('🛑 [OWNER_TEST_PRECONDITION_FAILED_ALL_FILTERED] All targets filtered out. Test not executed.', 'error');
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
                            vpnBadge.textContent = 'VPN OBSERVED: NOT CONFIRMED (MONITOR ONLY)';
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
                    // [RC3.21 Remediation] Defer CAPTCHA modal if manual assist modal is active
                    if (document.getElementById('xpider-manual-assist-modal')) {
                        console.log('[DECISION_SURFACE_SERIALIZED] Manual assist modal active. Deferring CAPTCHA modal until manual assist resolved.');
                        window.__xpider_pending_captcha_modal = request;
                        return;
                    }
                    renderCaptchaDecisionModal(request);

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
                    // [R6.9G.8 Directive 2 & RC3.21] Sticky Owner-Gated Manual Form Assist Modal
                    // Single exclusive decision surface: if CAPTCHA modal is open, stash and remove it
                    const _existingCaptchaModal = document.getElementById('xpider-captcha-decision-modal');
                    if (_existingCaptchaModal) {
                        console.log('[DECISION_SURFACE_SERIALIZED] Manual assist requested while CAPTCHA modal open. Prioritizing manual assist.');
                        _existingCaptchaModal.remove();
                    }
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
                                    // [RC3.21 Remediation] Single exclusive decision surface: render deferred CAPTCHA modal if pending
                                    if (window.__xpider_pending_captcha_modal) {
                                        const pending = window.__xpider_pending_captcha_modal;
                                        window.__xpider_pending_captcha_modal = null;
                                        if (pending.attemptId === _attemptId && (decision === 'retry' || decision === 'manual_fill')) {
                                            console.log('[DECISION_SURFACE_SERIALIZED] Rendering deferred CAPTCHA modal after manual assist resolution.');
                                            renderCaptchaDecisionModal(pending);
                                        }
                                    }
                                }, 800);
                            }
                        });
                    }

                    document.getElementById('manual-action-retry-btn')?.addEventListener('click', () => _sendManualDecision('retry'));
                    document.getElementById('manual-action-wait-btn')?.addEventListener('click', () => _sendManualDecision('manual_fill'));
                    document.getElementById('manual-action-confirmed-btn')?.addEventListener('click', () => _sendManualDecision('submitted_manually'));
                    document.getElementById('manual-action-skip-btn')?.addEventListener('click', () => _sendManualDecision('skip'));

                } else if (request.action === 'CLOSE_ALL_MODALS') {
                    window.__xpider_pending_captcha_modal = null;
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

        // [Y1] Side-Panel Click-Interception Diagnostic probe
        try {
            checkClickInterceptionDiagnostic();
        } catch (e) {
            console.warn('[POPUP_BOOT] checkClickInterceptionDiagnostic error:', e);
        }

        window.__xpider_boot.ready = true;
        console.log('[POPUP_BOOT] ready=true');
    } catch (fatalBootErr) {
        window.__xpider_boot.ready = false;
        console.error(`[POPUP_BOOT_FATAL] error=${fatalBootErr.message} stack=${fatalBootErr.stack || 'none'}`);
        displayControlPlaneError('POPUP_BOOT_FATAL', fatalBootErr.message);
    }
});

if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
        try { checkClickInterceptionDiagnostic(); } catch (_) {}
    });
    window.addEventListener('resize', () => {
        try { checkClickInterceptionDiagnostic(); } catch (_) {}
    });
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
    if (data.timeoutCount !== undefined) {
        timeoutCount = data.timeoutCount;
    } else if (data.counters && data.counters.timeout !== undefined) {
        timeoutCount = data.counters.timeout;
    }
    const timeoutDisplay = document.getElementById('timeout-count-display');
    if (timeoutDisplay) timeoutDisplay.textContent = timeoutCount;

    // 4. Delivery Unknown Count
    if (data.deliveryUnknownCount !== undefined) {
        deliveryUnknownCount = data.deliveryUnknownCount;
    } else if (data.counters && data.counters.deliveryUnknown !== undefined) {
        deliveryUnknownCount = data.counters.deliveryUnknown;
    } else if (data.unknownCount !== undefined) {
        deliveryUnknownCount = data.unknownCount;
    }
    const unknownDisplay = document.getElementById('unknown-count-display');
    if (unknownDisplay) unknownDisplay.textContent = deliveryUnknownCount;

    // 5. Skipped Count
    if (data.skippedCount !== undefined) {
        skippedCount = data.skippedCount;
    } else if (data.counters && data.counters.skipped !== undefined) {
        skippedCount = data.counters.skipped;
    }
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
        completedCount = Math.max(completedCount, successCount + failedCount + timeoutCount + deliveryUnknownCount + skippedCount);
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

    // [R6.9G.10.3.7.1.4.9] Authoritative Controlled CAPTCHA Lab Metrics Panel Hydration
    if (data.captchaLabMetrics || data.captchaLedger) {
        updateCaptchaLabPanel(data.captchaLabMetrics, data.captchaLedger);
    }

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

    if (typeof _renderHistoryPanel === 'function') {
        _renderHistoryPanel();
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
    let statusText = `${remainingTargets} ${suffix}`;
    if (window.isNetworkRecovery) {
        statusText = `🔄 NETWORK RECOVERY (${window.networkRecoveryPhase || 'PAUSED'}) (${remainingTargets} ${suffix})`;
    } else if (campaignPaused) {
        statusText = `⏸️ PAUSED (${remainingTargets} ${suffix})`;
    }
    statusDetail.textContent = statusText;
    statusDetail.style.fontWeight = '700';
    statusDetail.style.fontSize = '0.85rem'; // Smaller font as requested
    statusDetail.style.color = window.isNetworkRecovery ? '#38bdf8' : (campaignPaused ? '#ff3366' : '#facc15'); 
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
    let tabsBound = false;
    let settingsBound = false;

    // 1. Tab Navigation (Isolated)
    try {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            if (!btn.dataset.bound) {
                btn.dataset.bound = 'true';
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
            }
        });
        if (tabBtns.length > 0) tabsBound = true;
    } catch (e) {
        console.error('[POPUP_BOOT] Tab navigation binding error:', e);
    }

    // 2. Settings Toggle & Close (Isolated)
    try {
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsToggle && !settingsToggle.dataset.bound) {
            settingsToggle.dataset.bound = 'true';
            settingsToggle.addEventListener('click', () => {
                console.log('[BUTTON_CLICK] id=settings-toggle');
                openModalOverlay(settingsOverlay);
            });
            settingsBound = true;
        }
        
        const settingsClose = document.getElementById('settings-close');
        if (settingsClose && !settingsClose.dataset.bound) {
            settingsClose.dataset.bound = 'true';
            settingsClose.addEventListener('click', () => {
                closeModalOverlay(settingsOverlay);
            });
        }
        
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn && !saveSettingsBtn.dataset.bound) {
            saveSettingsBtn.dataset.bound = 'true';
            saveSettingsBtn.addEventListener('click', saveSettings);
        }
    } catch (e) {
        console.error('[POPUP_BOOT] Settings binding error:', e);
    }

    // 3. Campaign Action Buttons (Isolated)
    try {
        const startBtn = document.getElementById('start-btn');
        if (startBtn && !startBtn.dataset.bound) {
            startBtn.dataset.bound = 'true';
            startBtn.addEventListener('click', () => {
                console.log('[BUTTON_CLICK] id=start-btn mode=AUTO');
                launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'AUTO' }).catch(err => {
                    console.error('[START_EXCEPTION]', err);
                });
            });
        }
        const startManualBtn = document.getElementById('start-manual-btn');
        if (startManualBtn && !startManualBtn.dataset.bound) {
            startManualBtn.dataset.bound = 'true';
            startManualBtn.addEventListener('click', () => {
                console.log('[BUTTON_CLICK] id=start-manual-btn mode=MANUAL');
                launchCampaign({ source: 'USER_START_BUTTON', campaignMode: 'MANUAL' }).catch(err => {
                    console.error('[START_EXCEPTION]', err);
                });
            });
        }
        
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn && !pauseBtn.dataset.bound) {
            pauseBtn.dataset.bound = 'true';
            pauseBtn.addEventListener('click', togglePause);
        }
        
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn && !stopBtn.dataset.bound) {
            stopBtn.dataset.bound = 'true';
            stopBtn.addEventListener('click', stopCampaign);
        }

        const stopSaveBtn = document.getElementById('stop-save-btn');
        if (stopSaveBtn && !stopSaveBtn.dataset.bound) {
            stopSaveBtn.dataset.bound = 'true';
            stopSaveBtn.addEventListener('click', stopAndSaveCampaign);
        }

        const endCampaignBtn = document.getElementById('end-campaign-btn');
        if (endCampaignBtn && !endCampaignBtn.dataset.bound) {
            endCampaignBtn.dataset.bound = 'true';
            endCampaignBtn.addEventListener('click', endCampaign);
        }

        const resumeBtn = document.getElementById('resume-campaign-btn');
        if (resumeBtn && !resumeBtn.dataset.bound) {
            resumeBtn.dataset.bound = 'true';
            resumeBtn.addEventListener('click', resumeCampaign);
        }

        const discardBtn = document.getElementById('discard-checkpoint-btn');
        if (discardBtn && !discardBtn.dataset.bound) {
            discardBtn.dataset.bound = 'true';
            discardBtn.addEventListener('click', discardCheckpoint);
        }
    } catch (e) {
        console.error('[POPUP_BOOT] Campaign buttons binding error:', e);
    }

    // 4. File Upload (Isolated)
    try {
        const fileInput = document.getElementById('file-input');
        if (fileInput && !fileInput.dataset.bound) {
            fileInput.dataset.bound = 'true';
            fileInput.addEventListener('change', handleFileUpload);
        }

        const dropArea = document.getElementById('drop-area');
        if (dropArea && !dropArea.dataset.bound) {
            dropArea.dataset.bound = 'true';
            dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-active'); });
            dropArea.addEventListener('dragleave', () => { dropArea.classList.remove('drag-active'); });
            dropArea.addEventListener('drop', handleFileUpload);
        }

        const loadFileBtn = document.getElementById('load-tpl-file-btn');
        const tplFileInput = document.getElementById('tpl-file-input');
        if (loadFileBtn && tplFileInput && !loadFileBtn.dataset.bound) {
            loadFileBtn.dataset.bound = 'true';
            loadFileBtn.addEventListener('click', () => tplFileInput.click());
            tplFileInput.addEventListener('change', importMessageFromFile);
        }

        const closeAppBtn = document.getElementById('close-app-btn');
        if (closeAppBtn && !closeAppBtn.dataset.bound) {
            closeAppBtn.dataset.bound = 'true';
            closeAppBtn.addEventListener('click', () => window.close());
        }
    } catch (e) {
        console.error('[POPUP_BOOT] File upload binding error:', e);
    }

    // 5. Diagnostic Action Buttons (Isolated)
    try {
        const exportBundleBtn = document.getElementById('export-debug-bundle-btn');
        if (exportBundleBtn && !exportBundleBtn.dataset.bound) {
            exportBundleBtn.dataset.bound = 'true';
            exportBundleBtn.addEventListener('click', exportOwnerDebugBundle);
        }

        const copyDiagBtn = document.getElementById('copy-diagnostic-btn');
        if (copyDiagBtn && !copyDiagBtn.dataset.bound) {
            copyDiagBtn.dataset.bound = 'true';
            copyDiagBtn.addEventListener('click', copyDiagnosticReport);
        }

        const dlDiagBtn = document.getElementById('download-diagnostic-btn');
        if (dlDiagBtn && !dlDiagBtn.dataset.bound) {
            dlDiagBtn.dataset.bound = 'true';
            dlDiagBtn.addEventListener('click', downloadDiagnosticTxt);
        }

        const clearDiagBtn = document.getElementById('clear-diagnostic-btn');
        if (clearDiagBtn && !clearDiagBtn.dataset.bound) {
            clearDiagBtn.dataset.bound = 'true';
            clearDiagBtn.addEventListener('click', clearDiagnosticLog);
        }
    } catch (e) {
        console.error('[POPUP_BOOT] Diagnostic buttons binding error:', e);
    }

    // 6. FAILED Breakdown Card Toggle (Isolated)
    try {
        const failedCardBtn = document.getElementById('failed-card-btn');
        const breakdownContainer = document.getElementById('failure-breakdown-container');
        const breakdownToggle = document.getElementById('failure-breakdown-toggle');
        if (failedCardBtn && breakdownContainer && !failedCardBtn.dataset.bound) {
            failedCardBtn.dataset.bound = 'true';
            failedCardBtn.addEventListener('click', () => {
                breakdownContainer.classList.toggle('hidden');
            });
        }
        if (breakdownToggle && breakdownContainer && !breakdownToggle.dataset.bound) {
            breakdownToggle.dataset.bound = 'true';
            breakdownToggle.addEventListener('click', () => {
                breakdownContainer.classList.add('hidden');
            });
        }
    } catch (e) {
        console.error('[POPUP_BOOT] Breakdown card toggle error:', e);
    }

    // 7. Wit.ai / STT Key Setup Modal (Isolated)
    try {
        (function bindSttKeyRealTimeSync() {
            let _sttDebounceTimer = null;
            const sttKeyEl = document.getElementById('audio-stt-key');
            if (!sttKeyEl || sttKeyEl.dataset.bound) return;
            sttKeyEl.dataset.bound = 'true';
            sttKeyEl.addEventListener('input', () => {
                clearTimeout(_sttDebounceTimer);
                _sttDebounceTimer = setTimeout(() => {
                    const key = sttKeyEl.value.trim();
                    chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key }, () => {
                        console.log(`[WitKey-Sync v2] Sender 실시간 입력 동기화: keyConfigured=${!!key}`);
                    });
                }, 600);
            });
        })();

        const saveSetupSttBtn = document.getElementById('save-setup-stt-btn');
        if (saveSetupSttBtn && !saveSetupSttBtn.dataset.bound) {
            saveSetupSttBtn.dataset.bound = 'true';
            saveSetupSttBtn.addEventListener('click', async () => {
                const input = document.getElementById('setup-stt-key-input');
                const key = input ? input.value.trim() : '';
                if (key === '') {
                    alert("Please enter a valid Wit.ai Key.");
                    return;
                }
                
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
                
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'UPDATE_WIT_KEY', key }).catch(() => {});
                }
                
                const setupModal = document.getElementById('stt-setup-modal-overlay');
                if (setupModal) closeModalOverlay(setupModal);
                
                const langSelect = document.getElementById('language-select');
                const lang = langSelect ? langSelect.value : 'en';
                const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                alert(dict.msg_saved || "Saved!");
            });
        }

        const quickWitBtn = document.getElementById('quick-wit-setup-btn');
        if (quickWitBtn && !quickWitBtn.dataset.bound) {
            quickWitBtn.dataset.bound = 'true';
            quickWitBtn.addEventListener('click', () => {
                const setupModal = document.getElementById('stt-setup-modal-overlay');
                if (setupModal) openModalOverlay(setupModal);
            });
        }

        const witAiLink = document.getElementById('wit-ai-link');
        if (witAiLink && !witAiLink.dataset.bound) {
            witAiLink.dataset.bound = 'true';
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

        document.querySelectorAll('a.premium-link, a[target="_blank"]').forEach(link => {
            if (link.id === 'wit-ai-link' || link.dataset.bound) return;
            link.dataset.bound = 'true';
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
    } catch (e) {
        console.error('[POPUP_BOOT] Wit.ai setup binding error:', e);
    }

    // 8. Template & Captcha Options (Isolated)
    try {
        ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn && !btn.dataset.bound) {
                btn.dataset.bound = 'true';
                btn.addEventListener('click', saveTemplateChanges);
            }
        });

        const captchaToggle = document.getElementById('captcha-solve-toggle');
        if (captchaToggle && !captchaToggle.dataset.bound) {
            captchaToggle.dataset.bound = 'true';
            captchaToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                const methodGroup = document.getElementById('captcha-method-group');
                if (methodGroup) methodGroup.style.display = enabled ? 'block' : 'none';
                toggleCaptchaApiVisibility();
            });
        }

        const methodSelect = document.getElementById('captcha-method-select');
        if (methodSelect && !methodSelect.dataset.bound) {
            methodSelect.dataset.bound = 'true';
            methodSelect.addEventListener('change', () => {
                toggleCaptchaApiVisibility();
                const langSelect = document.getElementById('language-select');
                if (langSelect) applyTranslations(langSelect.value);
            });
        }

        const langSelect = document.getElementById('language-select');
        if (langSelect && !langSelect.dataset.bound) {
            langSelect.dataset.bound = 'true';
            langSelect.addEventListener('change', (e) => {
                applyTranslations(e.target.value);
            });
        }

        ['tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-phone', 'tpl-subject', 'tpl-message'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.dataset.bound) {
                el.dataset.bound = 'true';
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
    } catch (e) {
        console.error('[POPUP_BOOT] Template & captcha options binding error:', e);
    }

    // 9. Single URL & Template Library (Isolated)
    try {
        const addUrlBtn = document.getElementById('add-url-btn');
        if (addUrlBtn && !addUrlBtn.dataset.bound) {
            addUrlBtn.dataset.bound = 'true';
            addUrlBtn.classList.add('plus-btn-circle');
            addUrlBtn.addEventListener('click', addSingleUrl);
        }
        
        const manualUrlInput = document.getElementById('manual-url-input');
        if (manualUrlInput && !manualUrlInput.dataset.bound) {
            manualUrlInput.dataset.bound = 'true';
            manualUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addSingleUrl();
            });
        }

        const clearListBtn = document.getElementById('clear-list-btn');
        if (clearListBtn && !clearListBtn.dataset.bound) {
            clearListBtn.dataset.bound = 'true';
            clearListBtn.addEventListener('click', clearCampaignQueue);
        }

        const newTplBtn = document.getElementById('new-tpl-btn');
        if (newTplBtn && !newTplBtn.dataset.bound) {
            newTplBtn.dataset.bound = 'true';
            newTplBtn.addEventListener('click', () => handleCreateNewTemplate());
        }

        const dupTplBtn = document.getElementById('dup-tpl-btn');
        if (dupTplBtn && !dupTplBtn.dataset.bound) {
            dupTplBtn.dataset.bound = 'true';
            dupTplBtn.addEventListener('click', () => handleDuplicateTemplate());
        }

        const defTplBtn = document.getElementById('default-tpl-btn');
        if (defTplBtn && !defTplBtn.dataset.bound) {
            defTplBtn.dataset.bound = 'true';
            defTplBtn.addEventListener('click', () => handleSetDefaultTemplate());
        }

        const delTplBtn = document.getElementById('del-tpl-btn');
        if (delTplBtn && !delTplBtn.dataset.bound) {
            delTplBtn.dataset.bound = 'true';
            delTplBtn.addEventListener('click', () => {
                if (confirm("Are you sure you want to delete this template?")) {
                    handleDeleteTemplate().catch(e => alert(e.message));
                }
            });
        }

        const tplSelect = document.getElementById('tpl-library-select');
        if (tplSelect && !tplSelect.dataset.bound) {
            tplSelect.dataset.bound = 'true';
            tplSelect.addEventListener('change', loadTemplateFromLibrary);
        }
    } catch (e) {
        console.error('[POPUP_BOOT] Single URL and template library binding error:', e);
    }

    // 10. Ledger & Reset Lists Controls (Isolated)
    try {
        document.querySelectorAll('.ledger-chip').forEach(chip => {
            if (!chip.dataset.bound) {
                chip.dataset.bound = 'true';
                chip.addEventListener('click', () => {
                    document.querySelectorAll('.ledger-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    ledgerState.filter = chip.dataset.filter || 'ALL';
                    ledgerState.page = 1;
                    renderLedgerUI();
                });
            }
        });

        const ledgerSearchInput = document.getElementById('ledger-search-input');
        if (ledgerSearchInput && !ledgerSearchInput.dataset.bound) {
            ledgerSearchInput.dataset.bound = 'true';
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
        if (ledgerSelectAllCb && !ledgerSelectAllCb.dataset.bound) {
            ledgerSelectAllCb.dataset.bound = 'true';
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
        if (ledgerExportAllGSheetsBtn && !ledgerExportAllGSheetsBtn.dataset.bound) {
            ledgerExportAllGSheetsBtn.dataset.bound = 'true';
            ledgerExportAllGSheetsBtn.addEventListener('click', () => triggerGoogleSheetsCsvExport({ exportCurrentFilter: false }));
        }

        const ledgerExportFilterGSheetsBtn = document.getElementById('ledger-export-filter-gsheets-btn');
        if (ledgerExportFilterGSheetsBtn && !ledgerExportFilterGSheetsBtn.dataset.bound) {
            ledgerExportFilterGSheetsBtn.dataset.bound = 'true';
            ledgerExportFilterGSheetsBtn.addEventListener('click', () => triggerGoogleSheetsCsvExport({ exportCurrentFilter: true }));
        }

        const ledgerExportBtn = document.getElementById('ledger-export-csv-btn');
        if (ledgerExportBtn && !ledgerExportBtn.dataset.bound) {
            ledgerExportBtn.dataset.bound = 'true';
            ledgerExportBtn.addEventListener('click', () => triggerGoogleSheetsCsvExport({ exportCurrentFilter: false }));
        }

        const ledgerResetSelBtn = document.getElementById('ledger-reset-selected-btn');
        if (ledgerResetSelBtn && !ledgerResetSelBtn.dataset.bound) {
            ledgerResetSelBtn.dataset.bound = 'true';
            ledgerResetSelBtn.addEventListener('click', async () => {
                try {
                    await dispatchSelectiveReset();
                } catch (err) {
                    alert(err.message);
                }
            });
        }

        const ledgerRetryFailedBtn = document.getElementById('ledger-retry-failed-btn');
        if (ledgerRetryFailedBtn && !ledgerRetryFailedBtn.dataset.bound) {
            ledgerRetryFailedBtn.dataset.bound = 'true';
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

        if (ledgerClearBtn && resetAllModal && !ledgerClearBtn.dataset.bound) {
            ledgerClearBtn.dataset.bound = 'true';
            ledgerClearBtn.addEventListener('click', () => {
                if (campaignActive) {
                    alert("Cannot clear history while campaign is actively running!");
                    return;
                }
                openModalOverlay(resetAllModal);
            });
        }
        if (ledgerResetAllBtn && resetAllModal && !ledgerResetAllBtn.dataset.bound) {
            ledgerResetAllBtn.dataset.bound = 'true';
            ledgerResetAllBtn.addEventListener('click', () => {
                if (campaignActive) {
                    alert("Cannot clear history while campaign is actively running!");
                    return;
                }
                openModalOverlay(resetAllModal);
            });
        }
        if (cancelResetAllBtn && resetAllModal && !cancelResetAllBtn.dataset.bound) {
            cancelResetAllBtn.dataset.bound = 'true';
            cancelResetAllBtn.addEventListener('click', () => {
                closeModalOverlay(resetAllModal);
            });
        }
        if (confirmResetAllBtn && resetAllModal && !confirmResetAllBtn.dataset.bound) {
            confirmResetAllBtn.dataset.bound = 'true';
            confirmResetAllBtn.addEventListener('click', async () => {
                closeModalOverlay(resetAllModal);
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
            if (resetAllListsModal) openModalOverlay(resetAllListsModal);
        };

        if (resetAllListsBtn && !resetAllListsBtn.dataset.bound) {
            resetAllListsBtn.dataset.bound = 'true';
            resetAllListsBtn.addEventListener('click', openResetAllListsModal);
        }
        if (settingsResetAllListsBtn && !settingsResetAllListsBtn.dataset.bound) {
            settingsResetAllListsBtn.dataset.bound = 'true';
            settingsResetAllListsBtn.addEventListener('click', openResetAllListsModal);
        }
        if (cancelResetAllListsBtn && resetAllListsModal && !cancelResetAllListsBtn.dataset.bound) {
            cancelResetAllListsBtn.dataset.bound = 'true';
            cancelResetAllListsBtn.addEventListener('click', () => {
                closeModalOverlay(resetAllListsModal);
            });
        }
        if (confirmResetAllListsBtn && resetAllListsModal && !confirmResetAllListsBtn.dataset.bound) {
            confirmResetAllListsBtn.dataset.bound = 'true';
            confirmResetAllListsBtn.addEventListener('click', async () => {
                closeModalOverlay(resetAllListsModal);
                try {
                    await dispatchResetAllListData();
                } catch (err) {
                    alert(err.message);
                }
            });
        }

        const ledgerPrevBtn = document.getElementById('ledger-prev-btn');
        if (ledgerPrevBtn && !ledgerPrevBtn.dataset.bound) {
            ledgerPrevBtn.dataset.bound = 'true';
            ledgerPrevBtn.addEventListener('click', () => {
                if (ledgerState.page > 1) {
                    ledgerState.page--;
                    renderLedgerUI();
                }
            });
        }

        const ledgerNextBtn = document.getElementById('ledger-next-btn');
        if (ledgerNextBtn && !ledgerNextBtn.dataset.bound) {
            ledgerNextBtn.dataset.bound = 'true';
            ledgerNextBtn.addEventListener('click', () => {
                ledgerState.page++;
                renderLedgerUI();
            });
        }
    } catch (e) {
        console.error('[POPUP_BOOT] Ledger & reset lists binding error:', e);
    }

    // 11. Navigation Verification & State Tracking
    window.__xpider_boot.tabsBound = tabsBound;
    window.__xpider_boot.settingsBound = settingsBound;
    console.log(`[POPUP_BOOT] tabsBound=${tabsBound} settingsBound=${settingsBound}`);

    if (!tabsBound) {
        displayControlPlaneError('TABS_NOT_BOUND', 'No .tab-btn elements successfully bound');
    }
    if (!settingsBound) {
        displayControlPlaneError('SETTINGS_NOT_BOUND', '#settings-toggle not successfully bound');
    }

    // 12. Auxiliary initializers
    try { bindEmailCollectorEvents(); } catch (_) {}
    try { initBuildProvenanceBadge(); } catch (_) {}
    try { initOwnerAutoSetup(); } catch (err) { console.warn('[INIT_OWNER_AUTO_SETUP_ERR]', err); }
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
        : null;

    if (!localInfo) {
        console.warn('[BUILD_HANDSHAKE] BuildProvenance not loaded in popup scope yet');
        return { ok: false, state: 'POPUP_BOOT_FAILURE', error: 'Popup BuildProvenance unavailable', localInfo: null, bgInfo: null };
    }

    const localHead = localInfo.implementationHead || localInfo.head;
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
                    if (res && res.error === 'BUILD_PROVENANCE_UNAVAILABLE') {
                        console.warn(`[BUILD_HANDSHAKE] Background service worker reports BUILD_PROVENANCE_UNAVAILABLE. Boot errors:`, res.bootErrors);
                        resolve({ ok: false, state: 'SW_BOOT_FAILURE', error: 'Service worker BuildProvenance unavailable', localInfo, bgInfo: null, bootErrors: res.bootErrors });
                        return;
                    }
                    console.warn(`[BUILD_HANDSHAKE] localHead=${localHead} backgroundHead=UNREACHABLE result=TRANSIENT error=${err}`);
                    resolve({ ok: false, state: 'UNREACHABLE_TRANSIENT', error: err, localInfo, bgInfo: null });
                    return;
                }

                const bgInfo = res.provenance || res;
                const bgHead = bgInfo.implementationHead || bgInfo.head;
                const bgBuild = bgInfo.buildId;

                const localManifest = Number((localInfo && localInfo.manifestVersion) || 3);
                const bgManifest = Number((bgInfo && bgInfo.manifestVersion) || 3);
                const isMatch = (localHead === bgHead && localBuild === bgBuild && localManifest === bgManifest);
                if (isMatch) {
                    console.log(`[BUILD_HANDSHAKE] localHead=${localHead} backgroundHead=${bgHead} result=PASS`);
                    const startBtn = document.getElementById('start-btn');
                    if (startBtn) {
                        startBtn.removeAttribute('data-build-locked');
                        if (typeof campaignActive === 'undefined' || !campaignActive) {
                            startBtn.disabled = false;
                        }
                    }
                    const mismatchBanner = document.getElementById('build-mismatch-banner');
                    if (mismatchBanner) mismatchBanner.style.display = 'none';
                    resolve({ ok: true, state: 'MATCH', localInfo, bgInfo });
                } else {
                    console.error(`[BUILD_HANDSHAKE] localHead=${localHead} backgroundHead=${bgHead} result=REJECT mismatch`);
                    const reason = `Runtime build mismatch! Popup is ${localBuild} [${localHead ? localHead.substring(0, 8) : ''}], but background worker is ${bgBuild} [${bgHead ? bgHead.substring(0, 8) : ''}]. Please reload the extension.`;
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
    } else if (result.state === 'SW_BOOT_FAILURE') {
        // [RC3.27 Directive 4] SW_BOOT_FAILURE is a boot/transient condition, NOT confirmed mismatch
        setStartGateState('TRANSIENT_WAIT', 'Service worker initializing modules...');
    } else {
        setStartGateState('TRANSIENT_WAIT', result.error);
    }

    return result;
}

// ── [R6.9G.10.3.7.1.4.5] One-Click Auto Setup & Owner Functional Test Suite ──
// ── [R6.9G.10.3.7.1.4.9] Controlled CAPTCHA Lab Metrics Hydrator ──
function updateCaptchaLabPanel(metrics = {}, ledger = {}) {
    const detectedEl = document.getElementById('lab-detected-count');
    const requestedEl = document.getElementById('lab-requested-count');
    const successEl = document.getElementById('lab-success-count');
    const failureEl = document.getElementById('lab-failure-count');
    const timeoutEl = document.getElementById('lab-timeout-count');
    const staleEl = document.getElementById('lab-stale-count');
    const mathEl = document.getElementById('lab-math-count');
    const audioEl = document.getElementById('lab-audio-count');

    const det = metrics.detected !== undefined ? metrics.detected : (ledger.detected || 0);
    const req = metrics.requested !== undefined ? metrics.requested : (ledger.detected || 0);
    const succ = metrics.success !== undefined ? metrics.success : (ledger.autoSuccess || 0);
    const fail = metrics.failure !== undefined ? metrics.failure : (ledger.autoFailure || 0);

    if (detectedEl) detectedEl.textContent = det;
    if (requestedEl) requestedEl.textContent = req;
    if (successEl) successEl.textContent = succ;
    if (failureEl) failureEl.textContent = fail;
    if (timeoutEl) timeoutEl.textContent = metrics.timeout !== undefined ? metrics.timeout : 0;
    if (staleEl) staleEl.textContent = metrics.staleDropped !== undefined ? metrics.staleDropped : 0;
    if (mathEl) mathEl.textContent = metrics.mathSolved !== undefined ? metrics.mathSolved : 0;
    if (audioEl) audioEl.textContent = metrics.audioPassed !== undefined ? metrics.audioPassed : 0;
}

function updateAutoSetupUI(state) {
    if (typeof document === 'undefined') return;
    const statusPill = document.getElementById('auto-setup-status-pill');
    const runBtn = document.getElementById('run-function-test-btn');
    const runLabBtn = document.getElementById('run-captcha-lab-btn');
    const runFullBtn = document.getElementById('run-full-test-btn');
    const runCfLiveBtn = document.getElementById('run-cloudflare-live-btn');
    const runCfTestKeyBtn = document.getElementById('run-cloudflare-testkey-btn');
    const labPanel = document.getElementById('captcha-lab-panel');
    const restoreBtn = document.getElementById('restore-user-settings-btn');

    const cfPillContainer = document.getElementById('cf-live-status-pill-container');
    const setButtonsDisplay = (disp, disabled = false) => {
        if (runBtn) { 
            runBtn.style.display = disp; 
            runBtn.disabled = disabled;
            if (disabled) runBtn.disabled = true;
        }
        if (runLabBtn) { runLabBtn.style.display = disp; runLabBtn.disabled = disabled; }
        if (runFullBtn) { runFullBtn.style.display = disp; runFullBtn.disabled = disabled; }
        if (runCfLiveBtn) { runCfLiveBtn.style.display = disp; runCfLiveBtn.disabled = disabled; }
        if (runCfTestKeyBtn) { runCfTestKeyBtn.style.display = disp; runCfTestKeyBtn.disabled = disabled; }
        if (cfPillContainer) { cfPillContainer.style.display = (disp === 'none' ? 'none' : 'block'); }
    };

    if (state === 'READY') {
        if (statusPill) {
            statusPill.textContent = 'READY — LOCAL TEST SERVER VERIFIED';
            statusPill.style.background = 'rgba(16, 185, 129, 0.2)';
            statusPill.style.color = '#34d399';
            statusPill.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        }
        setButtonsDisplay('inline-flex', false);
        if (labPanel) labPanel.style.display = 'block';
        if (restoreBtn) restoreBtn.style.display = 'inline-flex';
    } else if (state === 'CHECKING' || state === 'STARTING' || state === 'VERIFYING') {
        if (statusPill) {
            statusPill.textContent = state === 'CHECKING' ? 'CHECKING TEST RUNTIME...' : (state === 'STARTING' ? 'STARTING LOCAL TEST SERVER...' : 'VERIFYING 127.0.0.1:8088...');
            statusPill.style.background = 'rgba(234, 179, 8, 0.2)';
            statusPill.style.color = '#fde047';
            statusPill.style.borderColor = 'rgba(234, 179, 8, 0.5)';
        }
        setButtonsDisplay('inline-flex', true);
        if (restoreBtn) restoreBtn.style.display = 'inline-flex';
    } else if (state === 'COLLISION' || state === 'INSTALL_REQUIRED' || state === 'UNAVAILABLE' || state === 'ERROR') {
        if (statusPill) {
            statusPill.textContent = state === 'COLLISION' ? 'PORT 8088 COLLISION' : (state === 'INSTALL_REQUIRED' ? 'ONE-TIME TEST RUNTIME INSTALL REQUIRED' : 'LOCAL TEST SERVER NOT AVAILABLE');
            statusPill.style.background = 'rgba(239, 68, 68, 0.2)';
            statusPill.style.color = '#fca5a5';
            statusPill.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        }
        setButtonsDisplay('inline-flex', true);
        if (restoreBtn) restoreBtn.style.display = 'inline-flex';
    } else if (state === 'RUNNING') {
        if (statusPill) {
            statusPill.textContent = 'RUNNING';
            statusPill.style.background = 'rgba(59, 130, 246, 0.2)';
            statusPill.style.color = '#60a5fa';
            statusPill.style.borderColor = 'rgba(59, 130, 246, 0.5)';
        }
        setButtonsDisplay('none');
        if (restoreBtn) restoreBtn.style.display = 'inline-flex';
    } else if (state === 'COMPLETED') {
        if (statusPill) {
            statusPill.textContent = 'FINISHED';
            statusPill.style.background = 'rgba(16, 185, 129, 0.25)';
            statusPill.style.color = '#34d399';
            statusPill.style.borderColor = 'rgba(16, 185, 129, 0.6)';
        }
        setButtonsDisplay('inline-flex', false);
        if (restoreBtn) restoreBtn.style.display = 'inline-flex';
    } else {
        if (statusPill) {
            statusPill.textContent = 'STANDBY';
            statusPill.style.background = 'rgba(148, 163, 184, 0.2)';
            statusPill.style.color = '#94a3b8';
            statusPill.style.borderColor = 'rgba(148, 163, 184, 0.3)';
        }
        if (runBtn) runBtn.style.display = 'none';
        if (restoreBtn) restoreBtn.style.display = 'none';
    }
}

async function refreshCloudflareLiveStatusPill() {
    if (typeof document === 'undefined') return;
    const pill = document.getElementById('cf-live-status-pill');
    if (!pill) return;
    try {
        const st = await chrome.storage.local.get(['xpider_cf_live_config']);
        const cfg = st.xpider_cf_live_config;
        const isLoop = cfg?.liveUrl ? (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(cfg.liveUrl) || !cfg.liveUrl.startsWith('https://')) : true;
        const isConfigured = Boolean(cfg && cfg.liveUrl && cfg.sitekey && cfg.verifyEndpoint && !isLoop);
        if (isConfigured) {
            pill.textContent = 'LIVE: READY';
            pill.style.background = 'rgba(16, 185, 129, 0.2)';
            pill.style.color = '#34d399';
            pill.style.border = '1px solid rgba(16, 185, 129, 0.5)';
        } else {
            pill.textContent = 'LIVE: CONFIG REQUIRED';
            pill.style.background = 'rgba(234, 179, 8, 0.2)';
            pill.style.color = '#fbbf24';
            pill.style.border = '1px solid #eab308';
        }
    } catch (_) {}
}

function initCloudflareLiveSettings() {
    if (typeof document === 'undefined') return;
    const saveBtn = document.getElementById('cf-live-save-btn');
    const clearBtn = document.getElementById('cf-live-clear-btn');
    const urlInput = document.getElementById('cf-live-url');
    const sitekeyInput = document.getElementById('cf-live-sitekey');
    const verifyInput = document.getElementById('cf-live-verify-endpoint');
    const msgDiv = document.getElementById('cf-live-settings-msg');

    chrome.storage.local.get(['xpider_cf_live_config']).then((st) => {
        const cfg = st.xpider_cf_live_config;
        if (cfg) {
            if (urlInput && cfg.liveUrl) urlInput.value = cfg.liveUrl;
            if (sitekeyInput && cfg.sitekey) sitekeyInput.value = cfg.sitekey;
            if (verifyInput && cfg.verifyEndpoint) verifyInput.value = cfg.verifyEndpoint;
        }
        refreshCloudflareLiveStatusPill();
    }).catch(() => {});

    if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = 'true';
        saveBtn.addEventListener('click', async () => {
            const liveUrl = (urlInput?.value || '').trim();
            const sitekey = (sitekeyInput?.value || '').trim();
            const verifyEndpoint = (verifyInput?.value || '').trim();

            if (!liveUrl || !sitekey || !verifyEndpoint) {
                if (msgDiv) {
                    msgDiv.style.display = 'block';
                    msgDiv.style.background = 'rgba(239, 68, 68, 0.2)';
                    msgDiv.style.color = '#f87171';
                    msgDiv.style.border = '1px solid #ef4444';
                    msgDiv.textContent = 'All fields (URL, Sitekey, Verification Endpoint) are required.';
                }
                return;
            }

            if (!liveUrl.startsWith('https://')) {
                if (msgDiv) {
                    msgDiv.style.display = 'block';
                    msgDiv.style.background = 'rgba(239, 68, 68, 0.2)';
                    msgDiv.style.color = '#f87171';
                    msgDiv.style.border = '1px solid #ef4444';
                    msgDiv.textContent = 'Live URL must start with https:// (public HTTPS only).';
                }
                return;
            }

            if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(liveUrl)) {
                if (msgDiv) {
                    msgDiv.style.display = 'block';
                    msgDiv.style.background = 'rgba(239, 68, 68, 0.2)';
                    msgDiv.style.color = '#f87171';
                    msgDiv.style.border = '1px solid #ef4444';
                    msgDiv.textContent = 'Loopback (127.0.0.1 / localhost) is forbidden for LIVE mode.';
                }
                return;
            }

            await chrome.storage.local.set({
                xpider_cf_live_config: { liveUrl, sitekey, verifyEndpoint }
            });

            if (msgDiv) {
                msgDiv.style.display = 'block';
                msgDiv.style.background = 'rgba(16, 185, 129, 0.2)';
                msgDiv.style.color = '#34d399';
                msgDiv.style.border = '1px solid rgba(16, 185, 129, 0.5)';
                msgDiv.textContent = '✅ Cloudflare Live Settings saved successfully!';
                setTimeout(() => { if (msgDiv) msgDiv.style.display = 'none'; }, 4000);
            }
            await refreshCloudflareLiveStatusPill();
        });
    }

    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = 'true';
        clearBtn.addEventListener('click', async () => {
            if (urlInput) urlInput.value = '';
            if (sitekeyInput) sitekeyInput.value = '';
            if (verifyInput) verifyInput.value = '';
            await chrome.storage.local.remove(['xpider_cf_live_config']);
            if (msgDiv) {
                msgDiv.style.display = 'block';
                msgDiv.style.background = 'rgba(234, 179, 8, 0.2)';
                msgDiv.style.color = '#fbbf24';
                msgDiv.style.border = '1px solid #eab308';
                msgDiv.textContent = 'Settings cleared.';
                setTimeout(() => { if (msgDiv) msgDiv.style.display = 'none'; }, 3000);
            }
            await refreshCloudflareLiveStatusPill();
        });
    }
}

async function probeAndEnsureOwnerTestServer() {
    const probeHealth = async (timeoutMs = 1500) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const resp = await fetch('http://127.0.0.1:8088/__xpider_health', {
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.ok === true && data.service === 'XPIDER_OWNER_TEST_SERVER') {
                    const is8Set = (data.fixtureSet === 'OWNER_8_V1' || data.totalFixtures === 8 || data.hasAiRequiredFields === true);
                    return { ok: true, health: data, is8Set };
                }
                return { ok: false, error: 'PORT_COLLISION', details: data };
            }
            return { ok: false, error: 'NON_200', status: resp.status };
        } catch (e) {
            return { ok: false, error: 'UNAVAILABLE', details: e.message };
        }
    };

    const verifyAiFixtureReachable = async () => {
        try {
            const r = await fetch('http://127.0.0.1:8088/ai-required-fields.html', { method: 'HEAD', cache: 'no-store' });
            return r.status === 200;
        } catch (_) {
            return false;
        }
    };

    updateAutoSetupUI('CHECKING');
    showAutoSetupFeedback('🔍 Checking local test fixture runtime (127.0.0.1:8088)...', 'info');
    let health = await probeHealth(1200);
    if (health.ok) {
        const fixtureOk = health.is8Set && (await verifyAiFixtureReachable());
        if (fixtureOk) {
            return { success: true, health: health.health };
        }
        // Stale test server detected on 8088 (lacks 8-fixture suite). Gracefully shut down and upgrade.
        console.warn('[AUTO_SETUP] Stale test server detected on 8088 (missing ai-required-fields.html). Upgrading...');
        showAutoSetupFeedback('🔄 Upgrading local test fixture runtime to 8-fixture suite...', 'info');
        try {
            await fetch('http://127.0.0.1:8088/__xpider_shutdown', { method: 'POST' });
        } catch (_) {}
        // Poll for port 8088 to free
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 100));
            const ph = await probeHealth(300);
            if (!ph.ok && ph.error === 'UNAVAILABLE') break;
        }
    }
    if (health.error === 'PORT_COLLISION') {
        updateAutoSetupUI('COLLISION');
        showAutoSetupFeedback(
            '🛑 PORT 8088 COLLISION\n' +
            'Port 8088 is occupied by a foreign process. Please terminate the conflicting process on port 8088.',
            'error'
        );
        return { success: false, error: 'OWNER_TEST_PORT_COLLISION' };
    }

    // 2. Try starting via Native Messaging Host
    updateAutoSetupUI('STARTING');
    showAutoSetupFeedback('🚀 Starting local test server automatically via Native Host...', 'info');

    let nativeResp = null;
    try {
        nativeResp = await new Promise((resolve) => {
            chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'START_OWNER_TEST_SERVER' }, (resp) => {
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: 'NATIVE_HOST_ERROR', details: chrome.runtime.lastError.message });
                } else {
                    resolve(resp || { success: false, error: 'EMPTY_RESPONSE' });
                }
            });
        });
    } catch (e) {
        nativeResp = { success: false, error: 'NATIVE_HOST_EXCEPTION', details: e.message };
    }

    // Fallback: If popup call failed, try asking background service worker
    if (!nativeResp || !nativeResp.success) {
        try {
            const bgResp = await chrome.runtime.sendMessage({ action: 'ENSURE_OWNER_TEST_SERVER' });
            if (bgResp && bgResp.success) {
                nativeResp = bgResp;
            }
        } catch (_) {}
    }

    if (!nativeResp || !nativeResp.success) {
        updateAutoSetupUI('INSTALL_REQUIRED');
        const isStaleHost = nativeResp && nativeResp.fixtureSet && nativeResp.fixtureSet !== 'OWNER_8_V1';
        const msg = isStaleHost
            ? '⚠️ OLD TEST RUNTIME DETECTED (Registered Native Host returned older 7-fixture suite)\n' +
              'Please run XPIDER_AUTO_SETUP.bat once in the current extension directory to update registration.'
            : '⚠️ ONE-TIME TEST RUNTIME INSTALL REQUIRED\n' +
              'Local test server could not be started automatically because the native host is not installed.\n' +
              'Please run XPIDER_AUTO_SETUP.bat once in the extension directory to register the native host.';
        showAutoSetupFeedback(msg, 'error');
        return { success: false, error: isStaleHost ? 'STALE_NATIVE_HOST_REGISTRATION' : 'ONE_TIME_INSTALL_REQUIRED', details: nativeResp };
    }

    if (nativeResp.error === 'OWNER_TEST_PORT_COLLISION') {
        updateAutoSetupUI('COLLISION');
        showAutoSetupFeedback('🛑 PORT 8088 COLLISION\n' + (nativeResp.message || 'Port 8088 collided with foreign service.'), 'error');
        return { success: false, error: 'OWNER_TEST_PORT_COLLISION' };
    }

    // 3. Verify health and 8-fixture reachability bounded
    updateAutoSetupUI('VERIFYING');
    showAutoSetupFeedback('⏳ Verifying test server health identity on 127.0.0.1:8088...', 'info');
    let aiReachable = false;
    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 200));
        health = await probeHealth(800);
        if (health.ok && health.is8Set) {
            aiReachable = await verifyAiFixtureReachable();
            if (aiReachable) break;
        }
    }

    if (!health.ok || !health.is8Set || !aiReachable) {
        updateAutoSetupUI('ERROR');
        const reason = (!health.ok)
            ? 'Server failed to respond with verified identity.'
            : (!health.is8Set ? 'Server did not return OWNER_8_V1 fixture suite.' : 'Fixture /ai-required-fields.html returned 404.');
        showAutoSetupFeedback(`🛑 LOCAL TEST SERVER NOT AVAILABLE\n${reason}\nRun XPIDER_AUTO_SETUP.bat once in the current folder to refresh test runtime.`, 'error');
        return { success: false, error: 'SERVER_VERIFICATION_FAILED' };
    }

    // 4. Verify /contact-standard.html and /ai-required-fields.html fixtures return 200
    try {
        const fixtureCheck = await fetch('http://127.0.0.1:8088/contact-standard.html', { method: 'HEAD', cache: 'no-store' });
        if (!fixtureCheck.ok) {
            updateAutoSetupUI('ERROR');
            showAutoSetupFeedback('🛑 LOCAL TEST SERVER INCOMPLETE\nFixture /contact-standard.html returned ' + fixtureCheck.status, 'error');
            return { success: false, error: 'FIXTURE_NOT_FOUND' };
        }
        const aiCheck = await fetch('http://127.0.0.1:8088/ai-required-fields.html', { method: 'HEAD', cache: 'no-store' });
        if (!aiCheck.ok) {
            updateAutoSetupUI('ERROR');
            showAutoSetupFeedback('🛑 LOCAL TEST SERVER INCOMPLETE\nFixture /ai-required-fields.html returned ' + aiCheck.status + '\nRun XPIDER_AUTO_SETUP.bat to refresh test server.', 'error');
            return { success: false, error: 'AI_FIXTURE_NOT_FOUND' };
        }
    } catch (_) {}

    return { success: true, health: health.health };
}

function showAutoSetupFeedback(msg, type = 'info') {
    if (typeof document === 'undefined') return;
    const box = document.getElementById('auto-setup-feedback');
    if (!box) return;
    box.textContent = msg;
    box.style.display = 'block';
    if (type === 'success') {
        box.style.background = 'rgba(16, 185, 129, 0.15)';
        box.style.color = '#6ee7b7';
        box.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    } else if (type === 'error') {
        box.style.background = 'rgba(239, 68, 68, 0.15)';
        box.style.color = '#fca5a5';
        box.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    } else if (type === 'warn') {
        box.style.background = 'rgba(234, 179, 8, 0.15)';
        box.style.color = '#fde047';
        box.style.border = '1px solid rgba(234, 179, 8, 0.4)';
    } else {
        box.style.background = 'rgba(59, 130, 246, 0.15)';
        box.style.color = '#93c5fd';
        box.style.border = '1px solid rgba(59, 130, 246, 0.4)';
    }
}

function onCampaignFinishedOwnerTestCheck(counters) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    restoreStartButton();
    chrome.storage.local.get(['xpider_owner_function_test_mode', 'xpider_owner_backup_snapshot', 'xpider_owner_original_profile', 'xpider_active_test_source', 'xpider_cloudflare_live_test']).then((st) => {
        const sc = counters ? (counters.success || 0) : 0;
        const sk = counters ? (counters.skipped || 0) : 0;
        const fl = counters ? (counters.failed || 0) : 0;
        const total = sc + sk + fl;

        // [R6.9G.10.3.7.1.4.11 Terminal Test Session Auto-Cleanup]
        const isAnyTestSession = Boolean(
            st && (
                st.xpider_owner_function_test_mode ||
                st.xpider_active_test_source ||
                st.xpider_cloudflare_live_test
            )
        );
        if (isAnyTestSession) {
            (async () => {
                try {
                    await chrome.runtime.sendMessage({ action: 'REMOVE_OWNER_TEST_GUARD' });
                    await chrome.storage.local.set({
                        xpider_owner_function_test_mode: false,
                        xpider_test_mode_state: 'TEST_RESULT_VIEW'
                    });
                    await chrome.storage.local.remove([
                        'xpider_active_test_source',
                        'xpider_cloudflare_live_test',
                        'xpider_owner_function_test_mode_active'
                    ]);
                    const oftToggle = document.getElementById('owner-function-test-toggle');
                    if (oftToggle) oftToggle.checked = false;
                    const oftBanner = document.getElementById('owner-function-test-banner');
                    if (oftBanner) oftBanner.style.display = 'none';
                    console.log('[TEST_TERMINAL_CLEANUP] testGuardRemoved=true testModeReset=true resultViewActive=true');
                    addLog('[TEST_TERMINAL_CLEANUP] testGuardRemoved=true testModeReset=true resultViewActive=true', 'info');
                } catch (cleanupErr) {
                    console.warn('[TEST_TERMINAL_CLEANUP_WARN]', cleanupErr);
                }
            })();
        }

        // [R6.9G.10.3.7.1.4.10] Cloudflare Live Owner Validation Evaluation
        if (st && st.xpider_active_test_source === 'CLOUDFLARE_LIVE_OWNER') {
            updateAutoSetupUI('COMPLETED');
            const cfPanel = document.getElementById('cloudflare-test-panel');
            if (cfPanel) cfPanel.style.display = 'block';

            if (sc === 1) {
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) { elBadge.textContent = 'PASS'; elBadge.style.color = '#4ade80'; }
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) { elFinal.textContent = 'PASS (Siteverify Verified)'; elFinal.style.color = '#4ade80'; }
                const elVerify = document.getElementById('cf-panel-siteverify'); if (elVerify) { elVerify.textContent = 'Verified: true'; elVerify.style.color = '#4ade80'; }
                showAutoSetupFeedback(
                    `🏁 CLOUDFLARE LIVE OWNER VALIDATION PASS (100% EXPECTED OUTCOME)\n` +
                    `Genuine Cloudflare Turnstile token verified via server Siteverify (success=true).\n` +
                    `Zero mock/third-party solver calls. Owner challenge completion verified.\n` +
                    `Click '↩ RESTORE' to restore your previous settings and URL list.`,
                    'success'
                );
            } else {
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) { elBadge.textContent = 'FAIL'; elBadge.style.color = '#f87171'; }
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) { elFinal.textContent = 'FAIL (Siteverify Failed)'; elFinal.style.color = '#f87171'; }
                showAutoSetupFeedback(
                    `❌ CLOUDFLARE LIVE OWNER VALIDATION FAILED\n` +
                    `Siteverify verification failed or form submission did not succeed.\n` +
                    `Click '⚡ RUN CLOUDFLARE LIVE OWNER TEST' to retry or '↩ RESTORE' to restore.`,
                    'error'
                );
            }
            return;
        }

        // [R6.9G.10.3.7.1.4.10] Cloudflare Official Test-Key Lab Evaluation (5 cases)
        if (st && st.xpider_active_test_source === 'CLOUDFLARE_TESTKEY_LAB') {
            updateAutoSetupUI('COMPLETED');
            const cfPanel = document.getElementById('cloudflare-test-panel');
            if (cfPanel) cfPanel.style.display = 'block';

            const testKeyPass = (total === 5 && sc === 3 && sk === 2);
            const testKeyUnattended = (total === 5 && sc === 2 && sk === 2 && fl === 1);
            if (testKeyPass) {
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) { elBadge.textContent = 'PASS'; elBadge.style.color = '#4ade80'; }
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) { elFinal.textContent = '5/5 PASS (3 Solved + 2 Exp Fail)'; elFinal.style.color = '#4ade80'; }
                showAutoSetupFeedback(
                    `🏁 CLOUDFLARE OFFICIAL TEST-KEY LAB PASS (100% EXPECTED OUTCOME)\n` +
                    `5/5 Cases Verified (3 Pass + 2 Expected Failures | 0 Unexpected Failures)\n` +
                    `Real Turnstile tokens generated & server Siteverify outcomes confirmed.\n` +
                    `Click '↩ RESTORE' to restore your previous settings and URL list.`,
                    'success'
                );
            } else if (testKeyUnattended) {
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) { elBadge.textContent = 'ACCOUNTED'; elBadge.style.color = '#60a5fa'; }
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) { elFinal.textContent = '5/5 ACCOUNTED (2 Pass + 2 Exp Fail + 1 Unattended Interactive Timeout)'; elFinal.style.color = '#60a5fa'; }
                showAutoSetupFeedback(
                    `🏁 CLOUDFLARE TEST-KEY LAB: 5/5 ACCOUNTED\n` +
                    `Outcomes: 2 Auto-Pass / 2 Expected Failures / 1 Interactive Challenge (Timed out awaiting physical click).\n` +
                    `All 5 fixtures cleanly settled without hangs or token forgery.\n` +
                    `Click '↩ RESTORE' to restore your previous settings and URL list.`,
                    'info'
                );
            } else {
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) { elBadge.textContent = 'INCOMPLETE'; elBadge.style.color = '#fbbf24'; }
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) { elFinal.textContent = `${sc}/3 Solved, ${sk}/2 Exp Fail`; elFinal.style.color = '#fbbf24'; }
                showAutoSetupFeedback(
                    `⚠️ CLOUDFLARE TEST-KEY LAB INCOMPLETE (Expected 5/5 accounted)\n` +
                    `Observed: ${sc} SUCCESS / ${sk} SKIPPED / ${fl} FAILURE (Total: ${total}/5)\n` +
                    `Click '🔑 RUN CLOUDFLARE OFFICIAL TEST-KEY LAB' to retry or '↩ RESTORE' to restore.`,
                    'warn'
                );
            }
            return;
        }

        const testSource = st?.xpider_active_test_source || (typeof window !== 'undefined' ? window.__xpider_last_test_source : null);
        const isCaptchaLab = (testSource === 'OWNER_CAPTCHA_LAB');

        if (isCaptchaLab) {
            updateAutoSetupUI('COMPLETED');
            const labPanel = document.getElementById('captcha-lab-panel');
            if (labPanel) labPanel.style.display = 'block';
            const labPass = (total === 7 && sc === 5);
            if (labPass) {
                showAutoSetupFeedback(
                    `🏁 CONTROLLED CAPTCHA LAB PASS (100% EXPECTED OUTCOME)\n` +
                    `Lab Cases: 7/7 PASS (5 Solved + 2 Expected Failures Verified | 0 Unexpected Failures)\n` +
                    `Click '↩ RESTORE' to restore your previous settings and URL list.`,
                    'success'
                );
            } else {
                showAutoSetupFeedback(
                    `⚠️ CONTROLLED CAPTCHA LAB INCOMPLETE (Expected 5 Solved / 2 Expected Failures)\n` +
                    `Observed: ${sc} SUCCESS / ${sk} SKIPPED / ${fl} FAILURE (Total: ${total}/7)\n` +
                    `Click '🧩 RUN CAPTCHA LAB' to retry or '↩ RESTORE' to restore.`,
                    'warn'
                );
            }
            return;
        }

        if (st && (st.xpider_owner_function_test_mode || testSource === 'OWNER_CORE_TEST' || testSource === 'OWNER_FULL_TEST')) {
            if (total === 0) {
                updateAutoSetupUI('READY');
                showAutoSetupFeedback(
                    `🛑 TEST NOT RUN — 0 OF 7 EXECUTED\n` +
                    `All targets were filtered out (history or suppression). Click '✨ AUTO SETUP' to re-arm test fixtures.`,
                    'error'
                );
                return;
            }

            const isTargetResult = (total === 8 && sc === 5 && sk === 2 && fl === 1) || (total === 7 && sc === 4 && sk === 2 && fl === 1);
            if (isTargetResult) {
                updateAutoSetupUI('COMPLETED');
                const outcomeText = (total === 8)
                    ? `Outcomes: 5 SUCCESS (incl. AI Required-Field Completion) / 2 SKIPPED / 1 FAILURE (8/8 executed)`
                    : `Outcomes: 4 SUCCESS / 2 SKIPPED / 1 FAILURE (7/7 executed)`;
                showAutoSetupFeedback(
                    `🏁 LOCAL FUNCTION TEST PASS (100% EXPECTED OUTCOME)\n` +
                    `${outcomeText}\n` +
                    `Click '↩ RESTORE' to restore your previous settings and URL list.`,
                    'success'
                );
            } else {
                updateAutoSetupUI('COMPLETED');
                showAutoSetupFeedback(
                    `⚠️ LOCAL FUNCTION TEST INCOMPLETE (Expected 5/2/1 across 8 fixtures or 4/2/1 across 7 fixtures)\n` +
                    `Observed: ${sc} SUCCESS / ${sk} SKIPPED / ${fl} FAILURE (Total: ${total})\n` +
                    `Click '✨ AUTO SETUP' to re-arm test fixtures or '↩ RESTORE' to restore.`,
                    'warn'
                );
            }
        }
    }).catch(() => {});
}

function initOwnerAutoSetup() {
    if (typeof document === 'undefined') return;
    const autoSetupBtn = document.getElementById('auto-setup-btn');
    const runBtn = document.getElementById('run-function-test-btn');
    const restoreBtn = document.getElementById('restore-user-settings-btn');
    if (!autoSetupBtn) return;

    // Check existing snapshot state
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_function_test_mode']).then(async (st) => {
            if (st && st.xpider_owner_function_test_mode) {
                const srv = await probeAndEnsureOwnerTestServer();
                if (srv.success) {
                    updateAutoSetupUI('READY');
                    if (st.xpider_owner_backup_snapshot) {
                        showAutoSetupFeedback('READY FOR LOCAL FUNCTION TEST (Active)\nLocal test server verified (127.0.0.1:8088). Previous list & settings backed up.', 'success');
                    }
                }
            } else if (st && st.xpider_owner_backup_snapshot) {
                // Snapshot exists but test mode off - offer restore
                const restoreB = document.getElementById('restore-user-settings-btn');
                if (restoreB) restoreB.style.display = 'inline-flex';
            }
        }).catch(() => {});
    }

    const LOCALHOST_FIXTURES = [
        'http://127.0.0.1:8088/contact-standard.html',
        'http://127.0.0.1:8088/contact-dropdown-checkbox.html',
        'http://127.0.0.1:8088/contact-numeric.html',
        'http://127.0.0.1:8088/subscribe-no-message.html',
        'http://127.0.0.1:8088/reservation-no-message.html',
        'http://127.0.0.1:8088/no-contact-page.html',
        'http://127.0.0.1:8088/index.html',
        'http://127.0.0.1:8088/ai-required-fields.html'
    ];

    const CAPTCHA_LAB_FIXTURES = [
        'http://127.0.0.1:8088/captcha-math.html',
        'http://127.0.0.1:8088/captcha-recaptcha-dom.html',
        'http://127.0.0.1:8088/captcha-hcaptcha-dom.html',
        'http://127.0.0.1:8088/captcha-turnstile-dom.html',
        'http://127.0.0.1:8088/captcha-mock-solve.html',
        'http://127.0.0.1:8088/captcha-mock-timeout.html',
        'http://127.0.0.1:8088/captcha-mock-config-error.html'
    ];

    if (!autoSetupBtn.dataset.bound) {
        autoSetupBtn.dataset.bound = 'true';
        autoSetupBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=auto-setup-btn');
            try {
                // 1. Detect BuildProvenance TEST_ONLY
                const isTestAuthorized = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function')
                    ? BuildProvenance.isTestOnlyBuild()
                    : Boolean(typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO && (
                        BuildProvenance.BUILD_INFO.channel === 'TEST_ONLY' ||
                        BuildProvenance.BUILD_INFO.channel === 'OWNER_BETA' ||
                        (typeof BuildProvenance.BUILD_INFO.channel === 'string' && BuildProvenance.BUILD_INFO.channel.startsWith('OWNER_BETA')) ||
                        BuildProvenance.BUILD_INFO.testOnly === true
                    ));

                if (!isTestAuthorized) {
                    showAutoSetupFeedback('AUTO SETUP FAILED — Runtime build is not authorized for TEST_ONLY or OWNER_BETA channel.', 'error');
                    return;
                }

                // 2. Preserve Owner's existing public list and settings snapshot as a reversible restore point
                const currentStorage = await chrome.storage.local.get(null);
                let existingSnapshot = currentStorage.xpider_owner_backup_snapshot;
                let persistentOriginal = currentStorage.xpider_owner_original_profile;

                const isLoopbackFn = (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(typeof u === 'string' ? u : (u?.url || ''));

                // Determine public queue to preserve (strictly never loopback test fixtures)
                let qToSave = [];
                if (Array.isArray(campaignQueue) && campaignQueue.length > 0 && !campaignQueue.every(isLoopbackFn)) {
                    qToSave = campaignQueue.filter(u => !isLoopbackFn(u));
                } else if (Array.isArray(currentStorage.xpider_queue) && currentStorage.xpider_queue.length > 0 && !currentStorage.xpider_queue.every(isLoopbackFn)) {
                    qToSave = currentStorage.xpider_queue.filter(u => !isLoopbackFn(u));
                } else if (existingSnapshot && Array.isArray(existingSnapshot.queue) && existingSnapshot.queue.length > 0 && !existingSnapshot.queue.every(isLoopbackFn)) {
                    qToSave = [...existingSnapshot.queue];
                } else if (persistentOriginal && Array.isArray(persistentOriginal.queue) && persistentOriginal.queue.length > 0 && !persistentOriginal.queue.every(isLoopbackFn)) {
                    qToSave = [...persistentOriginal.queue];
                } else if (Array.isArray(currentStorage.saved_lists) && currentStorage.saved_lists.length > 0 && Array.isArray(currentStorage.saved_lists[0].urls)) {
                    qToSave = currentStorage.saved_lists[0].urls.filter(u => !isLoopbackFn(u));
                }

                const liveSkipEl = document.getElementById('skip-attempted-toggle');
                const liveDoubleEl = document.getElementById('double-submit-toggle');
                const liveFilename = document.getElementById('filename-display')?.textContent || '';
                const originalFilename = (!liveFilename.includes('OWNER_LOCAL_FIXTURES') && !liveFilename.includes('CAPTCHA'))
                    ? liveFilename
                    : (existingSnapshot?.filename || persistentOriginal?.filename || (qToSave.length > 0 ? 'Original Campaign Targets' : 'No file selected'));

                const templateToSave = {
                    firstName: document.getElementById('tpl-first-name')?.value || currentStorage.xpider_tpl?.firstName || '',
                    lastName: document.getElementById('tpl-last-name')?.value || currentStorage.xpider_tpl?.lastName || '',
                    name: document.getElementById('tpl-name')?.value || currentStorage.xpider_tpl?.name || '',
                    email: document.getElementById('tpl-email')?.value || currentStorage.xpider_tpl?.email || '',
                    phone: document.getElementById('tpl-phone')?.value || currentStorage.xpider_tpl?.phone || '',
                    subject: document.getElementById('tpl-subject')?.value || currentStorage.xpider_tpl?.subject || '',
                    message: document.getElementById('tpl-message')?.value || currentStorage.xpider_tpl?.message || '',
                    website: document.getElementById('tpl-website')?.value || currentStorage.xpider_tpl?.website || ''
                };

                existingSnapshot = {
                    timestamp: Date.now(),
                    queue: qToSave,
                    totalTargets: qToSave.length,
                    filename: originalFilename,
                    template: templateToSave,
                    settings: {
                        xpider_owner_function_test_mode: false,
                        xpider_delayMs: currentStorage.xpider_delayMs,
                        xpider_fillDelayMs: currentStorage.xpider_fillDelayMs,
                        xpider_submitDelayMs: currentStorage.xpider_submitDelayMs,
                        xpider_fill_mode: currentStorage.xpider_fill_mode,
                        xpider_skip_attempted: liveSkipEl ? liveSkipEl.checked : (currentStorage.xpider_skip_attempted !== undefined ? currentStorage.xpider_skip_attempted : true),
                        xpider_double_submit: liveDoubleEl ? liveDoubleEl.checked : Boolean(currentStorage.xpider_double_submit),
                        xpider_strict_privacy: currentStorage.xpider_strict_privacy,
                        xpider_privacy_transport: currentStorage.xpider_privacy_transport,
                        xpider_captcha_method: currentStorage.xpider_captcha_method,
                        xpider_active_campaign_run_id: currentStorage.xpider_active_campaign_run_id
                    }
                };
                await chrome.storage.local.set({
                    xpider_owner_backup_snapshot: existingSnapshot,
                    xpider_owner_original_profile: existingSnapshot
                });

                // 3. Prepare the local Owner Functional Test profile (7 verified local fixtures)
                campaignQueue = [...LOCALHOST_FIXTURES];
                totalTargets = campaignQueue.length;

                // 4. Install & Readback-verify DNR network guard fail-closed
                let guardOk = false;
                try {
                    const guardRes = await chrome.runtime.sendMessage({ action: 'INSTALL_OWNER_TEST_GUARD' });
                    if (guardRes && guardRes.success) {
                        guardOk = true;
                    }
                } catch (guardErr) {
                    console.warn('[AUTO_SETUP_GUARD_WARN]', guardErr);
                }

                if (!guardOk) {
                    showAutoSetupFeedback('AUTO SETUP FAILED — Could not install/verify DeclarativeNetRequest network guard.', 'error');
                    return;
                }

                // 5. Apply known functional-test defaults automatically:
                // - collect/navigation delay: Level 6 / 10s (10000ms)
                // - fill delay: Level 6 / 300ms
                // - submission/completion hold: Level 6 / 4.0s (4000ms)
                // - Skip Previously Attempted: OFF for deterministic local re-runs
                // - Double Submit: OFF
                const testSettings = {
                    xpider_owner_function_test_mode: true,
                    xpider_queue: campaignQueue,
                    xpider_total: totalTargets,
                    xpider_success: 0,
                    xpider_delayMs: 10000,
                    xpider_fillDelayMs: 300,
                    xpider_submitDelayMs: 4000,
                    xpider_skip_attempted: false,
                    xpider_double_submit: false
                };

                await chrome.storage.local.set(testSettings);

                // 6. Synchronize in-memory and UI controls (Live DOM + Storage synchronization)
                const oftToggle = document.getElementById('owner-function-test-toggle');
                if (oftToggle) oftToggle.checked = true;

                const delaySlider = document.getElementById('delay-slider');
                const delayVal = document.getElementById('delay-value');
                if (delaySlider) delaySlider.value = 6;
                if (delayVal) delayVal.textContent = '10s (Level 6)';

                const fillSlider = document.getElementById('fill-delay-slider');
                const fillVal = document.getElementById('fill-delay-value');
                if (fillSlider) fillSlider.value = 6;
                if (fillVal) fillVal.textContent = '300ms (Level 6)';

                const submitSlider = document.getElementById('submit-delay-slider');
                const submitVal = document.getElementById('submit-delay-value');
                if (submitSlider) submitSlider.value = 6;
                if (submitVal) submitVal.textContent = '4.0s (Level 6)';

                const skipToggle = document.getElementById('skip-attempted-toggle');
                if (skipToggle) {
                    skipToggle.checked = false;
                    skipToggle.dispatchEvent(new Event('change', { bubbles: true }));
                }

                const doubleSubmitToggle = document.getElementById('double-submit-toggle');
                if (doubleSubmitToggle) {
                    doubleSubmitToggle.checked = false;
                    doubleSubmitToggle.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // 7. Prepare dedicated isolated Owner Test Run scope (Directive D)
                try {
                    await chrome.runtime.sendMessage({
                        action: 'PREPARE_OWNER_FUNCTIONAL_TEST_RUN',
                        fixtures: LOCALHOST_FIXTURES
                    });
                } catch (ledgerErr) {
                    console.warn('[AUTO_SETUP_PREPARE_RUN_WARN]', ledgerErr);
                }

                // 8. Render URLs and counters
                renderUrlsPreview(campaignQueue);
                const countDisplay = document.getElementById('url-count-display');
                if (countDisplay) countDisplay.textContent = `${totalTargets} URLs loaded (Local Fixtures)`;
                const filenameDisplay = document.getElementById('filename-display');
                if (filenameDisplay) filenameDisplay.textContent = `OWNER_LOCAL_FIXTURES (${totalTargets} targets)`;
                const fileInfo = document.getElementById('file-info');
                if (fileInfo) fileInfo.classList.remove('hidden');

                updateRealTimeStatus({
                    totalTargets,
                    remainingCount: totalTargets,
                    completedCount: 0,
                    successCount: 0,
                    skippedCount: 0,
                    failedCount: 0
                });

                if (typeof _renderHistoryPanel === 'function') {
                    await _renderHistoryPanel();
                }

                // Precondition: Ensure Local Test Server is running and healthy (Issue #6 Sections B & C)
                const srvRes = await probeAndEnsureOwnerTestServer();
                if (!srvRes.success) {
                    return;
                }

                // 9. Update UI to READY
                updateAutoSetupUI('READY');
                const backedUpCount = existingSnapshot.queue ? existingSnapshot.queue.length : 0;
                showAutoSetupFeedback(
                    `READY FOR LOCAL FUNCTION TEST\n` +
                    `8 local fixtures loaded | Local test server verified (127.0.0.1:8088) | DNR rules 990001-990005 verified | Preserved ${backedUpCount} public URLs in restore point`,
                    'success'
                );
                addLog('✨ [AUTO_SETUP] Local software functional test profile ready (8 fixtures, test server active, DNR guard verified).', 'info');
            } catch (err) {
                console.error('[AUTO_SETUP_EXCEPTION]', err);
                showAutoSetupFeedback('AUTO SETUP FAILED — ' + err.message, 'error');
            }
        });
    }

    if (runBtn && !runBtn.dataset.bound) {
        runBtn.dataset.bound = 'true';
        runBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=run-function-test-btn');
            await launchCampaign({ source: 'OWNER_CORE_TEST', fixtures: LOCALHOST_FIXTURES });
        });
    }

    const runLabBtn = document.getElementById('run-captcha-lab-btn');
    if (runLabBtn && !runLabBtn.dataset.bound) {
        runLabBtn.dataset.bound = 'true';
        runLabBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=run-captcha-lab-btn');
            await launchCampaign({ source: 'OWNER_CAPTCHA_LAB', fixtures: CAPTCHA_LAB_FIXTURES });
        });
    }

    const runFullBtn = document.getElementById('run-full-test-btn');
    if (runFullBtn && !runFullBtn.dataset.bound) {
        runFullBtn.dataset.bound = 'true';
        runFullBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=run-full-test-btn');
            const allFixtures = [
                ...LOCALHOST_FIXTURES,
                'http://127.0.0.1:8088/contact-field-collision.html',
                ...CAPTCHA_LAB_FIXTURES
            ];
            await launchCampaign({ source: 'OWNER_FULL_TEST', fixtures: allFixtures });
        });
    }

    const runCfLiveBtn = document.getElementById('run-cloudflare-live-btn');
    if (runCfLiveBtn && !runCfLiveBtn.dataset.bound) {
        runCfLiveBtn.dataset.bound = 'true';
        runCfLiveBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=run-cloudflare-live-btn');
            const st = await chrome.storage.local.get(['xpider_cf_live_config']);
            const cfg = st.xpider_cf_live_config;

            const missing = [];
            if (!cfg?.liveUrl) missing.push('Cloudflare Live Test URL');
            if (!cfg?.sitekey) missing.push('Cloudflare Turnstile Sitekey');
            if (!cfg?.verifyEndpoint) missing.push('Server Verification Endpoint');

            if (missing.length > 0) {
                console.warn(`[CLOUDFLARE_LIVE_PREFLIGHT] valid=false reason=CLOUDFLARE_LIVE_CONFIG_REQUIRED missing=${missing.join(',')}`);
                alert(`🛑 CLOUDFLARE_LIVE_CONFIG_REQUIRED\n\nPlease configure required settings in Settings -> Cloudflare Turnstile Live Owner Validation:\n- ${missing.join('\n- ')}`);
                showAutoSetupFeedback(`CLOUDFLARE_LIVE_CONFIG_REQUIRED: Missing ${missing.join(', ')}`, 'error');
                return;
            }

            const isLoopback = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(cfg.liveUrl) || !cfg.liveUrl.startsWith('https://');
            if (isLoopback) {
                console.warn(`[CLOUDFLARE_LIVE_PREFLIGHT] valid=false reason=CLOUDFLARE_LIVE_LOOPBACK_REFUSED url=${cfg.liveUrl}`);
                alert(`🛑 CLOUDFLARE_LIVE_LOOPBACK_REFUSED\n\nCloudflare Live Owner Test strictly forbids loopback (127.0.0.1 / localhost) and requires a public HTTPS domain.`);
                showAutoSetupFeedback(`CLOUDFLARE_LIVE_LOOPBACK_REFUSED: ${cfg.liveUrl}`, 'error');
                return;
            }

            console.log('[CLOUDFLARE_LIVE_PREFLIGHT] https=true loopback=false mockEligible=false verificationEndpointConfigured=true');
            addLog('[CLOUDFLARE_LIVE_PREFLIGHT] https=true loopback=false mockEligible=false verificationEndpointConfigured=true', 'info');

            const cfPanel = document.getElementById('cloudflare-test-panel');
            if (cfPanel) {
                cfPanel.style.display = 'block';
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) elBadge.textContent = 'LAUNCHING';
                const elMode = document.getElementById('cf-panel-mode'); if (elMode) elMode.textContent = 'LIVE OWNER VALIDATION';
                const elTarget = document.getElementById('cf-panel-target'); if (elTarget) elTarget.textContent = cfg.liveUrl;
                const elWidget = document.getElementById('cf-panel-widget'); if (elWidget) elWidget.textContent = 'DETECTING...';
                const elSitekey = document.getElementById('cf-panel-sitekey-fp'); if (elSitekey) elSitekey.textContent = cfg.sitekey.length > 8 ? (cfg.sitekey.substring(0, 4) + '...' + cfg.sitekey.slice(-4)) : cfg.sitekey;
                const elAction = document.getElementById('cf-panel-owner-action'); if (elAction) elAction.textContent = 'PENDING';
                const elToken = document.getElementById('cf-panel-token'); if (elToken) elToken.textContent = 'PENDING';
                const elVerify = document.getElementById('cf-panel-siteverify'); if (elVerify) elVerify.textContent = 'PENDING';
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) elFinal.textContent = 'IN_FLIGHT';
            }

            await launchCampaign({
                source: 'CLOUDFLARE_LIVE_OWNER',
                fixtures: [cfg.liveUrl],
                liveConfig: cfg
            });
        });
    }

    const runCfTestKeyBtn = document.getElementById('run-cloudflare-testkey-btn');
    if (runCfTestKeyBtn && !runCfTestKeyBtn.dataset.bound) {
        runCfTestKeyBtn.dataset.bound = 'true';
        runCfTestKeyBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=run-cloudflare-testkey-btn');
            const srv = await probeAndEnsureOwnerTestServer();
            if (!srv.success) return;

            const CF_OFFICIAL_TESTKEY_FIXTURES = [
                'http://127.0.0.1:8088/cf-turnstile-visible-pass.html',
                'http://127.0.0.1:8088/cf-turnstile-visible-fail.html',
                'http://127.0.0.1:8088/cf-turnstile-invisible-pass.html',
                'http://127.0.0.1:8088/cf-turnstile-invisible-fail.html',
                'http://127.0.0.1:8088/cf-turnstile-interactive.html'
            ];

            const cfPanel = document.getElementById('cloudflare-test-panel');
            if (cfPanel) {
                cfPanel.style.display = 'block';
                const elBadge = document.getElementById('cf-panel-stage-badge'); if (elBadge) elBadge.textContent = 'RUNNING';
                const elMode = document.getElementById('cf-panel-mode'); if (elMode) elMode.textContent = 'OFFICIAL TEST-KEY SUITE (5 cases)';
                const elTarget = document.getElementById('cf-panel-target'); if (elTarget) elTarget.textContent = '5 Fixtures (127.0.0.1:8088)';
                const elWidget = document.getElementById('cf-panel-widget'); if (elWidget) elWidget.textContent = 'Turnstile Official Widgets';
                const elSitekey = document.getElementById('cf-panel-sitekey-fp'); if (elSitekey) elSitekey.textContent = 'Official Keys (1x.., 2x.., 3x..)';
                const elAction = document.getElementById('cf-panel-owner-action'); if (elAction) elAction.textContent = 'Automated / Interactive';
                const elToken = document.getElementById('cf-panel-token'); if (elToken) elToken.textContent = 'Official Tokens';
                const elVerify = document.getElementById('cf-panel-siteverify'); if (elVerify) elVerify.textContent = 'Cloudflare Siteverify';
                const elFinal = document.getElementById('cf-panel-final'); if (elFinal) elFinal.textContent = 'IN_FLIGHT';
            }

            await launchCampaign({
                source: 'CLOUDFLARE_TESTKEY_LAB',
                fixtures: CF_OFFICIAL_TESTKEY_FIXTURES
            });
        });
    }

    initCloudflareLiveSettings();

    if (restoreBtn && !restoreBtn.dataset.bound) {
        restoreBtn.dataset.bound = 'true';
        restoreBtn.addEventListener('click', async () => {
            console.log('[BUTTON_CLICK] id=restore-user-settings-btn');
            await restoreUserSettings();
        });
    }
}

async function restoreUserSettings() {
    try {
        const st = await chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_original_profile', 'saved_lists']);
        const snapshot = st.xpider_owner_backup_snapshot || st.xpider_owner_original_profile;
        if (!snapshot && (!Array.isArray(st.saved_lists) || st.saved_lists.length === 0)) {
            showAutoSetupFeedback('No previous settings or list backup found to restore.', 'warn');
            return;
        }

        // 1. Restore queue (filter out test fixtures to guarantee zero loopback remnants)
        const isLoopback = (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(typeof u === 'string' ? u : (u?.url || ''));
        let qRestored = [];
        if (snapshot && Array.isArray(snapshot.queue) && snapshot.queue.length > 0) {
            qRestored = snapshot.queue.filter(u => !isLoopback(u));
        }
        if (qRestored.length === 0 && st.xpider_owner_original_profile && Array.isArray(st.xpider_owner_original_profile.queue)) {
            qRestored = st.xpider_owner_original_profile.queue.filter(u => !isLoopback(u));
        }
        if (qRestored.length === 0 && Array.isArray(st.saved_lists) && st.saved_lists.length > 0 && Array.isArray(st.saved_lists[0].urls)) {
            qRestored = st.saved_lists[0].urls.filter(u => !isLoopback(u));
        }

        campaignQueue = [...qRestored];
        totalTargets = (snapshot && snapshot.totalTargets) ? snapshot.totalTargets : campaignQueue.length;

        // 2. Restore template
        const tpl = snapshot?.template || st.xpider_owner_original_profile?.template;
        if (tpl) {
            const elFn = document.getElementById('tpl-first-name'); if (elFn && tpl.firstName !== undefined) elFn.value = tpl.firstName;
            const elLn = document.getElementById('tpl-last-name'); if (elLn && tpl.lastName !== undefined) elLn.value = tpl.lastName;
            const elN = document.getElementById('tpl-name'); if (elN && tpl.name !== undefined) elN.value = tpl.name;
            const elEm = document.getElementById('tpl-email'); if (elEm && tpl.email !== undefined) elEm.value = tpl.email;
            const elPh = document.getElementById('tpl-phone'); if (elPh && tpl.phone !== undefined) elPh.value = tpl.phone;
            const elSub = document.getElementById('tpl-subject'); if (elSub && tpl.subject !== undefined) elSub.value = tpl.subject;
            const elMsg = document.getElementById('tpl-message'); if (elMsg && tpl.message !== undefined) elMsg.value = tpl.message;
            const elWeb = document.getElementById('tpl-website'); if (elWeb && tpl.website !== undefined) elWeb.value = tpl.website;
            currentTpl = { ...tpl };
        }

        // 3. Restore delays & settings
        const restoredSettings = {
            xpider_queue: campaignQueue,
            xpider_total: totalTargets,
            xpider_owner_function_test_mode: false,
            xpider_cloudflare_live_test: false,
            xpider_delayMs: snapshot?.settings?.xpider_delayMs || 3000,
            xpider_fillDelayMs: snapshot?.settings?.xpider_fillDelayMs || 50,
            xpider_submitDelayMs: snapshot?.settings?.xpider_submitDelayMs || 1000,
            xpider_skip_attempted: snapshot?.settings?.xpider_skip_attempted !== undefined ? snapshot.settings.xpider_skip_attempted : true,
            xpider_double_submit: Boolean(snapshot?.settings?.xpider_double_submit)
        };
        if (currentTpl && Object.keys(currentTpl).length > 0) {
            restoredSettings.xpider_tpl = currentTpl;
        }

        if (snapshot?.settings?.xpider_strict_privacy !== undefined) {
            restoredSettings.xpider_strict_privacy = snapshot.settings.xpider_strict_privacy;
        }
        if (snapshot?.settings?.xpider_privacy_transport !== undefined) {
            restoredSettings.xpider_privacy_transport = snapshot.settings.xpider_privacy_transport;
        }
        if (snapshot?.settings?.xpider_active_campaign_run_id !== undefined) {
            restoredSettings.xpider_active_campaign_run_id = snapshot.settings.xpider_active_campaign_run_id;
        }

        // 4. Remove DNR network guard and verify response
        try {
            const guardRes = await chrome.runtime.sendMessage({ action: 'REMOVE_OWNER_TEST_GUARD' });
            if (guardRes && guardRes.success) {
                console.log('[OWNER_TEST_GUARD] removed=true verified=true');
                addLog('[OWNER_TEST_GUARD] removed=true verified=true', 'info');
            } else {
                console.warn('[OWNER_TEST_GUARD_REMOVE_WARN]', guardRes?.error);
            }
        } catch (gErr) {
            console.warn('[RESTORE_GUARD_REMOVE_ERROR]', gErr);
        }

        // 5. Cleanup owner test run in background
        try {
            await chrome.runtime.sendMessage({
                action: 'CLEANUP_OWNER_FUNCTIONAL_TEST_RUN',
                previousRunId: snapshot?.settings?.xpider_active_campaign_run_id
            });
        } catch (_) {}

        // 6. Write back restored settings to storage (Preserve xpider_owner_original_profile)
        await chrome.storage.local.set(restoredSettings);
        await chrome.storage.local.remove([
            'xpider_owner_backup_snapshot',
            'xpider_active_test_source',
            'xpider_cloudflare_live_test',
            'xpider_owner_function_test_mode_active',
            'xpider_test_mode_state',
            'xpider_paused_checkpoint'
        ]);

        // 7. Synchronize live DOM controls
        const skipToggle = document.getElementById('skip-attempted-toggle');
        if (skipToggle && snapshot?.settings?.xpider_skip_attempted !== undefined) {
            skipToggle.checked = Boolean(snapshot.settings.xpider_skip_attempted);
            skipToggle.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const doubleSubmitToggle = document.getElementById('double-submit-toggle');
        if (doubleSubmitToggle && snapshot?.settings?.xpider_double_submit !== undefined) {
            doubleSubmitToggle.checked = Boolean(snapshot.settings.xpider_double_submit);
            doubleSubmitToggle.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 8. Re-render UI list & counts
        renderUrlsPreview(campaignQueue);
        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) countDisplay.textContent = `${totalTargets} URLs found`;
        const filenameDisplay = document.getElementById('filename-display');
        const restoredName = snapshot?.filename || (totalTargets > 0 ? 'Restored Public List' : 'No file selected');
        if (filenameDisplay) filenameDisplay.textContent = restoredName;

        const oftToggle = document.getElementById('owner-function-test-toggle');
        if (oftToggle) oftToggle.checked = false;
        const oftBanner = document.getElementById('owner-function-test-banner');
        if (oftBanner) oftBanner.style.display = 'none';

        // 9. Reset terminal UI state and restore Start button to idle actionable
        campaignActive = false;
        campaignPaused = false;
        _isCampaignLaunching = false;
        restoreStartButton();

        updateRealTimeStatus({
            totalTargets,
            remainingCount: totalTargets,
            completedCount: 0,
            successCount: 0,
            skippedCount: 0,
            failedCount: 0
        });
        updateProgress(0);
        const statusTitle = document.getElementById('status-title');
        if (statusTitle) statusTitle.textContent = "Live Progress (Ready)";
        const statusDetail = document.getElementById('status-detail');
        if (statusDetail) statusDetail.textContent = totalTargets > 0 ? `Restored ${totalTargets} targets for normal campaign dispatch.` : 'Ready to load target URLs.';

        if (typeof _renderHistoryPanel === 'function') {
            await _renderHistoryPanel();
        }

        updateAutoSetupUI('STANDBY');
        showAutoSetupFeedback(`↩ Restored previous list (${campaignQueue.length} URLs), template, and settings successfully.`, 'info');
        addLog(`↩ [RESTORE] Restored previous ${campaignQueue.length} URLs, template, and settings from snapshot.`, 'info');

        // Immediate fail-closed privacy readiness reconciliation after RESTORE
        if (typeof reconcilePrivacyReadiness === 'function') {
            await reconcilePrivacyReadiness({ force: true, reason: 'POST_RESTORE' });
        }
        if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
            await window.checkAndRefreshPrivacyReadinessHUD();
        }
    } catch (err) {
        console.error('[RESTORE_EXCEPTION]', err);
        showAutoSetupFeedback('RESTORE FAILED — ' + err.message, 'error');
    }
}

function getBadgeTextFromBuildInfo(info) {
    if (!info) return 'OWNER BETA V7.0.0-RC7';
    let ver = 'V7.0.0-RC7';
    if (info.tag) {
        ver = info.tag.toUpperCase();
    } else {
        const m = (info.buildId || '').match(/(?:V|R)\d+\.\d+(?:\.\d+)?[A-Za-z0-9\.\-]*/i);
        if (m) ver = m[0];
    }
    const sha = info.implementationHeadShort || info.headShort || (info.implementationHead ? info.implementationHead.substring(0, 8) : 'rc7');
    return `OWNER BETA ${ver} [${sha}]`;
}

function initBuildProvenanceBadge() {
    if (typeof document === 'undefined') return;
    const badge = document.getElementById('build-provenance-badge');
    const localInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
        ? BuildProvenance.BUILD_INFO
        : null;
    if (badge && localInfo) {
        badge.textContent = getBadgeTextFromBuildInfo(localInfo);
        badge.title = `PRIVATE OWNER BETA — DEBUG TELEMETRY ENABLED: ${localInfo.buildId} | SHA: ${localInfo.head} | Branch: ${localInfo.branch}`;
        badge.style.background = 'rgba(168, 85, 247, 0.2)';
        badge.style.color = '#c084fc';
        badge.style.borderColor = 'rgba(168, 85, 247, 0.5)';
    }

    const navChannel = document.querySelector('.nav-channel-badge');
    if (navChannel) {
        navChannel.textContent = '● PRIVATE OWNER BETA — DEBUG TELEMETRY ENABLED';
        navChannel.title = 'Private Owner Beta — Debug Telemetry Enabled';
    }

    // [R6.9G.10.3.3 & RC3.27 Directive 4] Non-fatal, bounded retry on transient boot race
    // Never overwrite the local authoritative badge with synthetic/fallback data
    verifyBuildHandshake({ retryOnTransient: true, maxRetries: 3, retryDelayMs: 250 }).then((res) => {
        if (badge && res && res.ok && res.state === 'MATCH' && res.bgInfo) {
            const b = res.bgInfo;
            badge.textContent = getBadgeTextFromBuildInfo(b);
            badge.title = `PRIVATE OWNER BETA — DEBUG TELEMETRY ENABLED: ${b.buildId} | SHA: ${b.implementationHead || b.head} | Branch: ${b.branch}`;
            badge.style.background = 'rgba(168, 85, 247, 0.2)';
            badge.style.color = '#c084fc';
            badge.style.borderColor = 'rgba(168, 85, 247, 0.5)';
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

let _isCampaignLaunching = false;

function restoreStartButton() {
    _isCampaignLaunching = false;
    campaignActive = false;
    const btn = document.getElementById('start-btn');
    const manualBtn = document.getElementById('start-manual-btn');
    const startRow = document.getElementById('start-buttons-row');
    if (startRow) startRow.classList.remove('hidden');
    if (btn) {
        btn.classList.remove('hidden');
        btn.disabled = false;
        btn.removeAttribute('data-build-locked');
        btn.textContent = "🚀 Start Automatic";
        btn.title = "";
    }
    if (manualBtn) {
        manualBtn.classList.remove('hidden');
        manualBtn.disabled = false;
        manualBtn.removeAttribute('data-build-locked');
        manualBtn.textContent = "🖐️ Start Manual";
        manualBtn.title = "";
    }
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
        window.checkAndRefreshPrivacyReadinessHUD();
    }
}
var _restoreStartButton = restoreStartButton;

async function launchCampaign(options = {}) {
    let currentStartStep = '01';
    const source = options.source || 'USER_START_BUTTON';
    const isOwnerTest = source.startsWith('OWNER_') || source.startsWith('CLOUDFLARE_');
    if (source === 'OWNER_CAPTCHA_LAB') {
        const labPanel = document.getElementById('captcha-lab-panel');
        if (labPanel) labPanel.style.display = 'block';
        try { chrome.storage.local.set({ xpider_active_test_source: 'OWNER_CAPTCHA_LAB' }); } catch (_) {}
    } else if (isOwnerTest) {
        try { chrome.storage.local.set({ xpider_active_test_source: source }); } catch (_) {}
    }
    const startBtn = document.getElementById('start-btn');
    const btnId = isOwnerTest
        ? (source === 'OWNER_CORE_TEST' ? 'run-function-test-btn' : (source === 'OWNER_CAPTCHA_LAB' ? 'run-captcha-lab-btn' : 'run-full-test-btn'))
        : 'start-btn';

    console.log(`[BUTTON_CLICK] id=${btnId}`);
    const gateState = (typeof currentStartGateState !== 'undefined' && currentStartGateState)
        ? currentStartGateState
        : (startBtn && startBtn.hasAttribute('data-build-locked') ? 'LOCKED_MISMATCH' : 'READY');
    console.log(`[START_GATE] state=${gateState}`);

    // Serialize launch to one active run (anti-race single-flight)
    if (_isCampaignLaunching || (typeof campaignActive !== 'undefined' && campaignActive)) {
        console.warn(`[START_DISPATCH] accepted=false reason=ALREADY_IN_FLIGHT source=${source}`);
        return { success: false, reason: 'ALREADY_IN_FLIGHT' };
    }
    _isCampaignLaunching = true;

    // [RC3.60 .87] Outer restoreStartButton is used

    try {
        // [START_STEP 01] BUTTON_ACCEPTED
        console.log(`[START_STEP] 01 BUTTON_ACCEPTED id=${btnId} source=${source}`);
        addLog(`[START_STEP] 01 BUTTON_ACCEPTED source=${source}`, 'info');

        if (startBtn && startBtn.hasAttribute('data-build-locked')) {
            const lockReason = startBtn.title || 'data-build-locked present';
            console.warn(`[START_DISPATCH] accepted=false reason=LOCKED_MISMATCH detail=${lockReason}`);
            addLog(`⚠️ [START_DISPATCH] Launch blocked: build locked (${lockReason}). Please reload extension.`, 'warn');
            _restoreStartButton();
            return { success: false, reason: 'LOCKED_MISMATCH', detail: lockReason };
        }

        // [START_STEP 02] BUILD_HANDSHAKE_PASS
        currentStartStep = '02';
        const handshake = await verifyBuildHandshake({ retryOnTransient: true, maxRetries: 2, retryDelayMs: 250 });
        if (!handshake.ok) {
            if (handshake.state === 'CONFIRMED_MISMATCH') {
                console.error(`[START_DISPATCH] accepted=false reason=RUNTIME_BUILD_MISMATCH error=${handshake.error}`);
                addLog(`❌ [START_DISPATCH] Runtime build mismatch: ${handshake.error}`, 'error');
                alert(`❌ CANNOT START CAMPAIGN: RUNTIME BUILD MISMATCH\n\n${handshake.error || 'Extension components are running different builds.'}\n\nPlease reload the extension.`);
                _restoreStartButton();
                return { success: false, reason: 'RUNTIME_BUILD_MISMATCH', error: handshake.error };
            } else {
                console.error(`[START_DISPATCH] accepted=false reason=BACKGROUND_UNREACHABLE error=${handshake.error}`);
                addLog(`⚠️ [START_DISPATCH] Background service worker did not respond. Click Start again to wake it.`, 'warn');
                _restoreStartButton();
                return { success: false, reason: 'BACKGROUND_UNREACHABLE', error: handshake.error };
            }
        }
        console.log('[START_STEP] 02 BUILD_HANDSHAKE_PASS');
        addLog('[START_STEP] 02 BUILD_HANDSHAKE_PASS', 'info');

        // [START_STEP 03] MODE_RECONCILE_PASS
        currentStartStep = '03';
        const EXPLICIT_TEST_SOURCES = ['OWNER_CORE_TEST', 'OWNER_CAPTCHA_LAB', 'OWNER_FULL_TEST', 'CLOUDFLARE_TESTKEY_LAB'];
        const isExplicitTest = EXPLICIT_TEST_SOURCES.includes(source);
        const isLiveOwnerCf = (source === 'CLOUDFLARE_LIVE_OWNER');
        const isTestKeyLab = (source === 'CLOUDFLARE_TESTKEY_LAB');
        const isNormalRun = (source === 'USER_START_BUTTON' || (!isExplicitTest && !isLiveOwnerCf));

        if ((!campaignQueue || campaignQueue.length === 0) && (!options.fixtures || options.fixtures.length === 0)) {
            try {
                const qSt = await chrome.storage.local.get(['xpider_queue', 'xpider_total']);
                if (Array.isArray(qSt.xpider_queue) && qSt.xpider_queue.length > 0) {
                    campaignQueue = [...qSt.xpider_queue];
                    if (!totalTargets) totalTargets = qSt.xpider_total || campaignQueue.length;
                }
            } catch (_) {}
        }

        const isLoopbackCheck = (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(typeof u === 'string' ? u : (u?.url || ''));
        const queueToCheck = (Array.isArray(options.fixtures) && options.fixtures.length > 0) ? options.fixtures : campaignQueue;
        const publicTargetsCount = (Array.isArray(queueToCheck) ? queueToCheck : []).filter(u => !isLoopbackCheck(u)).length;

        let assignedNormalRunId = null;

        // [R6.9G.10.3.7.1.4.11 Normal Start Auto-Exit & Mode Reconcile]
        if (isNormalRun) {
            const curSt = await chrome.storage.local.get([
                'xpider_owner_function_test_mode',
                'xpider_active_test_source',
                'xpider_cloudflare_live_test',
                'xpider_paused_checkpoint',
                'xpider_active_campaign_run_id'
            ]);
            const staleOwnerTestMode = Boolean(
                curSt.xpider_owner_function_test_mode ||
                curSt.xpider_active_test_source ||
                curSt.xpider_cloudflare_live_test
            );

            if (staleOwnerTestMode || publicTargetsCount > 0) {
                // Atomically exit all Owner test modes BEFORE validation
                await chrome.storage.local.set({
                    xpider_owner_function_test_mode: false,
                    xpider_cloudflare_live_test: false
                });
                await chrome.storage.local.remove([
                    'xpider_active_test_source',
                    'xpider_owner_function_test_mode_active',
                    'xpider_test_mode_state'
                ]);

                // Clear only test-run transient state/checkpoint, never public queue/history
                if (curSt.xpider_paused_checkpoint && (curSt.xpider_paused_checkpoint.ownerFunctionTestMode || curSt.xpider_paused_checkpoint.isTestMode)) {
                    await chrome.storage.local.remove(['xpider_paused_checkpoint']);
                }

                // Remove Owner Test DNR/session guard
                try {
                    const gRes = await chrome.runtime.sendMessage({ action: 'REMOVE_OWNER_TEST_GUARD' });
                    if (gRes && gRes.success) {
                        console.log('[OWNER_TEST_GUARD] removed=true');
                    }
                } catch (_) {}

                const oftToggle = document.getElementById('owner-function-test-toggle');
                if (oftToggle) oftToggle.checked = false;
                const oftBanner = document.getElementById('owner-function-test-banner');
                if (oftBanner) oftBanner.style.display = 'none';

                console.log(`[MODE_RECONCILE] source=USER_START_BUTTON staleOwnerTestMode=${staleOwnerTestMode} action=AUTO_EXIT_TEST_MODE`);
                console.log('[OWNER_TEST_GUARD] removed=true');
                addLog(`[MODE_RECONCILE] source=USER_START_BUTTON staleOwnerTestMode=${staleOwnerTestMode} action=AUTO_EXIT_TEST_MODE`, 'info');
                addLog('[OWNER_TEST_GUARD] removed=true', 'info');
            }

            console.log(`[NORMAL_CAMPAIGN_PREFLIGHT] publicTargets=${publicTargetsCount} testMode=false result=PASS`);
            addLog(`[NORMAL_CAMPAIGN_PREFLIGHT] publicTargets=${publicTargetsCount} testMode=false result=PASS`, 'info');

            // [Directive E] Rebase current-run counters & generate fresh normal campaignRunId
            const oldRunId = curSt.xpider_active_campaign_run_id || 'none';
            assignedNormalRunId = `normal_run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            
            await chrome.storage.local.set({
                xpider_active_campaign_run_id: assignedNormalRunId,
                xpider_active_test_source: null
            });

            const qCount = Array.isArray(campaignQueue) ? campaignQueue.length : 0;
            totalTargets = qCount;
            successCount = 0;

            const countCompleted = document.getElementById('completed-count-display') || document.getElementById('completed-count');
            const countRemaining = document.getElementById('remaining-count-display') || document.getElementById('remaining-count');
            const countSuccess = document.getElementById('success-count-display') || document.getElementById('success-count');
            const countFail = document.getElementById('failed-count-display') || document.getElementById('fail-count');
            const countTimeout = document.getElementById('timeout-count-display') || document.getElementById('timeout-count');
            const countUnknown = document.getElementById('unknown-count-display') || document.getElementById('unknown-count');
            const countSkipped = document.getElementById('skipped-count-display') || document.getElementById('skipped-count');
            const countCaptchaFail = document.getElementById('captcha-failed-display') || document.getElementById('captcha-failures-count');
            const progressBar = document.getElementById('progress-bar');
            const progressPct = document.getElementById('progress-text') || document.getElementById('progress-pct');
            const runScopeBadge = document.getElementById('run-scope-badge');
            const statusTitle = document.getElementById('status-title');
            const statusDetail = document.getElementById('status-detail');

            if (countCompleted) countCompleted.textContent = '0';
            if (countRemaining) countRemaining.textContent = String(qCount);
            if (countSuccess) countSuccess.textContent = '0';
            if (countFail) countFail.textContent = '0';
            if (countTimeout) countTimeout.textContent = '0';
            if (countUnknown) countUnknown.textContent = '0';
            if (countSkipped) countSkipped.textContent = '0';
            if (countCaptchaFail) countCaptchaFail.textContent = '0';
            if (progressBar) progressBar.style.width = '0%';
            if (progressPct) progressPct.textContent = '0%';
            if (runScopeBadge) runScopeBadge.textContent = 'PUBLIC RUN';
            if (statusTitle) statusTitle.textContent = "Live Progress (Ready)";
            if (statusDetail) statusDetail.textContent = `Queued ${qCount} targets for normal campaign dispatch.`;

            console.log(`[NORMAL_RUN_STATE_REBASE] oldRunId=${oldRunId} newRunId=${assignedNormalRunId} total=${qCount} historyPreserved=true`);
            addLog(`[NORMAL_RUN_STATE_REBASE] oldRunId=${oldRunId} newRunId=${assignedNormalRunId} total=${qCount} historyPreserved=true`, 'info');
        }

        console.log('[START_STEP] 03 MODE_RECONCILE_PASS');
        addLog('[START_STEP] 03 MODE_RECONCILE_PASS', 'info');

        // Test mode is active ONLY for explicit test sources
        const isTestModeActive = isExplicitTest;

        if (isLiveOwnerCf) {
            // Live Owner Test Mode: public HTTPS target, mock provider locked out, loopback strictly refused
            await chrome.storage.local.set({
                xpider_owner_function_test_mode: false,
                xpider_cloudflare_live_test: true,
                xpider_active_test_source: 'CLOUDFLARE_LIVE_OWNER'
            });
            if (Array.isArray(options.fixtures) && options.fixtures.length > 0) {
                campaignQueue = [...options.fixtures];
                totalTargets = campaignQueue.length;
                renderUrlsPreview(campaignQueue);
                const countDisplay = document.getElementById('url-count-display');
                if (countDisplay) countDisplay.textContent = `${totalTargets} URLs loaded (Cloudflare Live)`;
                await chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_total: totalTargets });
            }
        }

        if (isTestModeActive) {
            const srvCheck = await probeAndEnsureOwnerTestServer();
            if (!srvCheck.success) {
                console.error('[START_DISPATCH] accepted=false reason=TEST_SERVER_UNAVAILABLE');
                showAutoSetupFeedback('LAUNCH FAILED — Local test server (127.0.0.1:8088) is unavailable.', 'error');
                _restoreStartButton();
                return { success: false, reason: 'TEST_SERVER_UNAVAILABLE' };
            }

            // Verify DNR network guard
            let guardOk = false;
            try {
                const guardRes = await chrome.runtime.sendMessage({
                    action: 'INSTALL_OWNER_TEST_GUARD',
                    options: { allowCloudflareChallenges: isTestKeyLab }
                });
                if (guardRes && guardRes.success) guardOk = true;
            } catch (gErr) {
                console.warn('[START_GUARD_WARN]', gErr);
            }
            if (!guardOk) {
                console.error('[START_DISPATCH] accepted=false reason=DNR_GUARD_FAILED');
                showAutoSetupFeedback('LAUNCH FAILED — Could not verify DeclarativeNetRequest network guard.', 'error');
                _restoreStartButton();
                return { success: false, reason: 'DNR_GUARD_FAILED' };
            }

            // If fixtures specified in options, set campaignQueue
            if (Array.isArray(options.fixtures) && options.fixtures.length > 0) {
                campaignQueue = [...options.fixtures];
                totalTargets = campaignQueue.length;
                renderUrlsPreview(campaignQueue);
                const countDisplay = document.getElementById('url-count-display');
                if (countDisplay) {
                    const label = source === 'OWNER_CAPTCHA_LAB' ? 'CAPTCHA Lab' : (source === 'CLOUDFLARE_TESTKEY_LAB' ? 'Cloudflare Test-Key Lab' : (source === 'OWNER_FULL_TEST' ? 'Full Test Suite' : 'Local Fixtures'));
                    countDisplay.textContent = `${totalTargets} URLs loaded (${label})`;
                }
            }

            // Prevent launching public URLs in test mode
            const isLoopback = (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(typeof u === 'string' ? u : (u?.url || ''));
            const nonLoopbackTargets = campaignQueue.filter(u => !isLoopback(u));
            if (nonLoopbackTargets.length > 0) {
                console.warn('[START_BLOCKED_TEST_MODE_PUBLIC_QUEUE]', nonLoopbackTargets.length);
                addLog(`🛡️ [START_BLOCKED] Owner Functional Test Mode is ON: ${nonLoopbackTargets.length} public non-loopback URLs cannot be started. Click '⚙️ AUTO SETUP' or '⏮️ RESTORE'.`, 'error');
                _restoreStartButton();
                alert('🛡️ [OWNER FUNCTIONAL TEST MODE ACTIVE]\n\nOnly local loopback URLs (127.0.0.1 or localhost) are allowed in Test Mode.\nFound ' + nonLoopbackTargets.length + ' public targets in queue.\n\nPlease click "⚙️ AUTO SETUP" to switch to the 7 test fixtures, or "⏮️ RESTORE" to turn off test mode.');
                return { success: false, reason: 'OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET' };
            }

            // Atomically prepare fresh test run scope and verify zero stale suppression
            const prepRes = await chrome.runtime.sendMessage({
                action: 'PREPARE_OWNER_FUNCTIONAL_TEST_RUN',
                fixtures: campaignQueue
            });

            if (!prepRes || !prepRes.success) {
                const errCode = prepRes?.error || 'PREPARE_OWNER_TEST_FAILED';
                console.error(`[START_DISPATCH] accepted=false reason=${errCode}`);
                if (errCode === 'OWNER_TEST_PRECONDITION_STALE_SUPPRESSION') {
                    showAutoSetupFeedback(`FAIL-CLOSED: OWNER_TEST_PRECONDITION_STALE_SUPPRESSION (stale=${prepRes.staleCount || 0})`, 'error');
                    alert(`🛑 [OWNER_TEST_PRECONDITION_STALE_SUPPRESSION]\n\nControlled test fixtures encountered stale visited/suppression state (${prepRes.staleCount || 0} items). Launch aborted fail-closed.`);
                } else {
                    showAutoSetupFeedback(`LAUNCH FAILED — ${errCode}`, 'error');
                }
                _restoreStartButton();
                return { success: false, reason: errCode, detail: prepRes };
            }

            // Verify invariant: executable fixture count == requested fixture count
            if (prepRes.executableCount !== campaignQueue.length || prepRes.staleCount > 0) {
                console.error(`[START_DISPATCH] accepted=false reason=OWNER_TEST_PRECONDITION_STALE_SUPPRESSION requested=${campaignQueue.length} executable=${prepRes.executableCount} stale=${prepRes.staleCount}`);
                alert(`🛑 [OWNER_TEST_PRECONDITION_STALE_SUPPRESSION]\n\nExecutable fixture count (${prepRes.executableCount}) does not match requested (${campaignQueue.length}). Launch aborted fail-closed.`);
                _restoreStartButton();
                return { success: false, reason: 'OWNER_TEST_PRECONDITION_STALE_SUPPRESSION' };
            }
        }

        // [START_STEP 04] QUEUE_VALID
        currentStartStep = '04';
        const manualInput = document.getElementById('manual-url-input');
        if (manualInput && manualInput.value.trim() && (!campaignQueue || campaignQueue.length === 0)) {
            await addSingleUrl();
        }
        if (!campaignQueue || campaignQueue.length === 0) {
            console.warn('[START_DISPATCH] accepted=false reason=EMPTY_QUEUE');
            addLog('⚠️ [START_BLOCKED_EMPTY_QUEUE] Target URL queue is empty. Load URLs before starting.', 'warn');
            alert('Please upload a file or enter a URL first.');
            _restoreStartButton();
            return { success: false, reason: 'EMPTY_QUEUE' };
        }

        // Test Mode Public URL Block & Max Target Limit
        if (isTestModeActive) {
            const isLoopback = (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(typeof u === 'string' ? u : (u?.url || ''));
            const nonLoopbackTargets = campaignQueue.filter(u => !isLoopback(u));
            if (nonLoopbackTargets.length > 0) {
                console.warn('[START_DISPATCH] accepted=false reason=OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET');
                addLog(`🛑 [START_BLOCKED] Owner Functional Test Mode is ON: ${nonLoopbackTargets.length} public non-loopback URLs cannot be started.`, 'error');
                alert(`🛑 [OWNER FUNCTIONAL TEST MODE ACTIVE]\n\nOnly local loopback URLs (127.0.0.1 or localhost) are allowed in Test Mode.\nFound ${nonLoopbackTargets.length} public targets in queue.`);
                _restoreStartButton();
                return { success: false, reason: 'OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET' };
            }

            const maxAllowed = source === 'OWNER_FULL_TEST' ? 30 : 10;
            if (campaignQueue.length > maxAllowed) {
                console.error(`[START_DISPATCH] accepted=false reason=OWNER_FUNCTION_TEST_EXCEEDED_MAX_TARGETS (${campaignQueue.length} > ${maxAllowed})`);
                alert(`🧪 OWNER FUNCTIONAL TEST MODE LIMITATION\n\nOwner Functional Test Mode allows a maximum of ${maxAllowed} targets.\nCurrently queued: ${campaignQueue.length} targets.`);
                _restoreStartButton();
                return { success: false, reason: 'OWNER_FUNCTION_TEST_EXCEEDED_MAX_TARGETS' };
            }
        }

        console.log(`[START_STEP] 04 QUEUE_VALID count=${campaignQueue.length}`);
        addLog(`[START_STEP] 04 QUEUE_VALID count=${campaignQueue.length}`, 'info');

        // [START_STEP 05] TEMPLATE_VALID
        currentStartStep = '05';
        const tplReady = await ensureTemplateReadyForStart();
        if (tplReady && tplReady.ready && tplReady.message) {
            const msgEl = document.getElementById('tpl-message');
            if (msgEl && !msgEl.value) msgEl.value = tplReady.message;
        }

        let activeMsg = document.getElementById('tpl-message')?.value || (tplReady?.message || '');
        if (isOwnerTest && (!activeMsg || !activeMsg.trim())) {
            activeMsg = "Automated test inquiry from XPIDER AutoForm Sender Pro (Local Functional Test Suite).";
            const msgEl = document.getElementById('tpl-message');
            if (msgEl) msgEl.value = activeMsg;
        }

        const consentStorage = await chrome.storage.local.get(['xpider_owner_authorized_consent']);
        const ownerAuthorizedConsent = Boolean(isOwnerTest || consentStorage.xpider_owner_authorized_consent);

        currentTpl = {
            firstName: document.getElementById('tpl-first-name')?.value || (isOwnerTest ? 'John' : ''),
            lastName: document.getElementById('tpl-last-name')?.value || (isOwnerTest ? 'Doe' : ''),
            name: document.getElementById('tpl-name')?.value || (isOwnerTest ? 'John Doe' : ''),
            email: document.getElementById('tpl-email')?.value || (isOwnerTest ? 'test.operator@example.com' : ''),
            phone: document.getElementById('tpl-phone')?.value || (isOwnerTest ? '555-0199' : ''),
            subject: document.getElementById('tpl-subject')?.value || (isOwnerTest ? 'Software Functional Test' : ''),
            message: activeMsg,
            website: isOwnerTest ? 'http://127.0.0.1:8088' : (document.getElementById('tpl-website')?.value || ''),
            ownerAuthorizedConsent: ownerAuthorizedConsent
        };

        if (!currentTpl.message || !currentTpl.message.trim()) {
            console.warn('[START_DISPATCH] accepted=false reason=EMPTY_MESSAGE');
            addLog('⚠️ [START_BLOCKED_EMPTY_MESSAGE] Message body is empty. Enter message content before starting.', 'warn');
            _restoreStartButton();
            switchToTemplateTabAndFocusMessage();
            return { success: false, reason: 'EMPTY_MESSAGE' };
        }

        try {
            bindCampaignTemplateMetadata(currentTpl);
            currentTpl.id = currentTpl.templateId;
            currentTpl.version = currentTpl.templateVersion;
        } catch (_) {}

        console.log('[START_STEP] 05 TEMPLATE_VALID');
        addLog('[START_STEP] 05 TEMPLATE_VALID', 'info');

        // UI state: STARTING
        campaignPaused = false;
        successCount = 0;
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = "⏳ Starting...";
        }

        // Delay settings
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

        const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
        const fillMode = fillModeEl ? fillModeEl.value : 'instant';

        const skipAttemptedEl = document.getElementById('skip-attempted-toggle');
        const skipPreviouslyAttempted = isTestModeActive ? false : (skipAttemptedEl ? skipAttemptedEl.checked : true);

        const activeRunStorage = await chrome.storage.local.get(['xpider_active_campaign_run_id']);
        const resolvedRunId = isTestModeActive ? activeRunStorage.xpider_active_campaign_run_id : (assignedNormalRunId || activeRunStorage.xpider_active_campaign_run_id);

        const randomVariationToggle = document.getElementById('random-delay-toggle');
        const randomVariationActive = randomVariationToggle ? randomVariationToggle.checked : false;

        const requestedCampaignMode = (options.campaignMode === 'MANUAL') ? 'MANUAL' : 'AUTO';
        currentCampaignMode = requestedCampaignMode;
        window.__xpider_last_paused_mode = requestedCampaignMode;
        const modePill = document.getElementById('campaign-mode-pill');
        if (modePill) {
            modePill.textContent = `MODE: ${requestedCampaignMode}`;
            modePill.style.color = requestedCampaignMode === 'MANUAL' ? '#fbbf24' : '#38bdf8';
        }
        const startPayload = {
            queue: campaignQueue,
            template: currentTpl,
            delayMs,
            fillDelayMs,
            submitDelayMs,
            fillMode,
            randomVariation: randomVariationActive,
            templateId: currentTpl.templateId || 'default',
            templateVersion: currentTpl.templateVersion || 1,
            skipPreviouslyAttempted,
            overrideSkipAttempted: isTestModeActive ? true : false,
            ownerFunctionTestMode: isTestModeActive ? true : false,
            campaignRunId: resolvedRunId,
            campaignMode: requestedCampaignMode
        };
        try {
            bindCampaignTemplateMetadata(startPayload, currentTpl);
        } catch (_) {}

        // [START_STEP 06] PRIVACY_PREP_BEGIN
        currentStartStep = '06';
        const runScopedDirect = Boolean(options.runScopedDirectPrivacy);
        console.log(`[START_STEP] 06 PRIVACY_PREP_BEGIN runScopedDirect=${runScopedDirect} testMode=${isTestModeActive}`);
        addLog(`[START_STEP] 06 PRIVACY_PREP_BEGIN runScopedDirect=${runScopedDirect} testMode=${isTestModeActive}`, 'info');

        // [START_STEP 07] PRIVACY_PREP_PASS / BLOCK
        currentStartStep = '07';
        if (runScopedDirect) {
            console.log('[PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true');
            addLog('⚡ [PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true', 'warn');
            const ind = document.getElementById('privacy-override-indicator');
            if (ind) {
                ind.style.display = 'flex';
                ind.classList.remove('hidden');
            }
            console.log('[START_STEP] 07 PRIVACY_PREP_PASS mode=DIRECT (OVERRIDE)');
            addLog('[START_STEP] 07 PRIVACY_PREP_PASS mode=DIRECT (OVERRIDE)', 'info');
        } else if (!isTestModeActive) {
            const prepResponse = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: 'ENSURE_ENFORCED_PRIVACY_FOR_START',
                    options: { ownerFunctionTestMode: false }
                }, (res) => {
                    if (chrome.runtime.lastError) return resolve({ success: false, error: chrome.runtime.lastError.message });
                    resolve(res || { success: false, error: 'NO_RESPONSE_FROM_BACKGROUND' });
                });
            });
            const prepResult = (prepResponse && prepResponse.success && prepResponse.result) ? prepResponse.result : null;
            if (!prepResult || !prepResult.ready) {
                const reason = prepResult?.reason || prepResponse?.error || 'PRIVACY_START_BLOCKED';
                const mode = prepResult?.mode || 'PRIVACY_RELAY';
                const failClosed = prepResult?.failClosed !== false;
                const userMsg = prepResult?.userMessage || 'Strict Privacy is ON, but no healthy enforced transport was verified.';

                console.error(`[START_STEP] 07 PRIVACY_PREP_BLOCK reason=${reason}`);
                addLog(`[START_STEP] 07 PRIVACY_PREP_BLOCK reason=${reason}`, 'error');
                console.error(`[PRIVACY_START_BLOCKED] reason=${reason} mode=${mode} failClosed=${failClosed}`);
                addLog(`🛑 [PRIVACY_START_BLOCKED] reason=${reason} mode=${mode} failClosed=${failClosed}`, 'error');

                _restoreStartButton();
                if (typeof window.showPrivacyBlockDecisionModal === 'function') {
                    window.showPrivacyBlockDecisionModal({
                        reason,
                        userMessage: userMsg,
                        actionSection: prepResult?.actionSection,
                        mode,
                        failClosed,
                        source
                    });
                } else {
                    alert(`🛑 [PRIVACY GATE BLOCKED START]\n\nCampaign is ready, but Privacy Gate blocked network start.\n\nReason: ${reason}\n${userMsg}`);
                }
                return { success: false, reason: 'PRIVACY_START_BLOCKED', detail: prepResult };
            }
            console.log(`[START_STEP] 07 PRIVACY_PREP_PASS mode=${prepResult.mode || 'ENFORCED'}`);
            addLog(`[START_STEP] 07 PRIVACY_PREP_PASS mode=${prepResult.mode || 'ENFORCED'}`, 'info');
        } else {
            console.log('[START_STEP] 07 PRIVACY_PREP_PASS mode=TEST_LOOPBACK');
            addLog('[START_STEP] 07 PRIVACY_PREP_PASS mode=TEST_LOOPBACK', 'info');
        }

        // [START_STEP 08] DISPATCH_BEGIN
        currentStartStep = '08';
        console.log(`[START_STEP] 08 DISPATCH_BEGIN targetCount=${campaignQueue.length}`);
        addLog(`[START_STEP] 08 DISPATCH_BEGIN targetCount=${campaignQueue.length}`, 'info');

        console.log(`[START_DISPATCH] accepted=true source=${source} targetCount=${campaignQueue.length}`);
        addLog(`🚀 [START_DISPATCH] accepted=true source=${source} targetCount=${campaignQueue.length}`, 'info');

        const localInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
            ? BuildProvenance.BUILD_INFO
            : null;
        if (!localInfo) {
            addLog('❌ Local BuildProvenance is missing. Cannot dispatch campaign.', 'error');
            throw new Error('Local BuildProvenance is missing');
        }

        // [START_STEP 09] START_BG_ACK
        currentStartStep = '09';
        const startRes = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'START_CAMPAIGN',
                source: source,
                runScopedDirectPrivacy: runScopedDirect,
                expectedImplementationHead: localInfo.implementationHead,
                expectedBuildId: localInfo.buildId,
                expectedManifestVersion: Number((localInfo && localInfo.manifestVersion) || 3),
                queue: startPayload.queue,
                template: startPayload.template,
                delayMs: startPayload.delayMs,
                fillDelayMs: startPayload.fillDelayMs,
                submitDelayMs: startPayload.submitDelayMs,
                fillMode: startPayload.fillMode,
                templateId: startPayload.templateId,
                templateVersion: startPayload.templateVersion,
                skipPreviouslyAttempted: startPayload.skipPreviouslyAttempted,
                overrideSkipAttempted: startPayload.overrideSkipAttempted,
                ownerFunctionTestMode: startPayload.ownerFunctionTestMode,
                campaignRunId: startPayload.campaignRunId,
                campaignMode: startPayload.campaignMode
            }, (res) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                resolve(res);
            });
        });

        if (!startRes || startRes.success === false) {
            const reason = startRes?.reason || startRes?.error || 'REJECTED_BY_BACKGROUND';
            console.error(`[START_BG_REJECT] reason=${reason}`);
            addLog(`❌ [START_BG_REJECT] reason=${reason}`, 'error');
            alert(`Start rejected by background engine: ${reason}`);
            _restoreStartButton();
            return { success: false, reason };
        }

        console.log(`[START_STEP] 09 START_BG_ACK campaignRunId=${startRes.campaignRunId || 'unknown'}`);
        addLog(`[START_STEP] 09 START_BG_ACK campaignRunId=${startRes.campaignRunId || 'unknown'}`, 'info');

        // [START_STEP 10] CAMPAIGN_RUNNING
        currentStartStep = '10';
        campaignActive = true;
        campaignPaused = false;
        if (startBtn) startBtn.classList.add('hidden');
        const startManualBtn = document.getElementById('start-manual-btn');
        if (startManualBtn) startManualBtn.classList.add('hidden');
        const startRow = document.getElementById('start-buttons-row');
        if (startRow) startRow.classList.add('hidden');
        const multiActions = document.getElementById('multi-actions');
        if (multiActions) multiActions.classList.remove('hidden');

        if (isOwnerTest) {
            updateAutoSetupUI('RUNNING');
            const statusTitle = document.getElementById('status-title');
            if (statusTitle) statusTitle.textContent = "Live Progress (Running)";
            const statusDetail = document.getElementById('status-detail');
            if (statusDetail) statusDetail.textContent = `Campaign started (${source})...`;
        }

        console.log(`[START_STEP] 10 CAMPAIGN_RUNNING`);
        addLog(`[START_STEP] 10 CAMPAIGN_RUNNING`, 'info');

        return {
            success: true,
            source,
            targetCount: campaignQueue.length,
            campaignRunId: startRes.campaignRunId
        };
    } catch (err) {
        const stepNum = currentStartStep || '00';
        const errName = err?.name || 'Error';
        const errMsg = (err?.message || String(err)).replace(/[\r\n]+/g, ' ');
        console.error(`[START_EXCEPTION] step=${stepNum} name=${errName} message=${errMsg}`);
        addLog(`❌ [START_EXCEPTION] step=${stepNum} name=${errName} message=${errMsg}`, 'error');
        alert(`❌ CAMPAIGN START FAILED [Step ${stepNum}]\n\n${errMsg}\n\nPlease check logs and try again.`);
        _restoreStartButton();
        return { success: false, reason: 'START_EXCEPTION', step: stepNum, error: errMsg };
    } finally {
        _isCampaignLaunching = false;
    }
}

async function startCampaign() {
    return launchCampaign({ source: 'USER_START_BUTTON' });
}

function togglePause() {
    const btn = document.getElementById('pause-btn');
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};

    // [V7-RC5 Directive #6522457298 Item 3] When already paused, prompt for Resume Mode (Automatic or Manual); Cancel preserves paused state!
    if (campaignPaused || window.__xpider_has_paused_checkpoint) {
        promptResumeCampaignMode();
        return;
    }

    campaignPaused = true;
    window.__xpider_last_paused_mode = currentCampaignMode || 'AUTO';
    addDiagnosticLog('[Engine][TX] action=PAUSE_CAMPAIGN');
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'PAUSE_CAMPAIGN' }).catch(e => console.error('[Pause Ext Error]', e));
    }

    if (btn) {
        btn.textContent = dict.btn_resume || "▶️ Resume";
        btn.style.backgroundColor = "#22c55e";
    }
    refreshStatusDetailUI();
}

function stopCampaign() {
    campaignActive = false;
    campaignPaused = false;
    _isCampaignLaunching = false;
    const startRow = document.getElementById('start-buttons-row');
    if (startRow) startRow.classList.remove('hidden');
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.classList.remove('hidden');
        startBtn.disabled = false;
        startBtn.textContent = "🚀 Start Automatic";
    }
    const startManualBtn = document.getElementById('start-manual-btn');
    if (startManualBtn) {
        startManualBtn.classList.remove('hidden');
        startManualBtn.disabled = false;
        startManualBtn.textContent = "🖐️ Start Manual";
    }
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    const ind = document.getElementById('privacy-override-indicator');
    if (ind) {
        ind.style.display = 'none';
        ind.classList.add('hidden');
    }
    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
        window.checkAndRefreshPrivacyReadinessHUD();
    }
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
    _isCampaignLaunching = false;
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.classList.remove('hidden');
        startBtn.disabled = false;
        startBtn.textContent = (typeof dict !== 'undefined' && dict.btn_start) || "🚀 START SENDING";
    }
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    const banner = document.getElementById('resumable-campaign-banner');
    if (banner) {
        banner.style.display = 'none';
        banner.classList.add('hidden');
    }
    const ind = document.getElementById('privacy-override-indicator');
    if (ind) {
        ind.style.display = 'none';
        ind.classList.add('hidden');
    }
    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
        window.checkAndRefreshPrivacyReadinessHUD();
    }
    addDiagnosticLog(`[Engine][TX] action=END_CAMPAIGN`);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'END_CAMPAIGN' }, () => {
            checkResumableCheckpoint();
        });
    }
    addLog("🛑 Campaign ended. Remaining queue discarded.", "stop");
}

function applyResumeModeSelectionUI(selectedMode, previousMode) {
    const normSel = (selectedMode === 'MANUAL') ? 'MANUAL' : 'AUTO';
    const normPrev = (previousMode === 'MANUAL') ? 'MANUAL' : 'AUTO';
    const radioAuto = document.getElementById('resume-mode-radio-auto');
    const radioManual = document.getElementById('resume-mode-radio-manual');
    const optAuto = document.getElementById('resume-mode-option-auto');
    const optManual = document.getElementById('resume-mode-option-manual');
    const tagAuto = document.getElementById('resume-mode-auto-default-tag');
    const tagManual = document.getElementById('resume-mode-manual-default-tag');
    const prevBadge = document.getElementById('resume-mode-prev-badge');

    if (radioAuto) radioAuto.checked = (normSel === 'AUTO');
    if (radioManual) radioManual.checked = (normSel === 'MANUAL');
    if (optAuto) optAuto.style.borderColor = (normSel === 'AUTO') ? '#38bdf8' : 'rgba(148, 163, 184, 0.3)';
    if (optManual) optManual.style.borderColor = (normSel === 'MANUAL') ? '#38bdf8' : 'rgba(148, 163, 184, 0.3)';
    if (tagAuto) tagAuto.style.display = (normPrev === 'AUTO') ? 'inline' : 'none';
    if (tagManual) tagManual.style.display = (normPrev === 'MANUAL') ? 'inline' : 'none';
    if (prevBadge) prevBadge.textContent = `PREV: ${normPrev}`;
}

function wireResumeModeModalOnce() {
    const modal = document.getElementById('resume-mode-modal-overlay');
    if (!modal || modal.dataset.wired === 'true') return;
    modal.dataset.wired = 'true';

    const radioAuto = document.getElementById('resume-mode-radio-auto');
    const radioManual = document.getElementById('resume-mode-radio-manual');
    const cancelBtn = document.getElementById('cancel-resume-mode-btn');
    const confirmBtn = document.getElementById('confirm-resume-mode-btn');

    if (radioAuto) {
        radioAuto.addEventListener('change', () => {
            if (radioAuto.checked) applyResumeModeSelectionUI('AUTO', window.__xpider_last_paused_mode || currentCampaignMode || 'AUTO');
        });
    }
    if (radioManual) {
        radioManual.addEventListener('change', () => {
            if (radioManual.checked) applyResumeModeSelectionUI('MANUAL', window.__xpider_last_paused_mode || currentCampaignMode || 'AUTO');
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => cancelResumeCampaignModal());
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const chosen = (radioManual && radioManual.checked) ? 'MANUAL' : 'AUTO';
            confirmResumeCampaignWithMode(chosen);
        });
    }
}

function promptResumeCampaignMode(defaultModeOverride) {
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
}

function cancelResumeCampaignModal() {
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
}

function confirmResumeCampaignWithMode(selectedMode) {
    const targetMode = (selectedMode === 'MANUAL') ? 'MANUAL' : ((selectedMode === 'AUTO') ? 'AUTO' : (window.__xpider_last_paused_mode || currentCampaignMode || 'AUTO'));
    const modal = document.getElementById('resume-mode-modal-overlay');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    currentCampaignMode = targetMode;
    const modePill = document.getElementById('campaign-mode-pill');
    if (modePill) {
        modePill.textContent = targetMode === 'MANUAL' ? 'MODE: MANUAL (HOLD FOR REGISTER)' : 'MODE: AUTO (CHALLENGE GATE)';
        modePill.style.color = targetMode === 'MANUAL' ? '#fbbf24' : '#38bdf8';
    }

    addDiagnosticLog(`[Engine][TX] action=RESUME_CAMPAIGN campaignMode=${targetMode}`);
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'RESUME_CAMPAIGN', campaignMode: targetMode }, (res) => {
            if (res && res.success) {
                campaignActive = true;
                campaignPaused = false;
                const banner = document.getElementById('resumable-campaign-banner');
                if (banner) {
                    banner.style.display = 'none';
                    banner.classList.add('hidden');
                }
                const startRow = document.getElementById('start-buttons-row');
                if (startRow) startRow.classList.add('hidden');
                const startBtn = document.getElementById('start-btn');
                if (startBtn) startBtn.classList.add('hidden');
                const startManualBtn = document.getElementById('start-manual-btn');
                if (startManualBtn) startManualBtn.classList.add('hidden');
                const multiActions = document.getElementById('multi-actions');
                if (multiActions) multiActions.classList.remove('hidden');
                const pauseBtn = document.getElementById('pause-btn');
                const lang = document.getElementById('language-select')?.value || 'en';
                const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                if (pauseBtn) {
                    pauseBtn.textContent = dict.btn_pause || "⏸️ Pause";
                    pauseBtn.style.backgroundColor = "#f59e0b";
                }
                const statusBox = document.getElementById('status-box');
                if (statusBox) statusBox.classList.remove('hidden');
                refreshStatusDetailUI();
                addLog(`▶️ Campaign resumed in ${targetMode} mode (${res.remainingCount} remaining).`, "start");
            } else {
                addLog(`❌ Resume failed: ${res?.error || 'Unknown error'}`, "error");
            }
        });
    }
    return { confirmed: true, campaignMode: targetMode };
}

function resumeCampaign(explicitMode) {
    if (explicitMode === 'AUTO' || explicitMode === 'MANUAL') {
        return confirmResumeCampaignWithMode(explicitMode);
    }
    promptResumeCampaignMode();
}

if (typeof window !== 'undefined') {
    window.promptResumeCampaignMode = promptResumeCampaignMode;
    window.cancelResumeCampaignModal = cancelResumeCampaignModal;
    window.confirmResumeCampaignWithMode = confirmResumeCampaignWithMode;
    window.resumeCampaign = resumeCampaign;
    window.togglePause = togglePause;
}

function discardCheckpoint() {
    endCampaign();
}

function checkResumableCheckpoint() {
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

    updateRealTimeStatus({ successCount: 0, failedCount: 0, completedCount: 0, remainingCount: 0, totalTargets: 0, skippedCount: 0, timeoutCount: 0, deliveryUnknownCount: 0 });
    updateProgress(0);
    ['stat-success-count', 'stat-failed-count', 'stat-completed-count', 'stat-remaining-count',
     'success-count-display', 'failed-count-display', 'completed-count-display', 'remaining-count-display',
     'skipped-count-display', 'timeout-count-display', 'unknown-count-display',
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
        const privKeepRelayToggle = document.getElementById('privacy-keep-relay-enforced-toggle');
        const privHostEl = document.getElementById('privacy-proxy-host');
        const privPortEl = document.getElementById('privacy-proxy-port');
        const privUserEl = document.getElementById('privacy-proxy-user');
        const privPassEl = document.getElementById('privacy-proxy-pass');
        const privRememberEl = document.getElementById('privacy-proxy-remember-pass');
        const privVpnCheckbox = document.getElementById('privacy-vpn-confirm-checkbox');
        const privVpnBadge = document.getElementById('privacy-vpn-status-badge');
        const privRelayModeEl = document.getElementById('privacy-relay-mode-select');
        const privPhysGateToggle = document.getElementById('physical-gate-toggle');
        const isVpnConfirmed = (privVpnBadge && privVpnBadge.textContent && privVpnBadge.textContent.includes('CONFIRMED')) || (privVpnCheckbox && privVpnCheckbox.checked);

        const privacyConfig = {
            enabled: privToggle ? privToggle.checked : true,
            transportMode: privModeSelect ? privModeSelect.value : 'SYSTEM_VPN',
            failClosed: privFailClosedToggle ? privFailClosedToggle.checked : true,
            keepPrivacyRelayEnforcedBetweenCampaigns: privKeepRelayToggle ? privKeepRelayToggle.checked : true,
            systemVpnConfirmed: (privModeSelect && (privModeSelect.value === 'SYSTEM_VPN' || privModeSelect.value === 'EXTERNAL_VPN_MONITOR')) ? !!isVpnConfirmed : false,
            proxyHost: privHostEl ? privHostEl.value.trim() : '',
            proxyPort: privPortEl ? (parseInt(privPortEl.value, 10) || 1080) : 1080,
            proxyUsername: privUserEl ? privUserEl.value.trim() : '',
            proxyPassword: (privRememberEl && privRememberEl.checked && privPassEl) ? privPassEl.value : (privPassEl ? privPassEl.value : ''),
            rememberPassword: privRememberEl ? privRememberEl.checked : false,
            relayHost: '127.0.0.1',
            relayProxyPort: 18988,
            relayControlPort: 18989,
            relayRotationMode: privRelayModeEl ? privRelayModeEl.value : 'FIXED',
            physicalGateEnabled: privPhysGateToggle ? privPhysGateToggle.checked : false
        };

        const ownerTestToggle = document.getElementById('owner-function-test-toggle');
        if (ownerTestToggle) {
            await chrome.storage.local.set({ xpider_owner_function_test_mode: ownerTestToggle.checked });
        }

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

        const autoRecoveryToggle = document.getElementById('form-assist-auto-recovery-toggle');
        const showAssistPopupToggle = document.getElementById('form-assist-show-popup-toggle');
        const captchaHandlingSelect = document.getElementById('captcha-default-handling-select');
        const showCaptchaPopupToggle = document.getElementById('captcha-show-choice-popup-toggle');

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
            // [Issue #6 RC3.22/RC3.23 UX Automation Settings]
            xpider_auto_recovery_first: autoRecoveryToggle ? autoRecoveryToggle.checked : true,
            xpider_show_manual_form_assist_popup: showAssistPopupToggle ? showAssistPopupToggle.checked : false,
            xpider_default_captcha_handling: captchaHandlingSelect ? captchaHandlingSelect.value : 'AUTO_FIRST',
            xpider_show_captcha_choice_popup: showCaptchaPopupToggle ? showCaptchaPopupToggle.checked : false,
            xpider_show_autofill_visual_confirm: document.getElementById('form-assist-show-visual-confirm-toggle') ? document.getElementById('form-assist-show-visual-confirm-toggle').checked : true,
            xpider_automatic_provider_fallback: document.getElementById('captcha-provider-fallback-toggle') ? document.getElementById('captcha-provider-fallback-toggle').checked : false,
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
                if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                    window.checkAndRefreshPrivacyReadinessHUD();
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

            const totalImportRows = (stats && scopePref === 'currentRun' && stats.totalImportRows !== undefined) ? stats.totalImportRows : rows.length;
            const pending = (stats && scopePref === 'currentRun' && stats.pending !== undefined) ? stats.pending : rows.filter(r => r.status === 'PENDING').length;
            const invalid = (stats && scopePref === 'currentRun' && stats.invalid !== undefined) ? stats.invalid : rows.filter(r => r.status === 'INVALID_INPUT').length;
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
                    <span>Total Import Rows:</span><span><b>${totalImportRows}</b></span>
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
            if (changes.xpider_active_campaign_run_id || changes.xpider_isActive || changes.xpider_isPaused || changes.xpider_history_attempts || changes.xpider_history_rows) {
                console.log('[HISTORY_SCOPE_REFRESH] trigger=' + Object.keys(changes).filter(k => /^xpider_(active_campaign_run_id|isActive|isPaused|history_attempts|history_rows)$/.test(k)).join(','));
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

function setCampaignQueue(q) {
    campaignQueue = Array.isArray(q) ? [...q] : [];
    if (typeof updateQueueUI === 'function') updateQueueUI();
}
function getCampaignQueue() {
    return campaignQueue;
}

if (typeof window !== 'undefined') {
    try {
        Object.defineProperty(window, 'campaignQueue', {
            get() { return campaignQueue; },
            set(val) {
                campaignQueue = Array.isArray(val) ? [...val] : [];
            },
            configurable: true
        });
    } catch (_) {
        window.campaignQueue = campaignQueue;
    }
    window.launchCampaign = launchCampaign;
    window.startCampaign = startCampaign;
    window.restoreUserSettings = restoreUserSettings;
    window.setCampaignQueue = setCampaignQueue;
    window.getCampaignQueue = getCampaignQueue;
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
        switchToTemplateTabAndFocusMessage,
        // R6.9G.10.3.7 Physical Gate UI Export
        _updatePhysicalGateUI
    };
}


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
                        descEl.textContent = `Storage reset detected. Stage-0 Backup ready: ${res.summary.total} Total / ${res.summary.remaining} Remaining / ${res.summary.completed} Completed / ${res.summary.historyRowsCount} History Rows / ${res.summary.collectedEmailsCount} Emails.`;
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
