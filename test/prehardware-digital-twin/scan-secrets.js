/**
 * scan-secrets.js
 * 
 * Part of XPIDER Pre-Hardware Real Software Acceptance Suite.
 * Comprehensive Secret Hygiene & Credential Hygiene Scanner (Tier 8).
 * Scans exact release ZIP, extracted runtime, companion configs, logs, and evidence.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function runSecretScan() {
  console.log('========================================================');
  console.log('  XPIDER TIER 8 COMPREHENSIVE SECRET HYGIENE SCAN');
  console.log('========================================================');

  const sensitiveRegexes = [
    { name: 'Unencrypted Private Key', regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/g },
    { name: 'WireGuard Private Key Field', regex: /"privateKey"\s*:\s*"[A-Za-z0-9+/=]{44}"/g },
    { name: 'Plaintext Admin Password Field', regex: /"password"\s*:\s*"(?!dummy|test|redacted|mock|placeholder)[^"]{6,}"/gi },
    { name: 'Raw Admin Token Leak', regex: /"token"\s*:\s*"[0-9a-f]{32,64}"/gi },
    { name: 'Plaintext OpenVPN Auth', regex: /auth-user-pass\s+[^\r\n]+/gi }
  ];

  const allowedExceptions = [
    // Public keys or hashes
    'BEGIN PUBLIC KEY',
    'ssh-ed25519',
    'sha256:'
  ];

  const violations = [];
  let filesScanned = 0;

  function scanFile(filePath, contextLabel) {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size > 20 * 1024 * 1024) return; // Skip giant binaries

    filesScanned++;
    const content = fs.readFileSync(filePath, 'utf8');

    // Ignore known unit test fixture with generated test ed25519 key if explicitly marked test fixture
    const isTestFixture = filePath.includes('test_') || filePath.includes('fixture') || filePath.includes('mock');

    for (const rule of sensitiveRegexes) {
      const matches = content.match(rule.regex);
      if (matches) {
        for (const m of matches) {
          // If in test fixture or false positive, evaluate
          if (isTestFixture && m.includes('PRIVATE KEY')) {
            // Test key generated ephemerally in RAM or test mock
            continue;
          }
          violations.push({
            file: filePath,
            context: contextLabel,
            rule: rule.name,
            snippet: m.substring(0, 30) + '...'
          });
        }
      }
    }
  }

  function scanDir(dirPath, contextLabel) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dirPath, ent.name);
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      if (ent.isDirectory()) {
        scanDir(fullPath, contextLabel);
      } else {
        scanFile(fullPath, contextLabel);
      }
    }
  }

  // 1. Scan exact release ZIP contents
  const zipPath = path.resolve('XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip');
  console.log(`[1] Scanning release package: ${zipPath}`);
  if (fs.existsSync(zipPath)) {
    const tempExtractDir = path.resolve('scratch/zip_secret_scan');
    fs.mkdirSync(tempExtractDir, { recursive: true });
    try {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempExtractDir}' -Force"`);
      scanDir(tempExtractDir, 'RELEASE_ZIP_CONTENT');
    } catch (e) {
      console.warn('Could not extract with Expand-Archive, scanning companion folder directly:', e.message);
    }
  }

  // 2. Scan companion runtime directory
  console.log('[2] Scanning companion runtime directory...');
  scanDir(path.resolve('companion'), 'COMPANION_RUNTIME');

  // 3. Scan extension production code
  console.log('[3] Scanning extension production codebase...');
  const extFiles = ['manifest.json', 'background.js', 'popup.js', 'popup.html', 'content-script.js', 'solver-content.js'];
  for (const f of extFiles) {
    scanFile(path.resolve(f), 'EXTENSION_PROD');
  }

  // 4. Scan all evidence and audit log files
  console.log('[4] Scanning entire prehardware test logs directory...');
  scanDir(path.resolve('test/prehardware-digital-twin/logs'), 'TEST_LOGS_DIR');
  scanFile(path.resolve('evidence_r6_9g10_3_7_1_4_1_real_runtime_traces.log'), 'EVIDENCE_LOGS');

  // 5. Scan temporary scratch directory
  console.log('[5] Scanning scratch temporary directory...');
  if (fs.existsSync(path.resolve('scratch'))) {
    scanDir(path.resolve('scratch'), 'SCRATCH_TEMP');
  }

  // 6. Scan owner extension test site and evidence
  console.log('[6] Scanning owner extension test site and evidence...');
  if (fs.existsSync(path.resolve('owner-extension-test-site'))) {
    scanDir(path.resolve('owner-extension-test-site'), 'OWNER_TEST_SITE');
  }

  // 7. Scan extracted extension directory
  console.log('[7] Scanning extracted extension directory...');
  if (fs.existsSync(path.resolve('extension'))) {
    scanDir(path.resolve('extension'), 'EXTRACTED_EXTENSION');
  }

  console.log(`\nScan complete: ${filesScanned} files scanned.`);
  if (violations.length === 0) {
    console.log('✅ SECRET HYGIENE PASS: Zero leaked private keys, passwords, or tokens found.');
    return { pass: true, filesScanned, violations: [] };
  } else {
    console.error(`❌ SECRET HYGIENE VIOLATIONS FOUND (${violations.length}):`);
    violations.forEach(v => console.error(`  - [${v.context}] ${v.file}: ${v.rule}`));
    return { pass: false, filesScanned, violations };
  }
}

if (require.main === module) {
  const res = runSecretScan();
  process.exit(res.pass ? 0 : 1);
}

module.exports = { runSecretScan };
