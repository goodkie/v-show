/**
 * inject-failure.js
 * 
 * Part of XPIDER Software Digital-Twin Lab (Directive #6116387233).
 * Programmatic and CLI Failure Injection Controller (Tier 5 Failure Matrix).
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.resolve(__dirname, 'topology/virtual_opal_env/router_state.json');

const FAILURE_MODES = {
  1: {
    id: 'KILL_WIREGUARD',
    name: '1. Kill WireGuard process/interface',
    apply: (state) => {
      state.wgState = 'DOWN';
      state.wgHandshakeAgeSec = null;
    }
  },
  2: {
    id: 'STALE_WG_HANDSHAKE',
    name: '2. Stale WireGuard handshake (>180s)',
    apply: (state) => {
      state.wgState = 'UP';
      state.wgHandshakeAgeSec = 300; // > 180s threshold
    }
  },
  3: {
    id: 'STOP_SQUID',
    name: '3. Stop Squid proxy daemon',
    apply: () => {
      // Handled via VpsEgressNode.stopWg()
    }
  },
  4: {
    id: 'UNAPPROVED_PROXY_ENDPOINT',
    name: '4. Expose/redirect to unapproved proxy endpoint',
    apply: () => {}
  },
  5: {
    id: 'CHANGE_EGRESS_FP',
    name: '5. Change canary egress identity FP-A -> FP-B',
    apply: () => {}
  },
  6: {
    id: 'REMOVE_KILL_SWITCH',
    name: '6. Remove kill-switch firewall rule',
    apply: (state) => {
      state.killSwitch = false;
    }
  },
  7: {
    id: 'ADD_DIRECT_WAN_BYPASS',
    name: '7. Add direct WAN bypass route',
    apply: (state) => {
      state.directWanBypass = true;
    }
  },
  8: {
    id: 'ADD_IPV6_BYPASS',
    name: '8. Add IPv6 default bypass',
    apply: (state) => {
      state.ipv6Disabled = false;
    }
  },
  9: {
    id: 'BREAK_DNS_BINDING',
    name: '9. Break DNS VPN binding',
    apply: (state) => {
      state.dnsBound = false;
    }
  },
  10: {
    id: 'WRONG_SSH_KEY',
    name: '10. Wrong SSH private key',
    apply: () => {}
  },
  11: {
    id: 'CHANGE_ROUTER_FP',
    name: '11. Change router identity fingerprint',
    apply: (state) => {
      state.pubKeyPrefix = 'sha256:0000000000000000';
    }
  },
  12: {
    id: 'KILL_COMPANION_RESTART',
    name: '12. Kill Companion during READY and restart',
    apply: () => {}
  },
  13: {
    id: 'PREMATURE_OVPN_ENROLL',
    name: '13. Attempt OVPN enrollment without trusted WG anchor',
    apply: () => {}
  },
  14: {
    id: 'SAME_GROUP_DIFF_FP',
    name: '14. Same group with divergent fingerprint (FP-B)',
    apply: () => {}
  },
  15: {
    id: 'DIFFERENT_IDENTITY_GROUP',
    name: '15. Different identity group enrollment',
    apply: () => {}
  }
};

function readState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function injectFailure(code) {
  const mode = FAILURE_MODES[code] || Object.values(FAILURE_MODES).find(m => m.id === code);
  if (!mode) {
    throw new Error(`Unknown failure code: ${code}`);
  }
  const state = readState();
  mode.apply(state);
  writeState(state);
  return mode;
}

function resetHealthy() {
  const healthy = {
    wgState: 'UP',
    wgHandshakeAgeSec: 25,
    wgPrivIp: '10.66.66.2/24',
    openvpnState: 'DOWN',
    openvpnIf: 'tun0',
    killSwitch: true,
    directWanBypass: false,
    vpnDefaultRoute: true,
    dnsBound: true,
    ipv6Disabled: true,
    model: 'GL-SFT1200',
    boardId: 'opal',
    pubKeyPrefix: 'sha256:c69abb1d284a24cc'
  };
  writeState(healthy);
  return healthy;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target || target === 'help') {
    console.log('Usage: node inject-failure.js <1-15 | ID | reset>');
    Object.entries(FAILURE_MODES).forEach(([k, v]) => console.log(`  ${k}: ${v.name}`));
    process.exit(0);
  }
  if (target === 'reset') {
    resetHealthy();
    console.log('Router state reset to HEALTHY.');
  } else {
    const applied = injectFailure(target);
    console.log(`Injected: ${applied.name}`);
  }
}

module.exports = { FAILURE_MODES, injectFailure, resetHealthy };
