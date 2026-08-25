/**
 * Phase 10.7N-F Forensic Acceptance Test Suite
 * True 3D Verification + Spark Gaussian Audit
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

async function runForensicTests() {
  console.log('================================================================');
  console.log('PHASE 10.7N-F FORENSIC TRUE 3D & SPARK INTEGRATION AUDIT SUITE');
  console.log('================================================================\n');

  const baseDir = 'E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\app_build';
  const modelDir = path.join(baseDir, 'data', 'uploads', 'organizations', 'org-wilo-golden-demo', 'booths', 'booth-wilo-golden-demo', 'models', 'WILO-GOLDEN-RECON-01');
  const wiloPlyPath = path.join(modelDir, 'wilo_golden_booth_splat.ply');
  const wiloGlbPath = path.join(modelDir, 'wilo_golden_booth_proxy.glb');
  const pilotPlyPath = path.join(baseDir, 'data', 'uploads', 'models', 'REAL-RECON-PILOT-01_splat.ply');

  // 1. PLY Physical Byte Forensics
  console.log('--- 1. PLY Physical Forensics ---');
  assert(fs.existsSync(wiloPlyPath), 'Wilo PLY physical file exists on disk');
  const wiloBuf = fs.readFileSync(wiloPlyPath);
  const wiloText = wiloBuf.toString('utf8');
  assert(wiloText.includes('format ascii 1.0'), 'Wilo PLY format is ASCII 1.0');
  assert(!wiloText.includes('property float rot_0'), 'Wilo PLY correctly identified as lacking Gaussian rot_0 attribute');
  assert(!wiloText.includes('property float opacity'), 'Wilo PLY correctly identified as lacking Gaussian opacity attribute');

  // 2. Verified Gaussian Splat Pilot Comparison
  console.log('\n--- 2. Verified Gaussian Splat Pilot Comparison ---');
  assert(fs.existsSync(pilotPlyPath), 'Verified Phase 6/7.5 pilot PLY exists (REAL-RECON-PILOT-01_splat.ply)');
  const pilotBuf = Buffer.alloc(2048);
  const fd = fs.openSync(pilotPlyPath, 'r');
  fs.readSync(fd, pilotBuf, 0, 2048, 0);
  fs.closeSync(fd);
  const pilotText = pilotBuf.toString('utf8');
  assert(pilotText.includes('format binary_little_endian 1.0'), 'Pilot PLY is binary little-endian Gaussian splat');
  assert(pilotText.includes('property float opacity'), 'Pilot PLY has opacity attribute');
  assert(pilotText.includes('property float rot_0'), 'Pilot PLY has rot_0 covariance attribute');

  // 3. GLB Proxy Byte Forensics
  console.log('\n--- 3. GLB Proxy File Forensics ---');
  assert(fs.existsSync(wiloGlbPath), 'Wilo GLB physical file exists on disk');
  const glbBuf = fs.readFileSync(wiloGlbPath);
  assert(glbBuf.slice(0, 4).toString('ascii') === 'glTF', 'Wilo GLB has valid glTF magic header');
  assert(glbBuf.length <= 64, `Wilo GLB confirmed as minimal 48-64 byte container (Actual: ${glbBuf.length} bytes)`);

  // 4. Viewer Truthful Labels & Fallback
  console.log('\n--- 4. Viewer Truthfulness & Photo Tour Priority ---');
  const wiloHtml = fs.readFileSync(path.join(baseDir, 'client', 'wilo-demo.html'), 'utf8');
  assert(wiloHtml.includes('Photo Tour (Primary)'), 'Wilo viewer prioritizes Photo Tour as primary');
  assert(wiloHtml.includes('3D Preview'), 'Wilo viewer designates 3D viewport as Preview');
  assert(!wiloHtml.includes('Full Radiance Showroom'), 'Misleading "Full Radiance Showroom" claim removed');

  // 5. Spark Gaussian Splat Reference in Precision Viewer
  console.log('\n--- 5. Spark Runtime Engine Reference ---');
  const precViewer = fs.readFileSync(path.join(baseDir, 'client', 'precision-viewer.js'), 'utf8');
  assert(precViewer.includes('SplatMesh') || precViewer.includes('SparkRenderer'), 'Production precision viewer includes Spark SplatMesh / Renderer');

  // 6. Security Invariants
  console.log('\n--- 6. Security Invariants ---');
  const flags = db.getFeatureFlags();
  assert(flags.stripeLiveBillingEnabled === false, 'stripeLiveBillingEnabled is false');
  assert(flags.billingKillSwitch === true, 'billingKillSwitch is ON (true)');
  assert(db.getRealMRR() === 0, 'Real MRR is strictly $0');
  assert(db.getRealPaidCustomerCount() === 0, 'Real paid customers count is strictly 0');

  // 7. Customer UI English Audit
  console.log('\n--- 7. Customer UI English Audit ---');
  const clientDir = path.join(baseDir, 'client');
  const htmlFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html'));
  let hangulFound = 0;
  const hangulRegex = /[\u3131-\uD79D]/;
  htmlFiles.forEach(f => {
    const raw = fs.readFileSync(path.join(clientDir, f), 'utf8');
    const cleaned = raw.replace(/<!--[\s\S]*?-->/g, '');
    if (hangulRegex.test(cleaned)) {
      console.warn(`Hangul in ${f}`);
      hangulFound++;
    }
  });
  assert(hangulFound === 0, `All ${htmlFiles.length} customer HTML files are 100% English`);

  console.log('\n================================================================');
  console.log(`FORENSIC TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runForensicTests().catch(err => {
  console.error('Forensic test failed:', err);
  process.exit(1);
});
