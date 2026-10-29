// RC3.60 .89 — Non-destructive restore of missing residentialProxyConfig (Directive #6507436538).
// Steps: (A) snapshot, (B/C) validate, (D) restore ONLY if currently unconfigured, then READ-ONLY authenticated probe.
// Never prints credentials; masks IPs. Never overwrites a populated config. No DO fallback.
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const token = fs.readFileSync(path.join(root, 'companion', '.control_token'), 'utf8').trim();
const maskIp = (s) => String(s).replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.*.*');

function call(method, p, body, timeout = 60000) {
  return new Promise((res) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: 18989, path: p, method, timeout,
      headers: Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) }, (resp) => {
      let b = ''; resp.on('data', c => b += c);
      resp.on('end', () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 200) }; } res({ status: resp.statusCode, json: j }); });
    });
    r.on('error', e => res({ error: e.message })); if (payload) r.write(payload); r.end();
  });
}
const red = (o) => JSON.parse(maskIp(JSON.stringify(o, (k, v) => /pass|secret|token|credentialRef|^ca$/i.test(k) && typeof v === 'string' ? '[REDACTED]' : v)));

(async () => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  // (A) snapshot
  const snapDir = path.join(root, 'scratch', 'snapshots', 'decodo_restore_' + ts);
  fs.mkdirSync(snapDir, { recursive: true });
  const copies = [
    ['companion/egress_pool_config.json', 'egress_pool_config.live.json'],
    ['companion/.local_credentials.json', 'local_credentials.live.json'],
    [path.join(process.env.LOCALAPPDATA, 'XPIDER_Privacy_Relay', 'egress_pool_config.json'), 'egress_pool_config.appdata.json'],
    [path.join(process.env.LOCALAPPDATA, 'XPIDER_Privacy_Relay', '.local_credentials.json'), 'local_credentials.appdata.json']
  ];
  const snap = [];
  for (const [src, dst] of copies) {
    const sp = path.isAbsolute(src) ? src : path.join(root, src);
    if (fs.existsSync(sp)) { fs.copyFileSync(sp, path.join(snapDir, dst)); snap.push(dst); }
  }
  const before = await call('GET', '/residential-proxy/status');
  fs.writeFileSync(path.join(snapDir, 'residential_status_before.json'), JSON.stringify(red(before.json), null, 2));
  console.log('SNAPSHOT', path.relative(root, snapDir), snap.join(','));

  // Guard: never overwrite a populated config
  if (before.json && before.json.residentialProxyConfig && before.json.residentialProxyConfig.hostConfigured !== false && before.json.residentialProxyConfig.host) {
    console.log('ABORT: residential config already populated; not overwriting'); return;
  }
  // (D) restore ONLY missing config using owner-proven non-secret parameters (existing DPAPI entry by id; no password supplied)
  const cfg = { id: 'decodo-ip-auth', host: 'us.decodo.com', port: 10001, type: 'HTTP_PROXY', username: '' };
  const r = await call('POST', '/residential-proxy/configure', { selected: true, config: cfg, runProbe: true, timeoutMs: 15000 }, 90000);
  console.log('CONFIGURE+PROBE', r.status, JSON.stringify(red(r.json)).slice(0, 2500));
  const after = await call('GET', '/residential-proxy/status');
  console.log('STATUS_AFTER', JSON.stringify(red(after.json)).slice(0, 1500));
  fs.writeFileSync(path.join(snapDir, 'residential_status_after.json'), JSON.stringify(red(after.json), null, 2));
})();

