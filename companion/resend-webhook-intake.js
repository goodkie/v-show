'use strict';
/**
 * XPIDER Resend Signed Webhook Intake (Svix HMAC-SHA256 verification, replay protection,
 * distinct ACCEPTED vs DELIVERED state machine, and automatic BOUNCED/COMPLAINED suppression).
 *
 * SECURITY & PROTOCOL INVARIANTS (Directive #6757748962 P0 Item 4):
 * 1. Verifies Resend / Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) against the
 *    exact raw request body (`${svixId}.${svixTimestamp}.${rawBody}`) using the base64-decoded
 *    `whsec_...` signing key and `crypto.timingSafeEqual`.
 * 2. Enforces timestamp freshness window (default ±300 seconds) to block timestamp replay.
 * 3. Persists processed `svix-id` values and per-message delivery states atomically on disk
 *    with lockfile protection so duplicate webhook deliveries are idempotent.
 * 4. Keeps `ACCEPTED` (`email.sent`) and `DELIVERED` (`email.delivered`) strictly distinct:
 *    `email.sent` records `state: 'ACCEPTED', delivered: false, acceptedNotDelivered: true`.
 * 5. Terminal failure states (`BOUNCED`, `COMPLAINED`) immediately update durable suppression
 *    in `DraftOutbox` and can never be overwritten by out-of-order `email.sent`/`email.delivered`.
 * 6. Production Resend webhook registration and secret provisioning remain `UNKNOWN` until the
 *    Owner configures Resend and supplies a live signing secret outside the repo.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const DEFAULT_TOLERANCE_SEC = 300;

const EVENT_TO_STATE = Object.freeze({
  'email.sent': 'ACCEPTED',
  'email.delivery_delayed': 'DELAYED',
  'email.delivered': 'DELIVERED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED'
});

const TERMINAL_FAILURE_STATES = new Set(['BOUNCED', 'COMPLAINED']);

const PRODUCTION_WEBHOOK_ENDPOINT_STATUS = Object.freeze({
  publicWebhookConfiguredInResend: 'UNKNOWN',
  signingSecretProvisionedByOwner: 'UNKNOWN',
  localOnlyBindingHost: '127.0.0.1'
});

function decodeWebhookSecret(secret) {
  if (!secret || typeof secret !== 'string' || !secret.startsWith('whsec_')) {
    throw Error('WEBHOOK_SECRET_INVALID');
  }
  const b64 = secret.slice('whsec_'.length).trim();
  if (!b64 || !/^[A-Za-z0-9+/=_-]+$/.test(b64)) {
    throw Error('WEBHOOK_SECRET_INVALID');
  }
  const keyBuf = Buffer.from(b64, 'base64');
  if (keyBuf.length < 16) {
    throw Error('WEBHOOK_SECRET_INVALID');
  }
  return keyBuf;
}

function signSvixPayload({ svixId, svixTimestamp, rawBody, secret }) {
  const keyBuf = decodeWebhookSecret(secret);
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = crypto.createHmac('sha256', keyBuf).update(toSign, 'utf8').digest('base64');
  return `v1,${sig}`;
}

function verifySvixWebhook({ headers = {}, rawBody, secret, nowMs = Date.now(), toleranceSec = DEFAULT_TOLERANCE_SEC }) {
  const keyBuf = decodeWebhookSecret(secret);
  const lower = {};
  for (const [k, v] of Object.entries(headers || {})) {
    lower[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  const svixId = String(lower['svix-id'] || '').trim();
  const svixTimestamp = String(lower['svix-timestamp'] || '').trim();
  const svixSignature = String(lower['svix-signature'] || '').trim();

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: 'MISSING_SVIX_HEADERS' };
  }
  if (!/^\d{9,12}$/.test(svixTimestamp)) {
    return { valid: false, reason: 'INVALID_SVIX_TIMESTAMP' };
  }
  const tsSec = Number(svixTimestamp);
  const nowSec = Math.floor(nowMs / 1000);
  if (Math.abs(nowSec - tsSec) > toleranceSec) {
    return { valid: false, reason: 'WEBHOOK_TIMESTAMP_OUT_OF_WINDOW' };
  }

  const bodyStr = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8');
  const expectedB64 = crypto
    .createHmac('sha256', keyBuf)
    .update(`${svixId}.${svixTimestamp}.${bodyStr}`, 'utf8')
    .digest('base64');
  const expectedBuf = Buffer.from(expectedB64, 'utf8');

  const candidates = svixSignature
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  let matched = false;
  for (const token of candidates) {
    const [ver, sig] = token.split(',');
    if (ver !== 'v1' || !sig) continue;
    const actualBuf = Buffer.from(sig, 'utf8');
    if (actualBuf.length === expectedBuf.length && crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return { valid: false, reason: 'WEBHOOK_SIGNATURE_INVALID' };
  }
  return { valid: true, svixId, svixTimestamp: tsSec };
}

function normalizeEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) ? s : null;
}

class ResendWebhookIntake {
  constructor({ stateFile, outbox, secret, toleranceSec = DEFAULT_TOLERANCE_SEC }) {
    if (!stateFile || typeof stateFile !== 'string' || !path.isAbsolute(stateFile)) {
      throw Error('ABSOLUTE_STATE_FILE_REQUIRED');
    }
    if (!outbox || typeof outbox.suppress !== 'function') {
      throw Error('OUTBOX_SUPPRESSION_STORE_REQUIRED');
    }
    decodeWebhookSecret(secret);
    this.stateFile = stateFile;
    this.lockFile = `${stateFile}.lock`;
    this.outbox = outbox;
    this.secret = secret;
    this.toleranceSec = toleranceSec;
    this.data = this._load();
  }

  _load() {
    if (!fs.existsSync(this.stateFile)) {
      return { version: 1, processedEvents: {}, messages: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    if (!parsed || parsed.version !== 1 || typeof parsed.processedEvents !== 'object' || typeof parsed.messages !== 'object') {
      throw Error('INVALID_WEBHOOK_STATE_STORE');
    }
    return parsed;
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true, mode: 0o700 });
    const temp = `${this.stateFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    let lockFd = null;
    try {
      lockFd = fs.openSync(this.lockFile, 'wx', 0o600);
      fs.writeFileSync(temp, JSON.stringify(this.data), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, this.stateFile);
    } finally {
      if (lockFd !== null) {
        try { fs.closeSync(lockFd); } catch (_) {}
        try { fs.unlinkSync(this.lockFile); } catch (_) {}
      }
      if (fs.existsSync(temp)) {
        try { fs.unlinkSync(temp); } catch (_) {}
      }
    }
  }

  processWebhook({ headers, rawBody, nowMs = Date.now() }) {
    const v = verifySvixWebhook({
      headers,
      rawBody,
      secret: this.secret,
      nowMs,
      toleranceSec: this.toleranceSec
    });
    if (!v.valid) {
      return { statusCode: 401, body: { status: 'REJECTED', reason: v.reason } };
    }

    if (fs.existsSync(this.stateFile)) {
      this.data = this._load();
    }

    if (this.data.processedEvents[v.svixId]) {
      return {
        statusCode: 200,
        body: {
          status: 'DUPLICATE_EVENT_IGNORED',
          idempotentReplay: true,
          svixId: v.svixId,
          previousState: this.data.processedEvents[v.svixId].state
        }
      };
    }

    let event;
    try {
      event = JSON.parse(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8'));
    } catch (_) {
      return { statusCode: 400, body: { status: 'REJECTED', reason: 'INVALID_JSON_PAYLOAD' } };
    }

    const eventType = String(event && event.type || '');
    const mappedState = EVENT_TO_STATE[eventType];
    if (!mappedState) {
      return { statusCode: 400, body: { status: 'REJECTED', reason: 'UNSUPPORTED_EVENT_TYPE' } };
    }

    const dataObj = (event && event.data) || {};
    const emailId = String(dataObj.email_id || '');
    const toList = Array.isArray(dataObj.to) ? dataObj.to : (dataObj.to ? [dataObj.to] : []);
    const recipients = toList.map(normalizeEmail).filter(Boolean);
    if (!emailId || recipients.length === 0) {
      return { statusCode: 400, body: { status: 'REJECTED', reason: 'MISSING_EMAIL_ID_OR_RECIPIENT' } };
    }

    const prevRecord = this.data.messages[emailId];
    let effectiveState = mappedState;
    if (prevRecord && TERMINAL_FAILURE_STATES.has(prevRecord.state) && !TERMINAL_FAILURE_STATES.has(mappedState)) {
      // Never downgrade a terminal BOUNCED/COMPLAINED state to ACCEPTED/DELIVERED
      effectiveState = prevRecord.state;
    }

    const suppressedRecipients = [];
    if (effectiveState === 'BOUNCED' || effectiveState === 'COMPLAINED') {
      for (const r of recipients) {
        this.outbox.suppress(r, effectiveState, {
          eventId: v.svixId,
          suppressedAt: new Date(nowMs).toISOString()
        });
        suppressedRecipients.push(r);
      }
    }

    const msgState = {
      emailId,
      recipients,
      state: effectiveState,
      delivered: effectiveState === 'DELIVERED',
      acceptedNotDelivered: effectiveState === 'ACCEPTED',
      lastEventId: v.svixId,
      lastEventType: eventType,
      updatedAt: new Date(nowMs).toISOString()
    };

    this.data.messages[emailId] = msgState;
    this.data.processedEvents[v.svixId] = {
      svixId: v.svixId,
      emailId,
      eventType,
      state: effectiveState,
      processedAt: msgState.updatedAt
    };
    this._persist();

    return {
      statusCode: 200,
      body: {
        status: 'PROCESSED',
        idempotentReplay: false,
        svixId: v.svixId,
        emailId,
        state: effectiveState,
        delivered: msgState.delivered,
        acceptedNotDelivered: msgState.acceptedNotDelivered,
        suppressedRecipients
      }
    };
  }

  getMessageState(emailId) {
    if (fs.existsSync(this.stateFile)) {
      this.data = this._load();
    }
    return this.data.messages[emailId] ? structuredClone(this.data.messages[emailId]) : null;
  }

  snapshot() {
    if (fs.existsSync(this.stateFile)) {
      this.data = this._load();
    }
    return structuredClone(this.data);
  }
}

function startLocalWebhookServer({ intake, port = 0, host = '127.0.0.1', nowFn = () => Date.now() }) {
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw Error('LOCAL_LOOPBACK_ONLY_REQUIRED');
  }
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhooks/resend') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'NOT_FOUND' }));
      return;
    }
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 65536) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const out = intake.processWebhook({
        headers: req.headers,
        rawBody,
        nowMs: nowFn()
      });
      res.writeHead(out.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out.body));
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server,
        host: addr.address,
        port: addr.port,
        webhookUrl: `http://${addr.address}:${addr.port}/webhooks/resend`,
        close: () => new Promise(r => server.close(() => r()))
      });
    });
  });
}

module.exports = {
  decodeWebhookSecret,
  signSvixPayload,
  verifySvixWebhook,
  ResendWebhookIntake,
  startLocalWebhookServer,
  PRODUCTION_WEBHOOK_ENDPOINT_STATUS
};
