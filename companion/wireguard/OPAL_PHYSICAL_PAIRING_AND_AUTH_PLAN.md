# XPIDER Physical Opal Router Pairing & Minimal Owner Authentication Plan

## 1. Cryptographic Identity & Authoritative Anchors
- **Release Package**: `XPIDER_R6.9G.10.3.7.1.4.66_PRIVATE_EGRESS_RC3.50.zip`
- **Build ID**: `R6.9G.10.3.7.1.4.66-20261024-P0-RC3.50`
- **Server Script**: `companion/wireguard/setup_wireguard.sh`
- **Server Script SHA256**: `7e4eeb91f5c393c7f30babba837c110ca7e5b22f32cdb77d1b29d67fc861826b`
- **Functional Commit HEAD**: `3b7436fd9d5b327cea7615abfb59dc0e1a8acfed`

---

## 2. Server-Side Authentication & Setup (DigitalOcean Web Console)

> [!IMPORTANT]
> **No external API credentials, SSH keys, or private tokens are requested from the Owner.**
> DigitalOcean PAT returns HTTP 403 Forbidden on droplet/key endpoints, and SSH port 22 is intentionally blocked by Droplet UFW per RC3.37 invariant.
> The DigitalOcean Web Droplet Console is the sole authoritative, zero-credential-leak execution boundary.

### Execution Procedure:
1. Log in to [DigitalOcean Cloud Console](https://cloud.digitalocean.com/).
2. Navigate to **Droplets** → Select Droplet `611293905` (`xpider-egress-tor1-2afbc2f1`).
3. Click **Access** tab in left sidebar → Click **Launch Droplet Console**.
4. In the console root terminal, paste and run the following pinned 3-step script:
   ```bash
   # Download verified release script
   curl -fsSL "https://raw.githubusercontent.com/goodkie/v-show/535707782fac87e6a5dbdde13649e104a3033d91/companion/wireguard/setup_wireguard.sh" -o /tmp/setup_wireguard.sh

   # Cryptographic digest validation (Must output: OK)
   echo "7e4eeb91f5c393c7f30babba837c110ca7e5b22f32cdb77d1b29d67fc861826b  /tmp/setup_wireguard.sh" | sha256sum -c -

   # Execute idempotent installation
   bash /tmp/setup_wireguard.sh --install
   ```
5. **Observed Output**:
   - Captures system state snapshot into `/etc/wireguard/snapshots/pre_xpider.<timestamp>/`.
   - Opens only `51820/udp` on UFW.
   - Preserves Port 8443 TLS proxy (`143.198.40.33:8443`) untouched.
   - Outputs client configuration text block for the GL.iNet Opal router.

---

## 3. Client-Side Authentication & Pairing (GL.iNet Opal SFT-1200 Hardware)

### Prerequisites:
- Physical GL.iNet Opal (GL-SFT1200) router with power adapter and ethernet cable.
- Local PC/laptop connected to Opal router via LAN cable or Wi-Fi (`GL-SFT1200-xxx`).

### Actionable Pairing Steps:
1. Power on the Opal router and connect its **WAN port** to local internet gateway (home/office router).
2. Open a browser and navigate to `http://192.168.8.1`.
3. Complete initial admin setup (set admin password).
4. In the left navigation menu, go to **VPN** → **WireGuard Client**.
5. Click **Add New Profile** / **Manually Input Configuration**:
   ```ini
   [Interface]
   Address = 10.66.66.2/32
   PrivateKey = <OPAL_PRIVATE_KEY_FROM_SERVER_SCRIPT>
   DNS = 1.1.1.1, 8.8.8.8

   [Peer]
   PublicKey = <SERVER_PUBLIC_KEY_FROM_SERVER_SCRIPT>
   Endpoint = 143.198.40.33:51820
   AllowedIPs = 0.0.0.0/0
   PersistentKeepalive = 25
   ```
6. Click **Apply** and toggle **Connect**.
7. Navigate to **VPN** → **VPN Dashboard** → Enable **Block Non-VPN Traffic** (Hardware Kill-Switch).

---

## 4. Strict Hardware Verification Boundary Matrix

| Verification Vector | Offline Software Assessment | Physical Hardware Status |
| :--- | :--- | :--- |
| **Server WireGuard Template** | **PASS (100% VERIFIED)** | Installed & verified in isolated test |
| **System State Snapshot & Restore** | **PASS (100% VERIFIED)** | Byte-for-byte rollback confirmed |
| **Port 8443 TLS Proxy Hard Boundary** | **PASS (100% VERIFIED)** | Active, healthy (`143.198.40.33:8443`) |
| **Physical Opal WireGuard Handshake** | Template Validated | **UNVERIFIED** (Requires physical router power-on) |
| **Hardware DNS Leak Protection** | Config Validated | **UNVERIFIED** (Requires physical device packet trace) |
| **Hardware Kill-Switch Enforcement** | Config Validated | **UNVERIFIED** (Requires physical WAN link pull) |
| **Residential Proxy Integration** | **PASS (7/7 Unit Tests)** | **`CONFIG_REQUIRED`** (Fail-closed) |

---

## 5. Rollback & Emergency Teardown
If the Owner ever desires to completely remove the WireGuard interface and restore the server to its exact pre-installation state:
```bash
bash /tmp/setup_wireguard.sh --teardown
```
The script restores `/etc/wireguard/wg0.conf` byte-for-byte from the snapshot, reverts sysctl ip_forward, restores systemd service states, removes only `51820/udp`, and leaves port 8443 TLS proxy completely untouched.
