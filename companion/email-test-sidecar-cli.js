'use strict';
const http = require('node:http');
const fs = require('node:fs');
const { EmailTestSidecar, DEFAULT_SIDECAR_PORT, SIDECAR_BUILD_ID, SIDECAR_API_CAPABILITIES, parseSidecarPort } = require('./email-test-sidecar');
const { getSidecarPaths } = require('./sidecar-paths');

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

    const tok = process.env.XPIDER_EMAIL_SIDECAR_TOKEN || (fs.existsSync(paths.tokenFile) ? fs.readFileSync(paths.tokenFile, 'utf8').trim() : '');
    if (!tok) {
      console.error(`[AUTH_FAILED] Running sidecar matches build, but token file is missing at ${paths.tokenFile}.`);
      process.exit(4);
    }
    const st = await getJson(port, '/email/test-send/status', { Authorization: `Bearer ${tok}` });
    if (!st.alive || st.status !== 200 || !st.json) {
      console.error(`[AUTH_FAILED] Running sidecar rejected Bearer token from ${paths.tokenFile} (HTTP ${st.status || 'ERR'}).`);
      console.error('  Run STOP_EMAIL_TEST_SIDECAR.bat then START_EMAIL_TEST_SIDECAR.bat to re-sync token provenance.');
      process.exit(4);
    }
    if (st.json.resendApiKeyConfigured === false) {
      console.error(`[ALREADY_RUNNING_KEY_MISSING] Sidecar PID ${j.pid} is running on 127.0.0.1:${port} WITHOUT a valid RESEND_API_KEY (status: ${st.json.keyStatus || 'KEY_MISSING'}).`);
      console.error('  1) Run STOP_EMAIL_TEST_SIDECAR.bat');
      console.error('  2) Run SET_RESEND_API_KEY.bat');
      console.error('  3) Run START_EMAIL_TEST_SIDECAR.bat');
      process.exit(3);
    }
    console.log(`[OK] XPIDER Email Test Sidecar is ALREADY running on http://127.0.0.1:${port}`);
    console.log(`     PID: ${j.pid} | Build: ${j.companionBuildId} | KeyStatus: ${st.json.keyStatus}`);
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
  console.log(`  Legacy 18989 / Proxy 18988: UNTOUCHED`);
  console.log('========================================================================');
  console.log('');
  console.log(`  RESEND_API_KEY status     : ${sidecar.keyStatus} (${hasKey ? 'format valid, server-side protected' : 'run SET_RESEND_API_KEY.bat + STOP + START'})`);
  console.log(`  Sidecar Bearer Token File : ${sidecar.tokenFile}`);
  console.log(`  Sidecar Bearer Token      : ${sidecar.token}`);
  console.log('');
  console.log('  [안내] 위 Sidecar Bearer Token을 Email Studio의 "Sidecar 제어 토큰" 입력란에 붙여넣으세요.');
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
