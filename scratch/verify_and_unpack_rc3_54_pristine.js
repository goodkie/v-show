const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ZIP_NAME = 'XPIDER_R6.9G.10.3.7.1.4.70_PRIVATE_EGRESS_RC3.54.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const TARGET_DIR = path.resolve('scratch/unpacked_rc3_54_pristine');
const EXPECTED_BUILD_ID = 'R6.9G.10.3.7.1.4.70-20261024-P0-RC3.54';
const EXPECTED_SHA256 = 'ab38ae8e76cd9ddd2c329d001da9a4e94b0a6197adb1427d4bf15646631c8fac';

console.log('=== VERIFYING & UNPACKING PRISTINE RC3.54 RELEASE ASSET ===\n');

if (!fs.existsSync(ZIP_PATH)) throw new Error(`Missing ${ZIP_PATH}`);
const zipBuf = fs.readFileSync(ZIP_PATH);
const actualSha256 = crypto.createHash('sha256').update(zipBuf).digest('hex');

console.log(`ZIP Size: ${zipBuf.length} bytes`);
console.log(`Actual SHA256: ${actualSha256}`);
console.log(`Expected SHA256: ${EXPECTED_SHA256}`);

if (actualSha256 !== EXPECTED_SHA256) {
    throw new Error(`SHA256 mismatch! Actual=${actualSha256}, Expected=${EXPECTED_SHA256}`);
}
console.log('✅ ZIP SHA256 matches immutable digest 100%!');

if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

console.log(`Unpacking ${ZIP_NAME} into ${TARGET_DIR}...`);
execSync(`tar -xf "${ZIP_PATH}" -C "${TARGET_DIR}"`);

// Verify Build IDs in unpacked files
const filesToCheck = [
    'companion/privacy-relay-service.js',
    'companion/ensure_companion_service.js',
    'companion/native_host/xpider_native_host.js',
    'extension/modules/build-provenance.js'
];

for (const rel of filesToCheck) {
    const full = path.join(TARGET_DIR, rel);
    if (!fs.existsSync(full)) throw new Error(`Missing file in unpacked archive: ${rel}`);
    const txt = fs.readFileSync(full, 'utf8');
    if (!txt.includes(EXPECTED_BUILD_ID)) {
        throw new Error(`Build ID ${EXPECTED_BUILD_ID} not found in unpacked ${rel}`);
    }
    console.log(`✅ ${rel} contains expected Build ID: ${EXPECTED_BUILD_ID}`);
}

console.log('\n🎉 Pristine RC3.54 archive verified and unpacked successfully!');
