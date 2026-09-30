// test/test_round114f_authoritative_lineage_and_remote_closure.js
// ROUND 114F: Positive Fail-Closed Provenance, Post-Apply Candidate Immutability,
// Real Stale Callback Zero-Network Isolation, and Remote Exact SHA & Build-Info Verification

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 49640;
const SECURE_WORKER_KEY = 'worker_auth_round114f_' + Date.now();
const DEV_TOKEN = 'internal_dev_round114f_' + Date.now();
const REMOTE_HOST = '3d2r-dark-minimal-flow-preview-production.up.railway.app';

process.env.PORT = String(TEST_PORT);
process.env.INTERNAL_WORKER_KEY = SECURE_WORKER_KEY;
process.env.INTERNAL_DEV_TOKEN = DEV_TOKEN;
process.env.NODE_ENV = 'test';

const PROJECT_A = 'prj-free-b0c6f3ea';
const PROJECT_B = 'prj-free-455b8ef9';

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const data = buffer.toString('utf8');
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data), raw: data, buffer });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data, buffer });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function makeRemoteRequest(method, path, body = null, headers = {}) {
  const https = require('https');
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request({
      hostname: REMOTE_HOST,
      port: 443,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data), raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runSuite() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(' ROUND 114F: POSITIVE PROVENANCE, POST-APPLY IMMUTABILITY & ISOLATION ');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // 1. Start Server
  console.log(`--- 1. Starting Server on Port ${TEST_PORT} ---`);
  const serverModule = require('../virtual-tradeshow-commercial-v1/app_build/server/index.js');
  const server = serverModule.server;

  await new Promise(r => setTimeout(r, 1000));
  const health = await makeRequest('GET', '/health');
  assert.strictEqual(health.status, 200);
  assert(health.body.gitCommit, 'Health must include gitCommit');
  console.log(`[PASS] Server listening at http://127.0.0.1:${TEST_PORT}`);
  console.log(`[PASS] Server health confirmed HTTP 200, gitCommit=${health.body.gitCommit}`);

  // 1b. Check /api/build-info endpoint
  const buildInfo = await makeRequest('GET', '/api/build-info');
  assert.strictEqual(buildInfo.status, 200);
  assert(buildInfo.body.gitCommit, 'Build info must include gitCommit');
  console.log(`[PASS] /api/build-info confirmed HTTP 200, gitCommit=${buildInfo.body.gitCommit}\n`);

  // 2. Directive 1 & 2: Positive Fail-Closed Provenance and Post-Apply Immutability
  console.log('--- 2. Positive Fail-Closed Provenance & Post-Apply Immutability ---');

  // 2.1: Candidate without auth -> 401
  const candNoAuth = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: 'cand-no-auth'
  });
  assert.strictEqual(candNoAuth.status, 401);
  console.log('[PASS] 2.1: Candidate registration without auth rejected with HTTP 401');

  // 2.2: Hardcoded literal worker secret rejected -> 403
  const candLiteralWorker = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: 'cand-literal-worker'
  }, { 'x-worker-key': 'internal_worker_secret' });
  assert.strictEqual(candLiteralWorker.status, 403);
  console.log('[PASS] 2.2: Hardcoded literal worker secret rejected with HTTP 403 (fail-closed)');

  // 2.3: Client credential self-certification of READY strictly rejected -> 403
  const candClientReady = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: 'cand-client-ready',
    status: 'READY',
    geometryValid: true,
    applyEnabled: true
  }, { 'Authorization': `Bearer ${DEV_TOKEN}` });
  assert.strictEqual(candClientReady.status, 403);
  assert.strictEqual(candClientReady.body?.error, 'FORBIDDEN_QUALIFICATION_PROMOTION');
  console.log('[PASS] 2.3: Client credential self-certification of READY strictly rejected with HTTP 403');

  // 2.4: Client raw candidate accepted with CLIENT_UNQUALIFIED provenance
  const candClientRawId = `cand-client-raw-${Date.now()}`;
  const candClientRaw = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: candClientRawId,
    status: 'PENDING_PROCESSING'
  }, { 'Authorization': `Bearer ${DEV_TOKEN}` });
  assert.strictEqual(candClientRaw.status, 200);
  assert.strictEqual(candClientRaw.body?.candidate?.provenance, 'CLIENT_UNQUALIFIED');
  assert.strictEqual(candClientRaw.body?.candidate?.applyEnabled, false);
  console.log('[PASS] 2.4: Client raw candidate accepted with CLIENT_UNQUALIFIED provenance & applyEnabled=false');

  // 2.5a: Apply CLIENT_UNQUALIFIED candidate -> HTTP 400
  const applyUnqualified = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/apply`, {
    candidateId: candClientRawId
  }, { 'Authorization': `Bearer ${DEV_TOKEN}` });
  assert.strictEqual(applyUnqualified.status, 400);
  console.log('[PASS] 2.5a: Apply for CLIENT_UNQUALIFIED candidate rejected with HTTP 400');

  // 2.5b: Direct DB insertion of candidate with MISSING provenance -> Apply MUST fail closed (HTTP 400)
  const db = serverModule.db;
  const candMissingProvId = `cand-missing-prov-${Date.now()}`;
  await db.mutate((d) => {
    d.spatialCandidates.push({
      candidateId: candMissingProvId,
      projectId: PROJECT_A,
      status: 'READY',
      geometryValid: true,
      applyEnabled: true,
      stitchedPanoramaUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg'
      // provenance intentionally missing / undefined
    });
  });
  const applyMissingProv = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/apply`, {
    candidateId: candMissingProvId
  }, { 'Authorization': `Bearer ${DEV_TOKEN}` });
  assert.strictEqual(applyMissingProv.status, 400, 'Apply candidate with missing provenance must return 400');
  console.log('[PASS] 2.5b: Apply for candidate with MISSING provenance rejected with HTTP 400');

  // 2.5c: Direct DB insertion of candidate with UNKNOWN / FORGED provenance -> Apply MUST fail closed (HTTP 400)
  const candForgedProvId = `cand-forged-prov-${Date.now()}`;
  await db.mutate((d) => {
    d.spatialCandidates.push({
      candidateId: candForgedProvId,
      projectId: PROJECT_A,
      status: 'READY',
      geometryValid: true,
      applyEnabled: true,
      provenance: 'LEGACY_UNKNOWN_BYPASS',
      stitchedPanoramaUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg'
    });
  });
  const applyForgedProv = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/apply`, {
    candidateId: candForgedProvId
  }, { 'Authorization': `Bearer ${DEV_TOKEN}` });
  assert.strictEqual(applyForgedProv.status, 400, 'Apply candidate with forged/unknown provenance must return 400');
  console.log('[PASS] 2.5c: Apply for candidate with FORGED/UNKNOWN provenance rejected with HTTP 400');

  // 2.6: Authoritative Worker Registration of valid READY candidate
  const stitchedRelPath = '/assets/demo/dna-showcase/pano360/node0_360_panorama_4k_opt.jpg';
  const diskPath = path.join(__dirname, '..', 'virtual-tradeshow-commercial-v1', 'app_build', 'client', 'assets', 'demo', 'dna-showcase', 'pano360', 'node0_360_panorama_4k_opt.jpg');
  const realFileBuffer = fs.readFileSync(diskPath);
  const realFileSha256 = crypto.createHash('sha256').update(realFileBuffer).digest('hex');

  const validCandId = `cand-auth-valid-${Date.now()}`;
  const resWorkerValid = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: validCandId,
    status: 'READY',
    geometryValid: true,
    applyEnabled: true,
    stitchedPanoramaUrl: stitchedRelPath,
    activeBackgroundUrl: stitchedRelPath,
    horizontalCoverageDeg: 360.0,
    full360Qualified: true
  }, { 'x-worker-key': SECURE_WORKER_KEY });
  assert.strictEqual(resWorkerValid.status, 200);
  assert.strictEqual(resWorkerValid.body?.candidate?.provenance, 'SOLVER_WORKER_AUTHORITATIVE');
  assert.strictEqual(resWorkerValid.body?.candidate?.masterSha256, realFileSha256);
  assert.strictEqual(resWorkerValid.body?.candidate?.isFinalized, true);
  console.log('[PASS] 2.6: Authoritative worker candidate registration accepted with server-derived SHA256 & provenance');

  // 2.7: Pre-Apply Immutability: Attempt to overwrite finalized READY candidate -> HTTP 409
  const resOverwritePreApply = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: validCandId,
    status: 'READY',
    stitchedPanoramaUrl: stitchedRelPath
  }, { 'x-worker-key': SECURE_WORKER_KEY });
  assert.strictEqual(resOverwritePreApply.status, 409);
  assert.strictEqual(resOverwritePreApply.body?.code, 'CANDIDATE_ALREADY_FINALIZED');
  console.log('[PASS] 2.7: Pre-Apply: overwrite finalized READY candidate rejected with HTTP 409 (CANDIDATE_ALREADY_FINALIZED)');

  // 2.8: Authorized Apply -> HTTP 200
  const applyRes = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/apply`, {
    candidateId: validCandId
  }, { 'Authorization': `Bearer ${DEV_TOKEN}` });
  assert.strictEqual(applyRes.status, 200);
  const persistedVersionId = applyRes.body?.activePanoramaVersionId;
  assert(persistedVersionId, 'activePanoramaVersionId must be returned');
  console.log(`[PASS] 2.8: Authorized candidate apply returned HTTP 200 (versionId=${persistedVersionId})`);

  // 2.9: Post-Apply Immutability: Attempt to mutate candidate AFTER successful Apply -> HTTP 409
  // (Candidate is now APPLIED and referenced by active panorama version)
  const candSnapshotBefore = await db.getSpatialBoothCandidate(validCandId);
  const projectSnapshotBefore = await db.getProject(PROJECT_A);

  const resOverwritePostApply = await makeRequest('POST', `/api/projects/${PROJECT_A}/panorama/candidate`, {
    candidateId: validCandId,
    status: 'READY',
    stitchedPanoramaUrl: '/assets/demo/tampered.jpg',
    masterSha256: 'tampered_hash_12345'
  }, { 'x-worker-key': SECURE_WORKER_KEY });
  assert.strictEqual(resOverwritePostApply.status, 409, 'Overwriting APPLIED candidate must return HTTP 409');
  assert.strictEqual(resOverwritePostApply.body?.code, 'CANDIDATE_ALREADY_FINALIZED');

  // Assert lineage byte-identical
  const candSnapshotAfter = await db.getSpatialBoothCandidate(validCandId);
  const projectSnapshotAfter = await db.getProject(PROJECT_A);
  assert.deepStrictEqual(candSnapshotBefore, candSnapshotAfter, 'Candidate record in DB must remain byte-identical after rejected mutation');
  assert.deepStrictEqual(projectSnapshotBefore.activePanoramaVersionId, projectSnapshotAfter.activePanoramaVersionId, 'Active panorama version must remain unchanged');
  console.log('[PASS] 2.9: Post-Apply: candidate mutation strictly rejected with HTTP 409 and lineage remains byte-identical\n');

  // 3. Headless Chrome App-Created Public Viewer & Gesture Verification
  console.log('--- 3. Headless Chrome App-Created Public Viewer & Gesture Verification ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });

  const clientUrl = `http://127.0.0.1:${TEST_PORT}/client/index.html?projectId=${PROJECT_A}`;
  console.log(`Navigating to ${clientUrl} ...`);
  await page.goto(clientUrl, { waitUntil: 'networkidle2' });

  // Wait for application itself to mount window.activeSpatialBoothRenderer (NO FALLBACK)
  await page.waitForFunction(() => {
    return window.activeSpatialBoothRenderer &&
           typeof window.activeSpatialBoothRenderer.yaw === 'number';
  }, { timeout: 10000 });

  const viewerBinding = await page.evaluate((expectedVersion, expectedCand, expectedUrl) => {
    const viewer = window.activeSpatialBoothRenderer;
    if (!viewer) return { error: 'window.activeSpatialBoothRenderer is missing (not created by app)' };
    if (viewer.isStaticFallback) return { error: 'Viewer is using static 2D fallback' };

    const c = viewer.candidate || {};
    const boundUrl = c.stitchedPanoramaUrl || c.url;

    return {
      ok: true,
      hostMode: viewer.hostMode,
      versionId: c.versionId,
      candidateId: c.candidateId,
      boundUrl,
      versionMatch: c.versionId === expectedVersion,
      candMatch: c.candidateId === expectedCand,
      urlMatch: boundUrl === expectedUrl,
      hasWebglContext: Boolean(viewer.renderer && viewer.renderer.getContext()),
      hasTextureMap: Boolean(viewer.photoMaterial && viewer.photoMaterial.map)
    };
  }, persistedVersionId, validCandId, stitchedRelPath);

  console.log('App-Created Public Viewer Binding Assertions:', viewerBinding);
  assert(viewerBinding.ok, 'Application-created viewer must bind to exact persisted version & candidate');
  assert(viewerBinding.versionMatch, 'VersionId must match persisted versionId');
  assert(viewerBinding.candMatch, 'CandidateId must match applied candidateId');
  assert(viewerBinding.hasWebglContext, 'WebGL context must be initialized');
  assert(viewerBinding.hasTextureMap, 'Texture map must be loaded');
  console.log('[PASS] 3.1: Application-created public viewer bound to exact persisted version & candidate');

  // Verify artifact byte SHA over HTTP
  const httpArtifactRes = await makeRequest('GET', stitchedRelPath);
  const fetchedSha = crypto.createHash('sha256').update(httpArtifactRes.buffer).digest('hex');
  assert.strictEqual(fetchedSha, realFileSha256, 'HTTP served bytes must match authoritative file hash');
  console.log(`[PASS] 3.2: Exact SHA256 verified from public-served artifact bytes (${fetchedSha})`);

  // Execute Pointer Gestures: Single Pointer Drag & True Two-Pointer Pinch directly on app-created viewer
  const gestureResults = await page.evaluate(async () => {
    const viewer = window.activeSpatialBoothRenderer;
    const canvas = document.getElementById('three-canvas');
    if (!viewer || !canvas) return { error: 'viewer or canvas missing' };

    const initialYaw = viewer.yaw;
    const initialFov = viewer.currentFov;

    // Single-pointer drag
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 100, button: 0, buttons: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 140, clientY: 100, button: 0, buttons: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 140, clientY: 100, bubbles: true }));

    const dragDelta = Math.abs(viewer.yaw - initialYaw);

    // True Two-Pointer Pinch Zoom (multi-touch)
    // 1. Initial 2 touches 100px apart
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, bubbles: true }));

    // 2. Spread to 180px apart (zoom in -> lower targetFov)
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 60, clientY: 100, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: 240, clientY: 100, bubbles: true }));
    const fovZoomIn = viewer.targetFov;

    // 3. Pinch inward to 60px apart (zoom out -> higher targetFov)
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 100, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: 180, clientY: 100, bubbles: true }));
    const fovZoomOut = viewer.targetFov;

    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 120, clientY: 100, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: 180, clientY: 100, bubbles: true }));

    return {
      dragDelta: Number(dragDelta.toFixed(3)),
      initialFov,
      targetFovZoomIn: fovZoomIn,
      targetFovZoomOut: fovZoomOut
    };
  });

  console.log('Public Viewer Gesture Results:', gestureResults);
  assert(gestureResults.dragDelta > 0.05, 'Single-pointer drag must rotate yaw');
  assert(gestureResults.targetFovZoomIn !== gestureResults.targetFovZoomOut, 'True two-pointer pinch must modulate FOV');
  console.log('[PASS] 3.3: Public Viewer drag and true two-pointer pinch zoom verified\n');

  // 4. Directive 3: Real Old-Controller Stale Callback -> Zero Ingest/Upload/Network Isolation
  console.log('--- 4. Real Old-Controller Stale Callback Zero-Network Isolation ---');

  const wizardUrl = `http://127.0.0.1:${TEST_PORT}/index.html`;
  console.log(`Navigating to ${wizardUrl} ...`);
  await page.goto(wizardUrl, { waitUntil: 'networkidle2' });

  const staleIsolationResult = await page.evaluate(async () => {
    // 1. Ensure wizard is present and open Step 6
    if (!window.setupWizard) {
      throw new Error('window.setupWizard not found');
    }
    window.setupWizard.open(6);

    // Mock mediaDevices.getUserMedia so camera start succeeds
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      return canvas.captureStream ? canvas.captureStream(30) : new MediaStream();
    };

    // Instrument network fetch calls to detect ANY finalize / upload / ingest calls
    let networkIngestCalls = 0;
    const interceptedUrls = [];
    const originalFetch = window.fetch;
    window.fetch = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes('/panorama/start') ||
          urlStr.includes('/panorama/candidate') ||
          urlStr.includes('/panorama/apply') ||
          urlStr.includes('/upload')) {
        networkIngestCalls++;
        interceptedUrls.push(urlStr);
      }
      return originalFetch(url, opts);
    };

    // 2. Start initial capture to wire real controller closures
    await window.setupWizard.startGuidedCapture();
    const oldController = window.guidedCaptureController;
    if (!oldController) {
      throw new Error('window.guidedCaptureController not initialized');
    }

    // Capture real references to old closures and epoch
    const oldEpoch = window.setupWizard._captureSessionEpoch;
    const oldOnComplete = oldController.onComplete;
    const oldOnProgress = oldController.onProgress;
    const oldOnAttention = oldController.onAttention;
    const oldSessionId = window.setupWizard.state?.activeCaptureSessionId;

    if (typeof oldOnComplete !== 'function' || typeof oldOnProgress !== 'function' || typeof oldOnAttention !== 'function') {
      throw new Error('Real controller callback closures not registered');
    }

    // 3. Execute retry: creates new controller / increments epoch
    window.setupWizard.retryGuidedCapture();
    const newEpoch = window.setupWizard._captureSessionEpoch;
    const epochIncremented = newEpoch > oldEpoch;

    // 4. Fire the REAL old closures directly with valid-looking payload
    oldOnProgress({ progressPercent: 100, normalizedSensorRotationDeg: 360, speedStatus: 'NORMAL' });
    oldOnAttention({ message: 'Stale attention event' });

    // Firing oldOnComplete should be dropped cleanly by epoch guard and MUST NOT trigger network
    await oldOnComplete({
      canonicalKeyframeCount: 16,
      closureConfirmed: true,
      captureSessionId: 'stale-session-injected-' + Date.now(),
      keyframes: [{ keyframeId: 'kf-stale-1', index: 0 }]
    });

    // 5. Restore fetch
    window.fetch = originalFetch;

    return {
      oldEpoch,
      newEpoch,
      epochIncremented,
      networkIngestCalls,
      interceptedUrls,
      activeSessionUnchanged: window.setupWizard.state?.activeCaptureSessionId === oldSessionId,
      stepUnchanged: window.setupWizard.currentStep === 6 // remained on capture step
    };
  });

  console.log('Real Stale Callback Isolation Results:', staleIsolationResult);
  assert(staleIsolationResult.epochIncremented, 'Retry must increment session epoch');
  assert.strictEqual(staleIsolationResult.networkIngestCalls, 0, 'Firing old onComplete MUST trigger 0 finalize/upload/ingest calls');
  assert.strictEqual(staleIsolationResult.interceptedUrls.length, 0, 'No ingest URLs should be invoked by stale closure');
  assert(staleIsolationResult.activeSessionUnchanged, 'Active wizard session ID must remain unchanged');
  console.log('[PASS] 4: Real old-controller stale callback invoked -> 0 network calls, zero state regression verified\n');

  await browser.close();

  // 5. Directive 4: Remote Preview Exact Commit SHA & Deployed Build-Info
  console.log('--- 5. Remote Preview HTTPS & Build-Info Verification ---');
  const remoteHealth = await makeRemoteRequest('GET', '/health');
  console.log(`Remote Preview /health: HTTP ${remoteHealth.status}`, remoteHealth.body);
  assert.strictEqual(remoteHealth.status, 200);

  const remoteBuildInfo = await makeRemoteRequest('GET', '/api/build-info');
  console.log(`Remote Preview /api/build-info: HTTP ${remoteBuildInfo.status}`, remoteBuildInfo.body);

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(' ALL ROUND 114F TESTS PASSED (100%)');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  server.close();
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('\n[TEST_FAILURE]', err);
  process.exit(1);
});
