'use strict';
const http = require('node:http');
const fs = require('node:fs');
const { DEFAULT_SIDECAR_PORT, parseSidecarPort } = require('./email-test-sidecar');
const { getSidecarPaths } = require('./sidecar-paths');

function getJson(port, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: urlPath, headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch (_) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.setTimeout(2500, () => { req.destroy(new Error('TIMEOUT')); });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const port = parseSidecarPort(process.env.XPIDER_EMAIL_SIDECAR_PORT, DEFAULT_SIDECAR_PORT);
  const paths = getSidecarPaths();
  try {
    const h = await getJson(port, '/health');
    if (h.status !== 200 || !h.json) {
      console.log(`[ERROR] Unexpected /health HTTP ${h.status}`);
      process.exit(1);
    }
    const caps = Array.isArray(h.json.apiCapabilities) ? h.json.apiCapabilities : [];
    console.log(`[HEALTH] http://127.0.0.1:${port}/health -> HTTP 200`);
    console.log(`  Service: ${h.json.service} | PID: ${h.json.pid} | Build: ${h.json.companionBuildId}`);
    console.log(`  State Dir: ${paths.stateDir}`);
    if (!caps.includes('email-test-send')) {
      console.log('[MISMATCH] Service on this port does NOT support email-test-send (COMPANION_VERSION_MISMATCH).');
      process.exit(2);
    }

    const token = process.env.XPIDER_EMAIL_SIDECAR_TOKEN || (fs.existsSync(paths.tokenFile) ? fs.readFileSync(paths.tokenFile, 'utf8').trim() : '');
    if (!token) {
      console.log(`[WARN] Token file not found at ${paths.tokenFile} to probe /email/test-send/status.`);
      process.exit(0);
    }
    const st = await getJson(port, '/email/test-send/status', { Authorization: `Bearer ${token}` });
    console.log(`[STATUS] GET /email/test-send/status -> HTTP ${st.status}`);
    console.log(JSON.stringify(st.json || st.raw, null, 2));
  } catch (err) {
    console.log(`[OFFLINE] Email Test Sidecar not reachable on 127.0.0.1:${port}: ${err.message}`);
    process.exit(1);
  }
})();
