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
    path.join(projectRoot, 'client', 'diagnostics'),
    path.join(projectRoot, 'client', 'vendor'),
    path.join(projectRoot, 'assets'),
    path.join(projectRoot, 'assets', 'demo'),
    path.join(projectRoot, 'assets', 'demo', 'wilo'),
    path.join(projectRoot, 'assets', 'demo', 'wilo', 'models'),
    path.join(projectRoot, 'uploads'),
    path.join(projectRoot, '_clean_deploy'),
    path.join(projectRoot, '_clean_deploy', 'client'),
    path.join(projectRoot, '_clean_deploy', 'client', 'assets'),
    path.join(projectRoot, '_railway_deploy'),
    path.join(projectRoot, '_railway_deploy', 'client'),
    path.join(projectRoot, '_railway_deploy', 'client', 'assets'),
    path.join(projectRoot, 'app_build'),
    path.join(projectRoot, 'app_build', 'client'),
    path.join(projectRoot, 'app_build', 'client', 'assets'),
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

function isProcessAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0 || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function fsyncDirectorySafe(dirPath) {
  try {
    const fd = fs.openSync(dirPath, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    // Directory fsync is not supported or permitted on all filesystems/OSes (e.g. Windows)
  }
}

/**
 * Cross-Process Ownership-Aware Advisory Lock Utility (Round 44 P0-2)
 * Synchronizes atomic write/read operations across multiple Node processes.
 * Enforces ownership-aware liveness checks (isProcessAlive) to prevent lock-stealing
 * from active processes, and safe ownership verification before unlinking.
 */
function withStoreLock(lockFilePath, actionFn, options = {}) {
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });
  const maxRetries = options.maxRetries || 250;
  const retryDelayMs = options.retryDelayMs || 20;
  const staleTimeoutMs = options.staleTimeoutMs || (process.env.STAGE2_LOCK_STALE_MS ? parseInt(process.env.STAGE2_LOCK_STALE_MS, 10) : 10000);
  let lockFd = null;
  let lockToken = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      lockFd = fs.openSync(lockFilePath, 'wx');
      lockToken = `${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const meta = JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        fencingToken: lockToken,
        host: os.hostname()
      });
      fs.writeFileSync(lockFd, meta, 'utf8');
      fs.fsyncSync(lockFd);
      break;
    } catch (err) {
      if (err.code === 'EEXIST') {
        let isOwnerDead = false;
        try {
          const content = fs.readFileSync(lockFilePath, 'utf8');
          const meta = JSON.parse(content);
          if (meta && typeof meta.pid === 'number') {
            if (meta.host && meta.host !== os.hostname()) {
              // Remote host / replica lock: PID liveness is namespace-local; NEVER unlink another host's lock!
              isOwnerDead = false;
            } else if (!isProcessAlive(meta.pid)) {
              // Same host verified dead process -> safe to reclaim crashed lock
              isOwnerDead = true;
            } else {
              // Living owner: NEVER unlink or steal lock, preserve mutual exclusion!
              isOwnerDead = false;
            }
          }
        } catch (_) {
          // If lock metadata is unreadable or corrupt, DO NOT delete based solely on age!
          // A live process might be in the middle of atomic write. Fail closed / retry until timeout.
        }

        if (isOwnerDead) {
          try { fs.unlinkSync(lockFilePath); } catch (_) {}
        }

        const start = Date.now();
        while (Date.now() - start < retryDelayMs) {}
        continue;
      }
      throw err;
    }
  }

  if (lockFd === null) {
    const err = new Error(`ERR_STORE_LOCK_TIMEOUT: Timed out waiting for store lock: ${lockFilePath}`);
    err.code = 'ERR_STORE_LOCK_TIMEOUT';
    throw err;
  }

  try {
    return actionFn(lockToken);
  } finally {
    try { fs.closeSync(lockFd); } catch (_) {}
    try {
      const currentContent = fs.readFileSync(lockFilePath, 'utf8');
      const currentMeta = JSON.parse(currentContent);
      if (currentMeta && currentMeta.fencingToken === lockToken && currentMeta.pid === process.pid) {
        fs.unlinkSync(lockFilePath);
      }
    } catch (_) {}
  }
}

/**
 * Server-Side Session Revocation Registry (Durable File-Backed Store with Fail-Closed I/O)
 * Survives process restarts and propagates atomically across independent processes.
 */
const DURABLE_AUTH_DIR = process.env.STAGE2_AUTH_STORE_DIR
  ? path.resolve(process.env.STAGE2_AUTH_STORE_DIR)
  : path.resolve(os.tmpdir(), 'vshow_stage2_auth_store');
const REVOCATION_FILE = path.join(DURABLE_AUTH_DIR, 'revoked_tokens.json');
const REVOCATION_LOCK_FILE = path.join(DURABLE_AUTH_DIR, 'revoked_tokens.lock');

const revokedSessionTokens = new Set();

function getRevokedTokensFromFile() {
  if (!fs.existsSync(REVOCATION_FILE)) {
    return new Set();
  }
  let raw;
  try {
    raw = fs.readFileSync(REVOCATION_FILE, 'utf8');
  } catch (readErr) {
    const err = new Error(`ERR_REVOCATION_STORE_UNAVAILABLE: Failed to read revocation store: ${readErr.message}`);
    err.code = 'ERR_REVOCATION_STORE_UNAVAILABLE';
    throw err;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (jsonErr) {
    const err = new Error(`ERR_REVOCATION_STORE_CORRUPTED: Revocation store corrupted JSON: ${jsonErr.message}`);
    err.code = 'ERR_REVOCATION_STORE_CORRUPTED';
    throw err;
  }
  if (!Array.isArray(data)) {
    const err = new Error('ERR_REVOCATION_STORE_CORRUPTED: Revocation store data must be a JSON array');
    err.code = 'ERR_REVOCATION_STORE_CORRUPTED';
    throw err;
  }
  return new Set(data);
}

function persistRevokedTokens(set) {
  fs.mkdirSync(DURABLE_AUTH_DIR, { recursive: true });
  const tmpFile = path.join(DURABLE_AUTH_DIR, `revoked_${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.tmp`);
  const payload = JSON.stringify(Array.from(set));
  let fd = null;
  try {
    fd = fs.openSync(tmpFile, 'w');
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpFile, REVOCATION_FILE);
    fsyncDirectorySafe(DURABLE_AUTH_DIR);
  } catch (writeErr) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const err = new Error(`ERR_REVOCATION_STORE_WRITE_FAILED: Failed to persist revocation store: ${writeErr.message}`);
    err.code = 'ERR_REVOCATION_STORE_WRITE_FAILED';
    throw err;
  }
}

function revokeSessionToken(sessionTokenHash) {
  if (!sessionTokenHash || typeof sessionTokenHash !== 'string') {
    const err = new Error('ERR_REVOCATION_INVALID_TOKEN: sessionTokenHash must be a non-empty string');
    err.code = 'ERR_REVOCATION_INVALID_TOKEN';
    throw err;
  }
  withStoreLock(REVOCATION_LOCK_FILE, () => {
    const diskSet = getRevokedTokensFromFile();
    diskSet.add(sessionTokenHash);
    persistRevokedTokens(diskSet);
    revokedSessionTokens.add(sessionTokenHash);
  });
  return true;
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
 * Fails closed with ERR_REVOCATION_STORE_UNAVAILABLE or ERR_REVOCATION_STORE_CORRUPTED if store unreadable.
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

  // Revocation status check: FAIL-CLOSED on store unavailability or corruption
  let revoked = false;
  try {
    revoked = isSessionRevoked(sessionTokenHash);
  } catch (revErr) {
    const err = new Error(`ERR_REVOCATION_STORE_UNAVAILABLE: Revocation status cannot be verified due to store failure: ${revErr.message}`);
    err.code = revErr.code || 'ERR_REVOCATION_STORE_UNAVAILABLE';
    throw err;
  }

  if (revoked) {
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

// Authoritative Server-Side Project Storage (Pre-configured Authoritative Registry with Owner Entitlement Memberships)
// Maps projectId -> { projectId, tenantId, ownerMembers, title }
const AUTHORITATIVE_PROJECTS = new Map([
  ['project_true3d_beta', {
    projectId: 'project_true3d_beta',
    tenantId: 'tenant_commercial_alpha',
    ownerMembers: new Set(['owner_operator_gamma']),
    title: 'Wilo True3D Beta'
  }],
  ['project_same_tenant_other', {
    projectId: 'project_same_tenant_other',
    tenantId: 'tenant_commercial_alpha',
    ownerMembers: new Set(['owner_operator_gamma']),
    title: 'Same Tenant Other Project'
  }],
  ['project_foreign_tenant', {
    projectId: 'project_foreign_tenant',
    tenantId: 'other_tenant_id',
    ownerMembers: new Set(['owner_operator_gamma', 'foreign_owner']),
    title: 'Foreign Project'
  }],
  ['project_client_mount', {
    projectId: 'project_client_mount',
    tenantId: 'client',
    ownerMembers: new Set(['owner_operator_gamma', 'client_owner']),
    title: 'Client Mount Project'
  }],
  ['org-wilo-golden-demo', {
    projectId: 'org-wilo-golden-demo',
    tenantId: 'org-wilo-golden-demo',
    ownerMembers: new Set(['owner_operator_gamma']),
    title: 'Wilo Golden Demo'
  }],
  ['booth-wilo-golden-demo', {
    projectId: 'booth-wilo-golden-demo',
    tenantId: 'org-wilo-golden-demo',
    ownerMembers: new Set(['owner_operator_gamma']),
    title: 'Wilo Booth'
  }]
]);

function getAuthoritativeProject(projectId) {
  return AUTHORITATIVE_PROJECTS.get(projectId) || null;
}

// Closure-Private Multi-Process Durable Server Jobs Ledger
const JOB_LEDGER_FILE = path.join(DURABLE_AUTH_DIR, 'server_jobs_ledger.json');
const JOB_LOCK_FILE = path.join(DURABLE_AUTH_DIR, 'server_jobs_ledger.lock');
const LEDGER_INITIALIZED_SENTINEL = path.join(DURABLE_AUTH_DIR, '.ledger_initialized');

const activeServerJobs = new Map();
const MAX_CONCURRENT_JOBS = 100;
const MAX_JOB_LIFETIME_MS = 3600000; // 1 hour

function loadJobLedgerFromDisk() {
  if (!fs.existsSync(JOB_LEDGER_FILE)) {
    if (fs.existsSync(LEDGER_INITIALIZED_SENTINEL)) {
      const err = new Error('ERR_JOB_LEDGER_UNEXPECTEDLY_MISSING: Previously initialized job ledger is missing from disk');
      err.code = 'ERR_JOB_LEDGER_UNEXPECTEDLY_MISSING';
      throw err;
    }
    return new Map();
  }
  let raw;
  try {
    raw = fs.readFileSync(JOB_LEDGER_FILE, 'utf8');
  } catch (readErr) {
    const err = new Error(`ERR_JOB_LEDGER_UNAVAILABLE: Failed to read job ledger: ${readErr.message}`);
    err.code = 'ERR_JOB_LEDGER_UNAVAILABLE';
    throw err;
  }
  let list;
  try {
    list = JSON.parse(raw);
  } catch (jsonErr) {
    const err = new Error(`ERR_JOB_LEDGER_CORRUPTED: Job ledger corrupted JSON: ${jsonErr.message}`);
    err.code = 'ERR_JOB_LEDGER_CORRUPTED';
    throw err;
  }
  if (!Array.isArray(list)) {
    const err = new Error('ERR_JOB_LEDGER_CORRUPTED: Job ledger data must be a JSON array');
    err.code = 'ERR_JOB_LEDGER_CORRUPTED';
    throw err;
  }
  const map = new Map();
  for (const item of list) {
    if (item && item.jobId) {
      if (item.expiresAt === 'INFINITY' || item.quarantined === true || item.status === 'ORPHANED_WORKSPACE') {
        item.expiresAt = Infinity;
      }
      map.set(item.jobId, item);
    }
  }
  return map;
}

function persistJobLedgerToDisk(jobMap) {
  fs.mkdirSync(DURABLE_AUTH_DIR, { recursive: true });
  const tmpFile = path.join(DURABLE_AUTH_DIR, `job_ledger_${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.tmp`);
  const serialized = Array.from(jobMap.values()).map(job => {
    if (job && job.expiresAt === Infinity) {
      return { ...job, expiresAt: 'INFINITY' };
    }
    return job;
  });
  const payload = JSON.stringify(serialized);
  let fd = null;
  try {
    fd = fs.openSync(tmpFile, 'w');
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpFile, JOB_LEDGER_FILE);
    if (!fs.existsSync(LEDGER_INITIALIZED_SENTINEL)) {
      fs.writeFileSync(LEDGER_INITIALIZED_SENTINEL, JSON.stringify({ initializedAt: Date.now() }), 'utf8');
    }
    fsyncDirectorySafe(DURABLE_AUTH_DIR);
  } catch (writeErr) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    const err = new Error(`ERR_JOB_LEDGER_WRITE_FAILED: Failed to persist job ledger: ${writeErr.message}`);
    err.code = 'ERR_JOB_LEDGER_WRITE_FAILED';
    throw err;
  }
}

function syncActiveJobsFromLedger() {
  const diskMap = loadJobLedgerFromDisk();
  activeServerJobs.clear();
  for (const [id, job] of diskMap.entries()) {
    activeServerJobs.set(id, job);
  }
  return activeServerJobs;
}

/**
 * Orphan Workspace Reconciliation (Round 44/45 P0-1)
 * Scans physical workspace roots under SERVER_TRUSTED_WORKSPACE_BASE.
 * Reconciles untracked directories left behind by crashed/interrupted processes
 * into activeServerJobs under status ORPHANED_WORKSPACE so that physical directories
 * are strictly accounted in concurrent job quotas and cannot bypass capacity gates.
 *
 * NON-DESTRUCTIVE QUARANTINE UNDER HOLD:
 * Zero delete rights are inferred from directory age. Quarantined indefinitely.
 * Throws ERR_WORKSPACE_SCAN_FAILED on unreadable roots.
 * Rejects symlinks/junctions with ERR_TRUSTED_ROOT_SYMLINK_FORBIDDEN.
 * Transactionally persists quarantined entries to disk ledger.
 */
function reconcileOrphanWorkspaces() {
  if (!fs.existsSync(SERVER_TRUSTED_WORKSPACE_BASE)) {
    return { reconciled: 0, orphansFound: 0 };
  }
  let orphansFound = 0;
  let reconciled = 0;
  let ledgerChanged = false;

  let tenants;
  try {
    tenants = fs.readdirSync(SERVER_TRUSTED_WORKSPACE_BASE);
  } catch (readDirErr) {
    const err = new Error(`ERR_WORKSPACE_SCAN_FAILED: Failed to scan trusted workspace base: ${readDirErr.message}`);
    err.code = 'ERR_WORKSPACE_SCAN_FAILED';
    throw err;
  }

  for (const tenant of tenants) {
    const tenantDir = path.join(SERVER_TRUSTED_WORKSPACE_BASE, tenant);
    let stat;
    try {
      stat = fs.lstatSync(tenantDir);
    } catch (statErr) {
      const err = new Error(`ERR_WORKSPACE_SCAN_FAILED: Failed to stat tenant directory: ${statErr.message}`);
      err.code = 'ERR_WORKSPACE_SCAN_FAILED';
      throw err;
    }
    if (stat.isSymbolicLink()) {
      const err = new Error(`ERR_TRUSTED_ROOT_SYMLINK_FORBIDDEN: Tenant directory "${tenantDir}" is a symlink or junction`);
      err.code = 'ERR_TRUSTED_ROOT_SYMLINK_FORBIDDEN';
      throw err;
    }
    if (!stat.isDirectory()) continue;

    let entries;
    try {
      entries = fs.readdirSync(tenantDir);
    } catch (readEntErr) {
      const err = new Error(`ERR_WORKSPACE_SCAN_FAILED: Failed to read tenant directory: ${readEntErr.message}`);
      err.code = 'ERR_WORKSPACE_SCAN_FAILED';
      throw err;
    }

    for (const entry of entries) {
      if (!entry.startsWith('job_')) continue;
      const jobDir = path.join(tenantDir, entry);
      let jStat;
      try {
        jStat = fs.lstatSync(jobDir);
      } catch (jStatErr) {
        const err = new Error(`ERR_WORKSPACE_SCAN_FAILED: Failed to stat workspace directory: ${jStatErr.message}`);
        err.code = 'ERR_WORKSPACE_SCAN_FAILED';
        throw err;
      }
      if (jStat.isSymbolicLink()) {
        const err = new Error(`ERR_TRUSTED_ROOT_SYMLINK_FORBIDDEN: Job directory "${jobDir}" is a symlink or junction`);
        err.code = 'ERR_TRUSTED_ROOT_SYMLINK_FORBIDDEN';
        throw err;
      }
      if (!jStat.isDirectory()) continue;

      if (!activeServerJobs.has(entry)) {
        orphansFound++;
        activeServerJobs.set(entry, {
          jobId: entry,
          tenantId: tenant,
          projectId: 'untracked_orphan_quarantined',
          ownerId: 'untracked_orphan_quarantined',
          sessionTokenHash: 'untracked_orphan_quarantined',
          status: 'ORPHANED_WORKSPACE',
          quarantined: true,
          quarantinedAt: Date.now(),
          jobRoot: jobDir,
          scratch: path.join(jobDir, 'scratch'),
          input: path.join(jobDir, 'input'),
          output: path.join(jobDir, 'output'),
          provisionedAt: jStat.birthtimeMs || jStat.mtimeMs || Date.now(),
          expiresAt: Infinity // Permanent quarantine under HOLD: zero auto-deletion rights!
        });
        reconciled++;
        ledgerChanged = true;
      }
    }
  }

  if (ledgerChanged) {
    persistJobLedgerToDisk(activeServerJobs);
  }

  return { reconciled, orphansFound };
}

// Initial sync on module startup (suppressed at boot so require succeeds; fail-closed on first runtime operation)
try {
  syncActiveJobsFromLedger();
} catch (_) {}

/**
 * Active eviction of expired and terminal entries.
 * Cleans physical workspace directories upon eviction.
 * Retains jobs in CLEANUP_FAILED status to account for orphaned storage until safe reclaim.
 * NON-DESTRUCTIVE: ORPHANED_WORKSPACE entries are strictly quarantined and NEVER auto-evicted!
 * Fails closed if persisting updated ledger to disk fails.
 */
function evictExpiredJobs() {
  const now = Date.now();
  let evicted = 0;
  let ledgerChanged = false;

  for (const [id, job] of activeServerJobs.entries()) {
    if (job.status === 'CLEANUP_FAILED' || job.status === 'ORPHANED_WORKSPACE') {
      continue; // Strictly preserve quarantined holds under HOLD
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
        ledgerChanged = true;
      }
      if (cleanupOk) {
        activeServerJobs.delete(id);
        evicted++;
        ledgerChanged = true;
      }
    }
  }
  if (ledgerChanged) {
    persistJobLedgerToDisk(activeServerJobs);
  }
  return evicted;
}

/**
 * Register a reconstruction job under authenticated server custody.
 * Requires cryptographically verified sessionProof bound to the exact projectId,
 * project resolution from authoritative storage, and owner entitlement verification.
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

  if (project.ownerMembers && !project.ownerMembers.has(principal.ownerId)) {
    const err = new Error(`ERR_REGISTRY_OWNER_NOT_ENTITLED: Owner "${principal.ownerId}" is not authorized on project "${projectId}"`);
    err.code = 'ERR_REGISTRY_OWNER_NOT_ENTITLED';
    throw err;
  }

  return withStoreLock(JOB_LOCK_FILE, () => {
    syncActiveJobsFromLedger();
    reconcileOrphanWorkspaces();
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
    persistJobLedgerToDisk(activeServerJobs);

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

  return withStoreLock(JOB_LOCK_FILE, () => {
    syncActiveJobsFromLedger();
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

    if (job.status === 'ORPHANED_WORKSPACE') {
      const err = new Error(`ERR_ADAPTER_JOB_QUARANTINED: Job "${jobId}" is an untracked orphaned workspace quarantined under HOLD`);
      err.code = 'ERR_ADAPTER_JOB_QUARANTINED';
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
    persistJobLedgerToDisk(activeServerJobs);

    return Object.freeze({
      scratch: job.scratch,
      input: job.input,
      output: job.output
    });
  });
}

/**
 * Cancel a provisioned server job and immediately delete its physical workspace.
 * If deletion fails, records CLEANUP_FAILED status and retains in map/quota.
 */
function cancelServerJob(jobId, sessionContext = {}) {
  return withStoreLock(JOB_LOCK_FILE, () => {
    syncActiveJobsFromLedger();
    const job = activeServerJobs.get(jobId);
    if (!job) {
      return { cancelled: false, reason: 'ERR_JOB_NOT_FOUND' };
    }
    if (job.status === 'ORPHANED_WORKSPACE') {
      const err = new Error(`ERR_ADAPTER_JOB_QUARANTINED: Quarantined orphan workspace "${jobId}" cannot be deleted without administrative reclaim authorization`);
      err.code = 'ERR_ADAPTER_JOB_QUARANTINED';
      throw err;
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
      persistJobLedgerToDisk(activeServerJobs);
      return { cancelled: true, jobId, status: 'CANCELLED' };
    } catch (rmErr) {
      job.status = 'CLEANUP_FAILED';
      job.cleanupError = rmErr.message;
      persistJobLedgerToDisk(activeServerJobs);
      return { cancelled: false, jobId, status: 'CLEANUP_FAILED', reason: 'ERR_WORKSPACE_CLEANUP_FAILED', error: rmErr.message };
    }
  });
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
  isSessionRevoked,
  assertNoStaticOverlap,
  getServedStaticRoots,
  SERVER_TRUSTED_WORKSPACE_BASE,
  reconcileOrphanWorkspaces,
  withStoreLock,
  isProcessAlive,
  loadJobLedgerFromDisk,
  syncActiveJobsFromLedger,
  JOB_LEDGER_FILE,
  JOB_LOCK_FILE,
  LEDGER_INITIALIZED_SENTINEL
};
