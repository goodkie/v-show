#!/bin/sh
# install-opal-attestation.sh
# Installs restricted read-only attestation agent on GL.iNet Opal (Issue #6 R6.9G.10.3.7).

set -e

DEST="/usr/libexec/xpider-router-attest"
echo "[1/3] Copying attestation script to $DEST..."
mkdir -p /usr/libexec
cp "$(dirname "$0")/xpider-router-attest.sh" "$DEST"
chmod 755 "$DEST"

echo "[2/3] Setting up forced-command SSH authorization if key provided..."
if [ -n "$1" ]; then
    ENTRY="command=\"$DEST\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $1"
    for D in "/etc/dropbear" "/root/.ssh"; do
        mkdir -p "$D"
        chmod 700 "$D" 2>/dev/null || true
        KEY_FILE="$D/authorized_keys"
        echo "$ENTRY" >> "$KEY_FILE"
        chmod 600 "$KEY_FILE"
    done
    echo "[OK] Forced-command SSH key installed in Dropbear and OpenSSH paths."
fi

echo "[3/3] Installation complete. Test execution:"
"$DEST" | grep '"model":' || true
echo "[SUCCESS] Opal attestation agent ready."
