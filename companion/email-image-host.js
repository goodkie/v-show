'use strict';
/**
 * XPIDER Audited Public Image Hosting Adapter
 * - Validates actual file magic bytes (PNG, JPEG, WebP, GIF) + dimensions + <=3MB limit
 * - Rejects SVG/HTML/script payloads and path traversal
 * - Stores credentials strictly in NTFS-protected %LOCALAPPDATA%\XPIDER\Sidecar\.image_host_config.json
 * - Supports GITHUB_PUBLIC_REPO (verifies repo.private === false!) and CUSTOM_HTTPS_PUT (R2/Worker/CDN)
 * - Performs mandatory ANONYMOUS public GET verification before declaring REMOTE_READY
 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { writeProtectedSecretFile, verifyWindowsDacl } = require('./email-test-sidecar-set-key');

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 8000;

function detectImageSignature(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // Reject SVG / HTML / XML / script payloads disguised as images
  const headText = buf.slice(0, Math.min(256, buf.length)).toString('utf8').trimStart();
  if (/^(?:<\?xml|<!doctype|<svg\b|<html\b|<script\b)/i.test(headText)) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    const width = buf.length >= 24 ? buf.readUInt32BE(16) : 0;
    const height = buf.length >= 24 ? buf.readUInt32BE(20) : 0;
    return { mimeType: 'image/png', ext: 'png', width, height };
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let width = 0, height = 0;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        height = buf.readUInt16BE(i + 5);
        width = buf.readUInt16BE(i + 7);
        break;
      }
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const segLen = buf.readUInt16BE(i + 2);
      if (segLen < 2) break;
      i += 2 + segLen;
    }
    return { mimeType: 'image/jpeg', ext: 'jpg', width, height };
  }
  // GIF: GIF87a / GIF89a
  if (buf.slice(0, 4).toString('ascii') === 'GIF8' && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return { mimeType: 'image/gif', ext: 'gif', width, height };
  }
  // WebP: RIFF....WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    return { mimeType: 'image/webp', ext: 'webp', width: 0, height: 0 };
  }
  return null;
}

function defaultHttpsRequest({ url, method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    let payloadBuf = null;
    const reqHeaders = { ...headers };
    if (body !== null && body !== undefined) {
      payloadBuf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      if (!reqHeaders['Content-Length']) reqHeaders['Content-Length'] = payloadBuf.length;
    }
    const req = https.request(url, { method, headers: reqHeaders, timeout: timeoutMs }, (res) => {
      const chunks = [];
      let totalLen = 0;
      let tooLarge = false;
      res.on('data', (c) => {
        totalLen += c.length;
        if (totalLen > 4 * 1024 * 1024) { tooLarge = true; req.destroy(); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        if (tooLarge) return resolve({ statusCode: 502, headers: res.headers, bodyBuffer: Buffer.alloc(0), json: null, error: 'RESPONSE_TOO_LARGE' });
        const bodyBuffer = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(bodyBuffer.toString('utf8')); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, bodyBuffer, json, error: null });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, headers: {}, bodyBuffer: Buffer.alloc(0), json: null, error: 'TIMEOUT' }); });
    req.on('error', (err) => resolve({ statusCode: 0, headers: {}, bodyBuffer: Buffer.alloc(0), json: null, error: err.code || err.message || 'NETWORK_ERROR' }));
    if (payloadBuf !== null) req.write(payloadBuf);
    req.end();
  });
}

class EmailImageHostManager {
  constructor(options = {}) {
    this.stateDir = options.stateDir;
    this.trustedTestMode = Boolean(options.trustedTestMode);
    this.configFile = path.join(this.stateDir, '.image_host_config.json');
    this.httpRequest = (this.trustedTestMode && typeof options.httpRequest === 'function') ? options.httpRequest : defaultHttpsRequest;
    this.uploadCache = new Map();
  }

  loadConfig() {
    if (!fs.existsSync(this.configFile)) return { ok: false, reason: 'IMAGE_HOST_CONFIG_REQUIRED', config: null };
    if (!this.trustedTestMode && process.platform === 'win32' && process.env.USERNAME) {
      try { verifyWindowsDacl(this.configFile, process.env.USERNAME); } catch (aclErr) {
        return { ok: false, reason: 'IMAGE_HOST_CONFIG_ACL_INVALID', message: aclErr.message, config: null };
      }
    }
    try {
      const cfg = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      if (!cfg || typeof cfg !== 'object' || !cfg.provider) return { ok: false, reason: 'IMAGE_HOST_CONFIG_INVALID', config: null };
      return { ok: true, reason: 'CONFIG_PRESENT', config: cfg };
    } catch (err) {
      return { ok: false, reason: 'IMAGE_HOST_CONFIG_UNREADABLE', message: err.message, config: null };
    }
  }

  getStatus() {
    const loaded = this.loadConfig();
    if (!loaded.ok) {
      return {
        ok: true,
        configured: false,
        status: 'CONFIG_REQUIRED',
        provider: null,
        destinationLabel: '호스팅 미설정 (아래에서 공개 GitHub 저장소 또는 HTTPS 업로드 엔드포인트 등록)',
        reason: loaded.reason
      };
    }
    const c = loaded.config;
    const dest = c.provider === 'GITHUB_PUBLIC_REPO'
      ? `GitHub Public (${c.owner}/${c.repo}@${c.branch || 'main'}/${c.pathPrefix || 'email-assets'})`
      : (c.provider === 'CUSTOM_HTTPS_PUT' ? `HTTPS Object Host (${c.publicBaseUrl})` : c.provider);
    return {
      ok: true,
      configured: true,
      status: 'CONFIGURED',
      provider: c.provider,
      destinationLabel: dest,
      owner: c.owner || null,
      repo: c.repo || null,
      branch: c.branch || 'main',
      pathPrefix: c.pathPrefix || 'email-assets',
      publicBaseUrl: c.publicBaseUrl || null
    };
  }

  saveConfig(payload = {}) {
    if (payload.userConsentConfirmed !== true) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'USER_CONSENT_REQUIRED', message: '로컬 NTFS 보안 저장소에 호스팅 인증정보를 저장하기 전에 동의가 필요합니다.' };
    }
    const provider = String(payload.provider || '').trim();
    const token = String(payload.token || '').trim();
    if (!token || token.length < 8 || /[\s\r\n]/.test(token)) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'INVALID_HOST_TOKEN', message: '유효한 업로드 토큰/API 키를 입력하세요.' };
    }

    let cleanCfg;
    if (provider === 'GITHUB_PUBLIC_REPO') {
      const owner = String(payload.owner || '').trim();
      const repo = String(payload.repo || '').trim();
      const branch = String(payload.branch || 'main').trim() || 'main';
      const pathPrefix = String(payload.pathPrefix || 'email-assets').trim().replace(/^\/+|\/+$/g, '') || 'email-assets';
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || !/^[A-Za-z0-9_.-]{1,64}$/.test(branch) || /\.\./.test(pathPrefix)) {
        return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'INVALID_GITHUB_REPO_CONFIG', message: '유효한 GitHub 소유자(owner), 공개 저장소(repo), 브랜치 및 안전한 경로 접두사를 입력하세요.' };
      }
      cleanCfg = { provider, owner, repo, branch, pathPrefix, token, updatedAt: new Date().toISOString() };
    } else if (provider === 'CUSTOM_HTTPS_PUT') {
      let upUrl, pubUrl;
      try {
        upUrl = new URL(String(payload.uploadEndpoint || '').trim());
        pubUrl = new URL(String(payload.publicBaseUrl || '').trim());
      } catch (_) {
        return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'INVALID_HTTPS_ENDPOINT', message: '유효한 https:// 업로드 엔드포인트 및 공개 기본 URL을 입력하세요.' };
      }
      if (upUrl.protocol !== 'https:' || pubUrl.protocol !== 'https:') {
        return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'HTTPS_REQUIRED', message: '업로드 엔드포인트와 공개 이미지 URL은 반드시 https:// 이어야 합니다.' };
      }
      cleanCfg = { provider, uploadEndpoint: upUrl.href.replace(/\/+$/, ''), publicBaseUrl: pubUrl.href.replace(/\/+$/, ''), pathPrefix: 'email-assets', token, updatedAt: new Date().toISOString() };
    } else {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'UNSUPPORTED_PROVIDER', message: '지원되는 호스팅 공급자는 GITHUB_PUBLIC_REPO 또는 CUSTOM_HTTPS_PUT 입니다.' };
    }

    writeProtectedSecretFile(this.configFile, JSON.stringify(cleanCfg, null, 2) + '\n');
    this.uploadCache.clear();
    return { ok: true, statusCode: 200, status: 'CONFIGURED', ...this.getStatus(), message: '이미지 호스팅 설정이 로컬 NTFS 보안 파일에 저장되었습니다.' };
  }

  async verifyPublicAnonymousGet(publicUrl, expectedMime) {
    let parsed;
    try { parsed = new URL(publicUrl); } catch (_) { return { ok: false, reason: 'INVALID_PUBLIC_URL' }; }
    if (parsed.protocol !== 'https:') return { ok: false, reason: 'HTTPS_REQUIRED' };

    const resp = await this.httpRequest({ url: parsed.href, method: 'GET', headers: { 'Accept': 'image/*' }, timeoutMs: 8000 });
    if (resp.error === 'TIMEOUT') return { ok: false, statusCode: 504, reason: 'PUBLIC_FETCH_TIMEOUT', message: '업로드된 공개 URL 확인 시간이 초과되었습니다.' };
    if (resp.error || resp.statusCode < 200 || resp.statusCode >= 300) {
      return {
        ok: false,
        statusCode: resp.statusCode || 502,
        reason: resp.statusCode === 403 || resp.statusCode === 404 ? `PUBLIC_FETCH_${resp.statusCode}` : 'PUBLIC_FETCH_FAILED',
        message: `업로드된 URL 익명 공개 조회 실패 (HTTP ${resp.statusCode || resp.error}): 비공개 저장소이거나 전파 지연일 수 있습니다.`
      };
    }
    const ct = String((resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || '').toLowerCase();
    const sig = detectImageSignature(resp.bodyBuffer);
    if (!sig || (ct && !ct.startsWith('image/') && ct !== 'application/octet-stream')) {
      return { ok: false, statusCode: 502, reason: 'PUBLIC_FETCH_INVALID_IMAGE_MIME', message: `공개 URL이 유효한 이미지를 반환하지 않았습니다 (Content-Type: ${ct || 'unknown'}).` };
    }
    return { ok: true, statusCode: 200, mimeType: sig.mimeType || expectedMime, width: sig.width, height: sig.height, sizeBytes: resp.bodyBuffer.length };
  }

  async uploadAndVerify(payload = {}) {
    if (payload.publicUploadConsentConfirmed !== true) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'PUBLIC_UPLOAD_CONSENT_REQUIRED', message: '공개 이미지 호스팅 업로드 전에 명시적 공개 업로드 동의가 필요합니다.' };
    }
    const loaded = this.loadConfig();
    if (!loaded.ok) {
      return {
        ok: false,
        statusCode: 503,
        status: 'CONFIG_REQUIRED',
        reason: 'CONFIG_REQUIRED',
        message: '공개 이미지 호스팅 설정이 없습니다. [🔑 이미지 호스팅 설정]에서 공개 저장소 또는 HTTPS 업로드 대상을 먼저 등록하세요.'
      };
    }

    const rawB64 = String(payload.base64Data || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (!rawB64) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'EMPTY_IMAGE_DATA', message: '업로드할 이미지 데이터가 비어 있습니다.' };
    }
    const buf = Buffer.from(rawB64, 'base64');
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: buf.length > MAX_IMAGE_BYTES ? 'IMAGE_TOO_LARGE' : 'EMPTY_IMAGE_DATA', message: '이미지는 3MB 이하의 PNG/JPEG/WebP/GIF 파일만 업로드할 수 있습니다.' };
    }
    const sig = detectImageSignature(buf);
    if (!sig) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'INVALID_IMAGE_SIGNATURE_OR_MIME', message: '허용되지 않는 파일 형식입니다. 실제 PNG/JPEG/WebP/GIF 시그니처만 허용됩니다 (SVG/HTML/스크립트 차단).' };
    }
    if (sig.width > MAX_DIMENSION || sig.height > MAX_DIMENSION) {
      return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'IMAGE_DIMENSIONS_TOO_LARGE', message: `이미지 해상도가 허용 한도(${MAX_DIMENSION}x${MAX_DIMENSION})를 초과했습니다.` };
    }

    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const cfg = loaded.config;
    const cacheKey = `${cfg.provider}:${cfg.owner || cfg.publicBaseUrl}:${sha256}`;
    if (this.uploadCache.has(cacheKey)) {
      return { ...this.uploadCache.get(cacheKey), idempotentReplay: true };
    }

    const dateDir = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeName = `${sha256.slice(0, 16)}_${crypto.randomBytes(4).toString('hex')}.${sig.ext}`;
    const relPath = `${(cfg.pathPrefix || 'email-assets').replace(/^\/+|\/+$/g, '')}/${dateDir}/${safeName}`;
    let publicUrl = '';

    if (cfg.provider === 'GITHUB_PUBLIC_REPO') {
      const repoInfo = await this.httpRequest({
        url: `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${cfg.token}`, 'User-Agent': 'XPIDER-Email-Studio/7.0', 'Accept': 'application/vnd.github+json' },
        timeoutMs: 8000
      });
      if (repoInfo.error || repoInfo.statusCode < 200 || repoInfo.statusCode >= 300 || !repoInfo.json) {
        const statusCode = repoInfo.statusCode === 401 || repoInfo.statusCode === 403 ? repoInfo.statusCode : (repoInfo.error === 'TIMEOUT' ? 504 : 502);
        return { ok: false, statusCode, status: 'ERROR', reason: repoInfo.statusCode === 401 || repoInfo.statusCode === 403 ? 'HOST_AUTH_FAILED' : 'HOST_REPO_LOOKUP_FAILED', message: `GitHub 저장소 확인 실패 (HTTP ${repoInfo.statusCode || repoInfo.error}).` };
      }
      if (repoInfo.json.private !== false) {
        return { ok: false, statusCode: 400, status: 'BLOCKED', reason: 'PRIVATE_REPO_NOT_PUBLICLY_REACHABLE', message: `비공개(private) GitHub 저장소(${cfg.owner}/${cfg.repo})는 이메일 수신자가 익명으로 열람할 수 없어 차단되었습니다. 공개(public) 저장소를 사용하세요.` };
      }

      const putRes = await this.httpRequest({
        url: `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${relPath.split('/').map(encodeURIComponent).join('/')}`,
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${cfg.token}`, 'User-Agent': 'XPIDER-Email-Studio/7.0', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: { message: `chore(email-assets): upload ${safeName}`, content: buf.toString('base64'), branch: cfg.branch || 'main' },
        timeoutMs: 12000
      });
      if (putRes.error || putRes.statusCode < 200 || putRes.statusCode >= 300) {
        return { ok: false, statusCode: putRes.statusCode || 502, status: 'ERROR', reason: putRes.statusCode === 401 || putRes.statusCode === 403 ? 'HOST_AUTH_FAILED' : 'UPLOAD_FAILED', message: `GitHub 업로드 실패 (HTTP ${putRes.statusCode || putRes.error}).` };
      }
      publicUrl = `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch || 'main')}/${relPath}`;
    } else if (cfg.provider === 'CUSTOM_HTTPS_PUT') {
      const targetPutUrl = `${cfg.uploadEndpoint}/${relPath}`;
      const putRes = await this.httpRequest({
        url: targetPutUrl,
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': sig.mimeType },
        body: buf,
        timeoutMs: 12000
      });
      if (putRes.error || putRes.statusCode < 200 || putRes.statusCode >= 300) {
        return { ok: false, statusCode: putRes.statusCode || 502, status: 'ERROR', reason: putRes.statusCode === 401 || putRes.statusCode === 403 ? 'HOST_AUTH_FAILED' : 'UPLOAD_FAILED', message: `이미지 호스팅 업로드 실패 (HTTP ${putRes.statusCode || putRes.error}).` };
      }
      publicUrl = `${cfg.publicBaseUrl}/${relPath}`;
    }

    const pubCheck = await this.verifyPublicAnonymousGet(publicUrl, sig.mimeType);
    if (!pubCheck.ok) {
      return { ok: false, statusCode: pubCheck.statusCode || 502, status: 'ERROR', reason: pubCheck.reason, publicUrl, message: pubCheck.message };
    }

    const finalOut = {
      ok: true,
      statusCode: 200,
      status: 'REMOTE_READY',
      provider: cfg.provider,
      publicUrl,
      verifiedAnonymousGet: true,
      mimeType: pubCheck.mimeType || sig.mimeType,
      width: pubCheck.width || sig.width,
      height: pubCheck.height || sig.height,
      sizeBytes: buf.length,
      sha256
    };
    this.uploadCache.set(cacheKey, finalOut);
    return finalOut;
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  detectImageSignature,
  EmailImageHostManager
};
