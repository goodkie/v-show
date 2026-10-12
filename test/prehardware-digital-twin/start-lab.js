/**
 * start-lab.js
 * 
 * Part of XPIDER Software Digital-Twin Lab (Directive #6116387233).
 * Launches the digital twin network nodes:
 * - INTERNET_CANARY (port 8980)
 * - VPS_EGRESS (Squid WG: 8982, OVPN: 8984, Public blocked: 8986)
 * - VIRTUAL_OPAL (SSH attestation: 18922)
 */

const fs = require('fs');
const path = require('path');
const { CanaryTargetServer } = require('./topology/canary_target');
const { VpsEgressNode } = require('./topology/vps_egress');
const { VirtualOpalNode } = require('./topology/virtual_opal');

const LOGS_DIR = path.resolve(__dirname, 'logs');
const STATE_FILE = path.join(LOGS_DIR, 'lab-state.json');

async function startLab() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  console.log('========================================================');
  console.log('  XPIDER Software Digital-Twin Lab — Starting Nodes');
  console.log('========================================================');

  const canary = new CanaryTargetServer({ port: 8980 });
  await canary.start();
  console.log('[CANARY] Internet Canary & Sniffer listening on http://127.0.0.1:8980');

  const vps = new VpsEgressNode({ wgProxyPort: 8982, ovpnProxyPort: 8984, publicProxyPort: 8986 });
  await vps.start();
  console.log('[VPS_EGRESS] Squid Proxy WG Primary listening on 10.66.66.1:3128 (mapped: 8982)');
  console.log('[VPS_EGRESS] Squid Proxy OVPN Fallback listening on 10.67.67.1:3128 (mapped: 8984)');
  console.log('[VPS_EGRESS] Public port 3128 is CLOSED (connection refused proof)');

  const opal = new VirtualOpalNode({ port: 18922 });
  await opal.start();
  console.log('[VIRTUAL_OPAL] OpenWrt / GL-SFT1200 SSH Attestation listening on 127.0.0.1:18922');

  const labState = {
    startedAt: new Date().toISOString(),
    pid: process.pid,
    nodes: {
      canary: { port: 8980 },
      vps: { wgProxyPort: 8982, ovpnProxyPort: 8984, publicProxyPort: 8986 },
      opal: { port: 18922 }
    }
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(labState, null, 2), 'utf8');

  console.log('========================================================');
  console.log('  Digital-Twin Lab Nodes Running Successfully');
  console.log('========================================================');

  return { canary, vps, opal, labState };
}

if (require.main === module) {
  startLab().then(() => {
    console.log('Lab running. Press Ctrl+C to terminate or run node stop-lab.js.');
  }).catch((err) => {
    console.error('Failed to start lab:', err);
    process.exit(1);
  });
}

module.exports = { startLab };
