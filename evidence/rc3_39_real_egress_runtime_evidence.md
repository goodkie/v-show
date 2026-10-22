# RC3.39 Real Egress Runtime Evidence Artifact

Generated: `2026-10-22T05:43:10.609Z`
Candidate: `RC3.39`

## Summary of Invariant Checks

| Check | Target / Endpoint | Invariant Asserted | Result |
| :--- | :--- | :--- | :---: |
| **Companion Control Plane** | `127.0.0.1:18989` | `relayReady: true`, `lifecycleState: 'READY'`, `health: 'HEALTHY'` | **PASS** |
| **Rehearsal Node Isolation** | `egress_pool_config.json` | Exactly 1 production node (`do-egress-tor1-611293905`); rehearsal node purged | **PASS** |
| **Direct Pinned TLS Handshake** | `143.198.40.33:8443` | TLS 1.3 / Pinned Root CA / IP SAN matches `143.198.40.33` | **PASS** |
| **Authenticated CONNECT Tunnel** | `127.0.0.1:18988` | Egress trace observed IP: `143.198.40.33`, Location: `CA`, Colo: `YYZ` | **PASS** |
| **Port 22 SSH Closed Invariant** | `143.198.40.33:22` | Inbound SSH refused/filtered; ephemeral keys purged | **PASS** |
| **Fail-Closed Fallback Invariant** | Gateway `127.0.0.1:18988` | Direct connection never bypassed; 0 byte IP leak | **PASS** |

## Raw Egress Trace Data
```http
HTTP/1.1 200 OK
ip=143.198.40.33
loc=CA
colo=YYZ
tls=TLSv1.3
h=cloudflare.com
```

## Direct TLS Handshake Certificate Details
- **Subject**: `{"C":"US","O":"XPIDER","CN":"143.198.40.33"}`
- **Issuer**: `{"C":"US","O":"XPIDER","CN":"XPIDER Private Egress Root CA"}`
- **Subject Alt Names (SAN)**: `IP Address:143.198.40.33, IP Address:127.0.0.1, DNS:localhost`
- **Cipher**: `TLS_AES_256_GCM_SHA384` (`TLSv1.3`)
- **Server SHA-256 Fingerprint**: `CD:DA:43:DB:EA:3C:05:2C:9E:D5:86:23:FB:44:6F:11:5C:C1:2D:D4:B3:3E:69:FF:27:87:99:96:5B:A3:F1:0D`
