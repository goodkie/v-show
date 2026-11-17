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
const { EmailSimulatorLedger } = require('./email-simulator-ledger');
const { writeProtectedSecretFile, verifyWindowsDacl, writeKeySecurely } = require('./email-test-sidecar-set-key');
const { getSidecarPaths } = require('./sidecar-paths');
const { EmailProductionPipeline } = require('./email-production-pipeline');
const { EmailImageHostManager } = require('./email-image-host');
const { injectUnsubscribeFooter } = require('./email-unsubscribe-server');

const DEFAULT_SIDECAR_PORT = 18990;
const SIDECAR_BUILD_ID = 'V7.0.0-OWNER-BETA-TEST-SEND-SIDECAR-20261116-LOCKED17';
const SIDECAR_IMPLEMENTATION_HEAD = 'email-test-sidecar-20261116-locked17';
const SIDECAR_API_CAPABILITIES = ['email-test-send', 'email-test-sidecar-v1', 'email-test-ledger-v1'];
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
    this.trustedTestMode = Boolean(options.trustedTestMode === true);
    if (!this.trustedTestMode) {
      const forbiddenKeys = ['apiKeyOverride', 'transportImpl', 'token', 'stateDir', 'tokenFile', 'pidFile', 'ledgerFile', 'localKeyFile', 'fsImpl'];
      for (const k of forbiddenKeys) {
        if (options[k] !== undefined && options[k] !== null) {
          const err = new Error(`PACKAGED_MODE_TEST_INJECTION_REJECTED: option "${k}" is forbidden outside trustedTestMode`);
          err.code = 'PACKAGED_MODE_TEST_INJECTION_REJECTED';
          throw err;
        }
      }
    }
    this.port = parseSidecarPort(options.port !== undefined ? options.port : process.env.XPIDER_EMAIL_SIDECAR_PORT, DEFAULT_SIDECAR_PORT);
    this.host = '127.0.0.1';
    const defaultPaths = getSidecarPaths(options.stateDir, { trustedTestMode: this.trustedTestMode });
    this.stateDir = defaultPaths.stateDir;
    this.tokenFile = options.tokenFile || defaultPaths.tokenFile;
    this.pidFile = options.pidFile || defaultPaths.pidFile;
    this.ledger = new EmailSimulatorLedger({
      ledgerFile: options.ledgerFile || defaultPaths.ledgerFile,
      ...(this.trustedTestMode && options.fsImpl ? { fsImpl: options.fsImpl } : {})
    });
    this.localKeyFile = options.localKeyFile !== undefined ? options.localKeyFile : null;
    this.transportImpl = (this.trustedTestMode && typeof options.transportImpl === 'function') ? options.transportImpl : null;
    this.apiKeyOverride = (this.trustedTestMode && options.apiKeyOverride !== undefined) ? options.apiKeyOverride : null;
    this.rateLimitMs = Number.isFinite(options.rateLimitMs) ? options.rateLimitMs : 5000;
    this.startTime = Date.now();
    this.lastTestSendAt = 0;
    this.idempotencyCache = new Map();
    this.server = null;
    this.token = this._loadOrCreateToken(options.token);
    this.pipeline = new EmailProductionPipeline({
      stateDir: this.stateDir,
      trustedTestMode: this.trustedTestMode,
      dnsResolver: this.trustedTestMode ? options.dnsResolver : null,
      providerTransport: this.trustedTestMode ? options.providerTransport : null,
      aiCopyProvider: this.trustedTestMode ? options.aiCopyProvider : null
    });
    this.imageHost = new EmailImageHostManager({
      stateDir: this.stateDir,
      trustedTestMode: this.trustedTestMode,
      httpRequest: this.trustedTestMode ? options.imageHostHttpRequest : null
    });
  }

  _loadOrCreateToken(explicitToken) {
    if (this.trustedTestMode) {
      if (explicitToken && typeof explicitToken === 'string' && explicitToken.trim().length >= 16) {
        return explicitToken.trim();
      }
      const envTok = process.env.XPIDER_EMAIL_SIDECAR_TOKEN;
      if (envTok && typeof envTok === 'string' && envTok.trim().length >= 16) {
        return envTok.trim();
      }
    } else if (process.env.XPIDER_EMAIL_SIDECAR_TOKEN && process.env.XPIDER_EMAIL_SIDECAR_TOKEN.trim()) {
      const err = new Error('UNSAFE_ENV_TOKEN_REJECTED: XPIDER_EMAIL_SIDECAR_TOKEN is forbidden in packaged/owner mode');
      err.code = 'UNSAFE_ENV_TOKEN_REJECTED';
      throw err;
    }
    if (fs.existsSync(this.tokenFile)) {
      const disk = fs.readFileSync(this.tokenFile, 'utf8').trim();
      if (disk.length < 16) {
        throw new Error(`TOKEN_FILE_INVALID: ${this.tokenFile} is shorter than 16 characters`);
      }
      if (process.platform === 'win32' && process.env.USERNAME) {
        try {
          verifyWindowsDacl(this.tokenFile, process.env.USERNAME);
        } catch (aclErr) {
          throw new Error(`TOKEN_ACL_INVALID: ${aclErr.message}`);
        }
      }
      return disk;
    }
    const fresh = crypto.randomBytes(24).toString('hex');
    writeProtectedSecretFile(this.tokenFile, fresh + '\n');
    return fresh;
  }

  resolveResendApiKey() {
    this.lastKeyReadError = null;
    this.keyStatus = 'KEY_MISSING';
    if (this.trustedTestMode && this.apiKeyOverride !== null) {
      const k = String(this.apiKeyOverride || '').trim();
      if (!k) { this.keyStatus = 'KEY_MISSING'; return null; }
      if (/^re_[A-Za-z0-9_-]{8,}$/.test(k)) { this.keyStatus = 'FORMAT_VALID_KEY_PRESENT'; return k; }
      this.keyStatus = 'MALFORMED_KEY';
      return null;
    }
    const envKey = process.env.RESEND_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim()) {
      if (!this.trustedTestMode) {
        this.keyStatus = 'UNSAFE_ENV_KEY_REJECTED';
        this.lastKeyReadError = 'UNSAFE_ENV_KEY_REJECTED: RESEND_API_KEY env var is forbidden in packaged/owner mode';
        return null;
      }
      const trimmed = envKey.trim();
      if (/^re_[A-Za-z0-9_-]{8,}$/.test(trimmed)) { this.keyStatus = 'FORMAT_VALID_KEY_PRESENT'; return trimmed; }
      this.keyStatus = 'MALFORMED_KEY';
      this.lastKeyReadError = 'MALFORMED_ENV_RESEND_API_KEY';
      return null;
    }
    const primaryKeyPath = (this.trustedTestMode && this.localKeyFile !== null)
      ? this.localKeyFile
      : getSidecarPaths(this.trustedTestMode ? this.stateDir : undefined, { trustedTestMode: this.trustedTestMode }).keyFile;
    if (primaryKeyPath && fs.existsSync(primaryKeyPath)) {
      if (process.platform === 'win32' && process.env.USERNAME) {
        try {
          verifyWindowsDacl(primaryKeyPath, process.env.USERNAME);
        } catch (aclErr) {
          this.keyStatus = 'KEY_ACL_INVALID';
          this.lastKeyReadError = `KEY_ACL_INVALID:${aclErr.message}`;
          return null;
        }
      }
      try {
        const val = fs.readFileSync(primaryKeyPath, 'utf8').trim();
        if (/^re_[A-Za-z0-9_-]{8,}$/.test(val)) {
          this.keyStatus = 'FORMAT_VALID_KEY_PRESENT';
          return val;
        }
        this.keyStatus = 'MALFORMED_KEY';
        this.lastKeyReadError = `INVALID_LOCAL_KEY_FORMAT:${path.basename(primaryKeyPath)}`;
        return null;
      } catch (err) {
        this.keyStatus = 'LOCAL_KEY_FILE_UNREADABLE';
        this.lastKeyReadError = `LOCAL_KEY_FILE_UNREADABLE:${err.message}`;
        return null;
      }
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

        // Public loopback RFC 8058 One-Click Unsubscribe endpoint (no Bearer token required per RFC 8058)
        if (pathname.startsWith('/unsubscribe/')) {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 8192) { tooLarge = true; req.destroy(); } });
          req.on('end', () => {
            if (tooLarge) return;
            const out = this.pipeline.handleUnsubscribeHttp(req, raw);
            res.setHeader('Cache-Control', 'no-store');
            if (out.contentType && out.htmlBody && req.headers.accept && req.headers.accept.includes('text/html')) {
              res.writeHead(out.statusCode, { 'Content-Type': out.contentType });
              res.end(out.htmlBody);
              return;
            }
            res.writeHead(out.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(out.body));
          });
          return;
        }

        // Public loopback Resend Svix Webhook endpoint (authenticated via Svix HMAC-SHA256 headers)
        if (pathname === '/webhooks/resend' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 65536) { tooLarge = true; req.destroy(); } });
          req.on('end', () => {
            if (tooLarge) return;
            const out = this.pipeline.handleResendWebhookHttp(req.headers, raw);
            res.writeHead(out.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(out.body));
          });
          return;
        }

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
            productionHold: false,
            productionSendLocked: false,
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
            pid: process.pid,
            controlPort: this.port,
            companionBuildId: SIDECAR_BUILD_ID,
            companionImplementationHead: SIDECAR_IMPLEMENTATION_HEAD,
            apiCapabilities: SIDECAR_API_CAPABILITIES,
            testSimulatorEnabled: true,
            resendApiKeyConfigured: hasKey,
            keyStatus: this.keyStatus || (hasKey ? 'FORMAT_VALID_KEY_PRESENT' : 'KEY_MISSING'),
            stateDir: this.stateDir,
            allowedRecipients: resendTestMode.TEST_RECIPIENTS,
            allowedFrom: resendTestMode.TEST_FROM,
            productionHold: false,
            productionSendLocked: false
          }));
          return;
        }

        if (pathname === '/email/test-send/ledger' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'OK',
            mode: 'TEST_ONLY_SIDECAR',
            note: 'ACCEPTED means Resend event simulator accepted the event, NOT real mailbox delivery.',
            entries: this.ledger.listRecent(25)
          }));
          return;
        }

        if (pathname === '/storage-recovery/stage0-snapshot' && req.method === 'GET') {
          const candidates = [
            path.join(__dirname, 'stage0_authoritative_97_92_snapshot.json'),
            'E:\\vivpr\\ai\\extension-form-sender\\companion\\stage0_authoritative_97_92_snapshot.json'
          ];
          for (const snapPath of candidates) {
            try {
              if (fs.existsSync(snapPath)) {
                const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, available: true, snapshot: snap }));
                return;
              }
            } catch (_) {}
          }
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, available: false, error: 'STAGE0_SNAPSHOT_NOT_FOUND' }));
          return;
        }

        if (pathname === '/email/recipients/verify-dns' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 131072) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = await this.pipeline.verifyRecipientDomainsDns(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/content-qa/status' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.pipeline.getContentQaStatus()));
          return;
        }

        if (pathname === '/email/images/host/status' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.imageHost.getStatus()));
          return;
        }

        if (pathname === '/email/images/host/config' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 16384) { tooLarge = true; req.destroy(); } });
          req.on('end', () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = this.imageHost.saveConfig(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/images/upload' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 5242880) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = await this.imageHost.uploadAndVerify(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/content-qa/key' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 8192) { tooLarge = true; req.destroy(); } });
          req.on('end', () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = this.pipeline.saveAiCopyApiKey(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/content-qa/test-connection' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 8192) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = await this.pipeline.testGeminiConnection(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/content-qa/suggest' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 131072) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = await this.pipeline.evaluateContentQaAndSuggestCopy(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/production/preflight' && req.method === 'GET') {
          const resolvedKey = this.resolveResendApiKey();
          const hasKey = Boolean(resolvedKey);
          const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
          const publicHttpsVerified = /^https:\/\/(?!127\.0\.0\.1|localhost\b)[a-z0-9.-]+\.[a-z]{2,}/i.test(String(unsubCfg?.publicBaseUrl || ''));
          const pf = await this.pipeline.evaluatePreflight({
            hasResendKey: hasKey,
            keyStatus: this.keyStatus || (hasKey ? 'FORMAT_VALID_KEY_PRESENT' : 'KEY_MISSING'),
            apiKey: (!this.trustedTestMode && resolvedKey) ? resolvedKey : null,
            ownerExplicitApproval: true,
            publicUnsubscribeHttpsVerified: publicHttpsVerified
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(pf));
          return;
        }

        if (pathname === '/email/unsubscribe/status' && req.method === 'GET') {
          const st = this.pipeline.getUnsubscribePublicConfig();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...st, localTestBaseUrl: `http://127.0.0.1:${this.port}` }));
          return;
        }

        if (pathname === '/email/unsubscribe/config' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 8192) { tooLarge = true; req.destroy(); } });
          req.on('end', () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const out = this.pipeline.saveUnsubscribePublicConfig(payload);
              res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ...out, localTestBaseUrl: `http://127.0.0.1:${this.port}` }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_JSON', message: err.message }));
            }
          });
          return;
        }

        if ((pathname === '/email/production/import' || pathname === '/email/production/queue/run' || pathname === '/email/production/queue/stop') && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 2097152) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              if (pathname === '/email/production/import') {
                const out = this.pipeline.importAndPersistRecipients(payload);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/production/queue/stop') {
                const out = this.pipeline.stopQueue();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, status: 'STOPPED', summary: out }));
                return;
              }
              if (pathname === '/email/production/queue/run') {
                const resolvedKey = this.resolveResendApiKey();
                const hasKey = Boolean(resolvedKey);
                const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
                const publicUnsubBase = String(unsubCfg?.publicBaseUrl || '').trim();
                const isLive = payload.mode === 'LIVE_PRODUCTION';
                const syncTokenPath = path.join(this.stateDir, '.unsubscribe_sync_token');
                const syncToken = fs.existsSync(syncTokenPath) ? fs.readFileSync(syncTokenPath, 'utf8').trim() : null;
                const resolvedBaseUrl = isLive ? publicUnsubBase : (payload.baseUrl || publicUnsubBase || `http://127.0.0.1:${this.port}`);
                const publicHttpsVerified = /^https:\/\/(?!127\.0\.0\.1|localhost\b)[a-z0-9.-]+\.[a-z]{2,}/i.test(resolvedBaseUrl);
                const out = await this.pipeline.runQueue({
                  ...payload,
                  baseUrl: resolvedBaseUrl,
                  hasResendKey: hasKey,
                  apiKey: (!this.trustedTestMode && resolvedKey) ? resolvedKey : (payload.apiKey || null),
                  syncToken: payload.syncToken || syncToken,
                  ownerExplicitApproval: true,
                  publicUnsubscribeHttpsVerified: publicHttpsVerified
                });
                res.writeHead(out.ok ? 200 : 409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        if (pathname === '/email/test-send/key' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 8192) {
              tooLarge = true;
              req.destroy();
            }
          });
          req.on('end', () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              if (payload.userConsentConfirmed !== true) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  ok: false,
                  status: 'BLOCKED',
                  reason: 'USER_CONSENT_REQUIRED',
                  message: 'Explicit user consent is required before provisioning the local Resend API key.'
                }));
                return;
              }
              const trimmed = String(payload.apiKey || '').trim();
              if (!trimmed || !/^re_[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  ok: false,
                  status: 'BLOCKED',
                  reason: trimmed ? 'INVALID_KEY_FORMAT' : 'EMPTY_KEY',
                  message: 'Resend API Key must match /^re_[A-Za-z0-9_-]{8,}$/.'
                }));
                return;
              }
              const targetKeyPath = (this.trustedTestMode && this.localKeyFile !== null)
                ? this.localKeyFile
                : getSidecarPaths(this.trustedTestMode ? this.stateDir : undefined, { trustedTestMode: this.trustedTestMode }).keyFile;
              try {
                writeKeySecurely(targetKeyPath, trimmed);
              } catch (provErr) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  ok: false,
                  status: 'BLOCKED',
                  reason: 'KEY_PROVISION_FAILED',
                  message: provErr && provErr.message ? provErr.message : 'Failed to write NTFS-protected key file.'
                }));
                return;
              }
              const loaded = Boolean(this.resolveResendApiKey());
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                status: 'PROVISIONED',
                resendApiKeyConfigured: loaded,
                keyStatus: this.keyStatus || 'FORMAT_VALID_KEY_PRESENT',
                keyPath: targetKeyPath,
                note: 'Key saved to NTFS user-protected storage. Local format valid only; provider authentication is verified on simulator test send.'
              }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: 'INVALID_REQUEST', message: err.message }));
            }
          });
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
            let idempotencyKey = '';
            let recipient = '';
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const to = payload.to;
              const subject = payload.subject;
              const html = payload.html;
              const text = payload.text;
              idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : '';
              recipient = typeof to === 'string' ? to.trim() : '';

              if (Array.isArray(to)) {
                if (idempotencyKey.length >= 16) {
                  this.ledger.append({
                    idempotencyKey, recipient: JSON.stringify(to), status: 'BLOCKED',
                    httpStatus: 400, errorCode: 'MULTIPLE_RECIPIENTS_DENIED', reason: 'MULTIPLE_RECIPIENTS_DENIED'
                  });
                }
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
                to: recipient ? [recipient] : [],
                authorizedTestTransport: true
              });
              if (!gate.allowed) {
                if (idempotencyKey.length >= 16) {
                  this.ledger.append({
                    idempotencyKey, recipient, status: 'BLOCKED',
                    httpStatus: 400, errorCode: '400_RECIPIENT', reason: gate.reasons[0] || 'TEST_RECIPIENT_NOT_ALLOWED'
                  });
                }
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

              // Fail-closed immediately if ledger was corrupt/unreadable on startup or reload
              this.ledger.load();
              if (this.ledger.reconciliationRequired) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'LEDGER_CORRUPT_RECONCILIATION_REQUIRED',
                  corruptReason: this.ledger.corruptReason,
                  corruptLineCount: this.ledger.corruptLineCount,
                  reconciliationRequired: true,
                  message: '원장 파일 손상 또는 읽기 오류가 감지되어 복구 전까지 발송이 차단됩니다.'
                }));
                return;
              }

              // Fast-path idempotent replay / ambiguous check BEFORE rate-limit
              const priorRec = this.ledger.getByIdempotencyKey(idempotencyKey);
              if (priorRec && priorRec.status === 'ACCEPTED') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'SUCCESS',
                  deliveryStatus: 'PROVIDER_ACCEPTED_SIMULATOR_ONLY',
                  provider: 'resend',
                  mode: 'TEST_SIMULATOR',
                  providerMessageId: priorRec.providerMessageId,
                  to: priorRec.recipient,
                  from: priorRec.from,
                  timestamp: priorRec.receiptTimestamp,
                  idempotencyKey,
                  idempotentReplay: true
                }));
                return;
              }
              const unresolved = this.ledger.findUnresolvedAmbiguous();
              if (unresolved) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'AMBIGUOUS_NEEDS_RECONCILE',
                  reason: 'PRIOR_REQUEST_AMBIGUOUS',
                  errorCode: unresolved.errorCode || 'AMBIGUOUS_TIMEOUT',
                  idempotencyKey: unresolved.idempotencyKey,
                  message: '미결(AMBIGUOUS) 상태의 발송 원장이 존재합니다. 공급자 정합성 확인 또는 독립적인 승인·초기화 전까지 새 키로도 재전송하지 마세요 (Do not retry under a new key until provider reconciliation or explicit independently authorized reset).'
                }));
                return;
              }

              const now = Date.now();
              if (this.rateLimitMs > 0 && (now - this.lastTestSendAt) < this.rateLimitMs) {
                let ledgerPersisted = true;
                let ledgerError = null;
                try {
                  this.ledger.append({
                    idempotencyKey, recipient, status: 'BLOCKED',
                    httpStatus: 429, errorCode: 'RATE_LIMIT', reason: 'RATE_LIMIT_EXCEEDED'
                  });
                } catch (e) {
                  ledgerPersisted = false;
                  ledgerError = e.message;
                }
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'RATE_LIMIT_EXCEEDED',
                  ledgerPersisted,
                  ...(ledgerError ? { ledgerError } : {}),
                  message: 'Rate limit exceeded. Wait 5 seconds between simulator test sends.'
                }));
                return;
              }

              const apiKey = this.resolveResendApiKey();
              if (!apiKey) {
                const keyErrReason = this.keyStatus === 'KEY_ACL_INVALID'
                  ? 'KEY_ACL_INVALID'
                  : (this.keyStatus === 'UNSAFE_ENV_KEY_REJECTED'
                      ? 'UNSAFE_ENV_KEY_REJECTED'
                      : (this.keyStatus === 'MALFORMED_KEY'
                          ? 'MALFORMED_RESEND_API_KEY'
                          : (this.keyStatus === 'LOCAL_KEY_FILE_UNREADABLE' ? 'LOCAL_KEY_FILE_UNREADABLE' : 'RESEND_API_KEY_NOT_CONFIGURED')));
                const isErr500 = this.keyStatus === 'LOCAL_KEY_FILE_UNREADABLE' || this.keyStatus === 'KEY_ACL_INVALID' || this.keyStatus === 'UNSAFE_ENV_KEY_REJECTED';
                let ledgerPersisted = true;
                let ledgerError = null;
                try {
                  this.ledger.append({
                    idempotencyKey, recipient, status: 'BLOCKED',
                    httpStatus: isErr500 ? 500 : 200,
                    errorCode: this.keyStatus || 'KEY_MISSING',
                    reason: keyErrReason
                  });
                } catch (e) {
                  ledgerPersisted = false;
                  ledgerError = e.message;
                }
                res.writeHead(isErr500 ? 500 : 200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: keyErrReason,
                  keyStatus: this.keyStatus,
                  ledgerPersisted,
                  ...(ledgerError ? { ledgerError } : {}),
                  message: this.lastKeyReadError
                    ? `Local key error (${this.lastKeyReadError}). Fail-closed with zero outbound POST.`
                    : 'RESEND_API_KEY is not configured on the Email Test Sidecar host. Fail-closed with zero outbound POST.'
                }));
                return;
              }

              // Enforce persistent suppression immediately before simulator send as well
              if (this.pipeline && (typeof this.pipeline.isRecipientSuppressed === 'function' ? this.pipeline.isRecipientSuppressed(recipient) : (this.pipeline.outbox && this.pipeline.outbox.isSuppressed(recipient)))) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'RECIPIENT_SUPPRESSED',
                  message: `수신자(${recipient})는 구독 취소/수신 거부 목록에 등록되어 발송이 차단되었습니다.`
                }));
                return;
              }

              // Atomic cross-process exclusive lock + reservation before any external POST
              let reservation;
              try {
                reservation = this.ledger.reserveRequest({ idempotencyKey, recipient, from: resendTestMode.TEST_FROM });
              } catch (persistErr) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: persistErr.code || 'LEDGER_PERSISTENCE_FAILED',
                  corruptReason: this.ledger.corruptReason || null,
                  reconciliationRequired: true,
                  message: persistErr.message
                }));
                return;
              }
              if (this.ledger.reconciliationRequired) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: this.ledger.corruptReason || 'LEDGER_RECONCILIATION_REQUIRED',
                  reconciliationRequired: true,
                  message: 'Lock or ledger reconciliation required before provider POST.'
                }));
                return;
              }

              if (reservation.action === 'CORRUPT_BLOCKED') {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'BLOCKED',
                  reason: 'LEDGER_CORRUPT_RECONCILIATION_REQUIRED',
                  corruptReason: reservation.corruptReason,
                  corruptLineCount: reservation.corruptLineCount,
                  reconciliationRequired: true,
                  message: '원장 파일 손상 또는 읽기 오류가 감지되어 복구 전까지 발송이 차단됩니다.'
                }));
                return;
              }
              if (reservation.action === 'REPLAY_ACCEPTED') {
                const ledgerRec = reservation.record;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'SUCCESS',
                  deliveryStatus: 'PROVIDER_ACCEPTED_SIMULATOR_ONLY',
                  provider: 'resend',
                  mode: 'TEST_SIMULATOR',
                  providerMessageId: ledgerRec.providerMessageId,
                  to: ledgerRec.recipient,
                  from: ledgerRec.from,
                  timestamp: ledgerRec.receiptTimestamp,
                  idempotencyKey,
                  idempotentReplay: true
                }));
                return;
              }
              if (reservation.action === 'AMBIGUOUS_CONFLICT') {
                const ledgerRec = reservation.record;
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'AMBIGUOUS_NEEDS_RECONCILE',
                  reason: 'PRIOR_REQUEST_AMBIGUOUS',
                  errorCode: ledgerRec.errorCode || 'AMBIGUOUS_TIMEOUT',
                  idempotencyKey,
                  message: '이전 요청 상태가 불명확(AMBIGUOUS)합니다. 공급자 정합성 확인 또는 독립적인 승인·초기화 전까지 새 키로 재전송하지 마세요 (Do not retry under a new key until provider reconciliation or explicit independently authorized reset).'
                }));
                return;
              }

              this.lastTestSendAt = now;

              const unsubCfg = this.pipeline ? this.pipeline.getUnsubscribePublicConfig() : { configured: false, publicBaseUrl: null };
              const unsubBaseUrl = (unsubCfg && unsubCfg.configured && unsubCfg.publicBaseUrl)
                ? unsubCfg.publicBaseUrl
                : `http://127.0.0.1:${this.port}`;
              const unsubArtifacts = this.pipeline
                ? this.pipeline.issueRecipientUnsubscribeHeaders(recipient, 'test-send', unsubBaseUrl)
                : { url: `${unsubBaseUrl}/unsubscribe/test`, headers: {} };
              const renderedUnsub = injectUnsubscribeFooter({ html, text, unsubscribeUrl: unsubArtifacts.url });

              let result;
              try {
                result = this.transportImpl
                  ? await this.transportImpl({
                      from: resendTestMode.TEST_FROM,
                      to: recipient,
                      subject,
                      html: renderedUnsub.html,
                      text: renderedUnsub.text,
                      idempotencyKey,
                      apiKey,
                      headers: unsubArtifacts.headers
                    })
                  : await resendTestMode.executeSimulatorSend({
                      from: resendTestMode.TEST_FROM,
                      to: recipient,
                      subject,
                      html: renderedUnsub.html,
                      text: renderedUnsub.text,
                      idempotencyKey,
                      apiKey,
                      headers: unsubArtifacts.headers
                    });
              } catch (transportErr) {
                const isTimeout = /timeout|ETIMEDOUT|ABORT/i.test(transportErr && transportErr.message ? transportErr.message : '');
                const errCode = isTimeout ? 'TIMEOUT' : 'NETWORK';
                try {
                  this.ledger.append({
                    idempotencyKey, recipient, status: 'AMBIGUOUS_TIMEOUT',
                    httpStatus: isTimeout ? 504 : 502, errorCode: errCode,
                    reason: errCode, message: transportErr.message
                  });
                } catch (_) {
                  this.ledger.byKey.set(idempotencyKey, { idempotencyKey, recipient, status: 'AMBIGUOUS_TIMEOUT', errorCode: errCode });
                }
                res.writeHead(isTimeout ? 504 : 502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  status: 'PROVIDER_ERROR',
                  httpStatus: isTimeout ? 504 : 502,
                  error: errCode,
                  idempotencyKey,
                  message: transportErr.message
                }));
                return;
              }

              const httpStatus = result && result.status === 'SUCCESS'
                ? 200
                : (result && result.status === 'PROVIDER_ERROR' ? 502 : 400);

              if (result && result.status === 'SUCCESS') {
                const acceptedPayload = {
                  ...result,
                  to: result.to || result.recipient || recipient,
                  from: result.from || resendTestMode.TEST_FROM,
                  deliveryStatus: 'PROVIDER_ACCEPTED_SIMULATOR_ONLY',
                  idempotencyKey,
                  unsubscribePreview: {
                    url: unsubArtifacts.url,
                    headers: unsubArtifacts.headers
                  }
                };
                try {
                  this.ledger.append({
                    idempotencyKey, recipient, from: result.from || resendTestMode.TEST_FROM,
                    status: 'ACCEPTED', deliveryStatus: 'PROVIDER_ACCEPTED_SIMULATOR_ONLY',
                    providerMessageId: result.providerMessageId, httpStatus: 200,
                    receiptTimestamp: result.timestamp
                  });
                } catch (persistErr) {
                  this.ledger.byKey.set(idempotencyKey, { idempotencyKey, recipient, status: 'AMBIGUOUS_TIMEOUT', errorCode: persistErr.code || 'LEDGER_PERSISTENCE_FAILED' });
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    status: 'AMBIGUOUS_PERSISTENCE_FAILURE',
                    reason: persistErr.code || 'LEDGER_PERSISTENCE_FAILED',
                    corruptReason: this.ledger.corruptReason || null,
                    reconciliationRequired: true,
                    idempotencyKey,
                    providerMessageId: result.providerMessageId,
                    message: persistErr.message
                  }));
                  return;
                }
                if (this.ledger.reconciliationRequired) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    status: 'AMBIGUOUS_PERSISTENCE_FAILURE',
                    reason: this.ledger.corruptReason || 'LEDGER_RECONCILIATION_REQUIRED',
                    reconciliationRequired: true,
                    idempotencyKey,
                    providerMessageId: result.providerMessageId,
                    message: 'Lock or ledger reconciliation required after provider acceptance.'
                  }));
                  return;
                }
                this.idempotencyCache.set(idempotencyKey, { httpStatus, result: acceptedPayload, cachedAt: Date.now() });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(acceptedPayload));
                return;
              }

              try {
                this.ledger.append({
                  idempotencyKey, recipient, status: 'PROVIDER_ERROR',
                  httpStatus: (result && result.httpStatus) || httpStatus,
                  errorCode: (result && result.error) || 'PROVIDER_ERROR',
                  reason: (result && result.error) || 'PROVIDER_ERROR',
                  message: result && result.message
                });
              } catch (_) {}
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
