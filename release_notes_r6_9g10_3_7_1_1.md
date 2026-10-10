# XPIDER AutoForm Sender Pro — R6.9G.10.3.7.1.1 Real Pair Success + Physical Egress Enrollment Release Notes

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive & Audit Comment #6101382737)
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `af884086055d7f1d46f53416e91f0a2ba1a5e182` (`af884086`)
- **Provenance Seal**: `dcad9405f6393952f4c330f653a99268615b3c6d` (`dcad9405`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `9e5f7ca8365abb3930d30994cb64994a370fcf7c` (`9e5f7ca8`)
- **Build ID**: `R6.9G.10.3.7.1.1-20261010-REAL-PAIR-ENROLLMENT-REVOCATION-SEALED`
- **Release Tag**: `v6.9g.10.3-audit.7.1.1`

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,386,204 bytes
   - SHA-256: `93a68309b33b15d79e86c3ae953e4836bc3767e9554dafa31c48488aee9b4ff7`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build with Physical Gate UI controls (SSH Key generation, Egress enrollment, Transport binding selection, Identity group configuration)
     - `companion/`: Windows Privacy Relay companion service with Physical Router Security Gate (`physical-gate.js`, `router-attestation.js`, router drivers for GL.iNet Opal and OpenWrt, Windows route inspector)
     - `infra/`: Production VPS egress configuration templates (`wg0.conf.template`, `openvpn-server.conf.template`, `squid.conf.template`, `firewall-nftables.conf.template`, `unbound.conf.template`, `verify.sh`, `healthcheck.sh`, `install.sh`, `uninstall.sh`)
     - `router/`: Hardware router telemetry & installation scripts (`xpider-router-attest.sh`, `install-opal-attestation.sh`, `uninstall-opal-attestation.sh`)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_7_1_1_real_runtime_traces.log`
   - Size: 8,176 bytes
   - SHA-256: `4574c7a9c04a2115806225e2cab0970d82145065a9a428299265ae7e28604e58`

---

### Core Architecture & Remediations Implemented (R6.9G.10.3.7.1.1)

1. **Blocker 1 & 2: Pair Success Fail-Closed & Explicit Transport Persistence**:
   - `RouterAttestationManager.pairRouter` strictly enforces that pairing throws and never persists configuration if the router is unreachable or identity cannot be verified.
   - Pinned configuration explicitly persists `transport` (`http` or `ssh`), `sshPort`, and `sshUser` alongside the pinned fingerprint, avoiding ambiguous transport defaults.

2. **Blocker 3: Dedicated Ed25519 Pairing Key Generation & Forced-Command OpenSSH Export**:
   - Implemented `generatePairingKey()` and `getPublicKey()` in `RouterAttestationManager` using Ed25519 cryptography, protected under Windows DPAPI (`winsec.protectString`).
   - Exports authorized keys in restricted forced-command OpenSSH format:
     `command="/usr/bin/xpider-router-attest.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 ...`

3. **Blocker 4 & 5: Truthful Router Telemetry & Strict LAN-to-WAN Drop Killswitch**:
   - Removed hardcoded `defaultGatewayViaOpal: true` from `xpider-router-attest.sh`; now measured dynamically via kernel routing tables and DNS resolver bindings.
   - Killswitch status verifies truthful iptables/nftables drop rules preventing LAN-to-WAN unmetered leaks when VPN tunnels disconnect.

4. **Blocker 6 & 7: Physical Egress Enrollment & Transport Binding Verification**:
   - Added dedicated `/enroll-egress` API endpoint and Popup UI action to probe canary, pin expected fingerprint, and set `transportBinding` (`OPAL_WG` or `OPAL_OVPN`).
   - Physical Gate strictly checks that WireGuard tunnels route to `10.66.66.1:3128` with `transportBinding: 'OPAL_WG'` and OpenVPN tunnels route to `10.67.67.1:3128` with `transportBinding: 'OPAL_OVPN'`.
   - Mismatched identity groups (`egressIdentityGroup`) or arbitrary unapproved RFC1918 endpoints are immediately rejected with fail-closed 502 responses.

5. **Blocker 8: Mid-Run READY -> Drift -> Automatic Revocation**:
   - Background monitor evaluates router state without human intervention.
   - Introduced synchronous `isRevalidating` lock to prevent stale or in-flight evaluations from masquerading as healthy.
   - When WireGuard drops unexpectedly mid-run, gate automatically revokes READY status without requiring manual button clicks, dropping proxy traffic with `502 PHYSICAL_GATE_FAIL_CLOSED`.

6. **Blocker 9: Safe SSH Argument Vector & Input Validation**:
   - Replaced shell execution in GL.iNet driver with `execFileSync('ssh', args, ...)` argument vector.
   - Validates `routerIp` (strict IPv4), `sshPort` (integer 1-65535), and `sshUser` (alphanumeric identifier) against command injection vectors.

7. **Blocker 10: Strict Clean Uninstallation & Zero Residual Registrations**:
   - Extracted `uninstall_companion.bat` terminates background relay daemon, unregisters autostart VBS script, and deletes Native Messaging Host registry keys.
