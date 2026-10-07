const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('1. Verifying parity with sync_build_parity.js...');
execSync('node sync_build_parity.js', { stdio: 'inherit' });

const extDir = path.resolve('send_message_backup/build/extension');
const zipOut = path.resolve('XPIDER_R6.9G.9_OWNER_DIAGNOSTIC_TEST_ONLY.zip');

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
        relPath: path.relative(base, full)
      });
    }
  }
  return results;
}

console.log('2. Computing hashes of extension files...');
const files = getAllFiles(extDir);
files.sort((a, b) => a.relPath.localeCompare(b.relPath));

const fileHashes = [];
for (const f of files) {
  const buf = fs.readFileSync(f.fullPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  fileHashes.push({ relPath: f.relPath, hash, size: buf.length });
}

console.log('3. Creating XPIDER_R6.9G.9_OWNER_DIAGNOSTIC_TEST_ONLY.zip...');
if (fs.existsSync(zipOut)) {
  fs.unlinkSync(zipOut);
}

// Compress all files inside extDir into zipOut
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${extDir}\\*' -DestinationPath '${zipOut}' -Force"`);

const zipBuf = fs.readFileSync(zipOut);
const zipSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
console.log(`Zip created: ${zipOut} (${zipBuf.length} bytes, SHA-256: ${zipSha})`);

console.log('4. Generating PACKAGE_INVENTORY_SHA256.txt...');
const nowIso = new Date().toISOString();
let inventoryContent = `PACKAGE INVENTORY SHA256 (XPIDER R6.9G.9 TEST-ONLY)\n`;
inventoryContent += `Root: send_message_backup/build/extension\n`;
inventoryContent += `Generated: ${nowIso}\n\n`;

for (const fh of fileHashes) {
  inventoryContent += `${fh.hash}  ${fh.relPath}\n`;
}

inventoryContent += `\nZIP ARTIFACT SHA256:\n`;
inventoryContent += `${zipSha}  XPIDER_R6.9G.9_OWNER_DIAGNOSTIC_TEST_ONLY.zip\n`;

fs.writeFileSync('PACKAGE_INVENTORY_SHA256.txt', inventoryContent, 'utf8');
console.log('Saved PACKAGE_INVENTORY_SHA256.txt');

console.log('5. Updating README_OWNER_DIAGNOSTIC_TEST.md...');
let readme = fs.readFileSync('README_OWNER_DIAGNOSTIC_TEST.md', 'utf8');
readme = readme.replace(/- \*\*ZIP SHA-256:\*\* `[a-f0-9]+`/, `- **ZIP SHA-256:** \`${zipSha}\``);
fs.writeFileSync('README_OWNER_DIAGNOSTIC_TEST.md', readme, 'utf8');
console.log('Updated README_OWNER_DIAGNOSTIC_TEST.md');

console.log('Owner diagnostic test package preparation complete.');
