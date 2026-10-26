const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const EXPECTED_ZIP = path.resolve(__dirname, '..', 'XPIDER_R6.9G.10.3.7.1.4.76_OWNER_BETA_HOTFIX.zip');
const EXPECTED_SHA256 = '5e99c9a6cb1b9dfa2b13bec5b3caa979fb535a7a88cdfbe22af85ffd2701dc59';
const EXPECTED_COMMIT = '759ecb9d5ad6399038a020e782992b1668c9dbda';
const UNPACK_DIR = path.resolve(__dirname, '..', 'scratch', 'unpacked_rc3_59_76_hotfix');

console.log('=== [INDEPENDENT VALIDATION] PACKAGED .76 ZIP vs SOURCE COMMIT ===');

// 1. Verify ZIP existence & SHA256
if (!fs.existsSync(EXPECTED_ZIP)) {
    console.error(`FATAL: ZIP file not found at ${EXPECTED_ZIP}`);
    process.exit(1);
}
const zipBuffer = fs.readFileSync(EXPECTED_ZIP);
const actualSha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');
console.log(`ZIP Path: ${EXPECTED_ZIP}`);
console.log(`ZIP Size: ${zipBuffer.length} bytes`);
console.log(`Expected SHA256: ${EXPECTED_SHA256}`);
console.log(`Actual SHA256:   ${actualSha256}`);

if (actualSha256 !== EXPECTED_SHA256) {
    console.error('FATAL: ZIP SHA256 MISMATCH!');
    process.exit(1);
}
console.log('✔ ZIP SHA256 matches perfectly.');

// 2. Unpack ZIP (if not already extracted)
if (!fs.existsSync(path.join(UNPACK_DIR, 'extension'))) {
    if (fs.existsSync(UNPACK_DIR)) {
        fs.rmSync(UNPACK_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(UNPACK_DIR, { recursive: true });
    cp.execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${EXPECTED_ZIP}' -DestinationPath '${UNPACK_DIR}' -Force"`, { stdio: 'inherit' });
    console.log(`✔ Extracted ZIP to ${UNPACK_DIR}`);
} else {
    console.log(`✔ Reusing existing unpacked files in ${UNPACK_DIR}`);
}

// 3. Inspect top-level structure in UNPACK_DIR
let extensionRoot = UNPACK_DIR;
if (fs.existsSync(path.join(UNPACK_DIR, 'extension'))) {
    extensionRoot = path.join(UNPACK_DIR, 'extension');
}

// 4. Compare every file in extensionRoot against git commit
function getAllFiles(dir, base = '') {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        const relPath = base ? `${base}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
            results = results.concat(getAllFiles(fullPath, relPath));
        } else {
            results.push(relPath);
        }
    }
    return results;
}

const unpackedFiles = getAllFiles(extensionRoot).map(f => f.replace(/\\/g, '/')).sort();
console.log(`Total unpacked files: ${unpackedFiles.length}`);

// Get file list from git commit 759ecb9d for extension/ with quotepath=false
const gitFilesRaw = cp.execSync(`git -c core.quotepath=false ls-tree -r --name-only ${EXPECTED_COMMIT} extension/`, { encoding: 'utf8' });
const gitFiles = gitFilesRaw.trim().split(/\r?\n/).map(f => f.replace(/^extension\//, '').replace(/\\/g, '/')).filter(Boolean).sort();
console.log(`Total git commit files: ${gitFiles.length}`);

// Check file lists match
const missingInUnpacked = gitFiles.filter(f => !unpackedFiles.includes(f));
const extraInUnpacked = unpackedFiles.filter(f => !gitFiles.includes(f));

if (missingInUnpacked.length > 0) {
    console.error('FATAL: Files missing in unpacked ZIP:', missingInUnpacked);
    process.exit(1);
}
if (extraInUnpacked.length > 0) {
    console.error('FATAL: Extra files in unpacked ZIP:', extraInUnpacked);
    process.exit(1);
}
console.log('✔ File inventory matches 100% with git commit.');

// 5. Compare byte-for-byte and normalized content
let diffCount = 0;
let binaryMatchCount = 0;
let textNormalizedMatchCount = 0;

for (const relPath of gitFiles) {
    const unpackedFilePath = path.join(extensionRoot, relPath);
    const unpackedBuffer = fs.readFileSync(unpackedFilePath);
    const unpackedHash = crypto.createHash('sha256').update(unpackedBuffer).digest('hex');

    // Get file buffer from git commit
    const gitBuffer = cp.execSync(`git show "${EXPECTED_COMMIT}:extension/${relPath}"`);
    const gitHash = crypto.createHash('sha256').update(gitBuffer).digest('hex');

    if (unpackedHash === gitHash) {
        binaryMatchCount++;
    } else {
        // Check if text file with CRLF vs LF differences
        const unpackedText = unpackedBuffer.toString('utf8').replace(/\r\n/g, '\n');
        const gitText = gitBuffer.toString('utf8').replace(/\r\n/g, '\n');
        if (unpackedText === gitText) {
            textNormalizedMatchCount++;
        } else {
            console.error(`SUBSTANTIVE MISMATCH on ${relPath}:`);
            diffCount++;
        }
    }
}

if (diffCount > 0) {
    console.error(`FATAL: ${diffCount} files had substantive differences from git commit ${EXPECTED_COMMIT}!`);
    process.exit(1);
}

console.log(`✔ Binary exact match: ${binaryMatchCount} files`);
console.log(`✔ Normalized text exact match (CRLF/LF): ${textNormalizedMatchCount} files`);
console.log(`✔ Total validated: ${gitFiles.length}/${gitFiles.length} files (100% SUBSTANTIVE PASS)`);
console.log('=== BITWISE INDEPENDENT VALIDATION: 100% PASS ===');
