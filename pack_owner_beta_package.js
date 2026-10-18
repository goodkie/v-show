/**
 * pack_owner_beta_package.js
 *
 * Packages XPIDER AutoForm Sender Pro — OWNER BETA
 * Version: R6.9G.10.3.7.1.4.11-OWNER-BETA
 * Per Issue #6 Owner Decision (Comment #6208890551).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('1. Verifying parity with sync_build_parity.js...');
execSync('node sync_build_parity.js', { stdio: 'inherit' });

const versionStr = 'R6.9G.10.3.7.1.4.19';
const zipName = `XPIDER_${versionStr}_PRIVATE_EGRESS_RC3.5.zip`;
const zipOut = path.resolve(zipName);
const extDir = path.resolve('send_message_backup/build/extension');
const compDir = path.resolve('companion');
const stagingDir = path.resolve('staging_owner_beta');

// Clean staging directory
if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// 1. Copy extension
const stagingExtDir = path.join(stagingDir, 'extension');
fs.cpSync(extDir, stagingExtDir, { recursive: true });

// 2. Copy companion (skipping runtime artifacts & node_modules)
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
if (fs.existsSync(compDir)) {
    copyCompanionFiles(compDir, stagingCompDir);
}

// 3. Copy infra
if (fs.existsSync('infra')) {
    fs.cpSync('infra', path.join(stagingDir, 'infra'), { recursive: true });
}

// 4. Copy router
if (fs.existsSync('router')) {
    fs.cpSync('router', path.join(stagingDir, 'router'), { recursive: true });
}

// 5. Copy owner-extension-test-site
if (fs.existsSync('owner-extension-test-site')) {
    fs.cpSync('owner-extension-test-site', path.join(stagingDir, 'owner-extension-test-site'), { recursive: true });
}

// 5b. Copy private-egress server package (Blocker H)
if (fs.existsSync('private-egress')) {
    fs.cpSync('private-egress', path.join(stagingDir, 'private-egress'), { recursive: true });
}

// 5c. Bundle locked runtime dependencies (ssh2) (Blocker G)
if (fs.existsSync('node_modules')) {
    const stagingNmDir = path.join(stagingDir, 'node_modules');
    fs.mkdirSync(stagingNmDir, { recursive: true });
    function copyNodeModulesClean(src, dest) {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'test' || entry.name === 'tests' || entry.name === 'examples' || entry.name === '.github' || entry.name === '.git') {
                continue;
            }
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true });
                copyNodeModulesClean(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    copyNodeModulesClean('node_modules', stagingNmDir);
}

// 5d. Bundle official Node.js runtime (P0 Fix for Zero-Prerequisite Windows Setup)
if (fs.existsSync('runtime')) {
    fs.cpSync('runtime', path.join(stagingDir, 'runtime'), { recursive: true });
}

// 6. Copy Root Batch & Docs & Package manifests
const rootFiles = ['XPIDER_AUTO_SETUP.bat', 'START_TEST_SITE.bat', 'RELOAD_EXTENSION_UNPACKED.bat', '.gitattributes', 'package.json', 'package-lock.json', 'OWNER_BETA_README.md', 'KNOWN_ISSUES.md', 'CHANGELOG.md'];
for (const rf of rootFiles) {
    if (fs.existsSync(rf)) {
        fs.copyFileSync(rf, path.join(stagingDir, rf));
    }
}

// 7. Security & Secret Scan (Strict scan on all project code, skipping third-party libraries & runtime)
function scanDirectoryForSecrets(dir) {
    const forbiddenPatterns = [
        /(?:ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{50,})/,
        /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
        /-----BEGIN\s+RSA\s+PRIVATE\s+KEY-----/
    ];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === 'runtime') continue; // Skip 3rd party bundled libraries and binary runtimes
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            scanDirectoryForSecrets(full);
        } else if (ent.isFile() && !full.endsWith('.png') && !full.endsWith('.jpg') && !full.endsWith('.zip') && !full.endsWith('.exe')) {
            const content = fs.readFileSync(full, 'utf8');
            for (const pat of forbiddenPatterns) {
                if (pat.test(content)) {
                    throw new Error(`SECURITY SCAN FAILED: Potential secret pattern found in ${full}`);
                }
            }
        }
    }
}
console.log('2. Running security & secrets scan on staging files...');
scanDirectoryForSecrets(stagingDir);
console.log('✅ Secrets scan PASSED (zero credentials/private keys detected).');

// Helper to get all files
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

// 7b. Strict Line-Ending & Character-Set Verification for Windows Batch/Cmd Files
console.log('2b. Byte-verifying line endings and ASCII in shipped batch/cmd files...');
const allStagingFiles = getAllFiles(stagingDir);
const batCmdFiles = allStagingFiles.filter(f => f.relPath.endsWith('.bat') || f.relPath.endsWith('.cmd'));
for (const bf of batCmdFiles) {
    let content = fs.readFileSync(bf.fullPath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    content = content.replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(bf.fullPath, content, { encoding: 'ascii' });

    const buf = fs.readFileSync(bf.fullPath);
    // Check UTF-8 BOM
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        throw new Error(`BATCH BYTE VERIFY FAILED: UTF-8 BOM found in ${bf.relPath}`);
    }
    // Check pure ASCII (0..127)
    for (let i = 0; i < buf.length; i++) {
        if (buf[i] > 127) {
            throw new Error(`BATCH BYTE VERIFY FAILED: Non-ASCII byte (${buf[i]}) found at offset ${i} in ${bf.relPath}`);
        }
    }
    // Check CRLF vs bare LF
    const binStr = buf.toString('binary');
    const bareLf = binStr.match(/(?<!\r)\n/g);
    if (bareLf && bareLf.length > 0) {
        throw new Error(`BATCH BYTE VERIFY FAILED: Found ${bareLf.length} bare LF newline(s) without CR in ${bf.relPath}`);
    }
    console.log(`    [OK] ${bf.relPath} (ASCII-only, CRLF line-endings, BOM-free)`);
}

// 7c. Clean-environment cmd.exe test (Verify zero command-parser corruption and exit code 0)
console.log('2c. Running clean-environment cmd.exe test on staging XPIDER_AUTO_SETUP.bat (NO Node in PATH)...');
const cmdTestOut = execSync('cmd.exe /d /c "set PATH=%SystemRoot%\\System32;%SystemRoot% && XPIDER_AUTO_SETUP.bat"', {
    cwd: stagingDir,
    encoding: 'utf-8',
    env: {
        SystemRoot: process.env.SystemRoot || 'C:\\Windows',
        APPDATA: process.env.APPDATA,
        USERPROFILE: process.env.USERPROFILE,
        PATH: 'C:\\Windows\\System32;C:\\Windows'
    }
});
const forbiddenParserErrors = ['tlocal', 'cho', "'ho'", "'ho.'", "'d'", '9009', 'is not recognized'];
for (const errText of forbiddenParserErrors) {
    if (cmdTestOut.includes(errText)) {
        throw new Error(`CMD PARSER ERROR DETECTED IN AUTO SETUP OUTPUT: contains "${errText}"\nOutput:\n${cmdTestOut}`);
    }
}
console.log('    [OK] Staging XPIDER_AUTO_SETUP.bat executed successfully with zero command parser errors.');

// 8. Inventory & Hashes
const files = getAllFiles(stagingDir);
files.sort((a, b) => a.relPath.localeCompare(b.relPath));

const fileHashes = [];
for (const f of files) {
    const buf = fs.readFileSync(f.fullPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    fileHashes.push({ relPath: f.relPath, hash, size: buf.length });
}

// 9. Compress Archive
console.log(`3. Compressing ${zipName}...`);
if (fs.existsSync(zipOut)) {
    fs.unlinkSync(zipOut);
}
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipOut}' -Force"`);

const zipBuf = fs.readFileSync(zipOut);
const zipSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
console.log(`✅ Zip created: ${zipOut} (${zipBuf.length} bytes, SHA-256: ${zipSha})`);

// 10. Update PACKAGE_INVENTORY_SHA256.txt
const nowIso = new Date().toISOString();
let inventoryContent = `PACKAGE INVENTORY SHA256 (XPIDER ${versionStr} OWNER BETA CUT)\n`;
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
fs.writeFileSync('extension/PACKAGE_INVENTORY_SHA256.txt', inventoryContent, 'utf8');
fs.writeFileSync('send_message_backup/PACKAGE_INVENTORY_SHA256.txt', inventoryContent, 'utf8');

// Mirror inventory into build
execSync('node sync_build_parity.js', { stdio: 'inherit' });

console.log('✅ PACKAGE INVENTORY updated and mirrored across all trees.');
console.log(`\n================ OWNER BETA RELEASE ARTIFACT ================`);
console.log(`File: ${zipName}`);
console.log(`Size: ${zipBuf.length} bytes`);
console.log(`SHA-256: ${zipSha}`);
console.log(`============================================================\n`);
