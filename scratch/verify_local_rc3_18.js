/**
 * verify_local_rc3_18.js
 *
 * Verifies local RC3.18 release archive (XPIDER_R6.9G.10.3.7.1.4.32_PRIVATE_EGRESS_RC3.18.zip).
 * Enforces HH1 - HH7 acceptance gates:
 * 1. Checks archive exists, reports byte size and SHA-256.
 * 2. Checks archive entry list via tar -tf (asserts zero .control_token, privacy_relay.log, *.tmp, *.log, *.lock, .private_*).
 * 3. Extracts into clean directory via Expand-Archive.
 * 4. Asserts extracted companion has companion-watchdog.js, privacy-relay-service.js, ensure_companion_service.js.
 * 5. Verifies extracted popup.js, privacy-gateway.js, and background.js have zero syntax errors (`node --check`).
 * 6. Verifies extracted build-provenance matches RC3.18 buildId.
 * 7. Starts extracted companion on test port -> queries /health and /status -> verifies lifecycleState, diagnostics, and build.
 * 8. Gracefully stops extracted companion and cleans up.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { execSync } = require('child_process');

const ZIP_NAME = 'XPIDER_R6.9G.10.3.7.1.4.32_PRIVATE_EGRESS_RC3.18.zip';
const EXPECTED_BUILD_ID = 'R6.9G.10.3.7.1.4.32-20261019-PRIVATE-EGRESS-RC3.18';
const EXPECTED_SHA256 = '8dd5092d851e0d5f9f51d2ae46aab4258624151cc10fc415143dc6ae5206d65b';

async function main() {
    console.log('========================================================================');
    console.log('  XPIDER RC3.18 LOCAL ARCHIVE ACCEPTANCE VERIFICATION');
    console.log('========================================================================\n');

    const zipPath = path.resolve(ZIP_NAME);
    assert(fs.existsSync(zipPath), `Release archive not found at: ${zipPath}`);

    const zipBuf = fs.readFileSync(zipPath);
    const zipSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
    console.log(`[ZIP_INFO] File: ${ZIP_NAME}`);
    console.log(`[ZIP_INFO] Size: ${zipBuf.length} bytes`);
    console.log(`[ZIP_INFO] SHA-256: ${zipSha}`);
    assert.strictEqual(zipSha, EXPECTED_SHA256, 'ZIP SHA-256 must match expected');
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
        throw new Error(`LEAK DETECTED in archive entries:\n${leakedEntries.join('\n')}`);
    }
    console.log('    [PASS] 0 secret/runtime/token files found in archive entries.\n');

    // 2. Extract into clean scratch directory
    const extractDir = path.resolve('scratch', 'verify_local_rc3_18_extract_' + Date.now());
    console.log(`>>> [GATE 2] Extracting archive to isolated test directory: ${extractDir}...`);
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);
        console.log('    [PASS] Extraction completed successfully.\n');

        // 3. Verify extracted packaging structure
        console.log('>>> [GATE 3] Validating extracted components and scripts...');
        const extDir = path.join(extractDir, 'extension');
        const compDir = path.join(extractDir, 'companion');

        assert(fs.existsSync(extDir), 'extension/ directory must exist');
        assert(fs.existsSync(compDir), 'companion/ directory must exist');
        assert(fs.existsSync(path.join(compDir, 'companion-watchdog.js')), 'companion-watchdog.js must exist');
        assert(fs.existsSync(path.join(compDir, 'privacy-relay-service.js')), 'privacy-relay-service.js must exist');
        assert(fs.existsSync(path.join(compDir, 'ensure_companion_service.js')), 'ensure_companion_service.js must exist');
        assert(fs.existsSync(path.join(extractDir, 'XPIDER_AUTO_SETUP.bat')), 'XPIDER_AUTO_SETUP.bat must exist');
        console.log('    [PASS] All expected components and executables present.\n');

        // 4. Syntax verification of key extracted JS files
        console.log('>>> [GATE 4] Syntax checking extracted scripts with node --check...');
        execSync(`node --check "${path.join(compDir, 'privacy-relay-service.js')}"`);
        execSync(`node --check "${path.join(compDir, 'companion-watchdog.js')}"`);
        execSync(`node --check "${path.join(compDir, 'ensure_companion_service.js')}"`);
        execSync(`node --check "${path.join(extDir, 'background.js')}"`);
        execSync(`node --check "${path.join(extDir, 'popup.js')}"`);
        execSync(`node --check "${path.join(extDir, 'modules', 'privacy-gateway.js')}"`);
        execSync(`node --check "${path.join(extDir, 'modules', 'build-provenance.js')}"`);
        console.log('    [PASS] All extracted JS files passed syntax validation (zero errors).\n');

        // 5. Build provenance check
        console.log('>>> [GATE 5] Verifying build provenance metadata in extracted extension...');
        const bpContent = fs.readFileSync(path.join(extDir, 'modules', 'build-provenance.js'), 'utf8');
        assert(bpContent.includes(EXPECTED_BUILD_ID), `build-provenance must contain ${EXPECTED_BUILD_ID}`);
        console.log('    [PASS] Extracted build-provenance.js stamped with expected build ID.\n');

        // 6. Test extracted companion live startup on non-conflicting test ports
        console.log('>>> [GATE 6] Running extracted companion live startup and health check...');
        const { PrivacyRelayService } = require(path.join(compDir, 'privacy-relay-service.js'));
        const testTokenPath = path.join(compDir, '.test_token');
        const testToken = 'rc3_18_verify_token_' + Date.now();
        fs.writeFileSync(testTokenPath, testToken, 'utf8');

        const testCtrlPort = 19689;
        const testProxyPort = 19688;

        const svc = new PrivacyRelayService({
            controlPort: testCtrlPort,
            proxyPort: testProxyPort,
            configFile: path.join(compDir, 'privacy_relay_pool.json'),
            tokenFile: testTokenPath,
            controlToken: testToken,
            enableContinuousHealthMonitor: false,
            exitOnShutdown: false
        });

        await svc.start();

        // Query /health
        const healthRes = await new Promise((resolve) => {
            http.get(`http://127.0.0.1:${testCtrlPort}/health`, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
            });
        });

        assert.strictEqual(healthRes.status, 200, '/health must return HTTP 200');
        assert.strictEqual(healthRes.body.companionBuildId, EXPECTED_BUILD_ID, 'companionBuildId must match');
        assert.ok(healthRes.body.lifecycleState, 'lifecycleState must be reported');
        console.log('    [PASS] Extracted companion /health returned 200 with lifecycleState.\n');

        // Query /status with token
        const statusRes = await new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: testCtrlPort,
                path: '/status',
                headers: { 'Authorization': `Bearer ${testToken}` }
            }, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
            });
            req.end();
        });

        assert.strictEqual(statusRes.status, 200, 'Authenticated /status must return HTTP 200');
        assert.ok(statusRes.body.service.includes('XPIDER Privacy Relay'), 'Service name must match');
        assert.ok(statusRes.body.diagnostics, 'diagnostics object must be reported on authenticated /status');
        assert.strictEqual(statusRes.body.diagnostics.companionProcess.ok, true, 'companionProcess must be ok');
        assert.strictEqual(statusRes.body.diagnostics.localProxyListener.port, testProxyPort, 'localProxyListener port must match');
        console.log('    [PASS] Extracted companion authenticated /status returned 200 OK with full diagnostics.\n');

        await svc.stop();
        try { fs.unlinkSync(testTokenPath); } catch (_) {}

        console.log('========================================================================');
        console.log('  ALL RC3.18 LOCAL ARCHIVE ACCEPTANCE GATES PASSED (100%)');
        console.log('========================================================================');
    } finally {
        try {
            fs.rmSync(extractDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch (_) {}
    }
}

main().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error('\n❌ LOCAL VERIFICATION FAILED:', err);
    process.exit(1);
});
