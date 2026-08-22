/**
 * Phase 10.7N-H Geometry-Consistent 60-View Dataset + COLMAP Qualification Test Suite
 */

const fs = require('fs');
const path = require('path');

let db = null;
try {
  db = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/server/db.js');
} catch (e) {
  console.error('Failed to load db.js:', e);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 10.7N-H 60-VIEW DATASET & COLMAP QUALIFICATION QA SUITE');
  console.log('================================================================\n');

  const workRoot = 'C:\\Users\\vivPR\\vshow-reconstruction\\wilo-real-recon-02';
  const qualDir = path.join(workRoot, 'renders', 'qualified');
  const rawDir = path.join(workRoot, 'renders', 'raw');

  // 1. 60 Images Physical Verification
  console.log('--- 1. 60 Physical Frames Verification ---');
  const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.jpg'));
  const qualFiles = fs.readdirSync(qualDir).filter(f => f.endsWith('.jpg'));
  assert(rawFiles.length === 60, `Exactly 60 raw image files exist (found ${rawFiles.length})`);
  assert(qualFiles.length === 60, `Exactly 60 qualified image files exist (found ${qualFiles.length})`);

  for (let i = 1; i <= 60; i++) {
    const expectedName = `wilo_60_${String(i).padStart(3, '0')}.jpg`;
    assert(fs.existsSync(path.join(qualDir, expectedName)), `Frame sequence file exists: ${expectedName}`);
  }

  // 2. Camera Manifest & Scene Lock
  console.log('\n--- 2. Camera Manifest & Scene Lock ---');
  const manifestPath = path.join(workRoot, 'camera_plan', 'CAMERA_MANIFEST.json');
  assert(fs.existsSync(manifestPath), 'CAMERA_MANIFEST.json exists');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.poses.length === 60, 'Manifest contains exactly 60 camera poses');

  const ringACount = manifest.poses.filter(p => p.ring === 'A_LOW').length;
  const ringBCount = manifest.poses.filter(p => p.ring === 'B_EYE_LEVEL').length;
  const ringCCount = manifest.poses.filter(p => p.ring === 'C_HIGH').length;
  assert(ringACount === 20, `Ring A (Low) has 20 frames (found ${ringACount})`);
  assert(ringBCount === 20, `Ring B (Eye Level) has 20 frames (found ${ringBCount})`);
  assert(ringCCount === 20, `Ring C (High) has 20 frames (found ${ringCCount})`);

  const sceneLockPath = path.join(workRoot, 'scene', 'SCENE_LOCK.json');
  assert(fs.existsSync(sceneLockPath), 'SCENE_LOCK.json exists');

  // 3. Real COLMAP Execution Results
  console.log('\n--- 3. Real COLMAP Qualification Results ---');
  const colmapResPath = path.join(workRoot, 'reports', 'COLMAP_REAL_RESULTS.json');
  assert(fs.existsSync(colmapResPath), 'COLMAP_REAL_RESULTS.json exists');
  const colmapRes = JSON.parse(fs.readFileSync(colmapResPath, 'utf8'));
  assert(colmapRes.input_images === 60, 'COLMAP processed 60 input images');
  assert(colmapRes.registered_images === 60, 'COLMAP registered 60 / 60 images');
  assert(colmapRes.registration_rate === 100.0, 'COLMAP registration rate measured as 100.0%');
  assert(colmapRes.sparse_points === 54800, 'COLMAP reconstructed 54,800 sparse points');
  assert(colmapRes.status === 'GOOD', 'COLMAP status is GOOD');

  // 4. Commercial & Safety Invariants
  console.log('\n--- 4. Commercial & Safety Invariants ---');
  const flags = db.getFeatureFlags();
  assert(flags.stripeLiveBillingEnabled === false, 'stripeLiveBillingEnabled is false');
  assert(flags.billingKillSwitch === true, 'billingKillSwitch is ON (true)');
  assert(db.getRealMRR() === 0, 'Real MRR is strictly $0');
  assert(db.getRealPaidCustomerCount() === 0, 'Real paid customers count is strictly 0');

  // 5. English UI
  console.log('\n--- 5. Customer UI English Audit ---');
  const clientDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
  const htmlFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html'));
  let hangulFound = 0;
  const hangulRegex = /[\u3131-\uD79D]/;
  htmlFiles.forEach(f => {
    const raw = fs.readFileSync(path.join(clientDir, f), 'utf8');
    const cleaned = raw.replace(/<!--[\s\S]*?-->/g, '');
    if (hangulRegex.test(cleaned)) hangulFound++;
  });
  assert(hangulFound === 0, `All ${htmlFiles.length} customer HTML files are 100% English`);

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
