'use strict';
/**
 * Local-only one-time PAT entry UI for the Firewall Guardian.
 * - Binds 127.0.0.1 on an ephemeral port, requires a random one-time nonce in URL.
 * - Token is POSTed to this local process only, validated with DigitalOcean, stored via DPAPI.
 * - Token is never printed, logged, or sent anywhere except api.digitalocean.com.
 * Usage: node companion/firewall-guardian-ui.js [--firewall-id <uuid>]
 */
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const { FirewallGuardian } = require('./firewall-guardian');

const DEFAULT_FIREWALL_ID = 'd6fd3a95-d9d9-417d-9d27-c6b57e94240a';

const PAGE = (nonce, st) => `<!doctype html><html lang="ko"><meta charset="utf-8"><title>XPIDER Firewall Guardian</title>
<style>body{font:15px system-ui;background:#0f1220;color:#e8eaf6;max-width:640px;margin:40px auto;padding:0 20px}
.c{background:#1a1f3a;border-radius:12px;padding:20px;margin:16px 0}input{width:100%;padding:10px;border-radius:8px;border:1px solid #445;background:#0b0e1c;color:#fff;box-sizing:border-box}
button{margin-top:12px;padding:10px 18px;border:0;border-radius:8px;background:#6c63ff;color:#fff;font-weight:600;cursor:pointer}code{background:#0b0e1c;padding:2px 6px;border-radius:4px}</style>
<h1>XPIDER Firewall Guardian</h1>
<div class="c"><b>상태:</b> <code>${st.status}</code> · 토큰 저장: <code>${st.hasToken ? 'YES' : 'NO'}</code> · 마지막 IP: <code>${st.lastIp || '-'}</code><br>방화벽: <code>${st.firewallId || '-'}</code></div>
<div class="c"><b>DigitalOcean Personal Access Token (1회 입력)</b><br>
<small>필요 권한(Custom scopes): <code>firewall:read</code>, <code>firewall:update</code>, <code>account:read</code> (그 외 불필요). 이 창은 이 PC에서만 열리며 토큰은 Windows DPAPI로 암호화 저장됩니다.</small>
<form method="POST" action="/set?n=${nonce}"><input type="password" name="token" autocomplete="off" placeholder="dop_v1_..." required>
<button>저장 및 검증</button></form></div>
<div class="c"><form method="POST" action="/revoke?n=${nonce}"><button style="background:#a33">로컬 토큰 삭제</button></form></div></html>`;

async function main() {
  const g = new FirewallGuardian();
  const idx = process.argv.indexOf('--firewall-id');
  g.setFirewallId(idx > 0 ? process.argv[idx + 1] : (g.getConfig().firewallId || DEFAULT_FIREWALL_ID));
  const nonce = crypto.randomBytes(16).toString('hex');
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.searchParams.get('n') !== nonce) { res.writeHead(403); return res.end('forbidden'); }
    const html = msg => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`${msg ? `<p style="color:#9f9;font-family:system-ui">${msg}</p>` : ''}${PAGE(nonce, g.getStatus())}`); };
    if (req.method === 'GET' && u.pathname === '/') return html('');
    if (req.method === 'POST') {
      let b = ''; req.on('data', c => { b += c; if (b.length > 4096) req.destroy(); });
      req.on('end', async () => {
        if (u.pathname === '/set') {
          const token = new URLSearchParams(b).get('token');
          const r = await g.setToken(token);
          if (!r.ok) return html(`<span style="color:#f99">실패: ${r.error}</span>`);
          const rec = await g.reconcile();
          return html(`저장 완료. 방화벽 동기화 결과: ${rec.status}${rec.ip ? ' (' + rec.ip + '/32)' : ''}`);
        }
        if (u.pathname === '/revoke') { g.revokeLocal(); return html('로컬 토큰 삭제됨. DO 콘솔에서도 PAT를 폐기하세요.'); }
        res.writeHead(404); res.end();
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/?n=${nonce}`;
    console.log('XPIDER Firewall Guardian UI: ' + url);
    exec(`start "" "${url}"`);
  });
}
if (require.main === module) main();
module.exports = { PAGE };
