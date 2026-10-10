/**
 * physical-gate.js
 * 
 * Physical Router Security Gate Aggregator (Issue #6 R6.9G.10.3.7.1).
 * Evaluates all 10 mandatory hardware and transport security invariants:
 * L1 Browser Proxy -> L2 Privacy Relay -> L3 Windows Route -> L4 Opal VPN ->
 * L5 Opal Kill Switch -> L6 Private Proxy -> L7 Egress Fingerprint -> L8 Zero Direct Bypass.
 * 
 * Strict Fail-Closed Invariants:
 * ready = enabled && routerIdentityPass && opalPathPass && tunnelPass && killSwitchPass
 *         && privateProxyPass && egressCanaryPass && egressFingerprintPass && dnsPass
 *         && ipv6PassOrDisabled && directBypassBlocked && isFresh()
 * No best-effort READY. No "mostly protected" READY. No stale READY.
 */

const net = require('net');
const { RouterAttestationManager } = require('./router-attestation');
const { WindowsNetworkAttestation } = require('./windows-network-attestation');

/**
 * Validates strict RFC1918 private IPv4 CIDR blocks:
 * - 10.0.0.0/8 (10.0.0.0 – 10.255.255.255)
 * - 172.16.0.0/12 (172.16.0.0 – 172.31.255.255)
 * - 192.168.0.0/16 (192.168.0.0 – 192.168.255.255)
 */
function isRfc1918(ip) {
  if (typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  if (net.isIP(trimmed) !== 4) return false;
  const parts = trimmed.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

class PhysicalGate {
  constructor(options = {}) {
    this.routerAttestation = options.routerAttestation || new RouterAttestationManager();
    this.windowsAttestation = options.windowsAttestation || new WindowsNetworkAttestation();
    this.enabled = Boolean(options.enabled);
    this.physicalGateTtlMs = options.physicalGateTtlMs || 30000; // 30s bounded freshness TTL
    this.allowLoopbackProxy = Boolean(options.allowLoopbackProxy); // Explicit test fixture flag only
    this.pinnedEgressFingerprint = options.pinnedEgressFingerprint || null;
    this.monitorInterval = null;
    this.state = this.getInitialState();
  }

  getInitialState() {
    return {
      enabled: this.enabled,
      routerIdentityPass: false,
      opalPathPass: false,
      tunnelPass: false,
      killSwitchPass: false,
      privateProxyPass: false,
      egressCanaryPass: false,
      egressFingerprintPass: false,
      dnsPass: false,
      ipv6PassOrDisabled: false,
      directBypassBlocked: false,
      ready: false,
      vpnProtocol: 'NONE',
      observedRouterFingerprint: null,
      observedEgressFingerprint: null,
      reasons: [],
      lastEvaluatedAt: 0
    };
  }

  /**
   * Asserts whether the gate's READY state is strictly within the freshness TTL.
   */
  isFresh(now = Date.now()) {
    if (!this.enabled) return false;
    if (!this.state.ready) return false;
    const age = now - (this.state.lastEvaluatedAt || 0);
    return age >= 0 && age <= this.physicalGateTtlMs;
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    this.state.enabled = this.enabled;
    if (!this.enabled) {
      this.state.ready = false;
      this.state.reasons = ['PHYSICAL_GATE_DISABLED'];
      this.stopMonitor();
    }
    return this.state;
  }

  /**
   * Starts periodic attestation monitor while campaign or relay is active.
   * Revokes READY synchronously before re-evaluation.
   */
  startMonitor(intervalMs = 15000, activeNodeProvider = null, verifyCanaryFn = null) {
    this.stopMonitor();
    this.monitorInterval = setInterval(async () => {
      try {
        const node = typeof activeNodeProvider === 'function' ? activeNodeProvider() : null;
        await this.evaluate(node, verifyCanaryFn);
      } catch (err) {
        this.state.ready = false;
        this.state.reasons = [`MONITOR_EXCEPTION: ${err.message}`];
      }
    }, intervalMs);
    if (this.monitorInterval.unref) {
      this.monitorInterval.unref();
    }
  }

  stopMonitor() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Evaluates the entire physical security gate.
   * @param {Object} activeNode - Currently active proxy egress node in Privacy Relay
   * @param {Function} verifyCanaryFn - Function to probe egress canary through active node
   */
  async evaluate(activeNode = null, verifyCanaryFn = null) {
    const evaluatedAt = Date.now();
    const reasons = [];

    if (!this.enabled) {
      this.state = {
        ...this.getInitialState(),
        enabled: false,
        ready: false,
        reasons: ['PHYSICAL_GATE_DISABLED'],
        lastEvaluatedAt: evaluatedAt
      };
      return this.state;
    }

    // 1. Router Attestation (Blocker 3, 4, 5)
    const routerData = await this.routerAttestation.attestRouter();
    const routerIdentityPass = Boolean(routerData.reachable && routerData.identityVerified);
    if (!routerIdentityPass) {
      reasons.push(routerData.reachable ? 'ROUTER_IDENTITY_MISMATCH' : 'ROUTER_UNREACHABLE');
    }

    // 2. Windows Route & Adapter Attestation (Blocker 2, 9)
    const windowsData = await this.windowsAttestation.attest(routerData.lanGateway || '192.168.8.1');
    const opalPathPass = Boolean(windowsData.opalPathPass);
    if (!opalPathPass) {
      reasons.push(windowsData.reason || 'WINDOWS_DEFAULT_ROUTE_NOT_VIA_OPAL');
    }

    const directBypassBlocked = Boolean(windowsData.directBypassBlocked);
    if (!directBypassBlocked) {
      reasons.push(windowsData.reason || 'WINDOWS_DIRECT_BYPASS_ROUTE_PRESENT');
    }

    // 3. Opal VPN Tunnel Attestation (Blocker 5)
    const tunnelPass = Boolean(routerData.vpn && routerData.vpn.state === 'UP');
    if (!tunnelPass) {
      reasons.push(routerData.vpn ? `VPN_TUNNEL_DOWN (${routerData.vpn.protocol})` : 'VPN_TUNNEL_STATE_UNKNOWN');
    }

    // 4. Opal Kill Switch Attestation (Blocker 5)
    // Strict production invariant: state MUST be 'ENFORCED'
    const killSwitchPass = Boolean(routerData.killSwitch && routerData.killSwitch.state === 'ENFORCED');
    if (!killSwitchPass) {
      reasons.push(routerData.killSwitch ? `KILL_SWITCH_${routerData.killSwitch.state}` : 'KILL_SWITCH_UNVERIFIED');
    }

    // 5. DNS Attestation (Blocker 5)
    const dnsPass = Boolean(routerData.dns && routerData.dns.state === 'VPN_BOUND');
    if (!dnsPass) {
      reasons.push('DNS_NOT_VPN_BOUND');
    }

    // 6. IPv6 State (Blocker 5, 9)
    const ipv6State = routerData.ipv6 ? routerData.ipv6.state : windowsData.ipv6State;
    const ipv6PassOrDisabled = (ipv6State === 'DISABLED' || ipv6State === 'VPN_BOUND');
    if (!ipv6PassOrDisabled) {
      reasons.push(`IPV6_LEAK_RISK (${ipv6State})`);
    }

    // 7. Private Proxy & RFC1918 Binding (Blocker 7)
    let privateProxyPass = false;
    let egressCanaryPass = false;
    let egressFingerprintPass = false;
    let observedEgressFp = null;

    if (!activeNode) {
      reasons.push('NO_ACTIVE_EGRESS_NODE');
    } else {
      const hostIp = activeNode.host ? activeNode.host.trim() : '';
      const isLoopback = (hostIp === '127.0.0.1' || hostIp === 'localhost');
      const isRfc = isRfc1918(hostIp);

      if (isLoopback) {
        if (this.allowLoopbackProxy) {
          // Permitted strictly during offline unit/test-fixture runs
          privateProxyPass = true;
        } else {
          reasons.push('LOOPBACK_PROXY_FORBIDDEN_IN_PRODUCTION_PHYSICAL_GATE');
        }
      } else if (isRfc) {
        // Enforce transport binding:
        // WG tunnel -> 10.66.66.1:3128 / OPAL_WG
        // OpenVPN tunnel -> 10.67.67.1:3128 / OPAL_OVPN
        const vpnProto = routerData.vpn ? routerData.vpn.protocol : 'UNKNOWN';
        const nodeTransport = activeNode.transportBinding ||
          (hostIp.startsWith('10.66.') ? 'OPAL_WG' : (hostIp.startsWith('10.67.') ? 'OPAL_OVPN' : null));

        if (vpnProto === 'WIREGUARD' && nodeTransport && nodeTransport !== 'OPAL_WG') {
          reasons.push(`TRANSPORT_BINDING_MISMATCH: Tunnel is WIREGUARD but proxy node is bound to ${nodeTransport}`);
        } else if (vpnProto === 'OPENVPN' && nodeTransport && nodeTransport !== 'OPAL_OVPN') {
          reasons.push(`TRANSPORT_BINDING_MISMATCH: Tunnel is OPENVPN but proxy node is bound to ${nodeTransport}`);
        } else {
          privateProxyPass = true;
        }
      } else {
        // Metadata alone (privateOnly: true) can NEVER bypass network topology validation
        reasons.push('PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE');
      }

      // 8. Egress Canary & Mandatory Pinned Egress Fingerprint (Blocker 8)
      const expectedFp = activeNode.expectedEgressFingerprint || this.pinnedEgressFingerprint;
      if (!expectedFp) {
        reasons.push('PINNED_EGRESS_FINGERPRINT_MANDATORY_IN_PHYSICAL_GATE_MODE');
        egressFingerprintPass = false;
      } else if (this.pinnedEgressFingerprint && expectedFp !== this.pinnedEgressFingerprint) {
        reasons.push(`EGRESS_IDENTITY_MISMATCH: Fallback node expected ${expectedFp} does not match pinned ${this.pinnedEgressFingerprint}`);
        egressFingerprintPass = false;
      } else {
        if (typeof verifyCanaryFn === 'function') {
          try {
            const canaryRes = await verifyCanaryFn(activeNode);
            if (canaryRes && canaryRes.verified) {
              egressCanaryPass = true;
              observedEgressFp = activeNode.observedFingerprint || canaryRes.fingerprint || null;
              egressFingerprintPass = (observedEgressFp === expectedFp);
              if (!egressFingerprintPass) {
                reasons.push(`EGRESS_FINGERPRINT_MISMATCH: observed=${observedEgressFp} expected=${expectedFp}`);
              } else if (!this.pinnedEgressFingerprint) {
                this.pinnedEgressFingerprint = expectedFp;
              }
            } else {
              reasons.push(`EGRESS_CANARY_FAILED: ${canaryRes ? canaryRes.reason : 'PROBE_FAILED'}`);
            }
          } catch (cErr) {
            reasons.push(`EGRESS_CANARY_ERROR: ${cErr.message}`);
          }
        } else if (activeNode.lastHealth === 'HEALTHY' && activeNode.observedFingerprint) {
          egressCanaryPass = true;
          observedEgressFp = activeNode.observedFingerprint;
          egressFingerprintPass = (observedEgressFp === expectedFp);
          if (!egressFingerprintPass) {
            reasons.push(`EGRESS_FINGERPRINT_MISMATCH: observed=${observedEgressFp} expected=${expectedFp}`);
          } else if (!this.pinnedEgressFingerprint) {
            this.pinnedEgressFingerprint = expectedFp;
          }
        } else {
          reasons.push('EGRESS_CANARY_UNVERIFIED');
        }
      }
    }

    // Evaluate Strict READY Equation
    const ready =
      this.enabled &&
      routerIdentityPass &&
      opalPathPass &&
      tunnelPass &&
      killSwitchPass &&
      privateProxyPass &&
      egressCanaryPass &&
      egressFingerprintPass &&
      dnsPass &&
      ipv6PassOrDisabled &&
      directBypassBlocked;

    this.state = {
      enabled: this.enabled,
      routerIdentityPass,
      opalPathPass,
      tunnelPass,
      killSwitchPass,
      privateProxyPass,
      egressCanaryPass,
      egressFingerprintPass,
      dnsPass,
      ipv6PassOrDisabled,
      directBypassBlocked,
      ready,
      vpnProtocol: routerData.vpn ? routerData.vpn.protocol : 'UNKNOWN',
      observedRouterFingerprint: routerData.routerFingerprint || null,
      observedEgressFingerprint: observedEgressFp,
      reasons,
      lastEvaluatedAt: evaluatedAt
    };

    return this.state;
  }
}

module.exports = {
  PhysicalGate,
  isRfc1918
};
