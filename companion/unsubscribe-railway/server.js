'use strict';
/**
 * XPIDER 24/7 Public Unsubscribe Server for Railway (`xpider-unsubscribe`)
 * - Custom Domain target: https://unsubscribe.vivpr.pro
 * - Scanner-safe GET /unsubscribe/:token (zero state mutation, renders CSRF-protected confirmation form)
 * - RFC 8058 One-Click POST /unsubscribe/:token + browser confirmation POST (idempotent)
 * - Durable persistence on Railway Volume (`DATA_DIR`, default `/data` or local `./data`)
 * - Valid-signature expired tokens (>10y) still honored for suppression (expiredTokenGrace: true)
 * - Authenticated Bearer sync endpoints (/api/sync/tokens, /api/sync/suppressions) for Sidecar pre-send gate
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SEC_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

function sha256Hex(v) {
  return crypto.createHash('sha256').update(String(v || ''), 'utf8').digest('hex');
}

function timingSafeEqualStr(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function hmacB64Url(secret, message) {
  return crypto.createHmac('sha256', secret).update(message, 'utf8').digest('base64url');
}

function verifySvixSignature(headers, rawBody, secret) {
  if (!secret || typeof secret !== 'string' || !secret.startsWith('whsec_')) return false;
  const svixId = String(headers['svix-id'] || '');
  const svixTs = String(headers['svix-timestamp'] || '');
  const svixSig = String(headers['svix-signature'] || '');
  if (!svixId || !svixTs || !svixSig) return false;
  const tsNum = Number(svixTs);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;
  const keyBytes = Buffer.from(secret.slice(6), 'base64');
  const expected = crypto.createHmac('sha256', keyBytes).update(`${svixId}.${svixTs}.${rawBody}`, 'utf8').digest('base64');
  for (const part of svixSig.split(/\s+/)) {
    const [ver, sig] = part.split(',');
    if (ver === 'v1' && sig && timingSafeEqualStr(sig, expected)) return true;
  }
  return false;
}

function verifyUnsubscribeToken(token, secret, nowMs = Date.now()) {
  if (!token || typeof token !== 'string' || !secret || secret.length < 32) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const [payloadB64, sigB64] = parts;
  const expected = hmacB64Url(secret, payloadB64);
  if (!timingSafeEqualStr(sigB64, expected)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  if (!payload || payload.v !== 1 || payload.purpose !== 'rfc8058_one_click_unsubscribe' || !payload.sub || !payload.jti) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const expired = Number.isFinite(payload.exp) && nowMs > payload.exp;
  return {
    valid: true,
    expired,
    email: String(payload.sub).trim().toLowerCase(),
    campaignId: String(payload.cid || 'default'),
    jti: String(payload.jti)
  };
}

class DurableSuppressionStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.suppressionsFile = path.join(this.dataDir, 'suppressions.json');
    this.tokensFile = path.join(this.dataDir, 'tokens.json');
    this.auditFile = path.join(this.dataDir, 'audit.jsonl');
    this.eventsFile = path.join(this.dataDir, 'events.jsonl');
    this.suppressions = this._loadMap(this.suppressionsFile);
    this.tokens = this._loadMap(this.tokensFile);
    this.eventIds = this._loadEventIds();
  }

  _loadEventIds() {
    const ids = new Set();
    try {
      if (fs.existsSync(this.eventsFile)) {
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n').filter(Boolean);
        for (const l of lines) {
          try { const o = JSON.parse(l); if (o && o.event_id) ids.add(String(o.event_id)); } catch (_) {}
        }
      }
    } catch (_) {}
    return ids;
  }

  recordProviderEvent(evt) {
    const eventId = String(evt.event_id || '').trim();
    if (!eventId || this.eventIds.has(eventId)) return false;
    this.eventIds.add(eventId);
    fs.appendFileSync(this.eventsFile, JSON.stringify(evt) + '\n', { mode: 0o600 });
    return true;
  }

  listEvents(sinceIso = '', limit = 500) {
    if (!fs.existsSync(this.eventsFile)) return [];
    const max = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    const out = [];
    const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try {
        const o = JSON.parse(l);
        if (!o) continue;
        if (sinceIso && String(o.created_at || '') < sinceIso) continue;
        out.push(o);
      } catch (_) {}
    }
    return out.slice(-max);
  }

  _loadMap(file) {
    try {
      if (fs.existsSync(file)) {
        const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (obj && typeof obj === 'object') return new Map(Object.entries(obj));
      }
    } catch (_) {}
    return new Map();
  }

  _writeMapAtomic(file, map) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  recordToken({ tokenHash, recipientHash, campaignId, issuedAt, expiresAt }) {
    if (!this.tokens.has(tokenHash)) {
      this.tokens.set(tokenHash, {
        token_hash: tokenHash,
        recipient_hash: recipientHash,
        campaign_id: campaignId || 'default',
        issued_at: issuedAt || new Date().toISOString(),
        expires_at: expiresAt || new Date(Date.now() + 10 * 365 * 86400000).toISOString(),
        used_at: null
      });
      this._writeMapAtomic(this.tokensFile, this.tokens);
    }
  }

  suppress({ recipientHash, tokenHash, reason = 'UNSUBSCRIBED' }) {
    const nowIso = new Date().toISOString();
    const existing = this.suppressions.get(recipientHash);
    this.suppressions.set(recipientHash, {
      recipient_hash: recipientHash,
      reason,
      source_token_hash: tokenHash,
      suppressed_at: existing ? existing.suppressed_at : nowIso,
      updated_at: nowIso
    });
    this._writeMapAtomic(this.suppressionsFile, this.suppressions);

    const tok = this.tokens.get(tokenHash);
    if (tok && !tok.used_at) {
      tok.used_at = nowIso;
      this._writeMapAtomic(this.tokensFile, this.tokens);
    }
    return { idempotentReplay: Boolean(existing) };
  }

  listSuppressions(sinceIso = '') {
    const all = Array.from(this.suppressions.values());
    const filtered = sinceIso ? all.filter(r => r.updated_at >= sinceIso) : all;
    return filtered.sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  }

  appendAudit(evt) {
    fs.appendFileSync(this.auditFile, JSON.stringify({ ...evt, created_at: new Date().toISOString() }) + '\n', { mode: 0o600 });
  }
}

function createUnsubscribeRailwayServer(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const hmacSecret = options.hmacSecret || process.env.UNSUBSCRIBE_HMAC_SECRET || '';
  const syncToken = options.syncToken || process.env.SIDECAR_SYNC_TOKEN || '';
  const webhookSecret = options.webhookSecret || process.env.RESEND_WEBHOOK_SECRET || '';
  const allowedHosts = new Set(
    String(options.allowedHost || process.env.ALLOWED_HOST || 'unsubscribe.vivpr.pro')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const maxPerMin = Number(options.rateLimitMaxPerMin || process.env.RATE_LIMIT_MAX_PER_MIN || 30);
  const store = new DurableSuppressionStore(dataDir);
  const rateBuckets = new Map();

  function checkRate(ipHash) {
    const nowMin = Math.floor(Date.now() / 60000);
    const cur = rateBuckets.get(ipHash);
    if (!cur || cur.min !== nowMin) {
      rateBuckets.set(ipHash, { min: nowMin, count: 1 });
      return true;
    }
    if (cur.count >= maxPerMin) return false;
    cur.count++;
    return true;
  }

  function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...SEC_HEADERS });
    res.end(JSON.stringify(obj));
  }

  const server = http.createServer((req, res) => {
    const rawHost = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (rawHost && rawHost !== '127.0.0.1' && rawHost !== 'localhost' && !rawHost.endsWith('.up.railway.app') && !allowedHosts.has(rawHost)) {
      return sendJson(res, 403, { ok: false, error: 'FORBIDDEN_HOST' });
    }

    let urlObj;
    try {
      urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    } catch (_) {
      return sendJson(res, 400, { ok: false, error: 'INVALID_URL' });
    }
    const pathname = urlObj.pathname;

    if (pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        service: 'xpider-unsubscribe',
        storageReady: true,
        webhookConfigured: Boolean(webhookSecret && webhookSecret.startsWith('whsec_')),
        suppressionCount: store.suppressions.size
      });
    }

    if (pathname === '/webhooks/resend' && req.method === 'POST') {
      let raw = '';
      req.on('data', c => { raw += c; if (raw.length > 131072) req.destroy(); });
      req.on('end', () => {
        if (!verifySvixSignature(req.headers, raw, webhookSecret)) {
          return sendJson(res, 401, { ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' });
        }
        try {
          const evt = JSON.parse(raw || '{}');
          const type = String(evt.type || '');
          const data = evt.data || {};
          const toList = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : (data.email ? [data.email] : []));
          const recipientHashes = [];
          for (const addr of toList) {
            const norm = String(addr || '').trim().toLowerCase();
            if (norm) recipientHashes.push(sha256Hex(norm));
          }
          const bounceSub = String(data.bounce?.type || data.bounce?.subType || '').toLowerCase();
          const isSoftBounce = type === 'email.bounced' && (bounceSub.includes('soft') || bounceSub.includes('transient'));
          let suppressedCount = 0;
          if ((type === 'email.bounced' && !isSoftBounce) || type === 'email.complained' || type === 'contact.unsubscribed') {
            const reason = type === 'email.bounced' ? 'HARD_BOUNCED' : (type === 'email.complained' ? 'COMPLAINED' : 'UNSUBSCRIBED');
            for (const rh of recipientHashes) {
              store.suppress({ recipientHash: rh, tokenHash: `webhook:${data.email_id || type}`, reason });
              suppressedCount++;
            }
          }
          const svixId = String(req.headers['svix-id'] || '').trim();
          const evtCreated = String(evt.created_at || data.created_at || new Date().toISOString());
          const eventId = svixId || `${data.email_id || 'no_id'}:${type}:${evtCreated}`;
          store.recordProviderEvent({
            event_id: eventId,
            type,
            email_id: data.email_id || null,
            recipient_hashes: recipientHashes,
            bounce_type: type === 'email.bounced' ? (isSoftBounce ? 'soft' : 'hard') : null,
            click_link: data.click?.link || null,
            created_at: evtCreated,
            received_at: new Date().toISOString()
          });
          store.appendAudit({ event_type: `WEBHOOK_${type || 'UNKNOWN'}`, email_id: data.email_id || null, suppressed_count: suppressedCount });
          return sendJson(res, 200, { ok: true, type, suppressedCount });
        } catch (_) {
          return sendJson(res, 400, { ok: false, error: 'INVALID_JSON' });
        }
      });
      return;
    }

    if (pathname.startsWith('/api/sync/')) {
      const auth = String(req.headers.authorization || '');
      const tok = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!syncToken || syncToken.length < 16 || !timingSafeEqualStr(tok, syncToken)) {
        return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      }
      if (pathname === '/api/sync/suppressions' && req.method === 'GET') {
        const since = urlObj.searchParams.get('since') || '';
        return sendJson(res, 200, { ok: true, suppressions: store.listSuppressions(since) });
      }
      if (pathname === '/api/sync/events' && req.method === 'GET') {
        const since = urlObj.searchParams.get('since') || '';
        const limit = urlObj.searchParams.get('limit') || '500';
        return sendJson(res, 200, { ok: true, events: store.listEvents(since, limit) });
      }
      if (pathname === '/api/sync/tokens' && req.method === 'POST') {
        let raw = '';
        req.on('data', c => { raw += c; if (raw.length > 16384) req.destroy(); });
        req.on('end', () => {
          try {
            const body = JSON.parse(raw || '{}');
            if (!body.tokenHash || !body.recipientHash) return sendJson(res, 400, { ok: false, error: 'INVALID_PAYLOAD' });
            store.recordToken(body);
            return sendJson(res, 200, { ok: true, recorded: true });
          } catch (_) {
            return sendJson(res, 400, { ok: false, error: 'INVALID_JSON' });
          }
        });
        return;
      }
      return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
    }

    if (pathname.startsWith('/unsubscribe/')) {
      if (urlObj.searchParams.has('email') || urlObj.searchParams.has('recipient')) {
        return sendJson(res, 400, { status: 'REJECTED', reason: 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN' });
      }
      const rawToken = decodeURIComponent(pathname.slice('/unsubscribe/'.length)).replace(/\/+$/, '');
      const ver = verifyUnsubscribeToken(rawToken, hmacSecret);
      if (!ver.valid) {
        return sendJson(res, ver.reason === 'INVALID_SIGNATURE' ? 403 : 400, { status: 'REJECTED', reason: ver.reason });
      }

      const tokenHash = sha256Hex(rawToken);
      const recipientHash = sha256Hex(ver.email);
      const confirmCsrf = hmacB64Url(hmacSecret, `csrf:${ver.jti}:${recipientHash}`);

      if (req.method === 'GET' || req.method === 'HEAD') {
        const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>구독 취소 확인</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;"><h2>이메일 수신 거부 확인</h2><p>아래 버튼을 누르면 즉시 수신 거부 처리되며 이후 안내 메일이 발송되지 않습니다.</p><form method="POST" action="/unsubscribe/${encodeURIComponent(rawToken)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><input type="hidden" name="confirmCsrf" value="${confirmCsrf}"><button type="submit" style="padding:10px 18px;background:#0f172a;color:#fff;border:0;border-radius:6px;cursor:pointer;">구독 취소 확인 (Confirm Unsubscribe)</button></form></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SEC_HEADERS });
        res.end(req.method === 'HEAD' ? '' : html);
        return;
      }

      if (req.method !== 'POST') {
        return sendJson(res, 405, { status: 'METHOD_NOT_ALLOWED' });
      }

      const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
      const ipHash = sha256Hex(clientIp).slice(0, 16);
      if (!checkRate(ipHash)) {
        return sendJson(res, 429, { status: 'RATE_LIMITED', reason: 'TOO_MANY_REQUESTS' });
      }

      let raw = '';
      req.on('data', c => { raw += c; if (raw.length > 8192) req.destroy(); });
      req.on('end', () => {
        const bodyStr = raw.trim();
        const csrfMatch = bodyStr.match(/(?:^|&)confirmCsrf=([^&\s]+)/);
        if (csrfMatch) {
          const supplied = decodeURIComponent(csrfMatch[1]);
          if (!timingSafeEqualStr(supplied, confirmCsrf)) {
            return sendJson(res, 403, { status: 'REJECTED', reason: 'INVALID_CONFIRM_CSRF' });
          }
        }
        const isOneClickBody =
          bodyStr === '' ||
          /List-Unsubscribe\s*=\s*One-Click/i.test(bodyStr) ||
          /List-Unsubscribe=One-Click/i.test(decodeURIComponent(bodyStr));
        if (!isOneClickBody) {
          return sendJson(res, 400, { status: 'REJECTED', reason: 'INVALID_ONE_CLICK_POST_BODY' });
        }

        const supRes = store.suppress({ recipientHash, tokenHash });
        store.appendAudit({
          event_type: ver.expired ? 'UNSUBSCRIBE_EXPIRED_GRACE' : 'UNSUBSCRIBE_ONE_CLICK',
          token_hash: tokenHash,
          recipient_hash: recipientHash,
          ip_hash: ipHash
        });
        return sendJson(res, 200, {
          status: 'UNSUBSCRIBED',
          idempotentReplay: supRes.idempotentReplay,
          expiredTokenGrace: Boolean(ver.expired)
        });
      });
      return;
    }

    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  });

  return { server, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const { server } = createUnsubscribeRailwayServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`xpider-unsubscribe listening on 0.0.0.0:${port}`);
  });
}

module.exports = { createUnsubscribeRailwayServer, DurableSuppressionStore, verifyUnsubscribeToken };
