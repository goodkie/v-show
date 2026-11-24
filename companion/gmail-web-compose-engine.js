'use strict';
/**
 * XPIDER V7.1 Multi-Account Gmail Native Web Compose Assisted Campaign Engine (RC14).
 *
 * Strictly Policy-Safe & Anti-Suspension Architecture:
 * - Default Gmail dispatch path proven to land natively via Google's official Gmail Web Composer
 *   (`https://mail.google.com/mail/?view=cm&fs=1&authuser=<ownedAccount>&to=...&su=...&body=...`).
 * - ZERO `mail.google.com` host permission, ZERO DOM scraping, ZERO automated Send clicking.
 *   Every email is reviewed and sent manually by the operator inside Google's official web UI.
 * - Multi-account owned sender pool (Personal @gmail.com & Google Workspace custom domains)
 *   with conservative Warmup presets (`NEW_WARMUP`, `WARMING`, `ESTABLISHED`) strictly below
 *   Google's published daily/hourly limits to minimize account suspension risk.
 * - Fixed deterministic recipient-to-account allocation at prepare time: NEVER hops accounts to
 *   bypass rolling caps or provider warnings.
 * - Enforces rolling 1m / 1h / 24h account caps, aggregate domain 24h cap, minimum inter-send
 *   pacing cooldown, cross-provider suppression (Resend + Gmail + custom unsubscribe host + Outbox),
 *   cryptographic consent verification, idempotent deduplication, and automatic promo-to-text calming.
 * - Honest disclaimer: Reduces unverified-API/velocity suspension risk, but does NOT guarantee
 *   100% Primary Inbox placement or 100% immunity from account limits/suspension.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const { normalizeEmail, emailDomain, maskEmail } = require('./gmail-account-vault');
const { hasHeaderInjection, isValidPublicHttpsUnsubscribeBase } = require('./gmail-safe-delivery-engine');
const {
  optimizeAndScoreGmailMessage,
  isOfficialGmailWebUrl,
  decodeHtmlEntities
} = require('./gmail-deliverability-optimizer');
const { isPrimarilyEnglishContent } = require('./email-unsubscribe-server');
const RM = require('../extension/email-studio/recipient-manager');

const ONE_MIN_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OWNED_WEB_ACCOUNTS = 25;
const MAX_BATCH_OPEN_TABS = 3;
const MAX_COMPOSE_BODY_CHARS = 1650; // Safe URL length margin for Chrome + mail.google.com/?view=cm

const WARMUP_PRESETS = {
  gmail_personal: {
    NEW_WARMUP: { capPerMinute: 1, capPerHour: 5, cap24h: 15, minSpacingSec: 90, label: '신규/워밍업 1~2주 (개인 · 일 15통 · 90초 간격)' },
    WARMING: { capPerMinute: 1, capPerHour: 10, cap24h: 30, minSpacingSec: 60, label: '안정화 3~4주 (개인 · 일 30통 · 60초 간격)' },
    ESTABLISHED: { capPerMinute: 2, capPerHour: 20, cap24h: 80, minSpacingSec: 45, label: '숙성 계정 (개인 · 일 80통 · 45초 간격)' }
  },
  workspace_paid: {
    NEW_WARMUP: { capPerMinute: 1, capPerHour: 12, cap24h: 40, minSpacingSec: 60, label: '신규/워밍업 1~2주 (Workspace · 일 40통 · 60초 간격)' },
    WARMING: { capPerMinute: 2, capPerHour: 25, cap24h: 100, minSpacingSec: 45, label: '안정화 3~4주 (Workspace · 일 100통 · 45초 간격)' },
    ESTABLISHED: { capPerMinute: 3, capPerHour: 50, cap24h: 300, minSpacingSec: 30, label: '숙성 계정 (Workspace · 일 300통 · 30초 간격)' }
  }
};

const HARD_SAFETY_CEILINGS = {
  gmail_personal: { capPerMinute: 3, capPerHour: 35, cap24h: 150, domainCap24h: 250, minSpacingSec: 25 },
  workspace_paid: { capPerMinute: 5, capPerHour: 100, cap24h: 500, domainCap24h: 900, minSpacingSec: 15 }
};

const HONEST_WEB_COMPOSE_DISCLAIMER =
  'Gmail 웹 작성창 직접 발송은 미검증 OAuth API 시그니처를 회피하고 Google 공식 웹 UI에서 운영자가 직접 검토·발송하므로 스팸·정지 위험을 크게 낮추는 데 도움이 되지만, 100% 기본 받은편지함(Primary) 배치나 계정 정지 면제를 보장하지 않습니다. 수신자 동의·보수적 워밍업 한도·수신거부 준수가 필수입니다.';

function sha256Hex(v) {
  return crypto.createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex');
}

function sanitizeCampaignId(v) {
  const s = String(v || 'default').trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(s) ? s : 'default';
}

function resolveAccountType(email, requestedType) {
  const dom = emailDomain(email);
  if (dom === 'gmail.com' || dom === 'googlemail.com') return 'gmail_personal';
  return requestedType === 'gmail_personal' ? 'gmail_personal' : 'workspace_paid';
}

function resolveWarmupStage(raw) {
  const u = String(raw || 'NEW_WARMUP').toUpperCase();
  if (u === 'WARMING' || u === 'ESTABLISHED') return u;
  return 'NEW_WARMUP';
}

function clampAccountCaps(type, warmupStage, overrides = {}) {
  const preset = (WARMUP_PRESETS[type] && WARMUP_PRESETS[type][warmupStage]) || WARMUP_PRESETS.gmail_personal.NEW_WARMUP;
  const ceil = HARD_SAFETY_CEILINGS[type] || HARD_SAFETY_CEILINGS.gmail_personal;
  const parseNum = (v, def) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : def);
  const capPerMinute = Math.max(1, Math.min(ceil.capPerMinute, parseNum(overrides.capPerMinute, preset.capPerMinute)));
  const capPerHour = Math.max(capPerMinute, Math.min(ceil.capPerHour, parseNum(overrides.capPerHour, preset.capPerHour)));
  const cap24h = Math.max(capPerHour, Math.min(ceil.cap24h, parseNum(overrides.cap24h, preset.cap24h)));
  const minSpacingSec = Math.max(ceil.minSpacingSec, Math.min(600, parseNum(overrides.minSpacingSec, preset.minSpacingSec)));
  return { capPerMinute, capPerHour, cap24h, minSpacingSec, domainCap24h: ceil.domainCap24h };
}

function buildOfficialWebComposeUrl({ authUserEmail = '', to = '', subject = '', body = '' } = {}) {
  const cleanFrom = normalizeEmail(String(authUserEmail || '').replace(/[\r\n\0]+/g, '').trim());
  const cleanTo = normalizeEmail(String(to || '').replace(/[\r\n\0]+/g, '').trim());
  if (!cleanFrom || !cleanTo) {
    throw new Error('INVALID_COMPOSE_EMAIL_ADDRESS');
  }
  const cleanSubj = decodeHtmlEntities(String(subject || '')).replace(/[\r\n\0]+/g, ' ').trim().slice(0, 160);
  const cleanBody = decodeHtmlEntities(String(body || '')).replace(/\r\n/g, '\n').replace(/\0/g, '').trim().slice(0, MAX_COMPOSE_BODY_CHARS);
  const u = new URL('https://mail.google.com/mail/');
  u.searchParams.set('view', 'cm');
  u.searchParams.set('fs', '1');
  u.searchParams.set('authuser', cleanFrom);
  u.searchParams.set('to', cleanTo);
  if (cleanSubj) u.searchParams.set('su', cleanSubj);
  if (cleanBody) u.searchParams.set('body', cleanBody);
  const href = u.href;
  if (!isOfficialGmailWebUrl(href)) {
    throw new Error('NON_OFFICIAL_GMAIL_URL_BLOCKED');
  }
  return {
    composeUrl: href,
    urlLength: href.length,
    bodyTruncated: String(body || '').trim().length > MAX_COMPOSE_BODY_CHARS
  };
}

class GmailWebComposeEngine {
  constructor({ stateDir, pipeline, gmailRunner, trustedTestMode = false, nowFn = null } = {}) {
    if (!stateDir) throw new Error('STATE_DIR_REQUIRED');
    if (!pipeline) throw new Error('PIPELINE_REQUIRED');
    if (!gmailRunner) throw new Error('GMAIL_RUNNER_REQUIRED');
    this.stateDir = stateDir;
    this.pipeline = pipeline;
    this.gmailRunner = gmailRunner;
    this.trustedTestMode = Boolean(trustedTestMode);
    this.nowFn = (this.trustedTestMode && typeof nowFn === 'function') ? nowFn : () => Date.now();
    this.stateFile = path.join(this.stateDir, '.gmail_web_compose_state.json');
    this.state = this._loadState();
  }

  _emptyState() {
    return {
      schemaVersion: 'xpider-gmail-web-compose-v1',
      accounts: [],
      quotaEvents: [], // { tsMs, accountId, domain, campaignId, recipientHash, status }
      sentHistoryKeys: [], // `${campaignId}:${recipientHash}` for idempotent dedup
      queue: {
        campaignId: 'default',
        messageKind: 'service',
        lawfulBasis: 'EXPLICIT_OPT_IN',
        jurisdiction: 'GLOBAL',
        selectedAccountIds: [],
        physicalAddress: '',
        includeSignedUnsubscribeUrl: true,
        paused: false,
        pauseReason: null,
        enforcementPaused: false,
        entries: [],
        preparedAt: null,
        updatedAt: null
      }
    };
  }

  _loadState() {
    if (!fs.existsSync(this.stateFile)) return this._emptyState();
    if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
      try { verifyWindowsDacl(this.stateFile, process.env.USERNAME); } catch (_) { return this._emptyState(); }
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      const base = this._emptyState();
      return {
        ...base,
        ...parsed,
        accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : [],
        quotaEvents: Array.isArray(parsed?.quotaEvents) ? parsed.quotaEvents : [],
        sentHistoryKeys: Array.isArray(parsed?.sentHistoryKeys) ? parsed.sentHistoryKeys : [],
        queue: { ...base.queue, ...(parsed?.queue || {}), entries: Array.isArray(parsed?.queue?.entries) ? parsed.queue.entries : [] }
      };
    } catch (_) {
      return this._emptyState();
    }
  }

  _saveState() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    // Prune quota events older than 48h to keep file compact while preserving rolling 24h windows
    const cutoff = this.nowFn() - 48 * ONE_HOUR_MS;
    this.state.quotaEvents = (this.state.quotaEvents || []).filter(e => e && Number(e.tsMs) >= cutoff).slice(-5000);
    this.state.sentHistoryKeys = (this.state.sentHistoryKeys || []).slice(-20000);
    const serialized = JSON.stringify(this.state, null, 2) + '\n';
    if (!this.trustedTestMode) {
      writeProtectedSecretFile(this.stateFile, serialized);
      return;
    }
    const tmp = `${this.stateFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, serialized, { mode: 0o600 });
    fs.renameSync(tmp, this.stateFile);
  }

  // ===== Multi-Account Owned Sender Pool Management =====
  addOrUpdateAccount(payload = {}) {
    const rawEmail = String(payload.email || '').trim();
    if (hasHeaderInjection(rawEmail)) {
      return { ok: false, statusCode: 400, reason: 'INVALID_HEADER_INJECTION' };
    }
    const normEmail = normalizeEmail(rawEmail);
    if (!normEmail) {
      return { ok: false, statusCode: 400, reason: 'INVALID_GMAIL_ACCOUNT_EMAIL', message: '유효한 본인 소유 Gmail 또는 Google Workspace 이메일 주소를 입력하세요.' };
    }
    const label = String(payload.label || '').replace(/[\r\n\u0000-\u001f]+/g, ' ').trim().slice(0, 40);
    const type = resolveAccountType(normEmail, payload.type);
    const warmupStage = resolveWarmupStage(payload.warmupStage);
    const caps = clampAccountCaps(type, warmupStage, payload);
    const domain = emailDomain(normEmail);
    const nowIso = new Date(this.nowFn()).toISOString();

    const existing = this.state.accounts.find(a => a.email === normEmail);
    if (existing) {
      existing.label = label || existing.label;
      existing.type = type;
      existing.warmupStage = warmupStage;
      existing.capPerMinute = caps.capPerMinute;
      existing.capPerHour = caps.capPerHour;
      existing.cap24h = caps.cap24h;
      existing.minSpacingSec = caps.minSpacingSec;
      existing.domainCap24h = caps.domainCap24h;
      if (typeof payload.active === 'boolean') existing.active = payload.active;
      if (payload.clearCooldown === true) {
        existing.cooldownUntilMs = null;
        existing.warningReason = null;
      }
      existing.updatedAt = nowIso;
    } else {
      if (this.state.accounts.length >= MAX_OWNED_WEB_ACCOUNTS) {
        return { ok: false, statusCode: 400, reason: 'MAX_ACCOUNTS_REACHED', message: `최대 ${MAX_OWNED_WEB_ACCOUNTS}개 계정까지 등록할 수 있습니다.` };
      }
      const id = 'gweb_' + sha256Hex(normEmail).slice(0, 12);
      this.state.accounts.push({
        id,
        email: normEmail,
        domain,
        label,
        type,
        warmupStage,
        capPerMinute: caps.capPerMinute,
        capPerHour: caps.capPerHour,
        cap24h: caps.cap24h,
        minSpacingSec: caps.minSpacingSec,
        domainCap24h: caps.domainCap24h,
        active: payload.active !== false,
        cooldownUntilMs: null,
        warningReason: null,
        warningCount: 0,
        addedAt: nowIso,
        updatedAt: nowIso
      });
    }
    this._saveState();
    this.pipeline._appendAudit({ type: 'GMAIL_WEB_COMPOSE_ACCOUNT_SAVED', domain, warmupStage, cap24h: caps.cap24h });
    return { ok: true, statusCode: 200, accounts: this.listAccountsWithUsage() };
  }

  removeAccount(accountId) {
    const cleanId = String(accountId || '').trim();
    if (!cleanId) return { ok: false, statusCode: 400, reason: 'ACCOUNT_ID_REQUIRED' };
    const before = this.state.accounts.length;
    this.state.accounts = this.state.accounts.filter(a => a.id !== cleanId);
    const removed = this.state.accounts.length !== before;
    if (removed) this._saveState();
    return { ok: true, statusCode: 200, removed, accounts: this.listAccountsWithUsage() };
  }

  getRollingUsage(nowMs = this.nowFn()) {
    const perAccount1m = {};
    const perAccount1h = {};
    const perAccount24h = {};
    const perDomain24h = {};
    const lastSentMsByAccount = {};
    const earliest1m = {};
    const earliest1h = {};
    const earliest24h = {};
    const earliestDomain24h = {};

    for (const ev of (this.state.quotaEvents || [])) {
      const ts = Number(ev.tsMs || 0);
      if (!ts || nowMs - ts > ONE_DAY_MS) continue;
      const aid = ev.accountId;
      const dom = ev.domain;
      perAccount24h[aid] = (perAccount24h[aid] || 0) + 1;
      if (earliest24h[aid] === undefined || ts < earliest24h[aid]) earliest24h[aid] = ts;
      if (dom) {
        perDomain24h[dom] = (perDomain24h[dom] || 0) + 1;
        if (earliestDomain24h[dom] === undefined || ts < earliestDomain24h[dom]) earliestDomain24h[dom] = ts;
      }
      if (lastSentMsByAccount[aid] === undefined || ts > lastSentMsByAccount[aid]) lastSentMsByAccount[aid] = ts;
      if (nowMs - ts <= ONE_HOUR_MS) {
        perAccount1h[aid] = (perAccount1h[aid] || 0) + 1;
        if (earliest1h[aid] === undefined || ts < earliest1h[aid]) earliest1h[aid] = ts;
      }
      if (nowMs - ts <= ONE_MIN_MS) {
        perAccount1m[aid] = (perAccount1m[aid] || 0) + 1;
        if (earliest1m[aid] === undefined || ts < earliest1m[aid]) earliest1m[aid] = ts;
      }
    }
    return { nowMs, perAccount1m, perAccount1h, perAccount24h, perDomain24h, lastSentMsByAccount, earliest1m, earliest1h, earliest24h, earliestDomain24h };
  }

  checkAccountPermission(acct, usage = this.getRollingUsage()) {
    const nowMs = usage.nowMs;
    if (!acct || !acct.active) {
      return { permittedNow: false, waitUntilMs: null, waitUntilIso: null, reason: 'ACCOUNT_DISABLED' };
    }
    if (acct.cooldownUntilMs && nowMs < acct.cooldownUntilMs) {
      return {
        permittedNow: false,
        waitUntilMs: acct.cooldownUntilMs,
        waitUntilIso: new Date(acct.cooldownUntilMs).toISOString(),
        reason: acct.warningReason || 'ACCOUNT_PROTECTION_COOLDOWN'
      };
    }
    // Downward-only slowdown if account had prior warnings (cut caps in half automatically!)
    const slowdownDiv = (acct.warningCount || 0) > 0 ? 2 : 1;
    const eff1m = Math.max(1, Math.floor((acct.capPerMinute || 1) / slowdownDiv));
    const eff1h = Math.max(1, Math.floor((acct.capPerHour || 5) / slowdownDiv));
    const eff24h = Math.max(1, Math.floor((acct.cap24h || 15) / slowdownDiv));
    const effSpacingMs = Math.max(15, Number(acct.minSpacingSec || 60)) * 1000 * slowdownDiv;

    const s1m = usage.perAccount1m[acct.id] || 0;
    const s1h = usage.perAccount1h[acct.id] || 0;
    const s24h = usage.perAccount24h[acct.id] || 0;
    const dom24h = usage.perDomain24h[acct.domain] || 0;
    const domCap = acct.domainCap24h || (HARD_SAFETY_CEILINGS[acct.type]?.domainCap24h || 250);
    const lastMs = usage.lastSentMsByAccount[acct.id] || 0;

    if (dom24h >= domCap) {
      const waitMs = (usage.earliestDomain24h[acct.domain] || nowMs) + ONE_DAY_MS;
      return { permittedNow: false, waitUntilMs: waitMs, waitUntilIso: new Date(waitMs).toISOString(), reason: 'DOMAIN_24H_CAP_REACHED' };
    }
    if (s24h >= eff24h) {
      const waitMs = (usage.earliest24h[acct.id] || nowMs) + ONE_DAY_MS;
      return { permittedNow: false, waitUntilMs: waitMs, waitUntilIso: new Date(waitMs).toISOString(), reason: 'ACCOUNT_24H_CAP_REACHED' };
    }
    if (s1h >= eff1h) {
      const waitMs = (usage.earliest1h[acct.id] || nowMs) + ONE_HOUR_MS;
      return { permittedNow: false, waitUntilMs: waitMs, waitUntilIso: new Date(waitMs).toISOString(), reason: 'ACCOUNT_1H_CAP_REACHED' };
    }
    if (s1m >= eff1m) {
      const waitMs = (usage.earliest1m[acct.id] || nowMs) + ONE_MIN_MS;
      return { permittedNow: false, waitUntilMs: waitMs, waitUntilIso: new Date(waitMs).toISOString(), reason: 'ACCOUNT_1M_CAP_REACHED' };
    }
    if (lastMs && (nowMs - lastMs) < effSpacingMs) {
      const waitMs = lastMs + effSpacingMs;
      return { permittedNow: false, waitUntilMs: waitMs, waitUntilIso: new Date(waitMs).toISOString(), reason: 'PACING_COOLDOWN_WAIT' };
    }
    return {
      permittedNow: true,
      waitUntilMs: nowMs,
      waitUntilIso: new Date(nowMs).toISOString(),
      reason: null,
      effectiveCaps: { capPerMinute: eff1m, capPerHour: eff1h, cap24h: eff24h, minSpacingSec: Math.round(effSpacingMs / 1000) }
    };
  }

  listAccountsWithUsage() {
    const usage = this.getRollingUsage();
    return this.state.accounts.map(a => {
      const perm = this.checkAccountPermission(a, usage);
      return {
        id: a.id,
        email: a.email,
        maskedEmail: maskEmail(a.email),
        domain: a.domain,
        label: a.label || '',
        type: a.type,
        warmupStage: a.warmupStage,
        active: Boolean(a.active),
        capPerMinute: a.capPerMinute,
        capPerHour: a.capPerHour,
        cap24h: a.cap24h,
        minSpacingSec: a.minSpacingSec,
        domainCap24h: a.domainCap24h,
        sent1m: usage.perAccount1m[a.id] || 0,
        sent1h: usage.perAccount1h[a.id] || 0,
        sent24h: usage.perAccount24h[a.id] || 0,
        domainSent24h: usage.perDomain24h[a.domain] || 0,
        warningCount: a.warningCount || 0,
        warningReason: a.warningReason || null,
        cooldownUntilIso: a.cooldownUntilMs && usage.nowMs < a.cooldownUntilMs ? new Date(a.cooldownUntilMs).toISOString() : null,
        permittedNow: perm.permittedNow,
        nextPermittedAt: perm.waitUntilIso,
        waitReason: perm.reason
      };
    });
  }

  // ===== Prepare Multi-Account Fixed-Assignment Web Compose Queue =====
  prepareWebComposeQueue({
    csvText = '',
    campaignId = 'default',
    selectedAccountIds = [],
    messageKind = 'service',
    lawfulBasis = 'EXPLICIT_OPT_IN',
    jurisdiction = 'GLOBAL',
    authorizationSource = 'owner_web_compose_consent_attestation',
    consentAttested = false,
    physicalAddress = '',
    includeSignedUnsubscribeUrl = true
  } = {}) {
    if (consentAttested !== true) {
      return { ok: false, statusCode: 400, reason: 'CONSENT_ATTESTATION_REQUIRED', message: '수신 리스트의 적법한 발송 권한 확인 체크가 필요합니다.' };
    }
    const cleanCid = sanitizeCampaignId(campaignId);
    const activeAccounts = this.state.accounts.filter(a => a.active);
    const pickedIds = Array.isArray(selectedAccountIds) && selectedAccountIds.length > 0
      ? selectedAccountIds.filter(id => activeAccounts.some(a => a.id === id))
      : activeAccounts.map(a => a.id);

    if (pickedIds.length === 0) {
      return { ok: false, statusCode: 400, reason: 'NO_ACTIVE_WEB_COMPOSE_ACCOUNTS', message: '먼저 본인 소유 Gmail/Workspace 발신 계정을 1개 이상 등록하고 선택하세요.' };
    }
    const pickedAccounts = pickedIds.map(id => activeAccounts.find(a => a.id === id)).filter(Boolean);

    const parsed = RM.importRecipients(String(csvText || ''), { source: 'studio-gmail-web-compose' });
    const rawRows = Array.isArray(parsed?.valid) ? parsed.valid : [];
    if (rawRows.length === 0) {
      return { ok: false, statusCode: 400, reason: 'NO_VALID_RECIPIENTS', message: '유효한 수신자 이메일이 포함된 CSV를 입력하세요.' };
    }

    const supIndex = this.gmailRunner.buildCrossProviderSuppressionIndex();
    const sentSet = new Set(this.state.sentHistoryKeys || []);
    const seenHashes = new Set();
    const entries = [];
    let allocCursor = 0;

    for (const row of rawRows) {
      const normTo = normalizeEmail(row.email);
      if (!normTo) continue;
      const rHash = sha256Hex(normTo);
      if (seenHashes.has(rHash)) continue;
      seenHashes.add(rHash);

      const dedupKey = `${cleanCid}:${rHash}`;
      const supCheck = this.gmailRunner._checkCrossProviderSuppression(normTo, [], supIndex);
      if (supCheck.suppressed) {
        entries.push({
          id: 'wc_' + rHash.slice(0, 12),
          email: normTo,
          maskedEmail: maskEmail(normTo),
          name: String(row.name || '').trim().slice(0, 80),
          recipientHash: rHash,
          assignedAccountId: null,
          assignedAccountEmail: null,
          status: 'SKIPPED_SUPPRESSED_CROSS_PROVIDER',
          reason: supCheck.reason,
          updatedAt: new Date(this.nowFn()).toISOString()
        });
        continue;
      }
      if (sentSet.has(dedupKey)) {
        entries.push({
          id: 'wc_' + rHash.slice(0, 12),
          email: normTo,
          maskedEmail: maskEmail(normTo),
          name: String(row.name || '').trim().slice(0, 80),
          recipientHash: rHash,
          assignedAccountId: null,
          assignedAccountEmail: null,
          status: 'ALREADY_SENT_IDEMPOTENT',
          reason: 'ALREADY_SENT_IN_CAMPAIGN',
          updatedAt: new Date(this.nowFn()).toISOString()
        });
        continue;
      }

      // Record & verify cryptographic consent proof
      const cRec = this.pipeline.consentLedger.recordConsent({
        email: normTo,
        name: String(row.name || '').trim(),
        authorizationSource: String(authorizationSource || 'owner_web_compose_consent_attestation'),
        authorizationAt: new Date(this.nowFn()).toISOString()
      });
      if (!this.pipeline.consentLedger.verify(cRec)) {
        entries.push({
          id: 'wc_' + rHash.slice(0, 12),
          email: normTo,
          maskedEmail: maskEmail(normTo),
          name: String(row.name || '').trim().slice(0, 80),
          recipientHash: rHash,
          assignedAccountId: null,
          assignedAccountEmail: null,
          status: 'SKIPPED_NO_CONSENT',
          reason: 'CONSENT_PROOF_FAILED',
          updatedAt: new Date(this.nowFn()).toISOString()
        });
        continue;
      }

      // Fixed deterministic allocation across owned accounts weighted evenly (NEVER reassigned later!)
      const assignedAcct = pickedAccounts[allocCursor % pickedAccounts.length];
      allocCursor++;
      entries.push({
        id: 'wc_' + rHash.slice(0, 12),
        email: normTo,
        maskedEmail: maskEmail(normTo),
        name: String(row.name || '').trim().slice(0, 80),
        recipientHash: rHash,
        assignedAccountId: assignedAcct.id,
        assignedAccountEmail: assignedAcct.email,
        assignedAccountMasked: maskEmail(assignedAcct.email),
        status: 'PENDING',
        reason: null,
        openedAt: null,
        confirmedAt: null,
        updatedAt: new Date(this.nowFn()).toISOString()
      });
    }

    const nowIso = new Date(this.nowFn()).toISOString();
    this.state.queue = {
      campaignId: cleanCid,
      messageKind: messageKind === 'marketing' ? 'marketing' : 'service',
      lawfulBasis: String(lawfulBasis || 'EXPLICIT_OPT_IN'),
      jurisdiction: String(jurisdiction || 'GLOBAL'),
      selectedAccountIds: pickedIds,
      physicalAddress: String(physicalAddress || '').trim(),
      includeSignedUnsubscribeUrl: includeSignedUnsubscribeUrl !== false,
      paused: false,
      pauseReason: null,
      enforcementPaused: false,
      entries,
      preparedAt: nowIso,
      updatedAt: nowIso
    };
    this._saveState();
    this.pipeline._appendAudit({
      type: 'GMAIL_WEB_COMPOSE_QUEUE_PREPARED',
      campaignId: cleanCid,
      total: entries.length,
      pending: entries.filter(e => e.status === 'PENDING').length,
      accountCount: pickedAccounts.length
    });
    return {
      ok: true,
      statusCode: 200,
      status: this.getStatus()
    };
  }

  // ===== Issue Next Safe Batch (1 to 3 Official Gmail Web Compose URLs) =====
  async issueNextComposeBatch({
    subject = '',
    html = '',
    text = '',
    displayName = '',
    physicalAddress = undefined,
    maxBatch = 1,
    autoCalmPromoToTextStyle = true,
    includeSignedUnsubscribeUrl = undefined,
    syncFetchImpl = null
  } = {}) {
    if (this.state.queue.enforcementPaused) {
      return {
        ok: false,
        statusCode: 409,
        reason: this.state.queue.pauseReason || 'PAUSED_ACCOUNT_PROTECTION',
        message: '계정 보호를 위해 캠페인이 일시 중지되었습니다. 경고 원인을 확인한 뒤 수동 해제하세요.',
        status: this.getStatus()
      };
    }
    if (this.state.queue.paused) {
      return {
        ok: false,
        statusCode: 409,
        reason: this.state.queue.pauseReason || 'QUEUE_PAUSED',
        message: '캠페인이 일시 중지 상태입니다.',
        status: this.getStatus()
      };
    }

    const batchLimit = Math.max(1, Math.min(MAX_BATCH_OPEN_TABS, Math.floor(Number(maxBatch) || 1)));
    const pendingEntries = (this.state.queue.entries || []).filter(e => e && e.status === 'PENDING');
    if (pendingEntries.length === 0) {
      return {
        ok: true,
        statusCode: 200,
        done: true,
        issued: [],
        message: '대기 중인 수신자가 없습니다 (모든 항목 처리 완료).',
        status: this.getStatus()
      };
    }

    const useSignedUnsub = includeSignedUnsubscribeUrl !== undefined
      ? Boolean(includeSignedUnsubscribeUrl)
      : this.state.queue.includeSignedUnsubscribeUrl !== false;

    const effectiveAddr = physicalAddress !== undefined
      ? String(physicalAddress || '').trim()
      : String(this.state.queue.physicalAddress || '').trim();

    // Sync live cross-provider suppressions before opening ANY compose tab
    const unsubInfo = this.gmailRunner._resolvePublicUnsubConfig();
    let activePublicBase = unsubInfo.publicBase || 'https://unsubscribe.vivpr.pro';
    const doSyncFetch = typeof syncFetchImpl === 'function' ? syncFetchImpl : this.gmailRunner.syncFetchImpl;
    if (unsubInfo.hostOk && unsubInfo.syncToken) {
      const supSync = await this.gmailRunner._syncSuppressionsWithFallback({
        publicBase: unsubInfo.publicBase,
        defaultPublicBase: unsubInfo.defaultPublicBase,
        fallbackToDefaultIfDnsPending: unsubInfo.fallbackToDefaultIfDnsPending,
        syncToken: unsubInfo.syncToken,
        doSyncFetch
      });
      if (supSync.ok) activePublicBase = supSync.activePublicBase;
    }
    const supIndex = this.gmailRunner.buildCrossProviderSuppressionIndex();

    const issued = [];
    const usedAccountsThisBatch = new Set(); // At most 1 compose tab per account per click to respect pacing!
    let earliestWaitMs = null;
    let earliestWaitReason = null;

    for (const entry of pendingEntries) {
      if (issued.length >= batchLimit) break;

      // Re-verify live cross-provider suppression
      const supCheck = this.gmailRunner._checkCrossProviderSuppression(entry.email, [], supIndex);
      if (supCheck.suppressed) {
        entry.status = 'SKIPPED_SUPPRESSED_CROSS_PROVIDER';
        entry.reason = supCheck.reason;
        entry.updatedAt = new Date(this.nowFn()).toISOString();
        continue;
      }

      // Strictly respect fixed assigned account (NEVER hop to another account!)
      const acct = this.state.accounts.find(a => a.id === entry.assignedAccountId);
      if (!acct) {
        entry.status = 'SKIPPED_ACCOUNT_REMOVED';
        entry.reason = 'ASSIGNED_ACCOUNT_NOT_FOUND';
        entry.updatedAt = new Date(this.nowFn()).toISOString();
        continue;
      }
      if (usedAccountsThisBatch.has(acct.id)) {
        // Defer additional recipients assigned to this same account to enforce human pacing between sends on same account
        continue;
      }

      const usage = this.getRollingUsage();
      const perm = this.checkAccountPermission(acct, usage);
      if (!perm.permittedNow) {
        if (perm.waitUntilMs !== null && (earliestWaitMs === null || perm.waitUntilMs < earliestWaitMs)) {
          earliestWaitMs = perm.waitUntilMs;
          earliestWaitReason = perm.reason;
        }
        continue;
      }

      // Run RC13 Auto Promo-to-Text Calm Transform so even pasted promo copy becomes clean Inbox-friendly prose
      const opt = optimizeAndScoreGmailMessage({
        from: acct.email,
        displayName: String(displayName || '').trim() || acct.label || acct.domain,
        subject,
        html,
        text,
        physicalAddress: effectiveAddr,
        publicUnsubBase: activePublicBase,
        autoOptimize: true,
        embedInlineImages: false,
        autoCalmPromoToTextStyle: autoCalmPromoToTextStyle !== false,
        mimeContentMode: 'PLAIN_TEXT_ONLY'
      });

      const finalSubject = opt.optimized?.subject || String(subject || '').trim();
      let finalBody = String(opt.optimized?.text || text || '').trim();
      if (entry.name && /\{\{\s*name\s*\}\}/i.test(finalBody)) {
        finalBody = finalBody.replace(/\{\{\s*name\s*\}\}/gi, entry.name);
      }

      const isEng = isPrimarilyEnglishContent(finalBody, '');
      let unsubUrlUsed = null;
      if (useSignedUnsub && isValidPublicHttpsUnsubscribeBase(activePublicBase)) {
        const unsub = this.pipeline.issueRecipientUnsubscribeHeaders(entry.email, this.state.queue.campaignId, activePublicBase);
        if (unsubInfo.syncToken) {
          const tokRes = await this.gmailRunner._syncUnsubTokenRemote({
            publicBase: activePublicBase,
            syncToken: unsubInfo.syncToken,
            tokenHash: unsub.tokenHash,
            recipientHash: entry.recipientHash,
            campaignId: this.state.queue.campaignId,
            fetchImpl: doSyncFetch
          });
          if (tokRes.ok) {
            unsubUrlUsed = unsub.url;
          }
        }
      }

      if (effectiveAddr && !finalBody.toLowerCase().includes(effectiveAddr.toLowerCase())) {
        finalBody += isEng ? `\n\nAddress: ${effectiveAddr}` : `\n\n발신자 주소: ${effectiveAddr}`;
      }
      if (unsubUrlUsed && !finalBody.includes(unsubUrlUsed)) {
        finalBody += isEng ? `\nUnsubscribe: ${unsubUrlUsed}` : `\n구독 취소(수신 거부): ${unsubUrlUsed}`;
      } else if (!unsubUrlUsed) {
        finalBody += isEng
          ? '\nIf you prefer not to receive future updates, simply reply "unsubscribe".'
          : '\n더 이상 안내를 원치 않으시면 "수신거부"로 회신해 주세요.';
      }

      const compose = buildOfficialWebComposeUrl({
        authUserEmail: acct.email,
        to: entry.email,
        subject: finalSubject,
        body: finalBody
      });

      const nowMs = this.nowFn();
      const nowIso = new Date(nowMs).toISOString();
      entry.status = 'COMPOSE_OPENED';
      entry.openedAt = nowIso;
      entry.updatedAt = nowIso;
      this.state.quotaEvents.push({
        tsMs: nowMs,
        accountId: acct.id,
        domain: acct.domain,
        campaignId: this.state.queue.campaignId,
        recipientHash: entry.recipientHash,
        status: 'COMPOSE_OPENED'
      });
      usedAccountsThisBatch.add(acct.id);
      issued.push({
        entryId: entry.id,
        accountId: acct.id,
        fromAccountEmail: acct.email,
        fromAccountMasked: maskEmail(acct.email),
        toEmail: entry.email,
        toMasked: entry.maskedEmail,
        recipientName: entry.name || '',
        subject: finalSubject,
        bodyPreview: finalBody.slice(0, 300),
        composeUrl: compose.composeUrl,
        bodyTruncated: compose.bodyTruncated,
        unsubscribeUrlUsed: unsubUrlUsed,
        autoCalmedPromo: (opt.autoFixesApplied || []).some(f => f.code === 'AUTO_CALMED_PROMO_TO_TEXT_STRUCTURE')
      });
    }

    this.state.queue.updatedAt = new Date(this.nowFn()).toISOString();
    this._saveState();

    if (issued.length === 0) {
      return {
        ok: false,
        statusCode: 409,
        reason: earliestWaitReason || 'RATE_CAP_OR_PACING_WAIT',
        nextPermittedExecutionAt: earliestWaitMs ? new Date(earliestWaitMs).toISOString() : null,
        message: earliestWaitMs
          ? `계정 보호 안전 한도/간격(${earliestWaitReason}) 대기 중입니다. 다음 허용 시각: ${new Date(earliestWaitMs).toISOString()}`
          : '현재 즉시 열 수 있는 대기 계정이 없습니다.',
        status: this.getStatus()
      };
    }

    return {
      ok: true,
      statusCode: 200,
      done: false,
      issued,
      status: this.getStatus()
    };
  }

  markComposeItemResult({ entryId = '', result = 'OPERATOR_CONFIRMED_SENT', accountId = '', warningNote = '' } = {}) {
    const cleanRes = String(result || '').toUpperCase();
    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();

    if (cleanRes === 'ACCOUNT_WARNING_PAUSE') {
      const targetAcct = this.state.accounts.find(a => a.id === accountId) ||
        this.state.accounts.find(a => this.state.queue.entries.some(e => e.id === entryId && e.assignedAccountId === a.id));
      if (targetAcct) {
        targetAcct.warningCount = (targetAcct.warningCount || 0) + 1;
        targetAcct.warningReason = String(warningNote || 'OPERATOR_REPORTED_GMAIL_WARNING').slice(0, 120);
        targetAcct.cooldownUntilMs = nowMs + ONE_DAY_MS; // Automatic 24h protective cooldown!
        targetAcct.updatedAt = nowIso;
      }
      // Pause ENTIRE campaign fail-closed (never hop accounts on warning!)
      this.state.queue.paused = true;
      this.state.queue.enforcementPaused = true;
      this.state.queue.pauseReason = 'ACCOUNT_WARNING_PROTECTION_PAUSE_ALL';
      this.state.queue.updatedAt = nowIso;
      this._saveState();
      this.pipeline._appendAudit({ type: 'GMAIL_WEB_COMPOSE_WARNING_PAUSE_ALL', accountId: targetAcct?.id || null });
      return { ok: true, statusCode: 200, pausedAll: true, status: this.getStatus() };
    }

    const entry = (this.state.queue.entries || []).find(e => e && e.id === entryId);
    if (!entry) {
      return { ok: false, statusCode: 404, reason: 'ENTRY_NOT_FOUND', status: this.getStatus() };
    }
    if (cleanRes === 'OPERATOR_CONFIRMED_SENT') {
      entry.status = 'OPERATOR_CONFIRMED_SENT';
      entry.confirmedAt = nowIso;
      entry.updatedAt = nowIso;
      const dedupKey = `${this.state.queue.campaignId}:${entry.recipientHash}`;
      if (!this.state.sentHistoryKeys.includes(dedupKey)) {
        this.state.sentHistoryKeys.push(dedupKey);
      }
    } else if (cleanRes === 'SKIPPED_BY_OPERATOR') {
      entry.status = 'SKIPPED_BY_OPERATOR';
      entry.reason = 'OPERATOR_SKIPPED';
      entry.updatedAt = nowIso;
    } else {
      return { ok: false, statusCode: 400, reason: 'INVALID_RESULT_STATUS' };
    }
    this.state.queue.updatedAt = nowIso;
    this._saveState();
    return { ok: true, statusCode: 200, entry, status: this.getStatus() };
  }

  setPaused({ paused = true, reason = 'OWNER_PAUSED', clearEnforcement = false } = {}) {
    this.state.queue.paused = Boolean(paused);
    if (!paused && clearEnforcement) {
      this.state.queue.enforcementPaused = false;
      this.state.queue.pauseReason = null;
    } else if (paused) {
      this.state.queue.pauseReason = String(reason || 'OWNER_PAUSED');
    } else {
      this.state.queue.pauseReason = null;
    }
    this.state.queue.updatedAt = new Date(this.nowFn()).toISOString();
    this._saveState();
    return { ok: true, statusCode: 200, status: this.getStatus() };
  }

  getStatus() {
    const accounts = this.listAccountsWithUsage();
    const entries = Array.isArray(this.state.queue.entries) ? this.state.queue.entries : [];
    const counts = {
      total: entries.length,
      PENDING: 0,
      COMPOSE_OPENED: 0,
      OPERATOR_CONFIRMED_SENT: 0,
      SKIPPED_BY_OPERATOR: 0,
      SKIPPED_SUPPRESSED_CROSS_PROVIDER: 0,
      ALREADY_SENT_IDEMPOTENT: 0,
      SKIPPED_NO_CONSENT: 0
    };
    const pendingByAcct = {};
    for (const e of entries) {
      if (!e) continue;
      if (counts[e.status] !== undefined) counts[e.status]++;
      if (e.status === 'PENDING' && e.assignedAccountId) {
        pendingByAcct[e.assignedAccountId] = (pendingByAcct[e.assignedAccountId] || 0) + 1;
      }
    }

    // Multi-day projection across fixed-assigned accounts
    let estimatedDays = 0;
    for (const [aid, rem] of Object.entries(pendingByAcct)) {
      const acct = accounts.find(a => a.id === aid);
      const dailyCap = Math.max(1, Number(acct?.cap24h || 15));
      const daysForAcct = Math.ceil(rem / dailyCap);
      if (daysForAcct > estimatedDays) estimatedDays = daysForAcct;
    }

    const totalDailyCapacity = accounts.filter(a => a.active && !a.cooldownUntilIso).reduce((s, a) => s + (a.cap24h || 0), 0);
    const totalRemainingToday = accounts.filter(a => a.active && !a.cooldownUntilIso).reduce((s, a) => s + Math.max(0, (a.cap24h || 0) - (a.sent24h || 0)), 0);
    const openedItems = entries.filter(e => e.status === 'COMPOSE_OPENED').map(e => ({
      entryId: e.id,
      toMasked: e.maskedEmail,
      fromAccountMasked: e.assignedAccountMasked,
      accountId: e.assignedAccountId,
      openedAt: e.openedAt
    }));

    return {
      ok: true,
      mode: 'GMAIL_WEB_COMPOSE_ASSISTED',
      accounts,
      warmupPresets: WARMUP_PRESETS,
      queue: {
        campaignId: this.state.queue.campaignId,
        paused: Boolean(this.state.queue.paused),
        enforcementPaused: Boolean(this.state.queue.enforcementPaused),
        pauseReason: this.state.queue.pauseReason || null,
        selectedAccountIds: this.state.queue.selectedAccountIds || [],
        counts,
        estimatedDays,
        totalDailyCapacity,
        totalRemainingToday,
        openedAwaitingConfirm: openedItems,
        preparedAt: this.state.queue.preparedAt,
        updatedAt: this.state.queue.updatedAt
      },
      honestDisclaimer: HONEST_WEB_COMPOSE_DISCLAIMER
    };
  }
}

module.exports = {
  GmailWebComposeEngine,
  buildOfficialWebComposeUrl,
  WARMUP_PRESETS,
  HARD_SAFETY_CEILINGS,
  HONEST_WEB_COMPOSE_DISCLAIMER
};
