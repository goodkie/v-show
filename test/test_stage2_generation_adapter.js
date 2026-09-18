/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3DZ STAGE 2 — GENERATION ADAPTER DETERMINISTIC VERIFICATION SUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates Track P4 requirements:
 *   - P4.1: Single adapter interface for CAMERA_ROTATIONAL_SENSOR & MANUAL_PHOTO_UPLOAD
 *   - P4.2: Hard Network Lock (remoteEnabled = false returns GENERATION_TRANSPORT_DISABLED)
 *   - P4.3: Discovered endpoint compliance (/api/projects/:id/spatial/start & /api/spatial-jobs/:jobId)
 *   - P4.4: Request contract preservation (Camera retains sensors, Upload remains UNKNOWN/null)
 *   - P4.5: Idempotency key stability and duplicate prevention
 *   - P4.6: State machine transitions, timeout, retries, cancel, and phased progress
 *   - P4.7: Mock transport matrix (success, timeout, retry, idempotency, queued, processing, failure, cancel)
 *   - P4.8: Strict zero real network calls verification (createCalls=0, statusCalls=0, cancelCalls=0)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const path = require('path');
const {
  Stage2GenerationAdapter,
  JOB_STATES,
  PHASE_LABELS,
  DISCOVERED_ENDPOINTS,
  ERROR_CODES,
} = require('../virtual-tradeshow-commercial-v1/client/capture/stage2-generation-adapter.js');
const { Stage2CaptureEngine } = require('../virtual-tradeshow-commercial-v1/client/capture/stage2-capture-engine.js');

let passedCount = 0;
let failedCount = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passedCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}:`, err.message);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passedCount++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedCount++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}:`, err.message);
  }
}

// ─── Helper: Generate Canonical 12-Frame Camera Manifest ─────────────────────
function createMockCameraManifest() {
  const engine = new Stage2CaptureEngine();
  engine.relativeYawOrigin = 0.0;
  engine.lastRawAlpha = 0.0;

  for (let i = 0; i < 12; i++) {
    engine.currentTargetIndex = i;
    engine.normalizedYaw = i * 30.0;
    engine.currentPitch = 1.2;
    engine.currentRoll = -0.8;
    engine.currentAngularVelocity = 4.5;
    engine.executeCapture();
  }
  return engine.normalizedManifest;
}

// ─── Helper: Generate 8-Frame Manual Upload Manifest ────────────────────────
function createMockUploadManifest() {
  const uploads = [];
  for (let i = 0; i < 8; i++) {
    uploads.push({
      originalFilename: `photo_${i + 1}.jpg`,
      imageHash: `sha256:manual-upload-${i}`,
      lastModified: Date.now() - (10 - i) * 60000,
      width: 1920,
      height: 1080,
    });
  }
  return Stage2CaptureEngine.normalizeManualUploads(uploads);
}

// ─── Helper: Mock Transport Implementation ──────────────────────────────────
class MockGenerationTransport {
  constructor(config = {}) {
    this.createHandler = config.create || (async (payload) => ({
      jobId: 'job-mock-' + Date.now(),
      status: 'QUEUED',
      progress: 5,
    }));
    this.statusHandler = config.status || (async (jobId) => ({
      status: 'PROCESSING',
      progress: 45,
      currentStage: 'RECONSTRUCTING',
    }));
    this.cancelHandler = config.cancel || (async (jobId) => ({
      status: 'CANCELED',
      jobId,
    }));

    this.calls = { create: [], status: [], cancel: [] };
  }

  async create(payload, options) {
    this.calls.create.push({ payload, options });
    return this.createHandler(payload, options);
  }

  async status(jobId, options) {
    this.calls.status.push({ jobId, options });
    return this.statusHandler(jobId, options);
  }

  async cancel(jobId, options) {
    this.calls.cancel.push({ jobId, options });
    return this.cancelHandler(jobId, options);
  }
}

// ─── TEST SUITE EXECUTION ────────────────────────────────────────────────────
console.log('================================================================');
console.log('3DZ STAGE 2 GENERATION ADAPTER — DETERMINISTIC VERIFICATION SUITE');
console.log('================================================================\n');

(async () => {
  const cameraManifest = createMockCameraManifest();
  const uploadManifest = createMockUploadManifest();

  // [T01] Hard Network Lock: createGenerationRequest returns GENERATION_TRANSPORT_DISABLED
  await testAsync('[T01] Hard Network Lock: createGenerationRequest returns GENERATION_TRANSPORT_DISABLED', async () => {
    const adapter = new Stage2GenerationAdapter({ remoteEnabled: false });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 'GENERATION_TRANSPORT_DISABLED');
    assert.strictEqual(res.code, 'GENERATION_TRANSPORT_DISABLED');
    assert.strictEqual(res.jobId, null);
    assert.strictEqual(adapter.realNetworkStats.createCalls, 0);
  });

  // [T02] Discovered endpoints match verified application routes
  test('[T02] Discovered endpoints match verified application routes', () => {
    assert.strictEqual(DISCOVERED_ENDPOINTS.JOB_CREATE_ENDPOINT, '/api/projects/:id/spatial/start');
    assert.strictEqual(DISCOVERED_ENDPOINTS.JOB_STATUS_ENDPOINT, '/api/spatial-jobs/:jobId');
    assert.strictEqual(DISCOVERED_ENDPOINTS.JOB_CANCEL_ENDPOINT, 'UNRESOLVED');
  });

  // [T03] Request Contract: Camera manifest retains valid sensor metadata
  test('[T03] Request Contract: Camera manifest retains valid sensor metadata', () => {
    const adapter = new Stage2GenerationAdapter();
    const payload = adapter.buildGenerationPayload(cameraManifest);

    assert.strictEqual(payload.schemaVersion, 5);
    assert.strictEqual(payload.sourceType, 'CAMERA_ROTATIONAL_SENSOR');
    assert.strictEqual(payload.frameCount, 12);
    assert.strictEqual(payload.c12_7_ringConstraintPreserved, true);
    assert.strictEqual(payload.frames.length, 12);

    const f0 = payload.frames[0];
    assert.strictEqual(f0.frameId, 'frm-01');
    assert.strictEqual(f0.orientationStatus, 'SENSOR_DERIVED');
    assert.strictEqual(typeof f0.yawDeg, 'number');
    assert.strictEqual(typeof f0.pitchDeg, 'number');
    assert.strictEqual(typeof f0.rollDeg, 'number');
    assert.strictEqual(typeof f0.angularVelocityDegSec, 'number');
    assert.strictEqual(f0.adjacency.prevFrameId, 'frm-12');
    assert.strictEqual(f0.adjacency.nextFrameId, 'frm-02');
  });

  // [T04] Request Contract: Upload manifest maintains UNKNOWN orientation and null yaw
  test('[T04] Request Contract: Upload manifest maintains UNKNOWN orientation and null yaw', () => {
    const adapter = new Stage2GenerationAdapter();
    const payload = adapter.buildGenerationPayload(uploadManifest);

    assert.strictEqual(payload.schemaVersion, 5);
    assert.strictEqual(payload.sourceType, 'MANUAL_PHOTO_UPLOAD');
    assert.strictEqual(payload.frameCount, 8);
    assert.strictEqual(payload.frames.length, 8);

    for (let i = 0; i < payload.frames.length; i++) {
      const f = payload.frames[i];
      assert.strictEqual(f.orientationStatus, 'UNKNOWN', `Frame ${i} orientationStatus must be UNKNOWN`);
      assert.strictEqual(f.yawDeg, null, `Frame ${i} yawDeg must be strictly null`);
      assert.strictEqual(f.pitchDeg, null, `Frame ${i} pitchDeg must be strictly null`);
      assert.strictEqual(f.rollDeg, null, `Frame ${i} rollDeg must be strictly null`);
      assert.strictEqual(f.angularVelocityDegSec, null, `Frame ${i} angularVelocity must be null`);
      assert.strictEqual(f.adjacency.sequentialOrder, i + 1);
    }
  });

  // [T05] Stable Idempotency Key computation
  test('[T05] Stable Idempotency Key computation', () => {
    const adapter = new Stage2GenerationAdapter();
    const key1 = adapter.computeIdempotencyKey(cameraManifest);
    const key2 = adapter.computeIdempotencyKey(cameraManifest);

    assert.ok(key1 && key1.startsWith('idem-'));
    assert.strictEqual(key1, key2, 'Identical manifests must yield identical idempotency keys');

    const uploadKey = adapter.computeIdempotencyKey(uploadManifest);
    assert.notStrictEqual(key1, uploadKey, 'Different manifests must yield different idempotency keys');
  });

  // [T06] Mock Transport: Successful job creation
  await testAsync('[T06] Mock Transport: Successful job creation', async () => {
    const mockTransport = new MockGenerationTransport({
      create: async (p) => ({
        jobId: 'job-test-success-001',
        status: 'QUEUED',
        progress: 5,
      }),
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.status, 'QUEUED');
    assert.strictEqual(res.jobId, 'job-test-success-001');
    assert.strictEqual(res.phaseLabel, 'Queued');
    assert.strictEqual(mockTransport.calls.create.length, 1);
  });

  // [T07] Idempotency replay: duplicate submission returns existing job without second transport call
  await testAsync('[T07] Idempotency replay: duplicate submission returns existing job', async () => {
    const mockTransport = new MockGenerationTransport({
      create: async () => ({
        jobId: 'job-test-idem-002',
        status: 'QUEUED',
        progress: 5,
      }),
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport });
    const res1 = await adapter.createGenerationRequest(cameraManifest);
    assert.strictEqual(res1.ok, true);
    assert.strictEqual(res1.isDuplicate, false);
    assert.strictEqual(mockTransport.calls.create.length, 1);

    const res2 = await adapter.createGenerationRequest(cameraManifest);
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.isDuplicate, true);
    assert.strictEqual(res2.idempotentReplay, true);
    assert.strictEqual(res2.jobId, 'job-test-idem-002');
    assert.strictEqual(mockTransport.calls.create.length, 1, 'Transport create must NOT be invoked twice');
  });

  // [T08] Timeout handling: aborted request returns TIMEOUT_ERROR
  await testAsync('[T08] Timeout handling: aborted request returns TIMEOUT_ERROR', async () => {
    const mockTransport = new MockGenerationTransport({
      create: async (p, opts) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport, timeoutMs: 50 });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'TIMEOUT_ERROR');
    assert.ok(res.message.includes('timed out'));
  });

  // [T09] Retry mechanism: retries on transient errors up to ceiling
  await testAsync('[T09] Retry mechanism: retries on transient errors up to ceiling', async () => {
    let callCount = 0;
    const mockTransport = new MockGenerationTransport({
      create: async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Transient 503 Service Unavailable');
        }
        return {
          jobId: 'job-test-retry-003',
          status: 'QUEUED',
          progress: 5,
        };
      },
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport, maxRetries: 3 });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.jobId, 'job-test-retry-003');
    assert.strictEqual(callCount, 3, 'Must have attempted 3 times before succeeding');
    assert.strictEqual(res.attempts, 3);
  });

  // [T10] Retry ceiling: fails with NETWORK_ERROR when retries exhausted
  await testAsync('[T10] Retry ceiling: fails with NETWORK_ERROR when retries exhausted', async () => {
    let callCount = 0;
    const mockTransport = new MockGenerationTransport({
      create: async () => {
        callCount++;
        throw new Error('Persistent 500 Server Error');
      },
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport, maxRetries: 2 });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'NETWORK_ERROR');
    assert.strictEqual(callCount, 3, 'Initial attempt + 2 retries = 3 calls');
  });

  // [T11] Status query with phase labels (no fake progress percentage)
  await testAsync('[T11] Status query with phase labels (no fake progress percentage)', async () => {
    const mockTransport = new MockGenerationTransport({
      status: async (jobId) => ({
        job: {
          jobId,
          status: 'PROCESSING',
          currentStage: 'PREPARING_NEURAL_SPARSE_POINT_CLOUD',
          progress: null, // Backend does not supply percentage
        },
      }),
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport });
    const res = await adapter.getGenerationStatus('job-999');

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.status, 'PROCESSING');
    assert.strictEqual(res.phaseLabel, 'Uploading'); // Mapped to Uploading/Preparing
    assert.strictEqual(res.progress, null, 'Progress must remain null when not supplied');
  });

  // [T12] Client-Authoritative cancellation
  await testAsync('[T12] Client-Authoritative cancellation', async () => {
    let transportCancelled = false;
    const mockTransport = new MockGenerationTransport({
      create: async () => ({ jobId: 'job-to-cancel-123', status: 'QUEUED' }),
      cancel: async () => { transportCancelled = true; },
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport });
    await adapter.createGenerationRequest(cameraManifest);

    const cancelRes = await adapter.cancelGeneration('job-to-cancel-123');
    assert.strictEqual(cancelRes.ok, true);
    assert.strictEqual(cancelRes.status, 'CANCELED');
    assert.strictEqual(transportCancelled, true);

    const statusRes = await adapter.getGenerationStatus('job-to-cancel-123');
    assert.strictEqual(statusRes.job.status, 'CANCELED');
  });

  // [T13] Malformed response handling
  await testAsync('[T13] Malformed response handling', async () => {
    const mockTransport = new MockGenerationTransport({
      create: async () => ({ invalidPayload: true }), // Missing jobId
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, transport: mockTransport, maxRetries: 0 });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'NETWORK_ERROR');
    assert.ok(res.message.includes('Malformed response'));
  });

  // [T14] Strict Real Network Call Monitoring: All real calls remain ZERO (§P4.8)
  test('[T14] Strict Real Network Call Monitoring: All real calls remain ZERO', () => {
    const adapter = new Stage2GenerationAdapter({ remoteEnabled: false });
    assert.strictEqual(adapter.realNetworkStats.createCalls, 0, 'Real create calls must be 0');
    assert.strictEqual(adapter.realNetworkStats.statusCalls, 0, 'Real status calls must be 0');
    assert.strictEqual(adapter.realNetworkStats.cancelCalls, 0, 'Real cancel calls must be 0');
  });

  console.log('\n================================================================');
  console.log(`TEST EXECUTION COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
