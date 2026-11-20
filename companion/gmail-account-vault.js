'use strict';
/**
 * XPIDER V7.1 Gmail Account Vault, Official OAuth 2.0 PKCE Loopback Flow & Rolling-24h Quota Ledger.
 *
 * Security & Compliance Invariants (Issue #6 Directive #7047833293):
 * - Official Google OAuth 2.0 PKCE flow ONLY (no passwords, app passwords, cookies, or UI scraping).
 * - Minimum mail scope: https://www.googleapis.com/auth/gmail.send (+ openid email for verified sender identity only;
 *   NEVER requests gmail.readonly, gmail.modify, or mail.google.com).
 * - Refresh & access tokens are encrypted strictly via Windows DPAPI (winsec.encrypt -> dpapi:<base64>)
 *   inside %LOCALAPPDATA%\XPIDER\Sidecar with NTFS user-only ACL and atomic file replacement.
 * - ZERO tokens or raw secrets ever returned to extension, chrome.storage, logs, HTML, or telemetry.
 * - Authoritative rolling-24h per-account AND per-domain aggregate quota ledger persisted on disk.
 * - Conservative default caps strictly BELOW Google's published ceilings (personal < 500, workspace < 2000).
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const winsec = require('./winsec');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const { GmailSendBlocked } = require('./gmail-sender-foundation');

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GMAIL_OAUTH_SCOPES = [GMAIL_SEND_SCOPE, 'openid', 'email'];
const FORBIDDEN_BROAD_SCOPES = new Set([
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose'
]);

const PUBLISHED_CEILINGS = Object.freeze({
  gmail_personal: 500,
  workspace_paid: 2000
});

const DEFAULT_CONSERVATIVE_CAPS = Object.freeze({
  gmail_personal: 50,
  workspace_paid: 200
});

const DEFAULT_DOMAIN_CAPS = Object.freeze({
  personal: 100,
  workspace: 250
});

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

function maskEmail(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.indexOf('@');
  if (at <= 0) return '***';
  const local = s.slice(0, at);
  const dom = s.slice(at + 1);
  const vis = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${vis}***@${dom}`;
}

function normalizeEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[^\s<>,;:"()@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(s) || s.length > 254) return null;
  return s;
}

function emailDomain(email) {
  const norm = normalizeEmail(email);
  return norm ? norm.split('@')[1] : '';
}

function inferAccountType(email) {
  const dom = emailDomain(email);
  if (dom === 'gmail.com' || dom === 'googlemail.com') return 'gmail_personal';
  return 'workspace_paid';
}

function base64Url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeJwtPayloadUnverified(jwtStr) {
  try {
    const parts = String(jwtStr || '').split('.');
    if (parts.length < 2) return null;
    const pad = '='.repeat((4 - (parts[1].length % 4)) % 4);
    const b64 = (parts[1] + pad).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

class GmailAccountVault {
  constructor(options = {}) {
    this.stateDir = options.stateDir;
    if (!this.stateDir) throw new Error('STATE_DIR_REQUIRED');
    this.trustedTestMode = Boolean(options.trustedTestMode);
    this.fetchImpl = (this.trustedTestMode && typeof options.fetchImpl === 'function')
      ? options.fetchImpl
      : globalThis.fetch;
    this.cryptoBox = (this.trustedTestMode && options.cryptoBox && typeof options.cryptoBox.encrypt === 'function' && typeof options.cryptoBox.decrypt === 'function')
      ? options.cryptoBox
      : { encrypt: (p) => winsec.encrypt(p), decrypt: (c) => winsec.decrypt(c) };
    this.nowFn = (this.trustedTestMode && typeof options.nowFn === 'function')
      ? options.nowFn
      : () => Date.now();

    fs.mkdirSync(this.stateDir, { recursive: true });
    this.oauthClientFile = path.join(this.stateDir, '.gmail_oauth_client.dpapi.json');
    this.vaultFile = path.join(this.stateDir, '.gmail_accounts_vault.dpapi.json');
    this.domainCapsFile = path.join(this.stateDir, '.gmail_domain_caps.json');
    this.quotaLedgerFile = path.join(this.stateDir, '.gmail_quota_ledger.jsonl');

    this._pendingOAuthSessions = new Map();
    this._activeOAuthServers = new Map();
    this._vault = this._loadVault();
    this._domainCaps = this._loadDomainCaps();
  }

  _encryptSecret(plainText) {
    const str = String(plainText || '');
    if (!str) return '';
    const enc = this.cryptoBox.encrypt(str);
    if (!enc || typeof enc !== 'string' || (!enc.startsWith('dpapi:') && !enc.startsWith('testbox:'))) {
      throw new GmailSendBlocked('DPAPI_VAULT_ENCRYPTION_REQUIRED');
    }
    return enc;
  }

  _decryptSecret(cipherRef) {
    if (!cipherRef || typeof cipherRef !== 'string') return '';
    if (!cipherRef.startsWith('dpapi:') && !(this.trustedTestMode && cipherRef.startsWith('testbox:'))) {
      throw new GmailSendBlocked('INSECURE_TOKEN_STORAGE_REJECTED');
    }
    const plain = this.cryptoBox.decrypt(cipherRef);
    return typeof plain === 'string' ? plain : '';
  }

  _readProtectedJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
      try { verifyWindowsDacl(filePath, process.env.USERNAME); } catch (_) { return fallback; }
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      return fallback;
    }
  }

  _writeProtectedJson(filePath, obj) {
    writeProtectedSecretFile(filePath, JSON.stringify(obj, null, 2) + '\n');
  }

  _loadVault() {
    const raw = this._readProtectedJson(this.vaultFile, null);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.accounts)) {
      return { version: 1, updatedAt: null, accounts: [] };
    }
    return raw;
  }

  _saveVault() {
    this._vault.updatedAt = new Date(this.nowFn()).toISOString();
    this._writeProtectedJson(this.vaultFile, this._vault);
  }

  _loadDomainCaps() {
    const raw = this._readProtectedJson(this.domainCapsFile, null);
    return (raw && typeof raw === 'object' && raw.caps && typeof raw.caps === 'object')
      ? raw
      : { version: 1, updatedAt: null, caps: {} };
  }

  _saveDomainCaps() {
    this._domainCaps.updatedAt = new Date(this.nowFn()).toISOString();
    this._writeProtectedJson(this.domainCapsFile, this._domainCaps);
  }

  // ===== OAuth Client Config (Owner-supplied Google Cloud Desktop/Loopback Client ID) =====
  saveOAuthClientConfig({ clientId, clientSecret = '', userConsentConfirmed = false } = {}) {
    if (userConsentConfirmed !== true) {
      return {
        ok: false,
        statusCode: 400,
        reason: 'USER_CONSENT_REQUIRED',
        message: 'Google OAuth 클라이언트 설정을 로컬 DPAPI 보안 저장소에 저장하려면 사용자 동의가 필요합니다.'
      };
    }
    const cid = String(clientId || '').trim();
    if (!cid || cid.length < 16 || !/^[A-Za-z0-9._-]+$/.test(cid)) {
      return {
        ok: false,
        statusCode: 400,
        reason: 'INVALID_OAUTH_CLIENT_ID',
        message: '유효한 Google OAuth 2.0 Desktop/Installed Client ID를 입력하세요 (예: ...apps.googleusercontent.com).'
      };
    }
    const secTrim = String(clientSecret || '').trim();
    const secretRef = secTrim ? this._encryptSecret(secTrim) : null;
    this._writeProtectedJson(this.oauthClientFile, {
      version: 1,
      clientId: cid,
      hasClientSecret: Boolean(secretRef),
      clientSecretRef: secretRef,
      updatedAt: new Date(this.nowFn()).toISOString()
    });
    return {
      ok: true,
      statusCode: 200,
      configured: true,
      clientIdPreview: `${cid.slice(0, 12)}...${cid.slice(-8)}`,
      hasClientSecret: Boolean(secretRef)
    };
  }

  getOAuthClientStatus() {
    const cfg = this._readProtectedJson(this.oauthClientFile, null);
    if (!cfg || !cfg.clientId) {
      return { configured: false, clientIdPreview: null, hasClientSecret: false, updatedAt: null };
    }
    const cid = String(cfg.clientId);
    return {
      configured: true,
      clientIdPreview: `${cid.slice(0, 12)}...${cid.slice(-8)}`,
      hasClientSecret: Boolean(cfg.clientSecretRef),
      updatedAt: cfg.updatedAt || null
    };
  }

  _loadOAuthClientInternal() {
    const cfg = this._readProtectedJson(this.oauthClientFile, null);
    if (!cfg || !cfg.clientId) return null;
    let clientSecret = '';
    if (cfg.clientSecretRef) {
      clientSecret = this._decryptSecret(cfg.clientSecretRef);
      if (!clientSecret) {
        throw new GmailSendBlocked('DPAPI_REPROVISION_REQUIRED');
      }
    }
    return { clientId: String(cfg.clientId), clientSecret };
  }

  // ===== Official Google OAuth 2.0 PKCE Loopback Flow =====
  async startOAuthPkceFlow({ accountType = null, cap24h = null, startLoopbackServer = true } = {}) {
    const client = this._loadOAuthClientInternal();
    if (!client) {
      return {
        ok: false,
        statusCode: 409,
        reason: 'GMAIL_OAUTH_CLIENT_NOT_CONFIGURED',
        message: 'Google Cloud OAuth 2.0 Desktop Client ID가 아직 등록되지 않았습니다. 먼저 로컬 DPAPI 저장소에 Client ID를 등록하세요.'
      };
    }

    const codeVerifier = base64Url(crypto.randomBytes(48));
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64Url(crypto.randomBytes(24));
    const expiresAt = this.nowFn() + 5 * 60 * 1000;

    let redirectUri = 'http://127.0.0.1/oauth2/callback';
    let server = null;

    if (startLoopbackServer) {
      server = http.createServer(async (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          if (u.pathname !== '/oauth2/callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
          }
          const errParam = u.searchParams.get('error');
          const reqState = u.searchParams.get('state') || '';
          const code = u.searchParams.get('code') || '';
          if (errParam) {
            this._cleanupOAuthSession(state);
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><html><body style="font-family:system-ui;padding:32px;"><h2>Gmail OAuth 연결 취소 또는 거부됨</h2><p>사유: ${String(errParam).replace(/[<>&"]/g, '')}</p><p>이 창을 닫고 XPIDER Email Studio로 돌아가세요.</p></body></html>`);
            return;
          }
          const out = await this.completeOAuthCallback({ state: reqState, code });
          if (out.ok) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><html><body style="font-family:system-ui;padding:32px;"><h2>✅ Gmail 계정 연결 완료</h2><p>연결된 계정: <b>${out.account.maskedEmail}</b> (최소 권한: gmail.send)</p><p>토큰은 로컬 Windows DPAPI 보안 저장소에만 암호화 저장되었습니다. 이 창을 닫고 XPIDER Email Studio에서 상태를 새로고침하세요.</p></body></html>`);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!doctype html><html><body style="font-family:system-ui;padding:32px;"><h2>❌ Gmail OAuth 연결 실패</h2><p>사유: ${String(out.reason || 'OAUTH_FAILED').replace(/[<>&"]/g, '')}</p><p>이 창을 닫고 다시 시도하세요.</p></body></html>`);
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('OAuth callback error');
        }
      });

      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          redirectUri = `http://127.0.0.1:${addr.port}/oauth2/callback`;
          resolve();
        });
      });

      const timer = setTimeout(() => this._cleanupOAuthSession(state), 5 * 60 * 1000);
      if (typeof timer.unref === 'function') timer.unref();
      this._activeOAuthServers.set(state, { server, timer });
    }

    this._pendingOAuthSessions.set(state, {
      state,
      codeVerifier,
      redirectUri,
      accountType: accountType || null,
      cap24h: Number.isSafeInteger(Number(cap24h)) && Number(cap24h) > 0 ? Number(cap24h) : null,
      expiresAt
    });

    const authParams = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_OAUTH_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent select_account',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state
    });

    return {
      ok: true,
      statusCode: 200,
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`,
      state,
      redirectUri,
      scopes: [...GMAIL_OAUTH_SCOPES],
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  _cleanupOAuthSession(state) {
    this._pendingOAuthSessions.delete(state);
    const active = this._activeOAuthServers.get(state);
    if (active) {
      clearTimeout(active.timer);
      try { active.server.close(); } catch (_) {}
      this._activeOAuthServers.delete(state);
    }
  }

  closeAllOAuthServers() {
    for (const st of Array.from(this._activeOAuthServers.keys())) {
      this._cleanupOAuthSession(st);
    }
  }

  async completeOAuthCallback({ state, code }) {
    const sess = this._pendingOAuthSessions.get(String(state || ''));
    if (!sess || this.nowFn() > sess.expiresAt) {
      this._cleanupOAuthSession(state);
      return { ok: false, statusCode: 400, reason: 'OAUTH_STATE_INVALID_OR_EXPIRED' };
    }
    if (!code || typeof code !== 'string') {
      this._cleanupOAuthSession(state);
      return { ok: false, statusCode: 400, reason: 'OAUTH_CODE_MISSING' };
    }
    const client = this._loadOAuthClientInternal();
    if (!client) {
      this._cleanupOAuthSession(state);
      return { ok: false, statusCode: 409, reason: 'GMAIL_OAUTH_CLIENT_NOT_CONFIGURED' };
    }

    try {
      const form = new URLSearchParams({
        code: String(code),
        client_id: client.clientId,
        redirect_uri: sess.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: sess.codeVerifier
      });
      if (client.clientSecret) form.set('client_secret', client.clientSecret);

      const tokResp = await this.fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        ...(this.fetchImpl === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(15000) } : {})
      });
      const tokJson = await tokResp.json().catch(() => ({}));
      if (!tokResp || !tokResp.ok || !tokJson.access_token) {
        return { ok: false, statusCode: 400, reason: tokJson.error || 'OAUTH_TOKEN_EXCHANGE_FAILED' };
      }

      const grantedScopes = String(tokJson.scope || '').split(/\s+/).filter(Boolean);
      if (!grantedScopes.includes(GMAIL_SEND_SCOPE)) {
        return { ok: false, statusCode: 403, reason: 'REQUIRED_GMAIL_SEND_SCOPE_NOT_GRANTED' };
      }
      for (const s of grantedScopes) {
        if (FORBIDDEN_BROAD_SCOPES.has(s)) {
          return { ok: false, statusCode: 403, reason: 'FORBIDDEN_OVERBROAD_GMAIL_SCOPE_REJECTED' };
        }
      }

      // Resolve authenticated email strictly from id_token or OIDC userinfo (zero inbox read scope)
      let verifiedEmail = null;
      let emailVerified = false;
      if (tokJson.id_token) {
        const claims = decodeJwtPayloadUnverified(tokJson.id_token);
        if (claims && claims.email) {
          verifiedEmail = normalizeEmail(claims.email);
          emailVerified = claims.email_verified === true;
        }
      }
      if (!verifiedEmail) {
        const uiResp = await this.fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
          method: 'GET',
          headers: { Authorization: `Bearer ${tokJson.access_token}` },
          ...(this.fetchImpl === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(10000) } : {})
        }).catch(() => null);
        if (uiResp && uiResp.ok) {
          const ui = await uiResp.json().catch(() => ({}));
          verifiedEmail = normalizeEmail(ui.email);
          emailVerified = ui.email_verified === true;
        }
      }
      if (!verifiedEmail || !emailVerified) {
        return { ok: false, statusCode: 403, reason: 'GMAIL_ACCOUNT_EMAIL_UNVERIFIED' };
      }

      const resolvedType = (sess.accountType === 'workspace_paid' || sess.accountType === 'gmail_personal')
        ? sess.accountType
        : inferAccountType(verifiedEmail);
      const ceiling = PUBLISHED_CEILINGS[resolvedType] || 500;
      const defaultCap = DEFAULT_CONSERVATIVE_CAPS[resolvedType] || 50;
      const resolvedCap = (sess.cap24h && sess.cap24h < ceiling) ? sess.cap24h : defaultCap;

      const tokenPayload = {
        access_token: tokJson.access_token,
        refresh_token: tokJson.refresh_token || null,
        scope: grantedScopes.join(' '),
        token_type: tokJson.token_type || 'Bearer',
        expiry_date: this.nowFn() + Math.max(60, Number(tokJson.expires_in || 3600)) * 1000
      };
      const accountId = 'gm_' + crypto.createHash('sha256').update(verifiedEmail).digest('hex').slice(0, 16);
      const existingIdx = this._vault.accounts.findIndex(a => a.id === accountId || a.email === verifiedEmail);

      // Preserve prior refresh_token if Google omitted it on reconnect
      if (!tokenPayload.refresh_token && existingIdx >= 0 && this._vault.accounts[existingIdx].tokenRef) {
        try {
          const prevPlain = this._decryptSecret(this._vault.accounts[existingIdx].tokenRef);
          const prevTok = prevPlain ? JSON.parse(prevPlain) : null;
          if (prevTok && prevTok.refresh_token) tokenPayload.refresh_token = prevTok.refresh_token;
        } catch (_) {}
      }

      const tokenRef = this._encryptSecret(JSON.stringify(tokenPayload));
      const nowIso = new Date(this.nowFn()).toISOString();
      const prevRec = existingIdx >= 0 ? this._vault.accounts[existingIdx] : null;
      const domain = emailDomain(verifiedEmail);
      const mergedSendAs = Array.from(new Set([
        verifiedEmail,
        ...((prevRec && Array.isArray(prevRec.verifiedSendAs)) ? prevRec.verifiedSendAs : [])
      ].map(normalizeEmail).filter(Boolean)));

      const record = {
        id: accountId,
        email: verifiedEmail,
        maskedEmail: maskEmail(verifiedEmail),
        domain,
        type: resolvedType,
        ownerAuthorized: true,
        connected: true,
        verified: true,
        disabled: false,
        providerBlocked: false,
        blockReason: null,
        cap24h: prevRec && Number.isSafeInteger(prevRec.cap24h) && prevRec.cap24h > 0 && prevRec.cap24h < ceiling ? prevRec.cap24h : resolvedCap,
        verifiedSendAs: mergedSendAs,
        tokenScope: grantedScopes.join(' '),
        hasRefreshToken: Boolean(tokenPayload.refresh_token),
        tokenExpiresAt: new Date(tokenPayload.expiry_date).toISOString(),
        tokenRef,
        connectedAt: (prevRec && prevRec.connectedAt) || nowIso,
        updatedAt: nowIso,
        lastError: null
      };

      if (existingIdx >= 0) this._vault.accounts[existingIdx] = record;
      else this._vault.accounts.push(record);
      this._saveVault();

      return { ok: true, statusCode: 200, account: this._toSafeAccount(record) };
    } finally {
      this._cleanupOAuthSession(state);
    }
  }

  /**
   * Test-only helper for seeding a DPAPI/testbox-encrypted mock account without live Google OAuth.
   * Strictly rejected unless trustedTestMode === true.
   */
  upsertMockAccountForTest({ email, type = null, cap24h = null, accessToken = 'TEST_ACCESS_TOKEN', refreshToken = 'TEST_REFRESH_TOKEN', verifiedSendAs = null, ownerAuthorized = true, connected = true, verified = true, disabled = false, providerBlocked = false }) {
    if (!this.trustedTestMode) {
      throw new GmailSendBlocked('TEST_ONLY_ACCOUNT_SEED_REJECTED');
    }
    const norm = normalizeEmail(email);
    if (!norm) throw new GmailSendBlocked('INVALID_EMAIL');
    const resolvedType = type || inferAccountType(norm);
    const ceiling = PUBLISHED_CEILINGS[resolvedType] || 500;
    const resolvedCap = Number.isSafeInteger(cap24h) ? cap24h : (DEFAULT_CONSERVATIVE_CAPS[resolvedType] || 50);
    if (resolvedCap <= 0 || resolvedCap >= ceiling) {
      throw new GmailSendBlocked('ACCOUNT_LEDGER_OR_CONSERVATIVE_CAP_UNKNOWN');
    }
    const id = 'gm_' + crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16);
    const nowIso = new Date(this.nowFn()).toISOString();
    const tokenRef = this._encryptSecret(JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      scope: GMAIL_OAUTH_SCOPES.join(' '),
      token_type: 'Bearer',
      expiry_date: this.nowFn() + 3600 * 1000
    }));
    const rec = {
      id,
      email: norm,
      maskedEmail: maskEmail(norm),
      domain: emailDomain(norm),
      type: resolvedType,
      ownerAuthorized: Boolean(ownerAuthorized),
      connected: Boolean(connected),
      verified: Boolean(verified),
      disabled: Boolean(disabled),
      providerBlocked: Boolean(providerBlocked),
      blockReason: providerBlocked ? 'TEST_BLOCKED' : null,
      cap24h: resolvedCap,
      verifiedSendAs: Array.isArray(verifiedSendAs) && verifiedSendAs.length ? verifiedSendAs.map(normalizeEmail).filter(Boolean) : [norm],
      tokenScope: GMAIL_OAUTH_SCOPES.join(' '),
      hasRefreshToken: Boolean(refreshToken),
      tokenExpiresAt: new Date(this.nowFn() + 3600 * 1000).toISOString(),
      tokenRef,
      connectedAt: nowIso,
      updatedAt: nowIso,
      lastError: null
    };
    const idx = this._vault.accounts.findIndex(a => a.id === id);
    if (idx >= 0) this._vault.accounts[idx] = rec;
    else this._vault.accounts.push(rec);
    this._saveVault();
    return this._toSafeAccount(rec);
  }

  // ===== Token Retrieval, Refresh & Revocation Handling =====
  async getValidAccessToken(accountId) {
    const acct = this._vault.accounts.find(a => a.id === accountId);
    if (!acct || !acct.connected || !acct.tokenRef) {
      throw new GmailSendBlocked('ACCOUNT_NOT_AVAILABLE_PAUSE_CAMPAIGN');
    }
    let rawPlain = '';
    try {
      rawPlain = this._decryptSecret(acct.tokenRef);
    } catch (err) {
      this.markAccountBlocked(accountId, 'DPAPI_REPROVISION_REQUIRED', { disconnect: true });
      throw new GmailSendBlocked('DPAPI_REPROVISION_REQUIRED');
    }
    if (!rawPlain) {
      this.markAccountBlocked(accountId, 'DPAPI_REPROVISION_REQUIRED', { disconnect: true });
      throw new GmailSendBlocked('DPAPI_REPROVISION_REQUIRED');
    }
    let tok;
    try { tok = JSON.parse(rawPlain); } catch (_) {
      this.markAccountBlocked(accountId, 'TOKEN_CORRUPTED_RECONNECT_REQUIRED', { disconnect: true });
      throw new GmailSendBlocked('GMAIL_AUTH_REVOKED');
    }

    const nowMs = this.nowFn();
    if (tok.access_token && Number.isFinite(tok.expiry_date) && tok.expiry_date > nowMs + 60000) {
      return tok.access_token;
    }

    // Refresh via official Google OAuth 2.0 token endpoint
    if (!tok.refresh_token) {
      this.markAccountBlocked(accountId, 'GMAIL_AUTH_REVOKED', { disconnect: true });
      throw new GmailSendBlocked('GMAIL_AUTH_REVOKED');
    }
    const client = this._loadOAuthClientInternal();
    if (!client) {
      this.markAccountBlocked(accountId, 'GMAIL_OAUTH_CLIENT_NOT_CONFIGURED', { disconnect: false });
      throw new GmailSendBlocked('GMAIL_AUTH_REVOKED');
    }

    const form = new URLSearchParams({
      client_id: client.clientId,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token'
    });
    if (client.clientSecret) form.set('client_secret', client.clientSecret);

    let resp;
    try {
      resp = await this.fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        ...(this.fetchImpl === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(15000) } : {})
      });
    } catch (_) {
      throw new GmailSendBlocked('GMAIL_TOKEN_REFRESH_NETWORK_ERROR');
    }
    const body = await resp.json().catch(() => ({}));
    if (!resp || resp.status === 400 || resp.status === 401 || body.error === 'invalid_grant') {
      this.markAccountBlocked(accountId, 'GMAIL_AUTH_REVOKED', { disconnect: true });
      throw new GmailSendBlocked('GMAIL_AUTH_REVOKED');
    }
    if (!resp.ok || !body.access_token) {
      throw new GmailSendBlocked('GMAIL_TOKEN_REFRESH_FAILED');
    }

    const refreshed = {
      ...tok,
      access_token: body.access_token,
      expiry_date: this.nowFn() + Math.max(60, Number(body.expires_in || 3600)) * 1000
    };
    acct.tokenRef = this._encryptSecret(JSON.stringify(refreshed));
    acct.tokenExpiresAt = new Date(refreshed.expiry_date).toISOString();
    acct.updatedAt = new Date(this.nowFn()).toISOString();
    acct.lastError = null;
    this._saveVault();
    return refreshed.access_token;
  }

  markAccountBlocked(accountId, reason, { disconnect = false } = {}) {
    const acct = this._vault.accounts.find(a => a.id === accountId);
    if (!acct) return false;
    acct.providerBlocked = true;
    acct.blockReason = String(reason || 'PROVIDER_BLOCKED');
    acct.lastError = acct.blockReason;
    if (disconnect) acct.connected = false;
    acct.updatedAt = new Date(this.nowFn()).toISOString();
    this._saveVault();
    return true;
  }

  updateAccountSettings({ accountId, cap24h = undefined, type = undefined, disabled = undefined, clearProviderBlock = false, domainCap24h = undefined } = {}) {
    const acct = this._vault.accounts.find(a => a.id === accountId);
    if (!acct) return { ok: false, statusCode: 404, reason: 'ACCOUNT_NOT_FOUND' };

    if (type !== undefined) {
      if (type !== 'gmail_personal' && type !== 'workspace_paid') {
        return { ok: false, statusCode: 400, reason: 'INVALID_ACCOUNT_TYPE' };
      }
      acct.type = type;
    }
    const ceiling = PUBLISHED_CEILINGS[acct.type] || 500;
    if (cap24h !== undefined) {
      const n = Number(cap24h);
      if (!Number.isSafeInteger(n) || n <= 0 || n >= ceiling) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'CONSERVATIVE_CAP_REQUIRED_BELOW_PUBLISHED_CEILING',
          message: `일일 상한은 Google 공식 한도(${ceiling}건)보다 엄격하게 낮은 양의 정수(1~${ceiling - 1})여야 합니다.`
        };
      }
      acct.cap24h = n;
    } else if (acct.cap24h >= ceiling) {
      acct.cap24h = DEFAULT_CONSERVATIVE_CAPS[acct.type] || 50;
    }
    if (disabled !== undefined) acct.disabled = Boolean(disabled);
    if (clearProviderBlock === true && acct.connected) {
      acct.providerBlocked = false;
      acct.blockReason = null;
      acct.lastError = null;
    }
    if (domainCap24h !== undefined) {
      const dc = Number(domainCap24h);
      const domMax = acct.type === 'workspace_paid' ? 1999 : 499;
      if (!Number.isSafeInteger(dc) || dc <= 0 || dc > domMax) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'INVALID_DOMAIN_CAP_24H',
          message: `도메인 합산 24시간 상한은 1~${domMax} 사이여야 합니다.`
        };
      }
      this._domainCaps.caps[acct.domain] = dc;
      this._saveDomainCaps();
    }
    acct.updatedAt = new Date(this.nowFn()).toISOString();
    this._saveVault();
    return { ok: true, statusCode: 200, account: this._toSafeAccount(acct) };
  }

  async disconnectAccount(accountId) {
    const acct = this._vault.accounts.find(a => a.id === accountId);
    if (!acct) return { ok: false, statusCode: 404, reason: 'ACCOUNT_NOT_FOUND' };
    if (acct.tokenRef) {
      try {
        const plain = this._decryptSecret(acct.tokenRef);
        const tok = plain ? JSON.parse(plain) : null;
        const revTok = (tok && (tok.refresh_token || tok.access_token)) || null;
        if (revTok && typeof this.fetchImpl === 'function') {
          await this.fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(revTok)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            ...(this.fetchImpl === globalThis.fetch && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(8000) } : {})
          }).catch(() => {});
        }
      } catch (_) {}
    }
    acct.connected = false;
    acct.tokenRef = null;
    acct.hasRefreshToken = false;
    acct.tokenExpiresAt = null;
    acct.blockReason = 'OWNER_DISCONNECTED';
    acct.updatedAt = new Date(this.nowFn()).toISOString();
    this._saveVault();
    return { ok: true, statusCode: 200, account: this._toSafeAccount(acct) };
  }

  // ===== Authoritative Rolling-24h Quota Ledger =====
  recordQuotaEvent({ accountId, domain, campaignId = 'default', recipientHash = '', idempotencyKey = '', providerMessageId = null, status = 'GMAIL_API_ACCEPTED' }) {
    const entry = {
      ts: this.nowFn(),
      at: new Date(this.nowFn()).toISOString(),
      accountId: String(accountId || ''),
      domain: String(domain || '').toLowerCase(),
      campaignId: String(campaignId || 'default'),
      recipientHash: String(recipientHash || ''),
      idempotencyKey: String(idempotencyKey || ''),
      providerMessageId: providerMessageId || null,
      status: String(status || 'GMAIL_API_ACCEPTED')
    };
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.appendFileSync(this.quotaLedgerFile, JSON.stringify(entry) + '\n', { mode: 0o600 });
    return entry;
  }

  getRolling24hUsage() {
    const cutoff = this.nowFn() - ROLLING_WINDOW_MS;
    const perAccount = {};
    const perDomain = {};
    const countedKeys = new Set();
    if (!fs.existsSync(this.quotaLedgerFile)) {
      return { perAccount, perDomain, windowHours: 24 };
    }
    const lines = fs.readFileSync(this.quotaLedgerFile, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (!e || !Number.isFinite(e.ts) || e.ts < cutoff) continue;
        // Count both accepted sends and uncertain in-flight timeouts conservatively against rolling 24h cap
        if (e.status !== 'GMAIL_API_ACCEPTED' && e.status !== 'IN_FLIGHT_UNKNOWN') continue;
        const dedup = e.idempotencyKey ? `${e.accountId}:${e.idempotencyKey}` : null;
        if (dedup && countedKeys.has(dedup)) continue;
        if (dedup) countedKeys.add(dedup);
        if (e.accountId) perAccount[e.accountId] = (perAccount[e.accountId] || 0) + 1;
        if (e.domain) perDomain[e.domain] = (perDomain[e.domain] || 0) + 1;
      } catch (_) {}
    }
    return { perAccount, perDomain, windowHours: 24 };
  }

  getDomainCap24h(domain, accountType = 'gmail_personal') {
    const dom = String(domain || '').toLowerCase();
    const configured = this._domainCaps.caps[dom];
    const maxAllowed = accountType === 'workspace_paid' ? 1999 : 499;
    if (Number.isSafeInteger(configured) && configured > 0 && configured <= maxAllowed) {
      return configured;
    }
    return (dom === 'gmail.com' || dom === 'googlemail.com')
      ? DEFAULT_DOMAIN_CAPS.personal
      : DEFAULT_DOMAIN_CAPS.workspace;
  }

  getAccountById(accountId) {
    return this._vault.accounts.find(a => a.id === accountId) || null;
  }

  getInternalAccountsWithUsage() {
    const usage = this.getRolling24hUsage();
    return this._vault.accounts.map(a => ({
      ...a,
      sent24h: usage.perAccount[a.id] || 0,
      domainSent24h: usage.perDomain[a.domain] || 0,
      domainCap24h: this.getDomainCap24h(a.domain, a.type)
    }));
  }

  _toSafeAccount(acct, usageOpt = null) {
    const usage = usageOpt || this.getRolling24hUsage();
    const sent24h = usage.perAccount[acct.id] || 0;
    const domainSent24h = usage.perDomain[acct.domain] || 0;
    const domainCap24h = this.getDomainCap24h(acct.domain, acct.type);
    const ceiling = PUBLISHED_CEILINGS[acct.type] || 500;
    let status = 'CONNECTED';
    if (!acct.connected) status = acct.blockReason === 'DPAPI_REPROVISION_REQUIRED' ? 'NEEDS_RECONNECT_NEW_MACHINE' : (acct.blockReason === 'GMAIL_AUTH_REVOKED' ? 'REVOKED' : 'DISCONNECTED');
    else if (acct.providerBlocked) status = 'PROVIDER_BLOCKED';
    else if (acct.disabled) status = 'DISABLED';
    else if (sent24h >= acct.cap24h) status = 'ACCOUNT_CAP_REACHED';
    else if (domainSent24h >= domainCap24h) status = 'DOMAIN_CAP_REACHED';

    return {
      id: acct.id,
      maskedEmail: acct.maskedEmail || maskEmail(acct.email),
      domain: acct.domain,
      type: acct.type,
      publishedCeiling24h: ceiling,
      ownerAuthorized: Boolean(acct.ownerAuthorized),
      connected: Boolean(acct.connected),
      verified: Boolean(acct.verified),
      disabled: Boolean(acct.disabled),
      providerBlocked: Boolean(acct.providerBlocked),
      blockReason: acct.blockReason || null,
      status,
      cap24h: acct.cap24h,
      sent24h,
      remaining24h: Math.max(0, acct.cap24h - sent24h),
      domainSent24h,
      domainCap24h,
      verifiedSendAsMasked: (Array.isArray(acct.verifiedSendAs) ? acct.verifiedSendAs : []).map(maskEmail),
      hasRefreshToken: Boolean(acct.hasRefreshToken),
      tokenExpiresAt: acct.tokenExpiresAt || null,
      connectedAt: acct.connectedAt || null,
      updatedAt: acct.updatedAt || null,
      lastError: acct.lastError || null
    };
  }

  listAccountsSafe() {
    const usage = this.getRolling24hUsage();
    return this._vault.accounts.map(a => this._toSafeAccount(a, usage));
  }
}

module.exports = {
  GmailAccountVault,
  GMAIL_SEND_SCOPE,
  GMAIL_OAUTH_SCOPES,
  PUBLISHED_CEILINGS,
  DEFAULT_CONSERVATIVE_CAPS,
  DEFAULT_DOMAIN_CAPS,
  maskEmail,
  normalizeEmail,
  emailDomain
};
