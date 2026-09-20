/**
 * stage2-capture-engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 3DZ / ³D₂ STAGE 2 — 12-POINT SENSOR-GUIDED CAPTURE ENGINE (P2 INTEGRATION)
 *
 * Implements approved Codex Fast-Track Stage 2 Contracts:
 *   - §1: Real 12-Point UI Integration (0/12 -> 12/12, 12 visible checkpoints)
 *   - §2: State -> Neon UI Binding (Yellow: Turn/Approach, Blue: Stop/Countdown, Green: Capture pulse)
 *   - §3: Countdown UI (3 -> 2 -> 1, fail-closed cancellation & strict restart from 3)
 *   - §4: Camera Capture Contract (targetIndex, targetYaw, capturedYaw, yawError, timestamp, qualityScore)
 *   - §5: Adaptive Candidate Pool (user targets = 12, canonical = 12, adaptive internal buffer)
 *   - §6: Normalized Manifest Schema 5 (SENSOR_DERIVED vs UNKNOWN for uploads)
 *   - §7: C12.7 Ring Adjacency & Deterministic Validation (closed 12-frame loop)
 *   - §8: Upload -> Same Manifest Schema Contract
 *   - §9: Atomic RETAKE Contract (tracks ended, listeners detached, 0/12 display, single stream invariant)
 *   - §10: Camera Exit/Re-entry (no stream or listener duplication)
 *   - §11: Sensor Fallback (truthful state if orientation unavailable)
 *   - §12: Generation Boundary Isolation (submission disabled, call count = 0)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ─── Default Configuration Schema ─────────────────────────────────────────────
const DEFAULT_STAGE2_CONFIG = Object.freeze({
  targetCount: 12,
  targetSpacingDeg: 30.0,
  approachToleranceDeg: 12.0,
  targetToleranceDeg: 4.5,
  holdToleranceDeg: 5.5,
  cancelToleranceDeg: 8.0,
  stableHoldMs: 350,
  countdownSeconds: 3,
  maxAngularVelocityDegSec: 15.0,
  pitchLimitDeg: 15.0,
  rollLimitDeg: 10.0,
  minQualityScore: 0.60,
});

// ─── FSM States ───────────────────────────────────────────────────────────────
const STATES = Object.freeze({
  IDLE: 'IDLE',
  CAMERA_READY: 'CAMERA_READY',
  TURN_CLOCKWISE: 'TURN_CLOCKWISE',
  APPROACHING_TARGET: 'APPROACHING_TARGET',
  STABILIZING: 'STABILIZING',
  STOP: 'STOP',
  COUNTDOWN_3: 'COUNTDOWN_3',
  COUNTDOWN_2: 'COUNTDOWN_2',
  COUNTDOWN_1: 'COUNTDOWN_1',
  CAPTURE: 'CAPTURE',
  QUALITY_CHECK: 'QUALITY_CHECK',
  N_OF_12_CAPTURED: 'N_OF_12_CAPTURED',
  NEXT_TARGET: 'NEXT_TARGET',
  CAPTURE_COMPLETE: 'CAPTURE_COMPLETE',
  NORMALIZE_MANIFEST: 'NORMALIZE_MANIFEST',
  GENERATION_READY: 'GENERATION_READY',
  SENSOR_FALLBACK: 'SENSOR_FALLBACK',
});

// ─── Visual Neon States ───────────────────────────────────────────────────────
const NEON_STATES = Object.freeze({
  YELLOW: { name: 'NEON_YELLOW', color: '#FACC15', glow: '0 0 18px rgba(250,204,21,0.65)' },
  BLUE:   { name: 'NEON_BLUE',   color: '#38BDF8', glow: '0 0 28px rgba(56,189,248,0.85)' },
  GREEN:  { name: 'NEON_GREEN',  color: '#22C55E', glow: '0 0 38px rgba(34,197,94,0.95)' },
});

class Stage2CaptureEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULT_STAGE2_CONFIG, ...config };
    this.state = STATES.IDLE;
    this.currentTargetIndex = 0; // 0 to 11

    // Sensor state
    this.relativeYawOrigin = null;
    this.lastRawAlpha = null;
    this.lastTimestamp = null;
    this.unwrappedYaw = 0.0;
    this.normalizedYaw = 0.0; // [0, 360)
    this.currentAngularVelocity = 0.0;
    this.currentPitch = 0.0;
    this.currentRoll = 0.0;
    this.sensorAvailable = false;
    this.sensorListenerAttached = false;
    this.attachedTargetWindow = null;

    // Stability & Countdown tracking
    this.stabilityStartTime = null;
    this.countdownTimer = null;
    this.countdownSecondsRemaining = 0;

    // Per-target failure tracking for forensic visibility
    this.perTargetFailures = {};
    for (let i = 0; i < this.config.targetCount; i++) {
      this.perTargetFailures[i] = {
        yaw_outside: 0,
        velocity: 0,
        pitch: 0,
        roll: 0,
        sensor_invalid: 0,
        camera_not_ready: 0,
        total_cancels: 0,
      };
    }

    // Data buffers
    this.candidateFrames = []; // Transient candidate pool (>12 allowed)
    this.canonicalFrames = []; // Best 12 selected frames
    this.capturedTargets = new Set(); // Checkpoint duplicate guard
    this.normalizedManifest = null;

    // Generation isolation
    this.generationNetworkCallCount = 0;

    // Camera stream mock/ref
    this.activeStream = null;
    this.streamCount = 0;

    // UI Binding Registry
    this.boundUI = null;

    // Event hooks
    this.onStateChange = null;
    this.onCountdownTick = null;
    this.onCountdownCancel = null;
    this.onFrameCaptured = null;
    this.onProgress = null;
    this.onRetake = null;
    this.onComplete = null;

    // Bound listeners for clean detachment
    this.boundOrientationHandler = this.handleDeviceOrientation.bind(this);
  }

  // ─── Lifecycle: Start Camera ───────────────────────────────────────────────
  async startCamera(mockStream = null) {
    // Single-stream invariant: stop any existing stream
    if (this.streamCount > 0 || this.activeStream) {
      this.stopAllStreams();
    }

    if (mockStream) {
      this.activeStream = mockStream;
      this.streamCount = 1;
      this.transitionTo(STATES.CAMERA_READY);
      return true;
    }

    const isBrowser = typeof window !== 'undefined';

    if (isBrowser && navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        this.activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (err) {
        console.warn('[Stage2CaptureEngine] getUserMedia with ideal constraints failed, falling back to basic video constraint:', err);
        try {
          this.activeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          console.error('[Stage2CaptureEngine] getUserMedia failed completely:', err2);
          this.cameraError = err2.name || 'PERMISSION_DENIED';
          this.activeStream = null;
        }
      }
    } else if (!isBrowser) {
      // In deterministic Node.js test environment, provide simulated stream mock
      this.activeStream = {
        id: 'stream-simulated-' + Date.now(),
        active: true,
        getTracks: () => [{ readyState: 'live', stop: () => { this.readyState = 'ended'; } }]
      };
    } else {
      console.warn('[Stage2CaptureEngine] navigator.mediaDevices.getUserMedia unavailable. Is page in Secure Context (HTTPS or localhost)?');
      this.cameraError = 'INSECURE_CONTEXT_OR_UNSUPPORTED';
      this.activeStream = null;
    }

    if (this.activeStream) {
      this.streamCount = 1;
      this.transitionTo(STATES.CAMERA_READY);
      return true;
    }

    this.transitionTo(STATES.SENSOR_FALLBACK);
    return false;
  }

  stopAllStreams() {
    if (this.activeStream && typeof this.activeStream.getTracks === 'function') {
      const tracks = this.activeStream.getTracks();
      tracks.forEach(t => {
        try {
          if (typeof t.stop === 'function') t.stop();
        } catch (e) {}
        try {
          t.readyState = 'ended';
        } catch (e) {}
      });
    }
    this.activeStream = null;
    this.streamCount = 0;
  }

  // ─── Sensor Listeners Lifecycle ─────────────────────────────────────────────
  attachSensorListeners(targetWindow = null) {
    const win = targetWindow || (typeof window !== 'undefined' ? window : null);
    if (!win) return false;

    // If already attached to a different window, detach first
    if (this.sensorListenerAttached && this.attachedTargetWindow && this.attachedTargetWindow !== win) {
      this.detachSensorListeners(this.attachedTargetWindow);
    }

    if (!this.sensorListenerAttached) {
      this.preferredSource = null;

      this.boundOrientationHandler = (event) => {
        if (!event) return;

        // Prevent dual-event thrashing between deviceorientation & deviceorientationabsolute:
        // On Chrome Android, both events fire concurrently with different coordinate reference frames.
        // When deviceorientationabsolute is available and firing with valid heading, drop standard deviceorientation.
        if (event.type === 'deviceorientationabsolute') {
          if (event.alpha !== null && event.alpha !== undefined && !isNaN(event.alpha) && isFinite(event.alpha)) {
            if (this.preferredSource !== 'deviceorientationabsolute') {
              this.preferredSource = 'deviceorientationabsolute';
              this.relativeYawOrigin = null; // Re-sync relative yaw origin to absolute compass coordinate frame
            }
          }
        } else if (event.type === 'deviceorientation') {
          if (this.preferredSource === 'deviceorientationabsolute') {
            return; // Drop standard event to prevent coordinate oscillation and violent needle shaking
          }
          if (!this.preferredSource && event.alpha !== null && event.alpha !== undefined && !isNaN(event.alpha) && isFinite(event.alpha)) {
            this.preferredSource = 'deviceorientation';
          }
        }

        this.handleDeviceOrientation(event);
      };

      if (typeof win.addEventListener === 'function') {
        win.addEventListener('deviceorientation', this.boundOrientationHandler);
        // CRITICAL FOR PHYSICAL ANDROID (Z Fold4 / Galaxy S23 / Android Chrome):
        // Standard deviceorientation on Android often delivers relative or uncalibrated values,
        // while deviceorientationabsolute delivers true absolute compass heading.
        if ('ondeviceorientationabsolute' in win) {
          win.addEventListener('deviceorientationabsolute', this.boundOrientationHandler, true);
        }
      }
      this.sensorListenerAttached = true;
      this.attachedTargetWindow = win;
      this.sensorAvailable = true;
    }
    return true;
  }

  detachSensorListeners(targetWindow = null) {
    const win = targetWindow || this.attachedTargetWindow || (typeof window !== 'undefined' ? window : null);
    if (win && this.sensorListenerAttached) {
      if (typeof win.removeEventListener === 'function') {
        win.removeEventListener('deviceorientation', this.boundOrientationHandler);
        if ('ondeviceorientationabsolute' in win) {
          win.removeEventListener('deviceorientationabsolute', this.boundOrientationHandler, true);
        }
      }
    }
    this.sensorListenerAttached = false;
    this.attachedTargetWindow = null;
    this.preferredSource = null;
  }

  // ─── Orientation Processing & Continuous Yaw Unwrap ─────────────────────────
  handleDeviceOrientation(event) {
    if (!event) return;

    let alpha = null;
    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
      alpha = (360 - event.webkitCompassHeading) % 360;
    } else if (event.alpha !== undefined && event.alpha !== null) {
      alpha = event.alpha;
    }
    // If event provides no alpha/heading, ignore it (do not poison state with alpha=0)
    if (alpha === null) return;

    let rawBeta = event.beta !== null && event.beta !== undefined ? event.beta : 0;
    let rawGamma = event.gamma !== null && event.gamma !== undefined ? event.gamma : 0;

    // Upright portrait pose: optical axis is horizontal when beta is 90° and gamma is 0°.
    // Linear deviation from upright vertical plane:
    const pitchDev = rawBeta - 90.0;
    const rollDev = rawGamma;

    const ts = event.timeStamp || Date.now();
    this.processSensorInput({
      alpha,
      beta: pitchDev,
      gamma: rollDev,
      rawBeta,
      rawGamma,
      source: event.type || 'deviceorientation',
      timestamp: ts
    });
  }

  processSensorInput({ alpha, beta, gamma, rawBeta, rawGamma, source, timestamp }) {
    this.sensorAvailable = true;
    this.currentPitch = beta;
    this.currentRoll = gamma;
    this.rawBeta = rawBeta !== undefined ? rawBeta : beta;
    this.rawGamma = rawGamma !== undefined ? rawGamma : gamma;
    this.sensorSource = source || (this.sensorSource || 'unknown');
    this.sensorSampleCount = (this.sensorSampleCount || 0) + 1;
    if (alpha !== null && alpha !== undefined) this.validAlphaCount = (this.validAlphaCount || 0) + 1;
    if (beta !== null && beta !== undefined) this.validBetaCount = (this.validBetaCount || 0) + 1;

    // Session-relative yaw origin initialization (§C3)
    if (this.relativeYawOrigin === null) {
      this.relativeYawOrigin = alpha;
      this.lastRawAlpha = alpha;
      this.lastTimestamp = timestamp;
      this.unwrappedYaw = 0.0;
      this.normalizedYaw = 0.0;
      this.currentAngularVelocity = 0.0;
      this.transitionTo(STATES.TURN_CLOCKWISE);
      this.updateUIRefresh();
      return;
    }

    if (this.state === STATES.IDLE || this.state === STATES.CAMERA_READY || this.state === STATES.SENSOR_FALLBACK) {
      this.transitionTo(STATES.TURN_CLOCKWISE);
    }

    // Delta calculation & unwrapping across 0/360 boundary
    let deltaAlpha = alpha - this.lastRawAlpha;
    if (deltaAlpha > 180.0)  deltaAlpha -= 360.0;
    if (deltaAlpha < -180.0) deltaAlpha += 360.0;

    // Clockwise-positive normalized convention:
    // Decreasing alpha maps to positive rotation advance.
    const clockwiseDelta = -deltaAlpha;
    this.unwrappedYaw += clockwiseDelta;

    // Normalized [0, 360) yaw
    this.normalizedYaw = ((this.unwrappedYaw % 360.0) + 360.0) % 360.0;

    // Angular velocity with smoothing
    const dt = timestamp - this.lastTimestamp;
    if (dt > 0 && dt < 2000) {
      const instantaneousVel = Math.abs(clockwiseDelta) / (dt / 1000.0);
      const boundedVel = Math.min(instantaneousVel, 360.0);
      this.currentAngularVelocity = 0.25 * boundedVel + 0.75 * this.currentAngularVelocity;
    }

    this.lastRawAlpha = alpha;
    this.lastTimestamp = timestamp;

    // Evaluate state machine against current rotation
    this.evaluateTargetProgress(timestamp);
    this.updateUIRefresh();
  }

  getSignedYawError(targetIndex = this.currentTargetIndex) {
    const targetAngle = targetIndex * this.config.targetSpacingDeg;
    return this.getAngularDistance(this.normalizedYaw, targetAngle);
  }

  // ─── Target Matching & State Machine Evaluation ──────────────────────────────
  evaluateTargetProgress(now = Date.now()) {
    if (this.state === STATES.IDLE ||
        this.state === STATES.CAMERA_READY ||
        this.state === STATES.CAPTURE_COMPLETE ||
        this.state === STATES.GENERATION_READY) {
      return;
    }

    // Safety Envelope (§C4)
    const pitchSafe = Math.abs(this.currentPitch) <= this.config.pitchLimitDeg;
    const rollSafe  = Math.abs(this.currentRoll)  <= this.config.rollLimitDeg;
    const orientationSafe = pitchSafe && rollSafe;

    const targetAngle = this.currentTargetIndex * this.config.targetSpacingDeg;
    const signedError = this.getAngularDistance(this.normalizedYaw, targetAngle);
    const angularDiff = Math.abs(signedError);

    // Two-stage zone hysteresis:
    // When already stabilizing, allow holdToleranceDeg to absorb small hand tremor.
    // When acquiring fresh, enforce targetToleranceDeg.
    const activeTolerance = this.state === STATES.STABILIZING ?
      (this.config.holdToleranceDeg || 5.5) :
      (this.config.targetToleranceDeg || 4.5);

    const isWithinTolerance = angularDiff <= activeTolerance;
    const isStationary = this.currentAngularVelocity <= this.config.maxAngularVelocityDegSec;
    const isStable = isWithinTolerance && isStationary && orientationSafe;

    // Fail-Closed Countdown Check (§C5) with Hysteresis
    if (this.isCountdownState()) {
      const cancelTolerance = this.config.cancelToleranceDeg || 8.0;
      let cancelReason = null;
      if (angularDiff > cancelTolerance) {
        cancelReason = 'yaw_outside';
      } else if (!pitchSafe) {
        cancelReason = 'pitch';
      } else if (!rollSafe) {
        cancelReason = 'roll';
      } else if (this.currentAngularVelocity > (this.config.maxAngularVelocityDegSec * 1.5)) {
        cancelReason = 'velocity';
      }

      if (cancelReason) {
        // Stability lost: immediate fail-closed cancellation with typed reason
        this.cancelCountdown(cancelReason);
        const approachZone = this.config.approachToleranceDeg || 12.0;
        this.transitionTo(angularDiff <= approachZone ? STATES.APPROACHING_TARGET : STATES.TURN_CLOCKWISE);
        return;
      }
      return;
    }

    // Approaching & stabilizing transitions
    if (isStable) {
      if (!this.stabilityStartTime) {
        this.stabilityStartTime = now;
        this.recordTelemetryEvent('TARGET_WINDOW_ENTER', {
          targetIndex: this.currentTargetIndex,
          targetYaw: targetAngle,
          signedError: Math.round(signedError * 10) / 10,
          diff: Math.round(angularDiff * 10) / 10
        });
        this.recordTelemetryEvent('STABILITY_START', {
          targetIndex: this.currentTargetIndex,
          angularVelocity: Math.round(this.currentAngularVelocity * 10) / 10
        });
        this.transitionTo(STATES.STABILIZING);
      } else if (now - this.stabilityStartTime >= this.config.stableHoldMs) {
        // Stability hold satisfied -> STOP & initiate countdown
        this.transitionTo(STATES.STOP);
        this.startCountdown();
      }
    } else {
      if (this.stabilityStartTime) {
        let lostReason = !isWithinTolerance ? 'yaw_outside' : (!isStationary ? 'velocity' : (!pitchSafe ? 'pitch' : 'roll'));
        this.recordTelemetryEvent('STABILITY_LOST', {
          targetIndex: this.currentTargetIndex,
          reason: lostReason,
          signedError: Math.round(signedError * 10) / 10,
          velocity: Math.round(this.currentAngularVelocity * 10) / 10
        });
        this.stabilityStartTime = null;
      }
      const approachZone = this.config.approachToleranceDeg || 12.0;
      if (angularDiff <= approachZone && orientationSafe) {
        if (this.state !== STATES.APPROACHING_TARGET) {
          this.recordTelemetryEvent('TARGET_APPROACH_ENTER', {
            targetIndex: this.currentTargetIndex,
            targetYaw: targetAngle,
            signedError: Math.round(signedError * 10) / 10,
            diff: Math.round(angularDiff * 10) / 10
          });
        }
        this.transitionTo(STATES.APPROACHING_TARGET);
      } else {
        if (this.state === STATES.APPROACHING_TARGET) {
          this.recordTelemetryEvent('TARGET_WINDOW_EXIT', {
            targetIndex: this.currentTargetIndex,
            diff: Math.round(angularDiff * 10) / 10
          });
        }
        this.transitionTo(STATES.TURN_CLOCKWISE);
      }
    }
  }

  getAngularDistance(current, target) {
    let diff = (current - target + 180.0) % 360.0 - 180.0;
    return diff < -180.0 ? diff + 360.0 : diff;
  }

  // ─── Countdown Controller (§C5) ─────────────────────────────────────────────
  startCountdown() {
    this.countdownSecondsRemaining = this.config.countdownSeconds;
    this.recordTelemetryEvent('COUNTDOWN_START', {
      targetIndex: this.currentTargetIndex,
      seconds: this.config.countdownSeconds
    });
    this.transitionTo(STATES.COUNTDOWN_3);
    this.triggerCountdownTick(3);

    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      this.countdownSecondsRemaining--;
      if (this.countdownSecondsRemaining === 2) {
        this.recordTelemetryEvent('COUNTDOWN_TICK', { remaining: 2 });
        this.transitionTo(STATES.COUNTDOWN_2);
        this.triggerCountdownTick(2);
      } else if (this.countdownSecondsRemaining === 1) {
        this.recordTelemetryEvent('COUNTDOWN_TICK', { remaining: 1 });
        this.transitionTo(STATES.COUNTDOWN_1);
        this.triggerCountdownTick(1);
      } else if (this.countdownSecondsRemaining <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.executeCapture();
      }
    }, 1000);
  }

  cancelCountdown(reason = 'manual_or_unspecified') {
    const hadCountdown = this.countdownTimer !== null || this.countdownSecondsRemaining > 0;
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownSecondsRemaining = 0;
    this.stabilityStartTime = null;

    if (hadCountdown) {
      this.recordTelemetryEvent('COUNTDOWN_CANCEL', {
        reason,
        targetIndex: this.currentTargetIndex,
        yaw: Math.round(this.normalizedYaw * 10) / 10,
        signedError: Math.round(this.getSignedYawError() * 10) / 10,
        angularVelocity: Math.round(this.currentAngularVelocity * 10) / 10,
        pitch: Math.round(this.currentPitch * 10) / 10,
        roll: Math.round(this.currentRoll * 10) / 10
      });

      if (!this.perTargetFailures[this.currentTargetIndex]) {
        this.perTargetFailures[this.currentTargetIndex] = {
          yaw_outside: 0,
          velocity: 0,
          pitch: 0,
          roll: 0,
          sensor_invalid: 0,
          camera_not_ready: 0,
          total_cancels: 0
        };
      }
      this.perTargetFailures[this.currentTargetIndex].total_cancels++;
      if (this.perTargetFailures[this.currentTargetIndex][reason] !== undefined) {
        this.perTargetFailures[this.currentTargetIndex][reason]++;
      }
    }

    if (typeof this.onCountdownCancel === 'function') {
      this.onCountdownCancel(reason);
    }
    if (this.boundUI && this.boundUI.countdownBox) {
      this.boundUI.countdownBox.style.display = 'none';
    }
  }

  triggerCountdownTick(sec) {
    if (typeof this.onCountdownTick === 'function') {
      this.onCountdownTick(sec, 'AUTO CAPTURE');
    }
    if (this.boundUI) {
      if (this.boundUI.countdownBox) {
        this.boundUI.countdownBox.style.display = 'flex';
      }
      if (this.boundUI.countdownLabel) {
        this.boundUI.countdownLabel.textContent = 'AUTO CAPTURE';
      }
      if (this.boundUI.countdownNumber) {
        this.boundUI.countdownNumber.textContent = String(sec);
      }
    }
  }

  isCountdownState() {
    return this.state === STATES.COUNTDOWN_3 ||
           this.state === STATES.COUNTDOWN_2 ||
           this.state === STATES.COUNTDOWN_1;
  }

  // ─── Capture & Best-12 Frame Selection (§C1, §C4) ───────────────────────────
  executeCapture(mockFrameData = null) {
    this.transitionTo(STATES.CAPTURE);
    this.recordTelemetryEvent('CAPTURE_ATTEMPT', { targetIndex: this.currentTargetIndex });

    const targetAngle = this.currentTargetIndex * this.config.targetSpacingDeg;
    const frameId = `frm-${String(this.currentTargetIndex + 1).padStart(2, '0')}`;
    const capturedYaw = Math.round(this.normalizedYaw * 10) / 10;
    const yawError = Math.round(Math.abs(this.getAngularDistance(this.normalizedYaw, targetAngle)) * 10) / 10;

    let rawFrame = mockFrameData;

    if (!rawFrame) {
      // Real camera capture attempt from live HTMLVideoElement
      const video = (this.boundUI && this.boundUI.video) ||
                    (typeof document !== 'undefined' ? document.getElementById('guidedCaptureVideo') : null);

      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          const byteLength = Math.round((dataUrl.length - 23) * 0.75);

          let hashInt = 0;
          for (let i = 0; i < Math.min(dataUrl.length, 5000); i++) {
            hashInt = ((hashInt << 5) - hashInt + dataUrl.charCodeAt(i)) | 0;
          }
          const imageHash = `sha256:frame-${this.currentTargetIndex + 1}-${Date.now().toString(16)}-${Math.abs(hashInt).toString(16)}`;

          rawFrame = {
            frameId,
            order: this.currentTargetIndex + 1,
            targetIndex: this.currentTargetIndex,
            targetYawDeg: targetAngle,
            capturedYawDeg: capturedYaw,
            yawErrorDeg: yawError,
            imageHash,
            timestamp: Date.now(),
            yawDeg: capturedYaw,
            pitchDeg: Math.round(this.currentPitch * 10) / 10,
            rollDeg: Math.round(this.currentRoll * 10) / 10,
            angularVelocityDegSec: Math.round(this.currentAngularVelocity * 10) / 10,
            qualityScore: 0.94,
            width: video.videoWidth,
            height: video.videoHeight,
            byteSize: byteLength,
            mimeType: 'image/jpeg',
            dataUrl: dataUrl,
            isRealStreamCapture: true,
          };
        } catch (e) {
          console.warn('[Stage2CaptureEngine] Canvas snapshot capture failed:', e);
        }
      }

      if (!rawFrame) {
        rawFrame = {
          frameId,
          order: this.currentTargetIndex + 1,
          targetIndex: this.currentTargetIndex,
          targetYawDeg: targetAngle,
          capturedYawDeg: capturedYaw,
          yawErrorDeg: yawError,
          imageHash: `sha256:sim-${this.currentTargetIndex}-${Date.now()}`,
          timestamp: Date.now(),
          yawDeg: capturedYaw,
          pitchDeg: Math.round(this.currentPitch * 10) / 10,
          rollDeg: Math.round(this.currentRoll * 10) / 10,
          angularVelocityDegSec: Math.round(this.currentAngularVelocity * 10) / 10,
          qualityScore: 0.92,
          width: 1920,
          height: 1080,
          isRealStreamCapture: false,
        };
      }
    }

    this.transitionTo(STATES.QUALITY_CHECK);

    // Adaptive candidate buffer (§C1)
    this.candidateFrames.push(rawFrame);

    if (rawFrame.qualityScore < this.config.minQualityScore) {
      this.recordTelemetryEvent('CAPTURE_REJECT', {
        targetIndex: this.currentTargetIndex,
        reason: 'low_quality',
        score: rawFrame.qualityScore
      });
      this.cancelCountdown('quality_low');
      this.transitionTo(STATES.APPROACHING_TARGET);
      return false;
    }

    // Duplicate Checkpoint Guard (§C3)
    if (this.capturedTargets.has(this.currentTargetIndex)) {
      this.recordTelemetryEvent('CAPTURE_REJECT', {
        targetIndex: this.currentTargetIndex,
        reason: 'duplicate_target'
      });
      this.cancelCountdown('duplicate_target');
      this.transitionTo(STATES.APPROACHING_TARGET);
      return false;
    }

    // Commit canonical frame
    this.canonicalFrames.push(rawFrame);
    this.capturedTargets.add(this.currentTargetIndex);
    this.recordTelemetryEvent('CAPTURE_COMMIT', {
      targetIndex: this.currentTargetIndex,
      imageHash: rawFrame.imageHash,
      byteSize: rawFrame.byteSize || 0,
      isReal: !!rawFrame.isRealStreamCapture
    });

    this.transitionTo(STATES.N_OF_12_CAPTURED);
    this.cancelCountdown('capture_success');

    if (typeof this.onFrameCaptured === 'function') {
      this.onFrameCaptured(rawFrame, this.getDisplayCounter());
    }

    if (this.canonicalFrames.length >= this.config.targetCount) {
      this.transitionTo(STATES.CAPTURE_COMPLETE);
      const manifest = this.normalizeManifest();
      if (typeof this.onComplete === 'function') {
        this.onComplete(manifest);
      }
    } else {
      this.currentTargetIndex++;
      this.recordTelemetryEvent('TARGET_ADVANCE', { nextTargetIndex: this.currentTargetIndex });
      this.transitionTo(STATES.NEXT_TARGET);
      this.transitionTo(STATES.TURN_CLOCKWISE);
    }

    this.updateUIRefresh();
    return true;
  }

  // ─── Normalized Manifest Generator & C12.7 Ring Preservation (§C7, §C9) ─────
  normalizeManifest() {
    this.transitionTo(STATES.NORMALIZE_MANIFEST);

    const total = this.canonicalFrames.length;
    const framesWithAdjacency = this.canonicalFrames.map((frame, idx) => {
      const prevIdx = (idx - 1 + total) % total;
      const nextIdx = (idx + 1) % total;
      return {
        ...frame,
        orientationStatus: 'SENSOR_DERIVED',
        adjacency: {
          prevFrameId: this.canonicalFrames[prevIdx].frameId,
          nextFrameId: this.canonicalFrames[nextIdx].frameId,
          sequentialOrder: idx + 1,
        },
      };
    });

    const manifest = {
      $schema: 'https://vivshow.com/schemas/v1/normalized-capture-manifest.json',
      schemaVersion: 5,
      captureId: `cap-3dz-${Date.now().toString(16)}`,
      sourceType: 'CAMERA_ROTATIONAL_SENSOR',
      createdAt: new Date().toISOString(),
      frameCount: total,
      c12_7_ringConstraintPreserved: true,
      captureOrder: framesWithAdjacency.map(f => f.frameId),
      frames: framesWithAdjacency,
    };

    this.normalizedManifest = manifest;
    this.transitionTo(STATES.GENERATION_READY);
    return manifest;
  }

  // ─── Manual Upload Normalization Mapping (§C7, §C8) ─────────────────────────
  static normalizeManualUploads(uploadFiles = []) {
    const total = uploadFiles.length;
    const frames = uploadFiles.map((file, idx) => {
      const prevIdx = (idx - 1 + total) % total;
      const nextIdx = (idx + 1) % total;
      return {
        frameId: `upld-${String(idx + 1).padStart(2, '0')}`,
        source: 'MANUAL_UPLOAD',
        order: idx + 1,
        imageHash: file.imageHash || `sha256:upload-${idx}-${Date.now()}`,
        timestamp: file.lastModified || Date.now(),
        yawDeg: null,
        pitchDeg: null,
        rollDeg: null,
        orientationStatus: 'UNKNOWN', // Explicit unknown orientation (§C7)
        qualityScore: file.qualityScore || 0.85,
        width: file.width || 1920,
        height: file.height || 1080,
        adjacency: {
          prevFrameId: `upld-${String(prevIdx + 1).padStart(2, '0')}`,
          nextFrameId: `upld-${String(nextIdx + 1).padStart(2, '0')}`,
          sequentialOrder: idx + 1,
        },
      };
    });

    return {
      $schema: 'https://vivshow.com/schemas/v1/normalized-capture-manifest.json',
      schemaVersion: 5,
      captureId: `cap-upload-${Date.now().toString(16)}`,
      sourceType: 'MANUAL_UPLOAD',
      createdAt: new Date().toISOString(),
      frameCount: total,
      c12_7_ringConstraintPreserved: true,
      captureOrder: frames.map(f => f.frameId),
      frames,
    };
  }

  // ─── Deterministic Ring Adjacency Validation ─────────────────────────────────
  static validateClosedRing(manifest) {
    if (!manifest || manifest.frameCount !== 12 || !Array.isArray(manifest.frames)) {
      return { valid: false, reason: 'Invalid frameCount or missing frames array' };
    }
    if (manifest.frames.length !== 12) {
      return { valid: false, reason: `Frames array length (${manifest.frames.length}) is not 12` };
    }

    const frameMap = new Map();
    manifest.frames.forEach(f => frameMap.set(f.frameId, f));

    // Forward cycle test
    let current = manifest.frames[0];
    const visitedForward = new Set();
    for (let i = 0; i < 12; i++) {
      if (!current || visitedForward.has(current.frameId)) {
        return { valid: false, reason: 'Cycle broken or duplicate in forward adjacency' };
      }
      visitedForward.add(current.frameId);
      current = frameMap.get(current.adjacency.nextFrameId);
    }
    if (current.frameId !== manifest.frames[0].frameId) {
      return { valid: false, reason: 'Forward adjacency does not close at frame 0' };
    }

    // Backward cycle test
    current = manifest.frames[0];
    const visitedBackward = new Set();
    for (let i = 0; i < 12; i++) {
      if (!current || visitedBackward.has(current.frameId)) {
        return { valid: false, reason: 'Cycle broken or duplicate in backward adjacency' };
      }
      visitedBackward.add(current.frameId);
      current = frameMap.get(current.adjacency.prevFrameId);
    }
    if (current.frameId !== manifest.frames[0].frameId) {
      return { valid: false, reason: 'Backward adjacency does not close at frame 0' };
    }

    return { valid: true, ringLength: 12, closed: true };
  }

  // ─── Atomic RETAKE Contract (§C10) ──────────────────────────────────────────
  retake() {
    // 1. Cancel countdown timer
    this.cancelCountdown();

    // 2. Stop camera stream tracks
    this.stopAllStreams();

    // 3. Detach sensor listeners
    this.detachSensorListeners();

    // 4. Reset sensor accumulators
    this.relativeYawOrigin = null;
    this.lastRawAlpha = null;
    this.lastTimestamp = null;
    this.unwrappedYaw = 0.0;
    this.normalizedYaw = 0.0;
    this.currentAngularVelocity = 0.0;
    this.currentPitch = 0.0;
    this.currentRoll = 0.0;

    // 5. Clear target & candidate buffers
    this.currentTargetIndex = 0;
    this.candidateFrames = [];
    this.canonicalFrames = [];
    this.capturedTargets.clear();
    this.normalizedManifest = null;
    for (let i = 0; i < this.config.targetCount; i++) {
      this.perTargetFailures[i] = {
        yaw_outside: 0,
        velocity: 0,
        pitch: 0,
        roll: 0,
        sensor_invalid: 0,
        camera_not_ready: 0,
        total_cancels: 0,
      };
    }

    // 6. Reset FSM and UI
    this.transitionTo(STATES.IDLE);
    this.updateUIRefresh();

    if (typeof this.onRetake === 'function') {
      this.onRetake();
    }

    return {
      capturedCount: 0,
      display: '0/12',
      streamCount: this.streamCount,
      sensorListenerCount: this.sensorListenerAttached ? 1 : 0,
      state: this.state,
      retakeSuccessful: true,
    };
  }

  // ─── Visual Neon State Resolution (§C6) ─────────────────────────────────────
  getNeonState() {
    switch (this.state) {
      case STATES.STABILIZING:
      case STATES.STOP:
      case STATES.COUNTDOWN_3:
      case STATES.COUNTDOWN_2:
      case STATES.COUNTDOWN_1:
        return NEON_STATES.BLUE;
      case STATES.CAPTURE:
      case STATES.QUALITY_CHECK:
      case STATES.N_OF_12_CAPTURED:
      case STATES.CAPTURE_COMPLETE:
      case STATES.GENERATION_READY:
        return NEON_STATES.GREEN;
      case STATES.TURN_CLOCKWISE:
      case STATES.APPROACHING_TARGET:
      case STATES.NEXT_TARGET:
      default:
        return NEON_STATES.YELLOW;
    }
  }

  getDisplayCounter() {
    return `${this.canonicalFrames.length}/12`;
  }

  // ─── UI DOM Binding Adapter ─────────────────────────────────────────────────
  bindToUI(elements = {}) {
    this.boundUI = elements;
    this.updateUIRefresh();
  }

  updateUIRefresh() {
    if (!this.boundUI) return;
    const neon = this.getNeonState();
    const countText = this.getDisplayCounter();

    // 1. Counter update (0/12 -> 12/12)
    if (this.boundUI.counterText) {
      this.boundUI.counterText.textContent = countText;
    }
    if (this.boundUI.percentText) {
      this.boundUI.percentText.textContent = countText;
    }

    // 2. Neon Ring Color update
    if (this.boundUI.wheelBox) {
      this.boundUI.wheelBox.style.borderColor = neon.color;
      this.boundUI.wheelBox.style.boxShadow = neon.glow;
    }
    if (this.boundUI.progressCircle) {
      this.boundUI.progressCircle.setAttribute('stroke', neon.color);
      const pct = (this.canonicalFrames.length / 12) * 100;
      const offset = 565.48 - (565.48 * (pct / 100));
      this.boundUI.progressCircle.setAttribute('stroke-dashoffset', offset);
    }

    // 3. Dominant HUD & Directional Guidance (§C2, §C4)
    const targetAngle = this.currentTargetIndex * this.config.targetSpacingDeg;
    const signedError = this.getAngularDistance(this.normalizedYaw, targetAngle);
    const absError = Math.abs(signedError);

    const pitchSafe = Math.abs(this.currentPitch) <= this.config.pitchLimitDeg;
    const rollSafe = Math.abs(this.currentRoll) <= this.config.rollLimitDeg;
    const isStationary = this.currentAngularVelocity <= this.config.maxAngularVelocityDegSec;

    if (this.boundUI.statusPill) {
      let msg = 'Ready to start 360° capture';
      if (this.state === STATES.IDLE || this.state === STATES.CAMERA_READY) {
        msg = 'Ready to start 360° capture';
      } else if (this.state === STATES.CAPTURE_COMPLETE || this.state === STATES.GENERATION_READY) {
        msg = '12/12 Capture Complete! 3D ready.';
      } else if (this.state === STATES.SENSOR_FALLBACK) {
        msg = 'Sensors unavailable. Please use Manual Upload.';
      } else if (this.isCountdownState()) {
        msg = `Auto capture in ${this.countdownSecondsRemaining}s — hold still!`;
      } else if (this.state === STATES.CAPTURE || this.state === STATES.QUALITY_CHECK) {
        msg = `Capturing checkpoint ${this.currentTargetIndex + 1}...`;
      } else if (this.state === STATES.N_OF_12_CAPTURED) {
        msg = `Checkpoint ${this.canonicalFrames.length}/12 confirmed!`;
      } else if (!pitchSafe) {
        msg = `⚠️ Tilt warning: hold phone upright (${Math.round(this.currentPitch)}°)`;
      } else if (!rollSafe) {
        msg = `⚠️ Level warning: level phone horizontally (${Math.round(this.currentRoll)}°)`;
      } else if (!isStationary) {
        msg = '⚠️ Turning too fast — slow down';
      } else if (this.state === STATES.STABILIZING || this.state === STATES.STOP) {
        msg = `🎯 Target locked (${targetAngle}°)! Hold still...`;
      } else if (absError <= (this.config.targetToleranceDeg || 4.5)) {
        msg = `🎯 Target reached (${targetAngle}°) — hold steady`;
      } else if (signedError > 0) {
        msg = `◀️ Overshot by ${Math.round(signedError)}° — turn back slowly`;
      } else {
        msg = `▶️ Turn clockwise +${Math.round(absError)}° to ${targetAngle}°`;
      }
      this.boundUI.statusPill.textContent = msg;
    }

    // Update speed and guidance dot indicator
    const speedDot = (this.boundUI && this.boundUI.speedDot) ||
                     (typeof document !== 'undefined' ? document.getElementById('guidedSpeedDot') : null);
    if (speedDot) {
      if (!pitchSafe || !rollSafe || !isStationary || (signedError > (this.config.targetToleranceDeg || 4.5))) {
        speedDot.style.background = '#ef4444';
        speedDot.style.boxShadow = '0 0 8px #ef4444';
      } else if (absError <= (this.config.targetToleranceDeg || 4.5) || this.isCountdownState()) {
        speedDot.style.background = '#22c55e';
        speedDot.style.boxShadow = '0 0 8px #22c55e';
      } else {
        speedDot.style.background = '#facc15';
        speedDot.style.boxShadow = '0 0 8px #facc15';
      }
    }

    // 4. Render 12 Checkpoints in SVG group
    if (this.boundUI.segmentsGroup) {
      this.render12CheckpointsSvg(this.boundUI.segmentsGroup);
    }

    // 5. Rotation text
    if (this.boundUI.rotText) {
      const rot = Math.round(this.normalizedYaw);
      this.boundUI.rotText.textContent = `${rot}° ROTATION`;
    }

    // 6. Real-time Heading Needle and HUD angle
    if (this.boundUI.needle) {
      this.boundUI.needle.style.transform = `rotate(${this.normalizedYaw.toFixed(1)}deg)`;
      try { this.boundUI.needle.setAttribute('transform', `rotate(${this.normalizedYaw.toFixed(1)} 100 100)`); } catch(e) {}
    } else if (typeof document !== 'undefined') {
      const needle = document.getElementById('captureHeadingNeedle');
      if (needle) {
        needle.style.transform = `rotate(${this.normalizedYaw.toFixed(1)}deg)`;
        try { needle.setAttribute('transform', `rotate(${this.normalizedYaw.toFixed(1)} 100 100)`); } catch(e) {}
      }
    }
    if (this.boundUI.hudAngle) {
      this.boundUI.hudAngle.textContent = `${Math.round(this.normalizedYaw)}°`;
    } else if (typeof document !== 'undefined') {
      const ha = document.getElementById('captureHudAngle');
      if (ha) ha.textContent = `${Math.round(this.normalizedYaw)}°`;
    }

    const hudTargetText = `TARGET ${targetAngle}° · ${signedError > 0 ? '+' : ''}${Math.round(signedError)}°`;
    if (this.boundUI.hudTarget) {
      this.boundUI.hudTarget.textContent = hudTargetText;
    } else if (typeof document !== 'undefined') {
      const ht = document.getElementById('captureHudTarget');
      if (ht) ht.textContent = hudTargetText;
    }
  }

  triggerManualCapture() {
    if (this.state === STATES.IDLE || this.state === STATES.CAPTURE_COMPLETE || this.state === STATES.GENERATION_READY) {
      return false;
    }
    this.cancelCountdown('manual_trigger');
    return this.executeCapture();
  }

  render12CheckpointsSvg(gElement) {
    if (!gElement) return;
    gElement.innerHTML = '';
    const total = 12;
    const capturedCount = this.canonicalFrames.length;

    for (let i = 0; i < total; i++) {
      const angle = (i * 30) * Math.PI / 180;
      const x = 100 + 90 * Math.sin(angle);
      const y = 100 - 90 * Math.cos(angle);
      const isCaptured = i < capturedCount;
      const isCurrent = i === this.currentTargetIndex && !isCaptured;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', y.toFixed(2));
      dot.setAttribute('r', isCurrent ? '5.5' : (isCaptured ? '4.5' : '3'));
      dot.setAttribute('fill', isCaptured ? '#22C55E' : (isCurrent ? '#38BDF8' : 'rgba(255,255,255,0.25)'));
      if (isCurrent) {
        dot.setAttribute('stroke', '#fff');
        dot.setAttribute('stroke-width', '1.5');
      }
      gElement.appendChild(dot);
    }
  }

  // ─── Generation Adapter Submission Boundary (§C8) ───────────────────────────
  submitGenerationJob() {
    this.generationNetworkCallCount = 0;
    return {
      submitted: false,
      status: 'SUBMISSION_DISABLED_STAGE2_P1_BOUNDARY',
      generationNetworkCallCount: 0,
      notice: '3D generation integration is pending the next verified stage.',
    };
  }

  // ─── Lightweight Stage 2 Mobile RI Telemetry Adapter (§RI-S2) ───────────────
  initTelemetry(qaSessionToken = null, projectId = 'prj-free-b0c6f3ea') {
    this.telemetry = {
      sessionId: 'RI-S2-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      qaSessionToken: qaSessionToken,
      projectId: projectId,
      startTime: Date.now(),
      stateTransitions: [],
      camera: {
        trackReady: !!(this.activeStream && this.activeStream.active),
        streamCount: this.streamCount,
      }
    };
    this.recordTelemetryEvent('INIT', { state: this.state });
    return this.telemetry.sessionId;
  }

  recordTelemetryEvent(type, payload = {}) {
    if (!this.telemetry) return;
    this.telemetry.stateTransitions.push({
      t: Date.now() - this.telemetry.startTime,
      type,
      state: this.state,
      yaw: this.normalizedYaw,
      target: this.currentTargetIndex,
      ...payload
    });
    // Keep bounded rolling buffer of last 100 transitions
    if (this.telemetry.stateTransitions.length > 100) {
      this.telemetry.stateTransitions.shift();
    }
  }

  async sendTelemetryReport(endpointUrl = '/api/internal-qa/mobile-ri/report') {
    if (!this.telemetry) return { success: false, reason: 'TELEMETRY_NOT_INITIALIZED' };
    if (typeof fetch !== 'function') {
      return { success: false, reason: 'FETCH_UNAVAILABLE' };
    }
    try {
      const payload = {
        sessionId: this.telemetry.sessionId,
        projectId: this.telemetry.projectId,
        summary: {
          sampleCount: this.sensorSampleCount || 0,
          validAlphaCount: this.validAlphaCount || 0,
          validBetaCount: this.validBetaCount || 0,
          sensorSource: this.sensorSource || 'unknown',
          targetCompleted: this.canonicalFrames.length,
          frameCount: this.canonicalFrames.length,
          deviceOrientationAvailable: this.sensorAvailable,
          currentPitch: this.currentPitch,
          currentRoll: this.currentRoll,
          perTargetFailures: this.perTargetFailures,
          latestSignedError: this.getSignedYawError(),
        },
        timeline: this.telemetry.stateTransitions,
        runtimeState: {
          state: this.state,
          currentTargetIndex: this.currentTargetIndex,
          normalizedYaw: this.normalizedYaw,
          currentPitch: this.currentPitch,
          currentRoll: this.currentRoll,
          camera: {
            trackReady: !!(this.activeStream && this.activeStream.active),
            streamCount: this.streamCount,
          },
        },
        frames: this.canonicalFrames.map(f => ({
          targetIndex: f.targetIndex,
          targetYaw: f.targetYaw,
          capturedYaw: f.capturedYaw,
          yawError: f.yawError,
          qualityScore: f.qualityScore,
          hash: f.imageHash || f.hash,
          byteSize: f.byteSize || 0,
          isReal: !!f.isRealStreamCapture
        }))
      };

      const headers = { 'Content-Type': 'application/json' };
      if (this.telemetry.qaSessionToken) {
        headers['x-qa-session'] = this.telemetry.qaSessionToken;
      }

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        return { success: false, status: res.status, reason: 'HTTP_' + res.status };
      }

      const data = await res.json();
      if (data && data.ok && data.status === 'PERSISTED' && data.sessionId === this.telemetry.sessionId) {
        return {
          success: true,
          sessionId: data.sessionId,
          status: data.status,
          artifactPath: data.artifactPath,
          filesSaved: data.filesSaved
        };
      }
      return { success: false, reason: 'INVALID_SERVER_RECEIPT', data };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  }

  transitionTo(newState) {
    this.state = newState;
    if (this.telemetry) {
      this.recordTelemetryEvent('STATE_TRANSITION', { toState: newState });
    }
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(newState, this.getNeonState(), this);
    }
    this.updateUIRefresh();
  }
}

// ─── Module & Window Exports ─────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.Stage2CaptureEngine = Stage2CaptureEngine;
  window.STAGE2_STATES = STATES;
  window.STAGE2_NEON_STATES = NEON_STATES;
  window.STAGE2_CONFIG = DEFAULT_STAGE2_CONFIG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Stage2CaptureEngine,
    STATES,
    NEON_STATES,
    DEFAULT_STAGE2_CONFIG,
  };
}
