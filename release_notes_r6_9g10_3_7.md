# XPIDER AutoForm Sender Pro — R6.9G.10.3.7 Physical Router Security Gate Release Notes

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive Comment #6098509260)
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `d9701fcf8121948dd163f1e56110e5f2a9f917c3` (`d9701fcf`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `47ee3ba29f055f86a889bac11ecad82db1558725`
- **Release Tag Lineage**: Directly bound to commit on `upgrade/phase-0-1`.
- **Release Tag**: `v6.9g.10.3-audit.7`

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,376,748 bytes
   - SHA-256: `ce5b2aa7ad423c08b0b818c23d66b49687364e9a36228f8da520ebf862234803`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build
     - `companion/`: Windows Privacy Relay companion service with Physical Router Security Gate (`physical-gate.js`, `router-attestation.js`, router drivers for GL.iNet Opal and OpenWrt, Windows route inspector)
     - `infra/`: Production VPS egress templates (`wg0.conf.template`, `openvpn-server.conf.template`, `squid.conf.template`, `firewall-nftables.conf.template`, `unbound.conf.template`, `verify.sh`, `healthcheck.sh`, `install.sh`, `uninstall.sh`)
     - `router/`: Hardware router telemetry & installation scripts (`xpider-router-attest.sh`, `install-opal-attestation.sh`, `uninstall-opal-attestation.sh`)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_7_real_runtime_traces.log`
   - Size: 10,533 bytes
   - SHA-256: `4164226c2f0cde62f4004a29b96d0092e076654a7f43667482af59798435b6ef`

---

### Core Architecture & Remediations Implemented (R6.9G.10.3.7)

1. **10-Layer Physical Security Gate & Fail-Closed Aggregation (`companion/physical-gate.js`)**:
   - `Layer 1: Router Identity & Attestation`: Hardware fingerprint match, firmware integrity, non-default credentials.
   - `Layer 2: Local Opal Path & Default Route`: Host default gateway points strictly to Opal LAN (`192.168.8.1` / `/24`).
   - `Layer 3: Tunnel Protocol & State Verification`: Active WireGuard primary (`wgclient`, `10.66.66.0/24`) or OpenVPN fallback (`tun0`, `10.67.67.0/24`).
   - `Layer 4: Hardware Router Kill-Switch Enforcement`: Rejects any state other than `ENFORCED`.
   - `Layer 5: Private-Only Egress Node Scope`: In physical gate mode, egress node host must reside in RFC1918 private subnets (`10.`, `192.168.`, `172.16.`) or loopback. Public WAN proxies strictly rejected.
   - `Layer 6: VPS Canary & Path Continuity`: Real end-to-end HTTP egress canary roundtrip verification.
   - `Layer 7: Egress Identity & Sticky Fingerprint Matching`: Stable VPS egress node fingerprinting.
   - `Layer 8: Strict DNS Leak Prevention`: Router DNS bound strictly to internal VPN resolver (`10.66.66.1` / `10.67.67.1`).
   - `Layer 9: IPv6 Hard Block / Disabled`: IPv6 disabled or explicitly blocked.
   - `Layer 10: Direct WAN Route Leak Prevention`: Windows route table verified for zero direct WAN routes bypassing Opal interface.

2. **Hardware Router Drivers & Attestation (`companion/router-drivers/`)**:
   - `glinet-opal.js`: GL-SFT1200 driver reading `/api/xpider/attest` telemetry, verifying WireGuard and OpenVPN states, and computing SHA-256 hardware fingerprints.
   - `openwrt-readonly.js`: Generic OpenWrt read-only driver with `/etc/config` parsing and UCI fallback.
   - `router-attestation.js`: Hardware Router Attestation Manager with DPAPI encrypted credential caching and configurable router attestation port.

3. **Production VPS Egress Infrastructure (`infra/vps-egress/`)**:
   - `wg0.conf.template`: WireGuard UDP/51820 server configuration (`10.66.66.1/24`).
   - `openvpn-server.conf.template`: OpenVPN TCP/443 server configuration (`10.67.67.1/24`) for restrictive network circumvention.
   - `squid.conf.template`: Private Squid HTTP CONNECT proxy (`:3128`) bound strictly to VPN subnets (`10.66.66.0/24`, `10.67.67.0/24`) with all public WAN requests forbidden.
   - `firewall-nftables.conf.template`: nftables rules isolating proxy traffic strictly to VPN interfaces.
   - `unbound.conf.template`: Local validating recursive DNS resolver bound strictly to VPN clients.
   - `verify.sh` & `healthcheck.sh`: Automated configuration validation and active health probes.

4. **Companion & Extension Integration**:
   - `privacy-relay-service.js`: Added endpoints `GET /physical-gate/status`, `POST /physical-gate/enable`, `POST /physical-gate/verify`, and `POST /physical-gate/pair`. Strict physical gate precedence enforced before `relayReady` in HTTP/HTTPS and CONNECT proxy handlers.
   - `send_message_backup/background.js`: `assertPhysicalGateReady(context)` prepended inside `assertPrivacyTransportReady(context)`.
   - `send_message_backup/modules/privacy-gateway.js`: Memory-only token auto-retrieval and physical gate control methods.
   - `send_message_backup/popup.html` & `popup.js`: Added `🛡️ PHYSICAL ROUTER GATE` card with toggle, live 10-layer status breakdown, Re-Verify, and Pair actions.

---

### Verification Summary

1. **Unit Test Suite (`test_r6_9g10_3_7_physical_gate.js`)**: **15/15 PASS**
   - Scenario A: Router Identity Mismatch -> Fail-Closed — **PASS**
   - Scenario B: Windows Default Route Bypasses Opal -> Fail-Closed — **PASS**
   - Scenario C: Windows Direct Bypass Route Present -> Fail-Closed — **PASS**
   - Scenario D: WireGuard Tunnel DOWN -> Fail-Closed — **PASS**
   - Scenario E: WireGuard DOWN, OpenVPN Fallback UP -> PASS — **PASS**
   - Scenario F: Opal Kill-Switch DISABLED -> Fail-Closed — **PASS**
   - Scenario G: Opal Kill-Switch UNKNOWN -> Fail-Closed — **PASS**
   - Scenario H: Opal Kill-Switch ENFORCED -> PASS — **PASS**
   - Scenario I: Public Proxy Host Used -> Fail-Closed — **PASS**
   - Scenario J: Private RFC1918 Proxy Host (10.66.66.1:3128) -> PASS — **PASS**
   - Scenario K: Companion Relay Blocks HTTP & CONNECT when Gate Fails — **PASS**
   - Scenario L: VPS Egress WireGuard & OpenVPN & Squid Configuration Templates Integrity — **PASS**
   - Scenario M: Extension assertPhysicalGateReady Blocks Network Side Effects — **PASS**
   - Scenario N: Extension assertPhysicalGateReady Passes When All Layers Pass — **PASS**
   - Scenario O: Physical Gate Disabled -> Legacy Transport Allowed — **PASS**

2. **Real Microsoft Edge Operator Audit (`run_real_r6_9g10_3_7_edge_operator_audit.js`)**: **100% PASS (Exit Code 0)**
   - Scenario 1: Initial state -> Physical Gate DISABLED -> legacy transport pass — **PASS**
   - Scenario 2: Enable Physical Gate -> router unverified/disconnected -> immediate FAIL-CLOSED (badge red, network blocked with 502 `PHYSICAL_GATE_FAIL_CLOSED`) — **PASS**
   - Scenario 3: Reject public proxy in Physical Gate mode (`PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE`) — **PASS**
   - Scenario 4: Router pairing & WireGuard primary telemetry -> all 10 layers pass -> authoritative `READY (ENFORCED)` — **PASS**
   - Scenario 5: WireGuard failover to OpenVPN fallback (`tun0`, TCP/443) -> remains `READY (ENFORCED)` under fallback tunnel — **PASS**
   - Scenario 6: Kill-Switch tampered / `DISABLED` -> immediate FAIL-CLOSED (badge red, traffic dropped) — **PASS**
   - Scenario 7: Clean uninstall via extracted `uninstall_companion.bat --silent` -> registry cleaned, daemon stopped — **PASS**
