'use strict';
/**
 * XPIDER RFC 8058 One-Click Unsubscribe local handler & cryptographic token verifier.
 *
 * SECURITY & RFC 8058 INVARIANTS (Directive #6757748962 P0 Item 3):
 * 1. Unguessable per-recipient tokens signed with HMAC-SHA256 + key-ID rotation (`kid`) +
 *    128-bit random `jti` nonce + expiration (`exp`).
 * 2. Never unsubscribes based on a raw/guessable `email` query or body parameter.
 * 3. `POST /unsubscribe/:token` works without login/cookies (RFC 8058) and atomically updates
 *    durable suppression in `DraftOutbox`, cancelling any pending drafts for that recipient.
 * 4. Duplicate `POST` requests with the same token are idempotent (`200 OK`, `idempotentReplay: true`).
 * 5. `GET /unsubscribe/:token` NEVER mutates suppression state (protects against mail scanner /
 *    prefetch accidental unsubscribes per RFC 8058) and instead renders a confirmation form
 *    that posts back to `/unsubscribe/:token`.
 * 6. Production public HTTPS endpoint reachability is explicitly marked `UNKNOWN` until the
 *    Owner deploys and verifies the endpoint on `vivpr.pro`.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS = Object.freeze({
  publicHttpsDeployed: 'UNKNOWN',
  publicHttpsUrl: 'https://vivpr.pro/unsubscribe/{token}',
  ownerDeploymentRequired: true,
  localOnlyBindingHost: '127.0.0.1'
});

function normalizeEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) ? s : null;
}

function normalizeKeyRing(keyRing) {
  if (!keyRing || typeof keyRing !== 'object') {
    throw Error('KEY_RING_REQUIRED');
  }
  const activeKeyId = String(keyRing.activeKeyId || 'k1');
  const keys = keyRing.keys || (typeof keyRing.secret === 'string' ? { [activeKeyId]: keyRing.secret } : null);
  if (!keys || typeof keys !== 'object' || !keys[activeKeyId]) {
    throw Error('ACTIVE_SIGNING_KEY_REQUIRED');
  }
  for (const [kid, secret] of Object.entries(keys)) {
    if (!kid || typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
      throw Error('TOKEN_SECRET_TOO_SHORT');
    }
  }
  return { activeKeyId, keys };
}

function signPayloadB64(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64, 'utf8').digest('base64url');
}

function issueUnsubscribeToken({ email, campaignId = 'default', keyRing, now = Date.now(), ttlMs = DEFAULT_TTL_MS }) {
  const recipient = normalizeEmail(email);
  if (!recipient) throw Error('INVALID_RECIPIENT_EMAIL');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw Error('INVALID_TOKEN_TTL');
  const ring = normalizeKeyRing(keyRing);
  const payload = {
    v: 1,
    purpose: 'rfc8058_one_click_unsubscribe',
    kid: ring.activeKeyId,
    sub: recipient,
    cid: String(campaignId || 'default'),
    jti: crypto.randomBytes(16).toString('hex'),
    iat: Math.floor(now),
    exp: Math.floor(now + ttlMs)
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = signPayloadB64(payloadB64, ring.keys[ring.activeKeyId]);
  return `${payloadB64}.${sigB64}`;
}

function verifyUnsubscribeToken(token, { keyRing, now = Date.now() }) {
  const ring = normalizeKeyRing(keyRing);
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const [payloadB64, sigB64] = parts;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  if (
    !payload ||
    payload.v !== 1 ||
    payload.purpose !== 'rfc8058_one_click_unsubscribe' ||
    typeof payload.kid !== 'string' ||
    !normalizeEmail(payload.sub) ||
    typeof payload.jti !== 'string' ||
    payload.jti.length < 16 ||
    !Number.isFinite(payload.exp)
  ) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const secret = ring.keys[payload.kid];
  if (!secret) {
    return { valid: false, reason: 'UNKNOWN_KEY_ID' };
  }
  const expectedSigB64 = signPayloadB64(payloadB64, secret);
  const actualBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  if (now > payload.exp) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }
  return {
    valid: true,
    email: normalizeEmail(payload.sub),
    campaignId: payload.cid,
    keyId: payload.kid,
    jti: payload.jti,
    issuedAt: payload.iat,
    expiresAt: payload.exp
  };
}

function extractTokenFromPathOrQuery(reqUrl) {
  const parsed = new URL(reqUrl, 'http://127.0.0.1');
  if (parsed.searchParams.has('email') || parsed.searchParams.has('recipient')) {
    return { error: 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN' };
  }
  const m = /^\/unsubscribe(?:\/([^/?#]+))?\/?$/.exec(parsed.pathname);
  if (!m) return { error: 'NOT_FOUND' };
  const token = m[1] ? decodeURIComponent(m[1]) : parsed.searchParams.get('token');
  if (!token) return { error: 'MALFORMED_TOKEN' };
  return { token };
}

function createUnsubscribeProcessor({ outbox, keyRing, nowFn = () => Date.now() }) {
  if (!outbox || typeof outbox.suppress !== 'function') {
    throw Error('OUTBOX_SUPPRESSION_STORE_REQUIRED');
  }
  const ring = normalizeKeyRing(keyRing);
  const processedJtis = new Set();

  function handleRequest({ method, url, headers = {}, body = '' }) {
    const extracted = extractTokenFromPathOrQuery(url || '/');
    if (extracted.error === 'NOT_FOUND') {
      return { statusCode: 404, body: { status: 'NOT_FOUND' } };
    }
    if (extracted.error === 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN') {
      return { statusCode: 400, body: { status: 'REJECTED', reason: 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN' } };
    }
    if (/(?:^|[&\s])email=/i.test(String(body || '')) && !/List-Unsubscribe\s*=\s*One-Click/i.test(String(body || ''))) {
      return { statusCode: 400, body: { status: 'REJECTED', reason: 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN' } };
    }
    if (extracted.error) {
      return { statusCode: 400, body: { status: 'REJECTED', reason: extracted.error } };
    }

    const verification = verifyUnsubscribeToken(extracted.token, { keyRing: ring, now: nowFn() });
    if (!verification.valid) {
      const statusCode = verification.reason === 'TOKEN_EXPIRED' || verification.reason === 'INVALID_SIGNATURE' || verification.reason === 'UNKNOWN_KEY_ID' ? 403 : 400;
      return { statusCode, body: { status: 'REJECTED', reason: verification.reason } };
    }

    const upperMethod = String(method || '').toUpperCase();
    if (upperMethod === 'GET' || upperMethod === 'HEAD') {
      // RFC 8058 Section 3.1: GET must NEVER perform the unsubscribe action automatically.
      return {
        statusCode: 200,
        contentType: 'text/html; charset=utf-8',
        htmlBody: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Confirm Unsubscribe</title></head><body><form method="POST" action="/unsubscribe/${encodeURIComponent(extracted.token)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Confirm Unsubscribe</button></form></body></html>`,
        body: {
          status: 'CONFIRMATION_REQUIRED_ON_GET',
          stateMutated: false
        }
      };
    }

    if (upperMethod !== 'POST') {
      return { statusCode: 405, body: { status: 'METHOD_NOT_ALLOWED' } };
    }

    const bodyStr = String(body || '').trim();
    const isOneClickBody =
      bodyStr === '' ||
      /List-Unsubscribe\s*=\s*One-Click/i.test(bodyStr) ||
      /name="List-Unsubscribe"[\s\S]*One-Click/i.test(bodyStr);
    if (!isOneClickBody) {
      return { statusCode: 400, body: { status: 'REJECTED', reason: 'INVALID_ONE_CLICK_POST_BODY' } };
    }

    const supResult = outbox.suppress(verification.email, 'UNSUBSCRIBED', {
      eventId: `rfc8058:${verification.jti}`,
      suppressedAt: new Date(nowFn()).toISOString()
    });
    const jtiReplay = processedJtis.has(verification.jti);
    processedJtis.add(verification.jti);

    return {
      statusCode: 200,
      body: {
        status: 'UNSUBSCRIBED',
        idempotentReplay: Boolean(jtiReplay || supResult.alreadySuppressed),
        jti: verification.jti,
        campaignId: verification.campaignId
      }
    };
  }

  return { handleRequest };
}

function startLocalUnsubscribeServer({ outbox, keyRing, port = 0, host = '127.0.0.1', nowFn }) {
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw Error('LOCAL_LOOPBACK_ONLY_REQUIRED');
  }
  const processor = createUnsubscribeProcessor({ outbox, keyRing, nowFn });
  const server = http.createServer((req, res) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > 8192) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const out = processor.handleRequest({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: rawBody
      });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (out.contentType && out.htmlBody && req.headers.accept && req.headers.accept.includes('text/html')) {
        res.writeHead(out.statusCode, { 'Content-Type': out.contentType });
        res.end(out.htmlBody);
        return;
      }
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
        baseUrl: `http://${addr.address}:${addr.port}`,
        close: () => new Promise(r => server.close(() => r()))
      });
    });
  });
}

module.exports = {
  issueUnsubscribeToken,
  verifyUnsubscribeToken,
  createUnsubscribeProcessor,
  startLocalUnsubscribeServer,
  PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS
};
