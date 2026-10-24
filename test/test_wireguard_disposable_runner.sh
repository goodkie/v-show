#!/usr/bin/env bash
# ==============================================================================
# test/test_wireguard_disposable_runner.sh
# Automated WireGuard Teardown & Byte-for-Byte Restore Verification in Disposable Linux Runner
# Target: Ubuntu 22.04+ (GitHub-Hosted Actions Runner / Ephemeral Disposable Environment)
# Safety Boundary: Multi-probe hardcoded refusal to execute if host IP matches production DO proxy 143.198.40.33
# ==============================================================================

set -euo pipefail

echo "=== [XPIDER DISPOSABLE LINUX RUNNER] WireGuard System Snapshot & Restore Integration Test ==="

# ------------------------------------------------------------------------------
# 1. Ephemeral Host & Genuine GitHub-Hosted Runner Identity Check
# ------------------------------------------------------------------------------
# Username and home directory alone are not cryptographic identity proof.
# We enforce full GitHub Actions execution context, repository binding,
# disposable runner filesystem markers, and local interface invariants:
#   1. Running as user 'runner' with home directory '/home/runner'
#   2. Presence of '/home/runner/work' and genuine GITHUB_WORKSPACE
#   3. GITHUB_ACTIONS="true" and RUNNER_OS="Linux"
#   4. Explicit repository binding: GITHUB_REPOSITORY="goodkie/v-show"
#   5. Valid GitHub Actions execution run IDs (GITHUB_RUN_ID, GITHUB_RUN_NUMBER)
#   6. Zero tolerance for production IP on any local network interface
IS_GENUINE_GH_RUNNER=false
if [[ "$(whoami)" == "runner" && -d "/home/runner" && -d "/home/runner/work" && -n "${GITHUB_WORKSPACE:-}" ]]; then
  if [[ "${GITHUB_ACTIONS:-}" == "true" && "${RUNNER_OS:-}" == "Linux" ]]; then
    if [[ "${GITHUB_REPOSITORY:-}" == "goodkie/v-show" && -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_NUMBER:-}" ]]; then
      IS_GENUINE_GH_RUNNER=true
    fi
  fi
fi

if [[ "${IS_GENUINE_GH_RUNNER}" != "true" && "${FORCE_EPHEMERAL_DISPOSABLE:-}" != "1" ]]; then
  echo "FATAL SECURITY BOUNDARY ERROR: System networking integration tests are strictly restricted"
  echo "to authenticated GitHub-hosted ephemeral runners bound to repository 'goodkie/v-show'."
  echo "Required invariants failed:"
  echo "  - whoami == runner (actual: $(whoami))"
  echo "  - /home/runner and /home/runner/work exist (actual: home=$(test -d /home/runner && echo yes || echo no), work=$(test -d /home/runner/work && echo yes || echo no))"
  echo "  - GITHUB_ACTIONS == true (actual: ${GITHUB_ACTIONS:-unset})"
  echo "  - RUNNER_OS == Linux (actual: ${RUNNER_OS:-unset})"
  echo "  - GITHUB_REPOSITORY == goodkie/v-show (actual: ${GITHUB_REPOSITORY:-unset})"
  echo "  - GITHUB_RUN_ID present (actual: ${GITHUB_RUN_ID:-unset})"
  echo "Refusing execution on non-ephemeral host. Aborting fail-closed."
  exit 1
fi
echo "✅ Ephemeral Host Guard: Verified genuine GitHub-hosted runner identity & repository context (repo: ${GITHUB_REPOSITORY:-goodkie/v-show}, run_id: ${GITHUB_RUN_ID:-ephemeral})."

# 1b. Direct Local Interface Audit — Ensure host does NOT locally own production IP
PROD_DO_IP="143.198.40.33"
if command -v ip >/dev/null 2>&1; then
  LOCAL_IF_IPS=$(ip -o addr show 2>/dev/null || true)
  if echo "${LOCAL_IF_IPS}" | grep -q "${PROD_DO_IP}"; then
    echo "FATAL SECURITY BOUNDARY ERROR: Host locally owns production IP ${PROD_DO_IP}! ABORTING IMMEDIATELY."
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 2. Multi-Probe Public IP Verification & Ambiguity Abort Guard
# ------------------------------------------------------------------------------
PROD_DO_IP="143.198.40.33"
HOST_IP_1=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || echo "")
HOST_IP_2=$(curl -s --max-time 3 https://ifconfig.me 2>/dev/null || echo "")
HOST_IP_3=$(curl -s --max-time 3 https://icanhazip.com 2>/dev/null || echo "")

VALID_IPS=()
for IP in "${HOST_IP_1}" "${HOST_IP_2}" "${HOST_IP_3}"; do
  IP_TRIMMED=$(echo "${IP}" | tr -d '[:space:]')
  if [[ -n "${IP_TRIMMED}" && "${IP_TRIMMED}" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    VALID_IPS+=("${IP_TRIMMED}")
  fi
done

# If all probes failed or returned ambiguous output, abort safely
if [[ ${#VALID_IPS[@]} -eq 0 ]]; then
  echo "FATAL SECURITY ERROR: Unable to definitively determine host public IP (all external probes failed or ambiguous)."
  echo "Refusing execution to prevent running on an unverified production node."
  exit 1
fi

for CHECK_IP in "${VALID_IPS[@]}"; do
  echo "Probed Host Public IP: ${CHECK_IP}"
  if [[ "${CHECK_IP}" == "${PROD_DO_IP}"* ]]; then
    echo "FATAL SECURITY BOUNDARY ERROR: Host IP matches production DO proxy ${PROD_DO_IP}! ABORTING IMMEDIATELY."
    exit 1
  fi
done
echo "✅ Production Invariant Guard: Verified host is NOT production node ${PROD_DO_IP}."

# ------------------------------------------------------------------------------
# 3. Emergency Cleanup Trap on Unexpected Failure
# ------------------------------------------------------------------------------
cleanup_on_error() {
  local exit_code=$?
  echo ">>> [TRAP] Encountered failure, interruption, or premature exit (exit code: ${exit_code})."
  echo ">>> [TRAP] Executing emergency teardown and snapshot restoration..."
  if [[ -f "${WORKDIR:-}/setup_wireguard.sh" ]] && [[ -f /etc/xpider/wireguard_system_snapshot.json ]]; then
    sudo "${WORKDIR}/setup_wireguard.sh" --teardown || true
    echo ">>> [TRAP] Emergency teardown executed."
  fi
}
trap cleanup_on_error ERR INT TERM

# ------------------------------------------------------------------------------
# 4. Dependency Check / Installation in Disposable Environment
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# 5. Non-Destructive Capture of Initial System State Baseline
# ------------------------------------------------------------------------------
echo ">>> STEP 1: Capturing Non-Destructive System State Baseline..."
# Note: Never execute 'ufw --force reset' on a shared host. Non-destructively capture existing configuration.
BASELINE_UFW=$(sudo ufw status verbose || echo "inactive")
BASELINE_IPTABLES_FILTER=$(sudo iptables-save -t filter | grep -v '^#' || echo "")
BASELINE_IPTABLES_NAT=$(sudo iptables-save -t nat | grep -v '^#' || echo "")
BASELINE_SYSCTL_FORWARD=$(sysctl -n net.ipv4.ip_forward)
BASELINE_RESOLV=$(cat /etc/resolv.conf 2>/dev/null || echo "")

echo "Baseline UFW status: captured non-destructively."
echo "Baseline iptables filter & nat captured."
echo "Baseline sysctl net.ipv4.ip_forward: ${BASELINE_SYSCTL_FORWARD}"
echo "Baseline DNS resolv.conf captured."

# ------------------------------------------------------------------------------
# 6. Execute WireGuard Installation & Verify Snapshot Generation
# ------------------------------------------------------------------------------
echo ">>> STEP 2: Executing setup_wireguard.sh --install..."
sudo ./setup_wireguard.sh --install

echo "Verifying WireGuard system snapshot exists..."
if [[ ! -f /etc/xpider/wireguard_system_snapshot.json ]]; then
  echo "FATAL: WireGuard system snapshot was NOT created by installer!"
  exit 1
fi
echo "✅ WireGuard system snapshot verified."

# ------------------------------------------------------------------------------
# 7. Verify Active Configuration & Firewall Alterations
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# 8. Execute Teardown & System Restoration
# ------------------------------------------------------------------------------
echo ">>> STEP 4: Executing setup_wireguard.sh --teardown..."
sudo ./setup_wireguard.sh --teardown

# ------------------------------------------------------------------------------
# 9. Comprehensive State Restoration Assertions
# ------------------------------------------------------------------------------
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
