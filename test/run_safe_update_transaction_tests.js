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
const ZIP = path.join(ROOT, 'dist', 'XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip');
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
        A('ARCHIVE_SHA_IS_EXPECTED', ZIP_SHA === '02624da91d7bc9bb4933c76245c4320433b3df4fc4d046d07ead3b6e43dfcd26', { ZIP_SHA });
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

        // ================= Directive #6699964616 regression tests =================
        const tokNew = () => run(['plan', ...common(newOwner('tmp_plan'))]).out.PLAN_TOKEN; // token depends on target content; recompute per target below
        function applyTo(o, bk, extraEnv) { const t = run(['plan', ...common(o)]).out.PLAN_TOKEN; return run(['apply', ...common(o), '--approve', t, '--backup-root', bk], extraEnv || {}); }
        // overlap: same / descendant / ancestor / case-alias / junction-alias
        {
            const o = newOwner('ov'); const b = tree(o); const t = run(['plan', ...common(o)]).out.PLAN_TOKEN;
            const tryBk = (label, bk) => { const rr = run(['apply', ...common(o), '--approve', t, '--backup-root', bk]); A(`BACKUP_ROOT_${label}_REFUSED_AND_TARGET_UNCHANGED`, rr.out.code === 'BACKUP_OVERLAPS_TARGET' && tree(o) === b, rr.out); };
            tryBk('SAME_AS_TARGET', o);
            tryBk('INSIDE_TARGET', path.join(o, 'bk_inside'));
            tryBk('ANCESTOR_OF_TARGET', path.dirname(o));
            tryBk('CASE_ALIAS_OF_TARGET', o.toUpperCase());
            const jn = path.join(work, 'jn_alias'); execFileSync('powershell', ['-NoProfile', '-Command', `New-Item -ItemType Junction -Path '${jn}' -Target '${o}' | Out-Null`]);
            tryBk('JUNCTION_ALIAS_INSIDE_TARGET', path.join(jn, 'bk_via_junction'));
            execFileSync('cmd', ['/c', 'rmdir', jn]);
        }
        // rollback against a different directory must fail closed
        {
            const oA = newOwner('rbA'), oB = newOwner('rbB'); fs.rmSync(path.join(oB, 'popup.css')); const bB = tree(oB);
            const bk = path.join(work, 'bk_rbA'); applyTo(oA, bk);
            const rr = run(['rollback', '--target', oB, '--backup-root', bk]);
            A('ROLLBACK_WITH_FOREIGN_TARGET_REFUSED_ALTERNATE_UNCHANGED', rr.out.code === 'ROLLBACK_TARGET_MISMATCH' && tree(oB) === bB, rr.out);
            const rr2 = run(['recover', '--target', oB, '--backup-root', bk]);
            A('RECOVER_WITH_FOREIGN_TARGET_REFUSED', ['ROLLBACK_TARGET_MISMATCH', 'NOTHING_TO_RECOVER'].includes(rr2.out.code) && tree(oB) === bB, rr2.out);
        }
        // tampered backup refused
        {
            const o = newOwner('tb'); const bk = path.join(work, 'bk_tb'); applyTo(o, bk); const after = tree(o);
            fs.appendFileSync(path.join(bk, 'backup', 'background.js'), '\n// tampered backup');
            const rr = run(['rollback', '--target', o, '--backup-root', bk]);
            A('TAMPERED_BACKUP_ROLLBACK_REFUSED_TARGET_UNCHANGED', rr.out.code === 'BACKUP_INTEGRITY_FAILED' && tree(o) === after, rr.out);
        }
        // tampered journal path traversal refused
        {
            const o = newOwner('tj'); const bk = path.join(work, 'bk_tj'); applyTo(o, bk); const after = tree(o);
            const out = path.join(work, 'outside_victim.txt'); fs.writeFileSync(out, 'victim');
            const jp = path.join(bk, 'journal.json'); const j = JSON.parse(fs.readFileSync(jp, 'utf8')); j.plan.add = ['../outside_victim.txt']; fs.writeFileSync(jp, JSON.stringify(j));
            const rr = run(['rollback', '--target', o, '--backup-root', bk]);
            A('TAMPERED_JOURNAL_PATH_TRAVERSAL_REFUSED_OUTSIDE_FILE_SURVIVES', rr.out.code === 'UNSAFE_JOURNAL_PATH' && fs.existsSync(out) && tree(o) === after, rr.out);
        }
        // stale-file policy: candidate-added file removed, owner-created file preserved and reported
        {
            const o = newOwner('stale'); fs.rmSync(path.join(o, 'popup.css')); const orig = tree(o); const bk = path.join(work, 'bk_stale');
            applyTo(o, bk); fs.writeFileSync(path.join(o, 'CREATED_AFTER_UPDATE.txt'), 'owner');
            const rr = run(['rollback', '--target', o, '--backup-root', bk]);
            const j = JSON.parse(fs.readFileSync(path.join(bk, 'journal.json'), 'utf8'));
            A('ROLLBACK_REMOVES_CANDIDATE_ADDED_STALE_FILE', rr.status === 0 && !fs.existsSync(path.join(o, 'popup.css')), rr.out);
            A('ROLLBACK_PRESERVES_AND_REPORTS_UNKNOWN_OWNER_FILE', fs.existsSync(path.join(o, 'CREATED_AFTER_UPDATE.txt')) && j.preservedUnknown.includes('CREATED_AFTER_UPDATE.txt'), { preserved: j.preservedUnknown });
            fs.rmSync(path.join(o, 'CREATED_AFTER_UPDATE.txt'));
            A('ROLLBACK_TREE_EXACTLY_ORIGINAL_ONCE_UNKNOWN_FILE_REMOVED', tree(o) === orig);
        }
        // lock: unfinished update blocks a second apply until recover
        {
            const o = newOwner('lock'); const orig = tree(o); const bk = path.join(work, 'bk_lock');
            const c1 = applyTo(o, bk, { XPIDER_UPDATE_FAULT: 'commit-crash' });
            const t2 = run(['plan', ...common(o)]); // plan itself is read-only; token for apply
            const c2 = run(['apply', ...common(o), '--approve', t2.out.PLAN_TOKEN, '--backup-root', path.join(work, 'bk_lock2')]);
            A('UNFINISHED_UPDATE_BLOCKS_SECOND_APPLY (no reload/re-apply while COMMITTING)', c1.status === 88 && c2.out.code === 'UPDATE_IN_PROGRESS', c2.out);
            const rc = run(['recover', '--target', o, '--backup-root', bk]);
            const c3 = applyTo(o, path.join(work, 'bk_lock3'));
            A('RECOVER_CLEARS_LOCK_AND_SUBSEQUENT_APPLY_WORKS', rc.status === 0 && c3.status === 0, { rc: rc.out, c3: c3.out });
        }
        // power loss during rename (.xpider-new left behind) -> recover cleans temp & restores exact tree
        {
            const o = newOwner('powerloss'); const orig = tree(o); const bk = path.join(work, 'bk_pl');
            const c1 = applyTo(o, bk, { XPIDER_UPDATE_FAULT: 'powerloss-before-rename' });
            const hasTempBefore = fs.readdirSync(o, { recursive: true }).some(f => String(f).endsWith('.xpider-new'));
            const rc = run(['recover', '--target', o, '--backup-root', bk]);
            const hasTempAfter = fs.readdirSync(o, { recursive: true }).some(f => String(f).endsWith('.xpider-new'));
            A('POWERLOSS_DURING_RENAME_TEMP_CLEANED_AND_RESTORED_BY_RECOVER', c1.status === 89 && hasTempBefore && rc.status === 0 && !hasTempAfter && tree(o) === orig, { c1: c1.status, hasTempBefore, hasTempAfter });
        }
        // antivirus / scanner EBUSY lock during commit -> auto-rollback restores exact tree
        {
            const o = newOwner('ebusy'); const orig = tree(o); const bk = path.join(work, 'bk_eb');
            const c1 = applyTo(o, bk, { XPIDER_UPDATE_FAULT: 'ebusy-lock' });
            A('AV_SCANNER_EBUSY_LOCK_AUTO_ROLLBACK_RESTORES_ORIGINAL', c1.status === 3 && c1.out.code === 'EBUSY' && c1.out.rolledBack === true && tree(o) === orig, c1.out);
        }
        // non-empty modified legacy baseline file is preserved (never deleted if user modified it)
        {
            const o = newOwner('mod_legacy');
            fs.writeFileSync(path.join(o, 'retired_legacy.js'), '// user customized this legacy file with 4KB payload\n' + 'x'.repeat(4096));
            const p = run(['plan', ...common(o)]);
            const c1 = run(['apply', ...common(o), '--approve', p.out.PLAN_TOKEN, '--backup-root', path.join(work, 'bk_ml')]);
            A('MODIFIED_NONEMPTY_LEGACY_FILE_PRESERVED_AS_USER_FILE', c1.status === 0 && p.out.plan.keepUnknown.includes('retired_legacy.js') && !p.out.plan.remove.includes('retired_legacy.js') && fs.existsSync(path.join(o, 'retired_legacy.js')), { keepUnknown: p.out.plan.keepUnknown, remove: p.out.plan.remove });
        }
        // ================= Directive #6703093387 Item 2: Encrypted Storage Backup/Restore Negative Tests =================
        {
            const EXT = 'ldlijlaccfeelfdhgnjbibniocefckjj';
            const PASS = 'Test-Only-Synthetic-Passphrase-99!';
            const pSrc = path.join(work, 'prof_src');
            const lesSrc = path.join(pSrc, 'Default', 'Local Extension Settings', EXT);
            fs.mkdirSync(lesSrc, { recursive: true });
            fs.writeFileSync(path.join(lesSrc, '000003.ldb'), 'SYNTHETIC_LDB_V1');
            fs.writeFileSync(path.join(lesSrc, 'CURRENT'), 'MANIFEST-000001\n');
            const encOut = path.join(work, 'valid_storage.xpider-enc');

            // 1. Valid backup creation for test baseline
            const bkOk = run(['backup-storage', '--profile-dir', pSrc, '--out', encOut, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_BACKUP_VALID_BASELINE_CREATED', bkOk.status === 0 && bkOk.out.result === 'BACKUP_ENCRYPTED', bkOk.out);

            // 2. Backup --out overlapping lesDir refused
            const ovOut = run(['backup-storage', '--profile-dir', pSrc, '--out', path.join(lesSrc, 'inside.xpider-enc'), '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_BACKUP_OUT_OVERLAPPING_LES_DIR_REFUSED', ovOut.status !== 0 && ovOut.out.code === 'BACKUP_OVERLAPS_TARGET' && !fs.existsSync(path.join(lesSrc, 'inside.xpider-enc')), ovOut.out);

            // 3. Symlink/junction on Local Extension Settings/<id> refused on backup & restore
            const pJn = path.join(work, 'prof_jn');
            fs.mkdirSync(path.join(pJn, 'Default', 'Local Extension Settings'), { recursive: true });
            const jnLes = path.join(pJn, 'Default', 'Local Extension Settings', EXT);
            execFileSync('powershell', ['-NoProfile', '-Command', `New-Item -ItemType Junction -Path '${jnLes}' -Target '${lesSrc}' | Out-Null`]);
            const bkJn = run(['backup-storage', '--profile-dir', pJn, '--out', path.join(work, 'jn.xpider-enc'), '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            const rsJn = run(['restore-storage', '--profile-dir', pJn, '--in', encOut, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            execFileSync('cmd', ['/c', 'rmdir', jnLes]);
            A('STORAGE_BACKUP_AND_RESTORE_REFUSED_ON_JUNCTION_LES_DIR', bkJn.out.code === 'SYMLINK_FOUND' && rsJn.out.code === 'SYMLINK_FOUND', { bk: bkJn.out.code, rs: rsJn.out.code });

            // Helper to craft signed/authenticated AES-256-GCM envelope with custom plain payload
            function craftEnc(filePath, plainObj, envOverrides = {}) {
                const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
                const key = crypto.scryptSync(PASS, salt, 32, { N: 16384, r: 8, p: 1 });
                const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
                const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(plainObj), 'utf8')), cipher.final()]);
                const tag = cipher.getAuthTag();
                const manifestSha256 = crypto.createHash('sha256').update(Buffer.from(JSON.stringify(plainObj.manifest || []))).digest('hex');
                const env = { format: 'XPIDER_ENCRYPTED_STORAGE_BACKUP_V1', kdf: 'scrypt-16384-8-1', cipher: 'aes-256-gcm', extId: EXT, fileCount: (plainObj.manifest || []).length, manifestSha256, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), ciphertext: ct.toString('base64'), ...envOverrides };
                fs.writeFileSync(filePath, JSON.stringify(env));
            }

            // 4. Path traversal in decrypted manifest/files refused before touching target profile
            const pDst = path.join(work, 'prof_dst');
            const lesDst = path.join(pDst, 'Default', 'Local Extension Settings', EXT);
            fs.mkdirSync(lesDst, { recursive: true });
            fs.writeFileSync(path.join(lesDst, '000003.ldb'), 'EXISTING_PROTECTED_DEST');
            const dstBefore = tree(lesDst);
            const evilFile = path.join(work, 'evil_escaped.txt');
            const encTrav = path.join(work, 'trav.xpider-enc');
            const evilBuf = Buffer.from('EVIL');
            craftEnc(encTrav, {
                version: 1, extId: EXT,
                manifest: [{ path: '../evil_escaped.txt', size: evilBuf.length, sha256: crypto.createHash('sha256').update(evilBuf).digest('hex') }],
                files: { '../evil_escaped.txt': evilBuf.toString('base64') }
            });
            const rsTrav = run(['restore-storage', '--profile-dir', pDst, '--in', encTrav, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_RESTORE_PATH_TRAVERSAL_IN_DECRYPTED_MANIFEST_REFUSED', rsTrav.out.code === 'UNSAFE_JOURNAL_PATH' && !fs.existsSync(evilFile) && tree(lesDst) === dstBefore, rsTrav.out);

            // 5. Unmanifested extra key in decrypted files map refused
            const encExtra = path.join(work, 'extra_key.xpider-enc');
            craftEnc(encExtra, {
                version: 1, extId: EXT,
                manifest: [{ path: '000003.ldb', size: 4, sha256: crypto.createHash('sha256').update(Buffer.from('GOOD')).digest('hex') }],
                files: { '000003.ldb': Buffer.from('GOOD').toString('base64'), 'unlisted.ldb': Buffer.from('HIDDEN').toString('base64') }
            });
            const rsExtra = run(['restore-storage', '--profile-dir', pDst, '--in', encExtra, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_RESTORE_EXTRA_UNMANIFESTED_FILE_KEY_REFUSED', rsExtra.out.code === 'MANIFEST_FILES_MISMATCH' && tree(lesDst) === dstBefore, rsExtra.out);

            // 6. Duplicate case-colliding paths in manifest refused
            const encDup = path.join(work, 'dup_case.xpider-enc');
            const b1 = Buffer.from('AAAA');
            const h1 = crypto.createHash('sha256').update(b1).digest('hex');
            craftEnc(encDup, {
                version: 1, extId: EXT,
                manifest: [{ path: '000003.ldb', size: 4, sha256: h1 }, { path: '000003.LDB', size: 4, sha256: h1 }],
                files: { '000003.ldb': b1.toString('base64'), '000003.LDB': b1.toString('base64') }
            });
            const rsDup = run(['restore-storage', '--profile-dir', pDst, '--in', encDup, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_RESTORE_DUPLICATE_CASE_COLLIDING_PATH_REFUSED', rsDup.out.code === 'DUPLICATE_MANIFEST_PATH' && tree(lesDst) === dstBefore, rsDup.out);

            // 7. Invalid --ext-id traversal or mismatched inner plain.extId refused
            const rsBadId = run(['restore-storage', '--profile-dir', pDst, '--in', encOut, '--ext-id', '../../evil', '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            const encWrongInnerId = path.join(work, 'wrong_inner_id.xpider-enc');
            craftEnc(encWrongInnerId, {
                version: 1, extId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                manifest: [{ path: '000003.ldb', size: 4, sha256: h1 }],
                files: { '000003.ldb': b1.toString('base64') }
            });
            const rsInnerId = run(['restore-storage', '--profile-dir', pDst, '--in', encWrongInnerId, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_RESTORE_INVALID_OR_MISMATCHED_EXT_ID_REFUSED', rsBadId.out.code === 'INVALID_EXT_ID' && rsInnerId.out.code === 'BACKUP_ID_MISMATCH' && tree(lesDst) === dstBefore, { badId: rsBadId.out.code, innerId: rsInnerId.out.code });

            // 8. Restore interrupted between folder rename steps (lesDir -> .pre-restore-bak) preserves pre-restore data on failed retry and completes on valid retry
            const intRun = run(['restore-storage', '--profile-dir', pDst, '--in', encOut, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS, XPIDER_UPDATE_FAULT: 'restore-after-bak-rename' });
            const bakExistsAfterCrash = fs.existsSync(lesDst + '.pre-restore-bak') && !fs.existsSync(lesDst);
            // Retry with WRONG passphrase first: must auto-recover .pre-restore-bak back to lesDst and abort without losing original data!
            const wrongRetry = run(['restore-storage', '--profile-dir', pDst, '--in', encOut, '--passphrase-env', 'XP_PASS'], { XP_PASS: 'Wrong-Passphrase-0000' });
            const origRestoredOnWrongRetry = fs.existsSync(lesDst) && tree(lesDst) === dstBefore;
            // Now interrupt again and retry with CORRECT passphrase
            run(['restore-storage', '--profile-dir', pDst, '--in', encOut, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS, XPIDER_UPDATE_FAULT: 'restore-after-bak-rename' });
            const okRetry = run(['restore-storage', '--profile-dir', pDst, '--in', encOut, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
            A('STORAGE_RESTORE_INTERRUPTED_BETWEEN_RENAME_STEPS_PRESERVES_PRE_RESTORE_ON_FAILURE', intRun.status === 91 && bakExistsAfterCrash && wrongRetry.out.code === 'WRONG_PASSPHRASE_OR_CORRUPT_BACKUP' && origRestoredOnWrongRetry, { intStatus: intRun.status, bakExistsAfterCrash, wrongCode: wrongRetry.out.code, origRestoredOnWrongRetry });
            A('STORAGE_RESTORE_INTERRUPTED_BETWEEN_RENAME_STEPS_COMPLETES_ON_RETRY', okRetry.status === 0 && okRetry.out.recoveredInterruptedPrior === true && tree(lesDst) === tree(lesSrc) && !fs.existsSync(lesDst + '.pre-restore-bak'), okRetry.out);
        }
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

