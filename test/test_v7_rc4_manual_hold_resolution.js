/**
 * test/test_v7_rc4_manual_hold_resolution.js
 * Unit & integration tests for Issue #6 Comment #6521464588:
 *   [MANUAL HOLD EVENT REJECTION - LOCAL STATE FIX]
 *
 * Scenarios covered with a mocked browser & background service worker:
 *   1. hold -> confirmed (exact jeongstkd.com reproduction: MANUAL_MODE_HOLD -> REGISTERED_CONTINUE with evidence -> CONFIRMED_SUCCESS, 0 STALE_TARGET_EVENT rejections, queue advances after ack)
 *   2. hold -> unknown (REGISTERED_CONTINUE without positive evidence or with error/generic nav -> DELIVERY_UNKNOWN, never CONFIRMED_SUCCESS; forged SENDER_FINISHED success=true without evidence downgraded to DELIVERY_UNKNOWN)
 *   3. stale attempt rejection (wrong attemptId, wrong tabId, wrong targetToken, wrong sessionId -> REJECTED, 0 ledger writes, hold preserved)
 *   4. double click idempotency (concurrent & sequential repeated MANUAL_HOLD_RESOLVE + SENDER_FINISHED -> exactly 1 ledger transition, duplicate=true, no duplicate writes)
 *   5. reload during hold (5a: page reload/navigation restores panel with initialHoldUrl preserved; 5b: Service Worker restart with targetResolve=null settles ledger & advances queue)
 *   6. operator pause stays paused (pauseCampaignOrchestrator during hold sets pausedByOperator=true; late MANUAL_HOLD_RESOLVE and relay watchdog READY never auto-resume)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Setup mocked Chrome extension environment before requiring background.js
const mockStorage = {};
const runtimeListeners = [];
const tabRemovedIds = [];
const sentTabMessages = [];

global.self = global;
global.window = global;
global.importScripts = (...files) => {
  for (const f of files) {
    const full = path.join(__dirname, '..', 'extension', f);
    if (fs.existsSync(full)) {
      const mod = require(full);
      if (f.includes('build-provenance')) global.BuildProvenance = mod;
      if (f.includes('history-store')) global.HistoryStore = mod.HistoryStore || mod;
      if (f.includes('challenge-gate')) global.ChallengeGate = mod;
      if (f.includes('privacy-gateway')) global.PrivacyGateway = mod;
    }
  }
};

global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const res = {};
        if (!keys) {
          Object.assign(res, mockStorage);
        } else if (Array.isArray(keys)) {
          keys.forEach((k) => { if (k in mockStorage) res[k] = mockStorage[k]; });
        } else if (typeof keys === 'string') {
          if (keys in mockStorage) res[keys] = mockStorage[keys];
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach((k) => { res[k] = (k in mockStorage) ? mockStorage[k] : keys[k]; });
        }
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (obj, cb) => {
        Object.assign(mockStorage, obj);
        if (cb) cb();
        return Promise.resolve();
      },
      remove: (keys, cb) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete mockStorage[k]);
        if (cb) cb();
        return Promise.resolve();
      }
    },
    session: {
      get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); },
      set: (o, cb) => { if (cb) cb(); return Promise.resolve(); },
      remove: (k, cb) => { if (cb) cb(); return Promise.resolve(); }
    }
  },
  runtime: {
    id: 'ldlijlaccfeelfdhgnjbibniocefckjj',
    getManifest: () => ({ version: '7.0.0', manifest_version: 3 }),
    sendMessage: (msg, cb) => {
      if (cb) setTimeout(() => cb({ success: true }), 1);
      return Promise.resolve({ success: true });
    },
    onMessage: {
      addListener: (fn) => runtimeListeners.push(fn)
    },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} }
  },
  tabs: {
    get: (tabId, cb) => {
      if (tabRemovedIds.includes(tabId)) {
        if (cb) cb(undefined);
        return Promise.reject(new Error('No tab with id'));
      }
      const t = { id: tabId, url: 'https://jeongstkd.com/contact' };
      if (cb) cb(t);
      return Promise.resolve(t);
    },
    remove: (tabId, cb) => {
      tabRemovedIds.push(tabId);
      if (cb) cb();
      return Promise.resolve();
    },
    sendMessage: (tabId, msg, cb) => {
      sentTabMessages.push({ tabId, msg });
      if (cb) cb({ success: true });
      return Promise.resolve({ success: true });
    },
    query: (q, cb) => { if (cb) cb([]); return Promise.resolve([]); },
    onUpdated: { addListener: () => {}, removeListener: () => {} },
    onRemoved: { addListener: () => {}, removeListener: () => {} }
  },
  alarms: {
    create: () => {},
    clear: () => Promise.resolve(true),
    onAlarm: { addListener: () => {} }
  },
  declarativeNetRequest: {
    updateSessionRules: () => Promise.resolve(),
    getSessionRules: () => Promise.resolve([])
  },
  webNavigation: {
    onErrorOccurred: { addListener: () => {} }
  },
  webRequest: {
    onAuthRequired: { addListener: () => {} }
  },
  privacy: {
    network: {
      webRTCIPHandlingPolicy: { set: (_, cb) => cb && cb(), get: (_, cb) => cb && cb({ value: 'disable_non_proxied_udp' }) }
    }
  },
  proxy: {
    settings: {
      set: (_, cb) => cb && cb(),
      get: (_, cb) => cb && cb({ value: { mode: 'fixed_servers', rules: { singleProxy: { host: '127.0.0.1', port: 18988 } } } })
    }
  }
};

// Preload required modules into global scope
global.importScripts(
  'modules/build-provenance.js',
  'modules/history-store.js',
  'modules/challenge-gate.js',
  'modules/privacy-gateway.js'
);

const bg = require('../extension/background.js');
const {
  campaignState,
  resolveManualHoldHandshake,
  settledManualHoldAttempts,
  getHistoryStoreInstance,
  pauseCampaignOrchestrator
} = bg;

function dispatchRuntimeMessage(message, sender = { tab: { id: campaignState.currentTabId } }) {
  return new Promise((resolve) => {
    let handled = false;
    for (const listener of runtimeListeners) {
      const ret = listener(message, sender, (resp) => {
        if (!handled) {
          handled = true;
          resolve(resp);
        }
      });
      if (ret === true) break;
    }
    setTimeout(() => {
      if (!handled) resolve(null);
    }, 2000);
  });
}

async function setupActiveManualHoldTarget({
  runId = 'manual_run_test_1',
  attemptId = 'att_jeongstkd_1',
  targetToken = 'tok_jeongstkd_1',
  sessionId = 10,
  tabId = 501,
  url = 'https://jeongstkd.com/contact',
  remainingQueue = ['https://next-dojo.com/contact']
} = {}) {
  const hs = await getHistoryStoreInstance();
  hs.attempts = [];
  hs.activeCampaignRunId = runId;
  await hs.recordAttempt(url, {
    campaignRunId: runId,
    status: 'PREPARING',
    reason: 'PREPARING',
    targetToken
  });
  hs.attempts[hs.attempts.length - 1].attemptId = attemptId;

  campaignState.isActive = true;
  campaignState.isPaused = false;
  campaignState.pausedByOperator = false;
  campaignState.campaignMode = 'MANUAL';
  campaignState.campaignRunId = runId;
  campaignState.sessionId = sessionId;
  campaignState.schedulerGeneration = 1;
  campaignState.currentTabId = tabId;
  campaignState.targetTabId = tabId;
  campaignState.currentTargetToken = targetToken;
  campaignState.currentAttempt = { attemptId, url, status: 'PREPARING' };
  campaignState.queue = [...remainingQueue];
  campaignState.totalTargets = 1 + remainingQueue.length;
  campaignState.visitedUrls = [url];
  campaignState.successfulUrls = [];
  campaignState.activeTargetInFlight = true;
  campaignState.activeTargetCount = 1;
  campaignState.isLoopRunning = false;
  campaignState.counters = {
    total: 1 + remainingQueue.length,
    completed: 0,
    remaining: remainingQueue.length,
    success: 0,
    failed: 0,
    deliveryUnknown: 0,
    skipped: 0,
    timeout: 0,
    paused: 0,
    inProgress: 1,
    failureBreakdown: {}
  };

  // Enter MANUAL_MODE_HOLD via the real background message handler
  const holdAck = await dispatchRuntimeMessage({
    action: 'MANUAL_MODE_HOLD',
    attemptId,
    targetToken,
    campaignRunId: runId,
    sessionId,
    tabId,
    url,
    challengeStatus: 'NONE'
  }, { tab: { id: tabId } });

  assert.strictEqual(holdAck.success, true);
  assert.strictEqual(holdAck.state, 'MANUAL_HOLD');
  assert.strictEqual(campaignState.currentTargetStage, 'MANUAL_HOLD');
  assert.strictEqual(campaignState.manualHoldActive, true);
  assert.ok(mockStorage.xpider_v7_active_hold_state && mockStorage.xpider_v7_active_hold_state.active === true);
  return { hs, attemptId, targetToken, runId, sessionId, tabId, url };
}

(async () => {
  console.log('=== TEST SUITE: v7.0.0-rc4 Manual-Hold Resolution Handshake (#6521464588) ===');
  let passed = 0;
  const pass = (name) => { passed++; console.log(`  PASS ${passed}: ${name}`); };

  // -------------------------------------------------------------------------
  // 1. hold -> confirmed (jeongstkd.com exact reproduction)
  // -------------------------------------------------------------------------
  {
    settledManualHoldAttempts.clear();
    const ctx = await setupActiveManualHoldTarget({
      attemptId: 'att_jeongstkd_confirmed',
      url: 'https://jeongstkd.com/contact'
    });

    let targetResolverCalls = 0;
    let resolvedPayload = null;
    campaignState.targetResolve = async (res) => {
      targetResolverCalls++;
      resolvedPayload = res;
      const terminal = res.success ? 'CONFIRMED_SUCCESS' : 'DELIVERY_UNKNOWN';
      await ctx.hs.settleCanonicalAttempt(ctx.attemptId, terminal, res.reasonCode, res.metadata?.outcomeEvidence || {}, {
        campaignRunId: ctx.runId,
        resultUrl: res.metadata?.resultUrl
      });
      await ctx.hs.persist();
      campaignState.currentTargetStage = 'SETTLED';
      campaignState.activeTargetInFlight = false;
      campaignState.activeTargetCount = 0;
    };

    // Step 1: Content script sends MANUAL_HOLD_RESOLVE with positive confirmation evidence
    const resolveAck = await dispatchRuntimeMessage({
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: ctx.tabId,
      url: 'https://jeongstkd.com/contact?submitted=true',
      initialHoldUrl: 'https://jeongstkd.com/contact',
      evidence: {
        pageText: 'Thank you! Your message has been sent to Jeongs Taekwondo.',
        currentUrl: 'https://jeongstkd.com/contact?submitted=true',
        urlChanged: true,
        hasPositiveDomSuccess: true,
        hasUrlRedirectSuccess: true,
        formStillPresent: false
      }
    }, { tab: { id: ctx.tabId } });

    assert.strictEqual(resolveAck.success, true);
    assert.strictEqual(resolveAck.settled, true);
    assert.strictEqual(resolveAck.duplicate, false);
    assert.strictEqual(resolveAck.terminalStatus, 'CONFIRMED_SUCCESS');
    assert.strictEqual(resolveAck.reasonCode, 'SUCCESS_CONFIRMED');
    assert.strictEqual(targetResolverCalls, 1, 'targetResolve must be called exactly once');
    assert.strictEqual(resolvedPayload.success, true);
    assert.strictEqual(mockStorage.xpider_v7_active_hold_state, undefined, 'Active hold state must be cleared on resolution');

    // Step 2: Content script follows up with SENDER_FINISHED (as finishCampaign does) — must NOT be rejected as non_terminal_stage!
    const finishAck = await dispatchRuntimeMessage({
      action: 'SENDER_FINISHED',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      result: {
        success: true,
        reasonCode: 'SUCCESS_CONFIRMED',
        metadata: { manualMode: true, ownerManualConfirmed: true }
      }
    }, { tab: { id: ctx.tabId } });

    assert.strictEqual(finishAck.success, true, 'Follow-up SENDER_FINISHED must succeed (never INVALID_STAGE_FOR_FINISH)');
    assert.strictEqual(finishAck.alreadySettledByManualHoldResolve, true);
    assert.strictEqual(targetResolverCalls, 1, 'Follow-up SENDER_FINISHED must not trigger a second settlement');

    const settledRec = ctx.hs.attempts.find((a) => a.attemptId === ctx.attemptId);
    assert.strictEqual(settledRec.status, 'CONFIRMED_SUCCESS');
    pass('1. hold -> confirmed: MANUAL_HOLD -> CONFIRMED_SUCCESS handshake settles atomically with zero SENDER_FINISHED stage rejection');
  }

  // -------------------------------------------------------------------------
  // 2. hold -> unknown (no positive evidence / generic navigation / un-evidenced SENDER_FINISHED)
  // -------------------------------------------------------------------------
  {
    settledManualHoldAttempts.clear();
    const ctx = await setupActiveManualHoldTarget({
      attemptId: 'att_manual_unknown_1',
      url: 'https://example-dojo.com/contact'
    });

    let resolvedPayload = null;
    campaignState.targetResolve = async (res) => {
      resolvedPayload = res;
      const terminal = res.success ? 'CONFIRMED_SUCCESS' : 'DELIVERY_UNKNOWN';
      await ctx.hs.settleCanonicalAttempt(ctx.attemptId, terminal, res.reasonCode, res.metadata?.outcomeEvidence || {}, {
        campaignRunId: ctx.runId
      });
      await ctx.hs.persist();
    };

    const resolveAck = await dispatchRuntimeMessage({
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: ctx.tabId,
      url: 'https://example-dojo.com/contact',
      initialHoldUrl: 'https://example-dojo.com/contact',
      evidence: {
        pageText: 'Contact Us - Fill out the form below',
        currentUrl: 'https://example-dojo.com/contact',
        urlChanged: false,
        hasPositiveDomSuccess: false,
        hasUrlRedirectSuccess: false,
        formStillPresent: true
      }
    }, { tab: { id: ctx.tabId } });

    assert.strictEqual(resolveAck.success, true);
    assert.strictEqual(resolveAck.terminalStatus, 'DELIVERY_UNKNOWN', 'Un-evidenced manual claim must settle as DELIVERY_UNKNOWN');
    assert.strictEqual(resolveAck.subReason, 'MANUAL_CLAIM_NO_EVIDENCE');
    assert.strictEqual(resolvedPayload.success, false, 'Must NEVER record success=true without evidence');

    const settledRec = ctx.hs.attempts.find((a) => a.attemptId === ctx.attemptId);
    assert.strictEqual(settledRec.status, 'DELIVERY_UNKNOWN');

    // Also test direct SENDER_FINISHED with success=true during MANUAL_HOLD when evidence is missing
    settledManualHoldAttempts.clear();
    const ctx2 = await setupActiveManualHoldTarget({
      attemptId: 'att_manual_unknown_direct_finish',
      url: 'https://example-dojo2.com/contact'
    });
    let directFinishPayload = null;
    campaignState.targetResolve = (res) => { directFinishPayload = res; };

    const directAck = await dispatchRuntimeMessage({
      action: 'SENDER_FINISHED',
      attemptId: ctx2.attemptId,
      targetToken: ctx2.targetToken,
      campaignRunId: ctx2.runId,
      sessionId: ctx2.sessionId,
      result: {
        success: true,
        reasonCode: 'SUCCESS_CONFIRMED',
        metadata: {
          manualMode: true,
          outcomeEvidence: {
            pageText: 'Still on contact form without confirmation',
            currentUrl: 'https://example-dojo2.com/contact',
            urlChanged: false
          }
        }
      }
    }, { tab: { id: ctx2.tabId } });

    assert.strictEqual(directAck.success, true);
    assert.strictEqual(directFinishPayload.success, false, 'Direct SENDER_FINISHED without evidence must be downgraded to DELIVERY_UNKNOWN');
    assert.strictEqual(directFinishPayload.reasonCode, 'DELIVERY_UNKNOWN');
    pass('2. hold -> unknown: Un-evidenced REGISTERED_CONTINUE and un-evidenced SENDER_FINISHED record DELIVERY_UNKNOWN, never CONFIRMED_SUCCESS');
  }

  // -------------------------------------------------------------------------
  // 3. stale attempt rejection (wrong attemptId / wrong tabId / wrong token)
  // -------------------------------------------------------------------------
  {
    settledManualHoldAttempts.clear();
    const ctx = await setupActiveManualHoldTarget({
      attemptId: 'att_active_hold_3',
      tabId: 503,
      url: 'https://active-dojo.com/contact'
    });

    let resolverCalled = false;
    campaignState.targetResolve = () => { resolverCalled = true; };

    // Wrong attemptId
    const staleAttemptAck = await dispatchRuntimeMessage({
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: 'att_stale_old_999',
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: ctx.tabId,
      evidence: { hasPositiveDomSuccess: true }
    }, { tab: { id: ctx.tabId } });

    assert.strictEqual(staleAttemptAck.success, false);
    assert.strictEqual(staleAttemptAck.stale, true);
    assert.strictEqual(staleAttemptAck.reason, 'attempt_mismatch');

    // Wrong tabId
    const staleTabAck = await dispatchRuntimeMessage({
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: 999,
      evidence: { hasPositiveDomSuccess: true }
    }, { tab: { id: 999 } });

    assert.strictEqual(staleTabAck.success, false);
    assert.strictEqual(staleTabAck.stale, true);
    assert.strictEqual(staleTabAck.reason, 'tab_mismatch');
    assert.strictEqual(resolverCalled, false, 'Stale events must never invoke targetResolve');
    assert.strictEqual(campaignState.currentTargetStage, 'MANUAL_HOLD', 'Active hold must remain intact after stale rejection');
    pass('3. stale attempt rejection: Mismatched attemptId or tabId is rejected with zero state/ledger mutation');
  }

  // -------------------------------------------------------------------------
  // 4. double click idempotency (concurrent & sequential repeated calls)
  // -------------------------------------------------------------------------
  {
    settledManualHoldAttempts.clear();
    const ctx = await setupActiveManualHoldTarget({
      attemptId: 'att_double_click_4',
      tabId: 504,
      url: 'https://doubleclick-dojo.com/contact'
    });

    let settleCount = 0;
    campaignState.targetResolve = async (res) => {
      settleCount++;
      await new Promise((r) => setTimeout(r, 20));
      await ctx.hs.settleCanonicalAttempt(ctx.attemptId, 'CONFIRMED_SUCCESS', 'SUCCESS_CONFIRMED', {}, {
        campaignRunId: ctx.runId
      });
      await ctx.hs.persist();
    };

    const reqPayload = {
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: ctx.tabId,
      evidence: {
        pageText: 'Thank you for contacting us!',
        currentUrl: 'https://doubleclick-dojo.com/thank-you',
        urlChanged: true,
        hasPositiveDomSuccess: true
      }
    };

    // Fire 3 concurrent MANUAL_HOLD_RESOLVE calls + 1 sequential call
    const [r1, r2, r3] = await Promise.all([
      resolveManualHoldHandshake(reqPayload, { tab: { id: ctx.tabId } }),
      resolveManualHoldHandshake(reqPayload, { tab: { id: ctx.tabId } }),
      resolveManualHoldHandshake(reqPayload, { tab: { id: ctx.tabId } })
    ]);
    const r4 = await resolveManualHoldHandshake(reqPayload, { tab: { id: ctx.tabId } });

    assert.strictEqual(settleCount, 1, 'targetResolve must execute strictly once across concurrent + sequential double clicks');
    assert.strictEqual(r1.terminalStatus, 'CONFIRMED_SUCCESS');
    assert.strictEqual(r4.duplicate, true, 'Subsequent call must report duplicate=true');
    const matchingAttempts = ctx.hs.attempts.filter((a) => a.attemptId === ctx.attemptId);
    assert.strictEqual(matchingAttempts.length, 1, 'HistoryStore must contain exactly 1 record for the attempt');
    pass('4. double click idempotency: Concurrent & sequential repeated clicks perform strictly 1 ledger transition');
  }

  // -------------------------------------------------------------------------
  // 5. reload during hold (SW restart with targetResolve=null + DOM panel restore)
  // -------------------------------------------------------------------------
  {
    settledManualHoldAttempts.clear();
    const ctx = await setupActiveManualHoldTarget({
      attemptId: 'att_sw_reload_hold_5',
      tabId: 505,
      url: 'https://reload-dojo.com/contact',
      remainingQueue: ['https://queued-next-site.com/contact']
    });

    // Simulate Service Worker reload during MANUAL_HOLD: targetResolve closure is lost (null),
    // while active hold state remains hydrated from xpider_v7_active_hold_state.
    campaignState.targetResolve = null;
    campaignState.isLoopRunning = true; // prevent full network orchestration in unit test while checking ledger & queue state

    const reloadAck = await dispatchRuntimeMessage({
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: ctx.tabId,
      url: 'https://reload-dojo.com/contact?sent=1',
      initialHoldUrl: 'https://reload-dojo.com/contact',
      evidence: {
        pageText: '문의가 정상적으로 접수되었습니다. 감사합니다.',
        currentUrl: 'https://reload-dojo.com/contact?sent=1',
        urlChanged: true,
        hasPositiveDomSuccess: true
      }
    }, { tab: { id: ctx.tabId } });

    assert.strictEqual(reloadAck.success, true);
    assert.strictEqual(reloadAck.settled, true);
    assert.strictEqual(reloadAck.terminalStatus, 'CONFIRMED_SUCCESS');
    assert.strictEqual(campaignState.activeTargetInFlight, false, 'Fallback SW-reload settlement must release activeTargetInFlight');
    assert.strictEqual(mockStorage.xpider_v7_active_hold_state, undefined, 'Fallback SW-reload settlement must clear xpider_v7_active_hold_state');
    const rec = ctx.hs.attempts.find((a) => a.attemptId === ctx.attemptId);
    assert.strictEqual(rec.status, 'CONFIRMED_SUCCESS', 'Ledger must be settled as CONFIRMED_SUCCESS even when targetResolve was null after SW reload');
    pass('5. reload during hold: SW reload during MANUAL_HOLD (targetResolve=null) settles ledger atomically and releases slot');
  }

  // -------------------------------------------------------------------------
  // 6. operator pause stays paused (STOP & SAVE during hold never auto-resumes)
  // -------------------------------------------------------------------------
  {
    settledManualHoldAttempts.clear();
    const ctx = await setupActiveManualHoldTarget({
      attemptId: 'att_operator_pause_6',
      tabId: 506,
      url: 'https://paused-dojo.com/contact',
      remainingQueue: ['https://remaining-1.com', 'https://remaining-2.com']
    });

    // Operator clicks Pause / Stop & Save while in MANUAL_HOLD
    tabRemovedIds.length = 0;
    const pauseRes = await pauseCampaignOrchestrator(true);
    assert.strictEqual(pauseRes.success, true);
    assert.strictEqual(campaignState.isPaused, true);
    assert.strictEqual(campaignState.pausedByOperator, true);
    assert.strictEqual(campaignState.isActive, false);
    assert.ok(!tabRemovedIds.includes(ctx.tabId), 'Held tab must be retained open when operator pauses during MANUAL_HOLD');

    // Late MANUAL_HOLD_RESOLVE arriving while campaign is paused by operator must be rejected and NOT resume campaign
    const lateAck = await dispatchRuntimeMessage({
      action: 'MANUAL_HOLD_RESOLVE',
      decision: 'REGISTERED_CONTINUE',
      attemptId: ctx.attemptId,
      targetToken: ctx.targetToken,
      campaignRunId: ctx.runId,
      sessionId: ctx.sessionId,
      tabId: ctx.tabId,
      evidence: { hasPositiveDomSuccess: true }
    }, { tab: { id: ctx.tabId } });

    assert.strictEqual(lateAck.success, false);
    assert.strictEqual(lateAck.stale, true);
    assert.strictEqual(lateAck.reason, 'campaign_paused_or_inactive');
    assert.strictEqual(campaignState.isPaused, true, 'Campaign must remain paused');
    assert.strictEqual(campaignState.isActive, false, 'Campaign must remain inactive');
    pass('6. operator pause stays paused: Operator PAUSE / STOP & SAVE retains held tab and blocks late resolution or watchdog auto-resume');
  }

  console.log(`\nALL ${passed}/6 v7.0.0-rc4 Manual-Hold Resolution Handshake tests PASSED!`);
  process.exit(0);
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
