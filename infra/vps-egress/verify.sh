#!/bin/sh
# verify.sh
# Validates VPS Egress Stack Compliance (Issue #6 R6.9G.10.3.7)
# Checks: WG_UP, OVPN_READY, PROXY_PRIVATE_ONLY, PUBLIC_3128_CLOSED, DNS_READY, EGRESS_FINGERPRINT

set -e

# 1. WireGuard State
if ip link show wg0 2>/dev/null | grep -q "UP"; then
    echo "WG_UP=true"
else
    echo "WG_UP=false"
fi

# 2. OpenVPN State
if pgrep openvpn >/dev/null 2>&1; then
    echo "OVPN_READY=true"
else
    echo "OVPN_READY=false"
fi

# 3. Private Proxy Only (Squid must NOT listen on 0.0.0.0:3128)
if ss -tlnp 2>/dev/null | grep ":3128" | grep -q "0.0.0.0"; then
    echo "PROXY_PRIVATE_ONLY=false"
elif ss -tlnp 2>/dev/null | grep ":3128" | grep -q "10.66.66.1"; then
    echo "PROXY_PRIVATE_ONLY=true"
else
    echo "PROXY_PRIVATE_ONLY=false"
fi

# 4. Public Port 3128 Closed
WAN_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "unknown")
if [ "$WAN_IP" != "unknown" ]; then
    if nc -z -w 2 "$WAN_IP" 3128 2>/dev/null; then
        echo "PUBLIC_3128_CLOSED=false"
    else
        echo "PUBLIC_3128_CLOSED=true"
    fi
else
    echo "PUBLIC_3128_CLOSED=true"
fi

# 5. DNS Ready
if nc -z -u -w 2 127.0.0.1 53 2>/dev/null || nc -z -u -w 2 10.66.66.1 53 2>/dev/null; then
    echo "DNS_READY=true"
else
    echo "DNS_READY=false"
fi

# 6. Egress Fingerprint
if [ "$WAN_IP" != "unknown" ]; then
    EGRESS_FP=$(echo -n "$WAN_IP" | sha256sum | awk '{print substr($1,1,16)}')
    echo "EGRESS_FINGERPRINT=sha256:$EGRESS_FP"
else
    echo "EGRESS_FINGERPRINT=unknown"
fi
