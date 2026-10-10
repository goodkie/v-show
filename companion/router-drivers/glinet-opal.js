/**
 * glinet-opal.js
 * 
 * Driver for GL.iNet GL-SFT1200 (Opal) travel router (Issue #6 R6.9G.10.3.7).
 * Reads and attests router identity, WireGuard / OpenVPN tunnel state, and Kill Switch enforcement.
 * Zero UI scraping; communicates via structured firmware API / ubus RPC / restricted agent telemetry.
 */

const crypto = require('crypto');
const http = require('http');

class GLInetOpalDriver {
  constructor(options = {}) {
    this.routerIp = options.routerIp || '192.168.8.1';
    this.port = options.port || 80;
    this.timeoutMs = options.timeoutMs || 3000;
    this.expectedFingerprint = options.expectedFingerprint || null;
    this.agentToken = options.agentToken || null;
    this.customFetcher = options.customFetcher || null;
  }

  static deriveRouterFingerprint(model, boardId, agentPubKeyOrBoardSerial) {
    const raw = `${model || 'GL-SFT1200'}:${boardId || 'opal'}:${agentPubKeyOrBoardSerial || 'default'}`;
    return 'sha256:' + crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  async fetchJson(pathname, payload = null) {
    if (this.customFetcher) {
      return await this.customFetcher(pathname, payload);
    }

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

  /**
   * Attests GL-SFT1200 Opal state.
   */
  async attest() {
    const observedAt = Date.now();
    try {
      // 1. Fetch telemetry from router
      // Primary: specialized XPIDER restricted telemetry endpoint /api/xpider/attest or ubus proxy
      const data = await this.fetchJson('/api/xpider/attest');

      const model = data.model || 'GL-SFT1200';
      const boardId = data.boardId || 'sft1200';
      const routerFp = GLInetOpalDriver.deriveRouterFingerprint(model, boardId, data.publicKey || data.boardId);

      const identityVerified = !this.expectedFingerprint || (this.expectedFingerprint === routerFp);

      // VPN state
      let vpnProto = 'NONE';
      let vpnState = 'DOWN';
      let vpnIf = null;
      let endpointFp = null;
      let handshakeAge = null;
      let tunnelPrivAddr = null;

      if (data.wireguard && data.wireguard.state === 'UP') {
        vpnProto = 'WIREGUARD';
        vpnState = 'UP';
        vpnIf = data.wireguard.interfaceName || 'wgclient';
        endpointFp = data.wireguard.endpointFingerprint || null;
        handshakeAge = typeof data.wireguard.lastHandshakeAgeSec === 'number' ? data.wireguard.lastHandshakeAgeSec : null;
        tunnelPrivAddr = data.wireguard.tunnelPrivateAddress || '10.66.66.2';
      } else if (data.openvpn && data.openvpn.state === 'UP') {
        vpnProto = 'OPENVPN';
        vpnState = 'UP';
        vpnIf = data.openvpn.interfaceName || 'tun0';
        endpointFp = data.openvpn.endpointFingerprint || null;
        tunnelPrivAddr = data.openvpn.tunnelPrivateAddress || '10.67.67.2';
      } else if (data.vpn) {
        vpnProto = data.vpn.protocol || 'NONE';
        vpnState = data.vpn.state || 'DOWN';
        vpnIf = data.vpn.interfaceName || null;
        endpointFp = data.vpn.endpointFingerprint || null;
        handshakeAge = data.vpn.lastHandshakeAgeSec || null;
        tunnelPrivAddr = data.vpn.tunnelPrivateAddress || null;
      }

      // Kill Switch state
      let ksState = 'UNKNOWN';
      let ksEvidence = [];
      if (data.killSwitch) {
        ksState = data.killSwitch.state || 'UNKNOWN';
        ksEvidence = Array.isArray(data.killSwitch.evidence) ? data.killSwitch.evidence : [];
      }

      // Route state
      const defaultGatewayViaOpal = Boolean(data.route && data.route.defaultGatewayViaOpal !== false);
      const vpnDefaultRoutePresent = data.route ? Boolean(data.route.vpnDefaultRoutePresent) : (vpnState === 'UP');
      const directWanBypassDetected = data.route ? Boolean(data.route.directWanBypassDetected) : false;

      // DNS
      const dnsState = (data.dns && data.dns.state) ? data.dns.state : (vpnState === 'UP' ? 'VPN_BOUND' : 'UNKNOWN');

      // IPv6
      const ipv6State = (data.ipv6 && data.ipv6.state) ? data.ipv6.state : (data.ipv6Disabled ? 'DISABLED' : 'UNVERIFIED');

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
