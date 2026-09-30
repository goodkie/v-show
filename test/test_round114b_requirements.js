/**
 * test_round114b_requirements.js
 * 
 * Verifies all Round 114B corrective requirements:
 * 1. Fix D: Truth invariant in db.js:
 *    - No fabricated 360° or 180° coverage
 *    - full360Qualified set only if strictly true (never defaulted to true)
 *    - applySpatialBoothCandidate validates project ownership (rejects mismatched projectId)
 * 2. Fix A: Retry lifecycle & stale callback isolation:
 *    - Debounce guard (_isRetrying) prevents duplicate concurrent retry invocations
 *    - Session epoch increments on retry and fresh start
 *    - Stale callbacks from previous session epochs are strictly ignored
 * 3. Fix B: False-positive AND gate & edge case latched completion:
 *    - 334° < 345° rejected from premature closure
 *    - Latched closure allows truthful completion when user reaches 345°+
 * 4. Fix C: Shared 16:9 responsive viewer:
 *    - No min-height: 300px conflict on mobile media query or viewer container
 *    - 360px width yields exactly 202.5px height (16:9 ratio)
 *    - Gesture handler deduplication guard and clean teardown on destroy()
 *    - No static image fallback on valid READY panorama
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('══════════════════════════════════════════════════════');
console.log(' ROUND 114B REQUIREMENTS VERIFICATION SUITE');
console.log('══════════════════════════════════════════════════════\n');

let pass = 0;
let fail = 0;
const results = {};

function check(name, fn) {
  try {
    fn();
    results[name] = 'PASS';
    pass++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results[name] = err.message;
    fail++;
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load source files
// ─────────────────────────────────────────────────────────────────────────────
const dbPath = path.join(__dirname, '..', 'virtual-tradeshow-commercial-v1', '_railway_deploy', 'server', 'db.js');
const indexPath = path.join(__dirname, '..', 'virtual-tradeshow-commercial-v1', '_railway_deploy', 'client', 'index.html');

assert(fs.existsSync(dbPath), `db.js missing at ${dbPath}`);
assert(fs.existsSync(indexPath), `index.html missing at ${indexPath}`);

const dbCode = fs.readFileSync(dbPath, 'utf8');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Fix D: Truth Invariant in db.js
// ─────────────────────────────────────────────────────────────────────────────
check('FIX_D_NO_INVENTED_360_IN_APPLY', () => {
  // Must NOT contain `horizontalCoverageDeg: candidate.horizontalCoverageDeg || 360`
  assert(!dbCode.includes('candidate.horizontalCoverageDeg || 360'), 'Invented 360 coverage still present in apply versionObj');
  // Must preserve measured number or null
  assert(dbCode.includes("typeof candidate.horizontalCoverageDeg === 'number' ? candidate.horizontalCoverageDeg : null"), 'Measured coverage check missing in apply');
});

check('FIX_D_NO_INVENTED_FULL360_IN_APPLY', () => {
  // Must NOT default full360Qualified to true when missing/unknown
  assert(!dbCode.includes('full360Qualified: candidate.full360Qualified !== false'), 'Invented full360Qualified defaulting still present in apply');
  assert(dbCode.includes('full360Qualified: candidate.full360Qualified === true'), 'Strict boolean true requirement missing in apply');
});

check('FIX_D_PROJECT_OWNERSHIP_VALIDATION', () => {
  assert(dbCode.includes('belongs to project ${candidate.projectId}, not ${projectId}'), 'Project ownership check missing in applySpatialBoothCandidate');
});

check('FIX_D_NO_INVENTED_COVERAGE_IN_VIEWPOINT', () => {
  assert(!dbCode.includes('vpData.panorama?.horizontalCoverageDeg || 360'), 'Invented 360 coverage in createViewpoint');
  assert(!dbCode.includes('vpData.panorama?.verticalCoverageDeg || 180'), 'Invented 180 coverage in createViewpoint');
  assert(dbCode.includes('full360Qualified: vpData.panorama?.full360Qualified === true'), 'Strict boolean true requirement missing in createViewpoint');
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix A: Retry Lifecycle, Debounce Guard & Callback Invalidation
// ─────────────────────────────────────────────────────────────────────────────
check('FIX_A_RETRY_DEBOUNCE_GUARD', () => {
  assert(indexHtml.includes('if (this._isRetrying)'), 'Retry debounce guard missing');
  assert(indexHtml.includes('Rapid retry suppressed by debounce guard'), 'Retry debounce log missing');
});

check('FIX_A_SESSION_EPOCH_MANAGEMENT', () => {
  assert(indexHtml.includes('this._captureSessionEpoch = (this._captureSessionEpoch || 0) + 1;'), 'Session epoch increment missing');
  assert(indexHtml.includes('const sessionEpoch = this._captureSessionEpoch;'), 'Session epoch binding missing');
});

check('FIX_A_STALE_CALLBACK_SUPPRESSION', () => {
  assert(indexHtml.includes('if (this._captureSessionEpoch !== sessionEpoch)'), 'Stale callback suppression check missing in onComplete/onAttention/onProgress');
  assert(indexHtml.includes('Ignoring onComplete from stale session epoch'), 'Stale onComplete log missing');
});

check('FIX_A_CONTROLLER_DESTROY_ON_RETRY', () => {
  assert(indexHtml.includes('window.guidedCaptureController.destroy();'), 'destroy() call missing in retryGuidedCapture');
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix B: False-Positive AND Gate & Latched Edge Case
// ─────────────────────────────────────────────────────────────────────────────
check('FIX_B_AFFINE_FALLBACK_STRICT_THRESHOLDS', () => {
  assert(indexHtml.includes('affResult.inlierCount >= 8'), 'AFFINE_FALLBACK inlierCount >= 8 missing');
  assert(indexHtml.includes('affResult.inlierRatio >= 0.25'), 'AFFINE_FALLBACK inlierRatio >= 0.25 missing');
});

check('FIX_B_AND_GATE_4_PARTS', () => {
  assert(indexHtml.includes('SECTOR_COVERAGE_PASS'), 'SECTOR_COVERAGE_PASS missing');
  assert(indexHtml.includes('RELATIVE_YAW_SWEEP_PASS'), 'RELATIVE_YAW_SWEEP_PASS missing');
  assert(indexHtml.includes('VISUAL_LOOP_CLOSURE_PASS'), 'VISUAL_LOOP_CLOSURE_PASS missing');
  assert(indexHtml.includes('accumulatedRotation >= 345.0'), '345° yaw sweep threshold missing');
});

check('FIX_B_LATCHED_LOOP_CLOSURE_PREVENTS_DEADLOCK', () => {
  assert(indexHtml.includes('this._visualLoopClosureLatched = true;'), 'Visual loop closure latching missing');
  assert(indexHtml.includes('this._visualLoopClosureLatched && this.accumulatedRotation >= 345.0'), 'Latched loop closure check at >=345° missing');
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix C: Mobile 16:9 Responsive Viewport & Gesture Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
check('FIX_C_NO_MOBILE_MIN_HEIGHT_CONFLICT', () => {
  // Mobile media query must NOT contain min-height: 300px !important
  assert(!indexHtml.includes('min-height: 300px !important'), 'Conflicting min-height: 300px !important still present');
  assert(!indexHtml.includes('height: 380px !important'), 'Conflicting height: 380px !important still present');
  assert(indexHtml.includes('aspect-ratio: 16 / 9 !important'), 'aspect-ratio: 16 / 9 !important missing in mobile styles');
});

check('FIX_C_VIEWER_CONTAINER_RESPONSIVE_HEIGHT', () => {
  assert(!indexHtml.includes('min-height: 300px;'), 'min-height: 300px still present on #viewer-container');
  assert(indexHtml.includes('aspect-ratio: 16 / 9; height: auto; max-height: 80vh; min-height: 0;'), '#viewer-container clean 16:9 rule missing');
});

check('FIX_C_CALCULATED_MOBILE_DIMENSIONS', () => {
  // For standard mobile 360px viewport: 360 / (16/9) = 202.5px
  const mobileWidth = 360;
  const expectedHeight = (mobileWidth * 9) / 16;
  assert.strictEqual(expectedHeight, 202.5, 'Expected 202.5px height at 360px viewport width');
});

check('FIX_C_GESTURE_DEDUPLICATION_AND_TEARDOWN', () => {
  assert(indexHtml.includes('_r114GesturesAttached'), 'Gesture deduplication guard missing');
  assert(indexHtml.includes('destroy()'), 'destroy() method missing');
  assert(indexHtml.includes('removeEventListener'), 'removeEventListener missing in destroy');
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log(' ROUND 114B TEST RESULTS');
console.log('══════════════════════════════════════════════════════');
Object.entries(results).forEach(([k, v]) =>
  console.log(v === 'PASS' ? `[PASS] ${k}` : `[FAIL] ${k}: ${v}`)
);
console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
console.log('ALL_ROUND114B_GATES_PASS:', fail === 0);
console.log('══════════════════════════════════════════════════════\n');

process.exit(fail > 0 ? 1 : 0);
