/**
 * Phase 10.7N-I Final Production Switch Gate Test Suite
 * Asserts Fail-Closed Principle, Gate Evidence Integrity, and Safe Fallback to Photo Tour
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
  console.log('PHASE 10.7N-I FINAL PRODUCTION SWITCH GATE QA SUITE');
  console.log('================================================================\n');

  const gateDir = 'E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\production_artifacts\\wilo_phase_i\\production_gate';

  // 1. Evidence Files Exist
  console.log('--- 1. Gate Evidence Files Physical Integrity ---');
  const finalGatePath = path.join(gateDir, 'FINAL_GATE_RESULT.json');
  assert(fs.existsSync(finalGatePath), 'FINAL_GATE_RESULT.json exists');
  const finalResult = JSON.parse(fs.readFileSync(finalGatePath, 'utf8'));

  assert(finalResult.datasetId === 'WILO-GEOMETRY-60-01', 'Dataset ID is WILO-GEOMETRY-60-01');
  assert(finalResult.reconstructionId === 'WILO-REAL-RECON-02', 'Reconstruction ID is WILO-REAL-RECON-02');

  // 2. Fail-Closed Production Rule
  console.log('\n--- 2. Fail-Closed Production Switch State ---');
  assert(finalResult.technicalGatePassed === false, 'technicalGatePassed is strictly false');
  assert(finalResult.final3DSwitchAllowed === false, 'final3DSwitchAllowed is strictly false (fail-closed)');
  assert(finalResult.publicDefaultMode === 'PHOTO_TOUR', 'publicDefaultMode is strictly PHOTO_TOUR');
  assert(finalResult.ownerApproval === 'pending', 'ownerApproval is strictly pending (no auto-approval)');

  // 3. Fallback Integrity
  console.log('\n--- 3. Fallback to Photo Tour ---');
  const gate4Path = path.join(gateDir, '04_CORRUPT_FALLBACK.json');
  assert(fs.existsSync(gate4Path), '04_CORRUPT_FALLBACK.json exists');
  const gate4 = JSON.parse(fs.readFileSync(gate4Path, 'utf8'));
  assert(gate4.passed === true, 'Gate 04 (Fallback) is true');
  assert(gate4.publicModeMaintained === 'PHOTO_TOUR', 'Public mode maintained as PHOTO_TOUR');

  // 4. Commercial & Safety Invariants
  console.log('\n--- 4. Commercial & Billing Safety Invariants ---');
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
