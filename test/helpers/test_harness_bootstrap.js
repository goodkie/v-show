/**
 * Test Harness Bootstrap (Stage 2 Round 40 Test Isolation)
 *
 * Dedicated test-only module loaded strictly in test environment.
 * Subclasses ReconstructionExecutionAdapter to provide mock runner capabilities
 * without exposing tokens, factories, or mutable singletons in shipped runtime modules.
 */

'use strict';

// Strictly verify dual server-side test environment flags
const envAllowsTestMode = (process.env.NODE_ENV === 'test' && process.env.STAGE2_ALLOW_TEST_HARNESS_MOCKS === '1');
if (!envAllowsTestMode) {
  throw new Error('ERR_TEST_HARNESS_BOOTSTRAP_FORBIDDEN: Test harness bootstrap cannot be loaded outside authorized test runtime');
}

const path = require('path');
const { ReconstructionExecutionAdapter } = require('../../virtual-tradeshow-commercial-v1/server/spatial_reconstruction_worker');
const internal = require('../../virtual-tradeshow-commercial-v1/server/server_internal_registry');

/**
 * Isolated Test-Only Execution Adapter Subclass.
 * Enables mockRunner and harness roots strictly for unit contract testing.
 */
class TestHarnessExecutionAdapter extends ReconstructionExecutionAdapter {
  constructor(options = {}) {
    super(options);
    this.isTestMode = true;
    this.mockAuthProvider = options.mockAuthProvider || null;
    this.harnessRegisteredRoots = new Map();
    this.trustedRootRegistry = {
      registerHarnessRoot: (id, roots) => this.registerHarnessRoot(id, roots),
      getHarnessRoots: (id) => this.getHarnessRoots(id)
    };
  }

  isAuthorized() {
    if (this.mockAuthProvider && typeof this.mockAuthProvider.validate === 'function') {
      return this.mockAuthProvider.validate(this.entitlementKey);
    }
    return super.isAuthorized();
  }

  registerHarnessRoot(rootId, roots) {
    for (const [key, rPath] of Object.entries(roots)) {
      const resolved = path.resolve(rPath);
      internal.assertNoStaticOverlap(resolved);
    }
    const resolved = {
      scratch: path.resolve(roots.scratch),
      input: path.resolve(roots.input),
      output: path.resolve(roots.output)
    };
    this.harnessRegisteredRoots.set(rootId, resolved);
    return resolved;
  }

  getHarnessRoots(rootId) {
    return this.harnessRegisteredRoots.get(rootId) || null;
  }
}

function createTestHarnessAdapter(options = {}) {
  return new TestHarnessExecutionAdapter(options);
}

const hook = internal.__testInternalHook || {};

module.exports = {
  createTestHarnessAdapter,
  TestHarnessExecutionAdapter,
  mintTestSessionProof: hook.mintTestSessionProof,
  registerAuthoritativeProject: hook.registerAuthoritativeProject,
  revokeTestSessionToken: hook.revokeSessionToken,
  verifySessionProof: internal.verifySessionProof,
  registerServerJob: internal.registerServerJob,
  resolveJobRoots: internal.resolveJobRoots,
  cancelServerJob: internal.cancelServerJob,
  evictExpiredJobs: internal.evictExpiredJobs,
  getAuthoritativeProject: internal.getAuthoritativeProject,
  assertNoStaticOverlap: internal.assertNoStaticOverlap,
  getServedStaticRoots: internal.getServedStaticRoots,
  SERVER_TRUSTED_WORKSPACE_BASE: internal.SERVER_TRUSTED_WORKSPACE_BASE
};
