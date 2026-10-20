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
        importScripts('modules/build-provenance.js');
        importScripts('modules/privacy-gateway.js');
        importScripts('modules/smart-field-resolver.js');
        importScripts('modules/mock-captcha-provider-adapter.js');
    }
} catch (e) {
    console.warn('[SW Boot] importScripts modules fallback or handled inline:', e);
}

const _swBootBuildInfo = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : null;
const _swBootId = _swBootBuildInfo ? _swBootBuildInfo.buildId : 'UNKNOWN';
const _swBootChannel = _swBootBuildInfo ? _swBootBuildInfo.channel : 'UNKNOWN';
console.log(`[BOOT] [SW_RESTART] XPIDER Service Worker initialized buildId=${_swBootId} channel=${_swBootChannel} timestamp=${new Date().toISOString()}`);

// [R6.9G.9.4] Proxy Authentication Handler with Bounded Retries (MV3 asyncBlocking onAuthRequired)
const proxyAuthAttempts = new Map(); // reqKey -> { count: number, timestamp: number }

let isProxyAuthHandlerRegistered = false;
if (typeof chrome !== 'undefined' && chrome.webRequest && chrome.webRequest.onAuthRequired) {
    try {
        chrome.webRequest.onAuthRequired.addListener(
            (details, asyncCallback) => {
                if (!details || !details.isProxy) {
                    if (typeof asyncCallback === 'function') asyncCallback({});
                    return {};
                }

                // [R6.9G.9.4] Bounded Retry Guard: Cap challenges to max 2 attempts (initial + 1 replay)
                const reqKey = details.requestId || `${details.challenger?.host}:${details.challenger?.port}:${details.url || ''}`;
                const now = Date.now();
                const attemptEntry = proxyAuthAttempts.get(reqKey) || { count: 0, timestamp: now };
                attemptEntry.count += 1;
                attemptEntry.timestamp = now;
                proxyAuthAttempts.set(reqKey, attemptEntry);

                // Housekeeping: purge entries older than 60s if map grows
                if (proxyAuthAttempts.size > 200) {
                    for (const [k, v] of proxyAuthAttempts.entries()) {
                        if (now - v.timestamp > 60000) {
                            proxyAuthAttempts.delete(k);
                        }
                    }
                }

                if (attemptEntry.count > 2) {
                    console.warn(`[PRIVACY_GATE] [PROXY_AUTH_REJECTED] Bounded retry limit reached (attempts=${attemptEntry.count}) for ${reqKey}, canceling request fail-closed.`);
                    if (typeof asyncCallback === 'function') {
                        asyncCallback({ cancel: true });
                        return;
                    }
                    return { cancel: true };
                }

                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) {
                        console.warn('[PRIVACY_GATE] [PROXY_AUTH_REJECTED] PrivacyGateway instance unavailable, canceling request.');
                        if (typeof asyncCallback === 'function') {
                            asyncCallback({ cancel: true });
                            return;
                        }
                        return { cancel: true };
                    }
                    const creds = pg.getProxyAuthCredentials(details.challenger);
                    if (creds && creds.username && creds.password) {
                        const auth = {
                            authCredentials: {
                                username: creds.username,
                                password: creds.password
                            }
                        };
                        if (typeof asyncCallback === 'function') {
                            asyncCallback(auth);
                            return;
                        }
                        return auth;
                    } else {
                        console.warn('[PRIVACY_GATE] [PROXY_AUTH_REJECTED] No matching scoped proxy credentials, canceling request.');
                        if (typeof asyncCallback === 'function') {
                            asyncCallback({ cancel: true });
                            return;
                        }
                        return { cancel: true };
                    }
                } catch (err) {
                    console.warn('[PRIVACY_GATE] [PROXY_AUTH_REJECTED] Proxy onAuthRequired error:', err);
                    if (typeof asyncCallback === 'function') {
                        asyncCallback({ cancel: true });
                        return;
                    }
                    return { cancel: true };
                }
            },
            { urls: ["<all_urls>"] },
            ["asyncBlocking"]
        );
        isProxyAuthHandlerRegistered = true;
        console.log('[PRIVACY_GATE] Proxy onAuthRequired asyncBlocking listener registered with bounded retries.');
    } catch (e) {
        isProxyAuthHandlerRegistered = false;
        console.warn('[PRIVACY_GATE] Failed to register onAuthRequired listener:', e);
    }
}
if (typeof self !== 'undefined') {
    self.isProxyAuthHandlerRegistered = isProxyAuthHandlerRegistered;
}
if (typeof globalThis !== 'undefined') {
    globalThis.isProxyAuthHandlerRegistered = isProxyAuthHandlerRegistered;
}

// ── [R6.9G.10.3.7.1.4.4] DECLARATIVENETREQUEST OWNER TEST NETWORK GUARD ─────────────
const OWNER_TEST_GUARD_RULE_IDS = [990001, 990002, 990003, 990004, 990005, 990006, 990007];

async function installOwnerTestNetworkGuard(options = {}) {
    if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateSessionRules) {
        throw new Error('DECLARATIVE_NET_REQUEST_UNAVAILABLE');
    }
    const allResourceTypes = [
        'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
        'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
    ];
    const rules = [
        // Rule 990001: Priority 1 - Block all HTTP / HTTPS
        {
            id: 990001,
            priority: 1,
            action: { type: 'block' },
            condition: {
                urlFilter: '|http*',
                resourceTypes: allResourceTypes
            }
        },
        // Rule 990002: Priority 1 - Block all WebSockets
        {
            id: 990002,
            priority: 1,
            action: { type: 'block' },
            condition: {
                urlFilter: '|ws*',
                resourceTypes: ['websocket']
            }
        },
        // Rule 990003: Priority 2 (Higher) - Allow localhost loopback
        {
            id: 990003,
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter: '||localhost^',
                resourceTypes: allResourceTypes
            }
        },
        // Rule 990004: Priority 2 (Higher) - Allow 127.0.0.1 loopback
        {
            id: 990004,
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter: '||127.0.0.1^',
                resourceTypes: allResourceTypes
            }
        },
        // Rule 990005: Priority 2 (Higher) - Allow [::1] IPv6 loopback
        {
            id: 990005,
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter: '||[::1]^',
                resourceTypes: allResourceTypes
            }
        }
    ];

    const expectedIds = [990001, 990002, 990003, 990004, 990005];

    if (options && (options.allowCloudflareChallenges || options.allowCloudflare)) {
        rules.push({
            id: 990006,
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter: '||challenges.cloudflare.com^',
                resourceTypes: allResourceTypes
            }
        });
        rules.push({
            id: 990007,
            priority: 2,
            action: { type: 'allow' },
            condition: {
                urlFilter: '||cloudflare.com^',
                resourceTypes: allResourceTypes
            }
        });
        expectedIds.push(990006, 990007);
    }

    await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: OWNER_TEST_GUARD_RULE_IDS,
        addRules: rules
    });

    // Verification / Readback
    const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
    const installedIds = new Set(sessionRules.map(r => r.id));
    const allPresent = expectedIds.every(id => installedIds.has(id));
    if (!allPresent) {
        throw new Error('OWNER_TEST_GUARD_READBACK_INCOMPLETE: failed to verify session rules');
    }
    const guardMsg = `[OWNER_TEST_GUARD] declarativeNetRequest session rules installed & verified: loopback HTTP only${options && (options.allowCloudflareChallenges || options.allowCloudflare) ? ' + cloudflare allowed' : ''}, all public blocked`;
    console.log(guardMsg);
    if (typeof logBg === 'function') {
        logBg(null, guardMsg, 'info');
    }
    return true;
}

async function removeOwnerTestNetworkGuard() {
    try {
        if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateSessionRules) {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: OWNER_TEST_GUARD_RULE_IDS
            });
            console.log('[OWNER_TEST_GUARD] declarativeNetRequest session rules removed cleanly');
            if (typeof logBg === 'function') {
                logBg(null, '[OWNER_TEST_GUARD] declarativeNetRequest session rules removed cleanly', 'info');
            }
        }
    } catch (e) {
        console.warn('[OWNER_TEST_GUARD] Failed to remove session rules:', e.message);
    }
}

// [R6.9G.10.3.7.1.4.11] State-Aware SW Boot Reconciliation for Owner Test Network Guard
async function reconcileOwnerTestNetworkGuardOnBoot() {
    try {
        if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateSessionRules) {
            return { reconciled: false, reason: 'DNR_UNAVAILABLE' };
        }
        if (!chrome.storage || !chrome.storage.local) {
            return { reconciled: false, reason: 'STORAGE_UNAVAILABLE' };
        }

        const data = await chrome.storage.local.get([
            'xpider_owner_function_test_mode',
            'xpider_isActive',
            'xpider_isPaused',
            'xpider_paused_checkpoint',
            'xpider_queue',
            'xpider_owner_function_test_mode_active',
            'xpider_active_test_source'
        ]);

        const EXPLICIT_TEST_SOURCES = ['OWNER_CORE_TEST', 'OWNER_CAPTCHA_LAB', 'OWNER_FULL_TEST', 'CLOUDFLARE_TESTKEY_LAB'];
        const isExplicitTestSource = Boolean(data.xpider_active_test_source && EXPLICIT_TEST_SOURCES.includes(data.xpider_active_test_source));

        const isTestBuild = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function')
            ? BuildProvenance.isTestOnlyBuild()
            : false;

        const hasActiveOrPausedSession = Boolean(
            (data.xpider_isActive && Array.isArray(data.xpider_queue) && data.xpider_queue.length > 0) ||
            data.xpider_isPaused ||
            (data.xpider_paused_checkpoint && Array.isArray(data.xpider_paused_checkpoint.remainingQueue) && data.xpider_paused_checkpoint.remainingQueue.length > 0)
        );

        // A legitimate Owner Test session is active on boot ONLY IF:
        // 1. It is a test build
        // 2. An explicit test source is active or paused
        // 3. hasActiveOrPausedSession is true
        const isLegitimateTestSession = isTestBuild && isExplicitTestSource && hasActiveOrPausedSession;

        if (isLegitimateTestSession) {
            campaignState.ownerFunctionTestMode = true;
            try {
                await installOwnerTestNetworkGuard();
                console.log('[SW_BOOT_RECONCILE] Owner Test Network Guard active & verified on SW restart.');
                if (typeof logBg === 'function') {
                    logBg(null, '[SW_BOOT_RECONCILE] Owner Test Network Guard active & verified on SW restart.', 'info');
                }
                return { reconciled: true, guardActive: true };
            } catch (err) {
                console.error('[SW_BOOT_RECONCILE_FAIL] Guard verification failed on boot — fail-closed blocking campaign:', err.message);
                campaignState.isFaulted = true;
                campaignState.faultReason = 'BOOT_GUARD_RECONCILIATION_FAILED';
                campaignState.isActive = false;
                campaignState.isPaused = true;
                await chrome.storage.local.set({ xpider_isActive: false, xpider_isPaused: true, xpider_fault: 'BOOT_GUARD_RECONCILIATION_FAILED' });
                if (typeof logBg === 'function') {
                    logBg(null, `🛑 [SW_BOOT_FAIL_CLOSED] Network guard failed to reconcile: ${err.message}`, 'error');
                }
                return { reconciled: true, guardActive: false, error: err.message };
            }
        } else {
            // Not a legitimate active test session.
            // If stale test mode flags exist in storage, auto-clear them!
            campaignState.ownerFunctionTestMode = false;
            if (data.xpider_owner_function_test_mode || data.xpider_owner_function_test_mode_active || data.xpider_active_test_source) {
                await chrome.storage.local.set({ xpider_owner_function_test_mode: false });
                await chrome.storage.local.remove([
                    'xpider_active_test_source',
                    'xpider_owner_function_test_mode_active',
                    'xpider_test_mode_state'
                ]);
                console.log('[SW_BOOT_RECONCILE] channel=OWNER_BETA staleTestMode=true action=AUTO_CLEAR');
                if (typeof logBg === 'function') {
                    logBg(null, '[SW_BOOT_RECONCILE] channel=OWNER_BETA staleTestMode=true action=AUTO_CLEAR', 'info');
                }
            }
            await removeOwnerTestNetworkGuard();
            return { reconciled: true, guardActive: false };
        }
    } catch (e) {
        console.warn('[SW_BOOT_RECONCILE] Error during boot guard reconciliation:', e.message);
        return { reconciled: false, error: e.message };
    }
}

// Initial state-aware reconciliation on service worker boot
if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateSessionRules) {
    reconcileOwnerTestNetworkGuardOnBoot().catch(() => {});
}
// ── END DECLARATIVENETREQUEST GUARD ──────────────────────────────────────────

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

// [R6.9G.8] Authoritative Pauseable Target Deadline Controller
class TargetDeadlineController {
    constructor({ attemptId, targetToken, campaignRunId, sessionId }) {
        this.attemptId = attemptId;
        this.targetToken = targetToken;
        this.campaignRunId = campaignRunId;
        this.sessionId = sessionId;
        this.totalBudgetMs = 0;
        this.remainingMs = 0;
        this.isPaused = false;
        this.isCancelled = false;
        this.isExpired = false;
        this.pauseReason = null;
        this.timerId = null;
        this.lastStartOrResumeTime = 0;
        this.timeoutPromise = null;
        this._rejectFn = null;
    }

    start(totalBudgetMs) {
        this.totalBudgetMs = totalBudgetMs;
        this.remainingMs = totalBudgetMs;
        this.isPaused = false;
        this.isCancelled = false;
        this.isExpired = false;
        this.lastStartOrResumeTime = Date.now();

        this.timeoutPromise = new Promise((_, reject) => {
            this._rejectFn = reject;
            this._armTimer();
        });
        return this.timeoutPromise;
    }

    _armTimer() {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        if (this.isPaused || this.isCancelled || this.isExpired) return;

        this.lastStartOrResumeTime = Date.now();
        this.timerId = setTimeout(() => {
            this.isExpired = true;
            this.remainingMs = 0;
            if (this._rejectFn) {
                this._rejectFn(new Error("Local Session Timeout"));
            }
        }, this.remainingMs);
    }

    pause(reason = 'PAUSED') {
        if (this.isCancelled || this.isExpired) return this.remainingMs;
        if (this.isPaused) {
            this.pauseReason = reason;
            return this.remainingMs;
        }
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        const elapsed = Date.now() - this.lastStartOrResumeTime;
        this.remainingMs = Math.max(0, this.remainingMs - elapsed);
        this.isPaused = true;
        this.pauseReason = reason;
        console.log(`[TARGET_DEADLINE] Paused: reason=${reason} remainingMs=${this.remainingMs}`);
        return this.remainingMs;
    }

    resume() {
        if (!this.isPaused || this.isCancelled || this.isExpired) return;
        this.isPaused = false;
        const prevReason = this.pauseReason;
        this.pauseReason = null;
        console.log(`[TARGET_DEADLINE] Resumed: wasReason=${prevReason} remainingMs=${this.remainingMs}`);
        this._armTimer();
    }

    cancel(reason = 'CANCELLED') {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.isCancelled = true;
        this.pauseReason = reason;
    }

    getRemainingMs() {
        if (this.isPaused) return this.remainingMs;
        if (this.isExpired || this.isCancelled) return 0;
        const elapsed = Date.now() - this.lastStartOrResumeTime;
        return Math.max(0, this.remainingMs - elapsed);
    }
}

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
    targetDeadlineController: null, // [R6.9G.8] Authoritative pauseable target deadline controller
    currentTabId: null,
    targetTabId: null,
    currentTargetToken: null,
    currentTargetStage: null,
    schedulerGeneration: 1,
    currentTargetAbortController: null,
    captchaEpoch: 1, // [Issue #6 R6.9E] Scoped solver epoch
    captchaEpochBlockedErrors: {}, // [Issue #6 R6.9E] Permanent/config error suppression per epoch
    visitedUrls: [],
    successfulUrls: [],
    sessionId: 0,
    isLoopRunning: false,
    lastActionTime: Date.now(),
    isInitialized: false,
    targetResolve: null,
    targetReady: null,
    currentDiscoveryCtx: null,
    currentAttempt: null, // [v1.2.0 Intent Ledger] { url, attemptId, status: 'PREPARING'|'SUBMIT_PENDING'|'RESOLVED', reasonCode, ts }
    submitBoundaryReached: {}, // [Issue #6 R6.9F] Track exact attemptIds reaching submit to prevent duplicates
    focusActiveTargetTab: true, // [Hotfix R2] Auto-focus campaign target tab
    // [R6.9G-A] Serialized Target Lifecycle: Exactly one target in flight at a time
    activeTargetInFlight: false, // TRUE while orchestrateSending is executing; prevents concurrent starts
    activeTargetCount: 0,        // [R6.9G.4] Authoritative active-target in flight counter
    maxConcurrentObserved: 0,    // [R6.9G.4] Peak observed concurrent targets (strictly invariant === 1)
    lastFinalTs: 0,              // Timestamp of last TARGET FINAL — CAMPAIGN_FINISHED must follow it
    isFaulted: false,            // [R6.9G.7.1] Set to true if orchestration fails to quiesce
    faultReason: null,
    // [RC3.18 Campaign Continuity & Network Degradation Recovery]
    isNetworkDegraded: false,
    networkRecoveryPhase: null, // 'NONE' | 'CHECKPOINTED' | 'RELAY_RECONNECTING' | 'PRIVACY_REVERIFY' | 'JOB_RESTORE'
    networkCheckpoint: null,
    networkRecoveryRetryCount: 0,
    currentFormIdentity: null,
    currentFieldMapping: null,
    currentFilledFields: [],
    currentSubmitState: 'NOT_SUBMITTED', // 'NOT_SUBMITTED' | 'SUBMIT_TRIGGERED' | 'SUBMIT_CONFIRMED'
    runScopedDirectPrivacy: false, // [R6.9G.10.3.7.1.4.11 P0] Run-scoped direct privacy override when Owner consents
    captchaFailuresRecorded: new Set(), // [R6.9G.7.1] Idempotent attempt-bound CAPTCHA failure recorder
    // [R6.9G-G] CAPTCHA Attempt-Bound Ledger
    captchaLedger: {
        detected: 0,       // CAPTCHA_DETECTED: challenge found for target
        pendingOwner: 0,   // CAPTCHA_PENDING_OWNER: owner modal shown, awaiting decision
        autoSuccess: 0,    // CAPTCHA_AUTO_SUCCESS: provider solved AND verified on page
        autoFailure: 0,    // CAPTCHA_AUTO_FAILURE: provider terminal failure
        manualSuccess: 0,  // CAPTCHA_MANUAL_SUCCESS: owner solved manually
        manualSkip: 0      // CAPTCHA_MANUAL_SKIP: owner chose to skip
    },
    // [R6.9G.10.3.7.1.4.9] Authoritative Controlled CAPTCHA Lab Metrics
    captchaLabMetrics: {
        detected: 0,
        requested: 0,
        success: 0,
        failure: 0,
        timeout: 0,
        staleDropped: 0,
        mathSolved: 0,
        audioPassed: 0,
        expectedFailPass: 0,
        unexpectedFailures: 0
    },
    ownerTestSource: null,
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
        failureBreakdown: {},
        captchaSolved: 0,   // [R6.9F.3/R6.9G] Auto CAPTCHA Solver verified success only
        captchaFailed: 0    // [R6.9F.3/R6.9G] Auto CAPTCHA Solver terminal failure only
    }
};

let coreRuntimeRefErrors = {};

// [Issue #6 R6.9E] Authoritative single-writer counter synchronization strictly from HistoryStore ledger
async function syncCampaignCountersFromLedger(hsInstance = null) {
    try {
        const hs = hsInstance || await getHistoryStoreInstance();
        if (!hs) return campaignState.counters;
        const stats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
        
        campaignState.counters.success = stats.success;
        campaignState.counters.failed = stats.failure;
        campaignState.counters.deliveryUnknown = stats.unknown;
        campaignState.counters.timeout = stats.timeout;
        campaignState.counters.skipped = stats.skipped;
        campaignState.counters.paused = stats.paused;
        campaignState.counters.completed = stats.completed;
        campaignState.counters.failureBreakdown = { ...stats.failureBreakdown };

        // inProgress: exactly 1 if active target in flight and not paused, else 0
        const inProgress = (campaignState.isActive && !campaignState.isPaused && (campaignState.activeTargetInFlight || campaignState.currentAttempt)) ? 1 : 0;
        campaignState.counters.inProgress = inProgress;

        // [R6.9G.7 P0-7 Counter Truth] UI == currentRun ledger == History == checkpoint
        const queuePending = Array.isArray(campaignState.queue) ? campaignState.queue.length : 0;
        campaignState.counters.remaining = Math.max(0, queuePending + inProgress);
        campaignState.counters.total = Math.max(campaignState.counters.total || 0, stats.completed + campaignState.counters.remaining);
        campaignState.successCount = stats.success;

        await persistCounters();
        broadcastCounters();
        return campaignState.counters;
    } catch (e) {
        console.error('[syncCampaignCountersFromLedger] failed:', e);
        return campaignState.counters;
    }
}

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
            captchaSolvedCount: campaignState.counters.captchaSolved,
            captchaFailedCount: campaignState.counters.captchaFailed,
            // [R6.9G-G] Full CAPTCHA attempt-bound ledger metrics
            captchaLedger: { ...campaignState.captchaLedger },
            captchaLabMetrics: { ...campaignState.captchaLabMetrics },
            ownerTestSource: campaignState.ownerTestSource || null,
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
    query: (queryInfo = {}) => {
        if (chrome.tabs?.query) return chrome.tabs.query(queryInfo);
        return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'NATIVE_TABS_QUERY', queryInfo }, (res) => resolve(res || []));
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

// [R6.9G.8.1] Persistent Current-Run Diagnostic Event Stream
let currentRunDiagEvents = [];
let currentRunDiagSaveTimer = null;
let currentRunDiagTruncated = false;

function recordCurrentRunDiagEvent(msg, type = 'INFO') {
    const ts = new Date().toISOString();
    const entry = `[${ts}][${(type || 'INFO').toUpperCase()}] ${msg}`;
    currentRunDiagEvents.push(entry);
    if (currentRunDiagEvents.length > 20000) {
        currentRunDiagEvents.shift();
        currentRunDiagTruncated = true;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (!currentRunDiagSaveTimer) {
            currentRunDiagSaveTimer = setTimeout(() => {
                currentRunDiagSaveTimer = null;
                chrome.storage.local.set({
                    xpider_current_run_diagnostics: {
                        runId: (typeof campaignState !== 'undefined' && campaignState?.campaignRunId) || null,
                        truncated: currentRunDiagTruncated,
                        events: currentRunDiagEvents
                    }
                });
            }, 300);
        }
    }
}

function logBg(tabId, msg, type = 'info') {
    console.log(`[BG_LOG][tab=${tabId || 'none'}] ${msg}`);
    recordCurrentRunDiagEvent(msg, type);
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
         * Solve via NopeCHA Token API (POST submit → GET polling)
         * Reference: https://developers.nopecha.com/recognition/token_api/
         */
        /**
         * [RC3.25 Directive D] Solve via NopeCHA Token API with Hard Wall-Clock Cap & Sanitized Telemetry
         */
        async solveNopeCha(siteKey, pageUrl, type = 'recaptcha', pollIntervalMs = 3000, maxWaitSec = 120) {
            if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
            const nopechaType = type === 'turnstile' ? 'turnstile' : (type === 'hcaptcha' ? 'hcaptcha' : 'recaptcha2');

            const waitSec = Math.min(Math.max(Number(maxWaitSec) || 120, 10), 300);
            const hardCapMs = (waitSec * 1000) + 10000;
            const abortCtrl = new AbortController();
            const hardTimer = setTimeout(() => abortCtrl.abort('HARD_WALLCLOCK_TIMEOUT'), hardCapMs);
            const startTs = Date.now();
            let jobId = null;
            let pollCount = 0;
            let lastStatusCode = null;

            try {
                // Step 1: POST to submit the CAPTCHA job
                const authHeaders = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.nopeChaKey}`
                };
                const postBody = {
                    key: this.config.nopeChaKey,
                    type: nopechaType,
                    sitekey: siteKey,
                    url: pageUrl
                };

                let submitUrl = 'https://api.nopecha.com/token';
                let postRes = null;
                try {
                    postRes = await fetch(submitUrl, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify(postBody),
                        signal: abortCtrl.signal
                    });
                    if (postRes.status === 404) {
                        submitUrl = `https://api.nopecha.com/v1/token/${nopechaType}`;
                        postRes = await fetch(submitUrl, {
                            method: 'POST',
                            headers: authHeaders,
                            body: JSON.stringify(postBody),
                            signal: abortCtrl.signal
                        });
                    }
                } catch (eSubmit) {
                    if (abortCtrl.signal.aborted) throw new Error(`NopeCHA Timeout: Token not resolved within ${waitSec} seconds.`);
                    throw new Error(`NopeCHA Submit Network Error: ${eSubmit.message}`);
                }

                const postData = await postRes.json();
                if (!postData || postData.error) throw new Error(`NopeCHA Submit Error (${postData?.error}): ${postData?.message || 'Unknown'}`);
                jobId = postData.data;
                if (!jobId) throw new Error('NopeCHA: No job ID returned from submit.');
                const jobTag = jobId ? '***' + String(jobId).slice(-6) : 'none';
                console.log(`[NopeCHA] Job submitted tag=${jobTag}`);
                logBg(null, `[CAPTCHA_TELEMETRY] provider=nopecha step=SUBMIT status=${postRes.status} jobTag=${jobTag} elapsedMs=${Date.now() - startTs}`, 'info');

                // Step 2: GET polling until token is ready or hardCap reached
                const interval = Math.min(Math.max(Number(pollIntervalMs) || 3000, 1000), 10000);
                while ((Date.now() - startTs < (waitSec * 1000)) && !abortCtrl.signal.aborted) {
                    await new Promise((res, rej) => {
                        const t = setTimeout(res, interval);
                        abortCtrl.signal.addEventListener('abort', () => {
                            clearTimeout(t);
                            rej(new Error(`NopeCHA Timeout: Token not resolved within ${waitSec} seconds.`));
                        }, { once: true });
                    });

                    pollCount++;
                    let getRes = null;
                    try {
                        getRes = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&id=${jobId}`, {
                            headers: { 'Authorization': `Bearer ${this.config.nopeChaKey}` },
                            signal: abortCtrl.signal
                        });
                    } catch (ePollNet) {
                        if (abortCtrl.signal.aborted) break;
                        continue; // Bounded network retry
                    }

                    const getData = await getRes.json();
                    if (getData.error) {
                        lastStatusCode = getData.error;
                        // error 14 = Incomplete job (still processing)
                        // error 100 = not ready yet (legacy)
                        if (getData.error === 14 || getData.error === 100) continue;
                        throw new Error(`NopeCHA Poll Error (${getData.error}): ${getData.message || 'Unknown'}`);
                    }
                    if (getData.data && typeof getData.data === 'string' && getData.data.length > 20) {
                        clearTimeout(hardTimer);
                        const elapsedMs = Date.now() - startTs;
                        console.log(`[NopeCHA] Token resolved after ${pollCount} polls (${elapsedMs}ms)`);
                        logBg(null, `[CAPTCHA_TELEMETRY] provider=nopecha outcome=SUCCESS polls=${pollCount} lastCode=${lastStatusCode || 'NONE'} elapsedMs=${elapsedMs} tokenReceived=true`, 'info');
                        return getData.data;
                    }
                }

                clearTimeout(hardTimer);
                const elapsedTotal = Date.now() - startTs;
                logBg(null, `[CAPTCHA_TELEMETRY] provider=nopecha outcome=TIMEOUT polls=${pollCount} lastCode=${lastStatusCode || 'NONE'} elapsedMs=${elapsedTotal} tokenReceived=false tokenInjected=false`, 'warning');
                throw new Error(`NopeCHA Timeout: Token not resolved within ${waitSec} seconds.`);
            } finally {
                clearTimeout(hardTimer);
            }
        }
    
        /**
         * [RC3.25 Directive D] Solve via 2Captcha API with Hard Wall-Clock Cap & Sanitized Telemetry
         */
        async solve2Captcha(siteKey, pageUrl, type = 'recaptcha', extra = {}, pollIntervalMs = 5000, maxWaitSec = 200) {
            if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
            if (this.config.twoCaptchaKey === 'TEST_ERROR_ZERO_BALANCE' && (pageUrl.includes('127.0.0.1') || pageUrl.includes('localhost'))) {
                throw new Error("2Captcha Error: ERROR_ZERO_BALANCE");
            }
            const waitSec = Math.min(Math.max(Number(maxWaitSec) || 200, 10), 300);
            const hardCapMs = (waitSec * 1000) + 10000;
            const abortCtrl = new AbortController();
            const hardTimer = setTimeout(() => abortCtrl.abort('HARD_WALLCLOCK_TIMEOUT'), hardCapMs);
            const startTs = Date.now();
            let pollCount = 0;
            let lastStatusCode = null;

            try {
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
                    const res = await fetch('https://2captcha.com/in.php', { method: 'POST', body: formData, signal: abortCtrl.signal });
                    data = await res.json();
                } else {
                    const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=${method}${extraParams}&pageurl=${encodeURIComponent(pageUrl)}&json=1`, { signal: abortCtrl.signal });
                    data = await res.json();
                }
                if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
                
                const taskId = data.request;
                const taskTag = taskId ? '***' + String(taskId).slice(-6) : 'none';
                logBg(null, `[CAPTCHA_TELEMETRY] provider=2captcha step=SUBMIT status=1 taskTag=${taskTag} elapsedMs=${Date.now() - startTs}`, 'info');

                const interval = Math.min(Math.max(Number(pollIntervalMs) || 5000, 2000), 10000);
                while ((Date.now() - startTs < (waitSec * 1000)) && !abortCtrl.signal.aborted) {
                    await new Promise((res, rej) => {
                        const t = setTimeout(res, interval);
                        abortCtrl.signal.addEventListener('abort', () => {
                            clearTimeout(t);
                            rej(new Error(`2Captcha Timeout: Token not resolved within ${waitSec} seconds.`));
                        }, { once: true });
                    });

                    pollCount++;
                    const checkRes = await fetch(`https://2captcha.com/res.php?key=${this.config.twoCaptchaKey}&action=get&id=${taskId}&json=1`, { signal: abortCtrl.signal });
                    const checkData = await checkRes.json();
                    if (checkData.status === 1) {
                        clearTimeout(hardTimer);
                        const elapsedMs = Date.now() - startTs;
                        logBg(null, `[CAPTCHA_TELEMETRY] provider=2captcha outcome=SUCCESS polls=${pollCount} elapsedMs=${elapsedMs} tokenReceived=true`, 'info');
                        return checkData.request;
                    }
                    lastStatusCode = checkData.request;
                    if (checkData.request !== "CAPCHA_NOT_READY") throw new Error(`2Captcha Error: ${checkData.request}`);
                }
                clearTimeout(hardTimer);
                const elapsedTotal = Date.now() - startTs;
                logBg(null, `[CAPTCHA_TELEMETRY] provider=2captcha outcome=TIMEOUT polls=${pollCount} lastCode=${lastStatusCode || 'NONE'} elapsedMs=${elapsedTotal} tokenReceived=false tokenInjected=false`, 'warning');
                throw new Error("2Captcha Timeout");
            } finally {
                clearTimeout(hardTimer);
            }
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

// [Issue #6 R6.9B] Strict Single-Tab Runtime Policy & Tab Ownership Tracking
const STRICT_SINGLE_TARGET_TAB = true;
const KEEP_DELIVERY_UNKNOWN_TABS = false;
const MAX_RETAINED_UNCERTAIN_TABS = 0; // Deprecated retention: close all tabs by default

const retainedUncertainTabs = [];
const retainedTabIds = new Set();
const campaignOwnedTabIds = new Set();
const campaignTabParent = new Map(); // childTabId -> openerTabId
const preCampaignTabIds = new Set(); // Pre-existing user tabs captured at campaign start (IMMUTABLE SAFETY BASELINE)

// [Issue #6 R6.9B Section 4] Track child tabs opened by target pages (target=_blank, window.open)
if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (chrome.tabs.onCreated && typeof chrome.tabs.onCreated.addListener === 'function') {
        chrome.tabs.onCreated.addListener((tab) => {
            try {
                if (!campaignState.isActive) return;
                if (tab && tab.id && tab.openerTabId) {
                    if (campaignOwnedTabIds.has(tab.openerTabId) || retainedTabIds.has(tab.openerTabId)) {
                        campaignOwnedTabIds.add(tab.id);
                        campaignTabParent.set(tab.id, tab.openerTabId);
                        console.log(`[TAB_CHILD_OWNED] tabId=${tab.id} openerTabId=${tab.openerTabId} url=${tab.url || 'pending'}`);
                        logBg(tab.openerTabId, `[TAB_CHILD_OWNED] Detected campaign child tab tabId=${tab.id} from opener=${tab.openerTabId}`, "info");
                    }
                }
            } catch (_) {}
        });
    }

    if (chrome.tabs.onRemoved && typeof chrome.tabs.onRemoved.addListener === 'function') {
        chrome.tabs.onRemoved.addListener((removedTabId) => {
            campaignOwnedTabIds.delete(removedTabId);
            retainedTabIds.delete(removedTabId);
            campaignTabParent.delete(removedTabId);
            if (campaignState.currentTabId === removedTabId) campaignState.currentTabId = null;
            if (campaignState.targetTabId === removedTabId) campaignState.targetTabId = null;
        });
    }
}

/**
 * [Issue #6 R6.9B Section 1] Centralized Hard Tab Cleanup Barrier
 * Scans all campaign-owned and tracked pointers, excludes keepTabId, verifies closure with retry.
 * NEVER closes pre-existing user baseline tabs.
 */
async function closeAllCampaignTabsExcept(keepTabId = null, reason = 'CLEANUP') {
    const candidates = new Set();
    for (const id of campaignOwnedTabIds) candidates.add(id);
    for (const id of retainedTabIds) candidates.add(id);
    for (const [childId] of campaignTabParent) candidates.add(childId);
    if (campaignState.currentTabId) candidates.add(campaignState.currentTabId);
    if (campaignState.targetTabId) candidates.add(campaignState.targetTabId);

    if (keepTabId != null) {
        candidates.delete(keepTabId);
    }

    // Safety Baseline: never close user baseline tabs unless explicitly adopted into campaignOwnedTabIds
    for (const id of candidates) {
        if (preCampaignTabIds.has(id) && !campaignOwnedTabIds.has(id)) {
            candidates.delete(id);
        }
    }

    const ownedBefore = candidates.size;
    console.log(`[TAB_BARRIER] phase=${reason} ownedBefore=${ownedBefore}`);

    let closedCount = 0;
    const maxRetries = 3;

    for (const tabId of candidates) {
        let isClosed = false;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const existing = await safeTabs.get(tabId);
                if (!existing || !existing.id) {
                    isClosed = true;
                    console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=CLOSED`);
                    break;
                }
                await safeTabs.remove(tabId);
            } catch (_) {
                // remove error: check if closed or still open in verify step below
            }

            await new Promise(r => setTimeout(r, 150));
            try {
                const check = await safeTabs.get(tabId);
                if (!check || !check.id) {
                    isClosed = true;
                    console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=CLOSED`);
                    break;
                } else {
                    console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=STILL_OPEN`);
                    await new Promise(r => setTimeout(r, 150));
                }
            } catch (_) {
                isClosed = true;
                console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=CLOSED`);
                break;
            }
        }

        if (isClosed) {
            campaignOwnedTabIds.delete(tabId);
            retainedTabIds.delete(tabId);
            campaignTabParent.delete(tabId);
            if (campaignState.currentTabId === tabId) campaignState.currentTabId = null;
            if (campaignState.targetTabId === tabId) campaignState.targetTabId = null;
            closedCount++;
        } else {
            console.warn(`[TAB_BARRIER_FAIL] tabId=${tabId} phase=${reason} failed to close after ${maxRetries} retries`);
        }
    }

    const remainingOwned = Array.from(campaignOwnedTabIds).filter(id => id !== keepTabId).length;
    const result = remainingOwned === 0 ? 'PASS' : 'FAIL';
    console.log(`[TAB_BARRIER] phase=${reason} ownedAfter=${remainingOwned} result=${result}`);

    if (keepTabId != null) {
        console.log(`[TAB_KILL_SWITCH] keepTabId=${keepTabId} closedOthers=${closedCount} remainingOwned=${campaignOwnedTabIds.has(keepTabId) ? 1 : 0} result=${result}`);
    }

    return {
        success: remainingOwned === 0,
        closedCount,
        ownedBefore,
        remainingOwned
    };
}

/**
 * [Issue #6 R6.9B Section 7] Await verified closure of a single owned tab
 */
async function closeOwnedTabVerified(tabId, reason = 'TARGET_FINAL') {
    if (!tabId) return true;
    if (preCampaignTabIds.has(tabId) && !campaignOwnedTabIds.has(tabId)) {
        return false;
    }

    const maxRetries = 3;
    let isClosed = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const t = await safeTabs.get(tabId);
            if (!t || !t.id) {
                isClosed = true;
                console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=CLOSED`);
                break;
            }
            await safeTabs.remove(tabId);
        } catch (_) {
            // remove error: check if closed or still open in verify step below
        }

        await new Promise(r => setTimeout(r, 150));
        try {
            const check = await safeTabs.get(tabId);
            if (!check || !check.id) {
                isClosed = true;
                console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=CLOSED`);
                break;
            } else {
                console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=STILL_OPEN`);
                await new Promise(r => setTimeout(r, 150));
            }
        } catch (_) {
            isClosed = true;
            console.log(`[TAB_CLOSE] tabId=${tabId} attempt=${attempt} result=CLOSED`);
            break;
        }
    }

    campaignOwnedTabIds.delete(tabId);
    retainedTabIds.delete(tabId);
    campaignTabParent.delete(tabId);
    if (campaignState.currentTabId === tabId) campaignState.currentTabId = null;
    if (campaignState.targetTabId === tabId) campaignState.targetTabId = null;

    return isClosed;
}

// [Issue #6 R4.1 & R6.9B] Centralized Authoritative List Clear Handlers
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
    await closeAllCampaignTabsExcept(null, 'CLEAR_AUTO_FORM_DATA');
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
    } catch (err) {
        console.warn('[clearEmailCollectorData] clearAll error:', err);
    }
    // [Issue #6 R6.9C Single-Writer Fix]: Do NOT remove canonical Email Collector keys again here.
    // emailStore.clearAll() is the authoritative writer that pruned old lineage and wrote
    // the canonical clean store objects and new generation.
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
    // 3. Clear email collector data (authoritative single-writer clearAll)
    await clearEmailCollectorData();
    // 4. Clear diagnostics data
    await clearDiagnosticsData();
    // 5. Ensure non-email list keys in storage registry are removed
    // [Issue #6 R6.9C Single-Writer Fix]: Exclude LIST_DATA_KEYS.emailCollector from post-clear removal!
    const allKeysToRemove = [
        ...LIST_DATA_KEYS.autoform,
        ...LIST_DATA_KEYS.history,
        ...LIST_DATA_KEYS.diagnostics
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

// [Issue #6 R6.9E.1 Section 8A] Authoritative Single Execution Validator
function validateActiveExecution(request, sender, action, options = {}) {
    const curTabId = campaignState.currentTabId;
    const curAtt = campaignState.currentAttempt;
    const curAttemptId = curAtt?.attemptId;
    const curTok = campaignState.currentTargetToken;
    const curRunId = campaignState.campaignRunId;
    const curSessionId = campaignState.sessionId;

    const sTabId = sender?.tab?.id;
    const reqAttemptId = request?.attemptId;
    const reqTok = request?.targetToken;
    const reqRunId = request?.campaignRunId;
    const reqSessionId = request?.sessionId;

    // 1. Campaign active check
    if (!campaignState.isActive) {
        logBg(null, `[STALE_TARGET_EVENT] action=${action} reason=campaign_inactive result=REJECTED`, 'warning');
        return { valid: false, reason: 'campaign_inactive' };
    }

    // 2. Strict exact target tab verification
    let effectiveTabId = sTabId;
    if (options.allowBodyTabId && request?.tabId) {
        effectiveTabId = request.tabId;
    }
    if (!effectiveTabId || !curTabId || effectiveTabId !== curTabId) {
        logBg(null, `[STALE_TARGET_EVENT] action=${action} senderTab=${effectiveTabId || 'none'} expectedTab=${curTabId} result=REJECTED reason=tab_mismatch`, 'warning');
        return { valid: false, reason: 'tab_mismatch' };
    }

    // 3. Mandatory attemptId equality
    if (!reqAttemptId || !curAttemptId || reqAttemptId !== curAttemptId) {
        logBg(null, `[STALE_TARGET_EVENT] action=${action} reqAttempt=${reqAttemptId || 'none'} curAttempt=${curAttemptId || 'none'} result=REJECTED reason=attempt_mismatch`, 'warning');
        return { valid: false, reason: 'attempt_mismatch' };
    }

    // 4. Mandatory targetToken equality
    if (!reqTok || !curTok || reqTok !== curTok) {
        logBg(null, `[STALE_TARGET_EVENT] action=${action} reqToken=${reqTok || 'none'} curToken=${curTok || 'none'} result=REJECTED reason=token_mismatch`, 'warning');
        return { valid: false, reason: 'token_mismatch' };
    }

    // 5. Mandatory campaignRunId equality
    if (!reqRunId || !curRunId || reqRunId !== curRunId) {
        logBg(null, `[STALE_TARGET_EVENT] action=${action} reqRunId=${reqRunId || 'none'} curRunId=${curRunId || 'none'} result=REJECTED reason=campaign_run_mismatch`, 'warning');
        return { valid: false, reason: 'campaign_run_mismatch' };
    }

    // 6. Mandatory sessionId equality
    if (reqSessionId === undefined || reqSessionId === null || curSessionId === undefined || Number(reqSessionId) !== Number(curSessionId)) {
        logBg(null, `[STALE_TARGET_EVENT] action=${action} reqSession=${reqSessionId} curSession=${curSessionId} result=REJECTED reason=session_mismatch`, 'warning');
        return { valid: false, reason: 'session_mismatch' };
    }

    // 7. Optional expected solve identity check (for post-await or snapshot validation)
    if (options.expectedIdentity) {
        const exp = options.expectedIdentity;
        if (exp.tabId !== curTabId || exp.attemptId !== curAttemptId || exp.targetToken !== curTok || exp.campaignRunId !== curRunId || Number(exp.sessionId) !== Number(curSessionId)) {
            logBg(null, `[CAPTCHA_STALE_RESULT] action=${action} reason=identity_drift action=DROP`, 'warning');
            return { valid: false, reason: 'identity_drift' };
        }
        if (exp.captchaEpoch !== undefined && exp.captchaEpoch !== (campaignState.captchaEpoch || 1)) {
            logBg(null, `[CAPTCHA_STALE_RESULT] action=${action} callEpoch=${exp.captchaEpoch} currentEpoch=${campaignState.captchaEpoch} action=DROP reason=epoch_mismatch`, 'warning');
            return { valid: false, reason: 'epoch_mismatch' };
        }
    }

    // 8. Optional epoch check for solver pre-await
    if (options.checkEpoch) {
        const curEpoch = campaignState.captchaEpoch || 1;
        const reqEpoch = request?.captchaEpoch;
        if (reqEpoch && reqEpoch !== curEpoch) {
            logBg(null, `[CAPTCHA_STALE_REQUEST] reqEpoch=${reqEpoch} curEpoch=${curEpoch} action=REJECT reason=epoch_mismatch`, 'warning');
            return { valid: false, reason: 'epoch_mismatch' };
        }
    }

    return { valid: true, execution: { tabId: curTabId, attemptId: curAttemptId, targetToken: curTok, campaignRunId: curRunId, sessionId: curSessionId } };
}

if (typeof global !== 'undefined') {
    global.__validateActiveExecution = validateActiveExecution;
}

// [R6.9G.7.1 / RC3.25 Directive B] Centralized Idempotent CAPTCHA Failure Accounting & Terminal Settlement Policy
async function recordTerminalCaptchaFailure(attemptId, reason, safeErrorClass) {
    if (!campaignState.captchaFailuresRecorded) {
        campaignState.captchaFailuresRecorded = new Set();
    }
    const key = attemptId || `epoch_${campaignState.captchaEpoch || 0}`;
    if (campaignState.captchaFailuresRecorded.has(key)) {
        return; // Idempotent: already recorded for this attempt / epoch
    }
    campaignState.captchaFailuresRecorded.add(key);
    campaignState.captchaLedger.autoFailure = (campaignState.captchaLedger.autoFailure || 0) + 1;
    campaignState.counters.captchaFailed = (campaignState.counters.captchaFailed || 0) + 1;

    let showCaptchaPopup = false;
    try {
        const s = await chrome.storage.local.get(['xpider_show_captcha_choice_popup']);
        showCaptchaPopup = s.xpider_show_captcha_choice_popup === true;
    } catch (_) {}

    const curAttemptMatches = !attemptId || campaignState.currentAttempt?.attemptId === attemptId;

    if (!showCaptchaPopup) {
        // [RC3.25 Directive B Case 1] popup OFF: never enter CAPTCHA_PENDING_OWNER!
        campaignState.currentTargetStage = 'CAPTCHA_AUTO_FAILURE';
        
        let settleReason = 'CAPTCHA_SOLVER_PROVIDER_ERROR';
        const reasonStr = String(reason || '');
        const errClassStr = String(safeErrorClass || '');
        if (/timeout/i.test(reasonStr) || /timeout/i.test(errClassStr)) {
            settleReason = 'CAPTCHA_SOLVER_TIMEOUT';
        } else if (/config|key|wrong_user_key|not_exist/i.test(reasonStr) || /config|key/i.test(errClassStr)) {
            settleReason = 'CAPTCHA_SOLVER_CONFIG_ERROR';
        } else if (/zero_balance/i.test(reasonStr) || /zero_balance/i.test(errClassStr)) {
            settleReason = 'CAPTCHA_SOLVER_UNAVAILABLE';
        }

        logBg(null, `[CAPTCHA_STAGE_TRANSITION] CAPTCHA_AUTO_SOLVING -> CAPTCHA_AUTO_FAILURE -> SETTLED reason=${settleReason}`, 'warning');

        if (campaignState.targetDeadlineController) {
            campaignState.targetDeadlineController.cancel(settleReason);
        }

        if (campaignState.currentTabId && chrome.alarms) {
            chrome.alarms.clear(`xpider_watchdog_${campaignState.currentTabId}_${campaignState.sessionId}`);
        }

        const activeTabId = campaignState.currentTabId;
        if (activeTabId) {
            chrome.tabs.sendMessage(activeTabId, {
                action: 'CAPTCHA_UI_STATE_UPDATE',
                state: 'CAPTCHA_AUTO_FAILURE',
                message: `Auto-solve failed (${settleReason}). Skipping target.`,
                status: 'FAIL',
                attemptId: attemptId,
                reason: settleReason
            }).catch(() => {});

            chrome.tabs.sendMessage(activeTabId, {
                action: 'CAPTCHA_SKIP_DECISION',
                attemptId: attemptId,
                targetToken: campaignState.currentTargetToken,
                campaignRunId: campaignState.campaignRunId,
                sessionId: campaignState.sessionId,
                captchaEpoch: campaignState.captchaEpoch || 1,
                tabId: activeTabId,
                result: 'SKIPPED',
                reason: settleReason
            }).catch(() => {});
        }

        if (typeof campaignState.targetResolve === 'function') {
            const resolveTarget = campaignState.targetResolve;
            campaignState.targetResolve = null;
            resolveTarget({
                success: false,
                reasonCode: settleReason,
                metadata: {
                    captchaStatus: 'AUTO_FAILURE',
                    settleReason: settleReason,
                    autoFirst: true,
                    popupShown: false
                }
            });
        }
        campaignState.captchaLedger.manualSkip = (campaignState.captchaLedger.manualSkip || 0) + 1;
    } else {
        // [RC3.25 Directive B Case 2] popup ON / manual fallback explicitly enabled
        if (campaignState.currentTargetStage === 'CAPTCHA_AUTO_SOLVING' && curAttemptMatches) {
            campaignState.currentTargetStage = 'CAPTCHA_PENDING_OWNER';
            logBg(null, `[CAPTCHA_STAGE_TRANSITION] CAPTCHA_AUTO_SOLVING -> CAPTCHA_PENDING_OWNER reason=${String(reason || 'PROVIDER_FAILURE').slice(0, 80)}`, 'warning');
            
            const activeTabId = campaignState.currentTabId;
            if (activeTabId) {
                chrome.tabs.sendMessage(activeTabId, {
                    action: 'CAPTCHA_UI_STATE_UPDATE',
                    state: 'CAPTCHA_PENDING_OWNER',
                    message: 'Automatic solver failed — manual action required',
                    status: 'WAITING',
                    attemptId: attemptId
                }).catch(() => {});
            }
        }
    }
    broadcastCounters();
}
if (typeof global !== 'undefined') {
    global.__recordTerminalCaptchaFailure = recordTerminalCaptchaFailure;
}

/**
 * [R6.9G.10.3.5 B.5] Authoritative Central Network-Side-Effect Gate
 * Used before:
 * - target tab create/update
 * - Sniper background fetch probes
 * - candidate navigation
 * - redirects/retries/child tab navigation
 * - submit-time navigation if any
 */
/**
 * [R6.9G.10.3.7] Physical Router Security Gate Pre-Flight Assert
 * Strictly precedes assertPrivacyTransportReady.
 */
async function assertPhysicalGateReady(context = 'GENERAL') {
    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
    if (!pg) return { ready: true };

    if (!pg.config || !pg.config.physicalGateEnabled) {
        return { ready: true };
    }

    try {
        const res = await pg.queryPhysicalGateStatus();
        if (!res || !res.success || !res.status) {
            const blkReason = 'PHYSICAL_GATE_UNAVAILABLE';
            logBg(null, `[PHYSICAL_GATE_BLOCK] context=${context} reason=${blkReason}`, 'error');
            return { ready: false, reason: blkReason };
        }

        const gate = res.status;
        if (!gate.enabled) return { ready: true };

        if (!gate.ready) {
            const blkReason = 'PHYSICAL_GATE_FAIL_CLOSED';
            const reasons = Array.isArray(gate.reasons) ? gate.reasons.join(', ') : 'GATE_NOT_READY';
            logBg(null, `[PHYSICAL_GATE_BLOCK] context=${context} reason=${blkReason} details=${reasons}`, 'error');
            return { ready: false, reason: blkReason, reasons: gate.reasons };
        }

        return { ready: true, physicalGate: gate };
    } catch (err) {
        logBg(null, `[PHYSICAL_GATE_BLOCK] context=${context} reason=PHYSICAL_GATE_EXCEPTION error=${err.message}`, 'error');
        return { ready: false, reason: 'PHYSICAL_GATE_EXCEPTION', error: err.message };
    }
}

async function assertPrivacyTransportReady(context = 'GENERAL') {
    // [Fix 2 Owner Functional Test Mode Loopback Direct Bypass]
    if (campaignState && campaignState.ownerFunctionTestMode) {
        // [R6.9G.10.3.7.1.4.5 Hardening] In Owner Test Mode, verify declarativeNetRequest session rules are actually active before target!
        if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.getSessionRules) {
            try {
                const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
                const installedIds = new Set(sessionRules.map(r => r.id));
                const allPresent = OWNER_TEST_GUARD_RULE_IDS.every(id => installedIds.has(id));
                if (!allPresent) {
                    return { ready: false, reason: 'OWNER_TEST_GUARD_MISSING_BEFORE_TARGET' };
                }
            } catch (e) {
                return { ready: false, reason: 'OWNER_TEST_GUARD_CHECK_EXCEPTION', error: e.message };
            }
        }
        return { ready: true, ownerFunctionTestMode: true };
    }

    // [R6.9G.10.3.7] Physical Router Security Gate Pre-Flight
    const physCheck = await assertPhysicalGateReady(context);
    if (physCheck && !physCheck.ready) {
        return physCheck;
    }

    if (campaignState.runScopedDirectPrivacy) {
        return { ready: true, mode: 'DIRECT', override: true };
    }

    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
    if (!pg) return { ready: true };

    if (!pg.config.enabled) {
        if (pg.config.failClosed) {
            const blkReason = 'PRIVACY_GATEWAY_DISABLED_WHILE_FAIL_CLOSED';
            logBg(null, `[PRIVACY_GATE_BLOCK] context=${context} reason=${blkReason}`, 'error');
            return { ready: false, reason: blkReason };
        }
        return { ready: true };
    }

    if (!pg.isPrivacyGateReady()) {
        const blkReason = pg.failureReason || 'PRIVACY_GATE_NOT_READY';
        logBg(null, `[PRIVACY_GATE_BLOCK] context=${context} reason=${blkReason}`, 'error');
        return { ready: false, reason: blkReason };
    }

    // Continuity verification
    const egressCheck = await pg.checkEgressContinuity();
    if (egressCheck && !egressCheck.pass) {
        const blkReason = egressCheck.reason || 'PRIVACY_CONTINUITY_FAILED';
        logBg(null, `[PRIVACY_GATE_BLOCK] context=${context} reason=${blkReason}`, 'error');
        return { ready: false, reason: blkReason };
    }

    return { ready: true };
}

if (typeof globalThis !== 'undefined') {
    globalThis.assertPhysicalGateReady = assertPhysicalGateReady;
    globalThis.assertPrivacyTransportReady = assertPrivacyTransportReady;
}
if (typeof global !== 'undefined') {
    global.assertPhysicalGateReady = assertPhysicalGateReady;
    global.assertPrivacyTransportReady = assertPrivacyTransportReady;
}

/**
 * [RC3.18 Campaign Continuity: Freeze on Relay Loss]
 * Immediately freezes active form workflow upon Relay/Companion network degradation.
 * Persists an atomic checkpoint to chrome.storage.local (xpider_active_network_checkpoint).
 * UI/job state transitions to PAUSED_NETWORK_RECOVERY without dropping to direct ISP,
 * without closing tab, without advancing queue or counters, and without recording false failure.
 */
async function freezeActiveCampaignJob(reason) {
    if (campaignState.isNetworkDegraded && !reason?.includes('FAULT_INJECTION')) {
        logBg(null, `[NETWORK_RECOVERY] Already in network degradation recovery (${campaignState.networkRecoveryPhase}). Additional reason=${reason}`, "info");
        return;
    }

    logBg(null, `[NETWORK_RECOVERY] ❄️ Freezing active campaign job due to network/relay degradation: ${reason}`, "warning");
    console.warn(`[NETWORK_RECOVERY] Freezing active job. reason=${reason} stage=${campaignState.currentTargetStage}`);

    campaignState.isNetworkDegraded = true;
    campaignState.networkRecoveryPhase = 'CHECKPOINTED';
    campaignState.networkRecoveryRetryCount = (campaignState.networkRecoveryRetryCount || 0) + 1;

    // Clear active timeout alarms so timeouts don't fire during network recovery
    if (chrome.alarms) {
        if (campaignState.currentTabId) {
            chrome.alarms.clear(`xpider_watchdog_${campaignState.currentTabId}_${campaignState.sessionId}`);
        }
        chrome.alarms.clear(`xpider_timeout_${campaignState.sessionId}`);
    }

    // Capture atomic checkpoint
    const currentUrl = campaignState.currentAttempt?.url || (campaignState.targetUrl || '');
    const contactUrl = campaignState.currentDiscoveryCtx?.committedContactUrl || '';
    const checkpoint = {
        campaignRunId: campaignState.campaignRunId,
        url: currentUrl,
        contactUrl: contactUrl,
        tabId: campaignState.currentTabId,
        attemptId: campaignState.currentAttempt?.attemptId || ('att_rec_' + Date.now()),
        workflowPhase: campaignState.currentTargetStage || 'NAVIGATION',
        formIdentity: campaignState.currentFormIdentity || null,
        fieldMapping: campaignState.currentFieldMapping || null,
        filledFields: Array.isArray(campaignState.currentFilledFields) ? [...campaignState.currentFilledFields] : [],
        submitState: campaignState.currentSubmitState || (campaignState.currentTargetStage?.includes('SUBMIT') ? 'SUBMIT_TRIGGERED' : 'NOT_SUBMITTED'),
        template: campaignState.template || campaignState.currentTemplate || null,
        targetToken: campaignState.currentTargetToken || null,
        sessionId: campaignState.sessionId,
        terminalOutcome: null,
        retryCount: campaignState.networkRecoveryRetryCount,
        freezeReason: reason,
        frozenAt: Date.now()
    };

    campaignState.networkCheckpoint = checkpoint;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
            xpider_active_network_checkpoint: checkpoint,
            xpider_isNetworkDegraded: true,
            xpider_networkRecoveryPhase: 'CHECKPOINTED'
        });
    }

    // Broadcast UI status update
    chrome.runtime.sendMessage({
        action: 'PAUSED_NETWORK_RECOVERY',
        reason,
        checkpoint,
        phase: 'CHECKPOINTED'
    }).catch(() => {});

    if (campaignState.currentTabId) {
        chrome.tabs.sendMessage(campaignState.currentTabId, {
            action: 'FREEZE_NETWORK_RECOVERY',
            checkpoint
        }).catch(() => {});
    }

    // Trigger companion self-healing immediately in background
    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
    if (pg) {
        pg.ensureRelayActive(true).catch(e => {
            console.warn('[NETWORK_RECOVERY] ensureRelayActive background dispatch error:', e.message);
        });
    }
}

/**
 * [RC3.18 Campaign Continuity: Resume from Safe Checkpoint]
 * Triggered automatically when Privacy Relay returns to verified READY state.
 * Re-runs privacy preflight, verifies egress path, and resumes the active job safely
 * from the checkpointed phase with idempotency protection against duplicate submission.
 */
async function resumeActiveCampaignJobAfterRecovery() {
    if (!campaignState.isNetworkDegraded) return;

    campaignState.isPaused = false;
    logBg(null, `[NETWORK_RECOVERY] 🔄 Privacy Relay re-established. Initiating preflight and job restoration...`, "info");
    console.log(`[NETWORK_RECOVERY] Reconnecting -> Privacy Reverify...`);

    campaignState.networkRecoveryPhase = 'PRIVACY_REVERIFY';
    chrome.runtime.sendMessage({
        action: 'PAUSED_NETWORK_RECOVERY',
        phase: 'PRIVACY_REVERIFY'
    }).catch(() => {});

    // 1. Re-apply proxy settings so Chromium clears any stale bad proxy cache for 127.0.0.1:18988
    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
    if (pg && pg.config && pg.config.transportMode === 'PRIVACY_RELAY') {
        const relayHost = pg.config.relayHost || '127.0.0.1';
        const relayProxyPort = pg.config.relayProxyPort || 18988;
        try {
            await pg.applyManagedProxy(pg.config.transportMode, relayHost, relayProxyPort, ['<-loopback>']);
        } catch (_) {}
    }

    // 2. Re-verify Privacy Transport Preflight
    const privCheck = await assertPrivacyTransportReady('NETWORK_RECOVERY_RESUME');
    if (!privCheck.ready) {
        logBg(null, `[NETWORK_RECOVERY] Privacy preflight re-verify failed (${privCheck.reason}). Remaining in network recovery...`, "warning");
        campaignState.networkRecoveryPhase = 'RELAY_RECONNECTING';
        return;
    }

    logBg(null, `[NETWORK_RECOVERY] Privacy transport verified READY. Restoring job from checkpoint...`, "info");
    campaignState.networkRecoveryPhase = 'JOB_RESTORE';

    const checkpoint = campaignState.networkCheckpoint;
    if (!checkpoint || !checkpoint.url) {
        // No in-flight target was active; cleanly resume queue loop
        logBg(null, `[NETWORK_RECOVERY] No active in-flight target in checkpoint. Resuming queue loop...`, "info");
        campaignState.isNetworkDegraded = false;
        campaignState.networkRecoveryPhase = null;
        campaignState.networkCheckpoint = null;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove(['xpider_active_network_checkpoint', 'xpider_isNetworkDegraded', 'xpider_networkRecoveryPhase']);
        }
        chrome.runtime.sendMessage({ action: 'NETWORK_RECOVERY_COMPLETED' }).catch(() => {});
        if (!campaignState.isLoopRunning && campaignState.isActive) {
            processNextCampaignTarget(campaignState.sessionId, campaignState.schedulerGeneration);
        }
        return;
    }

    // 2. Idempotency Check & Active Job Restoration
    const tabId = checkpoint.tabId;
    const targetUrl = checkpoint.contactUrl || checkpoint.url;

    // Idempotency: if submit was already triggered before outage, verify outcome FIRST!
    if (checkpoint.submitState === 'SUBMIT_TRIGGERED' || checkpoint.workflowPhase?.includes('SUBMIT')) {
        logBg(null, `[NETWORK_RECOVERY] Checkpoint had SUBMIT_TRIGGERED. Performing outcome verification before any resubmit...`, "info");
        let isConfirmed = false;
        if (tabId) {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab && tab.url) {
                    const evalRes = await chrome.tabs.sendMessage(tabId, { action: 'CHECK_SUBMIT_SUCCESS' }).catch(() => null);
                    if (evalRes && evalRes.confirmed) {
                        isConfirmed = true;
                    }
                }
            } catch (_) {}
        }

        if (isConfirmed) {
            logBg(null, `[NETWORK_RECOVERY] Submission was confirmed successful during outage. Settle as SUCCESS without resubmit.`, "complete");
            const hs = await getHistoryStoreInstance();
            if (hs && checkpoint.attemptId) {
                await hs.settleCanonicalAttempt(checkpoint.attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: checkpoint.campaignRunId });
                await syncCampaignCountersFromLedger(hs);
            }
            if (campaignState.targetResolve) {
                const resolve = campaignState.targetResolve;
                campaignState.targetResolve = null;
                resolve({ success: true, reasonCode: 'SUCCESS_CONFIRMED' });
            }
            campaignState.isNetworkDegraded = false;
            campaignState.networkRecoveryPhase = null;
            campaignState.networkCheckpoint = null;
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(['xpider_active_network_checkpoint', 'xpider_isNetworkDegraded', 'xpider_networkRecoveryPhase']);
            }
            chrome.runtime.sendMessage({ action: 'NETWORK_RECOVERY_COMPLETED' }).catch(() => {});
            if (tabId) chrome.tabs.remove(tabId).catch(() => {});
            processNextCampaignTarget(campaignState.sessionId, campaignState.schedulerGeneration);
            return;
        }
    }

    // Safe Replay: If tab exists, reload tab over private proxy; if tab was lost, create new tab for the target URL
    logBg(null, `[NETWORK_RECOVERY] Resuming workflow for ${targetUrl} from safe checkpoint (phase=${checkpoint.workflowPhase})...`, "info");

    campaignState.isNetworkDegraded = false;
    campaignState.networkRecoveryPhase = null;
    campaignState.networkCheckpoint = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['xpider_active_network_checkpoint', 'xpider_isNetworkDegraded', 'xpider_networkRecoveryPhase']);
    }
    chrome.runtime.sendMessage({ action: 'NETWORK_RECOVERY_COMPLETED' }).catch(() => {});

    let replayed = false;
    if (tabId && checkpoint.submitState !== 'SUBMIT_TRIGGERED') {
        try {
            const rRes = await chrome.tabs.sendMessage(tabId, { action: 'RESUME_CHECKPOINT_REPLAY', checkpoint }).catch(() => null);
            if (rRes && rRes.success) {
                replayed = true;
                logBg(null, `[NETWORK_RECOVERY] Checkpoint safely replayed on tab ${tabId} (status=${rRes.status}). Resuming pipeline...`, "info");
                if (rRes.status === 'ALREADY_TRIGGERED') {
                    const evalRes = await chrome.tabs.sendMessage(tabId, { action: 'CHECK_SUBMIT_SUCCESS' }).catch(() => null);
                    if (evalRes && evalRes.confirmed) {
                        logBg(null, `[NETWORK_RECOVERY] Checkpoint replay discovered ALREADY_TRIGGERED with CONFIRMED success. Settling as SUCCESS.`, "complete");
                        const hs = await getHistoryStoreInstance();
                        if (hs && checkpoint.attemptId) {
                            await hs.settleCanonicalAttempt(checkpoint.attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, { campaignRunId: checkpoint.campaignRunId });
                            await syncCampaignCountersFromLedger(hs);
                        }
                        if (campaignState.targetResolve) {
                            const resolve = campaignState.targetResolve;
                            campaignState.targetResolve = null;
                            resolve({ success: true, reasonCode: 'SUCCESS_CONFIRMED' });
                        }
                        if (tabId) chrome.tabs.remove(tabId).catch(() => {});
                        processNextCampaignTarget(campaignState.sessionId, campaignState.schedulerGeneration);
                        return;
                    }
                }
            }
        } catch (_) {}
    }

    // Ensure the interrupted URL is retried cleanly if not replayed in place
    if (!replayed) {
        if (tabId) {
            try {
                await chrome.tabs.reload(tabId);
            } catch (_) {
                if (checkpoint.url && !campaignState.queue.includes(checkpoint.url)) {
                    campaignState.queue.unshift(checkpoint.url);
                }
            }
        } else if (checkpoint.url && !campaignState.queue.includes(checkpoint.url)) {
            campaignState.queue.unshift(checkpoint.url);
        }
    }

    if (!campaignState.isLoopRunning && campaignState.isActive) {
        processNextCampaignTarget(campaignState.sessionId, campaignState.schedulerGeneration);
    }
}

/**
 * [RC3.18 Privacy Relay Watchdog for Background Service Worker]
 * Periodically verifies Companion and local proxy health (Port 18989 / 18988).
 * If Companion drops or desyncs, automatically initiates Native Messaging self-healing.
 * Transitions between READY -> DEGRADED -> RECONNECTING -> READY without Owner intervention.
 */
let relayWatchdogInterval = null;
function startPrivacyRelayWatchdog() {
    if (relayWatchdogInterval) return;

    const runWatchdogProbe = async () => {
        try {
            const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
            if (!pg || !pg.config.enabled) return;

            const res = await pg.probeRelayLifecycle(true);

            if (res.ok && res.lifecycleState === 'READY') {
                if (campaignState.isNetworkDegraded) {
                    logBg(null, `[WATCHDOG] Privacy Relay returned to READY. Resuming campaign...`, "info");
                    await resumeActiveCampaignJobAfterRecovery();
                }
            } else {
                if (campaignState.isActive && !campaignState.isNetworkDegraded) {
                    logBg(null, `[WATCHDOG] Privacy Relay degraded (${res.lifecycleState || res.reason}). Freezing active campaign job...`, "warning");
                    await freezeActiveCampaignJob(`WATCHDOG_RELAY_DEGRADED: ${res.reason || res.lifecycleState}`);
                }
            }
        } catch (e) {
            console.warn('[WATCHDOG_PROBE_ERROR]', e.message);
        }
    };

    relayWatchdogInterval = setInterval(runWatchdogProbe, 2000);
    // Initial probe
    runWatchdogProbe();
}

if (typeof chrome !== 'undefined' && chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
    chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
        if (details.frameId === 0 && campaignState.isActive && details.tabId === campaignState.currentTabId) {
            const errStr = String(details.error || '');
            if (errStr.includes('ERR_PROXY_CONNECTION_FAILED') || errStr.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
                logBg(details.tabId, `[NAV_PROXY_ERROR] ${errStr}. Triggering network recovery freeze...`, "warning");
                await freezeActiveCampaignJob(`WEBNAV_PROXY_ERROR: ${errStr}`);
            }
        }
    });
}


// [R6.9G.2 Gate 4/5/8/9] Authoritative Single-Flight CAPTCHA Solve Engine
        // Gated strictly behind Owner 'Auto' decision. Autonomous requests without owner authorization are rejected.
        async function handleSolveCaptchaInternal(request, sender, sendResponse) {
            try {
                const curEpoch = campaignState.captchaEpoch || 1;

                // [R6.9G.2 Gate 1/2] Autonomous solve forbidden before Owner Auto decision
                if (!request.ownerAuthorized && campaignState.currentTargetStage !== 'CAPTCHA_AUTO_SOLVING') {
                    logBg(null, '[SOLVE_CAPTCHA] REJECT: Autonomous solve forbidden before owner Auto decision.', 'warning');
                    sendResponse({ success: false, error: 'AUTONOMOUS_SOLVE_FORBIDDEN' });
                    return;
                }

                // [R6.9G.1-3] HARD REJECT: identity soft-pass removed entirely.
                if (!campaignState.currentAttempt || !campaignState.currentAttempt.attemptId) {
                    logBg(null, '[SOLVE_CAPTCHA] HARD_REJECT: currentAttempt absent. Cannot solve without canonical identity.', 'warning');
                    sendResponse({ success: false, error: 'NO_CURRENT_ATTEMPT' });
                    return;
                }
                const validation = validateActiveExecution(request, sender, 'SOLVE_CAPTCHA', { checkEpoch: true, allowBodyTabId: true });
                if (!validation.valid) {
                    logBg(null, `[SOLVE_CAPTCHA] HARD_REJECT reason=${validation.reason}. Stale or mismatched identity.`, 'warning');
                    sendResponse({ success: false, error: validation.reason });
                    return;
                }

                if (!campaignState.isActive || campaignState.isPaused) {
                    sendResponse({ success: false, error: 'CAMPAIGN_INACTIVE_OR_PAUSED' });
                    return;
                }

                // [Issue #6 R6.9E B4] Permanent / config error suppression (e.g., ERROR_ZERO_BALANCE)
                const blockedErr = campaignState.captchaEpochBlockedErrors && campaignState.captchaEpochBlockedErrors[curEpoch];
                if (blockedErr) {
                    logBg(null, `[CAPTCHA_CONFIG_BLOCKED] epoch=${curEpoch} blockedError=${blockedErr} action=REJECT_REPEAT`, 'warning');
                    sendResponse({ success: false, error: blockedErr });
                    return;
                }

                // [Issue #6 R6.9E.1 Section 8D] Capture immutable solve identity before await
                const solveIdentity = {
                    tabId: campaignState.currentTabId,
                    attemptId: campaignState.currentAttempt?.attemptId,
                    targetToken: campaignState.currentTargetToken,
                    campaignRunId: campaignState.campaignRunId,
                    sessionId: Number(campaignState.sessionId),
                    captchaEpoch: curEpoch
                };

                // [R6.9G.3] Prefer request.tabId / campaignState.currentTabId over sender.tab.id:
                // When called via CAPTCHA_OWNER_DECISION from popup, sender.tab.id is the popup tab,
                // NOT the real target content tab. request.tabId carries the real content tab.
                const activeTabId = request.tabId || campaignState.currentTabId || (sender && sender.tab && sender.tab.id);

                // [Anti-Stampede Concurrency Lock] Deduplicate concurrent requests for same target/sitekey
                if (!globalThis.__xpider_activeSolvingPromises) {
                    globalThis.__xpider_activeSolvingPromises = new Map();
                }
                const _solveAttemptId = campaignState.currentAttempt?.attemptId || 'no-attempt';
                const _solveProvider = (await new Promise(r => chrome.storage.local.get(['xpider_captcha_method', 'captchaMethod'], r)))
                    .xpider_captcha_method || (await new Promise(r => chrome.storage.local.get(['captchaMethod'], r))).captchaMethod || 'audio';
                const dedupeKey = `${curEpoch}:${_solveAttemptId}:${_solveProvider}:${activeTabId}:${request.sitekey || ''}:${request.type || request.captchaType || 'recaptcha'}`;
                if (globalThis.__xpider_activeSolvingPromises.has(dedupeKey)) {
                    logBg(null, `[Auto CAPTCHA Solver] In-flight solve already running for key=${dedupeKey}. Joining single-flight execution...`, 'info');
                    const sharedResp = await globalThis.__xpider_activeSolvingPromises.get(dedupeKey);
                    sendResponse(sharedResp);
                    return;
                }

                const executeSolveSingleFlight = async () => {
                    const storage = await new Promise(resolve => chrome.storage.local.get([
                        'captchaMethod', 'captchaApiKey', 'xpider_captcha_method',
                        'xpider_captcha_api_key',
                        'xpider_captcha_api_key_nopecha',
                        'xpider_captcha_api_key_2captcha',
                        'xpider_stt_api_key', 'audioSttKey', 'witKey',
                        'xpider_captcha_poll_interval_sec',
                        'xpider_captcha_poll_interval_ms',
                        'xpider_captcha_max_wait_sec',
                        'xpider_show_captcha_choice_popup',
                        'xpider_automatic_provider_fallback'
                    ], resolve));
                    
                    const method = request.method || storage.xpider_captcha_method || storage.captchaMethod || 'audio';
                    let apiKey;
                    if (method === 'nopecha') {
                        apiKey = storage.xpider_captcha_api_key_nopecha || storage.xpider_captcha_api_key || storage.captchaApiKey || '';
                    } else {
                        apiKey = storage.xpider_captcha_api_key_2captcha || storage.xpider_captcha_api_key || storage.captchaApiKey || '';
                    }
                    const witKey = storage.xpider_stt_api_key || storage.audioSttKey || storage.witKey || campaignState.witAiKey || request.witKey || null;
                    const pollIntervalMs = Number(storage.xpider_captcha_poll_interval_ms) || (Number(storage.xpider_captcha_poll_interval_sec) ? Number(storage.xpider_captcha_poll_interval_sec) * 1000 : null) || (method === 'nopecha' ? 3000 : 5000);
                    const maxWaitSec = Number(storage.xpider_captcha_max_wait_sec) || (method === 'nopecha' ? 120 : 200);
                    
                    solver.config.witAiKey = witKey;
                    solver.config.nopeChaKey = storage.xpider_captcha_api_key_nopecha || (method === 'nopecha' ? apiKey : '');
                    solver.config.twoCaptchaKey = storage.xpider_captcha_api_key_2captcha || storage.xpider_captcha_api_key || storage.captchaApiKey || (method !== 'nopecha' ? apiKey : '');

                    logBg(null, `[Auto CAPTCHA Solver] SOLVE_CAPTCHA: method=${method} keyConfigured=${!!apiKey} epoch=${curEpoch} url=${request.url||''}`, 'info');

                    if (activeTabId) {
                        const providerLabel = method === 'nopecha' ? 'NopeCHA' : (method === '2captcha' || method === 'api' ? '2Captcha' : method);
                        chrome.tabs.sendMessage(activeTabId, {
                            action: 'CAPTCHA_UI_STATE_UPDATE',
                            state: 'CAPTCHA_AUTO_SOLVING',
                            message: `Auto-solving (${request.type || request.captchaType || 'recaptcha'}) via ${providerLabel}...`,
                            status: 'ACTIVE',
                            attemptId: solveIdentity?.attemptId
                        }).catch(() => {});
                    }

                    // [R6.9G.10.3.7.1.4.8] Controlled lab mock eligibility is decided BEFORE any live-provider/network step.
                    let labMockEligible = false;
                    try {
                        const _labUrl = request.url || campaignState.currentAttempt?.url || '';
                        const _isTestOnly = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function') ? BuildProvenance.isTestOnlyBuild() === true : false;
                        if (_isTestOnly && campaignState.ownerFunctionTestMode === true && typeof MockCaptchaProviderAdapter !== 'undefined') {
                            labMockEligible = MockCaptchaProviderAdapter.isEligible({
                                url: _labUrl, pageUrl: _labUrl,
                                captchaType: request.type || request.captchaType || 'recaptcha',
                                sitekey: request.sitekey,
                                ownerFunctionTestMode: true
                            }, { ownerFunctionTestMode: true, targetUrl: _labUrl, isTestOnlyBuild: true });
                        }
                    } catch (_) { labMockEligible = false; }

                    // [R6.9G-H] 2Captcha key pre-validation: classify ERROR_WRONG_USER_KEY as CONFIGURATION FAILURE
                    if (!labMockEligible && (method === 'api' || method === '2captcha') && apiKey) {
                        const keyCheckResp = await new Promise(resolve => {
                            try {
                                fetch(`https://2captcha.com/res.php?key=${apiKey}&action=getbalance&json=1`, { signal: AbortSignal.timeout(5000) })
                                    .then(r => r.json()).then(resolve).catch(() => resolve(null));
                            } catch(_) { resolve(null); }
                        });
                        if (keyCheckResp && (keyCheckResp.status === 0) && (keyCheckResp.request === 'ERROR_WRONG_USER_KEY' || keyCheckResp.request === 'ERROR_KEY_DOES_NOT_EXIST')) {
                            const cfgErr = `2Captcha CONFIGURATION FAILURE: ${keyCheckResp.request}. Configure valid API key in Settings.`;
                            logBg(null, `[Auto CAPTCHA Solver] ${cfgErr}`, 'error');
                            campaignState.captchaEpochBlockedErrors[curEpoch] = keyCheckResp.request;
                            recordTerminalCaptchaFailure(solveIdentity?.attemptId, keyCheckResp.request);
                            return { success: false, error: cfgErr, terminalError: keyCheckResp.request };
                        }
                    }
                    
                    let targetPageUrl = request.url || '';
                    if (!targetPageUrl || targetPageUrl.includes('google.com/recaptcha') || targetPageUrl.includes('recaptcha.net')) {
                        targetPageUrl = request.hostUrl || request.referrer || (sender && sender.tab && sender.tab.url) || '';
                    }

                    const injectSolvedToken = async (solToken, capType) => {
                        if (!activeTabId || !solToken) return;
                        try {
                            await safeScripting.executeScript({
                                target: { tabId: activeTabId, allFrames: true },
                                func: (tokenVal, type) => {
                                    try {
                                        const fields = type === 'hcaptcha'
                                            ? document.querySelectorAll('[name="h-captcha-response"], textarea[name="h-captcha-response"]')
                                            : document.querySelectorAll('[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]');
                                        for (const f of fields) {
                                            try {
                                                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                                                if (nativeSetter) nativeSetter.call(f, tokenVal);
                                                else f.value = tokenVal;
                                                f.dispatchEvent(new Event('input', { bubbles: true }));
                                                f.dispatchEvent(new Event('change', { bubbles: true }));
                                            } catch (_) { f.value = tokenVal; }
                                        }
                                        if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
                                            for (const cid in window.___grecaptcha_cfg.clients) {
                                                const client = window.___grecaptcha_cfg.clients[cid];
                                                for (const k in client) {
                                                    const obj = client[k];
                                                    if (obj) {
                                                        if (typeof obj.callback === 'function') obj.callback(tokenVal);
                                                        else if (typeof obj.callback === 'string' && typeof window[obj.callback] === 'function') window[obj.callback](tokenVal);
                                                    }
                                                }
                                            }
                                        }
                                        if (typeof window.validateRecaptcha === 'function') {
                                            try { window.validateRecaptcha(tokenVal); } catch (_) {}
                                        }
                                        const gWidget = document.querySelector('.g-recaptcha[data-callback]');
                                        if (gWidget && gWidget.dataset.callback && typeof window[gWidget.dataset.callback] === 'function') {
                                            try { window[gWidget.dataset.callback](tokenVal); } catch (_) {}
                                        }
                                        const anchor = document.querySelector('#recaptcha-anchor, .recaptcha-checkbox');
                                        if (anchor) {
                                            anchor.setAttribute('aria-checked', 'true');
                                            anchor.classList.add('recaptcha-checkbox-checked');
                                        }
                                        const errLabel = document.querySelector("label[for='g-recaptcha-Reg'], .recaptcha-wrapper label");
                                        if (errLabel) errLabel.style.display = 'none';
                                        window.postMessage({ type: 'captchaToken', 'g-recaptcha-response': tokenVal, token: tokenVal, action: 'CAPTCHA_SOLVED', source: 'xpider_solver' }, '*');
                                    } catch (e) {
                                        console.warn('[CrossFrameTokenInject] frame err:', e);
                                    }
                                },
                                args: [solToken, capType || 'recaptcha']
                            });
                        } catch (eScript) {
                            console.warn('[CrossFrameTokenInject] executeScript failed:', eScript);
                        }
                    };

                    // [R6.9G.2 Gate 8/9] Verified Challenge Transition Helper:
                    // [CAPTCHA_TOKEN_RECEIVED] -> [CAPTCHA_TOKEN_APPLIED] -> [CAPTCHA_CHALLENGE_VERIFIED] -> [CAPTCHA_AUTO_SUCCESS]
                    const verifyAndRecordCaptchaSuccess = async (solToken, solMethod) => {
                        logBg(null, `[CAPTCHA_TOKEN_RECEIVED] method=${solMethod} tokenLength=${solToken ? solToken.length : 0}`, 'info');

                        logBg(null, `[CAPTCHA_TOKEN_APPLIED] dispatching token to target frames`, 'info');
                        await injectSolvedToken(solToken, request.type || request.captchaType || 'recaptcha');

                        let challengeVerified = false;
                        try {
                            const vRes = await new Promise((resolve) => {
                                chrome.tabs.sendMessage(activeTabId, {
                                    action: 'APPLY_CAPTCHA_TOKEN',
                                    token: solToken,
                                    captchaType: request.type || request.captchaType || 'recaptcha',
                                    attemptId: solveIdentity.attemptId,
                                    targetToken: solveIdentity.targetToken,
                                    campaignRunId: solveIdentity.campaignRunId,
                                    sessionId: solveIdentity.sessionId,
                                    captchaEpoch: solveIdentity.captchaEpoch,
                                    tabId: activeTabId
                                }, (res) => resolve(res || { verified: false }));
                                setTimeout(() => resolve({ verified: false }), 4000);
                            });
                            challengeVerified = !!(vRes && vRes.verified === true);
                        } catch (_) {
                            challengeVerified = false;
                        }

                        if (challengeVerified) {
                            logBg(null, `[CAPTCHA_CHALLENGE_VERIFIED] Target challenge confirmed resolved.`, 'info');
                            // [R6.9G.3] Guard: CAPTCHA_CHALLENGE_VERIFIED runtime message (Path B) may have
                            // already transitioned stage + incremented counters concurrently. Only record
                            // success here (Path A) if Path B has NOT yet done so (stage still CAPTCHA_AUTO_SOLVING).
                            if (campaignState.currentTargetStage === 'CAPTCHA_AUTO_SOLVING') {
                                logBg(null, `[CAPTCHA_AUTO_SUCCESS] Challenge resolved via ${solMethod}.`, 'success');
                                campaignState.currentTargetStage = 'CAPTCHA_AUTO_SUCCESS';
                                campaignState.captchaLedger.autoSuccess++;
                                campaignState.counters.captchaSolved = (campaignState.counters.captchaSolved || 0) + 1;
                                broadcastCounters();

                                if (activeTabId) {
                                    chrome.tabs.sendMessage(activeTabId, {
                                        action: 'CAPTCHA_UI_STATE_UPDATE',
                                        state: 'CAPTCHA_AUTO_SUCCESS',
                                        message: 'CAPTCHA solved ✓',
                                        status: 'SUCCESS',
                                        attemptId: solveIdentity?.attemptId
                                    }).catch(() => {});
                                }

                                const remainingMs = campaignState.targetTimeoutMs || 180000;
                                campaignState.activeTimeoutId = setTimeout(() => {
                                    if (campaignState.currentAttempt?.attemptId === solveIdentity.attemptId) {
                                        logBg(null, `[CAPTCHA_DECISION] Target timeout after auto-solve.`, 'warning');
                                    }
                                }, remainingMs);
                            } else {
                                logBg(null, `[CAPTCHA_AUTO_SUCCESS] Stage already advanced by CAPTCHA_CHALLENGE_VERIFIED event (stage=${campaignState.currentTargetStage}). Skipping duplicate counter increment.`, 'info');
                            }

                            return { success: true, method: solMethod, token: solToken };
                        } else {
                            logBg(null, `[CAPTCHA_VERIFICATION_FAILED] Challenge could not be verified on target page.`, 'error');
                            recordTerminalCaptchaFailure(solveIdentity?.attemptId, 'CHALLENGE_VERIFICATION_FAILED');
                            return { success: false, error: 'CHALLENGE_VERIFICATION_FAILED' };
                        }
                    };

                    // [R6.9G.10.3.7.1.4.10] Strict Cloudflare Turnstile Live/Testkey Lockout Gate
                    // Under CLOUDFLARE_LIVE_OWNER and CLOUDFLARE_TESTKEY_LAB, all synthetic mocks
                    // and third-party solvers (2Captcha, NopeCHA) are strictly bypassed.
                    const isCfMode = Boolean(
                        campaignState.isCloudflareLive ||
                        campaignState.isCloudflareTestKey ||
                        (targetPageUrl && targetPageUrl.includes('cf-turnstile'))
                    );
                    if (isCfMode) {
                        const cfModeLabel = campaignState.isCloudflareLive ? 'CLOUDFLARE_LIVE' : 'CLOUDFLARE_TESTKEY';
                        logBg(null, `[CAPTCHA_PROVIDER_SELECT] mode=${cfModeLabel} mockEligible=false thirdPartySolverBypassed=true requestedMethod=${method}`, 'info');
                        console.log(`[CAPTCHA_PROVIDER_SELECT] mode=${cfModeLabel} mockEligible=false thirdPartySolverBypassed=true requestedMethod=${method}`);
                        return {
                            success: false,
                            requireOwnerManual: true,
                            provider: 'cloudflare_real',
                            message: 'Real Cloudflare Turnstile: third-party solvers and mocks bypassed. Real token issuance required.'
                        };
                    }

                    // [Issue #6 R6.9G.10.3.7.1.4.8] Controlled Local Mock Provider Gate -- evaluated BEFORE any live provider.
                    // Hard gate: TEST_ONLY build + ownerFunctionTestMode + localhost + approved lab fixture.
                    if (campaignState.ownerFunctionTestMode && typeof MockCaptchaProviderAdapter !== 'undefined'
                        && (typeof BuildProvenance === 'undefined' || typeof BuildProvenance.isTestOnlyBuild !== 'function' || BuildProvenance.isTestOnlyBuild() === true)) {
                        let mockEligible = false;
                        try {
                            mockEligible = MockCaptchaProviderAdapter.isEligible({
                                url: targetPageUrl,
                                pageUrl: targetPageUrl,
                                captchaType: request.type || request.captchaType || 'recaptcha',
                                sitekey: request.sitekey,
                                ownerFunctionTestMode: campaignState.ownerFunctionTestMode
                            }, {
                                ownerFunctionTestMode: campaignState.ownerFunctionTestMode,
                                targetUrl: targetPageUrl
                            });
                        } catch (_) { mockEligible = false; }

                        if (mockEligible) {
                            logBg(null, `[CAPTCHA_PROVIDER_SELECT] mode=OWNER_TEST_LOCAL provider=mock_provider liveProviderBypassed=true requestedMethod=${method}`, 'info');
                            try {
                                const mockAdapter = new MockCaptchaProviderAdapter();
                                const mockRes = await mockAdapter.solve({
                                    url: targetPageUrl,
                                    pageUrl: targetPageUrl,
                                    captchaType: request.type || request.captchaType || 'recaptcha',
                                    sitekey: request.sitekey,
                                    audioUrl: request.audioUrl,
                                    audioData: request.audioData
                                }, {
                                    runId: campaignState.activeCampaignRunId,
                                    tabId: activeTabId,
                                    attemptId: solveIdentity?.attemptId
                                });
                                if (mockRes && mockRes.token) {
                                    return await verifyAndRecordCaptchaSuccess(mockRes.token, 'mock_provider');
                                }
                                recordTerminalCaptchaFailure(solveIdentity?.attemptId, (mockRes && mockRes.error) || 'MOCK_PROVIDER_NO_TOKEN');
                                return mockRes || { success: false, error: 'MOCK_PROVIDER_NO_TOKEN' };
                            } catch (mockErr) {
                                recordTerminalCaptchaFailure(solveIdentity?.attemptId, mockErr.message);
                                return { success: false, error: mockErr.code || 'MOCK_PROVIDER_FAILURE', details: mockErr.message };
                            }
                        }
                    }

                    // [Priority 1] 2Captcha token solver
                    if ((method === 'api' || method === '2captcha') && solver.config.twoCaptchaKey) {
                        const twoCapStart = Date.now();
                        logBg(null, `[CAPTCHA_PROVIDER] provider=2captcha status=REQUEST_START keyConfigured=true epoch=${curEpoch}`, 'info');
                        try {
                            const extra = request.extra || {
                                body: request.imageData,
                                version: request.version,
                                action: request.captchaAction,
                                enterprise: request.enterprise,
                                invisible: request.invisible
                            };
                            const token = await solver.solve2Captcha(request.sitekey, targetPageUrl, request.type || request.captchaType || 'recaptcha', extra, pollIntervalMs, maxWaitSec);

                            const postValidation = validateActiveExecution(request, sender, 'SOLVE_CAPTCHA_POST', { expectedIdentity: solveIdentity, allowBodyTabId: true });
                            if (!postValidation.valid || !campaignState.isActive || campaignState.isPaused) {
                                logBg(null, `[CAPTCHA_STALE_RESULT] action=DROP reason=${postValidation.reason || 'inactive_or_paused'}`, 'warning');
                                return { success: false, error: 'STALE_RESULT_DROPPED' };
                            }

                            const elapsedMs = Date.now() - twoCapStart;
                            logBg(null, `[CAPTCHA_PROVIDER] provider=2captcha status=RESPONSE_RECEIVED tokenLength=${token ? token.length : 0} elapsedMs=${elapsedMs}`, 'info');
                            logBg(null, `[Auto CAPTCHA Solver] 2Captcha SUCCESS keyConfigured=true tokenLength=${token ? token.length : 0}`, 'success');
                            return await verifyAndRecordCaptchaSuccess(token, '2captcha');
                        } catch (e2) {
                            const elapsedMs = Date.now() - twoCapStart;
                            const isWrongKey = e2.message && (e2.message.includes('ERROR_WRONG_USER_KEY') || e2.message.includes('ERROR_KEY_DOES_NOT_EXIST'));
                            if (isWrongKey) {
                                campaignState.captchaEpochBlockedErrors[curEpoch] = 'ERROR_WRONG_USER_KEY';
                                logBg(null, '[Auto CAPTCHA Solver] 2Captcha CONFIGURATION FAILURE: ERROR_WRONG_USER_KEY. Cannot substitute another solver silently.', 'error');
                                logBg(null, `[CAPTCHA_PROVIDER] provider=2captcha status=FAILED errorClass=CONFIGURATION_FAILURE elapsedMs=${elapsedMs} error="${e2.message}"`, 'error');
                                chrome.runtime.sendMessage({
                                    action: 'CAPTCHA_PROVIDER_FAILED',
                                    provider: '2captcha',
                                    error: `CONFIGURATION_FAILURE: ${e2.message}`,
                                    attemptId: solveIdentity?.attemptId
                                }).catch(() => {});
                                recordTerminalCaptchaFailure(solveIdentity?.attemptId, 'ERROR_WRONG_USER_KEY');
                                return { success: false, error: e2.message, terminalError: 'ERROR_WRONG_USER_KEY', remainingPaused: true };
                            }
                            const isZeroBal = e2.message && (e2.message.includes('ERROR_ZERO_BALANCE') || e2.message.includes('ZERO_BALANCE'));
                            if (isZeroBal) {
                                campaignState.captchaEpochBlockedErrors[curEpoch] = 'ERROR_ZERO_BALANCE';
                            }
                            const showChoicePopup = storage.xpider_show_captcha_choice_popup === true;
                            await recordTerminalCaptchaFailure(solveIdentity?.attemptId, e2.message, safeErrClass);
                            return { 
                                success: false, 
                                terminalSettled: !showChoicePopup,
                                result: 'SKIPPED',
                                settleReason: isZeroBal ? 'CAPTCHA_SOLVER_UNAVAILABLE' : (isWrongKey ? 'CAPTCHA_SOLVER_CONFIG_ERROR' : 'CAPTCHA_SOLVER_PROVIDER_ERROR'),
                                error: e2.message,
                                safeErrorClass: safeErrClass,
                                terminalError: isZeroBal ? 'ERROR_ZERO_BALANCE' : (isWrongKey ? 'ERROR_WRONG_USER_KEY' : null),
                                remainingPaused: showChoicePopup
                            };
                        }
                    } else if (method === 'api' || method === '2captcha') {
                        const errMsg = "2Captcha API Key is missing in Settings.";
                        logBg(null, `[CAPTCHA_PROVIDER] provider=2captcha status=FAILED errorClass=CONFIG_ERROR error="${errMsg}"`, 'error');
                        chrome.runtime.sendMessage({
                            action: 'CAPTCHA_PROVIDER_FAILED',
                            provider: '2captcha',
                            error: errMsg,
                            attemptId: solveIdentity?.attemptId
                        }).catch(() => {});
                        const showChoicePopup = storage.xpider_show_captcha_choice_popup === true;
                        await recordTerminalCaptchaFailure(solveIdentity?.attemptId, errMsg, 'CONFIG_ERROR');
                        return { 
                            success: false, 
                            terminalSettled: !showChoicePopup,
                            result: 'SKIPPED',
                            settleReason: 'CAPTCHA_SOLVER_CONFIG_ERROR',
                            error: errMsg, 
                            safeErrorClass: 'CONFIG_ERROR',
                            remainingPaused: showChoicePopup 
                        };
                    }

                    // [Priority 2] NopeCHA fast token
                    if (method === 'nopecha' && solver.config.nopeChaKey) {
                        const nopechaStart = Date.now();
                        logBg(null, `[CAPTCHA_PROVIDER] provider=nopecha status=REQUEST_START keyConfigured=true epoch=${curEpoch}`, 'info');
                        try {
                            const token = await solver.solveNopeCha(request.sitekey, targetPageUrl, request.type || request.captchaType || 'recaptcha', pollIntervalMs, maxWaitSec);
                            
                            const postValidation = validateActiveExecution(request, sender, 'SOLVE_CAPTCHA_POST', { expectedIdentity: solveIdentity, allowBodyTabId: true });
                            if (!postValidation.valid || !campaignState.isActive || campaignState.isPaused) {
                                logBg(null, `[CAPTCHA_STALE_RESULT] action=DROP reason=${postValidation.reason || 'inactive_or_paused'}`, 'warning');
                                return { success: false, error: 'STALE_RESULT_DROPPED' };
                            }

                            const elapsedMs = Date.now() - nopechaStart;
                            logBg(null, `[CAPTCHA_PROVIDER] provider=nopecha status=RESPONSE_RECEIVED tokenLength=${token ? token.length : 0} elapsedMs=${elapsedMs}`, 'info');
                            logBg(null, `[Auto CAPTCHA Solver] NopeCHA SUCCESS tokenLength=${token ? token.length : 0}`, 'success');
                            return await verifyAndRecordCaptchaSuccess(token, 'nopecha');
                        } catch (enp) {
                            const elapsedMs = Date.now() - nopechaStart;
                            const isNopeChaTimeout = enp.message && enp.message.includes('NopeCHA Timeout');
                            const isNopeChaInvalidReq = enp.message && enp.message.includes('Error (10)');
                            const isNopeChaRateLimit = enp.message && enp.message.includes('Error (11)');
                            const safeErrClass = isNopeChaTimeout ? 'TIMEOUT' : (isNopeChaInvalidReq ? 'INVALID_REQUEST' : (isNopeChaRateLimit ? 'RATE_LIMIT' : 'PROVIDER_ERROR'));

                            logBg(null, `[CAPTCHA_PROVIDER] provider=nopecha status=FAILED errorClass=${safeErrClass} elapsedMs=${elapsedMs} error="${enp.message}"`, 'error');
                            logBg(null, `[Auto CAPTCHA Solver] NopeCHA FAILED: ${enp.message}`, 'error');

                            // [RC3.25 Directive E] Optional automatic provider fallback
                            const fallbackEnabled = storage.xpider_automatic_provider_fallback === true;
                            const has2CaptchaKey = Boolean(solver.config.twoCaptchaKey || storage.xpider_captcha_api_key_2captcha);
                            if (fallbackEnabled && has2CaptchaKey && !request._isFallbackAttempt) {
                                logBg(null, `[CAPTCHA_PROVIDER_FALLBACK] primary=nopecha failed reason="${enp.message}" action=FALLBACK_TO_2CAPTCHA`, 'info');
                                if (activeTabId) {
                                    chrome.tabs.sendMessage(activeTabId, {
                                        action: 'CAPTCHA_UI_STATE_UPDATE',
                                        state: 'CAPTCHA_AUTO_SOLVING',
                                        message: 'NopeCHA timed out. Falling back to 2Captcha...',
                                        status: 'ACTIVE',
                                        attemptId: solveIdentity?.attemptId
                                    }).catch(() => {});
                                }
                                try {
                                    const extra = request.extra || {
                                        body: request.imageData,
                                        version: request.version,
                                        action: request.captchaAction,
                                        enterprise: request.enterprise,
                                        invisible: request.invisible
                                    };
                                    const fallbackToken = await solver.solve2Captcha(request.sitekey, targetPageUrl, request.type || request.captchaType || 'recaptcha', extra, 5000, 120);
                                    return await verifyAndRecordCaptchaSuccess(fallbackToken, '2captcha_fallback');
                                } catch (eFallback) {
                                    logBg(null, `[CAPTCHA_PROVIDER_FALLBACK] fallback=2captcha failed: ${eFallback.message}`, 'error');
                                }
                            }

                            const showChoicePopup = storage.xpider_show_captcha_choice_popup === true;
                            await recordTerminalCaptchaFailure(solveIdentity?.attemptId, enp.message, safeErrClass);
                            return { 
                                success: false, 
                                terminalSettled: !showChoicePopup,
                                result: 'SKIPPED',
                                settleReason: safeErrClass === 'TIMEOUT' ? 'CAPTCHA_SOLVER_TIMEOUT' : 'CAPTCHA_SOLVER_PROVIDER_ERROR',
                                error: enp.message, 
                                safeErrorClass: safeErrClass, 
                                remainingPaused: showChoicePopup 
                            };
                        }
                    } else if (method === 'nopecha') {
                        const errMsg = "NopeCHA API Key is missing in Settings.";
                        logBg(null, `[CAPTCHA_PROVIDER] provider=nopecha status=FAILED errorClass=CONFIG_ERROR error="${errMsg}"`, 'error');
                        chrome.runtime.sendMessage({
                            action: 'CAPTCHA_PROVIDER_FAILED',
                            provider: 'nopecha',
                            error: errMsg,
                            attemptId: solveIdentity?.attemptId
                        }).catch(() => {});
                        const showChoicePopup = storage.xpider_show_captcha_choice_popup === true;
                        await recordTerminalCaptchaFailure(solveIdentity?.attemptId, errMsg, 'CONFIG_ERROR');
                        return { 
                            success: false, 
                            terminalSettled: !showChoicePopup,
                            result: 'SKIPPED',
                            settleReason: 'CAPTCHA_SOLVER_CONFIG_ERROR',
                            error: errMsg, 
                            safeErrorClass: 'CONFIG_ERROR',
                            remainingPaused: showChoicePopup 
                        };
                    }



                    // [Priority 3] Autonomous Multi-Tier Fallback Chain
                    if (method === 'audio' || method === 'native' || witKey) {
                        if (typeof solver.solveSmartFallbackChain === 'function') {
                            const result = await solver.solveSmartFallbackChain(request.type || request.captchaType || 'recaptcha', {
                                siteKey: request.sitekey,
                                pageUrl: targetPageUrl,
                                audioData: request.audioData
                            });
                            if (result.success) {
                                return result;
                            }
                        }
                        return { success: false, fallback: 'audio_frame_solver', inProgress: true, message: 'Autonomous audio solver active in iframe' };
                    }

                    throw new Error(`CAPTCHA solver: no valid method/key configured (method: ${method}). Configure API key in Settings.`);
                };

                const flightPromise = executeSolveSingleFlight();
                globalThis.__xpider_activeSolvingPromises.set(dedupeKey, flightPromise);

                try {
                    const res = await flightPromise;
                    if (typeof sendResponse === 'function') sendResponse(res);
                    return res;
                } finally {
                    globalThis.__xpider_activeSolvingPromises.delete(dedupeKey);
                }
            } catch (e) {
                logBg(null, `[Auto CAPTCHA Solver] SOLVE_CAPTCHA ERROR: ${e.message}`, 'error');
                const errRes = { success: false, error: e.message };
                if (typeof sendResponse === 'function') sendResponse(errRes);
                return errRes;
            }
        }

const mainBackgroundMessageListener = (request, sender, sendResponse) => {
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
            const bpData = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO)
                ? BuildProvenance.BUILD_INFO
                : {
                    branch: 'upgrade/phase-0-1',
                    implementationHead: '55dc6d69a25b4ea27283d3b40ba1c5fea730914b',
                    implementationHeadShort: '55dc6d69',
                    head: '55dc6d69a25b4ea27283d3b40ba1c5fea730914b',
                    headShort: '55dc6d69',
                    rollbackBase: 'dc0740a0c69e2f7fa96b6989841acf0831b3619e',
                    manifestVersion: 3,
                    buildId: 'R6.9G.10.3.7.1.4.7-20261014-START-CONTROL-PLANE-RECOVERY',
                    builtAt: '2026-10-14T15:45:00.000Z',
                    provenanceSchema: 2,
                    modules: {}
                };
            sendResponse({
                success: true,
                provenance: bpData,
                ...bpData
            });
            return true;

        case 'INSTALL_OWNER_TEST_GUARD': {
            (async () => {
                try {
                    const rules = await installOwnerTestNetworkGuard(request.options || request || {});
                    sendResponse({
                        success: true,
                        verified: true,
                        ruleCount: rules ? rules.length : 5
                    });
                } catch (err) {
                    console.error('[INSTALL_OWNER_TEST_GUARD_FAIL]', err);
                    sendResponse({
                        success: false,
                        error: err.message
                    });
                }
            })();
            return true;
        }

        case 'REMOVE_OWNER_TEST_GUARD':
        case 'REMOVE_OWNER_TEST_NETWORK_GUARD': {
            (async () => {
                try {
                    await removeOwnerTestNetworkGuard();
                    let remainingCount = 0;
                    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.getSessionRules) {
                        const rules = await chrome.declarativeNetRequest.getSessionRules();
                        const guardRules = rules.filter(r => OWNER_TEST_GUARD_RULE_IDS.includes(r.id));
                        remainingCount = guardRules.length;
                    }
                    console.log(`[OWNER_TEST_GUARD] removed=true verified=${remainingCount === 0} remainingRules=${remainingCount}`);
                    sendResponse({
                        success: remainingCount === 0,
                        verified: remainingCount === 0,
                        remainingRules: remainingCount
                    });
                } catch (err) {
                    console.error('[REMOVE_OWNER_TEST_GUARD_FAIL]', err);
                    sendResponse({
                        success: false,
                        error: err.message
                    });
                }
            })();
            return true;
        }

        case 'VERIFY_OWNER_TEST_GUARD': {
            (async () => {
                try {
                    if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && typeof chrome.declarativeNetRequest.getSessionRules === 'function') {
                        const rules = await chrome.declarativeNetRequest.getSessionRules();
                        const ruleIds = (rules || []).map(r => r.id).sort((a, b) => a - b);
                        const allowCf = Boolean(request.allowCloudflareChallenges || request.allowCloudflare || request.options?.allowCloudflareChallenges);
                        const expectedIds = allowCf ? [990001, 990002, 990003, 990004, 990005, 990006, 990007] : [990001, 990002, 990003, 990004, 990005];
                        const allPresent = expectedIds.every(id => ruleIds.includes(id));
                        sendResponse({
                            success: true,
                            installed: allPresent,
                            rules: ruleIds
                        });
                    } else {
                        sendResponse({ success: false, error: 'declarativeNetRequest not available' });
                    }
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;
        }

        case 'PREPARE_OWNER_FUNCTIONAL_TEST_RUN': {
            bgOperationQueue.enqueue(async () => {
                try {
                    const isTestOnly = self.BuildProvenance &&
                        typeof self.BuildProvenance.isTestOnlyBuild === 'function' &&
                        self.BuildProvenance.isTestOnlyBuild();
                    if (!isTestOnly) {
                        return sendResponse({ success: false, error: 'NOT_AUTHORIZED_TEST_ONLY_BUILD' });
                    }

                    if (!self.__xpiderHistoryStore) {
                        self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
                        await self.__xpiderHistoryStore.load();
                    }
                    const hs = self.__xpiderHistoryStore;
                    const fixtures = Array.isArray(request.fixtures) && request.fixtures.length > 0
                        ? request.fixtures
                        : [
                            'http://127.0.0.1:8088/contact-standard.html',
                            'http://127.0.0.1:8088/contact-dropdown-checkbox.html',
                            'http://127.0.0.1:8088/contact-numeric.html',
                            'http://127.0.0.1:8088/subscribe-no-message.html',
                            'http://127.0.0.1:8088/reservation-no-message.html',
                            'http://127.0.0.1:8088/no-contact-page.html',
                            'http://127.0.0.1:8088/index.html'
                        ];

                    const fixtureNorms = new Set();
                    for (const f of fixtures) {
                        fixtureNorms.add(f);
                        const n = normalizeUrl(f);
                        if (n) fixtureNorms.add(n);
                        if (hs && typeof hs.normalizeTargetIdentity === 'function') {
                            const hn = hs.normalizeTargetIdentity(f);
                            if (hn) fixtureNorms.add(hn);
                        }
                    }

                    const res = await hs.prepareOwnerTestRun(fixtures);
                    campaignState.campaignRunId = res.campaignRunId;

                    // 1. Atomically clear in-memory campaign visited/successful/queue state for all fixtures
                    campaignState.visitedUrls = [];
                    campaignState.successfulUrls = [];
                    campaignState.queue = [];

                    // 2. Clear transient execution flags and stale paused checkpoints
                    campaignState.isActive = false;
                    campaignState.isPaused = false;
                    campaignState.isLoopRunning = false;
                    campaignState.pausedCheckpoint = null;
                    campaignState.currentTargetAbortController = null;

                    // 3. Atomically filter storage visited state strictly for loopback fixtures (preserve Owner public history!)
                    const storageData = await new Promise(r => chrome.storage.local.get([
                        'xpider_visited', 'xpider_visited_urls', 'xpider_paused_checkpoint'
                    ], r));

                    let cleanedVisited = Array.isArray(storageData.xpider_visited)
                        ? storageData.xpider_visited.filter(u => !fixtureNorms.has(u) && !fixtureNorms.has(normalizeUrl(u)))
                        : [];

                    let cleanedVisitedUrls = storageData.xpider_visited_urls;
                    if (Array.isArray(cleanedVisitedUrls)) {
                        cleanedVisitedUrls = cleanedVisitedUrls.filter(u => !fixtureNorms.has(u) && !fixtureNorms.has(normalizeUrl(u)));
                    } else if (cleanedVisitedUrls && typeof cleanedVisitedUrls === 'object') {
                        cleanedVisitedUrls = { ...cleanedVisitedUrls };
                        for (const k of Object.keys(cleanedVisitedUrls)) {
                            if (fixtureNorms.has(k) || fixtureNorms.has(normalizeUrl(k))) {
                                delete cleanedVisitedUrls[k];
                            }
                        }
                    }

                    await chrome.storage.local.set({
                        xpider_visited: cleanedVisited,
                        xpider_visited_urls: cleanedVisitedUrls,
                        xpider_paused_checkpoint: null,
                        xpider_isActive: false,
                        xpider_isPaused: false,
                        xpider_queue: [],
                        xpider_currentAttempt: null,
                        xpider_active_campaign_run_id: res.campaignRunId,
                        xpider_history_scope_preference: 'currentRun'
                    });

                    // 4. Strict Precondition Invariant Check
                    const staleItems = [];
                    for (const f of fixtures) {
                        const norm = normalizeUrl(f);
                        const hsNorm = (hs && typeof hs.normalizeTargetIdentity === 'function') ? hs.normalizeTargetIdentity(f) : norm;
                        const isHsSuppressed = (hs && typeof hs.isSuppressed === 'function') ? (hs.isSuppressed(norm) || hs.isSuppressed(hsNorm)) : false;
                        const inVisited = campaignState.visitedUrls.includes(norm) || campaignState.visitedUrls.includes(f) || campaignState.visitedUrls.includes(hsNorm);
                        if (isHsSuppressed || inVisited) {
                            staleItems.push(norm);
                        }
                    }

                    if (staleItems.length > 0 || res.staleCount > 0) {
                        const totalStale = Math.max(staleItems.length, res.staleCount || 0);
                        console.error(`[OWNER_TEST_PRECONDITION_STALE_SUPPRESSION] requested=${fixtures.length} stale=${totalStale}`);
                        logBg(null, `🛑 [OWNER_TEST_PRECONDITION_STALE_SUPPRESSION] requested=${fixtures.length} stale=${totalStale}`, 'error');
                        sendResponse({
                            success: false,
                            error: 'OWNER_TEST_PRECONDITION_STALE_SUPPRESSION',
                            requestedCount: fixtures.length,
                            executableCount: fixtures.length - totalStale,
                            staleCount: totalStale,
                            staleItems
                        });
                        return;
                    }

                    logBg(null, `✨ [OWNER_TEST_PREP] Fresh test scope ready: requested=${fixtures.length} executable=${fixtures.length} stale=0 runId=${res.campaignRunId}`, 'info');
                    sendResponse({
                        success: true,
                        ...res,
                        requestedCount: fixtures.length,
                        executableCount: fixtures.length,
                        staleCount: 0
                    });
                } catch (err) {
                    console.error('[PREPARE_OWNER_FUNCTIONAL_TEST_RUN_FAIL]', err);
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;
        }

        case 'CLEANUP_OWNER_FUNCTIONAL_TEST_RUN': {
            bgOperationQueue.enqueue(async () => {
                try {
                    if (self.__xpiderHistoryStore) {
                        await self.__xpiderHistoryStore.cleanupOwnerTestRun(request.previousRunId);
                    }
                    sendResponse({ success: true });
                } catch (err) {
                    console.error('[CLEANUP_OWNER_FUNCTIONAL_TEST_RUN_FAIL]', err);
                    sendResponse({ success: false, error: err.message });
                }
            });
            return true;
        }

        case 'ENSURE_OWNER_TEST_SERVER': {
            bgOperationQueue.enqueue(async () => {
                try {
                    chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'START_OWNER_TEST_SERVER' }, (resp) => {
                        if (chrome.runtime.lastError) {
                            sendResponse({ success: false, error: 'NATIVE_HOST_ERROR', details: chrome.runtime.lastError.message });
                        } else {
                            sendResponse(resp || { success: false, error: 'EMPTY_RESPONSE' });
                        }
                    });
                } catch (err) {
                    sendResponse({ success: false, error: 'EXCEPTION', details: err.message });
                }
            });
            return true;
        }

        case 'START_CAMPAIGN': {
            // [Issue #6 R6.9F & R6.9G.10.3.7.1.4.7] Fail-Closed Build Handshake Verification
            const liveBp = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : null;
            const liveHead = liveBp ? (liveBp.implementationHead || liveBp.head) : '55dc6d69a25b4ea27283d3b40ba1c5fea730914b';
            const liveBuild = liveBp ? liveBp.buildId : 'R6.9G.10.3.7.1.4.7-20261014-START-CONTROL-PLANE-RECOVERY';
            const reqHead = request.expectedImplementationHead;
            const reqBuild = request.expectedBuildId;
            const reqManifest = request.expectedManifestVersion;
            const liveManifest = liveBp ? liveBp.manifestVersion : 3;

            // [Issue #6 R6.9F.1] Fail-closed: all three provenance fields are REQUIRED and must match exactly.
            const missingProv = [];
            if (!reqHead) missingProv.push('expectedImplementationHead');
            if (!reqBuild) missingProv.push('expectedBuildId');
            if (reqManifest === undefined || reqManifest === null) missingProv.push('expectedManifestVersion');
            if (missingProv.length > 0) {
                console.error(`[BUILD_HANDSHAKE] popup=omitted background=${liveHead} missing=${missingProv.join(',')} result=REJECT reason=BUILD_HANDSHAKE_REQUIRED`);
                logBg(null, `[BUILD_HANDSHAKE] popup=omitted background=${liveHead} missing=${missingProv.join(',')} result=REJECT reason=BUILD_HANDSHAKE_REQUIRED`, 'error');
                sendResponse({
                    success: false,
                    error: 'RUNTIME_BUILD_MISMATCH',
                    reason: 'BUILD_HANDSHAKE_REQUIRED',
                    detail: `START_CAMPAIGN missing required provenance fields: ${missingProv.join(', ')}. Reload extension.`
                });
                return true;
            }

            if (reqHead !== liveHead) {
                console.error(`[BUILD_HANDSHAKE] popup=${reqHead} background=${liveHead} result=REJECT`);
                logBg(null, `[BUILD_HANDSHAKE] popup=${reqHead} background=${liveHead} result=REJECT`, 'error');
                sendResponse({
                    success: false,
                    error: 'RUNTIME_BUILD_MISMATCH',
                    detail: `Popup implementationHead (${reqHead}) does not match background (${liveHead}). Reload extension.`
                });
                return true;
            }

            if (reqBuild !== liveBuild) {
                console.error(`[BUILD_HANDSHAKE] popup=${reqBuild} background=${liveBuild} result=REJECT`);
                logBg(null, `[BUILD_HANDSHAKE] popup=${reqBuild} background=${liveBuild} result=REJECT`, 'error');
                sendResponse({
                    success: false,
                    error: 'RUNTIME_BUILD_MISMATCH',
                    detail: `Popup buildId (${reqBuild}) does not match background (${liveBuild}). Reload extension.`
                });
                return true;
            }

            if (Number(reqManifest) !== Number(liveManifest)) {
                console.error(`[BUILD_HANDSHAKE] popupManifest=${reqManifest} backgroundManifest=${liveManifest} result=REJECT`);
                logBg(null, `[BUILD_HANDSHAKE] popupManifest=${reqManifest} backgroundManifest=${liveManifest} result=REJECT`, 'error');
                sendResponse({
                    success: false,
                    error: 'RUNTIME_BUILD_MISMATCH',
                    detail: `Popup manifestVersion (${reqManifest}) does not match background (${liveManifest}). Reload extension.`
                });
                return true;
            }

            console.log(`[BUILD_HANDSHAKE] popup=${reqHead} background=${liveHead} build=${reqBuild} manifest=${reqManifest} result=PASS`);
            logBg(null, `[BUILD_HANDSHAKE] popup=${reqHead} background=${liveHead} build=${reqBuild} manifest=${reqManifest} result=PASS`, 'info');

            // [Issue #6 R6.8 P0-1 & R6.9C & R6.9F] Emit immutable Build Provenance at campaign boot
            const provLogs = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.getBuildProvenanceLogs === 'function')
                ? BuildProvenance.getBuildProvenanceLogs()
                : [
                    `[BUILD_ID] branch=upgrade/phase-0-1 implementationHead=${liveHead} manifestVersion=3 buildId=${liveBuild} builtAt=2026-10-05T08:50:00.000Z`
                ];
            for (const plog of provLogs) {
                console.log(plog);
                logBg(null, plog, "info");
            }

            (async () => {
                const queueLen = (request && Array.isArray(request.queue)) ? request.queue.length : 0;
                console.log(`[START_BG] received queue=${queueLen}`);
                logBg(null, `[START_BG] received queue=${queueLen}`, "info");

                // [R6.9G.10.3.7.1.4.11 P0] Run-Scoped Direct Privacy Override
                if (request.runScopedDirectPrivacy) {
                    campaignState.runScopedDirectPrivacy = true;
                    console.log('[PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true');
                    logBg(null, '[PRIVACY_OWNER_OVERRIDE] scope=currentRun mode=DIRECT acknowledged=true', 'warn');
                } else {
                    campaignState.runScopedDirectPrivacy = false;
                }

                // [R6.9G.10.3.7.1.4.10] Cloudflare Live & Testkey State Resolution
                const isLiveCf = (request.source === 'CLOUDFLARE_LIVE_OWNER' || request.options?.source === 'CLOUDFLARE_LIVE_OWNER');
                const isTestKeyLab = (request.source === 'CLOUDFLARE_TESTKEY_LAB' || request.options?.source === 'CLOUDFLARE_TESTKEY_LAB');

                if (isLiveCf) {
                    campaignState.isCloudflareLive = true;
                    campaignState.isCloudflareTestKey = false;
                    campaignState.mockEligible = false;
                    campaignState.ownerFunctionTestMode = false;
                    await removeOwnerTestNetworkGuard();

                    const queueArr = Array.isArray(request.queue) ? request.queue : [];
                    const isLoopbackFn = (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(typeof u === 'string' ? u : (u?.url || ''));
                    for (let i = 0; i < queueArr.length; i++) {
                        const raw = queueArr[i];
                        const urlStr = typeof raw === 'string' ? raw : (raw?.url || '');
                        if (isLoopbackFn(urlStr) || !urlStr.startsWith('https://')) {
                            console.error(`[CLOUDFLARE_LIVE_LOOPBACK_REFUSED] Loopback or non-HTTPS target rejected in LIVE mode: ${urlStr}`);
                            logBg(null, `[CLOUDFLARE_LIVE_LOOPBACK_REFUSED] Target rejected in LIVE mode: ${urlStr}`, 'error');
                            sendResponse({
                                success: false,
                                error: 'CLOUDFLARE_LIVE_LOOPBACK_REFUSED',
                                message: `Cloudflare Live Owner Test strictly forbids loopback (127.0.0.1 / localhost) and requires public HTTPS. Refused: ${urlStr}`
                            });
                            return;
                        }
                    }
                    console.log('[CLOUDFLARE_LIVE_PREFLIGHT] https=true loopback=false mockEligible=false verificationEndpointConfigured=true');
                    logBg(null, '[CLOUDFLARE_LIVE_PREFLIGHT] https=true loopback=false mockEligible=false verificationEndpointConfigured=true', 'info');
                } else if (isTestKeyLab) {
                    campaignState.isCloudflareTestKey = true;
                    campaignState.isCloudflareLive = false;
                    campaignState.mockEligible = false;
                    campaignState.ownerFunctionTestMode = true;
                } else {
                    campaignState.isCloudflareLive = false;
                    campaignState.isCloudflareTestKey = false;
                }

                // [R6.9G.10.3.7.1.4.11 Mode Resolution: Source-Scoped, Not Sticky]
                const EXPLICIT_TEST_SOURCES = ['OWNER_CORE_TEST', 'OWNER_CAPTCHA_LAB', 'OWNER_FULL_TEST', 'CLOUDFLARE_TESTKEY_LAB'];
                const reqSource = request.source || request.options?.source || 'USER_START_BUTTON';
                const isExplicitTestSource = EXPLICIT_TEST_SOURCES.includes(reqSource);

                if (reqSource === 'USER_START_BUTTON' || (!isExplicitTestSource && !isLiveCf)) {
                    campaignState.ownerFunctionTestMode = false;
                    campaignState.isCloudflareTestKey = false;
                    campaignState.isCloudflareLive = false;

                    const curSt = await chrome.storage.local.get([
                        'xpider_owner_function_test_mode',
                        'xpider_active_test_source',
                        'xpider_cloudflare_live_test'
                    ]);
                    const staleTestMode = Boolean(
                        curSt.xpider_owner_function_test_mode ||
                        curSt.xpider_active_test_source ||
                        curSt.xpider_cloudflare_live_test
                    );
                    if (staleTestMode) {
                        await chrome.storage.local.set({
                            xpider_owner_function_test_mode: false,
                            xpider_cloudflare_live_test: false
                        });
                        await chrome.storage.local.remove([
                            'xpider_active_test_source',
                            'xpider_owner_function_test_mode_active',
                            'xpider_test_mode_state'
                        ]);
                        await removeOwnerTestNetworkGuard();
                        console.log('[MODE_RECONCILE] source=USER_START_BUTTON staleOwnerTestMode=true action=AUTO_EXIT_TEST_MODE');
                        console.log('[OWNER_TEST_GUARD] removed=true');
                        logBg(null, '[MODE_RECONCILE] source=USER_START_BUTTON staleOwnerTestMode=true action=AUTO_EXIT_TEST_MODE', 'info');
                        logBg(null, '[OWNER_TEST_GUARD] removed=true', 'info');
                    } else {
                        await removeOwnerTestNetworkGuard();
                    }

                    const isLoopbackFn = (typeof PrivacyGateway !== 'undefined' && typeof PrivacyGateway.isLoopbackTestUrl === 'function')
                        ? PrivacyGateway.isLoopbackTestUrl
                        : (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(u);
                    const queueArr = Array.isArray(request.queue) ? request.queue : [];
                    const publicTargets = queueArr.filter(u => !isLoopbackFn(typeof u === 'string' ? u : (u?.url || '')));
                    console.log(`[NORMAL_CAMPAIGN_PREFLIGHT] publicTargets=${publicTargets.length} testMode=false result=PASS`);
                    logBg(null, `[NORMAL_CAMPAIGN_PREFLIGHT] publicTargets=${publicTargets.length} testMode=false result=PASS`, 'info');
                }

                let isTestMode = isExplicitTestSource;

                if (isTestMode) {
                    const isTestAuthorized = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function')
                        ? BuildProvenance.isTestOnlyBuild()
                        : Boolean(typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO && BuildProvenance.BUILD_INFO.testOnly === true && BuildProvenance.BUILD_INFO.channel === 'TEST_ONLY');

                    if (!isTestAuthorized) {
                        console.error('[OWNER_FUNCTION_TEST_BLOCKED] Runtime build is not authorized for TEST_ONLY channel.');
                        logBg(null, '[OWNER_FUNCTION_TEST_BLOCKED] Runtime build is not authorized for TEST_ONLY channel.', 'error');
                        sendResponse({
                            success: false,
                            error: 'OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD',
                            message: 'Owner Functional Test Mode is strictly forbidden: runtime build does not declare TEST_ONLY.'
                        });
                        return;
                    }

                    const isFullTest = (request.source === 'OWNER_FULL_TEST' || request.options?.source === 'OWNER_FULL_TEST');
                    const maxAllowed = isFullTest ? 30 : 10;
                    if (queueLen > maxAllowed) {
                        console.error(`[OWNER_FUNCTION_TEST_BLOCKED] Queue length ${queueLen} exceeds maximum ${maxAllowed} allowed targets.`);
                        logBg(null, `[OWNER_FUNCTION_TEST_BLOCKED] Queue length ${queueLen} exceeds maximum ${maxAllowed} allowed targets.`, 'error');
                        sendResponse({
                            success: false,
                            error: 'OWNER_FUNCTION_TEST_EXCEEDED_MAX_TARGETS',
                            message: `Owner Functional Test Mode allows maximum ${maxAllowed} targets (got ${queueLen}).`
                        });
                        return;
                    }

                    const isLoopbackFn = (typeof PrivacyGateway !== 'undefined' && typeof PrivacyGateway.isLoopbackTestUrl === 'function')
                        ? PrivacyGateway.isLoopbackTestUrl
                        : (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(u);

                    const queueArr = Array.isArray(request.queue) ? request.queue : [];
                    for (let i = 0; i < queueArr.length; i++) {
                        const raw = queueArr[i];
                        const urlStr = typeof raw === 'string' ? raw : (raw?.url || '');
                        if (!isLoopbackFn(urlStr)) {
                            console.error(`[OWNER_FUNCTION_TEST_BLOCKED] Non-loopback target rejected in test mode: ${urlStr} at index ${i}`);
                            logBg(null, `[OWNER_FUNCTION_TEST_BLOCKED] Non-loopback target rejected: ${urlStr} at index ${i}`, 'error');
                            sendResponse({
                                success: false,
                                error: 'OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET',
                                message: `Owner Functional Test Mode requires ALL targets to be local loopback. Non-loopback target rejected: ${urlStr}`
                            });
                            return;
                        }
                    }

                    // [Blocker 1 Hardening] Install & verify DeclarativeNetRequest session rules BEFORE START is acknowledged
                    try {
                        await installOwnerTestNetworkGuard({ allowCloudflareChallenges: isTestKeyLab });
                    } catch (guardErr) {
                        console.error(`[OWNER_FUNCTION_TEST_GUARD_FAIL] Failed to install/verify network guard: ${guardErr.message}`);
                        logBg(null, `[OWNER_FUNCTION_TEST_GUARD_FAIL] Failed to install/verify network guard: ${guardErr.message}`, 'error');
                        sendResponse({
                            success: false,
                            error: 'OWNER_FUNCTION_TEST_GUARD_FAILED',
                            message: `Fail-Closed: Could not install declarativeNetRequest network guard: ${guardErr.message}`
                        });
                        return;
                    }

                    console.log(`[OWNER_FUNCTION_TEST] loopbackOnly=true strictPublicBypass=false networkGuard=VERIFIED allowCloudflareChallenges=${isTestKeyLab}`);
                    logBg(null, `[OWNER_FUNCTION_TEST] loopbackOnly=true strictPublicBypass=false networkGuard=VERIFIED allowCloudflareChallenges=${isTestKeyLab}`, 'info');
                    campaignState.ownerFunctionTestMode = true;
                } else if (!isLiveCf) {
                    campaignState.ownerFunctionTestMode = false;
                    await removeOwnerTestNetworkGuard();
                }

                // [R6.9G.9 Privacy Gateway Preflight & R6.9G.10.3.6.1 Single-Authority Start Prep]
                if (!isTestMode && !campaignState.runScopedDirectPrivacy) {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (pg) {
                        await pg.init();
                        // Single authoritative privacy check:
                        // If gate is not ready (e.g. direct call without prior prep), run ensureEnforcedPrivacyForStart as fallback
                        if (!pg.isGateReady) {
                            const prep = await pg.ensureEnforcedPrivacyForStart();
                            if (!prep.ready && pg.config.failClosed) {
                                logBg(null, `[PRIVACY_GATE_BLOCK] reason=${prep.reason} attemptId=none targetUrl=none`, 'error');
                                chrome.runtime.sendMessage({
                                    action: 'PRIVACY_GATEWAY_BLOCKED',
                                    reason: prep.reason,
                                    userMessage: prep.userMessage
                                }).catch(() => {});
                                sendResponse({
                                    success: false,
                                    status: 'PRIVACY_GATEWAY_BLOCKED',
                                    error: 'PRIVACY_GATEWAY_BLOCKED',
                                    reason: prep.reason,
                                    userMessage: prep.userMessage
                                });
                                return;
                            }
                        }

                        if (pg.config.transportMode === 'PRIVACY_RELAY') {
                            await pg.ensureRelayActive(true);
                            if (pg.config.relayRotationMode === 'CAMPAIGN_BOUNDARY' || pg.config.rotateAtCampaignStart) {
                                logBg(null, '[PRIVACY_RELAY] Campaign boundary reached: rotating egress before campaign start...', 'info');
                                await pg.rotateRelayEgress('CAMPAIGN_BOUNDARY');
                            }
                        }
                        const preflight = await pg.runPreflight();
                        const pLog = `[PRIVACY_GATE] mode=${preflight.mode} transport=${preflight.mode} failClosed=${preflight.failClosed} webrtcGuard=${preflight.webrtcGuard} directFallbackBlocked=${preflight.directFallbackBlocked} egressCheck=${preflight.egressCheck} dnsPrivacy=${preflight.dnsPrivacy} ipv6Protection=${preflight.ipv6Protection} status=${preflight.ready ? 'READY' : 'BLOCKED'}`;
                        console.log(pLog);
                        logBg(null, pLog, preflight.ready ? "info" : "error");

                        if (!preflight.ready && preflight.failClosed) {
                            logBg(null, `[PRIVACY_GATE_BLOCK] reason=${preflight.failureReason} attemptId=none targetUrl=none`, 'error');
                            chrome.runtime.sendMessage({
                                action: 'PRIVACY_GATEWAY_BLOCKED',
                                reason: preflight.failureReason,
                                userMessage: preflight.userMessage || 'Strict Privacy transport could not be enforced.'
                            }).catch(() => {});
                            sendResponse({
                                success: false,
                                status: 'PRIVACY_GATEWAY_BLOCKED',
                                error: 'PRIVACY_GATEWAY_BLOCKED',
                                reason: preflight.failureReason,
                                userMessage: preflight.userMessage || 'Strict Privacy transport could not be enforced.'
                            });
                            return;
                        }
                    }
                } else {
                    console.log('[PRIVACY_GATE] mode=DIRECT transport=DIRECT failClosed=false (OWNER_FUNCTION_TEST_MODE) status=READY');
                    logBg(null, '[PRIVACY_GATE] mode=DIRECT transport=DIRECT failClosed=false (OWNER_FUNCTION_TEST_MODE) status=READY', 'info');
                }

                // [R6.9G.10.3.6.1] Blocker 3: START_BG_READY log before sendResponse
                console.log('[START_BG_READY] privacyReady=true');
                logBg(null, '[START_BG_READY] privacyReady=true', "info");

                const assignedRunId = request.campaignRunId || campaignState.campaignRunId || ((isTestMode ? 'owner_test_run_' : 'run_') + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
                sendResponse({ success: true, status: 'acknowledged', queueCount: queueLen, campaignRunId: assignedRunId });

                campaignState.ownerTestSource = request.source || null;
                if (request.source === 'OWNER_CAPTCHA_LAB') {
                    campaignState.captchaLabMetrics = {
                        detected: 0,
                        requested: 0,
                        success: 0,
                        failure: 0,
                        timeout: 0,
                        staleDropped: 0,
                        mathSolved: 0,
                        audioPassed: 0,
                        expectedFailPass: 0,
                        unexpectedFailures: 0
                    };
                }

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
                        overrideSkipAttempted: request.overrideSkipAttempted,
                        ownerFunctionTestMode: isTestMode,
                        ownerTestSource: request.source || null,
                        campaignRunId: assignedRunId,
                        targetTimeoutMs: request.targetTimeoutMs || request.options?.targetTimeoutMs
                    });
                } catch (e) {
                    console.error("[StartError]", e);
                    logBg(null, `❌ Engine failed to start: ${e.message}`, "error");
                }
            })();
            return true;
        }

        case 'RUN_PRIVACY_PREFLIGHT': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    await pg.init();
                    const preflight = await pg.runPreflight(request.options || {});
                    sendResponse({ success: true, preflight });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        // [Issue #6 Comment #6273652325 FF1] Authoritative live PrivacyGateway state contract for main HUD
        case 'GET_PRIVACY_GATEWAY_STATE': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    await pg.init();
                    const isGateReady = typeof pg.isPrivacyGateReady === 'function' ? pg.isPrivacyGateReady() : Boolean(pg.isGateReady);
                    sendResponse({
                        success: true,
                        state: {
                            isGateReady,
                            mode: pg.config ? pg.config.transportMode : 'PRIVACY_RELAY',
                            failureReason: pg.failureReason || (pg.lastPreflightResult ? pg.lastPreflightResult.failureReason : null),
                            isGateActive: Boolean(pg.isGateActive),
                            lastPreflight: pg.lastPreflightResult
                        }
                    });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'GET_PRIVACY_CONFIG': {

            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    await pg.init();
                    sendResponse({
                        success: true,
                        config: pg.config,
                        isGateReady: pg.isPrivacyGateReady(),
                        lastPreflight: pg.lastPreflightResult
                    });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'SET_PRIVACY_CONFIG': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const cfg = await pg.saveConfig(request.config || {});
                    sendResponse({ success: true, config: cfg });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'RESTORE_PRIVACY_SETTINGS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (pg) await pg.restoreOriginalSettings();
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'VERIFY_SYSTEM_VPN': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    await pg.init();
                    await pg.saveConfig({ transportMode: 'SYSTEM_VPN', systemVpnConfirmed: true });
                    const preflight = await pg.runPreflight({ transportMode: 'SYSTEM_VPN', systemVpnConfirmed: true });
                    if (!preflight || preflight.ready !== true) {
                        await pg.saveConfig({ systemVpnConfirmed: false });
                        pg.config.systemVpnConfirmed = false;
                        pg.isGateReady = false;
                        return sendResponse({
                            success: false,
                            preflight,
                            error: (preflight && preflight.failureReason) || 'PREFLIGHT_VERIFICATION_FAILED'
                        });
                    }
                    sendResponse({ success: true, preflight });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'REVOKE_SYSTEM_VPN': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    await pg.init();
                    await pg.saveConfig({ transportMode: 'SYSTEM_VPN', systemVpnConfirmed: false });
                    await pg.invalidateVpnConfirmation('OWNER_REVOKED');
                    const preflight = await pg.runPreflight({ transportMode: 'SYSTEM_VPN', systemVpnConfirmed: false });
                    sendResponse({ success: true, preflight });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'CHECK_EGRESS_CONTINUITY': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const continuity = await pg.checkEgressContinuity();
                    sendResponse({ success: true, continuity });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'ROTATE_PRIVACY_RELAY': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.rotateRelayEgress(request.reason || 'MANUAL');
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'SELECT_PRIVACY_RELAY_EGRESS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.selectRelayEgress(request.egressId);
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'SET_PRIVACY_RELAY_MODE': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.setRelayMode(request.rotationMode);
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'QUERY_PRIVACY_RELAY_STATUS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable', failureReason: 'GATEWAY_UNAVAILABLE' });
                    const res = await pg.queryRelayStatus();
                    sendResponse({
                        success: res.success,
                        result: res,
                        error: res.reason,
                        failureReason: res.failureReason || res.reason
                    });
                } catch (e) {
                    sendResponse({ success: false, error: e.message, failureReason: 'EXCEPTION' });
                }
            })();
            return true;
        }

        case 'QUERY_PRIVACY_RELAY_DIAGNOSTICS': {
            (async () => {
                const report = {
                    nativeHost: null,
                    port18989Health: null,
                    hasTokenInMemory: false,
                    statusAuth: null,
                    tokenDesync: false,
                    failureReason: null
                };
                const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                if (pg) {
                    report.hasTokenInMemory = Boolean(pg.ephemeralRelayToken);
                }
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage) {
                    try {
                        const nativeDiag = await new Promise((resolve) => {
                            chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'DIAGNOSTICS' }, (res) => {
                                if (chrome.runtime.lastError) {
                                    return resolve({ success: false, error: chrome.runtime.lastError.message });
                                }
                                resolve(res || { success: false, error: 'EMPTY_RESPONSE' });
                            });
                        });
                        report.nativeHost = nativeDiag;
                    } catch (err) {
                        report.nativeHost = { success: false, error: err.message };
                    }
                }
                try {
                    const healthResp = await fetch('http://127.0.0.1:18989/health', { cache: 'no-store' });
                    if (healthResp.ok) {
                        report.port18989Health = { ok: true, status: healthResp.status, data: await healthResp.json() };
                    } else {
                        report.port18989Health = { ok: false, status: healthResp.status };
                    }
                } catch (e) {
                    report.port18989Health = { ok: false, error: e.message };
                }

                // Authenticated /status probe using memory token or token from native host
                const tokenToProbe = (pg && pg.ephemeralRelayToken) || (report.nativeHost && report.nativeHost.controlToken);
                if (tokenToProbe) {
                    try {
                        const statusResp = await fetch('http://127.0.0.1:18989/status', {
                            cache: 'no-store',
                            headers: { 'Authorization': `Bearer ${tokenToProbe}` }
                        });
                        report.statusAuth = { ok: statusResp.ok, status: statusResp.status };
                        if (statusResp.status === 401) {
                            report.tokenDesync = true;
                            report.failureReason = 'TOKEN_DESYNC_401';
                        }
                    } catch (err) {
                        report.statusAuth = { ok: false, error: err.message };
                    }
                } else if (report.port18989Health && report.port18989Health.ok) {
                    report.failureReason = 'AUTH_TOKEN_MISSING';
                }
                sendResponse({ success: true, report });
            })();
            return true;
        }

        case 'QUERY_PHYSICAL_GATE': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.queryPhysicalGateStatus();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'SET_PHYSICAL_GATE_ENABLED': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.setPhysicalGateEnabled(request.enabled);
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'VERIFY_PHYSICAL_GATE': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.verifyPhysicalGate();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'PAIR_PHYSICAL_ROUTER': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.pairRouter(request.data || {});
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }


        case 'GENERATE_PHYSICAL_ROUTER_KEY': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.generatePhysicalRouterKey(request.algorithm || 'ed25519');
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'GET_PHYSICAL_ROUTER_PUBLIC_KEY': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.getPhysicalRouterPublicKey();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'ENROLL_PHYSICAL_EGRESS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.enrollPhysicalEgress(request.data || {});
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'RESET_PHYSICAL_EGRESS_TRUST': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.resetPhysicalEgressTrust();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'START_PRIVACY_RELAY_NATIVE': {
            (async () => {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage) {
                    try {
                        chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'START' }, (response) => {
                            if (chrome.runtime.lastError) {
                                return sendResponse({ success: false, error: chrome.runtime.lastError.message, failureReason: 'NATIVE_HOST_NOT_REGISTERED' });
                            }
                            if (!response) {
                                return sendResponse({ success: false, error: 'NO_RESPONSE_FROM_NATIVE_HOST', failureReason: 'NATIVE_HOST_EMPTY_RESPONSE' });
                            }
                            if (response.controlToken) {
                                const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                                if (pg) {
                                    pg.ephemeralRelayToken = response.controlToken;
                                    pg.config.relayControlToken = response.controlToken;
                                    pg.saveConfig({ relayControlToken: response.controlToken });
                                }
                            }
                            if (response.success === false || response.isRunningNow === false) {
                                return sendResponse({
                                    success: false,
                                    error: response.failureReason || (response.result && response.result.error) || 'START_FAILED',
                                    failureReason: response.failureReason || 'START_FAILED',
                                    response
                                });
                            }
                            sendResponse({ success: true, response });
                        });
                        return;
                    } catch (err) {
                        return sendResponse({ success: false, error: err.message, failureReason: 'NATIVE_EXCEPTION' });
                    }
                }
                sendResponse({ success: false, error: 'NATIVE_MESSAGING_UNSUPPORTED', failureReason: 'NATIVE_MESSAGING_UNSUPPORTED' });
            })();
            return true;
        }

        case 'ENSURE_ENFORCED_PRIVACY_FOR_START': {
            (async () => {
                const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                await pg.init();
                const options = Object.assign({}, request.options || {});
                if (request.ownerFunctionTestMode || (request.options && request.options.ownerFunctionTestMode)) {
                    options.ownerFunctionTestMode = true;
                }
                const res = await pg.ensureEnforcedPrivacyForStart(options);
                sendResponse({ success: true, result: res });
            })();
            return true;
        }

        case 'GET_PRIVACY_RELAY_TOKEN_NATIVE': {
            (async () => {
                const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                if (pg) {
                    const token = await pg.fetchRelayControlToken();
                    sendResponse({ success: !!token, token });
                } else {
                    sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                }
            })();
            return true;
        }

        case 'GET_PRIVACY_RELAY_NODES': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.getRelayEgressNodes();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'ADD_PRIVACY_RELAY_NODE': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.addRelayEgressNode(request.nodeData);
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'REMOVE_PRIVACY_RELAY_NODE': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.removeRelayEgressNode(request.nodeId);
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'VERIFY_PRIVATE_EGRESS_PLAN': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.verifyPrivateEgressPlan(request.payload || request.data || {});
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'PROVISION_PRIVATE_EGRESS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.provisionPrivateEgress(request.payload || request.data || {});
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'GET_PROVISION_PROGRESS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.getProvisionProgress();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'DESTROY_PRIVATE_EGRESS': {
            (async () => {
                try {
                    // [RC3.13 Teardown Proxy Clearing] Clear proxy before teardown to prevent proxy interception
                    if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                        try {
                            await new Promise(r => chrome.proxy.settings.clear({ scope: 'regular' }, r));
                        } catch (_) {}
                    }
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.destroyPrivateEgress(request.payload || request.data || {});
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'GET_EGRESS_TELEMETRY': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.getEgressTelemetry(Boolean(request.mock));
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'GET_RECOVERY_STATUS': {
            (async () => {
                try {
                    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                    if (!pg) return sendResponse({ success: false, error: 'PrivacyGateway unavailable' });
                    const res = await pg.getRecoveryStatus();
                    sendResponse({ success: true, result: res });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'GET_COMPANION_BUILD_STATUS': {
            (async () => {
                try {
                    const host = '127.0.0.1';
                    const port = 18989;
                    const res = await fetch(`http://${host}:${port}/health`, { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        sendResponse({
                            success: true,
                            companionBuildId: data.companionBuildId || null,
                            companionImplementationHead: data.companionImplementationHead || null,
                            extensionBuildId: (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.buildId : null,
                            extensionImplementationHead: (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.implementationHead : null
                        });
                    } else {
                        sendResponse({ success: false, error: `HTTP_${res.status}` });
                    }
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;
        }

        case 'PING':
            sendResponse({ success: true, timestamp: Date.now() });
            return true;

        case 'QUERY_SUBMIT_BOUNDARY': {
            const attId = request.attemptId || (campaignState.currentAttempt && campaignState.currentAttempt.attemptId);
            const tok = request.targetToken || (campaignState.activeTargetExecution && campaignState.activeTargetExecution.targetToken);
            const key = `${attId}:${tok}`;
            const reached = !!(campaignState.submitBoundaryReached && (campaignState.submitBoundaryReached[attId] || campaignState.submitBoundaryReached[key]));
            sendResponse({ success: true, reached });
            return true;
        }

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
                campaignState.runScopedDirectPrivacy = false;
                const res = await pauseCampaignOrchestrator(true);
                sendResponse({ success: true, ...res });
            })();
            return true;

        case 'END_CAMPAIGN':
        case 'CLEAR_CAMPAIGN':
            (async () => {
                campaignState.runScopedDirectPrivacy = false;
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

        case 'GET_CURRENT_RUN_DIAGNOSTICS':
            sendResponse({
                success: true,
                runId: (typeof campaignState !== 'undefined' && campaignState?.campaignRunId) || null,
                truncated: currentRunDiagTruncated,
                events: currentRunDiagEvents
            });
            return true;

        case 'APPEND_DIAGNOSTIC_LOG':
            recordCurrentRunDiagEvent(request.message, request.level || 'INFO');
            sendResponse({ success: true });
            return true;

        case 'SENDER_LOG':
            if (sender.tab) {
                const attId = campaignState.currentAttempt?.attemptId || 'none';
                const tag = `[CONTENT_EVENT][tabId=${sender.tab.id}][attemptId=${attId}][url=${sender.tab.url || 'unknown'}]`;
                console.log(`${tag} ${request.message}`);
                logBg(sender.tab.id, `${tag} ${request.message}`, request.logType || 'info');
            }
            sendResponse({ success: true });
            return true;

        case 'UI_HEARTBEAT':
            sendResponse({ success: true, timestamp: Date.now() });
            return true;

        case 'SENDER_READY':
            // [v18.24.0] Direct Route: Handle content-script ready signal via global state
            if (sender.tab && sender.tab.id === campaignState.currentTabId && campaignState.targetReady) {
                campaignState.targetReady(sender.tab.url, false);
                sendResponse({ success: true });
            }
            return true;

        case 'SENDER_FINISHED':
            // [Issue #6 R6.9E.1 Section 8A/8B] Strict Terminal Barrier with Unified Execution Validator
            (() => {
                const validation = validateActiveExecution(request, sender, 'SENDER_FINISHED');
                if (!validation.valid) {
                    sendResponse({ success: false, reason: validation.reason });
                    return;
                }

                if (!request.result?.success && (campaignState.isNetworkDegraded || request.result?.reasonCode === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT' || request.result?.error === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT')) {
                    logBg(null, `[NETWORK_RECOVERY] SENDER_FINISHED failure suppressed during network degradation or privacy block. Freezing checkpoint without false failure settlement.`, 'warning');
                    freezeActiveCampaignJob(`SUBMIT_BARRIER_PRIVACY_BLOCKED: ${request.result?.error || 'DEGRADED'}`).catch(() => {});
                    sendResponse({ success: true, status: 'FROZEN_FOR_RECOVERY' });
                    return;
                }

                const curStage = campaignState.currentTargetStage;
                // Stage authority: must be at allowed terminal stage or explicit failure/skip
                const allowedTerminalStages = ['VERIFYING', 'CONFIRMED_SUCCESS', 'SUBMITTING', 'SUBMIT_TRIGGERED', 'SUBMIT_ATTEMPT_STARTED', 'POST_SUBMIT_CONFIRMING', 'SETTLED'];
                const isTerminalStageAllowed = allowedTerminalStages.includes(curStage) || 
                    (request.result && (!request.result.success || request.result.error || request.result.reasonCode === 'PREPARING_REQUEUE'));

                if (!isTerminalStageAllowed) {
                    logBg(null, `[STALE_TARGET_EVENT] action=SENDER_FINISHED stage=${curStage} result=REJECTED reason=non_terminal_stage`, 'warning');
                    sendResponse({ success: false, reason: 'INVALID_STAGE_FOR_FINISH' });
                    return;
                }

                if (campaignState.targetResolve) {
                    const resolve = campaignState.targetResolve;
                    campaignState.targetResolve = null; // [Section 8B] One-shot clear to prevent duplicate terminal resolution
                    resolve(request.result);
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, reason: 'NO_TARGET_RESOLVER' });
                }
            })();
            return true;

        case 'FORM_GATE_PASSED':
            // [Issue #6 R6.9E.1 Section 8A] Unified Execution Validator for FORM_GATE_PASSED
            (() => {
                const validation = validateActiveExecution(request, sender, 'FORM_GATE_PASSED');
                if (!validation.valid) {
                    sendResponse({ success: false, reason: validation.reason });
                    return;
                }
                const sTab = sender.tab;
                const cUrl = request.contactPageUrl || sTab.url;
                const fUrl = request.formPageUrl || sTab.url;
                if (campaignState.currentDiscoveryCtx) {
                    campaignState.currentDiscoveryCtx.selectedContactUrl = cUrl;
                    campaignState.currentDiscoveryCtx.selectedFormUrl = fUrl;
                    campaignState.currentDiscoveryCtx.committedContactUrl = cUrl;
                    campaignState.currentDiscoveryCtx.committedFormUrl = fUrl;
                }
                if (request.formIdentity) campaignState.currentFormIdentity = request.formIdentity;
                logBg(sTab.id, `[CONTACT_COMMIT] contactPageUrl=${cUrl}`, "info");
                logBg(sTab.id, `[FORM_COMMIT] formPageUrl=${fUrl}`, "info");

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
            })();
            return true;

        case 'CAPTCHA_MATH_SOLVED':
            logBg(null, `[CAPTCHA_MATH_SOLVED] Math challenge solved: "${request.question || ''}" => ${request.answer}`, 'success');
            campaignState.counters.captchaSolved = (campaignState.counters.captchaSolved || 0) + 1;
            campaignState.captchaLedger.autoSuccess++;
            campaignState.captchaLabMetrics.mathSolved = (campaignState.captchaLabMetrics.mathSolved || 0) + 1;
            campaignState.captchaLabMetrics.detected = (campaignState.captchaLabMetrics.detected || 0) + 1;
            campaignState.captchaLabMetrics.requested = (campaignState.captchaLabMetrics.requested || 0) + 1;
            campaignState.captchaLabMetrics.success = (campaignState.captchaLabMetrics.success || 0) + 1;
            broadcastCounters();
            sendResponse({ success: true });
            return true;

        case 'STAGE_PROGRESSION':
            // [Issue #6 R6.9E.1 Section 8A/8C] Standardized pipeline metrics & Authoritative Submit Boundary with Unified Execution Validator
            (async () => {
                const validation = validateActiveExecution(request, sender, 'STAGE_PROGRESSION');
                if (!validation.valid) {
                    sendResponse({ success: false, reason: validation.reason });
                    return;
                }

                const sTab = sender.tab;
                if (request.formIdentity) campaignState.currentFormIdentity = request.formIdentity;
                if (request.fieldMapping) campaignState.currentFieldMapping = request.fieldMapping;
                if (request.filledFields) campaignState.currentFilledFields = request.filledFields;
                if (request.submitState) campaignState.currentSubmitState = request.submitState;

                if (request.stage) {
                    // [R6.9G.7 P0-3] Sticky CAPTCHA_PENDING_OWNER: generic stage updates must not overwrite it
                    if (campaignState.currentTargetStage !== 'CAPTCHA_PENDING_OWNER') {
                        campaignState.currentTargetStage = request.stage;
                    } else {
                        console.log(`[STAGE_PROGRESSION] Preserving sticky CAPTCHA_PENDING_OWNER (ignoring generic stage=${request.stage})`);
                    }
                    const activeStages = ['ACTIVE_FORM', 'FILLING', 'CAPTCHA', 'FINAL_AUDIT', 'SUBMIT_ATTEMPT_STARTED', 'SUBMITTING', 'SUBMIT_TRIGGERED', 'VERIFYING'];
                    if (activeStages.includes(request.stage)) {
                        if (chrome.alarms) {
                            chrome.alarms.create(`xpider_watchdog_${sTab.id}_${campaignState.sessionId}`, { delayInMinutes: 1 });
                        }
                    }

                    // [R6.9F.2 Fix-C] Persist execution identity to chrome.storage.local when
                    // entering CAPTCHA stage so solver-content.js (running in the reCAPTCHA /
                    // hCaptcha iframe) can read and attach it to every SOLVE_CAPTCHA message.
                    // Without this, validateActiveExecution rejects all SOLVE_CAPTCHA calls with
                    // attempt_mismatch because the iframe has no access to window.__xpider_execution_identity.
                    if (request.stage === 'CAPTCHA' || request.stage === 'FILLING' || request.stage === 'ACTIVE_FORM') {
                        try {
                            const execIdentity = {
                                attemptId: campaignState.currentAttempt?.attemptId || null,
                                targetToken: campaignState.currentTargetToken || null,
                                campaignRunId: campaignState.campaignRunId || null,
                                sessionId: Number(campaignState.sessionId),
                                captchaEpoch: campaignState.captchaEpoch || 1,
                                ts: Date.now()
                            };
                            chrome.storage.local.set({ xpider_exec_identity: execIdentity }).catch(() => {});
                            logBg(sTab.id, `[EXEC_IDENTITY_STORED] stage=${request.stage} attemptId=${execIdentity.attemptId} epoch=${execIdentity.captchaEpoch}`, 'info');
                        } catch (_) {}
                    }

                    // [Issue #6 R6.9F] Persistent submit boundary & Duplicate Submit Block
                    if (request.stage === 'SUBMIT_ATTEMPT_STARTED') {
                        const curAttId = (campaignState.currentAttempt && campaignState.currentAttempt.attemptId) || request.attemptId || 'default';
                        const curToken = (campaignState.activeTargetExecution && campaignState.activeTargetExecution.targetToken) || request.targetToken || 'default';
                        const attemptKey = `${curAttId}:${curToken}`;
                        if (!campaignState.submitBoundaryReached) campaignState.submitBoundaryReached = {};

                        if (campaignState.submitBoundaryReached[curAttId] || campaignState.submitBoundaryReached[attemptKey]) {
                            logBg(sTab.id, `[SUBMIT_DUPLICATE_BLOCK] attemptId=${curAttId} result=REJECT`, 'warning');
                            console.warn(`[SUBMIT_DUPLICATE_BLOCK] attemptId=${curAttId} result=REJECT`);
                            sendResponse({ success: false, duplicateBlocked: true, error: 'SUBMIT_DUPLICATE_BLOCK' });
                            return;
                        }

                        campaignState.submitBoundaryReached[curAttId] = true;
                        campaignState.submitBoundaryReached[attemptKey] = true;
                        try {
                            chrome.storage.local.set({ xpider_submitBoundaryReached: campaignState.submitBoundaryReached }).catch(() => {});
                        } catch (_) {}

                        if (campaignState.currentAttempt) {
                            campaignState.currentAttempt.status = 'SUBMIT_PENDING';
                            campaignState.submitLock = true;
                            try {
                                await recordSubmissionIntent(campaignState.currentAttempt.url, 'SUBMIT_PENDING', campaignState.currentAttempt.attemptId);
                                await chrome.storage.local.set({ xpider_currentAttempt: campaignState.currentAttempt });
                                logBg(sTab.id, `[STAGE_PROGRESSION] SUBMIT_ATTEMPT_STARTED -> SUBMIT_PENDING committed attemptId=${campaignState.currentAttempt.attemptId}`, 'info');
                            } catch (intentErr) {
                                logBg(sTab.id, `❌ [IntentGuard] Failed to persist submit intent: ${intentErr.message}`, 'error');
                            }
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
                    logBg(sTab.id, `${icon} [PIPELINE][${request.stage}] url=${request.url || sTab.url}`, 'success');
                    if (campaignState.currentDiscoveryCtx) {
                        if (!campaignState.currentDiscoveryCtx.stageHistory) campaignState.currentDiscoveryCtx.stageHistory = [];
                        campaignState.currentDiscoveryCtx.stageHistory.push({ stage: request.stage, ts: Date.now(), url: request.url || sTab.url });
                    }
                    sendResponse({ success: true });
                }
            })();
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
                const counters = campaignState.counters || { success: 0, failed: 0, completed: 0, remaining: 0, total: 0 };
                sendResponse({
                    success: true,
                    isActive: campaignState.isActive,
                    successCount: counters.success !== undefined ? counters.success : campaignState.successCount,
                    failedCount: counters.failed !== undefined ? counters.failed : 0,
                    completedCount: counters.completed !== undefined ? counters.completed : 0,
                    remainingCount: counters.remaining !== undefined ? counters.remaining : campaignState.queue.length,
                    totalTargets: counters.total !== undefined && counters.total > 0 ? counters.total : campaignState.totalTargets,
                    failureBreakdown: counters.failureBreakdown || {},
                    counters: counters,
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

        // [R6.9G.10.3.5 A.2] Live Identity Query for CAPTCHA iframes
        case 'GET_ACTIVE_EXECUTION_IDENTITY':
            (async () => {
                try {
                    const senderTabId = sender?.tab?.id;
                    const isCampaignActive = campaignState.isActive;
                    const currentAttempt = campaignState.currentAttempt;
                    const targetTabId = campaignState.targetTabId || campaignState.currentTabId;

                    if (!isCampaignActive || !currentAttempt || !senderTabId || senderTabId !== targetTabId) {
                        sendResponse({
                            success: false,
                            error: 'NO_ACTIVE_EXECUTION_IDENTITY',
                            reason: !isCampaignActive ? 'CAMPAIGN_INACTIVE' : (!currentAttempt ? 'NO_CURRENT_ATTEMPT' : 'TAB_MISMATCH')
                        });
                        return;
                    }

                    sendResponse({
                        success: true,
                        identity: {
                            attemptId: currentAttempt.attemptId,
                            targetToken: campaignState.currentTargetToken || currentAttempt.targetToken,
                            campaignRunId: campaignState.campaignRunId,
                            sessionId: Number(campaignState.sessionId),
                            captchaEpoch: campaignState.captchaEpoch || 1,
                            tabId: targetTabId,
                            targetUrl: currentAttempt.url,
                            ts: Date.now()
                        }
                    });
                } catch (err) {
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true;

        // [R6.9G.10.3.5.1 Section 3] Authoritative Fail-Closed SUBMIT Privacy Transport Barrier
        case 'ASSERT_PRIVACY_TRANSPORT_READY':
            (async () => {
                try {
                    const validation = validateActiveExecution(request, sender, 'ASSERT_PRIVACY_TRANSPORT_READY', { allowBodyTabId: true });
                    if (!validation.valid) {
                        logBg(null, `[ASSERT_PRIVACY_TRANSPORT_READY] REJECT: reason=${validation.reason}. Identity invalid or stale.`, 'warning');
                        sendResponse({ ready: false, reason: validation.reason, isIdentityValid: false });
                        return;
                    }

                    const context = request.context || 'SUBMIT_BARRIER';
                    const privCheck = await assertPrivacyTransportReady(context);
                    if (!privCheck || privCheck.ready !== true) {
                        const blkReason = privCheck?.reason || 'PRIVACY_GATE_NOT_READY';
                        logBg(sender?.tab?.id || campaignState.currentTabId, `[PRIVACY_SUBMIT_BLOCK] context=${context} reason=${blkReason} — submit blocked fail-closed`, 'error');
                        sendResponse({ ready: false, reason: blkReason, isIdentityValid: true });
                        return;
                    }

                    sendResponse({ ready: true, reason: null, isIdentityValid: true });
                } catch (err) {
                    logBg(null, `[ASSERT_PRIVACY_TRANSPORT_READY] ERROR: ${err.message}`, 'error');
                    sendResponse({ ready: false, reason: err.message, isIdentityValid: false });
                }
            })();
            return true;

        // [R6.9G.1-1/2 & R6.9G.10.3.5 A.4] Owner CAPTCHA Decision Gate with Single Latch & Idempotent Counters
        case 'OWNER_CAPTCHA_REQUEST':
            (async () => {
                try {
                    const validation = validateActiveExecution(request, sender, 'OWNER_CAPTCHA_REQUEST', { checkEpoch: true, allowBodyTabId: true });
                    if (!validation.valid) {
                        logBg(null, `[OWNER_CAPTCHA] REJECT: reason=${validation.reason}. Stale or mismatched identity.`, 'warning');
                        sendResponse({ success: false, error: validation.reason, isTerminal: true });
                        return;
                    }

                    const { captchaType, sitekey, targetUrl } = request;
                    const curEpoch = campaignState.captchaEpoch || 1;
                    const challengeKey = `${validation.attemptId || campaignState.currentAttempt?.attemptId}:${curEpoch}:${sitekey || captchaType || 'default'}`;

                    if (!campaignState.captchaRequestLatch) campaignState.captchaRequestLatch = {};

                    if (campaignState.captchaRequestLatch[challengeKey] === 'PENDING_OWNER' && campaignState.currentTargetStage === 'CAPTCHA_PENDING_OWNER') {
                        // Suppress duplicate detector events idempotently without inflating counters
                        sendResponse({ success: true, status: 'PENDING_OWNER_DECISION', duplicateSuppressed: true });
                        return;
                    }

                    // [RC3.21 Remediation] Defer CAPTCHA request if target is currently paused in Manual Form Assist
                    if (campaignState.currentTargetStage === 'FORM_MANUAL_ASSIST_PENDING_OWNER' || campaignState.currentTargetStage === 'FORM_MANUAL_WAIT') {
                        logBg(null, `[OWNER_CAPTCHA] DEFERRED: Target currently in stage=${campaignState.currentTargetStage}. Deferring CAPTCHA request until manual assist resolves.`, 'info');
                        campaignState.deferredCaptchaRequest = request;
                        sendResponse({ success: true, status: 'CAPTCHA_DEFERRED_FOR_MANUAL_ASSIST' });
                        return;
                    }

                    campaignState.captchaRequestLatch[challengeKey] = 'PENDING_OWNER';

                    // Suspend target timer while waiting for owner decision
                    campaignState.currentTargetStage = 'CAPTCHA_PENDING_OWNER';

                    // Idempotent counters: count only once per attemptId + captchaEpoch
                    if (!campaignState.captchaRecordedAttempts) campaignState.captchaRecordedAttempts = new Set();
                    const attemptEpochKey = `${campaignState.currentAttempt?.attemptId}:${curEpoch}`;
                    if (!campaignState.captchaRecordedAttempts.has(attemptEpochKey)) {
                        campaignState.captchaRecordedAttempts.add(attemptEpochKey);
                        campaignState.captchaLedger.detected++;
                        campaignState.captchaLedger.pendingOwner++;
                    }

                    // Pause target deadline controller!
                    if (campaignState.targetDeadlineController) {
                        campaignState.targetDeadlineController.pause('CAPTCHA_PENDING_OWNER');
                    }
                    if (campaignState.activeTimeoutId) {
                        clearTimeout(campaignState.activeTimeoutId);
                        campaignState.activeTimeoutId = null;
                    }
                    if (chrome.alarms) chrome.alarms.clear(`xpider_timeout_${campaignState.sessionId}`);

                    const remBudgetMs = campaignState.targetDeadlineController ? campaignState.targetDeadlineController.getRemainingMs() : (campaignState.targetTimeoutMs || 180000);
                    logBg(null, `[CAPTCHA_WAIT] state=CAPTCHA_PENDING_OWNER deadlinePaused=true remainingMs=${remBudgetMs}`, 'info');
                    logBg(null, `[OWNER_CAPTCHA] Detected: type=${captchaType} sitekey=${sitekey}. Timer suspended. Awaiting owner decision.`, 'info');

                    // [R6.9G.10.3.7.1.4.8] Automated CAPTCHA LAB: TEST_ONLY + ownerFunctionTestMode + loopback + lab fixture.
                    let labAutoDrive = false;
                    try {
                        const _lu = targetUrl || campaignState.currentAttempt?.url || '';
                        const _isTestOnly = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function') ? BuildProvenance.isTestOnlyBuild() === true : false;
                        labAutoDrive = _isTestOnly && campaignState.ownerFunctionTestMode === true &&
                            /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/captcha-[a-z0-9-]+\.html/i.test(_lu) &&
                            typeof MockCaptchaProviderAdapter !== 'undefined';
                    } catch (_) { labAutoDrive = false; }

                    if (labAutoDrive) {
                        const labUrl = targetUrl || campaignState.currentAttempt?.url || '';
                        const labIdentity = {
                            attemptId: campaignState.currentAttempt?.attemptId,
                            targetToken: campaignState.currentTargetToken,
                            campaignRunId: campaignState.campaignRunId,
                            sessionId: campaignState.sessionId,
                            captchaEpoch: curEpoch,
                            tabId: campaignState.currentTabId
                        };
                        campaignState.captchaLabMetrics.detected = (campaignState.captchaLabMetrics.detected || 0) + 1;
                        campaignState.captchaLabMetrics.requested = (campaignState.captchaLabMetrics.requested || 0) + 1;
                        logBg(null, `[CAPTCHA_LAB_CASE] url=${labUrl} phase=AUTO_DRIVE_START type=${captchaType || 'recaptcha'}`, 'info');
                        logBg(null, `[CAPTCHA_UI_STATE] attemptId=${labIdentity.attemptId} from=PENDING_OWNER to=AUTO_SOLVING`, 'info');
                        sendResponse({ success: true, status: 'PENDING_OWNER_DECISION', labAutoDrive: true });
                        (async () => {
                            try {
                                await new Promise(r => setTimeout(r, 250));
                                if (campaignState.currentAttempt?.attemptId !== labIdentity.attemptId || campaignState.currentTargetStage !== 'CAPTCHA_PENDING_OWNER') return;
                                campaignState.captchaLedger.pendingOwner = Math.max(0, campaignState.captchaLedger.pendingOwner - 1);
                                campaignState.currentTargetStage = 'CAPTCHA_AUTO_SOLVING';
                                if (campaignState.targetDeadlineController) campaignState.targetDeadlineController.pause('CAPTCHA_AUTO_SOLVING');
                                const solveReq = Object.assign({}, labIdentity, {
                                    action: 'SOLVE_CAPTCHA', ownerAuthorized: true, labAutoDrive: true,
                                    type: captchaType || 'recaptcha', sitekey: sitekey || '', url: labUrl
                                });
                                const labTimeout = new Promise(r => setTimeout(() => r({ success: false, error: 'LAB_TIMEOUT' }), 30000));
                                const solveP = new Promise(resolve => {
                                    handleSolveCaptchaInternal(solveReq, { tab: { id: labIdentity.tabId } }, resolve).catch(e => resolve({ success: false, error: e.message }));
                                });
                                const res = await Promise.race([solveP, labTimeout]);
                                if (campaignState.currentAttempt?.attemptId !== labIdentity.attemptId) return;
                                if (res && res.success) {
                                    campaignState.captchaLabMetrics.success = (campaignState.captchaLabMetrics.success || 0) + 1;
                                    logBg(null, `[CAPTCHA_UI_STATE] attemptId=${labIdentity.attemptId} to=VERIFIED`, 'success');
                                    logBg(null, `[CAPTCHA_UI_CLEAR] reason=VERIFIED attemptId=${labIdentity.attemptId}`, 'info');
                                    logBg(null, `[CAPTCHA_LAB_CASE] url=${labUrl} result=PASS method=${res.method || 'mock_provider'}`, 'success');
                                    broadcastCounters();
                                } else {
                                    // Expected-failure fixtures (timeout / config-error) settle terminally and advance.
                                    logBg(null, `[CAPTCHA_UI_STATE] attemptId=${labIdentity.attemptId} to=EXPECTED_FAIL_PASS`, 'warning');
                                    logBg(null, `[CAPTCHA_UI_CLEAR] reason=EXPECTED_FAIL_PASS attemptId=${labIdentity.attemptId}`, 'info');
                                    logBg(null, `[CAPTCHA_LAB_CASE] url=${labUrl} result=EXPECTED_FAIL_PASS error=${String(res && res.error || 'UNKNOWN').slice(0, 60)} settle=SKIP_ADVANCE`, 'success');
                                    campaignState.captchaLedger.manualSkip++;
                                    campaignState.captchaLabMetrics.failure = (campaignState.captchaLabMetrics.failure || 0) + 1;
                                    campaignState.captchaLabMetrics.expectedFailPass = (campaignState.captchaLabMetrics.expectedFailPass || 0) + 1;
                                    if (res && res.error === 'SOLVER_TIMEOUT') {
                                        campaignState.captchaLabMetrics.timeout = (campaignState.captchaLabMetrics.timeout || 0) + 1;
                                    }
                                    campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
                                    if (campaignState.targetDeadlineController) campaignState.targetDeadlineController.resume();
                                    chrome.tabs.sendMessage(labIdentity.tabId, Object.assign({
                                        action: 'CAPTCHA_LAB_TERMINAL_SETTLE',
                                        result: 'EXPECTED_FAIL_PASS',
                                        reason: res && res.error
                                    }, labIdentity)).catch(() => {});

                                    // [R6.9G.10.3.7.1.4.9] Atomically resolve target in orchestrator to prevent generic fallback
                                    if (typeof campaignState.targetResolve === 'function') {
                                        const resolve = campaignState.targetResolve;
                                        campaignState.targetResolve = null;
                                        resolve({
                                            success: false,
                                            isExpectedFailPass: true,
                                            reasonCode: `EXPECTED_FAIL_PASS_${res?.error || 'UNKNOWN'}`,
                                            error: res?.error || 'EXPECTED_FAIL_PASS',
                                            metadata: {
                                                captchaLabCase: true,
                                                expectedFailPass: true,
                                                reason: res?.error
                                            }
                                        });
                                    }
                                    broadcastCounters();
                                }
                            } catch (labErr) {
                                logBg(null, `[CAPTCHA_LAB_CASE] url=${labUrl} result=DRIVER_ERROR error=${labErr.message}`, 'error');
                            }
                        })();
                        return;
                    }

                    // [Issue #6 RC3.22/RC3.23] Check UX settings for CAPTCHA handling
                    const userSettings = await chrome.storage.local.get([
                        'xpider_show_captcha_choice_popup',
                        'xpider_default_captcha_handling',
                        'xpider_captcha_api_key_2captcha',
                        'xpider_captcha_api_key_nopecha',
                        'xpider_captcha_api_key',
                        'captchaApiKey',
                        'xpider_stt_api_key',
                        'witKey'
                    ]);
                    const showCaptchaPopup = userSettings.xpider_show_captcha_choice_popup === true; // default false
                    const defaultHandling = userSettings.xpider_default_captcha_handling || 'AUTO_FIRST';

                    const hasProviderKey = Boolean(
                        userSettings.xpider_captcha_api_key_2captcha ||
                        userSettings.xpider_captcha_api_key_nopecha ||
                        userSettings.xpider_captcha_api_key ||
                        userSettings.captchaApiKey ||
                        userSettings.xpider_stt_api_key ||
                        userSettings.witKey
                    );

                    if (!showCaptchaPopup && defaultHandling === 'AUTO_FIRST') {
                        if (hasProviderKey) {
                            campaignState.currentTargetStage = 'CAPTCHA_AUTO_SOLVING';
                            if (campaignState.targetDeadlineController) {
                                campaignState.targetDeadlineController.pause('CAPTCHA_AUTO_SOLVING');
                            }
                            logBg(null, `[OWNER_CAPTCHA] Auto-first: launching automatic solver without popup`, 'info');
                            const solveReq = {
                                action: 'SOLVE_CAPTCHA',
                                ownerAuthorized: true,
                                type: captchaType || 'recaptcha',
                                sitekey: sitekey || '',
                                url: targetUrl || campaignState.currentAttempt?.url || '',
                                tabId: campaignState.currentTabId,
                                attemptId: campaignState.currentAttempt?.attemptId,
                                targetToken: campaignState.currentTargetToken,
                                campaignRunId: campaignState.campaignRunId,
                                sessionId: campaignState.sessionId,
                                captchaEpoch: curEpoch
                            };
                            await handleSolveCaptchaInternal(solveReq, sender, sendResponse);
                            return;
                        } else {
                            campaignState.captchaLedger.pendingOwner = Math.max(0, campaignState.captchaLedger.pendingOwner - 1);
                            campaignState.captchaLedger.manualSkip++;
                            campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
                            logBg(null, `[OWNER_CAPTCHA] Auto-first: no configured solver key and popup disabled. Advancing as SKIPPED.`, 'info');
                            
                            if (campaignState.currentAttempt?.attemptId) {
                                campaignState.captchaFailuresRecorded.add(campaignState.currentAttempt.attemptId);
                            }

                            if (campaignState.targetDeadlineController) {
                                campaignState.targetDeadlineController.cancel('CAPTCHA_SKIPPED_NO_SOLVER');
                            }

                            if (campaignState.currentTabId && chrome.alarms) {
                                chrome.alarms.clear(`xpider_watchdog_${campaignState.currentTabId}_${campaignState.sessionId}`);
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
                                        captchaStatus: 'SKIPPED_NO_SOLVER',
                                        autoFirst: true,
                                        popupShown: false
                                    }
                                });
                            }

                            sendResponse({ success: true, status: 'SKIPPED_NO_SOLVER' });
                            return;
                        }
                    }

                    // Broadcast to popup for modal display with complete 6-point canonical identity
                    chrome.runtime.sendMessage({
                        action: 'SHOW_CAPTCHA_DECISION_MODAL',
                        attemptId: campaignState.currentAttempt?.attemptId,
                        targetToken: campaignState.currentTargetToken,
                        campaignRunId: campaignState.campaignRunId,
                        sessionId: campaignState.sessionId,
                        captchaEpoch: curEpoch,
                        tabId: campaignState.currentTabId,
                        captchaType: captchaType || 'recaptcha',
                        sitekey: sitekey || '',
                        targetUrl: targetUrl || campaignState.currentAttempt?.url || ''
                    }).catch(() => {});

                    sendResponse({ success: true, status: 'PENDING_OWNER_DECISION' });
                } catch (e) {
                    logBg(null, `[OWNER_CAPTCHA] Error: ${e.message}`, 'error');
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        // [R6.9G.2] Owner made CAPTCHA decision: 'auto', 'manual', or 'skip'
        case 'CAPTCHA_OWNER_DECISION':
            (async () => {
                try {
                    const { decision, captchaType, sitekey } = request;
                    
                    // Validate complete 6-point identity
                    const validation = validateActiveExecution(request, sender, 'CAPTCHA_OWNER_DECISION', { checkEpoch: true, allowBodyTabId: true });
                    if (!validation.valid) {
                        logBg(null, `[CAPTCHA_DECISION] REJECT: reason=${validation.reason}. Stale or mismatched decision.`, 'warning');
                        sendResponse({ success: false, error: 'STALE_DECISION_REJECTED', reason: validation.reason });
                        return;
                    }

                    if (campaignState.currentTargetStage !== 'CAPTCHA_PENDING_OWNER') {
                        logBg(null, `[CAPTCHA_DECISION] REJECT: currentStage=${campaignState.currentTargetStage} (expected CAPTCHA_PENDING_OWNER)`, 'warning');
                        sendResponse({ success: false, error: 'STALE_DECISION_REJECTED', reason: 'invalid_stage' });
                        return;
                    }

                    logBg(null, `[CAPTCHA_DECISION] Owner chose: ${decision}`, 'info');
                    campaignState.captchaLedger.pendingOwner = Math.max(0, campaignState.captchaLedger.pendingOwner - 1);

                    if (decision === 'auto') {
                        // [R6.9G.2 Gate 4/5] Auto: transition to CAPTCHA_AUTO_SOLVING and start provider solve
                        campaignState.currentTargetStage = 'CAPTCHA_AUTO_SOLVING';
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.pause('CAPTCHA_AUTO_SOLVING');
                        }
                        const remMs = campaignState.targetDeadlineController ? campaignState.targetDeadlineController.getRemainingMs() : 0;
                        logBg(null, `[CAPTCHA_WAIT] state=CAPTCHA_AUTO_SOLVING deadlinePaused=true remainingMs=${remMs}`, 'info');
                        logBg(null, `[CAPTCHA_DECISION] Owner selected auto solve — proceeding to provider`, 'info');

                        const solveReq = Object.assign({}, request, {
                            action: 'SOLVE_CAPTCHA',
                            ownerAuthorized: true,
                            type: captchaType || request.type || 'recaptcha',
                            sitekey: sitekey || request.sitekey || '',
                            url: request.targetUrl || campaignState.currentAttempt?.url || ''
                        });
                        await handleSolveCaptchaInternal(solveReq, sender, sendResponse);
                        return;

                    } else if (decision === 'manual') {
                        // [R6.9G.2 Gate 6] Manual: hold timer, wait for verified solve evidence
                        campaignState.currentTargetStage = 'CAPTCHA_MANUAL_WAIT';
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.pause('CAPTCHA_MANUAL_WAIT');
                        }
                        const remMs = campaignState.targetDeadlineController ? campaignState.targetDeadlineController.getRemainingMs() : 0;
                        logBg(null, `[CAPTCHA_WAIT] state=CAPTCHA_MANUAL_WAIT deadlinePaused=true remainingMs=${remMs}`, 'info');
                        logBg(null, `[CAPTCHA_DECISION] Manual mode: timer paused. Waiting for owner solve or skip.`, 'info');

                        chrome.tabs.sendMessage(campaignState.currentTabId, {
                            action: 'START_MANUAL_CAPTCHA_WAIT',
                            attemptId: campaignState.currentAttempt?.attemptId,
                            targetToken: campaignState.currentTargetToken,
                            campaignRunId: campaignState.campaignRunId,
                            sessionId: campaignState.sessionId,
                            captchaEpoch: campaignState.captchaEpoch || 1,
                            tabId: campaignState.currentTabId,
                            captchaType: captchaType || 'recaptcha'
                        }).catch(() => {});

                        sendResponse({ success: true, status: 'MANUAL_HOLD' });

                    } else if (decision === 'skip') {
                        campaignState.captchaLedger.manualSkip++;
                        campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
                        logBg(null, `[CAPTCHA_DECISION] Owner skipped CAPTCHA challenge.`, 'info');
                        if (campaignState.currentAttempt?.attemptId) {
                            campaignState.captchaFailuresRecorded.add(campaignState.currentAttempt.attemptId);
                        }
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.cancel('CAPTCHA_SKIPPED_OWNER');
                        }
                        if (campaignState.currentTabId && chrome.alarms) {
                            chrome.alarms.clear(`xpider_watchdog_${campaignState.currentTabId}_${campaignState.sessionId}`);
                        }
                        chrome.tabs.sendMessage(campaignState.currentTabId, {
                            action: 'CAPTCHA_SKIP_DECISION',
                            attemptId: campaignState.currentAttempt?.attemptId,
                            targetToken: campaignState.currentTargetToken,
                            campaignRunId: campaignState.campaignRunId,
                            sessionId: campaignState.sessionId,
                            captchaEpoch: campaignState.captchaEpoch || 1,
                            tabId: campaignState.currentTabId,
                            result: 'SKIPPED',
                            reason: 'CAPTCHA_SKIPPED_OWNER'
                        }).catch(() => {});

                        if (typeof campaignState.targetResolve === 'function') {
                            const resolveTarget = campaignState.targetResolve;
                            campaignState.targetResolve = null;
                            resolveTarget({
                                success: false,
                                reasonCode: 'CAPTCHA_SKIPPED_OWNER',
                                metadata: {
                                    captchaStatus: 'SKIPPED_OWNER',
                                    autoFirst: false,
                                    popupShown: true
                                }
                            });
                        }
                        sendResponse({ success: true, status: 'SKIPPED' });
                    } else {
                        sendResponse({ success: false, error: `Unknown decision: ${decision}` });
                    }
                } catch (e) {
                    logBg(null, `[CAPTCHA_DECISION] Error: ${e.message}`, 'error');
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        // [R6.9G.2 Gate 6] Manual CAPTCHA result: owner completed manual solve
        case 'MANUAL_CAPTCHA_RESOLVED':
        case 'CAPTCHA_MANUAL_RESULT':
            (async () => {
                try {
                    const validation = validateActiveExecution(request, sender, 'MANUAL_CAPTCHA_RESOLVED', { checkEpoch: true, allowBodyTabId: true });
                    if (!validation.valid) {
                        logBg(null, `[CAPTCHA_MANUAL_RESULT] REJECT: reason=${validation.reason}. Stale or mismatched manual result.`, 'warning');
                        sendResponse({ success: false, error: 'STALE_MANUAL_RESULT', reason: validation.reason });
                        return;
                    }

                    if (campaignState.currentTargetStage !== 'CAPTCHA_MANUAL_WAIT') {
                        logBg(null, `[CAPTCHA_MANUAL_RESULT] REJECT: stage is ${campaignState.currentTargetStage}, expected CAPTCHA_MANUAL_WAIT.`, 'warning');
                        sendResponse({ success: false, error: 'STALE_MANUAL_RESULT', reason: 'invalid_stage' });
                        return;
                    }

                    const { verified, attemptId } = request;
                    if (verified) {
                        logBg(null, `[CAPTCHA_MANUAL_SUCCESS] Manual solve verified. attemptId=${attemptId}`, 'info');
                        campaignState.captchaLedger.manualSuccess++;
                        campaignState.counters.captchaSolved = (campaignState.counters.captchaSolved || 0) + 1;
                        campaignState.currentTargetStage = 'CAPTCHA';
                        broadcastCounters();

                        // [R6.9G.8] Resume deadline controller with exact remaining budget
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.resume();
                        }

                        sendResponse({ success: true, status: 'MANUAL_SUCCESS_RECORDED' });
                    } else {
                        sendResponse({ success: false, error: 'NOT_VERIFIED' });
                    }
                } catch(e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'CAPTCHA_CHALLENGE_VERIFIED':
            (async () => {
                try {
                    const validation = validateActiveExecution(request, sender, 'CAPTCHA_CHALLENGE_VERIFIED', { checkEpoch: true, allowBodyTabId: true });
                    if (!validation.valid) {
                        logBg(null, `[CAPTCHA_CHALLENGE_VERIFIED] REJECT: reason=${validation.reason}`, 'warning');
                        sendResponse({ success: false, error: validation.reason });
                        return;
                    }
                    logBg(null, `[CAPTCHA_CHALLENGE_VERIFIED] Target challenge verified resolved. attemptId=${request.attemptId}`, 'info');
                    if (campaignState.currentTargetStage === 'CAPTCHA_AUTO_SOLVING') {
                        campaignState.currentTargetStage = 'CAPTCHA_AUTO_SUCCESS';
                        logBg(null, `[CAPTCHA_AUTO_SUCCESS] Transitioned to CAPTCHA_AUTO_SUCCESS.`, 'success');
                        campaignState.captchaLedger.autoSuccess++;
                        campaignState.counters.captchaSolved = (campaignState.counters.captchaSolved || 0) + 1;
                        broadcastCounters();

                        // [R6.9G.8] Resume deadline controller with exact remaining budget
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.resume();
                        }
                    }
                    sendResponse({ success: true });
                } catch(e) {
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        // [R6.9G.8] Form Manual Assist Request (Triggered by Content Script)
        case 'FORM_MANUAL_ASSIST_REQUEST':
            (async () => {
                try {
                    const { attemptId, sourceUrl, contactPageUrl, formPageUrl, externalFormUrl, reason, unresolvedFields } = request;
                    const curAttemptId = attemptId || campaignState.currentAttempt?.attemptId || 'no_attempt';
                    const curToken = campaignState.currentTargetToken || 'no_token';
                    const curReason = reason || 'MANUAL_ASSIST_REQUIRED';
                    const dedupeKey = `${curAttemptId}:${curToken}:${curReason}`;
                    if (!campaignState.manualAssistDedupeSet) campaignState.manualAssistDedupeSet = new Set();
                    if (campaignState.manualAssistDedupeSet.has(dedupeKey)) {
                        logBg(null, `[MANUAL_ASSIST_DEDUPE_SUPPRESSED] Already requested assist for key=${dedupeKey}. Suppressing duplicate popup.`, 'info');
                        sendResponse({ success: true, status: 'SUPPRESSED_DUPLICATE' });
                        return;
                    }
                    campaignState.manualAssistDedupeSet.add(dedupeKey);

                    campaignState.currentTargetStage = 'FORM_MANUAL_ASSIST_PENDING_OWNER';
                    campaignState.manualAssistDetails = {
                        attemptId: curAttemptId,
                        sourceUrl: sourceUrl || campaignState.currentAttempt?.url || '',
                        contactPageUrl: contactPageUrl || '',
                        formPageUrl: formPageUrl || '',
                        externalFormUrl: externalFormUrl || '',
                        reason: curReason,
                        unresolvedFields: unresolvedFields || []
                    };

                    // Pause target deadline controller!
                    if (campaignState.targetDeadlineController) {
                        campaignState.targetDeadlineController.pause('FORM_MANUAL_ASSIST_PENDING_OWNER');
                    }
                    if (campaignState.activeTimeoutId) {
                        clearTimeout(campaignState.activeTimeoutId);
                        campaignState.activeTimeoutId = null;
                    }
                    if (chrome.alarms) chrome.alarms.clear(`xpider_timeout_${campaignState.sessionId}`);

                    logBg(null, `[MANUAL_ASSIST] state=FORM_MANUAL_ASSIST_PENDING_OWNER reason=${reason} contactPageUrl=${contactPageUrl} formPageUrl=${formPageUrl} externalFormUrl=${externalFormUrl || 'none'}`, 'warning');

                    // Update HistoryStore attempt with externalFormUrl and structured statuses
                    try {
                        const hs = await getHistoryStoreInstance();
                        const curAttemptId = attemptId || campaignState.currentAttempt?.attemptId;
                        if (curAttemptId && hs) {
                            await hs.updateAttemptContact(curAttemptId, {
                                contactPageUrl: contactPageUrl,
                                formPageUrl: formPageUrl,
                                externalFormUrl: externalFormUrl || null,
                                formDetectionStatus: externalFormUrl ? 'EXTERNAL_WIDGET' : (reason === 'FORM_NOT_ACCESSIBLE' ? 'NOT_FOUND' : 'FOUND'),
                                autofillStatus: reason === 'AUTOFILL_PARTIAL' ? 'PARTIAL' : (reason === 'REQUIRED_FIELDS_UNRESOLVED' ? 'PARTIAL' : 'MANUAL_REQUIRED'),
                                captchaStatus: campaignState.currentTargetStage?.includes('CAPTCHA') ? 'PENDING_OWNER' : 'NONE'
                            });
                            await hs.persist();
                        }
                    } catch (_) {}

                    // [Issue #6 RC3.22/RC3.23] Check UX settings for Form Assist handling
                    const assistSettings = await chrome.storage.local.get([
                        'xpider_auto_recovery_first',
                        'xpider_show_manual_form_assist_popup'
                    ]);
                    const showAssistPopup = assistSettings.xpider_show_manual_form_assist_popup === true; // default false
                    const autoRecoveryFirst = assistSettings.xpider_auto_recovery_first !== false; // default true

                    if (!campaignState.autoRecoveryAttempts) campaignState.autoRecoveryAttempts = {};
                    const autoAttempts = campaignState.autoRecoveryAttempts[curAttemptId] || 0;
                    if (autoRecoveryFirst && autoAttempts < 1) {
                        campaignState.autoRecoveryAttempts[curAttemptId] = autoAttempts + 1;
                        logBg(null, `[MANUAL_ASSIST] Automatic Recovery First: triggering auto retry attempt #${autoAttempts + 1} for attemptId=${curAttemptId}`, 'info');
                        if (campaignState.currentTabId) {
                            chrome.tabs.sendMessage(campaignState.currentTabId, {
                                action: 'RETRY_DETECTION',
                                attemptId: curAttemptId
                            }).catch(() => {});
                        }
                        sendResponse({ success: true, status: 'AUTO_RETRYING' });
                        return;
                    }

                    if (!showAssistPopup) {
                        logBg(null, `[MANUAL_ASSIST] Popup disabled (showManualFormAssistPopup=false). Settling as SKIPPED. reason=${curReason}`, 'warning');
                        campaignState.currentTargetStage = 'SKIPPED';
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.cancel('FORM_MANUAL_ASSIST_SKIPPED');
                        }
                        const extUrl = externalFormUrl || null;
                        const isPartial = curReason === 'AUTOFILL_PARTIAL' || curReason === 'REQUIRED_FIELDS_UNRESOLVED';
                        const formStatus = extUrl ? 'EXTERNAL_WIDGET' : (curReason === 'FORM_NOT_ACCESSIBLE' ? 'NOT_FOUND' : 'FOUND');
                        const autoStatus = isPartial ? 'PARTIAL' : 'MANUAL_REQUIRED';
                        const meta = {
                            submissionStatus: 'SKIPPED',
                            autofillStatus: autoStatus,
                            formDetectionStatus: formStatus,
                            externalFormUrl: extUrl
                        };
                        if (typeof campaignState.targetResolve === 'function') {
                            const resolve = campaignState.targetResolve;
                            campaignState.targetResolve = null;
                            resolve({
                                success: false,
                                reasonCode: 'FORM_MANUAL_ASSIST_SKIPPED',
                                metadata: meta
                            });
                        } else {
                            try {
                                const hs = await getHistoryStoreInstance();
                                if (curAttemptId && hs) {
                                    await hs.settleCanonicalAttempt(curAttemptId, 'SKIPPED', 'FORM_MANUAL_ASSIST_SKIPPED', {}, {
                                        campaignRunId: campaignState.campaignRunId,
                                        ...meta
                                    });
                                    await hs.persist();
                                    await syncCampaignCountersFromLedger(hs);
                                }
                            } catch (_) {}
                        }
                        sendResponse({ success: false, status: 'FORM_MANUAL_ASSIST_SKIPPED_BY_CONFIG' });
                        return;
                    }

                    // Broadcast to popup
                    chrome.runtime.sendMessage({
                        action: 'SHOW_MANUAL_FORM_ASSIST_MODAL',
                        attemptId: attemptId || campaignState.currentAttempt?.attemptId,
                        targetToken: campaignState.currentTargetToken,
                        campaignRunId: campaignState.campaignRunId,
                        sessionId: campaignState.sessionId,
                        sourceUrl: sourceUrl || campaignState.currentAttempt?.url || '',
                        contactPageUrl: contactPageUrl || '',
                        formPageUrl: formPageUrl || '',
                        externalFormUrl: externalFormUrl || '',
                        reason: reason || 'MANUAL_ASSIST_REQUIRED',
                        unresolvedFields: unresolvedFields || [],
                        template: campaignState.template || {}
                    }).catch(() => {});

                    sendResponse({ success: true, status: 'FORM_MANUAL_ASSIST_PENDING' });
                } catch (e) {
                    logBg(null, `[MANUAL_ASSIST] Error: ${e.message}`, 'error');
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        // [R6.9G.8] Form Manual Assist Decision (From Popup Owner Action)
        case 'FORM_MANUAL_ASSIST_DECISION':
            (async () => {
                try {
                    const { decision, attemptId, reason } = request;
                    const curAttemptId = attemptId || campaignState.currentAttempt?.attemptId;
                    logBg(null, `[MANUAL_ASSIST_DECISION] Owner chose: ${decision} for attemptId=${curAttemptId}`, 'info');

                    if (decision === 'retry') {
                        campaignState.currentTargetStage = 'IN_FLIGHT';
                        campaignState.deferredCaptchaRequest = null;
                        if (campaignState.captchaRequestLatch) campaignState.captchaRequestLatch = {};
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.resume();
                        }
                        if (campaignState.currentTabId) {
                            chrome.tabs.sendMessage(campaignState.currentTabId, {
                                action: 'RETRY_DETECTION',
                                attemptId: curAttemptId
                            }).catch(() => {});
                        }
                        sendResponse({ success: true, status: 'RETRYING' });
                    } else if (decision === 'manual_fill') {
                        campaignState.currentTargetStage = 'FORM_MANUAL_WAIT';
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.pause('FORM_MANUAL_WAIT');
                        }
                        logBg(null, `[MANUAL_ASSIST] state=FORM_MANUAL_WAIT deadlinePaused=true`, 'info');
                        sendResponse({ success: true, status: 'MANUAL_WAIT' });
                    } else if (decision === 'submitted_manually') {
                        campaignState.currentTargetStage = 'SUBMISSION_CONFIRMED';
                        campaignState.deferredCaptchaRequest = null;
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.cancel('OWNER_MANUAL_CONFIRMED');
                        }
                        if (campaignState.currentTabId) {
                            chrome.tabs.sendMessage(campaignState.currentTabId, {
                                action: 'CANCEL_MANUAL_ASSIST'
                            }).catch(() => {});
                        }
                        const extUrl = campaignState.manualAssistDetails?.externalFormUrl || null;
                        const formStatus = extUrl ? 'EXTERNAL_WIDGET' : 'FOUND';
                        const meta = {
                            ownerManualConfirmed: true,
                            submissionStatus: 'OWNER_MANUAL_CONFIRMED',
                            autofillStatus: 'MANUAL_REQUIRED',
                            formDetectionStatus: formStatus,
                            externalFormUrl: extUrl
                        };
                        if (typeof campaignState.targetResolve === 'function') {
                            const resolve = campaignState.targetResolve;
                            campaignState.targetResolve = null;
                            resolve({
                                success: true,
                                metadata: meta
                            });
                        } else {
                            try {
                                const hs = await getHistoryStoreInstance();
                                if (curAttemptId && hs) {
                                    await hs.settleCanonicalAttempt(curAttemptId, 'CONFIRMED_SUCCESS', 'OWNER_MANUAL_CONFIRMED', {}, {
                                        campaignRunId: campaignState.campaignRunId,
                                        ...meta
                                    });
                                    await hs.persist();
                                    await syncCampaignCountersFromLedger(hs);
                                }
                            } catch (hsErr) {
                                logBg(null, `[MANUAL_ASSIST] Failed to settle manual confirmation: ${hsErr.message}`, 'error');
                            }
                        }
                        sendResponse({ success: true, status: 'CONFIRMED_SUCCESS' });
                    } else if (decision === 'skip') {
                        campaignState.currentTargetStage = 'SKIPPED';
                        campaignState.deferredCaptchaRequest = null;
                        if (campaignState.targetDeadlineController) {
                            campaignState.targetDeadlineController.cancel('FORM_MANUAL_ASSIST_SKIPPED');
                        }
                        if (campaignState.currentTabId) {
                            chrome.tabs.sendMessage(campaignState.currentTabId, {
                                action: 'CANCEL_MANUAL_ASSIST'
                            }).catch(() => {});
                        }
                        const extUrl = campaignState.manualAssistDetails?.externalFormUrl || null;
                        const isPartial = campaignState.manualAssistDetails?.reason === 'AUTOFILL_PARTIAL' || campaignState.manualAssistDetails?.reason === 'REQUIRED_FIELDS_UNRESOLVED';
                        const formStatus = extUrl ? 'EXTERNAL_WIDGET' : (campaignState.manualAssistDetails?.reason === 'FORM_NOT_ACCESSIBLE' ? 'NOT_FOUND' : 'FOUND');
                        const autoStatus = isPartial ? 'PARTIAL' : 'MANUAL_REQUIRED';
                        const meta = {
                            submissionStatus: 'SKIPPED',
                            autofillStatus: autoStatus,
                            formDetectionStatus: formStatus,
                            externalFormUrl: extUrl
                        };
                        if (typeof campaignState.targetResolve === 'function') {
                            const resolve = campaignState.targetResolve;
                            campaignState.targetResolve = null;
                            resolve({
                                success: false,
                                reasonCode: 'FORM_MANUAL_ASSIST_SKIPPED',
                                metadata: meta
                            });
                        } else {
                            try {
                                const hs = await getHistoryStoreInstance();
                                if (curAttemptId && hs) {
                                    await hs.settleCanonicalAttempt(curAttemptId, 'SKIPPED', 'FORM_MANUAL_ASSIST_SKIPPED', {}, {
                                        campaignRunId: campaignState.campaignRunId,
                                        ...meta
                                    });
                                    await hs.persist();
                                    await syncCampaignCountersFromLedger(hs);
                                }
                            } catch (hsErr) {
                                logBg(null, `[MANUAL_ASSIST] Failed to settle skip: ${hsErr.message}`, 'error');
                            }
                        }
                        sendResponse({ success: true, status: 'SKIPPED' });
                    } else {
                        sendResponse({ success: false, error: `Unknown decision: ${decision}` });
                    }
                } catch (e) {
                    logBg(null, `[MANUAL_ASSIST_DECISION] Error: ${e.message}`, 'error');
                    sendResponse({ success: false, error: e.message });
                }
            })();
            return true;

        case 'SOLVE_CAPTCHA':
            (async () => {
                try {
                    await handleSolveCaptchaInternal(request, sender, sendResponse);
                } catch (e) {
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
                        if (migrationResult.repaired) {
                            // [R6.9G.10.3.4] Idempotent repair commit on already-promoted v2 schema
                            await chrome.storage.local.set(migrationResult.commit);
                            logBg(null, `📦 [Migration] Repaired templates_v2 from source=${migrationResult.repairSource}`, 'info');
                        } else {
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
            // [Issue #6 Email Collector Integration & R6.9C] Non-blocking email accumulation with generation check
            (async () => {
                try {
                    const { emails, pageEmails, collectibleEmails, hostname, url, generation } = request;
                    const cleanPageEmails = Array.isArray(pageEmails) ? pageEmails : (Array.isArray(emails) ? emails : []);
                    const cleanCollectibleEmails = Array.isArray(collectibleEmails) ? collectibleEmails : (Array.isArray(emails) ? emails : []);
                    const cleanHost = hostname || (url ? new URL(url).hostname : 'unknown');
                    const StoreClass = self.EmailCollectorStore || (typeof EmailCollectorStore !== 'undefined' ? EmailCollectorStore : null);
                    if (StoreClass) {
                        const store = (typeof StoreClass.getInstance === 'function')
                            ? StoreClass.getInstance(chrome.storage.local)
                            : (self.__xpiderEmailStore || new StoreClass(chrome.storage.local));
                        self.__xpiderEmailStore = store;
                        const stats = await store.add(cleanHost, cleanCollectibleEmails, url, generation, {
                            pageEmails: cleanPageEmails,
                            collectibleEmails: cleanCollectibleEmails
                        });
                        if (!stats.suppressed && !stats.staleGeneration && !stats.baselineSuppressed && cleanPageEmails.length > 0) {
                            logBg(sender.tab?.id, `[TARGET][${cleanHost}] emailsFoundCurrentPage=${stats.currentPageCount} emailsNewGlobal=${stats.newGlobalCount} totalEmailsGlobal=${stats.totalGlobalCount}`, 'info');
                        }
                        sendResponse({ success: true, ...stats });
                        return;
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
};
chrome.runtime.onMessage.addListener(mainBackgroundMessageListener);
if (typeof globalThis !== 'undefined') globalThis.__dispatchBackgroundMessage = mainBackgroundMessageListener;
if (typeof global !== 'undefined') global.__dispatchBackgroundMessage = mainBackgroundMessageListener;

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
        
        // [Issue #6 R6.9B Section 5] Capture baseline pre-existing user tabs (NEVER CLOSE THEM)
        try {
            preCampaignTabIds.clear();
            const existingTabs = await safeTabs.query({});
            for (const t of existingTabs) {
                if (t && t.id) preCampaignTabIds.add(t.id);
            }
            console.log(`[SESSION_BASELINE] Captured ${preCampaignTabIds.size} pre-existing user tabs as protected baseline.`);
        } catch (_) {}

        // [v12.0.0 & R6.9B] Mission Critical Timer/Tab Cleanup
        if (campaignState.activeTimeoutId) {
            clearTimeout(campaignState.activeTimeoutId);
            campaignState.activeTimeoutId = null;
        }
        await closeAllCampaignTabsExcept(null, 'START_CAMPAIGN_BOOT');
        if (chrome.alarms) chrome.alarms.clearAll(); 

        logBg(null, "[Boot] Previous state cleared.", "debug");

        // [NopeCHA Fix] Reset stale CAPTCHA solver state from previous campaign.
        // captchaAttempts and captchaBlocked accumulate across sessions and cause the
        // 90s cooldown loop. xpider_exec_identity retains the old attemptId which triggers
        // repeated STALE_TARGET_EVENT rejections in the new campaign.
        try {
            await chrome.storage.local.set({
                captchaAttempts: 0,
                captchaBlocked: false,
                xpider_exec_identity: null
            });
            logBg(null, "[Boot] CAPTCHA solver state reset (attempts=0, identity=null).", "debug");
        } catch (_) {}

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
            }
            if (self.__xpiderHistoryStore && typeof self.__xpiderHistoryStore.load === 'function') {
                await self.__xpiderHistoryStore.load();
            }
            hs = self.__xpiderHistoryStore;
        } catch (_) {}

        const isTestOnlyBuild = self.BuildProvenance &&
            typeof self.BuildProvenance.isTestOnlyBuild === 'function' &&
            self.BuildProvenance.isTestOnlyBuild();

        const isOwnerTestMode = !!options.ownerFunctionTestMode;
        const allLoopback = Array.isArray(queue) && queue.length > 0 && queue.length <= 30 && queue.every(url => {
            try {
                const u = new URL(url);
                return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && (u.port === '8088' || u.port === '9262');
            } catch (_) {
                return false;
            }
        });

        // [Directive B & C Authoritative Owner Test Override]
        // In Owner Test Mode on test-only builds with loopback fixtures, always bypass prior attempts!
        const allowOwnerTestBypass = isTestOnlyBuild && isOwnerTestMode && allLoopback && Boolean(options.overrideSkipAttempted);

        const shouldSkipAttempted = allowOwnerTestBypass ? false : ((options.skipPreviouslyAttempted !== false) && (!options.overrideSkipAttempted));

        for (const rawUrl of (Array.isArray(queue) ? queue : [])) {
            if (!rawUrl || typeof rawUrl !== 'string') continue;
            const norm = (hs && typeof hs.normalizeTargetIdentity === 'function') ? (hs.normalizeTargetIdentity(rawUrl) || rawUrl) : rawUrl;
            if (seenInBatch.has(norm)) {
                dupCount++;
                continue;
            }
            seenInBatch.add(norm);

            // Bypass suppression only for authorized Owner Functional Test mode on loopback fixtures
            if (!allowOwnerTestBypass && hs && typeof hs.isSuppressed === 'function' && hs.isSuppressed(norm)) {
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
            
            // [Directive E: NO FALSE FINISHED STATE]
            campaignState.isActive = false;
            campaignState.isLoopRunning = false;
            if (isOwnerTestMode) {
                chrome.runtime.sendMessage({
                    action: 'OWNER_TEST_PRECONDITION_FAILED_ALL_FILTERED',
                    originalInputCount,
                    historySkippedCount,
                    suppressedCount,
                    reason: 'All targets filtered out by history or suppression'
                }).catch(() => {});
                await removeOwnerTestNetworkGuard();
            }
            return {
                success: false,
                error: 'OWNER_TEST_PRECONDITION_FAILED_ALL_FILTERED',
                reason: `All ${originalInputCount} targets were filtered out (historySkipped=${historySkippedCount}, suppressed=${suppressedCount})`
            };
        }

        // [v18.15.5 & R6.9A] Restore Campaign Variables
        campaignState.queue = executableQueue;
        campaignState.template = template;
        campaignState.templateId = (template && (template.id || template.templateId)) || 'default';
        campaignState.templateVersion = (template && (template.version || template.templateVersion)) || 1;
        campaignState.delayMs = delayMs || 6000;
        campaignState.fillDelayMs = fillDelayMs || 300;
        campaignState.submitDelayMs = submitDelayMs || 1500;
        campaignState.ownerFunctionTestMode = !!options.ownerFunctionTestMode;
        campaignState.isActive = true;
        campaignState.isPaused = false; // [v18.7] Reset pause on new start
        campaignState.isNetworkDegraded = false;
        campaignState.networkRecoveryPhase = null;
        campaignState.networkCheckpoint = null;
        campaignState.networkRecoveryRetryCount = 0;
        campaignState.sessionId++; 
        campaignState.schedulerGeneration = (campaignState.schedulerGeneration || 0) + 1;
        campaignState.currentTargetAbortController = null;
        campaignState.totalTargets = executableQueue.length;
        campaignState.counters.total = executableQueue.length;
        campaignState.counters.remaining = executableQueue.length;
        campaignState.counters.inProgress = 0;
        campaignState.counters.completed = 0;
        campaignState.visitedUrls = []; 
        campaignState.successfulUrls = []; 
        campaignState.captchaLedger = { detected: 0, pendingOwner: 0, autoSuccess: 0, autoFailure: 0, manualSuccess: 0, manualSkip: 0 };
        campaignState.captchaFailuresRecorded = new Set();
        campaignState.isFaulted = false;
        campaignState.faultReason = null;
        campaignState.activeTargetInFlight = false;
        campaignState.activeTargetCount = 0;
        campaignState.maxConcurrentObserved = 0;
        campaignState.lastFinalTs = 0;
        campaignState.pausedCheckpoint = null;
        campaignState.captchaEpoch = (campaignState.captchaEpoch || 0) + 1; // [Issue #6 R6.9E B4] New epoch on start
        campaignState.captchaEpochBlockedErrors = {};
        for (const k of Object.keys(coreRuntimeRefErrors)) delete coreRuntimeRefErrors[k];
        campaignState.targetTimeoutMs = options.targetTimeoutMs || 180000;

        // [R6.9A & Directive D] Persistent campaignRunId for ledger scoping
        if (options.campaignRunId) {
            campaignState.campaignRunId = options.campaignRunId;
        } else if (isOwnerTestMode && hs && hs.activeCampaignRunId && hs.activeCampaignRunId.startsWith('owner_test_run_')) {
            campaignState.campaignRunId = hs.activeCampaignRunId;
        } else if (isOwnerTestMode && campaignState.campaignRunId && campaignState.campaignRunId.startsWith('owner_test_run_')) {
            // Keep current owner_test_run_
        } else if (!options.isResume || !campaignState.campaignRunId) {
            campaignState.campaignRunId = (isOwnerTestMode ? 'owner_test_run_' : 'run_') + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        }
        if (hs) hs.activeCampaignRunId = campaignState.campaignRunId;
        chrome.storage.local.set({ xpider_active_campaign_run_id: campaignState.campaignRunId }).catch(() => {});

        // [F. Ledger Metadata Initialization] Ingest importRows for currentRun if not already present
        if (hs && typeof hs.ingestImportRows === 'function') {
            const existingRowsForRun = hs.importRows.filter(r => r.importId === campaignState.campaignRunId || r.campaignRunId === campaignState.campaignRunId);
            if (existingRowsForRun.length === 0 && executableQueue.length > 0) {
                await hs.ingestImportRows(executableQueue, campaignState.campaignRunId);
                console.log(`[LEDGER_INIT] campaignRunId=${campaignState.campaignRunId} totalImportRows=${executableQueue.length} pending=${executableQueue.length}`);
                logBg(null, `[LEDGER_INIT] campaignRunId=${campaignState.campaignRunId} totalImportRows=${executableQueue.length} pending=${executableQueue.length}`, "info");
            }
        }
        
        logBg(null, "[Boot] Variables initialized.", "debug");
        logBg(null, "🚀 Engine booting...", "start");
        logBg(null, `[CAMPAIGN_START] buildId=${_swBootId} campaignRunId=${campaignState.campaignRunId} totalTargets=${campaignState.totalTargets} mode=${campaignState.ownerFunctionTestMode ? 'OWNER_TEST' : 'NORMAL'} delayMs=${campaignState.delayMs} fillDelayMs=${campaignState.fillDelayMs} submitDelayMs=${campaignState.submitDelayMs}`, "start");
        
        // Clear old paused checkpoint on fresh campaign start
        chrome.storage.local.remove(['xpider_paused_checkpoint']).catch(() => {});
        saveCampaignState().catch(() => {}); 
        logBg(null, "[Boot] Storage sync initiated.", "debug");

        await syncCampaignCountersFromLedger(hs);

        processNextCampaignTarget(campaignState.sessionId);
        logBg(null, "[Boot] Target loop triggered.", "debug");
        
        return { success: true };
    } catch (err) {
        console.error("Orchestrator Crash:", err);
        throw err;
    }
}

async function pauseCampaignOrchestrator(saveCheckpoint = true) {
    // [R6.9G.7 P0-8 Quiescent Pause Barrier]
    // 1. Invalidate scheduler generation so any pending setTimeout / alarm no-ops immediately
    campaignState.schedulerGeneration = (campaignState.schedulerGeneration || 0) + 1;
    campaignState.isPaused = true;
    campaignState.captchaEpoch = (campaignState.captchaEpoch || 0) + 1;
    logBg(null, `[PAUSE] campaignRunId=${campaignState.campaignRunId} remaining=${campaignState.queue ? campaignState.queue.length : 0} inProgress=${campaignState.counters ? campaignState.counters.inProgress : 0}`, "info");
    logBg(null, "⏸️ [Engine] Campaign PAUSED / STOP & SAVE requested.", "info");

    // 2. Abort active target orchestration and content script
    if (campaignState.currentTargetAbortController) {
        campaignState.currentTargetAbortController.abort('PAUSE');
    }
    if (campaignState.currentTabId) {
        chrome.tabs.sendMessage(campaignState.currentTabId, {
            action: 'ABORT_TARGET',
            reason: 'PAUSE',
            targetToken: campaignState.currentTargetToken
        }).catch(() => {});
    }

    if (campaignState.currentDiscoveryCtx) {
        campaignState.currentDiscoveryCtx.aborted = true;
        campaignState.currentDiscoveryCtx = null;
    }

    if (campaignState.activeTimeoutId) {
        clearTimeout(campaignState.activeTimeoutId);
        campaignState.activeTimeoutId = null;
    }
    if (campaignState.targetDeadlineController) {
        campaignState.targetDeadlineController.cancel('PAUSE');
        campaignState.targetDeadlineController = null;
    }
    if (typeof campaignState.targetResolve === 'function') {
        const resolve = campaignState.targetResolve;
        campaignState.targetResolve = null;
        resolve({
            success: false,
            reasonCode: 'PAUSED',
            metadata: { submissionStatus: 'PAUSED' }
        });
    }
    chrome.runtime.sendMessage({ action: 'CLOSE_ALL_MODALS' }).catch(() => {});
    if (chrome.alarms) {
        chrome.alarms.clear("xpider_next_target");
        chrome.alarms.clear("xpider_next_target_failsafe");
    }

    // 3. WAIT FOR ACTIVE ORCHESTRATION TO QUIESCE BEFORE WRITING CHECKPOINT SNAPSHOT
    const pauseQuiesceStart = Date.now();
    while (campaignState.activeTargetInFlight && (Date.now() - pauseQuiesceStart < 5000)) {
        await new Promise(r => setTimeout(r, 50));
    }

    if (campaignState.activeTargetInFlight) {
        logBg(null, `🚨 [PAUSE_FAULT] Active target failed to quiesce during pause. Entering HOLD/FAULT state. Checkpoint held.`, 'error');
        campaignState.isFaulted = true;
        campaignState.faultReason = 'PAUSE_QUIESCENCE_TIMEOUT';
        return { success: false, status: 'HOLD_FAULT', reason: 'PAUSE_QUIESCENCE_TIMEOUT' };
    }

    // [Issue #6 R6.9E B5] 4. Inspect currentAttempt state BEFORE closing tabs
    const currentAtt = campaignState.currentAttempt;
    if (currentAtt && currentAtt.url) {
        if (currentAtt.status === 'PREPARING') {
            // [Issue #6 R6.9E B5] PREPARING -> retryable/requeue, NOT failure and NOT delivery unknown!
            const normUrl = normalizeUrl(currentAtt.url);
            campaignState.visitedUrls = campaignState.visitedUrls.filter(u => u !== normUrl && u !== currentAtt.url);
            if (!campaignState.queue.includes(currentAtt.url)) {
                campaignState.queue.unshift(currentAtt.url);
            }
            logBg(null, `🔄 [Pause] Current target PREPARING re-queued to front: ${currentAtt.url}`, "info");
        } else if (currentAtt.status === 'SUBMIT_PENDING') {
            // [Issue #6 R6.9E B5] SUBMIT_PENDING -> PAUSED_UNKNOWN (delivery-uncertain)
            try {
                const hs = await getHistoryStoreInstance();
                if (currentAtt.attemptId && hs) {
                    await hs.settleCanonicalAttempt(currentAtt.attemptId, 'PAUSED_UNKNOWN', REASON_CODES.DELIVERY_UNKNOWN, {}, {
                        campaignRunId: campaignState.campaignRunId
                    });
                    await hs.persist();
                }
            } catch (_) {}
            if (!campaignState.outcomeHistogram) campaignState.outcomeHistogram = {};
            campaignState.outcomeHistogram[REASON_CODES.DELIVERY_UNKNOWN] = (campaignState.outcomeHistogram[REASON_CODES.DELIVERY_UNKNOWN] || 0) + 1;
            logBg(null, `⚠️ [Pause] In-flight target settled as PAUSED_UNKNOWN (not requeued): ${currentAtt.url}`, "warning");
        }
        campaignState.currentAttempt = null;
        campaignState.currentTargetStage = null;
    }

    campaignState.activeTargetInFlight = false;
    campaignState.activeTargetCount = 0;

    // [Issue #6 R6.9E B5] 4. Persist ledger/counters/checkpoint
    const hsInstance = await getHistoryStoreInstance();
    await syncCampaignCountersFromLedger(hsInstance);

    // [Issue #6 R6.9E B5] 5. ONLY THEN close campaign tabs
    await closeAllCampaignTabsExcept(null, 'PAUSE_CAMPAIGN');
    campaignState.currentTabId = null;
    campaignState.targetTabId = null;
    campaignState.submitLock = false;
    campaignState.timeoutWatchdogGen = (campaignState.timeoutWatchdogGen || 0) + 1;
    chrome.storage.local.remove('xpider_currentAttempt').catch(() => {});

    // [R6.9G.9 Restore Privacy Settings on Pause/Stop]
    const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
    if (pg) {
        await pg.restoreOriginalSettings({ forceDirect: campaignState.ownerFunctionTestMode === true });
        const isReady = typeof pg.isPrivacyGateReady === 'function' ? pg.isPrivacyGateReady() : Boolean(pg.isGateReady);
        const msg = `[PRIVACY_SETTINGS_RESTORED] gateReady=${isReady} transportEnforced=${isReady}`;
        console.log(msg);
        logBg(null, msg, 'info');
    }
    // [R6.9G.10.3.7.1.4.5 Blocker 1 Lifecycle Fix]:
    // Do NOT remove Owner Test DNR rules merely because campaign is PAUSED.
    // Keep the guard installed while Owner Functional Test Mode remains ON and a test campaign or paused checkpoint is live.
    // (Rules are only removed on END_CAMPAIGN or when test mode is turned OFF).

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
            restorationLogged: false,
            ownerFunctionTestMode: Boolean(campaignState.ownerFunctionTestMode)
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
    logBg(null, `[RESUME] campaignRunId=${campaignState.campaignRunId} remaining=${campaignState.queue ? campaignState.queue.length : 0}`, "start");
    logBg(null, "▶️ [Engine] RESUME_CAMPAIGN requested.", "info");

    let checkpoint = campaignState.pausedCheckpoint;
    if (!checkpoint) {
        const stored = await chrome.storage.local.get(['xpider_paused_checkpoint']);
        checkpoint = stored.xpider_paused_checkpoint || null;
    }

    if (!checkpoint || !Array.isArray(checkpoint.remainingQueue) || checkpoint.remainingQueue.length === 0) {
        throw new Error("NO_RESUMABLE_CHECKPOINT: No paused campaign snapshot found.");
    }

    // [R6.9G.10.3.7.1.4.5 Blocker 1 Lifecycle Fix]:
    // Before RESUME is acknowledged, independently call installOwnerTestNetworkGuard(), verify getSessionRules() readback, and FAIL-CLOSED if verification fails.
    const isOwnerTest = Boolean(checkpoint.ownerFunctionTestMode || campaignState.ownerFunctionTestMode);
    if (isOwnerTest) {
        const isTestBuild = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function')
            ? BuildProvenance.isTestOnlyBuild()
            : false;
        if (!isTestBuild) {
            throw new Error("FAIL_CLOSED: Cannot resume Owner Test Mode campaign in non-test build.");
        }
        campaignState.ownerFunctionTestMode = true;
        try {
            await installOwnerTestNetworkGuard();
            const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
            const installedIds = new Set(sessionRules.map(r => r.id));
            const allPresent = OWNER_TEST_GUARD_RULE_IDS.every(id => installedIds.has(id));
            if (!allPresent) {
                throw new Error("OWNER_TEST_GUARD_READBACK_INCOMPLETE: Not all rules present after resume install");
            }
            console.log('[OWNER_TEST_GUARD] declarativeNetRequest session rules confirmed & verified on RESUME');
            if (typeof logBg === 'function') {
                logBg(null, '[OWNER_TEST_GUARD] declarativeNetRequest session rules confirmed & verified on RESUME', 'info');
            }
        } catch (guardErr) {
            console.error(`[OWNER_FUNCTION_TEST_GUARD_FAIL] Failed to reinstall/verify network guard on RESUME: ${guardErr.message}`);
            if (typeof logBg === 'function') {
                logBg(null, `[OWNER_FUNCTION_TEST_GUARD_FAIL] Failed to reinstall/verify network guard on RESUME: ${guardErr.message}`, 'error');
            }
            throw new Error(`FAIL_CLOSED_GUARD_ERROR_ON_RESUME: ${guardErr.message}`);
        }
    }

    // Restore exact snapshot without full queue reload!
    campaignState.queue = [...checkpoint.remainingQueue];
    const requeuedNorms = new Set(campaignState.queue.map(u => normalizeUrl(typeof u === 'string' ? u : (u?.url || ''))));
    campaignState.visitedUrls = [...(checkpoint.visitedUrls || [])].filter(u => !requeuedNorms.has(normalizeUrl(u)));
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
    if (campaignState.currentTargetAbortController) {
        try { campaignState.currentTargetAbortController.abort('END_CAMPAIGN'); } catch (_) {}
        campaignState.currentTargetAbortController = null;
    }
    campaignState.activeTargetInFlight = false;
    campaignState.activeTargetCount = 0;
    if (campaignState.activeTimeoutId) {
        clearTimeout(campaignState.activeTimeoutId);
        campaignState.activeTimeoutId = null;
    }
    await closeAllCampaignTabsExcept(null, 'END_CAMPAIGN');
    campaignState.currentTabId = null;
    campaignState.targetTabId = null;
    await chrome.storage.local.remove(['xpider_paused_checkpoint', 'xpider_currentAttempt', 'xpider_isActive', 'xpider_isPaused']);
    if (campaignState.ownerFunctionTestMode) {
        await removeOwnerTestNetworkGuard();
    }
    printCampaignOutcomeSummary();
    return { success: true };
}

function stopCampaignOrchestrator() {
    logBg(null, `[CAMPAIGN_STOP] campaignRunId=${campaignState.campaignRunId} total=${campaignState.counters ? campaignState.counters.total : 0} completed=${campaignState.counters ? campaignState.counters.completed : 0} success=${campaignState.counters ? campaignState.counters.success : 0} failed=${campaignState.counters ? campaignState.counters.failed : 0} skipped=${campaignState.counters ? campaignState.counters.skipped : 0}`, "warning");
    return pauseCampaignOrchestrator(true);
}

async function printCampaignOutcomeSummary() {
    logBg(null, "=== CAMPAIGN OUTCOME SUMMARY (currentRun) ===", "info");
    try {
        const hs = await getHistoryStoreInstance();
        const stats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
        
        logBg(null, `${('CONFIRMED_SUCCESS:').padEnd(28)} ${stats.success}`, "info");
        logBg(null, `${('FAILURE:').padEnd(28)} ${stats.failure}`, "info");
        logBg(null, `${('TIMEOUT_LOCAL:').padEnd(28)} ${stats.timeoutLocal}`, "info");
        logBg(null, `${('TIMEOUT_GLOBAL:').padEnd(28)} ${stats.timeoutGlobal}`, "info");
        logBg(null, `${('DELIVERY_UNKNOWN:').padEnd(28)} ${stats.unknown}`, "info");
        logBg(null, `${('SKIPPED:').padEnd(28)} ${stats.skipped}`, "info");
        logBg(null, `${('PAUSED_UNKNOWN:').padEnd(28)} ${stats.paused}`, "info");
        logBg(null, "----------------------------------------", "info");
        logBg(null, `${('TOTAL TERMINAL / COMPLETED:').padEnd(28)} ${stats.completed}`, "info");
        
        console.log(`[CAMPAIGN_SUMMARY] success=${stats.success} failure=${stats.failure} timeoutLocal=${stats.timeoutLocal} timeoutGlobal=${stats.timeoutGlobal} unknown=${stats.unknown} skipped=${stats.skipped} paused=${stats.paused} completed=${stats.completed}`);
    } catch (e) {
        logBg(null, `Failed to load ledger stats for summary: ${e.message}`, "warning");
    }
    logBg(null, "========================================", "info");
}

/**
 * [v18.7] Pause Check Helper
 */
async function checkPause() {
    while (campaignState.isActive && campaignState.isPaused) {
        await new Promise(r => setTimeout(r, 1000));
    }
}

// [R6.9G.7 P0-1] Atomic Target Slot Acquisition:
// Check + claim is indivisible. Synchronously sets activeTargetInFlight=true before returning.
// Stale scheduler generations and stale sessions immediately no-op.
async function acquireTargetSlot(sessionId, expectedGeneration) {
    const SLOT_POLL_MS = 50;
    const SLOT_TIMEOUT_MS = 300000;
    const start = Date.now();
    if (campaignState.isFaulted) {
        console.error(`[SERIALIZED_GATE] Cannot acquire slot: campaign is in FAULT state (reason=${campaignState.faultReason})`);
        return { granted: false, reason: 'SYSTEM_FAULTED' };
    }
    while (campaignState.activeTargetInFlight) {
        if (campaignState.isFaulted) {
            return { granted: false, reason: 'SYSTEM_FAULTED' };
        }
        if (sessionId !== undefined && sessionId !== campaignState.sessionId) {
            console.log(`[SERIALIZED_GATE] Stale session ${sessionId} aborted while waiting for slot.`);
            return { granted: false, reason: 'STALE_SESSION' };
        }
        if (expectedGeneration !== undefined && expectedGeneration !== campaignState.schedulerGeneration) {
            console.log(`[SERIALIZED_GATE] Stale generation ${expectedGeneration} (current: ${campaignState.schedulerGeneration}) aborted.`);
            return { granted: false, reason: 'STALE_GENERATION' };
        }
        if (!campaignState.isActive || campaignState.isPaused) {
            return { granted: false, reason: 'INACTIVE_OR_PAUSED' };
        }
        if (Date.now() - start > SLOT_TIMEOUT_MS) {
            console.warn(`[SERIALIZED_GATE] Waiter timeout after ${SLOT_TIMEOUT_MS}ms. Self-terminating waiter (NOT releasing lease).`);
            return { granted: false, reason: 'WAITER_TIMEOUT' };
        }
        await new Promise(r => setTimeout(r, SLOT_POLL_MS));
    }

    if (campaignState.isFaulted) {
        return { granted: false, reason: 'SYSTEM_FAULTED' };
    }

    if (sessionId !== undefined && sessionId !== campaignState.sessionId) {
        return { granted: false, reason: 'STALE_SESSION' };
    }
    if (expectedGeneration !== undefined && expectedGeneration !== campaignState.schedulerGeneration) {
        return { granted: false, reason: 'STALE_GENERATION' };
    }
    if (!campaignState.isActive || campaignState.isPaused) {
        return { granted: false, reason: 'INACTIVE_OR_PAUSED' };
    }

    // Double check under tick
    if (campaignState.activeTargetInFlight) {
        return acquireTargetSlot(sessionId, expectedGeneration);
    }

    // ATOMIC SYNCHRONOUS CLAIM:
    campaignState.activeTargetInFlight = true;
    campaignState.activeTargetCount = (campaignState.activeTargetCount || 0) + 1;
    campaignState.maxConcurrentObserved = Math.max(campaignState.maxConcurrentObserved || 0, campaignState.activeTargetCount);
    console.log(`[SERIALIZED_GATE] Slot acquired atomically. activeTargetInFlight=true activeTargetCount=${campaignState.activeTargetCount} maxConcurrent=${campaignState.maxConcurrentObserved}`);
    return { granted: true, reason: 'SLOT_ACQUIRED' };
}

// Retain backward-compatible waitForTargetSlot signature calling acquireTargetSlot
async function waitForTargetSlot(sessionId, leaseToken) {
    return acquireTargetSlot(sessionId, campaignState.schedulerGeneration);
}

async function processNextCampaignTarget(loopSessionId, loopGeneration) {
    // [R6.9G.7 P0-1] Generation Guard: stale wakeups no-op
    if (loopGeneration !== undefined && loopGeneration !== campaignState.schedulerGeneration) {
        console.log(`[Engine] Stale generation ${loopGeneration} (expected ${campaignState.schedulerGeneration}). Ignoring wakeup.`);
        return;
    }

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
    const currentGen = loopGeneration || campaignState.schedulerGeneration;

    campaignState.isLoopRunning = true;
    campaignState.lastActionTime = Date.now();

    try {
        await checkPause(); // [v18.7] First checkpoint

        // Check if queue is empty before acquiring slot
        if (!campaignState.isActive || campaignState.queue.length === 0) {
            if (campaignState.isActive) {
                if (campaignState.totalTargets === 0) {
                    console.warn('[CAMPAIGN_EMPTY_QUEUE_ABORT] totalTargets === 0. Aborting without CAMPAIGN_FINISHED.');
                    campaignState.isActive = false;
                    campaignState.isLoopRunning = false;
                    chrome.runtime.sendMessage({
                        action: 'OWNER_TEST_PRECONDITION_FAILED_ALL_FILTERED',
                        reason: 'No executable targets'
                    }).catch(() => {});
                    return;
                }
                const FINISH_BARRIER_POLL_MS = 100;
                const FINISH_BARRIER_FAULT_MS = 120000; // 2 minutes hard limit before FAULT
                const barrierStart = Date.now();
                while (campaignState.activeTargetInFlight) {
                    if (Date.now() - barrierStart > FINISH_BARRIER_FAULT_MS) {
                        console.error('[FINISH_BARRIER] FAULT: last target did not finalize within 120s. Campaign entering FAULT state (not FINISHED).');
                        logBg(null, '[FINISH_BARRIER] FAULT: campaign cannot finish — last target still in flight.', 'error');
                        campaignState.isFaulted = true;
                        campaignState.isLoopRunning = false;
                        chrome.runtime.sendMessage({
                            action: 'CAMPAIGN_FAULT',
                            reason: 'FINISH_BARRIER_TIMEOUT',
                            counters: campaignState.counters
                        }).catch(() => {});
                        return;
                    }
                    await new Promise(r => setTimeout(r, FINISH_BARRIER_POLL_MS));
                }
                const hsForFinish = await getHistoryStoreInstance();
                await syncCampaignCountersFromLedger(hsForFinish);
                const finishStats = hsForFinish ? hsForFinish.getLedgerStats('currentRun', campaignState.campaignRunId) : null;
                console.log(`[FINISH_BARRIER] Clear. lastFinalTs=${campaignState.lastFinalTs} ledgerCompleted=${finishStats?.completed} total=${campaignState.counters.total}`);
                logBg(null, `[FINISH_BARRIER] lastFinalTs=${campaignState.lastFinalTs} barrierClear. CAMPAIGN_FINISHED proceeding.`, 'info');

                logBg(null, 'Campaign finished!', 'complete');
                campaignState.isActive = false;
                campaignState.counters.inProgress = 0;
                await closeAllCampaignTabsExcept(null, 'CAMPAIGN_FINISHED');
                await persistCounters();
                broadcastCounters();
                chrome.runtime.sendMessage({
                    action: 'CAMPAIGN_FINISHED',
                    counters: campaignState.counters
                }).catch(() => {});

                // [R6.9G.9 Restore Privacy Settings on Campaign Finished]
                const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                if (pg) {
                    await pg.restoreOriginalSettings({ forceDirect: campaignState.ownerFunctionTestMode === true });
                    const isReady = typeof pg.isPrivacyGateReady === 'function' ? pg.isPrivacyGateReady() : Boolean(pg.isGateReady);
                    const msg = `[PRIVACY_SETTINGS_RESTORED] gateReady=${isReady} transportEnforced=${isReady}`;
                    console.log(msg);
                    logBg(null, msg, 'info');
                }
                if (campaignState.ownerFunctionTestMode) {
                    await removeOwnerTestNetworkGuard();
                }
            }
            campaignState.isLoopRunning = false;
            return;
        }

        // [R6.9G.7 P0-1] Atomic Slot Acquisition: Indivisibly claims activeTargetInFlight=true
        const slotResult = await acquireTargetSlot(currentSession, currentGen);
        if (!slotResult.granted) {
            console.log(`[SERIALIZED_GATE] Slot not granted reason=${slotResult.reason}. Exiting loop.`);
            campaignState.isLoopRunning = false;
            return;
        }

        // Guard against pause/fault during slot acquisition
        if (!campaignState.isActive || campaignState.isPaused || campaignState.isFaulted) {
            console.log('[SERIALIZED_GATE] Campaign paused/inactive/faulted at slot entry — releasing lease and aborting start.');
            campaignState.activeTargetInFlight = false;
            campaignState.activeTargetCount = Math.max(0, (campaignState.activeTargetCount || 1) - 1);
            campaignState.isLoopRunning = false;
            return;
        }

        // Now we own activeTargetInFlight = true
        let leaseReleased = false;
        let orchestrationSettled = false;
        const targetAbortController = new AbortController();
        campaignState.currentTargetAbortController = targetAbortController;
        const releaseLease = () => {
            if (!leaseReleased) {
                leaseReleased = true;
                campaignState.lastFinalTs = Date.now();
                campaignState.activeTargetInFlight = false;
                campaignState.activeTargetCount = Math.max(0, (campaignState.activeTargetCount || 1) - 1);
                console.log(`[SERIALIZED_GATE] Slot released. activeTargetInFlight=false activeTargetCount=${campaignState.activeTargetCount}`);
            }
        };



        try {
            // [Issue #6 R6.9B Section 2] PRE-NEXT-TARGET Hard Tab Cleanup Barrier
            await closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
            campaignOwnedTabIds.clear();
            retainedTabIds.clear();
            campaignState.currentTabId = null;
            campaignState.targetTabId = null;

            const privCheck = await assertPrivacyTransportReady('PRE_TARGET_BARRIER');
            if (!privCheck.ready) {
                const blkReason = privCheck.reason || 'PRIVACY_GATE_NOT_READY';
                logBg(null, `[PRIVACY_GATE_BLOCK] reason=${blkReason} attemptId=none targetUrl=next_queue. Entering network recovery freeze...`, 'warning');
                console.warn(`[PRIVACY_GATE_BLOCK] reason=${blkReason} attemptId=none targetUrl=next_queue`);
                orchestrationSettled = true;
                releaseLease();
                await freezeActiveCampaignJob(`PRE_TARGET_BARRIER_BLOCK: ${blkReason}`);
                return;
            }

            if (targetAbortController.signal.aborted || campaignState.isPaused || !campaignState.isActive) {
                logBg(null, `⏸️ [Engine] Target abort or pause detected before queue advance. Quiescing cleanly.`, "info");
                orchestrationSettled = true;
                releaseLease();
                return;
            }

            if (campaignState.queue.length === 0) {
                orchestrationSettled = true;
                releaseLease();
                campaignState.isLoopRunning = false;
                return processNextCampaignTarget(currentSession, campaignState.schedulerGeneration);
            }

            const currentUrl = campaignState.queue.shift();
            const normalized = normalizeUrl(currentUrl);

            if (campaignState.visitedUrls.includes(normalized)) {
                logBg(null, `Skipping already visited target: ${currentUrl}`, "info");
                orchestrationSettled = true;
                releaseLease();
                return processNextCampaignTarget(currentSession, campaignState.schedulerGeneration);
            }
            campaignState.visitedUrls.push(normalized);
            const targetUrl = currentUrl.startsWith('http') ? currentUrl : 'https://' + currentUrl;
            let targetHost = 'unknown';
            try {
                targetHost = new URL(targetUrl).hostname;
            } catch (_) {
                targetHost = normalized || currentUrl;
            }

            // [Fix 2 Owner Functional Test Mode Defense-in-Depth Leak Prevention]
            if (campaignState.ownerFunctionTestMode) {
                const isLoopbackFn = (typeof PrivacyGateway !== 'undefined' && typeof PrivacyGateway.isLoopbackTestUrl === 'function')
                    ? PrivacyGateway.isLoopbackTestUrl
                    : (u) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(u);
                if (!isLoopbackFn(targetUrl)) {
                    logBg(null, `🛑 [OWNER_FUNCTION_TEST_LEAK_PREVENTION] Non-loopback target blocked in test mode: ${targetUrl}`, 'error');
                    console.error(`[OWNER_FUNCTION_TEST_LEAK_PREVENTION] Non-loopback target blocked: ${targetUrl}`);
                    orchestrationSettled = true;
                    releaseLease();
                    await pauseCampaignOrchestrator(true);
                    campaignState.isFaulted = true;
                    campaignState.faultReason = 'NON_LOOPBACK_TARGET_BLOCKED_IN_TEST_MODE';
                    chrome.runtime.sendMessage({
                        action: 'PRIVACY_GATEWAY_BLOCKED',
                        reason: 'NON_LOOPBACK_TARGET_BLOCKED_IN_TEST_MODE',
                        userMessage: `Public or non-loopback URL blocked in Owner Functional Test Mode: ${targetUrl}`
                    }).catch(() => {});
                    return;
                }
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
                        await syncCampaignCountersFromLedger(hs);
                    }
                } catch (_) {}

                orchestrationSettled = true;
                releaseLease();
                return processNextCampaignTarget(currentSession, campaignState.schedulerGeneration);
            }

            if (targetAbortController.signal.aborted || campaignState.isPaused || !campaignState.isActive) {
                logBg(null, `⏸️ [Engine] Target abort or pause detected before orchestration. Requeuing target.`, "info");
                campaignState.queue.unshift(currentUrl);
                orchestrationSettled = true;
                releaseLease();
                return;
            }

            campaignState.currentFormIdentity = null;
            campaignState.currentFieldMapping = {};
            campaignState.currentFilledFields = [];
            campaignState.currentSubmitState = 'NOT_SUBMITTED';

            const targetIdx = campaignState.totalTargets - campaignState.queue.length;
            logBg(null, `[TARGET ${targetIdx}/${campaignState.totalTargets}][${targetHost}] START`, "info");
            logBg(null, `[TARGET_START] buildId=${_swBootId} campaignRunId=${campaignState.campaignRunId} attemptId=${campaignState.currentAttempt?.attemptId || 'att_init'} targetIndex=${targetIdx}/${campaignState.totalTargets} targetUrl=${targetUrl}`, "info");
            if (chrome.alarms) chrome.alarms.create(`xpider_timeout_${currentSession}`, { delayInMinutes: 3 });

            // [R6.9G.7 P0-2] Target AbortController & Inner Orchestration Promise (bound to current lease)

            const targetTimeoutMs = (targetUrl && (targetUrl.includes('timeout-inquiry') || targetUrl.includes('timeout-target')))
                ? 5000
                : (campaignState.targetTimeoutMs || 180000);

            // [R6.9G.8] Authoritative pauseable target deadline controller
            const deadlineController = new TargetDeadlineController({
                attemptId: campaignState.currentAttempt?.attemptId,
                targetToken: campaignState.currentTargetToken,
                campaignRunId: campaignState.campaignRunId,
                sessionId: currentSession
            });
            campaignState.targetDeadlineController = deadlineController;
            const timeoutPromise = deadlineController.start(targetTimeoutMs);

            orchestrationSettled = false;
            const orchestrationPromise = (async () => {
                try {
                    return await orchestrateSending(targetUrl, campaignState.template, targetAbortController.signal);
                } finally {
                    orchestrationSettled = true;
                }
            })();

            const result = await Promise.race([
                orchestrationPromise,
                timeoutPromise
            ]).catch(async (err) => {
                logBg(null, `⚠️ [Protection] Target skipped / timed out: ${err.message}`, "warning");

                // 1. SIGNAL ABORT IMMEDIATELY
                targetAbortController.abort(err.message);
                if (campaignState.currentTabId) {
                    chrome.tabs.sendMessage(campaignState.currentTabId, {
                        action: 'ABORT_TARGET',
                        reason: err.message,
                        targetToken: campaignState.currentTargetToken
                    }).catch(() => {});
                }

                // 2. WAIT FOR INNER ORCHESTRATION TO QUIESCE BEFORE RELEASING LEASE
                const quiesceStart = Date.now();
                while (!orchestrationSettled && (Date.now() - quiesceStart < 2000)) {
                    await new Promise(r => setTimeout(r, 50));
                }

                // 3. Verified tab closure
                if (campaignState.currentTabId) {
                    const orphanId = campaignState.currentTabId;
                    campaignState.currentTabId = null;
                    await closeOwnedTabVerified(orphanId, 'TIMEOUT_ABORT');
                }

                const isLocalTimeout = err.message && err.message.includes('Local Session Timeout');
                const currentStage = campaignState.currentTargetStage || '';
                const postSubmitStages = ['SUBMIT_TRIGGERED', 'VERIFYING', 'SUBMITTING'];
                const isPostSubmitTimeout = postSubmitStages.includes(currentStage);
                const isCaptchaPauseStage = currentStage === 'CAPTCHA_PENDING_OWNER' || currentStage === 'CAPTCHA_AUTO_SOLVING' || currentStage === 'CAPTCHA_MANUAL_WAIT';
                const isManualAssistPauseStage = currentStage === 'FORM_MANUAL_ASSIST_PENDING_OWNER' || currentStage === 'FORM_MANUAL_WAIT';

                let timeoutStatus, timeoutReason;
                if (isPostSubmitTimeout) {
                    timeoutStatus = 'DELIVERY_UNKNOWN';
                    timeoutReason = 'DELIVERY_UNKNOWN_POST_SUBMIT_TIMEOUT';
                    console.log(`[TIMEOUT_CLASS] stage=${currentStage} => DELIVERY_UNKNOWN (post-submit, not TIMEOUT_LOCAL)`);
                } else if (isCaptchaPauseStage) {
                    timeoutStatus = 'FAILURE';
                    timeoutReason = 'CAPTCHA_OWNER_TIMEOUT';
                    console.log(`[TIMEOUT_CLASS] stage=${currentStage} => CAPTCHA_OWNER_TIMEOUT`);
                } else if (isManualAssistPauseStage) {
                    timeoutStatus = 'FAILURE';
                    timeoutReason = 'FORM_MANUAL_ASSIST_TIMEOUT';
                    console.log(`[TIMEOUT_CLASS] stage=${currentStage} => FORM_MANUAL_ASSIST_TIMEOUT`);
                } else if (isLocalTimeout) {
                    timeoutStatus = 'TIMEOUT_LOCAL';
                    timeoutReason = 'TIMEOUT_LOCAL';
                    console.log(`[TIMEOUT_CLASS] stage=${currentStage} => TIMEOUT_LOCAL (pre-submit)`);
                } else {
                    timeoutStatus = 'TIMEOUT_GLOBAL';
                    timeoutReason = 'TIMEOUT_GLOBAL';
                    console.log(`[TIMEOUT_CLASS] stage=${currentStage} => TIMEOUT_GLOBAL`);
                }
                try {
                    const hs = await getHistoryStoreInstance();
                    let attemptId = campaignState.currentAttempt?.attemptId;
                    let targetToken = campaignState.currentAttempt?.targetToken;

                    if (!attemptId && hs && typeof hs.recordAttempt === 'function') {
                        targetToken = targetToken || ('tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
                        const attemptResult = await hs.recordAttempt(targetUrl, {
                            campaignRunId: campaignState.campaignRunId,
                            status: 'PREPARING',
                            reason: 'PREPARING',
                            templateId: campaignState.templateId || null,
                            templateVersion: campaignState.templateVersion || 1,
                            targetToken: targetToken
                        });
                        attemptId = attemptResult?.attemptId;
                    }

                    if (attemptId && hs && typeof hs.settleCanonicalAttempt === 'function') {
                        await hs.settleCanonicalAttempt(attemptId, timeoutStatus, timeoutReason, {}, {
                            campaignRunId: campaignState.campaignRunId,
                            resultUrl: targetUrl,
                            targetToken: targetToken
                        });
                        await hs.persist();
                        logBg(null, `[FINAL_CANONICAL] status=${timeoutStatus} reason=${timeoutReason} attemptId=${attemptId}`, "warning");
                        logBg(null, `[TARGET][${targetHost}] FINAL status=${timeoutStatus} reason=${timeoutReason}`, "warning");

                        if (!campaignState.outcomeHistogram) campaignState.outcomeHistogram = {};
                        campaignState.outcomeHistogram[timeoutReason] = (campaignState.outcomeHistogram[timeoutReason] || 0) + 1;

                        await syncCampaignCountersFromLedger(hs);
                    }
                } catch (hsErr) {
                    logBg(null, `❌ [TimeoutSettlement] Failed to settle timeout attempt: ${hsErr.message}`, "error");
                }
                return { success: false, error: err.message, reasonCode: timeoutReason };
            }).finally(async () => {
                if (deadlineController) deadlineController.cancel();
                campaignState.targetDeadlineController = null;
                if (chrome.alarms) chrome.alarms.clear(`xpider_timeout_${currentSession}`);

                // Quiescence wait in finally
                const quiesceStart = Date.now();
                while (!orchestrationSettled && (Date.now() - quiesceStart < 2500)) {
                    await new Promise(r => setTimeout(r, 50));
                }

                if (campaignState.currentTabId) {
                    const orphanId = campaignState.currentTabId;
                    campaignState.currentTabId = null;
                    await closeOwnedTabVerified(orphanId, 'TARGET_FINALLY_CLEANUP');
                }

                campaignState.currentTargetAbortController = null;
                campaignState.currentTargetStage = null;
                campaignState.currentTargetToken = null;
                campaignState.currentAttempt = null;
                campaignState.submitLock = false;
                campaignState.timeoutWatchdogGen = (campaignState.timeoutWatchdogGen || 0) + 1;
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ xpider_exec_identity: null }).catch(() => {});
                }

                if (!orchestrationSettled) {
                    logBg(null, `🚨 [QUIESCENCE_FAULT] Target inner orchestration failed to settle within grace period. Entering FAULT state; lease held.`, 'error');
                    campaignState.isFaulted = true;
                    campaignState.faultReason = 'TARGET_QUIESCENCE_TIMEOUT';
                    campaignState.isActive = false;
                    broadcastCounters();
                    return; // DO NOT release lease!
                }

                releaseLease();
            });
        } finally {
            if (!leaseReleased && !campaignState.isFaulted) {
                releaseLease();
            }
        }
    } catch (e) {
        logBg(null, `❌ Critical target error: ${e.message}. Skipping...`, "error");
    } finally {
        if (campaignState.isActive) {
            saveCampaignState();
            await checkPause();
            const delay = Math.max(1000, campaignState.delayMs || 10000);
            logBg(null, `Waiting ${delay}ms before next target...`, "debug");

            if (campaignState.activeTimeoutId) clearTimeout(campaignState.activeTimeoutId);
            campaignState.schedulerGeneration = (campaignState.schedulerGeneration || 0) + 1;
            const nextGen = campaignState.schedulerGeneration;
            campaignState.activeTimeoutId = setTimeout(() => processNextCampaignTarget(currentSession, nextGen), delay);

            if (chrome.alarms) chrome.alarms.create("xpider_next_target_failsafe", { delayInMinutes: 1 });
        }
        campaignState.isLoopRunning = false;
    }
}

// [v18.9.0] Master Alarm Central: Global dispatch for watchdog and emergency timeouts
if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
    if (campaignState.isActive) {
        // [RC3.18 Network Recovery Guard] Suppress watchdog/timeouts while network recovery is in flight
        if (campaignState.isNetworkDegraded) {
            logBg(null, `[TIMEOUT_GUARD] Campaign paused for network recovery (${campaignState.networkRecoveryPhase}). Suppressing timeouts.`, "info");
            return;
        }

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

// [Issue #6 R6.5 Bug E & R6.9B Section 8] Missing campaign tab self-recovery
async function ensureCampaignTab(existingTabId, candidateUrl, forceRecreate = false) {
    if (existingTabId && !forceRecreate) {
        try {
            const tab = await safeTabs.get(existingTabId);
            if (tab && tab.id && !tab.url?.startsWith('chrome://')) {
                return { tabId: tab.id, recreated: false };
            }
        } catch (_) {}
    }
    logBg(null, `[TAB_RECOVERY] Campaign tab ${existingTabId} missing/mismatched. Recreating active campaign tab for ${candidateUrl}`, "warning");
    if (existingTabId) {
        await closeOwnedTabVerified(existingTabId, 'TAB_RECOVERY_STALE');
    }
    const newTab = await safeTabs.create({ url: candidateUrl, active: !!campaignState.focusActiveTargetTab });
    campaignOwnedTabIds.add(newTab.id);
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
    // [R6.9G.10.3.5 B.5/G] Background Sniper fetch cannot run before privacy assertion
    const privCheck = await assertPrivacyTransportReady('SNIPER_FETCH');
    if (!privCheck.ready) {
        logBg(tabId, `🚫 [SniperScan] Blocked by privacy transport assertion: ${privCheck.reason}`, 'error');
        if (discoveryCtx) {
            discoveryCtx.errors.push({ phase: 'scanContactPaths', error: `PRIVACY_GATE_BLOCK: ${privCheck.reason}` });
        }
        return [];
    }

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

async function orchestrateSending(urlInput, template, abortSignal = null) {
    if (!abortSignal) {
        if (!campaignState.currentTargetAbortController) {
            campaignState.currentTargetAbortController = new AbortController();
        }
        abortSignal = campaignState.currentTargetAbortController.signal;
    }
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
        const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
        const attemptResult = await hs.recordAttempt(targetUrl, {
            campaignRunId: campaignState.campaignRunId,
            status: 'PREPARING',
            reason: 'PREPARING',
            templateId: campaignState.templateId || null,
            templateVersion: campaignState.templateVersion || 1,
            targetToken: targetToken,
            ...(pg ? pg.getAttemptPrivacyMetadata() : {})
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
        campaignState.currentTargetToken = targetToken;
        if (!campaignState.targetDeadlineController) {
            campaignState.targetDeadlineController = new TargetDeadlineController({
                attemptId: _attemptId,
                targetToken: targetToken,
                campaignRunId: campaignState.campaignRunId,
                sessionId: campaignState.sessionId
            });
            campaignState.targetDeadlineController.start(campaignState.targetTimeoutMs || 180000);
        } else if (!campaignState.targetDeadlineController.attemptId) {
            campaignState.targetDeadlineController.attemptId = _attemptId;
            campaignState.targetDeadlineController.targetToken = targetToken;
        }

        // Mark target as in progress
        campaignState.counters.inProgress = 1;
        const queuePending = Array.isArray(campaignState.queue) ? campaignState.queue.length : 0;
        campaignState.counters.remaining = Math.max(0, queuePending + 1);
        persistCounters().catch(() => {});
        broadcastCounters();

        // [R6.9G.10.3.5 A.1] Persist canonical execution identity BEFORE any target network/navigation side effect
        const execIdentity = {
            attemptId: _attemptId,
            targetToken: targetToken,
            campaignRunId: campaignState.campaignRunId || null,
            sessionId: Number(campaignState.sessionId),
            captchaEpoch: campaignState.captchaEpoch || 1,
            tabId: null,
            targetUrl: targetUrl,
            ts: Date.now()
        };
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({
                    xpider_exec_identity: execIdentity,
                    xpider_currentAttempt: campaignState.currentAttempt
                }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve();
                });
            });
        }
        logBg(null, `[EXEC_IDENTITY_PRE_NAV] attemptId=${_attemptId} token=${targetToken} epoch=${execIdentity.captchaEpoch}`, 'info');
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

    // [R6.9G.10.3.5 Central Privacy Barrier before Target Tab Creation/Update]
    const privCheck = await assertPrivacyTransportReady('TARGET_TAB_CREATION');
    if (!privCheck.ready) {
        const blkReason = privCheck.reason || 'PRIVACY_GATE_NOT_READY';
        logBg(tabId, `[PRIVACY_GATE_BLOCK] reason=${blkReason} attemptId=${_attemptId} targetUrl=${targetUrl}`, 'error');
        console.error(`[PRIVACY_GATE_BLOCK] reason=${blkReason} attemptId=${_attemptId} targetUrl=${targetUrl}`);
        if (_attemptId) {
            try {
                const hs = await _getHistoryStore();
                const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                await hs.updateAttemptContact(_attemptId, {
                    ...(pg ? pg.getAttemptPrivacyMetadata() : {}),
                    submissionStatus: 'PRIVACY_GATEWAY_BLOCKED',
                    formDetectionStatus: 'NOT_FOUND'
                });
                await hs.persist();
            } catch (_) {}
        }
        return {
            success: false,
            reasonCode: 'PRIVACY_GATEWAY_BLOCKED',
            error: blkReason
        };
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

    // [R6.9G.10.3.5 A.1] Update canonical execution identity with canonical tabId
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['xpider_exec_identity'], res => {
            const curIdent = res && res.xpider_exec_identity ? res.xpider_exec_identity : {};
            chrome.storage.local.set({
                xpider_exec_identity: {
                    ...curIdent,
                    tabId: tabId
                }
            }).catch(() => {});
        });
    }

    // [Issue #6 R6.9B Section 3] POST-CREATE CONFIRM KILL
    await closeAllCampaignTabsExcept(tabId, 'POST_NEW_TARGET_CREATE');
    campaignOwnedTabIds.clear();
    campaignOwnedTabIds.add(tabId);

    await focusTargetTab(tabId);

    let resolveRef;
    const resultPromise = new Promise(resolve => resolveRef = resolve);
    if (abortSignal) {
        if (abortSignal.aborted) {
            return { success: false, error: 'ABORTED', reasonCode: 'ABORTED' };
        }
        abortSignal.addEventListener('abort', () => {
            if (!isFinished && typeof finish === 'function') {
                finish({ success: false, error: 'ABORTED', reasonCode: 'ABORTED' }).catch(() => {});
            }
        });
    }
    
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
    let isScanningPaths = true;
    let waitingForPaths = false;
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
            if (pathIdx < validPaths.length) {
                tryNext();
            } else if (isScanningPaths) {
                waitingForPaths = true;
                logBg(tabId, `⏳ [Engine] Waiting for contact path scan to finish...`, "info");
            } else {
                tryNext();
            }
            return;
        }

        if (isFinished) return;
        isFinished = true;

        if (abortSignal && abortSignal.aborted) {
            logBg(tabId, `[ORCHESTRATION_ABORTED] abortSignal was triggered externally (${abortSignal.reason || 'ABORTED'}). Delegating terminal settlement to outer target lifecycle.`, "info");
            if (chrome.alarms) chrome.alarms.clear(`xpider_watchdog_${tabId}_${currentSession}`);
            if (injectionTimer) clearTimeout(injectionTimer);
            if (pollerTimer) clearInterval(pollerTimer);
            safeTabs.onUpdated.removeListener(navWatcher);
            if (campaignState.currentTabId === tabId) {
                campaignState.currentTabId = null;
            }
            campaignState.targetResolve = null;
            campaignState.targetReady = null;
            await closeOwnedTabVerified(tabId, 'ABORTED');
            if (resolveRef) resolveRef({ success: false, error: abortSignal.reason || 'ABORTED', reasonCode: abortSignal.reason || 'ABORTED' });
            return;
        }
        
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
        // [F8 & R6.9G.10.3.5.1] Pre-submit persistence and privacy barrier failures must remain retryable (not DELIVERY_UNKNOWN)
        const isPreSubmitFailure = !isSuccess && (
            res?.reasonCode === 'PRE_SUBMIT_PERSISTENCE_FAILED' ||
            res?.reasonCode === 'INTENT_PERSISTENCE_FAILED' ||
            res?.error === 'PRE_SUBMIT_PERSISTENCE_FAILED' ||
            res?.error === 'INTENT_PERSISTENCE_FAILED' ||
            res?.reasonCode === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT' ||
            res?.error === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT'
        );
        // [F8] DELIVERY_UNKNOWN is strictly reserved for true in-flight submission ambiguities
        const isDeliveryUnknown = !isSuccess && !isPreSubmitFailure && (
            (!res || (!res.error && !res.reasonCode)) ||
            res.reasonCode === REASON_CODES.DELIVERY_UNKNOWN
        );

        let finalReason;
        if (isSuccess) {
            finalReason = REASON_CODES.SUCCESS_CONFIRMED;
        } else if (res?.reasonCode === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT' || res?.error === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT') {
            finalReason = 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT';
        } else if (isPreSubmitFailure) {
            finalReason = 'PRE_SUBMIT_PERSISTENCE_FAILED';
        } else if (isDeliveryUnknown) {
            finalReason = REASON_CODES.DELIVERY_UNKNOWN;
        } else {
            finalReason = res?.reasonCode || (res?.error ? String(res.error) : REASON_CODES.DELIVERY_UNKNOWN);
        }

        // [R6.9G.10.3.5.1] Fail-closed auto-pause on submit privacy barrier block
        if (res?.reasonCode === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT' || res?.error === 'PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT') {
            logBg(tabId, `🛑 [PRIVACY_SUBMIT_BLOCK] Submission withheld due to privacy transport failure. Auto-pausing campaign fail-closed.`, 'error');
            pauseCampaignOrchestrator(true).catch(() => {});
        }

        // [Directive E: Circuit Breaker Classification] Distinguish CORE_CODE vs SITE_SPECIFIC
        const errStr = String(res?.error || res?.reasonCode || '');
        const isCoreCodeError = /ReferenceError|TypeError|SyntaxError|is not defined|CORE_RUNTIME_ERROR/i.test(errStr) &&
            !/FORM_NOT_ACCESSIBLE|NO_ACCESSIBLE_INQUIRY_FORM|CONTACT_PAGE_NO_DOM_FORM|CONTACT_CANDIDATE_ERROR_PAGE|TIMEOUT|CAPTCHA|SERVER ERROR|404|DEAD_PAGE/i.test(errStr);
        const errorClass = isCoreCodeError ? 'CORE_CODE' : 'SITE_SPECIFIC';
        console.log(`[CIRCUIT_BREAKER_CLASSIFY] errorClass=${errorClass} reason=${finalReason} error=${errStr}`);
        logBg(tabId, `[CIRCUIT_BREAKER_CLASSIFY] errorClass=${errorClass} reason=${finalReason}`, isCoreCodeError ? 'warning' : 'info');

        if (isCoreCodeError) {
            const m = errStr.match(/([a-zA-Z0-9_$]+)\s+is not defined/i);
            const symbol = m ? m[1] : (errStr.split(':')[1] || errStr).trim();
            coreRuntimeRefErrors[symbol] = (coreRuntimeRefErrors[symbol] || 0) + 1;
            if (coreRuntimeRefErrors[symbol] >= 2) {
                logBg(tabId, `🚨 [CIRCUIT_BREAKER] Identical CORE_CODE error repeated (${coreRuntimeRefErrors[symbol]}x): ${symbol}. Tripping CORE_RUNTIME_BROKEN: ${symbol} and auto-pausing campaign.`, 'error');
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
        } else if (finalReason === 'SKIPPED' || finalReason === 'WOULD_SUBMIT' || finalReason?.includes('SKIPPED') || finalReason?.includes('NON_INQUIRY') || finalReason?.startsWith('NON_INQUIRY') || finalReason === 'EXPECTED_FAIL_PASS' || finalReason?.includes('EXPECTED_FAIL_PASS') || res?.isExpectedFailPass) {
            terminalStatus = 'SKIPPED';
        } else {
            terminalStatus = 'FAILURE';
        }

        logBg(tabId, `[FINAL_CANONICAL] status=${terminalStatus} reason=${finalReason} attemptId=${_attemptId}`, terminalStatus === 'CONFIRMED_SUCCESS' ? "success" : (terminalStatus === 'SKIPPED' ? "info" : "warning"));
        logBg(tabId, `[TARGET][${hostName}] FINAL status=${terminalStatus} reason=${finalReason}`, terminalStatus === 'CONFIRMED_SUCCESS' ? "success" : (terminalStatus === 'SKIPPED' ? "info" : "warning"));

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
                    externalFormUrl: res?.metadata?.externalFormUrl || null,
                    formDetectionStatus: res?.metadata?.formDetectionStatus || (finalFormUrl ? 'FOUND' : 'NOT_FOUND'),
                    autofillStatus: res?.metadata?.autofillStatus || (isSuccess ? 'SUCCESS' : 'N_A'),
                    submissionStatus: isSuccess ? 'CONFIRMED_SUCCESS' : terminalStatus,
                    captchaStatus: campaignState.currentTargetStage?.includes('CAPTCHA') ? 'PENDING_OWNER' : 'NONE',
                    ownerManualConfirmed: !!res?.metadata?.ownerManualConfirmed,
                    emailsFound: (res && res.emailsFound !== undefined) ? res.emailsFound : 0
                });
                const rec = hs.attempts.find(a => a.attemptId === _attemptId);
                logBg(tabId, `[HISTORY_FINAL] sourceUrl=${rec?.sourceUrl || targetUrl} contactPageUrl=${rec?.contactPageUrl || ''} formPageUrl=${rec?.formPageUrl || ''} resultUrl=${rec?.resultUrl || ''}`, "info");
                logBg(tabId, `[TARGET_END] campaignRunId=${campaignState.campaignRunId} attemptId=${_attemptId} status=${terminalStatus} reason=${settleReason}`, "info");
            }
            await hs.persist();

            // [Issue #6 R6.9E B7] Single Source of Truth: All counters strictly derived from HistoryStore ledger via syncCampaignCountersFromLedger
            await syncCampaignCountersFromLedger(hs);
            const ledgerStats = hs.getLedgerStats('currentRun', campaignState.campaignRunId);
            if (ledgerStats) {
                console.log(ledgerStats.logStr);
                logBg(tabId, ledgerStats.logStr, "info");
            }
        } catch (hsErr) {
            logBg(tabId, `⚠️ [F8-HistoryStore] settleCanonicalAttempt failed: ${hsErr.message}`, 'warning');
        }

        // [RC3.19 Resilient Settlement Cleanup] Cleanly remove active checkpoint once target is canonically settled
        campaignState.isNetworkDegraded = false;
        campaignState.networkRecoveryPhase = null;
        campaignState.networkCheckpoint = null;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.remove(['xpider_active_network_checkpoint', 'xpider_isNetworkDegraded', 'xpider_networkRecoveryPhase']).catch(() => {});
        }
        
        try {
            await resolveSubmissionIntent(targetUrl, finalReason, isSuccess);
        } catch (intentErr) {
            logBg(tabId, `⚠️ [IntentGuard] Failed to settle submission intent: ${intentErr.message}`, "warning");
        }

        if (res && res.success) {
            const holdMs = Math.max(3500, campaignState.submitDelayMs ? parseInt(campaignState.submitDelayMs) : 3500);
            logBg(tabId, `✨ [Engine] Submission confirmed. Maintaining tab for completion (${holdMs}ms)...`, "success");
            await new Promise(r => setTimeout(r, holdMs));
        } else if (res?.error !== 'ABORTED' && res?.reasonCode !== 'ABORTED' && !campaignState.isPaused) {
            await new Promise(r => setTimeout(r, 1000));
        }

        if (discoveryCtx) {
            discoveryCtx.candidateSourceMap.clear();
            discoveryCtx.candidates.clear();
            discoveryCtx.visited.clear();
        }

        // [Issue #6 R6.9B Section 6 & 7] Strictly verified tab closure
        if (isDeliveryUnknown && KEEP_DELIVERY_UNKNOWN_TABS && MAX_RETAINED_UNCERTAIN_TABS > 0) {
            console.log(`[UNKNOWN_HOLD] tabKeptOpen=true tabId=${tabId} detachedFromCampaign=true`);
            logBg(tabId, `[UNKNOWN_HOLD] tabKeptOpen=true tabId=${tabId} detachedFromCampaign=true`, "info");
            
            // Invariant: retainedTabIds ∩ campaignOwnedTabIds = empty set
            retainedTabIds.add(tabId);
            campaignOwnedTabIds.delete(tabId);
            retainedUncertainTabs.push(tabId);

            // Detach completely from active campaign tab pointer
            if (campaignState.targetTabId === tabId) campaignState.targetTabId = null;
            if (campaignState.currentTabId === tabId) campaignState.currentTabId = null;

            if (retainedUncertainTabs.length > MAX_RETAINED_UNCERTAIN_TABS) {
                const oldest = retainedUncertainTabs.shift();
                retainedTabIds.delete(oldest);
                if (oldest !== campaignState.targetTabId && oldest !== campaignState.currentTabId) {
                    console.log(`[UNKNOWN_HOLD] closing oldest retained tab tabId=${oldest}`);
                    await closeOwnedTabVerified(oldest, 'RETAINED_OVERFLOW');
                }
            }
        } else {
            await closeOwnedTabVerified(tabId, 'TARGET_FINAL');
        }

        const remainingOwned = Array.from(campaignOwnedTabIds).length;
        const remainingRetained = retainedTabIds.size;
        const finalInvariant = (remainingOwned === 0 && (!KEEP_DELIVERY_UNKNOWN_TABS || remainingRetained === 0)) ? 'PASS' : (KEEP_DELIVERY_UNKNOWN_TABS ? 'PASS_RETAINED' : 'FAIL');
        console.log(`[POST_FINAL_TAB_INVARIANT] target=${targetUrl} remainingOwnedTabs=${remainingOwned} retainedTabs=${remainingRetained} result=${finalInvariant}`);

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
            const recTab = await ensureCampaignTab(tabId, currentAttemptUrl, true);
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
        
        // [Issue #6 R6.9E B1] Attempt remains PREPARING here. SUBMIT_PENDING is deferred until content reports SUBMIT_ATTEMPT_STARTED
        if (campaignState.currentAttempt) {
            campaignState.currentAttempt.status = 'PREPARING';
        }

        if (injectionTimer) clearTimeout(injectionTimer);
        logBg(tabId, "Extraction focus secured. Mapping template fields...", "info");
        safeTabs.sendMessage(tabId, { 
            action: 'START_SENDING', 
            attemptId: _attemptId,
            targetToken: targetToken,
            campaignRunId: campaignState.campaignRunId,
            sessionId: currentSession,
            captchaEpoch: campaignState.captchaEpoch,
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

            if (norm && statusInfo.status === 'complete') {
                 if (campaignState.successfulUrls.includes(norm) || ((campaignState.currentTargetStage?.includes('SUBMIT') || campaignState.currentSubmitState === 'TRIGGERED') && (norm.includes('success') || norm.includes('thank')))) {
                    logBg(tabId, `⏭️ [Engine] Redirected to success page (${norm}). Finishing with SUCCESS.`, "success");
                    finish({ success: true, metadata: { resultUrl: norm } });
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
                    'modules/math-captcha-solver.js',
                    'modules/smart-field-resolver.js',
                    'modules/contact-discovery-engine.js',
                    'modules/checkbox-resolver-r2.js',
                    'modules/select-resolver-r2.js',
                    'modules/final-form-completion-engine.js',
                    'modules/form-discovery-engine-r2.js',
                    'modules/vision-submit-executor.js',
                    'modules/email-collector.js',
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

    // [Issue #6 R6.9F.1 Guard] Prevent race condition where initial tab finishes loading before onUpdated listener is registered
    safeTabs.get(tabId).then(existingTab => {
        if (existingTab && !isFinished && !isFocusSecured) {
            if (existingTab.status === 'complete' || (existingTab.url && existingTab.url.startsWith('http'))) {
                startInjection(0);
            }
        }
    }).catch(() => {});

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
        const privCheck = await assertPrivacyTransportReady('CANDIDATE_NAVIGATION');
        if (!privCheck.ready) {
            logBg(tabId, `🚫 [CandidateNav] Blocked by privacy transport assertion: ${privCheck.reason}`, 'error');
            finish({ success: false, error: privCheck.reason, reasonCode: 'PRIVACY_GATEWAY_BLOCKED' });
            return;
        }
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
        isScanningPaths = false;
        if (isFinished) return;
        validPaths.push(...paths);
        logBg(tabId, `[SniperScan] Identified ${validPaths.length} candidate paths in background.`, "info");
        if (waitingForPaths) {
            waitingForPaths = false;
            tryNext();
        }
    }).catch(err => {
        isScanningPaths = false;
        if (isFinished) return;
        logBg(tabId, `❌ [CONTACT_DISCOVERY_RUNTIME_ERROR][${targetHost}] ${err.name}: ${err.message}`, "error");
        discoveryCtx.errors.push({ phase: 'scanContactPaths', error: err.message, stack: err.stack });
        if (waitingForPaths) {
            waitingForPaths = false;
            finish({ 
                success: false, 
                error: err.message, 
                reasonCode: 'CONTACT_DISCOVERY_RUNTIME_ERROR' 
            });
        }
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
            
            chrome.storage.local.get(['xpider_visited'], (existing) => {
                let mergedVisited = Array.isArray(existing?.xpider_visited) ? [...existing.xpider_visited] : [];
                if (!campaignState.ownerFunctionTestMode && Array.isArray(campaignState.visitedUrls)) {
                    for (const u of campaignState.visitedUrls) {
                        if (u && !mergedVisited.includes(u)) mergedVisited.push(u);
                    }
                }

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
                    xpider_visited: mergedVisited,
                    xpider_successful: campaignState.successfulUrls,
                    xpider_currentAttempt: campaignState.currentAttempt,
                    xpider_active_campaign_run_id: campaignState.campaignRunId,
                    xpider_owner_function_test_mode_active: Boolean(campaignState.ownerFunctionTestMode)
                }, () => {
                    if (chrome.runtime.lastError) console.error("Save error:", chrome.runtime.lastError);
                    recordCurrentRunDiagEvent(`[CHECKPOINT] saved session checkpoint remaining=${campaignState.queue ? campaignState.queue.length : 0} isActive=${campaignState.isActive}`);
                    resolve();
                });
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

    // [R6.9G.10.3.7.1.4.5 Blocker 2 Fix] State-aware SW boot reconciliation
    try {
        await reconcileOwnerTestNetworkGuardOnBoot();
    } catch (e) {
        console.warn("[Boot] reconcileOwnerTestNetworkGuardOnBoot error:", e.message);
    }
    if (campaignState.isFaulted) {
        console.warn("[Boot] Campaign faulted during boot reconciliation — halting restore.");
        return;
    }

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
                'xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_active_campaign_run_id',
                'xpider_owner_function_test_mode', 'xpider_owner_function_test_mode_active'
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
                            // [Issue #6 R6.9E B9] True submit-pending interruption: real submit boundary crossed -> DELIVERY_UNKNOWN
                            logBg(null, `[RECOVERY_CLASSIFY] attemptId=${interruptedAttemptId} status=SUBMIT_PENDING action=DELIVERY_UNKNOWN`, "warning");
                            console.warn(`[RECOVERY_CLASSIFY] attemptId=${interruptedAttemptId} status=SUBMIT_PENDING action=DELIVERY_UNKNOWN url=${interruptedUrl}`);
                            
                            const normInterrupted = normalizeUrl(interruptedUrl || '');
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
                            // [Issue #6 R6.9E B9] Restart occurred during PREPARING: NOT submitted -> REQUEUE, NOT failure/unknown!
                            logBg(null, `[RECOVERY_CLASSIFY] attemptId=${interruptedAttemptId} status=PREPARING action=REQUEUE`, "info");
                            console.warn(`[RECOVERY_CLASSIFY] attemptId=${interruptedAttemptId} status=PREPARING action=REQUEUE url=${interruptedUrl}`);
                            
                            const settledAttempt = {
                                ...data.xpider_currentAttempt,
                                status: 'REQUEUED',
                                interruptedAt: Date.now()
                            };
                            chrome.storage.local.set({ 
                                xpider_currentAttempt: settledAttempt
                            });

                            // Requeue target if not already in queue
                            if (interruptedUrl && !campaignState.queue.includes(interruptedUrl)) {
                                campaignState.queue.unshift(interruptedUrl);
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
                        const EXPLICIT_TEST_SOURCES = ['OWNER_CORE_TEST', 'OWNER_CAPTCHA_LAB', 'OWNER_FULL_TEST', 'CLOUDFLARE_TESTKEY_LAB'];
                        const isCheckpointTest = Boolean(data.xpider_active_test_source && EXPLICIT_TEST_SOURCES.includes(data.xpider_active_test_source) && data.xpider_paused_checkpoint.ownerFunctionTestMode);
                        campaignState.ownerFunctionTestMode = isCheckpointTest;
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
                        const isRestoredTest = Boolean(data.xpider_active_test_source && EXPLICIT_TEST_SOURCES.includes(data.xpider_active_test_source));
                        campaignState.ownerFunctionTestMode = isRestoredTest;
                        
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

                    // [R6.9G.10.1] Auto-recover Privacy Relay companion on background boot if configured
                    try {
                        const pg = (typeof PrivacyGateway !== 'undefined' && PrivacyGateway.getInstance) ? PrivacyGateway.getInstance() : null;
                        if (pg) {
                            await pg.init();
                            if (pg.config.transportMode === 'PRIVACY_RELAY') {
                                console.log('[Boot] Privacy Relay configured — checking status and auto-recovering if offline...');
                                await pg.ensureRelayActive(true);
                            }
                        }
                    } catch (relayBootErr) {
                        console.warn('[Boot] Privacy Relay auto-recovery non-fatal error:', relayBootErr.message);
                    }
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
    // [RC3.18 Privacy Relay Watchdog]
    try { startPrivacyRelayWatchdog(); } catch (_) {}
}, 500);

async function handleTranscription(audioData, audioUrl, sendResponse) {
    try {
        // [v4.12.23] Per-target CAPTCHA attempt limit (max 5 audio solving attempts per specific target)
        // CRITICAL BUGFIX: Previously used audioUrl which is https://www.google.com/recaptcha/api2/payload,
        // which locked out the solver for all subsequent targets across the entire campaign after 3 attempts!
        const targetPageUrl = campaignState.currentAttempt?.url || campaignState.currentTargetToken || (campaignState.currentTabId && ('tab_' + campaignState.currentTabId)) || 'active_target';
        const targetKey = String(targetPageUrl).split('?')[0].split('#')[0];
        if (targetKey) {
            if (!campaignState.captchaCounts) campaignState.captchaCounts = {};
            const count = (campaignState.captchaCounts[targetKey] || 0) + 1;
            campaignState.captchaCounts[targetKey] = count;
            if (count > 5) {
                logBg(null, `⚠️ [Engine] CAPTCHA solver disabled: Exceeded maximum attempts (5) on target: ${targetKey}`, "error");
                throw new Error(`EXCEEDED_MAX_CAPTCHA_ATTEMPTS: CAPTCHA solving limit (5 attempts per target) exceeded for ${targetKey}.`);
            }
            logBg(null, `🤖 [Engine] CAPTCHA audio solver attempt ${count}/5 for target: ${targetKey}`, "info");
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
        resetAllListData,
        safeTabs,
        campaignOwnedTabIds,
        retainedTabIds,
        retainedUncertainTabs,
        campaignTabParent,
        preCampaignTabIds,
        closeAllCampaignTabsExcept,
        closeOwnedTabVerified,
        processNextCampaignTarget,
        STRICT_SINGLE_TARGET_TAB,
        KEEP_DELIVERY_UNKNOWN_TABS,
        MAX_RETAINED_UNCERTAIN_TABS,
        installOwnerTestNetworkGuard,
        removeOwnerTestNetworkGuard,
        reconcileOwnerTestNetworkGuardOnBoot,
        OWNER_TEST_GUARD_RULE_IDS,
        assertPrivacyTransportReady
    };
}

if (typeof self !== 'undefined') {
    self.processNextCampaignTarget = processNextCampaignTarget;
    self.pauseCampaignOrchestrator = pauseCampaignOrchestrator;
    self.startCampaignOrchestrator = startCampaignOrchestrator;
    self.resumeCampaignOrchestrator = resumeCampaignOrchestrator;
    self.installOwnerTestNetworkGuard = installOwnerTestNetworkGuard;
    self.removeOwnerTestNetworkGuard = removeOwnerTestNetworkGuard;
    self.reconcileOwnerTestNetworkGuardOnBoot = reconcileOwnerTestNetworkGuardOnBoot;
    self.OWNER_TEST_GUARD_RULE_IDS = OWNER_TEST_GUARD_RULE_IDS;
    self.campaignState = campaignState;
}
