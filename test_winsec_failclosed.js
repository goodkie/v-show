/**
 * test_winsec_failclosed.js
 * Verification of R6.9G.10.3 Blocker 2: Windows Secret Storage Fail-Closed & Scheme Enforcement.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const winsec = require('./companion/winsec');

console.log('--- Running Winsec Security Tests ---');

// Test A: DPAPI unavailable -> credential save fails closed
console.log('Test A: DPAPI unavailable -> credential save fails closed');
process.env.XPIDER_FORCE_DPAPI_FAIL = '1';
winsec.clearMemoryCache();

let testAFailedClosed = false;
try {
  winsec.sanitizeNodeForSave({
    id: 'test-node-1',
    type: 'HTTP_PROXY',
    host: '1.2.3.4',
    port: 8080,
    username: 'user1',
    password: 'super-secret-password'
  });
} catch (err) {
  testAFailedClosed = true;
  console.log('  [PASS] Caught expected fail-closed error:', err.message);
}
assert.strictEqual(testAFailedClosed, true, 'Saving node with plaintext password MUST throw when DPAPI fails');

// Test A2: Unprefixed credentialRef also fails closed when DPAPI fails to migrate
let testA2FailedClosed = false;
try {
  winsec.sanitizeNodeForSave({
    id: 'test-node-1b',
    type: 'HTTP_PROXY',
    host: '1.2.3.4',
    port: 8080,
    username: 'user1',
    credentialRef: 'raw-unencrypted-secret'
  });
} catch (err) {
  testA2FailedClosed = true;
  console.log('  [PASS] Caught expected fail-closed error on insecure credentialRef:', err.message);
}
assert.strictEqual(testA2FailedClosed, true, 'Saving node with insecure credentialRef MUST throw when DPAPI fails');

// Re-enable DPAPI
delete process.env.XPIDER_FORCE_DPAPI_FAIL;
winsec.clearMemoryCache();

// Test B: credentialRef="plain-secret" -> rejected, never returned as password
console.log('Test B: credentialRef="plain-secret" -> rejected, never returned as password');
const plainDecrypted = winsec.decrypt('plain-secret');
assert.strictEqual(plainDecrypted, '', 'Decrypting unprefixed string MUST return empty string, never plaintext');

const resolvedCredentials = winsec.resolveNodeCredentials({
  id: 'test-node-2',
  username: 'testuser',
  credentialRef: 'plain-secret'
});
assert.strictEqual(resolvedCredentials.password, '', 'resolveNodeCredentials with unprefixed credentialRef MUST return empty password');
console.log('  [PASS] unprefixed credentialRef strictly rejected, password returned as empty string');

// Test B2: ENV reference works as opt-in
console.log('Test B2: ENV reference scheme verification');
process.env.TEST_PROXY_SECRET = 'env-secret-val-123';
const envResolved = winsec.resolveNodeCredentials({
  id: 'test-node-env',
  username: 'testuser',
  credentialRef: 'ENV:TEST_PROXY_SECRET'
});
assert.strictEqual(envResolved.password, 'env-secret-val-123', 'ENV: reference must resolve environment variable');
console.log('  [PASS] ENV: reference resolved correctly');

// Test C: persisted JSON contains zero plaintext secret material
console.log('Test C: persisted JSON contains zero plaintext secret material');
if (process.platform === 'win32') {
  const nodeWithPlaintext = {
    id: 'test-node-c',
    type: 'HTTP_PROXY',
    host: '9.9.9.9',
    port: 3128,
    username: 'admin',
    password: 'my-confidential-password-xyz',
    observedEgressIp: '9.9.9.9',
    observedFingerprint: 'fprint123',
    lastVerifiedAt: Date.now()
  };

  const sanitized = winsec.sanitizeNodeForSave(nodeWithPlaintext);
  assert.strictEqual(sanitized.password, '', 'Sanitized node MUST have empty password field');
  assert.ok(sanitized.credentialRef.startsWith('dpapi:'), 'Sanitized node MUST have dpapi: prefix');
  assert.strictEqual(sanitized.observedEgressIp, undefined, 'observedEgressIp must be removed');
  assert.strictEqual(sanitized.observedFingerprint, undefined, 'observedFingerprint must be removed');

  const jsonString = JSON.stringify(sanitized, null, 2);
  assert.strictEqual(jsonString.includes('my-confidential-password-xyz'), false, 'Persisted JSON must NOT contain plaintext password');
  console.log('  [PASS] Sanitized node JSON verified clean. Zero plaintext password present.');

  // Test roundtrip: decrypt the DPAPI cipher
  const roundtripCreds = winsec.resolveNodeCredentials(sanitized);
  assert.strictEqual(roundtripCreds.password, 'my-confidential-password-xyz', 'DPAPI roundtrip decrypt must match original plaintext');
  console.log('  [PASS] DPAPI roundtrip decryption successful.');
}

console.log('--- ALL WINSEC SECURITY TESTS PASSED ---');
