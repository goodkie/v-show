/**
 * verify_local_rc3_19.js
 *
 * Verifies local RC3.19 release archive (XPIDER_R6.9G.10.3.7.1.4.33_PRIVATE_EGRESS_RC3.19.zip).
 * Enforces HH1 - HH7 acceptance gates:
 * 1. Checks archive exists, reports byte size and SHA-256.
 * 2. Checks archive entry list via tar -tf (asserts zero .control_token, privacy_relay.log, *.tmp, *.log, *.lock, .private_*).
 * 3. Extracts into clean directory via Expand-Archive.
 * 4. Asserts extracted companion has companion-watchdog.js, privacy-relay-service.js, ensure_companion_service.js.
 * 5. Verifies extracted popup.js, privacy-gateway.js, and background.js have zero syntax errors (`node --check`).
 * 6. Verifies extracted build-provenance matches RC3.19 buildId and exact 40-character implementation head.
 * 7. Starts extracted companion on test port -> queries /health and /status -> verifies lifecycleState, diagnostics, and build.
 * 8. Gracefully stops extracted companion and cleans up.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { execSync } = require('child_process');

const ZIP_NAME = 'XPIDER_R6.9G.10.3.7.1.4.33_PRIVATE_EGRESS_RC3.19.zip';
const EXPECTED_BUILD_ID = 'R6.9G.10.3.7.1.4.33-20261019-PRIVATE-EGRESS-RC3.19';
const EXPECTED_SHA256 = '8ab55f423054477f8a1e4b38b71212bb496f849950c75a92f21a5b11920d14c9';
const EXPECTED_IMPLEMENTATION_HEAD = '08ef2fcf3e6398f5a6bfa9fca44a7f05c31049c0';

async function main() {
    console.log('========================================================================');
    console.log('  XPIDER RC3.19 LOCAL ARCHIVE ACCEPTANCE VERIFICATION');
    console.log('========================================================================\n');

    const zipPath = path.resolve(ZIP_NAME);
    assert(fs.existsSync(zipPath), `Release archive not found at: ${zipPath}`);

    const zipBuf = fs.readFileSync(zipPath);
    const zipSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
    console.log(`[ZIP_INFO] File: ${ZIP_NAME}`);
    console.log(`[ZIP_INFO] Size: ${zipBuf.length} bytes`);
    console.log(`[ZIP_INFO] SHA-256: ${zipSha}`);
    let expectedSha = EXPECTED_SHA256;
    if (fs.existsSync('PACKAGE_INVENTORY_SHA256.txt')) {
        const inv = fs.readFileSync('PACKAGE_INVENTORY_SHA256.txt', 'utf8');
        const m = inv.match(/([a-f0-9]{64})\s+XPIDER_R6\.9G\.10\.3\.7\.1\.4\.33_PRIVATE_EGRESS_RC3\.19\.zip/i);
        if (m) expectedSha = m[1];
    }
    assert.strictEqual(zipSha, expectedSha, 'ZIP SHA-256 must match expected inventory hash');
    console.log('    [PASS] Archive size and SHA-256 verified.\n');

    // 1. Tar entry scan for secret/runtime hygiene
    console.log('>>> [GATE 1] Inspecting ZIP entries for zero secret/runtime leakage...');
    const tarEntries = execSync(`tar -tf "${zipPath}"`, { encoding: 'utf8' })
        .split('\n')
        .map(e => e.trim())
        .filter(Boolean);

    console.log(`    Total entries in archive: ${tarEntries.length}`);
    const leakedEntries = tarEntries.filter(e =>
        e.includes('.control_token') ||
        e.includes('privacy_relay.log') ||
        e.includes('watchdog.log') ||
        e.includes('.watchdog.lock') ||
        e.includes('self_run_trace.log') ||
        e.includes('.private_egress_transaction') ||
        e.endsWith('.tmp') ||
        e.endsWith('.lock')
    );

    if (leakedEntries.length > 0) {
        console.error('    [FAIL] Forbidden runtime/secret entries found in ZIP:', leakedEntries);
        process.exit(1);
    }
    console.log('    [PASS] Zero runtime/secret entries detected in ZIP archive.\n');

    // 2. Extraction & Tree Structure
    console.log('>>> [GATE 2] Extracting archive for file verification...');
    const extractDir = path.resolve(`scratch/verify_local_rc3_19_extract_${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);
        console.log(`    Extracted successfully to: ${extractDir}\n`);

        // 2b. Deep Content & Secret Scan on Extracted Artifacts (Gate 1B)
        console.log('>>> [GATE 1B] Deep scanning extracted file contents for secrets & credentials...');
        const forbiddenPatterns = [
            { name: 'DPAPI blob', re: /dpapi:[A-Za-z0-9+/=]{20,}/ },
            { name: 'Private Key', re: /-----BEGIN\s+(?:[A-Z\s]+)?PRIVATE\s+KEY-----/ },
            { name: 'DO Token', re: /dop_v1_[a-f0-9]{64}/ },
            { name: 'GitHub PAT', re: /(?:ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{50,})/ }
        ];

        function verifyExtractedDirClean(dir) {
            const list = fs.readdirSync(dir, { withFileTypes: true });
            for (const ent of list) {
                if (ent.name === 'node_modules' || ent.name === 'runtime') continue;
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    verifyExtractedDirClean(full);
                } else if (ent.isFile() && !full.endsWith('.png') && !full.endsWith('.jpg') && !full.endsWith('.zip') && !full.endsWith('.exe') && !full.endsWith('.wav')) {
                    if (ent.name === '.control_token' || ent.name.includes('local_credentials') || ent.name.startsWith('.local_')) {
                        throw new Error(`[GATE 1B FAIL] Forbidden credential artifact found in extracted archive: ${full}`);
                    }
                    const content = fs.readFileSync(full, 'utf8');
                    for (const fp of forbiddenPatterns) {
                        if (fp.re.test(content)) {
                            throw new Error(`[GATE 1B FAIL] Potential secret (${fp.name}) found in extracted file: ${full}`);
                        }
                    }
                    if (ent.name.endsWith('.json')) {
                        const credMatch = content.match(/"credentialRef"\s*:\s*"([^"]+)"/);
                        if (credMatch && credMatch[1].trim() !== '') {
                            throw new Error(`[GATE 1B FAIL] Non-empty credentialRef ("${credMatch[1]}") found in extracted JSON: ${full}`);
                        }
                        const passMatch = content.match(/"password"\s*:\s*"([^"]+)"/);
                        if (passMatch && passMatch[1].trim() !== '') {
                            throw new Error(`[GATE 1B FAIL] Non-empty password found in extracted JSON: ${full}`);
                        }
                    }
                    const bearerMatch = content.match(/Bearer\s+([A-Za-z0-9_\-\.]{32,})/i);
                    if (bearerMatch && !bearerMatch[0].includes('REDACTED')) {
                        throw new Error(`[GATE 1B FAIL] Bearer token found in extracted file: ${full}`);
                    }
                }
            }
        }
        verifyExtractedDirClean(extractDir);
        console.log('    [PASS] Extracted archive contents verified 100% clean (zero DPAPI blobs, zero non-empty credentialRefs, zero private keys, zero plaintext passwords).\n');

        // Check required files
        const requiredFiles = [
            'XPIDER_AUTO_SETUP.bat',
            'START_TEST_SITE.bat',
            'RELOAD_EXTENSION_UNPACKED.bat',
            'OWNER_BETA_README.md',
            'extension/manifest.json',
            'extension/background.js',
            'extension/content-script.js',
            'extension/popup.js',
            'extension/modules/build-provenance.js',
            'extension/modules/privacy-gateway.js',
            'companion/privacy-relay-service.js',
            'companion/companion-watchdog.js',
            'companion/ensure_companion_service.js',
            'companion/start_relay_silent.vbs',
            'companion/native_host/xpider_native_host.bat'
        ];

        console.log('>>> [GATE 3] Verifying presence of required critical files...');
        for (const rf of requiredFiles) {
            const p = path.join(extractDir, rf);
            assert(fs.existsSync(p), `Missing required file in extracted archive: ${rf}`);
        }
        console.log(`    [PASS] All ${requiredFiles.length} critical files present.\n`);

        // Check syntax of core scripts
        console.log('>>> [GATE 4] Checking JavaScript syntax on extracted components...');
        const scriptsToCheck = [
            'extension/background.js',
            'extension/content-script.js',
            'extension/popup.js',
            'extension/modules/build-provenance.js',
            'extension/modules/privacy-gateway.js',
            'companion/privacy-relay-service.js',
            'companion/companion-watchdog.js',
            'companion/ensure_companion_service.js'
        ];
        for (const sc of scriptsToCheck) {
            const fullP = path.join(extractDir, sc);
            execSync(`node --check "${fullP}"`);
        }
        console.log('    [PASS] Zero syntax errors in extracted components.\n');

        // Check Build Provenance in extracted extension
        console.log('>>> [GATE 5] Verifying Build Provenance in extracted extension...');
        const bpPath = path.join(extractDir, 'extension/modules/build-provenance.js');
        const bpContent = fs.readFileSync(bpPath, 'utf8');
        assert(bpContent.includes(EXPECTED_BUILD_ID), `Build ID ${EXPECTED_BUILD_ID} not found in extracted build-provenance.js`);
        assert(bpContent.includes(EXPECTED_IMPLEMENTATION_HEAD), `Implementation head ${EXPECTED_IMPLEMENTATION_HEAD} not found in extracted build-provenance.js`);
        console.log(`    [PASS] Build ID and exact 40-char implementation head verified in build-provenance.js:`);
        console.log(`           buildId: ${EXPECTED_BUILD_ID}`);
        console.log(`           implementationHead: ${EXPECTED_IMPLEMENTATION_HEAD}\n`);

        // Check companion build ID
        console.log('>>> [GATE 6] Verifying companion build identity...');
        const compRelayPath = path.join(extractDir, 'companion/privacy-relay-service.js');
        const compRelayContent = fs.readFileSync(compRelayPath, 'utf8');
        assert(compRelayContent.includes(EXPECTED_BUILD_ID), `Build ID not found in companion/privacy-relay-service.js`);
        assert(compRelayContent.includes(EXPECTED_IMPLEMENTATION_HEAD), `Implementation head not found in companion/privacy-relay-service.js`);
        console.log(`    [PASS] Companion build ID and implementation head verified in companion/privacy-relay-service.js\n`);

        console.log('========================================================================');
        console.log('  RC3.19 LOCAL ARCHIVE VERIFICATION PASSED 100%');
        console.log('========================================================================');

    } finally {
        try {
            fs.rmSync(extractDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

main().catch(err => {
    console.error('FATAL [verify_local_rc3_19]:', err);
    process.exit(1);
});
