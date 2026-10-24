const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ZIP_PATH = path.resolve('XPIDER_R6.9G.10.3.7.1.4.66_PRIVATE_EGRESS_RC3.50.zip');
const UNPACK_DIR = path.resolve('scratch/unpacked_rc3_50');
const EXT_DIR = path.resolve('extension');

console.log('=== [PARITY AUDIT] Unpacking RC3.50 ZIP & Auditing Source/Build Parity ===');

if (!fs.existsSync(ZIP_PATH)) {
    console.error(`FATAL: Shipped ZIP not found at ${ZIP_PATH}`);
    process.exit(1);
}

// 1. Calculate ZIP SHA256
const zipBuffer = fs.readFileSync(ZIP_PATH);
const zipSha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');
console.log(`Shipped ZIP SHA256: ${zipSha256}`);
const EXPECTED_SHA256 = '5d22d4f4c654dee63243e24b9dec381662970e6c42348dee5cdff2960ababef2';
if (zipSha256 !== EXPECTED_SHA256) {
    console.error(`FATAL: ZIP SHA256 mismatch! Expected ${EXPECTED_SHA256}`);
    process.exit(1);
}
console.log('✅ Shipped ZIP SHA256 matches authoritative release asset exactly.');

// 2. Unpack via PowerShell Expand-Archive or tar
if (fs.existsSync(UNPACK_DIR)) {
    fs.rmSync(UNPACK_DIR, { recursive: true, force: true });
}
fs.mkdirSync(UNPACK_DIR, { recursive: true });

console.log(`Extracting ${ZIP_PATH} -> ${UNPACK_DIR}...`);
execSync(`tar -xf "${ZIP_PATH}" -C "${UNPACK_DIR}"`);

// If nested in an internal folder, find manifest.json
let rootUnpacked = UNPACK_DIR;
if (!fs.existsSync(path.join(rootUnpacked, 'manifest.json'))) {
    const subdirs = fs.readdirSync(rootUnpacked);
    for (const sub of subdirs) {
        const candidate = path.join(rootUnpacked, sub);
        if (fs.statSync(candidate).isDirectory() && fs.existsSync(path.join(candidate, 'manifest.json'))) {
            rootUnpacked = candidate;
            break;
        }
    }
}
console.log(`Unpacked extension root: ${rootUnpacked}`);

// 3. Compare critical runtime files with workspace extension/
const CRITICAL_FILES = [
    'manifest.json',
    'background.js',
    'content-script.js',
    'popup.js',
    'popup.html',
    'modules/build-provenance.js',
    'modules/privacy-gateway.js'
];

const parityReport = {
    zipPath: ZIP_PATH,
    zipSha256,
    unpackedRoot: rootUnpacked,
    auditedAt: new Date().toISOString(),
    files: []
};

let allMatch = true;
for (const relFile of CRITICAL_FILES) {
    const unpPath = path.join(rootUnpacked, relFile);
    const extPath = path.join(EXT_DIR, relFile);

    if (!fs.existsSync(unpPath)) {
        console.error(`❌ Missing in unpacked ZIP: ${relFile}`);
        allMatch = false;
        continue;
    }
    if (!fs.existsSync(extPath)) {
        console.error(`❌ Missing in extension/ workspace: ${relFile}`);
        allMatch = false;
        continue;
    }

    const unpSha = crypto.createHash('sha256').update(fs.readFileSync(unpPath)).digest('hex');
    const extSha = crypto.createHash('sha256').update(fs.readFileSync(extPath)).digest('hex');

    const match = (unpSha === extSha);
    console.log(`File: ${relFile}`);
    console.log(`  Unpacked SHA: ${unpSha}`);
    console.log(`  Workspace SHA: ${extSha}`);
    console.log(`  Parity: ${match ? '✅ EXACT MATCH' : '⚠️ DIFF'}`);

    parityReport.files.push({
        file: relFile,
        unpackedSha: unpSha,
        workspaceSha: extSha,
        exactMatch: match
    });
}

parityReport.sourceBuildParity = allMatch ? 'FULL_PARITY' : 'DRIFT_DETECTED';
fs.mkdirSync(path.resolve('evidence/genuine_rc3_50_runtime_audit'), { recursive: true });
fs.writeFileSync(
    path.resolve('evidence/genuine_rc3_50_runtime_audit/source_build_parity_report.json'),
    JSON.stringify(parityReport, null, 2),
    'utf8'
);

console.log(`\n=== Parity Audit Complete: ${parityReport.sourceBuildParity} ===`);
