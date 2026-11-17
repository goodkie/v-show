'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { EmailImageHostManager, detectImageSignature } = require('../companion/email-image-host');

function makePng(width, height) {
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  const idat = zlib.deflateSync(raw, { level: 1 });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_img_host_test_'));
  let pass = 0;
  async function run(name, fn) {
    await fn();
    pass++;
    console.log('PASS ' + name);
  }

  try {
    const pngBuf = makePng(120, 80);
    const pngB64 = pngBuf.toString('base64');

    await run('NO_CONFIG_RETURNS_CONFIG_REQUIRED_AND_CONSENT_GATE', async () => {
      const mgr = new EmailImageHostManager({ stateDir: path.join(tmpDir, 's1'), trustedTestMode: true });
      assert.equal(mgr.getStatus().status, 'CONFIG_REQUIRED');

      const noConsent = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: false });
      assert.equal(noConsent.ok, false);
      assert.equal(noConsent.reason, 'PUBLIC_UPLOAD_CONSENT_REQUIRED');

      const noCfg = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(noCfg.ok, false);
      assert.equal(noCfg.status, 'CONFIG_REQUIRED');
    });

    await run('MALICIOUS_SVG_SCRIPT_AND_OVERSIZED_FILE_REJECTED', async () => {
      const mgr = new EmailImageHostManager({ stateDir: path.join(tmpDir, 's2'), trustedTestMode: true });
      mgr.saveConfig({ provider: 'CUSTOM_HTTPS_PUT', uploadEndpoint: 'https://up.example.test', publicBaseUrl: 'https://cdn.example.test', token: 'tok_1234567890', userConsentConfirmed: true });

      const svgB64 = Buffer.from('<svg onload="alert(1)"><script>alert(1)</script></svg>').toString('base64');
      const badSvg = await mgr.uploadAndVerify({ base64Data: svgB64, publicUploadConsentConfirmed: true });
      assert.equal(badSvg.ok, false);
      assert.equal(badSvg.reason, 'INVALID_IMAGE_SIGNATURE_OR_MIME');

      const bigB64 = Buffer.alloc(3 * 1024 * 1024 + 64, 0x41).toString('base64');
      const tooBig = await mgr.uploadAndVerify({ base64Data: bigB64, publicUploadConsentConfirmed: true });
      assert.equal(tooBig.ok, false);
      assert.equal(tooBig.reason, 'IMAGE_TOO_LARGE');

      const sig = detectImageSignature(pngBuf);
      assert.equal(sig.mimeType, 'image/png');
      assert.equal(sig.width, 120);
      assert.equal(sig.height, 80);
    });

    await run('GITHUB_PRIVATE_REPO_AUTH_FAIL_404_AND_TIMEOUT_FAIL_CLOSED', async () => {
      let mode = 'PRIVATE';
      const mgr = new EmailImageHostManager({
        stateDir: path.join(tmpDir, 's3'),
        trustedTestMode: true,
        httpRequest: async ({ url, method, headers }) => {
          if (url.startsWith('https://api.github.com/repos/') && method === 'GET') {
            if (mode === 'AUTH_401') return { statusCode: 401, headers: {}, bodyBuffer: Buffer.alloc(0), json: { message: 'Bad credentials' }, error: null };
            return { statusCode: 200, headers: {}, bodyBuffer: Buffer.alloc(0), json: { private: mode === 'PRIVATE' }, error: null };
          }
          if (url.includes('/contents/') && method === 'PUT') {
            return { statusCode: 201, headers: {}, bodyBuffer: Buffer.alloc(0), json: { content: { path: 'x' } }, error: null };
          }
          if (url.startsWith('https://raw.githubusercontent.com/')) {
            assert.equal(headers.Authorization, undefined, 'Anonymous public GET must have NO Authorization header');
            if (mode === 'PUBLIC_404') return { statusCode: 404, headers: {}, bodyBuffer: Buffer.from('Not Found'), json: null, error: null };
            if (mode === 'PUBLIC_TIMEOUT') return { statusCode: 0, headers: {}, bodyBuffer: Buffer.alloc(0), json: null, error: 'TIMEOUT' };
            return { statusCode: 200, headers: { 'content-type': 'image/png' }, bodyBuffer: pngBuf, json: null, error: null };
          }
          return { statusCode: 500, headers: {}, bodyBuffer: Buffer.alloc(0), json: null, error: null };
        }
      });
      mgr.saveConfig({ provider: 'GITHUB_PUBLIC_REPO', owner: 'goodkie', repo: 'assets-repo', branch: 'main', token: 'ghp_1234567890abcdef', userConsentConfirmed: true });

      const privRes = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(privRes.ok, false);
      assert.equal(privRes.reason, 'PRIVATE_REPO_NOT_PUBLICLY_REACHABLE');

      mode = 'AUTH_401';
      const authRes = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(authRes.ok, false);
      assert.equal(authRes.reason, 'HOST_AUTH_FAILED');

      mode = 'PUBLIC_404';
      const notFoundRes = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(notFoundRes.ok, false);
      assert.equal(notFoundRes.reason, 'PUBLIC_FETCH_404');

      mode = 'PUBLIC_TIMEOUT';
      const toRes = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(toRes.ok, false);
      assert.equal(toRes.reason, 'PUBLIC_FETCH_TIMEOUT');

      mode = 'PUBLIC_OK';
      const okRes = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(okRes.ok, true);
      assert.equal(okRes.status, 'REMOTE_READY');
      assert.equal(okRes.verifiedAnonymousGet, true);
      assert.ok(okRes.publicUrl.startsWith('https://raw.githubusercontent.com/goodkie/assets-repo/main/images/'));
      assert.equal(okRes.width, 120);

      // Idempotent replay on duplicate upload
      const replayRes = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(replayRes.ok, true);
      assert.equal(replayRes.idempotentReplay, true);
    });

    await run('GITHUB_URL_NORMALIZATION_FIELD_DIAGNOSTICS_AND_EMPTY_REPO_BOOTSTRAP', async () => {
      const s4 = path.join(tmpDir, 's4');
      let putCount = 0;
      const mgr = new EmailImageHostManager({
        stateDir: s4,
        trustedTestMode: true,
        httpRequest: async ({ url, method, body }) => {
          if (method === 'GET' && url.includes('api.github.com/repos/goodkie/xpider-email-images')) {
            return { statusCode: 200, json: { private: false, size: 0, default_branch: 'main' } };
          }
          if (method === 'PUT' && url.includes('/contents/')) {
            putCount++;
            if (putCount === 1 && body && body.branch) {
              return { statusCode: 404, json: { message: 'Branch not found on empty repo' } };
            }
            return { statusCode: 201, json: { commit: { sha: 'abc' }, content: { path: 'images/ok.png' } } };
          }
          if (method === 'GET' && url.startsWith('https://raw.githubusercontent.com/')) {
            return { statusCode: 200, headers: { 'content-type': 'image/png' }, bodyBuffer: pngBuf };
          }
          return { statusCode: 404 };
        }
      });

      // Full GitHub URL + trailing slash pathPrefix normalized cleanly
      const saved = mgr.saveConfig({
        provider: 'GITHUB_PUBLIC_REPO',
        owner: '',
        repo: 'https://github.com/goodkie/xpider-email-images.git',
        branch: 'main',
        pathPrefix: '/images/',
        token: 'ghp_1234567890abcdef',
        userConsentConfirmed: true
      });
      assert.equal(saved.ok, true);
      assert.equal(saved.owner, 'goodkie');
      assert.equal(saved.repo, 'xpider-email-images');
      assert.equal(saved.pathPrefix, 'images');

      // Invalid config preserves previous valid config and returns field-level diagnostics
      const bad = mgr.saveConfig({
        provider: 'GITHUB_PUBLIC_REPO',
        owner: '',
        repo: 'only-repo-without-owner',
        branch: 'main',
        token: 'ghp_1234567890abcdef',
        userConsentConfirmed: true
      });
      assert.equal(bad.ok, false);
      assert.equal(bad.reason, 'INVALID_GITHUB_REPO_CONFIG');
      assert.ok(Array.isArray(bad.invalidFields) && bad.invalidFields.some(f => f.includes('Owner')));
      assert.equal(mgr.getStatus().repo, 'xpider-email-images');

      // Empty repo (size === 0) retries PUT without branch and succeeds
      const up = await mgr.uploadAndVerify({ base64Data: pngB64, publicUploadConsentConfirmed: true });
      assert.equal(up.ok, true);
      assert.equal(up.status, 'REMOTE_READY');
      assert.equal(putCount, 2);
      assert.ok(up.publicUrl.startsWith('https://raw.githubusercontent.com/goodkie/xpider-email-images/main/images/'));
    });

    await run('WEBP_DIMENSION_CHECK_AND_SSRF_PRIVATE_HOST_BLOCKED', async () => {
      // Oversized WebP VP8X (width=9001, height=100) must be rejected!
      const webpHuge = Buffer.alloc(30);
      webpHuge.write('RIFF', 0, 'ascii');
      webpHuge.writeUInt32LE(22, 4);
      webpHuge.write('WEBP', 8, 'ascii');
      webpHuge.write('VP8X', 12, 'ascii');
      const w = 9001 - 1;
      const h = 100 - 1;
      webpHuge[24] = w & 0xff; webpHuge[25] = (w >> 8) & 0xff; webpHuge[26] = (w >> 16) & 0xff;
      webpHuge[27] = h & 0xff; webpHuge[28] = (h >> 8) & 0xff; webpHuge[29] = (h >> 16) & 0xff;
      const sig = detectImageSignature(webpHuge);
      assert.ok(sig && sig.mimeType === 'image/webp' && sig.width === 9001 && sig.height === 100);

      const s5 = path.join(tmpDir, 's5');
      const mgrProd = new EmailImageHostManager({ stateDir: s5, trustedTestMode: false });
      const ssrf1 = mgrProd.saveConfig({
        provider: 'CUSTOM_HTTPS_PUT',
        uploadEndpoint: 'https://127.0.0.1/upload',
        publicBaseUrl: 'https://cdn.example.com/assets',
        token: 'tok_1234567890',
        userConsentConfirmed: true
      });
      assert.equal(ssrf1.ok, false);
      assert.equal(ssrf1.reason, 'SSRF_LOCAL_OR_PRIVATE_HOST_BLOCKED');

      const ssrf2 = await mgrProd.verifyPublicAnonymousGet('https://169.254.169.254/latest/meta-data', 'image/png');
      assert.equal(ssrf2.ok, false);
      assert.equal(ssrf2.reason, 'SSRF_PRIVATE_IP_BLOCKED');
    });

    console.log(`\nALL IMAGE HOST TESTS PASSED (${pass}/${pass})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
