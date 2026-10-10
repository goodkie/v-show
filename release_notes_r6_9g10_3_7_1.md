# XPIDER AutoForm Sender Pro — R6.9G.10.3.7.1 Trusted Physical Attestation Release Notes

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive & Audit Comment #6100603590)
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `9e5f7ca8365abb3930d30994cb64994a370fcf7c` (`9e5f7ca8`)
- **Provenance Seal**: `d15cb0c26b92af9083ed5c30d8109e91aacfa288` (`d15cb0c2`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `d9701fcf8121948dd163f1e56110e5f2a9f917c3` (`d9701fcf`)
- **Build ID**: `R6.9G.10.3.7.1-20261010-TRUSTED-PHYSICAL-FRESHNESS-OPAL-SEALED`
- **Release Tag**: `v6.9g.10.3-audit.7.1`

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,381,271 bytes
   - SHA-256: `af2cc4cf064ee99e34d00320ba6197bf0b11a7f9f900d95845191992efddab15`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build
     - `companion/`: Windows Privacy Relay companion service with Physical Router Security Gate (`physical-gate.js`, `router-attestation.js`, router drivers for GL.iNet Opal and OpenWrt, Windows route inspector without test backdoors)
     - `infra/`: Production VPS egress templates (`wg0.conf.template`, `openvpn-server.conf.template`, `squid.conf.template`, `firewall-nftables.conf.template`, `unbound.conf.template`, `verify.sh`, `healthcheck.sh`, `install.sh`, `uninstall.sh`)
     - `router/`: Hardware router telemetry & installation scripts (`xpider-router-attest.sh`, `install-opal-attestation.sh`, `uninstall-opal-attestation.sh`)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_7_1_real_runtime_traces.log`
   - Size: 8,289 bytes
   - SHA-256: `eb73e00d59b185b60b27aa3b2f9515ed5ef4cf817f94a12d20bc600f147895d6`

---

### Core Architecture & Remediations Implemented (R6.9G.10.3.7.1)

1. **Strict Provenance Boundary Preservation (Blocker 1)**:
   - Zero runtime code changes following the provenance stamp commit (`d15cb0c2`). All drivers, gates, route inspectors, and test fixtures were committed strictly inside functional commit `9e5f7ca8`.
   - Release package was compiled and verified before release docs commit.

2. **Elimination of Mock Route Backdoor & Real Route Inspection (Blocker 2 & 9)**:
   - Completely purged `mock_routes.json` and `XPIDER_MOCK_ROUTES_JSON` from `companion/windows-network-attestation.js`.
   - Host route inspection now truthfully interrogates Windows routing table for IPv4 and IPv6 default routes (`Get-NetRoute -DestinationPrefix '0.0.0.0/0'` and `'::/0'`). Any non-Opal default gateway immediately fails closed regardless of metric.

3. **Restricted Forced-Command SSH & Real Opal Telemetry (Blockers 3 & 5)**:
   - Installed OpenWrt router agent (`router/opalintegrity/xpider-router-attest.sh`) reports genuine system telemetry: real `wg show latest-handshakes` epoch calculation, real interface operational states, OpenVPN routing table verification, and real UCI killswitch enforcement.
   - Opal driver (`companion/router-drivers/glinet-opal.js`) supports restricted forced-command SSH transport alongside HTTP, enforcing WireGuard handshake age <= 180s and OpenVPN `tun0` route presence.

4. **Cryptographic Fingerprint Pinning & TOFU Enforcement (Blocker 4)**:
   - `RouterAttestationManager` (`companion/router-attestation.js`) rejects null expected fingerprints in paired mode. Trust-On-First-Use (TOFU) explicitly queries and pins the router's hardware fingerprint on first pairing into `router_pairing_config.json`.

5. **Freshness Gate & Background Attestation Monitor (Blocker 6)**:
   - Enforced 30,000ms freshness TTL in `companion/physical-gate.js`. Stale attestation results immediately transition gate to `ready = false` with `PHYSICAL_GATE_STALE`.
   - Active background monitor continuously evaluates gate state every 15,000ms and synchronously revokes readiness upon any network drift or cable disconnection.
   - Privacy relay service (`companion/privacy-relay-service.js`) checks `isFresh()` on every HTTP and CONNECT proxy request.

6. **Strict RFC1918 Private Subnet Enforcement (Blocker 7)**:
   - Fixed parser bounds for RFC1918 private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`). Public WAN proxies cannot bypass private filtering using boolean flags like `privateOnly: true`.

7. **Mandatory VPS Egress Fingerprint Pinning (Blocker 8)**:
   - In physical gate mode, egress nodes must possess a non-null cryptographic fingerprint. In failover scenarios (WireGuard to OpenVPN), fallback node must match the pinned fingerprint identity.

8. **Deterministic VPS verify.sh Script (Blocker 10)**:
   - `infra/vps-egress/verify.sh` fails closed with `FAIL_HOLD` if the public IP cannot be resolved, preventing false-pass assertions. Added deterministic Squid socket bind checks.

9. **Real Microsoft Edge Operator Audit Suite (Blocker 11)**:
   - `run_real_r6_9g10_3_7_1_edge_operator_audit.js` verified 100% PASS in real Microsoft Edge via CDP without mock route files, demonstrating genuine fail-closed behavior on live host network routes.
