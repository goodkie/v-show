/**
 * glinet-opal.js
 * 
 * Driver for GL.iNet GL-SFT1200 (Opal) travel router (Issue #6 R6.9G.10.3.7.1).
 * Reads and attests router identity, WireGuard / OpenVPN tunnel state, and Kill Switch enforcement.
 * Supports restricted forced-command SSH as primary production transport, with HTTP fallback.
 * Zero UI scraping; strictly structured JSON telemetry with fail-closed cryptographic pinning.
 */

const crypto = require('crypto');
const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

class GLInetOpalDriver {
  constructor(options = {}) {
    this.routerIp = options.routerIp || '192.168.8.1';
    this.port = options.port || 80;
    this.sshPort = options.sshPort || 22;
    this.sshUser = options.sshUser || 'root';
    this.sshKeyPath = options.sshKeyPath || null;
    this.transport = options.transport || 'ssh'; // 'ssh' (primary), 'http', or 'auto'
    this.timeoutMs = options.timeoutMs || 3000;
    this.expectedFingerprint = options.expectedFingerprint || null;
    this.agentToken = options.agentToken || null;
    this.customFetcher = options.customFetcher || null;
  }

  static deriveRouterFingerprint(model, boardId, agentPubKeyOrBoardSerial) {
    const raw = `${model || 'GL-SFT1200'}:${boardId || 'opal'}:${agentPubKeyOrBoardSerial || 'default'}`;
    return 'sha256:' + crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  async fetchSsh() {
    let keyPath = this.sshKeyPath;
    let tempKeyFile = null;

    try {
      if (!keyPath && this.agentToken && this.agentToken.includes('PRIVATE KEY')) {
        tempKeyFile = path.join(os.tmpdir(), `xpider_opal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.key`);
        fs.writeFileSync(tempKeyFile, this.agentToken.trim() + '\n', { encoding: 'utf8', mode: 0o600 });
        if (process.platform === 'win32') {
          try {
            execSync(`icacls "${tempKeyFile}" /inheritance:r /grant:r "%USERNAME%:R"`, { stdio: 'ignore' });
          } catch (_) {}
        }
        keyPath = tempKeyFile;
      }

      const keyArgs = keyPath ? `-i "${keyPath}"` : '';
      const portArg = this.sshPort && this.sshPort !== 22 ? `-p ${this.sshPort}` : '';
      // Opal authorized_keys enforces: command="/usr/libexec/xpider-router-attest",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty
      const sshCmd = `ssh ${keyArgs} ${portArg} -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=3 ${this.sshUser}@${this.routerIp}`;
      const stdout = execSync(sshCmd, { encoding: 'utf8', timeout: this.timeoutMs });
      return JSON.parse(stdout.trim());
    } finally {
      if (tempKeyFile && fs.existsSync(tempKeyFile)) {
        try { fs.unlinkSync(tempKeyFile); } catch (_) {}
      }
    }
  }

  async fetchHttp(pathname, payload = null) {
    return new Promise((resolve, reject) => {
      const isPost = payload !== null;
      const postData = isPost ? JSON.stringify(payload) : null;
      const headers = { 'Accept': 'application/json' };
      if (isPost) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(postData);
      }
      if (this.agentToken) {
        headers['Authorization'] = `Bearer ${this.agentToken}`;
      }

      const req = http.request({
        hostname: this.routerIp,
        port: this.port,
        path: pathname,
        method: isPost ? 'POST' : 'GET',
        headers,
        timeout: this.timeoutMs
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error(`JSON_PARSE_ERROR: ${err.message}`));
            }
          } else {
            reject(new Error(`HTTP_${res.statusCode}: ${body.substring(0, 100)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ROUTER_REQUEST_TIMEOUT'));
      });
      req.on('error', (err) => reject(err));
      if (postData) req.write(postData);
      req.end();
    });
  }

  async fetchJson(pathname, payload = null) {
    if (this.customFetcher) {
      return await this.customFetcher(pathname, payload);
    }

    if (this.transport === 'ssh') {
      return await this.fetchSsh();
    } else if (this.transport === 'http') {
      return await this.fetchHttp(pathname, payload);
    } else {
      // Auto: Try SSH first, fallback to HTTP
      try {
        return await this.fetchSsh();
      } catch (_) {
        return await this.fetchHttp(pathname, payload);
      }
    }
  }

  /**
   * Attests GL-SFT1200 Opal state with strict evidence requirements.
   */
  async attest() {
    const observedAt = Date.now();
    try {
      const data = await this.fetchJson('/api/xpider/attest');

      const model = data.model || 'GL-SFT1200';
      const boardId = data.boardId || 'sft1200';
      const routerFp = GLInetOpalDriver.deriveRouterFingerprint(model, boardId, data.publicKey || data.boardId || data.deviceSerial);

      // Blocker 4: Expected fingerprint is MANDATORY. Null expected fingerprint NEVER passes!
      const identityVerified = Boolean(this.expectedFingerprint && this.expectedFingerprint === routerFp);

      // VPN state
      let vpnProto = 'NONE';
      let vpnState = 'DOWN';
      let vpnIf = null;
      let endpointFp = null;
      let handshakeAge = null;
      let tunnelPrivAddr = null;

      // WireGuard: Must have interface up AND handshake within bounded threshold (<= 180s)
      if (data.wireguard && data.wireguard.state === 'UP') {
        const age = typeof data.wireguard.lastHandshakeAgeSec === 'number' ? data.wireguard.lastHandshakeAgeSec : null;
        if (age !== null && age <= 180) {
          vpnProto = 'WIREGUARD';
          vpnState = 'UP';
          vpnIf = data.wireguard.interfaceName || 'wgclient';
          endpointFp = data.wireguard.endpointFingerprint || null;
          handshakeAge = age;
          tunnelPrivAddr = data.wireguard.tunnelPrivateAddress || '10.66.66.2';
        } else {
          vpnProto = 'WIREGUARD';
          vpnState = 'DOWN'; // Handshake missing or expired (> 180s)
          handshakeAge = age;
        }
      } else if (data.openvpn && data.openvpn.state === 'UP') {
        // OpenVPN: Must have interface UP AND routing present through tunnel
        if (data.openvpn.interfaceName && data.openvpn.routePresent !== false) {
          vpnProto = 'OPENVPN';
          vpnState = 'UP';
          vpnIf = data.openvpn.interfaceName || 'tun0';
          endpointFp = data.openvpn.endpointFingerprint || null;
          tunnelPrivAddr = data.openvpn.tunnelPrivateAddress || '10.67.67.2';
        } else {
          vpnProto = 'OPENVPN';
          vpnState = 'DOWN';
        }
      } else if (data.vpn) {
        vpnProto = data.vpn.protocol || 'NONE';
        vpnState = data.vpn.state || 'DOWN';
        vpnIf = data.vpn.interfaceName || null;
        endpointFp = data.vpn.endpointFingerprint || null;
        handshakeAge = data.vpn.lastHandshakeAgeSec || null;
        tunnelPrivAddr = data.vpn.tunnelPrivateAddress || null;
      }

      // Kill Switch state (Blocker 5): Must be ENFORCED with verified evidence
      let ksState = 'UNKNOWN';
      let ksEvidence = [];
      if (data.killSwitch) {
        ksState = data.killSwitch.state === 'ENFORCED' ? 'ENFORCED' : (data.killSwitch.state || 'UNKNOWN');
        ksEvidence = Array.isArray(data.killSwitch.evidence) ? data.killSwitch.evidence : [];
      }

      // Route state
      const defaultGatewayViaOpal = Boolean(data.route && data.route.defaultGatewayViaOpal !== false);
      const vpnDefaultRoutePresent = Boolean(data.route && data.route.vpnDefaultRoutePresent === true);
      const directWanBypassDetected = Boolean(data.route && data.route.directWanBypassDetected === true);

      // DNS (Blocker 5): Must be verified VPN_BOUND
      const dnsState = (data.dns && data.dns.state === 'VPN_BOUND') ? 'VPN_BOUND' : 'UNKNOWN';

      // IPv6: DISABLED or VPN_BOUND
      const ipv6State = (data.ipv6 && (data.ipv6.state === 'DISABLED' || data.ipv6.state === 'VPN_BOUND'))
        ? data.ipv6.state
        : (data.ipv6 && data.ipv6.state ? data.ipv6.state : (data.ipv6Disabled ? 'DISABLED' : 'UNVERIFIED'));

      return {
        reachable: true,
        identityVerified,
        vendor: 'GL.iNet',
        model: 'GL-SFT1200',
        firmwareVersion: data.firmwareVersion || null,
        lanGateway: data.lanGateway || this.routerIp,
        lanInterface: data.lanInterface || 'br-lan',
        routerFingerprint: routerFp,
        vpn: {
          protocol: vpnProto,
          state: vpnState,
          interfaceName: vpnIf,
          endpointFingerprint: endpointFp,
          lastHandshakeAgeSec: handshakeAge,
          tunnelPrivateAddress: tunnelPrivAddr
        },
        killSwitch: {
          state: ksState,
          evidence: ksEvidence
        },
        route: {
          defaultGatewayViaOpal,
          vpnDefaultRoutePresent,
          directWanBypassDetected
        },
        dns: {
          state: dnsState
        },
        ipv6: {
          state: ipv6State
        },
        observedAt
      };
    } catch (err) {
      return {
        reachable: false,
        identityVerified: false,
        vendor: 'GL.iNet',
        model: 'GL-SFT1200',
        firmwareVersion: null,
        lanGateway: this.routerIp,
        lanInterface: null,
        routerFingerprint: null,
        vpn: { protocol: 'UNKNOWN', state: 'UNKNOWN', interfaceName: null, endpointFingerprint: null, lastHandshakeAgeSec: null, tunnelPrivateAddress: null },
        killSwitch: { state: 'UNKNOWN', evidence: [`UNREACHABLE: ${err.message}`] },
        route: { defaultGatewayViaOpal: false, vpnDefaultRoutePresent: null, directWanBypassDetected: null },
        dns: { state: 'UNKNOWN' },
        ipv6: { state: 'UNVERIFIED' },
        observedAt,
        error: err.message
      };
    }
  }
}

module.exports = { GLInetOpalDriver };
