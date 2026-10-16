#!/usr/bin/env bash
# ==============================================================================
# rotate_credentials.sh
# 
# XPIDER AutoForm Sender Pro — Safe Credential Rotation Script
# Protocol: OCA-DEV-1.4
# ==============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] rotate_credentials.sh must be run as root" >&2
   exit 1
fi

CONFIG_DIR="/etc/xpider-egress"
CREDS_FILE="$CONFIG_DIR/credentials.json"
SERVICE_NAME="xpider-egress"

if [[ ! -d "$CONFIG_DIR" ]]; then
  echo "[ERROR] $CONFIG_DIR does not exist. Run bootstrap.sh first." >&2
  exit 1
fi

USERNAME="${1:-xpider_owner}"
NEW_PASSWORD="${2:-}"
if [[ -z "$NEW_PASSWORD" ]]; then
  NEW_PASSWORD=$(openssl rand -hex 24)
fi

cat > "$CREDS_FILE" <<EOF
{
  "username": "${USERNAME}",
  "password": "${NEW_PASSWORD}",
  "updatedAt": $(date +%s)
}
EOF

chmod 600 "$CREDS_FILE"
chown xpider:xpider "$CREDS_FILE"

# Send SIGHUP to reload credentials in-flight without dropping active connections
systemctl kill -s HUP "$SERVICE_NAME" 2>/dev/null || systemctl restart "$SERVICE_NAME"

echo "=== [XPIDER_ROTATE_SUCCESS] ==="
cat "$CREDS_FILE"
echo ""
echo "=== [XPIDER_ROTATE_END] ==="
exit 0
