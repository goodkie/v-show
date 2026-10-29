/**
 * RC3.60 .89 — Decodo LED truthfulness (offline; no network, no Decodo, no campaign sends).
 * Verifies: NOT_SELECTED honesty, fresh CONNECTED, STALE downgrade, IN_USE only from
 * campaign-class CONNECT (never canary/probe tunnels), 407 fail-closed, route label gating.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_led_'));
const cfgFile = path.join(tmpDir, 'egress_pool_config.json');
fs.writeFileSync(cfgFile, JSON.stringify({
  version: '1.0.3', rotationMode: 'HEALTH_FAILOVER', healthTtlMs: 60000, selectedEgressId: 'n1',
  nodes: [{ id: 'n1', type: 'HTTP_PROXY', host: '203.0.113.9', port: 8443, expectedEgressIp: '203.0.113.9', active: true, lastHealth: 'HEALTHY', lastVerifiedAt: Date.now() }],
  physicalGate: { enabled: false }
}));
const svc = new PrivacyRelayService({
  companionDir: tmpDir, controlPort: 29979, proxyPort: 29978, configFile: cfgFile,
  tokenFile: path.join(tmpDir, '.t'), enableContinuousHealthMonitor: false, watchdogEnabled: false, startWatchdogProcess: false
});
svc.relayReady = true;
const dec = () => svc.getStatus().egressIpMonitor;
const verified = (ageMs) => ({ status: 'EGRESS_VERIFIED', detail: 'OK', sendAllowed: true, observedIp: '198.51.100.7', observedIpMasked: '198.51.*.*', checkedAt: new Date(Date.now() - ageMs).toISOString() });
let n = 0; const ok = (m) => console.log('  PASS ' + (++n) + ': ' + m);

svc.residentialProxySelected = false; svc.residentialProxyState = null;
assert.strictEqual(dec().decodoResidential.status, 'NOT_SELECTED'); ok('unselected -> NOT_SELECTED, never green');

svc.residentialProxySelected = true; svc.residentialProxyConfig = { id: 'x', host: 'h', port: 1, type: 'HTTP_PROXY' };
svc.residentialProxyState = verified(5000); svc.lastCampaignConnectAt = 0;
let m = dec(); assert.strictEqual(m.decodoResidential.status, 'CONNECTED / EGRESS_VERIFIED'); assert.strictEqual(m.decodoResidential.fresh, true);
assert.notStrictEqual(m.decodoResidential.inUse, true); ok('fresh verified, no campaign traffic -> CONNECTED (not IN_USE)');

svc.trafficStats.connectTunnels = 5; svc.trafficStats.requestsProxied = 5; // probe-only traffic
assert.strictEqual(dec().decodoResidential.status, 'CONNECTED / EGRESS_VERIFIED'); ok('probe/canary tunnel counters alone never produce IN_USE');

svc.lastCampaignConnectAt = Date.now();
m = dec(); assert.strictEqual(m.decodoResidential.status, 'IN_USE'); assert.strictEqual(m.decodoResidential.inUse, true); ok('recent campaign-class CONNECT -> IN_USE');

svc.lastCampaignConnectAt = Date.now() - 120000;
assert.strictEqual(dec().decodoResidential.status, 'CONNECTED / EGRESS_VERIFIED'); ok('campaign traffic older than window -> back to CONNECTED');

svc.residentialProxyState = verified(300000);
m = dec(); assert.strictEqual(m.decodoResidential.status, 'STALE_REVERIFY_REQUIRED'); assert.strictEqual(m.decodoResidential.confidence, 'NONE');
assert.notStrictEqual(m.activeRoute.route, 'DECODO'); assert.ok(!/DECODO/.test(m.activeRoute.route)); ok('stale proof -> STALE_REVERIFY_REQUIRED, confidence NONE, route not claimed as DECODO');

svc.residentialProxyState = verified(1000);
m = dec(); assert.ok(/DECODO/.test(m.activeRoute.route)); ok('fresh proof -> route includes DECODO');

svc.residentialProxyState = { status: 'AUTH_FAILED', detail: '407', sendAllowed: false, upstreamError: 'HTTP 407 traffic limit reached', checkedAt: new Date().toISOString() };
m = dec(); assert.strictEqual(m.decodoResidential.status, 'BLOCKED_HTTP_407'); assert.ok(!/DECODO/.test(m.activeRoute.route)); ok('quota 407 -> BLOCKED_HTTP_407, no DECODO route (fail-closed)');

svc.residentialProxyState = { status: 'PROXY_UNREACHABLE', detail: 'ECONNREFUSED', sendAllowed: false, checkedAt: new Date().toISOString() };
m = dec(); assert.strictEqual(m.decodoResidential.status, 'PROXY_UNREACHABLE'); ok('provider unavailable -> PROXY_UNREACHABLE (not green)');

assert.strictEqual(dec().rawIspWan.status, 'UNKNOWN / NOT SAFELY MEASURED'); ok('raw ISP WAN stays UNKNOWN (no direct probe)');
console.log(`\nALL ${n} DECODO LED TRUTHFULNESS CHECKS PASSED`);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);

