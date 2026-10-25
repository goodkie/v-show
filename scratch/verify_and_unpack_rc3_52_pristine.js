/**
 * scratch/verify_and_unpack_rc3_52_pristine.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ZIP_NAME = 'XPIDER_R6.9G.10.3.7.1.4.68_PRIVATE_EGRESS_RC3.52.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const TARGET_DIR = path.resolve('scratch/unpacked_rc3_52_pristine');

console.log('=== UNPACKING & VERIFYING PUBLISHED RC3.52 ZIP ===\n');

if (!fs.existsSync(ZIP_PATH)) {
  throw new Error(`ZIP not found at ${ZIP_PATH}`);
}

const zipSha256 = crypto.createHash('sha256').update(fs.readFileSync(ZIP_PATH)).digest('hex');
console.log(`ZIP SHA256: ${zipSha256}`);
if (zipSha256 !== 'cadcf3a66ae250943b509118f082392372a6f10beefed270217452d14b8178dc') {
  throw new Error('ZIP SHA256 mismatch against package record!');
}

if (fs.existsSync(TARGET_DIR)) {
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

console.log(`Extracting ${ZIP_PATH} to ${TARGET_DIR}...`);
execSync(`tar -xf "${ZIP_PATH}" -C "${TARGET_DIR}"`);

// Verify companion build ID sync in extracted package
const expectedBuildId = 'R6.9G.10.3.7.1.4.68-20261024-P0-RC3.52';

const ecsFile = path.join(TARGET_DIR, 'companion/ensure_companion_service.js');
const ecsContent = fs.readFileSync(ecsFile, 'utf8');
if (!ecsContent.includes(expectedBuildId)) {
  throw new Error(`ensure_companion_service.js in extracted package does not have ${expectedBuildId}`);
}
console.log('✅ Extracted ensure_companion_service.js build ID verified.');

const nhFile = path.join(TARGET_DIR, 'companion/native_host/xpider_native_host.js');
const nhContent = fs.readFileSync(nhFile, 'utf8');
if (!nhContent.includes(expectedBuildId)) {
  throw new Error(`xpider_native_host.js in extracted package does not have ${expectedBuildId}`);
}
console.log('✅ Extracted xpider_native_host.js build ID verified.');

const prsFile = path.join(TARGET_DIR, 'companion/privacy-relay-service.js');
const prsContent = fs.readFileSync(prsFile, 'utf8');
if (!prsContent.includes(expectedBuildId)) {
  throw new Error(`privacy-relay-service.js in extracted package does not have ${expectedBuildId}`);
}
console.log('✅ Extracted privacy-relay-service.js build ID verified.');

const bpFile = path.join(TARGET_DIR, 'extension/modules/build-provenance.js');
const bpContent = fs.readFileSync(bpFile, 'utf8');
if (!bpContent.includes(expectedBuildId)) {
  throw new Error(`build-provenance.js in extracted package does not have ${expectedBuildId}`);
}
console.log('✅ Extracted build-provenance.js build ID verified.');

console.log('\n=== EXTRACTED PRISTINE RC3.52 PACKAGE 100% VERIFIED ===\n');
