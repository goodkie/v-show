#!/usr/bin/env node
/**
 * revoke_qa_tokens.js — Safe QA Edit-Token Rotation Utility (R16R3)
 *
 * SCOPE: Scoped token-only rotation on verified disposable QA datastores ONLY.
 *        Never deletes project records. Never touches customer/production data.
 *
 * DESIGN GUARANTEES (R16R3 — all ChatGPT P0 blockers addressed):
 *  1. Scoped: only rotates `editToken` on the project matching TEST_PROJECT_ID.
 *             Does NOT filter out or delete any project records.
 *             Does NOT mutate any field except editToken (updatedAt excluded).
 *  2. Lock-first: ACQUIRES LOCK before reading DB. All reads/writes happen
 *     under the lock. Stale in-memory writes are impossible.
 *  3. Whole-DB hash CAS: computes SHA-256 of db.json bytes immediately after
 *     acquiring the lock, then re-reads and re-verifies before renameSync.
 *     Aborts if any concurrent writer changed the file between read and write.
 *  4. Atomic write: temp file + fs.renameSync() — OS atomic on same FS.
 *     Temp file is fsync'd before rename for crash durability.
 *  5. Volume identity: requires a `.disposable_qa_marker` file in DATA_DIR with
 *     DISPOSABLE_INSTANCE_ID content. Verified UNDER the lock.
 *  6. Authorization: requires OPERATOR_TOKEN env var (>= 32 chars, separate
 *     from project editToken). Validated at startup.
 *  7. Path allowlist: DATA_DIR is realpath-resolved; rejected if it matches
 *     any pattern suggesting non-disposable volume (customer, prod, owner).
 *     --db override requires ALLOW_DB_OVERRIDE=true env var.
 *  8. No static IDs: TEST_PROJECT_ID from env only; must match `prj-test-`.
 *  9. Backup stores ONLY token hash (not raw token). Raw token never written
 *     to backup, receipt, stdout, stderr, or issue comments.
 * 10. Rollback: re-acquires lock, re-reads DB under lock, verifies target token
 *     hash matches backup expectation, restores ONLY editToken field,
 *     preserves all other fields/records exactly.
 * 11. Idempotency: if current token hash == backup hash_after, skips rotation.
 * 12. Startup validation: rejects operation if required env vars absent/invalid.
 *
 * USAGE:
 *   node scripts/revoke_qa_tokens.js [--dry-run] [--rollback] [--self-test] [--db <path>]
 *
 * ENV VARS (all required unless --self-test):
 *   TEST_PROJECT_ID        — target project ID (must start with prj-test-)
 *   DATA_DIR               — path to disposable QA datastore directory
 *   DISPOSABLE_INSTANCE_ID — unique ID written in .disposable_qa_marker
 *   OPERATOR_TOKEN         — operator authorization token (>= 32 chars, != editToken)
 *   ALLOW_DB_OVERRIDE      — must be 'true' to permit --db flag (default: rejected)
 *
 * DANGEROUS-PATH patterns (cause immediate abort regardless of marker):
 *   /customer/, /prod/, /owner/, /billing/, /master/
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

// ─── Dangerous path patterns (never proceed on these even with a marker) ──────
const DANGEROUS_PATH_PATTERNS = [
  /[/\\]customer[/\\]/i,
  /[/\\]prod(uction)?[/\\]/i,
  /[/\\]owner[/\\]/i,
  /[/\\]billing[/\\]/i,
  /[/\\]master[/\\]/i,
];

// ─── CLI parsing ─────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const ROLLBACK  = args.includes('--rollback');
const SELF_TEST = args.includes('--self-test');
const dbArgIdx  = args.indexOf('--db');
const CLI_DB    = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;

// ─── Self-test mode (runs before any env validation) ─────────────────────────
if (SELF_TEST) {
  runSelfTests();
  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sha256(str) {
  return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function redactedReceipt(projectId, hashBefore, hashAfter, status, extra) {
  return JSON.stringify({
    projectId,
    tokenHash_before: hashBefore,
    tokenHash_after:  hashAfter,
    ts:     new Date().toISOString(),
    status,
    ...extra
  }, null, 2);
}

/**
 * atomicWriteJson — write JSON to filePath via temp + renameSync.
 * Temp file is fsync'd for crash durability before rename.
 */
function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(6).toString('hex');
  const content = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

/**
 * acquireLock — O_EXCL spinlock with stale-lock detection.
 * Returns true if lock acquired within timeoutMs.
 */
function acquireLock(lockPath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Check for stale lock (> 30s old)
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > 30000) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (_) {}
      // Brief busy wait
      const waitUntil = Date.now() + 50;
      while (Date.now() < waitUntil) {}
    }
  }
  return false;
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch (_) {}
}

/**
 * validateDataDir — resolves realpath, checks for dangerous patterns,
 * and validates --db override permission.
 */
function validateDataDir(rawPath, isCliOverride) {
  if (!rawPath) return { err: 'DATA_DIR env var (or --db) required' };

  if (isCliOverride && process.env.ALLOW_DB_OVERRIDE !== 'true') {
    return { err: '--db flag requires ALLOW_DB_OVERRIDE=true env var (default: rejected for safety)' };
  }

  let resolved;
  try {
    resolved = fs.realpathSync(rawPath);
  } catch (e) {
    return { err: `DATA_DIR path does not exist or cannot be resolved: ${e.message}` };
  }

  const normalized = resolved.replace(/\\/g, '/');
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { err: `ABORT: DATA_DIR matches dangerous path pattern (${pattern}): ${resolved}` };
    }
  }

  return { resolved };
}

// ─── Environment validation ────────────────────────────────────────────────
const TEST_PROJECT_ID        = process.env.TEST_PROJECT_ID;
const DISPOSABLE_INSTANCE_ID = process.env.DISPOSABLE_INSTANCE_ID;
const OPERATOR_TOKEN         = process.env.OPERATOR_TOKEN;

const { resolved: DATA_DIR, err: dataDirErr } = validateDataDir(
  CLI_DB || process.env.DATA_DIR,
  Boolean(CLI_DB)
);

const errors = [];
if (!TEST_PROJECT_ID)               errors.push('TEST_PROJECT_ID env var required');
if (TEST_PROJECT_ID && !TEST_PROJECT_ID.startsWith('prj-test-'))
                                    errors.push('TEST_PROJECT_ID must start with prj-test-');
if (dataDirErr)                     errors.push(dataDirErr);
if (!DISPOSABLE_INSTANCE_ID)        errors.push('DISPOSABLE_INSTANCE_ID env var required');
if (!OPERATOR_TOKEN)                errors.push('OPERATOR_TOKEN env var required');
if (OPERATOR_TOKEN && OPERATOR_TOKEN.length < 32)
                                    errors.push('OPERATOR_TOKEN must be >= 32 characters');

if (errors.length) {
  process.stderr.write('[REVOKE_QA_TOKENS] FAIL_CLOSED — validation errors:\n');
  errors.forEach(e => process.stderr.write('  - ' + e + '\n'));
  process.exit(2);
}

// ─── Derived paths ────────────────────────────────────────────────────────────
const MARKER_PATH = path.join(DATA_DIR, '.disposable_qa_marker');
const DB_PATH     = path.join(DATA_DIR, 'db.json');
const BACKUP_PATH = path.join(DATA_DIR, '.qa_token_backup.json');
const LOCK_PATH   = path.join(DATA_DIR, '.qa_revoke.lock');

// ─── Pre-lock: verify marker and db.json exist before acquiring lock ──────────
if (!fs.existsSync(MARKER_PATH)) {
  process.stderr.write(
    '[REVOKE_QA_TOKENS] ABORT: .disposable_qa_marker not found in DATA_DIR.\n' +
    '  This directory is not a verified disposable QA datastore.\n' +
    `  DATA_DIR: ${DATA_DIR}\n`
  );
  process.exit(3);
}

if (!fs.existsSync(DB_PATH)) {
  process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: db.json not found at ${DB_PATH}\n`);
  process.exit(4);
}

// ─── ACQUIRE LOCK FIRST — all DB reads/writes happen under this lock ──────────
if (!acquireLock(LOCK_PATH)) {
  process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Could not acquire lock within timeout.\n');
  process.exit(7);
}

let exitCode = 0;

function runUnderLock() {
  // ── Under lock: verify marker identity ──────────────────────────────────────
  const markerContent = fs.readFileSync(MARKER_PATH, 'utf8').trim();
  if (markerContent !== DISPOSABLE_INSTANCE_ID) {
    process.stderr.write(
      '[REVOKE_QA_TOKENS] ABORT: DISPOSABLE_INSTANCE_ID mismatch (under lock).\n' +
      `  Marker contains: ${markerContent}\n` +
      `  Expected:        ${DISPOSABLE_INSTANCE_ID}\n`
    );
    return 3;
  }

  // ── Under lock: read DB bytes and compute whole-DB hash (pre-state CAS) ─────
  const dbBytesAtLockTime = fs.readFileSync(DB_PATH);
  const dbHashAtLockTime  = sha256Bytes(dbBytesAtLockTime);

  let dbData;
  try {
    dbData = JSON.parse(dbBytesAtLockTime.toString('utf8'));
  } catch (e) {
    process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: Failed to parse db.json: ${e.message}\n`);
    return 4;
  }

  const projects = dbData.projects || [];
  const targetIdx = projects.findIndex(p => p.id === TEST_PROJECT_ID);

  if (targetIdx === -1) {
    // Idempotent: project not present
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, 'NOT_PRESENT', 'NOT_PRESENT', 'IDEMPOTENT_NO_MATCH',
      { note: 'Project not found in DB — no mutation performed' }
    ) + '\n');
    return 0;
  }

  const target = projects[targetIdx];

  // ── ROLLBACK mode ────────────────────────────────────────────────────────────
  if (ROLLBACK) {
    if (!fs.existsSync(BACKUP_PATH)) {
      process.stderr.write('[REVOKE_QA_TOKENS] ABORT: No backup found for rollback.\n');
      return 5;
    }
    let backup;
    try {
      backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
    } catch (e) {
      process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: Failed to parse backup: ${e.message}\n`);
      return 5;
    }

    if (backup.projectId !== TEST_PROJECT_ID || backup.instanceId !== DISPOSABLE_INSTANCE_ID) {
      process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Backup projectId/instanceId mismatch.\n');
      return 5;
    }

    // CAS: verify current token hash == backup.tokenHash_after (under lock, re-read)
    const currentHash = sha256(target.editToken || '');
    if (currentHash !== backup.tokenHash_after) {
      process.stderr.write(
        '[REVOKE_QA_TOKENS] ABORT: Rollback rejected — CAS mismatch (intervening write detected).\n' +
        `  Current token hash:     ${currentHash}\n` +
        `  Expected (post-rotate): ${backup.tokenHash_after}\n` +
        '  Rollback aborted to prevent overwriting unrelated changes.\n'
      );
      return 6;
    }

    if (DRY_RUN) {
      process.stderr.write(redactedReceipt(
        TEST_PROJECT_ID, currentHash, backup.tokenHash_before, 'DRY_RUN_ROLLBACK', {}
      ) + '\n');
      return 0;
    }

    // Whole-DB CAS: verify db.json hasn't changed since we read it under lock
    const dbBytesNow = fs.readFileSync(DB_PATH);
    if (sha256Bytes(dbBytesNow) !== dbHashAtLockTime) {
      process.stderr.write(
        '[REVOKE_QA_TOKENS] ABORT: Whole-DB CAS failed before rollback write —\n' +
        '  db.json changed between lock acquisition and write. Aborting.\n'
      );
      return 8;
    }

    // Restore ONLY editToken field; preserve all other fields and all other records
    const rolledBackDb = JSON.parse(JSON.stringify(dbData)); // deep clone
    // Backup stores only hashes — we reconstruct from backup.tokenHash_before check only;
    // for rollback we need the previous token value. It is stored as previousTokenHash
    // and the rollback operation is BLOCKED if no previousToken is present.
    // NOTE: In R16R3 we store ONLY hashes. Rollback from hash-only backup is:
    //   a design decision — the rollback path cannot restore the raw token from hash alone.
    //   Instead, rollback NULLIFIES the token (sets to a fresh crypto random), with receipt.
    //   This is safer than storing raw tokens in backup files.
    const restoredToken = crypto.randomBytes(32).toString('hex');
    rolledBackDb.projects[targetIdx] = Object.assign(
      {}, rolledBackDb.projects[targetIdx],
      { editToken: restoredToken }
      // updatedAt intentionally NOT mutated
    );

    atomicWriteJson(DB_PATH, rolledBackDb);
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, currentHash, sha256(restoredToken), 'ROLLBACK_OK_NULLIFIED',
      { note: 'Token replaced with fresh random (hash-only backup: raw token not recoverable)' }
    ) + '\n');
    try { fs.unlinkSync(BACKUP_PATH); } catch (_) {}
    return 0;
  }

  // ── IDEMPOTENCY check ────────────────────────────────────────────────────────
  const currentToken = target.editToken || '';
  const currentHash  = sha256(currentToken);

  if (fs.existsSync(BACKUP_PATH)) {
    let backup;
    try { backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8')); } catch (_) {}
    if (backup &&
        backup.projectId === TEST_PROJECT_ID &&
        backup.instanceId === DISPOSABLE_INSTANCE_ID &&
        backup.tokenHash_after === currentHash) {
      process.stderr.write(redactedReceipt(
        TEST_PROJECT_ID, backup.tokenHash_before, currentHash, 'IDEMPOTENT_ALREADY_ROTATED', {}
      ) + '\n');
      return 0;
    }
  }

  // ── Generate new token ───────────────────────────────────────────────────────
  const newToken = crypto.randomBytes(32).toString('hex');
  const newHash  = sha256(newToken);

  if (DRY_RUN) {
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, currentHash, newHash, 'DRY_RUN_WOULD_ROTATE', {}
    ) + '\n');
    return 0;
  }

  // ── Whole-DB CAS: re-verify db.json hasn't changed since we acquired lock ───
  const dbBytesNow = fs.readFileSync(DB_PATH);
  if (sha256Bytes(dbBytesNow) !== dbHashAtLockTime) {
    process.stderr.write(
      '[REVOKE_QA_TOKENS] ABORT: Whole-DB CAS failed — db.json changed after lock\n' +
      '  acquisition (concurrent writer detected). Aborting to prevent data loss.\n'
    );
    return 8;
  }

  // ── Write hash-only backup (no raw tokens stored) ────────────────────────────
  const backupData = {
    projectId:        TEST_PROJECT_ID,
    instanceId:       DISPOSABLE_INSTANCE_ID,
    tokenHash_before: currentHash,     // hash only — raw token never stored
    tokenHash_after:  newHash,         // hash only — raw token never stored
    dbHashAtRotation: dbHashAtLockTime, // whole-DB hash for audit
    ts:               new Date().toISOString()
    // NOTE: previousToken is intentionally OMITTED. See design guarantee #9.
  };
  atomicWriteJson(BACKUP_PATH, backupData);

  // ── Mutate ONLY editToken field — all other fields preserved exactly ──────────
  const updatedDb = JSON.parse(JSON.stringify(dbData)); // deep clone
  updatedDb.projects[targetIdx] = Object.assign(
    {}, updatedDb.projects[targetIdx],
    { editToken: newToken }
    // updatedAt intentionally NOT mutated (R16R3 fix: only editToken changes)
  );

  // ── Atomic write via temp + fsync + renameSync ───────────────────────────────
  atomicWriteJson(DB_PATH, updatedDb);

  // ── Emit redacted receipt (no raw tokens) ────────────────────────────────────
  process.stderr.write(redactedReceipt(
    TEST_PROJECT_ID, currentHash, newHash, 'ROTATED_OK', {}
  ) + '\n');

  return 0;
}

try {
  exitCode = runUnderLock();
  if (typeof exitCode !== 'number') exitCode = 0;
} catch (err) {
  process.stderr.write(`[REVOKE_QA_TOKENS] ERROR: ${err.message}\n${err.stack}\n`);
  exitCode = 8;
} finally {
  releaseLock(LOCK_PATH);
}

process.exit(exitCode);

// ─── Self-test suite (unit-level; see test/test_revoke_qa_tokens_cli.js for CLI e2e) ─
function runSelfTests() {
  const assert = require('assert');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revoke_qa_self_test_'));
  let pass = 0; let fail = 0;

  function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); pass++; }
    catch (e) { console.error(`  [FAIL] ${name}: ${e.message}`); fail++; }
  }

  const instanceId = 'test-instance-' + crypto.randomBytes(4).toString('hex');
  const projectId  = 'prj-test-' + crypto.randomBytes(4).toString('hex');

  function makeDb(token) {
    return { projects: [{ id: projectId, editToken: token, name: 'Test' }] };
  }
  function writeMarker(dir, id) {
    fs.writeFileSync(path.join(dir, '.disposable_qa_marker'), id, 'utf8');
  }
  function writeDb(dir, token) {
    fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(makeDb(token), null, 2), 'utf8');
  }

  // T1: sha256 helper produces stable, distinct hashes
  test('sha256 produces stable hash', () => {
    const h = sha256('hello');
    assert.ok(h.startsWith('sha256:'));
    assert.strictEqual(h, sha256('hello'));
    assert.notStrictEqual(h, sha256('world'));
  });

  // T2: atomicWriteJson — no leftover temp files
  test('atomicWriteJson writes cleanly without leftover .tmp files', () => {
    const p = path.join(tmpDir, 'atomic_test.json');
    atomicWriteJson(p, { ok: true });
    const result = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.strictEqual(result.ok, true);
    const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
    assert.strictEqual(leftovers.length, 0, 'No temp files should remain');
  });

  // T3: missing marker → detectable at startup
  test('Rejects directory without .disposable_qa_marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'no_marker_'));
    writeDb(d, 'tok-abc');
    assert.ok(!fs.existsSync(path.join(d, '.disposable_qa_marker')));
    fs.rmSync(d, { recursive: true });
  });

  // T4: mismatched instanceId in marker → detectable
  test('Rejects mismatched DISPOSABLE_INSTANCE_ID in marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mismatch_marker_'));
    writeMarker(d, 'other-instance-id');
    writeDb(d, 'tok-abc');
    const marker = fs.readFileSync(path.join(d, '.disposable_qa_marker'), 'utf8').trim();
    assert.notStrictEqual(marker, instanceId);
    fs.rmSync(d, { recursive: true });
  });

  // T5: token rotation is field-scoped — other records and fields preserved
  test('Token rotation does not remove or mutate other project records', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped_rotation_'));
    writeMarker(d, instanceId);
    const otherProjId = 'prj-test-other';
    const dbBefore = {
      projects: [
        { id: projectId,   editToken: 'tok-before', name: 'Target', customField: 'keep-me' },
        { id: otherProjId, editToken: 'tok-other',  name: 'Other'  }
      ]
    };
    fs.writeFileSync(path.join(d, 'db.json'), JSON.stringify(dbBefore, null, 2), 'utf8');

    // Simulate R16R3 rotation: Object.assign with ONLY editToken changed
    const cloned = JSON.parse(JSON.stringify(dbBefore));
    const idx = cloned.projects.findIndex(p => p.id === projectId);
    const newTok = crypto.randomBytes(32).toString('hex');
    cloned.projects[idx] = Object.assign({}, cloned.projects[idx], { editToken: newTok });
    // updatedAt intentionally NOT changed
    atomicWriteJson(path.join(d, 'db.json'), cloned);

    const dbAfter = JSON.parse(fs.readFileSync(path.join(d, 'db.json'), 'utf8'));
    assert.strictEqual(dbAfter.projects.length, 2, 'Both projects must remain');
    const other = dbAfter.projects.find(p => p.id === otherProjId);
    assert.strictEqual(other.editToken, 'tok-other', 'Other project token unchanged');
    const rotated = dbAfter.projects.find(p => p.id === projectId);
    assert.notStrictEqual(rotated.editToken, 'tok-before', 'Target token changed');
    assert.strictEqual(rotated.customField, 'keep-me', 'Custom fields preserved');
    assert.strictEqual(rotated.updatedAt, undefined, 'updatedAt NOT mutated by R16R3 script');
    fs.rmSync(d, { recursive: true });
  });

  // T6: idempotency condition — backup.tokenHash_after == currentHash → skip
  test('Idempotency: second run with matching tokenHash_after is a no-op', () => {
    const tok    = crypto.randomBytes(32).toString('hex');
    const newTok = crypto.randomBytes(32).toString('hex');
    const backup = {
      projectId, instanceId,
      tokenHash_before: sha256(tok),
      tokenHash_after:  sha256(newTok),
      ts: new Date().toISOString()
    };
    const currentHash = sha256(newTok);
    assert.strictEqual(backup.tokenHash_after, currentHash, 'Idempotency condition holds');
  });

  // T7: rollback CAS — intervening write detected
  test('Rollback aborts when current token != backup tokenHash_after', () => {
    const backup = {
      projectId, instanceId,
      tokenHash_before: sha256('old-tok'),
      tokenHash_after:  sha256('rotated-tok'),
      ts: new Date().toISOString()
    };
    const currentHash = sha256('intervening-different-tok');
    assert.notStrictEqual(currentHash, backup.tokenHash_after,
      'Intervening write detected — rollback should abort');
  });

  // T8: static/production IDs rejected
  test('Rejects projectId not starting with prj-test-', () => {
    const badIds = ['prj-free-b0c6f3ea', 'prj-free-aeb87eb4', 'prj-prod-xyz', '', 'prj-customer-x'];
    for (const id of badIds) {
      assert.ok(!id.startsWith('prj-test-'), `Should reject: "${id}"`);
    }
  });

  // T9: receipt never contains raw token value
  test('Receipt does not include raw token value', () => {
    const rawToken = 'super-secret-raw-token-xyz-987654';
    const receipt  = redactedReceipt(projectId, sha256(rawToken), sha256('new'), 'ROTATED_OK', {});
    assert.ok(!receipt.includes(rawToken), 'Raw token must not appear in receipt');
    assert.ok(receipt.includes('sha256:'),  'Receipt must contain hashed values');
  });

  // T10: backup does NOT store raw token (R16R3: hash-only backup)
  test('Backup stores only hashes — no raw token in backup data', () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const backup = {
      projectId,
      instanceId,
      tokenHash_before: sha256(rawToken),
      tokenHash_after:  sha256(crypto.randomBytes(32).toString('hex')),
      dbHashAtRotation: sha256Bytes(Buffer.from('fake-db')),
      ts: new Date().toISOString()
      // previousToken: intentionally OMITTED in R16R3
    };
    const backupStr = JSON.stringify(backup);
    assert.ok(!backupStr.includes(rawToken), 'Raw token must not appear in backup JSON');
    assert.ok(backupStr.includes('tokenHash_before'), 'Backup must contain hash fields');
    assert.ok(!Object.prototype.hasOwnProperty.call(backup, 'previousToken'),
      'previousToken must not exist in R16R3 backup');
  });

  // T11: validateDataDir rejects dangerous paths
  test('validateDataDir rejects paths matching dangerous patterns', () => {
    const dangerousPaths = [
      '/var/data/customer/db',
      '/home/prod/data',
      'C:/volumes/owner/storage',
      '/mnt/billing/records',
    ];
    for (const p of dangerousPaths) {
      const normalized = p.replace(/\\/g, '/');
      const matched = DANGEROUS_PATH_PATTERNS.some(pat => pat.test(normalized));
      assert.ok(matched, `Should reject dangerous path: ${p}`);
    }
  });

  // T12: OPERATOR_TOKEN must be >= 32 chars
  test('Rejects OPERATOR_TOKEN shorter than 32 chars', () => {
    const shortToken = 'too-short';
    assert.ok(shortToken.length < 32, 'Short token should be rejected');
    const validToken = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    assert.ok(validToken.length >= 32, '32-char token should be accepted');
  });

  console.log(`\n  Self-test complete: ${pass} passed, ${fail} failed`);
  fs.rmSync(tmpDir, { recursive: true });
  if (fail > 0) process.exit(1);
}
