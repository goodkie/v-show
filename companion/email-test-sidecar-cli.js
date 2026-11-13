'use strict';
const http = require('node:http');
const { EmailTestSidecar, DEFAULT_SIDECAR_PORT, SIDECAR_BUILD_ID, parseSidecarPort } = require('./email-test-sidecar');

function probeHealth(port) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/health`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ alive: true, status: res.statusCode, json: JSON.parse(body) }); }
        catch (_) { resolve({ alive: true, status: res.statusCode, json: null }); }
      });
    });
    req.setTimeout(1500, () => { req.destroy(); resolve({ alive: false }); });
    req.on('error', () => resolve({ alive: false }));
  });
}

(async () => {
  const port = parseSidecarPort(process.env.XPIDER_EMAIL_SIDECAR_PORT, DEFAULT_SIDECAR_PORT);
  const existing = await probeHealth(port);
  if (existing.alive && existing.json) {
    const caps = Array.isArray(existing.json.apiCapabilities) ? existing.json.apiCapabilities : [];
    if (caps.includes('email-test-sidecar-v1')) {
      console.log(`[OK] XPIDER Email Test Sidecar is ALREADY running on http://127.0.0.1:${port}`);
      console.log(`     PID: ${existing.json.pid} | Build: ${existing.json.companionBuildId}`);
      process.exit(0);
    }
    console.error(`[BLOCKED] Port ${port} is occupied by another service (${existing.json.companionBuildId || 'unknown'}).`);
    console.error(`          Set XPIDER_EMAIL_SIDECAR_PORT to another loopback port (e.g. 18991).`);
    process.exit(2);
  }

  const sidecar = new EmailTestSidecar({ port });
  await sidecar.start();
  const hasKey = Boolean(sidecar.resolveResendApiKey());
  console.log('========================================================================');
  console.log(`  XPIDER Email Test Sidecar LISTENING on http://127.0.0.1:${port}`);
  console.log(`  Build: ${SIDECAR_BUILD_ID}`);
  console.log(`  Mode:  TEST_ONLY_SIDECAR (Production STRICT HOLD)`);
  console.log(`  Legacy 18989 / Proxy 18988: UNTOUCHED`);
  console.log('========================================================================');
  console.log('');
  console.log(`  RESEND_API_KEY configured : ${hasKey ? 'YES (server-side env)' : 'NO (will fail-closed with RESEND_API_KEY_NOT_CONFIGURED)'}`);
  console.log(`  Sidecar Bearer Token File : ${sidecar.tokenFile}`);
  console.log(`  Sidecar Bearer Token      : ${sidecar.token}`);
  console.log('');
  console.log('  [안내] 위 Sidecar Bearer Token을 Email Studio의 "Sidecar 제어 토큰" 입력란에 붙여넣으세요.');
  console.log('  [주의] 이 창을 닫거나 STOP_EMAIL_TEST_SIDECAR.bat를 실행하면 사이드카만 안전하게 종료됩니다.');

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
