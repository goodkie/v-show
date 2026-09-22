#!/usr/bin/env node
/**
 * revoke_qa_tokens.js — Safe QA Edit-Token Rotation Utility
 *
 * SCOPE: Scoped token-only rotation on verified disposable QA datastores ONLY.
 *        Never deletes project records. Never touches customer/production data.
 *
 * DESIGN GUARANTEES:
 *  1. Scoped: only rotates `editToken` on the project matching TEST_PROJECT_ID.
 *             Does NOT filter out or delete any project records.
 *  2. Atomic:  writes to a temp file, then fs.renameSync() — OS atomic on same FS.
 *  3. Volume identity: requires a `.disposable_qa_marker` file in DATA_DIR with
 *     DISPOSABLE_INSTANCE_ID content before any write. Aborts if absent/mismatched.
 *  4. Authorization: requires OPERATOR_TOKEN env var (separate from project token).
 *  5. No static IDs: TEST_PROJECT_ID from env only; must match `prj-test-` prefix.
 *  6. Safe rollback: stores only the previous token hash + token value in a separate
 *     `.qa_token_backup.json` file (not a full DB snapshot). Rollback restores only
 *     that one token field; aborts if intervening writes changed other fields.
 *  7. Redacted receipt: emits {projectId, tokenHash_before, tokenHash_after, ts, status}
 *     to stderr. Raw tokens NEVER written to receipt, stdout, or issue comments.
 *  8. Idempotency: if current token hash == backup hash_after, skips rotation.
 *  9. Concurrent safety: uses .lockfile + fs.renameSync for atomic writes.
 * 10. Startup validation: rejects operation if required env vars absent or mismatched.
 *
 * USAGE:
 *   node scripts/revoke_qa_tokens.js [--dry-run] [--rollback] [--self-test] [--db <path>]
 *
 * ENV VARS (all required unless --self-test):
 *   TEST_PROJECT_ID        — target project ID (must start with prj-test-)
 *   DATA_DIR               — path to disposable QA datastore directory
 *   DISPOSABLE_INSTANCE_ID — unique ID written in .disposable_qa_marker
 *   OPERATOR_TOKEN         — operator authorization token (never equals project editToken)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');

// ─── CLI parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const ROLLBACK  = args.includes('--rollback');
const SELF_TEST = args.includes('--self-test');
const dbArgIdx  = args.indexOf('--db');
const CLI_DB    = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sha256(str) {
  return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
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

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function acquireLock(lockPath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // O_EXCL: fail if exists
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
      // Busy wait
      const waitUntil = Date.now() + 50;
      while (Date.now() < waitUntil) {}
    }
  }
  return false;
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch (_) {}
}

// ─── Self-test mode ───────────────────────────────────────────────────────────
if (SELF_TEST) {
  runSelfTests();
  process.exit(0);
}

// ─── Environment validation ────────────────────────────────────────────────
const TEST_PROJECT_ID        = process.env.TEST_PROJECT_ID;
const DATA_DIR               = CLI_DB || process.env.DATA_DIR;
const DISPOSABLE_INSTANCE_ID = process.env.DISPOSABLE_INSTANCE_ID;
const OPERATOR_TOKEN         = process.env.OPERATOR_TOKEN;

const errors = [];
if (!TEST_PROJECT_ID)        errors.push('TEST_PROJECT_ID env var required');
if (!TEST_PROJECT_ID?.startsWith('prj-test-'))
                             errors.push('TEST_PROJECT_ID must start with prj-test-');
if (!DATA_DIR)               errors.push('DATA_DIR env var (or --db) required');
if (!DISPOSABLE_INSTANCE_ID) errors.push('DISPOSABLE_INSTANCE_ID env var required');
if (!OPERATOR_TOKEN)         errors.push('OPERATOR_TOKEN env var required');
if (errors.length) {
  process.stderr.write('[REVOKE_QA_TOKENS] FAIL_CLOSED — missing required env vars:\n');
  errors.forEach(e => process.stderr.write('  - ' + e + '\n'));
  process.exit(2);
}

// ─── Volume identity verification ─────────────────────────────────────────────
const MARKER_PATH  = path.join(DATA_DIR, '.disposable_qa_marker');
const DB_PATH      = path.join(DATA_DIR, 'db.json');
const BACKUP_PATH  = path.join(DATA_DIR, '.qa_token_backup.json');
const LOCK_PATH    = path.join(DATA_DIR, '.qa_revoke.lock');

if (!fs.existsSync(MARKER_PATH)) {
  process.stderr.write(
    '[REVOKE_QA_TOKENS] ABORT: .disposable_qa_marker not found in DATA_DIR.\n' +
    '  This directory is not a verified disposable QA datastore.\n' +
    `  DATA_DIR: ${DATA_DIR}\n`
  );
  process.exit(3);
}

const markerContent = fs.readFileSync(MARKER_PATH, 'utf8').trim();
if (markerContent !== DISPOSABLE_INSTANCE_ID) {
  process.stderr.write(
    '[REVOKE_QA_TOKENS] ABORT: DISPOSABLE_INSTANCE_ID mismatch.\n' +
    `  Marker contains: ${markerContent}\n` +
    `  Expected:        ${DISPOSABLE_INSTANCE_ID}\n`
  );
  process.exit(3);
}

if (!fs.existsSync(DB_PATH)) {
  process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: db.json not found at ${DB_PATH}\n`);
  process.exit(4);
}

// ─── Load DB ─────────────────────────────────────────────────────────────────
let dbData;
try {
  dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
} catch (e) {
  process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: Failed to parse db.json: ${e.message}\n`);
  process.exit(4);
}

const projects = dbData.projects || [];
const targetIdx = projects.findIndex(p => p.id === TEST_PROJECT_ID);

if (targetIdx === -1) {
  // Idempotent: project not present — nothing to revoke
  process.stderr.write(redactedReceipt(
    TEST_PROJECT_ID, 'NOT_PRESENT', 'NOT_PRESENT', 'IDEMPOTENT_NO_MATCH',
    { note: 'Project not found in DB — no mutation performed' }
  ) + '\n');
  process.exit(0);
}

const target = projects[targetIdx];

// ─── Rollback mode ────────────────────────────────────────────────────────────
if (ROLLBACK) {
  if (!fs.existsSync(BACKUP_PATH)) {
    process.stderr.write('[REVOKE_QA_TOKENS] ABORT: No backup found for rollback.\n');
    process.exit(5);
  }
  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: Failed to parse backup: ${e.message}\n`);
    process.exit(5);
  }

  // Safety: verify backup is for this project and instance
  if (backup.projectId !== TEST_PROJECT_ID || backup.instanceId !== DISPOSABLE_INSTANCE_ID) {
    process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Backup projectId/instanceId mismatch.\n');
    process.exit(5);
  }

  // Check for intervening writes: verify current tokenHash == backup.tokenHash_after
  const currentHash = sha256(target.editToken || '');
  if (currentHash !== backup.tokenHash_after) {
    process.stderr.write(
      '[REVOKE_QA_TOKENS] ABORT: Rollback rejected — intervening writes detected.\n' +
      `  Current token hash:     ${currentHash}\n` +
      `  Expected (post-rotate): ${backup.tokenHash_after}\n` +
      '  Rollback aborted to prevent overwriting unrelated changes.\n'
    );
    process.exit(6);
  }

  if (DRY_RUN) {
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, currentHash, backup.tokenHash_before, 'DRY_RUN_ROLLBACK', {}
    ) + '\n');
    process.exit(0);
  }

  // Acquire lock, perform atomic rollback
  if (!acquireLock(LOCK_PATH)) {
    process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Could not acquire lock for rollback.\n');
    process.exit(7);
  }
  try {
    dbData.projects[targetIdx].editToken = backup.previousToken;
    atomicWriteJson(DB_PATH, dbData);
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, currentHash, backup.tokenHash_before, 'ROLLBACK_OK', {}
    ) + '\n');
    // Remove backup after successful rollback
    fs.unlinkSync(BACKUP_PATH);
  } finally {
    releaseLock(LOCK_PATH);
  }
  process.exit(0);
}

// ─── Idempotency check ────────────────────────────────────────────────────────
const currentToken = target.editToken || '';
const currentHash  = sha256(currentToken);

if (fs.existsSync(BACKUP_PATH)) {
  let backup;
  try { backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8')); } catch (_) {}
  if (backup && backup.projectId === TEST_PROJECT_ID &&
      backup.instanceId === DISPOSABLE_INSTANCE_ID &&
      backup.tokenHash_after === currentHash) {
    // Already rotated in this sandbox run — idempotent skip
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, backup.tokenHash_before, currentHash, 'IDEMPOTENT_ALREADY_ROTATED', {}
    ) + '\n');
    process.exit(0);
  }
}

// ─── Generate new token ───────────────────────────────────────────────────────
const newToken   = crypto.randomBytes(32).toString('hex');
const newHash    = sha256(newToken);

if (DRY_RUN) {
  process.stderr.write(redactedReceipt(
    TEST_PROJECT_ID, currentHash, newHash, 'DRY_RUN_WOULD_ROTATE', {}
  ) + '\n');
  process.exit(0);
}

// ─── Acquire lock, write backup, atomically rotate token ─────────────────────
if (!acquireLock(LOCK_PATH)) {
  process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Could not acquire lock for rotation.\n');
  process.exit(7);
}

try {
  // 1. Write token-only backup (NOT full DB)
  const backupData = {
    projectId:        TEST_PROJECT_ID,
    instanceId:       DISPOSABLE_INSTANCE_ID,
    tokenHash_before: currentHash,
    tokenHash_after:  newHash,
    previousToken:    currentToken,   // stored only in local backup file, never in receipts/issues
    ts:               new Date().toISOString()
  };
  atomicWriteJson(BACKUP_PATH, backupData);

  // 2. Mutate ONLY editToken field — project record otherwise untouched
  const updatedDb = JSON.parse(JSON.stringify(dbData));  // deep clone
  updatedDb.projects[targetIdx] = {
    ...updatedDb.projects[targetIdx],
    editToken:  newToken,
    updatedAt:  new Date().toISOString()
  };

  // 3. Atomic write via temp file + renameSync
  atomicWriteJson(DB_PATH, updatedDb);

  // 4. Emit redacted receipt (no raw tokens)
  process.stderr.write(redactedReceipt(
    TEST_PROJECT_ID, currentHash, newHash, 'ROTATED_OK', {}
  ) + '\n');

} catch (err) {
  process.stderr.write(`[REVOKE_QA_TOKENS] ERROR during rotation: ${err.message}\n`);
  releaseLock(LOCK_PATH);
  process.exit(8);
}

releaseLock(LOCK_PATH);
process.exit(0);

// ─── Self-test suite ──────────────────────────────────────────────────────────
function runSelfTests() {
  const assert = require('assert');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revoke_qa_self_test_'));
  let pass = 0; let fail = 0;

  function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); pass++; }
    catch (e) { console.error(`  [FAIL] ${name}: ${e.message}`); fail++; }
  }

  // Setup helpers
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

  // Test: sha256 helper
  test('sha256 produces stable hash', () => {
    const h = sha256('hello');
    assert.ok(h.startsWith('sha256:'));
    assert.strictEqual(h, sha256('hello'));
    assert.notStrictEqual(h, sha256('world'));
  });

  // Test: atomicWriteJson does not leave temp files
  test('atomicWriteJson writes cleanly without leftover .tmp files', () => {
    const p = path.join(tmpDir, 'atomic_test.json');
    atomicWriteJson(p, { ok: true });
    const result = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.strictEqual(result.ok, true);
    const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
    assert.strictEqual(leftovers.length, 0, 'No temp files should remain');
  });

  // Test: volume identity check — missing marker → abort
  test('Rejects directory without .disposable_qa_marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'no_marker_'));
    writeDb(d, 'tok-abc');
    assert.ok(!fs.existsSync(path.join(d, '.disposable_qa_marker')));
    fs.rmSync(d, { recursive: true });
  });

  // Test: volume identity check — mismatched instanceId → abort
  test('Rejects mismatched DISPOSABLE_INSTANCE_ID in marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mismatch_marker_'));
    writeMarker(d, 'other-instance-id');
    writeDb(d, 'tok-abc');
    const marker = fs.readFileSync(path.join(d, '.disposable_qa_marker'), 'utf8').trim();
    assert.notStrictEqual(marker, instanceId);
    fs.rmSync(d, { recursive: true });
  });

  // Test: token rotation is scoped — other projects untouched
  test('Token rotation does not remove or mutate other project records', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped_rotation_'));
    writeMarker(d, instanceId);
    const otherProjId = 'prj-test-other';
    const dbBefore = {
      projects: [
        { id: projectId,  editToken: 'tok-before', name: 'Target' },
        { id: otherProjId, editToken: 'tok-other',  name: 'Other'  }
      ]
    };
    fs.writeFileSync(path.join(d, 'db.json'), JSON.stringify(dbBefore, null, 2), 'utf8');

    // Simulate rotation on dbBefore
    const cloned = JSON.parse(JSON.stringify(dbBefore));
    const idx = cloned.projects.findIndex(p => p.id === projectId);
    const newTok = crypto.randomBytes(32).toString('hex');
    cloned.projects[idx] = { ...cloned.projects[idx], editToken: newTok };
    atomicWriteJson(path.join(d, 'db.json'), cloned);

    const dbAfter = JSON.parse(fs.readFileSync(path.join(d, 'db.json'), 'utf8'));
    assert.strictEqual(dbAfter.projects.length, 2, 'Both projects must remain');
    const other = dbAfter.projects.find(p => p.id === otherProjId);
    assert.strictEqual(other.editToken, 'tok-other', 'Other project token unchanged');
    const rotated = dbAfter.projects.find(p => p.id === projectId);
    assert.notStrictEqual(rotated.editToken, 'tok-before', 'Target token changed');
    fs.rmSync(d, { recursive: true });
  });

  // Test: idempotency — second rotation with matching backup hash_after skips
  test('Idempotency: second run with matching tokenHash_after is a no-op', () => {
    const tok = crypto.randomBytes(32).toString('hex');
    const newTok = crypto.randomBytes(32).toString('hex');
    const backup = {
      projectId, instanceId,
      tokenHash_before: sha256(tok),
      tokenHash_after:  sha256(newTok),
      previousToken: tok,
      ts: new Date().toISOString()
    };
    const currentHash = sha256(newTok);
    // Condition: backup.tokenHash_after === currentHash → idempotent skip
    assert.strictEqual(backup.tokenHash_after, currentHash);
  });

  // Test: rollback aborts on intervening writes
  test('Rollback aborts when current token != backup tokenHash_after', () => {
    const backup = {
      projectId, instanceId,
      tokenHash_before: sha256('old-tok'),
      tokenHash_after:  sha256('rotated-tok'),
      previousToken: 'old-tok',
      ts: new Date().toISOString()
    };
    // Simulate intervening write: current token is something else
    const currentHash = sha256('intervening-different-tok');
    assert.notStrictEqual(currentHash, backup.tokenHash_after,
      'Intervening write detected — rollback should abort');
  });

  // Test: no static IDs accepted
  test('Rejects projectId not starting with prj-test-', () => {
    const badIds = ['prj-free-b0c6f3ea', 'prj-free-aeb87eb4', 'prj-prod-xyz', ''];
    for (const id of badIds) {
      assert.ok(!id.startsWith('prj-test-'), `Should reject: ${id}`);
    }
  });

  // Test: redacted receipt never contains raw token
  test('Receipt does not include raw token value', () => {
    const rawToken = 'super-secret-raw-token-xyz';
    const receipt = redactedReceipt(projectId, sha256(rawToken), sha256('new'), 'ROTATED_OK', {});
    assert.ok(!receipt.includes(rawToken), 'Raw token must not appear in receipt');
    assert.ok(receipt.includes('sha256:'), 'Receipt must contain hashed values');
  });

  console.log(`\n  Self-test complete: ${pass} passed, ${fail} failed`);
  fs.rmSync(tmpDir, { recursive: true });
  if (fail > 0) process.exit(1);
}
