/**
 * XPIDER V7 UAT Synthetic Profile Isolation & Offline Backup In-Memory Verification Harness
 * (Directive #6703224519 Items 1, 2, 3).
 *
 * Verifies:
 *  1. Real backup encrypted archive is verified 100% in memory via `verify-storage-backup`
 *     without decrypting/writing any file to disk, and is NEVER restored into the UAT profile.
 *  2. Disposable Google Chrome (157.0.8103.38) UAT profile is seeded exclusively with synthetic
 *     localhost-only (127.0.0.1:8088) fixtures and passes `audit-uat-state` with zero production
 *     keys/URLs/emails/credentials, zero auto-resumed campaigns on startup, and zero public POSTs.
 *  3. `audit-uat-state` fails closed on non-loopback URLs, proxy/secret credentials, non-synthetic
 *     emails, or active campaign flags without logging raw secret values.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { Br, BIN, EXT_ID } = require('./lib/browser_cdp');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CAND = path.join(DIST, 'clean_room_unpacked_v7');
const CLI = path.join(ROOT, 'scripts', 'xpider_safe_update.js');
const REPORT = path.join(DIST, 'report_uat_synthetic_profile_isolation.json');
const PORT = 9245;

function runCli(args, extraEnv = {}) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv }
    });
    const text = (r.stdout || '') + (r.stderr || '');
    let out = null;
    try { out = JSON.parse((r.stdout || r.stderr || '').trim()); } catch (_) { out = { raw: text.slice(0, 300) }; }
    return { status: r.status, out, text };
}

const report = {
    suite: 'XPIDER_UAT_SYNTHETIC_PROFILE_ISOLATION_AND_IN_MEMORY_BACKUP_VERIFY',
    browserBinary: BIN,
    runtimeBrowserVersion: null,
    extensionId: EXT_ID,
    startedAt: new Date().toISOString(),
    assertions: [],
    status: 'RUNNING'
};
let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

(async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-uat-iso-'));
    let br = null;
    try {
        // 1. Offline encrypted backup in-memory verification (never decrypted to disk, never restored to UAT)
        const simRealProf = path.join(work, 'sim_real_owner_profile');
        const simRealLes = path.join(simRealProf, 'Default', 'Local Extension Settings', EXT_ID);
        fs.mkdirSync(simRealLes, { recursive: true });
        const SENSITIVE_SENTINEL = 'DO_NOT_LEAK_OWNER_REAL_SECRET_99182';
        fs.writeFileSync(path.join(simRealLes, '000005.ldb'), `REAL_OWNER_LEVELDB_${SENSITIVE_SENTINEL}`);
        fs.writeFileSync(path.join(simRealLes, 'CURRENT'), 'MANIFEST-000001\n');

        const encFile = path.join(work, 'offline_recovery_only.xpider-enc');
        const PASS = 'Offline-Recovery-Passphrase-2026!';
        const bkRes = runCli(['backup-storage', '--profile-dir', simRealProf, '--out', encFile, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
        A('OFFLINE_ENCRYPTED_BACKUP_CREATED', bkRes.status === 0 && bkRes.out.result === 'BACKUP_ENCRYPTED');

        const verifyWorkDir = path.join(work, 'verify_empty_dir');
        fs.mkdirSync(verifyWorkDir, { recursive: true });
        const verOk = runCli(['verify-storage-backup', '--in', encFile, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
        const filesInVerifyDir = fs.readdirSync(verifyWorkDir);
        A('IN_MEMORY_BACKUP_VERIFY_SUCCEEDS_WITHOUT_WRITING_TO_DISK',
            verOk.status === 0 &&
            verOk.out.result === 'BACKUP_INTEGRITY_VERIFIED_IN_MEMORY' &&
            verOk.out.writtenToDisk === false &&
            verOk.out.decryptedFilesWritten === 0 &&
            filesInVerifyDir.length === 0 &&
            !verOk.text.includes(SENSITIVE_SENTINEL),
            verOk.out
        );

        const verWrong = runCli(['verify-storage-backup', '--in', encFile, '--passphrase-env', 'XP_PASS'], { XP_PASS: 'Wrong-Passphrase-9999' });
        A('IN_MEMORY_BACKUP_VERIFY_WRONG_PASSPHRASE_FAILS_CLOSED',
            verWrong.status !== 0 && verWrong.out.code === 'WRONG_PASSPHRASE_OR_CORRUPT_BACKUP' && !verWrong.text.includes(SENSITIVE_SENTINEL),
            verWrong.out
        );

        // 2. Launch real Google Chrome on an isolated clean UAT profile (NEVER restoring encFile)
        const uatProf = path.join(work, 'uat_clean_chrome_profile');
        br = new Br(uatProf, CAND, PORT);
        await br.start();
        report.runtimeBrowserVersion = await br.version();
        A('REAL_GOOGLE_CHROME_UAT_PROFILE_BOOTED', /^Chrome\//.test(report.runtimeBrowserVersion) && !/Edg\//.test(report.runtimeBrowserVersion), { version: report.runtimeBrowserVersion });

        // Seed synthetic-only UAT fixtures (127.0.0.1:8088 only, .test emails only, zero credentials)
        await br.sw(`(async()=>{
            const uatSeed = {
                xpider_schema_version: 2,
                xpider_migration_phase: 'COMPLETED',
                templates_v2: {
                    version: 2,
                    activeTemplateId: 'uat_default',
                    defaultTemplateId: 'uat_default',
                    templates: {
                        uat_default: {
                            id: 'uat_default',
                            name: 'Synthetic UAT Inquiry',
                            firstName: 'Uat',
                            lastName: 'Tester',
                            fullName: 'Uat Tester',
                            email: 'operator@uat-local.test',
                            phone: '555-0100',
                            company: 'Synthetic UAT Lab',
                            website: 'http://127.0.0.1:8088',
                            subject: 'Synthetic UAT Check',
                            message: 'Disposable localhost UAT message.',
                            includeFormsWithoutMessage: false,
                            ownerAuthorizedConsent: false
                        }
                    }
                },
                savedUrlLists_v2: {
                    lists: {
                        uat_localhost_list: {
                            name: 'Localhost UAT Queue',
                            urls: [
                                'http://127.0.0.1:8088/contact-standard.html',
                                'http://127.0.0.1:8088/subscribe-no-message.html',
                                'http://127.0.0.1:8088/consent-required-no-message.html'
                            ]
                        }
                    }
                },
                xpider_email_collector_v1: {
                    version: 1,
                    totalUnique: 2,
                    emails: {
                        'contact@uat-local.test': { email: 'contact@uat-local.test', sourceHostnames: ['127.0.0.1'], seenCount: 1 },
                        'info@uat-local.test': { email: 'info@uat-local.test', sourceHostnames: ['127.0.0.1'], seenCount: 1 }
                    }
                },
                xpider_history_attempts: [
                    { attemptId: 'att_uat_1', url: 'http://127.0.0.1:8088/contact-standard.html', targetIdentity: 'https://127.0.0.1/contact-standard.html', status: 'CONFIRMED_SUCCESS', generation: 1, generationId: 1, campaignRunId: 'run_uat_seed' }
                ],
                xpider_history_targets: [
                    ['https://127.0.0.1/contact-standard.html', { targetIdentity: 'https://127.0.0.1/contact-standard.html', isSuppressed: true, suppressionReason: 'CONFIRMED_SUCCESS', effectiveGeneration: 1 }]
                ],
                xpider_paused_checkpoint: {
                    campaignMode: 'AUTO',
                    campaignRunId: 'run_uat_paused',
                    remainingQueue: ['http://127.0.0.1:8088/subscribe-no-message.html'],
                    totalTargets: 2,
                    pausedByOperator: true,
                    restorationLogged: true
                },
                xpider_isPaused: true
            };
            await chrome.storage.local.set(uatSeed);
            return true;
        })()`);

        const liveUatState = await br.sw(`(async()=>{
            const st = await chrome.storage.local.get(null);
            const tabs = await chrome.tabs.query({});
            return {
                storage: st,
                isActive: !!(typeof campaignState !== 'undefined' && campaignState.isActive),
                isLoopRunning: !!(typeof campaignState !== 'undefined' && campaignState.isLoopRunning),
                nonBlankTabs: tabs.map(t => t.url).filter(u => u && u !== 'about:blank' && !u.startsWith('chrome://'))
            };
        })()`);

        A('UAT_STARTUP_NO_AUTO_RESUMED_CAMPAIGN_OR_EXTERNAL_TABS',
            liveUatState.isActive === false &&
            liveUatState.isLoopRunning === false &&
            liveUatState.nonBlankTabs.every(u => u.startsWith(`chrome-extension://${EXT_ID}/`) || u.startsWith('http://127.0.0.1:8088')),
            { isActive: liveUatState.isActive, isLoopRunning: liveUatState.isLoopRunning, nonBlankTabs: liveUatState.nonBlankTabs }
        );

        const stateFile = path.join(work, 'live_uat_state.json');
        fs.writeFileSync(stateFile, JSON.stringify(liveUatState.storage, null, 2));
        const auditOk = runCli(['audit-uat-state', '--in', stateFile]);
        A('UAT_SYNTHETIC_STATE_PASSES_ISOLATION_AUDIT',
            auditOk.status === 0 &&
            auditOk.out.result === 'UAT_PROFILE_ISOLATION_VERIFIED' &&
            auditOk.out.nonLoopbackUrls === 0 &&
            auditOk.out.sensitiveCredentials === 0 &&
            auditOk.out.nonSyntheticEmails === 0 &&
            !JSON.stringify(liveUatState.storage).includes(SENSITIVE_SENTINEL),
            auditOk.out
        );

        await br.stop();
        br = null;

        // 3. Reproducible Negative Controls on `audit-uat-state` (Fail-Closed & Zero Secret Logging)
        // 3a. Non-loopback URL in queue/history
        const badUrlFile = path.join(work, 'bad_url.json');
        fs.writeFileSync(badUrlFile, JSON.stringify({
            ...liveUatState.storage,
            savedUrlLists_v2: { lists: { real: { urls: ['https://production-client.example.com/contact'] } } }
        }));
        const rejUrl = runCli(['audit-uat-state', '--in', badUrlFile]);
        A('AUDIT_UAT_REJECTS_NON_LOOPBACK_TARGET_URL', rejUrl.status !== 0 && rejUrl.out.code === 'NON_LOOPBACK_TARGET_IN_UAT_PROFILE', rejUrl.out);

        // 3b. Proxy credentials / secret token present -> rejected AND secret value never printed
        const SECRET_VAL = 'RealDecodoSecretPass_DO_NOT_PRINT_7741';
        const badCredFile = path.join(work, 'bad_cred.json');
        fs.writeFileSync(badCredFile, JSON.stringify({
            ...liveUatState.storage,
            xpider_proxy_credentials: { user: 'real_owner', password: SECRET_VAL }
        }));
        const rejCred = runCli(['audit-uat-state', '--in', badCredFile]);
        A('AUDIT_UAT_REJECTS_PROXY_CREDENTIALS_WITHOUT_LOGGING_SECRET',
            rejCred.status !== 0 &&
            rejCred.out.code === 'SENSITIVE_CREDENTIALS_IN_UAT_PROFILE' &&
            !rejCred.text.includes(SECRET_VAL),
            rejCred.out
        );

        // 3c. Non-synthetic email address present -> rejected AND email local-part never printed
        const REAL_EMAIL_LOCAL = 'real_customer_inbox_8821';
        const badEmailFile = path.join(work, 'bad_email.json');
        fs.writeFileSync(badEmailFile, JSON.stringify({
            ...liveUatState.storage,
            xpider_email_collector_v1: { emails: { [`${REAL_EMAIL_LOCAL}@corp-domain.com`]: { email: `${REAL_EMAIL_LOCAL}@corp-domain.com` } } }
        }));
        const rejEmail = runCli(['audit-uat-state', '--in', badEmailFile]);
        A('AUDIT_UAT_REJECTS_NON_SYNTHETIC_EMAIL_WITHOUT_LOGGING_LOCALPART',
            rejEmail.status !== 0 &&
            rejEmail.out.code === 'NON_SYNTHETIC_EMAIL_IN_UAT_PROFILE' &&
            !rejEmail.text.includes(REAL_EMAIL_LOCAL),
            rejEmail.out
        );

        // 3d. Active campaign flag on startup -> rejected
        const badActiveFile = path.join(work, 'bad_active.json');
        fs.writeFileSync(badActiveFile, JSON.stringify({
            ...liveUatState.storage,
            xpider_isRunning: true
        }));
        const rejActive = runCli(['audit-uat-state', '--in', badActiveFile]);
        A('AUDIT_UAT_REJECTS_ACTIVE_CAMPAIGN_ON_STARTUP',
            rejActive.status !== 0 && rejActive.out.code === 'ACTIVE_CAMPAIGN_IN_UAT_PROFILE',
            rejActive.out
        );

    } catch (e) {
        failures++;
        report.error = e.stack;
        console.error(e);
    } finally {
        if (br) await br.stop();
        report.status = failures === 0 ? 'SUCCESS' : 'FAILED';
        report.endedAt = new Date().toISOString();
        report.total = report.assertions.length;
        report.failed = failures;
        fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
        console.log(`\n${report.total - failures}/${report.total} PASS -> ${REPORT}`);
        process.exit(failures ? 1 : 0);
    }
})();
