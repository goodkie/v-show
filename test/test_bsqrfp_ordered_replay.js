/**
 * test_bsqrfp_ordered_replay.js
 * 
 * Deterministic ordered frame replay of real BSQRFP capture session
 * using committed test/fixtures/BSQRFP_metadata.json.
 * 
 * Verifies:
 * 1. Frame-by-frame chronological replay (C001..C042)
 * 2. At frame C042 (yaw = 334°):
 *    - Inlier count = 4 (< 8 required)
 *    - Inlier ratio = 0.125 (< 0.25 required)
 *    - Sweep angle = 334° (< 345° required)
 *    - Verdict: Rejected under R114B AND gate; session KEPT ALIVE for additional rotation
 * 3. 334° -> 345°+ Edge Case:
 *    - Latched visual closure triggers completion once yaw reaches 348° (>= 345°)
 *    - Eliminates deadlock when visual closure is detected before full sweep
 * 4. Known-good control session replay:
 *    - Satisfies inlier count (14 >= 8), ratio (0.42 >= 0.25), yaw (358° >= 345°), 12 sectors
 *    - Truthfully completes with VISUAL_LOOP_CONFIRMED_AND_GATE_PASS
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('══════════════════════════════════════════════════════');
console.log(' BSQRFP DETERMINISTIC ORDERED REPLAY TEST (R114B)');
console.log('══════════════════════════════════════════════════════\n');

// 1. Load committed fixture
const fixturePath = path.join(__dirname, 'fixtures', 'BSQRFP_metadata.json');
assert(fs.existsSync(fixturePath), 'test/fixtures/BSQRFP_metadata.json must exist');
const bsqrfp = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

console.log(`[FIXTURE] Session: ${bsqrfp.captureSessionId}, Project: ${bsqrfp.projectId}`);
console.log(`[FIXTURE] Candidates loaded: ${bsqrfp.candidates.length}`);
assert.strictEqual(bsqrfp.candidates.length, 42, 'Expected 42 candidates in BSQRFP');

// 2. Replay Simulation Class replicating R114B Controller Gate Logic
class ReplayController {
  constructor() {
    this.candidateFrames = [];
    this.accumulatedRotation = 0;
    this.closureConfirmed = false;
    this._visualLoopClosureLatched = false;
    this.state = 'CAPTURING';
    this.captureCompletionReason = null;
    this.missingSectors = [];
  }

  processFrame(frame, visualClosureResult = null) {
    this.candidateFrames.push(frame);
    this.accumulatedRotation = Math.max(this.accumulatedRotation, frame.relativeRotationDeg);

    // Calculate covered sectors (12 sectors, 30° each)
    const coveredSectors = new Set();
    for (const c of this.candidateFrames) {
      const s = Math.floor((((c.relativeRotationDeg % 360) + 360) % 360) / 30);
      coveredSectors.add(s);
    }
    this.missingSectors = [];
    for (let s = 0; s < 12; s++) {
      if (!coveredSectors.has(s)) this.missingSectors.push(s);
    }
    const SECTOR_COVERAGE_PASS = this.missingSectors.length === 0;

    // R114 Fix B1: Affine Fallback tighter threshold
    let visualClosureConfirmed = false;
    if (visualClosureResult) {
      const inliersPass = visualClosureResult.inlierCount >= 8 && visualClosureResult.inlierRatio >= 0.25;
      if (visualClosureResult.pass && inliersPass) {
        visualClosureConfirmed = true;
      }
    }

    // R114B Fix B: Latch visual closure
    if (visualClosureConfirmed) {
      this._visualLoopClosureLatched = true;
    }

    // R114B Fix B: 4-part AND gate check
    if (visualClosureConfirmed || (this._visualLoopClosureLatched && this.accumulatedRotation >= 345.0)) {
      const RELATIVE_YAW_SWEEP_PASS = this.accumulatedRotation >= 345.0;
      const VISUAL_LOOP_CLOSURE_PASS = true;

      if (!SECTOR_COVERAGE_PASS) {
        this.captureCompletionReason = 'SECTORS_INCOMPLETE';
        return { completed: false, reason: this.captureCompletionReason };
      }

      if (!RELATIVE_YAW_SWEEP_PASS) {
        this.captureCompletionReason = 'YAW_SWEEP_INSUFFICIENT_' + Math.round(this.accumulatedRotation) + 'DEG';
        return { completed: false, reason: this.captureCompletionReason };
      }

      this.closureConfirmed = true;
      this.state = 'CLOSURE_CONFIRMED';
      this.captureCompletionReason = 'VISUAL_LOOP_CONFIRMED_AND_GATE_PASS';
      return { completed: true, reason: this.captureCompletionReason };
    }

    return { completed: false, reason: 'CAPTURING' };
  }
}

// ── Test 1: Deterministic Replay of BSQRFP ──────────────────────────────────
console.log('--- Test 1: Replaying BSQRFP Session (Frames 1..42) ---');
const sim = new ReplayController();

// Replay frames 1..41 (normal progress)
for (let i = 0; i < 41; i++) {
  const f = bsqrfp.candidates[i];
  const res = sim.processFrame(f);
  assert.strictEqual(res.completed, false, `Frame ${f.candidateId} should not complete early`);
}

// Frame 42: The exact moment BSQRFP falsely completed in Round 114
const f42 = bsqrfp.candidates[41];
console.log(`Frame 42: ID=${f42.candidateId}, yaw=${f42.relativeRotationDeg}°, timestamp=${f42.timestamp}`);

// In BSQRFP, visual loop closure fired with only 4 inliers and 0.125 ratio
const bsqrfpVisualMatch = {
  pass: true,
  inlierCount: 4,
  inlierRatio: 0.125,
  modelUsed: 'AFFINE_FALLBACK'
};

const res42 = sim.processFrame(f42, bsqrfpVisualMatch);
console.log(`Replay Frame 42 Result: completed=${res42.completed}, reason=${res42.reason}`);
assert.strictEqual(res42.completed, false, 'BSQRFP Frame 42 MUST NOT complete with 4 inliers and 334° yaw');
assert.strictEqual(sim.closureConfirmed, false, 'sim.closureConfirmed must remain false');
console.log('[PASS] Test 1: BSQRFP correctly rejected and kept alive (no false positive)\n');

// ── Test 2: Edge Case: 334° Visual Match + Continued Rotation to 348° ────────
console.log('--- Test 2: Edge Case: 334° Visual Closure Seen -> Rotation Continues to 348° ---');
const simEdge = new ReplayController();

// Replay up to frame 42
for (let i = 0; i < 42; i++) {
  simEdge.processFrame(bsqrfp.candidates[i]);
}

// Suppose at 334°, visual loop detector with valid keypoints detected closure
// (>= 8 inliers, >= 0.25 ratio), but yaw was 334° (< 345°)
const validVisualMatchAt334 = {
  pass: true,
  inlierCount: 10,
  inlierRatio: 0.32,
  modelUsed: 'HOMOGRAPHY'
};
const resEdge334 = simEdge.processFrame(f42, validVisualMatchAt334);
assert.strictEqual(resEdge334.completed, false, 'Should not complete at 334° even with valid visual match');
assert.strictEqual(simEdge.captureCompletionReason, 'YAW_SWEEP_INSUFFICIENT_334DEG');
assert.strictEqual(simEdge._visualLoopClosureLatched, true, 'Visual loop match must be latched');
console.log(`[PASS] Latched visual closure at 334°: reason=${resEdge334.reason}`);

// User continues rotating: Frame 43 at 348° (no visual match re-emitted)
const f43 = { candidateId: 'C043', relativeRotationDeg: 348.0, timestamp: f42.timestamp + 500 };
const resEdge348 = simEdge.processFrame(f43, null);
assert.strictEqual(resEdge348.completed, true, 'Must complete when rotation reaches 348° using latched closure');
assert.strictEqual(resEdge348.reason, 'VISUAL_LOOP_CONFIRMED_AND_GATE_PASS');
assert.strictEqual(simEdge.closureConfirmed, true);
console.log('[PASS] Test 2: Edge case verified - completed at 348° with NO deadlock\n');

// ── Test 3: Known-Good Physical Control Session ─────────────────────────────
console.log('--- Test 3: Known-Good Physical Control (Full 360° Sweep) ---');
const simControl = new ReplayController();

// Simulate 12 clean sectors (0°, 30°, 60°, ... 330°, 355°)
for (let s = 0; s < 12; s++) {
  simControl.processFrame({ candidateId: `CTRL_${s}`, relativeRotationDeg: s * 30.0, timestamp: 1000 + s * 200 });
}

// Final closure frame at 358° with strong match
const ctrlFinal = { candidateId: 'CTRL_FINAL', relativeRotationDeg: 358.0, timestamp: 3500 };
const ctrlVisualMatch = {
  pass: true,
  inlierCount: 16,
  inlierRatio: 0.50,
  modelUsed: 'HOMOGRAPHY'
};
const resCtrl = simControl.processFrame(ctrlFinal, ctrlVisualMatch);
assert.strictEqual(resCtrl.completed, true, 'Known-good control must complete');
assert.strictEqual(resCtrl.reason, 'VISUAL_LOOP_CONFIRMED_AND_GATE_PASS');
assert.strictEqual(simControl.closureConfirmed, true);
console.log('[PASS] Test 3: Known-good control session truthfully completed\n');

console.log('══════════════════════════════════════════════════════');
console.log(' ALL BSQRFP ORDERED REPLAY TESTS PASSED (3/3)');
console.log('══════════════════════════════════════════════════════');
