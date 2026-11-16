'use strict';
/**
 * Append-only Simulator Send Ledger (Directive #6908909594 & #6909086536)
 * - Transactional durable append + fsync BEFORE updating in-memory state.
 * - Fails closed on disk-full / permission errors (throws LEDGER_PERSISTENCE_FAILED).
 * - Scrubs API keys, Bearer tokens, and non-simulator PII before persistence & export.
 * - Tracks corrupt/partial lines on reload without crashing.
 */
const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_SIMULATOR_EMAILS = new Set([
  'delivered@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev',
  'onboarding@resend.dev'
]);

function sanitizeLedgerText(val) {
  if (val === undefined || val === null) return null;
  let s = String(val);
  s = s.replace(/\bre_[A-Za-z0-9_-]{6,}\b/g, '[REDACTED_API_KEY]');
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]{6,}/gi, 'Bearer [REDACTED_TOKEN]');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (email) => {
    return ALLOWED_SIMULATOR_EMAILS.has(email.toLowerCase()) ? email : '[REDACTED_EMAIL]';
  });
  return s.slice(0, 500);
}

function sanitizeRecipient(recipient) {
  if (!recipient || typeof recipient !== 'string') return null;
  const trimmed = recipient.trim().toLowerCase();
  return ALLOWED_SIMULATOR_EMAILS.has(trimmed) ? trimmed : '[REDACTED_NON_SIMULATOR_RECIPIENT]';
}

class EmailSimulatorLedger {
  constructor(options = {}) {
    this.ledgerFile = options.ledgerFile || path.join(__dirname, '.email_simulator_ledger.jsonl');
    this.fsImpl = options.fsImpl || fs;
    this.byKey = new Map();
    this.events = [];
    this.corruptLineCount = 0;
    this.lastPersistError = null;
    this.load();
  }

  load() {
    this.byKey.clear();
    this.events = [];
    this.corruptLineCount = 0;
    try {
      if (!this.fsImpl.existsSync(this.ledgerFile)) return;
      const lines = this.fsImpl.readFileSync(this.ledgerFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const rec = JSON.parse(trimmed);
          if (rec && typeof rec.idempotencyKey === 'string' && typeof rec.status === 'string') {
            this.events.push(rec);
            this.byKey.set(rec.idempotencyKey, rec);
          } else {
            this.corruptLineCount++;
          }
        } catch (_) {
          this.corruptLineCount++;
        }
      }
    } catch (err) {
      this.lastPersistError = err.message;
    }
  }

  append(entry) {
    const now = new Date().toISOString();
    const prev = entry.idempotencyKey ? this.byKey.get(entry.idempotencyKey) : null;
    const record = {
      idempotencyKey: entry.idempotencyKey || null,
      recipient: sanitizeRecipient(entry.recipient),
      from: sanitizeRecipient(entry.from || 'onboarding@resend.dev') || 'onboarding@resend.dev',
      status: entry.status,
      deliveryStatus: entry.deliveryStatus || (entry.status === 'ACCEPTED' ? 'PROVIDER_ACCEPTED_SIMULATOR_ONLY' : null),
      providerMessageId: entry.providerMessageId ? sanitizeLedgerText(entry.providerMessageId) : null,
      httpStatus: entry.httpStatus !== undefined ? entry.httpStatus : null,
      errorCode: entry.errorCode ? sanitizeLedgerText(entry.errorCode) : null,
      reason: entry.reason ? sanitizeLedgerText(entry.reason) : null,
      message: entry.message ? sanitizeLedgerText(entry.message) : null,
      receiptTimestamp: entry.receiptTimestamp || null,
      createdAt: (prev && prev.createdAt) || now,
      updatedAt: now
    };

    const serialized = JSON.stringify(record) + '\n';
    this.fsImpl.mkdirSync(path.dirname(this.ledgerFile), { recursive: true });
    let fd = null;
    try {
      fd = this.fsImpl.openSync(this.ledgerFile, 'a', 0o600);
      const buf = Buffer.from(serialized, 'utf8');
      const written = this.fsImpl.writeSync(fd, buf, 0, buf.length, null);
      if (written !== buf.length) {
        throw new Error(`SHORT_WRITE: wrote ${written} of ${buf.length} bytes`);
      }
      this.fsImpl.fsyncSync(fd);
    } catch (err) {
      this.lastPersistError = err.message;
      const persistErr = new Error(`LEDGER_PERSISTENCE_FAILED: ${err.message}`);
      persistErr.code = 'LEDGER_PERSISTENCE_FAILED';
      persistErr.cause = err;
      throw persistErr;
    } finally {
      if (fd !== null) {
        try { this.fsImpl.closeSync(fd); } catch (_) {}
      }
    }

    // Update memory ONLY after durable write + fsync succeeded
    this.lastPersistError = null;
    this.events.push(record);
    if (record.idempotencyKey) {
      this.byKey.set(record.idempotencyKey, record);
    }
    return record;
  }

  getByIdempotencyKey(key) {
    if (!key || typeof key !== 'string') return null;
    return this.byKey.get(key) || null;
  }

  listRecent(limit = 20) {
    const items = Array.from(this.byKey.values());
    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return items.slice(0, limit).map(item => ({
      ...item,
      message: item.message ? sanitizeLedgerText(item.message) : null,
      reason: item.reason ? sanitizeLedgerText(item.reason) : null,
      errorCode: item.errorCode ? sanitizeLedgerText(item.errorCode) : null
    }));
  }
}

module.exports = { EmailSimulatorLedger, sanitizeLedgerText, sanitizeRecipient };
