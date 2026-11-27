'use strict';
/**
 * XPIDER V7.1 Durable Local Full-Campaign Store (Save / Load / Delete / JSON Export-Import).
 *
 * Security & Compliance Invariants:
 * - Persisted strictly in local NTFS user-protected stateDir (.email_saved_campaigns.json).
 * - NEVER stores API keys, OAuth tokens, client secrets, Sidecar bearer tokens, or cookies.
 * - NEVER persists human send-approval / consent-attestation flags; loading a campaign always
 *   resets live-send consent & approval checkboxes to false (fail-closed human review).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('./email-test-sidecar-set-key');

const MAX_SAVED_CAMPAIGNS = 100;
const MAX_SNAPSHOT_BYTES = 1024 * 1024; // 1MB per campaign cap (enough for thousands of CSV rows safely)
const SECRET_KEY_RE = /(?:^|_)(?:token|secret|apikey|api_key|password|passwd|authorization|oauth|refresh|cookie|privatekey|private_key)(?:$|_)/i;
const GOOGLE_SECRET_PREFIX = ['GOC', 'SPX-'].join('');
const SECRET_VALUE_RE = new RegExp(`\\b(?:re_[A-Za-z0-9_-]{12,}|${GOOGLE_SECRET_PREFIX}[A-Za-z0-9_-]{8,}|gh[po]_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{16,}|ya29\\.[A-Za-z0-9._-]{16,}|1\\/\\/[A-Za-z0-9._-]{16,}|Bearer\\s+[A-Za-z0-9._-]{16,})\\b`);
const APPROVAL_KEYS = new Set([
  'consentAttest',
  'consentAttestProd',
  'consentAttested',
  'ownerExplicitApproval',
  'ownerTestConsentConfirmed',
  'recipientConsentConfirmed',
  'realTestConsentCheck',
  'gmailSelfTestConsent',
  'gmailHygieneConfirm',
  'gmailProviderSwitchConfirm',
  'gmailOAuthConsentCheck',
  'publicImageUploadConsent',
  'resendKeyConsent',
  'geminiKeyConsent'
]);

function sanitizeCampaignId(raw) {
  const s = String(raw || '').trim().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
  return s || ('camp_' + crypto.randomBytes(6).toString('hex'));
}

function sanitizeCampaignName(raw) {
  return String(raw || '').replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 100);
}

function sanitizeDeep(val, depth = 0) {
  if (depth > 8) return null;
  if (val === null || val === undefined) return val;
  if (typeof val === 'boolean' || typeof val === 'number') return Number.isFinite(val) || typeof val === 'boolean' ? val : 0;
  if (typeof val === 'string') {
    const clean = val.replace(/\u0000/g, '').slice(0, 500000);
    if (SECRET_VALUE_RE.test(clean)) return '';
    return clean;
  }
  if (Array.isArray(val)) {
    return val.slice(0, 500).map(item => sanitizeDeep(item, depth + 1));
  }
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (SECRET_KEY_RE.test(k)) continue;
      if (APPROVAL_KEYS.has(k)) continue;
      out[k] = sanitizeDeep(v, depth + 1);
    }
    return out;
  }
  return '';
}

function sanitizeCampaignSnapshot(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('INVALID_CAMPAIGN_SNAPSHOT');
  }
  const clean = sanitizeDeep(raw, 0) || {};
  const id = sanitizeCampaignId(clean.id);
  const templateObj = (clean.template && typeof clean.template === 'object') ? clean.template : {};
  const fallbackName = String(templateObj.subject || clean.campaignId || '').trim().slice(0, 60) || 'Saved Campaign';
  const name = sanitizeCampaignName(clean.name || fallbackName) || 'Saved Campaign';
  const provider = String(clean.provider || 'RESEND').toUpperCase() === 'GMAIL' ? 'GMAIL' : 'RESEND';
  const nowIso = new Date().toISOString();

  const snapshot = {
    schemaVersion: 'xpider-full-campaign-v1',
    id,
    name,
    notes: sanitizeCampaignName(clean.notes || '').slice(0, 240),
    provider,
    campaignId: String(clean.campaignId || 'default').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'default',
    savedAt: clean.savedAt && typeof clean.savedAt === 'string' ? clean.savedAt : nowIso,
    updatedAt: nowIso,
    template: templateObj,
    recipients: (clean.recipients && typeof clean.recipients === 'object') ? clean.recipients : {},
    abTest: (clean.abTest && typeof clean.abTest === 'object') ? clean.abTest : {},
    deliverability: (clean.deliverability && typeof clean.deliverability === 'object') ? clean.deliverability : {},
    gmail: (clean.gmail && typeof clean.gmail === 'object') ? clean.gmail : {},
    resend: (clean.resend && typeof clean.resend === 'object') ? clean.resend : {}
  };

  const byteLen = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  if (byteLen > MAX_SNAPSHOT_BYTES) {
    throw new Error('CAMPAIGN_SNAPSHOT_TOO_LARGE');
  }
  return snapshot;
}

class EmailCampaignStore {
  constructor({ stateDir, trustedTestMode = false } = {}) {
    if (!stateDir) throw new Error('STATE_DIR_REQUIRED');
    this.stateDir = stateDir;
    this.trustedTestMode = Boolean(trustedTestMode);
    this.storeFile = path.join(this.stateDir, '.email_saved_campaigns.json');
  }

  _readAllRaw() {
    if (!fs.existsSync(this.storeFile)) return [];
    if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
      try {
        verifyWindowsDacl(this.storeFile, process.env.USERNAME);
      } catch (_) {
        return [];
      }
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storeFile, 'utf8'));
      return Array.isArray(parsed?.campaigns) ? parsed.campaigns : [];
    } catch (_) {
      return [];
    }
  }

  _writeAll(campaigns) {
    fs.mkdirSync(path.dirname(this.storeFile), { recursive: true });
    const payload = JSON.stringify({
      schemaVersion: 'xpider-full-campaign-store-v1',
      updatedAt: new Date().toISOString(),
      campaigns
    }, null, 2) + '\n';
    if (!this.trustedTestMode) {
      writeProtectedSecretFile(this.storeFile, payload);
      return;
    }
    const tmp = `${this.storeFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, payload, { mode: 0o600 });
    fs.renameSync(tmp, this.storeFile);
  }

  listCampaigns() {
    const items = this._readAllRaw()
      .filter(c => c && typeof c === 'object' && c.id)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return {
      ok: true,
      count: items.length,
      maxCampaigns: MAX_SAVED_CAMPAIGNS,
      campaigns: items
    };
  }

  saveCampaign(rawPayload = {}) {
    try {
      const snapshot = sanitizeCampaignSnapshot(rawPayload);
      const existing = this._readAllRaw().filter(c => c && c.id);
      const idx = existing.findIndex(c => c.id === snapshot.id);
      if (idx >= 0) {
        snapshot.savedAt = existing[idx].savedAt || snapshot.savedAt;
        existing[idx] = snapshot;
      } else {
        existing.unshift(snapshot);
      }
      const trimmed = existing
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .slice(0, MAX_SAVED_CAMPAIGNS);
      this._writeAll(trimmed);
      return {
        ok: true,
        statusCode: 200,
        campaign: snapshot,
        count: trimmed.length,
        campaigns: trimmed
      };
    } catch (err) {
      return {
        ok: false,
        statusCode: 400,
        reason: err?.message || 'CAMPAIGN_SAVE_FAILED'
      };
    }
  }

  deleteCampaign(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) {
      return { ok: false, statusCode: 400, reason: 'CAMPAIGN_ID_REQUIRED' };
    }
    const existing = this._readAllRaw().filter(c => c && c.id);
    const next = existing.filter(c => c.id !== cleanId);
    const deleted = next.length !== existing.length;
    if (deleted) this._writeAll(next);
    return {
      ok: true,
      statusCode: 200,
      deleted,
      count: next.length,
      campaigns: next
    };
  }
}

module.exports = {
  EmailCampaignStore,
  sanitizeCampaignSnapshot,
  MAX_SAVED_CAMPAIGNS
};
