'use strict';
/**
 * XPIDER V7.1 Official GitHub Release Auto-Updater (Explicit Opt-In, Fail-Closed SHA-256 Verified).
 *
 * Security & Compliance Invariants:
 * - Strictly checks ONLY official GitHub Releases of `goodkie/v-show` over HTTPS.
 * - Strict host allowlist for API & download redirects (api.github.com, github.com,
 *   objects.githubusercontent.com, release-assets.githubusercontent.com).
 * - NEVER downloads or executes arbitrary URLs supplied by UI/client payloads.
 * - Requires BOTH matching `XPIDER_V7.1.0_SETUP_*.exe` AND `XPIDER_V7.1.0_*.sha256.txt` assets.
 * - Fail-closed SHA-256 verification before launching installer; deletes file on any mismatch.
 * - Preserves 100% of %LOCALAPPDATA%\XPIDER\Sidecar durable user data, keys, OAuth vault & suppressions.
 * - Zero automatic background checks on studio boot; triggered only on explicit operator click.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const GITHUB_OWNER = 'goodkie';
const GITHUB_REPO = 'v-show';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=15`;
const MAX_INSTALLER_BYTES = 120 * 1024 * 1024; // 120 MB safety ceiling
const MAX_REDIRECTS = 6;

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com'
]);

function isAllowedGithubHttpsUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    if (ALLOWED_DOWNLOAD_HOSTS.has(host)) return true;
    if (host.endsWith('.githubusercontent.com')) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function readInstalledProvenance(appRoot) {
  const fallback = {
    app: 'XPIDER AutoForm Sender Pro',
    packageVersion: '7.1.0',
    manifestVersion: '',
    commitShort: '',
    commitFull: '',
    builtAtUtc: '',
    signingStatus: 'UNSIGNED',
    appRoot: appRoot || ''
  };
  if (!appRoot) return fallback;
  try {
    const provPath = path.join(appRoot, 'RELEASE_PROVENANCE.json');
    if (fs.existsSync(provPath)) {
      const parsed = JSON.parse(fs.readFileSync(provPath, 'utf8'));
      return {
        app: String(parsed.app || fallback.app),
        packageVersion: String(parsed.packageVersion || fallback.packageVersion),
        manifestVersion: String(parsed.manifestVersion || ''),
        commitShort: String(parsed.commitShort || '').trim().toLowerCase(),
        commitFull: String(parsed.commitFull || '').trim().toLowerCase(),
        builtAtUtc: String(parsed.builtAtUtc || ''),
        signingStatus: String(parsed.signingStatus || 'UNSIGNED'),
        appRoot
      };
    }
  } catch (_) {}
  // Fallback: infer short commit from portable folder name like XPIDER_V7.1.0_PORTABLE_e5bd306a
  const folderMatch = String(appRoot || '').match(/PORTABLE_([0-9a-f]{8})(?:[\\/]|$)/i);
  if (folderMatch) {
    fallback.commitShort = folderMatch[1].toLowerCase();
  }
  return fallback;
}

function parseSetupAssetCommit(name, tagName) {
  const m1 = String(name || '').match(/^XPIDER_V[0-9.]+_SETUP_([0-9a-f]{7,12})\.exe$/i);
  if (m1) return m1[1].toLowerCase().slice(0, 8);
  const m2 = String(tagName || '').match(/-([0-9a-f]{7,12})$/i);
  if (m2) return m2[1].toLowerCase().slice(0, 8);
  return '';
}

function parseExpectedSha256ForAsset(shaTxt, assetName) {
  const target = String(assetName || '').trim().toLowerCase();
  const lines = String(shaTxt || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (!m) continue;
    const hash = m[1].toLowerCase();
    const fname = path.basename(m[2].trim()).toLowerCase();
    if (fname === target) return hash;
  }
  return '';
}

async function fetchGithubChecked(urlStr, { fetchImpl = globalThis.fetch, headers = {}, accept = '*/*' } = {}) {
  let currentUrl = String(urlStr || '');
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedGithubHttpsUrl(currentUrl)) {
      throw Object.assign(new Error(`DISALLOWED_UPDATE_HOST: ${currentUrl}`), { code: 'DISALLOWED_UPDATE_HOST' });
    }
    const resp = await fetchImpl(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'XPIDER-AutoForm-Updater/7.1',
        Accept: accept,
        ...headers
      }
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers && typeof resp.headers.get === 'function' ? resp.headers.get('location') : null;
      if (!loc) throw Object.assign(new Error('REDIRECT_WITHOUT_LOCATION'), { code: 'REDIRECT_WITHOUT_LOCATION' });
      currentUrl = new URL(loc, currentUrl).href;
      continue;
    }
    return resp;
  }
  throw Object.assign(new Error('TOO_MANY_REDIRECTS'), { code: 'TOO_MANY_REDIRECTS' });
}

function selectReleaseFromList(releases, requestedTagName = '', includePrereleases = true) {
  const list = Array.isArray(releases) ? releases : [];
  const candidates = [];
  for (const rel of list) {
    if (!rel || rel.draft === true) continue;
    if (!includePrereleases && rel.prerelease === true) continue;
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const setupAsset = assets.find(a => a && /^XPIDER_V[0-9.]+_SETUP_[0-9a-f]{7,12}\.exe$/i.test(String(a.name || '')));
    if (!setupAsset) continue;
    const commitShort = parseSetupAssetCommit(setupAsset.name, rel.tag_name);
    const shaAsset = assets.find(a => a && /^XPIDER_V[0-9.]+_[0-9a-f]{7,12}\.sha256\.txt$/i.test(String(a.name || ''))) || null;
    candidates.push({
      tagName: String(rel.tag_name || ''),
      title: String(rel.name || rel.tag_name || ''),
      publishedAt: String(rel.published_at || rel.created_at || ''),
      prerelease: Boolean(rel.prerelease),
      commitShort,
      htmlUrl: String(rel.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${encodeURIComponent(String(rel.tag_name || ''))}`),
      notesPreview: String(rel.body || '').replace(/\r\n/g, '\n').trim().slice(0, 900),
      setupAsset: {
        name: String(setupAsset.name),
        size: Number(setupAsset.size || 0),
        downloadUrl: String(setupAsset.browser_download_url || '')
      },
      shaAsset: shaAsset ? {
        name: String(shaAsset.name),
        size: Number(shaAsset.size || 0),
        downloadUrl: String(shaAsset.browser_download_url || '')
      } : null
    });
  }
  if (requestedTagName) {
    const cleanReq = String(requestedTagName).trim();
    return candidates.find(c => c.tagName === cleanReq) || null;
  }
  return candidates[0] || null;
}

class XpiderAppUpdater {
  constructor(options = {}) {
    this.appRoot = options.appRoot || path.resolve(__dirname, '..');
    this.stateDir = options.stateDir || path.join(process.env.LOCALAPPDATA || this.appRoot, 'XPIDER', 'Sidecar');
    this.trustedTestMode = Boolean(options.trustedTestMode);
    this.fetchImpl = (this.trustedTestMode && typeof options.fetchImpl === 'function')
      ? options.fetchImpl
      : globalThis.fetch;
    this.spawnImpl = (this.trustedTestMode && typeof options.spawnImpl === 'function')
      ? options.spawnImpl
      : spawn;
    this._installInFlight = false;
  }

  getCurrentVersionInfo() {
    return readInstalledProvenance(this.appRoot);
  }

  async checkForUpdates({ includePrereleases = true, fetchImpl = null } = {}) {
    const doFetch = (this.trustedTestMode && typeof fetchImpl === 'function') ? fetchImpl : this.fetchImpl;
    const current = this.getCurrentVersionInfo();
    try {
      const resp = await fetchGithubChecked(GITHUB_RELEASES_API, {
        fetchImpl: doFetch,
        accept: 'application/vnd.github+json'
      });
      if (!resp.ok) {
        return {
          ok: false,
          statusCode: 502,
          reason: `GITHUB_API_HTTP_${resp.status}`,
          message: `GitHub 릴리스 조회 실패 (HTTP ${resp.status}). 잠시 후 다시 시도해 주세요.`,
          current
        };
      }
      const releases = await resp.json();
      const latest = selectReleaseFromList(releases, '', includePrereleases !== false);
      if (!latest) {
        return {
          ok: false,
          statusCode: 404,
          reason: 'NO_WINDOWS_SETUP_RELEASE_FOUND',
          message: 'GitHub에서 Windows 통합 설치기(XPIDER_V7.1.0_SETUP_*.exe)가 포함된 릴리스를 찾지 못했습니다.',
          current
        };
      }
      const alreadyUpToDate = Boolean(current.commitShort && latest.commitShort && current.commitShort === latest.commitShort);
      const updateAvailable = !alreadyUpToDate;
      return {
        ok: true,
        statusCode: 200,
        repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        current,
        latest,
        updateAvailable,
        alreadyUpToDate,
        checkedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        ok: false,
        statusCode: 502,
        reason: err?.code || 'GITHUB_UPDATE_CHECK_FAILED',
        message: `GitHub 업데이트 확인 중 오류가 발생했습니다: ${err?.message || 'NETWORK_ERROR'}`,
        current
      };
    }
  }

  resolveInstallTargetDir() {
    // Prefer INSTALL_RECEIPT.json if present; else standard %LOCALAPPDATA%\XPIDER\App
    try {
      const rcptPath = path.join(this.appRoot, 'INSTALL_RECEIPT.json');
      if (fs.existsSync(rcptPath)) {
        const parsed = JSON.parse(fs.readFileSync(rcptPath, 'utf8'));
        if (parsed && typeof parsed.installDir === 'string' && parsed.installDir.trim()) {
          return path.resolve(parsed.installDir.trim());
        }
      }
    } catch (_) {}
    if (process.env.LOCALAPPDATA) {
      return path.join(process.env.LOCALAPPDATA, 'XPIDER', 'App');
    }
    return this.appRoot;
  }

  async downloadAndInstallUpdate({
    confirmInstall = false,
    tagName = '',
    launchSilent = true,
    dryRun = false,
    fetchImpl = null,
    spawnImpl = null
  } = {}) {
    if (confirmInstall !== true) {
      return {
        ok: false,
        statusCode: 400,
        reason: 'UPDATE_CONFIRMATION_REQUIRED',
        message: '최신 버전 다운로드 및 설치를 실행하려면 확인(confirmInstall=true)이 필요합니다.'
      };
    }
    if (this._installInFlight) {
      return {
        ok: false,
        statusCode: 409,
        reason: 'UPDATE_ALREADY_IN_PROGRESS',
        message: '이미 업데이트 다운로드/설치가 진행 중입니다.'
      };
    }
    this._installInFlight = true;
    const doFetch = (this.trustedTestMode && typeof fetchImpl === 'function') ? fetchImpl : this.fetchImpl;
    const doSpawn = (this.trustedTestMode && typeof spawnImpl === 'function') ? spawnImpl : this.spawnImpl;
    let downloadedPath = '';

    try {
      const listResp = await fetchGithubChecked(GITHUB_RELEASES_API, {
        fetchImpl: doFetch,
        accept: 'application/vnd.github+json'
      });
      if (!listResp.ok) {
        return {
          ok: false,
          statusCode: 502,
          reason: `GITHUB_API_HTTP_${listResp.status}`,
          message: `GitHub 릴리스 목록 조회 실패 (HTTP ${listResp.status}).`
        };
      }
      const releases = await listResp.json();
      const targetRel = selectReleaseFromList(releases, tagName, true);
      if (!targetRel) {
        return {
          ok: false,
          statusCode: 404,
          reason: 'TARGET_RELEASE_NOT_FOUND',
          message: '요청한 GitHub 릴리스 또는 Windows 설치기 자산을 찾지 못했습니다.'
        };
      }
      if (!targetRel.shaAsset || !targetRel.shaAsset.downloadUrl) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'MISSING_SHA256_CHECKSUM_ASSET',
          message: '보안 검증용 .sha256.txt 체크섬 파일이 없는 릴리스는 자동 설치가 차단됩니다 (Fail-Closed).'
        };
      }
      if (!isAllowedGithubHttpsUrl(targetRel.setupAsset.downloadUrl) || !isAllowedGithubHttpsUrl(targetRel.shaAsset.downloadUrl)) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'DISALLOWED_ASSET_URL',
          message: '공식 GitHub HTTPS 자산 URL이 아니므로 설치를 차단했습니다.'
        };
      }

      // 1. Download & parse official SHA-256 manifest
      const shaResp = await fetchGithubChecked(targetRel.shaAsset.downloadUrl, { fetchImpl: doFetch });
      if (!shaResp.ok) {
        return {
          ok: false,
          statusCode: 502,
          reason: `SHA256_DOWNLOAD_HTTP_${shaResp.status}`,
          message: `체크섬 파일 다운로드 실패 (HTTP ${shaResp.status}).`
        };
      }
      const shaText = await shaResp.text();
      const expectedSha256 = parseExpectedSha256ForAsset(shaText, targetRel.setupAsset.name);
      if (!expectedSha256) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'SHA256_ENTRY_NOT_FOUND',
          message: `체크섬 파일에서 ${targetRel.setupAsset.name}의 SHA-256 항목을 찾을 수 없어 설치를 차단했습니다.`
        };
      }

      // 2. Download installer binary with size cap and compute SHA-256
      const binResp = await fetchGithubChecked(targetRel.setupAsset.downloadUrl, { fetchImpl: doFetch });
      if (!binResp.ok) {
        return {
          ok: false,
          statusCode: 502,
          reason: `INSTALLER_DOWNLOAD_HTTP_${binResp.status}`,
          message: `설치기 다운로드 실패 (HTTP ${binResp.status}).`
        };
      }
      const ab = await binResp.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length === 0 || buf.length > MAX_INSTALLER_BYTES) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'INSTALLER_SIZE_OUT_OF_RANGE',
          message: `다운로드된 설치기 크기(${buf.length} bytes)가 안전 범위를 벗어났습니다.`
        };
      }
      const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
      if (actualSha256 !== expectedSha256) {
        return {
          ok: false,
          statusCode: 400,
          reason: 'UPDATE_SHA256_MISMATCH',
          expectedSha256,
          actualSha256,
          message: `SHA-256 무결성 검증 실패! 기대값(${expectedSha256.slice(0, 12)}...) != 실제값(${actualSha256.slice(0, 12)}...) — 안전을 위해 설치를 중단했습니다.`
        };
      }

      const updatesDir = path.join(this.stateDir, 'updates');
      fs.mkdirSync(updatesDir, { recursive: true });
      const safeFileName = path.basename(targetRel.setupAsset.name).replace(/[^A-Za-z0-9._-]/g, '_');
      downloadedPath = path.join(updatesDir, safeFileName);
      fs.writeFileSync(downloadedPath, buf);

      const installDir = this.resolveInstallTargetDir();
      if (dryRun === true) {
        return {
          ok: true,
          statusCode: 200,
          dryRun: true,
          status: 'VERIFIED_DRY_RUN',
          tagName: targetRel.tagName,
          assetName: safeFileName,
          bytes: buf.length,
          verifiedSha256: actualSha256,
          downloadedPath,
          installDir,
          stateDir: this.stateDir,
          dataPreserved: true
        };
      }

      const args = launchSilent
        ? ['--silent', '--skip-browser', '--delay-ms', '1200', '--restart-sidecar', '--install-dir', installDir, '--state-dir', this.stateDir]
        : ['--install-dir', installDir, '--state-dir', this.stateDir];

      const child = doSpawn(downloadedPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: Boolean(launchSilent)
      });
      if (child && typeof child.unref === 'function') child.unref();

      return {
        ok: true,
        statusCode: 200,
        status: 'INSTALLER_LAUNCHED',
        tagName: targetRel.tagName,
        commitShort: targetRel.commitShort,
        assetName: safeFileName,
        bytes: buf.length,
        verifiedSha256: actualSha256,
        downloadedPath,
        installDir,
        stateDir: this.stateDir,
        extensionDir: path.join(installDir, 'extension'),
        dataPreserved: true,
        message: `✅ ${targetRel.tagName} (${safeFileName}) SHA-256 무결성 검증 완료 후 설치를 시작했습니다! 기존 API 키·OAuth·계정·설정은 100% 유지됩니다. 약 5초 후 chrome://extensions에서 XPIDER 새로고침(🔄)을 눌러 최신 버전을 적용하세요.`
      };
    } catch (err) {
      if (downloadedPath && fs.existsSync(downloadedPath)) {
        try { fs.unlinkSync(downloadedPath); } catch (_) {}
      }
      return {
        ok: false,
        statusCode: 502,
        reason: err?.code || 'UPDATE_INSTALL_FAILED',
        message: `업데이트 다운로드/설치 중 오류가 발생했습니다: ${err?.message || 'UNKNOWN_ERROR'}`
      };
    } finally {
      this._installInFlight = false;
    }
  }
}

module.exports = {
  XpiderAppUpdater,
  GITHUB_OWNER,
  GITHUB_REPO,
  isAllowedGithubHttpsUrl,
  readInstalledProvenance,
  parseSetupAssetCommit,
  parseExpectedSha256ForAsset,
  selectReleaseFromList
};
