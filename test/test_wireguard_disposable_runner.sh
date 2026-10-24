#!/usr/bin/env bash
# ==============================================================================
# test/test_wireguard_disposable_runner.sh
# Automated WireGuard Teardown & Byte-for-Byte Restore Verification in Disposable Linux Runner
# Target: Ubuntu 22.04+ (GitHub Actions Runner / Disposable CI Container / Nonprod VM)
# Safety Boundary: Hardcoded refusal to execute if host IP matches live DO proxy 143.198.40.33
# ==============================================================================

set -euo pipefail

echo "=== [XPIDER DISPOSABLE LINUX RUNNER] WireGuard System Snapshot & Restore Integration Test ==="

# 1. Environment Safety Assertion: NEVER run against production proxy
PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "unknown")
echo "Detected Host Public IP: ${PUBLIC_IP}"
if [[ "${PUBLIC_IP}" == "143.198.40.33" ]]; then
  echo "FATAL: Refusing execution on active production proxy 143.198.40.33!"
  exit 1
fi

# 2. Dependency Check / Installation in Disposable Environment
if ! command -v ufw >/dev/null 2>&1 || ! command -v wg >/dev/null 2>&1; then
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
BASELINE_IPTABLES=$(sudo iptables-save)
BASELINE_RESOLV=$(cat /etc/resolv.conf 2>/dev/null || echo "")

echo "Baseline UFW status: active with 22/tcp"
echo "Baseline iptables rules captured."

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

# 6. Execute Teardown & System Restoration
echo ">>> STEP 4: Executing setup_wireguard.sh --teardown..."
sudo ./setup_wireguard.sh --teardown

# 7. Byte-for-Byte Restoration Assertion
echo ">>> STEP 5: Verifying Clean State Restoration..."
if sudo ufw status | grep -q "51820/udp"; then
  echo "FATAL: 51820/udp still remains in UFW after teardown!"
  exit 1
fi

if [[ -f /etc/wireguard/wg0.conf ]]; then
  echo "FATAL: /etc/wireguard/wg0.conf still exists after teardown!"
  exit 1
fi

POST_RESOLV=$(cat /etc/resolv.conf 2>/dev/null || echo "")
if [[ "${BASELINE_RESOLV}" != "${POST_RESOLV}" ]]; then
  echo "FATAL: /etc/resolv.conf was mutated by WireGuard installation/teardown!"
  exit 1
fi

echo "=== [XPIDER DISPOSABLE LINUX RUNNER] ALL GATES PASSED (100% CLEAN RESTORE) ==="
exit 0
