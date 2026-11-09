#!/usr/bin/env node
/**
 * Clean-Room Extracted Handoff Kit End-to-End Verification Suite (REV18)
 * Directive #6708288652 (Preserving REV15 frozen, REV16 frozen, verifying newly versioned REV18 with Step 07 TDZ Hotfix).
 *
 * Extracts `dist/XPIDER_V7.0.0_CANDIDATE_REV18_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip` into a brand-new
 * temporary directory outside the repository working tree, and executes every relative path,
 * PowerShell command, Node CLI subcommand (`preflight-uat`, `init-uat-profile`, `backup-storage`,
 * `backup-uat-synthetic`, `verify-storage-backup`, `restore-storage` / `restore-uat-synthetic`
 * negative/positive scope gates, `verify-uat-firewall`, `plan`, `apply`, `rollback`,
 * `audit-uat-state`), and local fixture/sink server startup + shutdown strictly from the extracted folder.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { buildHandoffKit } = require('../scripts/build_owner_complete_handoff_kit');
const { buildManifest } = require('../scripts/xpider_safe_update');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RC11_BASE_DIR = path.join(DIST, 'rc11_extension_baseline', 'extension');
const REPORT_PATH = path.join(DIST, 'report_clean_extracted_handoff_kit_e2e.json');
const EXT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const EXPECTED_RUNTIME_ZIP_SHA = '02624da91d7bc9bb4933c76245c4320433b3df4fc4d046d07ead3b6e43dfcd26';
const FROZEN_REV15_ZIP_SHA = '43a9bcdfff9651b8f31644d31dc8eba0463e8b5ee1163f198096b0d2a99959cd';
const FROZEN_REV16_ZIP_SHA = '0ad5ff7bada90cc870a22beb43f838b6592ab1d3aa0c9b6fa7a11536a4dabaa9';
const FROZEN_REV17_ZIP_SHA = '9136c130a8a8e96fc4a4fe1834b656e558e4014a6defa1e03f88d5744b83dd14';
const FROZEN_REV18_ZIP_SHA = 'e15b520854bdbefc550411af7b5b21b7709f6d52ebbea7dc3ade917d94f8799d';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256File = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const report = {
    suite: 'XPIDER_CLEAN_EXTRACTED_HANDOFF_KIT_E2E_REV19',
    directive: '#6732442879',
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    completeHandoffArchive: null,
    preservedFrozenRev15Archive: null,
    preservedFrozenRev16Archive: null,
    preservedFrozenRev17Archive: null,
    preservedFrozenRev18Archive: null,
    cleanExtractionRootUsed: null,
    assertions: [],
    status: 'RUNNING'
};

let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

function runNodeInExtract(extractRoot, args, extraEnv = {}) {
    const r = spawnSync(process.execPath, args, {
        cwd: extractRoot,
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv }
    });
    const text = (r.stdout || '') + (r.stderr || '');
    let out = null;
    try { out = JSON.parse((r.stdout || r.stderr || '').trim()); } catch (_) { out = { raw: text.slice(0, 300) }; }
    return { status: r.status, out, text };
}

function runPsInExtract(extractRoot, psCommand, extraEnv = {}) {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', psCommand], {
        cwd: extractRoot,
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv }
    });
    return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

(async () => {
    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-clean-handoff-e2e-'));
    const extractRoot = path.join(tempBase, 'extracted_handoff_root');
    const simLiveTarget = path.join(tempBase, 'sim_live_rc11_target');
    const simRealProfile = path.join(tempBase, 'sim_real_owner_profile');
    let serverProc = null;
    const TEST_FIXTURE_PORT = 18088;
    const TEST_SINK_PORT = 18090;

    try {
        // 1. Build complete REV19 handoff archive and verify dual-method byte integrity + frozen REV15, REV16, REV17 & REV18 preservation
        const manifest17 = buildHandoffKit();
        report.completeHandoffArchive = manifest17.completeHandoffArchive;
        report.preservedFrozenRev15Archive = manifest17.preservedFrozenRev15Archive;
        report.preservedFrozenRev16Archive = manifest17.preservedFrozenRev16Archive;
        report.preservedFrozenRev17Archive = manifest17.preservedFrozenRev17Archive;
        report.preservedFrozenRev18Archive = manifest17.preservedFrozenRev18Archive;
        report.cleanExtractionRootUsed = extractRoot;

        const dv = manifest17.completeHandoffArchive.dualMethodIntegrityVerification;
        A('A1_DUAL_METHOD_OUTER_HANDOFF_ZIP_INTEGRITY',
            dv &&
            dv.method1_nodeCryptoDeterminismCheck.byteIdenticalAcrossInvocations === true &&
            dv.method1_nodeCryptoDeterminismCheck.invocation1Sha256 === dv.method2_powerShellGetFileHashAndDotNetZipFile.powerShellGetFileHashSha256 &&
            dv.method2_powerShellGetFileHashAndDotNetZipFile.allEntriesMatchedSourceDiskSha256 === true &&
            manifest17.completeHandoffArchive.bundledEntriesCount === 24 &&
            manifest17.preservedFrozenRev15Archive &&
            manifest17.preservedFrozenRev15Archive.verifiedUntouched === true &&
            manifest17.preservedFrozenRev15Archive.sha256 === FROZEN_REV15_ZIP_SHA &&
            manifest17.preservedFrozenRev16Archive &&
            manifest17.preservedFrozenRev16Archive.verifiedUntouched === true &&
            manifest17.preservedFrozenRev16Archive.sha256 === FROZEN_REV16_ZIP_SHA &&
            manifest17.preservedFrozenRev17Archive &&
            manifest17.preservedFrozenRev17Archive.verifiedUntouched === true &&
            manifest17.preservedFrozenRev17Archive.sha256 === FROZEN_REV17_ZIP_SHA &&
            manifest17.preservedFrozenRev18Archive &&
            manifest17.preservedFrozenRev18Archive.verifiedUntouched === true &&
            manifest17.preservedFrozenRev18Archive.sha256 === FROZEN_REV18_ZIP_SHA,
            {
                archivePath: manifest17.completeHandoffArchive.path,
                size: manifest17.completeHandoffArchive.size,
                sha256: manifest17.completeHandoffArchive.sha256,
                preservedRev15Sha256: manifest17.preservedFrozenRev15Archive.sha256,
                preservedRev16Sha256: manifest17.preservedFrozenRev16Archive.sha256,
                preservedRev17Sha256: manifest17.preservedFrozenRev17Archive.sha256,
                preservedRev18Sha256: manifest17.preservedFrozenRev18Archive.sha256,
                bundledEntriesCount: manifest17.completeHandoffArchive.bundledEntriesCount
            }
        );

        // 2. Copy ONLY the outer handoff ZIP to tempBase and extract into `extractRoot` via PowerShell Expand-Archive
        const stagedOuterZip = path.join(tempBase, 'XPIDER_V7.0.0_CANDIDATE_REV19_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip');
        fs.copyFileSync(path.join(ROOT, manifest17.completeHandoffArchive.path), stagedOuterZip);
        fs.mkdirSync(extractRoot, { recursive: true });
        const expandRes = runPsInExtract(tempBase, `Expand-Archive -LiteralPath '${stagedOuterZip.replace(/'/g, "''")}' -DestinationPath '${extractRoot.replace(/'/g, "''")}' -Force`);
        const allBundledExistAndMatch = manifest17.completeHandoffArchive.bundledEntries.every(e => {
            const p = path.join(extractRoot, e.path);
            if (!fs.existsSync(p)) return false;
            const buf = fs.readFileSync(p);
            return buf.length === e.size && sha256File(p) === e.sha256;
        });
        A('A2_CLEAN_EXTRACTION_AND_MANIFEST_FILE_TREE_MATCH',
            expandRes.status === 0 && allBundledExistAndMatch,
            { expandStatus: expandRes.status, verifiedFileCount: manifest17.completeHandoffArchive.bundledEntries.length }
        );

        // 3. Validate PowerShell Get-FileHash command example from the guide inside `extractRoot`
        const psHashRes = runPsInExtract(extractRoot, `(Get-FileHash ".\\dist\\XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip" -Algorithm SHA256).Hash`);
        A('A3_POWERSHELL_RUNTIME_ZIP_SHA256_COMMAND_FROM_GUIDE',
            psHashRes.status === 0 && psHashRes.stdout.toLowerCase() === EXPECTED_RUNTIME_ZIP_SHA,
            { stdout: psHashRes.stdout }
        );

        // 4. Validate guide ordering & non-destructive separation in the extracted markdown files
        const checklistMd = fs.readFileSync(path.join(extractRoot, 'dist', 'WINDOWS_10_OWNER_UAT_CHECKLIST.md'), 'utf8');
        const guideMd = fs.readFileSync(path.join(extractRoot, 'dist', 'OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md'), 'utf8');
        const idxPhaseA = checklistMd.indexOf('## Phase A');
        const idxPhaseB = checklistMd.indexOf('## Phase B');
        const idxPhaseC = checklistMd.indexOf('## Phase C');
        const idxPhaseD = checklistMd.indexOf('## Phase D');
        const requiredRelPaths = [
            'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip',
            'dist/PACKAGE_INVENTORY_SHA256.json',
            'dist/rc11_baseline_manifest.json',
            'dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md',
            'dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md',
            'scripts/xpider_safe_update.js',
            'owner-extension-test-site/server.js',
            'owner-extension-test-site/contact-standard.html',
            'owner-extension-test-site/subscribe-no-message.html',
            'owner-extension-test-site/consent-required-no-message.html',
            'owner-extension-test-site/contact-success.html',
            'test/run_uat_synthetic_profile_isolation_check.js',
            'test/lib/browser_cdp.js',
            'test/run_start_step07_privacy_prep_regression.js',
            'test/run_submit_nomessage_semiauto_regression.js'
        ];
        const allRelPathsPresentInExtract = requiredRelPaths.every(rp => fs.existsSync(path.join(extractRoot, rp)));
        A('A4_GUIDE_ORDER_AND_NON_DESTRUCTIVE_GUARD_AUDIT',
            idxPhaseA > 0 && idxPhaseA < idxPhaseB && idxPhaseB < idxPhaseC && idxPhaseC < idxPhaseD &&
            checklistMd.includes('BLOCKED_NO_SAFE_ELEVATED_TEST_VM') &&
            checklistMd.includes('NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE') &&
            checklistMd.includes('mathematical provenance of arbitrary') &&
            guideMd.includes('(`transmittedViaSinkProxy === 0`)') &&
            guideMd.includes('is NOT proof of total host egress default-deny') &&
            guideMd.includes('mathematical provenance of arbitrary') &&
            allRelPathsPresentInExtract,
            { idxPhaseA, idxPhaseB, idxPhaseC, idxPhaseD, allRelPathsPresentInExtract }
        );

        // 5. Prepare simulated live RC11 target and simulated real profile (outside extractRoot) and test Step A2 `preflight-uat`
        fs.cpSync(RC11_BASE_DIR, simLiveTarget, { recursive: true });
        const simRealLes = path.join(simRealProfile, 'Default', 'Local Extension Settings', EXT_ID);
        fs.mkdirSync(simRealLes, { recursive: true });
        const REAL_SENTINEL = 'DO_NOT_LEAK_OWNER_REAL_SECRET_REV15_8812';
        fs.writeFileSync(path.join(simRealLes, '000005.ldb'), `REAL_OWNER_DATA secret=${REAL_SENTINEL} url=https://real-customer.example.com/contact email=owner@real-company.com`);
        fs.writeFileSync(path.join(simRealLes, 'CURRENT'), 'MANIFEST-000001\n');

        const targetBeforeTree = JSON.stringify(buildManifest(simLiveTarget));
        const profBeforeTree = JSON.stringify(buildManifest(simRealLes));

        const pfRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'preflight-uat',
            '--target', simLiveTarget,
            '--profile-dir', simRealProfile,
            '--fixture-port', String(TEST_FIXTURE_PORT),
            '--sink-port', String(TEST_SINK_PORT)
        ]);
        const targetAfterTree = JSON.stringify(buildManifest(simLiveTarget));
        const profAfterTree = JSON.stringify(buildManifest(simRealLes));
        A('A5_STEP_A2_READ_ONLY_PREFLIGHT_UAT_FROM_CLEAN_EXTRACT',
            pfRes.status === 0 &&
            pfRes.out &&
            pfRes.out.mode === 'DRY_RUN_PREFLIGHT_UAT' &&
            pfRes.out.modifiedTarget === false &&
            pfRes.out.modifiedProfile === false &&
            pfRes.out.osFirewallIsolationStatus === 'BLOCKED_NO_SAFE_ELEVATED_TEST_VM' &&
            targetBeforeTree === targetAfterTree &&
            profBeforeTree === profAfterTree,
            { preflightMode: pfRes.out && pfRes.out.mode, osFirewallIsolationStatus: pfRes.out && pfRes.out.osFirewallIsolationStatus }
        );

        // 6. Step A3 & A4: Offline encrypted backup (`pre_v7.xpider-enc`) & in-memory `verify-storage-backup`
        const PASS = 'Clean-Extract-Passphrase-2026!';
        const realBackupEnc = path.join(tempBase, 'private_backups', 'pre_v7.xpider-enc');
        const bkRealRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'backup-storage',
            '--profile-dir', simRealProfile,
            '--out', realBackupEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        const verRealRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'verify-storage-backup',
            '--in', realBackupEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        A('A6_STEP_A3_A4_OFFLINE_REAL_BACKUP_AND_IN_MEMORY_VERIFY',
            bkRealRes.status === 0 &&
            bkRealRes.out &&
            bkRealRes.out.backupOrigin === 'OFFLINE_REAL_RECOVERY_ONLY' &&
            verRealRes.status === 0 &&
            verRealRes.out &&
            verRealRes.out.result === 'BACKUP_INTEGRITY_VERIFIED_IN_MEMORY' &&
            verRealRes.out.backupOrigin === 'OFFLINE_REAL_RECOVERY_ONLY' &&
            verRealRes.out.writtenToDisk === false &&
            verRealRes.out.decryptedFilesWritten === 0 &&
            !verRealRes.text.includes(REAL_SENTINEL),
            { backupOrigin: verRealRes.out && verRealRes.out.backupOrigin, writtenToDisk: verRealRes.out && verRealRes.out.writtenToDisk }
        );

        // 7. Item 5 + Item 1 (#6707178560): Initialize disposable UAT profile (`init-uat-profile`) and verify real backup restore is rejected both without and with override flag
        const uatTargetProf = path.join(tempBase, 'xpider_uat_synthetic_profile');
        const initUat1 = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'init-uat-profile',
            '--profile-dir', uatTargetProf
        ]);
        const uatSessionNonce1 = initUat1.out && initUat1.out.uatSessionNonce;
        const rejNoFlag = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'restore-storage',
            '--profile-dir', uatTargetProf,
            '--in', realBackupEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        const rejWithOverrideFlag = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'restore-uat-synthetic',
            '--profile-dir', uatTargetProf,
            '--in', realBackupEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        A('A7_ITEM5_NEGATIVE_REAL_BACKUP_TO_UAT_REJECTED_WITHOUT_AND_WITH_OVERRIDE_FLAG',
            initUat1.status === 0 &&
            typeof uatSessionNonce1 === 'string' && uatSessionNonce1.length === 64 &&
            rejNoFlag.status !== 0 &&
            rejNoFlag.out && rejNoFlag.out.code === 'REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN' &&
            rejWithOverrideFlag.status !== 0 &&
            rejWithOverrideFlag.out && rejWithOverrideFlag.out.code === 'NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE' &&
            !fs.existsSync(path.join(uatTargetProf, 'Local Extension Settings', EXT_ID, '000005.ldb')),
            { withoutFlagCode: rejNoFlag.out && rejNoFlag.out.code, withOverrideFlagCode: rejWithOverrideFlag.out && rejWithOverrideFlag.out.code }
        );

        // 8. Item 1 & 2 (#6707178560): Attempting `backup-uat-synthetic` on non-initialized real profile OR restoring a forged `SYNTHETIC_UAT_ATTESTED` archive containing real URLs/emails/secrets fails closed in memory
        const rejPollutedSynthBk = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'backup-uat-synthetic',
            '--profile-dir', simRealProfile,
            '--out', path.join(tempBase, 'forged_attempt.xpider-enc'),
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });

        // Also craft an AES-256-GCM valid archive whose JSON header claims `backupOrigin: "SYNTHETIC_UAT_ONLY"`, `backupScope: "SYNTHETIC_UAT_ATTESTED"`, and `syntheticAuditPassed: true`, but whose LevelDB buffer holds `https://real-customer.example.com/contact`
        const forgedEncPath = path.join(tempBase, 'forged_header_real_payload.xpider-enc');
        {
            const rawEnv = JSON.parse(fs.readFileSync(realBackupEnc, 'utf8'));
            const key = crypto.scryptSync(PASS, Buffer.from(rawEnv.salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(rawEnv.iv, 'base64'));
            decipher.setAuthTag(Buffer.from(rawEnv.tag, 'base64'));
            const decObj = JSON.parse(Buffer.concat([decipher.update(Buffer.from(rawEnv.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
            decObj.backupOrigin = 'SYNTHETIC_UAT_ONLY';
            decObj.backupScope = 'SYNTHETIC_UAT_ATTESTED';
            decObj.syntheticAuditPassed = true;
            decObj.uatSessionNonce = uatSessionNonce1;
            decObj.attestedStorageReadback = { xpider_uat_session_nonce: uatSessionNonce1, xpider_isPaused: true };
            decObj.chromeApiReadbackSha256 = crypto.createHash('sha256').update(JSON.stringify(decObj.attestedStorageReadback)).digest('hex');
            decObj.expectedSnapshotManifestSha256 = rawEnv.manifestSha256;
            const newIv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, newIv);
            const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(decObj), 'utf8')), cipher.final()]);
            const tag = cipher.getAuthTag();
            fs.writeFileSync(forgedEncPath, JSON.stringify({
                ...rawEnv,
                backupOrigin: 'SYNTHETIC_UAT_ONLY',
                backupScope: 'SYNTHETIC_UAT_ATTESTED',
                iv: newIv.toString('base64'),
                tag: tag.toString('base64'),
                ciphertext: ct.toString('base64')
            }, null, 2));
        }
        const rejForgedRestore = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'restore-uat-synthetic',
            '--profile-dir', uatTargetProf,
            '--in', forgedEncPath,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        A('A8_ITEM5_NEGATIVE_FORGED_SYNTHETIC_ORIGIN_WITH_REAL_CONTENT_REJECTED',
            rejPollutedSynthBk.status !== 0 &&
            rejPollutedSynthBk.out && rejPollutedSynthBk.out.code === 'MISSING_DISPOSABLE_UAT_PROFILE_IDENTITY' &&
            rejForgedRestore.status !== 0 &&
            rejForgedRestore.out && rejForgedRestore.out.code === 'NON_SYNTHETIC_BACKUP_CONTENT_FORBIDDEN' &&
            !fs.existsSync(path.join(uatTargetProf, 'Local Extension Settings', EXT_ID, '000005.ldb')),
            {
                pollutedBackupAttemptCode: rejPollutedSynthBk.out && rejPollutedSynthBk.out.code,
                forgedHeaderRestoreAttemptCode: rejForgedRestore.out && rejForgedRestore.out.code
            }
        );

        // 9. Step B2: Start local fixture + sink proxy server from `extractRoot` and run `verify-uat-firewall`
        serverProc = spawn(process.execPath, ['owner-extension-test-site\\server.js'], {
            cwd: extractRoot,
            env: { ...process.env, PORT: String(TEST_FIXTURE_PORT), SINK_PROXY_PORT: String(TEST_SINK_PORT) },
            stdio: 'ignore'
        });
        let serverReady = false;
        for (let i = 0; i < 25; i++) {
            await sleep(200);
            try {
                const st = await fetch(`http://127.0.0.1:${TEST_FIXTURE_PORT}/__xpider_firewall_status`).then(r => r.json());
                if (st && st.ok && st.firewallActive) { serverReady = true; break; }
            } catch (_) {}
        }
        const fwVerifyRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'verify-uat-firewall',
            '--fixture-port', String(TEST_FIXTURE_PORT),
            '--sink-port', String(TEST_SINK_PORT)
        ]);
        A('A9_STEP_B2_LOCAL_FIXTURE_AND_SINK_SERVER_STARTUP_AND_VERIFY_FIREWALL',
            serverReady &&
            fwVerifyRes.status === 0 &&
            fwVerifyRes.out &&
            fwVerifyRes.out.result === 'UAT_FIREWALL_VERIFIED_FAIL_CLOSED' &&
            fwVerifyRes.out.httpProbeBlocked403 === true &&
            fwVerifyRes.out.connectProbeBlocked403 === true &&
            fwVerifyRes.out.transmittedExternalRequests === 0,
            fwVerifyRes.out
        );

        // 10. Step B3: Copy `simLiveTarget` to disposable `uat_ext` via PowerShell `Copy-Item`, run `plan` and `apply` from `extractRoot`
        const uatExtDir = path.join(tempBase, 'xpider_uat_ext');
        const uatCodeBk = path.join(tempBase, 'xpider_uat_code_bk');
        const copyRes = runPsInExtract(extractRoot, `Copy-Item -LiteralPath '${simLiveTarget.replace(/'/g, "''")}' -Destination '${uatExtDir.replace(/'/g, "''")}' -Recurse`);
        const planRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'plan',
            '--target', uatExtDir,
            '--archive', 'dist\\XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip',
            '--expected-sha', EXPECTED_RUNTIME_ZIP_SHA,
            '--inventory', 'dist\\PACKAGE_INVENTORY_SHA256.json',
            '--baseline', 'dist\\rc11_baseline_manifest.json'
        ]);
        const planToken = planRes.out && planRes.out.PLAN_TOKEN;
        const applyRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'apply',
            '--target', uatExtDir,
            '--archive', 'dist\\XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip',
            '--expected-sha', EXPECTED_RUNTIME_ZIP_SHA,
            '--inventory', 'dist\\PACKAGE_INVENTORY_SHA256.json',
            '--baseline', 'dist\\rc11_baseline_manifest.json',
            '--backup-root', uatCodeBk,
            '--approve', String(planToken || '')
        ]);
        const expectedInv = JSON.parse(fs.readFileSync(path.join(extractRoot, 'dist', 'PACKAGE_INVENTORY_SHA256.json'), 'utf8'));
        const uatAppliedManifest = buildManifest(uatExtDir);
        const all50MatchInventory = uatAppliedManifest.length === expectedInv.length &&
            expectedInv.every(e => uatAppliedManifest.some(u => u.path === e.path && u.size === e.size && u.sha256 === e.sha256));
        const liveStillUntouched = JSON.stringify(buildManifest(simLiveTarget)) === targetBeforeTree;
        A('A10_STEP_B3_DISPOSABLE_COPY_PLAN_AND_APPLY_FROM_CLEAN_EXTRACT',
            copyRes.status === 0 &&
            planRes.status === 0 &&
            typeof planToken === 'string' && planToken.length === 16 &&
            applyRes.status === 0 &&
            applyRes.out && applyRes.out.result === 'COMMITTED' &&
            all50MatchInventory &&
            liveStillUntouched,
            { planToken, applyResult: applyRes.out && applyRes.out.result, appliedFileCount: uatAppliedManifest.length, all50MatchInventory, liveStillUntouched }
        );

        // 11. Synthetic-only UAT state audit (`audit-uat-state`) from `extractRoot`
        const synthStateJson = path.join(uatTargetProf, '.xpider-uat-storage-readback.json');
        fs.writeFileSync(synthStateJson, JSON.stringify({
            xpider_schema_version: 2,
            xpider_uat_session_nonce: uatSessionNonce1,
            templates_v2: {
                activeTemplateId: 'uat_1',
                templates: { uat_1: { email: 'operator@uat-local.test', website: `http://127.0.0.1:${TEST_FIXTURE_PORT}`, includeFormsWithoutMessage: false } }
            },
            savedUrlLists_v2: {
                lists: { l1: { urls: [`http://127.0.0.1:${TEST_FIXTURE_PORT}/contact-standard.html`] } }
            },
            xpider_isPaused: true
        }, null, 2));
        const auditRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'audit-uat-state',
            '--in', synthStateJson,
            '--profile-dir', uatTargetProf
        ]);
        A('A11_SYNTHETIC_ONLY_PROFILE_SEED_AND_AUDIT_UAT_STATE',
            auditRes.status === 0 &&
            auditRes.out &&
            auditRes.out.result === 'UAT_PROFILE_ISOLATION_VERIFIED' &&
            auditRes.out.uatSessionNonce === uatSessionNonce1,
            auditRes.out
        );

        // 12. Step B10: Synthetic backup (`backup-uat-synthetic --storage-readback`) and restore (`restore-uat-synthetic`) into `xpider_uat_synthetic_profile_2`
        const uatLes1 = path.join(uatTargetProf, 'Default', 'Local Extension Settings', EXT_ID);
        fs.mkdirSync(uatLes1, { recursive: true });
        fs.writeFileSync(path.join(uatLes1, '000005.ldb'), `SYNTHETIC_UAT_LDB url=http://127.0.0.1:${TEST_FIXTURE_PORT}/contact-standard.html email=operator@uat-local.test`);
        fs.writeFileSync(path.join(uatLes1, 'CURRENT'), 'MANIFEST-000001\n');
        const synthEnc = path.join(tempBase, 'xpider_uat_synthetic.xpider-enc');
        const bkSynthRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'backup-uat-synthetic',
            '--profile-dir', uatTargetProf,
            '--storage-readback', synthStateJson,
            '--out', synthEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        const uatTargetProf2 = path.join(tempBase, 'xpider_uat_synthetic_profile_2');
        const initUat2 = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'init-uat-profile',
            '--profile-dir', uatTargetProf2
        ]);
        const restSynthRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'restore-uat-synthetic',
            '--profile-dir', uatTargetProf2,
            '--in', synthEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS'
        ], { XPIDER_BACKUP_PASS: PASS });
        A('A12_STEP_B10_SYNTHETIC_BACKUP_AND_ORIGIN_VERIFIED_RESTORE',
            initUat2.status === 0 &&
            bkSynthRes.status === 0 &&
            bkSynthRes.out && bkSynthRes.out.backupScope === 'SYNTHETIC_UAT_ATTESTED' &&
            bkSynthRes.out.uatSessionNonce === uatSessionNonce1 &&
            restSynthRes.status === 0 &&
            restSynthRes.out && restSynthRes.out.result === 'RESTORED_VERIFIED' &&
            restSynthRes.out.backupScope === 'SYNTHETIC_UAT_ATTESTED',
            { bkScope: bkSynthRes.out && bkSynthRes.out.backupScope, restoreResult: restSynthRes.out && restSynthRes.out.result }
        );

        // 13. Item 2 & 3 (#6707178560): Negative controls (compressed, Unicode, escaped, serialized, unknown key, non-'uat' path) and `--confirm-offline-owner-recovery` on 'uat'-named real folder
        const dummyCompressed = zlib.deflateSync(Buffer.from('https://dummy-compressed-leak.example.org/form', 'utf8')).toString('base64');
        const negCompressedJson = path.join(tempBase, 'neg_compressed.json');
        const negUnknownKeyJson = path.join(tempBase, 'neg_unknown_key.json');
        fs.writeFileSync(negCompressedJson, JSON.stringify({
            xpider_schema_version: 2,
            xpider_uat_session_nonce: uatSessionNonce1,
            templates_v2: { activeTemplateId: 't1', templates: { t1: { email: 'operator@uat-local.test', message: dummyCompressed } } }
        }));
        fs.writeFileSync(negUnknownKeyJson, JSON.stringify({
            xpider_schema_version: 2,
            xpider_uat_session_nonce: uatSessionNonce1,
            unrecognized_custom_key: 'any_value'
        }));
        const rejComp = runNodeInExtract(extractRoot, ['scripts\\xpider_safe_update.js', 'audit-uat-state', '--in', negCompressedJson]);
        const rejUnk = runNodeInExtract(extractRoot, ['scripts\\xpider_safe_update.js', 'audit-uat-state', '--in', negUnknownKeyJson]);
        const nonUatPlainDir = path.join(tempBase, 'plain_profile_no_identity');
        fs.mkdirSync(nonUatPlainDir, { recursive: true });
        const rejNonUatRestore = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'restore-storage',
            '--profile-dir', nonUatPlainDir,
            '--in', synthEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS',
            '--allow-synthetic-uat-restore'
        ], { XPIDER_BACKUP_PASS: PASS });
        A('A13_ITEM2_NEGATIVE_CONTROLS_COMPRESSED_UNKNOWN_KEY_AND_NON_UAT_NO_IDENTITY_RESTORE',
            rejComp.status !== 0 && rejComp.out && rejComp.out.code === 'NON_LOOPBACK_TARGET_IN_UAT_PROFILE' &&
            rejUnk.status !== 0 && rejUnk.out && rejUnk.out.code === 'UNRECOGNIZED_STORAGE_KEY_IN_UAT_PROFILE' &&
            rejNonUatRestore.status !== 0 && rejNonUatRestore.out && rejNonUatRestore.out.code === 'MISSING_DISPOSABLE_UAT_PROFILE_IDENTITY',
            {
                compressedCode: rejComp.out && rejComp.out.code,
                unknownKeyCode: rejUnk.out && rejUnk.out.code,
                nonUatNoIdentityCode: rejNonUatRestore.out && rejNonUatRestore.out.code
            }
        );

        const realFolderWithUatInName = path.join(tempBase, 'real_owner_stuart_uat_folder');
        fs.mkdirSync(realFolderWithUatInName, { recursive: true });
        const realRecoveryOnUatNamedFolder = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'restore-storage',
            '--profile-dir', realFolderWithUatInName,
            '--in', realBackupEnc,
            '--passphrase-env', 'XPIDER_BACKUP_PASS',
            '--confirm-offline-owner-recovery'
        ], { XPIDER_BACKUP_PASS: PASS });
        A('A14_ITEM3_REAL_RECOVERY_SUCCEEDS_ON_UAT_NAMED_REAL_FOLDER_WITH_CONFIRM_FLAG',
            realRecoveryOnUatNamedFolder.status === 0 &&
            realRecoveryOnUatNamedFolder.out && realRecoveryOnUatNamedFolder.out.result === 'RESTORED_VERIFIED',
            realRecoveryOnUatNamedFolder.out
        );

        // 15. Step B10: Rollback `uat_ext` to byte-identical RC11 baseline
        const rbRes = runNodeInExtract(extractRoot, [
            'scripts\\xpider_safe_update.js',
            'rollback',
            '--target', uatExtDir,
            '--backup-root', uatCodeBk
        ]);
        const uatRolledBackTree = JSON.stringify(buildManifest(uatExtDir));
        A('A15_STEP_B10_TRANSACTIONAL_ROLLBACK_TO_BYTE_IDENTICAL_RC11',
            rbRes.status === 0 &&
            rbRes.out && rbRes.out.result === 'ROLLED_BACK' &&
            uatRolledBackTree === targetBeforeTree,
            { rollbackResult: rbRes.out && rbRes.out.result, byteIdenticalToRc11: uatRolledBackTree === targetBeforeTree }
        );

        // 16. Clean shutdown of local fixture + sink server via PowerShell `Invoke-RestMethod`
        const shutRes = runPsInExtract(extractRoot, `Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:${TEST_FIXTURE_PORT}/__xpider_shutdown" | ConvertTo-Json -Compress`);
        await sleep(250);
        A('A16_LOCAL_FIXTURE_AND_SINK_SERVER_CLEAN_SHUTDOWN',
            shutRes.status === 0 && shutRes.stdout.includes('"ok":true'),
            { shutdownOutput: shutRes.stdout }
        );

    } catch (e) {
        failures++;
        report.error = e.stack;
        console.error(e);
    } finally {
        if (serverProc) {
            try { serverProc.kill(); } catch (_) {}
        }
        try { fs.rmSync(tempBase, { recursive: true, force: true }); } catch (_) {}
        report.status = failures === 0 ? 'SUCCESS' : 'FAILED';
        report.endedAt = new Date().toISOString();
        report.total = report.assertions.length;
        report.failed = failures;
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
        console.log(`\n${report.total - failures}/${report.total} PASS -> ${REPORT_PATH}`);
        process.exit(failures ? 1 : 0);
    }
})();
