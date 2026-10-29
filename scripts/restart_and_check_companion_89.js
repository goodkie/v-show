const { execSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
try { console.log(execSync('node companion/ensure_companion_service.js', { cwd: root, encoding: 'utf8', timeout: 60000 }).split('\n').slice(-12).join('\n')); }
catch (e) { console.log('ensure exit', e.status, String(e.stdout || '').split('\n').slice(-12).join('\n'), String(e.stderr || '').slice(0, 500)); }
setTimeout(() => {
  try {
    const out = execSync('node scripts/inspect_decodo_state_readonly.js /health /egress-ip/status', { cwd: root, encoding: 'utf8' });
    const j = JSON.parse(out);
    const h = j['/health'].body, m = j['/egress-ip/status'].body.egressIpMonitor;
    console.log(JSON.stringify({
      buildId: h.companionBuildId, relayReady: h.relayReady, residentialProxySelected: h.residentialProxySelected,
      decodo: { status: m.decodoResidential.status, fresh: m.decodoResidential.fresh, inUse: m.decodoResidential.inUse },
      route: m.activeRoute.route, companionProbe: m.companionProbeEgress.status, rawIsp: m.rawIspWan.status
    }, null, 1));
  } catch (e) { console.log('inspect failed', e.message.slice(0, 300)); }
}, 7000);
