'use strict';
// Local-fixture tests for companion/residential-proxy-adapter.js (no real provider, no network egress).
const net = require('net');
const assert = require('assert');
const { STATUS, probe, validateConfig, maskIp } = require('../companion/residential-proxy-adapter');

function startFixtureProxy({ user, pass }) {
  const srv = net.createServer((c) => {
    let b = '';
    c.on('data', (d) => {
      b += d.toString();
      if (!b.includes('\r\n\r\n')) return;
      const m = /Proxy-Authorization: Basic (\S+)/.exec(b);
      const ok = m && Buffer.from(m[1], 'base64').toString() === `${user}:${pass}`;
      c.write(ok ? 'HTTP/1.1 200 Connection established\r\n\r\n' : 'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      if (!ok) c.end();
    });
    c.on('error', () => {});
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

(async () => {
  const results = [];
  const t = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message]); } };
  const srv = await startFixtureProxy({ user: 'u', pass: 'p' });
  const port = srv.address().port;
  const cfg = { host: '127.0.0.1', port, type: 'HTTP_PROXY', username: 'u' };

  await t('UNCONFIGURED on empty/invalid config, sendAllowed=false', async () => {
    assert.strictEqual((await probe(null)).status, STATUS.UNCONFIGURED);
    const r = await probe({ host: 'bad host', port: 1, type: 'HTTP_PROXY' });
    assert.strictEqual(r.status, STATUS.UNCONFIGURED); assert.strictEqual(r.sendAllowed, false);
    assert.strictEqual(validateConfig({ host: 'a.b', port: 1, type: 'SOCKS5' }).ok, false);
  });
  await t('PROXY_UNREACHABLE when nothing listens', async () => {
    const r = await probe({ ...cfg, port: 1 }, { password: 'p', timeoutMs: 1500 });
    assert.strictEqual(r.status, STATUS.PROXY_UNREACHABLE); assert.strictEqual(r.sendAllowed, false);
  });
  await t('AUTH_FAILED on wrong password', async () => {
    const r = await probe(cfg, { password: 'WRONG', observe: async () => '9.9.9.9' });
    assert.strictEqual(r.status, STATUS.AUTH_FAILED); assert.strictEqual(r.sendAllowed, false);
  });
  await t('PROXY_READY (not verified) when IP cannot be observed -> sendAllowed=false', async () => {
    const r = await probe(cfg, { password: 'p', observe: async () => null });
    assert.strictEqual(r.status, STATUS.PROXY_READY); assert.strictEqual(r.sendAllowed, false);
  });
  await t('LEAK_TEST_FAILED when egress equals direct IP', async () => {
    const r = await probe(cfg, { password: 'p', directIp: '5.5.5.5', observe: async () => '5.5.5.5' });
    assert.strictEqual(r.status, STATUS.LEAK_TEST_FAILED); assert.strictEqual(r.sendAllowed, false);
  });
  await t('LEAK_TEST_FAILED when egress is a forbidden (e.g. DO datacenter) IP', async () => {
    const r = await probe(cfg, { password: 'p', forbiddenIps: ['143.198.40.33'], observe: async () => '143.198.40.33' });
    assert.strictEqual(r.status, STATUS.LEAK_TEST_FAILED);
  });
  await t('EGRESS_VERIFIED, IP masked, residentialVerified stays false, no password in output', async () => {
    const r = await probe(cfg, { password: 'p', directIp: '5.5.5.5', observe: async () => '203.0.113.77' });
    assert.strictEqual(r.status, STATUS.EGRESS_VERIFIED); assert.strictEqual(r.sendAllowed, true);
    assert.strictEqual(r.residentialVerified, false);
    assert.strictEqual(r.observedIpMasked, '203.0.*.*');
    assert.ok(!JSON.stringify(r).includes('"p"') && !JSON.stringify(r).includes('203.0.113.77'));
    assert.strictEqual(maskIp('2001:db8::1'), '2001:db8:****');
  });

  srv.close();
  results.forEach(([s, n]) => console.log(`${s}  ${n}`));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} PASS`);
  process.exit(fails ? 1 : 0);
})();
