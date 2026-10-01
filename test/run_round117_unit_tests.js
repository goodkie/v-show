// test/run_round117_unit_tests.js
// Direct in-engine unit & regression test for Round 117
// Tests exact GuidedCaptureController & VisualLoopDetector extracted directly from client/index.html

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('══════════════════════════════════════════════════════════════════════');
console.log(' ROUND 117 PHYSICAL REGRESSION RECOVERY SUITE: ONE-TURN 360 ACCURACY');
console.log('══════════════════════════════════════════════════════════════════════\n');

const htmlPath = path.join(__dirname, '../virtual-tradeshow-commercial-v1/client/index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// Extract VisualLoopDetector and GuidedCaptureController class definitions cleanly using indexOf
const startIdx = html.indexOf('class VisualLoopDetector');
assert(startIdx !== -1, 'class VisualLoopDetector not found in client/index.html');

const endIdx = html.indexOf('class SetupWizardController');
assert(endIdx !== -1, 'class SetupWizardController not found in client/index.html');

const classesCode = html.substring(startIdx, endIdx);

// Create minimal browser sandbox
const sandbox = {
  window: {},
  document: {
    getElementById: () => null,
    createElement: () => ({ getContext: () => null })
  },
  navigator: {
    mediaDevices: { getUserMedia: async () => {} },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
  },
  DeviceOrientationEvent: function() {},
  DeviceMotionEvent: function() {},
  Date: Date,
  Math: Math,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  console: console,
  Set: Set,
  Uint8Array: Uint8Array,
  Infinity: Infinity,
  Number: Number
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(classesCode, sandbox);

const VisualLoopDetector = sandbox.VisualLoopDetector || sandbox.window.VisualLoopDetector;
const GuidedCaptureController = sandbox.GuidedCaptureController || sandbox.window.GuidedCaptureController;

assert(typeof VisualLoopDetector === 'function', 'VisualLoopDetector failed to load');
assert(typeof GuidedCaptureController === 'function', 'GuidedCaptureController failed to load');

console.log('[1/8] Test 1: Wrap-safe alpha 0/360 wrap calculation...');
{
  const gcc = new GuidedCaptureController();
  gcc.state = 'CAPTURING';

  // CW: 358 -> 2 (delta = +4)
  gcc.handleOrientation({ alpha: 358, beta: 90, gamma: 0 });
  gcc.handleOrientation({ alpha: 2, beta: 90, gamma: 0 });
  assert(Math.abs(gcc.accumulatedRotation - 4.0) < 0.2, `Expected CW wrap ~4 deg, got ${gcc.accumulatedRotation}`);
  assert.strictEqual(gcc.rotationDirection, 'CLOCKWISE');

  // CCW: 2 -> 358 (delta = -4)
  const gccCCW = new GuidedCaptureController();
  gccCCW.state = 'CAPTURING';
  gccCCW.handleOrientation({ alpha: 2, beta: 90, gamma: 0 });
  gccCCW.handleOrientation({ alpha: 358, beta: 90, gamma: 0 });
  assert(Math.abs(gccCCW.accumulatedRotation - 4.0) < 0.2, `Expected CCW wrap ~4 deg, got ${gccCCW.accumulatedRotation}`);
  assert.strictEqual(gccCCW.rotationDirection, 'COUNTERCLOCKWISE');
  console.log('  [PASS] Test 1: alpha 0/360 wrap handled seamlessly (CW: ' + gcc.accumulatedRotation + '°, CCW: ' + gccCCW.accumulatedRotation + '°).');
}

console.log('\n[2/8] Test 2: Sparse orientation samples with deltas > 45° (one-turn ~360° proof)...');
{
  const gcc = new GuidedCaptureController();
  gcc.state = 'CAPTURING';

  // Simulating realistic mobile rotation:
  // Angles: 0 -> 48 -> 98 -> 150 -> 205 -> 260 -> 312 -> 358 -> 10 (wrap)
  // Deltas:  +48,  +50,  +52,  +55,  +55,  +52,  +46,  +12 = 370 deg total
  const sparseAngles = [0, 48, 98, 150, 205, 260, 312, 358, 10];
  const deltas = [];

  for (let i = 0; i < sparseAngles.length; i++) {
    gcc.handleOrientation({ alpha: sparseAngles[i], beta: 88, gamma: 2 });
    if (i > 0) deltas.push(gcc.telemetry.lastYawDelta);
  }

  console.log('  Sparse deltas evaluated:', deltas);
  console.log('  Accumulated rotation in ONE physical turn:', gcc.accumulatedRotation + '°');
  assert(gcc.accumulatedRotation >= 360.0, `Expected accumulated >= 360°, got ${gcc.accumulatedRotation}`);
  assert.strictEqual(gcc.rotationDirection, 'CLOCKWISE');
  console.log('  [PASS] Test 2: deltas > 45° correctly integrated in ONE turn (accumulated: ' + gcc.accumulatedRotation + '°).');
}

console.log('\n[3/8] Test 3: Historical C12.6 S23 Ultra canonical yaw sequence integration (RI-M-23UEHR)...');
{
  const gcc = new GuidedCaptureController();
  gcc.state = 'CAPTURING';

  // Historical sequence: 0.0, 35.6, 65.9, 73.9, 103.1, 133.5, 168.8, 213.0, 228.6, 270.6, 309.3, 339.7, 355.4
  const historicalSequence = [0.0, 35.6, 65.9, 73.9, 103.1, 133.5, 168.8, 213.0, 228.6, 270.6, 309.3, 339.7, 355.4];
  for (const a of historicalSequence) {
    gcc.handleOrientation({ alpha: a, beta: 89, gamma: 1 });
  }

  console.log('  Historical sequence integrated rotation:', gcc.accumulatedRotation + '°');
  assert(Math.abs(gcc.accumulatedRotation - 355.4) < 1.0, `Expected 355.4°, got ${gcc.accumulatedRotation}`);
  assert.strictEqual(gcc.rotationDirection, 'CLOCKWISE');
  console.log('  [PASS] Test 3: Historical S23 Ultra yaw sequence accumulates exactly 355.4° in ONE turn.');
}

console.log('\n[4/8] Test 4: Smooth 0 -> 360 cumulative rotation (72 steps of 5°)...');
{
  const gcc = new GuidedCaptureController();
  gcc.state = 'CAPTURING';

  for (let i = 0; i <= 72; i++) {
    const a = (i * 5) % 360;
    gcc.handleOrientation({ alpha: a, beta: 90, gamma: 0 });
  }

  console.log('  Smooth 72-step turn accumulated:', gcc.accumulatedRotation + '°');
  assert.strictEqual(gcc.accumulatedRotation, 360);
  assert.strictEqual(gcc.rotationDirection, 'CLOCKWISE');
  assert.strictEqual(gcc.state, 'SEARCHING_FOR_START_OVERLAP');
  console.log('  [PASS] Test 4: 72-step turn accumulates exactly 360.0° and enters SEARCHING_FOR_START_OVERLAP.');
}

console.log('\n[5/8] Test 5: Retry starts at exactly 0° with clean state re-baseline...');
{
  const gcc = new GuidedCaptureController();
  gcc.state = 'CAPTURING';

  for (let i = 0; i <= 30; i++) {
    gcc.handleOrientation({ alpha: (i * 5) % 360, beta: 90, gamma: 0 });
  }
  const rotBefore = gcc.accumulatedRotation;
  gcc.resetCaptureForRetry('USER_EXPLICIT_RETRY');

  assert.strictEqual(gcc.accumulatedRotation, 0.0);
  assert.strictEqual(gcc.normalizedSensorRotationDeg, 0.0);
  assert.strictEqual(gcc.lastAngle, null);
  assert.strictEqual(gcc.directionLocked, false);
  console.log('  [PASS] Test 5: Retry cleanly resets rotation to 0.0° and clears lastAngle.');
}

console.log('\n[6/8] Test 6: VisualLoopDetector.reset() purges all start references and closure state...');
{
  const vld = new VisualLoopDetector();
  vld.addStartReference('cand_0', 0, { keypoints: [], descriptors: new Uint8Array(10), width: 320, height: 240 });
  vld.addStartReference('cand_1', 10, { keypoints: [], descriptors: new Uint8Array(10), width: 320, height: 240 });
  vld.closureConfirmed = true;
  vld.consecutiveConfirmations = 2;

  assert.strictEqual(vld.startReferences.length, 2);
  vld.reset();

  assert.strictEqual(vld.startReferences.length, 0);
  assert.strictEqual(vld.closureConfirmed, false);
  assert.strictEqual(vld.consecutiveConfirmations, 0);
  console.log('  [PASS] Test 6: VisualLoopDetector.reset() successfully purges all state.');
}

console.log('\n[7/8] Test 7: Truthful visual closure confirmation at >= 300 deg...');
{
  const vld = new VisualLoopDetector();

  const pts = [];
  const desc = new Uint8Array(25 * 32);
  for (let i = 0; i < 25; i++) {
    const x = 40 + (i % 5) * 50;
    const y = 40 + Math.floor(i / 5) * 40;
    pts.push({ x, y, score: 50, cell: (Math.floor(y / 40) * 8) + Math.floor(x / 40) });
    for (let b = 0; b < 32; b++) desc[i * 32 + b] = (i + b) % 256;
  }
  const refFeat = { keypoints: pts, descriptors: desc, width: 320, height: 240 };
  vld.addStartReference('C001', 0, refFeat);

  const res1 = vld.evaluateClosure('C035', 350, refFeat);
  const res2 = vld.evaluateClosure('C036', 355, refFeat);

  assert.strictEqual(vld.closureConfirmed, true);
  assert(res2.inlierCount >= 8);
  console.log('  [PASS] Test 7: Truthful visual closure confirmed on 2 consecutive matching frames (' + res2.inlierCount + ' inliers, model: ' + res2.modelUsed + ').');
}

console.log('\n[8/8] Test 8: Closure failure remains capped at <= 99% without false 100%...');
{
  const gcc = new GuidedCaptureController();
  gcc.state = 'CAPTURING';

  // Sweep all the way to 380° without visual closure
  for (let i = 0; i <= 76; i++) {
    gcc.handleOrientation({ alpha: (i * 5) % 360, beta: 90, gamma: 0 });
  }

  assert(gcc.progressPercent <= 99, `Progress must be <= 99%, got ${gcc.progressPercent}`);
  assert.strictEqual(gcc.closureConfirmed, false);
  console.log('  [PASS] Test 8: Sweep past 360° without visual match stays capped at ' + gcc.progressPercent + '% (truthful gate).');
}

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(' ALL 8 ROUND 117 REGRESSION TESTS PASSED (100%)');
console.log('══════════════════════════════════════════════════════════════════════\n');
