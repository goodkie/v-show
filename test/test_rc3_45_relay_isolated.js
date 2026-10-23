'use strict';
/**
 * RC3.45 isolated relay control-plane test (replaces hanging companion/test_privacy_relay.js usage).
 * - Temp companion dir + alternate ports => never touches the live relay (18989/18988) or live config/token.
 * - Hard watchdog (30s) => repeatable PASS/FAIL, never hangs.
 * - Uses a dead fake node (127.0.0.1:9) => no external egress; verifies fail-closed behaviour.
 * REAL: local HTTP control plane behaviour. SIMULATED: egress node.
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
const WATCHDOG_MS = 30000;
const wd = setTimeout(() => { console.error('FAIL: watchdog timeout (hang)'); process.exit(2); }, WATCHDOG_MS);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-relay-iso-'));
  const configFile = path.join(dir, 'egress_pool_config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    version: '1.0.3', rotationMode: 'FIXED', healthCheckTimeoutMs: 1500, healthTtlMs: 60000,
    selectedEgressId: 'iso-node', nodes: [{ id: 'iso-node', type: 'HTTPS_PROXY', host: '127.0.0.1', port: 9, username: 'u', password: 'p', privateOnly: true, active: true, lastHealth: 'UNKNOWN' }]
  }));
  const CP = 28989, PP = 28988, TOKEN = 'iso_' + 'a'.repeat(60);
  const { PrivacyRelayService } = require('../companion/privacy-relay-service');
  const svc = new PrivacyRelayService({ companionDir: dir, configFile, tokenFile: path.join(dir, '.control_token'), controlToken: TOKEN, controlPort: CP, proxyPort: PP, enableContinuousHealthMonitor: false, allowedExtensionId: 'abcdefghijklmnopabcdefghijklmnop' });
  const req = (method, p, auth = true) => new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: CP, path: p, method, headers: auth ? { Authorization: 'Bearer ' + TOKEN } : {}, timeout: 5000 }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} res({ status: x.statusCode, json: j }); }); });
    r.on('error', rej); r.on('timeout', () => r.destroy(new Error('timeout'))); r.end();
  });
  let passed = 0; const t = async (n, f) => { await f(); passed++; console.log('PASS', n); };
  try {
    await svc.start();
    await t('health is public and reports control port', async () => { const r = await req('GET', '/health', false); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.controlPort, CP); });
    await t('dead egress node => relay NOT ready (fail-closed)', async () => { const r = await req('GET', '/health', false); assert.strictEqual(r.json.relayReady, false); });
    await t('control endpoints reject missing token with 401', async () => { assert.strictEqual((await req('GET', '/status', false)).status, 401); assert.strictEqual((await req('GET', '/firewall-guardian/status', false)).status, 401); });
    await t('authenticated /status works and leaks no password', async () => { const r = await req('GET', '/status'); assert.strictEqual(r.status, 200); assert(!JSON.stringify(r.json).includes('"password":"p"')); });
    await t('guardian status endpoint: NO_TOKEN in isolated dir, no secrets', async () => { const r = await req('GET', '/firewall-guardian/status'); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.guardian.hasToken, false); assert.strictEqual(r.json.guardian.status, 'NO_TOKEN'); });
    await t('guardian reconcile without PAT => 409 NO_TOKEN, no provider call', async () => { const r = await req('POST', '/firewall-guardian/reconcile'); assert.strictEqual(r.status, 409); assert.strictEqual(r.json.status, 'NO_TOKEN'); });
    await t('pause then resume toggles state', async () => { assert.strictEqual((await req('POST', '/pause')).json.paused, true); assert.strictEqual((await req('POST', '/resume')).json.paused, false); });
    await t('proxy refuses traffic while egress unverified (no direct leak)', async () => {
      const r = await new Promise(res => { const q = http.request({ host: '127.0.0.1', port: PP, path: 'http://example.com/', method: 'GET', headers: { Host: 'example.com' }, timeout: 4000 }, x => { x.resume(); res(x.statusCode); }); q.on('error', () => res('CONN_ERR')); q.on('timeout', () => { q.destroy(); res('TIMEOUT'); }); q.end(); });
      assert(r !== 200, 'proxy must not return 200 for unverified egress, got ' + r);
    });
    console.log(`\nALL ${passed} ISOLATED RELAY TESTS PASSED (control plane REAL, egress node SIMULATED)`);
  } finally { try { await svc.stop(); } catch (_) {} }
})().then(() => { clearTimeout(wd); setTimeout(() => process.exit(0), 100); }).catch(e => { console.error('FAIL', e && e.stack || e); clearTimeout(wd); setTimeout(() => process.exit(1), 100); });
