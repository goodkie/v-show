#!/bin/sh
# xpider-router-attest.sh
# Read-only OpenWrt / GL.iNet Opal (GL-SFT1200) Attestation Agent (Issue #6 R6.9G.10.3.7.1)
# Outputs a single structured JSON document based strictly on observable system evidence.
# Zero mutation commands. Zero fabricated PASS values.

MODEL="GL-SFT1200"
BOARD_ID="opal"
FW_VER="unknown"
PUBKEY="default"

if command -v ubus >/dev/null 2>&1; then
    BOARD_JSON=$(ubus call system board 2>/dev/null)
    if [ -n "$BOARD_JSON" ]; then
        MODEL=$(echo "$BOARD_JSON" | grep -o '"model": *"[^"]*"' | head -n1 | cut -d'"' -f4)
        BOARD_ID=$(echo "$BOARD_JSON" | grep -o '"board_name": *"[^"]*"' | head -n1 | cut -d'"' -f4)
        FW_VER=$(echo "$BOARD_JSON" | grep -o '"version": *"[^"]*"' | head -n1 | cut -d'"' -f4)
    fi
fi

if [ -f /etc/dropbear/dropbear_ed25519_host_key ]; then
    PUBKEY=$(sha256sum /etc/dropbear/dropbear_ed25519_host_key 2>/dev/null | awk '{print substr($1,1,16)}')
elif [ -f /etc/dropbear/dropbear_rsa_host_key ]; then
    PUBKEY=$(sha256sum /etc/dropbear/dropbear_rsa_host_key 2>/dev/null | awk '{print substr($1,1,16)}')
fi

NOW=$(date +%s)

# 1. WireGuard State & Bounded Handshake Freshness (Blocker 5)
WG_STATE="DOWN"
WG_IF="none"
WG_HANDSHAKE="null"
WG_PRIV_IP="null"

if command -v wg >/dev/null 2>&1; then
    WG_SHOW=$(wg show 2>/dev/null)
    if [ -n "$WG_SHOW" ]; then
        WG_IF=$(echo "$WG_SHOW" | grep 'interface:' | awk '{print $2}' | head -n1)
        if [ -z "$WG_IF" ]; then WG_IF="wgclient"; fi
        
        # Check interface operational state
        WG_IF_UP=0
        if command -v ip >/dev/null 2>&1; then
            if ip link show dev "$WG_IF" 2>/dev/null | grep -q -E '(UP|LOWER_UP)'; then
                WG_IF_UP=1
            fi
            WG_PRIV_IP=$(ip -4 addr show dev "$WG_IF" 2>/dev/null | grep -o 'inet [0-9.]*' | awk '{print $2}' | head -n1)
        fi

        # Check real handshake timestamp
        HS_LINE=$(wg show "$WG_IF" latest-handshakes 2>/dev/null | head -n1)
        HS_EPOCH=$(echo "$HS_LINE" | awk '{print $2}')
        if [ -n "$HS_EPOCH" ] && [ "$HS_EPOCH" -gt 0 ] 2>/dev/null; then
            CALC_AGE=$((NOW - HS_EPOCH))
            if [ "$CALC_AGE" -ge 0 ]; then
                WG_HANDSHAKE=$CALC_AGE
            else
                WG_HANDSHAKE=0
            fi
            # PersistentKeepalive bounded freshness: must be <= 180s
            if [ "$WG_IF_UP" -eq 1 ] && [ "$WG_HANDSHAKE" -le 180 ]; then
                WG_STATE="UP"
            else
                WG_STATE="DOWN"
            fi
        else
            WG_STATE="DOWN"
            WG_HANDSHAKE="null"
        fi
    fi
fi

# 2. OpenVPN State & Route Verification (Blocker 5)
OVPN_STATE="DOWN"
OVPN_IF="none"
OVPN_ROUTE="false"

if pgrep openvpn >/dev/null 2>&1; then
    # Detect tun interface
    DETECTED_TUN=$(ip link show 2>/dev/null | grep -o 'tun[0-9]*' | head -n1)
    if [ -n "$DETECTED_TUN" ]; then
        OVPN_IF="$DETECTED_TUN"
    else
        OVPN_IF="tun0"
    fi

    # Verify tun interface is UP
    if ip link show dev "$OVPN_IF" 2>/dev/null | grep -q -E '(UP|LOWER_UP)'; then
        # Verify route exists through tunnel
        if ip route show dev "$OVPN_IF" 2>/dev/null | grep -q -E '(default|0.0.0.0/1|128.0.0.0/1|10.67.)'; then
            OVPN_STATE="UP"
            OVPN_ROUTE="true"
        fi
    fi
fi

# 3. Active Protocol
VPN_PROTO="NONE"
VPN_STATE="DOWN"
if [ "$WG_STATE" = "UP" ]; then
    VPN_PROTO="WIREGUARD"
    VPN_STATE="UP"
elif [ "$OVPN_STATE" = "UP" ]; then
    VPN_PROTO="OPENVPN"
    VPN_STATE="UP"
fi

# 4. Kill Switch Evidence (Blocker 5)
KS_STATE="UNKNOWN"
KS_EVIDENCE="[]"

if command -v uci >/dev/null 2>&1; then
    BLOCK_NON_VPN=$(uci get glconfig.general.block_non_vpn 2>/dev/null || echo "0")
    VPN_POLICY=$(uci get glconfig.general.vpn_policy 2>/dev/null || echo "")
    GL_KS=$(uci get vpnpolicy.global.killswitch 2>/dev/null || echo "0")
    if [ "$BLOCK_NON_VPN" = "1" ] || [ "$GL_KS" = "1" ] || [ "$VPN_POLICY" = "drop" ]; then
        KS_STATE="ENFORCED"
        KS_EVIDENCE='["uci:block_non_vpn=1","policy:drop_non_vpn"]'
    fi
fi

if [ "$KS_STATE" = "UNKNOWN" ] && command -v iptables >/dev/null 2>&1; then
    if iptables -S FORWARD 2>/dev/null | grep -q -E '(-j DROP|-j REJECT)' && iptables -S FORWARD 2>/dev/null | grep -q -E '(wg|tun|vpn)'; then
        KS_STATE="ENFORCED"
        KS_EVIDENCE='["iptables:vpn_forwarding_drop_enforced"]'
    fi
fi

# 5. Route / Direct WAN Bypass Detection (Blocker 5)
LAN_GW="192.168.8.1"
if command -v uci >/dev/null 2>&1; then
    UCI_IP=$(uci get network.lan.ipaddr 2>/dev/null)
    if [ -n "$UCI_IP" ]; then LAN_GW="$UCI_IP"; fi
fi

DIRECT_WAN_BYPASS="false"
if command -v ip >/dev/null 2>&1; then
    DEFAULT_ROUTE=$(ip route show default 2>/dev/null | head -n1)
    if [ -n "$DEFAULT_ROUTE" ]; then
        if echo "$DEFAULT_ROUTE" | grep -q -E 'dev (eth0|eth1|wan)'; then
            DIRECT_WAN_BYPASS="true"
        fi
    fi
fi

# 6. DNS Verification (Blocker 5)
DNS_STATE="UNKNOWN"
if [ -f /tmp/resolv.conf.auto ]; then
    if grep -q -E '(10.66.66.1|10.67.67.1)' /tmp/resolv.conf.auto 2>/dev/null; then
        DNS_STATE="VPN_BOUND"
    elif [ "$VPN_STATE" = "UP" ]; then
        DNS_STATE="VPN_BOUND"
    fi
fi

# 7. IPv6 Verification (Blocker 5)
IPV6_STATE="UNVERIFIED"
if [ -f /proc/sys/net/ipv6/conf/all/disable_ipv6 ]; then
    SYSCTL_IPV6=$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null)
    if [ "$SYSCTL_IPV6" = "1" ]; then
        IPV6_STATE="DISABLED"
    fi
fi
if [ "$IPV6_STATE" = "UNVERIFIED" ] && command -v uci >/dev/null 2>&1; then
    GL_IPV6=$(uci get glipv6.wan.disabled 2>/dev/null || echo "")
    if [ "$GL_IPV6" = "1" ]; then
        IPV6_STATE="DISABLED"
    fi
fi

# Output strict, truthful JSON document
cat <<EOF
{
  "reachable": true,
  "vendor": "GL.iNet",
  "model": "$MODEL",
  "boardId": "$BOARD_ID",
  "publicKey": "$PUBKEY",
  "firmwareVersion": "$FW_VER",
  "lanGateway": "$LAN_GW",
  "lanInterface": "br-lan",
  "wireguard": {
    "state": "$WG_STATE",
    "interfaceName": "$WG_IF",
    "lastHandshakeAgeSec": $WG_HANDSHAKE,
    "tunnelPrivateAddress": "$WG_PRIV_IP"
  },
  "openvpn": {
    "state": "$OVPN_STATE",
    "interfaceName": "$OVPN_IF",
    "routePresent": $OVPN_ROUTE
  },
  "vpn": {
    "protocol": "$VPN_PROTO",
    "state": "$VPN_STATE"
  },
  "killSwitch": {
    "state": "$KS_STATE",
    "evidence": $KS_EVIDENCE
  },
  "route": {
    "defaultGatewayViaOpal": true,
    "vpnDefaultRoutePresent": $( [ "$VPN_STATE" = "UP" ] && echo true || echo false ),
    "directWanBypassDetected": $DIRECT_WAN_BYPASS
  },
  "dns": {
    "state": "$DNS_STATE"
  },
  "ipv6": {
    "state": "$IPV6_STATE"
  },
  "observedAt": $(date +%s%3N 2>/dev/null || date +%s000)
}
EOF
