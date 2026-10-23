'use strict';
/**
 * test/test_residential_proxy_relay_endpoints.js
 * Verifies that companion/privacy-relay-service exposes and validates
 * the /residential-proxy/status and /residential-proxy/probe endpoints.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-res-test-'));
const tokenFile = path.join(tmpDir, '.control_token');
fs.writeFileSync(tokenFile, 'test-res-token-12345678901234567890');

const cfgFile = path.join(tmpDir, 'egress_pool_config.json');
fs.writeFileSync(cfgFile, JSON.stringify({
  version: '1.0.3',
  nodes: [],
  physicalGate: { enabled: false }
}));

const svc = new PrivacyRelayService({
  companionDir: tmpDir,
  controlPort: 29989,
  proxyPort: 29988,
  configFile: cfgFile,
  tokenFile: tokenFile,
  watchdogEnabled: false,
  startWatchdogProcess: false
});

function req(method, path, body, headers = {}) {
  return new Promise((res, rej) => {
    const payload = body ? JSON.stringify(body) : null;
    const h = Object.assign({
      Authorization: 'Bearer test-res-token-12345678901234567890',
      'Content-Type': 'application/json'
    }, headers);
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const r = http.request({ host: '127.0.0.1', port: 29989, method, path, headers: h }, x => {
      let d = '';
      x.on('data', c => d += c);
      x.on('end', () => res({ status: x.statusCode, json: JSON.parse(d || '{}') }));
    });
    r.on('error', rej);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  await svc.start();
  try {
    // 1. Unauthenticated request to /residential-proxy/status => 401
    const unauth = await req('GET', '/residential-proxy/status', null, { Authorization: '' });
    assert.strictEqual(unauth.status, 401, 'unauthorized must return 401');

    // 2. Authenticated request to /residential-proxy/status => UNCONFIGURED, sendAllowed: false
    const st = await req('GET', '/residential-proxy/status');
    assert.strictEqual(st.status, 200);
    assert.strictEqual(st.json.success, true);
    assert.strictEqual(st.json.residentialProxy.status, 'UNCONFIGURED');
    assert.strictEqual(st.json.residentialProxy.sendAllowed, false);
    assert.strictEqual(st.json.residentialProxy.residentialVerified, false);

    // 3. /status also includes residentialProxy
    const fullSt = await req('GET', '/status');
    assert.strictEqual(fullSt.status, 200);
    assert.strictEqual(fullSt.json.residentialProxy.status, 'UNCONFIGURED');
    assert.strictEqual(fullSt.json.residentialProxy.sendAllowed, false);

    // 4. POST /residential-proxy/probe without config => 400 UNCONFIGURED
    const probeUncfg = await req('POST', '/residential-proxy/probe', {});
    assert.strictEqual(probeUncfg.status, 400);
    assert.strictEqual(probeUncfg.json.reason, 'UNCONFIGURED');

    // 5. POST /residential-proxy/probe with invalid config => fail-closed
    const probeBad = await req('POST', '/residential-proxy/probe', {
      config: { host: 'invalid', port: 99999, type: 'BAD_TYPE' }
    });
    assert.strictEqual(probeBad.status, 200);
    assert.strictEqual(probeBad.json.result.status, 'UNCONFIGURED');
    assert.strictEqual(probeBad.json.result.sendAllowed, false);

    console.log('PASS: /residential-proxy endpoints verified in privacy-relay-service');
  } finally {
    await svc.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(0);
  }
})().catch(e => {
  console.error('FAIL:', e);
  process.exit(1);
});
