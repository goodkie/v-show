/**
 * test_apply_artifact_identity_e2e.js
 * 
 * Round 114C: Tests the real DB apply pipeline, strict fail-closed boundary guards,
 * and artifact identity preservation using actual stitched panorama SHA-256.
 * 
 * Verifies:
 * 1. Exact SHA equality using real stitched panorama artifact:
 *    node0_360_panorama_4k_opt.jpg (SHA256: bbb37511be4fcc0875127d7b65d53dc14ab0c2a4ed02f47a21a403ebb050f12a)
 *    (NOT raw single-frame C001 JPEG)
 * 2. Fail-closed candidate eligibility guards:
 *    - Missing projectId -> rejected
 *    - Mismatched projectId -> rejected
 *    - status !== 'READY' -> rejected
 *    - geometryValid !== true -> rejected
 *    - applyEnabled !== true -> rejected
 * 3. Truth invariant:
 *    - Authoritative coverage (e.g. 350.5°) preserved without fabricating 360°
 *    - Unknown coverage (null) preserved as null
 *    - full360Qualified requires strict boolean true
 * 4. Read-after-write verification on project active version namespace (pver-panorama-*)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

console.log('══════════════════════════════════════════════════════════════════════');
console.log(' APPLY ARTIFACT IDENTITY & FAIL-CLOSED BOUNDARY TEST (R114C)');
console.log('══════════════════════════════════════════════════════════════════════\n');

// 1. Verify and hash real stitched panorama artifact
const realArtifactPath = path.join(__dirname, '..', 'virtual-tradeshow-commercial-v1', 'app_build', 'client', 'assets', 'demo', 'dna-showcase', 'pano360', 'node0_360_panorama_4k_opt.jpg');
assert(fs.existsSync(realArtifactPath), 'Real stitched panorama artifact must exist at path');
const artifactBytes = fs.readFileSync(realArtifactPath);
const realStitchedSha256 = crypto.createHash('sha256').update(artifactBytes).digest('hex');

console.log(`[ARTIFACT AUDIT]`);
console.log(`  File: node0_360_panorama_4k_opt.jpg`);
console.log(`  Size: ${artifactBytes.length} bytes`);
console.log(`  True Stitched Artifact SHA256: ${realStitchedSha256}\n`);
assert.strictEqual(realStitchedSha256, 'bbb37511be4fcc0875127d7b65d53dc14ab0c2a4ed02f47a21a403ebb050f12a');

// Load DB
const dbModulePath = path.join(__dirname, '..', 'virtual-tradeshow-commercial-v1', 'app_build', 'server', 'db.js');
const db = require(dbModulePath);

async function runTests() {
  const projectId = 'prj-free-b0c6f3ea';
  const candidateId = 'cand-panorama-r114c-valid';

  // 1. Setup project
  await db.mutate(d => {
    d.projects = d.projects || [];
    let p = d.projects.find(x => x.id === projectId);
    if (!p) {
      p = {
        id: projectId,
        name: 'Apex Robotics Inc. Virtual Booth (QA)',
        status: 'ACTIVE',
        panoramaVersions: [],
        spatialBoothVersions: []
      };
      d.projects.push(p);
    }
  });

  // 2. Setup READY candidate with authoritative measured values
  const candidate = {
    candidateId,
    projectId,
    status: 'READY',
    geometryValid: true,
    applyEnabled: true,
    engine: 'OPENCV',
    projectionType: 'SPHERICAL_BAND',
    masterSha256: realStitchedSha256,
    stitchedPanoramaUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg',
    activeBackgroundUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg',
    horizontalCoverageDeg: 350.5,
    full360Qualified: false, // measured: partial band, not full sphere
    nativeFilename: 'node0_360_panorama_4k_opt.jpg'
  };

  await db.saveSpatialBoothCandidate(projectId, candidate);
  console.log(`[PASS] Saved candidate ${candidateId} to DB with real stitched artifact SHA`);

  // 3. Apply candidate
  console.log('Applying candidate to project...');
  const applyResult = await db.applySpatialBoothCandidate(projectId, candidateId, 'internal_dev_pass');
  assert.strictEqual(applyResult.success, true, 'Apply should succeed');
  console.log(`[PASS] Apply succeeded, active version ID: ${applyResult.activeBackground?.id}`);

  // 4. Read-after-write verification
  const projectAfter = await db.getProject(projectId);
  const activeVersionId = projectAfter.activePanoramaVersionId;
  assert(activeVersionId, 'activePanoramaVersionId must be set');
  assert(activeVersionId.startsWith('pver-panorama-'), 'Version ID must use pver-panorama- namespace');

  const versionObj = (projectAfter.panoramaVersions || []).find(v => v.id === activeVersionId || v.versionId === activeVersionId);
  assert(versionObj, 'Active version must exist in panoramaVersions');

  // Exact Stitched SHA equality
  assert.strictEqual(versionObj.masterSha256, realStitchedSha256, 'masterSha256 must match real stitched artifact exactly');
  console.log(`[PASS] Exact stitched artifact SHA256 equality: candidate=${realStitchedSha256} version=${versionObj.masterSha256}`);

  // Lineage attributes
  assert.strictEqual(versionObj.projectionType, 'SPHERICAL_BAND', 'projectionType must be preserved');
  assert.strictEqual(versionObj.engine, 'OPENCV', 'engine must be preserved');

  // Truth Invariant: Coverage must be authoritative 350.5, NOT fabricated 360
  assert.strictEqual(versionObj.horizontalCoverageDeg, 350.5, 'Coverage must be 350.5, NOT defaulted to 360');
  console.log(`[PASS] Truth invariant: horizontalCoverageDeg = ${versionObj.horizontalCoverageDeg} (not fabricated 360)`);

  // Truth Invariant: Qualification must be false, NOT defaulted to true
  assert.strictEqual(versionObj.full360Qualified, false, 'full360Qualified must be false, NOT defaulted to true');
  console.log(`[PASS] Truth invariant: full360Qualified = ${versionObj.full360Qualified} (not defaulted to true)`);

  // ── 5. Test FAIL-CLOSED Candidate Boundary Enforcement ──────────────────
  console.log('\n--- Testing Fail-Closed Candidate Boundaries ---');

  // Case A: Missing projectId
  console.log('Testing rejection of candidate with MISSING projectId...');
  const candMissingProj = 'cand-no-proj';
  await db.saveSpatialBoothCandidate(projectId, {
    candidateId: candMissingProj,
    projectId: null,
    status: 'READY',
    geometryValid: true,
    applyEnabled: true
  });
  let missingProjBlocked = false;
  try {
    await db.applySpatialBoothCandidate(projectId, candMissingProj, 'internal_dev_pass');
  } catch (e) {
    if (e.message.includes('project mismatch')) missingProjBlocked = true;
  }
  assert.strictEqual(missingProjBlocked, true, 'Candidate with missing projectId must fail closed');
  console.log('[PASS] Missing projectId candidate strictly rejected');

  // Case B: Mismatched projectId
  console.log('Testing rejection of candidate with MISMATCHED projectId...');
  const candMismatchedProj = 'cand-other-proj';
  await db.saveSpatialBoothCandidate('prj-other-client', {
    candidateId: candMismatchedProj,
    projectId: 'prj-other-client',
    status: 'READY',
    geometryValid: true,
    applyEnabled: true
  });
  let mismatchBlocked = false;
  try {
    await db.applySpatialBoothCandidate(projectId, candMismatchedProj, 'internal_dev_pass');
  } catch (e) {
    if (e.message.includes('project mismatch')) mismatchBlocked = true;
  }
  assert.strictEqual(mismatchBlocked, true, 'Candidate with foreign projectId must fail closed');
  console.log('[PASS] Foreign projectId candidate strictly rejected');

  // Case C: status !== 'READY'
  console.log('Testing rejection of candidate with status !== READY...');
  const candNotReady = 'cand-not-ready';
  await db.saveSpatialBoothCandidate(projectId, {
    candidateId: candNotReady,
    projectId,
    status: 'STITCHING_IN_PROGRESS',
    geometryValid: true,
    applyEnabled: true
  });
  let notReadyBlocked = false;
  try {
    await db.applySpatialBoothCandidate(projectId, candNotReady, 'internal_dev_pass');
  } catch (e) {
    if (e.message.includes('expected \'READY\'')) notReadyBlocked = true;
  }
  assert.strictEqual(notReadyBlocked, true, 'Candidate with status !== READY must fail closed');
  console.log('[PASS] Non-READY candidate strictly rejected');

  // Case D: geometryValid !== true
  console.log('Testing rejection of candidate with geometryValid !== true...');
  const candBadGeom = 'cand-bad-geom';
  await db.saveSpatialBoothCandidate(projectId, {
    candidateId: candBadGeom,
    projectId,
    status: 'READY',
    geometryValid: false,
    applyEnabled: true
  });
  let badGeomBlocked = false;
  try {
    await db.applySpatialBoothCandidate(projectId, candBadGeom, 'internal_dev_pass');
  } catch (e) {
    if (e.message.includes('geometryValid is not true')) badGeomBlocked = true;
  }
  assert.strictEqual(badGeomBlocked, true, 'Candidate with geometryValid !== true must fail closed');
  console.log('[PASS] Invalid geometry candidate strictly rejected');

  // Case E: applyEnabled !== true
  console.log('Testing rejection of candidate with applyEnabled !== true...');
  const candApplyDisabled = 'cand-apply-disabled';
  await db.saveSpatialBoothCandidate(projectId, {
    candidateId: candApplyDisabled,
    projectId,
    status: 'READY',
    geometryValid: true,
    applyEnabled: false
  });
  let applyDisabledBlocked = false;
  try {
    await db.applySpatialBoothCandidate(projectId, candApplyDisabled, 'internal_dev_pass');
  } catch (e) {
    if (e.message.includes('applyEnabled is not true')) applyDisabledBlocked = true;
  }
  assert.strictEqual(applyDisabledBlocked, true, 'Candidate with applyEnabled !== true must fail closed');
  console.log('[PASS] applyEnabled !== true candidate strictly rejected');

  // Case F: Unknown coverage preserves null
  console.log('Testing unknown coverage preserves null...');
  const unknownCandidateId = 'cand-unknown-cov';
  await db.saveSpatialBoothCandidate(projectId, {
    candidateId: unknownCandidateId,
    projectId,
    status: 'READY',
    geometryValid: true,
    applyEnabled: true,
    engine: 'OPENCV',
    projectionType: 'SPHERICAL_BAND',
    masterSha256: realStitchedSha256,
    horizontalCoverageDeg: null, // unknown
    full360Qualified: false      // unknown
  });

  const unknownApply = await db.applySpatialBoothCandidate(projectId, unknownCandidateId, 'internal_dev_pass');
  const unknownVer = (await db.getProject(projectId)).panoramaVersions.find(v => v.candidateId === unknownCandidateId);
  assert.strictEqual(unknownVer.horizontalCoverageDeg, null, 'Unknown coverage must remain null');
  assert.strictEqual(unknownVer.full360Qualified, false, 'Unknown qualification must be false');
  console.log('[PASS] Unknown coverage remains null and full360 remains false (truth invariant preserved)');

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(' ALL APPLY ARTIFACT IDENTITY & FAIL-CLOSED TESTS PASSED (8/8)');
  console.log('══════════════════════════════════════════════════════════════════════');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
