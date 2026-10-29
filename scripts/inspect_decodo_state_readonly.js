// READ-ONLY inspection of companion state (GET only). Redacts secrets and masks IPs.
const http = require('http');
const fs = require('fs');
const path = require('path');
const token = fs.readFileSync(path.join(__dirname, '..', 'companion', '.control_token'), 'utf8').trim();

function maskIp(s) { return String(s).replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.*.*'); }
function redact(o) {
  return JSON.parse(maskIp(JSON.stringify(o, (k, v) =>
    /pass|secret|token|credential|auth|key|user(name)?$/i.test(k) && typeof v === 'string' ? '[REDACTED]' : v)));
}
function get(p) {
  return new Promise((res) => {
    const r = http.request({ host: '127.0.0.1', port: 18989, path: p, method: 'GET', timeout: 15000,
      headers: { Authorization: 'Bearer ' + token, 'X-Xpider-Token': token } }, (resp) => {
      let b = ''; resp.on('data', c => b += c);
      resp.on('end', () => { let j; try { j = JSON.parse(b); } catch (e) { j = b.slice(0, 300); } res({ p, status: resp.statusCode, body: j }); });
    });
    r.on('error', e => res({ p, error: e.message })); r.end();
  });
}
(async () => {
  const out = {};
  for (const p of (process.argv.slice(2).length ? process.argv.slice(2) : ['/health', '/residential-proxy/status', '/egress-ip/status', '/status'])) {
    const r = await get(p);
    out[p] = { status: r.status, error: r.error, body: redact(r.body) };
  }
  console.log(JSON.stringify(out, null, 1).slice(0, 14000));
})();

