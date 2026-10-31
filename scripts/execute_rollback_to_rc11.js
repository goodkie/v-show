const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('=== XPIDER EXECUTE CODE ROLLBACK TO EXACT IMMUTABLE PRE-RC12 RC11 ===\n');

const ZIP_NAME = 'XPIDER_V7.0.0_RC11_DUAL_MODE_OWNER_BETA.zip';
const ZIP_PATH = path.resolve(ZIP_NAME);
const EXPECTED_ZIP_SHA256 = '46a1470c80249466f79a3a4fe5599976593d99fd52f945b87add876f1b787a54';
const EXPECTED_ZIP_SIZE = 51693297;
const EXPECTED_COMMIT = '20678ada';

const OWNER_LOADED_UNPACKED_EXT = path.resolve('XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension');
const GIT_EXT_DIR = path.resolve('extension');
const EXTRACT_TMP_DIR = path.resolve('scratch/extracted_rc11_for_rollback');

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
        const s = path.join(src, item);
        const d = path.join(dest, item);
        if (fs.statSync(s).isDirectory()) {
            copyDirRecursive(s, d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

// 1. Verify RC11 Zip Artifact Integrity
console.log('--- Step 1: Verifying Immutable RC11 Release ZIP ---');
if (!fs.existsSync(ZIP_PATH)) {
    console.error(`FATAL: ${ZIP_NAME} not found at ${ZIP_PATH}`);
    process.exit(1);
}
const zipStat = fs.statSync(ZIP_PATH);
const zipSha = sha256(ZIP_PATH);
console.log(`ZIP Size: ${zipStat.size} (Expected: ${EXPECTED_ZIP_SIZE})`);
console.log(`ZIP SHA256: ${zipSha}`);
if (zipStat.size !== EXPECTED_ZIP_SIZE || zipSha !== EXPECTED_ZIP_SHA256) {
    console.error('FATAL: RC11 ZIP hash or size mismatch! Aborting rollback to prevent corruption.');
    process.exit(1);
}
console.log('✅ Immutable RC11 Release ZIP verified byte-for-byte.\n');

// 2. Backup Current RC16 Extension Code Directory
console.log('--- Step 2: Backing Up Current RC16 Extension Code Directory ---');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.resolve(`backups/PRE_ROLLBACK_RC16_CODE_BACKUP_${timestamp}/extension`);
fs.mkdirSync(BACKUP_DIR, { recursive: true });
copyDirRecursive(OWNER_LOADED_UNPACKED_EXT, BACKUP_DIR);
console.log(`✅ Backup created at: ${BACKUP_DIR}`);
const backedUpFiles = fs.readdirSync(BACKUP_DIR);
console.log(`Backed up ${backedUpFiles.length} root items successfully.\n`);

// 3. Extract Extension from Immutable RC11 ZIP
console.log('--- Step 3: Extracting Pure RC11 Extension from Release ZIP ---');
if (fs.existsSync(EXTRACT_TMP_DIR)) {
    fs.rmSync(EXTRACT_TMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(EXTRACT_TMP_DIR, { recursive: true });

// Use tar to extract only extension/ from ZIP
try {
    execSync(`tar -xf "${ZIP_PATH}" -C "${EXTRACT_TMP_DIR}" extension`, { stdio: 'inherit' });
} catch (e) {
    console.error('Failed to extract via tar, using powershell Expand-Archive:', e.message);
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${EXTRACT_TMP_DIR}' -Force"`, { stdio: 'inherit' });
}

const extractedExtDir = path.join(EXTRACT_TMP_DIR, 'extension');
if (!fs.existsSync(extractedExtDir)) {
    console.error(`FATAL: Extracted extension directory not found at ${extractedExtDir}`);
    process.exit(1);
}
console.log(`✅ Extracted RC11 extension to: ${extractedExtDir}\n`);

// 4. In-Place Overwrite of Actual Owner-Loaded Unpacked Extension Code
console.log('--- Step 4: Overwriting Owner-Loaded Unpacked Extension Code with RC11 ---');
console.log(`Target: ${OWNER_LOADED_UNPACKED_EXT}`);

// Clean target directory completely before copy to prevent orphan/mixed RC12-RC16 files
for (const item of fs.readdirSync(OWNER_LOADED_UNPACKED_EXT)) {
    const full = path.join(OWNER_LOADED_UNPACKED_EXT, item);
    fs.rmSync(full, { recursive: true, force: true });
}
copyDirRecursive(extractedExtDir, OWNER_LOADED_UNPACKED_EXT);
console.log('✅ Overwrote owner-loaded unpacked extension with pure RC11 files.\n');

// 5. Update Git working tree extension/ to match RC11
console.log('--- Step 5: Updating Git working tree extension/ to RC11 ---');
for (const item of fs.readdirSync(GIT_EXT_DIR)) {
    const full = path.join(GIT_EXT_DIR, item);
    fs.rmSync(full, { recursive: true, force: true });
}
copyDirRecursive(extractedExtDir, GIT_EXT_DIR);
console.log('✅ Synchronized git extension/ directory to pure RC11 files.\n');

// 6. Verify 100% Hash Parity Against Extracted Immutable RC11
console.log('--- Step 6: Verifying Exact File Hash Parity Across All 3 Directories ---');
function getAllFiles(dir, prefix = '') {
    let results = [];
    for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const rel = prefix ? `${prefix}/${f}` : f;
        if (fs.statSync(full).isDirectory()) {
            results.push(...getAllFiles(full, rel));
        } else {
            results.push({ rel, full });
        }
    }
    return results;
}

const rc11Files = getAllFiles(extractedExtDir);
console.log(`Total files in RC11 extension: ${rc11Files.length}`);

let mismatchCount = 0;
for (const file of rc11Files) {
    const rel = file.rel;
    const refSha = sha256(file.full);
    const loadedSha = sha256(path.join(OWNER_LOADED_UNPACKED_EXT, rel));
    const gitSha = sha256(path.join(GIT_EXT_DIR, rel));

    if (refSha !== loadedSha || refSha !== gitSha) {
        console.error(`❌ MISMATCH on ${rel}: ref=${refSha.slice(0, 8)} loaded=${loadedSha.slice(0, 8)} git=${gitSha.slice(0, 8)}`);
        mismatchCount++;
    }
}

if (mismatchCount === 0) {
    console.log(`🎉 100% HASH PARITY VERIFIED: All ${rc11Files.length} files in owner loaded directory and git extension match extracted RC11 package.\n`);
} else {
    console.error(`FATAL: ${mismatchCount} files failed parity!`);
    process.exit(1);
}

// 7. Verify Manifest & Provenance Header
console.log('--- Step 7: Verifying RC11 Provenance & Manifest ---');
const manifest = JSON.parse(fs.readFileSync(path.join(OWNER_LOADED_UNPACKED_EXT, 'manifest.json'), 'utf8'));
const bpContent = fs.readFileSync(path.join(OWNER_LOADED_UNPACKED_EXT, 'modules/build-provenance.js'), 'utf8');

console.log(`Manifest Name: ${manifest.name}`);
console.log(`Manifest Version: ${manifest.version}`);

const buildIdMatch = bpContent.match(/buildId:\s*["']([^"']+)["']/);
const tagMatch = bpContent.match(/tag:\s*["']([^"']+)["']/);
const headMatch = bpContent.match(/implementationHead:\s*["']([^"']+)["']/);
const headShortMatch = bpContent.match(/implementationHeadShort:\s*["']([^"']+)["']/);

console.log(`Build ID: ${buildIdMatch ? buildIdMatch[1] : 'NOT FOUND'}`);
console.log(`Tag: ${tagMatch ? tagMatch[1] : 'NOT FOUND'}`);
console.log(`Head: ${headMatch ? headMatch[1] : 'NOT FOUND'}`);
console.log(`Head Short: ${headShortMatch ? headShortMatch[1] : 'NOT FOUND'}`);

if (!bpContent.includes('V7.0.0-RC11') || !bpContent.includes('v7.0.0-rc11')) {
    console.error('FATAL: Provenance does not contain RC11!');
    process.exit(1);
}
console.log('✅ Provenance strictly verified as V7.0.0-RC11.\n');

console.log('================================================================');
console.log('ROLLBACK TO EXACT IMMUTABLE RC11 COMPLETED SUCCESSFULLY!');
console.log(`Backup Location: ${BACKUP_DIR}`);
console.log(`Active Unpacked Path: ${OWNER_LOADED_UNPACKED_EXT}`);
console.log('================================================================');
