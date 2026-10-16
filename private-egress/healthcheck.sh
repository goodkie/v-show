#!/usr/bin/env bash
# ==============================================================================
# healthcheck.sh
# 
# XPIDER AutoForm Sender Pro — Local Healthcheck Probe
# Protocol: OCA-DEV-1.4
# ==============================================================================

set -euo pipefail

PORT="${XPIDER_PORT:-8443}"
RES=$(curl -k -s --max-time 3 "https://127.0.0.1:${PORT}/_health" || echo '{"status":"FAIL"}')

if [[ "$RES" == *"OK"* ]]; then
  echo "[PASS] Healthcheck OK: $RES"
  exit 0
else
  echo "[FAIL] Healthcheck Failed: $RES" >&2
  exit 1
fi
