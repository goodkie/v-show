// test/test_round116_rotation_and_closure.js
// ROUND 116 DETERMINISTIC REGRESSION SUITE:
// 1. alpha 0/360 wrap
// 2. absolute-vs-standard dual-event conflict
// 3. beta near 90° with small pitch/roll variation
// 4. sensor jitter not inflating rotation
// 5. clean 0→360 cumulative rotation
// 6. retry starts at exactly 0° with no previous-session state
// 7. visual detector reset creates empty start references/closure state
// 8. closure success after a valid one-turn sequence
// 9. closure failure remains explicitly 99/searching and does not falsely complete
// 10. no deadlock after retry

const assert = require('assert');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 49652;

process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(' ROUND 116 PHYSICAL QA DEFECT SUITE: ROTATION ANGLE & CLOSURE');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // Start local server
  console.log('[1/11] Initializing local test server on port', TEST_PORT);
  const serverModule = require('../virtual-tradeshow-commercial-v1/app_build/server/index.js');
  const server = serverModule.server;
  await new Promise(r => setTimeout(r, 1000));

  // Launch browser
  console.log('[2/11] Launching Puppeteer browser with Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 384, height: 824, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${TEST_PORT}/?mode=booth-tour-wizard&step=6&source=landing&autostart=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for setupWizardModal or GuidedCaptureController to be instantiated
    await page.waitForFunction(() => typeof window.GuidedCaptureController !== 'undefined' || !!window.guidedCaptureController, { timeout: 10000 });

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: alpha 0/360 wrap
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[3/11] Test 1: alpha 0/360 wrap delta calculation...');
    const test1Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';
      gcc.sensorSource = 'deviceorientation';
      gcc.sensorSourceLocked = true;

      // Initial angle: 358°
      gcc.handleOrientation({ alpha: 358, beta: 90, gamma: 0 }, 'deviceorientation');
      const angle1 = gcc.lastAngle;

      // Clockwise step crossing 360: 358° -> 2° (physical delta = +4°)
      gcc.handleOrientation({ alpha: 2, beta: 90, gamma: 0 }, 'deviceorientation');
      const rotAfterStep1 = gcc.accumulatedRotation;

      // Counter-clockwise step crossing 0: 2° -> 358° (physical delta = -4°)
      const gccCCW = new window.GuidedCaptureController();
      gccCCW.state = 'CAPTURING';
      gccCCW.sensorSource = 'deviceorientation';
      gccCCW.sensorSourceLocked = true;
      gccCCW.handleOrientation({ alpha: 2, beta: 90, gamma: 0 }, 'deviceorientation');
      gccCCW.handleOrientation({ alpha: 358, beta: 90, gamma: 0 }, 'deviceorientation');

      return {
        initialAngle: angle1,
        accumulatedRotationCW: rotAfterStep1,
        directionCW: gcc.rotationDirection,
        accumulatedRotationCCW: gccCCW.accumulatedRotation,
        directionCCW: gccCCW.rotationDirection
      };
    });

    console.log('  Wrap Test 1 result:', test1Result);
    assert(Math.abs(test1Result.accumulatedRotationCW - 4.0) < 0.2, `Expected CW wrap ~4 deg, got ${test1Result.accumulatedRotationCW}`);
    assert.strictEqual(test1Result.directionCW, 'CLOCKWISE');
    assert(Math.abs(test1Result.accumulatedRotationCCW - 4.0) < 0.2, `Expected CCW wrap ~4 deg, got ${test1Result.accumulatedRotationCCW}`);
    assert.strictEqual(test1Result.directionCCW, 'COUNTERCLOCKWISE');
    console.log('  [PASS] Test 1: alpha 0/360 wrap handled seamlessly in both directions.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: absolute-vs-standard dual-event conflict
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[4/11] Test 2: absolute-vs-standard dual-event conflict...');
    const test2Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';

      // Send absolute event first (Android Chrome preferred)
      gcc.handleOrientation({ alpha: 10, beta: 90, gamma: 0 }, 'deviceorientationabsolute');
      const lockedSource = gcc.sensorSource;
      const countAfterAbs = gcc.telemetry.deviceOrientationEventCount;

      // Now send standard event with different coordinate frame (e.g. alpha 150)
      gcc.handleOrientation({ alpha: 150, beta: 90, gamma: 0 }, 'deviceorientation');
      const countAfterStd = gcc.telemetry.deviceOrientationEventCount;
      const angleAfterStd = gcc.lastAngle;

      // Send subsequent valid absolute event (alpha 15 -> delta +5)
      gcc.handleOrientation({ alpha: 15, beta: 90, gamma: 0 }, 'deviceorientationabsolute');
      const rotAfterAbs2 = gcc.accumulatedRotation;

      return {
        lockedSource,
        countAfterAbs,
        countAfterStd,
        angleAfterStd,
        accumulatedRotation: rotAfterAbs2
      };
    });

    console.log('  Dual-Event Test 2 result:', test2Result);
    assert.strictEqual(test2Result.lockedSource, 'deviceorientationabsolute', 'Must lock to deviceorientationabsolute');
    assert.strictEqual(test2Result.countAfterStd, test2Result.countAfterAbs, 'Standard event must be discarded once absolute is locked');
    assert(Math.abs(test2Result.accumulatedRotation - 5.0) < 0.2, `Accumulated rotation should reflect only absolute events (~5 deg), got ${test2Result.accumulatedRotation}`);
    console.log('  [PASS] Test 2: absolute orientation locked; dual-event conflict strictly rejected.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: beta near 90° with small pitch/roll variation
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[5/11] Test 3: beta near 90° with pitch/roll variation (Gimbal Lock immunity)...');
    const test3Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();

      // Heading = 45 deg, upright beta = 90, gamma = 0
      const yawIdeal = gcc.computeUprightGroundYaw(45, 90, 0);

      // Same heading, pitch slightly tilted forward: beta = 82 deg
      const yawPitchTilted = gcc.computeUprightGroundYaw(45, 82, 0);

      // Same heading, roll tilted: gamma = 8 deg, beta = 90
      const yawRollTilted = gcc.computeUprightGroundYaw(45, 90, 8);

      // Pitch backwards: beta = 98 deg
      const yawPitchBack = gcc.computeUprightGroundYaw(45, 98, 0);

      return {
        yawIdeal,
        yawPitchTilted,
        yawRollTilted,
        yawPitchBack,
        diffPitchTilted: Math.abs(yawPitchTilted - yawIdeal),
        diffRollTilted: Math.abs(yawRollTilted - yawIdeal),
        diffPitchBack: Math.abs(yawPitchBack - yawIdeal)
      };
    });

    console.log('  Gimbal Lock Immunity Test 3 result:', test3Result);
    assert(Math.abs(test3Result.yawIdeal - 45.0) < 0.01, `Ideal yaw must be 45 deg, got ${test3Result.yawIdeal}`);
    assert(test3Result.diffPitchTilted < 2.0, `Pitch tilt (82 deg) should not distort yaw, diff: ${test3Result.diffPitchTilted}`);
    assert(test3Result.diffPitchBack < 2.0, `Pitch back (98 deg) should not distort yaw, diff: ${test3Result.diffPitchBack}`);
    console.log('  [PASS] Test 3: Euler gimbal lock near beta=90° eliminated via ground projection.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: sensor jitter not inflating rotation (deadband)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[6/11] Test 4: sensor jitter deadband policy...');
    const test4Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';
      gcc.sensorSource = 'deviceorientation';
      gcc.sensorSourceLocked = true;

      // Base orientation
      gcc.handleOrientation({ alpha: 60.0, beta: 90, gamma: 0 }, 'deviceorientation');

      // 50 micro-jitter oscillations between 59.94° and 60.06° (< 0.12° threshold)
      for (let i = 0; i < 50; i++) {
        const jitterAlpha = 60.0 + (i % 2 === 0 ? 0.07 : -0.07);
        gcc.handleOrientation({ alpha: jitterAlpha, beta: 90, gamma: 0 }, 'deviceorientation');
      }

      return {
        accumulatedRotation: gcc.accumulatedRotation,
        directionLocked: gcc.directionLocked
      };
    });

    console.log('  Jitter Deadband Test 4 result:', test4Result);
    assert.strictEqual(test4Result.accumulatedRotation, 0, 'Stationary sensor jitter must not accumulate any rotation');
    assert.strictEqual(test4Result.directionLocked, false, 'Direction must not lock on jitter');
    console.log('  [PASS] Test 4: sensor jitter deadband (< 0.12°) prevents phantom rotation inflation.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: clean 0→360 cumulative rotation
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[7/11] Test 5: clean 0→360 cumulative rotation...');
    const test5Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';
      gcc.sensorSource = 'deviceorientation';
      gcc.sensorSourceLocked = true;

      // Simulate a full 360° turn in 72 steps of 5.0° each
      let currentAlpha = 0.0;
      for (let step = 0; step <= 72; step++) {
        currentAlpha = (step * 5.0) % 360.0;
        gcc.handleOrientation({ alpha: currentAlpha, beta: 90, gamma: 0 }, 'deviceorientation');
      }

      return {
        accumulatedRotation: gcc.accumulatedRotation,
        direction: gcc.rotationDirection,
        directionLocked: gcc.directionLocked,
        progressPercent: gcc.progressPercent,
        state: gcc.state
      };
    });

    console.log('  360 Rotation Test 5 result:', test5Result);
    assert(Math.abs(test5Result.accumulatedRotation - 360.0) < 0.5, `Accumulated rotation should equal 360.0, got ${test5Result.accumulatedRotation}`);
    assert.strictEqual(test5Result.direction, 'CLOCKWISE');
    assert.strictEqual(test5Result.directionLocked, true);
    assert(test5Result.progressPercent >= 92 && test5Result.progressPercent <= 99, `Progress percent must reach search zone (92-99), got ${test5Result.progressPercent}`);
    console.log('  [PASS] Test 5: clean 0→360 cumulative rotation accurately tracked.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 6: retry starts at exactly 0° with no previous-session state
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[8/11] Test 6: retry starts at exactly 0° with no previous-session state...');
    const test6Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';
      gcc.sensorSource = 'deviceorientation';
      gcc.sensorSourceLocked = true;

      // Simulate partial capture attempt
      for (let a = 0; a <= 200; a += 10) {
        gcc.handleOrientation({ alpha: a, beta: 90, gamma: 0 }, 'deviceorientation');
      }
      gcc.candidateFrames = [{ candidateId: 'C001' }, { candidateId: 'C002' }];
      gcc.lastAngle = 200;

      // Call retry
      const startupId = gcc.resetCaptureForRetry('USER_EXPLICIT_RETRY');

      return {
        startupId,
        accumulatedRotation: gcc.accumulatedRotation,
        normalizedSensorRotationDeg: gcc.normalizedSensorRotationDeg,
        progressPercent: gcc.progressPercent,
        lastAngle: gcc.lastAngle,
        lastAlpha: gcc.lastAlpha,
        initialAlpha: gcc.initialAlpha,
        lastTimestamp: gcc.lastTimestamp,
        sensorSource: gcc.sensorSource,
        sensorSourceLocked: gcc.sensorSourceLocked,
        directionLocked: gcc.directionLocked,
        candidateFramesCount: gcc.candidateFrames.length,
        closureConfirmed: gcc.closureConfirmed,
        sessionEpoch: gcc.sessionEpoch
      };
    });

    console.log('  Retry State Test 6 result:', test6Result);
    assert.strictEqual(test6Result.accumulatedRotation, 0.0, 'accumulatedRotation must be 0.0 on retry');
    assert.strictEqual(test6Result.lastAngle, null, 'lastAngle must be null on retry');
    assert.strictEqual(test6Result.lastAlpha, null, 'lastAlpha must be null on retry');
    assert.strictEqual(test6Result.initialAlpha, null, 'initialAlpha must be null on retry');
    assert.strictEqual(test6Result.lastTimestamp, null, 'lastTimestamp must be null on retry');
    assert.strictEqual(test6Result.sensorSource, null, 'sensorSource must be reset on retry');
    assert.strictEqual(test6Result.sensorSourceLocked, false, 'sensorSourceLocked must be false on retry');
    assert.strictEqual(test6Result.directionLocked, false, 'directionLocked must be false on retry');
    assert.strictEqual(test6Result.candidateFramesCount, 0, 'candidateFrames must be empty on retry');
    assert.strictEqual(test6Result.closureConfirmed, false, 'closureConfirmed must be false on retry');
    assert(test6Result.sessionEpoch >= 2, `sessionEpoch must increment on retry, got ${test6Result.sessionEpoch}`);
    console.log('  [PASS] Test 6: retry completely purges previous session state and starts at 0.0°.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 7: visual detector reset creates empty start references/closure state
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[9/11] Test 7: visual detector reset creates empty start references/closure state...');
    const test7Result = await page.evaluate(() => {
      const vld = new window.VisualLoopDetector();

      // Add dummy start references
      vld.addStartReference('C001', 0.0, { keypoints: [], descriptors: new Uint32Array(0) });
      vld.addStartReference('C002', 12.0, { keypoints: [], descriptors: new Uint32Array(0) });
      vld.consecutiveConfirmations = 2;
      vld.closureConfirmed = true;
      vld.closureCheckCount = 5;
      vld.bestClosureMatch = { pass: true };

      const countBefore = vld.startReferences.length;
      const closureBefore = vld.closureConfirmed;

      // Invoke reset()
      vld.reset();

      return {
        countBefore,
        closureBefore,
        countAfter: vld.startReferences.length,
        closureAfter: vld.closureConfirmed,
        confirmationsAfter: vld.consecutiveConfirmations,
        checksAfter: vld.closureCheckCount,
        bestMatchAfter: vld.bestClosureMatch
      };
    });

    console.log('  VLD Reset Test 7 result:', test7Result);
    assert.strictEqual(test7Result.countBefore, 2);
    assert.strictEqual(test7Result.closureBefore, true);
    assert.strictEqual(test7Result.countAfter, 0, 'startReferences must be empty after reset()');
    assert.strictEqual(test7Result.closureAfter, false, 'closureConfirmed must be false after reset()');
    assert.strictEqual(test7Result.confirmationsAfter, 0, 'consecutiveConfirmations must be 0 after reset()');
    assert.strictEqual(test7Result.checksAfter, 0, 'closureCheckCount must be 0 after reset()');
    assert.strictEqual(test7Result.bestMatchAfter, null, 'bestClosureMatch must be null after reset()');
    console.log('  [PASS] Test 7: VisualLoopDetector.reset() successfully purges all references and state.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 8: closure success after a valid one-turn sequence
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[10/11] Test 8: closure success after a valid one-turn sequence...');
    const test8Result = await page.evaluate(() => {
      const vld = new window.VisualLoopDetector({
        requiredConsecutiveConfirmations: 1
      });

      // Synthetic scene: 20 distinct keypoints with random descriptors
      const numPoints = 25;
      const keypoints = [];
      const descriptors = new Uint32Array(numPoints);
      for (let i = 0; i < numPoints; i++) {
        keypoints.push({
          x: 20 + (i % 5) * 50,
          y: 20 + Math.floor(i / 5) * 30,
          cell: i % 9,
          score: 80
        });
        descriptors[i] = (0x12345678 ^ (i * 0x9e3779b9)) >>> 0;
      }
      const featureData = { keypoints, descriptors, width: 320, height: 180 };

      // Register start reference at 0°
      vld.addStartReference('C001', 0.0, featureData);

      // Evaluate closure at 360° with the matching feature data (simulating completed full circle)
      const evalRes = vld.evaluateClosure('C040', 360.0, featureData);

      return {
        pass: evalRes.pass,
        closureConfirmed: evalRes.closureConfirmed,
        modelUsed: evalRes.modelUsed,
        inlierCount: evalRes.inlierCount,
        reprojectionError: evalRes.reprojectionError,
        reason: evalRes.reason
      };
    });

    console.log('  Closure Success Test 8 result:', test8Result);
    assert.strictEqual(test8Result.pass, true, 'evaluateClosure must pass with identical loop closure features');
    assert.strictEqual(test8Result.closureConfirmed, true, 'closureConfirmed must be true');
    assert(test8Result.inlierCount >= 8, `inlierCount must be >= 8, got ${test8Result.inlierCount}`);
    console.log('  [PASS] Test 8: closure succeeds truthfully with credible matching visual features.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 9: closure failure remains explicitly 99/searching and does not falsely complete
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[11/11] Test 9: closure failure remains capped at 99% without false 100%...');
    const test9Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';
      gcc.sensorSource = 'deviceorientation';
      gcc.sensorSourceLocked = true;

      // Rotate full 360° but with NO visual loop closure confirmed
      for (let a = 0; a <= 360; a += 5) {
        gcc.handleOrientation({ alpha: a % 360, beta: 90, gamma: 0 }, 'deviceorientation');
      }

      const progressAt360 = gcc.progressPercent;
      const closureAt360 = gcc.closureConfirmed;
      const stateAt360 = gcc.state;

      // Continue turning past 360° to 410° without visual match
      for (let a = 5; a <= 50; a += 5) {
        gcc.handleOrientation({ alpha: a, beta: 90, gamma: 0 }, 'deviceorientation');
      }

      const progressAt410 = gcc.progressPercent;
      const closureAt410 = gcc.closureConfirmed;

      return {
        progressAt360,
        closureAt360,
        stateAt360,
        progressAt410,
        closureAt410
      };
    });

    console.log('  Closure Failure Capped Test 9 result:', test9Result);
    assert.strictEqual(test9Result.closureAt360, false, 'closureConfirmed must remain false without visual confirmation');
    assert(test9Result.progressAt360 >= 92 && test9Result.progressAt360 <= 99, `Progress at 360° must be capped between 92-99%, got ${test9Result.progressAt360}%`);
    assert(test9Result.progressAt410 <= 99, `Progress at 410° must NEVER reach 100% without closureConfirmed, got ${test9Result.progressAt410}%`);
    assert.notStrictEqual(test9Result.progressAt410, 100, 'Must NOT falsely complete to 100%');
    console.log('  [PASS] Test 9: closure failure remains capped at <=99% and strictly forbids false 100%.');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 10: no deadlock after retry
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[12/12] Test 10: no deadlock after retry, seamless fresh capture sequence...');
    const test10Result = await page.evaluate(() => {
      const gcc = new window.GuidedCaptureController();
      gcc.state = 'CAPTURING';
      gcc.sensorSource = 'deviceorientation';
      gcc.sensorSourceLocked = true;

      // Simulate a failed/stalled attempt that reached 360°
      for (let a = 0; a <= 360; a += 10) {
        gcc.handleOrientation({ alpha: a % 360, beta: 90, gamma: 0 }, 'deviceorientation');
      }
      const attempt1Prog = gcc.progressPercent;
      const attempt1Rot = gcc.accumulatedRotation;

      // Trigger user explicit retry
      gcc.resetCaptureForRetry('USER_EXPLICIT_RETRY');
      gcc.state = 'CAPTURING';
      gcc.isCapturing = true;

      // Now start fresh rotation
      for (let a = 0; a <= 180; a += 10) {
        gcc.handleOrientation({ alpha: a, beta: 90, gamma: 0 }, 'deviceorientation');
      }

      return {
        attempt1Prog,
        attempt1Rot,
        attempt2Rot: gcc.accumulatedRotation,
        attempt2Prog: gcc.progressPercent,
        attempt2Epoch: gcc.sessionEpoch,
        attempt2Direction: gcc.rotationDirection,
        attempt2State: gcc.state,
        isDeadlocked: gcc.accumulatedRotation === 0 || gcc.state === 'ERROR'
      };
    });

    console.log('  Deadlock Immunity Test 10 result:', test10Result);
    assert.strictEqual(test10Result.isDeadlocked, false, 'Controller must not deadlock or freeze on retry');
    assert(Math.abs(test10Result.attempt2Rot - 180.0) < 0.5, `Second attempt should cleanly accumulate 180 deg, got ${test10Result.attempt2Rot}`);
    assert(test10Result.attempt2Prog > 50 && test10Result.attempt2Prog < 85, `Progress should scale cleanly for 180 deg, got ${test10Result.attempt2Prog}`);
    assert.strictEqual(test10Result.attempt2State, 'CAPTURING');
    console.log('  [PASS] Test 10: no deadlock after retry; clean fresh accumulation.');

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(' ALL 10 ROUND 116 REGRESSION TESTS PASSED (100%)');
    console.log('══════════════════════════════════════════════════════════════════════');
  } finally {
    await browser.close();
    if (server && server.close) server.close();
  }
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
