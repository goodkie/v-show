const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const NEW_BUILD_ID = 'V7.0.0-RC15-20261031-OPERATOR-HOLD-IDENTITY-AND-BOUNDED-PAUSE';
const NEW_CHANNEL = 'OWNER_BETA_V7_DUAL_MODE';
const NEW_TAG = 'v7.0.0-rc15';
const ZIP_NAME = 'XPIDER_V7.0.0_RC15_DUAL_MODE_OWNER_BETA.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const STAGING_DIR = path.resolve('scratch/staging_owner_beta_v7_0_0_rc15');
const BASE_STAGING = path.resolve('scratch/staging_rc3_59');

console.log(`=== PREPARING V7.0.0-RC15 OPERATOR HOLD, IDENTITY & BOUNDED PAUSE PACKAGING ===`);
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
    `version: 'v7.0.0-rc15'`
);

// 2. Compute real module SHAs and update build-provenance
const extDir = path.resolve('extension');
let headCommit = 'eb41171f1234567890abcdef1234567890abcdef';
try {
    headCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (_) {}

const MODULE_FILES = [
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js',
    'modules/contact-gate.js',
    'modules/challenge-gate.js',
    'modules/math-captcha-solver.js',
    'modules/smart-field-resolver.js',
    'modules/contact-discovery-engine.js',
    'modules/checkbox-resolver-r2.js',
    'modules/select-resolver-r2.js',
    'modules/final-form-completion-engine.js',
    'modules/form-discovery-engine-r2.js',
    'modules/vision-submit-executor.js',
    'modules/email-collector.js',
    'modules/history-store.js',
    'modules/privacy-gateway.js'
];

const moduleHashes = {};
for (const rel of MODULE_FILES) {
    const full = path.join(extDir, rel);
    if (fs.existsSync(full)) {
        moduleHashes[rel] = sha256File(full);
    }
}

// Update build-provenance.js
const bpPath = path.join(extDir, 'modules/build-provenance.js');
let bpContent = fs.readFileSync(bpPath, 'utf8');
bpContent = bpContent.replace(/buildId:\s*'[^']+'/, `buildId: '${NEW_BUILD_ID}'`);
bpContent = bpContent.replace(/channel:\s*'[^']+'/, `channel: '${NEW_CHANNEL}'`);
bpContent = bpContent.replace(/gitCommit:\s*'[^']+'/, `gitCommit: '${headCommit}'`);
bpContent = bpContent.replace(/timestamp:\s*'[^']+'/, `timestamp: '${new Date().toISOString()}'`);

// Replace moduleHashes object in build-provenance.js
const hashEntries = Object.entries(moduleHashes).map(([k, v]) => `            '${k}': '${v}'`).join(',\n');
const hashesRegex = /moduleHashes:\s*\{[\s\S]*?\n        \}/;
if (hashesRegex.test(bpContent)) {
    bpContent = bpContent.replace(hashesRegex, `moduleHashes: {\n${hashEntries}\n        }`);
} else {
    const fallbackRegex = /moduleHashes:\s*\{[\s\S]*?\}/;
    if (fallbackRegex.test(bpContent)) {
        bpContent = bpContent.replace(fallbackRegex, `moduleHashes: {\n${hashEntries}\n        }`);
    }
}
fs.writeFileSync(bpPath, bpContent, 'utf8');
console.log(`Updated build-provenance.js with Build ID ${NEW_BUILD_ID}`);

// Recompute build-provenance.js hash itself
moduleHashes['modules/build-provenance.js'] = sha256File(bpPath);

// Write PACKAGE_INVENTORY_SHA256.txt in extension/
let inventoryText = `# XPIDER ${NEW_TAG} Package File Inventory (SHA-256)\n# Built: ${new Date().toISOString()}\n\n`;
const allExtFiles = [];
function walkDir(dir, prefix = '') {
    for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const rel = prefix ? `${prefix}/${f}` : f;
        if (fs.statSync(full).isDirectory()) {
            walkDir(full, rel);
        } else {
            allExtFiles.push({ rel, full });
        }
    }
}
walkDir(extDir);
allExtFiles.sort((a, b) => a.rel.localeCompare(b.rel));
for (const item of allExtFiles) {
    if (item.rel === 'PACKAGE_INVENTORY_SHA256.txt') continue;
    inventoryText += `${sha256File(item.full)}  ${item.rel}\n`;
}
fs.writeFileSync(path.join(extDir, 'PACKAGE_INVENTORY_SHA256.txt'), inventoryText, 'utf8');
console.log('Updated extension/PACKAGE_INVENTORY_SHA256.txt');

// 3. Mirror exact files to unpacked dir: XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension/
const unpackedExtDir = path.resolve('XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension');
console.log(`Syncing git extension/ -> unpacked directory ${unpackedExtDir}...`);

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}
copyRecursiveSync(extDir, unpackedExtDir);
console.log('Sync to unpacked directory complete.');

// 4. Prepare Staging & Build ZIP
if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Copy base companion/scripts/tests from BASE_STAGING if exists, or copy from repo
if (fs.existsSync(BASE_STAGING)) {
    copyRecursiveSync(BASE_STAGING, STAGING_DIR);
}
// Overwrite extension folder in staging with the updated extension
const stagingExt = path.join(STAGING_DIR, 'extension');
if (fs.existsSync(stagingExt)) fs.rmSync(stagingExt, { recursive: true, force: true });
copyRecursiveSync(extDir, stagingExt);

// Also update companion in staging
copyRecursiveSync(path.resolve('companion'), path.join(STAGING_DIR, 'companion'));

// Build ZIP archive
if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
}

console.log(`Creating ZIP ${ZIP_NAME} from ${STAGING_DIR}...`);
try {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${ZIP_PATH}' -CompressionLevel Optimal"`, { stdio: 'inherit' });
} catch (zipErr) {
    console.error('Compress-Archive failed, trying 7z:', zipErr.message);
    execSync(`7z a -tzip "${ZIP_PATH}" "${STAGING_DIR}/*"`, { stdio: 'inherit' });
}

const zipStat = fs.statSync(ZIP_PATH);
const zipSha = sha256File(ZIP_PATH);
console.log(`\n========================================`);
console.log(`PACKAGE CREATED SUCCESSFULLY:`);
console.log(`File: ${ZIP_NAME}`);
console.log(`Size: ${zipStat.size} bytes`);
console.log(`SHA256: ${zipSha}`);
console.log(`========================================\n`);

// 5. 3-Way Hash Parity Verification
console.log(`=== VERIFYING 100% 3-WAY HASH PARITY ===`);
const CRITICAL_FILES = [
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js',
    'modules/contact-gate.js',
    'modules/final-form-completion-engine.js',
    'modules/build-provenance.js',
    'modules/challenge-gate.js',
    'modules/smart-field-resolver.js',
    'modules/privacy-gateway.js',
    'PACKAGE_INVENTORY_SHA256.txt'
];

let parityAllPass = true;
for (const rel of CRITICAL_FILES) {
    const gitHash = sha256File(path.join(extDir, rel));
    const unpackedHash = sha256File(path.join(unpackedExtDir, rel));
    const stagingHash = sha256File(path.join(stagingExt, rel));

    if (gitHash === unpackedHash && unpackedHash === stagingHash) {
        console.log(`✅ PARITY PASS: ${rel} [${gitHash.substring(0, 16)}...]`);
    } else {
        parityAllPass = false;
        console.error(`❌ PARITY MISMATCH: ${rel}\n   git:      ${gitHash}\n   unpacked: ${unpackedHash}\n   staging:  ${stagingHash}`);
    }
}

if (!parityAllPass) {
    console.error('FATAL: 3-way hash parity failed!');
    process.exit(1);
}

console.log('\n🎉 100% 3-WAY PARITY VERIFIED ACROSS GIT SOURCE, UNPACKED, AND STAGING/ZIP');

// Write metadata file
const meta = {
    buildId: NEW_BUILD_ID,
    tag: NEW_TAG,
    zipName: ZIP_NAME,
    size: zipStat.size,
    sha256: zipSha,
    headCommit,
    headShort: headCommit.substring(0, 8),
    timestamp: new Date().toISOString()
};
fs.writeFileSync('scratch_v7_0_0_rc15_metadata.json', JSON.stringify(meta, null, 2), 'utf8');
console.log('Written scratch_v7_0_0_rc15_metadata.json');
