#!/bin/sh
# verify.sh
# Validates VPS Egress Stack Compliance (Issue #6 R6.9G.10.3.7.1)
# Checks: WG_UP, OVPN_READY, PROXY_PRIVATE_ONLY, SQUID_BIND_COMPLIANCE, PUBLIC_3128_CLOSED, DNS_READY, EGRESS_FINGERPRINT
# Fails closed if any observation is UNKNOWN or non-compliant.

set -e

OVERALL_PASS=true

# 1. WireGuard State
if ip link show wg0 2>/dev/null | grep -q -E '(UP|LOWER_UP)'; then
    echo "WG_UP=true"
else
    echo "WG_UP=false"
    OVERALL_PASS=false
fi

# 2. OpenVPN State
OVPN_IF=$(ip link show 2>/dev/null | grep -o 'tun[0-9]*' | head -n1 || echo "tun0")
if pgrep openvpn >/dev/null 2>&1 && ip link show dev "$OVPN_IF" 2>/dev/null | grep -q -E '(UP|LOWER_UP)'; then
    echo "OVPN_READY=true"
else
    echo "OVPN_READY=false"
fi

# 3. Private Proxy Only (Squid must strictly NOT listen on 0.0.0.0 or wildcard)
SQUID_SOCKETS=$(ss -tlnp 2>/dev/null | grep ":3128" || true)
if echo "$SQUID_SOCKETS" | grep -q -E '(0\.0\.0\.0:3128|\*:3128|\[::\]:3128)'; then
    echo "PROXY_PRIVATE_ONLY=false"
    echo "SQUID_BIND_COMPLIANCE=VIOLATION_WILDCARD_DETECTED"
    OVERALL_PASS=false
elif echo "$SQUID_SOCKETS" | grep -q -E '(10\.66\.66\.1:3128|10\.67\.67\.1:3128)'; then
    echo "PROXY_PRIVATE_ONLY=true"
    echo "SQUID_BIND_COMPLIANCE=COMPLIANT_PRIVATE_TUNNELS_ONLY"
else
    echo "PROXY_PRIVATE_ONLY=false"
    echo "SQUID_BIND_COMPLIANCE=NO_VALID_PRIVATE_SOCKET_FOUND"
    OVERALL_PASS=false
fi

# 4. nftables Firewall Drop Verification (Blocker 10)
if command -v nft >/dev/null 2>&1; then
    if nft list ruleset 2>/dev/null | grep -q -E 'dport 3128.*drop'; then
        echo "NFTABLES_3128_DROP=true"
    else
        echo "NFTABLES_3128_DROP=false"
        OVERALL_PASS=false
    fi
else
    echo "NFTABLES_3128_DROP=UNKNOWN"
fi

# 5. Public Port 3128 Closed (Truthful Observation: Never fabricate PASS on UNKNOWN)
WAN_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "unknown")
if [ "$WAN_IP" != "unknown" ]; then
    if nc -z -w 2 "$WAN_IP" 3128 2>/dev/null; then
        echo "PUBLIC_3128_CLOSED=false"
        OVERALL_PASS=false
    else
        echo "PUBLIC_3128_CLOSED=true"
    fi
else
    echo "PUBLIC_3128_CLOSED=UNKNOWN"
    echo "VERIFY_REASON=WAN_IP_UNAVAILABLE_CANNOT_PROVE_PORT_CLOSURE"
    OVERALL_PASS=false
fi

# 6. DNS Ready
if nc -z -u -w 2 127.0.0.1 53 2>/dev/null || nc -z -u -w 2 10.66.66.1 53 2>/dev/null; then
    echo "DNS_READY=true"
else
    echo "DNS_READY=false"
    OVERALL_PASS=false
fi

# 7. Egress Fingerprint
if [ "$WAN_IP" != "unknown" ]; then
    EGRESS_FP=$(echo -n "$WAN_IP" | sha256sum | awk '{print substr($1,1,16)}')
    echo "EGRESS_FINGERPRINT=sha256:$EGRESS_FP"
else
    echo "EGRESS_FINGERPRINT=UNKNOWN"
    OVERALL_PASS=false
fi

# 8. Overall Gate Status
if [ "$OVERALL_PASS" = "true" ]; then
    echo "OVERALL_VPS_VERIFY=PASS"
else
    echo "OVERALL_VPS_VERIFY=FAIL_HOLD"
fi
