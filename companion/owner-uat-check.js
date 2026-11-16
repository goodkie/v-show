'use strict';
/**
 * Non-destructive One-Click Owner UAT Health & Provenance Check
 * - Verifies sidecar on 127.0.0.1:18990 (/health + authenticated /email/test-send/status + /email/test-send/ledger)
 * - Verifies Windows NTFS DACL on local token file & key file (if present)
 * - Explicitly notes FORMAT_VALID_KEY_PRESENT != Resend provider authentication
 * - Zero outbound Resend POSTs, zero mutations, zero secret echoes
 */
const http = require('node:http');
const fs = require('node:fs');
const { DEFAULT_SIDECAR_PORT, SIDECAR_BUILD_ID, SIDECAR_API_CAPABILITIES, parseSidecarPort } = require('./email-test-sidecar');
const { getSidecarPaths } = require('./sidecar-paths');
const { verifyWindowsDacl } = require('./email-test-sidecar-set-key');

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

  console.log('========================================================================');
  console.log('  XPIDER Email Test Sidecar — One-Click Non-Destructive UAT Check');
  console.log('========================================================================');
  console.log(`  Expected Build : ${SIDECAR_BUILD_ID}`);
  console.log(`  State Dir      : ${paths.stateDir}`);

  const health = await getJson(port, '/health');
  if (!health.alive || health.status !== 200 || !health.json) {
    console.error(`[FAIL] Sidecar not reachable on 127.0.0.1:${port}. Run START_EMAIL_TEST_SIDECAR.bat first.`);
    process.exit(1);
  }
  const h = health.json;
  const hCaps = Array.isArray(h.apiCapabilities) ? h.apiCapabilities : [];
  if (h.companionBuildId !== SIDECAR_BUILD_ID || !SIDECAR_API_CAPABILITIES.every(c => hCaps.includes(c))) {
    console.error(`[FAIL] /health build/capabilities mismatch: ${h.companionBuildId}`);
    process.exit(2);
  }
  console.log(`  [PASS] /health: PID=${h.pid} Build=${h.companionBuildId}`);

  if (!fs.existsSync(paths.tokenFile)) {
    console.error(`[FAIL] Token file missing at ${paths.tokenFile}`);
    process.exit(4);
  }
  if (process.platform === 'win32' && process.env.USERNAME) {
    verifyWindowsDacl(paths.tokenFile, process.env.USERNAME);
    console.log(`  [PASS] Token NTFS DACL verified: ${paths.tokenFile}`);
    if (fs.existsSync(paths.keyFile)) {
      verifyWindowsDacl(paths.keyFile, process.env.USERNAME);
      console.log(`  [PASS] Key NTFS DACL verified: ${paths.keyFile}`);
    } else {
      console.log(`  [INFO] Key file not yet created (run SET_RESEND_API_KEY.bat when ready)`);
    }
  }

  const tok = fs.readFileSync(paths.tokenFile, 'utf8').trim();
  const st = await getJson(port, '/email/test-send/status', { Authorization: `Bearer ${tok}` });
  if (!st.alive || st.status !== 200 || !st.json) {
    console.error(`[FAIL] Authenticated /email/test-send/status failed (HTTP ${st.status || 'ERR'})`);
    process.exit(4);
  }
  const sCaps = Array.isArray(st.json.apiCapabilities) ? st.json.apiCapabilities : [];
  if (st.json.companionBuildId !== SIDECAR_BUILD_ID || !SIDECAR_API_CAPABILITIES.every(c => sCaps.includes(c))) {
    console.error(`[FAIL] Authenticated /status build/capabilities mismatch: ${st.json.companionBuildId}`);
    process.exit(2);
  }
  console.log(`  [PASS] Authenticated /email/test-send/status: keyStatus=${st.json.keyStatus} (note: local format check != Resend provider auth)`);

  const ledger = await getJson(port, '/email/test-send/ledger', { Authorization: `Bearer ${tok}` });
  if (!ledger.alive || ledger.status !== 200 || !ledger.json || !Array.isArray(ledger.json.entries)) {
    console.error(`[FAIL] Authenticated /email/test-send/ledger failed (HTTP ${ledger.status || 'ERR'})`);
    process.exit(5);
  }
  console.log(`  [PASS] Authenticated /email/test-send/ledger: entries=${ledger.json.entries.length}`);
  console.log('========================================================================');
  console.log('  [PASS] Owner Sidecar UAT Check Complete (0 outbound POSTs, 0 mutations)');
  console.log('========================================================================');
  process.exit(0);
})().catch(err => {
  console.error(`[FAIL] ${err.message}`);
  process.exit(1);
});
