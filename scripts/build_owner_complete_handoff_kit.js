#!/usr/bin/env node
/**
 * Deterministic Builder & Dual-Method Verifier for the Single Owner-Usable Complete UAT Handoff Kit (REV16)
 * Directive #6707178560 Item 4 (preserving REV15 frozen at 43a9bcdf... and building newly versioned REV16).
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
const RAW_BASE = 'https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/';
const FROZEN_REV15_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const FROZEN_REV15_ZIP_ABS = path.join(ROOT, FROZEN_REV15_ZIP_REL);
const FROZEN_REV15_ZIP_SHA = '43a9bcdfff9651b8f31644d31dc8eba0463e8b5ee1163f198096b0d2a99959cd';
const FROZEN_REV15_ZIP_SIZE = 4560445;
const COMPLETE_ZIP_REL = 'dist/XPIDER_V7.0.0_CANDIDATE_REV16_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip';
const COMPLETE_ZIP_ABS = path.join(ROOT, COMPLETE_ZIP_REL);
const MANIFEST_REV14_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV14.json');
const MANIFEST_REV15_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV15.json');
const MANIFEST_REV16_ABS = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV16.json');

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
    // Item 4 (#6707178560): Verify that prior REV15 archive and manifest remain frozen and untouched on disk
    if (!fs.existsSync(FROZEN_REV15_ZIP_ABS) || !fs.existsSync(MANIFEST_REV15_ABS)) {
        throw new Error('FROZEN_REV15_ARCHIVE_MISSING: Prior REV15 archive or manifest is missing');
    }
    const rev15Buf = fs.readFileSync(FROZEN_REV15_ZIP_ABS);
    const rev15Sha = crypto.createHash('sha256').update(rev15Buf).digest('hex');
    if (rev15Buf.length !== FROZEN_REV15_ZIP_SIZE || rev15Sha !== FROZEN_REV15_ZIP_SHA) {
        throw new Error(`FROZEN_REV15_MUTATED: size=${rev15Buf.length} sha=${rev15Sha}`);
    }

    const coreSpec = [
        { role: 'extension_runtime_zip_50_files_only', relPath: 'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip' },
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
        { role: 'clean_extracted_handoff_kit_e2e_test_suite', relPath: 'test/run_clean_extracted_handoff_kit_e2e.js' }
    ];

    const mapSpec = (spec) => spec.map(item => {
        const abs = path.join(ROOT, item.relPath);
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
        schemaVersion: 'XPIDER_OWNER_HANDOFF_MANIFEST_REV16',
        directive: '#6707178560',
        status: 'CANDIDATE_RELEASE_HOLD',
        branch: 'candidate/p0-core-regressions-v7',
        functionalCandidateCommit: '76fab0933276ae163c377d39d9dca5169a33063c',
        extensionTreeSha: '1d1bac897f70df6fa107cde85b00de591d5dea93',
        expectedExtensionId: EXT_ID,
        extensionZipAloneIsCompleteKit: false,
        extensionZipScopeNote: 'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip contains ONLY the 50 Chrome MV3 runtime files from extension/. The complete owner-usable handoff archive is dist/XPIDER_V7.0.0_CANDIDATE_REV16_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip (built via node scripts/build_owner_complete_handoff_kit.js; prior REV15 archive preserved frozen).',
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
                    'Get-FileHash .\\dist\\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256',
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

    const manifestRev16 = {
        ...manifestRev14,
        schemaVersion: 'XPIDER_OWNER_HANDOFF_MANIFEST_REV16',
        directive: '#6707178560',
        preservedFrozenRev15Archive: {
            path: FROZEN_REV15_ZIP_REL,
            manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV15.json',
            size: FROZEN_REV15_ZIP_SIZE,
            sha256: FROZEN_REV15_ZIP_SHA,
            verifiedUntouched: true
        },
        completeHandoffArchive: {
            path: COMPLETE_ZIP_REL,
            rawUrl: RAW_BASE + COMPLETE_ZIP_REL,
            reproducibleBuildCommand: 'node scripts/build_owner_complete_handoff_kit.js',
            unambiguousExtractionCommandPowerShell: 'Expand-Archive -Path ".\\XPIDER_V7.0.0_CANDIDATE_REV16_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip" -DestinationPath "D:\\xpider_handoff_rev16" -Force; Set-Location "D:\\xpider_handoff_rev16"',
            extractionRootLayout: 'Extracting into <HANDOFF_ROOT> (e.g. D:\\xpider_handoff_rev16) creates dist/, scripts/, owner-extension-test-site/, and test/ directly under <HANDOFF_ROOT> so all relative guide commands run verbatim from <HANDOFF_ROOT>.',
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
    fs.writeFileSync(MANIFEST_REV16_ABS, JSON.stringify(manifestRev16, null, 2) + '\n');
    return manifestRev16;
}

if (require.main === module) {
    const m = buildHandoffKit();
    console.log(JSON.stringify({
        result: 'COMPLETE_HANDOFF_KIT_REV16_BUILT_AND_DUAL_VERIFIED',
        archivePath: m.completeHandoffArchive.path,
        size: m.completeHandoffArchive.size,
        sha256: m.completeHandoffArchive.sha256,
        preservedRev15Sha256: m.preservedFrozenRev15Archive.sha256,
        bundledEntriesCount: m.completeHandoffArchive.bundledEntriesCount,
        dualVerification: m.completeHandoffArchive.dualMethodIntegrityVerification
    }, null, 2));
}

module.exports = { buildHandoffKit };
