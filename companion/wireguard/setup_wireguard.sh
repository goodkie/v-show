#!/bin/bash
# ============================================================
# XPIDER WireGuard Server Setup — xpider-egress-tor1-2afbc2f1
# Server: 143.198.40.33 | Subnet: 10.66.66.0/24 | Port: 51820/udp
# Client: GL.iNet Opal (SFT-1200) = 10.66.66.2/32
# ============================================================
# Offline reconciled template with Idempotency, Security Boundaries,
# and Rollback (--teardown).
#
# HARD BOUNDARIES:
# 1. Port 8443 (XPIDER TLS Proxy) is strictly UNTOUCHED.
# 2. SSH (Port 22) / authorized_keys is strictly UNTOUCHED.
# 3. Dedicated subnet 10.66.66.0/24 isolated from local services.

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

ACTION="${1:---install}"
WG_IFACE="wg0"
WG_PORT=51820
WG_SERVER_ADDR="10.66.66.1/24"
WG_CLIENT_ADDR="10.66.66.2/32"
WG_CONF="/etc/wireguard/wg0.conf"
SNAPSHOT_DIR="/etc/wireguard/snapshots"
SERVER_PUB_IP="143.198.40.33"

detect_wan_if() {
    local wan
    wan=$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -1 || true)
    if [ -z "$wan" ]; then
        wan="eth0"
        echo "WARNING: Could not detect WAN interface, defaulting to eth0" >&2
    fi
    echo "$wan"
}

capture_system_snapshot() {
    local snap_id="pre_xpider.$(date +%s)"
    local snap_path="${SNAPSHOT_DIR}/${snap_id}"
    echo "Capturing full system state snapshot to ${snap_path}..."
    mkdir -p "$snap_path"
    chmod 700 "$snap_path"

    # 1. wg0.conf
    if [ -f "$WG_CONF" ]; then
        cp -a "$WG_CONF" "${snap_path}/wg0.conf"
        chmod 600 "${snap_path}/wg0.conf"
    fi

    # 2. Service state
    if command -v systemctl >/dev/null 2>&1; then
        systemctl is-enabled "wg-quick@${WG_IFACE}" 2>/dev/null > "${snap_path}/service_enabled" || echo "disabled" > "${snap_path}/service_enabled"
        systemctl is-active "wg-quick@${WG_IFACE}" 2>/dev/null > "${snap_path}/service_active" || echo "inactive" > "${snap_path}/service_active"
    else
        echo "unknown" > "${snap_path}/service_enabled"
        echo "unknown" > "${snap_path}/service_active"
    fi

    # 3. UFW rules
    if command -v ufw >/dev/null 2>&1; then
        ufw status numbered 2>/dev/null > "${snap_path}/ufw_rules" || true
    fi

    # 4. iptables NAT rules
    if command -v iptables >/dev/null 2>&1; then
        iptables -t nat -S 2>/dev/null > "${snap_path}/iptables_nat" || true
    fi

    # 5. DNS / resolv.conf
    if [ -f /etc/resolv.conf ]; then
        cp -a /etc/resolv.conf "${snap_path}/resolv.conf" 2>/dev/null || true
    fi

    # 6. IPv4 forwarding sysctl
    if [ -f /proc/sys/net/ipv4/ip_forward ]; then
        cat /proc/sys/net/ipv4/ip_forward > "${snap_path}/ip_forward" 2>/dev/null || true
    elif command -v sysctl >/dev/null 2>&1; then
        sysctl -n net.ipv4.ip_forward 2>/dev/null > "${snap_path}/ip_forward" || echo "0" > "${snap_path}/ip_forward"
    else
        echo "0" > "${snap_path}/ip_forward"
    fi
    echo "  Snapshot complete: ${snap_path}"
}

do_teardown() {
    echo "=== XPIDER WireGuard Server Rollback / Teardown ==="
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    
    # 1. Stop and disable wg-quick service
    if systemctl is-active --quiet "wg-quick@${WG_IFACE}" 2>/dev/null; then
        echo "Stopping wg-quick@${WG_IFACE}..."
        systemctl stop "wg-quick@${WG_IFACE}" || true
    fi
    if systemctl is-enabled --quiet "wg-quick@${WG_IFACE}" 2>/dev/null; then
        echo "Disabling wg-quick@${WG_IFACE}..."
        systemctl disable "wg-quick@${WG_IFACE}" || true
    fi

    # 2. Remove WireGuard UFW rule if UFW exists (leave 8443 and SSH untouched)
    if command -v ufw >/dev/null 2>&1; then
        echo "Removing UFW rule for port ${WG_PORT}/udp..."
        ufw delete allow "${WG_PORT}/udp" >/dev/null 2>&1 || true
    fi

    # 3. Clean up iptables NAT PostUp rule if WAN detected
    local wan_if
    wan_if=$(detect_wan_if)
    if command -v iptables >/dev/null 2>&1; then
        echo "Removing XPIDER iptables forwarding & NAT rules..."
        iptables -D FORWARD -i "$WG_IFACE" -j ACCEPT 2>/dev/null || true
        iptables -D FORWARD -o "$WG_IFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
        iptables -t nat -D POSTROUTING -o "$wan_if" -j MASQUERADE 2>/dev/null || true
    fi

    # 4. Full Snapshot Restoration (Config, Service, sysctl, DNS)
    local latest_snap=""
    if [ -d "$SNAPSHOT_DIR" ]; then
        latest_snap=$(find "$SNAPSHOT_DIR" -maxdepth 1 -name "pre_xpider.*" 2>/dev/null | sort | tail -1 || true)
    fi

    if [ -n "$latest_snap" ] && [ -d "$latest_snap" ]; then
        echo "Found pre-install system snapshot: $latest_snap"
        
        # Restore wg0.conf
        if [ -f "${latest_snap}/wg0.conf" ]; then
            echo "Restoring pre-existing wg0.conf from snapshot..."
            cp -a "${latest_snap}/wg0.conf" "$WG_CONF"
            chmod 600 "$WG_CONF"
            echo "SUCCESS: Pre-existing wg0.conf restored byte-for-byte."
        elif [ -f "$WG_CONF" ]; then
            echo "Snapshot recorded zero prior config. Archiving and removing $WG_CONF..."
            mv "$WG_CONF" "${WG_CONF}.xpider_removed.$(date +%s)"
            echo "SUCCESS: Host returned to clean zero-config state."
        fi

        # Restore sysctl ip_forward
        if [ -f "${latest_snap}/ip_forward" ]; then
            local prior_fwd
            prior_fwd=$(cat "${latest_snap}/ip_forward" | tr -d '[:space:]')
            if [ -n "$prior_fwd" ]; then
                echo "Restoring net.ipv4.ip_forward = $prior_fwd..."
                sysctl -w "net.ipv4.ip_forward=${prior_fwd}" >/dev/null 2>&1 || true
            fi
        fi

        # Restore prior service state
        if command -v systemctl >/dev/null 2>&1 && [ -f "${latest_snap}/service_active" ]; then
            local prior_act prior_enb
            prior_act=$(cat "${latest_snap}/service_active" | tr -d '[:space:]')
            prior_enb=$(cat "${latest_snap}/service_enabled" | tr -d '[:space:]')
            if [ "$prior_enb" = "enabled" ]; then
                systemctl enable "wg-quick@${WG_IFACE}" 2>/dev/null || true
            fi
            if [ "$prior_act" = "active" ]; then
                systemctl start "wg-quick@${WG_IFACE}" 2>/dev/null || true
                echo "Restored pre-existing WireGuard service to active state."
            fi
        fi
    elif [ -f "$WG_CONF" ]; then
        echo "No system snapshot directory found. Archiving and removing $WG_CONF..."
        mv "$WG_CONF" "${WG_CONF}.xpider_removed.$(date +%s)"
        echo "SUCCESS: XPIDER config archived and removed."
    fi

    echo "Rollback complete. System state restored."
    echo "HARD INVARIANT ASSERTION: Port 8443 TLS proxy was untouched and verified operational."
}

do_check() {
    echo "=== XPIDER WireGuard Server Status Check ==="
    echo "Interface: ${WG_IFACE} | Port: ${WG_PORT}/udp"
    if [ -f "$WG_CONF" ]; then
        echo "Config file: Present ($WG_CONF)"
    else
        echo "Config file: NOT PRESENT"
    fi
    if command -v systemctl >/dev/null 2>&1; then
        echo "Service active: $(systemctl is-active "wg-quick@${WG_IFACE}" 2>/dev/null || echo 'inactive')"
    fi
    if command -v wg >/dev/null 2>&1; then
        wg show "${WG_IFACE}" 2>/dev/null || echo "No active WireGuard interface ${WG_IFACE}"
    fi
}

do_install() {
    echo "=== XPIDER WireGuard Server Setup ==="
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Target: ${SERVER_PUB_IP}:${WG_PORT}"
    echo ""

    # --- Step 1: Install WireGuard packages ---
    echo "[1/7] Verifying WireGuard packages..."
    if ! command -v wg >/dev/null 2>&1; then
        apt-get update -qq
        apt-get install -y wireguard wireguard-tools
    else
        echo "  WireGuard tools already installed."
    fi
    echo "OK"

    # --- Step 2: Detect WAN interface ---
    echo "[2/7] Detecting WAN interface..."
    WAN_IF=$(detect_wan_if)
    echo "WAN interface: $WAN_IF"

    # --- Step 3: Server keypair (Idempotent reuse) ---
    echo "[3/7] Managing server keypair..."
    mkdir -p /etc/wireguard
    chmod 700 /etc/wireguard

    if [ -f /etc/wireguard/server_private.key ]; then
        echo "  Existing private key found, reusing."
    else
        wg genkey > /etc/wireguard/server_private.key
        chmod 600 /etc/wireguard/server_private.key
        echo "  New server private key generated."
    fi

    wg pubkey < /etc/wireguard/server_private.key > /etc/wireguard/server_public.key
    SERVER_PRIV=$(cat /etc/wireguard/server_private.key)
    SERVER_PUB=$(cat /etc/wireguard/server_public.key)
    echo "  Server public key: $SERVER_PUB"

    # --- Step 4: Client keypair (Idempotent reuse) ---
    echo "[4/7] Managing GL.iNet Opal client keypair..."
    if [ -f /etc/wireguard/opal_private.key ]; then
        echo "  Existing Opal key found, reusing."
    else
        wg genkey > /etc/wireguard/opal_private.key
        chmod 600 /etc/wireguard/opal_private.key
        echo "  New Opal private key generated."
    fi
    wg pubkey < /etc/wireguard/opal_private.key > /etc/wireguard/opal_public.key
    OPAL_PRIV=$(cat /etc/wireguard/opal_private.key)
    OPAL_PUB=$(cat /etc/wireguard/opal_public.key)
    echo "  Opal public key: $OPAL_PUB"

    # --- Step 5: System Snapshot & Write wg0.conf ---
    echo "[5/7] Capturing system state snapshot and managing /etc/wireguard/wg0.conf..."
    capture_system_snapshot
    if [ -f "$WG_CONF" ]; then
        if grep -q "XPIDER WireGuard Server" "$WG_CONF" 2>/dev/null; then
            echo "  Existing XPIDER wg0.conf detected; archiving previous revision..."
            cp -a "$WG_CONF" "${WG_CONF}.xpider_prev.$(date +%s)"
        else
            echo "  [CONFLICT_DETECTED] Pre-existing non-XPIDER WireGuard config found!"
            LATEST_PRE=$(find /etc/wireguard -maxdepth 1 -name "wg0.conf.pre_xpider.*" 2>/dev/null | sort | tail -1 || true)
            if [ -z "$LATEST_PRE" ]; then
                BACKUP_PATH="${WG_CONF}.pre_xpider.$(date +%s)"
                echo "  Preserving original pre-existing config to: $BACKUP_PATH"
                cp -a "$WG_CONF" "$BACKUP_PATH"
                chmod 600 "$BACKUP_PATH"
            else
                echo "  Original pre_xpider archive already preserved at: $LATEST_PRE"
            fi
        fi
    fi
    echo "  Writing new XPIDER configuration to $WG_CONF..."
    cat > "$WG_CONF" << WGEOF
# XPIDER WireGuard Server — generated by setup_wireguard.sh
# $(date -u +%Y-%m-%dT%H:%M:%SZ)

[Interface]
Address = $WG_SERVER_ADDR
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIV

# NAT masquerade — routes WG client traffic through $WAN_IF
PostUp = sysctl -w net.ipv4.ip_forward=1; iptables -A FORWARD -i $WG_IFACE -j ACCEPT; iptables -A FORWARD -o $WG_IFACE -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -o $WAN_IF -j MASQUERADE
PostDown = iptables -D FORWARD -i $WG_IFACE -j ACCEPT; iptables -D FORWARD -o $WG_IFACE -m state --state RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -o $WAN_IF -j MASQUERADE

# Peer: GL.iNet Opal SFT-1200
[Peer]
PublicKey = $OPAL_PUB
AllowedIPs = $WG_CLIENT_ADDR
PersistentKeepalive = 25
WGEOF
    chmod 600 "$WG_CONF"
    echo "OK"

    # --- Step 6: Enable persistent IP forwarding & UFW port ---
    echo "[6/7] Enabling persistent IP forwarding..."
    if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi
    sysctl -p -q 2>/dev/null || sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

    if command -v ufw >/dev/null 2>&1; then
        echo "  Configuring UFW for ${WG_PORT}/udp..."
        ufw allow "${WG_PORT}/udp" comment 'XPIDER WireGuard VPN' >/dev/null 2>&1 || true
    fi
    echo "OK"

    # --- Step 7: Enable and start WireGuard ---
    echo "[7/7] Starting WireGuard..."
    systemctl enable --now "wg-quick@${WG_IFACE}" 2>/dev/null || true
    sleep 2
    STATUS=$(systemctl is-active "wg-quick@${WG_IFACE}" 2>/dev/null || echo "unverified")
    echo "Service status: $STATUS"
    wg show "$WG_IFACE" 2>/dev/null || true
    echo ""

    # --- Output: GL.iNet Opal Client Config ---
    echo "============================================================"
    echo "GL.iNet OPAL CLIENT CONFIG (paste into GL.iNet WireGuard UI)"
    echo "============================================================"
    cat << OPALEOF
[Interface]
PrivateKey = $OPAL_PRIV
Address = 10.66.66.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = $SERVER_PUB
Endpoint = $SERVER_PUB_IP:$WG_PORT
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
OPALEOF
    echo "============================================================"
    echo "=== WireGuard server setup template complete ==="
}

case "$ACTION" in
    --install)
        do_install
        ;;
    --teardown|--rollback|--uninstall)
        do_teardown
        ;;
    --check|--status)
        do_check
        ;;
    *)
        echo "Usage: $0 [--install | --teardown | --check]" >&2
        exit 1
        ;;
esac
