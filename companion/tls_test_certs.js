/**
 * tls_test_certs.js
 * Generates temporary in-memory/on-disk TLS certificates for HTTPS Proxy testing (Blocker 9)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getOpenSslPath() {
  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'openssl';
}

function generateTlsTestCertificates(dir) {
  const targetDir = dir || path.join(os.tmpdir(), 'xpider_tls_certs_' + Date.now());
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const openssl = `"${getOpenSslPath()}"`;
  const caKey = path.join(targetDir, 'ca.key');
  const caCrt = path.join(targetDir, 'ca.crt');
  const serverKey = path.join(targetDir, 'server.key');
  const serverCsr = path.join(targetDir, 'server.csr');
  const serverCrt = path.join(targetDir, 'server.crt');
  const extCnf = path.join(targetDir, 'ext.cnf');

  // 1. Generate Root CA
  execSync(`${openssl} req -x509 -newkey rsa:2048 -days 1 -nodes -keyout "${caKey}" -out "${caCrt}" -subj "/CN=TestPrivacyCA"`, { stdio: 'ignore' });

  // 2. Generate Server CSR
  execSync(`${openssl} req -newkey rsa:2048 -nodes -keyout "${serverKey}" -out "${serverCsr}" -subj "/CN=127.0.0.1"`, { stdio: 'ignore' });

  // 3. Extension config with SAN
  fs.writeFileSync(extCnf, 'subjectAltName=IP:127.0.0.1\n', 'utf8');

  // 4. Sign server cert with Root CA
  execSync(`${openssl} x509 -req -in "${serverCsr}" -CA "${caCrt}" -CAkey "${caKey}" -CAcreateserial -out "${serverCrt}" -days 1 -extfile "${extCnf}"`, { stdio: 'ignore' });

  return {
    targetDir,
    caCrt: fs.readFileSync(caCrt, 'utf8'),
    serverKey: fs.readFileSync(serverKey, 'utf8'),
    serverCrt: fs.readFileSync(serverCrt, 'utf8')
  };
}

module.exports = { generateTlsTestCertificates };
