/**
 * Runtime Inspector — Mobile Adapter Test Suite
 * Module: tools/runtime-inspector/tests/test_mobile_adapter.js
 */

const assert = require('assert');
const { MobileRollingBuffer } = require('../adapters/mobile/mobile-buffer');
const { MobileAdapter } = require('../adapters/mobile/mobile-adapter');
const { RedactionEngine } = require('../core/redaction');

console.log('Running Mobile Runtime Inspector Test Suite...');

// TEST 1: MobileRollingBuffer window, capacity, pruning, checkpoints
console.log('Test 1: MobileRollingBuffer Rolling Window and Capacity...');
const buffer = new MobileRollingBuffer({ maxAgeMs: 60000, maxItems: 50 });

for (let i = 0; i < 60; i++) {
  buffer.addEvent('CONSOLE', 'LOG', { msg: 'Event ' + i });
}

const snapshot = buffer.freezeSnapshot();
assert(snapshot.events.length <= 50, 'Buffer events should be capped at maxItems');
assert(snapshot.events[snapshot.events.length - 1].payload.msg === 'Event 59', 'Newest events should be preserved');

// Checkpoint testing
buffer.addCheckpoint('TEST_AUTO_CHECKPOINT', { reason: 'Camera probe test' });
const snap2 = buffer.freezeSnapshot();
assert.strictEqual(snap2.checkpoints.length, 1, 'Should have 1 checkpoint');
assert.strictEqual(snap2.checkpoints[0].checkpointType, 'TEST_AUTO_CHECKPOINT');
console.log('  PASS: MobileRollingBuffer');

// TEST 2: Secret Redaction on Mobile Buffer & Network
console.log('Test 2: Secret Redaction on Mobile Logs and Events...');
const redactor = new RedactionEngine({ privacyMode: 'STANDARD' });

const rawNetworkEvent = {
  url: 'https://v-show.up.railway.app/api/session?token=tok-cap-99999999-secret&key=12345',
  headers: {
    authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.sig'
  },
  body: JSON.stringify({ password: 'supersecretpassword123', email: 'test@example.com' })
};

const sanitizedEvent = redactor.sanitizeObject(rawNetworkEvent);
assert(!JSON.stringify(sanitizedEvent).includes('tok-cap-99999999-secret'), 'Token query param must be scrubbed');
assert(!JSON.stringify(sanitizedEvent).includes('secretpayload'), 'JWT Bearer token must be scrubbed');
assert(!JSON.stringify(sanitizedEvent).includes('supersecretpassword123'), 'Sensitive password in object must be scrubbed');
console.log('  PASS: Secret Redaction on Mobile');

// TEST 3: MobileAdapter Headless Probe & Summary Generation
console.log('Test 3: MobileAdapter Headless Probe and Summary...');
const mockWindow = {
  isSecureContext: true,
  navigator: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    mediaDevices: {
      enumerateDevices: async () => [
        { kind: 'videoinput', label: 'Camera 0, Facing back', deviceId: 'back-cam-1' },
        { kind: 'audioinput', label: 'Microphone', deviceId: 'mic-1' }
      ]
    }
  },
  screen: { width: 384, height: 824 },
  innerWidth: 384,
  innerHeight: 824,
  devicePixelRatio: 3,
  location: { href: 'https://v-show.up.railway.app/index.html?projectId=prj-free-b0c6f3ea&step=9&qa=1' },
  performance: {
    memory: { usedJSHeapSize: 45000000, totalJSHeapSize: 60000000, jsHeapSizeLimit: 200000000 }
  },
  addEventListener: () => {}
};

global.window = mockWindow;
global.navigator = mockWindow.navigator;
global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  documentElement: {
    dataset: {},
    classList: { contains: () => false }
  },
  body: {
    querySelectorAll: () => [],
    innerText: ''
  }
};

const adapter = new MobileAdapter({ debug: false });
adapter.attachSensors();

(async () => {
  const cameraDiag = adapter.getCameraDiagnostics();
  assert.strictEqual(cameraDiag.hasMediaDevices, true, 'hasMediaDevices should be true');
  assert.strictEqual(cameraDiag.isSecureContext, true, 'isSecureContext should be true');

  const sensorDiag = adapter.getSensorDiagnostics();
  assert(sensorDiag !== null, 'Sensors probe should return diagnostic object');

  const domHealth = adapter.getDomHealthDiagnostics();
  assert(domHealth.rawCssLeaksDetected !== undefined, 'DOM health should be calculated');

  adapter.buffer.addEvent('WIZARD', 'STEP_CHANGE', { fromStep: 1, toStep: 2 });
  adapter.buffer.addEvent('MAP', 'MAP_DRAG_START', { x: 10, y: 20 });
  adapter.buffer.addEvent('MAP', 'MAP_DRAG_END', { x: 50, y: 80 });

  const summary = adapter.summarize();
  assert(summary.sessionId.startsWith('RI-M-'), 'Session ID should start with RI-M-');
  assert.strictEqual(summary.platform, 'Android Chrome', 'Platform should be detected as Android Chrome');
  assert.strictEqual(summary.environment, 'INTERNAL_DEV', 'Environment should be INTERNAL_DEV');
  assert.strictEqual(summary.isTest, true, 'isTest flag should be true');

  const runtimeState = adapter.getRuntimeState();
  assert(runtimeState.rollingBufferSnapshot.eventCount > 0, 'Recent events should be populated');

  console.log('  PASS: MobileAdapter Headless Probe and Summary');
  console.log('ALL MOBILE RUNTIME INSPECTOR TESTS PASSED (3/3)!');
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
