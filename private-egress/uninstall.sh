#!/usr/bin/env bash
# ==============================================================================
# uninstall.sh
# 
# XPIDER AutoForm Sender Pro — Clean Teardown & Uninstall Script
# Protocol: OCA-DEV-1.4
# ==============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] uninstall.sh must be run as root" >&2
   exit 1
fi

SERVICE_NAME="xpider-egress"
PORT="${XPIDER_PORT:-8443}"
CONFIG_DIR="/etc/xpider-egress"
INSTALL_DIR="/opt/xpider-egress"

echo "[1/4] Stopping and disabling systemd service..."
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl disable "$SERVICE_NAME" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload

echo "[2/4] Removing firewall rules..."
ufw delete allow "${PORT}/tcp" 2>/dev/null || true

echo "[3/4] Removing service files and certificates..."
rm -rf "$CONFIG_DIR"
rm -rf "$INSTALL_DIR"
rm -f "/tmp/xpider-egress-descriptor.json"

echo "[4/4] Removing system user..."
userdel xpider 2>/dev/null || true

echo "[XPIDER_UNINSTALL_SUCCESS] Private Egress fully uninstalled and cleaned."
exit 0
