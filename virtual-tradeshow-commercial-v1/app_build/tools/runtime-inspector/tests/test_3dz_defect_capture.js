/**
 * Runtime Inspector — 3DZ Production Defect Diagnostic Capture
 * Module: tests/test_3dz_defect_capture.js
 *
 * Reproduces the CURRENT 3DZ production issues:
 * 1. BLACK SPATIAL VIEWER (Center viewport canvas is black, mesh offset by 90 deg)
 * 2. APPLY NOT CHANGING ACTIVE BACKGROUND (Apply clicked, DB not updated / UI stale)
 *
 * Exports real diagnostic bundle (diagnostic.json, summary.txt) with leak scanning.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { RuntimeInspectorCore } = require('../core/runtime-core');
const { ThreeDZAdapter } = require('../adapters/3dz/adapter');

console.log('============================================================');
console.log('RUNTIME INSPECTOR — SECTION 58: 3DZ DEFECT CAPTURE TEST');
console.log('============================================================');

// Set up mock window / DOM environment to simulate 3DZ production page
global.window = {
  location: {
    hostname: 'v-show-commercial-v1-production.up.railway.app',
    pathname: '/app/admin/booths',
    href: 'https://v-show-commercial-v1-production.up.railway.app/app/admin/booths',
    origin: 'https://v-show-commercial-v1-production.up.railway.app'
  },
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  localStorage: {
    getItem: () => null,
    length: 0
  },
  sessionStorage: {
    length: 0
  },
  performance: {
    now: () => Date.now(),
    memory: {
      usedJSHeapSize: 45 * 1024 * 1024,
      totalJSHeapSize: 80 * 1024 * 1024
    }
  },
  activeProjectData: {
    id: 'prj_3dz_p0_prod',
    name: '3DZ Spatial Booth Demo',
    status: 'ACTIVE',
    activeBoothId: 'booth_default_01',
    activeBackgroundVersionId: 'bg_v1_legacy_flat',
    spatialCandidates: [
      {
        id: 'spatial_cand_cylindrical_v2',
        status: 'READY',
        viewpoints: ['CENTER', 'LEFT_CENTER', 'RIGHT_CENTER'],
        cylindricalConfig: {
          radius: 6.85,
          arcSpan: 1.57,
          thetaStartOffsetDeg: -90
        }
      }
    ]
  },
  currentSpatialCandidate: {
    id: 'spatial_cand_cylindrical_v2',
    currentViewpoint: 'CENTER',
    meshAngleOffset: -1.5707963,
    cameraPosition: { x: 0, y: 0, z: 0.01 },
    cameraLookAt: { x: 0, y: 0, z: -1 }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.document = {
  title: '3DZ Virtual Tradeshow — Spatial Booth Editor',
  readyState: 'complete',
  querySelectorAll: (selector) => {
    if (selector === 'canvas') {
      return [{
        id: 'spatial-viewer-canvas',
        className: 'threejs-cylindrical-viewport',
        width: 1440,
        height: 800,
        getBoundingClientRect: () => ({ width: 1440, height: 800 }),
        getContext: (type) => {
          if (type === '2d') {
            return {
              getImageData: (x, y, w, h) => {
                const data = new Uint8ClampedArray(w * h * 4);
                for (let i = 0; i < data.length; i += 4) {
                  data[i] = 2;     // R
                  data[i + 1] = 6; // G
                  data[i + 2] = 23;// B (0x020617 dark background)
                  data[i + 3] = 255;
                }
                return { data };
              }
            };
          }
          return null;
        }
      }];
    }
    if (selector === '#spatial-preview-modal') {
      return [{ id: 'spatial-preview-modal', classList: { contains: () => true } }];
    }
    return [];
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36',
  platform: 'Win32',
  language: 'en-US'
};

// 1. Instantiate Runtime Inspector Core
const core = new RuntimeInspectorCore({ privacyMode: 'STANDARD' });

// 2. Register 3DZ Adapter
const adapter3dz = new ThreeDZAdapter();
core.registerAdapter(adapter3dz);

// 3. Initialize Core & Verify Adapter Match
core.init();
assert.strictEqual(core.activeAdapter?.id, '3dz', '3DZ Adapter must be matched on production URL');
console.log('Adapter matched:', core.activeAdapter.name);

// 4. Start Diagnostic Recording
core.startRecording();

// 5. Simulate Defect 1: Viewer Opened with Misaligned Mesh -> Black Viewport
const openCorrId = core.eventBus.createCorrelationId('VIEWPORT_OPEN');
core.eventBus.emit('INTERACTION', 'USER_CLICK', {
  tag: 'button',
  id: 'btn-open-spatial-preview',
  text: 'Preview Spatial View'
}, { correlationId: openCorrId });

core.eventBus.emit('APP', '3DZ_VIEWER_INIT', {
  viewerEngine: 'THREE_JS_CYLINDRICAL',
  currentViewpoint: 'CENTER',
  radius: 6.85,
  arcSpan: 1.57,
  meshOffset: -1.5707963,
  cameraFacing: '-Z',
  meshPosition: '+X'
}, { correlationId: openCorrId });

// Simulate Canvas Monitoring probe detecting black screen
const canvasProbes = core.canvasMonitor.probeAllCanvases();
console.log('Canvas Probe Result:', {
  canvasCount: canvasProbes.length,
  isUniformlyBlack: canvasProbes[0]?.pixelStats?.isUniformlyBackground,
  blackRatio: canvasProbes[0]?.pixelStats?.blackRatio
});
assert.strictEqual(canvasProbes[0]?.pixelStats?.isUniformlyBackground, true, 'Canvas must be diagnosed as uniformly black');

// User logs problem marker for Black Viewport
core.markProblem('BLACK SPATIAL VIEWER: Center viewport is black, uploaded photo not visible on screen');

// 6. Simulate Defect 2: Click "Apply to Active Booth" but Active Background remains unchanged
const applyCorrId = core.eventBus.createCorrelationId('APPLY_BACKGROUND');
core.eventBus.emit('INTERACTION', 'USER_CLICK', {
  tag: 'button',
  id: 'btn-apply-active-booth',
  text: 'Apply to Active Booth'
}, { correlationId: applyCorrId });

core.eventBus.emit('NETWORK', 'FETCH_START', {
  method: 'POST',
  url: 'https://v-show-commercial-v1-production.up.railway.app/api/projects/prj_3dz_p0_prod/spatial/apply',
  headers: {
    'content-type': 'application/json',
    'authorization': 'Bearer [REDACTED_SECRET]'
  },
  body: {
    candidateId: 'spatial_cand_cylindrical_v2',
    targetBoothId: 'booth_default_01'
  }
}, { correlationId: applyCorrId });

core.eventBus.emit('NETWORK', 'FETCH_COMPLETE', {
  method: 'POST',
  url: 'https://v-show-commercial-v1-production.up.railway.app/api/projects/prj_3dz_p0_prod/spatial/apply',
  status: 200,
  ok: true,
  durationMs: 340
}, { correlationId: applyCorrId });

// State check probe reveals activeBackgroundVersionId did NOT change
const stateCheck = core.activeAdapter.getRuntimeState();
console.log('3DZ State Check After Apply:', {
  activeBackgroundVersionId: stateCheck.project.activeBackgroundVersionId,
  candidateId: stateCheck.spatialCandidate?.candidateId,
  appliedSuccessfully: stateCheck.project.activeBackgroundVersionId === stateCheck.spatialCandidate?.candidateId
});
assert.strictEqual(stateCheck.project.activeBackgroundVersionId, 'bg_v1_legacy_flat', 'Active background must remain old background version');

// Mark second problem marker
core.markProblem('APPLY FAILURE: Active booth background remained bg_v1_legacy_flat instead of updating to spatial candidate');

// 7. Stop Recording & Export Diagnostic Bundle
core.stopRecording();

const exportDir = path.resolve(__dirname, '../diagnostic-3dz-defect');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

const bundle = core.exporter.exportBundle({
  outputDir: exportDir,
  zip: false,
  format: 'json'
});

console.log('Diagnostic Bundle Generated Successfully!');
console.log('First Failed Stage Detected:', bundle.diagnostic.diagnostics.firstFailedStage);
console.log('Primary Failure:', bundle.diagnostic.diagnostics.primaryFailure);
console.log('Redaction Count:', bundle.diagnostic.redaction.redactionCount);
console.log('Secret Scan Passed:', bundle.diagnostic.redaction.secretScanPassed);

assert.strictEqual(bundle.diagnostic.diagnostics.firstFailedStage, 'RENDER', 'Failure stage must be accurately detected as RENDER');
assert.strictEqual(bundle.diagnostic.redaction.secretScanPassed, true, 'Bundle must pass leak scan');

console.log('\n----------------------------------------');
console.log('GENERATED CHATGPT SUMMARY:');
console.log('----------------------------------------');
console.log(bundle.summaryText);
console.log('----------------------------------------');

console.log('SECTION 58 TEST COMPLETE: PASS\n');
