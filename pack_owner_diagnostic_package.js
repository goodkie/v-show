/**
 * pack_owner_diagnostic_package.js
 * 
 * Packages BOTH the Chrome/Edge MV3 extension build AND the Companion Privacy Relay service
 * into a single unified Owner diagnostic ZIP archive (Issue #6 R6.9G.10.3).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('1. Verifying parity with sync_build_parity.js...');
execSync('node sync_build_parity.js', { stdio: 'inherit' });

const versionStr = process.argv[2] || 'R6.9G.10.3.7.1.4.5';
const extDir = path.resolve('send_message_backup/build/extension');
const compDir = path.resolve('companion');
const stagingDir = path.resolve('staging_owner_package');
const zipName = `XPIDER_${versionStr}_OWNER_DIAGNOSTIC_TEST_ONLY.zip`;
const zipOut = path.resolve(zipName);

// Clean staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Copy extension to staging/extension
const stagingExtDir = path.join(stagingDir, 'extension');
fs.cpSync(extDir, stagingExtDir, { recursive: true });

// Copy companion to staging/companion (skipping runtime artifacts)
const stagingCompDir = path.join(stagingDir, 'companion');
fs.mkdirSync(stagingCompDir, { recursive: true });

function copyCompanionFiles(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.control_token' || entry.name === 'privacy_relay.log' || entry.name === 'node_modules' || entry.name === 'router_pairing_config.json' || entry.name.startsWith('test') || entry.name.startsWith('mock') || entry.name === 'tls_test_certs.js') {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyCompanionFiles(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
copyCompanionFiles(compDir, stagingCompDir);

// Copy infra to staging/infra
const stagingInfraDir = path.join(stagingDir, 'infra');
if (fs.existsSync('infra')) {
  fs.cpSync('infra', stagingInfraDir, { recursive: true });
}

// Copy router to staging/router
const stagingRouterDir = path.join(stagingDir, 'router');
if (fs.existsSync('router')) {
  fs.cpSync('router', stagingRouterDir, { recursive: true });
}

// Copy XPIDER_AUTO_SETUP.bat to staging root
if (fs.existsSync('XPIDER_AUTO_SETUP.bat')) {
  fs.copyFileSync('XPIDER_AUTO_SETUP.bat', path.join(stagingDir, 'XPIDER_AUTO_SETUP.bat'));
}

// Copy owner-extension-test-site to staging/owner-extension-test-site (Issue #6 Directive Handoff Fix)
const stagingTestSiteDir = path.join(stagingDir, 'owner-extension-test-site');
if (fs.existsSync('owner-extension-test-site')) {
  fs.cpSync('owner-extension-test-site', stagingTestSiteDir, { recursive: true });
}

function getAllFiles(dir, base = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(full, base));
    } else {
      results.push({
        fullPath: full,
        relPath: path.relative(base, full).replace(/\\/g, '/')
      });
    }
  }
  return results;
}

console.log('2. Computing file inventory and SHA-256 hashes...');
const files = getAllFiles(stagingDir);
files.sort((a, b) => a.relPath.localeCompare(b.relPath));

const fileHashes = [];
for (const f of files) {
  const buf = fs.readFileSync(f.fullPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  fileHashes.push({ relPath: f.relPath, hash, size: buf.length });
}

console.log(`3. Creating ${zipName}...`);
if (fs.existsSync(zipOut)) {
  fs.unlinkSync(zipOut);
}

// Compress all contents inside stagingDir into zipOut
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOut}' -Force"`);

const zipBuf = fs.readFileSync(zipOut);
const zipSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
console.log(`Zip created: ${zipOut} (${zipBuf.length} bytes, SHA-256: ${zipSha})`);

console.log('4. Generating PACKAGE_INVENTORY_SHA256.txt...');
const nowIso = new Date().toISOString();
let inventoryContent = `PACKAGE INVENTORY SHA256 (XPIDER ${versionStr} UNIFIED OWNER DIAGNOSTIC BUNDLE)\n`;
inventoryContent += `Generated: ${nowIso}\n`;
inventoryContent += `Archive: ${zipName}\n`;
inventoryContent += `SHA256: ${zipSha}\n\n`;
inventoryContent += `INVENTORY (Root: /):\n`;

for (const fh of fileHashes) {
  inventoryContent += `${fh.hash}  ${fh.relPath}\n`;
}

inventoryContent += `\nZIP ARTIFACT SHA256:\n`;
inventoryContent += `${zipSha}  ${zipName}\n`;

fs.writeFileSync('PACKAGE_INVENTORY_SHA256.txt', inventoryContent, 'utf8');
fs.writeFileSync(path.join(extDir, 'PACKAGE_INVENTORY_SHA256.txt'), inventoryContent, 'utf8');
console.log('Saved PACKAGE_INVENTORY_SHA256.txt to root and extension directory');

console.log('5. Updating README_OWNER_DIAGNOSTIC_TEST.md...');
if (fs.existsSync('README_OWNER_DIAGNOSTIC_TEST.md')) {
  let readme = fs.readFileSync('README_OWNER_DIAGNOSTIC_TEST.md', 'utf8');
  readme = readme.replace(/XPIDER_R6\.9G\.10[0-9._a-zA-Z-]*_OWNER_DIAGNOSTIC_TEST_ONLY\.zip/g, zipName);
  readme = readme.replace(/- \*\*ZIP SHA-256:\*\* `[a-f0-9A-Za-z_-]+`/, `- **ZIP SHA-256:** \`${zipSha}\``);
  fs.writeFileSync('README_OWNER_DIAGNOSTIC_TEST.md', readme, 'utf8');
  console.log('Updated README_OWNER_DIAGNOSTIC_TEST.md with ZIP SHA-256');
}

// Clean up staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

console.log('Owner unified diagnostic test package preparation complete.');
