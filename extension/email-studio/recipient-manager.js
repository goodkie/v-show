/**
 * XPIDER Email Studio — Recipient Manager (pure, no network, no secrets).
 * CSV import -> validate -> dedupe -> opt-out/suppression -> consent gate -> review -> per-recipient ledger
 * with stop/resume. Production send stays gated elsewhere; this module never sends anything.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecipientManager = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  const ROLE_LOCALS = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster']);
  const STATUS = Object.freeze({
    PENDING: 'PENDING',
    SENDING: 'SENDING',
    ACCEPTED: 'ACCEPTED',
    FAILED: 'FAILED',
    SKIPPED_SUPPRESSED: 'SKIPPED_SUPPRESSED',
    SKIPPED_NO_CONSENT: 'SKIPPED_NO_CONSENT',
    DRY_RUN_READY: 'DRY_RUN_READY'
  });

  function normalizeEmail(raw) {
    return String(raw == null ? '' : raw).trim().replace(/^<|>$/g, '').toLowerCase();
  }

  function validateEmail(email) {
    if (!email) return 'EMPTY';
    if (email.length > 254) return 'TOO_LONG';
    if (!EMAIL_RE.test(email)) return 'INVALID_FORMAT';
    const local = email.split('@')[0];
    if (ROLE_LOCALS.has(local)) return 'ROLE_ADDRESS';
    return null;
  }

  // RFC4180-ish line parser (quotes, commas, CRLF)
  function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    const s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows;
  }

  function importRecipients(text, opts) {
    const o = opts || {};
    const rows = parseCsv(text);
    const result = { total: rows.length, valid: [], invalid: [], duplicates: [], headerDetected: false };
    if (!rows.length) return result;
    let emailIdx = 0, nameIdx = -1, start = 0;
    const head = rows[0].map(v => v.trim().toLowerCase());
    const hi = head.findIndex(h => ['email', 'e-mail', 'mail', '이메일', '메일'].includes(h));
    if (hi >= 0) {
      result.headerDetected = true; emailIdx = hi; start = 1;
      nameIdx = head.findIndex(h => ['name', '이름', 'company', '회사'].includes(h));
    } else if (!rows[0].some(v => /@/.test(v))) {
      start = 1; result.headerDetected = true;
    } else {
      const found = rows[0].findIndex(v => /@/.test(v));
      if (found >= 0) emailIdx = found;
    }
    const seen = new Set();
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const email = normalizeEmail(r[emailIdx]);
      const err = validateEmail(email);
      if (err) { result.invalid.push({ line: i + 1, raw: String(r[emailIdx] || '').slice(0, 80), reason: err }); continue; }
      if (seen.has(email)) { result.duplicates.push({ line: i + 1, email }); continue; }
      seen.add(email);
      result.valid.push({ email, name: nameIdx >= 0 ? String(r[nameIdx] || '').trim().slice(0, 80) : '', source: o.source || 'csv-import' });
    }
    return result;
  }

  function parseSuppression(text) {
    const set = new Set();
    String(text || '').split(/[\s,;]+/).forEach(t => {
      const e = normalizeEmail(t);
      if (e && !validateEmail(e)) set.add(e);
      else if (e && /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) set.add(e); // whole-domain opt-out
    });
    return set;
  }

  function isSuppressed(email, suppression) {
    if (!suppression) return false;
    if (suppression.has(email)) return true;
    const dom = '@' + email.split('@')[1];
    return suppression.has(dom);
  }

  /**
   * Build review. consentAttestation must be true (owner asserts recipients opted in / lawful basis).
   * messageKind 'marketing' REQUIRES attestation; service allows but still records.
   */
  function buildReview(recipients, suppression, opts) {
    const o = opts || {};
    const entries = [];
    let ready = 0, suppressed = 0, noConsent = 0;
    for (const r of recipients) {
      let status = STATUS.PENDING;
      let reason = null;
      if (isSuppressed(r.email, suppression)) { status = STATUS.SKIPPED_SUPPRESSED; reason = 'OPT_OUT_OR_SUPPRESSED'; suppressed++; }
      else if (o.messageKind === 'marketing' && !o.consentAttestation) { status = STATUS.SKIPPED_NO_CONSENT; reason = 'MARKETING_REQUIRES_CONSENT_ATTESTATION'; noConsent++; }
      else ready++;
      entries.push({ email: r.email, name: r.name || '', status, reason, attempts: 0, providerMessageId: null, error: null, updatedAt: null });
    }
    return { entries, summary: { total: recipients.length, ready, suppressed, noConsent } };
  }

  function createQueue(entries) {
    return { entries: entries.map(e => ({ ...e })), stopped: false, startedAt: null, finishedAt: null };
  }

  /**
   * Run queue with injected sender(entry) -> Promise<{ok, providerMessageId?, error?}>.
   * Idempotent: only PENDING/FAILED(attempts<maxAttempts) are processed; ACCEPTED never re-sent.
   */
  async function runQueue(queue, sender, opts) {
    const o = Object.assign({ maxAttempts: 2, delayMs: 0, now: () => new Date().toISOString() }, opts || {});
    queue.stopped = false;
    queue.startedAt = queue.startedAt || o.now();
    for (const e of queue.entries) {
      if (queue.stopped) break;
      if (e.status === STATUS.ACCEPTED || e.status === STATUS.DRY_RUN_READY || String(e.status).startsWith('SKIPPED')) continue;
      if (e.status === STATUS.FAILED && e.attempts >= o.maxAttempts) continue;
      e.status = STATUS.SENDING; e.attempts++; e.updatedAt = o.now();
      let res;
      try { res = await sender(e); } catch (err) { res = { ok: false, error: err && err.message ? err.message : 'SENDER_EXCEPTION' }; }
      e.updatedAt = o.now();
      if (res && res.ok) { e.status = res.dryRun ? STATUS.DRY_RUN_READY : STATUS.ACCEPTED; e.providerMessageId = res.providerMessageId || null; e.error = null; }
      else { e.status = STATUS.FAILED; e.error = (res && res.error) || 'UNKNOWN_ERROR'; }
      if (o.delayMs > 0) await new Promise(r => setTimeout(r, o.delayMs));
    }
    // Entries left in SENDING (interrupted) are reset to PENDING so resume is safe
    const remaining = queue.entries.filter(e => e.status === STATUS.PENDING || e.status === STATUS.SENDING || (e.status === STATUS.FAILED && e.attempts < o.maxAttempts));
    if (!queue.stopped && !remaining.length) queue.finishedAt = o.now();
    return summarizeQueue(queue);
  }

  function stopQueue(queue) { queue.stopped = true; }

  function resumeNormalize(queue) {
    for (const e of queue.entries) if (e.status === STATUS.SENDING) e.status = STATUS.PENDING;
    queue.stopped = false;
    return queue;
  }

  function summarizeQueue(queue) {
    const s = { total: queue.entries.length };
    for (const k of Object.keys(STATUS)) s[k] = 0;
    for (const e of queue.entries) s[e.status] = (s[e.status] || 0) + 1;
    return s;
  }

  function queueToCsv(queue) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = ['email,name,status,reason,attempts,providerMessageId,error,updatedAt'];
    for (const e of queue.entries) lines.push([e.email, e.name, e.status, e.reason, e.attempts, e.providerMessageId, e.error, e.updatedAt].map(q).join(','));
    return lines.join('\r\n');
  }

  return { STATUS, normalizeEmail, validateEmail, parseCsv, importRecipients, parseSuppression, isSuppressed, buildReview, createQueue, runQueue, stopQueue, resumeNormalize, summarizeQueue, queueToCsv };
}));
