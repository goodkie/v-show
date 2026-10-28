# XPIDER Opal Router Minimal Owner-Assisted Pairing Gate & Safety Preconditions

**PROJECT**: XPIDER AutoForm Sender Pro  
**AUTHORITY**: Issue #6 Comment #6383382800  
**TARGET RELEASE**: RC3.50  
**STRICT INVARIANTS**:
1. Preserve existing production proxy (`143.198.40.33:8443`) untouched.
2. Droplet SSH port 22 remains BLOCKED by internal host UFW & wiped authorized_keys.
3. Zero hardcoded SSH keys or credentials across chat/external channels.
4. Physical WireGuard handshake, hardware DNS leak protection, and killswitch remain strictly marked **`UNVERIFIED`**.
5. Residential proxy remains strictly **`CONFIG_REQUIRED`** fail-closed.

---

## 1. Safety Gate: Preconditions Required Before Server WG Installation

Per Owner PM Directive #6383382800, Antigravity **does NOT request the Owner to run the server WireGuard installer merely because the script checksum matches**. The following verified preconditions must be confirmed prior to executing any server installation:

### A. Console Authentication: Explicit Distinction (Evidence vs Documented Prerequisite)
> [!IMPORTANT]
> **CRITICAL GATE DISTINCTION**:
> - **Current Status**: DigitalOcean Web Console interactive root access is strictly a **DOCUMENTED PREREQUISITE**. It has **NOT** been empirically demonstrated with live session transcripts or console capture evidence in this session.
> - **Execution Suspension**: As an absolute safety constraint, **NO server installer instructions or execution requests are issued to the Owner** until:
>   1. Safe console root recovery is verified and confirmed by the Owner.
>   2. Complete server snapshot and rollback teardown preconditions are acknowledged.
>   3. Physical router readiness is confirmed.
>
> Server installer execution instructions remain completely dormant and suspended until these preconditions transition from documented to demonstrated.

### B. Server Baseline Snapshot & Rollback Precondition
- **Requirement**: Before modifying UFW or sysctl on the server, a pristine snapshot must be recorded, and the rollback path must be provably safe.
- **Pre-Execution Baseline Snapshot**:
  `setup_wireguard.sh --install` captures `/etc/xpider/wireguard_system_snapshot.json` containing initial UFW status, iptables NAT tables, and sysctl `net.ipv4.ip_forward` settings.
- **Immediate Rollback Guarantee**:
  If pairing does not succeed or if any network disturbance occurs, running:
  ```bash
  bash /tmp/setup_wireguard.sh --teardown
  ```
  restores UFW, removes the `wg0` interface, and reverts firewall rules byte-for-byte to the pre-installation state (as proven in `test_wireguard_teardown_restore_safety.js`).

### C. Router Hardware & Local Preconditions
- **Requirement**: Physical router and local network readiness must precede server configuration.
  1. Physical GL.iNet Opal router (`GL-SFT1200`) powered on and connected to WAN.
  2. Router admin panel accessible at `http://192.168.8.1`.
  3. WireGuard client package installed and verified in Opal firmware.
  4. Client subnet (`192.168.8.0/24`) verified isolated from host WAN to prevent IP conflicts.

---

## 2. Prohibition on Synthetic or False Handshake Assertions

> [!CAUTION]
> **STRICT INVARIANT ON HANDSHAKE ASSERTION**:
> The local Companion service (`http://127.0.0.1:18989`) or local test harness **CANNOT and MUST NOT** assert or claim physical WireGuard handshake, DNS leak protection, or killswitch PASS based solely on local loopback, companion telemetry, or script exit codes.
>
> A physical handshake assertion is permitted ONLY when verifiable physical router evidence is supplied:
> 1. Router admin panel displays an active peer handshake timestamp within the last 180 seconds.
> 2. Router telemetry shows non-zero bidirectional transfer bytes (`transfer rx > 0`, `transfer tx > 0`).
> 3. Public egress IP through the Opal physical Wi-Fi/LAN interface resolves to `143.198.40.33`.

Pending this physical hardware telemetry, the assertion matrix remains strictly:
- **Physical WireGuard Handshake**: `UNVERIFIED`
- **Hardware DNS Leak Protection**: `UNVERIFIED`
- **Hardware Kill-Switch Enforcement**: `UNVERIFIED`

---

## 3. Dormant Installer Template (Executed ONLY After Preconditions Transition to Demonstrated)

*Notice: This command template is dormant and suspended. Do NOT execute until Section 1 preconditions are formally demonstrated.*

```bash
curl -fsSL "https://raw.githubusercontent.com/goodkie/v-show/upgrade/phase-0-1/companion/wireguard/setup_wireguard.sh" -o /tmp/setup_wireguard.sh
echo "eeaad799876eeb67dd3237c21a223718de97ef0e9ba8cf38af939368d88bd19f  /tmp/setup_wireguard.sh" | sha256sum -c -
bash /tmp/setup_wireguard.sh --install
```

- **Zero Secret Disclosure**: No private keys or authentication tokens are transmitted outside the owner's trusted console and physical router.

---

## 4. Autonomous Resumption & Egress Auditing Protocol

Once the physical router establishes the connection:
1. Antigravity probes `GET http://127.0.0.1:18989/egress/wireguard-status` and verifies that the local companion detects the tunnel interface.
2. Antigravity performs external egress IP verification against `http://api.ipify.org` through proxy port 18988, ensuring `143.198.40.33` egress parity.
3. Antigravity records machine-readable audit evidence and issues a formal receipt.

---

## 5. Status & Boundary Assertion Matrix

| Component / Layer | Status | Verification Authority / Artifact |
| :--- | :--- | :--- |
| Server Script & Rollback Teardown | **VERIFIED (100% PASS)** | Offline suite `test_wireguard_teardown_restore_safety.js` |
| Production 8443 Egress Proxy | **VERIFIED (100% HEALTHY)** | Real CONNECT probe to `143.198.40.33:8443` (Untouched) |
| Native Host Real Registry E2E | **VERIFIED (100% PASS)** | Isolated real registry E2E `test_native_host_isolated_real_registry_e2e.js` |
| Native Host Crash & Concurrency Safety | **VERIFIED (100% PASS)** | Audit suite `test_native_host_crash_and_race_safety.js` |
| Console Authentication Precondition | **PENDING OWNER CONFIRMATION** | Strictly a documented prerequisite (not demonstrated) |
| Physical WireGuard Handshake | **UNVERIFIED** | Awaiting physical GL.iNet Opal router link |
| Hardware DNS Leak Protection | **UNVERIFIED** | Awaiting physical packet capture via Opal interface |
| Hardware Kill-Switch Enforcement | **UNVERIFIED** | Awaiting physical WAN disconnect test |
| Residential Proxy Status | **CONFIG_REQUIRED** | Strict fail-closed enforced (0 direct leak bytes) |
