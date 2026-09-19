/**
 * test_stage2_capture_engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic Test Suite for 3DZ Stage 2 Capture Engine
 *
 * Validates all Codex Fast-Track Phase 2 Contracts:
 *   [T01] Clockwise rotation mapping
 *   [T02] Continuous yaw unwrap & 0°/360° boundary crossing
 *   [T03] Target acquisition and loss within ±3.5° tolerance
 *   [T04] Pitch (±15°) and Roll (±10°) safety envelope
 *   [T05] Stable hold time requirement (>= 350 ms)
 *   [T06] Fail-closed countdown cancellation on movement/tilt breach
 *   [T07] Strict countdown restart from 3 (never resuming from 2 or 1)
 *   [T08] Duplicate checkpoint prevention guard
 *   [T09] Candidate rejection (quality < 0.60) & best canonical selection
 *   [T10] Full 12-checkpoint sequence completion (1/12 -> 12/12)
 *   [T11] Atomic RETAKE teardown: tracks stopped, listeners detached, 0/12 display
 *   [T12] Camera single-stream invariant after restart
 *   [T13] Schema 5 manifest generation with C12.7 ring adjacency
 *   [T14] Manual upload normalization: UNKNOWN orientation, null yaw, schema 5
 *   [T15] Visual neon states (Yellow, Blue, Green)
 *   [T16] Generation network submission disabled boundary (call count = 0)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { Stage2CaptureEngine, STATES, NEON_STATES } = require('../virtual-tradeshow-commercial-v1/client/capture/stage2-capture-engine.js');

let passCount = 0;
let failCount = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('================================================================');
console.log('3DZ STAGE 2 CAPTURE ENGINE — DETERMINISTIC VERIFICATION SUITE');
console.log('================================================================\n');

// ─── MOCK HELPERS ────────────────────────────────────────────────────────────
function createMockStream() {
  const tracks = [{
    kind: 'video',
    readyState: 'live',
    stop() { this.readyState = 'ended'; }
  }];
  return {
    id: 'mock-stream-' + Math.random(),
    active: true,
    getTracks: () => tracks,
  };
}

function createMockWindow() {
  const listeners = {};
  return {
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(cb => cb !== fn);
    },
    getListenerCount(event) {
      return (listeners[event] || []).length;
    },
    emit(event, data) {
      (listeners[event] || []).forEach(fn => fn(data));
    }
  };
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

test('[T01] Clockwise rotation increases positive normalized yaw', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());

  // First sensor event establishes origin at alpha=180.0
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });
  assert.strictEqual(engine.relativeYawOrigin, 180.0);
  assert.strictEqual(engine.unwrappedYaw, 0.0);

  // Clockwise rotation on Android decreases alpha (180 -> 150)
  engine.processSensorInput({ alpha: 150.0, beta: 0.0, gamma: 0.0, timestamp: 2000 });
  assert.strictEqual(engine.unwrappedYaw, 30.0, 'Unwrapped yaw should advance +30°');
  assert.strictEqual(engine.normalizedYaw, 30.0, 'Normalized yaw should be 30°');
});

test('[T02] Continuous yaw unwrap & 0°/360° boundary crossing', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());

  // Origin at 10.0
  engine.processSensorInput({ alpha: 10.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });
  
  // Rotate clockwise: alpha decreases 10 -> 0 -> 350
  engine.processSensorInput({ alpha: 0.0, beta: 0.0, gamma: 0.0, timestamp: 2000 });
  assert.strictEqual(engine.unwrappedYaw, 10.0);

  // Cross 0° boundary to 350° (delta in alpha is +350, unwraps to -10 -> clockwiseDelta is +10)
  engine.processSensorInput({ alpha: 350.0, beta: 0.0, gamma: 0.0, timestamp: 3000 });
  assert.strictEqual(engine.unwrappedYaw, 20.0, 'Crossing 0/360 boundary must advance smoothly to 20°');
  assert.strictEqual(engine.normalizedYaw, 20.0);

  // Continue rotating clockwise across a full 360 circle in small steps (e.g. 30 deg steps)
  let currentAlpha = 350.0;
  let ts = 3000;
  for (let step = 0; step < 11; step++) {
    currentAlpha = (currentAlpha - 30.0 + 360.0) % 360.0;
    ts += 1000;
    engine.processSensorInput({ alpha: currentAlpha, beta: 0.0, gamma: 0.0, timestamp: ts });
  }
  assert.ok(engine.unwrappedYaw >= 350.0, `Unwrapped yaw (${engine.unwrappedYaw}) tracks cumulative continuous rotation past 350°`);
});

test('[T03] Target acquisition and loss within ±3.5° tolerance', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());
  // Origin at 180 (target 0 is 0.0°)
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });

  // Within tolerance (2.0° <= 3.5°)
  engine.processSensorInput({ alpha: 178.0, beta: 0.0, gamma: 0.0, timestamp: 1100 });
  assert.strictEqual(engine.state, STATES.STABILIZING, 'Within 3.5° should enter STABILIZING');

  // Move out of tolerance (6.0° > 3.5°)
  engine.processSensorInput({ alpha: 174.0, beta: 0.0, gamma: 0.0, timestamp: 1200 });
  assert.strictEqual(engine.state, STATES.APPROACHING_TARGET, 'Exceeding 3.5° within 10° should revert to APPROACHING_TARGET');
  assert.strictEqual(engine.stabilityStartTime, null, 'Stability hold should be reset');
});

test('[T04] Pitch (±15°) and Roll (±10°) safety envelope', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });

  // Angle is perfect (0°), but pitch exceeds limit (16° > 15°)
  engine.processSensorInput({ alpha: 180.0, beta: 16.5, gamma: 0.0, timestamp: 1100 });
  assert.notStrictEqual(engine.state, STATES.STABILIZING, 'Unsafe pitch must prevent stabilizing');

  // Safe pitch, but roll exceeds limit (11° > 10°)
  engine.processSensorInput({ alpha: 180.0, beta: 5.0, gamma: 11.2, timestamp: 1200 });
  assert.notStrictEqual(engine.state, STATES.STABILIZING, 'Unsafe roll must prevent stabilizing');

  // Both within limits
  engine.processSensorInput({ alpha: 180.0, beta: 8.0, gamma: 4.0, timestamp: 1300 });
  assert.strictEqual(engine.state, STATES.STABILIZING, 'Safe pitch and roll allows stabilizing');
});

test('[T05] Stable hold time requirement (>= 350 ms)', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });

  // At t=1100: stable entry
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1100 });
  assert.strictEqual(engine.state, STATES.STABILIZING);

  // At t=1300 (200ms < 350ms): still stabilizing
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1300 });
  assert.strictEqual(engine.state, STATES.STABILIZING, 'Before 350ms should remain in STABILIZING');

  // At t=1460 (360ms >= 350ms): should reach STOP and trigger countdown
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1460 });
  assert.strictEqual(engine.isCountdownState(), true, 'After 350ms stable hold should enter COUNTDOWN');
  engine.cancelCountdown(); // Clean up timer
});

test('[T06] Fail-closed countdown cancellation on movement/tilt breach', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });
  
  // Establish stability and trigger countdown
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1100 });
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1500 });
  assert.strictEqual(engine.state, STATES.COUNTDOWN_3);

  // User suddenly shakes or turns device during countdown (yaw drifts to 20°)
  engine.processSensorInput({ alpha: 160.0, beta: 0.0, gamma: 0.0, timestamp: 1600 });
  
  // Must fail-closed
  assert.strictEqual(engine.isCountdownState(), false, 'Countdown must cancel immediately on breach');
  assert.strictEqual(engine.countdownTimer, null, 'Timer must be nulled');
  assert.strictEqual(engine.countdownSecondsRemaining, 0, 'Remaining seconds reset');
  assert.strictEqual(engine.state, STATES.TURN_CLOCKWISE);
});

test('[T07] Strict countdown restart from 3 (never resuming from 2 or 1)', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1000 });
  
  // Establish stability and enter countdown
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1100 });
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: 1500 });
  assert.strictEqual(engine.state, STATES.COUNTDOWN_3);

  // Manually step countdown to 2 to simulate progression
  engine.countdownSecondsRemaining = 2;
  engine.transitionTo(STATES.COUNTDOWN_2);
  assert.strictEqual(engine.state, STATES.COUNTDOWN_2);

  // Breach stability
  engine.processSensorInput({ alpha: 160.0, beta: 0.0, gamma: 0.0, timestamp: 1600 });
  assert.strictEqual(engine.countdownSecondsRemaining, 0);

  // Re-acquire target and feed realistic stationary sensor stream to allow velocity filter to settle
  let ts = 1600;
  for (let i = 0; i < 8; i++) {
    ts += 100;
    engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: ts });
  }
  // Hold stationary past stableHoldMs (350ms)
  ts += 400;
  engine.processSensorInput({ alpha: 180.0, beta: 0.0, gamma: 0.0, timestamp: ts });

  // Countdown must restart from 3, NOT 2
  assert.strictEqual(engine.state, STATES.COUNTDOWN_3, 'Countdown must restart from 3');
  assert.strictEqual(engine.countdownSecondsRemaining, 3, 'Seconds remaining must reset to 3');
  engine.cancelCountdown();
});

test('[T08] Duplicate checkpoint prevention guard', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());

  // Capture target 0
  const success1 = engine.executeCapture();
  assert.strictEqual(success1, true, 'First capture of checkpoint 0 must succeed');
  assert.strictEqual(engine.canonicalFrames.length, 1);
  assert.strictEqual(engine.currentTargetIndex, 1);

  // Force target index back to 0 to simulate duplicate capture attempt
  engine.currentTargetIndex = 0;
  const success2 = engine.executeCapture();
  assert.strictEqual(success2, false, 'Duplicate capture of checkpoint 0 must be rejected');
  assert.strictEqual(engine.canonicalFrames.length, 1, 'Canonical frame count must not increase');
});

test('[T09] Candidate rejection (quality < 0.60) & best canonical selection', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());

  // Submit candidate frame with poor quality (0.42 < 0.60)
  const lowQualityFrame = {
    frameId: 'frm-01-cand-low',
    order: 1,
    imageHash: 'sha256:lowq',
    timestamp: Date.now(),
    yawDeg: 0.0,
    pitchDeg: 0.0,
    rollDeg: 0.0,
    angularVelocityDegSec: 2.0,
    qualityScore: 0.42,
    width: 1920,
    height: 1080
  };
  const successLow = engine.executeCapture(lowQualityFrame);
  assert.strictEqual(successLow, false, 'Frame with quality < 0.60 must be rejected');
  assert.strictEqual(engine.candidateFrames.length, 1, 'Candidate buffer holds rejected frame for analysis');
  assert.strictEqual(engine.canonicalFrames.length, 0, 'Canonical frames must not include low-quality frame');

  // Submit high quality frame (0.94 >= 0.60)
  const highQualityFrame = {
    frameId: 'frm-01-cand-high',
    order: 1,
    imageHash: 'sha256:highq',
    timestamp: Date.now(),
    yawDeg: 0.0,
    pitchDeg: 0.0,
    rollDeg: 0.0,
    angularVelocityDegSec: 1.0,
    qualityScore: 0.94,
    width: 1920,
    height: 1080
  };
  const successHigh = engine.executeCapture(highQualityFrame);
  assert.strictEqual(successHigh, true, 'Frame with quality >= 0.60 must be accepted');
  assert.strictEqual(engine.candidateFrames.length, 2, 'Total candidates = 2');
  assert.strictEqual(engine.canonicalFrames.length, 1, 'Canonical frames = 1');
});

test('[T10] Full 12-checkpoint sequence completion (1/12 -> 12/12)', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());

  for (let i = 0; i < 12; i++) {
    assert.strictEqual(engine.currentTargetIndex, i);
    const captured = engine.executeCapture();
    assert.strictEqual(captured, true, `Capture ${i + 1}/12 must succeed`);
  }

  assert.strictEqual(engine.canonicalFrames.length, 12, 'Must have exactly 12 canonical frames');
  assert.strictEqual(engine.state, STATES.GENERATION_READY, 'State must reach GENERATION_READY after 12 captures');
  assert.ok(engine.normalizedManifest, 'Manifest must be generated');
  assert.strictEqual(engine.normalizedManifest.frameCount, 12);
});

test('[T11] Atomic RETAKE teardown: tracks stopped, listeners detached, 0/12 display', () => {
  const engine = new Stage2CaptureEngine();
  const mockStream = createMockStream();
  const mockWin = createMockWindow();

  engine.startCamera(mockStream);
  engine.attachSensorListeners(mockWin);
  assert.strictEqual(mockWin.getListenerCount('deviceorientation'), 1);

  // Capture 3 frames
  engine.executeCapture();
  engine.executeCapture();
  engine.executeCapture();
  assert.strictEqual(engine.canonicalFrames.length, 3);

  // Perform atomic retake
  const retakeReport = engine.retake();

  // Verify full teardown
  assert.strictEqual(retakeReport.capturedCount, 0);
  assert.strictEqual(retakeReport.display, '0/12');
  assert.strictEqual(retakeReport.streamCount, 0);
  assert.strictEqual(retakeReport.sensorListenerCount, 0);
  assert.strictEqual(mockStream.getTracks()[0].readyState, 'ended', 'Camera track must be ended');
  assert.strictEqual(engine.canonicalFrames.length, 0, 'Canonical frames buffer must be empty');
  assert.strictEqual(engine.candidateFrames.length, 0, 'Candidate frames buffer must be empty');
  assert.strictEqual(engine.capturedTargets.size, 0, 'Captured target set must be empty');
  assert.strictEqual(engine.relativeYawOrigin, null, 'Yaw origin must be null');
  assert.strictEqual(engine.state, STATES.IDLE, 'State must be IDLE');
});

test('[T12] Camera single-stream invariant after restart', () => {
  const engine = new Stage2CaptureEngine();
  const stream1 = createMockStream();
  const stream2 = createMockStream();

  engine.startCamera(stream1);
  assert.strictEqual(engine.streamCount, 1);

  // Starting camera again should cleanly tear down stream1 and maintain streamCount = 1
  engine.startCamera(stream2);
  assert.strictEqual(stream1.getTracks()[0].readyState, 'ended', 'Previous stream must be stopped');
  assert.strictEqual(engine.streamCount, 1, 'Stream count must remain strictly 1');
});

test('[T13] Schema 5 manifest generation with C12.7 ring adjacency', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());

  for (let i = 0; i < 12; i++) {
    engine.executeCapture();
  }

  const manifest = engine.normalizedManifest;
  assert.strictEqual(manifest.schemaVersion, 5);
  assert.strictEqual(manifest.sourceType, 'CAMERA_ROTATIONAL_SENSOR');
  assert.strictEqual(manifest.c12_7_ringConstraintPreserved, true);
  assert.strictEqual(manifest.frames.length, 12);

  // Check cyclic adjacency of ring
  // Frame 0: prev is frame 11, next is frame 1
  assert.strictEqual(manifest.frames[0].frameId, 'frm-01');
  assert.strictEqual(manifest.frames[0].adjacency.prevFrameId, 'frm-12');
  assert.strictEqual(manifest.frames[0].adjacency.nextFrameId, 'frm-02');
  assert.strictEqual(manifest.frames[0].adjacency.sequentialOrder, 1);
  assert.strictEqual(manifest.frames[0].orientationStatus, 'SENSOR_DERIVED');

  // Frame 11: prev is frame 10, next is frame 0
  assert.strictEqual(manifest.frames[11].frameId, 'frm-12');
  assert.strictEqual(manifest.frames[11].adjacency.prevFrameId, 'frm-11');
  assert.strictEqual(manifest.frames[11].adjacency.nextFrameId, 'frm-01');
  assert.strictEqual(manifest.frames[11].adjacency.sequentialOrder, 12);
});

test('[T14] Manual upload normalization: UNKNOWN orientation, null yaw, schema 5', () => {
  const mockUploads = Array.from({ length: 8 }, (_, i) => ({
    imageHash: `sha256:upload-${i}`,
    width: 1920,
    height: 1080,
    qualityScore: 0.88,
  }));

  const manifest = Stage2CaptureEngine.normalizeManualUploads(mockUploads);

  assert.strictEqual(manifest.schemaVersion, 5);
  assert.strictEqual(manifest.sourceType, 'MANUAL_UPLOAD');
  assert.strictEqual(manifest.frameCount, 8);
  assert.strictEqual(manifest.c12_7_ringConstraintPreserved, true);

  manifest.frames.forEach((frame, idx) => {
    assert.strictEqual(frame.orientationStatus, 'UNKNOWN', 'Upload frame must have UNKNOWN orientation status');
    assert.strictEqual(frame.yawDeg, null, 'Upload frame yawDeg must be null');
    assert.strictEqual(frame.pitchDeg, null, 'Upload frame pitchDeg must be null');
    assert.strictEqual(frame.rollDeg, null, 'Upload frame rollDeg must be null');
    assert.ok(frame.adjacency.prevFrameId, 'Adjacency prev must exist');
    assert.ok(frame.adjacency.nextFrameId, 'Adjacency next must exist');
  });

  // Check ring closure for upload frames
  assert.strictEqual(manifest.frames[0].adjacency.prevFrameId, 'upld-08');
  assert.strictEqual(manifest.frames[7].adjacency.nextFrameId, 'upld-01');
});

test('[T15] Visual neon states (Yellow, Blue, Green)', () => {
  const engine = new Stage2CaptureEngine();

  engine.transitionTo(STATES.TURN_CLOCKWISE);
  assert.strictEqual(engine.getNeonState().name, 'NEON_YELLOW');

  engine.transitionTo(STATES.APPROACHING_TARGET);
  assert.strictEqual(engine.getNeonState().name, 'NEON_YELLOW');

  engine.transitionTo(STATES.STOP);
  assert.strictEqual(engine.getNeonState().name, 'NEON_BLUE');

  engine.transitionTo(STATES.COUNTDOWN_3);
  assert.strictEqual(engine.getNeonState().name, 'NEON_BLUE');

  engine.transitionTo(STATES.COUNTDOWN_1);
  assert.strictEqual(engine.getNeonState().name, 'NEON_BLUE');

  engine.transitionTo(STATES.CAPTURE);
  assert.strictEqual(engine.getNeonState().name, 'NEON_GREEN');

  engine.transitionTo(STATES.N_OF_12_CAPTURED);
  assert.strictEqual(engine.getNeonState().name, 'NEON_GREEN');

  engine.transitionTo(STATES.CAPTURE_COMPLETE);
  assert.strictEqual(engine.getNeonState().name, 'NEON_GREEN');
});

test('[T16] Generation network submission disabled boundary (call count = 0)', () => {
  const engine = new Stage2CaptureEngine();
  const submissionResult = engine.submitGenerationJob();

  assert.strictEqual(submissionResult.submitted, false, 'Submission must be disabled');
  assert.strictEqual(submissionResult.status, 'SUBMISSION_DISABLED_STAGE2_P1_BOUNDARY');
  assert.strictEqual(submissionResult.generationNetworkCallCount, 0, 'Call count must be 0');
  assert.strictEqual(engine.generationNetworkCallCount, 0);
});

test('[T17] Explicit upright portrait pose boundary test (flat desk rejected, upright accepted)', () => {
  const engine = new Stage2CaptureEngine();
  engine.startCamera(createMockStream());
  const win = createMockWindow();
  engine.attachSensorListeners(win);

  // 1. Establish origin
  win.emit('deviceorientation', { alpha: 180, beta: 90, gamma: 0, timeStamp: 1000 });
  assert.strictEqual(engine.currentPitch, 0.0, 'Beta=90 produces 0° upright pitch deviation');

  // 2. Phone lying flat on desk (beta=0): pitch deviation = -90°. Must be rejected.
  win.emit('deviceorientation', { alpha: 180, beta: 0, gamma: 0, timeStamp: 1100 });
  assert.strictEqual(engine.currentPitch, -90.0);
  assert.notStrictEqual(engine.state, STATES.STABILIZING, 'Flat desk must be rejected as UNSAFE pitch');

  // 3. Phone tilted 45°: pitch deviation = -45°. Must be rejected.
  win.emit('deviceorientation', { alpha: 180, beta: 45, gamma: 0, timeStamp: 1200 });
  assert.strictEqual(engine.currentPitch, -45.0);
  assert.notStrictEqual(engine.state, STATES.STABILIZING, '45° tilt must be rejected');

  // 4. Phone upright within limit (beta=76°, deviation = -14° <= 15°): accepted.
  win.emit('deviceorientation', { alpha: 180, beta: 76, gamma: 0, timeStamp: 1300 });
  assert.strictEqual(engine.currentPitch, -14.0);
  assert.strictEqual(engine.state, STATES.STABILIZING, '76° beta (14° deviation <= 15°) must be accepted as SAFE');

  // 5. Phone upright past limit (beta=74°, deviation = -16° > 15°): rejected.
  win.emit('deviceorientation', { alpha: 180, beta: 74, gamma: 0, timeStamp: 1400 });
  assert.strictEqual(engine.currentPitch, -16.0);
  assert.notStrictEqual(engine.state, STATES.STABILIZING, '74° beta (16° deviation > 15°) must be rejected as UNSAFE');
});

test('[T18] Lightweight Stage 2 RI telemetry recording & sample metrics', async () => {
  const engine = new Stage2CaptureEngine();
  const sessionId = engine.initTelemetry('qa-sess-test-token', 'prj-test-01');

  assert.ok(sessionId.startsWith('RI-S2-'), 'Session ID must follow RI-S2 prefix');
  assert.strictEqual(engine.telemetry.qaSessionToken, 'qa-sess-test-token');

  // Record orientation samples
  engine.processSensorInput({ alpha: 180, beta: 0, gamma: 0, rawBeta: 90, rawGamma: 0, source: 'deviceorientationabsolute', timestamp: 1000 });
  engine.processSensorInput({ alpha: 150, beta: 2, gamma: 1, rawBeta: 92, rawGamma: 1, source: 'deviceorientationabsolute', timestamp: 1100 });

  assert.strictEqual(engine.sensorSampleCount, 2);
  assert.strictEqual(engine.validAlphaCount, 2);
  assert.strictEqual(engine.validBetaCount, 2);
  assert.strictEqual(engine.sensorSource, 'deviceorientationabsolute');
  assert.ok(engine.telemetry.stateTransitions.length > 0, 'Transitions must be recorded in telemetry buffer');

  // Mock fetch to verify header auth and zero token in body
  let capturedHeaders = null;
  let capturedBody = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        sessionId: capturedBody.sessionId,
        status: 'PERSISTED',
        artifactPath: `/production_artifacts/mobile_runtime_inspector/${capturedBody.sessionId}/`,
        filesSaved: ['summary.json', 'timeline.json']
      })
    };
  };

  const sendResult = await engine.sendTelemetryReport('/api/internal-qa/mobile-ri/report');
  global.fetch = originalFetch;

  assert.strictEqual(sendResult.success, true, 'Telemetry report submission must succeed');
  assert.strictEqual(sendResult.status, 'PERSISTED');
  assert.strictEqual(capturedHeaders['x-qa-session'], 'qa-sess-test-token');
  assert.strictEqual(capturedBody.qaSessionToken, undefined, 'qaSessionToken must NOT be present in body payload');
});


console.log('\n================================================================');
console.log(`TEST EXECUTION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
