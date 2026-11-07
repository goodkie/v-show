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

function realPathLoose(p) {
    // canonical real path (resolves junctions/symlinks, 8.3, case) even if the leaf does not exist yet
    let cur = path.resolve(p); const rest = [];
    while (!fs.existsSync(cur)) { const parent = path.dirname(cur); if (parent === cur) break; rest.unshift(path.basename(cur)); cur = parent; }
    return path.join(fs.realpathSync.native(cur), ...rest);
}
function canonKey(p) { const r = realPathLoose(p).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? r.toLowerCase() : r; }
function assertNoOverlap(target, backupRoot) {
    const a = canonKey(target), b = canonKey(backupRoot);
    const sep = path.sep, al = process.platform === 'win32' ? sep : sep;
    if (a === b) die('BACKUP_OVERLAPS_TARGET', 'backup-root equals target');
    if (b.startsWith(a + al)) die('BACKUP_OVERLAPS_TARGET', 'backup-root is inside target');
    if (a.startsWith(b + al)) die('BACKUP_OVERLAPS_TARGET', 'target is inside backup-root');
}
function safeRel(p) { const s = String(p).replace(/\\/g, '/'); if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.split('/').includes('..')) die('UNSAFE_JOURNAL_PATH', `Unsafe path in journal: ${p}`); return s; }
function lockPath(target) { return path.join(os.tmpdir(), 'xpider-update-' + sha256Buf(Buffer.from(canonKey(target))).slice(0, 16) + '.lock'); }
const TERMINAL = new Set(['COMMITTED', 'ROLLED_BACK']);
function assertNoActiveLock(target) {
    const lp = lockPath(target);
    if (!fs.existsSync(lp)) return;
    let info = {}; try { info = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (_) {}
    die('UPDATE_IN_PROGRESS', `An update/rollback on this target is unfinished (backupRoot=${info.backupRoot || '?'}). Run 'recover' first. Do NOT reload the extension in the browser until it finishes.`);
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
    // ---- fail-closed identity checks BEFORE any destructive action ----
    if (!journal.target || canonKey(journal.target) !== canonKey(target)) die('ROLLBACK_TARGET_MISMATCH', `Journal belongs to a different target (${journal.target}); refusing`);
    assertNoOverlap(target, backupRoot);
    const bIssues = cmpTree(backupDir, journal.backupManifest);
    if (bIssues.length) die('BACKUP_INTEGRITY_FAILED', `Backup does not match its manifest: ${bIssues.slice(0, 5).join(', ')}`);
    for (const e of journal.backupManifest) safeRel(e.path);
    for (const p of journal.plan.add) safeRel(p);
    const tid = fs.existsSync(path.join(target, 'manifest.json')) ? readManifestId(target).id : null;
    if (tid !== null && tid !== journal.plan.expectedId) die('ROLLBACK_WRONG_ID', `Target ID ${tid} != journal ${journal.plan.expectedId}`);
    walk(target); // symlink/junction refusal
    journal.state = 'ROLLING_BACK';
    writeJournal(backupRoot, journal);
    fs.writeFileSync(lockPath(target), JSON.stringify({ backupRoot, state: 'ROLLING_BACK' }));
    if (fault('rollback-crash')) { process.exit(77); }
    for (const e of journal.backupManifest) {
        const dst = path.join(target, e.path);
        if (!fs.existsSync(dst) || sha256File(dst) !== e.sha256) copyAtomic(path.join(backupDir, e.path), dst);
    }
    for (const p of journal.plan.add) {
        const f = path.join(target, p);
        if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    for (const rel of walk(target)) if (rel.endsWith('.xpider-new')) fs.unlinkSync(path.join(target, rel));
    // ---- complete-tree identity check ----
    // Policy: result must equal the backup manifest exactly, except files present neither in the backup nor in the
    // candidate add-list ("unknown", e.g. created by the owner meanwhile). Those are PRESERVED (never deleted) and reported.
    const want = new Map(journal.backupManifest.map(e => [e.path, e]));
    const bad = [], preservedUnknown = [];
    for (const e of journal.backupManifest) {
        const f = path.join(target, e.path);
        if (!fs.existsSync(f) || sha256File(f) !== e.sha256) bad.push(e.path);
    }
    for (const rel of walk(target)) if (!want.has(rel)) preservedUnknown.push(rel);
    if (bad.length) { journal.state = 'ROLLBACK_FAILED'; journal.rollbackBad = bad; writeJournal(backupRoot, journal); die('ROLLBACK_VERIFY_FAILED', `Rollback incomplete: ${bad.join(', ')}`); }
    journal.state = 'ROLLED_BACK';
    journal.preservedUnknown = preservedUnknown;
    writeJournal(backupRoot, journal);
    fs.rmSync(lockPath(target), { force: true });
}
function commit(ctx, p, backupRoot) {
    const { target, inventory } = ctx;
    const { stage, plan, tgt } = p;
    const backupDir = path.join(backupRoot, 'backup');
    assertNoOverlap(target, backupRoot);
    assertNoActiveLock(target);
    fs.writeFileSync(lockPath(target), JSON.stringify({ backupRoot, state: 'COMMITTING' }));
    // backup full target tree
    fs.mkdirSync(backupDir, { recursive: true });
    for (const rel of walk(target)) copyAtomic(path.join(target, rel), path.join(backupDir, rel));
    const backupManifest = buildManifest(target);
    const bIssues = cmpTree(backupDir, backupManifest);
    if (bIssues.length) { fs.rmSync(lockPath(target), { force: true }); die('BACKUP_VERIFY_FAILED', `Backup copy does not match original: ${bIssues.slice(0, 5).join(', ')}`); }

    const journal = { state: 'COMMITTING', startedAt: new Date().toISOString(), target, plan, backupManifest, archiveSha256: plan.archiveSha256 };
    writeJournal(backupRoot, journal);

    try {
        if (fault('stage')) die('FAULT_STAGE', 'Injected staging fault');
        const writes = [...plan.add, ...plan.replace];
        let n = 0;
        for (const rel of writes) {
            n++;
            if (fault('commit-enospc') && n === 3) { const e = new Error('ENOSPC: no space left on device (injected)'); e.code = 'ENOSPC'; throw e; }
            if (fault('ebusy-lock') && n === 3) { const e = new Error('EBUSY: resource busy or locked by AV/scanner (injected)'); e.code = 'EBUSY'; throw e; }
            if (fault('powerloss-before-rename') && n === 3) {
                const dst = path.join(target, rel);
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.writeFileSync(dst + '.xpider-new', 'TRUNCATED_HALF_WRITTEN_TEMP');
                process.exit(89);
            }
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
        fs.rmSync(lockPath(target), { force: true });
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

function resolveLesDir(profileDir, extId) {
    const p = path.resolve(profileDir);
    const direct = path.join(p, 'Local Extension Settings', extId);
    const def = path.join(p, 'Default', 'Local Extension Settings', extId);
    if (fs.existsSync(direct)) return direct;
    return def;
}

function assertBrowserClosedForStorage(lesDir) {
    if (!fs.existsSync(lesDir)) return;
    const lf = path.join(lesDir, 'LOCK');
    if (!fs.existsSync(lf)) return;
    const probe = lf + '.xpider-probe';
    try {
        fs.renameSync(lf, probe);
        fs.renameSync(probe, lf);
    } catch (e) {
        die('BROWSER_RUNNING_LOCK_HELD', `Browser still holds LevelDB LOCK (${e.code || e.message}). Close Chrome/Edge completely before backup/restore.`);
    }
}

function getPassphrase(a) {
    const envName = a['passphrase-env'];
    if (!envName || typeof envName !== 'string') die('PASSPHRASE_REQUIRED', 'Specify --passphrase-env <ENV_VAR_NAME>');
    const pp = process.env[envName];
    if (!pp || pp.length < 8) die('PASSPHRASE_TOO_SHORT', `Passphrase in env ${envName} must be at least 8 characters`);
    return pp;
}

function backupStorageEncrypted(a) {
    if (!a['profile-dir'] || !a.out) die('USAGE', 'backup-storage requires --profile-dir <dir> --out <file> --passphrase-env <ENV>');
    const extId = a['ext-id'] || DEFAULT_ID;
    const lesDir = resolveLesDir(a['profile-dir'], extId);
    if (!fs.existsSync(lesDir)) die('STORAGE_DIR_MISSING', `Extension storage dir not found: ${lesDir}`);
    assertBrowserClosedForStorage(lesDir);
    const pass = getPassphrase(a);
    const manifest = buildManifest(lesDir);
    if (!manifest.length) die('STORAGE_EMPTY', `Extension storage dir is empty: ${lesDir}`);
    const files = {};
    for (const e of manifest) files[e.path] = fs.readFileSync(path.join(lesDir, e.path)).toString('base64');
    const manifestSha256 = sha256Buf(Buffer.from(JSON.stringify(manifest)));
    const payload = Buffer.from(JSON.stringify({ version: 1, extId, createdAt: new Date().toISOString(), manifest, manifestSha256, files }), 'utf8');
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    const env = { format: 'XPIDER_ENCRYPTED_STORAGE_BACKUP_V1', kdf: 'scrypt-16384-8-1', cipher: 'aes-256-gcm', extId, fileCount: manifest.length, manifestSha256, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), ciphertext: ct.toString('base64') };
    const outPath = path.resolve(a.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(env, null, 2));
    return { result: 'BACKUP_ENCRYPTED', out: outPath, fileCount: manifest.length, manifestSha256, backupSha256: sha256File(outPath) };
}

function restoreStorageEncrypted(a) {
    if (!a['profile-dir'] || !a.in) die('USAGE', 'restore-storage requires --profile-dir <dir> --in <file> --passphrase-env <ENV>');
    const extId = a['ext-id'] || DEFAULT_ID;
    const inPath = path.resolve(a.in);
    if (!fs.existsSync(inPath)) die('BACKUP_FILE_MISSING', `Encrypted backup file not found: ${inPath}`);
    const pass = getPassphrase(a);
    let env;
    try { env = JSON.parse(fs.readFileSync(inPath, 'utf8')); } catch (_) { die('BACKUP_CORRUPT', 'Backup file is not valid JSON'); }
    if (!env || env.format !== 'XPIDER_ENCRYPTED_STORAGE_BACKUP_V1') die('BACKUP_FORMAT_INVALID', 'Unsupported backup format');
    if (env.extId !== extId) die('BACKUP_ID_MISMATCH', `Backup extId ${env.extId} != expected ${extId}`);
    let plain;
    try {
        const key = crypto.scryptSync(pass, Buffer.from(env.salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
        plain = JSON.parse(Buffer.concat([decipher.update(Buffer.from(env.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    } catch (_) {
        die('WRONG_PASSPHRASE_OR_CORRUPT_BACKUP', 'AES-256-GCM authentication failed (wrong passphrase or corrupted backup)');
    }
    if (sha256Buf(Buffer.from(JSON.stringify(plain.manifest))) !== env.manifestSha256) die('MANIFEST_HASH_MISMATCH', 'Decrypted manifest hash mismatch');
    const lesDir = resolveLesDir(a['profile-dir'], extId);
    assertBrowserClosedForStorage(lesDir);
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-les-stage-'));
    try {
        for (const e of plain.manifest) {
            safeRel(e.path);
            const buf = Buffer.from(plain.files[e.path] || '', 'base64');
            if (buf.length !== e.size || sha256Buf(buf) !== e.sha256) die('FILE_INTEGRITY_MISMATCH', `Integrity mismatch for ${e.path}`);
            const dst = path.join(stage, e.path);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.writeFileSync(dst, buf);
        }
        fs.mkdirSync(path.dirname(lesDir), { recursive: true });
        const bak = lesDir + '.pre-restore-bak';
        if (fs.existsSync(bak)) fs.rmSync(bak, { recursive: true, force: true });
        if (fs.existsSync(lesDir)) fs.renameSync(lesDir, bak);
        try {
            fs.cpSync(stage, lesDir, { recursive: true });
            const issues = cmpTree(lesDir, plain.manifest);
            if (issues.length) die('RESTORE_VERIFY_FAILED', `Post-restore verify failed: ${issues.join(', ')}`);
            if (fs.existsSync(bak)) fs.rmSync(bak, { recursive: true, force: true });
        } catch (err) {
            if (fs.existsSync(bak)) { fs.rmSync(lesDir, { recursive: true, force: true }); fs.renameSync(bak, lesDir); }
            throw err;
        }
        return { result: 'RESTORED_VERIFIED', lesDir, fileCount: plain.manifest.length, manifestSha256: env.manifestSha256 };
    } finally {
        fs.rmSync(stage, { recursive: true, force: true });
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
                assertNoOverlap(ctx.target, backupRoot);
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
        } else if (cmd === 'backup-storage') {
            console.log(JSON.stringify(backupStorageEncrypted(a), null, 2));
        } else if (cmd === 'restore-storage') {
            console.log(JSON.stringify(restoreStorageEncrypted(a), null, 2));
        } else die('USAGE', 'Subcommands: manifest | plan | apply | rollback | recover | backup-storage | restore-storage');
    } catch (err) {
        console.error(JSON.stringify({ result: 'ABORTED', code: err.code || 'ERROR', message: err.message, rolledBack: !!err.rolledBack }));
        process.exit(err.code === 'USAGE' ? 2 : 3);
    }
}

if (require.main === module) main();
module.exports = { extensionIdFromKey, buildManifest, DEFAULT_ID };


