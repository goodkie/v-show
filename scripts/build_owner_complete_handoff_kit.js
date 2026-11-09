#!/usr/bin/env node
/**
 * Deterministic Builder & Dual-Method Verifier for the Single Owner-Usable Complete UAT Handoff Kit (REV20)
 * Directive #6735785250 (Correcting stale candidate branch raw URLs to active branch fix/submit-nomessage-semiauto-20261109,
 * preserving REV15 frozen at 43a9bcdf..., REV16 frozen at 0ad5ff7b..., REV17 frozen at 9136c130..., REV18 frozen at e15b5208...,
 * and REV19 frozen at 4a80d66b..., building newly versioned REV20).
 *
 * Usage:
 *   node scripts/build_owner_complete_handoff_kit.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const EXT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';

function resolveActiveGitBranch() {
    try {
        const out = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
        const b = (out.stdout || '').trim();
        if (b && b !== 'HEAD') return b;
    } catch (_) {}
    return 'fix/submit-nomessage-semiauto-20261109';
}

const ACTIVE_BRANCH = resolveActiveGitBranch();
const RAW_BASE = `https://github.com/goodkie/v-show/raw/${ACTIVE_BRANCH}/`;

const FROZEN_REV15_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const FROZEN_REV15_ZIP_ABS = path.join(ROOT, FROZEN_REV15_ZIP_REL);
const FROZEN_REV15_ZIP_SHA = '43a9bcdfff9651b8f31644d31dc8eba0463e8b5ee1163f198096b0d2a99959cd';
const FROZEN_REV15_ZIP_SIZE = 4560445;

const FROZEN_REV16_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV16_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const FROZEN_REV16_ZIP_ABS = path.join(ROOT, FROZEN_REV16_ZIP_REL);
const FROZEN_REV16_ZIP_SHA = '0ad5ff7bada90cc870a22beb43f838b6592ab1d3aa0c9b6fa7a11536a4dabaa9';
const FROZEN_REV16_ZIP_SIZE = 4569570;

const FROZEN_REV17_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV17_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const FROZEN_REV17_ZIP_ABS = path.join(ROOT, FROZEN_REV17_ZIP_REL);
const FROZEN_REV17_ZIP_SHA = '9136c130a8a8e96fc4a4fe1834b656e558e4014a6defa1e03f88d5744b83dd14';
const FROZEN_REV17_ZIP_SIZE = 4581357;

const FROZEN_REV18_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV18_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const FROZEN_REV18_ZIP_ABS = path.join(ROOT, FROZEN_REV18_ZIP_REL);
const FROZEN_REV18_ZIP_SHA = 'e15b520854bdbefc550411af7b5b21b7709f6d52ebbea7dc3ade917d94f8799d';
const FROZEN_REV18_ZIP_SIZE = 4591822;

const FROZEN_REV19_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV19_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const FROZEN_REV19_ZIP_ABS = path.join(ROOT, FROZEN_REV19_ZIP_REL);
const FROZEN_REV19_ZIP_SHA = '4a80d66b69d03029565ba36e0bc12991381aefe5074aeabe5cc88202f1cd8180';
const FROZEN_REV19_ZIP_SIZE = 4603827;

const COMPLETE_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV20_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const COMPLETE_ZIP_ABS = path.join(ROOT, COMPLETE_ZIP_REL);

const MANIFEST_REV14_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV14.json');
const MANIFEST_REV15_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV15.json');
const MANIFEST_REV16_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV16.json');
const MANIFEST_REV17_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV17.json');
const MANIFEST_REV18_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV18.json');
const MANIFEST_REV19_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV19.json');
const MANIFEST_REV20_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV20.json');

// CRC-32 lookup table for deterministic ZIP creation
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Builds a deterministic ZIP archive buffer in memory with fixed DOS timestamp (1980-01-01 00:00:00).
 * Pre-compressed `.zip` files are stored (method 0); all other files use deterministic deflate (method 8).
 */
function buildDeterministicZipBuffer(entries) {
    const sorted = [...entries].sort((a, b) => a.zipPath.localeCompare(b.zipPath));
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const DOS_TIME = 0x0000;
    const DOS_DATE = 0x0021; // 1980-01-01

    for (const item of sorted) {
        const nameBuf = Buffer.from(item.zipPath.replace(/\\/g, '/'), 'utf8');
        const rawBuf = item.data;
        const crc = crc32(rawBuf);
        const isAlreadyZip = /\.zip$/i.test(item.zipPath);
        const compBuf = isAlreadyZip ? rawBuf : zlib.deflateRawSync(rawBuf, { level: 6 });
        const method = isAlreadyZip ? 0 : 8;

        const lfh = Buffer.alloc(30);
        lfh.writeUInt32LE(0x04034b50, 0);
        lfh.writeUInt16LE(20, 4);
        lfh.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
        lfh.writeUInt16LE(method, 8);
        lfh.writeUInt16LE(DOS_TIME, 10);
        lfh.writeUInt16LE(DOS_DATE, 12);
        lfh.writeUInt32LE(crc, 14);
        lfh.writeUInt32LE(compBuf.length, 18);
        lfh.writeUInt32LE(rawBuf.length, 22);
        lfh.writeUInt16LE(nameBuf.length, 26);
        lfh.writeUInt16LE(0, 28);

        localParts.push(lfh, nameBuf, compBuf);

        const cdh = Buffer.alloc(46);
        cdh.writeUInt32LE(0x02014b50, 0);
        cdh.writeUInt16LE(20, 4);
        cdh.writeUInt16LE(20, 6);
        cdh.writeUInt16LE(0x0800, 8);
        cdh.writeUInt16LE(method, 10);
        cdh.writeUInt16LE(DOS_TIME, 12);
        cdh.writeUInt16LE(DOS_DATE, 14);
        cdh.writeUInt32LE(crc, 16);
        cdh.writeUInt32LE(compBuf.length, 20);
        cdh.writeUInt32LE(rawBuf.length, 24);
        cdh.writeUInt16LE(nameBuf.length, 28);
        cdh.writeUInt16LE(0, 30);
        cdh.writeUInt16LE(0, 32);
        cdh.writeUInt16LE(0, 34);
        cdh.writeUInt16LE(0, 36);
        cdh.writeUInt32LE(0, 38);
        cdh.writeUInt32LE(offset, 42);

        centralParts.push(cdh, nameBuf);
        offset += lfh.length + nameBuf.length + compBuf.length;
    }

    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(sorted.length, 8);
    eocd.writeUInt16LE(sorted.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralBuf, eocd]);
}

function buildHandoffKit() {
    // 1. Verify that prior REV15 archive and manifest remain frozen and untouched on disk
    if (!fs.existsSync(FROZEN_REV15_ZIP_ABS) || !fs.existsSync(MANIFEST_REV15_ABS)) {
        throw new Error('FROZEN_REV15_ARCHIVE_MISSING: Prior REV15 archive or manifest is missing');
    }
    const rev15Buf = fs.readFileSync(FROZEN_REV15_ZIP_ABS);
    const rev15Sha = crypto.createHash('sha256').update(rev15Buf).digest('hex');
    if (rev15Buf.length !== FROZEN_REV15_ZIP_SIZE || rev15Sha !== FROZEN_REV15_ZIP_SHA) {
        throw new Error(`FROZEN_REV15_MUTATED: size=${rev15Buf.length} sha=${rev15Sha}`);
    }

    // 2. Verify that prior REV16 archive and manifest remain frozen and untouched on disk
    if (!fs.existsSync(FROZEN_REV16_ZIP_ABS) || !fs.existsSync(MANIFEST_REV16_ABS)) {
        throw new Error('FROZEN_REV16_ARCHIVE_MISSING: Prior REV16 archive or manifest is missing');
    }
    const rev16Buf = fs.readFileSync(FROZEN_REV16_ZIP_ABS);
    const rev16Sha = crypto.createHash('sha256').update(rev16Buf).digest('hex');
    if (rev16Buf.length !== FROZEN_REV16_ZIP_SIZE || rev16Sha !== FROZEN_REV16_ZIP_SHA) {
        throw new Error(`FROZEN_REV16_MUTATED: size=${rev16Buf.length} sha=${rev16Sha}`);
    }

    // 3. Verify that prior REV17 archive and manifest remain frozen and untouched on disk
    if (!fs.existsSync(FROZEN_REV17_ZIP_ABS) || !fs.existsSync(MANIFEST_REV17_ABS)) {
        throw new Error('FROZEN_REV17_ARCHIVE_MISSING: Prior REV17 archive or manifest is missing');
    }
    const rev17Buf = fs.readFileSync(FROZEN_REV17_ZIP_ABS);
    const rev17Sha = crypto.createHash('sha256').update(rev17Buf).digest('hex');
    if (rev17Buf.length !== FROZEN_REV17_ZIP_SIZE || rev17Sha !== FROZEN_REV17_ZIP_SHA) {
        throw new Error(`FROZEN_REV17_MUTATED: size=${rev17Buf.length} sha=${rev17Sha}`);
    }

    // 4. Verify that prior REV18 archive and manifest remain frozen and untouched on disk
    if (!fs.existsSync(FROZEN_REV18_ZIP_ABS) || !fs.existsSync(MANIFEST_REV18_ABS)) {
        throw new Error('FROZEN_REV18_ARCHIVE_MISSING: Prior REV18 archive or manifest is missing');
    }
    const rev18Buf = fs.readFileSync(FROZEN_REV18_ZIP_ABS);
    const rev18Sha = crypto.createHash('sha256').update(rev18Buf).digest('hex');
    if (rev18Buf.length !== FROZEN_REV18_ZIP_SIZE || rev18Sha !== FROZEN_REV18_ZIP_SHA) {
        throw new Error(`FROZEN_REV18_MUTATED: size=${rev18Buf.length} sha=${rev18Sha}`);
    }

    // 5. Verify that prior REV19 archive and manifest remain frozen and untouched on disk
    if (!fs.existsSync(FROZEN_REV19_ZIP_ABS) || !fs.existsSync(MANIFEST_REV19_ABS)) {
        throw new Error('FROZEN_REV19_ARCHIVE_MISSING: Prior REV19 archive or manifest is missing');
    }
    const rev19Buf = fs.readFileSync(FROZEN_REV19_ZIP_ABS);
    const rev19Sha = crypto.createHash('sha256').update(rev19Buf).digest('hex');
    if (rev19Buf.length !== FROZEN_REV19_ZIP_SIZE || rev19Sha !== FROZEN_REV19_ZIP_SHA) {
        throw new Error(`FROZEN_REV19_MUTATED: size=${rev19Buf.length} sha=${rev19Sha}`);
    }

    const coreSpec = [
        { role: 'extension_runtime_zip_50_files_only', relPath: 'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip' },
        { role: 'standalone_transactional_updater_and_uat_cli', relPath: 'scripts/xpider_safe_update.js' },
        { role: 'candidate_50_file_sha256_inventory', relPath: 'dist/PACKAGE_INVENTORY_SHA256.json' },
        { role: 'frozen_rc11_baseline_manifest', relPath: 'dist/rc11_baseline_manifest.json' },
        { role: 'synthetic_only_windows_10_uat_checklist', relPath: 'dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md' },
        { role: 'owner_safe_update_backup_and_rollback_guide', relPath: 'dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md' },
        { role: 'localhost_fixture_and_fail_closed_sink_proxy_server', relPath: 'owner-extension-test-site/server.js' },
        { role: 'localhost_fixture_contact_standard_html', relPath: 'owner-extension-test-site/contact-standard.html' },
        { role: 'localhost_fixture_subscribe_no_message_html', relPath: 'owner-extension-test-site/subscribe-no-message.html' },
        { role: 'localhost_fixture_consent_required_no_message_html', relPath: 'owner-extension-test-site/consent-required-no-message.html' },
        { role: 'localhost_fixture_contact_success_html', relPath: 'owner-extension-test-site/contact-success.html' },
        { role: 'automated_uat_isolation_and_preflight_harness', relPath: 'test/run_uat_synthetic_profile_isolation_check.js' },
        { role: 'automated_browser_cdp_helper', relPath: 'test/lib/browser_cdp.js' }
    ];

    const extraKitSpec = [
        { role: 'complete_handoff_kit_deterministic_builder', relPath: 'scripts/build_owner_complete_handoff_kit.js' },
        { role: 'localhost_fixture_index_html', relPath: 'owner-extension-test-site/index.html' },
        { role: 'transactional_updater_test_suite', relPath: 'test/run_safe_update_transaction_tests.js' },
        { role: 'clean_extracted_handoff_kit_e2e_test_suite', relPath: 'test/run_clean_extracted_handoff_kit_e2e.js' },
        { role: 'start_step07_privacy_prep_regression_suite', relPath: 'test/run_start_step07_privacy_prep_regression.js' },
        { role: 'submit_nomessage_semiauto_regression_suite', relPath: 'test/run_submit_nomessage_semiauto_regression.js' },
        { role: 'no_message_discovery_r2_dom_suite', relPath: 'test/run_no_message_discovery_r2_dom_suite.js' },
        { role: 'chrome_no_message_dom_suite', relPath: 'test/run_chrome_no_message_dom_suite.js' },
        { role: 'handoff_url_consistency_and_remote_verification_suite', relPath: 'test/run_handoff_url_consistency_and_remote_verification.js' },
        { role: 'owner_handoff_manifest_rev16_compat', relPath: 'dist/OWNER_HANDOFF_MANIFEST_REV16.json' },
        { role: 'owner_handoff_manifest_rev17_compat', relPath: 'dist/OWNER_HANDOFF_MANIFEST_REV17.json' },
        { role: 'owner_handoff_manifest_rev18_compat', relPath: 'dist/OWNER_HANDOFF_MANIFEST_REV18.json' },
        { role: 'owner_handoff_manifest_rev19_compat', relPath: 'dist/OWNER_HANDOFF_MANIFEST_REV19.json' }
    ];

    const mapSpec = (spec) => spec.map(item => {
        const abs = path.join(ROOT, item.relPath);
        if (!fs.existsSync(abs)) {
            throw new Error(`File missing for kit: ${abs}`);
        }
        const buf = fs.readFileSync(abs);
        return {
            role: item.role,
            path: item.relPath,
            size: buf.length,
            sha256: crypto.createHash('sha256').update(buf).digest('hex'),
            rawUrl: RAW_BASE + item.relPath
        };
    });

    const coreFiles = mapSpec(coreSpec);
    const acceptanceMatrix = {
        G1_candidateRuntimeFreezeAndHandoffKitIntegrity: 'SOURCE_METADATA_VERIFIED + DEV_PASS',
        G2_chrome157AndEdge146MigrationBackupRestoreParity: 'DEV_PASS (Developer-Executed Only; Not Independently Run by ChatGPT/Owner)',
        G3_chrome157FunctionalUi3ModeResetCsvConsentSuite: 'DEV_PASS (Developer-Executed Only; Not Independently Run by ChatGPT/Owner)',
        G4_transactionalUpdaterCleanExtractAndSyntheticRestoreOriginGate: 'DEV_PASS (Developer-Executed Only; Not Independently Run by ChatGPT/Owner)',
        G5_browserSinkProxyDnrQuicAndDryRunPreflightUat: 'DEV_PASS (Scoped to Browser Proxy/DNR/CDP Path ONLY; 0 Forwarded Sink Requests Is NOT Proof of Total Host Egress Default-Deny)',
        G6_osKernelDefaultDenyFirewallRuleOnTestChromeOrVm: 'BLOCKED (BLOCKED_NO_SAFE_ELEVATED_TEST_VM)',
        G7_ownerWindows10LiveDesktopSmoke: 'NOT_TESTED (OWNER_ACTION_REQUIRED)',
        G8_realExternalNopeChaExtensionInteroperability: 'NOT_TESTED (OWNER_ACTION_REQUIRED)',
        G9_authorizedDigitalOceanDecodoRelayEgressVerification: 'NOT_TESTED (OWNER_ACTION_REQUIRED)',
        G10_ownerFinalReleaseAndLiveUpdateApproval: 'NOT_TESTED (OWNER_ACTION_REQUIRED)'
    };

    const manifestRev14 = {
        schemaVersion: 'XPIDER_OWNER_HANDOFF_MANIFEST_REV20',
        directive: '#6735785250',
        status: 'CANDIDATE_RELEASE_HOLD',
        branch: ACTIVE_BRANCH,
        functionalCandidateCommit: '32cc9386dedcc68315364e1fc27e1161c09d1aa8',
        extensionTreeSha: 'e561ef38b2ae04a616b7dcad9206d480ca4dca5a (step07-prepResult-hotfix + submit-nomessage-semiauto-fix + no-message-discovery-r2-fix)',
        expectedExtensionId: EXT_ID,
        extensionZipAloneIsCompleteKit: false,
        extensionZipScopeNote: 'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip contains ONLY the 50 Chrome MV3 runtime files from extension/ (including Step 07 TDZ Hotfix, submit/no-message/semi-auto fixes, and FormDiscoveryEngine R2 opt-in fix). The complete owner-usable handoff archive is dist/XPIDER_V7.0.0_CANDIDATE_REV20_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip (built via node scripts/build_owner_complete_handoff_kit.js; prior REV15, REV16, REV17, REV18, and REV19 archives preserved frozen).',
        operatorCapabilityByEnvironment: {
            withNodeJs18Plus: {
                supported: true,
                capabilities: [
                    'preflight-uat (read-only dry-run preflight)',
                    'init-uat-profile (creates disposable UAT profile with 256-bit uatSessionNonce in .xpider-uat-disposable-profile.json)',
                    'backup-storage & backup-uat-synthetic (AES-256-GCM encrypted offline backup + Chrome API chrome.storage.local.get(null) readback attestation)',
                    'verify-storage-backup (in-memory integrity verification, writtenToDisk: false)',
                    'restore-storage & restore-uat-synthetic (scope-verified atomic restore; blocks real backups in UAT even with --allow-synthetic-uat-restore; allows real recovery on uat-named real folders via --confirm-offline-owner-recovery)',
                    'plan / apply / rollback / recover (journaled transactional code update)',
                    'owner-extension-test-site/server.js (localhost 127.0.0.1:8088 fixtures + 127.0.0.1:8090 fail-closed sink proxy)'
                ]
            },
            withoutNodeJsPowerShellOnly: {
                supportedForFullSyntheticCampaignUat: false,
                phaseBCampaignUatStatusWithoutNode: 'BLOCKED',
                allowedPowerShellFallbacks: [
                    'Get-FileHash .\\dist\\XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip -Algorithm SHA256',
                    'Manual offline Copy-Item of Local Extension Settings\\ldlijlaccfeelfdhgnjbibniocefckjj while Chrome is closed',
                    'Expand-Archive into a disposable copy for static UI inspection only (cannot run localhost fixtures or local sink proxy without Node.js)'
                ]
            }
        },
        consolidatedAcceptanceMatrix: acceptanceMatrix,
        files: coreFiles
    };
    fs.writeFileSync(MANIFEST_REV14_ABS, JSON.stringify(manifestRev14, null, 2) + '\n');

    const allZipEntrySpecs = [
        ...coreSpec,
        ...extraKitSpec,
        { role: 'owner_handoff_manifest_rev14_compat', relPath: 'dist/OWNER_HANDOFF_MANIFEST_REV14.json' }
    ];

    const zipInputEntries = allZipEntrySpecs.map(s => ({
        zipPath: s.relPath,
        role: s.role,
        data: fs.readFileSync(path.join(ROOT, s.relPath))
    }));

    // Invocation 1: build ZIP buffer and write to disk
    const zipBuf1 = buildDeterministicZipBuffer(zipInputEntries);
    fs.writeFileSync(COMPLETE_ZIP_ABS, zipBuf1);
    const shaMethod1Invocation1 = crypto.createHash('sha256').update(zipBuf1).digest('hex');

    // Invocation 2 (independent deterministic rebuild in memory)
    const zipBuf2 = buildDeterministicZipBuffer(zipInputEntries);
    const shaMethod1Invocation2 = crypto.createHash('sha256').update(zipBuf2).digest('hex');
    if (shaMethod1Invocation1 !== shaMethod1Invocation2 || !zipBuf1.equals(zipBuf2)) {
        throw new Error('DETERMINISTIC_ZIP_MISMATCH: Two invocations produced different bytes');
    }

    // Method 2: Independent PowerShell Get-FileHash + .NET System.IO.Compression.ZipFile entry-by-entry hash check
    const psVerifyScript = [
        `Add-Type -AssemblyName System.IO.Compression.FileSystem;`,
        `$zPath = '${COMPLETE_ZIP_ABS.replace(/'/g, "''")}';`,
        `$outerHash = (Get-FileHash -LiteralPath $zPath -Algorithm SHA256).Hash.ToLower();`,
        `$zip = [System.IO.Compression.ZipFile]::OpenRead($zPath);`,
        `$entries = @();`,
        `foreach ($e in $zip.Entries) {`,
        `  $s = $e.Open();`,
        `  $sha = [System.Security.Cryptography.SHA256]::Create();`,
        `  $h = [BitConverter]::ToString($sha.ComputeHash($s)).Replace('-','').ToLower();`,
        `  $s.Close();`,
        `  $entries += [PSCustomObject]@{ path = $e.FullName; size = $e.Length; sha256 = $h };`,
        `}`,
        `$zip.Dispose();`,
        `[PSCustomObject]@{ outerSha256 = $outerHash; entryCount = $entries.Count; entries = $entries } | ConvertTo-Json -Depth 4 -Compress`
    ].join(' ');
    const psRes = spawnSync('powershell', ['-NoProfile', '-Command', psVerifyScript], { encoding: 'utf8' });
    if (psRes.status !== 0) {
        throw new Error(`POWERSHELL_ZIP_VERIFY_FAILED: ${psRes.stderr || psRes.stdout}`);
    }
    const psData = JSON.parse(psRes.stdout.trim());
    if (psData.outerSha256 !== shaMethod1Invocation1) {
        throw new Error(`DUAL_HASH_MISMATCH: Node=${shaMethod1Invocation1} PowerShell=${psData.outerSha256}`);
    }

    const zipTreeManifest = mapSpec(allZipEntrySpecs);
    for (const expected of zipTreeManifest) {
        const found = (psData.entries || []).find(e => e.path === expected.path);
        if (!found || Number(found.size) !== expected.size || found.sha256 !== expected.sha256) {
            throw new Error(`DOTNET_ZIP_ENTRY_MISMATCH for ${expected.path}`);
        }
    }

    const manifestRev20 = {
        ...manifestRev14,
        schemaVersion: 'XPIDER_OWNER_HANDOFF_MANIFEST_REV20',
        directive: '#6735785250',
        preservedFrozenRev15Archive: {
            path: FROZEN_REV15_ZIP_REL,
            manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV15.json',
            size: FROZEN_REV15_ZIP_SIZE,
            sha256: FROZEN_REV15_ZIP_SHA,
            verifiedUntouched: true
        },
        preservedFrozenRev16Archive: {
            path: FROZEN_REV16_ZIP_REL,
            manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV16.json',
            size: FROZEN_REV16_ZIP_SIZE,
            sha256: FROZEN_REV16_ZIP_SHA,
            verifiedUntouched: true
        },
        preservedFrozenRev17Archive: {
            path: FROZEN_REV17_ZIP_REL,
            manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV17.json',
            size: FROZEN_REV17_ZIP_SIZE,
            sha256: FROZEN_REV17_ZIP_SHA,
            verifiedUntouched: true
        },
        preservedFrozenRev18Archive: {
            path: FROZEN_REV18_ZIP_REL,
            manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV18.json',
            size: FROZEN_REV18_ZIP_SIZE,
            sha256: FROZEN_REV18_ZIP_SHA,
            verifiedUntouched: true
        },
        preservedFrozenRev19Archive: {
            path: FROZEN_REV19_ZIP_REL,
            manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV19.json',
            size: FROZEN_REV19_ZIP_SIZE,
            sha256: FROZEN_REV19_ZIP_SHA,
            verifiedUntouched: true
        },
        completeHandoffArchive: {
            path: COMPLETE_ZIP_REL,
            rawUrl: RAW_BASE + COMPLETE_ZIP_REL,
            reproducibleBuildCommand: 'node scripts/build_owner_complete_handoff_kit.js',
            unambiguousExtractionCommandPowerShell: 'Expand-Archive -Path ".\\XPIDER_V7.0.0_CANDIDATE_REV20_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip" -DestinationPath "D:\\xpider_handoff_rev20" -Force; Set-Location "D:\\xpider_handoff_rev20"',
            extractionRootLayout: 'Extracting into <HANDOFF_ROOT> (e.g. D:\\xpider_handoff_rev20) creates dist/, scripts/, owner-extension-test-site/, and test/ directly under <HANDOFF_ROOT> so all relative guide commands run verbatim from <HANDOFF_ROOT>.',
            size: zipBuf1.length,
            sha256: shaMethod1Invocation1,
            dualMethodIntegrityVerification: {
                method1_nodeCryptoDeterminismCheck: {
                    invocation1Sha256: shaMethod1Invocation1,
                    invocation2Sha256: shaMethod1Invocation2,
                    byteIdenticalAcrossInvocations: true
                },
                method2_powerShellGetFileHashAndDotNetZipFile: {
                    powerShellGetFileHashSha256: psData.outerSha256,
                    dotNetZipFileEntryCount: psData.entryCount,
                    allEntriesMatchedSourceDiskSha256: true
                }
            },
            bundledEntriesCount: zipTreeManifest.length,
            bundledEntries: zipTreeManifest
        }
    };
    fs.writeFileSync(MANIFEST_REV20_ABS, JSON.stringify(manifestRev20, null, 2) + '\n');
    return manifestRev20;
}

if (require.main === module) {
    const m = buildHandoffKit();
    console.log(JSON.stringify({
        result: 'COMPLETE_HANDOFF_KIT_REV20_BUILT_AND_DUAL_VERIFIED',
        archivePath: m.completeHandoffArchive.path,
        size: m.completeHandoffArchive.size,
        sha256: m.completeHandoffArchive.sha256,
        preservedRev15Sha256: m.preservedFrozenRev15Archive.sha256,
        preservedRev16Sha256: m.preservedFrozenRev16Archive.sha256,
        preservedRev17Sha256: m.preservedFrozenRev17Archive.sha256,
        preservedRev18Sha256: m.preservedFrozenRev18Archive.sha256,
        preservedRev19Sha256: m.preservedFrozenRev19Archive.sha256,
        bundledEntriesCount: m.completeHandoffArchive.bundledEntriesCount,
        dualVerification: m.completeHandoffArchive.dualMethodIntegrityVerification
    }, null, 2));
}

module.exports = { buildHandoffKit };
