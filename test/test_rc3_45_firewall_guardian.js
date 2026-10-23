'use strict';
// RC3.45 Firewall Guardian — MOCK tests (no real DigitalOcean calls, no credentials).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FirewallGuardian, detectPublicIp, isValidPublicIPv4, buildDesiredInbound } = require('../companion/firewall-guardian');

const fakeCrypto = { encrypt: s => 'enc:' + Buffer.from(s).toString('base64'), decrypt: r => Buffer.from(r.slice(4), 'base64').toString() };
const FW = 'd6fd3a95-d9d9-417d-9d27-c6b57e94240a';
const TOKEN = 'dop_v1_' + 'a'.repeat(64);
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };

function mkProvider(opts = {}) {
  const fw = { name: 'xpider', inbound_rules: [
    { protocol: 'tcp', ports: '8443', sources: { addresses: ['1.2.3.4/32'] } },
    { protocol: 'tcp', ports: '22', sources: { addresses: ['0.0.0.0/0'] } }], outbound_rules: [{ protocol: 'tcp', ports: 'all', destinations: { addresses: ['0.0.0.0/0'] } }], droplet_ids: [1], tags: [] };
  const calls = [];
  let n429 = opts.n429 || 0;
  const request = async (token, method, p, body) => {
    calls.push([method, p]);
    if (opts.status401) return { status: 401, json: {} };
    if (opts.status403) return { status: 403, json: {} };
    if (p === '/account') return { status: 200, json: {} };
    if (n429 > 0 && method === 'GET') { n429--; return { status: 429, json: {} }; }
    if (method === 'PUT') { if (opts.putFail) return { status: 500, json: {} }; Object.assign(fw, body); return { status: 200, json: { firewall: fw } }; }
    if (opts.noApply && calls.filter(c => c[0] === 'PUT').length) return { status: 200, json: { firewall: Object.assign({}, fw, { inbound_rules: [{ protocol: 'tcp', ports: '8443', sources: { addresses: ['9.9.9.9/32'] } }] }) } };
    return { status: 200, json: { firewall: fw } };
  };
  return { fw, calls, request };
}
function mkG(prov, ip = '203.0.113.7', extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwg-'));
  const g = new FirewallGuardian(Object.assign({ dir, request: prov.request, detectIp: async () => ip, sleep: async () => {}, crypto: fakeCrypto }, extra));
  g.setFirewallId(FW);
  return g;
}

(async () => {
  await t('ip validation rejects private/loopback/garbage', () => {
    for (const bad of ['10.0.0.1', '127.0.0.1', '192.168.1.1', '172.16.0.1', '0.0.0.0', '999.1.1.1', '::1', 'a', '', null, '8.8.8.8/32']) assert(!isValidPublicIPv4(bad), String(bad));
    assert(isValidPublicIPv4('203.0.113.7'));
  });
  await t('buildDesiredInbound: only 8443 /32, SSH removed, never 0.0.0.0/0', () => {
    const r = buildDesiredInbound([{ protocol: 'tcp', ports: '22', sources: { addresses: ['0.0.0.0/0'] } }, { protocol: 'tcp', ports: '8443', sources: { addresses: ['1.1.1.1/32'] } }], '203.0.113.7');
    assert.deepStrictEqual(r, [{ protocol: 'tcp', ports: '8443', sources: { addresses: ['203.0.113.7/32'] } }]);
    assert.throws(() => buildDesiredInbound([], '0.0.0.0'));
  });
  await t('detectPublicIp needs 2 agreeing sources', async () => {
    assert.strictEqual(await detectPublicIp([async () => '203.0.113.7', async () => '203.0.113.7', async () => { throw new Error('x'); }]), '203.0.113.7');
    await assert.rejects(detectPublicIp([async () => '203.0.113.7', async () => '198.51.100.1', async () => 'junk']), /IP_UNVERIFIED/);
    await assert.rejects(detectPublicIp([async () => '10.0.0.1', async () => '10.0.0.1']), /IP_UNVERIFIED/);
  });
  await t('setToken: validates, stores encrypted, never exposes token in status', async () => {
    const p = mkProvider(); const g = mkG(p);
    assert.deepStrictEqual(await g.setToken(TOKEN), { ok: true });
    assert(g.hasToken());
    assert(!fs.readFileSync(g.patFile, 'utf8').includes(TOKEN));
    assert(!JSON.stringify(g.getStatus()).includes(TOKEN));
  });
  await t('setToken: provider 401/403 rejected, nothing stored', async () => {
    for (const k of ['status401', 'status403']) { const g = mkG(mkProvider({ [k]: true })); const r = await g.setToken(TOKEN); assert.strictEqual(r.error, 'TOKEN_REJECTED_BY_PROVIDER'); assert(!g.hasToken()); }
    const g = mkG(mkProvider()); assert.strictEqual((await g.setToken('bad token!')).error, 'TOKEN_FORMAT_INVALID');
  });
  await t('IP rotation: updates 8443 to new /32, closes SSH, verifies, preserves outbound', async () => {
    const p = mkProvider(); const g = mkG(p); await g.setToken(TOKEN);
    const r = await g.reconcile();
    assert(r.ok && r.changed, JSON.stringify(r));
    assert.deepStrictEqual(p.fw.inbound_rules, [{ protocol: 'tcp', ports: '8443', sources: { addresses: ['203.0.113.7/32'] } }]);
    assert.strictEqual(p.fw.outbound_rules.length, 1);
    const r2 = await g.reconcile();
    assert(r2.ok && !r2.changed && r2.status === 'IN_SYNC');
    assert.strictEqual(p.calls.filter(c => c[0] === 'PUT').length, 1);
  });
  await t('no token => NO_TOKEN, no provider calls', async () => {
    const p = mkProvider(); const g = mkG(p); const r = await g.reconcile();
    assert.strictEqual(r.status, 'NO_TOKEN'); assert.strictEqual(p.calls.length, 0);
  });
  await t('token revoked later (401) => TOKEN_INVALID, no retry loop', async () => {
    const p = mkProvider(); const g = mkG(p); await g.setToken(TOKEN);
    const p2 = mkProvider({ status401: true }); g.request = p2.request;
    const r = await g.reconcile(); assert.strictEqual(r.status, 'TOKEN_INVALID'); assert.strictEqual(p2.calls.length, 1);
  });
  await t('403 => TOKEN_INVALID (fail-closed)', async () => {
    const p = mkProvider(); const g = mkG(p); await g.setToken(TOKEN);
    const p2 = mkProvider({ status403: true }); g.request = p2.request;
    assert.strictEqual((await g.reconcile()).status, 'TOKEN_INVALID');
  });
  await t('429 rate limit: bounded backoff then success', async () => {
    const p = mkProvider({ n429: 2 }); const g = mkG(p); await g.setToken(TOKEN);
    const r = await g.reconcile(); assert(r.ok, JSON.stringify(r));
  });
  await t('429 forever: bounded retries then fail-closed', async () => {
    const p = mkProvider({ n429: 999 }); const g = mkG(p); await g.setToken(TOKEN);
    const r = await g.reconcile(); assert.strictEqual(r.status, 'FAIL_CLOSED_RETRIES_EXHAUSTED');
    assert(p.calls.filter(c => c[0] === 'GET').length <= 6);
  });
  await t('firewall PUT failure => fail-closed status', async () => {
    const p = mkProvider({ putFail: true }); const g = mkG(p); await g.setToken(TOKEN);
    const r = await g.reconcile(); assert(!r.ok && /FAIL_CLOSED/.test(r.status));
  });
  await t('post-write verify mismatch => VERIFY_FAILED', async () => {
    const p = mkProvider({ noApply: true }); const g = mkG(p); await g.setToken(TOKEN);
    const r = await g.reconcile(); assert.strictEqual(r.status, 'FAIL_CLOSED_VERIFY_FAILED');
  });
  await t('unverified IP => fail-closed, no firewall write', async () => {
    const p = mkProvider(); const g = mkG(p, '10.1.1.1'); await g.setToken(TOKEN);
    const r = await g.reconcile(); assert(!r.ok); assert(!p.calls.some(c => c[0] === 'PUT'));
  });
  await t('race protection: concurrent reconciles share one flight', async () => {
    const p = mkProvider(); const g = mkG(p); await g.setToken(TOKEN);
    const [a, b] = [g.reconcile(), g.reconcile()]; assert.strictEqual(a, b); await a;
    assert.strictEqual(p.calls.filter(c => c[0] === 'PUT').length, 1);
  });
  await t('revokeLocal removes token file', async () => {
    const g = mkG(mkProvider()); await g.setToken(TOKEN); g.revokeLocal(); assert(!g.hasToken()); assert.strictEqual(g.getStatus().status, 'NO_TOKEN');
  });
  console.log(`\nALL ${passed} TESTS PASSED (MOCK — no real provider calls)`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
