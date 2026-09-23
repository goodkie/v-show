/**
 * Server Internal Job & Workspace Authority (Round 39 Private Subsystem)
 *
 * Implements private server-side job issuance, tenancy enforcement,
 * physical workspace provisioning, and test harness structural isolation.
 *
 * THIS MODULE IS STRICTLY INTERNAL TO THE SERVER CONTROL PLANE.
 * It is NOT exposed on the public exports of spatial_reconstruction_worker.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Infrastructure Base Root for Trusted Workspaces
// Confined outside served static web trees
const SERVER_TRUSTED_WORKSPACE_BASE = process.env.STAGE2_WORKSPACE_BASE
  ? path.resolve(process.env.STAGE2_WORKSPACE_BASE)
  : path.resolve(os.tmpdir(), 'vshow_stage2_secure_workspaces');

// Private unforgeable token for test harness authorization
const HARNESS_AUTHORIZATION_TOKEN = Symbol('STAGE2_TEST_HARNESS_AUTH_TOKEN');

// Served static web directories that must never overlap with workspace roots
function getServedStaticRoots() {
  const serverDir = __dirname;
  const projectRoot = path.resolve(serverDir, '..');
  return [
    path.join(projectRoot, 'client'),
    path.join(projectRoot, 'client', 'assets'),
    path.join(projectRoot, 'assets'),
    path.join(projectRoot, 'uploads'),
    path.join(projectRoot, '_clean_deploy'),
    path.join(projectRoot, '_railway_deploy'),
    path.join(projectRoot, 'app_build'),
    path.join(projectRoot, 'customer_uploads')
  ];
}

/**
 * Asserts that a target directory has zero overlap with served static directories
 * and does not contain prohibited directory structures (e.g. client, assets, uploads, public, etc.).
 */
function assertNoStaticOverlap(targetPath) {
  const normTarget = path.resolve(targetPath);
  const lowerTarget = normTarget.toLowerCase();

  const prohibitedSubstrings = [
    path.sep + 'client' + path.sep,
    path.sep + 'assets' + path.sep,
    path.sep + 'uploads' + path.sep,
    path.sep + '_clean_deploy' + path.sep,
    path.sep + '_railway_deploy' + path.sep,
    path.sep + 'windows' + path.sep,
    path.sep + 'system32' + path.sep,
    path.sep + 'customer_uploads' + path.sep,
    path.sep + 'public' + path.sep,
    path.sep + 'static' + path.sep
  ];
  for (const p of prohibitedSubstrings) {
    if (lowerTarget.includes(p.toLowerCase())) {
      throw new Error(`ERR_TRUSTED_ROOT_PROHIBITED_MOUNT: Target path "${targetPath}" collides with prohibited directory structure "${p}"`);
    }
  }

  const servedRoots = getServedStaticRoots();
  for (const sRoot of servedRoots) {
    const normStatic = path.resolve(sRoot).toLowerCase();
    const rel1 = path.relative(normStatic, lowerTarget);
    const rel2 = path.relative(lowerTarget, normStatic);
    if (!rel1.startsWith('..') && !path.isAbsolute(rel1)) {
      throw new Error(`ERR_TRUSTED_ROOT_PROHIBITED_MOUNT: Target path "${targetPath}" is inside served static root "${sRoot}"`);
    }
    if (!rel2.startsWith('..') && !path.isAbsolute(rel2)) {
      throw new Error(`ERR_TRUSTED_ROOT_PROHIBITED_MOUNT: Target path "${targetPath}" contains served static root "${sRoot}"`);
    }
  }
}

/**
 * Server-Owned Job Registry (R39)
 * Issues server-controlled unpredictable IDs, binds tenant/owner identity from verified session proof,
 * enforces single-use lifecycle, expiration, and resource quotas.
 */
class ServerJobRegistry {
  constructor(options = {}) {
    this.jobs = new Map();
    this.baseRoot = SERVER_TRUSTED_WORKSPACE_BASE;
    this.maxConcurrentJobs = 100;
    this.maxJobLifetimeMs = 3600000; // 1 hour
  }

  /**
   * Register a job via authenticated server workflow.
   * Requires verified session proof and project record; strings alone are rejected.
   */
  registerJob(jobRecord = {}, authContext = {}) {
    const sessionProof = authContext.sessionProof || jobRecord.sessionProof;
    const projectRecord = authContext.projectRecord || jobRecord.projectRecord;
    const isTestHarness = (authContext.privateToken === HARNESS_AUTHORIZATION_TOKEN);

    // Rejection of unauthenticated or plain caller-submitted strings (R39 P0-2)
    if (!sessionProof || typeof sessionProof !== 'object') {
      const err = new Error('ERR_REGISTRY_UNAUTHORIZED_REGISTRATION: Valid authenticated session proof is required to register jobs');
      err.code = 'ERR_REGISTRY_UNAUTHORIZED_REGISTRATION';
      throw err;
    }

    const { tenantId, ownerId, sessionTokenHash } = sessionProof;
    if (!tenantId || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(tenantId)) {
      const err = new Error('ERR_REGISTRY_INVALID_TENANT: Session proof must contain valid tenantId');
      err.code = 'ERR_REGISTRY_INVALID_TENANT';
      throw err;
    }
    if (!ownerId || typeof ownerId !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(ownerId)) {
      const err = new Error('ERR_REGISTRY_INVALID_OWNER: Session proof must contain valid ownerId');
      err.code = 'ERR_REGISTRY_INVALID_OWNER';
      throw err;
    }
    if (!sessionTokenHash || typeof sessionTokenHash !== 'string') {
      const err = new Error('ERR_REGISTRY_INVALID_SESSION_TOKEN: Session proof must contain sessionTokenHash');
      err.code = 'ERR_REGISTRY_INVALID_SESSION_TOKEN';
      throw err;
    }

    if (!projectRecord || typeof projectRecord !== 'object' || !projectRecord.projectId) {
      const err = new Error('ERR_REGISTRY_INVALID_PROJECT: Valid project record required');
      err.code = 'ERR_REGISTRY_INVALID_PROJECT';
      throw err;
    }
    if (projectRecord.tenantId && projectRecord.tenantId !== tenantId) {
      const err = new Error('ERR_REGISTRY_PROJECT_TENANT_MISMATCH: Project does not belong to session tenant');
      err.code = 'ERR_REGISTRY_PROJECT_TENANT_MISMATCH';
      throw err;
    }

    // Resource quota check
    if (this.jobs.size >= this.maxConcurrentJobs) {
      const err = new Error('ERR_REGISTRY_QUOTA_EXCEEDED: Server job registry concurrent job quota reached');
      err.code = 'ERR_REGISTRY_QUOTA_EXCEEDED';
      throw err;
    }

    // Issue unpredictable cryptographically secure server ID
    let serverJobId;
    if (isTestHarness && jobRecord.jobId) {
      serverJobId = jobRecord.jobId;
    } else {
      serverJobId = 'job_' + crypto.randomBytes(24).toString('hex');
    }

    const jobRoot = path.join(this.baseRoot, tenantId, serverJobId);

    // Verify non-overlap with static served mounts
    assertNoStaticOverlap(jobRoot);

    const scratch = path.join(jobRoot, 'scratch');
    const input = path.join(jobRoot, 'input');
    const output = path.join(jobRoot, 'output');

    // Physical workspace provisioning under server custody
    fs.mkdirSync(scratch, { recursive: true });
    fs.mkdirSync(input, { recursive: true });
    fs.mkdirSync(output, { recursive: true });

    // Verify directory permissions
    try {
      fs.accessSync(scratch, fs.constants.W_OK | fs.constants.R_OK);
      fs.accessSync(output, fs.constants.W_OK | fs.constants.R_OK);
      fs.accessSync(input, fs.constants.R_OK);
    } catch (permErr) {
      throw new Error(`ERR_SERVER_JOB_WORKSPACE_PERMISSION_FAILED: Failed workspace permission check: ${permErr.message}`);
    }

    const now = Date.now();
    const record = Object.freeze({
      jobId: serverJobId,
      tenantId,
      projectId: projectRecord.projectId,
      ownerId,
      sessionTokenHash,
      status: 'PROVISIONED',
      jobRoot,
      scratch,
      input,
      output,
      createdAt: now,
      expiresAt: now + this.maxJobLifetimeMs
    });

    this.jobs.set(serverJobId, record);
    return record;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  transitionJobStatus(jobId, fromStatus, toStatus) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }
    if (job.status !== fromStatus) {
      return false;
    }
    const updated = Object.freeze({
      ...job,
      status: toStatus,
      updatedAt: Date.now()
    });
    this.jobs.set(jobId, updated);
    return true;
  }

  clear() {
    this.jobs.clear();
  }
}

// Global server job registry singleton
const SERVER_JOB_REGISTRY = new ServerJobRegistry();

/**
 * Infrastructure-Owned Trusted Root Registry (R39)
 * Prohibits caller-supplied root overrides; manages immutable job roots and binds to ServerJobRegistry.
 */
class TrustedRootRegistry {
  constructor(options = {}, privateToken = null) {
    if (options.baseRoot !== undefined) {
      throw new Error('ERR_ADAPTER_CALLER_BASE_ROOT_OVERRIDE_FORBIDDEN: Caller-supplied baseRoot is strictly forbidden; roots are server-owned');
    }
    if (options.allowHarnessRoots !== undefined && privateToken !== HARNESS_AUTHORIZATION_TOKEN) {
      throw new Error('ERR_ADAPTER_CALLER_HARNESS_ROOTS_OVERRIDE_FORBIDDEN: Harness root capability forbidden outside verified test harness');
    }
    this.baseRoot = SERVER_TRUSTED_WORKSPACE_BASE;
    this.allowHarnessRoots = (privateToken === HARNESS_AUTHORIZATION_TOKEN);
    this.harnessRegisteredRoots = new Map();
  }

  registerHarnessRoot(rootId, roots, privateToken = null) {
    if (!this.allowHarnessRoots && privateToken !== HARNESS_AUTHORIZATION_TOKEN) {
      throw new Error('ERR_TRUSTED_ROOT_HARNESS_FORBIDDEN: Harness root registration forbidden outside test harness mode');
    }
    for (const [key, rPath] of Object.entries(roots)) {
      const resolved = path.resolve(rPath);
      assertNoStaticOverlap(resolved);
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

  resolveJobRoots(jobId, sessionContext = {}) {
    if (!jobId || typeof jobId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(jobId)) {
      const err = new Error('ERR_TRUSTED_ROOT_INVALID_JOB_ID: Job ID must be 8-64 alphanumeric/dash characters');
      err.code = 'ERR_TRUSTED_ROOT_INVALID_JOB_ID';
      throw err;
    }

    // 1. Mandatory server job registry lookup (R38/R39 P0-1)
    const job = SERVER_JOB_REGISTRY.getJob(jobId);
    if (!job) {
      const err = new Error(`ERR_ADAPTER_JOB_NOT_FOUND: Job "${jobId}" is not registered in server job registry`);
      err.code = 'ERR_ADAPTER_JOB_NOT_FOUND';
      throw err;
    }

    // 2. Lifecycle & expiration checks
    if (Date.now() > job.expiresAt) {
      const err = new Error(`ERR_ADAPTER_JOB_EXPIRED: Job "${jobId}" has expired`);
      err.code = 'ERR_ADAPTER_JOB_EXPIRED';
      throw err;
    }
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      const err = new Error(`ERR_ADAPTER_JOB_ALREADY_CONSUMED: Job "${jobId}" has already reached terminal status "${job.status}"`);
      err.code = 'ERR_ADAPTER_JOB_ALREADY_CONSUMED';
      throw err;
    }

    // 3. Mandatory session context binding (R38/R39 P0-1, P0-2)
    if (!sessionContext || typeof sessionContext !== 'object') {
      const err = new Error('ERR_ADAPTER_SESSION_CONTEXT_REQUIRED: Valid session context is required to resolve job roots');
      err.code = 'ERR_ADAPTER_SESSION_CONTEXT_REQUIRED';
      throw err;
    }
    if (!sessionContext.tenantId || sessionContext.tenantId !== job.tenantId) {
      const err = new Error(`ERR_ADAPTER_TENANT_MISMATCH: Session tenant "${sessionContext.tenantId}" does not match job tenant "${job.tenantId}"`);
      err.code = 'ERR_ADAPTER_TENANT_MISMATCH';
      throw err;
    }
    if (!sessionContext.ownerId || sessionContext.ownerId !== job.ownerId) {
      const err = new Error(`ERR_ADAPTER_JOB_AUTHORIZATION_FAILED: Session owner "${sessionContext.ownerId}" is not authorized for job "${jobId}"`);
      err.code = 'ERR_ADAPTER_JOB_AUTHORIZATION_FAILED';
      throw err;
    }
    if (job.sessionTokenHash && sessionContext.sessionTokenHash !== job.sessionTokenHash) {
      const err = new Error(`ERR_ADAPTER_SESSION_TOKEN_MISMATCH: Session token does not match job binding`);
      err.code = 'ERR_ADAPTER_SESSION_TOKEN_MISMATCH';
      throw err;
    }

    // 4. Physical workspace existence verification
    if (!fs.existsSync(job.scratch) || !fs.existsSync(job.input) || !fs.existsSync(job.output)) {
      const err = new Error('ERR_ADAPTER_WORKSPACE_NOT_PROVISIONED: One or more workspace roots do not exist on disk');
      err.code = 'ERR_ADAPTER_WORKSPACE_NOT_PROVISIONED';
      throw err;
    }

    return Object.freeze({
      scratch: job.scratch,
      input: job.input,
      output: job.output
    });
  }
}

/**
 * Test Harness Factory.
 * Strictly isolated behind dual environment verification.
 */
function createTestHarnessAdapter(AdapterClass, options = {}) {
  const envAllowsTestMode = (process.env.NODE_ENV === 'test' && process.env.STAGE2_ALLOW_TEST_HARNESS_MOCKS === '1');
  if (!envAllowsTestMode) {
    throw new Error('ERR_TEST_HARNESS_FORBIDDEN_IN_PRODUCTION: Test harness factory strictly forbidden outside authorized test environment');
  }
  return new AdapterClass({
    ...options,
    isTestMode: true,
    allowHarnessRoots: true
  }, HARNESS_AUTHORIZATION_TOKEN);
}

module.exports = {
  HARNESS_AUTHORIZATION_TOKEN,
  SERVER_TRUSTED_WORKSPACE_BASE,
  ServerJobRegistry,
  SERVER_JOB_REGISTRY,
  TrustedRootRegistry,
  assertNoStaticOverlap,
  getServedStaticRoots,
  createTestHarnessAdapter
};
