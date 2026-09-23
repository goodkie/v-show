/**
 * Test Harness Bootstrap (Stage 2 Round 39)
 *
 * Dedicated test-only module loaded strictly in test environment.
 * Provides privileged test harness factories and server job registry authority
 * without exposing tokens or factories on the public exports of spatial_reconstruction_worker.js.
 */

'use strict';

// Strictly verify dual server-side test environment flags
const envAllowsTestMode = (process.env.NODE_ENV === 'test' && process.env.STAGE2_ALLOW_TEST_HARNESS_MOCKS === '1');
if (!envAllowsTestMode) {
  throw new Error('ERR_TEST_HARNESS_BOOTSTRAP_FORBIDDEN: Test harness bootstrap cannot be loaded outside authorized test runtime');
}

const { ReconstructionExecutionAdapter } = require('../../virtual-tradeshow-commercial-v1/server/spatial_reconstruction_worker');
const internal = require('../../virtual-tradeshow-commercial-v1/server/server_internal_registry');

function createTestHarnessAdapter(options = {}) {
  return internal.createTestHarnessAdapter(ReconstructionExecutionAdapter, options);
}

module.exports = {
  createTestHarnessAdapter,
  SERVER_JOB_REGISTRY: internal.SERVER_JOB_REGISTRY,
  ServerJobRegistry: internal.ServerJobRegistry,
  TrustedRootRegistry: internal.TrustedRootRegistry,
  HARNESS_AUTHORIZATION_TOKEN: internal.HARNESS_AUTHORIZATION_TOKEN,
  assertNoStaticOverlap: internal.assertNoStaticOverlap,
  getServedStaticRoots: internal.getServedStaticRoots,
  SERVER_TRUSTED_WORKSPACE_BASE: internal.SERVER_TRUSTED_WORKSPACE_BASE
};
