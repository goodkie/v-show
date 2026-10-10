/**
 * physical-gate.js
 * 
 * Physical Router Security Gate Aggregator (Issue #6 R6.9G.10.3.7).
 * Evaluates all 10 mandatory hardware and transport security invariants:
 * L1 Browser Proxy -> L2 Privacy Relay -> L3 Windows Route -> L4 Opal VPN ->
 * L5 Opal Kill Switch -> L6 Private Proxy -> L7 Egress Fingerprint -> L8 Zero Direct Bypass.
 * 
 * Strict Fail-Closed Invariant:
 * ready = enabled && routerIdentityPass && opalPathPass && tunnelPass && killSwitchPass
 *         && privateProxyPass && egressCanaryPass && egressFingerprintPass && dnsPass
 *         && ipv6PassOrDisabled && directBypassBlocked
 * No best-effort READY. No "mostly protected" READY.
 */

const { RouterAttestationManager } = require('./router-attestation');
const { WindowsNetworkAttestation } = require('./windows-network-attestation');

class PhysicalGate {
  constructor(options = {}) {
    this.routerAttestation = options.routerAttestation || new RouterAttestationManager();
    this.windowsAttestation = options.windowsAttestation || new WindowsNetworkAttestation();
    this.enabled = Boolean(options.enabled);
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

  setEnabled(val) {
    this.enabled = Boolean(val);
    this.state.enabled = this.enabled;
    if (!this.enabled) {
      this.state.ready = false;
      this.state.reasons = ['PHYSICAL_GATE_DISABLED'];
    }
    return this.state;
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

    // 1. Router Attestation
    const routerData = await this.routerAttestation.attestRouter();
    const routerIdentityPass = Boolean(routerData.reachable && routerData.identityVerified);
    if (!routerIdentityPass) {
      reasons.push(routerData.reachable ? 'ROUTER_IDENTITY_MISMATCH' : 'ROUTER_UNREACHABLE');
    }

    // 2. Windows Route & Adapter Attestation
    const windowsData = await this.windowsAttestation.attest(routerData.lanGateway || '192.168.8.1');
    const opalPathPass = Boolean(windowsData.opalPathPass);
    if (!opalPathPass) {
      reasons.push(windowsData.reason || 'WINDOWS_DEFAULT_ROUTE_NOT_VIA_OPAL');
    }

    const directBypassBlocked = Boolean(windowsData.directBypassBlocked);
    if (!directBypassBlocked) {
      reasons.push(windowsData.reason || 'WINDOWS_DIRECT_BYPASS_ROUTE_PRESENT');
    }

    // 3. Opal VPN Tunnel Attestation
    const tunnelPass = Boolean(routerData.vpn && routerData.vpn.state === 'UP');
    if (!tunnelPass) {
      reasons.push(routerData.vpn ? `VPN_TUNNEL_DOWN (${routerData.vpn.protocol})` : 'VPN_TUNNEL_STATE_UNKNOWN');
    }

    // 4. Opal Kill Switch Attestation
    // Strict production invariant: state MUST be 'ENFORCED'
    const killSwitchPass = Boolean(routerData.killSwitch && routerData.killSwitch.state === 'ENFORCED');
    if (!killSwitchPass) {
      reasons.push(routerData.killSwitch ? `KILL_SWITCH_${routerData.killSwitch.state}` : 'KILL_SWITCH_UNVERIFIED');
    }

    // 5. DNS Attestation
    const dnsPass = Boolean(routerData.dns && routerData.dns.state === 'VPN_BOUND');
    if (!dnsPass) {
      reasons.push('DNS_NOT_VPN_BOUND');
    }

    // 6. IPv6 State
    const ipv6State = routerData.ipv6 ? routerData.ipv6.state : windowsData.ipv6State;
    const ipv6PassOrDisabled = (ipv6State === 'DISABLED' || ipv6State === 'VPN_BOUND');
    if (!ipv6PassOrDisabled) {
      reasons.push(`IPV6_LEAK_RISK (${ipv6State})`);
    }

    // 7. Private Proxy & RFC1918 Binding
    let privateProxyPass = false;
    let egressCanaryPass = false;
    let egressFingerprintPass = false;
    let observedEgressFp = null;

    if (!activeNode) {
      reasons.push('NO_ACTIVE_EGRESS_NODE');
    } else {
      // Must be marked privateOnly or bound to RFC1918 / VPN subnet
      const isPrivateHost = activeNode.privateOnly === true ||
        activeNode.host.startsWith('10.') ||
        activeNode.host.startsWith('192.168.') ||
        activeNode.host.startsWith('172.16.');

      if (!isPrivateHost) {
        reasons.push('PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE');
      } else {
        privateProxyPass = true;
      }

      // 8. Egress Canary & Fingerprint Verification
      if (typeof verifyCanaryFn === 'function') {
        try {
          const canaryRes = await verifyCanaryFn(activeNode);
          if (canaryRes && canaryRes.verified) {
            egressCanaryPass = true;
            observedEgressFp = activeNode.observedFingerprint || canaryRes.fingerprint || null;
            if (activeNode.expectedEgressFingerprint) {
              egressFingerprintPass = (observedEgressFp === activeNode.expectedEgressFingerprint);
              if (!egressFingerprintPass) reasons.push('EGRESS_FINGERPRINT_MISMATCH');
            } else {
              egressFingerprintPass = Boolean(observedEgressFp);
            }
          } else {
            reasons.push(`EGRESS_CANARY_FAILED: ${canaryRes ? canaryRes.reason : 'PROBE_FAILED'}`);
          }
        } catch (cErr) {
          reasons.push(`EGRESS_CANARY_ERROR: ${cErr.message}`);
        }
      } else if (activeNode.lastHealth === 'HEALTHY' && activeNode.observedFingerprint) {
        egressCanaryPass = true;
        egressFingerprintPass = true;
        observedEgressFp = activeNode.observedFingerprint;
      } else {
        reasons.push('EGRESS_CANARY_UNVERIFIED');
      }
    }

    // Evaluate READY Equation
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

module.exports = { PhysicalGate };
