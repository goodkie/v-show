'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const RM = require('../extension/email-studio/recipient-manager');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s || '').trim().toLowerCase()).digest('hex');
}

function maskEmail(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  return `${s.slice(0, 2)}***@${s.slice(at + 1)}`;
}

class CampaignAnalyticsEngine {
  constructor(options = {}) {
    this.stateDir = options.stateDir;
    if (!this.stateDir) throw new Error('STATE_DIR_REQUIRED');
    this.trustedTestMode = Boolean(options.trustedTestMode);
    this.eventsFile = path.join(this.stateDir, '.email_campaign_events.jsonl');
    this.masterListFile = path.join(this.stateDir, '.email_master_list.json');
    this.masterListBackupFile = path.join(this.stateDir, '.email_master_list.json.bak');
    this.wavesFile = path.join(this.stateDir, '.email_campaign_waves.json');
    this.queueFile = path.join(this.stateDir, '.email_production_queue.json');
    this.auditFile = path.join(this.stateDir, '.email_production_audit.jsonl');
    this.consentFile = path.join(this.stateDir, '.email_consent_ledger.json');
    this.suppressedHashesFile = path.join(this.stateDir, '.suppressed_recipient_hashes.json');

    this.lastSyncAt = null;
    this.lastProviderEvent = null;
    this.syncStatus = 'IDLE';
    this.eventIds = this._loadEventIds();
  }

  _loadEventIds() {
    const ids = new Set();
    try {
      if (fs.existsSync(this.eventsFile)) {
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n').filter(Boolean);
        for (const l of lines) {
          try {
            const o = JSON.parse(l);
            if (o && o.event_id) ids.add(String(o.event_id));
            if (o && o.created_at) this.lastProviderEvent = o.created_at;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return ids;
  }

  recordEvent(evt) {
    const eventId = String(evt?.event_id || '').trim();
    if (!eventId || this.eventIds.has(eventId)) return false;
    this.eventIds.add(eventId);
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.appendFileSync(this.eventsFile, JSON.stringify(evt) + '\n', { mode: 0o600 });
    if (evt.created_at) this.lastProviderEvent = evt.created_at;
    return true;
  }

  listEvents() {
    if (!fs.existsSync(this.eventsFile)) return [];
    const out = [];
    for (const l of fs.readFileSync(this.eventsFile, 'utf8').split('\n').filter(Boolean)) {
      try { out.push(JSON.parse(l)); } catch (_) {}
    }
    return out;
  }

  async syncRemoteEvents({ baseUrl, syncToken, fetchImpl = null } = {}) {
    const targetBase = String(baseUrl || '').replace(/\/+$/, '');
    const tok = String(syncToken || '').trim();
    const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch;
    if (!targetBase || !tok || typeof doFetch !== 'function') {
      this.syncStatus = 'NOT_CONFIGURED';
      return { ok: false, reason: 'EVENT_SYNC_NOT_CONFIGURED', added: 0 };
    }
    try {
      const resp = await doFetch(`${targetBase}/api/sync/events?limit=2000`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tok}` }
      });
      if (!resp || !resp.ok) {
        this.syncStatus = 'DISCONNECTED';
        return { ok: false, reason: `EVENT_SYNC_HTTP_${resp ? resp.status : 'ERR'}`, added: 0 };
      }
      const data = await resp.json().catch(() => ({}));
      const list = Array.isArray(data.events) ? data.events : [];
      let added = 0;
      for (const evt of list) {
        if (this.recordEvent(evt)) added++;
      }
      this.lastSyncAt = new Date().toISOString();
      this.syncStatus = 'OK';
      return { ok: true, added, totalRemote: list.length, lastSyncAt: this.lastSyncAt };
    } catch (err) {
      this.syncStatus = 'DISCONNECTED';
      return { ok: false, reason: err.message || 'EVENT_SYNC_ERROR', added: 0 };
    }
  }

  _readJsonSafe(fp, fallback) {
    try {
      if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) {}
    return fallback;
  }

  _buildEventsIndexByEmailIdAndHash() {
    const byEmailId = new Map();
    const byHash = new Map();
    for (const evt of this.listEvents()) {
      if (evt.email_id) {
        if (!byEmailId.has(evt.email_id)) byEmailId.set(evt.email_id, []);
        byEmailId.get(evt.email_id).push(evt);
      }
      const hashes = Array.isArray(evt.recipient_hashes) ? evt.recipient_hashes : [];
      for (const h of hashes) {
        if (!byHash.has(h)) byHash.set(h, []);
        byHash.get(h).push(evt);
      }
    }
    return { byEmailId, byHash };
  }

  getCampaignProgress(campaignId = 'default') {
    const q = this._readJsonSafe(this.queueFile, { campaignId: 'default', entries: [] });
    const entries = (q.campaignId === campaignId || campaignId === 'default') ? (Array.isArray(q.entries) ? q.entries : []) : [];
    const suppressedMap = this._readJsonSafe(this.suppressedHashesFile, {});
    const { byEmailId, byHash } = this._buildEventsIndexByEmailIdAndHash();

    const target = entries.length;
    let remainingToSubmit = 0;
    let inFlight = 0;
    let apiAccepted = 0;
    let delivered = 0;
    let bouncedHard = 0;
    let bouncedSoft = 0;
    let complained = 0;
    let failed = 0;
    let suppressed = 0;
    let unsubscribed = 0;
    let unknown = 0;
    let openedUnique = 0;
    let clickedUnique = 0;
    const errorsSummary = {};

    for (const e of entries) {
      const rh = sha256Hex(e.email);
      const evts = e.providerMessageId && byEmailId.has(e.providerMessageId)
        ? byEmailId.get(e.providerMessageId)
        : (byHash.get(rh) || []);

      const types = new Set(evts.map(x => x.type));
      const hasBounce = types.has('email.bounced');
      const hasComplaint = types.has('email.complained');
      const hasDelivered = types.has('email.delivered');
      const hasOpened = types.has('email.opened');
      const hasClicked = types.has('email.clicked');
      const supRec = suppressedMap[rh];

      if (e.status === 'PENDING') remainingToSubmit++;
      else if (e.status === 'SENDING') inFlight++;
      else if (e.status === 'FAILED') {
        failed++;
        const reason = String(e.error || 'FAILED').slice(0, 80);
        errorsSummary[reason] = (errorsSummary[reason] || 0) + 1;
      } else if (e.status === 'SKIPPED_SUPPRESSED' || e.status === 'SKIPPED_NO_CONSENT' || e.status === 'BLOCKED_CONSENT_UNVERIFIED') {
        suppressed++;
      } else if (e.status === 'ACCEPTED' || e.status === 'DELIVERED') {
        apiAccepted++;
        if (hasComplaint) {
          complained++;
        } else if (hasBounce) {
          const bEvt = evts.find(x => x.type === 'email.bounced');
          if (bEvt && bEvt.bounce_type === 'soft') bouncedSoft++;
          else bouncedHard++;
        } else if (hasDelivered || e.status === 'DELIVERED') {
          delivered++;
        }
        if (supRec && supRec.reason === 'UNSUBSCRIBED') unsubscribed++;
        if (hasOpened) openedUnique++;
        if (hasClicked) clickedUnique++;
      } else {
        unknown++;
      }
    }

    const deliveryPending = Math.max(0, apiAccepted - delivered - bouncedHard - bouncedSoft - complained);
    const acceptedPct = target > 0 ? Math.round((apiAccepted / target) * 1000) / 10 : 0;
    const deliveredPct = target > 0 ? Math.round((delivered / target) * 1000) / 10 : 0;

    return {
      ok: true,
      campaignId: q.campaignId || campaignId,
      batchId: q.startedAt ? `batch_${String(q.startedAt).replace(/[^0-9]/g, '').slice(0, 14)}` : 'idle',
      target,
      remainingToSubmit,
      inFlight,
      apiAccepted,
      deliveryPending,
      delivered,
      bounced: bouncedHard + bouncedSoft,
      bouncedHard,
      bouncedSoft,
      complained,
      failed,
      suppressed,
      unsubscribed,
      unknown,
      openedUnique,
      clickedUnique,
      acceptedPct,
      deliveredPct,
      startedAt: q.startedAt || null,
      finishedAt: q.finishedAt || null,
      updatedAt: new Date().toISOString(),
      stopped: Boolean(q.stopped),
      lastSyncAt: this.lastSyncAt,
      lastProviderEvent: this.lastProviderEvent,
      syncStatus: this.syncStatus,
      errorsSummary
    };
  }

  _loadMasterList() {
    if (!fs.existsSync(this.masterListFile)) {
      return { version: 1, updatedAt: null, records: {} };
    }
    if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
      verifyWindowsDacl(this.masterListFile, process.env.USERNAME);
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.masterListFile, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.records && typeof parsed.records === 'object') {
        return parsed;
      }
    } catch (_) {}
    if (fs.existsSync(this.masterListBackupFile)) {
      try {
        const bak = JSON.parse(fs.readFileSync(this.masterListBackupFile, 'utf8'));
        if (bak && bak.records) return bak;
      } catch (_) {}
    }
    return { version: 1, updatedAt: null, records: {} };
  }

  _saveMasterList(store) {
    store.updatedAt = new Date().toISOString();
    const json = JSON.stringify(store, null, 2) + '\n';
    if (fs.existsSync(this.masterListFile)) {
      try { writeProtectedSecretFile(this.masterListBackupFile, fs.readFileSync(this.masterListFile, 'utf8')); } catch (_) {}
    }
    writeProtectedSecretFile(this.masterListFile, json);
  }

  syncMasterListFromRuntime() {
    const store = this._loadMasterList();
    const consent = this._readJsonSafe(this.consentFile, { records: {} });
    const q = this._readJsonSafe(this.queueFile, { campaignId: 'default', entries: [] });
    const sup = this._readJsonSafe(this.suppressedHashesFile, {});
    const { byEmailId, byHash } = this._buildEventsIndexByEmailIdAndHash();

    for (const cRec of Object.values(consent.records || {})) {
      const email = RM.normalizeEmail(cRec.email);
      if (!email) continue;
      const cur = store.records[email] || {
        email,
        name: cRec.name || '',
        source: cRec.authorizationSource || 'consent_ledger',
        lawfulBasis: 'EXPLICIT_OPT_IN',
        jurisdiction: 'GLOBAL',
        attestationAt: cRec.authorizationAt || null,
        tags: [],
        firstSentAt: null,
        lastSentAt: null,
        sendCount: 0,
        campaignHistory: [],
        lastDeliveryStatus: null,
        lastOpenedAt: null,
        lastClickedAt: null,
        bounceType: null,
        complained: false,
        unsubscribed: false,
        suppressionReason: null,
        lastEventAt: null
      };
      cur.attestationAt = cur.attestationAt || cRec.authorizationAt || null;
      store.records[email] = cur;
    }

    for (const e of (q.entries || [])) {
      const email = RM.normalizeEmail(e.email);
      if (!email) continue;
      const rh = sha256Hex(email);
      const cur = store.records[email] || {
        email,
        name: e.name || '',
        source: q.lawfulBasis || 'studio-csv',
        lawfulBasis: e.lawfulBasis || q.lawfulBasis || 'EXPLICIT_OPT_IN',
        jurisdiction: e.jurisdiction || q.jurisdiction || 'GLOBAL',
        attestationAt: e.updatedAt || null,
        tags: [],
        firstSentAt: null,
        lastSentAt: null,
        sendCount: 0,
        campaignHistory: [],
        lastDeliveryStatus: null,
        lastOpenedAt: null,
        lastClickedAt: null,
        bounceType: null,
        complained: false,
        unsubscribed: false,
        suppressionReason: null,
        lastEventAt: null
      };
      if (e.status === 'ACCEPTED' || e.status === 'DELIVERED') {
        if (!cur.campaignHistory.includes(q.campaignId || 'default')) {
          cur.campaignHistory.push(q.campaignId || 'default');
          cur.sendCount = (cur.sendCount || 0) + 1;
        }
        cur.firstSentAt = cur.firstSentAt || e.updatedAt || null;
        cur.lastSentAt = e.updatedAt || cur.lastSentAt;
        cur.lastDeliveryStatus = cur.lastDeliveryStatus || 'ACCEPTED';
      }
      const evts = e.providerMessageId && byEmailId.has(e.providerMessageId) ? byEmailId.get(e.providerMessageId) : (byHash.get(rh) || []);
      for (const evt of evts) {
        cur.lastEventAt = evt.created_at || cur.lastEventAt;
        if (evt.type === 'email.delivered' && !cur.bounceType && !cur.complained) cur.lastDeliveryStatus = 'DELIVERED';
        if (evt.type === 'email.opened') cur.lastOpenedAt = evt.created_at || cur.lastOpenedAt;
        if (evt.type === 'email.clicked') cur.lastClickedAt = evt.created_at || cur.lastClickedAt;
        if (evt.type === 'email.bounced') {
          cur.bounceType = evt.bounce_type || 'hard';
          cur.lastDeliveryStatus = 'BOUNCED';
          if (cur.bounceType === 'hard') cur.suppressionReason = 'HARD_BOUNCED';
        }
        if (evt.type === 'email.complained') {
          cur.complained = true;
          cur.lastDeliveryStatus = 'COMPLAINED';
          cur.suppressionReason = 'COMPLAINED';
        }
      }
      if (sup[rh]) {
        cur.unsubscribed = sup[rh].reason === 'UNSUBSCRIBED' ? true : cur.unsubscribed;
        cur.suppressionReason = sup[rh].reason || cur.suppressionReason;
      }
      store.records[email] = cur;
    }

    this._saveMasterList(store);
    return this.getMasterListSummary();
  }

  getMasterListSummary() {
    const store = this._loadMasterList();
    const all = Object.values(store.records || {});
    let activeEligible = 0;
    let suppressedCount = 0;
    let deliveredCount = 0;
    let openedCount = 0;
    for (const r of all) {
      if (r.suppressionReason || r.unsubscribed || r.complained || r.bounceType === 'hard') suppressedCount++;
      else activeEligible++;
      if (r.lastDeliveryStatus === 'DELIVERED') deliveredCount++;
      if (r.lastOpenedAt) openedCount++;
    }
    return {
      ok: true,
      total: all.length,
      activeEligible,
      suppressedCount,
      deliveredCount,
      openedCount,
      updatedAt: store.updatedAt
    };
  }

  exportMasterListCsv() {
    const store = this._loadMasterList();
    const header = 'email_masked,name,lawful_basis,jurisdiction,send_count,last_delivery_status,last_opened_at,bounce_type,complained,unsubscribed,suppression_reason';
    const rows = Object.values(store.records || {}).map(r => [
      maskEmail(r.email),
      JSON.stringify(String(r.name || '')),
      r.lawfulBasis || '',
      r.jurisdiction || '',
      r.sendCount || 0,
      r.lastDeliveryStatus || '',
      r.lastOpenedAt || '',
      r.bounceType || '',
      Boolean(r.complained),
      Boolean(r.unsubscribed),
      r.suppressionReason || ''
    ].join(','));
    return [header, ...rows].join('\n');
  }

  getCampaignSegments(campaignId = 'default', { cutoffHours = 24 } = {}) {
    const q = this._readJsonSafe(this.queueFile, { campaignId: 'default', entries: [] });
    const entries = (q.campaignId === campaignId || campaignId === 'default') ? (q.entries || []) : [];
    const sup = this._readJsonSafe(this.suppressedHashesFile, {});
    const { byEmailId, byHash } = this._buildEventsIndexByEmailIdAndHash();
    const cutoffMs = Number(cutoffHours) > 0 ? Date.now() - Number(cutoffHours) * 3600000 : Date.now();

    const opened = [];
    const notConfirmedOpened = [];
    const acceptedPendingDelivery = [];
    const excluded = [];

    for (const e of entries) {
      const rh = sha256Hex(e.email);
      const evts = e.providerMessageId && byEmailId.has(e.providerMessageId) ? byEmailId.get(e.providerMessageId) : (byHash.get(rh) || []);
      const types = new Set(evts.map(x => x.type));
      const isSup = Boolean(sup[rh]) || types.has('email.bounced') || types.has('email.complained');
      if (e.status !== 'ACCEPTED' && e.status !== 'DELIVERED') {
        excluded.push({ masked: maskEmail(e.email), reason: e.status });
        continue;
      }
      if (isSup) {
        excluded.push({ masked: maskEmail(e.email), reason: sup[rh]?.reason || (types.has('email.complained') ? 'COMPLAINED' : 'BOUNCED') });
        continue;
      }
      if (types.has('email.opened')) {
        opened.push({ email: e.email, masked: maskEmail(e.email), providerMessageId: e.providerMessageId });
      } else if (types.has('email.delivered') || e.status === 'DELIVERED') {
        const sentMs = e.updatedAt ? Date.parse(e.updatedAt) : 0;
        if (!sentMs || sentMs <= cutoffMs || Number(cutoffHours) === 0) {
          notConfirmedOpened.push({ email: e.email, masked: maskEmail(e.email), providerMessageId: e.providerMessageId });
        } else {
          acceptedPendingDelivery.push({ masked: maskEmail(e.email), reason: 'WITHIN_CUTOFF_WINDOW' });
        }
      } else {
        acceptedPendingDelivery.push({ masked: maskEmail(e.email), reason: 'DELIVERY_NOT_YET_CONFIRMED' });
      }
    }

    return {
      ok: true,
      campaignId: q.campaignId || campaignId,
      cutoffHours: Number(cutoffHours),
      openedCount: opened.length,
      notConfirmedOpenedCount: notConfirmedOpened.length,
      acceptedPendingDeliveryCount: acceptedPendingDelivery.length,
      excludedCount: excluded.length,
      opened: opened.map(x => ({ masked: x.masked })),
      notConfirmedOpenedEmails: notConfirmedOpened.map(x => x.email),
      notConfirmedOpenedMasked: notConfirmedOpened.map(x => x.masked),
      excluded,
      caveat: '이미지 차단 또는 Apple Mail Privacy Protection(MPP)으로 인해 실제 열람 시에도 email.opened 이벤트가 기록되지 않거나 지연될 수 있습니다.'
    };
  }

  previewSecondWave({ parentCampaignId = 'default', cutoffHours = 24, waveCampaignId = null } = {}) {
    const seg = this.getCampaignSegments(parentCampaignId, { cutoffHours });
    const waves = this._readJsonSafe(this.wavesFile, {});
    const resolvedWaveId = waveCampaignId || `${parentCampaignId}_wave2`;
    const priorWaveSent = new Set((waves[resolvedWaveId]?.sentHashes) || []);
    const eligible = [];
    let priorWaveSkipped = 0;
    for (const email of seg.notConfirmedOpenedEmails) {
      if (priorWaveSent.has(sha256Hex(email))) {
        priorWaveSkipped++;
      } else {
        eligible.push(email);
      }
    }
    return {
      ok: true,
      parentCampaignId,
      waveCampaignId: resolvedWaveId,
      cutoffHours: Number(cutoffHours),
      candidateCount: seg.notConfirmedOpenedCount,
      eligibleCount: eligible.length,
      excludedCount: seg.excludedCount + seg.acceptedPendingDeliveryCount + seg.openedCount + priorWaveSkipped,
      priorWaveSkipped,
      eligibleMasked: eligible.map(maskEmail),
      eligibleCsv: eligible.map(e => `${e},`).join('\n'),
      caveat: seg.caveat
    };
  }

  async reconcileWithResendApi({ apiKey, campaignId = 'default', limit = 25, fetchImpl = null } = {}) {
    const key = String(apiKey || '').trim();
    const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch;
    if (!key || typeof doFetch !== 'function') {
      return { ok: false, reason: 'RESEND_KEY_OR_FETCH_UNAVAILABLE', checked: 0, updated: 0 };
    }
    const q = this._readJsonSafe(this.queueFile, { campaignId: 'default', entries: [] });
    const entries = (q.campaignId === campaignId || campaignId === 'default') ? (q.entries || []) : [];
    const { byEmailId } = this._buildEventsIndexByEmailIdAndHash();
    const maxCheck = Math.min(Math.max(Number(limit) || 25, 1), 100);
    let checked = 0;
    let updated = 0;
    for (const e of entries) {
      if (checked >= maxCheck) break;
      if (e.status !== 'ACCEPTED' || !e.providerMessageId) continue;
      const evts = byEmailId.get(e.providerMessageId) || [];
      const hasTerminal = evts.some(x => x.type === 'email.delivered' || x.type === 'email.bounced' || x.type === 'email.complained');
      if (hasTerminal) continue;
      checked++;
      try {
        const resp = await doFetch(`https://api.resend.com/emails/${encodeURIComponent(e.providerMessageId)}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!resp || !resp.ok) continue;
        const det = await resp.json().catch(() => ({}));
        const lastEvt = String(det.last_event || '').toLowerCase();
        const evtMap = {
          delivered: 'email.delivered',
          bounced: 'email.bounced',
          complained: 'email.complained',
          opened: 'email.opened',
          clicked: 'email.clicked',
          delivery_delayed: 'email.delivery_delayed'
        };
        const mappedType = evtMap[lastEvt];
        if (mappedType) {
          const added = this.recordEvent({
            event_id: `reconcile:${e.providerMessageId}:${mappedType}`,
            type: mappedType,
            email_id: e.providerMessageId,
            recipient_hashes: [sha256Hex(e.email)],
            created_at: det.created_at || new Date().toISOString(),
            source: 'RESEND_API_RECONCILE'
          });
          if (added) updated++;
        }
      } catch (_) {}
      if (typeof fetchImpl !== 'function') {
        await new Promise(r => setTimeout(r, 150));
      }
    }
    this.lastSyncAt = new Date().toISOString();
    return { ok: true, checked, updated, lastSyncAt: this.lastSyncAt };
  }
}

module.exports = {
  CampaignAnalyticsEngine,
  sha256Hex,
  maskEmail
};
