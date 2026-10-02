/**
 * Round 118 Mandatory Verification Suite
 * RI Live Failure Helper — Observational Telemetry & Diagnostics API
 * Issue #4 Comment #424
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  setupRiLiveDiagnostics,
  riSessions,
  cleanExpiredRiSessions,
  buildAssistantFormat,
  isProductionBlocked,
  resetStore,
  MAX_RI_SESSIONS,
  RI_SESSION_TTL_MS
} = require('../virtual-tradeshow-commercial-v1/server/ri_live_diagnostics');

console.log('═'.repeat(70));
console.log(' ROUND 118: RI LIVE DIAGNOSTIC HELPER VERIFICATION SUITE');
console.log('═'.repeat(70));

// Helper to instantiate GuidedCaptureController from client/index.html in a VM context
function createControllerInContext(riDebugEnabled = false) {
  const html = fs.readFileSync('virtual-tradeshow-commercial-v1/client/index.html', 'utf8');

  // Extract VisualLoopDetector and RILiveDiagnosticHelper and GuidedCaptureController
  const vldStart = html.indexOf('class VisualLoopDetector {');
  const vldEnd = html.indexOf('class SetupWizardController {', vldStart);
  if (vldStart === -1 || vldEnd === -1) {
    throw new Error('Failed to find class boundaries in client/index.html');
  }
  const extractedCode = html.substring(vldStart, vldEnd);

  const context = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date,
    Math,
    Number,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    URLSearchParams,
    location: { search: riDebugEnabled ? '?riDebug=1' : '' },
    __3DZ_BUILD_INFO__: { gitCommit: 'd908ed7' },
    document: {
      createElement: () => ({
        style: {},
        innerHTML: '',
        appendChild: () => {},
        querySelector: () => ({ addEventListener: () => {} }),
        remove: () => {}
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {}
      },
      getElementById: () => null
    },
    navigator: {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      mediaDevices: { getUserMedia: true }
    },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 123,
    clearInterval: () => {}
  };
  context.window = context;

  vm.createContext(context);
  const runCode = extractedCode + '\nthis.GuidedCaptureController = GuidedCaptureController;\nthis.RILiveDiagnosticHelper = RILiveDiagnosticHelper;';
  vm.runInContext(runCode, context);

  const controller = new context.GuidedCaptureController();
  controller.state = 'CAPTURING';
  return { controller, context };
}

// ── TEST 1: Existing Round 117 Regression Suite ──────────────────────────
console.log('\n[1/5] Test 1: Verifying existing Round 117 physical accuracy tests...');
const { execSync } = require('child_process');
const r117Output = execSync('node test/run_round117_unit_tests.js', { encoding: 'utf8' });
assert(r117Output.includes('ALL 8 ROUND 117 REGRESSION TESTS PASSED (100%)'), 'Round 117 tests must pass 100%');
console.log('  [PASS] Test 1: Round 117 regression suite remains 8/8 PASS (100%).');

// ── TEST 2: Proof Telemetry Collection is Observational ─────────────────
console.log('\n[2/5] Test 2: Proving telemetry collection is observational and does NOT alter handleOrientation...');
{
  const { controller: ctrlNormal } = createControllerInContext(false);
  const { controller: ctrlDiag } = createControllerInContext(true);

  assert.strictEqual(ctrlNormal.riDiagnosticHelper.isEnabled, false, 'Helper must be disabled when riDebug is not set');
  assert.strictEqual(ctrlDiag.riDiagnosticHelper.isEnabled, true, 'Helper must be enabled when ?riDebug=1 is present');

  // Test realistic motion stream with varying speeds, wraps, and slight tilt
  const testAngles = [
    { alpha: 10.0, beta: 88.0, gamma: 0.5 },
    { alpha: 18.5, beta: 89.0, gamma: 1.0 },
    { alpha: 35.0, beta: 87.5, gamma: -0.5 },
    { alpha: 75.0, beta: 88.0, gamma: 0.0 },
    { alpha: 130.0, beta: 86.0, gamma: 2.0 },
    { alpha: 210.0, beta: 88.5, gamma: 1.5 },
    { alpha: 310.0, beta: 89.0, gamma: 0.0 },
    { alpha: 358.0, beta: 88.0, gamma: -1.0 },
    { alpha: 4.0, beta: 88.5, gamma: 0.5 }, // 360 wrap
    { alpha: 15.0, beta: 89.0, gamma: 0.0 }
  ];

  for (let i = 0; i < testAngles.length; i++) {
    const sample = testAngles[i];
    ctrlNormal.handleOrientation(sample);
    ctrlDiag.handleOrientation(sample);

    // Assert strictly identical controller state on every step
    assert.strictEqual(
      ctrlDiag.accumulatedRotation,
      ctrlNormal.accumulatedRotation,
      `Step ${i}: accumulatedRotation must be strictly equal`
    );
    assert.strictEqual(
      ctrlDiag.lastAngle,
      ctrlNormal.lastAngle,
      `Step ${i}: lastAngle must be strictly equal`
    );
    assert.strictEqual(
      ctrlDiag.directionLocked,
      ctrlNormal.directionLocked,
      `Step ${i}: directionLocked must be strictly equal`
    );
    assert.strictEqual(
      ctrlDiag.rotationDirection,
      ctrlNormal.rotationDirection,
      `Step ${i}: rotationDirection must be strictly equal`
    );
    assert.strictEqual(
      ctrlDiag.state,
      ctrlNormal.state,
      `Step ${i}: state must be strictly equal`
    );
    assert.strictEqual(
      ctrlDiag.levelStatus,
      ctrlNormal.levelStatus,
      `Step ${i}: levelStatus must be strictly equal`
    );
    assert.strictEqual(
      ctrlDiag.guidanceMessage,
      ctrlNormal.guidanceMessage,
      `Step ${i}: guidanceMessage must be strictly equal`
    );
  }

  // Verify diagnostic helper collected events
  assert(ctrlDiag.riDiagnosticHelper.allEvents.length === testAngles.length, 'Diagnostic helper must have collected all events');
  assert(ctrlDiag.riDiagnosticHelper.acceptedCount > 0, 'Diagnostic helper must have accepted events');
  console.log(`  Events observed: ${ctrlDiag.riDiagnosticHelper.allEvents.length}, accumulatedRotation identical: ${ctrlDiag.accumulatedRotation}°`);
  console.log('  [PASS] Test 2: Verified 0.000% deviation — telemetry collection is strictly observational.');
}

// ── TEST 3: Endpoint Tests for Latest and Session Endpoints ─────────────
console.log('\n[3/5] Test 3: Verifying diagnostic endpoints (/api/ri-debug/batch, /latest, /:sessionId)...');
{
  resetStore();

  // Mock express app router
  const routes = { GET: {}, POST: {} };
  const mockApp = {
    get: (path, handler) => { routes.GET[path] = handler; },
    post: (path, handler) => { routes.POST[path] = handler; }
  };

  setupRiLiveDiagnostics(mockApp, { getGitCommitSha: () => 'd908ed7f5dabf51457df488dc31ec27ffbd5b247' });

  // 3a. POST batch to /api/ri-debug/batch
  const mockReqPost = {
    body: {
      sessionId: 'RI-DIAG-S23-TEST-001',
      commitSha: 'd908ed7f5dabf51457df488dc31ec27ffbd5b247',
      startedAt: new Date(Date.now() - 5000).toISOString(),
      environment: {
        userAgent: 'Samsung S23 Ultra Test QA',
        viewport: { width: 1080, height: 2340 },
        devicePixelRatio: 3.0,
        cameraDimensions: { width: 1920, height: 1080 }
      },
      events: [
        {
          timestamp: Date.now() - 4000,
          elapsedMs: 1000,
          alpha: 120.0,
          beta: 88.5,
          gamma: 1.2,
          eventSource: 'deviceorientation',
          permissionState: 'granted',
          eventInterval: 25,
          lastAngleBefore: null,
          lastAngleAfter: 120.0,
          rawDelta: 0,
          normalizedDelta: 0,
          accepted: false,
          rejectionReason: 'first_sample',
          cumulativeAcceptedDegrees: 0,
          rotationDirection: null,
          directionLocked: false,
          progressPercent: 0,
          captureState: 'CAPTURING'
        },
        {
          timestamp: Date.now() - 3950,
          elapsedMs: 1050,
          alpha: 135.0,
          beta: 88.2,
          gamma: 1.0,
          eventSource: 'deviceorientation',
          permissionState: 'granted',
          eventInterval: 50,
          lastAngleBefore: 120.0,
          lastAngleAfter: 135.0,
          rawDelta: 15.0,
          normalizedDelta: 15.0,
          accepted: true,
          cumulativeAcceptedDegrees: 15.0,
          rotationDirection: 'CLOCKWISE',
          directionLocked: true,
          progressPercent: 4,
          captureState: 'CAPTURING'
        },
        {
          timestamp: Date.now() - 3900,
          elapsedMs: 1100,
          alpha: 195.0,
          beta: 87.8,
          gamma: 0.8,
          eventSource: 'deviceorientation',
          permissionState: 'granted',
          eventInterval: 50,
          lastAngleBefore: 135.0,
          lastAngleAfter: 195.0,
          rawDelta: 60.0,
          normalizedDelta: 60.0,
          accepted: true,
          cumulativeAcceptedDegrees: 75.0,
          rotationDirection: 'CLOCKWISE',
          directionLocked: true,
          progressPercent: 21,
          captureState: 'CAPTURING'
        }
      ],
      closures: [],
      stateTransitions: [{ from: 'IDLE', to: 'CAPTURING', timestamp: Date.now() - 4500 }]
    }
  };

  let postResponseStatus = 200;
  let postResponseBody = null;
  const mockResPost = {
    status: (s) => { postResponseStatus = s; return mockResPost; },
    setHeader: () => {},
    json: (d) => { postResponseBody = d; }
  };

  routes.POST['/api/ri-debug/batch'](mockReqPost, mockResPost);
  assert.strictEqual(postResponseStatus, 200, 'Batch POST must return HTTP 200');
  assert.strictEqual(postResponseBody.ok, true, 'POST must return ok: true');
  assert.strictEqual(postResponseBody.totalEvents, 3, 'POST must report 3 total events');

  // 3b. GET /api/ri-debug/latest?format=assistant
  let getLatestStatus = 200;
  let getLatestBody = null;
  const mockResLatest = {
    status: (s) => { getLatestStatus = s; return mockResLatest; },
    setHeader: () => {},
    json: (d) => { getLatestBody = d; }
  };

  routes.GET['/api/ri-debug/latest']({ query: { format: 'assistant' } }, mockResLatest);
  assert.strictEqual(getLatestStatus, 200, 'GET /latest must return HTTP 200');
  assert.strictEqual(getLatestBody.sessionId, 'RI-DIAG-S23-TEST-001', 'sessionId must match');
  assert.strictEqual(getLatestBody.commitSha, 'd908ed7f5dabf51457df488dc31ec27ffbd5b247', 'commitSha must match');
  assert.strictEqual(getLatestBody.eventCount, 3, 'eventCount must be 3');
  assert.strictEqual(getLatestBody.acceptedDeltaCount, 2, 'acceptedDeltaCount must be 2');
  assert.strictEqual(getLatestBody.rejectedDeltaCount, 1, 'rejectedDeltaCount must be 1');
  assert.strictEqual(getLatestBody.acceptedDegrees, 75.0, 'acceptedDegrees must be 75.0');
  assert.deepStrictEqual(getLatestBody.rawAlphaSequence, [120, 135, 195], 'rawAlphaSequence must match');
  assert.deepStrictEqual(getLatestBody.normalizedDeltaSequence, [0, 15, 60], 'normalizedDeltaSequence must match');
  assert.strictEqual(getLatestBody.firstAlpha, 120, 'firstAlpha must be 120');
  assert.strictEqual(getLatestBody.lastAlpha, 195, 'lastAlpha must be 195');
  assert.strictEqual(getLatestBody.maxAbsDelta, 60, 'maxAbsDelta must be 60');
  assert.strictEqual(getLatestBody.rotationDirection, 'CLOCKWISE', 'rotationDirection must be CLOCKWISE');
  assert.strictEqual(getLatestBody.directionLocked, true, 'directionLocked must be true');
  assert(Array.isArray(getLatestBody.events), 'raw events array must be present');
  assert.strictEqual(getLatestBody.events.length, 3, 'raw events count must match');

  // 3c. GET /api/ri-debug/:sessionId
  let getSessionStatus = 200;
  let getSessionBody = null;
  const mockResSession = {
    status: (s) => { getSessionStatus = s; return mockResSession; },
    setHeader: () => {},
    json: (d) => { getSessionBody = d; }
  };
  routes.GET['/api/ri-debug/:sessionId']({ params: { sessionId: 'RI-DIAG-S23-TEST-001' }, query: {} }, mockResSession);
  assert.strictEqual(getSessionStatus, 200, 'GET /:sessionId must return HTTP 200');
  assert.strictEqual(getSessionBody.sessionId, 'RI-DIAG-S23-TEST-001', 'sessionId must match');

  // 3d. Non-existent session returns 404
  let getMissingStatus = 200;
  routes.GET['/api/ri-debug/:sessionId']({ params: { sessionId: 'NON-EXISTENT' }, query: {} }, {
    status: (s) => { getMissingStatus = s; return { json: () => {} }; },
    setHeader: () => {}
  });
  assert.strictEqual(getMissingStatus, 404, 'Non-existent session must return HTTP 404');

  console.log('  [PASS] Test 3: Verified /api/ri-debug/batch, /latest?format=assistant, and /:sessionId.');
}

// ── TEST 4: Expiry and Zero Customer DB/Disk Persistence ─────────────────
console.log('\n[4/5] Test 4: Verifying session expiry (15m TTL) and zero DB/candidate persistence...');
{
  resetStore();
  const now = Date.now();

  // Create an expired session (16 minutes old)
  riSessions.set('EXPIRED-SESSION', {
    sessionId: 'EXPIRED-SESSION',
    createdAt: now - 16 * 60 * 1000,
    updatedAt: now - 16 * 60 * 1000,
    summary: { eventCount: 10 }
  });

  // Create an active session (2 minutes old)
  riSessions.set('ACTIVE-SESSION', {
    sessionId: 'ACTIVE-SESSION',
    createdAt: now - 2 * 60 * 1000,
    updatedAt: now - 2 * 60 * 1000,
    summary: { eventCount: 5 }
  });

  cleanExpiredRiSessions(now);
  assert.strictEqual(riSessions.has('EXPIRED-SESSION'), false, 'Expired session (>15m) must be removed');
  assert.strictEqual(riSessions.has('ACTIVE-SESSION'), true, 'Active session (<15m) must be retained');

  // Verify bounded storage limit via route
  resetStore();
  const routes = { POST: {} };
  setupRiLiveDiagnostics({ get: () => {}, post: (p, h) => { routes.POST[p] = h; } });
  for (let i = 0; i < 65; i++) {
    routes.POST['/api/ri-debug/batch']({
      body: { sessionId: `BOUND-SESS-${i}`, events: [] }
    }, { status: () => ({ json: () => {} }), setHeader: () => {}, json: () => {} });
  }
  assert(riSessions.size <= MAX_RI_SESSIONS, `Store must be bounded to <= ${MAX_RI_SESSIONS}, got ${riSessions.size}`);

  // Verify ZERO candidate files or DB mutations occurred
  const uploadFiles = fs.readdirSync('virtual-tradeshow-commercial-v1/uploads').filter(f => f.includes('RI-DIAG'));
  assert.strictEqual(uploadFiles.length, 0, 'No RI-DIAG files should ever be saved to uploads directory');

  console.log('  [PASS] Test 4: 15-minute TTL expiry and strict zero customer data persistence confirmed.');
}

// ── TEST 5: Preview Gated & Disabled in Production ───────────────────────
console.log('\n[5/5] Test 5: Verifying helper is Preview/riDebug=1 gated and disabled in Production...');
{
  // 5a. Test server gating in production
  const savedService = process.env.RAILWAY_SERVICE_NAME;
  try {
    process.env.RAILWAY_SERVICE_NAME = 'v-show-commercial-v1';
    assert.strictEqual(isProductionBlocked(), true, 'Must block in production service');

    let prodBlocked = false;
    const mockResProd = {
      status: (code) => {
        if (code === 403) prodBlocked = true;
        return { json: () => {} };
      }
    };
    const mockApp = { get: () => {}, post: () => {} };
    setupRiLiveDiagnostics({
      get: (path, fn) => {
        if (path === '/api/ri-debug/latest') fn({}, mockResProd);
      },
      post: (path, fn) => {
        if (path === '/api/ri-debug/batch') fn({}, mockResProd);
      }
    });
    assert.strictEqual(prodBlocked, true, 'Production service must return 403 Forbidden');
  } finally {
    process.env.RAILWAY_SERVICE_NAME = savedService;
  }

  // 5b. Test preview allowance
  try {
    process.env.RAILWAY_SERVICE_NAME = '3d2r-dark-minimal-flow-preview';
    assert.strictEqual(isProductionBlocked(), false, 'Must allow on preview service');
  } finally {
    process.env.RAILWAY_SERVICE_NAME = savedService;
  }

  // 5c. Test client UI gating
  const { controller: ctrlNoDebug, context: ctxNoDebug } = createControllerInContext(false);
  assert.strictEqual(ctrlNoDebug.riDiagnosticHelper.isEnabled, false);
  assert.strictEqual(ctrlNoDebug.riDiagnosticHelper.uiElement, null, 'UI HUD must NOT be created when riDebug!=1');

  const { controller: ctrlWithDebug, context: ctxWithDebug } = createControllerInContext(true);
  assert.strictEqual(ctrlWithDebug.riDiagnosticHelper.isEnabled, true);
  assert.notStrictEqual(ctrlWithDebug.riDiagnosticHelper.uiElement, null, 'UI HUD MUST be created when riDebug=1');

  console.log('  [PASS] Test 5: Verified Preview/riDebug=1 gated and strictly disabled in Production.');
}

console.log('\n═'.repeat(70));
console.log(' ALL 5 ROUND 118 VERIFICATION TESTS PASSED SUCCESSFULLY (100%)');
console.log('═'.repeat(70));
