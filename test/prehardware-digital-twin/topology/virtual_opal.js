/**
 * virtual_opal.js
 * 
 * Part of XPIDER Software Digital-Twin Lab (Directive #6116387233).
 * Simulates GL.iNet GL-SFT1200 Opal router environment:
 * 1. Restricted SSH attestation server (ssh2.Server on port 18922).
 * 2. Real execution of UNMODIFIED router/opalintegrity/xpider-router-attest.sh.
 * 3. Dynamic router state controller:
 *    - WireGuard UP / DOWN / STALE
 *    - OpenVPN UP / DOWN
 *    - Kill Switch ENFORCED / REMOVED
 *    - Direct WAN bypass route injected
 *    - IPv6 bypass injected
 *    - DNS binding bound / broken
 *    - Host key authentication / rejection
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ssh2 = require('ssh2');

const BASH_PATH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const ATTEST_SCRIPT = path.resolve('router/opalintegrity/xpider-router-attest.sh');

class VirtualOpalNode {
  constructor(options = {}) {
    this.port = options.port || 18922;
    this.envDir = path.resolve(__dirname, 'virtual_opal_env');
    this.binDir = path.join(this.envDir, 'bin');
    this.stateFile = path.join(this.envDir, 'router_state.json');
    this.resolvFile = path.join(this.envDir, 'resolv.conf.auto');
    this.ipv6File = path.join(this.envDir, 'disable_ipv6');

    // Host keys for SSH server (Ed25519)
    this.serverKey = ssh2.utils.generateKeyPairSync('ed25519');
    this.authorizedPubKey = null; // Set when pair initiated

    this.server = null;
    this.rejectAuth = false;
    this.mismatchedFingerprint = false;

    this.defaultState = {
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

    this.state = { ...this.defaultState };
  }

  _setupEnvironment() {
    fs.mkdirSync(this.binDir, { recursive: true });
    this._persistState();

    // 1. bin/wg script
    const wgScript = `#!/bin/sh
STATE_FILE="${this.stateFile.replace(/\\/g, '/')}"
NOW=$(date +%s)
WG_UP=$(grep -o '"wgState": *"[^"]*"' "$STATE_FILE" | cut -d'"' -f4)
AGE=$(grep -o '"wgHandshakeAgeSec": *[0-9]*' "$STATE_FILE" | grep -o '[0-9]*')

if [ "$WG_UP" = "UP" ]; then
  if [ "$1" = "show" ]; then
    if [ "$2" = "wgclient" ] && [ "$3" = "latest-handshakes" ]; then
      HS_EPOCH=$((NOW - AGE))
      echo "peer1 $HS_EPOCH"
      exit 0
    elif [ "$2" = "latest-handshakes" ]; then
      HS_EPOCH=$((NOW - AGE))
      echo "peer1 $HS_EPOCH"
      exit 0
    fi
    echo "interface: wgclient"
    echo "public key: testWgPubKey=="
    echo "private key: (hidden)"
    echo "listening port: 51820"
  fi
else
  exit 1
fi
`;
    fs.writeFileSync(path.join(this.binDir, 'wg'), wgScript, { encoding: 'utf8', mode: 0o755 });

    // 2. bin/ip script
    const ipScript = `#!/bin/sh
STATE_FILE="${this.stateFile.replace(/\\/g, '/')}"
WG_UP=$(grep -o '"wgState": *"[^"]*"' "$STATE_FILE" | cut -d'"' -f4)
OVPN_UP=$(grep -o '"openvpnState": *"[^"]*"' "$STATE_FILE" | cut -d'"' -f4)
BYPASS=$(grep -o '"directWanBypass": *[^,}]*' "$STATE_FILE" | awk '{print $2}')

if [ "$1" = "link" ]; then
  if echo "$*" | grep -q "wgclient" && [ "$WG_UP" = "UP" ]; then
    echo "3: wgclient: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420 qdisc noqueue state UP"
  elif echo "$*" | grep -q "tun0" && [ "$OVPN_UP" = "UP" ]; then
    echo "4: tun0: <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP"
  elif [ "$2" = "show" ] && [ -z "$3" ]; then
    if [ "$OVPN_UP" = "UP" ]; then echo "4: tun0: <POINTOPOINT,UP>"; fi
    if [ "$WG_UP" = "UP" ]; then echo "3: wgclient: <POINTOPOINT,UP>"; fi
  fi
elif [ "$1" = "-4" ] && [ "$2" = "addr" ]; then
  if echo "$*" | grep -q "wgclient" && [ "$WG_UP" = "UP" ]; then
    echo "    inet 10.66.66.2/24 scope global wgclient"
  elif echo "$*" | grep -q "tun0" && [ "$OVPN_UP" = "UP" ]; then
    echo "    inet 10.67.67.2/24 scope global tun0"
  fi
elif [ "$1" = "route" ]; then
  if echo "$*" | grep -q "default"; then
    if [ "$BYPASS" = "true" ]; then
      echo "default via 192.168.1.1 dev eth0"
    else
      if [ "$WG_UP" = "UP" ]; then echo "default via 10.66.66.1 dev wgclient";
      elif [ "$OVPN_UP" = "UP" ]; then echo "default via 10.67.67.1 dev tun0"; fi
    fi
  elif echo "$*" | grep -q "tun0" && [ "$OVPN_UP" = "UP" ]; then
    echo "10.67.67.0/24 dev tun0 proto kernel scope link src 10.67.67.2"
    echo "0.0.0.0/1 dev tun0"
    echo "128.0.0.0/1 dev tun0"
  elif [ "$2" = "show" ]; then
    if [ "$WG_UP" = "UP" ]; then
      echo "0.0.0.0/1 dev wgclient"
      echo "128.0.0.0/1 dev wgclient"
    elif [ "$OVPN_UP" = "UP" ]; then
      echo "0.0.0.0/1 dev tun0"
      echo "128.0.0.0/1 dev tun0"
    fi
  fi
fi
`;
    fs.writeFileSync(path.join(this.binDir, 'ip'), ipScript, { encoding: 'utf8', mode: 0o755 });

    // 3. bin/pgrep script
    const pgrepScript = `#!/bin/sh
STATE_FILE="${this.stateFile.replace(/\\/g, '/')}"
OVPN_UP=$(grep -o '"openvpnState": *"[^"]*"' "$STATE_FILE" | cut -d'"' -f4)
if [ "$1" = "openvpn" ] && [ "$OVPN_UP" = "UP" ]; then
  echo "12345"
  exit 0
fi
exit 1
`;
    fs.writeFileSync(path.join(this.binDir, 'pgrep'), pgrepScript, { encoding: 'utf8', mode: 0o755 });

    // 4. bin/uci script
    const uciScript = `#!/bin/sh
STATE_FILE="${this.stateFile.replace(/\\/g, '/')}"
KS=$(grep -o '"killSwitch": *[^,}]*' "$STATE_FILE" | awk '{print $2}')
DNS_BOUND=$(grep -o '"dnsBound": *[^,}]*' "$STATE_FILE" | awk '{print $2}')
IPV6_DIS=$(grep -o '"ipv6Disabled": *[^,}]*' "$STATE_FILE" | awk '{print $2}')

if [ "$2" = "glconfig.general.block_non_vpn" ]; then
  if [ "$KS" = "true" ]; then echo "1"; else echo "0"; fi
elif [ "$2" = "dhcp.@dnsmasq[0].server" ]; then
  if [ "$DNS_BOUND" = "true" ]; then echo "10.66.66.1"; else echo "8.8.8.8"; fi
elif [ "$2" = "glipv6.wan.disabled" ]; then
  if [ "$IPV6_DIS" = "true" ]; then echo "1"; else echo "0"; fi
elif [ "$2" = "network.lan.ipaddr" ]; then
  echo "192.168.8.1"
fi
`;
    fs.writeFileSync(path.join(this.binDir, 'uci'), uciScript, { encoding: 'utf8', mode: 0o755 });

    // 5. bin/iptables script
    const iptablesScript = `#!/bin/sh
STATE_FILE="${this.stateFile.replace(/\\/g, '/')}"
KS=$(grep -o '"killSwitch": *[^,}]*' "$STATE_FILE" | awk '{print $2}')
if [ "$KS" = "true" ]; then
  if [ "$2" = "zone_lan_forward" ]; then
    echo "-A zone_lan_forward -j DROP"
  elif [ "$2" = "zone_lan_dest_ACCEPT" ]; then
    echo "-A zone_lan_dest_ACCEPT -o wgclient -j ACCEPT"
  fi
fi
`;
    fs.writeFileSync(path.join(this.binDir, 'iptables'), iptablesScript, { encoding: 'utf8', mode: 0o755 });
  }

  _persistState() {
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');

    // resolv.conf.auto
    if (this.state.dnsBound) {
      fs.writeFileSync(this.resolvFile, 'nameserver 10.66.66.1\nnameserver 10.67.67.1\n', 'utf8');
    } else {
      fs.writeFileSync(this.resolvFile, 'nameserver 8.8.8.8\n', 'utf8');
    }

    // disable_ipv6
    fs.writeFileSync(this.ipv6File, this.state.ipv6Disabled ? '1\n' : '0\n', 'utf8');
  }

  executeAttestDirectly() {
    if (fs.existsSync(this.stateFile)) {
      try {
        const diskState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.state = { ...this.state, ...diskState };
      } catch (e) {}
    }
    this._persistState();
    const envPath = `${this.binDir};C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;C:\\Windows\\system32`;
    const res = spawnSync(BASH_PATH, ['-c', `
export PATH="${this.binDir.replace(/\\/g, '/')}:$PATH"
chmod +x "${this.binDir.replace(/\\/g, '/')}"/* 2>/dev/null
export RESOLV_CONF="${this.resolvFile.replace(/\\/g, '/')}"
export IPV6_SYSCTL="${this.ipv6File.replace(/\\/g, '/')}"
sed -e 's|/tmp/resolv.conf.auto|${this.resolvFile.replace(/\\/g, '/')}|g' \
    -e 's|/proc/sys/net/ipv6/conf/all/disable_ipv6|${this.ipv6File.replace(/\\/g, '/')}|g' \
    "${ATTEST_SCRIPT.replace(/\\/g, '/')}" | sh
`], {
      encoding: 'utf8',
      env: { ...process.env, PATH: envPath }
    });

    if (res.error) throw res.error;
    const jsonStr = res.stdout.trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (this.mismatchedFingerprint) {
        parsed.publicKey = 'sha256:0000000000000000';
      }
      return parsed;
    } catch (e) {
      throw new Error(`Failed to parse attest script output: ${jsonStr}\nStderr: ${res.stderr}`);
    }
  }

  setAuthorizedKey(pubKeyStr) {
    this.authorizedPubKey = pubKeyStr ? pubKeyStr.trim() : null;
  }

  setRejectAuth(reject) {
    this.rejectAuth = reject;
  }

  setMismatchedFingerprint(mismatch) {
    this.mismatchedFingerprint = mismatch;
  }

  resetState() {
    this.state = { ...this.defaultState };
    this.rejectAuth = false;
    this.mismatchedFingerprint = false;
    this._persistState();
  }

  start() {
    this._setupEnvironment();
    return new Promise((resolve, reject) => {
      this.server = new ssh2.Server({
        hostKeys: [this.serverKey.private]
      }, (client) => {
        client.on('authentication', (ctx) => {
          if (this.rejectAuth) {
            return ctx.reject(['publickey']);
          }

          if (ctx.method === 'publickey') {
            // Verify Ed25519 public key
            if (this.authorizedPubKey) {
              const clientKeyStr = `${ctx.key.algo} ${ctx.key.data.toString('base64')}`;
              if (!this.authorizedPubKey.includes(ctx.key.data.toString('base64'))) {
                return ctx.reject(['publickey']);
              }
            }
            return ctx.accept();
          }
          ctx.reject(['publickey']);
        });

        client.on('ready', () => {
          client.on('session', (accept) => {
            const session = accept();
            session.on('exec', (acceptExec, rejectExec, info) => {
              const stream = acceptExec();
              try {
                const telemetry = this.executeAttestDirectly();
                stream.write(JSON.stringify(telemetry, null, 2) + '\n');
                stream.exit(0);
                stream.end();
              } catch (err) {
                stream.stderr.write(`Attest error: ${err.message}\n`);
                stream.exit(1);
                stream.end();
              }
            });
          });
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        resolve({ port: this.port });
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
}

module.exports = { VirtualOpalNode };
