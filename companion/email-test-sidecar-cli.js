'use strict';
const http = require('node:http');
const fs = require('node:fs');
const { EmailTestSidecar, DEFAULT_SIDECAR_PORT, SIDECAR_BUILD_ID, SIDECAR_API_CAPABILITIES, parseSidecarPort } = require('./email-test-sidecar');
const { getSidecarPaths } = require('./sidecar-paths');
const { verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const { registerNativeMessagingHost } = require('./email-test-sidecar-register-host');

function getJson(port, urlPath, headers = {}) {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: urlPath, headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ alive: true, status: res.statusCode, json: JSON.parse(body) }); }
        catch (_) { resolve({ alive: true, status: res.statusCode, json: null }); }
      });
    });
    req.setTimeout(1500, () => { req.destroy(); resolve({ alive: false }); });
    req.on('error', () => resolve({ alive: false }));
    req.end();
  });
}

(async () => {
  const port = parseSidecarPort(process.env.XPIDER_EMAIL_SIDECAR_PORT, DEFAULT_SIDECAR_PORT);
  const paths = getSidecarPaths();
  let nhRegistered = false;
  let nhRegError = null;
  if (!process.env.XPIDER_SKIP_NATIVE_HOST_REG) {
    try {
      const regRes = registerNativeMessagingHost();
      nhRegistered = Boolean(regRes && regRes.registered);
      if (!nhRegistered) nhRegError = (regRes && regRes.reason) || 'REGISTRATION_RETURNED_FALSE';
    } catch (regErr) {
      nhRegError = regErr && regErr.message ? regErr.message : String(regErr);
    }
    if (!nhRegistered) {
      console.warn(`[PAIRING_REGISTRATION_FAILED] Native Messaging host registration failed: ${nhRegError}.`);
      console.warn('  Sidecar on 127.0.0.1 remains safe, but Email Studio auto-pairing may require "📁 토큰 파일로 연결".');
    }
  }
  const existing = await getJson(port, '/health');
  if (existing.alive) {
    const j = existing.json || {};
    const caps = Array.isArray(j.apiCapabilities) ? j.apiCapabilities : [];
    const hasAllCaps = SIDECAR_API_CAPABILITIES.every(c => caps.includes(c));
    if (j.companionBuildId !== SIDECAR_BUILD_ID || !hasAllCaps) {
      console.error(`[BUILD_MISMATCH] Service on port ${port} (${j.companionBuildId || 'unknown'}) does not match required build ${SIDECAR_BUILD_ID}.`);
      console.error('  Stop the outdated service on this port and re-run START_EMAIL_TEST_SIDECAR.bat.');
      process.exit(2);
    }

    if (process.env.XPIDER_EMAIL_SIDECAR_TOKEN && process.env.XPIDER_EMAIL_SIDECAR_TOKEN.trim()) {
      console.error('[UNSAFE_ENV_TOKEN_REJECTED] XPIDER_EMAIL_SIDECAR_TOKEN env override is forbidden in packaged/owner mode.');
      process.exit(4);
    }
    if (!fs.existsSync(paths.tokenFile)) {
      console.error(`[AUTH_FAILED] Running sidecar matches build, but token file is missing at ${paths.tokenFile}.`);
      process.exit(4);
    }
    if (process.platform === 'win32' && process.env.USERNAME) {
      try {
        verifyWindowsDacl(paths.tokenFile, process.env.USERNAME);
      } catch (aclErr) {
        console.error(`[TOKEN_ACL_INVALID] Token file ACL invalid at ${paths.tokenFile}: ${aclErr.message}`);
        process.exit(4);
      }
    }
    const tok = fs.readFileSync(paths.tokenFile, 'utf8').trim();
    if (!tok) {
      console.error(`[AUTH_FAILED] Running sidecar matches build, but token file is empty at ${paths.tokenFile}.`);
      process.exit(4);
    }
    const st = await getJson(port, '/email/test-send/status', { Authorization: `Bearer ${tok}` });
    if (!st.alive || st.status !== 200 || !st.json) {
      console.error(`[AUTH_FAILED] Running sidecar rejected Bearer token from ${paths.tokenFile} (HTTP ${st.status || 'ERR'}).`);
      console.error('  Run STOP_EMAIL_TEST_SIDECAR.bat then START_EMAIL_TEST_SIDECAR.bat to re-sync token provenance.');
      process.exit(4);
    }
    const stCaps = Array.isArray(st.json.apiCapabilities) ? st.json.apiCapabilities : [];
    const stHasAllCaps = SIDECAR_API_CAPABILITIES.every(c => stCaps.includes(c));
    if (st.json.companionBuildId !== SIDECAR_BUILD_ID || !stHasAllCaps) {
      console.error(`[BUILD_MISMATCH] Authenticated status on port ${port} (${st.json.companionBuildId || 'unknown'}) does not match required build ${SIDECAR_BUILD_ID}.`);
      process.exit(2);
    }
    if (st.json.resendApiKeyConfigured === false) {
      console.error(`[ALREADY_RUNNING_KEY_MISSING] Sidecar PID ${j.pid} is running on 127.0.0.1:${port} WITHOUT a valid RESEND_API_KEY (status: ${st.json.keyStatus || 'KEY_MISSING'}).`);
      console.error('  1) Run STOP_EMAIL_TEST_SIDECAR.bat');
      console.error('  2) Run SET_RESEND_API_KEY.bat');
      console.error('  3) Run START_EMAIL_TEST_SIDECAR.bat');
      process.exit(3);
    }
    console.log(`[OK] XPIDER Email Test Sidecar is ALREADY running on http://127.0.0.1:${port}`);
    console.log(`     PID: ${j.pid} | Build: ${j.companionBuildId} | KeyStatus: ${st.json.keyStatus} | PairingHost: ${nhRegistered ? 'REGISTERED' : (nhRegError ? `PAIRING_REGISTRATION_FAILED(${nhRegError})` : 'SKIPPED')}`);
    process.exit(0);
  }

  const sidecar = new EmailTestSidecar({ port });
  await sidecar.start();
  const hasKey = Boolean(sidecar.resolveResendApiKey());
  console.log('========================================================================');
  console.log(`  XPIDER Email Test Sidecar LISTENING on http://127.0.0.1:${port}`);
  console.log(`  Build:     ${SIDECAR_BUILD_ID}`);
  console.log(`  PID:       ${process.pid}`);
  console.log(`  State Dir: ${sidecar.stateDir} (NTFS User Protected)`);
  console.log(`  Pairing:   ${nhRegistered ? 'REGISTERED (com.xpider.email_sidecar)' : (nhRegError ? `PAIRING_REGISTRATION_FAILED (${nhRegError})` : 'SKIPPED')}`);
  console.log(`  Legacy 18989 / Proxy 18988: UNTOUCHED`);
  console.log('========================================================================');
  console.log('');
  console.log(`  RESEND_API_KEY status     : ${sidecar.keyStatus} (${hasKey ? 'format valid (unverified until simulator test send)' : 'run SET_RESEND_API_KEY.bat + STOP + START'})`);
  console.log(`  Sidecar Bearer Token File : ${sidecar.tokenFile} (NTFS User Protected — never printed to console)`);
  console.log('');
  console.log('  [안내] Email Studio에서 "🔗 원클릭 자동 페어링" 또는 "📁 토큰 파일로 연결"을 사용하세요 (콘솔 복사 불필요).');
  console.log('  [주의] STOP_EMAIL_TEST_SIDECAR.bat 실행 시 이 사이드카만 안전하게 종료됩니다.');

  const shutdown = async () => {
    await sidecar.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch(err => {
  console.error('[ERROR] Failed to start Email Test Sidecar:', err.message);
  process.exit(1);
});
