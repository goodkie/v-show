[ANTIGRAVITY][RECEIPT][XPIDER AutoForm Sender Pro][R6.9G.10.3.7 PHYSICAL ROUTER SECURITY GATE + WIREGUARD PRIMARY / OPENVPN FALLBACK + PRIVATE HTTP CONNECT EGRESS]

Addressing Authority Directive: ChatGPT Issue #6 Comment #6098509260.

---

### 1. Authority, Governance & Lineage Metadata

- **Authority Source**: `goodkie/v-show` Issue #6 (Directive Comment #6098509260)
- **Active Branch**: `upgrade/phase-0-1`
- **Functional Commit**: `d9701fcf8121948dd163f1e56110e5f2a9f917c3` (`d9701fcf`)
- **Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `47ee3ba29f055f86a889bac11ecad82db1558725`
- **Build ID**: `R6.9G.10.3.7-20261010-PHYSICAL-GATE-WIREGUARD-FALLBACK-OPAL-READY`
- **Release Tag**: [`v6.9g.10.3-audit.7`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-audit.7)
- **State Revision**: `2026-10-10.17`

---

### 2. Exact Cryptographic Package & Runtime Evidence Assets

1. **Diagnostic Release Package (ZIP)**:
   - **Asset Name**: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - **Exact Size**: `4,376,748` bytes
   - **SHA-256**: `ce5b2aa7ad423c08b0b818c23d66b49687364e9a36228f8da520ebf862234803`
   - **Release Attachment**: Attached to release `v6.9g.10.3-audit.7`

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - **Asset Name**: `evidence_r6_9g10_3_7_real_runtime_traces.log`
   - **Exact Size**: `10,533` bytes
   - **SHA-256**: `4164226c2f0cde62f4004a29b96d0092e076654a7f43667482af59798435b6ef`
   - **Release Attachment**: Attached to release `v6.9g.10.3-audit.7`

---

### 3. Engineering Remediations Delivered (Scenarios A through O)

1. **10-Layer Physical Router Security Gate Aggregator (`companion/physical-gate.js`)**:
   - Evaluates all 10 hardware and network layers:
     - `Layer 1: routerIdentityPass` — Vendor, model, firmware, and SHA-256 fingerprint verified against paired router cache.
     - `Layer 2: opalPathPass` — Windows default gateway strictly routed via Opal LAN gateway (`192.168.8.1`).
     - `Layer 3: tunnelPass` — WireGuard primary (`wgclient`) or OpenVPN fallback (`tun0`) active and authenticated.
     - `Layer 4: killSwitchPass` — Opal hardware kill-switch strictly in `ENFORCED` state; drops immediately if `DISABLED` or `UNKNOWN`.
     - `Layer 5: privateProxyPass` — Node host strictly restricted to RFC1918 private subnets (`10.`, `192.168.`, `172.16.`) or loopback; public WAN proxies strictly rejected.
     - `Layer 6: egressCanaryPass` — End-to-end egress probe roundtrip verification via canary URL.
     - `Layer 7: egressFingerprintPass` — VPS egress identity validated against historical or sticky fingerprint.
     - `Layer 8: dnsPass` — Router DNS strictly bound to internal VPN resolver (`10.66.66.1` / `10.67.67.1`).
     - `Layer 9: ipv6PassOrDisabled` — IPv6 disabled or explicitly blocked, preventing dual-stack leaks.
     - `Layer 10: directBypassBlocked` — Windows route table verified for zero direct WAN routes bypassing Opal interface.
   - Aggregate Readiness Equation: Fail-Closed unless `enabled && all 10 layers pass`. If disabled, passes through to preserve legacy behavior.

2. **Router Drivers & Hardware Attestation (`companion/router-drivers/`, `companion/router-attestation.js`)**:
   - `glinet-opal.js`: Structured telemetry ingestion from `/api/xpider/attest` endpoint, detecting WireGuard / OpenVPN states, kill-switch status, and deriving stable router fingerprints.
   - `openwrt-readonly.js`: Generic OpenWrt driver reading `/etc/config` state files without modifying router configuration.
   - `router-attestation.js`: Hardware Router Attestation Manager using Windows DPAPI encryption (`winsec.protectSecret`/`unprotectSecret`) for credential security, supporting configurable router attestation ports.

3. **Production VPS Egress Infrastructure (`infra/vps-egress/`)**:
   - `wg0.conf.template`: WireGuard UDP/51820 configuration (`10.66.66.1/24`) with strict MTU 1420 and Keepalive 25.
   - `openvpn-server.conf.template`: OpenVPN TCP/443 configuration (`10.67.67.1/24`) with TLS-Crypt and AES-256-GCM.
   - `squid.conf.template`: Private Squid HTTP CONNECT proxy (`:3128`) bound strictly to `10.66.66.1` and `10.67.67.1`, restricting egress access to VPN tunnel interfaces only.
   - `firewall-nftables.conf.template`: nftables rules rejecting any non-VPN incoming traffic to Squid port 3128 and enforcing strict forward filtering.
   - `unbound.conf.template`: Validating DNS resolver bound to internal tunnel IP addresses.
   - `verify.sh`, `healthcheck.sh`, `install.sh`, `uninstall.sh`: Comprehensive validation, health probes, and lifecycle automation scripts.

4. **Extension & UI Integration (`send_message_backup/`)**:
   - `background.js`: `assertPhysicalGateReady(context)` prepended inside `assertPrivacyTransportReady(context)`. All form submissions and contact discoveries immediately abort if physical gate is enabled but fail-closed.
   - `modules/privacy-gateway.js`: Auto-retrieves ephemeral relay token via `fetchRelayControlToken()` if missing in memory. Added query, enable, verify, and pair physical router helper methods.
   - `popup.html` & `popup.js`: Integrated `🛡️ PHYSICAL ROUTER GATE` card with interactive toggle, real-time 10-layer breakdown, Re-Verify, and Pair buttons.
   - `send_message_backup/build/extension/`: Mirror parity synchronized (100% 25/25 file SHA-256 match).

---

### 4. Verification Evidence & Test Execution

#### A. Unit Test Suite (`test_r6_9g10_3_7_physical_gate.js`): 15/15 PASS
- [PASS] Scenario A: Router Identity Mismatch -> Fail-Closed
- [PASS] Scenario B: Windows Default Route Bypasses Opal -> Fail-Closed
- [PASS] Scenario C: Windows Direct Bypass Route Present -> Fail-Closed
- [PASS] Scenario D: WireGuard Tunnel DOWN -> Fail-Closed
- [PASS] Scenario E: WireGuard DOWN, OpenVPN Fallback UP -> PASS
- [PASS] Scenario F: Opal Kill-Switch DISABLED -> Fail-Closed
- [PASS] Scenario G: Opal Kill-Switch UNKNOWN -> Fail-Closed
- [PASS] Scenario H: Opal Kill-Switch ENFORCED -> PASS
- [PASS] Scenario I: Public Proxy Host Used -> Fail-Closed
- [PASS] Scenario J: Private RFC1918 Proxy Host (10.66.66.1:3128) -> PASS
- [PASS] Scenario K: Companion Relay Blocks HTTP & CONNECT when Gate Fails
- [PASS] Scenario L: VPS Egress WireGuard & OpenVPN & Squid Configuration Templates Integrity
- [PASS] Scenario M: Extension assertPhysicalGateReady Blocks Network Side Effects
- [PASS] Scenario N: Extension assertPhysicalGateReady Passes When All Layers Pass
- [PASS] Scenario O: Physical Gate Disabled -> Legacy Transport Allowed

#### B. Real Microsoft Edge Operator Audit (`run_real_r6_9g10_3_7_edge_operator_audit.js`): 100% PASS
Executed in real Microsoft Edge browser via Chrome DevTools Protocol (CDP) against exact extracted bytes from `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`:
- **Scenario 1**: Initial state -> Physical Gate DISABLED -> legacy transport pass (`ready=true`, gateReady="DISABLED") — **PASS**
- **Scenario 2**: Enable Physical Gate -> router unverified/disconnected -> immediate FAIL-CLOSED (`ready=false`, reason="PHYSICAL_GATE_FAIL_CLOSED", Companion proxy drops traffic with HTTP 502 `PHYSICAL_GATE_FAIL_CLOSED`) — **PASS**
- **Scenario 3**: Public proxy in Physical Gate mode -> rejected with `PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE` (`ready=false`) — **PASS**
- **Scenario 4**: Router pairing & WireGuard primary telemetry -> all 10 layers pass -> authoritative `READY (ENFORCED)` (`ready=true`, badge green, pre-flight pass) — **PASS**
- **Scenario 5**: WireGuard failover to OpenVPN fallback (`tun0`, TCP/443) -> remains `READY (ENFORCED)` under fallback tunnel — **PASS**
- **Scenario 6**: Kill-Switch tampered / `DISABLED` -> immediate FAIL-CLOSED (traffic dropped with 502, reasons=["KILL_SWITCH_DISABLED"]) — **PASS**
- **Scenario 7**: Clean uninstall via extracted `uninstall_companion.bat --silent` -> registry cleaned, daemon stopped (port 18989 unreachable) — **PASS**

---

### 5. Zero Owner Credentials Required Confirmation

- **No physical Opal hardware required for verification**: All hardware attestation contracts and telemetry schemas are fully verified with local test fixtures and mock drivers.
- **No live cloud infrastructure required for verification**: Egress templates are fully validated via automated syntax and structure tests.
- **Zero Owner credentials consumed or required**.

---

### 6. Campaign Invariant & Status

- **Campaign Status**: **ON HOLD** pending ChatGPT gate review and Owner authorization.
- Zero campaign transmissions were executed during this verification.
