#!/bin/sh
# install.sh
# Production installer for XPIDER VPS Dual-VPN & Private Proxy stack (Issue #6 R6.9G.10.3.7)

set -e

echo "=== Installing XPIDER VPS Egress Stack ==="
apt-get update -y
apt-get install -y wireguard openvpn squid unbound nftables curl netcat-openbsd

# 1. Enable IP Forwarding
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-xpider-vpn.conf
sysctl -p /etc/sysctl.d/99-xpider-vpn.conf

# 2. Check and copy configuration templates
DIR="$(dirname "$0")"
echo "[+] Copying configuration templates..."
cp "$DIR/squid.conf.template" /etc/squid/squid.conf
cp "$DIR/unbound.conf.template" /etc/unbound/unbound.conf.d/xpider.conf

# 3. Enable and start services
systemctl enable squid unbound
systemctl restart squid unbound

echo "[SUCCESS] VPS Base stack installed. Please populate WireGuard and OpenVPN server keys."
