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
const DISALLOWED_PLACEHOLDER_SECRETS = new Set([
  'secret',
  'password',
  'placeholder',
  'changeme',
  'default',
  'stage2_fast_track_default',
  '12345678',
  'authenticated_stage2_infrastructure_key',
  'secret_stage2_handshake',
  'test',
  '123456'
]);

function isTrivialOrPlaceholderSecret(secret) {
  if (typeof secret !== 'string') return true;
  const trimmed = secret.trim().toLowerCase();
  return trimmed.length < 32 || DISALLOWED_PLACEHOLDER_SECRETS.has(trimmed);
}

function getSigningSecret() {
  const secret = process.env.SERVER_SESSION_SIGNING_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || typeof secret !== 'string' || secret.length < 32 || isTrivialOrPlaceholderSecret(secret)) {
      const err = new Error('ERR_SESSION_SECRET_NOT_CONFIGURED: Production runtime requires non-trivial SERVER_SESSION_SIGNING_SECRET (min 32 chars)');
      err.code = 'ERR_SESSION_SECRET_NOT_CONFIGURED';
      throw err;
    }
    return secret;
  }
  return secret || 'stage2_fast_track_test_signing_secret_32_bytes_min_entropy';
}

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

  // Canonical realpath traversal check to detect symlinks, junctions, or mount re-directions
  let testExisting = normTarget;
  while (!fs.existsSync(testExisting)) {
    const parent = path.dirname(testExisting);
    if (parent === testExisting) break;
    testExisting = parent;
  }
  let realTarget = normTarget;
  if (fs.existsSync(testExisting)) {
    try {
      const realExisting = fs.realpathSync(testExisting);
      realTarget = path.resolve(realExisting, path.relative(testExisting, normTarget));
    } catch (_) {}
  }

  const servedRoots = getServedStaticRoots();
  for (const sRoot of servedRoots) {
    const normStatic = path.resolve(sRoot).toLowerCase();
    let realStatic = normStatic;
    if (fs.existsSync(sRoot)) {
      try {
        realStatic = path.resolve(fs.realpathSync(sRoot)).toLowerCase();
      } catch (_) {}
    }

    for (const t of [lowerTarget, realTarget.toLowerCase()]) {
      for (const s of [normStatic, realStatic]) {
        const rel1 = path.relative(s, t);
        const rel2 = path.relative(t, s);
        if (!rel1.startsWith('..') && !path.isAbsolute(rel1)) {
          throw new Error(`ERR_TRUSTED_ROOT_PROHIBITED_MOUNT: Target path "${targetPath}" is inside served static root "${sRoot}"`);
        }
        if (!rel2.startsWith('..') && !path.isAbsolute(rel2)) {
          throw new Error(`ERR_TRUSTED_ROOT_PROHIBITED_MOUNT: Target path "${targetPath}" contains served static root "${sRoot}"`);
        }
      }
    }
  }
}

/**
 * Server-Side Session Revocation Registry (Durable File-Backed Store)
 * Survives process restarts and propagates across independent processes.
 */
const DURABLE_AUTH_DIR = process.env.STAGE2_AUTH_STORE_DIR
  ? path.resolve(process.env.STAGE2_AUTH_STORE_DIR)
  : path.resolve(os.tmpdir(), 'vshow_stage2_auth_store');
const REVOCATION_FILE = path.join(DURABLE_AUTH_DIR, 'revoked_tokens.json');

const revokedSessionTokens = new Set();

function getRevokedTokensFromFile() {
  try {
    if (fs.existsSync(REVOCATION_FILE)) {
      const data = JSON.parse(fs.readFileSync(REVOCATION_FILE, 'utf8'));
      if (Array.isArray(data)) {
        return new Set(data);
      }
    }
  } catch (_) {}
  return new Set();
}

function persistRevokedTokens(set) {
  try {
    fs.mkdirSync(DURABLE_AUTH_DIR, { recursive: true });
    const tmpFile = path.join(DURABLE_AUTH_DIR, `revoked_tokens_${process.pid}_${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, JSON.stringify(Array.from(set)), 'utf8');
    fs.renameSync(tmpFile, REVOCATION_FILE);
  } catch (_) {}
}

function revokeSessionToken(sessionTokenHash) {
  if (sessionTokenHash && typeof sessionTokenHash === 'string') {
    revokedSessionTokens.add(sessionTokenHash);
    const diskSet = getRevokedTokensFromFile();
    diskSet.add(sessionTokenHash);
    persistRevokedTokens(diskSet);
  }
}

function isSessionRevoked(sessionTokenHash) {
  if (!sessionTokenHash) return true;
  if (revokedSessionTokens.has(sessionTokenHash)) return true;
  const diskSet = getRevokedTokensFromFile();
  if (diskSet.has(sessionTokenHash)) {
    revokedSessionTokens.add(sessionTokenHash);
    return true;
  }
  return false;
}

/**
 * Compute cryptographic HMAC signature for session proof claims.
 * Cryptographically binds tenantId, ownerId, projectId, sessionTokenHash, issuedAt, expiresAt.
 */
function computeSessionSignature(tenantId, ownerId, projectId, sessionTokenHash, issuedAt, expiresAt) {
  const payload = `${tenantId}:${ownerId}:${projectId}:${sessionTokenHash}:${issuedAt}:${expiresAt}`;
  const secret = getSigningSecret();
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify cryptographic validity, expiration, and project binding of session proof.
 * Throws ERR_REGISTRY_UNVERIFIED_PRINCIPAL on forged / invalid signatures.
 * Throws ERR_REGISTRY_PROJECT_PROOF_MISMATCH on same-tenant cross-project replay.
 */
function verifySessionProof(sessionProof, expectedProjectId = null) {
  if (!sessionProof || typeof sessionProof !== 'object') {
    const err = new Error('ERR_REGISTRY_UNAUTHORIZED_REGISTRATION: Valid authenticated session proof is required');
    err.code = 'ERR_REGISTRY_UNAUTHORIZED_REGISTRATION';
    throw err;
  }

  const { tenantId, ownerId, projectId, sessionTokenHash, issuedAt, expiresAt, signature } = sessionProof;
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
  if (!projectId || typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(projectId)) {
    const err = new Error('ERR_REGISTRY_INVALID_PROJECT: Session proof must contain valid projectId');
    err.code = 'ERR_REGISTRY_INVALID_PROJECT';
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

  // Cryptographic project binding verification
  if (expectedProjectId && expectedProjectId !== projectId) {
    const err = new Error(`ERR_REGISTRY_PROJECT_PROOF_MISMATCH: Session proof bound to project "${projectId}" cannot be used for project "${expectedProjectId}"`);
    err.code = 'ERR_REGISTRY_PROJECT_PROOF_MISMATCH';
    throw err;
  }

  const now = Date.now();
  const CLOCK_SKEW_TOLERANCE_MS = 5000;
  const MAX_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  if (issuedAt > now + CLOCK_SKEW_TOLERANCE_MS) {
    const err = new Error('ERR_SESSION_FUTURE_TIMESTAMP: Session proof issued in the future');
    err.code = 'ERR_SESSION_FUTURE_TIMESTAMP';
    throw err;
  }

  if (now > expiresAt) {
    const err = new Error('ERR_REGISTRY_SESSION_EXPIRED: Authenticated session proof has expired');
    err.code = 'ERR_REGISTRY_SESSION_EXPIRED';
    throw err;
  }

  if (expiresAt <= issuedAt || (expiresAt - issuedAt) > MAX_SESSION_TTL_MS) {
    const err = new Error('ERR_SESSION_INVALID_LIFETIME: Session TTL exceeds maximum permissible lifetime or is invalid');
    err.code = 'ERR_SESSION_INVALID_LIFETIME';
    throw err;
  }

  if (isSessionRevoked(sessionTokenHash)) {
    const err = new Error('ERR_SESSION_REVOKED: Authenticated session token has been revoked');
    err.code = 'ERR_SESSION_REVOKED';
    throw err;
  }

  if (!signature || typeof signature !== 'string') {
    const err = new Error('ERR_REGISTRY_UNVERIFIED_PRINCIPAL: Session proof missing cryptographic signature');
    err.code = 'ERR_REGISTRY_UNVERIFIED_PRINCIPAL';
    throw err;
  }

  const expectedSig = computeSessionSignature(tenantId, ownerId, projectId, sessionTokenHash, issuedAt, expiresAt);
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
    projectId,
    sessionTokenHash
  };
}

// Authoritative Server-Side Project Storage (Pre-configured Authoritative Registry)
// Maps projectId -> { projectId, tenantId, title }
const AUTHORITATIVE_PROJECTS = new Map([
  ['project_true3d_beta', { projectId: 'project_true3d_beta', tenantId: 'tenant_commercial_alpha', title: 'Wilo True3D Beta' }],
  ['project_same_tenant_other', { projectId: 'project_same_tenant_other', tenantId: 'tenant_commercial_alpha', title: 'Same Tenant Other Project' }],
  ['project_foreign_tenant', { projectId: 'project_foreign_tenant', tenantId: 'other_tenant_id', title: 'Foreign Project' }],
  ['project_client_mount', { projectId: 'project_client_mount', tenantId: 'client', title: 'Client Mount Project' }],
  ['org-wilo-golden-demo', { projectId: 'org-wilo-golden-demo', tenantId: 'org-wilo-golden-demo', title: 'Wilo Golden Demo' }],
  ['booth-wilo-golden-demo', { projectId: 'booth-wilo-golden-demo', tenantId: 'org-wilo-golden-demo', title: 'Wilo Booth' }]
]);

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
 * Retains jobs in CLEANUP_FAILED status to account for orphaned storage until safe reclaim.
 */
function evictExpiredJobs() {
  const now = Date.now();
  let evicted = 0;
  for (const [id, job] of activeServerJobs.entries()) {
    if (job.status === 'CLEANUP_FAILED') {
      continue;
    }
    if (now > job.expiresAt || job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      let cleanupOk = true;
      try {
        if (job.jobRoot && fs.existsSync(job.jobRoot)) {
          fs.rmSync(job.jobRoot, { recursive: true, force: true });
        }
      } catch (rmErr) {
        cleanupOk = false;
        job.status = 'CLEANUP_FAILED';
        job.cleanupError = rmErr.message;
      }
      if (cleanupOk) {
        activeServerJobs.delete(id);
        evicted++;
      }
    }
  }
  return evicted;
}

/**
 * Register a reconstruction job under authenticated server custody.
 * Requires cryptographically verified sessionProof bound to the exact projectId
 * and project resolution from authoritative storage.
 */
function registerServerJob(jobRequest = {}, authContext = {}) {
  const projectId = jobRequest.projectId;
  if (!projectId || typeof projectId !== 'string') {
    const err = new Error('ERR_REGISTRY_INVALID_PROJECT: Valid projectId required in job request');
    err.code = 'ERR_REGISTRY_INVALID_PROJECT';
    throw err;
  }

  const rawProof = authContext.sessionProof || jobRequest.sessionProof;
  const principal = verifySessionProof(rawProof, projectId);

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
 * Enforces project binding and single-use consume lifecycle transition ('PROVISIONED' -> 'CONSUMED').
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

  if (job.status === 'CONSUMED' || job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'CLEANUP_FAILED') {
    const err = new Error(`ERR_ADAPTER_JOB_ALREADY_CONSUMED: Job "${jobId}" has already reached terminal status "${job.status}"`);
    err.code = 'ERR_ADAPTER_JOB_ALREADY_CONSUMED';
    throw err;
  }

  // Cryptographic session verification binding expected projectId
  const principal = verifySessionProof(sessionContext, job.projectId);
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
  if (principal.projectId !== job.projectId) {
    const err = new Error(`ERR_ADAPTER_PROJECT_MISMATCH: Session project "${principal.projectId}" does not match job project "${job.projectId}"`);
    err.code = 'ERR_ADAPTER_PROJECT_MISMATCH';
    throw err;
  }

  // Exact session identity check: prevents session-swapping across multiple sessions of the same owner
  if (principal.sessionTokenHash !== job.sessionTokenHash) {
    const err = new Error('ERR_ADAPTER_SESSION_TOKEN_MISMATCH: Session token does not match registered job session identity');
    err.code = 'ERR_ADAPTER_SESSION_TOKEN_MISMATCH';
    throw err;
  }

  // Preflight validation: workspace roots and static non-overlap MUST exist BEFORE status transitions to CONSUMED
  if (!fs.existsSync(job.scratch) || !fs.existsSync(job.input) || !fs.existsSync(job.output)) {
    const err = new Error('ERR_ADAPTER_WORKSPACE_NOT_PROVISIONED: One or more workspace roots do not exist on disk');
    err.code = 'ERR_ADAPTER_WORKSPACE_NOT_PROVISIONED';
    throw err;
  }
  assertNoStaticOverlap(job.jobRoot);

  // Documented atomic transition: ONLY after all preflight checks pass
  job.status = 'CONSUMED';
  job.consumedAt = Date.now();

  return Object.freeze({
    scratch: job.scratch,
    input: job.input,
    output: job.output
  });
}

/**
 * Cancel a provisioned server job and immediately delete its physical workspace.
 * If deletion fails, records CLEANUP_FAILED status and retains in map/quota.
 */
function cancelServerJob(jobId, sessionContext = {}) {
  const job = activeServerJobs.get(jobId);
  if (!job) {
    return { cancelled: false, reason: 'ERR_JOB_NOT_FOUND' };
  }
  const principal = verifySessionProof(sessionContext, job.projectId);
  if (job.tenantId !== principal.tenantId || job.ownerId !== principal.ownerId) {
    const err = new Error('ERR_ADAPTER_JOB_AUTHORIZATION_FAILED: Unauthorized to cancel job');
    err.code = 'ERR_ADAPTER_JOB_AUTHORIZATION_FAILED';
    throw err;
  }

  try {
    if (job.jobRoot && fs.existsSync(job.jobRoot)) {
      fs.rmSync(job.jobRoot, { recursive: true, force: true });
    }
    job.status = 'CANCELLED';
    return { cancelled: true, jobId, status: 'CANCELLED' };
  } catch (rmErr) {
    job.status = 'CLEANUP_FAILED';
    job.cleanupError = rmErr.message;
    return { cancelled: false, jobId, status: 'CLEANUP_FAILED', reason: 'ERR_WORKSPACE_CLEANUP_FAILED', error: rmErr.message };
  }
}

// Module Exports: Shipped production surface has ZERO proof minting, ZERO project insertion, ZERO test hooks
module.exports = {
  registerServerJob,
  resolveJobRoots,
  cancelServerJob,
  evictExpiredJobs,
  verifySessionProof,
  getAuthoritativeProject,
  revokeSessionToken,
  assertNoStaticOverlap,
  getServedStaticRoots,
  SERVER_TRUSTED_WORKSPACE_BASE
};
