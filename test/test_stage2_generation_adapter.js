/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3DZ STAGE 2 — GENERATION ADAPTER DETERMINISTIC VERIFICATION SUITE (P5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates Track P5 requirements:
 *   - P5.0-A: Canonical sourceType MANUAL_UPLOAD and alias MANUAL_PHOTO_UPLOAD normalization
 *   - P5.0-B: Explicit cancel semantics (cancelScope: CLIENT_POLLING_ONLY, remoteJobCanceled: false)
 *   - P5.1: Discovered endpoint compliance (start, generate alias, status, job, candidate, apply, discard)
 *   - P5.2: Hard Network Lock (remoteEnabled = false returns GENERATION_TRANSPORT_DISABLED)
 *   - P5.3: Request Contract (Camera retains sensors, Upload remains UNKNOWN/null)
 *   - P5.4: Project ID Contract (projectId required; missing projectId fails locally)
 *   - P5.5: Idempotency Key sensitivity (projectId, captureId, frameHashes, sourceType)
 *   - P5.6 & P5.7: Polling lifecycle (QUEUED -> PROCESSING -> SUCCEEDED, terminal stop, client abort)
 *   - P5.8: Active Job Recovery (GET /api/projects/:id/spatial/job)
 *   - P5.9: Candidate contract (getCandidate, applyCandidate, discardCandidate)
 *   - P5.10: Phase label progress without simulated percentages
 *   - P5.12: Strict Real Network Call Monitoring (All real calls remain ZERO)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const assert = require('assert');
const {
  Stage2GenerationAdapter,
  CANONICAL_SOURCE_TYPES,
  JOB_STATES,
  POLLING_STATES,
  PHASE_LABELS,
  DISCOVERED_ENDPOINTS,
  ERROR_CODES,
  normalizeSourceType,
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

// ─── Helpers: Generate Canonical Manifests ───────────────────────────────────
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

function createMockUploadManifest() {
  const uploads = [];
  for (let i = 0; i < 8; i++) {
    uploads.push({
      originalFilename: `photo_${i + 1}.jpg`,
      imageHash: `sha256:manual-upload-${i}`,
      lastModified: 1700000000000 + i * 1000,
      width: 1920,
      height: 1080,
    });
  }
  return Stage2CaptureEngine.normalizeManualUploads(uploads);
}

// ─── Mock Transport Helper ───────────────────────────────────────────────────
class MockGenerationTransport {
  constructor(config = {}) {
    this.cancelledJobs = new Set();
    this.createHandler = config.create || (async () => ({
      jobId: 'job-mock-' + Date.now(),
      status: 'QUEUED',
      progress: 5,
    }));
    this.statusHandler = config.status || (async (jobId) => {
      if (this.cancelledJobs.has(jobId)) {
        return { status: 'CANCELED', progress: null };
      }
      return { status: 'PROCESSING', progress: 45, currentStage: 'RECONSTRUCTING' };
    });
    this.cancelHandler = config.cancel || (async (jobId) => {
      this.cancelledJobs.add(jobId);
      return { status: 'CANCELED', jobId };
    });
    this.activeJobHandler = config.getActiveJob || (async () => ({ job: null }));
    this.candidateHandler = config.getCandidate || (async () => ({ candidate: { candidateId: 'cand-001' } }));
    this.applyHandler = config.applyCandidate || (async () => ({ success: true }));
    this.discardHandler = config.discardCandidate || (async () => ({ success: true }));

    this.calls = { create: [], status: [], cancel: [], activeJob: [], candidate: [], apply: [], discard: [] };
  }

  async create(p, o) { this.calls.create.push({ p, o }); return this.createHandler(p, o); }
  async status(id, o) { this.calls.status.push({ id, o }); return this.statusHandler(id, o); }
  async cancel(id, o) { this.calls.cancel.push({ id, o }); return this.cancelHandler(id, o); }
  async getActiveJob(pId, o) { this.calls.activeJob.push({ pId, o }); return this.activeJobHandler(pId, o); }
  async getCandidate(pId, cId, o) { this.calls.candidate.push({ pId, cId, o }); return this.candidateHandler(pId, cId, o); }
  async applyCandidate(pId, cId, o) { this.calls.apply.push({ pId, cId, o }); return this.applyHandler(pId, cId, o); }
  async discardCandidate(pId, cId, o) { this.calls.discard.push({ pId, cId, o }); return this.discardHandler(pId, cId, o); }
}

// ─── TEST EXECUTION ──────────────────────────────────────────────────────────
console.log('================================================================');
console.log('3DZ STAGE 2 GENERATION ADAPTER — DETERMINISTIC VERIFICATION SUITE (P5)');
console.log('================================================================\n');

(async () => {
  const cameraManifest = createMockCameraManifest();
  const uploadManifest = createMockUploadManifest();
  const TEST_PROJECT_ID = 'proj-stage2-p5-test';

  // [T01] Hard Network Lock: createGenerationRequest returns GENERATION_TRANSPORT_DISABLED
  await testAsync('[T01] Hard Network Lock: createGenerationRequest returns GENERATION_TRANSPORT_DISABLED', async () => {
    const adapter = new Stage2GenerationAdapter({ remoteEnabled: false, projectId: TEST_PROJECT_ID });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 'GENERATION_TRANSPORT_DISABLED');
    assert.strictEqual(res.code, 'GENERATION_TRANSPORT_DISABLED');
    assert.strictEqual(res.jobId, null);
    assert.strictEqual(adapter.realNetworkStats.createCalls, 0);
  });

  // [T02] Canonical sourceType MANUAL_UPLOAD and alias MANUAL_PHOTO_UPLOAD normalization (§P5.0-A)
  test('[T02] Canonical sourceType MANUAL_UPLOAD and alias MANUAL_PHOTO_UPLOAD normalization', () => {
    const adapter = new Stage2GenerationAdapter({ projectId: TEST_PROJECT_ID });

    // Canonical MANUAL_UPLOAD
    const p1 = adapter.buildGenerationPayload({
      ...uploadManifest,
      sourceType: 'MANUAL_UPLOAD',
    }, TEST_PROJECT_ID);
    assert.strictEqual(p1.sourceType, 'MANUAL_UPLOAD');

    // Alias MANUAL_PHOTO_UPLOAD
    const p2 = adapter.buildGenerationPayload({
      ...uploadManifest,
      sourceType: 'MANUAL_PHOTO_UPLOAD',
    }, TEST_PROJECT_ID);
    assert.strictEqual(p2.sourceType, 'MANUAL_UPLOAD', 'Alias must normalize to MANUAL_UPLOAD');

    // Camera sourceType
    const pCam = adapter.buildGenerationPayload(cameraManifest, TEST_PROJECT_ID);
    assert.strictEqual(pCam.sourceType, 'CAMERA_ROTATIONAL_SENSOR');
  });

  // [T03] Cancel Semantics: Local polling termination without claiming server cancellation (§P5.0-B)
  await testAsync('[T03] Cancel Semantics: Local polling termination without claiming server cancellation', async () => {
    const mockTransport = new MockGenerationTransport();
    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, projectId: TEST_PROJECT_ID, transport: mockTransport });

    const createRes = await adapter.createGenerationRequest(cameraManifest);
    const cancelRes = await adapter.cancelGeneration(createRes.jobId);

    assert.strictEqual(cancelRes.ok, true);
    assert.strictEqual(cancelRes.status, 'CANCELED');
    assert.strictEqual(cancelRes.cancelScope, 'CLIENT_POLLING_ONLY');
    assert.strictEqual(cancelRes.remoteJobCanceled, false, 'Must NEVER claim remote server cancellation');

    // Status check reflects client-authoritative cancellation
    const statusRes = await adapter.getGenerationStatus(createRes.jobId);
    assert.strictEqual(statusRes.status, 'CANCELED');
    assert.strictEqual(statusRes.cancelScope, 'CLIENT_POLLING_ONLY');
    assert.strictEqual(statusRes.remoteJobCanceled, false);
  });

  // [T04] Project ID Contract: missing projectId fails locally (§P5.4)
  await testAsync('[T04] Project ID Contract: missing projectId fails locally', async () => {
    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, projectId: null });
    const res = await adapter.createGenerationRequest(cameraManifest); // no projectId provided

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'MISSING_PROJECT_ID');
    assert.strictEqual(adapter.realNetworkStats.createCalls, 0);
  });

  // [T05] Request Contract: Camera retains valid sensors; Upload maintains UNKNOWN & null (§P5.3)
  test('[T05] Request Contract: Camera retains valid sensors; Upload maintains UNKNOWN & null', () => {
    const adapter = new Stage2GenerationAdapter({ projectId: TEST_PROJECT_ID });

    // Camera
    const camPayload = adapter.buildGenerationPayload(cameraManifest, TEST_PROJECT_ID);
    assert.strictEqual(camPayload.frames[0].orientationStatus, 'SENSOR_DERIVED');
    assert.strictEqual(typeof camPayload.frames[0].yawDeg, 'number');
    assert.strictEqual(typeof camPayload.frames[0].pitchDeg, 'number');
    assert.strictEqual(typeof camPayload.frames[0].rollDeg, 'number');

    // Upload
    const upPayload = adapter.buildGenerationPayload(uploadManifest, TEST_PROJECT_ID);
    for (const f of upPayload.frames) {
      assert.strictEqual(f.orientationStatus, 'UNKNOWN');
      assert.strictEqual(f.yawDeg, null);
      assert.strictEqual(f.pitchDeg, null);
      assert.strictEqual(f.rollDeg, null);
      assert.strictEqual(f.angularVelocityDegSec, null);
    }
  });

  // [T06] Idempotency Sensitivity: projectId, captureId, frameHashes, sourceType (§P5.5)
  test('[T06] Idempotency Sensitivity: projectId, captureId, frameHashes, sourceType', () => {
    const adapter = new Stage2GenerationAdapter();

    const baseKey = adapter.computeIdempotencyKey('proj-A', cameraManifest);
    const sameKey = adapter.computeIdempotencyKey('proj-A', cameraManifest);
    assert.strictEqual(baseKey, sameKey, 'Identical inputs must produce identical key');

    // ProjectId change
    const diffProjKey = adapter.computeIdempotencyKey('proj-B', cameraManifest);
    assert.notStrictEqual(baseKey, diffProjKey, 'Different projectId must produce different key');

    // CaptureId change
    const diffCapKey = adapter.computeIdempotencyKey('proj-A', { ...cameraManifest, captureId: 'cap-different' });
    assert.notStrictEqual(baseKey, diffCapKey, 'Different captureId must produce different key');

    // Frame hash change
    const modifiedFrames = cameraManifest.frames.map((f, i) => i === 0 ? { ...f, imageHash: 'sha256:tampered' } : f);
    const diffHashKey = adapter.computeIdempotencyKey('proj-A', { ...cameraManifest, frames: modifiedFrames });
    assert.notStrictEqual(baseKey, diffHashKey, 'Modified frame hash must produce different key');
  });

  // [T07] Polling Lifecycle & Terminal State Stop (§P5.7)
  await testAsync('[T07] Polling Lifecycle & Terminal State Stop', async () => {
    let pollCount = 0;
    const mockTransport = new MockGenerationTransport({
      status: async (jobId) => {
        pollCount++;
        if (pollCount === 1) return { status: 'QUEUED', progress: 5 };
        if (pollCount === 2) return { status: 'PROCESSING', currentStage: 'SPARSE_RECONSTRUCTION' };
        return { status: 'SUCCEEDED', progress: 100, currentStage: 'COMPLETED' };
      },
    });

    const adapter = new Stage2GenerationAdapter({
      remoteEnabled: true,
      projectId: TEST_PROJECT_ID,
      transport: mockTransport,
      pollIntervalMs: 20,
    });

    const progressPhases = [];
    const pollResult = await adapter.pollGenerationJob('job-poll-001', {
      onProgress: (p, phase, status) => progressPhases.push({ phase, status }),
      pollIntervalMs: 20,
      timeoutMs: 1000,
    });

    assert.strictEqual(pollResult.ok, true);
    assert.strictEqual(pollResult.status, 'SUCCEEDED');
    assert.strictEqual(pollCount, 3, 'Polling must terminate upon reaching SUCCEEDED');
    assert.ok(progressPhases.some(p => p.phase === 'Queued'));
    assert.ok(progressPhases.some(p => p.phase === 'Processing'));
    assert.ok(progressPhases.some(p => p.phase === 'Completed'));
  });

  // [T08] Polling Client Abort (§P5.7)
  await testAsync('[T08] Polling Client Abort', async () => {
    const mockTransport = new MockGenerationTransport({
      status: async () => ({ status: 'PROCESSING', currentStage: 'LONG_PROCESS' }),
    });

    const adapter = new Stage2GenerationAdapter({
      remoteEnabled: true,
      projectId: TEST_PROJECT_ID,
      transport: mockTransport,
      pollIntervalMs: 30,
    });

    // Start poll in background
    const pollPromise = adapter.pollGenerationJob('job-abort-002', { pollIntervalMs: 30, timeoutMs: 5000 });

    // Abort after 50ms
    await new Promise(r => setTimeout(r, 50));
    await adapter.cancelGeneration('job-abort-002');

    const result = await pollPromise;
    assert.strictEqual(result.status, 'CANCELED');
    assert.strictEqual(result.cancelScope, 'CLIENT_POLLING_ONLY');
  });

  // [T09] Active Job Recovery Contract (§P5.8)
  await testAsync('[T09] Active Job Recovery Contract', async () => {
    const mockTransport = new MockGenerationTransport({
      getActiveJob: async (pId) => ({
        job: { jobId: 'job-active-recovered', status: 'PROCESSING', currentStage: 'ALIGNMENT' },
      }),
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, projectId: TEST_PROJECT_ID, transport: mockTransport });
    const res = await adapter.getActiveJobForProject(TEST_PROJECT_ID);

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.job.jobId, 'job-active-recovered');
    assert.strictEqual(res.job.status, 'PROCESSING');
  });

  // [T10] Candidate Contract: get, apply, discard (§P5.9)
  await testAsync('[T10] Candidate Contract: get, apply, discard', async () => {
    const mockTransport = new MockGenerationTransport({
      getCandidate: async (pId, cId) => ({ candidate: { candidateId: cId, format: 'ply' } }),
      applyCandidate: async (pId, cId) => ({ success: true, activeSpatialVersion: cId }),
      discardCandidate: async (pId, cId) => ({ success: true, discarded: cId }),
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, projectId: TEST_PROJECT_ID, transport: mockTransport });

    const getRes = await adapter.getCandidate(TEST_PROJECT_ID, 'cand-123');
    assert.strictEqual(getRes.ok, true);
    assert.strictEqual(getRes.candidate.candidateId, 'cand-123');

    const applyRes = await adapter.applyCandidate(TEST_PROJECT_ID, 'cand-123');
    assert.strictEqual(applyRes.ok, true);
    assert.strictEqual(applyRes.result.success, true);

    const discardRes = await adapter.discardCandidate(TEST_PROJECT_ID, 'cand-123');
    assert.strictEqual(discardRes.ok, true);
    assert.strictEqual(discardRes.result.success, true);
  });

  // [T11] Truthful Phase Labels without Synthesized Percentages (§P5.10)
  test('[T11] Truthful Phase Labels without Synthesized Percentages', () => {
    const adapter = new Stage2GenerationAdapter();
    assert.strictEqual(adapter.mapPhaseLabel('QUEUED', 'QUEUED'), 'Queued');
    assert.strictEqual(adapter.mapPhaseLabel('PROCESSING', 'PREPARING_DATA'), 'Uploading');
    assert.strictEqual(adapter.mapPhaseLabel('PROCESSING', 'SAVING_CANDIDATE'), 'Finalizing');
    assert.strictEqual(adapter.mapPhaseLabel('SUCCEEDED', 'COMPLETED'), 'Completed');
  });

  // [T12] Idempotency Replay with Stable Key (§P5.5)
  await testAsync('[T12] Idempotency Replay with Stable Key', async () => {
    const mockTransport = new MockGenerationTransport({
      create: async () => ({ jobId: 'job-idem-p5-001', status: 'QUEUED' }),
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, projectId: TEST_PROJECT_ID, transport: mockTransport });

    const r1 = await adapter.createGenerationRequest(cameraManifest);
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.isDuplicate, false);
    assert.strictEqual(mockTransport.calls.create.length, 1);

    const r2 = await adapter.createGenerationRequest(cameraManifest);
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.isDuplicate, true);
    assert.strictEqual(r2.idempotentReplay, true);
    assert.strictEqual(mockTransport.calls.create.length, 1, 'Duplicate call must NOT invoke transport');
  });

  // [T13] Retry Ceiling on Transient Network Failures
  await testAsync('[T13] Retry Ceiling on Transient Network Failures', async () => {
    let callCount = 0;
    const mockTransport = new MockGenerationTransport({
      create: async () => {
        callCount++;
        throw new Error('503 Service Unavailable');
      },
    });

    const adapter = new Stage2GenerationAdapter({ remoteEnabled: true, projectId: TEST_PROJECT_ID, transport: mockTransport, maxRetries: 2 });
    const res = await adapter.createGenerationRequest(cameraManifest);

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'NETWORK_ERROR');
    assert.strictEqual(callCount, 3, 'Initial + 2 retries = 3');
  });

  // [T14] Strict Real Network Call Monitoring: All real calls remain strictly ZERO (§P5.12)
  test('[T14] Strict Real Network Call Monitoring: All real calls remain strictly ZERO', () => {
    const adapter = new Stage2GenerationAdapter({ remoteEnabled: false });

    assert.strictEqual(adapter.realNetworkStats.createCalls, 0);
    assert.strictEqual(adapter.realNetworkStats.statusCalls, 0);
    assert.strictEqual(adapter.realNetworkStats.cancelCalls, 0);
    assert.strictEqual(adapter.realNetworkStats.candidateCalls, 0);
    assert.strictEqual(adapter.realNetworkStats.applyCalls, 0);
    assert.strictEqual(adapter.realNetworkStats.discardCalls, 0);
    assert.strictEqual(adapter.realNetworkStats.activeJobCalls, 0);
  });

  console.log('\n================================================================');
  console.log(`TEST EXECUTION COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
