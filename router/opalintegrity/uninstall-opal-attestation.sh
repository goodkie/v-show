#!/bin/sh
# uninstall-opal-attestation.sh
# Removes restricted attestation agent from GL.iNet Opal (Issue #6 R6.9G.10.3.7).

DEST="/usr/libexec/xpider-router-attest"
echo "[1/2] Removing $DEST..."
rm -f "$DEST"

echo "[2/2] Cleaning authorized_keys entries..."
if [ -f "/root/.ssh/authorized_keys" ]; then
    grep -v 'xpider-router-attest' /root/.ssh/authorized_keys > /root/.ssh/authorized_keys.tmp || true
    mv /root/.ssh/authorized_keys.tmp /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

echo "[SUCCESS] Opal attestation agent uninstalled."
