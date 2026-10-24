/**
 * scratch/package_rc3_51.js
 *
 * Packaging script for XPIDER AutoForm Sender Pro RC3.51
 * Release: XPIDER_R6.9G.10.3.7.1.4.67_PRIVATE_EGRESS_RC3.51.zip
 * Tag: v6.9g.10.3-rc3.51.7.1.4.67
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const STAGING_DIR = path.resolve('scratch/staging_rc3_51');
const BASE_STAGING = path.resolve('scratch/staging_rc3_50');
const ZIP_NAME = 'XPIDER_R6.9G.10.3.7.1.4.67_PRIVATE_EGRESS_RC3.51.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);

console.log('=== PACKAGING RC3.51 RELEASE ASSET ===\n');

// 1. Prepare staging directory
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Copy base from staging_rc3_50
fs.cpSync(BASE_STAGING, STAGING_DIR, { recursive: true });

// 2. Sync updated runtime files from repo
const repoExt = path.resolve('extension');
const stagingExt = path.join(STAGING_DIR, 'extension');

fs.copyFileSync(
  path.join(repoExt, 'background.js'),
  path.join(stagingExt, 'background.js')
);

fs.copyFileSync(
  path.join(repoExt, 'modules/build-provenance.js'),
  path.join(stagingExt, 'modules/build-provenance.js')
);

// Sync companion modules
const stagingComp = path.join(STAGING_DIR, 'companion');
fs.mkdirSync(stagingComp, { recursive: true });
fs.copyFileSync(
  path.resolve('companion/privacy-relay-service.js'),
  path.join(stagingComp, 'privacy-relay-service.js')
);
fs.copyFileSync(
  path.resolve('companion/ensure_companion_service.js'),
  path.join(stagingComp, 'ensure_companion_service.js')
);
if (fs.existsSync('companion/companion-watchdog.js')) {
  fs.copyFileSync(
    path.resolve('companion/companion-watchdog.js'),
    path.join(stagingComp, 'companion-watchdog.js')
  );
}

// Sync native host
const stagingNativeHost = path.join(stagingComp, 'native_host');
fs.mkdirSync(stagingNativeHost, { recursive: true });
fs.copyFileSync(
  path.resolve('companion/native_host/xpider_native_host.js'),
  path.join(stagingNativeHost, 'xpider_native_host.js')
);

// Sync wireguard modules
const stagingWgDir = path.join(stagingComp, 'wireguard');
fs.mkdirSync(stagingWgDir, { recursive: true });
fs.copyFileSync(
  path.resolve('companion/wireguard/setup_wireguard.sh'),
  path.join(stagingWgDir, 'setup_wireguard.sh')
);
if (fs.existsSync('companion/wireguard/WIREGUARD_AUDIT_AND_HEALTH_ASSERTION.md')) {
  fs.copyFileSync(
    path.resolve('companion/wireguard/WIREGUARD_AUDIT_AND_HEALTH_ASSERTION.md'),
    path.join(stagingWgDir, 'WIREGUARD_AUDIT_AND_HEALTH_ASSERTION.md')
  );
}
if (fs.existsSync('companion/wireguard/OPAL_PHYSICAL_PAIRING_AND_AUTH_PLAN.md')) {
  fs.copyFileSync(
    path.resolve('companion/wireguard/OPAL_PHYSICAL_PAIRING_AND_AUTH_PLAN.md'),
    path.join(stagingWgDir, 'OPAL_PHYSICAL_PAIRING_AND_AUTH_PLAN.md')
  );
}

// 3. Generate inventory for extension
function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function scanFiles(dir, base = '') {
  let list = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      list = list.concat(scanFiles(full, rel));
    } else {
      if (e.name !== 'PACKAGE_INVENTORY_SHA256.txt') {
        list.push({ rel: rel.replace(/\\/g, '/'), hash: hashFile(full) });
      }
    }
  }
  return list;
}

const extFiles = scanFiles(stagingExt);
extFiles.sort((a, b) => a.rel.localeCompare(b.rel));
const extInvLines = extFiles.map(f => `${f.hash}  ${f.rel}`);
fs.writeFileSync(path.join(stagingExt, 'PACKAGE_INVENTORY_SHA256.txt'), extInvLines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(repoExt, 'PACKAGE_INVENTORY_SHA256.txt'), extInvLines.join('\n') + '\n', 'utf8');

// 4. Generate root package inventory
const rootFiles = scanFiles(STAGING_DIR);
rootFiles.sort((a, b) => a.rel.localeCompare(b.rel));
const rootInvLines = rootFiles.map(f => `${f.hash}  ${f.rel}`);
fs.writeFileSync(path.join(STAGING_DIR, 'PACKAGE_INVENTORY_SHA256.txt'), rootInvLines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.resolve('PACKAGE_INVENTORY_SHA256.txt'), rootInvLines.join('\n') + '\n', 'utf8');

console.log(`Generated extension inventory: ${extFiles.length} files`);
console.log(`Generated root package inventory: ${rootFiles.length} files`);

// 5. Secret scan
console.log('\nScanning for secrets/tokens...');
const secretRegex = /dop_v1_[a-f0-9]{64}|ghp_[A-Za-z0-9]{36}|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}/;
let secretsFound = 0;
for (const f of rootFiles) {
  if (f.rel.endsWith('.png') || f.rel.endsWith('.jpg') || f.rel.endsWith('.wav') || f.rel.endsWith('.exe')) continue;
  const content = fs.readFileSync(path.join(STAGING_DIR, f.rel), 'utf8');
  if (secretRegex.test(content)) {
    console.error(`🚨 SECRET DETECTED in ${f.rel}`);
    secretsFound++;
  }
}
if (secretsFound > 0) throw new Error('Packaging aborted: secrets detected!');
console.log('✅ Secret scan clean: 0 secrets found.');

// 6. Create archive using tar.exe
console.log(`\nArchiving into ${ZIP_NAME}...`);
if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

const topItems = fs.readdirSync(STAGING_DIR);
execSync(`tar -a -cf "${ZIP_PATH}" -C "${STAGING_DIR}" ${topItems.join(' ')}`);

const zipBuf = fs.readFileSync(ZIP_PATH);
const zipSha256 = crypto.createHash('sha256').update(zipBuf).digest('hex');

console.log(`\n================ RC3.51 PACKAGE READY ================`);
console.log(`ZIP Path: ${ZIP_PATH}`);
console.log(`ZIP Size: ${zipBuf.length} bytes`);
console.log(`ZIP SHA256: ${zipSha256}`);
console.log(`=======================================================\n`);

fs.writeFileSync('scratch/rc3_51_package_info.json', JSON.stringify({
  zipName: ZIP_NAME,
  zipPath: ZIP_PATH,
  zipSize: zipBuf.length,
  zipSha256: zipSha256,
  tag: 'v6.9g.10.3-rc3.51.7.1.4.67',
  buildId: 'R6.9G.10.3.7.1.4.67-20261024-P0-RC3.51',
  builtAt: new Date().toISOString()
}, null, 2), 'utf8');
