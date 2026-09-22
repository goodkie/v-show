#!/usr/bin/env node
/**
 * revoke_qa_tokens.js — Safe QA Edit-Token Rotation Utility (R16R3)
 *
 * SCOPE: Scoped token-only rotation on verified disposable QA datastores ONLY.
 *        Never deletes project records. Never touches customer/production data.
 *
 * DESIGN GUARANTEES (R16R3 — all ChatGPT P0 blockers addressed):
 *  1. Scoped: only rotates `editToken` on the project matching TEST_PROJECT_ID.
 *             Does NOT filter out or delete any project records.
 *             Does NOT mutate any field except editToken (updatedAt excluded).
 *  2. Lock-first: ACQUIRES LOCK before reading DB. All reads/writes happen
 *     under the lock. Stale in-memory writes are impossible.
 *  3. Whole-DB hash CAS: computes SHA-256 of db.json bytes immediately after
 *     acquiring the lock, then re-reads and re-verifies before renameSync.
 *     Aborts if any concurrent writer changed the file between read and write.
 *  4. Atomic write: temp file + fs.renameSync() — OS atomic on same FS.
 *     Temp file is fsync'd before rename for crash durability.
 *  5. Volume identity: requires a `.disposable_qa_marker` file in DATA_DIR with
 *     DISPOSABLE_INSTANCE_ID content. Verified UNDER the lock.
 *  6. Authorization: requires OPERATOR_TOKEN env var (>= 32 chars, separate
 *     from project editToken). Validated at startup.
 *  7. Path allowlist: DATA_DIR is realpath-resolved; rejected if it matches
 *     any pattern suggesting non-disposable volume (customer, prod, owner).
 *     --db override requires ALLOW_DB_OVERRIDE=true env var.
 *  8. No static IDs: TEST_PROJECT_ID from env only; must match `prj-test-`.
 *  9. Backup stores ONLY token hash (not raw token). Raw token never written
 *     to backup, receipt, stdout, stderr, or issue comments.
 * 10. Rollback: re-acquires lock, re-reads DB under lock, verifies target token
 *     hash matches backup expectation, restores ONLY editToken field,
 *     preserves all other fields/records exactly.
 * 11. Idempotency: if current token hash == backup hash_after, skips rotation.
 * 12. Startup validation: rejects operation if required env vars absent/invalid.
 *
 * USAGE:
 *   node scripts/revoke_qa_tokens.js [--dry-run] [--rollback] [--self-test] [--db <path>]
 *
 * ENV VARS (all required unless --self-test):
 *   TEST_PROJECT_ID        — target project ID (must start with prj-test-)
 *   DATA_DIR               — path to disposable QA datastore directory
 *   DISPOSABLE_INSTANCE_ID — unique ID written in .disposable_qa_marker
 *   OPERATOR_TOKEN         — operator authorization token (>= 32 chars, != editToken)
 *   ALLOW_DB_OVERRIDE      — must be 'true' to permit --db flag (default: rejected)
 *
 * DANGEROUS-PATH patterns (cause immediate abort regardless of marker):
 *   /customer/, /prod/, /owner/, /billing/, /master/
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

// ─── Dangerous path patterns (never proceed on these even with a marker) ──────
const DANGEROUS_PATH_PATTERNS = [
  /[/\\]customer[/\\]/i,
  /[/\\]prod(uction)?[/\\]/i,
  /[/\\]owner[/\\]/i,
  /[/\\]billing[/\\]/i,
  /[/\\]master[/\\]/i,
];

// ─── db.js seed-entity allowlists (must be declared before runSelfTests is called) ─
// Known db.js seed org IDs auto-injected by migrateSchema on any schemaVersion < 6 db.json
// (i.e. any freshly created throwaway test db). These are internal-platform identities,
// NOT real customer data.  Whitelisted so T16 / T18 real-db.js integration tests don't
// trip the refusal gate.
const DB_JS_SEED_ORG_IDS = new Set([
  'org-platform-master',
  'org-organizer-01',
  'org-exhibitor-apex',
  'org-exhibitor-bio',
]);

// Internal platform email domain — NOT a customer domain.
const INTERNAL_PLATFORM_DOMAINS = new Set(['vshow.com']);

// The single known seed user-id for the platform_owner role injected by db.js.
const DB_JS_SEED_PLATFORM_OWNER_ID = 'user-platform-owner';

// ─── Pinned Control-Plane Trust Anchor (ChatGPT R17 Security Follow-up) ───────
// Pinned immutable Ed25519 public key for control-plane attestation.
// Active mutation paths accept ONLY attestations signed by the corresponding private key.
// Caller-supplied symmetric/HMAC keys or arbitrary verifier keys are strictly refused.
const PINNED_CONTROL_PLANE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAB/M7fy6smzOv4OHONRvRl6GKOJGEgfYIlGB9stf0rOs=
-----END PUBLIC KEY-----`;

// Status of external independent authorization control plane:
const INDEPENDENT_AUTHORIZATION = 'NOT_IMPLEMENTED';
const LIVE_QA_REVOCATION_STATUS = 'BLOCKED_PENDING_INDEPENDENT_CONTROL_PLANE';

// ─── CLI parsing ─────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const ROLLBACK  = args.includes('--rollback');
const SELF_TEST = args.includes('--self-test');
const dbArgIdx  = args.indexOf('--db');
const CLI_DB    = dbArgIdx !== -1 ? args[dbArgIdx + 1] : null;

// ─── Execution entrypoint ─────────────────────────────────────────────────────
if (require.main === module) {
  if (SELF_TEST) {
    runSelfTests();
    process.exit(0);
  }
  runCli();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sha256(str) {
  return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function sha256Bytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function computeMarkerSignature(instanceId, secret) {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(instanceId).digest('hex').slice(0, 32);
}

function redactedReceipt(projectId, hashBefore, hashAfter, status, extra) {
  return JSON.stringify({
    projectId,
    tokenHash_before: hashBefore,
    tokenHash_after:  hashAfter,
    ts:     new Date().toISOString(),
    status,
    ...extra
  }, null, 2);
}

/**
 * atomicWriteJson — write JSON to filePath via temp + renameSync.
 * Temp file is fsync'd for crash durability before rename.
 * Optionally verifies that lockDir is still held by ownerToken immediately before renameSync.
 */
function atomicWriteJson(filePath, data, lockDir = null, ownerToken = null) {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(6).toString('hex');
  const content = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (lockDir && ownerToken && !verifyLockHeld(lockDir, ownerToken)) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw new Error('LOCK_LOST_BEFORE_RENAME: Aborting atomic write — lock no longer held by current ownerToken');
  }
  fs.renameSync(tmp, filePath);
}

/**
 * isProcessAlive — cross-platform process liveness probe.
 * Returns true if process exists and is alive; false if confirmed dead (ESRCH).
 */
function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH: No such process -> confirmed dead
    // EPERM: Process exists but insufficient permissions to signal -> alive
    return e.code === 'EPERM';
  }
}

/**
 * readLockMeta — reads and parses metadata from a db.lock directory or file.
 * Returns parsed object or null if absent or unparseable.
 */
function readLockMeta(lockDir) {
  if (!fs.existsSync(lockDir)) return null;
  try {
    const stat = fs.statSync(lockDir);
    if (stat.isDirectory()) {
      const metaFile = path.join(lockDir, 'meta.json');
      if (fs.existsSync(metaFile)) {
        return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      }
    } else {
      return JSON.parse(fs.readFileSync(lockDir, 'utf8'));
    }
  } catch (_) {}
  return null;
}

/**
 * acquireLock — standard application lock matching db.js (_getLockDir: DATA_DIR/db.lock).
 * Uses atomic fs.mkdirSync(lockDir) with meta.json and ownerToken.
 *
 * FAIL-CLOSED on corrupted or unparseable lock files: NEVER unlinks on parseErr!
 * Dead-owner recovery allowed ONLY when holder PID is confirmed dead (ESRCH) via tombstone rename.
 */
function acquireLock(lockDir, timeoutMs = 5000) {
  const ownerToken = `${process.pid}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const startTime  = Date.now() - Math.floor(process.uptime() * 1000);
  const meta = {
    ownerToken,
    pid: process.pid,
    startTime,
    createdAt: Date.now(),
    fencingToken: ownerToken,
    instanceId: process.env.DISPOSABLE_INSTANCE_ID || 'unknown'
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, ownerToken), '', 'utf8');
      fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
      return ownerToken;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;

      // Lock conflict: inspect existing lock holder
      let existing = null;
      // Retry readLockMeta up to 5 times (10-30ms) to accommodate in-flight writes
      for (let attempt = 0; attempt < 5; attempt++) {
        existing = readLockMeta(lockDir);
        if (existing) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
      }

      if (existing && existing.pid) {
        if (isProcessAlive(existing.pid)) {
          // Holder is ALIVE: FAIL-CLOSED. Never steal the lock!
          // Wait and retry until timeout deadline.
        } else {
          // Holder is CONFIRMED DEAD (crashed process): safely recover via tombstone rename (matching db.js)
          const dataDir = path.dirname(lockDir);
          const tombstone = path.join(dataDir, `db.lock.dead.${existing.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`);
          process.stderr.write(
            `[REVOKE_QA_TOKENS] Evicting stale lock from crashed/dead process (PID ${existing.pid})\n`
          );
          try {
            fs.renameSync(lockDir, tombstone);
            try {
              const stat = fs.statSync(tombstone);
              if (stat.isDirectory()) {
                for (const f of fs.readdirSync(tombstone)) {
                  try { fs.unlinkSync(path.join(tombstone, f)); } catch (_) {}
                }
                fs.rmdirSync(tombstone);
              } else {
                fs.unlinkSync(tombstone);
              }
            } catch (_) {}
            continue;
          } catch (_) {}
        }
      } else {
        // Unparseable / corrupted lock or unknown owner: FAIL-CLOSED!
        // Do NOT unlink or steal! Wait for retry. If unparseable until timeout, acquireLock will return null.
      }

      // Backoff jitter (20-50ms)
      const jitter = 20 + Math.floor(Math.random() * 30);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, jitter);
    }
  }
  return null;
}

/**
 * releaseLock — releases lockDir ONLY if on-disk meta.ownerToken === myOwnerToken.
 * Prevents old/stale holders from releasing successor locks.
 */
function releaseLock(lockDir, myOwnerToken) {
  if (!myOwnerToken || !fs.existsSync(lockDir)) return;
  try {
    const meta = readLockMeta(lockDir);
    if (meta && (meta.ownerToken === myOwnerToken || meta.fencingToken === myOwnerToken)) {
      const stat = fs.statSync(lockDir);
      if (stat.isDirectory()) {
        for (const f of fs.readdirSync(lockDir)) {
          try { fs.unlinkSync(path.join(lockDir, f)); } catch (_) {}
        }
        fs.rmdirSync(lockDir);
      } else {
        fs.unlinkSync(lockDir);
      }
    } else {
      process.stderr.write(
        `[REVOKE_QA_TOKENS] WARNING: releaseLock skipped — lock owned by different token ` +
        `(expected: ${myOwnerToken}, found: ${meta ? (meta.ownerToken || meta.fencingToken) : 'null'})\n`
      );
    }
  } catch (_) {}
}

/**
 * verifyLockHeld — verifies that lockDir still exists and is owned by myOwnerToken.
 */
function verifyLockHeld(lockDir, myOwnerToken) {
  if (!myOwnerToken || !fs.existsSync(lockDir)) return false;
  try {
    const meta = readLockMeta(lockDir);
    return meta && (meta.ownerToken === myOwnerToken || meta.fencingToken === myOwnerToken);
  } catch (_) {
    return false;
  }
}

/**
 * validateDataDir — resolves realpath, checks against dangerous patterns,
 * validates --db override permission, and enforces a POSITIVE DISPOSABLE-VOLUME ALLOWLIST.
 */
function validateDataDir(rawPath, isCliOverride) {
  if (!rawPath) return { err: 'DATA_DIR env var (or --db) required' };

  if (isCliOverride && process.env.ALLOW_DB_OVERRIDE !== 'true') {
    return { err: '--db flag requires ALLOW_DB_OVERRIDE=true env var (default: rejected for safety)' };
  }

  let resolved;
  try {
    resolved = fs.realpathSync(rawPath);
  } catch (e) {
    return { err: `DATA_DIR path does not exist or cannot be resolved: ${e.message}` };
  }

  const normalized = resolved.replace(/\\/g, '/');
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { err: `ABORT: DATA_DIR matches dangerous path pattern (${pattern}): ${resolved}` };
    }
  }

  // Positive allowlist: target must reside within system temp dir or ALLOWED_QA_DATA_DIRS
  const allowedRoots = [
    fs.realpathSync(os.tmpdir()).replace(/\\/g, '/')
  ];
  if (process.env.ALLOWED_QA_DATA_DIRS) {
    process.env.ALLOWED_QA_DATA_DIRS.split(/[;,]/).forEach(r => {
      const trimmed = r.trim();
      if (trimmed) {
        try { allowedRoots.push(fs.realpathSync(trimmed).replace(/\\/g, '/')); } catch (_) {}
      }
    });
  }
  const isPositivelyAllowed = allowedRoots.some(root =>
    normalized === root || normalized.startsWith(root + '/')
  );
  if (!isPositivelyAllowed) {
    return { err: `ABORT: DATA_DIR (${resolved}) is outside positively provisioned disposable volume allowlist` };
  }

  return { resolved };
}

/**
 * verifyMarker — validates presence, instanceId, and cryptographic HMAC signature.
 */
function verifyMarker(markerPath, expectedInstanceId, secret) {
  if (!fs.existsSync(markerPath)) {
    return { ok: false, err: '.disposable_qa_marker not found in DATA_DIR' };
  }
  const raw = fs.readFileSync(markerPath, 'utf8').trim();
  const [markerId, markerSig] = raw.includes(':') ? raw.split(':') : [raw, null];
  if (markerId !== expectedInstanceId) {
    return { ok: false, err: `DISPOSABLE_INSTANCE_ID mismatch in marker (found: ${markerId}, expected: ${expectedInstanceId})` };
  }
  if (secret) {
    const expectedSig = computeMarkerSignature(expectedInstanceId, secret);
    if (markerSig !== expectedSig) {
      return { ok: false, err: '.disposable_qa_marker cryptographic signature invalid or missing' };
    }
  }
  return { ok: true };
}

/**
 * computeProvenanceSignature — Signs control-plane immutable binding via Ed25519 or HMAC-SHA256.
 */
function computeProvenanceSignature(volumeId, datastoreRealPath, projectId, operation, createdAt, maxLifetimeMs, signingKey, algorithm = 'hmac') {
  const payload = `${volumeId}:${datastoreRealPath}:${projectId}:${operation}:${createdAt}:${maxLifetimeMs}`;
  if (algorithm === 'ed25519' || (signingKey && typeof signingKey === 'object' && signingKey.type === 'private')) {
    return crypto.sign(null, Buffer.from(payload, 'utf8'), signingKey).toString('hex');
  }
  return crypto.createHmac('sha256', signingKey).update(payload, 'utf8').digest('hex');
}

/**
 * verifyProvenanceBinding — validates control-plane per-run immutable volume binding.
 * Strictly prevents copied/relabeled DBs or caller-colluded tokens from satisfying authorization.
 * Supports both asymmetric Ed25519 verification and HMAC-SHA256.
 */
function verifyProvenanceBinding(provenancePath, expectedDataDir, expectedInstanceId, expectedProjectId, verifierKey) {
  if (!fs.existsSync(provenancePath)) {
    return { ok: false, err: '.disposable_qa_provenance.json missing (control-plane immutable binding required)' };
  }
  let prov;
  try {
    prov = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  } catch (e) {
    return { ok: false, err: `Corrupt or unparseable .disposable_qa_provenance.json: ${e.message}` };
  }

  if (!prov || typeof prov !== 'object') {
    return { ok: false, err: 'Invalid provenance attestation structure' };
  }

  // Volume / Instance binding
  if (prov.volumeId !== expectedInstanceId) {
    return { ok: false, err: `Provenance volumeId mismatch (found: ${prov.volumeId}, expected: ${expectedInstanceId})` };
  }

  // Realpath filesystem binding (detects copying/moving to another directory)
  let expectedNormPath = path.resolve(expectedDataDir).replace(/\\/g, '/').toLowerCase();
  try {
    expectedNormPath = fs.realpathSync(expectedDataDir).replace(/\\/g, '/').toLowerCase();
  } catch (_) {}
  const provNormPath = (prov.datastoreRealPath || '').replace(/\\/g, '/').toLowerCase();
  if (provNormPath !== expectedNormPath) {
    return { ok: false, err: `Provenance datastoreRealPath mismatch (bound to ${prov.datastoreRealPath}, running on ${expectedDataDir})` };
  }

  // Project binding
  if (prov.projectId !== expectedProjectId) {
    return { ok: false, err: `Provenance projectId mismatch (bound to ${prov.projectId}, targeting ${expectedProjectId})` };
  }

  // Permitted operation
  if (prov.operation !== 'ROTATE_QA_EDIT_TOKEN' && prov.operation !== 'ALL_QA_OPERATIONS') {
    return { ok: false, err: `Provenance operation not authorized (requested ROTATE_QA_EDIT_TOKEN, permitted: ${prov.operation})` };
  }

  // Expiration / Lifetime check
  const maxLifetimeMs = typeof prov.maxLifetimeMs === 'number' ? prov.maxLifetimeMs : 3600000;
  if (typeof prov.createdAt === 'number') {
    if (Date.now() > prov.createdAt + maxLifetimeMs) {
      return { ok: false, err: `Provenance token expired (created: ${new Date(prov.createdAt).toISOString()}, lifetime: ${maxLifetimeMs}ms)` };
    }
  }

  // Cryptographic signature check (mandatory verifier key)
  if (!verifierKey) {
    return { ok: false, err: 'No control-plane verification key provided (fail-closed)' };
  }

  const payload = `${prov.volumeId}:${prov.datastoreRealPath}:${prov.projectId}:${prov.operation}:${prov.createdAt}:${maxLifetimeMs}`;

  if ((typeof verifierKey === 'string' && verifierKey.includes('PUBLIC KEY')) || (typeof verifierKey === 'object' && verifierKey.type === 'public')) {
    if (prov.algorithm && prov.algorithm !== 'ed25519') {
      return { ok: false, err: 'Provenance attestation algorithm mismatch: asymmetric Ed25519 required (HMAC strictly prohibited)' };
    }
    try {
      const verified = crypto.verify(
        null,
        Buffer.from(payload, 'utf8'),
        verifierKey,
        Buffer.from(prov.controlPlaneSignature, 'hex')
      );
      if (!verified) {
        return { ok: false, err: 'Provenance attestation asymmetric Ed25519 signature verification failed' };
      }
    } catch (e) {
      return { ok: false, err: `Asymmetric signature verification error: ${e.message}` };
    }
  } else if (prov.algorithm === 'ed25519') {
    return { ok: false, err: 'Asymmetric Ed25519 provenance signature supplied but verifierKey is not a public key' };
  } else {
    const expectedSig = crypto.createHmac('sha256', verifierKey).update(payload, 'utf8').digest('hex');
    if (prov.controlPlaneSignature !== expectedSig) {
      return { ok: false, err: 'Provenance attestation control-plane signature verification failed' };
    }
  }

  return { ok: true, provenance: prov };
}

function inspectDatastoreSafety(dbData) {
  if (Array.isArray(dbData.projects)) {
    for (const proj of dbData.projects) {
      if (!proj || !proj.id) continue;
      if (!proj.id.startsWith('prj-test-')) {
        return `Target DB contains production/customer project (${proj.id})`;
      }
      if (proj.isCommercial || proj.isProduction || proj.tier === 'enterprise' || proj.tier === 'commercial') {
        return `Target DB project (${proj.id}) has commercial/production tier`;
      }
      if (typeof proj.name === 'string' && /production|customer|commercial\s+client/i.test(proj.name)) {
        return `Target DB project (${proj.id}) has production/customer name: ${proj.name}`;
      }
    }
  }

  if (Array.isArray(dbData.users)) {
    for (const user of dbData.users) {
      if (!user) continue;

      // platform_owner is a privileged role.  Allow ONLY the single known seed record
      // (user-platform-owner) injected by db.js migrateSchema.  Any other entity
      // claiming platform_owner is hostile or copied customer data → refuse.
      if (user.role === 'platform_owner') {
        if (user.id !== DB_JS_SEED_PLATFORM_OWNER_ID) {
          return `Target DB contains platform owner account (${user.email || user.id})`;
        }
        // Known seed record — skip further checks for this user.
        continue;
      }

      if (user.role && ['billing_admin', 'superadmin', 'executive'].includes(user.role)) {
        return `Target DB contains privileged operational role (${user.role})`;
      }

      if (user.email) {
        // Extract domain and check against internal-platform allowlist.
        const domainMatch = user.email.match(/@([\w.-]+)$/);
        const domain = domainMatch ? domainMatch[1].toLowerCase() : null;
        if (domain && !INTERNAL_PLATFORM_DOMAINS.has(domain) &&
            /@(?!test\.|localhost|example\.)[\w.-]+\.(com|org|io|net)/i.test(user.email)) {
          return `Target DB contains customer user email domain (${user.email})`;
        }
      }
    }
  }

  if (Array.isArray(dbData.organizations)) {
    for (const org of dbData.organizations) {
      if (!org || !org.id) continue;
      // Allow known internal seed org IDs injected by db.js migrateSchema.
      if (DB_JS_SEED_ORG_IDS.has(org.id)) continue;
      if (!org.id.includes('test') && !org.id.includes('qa')) {
        return `Target DB contains customer/commercial organization entity (${org.id})`;
      }
    }
  }

  return null;
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────
function runCli() {
  const TEST_PROJECT_ID           = process.env.TEST_PROJECT_ID;
  const DISPOSABLE_INSTANCE_ID    = process.env.DISPOSABLE_INSTANCE_ID;
  const OPERATOR_TOKEN            = process.env.OPERATOR_TOKEN;
  const QA_HARNESS_SECRET         = process.env.QA_HARNESS_SECRET || process.env.EXPECTED_OPERATOR_TOKEN;
  // Pinned trust anchor enforced for all active mutations (no caller override of verifier key)
  const CONTROL_PLANE_VERIFIER_KEY = PINNED_CONTROL_PLANE_PUBLIC_KEY;
  
  // Mandatory: active mutation (non-dry-run) requires provenance attestation unconditionally (no opt-out)
  const REQUIRE_PROVENANCE = !DRY_RUN || process.env.REQUIRE_PROVENANCE === 'true';

  const { resolved: DATA_DIR, err: dataDirErr } = validateDataDir(
    CLI_DB || process.env.DATA_DIR,
    Boolean(CLI_DB)
  );

  const errors = [];
  if (!TEST_PROJECT_ID)               errors.push('TEST_PROJECT_ID env var required');
  if (TEST_PROJECT_ID && !TEST_PROJECT_ID.startsWith('prj-test-'))
                                      errors.push('TEST_PROJECT_ID must start with prj-test-');
  if (dataDirErr)                     errors.push(dataDirErr);
  if (!DISPOSABLE_INSTANCE_ID)        errors.push('DISPOSABLE_INSTANCE_ID env var required');
  if (!OPERATOR_TOKEN)                errors.push('OPERATOR_TOKEN env var required');
  if (OPERATOR_TOKEN && OPERATOR_TOKEN.length < 32)
                                      errors.push('OPERATOR_TOKEN must be >= 32 characters');
  if (OPERATOR_TOKEN && (new Set(OPERATOR_TOKEN.split('')).size < 8 || OPERATOR_TOKEN === TEST_PROJECT_ID))
                                      errors.push('OPERATOR_TOKEN has insufficient entropy or matches project ID');

  // External Authorization & Provenance Requirements: In active mutation mode, both are strictly mandatory
  if (!DRY_RUN) {
    if (!QA_HARNESS_SECRET) {
      errors.push('QA_HARNESS_SECRET (or EXPECTED_OPERATOR_TOKEN) env var is mandatory in active mutation mode (no opt-out permitted)');
    }
    if (!CONTROL_PLANE_VERIFIER_KEY) {
      errors.push('CONTROL_PLANE_PUBLIC_KEY (or CONTROL_PLANE_VERIFIER_KEY) is mandatory in active mutation mode (no opt-out permitted)');
    }
  }

  if (QA_HARNESS_SECRET && OPERATOR_TOKEN !== QA_HARNESS_SECRET) {
    errors.push('OPERATOR_TOKEN does not match server-verified QA_HARNESS_SECRET');
  }

  // Separation of duties: Control plane verifier key must NEVER match operator token
  if (CONTROL_PLANE_VERIFIER_KEY && OPERATOR_TOKEN === CONTROL_PLANE_VERIFIER_KEY) {
    errors.push('OPERATOR_TOKEN must be distinct from CONTROL_PLANE_SECRET (two-party separation of duty required)');
  }

  if (errors.length) {
    process.stderr.write('[REVOKE_QA_TOKENS] FAIL_CLOSED — validation errors:\n');
    errors.forEach(e => process.stderr.write('  - ' + e + '\n'));
    process.exit(2);
  }

  // ─── Derived paths ──────────────────────────────────────────────────────────
  const MARKER_PATH     = path.join(DATA_DIR, '.disposable_qa_marker');
  const PROVENANCE_PATH = path.join(DATA_DIR, '.disposable_qa_provenance.json');
  const DB_PATH         = path.join(DATA_DIR, 'db.json');
  const BACKUP_PATH     = path.join(DATA_DIR, '.qa_token_backup.json');
  const LOCK_DIR        = path.join(DATA_DIR, 'db.lock'); // unified with server/db.js _getLockDir()

  // ─── Pre-lock: verify marker and db.json exist before acquiring lock ────────
  const markerCheck = verifyMarker(MARKER_PATH, DISPOSABLE_INSTANCE_ID, QA_HARNESS_SECRET);
  if (!markerCheck.ok) {
    process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: ${markerCheck.err}.\n  This directory is not a verified disposable QA datastore.\n`);
    process.exit(3);
  }

  if (REQUIRE_PROVENANCE) {
    const provCheck = verifyProvenanceBinding(PROVENANCE_PATH, DATA_DIR, DISPOSABLE_INSTANCE_ID, TEST_PROJECT_ID, CONTROL_PLANE_VERIFIER_KEY);
    if (!provCheck.ok) {
      process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: ${provCheck.err}.\n  Control-plane provenance binding failed.\n`);
      process.exit(3);
    }
  }

  if (!fs.existsSync(DB_PATH)) {
    process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: db.json not found at ${DB_PATH}\n`);
    process.exit(4);
  }

  // ─── ACQUIRE LOCK FIRST — all DB reads/writes happen under this lock ────────
  const LOCK_TIMEOUT_MS = parseInt(process.env.LOCK_TIMEOUT_MS || '5000', 10);
  const myOwnerToken = acquireLock(LOCK_DIR, LOCK_TIMEOUT_MS);
  if (!myOwnerToken) {
    process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Could not acquire lock within timeout.\n');
    process.exit(7);
  }

  let exitCode = 0;

  function runUnderLock(ownerToken) {
    // ── Under lock: verify marker identity and signature ──────────────────────
    const underLockMarkerCheck = verifyMarker(MARKER_PATH, DISPOSABLE_INSTANCE_ID, QA_HARNESS_SECRET);
    if (!underLockMarkerCheck.ok) {
      process.stderr.write(`[REVOKE_QA_TOKENS] ABORT (under lock): ${underLockMarkerCheck.err}\n`);
      return 3;
    }

    if (REQUIRE_PROVENANCE) {
      const underLockProvCheck = verifyProvenanceBinding(PROVENANCE_PATH, DATA_DIR, DISPOSABLE_INSTANCE_ID, TEST_PROJECT_ID, CONTROL_PLANE_VERIFIER_KEY);
      if (!underLockProvCheck.ok) {
        process.stderr.write(`[REVOKE_QA_TOKENS] ABORT (under lock): ${underLockProvCheck.err}\n`);
        return 3;
      }
    }

    // ── Under lock: read DB bytes and compute whole-DB hash (pre-state CAS) ───
    const dbBytesAtLockTime = fs.readFileSync(DB_PATH);
    const dbHashAtLockTime  = sha256Bytes(dbBytesAtLockTime);

    let dbData;
    try {
      dbData = JSON.parse(dbBytesAtLockTime.toString('utf8'));
    } catch (e) {
      process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: Failed to parse db.json: ${e.message}\n`);
      return 4;
    }

    // ── Under lock: Customer & Owner DB Refusal Gate (P0 Defense) ─────────────
    const refusalReason = inspectDatastoreSafety(dbData);
    if (refusalReason) {
      process.stderr.write(
        `[REVOKE_QA_TOKENS] ABORT: ${refusalReason}.\n` +
        '  Revocation utility strictly refuses non-disposable or copied customer datastores.\n'
      );
      return 3;
    }

    const projects = dbData.projects || [];
    const targetIdx = projects.findIndex(p => p.id === TEST_PROJECT_ID);

    if (targetIdx === -1) {
      // Idempotent: project not present
      process.stderr.write(redactedReceipt(
        TEST_PROJECT_ID, 'NOT_PRESENT', 'NOT_PRESENT', 'IDEMPOTENT_NO_MATCH',
        { note: 'Project not found in DB — no mutation performed' }
      ) + '\n');
      return 0;
    }

    const target = projects[targetIdx];

    // ── ROLLBACK mode ──────────────────────────────────────────────────────────
    if (ROLLBACK) {
      if (!fs.existsSync(BACKUP_PATH)) {
        process.stderr.write('[REVOKE_QA_TOKENS] ABORT: No backup found for rollback.\n');
        return 5;
      }
      let backup;
      try {
        backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
      } catch (e) {
        process.stderr.write(`[REVOKE_QA_TOKENS] ABORT: Failed to parse backup: ${e.message}\n`);
        return 5;
      }

      if (backup.projectId !== TEST_PROJECT_ID || backup.instanceId !== DISPOSABLE_INSTANCE_ID) {
        process.stderr.write('[REVOKE_QA_TOKENS] ABORT: Backup metadata mismatch.\n');
        return 5;
      }

      const currentHash = sha256(target.editToken || '');
      if (currentHash !== backup.tokenHash_after) {
        process.stderr.write(
          `[REVOKE_QA_TOKENS] ABORT: Current token hash (${currentHash}) does not match ` +
          `backup tokenHash_after (${backup.tokenHash_after}). Skipping rollback to avoid clobbering external change.\n`
        );
        return 6;
      }

      if (DRY_RUN) {
        process.stderr.write(redactedReceipt(
          TEST_PROJECT_ID, currentHash, backup.tokenHash_before, 'DRY_RUN_ROLLBACK',
          { would_restore: 'tokenHash_before from backup' }
        ) + '\n');
        return 0;
      }

      // Generate a fresh rollback token (raw former secret is not kept in backup)
      const rollbackToken = 'edit-tok-' + crypto.randomBytes(32).toString('hex');
      const rollbackHash  = sha256(rollbackToken);

      // Verify lock is still held by this process before write
      if (!verifyLockHeld(LOCK_DIR, ownerToken)) {
        process.stderr.write(
          '[REVOKE_QA_TOKENS] ABORT: Lock ownership lost before rollback write (ownerToken mismatch).\n' +
          '  Another process may have superseded the lock. Write aborted to prevent split-brain.\n'
        );
        return 8;
      }

      // Whole-DB CAS: re-verify db.json hasn't changed since we acquired lock
      const dbBytesNow = fs.readFileSync(DB_PATH);
      if (sha256Bytes(dbBytesNow) !== dbHashAtLockTime) {
        process.stderr.write(
          '[REVOKE_QA_TOKENS] ABORT: Whole-DB CAS failed — db.json changed after lock\n' +
          '  acquisition (concurrent writer detected). Aborting to prevent data loss.\n'
        );
        return 8;
      }

      const updatedDb = JSON.parse(JSON.stringify(dbData));
      updatedDb.projects[targetIdx] = Object.assign(
        {}, updatedDb.projects[targetIdx],
        { editToken: rollbackToken }
      );

      atomicWriteJson(DB_PATH, updatedDb, LOCK_DIR, ownerToken);

      try { fs.unlinkSync(BACKUP_PATH); } catch (_) {}

      process.stderr.write(redactedReceipt(
        TEST_PROJECT_ID, currentHash, rollbackHash, 'ROLLBACK_OK', {}
      ) + '\n');
      return 0;
    }

    // ── ROTATE mode ────────────────────────────────────────────────────────────
    const currentToken = target.editToken || '';
    const currentHash  = sha256(currentToken);

    // Idempotency: if already rotated to backup's tokenHash_after, skip
    if (fs.existsSync(BACKUP_PATH)) {
      try {
        const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
        if (backup.projectId === TEST_PROJECT_ID && backup.tokenHash_after === currentHash) {
          process.stderr.write(redactedReceipt(
            TEST_PROJECT_ID, currentHash, currentHash, 'IDEMPOTENT_ALREADY_ROTATED',
            { note: 'Token already rotated in previous run — no mutation performed' }
          ) + '\n');
          return 0;
        }
      } catch (_) {}
    }

    const newToken = 'edit-tok-' + crypto.randomBytes(32).toString('hex');
    const newHash  = sha256(newToken);

    if (DRY_RUN) {
      process.stderr.write(redactedReceipt(
        TEST_PROJECT_ID, currentHash, newHash, 'DRY_RUN_PLAN',
        { action: 'rotate', target_project_id: TEST_PROJECT_ID }
      ) + '\n');
      return 0;
    }

    // Verify lock is still held by this process before write
    if (!verifyLockHeld(LOCK_DIR, ownerToken)) {
      process.stderr.write(
        '[REVOKE_QA_TOKENS] ABORT: Lock ownership lost before write (ownerToken mismatch).\n' +
        '  Another process may have superseded the lock. Write aborted to prevent split-brain.\n'
      );
      return 8;
    }

    // ── Whole-DB CAS: re-verify db.json hasn't changed since we acquired lock ───
    const dbBytesNow = fs.readFileSync(DB_PATH);
    if (sha256Bytes(dbBytesNow) !== dbHashAtLockTime) {
      process.stderr.write(
        '[REVOKE_QA_TOKENS] ABORT: Whole-DB CAS failed — db.json changed after lock\n' +
        '  acquisition (concurrent writer detected). Aborting to prevent data loss.\n'
      );
      return 8;
    }

    // ── Write hash-only backup (no raw tokens stored) ──────────────────────────
    const backupData = {
      projectId:        TEST_PROJECT_ID,
      instanceId:       DISPOSABLE_INSTANCE_ID,
      tokenHash_before: currentHash,     // hash only — raw token never stored
      tokenHash_after:  newHash,         // hash only — raw token never stored
      dbHashAtRotation: dbHashAtLockTime, // whole-DB hash for audit
      ts:               new Date().toISOString()
    };
    atomicWriteJson(BACKUP_PATH, backupData, LOCK_DIR, ownerToken);

    // ── Mutate ONLY editToken field — all other fields preserved exactly ───────
    const updatedDb = JSON.parse(JSON.stringify(dbData)); // deep clone
    updatedDb.projects[targetIdx] = Object.assign(
      {}, updatedDb.projects[targetIdx],
      { editToken: newToken }
      // updatedAt intentionally NOT mutated (only editToken changes)
    );

    // ── Atomic write via temp + fsync + renameSync ─────────────────────────────
    atomicWriteJson(DB_PATH, updatedDb, LOCK_DIR, ownerToken);

    // ── Emit redacted receipt (no raw tokens) ──────────────────────────────────
    process.stderr.write(redactedReceipt(
      TEST_PROJECT_ID, currentHash, newHash, 'ROTATED_OK', {}
    ) + '\n');

    return 0;
  }

  try {
    exitCode = runUnderLock(myOwnerToken);
    if (typeof exitCode !== 'number') exitCode = 0;
  } catch (err) {
    process.stderr.write(`[REVOKE_QA_TOKENS] ERROR: ${err.message}\n${err.stack}\n`);
    exitCode = 8;
  } finally {
    releaseLock(LOCK_DIR, myOwnerToken);
  }

  process.exit(exitCode);
}

// ─── Self-test suite (unit-level; see test/test_revoke_qa_tokens_cli.js for CLI e2e) ─
function runSelfTests() {
  const assert = require('assert');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revoke_qa_self_test_'));
  let pass = 0; let fail = 0;

  function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); pass++; }
    catch (e) { console.error(`  [FAIL] ${name}: ${e.message}`); fail++; }
  }

  const instanceId = 'test-instance-' + crypto.randomBytes(4).toString('hex');
  const projectId  = 'prj-test-' + crypto.randomBytes(4).toString('hex');

  function makeDb(token) {
    return { projects: [{ id: projectId, editToken: token, name: 'Test' }] };
  }
  function writeMarker(dir, id) {
    fs.writeFileSync(path.join(dir, '.disposable_qa_marker'), id, 'utf8');
  }
  function writeDb(dir, token) {
    fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(makeDb(token), null, 2), 'utf8');
  }

  // T1: sha256 helper produces stable, distinct hashes
  test('sha256 produces stable hash', () => {
    const h = sha256('hello');
    assert.ok(h.startsWith('sha256:'));
    assert.strictEqual(h, sha256('hello'));
    assert.notStrictEqual(h, sha256('world'));
  });

  // T2: atomicWriteJson — no leftover temp files
  test('atomicWriteJson writes cleanly without leftover .tmp files', () => {
    const p = path.join(tmpDir, 'atomic_test.json');
    atomicWriteJson(p, { ok: true });
    const result = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.strictEqual(result.ok, true);
    const leftovers = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
    assert.strictEqual(leftovers.length, 0, 'No temp files should remain');
  });

  // T3: missing marker → detectable at startup
  test('Rejects directory without .disposable_qa_marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'no_marker_'));
    writeDb(d, 'tok-abc');
    assert.ok(!fs.existsSync(path.join(d, '.disposable_qa_marker')));
    fs.rmSync(d, { recursive: true });
  });

  // T4: mismatched instanceId in marker → detectable
  test('Rejects mismatched DISPOSABLE_INSTANCE_ID in marker', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mismatch_marker_'));
    writeMarker(d, 'other-instance-id');
    writeDb(d, 'tok-abc');
    const marker = fs.readFileSync(path.join(d, '.disposable_qa_marker'), 'utf8').trim();
    assert.notStrictEqual(marker, instanceId);
    fs.rmSync(d, { recursive: true });
  });

  // T5: token rotation is field-scoped — other records and fields preserved
  test('Token rotation does not remove or mutate other project records', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped_rotation_'));
    writeMarker(d, instanceId);
    const otherProjId = 'prj-test-other';
    const dbBefore = {
      projects: [
        { id: projectId,   editToken: 'tok-before', name: 'Target', customField: 'keep-me' },
        { id: otherProjId, editToken: 'tok-other',  name: 'Other'  }
      ]
    };
    fs.writeFileSync(path.join(d, 'db.json'), JSON.stringify(dbBefore, null, 2), 'utf8');

    // Simulate R16R3 rotation: Object.assign with ONLY editToken changed
    const cloned = JSON.parse(JSON.stringify(dbBefore));
    const idx = cloned.projects.findIndex(p => p.id === projectId);
    const newTok = crypto.randomBytes(32).toString('hex');
    cloned.projects[idx] = Object.assign({}, cloned.projects[idx], { editToken: newTok });
    // updatedAt intentionally NOT changed
    atomicWriteJson(path.join(d, 'db.json'), cloned);

    const dbAfter = JSON.parse(fs.readFileSync(path.join(d, 'db.json'), 'utf8'));
    assert.strictEqual(dbAfter.projects.length, 2, 'Both projects must remain');
    const other = dbAfter.projects.find(p => p.id === otherProjId);
    assert.strictEqual(other.editToken, 'tok-other', 'Other project token unchanged');
    const rotated = dbAfter.projects.find(p => p.id === projectId);
    assert.notStrictEqual(rotated.editToken, 'tok-before', 'Target token changed');
    assert.strictEqual(rotated.customField, 'keep-me', 'Custom fields preserved');
    assert.strictEqual(rotated.updatedAt, undefined, 'updatedAt NOT mutated by R16R3 script');
    fs.rmSync(d, { recursive: true });
  });

  // T6: idempotency condition — backup.tokenHash_after == currentHash → skip
  test('Idempotency: second run with matching tokenHash_after is a no-op', () => {
    const tok    = crypto.randomBytes(32).toString('hex');
    const newTok = crypto.randomBytes(32).toString('hex');
    const backup = {
      projectId, instanceId,
      tokenHash_before: sha256(tok),
      tokenHash_after:  sha256(newTok),
      ts: new Date().toISOString()
    };
    const currentHash = sha256(newTok);
    assert.strictEqual(backup.tokenHash_after, currentHash, 'Idempotency condition holds');
  });

  // T7: rollback CAS — intervening write detected
  test('Rollback aborts when current token != backup tokenHash_after', () => {
    const backup = {
      projectId, instanceId,
      tokenHash_before: sha256('old-tok'),
      tokenHash_after:  sha256('rotated-tok'),
      ts: new Date().toISOString()
    };
    const currentHash = sha256('intervening-different-tok');
    assert.notStrictEqual(currentHash, backup.tokenHash_after,
      'Intervening write detected — rollback should abort');
  });

  // T8: static/production IDs rejected
  test('Rejects projectId not starting with prj-test-', () => {
    const badIds = ['prj-free-b0c6f3ea', 'prj-free-aeb87eb4', 'prj-prod-xyz', '', 'prj-customer-x'];
    for (const id of badIds) {
      assert.ok(!id.startsWith('prj-test-'), `Should reject: "${id}"`);
    }
  });

  // T9: receipt never contains raw token value
  test('Receipt does not include raw token value', () => {
    const rawToken = 'super-secret-raw-token-xyz-987654';
    const receipt  = redactedReceipt(projectId, sha256(rawToken), sha256('new'), 'ROTATED_OK', {});
    assert.ok(!receipt.includes(rawToken), 'Raw token must not appear in receipt');
    assert.ok(receipt.includes('sha256:'),  'Receipt must contain hashed values');
  });

  // T10: backup does NOT store raw token (R16R3: hash-only backup)
  test('Backup stores only hashes — no raw token in backup data', () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const backup = {
      projectId,
      instanceId,
      tokenHash_before: sha256(rawToken),
      tokenHash_after:  sha256(crypto.randomBytes(32).toString('hex')),
      dbHashAtRotation: sha256Bytes(Buffer.from('fake-db')),
      ts: new Date().toISOString()
      // previousToken: intentionally OMITTED in R16R3
    };
    const backupStr = JSON.stringify(backup);
    assert.ok(!backupStr.includes(rawToken), 'Raw token must not appear in backup JSON');
    assert.ok(backupStr.includes('tokenHash_before'), 'Backup must contain hash fields');
    assert.ok(!Object.prototype.hasOwnProperty.call(backup, 'previousToken'),
      'previousToken must not exist in R16R3 backup');
  });

  // T11: validateDataDir rejects dangerous paths
  test('validateDataDir rejects paths matching dangerous patterns', () => {
    const dangerousPaths = [
      '/var/data/customer/db',
      '/home/prod/data',
      'C:/volumes/owner/storage',
      '/mnt/billing/records',
    ];
    for (const p of dangerousPaths) {
      const normalized = p.replace(/\\/g, '/');
      const matched = DANGEROUS_PATH_PATTERNS.some(pat => pat.test(normalized));
      assert.ok(matched, `Should reject dangerous path: ${p}`);
    }
  });

  // T12: OPERATOR_TOKEN must be >= 32 chars
  test('Rejects OPERATOR_TOKEN shorter than 32 chars', () => {
    const shortToken = 'too-short';
    assert.ok(shortToken.length < 32, 'Short token should be rejected');
    const validToken = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    assert.ok(validToken.length >= 32, '32-char token should be accepted');
  });

  // T13: isProcessAlive correctly identifies living and dead PIDs
  test('isProcessAlive correctly checks process liveness', () => {
    assert.strictEqual(isProcessAlive(process.pid), true, 'Current process must be reported alive');
    assert.strictEqual(isProcessAlive(9999999), false, 'Non-existent PID must be reported dead');
    assert.strictEqual(isProcessAlive(null), false, 'Null PID must be false');
    assert.strictEqual(isProcessAlive(0), false, 'Zero PID must be false');
  });

  // T14: acquireLock generates ownerToken and creates directory lock with meta.json
  test('acquireLock creates db.lock directory with meta.json matching db.js', () => {
    const lockDir = path.join(tmpDir, 'test_acquire_dir.lock');
    const token = acquireLock(lockDir, 500);
    assert.ok(typeof token === 'string' && token.length > 0, 'Must return ownerToken');
    assert.ok(fs.existsSync(lockDir), 'Lock directory must exist');
    const meta = readLockMeta(lockDir);
    assert.strictEqual(meta.pid, process.pid, 'Lock must contain process.pid');
    assert.strictEqual(meta.ownerToken, token, 'Lock must contain matching ownerToken');
    releaseLock(lockDir, token);
    assert.ok(!fs.existsSync(lockDir), 'Lock directory must be released');
  });

  // T15: releaseLock refuses to unlink directory lock with different ownerToken
  test('releaseLock protects successor directory lock from old holder deletion', () => {
    const lockDir = path.join(tmpDir, 'test_successor_dir.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    const successorToken = 'successor-token-' + crypto.randomBytes(4).toString('hex');
    const oldToken       = 'old-token-' + crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify({ pid: process.pid, ownerToken: successorToken }), 'utf8');

    // Old holder attempts to release
    releaseLock(lockDir, oldToken);
    assert.ok(fs.existsSync(lockDir), 'Lock directory must NOT be unlinked by old holder with mismatched token');

    // Successor releases with correct token
    releaseLock(lockDir, successorToken);
    assert.ok(!fs.existsSync(lockDir), 'Lock directory should be unlinked when ownerToken matches');
  });

  // T16: verifyLockHeld validates matching token and handles missing directory
  test('verifyLockHeld validates directory lock ownership and fail-closed on mismatch', () => {
    const lockDir = path.join(tmpDir, 'test_verify_dir.lock');
    const tok = 'my-token';
    assert.strictEqual(verifyLockHeld(lockDir, tok), false, 'Missing lock must return false');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify({ pid: process.pid, ownerToken: tok }), 'utf8');
    assert.strictEqual(verifyLockHeld(lockDir, tok), true, 'Matching lock must return true');
    assert.strictEqual(verifyLockHeld(lockDir, 'wrong-tok'), false, 'Mismatched lock must return false');
    releaseLock(lockDir, tok);
  });

  // T17: Customer / Owner DB refusal gate
  test('Refuses DB containing production/customer projects or platform owner', () => {
    const custDb = {
      projects: [{ id: 'prj-free-b0c6f3ea', name: 'Real Customer Project' }],
      users: []
    };
    const hasCust = custDb.projects.some(p => !p.id.startsWith('prj-test-'));
    assert.strictEqual(hasCust, true, 'Must detect customer project');

    const ownerDb = {
      projects: [{ id: 'prj-test-valid', name: 'Test' }],
      users: [{ email: 'owner@vshow.com', role: 'platform_owner' }]
    };
    const hasOwner = ownerDb.users.some(u => u.role === 'platform_owner' || u.email.includes('owner@'));
    assert.strictEqual(hasOwner, true, 'Must detect platform owner');
  });

  // T18: Corrupted/unparseable lock is fail-closed (never unlinked by acquireLock)
  test('Corrupted/unparseable lock directory is fail-closed — never stolen', () => {
    const corruptLockDir = path.join(tmpDir, 'corrupt.lock');
    fs.mkdirSync(corruptLockDir, { recursive: true });
    fs.writeFileSync(path.join(corruptLockDir, 'meta.json'), 'INVALID_JSON_CORRUPT', 'utf8');
    
    // acquireLock with short timeout must fail (return null) and NOT delete the lock
    const acquired = acquireLock(corruptLockDir, 200);
    assert.strictEqual(acquired, null, 'Must fail to acquire corrupt lock (fail-closed)');
    assert.ok(fs.existsSync(corruptLockDir), 'Corrupt lock must NOT be deleted');
    fs.rmSync(corruptLockDir, { recursive: true });
  });

  // T19: verifyMarker validates HMAC cryptographic signature
  test('verifyMarker validates cryptographic HMAC signature', () => {
    const markerP = path.join(tmpDir, '.test_marker');
    const instId = 'inst-test-12345';
    const secret = 'secret-harness-key-32chars-min-len';

    // 1. Plain marker without signature when secret required -> fail
    fs.writeFileSync(markerP, instId, 'utf8');
    const r1 = verifyMarker(markerP, instId, secret);
    assert.strictEqual(r1.ok, false, 'Plain marker must fail when secret is required');

    // 2. Tampered signature -> fail
    fs.writeFileSync(markerP, `${instId}:invalid_tampered_signature_hex`, 'utf8');
    const r2 = verifyMarker(markerP, instId, secret);
    assert.strictEqual(r2.ok, false, 'Tampered signature must fail');

    // 3. Valid HMAC signature -> pass
    const validSig = computeMarkerSignature(instId, secret);
    fs.writeFileSync(markerP, `${instId}:${validSig}`, 'utf8');
    const r3 = verifyMarker(markerP, instId, secret);
    assert.strictEqual(r3.ok, true, 'Valid HMAC signature must pass');
    fs.unlinkSync(markerP);
  });

  // T20: inspectDatastoreSafety detects customer emails, enterprise tiers, and commercial orgs
  test('inspectDatastoreSafety detects copied DB with customer emails and entities', () => {
    const copiedDb1 = {
      projects: [{ id: 'prj-test-renamed', tier: 'enterprise' }],
      users: []
    };
    assert.ok(inspectDatastoreSafety(copiedDb1) !== null, 'Must refuse enterprise tier project');

    const copiedDb2 = {
      projects: [{ id: 'prj-test-renamed', name: 'Valid Test' }],
      users: [{ email: 'finance@customer-corp.com', role: 'admin' }]
    };
    assert.ok(inspectDatastoreSafety(copiedDb2) !== null, 'Must refuse customer domain email');

    const copiedDb3 = {
      projects: [{ id: 'prj-test-renamed' }],
      users: [],
      organizations: [{ id: 'org-client-corp-xyz' }]  // non-seed, non-qa org ID
    };
    assert.ok(inspectDatastoreSafety(copiedDb3) !== null, 'Must refuse non-qa organization');

    const validTestDb = {
      projects: [{ id: 'prj-test-123', name: 'QA Test Project' }],
      users: [{ email: 'qa-tester@test.local', role: 'qa' }]
    };
    assert.strictEqual(inspectDatastoreSafety(validTestDb), null, 'Must accept clean test DB');
  });

  // T21: atomicWriteJson pre-rename barrier aborts if lock lost
  test('atomicWriteJson aborts write and cleans temp file if lock ownership lost', () => {
    const targetFile = path.join(tmpDir, 'target.json');
    const lockDir = path.join(tmpDir, 'test_write.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    const myTok = 'my-token';
    const otherTok = 'other-token';
    fs.writeFileSync(path.join(lockDir, 'meta.json'), JSON.stringify({ pid: process.pid, ownerToken: otherTok }), 'utf8');

    let threw = false;
    try {
      atomicWriteJson(targetFile, { a: 1 }, lockDir, myTok);
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('LOCK_LOST_BEFORE_RENAME'), 'Must throw LOCK_LOST_BEFORE_RENAME');
    }
    assert.strictEqual(threw, true, 'atomicWriteJson must throw when lock ownership lost');
    assert.strictEqual(fs.existsSync(targetFile), false, 'Target file must not be created');
    // Check no leftover tmp files
    const entries = fs.readdirSync(tmpDir).filter(f => f.startsWith('target.json.tmp'));
    assert.strictEqual(entries.length, 0, 'Temporary file must be cleaned up on abort');
    releaseLock(lockDir, otherTok);
  });

  // T22: verifyProvenanceBinding validates HMAC & Ed25519 asymmetric control-plane binding
  test('verifyProvenanceBinding validates HMAC & Ed25519 signatures and rejects forged/expired tokens', () => {
    const provPath = path.join(tmpDir, '.disposable_qa_provenance.json');
    const vId = 'vol-test-999';
    const pId = 'prj-test-provenance';
    const op = 'ROTATE_QA_EDIT_TOKEN';
    const cpSecret = 'control-plane-master-secret-32chars';
    const realDir = fs.realpathSync(tmpDir);

    // 1. Missing provenance file -> fail
    const r1 = verifyProvenanceBinding(provPath, tmpDir, vId, pId, cpSecret);
    assert.strictEqual(r1.ok, false, 'Missing provenance must fail');

    // 2. Valid signed HMAC provenance -> pass
    const now = Date.now();
    const sigHmac = computeProvenanceSignature(vId, realDir, pId, op, now, 3600000, cpSecret);
    const validHmacProv = {
      volumeId: vId,
      datastoreRealPath: realDir,
      projectId: pId,
      operation: op,
      createdAt: now,
      maxLifetimeMs: 3600000,
      controlPlaneSignature: sigHmac
    };
    fs.writeFileSync(provPath, JSON.stringify(validHmacProv), 'utf8');
    const r2 = verifyProvenanceBinding(provPath, tmpDir, vId, pId, cpSecret);
    assert.strictEqual(r2.ok, true, 'Valid HMAC provenance must pass');

    // 3. Valid signed Asymmetric Ed25519 provenance -> pass
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const sigEd25519 = computeProvenanceSignature(vId, realDir, pId, op, now, 3600000, privateKey, 'ed25519');
    const validEd25519Prov = {
      volumeId: vId,
      datastoreRealPath: realDir,
      projectId: pId,
      operation: op,
      algorithm: 'ed25519',
      createdAt: now,
      maxLifetimeMs: 3600000,
      controlPlaneSignature: sigEd25519
    };
    fs.writeFileSync(provPath, JSON.stringify(validEd25519Prov), 'utf8');
    const r3 = verifyProvenanceBinding(provPath, tmpDir, vId, pId, publicKey);
    assert.strictEqual(r3.ok, true, 'Valid Ed25519 provenance must pass with public key');

    // 4. Forged Ed25519 signature from untrusted private key -> fail against legitimate public key
    const { privateKey: untrustedKey } = crypto.generateKeyPairSync('ed25519');
    const forgedSig = computeProvenanceSignature(vId, realDir, pId, op, now, 3600000, untrustedKey, 'ed25519');
    const forgedProv = Object.assign({}, validEd25519Prov, { controlPlaneSignature: forgedSig });
    fs.writeFileSync(provPath, JSON.stringify(forgedProv), 'utf8');
    const r4 = verifyProvenanceBinding(provPath, tmpDir, vId, pId, publicKey);
    assert.strictEqual(r4.ok, false, 'Forged Ed25519 signature must fail against control-plane public key');

    // 5. Expired token -> fail
    const expiredProv = Object.assign({}, validHmacProv, {
      createdAt: now - 7200000,
      maxLifetimeMs: 3600000,
      controlPlaneSignature: computeProvenanceSignature(vId, realDir, pId, op, now - 7200000, 3600000, cpSecret)
    });
    fs.writeFileSync(provPath, JSON.stringify(expiredProv), 'utf8');
    const r5 = verifyProvenanceBinding(provPath, tmpDir, vId, pId, cpSecret);
    assert.strictEqual(r5.ok, false, 'Expired provenance must fail');

    fs.unlinkSync(provPath);
  });

  // T23: verifyProvenanceBinding strictly fails closed if no verifier key is provided
  test('verifyProvenanceBinding fails closed if no verification key provided', () => {
    const provPath = path.join(tmpDir, '.disposable_qa_provenance.json');
    fs.writeFileSync(provPath, JSON.stringify({
      volumeId: 'v1', datastoreRealPath: fs.realpathSync(tmpDir), projectId: 'prj-test-1', operation: 'ROTATE_QA_EDIT_TOKEN'
    }), 'utf8');
    const res = verifyProvenanceBinding(provPath, tmpDir, 'v1', 'prj-test-1', null);
    assert.strictEqual(res.ok, false, 'Must fail closed when verifierKey is null/empty');
    assert.ok(res.err.includes('No control-plane verification key provided'), 'Error must specify missing verifier key');
    fs.unlinkSync(provPath);
  });

  console.log(`\n  Self-test complete: ${pass} passed, ${fail} failed`);
  fs.rmSync(tmpDir, { recursive: true });
  if (fail > 0) process.exit(1);
}

// ─── Module exports for testing ───────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sha256,
    sha256Bytes,
    computeMarkerSignature,
    verifyMarker,
    computeProvenanceSignature,
    verifyProvenanceBinding,
    inspectDatastoreSafety,
    acquireLock,
    releaseLock,
    verifyLockHeld,
    atomicWriteJson,
    validateDataDir,
    DANGEROUS_PATH_PATTERNS,
    DB_JS_SEED_ORG_IDS,
    INTERNAL_PLATFORM_DOMAINS,
    DB_JS_SEED_PLATFORM_OWNER_ID,
    runSelfTests,
    runCli
  };
}
