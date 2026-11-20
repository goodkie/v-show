'use strict';
/**
 * XPIDER V7.1 Provider-Neutral Gmail Campaign Runner & Cross-Provider Suppression Guard.
 *
 * Strictly built on top of `companion/gmail-sender-foundation.js` and `companion/gmail-account-vault.js`.
 * Guarantees:
 * - Zero account rotation to bypass quotas/blocks (401/403/429/cap -> PAUSE ENTIRE CAMPAIGN).
 * - Cross-provider suppression merger across Resend + Gmail + unsubscribe.vivpr.pro + DraftOutbox + campaign events.
 * - Pre-persisted deterministic recipient-to-account mapping before any send.
 * - Durable intent persisted BEFORE POST; timeout -> HALTED_RECONCILE_REQUIRED (zero blind auto-retry).
 * - Successful Gmail API 200 is strictly `GMAIL_API_ACCEPTED` (delivery: UNKNOWN, inbox: UNKNOWN).
 * - RFC 8058 One-Click unsubscribe token registered at https://unsubscribe.vivpr.pro before send.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { GmailSendBlocked, rawGmailMime, selectAccount, sendViaGmailApi } = require('./gmail-sender-foundation');
const { injectUnsubscribeFooter } = require('./email-unsubscribe-server');
const { maskEmail, normalizeEmail } = require('./gmail-account-vault');
const RM = require('../extension/email-studio/recipient-manager');

const PUBLIC_UNSUB_HOST = 'unsubscribe.vivpr.pro';

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s || '').trim().toLowerCase()).digest('hex');
}

function sanitizeCampaignId(v) {
  const raw = String(v || 'default').trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(raw) ? raw : 'default';
}

function ensurePhysicalAddressInFooter({ html = '', text = '', physicalAddress = '' }) {
  const addr = String(physicalAddress || '').trim();
  if (!addr) return { html, text };
  const hasAddrText = text.toLowerCase().includes(addr.toLowerCase());
  const hasAddrHtml = html.toLowerCase().includes(addr.toLowerCase());
  const safeAddrHtml = addr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    text: hasAddrText ? text : `${text.trimEnd()}\n\n발신자 주소: ${addr}`,
    html: hasAddrHtml ? html : `${html}\n<p style="font-size:11px;color:#64748b;margin-top:8px;">발신자 주소: ${safeAddrHtml}</p>`
  };
}

class GmailCampaignRunner {
  constructor({ stateDir, pipeline, analytics, vault, trustedTestMode = false, fetchImpl = null, syncFetchImpl = null } = {}) {
    if (!stateDir) throw new Error('STATE_DIR_REQUIRED');
    if (!pipeline) throw new Error('PIPELINE_REQUIRED');
    if (!vault) throw new Error('GMAIL_VAULT_REQUIRED');
    this.stateDir = stateDir;
    this.pipeline = pipeline;
    this.analytics = analytics || null;
    this.vault = vault;
    this.trustedTestMode = Boolean(trustedTestMode);
    this.fetchImpl = (this.trustedTestMode && typeof fetchImpl === 'function') ? fetchImpl : globalThis.fetch;
    this.syncFetchImpl = (this.trustedTestMode && typeof syncFetchImpl === 'function') ? syncFetchImpl : this.fetchImpl;

    this.queueFile = path.join(this.stateDir, '.email_gmail_queue.json');
    this._queueRunning = false;
    this._activeBgPromise = null;
    this.lastRunResult = null;
    this.queue = this._loadQueue();
  }

  _loadQueue() {
    if (!fs.existsSync(this.queueFile)) {
      return {
        provider: 'GMAIL',
        campaignId: 'default',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [],
        messageKind: 'service',
        lawfulBasis: 'EXPLICIT_OPT_IN',
        jurisdiction: 'GLOBAL',
        consentAttested: false,
        entries: [],
        stopped: false,
        stopReason: null,
        startedAt: null,
        finishedAt: null
      };
    }
    try {
      const q = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
      let mutated = false;
      // Fail-closed crash recovery: never auto-retry unknown in-flight Gmail sends on restart
      for (const e of (Array.isArray(q.entries) ? q.entries : [])) {
        if (e && e.status === 'SENDING') {
          e.status = 'HALTED_RECONCILE_REQUIRED';
          e.reason = 'IN_FLIGHT_CRASH_RECONCILE_REQUIRED_FAIL_CLOSED';
          mutated = true;
        }
      }
      if (mutated) {
        this._writeQueueAtomic(q);
      }
      return q;
    } catch (_) {
      return {
        provider: 'GMAIL',
        campaignId: 'default',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [],
        messageKind: 'service',
        lawfulBasis: 'EXPLICIT_OPT_IN',
        jurisdiction: 'GLOBAL',
        consentAttested: false,
        entries: [],
        stopped: false,
        stopReason: null,
        startedAt: null,
        finishedAt: null
      };
    }
  }

  _writeQueueAtomic(qObj) {
    fs.mkdirSync(path.dirname(this.queueFile), { recursive: true });
    const tmp = `${this.queueFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(qObj, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.queueFile);
  }

  _saveQueue() {
    this._writeQueueAtomic(this.queue);
  }

  // ===== Cross-Provider Suppression Merger (Resend + Gmail + Unsubscribe Worker + Outbox + Events) =====
  buildCrossProviderSuppressionIndex() {
    const outboxEmails = typeof this.pipeline.outbox.getSuppressedSet === 'function'
      ? this.pipeline.outbox.getSuppressedSet()
      : new Set();
    const suppressedHashes = new Map(); // sha256(email) -> reason

    // 1. Remote unsubscribe.vivpr.pro + pipeline suppressed records (UNSUBSCRIBED, HARD_BOUNCED, BOUNCED, COMPLAINED)
    if (this.pipeline.suppressedRecords && typeof this.pipeline.suppressedRecords === 'object') {
      for (const [h, rec] of Object.entries(this.pipeline.suppressedRecords)) {
        if (h) suppressedHashes.set(String(h).toLowerCase(), (rec && rec.reason) || 'REMOTE_SUPPRESSED');
      }
    }
    if (this.pipeline.suppressedHashes) {
      for (const h of this.pipeline.suppressedHashes) {
        const lh = String(h || '').toLowerCase();
        if (lh && !suppressedHashes.has(lh)) suppressedHashes.set(lh, 'REMOTE_SUPPRESSED');
      }
    }

    // 2. Historical Resend + Gmail campaign events (bounced, complained, provider-suppressed)
    let historicalDelivered = 0;
    let historicalBounced = 0;
    let historicalComplained = 0;
    let historicalProviderSuppressed = 0;
    const seenDeliveredIds = new Set();
    const seenBouncedIds = new Set();

    if (this.analytics && typeof this.analytics.listEvents === 'function') {
      for (const ev of this.analytics.listEvents()) {
        if (!ev || !ev.type) continue;
        const hashes = Array.isArray(ev.recipient_hashes) ? ev.recipient_hashes : [];
        if (ev.type === 'email.delivered' && ev.email_id) {
          seenDeliveredIds.add(ev.email_id);
        } else if (ev.type === 'email.bounced') {
          if (ev.email_id) seenBouncedIds.add(ev.email_id);
          const bReason = ev.bounce_type === 'soft' ? 'HISTORICAL_SOFT_BOUNCED' : 'HISTORICAL_HARD_BOUNCED';
          for (const h of hashes) {
            const lh = String(h || '').toLowerCase();
            if (lh && suppressedHashes.get(lh) !== 'UNSUBSCRIBED') {
              suppressedHashes.set(lh, bReason);
            }
          }
        } else if (ev.type === 'email.complained') {
          historicalComplained++;
          for (const h of hashes) {
            const lh = String(h || '').toLowerCase();
            if (lh) suppressedHashes.set(lh, 'HISTORICAL_COMPLAINED');
          }
        } else if (ev.type === 'email.suppressed') {
          historicalProviderSuppressed++;
          for (const h of hashes) {
            const lh = String(h || '').toLowerCase();
            if (lh && suppressedHashes.get(lh) !== 'UNSUBSCRIBED') {
              suppressedHashes.set(lh, 'RESEND_PROVIDER_SUPPRESSED');
            }
          }
        }
      }
      historicalDelivered = seenDeliveredIds.size;
      historicalBounced = seenBouncedIds.size;
    }

    const totalHistoricalOutcomes = historicalDelivered + historicalBounced;
    const historicalBounceRatePct = totalHistoricalOutcomes > 0
      ? Math.round((historicalBounced / totalHistoricalOutcomes) * 1000) / 10
      : 0;
    const elevatedBounceWarning = historicalBounceRatePct >= 5.0 || historicalBounced >= 50;

    return {
      outboxEmails,
      suppressedHashes,
      stats: {
        outboxSuppressedCount: outboxEmails.size,
        mergedHashSuppressedCount: suppressedHashes.size,
        historicalDelivered,
        historicalBounced,
        historicalComplained,
        historicalProviderSuppressed,
        historicalBounceRatePct,
        elevatedBounceWarning,
        hygieneGuidance: elevatedBounceWarning
          ? `과거 발송 이력에서 높은 반송률(${historicalBounceRatePct}%, 반송 ${historicalBounced}건)이 감지되었습니다. 기존 리스트를 자동 안전 목록으로 간주하지 마시고 반송·수신거부 제외 및 수신자 검증 검토 후 발송하세요.`
          : '교차 공급자(Resend + Gmail + 수신거부 서버) 차단 원장이 자동 병합 적용됩니다.'
      }
    };
  }

  _checkCrossProviderSuppression(email, manualSup, supIndex) {
    const norm = normalizeEmail(email);
    if (!norm) return { suppressed: true, reason: 'INVALID_EMAIL' };
    if (manualSup && typeof manualSup.has === 'function' && RM.isSuppressed(norm, manualSup)) {
      return { suppressed: true, reason: 'MANUAL_OPT_OUT' };
    }
    if (supIndex.outboxEmails.has(norm)) {
      return { suppressed: true, reason: 'LOCAL_OUTBOX_SUPPRESSED' };
    }
    const h = sha256Hex(norm);
    if (supIndex.suppressedHashes.has(h)) {
      return { suppressed: true, reason: supIndex.suppressedHashes.get(h) };
    }
    return { suppressed: false, reason: null };
  }

  _collectPriorSentIndex(campaignId) {
    const priorSentKeys = new Set();
    const priorSentRecipientHashesForCampaign = new Set();
    const events = this.pipeline._readAuditEvents();
    for (const ev of events) {
      if (!ev) continue;
      if ((ev.type === 'SEND_ATTEMPT_ACCEPTED' || ev.type === 'GMAIL_SEND_ACCEPTED') && ev.idempotencyKey) {
        priorSentKeys.add(String(ev.idempotencyKey));
      }
      if (ev.type === 'GMAIL_SEND_ACCEPTED' && ev.campaignId === campaignId && ev.recipientHash) {
        priorSentRecipientHashesForCampaign.add(String(ev.recipientHash));
      }
    }
    // Also check current Resend queue entries for the exact same campaignId (cross-provider anti-duplicate!)
    const resendQ = this.pipeline.queue;
    if (resendQ && resendQ.campaignId === campaignId && Array.isArray(resendQ.entries)) {
      for (const re of resendQ.entries) {
        if (re && (re.status === 'ACCEPTED' || re.status === 'DELIVERED') && re.email) {
          priorSentRecipientHashesForCampaign.add(sha256Hex(re.email));
        }
      }
    }
    return { priorSentKeys, priorSentRecipientHashesForCampaign };
  }

  // ===== Pre-Persisted Campaign Preparation & Deterministic Account Allocation (Zero Sends) =====
  prepareGmailQueue({
    csvText = '',
    optOutText = '',
    campaignId = 'default',
    sendingMode = 'SINGLE_ACCOUNT',
    selectedAccountIds = [],
    messageKind = 'service',
    consentAttested = false,
    lawfulBasis = null,
    jurisdiction = 'GLOBAL',
    authorizationSource = 'owner_csv_consent_attestation',
    authorizationAt = null,
    proofRef = ''
  } = {}) {
    const cid = sanitizeCampaignId(campaignId);
    const mode = sendingMode === 'APPROVED_ACCOUNT_POOL' ? 'APPROVED_ACCOUNT_POOL' : 'SINGLE_ACCOUNT';
    const cleanIds = Array.from(new Set((Array.isArray(selectedAccountIds) ? selectedAccountIds : []).map(x => String(x || '').trim()).filter(Boolean)));
    if (mode === 'SINGLE_ACCOUNT' && cleanIds.length !== 1) {
      return { ok: false, statusCode: 400, reason: 'SINGLE_ACCOUNT_REQUIRED', message: 'SINGLE_ACCOUNT 모드에서는 정확히 1개의 연결된 Gmail 계정을 선택해야 합니다.' };
    }
    if (mode === 'APPROVED_ACCOUNT_POOL' && cleanIds.length < 2) {
      return { ok: false, statusCode: 400, reason: 'POOL_REQUIRES_AT_LEAST_TWO_ACCOUNTS', message: 'APPROVED_ACCOUNT_POOL 모드에서는 2개 이상의 사전 승인된 Gmail 계정을 선택해야 합니다.' };
    }

    const accountsWithUsage = this.vault.getInternalAccountsWithUsage();
    for (const id of cleanIds) {
      const acct = accountsWithUsage.find(a => a.id === id);
      if (!acct || !acct.connected || !acct.verified || !acct.ownerAuthorized || acct.disabled || acct.providerBlocked) {
        return {
          ok: false,
          statusCode: 409,
          reason: 'ACCOUNT_NOT_AVAILABLE_PAUSE_CAMPAIGN',
          accountId: id,
          message: `선택한 Gmail 계정(${acct ? acct.maskedEmail : id})이 연결 해제·차단·비활성 상태이므로 큐를 준비할 수 없습니다.`
        };
      }
    }

    const normJurisdiction = String(jurisdiction || 'GLOBAL').trim().toUpperCase() || 'GLOBAL';
    const normSource = String(authorizationSource || 'owner_csv_consent_attestation').trim() || 'owner_csv_consent_attestation';
    const isScrapedSource = /(?:^|[-_.])(scraped|collected|purchased|email[-_]?collector|harvested)(?:$|[-_.])/i.test(normSource);
    const resolvedBasis = lawfulBasis
      ? String(lawfulBasis).trim().toUpperCase()
      : (consentAttested ? 'EXPLICIT_OPT_IN' : (messageKind === 'service' ? 'SERVICE_NOTIFICATION' : 'UNVERIFIED'));
    const validUsCanSpam = resolvedBasis === 'EXISTING_CUSTOMER_US_CAN_SPAM' && normJurisdiction === 'US';
    const basisAuthorized = !isScrapedSource && (
      (consentAttested && resolvedBasis === 'EXPLICIT_OPT_IN') ||
      (consentAttested && validUsCanSpam) ||
      (messageKind === 'service' && resolvedBasis === 'SERVICE_NOTIFICATION')
    );

    const parsed = RM.importRecipients(csvText, { source: 'studio-gmail-csv' });
    const manualSup = RM.parseSuppression(optOutText);
    const manualEmails = [];
    for (const item of manualSup) {
      if (!item.startsWith('@')) manualEmails.push(item);
    }
    if (manualEmails.length > 0 && typeof this.pipeline.outbox.suppressBatch === 'function') {
      try { this.pipeline.outbox.suppressBatch(manualEmails, 'MANUAL'); } catch (_) {}
    }

    const supIndex = this.buildCrossProviderSuppressionIndex();
    const { priorSentKeys, priorSentRecipientHashesForCampaign } = this._collectPriorSentIndex(cid);

    const nowIso = new Date().toISOString();
    const authTime = authorizationAt ? String(authorizationAt) : nowIso;
    const entries = [];
    const allocationCounts = {};
    let consentDirty = false;
    let readyCount = 0;
    let suppressedCount = 0;
    let noConsentCount = 0;
    let alreadySentCount = 0;

    for (const r of parsed.valid) {
      const recipientHash = sha256Hex(r.email);
      const idempotencyKey = 'gmail_' + crypto.createHash('sha256').update(`${cid}:${r.email}`).digest('hex').slice(0, 32);
      const resendEquivKey = 'prod_' + crypto.createHash('sha256').update(`${cid}:${r.email}`).digest('hex').slice(0, 32);

      if (priorSentKeys.has(idempotencyKey) || priorSentKeys.has(resendEquivKey) || priorSentRecipientHashesForCampaign.has(recipientHash)) {
        alreadySentCount++;
        entries.push({
          email: r.email,
          maskedEmail: maskEmail(r.email),
          name: r.name,
          recipientHash,
          idempotencyKey,
          assignedAccountId: null,
          assignedFromMasked: null,
          status: 'ALREADY_SENT_IDEMPOTENT',
          reason: 'ALREADY_SENT_CROSS_PROVIDER_IDEMPOTENT',
          providerMessageId: null,
          deliveryState: 'UNKNOWN',
          inboxState: 'UNKNOWN',
          attempts: 1,
          updatedAt: nowIso
        });
        continue;
      }

      const supCheck = this._checkCrossProviderSuppression(r.email, manualSup, supIndex);
      if (supCheck.suppressed) {
        suppressedCount++;
        entries.push({
          email: r.email,
          maskedEmail: maskEmail(r.email),
          name: r.name,
          recipientHash,
          idempotencyKey,
          assignedAccountId: null,
          assignedFromMasked: null,
          status: 'SKIPPED_SUPPRESSED_CROSS_PROVIDER',
          reason: supCheck.reason,
          providerMessageId: null,
          deliveryState: null,
          inboxState: null,
          attempts: 0,
          updatedAt: nowIso
        });
        continue;
      }

      if (isScrapedSource) {
        noConsentCount++;
        entries.push({
          email: r.email,
          maskedEmail: maskEmail(r.email),
          name: r.name,
          recipientHash,
          idempotencyKey,
          assignedAccountId: null,
          assignedFromMasked: null,
          status: 'SKIPPED_NO_CONSENT',
          reason: 'UNSOLICITED_SCRAPED_SOURCE_DENIED',
          providerMessageId: null,
          deliveryState: null,
          inboxState: null,
          attempts: 0,
          updatedAt: nowIso
        });
        continue;
      }

      const existingConsent = this.pipeline.consentLedger.get(r.email);
      const hasExistingVerifiedConsent = Boolean(existingConsent && this.pipeline.consentLedger.verify({
        email: r.email,
        authorizationSource: existingConsent.authorizationSource,
        authorizationAt: existingConsent.authorizationAt,
        consentProofToken: existingConsent.consentProofToken
      }));
      let entryVerified = hasExistingVerifiedConsent;
      if (!consentAttested && !hasExistingVerifiedConsent) {
        noConsentCount++;
        entries.push({
          email: r.email,
          maskedEmail: maskEmail(r.email),
          name: r.name,
          recipientHash,
          idempotencyKey,
          assignedAccountId: null,
          assignedFromMasked: null,
          status: 'SKIPPED_NO_CONSENT',
          reason: 'AUTHORIZATION_UNKNOWN_REQUIRES_ATTESTATION',
          providerMessageId: null,
          deliveryState: null,
          inboxState: null,
          attempts: 0,
          updatedAt: nowIso
        });
        continue;
      }
      if (consentAttested && basisAuthorized) {
        const sourceTag = `${normSource}|${resolvedBasis}|${normJurisdiction}${proofRef ? '|' + String(proofRef).slice(0, 64) : ''}`;
        this.pipeline.consentLedger.recordConsent({
          email: r.email,
          name: r.name,
          authorizationSource: sourceTag,
          authorizationAt: authTime,
          deferSave: true
        });
        consentDirty = true;
        entryVerified = true;
      } else if (!hasExistingVerifiedConsent) {
        noConsentCount++;
        entries.push({
          email: r.email,
          maskedEmail: maskEmail(r.email),
          name: r.name,
          recipientHash,
          idempotencyKey,
          assignedAccountId: null,
          assignedFromMasked: null,
          status: 'SKIPPED_NO_CONSENT',
          reason: 'LAWFUL_BASIS_NOT_VERIFIED',
          providerMessageId: null,
          deliveryState: null,
          inboxState: null,
          attempts: 0,
          updatedAt: nowIso
        });
        continue;
      }

      // Deterministic fixed account assignment (persisted BEFORE any send; never hopped on error!)
      let assignedAccountId = cleanIds[0];
      if (mode === 'APPROVED_ACCOUNT_POOL') {
        const idx = crypto.createHash('sha256').update(recipientHash, 'utf8').digest().readUInt32BE(0) % cleanIds.length;
        assignedAccountId = cleanIds[idx];
      }
      const acctObj = accountsWithUsage.find(a => a.id === assignedAccountId);
      allocationCounts[assignedAccountId] = (allocationCounts[assignedAccountId] || 0) + 1;
      readyCount++;
      entries.push({
        email: r.email,
        maskedEmail: maskEmail(r.email),
        name: r.name,
        recipientHash,
        idempotencyKey,
        assignedAccountId,
        assignedFromMasked: acctObj ? acctObj.maskedEmail : null,
        status: 'PENDING',
        reason: null,
        lawfulBasis: resolvedBasis,
        jurisdiction: normJurisdiction,
        consentVerified: entryVerified,
        providerMessageId: null,
        threadId: null,
        deliveryState: null,
        inboxState: null,
        attempts: 0,
        updatedAt: nowIso
      });
    }

    if (consentDirty) this.pipeline.consentLedger._save();

    this.queue = {
      provider: 'GMAIL',
      campaignId: cid,
      sendingMode: mode,
      selectedAccountIds: cleanIds,
      messageKind,
      lawfulBasis: resolvedBasis,
      jurisdiction: normJurisdiction,
      consentAttested: Boolean(consentAttested && basisAuthorized),
      allocationCounts,
      entries,
      stopped: false,
      stopReason: null,
      startedAt: null,
      finishedAt: null
    };
    this._saveQueue();
    this.pipeline._appendAudit({
      type: 'GMAIL_QUEUE_PREPARED',
      campaignId: cid,
      sendingMode: mode,
      selectedAccountIds: cleanIds,
      valid: parsed.valid.length,
      ready: readyCount,
      suppressedCrossProvider: suppressedCount,
      noConsent: noConsentCount,
      alreadySent: alreadySentCount,
      allocationCounts
    });

    return {
      ok: true,
      statusCode: 200,
      provider: 'GMAIL',
      campaignId: cid,
      sendingMode: mode,
      selectedAccountIds: cleanIds,
      allocationCounts,
      hygiene: supIndex.stats,
      summary: this.summarizeQueue()
    };
  }

  summarizeQueue() {
    const counts = {
      total: (this.queue.entries || []).length,
      PENDING: 0,
      SENDING: 0,
      GMAIL_API_ACCEPTED: 0,
      ALREADY_SENT_IDEMPOTENT: 0,
      SKIPPED_SUPPRESSED_CROSS_PROVIDER: 0,
      SKIPPED_NO_CONSENT: 0,
      BLOCKED_CONSENT_UNVERIFIED: 0,
      HALTED_RECONCILE_REQUIRED: 0
    };
    const perAccountAccepted = {};
    const perAccountPending = {};
    for (const e of (this.queue.entries || [])) {
      counts[e.status] = (counts[e.status] || 0) + 1;
      if (e.assignedAccountId) {
        if (e.status === 'GMAIL_API_ACCEPTED') {
          perAccountAccepted[e.assignedAccountId] = (perAccountAccepted[e.assignedAccountId] || 0) + 1;
        } else if (e.status === 'PENDING') {
          perAccountPending[e.assignedAccountId] = (perAccountPending[e.assignedAccountId] || 0) + 1;
        }
      }
    }
    return {
      provider: 'GMAIL',
      campaignId: this.queue.campaignId || 'default',
      sendingMode: this.queue.sendingMode || 'SINGLE_ACCOUNT',
      selectedAccountIds: Array.isArray(this.queue.selectedAccountIds) ? [...this.queue.selectedAccountIds] : [],
      stopped: Boolean(this.queue.stopped),
      stopReason: this.queue.stopReason || null,
      startedAt: this.queue.startedAt || null,
      finishedAt: this.queue.finishedAt || null,
      queueRunning: Boolean(this._queueRunning),
      counts,
      perAccountAccepted,
      perAccountPending,
      deliveryNote: 'GMAIL_API_ACCEPTED는 Google API 접수만 의미하며 DELIVERED/INBOX/OPENED를 보장하지 않습니다.'
    };
  }

  stopQueue(reason = 'OWNER_STOPPED') {
    this.queue.stopped = true;
    this.queue.stopReason = reason;
    this._saveQueue();
    this.pipeline._appendAudit({ type: 'GMAIL_QUEUE_STOPPED', campaignId: this.queue.campaignId, reason });
    return this.summarizeQueue();
  }

  _resolvePublicUnsubConfig() {
    const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
    const publicBase = String(unsubCfg?.publicBaseUrl || '').trim().replace(/\/+$/, '');
    let hostOk = false;
    try {
      const u = new URL(publicBase);
      hostOk = u.protocol === 'https:' && u.hostname.toLowerCase() === PUBLIC_UNSUB_HOST;
    } catch (_) {}
    const syncTokenPath = path.join(this.stateDir, '.unsubscribe_sync_token');
    const syncToken = fs.existsSync(syncTokenPath) ? fs.readFileSync(syncTokenPath, 'utf8').trim() : '';
    return { publicBase, hostOk, syncToken };
  }

  async _syncUnsubTokenRemote({ publicBase, syncToken, tokenHash, recipientHash, campaignId, fetchImpl }) {
    const doFetch = typeof fetchImpl === 'function' ? fetchImpl : this.syncFetchImpl;
    try {
      const resp = await doFetch(`${publicBase}/api/sync/tokens`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${syncToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash,
          recipientHash,
          campaignId,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
        }),
        ...(doFetch === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(15000) } : {})
      });
      if (!resp || !resp.ok) {
        return { ok: false, reason: `UNSUBSCRIBE_TOKEN_SYNC_HTTP_${resp ? resp.status : 'ERROR'}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'UNSUBSCRIBE_TOKEN_SYNC_NETWORK_ERROR', detail: err?.message || '' };
    }
  }

  // ===== Single Authorized Account Gmail Self-Test =====
  async sendGmailSelfTest({
    accountId,
    fromAddress = null,
    to,
    displayName = '',
    subject = '',
    html = '',
    text = '',
    physicalAddress = '',
    recipientConsentConfirmed = false,
    ownerExplicitApproval = false,
    baseUrlOverride = null,
    syncTokenOverride = null,
    fetchImpl = null,
    syncFetchImpl = null
  } = {}) {
    if (ownerExplicitApproval !== true || recipientConsentConfirmed !== true) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'EXPLICIT_CONSENT_AND_APPROVAL_REQUIRED' };
    }
    const normTo = normalizeEmail(to);
    if (!normTo) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'INVALID_RECIPIENT_EMAIL' };
    }
    const unsubInfo = this._resolvePublicUnsubConfig();
    const publicBase = (this.trustedTestMode && baseUrlOverride) ? String(baseUrlOverride).replace(/\/+$/, '') : unsubInfo.publicBase;
    const syncToken = (this.trustedTestMode && syncTokenOverride) ? String(syncTokenOverride) : unsubInfo.syncToken;
    let hostOk = false;
    try {
      const u = new URL(publicBase);
      hostOk = u.protocol === 'https:' && u.hostname.toLowerCase() === PUBLIC_UNSUB_HOST;
    } catch (_) {}
    if (!hostOk || !syncToken) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: 'PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED' };
    }

    const doSyncFetch = typeof syncFetchImpl === 'function' ? syncFetchImpl : this.syncFetchImpl;
    const doGmailFetch = typeof fetchImpl === 'function' ? fetchImpl : this.fetchImpl;

    // 1. Sync remote suppressions & check cross-provider suppression
    const supSync = await this.pipeline.syncRemoteSuppressions({ baseUrl: publicBase, syncToken, fetchImpl: doSyncFetch, skipQueueSave: true });
    if (!supSync.ok) {
      return { ok: false, statusCode: 503, status: 'BLOCKED', reason: 'UNSUBSCRIBE_SYNC_UNAVAILABLE', detail: supSync.reason };
    }
    const supIndex = this.buildCrossProviderSuppressionIndex();
    const supCheck = this._checkCrossProviderSuppression(normTo, [], supIndex);
    if (supCheck.suppressed) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: 'RECIPIENT_SUPPRESSED_CROSS_PROVIDER', detail: supCheck.reason };
    }

    // 2. Record & cryptographically verify consent
    const consentRec = this.pipeline.consentLedger.recordConsent({
      email: normTo,
      name: 'Owner Gmail Self-Test',
      authorizationSource: 'owner_studio_gmail_self_test_consent',
      authorizationAt: new Date().toISOString()
    });
    if (!this.pipeline.consentLedger.verify(consentRec)) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: 'CONSENT_PROOF_FAILED' };
    }

    // 3. Validate account + rolling 24h per-account & domain caps via foundation selectAccount()
    const accountsWithUsage = this.vault.getInternalAccountsWithUsage();
    const targetAcct = accountsWithUsage.find(a => a.id === accountId);
    if (!targetAcct) {
      return { ok: false, statusCode: 404, status: 'BLOCKED', reason: 'ACCOUNT_NOT_FOUND' };
    }
    const recipientHash = sha256Hex(normTo);
    const campaignId = 'gmail-self-test-' + new Date().toISOString().slice(0, 10);
    const idempotencyKey = 'gmail_selftest_' + crypto.randomBytes(10).toString('hex');

    let selected;
    try {
      selected = selectAccount({
        mode: 'SINGLE_ACCOUNT',
        accountId: targetAcct.id,
        accounts: accountsWithUsage,
        recipientHash,
        domainSent24h: targetAcct.domainSent24h,
        domainCap24h: targetAcct.domainCap24h,
        recipientEligible: true,
        ledgerIntentPersisted: true,
        campaignAuthorized: true
      });
    } catch (err) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: err.code || err.message };
    }

    // 4. Issue RFC 8058 unsubscribe token & register hash BEFORE sending
    const unsub = this.pipeline.issueRecipientUnsubscribeHeaders(normTo, campaignId, publicBase);
    const tokReg = await this._syncUnsubTokenRemote({
      publicBase,
      syncToken,
      tokenHash: unsub.tokenHash,
      recipientHash,
      campaignId,
      fetchImpl: doSyncFetch
    });
    if (!tokReg.ok) {
      return { ok: false, statusCode: 502, status: 'BLOCKED', reason: tokReg.reason, detail: tokReg.detail || null };
    }

    // 5. Persist intent BEFORE POST & construct RFC-compliant MIME via foundation rawGmailMime()
    this.pipeline._appendAudit({
      type: 'GMAIL_SELF_TEST_STARTED',
      campaignId,
      accountId: selected.accountId,
      recipientHash,
      idempotencyKey
    });

    const withFooter = injectUnsubscribeFooter({ html, text, unsubscribeUrl: unsub.url });
    const withAddr = ensurePhysicalAddressInFooter({ ...withFooter, physicalAddress });
    const resolvedFrom = fromAddress ? normalizeEmail(fromAddress) : selected.from;

    let raw;
    try {
      raw = rawGmailMime({
        from: resolvedFrom || selected.from,
        to: normTo,
        verifiedFromAddresses: targetAcct.verifiedSendAs || [targetAcct.email],
        displayName: String(displayName || '').trim() || targetAcct.domain,
        subject,
        html: withAddr.html,
        text: withAddr.text,
        unsubscribeUrl: unsub.url,
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      });
    } catch (err) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: err.code || err.message };
    }

    // 6. Retrieve DPAPI access token & call Gmail API users.messages.send
    let accessToken;
    try {
      accessToken = await this.vault.getValidAccessToken(selected.accountId);
    } catch (err) {
      return { ok: false, statusCode: 401, status: 'BLOCKED', reason: err.code || err.message };
    }

    try {
      const sendRes = await sendViaGmailApi({
        fetchImpl: doGmailFetch,
        accessToken,
        raw,
        approved: true,
        ...(doGmailFetch === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(25000) } : {})
      });
      this.vault.recordQuotaEvent({
        accountId: selected.accountId,
        domain: targetAcct.domain,
        campaignId,
        recipientHash,
        idempotencyKey,
        providerMessageId: sendRes.providerMessageId,
        status: 'GMAIL_API_ACCEPTED'
      });
      this.pipeline._appendAudit({
        type: 'GMAIL_SEND_ACCEPTED',
        mode: 'GMAIL_SELF_TEST',
        campaignId,
        accountId: selected.accountId,
        recipientHash,
        idempotencyKey,
        providerMessageId: sendRes.providerMessageId,
        threadId: sendRes.threadId
      });
      return {
        ok: true,
        statusCode: 200,
        status: 'GMAIL_API_ACCEPTED',
        delivery: 'UNKNOWN',
        inbox: 'UNKNOWN',
        providerMessageId: sendRes.providerMessageId,
        threadId: sendRes.threadId,
        accountId: selected.accountId,
        maskedFrom: maskEmail(resolvedFrom || selected.from),
        maskedTo: maskEmail(normTo),
        note: 'Gmail API 접수 완료(GMAIL_API_ACCEPTED). 전달(DELIVERED)·수신함 도착(INBOX)·열람(OPENED)은 독립 검증 전까지 미확인(UNKNOWN)입니다.'
      };
    } catch (err) {
      const code = err instanceof GmailSendBlocked ? err.code : 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY';
      if (code === 'GMAIL_AUTH_REVOKED') {
        this.vault.markAccountBlocked(selected.accountId, code, { disconnect: true });
      } else if (code === 'GMAIL_PROVIDER_LIMIT_OR_POLICY_PAUSE_ALL') {
        this.vault.markAccountBlocked(selected.accountId, code, { disconnect: false });
      } else if (code === 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY') {
        this.vault.recordQuotaEvent({
          accountId: selected.accountId,
          domain: targetAcct.domain,
          campaignId,
          recipientHash,
          idempotencyKey,
          status: 'IN_FLIGHT_UNKNOWN'
        });
      }
      this.pipeline._appendAudit({
        type: 'GMAIL_SEND_BLOCKED',
        campaignId,
        accountId: selected.accountId,
        recipientHash,
        idempotencyKey,
        reason: code
      });
      return { ok: false, statusCode: code === 'GMAIL_AUTH_REVOKED' ? 401 : 409, status: 'BLOCKED', reason: code };
    }
  }

  // ===== Production Gmail Queue Execution (Fail-Closed, Zero Account Hopping on Block) =====
  async runGmailQueue({
    subject = '',
    displayName = '',
    html = '',
    text = '',
    physicalAddress = '',
    ownerExplicitApproval = false,
    hygieneConfirmed = false,
    baseUrlOverride = null,
    syncTokenOverride = null,
    fetchImpl = null,
    syncFetchImpl = null,
    pacingMs = null
  } = {}) {
    if (this._queueRunning) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: 'GMAIL_QUEUE_ALREADY_RUNNING', summary: this.summarizeQueue() };
    }
    if (ownerExplicitApproval !== true) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'OWNER_EXPLICIT_APPROVAL_REQUIRED', summary: this.summarizeQueue() };
    }
    const supIndexPre = this.buildCrossProviderSuppressionIndex();
    if (supIndexPre.stats.elevatedBounceWarning && hygieneConfirmed !== true) {
      return {
        ok: false,
        statusCode: 409,
        status: 'BLOCKED',
        reason: 'LIST_HYGIENE_REVIEW_REQUIRED',
        hygiene: supIndexPre.stats,
        koreanReason: '과거 발송 이력에서 높은 반송률이 감지되었습니다. 리스트 위생 점검 확인 체크박스 선택 후 실행하세요.',
        summary: this.summarizeQueue()
      };
    }

    const unsubInfo = this._resolvePublicUnsubConfig();
    const publicBase = (this.trustedTestMode && baseUrlOverride) ? String(baseUrlOverride).replace(/\/+$/, '') : unsubInfo.publicBase;
    const syncToken = (this.trustedTestMode && syncTokenOverride) ? String(syncTokenOverride) : unsubInfo.syncToken;
    let hostOk = false;
    try {
      const u = new URL(publicBase);
      hostOk = u.protocol === 'https:' && u.hostname.toLowerCase() === PUBLIC_UNSUB_HOST;
    } catch (_) {}
    if (!hostOk || !syncToken) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: 'PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED', summary: this.summarizeQueue() };
    }

    const doSyncFetch = typeof syncFetchImpl === 'function' ? syncFetchImpl : this.syncFetchImpl;
    const doGmailFetch = typeof fetchImpl === 'function' ? fetchImpl : this.fetchImpl;
    const effectivePacingMs = Number.isFinite(pacingMs) ? pacingMs : (doGmailFetch === globalThis.fetch ? 1500 : 0);

    this._queueRunning = true;
    this.lastRunResult = null;
    try {
      // Pre-send remote suppression sync (fail closed if unreachable)
      const supSync = await this.pipeline.syncRemoteSuppressions({ baseUrl: publicBase, syncToken, fetchImpl: doSyncFetch, skipQueueSave: true });
      if (!supSync.ok) {
        const res = { ok: false, statusCode: 503, status: 'BLOCKED', reason: 'UNSUBSCRIBE_SYNC_UNAVAILABLE', detail: supSync.reason, summary: this.summarizeQueue() };
        this.lastRunResult = res;
        return res;
      }
      const supIndex = this.buildCrossProviderSuppressionIndex();

      this.queue.stopped = false;
      this.queue.stopReason = null;
      this.queue.startedAt = this.queue.startedAt || new Date().toISOString();
      this._saveQueue();

      let acceptedInThisRun = 0;

      for (const e of (this.queue.entries || [])) {
        if (this.queue.stopped) break;
        if (e.status !== 'PENDING') continue;

        // 1. Re-verify cross-provider suppression
        const supCheck = this._checkCrossProviderSuppression(e.email, [], supIndex);
        if (supCheck.suppressed) {
          e.status = 'SKIPPED_SUPPRESSED_CROSS_PROVIDER';
          e.reason = supCheck.reason;
          e.updatedAt = new Date().toISOString();
          this._saveQueue();
          continue;
        }

        // 2. Re-verify cryptographic consent proof
        const cRec = this.pipeline.consentLedger.get(e.email);
        const consentOk = Boolean(cRec && this.pipeline.consentLedger.verify({
          email: e.email,
          authorizationSource: cRec.authorizationSource,
          authorizationAt: cRec.authorizationAt,
          consentProofToken: cRec.consentProofToken
        }));
        if (!consentOk) {
          e.status = 'BLOCKED_CONSENT_UNVERIFIED';
          e.reason = 'CONSENT_PROOF_MISSING_OR_TAMPERED_FAIL_CLOSED';
          e.updatedAt = new Date().toISOString();
          this._saveQueue();
          continue;
        }

        // 3. Persist intent BEFORE selectAccount / network POST
        e.status = 'SENDING';
        e.attempts = (e.attempts || 0) + 1;
        e.updatedAt = new Date().toISOString();
        this._saveQueue();
        this.pipeline._appendAudit({
          type: 'GMAIL_SEND_ATTEMPT_STARTED',
          campaignId: this.queue.campaignId,
          accountId: e.assignedAccountId,
          recipientHash: e.recipientHash,
          idempotencyKey: e.idempotencyKey,
          attempt: e.attempts
        });

        // 4. Authoritative account & rolling-24h cap check via foundation selectAccount()
        // NOTE: Uses the campaign's fixed sendingMode + pre-approved accountIds + recipientHash.
        // If the assigned account hits cap/block/revocation, selectAccount throws and PAUSES THE ENTIRE CAMPAIGN!
        const accountsWithUsage = this.vault.getInternalAccountsWithUsage();
        const assignedAcct = accountsWithUsage.find(a => a.id === e.assignedAccountId);
        let selected;
        try {
          selected = selectAccount({
            mode: this.queue.sendingMode,
            accountId: e.assignedAccountId,
            accountIds: this.queue.selectedAccountIds,
            accounts: accountsWithUsage,
            recipientHash: e.recipientHash,
            domainSent24h: assignedAcct ? assignedAcct.domainSent24h : undefined,
            domainCap24h: assignedAcct ? assignedAcct.domainCap24h : undefined,
            recipientEligible: true,
            ledgerIntentPersisted: true,
            campaignAuthorized: true
          });
          // Sanity invariant: deterministic allocation must NEVER silently change to another account
          if (e.assignedAccountId && selected.accountId !== e.assignedAccountId) {
            throw new GmailSendBlocked('ACCOUNT_ASSIGNMENT_DRIFT_BLOCKED');
          }
        } catch (selErr) {
          const code = selErr instanceof GmailSendBlocked ? selErr.code : 'ACCOUNT_NOT_AVAILABLE_PAUSE_CAMPAIGN';
          // POST was never called -> revert SENDING -> PENDING and PAUSE ENTIRE CAMPAIGN
          e.status = 'PENDING';
          e.reason = code;
          e.updatedAt = new Date().toISOString();
          this.queue.stopped = true;
          this.queue.stopReason = code;
          this._saveQueue();
          this.pipeline._appendAudit({ type: 'GMAIL_CAMPAIGN_PAUSED', campaignId: this.queue.campaignId, accountId: e.assignedAccountId, reason: code });
          const pausedRes = {
            ok: false,
            statusCode: 409,
            status: 'PAUSED',
            reason: code,
            stopReason: code,
            acceptedInThisRun,
            koreanReason: `계정/도메인 일일 안전 한도 또는 계정 상태 제한(${code})으로 전체 캠페인이 안전 일시 중지되었습니다 (타 계정 자동 우회 금지).`,
            summary: this.summarizeQueue()
          };
          this.lastRunResult = pausedRes;
          return pausedRes;
        }

        // 5. Issue RFC 8058 unsubscribe token & sync tokenHash BEFORE POST
        const unsub = this.pipeline.issueRecipientUnsubscribeHeaders(e.email, this.queue.campaignId, publicBase);
        const tokReg = await this._syncUnsubTokenRemote({
          publicBase,
          syncToken,
          tokenHash: unsub.tokenHash,
          recipientHash: e.recipientHash,
          campaignId: this.queue.campaignId,
          fetchImpl: doSyncFetch
        });
        if (!tokReg.ok) {
          e.status = 'PENDING';
          e.reason = tokReg.reason;
          e.updatedAt = new Date().toISOString();
          this.queue.stopped = true;
          this.queue.stopReason = tokReg.reason;
          this._saveQueue();
          const tokRes = {
            ok: false,
            statusCode: 502,
            status: 'PAUSED',
            reason: tokReg.reason,
            stopReason: tokReg.reason,
            acceptedInThisRun,
            koreanReason: `수신거부 원클릭 토큰 원격 동기화 실패(${tokReg.reason})로 발송 전 안전 중단되었습니다.`,
            summary: this.summarizeQueue()
          };
          this.lastRunResult = tokRes;
          return tokRes;
        }

        // 6. Build MIME via foundation rawGmailMime()
        const withFooter = injectUnsubscribeFooter({ html, text, unsubscribeUrl: unsub.url });
        const withAddr = ensurePhysicalAddressInFooter({ ...withFooter, physicalAddress });
        let raw;
        try {
          raw = rawGmailMime({
            from: selected.from,
            to: e.email,
            verifiedFromAddresses: (assignedAcct && assignedAcct.verifiedSendAs) || [selected.from],
            displayName: String(displayName || '').trim() || (assignedAcct && assignedAcct.domain) || 'Sender',
            subject,
            html: withAddr.html,
            text: withAddr.text,
            unsubscribeUrl: unsub.url,
            campaignAuthorized: true,
            recipientEligible: true,
            ledgerIntentPersisted: true
          });
        } catch (mimeErr) {
          const code = mimeErr instanceof GmailSendBlocked ? mimeErr.code : 'INVALID_MIME';
          e.status = 'PENDING';
          e.reason = code;
          this.queue.stopped = true;
          this.queue.stopReason = code;
          this._saveQueue();
          const mimeRes = { ok: false, statusCode: 400, status: 'PAUSED', reason: code, stopReason: code, acceptedInThisRun, summary: this.summarizeQueue() };
          this.lastRunResult = mimeRes;
          return mimeRes;
        }

        // 7. Retrieve DPAPI access token (on revocation -> PAUSE ENTIRE CAMPAIGN, never switch accounts)
        let accessToken;
        try {
          accessToken = await this.vault.getValidAccessToken(selected.accountId);
        } catch (authErr) {
          const code = authErr instanceof GmailSendBlocked ? authErr.code : 'GMAIL_AUTH_REVOKED';
          e.status = 'PENDING';
          e.reason = code;
          e.updatedAt = new Date().toISOString();
          this.queue.stopped = true;
          this.queue.stopReason = code;
          this._saveQueue();
          this.pipeline._appendAudit({ type: 'GMAIL_CAMPAIGN_PAUSED', campaignId: this.queue.campaignId, accountId: selected.accountId, reason: code });
          const authRes = {
            ok: false,
            statusCode: 401,
            status: 'PAUSED',
            reason: code,
            stopReason: code,
            acceptedInThisRun,
            koreanReason: `Gmail OAuth 인증 만료/취소(${code})로 전체 캠페인이 안전 일시 중지되었습니다. 계정을 재연결해 주세요 (타 계정 자동 우회 금지).`,
            summary: this.summarizeQueue()
          };
          this.lastRunResult = authRes;
          return authRes;
        }

        // 8. POST to Gmail API via foundation sendViaGmailApi()
        try {
          const sendRes = await sendViaGmailApi({
            fetchImpl: doGmailFetch,
            accessToken,
            raw,
            approved: true,
            ...(doGmailFetch === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(25000) } : {})
          });
          e.status = 'GMAIL_API_ACCEPTED';
          e.providerMessageId = sendRes.providerMessageId;
          e.threadId = sendRes.threadId;
          e.deliveryState = 'UNKNOWN';
          e.inboxState = 'UNKNOWN';
          e.reason = null;
          e.updatedAt = new Date().toISOString();
          acceptedInThisRun++;
          this._saveQueue();

          this.vault.recordQuotaEvent({
            accountId: selected.accountId,
            domain: assignedAcct ? assignedAcct.domain : '',
            campaignId: this.queue.campaignId,
            recipientHash: e.recipientHash,
            idempotencyKey: e.idempotencyKey,
            providerMessageId: sendRes.providerMessageId,
            status: 'GMAIL_API_ACCEPTED'
          });
          this.pipeline._appendAudit({
            type: 'GMAIL_SEND_ACCEPTED',
            mode: 'LIVE_GMAIL',
            campaignId: this.queue.campaignId,
            accountId: selected.accountId,
            recipientHash: e.recipientHash,
            idempotencyKey: e.idempotencyKey,
            providerMessageId: sendRes.providerMessageId,
            threadId: sendRes.threadId
          });
        } catch (sendErr) {
          const code = sendErr instanceof GmailSendBlocked ? sendErr.code : 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY';
          if (code === 'GMAIL_AUTH_REVOKED') {
            this.vault.markAccountBlocked(selected.accountId, code, { disconnect: true });
            e.status = 'PENDING';
            e.reason = code;
          } else if (code === 'GMAIL_PROVIDER_LIMIT_OR_POLICY_PAUSE_ALL') {
            this.vault.markAccountBlocked(selected.accountId, code, { disconnect: false });
            e.status = 'PENDING';
            e.reason = code;
          } else {
            // Timeout / network drop / 5xx -> result unknown; NEVER blind auto-retry!
            e.status = 'HALTED_RECONCILE_REQUIRED';
            e.reason = code;
            this.vault.recordQuotaEvent({
              accountId: selected.accountId,
              domain: assignedAcct ? assignedAcct.domain : '',
              campaignId: this.queue.campaignId,
              recipientHash: e.recipientHash,
              idempotencyKey: e.idempotencyKey,
              status: 'IN_FLIGHT_UNKNOWN'
            });
          }
          e.updatedAt = new Date().toISOString();
          this.queue.stopped = true;
          this.queue.stopReason = code;
          this._saveQueue();
          this.pipeline._appendAudit({
            type: 'GMAIL_CAMPAIGN_PAUSED',
            campaignId: this.queue.campaignId,
            accountId: selected.accountId,
            recipientHash: e.recipientHash,
            idempotencyKey: e.idempotencyKey,
            reason: code
          });
          const haltRes = {
            ok: false,
            statusCode: code === 'GMAIL_AUTH_REVOKED' ? 401 : 409,
            status: 'PAUSED',
            reason: code,
            stopReason: code,
            acceptedInThisRun,
            koreanReason: code === 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY'
              ? 'Gmail API 응답 미확정(타임아웃/네트워크 오류)으로 중복 발송 방지를 위해 자동 재시도 없이 즉시 중지되었습니다 (HALTED_RECONCILE_REQUIRED).'
              : `Gmail 공급자 제한/인증 오류(${code})가 감지되어 전체 캠페인이 즉시 일시 중지되었습니다 (타 계정 우회 금지).`,
            summary: this.summarizeQueue()
          };
          this.lastRunResult = haltRes;
          return haltRes;
        }

        if (effectivePacingMs > 0 && !this.queue.stopped) {
          await new Promise(r => setTimeout(r, effectivePacingMs));
        }
      }

      const remaining = (this.queue.entries || []).filter(e => e.status === 'PENDING' || e.status === 'SENDING').length;
      if (!this.queue.stopped && remaining === 0) {
        this.queue.finishedAt = new Date().toISOString();
        this._saveQueue();
      }
      const finalRes = {
        ok: true,
        statusCode: 200,
        status: this.queue.stopped ? 'STOPPED' : 'COMPLETED',
        stopReason: this.queue.stopReason || null,
        acceptedInThisRun,
        summary: this.summarizeQueue()
      };
      this.lastRunResult = finalRes;
      this.pipeline._appendAudit({
        type: 'GMAIL_QUEUE_RUN_COMPLETED',
        campaignId: this.queue.campaignId,
        acceptedInThisRun,
        stopped: this.queue.stopped,
        stopReason: this.queue.stopReason || null
      });
      return finalRes;
    } finally {
      this._queueRunning = false;
    }
  }

  startGmailQueueBackground(opts = {}) {
    if (this._queueRunning) {
      return { ok: false, statusCode: 409, status: 'BLOCKED', reason: 'GMAIL_QUEUE_ALREADY_RUNNING', summary: this.summarizeQueue() };
    }
    if (opts.ownerExplicitApproval !== true) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'OWNER_EXPLICIT_APPROVAL_REQUIRED', summary: this.summarizeQueue() };
    }
    const supIndexPre = this.buildCrossProviderSuppressionIndex();
    if (supIndexPre.stats.elevatedBounceWarning && opts.hygieneConfirmed !== true) {
      return {
        ok: false,
        statusCode: 409,
        status: 'BLOCKED',
        reason: 'LIST_HYGIENE_REVIEW_REQUIRED',
        hygiene: supIndexPre.stats,
        koreanReason: '과거 발송 이력에서 높은 반송률이 감지되었습니다. 리스트 위생 점검 확인 체크박스 선택 후 실행하세요.',
        summary: this.summarizeQueue()
      };
    }
    const p = this.runGmailQueue(opts).catch(err => {
      this.lastRunResult = { ok: false, status: 'PAUSED', reason: err?.code || err?.message || 'GMAIL_BG_EXCEPTION', summary: this.summarizeQueue() };
    });
    this._activeBgPromise = p;
    return {
      ok: true,
      statusCode: 202,
      status: 'STARTED',
      background: true,
      summary: this.summarizeQueue()
    };
  }
}

module.exports = {
  GmailCampaignRunner,
  ensurePhysicalAddressInFooter
};
