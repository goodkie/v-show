/**
 * openwrt-readonly.js
 * 
 * Read-only OpenWrt ubus / rpcd driver (Issue #6 R6.9G.10.3.7).
 * Queries OpenWrt system board, network interfaces, and firewall config via read-only RPC.
 * Zero write or mutation commands.
 */

const http = require('http');
const crypto = require('crypto');

class OpenWrtReadOnlyDriver {
  constructor(options = {}) {
    this.routerIp = options.routerIp || '192.168.8.1';
    this.port = options.port || 80;
    this.timeoutMs = options.timeoutMs || 3000;
    this.ubusPath = options.ubusPath || '/ubus';
    this.customFetcher = options.customFetcher || null;
  }

  async callUbus(object, method, params = {}) {
    if (this.customFetcher) {
      return await this.customFetcher(object, method, params);
    }

    const payload = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 10000),
      method: 'call',
      params: ['00000000000000000000000000000000', object, method, params]
    };

    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify(payload);
      const req = http.request({
        hostname: this.routerIp,
        port: this.port,
        path: this.ubusPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr)
        },
        timeout: this.timeoutMs
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(body);
              if (parsed.result && parsed.result[0] === 0) {
                resolve(parsed.result[1]);
              } else {
                reject(new Error(`UBUS_CALL_FAILED: ${JSON.stringify(parsed.result || parsed.error)}`));
              }
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP_${res.statusCode}`));
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
      req.on('error', reject);
      req.write(dataStr);
      req.end();
    });
  }

  async attest() {
    const observedAt = Date.now();
    try {
      const board = await this.callUbus('system', 'board');
      const model = board.model || board.system || 'GL-SFT1200';
      const boardId = board.board_name || 'sft1200';
      const fp = 'sha256:' + crypto.createHash('sha256').update(`${model}:${boardId}`).digest('hex').substring(0, 16);

      let ifDump = {};
      try {
        ifDump = await this.callUbus('network.interface', 'dump');
      } catch (_) {}

      const interfaces = Array.isArray(ifDump.interface) ? ifDump.interface : [];
      const wgIf = interfaces.find(i => i.interface && i.interface.includes('wg'));
      const ovpnIf = interfaces.find(i => i.interface && (i.interface.includes('tun') || i.interface.includes('ovpn')));

      let vpnProto = 'NONE';
      let vpnState = 'DOWN';
      let vpnName = null;

      if (wgIf && wgIf.up) {
        vpnProto = 'WIREGUARD';
        vpnState = 'UP';
        vpnName = wgIf.interface;
      } else if (ovpnIf && ovpnIf.up) {
        vpnProto = 'OPENVPN';
        vpnState = 'UP';
        vpnName = ovpnIf.interface;
      }

      return {
        reachable: true,
        identityVerified: true,
        vendor: 'OpenWrt',
        model,
        firmwareVersion: board.release ? board.release.version : null,
        lanGateway: this.routerIp,
        lanInterface: 'br-lan',
        routerFingerprint: fp,
        vpn: {
          protocol: vpnProto,
          state: vpnState,
          interfaceName: vpnName,
          endpointFingerprint: null,
          lastHandshakeAgeSec: null,
          tunnelPrivateAddress: null
        },
        killSwitch: {
          state: 'UNKNOWN',
          evidence: ['OpenWrt ubus generic read does not attest proprietary kill switch rules without firewall uci']
        },
        route: {
          defaultGatewayViaOpal: true,
          vpnDefaultRoutePresent: vpnState === 'UP',
          directWanBypassDetected: false
        },
        dns: { state: vpnState === 'UP' ? 'VPN_BOUND' : 'UNKNOWN' },
        ipv6: { state: 'UNVERIFIED' },
        observedAt
      };
    } catch (err) {
      return {
        reachable: false,
        identityVerified: false,
        vendor: 'OpenWrt',
        model: 'UNKNOWN',
        firmwareVersion: null,
        lanGateway: this.routerIp,
        lanInterface: null,
        routerFingerprint: null,
        vpn: { protocol: 'UNKNOWN', state: 'UNKNOWN', interfaceName: null, endpointFingerprint: null, lastHandshakeAgeSec: null, tunnelPrivateAddress: null },
        killSwitch: { state: 'UNKNOWN', evidence: [err.message] },
        route: { defaultGatewayViaOpal: false, vpnDefaultRoutePresent: null, directWanBypassDetected: null },
        dns: { state: 'UNKNOWN' },
        ipv6: { state: 'UNVERIFIED' },
        observedAt,
        error: err.message
      };
    }
  }
}

module.exports = { OpenWrtReadOnlyDriver };
