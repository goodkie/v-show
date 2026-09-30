/**
 * test_apply_artifact_identity_e2e.js
 * 
 * Tests the real DB apply pipeline and artifact identity preservation:
 * 1. Seed project and READY candidate with measured telemetry (350.5° coverage, full360=false)
 * 2. Execute applySpatialBoothCandidate
 * 3. Verify read-after-write exact SHA equality, coverage, qualification, and lineage
 * 4. Verify project ownership rejection on mismatched projectId
 * 5. Verify unknown coverage preserves null (truth invariant)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

console.log('══════════════════════════════════════════════════════');
console.log(' APPLY ARTIFACT IDENTITY & TRUTH INVARIANT E2E TEST');
console.log('══════════════════════════════════════════════════════\n');

// Load DB
const dbModulePath = path.join(__dirname, '..', 'virtual-tradeshow-commercial-v1', '_railway_deploy', 'server', 'db.js');
const db = require(dbModulePath);

async function runTests() {
  const projectId = 'prj-free-b0c6f3ea';
  const candidateId = 'cand-panorama-r114b-valid';
  const testSha256 = '4c4ce19d0881384d2c4ad066637d9464669921d4ebe8486b9b809607f0f9bd4f';

  // 1. Setup project
  await db.mutate(d => {
    d.projects = d.projects || [];
    d.projects.push({
      id: projectId,
      name: 'Apex Robotics Inc. Virtual Booth (QA)',
      status: 'ACTIVE',
      panoramaVersions: [],
      spatialBoothVersions: []
    });
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
    masterSha256: testSha256,
    stitchedPanoramaUrl: `/data/panoramas/${candidateId}/stitched.jpg`,
    activeBackgroundUrl: `/data/panoramas/${candidateId}/stitched.jpg`,
    horizontalCoverageDeg: 350.5,
    full360Qualified: false, // measured: full sphere not qualified
    nativeFilename: 'stitched.jpg'
  };

  await db.saveSpatialBoothCandidate(projectId, candidate);
  console.log(`[PASS] Saved candidate ${candidateId} to DB`);

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

  // Exact SHA equality
  assert.strictEqual(versionObj.masterSha256, testSha256, 'masterSha256 must match candidate exactly');
  console.log(`[PASS] Exact SHA256 equality verified: candidate=${testSha256} version=${versionObj.masterSha256}`);

  // Lineage attributes
  assert.strictEqual(versionObj.projectionType, 'SPHERICAL_BAND', 'projectionType must be preserved');
  assert.strictEqual(versionObj.engine, 'OPENCV', 'engine must be preserved');

  // Truth Invariant: Coverage must be authoritative 350.5, NOT fabricated 360
  assert.strictEqual(versionObj.horizontalCoverageDeg, 350.5, 'Coverage must be 350.5, NOT defaulted to 360');
  console.log(`[PASS] Truth invariant: horizontalCoverageDeg = ${versionObj.horizontalCoverageDeg} (not fabricated 360)`);

  // Truth Invariant: Qualification must be false, NOT defaulted to true
  assert.strictEqual(versionObj.full360Qualified, false, 'full360Qualified must be false, NOT defaulted to true');
  console.log(`[PASS] Truth invariant: full360Qualified = ${versionObj.full360Qualified} (not defaulted to true)`);

  // 5. Test project ownership enforcement
  console.log('Testing project ownership validation...');
  const foreignCandidateId = 'cand-foreign-proj';
  await db.saveSpatialBoothCandidate('prj-other-company', {
    candidateId: foreignCandidateId,
    projectId: 'prj-other-company',
    status: 'READY'
  });

  let ownershipBlocked = false;
  try {
    await db.applySpatialBoothCandidate(projectId, foreignCandidateId, 'internal_dev_pass');
  } catch (err) {
    if (err.message.includes('belongs to project prj-other-company, not prj-free-b0c6f3ea')) {
      ownershipBlocked = true;
    }
  }
  assert.strictEqual(ownershipBlocked, true, 'Foreign candidate must be rejected with project ownership error');
  console.log('[PASS] Foreign candidate strictly rejected by project ownership guard');

  // 6. Test unknown coverage preserves null
  console.log('Testing unknown coverage preserves null...');
  const unknownCandidateId = 'cand-unknown-cov';
  await db.saveSpatialBoothCandidate(projectId, {
    candidateId: unknownCandidateId,
    projectId,
    status: 'READY',
    engine: 'OPENCV',
    projectionType: 'SPHERICAL_BAND',
    masterSha256: 'abc123sha',
    horizontalCoverageDeg: null, // unknown
    full360Qualified: undefined   // unknown
  });

  const unknownApply = await db.applySpatialBoothCandidate(projectId, unknownCandidateId, 'internal_dev_pass');
  const unknownVer = unknownApply.activePanoramaVersion || unknownApply.activeSpatialVersion;
  assert.strictEqual(unknownVer.horizontalCoverageDeg, null, 'Unknown coverage must remain null');
  assert.strictEqual(unknownVer.full360Qualified, false, 'Unknown qualification must be false');
  console.log('[PASS] Unknown coverage remains null and full360 remains false (fail-closed)');

  console.log('\n══════════════════════════════════════════════════════');
  console.log(' ALL APPLY ARTIFACT IDENTITY E2E TESTS PASSED (6/6)');
  console.log('══════════════════════════════════════════════════════');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
