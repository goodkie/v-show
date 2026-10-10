# XPIDER VPS Egress Infrastructure Package
## Issue #6 Directive R6.9G.10.3.7

This package sets up the server-side components for the **Physical Router Security Gate**:
- **WireGuard (Primary Transport)**: Subnet `10.66.66.0/24`, Server IP `10.66.66.1`.
- **OpenVPN TCP/443 (Fallback Transport)**: Subnet `10.67.67.0/24`, Server IP `10.67.67.1`.
- **Private HTTP CONNECT Proxy (Squid)**: Listens strictly on `10.66.66.1:3128` and `10.67.67.1:3128`. Port 3128 is strictly DENIED from public WAN.
- **Unbound DNS Resolver**: Listens on VPN interfaces only.
- **nftables**: Drops any incoming port 3128 connection from public interfaces.

### Deployment:
1. Run `./install.sh` on an Ubuntu/Debian VPS.
2. Generate server/client keys for WireGuard and OpenVPN.
3. Apply `nftables` rules from `firewall-nftables.conf.template`.
4. Validate compliance using `./verify.sh`.
