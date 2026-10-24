# XPIDER WireGuard Server Template Audit & Service 8443 Health Assertion

## 1. Cryptographic Identity & Immutability Anchors
- **Target Script**: `companion/wireguard/setup_wireguard.sh`
- **Pinned Reviewed Commit**: `55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5`
- **Git Blob SHA**: `30e7fe4292cb1343f670340f44baf8329e11caf3`
- **SHA256 Checksum**: `9ac985b43c19803071312e197e458fa016038354301929e357f422636969dc5f`
- **Pinned Download URL**:
  `https://raw.githubusercontent.com/goodkie/v-show/55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5/companion/wireguard/setup_wireguard.sh`

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

## 4. Non-Destructive Backup & Rollback Procedures

### Backup Semantics
- Prior to overwriting or modifying `/etc/wireguard/wg0.conf`, existing configuration is archived to `/etc/wireguard/wg0.conf.bak`.
- Generated server private/public keys and client keys are preserved idempotently on re-run:
  - `/etc/wireguard/server_private.key`
  - `/etc/wireguard/opal_private.key`

### Reproducible Rollback (`--teardown`)
To roll back WireGuard changes at any time without disturbing port 8443:
```bash
bash /tmp/setup_wireguard.sh --teardown
```
Actions performed by `--teardown`:
1. `systemctl stop wg-quick@wg0`
2. `systemctl disable wg-quick@wg0`
3. `ufw delete allow 51820/udp`
4. `mv /etc/wireguard/wg0.conf /etc/wireguard/wg0.conf.bak`
5. Port 8443 and SSH 22 remain completely unmodified.

---

## 5. Technical Reference: Minimal Authenticated Owner Console Procedure
*(Documented for future technical reference ONLY when physical Opal pairing is actively armed)*:

1. Download to temporary file:
   ```bash
   curl -fsSL "https://raw.githubusercontent.com/goodkie/v-show/55cd543be5ebe7a4553cac0cbfcf933a00e4c8a5/companion/wireguard/setup_wireguard.sh" -o /tmp/setup_wireguard.sh
   ```
2. Verify cryptographic SHA256 checksum:
   ```bash
   echo "9ac985b43c19803071312e197e458fa016038354301929e357f422636969dc5f  /tmp/setup_wireguard.sh" | sha256sum -c -
   ```
3. Inspect file header:
   ```bash
   head -n 35 /tmp/setup_wireguard.sh
   ```
4. Execute install:
   ```bash
   bash /tmp/setup_wireguard.sh --install
   ```
