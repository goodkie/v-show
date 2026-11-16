'use strict';
/**
 * Append-only Simulator Send Ledger (Directive #6908909594, #6909086536, #6909266178, #6909563410)
 * - Cross-process exclusive wx lockfile with unique lockId ownership nonce.
 * - Never steals a lock from a verified live PID based on elapsed age alone.
 * - Ownership-verified release in finally block (never unlinks a newer owner's lock).
 * - Fails closed in BOTH append() and reserveRequest() when ledger is corrupt/truncated/unreadable.
 * - Transactional durable append + fsync BEFORE updating in-memory state.
 * - Scrubs API keys, Bearer tokens, and non-simulator PII before persistence & export.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

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

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

class EmailSimulatorLedger {
  constructor(options = {}) {
    this.ledgerFile = options.ledgerFile || path.join(__dirname, '.email_simulator_ledger.jsonl');
    this.lockFile = options.lockFile || (this.ledgerFile + '.lock');
    this.lockTimeoutMs = Number.isFinite(options.lockTimeoutMs) ? options.lockTimeoutMs : 2500;
    this.staleLockMs = Number.isFinite(options.staleLockMs) ? options.staleLockMs : 15000;
    this.fsImpl = options.fsImpl || fs;
    this.byKey = new Map();
    this.events = [];
    this.corruptLineCount = 0;
    this.reconciliationRequired = false;
    this.corruptReason = null;
    this.lastPersistError = null;
    this.load();
  }

  load() {
    this.byKey.clear();
    this.events = [];
    this.corruptLineCount = 0;
    this.reconciliationRequired = false;
    this.corruptReason = null;
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
      if (this.corruptLineCount > 0) {
        this.reconciliationRequired = true;
        this.corruptReason = `CORRUPT_LEDGER_LINES:${this.corruptLineCount}`;
      }
    } catch (err) {
      this.lastPersistError = err.message;
      this.reconciliationRequired = true;
      this.corruptReason = `UNREADABLE_LEDGER:${err.message}`;
    }
  }

  _withExclusiveLock(fn) {
    const dir = path.dirname(this.lockFile);
    this.fsImpl.mkdirSync(dir, { recursive: true });
    const deadline = Date.now() + this.lockTimeoutMs;
    const myLockId = crypto.randomBytes(16).toString('hex');
    let acquired = false;

    while (!acquired) {
      try {
        const lfd = this.fsImpl.openSync(this.lockFile, 'wx', 0o600);
        try {
          this.fsImpl.writeSync(lfd, JSON.stringify({
            pid: process.pid,
            lockId: myLockId,
            createdAt: Date.now()
          }));
        } finally {
          this.fsImpl.closeSync(lfd);
        }
        acquired = true;
      } catch (err) {
        if (!err || err.code !== 'EEXIST') {
          const lockErr = new Error(`LEDGER_LOCK_FAILED: ${err ? err.message : 'unknown'}`);
          lockErr.code = 'LEDGER_LOCK_FAILED';
          throw lockErr;
        }
        // Inspect existing lock: NEVER reclaim a verified live PID based solely on elapsed age!
        let shouldReclaimDead = false;
        try {
          const raw = this.fsImpl.readFileSync(this.lockFile, 'utf8');
          const info = JSON.parse(raw);
          const ownerPid = Number(info.pid);
          if (!isPidAlive(ownerPid)) {
            shouldReclaimDead = true;
          }
          // If ownerPid IS alive, do NOT reclaim regardless of ageMs! Wait until deadline.
        } catch (_) {
          // Malformed or partial lockfile: only reclaim if older than staleLockMs
          try {
            const st = this.fsImpl.statSync(this.lockFile);
            if ((Date.now() - st.mtimeMs) > this.staleLockMs) {
              shouldReclaimDead = true;
            }
          } catch (_) {
            // Lock disappeared concurrently; retry immediately
            continue;
          }
        }

        if (shouldReclaimDead) {
          // Safe reclaim: rename aside to avoid unlinking a newly created lock if we lost a race
          const deadAside = `${this.lockFile}.reclaimed.${myLockId}`;
          try {
            this.fsImpl.renameSync(this.lockFile, deadAside);
            try { this.fsImpl.unlinkSync(deadAside); } catch (_) {}
          } catch (_) {
            // Lost rename race to another process; retry loop cleanly
          }
          continue;
        }

        if (Date.now() >= deadline) {
          const timeoutErr = new Error('LEDGER_LOCK_CONTENTION: Another active sidecar process holds the ledger lock');
          timeoutErr.code = 'LEDGER_LOCK_CONTENTION';
          throw timeoutErr;
        }
        const waitUntil = Date.now() + 15;
        while (Date.now() < waitUntil) {}
      }
    }

    try {
      return fn();
    } finally {
      // Ownership-verified release: only unlink if lockfile still belongs to (process.pid, myLockId)
      try {
        const currentRaw = this.fsImpl.readFileSync(this.lockFile, 'utf8');
        const current = JSON.parse(currentRaw);
        if (Number(current.pid) === process.pid && current.lockId === myLockId) {
          this.fsImpl.unlinkSync(this.lockFile);
        }
      } catch (_) {}
    }
  }

  _appendUnlocked(entry) {
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
    const isNewFile = !this.fsImpl.existsSync(this.ledgerFile);
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

    if (isNewFile && this.fsImpl === fs && process.platform === 'win32' && process.env.USERNAME) {
      try {
        execFileSync('icacls', [this.ledgerFile, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W)`], { stdio: 'ignore' });
      } catch (_) {}
    }

    this.lastPersistError = null;
    this.events.push(record);
    if (record.idempotencyKey) {
      this.byKey.set(record.idempotencyKey, record);
    }
    return record;
  }

  append(entry) {
    return this._withExclusiveLock(() => {
      this.load();
      if (this.reconciliationRequired) {
        const corruptErr = new Error(`LEDGER_CORRUPT_RECONCILIATION_REQUIRED: ${this.corruptReason}`);
        corruptErr.code = 'LEDGER_CORRUPT_RECONCILIATION_REQUIRED';
        corruptErr.corruptReason = this.corruptReason;
        corruptErr.corruptLineCount = this.corruptLineCount;
        throw corruptErr;
      }
      return this._appendUnlocked(entry);
    });
  }

  reserveRequest({ idempotencyKey, recipient, from }) {
    return this._withExclusiveLock(() => {
      this.load();
      if (this.reconciliationRequired) {
        return { action: 'CORRUPT_BLOCKED', corruptReason: this.corruptReason, corruptLineCount: this.corruptLineCount };
      }
      const existing = this.byKey.get(idempotencyKey);
      if (existing) {
        if (existing.status === 'ACCEPTED') {
          return { action: 'REPLAY_ACCEPTED', record: existing };
        }
        if (existing.status === 'REQUESTED' || existing.status === 'AMBIGUOUS_TIMEOUT') {
          return { action: 'AMBIGUOUS_CONFLICT', record: existing };
        }
      }
      const reserved = this._appendUnlocked({
        idempotencyKey,
        recipient,
        from: from || 'onboarding@resend.dev',
        status: 'REQUESTED',
        deliveryStatus: 'PENDING_PROVIDER'
      });
      return { action: 'RESERVED', record: reserved };
    });
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
