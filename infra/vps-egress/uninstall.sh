#!/bin/sh
# uninstall.sh
# Uninstalls XPIDER VPS Dual-VPN & Private Proxy stack (Issue #6 R6.9G.10.3.7)

systemctl stop wg-quick@wg0 openvpn-server@server squid unbound 2>/dev/null || true
systemctl disable wg-quick@wg0 openvpn-server@server squid unbound 2>/dev/null || true

rm -f /etc/sysctl.d/99-xpider-vpn.conf
rm -f /etc/unbound/unbound.conf.d/xpider.conf

echo "[SUCCESS] XPIDER VPS stack uninstalled."
