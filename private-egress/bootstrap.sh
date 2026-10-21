#!/usr/bin/env bash
# ==============================================================================
# bootstrap.sh
# 
# XPIDER AutoForm Sender Pro — Fully Automated Private Egress Bootstrapper
# Protocol: OCA-DEV-1.4 (Issue #6 R6.9G.10.3)
# Target OS: Ubuntu 22.04 / 24.04 LTS, Debian 11 / 12
#
# Invariants:
#   - Idempotent execution
#   - Strict TLS on port 8443 with pinned CA + IP SAN
#   - Zero open proxy (Authenticated CONNECT only)
#   - Dedicated unprivileged system user 'xpider'
#   - UFW default-deny with SSH and proxy port allowed
#   - Root/xpider-readable credentials only (0600)
#   - Machine-readable output for Windows Companion Auto-Provisioner
# ==============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] bootstrap.sh must be run as root" >&2
   exit 1
fi

echo "[1/7] Discovering environment..."
PUBLIC_IP="${XPIDER_PUBLIC_IP:-}"
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP=$(curl -s4 --max-time 5 https://api.ipify.org || curl -s4 --max-time 5 https://icanhazip.com || hostname -I | awk '{print $1}')
fi
echo "Observed Public IP: $PUBLIC_IP"

PORT="${XPIDER_PORT:-8443}"
CONFIG_DIR="/etc/xpider-egress"
INSTALL_DIR="/opt/xpider-egress"
SERVICE_NAME="xpider-egress"

echo "[2/7] Installing required system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nodejs openssl ufw curl > /dev/null

# Ensure 'xpider' system user exists
if ! id "xpider" &>/dev/null; then
  useradd --system --no-create-home --shell /bin/false xpider
fi

echo "[3/7] Setting up directories..."
mkdir -p "$CONFIG_DIR"
mkdir -p "$INSTALL_DIR"

# Copy proxy service file to install directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/proxy-service.js" ]]; then
  cp "$SCRIPT_DIR/proxy-service.js" "$INSTALL_DIR/proxy-service.js"
elif [[ -f "/tmp/xpider-bootstrap/proxy-service.js" ]]; then
  cp "/tmp/xpider-bootstrap/proxy-service.js" "$INSTALL_DIR/proxy-service.js"
fi

if [[ ! -f "$INSTALL_DIR/proxy-service.js" ]]; then
  echo "[ERROR] proxy-service.js not found!" >&2
  exit 1
fi

echo "[4/7] Generating private CA and TLS certificate with IP SAN..."
CA_KEY="$CONFIG_DIR/ca.key"
CA_CRT="$CONFIG_DIR/ca.crt"
SRV_KEY="$CONFIG_DIR/server.key"
SRV_CSR="$CONFIG_DIR/server.csr"
SRV_CRT="$CONFIG_DIR/server.crt"

if [[ ! -f "$CA_CRT" ]]; then
  openssl genrsa -out "$CA_KEY" 4096 2>/dev/null
  openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 \
    -subj "/C=US/O=XPIDER/CN=XPIDER Private Egress Root CA" \
    -out "$CA_CRT" 2>/dev/null
fi

# Create OpenSSL SAN configuration for the server certificate
OPENSSL_CNF="$CONFIG_DIR/openssl.cnf"
cat > "$OPENSSL_CNF" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
O = XPIDER
CN = ${PUBLIC_IP}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
IP.1 = ${PUBLIC_IP}
IP.2 = 127.0.0.1
DNS.1 = localhost
EOF

openssl genrsa -out "$SRV_KEY" 2048 2>/dev/null
openssl req -new -key "$SRV_KEY" -out "$SRV_CSR" -config "$OPENSSL_CNF" 2>/dev/null
openssl x509 -req -in "$SRV_CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$SRV_CRT" -days 1825 -sha256 -extensions v3_req -extfile "$OPENSSL_CNF" 2>/dev/null

# [P0-3 Hardening] Delete CA private signing key and CSR/configs immediately after server cert issuance.
# The CA signing key is never needed at runtime and must NOT remain accessible to the proxy service user.
rm -f "$CA_KEY" "$SRV_CSR" "$OPENSSL_CNF" "${CONFIG_DIR}"/*.srl 2>/dev/null || true

echo "[5/7] Managing proxy credentials..."
CREDS_FILE="$CONFIG_DIR/credentials.json"
USERNAME="${XPIDER_PROXY_USER:-xpider_owner}"
PASSWORD="${XPIDER_PROXY_PASS:-}"

if [[ -z "$PASSWORD" ]]; then
  if [[ -f "$CREDS_FILE" ]]; then
    # Keep existing password on rerun
    PASSWORD=$(node -e "try { console.log(require('$CREDS_FILE').password); } catch(_) {}")
  fi
  if [[ -z "$PASSWORD" ]]; then
    PASSWORD=$(openssl rand -hex 24)
  fi
fi

cat > "$CREDS_FILE" <<EOF
{
  "username": "${USERNAME}",
  "password": "${PASSWORD}",
  "updatedAt": $(date +%s)
}
EOF

# [P0-3 Hardening] Restrict directory permissions: root owns config dir, xpider only reads server cert/key/creds
chmod 755 "$CONFIG_DIR"
chown -R root:root "$CONFIG_DIR"
chown xpider:xpider "$SRV_CRT" "$SRV_KEY" "$CREDS_FILE"
chmod 600 "$SRV_KEY" "$CREDS_FILE"
chmod 644 "$SRV_CRT" "$CA_CRT"
chown -R xpider:xpider "$INSTALL_DIR"

echo "[6/7] Creating systemd service unit..."
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_BIN=$(which node || echo "/usr/bin/node")

cat > "$SYSTEMD_UNIT" <<EOF
[Unit]
Description=XPIDER Private Egress TLS Proxy
After=network.target

[Service]
Type=simple
User=xpider
Group=xpider
WorkingDirectory=${INSTALL_DIR}
Environment="XPIDER_EGRESS_PORT=${PORT}"
Environment="XPIDER_CONFIG_DIR=${CONFIG_DIR}"
ExecStart=${NODE_BIN} ${INSTALL_DIR}/proxy-service.js
Restart=always
RestartSec=3
LimitNOFILE=65536
ProtectSystem=strict
ReadWritePaths=${CONFIG_DIR} ${INSTALL_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "[7/7] Configuring firewall (UFW)..."
ufw default deny incoming > /dev/null 2>&1 || true
ufw default allow outgoing > /dev/null 2>&1 || true
ufw allow 22/tcp comment 'SSH' > /dev/null 2>&1 || true
# DigitalOcean Cloud Firewall provides the dynamic /32 perimeter scoping to the Owner IP.
# Host UFW allows port 8443 so that future Owner dynamic IP rotations do not cause a host-level lockout.
echo "Opening UFW proxy port ${PORT} (Cloud Firewall enforces dynamic Owner /32 CIDR boundary)"
ufw allow "${PORT}/tcp" comment 'XPIDER Private Egress Proxy' > /dev/null 2>&1 || true
ufw --force enable > /dev/null 2>&1 || true

# Verification probe
sleep 1
HEALTH_CHECK=$(curl -k -s --max-time 3 "https://127.0.0.1:${PORT}/_health" || echo "FAIL")
if [[ "$HEALTH_CHECK" != *"healthy"* && "$HEALTH_CHECK" != *"OK"* ]]; then
  echo "[WARNING] Healthcheck probe did not return healthy status immediately: $HEALTH_CHECK"
fi

# [P0-6 Hardening] Separate TLS Certificate Fingerprint from Egress Identity Fingerprint
TLS_CA_FINGERPRINT=$(openssl x509 -in "$CA_CRT" -noout -sha256 -fingerprint | cut -d'=' -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')
TLS_SPKI_FINGERPRINT=$(openssl x509 -in "$SRV_CRT" -noout -pubkey 2>/dev/null | openssl pkey -pubin -outform der 2>/dev/null | openssl dgst -sha256 | cut -d'=' -f2 | tr -d ' ' | tr '[:upper:]' '[:lower:]' || echo "$TLS_CA_FINGERPRINT")
EXPECTED_EGRESS_FINGERPRINT=$(node -e "const crypto = require('crypto'); console.log(crypto.createHash('sha256').update('${PUBLIC_IP}').digest('hex').substring(0, 16));")

# [P0-2 Hardening] Secure descriptor in root-only /etc/xpider-egress/descriptor.json (0600)
# Never write to /tmp and NEVER print password/credentials to stdout!
DESCRIPTOR_FILE="$CONFIG_DIR/descriptor.json"
node -e "
const fs = require('fs');
const desc = {
  status: 'READY',
  host: '${PUBLIC_IP}',
  port: ${PORT},
  username: '${USERNAME}',
  password: '${PASSWORD}',
  caCertPem: fs.readFileSync('${CA_CRT}', 'utf8'),
  tlsCaFingerprint: '${TLS_CA_FINGERPRINT}',
  tlsSpkiFingerprint: '${TLS_SPKI_FINGERPRINT}',
  observedEgressIp: '${PUBLIC_IP}',
  expectedEgressFingerprint: '${EXPECTED_EGRESS_FINGERPRINT}',
  egressIdentityGroup: 'do-${PUBLIC_IP}',
  protocol: 'HTTPS_PROXY',
  createdAt: Date.now()
};
fs.writeFileSync('${DESCRIPTOR_FILE}', JSON.stringify(desc, null, 2));
"
chmod 600 "$DESCRIPTOR_FILE"
chown root:root "$DESCRIPTOR_FILE"

echo "=== [XPIDER_BOOTSTRAP_SUCCESS] ==="
echo "DESCRIPTOR_LOCATION: $DESCRIPTOR_FILE"
echo "OBSERVED_IP: $PUBLIC_IP"
echo "PORT: $PORT"
echo "TLS_CA_FINGERPRINT: $TLS_CA_FINGERPRINT"
echo "EXPECTED_EGRESS_FINGERPRINT: $EXPECTED_EGRESS_FINGERPRINT"
echo "=== [XPIDER_BOOTSTRAP_END] ==="
exit 0
