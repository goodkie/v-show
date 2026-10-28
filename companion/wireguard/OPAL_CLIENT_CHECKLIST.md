# GL.iNet Opal (GL-SFT1200) Client Setup & Acceptance Checklist

## Target Architecture
- **Egress Droplet:** `143.198.40.33` (Toronto YYZ, DigitalOcean)
- **WireGuard Subnet:** `10.66.66.0/24`
  - Droplet Interface `wg0`: `10.66.66.1/24` (Port: `51820 UDP`)
  - Opal Router Interface: `10.66.66.2/32`
- **DNS:** `1.1.1.1` (or local secure resolver)

---

## Opal Client WireGuard Configuration Template
```ini
[Interface]
PrivateKey = <GENERATED_OPAL_CLIENT_PRIVATE_KEY>
Address = 10.66.66.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = 143.198.40.33:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

---

## Acceptance Checklist & Status Table

| Item | Requirement | Verification Method | Status |
|---|---|---|---|
| **1. Server Template & NAT** | `wg0.conf` generated, iptables masquerade on WAN interface, `sysctl net.ipv4.ip_forward=1` | Reconciled offline in `companion/wireguard/setup_wireguard.sh` | **RECONCILED (Offline)** |
| **2. Cloud Firewall Inbound** | Port `51820/udp` inbound permitted for Owner public IP | Scoped Cloud Firewall ID `d6fd3a95-d9d9-417d-9d27-c6b57e94240a` | **READY FOR ENROLLMENT** |
| **3. Opal WireGuard Handshake** | Opal connects to `143.198.40.33:51820`, bidirectional traffic established | Physical Opal router at Owner site (`wg show` on Droplet) | ⚠️ **UNVERIFIED** (Requires Physical Router Pairing) |
| **4. DNS Leak Protection** | All DNS queries routed through tunnel without leaking ISP resolver | In-tunnel leak test (`dnsleaktest.com` / `1.1.1.1`) | ⚠️ **UNVERIFIED** (Requires Active Tunnel) |
| **5. Kill-Switch Protection** | If WireGuard tunnel drops, all client traffic is strictly blocked | GL.iNet Opal Web UI "VPN Kill Switch" toggle test | ⚠️ **UNVERIFIED** (Requires Active Router Test) |

> [!IMPORTANT]
> Items 3, 4, and 5 can only be verified in the presence of the physical GL-SFT1200 hardware router after server-side WireGuard activation. They remain strictly marked as **UNVERIFIED** in software/offline environments.
