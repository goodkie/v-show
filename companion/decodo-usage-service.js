'use strict';
/**
 * XPIDER Decodo Public API Read-Only Usage & Remaining Traffic Service
 * - Strictly read-only: NEVER modifies subscriptions, orders traffic, or creates/edits sub-users.
 * - Separate DPAPI-encrypted management API key (distinct from proxy CONNECT credentials).
 * - Truthful normalization: NEVER fabricates totals, NEVER shows stale numbers as live,
 *   NEVER labels TRAFFIC_EXHAUSTED unless proved by authoritative provider data.
 */
const fs = require('node:fs');
const path = require('node:path');
const winsec = require('./winsec');

const DECODO_API_BASE = 'https://api.decodo.com';
const DECODO_DASHBOARD_URL = 'https://dashboard.decodo.com/';
const DEFAULT_CACHE_TTL_MS = 60000;
const DEFAULT_REFRESH_COOLDOWN_MS = 10000;
const DEFAULT_TIMEOUT_MS = 10000;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

function toGb(value, unitHint = 'gb') {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  const u = String(unitHint || 'gb').trim().toLowerCase();
  if (u === 'b' || u === 'byte' || u === 'bytes') return num / (1024 * 1024 * 1024);
  if (u === 'kb') return num / (1024 * 1024);
  if (u === 'mb') return num / 1024;
  if (u === 'tb') return num * 1024;
  return num; // gb
}

function parseExplicitFieldGb(obj, specs) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, unit] of specs) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      const gb = toGb(obj[key], unit);
      if (gb !== null) return gb;
    }
  }
  return null;
}

function normalizeScope(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (s === 'ACCOUNT' || s === 'ACCOUNT_WIDE' || s === 'SUBSCRIPTION') return 'ACCOUNT_WIDE';
  if (s === 'SUB_USER' || s === 'SUBUSER') return 'SUB_USER';
  if (s === 'SESSION' || s === 'PER_SESSION') return 'SESSION';
  return 'UNKNOWN';
}

function selectResidentialSubscription(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const list = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload.subscriptions)
      ? payload.subscriptions
      : (Array.isArray(payload.data) ? payload.data : null));
  if (list) {
    if (list.length === 0) return null;
    const resMatch = list.find(item =>
      item && typeof item === 'object' &&
      /residential/i.test(String(item.product || item.proxy_type || item.plan_type || item.name || item.type || ''))
    );
    return resMatch || list[0];
  }
  if (payload.subscription && typeof payload.subscription === 'object') {
    return payload.subscription;
  }
  return payload;
}

function normalizeDecodoUsagePayload(rawPayload, { nowMs = Date.now(), statsPayload = null } = {}) {
  const nowIso = new Date(nowMs).toISOString();
  const baseMeta = {
    source: 'Decodo API',
    dashboardUrl: DECODO_DASHBOARD_URL,
    lastUpdatedAt: nowIso,
    isLive: false,
    exhaustedProved: false
  };

  if (!rawPayload || typeof rawPayload !== 'object') {
    return {
      ...baseMeta,
      status: 'USAGE_UNAVAILABLE',
      reasonCode: 'INVALID_PROVIDER_SCHEMA',
      koreanReason: 'Decodo API 응답 형식이 예상 스키마와 달라 잔여 트래픽을 확인할 수 없습니다.'
    };
  }

  const sub = selectResidentialSubscription(rawPayload);
  if (!sub || typeof sub !== 'object') {
    return {
      ...baseMeta,
      status: 'USAGE_UNAVAILABLE',
      reasonCode: 'NO_ACTIVE_SUBSCRIPTION',
      koreanReason: 'Decodo API에서 확인 가능한 주거용 프록시 구독 정보를 찾지 못했습니다.'
    };
  }

  const billingRaw = String(sub.billing_type || sub.plan_type || sub.pricing_model || '').trim().toLowerCase();
  const isPayg = /pay[_ -]?as[_ -]?you[_ -]?go|payg|postpaid|unlimited/i.test(billingRaw) || sub.is_pay_as_you_go === true;
  if (isPayg) {
    return {
      ...baseMeta,
      status: 'USAGE_UNAVAILABLE',
      reasonCode: 'PAY_AS_YOU_GO_UNSUPPORTED',
      billingType: 'PAY_AS_YOU_GO',
      planName: sub.plan_name || sub.name || 'Pay-As-You-Go',
      scope: normalizeScope(sub.scope || (sub.sub_user_id ? 'SUB_USER' : 'ACCOUNT_WIDE')),
      koreanReason: '종량제(Pay-As-You-Go) 또는 고정 한도 미제공 플랜은 잔여 GB를 임의로 산출할 수 없습니다. Decodo 대시보드에서 확인하세요.'
    };
  }

  if (sub.rollover_ambiguous === true || sub.ambiguous_rollover === true) {
    return {
      ...baseMeta,
      status: 'USAGE_UNAVAILABLE',
      reasonCode: 'AMBIGUOUS_ROLLOVER_ALLOCATION',
      planName: sub.plan_name || sub.name || null,
      scope: normalizeScope(sub.scope || 'ACCOUNT_WIDE'),
      koreanReason: '이월(Rollover) 또는 애드온 트래픽 합산 기준이 불명확하여 총량을 임의로 계산하지 않았습니다. Decodo 대시보드에서 확인하세요.'
    };
  }

  const unitHint = sub.traffic_unit || sub.unit || 'gb';
  const planGb = parseExplicitFieldGb(sub, [
    ['traffic_limit_gb', 'gb'],
    ['plan_traffic_gb', 'gb'],
    ['allocated_gb', 'gb'],
    ['traffic_limit_mb', 'mb'],
    ['traffic_limit_bytes', 'bytes'],
    ['allocated_bytes', 'bytes'],
    ['traffic_limit', unitHint],
    ['trafficLimit', unitHint],
    ['total_gb', 'gb'],
    ['quota_gb', 'gb']
  ]);

  let usedGb = parseExplicitFieldGb(sub, [
    ['traffic_used_gb', 'gb'],
    ['used_traffic_gb', 'gb'],
    ['used_gb', 'gb'],
    ['consumed_gb', 'gb'],
    ['traffic_used_mb', 'mb'],
    ['traffic_used_bytes', 'bytes'],
    ['used_bytes', 'bytes'],
    ['consumed_bytes', 'bytes'],
    ['traffic_used', unitHint],
    ['trafficUsed', unitHint],
    ['traffic', unitHint]
  ]);

  if (usedGb === null && statsPayload && typeof statsPayload === 'object') {
    const statsObj = statsPayload.summary || statsPayload.data || statsPayload;
    usedGb = parseExplicitFieldGb(statsObj, [
      ['total_gb', 'gb'],
      ['traffic_gb', 'gb'],
      ['used_gb', 'gb'],
      ['total_bytes', 'bytes'],
      ['traffic_bytes', 'bytes'],
      ['bytes', 'bytes']
    ]);
  }

  let remainingGb = parseExplicitFieldGb(sub, [
    ['traffic_remaining_gb', 'gb'],
    ['remaining_traffic_gb', 'gb'],
    ['remaining_gb', 'gb'],
    ['traffic_left_gb', 'gb'],
    ['traffic_remaining_mb', 'mb'],
    ['traffic_remaining_bytes', 'bytes'],
    ['remaining_bytes', 'bytes'],
    ['traffic_remaining', unitHint],
    ['trafficRemaining', unitHint]
  ]);

  // Compute remaining ONLY when exact matching plan allocation and consumed period values are present
  if (remainingGb === null && planGb !== null && usedGb !== null) {
    remainingGb = Math.max(0, planGb - usedGb);
  }
  if (usedGb === null && planGb !== null && remainingGb !== null) {
    usedGb = Math.max(0, planGb - remainingGb);
  }

  if (planGb === null || planGb <= 0 || usedGb === null || remainingGb === null) {
    return {
      ...baseMeta,
      status: 'USAGE_UNAVAILABLE',
      reasonCode: 'MISSING_ALLOCATION_OR_USAGE',
      planName: sub.plan_name || sub.name || null,
      scope: normalizeScope(sub.scope || (sub.sub_user_id ? 'SUB_USER' : 'UNKNOWN')),
      koreanReason: 'Decodo API 응답에 플랜 할당량 또는 사용량 필드가 누락되어 잔여 트래픽을 계산할 수 없습니다.'
    };
  }

  const expiresAt = sub.expires_at || sub.valid_until || sub.period_end || sub.end_date || null;
  const resetAt = sub.reset_at || sub.next_reset_at || sub.renewal_at || null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const isExpired = (String(sub.status || '').toLowerCase() === 'expired') || (Number.isFinite(expiresMs) && expiresMs < nowMs);

  const scope = normalizeScope(sub.scope || (sub.sub_user_id || sub.subUserId ? 'SUB_USER' : 'ACCOUNT_WIDE'));
  const planTrafficGb = round2(planGb);
  const usedTrafficGb = round2(Math.min(usedGb, Math.max(planGb, usedGb)));
  const remainingTrafficGb = round2(Math.max(0, Math.min(remainingGb, planGb)));
  const remainingPct = round1(Math.max(0, Math.min(100, (remainingTrafficGb / planTrafficGb) * 100)));
  const usedPct = round1(Math.max(0, Math.min(100, (usedTrafficGb / planTrafficGb) * 100)));

  const rolloverNotes = [];
  if (sub.rollover_gb !== undefined && sub.rollover_gb !== null) {
    rolloverNotes.push(`이월 포함(${round2(sub.rollover_gb)} GB)`);
  }
  if (sub.addon_gb !== undefined && sub.addon_gb !== null) {
    rolloverNotes.push(`애드온 포함(${round2(sub.addon_gb)} GB)`);
  }
  if (scope === 'SUB_USER') {
    rolloverNotes.push('서브유저 할당 기준(계정 전체와 다를 수 있음)');
  } else if (scope === 'ACCOUNT_WIDE') {
    rolloverNotes.push('계정 전체 플랜 기준');
  }

  if (isExpired) {
    return {
      ...baseMeta,
      status: 'PLAN_EXPIRED',
      reasonCode: 'SUBSCRIPTION_EXPIRED',
      isLive: true,
      exhaustedProved: remainingTrafficGb <= 0,
      planName: sub.plan_name || sub.name || 'Residential Plan',
      billingType: 'SUBSCRIPTION',
      scope,
      planTrafficGb,
      usedTrafficGb,
      remainingTrafficGb,
      remainingPct,
      usedPct,
      expiresAt,
      resetAt,
      rolloverNote: rolloverNotes.join(' · ') || null,
      koreanReason: `Decodo 플랜 유효기간이 만료되었습니다 (${expiresAt || 'EXPIRED'}).`
    };
  }

  if (remainingTrafficGb <= 0) {
    return {
      ...baseMeta,
      status: 'TRAFFIC_EXHAUSTED',
      reasonCode: 'PLAN_TRAFFIC_EXHAUSTED',
      isLive: true,
      exhaustedProved: true,
      planName: sub.plan_name || sub.name || 'Residential Plan',
      billingType: 'SUBSCRIPTION',
      scope,
      planTrafficGb,
      usedTrafficGb,
      remainingTrafficGb: 0,
      remainingPct: 0,
      usedPct: 100,
      expiresAt,
      resetAt,
      rolloverNote: rolloverNotes.join(' · ') || null,
      koreanReason: `Decodo API 기준 잔여 트래픽이 0.00 GB입니다 (${planTrafficGb.toFixed(2)} GB 중 ${usedTrafficGb.toFixed(2)} GB 사용). 트래픽 충전 또는 Residential OFF 전환이 필요합니다.`
    };
  }

  return {
    ...baseMeta,
    status: 'AVAILABLE',
    reasonCode: 'OK',
    isLive: true,
    exhaustedProved: false,
    planName: sub.plan_name || sub.name || 'Residential Plan',
    billingType: 'SUBSCRIPTION',
    scope,
    planTrafficGb,
    usedTrafficGb,
    remainingTrafficGb,
    remainingPct,
    usedPct,
    expiresAt,
    resetAt,
    rolloverNote: rolloverNotes.join(' · ') || null,
    koreanReason: `Decodo API 실시간 확인: ${planTrafficGb.toFixed(2)} GB 중 ${remainingTrafficGb.toFixed(2)} GB 남음 (${remainingPct.toFixed(1)}%).`
  };
}

class DecodoUsageService {
  constructor(options = {}) {
    this.stateDir = options.stateDir || __dirname;
    this.apiKeyFile = path.join(this.stateDir, '.decodo_api_key.dpapi');
    this.apiBase = String(options.apiBase || DECODO_API_BASE).replace(/\/+$/, '');
    this.cacheTtlMs = Number(options.cacheTtlMs || DEFAULT_CACHE_TTL_MS);
    this.refreshCooldownMs = Number(options.refreshCooldownMs ?? DEFAULT_REFRESH_COOLDOWN_MS);
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl || null;
    this._cache = null;
    this._cacheFetchedAtMs = 0;
    this._lastManualRefreshMs = 0;
    this._lastSuccessAt = null;
  }

  hasApiKey() {
    try {
      if (!fs.existsSync(this.apiKeyFile)) return false;
      const raw = fs.readFileSync(this.apiKeyFile, 'utf8').trim();
      return raw.length > 0;
    } catch (_) {
      return false;
    }
  }

  _loadDecryptedApiKey() {
    if (!fs.existsSync(this.apiKeyFile)) return null;
    const raw = fs.readFileSync(this.apiKeyFile, 'utf8').trim();
    if (!raw) return null;
    if (raw.startsWith('dpapi:')) {
      return winsec.decrypt(raw);
    }
    return raw;
  }

  saveApiKey(rawKey) {
    const trimmed = String(rawKey || '').trim();
    if (!trimmed || trimmed.length < 12 || /\s/.test(trimmed)) {
      throw new Error('INVALID_DECODO_API_KEY_FORMAT');
    }
    fs.mkdirSync(this.stateDir, { recursive: true });
    const stored = trimmed.startsWith('dpapi:') ? trimmed : winsec.encrypt(trimmed);
    const tmp = `${this.apiKeyFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, stored + '\n', { mode: 0o600 });
    fs.renameSync(tmp, this.apiKeyFile);
    this._cache = null;
    this._cacheFetchedAtMs = 0;
    return { ok: true, hasApiKey: true, storage: stored.startsWith('dpapi:') ? 'WINDOWS_DPAPI' : 'LOCAL_PROTECTED_FILE' };
  }

  deleteApiKey() {
    try {
      if (fs.existsSync(this.apiKeyFile)) fs.unlinkSync(this.apiKeyFile);
    } catch (_) {}
    this._cache = null;
    this._cacheFetchedAtMs = 0;
    return { ok: true, hasApiKey: false };
  }

  getCachedSnapshot() {
    if (!this.hasApiKey()) {
      return {
        status: 'API_KEY_NOT_CONFIGURED',
        reasonCode: 'API_KEY_NOT_CONFIGURED',
        hasApiKey: false,
        isLive: false,
        exhaustedProved: false,
        source: 'Decodo API',
        dashboardUrl: DECODO_DASHBOARD_URL,
        lastUpdatedAt: null,
        lastSuccessAt: this._lastSuccessAt,
        koreanReason: 'Decodo Public API 키가 등록되지 않았습니다 (프록시 접속 계정과 별도의 관리 API 키 필요). 대시보드에서 키를 발급·등록하거나 직접 확인하세요.'
      };
    }
    const now = Date.now();
    if (this._cache && (now - this._cacheFetchedAtMs) <= this.cacheTtlMs) {
      return {
        ...this._cache,
        hasApiKey: true,
        cached: true,
        lastSuccessAt: this._lastSuccessAt
      };
    }
    return {
      status: 'UNKNOWN',
      reasonCode: this._cache ? 'CACHE_STALE_REFRESH_REQUIRED' : 'NOT_QUERIED_YET',
      hasApiKey: true,
      isLive: false,
      stale: Boolean(this._cache),
      exhaustedProved: false,
      source: 'Decodo API',
      dashboardUrl: DECODO_DASHBOARD_URL,
      lastUpdatedAt: null,
      lastSuccessAt: this._lastSuccessAt,
      koreanReason: this._cache
        ? '최근 조회 캐시가 만료되었습니다. [잔여 트래픽 조회]를 눌러 최신 값을 확인하세요 (오래된 수치는 실시간으로 표시하지 않음).'
        : '아직 Decodo API를 조회하지 않았습니다. [잔여 트래픽 조회] 버튼을 눌러 확인하세요.'
    };
  }

  async fetchUsage({ forceRefresh = false, bypassCooldown = false, fetchImpl = null, nowMs = Date.now() } = {}) {
    if (!this.hasApiKey()) {
      return this.getCachedSnapshot();
    }

    if (!forceRefresh && this._cache && (nowMs - this._cacheFetchedAtMs) <= this.cacheTtlMs) {
      return {
        ...this._cache,
        hasApiKey: true,
        cached: true,
        lastSuccessAt: this._lastSuccessAt
      };
    }

    if (forceRefresh && !bypassCooldown && this._lastManualRefreshMs > 0 && (nowMs - this._lastManualRefreshMs) < this.refreshCooldownMs && this._cache && (nowMs - this._cacheFetchedAtMs) <= this.cacheTtlMs) {
      return {
        ...this._cache,
        hasApiKey: true,
        cached: true,
        cooldownActive: true,
        lastSuccessAt: this._lastSuccessAt
      };
    }

    let apiKey;
    try {
      apiKey = this._loadDecryptedApiKey();
    } catch (_) {
      return {
        status: 'USAGE_UNAVAILABLE',
        reasonCode: 'DPAPI_DECRYPT_FAILED',
        hasApiKey: true,
        isLive: false,
        exhaustedProved: false,
        source: 'Decodo API',
        dashboardUrl: DECODO_DASHBOARD_URL,
        lastUpdatedAt: new Date(nowMs).toISOString(),
        lastSuccessAt: this._lastSuccessAt,
        koreanReason: '저장된 Decodo API 키를 복호화할 수 없습니다. 키를 다시 등록해 주세요.'
      };
    }

    if (!apiKey) {
      return this.getCachedSnapshot();
    }

    const doFetch = typeof fetchImpl === 'function' ? fetchImpl : (typeof this.fetchImpl === 'function' ? this.fetchImpl : globalThis.fetch);
    if (typeof doFetch !== 'function') {
      return {
        status: 'USAGE_UNAVAILABLE',
        reasonCode: 'FETCH_UNAVAILABLE',
        hasApiKey: true,
        isLive: false,
        exhaustedProved: false,
        source: 'Decodo API',
        dashboardUrl: DECODO_DASHBOARD_URL,
        lastUpdatedAt: new Date(nowMs).toISOString(),
        lastSuccessAt: this._lastSuccessAt,
        koreanReason: 'HTTP 클라이언트를 사용할 수 없어 Decodo API를 조회하지 못했습니다.'
      };
    }

    if (forceRefresh) this._lastManualRefreshMs = nowMs;

    try {
      const headers = {
        'Authorization': apiKey,
        'Accept': 'application/json'
      };
      const fetchOpts = {
        method: 'GET',
        headers,
        ...(typeof fetchImpl !== 'function' && typeof this.fetchImpl !== 'function' && typeof AbortSignal?.timeout === 'function'
          ? { signal: AbortSignal.timeout(this.timeoutMs) }
          : {})
      };

      const resp = await doFetch(`${this.apiBase}/v2/subscriptions`, fetchOpts);
      if (!resp) {
        throw new Error('EMPTY_RESPONSE');
      }
      if (resp.status === 401 || resp.status === 403) {
        return {
          status: 'AUTH_INVALID',
          reasonCode: `DECODO_API_HTTP_${resp.status}`,
          httpStatus: resp.status,
          hasApiKey: true,
          isLive: false,
          stale: Boolean(this._lastSuccessAt),
          exhaustedProved: false,
          source: 'Decodo API',
          dashboardUrl: DECODO_DASHBOARD_URL,
          lastUpdatedAt: new Date(nowMs).toISOString(),
          lastSuccessAt: this._lastSuccessAt,
          koreanReason: `Decodo Public API 인증 실패 또는 조회 권한이 없습니다 (HTTP ${resp.status}). 대시보드에서 API 키 권한을 확인하세요.`
        };
      }
      if (resp.status === 429) {
        return {
          status: 'RATE_LIMITED',
          reasonCode: 'DECODO_API_HTTP_429',
          httpStatus: 429,
          hasApiKey: true,
          isLive: false,
          stale: Boolean(this._lastSuccessAt),
          exhaustedProved: false,
          source: 'Decodo API',
          dashboardUrl: DECODO_DASHBOARD_URL,
          lastUpdatedAt: new Date(nowMs).toISOString(),
          lastSuccessAt: this._lastSuccessAt,
          koreanReason: 'Decodo API 요청 한도를 초과했습니다 (HTTP 429). 잠시 후 다시 조회하세요.'
        };
      }
      if (!resp.ok) {
        return {
          status: 'USAGE_UNAVAILABLE',
          reasonCode: `DECODO_API_HTTP_${resp.status}`,
          httpStatus: resp.status,
          hasApiKey: true,
          isLive: false,
          stale: Boolean(this._lastSuccessAt),
          exhaustedProved: false,
          source: 'Decodo API',
          dashboardUrl: DECODO_DASHBOARD_URL,
          lastUpdatedAt: new Date(nowMs).toISOString(),
          lastSuccessAt: this._lastSuccessAt,
          koreanReason: `Decodo API 조회 중 오류가 발생했습니다 (HTTP ${resp.status}).`
        };
      }

      const body = await resp.json().catch(() => null);
      const normalized = normalizeDecodoUsagePayload(body, { nowMs });
      if (normalized.isLive) {
        this._cache = normalized;
        this._cacheFetchedAtMs = nowMs;
        this._lastSuccessAt = normalized.lastUpdatedAt;
      }
      return {
        ...normalized,
        hasApiKey: true,
        cached: false,
        lastSuccessAt: this._lastSuccessAt
      };
    } catch (err) {
      const msg = String(err?.message || 'NETWORK_ERROR').replace(/Bearer\s+\S+/gi, '[REDACTED]');
      const isTimeout = /timeout|abort/i.test(msg);
      return {
        status: 'USAGE_UNAVAILABLE',
        reasonCode: isTimeout ? 'DECODO_API_TIMEOUT' : 'DECODO_API_NETWORK_ERROR',
        hasApiKey: true,
        isLive: false,
        stale: Boolean(this._lastSuccessAt),
        exhaustedProved: false,
        source: 'Decodo API',
        dashboardUrl: DECODO_DASHBOARD_URL,
        lastUpdatedAt: new Date(nowMs).toISOString(),
        lastSuccessAt: this._lastSuccessAt,
        koreanReason: isTimeout
          ? 'Decodo API 응답 시간이 초과되었습니다 (Timeout). 오래된 수치는 표시하지 않으며, 잠시 후 다시 조회하세요.'
          : '네트워크 오류로 Decodo API에 연결하지 못했습니다. 잠시 후 다시 조회하거나 대시보드에서 확인하세요.'
      };
    }
  }
}

module.exports = {
  DecodoUsageService,
  normalizeDecodoUsagePayload,
  DECODO_API_BASE,
  DECODO_DASHBOARD_URL
};
