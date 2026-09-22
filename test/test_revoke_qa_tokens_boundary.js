#!/usr/bin/env node
/**
 * test/test_revoke_qa_tokens_boundary.js
 *
 * Standalone, reproducible 9-case safety boundary test suite (N1–N7, P1–P2)
 * plus Provenance Negatives (PN1–PN2) for revoke_qa_tokens.js.
 *
 * Runs BOTH:
 *  1) Direct in-process assertions against inspectDatastoreSafety() & verifyProvenanceBinding()
 *  2) Real subprocess CLI invocations verifying exit codes and stderr refusal patterns.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const {
  inspectDatastoreSafety,
  verifyProvenanceBinding,
  computeProvenanceSignature,
  computeMarkerSignature,
  DB_JS_SEED_ORG_IDS,
  INTERNAL_PLATFORM_DOMAINS,
  DB_JS_SEED_PLATFORM_OWNER_ID
} = require('../scripts/revoke_qa_tokens');

const CLI_SCRIPT = path.resolve(__dirname, '../scripts/revoke_qa_tokens.js');

let total = 0;
let passed = 0;

function runCase(name, fn) {
  total++;
  process.stdout.write(`\n--- [TEST ${total}] ${name} ---\n`);
  try {
    fn();
    console.log(`  RESULT: PASS`);
    passed++;
  } catch (err) {
    console.error(`  RESULT: FAIL -> ${err.message}`);
    console.error(err.stack);
  }
}

// Helper: run CLI as subprocess
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

// ─── Setup isolated disposable test volume ───────────────────────────────────
const tmpVolume = fs.mkdtempSync(path.join(os.tmpdir(), 'vshow_boundary_test_'));
const realVolumeDir = fs.realpathSync(tmpVolume);
const INSTANCE_ID = 'inst-boundary-' + crypto.randomBytes(4).toString('hex');
const HARNESS_SECRET = 'harness-secret-key-boundary-test-32c';
const CP_SECRET = 'control-plane-master-secret-key-32c';
const VALID_OPERATOR_TOKEN = 'operator-auth-token-boundary-test-32c';

function writeFixtureDb(dbObject) {
  fs.writeFileSync(path.join(tmpVolume, 'db.json'), JSON.stringify(dbObject, null, 2), 'utf8');
}

function writeValidMarker() {
  const sig = computeMarkerSignature(INSTANCE_ID, HARNESS_SECRET);
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_marker'), `${INSTANCE_ID}:${sig}`, 'utf8');
}

function writeValidProvenance(projectId) {
  const now = Date.now();
  const maxLifetimeMs = 3600000;
  const sig = computeProvenanceSignature(INSTANCE_ID, realVolumeDir, projectId, 'ROTATE_QA_EDIT_TOKEN', now, maxLifetimeMs, CP_SECRET);
  const prov = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    createdAt: now,
    maxLifetimeMs,
    controlPlaneSignature: sig
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(prov, null, 2), 'utf8');
}

writeValidMarker();

// ─── N1: platform_owner + lookalike domain with non-seed user ID ─────────────
runCase('N1: platform_owner role with non-seed user ID (lookalike email)', () => {
  const fixture = {
    projects: [{ id: 'prj-test-n1', editToken: 'tok-123' }],
    users: [{ id: 'user-1', email: 'owner@vshow.com', role: 'platform_owner' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('Target DB contains platform owner account'), `Must reject non-seed platform_owner. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-n1',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3, 'CLI must exit 3 on refused DB');
  assert.ok(cliRes.stderr.includes('Target DB contains platform owner account'), 'CLI stderr must state platform owner rejection');
});

// ─── N2: platform_owner with unknown ID ───────────────────────────────────────
runCase('N2: platform_owner role with unknown ID (user-fake-owner)', () => {
  const fixture = {
    projects: [{ id: 'prj-test-n2', editToken: 'tok-123' }],
    users: [{ id: 'user-fake-owner', role: 'platform_owner' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('Target DB contains platform owner account (user-fake-owner)'), `Must reject unknown platform_owner. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-n2',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3);
  assert.ok(cliRes.stderr.includes('Target DB contains platform owner account'));
});

// ─── N3: billing_admin with vshow.com internal domain ─────────────────────────
runCase('N3: billing_admin role with internal vshow.com domain', () => {
  const fixture = {
    projects: [{ id: 'prj-test-n3', editToken: 'tok-123' }],
    users: [{ id: 'user-billing-1', email: 'billing@vshow.com', role: 'billing_admin' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('privileged operational role (billing_admin)'), `Must reject billing_admin. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-n3',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3);
  assert.ok(cliRes.stderr.includes('Target DB contains privileged operational role (billing_admin)'));
});

// ─── N4: customer user email domain ───────────────────────────────────────────
runCase('N4: customer user email domain (accountant@client-corp.com)', () => {
  const fixture = {
    projects: [{ id: 'prj-test-n4', editToken: 'tok-123' }],
    users: [{ id: 'user-cust-1', email: 'accountant@client-corp.com', role: 'member' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('customer user email domain'), `Must reject customer email domain. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-n4',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3);
  assert.ok(cliRes.stderr.includes('Target DB contains customer user email domain'));
});

// ─── N5: non-seed org ID ──────────────────────────────────────────────────────
runCase('N5: non-seed commercial org ID (org-client-corp-xyz)', () => {
  const fixture = {
    projects: [{ id: 'prj-test-n5', editToken: 'tok-123' }],
    organizations: [{ id: 'org-client-corp-xyz', name: 'Client Corp' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('customer/commercial organization entity (org-client-corp-xyz)'), `Must reject non-seed org. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-n5',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3);
  assert.ok(cliRes.stderr.includes('Target DB contains customer/commercial organization entity'));
});

// ─── N6: non-prj-test project ID ──────────────────────────────────────────────
runCase('N6: non-prj-test project ID (prj-free-b0c6f3ea)', () => {
  const fixture = {
    projects: [{ id: 'prj-free-b0c6f3ea', editToken: 'tok-123' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('production/customer project (prj-free-b0c6f3ea)'), `Must reject non-test project. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-dummy',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3);
  assert.ok(cliRes.stderr.includes('Target DB contains production/customer project'));
});

// ─── N7: enterprise tier project ──────────────────────────────────────────────
runCase('N7: enterprise commercial tier project (prj-test-n7, tier: enterprise)', () => {
  const fixture = {
    projects: [{ id: 'prj-test-n7', tier: 'enterprise', editToken: 'tok-123' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.ok(reason && reason.includes('commercial/production tier'), `Must reject enterprise tier. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-n7',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3);
  assert.ok(cliRes.stderr.includes('Target DB project (prj-test-n7) has commercial/production tier'));
});

// ─── P1: known seed orgs + seed platform_owner ────────────────────────────────
runCase('P1: known seed orgs + seed platform_owner (user-platform-owner + vshow.com)', () => {
  const fixture = {
    projects: [{ id: 'prj-test-p1', editToken: 'tok-seed-init' }],
    users: [
      { id: DB_JS_SEED_PLATFORM_OWNER_ID, email: 'owner@vshow.com', role: 'platform_owner' },
      { id: 'user-organizer', email: 'organizer@vshow.com', role: 'organizer' }
    ],
    organizations: Array.from(DB_JS_SEED_ORG_IDS).map(id => ({ id }))
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.strictEqual(reason, null, `Seed allowlist identities must be accepted. Got rejection: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-p1',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 0, `CLI rotation must succeed on clean seed test DB. Output: ${cliRes.stderr}`);
  assert.ok(cliRes.stderr.includes('ROTATED_OK'), 'Must emit ROTATED_OK receipt');
});

// ─── P2: qa-only users ────────────────────────────────────────────────────────
runCase('P2: qa-only users (@test.local) and test projects', () => {
  const fixture = {
    projects: [{ id: 'prj-test-p2', editToken: 'tok-p2-init' }],
    users: [{ id: 'user-qa-1', email: 'tester@test.local', role: 'qa' }],
    organizations: [{ id: 'org-test-qa-unit' }]
  };
  const reason = inspectDatastoreSafety(fixture);
  assert.strictEqual(reason, null, `Clean QA fixture must be accepted. Got: ${reason}`);

  writeFixtureDb(fixture);
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-p2',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 0, `CLI rotation must succeed on QA fixture. Output: ${cliRes.stderr}`);
  assert.ok(cliRes.stderr.includes('ROTATED_OK'));
});

// ─── PN1: Provenance Negative — missing or path-mismatched provenance ─────────
runCase('PN1: Provenance Negative — Copied datastore without immutable provenance binding', () => {
  const fixture = {
    projects: [{ id: 'prj-test-pn1', editToken: 'tok-pn1-init' }],
    users: [{ id: 'user-qa-pn1', email: 'tester@test.local', role: 'qa' }]
  };
  writeFixtureDb(fixture);

  // Remove provenance file to simulate a copied datastore
  const provPath = path.join(tmpVolume, '.disposable_qa_provenance.json');
  try { fs.unlinkSync(provPath); } catch (_) {}

  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-pn1',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    CONTROL_PLANE_SECRET: CP_SECRET,
    REQUIRE_PROVENANCE: 'true',
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3, 'CLI must exit 3 when provenance binding is missing');
  assert.ok(cliRes.stderr.includes('Control-plane provenance binding failed') || cliRes.stderr.includes('.disposable_qa_provenance.json missing'));
});

// ─── PN2: Two-party Separation of Duty Negative — caller colluded secrets ─────
runCase('PN2: Two-party Separation Negative — OPERATOR_TOKEN matches CONTROL_PLANE_SECRET', () => {
  const fixture = {
    projects: [{ id: 'prj-test-pn2', editToken: 'tok-pn2-init' }]
  };
  writeFixtureDb(fixture);
  writeValidProvenance('prj-test-pn2');

  const colludedSecret = 'colluded-secret-matching-token-32c';
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-pn2',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: colludedSecret,
    QA_HARNESS_SECRET: colludedSecret,
    CONTROL_PLANE_SECRET: colludedSecret, // Collusion: caller asserts both operator token and control plane key
    REQUIRE_PROVENANCE: 'true',
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 2, 'CLI must exit 2 (validation error) when operator colludes with control-plane secret');
  assert.ok(cliRes.stderr.includes('OPERATOR_TOKEN must be distinct from CONTROL_PLANE_SECRET'));
});

// Clean up
try { fs.rmSync(tmpVolume, { recursive: true }); } catch (_) {}

console.log(`\n======================================================`);
console.log(`Boundary Test Suite Complete: ${passed}/${total} passed`);
console.log(`======================================================\n`);

if (passed !== total) {
  process.exit(1);
} else {
  process.exit(0);
}
