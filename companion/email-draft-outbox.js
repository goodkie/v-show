'use strict';
/**
 * XPIDER email outbox: local draft-only persistence. No network or sending.
 *
 * SECURITY & CONCURRENCY NOTES (Directive #6757748962):
 * 1. Atomic rename alone does NOT prevent lost updates across multiple instances/processes
 *    if each instance mutates a stale in-memory snapshot. All mutations therefore acquire an
 *    exclusive lockfile (<file>.lock via O_CREAT|O_EXCL / 'wx'), re-read the latest committed
 *    disk state, apply the state transition, fsync the temp file, atomically rename, and unlink
 *    the lockfile in finally.
 * 2. Leftover *.tmp partial write artifacts from crash/power-loss are swept on startup without
 *    corrupting the last committed store file.
 * 3. Caller-supplied `authorized: true` is NEVER trusted as standalone send authorization.
 *    Unless verified against a cryptographic/signed `consentLedger`, jobs are tagged
 *    `consentVerification: 'UNVERIFIED_CALLER_ASSERTION'` and `sendEligible: false`.
 * 4. Credentials/API keys (`re_...`, `whsec_...`, `apiKey`, `proxyPassword`, `Bearer`) are
 *    strictly forbidden from being persisted in outbox JSON.
 * 5. Plaintext JSON on an unencrypted disk is development-only; production deployment requires
 *    OS disk encryption (Windows BitLocker / DPAPI) before storing real recipient PII.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATES = new Set(['DRAFT', 'HOLD', 'CANCELLED']);
const REASONS = new Set(['MANUAL', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED']);
const SECRET_PATTERN = /(?:^|[^A-Za-z0-9])(re_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9+/=_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,})/i;
const FORBIDDEN_SECRET_KEYS = new Set(['apikey', 'api_key', 'secret', 'password', 'proxypassword', 'proxy_password', 'privatekey', 'webhooksecret']);

const PRIVACY_STORAGE_REQUIREMENTS = Object.freeze({
  developmentOnlyPlaintextJson: true,
  productionRequiresOsEncryption: 'Windows BitLocker / DPAPI required before storing real recipient PII',
  credentialsInStoreForbidden: true,
  callerBooleanConsentInsufficientForLiveSend: true
});

function address(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) ? s : null;
}

function assertNoSecrets(obj) {
  const seen = new Set();
  function walk(val) {
    if (val === null || val === undefined) return;
    if (typeof val === 'string') {
      if (SECRET_PATTERN.test(val)) throw Error('CREDENTIALS_FORBIDDEN_IN_OUTBOX');
      return;
    }
    if (typeof val !== 'object') return;
    if (seen.has(val)) return;
    seen.add(val);
    for (const [k, v] of Object.entries(val)) {
      if (FORBIDDEN_SECRET_KEYS.has(String(k).toLowerCase())) {
        throw Error('CREDENTIALS_FORBIDDEN_IN_OUTBOX');
      }
      walk(v);
    }
  }
  walk(obj);
}

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

function _safeUnlinkRegularNoLink(targetPath) {
  const st = fs.lstatSync(targetPath);
  if (st.isSymbolicLink() || !st.isFile() || (typeof st.nlink === 'number' && st.nlink > 1)) {
    throw new Error('UNSAFE_UNLINK_SYMLINK_OR_HARDLINK_REJECTED');
  }
  fs.unlinkSync(targetPath);
}

const IN_PROCESS_FILE_GEN = new Map();

class DraftOutbox {
  constructor(file, options = {}) {
    if (!file || typeof file !== 'string' || !path.isAbsolute(file)) {
      throw Error('ABSOLUTE_FILE_REQUIRED');
    }
    this.file = file;
    this.lockFile = `${file}.lock`;
    this.lockTimeoutMs = Number.isFinite(options.lockTimeoutMs) ? options.lockTimeoutMs : 5000;
    this.staleLockMs = Number.isFinite(options.staleLockMs) ? options.staleLockMs : 30000;
    this.consentLedger = options.consentLedger || null;
    this.sweptOrphanTemps = this._sweepOrphanedTemps();
    this._diskSig = null;
    this._seenGen = -1;
    this._suppressedSet = new Set();
    this.data = this._loadFromDisk();
    this._refreshIndexesAndSig();
  }

  _getDiskSig() {
    try {
      const st = fs.statSync(this.file);
      return `${st.ino || 0}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
    } catch (_) {
      return null;
    }
  }

  _refreshIndexesAndSig() {
    this._suppressedSet = new Set(
      (Array.isArray(this.data && this.data.suppressed) ? this.data.suppressed : [])
        .map(x => x && x.email)
        .filter(Boolean)
    );
    this._diskSig = this._getDiskSig();
    this._seenGen = IN_PROCESS_FILE_GEN.get(this.file) || 0;
  }

  _reloadIfDiskChanged() {
    const sig = this._getDiskSig();
    const gen = IN_PROCESS_FILE_GEN.get(this.file) || 0;
    if (sig === this._diskSig && gen === this._seenGen) {
      return false;
    }
    this.data = this._loadFromDisk();
    this._refreshIndexesAndSig();
    return true;
  }

  _sweepOrphanedTemps() {
    const dir = path.dirname(this.file);
    const base = path.basename(this.file);
    if (!fs.existsSync(dir)) return 0;
    let swept = 0;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(base + '.') && entry.endsWith('.tmp')) {
        try {
          _safeUnlinkRegularNoLink(path.join(dir, entry));
          swept++;
        } catch (_) {}
      }
    }
    return swept;
  }

  _validateStoreObject(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.jobs) || !Array.isArray(data.suppressed)) {
      throw Error('INVALID_STORE');
    }
    if (data.jobs.some(j => !j || !STATES.has(j.status))) {
      throw Error('INVALID_JOB_STATE');
    }
    assertNoSecrets(data);
    return data;
  }

  _loadFromDisk() {
    if (!fs.existsSync(this.file)) {
      return { version: 1, jobs: [], suppressed: [] };
    }
    const raw = fs.readFileSync(this.file, 'utf8');
    const parsed = JSON.parse(raw);
    return this._validateStoreObject(parsed);
  }

  _acquireLock() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      try {
        const fd = fs.openSync(this.lockFile, 'wx', 0o600);
        const meta = JSON.stringify({ pid: process.pid, acquiredAt: Date.now() });
        fs.writeFileSync(fd, meta, 'utf8');
        return fd;
      } catch (err) {
        if (err && err.code === 'EEXIST') {
          try {
            const stat = fs.lstatSync(this.lockFile);
            if (!stat.isSymbolicLink() && stat.isFile() && Date.now() - stat.mtimeMs > this.staleLockMs) {
              _safeUnlinkRegularNoLink(this.lockFile);
              continue;
            }
          } catch (_) {}
          if (Date.now() >= deadline) {
            throw Error('OUTBOX_LOCK_TIMEOUT');
          }
          sleepSync(15);
          continue;
        }
        throw err;
      }
    }
  }

  _releaseLock(fd) {
    try {
      if (typeof fd === 'number') fs.closeSync(fd);
    } catch (_) {}
    try {
      if (fs.existsSync(this.lockFile)) _safeUnlinkRegularNoLink(this.lockFile);
    } catch (_) {}
  }

  _writeAtomicUnlocked() {
    this._validateStoreObject(this.data);
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    let fd = null;
    try {
      fd = fs.openSync(temp, 'wx', 0o600);
      const buf = Buffer.from(JSON.stringify(this.data), 'utf8');
      fs.writeFileSync(fd, buf);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(temp, this.file);
      IN_PROCESS_FILE_GEN.set(this.file, (IN_PROCESS_FILE_GEN.get(this.file) || 0) + 1);
      this._refreshIndexesAndSig();
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch (_) {}
      }
      if (fs.existsSync(temp)) {
        try { fs.unlinkSync(temp); } catch (_) {}
      }
    }
  }

  _withTransaction(mutator, opts = {}) {
    const lockFd = this._acquireLock();
    try {
      const fileExists = fs.existsSync(this.file);
      if (fileExists) {
        this.data = this._loadFromDisk();
        this._refreshIndexesAndSig();
      }
      const result = mutator();
      const skipWrite = typeof opts.skipWriteIf === 'function' && Boolean(opts.skipWriteIf(result, fileExists));
      if (!skipWrite) {
        this._writeAtomicUnlocked();
      }
      return result;
    } finally {
      this._releaseLock(lockFd);
    }
  }

  persist() {
    const lockFd = this._acquireLock();
    try {
      this._writeAtomicUnlocked();
    } finally {
      this._releaseLock(lockFd);
    }
  }

  _verifyConsentEvidence(email, input) {
    if (this.consentLedger && typeof this.consentLedger.verify === 'function') {
      const ok = this.consentLedger.verify({
        email,
        authorizationSource: input.authorizationSource,
        authorizationAt: input.authorizationAt,
        consentProofToken: input.consentProofToken
      });
      if (!ok) throw Error('CONSENT_LEDGER_VERIFICATION_FAILED');
      return 'LEDGER_VERIFIED';
    }
    return 'UNVERIFIED_CALLER_ASSERTION';
  }

  add(input = {}) {
    assertNoSecrets(input);
    const email = address(input.email);
    if (!email) throw Error('INVALID_EMAIL');
    if (
      input.authorized !== true ||
      !input.authorizationSource ||
      !input.authorizationAt ||
      !Number.isFinite(Date.parse(input.authorizationAt))
    ) {
      throw Error('AUTHORIZATION_EVIDENCE_REQUIRED');
    }
    if (input.source === 'EMAIL_COLLECTOR') throw Error('COLLECTED_ADDRESS_NOT_AUTHORIZATION');
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.key || '')) throw Error('IDEMPOTENCY_KEY_REQUIRED');
    const consentVerification = this._verifyConsentEvidence(email, input);

    return this._withTransaction(() => {
      if (this.data.suppressed.some(x => x.email === email)) return { status: 'SUPPRESSED' };
      if (this.data.jobs.some(x => x.key === input.key)) return { status: 'DUPLICATE' };
      const job = {
        id: crypto.randomUUID(),
        email,
        key: input.key,
        templateId: String(input.templateId || ''),
        authorizationSource: String(input.authorizationSource),
        authorizationAt: input.authorizationAt,
        consentVerification,
        sendEligible: false,
        status: 'DRAFT'
      };
      this.data.jobs.push(job);
      return { status: 'DRAFT', id: job.id, consentVerification };
    }, { skipWriteIf: (res, fileExists) => fileExists && res && res.status !== 'DRAFT' });
  }

  addBatch(items = []) {
    if (!Array.isArray(items) || items.length === 0) return { added: 0 };
    return this._withTransaction(() => {
      const supSet = new Set(this.data.suppressed.map(x => x.email));
      const keySet = new Set(this.data.jobs.map(x => x.key));
      let added = 0;
      for (const input of items) {
        assertNoSecrets(input);
        const email = address(input.email);
        if (!email) throw Error('INVALID_EMAIL');
        if (input.authorized !== true || !input.authorizationSource || !input.authorizationAt || !Number.isFinite(Date.parse(input.authorizationAt))) {
          throw Error('AUTHORIZATION_EVIDENCE_REQUIRED');
        }
        if (input.source === 'EMAIL_COLLECTOR') throw Error('COLLECTED_ADDRESS_NOT_AUTHORIZATION');
        if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.key || '')) throw Error('IDEMPOTENCY_KEY_REQUIRED');
        const consentVerification = this._verifyConsentEvidence(email, input);
        if (supSet.has(email) || keySet.has(input.key)) continue;
        keySet.add(input.key);
        this.data.jobs.push({
          id: crypto.randomUUID(),
          email,
          source: input.source || 'CUSTOMER',
          templateId: input.templateId || null,
          key: input.key,
          authorized: true,
          authorizationSource: input.authorizationSource,
          authorizationAt: input.authorizationAt,
          consentVerification,
          sendEligible: false,
          status: 'DRAFT'
        });
        added++;
      }
      return { added };
    }, { skipWriteIf: (res, fileExists) => fileExists && res && res.added === 0 });
  }

  suppress(email, reason = 'MANUAL', meta = {}) {
    assertNoSecrets(meta);
    const e = address(email);
    if (!e) throw Error('INVALID_EMAIL');
    if (!REASONS.has(reason)) throw Error('INVALID_REASON');
    let mutated = false;
    return this._withTransaction(() => {
      const existing = this.data.suppressed.find(x => x.email === e);
      if (!existing) {
        this.data.suppressed.push({
          email: e,
          reason,
          suppressedAt: meta.suppressedAt || new Date().toISOString(),
          ...(meta.eventId ? { eventId: String(meta.eventId) } : {})
        });
        mutated = true;
      }
      for (const x of this.data.jobs) {
        if (x.email === e && x.status !== 'CANCELLED') {
          x.status = 'CANCELLED';
          mutated = true;
        }
      }
      return { status: 'SUPPRESSED', alreadySuppressed: Boolean(existing) };
    }, { skipWriteIf: (_res, fileExists) => fileExists && !mutated });
  }

  suppressBatch(emails = [], reason = 'MANUAL', meta = {}) {
    assertNoSecrets(meta);
    if (!REASONS.has(reason)) throw Error('INVALID_REASON');
    const clean = [];
    const seen = new Set();
    for (const raw of (Array.isArray(emails) ? emails : [])) {
      const e = address(raw);
      if (e && !seen.has(e)) {
        seen.add(e);
        clean.push(e);
      }
    }
    if (clean.length === 0) return { added: 0, cancelled: 0 };
    return this._withTransaction(() => {
      const existingSet = new Set(this.data.suppressed.map(x => x.email));
      const targetSet = new Set(clean);
      const nowIso = meta.suppressedAt || new Date().toISOString();
      let added = 0;
      let cancelled = 0;
      for (const e of clean) {
        if (!existingSet.has(e)) {
          this.data.suppressed.push({
            email: e,
            reason,
            suppressedAt: nowIso,
            ...(meta.eventId ? { eventId: String(meta.eventId) } : {})
          });
          existingSet.add(e);
          added++;
        }
      }
      for (const x of this.data.jobs) {
        if (targetSet.has(x.email) && x.status !== 'CANCELLED') {
          x.status = 'CANCELLED';
          cancelled++;
        }
      }
      return { added, cancelled };
    }, { skipWriteIf: (res, fileExists) => fileExists && res && res.added === 0 && res.cancelled === 0 });
  }

  getSuppressedSet() {
    this._reloadIfDiskChanged();
    return new Set(this._suppressedSet);
  }

  getSuppressedCount() {
    this._reloadIfDiskChanged();
    return this._suppressedSet.size;
  }

  isSuppressed(email) {
    const e = address(email);
    if (!e) return false;
    this._reloadIfDiskChanged();
    return this._suppressedSet.has(e);
  }

  holdAll() {
    return this._withTransaction(() => {
      for (const x of this.data.jobs) {
        if (x.status === 'DRAFT') x.status = 'HOLD';
      }
      return { status: 'HOLD' };
    });
  }

  snapshot() {
    if (fs.existsSync(this.file)) {
      this.data = this._loadFromDisk();
      this._refreshIndexesAndSig();
    }
    return structuredClone(this.data);
  }
}

module.exports = { DraftOutbox, PRIVACY_STORAGE_REQUIREMENTS };
