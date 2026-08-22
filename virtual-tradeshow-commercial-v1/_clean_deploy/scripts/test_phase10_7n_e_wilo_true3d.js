/**
 * Phase 10.7N-E Acceptance Test Suite
 * Wilo True 3D Reconstruction + Real Tenant-Isolated Upload Repair
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  console.log('PHASE 10.7N-E WILO TRUE 3D RECONSTRUCTION & UPLOAD QA SUITE');
  console.log('================================================================\n');

  // 1. Source Image Directory & Manifest
  console.log('--- 1. Source Image Audit (20 Cropped Images) ---');
  const srcDir = 'E:\\vivpr\\ai\\v-show\\source\\cropped-images';
  const manifestPath = 'E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\production_artifacts\\wilo_reconstruction\\SOURCE_IMAGE_MANIFEST.json';
  
  assert(fs.existsSync(srcDir), 'Source image directory exists (cropped-images)');
  assert(fs.existsSync(manifestPath), 'SOURCE_IMAGE_MANIFEST.json exists');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.totalFilesFound === 20, `Found exactly 20 physical files (Actual: ${manifest.totalFilesFound})`);
  assert(manifest.totalValidImages === 20, `All 20 images valid and usable (Actual: ${manifest.totalValidImages})`);
  assert(manifest.duplicateCount === 0, 'Zero duplicate images detected');
  assert(manifest.corruptCount === 0, 'Zero corrupt files detected');

  // 2. Tenant-Isolated Storage Architecture
  console.log('\n--- 2. Tenant-Isolated Capture Storage ---');
  const tenantCaptureDir = 'E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\app_build\\data\\uploads\\organizations\\org-wilo-golden-demo\\booths\\booth-wilo-golden-demo\\captures\\WILO-GOLDEN-RECON-01\\images';
  assert(fs.existsSync(tenantCaptureDir), 'Tenant-isolated capture directory exists');

  const captureFiles = fs.readdirSync(tenantCaptureDir);
  assert(captureFiles.length === 20, `Tenant capture contains 20 isolated images (Actual: ${captureFiles.length})`);

  // 3. Database Persistence & Capture QA
  console.log('\n--- 3. Capture Dataset DB Tracking & QA ---');
  db.ensureWiloGoldenDemo();
  const capture = db.getCaptureById('WILO-GOLDEN-RECON-01');
  assert(capture !== null, 'Capture dataset WILO-GOLDEN-RECON-01 exists in DB');
  assert(capture.organizationId === 'org-wilo-golden-demo', 'Capture belongs to org-wilo-golden-demo');
  assert(capture.dataEnvironment === 'SYNTHETIC_TEST', 'Capture environment is SYNTHETIC_TEST');
  assert(capture.imageCount === 20, `Capture tracks 20 images (Actual: ${capture.imageCount})`);
  assert(capture.qualityRating.status === 'QA_PASSED', 'Capture quality status is QA_PASSED');
  assert(capture.qualityRating.grade === 'GOOD', 'Capture quality grade is GOOD (15-49 images tier)');

  // 4. Physical 3D Assets & Quality Gate
  console.log('\n--- 4. True 3D Physical Model Assets ---');
  const tenantModelDir = 'E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\app_build\\data\\uploads\\organizations\\org-wilo-golden-demo\\booths\\booth-wilo-golden-demo\\models\\WILO-GOLDEN-RECON-01';
  const plyFile = path.join(tenantModelDir, 'wilo_golden_booth_splat.ply');
  const glbFile = path.join(tenantModelDir, 'wilo_golden_booth_proxy.glb');

  assert(fs.existsSync(plyFile), 'Physical PLY 3D scene file exists (wilo_golden_booth_splat.ply)');
  assert(fs.existsSync(glbFile), 'Physical GLB proxy geometry file exists (wilo_golden_booth_proxy.glb)');

  const plyStats = fs.statSync(plyFile);
  assert(plyStats.size > 100000, `PLY file size verified (>100KB, Actual: ${plyStats.size} bytes)`);

  const booth = db.getBoothById('booth-wilo-golden-demo');
  assert(booth.spatialModel && booth.spatialModel.format === 'PLY_GAUSSIAN_SPLAT', 'Booth spatialModel format is PLY_GAUSSIAN_SPLAT');
  assert(booth.spatialModel.qualityGate === 'GOLDEN_DEMO', 'Booth spatialModel quality gate is GOLDEN_DEMO');
  assert(booth.spatialModel.registeredCameras === 18, 'Preflight solved 18 registered cameras (90.0%)');

  // 5. 3D Scene Settings
  console.log('\n--- 5. 3D Scene Settings Persistence ---');
  await db.saveBooth3DSettings('booth-wilo-golden-demo', {
    cameraFov: 48,
    walkSpeed: 4.0,
    walkHeight: 1.65,
    lightingPreset: 'STUDIO_COMMERCIAL',
    backgroundTheme: 'DARK_MINIMAL'
  });
  const settings = db.getBooth3DSettings('booth-wilo-golden-demo');
  assert(settings.cameraFov === 48, 'Saved camera FOV verified (48)');
  assert(settings.walkSpeed === 4.0, 'Saved walk speed verified (4.0 m/s)');

  // 6. Product 3D Model API
  console.log('\n--- 6. Product 3D Model Management ---');
  const updatedProd = await db.updateProduct3DModel('prod-wilo-01', {
    format: 'GLB',
    url: '/uploads/organizations/org-wilo-golden-demo/products/prod-wilo-01/pump.glb',
    filename: 'siboost_smart.glb',
    bytes: 2048500
  });
  assert(updatedProd.model3D && updatedProd.model3D.format === 'GLB', 'Product 3D model format is GLB');
  assert(updatedProd.model3D.status === 'AVAILABLE', 'Product 3D model status is AVAILABLE');

  // 7. Security Invariants
  console.log('\n--- 7. Security Invariants & Isolation ---');
  const flags = db.getFeatureFlags();
  assert(flags.stripeLiveBillingEnabled === false, 'stripeLiveBillingEnabled is strictly false');
  assert(flags.billingKillSwitch === true, 'billingKillSwitch is ON (true)');

  const realMRR = db.getRealMRR();
  const realPaidCustomers = db.getRealPaidCustomerCount();
  assert(realMRR === 0, `REAL MRR is strictly $0 (Actual: $${realMRR})`);
  assert(realPaidCustomers === 0, `REAL Paid Customers is strictly 0 (Actual: ${realPaidCustomers})`);

  // 8. Customer UI English Audit
  console.log('\n--- 8. Customer UI English Audit ---');
  const clientDir = 'E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\app_build\\client';
  const htmlFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html'));
  let hangulCount = 0;
  const hangulRegex = /[\u3131-\uD79D]/;

  htmlFiles.forEach(f => {
    const content = fs.readFileSync(path.join(clientDir, f), 'utf8');
    const stripped = content.replace(/<!--[\s\S]*?-->/g, '');
    if (hangulRegex.test(stripped)) {
      console.warn(`Hangul detected in ${f}`);
      hangulCount++;
    }
  });
  assert(hangulCount === 0, `All ${htmlFiles.length} customer-facing HTML files are 100% English (0 Hangul)`);

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
