const http = require('http'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const token = fs.readFileSync(path.join(root, 'companion', '.control_token'), 'utf8').trim();
const mask = (s) => String(s).replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.*.*');
const call = (m, p) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: 18989, path: p, method: m, timeout: 20000, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': 0 } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { try { res({ s: x.statusCode, j: JSON.parse(b) }); } catch (_) { res({ s: x.statusCode, j: {} }); } }); }); r.on('error', e => res({ e: e.message })); r.end(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const cfgFile = path.join(root, 'companion', 'egress_pool_config.json');
  const saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  console.log('PERSISTED_FILE', JSON.stringify({ selected: saved.residentialProxySelected, id: saved.residentialProxyConfig && saved.residentialProxyConfig.id, host: saved.residentialProxyConfig && saved.residentialProxyConfig.host, port: saved.residentialProxyConfig && saved.residentialProxyConfig.port, type: saved.residentialProxyConfig && saved.residentialProxyConfig.type, mtime: fs.statSync(cfgFile).mtime.toISOString() }));
  const sd = await call('POST', '/shutdown'); console.log('SHUTDOWN', sd.s || sd.e);
  await sleep(4000);
  try { execSync('node companion/ensure_companion_service.js', { cwd: root, encoding: 'utf8', timeout: 90000 }); console.log('ENSURE ok'); } catch (e) { console.log('ENSURE exit', e.status); }
  await sleep(8000);
  const h = await call('GET', '/health'); const rp = await call('GET', '/residential-proxy/status'); const eg = await call('GET', '/egress-ip/status');
  const m = eg.j.egressIpMonitor || {};
  console.log('POST_RESTART', mask(JSON.stringify({ build: (h.j.companionBuildId || '').slice(-60), relayReady: h.j.relayReady, selected: rp.j.residentialProxySelected, cfg: rp.j.residentialProxyConfig, decodoRaw: rp.j.residentialProxy && { status: rp.j.residentialProxy.status, sendAllowed: rp.j.residentialProxy.sendAllowed, checkedAt: rp.j.residentialProxy.checkedAt }, led: m.decodoResidential && { status: m.decodoResidential.status, fresh: m.decodoResidential.fresh, inUse: m.decodoResidential.inUse, ip: m.decodoResidential.observedIpMasked }, route: m.activeRoute && m.activeRoute.route })));
})();

