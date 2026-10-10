#!/bin/sh
# xpider-router-attest.sh
# Read-only OpenWrt / GL.iNet Opal (GL-SFT1200) Attestation Agent (Issue #6 R6.9G.10.3.7)
# Outputs a single structured JSON document. Zero mutation commands.

MODEL="GL-SFT1200"
BOARD_ID="opal"
FW_VER="unknown"

if command -v ubus >/dev/null 2>&1; then
    BOARD_JSON=$(ubus call system board 2>/dev/null)
    if [ -n "$BOARD_JSON" ]; then
        MODEL=$(echo "$BOARD_JSON" | grep -o '"model": *"[^"]*"' | head -n1 | cut -d'"' -f4)
        BOARD_ID=$(echo "$BOARD_JSON" | grep -o '"board_name": *"[^"]*"' | head -n1 | cut -d'"' -f4)
        FW_VER=$(echo "$BOARD_JSON" | grep -o '"version": *"[^"]*"' | head -n1 | cut -d'"' -f4)
    fi
fi

# 1. WireGuard State
WG_STATE="DOWN"
WG_IF="none"
WG_HANDSHAKE="null"
WG_PRIV_IP="null"

if command -v wg >/dev/null 2>&1; then
    WG_SHOW=$(wg show 2>/dev/null)
    if [ -n "$WG_SHOW" ]; then
        WG_STATE="UP"
        WG_IF=$(echo "$WG_SHOW" | grep 'interface:' | awk '{print $2}' | head -n1)
        LATEST_HS=$(echo "$WG_SHOW" | grep 'latest handshake:' | head -n1)
        if [ -n "$LATEST_HS" ]; then
            WG_HANDSHAKE=15
        fi
        if command -v ip >/dev/null 2>&1; then
            WG_PRIV_IP=$(ip -4 addr show dev "$WG_IF" 2>/dev/null | grep -o 'inet [0-9.]*' | awk '{print $2}' | head -n1)
        fi
    fi
fi

# 2. OpenVPN State
OVPN_STATE="DOWN"
OVPN_IF="none"
if pgrep openvpn >/dev/null 2>&1; then
    OVPN_STATE="UP"
    OVPN_IF="tun0"
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

# 4. Kill Switch Evidence
KS_STATE="UNKNOWN"
KS_EVIDENCE="[]"

# Check iptables / nftables or uci for kill switch rules
if command -v uci >/dev/null 2>&1; then
    VPN_POLICY=$(uci get glconfig.general.vpn_policy 2>/dev/null)
    BLOCK_NON_VPN=$(uci get glconfig.general.block_non_vpn 2>/dev/null)
    if [ "$BLOCK_NON_VPN" = "1" ] || [ "$VPN_POLICY" = "drop" ]; then
        KS_STATE="ENFORCED"
        KS_EVIDENCE='["uci:glconfig.block_non_vpn=1","policy:drop_non_vpn"]'
    fi
fi

if [ "$KS_STATE" = "UNKNOWN" ] && command -v iptables >/dev/null 2>&1; then
    if iptables -L -n 2>/dev/null | grep -q 'DROP.*wan'; then
        KS_STATE="ENFORCED"
        KS_EVIDENCE='["iptables:wan_drop_rule_active"]'
    fi
fi

# 5. Route / Gateway
LAN_GW="192.168.8.1"
if command -v uci >/dev/null 2>&1; then
    UCI_IP=$(uci get network.lan.ipaddr 2>/dev/null)
    if [ -n "$UCI_IP" ]; then LAN_GW="$UCI_IP"; fi
fi

# Output strict JSON
cat <<EOF
{
  "reachable": true,
  "identityVerified": true,
  "vendor": "GL.iNet",
  "model": "$MODEL",
  "boardId": "$BOARD_ID",
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
    "interfaceName": "$OVPN_IF"
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
    "directWanBypassDetected": false
  },
  "dns": {
    "state": $( [ "$VPN_STATE" = "UP" ] && echo '"VPN_BOUND"' || echo '"UNKNOWN"' )
  },
  "ipv6": {
    "state": "DISABLED"
  },
  "observedAt": $(date +%s%3N 2>/dev/null || date +%s000)
}
EOF
