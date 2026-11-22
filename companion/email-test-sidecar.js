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
const { CampaignAnalyticsEngine } = require('./email-campaign-analytics');
const { EmailImageHostManager } = require('./email-image-host');
const { injectUnsubscribeFooter } = require('./email-unsubscribe-server');
const { validateAndFormatSenderFrom, sanitizeReplyTo } = require('./vivpr-sender-identity');
const { GmailAccountVault } = require('./gmail-account-vault');
const { GmailCampaignRunner } = require('./gmail-campaign-runner');
const { optimizeAndScoreEmailMessage } = require('./gmail-deliverability-optimizer');

const DEFAULT_SIDECAR_PORT = 18990;
const SIDECAR_BUILD_ID = 'V7.0.0-OWNER-BETA-TEST-SEND-SIDECAR-20261116-LOCKED17';
const SIDECAR_IMPLEMENTATION_HEAD = 'email-test-sidecar-20261116-locked17';
const SIDECAR_API_CAPABILITIES = ['email-test-send', 'email-test-sidecar-v1', 'email-test-ledger-v1', 'gmail-safe-delivery-v71'];
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
      const forbiddenKeys = [
        'apiKeyOverride', 'transportImpl', 'token', 'stateDir', 'tokenFile', 'pidFile', 'ledgerFile', 'localKeyFile', 'fsImpl',
        'gmailFetchImpl', 'gmailSyncFetchImpl', 'gmailCryptoBox', 'gmailNowFn', 'gmailDnsResolver'
      ];
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
    this.analytics = new CampaignAnalyticsEngine({
      stateDir: this.stateDir,
      trustedTestMode: this.trustedTestMode
    });
    this.gmailVault = new GmailAccountVault({
      stateDir: this.stateDir,
      trustedTestMode: this.trustedTestMode,
      fetchImpl: this.trustedTestMode ? options.gmailFetchImpl : null,
      cryptoBox: this.trustedTestMode ? options.gmailCryptoBox : null
    });
    this.gmailRunner = new GmailCampaignRunner({
      stateDir: this.stateDir,
      pipeline: this.pipeline,
      analytics: this.analytics,
      vault: this.gmailVault,
      trustedTestMode: this.trustedTestMode,
      fetchImpl: this.trustedTestMode ? options.gmailFetchImpl : null,
      syncFetchImpl: this.trustedTestMode ? options.gmailSyncFetchImpl : null
    });
    this.diagLogs = [];
    this._diagSeq = 0;
    this._recordDiag('INFO', 'SIDECAR', 'SIDECAR_INIT', { port: this.port, buildId: SIDECAR_BUILD_ID, pid: process.pid });
  }

  _redactDiagValue(val, depth = 0) {
    if (depth > 4) return '[TRUNCATED]';
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
      return val
        .replace(/re_[A-Za-z0-9_-]{8,}/g, 're_[REDACTED]')
        .replace(/AIza[A-Za-z0-9_-]{8,}/g, 'AIza[REDACTED]')
        .replace(/ya29\.[A-Za-z0-9._-]{10,}/g, 'ya29.[REDACTED]')
        .replace(/1\/\/[A-Za-z0-9._-]{10,}/g, '1//[REDACTED]')
        .replace(/gh[po]_[A-Za-z0-9_]{8,}/g, 'gh_[REDACTED]')
        .replace(/Bearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer [REDACTED]')
        .replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')
        .slice(0, 400);
    }
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (Array.isArray(val)) return val.slice(0, 20).map(v => this._redactDiagValue(v, depth + 1));
    if (typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val).slice(0, 24)) {
        if (/token|key|secret|password|authorization/i.test(k) && !/keyStatus|tokenSyncMs|hasResendKey/i.test(k)) {
          out[k] = '[REDACTED]';
        } else {
          out[k] = this._redactDiagValue(v, depth + 1);
        }
      }
      return out;
    }
    return String(val);
  }

  _recordDiag(level, category, event, detail = null) {
    this._diagSeq = (this._diagSeq || 0) + 1;
    const entry = {
      seq: this._diagSeq,
      ts: new Date().toISOString(),
      level: String(level || 'INFO').toUpperCase(),
      category: String(category || 'SIDECAR').toUpperCase(),
      event: String(event || 'EVENT'),
      ...(detail !== null && detail !== undefined ? { detail: this._redactDiagValue(detail) } : {})
    };
    this.diagLogs.push(entry);
    if (this.diagLogs.length > 300) this.diagLogs.splice(0, this.diagLogs.length - 300);
    return entry;
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

        if (!this._checkBearer(req, res)) {
          this._recordDiag('WARN', 'AUTH', 'BEARER_REJECTED', { method: req.method, pathname, origin: req.headers.origin || null });
          return;
        }

        const reqStartedAt = Date.now();
        if (pathname !== '/email/diagnostics/logs') {
          res.on('finish', () => {
            this._recordDiag(
              res.statusCode >= 500 ? 'ERROR' : (res.statusCode >= 400 ? 'WARN' : 'INFO'),
              'HTTP',
              `${req.method} ${pathname}`,
              { statusCode: res.statusCode, elapsedMs: Math.max(0, Date.now() - reqStartedAt) }
            );
          });
        }

        if (pathname === '/email/diagnostics/logs' && req.method === 'GET') {
          const limit = Math.max(10, Math.min(300, Number(urlObj.searchParams.get('limit') || 150)));
          const hasKey = Boolean(this.resolveResendApiKey());
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            pid: process.pid,
            port: this.port,
            buildId: SIDECAR_BUILD_ID,
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            keyStatus: this.keyStatus || (hasKey ? 'FORMAT_VALID_KEY_PRESENT' : 'KEY_MISSING'),
            queueSummary: this.pipeline.summarizeQueue(),
            totalLogged: this._diagSeq,
            logs: this.diagLogs.slice(-limit)
          }));
          return;
        }

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
              const vals = out && out.results ? Object.values(out.results) : [];
              this._recordDiag(out.ok ? 'INFO' : 'WARN', 'DNS', 'VERIFY_DOMAINS_DONE', {
                ok: out.ok,
                checkedCount: out.checkedCount || 0,
                totalElapsedMs: out.totalElapsedMs || 0,
                ready: vals.filter(v => v.validityStatus === 'DNS_MAIL_READY').length,
                invalid: vals.filter(v => v.validityStatus === 'INVALID').length,
                unknown: vals.filter(v => v.validityStatus === 'UNKNOWN').length
              });
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

        if (pathname.startsWith('/email/campaigns/') && req.method === 'GET') {
          const parts = pathname.split('/').filter(Boolean); // ['email', 'campaigns', id, action]
          const campaignId = decodeURIComponent(parts[2] || 'default');
          const sub = parts[3] || 'progress';
          const doSync = urlObj.searchParams.get('sync') !== '0';
          const forceSync = urlObj.searchParams.get('forceSync') === '1';
          const nowMs = Date.now();
          const minSyncIntervalMs = this.pipeline._queueRunning ? 12000 : 8000;
          if (doSync && (forceSync || !this._lastProgressRemoteSyncAt || (nowMs - this._lastProgressRemoteSyncAt) >= minSyncIntervalMs)) {
            this._lastProgressRemoteSyncAt = nowMs;
            const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
            const publicBase = String(unsubCfg?.publicBaseUrl || '').trim();
            const syncTokPath = path.join(this.stateDir, '.unsubscribe_sync_token');
            const syncTok = fs.existsSync(syncTokPath) ? fs.readFileSync(syncTokPath, 'utf8').trim() : '';
            if (publicBase && syncTok) {
              if (!this._progressRemoteSyncInFlight) {
                const syncTask = Promise.allSettled([
                  this.analytics.syncRemoteEvents({ baseUrl: publicBase, syncToken: syncTok, timeoutMs: 6500 }),
                  this.pipeline.syncRemoteSuppressions({ baseUrl: publicBase, syncToken: syncTok, skipQueueSave: Boolean(this.pipeline._queueRunning), timeoutMs: 6500 })
                ]).finally(() => {
                  this._lastProgressRemoteSyncCompletedAt = Date.now();
                  if (this._progressRemoteSyncInFlight === syncTask) {
                    this._progressRemoteSyncInFlight = null;
                  }
                });
                this._progressRemoteSyncInFlight = syncTask;
              }
              const maxWaitMs = (forceSync || !this._lastProgressRemoteSyncCompletedAt) ? 4500 : 1800;
              await Promise.race([
                this._progressRemoteSyncInFlight,
                new Promise(r => setTimeout(r, maxWaitMs))
              ]);
            }
          }
          if (sub === 'progress') {
            const prog = this.analytics.getCampaignProgress(campaignId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ...prog,
              queueRunning: Boolean(this.pipeline._queueRunning),
              lastRunResult: this.pipeline.lastRunResult || null
            }));
            return;
          }
          if (sub === 'segments') {
            const cutoffHours = Number(urlObj.searchParams.get('cutoffHours') || 24);
            const seg = this.analytics.getCampaignSegments(campaignId, { cutoffHours });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ...seg,
              notConfirmedOpenedEmails: undefined
            }));
            return;
          }
        }

        if (pathname === '/email/campaigns/reconcile' && req.method === 'POST') {
          let raw = '';
          req.on('data', c => { raw += c; if (raw.length > 16384) req.destroy(); });
          req.on('end', async () => {
            try {
              const p = raw ? JSON.parse(raw) : {};
              const resolvedKey = this.resolveResendApiKey();
              const recT0 = Date.now();
              const out = await this.analytics.reconcileWithResendApi({
                apiKey: resolvedKey,
                campaignId: p.campaignId || 'default',
                limit: Number(p.limit || 200)
              });
              this._recordDiag(out.ok ? 'INFO' : 'WARN', 'RECONCILE', 'RESEND_BACKFILL', {
                checked: out.checked || 0,
                updated: out.updated || 0,
                remainingPending: out.remainingPending || 0,
                updatedByType: out.updatedByType || null,
                elapsedMs: Date.now() - recT0
              });
              res.writeHead(out.ok ? 200 : 503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(out));
            } catch (err) {
              const msg = err?.message || 'QUEUE_RUN_EXCEPTION';
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: false,
                status: 'BLOCKED',
                reason: err?.code || 'QUEUE_RUN_EXCEPTION',
                blockingReasons: [err?.code || 'QUEUE_RUN_EXCEPTION', msg].filter(Boolean),
                koreanReason: `운영 발송 요청 처리 중 예외가 발생하여 Fail-Closed로 중단되었습니다: ${msg}`,
                error: msg,
                timestamp: new Date().toISOString()
              }));
            }
          });
          return;
        }

        if (pathname === '/email/campaigns/second-wave/preview' && req.method === 'POST') {
          let raw = '';
          req.on('data', c => { raw += c; if (raw.length > 32768) req.destroy(); });
          req.on('end', () => {
            try {
              const p = raw ? JSON.parse(raw) : {};
              const prev = this.analytics.previewSecondWave({
                parentCampaignId: p.parentCampaignId || 'default',
                cutoffHours: Number(p.cutoffHours ?? 24),
                waveCampaignId: p.waveCampaignId || null
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ...prev, eligibleCsv: undefined }));
            } catch (err) {
              const msg = err?.message || 'QUEUE_RUN_EXCEPTION';
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: false,
                status: 'BLOCKED',
                reason: err?.code || 'QUEUE_RUN_EXCEPTION',
                blockingReasons: [err?.code || 'QUEUE_RUN_EXCEPTION', msg].filter(Boolean),
                koreanReason: `운영 발송 요청 처리 중 예외가 발생하여 Fail-Closed로 중단되었습니다: ${msg}`,
                error: msg,
                timestamp: new Date().toISOString()
              }));
            }
          });
          return;
        }

        if (pathname === '/email/campaigns/second-wave/start' && req.method === 'POST') {
          let raw = '';
          req.on('data', c => { raw += c; if (raw.length > 524288) req.destroy(); });
          req.on('end', async () => {
            try {
              const p = raw ? JSON.parse(raw) : {};
              if (p.ownerConfirmed !== true) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'OWNER_CONFIRMATION_REQUIRED' }));
                return;
              }
              const prev = this.analytics.previewSecondWave({
                parentCampaignId: p.parentCampaignId || 'default',
                cutoffHours: Number(p.cutoffHours ?? 24),
                waveCampaignId: p.waveCampaignId || null
              });
              if (prev.eligibleCount <= 0) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'NO_ELIGIBLE_UNOPENED_RECIPIENTS', preview: { ...prev, eligibleCsv: undefined } }));
                return;
              }
              const resolvedKey = this.resolveResendApiKey();
              const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
              const publicUnsubBase = String(unsubCfg?.publicBaseUrl || '').trim();
              const syncTokPath = path.join(this.stateDir, '.unsubscribe_sync_token');
              const syncToken = fs.existsSync(syncTokPath) ? fs.readFileSync(syncTokPath, 'utf8').trim() : null;
              this.pipeline.importAndPersistRecipients({
                csvText: prev.eligibleCsv,
                messageKind: p.messageKind || 'marketing',
                consentAttested: true,
                lawfulBasis: 'EXPLICIT_OPT_IN',
                jurisdiction: p.jurisdiction || 'GLOBAL',
                authorizationSource: `second_wave_of_${prev.parentCampaignId}`,
                campaignId: prev.waveCampaignId
              });
              const runOut = await this.pipeline.runQueue({
                mode: 'LIVE_PRODUCTION',
                subject: String(p.subject || '').trim(),
                senderDisplayName: p.senderDisplayName || '',
                senderName: String(p.senderName || '').trim(),
                company: p.company || '',
                brand: p.brand || '',
                replyTo: p.replyTo || '',
                html: String(p.html || ''),
                text: String(p.text || ''),
                physicalAddress: String(p.physicalAddress || ''),
                autoSpamPrevention: p.autoSpamPrevention === true,
                autoAlignReplyTo: p.autoAlignReplyTo === true,
                preferLightweightHtml: p.preferLightweightHtml === true,
                blockHighRiskSpam: p.blockHighRiskSpam === true,
                baseUrl: publicUnsubBase,
                hasResendKey: Boolean(resolvedKey),
                apiKey: (!this.trustedTestMode && resolvedKey) ? resolvedKey : (p.apiKey || null),
                syncToken,
                ownerExplicitApproval: true,
                publicUnsubscribeHttpsVerified: /^https:\/\//i.test(publicUnsubBase)
              });
              res.writeHead(runOut.ok ? 200 : 409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ...runOut, waveCampaignId: prev.waveCampaignId, parentCampaignId: prev.parentCampaignId }));
            } catch (err) {
              const msg = err?.message || 'QUEUE_RUN_EXCEPTION';
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: false,
                status: 'BLOCKED',
                reason: err?.code || 'QUEUE_RUN_EXCEPTION',
                blockingReasons: [err?.code || 'QUEUE_RUN_EXCEPTION', msg].filter(Boolean),
                koreanReason: `운영 발송 요청 처리 중 예외가 발생하여 Fail-Closed로 중단되었습니다: ${msg}`,
                error: msg,
                timestamp: new Date().toISOString()
              }));
            }
          });
          return;
        }

        if (pathname === '/email/master-list' && req.method === 'GET') {
          const summary = this.analytics.syncMasterListFromRuntime();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(summary));
          return;
        }

        if (pathname === '/email/master-list/export' && req.method === 'GET') {
          this.analytics.syncMasterListFromRuntime();
          const csv = this.analytics.exportMasterListCsv();
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
          res.end(csv);
          return;
        }

        if (pathname === '/email/production/message-status' && req.method === 'GET') {
          const msgId = String(urlObj.searchParams.get('id') || '').trim();
          const resolvedKey = this.resolveResendApiKey();
          if (!msgId || !/^[a-z0-9_-]{8,128}$/i.test(msgId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, reason: 'INVALID_MESSAGE_ID' }));
            return;
          }
          if (!resolvedKey) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, reason: 'RESEND_API_KEY_NOT_CONFIGURED' }));
            return;
          }
          try {
            const detResp = await fetch(`https://api.resend.com/emails/${encodeURIComponent(msgId)}`, {
              headers: { 'Authorization': `Bearer ${resolvedKey}` }
            });
            const det = await detResp.json().catch(() => ({}));
            res.writeHead(detResp.ok ? 200 : detResp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ok: detResp.ok,
              id: det.id || msgId,
              last_event: det.last_event || 'unknown',
              created_at: det.created_at || null
            }));
          } catch (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, reason: 'RESEND_STATUS_FETCH_ERROR', message: err.message }));
          }
          return;
        }

        if (pathname === '/email/production/real-test-send' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 524288) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              if (payload.ownerTestConsentConfirmed !== true) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'OWNER_TEST_CONSENT_REQUIRED', message: '실제 테스트 메일 1통 수신 동의 체크박스를 선택하세요.' }));
                return;
              }
              const recipient = String(payload.recipient || '').trim().toLowerCase();
              if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'INVALID_RECIPIENT_EMAIL' }));
                return;
              }
              if (/resend\.dev$/i.test(recipient)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'SIMULATOR_ADDRESS_USE_SIMULATOR_BOX' }));
                return;
              }
              const fromRes = validateAndFormatSenderFrom({
                displayName: payload.senderDisplayName || '',
                fallbackBusinessNames: [payload.senderName || '', payload.company || '', payload.brand || ''],
                verifiedEmail: 'noreply@vivpr.pro'
              });
              if (!fromRes.ok) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: fromRes.reason }));
                return;
              }
              const replyRes = sanitizeReplyTo(payload.replyTo || '');
              if (!replyRes.ok) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: replyRes.reason }));
                return;
              }
              let effectiveFromRes = fromRes;
              let effectiveReplyTo = replyRes.replyTo || '';
              let optSubjectIn = String(payload.subject || `${fromRes.displayName} · Test Email`).trim().slice(0, 200);
              let optHtmlIn = String(payload.html || `<p>${fromRes.displayName} Real Test Verification</p>`);
              let optTextIn = String(payload.text || `${fromRes.displayName} Real Test Verification`);
              let realTestSpamOpt = null;
              if (payload.autoSpamPrevention === true) {
                const unsubCfgPre = this.pipeline.getUnsubscribePublicConfig();
                const supPre = this.gmailRunner.buildCrossProviderSuppressionIndex();
                const resOpt = optimizeAndScoreEmailMessage({
                  provider: 'RESEND',
                  from: 'noreply@vivpr.pro',
                  displayName: fromRes.displayName,
                  replyTo: effectiveReplyTo,
                  subject: optSubjectIn,
                  preheader: String(payload.preheader || ''),
                  html: optHtmlIn,
                  text: optTextIn,
                  link: String(payload.link || ''),
                  physicalAddress: String(payload.physicalAddress || ''),
                  publicUnsubBase: String(unsubCfgPre?.publicBaseUrl || 'https://unsubscribe.vivpr.pro'),
                  suppressedCount: Number(supPre?.stats?.mergedHashSuppressedCount || 0),
                  historicalBounceRatePct: Number(supPre?.stats?.historicalBounceRatePct || 0),
                  autoOptimize: true,
                  autoAlignReplyTo: payload.autoAlignReplyTo === true,
                  preferLightweightHtml: payload.preferLightweightHtml === true
                });
                realTestSpamOpt = {
                  provider: 'RESEND',
                  riskScore: resOpt.riskScore,
                  grade: resOpt.grade,
                  autoFixesApplied: resOpt.autoFixesApplied,
                  signals: resOpt.signals,
                  recommendations: resOpt.recommendations,
                  honestDisclaimer: resOpt.honestDisclaimer
                };
                if (payload.blockHighRiskSpam === true && resOpt.grade === 'HIGH_RISK') {
                  this._recordDiag('WARN', 'REAL_TEST', 'BLOCKED_HIGH_SPAM_RISK', { riskScore: resOpt.riskScore });
                  res.writeHead(409, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    ok: false,
                    status: 'BLOCKED',
                    reason: 'HIGH_SPAM_RISK_BLOCKED',
                    spamOptimization: realTestSpamOpt,
                    detail: `스팸 위험도 ${resOpt.riskScore}/100 (HIGH_RISK) 감지 — 체크리스트에서 위험 항목을 조정한 뒤 다시 시도하세요.`
                  }));
                  return;
                }
                if (resOpt.optimized.displayName) {
                  const reFrom = validateAndFormatSenderFrom({
                    displayName: resOpt.optimized.displayName,
                    fallbackBusinessNames: ['vivpr.pro'],
                    verifiedEmail: 'noreply@vivpr.pro'
                  });
                  if (reFrom.ok) effectiveFromRes = reFrom;
                }
                effectiveReplyTo = resOpt.optimized.replyTo || '';
                optSubjectIn = (resOpt.optimized.subject || optSubjectIn).slice(0, 200);
                optHtmlIn = resOpt.optimized.html || optHtmlIn;
                optTextIn = resOpt.optimized.text || optTextIn;
                const cleanAddr = String(payload.physicalAddress || '').trim();
                if (cleanAddr.length >= 6) {
                  if (!optHtmlIn.includes(cleanAddr)) {
                    const escAddr = cleanAddr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    optHtmlIn = `${optHtmlIn}\n<p style="font-size:11px;color:#64748b;margin-top:12px;">${escAddr}</p>`;
                  }
                  if (!optTextIn.includes(cleanAddr)) {
                    optTextIn = `${optTextIn}\n\n${cleanAddr}`;
                  }
                }
              }
              const resolvedKey = this.resolveResendApiKey();
              if (!resolvedKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'RESEND_API_KEY_NOT_CONFIGURED' }));
                return;
              }
              const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
              const publicUnsubBase = String(unsubCfg?.publicBaseUrl || '').trim();
              if (!/^https:\/\/(?!127\.0\.0\.1|localhost\b)[a-z0-9.-]+\.[a-z]{2,}/i.test(publicUnsubBase)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED' }));
                return;
              }
              const syncTokenPath = path.join(this.stateDir, '.unsubscribe_sync_token');
              const syncToken = fs.existsSync(syncTokenPath) ? fs.readFileSync(syncTokenPath, 'utf8').trim() : '';
              if (!syncToken) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'UNSUBSCRIBE_SYNC_TOKEN_REQUIRED' }));
                return;
              }

              const rtT0 = Date.now();
              const stepTimings = {};
              const consentT0 = Date.now();
              const consentRec = this.pipeline.consentLedger.recordConsent({
                email: recipient,
                name: 'Owner Real Test',
                authorizationSource: 'owner_studio_real_test_send_consent',
                authorizationAt: new Date().toISOString()
              });
              const consentOk = this.pipeline.consentLedger.verify({
                email: recipient,
                authorizationSource: consentRec.authorizationSource,
                authorizationAt: consentRec.authorizationAt,
                consentProofToken: consentRec.consentProofToken
              });
              stepTimings.consentMs = Date.now() - consentT0;
              if (!consentOk) {
                this._recordDiag('WARN', 'REAL_TEST', 'BLOCKED_CONSENT_PROOF_FAILED', { stepTimings });
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'CONSENT_PROOF_FAILED', stepTimings }));
                return;
              }

              const supT0 = Date.now();
              const syncRes = await this.pipeline.syncRemoteSuppressions({ baseUrl: publicUnsubBase, syncToken });
              stepTimings.suppressionSyncMs = Date.now() - supT0;
              if (!syncRes.ok) {
                this._recordDiag('ERROR', 'REAL_TEST', 'BLOCKED_UNSUBSCRIBE_SYNC_UNAVAILABLE', { stepTimings, detail: syncRes.reason || null });
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'UNSUBSCRIBE_SYNC_UNAVAILABLE', detail: syncRes.reason || null, stepTimings }));
                return;
              }
              if (this.pipeline.isRecipientSuppressed(recipient)) {
                this._recordDiag('WARN', 'REAL_TEST', 'BLOCKED_RECIPIENT_SUPPRESSED', { stepTimings });
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'RECIPIENT_SUPPRESSED', stepTimings }));
                return;
              }

              const pfT0 = Date.now();
              const pf = await this.pipeline.evaluatePreflight({
                hasResendKey: true,
                apiKey: resolvedKey,
                ownerExplicitApproval: true,
                publicUnsubscribeHttpsVerified: true,
                refreshProviderDomain: true
              });
              stepTimings.preflightMs = Date.now() - pfT0;
              if (!pf.resendDomainConfig?.verified || !pf.dns?.allVerified) {
                this._recordDiag('WARN', 'REAL_TEST', 'BLOCKED_DOMAIN_OR_DNS_UNVERIFIED', { stepTimings, reasons: pf.deliverabilityGate?.reasons || [] });
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: 'DOMAIN_OR_DNS_UNVERIFIED', blockingReasons: pf.deliverabilityGate?.reasons || [], stepTimings }));
                return;
              }

              const campaignId = 'studio-real-test-' + new Date().toISOString().slice(0, 10);
              const unsub = this.pipeline.issueRecipientUnsubscribeHeaders(recipient, campaignId, publicUnsubBase);
              const recipientHash = crypto.createHash('sha256').update(recipient).digest('hex');
              const tokT0 = Date.now();
              let regResp = null;
              try {
                regResp = await fetch(`${publicUnsubBase.replace(/\/+$/, '')}/api/sync/tokens`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${syncToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tokenHash: unsub.tokenHash,
                    recipientHash,
                    campaignId,
                    issuedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
                  }),
                  ...(typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(15000) } : {})
                });
              } catch (tokErr) {
                stepTimings.tokenSyncMs = Date.now() - tokT0;
                const reason = /timeout|abort/i.test(tokErr?.message || '') ? 'UNSUBSCRIBE_TOKEN_SYNC_TIMEOUT' : 'UNSUBSCRIBE_TOKEN_SYNC_NETWORK_ERROR';
                this._recordDiag('ERROR', 'REAL_TEST', reason, { stepTimings, error: tokErr?.message || '' });
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason, detail: tokErr?.message || '', stepTimings }));
                return;
              }
              stepTimings.tokenSyncMs = Date.now() - tokT0;
              if (!regResp.ok) {
                this._recordDiag('ERROR', 'REAL_TEST', `UNSUBSCRIBE_TOKEN_SYNC_HTTP_${regResp.status}`, { stepTimings });
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: `UNSUBSCRIBE_TOKEN_SYNC_HTTP_${regResp.status}`, stepTimings }));
                return;
              }

              const idempotencyKey = String(payload.idempotencyKey || `xpider_realtest_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`).slice(0, 128);
              const subject = optSubjectIn;
              const rawHtml = optHtmlIn;
              const rawText = optTextIn;
              const unsubFooterHtml = `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" /><p style="font-size:12px;color:#555;">To unsubscribe: <a href="${unsub.url}">Unsubscribe</a></p>`;
              const finalHtml = rawHtml.includes(unsub.url) ? rawHtml : `${rawHtml}\n${unsubFooterHtml}`;
              const finalText = rawText.includes(unsub.url) ? rawText : `${rawText}\n\nUnsubscribe: ${unsub.url}`;

              this.pipeline._appendAudit({ type: 'REAL_TEST_SEND_STARTED', campaignId, idempotencyKey, fromDisplayName: effectiveFromRes.displayName });
              const resendT0 = Date.now();
              let sendResp = null;
              try {
                sendResp = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${resolvedKey}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey
                  },
                  body: JSON.stringify({
                    from: effectiveFromRes.from,
                    to: [recipient],
                    subject,
                    html: finalHtml,
                    text: finalText,
                    ...(effectiveReplyTo ? { reply_to: effectiveReplyTo } : {}),
                    headers: unsub.headers
                  }),
                  ...(typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(20000) } : {})
                });
              } catch (resendErr) {
                stepTimings.resendPostMs = Date.now() - resendT0;
                stepTimings.totalMs = Date.now() - rtT0;
                const reason = /timeout|abort/i.test(resendErr?.message || '') ? 'RESEND_API_TIMEOUT' : 'RESEND_API_NETWORK_ERROR';
                this.pipeline._appendAudit({ type: 'REAL_TEST_SEND_FAILED', campaignId, idempotencyKey, error: resendErr?.message || reason });
                this._recordDiag('ERROR', 'REAL_TEST', reason, { stepTimings, error: resendErr?.message || '' });
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'FAILED', reason, detail: resendErr?.message || '', stepTimings }));
                return;
              }
              stepTimings.resendPostMs = Date.now() - resendT0;
              stepTimings.totalMs = Date.now() - rtT0;
              const sendBody = await sendResp.json().catch(() => ({}));
              const parts = recipient.split('@');
              const maskedRecipient = `${parts[0].slice(0, 2)}***@${parts[1]}`;
              if (!sendResp.ok || !sendBody.id) {
                this.pipeline._appendAudit({ type: 'REAL_TEST_SEND_FAILED', campaignId, idempotencyKey, status: sendResp.status, error: sendBody });
                this._recordDiag('ERROR', 'REAL_TEST', 'RESEND_REJECTED', { status: sendResp.status, reason: sendBody.message || `RESEND_HTTP_${sendResp.status}`, stepTimings });
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, status: 'FAILED', reason: sendBody.message || `RESEND_HTTP_${sendResp.status}`, stepTimings }));
                return;
              }
              this.pipeline._appendAudit({ type: 'REAL_TEST_SEND_ACCEPTED', campaignId, idempotencyKey, providerMessageId: sendBody.id, fromDisplayName: effectiveFromRes.displayName });
              this._recordDiag('INFO', 'REAL_TEST', 'ACCEPTED', { providerMessageId: sendBody.id, fromDisplayName: effectiveFromRes.displayName, hasReplyTo: Boolean(effectiveReplyTo), stepTimings });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: true,
                status: 'ACCEPTED',
                deliveryState: 'ACCEPTED',
                providerMessageId: sendBody.id,
                idempotencyKey,
                fromHeader: effectiveFromRes.from,
                senderDisplayName: effectiveFromRes.displayName,
                replyTo: effectiveReplyTo || null,
                maskedRecipient,
                ...(realTestSpamOpt ? { spamOptimization: realTestSpamOpt } : {}),
                stepTimings,
                note: 'ACCEPTED는 Resend 서버 접수 상태이며, 실제 수신함 도착(DELIVERED) 여부는 상태 조회로 확인하세요.'
              }));
            } catch (err) {
              this._recordDiag('ERROR', 'REAL_TEST', 'EXCEPTION', { error: err?.message || 'UNKNOWN' });
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'ERROR', reason: err.message }));
            }
          });
          return;
        }

        if ((pathname === '/email/production/import' || pathname === '/email/production/queue/run' || pathname === '/email/production/queue/stop') && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 10485760) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              if (pathname === '/email/production/import') {
                const impT0 = Date.now();
                const out = this.pipeline.importAndPersistRecipients(payload);
                const elapsedMs = Date.now() - impT0;
                const c = out?.summary?.counts || {};
                this._recordDiag('INFO', 'PROD_IMPORT', 'IMPORT_OK', {
                  validCount: out?.imported?.validCount || 0,
                  ready: c.PENDING || 0,
                  accepted: c.ACCEPTED || 0,
                  suppressed: c.SKIPPED_SUPPRESSED || 0,
                  noConsent: c.SKIPPED_NO_CONSENT || 0,
                  elapsedMs
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ...out, elapsedMs }));
                return;
              }
              if (pathname === '/email/production/queue/stop') {
                const out = this.pipeline.stopQueue();
                this._recordDiag('INFO', 'PROD_QUEUE', 'QUEUE_STOPPED', { counts: out?.counts || null });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, status: 'STOPPED', summary: out }));
                return;
              }
              if (pathname === '/email/production/queue/run') {
                const runT0 = Date.now();
                const resolvedKey = this.resolveResendApiKey();
                const hasKey = Boolean(resolvedKey);
                const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
                const publicUnsubBase = String(unsubCfg?.publicBaseUrl || '').trim();
                const isLive = payload.mode === 'LIVE_PRODUCTION';
                const syncTokenPath = path.join(this.stateDir, '.unsubscribe_sync_token');
                const syncToken = fs.existsSync(syncTokenPath) ? fs.readFileSync(syncTokenPath, 'utf8').trim() : null;
                const resolvedBaseUrl = isLive ? publicUnsubBase : (payload.baseUrl || publicUnsubBase || `http://127.0.0.1:${this.port}`);
                const publicHttpsVerified = /^https:\/\/(?!127\.0\.0\.1|localhost\b)[a-z0-9.-]+\.[a-z]{2,}/i.test(resolvedBaseUrl);
                const runArgs = {
                  ...payload,
                  baseUrl: resolvedBaseUrl,
                  hasResendKey: hasKey,
                  apiKey: (!this.trustedTestMode && resolvedKey) ? resolvedKey : (payload.apiKey || null),
                  syncToken: payload.syncToken || syncToken,
                  ownerExplicitApproval: true,
                  publicUnsubscribeHttpsVerified: publicHttpsVerified
                };
                const out = payload.background === true
                  ? await this.pipeline.startQueueBackground(runArgs)
                  : await this.pipeline.runQueue(runArgs);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'PROD_QUEUE', out.status || 'RESULT', {
                  mode: payload.mode || 'DRY_RUN',
                  background: Boolean(payload.background),
                  reason: out.reason || out.stopReason || null,
                  sentInThisRun: out.sentInThisRun || 0,
                  pending: out?.summary?.counts?.PENDING || 0,
                  elapsedMs: Date.now() - runT0
                });
                res.writeHead(out.ok ? (out.status === 'STARTED' ? 202 : 200) : 409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
            } catch (err) {
              const msg = err?.message || 'QUEUE_RUN_EXCEPTION';
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                ok: false,
                status: 'BLOCKED',
                reason: err?.code || 'QUEUE_RUN_EXCEPTION',
                blockingReasons: [err?.code || 'QUEUE_RUN_EXCEPTION', msg].filter(Boolean),
                koreanReason: `운영 발송 요청 처리 중 예외가 발생하여 Fail-Closed로 중단되었습니다: ${msg}`,
                error: msg,
                timestamp: new Date().toISOString()
              }));
            }
          });
          return;
        }

        if (pathname === '/email/deliverability/optimize' && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 2097152) { tooLarge = true; req.destroy(); } });
          req.on('end', () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              const provider = String(payload.provider || 'RESEND').toUpperCase() === 'GMAIL' ? 'GMAIL' : 'RESEND';
              let optimization;
              if (provider === 'GMAIL') {
                optimization = this.gmailRunner.previewDeliverabilityOptimization(payload);
              } else {
                const unsubCfg = this.pipeline.getUnsubscribePublicConfig();
                const supIdx = this.gmailRunner.buildCrossProviderSuppressionIndex();
                optimization = optimizeAndScoreEmailMessage({
                  provider: 'RESEND',
                  from: 'noreply@vivpr.pro',
                  displayName: String(payload.displayName || payload.senderDisplayName || payload.company || payload.brand || 'vivpr.pro'),
                  replyTo: String(payload.replyTo || ''),
                  subject: String(payload.subject || ''),
                  preheader: String(payload.preheader || ''),
                  html: String(payload.html || ''),
                  text: String(payload.text || ''),
                  link: String(payload.link || ''),
                  physicalAddress: String(payload.physicalAddress || ''),
                  publicUnsubBase: String(unsubCfg?.publicBaseUrl || 'https://unsubscribe.vivpr.pro'),
                  suppressedCount: Number(supIdx?.stats?.mergedHashSuppressedCount || 0),
                  historicalBounceRatePct: Number(supIdx?.stats?.historicalBounceRatePct || 0),
                  hygieneChecked: Boolean(this.pipeline?.lastPreflightAt),
                  autoOptimize: payload.autoOptimize !== false,
                  autoAlignReplyTo: payload.autoAlignReplyTo === true,
                  preferLightweightHtml: payload.preferLightweightHtml === true
                });
              }
              this._recordDiag('INFO', 'EMAIL_SPAM_OPT', `${provider}_${optimization.grade || 'CHECKED'}`, {
                provider,
                riskScore: optimization.riskScore,
                autoFixes: optimization.autoFixesApplied?.length || 0
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, provider, optimization }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: err?.message || 'DELIVERABILITY_OPTIMIZE_EXCEPTION' }));
            }
          });
          return;
        }

        if (pathname === '/email/gmail/status' && req.method === 'GET') {
          const supIdx = this.gmailRunner.buildCrossProviderSuppressionIndex();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            provider: 'GMAIL',
            oauthClient: this.gmailVault.getOAuthClientStatus(),
            accounts: this.gmailVault.listAccountsSafe(),
            usage24h: this.gmailVault.getRolling24hUsage(),
            hygiene: supIdx.stats,
            queueSummary: this.gmailRunner.summarizeQueue(),
            dashboard: this.gmailRunner.getTrueDashboard(),
            activeResendCampaign: this.gmailRunner.hasActiveResendCampaign(),
            lastRunResult: this.gmailRunner.lastRunResult || null,
            complianceNotice: 'Gmail API 200 응답은 GMAIL_API_ACCEPTED만 의미하며 전달(DELIVERED)·수신함 도착(INBOX)·열람(OPENED)이나 계정 정지 면제를 보장하지 않습니다. 한도/차단 시 타 계정으로 자동 전환하지 않고 전체 캠페인이 일시 중지됩니다.'
          }));
          return;
        }

        if (pathname === '/email/gmail/dashboard' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            provider: 'GMAIL',
            dashboard: this.gmailRunner.getTrueDashboard(),
            activeResendCampaign: this.gmailRunner.hasActiveResendCampaign()
          }));
          return;
        }

        if (pathname.startsWith('/email/gmail/') && req.method === 'POST') {
          let raw = '';
          let tooLarge = false;
          req.on('data', c => { raw += c; if (raw.length > 10485760) { tooLarge = true; req.destroy(); } });
          req.on('end', async () => {
            if (tooLarge) return;
            try {
              const payload = raw ? JSON.parse(raw) : {};
              if (pathname === '/email/gmail/oauth/client-config') {
                const out = this.gmailVault.saveOAuthClientConfig(payload);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_OAUTH', 'CLIENT_CONFIG', { ok: out.ok, reason: out.reason || null });
                res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/oauth/start') {
                const out = await this.gmailVault.startOAuthPkceFlow(payload);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_OAUTH', 'START_PKCE', { ok: out.ok, reason: out.reason || null });
                res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/accounts/update') {
                const out = this.gmailVault.updateAccountSettings(payload);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_ACCT', 'UPDATE', { ok: out.ok, reason: out.reason || null });
                res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/accounts/disconnect') {
                const out = await this.gmailVault.disconnectAccount(payload.accountId);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_ACCT', 'DISCONNECT', { ok: out.ok, reason: out.reason || null });
                res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/self-test-send') {
                const out = await this.gmailRunner.sendGmailSelfTest({
                  ...payload,
                  ownerExplicitApproval: true
                });
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_SEND', 'SELF_TEST', { ok: out.ok, status: out.status, reason: out.reason || null });
                res.writeHead(out.statusCode || (out.ok ? 200 : 409), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/queue/prepare') {
                const out = this.gmailRunner.prepareGmailQueue(payload);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_QUEUE', 'PREPARE', { ok: out.ok, reason: out.reason || null, ready: out?.summary?.counts?.PENDING || 0 });
                res.writeHead(out.statusCode || (out.ok ? 200 : 400), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/queue/run') {
                const runArgs = { ...payload, ownerExplicitApproval: true };
                const out = payload.background === true
                  ? this.gmailRunner.startGmailQueueBackground(runArgs)
                  : await this.gmailRunner.runGmailQueue(runArgs);
                this._recordDiag(out.ok ? 'INFO' : 'WARN', 'GMAIL_QUEUE', out.status || 'RUN', { ok: out.ok, reason: out.reason || out.stopReason || null, acceptedInThisRun: out.acceptedInThisRun || 0 });
                res.writeHead(out.statusCode || (out.ok ? 200 : 409), { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
                return;
              }
              if (pathname === '/email/gmail/hygiene/check') {
                const report = await this.gmailRunner.checkDeliverabilityHygiene(payload);
                this._recordDiag(report.ok ? 'INFO' : 'WARN', 'GMAIL_HYGIENE', report.status || 'CHECKED', { blockers: report.blockers.length, warnings: report.warnings.length });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, hygiene: report, dashboard: this.gmailRunner.getTrueDashboard() }));
                return;
              }
              if (pathname === '/email/gmail/deliverability/optimize') {
                const optimization = this.gmailRunner.previewDeliverabilityOptimization(payload);
                this._recordDiag('INFO', 'GMAIL_SPAM_OPT', optimization.grade || 'CHECKED', { riskScore: optimization.riskScore, autoFixes: optimization.autoFixesApplied.length });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, provider: 'GMAIL', optimization }));
                return;
              }
              if (pathname === '/email/gmail/queue/stop') {
                const summary = this.gmailRunner.stopQueue(payload.reason || 'OWNER_STOPPED');
                this._recordDiag('INFO', 'GMAIL_QUEUE', 'STOPPED', { counts: summary.counts });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, status: 'STOPPED', summary, dashboard: this.gmailRunner.getTrueDashboard() }));
                return;
              }
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'GMAIL_ENDPOINT_NOT_FOUND' }));
            } catch (err) {
              this._recordDiag('ERROR', 'GMAIL', 'EXCEPTION', { error: err?.code || err?.message || 'UNKNOWN' });
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, status: 'BLOCKED', reason: err?.code || 'GMAIL_EXCEPTION', error: err?.message || 'GMAIL_EXCEPTION' }));
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
      try { if (this.gmailVault) this.gmailVault.closeAllOAuthServers(); } catch (_) {}
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
