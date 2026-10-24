# XPIDER Opal Router Minimal Owner-Assisted Pairing Gate

**PROJECT**: XPIDER AutoForm Sender Pro  
**AUTHORITY**: Issue #6 Comment #6382911314  
**TARGET RELEASE**: RC3.50  
**STRICT INVARIANT**: Preserve existing proxy (143.198.40.33:8443); zero hardcoded SSH keys; zero private key disclosure across chat/external channels.

---

## 1. The ONE Required Owner Authentication/Physical Action

The Owner performs **exactly ONE single execution action** via the web console:

1. **Navigate**: Open [DigitalOcean Web Console](https://cloud.digitalocean.com/) → Droplets → `611293905` → **Access** → **Launch Droplet Console**.
2. **Execute**: Paste and run the verified 3-step script pinned to immutable SHA256:
   ```bash
   curl -fsSL "https://raw.githubusercontent.com/goodkie/v-show/6a7a786eddf5aba531b8e12f0823875ec277d776/companion/wireguard/setup_wireguard.sh" -o /tmp/setup_wireguard.sh
   echo "7e4eeb91f5c393c7f30babba837c110ca7e5b22f32cdb77d1b29d67fc861826b  /tmp/setup_wireguard.sh" | sha256sum -c -
   bash /tmp/setup_wireguard.sh --install
   ```
3. **Observe**: The console outputs the client profile text and a QR code for GL.iNet Opal. The Owner either scans the QR code or copies the config block into `http://192.168.8.1` (VPN → WireGuard Client).

> [!NOTE]
> No private keys, PAT tokens, or SSH keys are sent across chat or Antigravity sessions. All key generation happens locally inside the disposable server memory.

---

## 2. How Antigravity Resumes Autonomously After Completion

Upon completion of the Owner action, Antigravity resumes automatically without human prompting:

1. **Telemetry Polling**:
   Antigravity calls the companion endpoint:
   `GET http://127.0.0.1:18989/egress/wireguard-status`
   The companion checks for active WireGuard connectivity and UDP 51820 packets.
2. **Egress Handshake Verification**:
   When the tunnel comes up, Antigravity verifies:
   - Public IP matches the droplet egress.
   - Fail-closed killswitch is enforced if the tunnel drops.
   - Primary 8443 proxy remains 100% operational as a redundant or independent path.
3. **Evidence Collection**:
   Antigravity records redacted handshake metadata (peer public key prefix, rx/tx bytes) into `evidence/opal_pairing/` and posts the completion receipt to Issue #6.

---

## 3. Strict Boundary & Assertion Matrix

| Security / Functional Gate | Verification Status | Verification Method |
| :--- | :--- | :--- |
| WireGuard Server Script & Snapshot Restore | **VERIFIED (100% PASS)** | Offline unit/integration test suite (`test_wireguard_teardown_restore_safety.js`) |
| Production 8443 Egress Proxy | **VERIFIED (100% HEALTHY)** | Real HTTP/2 CONNECT checks against `143.198.40.33:8443` (Untouched) |
| Native Host Windows Registry & Stdio E2E | **VERIFIED (100% PASS)** | Real registry install/uninstall/reinstall test (`test_native_host_isolated_real_registry_e2e.js`) |
| Physical Opal WireGuard Handshake | **UNVERIFIED** | Awaiting physical GL.iNet Opal router link |
| Hardware DNS Leak Protection | **UNVERIFIED** | Awaiting physical packet capture through Opal interface |
| Hardware Kill-Switch Enforcement | **UNVERIFIED** | Awaiting physical WAN disconnect test |
| Residential Proxy Status | **CONFIG_REQUIRED** | Fail-closed enforced (0 direct leak bytes) |
