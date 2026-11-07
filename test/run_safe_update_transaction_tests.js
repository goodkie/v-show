/**
 * XPIDER safe-update transaction test suite (Directive #6699808184 Items 1 & 3, filesystem layer).
 * Operates ONLY on disposable temp copies. Never touches any real owner installation. No browser, no campaign.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const UPDATER = path.join(ROOT, 'scripts', 'xpider_safe_update.js');
const ZIP = path.join(ROOT, 'dist', 'XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip');
const INVENTORY = path.join(ROOT, 'dist', 'PACKAGE_INVENTORY_SHA256.json');
const BASE_DIR = path.join(ROOT, 'dist', 'rc11_extension_baseline', 'extension');
const CAND_DIR = path.join(ROOT, 'dist', 'clean_room_unpacked_v7');
const REPORT = path.join(ROOT, 'dist', 'report_safe_update_transaction.json');
const { buildManifest } = require(UPDATER);

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ZIP_SHA = sha(ZIP);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-txn-'));
const baseManifestPath = path.join(work, 'baseline_manifest.json');
const report = { suite: 'XPIDER_SAFE_UPDATE_TRANSACTION', archiveSha256: ZIP_SHA, startedAt: new Date().toISOString(), assertions: [], status: 'RUNNING' };
let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}
function cp(src, dst) { fs.cpSync(src, dst, { recursive: true }); }
function tree(dir) { return JSON.stringify(buildManifest(dir)); }
function run(args, env = {}) {
    const r = spawnSync('node', [UPDATER, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    let out = null; const txt = (r.status === 0 ? r.stdout : r.stderr).trim();
    try { out = JSON.parse(txt.split('\n').filter(l => l.startsWith('{') || l.startsWith(' ') || l.startsWith('}')).join('\n') || txt); } catch (_) { try { out = JSON.parse(txt); } catch (__) { out = { raw: txt }; } }
    return { status: r.status, out, stdout: r.stdout, stderr: r.stderr };
}
function newOwner(name) {
    const d = path.join(work, name);
    cp(BASE_DIR, d);
    fs.writeFileSync(path.join(d, 'USER_NOTES.txt'), 'owner private file - must survive update');
    fs.writeFileSync(path.join(d, 'retired_legacy.js'), '// retired baseline-only file');
    return d;
}
function common(target, zip = ZIP, sha256 = ZIP_SHA, inv = INVENTORY, extra = []) {
    return ['--target', target, '--archive', zip, '--expected-sha', sha256, '--inventory', inv, '--baseline', baseManifestPath, ...extra];
}
function zipDir(srcDir, outZip) {
    if (fs.existsSync(outZip)) fs.unlinkSync(outZip);
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${outZip}' -Force`]);
}
// minimal ZIP writer (stored) so we can craft hostile entry names
function crc32(buf) { let c, crc = ~0; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function craftZip(out, entries) {
    const parts = [], central = []; let off = 0;
    for (const [name, data] of entries) {
        const nb = Buffer.from(name), crc = crc32(data);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
        parts.push(lh, nb, data);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
        central.push(ch, nb); off += 30 + nb.length + data.length;
    }
    const cd = Buffer.concat(central), eo = Buffer.alloc(22);
    eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
    fs.writeFileSync(out, Buffer.concat([...parts, cd, eo]));
}

(function main() {
    try {
        A('ARCHIVE_SHA_IS_EXPECTED', ZIP_SHA === 'b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e', { ZIP_SHA });
        run(['manifest', BASE_DIR, baseManifestPath]);
        // add synthetic retired file to baseline manifest copy
        const bm = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8'));
        bm.push({ path: 'retired_legacy.js', size: Buffer.byteLength('// retired baseline-only file'), sha256: crypto.createHash('sha256').update('// retired baseline-only file').digest('hex') });
        fs.writeFileSync(baseManifestPath, JSON.stringify(bm));

        // ---- T1 dry run ----
        const o1 = newOwner('owner1'); const before1 = tree(o1);
        const plan = run(['plan', ...common(o1)]);
        A('DRYRUN_EXIT0_AND_TARGET_UNCHANGED', plan.status === 0 && tree(o1) === before1, { status: plan.status });
        A('DRYRUN_PLAN_CLASSIFIES_FILES', plan.out.plan && plan.out.plan.keepUnknown.includes('USER_NOTES.txt') && plan.out.plan.remove.includes('retired_legacy.js') && plan.out.plan.replace.length > 0, { replace: plan.out.plan && plan.out.plan.replace.length, remove: plan.out.plan && plan.out.plan.remove, keep: plan.out.plan && plan.out.plan.keepUnknown });
        A('DRYRUN_VERIFIED_50_FILE_INVENTORY', plan.out.steps && plan.out.steps.some(s => /50-file inventory exact match/.test(s)), { steps: plan.out.steps });
        const token = plan.out.PLAN_TOKEN;

        // ---- approval gates ----
        let r = run(['apply', ...common(o1)]);
        A('APPLY_WITHOUT_APPROVAL_REFUSED', r.status === 3 && r.out.code === 'APPROVAL_REQUIRED' && tree(o1) === before1, r.out);
        r = run(['apply', ...common(o1), '--approve', 'deadbeefdeadbeef', '--backup-root', path.join(work, 'bk_x')]);
        A('APPLY_WRONG_TOKEN_REFUSED', r.out.code === 'APPROVAL_TOKEN_MISMATCH' && tree(o1) === before1, r.out);
        r = run(['apply', ...common(o1), '--approve', token, '--skip-backup']);
        A('SKIP_BACKUP_REFUSED', r.out.code === 'SKIP_BACKUP_REFUSED' && tree(o1) === before1, r.out);

        // ---- T5 apply, T6 rollback ----
        const bk1 = path.join(work, 'bk1');
        r = run(['apply', ...common(o1), '--approve', token, '--backup-root', bk1]);
        A('APPLY_COMMITTED', r.status === 0 && r.out.result === 'COMMITTED', r.out);
        const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
        const bad = inv.filter(e => !fs.existsSync(path.join(o1, e.path)) || sha(path.join(o1, e.path)) !== e.sha256);
        A('POST_APPLY_ALL_50_FILES_MATCH_INVENTORY', bad.length === 0, { bad: bad.map(b => b.path) });
        A('POST_APPLY_USER_FILE_PRESERVED', fs.readFileSync(path.join(o1, 'USER_NOTES.txt'), 'utf8').includes('must survive'));
        A('POST_APPLY_RETIRED_BASELINE_FILE_REMOVED_ONLY_WITH_BACKUP', !fs.existsSync(path.join(o1, 'retired_legacy.js')) && fs.existsSync(path.join(bk1, 'backup', 'retired_legacy.js')));
        A('POST_APPLY_NO_TEMP_LEFTOVERS', !fs.readdirSync(o1, { recursive: true }).some(f => String(f).endsWith('.xpider-new')));
        r = run(['rollback', '--target', o1, '--backup-root', bk1]);
        A('ROLLBACK_RESTORES_BYTE_IDENTICAL_ORIGINAL', r.status === 0 && tree(o1) === before1, r.out);

        // ---- interruption matrix ----
        function interrupted(name, faultEnv, expectStatus, expectCode, recover) {
            const o = newOwner(name); const before = tree(o); const bk = path.join(work, 'bk_' + name);
            const rr = run(['apply', ...common(o), '--approve', token, '--backup-root', bk], { XPIDER_UPDATE_FAULT: faultEnv });
            if (recover) {
                const partial = tree(o) !== before;
                const j = JSON.parse(fs.readFileSync(path.join(bk, 'journal.json'), 'utf8'));
                const rc = run(['recover', '--target', o, '--backup-root', bk]);
                const clean = !fs.readdirSync(o, { recursive: true }).some(f => String(f).endsWith('.xpider-new'));
                A(`${name}: crashed(exit ${rr.status}) journal=${j.state}, recover restores original`, rr.status === expectStatus && rc.status === 0 && tree(o) === before && clean, { crashStatus: rr.status, journalState: j.state, partialBeforeRecover: partial, recover: rc.out });
            } else {
                A(`${name}: ${expectCode} -> auto-rollback restores original`, rr.status === expectStatus && rr.out.code === expectCode && rr.out.rolledBack === true && tree(o) === before, rr.out);
            }
        }
        interrupted('disk_full_during_commit', 'commit-enospc', 3, 'ENOSPC', false);
        interrupted('staging_fault_after_backup', 'stage', 3, 'FAULT_STAGE', false);
        interrupted('post_verify_failure', 'verify', 3, 'POST_VERIFY_FAILED', false);
        interrupted('process_crash_mid_commit', 'commit-crash', 88, null, true);
        interrupted('crash_during_rollback_then_recover', 'commit-enospc,rollback-crash', 77, null, true);

        // ---- negative cases ----
        // access denied (read-only file blocks rename)
        {
            const o = newOwner('access_denied'); const before = tree(o);
            const f = path.join(o, 'background.js'); fs.chmodSync(f, 0o444); execFileSync('attrib', ['+R', f]);
            const rr = run(['apply', ...common(o), '--approve', token, '--backup-root', path.join(work, 'bk_ad')]);
            execFileSync('attrib', ['-R', f]);
            A('ACCESS_DENIED_READONLY_FILE -> auto-rollback restores original', rr.status === 3 && rr.out.rolledBack === true && tree(o) === before, rr.out);
        }
        // corrupted archive
        const corrupt = path.join(work, 'corrupt.zip'); const zb = fs.readFileSync(ZIP); fs.writeFileSync(corrupt, zb.subarray(0, Math.floor(zb.length / 2)));
        const o2 = newOwner('corrupt'); const b2 = tree(o2);
        r = run(['plan', ...common(o2, corrupt, ZIP_SHA)]);
        A('CORRUPTED_ARCHIVE_SHA_MISMATCH_ABORTS', r.out.code === 'ARCHIVE_SHA_MISMATCH' && tree(o2) === b2, r.out);
        r = run(['plan', ...common(o2, corrupt, sha(corrupt))]);
        A('CORRUPTED_ARCHIVE_EVEN_WITH_MATCHING_SHA_ABORTS', ['ARCHIVE_UNREADABLE', 'EXTRACT_FAILED'].includes(r.out.code) && tree(o2) === b2, r.out);
        // wrong ID in target
        const o3 = newOwner('wrongid_target'); const mp = path.join(o3, 'manifest.json'); const m3 = JSON.parse(fs.readFileSync(mp, 'utf8')); m3.key = Buffer.from('not the xpider key at all').toString('base64'); fs.writeFileSync(mp, JSON.stringify(m3)); const b3 = tree(o3);
        r = run(['plan', ...common(o3)]);
        A('WRONG_ID_TARGET_ABORTS', r.out.code === 'TARGET_WRONG_ID' && tree(o3) === b3, r.out);
        // missing manifest in target
        const o4 = newOwner('nomanifest_target'); fs.unlinkSync(path.join(o4, 'manifest.json')); const b4 = tree(o4);
        r = run(['plan', ...common(o4)]);
        A('MISSING_MANIFEST_TARGET_ABORTS', r.out.code === 'MANIFEST_MISSING' && tree(o4) === b4, r.out);
        // candidate variants
        const varDir = path.join(work, 'var'); cp(CAND_DIR, varDir);
        const vm = JSON.parse(fs.readFileSync(path.join(varDir, 'manifest.json'), 'utf8')); vm.key = Buffer.from('another wrong key').toString('base64'); fs.writeFileSync(path.join(varDir, 'manifest.json'), JSON.stringify(vm));
        const wrongIdZip = path.join(work, 'wrongid_candidate.zip'); zipDir(varDir, wrongIdZip);
        const o5 = newOwner('wrongid_candidate'); const b5 = tree(o5);
        r = run(['plan', ...common(o5, wrongIdZip, sha(wrongIdZip))]);
        A('WRONG_ID_CANDIDATE_ABORTS', r.out.code === 'CANDIDATE_WRONG_ID' && tree(o5) === b5, r.out);
        fs.unlinkSync(path.join(varDir, 'manifest.json'));
        const noManZip = path.join(work, 'nomanifest_candidate.zip'); zipDir(varDir, noManZip);
        r = run(['plan', ...common(o5, noManZip, sha(noManZip))]);
        A('MISSING_MANIFEST_CANDIDATE_ABORTS', r.out.code === 'MANIFEST_MISSING' && tree(o5) === b5, r.out);
        // extra file smuggled into candidate (inventory mismatch)
        const varDir2 = path.join(work, 'var2'); cp(CAND_DIR, varDir2); fs.writeFileSync(path.join(varDir2, 'evil.exe'), 'MZ');
        const extraZip = path.join(work, 'extra_candidate.zip'); zipDir(varDir2, extraZip);
        r = run(['plan', ...common(o5, extraZip, sha(extraZip))]);
        A('EXTRA_UNLISTED_FILE_IN_CANDIDATE_ABORTS', r.out.code === 'INVENTORY_MISMATCH' && tree(o5) === b5, r.out);
        // tampered file content with correct file set
        const varDir3 = path.join(work, 'var3'); cp(CAND_DIR, varDir3); fs.appendFileSync(path.join(varDir3, 'background.js'), '\n// tampered');
        const tamZip = path.join(work, 'tampered_candidate.zip'); zipDir(varDir3, tamZip);
        r = run(['plan', ...common(o5, tamZip, sha(tamZip))]);
        A('TAMPERED_CANDIDATE_CONTENT_ABORTS', r.out.code === 'INVENTORY_MISMATCH' && tree(o5) === b5, r.out);
        // zip slip
        const slip = path.join(work, 'slip.zip'); craftZip(slip, [['manifest.json', Buffer.from('{}')], ['../evil.txt', Buffer.from('x')]]);
        r = run(['plan', ...common(o5, slip, sha(slip))]);
        A('ZIP_SLIP_ENTRY_ABORTS_BEFORE_EXTRACT', r.out.code === 'ZIP_SLIP' && !fs.existsSync(path.join(os.tmpdir(), 'evil.txt')) && tree(o5) === b5, r.out);
        // junction in target
        {
            const o = newOwner('junction'); const jt = path.join(work, 'junction_dest'); fs.mkdirSync(jt, { recursive: true });
            execFileSync('powershell', ['-NoProfile', '-Command', `New-Item -ItemType Junction -Path '${path.join(o, 'linkdir')}' -Target '${jt}' | Out-Null`]);
            r = run(['plan', ...common(o)]);
            A('JUNCTION_IN_TARGET_ABORTS', r.out.code === 'SYMLINK_FOUND', r.out);
        }
        // target path missing
        r = run(['plan', ...common(path.join(work, 'does_not_exist'))]);
        A('MISSING_TARGET_ABORTS', r.out.code === 'TARGET_MISSING', r.out);
        // plan token invalidated if target changes after dry-run
        const o6 = newOwner('drift'); const t6 = run(['plan', ...common(o6)]).out.PLAN_TOKEN; fs.appendFileSync(path.join(o6, 'popup.js'), '\n// owner edit after preview'); const b6 = tree(o6);
        r = run(['apply', ...common(o6), '--approve', t6, '--backup-root', path.join(work, 'bk_drift')]);
        A('TARGET_DRIFT_AFTER_PREVIEW_INVALIDATES_APPROVAL', r.out.code === 'APPROVAL_TOKEN_MISMATCH' && tree(o6) === b6, r.out);
    } catch (e) {
        failures++; report.error = e.stack; console.error(e);
    } finally {
        report.status = failures === 0 ? 'SUCCESS' : 'FAILED';
        report.endedAt = new Date().toISOString();
        report.total = report.assertions.length; report.failed = failures;
        fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
        console.log(`\n${report.total - failures}/${report.total} PASS -> ${REPORT}`);
        process.exit(failures ? 1 : 0);
    }
})();
