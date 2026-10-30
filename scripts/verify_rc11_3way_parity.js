const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const extDir = path.resolve('extension');
const unpDir = path.resolve('XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension');
const stgDir = path.resolve('scratch/staging_owner_beta_v7_0_0_rc11/extension');

const files = [
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'manifest.json',
    'modules/build-provenance.js',
    'modules/challenge-gate.js',
    'modules/privacy-gateway.js',
    'PACKAGE_INVENTORY_SHA256.txt'
];

console.log('=== VERIFYING 3-WAY PARITY FOR V7.0.0-RC11 ===');
let allMatch = true;
const rows = [];

for (const f of files) {
    const srcH = sha256(path.join(extDir, f));
    const unpH = sha256(path.join(unpDir, f));
    const stgH = sha256(path.join(stgDir, f));
    const match = (srcH === unpH && unpH === stgH);
    if (!match) allMatch = false;
    rows.push({
        file: f,
        src: srcH.slice(0, 16),
        unp: unpH.slice(0, 16),
        stg: stgH.slice(0, 16),
        status: match ? 'MATCH' : 'MISMATCH'
    });
}

console.table(rows);
if (!allMatch) {
    console.error('Parity check failed!');
    process.exit(1);
} else {
    console.log('✅ 100% 3-WAY PARITY CONFIRMED!');
}

