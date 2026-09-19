/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3DZ STAGE 2 — ISOLATED TRANSPORT CONTRACT SUITE (§P5.11, §P5.12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements an isolated test-only HTTP stub server representing the exact SHAPE
 * of the verified spatial endpoints:
 *   TEST_ONLY_GENERATION_STUB = true
 *
 * Verifies:
 *   1. Safety Invariant: With remoteEnabled = false, exactly 0 HTTP calls reach
 *      the server (REAL_GENERATION_NETWORK_CALL_COUNT = 0).
 *   2. Transport Execution: With remoteEnabled = true (isolated to test stub):
 *      - POST /api/projects/:id/spatial/start (Create primary)
 *      - POST /api/projects/:id/spatial/generate (Create alias)
 *      - GET  /api/spatial-jobs/:jobId (Status polling through terminal state)
 *      - GET  /api/projects/:id/spatial/job (Active job recovery)
 *      - GET  /api/projects/:id/spatial/candidate/:candidateId (Candidate status)
 *      - POST /api/projects/:id/spatial/apply (Apply candidate)
 *      - POST /api/projects/:id/spatial/discard (Discard candidate)
 *      - Fault injection: 500 error, timeout, malformed JSON, local polling abort
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const http = require('http');
const assert = require('assert');
const {
  Stage2GenerationAdapter,
  JOB_STATES,
  POLLING_STATES,
  PHASE_LABELS,
  DISCOVERED_ENDPOINTS,
  ERROR_CODES,
} = require('../virtual-tradeshow-commercial-v1/client/capture/stage2-generation-adapter.js');
const { Stage2CaptureEngine } = require('../virtual-tradeshow-commercial-v1/client/capture/stage2-capture-engine.js');

const STUB_PORT = 3897;
const STUB_BASE_URL = `http://127.0.0.1:${STUB_PORT}`;
const TEST_PROJECT_ID = 'proj-stub-stage2-p5';

let passedCount = 0;
let failedCount = 0;
const results = [];

function logPass(name, detail = '') {
  passedCount++;
  results.push({ name, status: 'PASS', detail });
  console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
}

function logFail(name, err) {
  failedCount++;
  const msg = err && err.message ? err.message : String(err);
  results.push({ name, status: 'FAIL', error: msg });
  console.error(`  [FAIL] ${name}:`, msg);
}

// ─── Helper: Generate Canonical 12-Frame Camera Manifest ─────────────────────
function createMockCameraManifest() {
  const engine = new Stage2CaptureEngine();
  engine.relativeYawOrigin = 0.0;
  engine.lastRawAlpha = 0.0;
  for (let i = 0; i < 12; i++) {
    engine.currentTargetIndex = i;
    engine.normalizedYaw = i * 30.0;
    engine.executeCapture();
  }
  return engine.normalizedManifest;
}

// ─── Stub Server State & Metrics ─────────────────────────────────────────────
const stubMetrics = {
  totalCalls: 0,
  startCalls: 0,
  generateCalls: 0,
  statusCalls: 0,
  activeJobCalls: 0,
  candidateCalls: 0,
  applyCalls: 0,
  discardCalls: 0,
};

const stubJobs = new Map();
let stubJobPollSequence = 0;

// ─── Isolated Test-Only Stub HTTP Server (§P5.11) ───────────────────────────
function createStubServer() {
  return http.createServer(async (req, res) => {
    stubMetrics.totalCalls++;
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Fault injection query parameters
    if (url.searchParams.get('test_delay')) {
      const delayMs = parseInt(url.searchParams.get('test_delay'), 10);
      await new Promise(r => setTimeout(r, delayMs));
    }
    if (url.searchParams.get('test_err') === '500') {
      res.writeHead(500, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ ok: false, error: 'Injected 500 Internal Server Error' }));
      return;
    }
    if (url.searchParams.get('test_malformed') === 'true') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end('<<<INVALID JSON NOT PARSABLE>>>');
      return;
    }

    // Helper: read request body JSON
    const readBody = () => new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}); }
        catch (e) { resolve({}); }
      });
    });

    // 1. POST /api/projects/:id/spatial/start (Primary Create)
    if (req.method === 'POST' && pathname.endsWith('/spatial/start')) {
      stubMetrics.startCalls++;
      const body = await readBody();
      const jobId = 'stub-job-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const job = {
        jobId,
        projectId: TEST_PROJECT_ID,
        status: 'QUEUED',
        progress: 5,
        currentStage: 'QUEUED',
        payload: body,
      };
      stubJobs.set(jobId, job);
      res.writeHead(202, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ ok: true, success: true, jobId, status: 'QUEUED', progress: 5, message: 'Spatial generation started in background.' }));
      return;
    }

    // 2. POST /api/projects/:id/spatial/generate (Alias Create)
    if (req.method === 'POST' && pathname.endsWith('/spatial/generate')) {
      stubMetrics.generateCalls++;
      const body = await readBody();
      const jobId = 'stub-job-alias-' + Date.now();
      const job = {
        jobId,
        projectId: TEST_PROJECT_ID,
        status: 'QUEUED',
        progress: 5,
        currentStage: 'QUEUED',
        payload: body,
      };
      stubJobs.set(jobId, job);
      res.writeHead(202, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ ok: true, success: true, jobId, status: 'QUEUED', progress: 5 }));
      return;
    }

    // 3. GET /api/spatial-jobs/:jobId (Status Polling)
    if (req.method === 'GET' && pathname.startsWith('/api/spatial-jobs/')) {
      stubMetrics.statusCalls++;
      const jobId = pathname.replace('/api/spatial-jobs/', '');
      const job = stubJobs.get(jobId) || { jobId, status: 'QUEUED', progress: 5 };

      if (job.isLongRunning) {
        job.status = 'PROCESSING';
        job.currentStage = 'RECONSTRUCTING';
        job.progress = 40;
        res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
        res.end(JSON.stringify({ ok: true, job }));
        return;
      }

      // Multi-step polling progression simulator
      stubJobPollSequence++;
      if (stubJobPollSequence === 1) {
        job.status = 'QUEUED';
        job.currentStage = 'QUEUED';
        job.progress = 10;
      } else if (stubJobPollSequence === 2) {
        job.status = 'PROCESSING';
        job.currentStage = 'RECONSTRUCTING';
        job.progress = 50;
      } else {
        job.status = 'SUCCEEDED';
        job.currentStage = 'SAVING_CANDIDATE';
        job.progress = 100;
        job.candidateId = 'stub-cand-001';
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ ok: true, job }));
      return;
    }

    // 4. GET /api/projects/:id/spatial/job (Active Job Recovery)
    if (req.method === 'GET' && pathname.endsWith('/spatial/job')) {
      stubMetrics.activeJobCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ ok: true, job: { jobId: 'stub-active-recovered', status: 'PROCESSING', progress: 30 } }));
      return;
    }

    // 5. GET /api/projects/:id/spatial/candidate/:candidateId (Candidate Status)
    if (req.method === 'GET' && pathname.includes('/spatial/candidate/')) {
      stubMetrics.candidateCalls++;
      const parts = pathname.split('/');
      const candidateId = parts[parts.length - 1];
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ ok: true, candidate: { candidateId, format: 'ply', type: 'gaussian_splat' } }));
      return;
    }

    // 6. POST /api/projects/:id/spatial/apply (Candidate Apply)
    if (req.method === 'POST' && pathname.endsWith('/spatial/apply')) {
      stubMetrics.applyCalls++;
      const body = await readBody();
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ success: true, activeSpatialVersion: body.candidateId, message: 'Applied successfully.' }));
      return;
    }

    // 7. POST /api/projects/:id/spatial/discard (Candidate Discard)
    if (req.method === 'POST' && pathname.endsWith('/spatial/discard')) {
      stubMetrics.discardCalls++;
      const body = await readBody();
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-stub-server': 'TEST_ONLY_GENERATION_STUB' });
      res.end(JSON.stringify({ success: true, discarded: body.candidateId, message: 'Discarded successfully.' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found on stub' }));
  });
}

// ─── RUN VERIFICATION SUITE ──────────────────────────────────────────────────
console.log('================================================================');
console.log('3DZ STAGE 2 — ISOLATED TRANSPORT CONTRACT VERIFICATION SUITE');
console.log('================================================================\n');

(async () => {
  const cameraManifest = createMockCameraManifest();
  const server = createStubServer();

  await new Promise((resolve) => server.listen(STUB_PORT, '127.0.0.1', resolve));
  console.log(`[Stub Server] Started TEST_ONLY_GENERATION_STUB on ${STUB_BASE_URL}\n`);

  try {
    // ─── PART 1: SAFETY LOCK INVARIANT WITH STUB RUNNING ─────────────────────
    console.log('--- Phase 1: Hard Network Safety Lock Invariant (§P5.12) ---');

    // [P1-A] createGenerationRequest with remoteEnabled=false makes 0 HTTP calls
    try {
      const lockedAdapter = new Stage2GenerationAdapter({
        remoteEnabled: false,
        baseUrl: STUB_BASE_URL,
        projectId: TEST_PROJECT_ID,
      });

      const res = await lockedAdapter.createGenerationRequest(cameraManifest);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'GENERATION_TRANSPORT_DISABLED');
      assert.strictEqual(stubMetrics.startCalls, 0, 'Stub server startCalls must be strictly 0');
      assert.strictEqual(stubMetrics.totalCalls, 0, 'Stub server totalCalls must be strictly 0');
      assert.strictEqual(lockedAdapter.realNetworkStats.createCalls, 0);

      logPass('[P1-A] Hard Network Lock: create makes strictly 0 HTTP calls', 'Calls: 0');
    } catch (err) {
      logFail('[P1-A] Hard Network Lock: create makes strictly 0 HTTP calls', err);
    }

    // [P1-B] Auxiliary operations with remoteEnabled=false make 0 HTTP calls
    try {
      const lockedAdapter = new Stage2GenerationAdapter({
        remoteEnabled: false,
        baseUrl: STUB_BASE_URL,
        projectId: TEST_PROJECT_ID,
      });

      await lockedAdapter.getActiveJobForProject(TEST_PROJECT_ID);
      await lockedAdapter.getCandidate(TEST_PROJECT_ID, 'cand-1');
      await lockedAdapter.applyCandidate(TEST_PROJECT_ID, 'cand-1');
      await lockedAdapter.discardCandidate(TEST_PROJECT_ID, 'cand-1');

      assert.strictEqual(stubMetrics.totalCalls, 0, 'Zero HTTP calls must reach stub when locked');
      logPass('[P1-B] Auxiliary methods make strictly 0 HTTP calls when locked', 'Total Calls: 0');
    } catch (err) {
      logFail('[P1-B] Auxiliary methods make strictly 0 HTTP calls when locked', err);
    }

    // ─── PART 2: REAL HTTP CONTRACT EXECUTION AGAINST TEST STUB ──────────────
    console.log('\n--- Phase 2: Transport Endpoint Shape Execution Against Stub (§P5.11) ---');

    const testAdapter = new Stage2GenerationAdapter({
      remoteEnabled: true, // Enabled ONLY against local isolated test stub
      baseUrl: STUB_BASE_URL,
      projectId: TEST_PROJECT_ID,
      pollIntervalMs: 25,
      timeoutMs: 3000,
    });

    let activeJobId = null;

    // [P2-A] POST /api/projects/:id/spatial/start (Primary Create)
    try {
      const res = await testAdapter.createGenerationRequest({
        projectId: TEST_PROJECT_ID,
        manifest: cameraManifest,
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.status, 'QUEUED');
      assert.ok(res.jobId && res.jobId.startsWith('stub-job-'));
      assert.strictEqual(stubMetrics.startCalls, 1);
      activeJobId = res.jobId;

      logPass('[P2-A] POST start creates job on stub endpoint', `JobId: ${activeJobId}`);
    } catch (err) {
      logFail('[P2-A] POST start creates job on stub endpoint', err);
    }

    // [P2-B] Status Polling loop reaches SUCCEEDED and stops
    try {
      stubJobPollSequence = 0; // Reset progression
      const pollResult = await testAdapter.pollGenerationJob(activeJobId, {
        pollIntervalMs: 25,
        timeoutMs: 2000,
      });

      assert.strictEqual(pollResult.ok, true);
      assert.strictEqual(pollResult.status, 'SUCCEEDED');
      assert.strictEqual(pollResult.job.candidateId, 'stub-cand-001');
      assert.ok(stubMetrics.statusCalls >= 3, 'Status must have polled across stages');

      logPass('[P2-B] Polling progresses through stages to terminal SUCCEEDED', `Status: ${pollResult.status}`);
    } catch (err) {
      logFail('[P2-B] Polling progresses through stages to terminal SUCCEEDED', err);
    }

    // [P2-C] GET /api/projects/:id/spatial/job (Active Job Recovery)
    try {
      const recRes = await testAdapter.getActiveJobForProject(TEST_PROJECT_ID);
      assert.strictEqual(recRes.ok, true);
      assert.strictEqual(recRes.job.jobId, 'stub-active-recovered');
      assert.strictEqual(stubMetrics.activeJobCalls, 1);

      logPass('[P2-C] Active job recovery endpoint queried', `JobId: ${recRes.job.jobId}`);
    } catch (err) {
      logFail('[P2-C] Active job recovery endpoint queried', err);
    }

    // [P2-D] GET /api/projects/:id/spatial/candidate/:candidateId
    try {
      const candRes = await testAdapter.getCandidate(TEST_PROJECT_ID, 'stub-cand-001');
      assert.strictEqual(candRes.ok, true);
      assert.strictEqual(candRes.candidate.candidateId, 'stub-cand-001');
      assert.strictEqual(candRes.candidate.format, 'ply');
      assert.strictEqual(stubMetrics.candidateCalls, 1);

      logPass('[P2-D] Candidate status retrieved successfully', `Format: ${candRes.candidate.format}`);
    } catch (err) {
      logFail('[P2-D] Candidate status retrieved successfully', err);
    }

    // [P2-E] POST /api/projects/:id/spatial/apply
    try {
      const applyRes = await testAdapter.applyCandidate(TEST_PROJECT_ID, 'stub-cand-001');
      assert.strictEqual(applyRes.ok, true);
      assert.strictEqual(applyRes.result.activeSpatialVersion, 'stub-cand-001');
      assert.strictEqual(stubMetrics.applyCalls, 1);

      logPass('[P2-E] Candidate applied successfully', `Version: ${applyRes.result.activeSpatialVersion}`);
    } catch (err) {
      logFail('[P2-E] Candidate applied successfully', err);
    }

    // [P2-F] POST /api/projects/:id/spatial/discard
    try {
      const discardRes = await testAdapter.discardCandidate(TEST_PROJECT_ID, 'stub-cand-001');
      assert.strictEqual(discardRes.ok, true);
      assert.strictEqual(discardRes.result.discarded, 'stub-cand-001');
      assert.strictEqual(stubMetrics.discardCalls, 1);

      logPass('[P2-F] Candidate discarded successfully', `Discarded: ${discardRes.result.discarded}`);
    } catch (err) {
      logFail('[P2-F] Candidate discarded successfully', err);
    }

    // ─── PART 3: FAULT INJECTION TESTING (§P5.11) ────────────────────────────
    console.log('\n--- Phase 3: Fault Injection & Resilience Testing (§P5.11) ---');

    // [P3-A] Server 500 Fault Handling
    try {
      const errAdapter = new Stage2GenerationAdapter({
        remoteEnabled: true,
        baseUrl: `${STUB_BASE_URL}?test_err=500`,
        projectId: TEST_PROJECT_ID,
        maxRetries: 1,
      });

      const res500 = await errAdapter.createGenerationRequest(cameraManifest);
      assert.strictEqual(res500.ok, false);
      assert.strictEqual(res500.code, 'NETWORK_ERROR');

      logPass('[P3-A] 500 server error handled cleanly with retries exhausted');
    } catch (err) {
      logFail('[P3-A] 500 server error handled cleanly', err);
    }

    // [P3-B] Timeout Fault Handling
    try {
      const timeoutAdapter = new Stage2GenerationAdapter({
        remoteEnabled: true,
        baseUrl: `${STUB_BASE_URL}?test_delay=3000`,
        projectId: TEST_PROJECT_ID,
        timeoutMs: 150,
        maxRetries: 0,
      });

      const resTimeout = await timeoutAdapter.createGenerationRequest(cameraManifest);
      assert.strictEqual(resTimeout.ok, false);
      assert.strictEqual(resTimeout.code, 'TIMEOUT_ERROR');

      logPass('[P3-B] Request timeout handled with abort controller');
    } catch (err) {
      logFail('[P3-B] Request timeout handled', err);
    }

    // [P3-C] Malformed JSON Fault Handling
    try {
      const malformedAdapter = new Stage2GenerationAdapter({
        remoteEnabled: true,
        baseUrl: `${STUB_BASE_URL}?test_malformed=true`,
        projectId: TEST_PROJECT_ID,
        maxRetries: 0,
      });

      const resMalformed = await malformedAdapter.createGenerationRequest(cameraManifest);
      assert.strictEqual(resMalformed.ok, false);
      assert.strictEqual(resMalformed.code, 'NETWORK_ERROR');

      logPass('[P3-C] Malformed JSON handled gracefully without uncaught exceptions');
    } catch (err) {
      logFail('[P3-C] Malformed JSON handled gracefully', err);
    }

    // [P3-D] Client-Authoritative Polling Abort During Live Polling
    try {
      const abortAdapter = new Stage2GenerationAdapter({
        remoteEnabled: true,
        baseUrl: STUB_BASE_URL,
        projectId: TEST_PROJECT_ID,
        pollIntervalMs: 40,
      });

      stubJobs.set('job-live-poll', { jobId: 'job-live-poll', status: 'PROCESSING', isLongRunning: true });
      const pollPromise = abortAdapter.pollGenerationJob('job-live-poll', { pollIntervalMs: 40, timeoutMs: 5000 });

      // Cancel locally after 60ms
      await new Promise(r => setTimeout(r, 60));
      const cancelRes = await abortAdapter.cancelGeneration('job-live-poll');

      assert.strictEqual(cancelRes.status, 'CANCELED');
      assert.strictEqual(cancelRes.cancelScope, 'CLIENT_POLLING_ONLY');
      assert.strictEqual(cancelRes.remoteJobCanceled, false);

      const pollOutcome = await pollPromise;
      assert.strictEqual(pollOutcome.status, 'CANCELED');

      logPass('[P3-D] Live polling cleanly aborted on client without claiming server cancel');
    } catch (err) {
      logFail('[P3-D] Live polling cleanly aborted on client', err);
    }

  } finally {
    // Clean server shutdown
    await new Promise((resolve) => server.close(resolve));
    console.log('\n[Stub Server] TEST_ONLY_GENERATION_STUB terminated cleanly');
  }

  console.log('\n================================================================');
  console.log(`ISOLATED TRANSPORT TESTS COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
})();
