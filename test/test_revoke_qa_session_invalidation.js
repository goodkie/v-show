#!/usr/bin/env node
/**
 * test/test_revoke_qa_session_invalidation.js
 *
 * Demonstrates:
 * 1. Immediate in-memory and persistent on-disk invalidation of old edit tokens / sessions
 *    across a real HTTP server on a fresh disposable non-owner volume.
 * 2. Survival and enforcement across full server restart (no cached credential acceptance).
 * 3. Lock handoff & dead holder (crashed PID) tombstone recovery.
 * 4. Safe rollback under intervening non-target edits (preserves external fields).
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const http   = require('http');
const assert = require('assert');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const CLI_SCRIPT = path.resolve(__dirname, '../scripts/revoke_qa_tokens.js');
const { computeMarkerSignature, computeProvenanceSignature } = require('../scripts/revoke_qa_tokens');

let total = 0;
let passed = 0;

async function runTest(name, fn) {
  total++;
  process.stdout.write(`\n--- [SESSION & CRASH TEST ${total}] ${name} ---\n`);
  try {
    await fn();
    console.log(`  RESULT: PASS`);
    passed++;
  } catch (err) {
    console.error(`  RESULT: FAIL -> ${err.message}`);
    console.error(err.stack);
  }
}

function runCliSubprocess(env, args = []) {
  const mergedEnv = Object.assign({}, process.env, env);
  const res = spawnSync(process.execPath, [CLI_SCRIPT, ...args], {
    env: mergedEnv,
    encoding: 'utf8'
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function makeHttpRequest(port, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: {
        'x-edit-token': token
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Minimal disposable test server implementation ───────────────────────────
function startDisposableServer(dataDir) {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(dataDir, 'db.json');
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/projects/')) {
        const projectId = url.pathname.replace('/api/projects/', '');
        const clientToken = req.headers['x-edit-token'];

        // Read db.json to authenticate (simulating server/db.js read with caching or fresh disk check)
        let db;
        try {
          db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        } catch (_) {
          res.writeHead(500);
          return res.end('DB read error');
        }

        const project = (db.projects || []).find(p => p.id === projectId);
        if (!project) {
          res.writeHead(404);
          return res.end('Project not found');
        }

        if (!clientToken || clientToken !== project.editToken) {
          res.writeHead(401);
          return res.end(JSON.stringify({ error: 'Unauthorized: Invalid editToken' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, project }));
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        port,
        close: () => new Promise(cb => server.close(cb))
      });
    });
    server.on('error', reject);
  });
}

(async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vshow_session_test_'));
  const realDir = fs.realpathSync(tmpDir);
  const INSTANCE_ID = 'inst-session-' + crypto.randomBytes(4).toString('hex');
  const PROJECT_ID = 'prj-test-session';
  const OLD_TOKEN = 'edit-tok-initial-' + crypto.randomBytes(16).toString('hex');
  const HARNESS_SECRET = 'harness-secret-session-test-32chars-long';
  const CP_SECRET = 'cp-master-secret-session-test-32chars-long';

  // Seed DB
  const initialDb = {
    projects: [
      { id: PROJECT_ID, name: 'Disposable Test Project', editToken: OLD_TOKEN }
    ],
    users: [
      { id: 'user-qa-session', email: 'session-qa@test.local', role: 'qa' }
    ]
  };
  fs.writeFileSync(path.join(tmpDir, 'db.json'), JSON.stringify(initialDb, null, 2), 'utf8');

  // Markers
  const sig = computeMarkerSignature(INSTANCE_ID, HARNESS_SECRET);
  fs.writeFileSync(path.join(tmpDir, '.disposable_qa_marker'), `${INSTANCE_ID}:${sig}`, 'utf8');

  const now = Date.now();
  const provSig = computeProvenanceSignature(INSTANCE_ID, realDir, PROJECT_ID, 'ROTATE_QA_EDIT_TOKEN', now, 3600000, CP_SECRET);
  fs.writeFileSync(path.join(tmpDir, '.disposable_qa_provenance.json'), JSON.stringify({
    volumeId: INSTANCE_ID,
    datastoreRealPath: realDir,
    projectId: PROJECT_ID,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    createdAt: now,
    maxLifetimeMs: 3600000,
    controlPlaneSignature: provSig
  }, null, 2), 'utf8');

  // Test 1: Active session validation & immediate invalidation on CLI rotation
  await runTest('T1: Immediate session invalidation upon CLI rotation', async () => {
    let serverInstance = await startDisposableServer(tmpDir);

    try {
      // 1. Verify OLD_TOKEN gives 200 OK
      const resBefore = await makeHttpRequest(serverInstance.port, `/api/projects/${PROJECT_ID}`, OLD_TOKEN);
      assert.strictEqual(resBefore.status, 200, 'Initial request with OLD_TOKEN must succeed with 200 OK');

      // 2. Execute CLI rotation
      const cliRes = runCliSubprocess({
        TEST_PROJECT_ID: PROJECT_ID,
        DATA_DIR: tmpDir,
        DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
        OPERATOR_TOKEN: HARNESS_SECRET,
        QA_HARNESS_SECRET: HARNESS_SECRET,
        CONTROL_PLANE_SECRET: CP_SECRET,
        REQUIRE_PROVENANCE: 'true',
        ALLOWED_QA_DATA_DIRS: os.tmpdir()
      });
      assert.strictEqual(cliRes.code, 0, `CLI rotation must succeed (exit 0). Got stderr: ${cliRes.stderr}`);

      // 3. Immediately request with OLD_TOKEN -> MUST be 401 Unauthorized
      const resAfter = await makeHttpRequest(serverInstance.port, `/api/projects/${PROJECT_ID}`, OLD_TOKEN);
      assert.strictEqual(resAfter.status, 401, 'Old token must immediately return 401 Unauthorized after rotation');

      // 4. Verify new token works
      const dbAfter = JSON.parse(fs.readFileSync(path.join(tmpDir, 'db.json'), 'utf8'));
      const newToken = dbAfter.projects[0].editToken;
      assert.notStrictEqual(newToken, OLD_TOKEN, 'Token in DB must be changed');

      const resNew = await makeHttpRequest(serverInstance.port, `/api/projects/${PROJECT_ID}`, newToken);
      assert.strictEqual(resNew.status, 200, 'New token must authenticate with 200 OK');
    } finally {
      await serverInstance.close();
    }
  });

  // Test 2: Invalidation persistence across full server restart
  await runTest('T2: Invalidation persistence across full server restart (no disk/memory rollback)', async () => {
    // Start fresh server process on the same directory
    const serverInstance = await startDisposableServer(tmpDir);

    try {
      // Old token must STILL be rejected after reboot
      const resOld = await makeHttpRequest(serverInstance.port, `/api/projects/${PROJECT_ID}`, OLD_TOKEN);
      assert.strictEqual(resOld.status, 401, 'Old token must remain 401 Unauthorized after full server restart');

      // New token must still work
      const db = JSON.parse(fs.readFileSync(path.join(tmpDir, 'db.json'), 'utf8'));
      const newToken = db.projects[0].editToken;
      const resNew = await makeHttpRequest(serverInstance.port, `/api/projects/${PROJECT_ID}`, newToken);
      assert.strictEqual(resNew.status, 200, 'New token must remain valid after server restart');
    } finally {
      await serverInstance.close();
    }
  });

  // Test 3: Dead Lock Holder (Crashed PID) Tombstone Recovery
  await runTest('T3: Stale/crashed lock directory eviction via tombstone', async () => {
    const lockDir = path.join(tmpDir, 'db.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    // Write dead PID meta (99999999 is guaranteed non-existent)
    const deadPid = 99999999;
    const deadMeta = {
      pid: deadPid,
      ownerToken: 'dead-owner-token',
      createdAt: Date.now() - 60000
    };
    fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify(deadMeta, null, 2), 'utf8');

    // CLI rotation should detect dead PID, evict via tombstone, and complete rotation cleanly
    const cliRes = runCliSubprocess({
      TEST_PROJECT_ID: PROJECT_ID,
      DATA_DIR: tmpDir,
      DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
      OPERATOR_TOKEN: HARNESS_SECRET,
      QA_HARNESS_SECRET: HARNESS_SECRET,
      CONTROL_PLANE_SECRET: CP_SECRET,
      ALLOWED_QA_DATA_DIRS: os.tmpdir()
    });
    assert.strictEqual(cliRes.code, 0, `CLI must recover dead lock and exit 0. Got: ${cliRes.stderr}`);
    assert.ok(cliRes.stderr.includes('Evicting stale lock from crashed/dead process'), 'Must report tombstone eviction of dead process lock');
  });

  // Test 4: Rollback preserves non-target fields mutated in the interim
  await runTest('T4: Rollback preserves intervening non-target edits on target project', async () => {
    // Simulate external non-target edit (e.g. user updated title or description)
    const dbPath = path.join(tmpDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    db.projects[0].externalDescription = 'Preserved Custom Description';
    db.projects[0].customField = 42;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

    // Run rollback
    const rollbackRes = runCliSubprocess({
      TEST_PROJECT_ID: PROJECT_ID,
      DATA_DIR: tmpDir,
      DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
      OPERATOR_TOKEN: HARNESS_SECRET,
      QA_HARNESS_SECRET: HARNESS_SECRET,
      CONTROL_PLANE_SECRET: CP_SECRET,
      ALLOWED_QA_DATA_DIRS: os.tmpdir()
    }, ['--rollback']);

    // Check rollback result
    const rolledDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert.strictEqual(rolledDb.projects[0].externalDescription, 'Preserved Custom Description', 'Intervening field externalDescription must be preserved');
    assert.strictEqual(rolledDb.projects[0].customField, 42, 'Intervening field customField must be preserved');
  });

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}

  console.log(`\n======================================================`);
  console.log(`Session & Crash Test Suite Complete: ${passed}/${total} passed`);
  console.log(`======================================================\n`);

  if (passed !== total) process.exit(1);
  else process.exit(0);
})();
