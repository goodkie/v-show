#!/bin/sh
# uninstall-opal-attestation.sh
# Removes restricted attestation agent from GL.iNet Opal (Issue #6 R6.9G.10.3.7).

DEST="/usr/libexec/xpider-router-attest"
echo "[1/2] Removing $DEST..."
rm -f "$DEST"

echo "[2/2] Cleaning authorized_keys entries across all supported locations..."
for KEY_FILE in "/etc/dropbear/authorized_keys" "/root/.ssh/authorized_keys"; do
    if [ -f "$KEY_FILE" ] && [ ! -L "$KEY_FILE" ]; then
        if grep -q 'xpider-router-attest' "$KEY_FILE" 2>/dev/null; then
            grep -v 'xpider-router-attest' "$KEY_FILE" > "${KEY_FILE}.tmp" || true
            mv "${KEY_FILE}.tmp" "$KEY_FILE"
            chmod 600 "$KEY_FILE"
            echo "[OK] Removed XPIDER entry from $KEY_FILE"
        fi
    fi
done

echo "[SUCCESS] Opal attestation agent uninstalled."
