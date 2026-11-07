#!/usr/bin/env node
/**
 * XPIDER transactional, non-destructive unpacked-extension updater (Windows 10 / Node >= 18).
 *
 * Subcommands
 *   manifest <dir> <out.json>            Write a path/size/sha256 manifest for a directory.
 *   plan     --target D --archive Z --expected-sha H --inventory I.json [--baseline B.json] [--expected-id ID]
 *            DRY RUN. Never modifies target. Prints plan + PLAN_TOKEN required for apply.
 *   apply    (same flags) --approve TOKEN [--backup-root R]
 *            Backup -> stage -> commit with journal -> verify -> auto-rollback on any error.
 *   rollback --target D --backup-root R  Restore the pre-update state from a completed/interrupted run.
 *   recover  --target D --backup-root R  Finish rollback after a crash (journal not COMMITTED).
 *
 * Safety rules
 *   - Archive SHA-256, ZIP entry names (no .. / absolute / drive), manifest, and the full inventory
 *     (exact file set, sizes, hashes) are verified in a staging dir BEFORE target is touched.
 *   - Extension ID is computed from manifest.key and must equal --expected-id on BOTH target and candidate.
 *   - Backup copy of the target tree is hash-verified before any write. --skip-backup is refused.
 *   - Only candidate inventory files are written (temp file + rename). Files are removed ONLY if they are in
 *     the baseline manifest AND absent from the candidate inventory AND byte-identical to baseline.
 *     Unknown/user files are never touched.
 *   - Symlinks/junctions anywhere in target abort the run.
 *   - This tool only touches the filesystem. It never launches a browser or a campaign.
 *
 * Test-only fault injection: env XPIDER_UPDATE_FAULT in
 *   stage | commit-enospc | commit-crash | rollback-crash | verify
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEFAULT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const FAULT_SET = new Set((process.env.XPIDER_UPDATE_FAULT || '').split(',').filter(Boolean));
const fault = n => FAULT_SET.has(n);

function die(code, msg) { const e = new Error(msg); e.code = code; throw e; }
function sha256File(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function sha256Buf(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function norm(p) { return p.split(path.sep).join('/'); }

function walk(root) {
    const out = [];
    (function rec(d) {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, ent.name);
            const st = fs.lstatSync(full);
            if (st.isSymbolicLink()) die('SYMLINK_FOUND', `Symlink/junction refused: ${full}`);
            if (ent.isDirectory()) rec(full);
            else if (ent.isFile()) out.push(norm(path.relative(root, full)));
        }
    })(root);
    return out.sort();
}

function buildManifest(dir) {
    return walk(dir).map(rel => {
        const full = path.join(dir, rel);
        return { path: rel, size: fs.statSync(full).size, sha256: sha256File(full) };
    });
}

function extensionIdFromKey(b64) {
    const der = Buffer.from(b64, 'base64');
    const h = crypto.createHash('sha256').update(der).digest().subarray(0, 16);
    return [...h].map(b => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('');
}

function readManifestId(dir) {
    const mp = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mp)) die('MANIFEST_MISSING', `manifest.json missing in ${dir}`);
    let m;
    try { m = JSON.parse(fs.readFileSync(mp, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { die('MANIFEST_INVALID', `manifest.json unparsable in ${dir}`); }
    if (!m.key) die('MANIFEST_KEY_MISSING', `manifest.key missing in ${dir} (ID would not be deterministic)`);
    return { id: extensionIdFromKey(m.key), version: m.version, name: m.name };
}

function psQuote(s) { return `'${String(s).replace(/'/g, "''")}'`; }

function listZipEntries(zip) {
    const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[System.IO.Compression.ZipFile]::OpenRead(${psQuote(zip)}); try { $z.Entries | ForEach-Object { $_.FullName } } finally { $z.Dispose() }`;
    let out;
    try {
        out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { die('ARCHIVE_UNREADABLE', `Archive cannot be opened as ZIP: ${zip}`); }
    return out.split(/\r?\n/).filter(Boolean);
}

function verifyEntryNames(entries) {
    for (const n of entries) {
        const s = n.replace(/\\/g, '/');
        if (s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.split('/').includes('..')) die('ZIP_SLIP', `Unsafe ZIP entry name: ${n}`);
    }
}

function extractZip(zip, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    try {
        execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(outDir)} -Force`], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { die('EXTRACT_FAILED', `Extraction failed: ${zip}`); }
}

function parseArgs(argv) {
    const a = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (t.startsWith('--')) {
            const k = t.slice(2);
            const nxt = argv[i + 1];
            if (nxt === undefined || nxt.startsWith('--')) a[k] = true; else { a[k] = nxt; i++; }
        } else a._.push(t);
    }
    return a;
}

function cmpTree(dir, manifest) {
    // returns list of mismatches between dir and manifest (exact file set + hashes)
    const issues = [];
    const actual = new Map(buildManifest(dir).map(e => [e.path, e]));
    const want = new Map(manifest.map(e => [e.path, e]));
    for (const [p, e] of want) {
        const a = actual.get(p);
        if (!a) issues.push(`missing:${p}`);
        else if (a.sha256 !== e.sha256 || a.size !== e.size) issues.push(`differs:${p}`);
    }
    for (const p of actual.keys()) if (!want.has(p)) issues.push(`extra:${p}`);
    return issues;
}

function computePlan(ctx) {
    const { target, archive, expectedSha, inventory, baseline, expectedId } = ctx;
    const report = { steps: [], errors: [] };

    // 1. archive hash
    if (!fs.existsSync(archive)) die('ARCHIVE_MISSING', `Archive not found: ${archive}`);
    const actualSha = sha256File(archive);
    report.archiveSha256 = actualSha;
    if (actualSha !== expectedSha) die('ARCHIVE_SHA_MISMATCH', `Archive SHA-256 ${actualSha} != expected ${expectedSha}`);
    report.steps.push('archive SHA-256 matches expected');

    // 2. zip entry names
    const entries = listZipEntries(archive);
    verifyEntryNames(entries);
    report.steps.push(`ZIP entry names safe (${entries.length} entries)`);

    // 3. target preflight
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) die('TARGET_MISSING', `Target extension root not found: ${target}`);
    const t = readManifestId(target);
    if (t.id !== expectedId) die('TARGET_WRONG_ID', `Target extension ID ${t.id} != expected ${expectedId}`);
    walk(target); // throws on symlink
    report.targetVersion = t.version;
    report.steps.push(`target manifest ID ${t.id} v${t.version} verified, no symlinks`);

    // 4. stage + verify candidate
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-stage-'));
    extractZip(archive, stage);
    const c = readManifestId(stage);
    if (c.id !== expectedId) die('CANDIDATE_WRONG_ID', `Candidate extension ID ${c.id} != expected ${expectedId}`);
    const issues = cmpTree(stage, inventory);
    if (issues.length) die('INVENTORY_MISMATCH', `Candidate staging differs from inventory: ${issues.slice(0, 8).join(', ')}`);
    report.candidateVersion = c.version;
    report.steps.push(`candidate staged: ID ${c.id} v${c.version}, ${inventory.length}-file inventory exact match`);

    // 5. diff plan
    const tgt = new Map(buildManifest(target).map(e => [e.path, e]));
    const inv = new Map(inventory.map(e => [e.path, e]));
    const base = new Map((baseline || []).map(e => [e.path, e]));
    const add = [], replace = [], same = [], remove = [], keepUnknown = [];
    for (const [p, e] of inv) {
        const cur = tgt.get(p);
        if (!cur) add.push(p); else if (cur.sha256 === e.sha256) same.push(p); else replace.push(p);
    }
    for (const [p, cur] of tgt) {
        if (inv.has(p)) continue;
        const b = base.get(p);
        if (b && b.sha256 === cur.sha256) remove.push(p); else keepUnknown.push(p);
    }
    const plan = { add, replace, same: same.length, remove, keepUnknown, expectedId, archiveSha256: actualSha };
    const planToken = sha256Buf(Buffer.from(JSON.stringify({ add, replace, remove, keepUnknown, actualSha, targetHashes: [...tgt.values()].map(e => e.sha256) }))).slice(0, 16);
    return { report, stage, plan, planToken, tgt };
}

function copyAtomic(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const tmp = dst + '.xpider-new';
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dst);
}

function writeJournal(root, j) { fs.writeFileSync(path.join(root, 'journal.json'), JSON.stringify(j, null, 2)); }
function readJournal(root) {
    const p = path.join(root, 'journal.json');
    if (!fs.existsSync(p)) die('JOURNAL_MISSING', `No journal in ${root}`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function doRollback(target, backupRoot, journal) {
    const backupDir = path.join(backupRoot, 'backup');
    journal.state = 'ROLLING_BACK';
    writeJournal(backupRoot, journal);
    if (fault('rollback-crash')) { process.exit(77); }
    // restore every file that existed pre-update
    for (const e of journal.backupManifest) {
        const dst = path.join(target, e.path);
        if (!fs.existsSync(dst) || sha256File(dst) !== e.sha256) copyAtomic(path.join(backupDir, e.path), dst);
    }
    // delete files added by the update (not present in backup)
    for (const p of journal.plan.add) {
        const f = path.join(target, p);
        if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    // clean temp leftovers
    for (const rel of walk(target)) if (rel.endsWith('.xpider-new')) fs.unlinkSync(path.join(target, rel));
    // verify: every originally backed-up file identical
    const bad = [];
    for (const e of journal.backupManifest) {
        const f = path.join(target, e.path);
        if (!fs.existsSync(f) || sha256File(f) !== e.sha256) bad.push(e.path);
    }
    if (bad.length) { journal.state = 'ROLLBACK_FAILED'; journal.rollbackBad = bad; writeJournal(backupRoot, journal); die('ROLLBACK_VERIFY_FAILED', `Rollback incomplete: ${bad.join(', ')}`); }
    journal.state = 'ROLLED_BACK';
    writeJournal(backupRoot, journal);
}

function commit(ctx, p, backupRoot) {
    const { target, inventory } = ctx;
    const { stage, plan, tgt } = p;
    const backupDir = path.join(backupRoot, 'backup');
    // backup full target tree
    fs.mkdirSync(backupDir, { recursive: true });
    for (const rel of walk(target)) copyAtomic(path.join(target, rel), path.join(backupDir, rel));
    const backupManifest = buildManifest(target);
    const bIssues = cmpTree(backupDir, backupManifest);
    if (bIssues.length) die('BACKUP_VERIFY_FAILED', `Backup copy does not match original: ${bIssues.slice(0, 5).join(', ')}`);

    const journal = { state: 'COMMITTING', startedAt: new Date().toISOString(), target, plan, backupManifest, archiveSha256: plan.archiveSha256 };
    writeJournal(backupRoot, journal);

    try {
        if (fault('stage')) die('FAULT_STAGE', 'Injected staging fault');
        const writes = [...plan.add, ...plan.replace];
        let n = 0;
        for (const rel of writes) {
            n++;
            if (fault('commit-enospc') && n === 3) { const e = new Error('ENOSPC: no space left on device (injected)'); e.code = 'ENOSPC'; throw e; }
            if (fault('commit-crash') && n === 3) process.exit(88);
            copyAtomic(path.join(stage, rel), path.join(target, rel));
        }
        for (const rel of plan.remove) fs.unlinkSync(path.join(target, rel));
        if (fault('verify')) fs.appendFileSync(path.join(target, 'manifest.json'), ' ');
        // post-verify: every candidate file exact; ID correct
        const bad = inventory.filter(e => !fs.existsSync(path.join(target, e.path)) || sha256File(path.join(target, e.path)) !== e.sha256).map(e => e.path);
        if (bad.length) die('POST_VERIFY_FAILED', `Post-commit verification failed: ${bad.join(', ')}`);
        const id = readManifestId(target).id;
        if (id !== ctx.expectedId) die('POST_VERIFY_ID', `Post-commit ID ${id}`);
        journal.state = 'COMMITTED';
        journal.committedAt = new Date().toISOString();
        writeJournal(backupRoot, journal);
        return { committed: true, journal };
    } catch (err) {
        journal.error = `${err.code || ''} ${err.message}`;
        try { doRollback(target, backupRoot, journal); } catch (rbErr) { journal.error += ` | ROLLBACK ERROR: ${rbErr.message}`; throw rbErr; }
        err.rolledBack = true;
        throw err;
    }
}

function loadCtx(a) {
    for (const k of ['target', 'archive', 'expected-sha', 'inventory']) if (!a[k]) die('USAGE', `Missing --${k}`);
    const inventory = JSON.parse(fs.readFileSync(a.inventory, 'utf8'));
    const baseline = a.baseline ? JSON.parse(fs.readFileSync(a.baseline, 'utf8')) : [];
    return {
        target: path.resolve(a.target), archive: path.resolve(a.archive), expectedSha: String(a['expected-sha']).toLowerCase(),
        inventory, baseline, expectedId: a['expected-id'] || DEFAULT_ID
    };
}

function main() {
    const a = parseArgs(process.argv.slice(2));
    const cmd = a._[0];
    try {
        if (cmd === 'manifest') {
            fs.writeFileSync(a._[2], JSON.stringify(buildManifest(path.resolve(a._[1])), null, 2));
            console.log(`MANIFEST_WRITTEN ${a._[2]}`);
        } else if (cmd === 'plan') {
            const ctx = loadCtx(a);
            const p = computePlan(ctx);
            fs.rmSync(p.stage, { recursive: true, force: true });
            console.log(JSON.stringify({ mode: 'DRY_RUN', modifiedTarget: false, ...p.report, plan: p.plan, PLAN_TOKEN: p.planToken }, null, 2));
        } else if (cmd === 'apply') {
            if (a['skip-backup']) die('SKIP_BACKUP_REFUSED', '--skip-backup is not permitted');
            const ctx = loadCtx(a);
            if (!a.approve || a.approve === true) die('APPROVAL_REQUIRED', 'apply requires --approve <PLAN_TOKEN> from a prior dry-run plan');
            const p = computePlan(ctx);
            try {
                if (a.approve !== p.planToken) die('APPROVAL_TOKEN_MISMATCH', 'Plan changed since dry-run or wrong token; re-run plan');
                const backupRoot = path.resolve(a['backup-root'] || path.join(os.tmpdir(), `xpider-update-backup-${Date.now()}`));
                if (fs.existsSync(backupRoot) && fs.readdirSync(backupRoot).length) die('BACKUP_ROOT_NOT_EMPTY', `Backup root must be empty: ${backupRoot}`);
                fs.mkdirSync(backupRoot, { recursive: true });
                const r = commit(ctx, p, backupRoot);
                console.log(JSON.stringify({ result: 'COMMITTED', backupRoot, state: r.journal.state }, null, 2));
            } finally { fs.rmSync(p.stage, { recursive: true, force: true }); }
        } else if (cmd === 'rollback' || cmd === 'recover') {
            const target = path.resolve(a.target), backupRoot = path.resolve(a['backup-root']);
            const j = readJournal(backupRoot);
            if (cmd === 'recover' && j.state === 'COMMITTED') die('NOTHING_TO_RECOVER', 'Journal is COMMITTED; use rollback to revert');
            doRollback(target, backupRoot, j);
            console.log(JSON.stringify({ result: 'ROLLED_BACK', backupRoot }, null, 2));
        } else die('USAGE', 'Subcommands: manifest | plan | apply | rollback | recover');
    } catch (err) {
        console.error(JSON.stringify({ result: 'ABORTED', code: err.code || 'ERROR', message: err.message, rolledBack: !!err.rolledBack }));
        process.exit(err.code === 'USAGE' ? 2 : 3);
    }
}

if (require.main === module) main();
module.exports = { extensionIdFromKey, buildManifest, DEFAULT_ID };

