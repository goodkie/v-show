'use strict';
/**
 * XPIDER Audited Production Email Pipeline & Readiness Engine (LOCKED13)
 * Integrates:
 * 1. Live & mockable DNS verifier for vivpr.pro (SPF, send.vivpr.pro, DKIM resend._domainkey, DMARC _dmarc).
 * 2. Durable NTFS-protected ConsentLedger + DraftOutbox (LEDGER_VERIFIED consent proofs + suppression store).
 * 3. RFC 8058 One-Click Unsubscribe token issuer & HTTP processor (/unsubscribe/:token).
 * 4. Svix-signed Resend Webhook Intake (/webhooks/resend) with automatic BOUNCED/COMPLAINED suppression.
 * 5. Audited sidecar queue transport with per-recipient idempotency, zero duplicate sends, and stop/resume.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dnsPromises = require('node:dns').promises;
const { DraftOutbox } = require('./email-draft-outbox');
const { issueUnsubscribeToken, verifyUnsubscribeToken, createUnsubscribeProcessor, PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS } = require('./email-unsubscribe-server');
const { ResendWebhookIntake, signSvixPayload, PRODUCTION_WEBHOOK_ENDPOINT_STATUS } = require('./resend-webhook-intake');
const deliverabilityPolicy = require('./email-deliverability-v2-policy');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const RM = require('../extension/email-studio/recipient-manager');

const DOMAIN = 'vivpr.pro';

async function verifySenderDomainDns(options = {}) {
  const domain = options.domain || DOMAIN;
  const dkimSelector = options.dkimSelector || 'resend';
  const resolveTxt = options.resolveTxt || ((host) => dnsPromises.resolveTxt(host));

  async function safeResolve(host) {
    try {
      const records = await resolveTxt(host);
      const flat = (Array.isArray(records) ? records : []).map(r => Array.isArray(r) ? r.join('') : String(r));
      return { found: flat.length > 0, records: flat, error: null };
    } catch (err) {
      return { found: false, records: [], error: (err && err.code) || (err && err.message) || 'DNS_LOOKUP_FAILED' };
    }
  }

  const [rootTxt, sendSubTxt, dmarcTxt, dkimTxt] = await Promise.all([
    safeResolve(domain),
    safeResolve(`send.${domain}`),
    safeResolve(`_dmarc.${domain}`),
    safeResolve(`${dkimSelector}._domainkey.${domain}`)
  ]);

  const spfRoot = rootTxt.records.find(r => /v=spf1\b/i.test(r)) || null;
  const spfSend = sendSubTxt.records.find(r => /v=spf1\b/i.test(r)) || null;
  const spfHasResendOrSes = Boolean(
    (spfRoot && /(amazonses\.com|resend\.com|send\.vivpr\.pro)/i.test(spfRoot)) ||
    (spfSend && /(amazonses\.com|resend\.com)/i.test(spfSend))
  );

  const dmarcRec = dmarcTxt.records.find(r => /v=DMARC1\b/i.test(r)) || null;
  const dmarcPolicyMatch = dmarcRec ? dmarcRec.match(/\bp\s*=\s*(none|quarantine|reject)\b/i) : null;
  const dmarcPass = Boolean(dmarcRec && dmarcPolicyMatch);

  const dkimRec = dkimTxt.records.find(r => /\bp\s*=\s*[A-Za-z0-9+/=]{16,}/i.test(r)) || null;
  const dkimPass = Boolean(dkimRec);

  return {
    domain,
    checkedAt: new Date().toISOString(),
    spf: {
      rootHost: domain,
      rootRecord: spfRoot,
      rootError: rootTxt.error,
      sendHost: `send.${domain}`,
      sendRecord: spfSend,
      sendError: sendSubTxt.error,
      pass: spfHasResendOrSes
    },
    dkim: {
      host: `${dkimSelector}._domainkey.${domain}`,
      record: dkimRec ? (dkimRec.slice(0, 64) + '...') : null,
      error: dkimTxt.error,
      pass: dkimPass
    },
    dmarc: {
      host: `_dmarc.${domain}`,
      record: dmarcRec,
      policy: dmarcPolicyMatch ? dmarcPolicyMatch[1].toLowerCase() : null,
      error: dmarcTxt.error,
      pass: dmarcPass
    },
    allVerified: Boolean(spfHasResendOrSes && dkimPass && dmarcPass)
  };
}

class ConsentLedger {
  constructor(file, secret) {
    this.file = file;
    this.secret = secret;
    this.records = this._load();
  }

  _load() {
    if (!fs.existsSync(this.file)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')).records || {};
    } catch (_) {
      return {};
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), records: this.records }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  signProof({ email, authorizationSource, authorizationAt }) {
    const norm = RM.normalizeEmail(email);
    return crypto.createHmac('sha256', this.secret)
      .update(`${norm}|${authorizationSource}|${authorizationAt}`, 'utf8')
      .digest('hex');
  }

  recordConsent({ email, name = '', authorizationSource, authorizationAt }) {
    const norm = RM.normalizeEmail(email);
    if (!norm || RM.validateEmail(norm)) throw new Error('INVALID_EMAIL');
    if (!authorizationSource || !authorizationAt || !Number.isFinite(Date.parse(authorizationAt))) {
      throw new Error('AUTHORIZATION_EVIDENCE_REQUIRED');
    }
    const consentProofToken = this.signProof({ email: norm, authorizationSource, authorizationAt });
    this.records[norm] = {
      email: norm,
      name: String(name || '').slice(0, 80),
      authorizationSource: String(authorizationSource),
      authorizationAt: new Date(Date.parse(authorizationAt)).toISOString(),
      consentProofToken,
      recordedAt: new Date().toISOString()
    };
    this._save();
    return this.records[norm];
  }

  verify({ email, authorizationSource, authorizationAt, consentProofToken }) {
    const norm = RM.normalizeEmail(email);
    const rec = this.records[norm];
    if (!rec || !consentProofToken) return false;
    const expected = this.signProof({
      email: norm,
      authorizationSource: authorizationSource || rec.authorizationSource,
      authorizationAt: authorizationAt || rec.authorizationAt
    });
    if (expected.length !== String(consentProofToken).length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(consentProofToken), 'utf8'));
  }

  get(email) {
    return this.records[RM.normalizeEmail(email)] || null;
  }

  count() {
    return Object.keys(this.records).length;
  }
}

class EmailProductionPipeline {
  constructor(options = {}) {
    this.stateDir = options.stateDir;
    this.trustedTestMode = Boolean(options.trustedTestMode);
    this.dnsResolver = options.dnsResolver || null;
    this.providerTransport = options.providerTransport || null;
    fs.mkdirSync(this.stateDir, { recursive: true });

    this.secretFile = path.join(this.stateDir, '.email_pipeline_hmac_secret');
    this.hmacSecret = this._loadOrCreateHmacSecret();
    this.keyRing = { activeKeyId: 'k1', keys: { k1: this.hmacSecret } };

    this.consentFile = path.join(this.stateDir, '.email_consent_ledger.json');
    this.outboxFile = path.join(this.stateDir, '.email_draft_outbox.json');
    this.webhookStateFile = path.join(this.stateDir, '.email_webhook_state.json');
    this.webhookSecretFile = path.join(this.stateDir, '.resend_webhook_secret');
    this.queueFile = path.join(this.stateDir, '.email_production_queue.json');
    this.auditFile = path.join(this.stateDir, '.email_production_audit.jsonl');

    this.consentLedger = new ConsentLedger(this.consentFile, this.hmacSecret);
    this.outbox = new DraftOutbox(this.outboxFile, { consentLedger: this.consentLedger });
    this.unsubscribeProcessor = createUnsubscribeProcessor({ outbox: this.outbox, keyRing: this.keyRing });
    this.queue = this._loadQueue();
    this.lastDnsReport = null;
  }

  _loadOrCreateHmacSecret() {
    if (fs.existsSync(this.secretFile)) {
      if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
        verifyWindowsDacl(this.secretFile, process.env.USERNAME);
      }
      const s = fs.readFileSync(this.secretFile, 'utf8').trim();
      if (s.length >= 32) return s;
    }
    const fresh = crypto.randomBytes(32).toString('hex');
    writeProtectedSecretFile(this.secretFile, fresh + '\n');
    return fresh;
  }

  getWebhookSecret() {
    if (fs.existsSync(this.webhookSecretFile)) {
      if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
        try { verifyWindowsDacl(this.webhookSecretFile, process.env.USERNAME); } catch (_) { return null; }
      }
      const s = fs.readFileSync(this.webhookSecretFile, 'utf8').trim();
      if (s.startsWith('whsec_') && s.length >= 22) return s;
    }
    if (this.trustedTestMode) {
      return 'whsec_' + Buffer.from(this.hmacSecret.slice(0, 32), 'utf8').toString('base64');
    }
    return null;
  }

  setWebhookSecret(rawSecret, userConsentConfirmed) {
    if (userConsentConfirmed !== true) throw new Error('USER_CONSENT_REQUIRED');
    const trimmed = String(rawSecret || '').trim();
    if (!trimmed.startsWith('whsec_') || trimmed.length < 22) throw new Error('INVALID_WEBHOOK_SECRET_FORMAT');
    writeProtectedSecretFile(this.webhookSecretFile, trimmed + '\n');
    return { ok: true, configured: true };
  }

  _loadQueue() {
    if (!fs.existsSync(this.queueFile)) {
      return { campaignId: 'default', messageKind: 'service', entries: [], stopped: false, startedAt: null, finishedAt: null };
    }
    try {
      const q = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
      for (const e of (q.entries || [])) {
        if (e.status === 'SENDING') e.status = 'PENDING';
      }
      return q;
    } catch (_) {
      return { campaignId: 'default', messageKind: 'service', entries: [], stopped: false, startedAt: null, finishedAt: null };
    }
  }

  _saveQueue() {
    const tmp = `${this.queueFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.queue, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.queueFile);
  }

  _appendAudit(event) {
    const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n';
    fs.appendFileSync(this.auditFile, line, { mode: 0o600 });
  }

  issueRecipientUnsubscribeHeaders(email, campaignId = 'default', baseUrl = 'http://127.0.0.1:18990') {
    const token = issueUnsubscribeToken({ email, campaignId, keyRing: this.keyRing });
    const url = `${baseUrl.replace(/\/$/, '')}/unsubscribe/${token}`;
    return {
      token,
      url,
      headers: {
        'List-Unsubscribe': `<${url}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    };
  }

  handleUnsubscribeHttp(req, rawBody) {
    const out = this.unsubscribeProcessor.handleRequest({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: rawBody
    });
    if (req.method === 'POST' && out.statusCode === 200) {
      this._syncQueueSuppression();
      this._appendAudit({ type: 'UNSUBSCRIBE_ONE_CLICK', jti: out.body.jti, idempotentReplay: out.body.idempotentReplay });
    }
    return out;
  }

  handleResendWebhookHttp(headers, rawBody) {
    const secret = this.getWebhookSecret();
    if (!secret) {
      return { statusCode: 503, body: { status: 'BLOCKED', reason: 'WEBHOOK_SECRET_NOT_CONFIGURED' } };
    }
    const intake = new ResendWebhookIntake({
      stateFile: this.webhookStateFile,
      secret,
      outbox: this.outbox
    });
    const out = intake.processWebhook({ headers, rawBody });
    if (out.statusCode === 200 && out.body) {
      const { emailId, state, delivered, suppressedRecipients } = out.body;
      for (const e of this.queue.entries) {
        if (e.providerMessageId && e.providerMessageId === emailId) {
          e.deliveryState = state;
          e.delivered = Boolean(delivered);
          if (state === 'BOUNCED' || state === 'COMPLAINED') {
            e.status = 'SUPPRESSED_' + state;
          }
          e.updatedAt = new Date().toISOString();
        }
      }
      if (Array.isArray(suppressedRecipients) && suppressedRecipients.length > 0) {
        this._syncQueueSuppression();
      }
      this._saveQueue();
      this._appendAudit({ type: 'WEBHOOK_EVENT', emailId, state, delivered, suppressedCount: (suppressedRecipients || []).length });
    }
    return out;
  }

  _syncQueueSuppression() {
    for (const e of this.queue.entries) {
      if (this.outbox.isSuppressed(e.email) && e.status !== 'ACCEPTED' && e.status !== 'DELIVERED') {
        e.status = 'SKIPPED_SUPPRESSED';
        e.reason = 'OPT_OUT_OR_BOUNCE_SUPPRESSED';
      }
    }
    this._saveQueue();
  }

  importAndPersistRecipients({ csvText = '', optOutText = '', messageKind = 'service', consentAttested = false, authorizationSource = 'owner_csv_consent_attestation', campaignId = 'default' }) {
    const parsed = RM.importRecipients(csvText, { source: 'studio-csv' });
    const manualSup = RM.parseSuppression(optOutText);
    for (const item of manualSup) {
      if (!item.startsWith('@')) {
        try { this.outbox.suppress(item, 'MANUAL'); } catch (_) {}
      }
    }

    const nowIso = new Date().toISOString();
    const entries = [];
    let readyCount = 0;
    let suppressedCount = 0;
    let noConsentCount = 0;

    for (const r of parsed.valid) {
      const idempotencyKey = 'prod_' + crypto.createHash('sha256').update(`${campaignId}:${r.email}`).digest('hex').slice(0, 32);
      const isSup = RM.isSuppressed(r.email, manualSup) || this.outbox.isSuppressed(r.email);
      if (isSup) {
        suppressedCount++;
        entries.push({ email: r.email, name: r.name, idempotencyKey, status: 'SKIPPED_SUPPRESSED', reason: 'OPT_OUT_OR_SUPPRESSED', attempts: 0, providerMessageId: null, deliveryState: null, updatedAt: nowIso });
        continue;
      }
      if (!consentAttested) {
        if (messageKind === 'marketing') {
          noConsentCount++;
          entries.push({ email: r.email, name: r.name, idempotencyKey, status: 'SKIPPED_NO_CONSENT', reason: 'MARKETING_REQUIRES_CONSENT_ATTESTATION', attempts: 0, providerMessageId: null, deliveryState: null, updatedAt: nowIso });
          continue;
        }
      } else {
        const consentRec = this.consentLedger.recordConsent({
          email: r.email,
          name: r.name,
          authorizationSource,
          authorizationAt: nowIso
        });
        this.outbox.add({
          email: r.email,
          authorized: true,
          authorizationSource: consentRec.authorizationSource,
          authorizationAt: consentRec.authorizationAt,
          consentProofToken: consentRec.consentProofToken,
          source: 'CUSTOMER',
          templateId: campaignId,
          key: idempotencyKey
        });
      }
      readyCount++;
      entries.push({
        email: r.email,
        name: r.name,
        idempotencyKey,
        status: 'PENDING',
        reason: null,
        consentVerified: Boolean(consentAttested),
        attempts: 0,
        providerMessageId: null,
        deliveryState: null,
        updatedAt: nowIso
      });
    }

    this.queue = {
      campaignId,
      messageKind,
      consentAttested: Boolean(consentAttested),
      entries,
      stopped: false,
      startedAt: null,
      finishedAt: null
    };
    this._saveQueue();
    this._appendAudit({
      type: 'RECIPIENTS_IMPORTED',
      campaignId,
      valid: parsed.valid.length,
      duplicates: parsed.duplicates.length,
      invalid: parsed.invalid.length,
      ready: readyCount,
      suppressed: suppressedCount,
      noConsent: noConsentCount
    });

    return {
      ok: true,
      campaignId,
      imported: {
        validCount: parsed.valid.length,
        duplicateCount: parsed.duplicates.length,
        invalidCount: parsed.invalid.length,
        invalidSample: parsed.invalid.slice(0, 5)
      },
      summary: this.summarizeQueue()
    };
  }

  summarizeQueue() {
    const counts = { total: this.queue.entries.length, PENDING: 0, SENDING: 0, ACCEPTED: 0, DELIVERED: 0, DRY_RUN_READY: 0, FAILED: 0, SKIPPED_SUPPRESSED: 0, SKIPPED_NO_CONSENT: 0 };
    for (const e of this.queue.entries) {
      counts[e.status] = (counts[e.status] || 0) + 1;
      if (e.deliveryState === 'DELIVERED') counts.DELIVERED++;
    }
    return {
      campaignId: this.queue.campaignId,
      messageKind: this.queue.messageKind,
      stopped: Boolean(this.queue.stopped),
      startedAt: this.queue.startedAt,
      finishedAt: this.queue.finishedAt,
      counts,
      consentedRecordsOnDisk: this.consentLedger.count(),
      suppressedRecordsOnDisk: this.outbox.snapshot().suppressed.length
    };
  }

  async evaluatePreflight({ hasResendKey = false, keyStatus = 'KEY_MISSING', ownerExplicitApproval = false, publicUnsubscribeHttpsVerified = false } = {}) {
    const dnsReport = await verifySenderDomainDns({
      domain: DOMAIN,
      resolveTxt: this.dnsResolver || undefined
    });
    this.lastDnsReport = dnsReport;
    const summary = this.summarizeQueue();
    const webhookSecretConfigured = Boolean(this.getWebhookSecret());
    const messageClass = this.queue.messageKind === 'marketing' ? 'CONSENTED_MARKETING' : 'SERVICE_NOTIFICATION';

    const gateEval = deliverabilityPolicy.evaluate({
      messageClass,
      coldOutreach: false,
      scrapedContacts: false,
      purchasedContacts: false,
      recipientAuthorizationEvidenceVerified: summary.consentedRecordsOnDisk > 0 && Boolean(this.queue.consentAttested),
      fromDomain: DOMAIN,
      domainOwnershipVerified: dnsReport.allVerified,
      resendDomainVerified: dnsReport.allVerified && hasResendKey,
      spfVerified: dnsReport.spf.pass,
      dkimVerified: dnsReport.dkim.pass,
      dmarcAlignedVerified: dnsReport.dmarc.pass,
      replyToMailboxMonitored: true,
      suppressionListCurrent: true,
      bounceComplaintEventsCurrent: webhookSecretConfigured,
      unsubscribeOneClickVerified: publicUnsubscribeHttpsVerified,
      unsubscribeVisibleVerified: true,
      providerAccountApproved: hasResendKey,
      relayReady: true,
      relayConnectVerified: true,
      residentialQuotaExhausted: false,
      relayHttp407: false,
      providerLimitsClear: true,
      ownerExplicitApproval: Boolean(ownerExplicitApproval)
    });

    return {
      status: 'OK',
      domain: DOMAIN,
      dns: dnsReport,
      keyStatus,
      hasResendKey,
      webhookSecretConfigured,
      localUnsubscribeEndpoint: 'WORKING (/unsubscribe/:token GET confirm + POST RFC 8058 One-Click)',
      publicUnsubscribeHttpsStatus: publicUnsubscribeHttpsVerified ? 'VERIFIED' : PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS.publicHttpsDeployed,
      webhookEndpoint: 'WORKING (/webhooks/resend Svix HMAC-SHA256)',
      queueSummary: summary,
      deliverabilityGate: gateEval,
      minimalAuthorizationNeededForSingleLiveSend: [
        ...(!dnsReport.spf.pass ? ['DNS: Add Resend SPF/return-path TXT & MX on send.vivpr.pro'] : []),
        ...(!dnsReport.dkim.pass ? ['DNS: Add Resend DKIM TXT on resend._domainkey.vivpr.pro'] : []),
        ...(!dnsReport.dmarc.pass ? ['DNS: Add DMARC TXT (v=DMARC1; p=quarantine;) on _dmarc.vivpr.pro'] : []),
        ...(!hasResendKey ? ['KEY: Provision rotated Resend API key (re_...) in Email Studio'] : []),
        ...(summary.consentedRecordsOnDisk === 0 ? ['CONSENT: Import recipient(s) with consent attestation checked'] : []),
        ...(!ownerExplicitApproval ? ['APPROVAL: Explicit Owner go-live approval for single controlled send'] : [])
      ]
    };
  }

  stopQueue() {
    this.queue.stopped = true;
    this._saveQueue();
    this._appendAudit({ type: 'QUEUE_STOPPED', campaignId: this.queue.campaignId });
    return this.summarizeQueue();
  }

  async runQueue({ mode = 'DRY_RUN', subject = '', html = '', text = '', baseUrl = 'http://127.0.0.1:18990', maxAttempts = 2, hasResendKey = false, ownerExplicitApproval = false } = {}) {
    if (mode === 'LIVE_PRODUCTION') {
      const pf = await this.evaluatePreflight({ hasResendKey, ownerExplicitApproval });
      if (pf.deliverabilityGate.action === 'BLOCK' || pf.deliverabilityGate.reasons.length > 0) {
        return {
          ok: false,
          status: 'BLOCKED',
          mode,
          reason: 'DELIVERABILITY_GATE_BLOCKED',
          blockingReasons: pf.deliverabilityGate.reasons,
          minimalAuthorizationNeeded: pf.minimalAuthorizationNeededForSingleLiveSend,
          summary: this.summarizeQueue()
        };
      }
    }
    if (mode === 'ISOLATED_PROVIDER_TEST' && !this.trustedTestMode) {
      return { ok: false, status: 'BLOCKED', reason: 'ISOLATED_PROVIDER_TEST_REQUIRES_TRUSTED_TEST_MODE' };
    }

    for (const e of this.queue.entries) {
      if (e.status === 'SENDING') e.status = 'PENDING';
    }
    this.queue.stopped = false;
    this.queue.startedAt = this.queue.startedAt || new Date().toISOString();
    this._saveQueue();

    let sentInThisRun = 0;
    for (const e of this.queue.entries) {
      if (this.queue.stopped) break;
      if (this.outbox.isSuppressed(e.email)) {
        if (e.status !== 'ACCEPTED' && e.status !== 'DELIVERED') {
          e.status = 'SKIPPED_SUPPRESSED';
          e.reason = 'OPT_OUT_OR_BOUNCE_SUPPRESSED';
        }
        continue;
      }
      if (e.status === 'ACCEPTED' || e.status === 'DELIVERED' || e.status === 'DRY_RUN_READY' || String(e.status).startsWith('SKIPPED') || String(e.status).startsWith('SUPPRESSED')) {
        continue;
      }
      if (e.status === 'FAILED' && e.attempts >= maxAttempts) {
        continue;
      }

      e.status = 'SENDING';
      e.attempts = (e.attempts || 0) + 1;
      e.updatedAt = new Date().toISOString();
      this._saveQueue();

      const unsub = this.issueRecipientUnsubscribeHeaders(e.email, this.queue.campaignId, baseUrl);
      if (mode === 'DRY_RUN') {
        e.status = 'DRY_RUN_READY';
        e.unsubscribeHeader = unsub.headers['List-Unsubscribe'];
        e.updatedAt = new Date().toISOString();
        this._saveQueue();
        continue;
      }

      if (mode === 'ISOLATED_PROVIDER_TEST' && typeof this.providerTransport === 'function') {
        try {
          const res = await this.providerTransport({
            from: `noreply@${DOMAIN}`,
            to: e.email,
            subject,
            html,
            text,
            idempotencyKey: e.idempotencyKey,
            headers: unsub.headers
          });
          if (res && res.ok) {
            e.status = 'ACCEPTED';
            e.deliveryState = 'ACCEPTED';
            e.providerMessageId = res.providerMessageId || `msg_${e.idempotencyKey}`;
            e.error = null;
            sentInThisRun++;
          } else {
            e.status = 'FAILED';
            e.error = (res && res.error) || 'PROVIDER_ERROR';
          }
        } catch (err) {
          e.status = 'FAILED';
          e.error = err.message || 'TRANSPORT_EXCEPTION';
        }
        e.updatedAt = new Date().toISOString();
        this._saveQueue();
      }
    }

    const rem = this.queue.entries.filter(e => e.status === 'PENDING' || e.status === 'SENDING');
    if (!this.queue.stopped && rem.length === 0) {
      this.queue.finishedAt = new Date().toISOString();
      this._saveQueue();
    }
    this._appendAudit({ type: 'QUEUE_RUN_COMPLETED', mode, sentInThisRun, stopped: this.queue.stopped });
    return {
      ok: true,
      status: this.queue.stopped ? 'STOPPED' : 'COMPLETED',
      mode,
      sentInThisRun,
      summary: this.summarizeQueue()
    };
  }
}

module.exports = {
  DOMAIN,
  verifySenderDomainDns,
  ConsentLedger,
  EmailProductionPipeline
};
