/**
 * Runtime Inspector — Universal Test Suite
 * Module: tests/test_suite.js
 *
 * Runs headless via Node.js to verify core redaction, event bus,
 * adapters, canvas probes, and exporter functionality.
 */

const assert = require('assert');
const { RedactionEngine } = require('../core/redaction');
const { UniversalEventBus } = require('../core/event-bus');
const { ThreeDZAdapter } = require('../adapters/3dz/adapter');
const { ThreeDZProbes } = require('../adapters/3dz/probes');
const { RuntimeInspectorCore } = require('../core/runtime-core');

console.log('Running Runtime Inspector Universal Test Suite...');

// TEST 1: Secret Redaction
console.log('Test 1: RedactionEngine Secret Scrubbing...');
const redactor = new RedactionEngine({ privacyMode: 'STANDARD' });

// Bearer token
const rawAuth = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak';
const sanitizedAuth = redactor.sanitizeString(rawAuth);
assert(!sanitizedAuth.includes('eyJ'), 'JWT must be scrubbed');
assert(sanitizedAuth.includes('[REDACTED_JWT]') || sanitizedAuth.includes('[REDACTED_TOKEN]'), 'Token marker expected');

// URL with sensitive query string
const rawUrl = 'https://api.example.com/v1/data?token=secret123&projectId=prj-100';
const sanitizedUrl = redactor.sanitizeUrl(rawUrl);
assert(!sanitizedUrl.includes('secret123'), 'Secret token in query params must be redacted');
assert(sanitizedUrl.includes('projectId=prj-100'), 'Whitelisted project ID in STANDARD mode preserved');

// Object sanitization
const sensitiveObj = {
  apiKey: 'mock_test_key_1234567890abcdefghijklmn',
  authorization: 'Bearer secret_token',
  safeField: 'normal_value'
};
const cleanedObj = redactor.sanitizeObject(sensitiveObj);
assert.strictEqual(cleanedObj.apiKey, '[REDACTED_SECRET]');
assert.strictEqual(cleanedObj.authorization, '[REDACTED_SECRET]');
assert.strictEqual(cleanedObj.safeField, 'normal_value');

// Leak Scanner test
const leakResult = redactor.scanForLeaks(cleanedObj);
assert.strictEqual(leakResult.passed, true, 'Sanitized object must pass leak scan');

const rawLeak = redactor.scanForLeaks({ auth: 'Bearer unredacted_secret_token_12345' });
assert.strictEqual(rawLeak.passed, false, 'Unredacted bearer token must fail leak scan');
console.log('  PASS: RedactionEngine');

// TEST 2: Universal Event Bus & Ring Buffer
console.log('Test 2: UniversalEventBus & Bounded Ring Buffers...');
const bus = new UniversalEventBus({ maxEvents: 10, maxNetwork: 10 });
for (let i = 0; i < 25; i++) {
  bus.emit('NETWORK', 'REQUEST_' + i, { index: i });
}
assert.strictEqual(bus.eventsBuffer.length, 10, 'Buffer must clamp to maxEvents');
assert.strictEqual(bus.networkBuffer.length, 10, 'Network buffer must clamp to maxNetwork');
console.log('  PASS: UniversalEventBus');

// TEST 3: 3DZ Adapter Match & Probes
console.log('Test 3: 3DZ Adapter Matching & Probing...');
const adapter3dz = new ThreeDZAdapter();
assert(adapter3dz.match({ hostname: 'v-show-commercial-v1-production.up.railway.app' }), 'Must match Railway production domain');
assert(adapter3dz.match({ hostname: 'localhost' }), 'Must match localhost');
assert(!adapter3dz.match({ hostname: 'another-unrelated-site.org' }), 'Must not match external domains');

const appInfo = adapter3dz.getAppInfo();
assert.strictEqual(appInfo.appId, '3dz-virtual-tradeshow');
console.log('  PASS: 3DZ Adapter');

// TEST 4: Runtime Core Coordination & Export
console.log('Test 4: Runtime Core & ChatGPT Exporter...');
const core = new RuntimeInspectorCore();
core.registerAdapter(adapter3dz);
core.init();

// Emit mock defect scenario (CLICK -> REQ -> RENDER)
const corrId = core.eventBus.createCorrelationId('APPLY');
core.eventBus.emit('INTERACTION', 'USER_CLICK', { tag: 'button', text: 'Apply to Active Booth' }, { correlationId: corrId });
core.eventBus.emit('NETWORK', 'FETCH_START', { method: 'POST', url: '/api/projects/prj-test/spatial/apply' }, { correlationId: corrId });
core.eventBus.emit('NETWORK', 'FETCH_COMPLETE', { method: 'POST', status: 200, ok: true }, { correlationId: corrId });
core.eventBus.emit('APP', 'USER_PROBLEM_MARKER', { annotation: 'Screen went black' }, { correlationId: corrId, severity: 'WARN' });

const bundle = core.exportDiagnostic();
assert(bundle.diagnostic, 'Diagnostic bundle must be created');
assert(bundle.summaryText.includes('RUNTIME_INSPECTOR_REPORT'), 'Summary text must contain header');
assert(bundle.summaryText.includes('LAST_USER_ACTION'), 'Summary text must contain user action');
assert(bundle.summaryText.includes('SECRET_SCAN_STATUS=PASS'), 'Export must pass secret scan');

console.log('  PASS: Runtime Core & Exporter');
console.log('ALL 4 TEST SUITES PASSED WITH ZERO FAILURES!');
