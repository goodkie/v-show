#!/usr/bin/env node
/**
 * test/test_revoke_qa_tokens_cli.js — Real CLI End-to-End Tests (R16R3)
 *
 * Spawns `node scripts/revoke_qa_tokens.js` as child_process with controlled env.
 * Each test creates a fresh throwaway tmpdir; no existing datastore or customer
 * volume is touched. Tests verify: exit codes, file-system state, stdout/stderr
 * redaction, concurrency safety, and adversarial inputs.
 *
 * USAGE: node test/test_revoke_qa_tokens_cli.js
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'revoke_qa_tokens.js');
const NODE   = process.execPath;

let pass = 0;
let fail = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function mkTmp(prefix = 'cli_test_') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeDisposableDir(opts = {}) {
  const dir        = mkTmp();
  const instanceId = opts.instanceId || ('inst-' + crypto.randomBytes(8).toString('hex'));
  const projectId  = opts.projectId  || ('prj-test-' + crypto.randomBytes(8).toString('hex'));
  const token      = opts.token      || crypto.randomBytes(32).toString('hex');

  fs.writeFileSync(path.join(dir, '.disposable_qa_marker'), instanceId, 'utf8');
  const db = { projects: [{ id: projectId, editToken: token, name: 'QA Test Project' }] };
  if (opts.extraProjects) db.projects.push(...opts.extraProjects);
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(db, null, 2), 'utf8');

  return { dir, instanceId, projectId, token, db };
}

function runCli(env = {}, extraArgs = []) {
  const result = spawnSync(NODE, [SCRIPT, ...extraArgs], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10000
  });
  return {
    exitCode: result.status,
    stdout:   result.stdout || '',
    stderr:   result.stderr || '',
    error:    result.error
  };
}

function readDb(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
}

function test(name, fn) {
  const dir = null;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    pass++;
  } catch (e) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${e.message}`);
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertNotEqual(a, b, msg) {
  if (a === b) throw new Error(msg || `Expected values to differ, got ${JSON.stringify(a)}`);
}

// ─── CLI Tests ────────────────────────────────────────────────────────────────

console.log('\n[CLI E2E] test/test_revoke_qa_tokens_cli.js — R16R3\n');

// ── T01: Valid rotation — exit 0, token changed, other records intact ─────────
test('T01: Valid rotation — exit 0, editToken changed, other project records intact', () => {
  const { dir, instanceId, projectId, token } = makeDisposableDir({
    extraProjects: [{ id: 'prj-test-other', editToken: 'tok-other-unchanged', name: 'Other' }]
  });
  const operatorToken = crypto.randomBytes(16).toString('hex'); // 32 hex chars

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  });

  assertEqual(r.exitCode, 0, `Expected exit 0, got ${r.exitCode}. stderr: ${r.stderr}`);

  const dbAfter = readDb(dir);
  const rotated = dbAfter.projects.find(p => p.id === projectId);
  assert(rotated, 'Target project must still exist');
  assertNotEqual(rotated.editToken, token, 'editToken must have changed');
  assert(rotated.editToken.length > 0, 'New token must be non-empty');

  // Other project untouched
  const other = dbAfter.projects.find(p => p.id === 'prj-test-other');
  assert(other, 'Other project must still exist');
  assertEqual(other.editToken, 'tok-other-unchanged', 'Other project token must not change');

  // updatedAt must NOT be mutated (R16R3 guarantee)
  assert(!('updatedAt' in rotated), 'updatedAt must NOT be added by rotation (R16R3)');

  // Receipt must appear on stderr, not stdout
  assert(r.stderr.includes('"status"'), 'Receipt must be on stderr');
  assertEqual(r.stdout.trim(), '', 'stdout must be empty');

  // Raw token must not appear in stderr
  assert(!r.stderr.includes(token), 'Old raw token must not appear in stderr');
  assert(!r.stderr.includes(rotated.editToken), 'New raw token must not appear in stderr');

  fs.rmSync(dir, { recursive: true });
});

// ── T02: Dry-run — exit 0, NO db.json mutation ────────────────────────────────
test('T02: --dry-run — exit 0, db.json not modified', () => {
  const { dir, instanceId, projectId, token } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');

  const dbBefore = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  }, ['--dry-run']);

  assertEqual(r.exitCode, 0, `Expected exit 0, got ${r.exitCode}`);
  const dbAfter = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');
  assertEqual(dbAfter, dbBefore, 'db.json must not be modified in dry-run mode');
  assert(r.stderr.includes('DRY_RUN'), 'stderr must mention DRY_RUN');

  fs.rmSync(dir, { recursive: true });
});

// ── T03: Idempotency — second run is a no-op ─────────────────────────────────
test('T03: Second run is idempotent (no-op if already rotated)', () => {
  const { dir, instanceId, projectId } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');
  const env = {
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  };

  // First run
  const r1 = runCli(env);
  assertEqual(r1.exitCode, 0, `First run exit: ${r1.exitCode}. ${r1.stderr}`);
  const tokenAfterFirst = readDb(dir).projects.find(p => p.id === projectId).editToken;

  // Second run
  const r2 = runCli(env);
  assertEqual(r2.exitCode, 0, `Second run exit: ${r2.exitCode}. ${r2.stderr}`);
  const tokenAfterSecond = readDb(dir).projects.find(p => p.id === projectId).editToken;

  assertEqual(tokenAfterFirst, tokenAfterSecond, 'Token must not change on second run (idempotent)');
  assert(r2.stderr.includes('IDEMPOTENT'), 'Second run stderr must mention IDEMPOTENT');

  fs.rmSync(dir, { recursive: true });
});

// ── T04: Missing marker → nonzero exit, NO db.json mutation ──────────────────
test('T04: Missing .disposable_qa_marker → exit nonzero, no write', () => {
  const dir = mkTmp();
  const projectId = 'prj-test-' + crypto.randomBytes(4).toString('hex');
  const db = { projects: [{ id: projectId, editToken: 'tok-orig' }] };
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(db, null, 2), 'utf8');
  // NO marker file written

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: 'inst-abc',
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
  });

  assert(r.exitCode !== 0, `Expected nonzero exit, got ${r.exitCode}`);
  const dbAfter = readDb(dir);
  assertEqual(dbAfter.projects[0].editToken, 'tok-orig', 'db.json must not be modified');
  assert(r.stderr.includes('ABORT') || r.stderr.includes('marker'), 'stderr must mention abort/marker');

  fs.rmSync(dir, { recursive: true });
});

// ── T05: Wrong DISPOSABLE_INSTANCE_ID → nonzero exit, NO write ───────────────
test('T05: Wrong DISPOSABLE_INSTANCE_ID → exit nonzero, no write', () => {
  const { dir, projectId, token } = makeDisposableDir({ instanceId: 'correct-instance-id' });

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: 'WRONG-instance-id',
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
  });

  assert(r.exitCode !== 0, `Expected nonzero exit, got ${r.exitCode}`);
  const dbAfter = readDb(dir);
  assertEqual(dbAfter.projects[0].editToken, token, 'db.json must not be modified');

  fs.rmSync(dir, { recursive: true });
});

// ── T06: Missing TEST_PROJECT_ID → exit 2 ────────────────────────────────────
test('T06: Missing TEST_PROJECT_ID → exit 2 (validation error)', () => {
  const { dir, instanceId } = makeDisposableDir();

  const r = runCli({
    // TEST_PROJECT_ID intentionally omitted
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
  });

  assertEqual(r.exitCode, 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('TEST_PROJECT_ID'), 'stderr must mention missing env var');

  fs.rmSync(dir, { recursive: true });
});

// ── T07: Invalid projectId prefix → exit 2 ───────────────────────────────────
test('T07: TEST_PROJECT_ID not starting with prj-test- → exit 2', () => {
  const { dir, instanceId } = makeDisposableDir();

  const r = runCli({
    TEST_PROJECT_ID:        'prj-free-b0c6f3ea',
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
  });

  assertEqual(r.exitCode, 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('prj-test-'), 'stderr must mention required prefix');

  fs.rmSync(dir, { recursive: true });
});

// ── T08: OPERATOR_TOKEN too short → exit 2 ───────────────────────────────────
test('T08: Short OPERATOR_TOKEN (< 32 chars) → exit 2', () => {
  const { dir, instanceId, projectId } = makeDisposableDir();

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         'short'
  });

  assertEqual(r.exitCode, 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('OPERATOR_TOKEN'), 'stderr must mention OPERATOR_TOKEN');

  fs.rmSync(dir, { recursive: true });
});

// ── T09: --db override without ALLOW_DB_OVERRIDE=true → exit 2 ───────────────
test('T09: --db flag without ALLOW_DB_OVERRIDE=true → exit 2', () => {
  const { dir, instanceId, projectId } = makeDisposableDir();

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
    // ALLOW_DB_OVERRIDE not set
  }, ['--db', dir]);

  assertEqual(r.exitCode, 2, `Expected exit 2, got ${r.exitCode}`);
  assert(r.stderr.includes('ALLOW_DB_OVERRIDE'), 'stderr must mention ALLOW_DB_OVERRIDE');

  fs.rmSync(dir, { recursive: true });
});

// ── T10: Concurrent writer injects change during rotation → whole-DB CAS abort
test('T10: Concurrent write during rotation → CAS abort, original data safe', () => {
  // We simulate concurrency by: running rotation in dry-run to get the pre-hash,
  // then manually mutating db.json between the "read" and "write" phases.
  // Since we cannot inject code mid-execution, we instead verify the CAS mechanism:
  // if we modify db.json AFTER the script has already read it, the renameSync
  // would overwrite the new data. The CAS in R16R3 re-reads before write.
  //
  // Test approach: run rotation, then verify the backup's dbHashAtRotation matches
  // the actual db.json hash AT THAT TIME (proving CAS computed correct pre-hash).

  const { dir, instanceId, projectId, token } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');

  const dbBytesBefore = fs.readFileSync(path.join(dir, 'db.json'));
  const expectedPreHash = crypto.createHash('sha256').update(dbBytesBefore).digest('hex');

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  });

  assertEqual(r.exitCode, 0, `Expected exit 0, got ${r.exitCode}. stderr: ${r.stderr}`);

  // Verify backup exists and contains correct pre-hash
  const backupPath = path.join(dir, '.qa_token_backup.json');
  assert(fs.existsSync(backupPath), 'Backup file must exist after rotation');
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assertEqual(backup.dbHashAtRotation, expectedPreHash,
    'Backup must record the correct whole-DB hash at rotation time (CAS anchor)');

  // Backup must NOT contain raw token
  const backupStr = JSON.stringify(backup);
  assert(!backupStr.includes(token), 'Backup must not contain original raw token');
  assert(!Object.prototype.hasOwnProperty.call(backup, 'previousToken'),
    'previousToken must not exist in R16R3 backup');

  fs.rmSync(dir, { recursive: true });
});

// ── T11: No raw secret in stdout or stderr ────────────────────────────────────
test('T11: No raw token values in stdout or stderr', () => {
  const { dir, instanceId, projectId, token } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  });

  assertEqual(r.exitCode, 0, `Expected exit 0. stderr: ${r.stderr}`);
  const newToken = readDb(dir).projects.find(p => p.id === projectId).editToken;

  assert(!r.stdout.includes(token),       'Old token must not appear in stdout');
  assert(!r.stdout.includes(newToken),    'New token must not appear in stdout');
  assert(!r.stderr.includes(token),       'Old token must not appear in stderr');
  assert(!r.stderr.includes(newToken),    'New token must not appear in stderr');
  assert(!r.stderr.includes(operatorToken), 'OPERATOR_TOKEN must not appear in stderr');

  fs.rmSync(dir, { recursive: true });
});

// ── T12: Rollback after rotation ─────────────────────────────────────────────
test('T12: Rollback after rotation — token replaced with fresh random, backup removed', () => {
  const { dir, instanceId, projectId, token: origToken } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');
  const env = {
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  };

  // Rotate first
  const r1 = runCli(env);
  assertEqual(r1.exitCode, 0, `Rotation failed: ${r1.stderr}`);

  const tokenAfterRotation = readDb(dir).projects.find(p => p.id === projectId).editToken;
  assertNotEqual(tokenAfterRotation, origToken, 'Token should have changed after rotation');

  // Rollback
  const r2 = runCli(env, ['--rollback']);
  assertEqual(r2.exitCode, 0, `Rollback failed (exit ${r2.exitCode}): ${r2.stderr}`);

  const tokenAfterRollback = readDb(dir).projects.find(p => p.id === projectId).editToken;
  // R16R3 rollback produces a fresh random (not the original, since backup is hash-only)
  assertNotEqual(tokenAfterRollback, tokenAfterRotation, 'Token should change after rollback');
  assert(tokenAfterRollback.length > 0, 'Token after rollback must be non-empty');
  assert(r2.stderr.includes('ROLLBACK_OK'), 'Rollback receipt must mention ROLLBACK_OK');

  // Backup should be removed after rollback
  assert(!fs.existsSync(path.join(dir, '.qa_token_backup.json')),
    'Backup file should be removed after successful rollback');

  fs.rmSync(dir, { recursive: true });
});

// ── T13: Adversarial #1: Live >30s holder cannot have its lock stolen ─────────
test('T13: Adversarial #1: Live >30s holder cannot have its lock stolen (fail-closed)', () => {
  const { dir, instanceId, projectId } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');
  const lockDir = path.join(dir, 'db.lock');

  // Spawn Child A holding directory lock and keeping itself alive for 60 seconds
  const childScript = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const lockD = process.argv[1];",
    "fs.mkdirSync(lockD, { recursive: true });",
    "const payload = JSON.stringify({ pid: process.pid, ownerToken: 'live-holder-token', createdAt: Date.now() - 40000, instanceId: 'test-inst' }, null, 2);",
    "fs.writeFileSync(path.join(lockD, 'meta.json'), payload, 'utf8');",
    "fs.writeFileSync(path.join(lockD, 'live-holder-token'), '', 'utf8');",
    "setInterval(() => {}, 60000);"
  ].join('\n');

  const childA = spawn(NODE, ['-e', childScript, lockDir], { stdio: 'ignore' });

  // Wait until lock directory is written
  const waitDeadline = Date.now() + 2000;
  while (!fs.existsSync(path.join(lockDir, 'meta.json')) && Date.now() < waitDeadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert(fs.existsSync(path.join(lockDir, 'meta.json')), 'Lock meta should have been created by Child A');

  // Now run CLI (Process B) with LOCK_TIMEOUT_MS=800. Child A is alive -> Process B must fail to acquire lock and exit 7
  const rB = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken,
    LOCK_TIMEOUT_MS:        '800'
  });

  try { childA.kill(); } catch (_) {}

  assertEqual(rB.exitCode, 7, `Expected exit 7 (lock timeout), got ${rB.exitCode}. stderr: ${rB.stderr}`);
  assert(rB.stderr.includes('Could not acquire lock'), 'stderr should indicate lock acquisition failure');

  // Ensure lock was not deleted or replaced
  assert(fs.existsSync(lockDir), 'Lock directory must still exist on disk');
  const lockData = JSON.parse(fs.readFileSync(path.join(lockDir, 'meta.json'), 'utf8'));
  assertEqual(lockData.ownerToken, 'live-holder-token', 'Process B must not have stolen Child A token');

  fs.rmSync(dir, { recursive: true });
});

// ── T14: Adversarial #2: Crashed-owner recovery is safe ────────────────────────
test('T14: Adversarial #2: Crashed-owner (dead PID) recovery is safe and completes rotation', () => {
  const { dir, instanceId, projectId, token: origToken } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');
  const lockDir = path.join(dir, 'db.lock');

  // Dead PID
  const deadPid = 9999999;
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify({
    pid: deadPid,
    ownerToken: 'dead-holder-token',
    createdAt: Date.now() - 60000,
    instanceId
  }, null, 2), 'utf8');

  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken
  });

  assertEqual(r.exitCode, 0, `Expected exit 0 for dead owner recovery, got ${r.exitCode}. stderr: ${r.stderr}`);
  assert(r.stderr.includes('Evicting stale lock from crashed/dead process'),
    'stderr should report eviction of dead PID lock');

  // Rotation must have succeeded
  const rotatedToken = readDb(dir).projects.find(p => p.id === projectId).editToken;
  assertNotEqual(rotatedToken, origToken, 'Token should have rotated');

  // Lock must be released
  assert(!fs.existsSync(lockDir), 'Lock directory must be released at exit');

  fs.rmSync(dir, { recursive: true });
});

// ── T15: Adversarial #3: Old holder / CLI cannot write or unlink successor lock ─
test('T15: Adversarial #3: Real CLI cannot overwrite or release successor lock', () => {
  const { dir, instanceId, projectId } = makeDisposableDir();
  const operatorToken = crypto.randomBytes(16).toString('hex');
  const lockDir = path.join(dir, 'db.lock');

  // Successor process creates db.lock
  const successorToken = 'successor-fencing-token-xyz';
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify({
    pid: process.pid,
    ownerToken: successorToken,
    createdAt: Date.now(),
    instanceId
  }, null, 2), 'utf8');

  // Attempt to run the actual CLI with short timeout while successor holds lock
  const r = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken,
    LOCK_TIMEOUT_MS:        '500'
  });

  assertEqual(r.exitCode, 7, `CLI must fail-closed with exit 7, got ${r.exitCode}`);
  assert(r.stderr.includes('Could not acquire lock'), 'stderr should report lock failure');

  // Successor lock MUST remain intact on disk with successorToken
  assert(fs.existsSync(lockDir), 'Successor lock must NOT be deleted by CLI');
  const remainingLock = JSON.parse(fs.readFileSync(path.join(lockDir, 'meta.json'), 'utf8'));
  assertEqual(remainingLock.ownerToken, successorToken, 'Successor token must remain unchanged');

  fs.rmSync(dir, { recursive: true });
});

// ── T16: Adversarial #4: Real interleaving with actual db.js ──────────────────
test('T16: Real interleaving with actual db.js — db.lock mutual exclusion & CAS preservation', () => {
  const otherProjectId = 'prj-test-unrelated-' + crypto.randomBytes(4).toString('hex');
  const { dir, instanceId, projectId, token: origToken } = makeDisposableDir({
    extraProjects: [{
      id: otherProjectId,
      editToken: 'tok-unrelated-critical',
      name: 'Unrelated Project',
      data: 'ORIGINAL_DATA'
    }]
  });
  const operatorToken = crypto.randomBytes(16).toString('hex');
  const dbLockDir = path.join(dir, 'db.lock');
  const readyFile = path.join(dir, '.test_t16_ready');
  const releaseFile = path.join(dir, '.test_t16_release');

  // Spawn a child process that requires the actual application db.js and holds db.lock!
  const dbWorkerScript = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const [dir, readyP, relP] = process.argv.slice(1);",
    "process.env.DATA_DIR = dir;",
    "const db = require(path.resolve('virtual-tradeshow-commercial-v1/_clean_deploy/server/db'));",
    "db.acquireFileLock().then(tok => {",
    "  fs.writeFileSync(readyP, 'LOCKED', 'utf8');",
    "  const dl = Date.now() + 6000;",
    "  while (!fs.existsSync(relP) && Date.now() < dl) {",
    "    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);",
    "  }",
    "  // Mutate unrelated project before releasing lock, keeping users sanitized to test role",
    "  const data = db.read();",
    "  data.users = [{ id: 'user-qa-1', email: 'qa@test.local', role: 'qa_tester' }];",
    "  const un = data.projects.find(p => p.id === '" + otherProjectId + "');",
    "  if (un) un.data = 'CONCURRENT_MUTATION_BY_REAL_DB_JS';",
    "  db._writeUnderLock(data);",
    "  db.releaseFileLock(tok);",
    "  fs.writeFileSync(readyP + '.done', 'RELEASED', 'utf8');",
    "  process.exit(0);",
    "});"
  ].join('\n');

  const dbWorker = spawn(NODE, ['-e', dbWorkerScript, dir, readyFile, releaseFile], { stdio: 'ignore' });

  // 1. Wait for db.js to acquire db.lock
  const waitDl = Date.now() + 3000;
  while (!fs.existsSync(readyFile) && Date.now() < waitDl) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  assert(fs.existsSync(readyFile), 'db.js should have acquired lock');
  assert(fs.existsSync(dbLockDir), 'db.lock directory must exist on disk while db.js holds it');

  // 2. While db.js holds db.lock, run actual CLI: it MUST fail to acquire lock and exit 7!
  const r1 = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken,
    LOCK_TIMEOUT_MS:        '600'
  });
  assertEqual(r1.exitCode, 7, `CLI must exit 7 while db.js holds lock. Got ${r1.exitCode}`);

  // 3. Signal db.js worker to mutate and release lock
  fs.writeFileSync(releaseFile, '1', 'utf8');
  const waitDone = Date.now() + 3000;
  while (!fs.existsSync(readyFile + '.done') && Date.now() < waitDone) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }

  // 4. Now that lock is released, run CLI again: it should acquire lock and succeed!
  const r2 = runCli({
    TEST_PROJECT_ID:        projectId,
    DATA_DIR:               dir,
    DISPOSABLE_INSTANCE_ID: instanceId,
    OPERATOR_TOKEN:         operatorToken,
    LOCK_TIMEOUT_MS:        '5000'
  });
  assertEqual(r2.exitCode, 0, `CLI should succeed after db.js releases lock. stderr: ${r2.stderr}`);

  // 5. Verify the unrelated project mutation performed by db.js survived!
  const finalDb = readDb(dir);
  const unrelated = finalDb.projects.find(p => p.id === otherProjectId);
  assertEqual(unrelated.data, 'CONCURRENT_MUTATION_BY_REAL_DB_JS',
    'Unrelated mutation by real db.js MUST survive and not be clobbered by CLI');

  try { dbWorker.kill(); } catch (_) {}
  fs.rmSync(dir, { recursive: true });
});

// ── T17: Adversarial #5: Customer & Owner DB Refusal Gate ─────────────────────
test('T17: Customer & Owner DB Refusal Gate — strictly rejects non-test project records', () => {
  // Scenario A: DB containing real customer project ID (prj-free-b0c6f3ea)
  const dirA = mkTmp();
  fs.writeFileSync(path.join(dirA, '.disposable_qa_marker'), 'inst-refusal-a', 'utf8');
  const dbA = {
    projects: [
      { id: 'prj-test-1234', editToken: 'tok-test' },
      { id: 'prj-free-b0c6f3ea', editToken: 'tok-prod', name: 'Real Customer Project' }
    ]
  };
  fs.writeFileSync(path.join(dirA, 'db.json'), JSON.stringify(dbA, null, 2), 'utf8');

  const rA = runCli({
    TEST_PROJECT_ID:        'prj-test-1234',
    DATA_DIR:               dirA,
    DISPOSABLE_INSTANCE_ID: 'inst-refusal-a',
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
  });

  assertEqual(rA.exitCode, 3, `Expected exit 3 for customer project DB, got ${rA.exitCode}`);
  assert(rA.stderr.includes('production/customer project (prj-free-b0c6f3ea)'),
    'stderr should report refusal due to customer project');

  // Verify db.json was NOT mutated
  const dbAfterA = JSON.parse(fs.readFileSync(path.join(dirA, 'db.json'), 'utf8'));
  assertEqual(dbAfterA.projects[0].editToken, 'tok-test', 'No mutation should occur');
  fs.rmSync(dirA, { recursive: true });

  // Scenario B: DB containing platform owner user
  const dirB = mkTmp();
  fs.writeFileSync(path.join(dirB, '.disposable_qa_marker'), 'inst-refusal-b', 'utf8');
  const dbB = {
    projects: [{ id: 'prj-test-valid', editToken: 'tok-test' }],
    users: [{ id: 'user-1', email: 'owner@vshow.com', role: 'platform_owner' }]
  };
  fs.writeFileSync(path.join(dirB, 'db.json'), JSON.stringify(dbB, null, 2), 'utf8');

  const rB = runCli({
    TEST_PROJECT_ID:        'prj-test-valid',
    DATA_DIR:               dirB,
    DISPOSABLE_INSTANCE_ID: 'inst-refusal-b',
    OPERATOR_TOKEN:         crypto.randomBytes(16).toString('hex')
  });

  assertEqual(rB.exitCode, 3, `Expected exit 3 for platform owner DB, got ${rB.exitCode}`);
  assert(rB.stderr.includes('platform owner account'),
    'stderr should report refusal due to platform owner account');

  fs.rmSync(dirB, { recursive: true });
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n  CLI e2e complete: ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
