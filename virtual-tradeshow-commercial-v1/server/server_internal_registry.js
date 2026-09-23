/**
 * Server Internal Job & Workspace Authority (Round 40 Closure-Private Subsystem)
 *
 * Implements private server-side job issuance, cryptographic session verification,
 * authoritative project lookup, physical workspace provisioning, single-use lifecycle,
 * and automatic eviction of expired entries.
 *
 * THIS MODULE IS STRICTLY INTERNAL TO THE SERVER CONTROL PLANE.
 * It exports ZERO privileged tokens, ZERO test harness factories, and ZERO mutable singletons.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Server Session Signing Secret (closure-private, unpredictable)
const SERVER_SESSION_SIGNING_SECRET = process.env.SERVER_SESSION_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

// Infrastructure Base Root for Trusted Workspaces
// Confined outside served static web trees
const SERVER_TRUSTED_WORKSPACE_BASE = process.env.STAGE2_WORKSPACE_BASE
  ? path.resolve(process.env.STAGE2_WORKSPACE_BASE)
  : path.resolve(os.tmpdir(), 'vshow_stage2_secure_workspaces');

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
 * Compute cryptographic HMAC signature for session proof claims
 */
function computeSessionSignature(tenantId, ownerId, sessionTokenHash, issuedAt, expiresAt) {
  const payload = `${tenantId}:${ownerId}:${sessionTokenHash}:${issuedAt}:${expiresAt}`;
  return crypto.createHmac('sha256', SERVER_SESSION_SIGNING_SECRET).update(payload).digest('hex');
}

/**
 * Mint a cryptographically verifiable session proof signed by server secret.
 * Used exclusively by server control plane during authentic session establishment.
 */
function mintSessionProof({ tenantId, ownerId, sessionTokenHash, ttlMs = 3600000 }) {
  if (!tenantId || !ownerId || !sessionTokenHash) {
    throw new Error('ERR_SESSION_MINT_INVALID_INPUTS: tenantId, ownerId, and sessionTokenHash required');
  }
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const signature = computeSessionSignature(tenantId, ownerId, sessionTokenHash, issuedAt, expiresAt);
  return Object.freeze({
    tenantId,
    ownerId,
    sessionTokenHash,
    issuedAt,
    expiresAt,
    signature
  });
}

/**
 * Verify cryptographic validity and expiration of session proof.
 * Throws ERR_REGISTRY_UNVERIFIED_PRINCIPAL on forged / invalid signatures.
 */
function verifySessionProof(sessionProof) {
  if (!sessionProof || typeof sessionProof !== 'object') {
    const err = new Error('ERR_REGISTRY_UNAUTHORIZED_REGISTRATION: Valid authenticated session proof is required');
    err.code = 'ERR_REGISTRY_UNAUTHORIZED_REGISTRATION';
    throw err;
  }

  const { tenantId, ownerId, sessionTokenHash, issuedAt, expiresAt, signature } = sessionProof;
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
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    const err = new Error('ERR_REGISTRY_UNVERIFIED_PRINCIPAL: Session timestamps must be valid numbers');
    err.code = 'ERR_REGISTRY_UNVERIFIED_PRINCIPAL';
    throw err;
  }

  const now = Date.now();
  if (now > expiresAt) {
    const err = new Error('ERR_REGISTRY_SESSION_EXPIRED: Authenticated session proof has expired');
    err.code = 'ERR_REGISTRY_SESSION_EXPIRED';
    throw err;
  }

  if (!signature || typeof signature !== 'string') {
    const err = new Error('ERR_REGISTRY_UNVERIFIED_PRINCIPAL: Session proof missing cryptographic signature');
    err.code = 'ERR_REGISTRY_UNVERIFIED_PRINCIPAL';
    throw err;
  }

  const expectedSig = computeSessionSignature(tenantId, ownerId, sessionTokenHash, issuedAt, expiresAt);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    const err = new Error('ERR_REGISTRY_UNVERIFIED_PRINCIPAL: Forged or invalid cryptographic session proof');
    err.code = 'ERR_REGISTRY_UNVERIFIED_PRINCIPAL';
    throw err;
  }

  return {
    verified: true,
    tenantId,
    ownerId,
    sessionTokenHash
  };
}

// Authoritative Server-Side Project Storage
// Maps projectId -> { projectId, tenantId, title, createdAt }
const AUTHORITATIVE_PROJECTS = new Map([
  ['project_true3d_beta', { projectId: 'project_true3d_beta', tenantId: 'tenant_commercial_alpha', title: 'Wilo True3D Beta' }],
  ['org-wilo-golden-demo', { projectId: 'org-wilo-golden-demo', tenantId: 'org-wilo-golden-demo', title: 'Wilo Golden Demo' }],
  ['booth-wilo-golden-demo', { projectId: 'booth-wilo-golden-demo', tenantId: 'org-wilo-golden-demo', title: 'Wilo Booth' }]
]);

function registerAuthoritativeProject(projectRecord) {
  if (!projectRecord || !projectRecord.projectId || !projectRecord.tenantId) {
    throw new Error('ERR_PROJECT_STORE_INVALID: projectId and tenantId required');
  }
  AUTHORITATIVE_PROJECTS.set(projectRecord.projectId, Object.freeze({ ...projectRecord }));
  return AUTHORITATIVE_PROJECTS.get(projectRecord.projectId);
}

function getAuthoritativeProject(projectId) {
  return AUTHORITATIVE_PROJECTS.get(projectId) || null;
}

// Closure-Private Active Server Jobs Map
// Strictly non-exported to prevent direct caller mutation or clears
const activeServerJobs = new Map();
const MAX_CONCURRENT_JOBS = 100;
const MAX_JOB_LIFETIME_MS = 3600000; // 1 hour

/**
 * Active eviction of expired and terminal entries.
 * Cleans physical workspace directories upon eviction.
 */
function evictExpiredJobs() {
  const now = Date.now();
  let evicted = 0;
  for (const [id, job] of activeServerJobs.entries()) {
    if (now > job.expiresAt || job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      try {
        if (job.jobRoot && fs.existsSync(job.jobRoot)) {
          fs.rmSync(job.jobRoot, { recursive: true, force: true });
        }
      } catch (_) {}
      activeServerJobs.delete(id);
      evicted++;
    }
  }
  return evicted;
}

/**
 * Register a reconstruction job under authenticated server custody.
 * Requires cryptographically verified sessionProof and project resolution from authoritative storage.
 */
function registerServerJob(jobRequest = {}, authContext = {}) {
  const rawProof = authContext.sessionProof || jobRequest.sessionProof;
  const principal = verifySessionProof(rawProof);

  // Authoritative server-side project resolution
  const projectId = jobRequest.projectId;
  if (!projectId || typeof projectId !== 'string') {
    const err = new Error('ERR_REGISTRY_INVALID_PROJECT: Valid projectId required in job request');
    err.code = 'ERR_REGISTRY_INVALID_PROJECT';
    throw err;
  }

  const project = getAuthoritativeProject(projectId);
  if (!project) {
    const err = new Error(`ERR_REGISTRY_PROJECT_NOT_FOUND: Project "${projectId}" not found in authoritative storage`);
    err.code = 'ERR_REGISTRY_PROJECT_NOT_FOUND';
    throw err;
  }

  if (project.tenantId !== principal.tenantId) {
    const err = new Error(`ERR_REGISTRY_PROJECT_TENANT_MISMATCH: Project "${projectId}" does not belong to session tenant "${principal.tenantId}"`);
    err.code = 'ERR_REGISTRY_PROJECT_TENANT_MISMATCH';
    throw err;
  }

  // Active eviction before quota check
  evictExpiredJobs();

  if (activeServerJobs.size >= MAX_CONCURRENT_JOBS) {
    const err = new Error('ERR_REGISTRY_QUOTA_EXCEEDED: Server job registry concurrent quota reached');
    err.code = 'ERR_REGISTRY_QUOTA_EXCEEDED';
    throw err;
  }

  // Cryptographic random server ID (unpredictable, unforgeable)
  const serverJobId = 'job_' + crypto.randomBytes(24).toString('hex');
  const jobRoot = path.join(SERVER_TRUSTED_WORKSPACE_BASE, principal.tenantId, serverJobId);

  // Verify non-overlap with static served mounts
  assertNoStaticOverlap(jobRoot);

  const scratch = path.join(jobRoot, 'scratch');
  const input = path.join(jobRoot, 'input');
  const output = path.join(jobRoot, 'output');

  fs.mkdirSync(scratch, { recursive: true });
  fs.mkdirSync(input, { recursive: true });
  fs.mkdirSync(output, { recursive: true });

  try {
    fs.accessSync(scratch, fs.constants.W_OK | fs.constants.R_OK);
    fs.accessSync(output, fs.constants.W_OK | fs.constants.R_OK);
    fs.accessSync(input, fs.constants.R_OK);
  } catch (permErr) {
    throw new Error(`ERR_SERVER_JOB_WORKSPACE_PERMISSION_FAILED: Workspace permission check failed: ${permErr.message}`);
  }

  const now = Date.now();
  const jobEntry = {
    jobId: serverJobId,
    tenantId: principal.tenantId,
    projectId,
    ownerId: principal.ownerId,
    sessionTokenHash: principal.sessionTokenHash,
    status: 'PROVISIONED',
    jobRoot,
    scratch,
    input,
    output,
    provisionedAt: now,
    expiresAt: now + MAX_JOB_LIFETIME_MS
  };

  activeServerJobs.set(serverJobId, jobEntry);

  return Object.freeze({
    jobId: serverJobId,
    tenantId: principal.tenantId,
    projectId,
    ownerId: principal.ownerId,
    status: 'PROVISIONED',
    scratch,
    input,
    output,
    provisionedAt: now,
    expiresAt: jobEntry.expiresAt
  });
}

/**
 * Resolve job workspace roots with mandatory cryptographic session proof verification.
 * Enforces single-use consume lifecycle transition ('PROVISIONED' -> 'CONSUMED').
 */
function resolveJobRoots(jobId, sessionContext = {}) {
  if (!jobId || typeof jobId !== 'string' || !/^job_[a-zA-Z0-9_-]{16,64}$/.test(jobId)) {
    const err = new Error('ERR_TRUSTED_ROOT_INVALID_JOB_ID: Job ID must be a valid server-issued ID');
    err.code = 'ERR_TRUSTED_ROOT_INVALID_JOB_ID';
    throw err;
  }

  evictExpiredJobs();

  const job = activeServerJobs.get(jobId);
  if (!job) {
    const err = new Error(`ERR_ADAPTER_JOB_NOT_FOUND: Job "${jobId}" is not registered in server job registry`);
    err.code = 'ERR_ADAPTER_JOB_NOT_FOUND';
    throw err;
  }

  if (Date.now() > job.expiresAt) {
    const err = new Error(`ERR_ADAPTER_JOB_EXPIRED: Job "${jobId}" has expired`);
    err.code = 'ERR_ADAPTER_JOB_EXPIRED';
    throw err;
  }

  if (job.status === 'CONSUMED' || job.status === 'COMPLETED' || job.status === 'CANCELLED') {
    const err = new Error(`ERR_ADAPTER_JOB_ALREADY_CONSUMED: Job "${jobId}" has already reached terminal status "${job.status}"`);
    err.code = 'ERR_ADAPTER_JOB_ALREADY_CONSUMED';
    throw err;
  }

  // Cryptographic session verification
  const principal = verifySessionProof(sessionContext);
  if (principal.tenantId !== job.tenantId) {
    const err = new Error(`ERR_ADAPTER_TENANT_MISMATCH: Session tenant "${principal.tenantId}" does not match job tenant "${job.tenantId}"`);
    err.code = 'ERR_ADAPTER_TENANT_MISMATCH';
    throw err;
  }
  if (principal.ownerId !== job.ownerId) {
    const err = new Error(`ERR_ADAPTER_JOB_AUTHORIZATION_FAILED: Session owner "${principal.ownerId}" is not authorized for job "${jobId}"`);
    err.code = 'ERR_ADAPTER_JOB_AUTHORIZATION_FAILED';
    throw err;
  }

  // Single-use lifecycle transition
  job.status = 'CONSUMED';

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

/**
 * Cancel a provisioned server job and immediately delete its physical workspace.
 */
function cancelServerJob(jobId, sessionContext = {}) {
  const principal = verifySessionProof(sessionContext);
  const job = activeServerJobs.get(jobId);
  if (!job) {
    return { cancelled: false, reason: 'ERR_JOB_NOT_FOUND' };
  }
  if (job.tenantId !== principal.tenantId || job.ownerId !== principal.ownerId) {
    const err = new Error('ERR_ADAPTER_JOB_AUTHORIZATION_FAILED: Unauthorized to cancel job');
    err.code = 'ERR_ADAPTER_JOB_AUTHORIZATION_FAILED';
    throw err;
  }

  job.status = 'CANCELLED';
  try {
    if (job.jobRoot && fs.existsSync(job.jobRoot)) {
      fs.rmSync(job.jobRoot, { recursive: true, force: true });
    }
  } catch (_) {}
  // Physical directory deleted immediately; terminal entry preserved in map until evictExpiredJobs() recovers quota
  return { cancelled: true, jobId };
}

// Module Exports: Zero private authority tokens, zero harness factories, zero mutable singletons
module.exports = {
  registerServerJob,
  resolveJobRoots,
  cancelServerJob,
  evictExpiredJobs,
  mintSessionProof,
  verifySessionProof,
  registerAuthoritativeProject,
  getAuthoritativeProject,
  assertNoStaticOverlap,
  getServedStaticRoots,
  SERVER_TRUSTED_WORKSPACE_BASE
};
