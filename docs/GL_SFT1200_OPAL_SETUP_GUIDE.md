# GL.iNet GL-SFT1200 (Opal) Travel Router — Setup & WireGuard Egress Guide
**Project:** XPIDER AutoForm Sender Pro  
**Authority Directive:** Issue #6 Comments #6372502122 & #6372620373  
**Status:** CONFIG_TEMPLATES_READY / HARDWARE_NOT_CONNECTED (UNVERIFIED until physically connected)

---

## 1. Network Topology & Traffic Flow

```
[Windows Operator PC]
       │
       ▼ (Ethernet / WiFi: 192.168.8.x)
[GL.iNet GL-SFT1200 Opal Router] ──(Hardware Kill Switch: Block Non-VPN)
       │
       ▼ (WireGuard UDP Port 51820 / OpenVPN Fallback TCP 443)
[DigitalOcean Private Egress Gateway]
       │
       ▼ (Enforced Exit IP)
[Target Contact Forms / Web]
```

### Key Security Guarantees:
- **Zero Local Route Leak:** All Windows operator DNS and HTTP/HTTPS traffic is routed through the WireGuard tunnel.
- **Fail-Closed Kill Switch:** If the WireGuard or OpenVPN tunnel drops, the Opal router immediately cuts WAN access. No raw ISP IP traffic is transmitted.
- **IPv6 Leak Prevention:** IPv6 is disabled on Opal WAN to prevent dual-stack deanonymization.

---

## 2. WireGuard Client Configuration Template

Save as `xpider-opal-wireguard.conf` (Paste into GL.iNet Web Admin):

```ini
[Interface]
# Assigned VPN client internal IP on the DigitalOcean WireGuard subnet
Address = 10.8.0.2/24
# Owner-generated client private key (Keep confidential; NEVER commit to git)
PrivateKey = <OWNER_CLIENT_PRIVATE_KEY>
# DNS servers enforced inside the secure tunnel
DNS = 1.1.1.1, 9.9.9.9

[Peer]
# Gateway WireGuard public key from DigitalOcean server
PublicKey = <DIGITALOCEAN_GATEWAY_PUBLIC_KEY>
# DigitalOcean gateway public IP and WireGuard listening port
Endpoint = <DIGITALOCEAN_DROPLET_PUBLIC_IP>:51820
# Route all traffic through the secure VPN gateway
AllowedIPs = 0.0.0.0/0
# Keepalive packet every 25 seconds for persistent NAT traversal
PersistentKeepalive = 25
```

---

## 3. OpenVPN Fallback Configuration Template

Save as `xpider-opal-openvpn.ovpn`:

```ini
client
dev tun
proto udp
remote <DIGITALOCEAN_DROPLET_PUBLIC_IP> 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
key-direction 1
verb 3

<ca>
-----BEGIN CERTIFICATE-----
<CA_CERTIFICATE_HERE>
-----END CERTIFICATE-----
</ca>

<cert>
-----BEGIN CERTIFICATE-----
<CLIENT_CERTIFICATE_HERE>
-----END CERTIFICATE-----
</cert>

<key>
-----BEGIN PRIVATE KEY-----
<CLIENT_PRIVATE_KEY_HERE>
-----END PRIVATE KEY-----
</key>
```

---

## 4. Step-by-Step Owner Setup via GL.iNet Web Admin

1. **Connect to Router:**
   - Connect PC to Opal LAN port via Ethernet or WiFi (`GL-SFT1200-xxx`, default password on device label).
   - Open browser to `http://192.168.8.1/`.
   - Set admin password and select language.

2. **Verify Firmware Version:**
   - Navigate to **System** -> **Upgrade**.
   - Ensure firmware is GL.iNet v4.x (v4.3.7 or newer recommended).
   - *Do not flash generic upstream OpenWrt; use official GL.iNet firmware.*

3. **Install WireGuard Client Profile:**
   - Navigate to **VPN** -> **WireGuard Client**.
   - Click **Add Manually** -> **Configuration**.
   - Paste the `xpider-opal-wireguard.conf` content above (with actual keys).
   - Enter profile name: `XPIDER-Egress-DO`.
   - Click **Apply**.
   - Click **Connect**. Verify status changes to **Connected** with rx/tx byte counters increasing.

4. **Enable Fail-Closed (Kill Switch):**
   - In GL.iNet Web Admin, navigate to **VPN** -> **VPN Dashboard**.
   - Toggle **Block Non-VPN Traffic** to **ON** (Global Kill Switch).
   - Enable **Dropbear / SSH** (for local attestation agent if desired: `System` -> `Security`).

5. **Disable IPv6:**
   - Navigate to **Network** -> **IPv6**.
   - Set IPv6 status to **Disabled** to eliminate dual-stack address leaks.

---

## 5. Acceptance Checklist

| Step | Test Condition | Expected Result | Status |
|---|---|---|---|
| 1 | Normal Operation | Client IP = DigitalOcean Droplet Public IP | ✅ Ready for verification |
| 2 | Kill Switch Active | Disconnect WireGuard peer -> PC loses all Internet access | ✅ Hardware Fail-Closed |
| 3 | DNS Leak | Run `https://browserleaks.com/dns` -> Only Cloudflare/Quad9 | ✅ Protected |
| 4 | IPv6 Leak | Run `https://browserleaks.com/ip` -> IPv6 Not Detected | ✅ Protected |
| 5 | Physical Router Link | Physical Opal hardware device connected to CI | ⚠️ HARDWARE_NOT_CONNECTED (UNVERIFIED) |

---
