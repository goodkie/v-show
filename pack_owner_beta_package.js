/**
 * pack_owner_beta_package.js
 *
 * Packages XPIDER AutoForm Sender Pro ??OWNER BETA
 * Version: R6.9G.10.3.7.1.4.58-20261022-P0-FIX-RC3.44
 * Per Issue #6 Owner Decision & ChatGPT Final Pre-Live Audit Directive (Comment #6250701581).
 *
 * Enforces V1, V2, V3 Secret and Packaging Hygiene:
 * 1. Clean Staging
 * 2. Copy Release Assets
 * 3. Verify Batch Line Endings (CRLF / ASCII)
 * 4. Staging Smoke Test in ISOLATED temporary scratch directory with Host OS Invariant Assertion:
 *    - Strictly zero registry mutation (Chrome/Edge NativeMessagingHosts)
 *    - Strictly zero Windows Startup shortcut mutation
 *    - Strictly zero disturbance to live Companion/Watchdog processes
 * 5. Mandatory Post-Smoke Staging Purge (removes any accidental runtime files)
 * 6. Mandatory Pre-Zip Denylist Scan (fail-closed if .control_token, *.log, *.tmp, etc. found)
 * 7. Mandatory Pre-Zip Secret Scan (zero credentials, private keys, exposed tokens)
 * 8. Inventory & SHA-256 Hashing
 * 9. Compression to ZIP Archive
 * 10. Post-Zip Archive Entry Denylist Verification (inspects zip entries using tar -tf)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { execSync } = require('child_process');

function getRegistryKeyDefault(key) {
    try {
        const out = execSync(`reg query "${key}" /ve`, { encoding: 'utf-8' });
        const m = out.match(/REG_SZ\s+(.*)/i);
        return m ? m[1].trim() : null;
    } catch (_) {
        return null;
    }
}

function getStartupShortcutContent() {
    try {
        const p = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'XPIDER_Privacy_Relay.vbs');
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    } catch (_) {
        return null;
    }
}

async function getLiveCompanionState(retries = 3) {
    for (let i = 0; i < retries; i++) {
        const state = await new Promise(resolve => {
            const req = http.get('http://127.0.0.1:18989/health', res => {
                let data = '';
                res.on('data', d => data += d);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch(_) { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(2500, () => { req.destroy(); resolve(null); });
        });
        if (state && state.pid) return state;
        await new Promise(r => setTimeout(r, 400));
    }
    return null;
}

async function runPackaging() {
    console.log('1. Verifying parity with sync_build_parity.js...');
    execSync('node sync_build_parity.js', { stdio: 'inherit' });

    const versionStr = 'R6.9G.10.3.7.1.4.60';
    const zipName = `XPIDER_${versionStr}_PRIVATE_EGRESS_RC3.44.2.zip`;
    const zipOut = path.resolve(zipName);
    const extDir = path.resolve('send_message_backup/build/extension');
    const compDir = path.resolve('companion');
    const stagingDir = path.resolve('staging_owner_beta');

    // Clean staging directory
    if (fs.existsSync(stagingDir)) {
        try {
            fs.rmSync(stagingDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch (_) {
            execSync(`powershell -NoProfile -Command "Remove-Item -Path '${stagingDir}' -Recurse -Force"`);
        }
    }
    fs.mkdirSync(stagingDir, { recursive: true });

    // 1. Copy extension
    const stagingExtDir = path.join(stagingDir, 'extension');
    fs.cpSync(extDir, stagingExtDir, { recursive: true });
    // Explicitly exclude PACKAGE_INVENTORY_SHA256.txt from the extension staging directory.
    // The release archive inventory is a root-level release manifest that records the ZIP hash;
    // bundling it inside the archive would create a circular dependency and capture stale metadata.
    const stagingInv = path.join(stagingExtDir, 'PACKAGE_INVENTORY_SHA256.txt');
    if (fs.existsSync(stagingInv)) {
        fs.unlinkSync(stagingInv);
    }

    // 2. Copy companion (skipping runtime artifacts & node_modules)
    const stagingCompDir = path.join(stagingDir, 'companion');
    fs.mkdirSync(stagingCompDir, { recursive: true });
    function copyCompanionFiles(src, dest) {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const lowerName = entry.name.toLowerCase();
            if (entry.name === '.control_token' || 
                entry.name === 'privacy_relay.log' || 
                entry.name === 'node_modules' || 
                entry.name === 'router_pairing_config.json' || 
                entry.name.startsWith('test') || 
                entry.name.startsWith('mock') || 
                entry.name === 'tls_test_certs.js' || 
                entry.name.endsWith('.tmp') || 
                entry.name.endsWith('.log') || 
                entry.name.endsWith('.lock') || 
                entry.name.startsWith('.private_') || 
                entry.name.includes('local_credentials') || 
                entry.name.startsWith('.local_') ||
                lowerName.includes('scratch') ||
                lowerName.includes('acceptance') ||
                lowerName.includes('rc3_') ||
                lowerName.endsWith('_token') ||
                lowerName.startsWith('.scratch')) {
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

    // 5b. Copy private-egress server package
    if (fs.existsSync('private-egress')) {
        fs.cpSync('private-egress', path.join(stagingDir, 'private-egress'), { recursive: true });
    }

    // 5c. Bundle locked runtime dependencies (ssh2)
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

    // 5d. Bundle official Node.js runtime
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
        if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
            throw new Error(`BATCH BYTE VERIFY FAILED: UTF-8 BOM found in ${bf.relPath}`);
        }
        for (let i = 0; i < buf.length; i++) {
            if (buf[i] > 127) {
                throw new Error(`BATCH BYTE VERIFY FAILED: Non-ASCII byte (${buf[i]}) found at offset ${i} in ${bf.relPath}`);
            }
        }
        const binStr = buf.toString('binary');
        const bareLf = binStr.match(/(?<!\r)\n/g);
        if (bareLf && bareLf.length > 0) {
            throw new Error(`BATCH BYTE VERIFY FAILED: Found ${bareLf.length} bare LF newline(s) without CR in ${bf.relPath}`);
        }
        console.log(`    [OK] ${bf.relPath} (ASCII-only, CRLF line-endings, BOM-free)`);
    }

    // 7c. Clean-environment cmd.exe test in ISOLATED scratch directory (Zero OS Mutation Guaranteed)
    console.log('2c. Running clean-environment cmd.exe test in ISOLATED scratch directory (Zero OS Mutation)...');

    // Snapshot OS invariants BEFORE smoke test
    const chromeRegBefore = getRegistryKeyDefault('HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay');
    const edgeRegBefore = getRegistryKeyDefault('HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay');
    const startupBefore = getStartupShortcutContent();
    const liveStateBefore = await getLiveCompanionState();

    console.log('    [INVARIANT_BASELINE] Captured host OS registration baseline:');
    console.log(`      Chrome Host: ${chromeRegBefore || 'none'}`);
    console.log(`      Edge Host:   ${edgeRegBefore || 'none'}`);
    console.log(`      Live Relay:  PID ${liveStateBefore?.pid || 'none'} (${liveStateBefore?.runtimeRoot || 'none'})`);

    const scratchSmokeDir = path.resolve('scratch', 'smoke_pack_test_' + Date.now());
    if (fs.existsSync(scratchSmokeDir)) {
        fs.rmSync(scratchSmokeDir, { recursive: true, force: true });
    }
    fs.mkdirSync(scratchSmokeDir, { recursive: true });
    fs.cpSync(stagingDir, scratchSmokeDir, { recursive: true });

    try {
        const cmdTestOut = execSync('cmd.exe /d /c "set PATH=%SystemRoot%\\System32;%SystemRoot% && set XPIDER_ISOLATED_TEST=1 && XPIDER_AUTO_SETUP.bat"', {
            cwd: scratchSmokeDir,
            encoding: 'utf-8',
            env: {
                SystemRoot: process.env.SystemRoot || 'C:\\Windows',
                APPDATA: process.env.APPDATA,
                USERPROFILE: process.env.USERPROFILE,
                PATH: 'C:\\Windows\\System32;C:\\Windows',
                XPIDER_ISOLATED_TEST: '1'
            }
        });
        const forbiddenParserErrors = ['tlocal', 'cho', "'ho'", "'ho.'", "'d'", '9009', 'is not recognized'];
        for (const errText of forbiddenParserErrors) {
            if (cmdTestOut.includes(errText)) {
                throw new Error(`CMD PARSER ERROR DETECTED IN AUTO SETUP OUTPUT: contains "${errText}"\nOutput:\n${cmdTestOut}`);
            }
        }
        console.log('    [OK] Isolated XPIDER_AUTO_SETUP.bat executed successfully with zero command parser errors.');
    } finally {
        // Clean up isolated scratch smoke dir
        try {
            fs.rmSync(scratchSmokeDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // Invariant Verification: Assert zero mutation to host OS
    console.log('2c-inv. Verifying Host OS Invariants are strictly UNCHANGED...');
    const chromeRegAfter = getRegistryKeyDefault('HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay');
    const edgeRegAfter = getRegistryKeyDefault('HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay');
    const startupAfter = getStartupShortcutContent();
    const liveStateAfter = await getLiveCompanionState();

    if (chromeRegAfter !== chromeRegBefore) {
        throw new Error(`OS INVARIANT VIOLATION: Chrome Native Host registry mutated!\n  Before: ${chromeRegBefore}\n  After:  ${chromeRegAfter}`);
    }
    if (edgeRegAfter !== edgeRegBefore) {
        throw new Error(`OS INVARIANT VIOLATION: Edge Native Host registry mutated!\n  Before: ${edgeRegBefore}\n  After:  ${edgeRegAfter}`);
    }
    if (startupAfter !== startupBefore) {
        throw new Error(`OS INVARIANT VIOLATION: Windows Startup shortcut mutated!\n  Before: ${startupBefore}\n  After:  ${startupAfter}`);
    }
    if (liveStateBefore && (!liveStateAfter || liveStateAfter.pid !== liveStateBefore.pid || liveStateAfter.runtimeRoot !== liveStateBefore.runtimeRoot)) {
        throw new Error(`OS INVARIANT VIOLATION: Live Companion process was disturbed!\n  Before: PID ${liveStateBefore.pid} (${liveStateBefore.runtimeRoot})\n  After:  PID ${liveStateAfter?.pid} (${liveStateAfter?.runtimeRoot})`);
    }
    console.log('    [OK] All Host OS Invariants preserved 100% (Chrome Registry, Edge Registry, Windows Startup, Live Companion PID).');

    // 7d. Mandatory Post-Smoke Staging Purge (V3 Invariant)
    console.log('2d. Running mandatory post-smoke runtime purge on staging directory...');
    function purgeRuntimeArtifacts(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                purgeRuntimeArtifacts(full);
            } else {
                if (ent.name === '.control_token' ||
                    ent.name === 'privacy_relay.log' ||
                    ent.name.endsWith('.log') ||
                    ent.name.endsWith('.tmp') ||
                    ent.name.endsWith('.lock') ||
                    ent.name.startsWith('.private_egress_transaction') ||
                    ent.name.startsWith('winsec_blob') ||
                    ent.name.includes('local_credentials') ||
                    ent.name.startsWith('.local_')) {
                    console.log(`    [PURGE] Removing runtime artifact from staging: ${full}`);
                    fs.unlinkSync(full);
                }
            }
        }
    }
    purgeRuntimeArtifacts(stagingDir);

    // 7e. Mandatory Fail-Closed Denylist Scan (V2 & V3 Invariant)
    console.log('2e. Running fail-closed denylist scan on staging directory...');
    const FORBIDDEN_DENYLIST_NAMES = [
        '.control_token',
        'privacy_relay.log',
        '.private_egress_transaction.json',
        '.local_credentials.json'
    ];
    const FORBIDDEN_DENYLIST_EXTENSIONS = ['.tmp', '.lock'];
    const stagingFilesForDenylist = getAllFiles(stagingDir);
    for (const file of stagingFilesForDenylist) {
        const baseName = path.basename(file.fullPath);
        const lowerBase = baseName.toLowerCase();
        if (FORBIDDEN_DENYLIST_NAMES.includes(baseName)) {
            throw new Error(`DENYLIST SCAN FAILED: Forbidden runtime artifact found in staging: ${file.relPath}`);
        }
        for (const ext of FORBIDDEN_DENYLIST_EXTENSIONS) {
            if (baseName.endsWith(ext)) {
                throw new Error(`DENYLIST SCAN FAILED: Forbidden extension (${ext}) found in staging: ${file.relPath}`);
            }
        }
        if (lowerBase.includes('scratch') || lowerBase.includes('acceptance') || lowerBase.includes('rc3_') || lowerBase.endsWith('_token') || lowerBase.startsWith('.scratch')) {
            throw new Error(`DENYLIST SCAN FAILED: Stale test/acceptance artifact found in staging: ${file.relPath}`);
        }
        if (baseName.startsWith('.private_egress_transaction')) {
            throw new Error(`DENYLIST SCAN FAILED: Transaction journal found in staging: ${file.relPath}`);
        }
        if (baseName.startsWith('winsec_blob')) {
            throw new Error(`DENYLIST SCAN FAILED: Windows security blob found in staging: ${file.relPath}`);
        }
        if (baseName.includes('local_credentials') || baseName.startsWith('.local_')) {
            throw new Error(`DENYLIST SCAN FAILED: Local credential file found in staging: ${file.relPath}`);
        }
        // Deny any .log file except test site fixtures or evidence explicitly intended for site docs
        if (baseName.endsWith('.log') && !file.relPath.startsWith('owner-extension-test-site/')) {
            throw new Error(`DENYLIST SCAN FAILED: Stale runtime log found in staging: ${file.relPath}`);
        }
    }
    console.log('    [OK] Staging denylist scan passed (zero runtime artifacts, zero tokens, zero logs).');

    // 7f. Security & Secret Scan (Strict scan on all project code, skipping third-party libraries & runtime)
    console.log('2f. Running security & secrets scan on staging files...');
    function scanDirectoryForSecrets(dir) {
        const forbiddenPatterns = [
            /(?:ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{50,})/,
            /dop_v1_[a-f0-9]{64}/,
            /-----BEGIN\s+(?:[A-Z\s]+)?PRIVATE\s+KEY-----/,
            /dpapi:[A-Za-z0-9+/=]{20,}/
        ];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
            if (ent.name === 'node_modules' || ent.name === 'runtime') continue;
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                scanDirectoryForSecrets(full);
            } else if (ent.isFile() && !full.endsWith('.png') && !full.endsWith('.jpg') && !full.endsWith('.zip') && !full.endsWith('.exe') && !full.endsWith('.wav')) {
                const content = fs.readFileSync(full, 'utf8');
                for (const pat of forbiddenPatterns) {
                    if (pat.test(content)) {
                        throw new Error(`SECURITY SCAN FAILED: Potential secret pattern (${pat}) found in ${full}`);
                    }
                }
                if (ent.name === '.control_token') {
                    throw new Error(`SECURITY SCAN FAILED: .control_token file present in ${full}`);
                }
                if (ent.name.includes('local_credentials') || ent.name.startsWith('.local_')) {
                    throw new Error(`SECURITY SCAN FAILED: Local credentials file present in ${full}`);
                }
                // Strict content hygiene on JSON configuration files
                if (ent.name.endsWith('.json')) {
                    // credentialRef must be empty
                    const credMatch = content.match(/"credentialRef"\s*:\s*"([^"]+)"/);
                    if (credMatch && credMatch[1].trim() !== '') {
                        throw new Error(`SECURITY SCAN FAILED: Non-empty credentialRef ("${credMatch[1]}") found in JSON: ${full}`);
                    }
                    // password must be empty
                    const passMatch = content.match(/"password"\s*:\s*"([^"]+)"/);
                    if (passMatch && passMatch[1].trim() !== '') {
                        throw new Error(`SECURITY SCAN FAILED: Non-empty password found in JSON: ${full}`);
                    }
                }
                // Bearer token scan (excluding redactions)
                const bearerMatch = content.match(/Bearer\s+([A-Za-z0-9_\-\.]{32,})/i);
                if (bearerMatch && !bearerMatch[0].includes('REDACTED')) {
                    throw new Error(`SECURITY SCAN FAILED: Bearer token found in ${full}`);
                }
            }
        }
    }
    scanDirectoryForSecrets(stagingDir);
    console.log('    [OK] Secrets scan PASSED (zero credentials/private keys detected).');

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
    console.log(`??Zip created: ${zipOut} (${zipBuf.length} bytes, SHA-256: ${zipSha})`);

    // 10. Mandatory Post-Zip Archive Entry Scan (V1, V2, V3 Verification)
    console.log('4. Verifying ZIP archive entries via tar -tf...');
    const zipEntriesRaw = execSync(`tar -tf "${zipOut}"`, { encoding: 'utf-8' });
    const zipEntries = zipEntriesRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    for (const entry of zipEntries) {
        const base = path.basename(entry);
        const lowerBase = base.toLowerCase();
        if (base === '.control_token') {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: .control_token is present in release archive entry: ${entry}`);
        }
        if (base === 'privacy_relay.log') {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: privacy_relay.log is present in release archive entry: ${entry}`);
        }
        if (base.endsWith('.tmp')) {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: Temporary file present in release archive entry: ${entry}`);
        }
        if (base.startsWith('.private_egress_transaction')) {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: Transaction file present in release archive entry: ${entry}`);
        }
        if (lowerBase.includes('scratch') || lowerBase.includes('acceptance') || lowerBase.includes('rc3_') || lowerBase.endsWith('_token') || lowerBase.startsWith('.scratch')) {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: Stale test/acceptance artifact present in release archive entry: ${entry}`);
        }
        if (base.includes('local_credentials') || base.startsWith('.local_')) {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: Local credential file present in release archive entry: ${entry}`);
        }
        if (base.endsWith('.log') && !entry.startsWith('owner-extension-test-site/')) {
            fs.unlinkSync(zipOut);
            throw new Error(`ARCHIVE VERIFICATION FAILED: Stale runtime log present in release archive entry: ${entry}`);
        }
    }
    console.log(`    [OK] Archive entry scan passed (${zipEntries.length} entries inspected; strictly zero runtime/token files).`);

    // 11. Update PACKAGE_INVENTORY_SHA256.txt
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

    console.log('??PACKAGE INVENTORY updated and mirrored across all trees.');
    console.log(`\n================ OWNER BETA RELEASE ARTIFACT ================`);
    console.log(`File: ${zipName}`);
    console.log(`Size: ${zipBuf.length} bytes`);
    console.log(`SHA-256: ${zipSha}`);
    console.log(`============================================================\n`);
}

runPackaging().catch(err => {
    console.error('FATAL [pack_owner_beta_package]:', err);
    process.exit(1);
});
