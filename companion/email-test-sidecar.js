'use strict';
/**
 * XPIDER Isolated Email Test Sidecar (Directive #6852763622)
 * - Runs strictly on loopback 127.0.0.1 (default port 18990, configurable).
 * - Zero proxy (18988), zero firewall, zero watchdog, zero legacy 18989 interference.
 * - Enforces Bearer auth, strict chrome-extension:// origin check, simulator allowlist,
 *   rate limit, idempotency, and server-side RESEND_API_KEY boundary.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const resendTestMode = require('./resend-test-mode');

const DEFAULT_SIDECAR_PORT = 18990;
const SIDECAR_BUILD_ID = 'V7.0.0-OWNER-BETA-TEST-SEND-SIDECAR-20261113';
const SIDECAR_IMPLEMENTATION_HEAD = 'email-test-sidecar-20261113';
const SIDECAR_API_CAPABILITIES = ['email-test-send', 'email-test-sidecar-v1'];
const EXPOSED_RC3_6_TOKEN_SHA256 = '597a70b99c11c7f4d13a075204ac240bb08a7a1d6c08c78268328e0bb59daeda';
const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}$/;

function parseSidecarPort(raw, fallback = DEFAULT_SIDECAR_PORT) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error(`Invalid sidecar port: ${raw}`);
  }
  return n;
}

function timingSafeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

class EmailTestSidecar {
  constructor(options = {}) {
    this.port = parseSidecarPort(options.port !== undefined ? options.port : process.env.XPIDER_EMAIL_SIDECAR_PORT, DEFAULT_SIDECAR_PORT);
    this.host = '127.0.0.1';
    this.tokenFile = options.tokenFile || path.join(__dirname, '.email_sidecar_token');
    this.pidFile = options.pidFile || path.join(__dirname, '.email_sidecar.pid');
    this.transportImpl = typeof options.transportImpl === 'function' ? options.transportImpl : null;
    this.apiKeyOverride = options.apiKeyOverride !== undefined ? options.apiKeyOverride : null;
    this.rateLimitMs = Number.isFinite(options.rateLimitMs) ? options.rateLimitMs : 5000;
    this.startTime = Date.now();
    this.lastTestSendAt = 0;
    this.idempotencyCache = new Map();
    this.server = null;
    this.token = this._loadOrCreateToken(options.token);
  }

  _loadOrCreateToken(explicitToken) {
    if (explicitToken && typeof explicitToken === 'string' && explicitToken.trim().length >= 16) {
      return explicitToken.trim();
    }
    const envTok = process.env.XPIDER_EMAIL_SIDECAR_TOKEN;
    if (envTok && typeof envTok === 'string' && envTok.trim().length >= 16) {
      return envTok.trim();
    }
    try {
      if (fs.existsSync(this.tokenFile)) {
        const disk = fs.readFileSync(this.tokenFile, 'utf8').trim();
        if (disk.length >= 16) return disk;
      }
    } catch (_) {}
    const fresh = crypto.randomBytes(24).toString('hex');
    try {
      fs.writeFileSync(this.tokenFile, fresh + '\n', { mode: 0o600 });
    } catch (_) {}
    return fresh;
  }

  resolveResendApiKey() {
    if (this.apiKeyOverride !== null) {
      const k = String(this.apiKeyOverride || '').trim();
      return /^re_[A-Za-z0-9_-]{8,}$/.test(k) ? k : null;
    }
    const envKey = process.env.RESEND_API_KEY;
    if (envKey && typeof envKey === 'string') {
      const trimmed = envKey.trim();
      if (/^re_[A-Za-z0-9_-]{8,}$/.test(trimmed)) return trimmed;
    }
    return null;
  }

  _checkOrigin(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (EXTENSION_ORIGIN_RE.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return true;
    }
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      status: 'BLOCKED',
      reason: 'FORBIDDEN_ORIGIN',
      error: 'FORBIDDEN_ORIGIN',
      message: 'Only exact chrome-extension:// origins are permitted.'
    }));
    return false;
  }

  _checkBearer(req, res) {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        status: 'BLOCKED',
        reason: 'UNAUTHORIZED',
        error: 'UNAUTHORIZED',
        message: 'Valid Bearer sidecar token required.'
      }));
      return false;
    }
    const presented = auth.slice(7).trim();
    const hash = crypto.createHash('sha256').update(presented).digest('hex');
    if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        status: 'BLOCKED',
        reason: 'UNAUTHORIZED',
        error: 'UNAUTHORIZED',
        message: 'Revoked token rejected.'
      }));
      return false;
    }
    if (!timingSafeTokenEqual(presented, this.token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        status: 'BLOCKED',
        reason: 'UNAUTHORIZED',
        error: 'UNAUTHORIZED',
        message: 'Bearer sidecar token mismatch.'
      }));
      return false;
    }
    return true;
  }

  _writePidFile() {
    try {
      fs.writeFileSync(this.pidFile, JSON.stringify({
        pid: process.pid,
        port: this.port,
        companionBuildId: SIDECAR_BUILD_ID,
        startedAt: new Date(this.startTime).toISOString()
      }, null, 2), 'utf8');
    } catch (_) {}
  }

  _removePidFile() {
    try {
      if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);
    } catch (_) {}
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.server && this.server.listening) return resolve(this.server);
      this.server = http.createServer(async (req, res) => {
        if (!this._checkOrigin(req, res)) return;
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const urlObj = new URL(req.url, `http://${this.host}:${this.port}`);
        const pathname = urlObj.pathname;

        if (pathname === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'OK',
            service: 'XPIDER Email Test Sidecar',
            mode: 'TEST_ONLY_SIDECAR',
            pid: process.pid,
            controlPort: this.port,
            companionBuildId: SIDECAR_BUILD_ID,
            companionImplementationHead: SIDECAR_IMPLEMENTATION_HEAD,
            apiCapabilities: SIDECAR_API_CAPABILITIES,
            productionHold: true,
            productionSendLocked: true,
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
          }));
          return;
        }

        if (!this._checkBearer(req, res)) return;

        if (pathname === '/email/test-send/status' && req.method === 'GET') {
          const hasKey = Boolean(this.resolveResendApiKey());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'OK',
            mode: 'TEST_ONLY_SIDECAR',
            companionBuildId: SIDECAR_BUILD_ID,
            testSimulatorEnabled: true,
            resendApiKeyConfigured: hasKey,
            allowedRecipients: resendTestMode.TEST_RECIPIENTS,
            allowedFrom: resendTestMode.TEST_FROM,
            productionHold: true,
            productionSendLocked: true
          }));
          return;
        }

        if (pathname === '/email/test-send' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 524288) {
              tooLarge = true;
              req.destroy();
            }
          });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const to = payload.to;
              const subject = payload.subject;
              const html = payload.html;
              const text = payload.text;
              const idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : '';

              if (Array.isArray(to)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'MULTIPLE_RECIPIENTS_DENIED',
                  message: 'Exactly one official Resend simulator recipient is permitted.'
                }));
                return;
              }
              const gate = resendTestMode.check({
                mode: 'TEST',
                from: resendTestMode.TEST_FROM,
                to: typeof to === 'string' ? [to.trim()] : [],
                authorizedTestTransport: true
              });
              if (!gate.allowed) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: gate.reasons[0] || 'TEST_RECIPIENT_NOT_ALLOWED',
                  reasons: gate.reasons,
                  message: 'Only official Resend simulator recipients (delivered@resend.dev, bounced@resend.dev, complained@resend.dev) are allowed.'
                }));
                return;
              }

              if (!idempotencyKey || idempotencyKey.length < 16) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'IDEMPOTENCY_KEY_REQUIRED',
                  message: 'A valid idempotencyKey (>= 16 chars) is required.'
                }));
                return;
              }

              const cached = this.idempotencyCache.get(idempotencyKey);
              if (cached && (Date.now() - cached.cachedAt) < 600000) {
                res.writeHead(cached.httpStatus || 200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ...cached.result, idempotentReplay: true }));
                return;
              }

              const now = Date.now();
              if (this.rateLimitMs > 0 && (now - this.lastTestSendAt) < this.rateLimitMs) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'RATE_LIMIT_EXCEEDED',
                  message: 'Rate limit exceeded. Wait 5 seconds between simulator test sends.'
                }));
                return;
              }

              const apiKey = this.resolveResendApiKey();
              if (!apiKey) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'RESEND_API_KEY_NOT_CONFIGURED',
                  message: 'RESEND_API_KEY is not configured on the Email Test Sidecar host. Fail-closed with zero outbound POST.'
                }));
                return;
              }

              this.lastTestSendAt = now;
              const result = this.transportImpl
                ? await this.transportImpl({ from: resendTestMode.TEST_FROM, to: to.trim(), subject, html, text, idempotencyKey, apiKey })
                : await resendTestMode.executeSimulatorSend({
                    from: resendTestMode.TEST_FROM,
                    to: to.trim(),
                    subject,
                    html,
                    text,
                    idempotencyKey,
                    apiKey
                  });

              const httpStatus = result && result.status === 'SUCCESS'
                ? 200
                : (result && result.status === 'PROVIDER_ERROR' ? 502 : 400);

              if (result && result.status === 'SUCCESS') {
                this.idempotencyCache.set(idempotencyKey, { httpStatus, result, cachedAt: Date.now() });
              }
              res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ERROR', error: 'INVALID_REQUEST', message: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ENDPOINT_NOT_FOUND' }));
      });

      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this._writePidFile();
        resolve(this.server);
      });
    });
  }

  stop() {
    return new Promise(resolve => {
      this._removePidFile();
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}

module.exports = {
  EmailTestSidecar,
  DEFAULT_SIDECAR_PORT,
  SIDECAR_BUILD_ID,
  SIDECAR_IMPLEMENTATION_HEAD,
  SIDECAR_API_CAPABILITIES,
  parseSidecarPort
};
