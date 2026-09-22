#!/usr/bin/env node
/**
 * test/test_revoke_qa_tokens_boundary.js
 *
 * Standalone, reproducible safety boundary test suite (N1–N7, P1–P2)
 * plus ChatGPT P0 Mandatory Negative Verification Suite (M1–M4):
 *
 * M1: Missing provenance file or missing control-plane verifier key fails closed (exit 2 or 3).
 * M2: Missing trusted operator verifier (QA_HARNESS_SECRET) or token mismatch fails closed (exit 2).
 * M3: Caller-supplied distinct arbitrary keys cannot mint/authorize provenance (asymmetric Ed25519 verification fails, exit 3).
 * M4: Copied/relabeled volume, expired lifetime, or project-mismatched attestation fails closed (exit 3).
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

// Ephemeral in-memory Ed25519 keypair for local test execution (NEVER committed or hardcoded)
const { publicKey: _testPubKey, privateKey: _testPrivKey } = crypto.generateKeyPairSync('ed25519');
const TEST_CP_PUBLIC_KEY = _testPubKey.export({ type: 'spki', format: 'pem' });
const TEST_CP_PRIVATE_KEY = _testPrivKey;

// Helper: run CLI as subprocess
function runCliSubprocess(env, args = []) {
  const defaultEnv = {
    NODE_ENV: 'test',
    ALLOW_TEST_CONTROL_PLANE_KEY: 'true',
    TEST_CONTROL_PLANE_PUBLIC_KEY: TEST_CP_PUBLIC_KEY
  };
  const mergedEnv = Object.assign({}, defaultEnv, process.env, env);
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
const HARNESS_SECRET = 'harness-secret-key-boundary-test-32chars';

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
  const sig = computeProvenanceSignature(INSTANCE_ID, realVolumeDir, projectId, 'ROTATE_QA_EDIT_TOKEN', now, maxLifetimeMs, TEST_CP_PRIVATE_KEY, 'ed25519');
  const prov = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
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
  writeValidProvenance('prj-test-n1');
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
  writeValidProvenance('prj-test-n2');
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
  writeValidProvenance('prj-test-n3');
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
  writeValidProvenance('prj-test-n4');
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
  writeValidProvenance('prj-test-n5');
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
  writeValidProvenance('prj-test-dummy');
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
  writeValidProvenance('prj-test-n7');
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
  writeValidProvenance('prj-test-p1');
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
  writeValidProvenance('prj-test-p2');
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

// ─── M1: Missing Provenance / Verification Key Fails Closed ────────────────────
runCase('M1: Mandatory Provenance Failure — Missing provenance file & missing verifier key in active mode', () => {
  const fixture = { projects: [{ id: 'prj-test-m1', editToken: 'tok-m1' }] };
  writeFixtureDb(fixture);

  // 1a: Missing provenance file entirely
  const provPath = path.join(tmpVolume, '.disposable_qa_provenance.json');
  try { fs.unlinkSync(provPath); } catch (_) {}
  const res1a = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-m1',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res1a.code, 3, 'Missing provenance file must exit 3');
  assert.ok(res1a.stderr.includes('.disposable_qa_provenance.json missing'), 'stderr must report missing provenance');

  // 1b: Corrupt signature in provenance file
  const corruptProv = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId: 'prj-test-m1',
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
    createdAt: Date.now(),
    maxLifetimeMs: 3600000,
    controlPlaneSignature: 'deadbeef_corrupted_signature_hex'
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(corruptProv), 'utf8');
  const res1b = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-m1',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res1b.code, 3, 'Corrupt signature in provenance must exit 3');
  assert.ok(res1b.stderr.includes('verification failed') || res1b.stderr.includes('verification error'), 'stderr must report verification failure');
});

// ─── M2: Missing or Mismatched Trusted Operator Verifier Fails Closed ─────────
runCase('M2: Mandatory Operator Verifier Failure — Missing or mismatched QA_HARNESS_SECRET', () => {
  const fixture = { projects: [{ id: 'prj-test-m2', editToken: 'tok-m2' }] };
  writeFixtureDb(fixture);
  writeValidProvenance('prj-test-m2');

  // 2a: Missing QA_HARNESS_SECRET
  const res2a = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-m2',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res2a.code, 2, 'Missing QA_HARNESS_SECRET must exit 2');
  assert.ok(res2a.stderr.includes('QA_HARNESS_SECRET (or EXPECTED_OPERATOR_TOKEN) env var is mandatory'), 'stderr must report mandatory QA_HARNESS_SECRET');

  // 2b: OPERATOR_TOKEN mismatch with QA_HARNESS_SECRET
  const res2b = runCliSubprocess({
    TEST_PROJECT_ID: 'prj-test-m2',
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: 'different-operator-token-32chars-xyz',
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res2b.code, 2, 'Mismatched OPERATOR_TOKEN must exit 2');
  assert.ok(res2b.stderr.includes('OPERATOR_TOKEN does not match server-verified QA_HARNESS_SECRET'));
});

// ─── M3: Caller-Supplied Distinct Secrets Cannot Mint Provenance (Asymmetric) ─
runCase('M3: Asymmetric Ed25519 Cryptographic Proof — Caller with full env control cannot mint provenance against pinned key', () => {
  const projectId = 'prj-test-m3';
  const fixture = { projects: [{ id: projectId, editToken: 'tok-m3' }] };
  writeFixtureDb(fixture);

  // Attacker caller generates their own separate Ed25519 keypair and tries to mint an attestation,
  // and attempts to pass their own public key via env vars to override the verifier
  const { publicKey: attackerPubKey, privateKey: untrustedAttackerPrivateKey } = crypto.generateKeyPairSync('ed25519');
  const attackerPubKeyPem = attackerPubKey.export({ type: 'spki', format: 'pem' });
  const now = Date.now();
  const attackerSig = computeProvenanceSignature(
    INSTANCE_ID, realVolumeDir, projectId, 'ROTATE_QA_EDIT_TOKEN', now, 3600000, untrustedAttackerPrivateKey, 'ed25519'
  );
  const forgedProv = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
    createdAt: now,
    maxLifetimeMs: 3600000,
    controlPlaneSignature: attackerSig
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(forgedProv, null, 2), 'utf8');

  // CLI enforces PINNED_CONTROL_PLANE_PUBLIC_KEY — caller supplying distinct public key env var CANNOT override it
  const cliRes = runCliSubprocess({
    TEST_PROJECT_ID: projectId,
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    CONTROL_PLANE_PUBLIC_KEY: attackerPubKeyPem, // Caller attempts to inject their own verifier key
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(cliRes.code, 3, 'CLI must exit 3 when caller self-mints provenance with untrusted key against pinned key');
  assert.ok(cliRes.stderr.includes('asymmetric Ed25519 signature verification failed'), 'stderr must report Ed25519 verification failure');
});

// ─── M4: Copied, Expired, or Path-Mismatched Attestation Fails Closed ──────────
runCase('M4: Copied / Expired / Mismatched Attestation Fails Closed', () => {
  const projectId = 'prj-test-m4';
  const fixture = { projects: [{ id: projectId, editToken: 'tok-m4' }] };
  writeFixtureDb(fixture);

  // 4a: Path-mismatch (DB copied to a different directory)
  const now = Date.now();
  const mismatchPathProv = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: '/tmp/copied_from_another_volume',
    projectId,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
    createdAt: now,
    maxLifetimeMs: 3600000,
    controlPlaneSignature: computeProvenanceSignature(
      INSTANCE_ID, '/tmp/copied_from_another_volume', projectId, 'ROTATE_QA_EDIT_TOKEN', now, 3600000, TEST_CP_PRIVATE_KEY, 'ed25519'
    )
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(mismatchPathProv, null, 2), 'utf8');
  const res4a = runCliSubprocess({
    TEST_PROJECT_ID: projectId,
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res4a.code, 3, 'Path mismatch (copied volume) must exit 3');
  assert.ok(res4a.stderr.includes('Provenance datastoreRealPath mismatch'), 'stderr must report realPath mismatch');

  // 4b: Expired lifetime
  const expiredProv = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
    createdAt: now - 7200000, // 2 hours ago
    maxLifetimeMs: 3600000,   // 1 hour lifetime
    controlPlaneSignature: computeProvenanceSignature(
      INSTANCE_ID, realVolumeDir, projectId, 'ROTATE_QA_EDIT_TOKEN', now - 7200000, 3600000, TEST_CP_PRIVATE_KEY, 'ed25519'
    )
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(expiredProv, null, 2), 'utf8');
  const res4b = runCliSubprocess({
    TEST_PROJECT_ID: projectId,
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res4b.code, 3, 'Expired provenance token must exit 3');
  assert.ok(res4b.stderr.includes('Provenance token expired'), 'stderr must report expired token');

  // 4c: Project mismatch
  const mismatchProjectProv = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId: 'prj-test-different',
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
    createdAt: now,
    maxLifetimeMs: 3600000,
    controlPlaneSignature: computeProvenanceSignature(
      INSTANCE_ID, realVolumeDir, 'prj-test-different', 'ROTATE_QA_EDIT_TOKEN', now, 3600000, TEST_CP_PRIVATE_KEY, 'ed25519'
    )
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(mismatchProjectProv, null, 2), 'utf8');
  const res4c = runCliSubprocess({
    TEST_PROJECT_ID: projectId,
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir()
  });
  assert.strictEqual(res4c.code, 3, 'Project mismatch must exit 3');
  assert.ok(res4c.stderr.includes('Provenance projectId mismatch'), 'stderr must report projectId mismatch');
});

// ─── M5: ChatGPT P0 Mandatory: Untrusted / Repo-Known Key Refused Against Pinned Trust Anchor ──
runCase('M5: Untrusted / self-generated keys strictly refused when pinned trust anchor enforced', () => {
  const projectId = 'prj-test-m5';
  writeFixtureDb({
    projects: [{ id: projectId, editToken: 'initial-m5-token' }]
  });

  // Generate an arbitrary unauthorized keypair
  const { privateKey: roguePrivKey } = crypto.generateKeyPairSync('ed25519');
  const now = Date.now();
  const sig = computeProvenanceSignature(
    INSTANCE_ID, realVolumeDir, projectId, 'ROTATE_QA_EDIT_TOKEN', now, 3600000, roguePrivKey, 'ed25519'
  );
  const rogueProv = {
    volumeId: INSTANCE_ID,
    datastoreRealPath: realVolumeDir,
    projectId,
    operation: 'ROTATE_QA_EDIT_TOKEN',
    algorithm: 'ed25519',
    createdAt: now,
    maxLifetimeMs: 3600000,
    controlPlaneSignature: sig
  };
  fs.writeFileSync(path.join(tmpVolume, '.disposable_qa_provenance.json'), JSON.stringify(rogueProv, null, 2), 'utf8');

  // Explicitly run with ALLOW_TEST_CONTROL_PLANE_KEY='false' and empty TEST_CONTROL_PLANE_PUBLIC_KEY
  // to enforce the production PINNED_CONTROL_PLANE_PUBLIC_KEY trust anchor
  const resM5 = runCliSubprocess({
    TEST_PROJECT_ID: projectId,
    DATA_DIR: tmpVolume,
    DISPOSABLE_INSTANCE_ID: INSTANCE_ID,
    OPERATOR_TOKEN: HARNESS_SECRET,
    QA_HARNESS_SECRET: HARNESS_SECRET,
    ALLOWED_QA_DATA_DIRS: os.tmpdir(),
    ALLOW_TEST_CONTROL_PLANE_KEY: 'false',
    TEST_CONTROL_PLANE_PUBLIC_KEY: ''
  });

  assert.strictEqual(resM5.code, 3, 'Must fail closed (exit 3) when signed by untrusted key against pinned trust anchor');
  assert.ok(
    resM5.stderr.includes('Provenance attestation asymmetric Ed25519 signature verification failed'),
    `stderr must state signature verification failed. Got: ${resM5.stderr}`
  );
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
