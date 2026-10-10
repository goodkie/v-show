#!/bin/sh
# healthcheck.sh
# Periodic runtime health check for VPS egress daemons (Issue #6 R6.9G.10.3.7)

SERVICES="wg-quick@wg0 openvpn-server@server squid unbound"
FAILED=0

for svc in $SERVICES; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
        echo "[OK] $svc is active"
    else
        echo "[FAIL] $svc is NOT active"
        FAILED=$((FAILED + 1))
    fi
done

if [ "$FAILED" -eq 0 ]; then
    echo "HEALTHCHECK_STATUS=HEALTHY"
    exit 0
else
    echo "HEALTHCHECK_STATUS=DEGRADED (failed=$FAILED)"
    exit 1
fi
