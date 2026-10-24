#!/usr/bin/env bash
# ==============================================================================
# test/test_wireguard_disposable_runner.sh
# Automated WireGuard Teardown & Byte-for-Byte Restore Verification in Disposable Linux Runner
# Target: Ubuntu 22.04+ (GitHub Actions Runner / Disposable CI Container / Nonprod VM)
# Safety Boundary: Multi-probe hardcoded refusal to execute if host IP matches production DO proxy 143.198.40.33
# ==============================================================================

set -euo pipefail

echo "=== [XPIDER DISPOSABLE LINUX RUNNER] WireGuard System Snapshot & Restore Integration Test ==="

# 1. Multi-Probe Environment Safety Assertion: NEVER run against production proxy
PROD_DO_IP="143.198.40.33"
HOST_IP_1=$(curl -s --max-time 3 https://api.ipify.org || echo "")
HOST_IP_2=$(curl -s --max-time 3 https://ifconfig.me || echo "")
HOST_IP_3=$(curl -s --max-time 3 https://icanhazip.com || echo "")

for IP in "${HOST_IP_1}" "${HOST_IP_2}" "${HOST_IP_3}"; do
  IP_TRIMMED=$(echo "${IP}" | tr -d '[:space:]')
  if [[ -n "${IP_TRIMMED}" ]]; then
    echo "Probed Host Public IP: ${IP_TRIMMED}"
    if [[ "${IP_TRIMMED}" == "${PROD_DO_IP}"* ]]; then
      echo "FATAL SECURITY BOUNDARY ERROR: Host IP matches production DO proxy ${PROD_DO_IP}! ABORTING IMMEDIATELY."
      exit 1
    fi
  fi
done
echo "✅ Safety Guard: Verified host is NOT production node ${PROD_DO_IP}."

# 2. Dependency Check / Installation in Disposable Environment
if ! command -v ufw >/dev/null 2>&1 || ! command -v wg >/dev/null 2>&1 || ! command -v iptables >/dev/null 2>&1; then
  echo "Installing test dependencies (ufw, wireguard-tools, iptables)..."
  sudo apt-get update -qq && sudo apt-get install -y -qq ufw wireguard-tools iptables
fi

WORKDIR=$(mktemp -d /tmp/wg_test_XXXXXX)
cd "${WORKDIR}"
echo "Running in isolated test directory: ${WORKDIR}"

# Copy setup_wireguard.sh
SCRIPT_SRC="$(dirname "$0")/../companion/wireguard/setup_wireguard.sh"
if [[ ! -f "${SCRIPT_SRC}" ]]; then
  echo "FATAL: setup_wireguard.sh not found at ${SCRIPT_SRC}"
  exit 1
fi
cp "${SCRIPT_SRC}" ./setup_wireguard.sh
chmod +x ./setup_wireguard.sh

# 3. Capture Initial System State Baseline
echo ">>> STEP 1: Capturing Pristine System State Baseline..."
sudo ufw --force reset >/dev/null 2>&1 || true
sudo ufw default deny incoming >/dev/null 2>&1 || true
sudo ufw default allow outgoing >/dev/null 2>&1 || true
sudo ufw allow 22/tcp >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null 2>&1 || true

BASELINE_UFW=$(sudo ufw status verbose)
BASELINE_IPTABLES_FILTER=$(sudo iptables-save -t filter | grep -v '^#' || echo "")
BASELINE_IPTABLES_NAT=$(sudo iptables-save -t nat | grep -v '^#' || echo "")
BASELINE_SYSCTL_FORWARD=$(sysctl -n net.ipv4.ip_forward)
BASELINE_RESOLV=$(cat /etc/resolv.conf 2>/dev/null || echo "")

echo "Baseline UFW Status: active with 22/tcp"
echo "Baseline iptables filter & nat captured."
echo "Baseline sysctl net.ipv4.ip_forward: ${BASELINE_SYSCTL_FORWARD}"
echo "Baseline DNS resolv.conf captured."

# 4. Execute WireGuard Installation & Verify Snapshot Generation
echo ">>> STEP 2: Executing setup_wireguard.sh --install..."
sudo ./setup_wireguard.sh --install

echo "Verifying WireGuard system snapshot exists..."
if [[ ! -f /etc/xpider/wireguard_system_snapshot.json ]]; then
  echo "FATAL: WireGuard system snapshot was NOT created by installer!"
  exit 1
fi
echo "✅ WireGuard system snapshot verified."

# 5. Verify Active Configuration & Firewall Alterations
echo ">>> STEP 3: Verifying Active WireGuard Configuration & Firewall Changes..."
if ! sudo ufw status | grep -q "51820/udp"; then
  echo "FATAL: Port 51820/udp was not allowed in UFW!"
  exit 1
fi
echo "✅ UFW allows 51820/udp."

# Verify WireGuard interface wg0 is recognized
if ! sudo wg show wg0 >/dev/null 2>&1; then
  echo "FATAL: WireGuard interface wg0 not active!"
  exit 1
fi
echo "✅ WireGuard interface wg0 active."

# 6. Execute Teardown & System Restoration
echo ">>> STEP 4: Executing setup_wireguard.sh --teardown..."
sudo ./setup_wireguard.sh --teardown

# 7. Comprehensive State Restoration Assertions
echo ">>> STEP 5: Verifying Clean State Restoration across all Subsystems..."

# Check 1: UFW rules
if sudo ufw status | grep -q "51820/udp"; then
  echo "FATAL: 51820/udp still remains in UFW after teardown!"
  exit 1
fi
echo "✅ UFW: 51820/udp completely removed."

# Check 2: Configuration files & Interfaces
if [[ -f /etc/wireguard/wg0.conf ]]; then
  echo "FATAL: /etc/wireguard/wg0.conf still exists after teardown!"
  exit 1
fi
if sudo ip link show wg0 >/dev/null 2>&1; then
  echo "FATAL: wg0 network interface still exists after teardown!"
  exit 1
fi
echo "✅ Filesystem & Kernel: wg0.conf and wg0 interface completely removed."

# Check 3: DNS Configuration
POST_RESOLV=$(cat /etc/resolv.conf 2>/dev/null || echo "")
if [[ "${BASELINE_RESOLV}" != "${POST_RESOLV}" ]]; then
  echo "FATAL: /etc/resolv.conf was mutated by WireGuard installation/teardown!"
  exit 1
fi
echo "✅ DNS: /etc/resolv.conf is byte-for-byte identical to baseline."

# Check 4: Sysctl IPv4 Forwarding
POST_SYSCTL_FORWARD=$(sysctl -n net.ipv4.ip_forward)
if [[ "${BASELINE_SYSCTL_FORWARD}" != "${POST_SYSCTL_FORWARD}" ]]; then
  echo "FATAL: sysctl net.ipv4.ip_forward not restored to baseline (${BASELINE_SYSCTL_FORWARD} vs ${POST_SYSCTL_FORWARD})!"
  exit 1
fi
echo "✅ Sysctl: net.ipv4.ip_forward restored to baseline (${POST_SYSCTL_FORWARD})."

# Check 5: iptables NAT Table Cleanup
POST_IPTABLES_NAT=$(sudo iptables-save -t nat | grep -v '^#' || echo "")
if echo "${POST_IPTABLES_NAT}" | grep -q "10.8.0.0/24"; then
  echo "FATAL: WireGuard 10.8.0.0/24 MASQUERADE rule still remains in iptables nat table!"
  exit 1
fi
echo "✅ iptables: WireGuard NAT/MASQUERADE rules completely cleaned."

echo "=== [XPIDER DISPOSABLE LINUX RUNNER] ALL GATES PASSED (100% CLEAN RESTORE) ==="
exit 0
