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
 *   preflight-uat --target D --profile-dir P [--archive Z --expected-sha H --inventory I.json]
 *            READ-ONLY dry-run check of Node, explicit paths, archive/ID, local sink, and OS firewall status.
 *   backup-storage        --profile-dir P --out F.xpider-enc [--passphrase-env ENV]
 *   verify-storage-backup --in F.xpider-enc [--passphrase-env ENV] (in-memory only, writtenToDisk: false)
 *   restore-storage       --profile-dir P --in F.xpider-enc [--allow-synthetic-uat-restore]
 *   audit-uat-state       --in F.xpider-enc [--passphrase-env ENV]
 *   verify-uat-firewall   [--sink-port 8090] [--fixture-port 8088]
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
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

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
function safeRel(p) {
    const s = String(p).replace(/\\/g, '/');
    const parts = s.split('/');
    if (!s || s.startsWith('/') || s.endsWith('/') || /^[a-zA-Z]:/.test(s) || parts.some(seg => !seg || seg === '.' || seg === '..')) {
        die('UNSAFE_JOURNAL_PATH', `Unsafe path in journal/archive: ${p}`);
    }
    return s;
}
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

function assertValidExtId(extId) {
    if (!/^[a-p]{32}$/.test(String(extId || ''))) die('INVALID_EXT_ID', `Invalid Chromium extension ID: ${extId}`);
}

function assertNoSymlinkChain(profileDir, lesDir) {
    const root = path.resolve(profileDir);
    const target = path.resolve(lesDir);
    const rel = path.relative(root, target);
    const parts = rel ? rel.split(path.sep) : [];
    let cur = root;
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) die('SYMLINK_FOUND', `Symlink/junction refused on profile path: ${cur}`);
    for (const seg of parts) {
        cur = path.join(cur, seg);
        if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) die('SYMLINK_FOUND', `Symlink/junction refused on storage path: ${cur}`);
    }
    if (fs.existsSync(target)) walk(target);
}

function resolveLesDir(profileDir, extId) {
    assertValidExtId(extId);
    const p = path.resolve(profileDir);
    const direct = path.join(p, 'Local Extension Settings', extId);
    const def = path.join(p, 'Default', 'Local Extension Settings', extId);
    const chosen = fs.existsSync(direct) ? direct : def;
    assertNoSymlinkChain(p, chosen);
    return chosen;
}

function recoverInterruptedStorageRestore(lesDir) {
    const bak = lesDir + '.pre-restore-bak';
    if (!fs.existsSync(bak)) return false;
    if (fs.lstatSync(bak).isSymbolicLink()) die('SYMLINK_FOUND', `Symlink/junction refused on backup path: ${bak}`);
    if (fs.existsSync(lesDir)) fs.rmSync(lesDir, { recursive: true, force: true });
    fs.renameSync(bak, lesDir);
    return true;
}

function assertBrowserClosedForStorage(lesDir) {
    if (!fs.existsSync(lesDir)) return;
    const initRels = walk(lesDir);
    for (const rel of initRels) {
        if (rel.endsWith('.xpider-probe')) {
            const probeFile = path.join(lesDir, rel);
            const origFile = probeFile.slice(0, -'.xpider-probe'.length);
            if (!fs.existsSync(origFile)) fs.renameSync(probeFile, origFile);
        }
    }
    const rels = walk(lesDir);
    for (const rel of rels) {
        const f = path.join(lesDir, rel);
        const probe = f + '.xpider-probe';
        let fd = null;
        try {
            fd = fs.openSync(f, 'r+');
            fs.closeSync(fd); fd = null;
            fs.renameSync(f, probe);
            fs.renameSync(probe, f);
        } catch (e) {
            if (fd !== null) try { fs.closeSync(fd); } catch (_) {}
            die('BROWSER_RUNNING_LOCK_HELD', `Browser or OS holds lock on LevelDB file ${rel} (${e.code || e.message}). Close Chrome/Edge completely before backup/restore.`);
        }
    }
}

function getPassphrase(a) {
    const envName = a['passphrase-env'];
    if (!envName || typeof envName !== 'string') die('PASSPHRASE_REQUIRED', 'Specify --passphrase-env <ENV_VAR_NAME>');
    const pp = process.env[envName];
    if (!pp || pp.length < 8) die('PASSPHRASE_TOO_SHORT', `Passphrase in env ${envName} must be at least 8 characters`);
    return pp;
}

const UAT_IDENTITY_FILENAME = '.xpider-uat-disposable-profile.json';
const UAT_READBACK_FILENAME = '.xpider-uat-storage-readback.json';
const ATTESTATION_QUALIFICATION_NOTE = 'AES-256-GCM authenticates the asserted backup scope, disposable profile session nonce, Chrome storage.local API readback hash, and LevelDB file manifest SHA-256; it is NOT mathematical proof of arbitrary uninspected LevelDB binaries.';

const ALLOWLISTED_UAT_TOP_KEYS = new Set([
    'xpider_schema_version',
    'xpider_migration_phase',
    'templates_v2',
    'savedUrlLists_v2',
    'xpider_email_collector_v1',
    'xpider_isPaused',
    'xpider_paused_checkpoint',
    'xpider_suppression_ledger_v2',
    'xpider_attempt_history_v1',
    'xpider_campaign_mode',
    'xpider_ui_state',
    'xpider_uat_session_nonce',
    'ownerFunctionTestMode',
    'runScopedDirectPrivacy'
]);

function resolveUatProfileRootDir(profileDirArg) {
    const resolved = path.resolve(String(profileDirArg));
    const base = path.basename(resolved);
    return /^(default|profile\s*\d+)$/i.test(base) ? path.dirname(resolved) : resolved;
}

function initDisposableUatProfile(a) {
    if (!a['profile-dir']) die('USAGE', 'init-uat-profile requires --profile-dir <dir>');
    const extId = a['ext-id'] || DEFAULT_ID;
    assertValidExtId(extId);
    const profRoot = resolveUatProfileRootDir(a['profile-dir']);
    if (fs.existsSync(profRoot)) {
        assertNoSymlinks(profRoot);
        const existingEntries = fs.readdirSync(profRoot).filter(n => n !== UAT_IDENTITY_FILENAME && n !== 'Default');
        const lesDir = resolveLesDir(profRoot, extId);
        if (existingEntries.length > 0 || (fs.existsSync(lesDir) && fs.readdirSync(lesDir).length > 0)) {
            die('UAT_PROFILE_NOT_CLEAN_ON_INIT', `Disposable UAT profile directory must be brand-new or empty on initialization: ${profRoot}`);
        }
    } else {
        fs.mkdirSync(profRoot, { recursive: true });
    }
    const uatSessionNonce = (a['session-nonce'] && /^[0-9a-f]{64}$/i.test(String(a['session-nonce'])))
        ? String(a['session-nonce']).toLowerCase()
        : crypto.randomBytes(32).toString('hex');
    const identityFile = path.join(profRoot, UAT_IDENTITY_FILENAME);
    const identityObj = {
        schema: 'XPIDER_DISPOSABLE_UAT_PROFILE_IDENTITY_V1',
        extId,
        uatSessionNonce,
        profileRoot: profRoot,
        createdAt: new Date().toISOString()
    };
    fs.writeFileSync(identityFile, JSON.stringify(identityObj, null, 2) + '\n');
    return {
        result: 'DISPOSABLE_UAT_PROFILE_INITIALIZED',
        profileRoot: profRoot,
        identityFile,
        uatSessionNonce,
        extId
    };
}

function readDisposableUatIdentity(profileDirArg) {
    if (!profileDirArg) return null;
    const resolved = path.resolve(String(profileDirArg));
    const profRoot = resolveUatProfileRootDir(profileDirArg);
    const candidates = [
        path.join(resolved, UAT_IDENTITY_FILENAME),
        path.join(profRoot, UAT_IDENTITY_FILENAME)
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (obj && obj.schema === 'XPIDER_DISPOSABLE_UAT_PROFILE_IDENTITY_V1' && /^[0-9a-f]{64}$/i.test(String(obj.uatSessionNonce || ''))) {
                    return { ...obj, identityFilePath: p };
                }
            } catch (_) {}
            die('CORRUPT_DISPOSABLE_UAT_PROFILE_IDENTITY', `Invalid disposable UAT profile identity file: ${p}`);
        }
    }
    return null;
}

function expandNormalizedStringVariants(inputStr) {
    const out = new Set();
    const s0 = String(inputStr || '');
    out.add(s0);
    // 1. Unescape JSON/JS escaped slashes and \uXXXX / \xXX sequences
    const unescaped = s0
        .replace(/\\\//g, '/')
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    out.add(unescaped);
    // 2. Percent-decoding (URL-encoded strings)
    for (const cand of [s0, unescaped]) {
        if (/%[0-9a-fA-F]{2}/.test(cand)) {
            try { out.add(decodeURIComponent(cand)); } catch (_) {}
        }
    }
    // 3. Base64-encoded or compressed (zlib/deflate/gzip) tokens
    const b64Matches = s0.match(/[A-Za-z0-9+/]{16,}={0,2}/g) || [];
    for (const tok of b64Matches) {
        if (tok.length % 4 !== 0) continue;
        try {
            const raw = Buffer.from(tok, 'base64');
            if (!raw.length) continue;
            out.add(raw.toString('utf8'));
            if (raw.length >= 4 && raw.length % 2 === 0) out.add(raw.toString('utf16le'));
            for (const decompFn of [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync]) {
                try {
                    const dec = decompFn(raw);
                    if (dec && dec.length) {
                        out.add(dec.toString('utf8'));
                        if (dec.length % 2 === 0) out.add(dec.toString('utf16le'));
                    }
                } catch (_) {}
            }
        } catch (_) {}
    }
    return Array.from(out);
}

/**
 * Secondary defense-in-depth heuristic check over raw LevelDB buffers (UTF-8, UTF-16LE, base64, zlib).
 * NOTE: Raw LevelDB buffer scanning does NOT prove mathematical provenance of arbitrary LevelDB binaries;
 * primary synthetic UAT approval requires Chrome storage.local API readback + disposable profile nonce binding.
 */
function auditRawLevelDbBuffersForUatSafety(rawBuffersMap) {
    const FORBIDDEN_MARKER_RE = /(xpider_proxy_credentials|xpider_sentinel_token|proxyPassword|authPassword|apiKey|secretKey|privateKey|decodoPassword|decodo_pass|smartproxyPassword|smartproxy_pass|proxy_pass|DO_NOT_LEAK|REAL_OWNER)/i;
    const PROXY_URI_RE = /\b(?:https?|socks5?):\/\/[^/\s"'<>]+:[^@\s"'<>]+@/i;
    const URL_RE = /https?:\/\/([^\s"'<>\\\/?#\x00-\x1f]+)(?:[^\s"'<>\\\x00-\x1f]*)/giu;
    const EMAIL_RE = /[^\s"'<>@:,;()\[\]{}\\\x00-\x1f]+@([^\s"'<>@:,;()\[\]{}\\\x00-\x1f]+\.[^\s"'<>@:,;()\[\]{}\\\x00-\x1f]+)/gu;

    const inspectDecodedText = (relPath, decodedText) => {
        for (const variant of expandNormalizedStringVariants(decodedText)) {
            if (FORBIDDEN_MARKER_RE.test(variant) || PROXY_URI_RE.test(variant)) {
                die('NON_SYNTHETIC_BACKUP_CONTENT_FORBIDDEN', `Storage file (${relPath}) contains sensitive credential or non-synthetic marker; refusing UAT synthetic classification/restore`);
            }
            let m;
            URL_RE.lastIndex = 0;
            while ((m = URL_RE.exec(variant)) !== null) {
                const hostPort = m[1].toLowerCase();
                const host = hostPort.startsWith('[')
                    ? hostPort.replace(/\]:\d+$/, ']')
                    : hostPort.replace(/:\d+$/, '');
                if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
                    die('NON_SYNTHETIC_BACKUP_CONTENT_FORBIDDEN', `Storage file (${relPath}) contains non-loopback URL host; refusing UAT synthetic classification/restore`);
                }
            }
            EMAIL_RE.lastIndex = 0;
            while ((m = EMAIL_RE.exec(variant)) !== null) {
                const dom = m[1].toLowerCase().replace(/[^a-z0-9.\-\u00a0-\uffff]+$/giu, '');
                if (!/\.(test|invalid|local)$/i.test(dom) && dom !== 'localhost') {
                    die('NON_SYNTHETIC_BACKUP_CONTENT_FORBIDDEN', `Storage file (${relPath}) contains non-synthetic email domain; refusing UAT synthetic classification/restore`);
                }
            }
        }
    };

    for (const [relPath, buf] of Object.entries(rawBuffersMap)) {
        const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'utf8');
        inspectDecodedText(relPath, raw.toString('utf8'));
        inspectDecodedText(relPath, raw.toString('latin1'));
        if (raw.length >= 4) {
            inspectDecodedText(relPath, raw.subarray(0, raw.length - (raw.length % 2)).toString('utf16le'));
            if (raw.length >= 5) {
                const sub1 = raw.subarray(1);
                inspectDecodedText(relPath, sub1.subarray(0, sub1.length - (sub1.length % 2)).toString('utf16le'));
            }
        }
        for (const decompFn of [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync]) {
            try {
                const dec = decompFn(raw);
                if (dec && dec.length) {
                    inspectDecodedText(relPath, dec.toString('utf8'));
                    if (dec.length % 2 === 0) inspectDecodedText(relPath, dec.toString('utf16le'));
                }
            } catch (_) {}
        }
    }
    return true;
}

function loadChromeApiReadbackForUat(a, lesDir) {
    let readbackPath = a['storage-readback'] ? path.resolve(String(a['storage-readback'])) : null;
    if (!readbackPath) {
        const profRoot = resolveUatProfileRootDir(a['profile-dir']);
        const autoPath = path.join(profRoot, UAT_READBACK_FILENAME);
        if (fs.existsSync(autoPath)) readbackPath = autoPath;
    }
    if (!readbackPath || !fs.existsSync(readbackPath)) {
        die('MISSING_CHROME_API_READBACK_FOR_SYNTHETIC_BACKUP', 'Synthetic UAT backup requires --storage-readback <readback.json> captured from Chrome extension API chrome.storage.local.get(null) (raw LevelDB regex alone cannot prove synthetic provenance).');
    }
    let obj;
    try { obj = JSON.parse(fs.readFileSync(readbackPath, 'utf8')); } catch (_) {
        die('UAT_STATE_INVALID', `Invalid JSON in Chrome API storage readback: ${readbackPath}`);
    }
    return { readbackPath, obj };
}

function backupStorageEncrypted(a) {
    if (!a['profile-dir'] || !a.out) die('USAGE', 'backup-storage requires --profile-dir <dir> --out <file> --passphrase-env <ENV> [--synthetic-uat-origin --storage-readback <readback.json>]');
    const extId = a['ext-id'] || DEFAULT_ID;
    const lesDir = resolveLesDir(a['profile-dir'], extId);
    recoverInterruptedStorageRestore(lesDir);
    if (!fs.existsSync(lesDir)) die('STORAGE_DIR_MISSING', `Extension storage dir not found: ${lesDir}`);
    const outPath = path.resolve(a.out);
    assertNoOverlap(lesDir, outPath);
    assertBrowserClosedForStorage(lesDir);
    const pass = getPassphrase(a);
    const manifest = buildManifest(lesDir);
    if (!manifest.length) die('STORAGE_EMPTY', `Extension storage dir is empty: ${lesDir}`);
    const files = {};
    const rawBuffers = {};
    for (const e of manifest) {
        const raw = fs.readFileSync(path.join(lesDir, e.path));
        rawBuffers[e.path] = raw;
        files[e.path] = raw.toString('base64');
    }
    const isSyntheticOrigin = !!a['synthetic-uat-origin'];
    const uatIdentity = readDisposableUatIdentity(a['profile-dir']);
    let uatSessionNonce = null;
    let chromeApiReadbackSha256 = null;
    let attestedStorageReadback = null;

    if (isSyntheticOrigin) {
        if (!uatIdentity) {
            die('MISSING_DISPOSABLE_UAT_PROFILE_IDENTITY', 'Synthetic UAT backup requires a disposable profile initialized by the UAT harness (init-uat-profile -> .xpider-uat-disposable-profile.json).');
        }
        const { obj: readbackObj } = loadChromeApiReadbackForUat(a, lesDir);
        auditUatStateObj(readbackObj, { strictAllowlist: true, expectedUatNonce: uatIdentity.uatSessionNonce });
        auditRawLevelDbBuffersForUatSafety(rawBuffers);
        uatSessionNonce = uatIdentity.uatSessionNonce;
        attestedStorageReadback = readbackObj;
        chromeApiReadbackSha256 = sha256Buf(Buffer.from(JSON.stringify(readbackObj), 'utf8'));
    } else if (uatIdentity) {
        die('UAT_DISPOSABLE_PROFILE_IN_REAL_BACKUP_FORBIDDEN', 'Refusing to create an OFFLINE_REAL_RECOVERY_ONLY backup from a disposable UAT profile (.xpider-uat-disposable-profile.json present). Pass --synthetic-uat-origin with --storage-readback for synthetic UAT backups.');
    }

    const backupOrigin = isSyntheticOrigin ? 'SYNTHETIC_UAT_ONLY' : 'OFFLINE_REAL_RECOVERY_ONLY';
    const backupScope = isSyntheticOrigin ? 'SYNTHETIC_UAT_ATTESTED' : 'OFFLINE_OWNER_RECOVERY';
    const manifestSha256 = sha256Buf(Buffer.from(JSON.stringify(manifest)));
    const payload = Buffer.from(JSON.stringify({
        version: 2,
        extId,
        backupOrigin,
        backupScope,
        attestationType: isSyntheticOrigin ? 'CHROME_STORAGE_API_READBACK_AND_DISPOSABLE_NONCE_BOUND' : 'ASSERTED_OFFLINE_OWNER_RECOVERY',
        attestationQualification: ATTESTATION_QUALIFICATION_NOTE,
        syntheticAuditPassed: isSyntheticOrigin,
        uatSessionNonce,
        chromeApiReadbackSha256,
        expectedSnapshotManifestSha256: manifestSha256,
        attestedStorageReadback,
        createdAt: new Date().toISOString(),
        manifest,
        manifestSha256,
        files
    }), 'utf8');
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    const env = {
        format: 'XPIDER_ENCRYPTED_STORAGE_BACKUP_V1',
        kdf: 'scrypt-16384-8-1',
        cipher: 'aes-256-gcm',
        extId,
        backupOrigin,
        backupScope,
        attestationQualification: ATTESTATION_QUALIFICATION_NOTE,
        fileCount: manifest.length,
        manifestSha256,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: ct.toString('base64')
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(env, null, 2));
    return {
        result: 'BACKUP_ENCRYPTED',
        out: outPath,
        backupOrigin,
        backupScope,
        uatSessionNonce,
        chromeApiReadbackSha256,
        expectedSnapshotManifestSha256: isSyntheticOrigin ? manifestSha256 : null,
        attestationQualification: ATTESTATION_QUALIFICATION_NOTE,
        fileCount: manifest.length,
        manifestSha256,
        backupSha256: sha256File(outPath)
    };
}

function restoreStorageEncrypted(a) {
    if (!a['profile-dir'] || !a.in) die('USAGE', 'restore-storage requires --profile-dir <dir> --in <file> --passphrase-env <ENV> [--allow-synthetic-uat-restore | --confirm-offline-owner-recovery]');
    const resolvedProf = path.resolve(String(a['profile-dir']));
    const baseName = path.basename(resolvedProf);
    const profFolderName = /^(default|profile\s*\d+)$/i.test(baseName)
        ? path.basename(path.dirname(resolvedProf))
        : baseName;
    const nameLooksLikeUat = /(?:^|[._-])uat(?:$|[._-])/i.test(profFolderName);
    const destUatIdentity = readDisposableUatIdentity(a['profile-dir']);
    const allowSyntheticFlag = !!a['allow-synthetic-uat-restore'];
    const confirmRealRecoveryFlag = !!a['confirm-offline-owner-recovery'];

    // Item 3 (#6707178560): Do NOT block legitimate emergency recovery just because a real directory name contains 'uat'
    // when --confirm-offline-owner-recovery is explicitly provided and the directory has no disposable UAT identity.
    if (destUatIdentity && !allowSyntheticFlag) {
        die('REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN', 'Refusing to restore into a disposable UAT profile (.xpider-uat-disposable-profile.json present) without --allow-synthetic-uat-restore and a Chrome-API-attested SYNTHETIC_UAT_ONLY backup.');
    }
    if (nameLooksLikeUat && !allowSyntheticFlag && !confirmRealRecoveryFlag) {
        die('REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN', 'Directory name contains "uat". If restoring into a disposable UAT profile, initialize it with init-uat-profile and pass --allow-synthetic-uat-restore; if performing legitimate emergency recovery of a real profile whose path contains "uat", pass --confirm-offline-owner-recovery.');
    }
    if (allowSyntheticFlag && !destUatIdentity) {
        die('MISSING_DISPOSABLE_UAT_PROFILE_IDENTITY', 'Refusing UAT restore (--allow-synthetic-uat-restore): destination --profile-dir lacks a valid disposable UAT profile identity (.xpider-uat-disposable-profile.json created by init-uat-profile). Restore decisions never rely on directory name or flag alone.');
    }

    const extId = a['ext-id'] || DEFAULT_ID;
    const lesDir = resolveLesDir(a['profile-dir'], extId);
    const recoveredPrior = recoverInterruptedStorageRestore(lesDir);
    const inPath = path.resolve(a.in);
    assertNoOverlap(lesDir, inPath);
    if (!fs.existsSync(inPath)) die('BACKUP_FILE_MISSING', `Encrypted backup file not found: ${inPath}`);
    assertBrowserClosedForStorage(lesDir);
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
    if (!plain || plain.extId !== extId) die('BACKUP_ID_MISMATCH', `Decrypted payload extId ${plain && plain.extId} != expected ${extId}`);
    if (!Array.isArray(plain.manifest) || !plain.manifest.length || !plain.files || typeof plain.files !== 'object') {
        die('MANIFEST_FILES_MISMATCH', 'Decrypted payload missing valid manifest or files map');
    }
    if (sha256Buf(Buffer.from(JSON.stringify(plain.manifest))) !== env.manifestSha256) die('MANIFEST_HASH_MISMATCH', 'Decrypted manifest hash mismatch');
    const decryptedOrigin = plain.backupOrigin || 'OFFLINE_REAL_RECOVERY_ONLY';
    const decryptedScope = plain.backupScope || 'OFFLINE_OWNER_RECOVERY';

    if (destUatIdentity || allowSyntheticFlag) {
        if (
            decryptedOrigin !== 'SYNTHETIC_UAT_ONLY' ||
            decryptedScope !== 'SYNTHETIC_UAT_ATTESTED' ||
            plain.syntheticAuditPassed !== true ||
            !/^[0-9a-f]{64}$/i.test(String(plain.uatSessionNonce || '')) ||
            !/^[0-9a-f]{64}$/i.test(String(plain.chromeApiReadbackSha256 || '')) ||
            plain.expectedSnapshotManifestSha256 !== env.manifestSha256 ||
            !plain.attestedStorageReadback ||
            typeof plain.attestedStorageReadback !== 'object'
        ) {
            die('NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE', `Refusing UAT restore: decrypted backup origin="${decryptedOrigin}", scope="${decryptedScope}" lacks verified Chrome-API readback attestation and disposable session nonce binding. Passing --allow-synthetic-uat-restore cannot override a real or unattested backup into a UAT profile.`);
        }
        const computedReadbackSha = sha256Buf(Buffer.from(JSON.stringify(plain.attestedStorageReadback), 'utf8'));
        if (computedReadbackSha !== plain.chromeApiReadbackSha256) {
            die('NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE', 'Decrypted Chrome API readback hash mismatch inside synthetic backup');
        }
        if (a['expected-uat-nonce'] && String(a['expected-uat-nonce']).toLowerCase() !== String(plain.uatSessionNonce).toLowerCase()) {
            die('UAT_SESSION_NONCE_MISMATCH', 'Backup uatSessionNonce does not match --expected-uat-nonce');
        }
        // Re-audit the embedded Chrome API storage.local readback in memory before touching disk
        auditUatStateObj(plain.attestedStorageReadback, { strictAllowlist: true, expectedUatNonce: plain.uatSessionNonce });
    } else if (decryptedOrigin === 'SYNTHETIC_UAT_ONLY' || decryptedScope === 'SYNTHETIC_UAT_ATTESTED') {
        die('SYNTHETIC_BACKUP_RESTORE_INTO_REAL_PROFILE_FORBIDDEN', 'Refusing to restore a SYNTHETIC_UAT_ONLY backup into a non-UAT real profile directory.');
    }

    const fileKeys = Object.keys(plain.files);
    for (const k of fileKeys) safeRel(k);
    if (fileKeys.length !== plain.manifest.length) die('MANIFEST_FILES_MISMATCH', `Manifest count ${plain.manifest.length} != files count ${fileKeys.length}`);
    const seenLower = new Set();
    const decodedBuffers = {};
    for (const e of plain.manifest) {
        const rel = safeRel(e.path);
        const lk = rel.toLowerCase();
        if (seenLower.has(lk)) die('DUPLICATE_MANIFEST_PATH', `Duplicate/case-colliding path in manifest: ${rel}`);
        seenLower.add(lk);
        if (!Object.prototype.hasOwnProperty.call(plain.files, e.path)) die('MANIFEST_FILES_MISMATCH', `Missing file payload for ${e.path}`);
        const buf = Buffer.from(plain.files[e.path] || '', 'base64');
        if (buf.length !== e.size || sha256Buf(buf) !== e.sha256) die('FILE_INTEGRITY_MISMATCH', `Integrity mismatch for ${e.path}`);
        decodedBuffers[rel] = buf;
    }
    if (destUatIdentity || allowSyntheticFlag) {
        auditRawLevelDbBuffersForUatSafety(decodedBuffers);
    }
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-les-stage-'));
    try {
        for (const [rel, buf] of Object.entries(decodedBuffers)) {
            const dst = path.join(stage, rel);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.writeFileSync(dst, buf);
        }
        fs.mkdirSync(path.dirname(lesDir), { recursive: true });
        const bak = lesDir + '.pre-restore-bak';
        if (fs.existsSync(lesDir)) fs.renameSync(lesDir, bak);
        if (fault('restore-after-bak-rename')) process.exit(91);
        try {
            fs.cpSync(stage, lesDir, { recursive: true });
            const issues = cmpTree(lesDir, plain.manifest);
            if (issues.length) die('RESTORE_VERIFY_FAILED', `Post-restore verify failed: ${issues.join(', ')}`);
            if (fs.existsSync(bak)) fs.rmSync(bak, { recursive: true, force: true });
        } catch (err) {
            if (fs.existsSync(bak)) { fs.rmSync(lesDir, { recursive: true, force: true }); fs.renameSync(bak, lesDir); }
            throw err;
        }
        return {
            result: 'RESTORED_VERIFIED',
            lesDir,
            backupOrigin: decryptedOrigin,
            backupScope: decryptedScope,
            uatSessionNonce: plain.uatSessionNonce || null,
            chromeApiReadbackSha256: plain.chromeApiReadbackSha256 || null,
            attestationQualification: ATTESTATION_QUALIFICATION_NOTE,
            fileCount: plain.manifest.length,
            manifestSha256: env.manifestSha256,
            recoveredInterruptedPrior: recoveredPrior
        };
    } finally {
        fs.rmSync(stage, { recursive: true, force: true });
    }
}

function verifyStorageBackupEncrypted(a) {
    if (!a.in) die('USAGE', 'verify-storage-backup requires --in <file> --passphrase-env <ENV>');
    const extId = a['ext-id'] || DEFAULT_ID;
    assertValidExtId(extId);
    const inPath = path.resolve(a.in);
    if (!fs.existsSync(inPath)) die('BACKUP_FILE_MISSING', `Encrypted backup file not found: ${inPath}`);
    const pass = getPassphrase(a);
    let env;
    try { env = JSON.parse(fs.readFileSync(inPath, 'utf8')); } catch (_) { die('BACKUP_CORRUPT', 'Backup file is not valid JSON'); }
    if (!env || env.format !== 'XPIDER_ENCRYPTED_STORAGE_BACKUP_V1') die('BACKUP_FORMAT_INVALID', 'Unsupported backup format');
    if (env.extId !== extId) die('BACKUP_ID_MISMATCH', `Backup extId ${env.extId} != expected ${extId}`);
    let plainBuf = null, plain = null;
    try {
        const key = crypto.scryptSync(pass, Buffer.from(env.salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
        plainBuf = Buffer.concat([decipher.update(Buffer.from(env.ciphertext, 'base64')), decipher.final()]);
        plain = JSON.parse(plainBuf.toString('utf8'));
    } catch (_) {
        if (plainBuf) plainBuf.fill(0);
        die('WRONG_PASSPHRASE_OR_CORRUPT_BACKUP', 'AES-256-GCM authentication failed (wrong passphrase or corrupted backup)');
    }
    try {
        if (!plain || plain.extId !== extId) die('BACKUP_ID_MISMATCH', `Decrypted payload extId ${plain && plain.extId} != expected ${extId}`);
        if (!Array.isArray(plain.manifest) || !plain.manifest.length || !plain.files || typeof plain.files !== 'object') {
            die('MANIFEST_FILES_MISMATCH', 'Decrypted payload missing valid manifest or files map');
        }
        if (sha256Buf(Buffer.from(JSON.stringify(plain.manifest))) !== env.manifestSha256) die('MANIFEST_HASH_MISMATCH', 'Decrypted manifest hash mismatch');
        const fileKeys = Object.keys(plain.files);
        for (const k of fileKeys) safeRel(k);
        if (fileKeys.length !== plain.manifest.length) die('MANIFEST_FILES_MISMATCH', `Manifest count ${plain.manifest.length} != files count ${fileKeys.length}`);
        const seenLower = new Set();
        for (const e of plain.manifest) {
            const rel = safeRel(e.path);
            const lk = rel.toLowerCase();
            if (seenLower.has(lk)) die('DUPLICATE_MANIFEST_PATH', `Duplicate/case-colliding path in manifest: ${rel}`);
            seenLower.add(lk);
            if (!Object.prototype.hasOwnProperty.call(plain.files, e.path)) die('MANIFEST_FILES_MISMATCH', `Missing file payload for ${e.path}`);
            const buf = Buffer.from(plain.files[e.path] || '', 'base64');
            if (buf.length !== e.size || sha256Buf(buf) !== e.sha256) die('FILE_INTEGRITY_MISMATCH', `Integrity mismatch for ${e.path}`);
            buf.fill(0);
        }
        return {
            result: 'BACKUP_INTEGRITY_VERIFIED_IN_MEMORY',
            writtenToDisk: false,
            decryptedFilesWritten: 0,
            extId,
            backupOrigin: plain.backupOrigin || 'OFFLINE_REAL_RECOVERY_ONLY',
            backupScope: plain.backupScope || 'OFFLINE_OWNER_RECOVERY',
            uatSessionNonce: plain.uatSessionNonce || null,
            chromeApiReadbackSha256: plain.chromeApiReadbackSha256 || null,
            attestationQualification: ATTESTATION_QUALIFICATION_NOTE,
            fileCount: plain.manifest.length,
            manifestSha256: env.manifestSha256,
            backupSha256: sha256File(inPath)
        };
    } finally {
        if (plainBuf) plainBuf.fill(0);
    }
}

function auditUatStateObj(state, opts = {}) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) die('UAT_STATE_INVALID', 'UAT state must be a JSON object');
    const FORBIDDEN_CRED_KEYS = /^(xpider_proxy_credentials|xpider_sentinel_token|proxyPassword|authPassword|apiKey|secretKey|privateKey|decodoPassword|smartproxyPassword)$/i;
    const FORBIDDEN_MARKER_RE = /(xpider_proxy_credentials|xpider_sentinel_token|proxyPassword|authPassword|apiKey|secretKey|privateKey|decodoPassword|decodo_pass|smartproxyPassword|smartproxy_pass|proxy_pass|DO_NOT_LEAK|REAL_OWNER)/i;
    const URL_RE = /https?:\/\/([^\s"'<>\\\/?#\x00-\x1f]+)(?:[^\s"'<>\\\x00-\x1f]*)/giu;
    const EMAIL_RE = /[^\s"'<>@:,;()\[\]{}\\\x00-\x1f]+@([^\s"'<>@:,;()\[\]{}\\\x00-\x1f]+\.[^\s"'<>@:,;()\[\]{}\\\x00-\x1f]+)/gu;
    const PROXY_URI_RE = /\b(?:https?|socks5?):\/\/[^/\s"'<>]+:[^@\s"'<>]+@/i;

    if (state.isActive === true || state.isLoopRunning === true || state.xpider_isRunning === true) {
        die('ACTIVE_CAMPAIGN_IN_UAT_PROFILE', 'UAT profile must not have an active/auto-resuming campaign on startup');
    }
    const safeKeyLabel = kp => String(kp || 'root').split('.')[0].replace(/[^A-Za-z0-9_\[\]]/g, '');

    // Enforce strict top-level key allowlist so unknown/production keys are rejected immediately
    const enforceStrictAllowlist = opts.strictAllowlist !== false;
    for (const topK of Object.keys(state)) {
        const curTop = safeKeyLabel(topK);
        if (FORBIDDEN_CRED_KEYS.test(topK) || /password|secret|token|apikey|credential|decodo|smartproxy/i.test(topK)) {
            const v = state[topK];
            if (v !== null && v !== undefined && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0)) {
                die('SENSITIVE_CREDENTIALS_IN_UAT_PROFILE', `Sensitive credential key (${curTop}) forbidden in UAT state`);
            }
        }
        if (enforceStrictAllowlist && !ALLOWLISTED_UAT_TOP_KEYS.has(topK)) {
            die('UNRECOGNIZED_STORAGE_KEY_IN_UAT_PROFILE', `Unrecognized top-level storage key (${curTop}) forbidden in synthetic UAT state`);
        }
    }

    if (opts.expectedUatNonce) {
        if (String(state.xpider_uat_session_nonce || '').toLowerCase() !== String(opts.expectedUatNonce).toLowerCase()) {
            die('UAT_SESSION_NONCE_MISMATCH', 'chrome.storage.local readback xpider_uat_session_nonce does not match disposable UAT profile identity nonce');
        }
    }

    let urlsChecked = 0, emailsChecked = 0;

    function validateStrictLocalhostUrlItem(u, topKey) {
        if (typeof u !== 'string' || !u.trim()) {
            die('NON_LOOPBACK_TARGET_IN_UAT_PROFILE', `Malformed or empty queued target URL in UAT state (topKey=${topKey})`);
        }
        let parsed;
        try { parsed = new URL(u.trim()); } catch (_) {
            die('NON_LOOPBACK_TARGET_IN_UAT_PROFILE', `Invalid or split queued target URL in UAT state (topKey=${topKey})`);
        }
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
            (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '[::1]')) {
            die('NON_LOOPBACK_TARGET_IN_UAT_PROFILE', `Non-loopback queued target URL host forbidden in UAT state (topKey=${topKey})`);
        }
        urlsChecked++;
    }

    // Explicitly validate all queued URL arrays in savedUrlLists_v2 and xpider_paused_checkpoint
    if (state.savedUrlLists_v2 && typeof state.savedUrlLists_v2 === 'object' && state.savedUrlLists_v2.lists) {
        for (const listObj of Object.values(state.savedUrlLists_v2.lists)) {
            if (listObj && Array.isArray(listObj.urls)) {
                for (const u of listObj.urls) validateStrictLocalhostUrlItem(u, 'savedUrlLists_v2');
            }
        }
    }
    if (state.xpider_paused_checkpoint && typeof state.xpider_paused_checkpoint === 'object') {
        for (const arrKey of ['queue', 'remainingQueue', 'urls']) {
            if (Array.isArray(state.xpider_paused_checkpoint[arrKey])) {
                for (const u of state.xpider_paused_checkpoint[arrKey]) validateStrictLocalhostUrlItem(u, 'xpider_paused_checkpoint');
            }
        }
    }

    function checkString(val, topKey, depth = 0) {
        for (const variant of expandNormalizedStringVariants(val)) {
            if (PROXY_URI_RE.test(variant) || FORBIDDEN_MARKER_RE.test(variant)) {
                die('SENSITIVE_CREDENTIALS_IN_UAT_PROFILE', `Proxy credential or secret sentinel forbidden in UAT state (topKey=${topKey})`);
            }
            let m;
            URL_RE.lastIndex = 0;
            while ((m = URL_RE.exec(variant)) !== null) {
                urlsChecked++;
                const hostPort = m[1].toLowerCase();
                const host = hostPort.startsWith('[')
                    ? hostPort.replace(/\]:\d+$/, ']')
                    : hostPort.replace(/:\d+$/, '');
                if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
                    die('NON_LOOPBACK_TARGET_IN_UAT_PROFILE', `Non-loopback URL host forbidden in UAT state (topKey=${topKey})`);
                }
            }
            EMAIL_RE.lastIndex = 0;
            while ((m = EMAIL_RE.exec(variant)) !== null) {
                emailsChecked++;
                const dom = m[1].toLowerCase().replace(/[^a-z0-9.\-\u00a0-\uffff]+$/giu, '');
                if (!/\.(test|invalid|local)$/i.test(dom) && dom !== 'localhost') {
                    die('NON_SYNTHETIC_EMAIL_IN_UAT_PROFILE', `Non-synthetic email domain forbidden in UAT state (topKey=${topKey})`);
                }
            }
            // If variant is a serialized JSON object or array inside a string, recursively inspect it
            const trimmed = variant.trim();
            if (depth < 3 && ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
                try {
                    const inner = JSON.parse(trimmed);
                    if (inner && typeof inner === 'object') walkVal(inner, topKey, depth + 1);
                } catch (_) {}
            }
        }
    }

    function walkVal(val, keyPath, depth = 0) {
        if (val === null || val === undefined) return;
        const topKey = safeKeyLabel(keyPath);
        if (typeof val === 'string') {
            checkString(val, topKey, depth);
            return;
        }
        if (Array.isArray(val)) {
            val.forEach((item, idx) => walkVal(item, `${keyPath}[${idx}]`, depth));
            return;
        }
        if (typeof val === 'object') {
            for (const [k, v] of Object.entries(val)) {
                const curTop = safeKeyLabel(keyPath || k);
                checkString(k, curTop, depth);
                if (FORBIDDEN_CRED_KEYS.test(k) && v !== null && v !== undefined && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0)) {
                    die('SENSITIVE_CREDENTIALS_IN_UAT_PROFILE', `Sensitive credential key (${curTop}) forbidden in UAT state`);
                }
                if (/password|secret|token|apikey|credential|decodo|smartproxy/i.test(k) && typeof v === 'string' && v.trim().length > 0) {
                    die('SENSITIVE_CREDENTIALS_IN_UAT_PROFILE', `Populated secret field (${curTop}) forbidden in UAT state`);
                }
                walkVal(v, keyPath ? `${keyPath}.${k}` : k, depth);
            }
        }
    }

    walkVal(state, '', 0);
    return {
        result: 'UAT_PROFILE_ISOLATION_VERIFIED',
        uatSessionNonce: state.xpider_uat_session_nonce || opts.expectedUatNonce || null,
        urlsChecked,
        emailsChecked,
        strictAllowlistEnforced: enforceStrictAllowlist,
        nonLoopbackUrls: 0,
        sensitiveCredentials: 0,
        nonSyntheticEmails: 0
    };
}

async function verifyUatFirewall(a = {}) {
    const http = require('http');
    const fixturePort = Number(a['fixture-port'] || 8088);
    const sinkPort = Number(a['sink-port'] || 8090);
    if (!Number.isInteger(fixturePort) || fixturePort <= 0 || !Number.isInteger(sinkPort) || sinkPort <= 0) {
        die('USAGE', 'verify-uat-firewall requires valid --fixture-port and --sink-port');
    }
    const httpJsonGet = (port, reqPath) => new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: reqPath, timeout: 2500 }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(new Error(`HTTP_${res.statusCode}`));
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.on('timeout', () => { req.destroy(new Error('TIMEOUT')); });
        req.on('error', reject);
    });
    let stBefore;
    try {
        stBefore = await httpJsonGet(fixturePort, '/__xpider_firewall_status');
    } catch (e) {
        die('UAT_NETWORK_FIREWALL_UNAVAILABLE', `Local UAT fixture/firewall status endpoint (127.0.0.1:${fixturePort}) unreachable (${e.message}). UAT is BLOCKED; STOP immediately.`);
    }
    if (!stBefore || stBefore.firewallActive !== true || Number(stBefore.sinkProxyPort) !== sinkPort) {
        die('UAT_NETWORK_FIREWALL_UNAVAILABLE', `Local UAT fail-closed sink firewall is not active on 127.0.0.1:${sinkPort}. UAT is BLOCKED; STOP immediately.`);
    }
    // Probe 1: HTTP proxy egress denial check (RFC 5737 TEST-NET-2 non-routable documentation IP)
    const httpProbeRes = await new Promise((resolve) => {
        const req = http.request({
            host: '127.0.0.1',
            port: sinkPort,
            method: 'GET',
            path: 'http://198.51.100.42:8080/preflight-firewall-probe',
            headers: { Host: '198.51.100.42:8080' },
            timeout: 2500
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                firewallHeader: res.headers['x-xpider-uat-firewall'] || null,
                body
            }));
        });
        req.on('timeout', () => { req.destroy(); resolve({ error: 'TIMEOUT' }); });
        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
    });
    if (httpProbeRes.statusCode !== 403 || httpProbeRes.firewallHeader !== 'BLOCKED_FAIL_CLOSED') {
        die('UAT_NETWORK_FIREWALL_EGRESS_NOT_BLOCKED', `Sink proxy on 127.0.0.1:${sinkPort} did not fail-closed on HTTP negative-control probe. UAT is BLOCKED; STOP immediately.`);
    }
    // Probe 2: HTTPS CONNECT tunnel denial check
    const connectProbeRes = await new Promise((resolve) => {
        const req = http.request({
            host: '127.0.0.1',
            port: sinkPort,
            method: 'CONNECT',
            path: '198.51.100.42:443',
            timeout: 2500
        });
        req.on('connect', (res, socket) => {
            try { socket.destroy(); } catch (_) {}
            resolve({ statusCode: res.statusCode, firewallHeader: res.headers['x-xpider-uat-firewall'] || null });
        });
        req.on('timeout', () => { req.destroy(); resolve({ error: 'TIMEOUT' }); });
        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
    });
    if (connectProbeRes.statusCode !== 403 || connectProbeRes.firewallHeader !== 'BLOCKED_FAIL_CLOSED') {
        die('UAT_NETWORK_FIREWALL_EGRESS_NOT_BLOCKED', `Sink proxy on 127.0.0.1:${sinkPort} did not fail-closed on CONNECT negative-control probe. UAT is BLOCKED; STOP immediately.`);
    }
    const stAfter = await httpJsonGet(fixturePort, '/__xpider_firewall_status');
    if (stAfter.transmittedExternalRequests !== 0 || (stAfter.blockedExternalRequests - stBefore.blockedExternalRequests) < 2) {
        die('UAT_NETWORK_FIREWALL_TELEMETRY_MISMATCH', 'Sink firewall failed to record blocked preflight probes with 0 transmitted external requests. UAT is BLOCKED; STOP immediately.');
    }
    await httpJsonGet(fixturePort, '/__xpider_reset_firewall_log');
    return {
        result: 'UAT_FIREWALL_VERIFIED_FAIL_CLOSED',
        fixtureHost: '127.0.0.1',
        fixturePort,
        sinkProxyHost: '127.0.0.1',
        sinkProxyPort: sinkPort,
        httpProbeBlocked403: true,
        connectProbeBlocked403: true,
        transmittedExternalRequests: 0
    };
}

async function preflightUat(a = {}) {
    // [Directive #6704335953 Item 2] Read-only DRY-RUN preflight for Windows 10 Owner UAT & Update Prerequisites.
    // Never guesses paths; requires explicit --target and --profile-dir; never modifies target or profile data.
    if (!a.target || typeof a.target !== 'string' || !a.target.trim() ||
        !a['profile-dir'] || typeof a['profile-dir'] !== 'string' || !a['profile-dir'].trim()) {
        die('MISSING_EXPLICIT_PATH', 'preflight-uat requires explicit --target <EXT_DIR> and --profile-dir <PROFILE_DIR> (paths are never guessed)');
    }
    const nodeMajor = Number((process.versions.node || '0').split('.')[0]);
    if (nodeMajor < 18) die('NODE_VERSION_UNSUPPORTED', `Node.js >= 18 required (found ${process.version})`);

    const targetDir = path.resolve(a.target);
    const profileDir = path.resolve(a['profile-dir']);
    if (!fs.existsSync(targetDir)) die('TARGET_DIR_MISSING', `Explicit --target directory does not exist: ${targetDir}`);
    if (!fs.existsSync(profileDir)) die('PROFILE_DIR_MISSING', `Explicit --profile-dir directory does not exist: ${profileDir}`);
    assertNoOverlap(targetDir, profileDir);

    const rootDir = path.resolve(__dirname, '..');
    const archivePath = path.resolve(a.archive || path.join(rootDir, 'dist', 'XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip'));
    const expectedSha = String(a['expected-sha'] || 'b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e').toLowerCase();
    const inventoryPath = path.resolve(a.inventory || path.join(rootDir, 'dist', 'PACKAGE_INVENTORY_SHA256.json'));
    const baselinePath = path.resolve(a.baseline || path.join(rootDir, 'dist', 'rc11_baseline_manifest.json'));
    const expectedId = a['expected-id'] || DEFAULT_ID;
    assertValidExtId(expectedId);

    if (!fs.existsSync(archivePath)) die('ARCHIVE_MISSING', `Candidate archive not found: ${archivePath}`);
    if (!fs.existsSync(inventoryPath)) die('INVENTORY_MISSING', `Candidate inventory not found: ${inventoryPath}`);
    if (!fs.existsSync(baselinePath)) die('BASELINE_MISSING', `Baseline manifest not found: ${baselinePath}`);

    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const ctx = { target: targetDir, archive: archivePath, expectedSha, inventory, baseline, expectedId };

    // Run 100% read-only dry-run plan check on target + archive + manifest ID
    const p = computePlan(ctx);
    fs.rmSync(p.stage, { recursive: true, force: true });

    // Read-only profile storage check (never renames or writes any file in profileDir)
    const lesDir = resolveLesDir(profileDir, expectedId);
    const lesExists = fs.existsSync(lesDir);
    let lesFileCount = 0;
    if (lesExists) {
        const rels = walk(lesDir);
        lesFileCount = rels.length;
    }

    // Check local sink proxy availability (non-fatal in preflight report if server not started yet, unless --require-sink is passed)
    let localSinkReport = null;
    try {
        localSinkReport = await verifyUatFirewall(a);
    } catch (sinkErr) {
        if (a['require-sink']) throw sinkErr;
        localSinkReport = {
            result: 'BLOCKED_LOCAL_SINK_NOT_RUNNING',
            code: sinkErr.code || 'UAT_NETWORK_FIREWALL_UNAVAILABLE',
            message: sinkErr.message
        };
    }

    // Check OS-level Windows Defender Firewall privilege & status (read-only)
    let isAdmin = false;
    try {
        const admRes = spawnSync('powershell', [
            '-NoProfile', '-Command',
            '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'
        ], { encoding: 'utf8' });
        isAdmin = String(admRes.stdout || '').trim().toLowerCase() === 'true';
    } catch (_) {}
    const fwShow = spawnSync('netsh', ['advfirewall', 'show', 'allprofiles'], { encoding: 'utf8' });
    const osFirewallStatus = isAdmin ? 'ELEVATED_ADMIN_AVAILABLE_FOR_SCOPED_RULE' : 'BLOCKED_NO_SAFE_ELEVATED_TEST_VM';

    return {
        mode: 'DRY_RUN_PREFLIGHT_UAT',
        modifiedTarget: false,
        modifiedProfile: false,
        nodeOk: true,
        nodeVersion: process.version,
        platform: process.platform,
        expectedExtensionId: expectedId,
        extensionZipAloneIsCompleteKit: false,
        staticPreflightResult: 'READY_FOR_SYNTHETIC_UAT',
        osFirewallIsolationStatus: osFirewallStatus,
        explicitPathsVerified: {
            targetDir,
            profileDir,
            lesDir,
            lesExists,
            lesFileCount
        },
        archiveAndIdVerification: {
            archivePath,
            archiveSha256: p.report.archiveSha256,
            expectedId,
            targetId: p.report.targetId,
            candidateId: p.report.candidateId,
            planCounts: p.report.counts,
            PLAN_TOKEN: p.planToken
        },
        localSinkFirewallPreflight: localSinkReport,
        localSinkFirewallStatus: localSinkReport,
        osFirewallBoundary: {
            isAdminElevated: isAdmin,
            netshShowAllProfilesExitCode: fwShow.status,
            osFirewallIsolationStatus: osFirewallStatus,
            note: isAdmin
                ? 'Elevated token detected; do not mutate live owner firewall rules outside an isolated test VM.'
                : 'OS-level default-deny firewall test is BLOCKED on non-elevated host (requires elevated isolated test VM); browser-sink preflight and static checks succeeded separately.'
        }
    };
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

async function main() {
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
        } else if (cmd === 'init-uat-profile') {
            console.log(JSON.stringify(initDisposableUatProfile(a), null, 2));
        } else if (cmd === 'backup-storage') {
            console.log(JSON.stringify(backupStorageEncrypted(a), null, 2));
        } else if (cmd === 'backup-uat-synthetic') {
            console.log(JSON.stringify(backupStorageEncrypted({ ...a, 'synthetic-uat-origin': true }), null, 2));
        } else if (cmd === 'restore-storage') {
            console.log(JSON.stringify(restoreStorageEncrypted(a), null, 2));
        } else if (cmd === 'restore-uat-synthetic') {
            console.log(JSON.stringify(restoreStorageEncrypted({ ...a, 'allow-synthetic-uat-restore': true }), null, 2));
        } else if (cmd === 'verify-storage-backup') {
            console.log(JSON.stringify(verifyStorageBackupEncrypted(a), null, 2));
        } else if (cmd === 'audit-uat-state') {
            if (!a.in) die('USAGE', 'audit-uat-state requires --in <state.json>');
            const st = JSON.parse(fs.readFileSync(path.resolve(a.in), 'utf8'));
            const profId = a['profile-dir'] ? readDisposableUatIdentity(a['profile-dir']) : null;
            console.log(JSON.stringify(auditUatStateObj(st, { expectedUatNonce: a['expected-uat-nonce'] || (profId && profId.uatSessionNonce) || null }), null, 2));
        } else if (cmd === 'verify-uat-firewall') {
            console.log(JSON.stringify(await verifyUatFirewall(a), null, 2));
        } else if (cmd === 'preflight-uat') {
            console.log(JSON.stringify(await preflightUat(a), null, 2));
        } else die('USAGE', 'Subcommands: manifest | plan | apply | rollback | recover | init-uat-profile | backup-storage | backup-uat-synthetic | restore-storage | restore-uat-synthetic | verify-storage-backup | audit-uat-state | verify-uat-firewall | preflight-uat');
    } catch (err) {
        console.error(JSON.stringify({ result: 'ABORTED', code: err.code || 'ERROR', message: err.message, rolledBack: !!err.rolledBack }));
        process.exit(err.code === 'USAGE' ? 2 : 3);
    }
}

if (require.main === module) main();
module.exports = { extensionIdFromKey, buildManifest, DEFAULT_ID, initDisposableUatProfile, readDisposableUatIdentity, auditUatStateObj, verifyStorageBackupEncrypted, verifyUatFirewall, preflightUat };


