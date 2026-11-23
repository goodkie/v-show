'use strict';
/**
 * XPIDER V7.1 GMass-Inspired Safe Delivery Engine (Compliance-First, Fail-Closed).
 *
 * Implements Directive #7051437541 architectural pillars:
 * 1. Distributed multi-day scheduling over durable rolling 1m / 1h / 24h account & domain limits.
 * 2. Downward-only adaptive throttling (NEVER accelerates to chase volume).
 * 3. Deliverability hygiene verification (SPF / DMARC / DKIM disclosure, From/Reply-To alignment
 *    & injection guard, RFC 8058 One-Click https://unsubscribe.vivpr.pro, visible link, physical
 *    address, cross-provider suppression & bounce/complaint hygiene).
 * 4. True observable dashboard (explicitly distinguishes GMAIL_API_ACCEPTED from verifiedDelivered,
 *    never claims guaranteed inbox placement or suspension immunity).
 * 5. Zero proprietary third-party code, zero enforcement bypass, zero silent provider fallback.
 */
const dns = require('node:dns');
const {
  ROLLING_WINDOW_MS,
  maskEmail,
  normalizeEmail,
  emailDomain
} = require('./gmail-account-vault');

const THROTTLE_LEVELS = Object.freeze([
  Object.freeze({ level: 0, name: 'NORMAL', rateMultiplier: 1.0, delayMultiplier: 1.0 }),
  Object.freeze({ level: 1, name: 'REDUCED_50PCT', rateMultiplier: 0.5, delayMultiplier: 2.0 }),
  Object.freeze({ level: 2, name: 'REDUCED_25PCT', rateMultiplier: 0.25, delayMultiplier: 4.0 }),
  Object.freeze({ level: 3, name: 'STOPPED_NEGATIVE_SIGNAL', rateMultiplier: 0.0, delayMultiplier: 0.0 })
]);

const DEFAULT_THROTTLE_CONFIG = Object.freeze({
  baseMinDelayMs: 1500,
  slowLatencyThresholdMs: 4000,
  severeLatencyThresholdMs: 8000,
  mildBounceWarningPct: 2.0,
  hardBounceStopPct: 5.0,
  hardComplaintCount: 1
});

const PUBLIC_UNSUB_HOST = 'unsubscribe.vivpr.pro';
const HONEST_DELIVERY_DISCLAIMER =
  'GMAIL_API_ACCEPTED != DELIVERED / INBOX / OPENED. Gmail API 200 OK는 Google API 접수만 의미하며 독립적인 전달·수신함 도착 증명이나 계정 정지 면제를 보장하지 않습니다.';

function hasHeaderInjection(val) {
  return /[\r\n\u0000-\u001f\u007f]/u.test(String(val || ''));
}

/**
 * Downward-only adaptive throttling state machine.
 * Invariant: level can ONLY move monotonically upward (0 -> 1 -> 2 -> 3),
 * meaning effective rate can ONLY decrease or stop; delay can ONLY stay the same or increase.
 * Artificially accelerating to meet a target volume is structurally forbidden.
 */
class AdaptiveThrottleController {
  constructor(config = {}, nowFn = () => Date.now()) {
    this.nowFn = typeof nowFn === 'function' ? nowFn : () => Date.now();
    this.baseMinDelayMs = Number.isFinite(config.baseMinDelayMs) && config.baseMinDelayMs >= 0
      ? Math.floor(config.baseMinDelayMs)
      : DEFAULT_THROTTLE_CONFIG.baseMinDelayMs;
    this.slowLatencyThresholdMs = Number.isFinite(config.slowLatencyThresholdMs) && config.slowLatencyThresholdMs > 0
      ? Math.floor(config.slowLatencyThresholdMs)
      : DEFAULT_THROTTLE_CONFIG.slowLatencyThresholdMs;
    this.severeLatencyThresholdMs = Number.isFinite(config.severeLatencyThresholdMs) && config.severeLatencyThresholdMs > this.slowLatencyThresholdMs
      ? Math.floor(config.severeLatencyThresholdMs)
      : Math.max(this.slowLatencyThresholdMs * 2, DEFAULT_THROTTLE_CONFIG.severeLatencyThresholdMs);
    this.mildBounceWarningPct = Number.isFinite(config.mildBounceWarningPct) && config.mildBounceWarningPct > 0
      ? Number(config.mildBounceWarningPct)
      : DEFAULT_THROTTLE_CONFIG.mildBounceWarningPct;
    this.hardBounceStopPct = Number.isFinite(config.hardBounceStopPct) && config.hardBounceStopPct > 0
      ? Number(config.hardBounceStopPct)
      : DEFAULT_THROTTLE_CONFIG.hardBounceStopPct;
    this.hardComplaintCount = Number.isSafeInteger(config.hardComplaintCount) && config.hardComplaintCount >= 1
      ? config.hardComplaintCount
      : DEFAULT_THROTTLE_CONFIG.hardComplaintCount;

    this.level = 0;
    this.lastReason = null;
    this.stopReason = null;
    this.adjustments = [];
    this.observedLatencies = [];
  }

  get spec() {
    return THROTTLE_LEVELS[this.level] || THROTTLE_LEVELS[3];
  }

  get shouldStop() {
    return this.level >= 3;
  }

  /**
   * Monotonic downward-only step. Never reduces level (never accelerates).
   */
  stepDown(targetLevel, reason, detail = null) {
    const clamped = Math.max(0, Math.min(3, Number.isSafeInteger(targetLevel) ? targetLevel : this.level + 1));
    if (clamped <= this.level) {
      return {
        changed: false,
        level: this.level,
        levelName: this.spec.name,
        reason: clamped < this.level ? 'ACCELERATION_FORBIDDEN_DOWNWARD_ONLY' : 'ALREADY_AT_OR_BELOW_LEVEL'
      };
    }
    const prev = this.level;
    this.level = clamped;
    this.lastReason = String(reason || 'NEGATIVE_SIGNAL_THROTTLE');
    if (this.level >= 3) {
      this.stopReason = this.lastReason;
    }
    const evt = {
      at: new Date(this.nowFn()).toISOString(),
      fromLevel: prev,
      toLevel: this.level,
      levelName: this.spec.name,
      reason: this.lastReason,
      detail: detail || null
    };
    this.adjustments.push(evt);
    return { changed: true, ...evt };
  }

  /**
   * Explicit structural guard proving rate acceleration is forbidden.
   */
  attemptAccelerate() {
    return {
      ok: false,
      changed: false,
      level: this.level,
      levelName: this.spec.name,
      reason: 'ACCELERATION_FORBIDDEN_DOWNWARD_ONLY'
    };
  }

  observeLatency(latencyMs) {
    const ms = Number(latencyMs);
    if (!Number.isFinite(ms) || ms < 0) return { changed: false, level: this.level };
    this.observedLatencies.push(Math.round(ms));
    if (this.observedLatencies.length > 50) this.observedLatencies.shift();
    if (ms >= this.severeLatencyThresholdMs) {
      return this.stepDown(Math.max(this.level, 2), 'SLOW_API_LATENCY_SEVERE', { latencyMs: Math.round(ms) });
    }
    if (ms >= this.slowLatencyThresholdMs) {
      return this.stepDown(Math.min(2, this.level + 1), 'SLOW_API_LATENCY_ELEVATED', { latencyMs: Math.round(ms) });
    }
    return { changed: false, level: this.level };
  }

  observeSignals({
    providerHttpStatus = null,
    abuseWarning = false,
    complaintCount = 0,
    liveBounceRatePct = 0,
    liveBouncedCount = 0,
    historicalBounceRatePct = 0,
    historicalBouncedCount = 0
  } = {}) {
    if (providerHttpStatus === 401 || providerHttpStatus === 403 || providerHttpStatus === 429) {
      return this.stepDown(3, `PROVIDER_ENFORCEMENT_HTTP_${providerHttpStatus}`, { httpStatus: providerHttpStatus });
    }
    if (abuseWarning === true) {
      return this.stepDown(3, 'PROVIDER_ABUSE_WARNING');
    }
    if (Number(complaintCount) >= this.hardComplaintCount) {
      return this.stepDown(3, 'COMPLAINT_THRESHOLD_EXCEEDED', { complaintCount: Number(complaintCount) });
    }
    if (Number(liveBounceRatePct) >= this.hardBounceStopPct && Number(liveBouncedCount) >= 2) {
      return this.stepDown(3, 'ABNORMAL_BOUNCE_RATE_STOP', {
        bounceRatePct: Number(liveBounceRatePct),
        bouncedCount: Number(liveBouncedCount)
      });
    }
    if (Number(liveBounceRatePct) >= this.mildBounceWarningPct && Number(liveBouncedCount) >= 1) {
      return this.stepDown(Math.max(this.level, 1), 'ELEVATED_LIVE_BOUNCE_THROTTLE', {
        bounceRatePct: Number(liveBounceRatePct),
        bouncedCount: Number(liveBouncedCount)
      });
    }
    if (Number(historicalBounceRatePct) >= this.hardBounceStopPct && Number(historicalBouncedCount) >= 10) {
      // Historical bounce warning from prior Resend history starts Gmail safely throttled down, never accelerated
      return this.stepDown(Math.max(this.level, 1), 'HISTORICAL_ELEVATED_BOUNCE_CONSERVATIVE_THROTTLE', {
        historicalBounceRatePct: Number(historicalBounceRatePct),
        historicalBouncedCount: Number(historicalBouncedCount)
      });
    }
    return { changed: false, level: this.level };
  }

  getEffectiveCaps({ capPerMinute = 2, capPerHour = 15, cap24h = 50 } = {}) {
    if (this.shouldStop) {
      return { effectivePerMinute: 0, effectivePerHour: 0, effectivePerDay: 0 };
    }
    const m = this.spec.rateMultiplier;
    const effectivePerDay = Math.max(1, Math.floor(cap24h * m));
    const effectivePerHour = Math.max(1, Math.min(effectivePerDay, Math.floor(capPerHour * m)));
    const effectivePerMinute = Math.max(1, Math.min(effectivePerHour, Math.floor(capPerMinute * m)));
    return { effectivePerMinute, effectivePerHour, effectivePerDay };
  }

  getEffectiveDelayMs() {
    if (this.shouldStop) return 0;
    const mult = this.spec.delayMultiplier;
    return Math.max(this.baseMinDelayMs, Math.round(this.baseMinDelayMs * mult));
  }

  getRecommendedMinDelayMs() {
    if (this.shouldStop) return null;
    const baseline = Math.max(DEFAULT_THROTTLE_CONFIG.baseMinDelayMs, this.baseMinDelayMs);
    return Math.round(baseline * this.spec.delayMultiplier);
  }

  toJSON() {
    const avgLatencyMs = this.observedLatencies.length
      ? Math.round(this.observedLatencies.reduce((a, b) => a + b, 0) / this.observedLatencies.length)
      : null;
    return {
      downwardOnly: true,
      level: this.level,
      levelName: this.spec.name,
      rateMultiplier: this.spec.rateMultiplier,
      delayMultiplier: this.spec.delayMultiplier,
      baseMinDelayMs: this.baseMinDelayMs,
      effectiveDelayMs: this.getEffectiveDelayMs(),
      recommendedMinDelayMs: this.getRecommendedMinDelayMs(),
      shouldStop: this.shouldStop,
      stopReason: this.stopReason,
      lastReason: this.lastReason,
      avgObservedLatencyMs: avgLatencyMs,
      adjustments: this.adjustments.slice(-20)
    };
  }

  static fromJSON(snap, nowFn = () => Date.now()) {
    const ctrl = new AdaptiveThrottleController(snap || {}, nowFn);
    if (snap && Number.isSafeInteger(snap.level) && snap.level >= 0 && snap.level <= 3) {
      ctrl.level = snap.level;
    }
    if (snap && snap.lastReason) ctrl.lastReason = String(snap.lastReason);
    if (snap && snap.stopReason) ctrl.stopReason = String(snap.stopReason);
    if (snap && Array.isArray(snap.adjustments)) ctrl.adjustments = snap.adjustments.slice(-20);
    return ctrl;
  }
}

/**
 * Deterministic multi-day distributed schedule planner.
 * Computes day-by-day execution windows respecting fixed per-account assignments,
 * rolling 1m / 1h / 24h account caps, aggregate domain 24h caps, and downward-only throttle multipliers.
 * NEVER reassigns recipients to another account to work around caps or blocks.
 */
function buildDistributedSchedulePlan({
  entries = [],
  accountsWithUsage = [],
  vault,
  throttle = null,
  nowMs = Date.now(),
  maxProjectionDays = 60
} = {}) {
  const usage = vault && typeof vault.getRolling24hUsage === 'function'
    ? vault.getRolling24hUsage()
    : { nowMs, perAccount: {}, perAccount1h: {}, perAccount1m: {}, perDomain: {}, earliest24hAccount: {}, earliest24hDomain: {}, earliest1hAccount: {}, earliest1mAccount: {} };
  const ctrl = throttle instanceof AdaptiveThrottleController
    ? throttle
    : AdaptiveThrottleController.fromJSON(throttle, () => nowMs);

  const acctMap = new Map();
  for (const a of (Array.isArray(accountsWithUsage) ? accountsWithUsage : [])) {
    if (a && a.id) acctMap.set(a.id, a);
  }

  const allocatedTotalByAcct = {};
  const pendingByAcct = {};
  const acceptedByAcct = {};
  const unknownByAcct = {};
  let totalPending = 0;

  for (const e of (Array.isArray(entries) ? entries : [])) {
    if (!e || !e.assignedAccountId) continue;
    const aid = e.assignedAccountId;
    allocatedTotalByAcct[aid] = (allocatedTotalByAcct[aid] || 0) + 1;
    if (e.status === 'PENDING') {
      pendingByAcct[aid] = (pendingByAcct[aid] || 0) + 1;
      totalPending++;
    } else if (e.status === 'GMAIL_API_ACCEPTED') {
      acceptedByAcct[aid] = (acceptedByAcct[aid] || 0) + 1;
    } else if (e.status === 'HALTED_RECONCILE_REQUIRED' || e.status === 'SENDING') {
      unknownByAcct[aid] = (unknownByAcct[aid] || 0) + 1;
    }
  }

  // Track per-account effective caps and remaining counts
  const involvedIds = Array.from(new Set([
    ...Object.keys(allocatedTotalByAcct),
    ...Object.keys(pendingByAcct)
  ]));

  const remPendingByAcct = { ...pendingByAcct };
  const perAccountPlan = [];
  let earliestNextPermittedMs = null;
  let earliestWaitReason = null;

  for (const aid of involvedIds) {
    const acct = acctMap.get(aid);
    if (!acct) continue;
    const baseCaps = vault && typeof vault.getAccountRateCaps === 'function'
      ? vault.getAccountRateCaps(acct)
      : { capPerMinute: acct.capPerMinute || 2, capPerHour: acct.capPerHour || 15, cap24h: acct.cap24h || 50 };
    const effCaps = ctrl.getEffectiveCaps(baseCaps);
    const perm = (vault && typeof vault.getNextPermittedAtMs === 'function' && !ctrl.shouldStop)
      ? vault.getNextPermittedAtMs(acct, usage, effCaps)
      : { permittedNow: false, waitUntilMs: null, waitUntilIso: null, reason: ctrl.stopReason || 'THROTTLE_STOPPED' };

    const sent24h = usage.perAccount[aid] || 0;
    const sent1h = usage.perAccount1h[aid] || 0;
    const sent1m = usage.perAccount1m[aid] || 0;
    const domainSent24h = usage.perDomain[acct.domain] || 0;
    const domainCap24h = acct.domainCap24h || (vault ? vault.getDomainCap24h(acct.domain, acct.type) : 100);

    const remainingTodayAccount = Math.max(0, effCaps.effectivePerDay - sent24h);
    const remainingTodayDomain = Math.max(0, domainCap24h - domainSent24h);
    const remainingToday = Math.min(remainingTodayAccount, remainingTodayDomain);

    if ((pendingByAcct[aid] || 0) > 0 && !ctrl.shouldStop) {
      const candidateMs = perm.permittedNow ? nowMs : perm.waitUntilMs;
      if (candidateMs !== null && (earliestNextPermittedMs === null || candidateMs < earliestNextPermittedMs)) {
        earliestNextPermittedMs = candidateMs;
        earliestWaitReason = perm.permittedNow ? null : perm.reason;
      }
    }

    perAccountPlan.push({
      accountId: aid,
      maskedEmail: acct.maskedEmail || maskEmail(acct.email),
      domain: acct.domain,
      type: acct.type,
      connected: Boolean(acct.connected),
      providerBlocked: Boolean(acct.providerBlocked),
      blockReason: acct.blockReason || null,
      capPerMinute: baseCaps.capPerMinute,
      capPerHour: baseCaps.capPerHour,
      cap24h: baseCaps.cap24h,
      effectivePerMinute: effCaps.effectivePerMinute,
      effectivePerHour: effCaps.effectivePerHour,
      effectivePerDay: effCaps.effectivePerDay,
      sent1m,
      sent1h,
      sent24h,
      domainSent24h,
      domainCap24h,
      remainingToday,
      allocatedTotal: allocatedTotalByAcct[aid] || 0,
      allocatedPending: pendingByAcct[aid] || 0,
      allocatedAccepted: acceptedByAcct[aid] || 0,
      allocatedUnknown: unknownByAcct[aid] || 0,
      permittedNow: Boolean(perm.permittedNow && acct.connected && !acct.providerBlocked && !acct.disabled && !ctrl.shouldStop),
      nextPermittedAt: perm.waitUntilIso || (perm.permittedNow ? new Date(nowMs).toISOString() : null),
      waitReason: perm.reason || null
    });
  }

  // Project day-by-day windows without moving recipients across accounts
  const daySchedule = [];
  if (totalPending > 0 && !ctrl.shouldStop) {
    let remainingTotal = totalPending;
    for (let dayIdx = 1; dayIdx <= maxProjectionDays && remainingTotal > 0; dayIdx++) {
      const windowStartMs = nowMs + (dayIdx - 1) * ROLLING_WINDOW_MS;
      const domainBudget = {};
      for (const p of perAccountPlan) {
        if (domainBudget[p.domain] === undefined) {
          domainBudget[p.domain] = dayIdx === 1
            ? Math.max(0, p.domainCap24h - p.domainSent24h)
            : p.domainCap24h;
        }
      }

      const dayPerAccount = {};
      const dayPerDomain = {};
      let plannedToday = 0;

      for (const p of perAccountPlan) {
        const remForAcct = remPendingByAcct[p.accountId] || 0;
        if (remForAcct <= 0) continue;
        if (!p.connected || p.providerBlocked) continue;

        const acctBudget = dayIdx === 1
          ? Math.max(0, p.effectivePerDay - p.sent24h)
          : p.effectivePerDay;
        const domLeft = domainBudget[p.domain] || 0;
        const canSend = Math.min(remForAcct, acctBudget, domLeft);
        if (canSend > 0) {
          dayPerAccount[p.accountId] = canSend;
          dayPerDomain[p.domain] = (dayPerDomain[p.domain] || 0) + canSend;
          domainBudget[p.domain] = domLeft - canSend;
          remPendingByAcct[p.accountId] = remForAcct - canSend;
          remainingTotal -= canSend;
          plannedToday += canSend;
        }
      }

      if (plannedToday > 0 || dayIdx === 1) {
        daySchedule.push({
          dayIndex: dayIdx,
          windowStartIso: new Date(windowStartMs).toISOString(),
          plannedTotal: plannedToday,
          perAccount: dayPerAccount,
          perDomain: dayPerDomain
        });
      }
      // If even a fresh full-capacity day (dayIdx >= 2) yields 0 progress, break cleanly (blocked/zero cap)
      if (dayIdx >= 2 && plannedToday === 0) break;
    }
  }

  const activeDays = daySchedule.filter(d => d.plannedTotal > 0);
  const estimatedDays = activeDays.length > 0 ? daySchedule[daySchedule.length - 1].dayIndex : 0;

  return {
    totalPending,
    estimatedDays,
    requiresMultiDay: estimatedDays > 1,
    unscheduledRemainder: Object.values(remPendingByAcct).reduce((a, b) => a + b, 0),
    nextPermittedExecutionAt: earliestNextPermittedMs !== null ? new Date(earliestNextPermittedMs).toISOString() : null,
    waitReason: earliestWaitReason,
    daySchedule,
    perAccountPlan
  };
}

/**
 * Real / injectable DNS TXT verification for Workspace domains & honest disclosure for consumer gmail.com.
 */
async function resolveTxtSafe(hostname, dnsResolver = null) {
  try {
    if (typeof dnsResolver === 'function') {
      const res = await dnsResolver(hostname);
      return Array.isArray(res) ? res.map(r => (Array.isArray(r) ? r.join('') : String(r || ''))) : [];
    }
    const records = await dns.promises.resolveTxt(hostname);
    return records.map(parts => (Array.isArray(parts) ? parts.join('') : String(parts || '')));
  } catch (err) {
    return { error: err?.code || err?.message || 'DNS_LOOKUP_FAILED', records: [] };
  }
}

async function assessDeliverabilityHygiene({
  accounts = [],
  selectedAccountIds = [],
  fromAddress = null,
  replyTo = null,
  physicalAddress = '',
  publicUnsubBase = '',
  supStats = null,
  dnsResolver = null
} = {}) {
  const checkedAt = new Date().toISOString();
  const blockers = [];
  const warnings = [];
  const domainChecks = [];

  const targetAccounts = selectedAccountIds.length
    ? accounts.filter(a => selectedAccountIds.includes(a.id))
    : accounts;

  const uniqueDomains = Array.from(new Set(
    targetAccounts.map(a => String(a.domain || '').toLowerCase()).filter(Boolean)
  ));
  if (fromAddress) {
    const fd = emailDomain(fromAddress);
    if (fd && !uniqueDomains.includes(fd)) uniqueDomains.push(fd);
  }

  for (const dom of uniqueDomains) {
    if (dom === 'gmail.com' || dom === 'googlemail.com') {
      domainChecks.push({
        domain: dom,
        domainType: 'CONSUMER_GMAIL',
        spf: { status: 'PROVIDER_MANAGED', detail: 'Google이 @gmail.com SPF를 관리합니다.' },
        dkim: { status: 'PROVIDER_MANAGED', detail: 'Google이 @gmail.com DKIM 서명을 관리합니다.' },
        dmarc: { status: 'PROVIDER_MANAGED', detail: '소비자 @gmail.com 도메인은 사용자 지정 DMARC 정책 소유권이 없으므로 소량·보수적 상한만 권장됩니다.' }
      });
      warnings.push({
        code: 'CONSUMER_GMAIL_DOMAIN_LIMITATIONS',
        domain: dom,
        message: '소비자 @gmail.com 계정은 맞춤 도메인 SPF/DKIM/DMARC 소유권이 없으며 공급자 평판 민감도가 높습니다. 소량·사전 승인 수신자에게만 보수적 상한으로 사용하세요.'
      });
      continue;
    }

    // Custom Google Workspace domain -> check real/mockable DNS TXT records
    const spfRes = await resolveTxtSafe(dom, dnsResolver);
    const spfRecords = Array.isArray(spfRes) ? spfRes : [];
    const spfTxt = spfRecords.find(r => /^v=spf1\b/i.test(r.trim())) || null;
    const spfHasGoogle = Boolean(spfTxt && /include:_spf\.google\.com/i.test(spfTxt));

    const dmarcRes = await resolveTxtSafe(`_dmarc.${dom}`, dnsResolver);
    const dmarcRecords = Array.isArray(dmarcRes) ? dmarcRes : [];
    const dmarcTxt = dmarcRecords.find(r => /^v=DMARC1\b/i.test(r.trim())) || null;
    const dmarcPolicyMatch = dmarcTxt ? dmarcTxt.match(/\bp=([a-z]+)/i) : null;
    const dmarcPolicy = dmarcPolicyMatch ? dmarcPolicyMatch[1].toLowerCase() : null;

    const dkimRes = await resolveTxtSafe(`google._domainkey.${dom}`, dnsResolver);
    const dkimRecords = Array.isArray(dkimRes) ? dkimRes : [];
    const dkimTxt = dkimRecords.find(r => /v=DKIM1|k=rsa|p=[A-Za-z0-9+/=]{16,}/i.test(r)) || null;

    const spfStatus = !Array.isArray(spfRes)
      ? 'DNS_UNAVAILABLE'
      : (!spfTxt ? 'MISSING' : (spfHasGoogle ? 'PASS' : 'WARN_NO_GOOGLE_INCLUDE'));
    const dmarcStatus = !Array.isArray(dmarcRes)
      ? 'DNS_UNAVAILABLE'
      : (!dmarcTxt ? 'MISSING' : (dmarcPolicy === 'reject' || dmarcPolicy === 'quarantine' ? 'PASS' : 'WARN_POLICY_NONE'));
    const dkimStatus = !Array.isArray(dkimRes)
      ? 'SELECTOR_UNVERIFIED_DNS'
      : (dkimTxt ? 'PASS_GOOGLE_SELECTOR' : 'SELECTOR_UNVERIFIED');

    if (spfStatus === 'MISSING') {
      blockers.push({ code: 'WORKSPACE_SPF_MISSING', domain: dom, message: `${dom} 도메인에 SPF(v=spf1) TXT 레코드가 없습니다.` });
    } else if (spfStatus === 'WARN_NO_GOOGLE_INCLUDE') {
      warnings.push({ code: 'WORKSPACE_SPF_NO_GOOGLE_INCLUDE', domain: dom, message: `${dom} SPF 레코드에 include:_spf.google.com이 확인되지 않았습니다.` });
    } else if (spfStatus === 'DNS_UNAVAILABLE') {
      warnings.push({ code: 'WORKSPACE_SPF_DNS_LOOKUP_FAILED', domain: dom, message: `${dom} SPF DNS 조회에 실패했습니다(${spfRes.error}).` });
    }

    if (dmarcStatus === 'MISSING') {
      blockers.push({ code: 'WORKSPACE_DMARC_MISSING', domain: dom, message: `_dmarc.${dom}에 DMARC(v=DMARC1) 레코드가 없습니다.` });
    } else if (dmarcStatus === 'WARN_POLICY_NONE') {
      warnings.push({ code: 'WORKSPACE_DMARC_POLICY_NONE', domain: dom, message: `_dmarc.${dom} 정책이 p=${dmarcPolicy || 'none'}입니다. p=quarantine 또는 p=reject 전환을 권장합니다.` });
    } else if (dmarcStatus === 'DNS_UNAVAILABLE') {
      warnings.push({ code: 'WORKSPACE_DMARC_DNS_LOOKUP_FAILED', domain: dom, message: `_dmarc.${dom} DNS 조회에 실패했습니다(${dmarcRes.error}).` });
    }

    if (dkimStatus !== 'PASS_GOOGLE_SELECTOR') {
      warnings.push({
        code: 'WORKSPACE_DKIM_VERIFY_IN_ADMIN_CONSOLE',
        domain: dom,
        message: `google._domainkey.${dom} 기본 셀렉터가 확인되지 않았습니다(커스텀 셀렉터 사용 시 Google Workspace 관리 콘솔에서 DKIM 활성 상태를 확인하세요).`
      });
    }

    domainChecks.push({
      domain: dom,
      domainType: 'WORKSPACE_CUSTOM_DOMAIN',
      spf: { status: spfStatus, record: spfTxt ? spfTxt.slice(0, 180) : null, includesGoogle: spfHasGoogle },
      dmarc: { status: dmarcStatus, policy: dmarcPolicy, record: dmarcTxt ? dmarcTxt.slice(0, 180) : null },
      dkim: { status: dkimStatus, selectorChecked: 'google._domainkey' }
    });
  }

  // From & Reply-To alignment and injection guard
  const replyToCheck = { configured: false, valid: true, aligned: true, maskedReplyTo: null, reason: null };
  if (replyTo !== null && replyTo !== undefined && String(replyTo).trim() !== '') {
    replyToCheck.configured = true;
    const rawRt = String(replyTo);
    const normRt = normalizeEmail(rawRt);
    if (hasHeaderInjection(rawRt) || !normRt) {
      replyToCheck.valid = false;
      replyToCheck.aligned = false;
      replyToCheck.reason = 'REPLY_TO_INVALID_OR_INJECTION';
      blockers.push({ code: 'REPLY_TO_INVALID_OR_INJECTION', message: 'Reply-To 주소 형식이 잘못되었거나 헤더 인젝션 문자가 포함되었습니다.' });
    } else {
      replyToCheck.maskedReplyTo = maskEmail(normRt);
      const rtDom = emailDomain(normRt);
      if (uniqueDomains.length > 0 && !uniqueDomains.includes(rtDom)) {
        replyToCheck.aligned = false;
        replyToCheck.reason = 'REPLY_TO_DOMAIN_MISMATCH';
        warnings.push({
          code: 'REPLY_TO_DOMAIN_MISMATCH',
          message: `Reply-To 도메인(${rtDom})이 발신 계정 도메인(${uniqueDomains.join(', ')})과 다릅니다. 수신 신뢰도를 위해 동일 도메인 정렬을 권장합니다.`
        });
      }
    }
  }

  // RFC 8058 One-Click Unsubscribe & Physical Address check
  let unsubHostOk = false;
  try {
    const u = new URL(String(publicUnsubBase || '').trim());
    unsubHostOk = u.protocol === 'https:' && u.hostname.toLowerCase() === PUBLIC_UNSUB_HOST;
  } catch (_) {}
  if (!unsubHostOk) {
    blockers.push({
      code: 'PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED',
      message: `RFC 8058 One-Click 수신거부 공개 HTTPS 엔드포인트(https://${PUBLIC_UNSUB_HOST})가 구성되어 있지 않습니다.`
    });
  }

  const hasPhysicalAddress = String(physicalAddress || '').trim().length >= 6;
  if (!hasPhysicalAddress) {
    warnings.push({
      code: 'PHYSICAL_ADDRESS_MISSING',
      message: '이메일 푸터에 기재할 법적 물리적 주소가 비어 있습니다. 상업·공지 발송 전 발신자 주소를 입력해 주세요.'
    });
  }

  // Global suppression & historical bounce/complaint check
  const complaints = Number(supStats?.historicalComplained || 0);
  const bouncePct = Number(supStats?.historicalBounceRatePct || 0);
  if (complaints > 0) {
    warnings.push({
      code: 'HISTORICAL_COMPLAINTS_PRESENT',
      message: `과거 발송 이력에 스팸 신고(${complaints}건)가 존재합니다. 신고 주소는 교차 공급자 차단 원장에 의해 자동 영구 제외됩니다.`
    });
  }
  if (supStats?.elevatedBounceWarning) {
    warnings.push({
      code: 'ELEVATED_HISTORICAL_BOUNCE_RATE',
      message: `과거 반송률(${bouncePct}%)이 높습니다. 반송·수신거부 주소는 자동 제외되며, 발송 속도는 하향 전용으로 보수 제한됩니다.`
    });
  }

  const status = blockers.length > 0 ? 'BLOCKED' : (warnings.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS');

  return {
    ok: blockers.length === 0,
    status,
    checkedAt,
    blockers,
    warnings,
    domainChecks,
    replyToCheck,
    unsubscribeCheck: {
      rfc8058OneClick: unsubHostOk,
      visibleFooterLinkEnforced: true,
      host: unsubHostOk ? PUBLIC_UNSUB_HOST : null
    },
    physicalAddressPresent: hasPhysicalAddress,
    crossProviderSuppressionMerged: true,
    mergedSuppressedCount: Number(supStats?.mergedHashSuppressedCount || 0),
    honestDisclosure: HONEST_DELIVERY_DISCLAIMER
  };
}

/**
 * True Observable Dashboard builder.
 * Never invents delivery/inbox metrics for Gmail API sends.
 */
function buildTrueDashboard({
  queue = {},
  vault,
  supIndex = null,
  throttle = null,
  schedulePlan = null,
  deliverabilityHygiene = null,
  queueRunning = false,
  lastRunResult = null
} = {}) {
  const entries = Array.isArray(queue.entries) ? queue.entries : [];
  let pending = 0;
  let sending = 0;
  let gmailApiAccepted = 0;
  let alreadySent = 0;
  let suppressedInQueue = 0;
  let noConsent = 0;
  let haltedUnknown = 0;
  let attempted = 0;
  let queueObservedBounced = 0;
  let queueObservedComplained = 0;

  for (const e of entries) {
    if (!e) continue;
    if ((e.attempts || 0) > 0) attempted++;
    switch (e.status) {
      case 'PENDING': pending++; break;
      case 'SENDING': sending++; break;
      case 'GMAIL_API_ACCEPTED': gmailApiAccepted++; break;
      case 'ALREADY_SENT_IDEMPOTENT': alreadySent++; break;
      case 'SKIPPED_SUPPRESSED_CROSS_PROVIDER': suppressedInQueue++; break;
      case 'SKIPPED_NO_CONSENT':
      case 'BLOCKED_CONSENT_UNVERIFIED': noConsent++; break;
      case 'HALTED_RECONCILE_REQUIRED': haltedUnknown++; break;
      case 'BOUNCED': queueObservedBounced++; break;
      case 'COMPLAINED': queueObservedComplained++; break;
      default: break;
    }
  }

  const throttleSnap = throttle instanceof AdaptiveThrottleController
    ? throttle.toJSON()
    : (throttle || new AdaptiveThrottleController().toJSON());

  const stopReason = queue.stopReason || null;
  const scheduledWaitReason = queue.scheduledWaitReason || null;
  const isEnforcementStop = Boolean(
    queue.enforcementPaused ||
    throttleSnap.shouldStop ||
    (stopReason && /^(GMAIL_AUTH_REVOKED|GMAIL_PROVIDER_LIMIT_OR_POLICY_PAUSE_ALL|COMPLAINT_THRESHOLD_EXCEEDED|ABNORMAL_BOUNCE_RATE_STOP|PROVIDER_ABUSE_WARNING|PROVIDER_ENFORCEMENT_HTTP_)/.test(stopReason))
  );

  let state = 'IDLE';
  if (queueRunning) state = 'RUNNING';
  else if (haltedUnknown > 0 || stopReason === 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY') state = 'HALTED_RECONCILE_REQUIRED';
  else if (isEnforcementStop) state = 'PAUSED_ENFORCEMENT';
  else if (queue.scheduledWait && pending > 0) state = 'SCHEDULED_WAIT';
  else if (queue.stopped && pending > 0) state = 'PAUSED_OWNER';
  else if (entries.length > 0 && pending === 0 && (gmailApiAccepted > 0 || alreadySent > 0)) state = 'COMPLETED';
  else if (pending > 0) state = 'READY';

  const nextPermittedExecutionAt = (state === 'PAUSED_ENFORCEMENT' || state === 'HALTED_RECONCILE_REQUIRED' || pending === 0)
    ? null
    : (queue.nextPermittedExecutionAt || (schedulePlan ? schedulePlan.nextPermittedExecutionAt : null));

  const scheduled = pending + sending + gmailApiAccepted + haltedUnknown + alreadySent;

  return {
    provider: 'GMAIL',
    campaignId: queue.campaignId || 'default',
    sendingMode: queue.sendingMode || 'SINGLE_ACCOUNT',
    scheduleMode: queue.scheduleMode || 'DISTRIBUTED_MULTI_DAY',
    state,
    queueRunning: Boolean(queueRunning),
    metrics: {
      totalImported: entries.length,
      scheduled,
      attempted,
      gmailApiAccepted,
      verifiedDelivered: null,
      verifiedDeliveredStatus: 'UNAVAILABLE_FOR_GMAIL_API',
      verifiedInbox: null,
      verifiedInboxStatus: 'UNAVAILABLE_FOR_GMAIL_API',
      verifiedPrimary: null,
      verifiedPrimaryStatus: 'UNAVAILABLE_FOR_GMAIL_API',
      bounced: queueObservedBounced,
      historicalCrossProviderBounced: Number(supIndex?.stats?.historicalBounced || 0),
      complained: queueObservedComplained,
      historicalCrossProviderComplained: Number(supIndex?.stats?.historicalComplained || 0),
      suppressed: suppressedInQueue,
      globalCrossProviderSuppressed: Number(supIndex?.stats?.mergedHashSuppressedCount || 0),
      noConsent,
      alreadySentIdempotent: alreadySent,
      unknown: haltedUnknown + sending,
      remaining: pending
    },
    throttle: throttleSnap,
    nextPermittedExecutionAt,
    waitReason: state === 'SCHEDULED_WAIT' ? (scheduledWaitReason || (schedulePlan ? schedulePlan.waitReason : null)) : null,
    enforcementStopReason: state === 'PAUSED_ENFORCEMENT' ? (stopReason || throttleSnap.stopReason) : null,
    stopReason,
    schedulePlan: schedulePlan ? {
      estimatedDays: schedulePlan.estimatedDays,
      requiresMultiDay: schedulePlan.requiresMultiDay,
      unscheduledRemainder: schedulePlan.unscheduledRemainder,
      daySchedule: schedulePlan.daySchedule
    } : null,
    perAccount: schedulePlan ? schedulePlan.perAccountPlan : (vault ? vault.listAccountsSafe() : []),
    deliverabilityHygiene: deliverabilityHygiene || null,
    lastRunStatus: lastRunResult ? lastRunResult.status : null,
    metricSemantics: {
      gmailApiAccepted: 'GMAIL_API_ACCEPTED (Google API HTTP 200 접수만 의미 · 전달/수신함/Primary 추론 금지)',
      delivery: 'DELIVERY_UNKNOWN (Gmail API는 최종 전달 확인 미제공)',
      primaryPlacement: 'PRIMARY_UNKNOWN (타 수신자 기본 받은편지함 배치 미검증 · 1~2회 본인 테스트로 일반화 금지)',
      ownerObservedCategories: ['OWNER_OBSERVED_INBOX_PROMOTIONS', 'OWNER_OBSERVED_SPAM', 'BOUNCED', 'DELIVERY_UNKNOWN', 'PRIMARY_UNKNOWN']
    },
    honestDeliveryDisclaimer: HONEST_DELIVERY_DISCLAIMER
  };
}

module.exports = {
  AdaptiveThrottleController,
  THROTTLE_LEVELS,
  DEFAULT_THROTTLE_CONFIG,
  HONEST_DELIVERY_DISCLAIMER,
  buildDistributedSchedulePlan,
  assessDeliverabilityHygiene,
  buildTrueDashboard,
  hasHeaderInjection
};
