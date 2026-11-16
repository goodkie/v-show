'use strict';
/**
 * Append-only Simulator Send Ledger (Directive #6908909594)
 * - Tracks REQUESTED -> ACCEPTED (not DELIVERED), BLOCKED, PROVIDER_ERROR, AMBIGUOUS_TIMEOUT.
 * - Persists across sidecar restarts to prevent duplicate re-POST on idempotency replay or ambiguous timeout.
 * - Never stores API keys, Bearer tokens, or customer PII.
 */
const fs = require('node:fs');
const path = require('node:path');

class EmailSimulatorLedger {
  constructor(options = {}) {
    this.ledgerFile = options.ledgerFile || path.join(__dirname, '.email_simulator_ledger.jsonl');
    this.byKey = new Map();
    this.events = [];
    this.load();
  }

  load() {
    this.byKey.clear();
    this.events = [];
    try {
      if (!fs.existsSync(this.ledgerFile)) return;
      const lines = fs.readFileSync(this.ledgerFile, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const rec = JSON.parse(trimmed);
          if (rec && typeof rec.idempotencyKey === 'string') {
            this.events.push(rec);
            this.byKey.set(rec.idempotencyKey, rec);
          }
        } catch (_) {
          // Ignore malformed/partial trailing line safely
        }
      }
    } catch (_) {}
  }

  append(entry) {
    const now = new Date().toISOString();
    const prev = entry.idempotencyKey ? this.byKey.get(entry.idempotencyKey) : null;
    const record = {
      idempotencyKey: entry.idempotencyKey || null,
      recipient: entry.recipient || null,
      from: entry.from || 'onboarding@resend.dev',
      status: entry.status,
      deliveryStatus: entry.deliveryStatus || (entry.status === 'ACCEPTED' ? 'PROVIDER_ACCEPTED_SIMULATOR_ONLY' : null),
      providerMessageId: entry.providerMessageId || null,
      httpStatus: entry.httpStatus !== undefined ? entry.httpStatus : null,
      errorCode: entry.errorCode || null,
      reason: entry.reason || null,
      message: entry.message || null,
      receiptTimestamp: entry.receiptTimestamp || null,
      createdAt: (prev && prev.createdAt) || now,
      updatedAt: now
    };
    this.events.push(record);
    if (record.idempotencyKey) {
      this.byKey.set(record.idempotencyKey, record);
    }
    try {
      fs.mkdirSync(path.dirname(this.ledgerFile), { recursive: true });
      fs.appendFileSync(this.ledgerFile, JSON.stringify(record) + '\n', { mode: 0o600 });
    } catch (_) {}
    return record;
  }

  getByIdempotencyKey(key) {
    if (!key || typeof key !== 'string') return null;
    return this.byKey.get(key) || null;
  }

  listRecent(limit = 20) {
    const items = Array.from(this.byKey.values());
    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return items.slice(0, limit);
  }
}

module.exports = { EmailSimulatorLedger };
