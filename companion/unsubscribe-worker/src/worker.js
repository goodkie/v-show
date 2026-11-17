/**
 * XPIDER 24/7 Public Unsubscribe Worker (Cloudflare Workers + D1)
 * - Scanner-safe GET /unsubscribe/:token (zero state mutation, renders CSRF-protected confirmation form)
 * - RFC 8058 One-Click POST /unsubscribe/:token + browser confirmation POST (idempotent)
 * - Valid-signature expired tokens (>10y) still honored for suppression (expiredTokenGrace: true)
 * - Zero raw email storage/enumeration; stores SHA-256(recipientEmail) in D1 `suppressions`
 * - Authenticated Bearer sync endpoints (/api/sync/tokens, /api/sync/suppressions) for Sidecar pre-send gate
 */

const SEC_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SEC_HEADERS }
  });
}

function htmlRes(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SEC_HEADERS }
  });
}

function b64UrlToBytes(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualStr(a, b) {
  const aa = new TextEncoder().encode(String(a || ''));
  const bb = new TextEncoder().encode(String(b || ''));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function hmacB64Url(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToB64Url(new Uint8Array(sig));
}

async function verifyToken(token, secret, nowMs = Date.now()) {
  if (!token || typeof token !== 'string' || !secret || secret.length < 32) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }
  const [payloadB64, sigB64] = parts;
  const expected = await hmacB64Url(secret, payloadB64);
  if (!timingSafeEqualStr(sigB64, expected)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadB64)));
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

async function checkRateLimit(db, bucketKey, maxPerMin) {
  const nowMin = Math.floor(Date.now() / 60000);
  const row = await db.prepare('SELECT count, window_start FROM rate_limits WHERE bucket_key = ?').bind(bucketKey).first();
  if (!row || row.window_start !== nowMin) {
    await db.prepare('INSERT INTO rate_limits (bucket_key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket_key) DO UPDATE SET count = 1, window_start = excluded.window_start').bind(bucketKey, nowMin).run();
    return true;
  }
  if (row.count >= maxPerMin) return false;
  await db.prepare('UPDATE rate_limits SET count = count + 1 WHERE bucket_key = ?').bind(bucketKey).run();
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedHost = String(env.ALLOWED_HOST || '').trim().toLowerCase();
    if (allowedHost && url.hostname.toLowerCase() !== allowedHost && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      return jsonRes({ ok: false, error: 'FORBIDDEN_HOST' }, 403);
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1 AS ok').first();
        return jsonRes({ ok: true, service: 'xpider-unsubscribe-worker', d1Ready: true });
      } catch (err) {
        return jsonRes({ ok: false, service: 'xpider-unsubscribe-worker', d1Ready: false, error: 'D1_UNAVAILABLE' }, 503);
      }
    }

    // Authenticated Sidecar <-> Worker Sync Routes
    if (url.pathname.startsWith('/api/sync/')) {
      const auth = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!env.SIDECAR_SYNC_TOKEN || env.SIDECAR_SYNC_TOKEN.length < 16 || !timingSafeEqualStr(token, env.SIDECAR_SYNC_TOKEN)) {
        return jsonRes({ ok: false, error: 'UNAUTHORIZED' }, 401);
      }

      if (url.pathname === '/api/sync/tokens' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || !body.tokenHash || !body.recipientHash) {
          return jsonRes({ ok: false, error: 'INVALID_PAYLOAD' }, 400);
        }
        await env.DB.prepare(
          'INSERT OR IGNORE INTO unsubscribe_tokens (token_hash, recipient_hash, campaign_id, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          String(body.tokenHash),
          String(body.recipientHash),
          String(body.campaignId || 'default'),
          String(body.issuedAt || new Date().toISOString()),
          String(body.expiresAt || new Date(Date.now() + 10 * 365 * 86400000).toISOString())
        ).run();
        return jsonRes({ ok: true, recorded: true });
      }

      if (url.pathname === '/api/sync/suppressions' && request.method === 'GET') {
        const since = url.searchParams.get('since') || '';
        const stmt = since
          ? env.DB.prepare('SELECT recipient_hash, reason, suppressed_at, updated_at FROM suppressions WHERE updated_at >= ? ORDER BY updated_at ASC').bind(since)
          : env.DB.prepare('SELECT recipient_hash, reason, suppressed_at, updated_at FROM suppressions ORDER BY updated_at ASC');
        const rows = await stmt.all();
        return jsonRes({ ok: true, suppressions: rows.results || [] });
      }

      return jsonRes({ ok: false, error: 'NOT_FOUND' }, 404);
    }

    // Public Unsubscribe Route (/unsubscribe/:token)
    if (url.pathname.startsWith('/unsubscribe/')) {
      if (url.searchParams.has('email') || url.searchParams.has('recipient')) {
        return jsonRes({ status: 'REJECTED', reason: 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN' }, 400);
      }
      const rawToken = decodeURIComponent(url.pathname.slice('/unsubscribe/'.length)).replace(/\/+$/, '');
      const ver = await verifyToken(rawToken, env.UNSUBSCRIBE_HMAC_SECRET);
      if (!ver.valid) {
        const status = (ver.reason === 'INVALID_SIGNATURE') ? 403 : 400;
        return jsonRes({ status: 'REJECTED', reason: ver.reason }, status);
      }

      const tokenHash = await sha256Hex(rawToken);
      const recipientHash = await sha256Hex(ver.email);
      const confirmCsrf = await hmacB64Url(env.UNSUBSCRIBE_HMAC_SECRET, `csrf:${ver.jti}:${recipientHash}`);

      if (request.method === 'GET' || request.method === 'HEAD') {
        const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>구독 취소 확인</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;"><h2>이메일 수신 거부 확인</h2><p>아래 버튼을 누르면 즉시 수신 거부 처리되며 이후 안내 메일이 발송되지 않습니다.</p><form method="POST" action="/unsubscribe/${encodeURIComponent(rawToken)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><input type="hidden" name="confirmCsrf" value="${confirmCsrf}"><button type="submit" style="padding:10px 18px;background:#0f172a;color:#fff;border:0;border-radius:6px;cursor:pointer;">구독 취소 확인 (Confirm Unsubscribe)</button></form></body></html>`;
        return htmlRes(html, 200);
      }

      if (request.method !== 'POST') {
        return jsonRes({ status: 'METHOD_NOT_ALLOWED' }, 405);
      }

      const maxPerMin = Number(env.RATE_LIMIT_MAX_PER_MIN || 30);
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipHash = await sha256Hex(clientIp);
      const allowed = await checkRateLimit(env.DB, `ip:${ipHash.slice(0, 16)}`, maxPerMin);
      if (!allowed) {
        return jsonRes({ status: 'RATE_LIMITED', reason: 'TOO_MANY_REQUESTS' }, 429);
      }

      const bodyStr = (await request.text()).trim();
      const csrfMatch = bodyStr.match(/(?:^|&)confirmCsrf=([^&\s]+)/);
      if (csrfMatch) {
        const supplied = decodeURIComponent(csrfMatch[1]);
        if (!timingSafeEqualStr(supplied, confirmCsrf)) {
          return jsonRes({ status: 'REJECTED', reason: 'INVALID_CONFIRM_CSRF' }, 403);
        }
      }
      const isOneClickBody =
        bodyStr === '' ||
        /List-Unsubscribe\s*=\s*One-Click/i.test(bodyStr) ||
        /List-Unsubscribe=One-Click/i.test(decodeURIComponent(bodyStr));
      if (!isOneClickBody) {
        return jsonRes({ status: 'REJECTED', reason: 'INVALID_ONE_CLICK_POST_BODY' }, 400);
      }

      const nowIso = new Date().toISOString();
      const existing = await env.DB.prepare('SELECT recipient_hash FROM suppressions WHERE recipient_hash = ?').bind(recipientHash).first();
      await env.DB.prepare(
        'INSERT INTO suppressions (recipient_hash, reason, source_token_hash, suppressed_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(recipient_hash) DO UPDATE SET updated_at = excluded.updated_at'
      ).bind(recipientHash, 'UNSUBSCRIBED', tokenHash, nowIso, nowIso).run();

      await env.DB.prepare(
        'UPDATE unsubscribe_tokens SET used_at = COALESCE(used_at, ?) WHERE token_hash = ?'
      ).bind(nowIso, tokenHash).run();

      await env.DB.prepare(
        'INSERT INTO unsubscribe_audit (event_type, token_hash, recipient_hash, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(ver.expired ? 'UNSUBSCRIBE_EXPIRED_GRACE' : 'UNSUBSCRIBE_ONE_CLICK', tokenHash, recipientHash, ipHash.slice(0, 16), nowIso).run();

      return jsonRes({
        status: 'UNSUBSCRIBED',
        idempotentReplay: Boolean(existing),
        expiredTokenGrace: Boolean(ver.expired)
      }, 200);
    }

    return jsonRes({ ok: false, error: 'NOT_FOUND' }, 404);
  }
};
