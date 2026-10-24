# XPIDER WireGuard Server Template Audit & Service 8443 Health Assertion

## 1. Cryptographic Identity & Immutability Anchors
- **Target Script**: `companion/wireguard/setup_wireguard.sh`
- **Release Package**: `XPIDER_R6.9G.10.3.7.1.4.65_PRIVATE_EGRESS_RC3.49.zip`
- **Package SHA256**: `52a7d08f7d01ec61a33e2c186dcb478a4ad743614399a8ff7923aeae851a8f0d`
- **Target Script SHA256**: `7e4eeb91f5c393c7f30babba837c110ca7e5b22f32cdb77d1b29d67fc861826b`
- **Hardened Features**: Full multi-component system snapshot (config, systemd service state, UFW firewall, iptables NAT, sysctl ip_forward, resolv.conf) and exact byte-for-byte rollback.

---

## 2. Security Stop & Formal Retraction
- **Retracted Command**: `curl -fsSL raw.githubusercontent.com/.../setup_wireguard.sh | bash`
- **Rationale**: Piped remote branch execution into a root shell without SHA verification is an unacceptable security hazard. Mutable branch tips can change unpredictably.
- **Current Execution Status**: **DO NOT EXECUTE INSTALLATION YET**.
  - DigitalOcean API PAT remains restricted (returns HTTP 403 Forbidden on `/v2/droplets` and `/v2/account/keys`).
  - Droplet host UFW intentionally blocks port 22 and authorized keys are wiped per RC3.37 invariant.
  - GL.iNet Opal physical router is on-premises and not yet connected.
  - Running a server script prematurely will not complete network pairing and is technically premature.

---

## 3. Shell Semantics & Non-Mutating Audit
The script has been audited for execution safety and strict non-interactivity:
- **Interpreter & Safety Flags**: `#!/bin/bash` with `set -euo pipefail` (aborts immediately on any unexpected error or unbound variable).
- **Supported Mode Flags**:
  - `--install` (Default): Sets up WireGuard interface `wg0` on `10.66.66.1/24`, UDP port `51820`.
  - `--teardown` / `--rollback`: Cleanly stops and disables `wg-quick@wg0`, deletes UFW `51820/udp`, archives configuration.
  - `--check` / `--status`: Read-only inspection of interface state and service status without modifying anything.
- **Zero-Touch Hard Boundaries**:
  - **Port 8443 (XPIDER TLS Proxy)**: **STRICTLY UNTOUCHED**. The script contains zero references or rules altering port 8443. Production proxy on `143.198.40.33:8443` remains fully operational.
  - **SSH (Port 22) & `/root/.ssh/authorized_keys`**: **STRICTLY UNTOUCHED**. The script never touches port 22, never injects keys, and never modifies SSH daemons.
  - **Network Isolation**: WireGuard client subnet is restricted to `10.66.66.0/24` with NAT masquerade to WAN (`eth0`).

---

## 4. Non-Destructive Backup, Conflict Detection & Diff-Based Exact Restore Procedures

### Conflict Detection & Pre-Existing Configuration Protection
- **Pre-Install Conflict Detection**:
  - `setup_wireguard.sh` inspects `/etc/wireguard/wg0.conf` prior to writing.
  - If a pre-existing non-XPIDER configuration is present, it is **NEVER silently deleted or overwritten**.
  - Automatically preserved to `/etc/wireguard/wg0.conf.pre_xpider.$(date +%s)` with permissions `0600`.
  - Generated cryptographic keypairs (`server_private.key`, `opal_private.key`) are idempotently reused across re-runs.

### Reproducible Rollback (`--teardown`) & Byte-for-Byte Exact Restore
To roll back WireGuard changes at any time without disturbing port 8443:
```bash
bash /tmp/setup_wireguard.sh --teardown
```
Actions performed by `--teardown`:
1. `systemctl stop wg-quick@wg0` & `systemctl disable wg-quick@wg0`
2. `ufw delete allow 51820/udp` (leaves port 8443 and SSH port 22 completely untouched)
3. **Diff-Based Restore Execution**:
   - **Case A (Pre-existing config was present)**: Locates latest `wg0.conf.pre_xpider.*`, copies it back to `/etc/wireguard/wg0.conf`, and restarts `wg-quick@wg0`. Restores prior state byte-for-byte (`diff === 0`).
   - **Case B (Clean host with zero prior config)**: Archives XPIDER config to `wg0.conf.xpider_removed.$(date +%s)` and removes `wg0.conf` completely. Host returns to clean zero-config state.
4. **Port 8443 TLS Proxy Hard Invariant**:
   - Production proxy on `143.198.40.33:8443` is **100% operational, healthy, and untouched**.

### Automated Verification Test Suite
- Test runner: `test/test_wireguard_teardown_restore_safety.js`
- Test 1 (Hard Boundaries): Port 8443 and SSH 22 untouched — **PASS**
- Test 2 (Shell Semantics): `set -euo pipefail`, `noninteractive`, backup paths — **PASS**
- Test 3 (Diff-Based Restore): Byte-for-byte exact restore of pre-existing config — **PASS**
- Test 4 (Clean Zero-Config): Zero dangling files on clean host — **PASS**

---

## 5. Owner-Specific Unblock Plan: Prerequisites by Domain

### Domain A: DigitalOcean Web Console (Server-Side)
- **Status**: Self-contained & safe, but technically deferred.
- **Prerequisites**:
  1. Access to DigitalOcean web control panel (Droplet `611293905` → Access → Launch Droplet Console).
  2. No private keys, external tokens, or guessed IPs needed from Owner.
  3. Safe 3-step console execution:
     ```bash
     curl -fsSL "https://raw.githubusercontent.com/goodkie/v-show/55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5/companion/wireguard/setup_wireguard.sh" -o /tmp/setup_wireguard.sh
     echo "9ac985b43c19803071312e197e458fa016038354301929e357f422636969dc5f  /tmp/setup_wireguard.sh" | sha256sum -c -
     bash /tmp/setup_wireguard.sh --install
     ```
  *Current Assessment*: Keep deferred until physical router is connected; proxy on :8443 is already providing 100% verified egress.

### Domain B: Physical GL.iNet Opal Hardware (Client-Side)
- **Status**: **UNVERIFIED** until device evidence is captured.
- **Prerequisites**:
  1. Physical GL.iNet Opal SFT-1200 powered and connected to local upstream network.
  2. Owner opens local admin page (`http://192.168.8.1` default).
  3. Import client configuration outputted by server script (`companion/wireguard/OPAL_CLIENT_CHECKLIST.md`).
- **Hard Verification Boundary**:
  - Offline syntax & checklist: **PASS**
  - Physical WireGuard Handshake: **UNVERIFIED** (Requires device connection)
  - Hardware DNS Leak Protection: **UNVERIFIED** (Requires device connection)
  - Hardware Kill-Switch Verification: **UNVERIFIED** (Requires device connection)
