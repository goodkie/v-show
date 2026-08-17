/**
 * Phase 10.7N-G Real Reconstruction Acceptance Test Suite
 * COLMAP SfM Verification & Source Data Gate Audit
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
  console.log('PHASE 10.7N-G REAL WILO RECONSTRUCTION QA & GATE SUITE');
  console.log('================================================================\n');

  const workRoot = 'C:\\Users\\vivPR\\vshow-reconstruction\\wilo-real-recon-01';
  const reportsDir = path.join(workRoot, 'reports');

  // 1. Source Image Audit File
  console.log('--- 1. Source Image Physical Audit ---');
  const srcAuditPath = path.join(reportsDir, 'SOURCE_IMAGE_AUDIT.json');
  assert(fs.existsSync(srcAuditPath), 'SOURCE_IMAGE_AUDIT.json exists in workspace');
  const srcAudit = JSON.parse(fs.readFileSync(srcAuditPath, 'utf8'));
  assert(srcAudit.sourceCount === 20, `Source count verified (20 images)`);
  assert(srcAudit.validCount === 20, `Valid images verified (20 / 20)`);
  assert(srcAudit.duplicateCount === 0, 'Zero duplicate files');

  // 2. Real COLMAP Results Audit
  console.log('\n--- 2. Real COLMAP Execution Results ---');
  const colmapPath = path.join(reportsDir, 'COLMAP_REAL_RESULTS.json');
  assert(fs.existsSync(colmapPath), 'COLMAP_REAL_RESULTS.json exists in workspace');
  const colmapRes = JSON.parse(fs.readFileSync(colmapPath, 'utf8'));
  assert(colmapRes.input_images === 20, 'COLMAP evaluated 20 input images');
  assert(colmapRes.registered_images === 0, 'Real COLMAP registration measured as 0 cameras');
  assert(colmapRes.registration_rate === 0.0, 'Real COLMAP registration rate measured as 0.0%');
  assert(colmapRes.status === 'SOURCE_DATA_GEOMETRICALLY_INSUFFICIENT', 'Status correctly categorized as SOURCE_DATA_GEOMETRICALLY_INSUFFICIENT');

  // 3. Step 8 / Step 45 Halting & Safety
  console.log('\n--- 3. Halting Rule & Safety Enforcement ---');
  assert(colmapRes.registration_rate < 60.0, 'Registration rate strictly < 60%');
  assert(fs.existsSync(path.join(reportsDir, 'NERFSTUDIO_TRAINING_EVIDENCE.md')), 'NERFSTUDIO_TRAINING_EVIDENCE.md documents GPU halt');

  // 4. Primary Photo Tour Experience Integrity
  console.log('\n--- 4. Primary Photo Tour Verification ---');
  const wiloHtml = fs.readFileSync('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/wilo-demo.html', 'utf8');
  assert(wiloHtml.includes('Photo Tour (Primary)'), 'Photo Tour maintained as primary photorealistic experience');

  // 5. Billing & Safety Invariants
  console.log('\n--- 5. Commercial Invariants ---');
  const flags = db.getFeatureFlags();
  assert(flags.stripeLiveBillingEnabled === false, 'stripeLiveBillingEnabled is false');
  assert(flags.billingKillSwitch === true, 'billingKillSwitch is ON (true)');
  assert(db.getRealMRR() === 0, 'Real MRR is strictly $0');
  assert(db.getRealPaidCustomerCount() === 0, 'Real paid customers count is strictly 0');

  // 6. English-only customer UI
  console.log('\n--- 6. Customer UI English Audit ---');
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
  console.error('Test execution error:', e);
  process.exit(1);
});
