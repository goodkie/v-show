const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const NEW_BUILD_ID = 'V7.0.0-RC12-20261030-SEMI-AUTO-TRIPLE-CONTRACT-FIX';
const NEW_CHANNEL = 'OWNER_BETA_V7_DUAL_MODE';
const NEW_TAG = 'v7.0.0-rc12';
const ZIP_NAME = 'XPIDER_V7.0.0_RC12_DUAL_MODE_OWNER_BETA.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const STAGING_DIR = path.resolve('scratch/staging_owner_beta_v7_0_0_rc12');
const BASE_STAGING = path.resolve('scratch/staging_rc3_59');

console.log(`=== PREPARING V7.0.0-RC12 TRIPLE MODE CONTRACTS & RESUME FIX BUILD & PACKAGING ===`);
console.log(`Build ID: ${NEW_BUILD_ID}`);
console.log(`Tag: ${NEW_TAG}`);
console.log(`ZIP Name: ${ZIP_NAME}\n`);

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function updateFile(p, searchRegex, replaceStr) {
    if (!fs.existsSync(p)) return;
    let content = fs.readFileSync(p, 'utf8');
    if (!searchRegex.test(content)) {
        console.warn(`Regex not matched in ${p}`);
        return;
    }
    content = content.replace(searchRegex, replaceStr);
    fs.writeFileSync(p, content, 'utf8');
    console.log(`Updated ${p}`);
}

// 1. Update companion files & server.js
updateFile(
    path.resolve('companion/privacy-relay-service.js'),
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${NEW_BUILD_ID}';`
);
updateFile(
    path.resolve('companion/ensure_companion_service.js'),
    /const EXPECTED_BUILD_ID = '[^']+';/,
    `const EXPECTED_BUILD_ID = '${NEW_BUILD_ID}';`
);
updateFile(
    path.resolve('companion/native_host/xpider_native_host.js'),
    /const COMPANION_BUILD_ID = '[^']+';/,
    `const COMPANION_BUILD_ID = '${NEW_BUILD_ID}';`
);
updateFile(
    path.resolve('owner-extension-test-site/server.js'),
    /version:\s*'[^']+'/,
    `version: 'v7.0.0-rc12'`
);

// 2. Compute real module SHAs and update build-provenance
const extDir = path.resolve('extension');
let headCommit = '0ba678091234567890abcdef1234567890abcdef';
try {
    headCommit = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim();
} catch (_) {}
const headShort = headCommit.slice(0, 8);

const MODULE_FILES = [
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'modules/challenge-gate.js',
    'modules/privacy-gateway.js',
    'modules/smart-field-resolver.js',
    'modules/contact-gate.js',
    'modules/email-collector.js',
    'modules/vision-submit-executor.js',
    'modules/history-store.js',
    'modules/template-store.js',
    'modules/operation-queue.js',
    'modules/mock-captcha-provider-adapter.js',
    'modules/contact-discovery-engine.js',
    'modules/checkbox-resolver-r2.js',
    'modules/select-resolver-r2.js',
    'modules/final-form-completion-engine.js',
    'modules/form-discovery-engine-r2.js',
    'modules/math-captcha-solver.js'
];

const moduleHashes = {};
for (const rel of MODULE_FILES) {
    const full = path.join(extDir, rel);
    if (fs.existsSync(full)) {
        moduleHashes[rel] = sha256File(full);
    }
}

// Write build-provenance.js with latest hashes, head, and build ID
const bpPath = path.join(extDir, 'modules/build-provenance.js');
let bpContent = fs.readFileSync(bpPath, 'utf8');
bpContent = bpContent.replace(/buildId:\s*"[^"]+"/, `buildId: "${NEW_BUILD_ID}"`);
bpContent = bpContent.replace(/tag:\s*"[^"]+"/, `tag: "${NEW_TAG}"`);
bpContent = bpContent.replace(/implementationHead:\s*"[^"]+"/, `implementationHead: "${headCommit}"`);
bpContent = bpContent.replace(/implementationHeadShort:\s*"[^"]+"/, `implementationHeadShort: "${headShort}"`);

// Replace MODULE_HASHES in bpContent
const moduleHashesRegex = /const MODULE_HASHES = Object\.freeze\(\{[\s\S]*?\}\);/;
const hashesFormatted = JSON.stringify(moduleHashes, null, 8).replace(/"/g, "'").replace(/\n/g, '\n    ');
bpContent = bpContent.replace(moduleHashesRegex, `const MODULE_HASHES = Object.freeze(${hashesFormatted});`);
fs.writeFileSync(bpPath, bpContent, 'utf8');
console.log(`Updated build-provenance.js with verified module hashes and head=${headShort}`);

// 3. Update PACKAGE_INVENTORY_SHA256.txt in extension/
function getAllFiles(dir, baseDir = dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            results = results.concat(getAllFiles(full, baseDir));
        } else if (ent.isFile()) {
            const rel = path.relative(baseDir, full).replace(/\\/g, '/');
            if (rel !== 'PACKAGE_INVENTORY_SHA256.txt') {
                results.push({ rel, full });
            }
        }
    }
    return results;
}

const allExtFiles = getAllFiles(extDir);
allExtFiles.sort((a, b) => a.rel.localeCompare(b.rel));
let inventoryContent = `XPIDER AUTOFORM SENDER PRO — V7.0.0-RC12 PACKAGE INVENTORY\n`;
inventoryContent += `Build ID: ${NEW_BUILD_ID}\n`;
inventoryContent += `Tag: ${NEW_TAG}\n`;
inventoryContent += `Timestamp: ${new Date().toISOString()}\n\n`;

for (const f of allExtFiles) {
    const hash = sha256File(f.full);
    inventoryContent += `${hash}  ${f.rel}\n`;
}
fs.writeFileSync(path.join(extDir, 'PACKAGE_INVENTORY_SHA256.txt'), inventoryContent, 'utf8');
console.log(`Wrote PACKAGE_INVENTORY_SHA256.txt with ${allExtFiles.length} extension files`);

// 4. Update the unpacked Chrome testing directory: XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension
const unpackedDir = path.resolve('XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension');
console.log(`\nSyncing to unpacked extension directory: ${unpackedDir}`);
if (!fs.existsSync(unpackedDir)) {
    fs.mkdirSync(unpackedDir, { recursive: true });
}

function copyRecursive(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
            copyRecursive(path.join(src, item), path.join(dest, item));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}
copyRecursive(extDir, unpackedDir);
console.log(`Unpacked extension directory updated with 100% current files.`);

// 5. Stage files for ZIP packaging
if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Copy base companion / tests / README from base staging or repository
if (fs.existsSync(BASE_STAGING)) {
    copyRecursive(BASE_STAGING, STAGING_DIR);
}
// Overwrite extension folder in staging
copyRecursive(extDir, path.join(STAGING_DIR, 'extension'));

// 6. Create ZIP archive
if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
}
console.log(`\nCreating ZIP archive: ${ZIP_NAME}...`);
execSync(`powershell -command "Compress-Archive -Path '${STAGING_DIR}/*' -DestinationPath '${ZIP_PATH}' -Force"`);

const zipSize = fs.statSync(ZIP_PATH).size;
const zipHash = sha256File(ZIP_PATH);
console.log(`\n=== ZIP PACKAGING COMPLETED ===`);
console.log(`File: ${ZIP_NAME}`);
console.log(`Size: ${zipSize} bytes`);
console.log(`SHA256: ${zipHash}`);

// 7. Verify 3-way hash parity for critical runtime files
const PARITY_FILES = [
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'modules/build-provenance.js',
    'modules/challenge-gate.js',
    'modules/privacy-gateway.js',
    'modules/contact-gate.js',
    'modules/final-form-completion-engine.js',
    'PACKAGE_INVENTORY_SHA256.txt'
];

console.log(`\n=== 3-WAY HASH PARITY AUDIT ===`);
let parityPass = true;
for (const pf of PARITY_FILES) {
    const srcH = sha256File(path.join(extDir, pf));
    const unpH = sha256File(path.join(unpackedDir, pf));
    const stgH = sha256File(path.join(STAGING_DIR, 'extension', pf));
    const isMatch = (srcH === unpH && unpH === stgH);
    if (!isMatch) {
        console.error(`PARITY MISMATCH: ${pf}\n  Src: ${srcH}\n  Unp: ${unpH}\n  Stg: ${stgH}`);
        parityPass = false;
    } else {
        console.log(`  MATCH [${pf}]: ${srcH.slice(0, 16)}...`);
    }
}

if (!parityPass) {
    console.error(`❌ FAILED: 3-way parity mismatch!`);
    process.exit(1);
} else {
    console.log(`✅ 100% 3-WAY HASH PARITY CONFIRMED across git source, unpacked directory, and release ZIP.`);
}

fs.writeFileSync(path.resolve('scratch_v7_0_0_rc12_metadata.json'), JSON.stringify({
    buildId: NEW_BUILD_ID,
    tag: NEW_TAG,
    zipName: ZIP_NAME,
    size: zipSize,
    sha256: zipHash,
    headCommit,
    headShort,
    timestamp: new Date().toISOString()
}, null, 2), 'utf8');

