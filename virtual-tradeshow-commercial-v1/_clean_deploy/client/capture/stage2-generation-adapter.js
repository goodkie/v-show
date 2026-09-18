/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3DZ / ³D₂ STAGE 2 — GENERATION ADAPTER (P5 TRANSPORT-READY INTEGRATION)
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-ready generation adapter consuming Schema 5 normalized capture manifests
 * from both CAMERA_ROTATIONAL_SENSOR and MANUAL_UPLOAD sources.
 *
 * CANONICAL SOURCE TYPE POLICY (§P5.0-A):
 *   Canonical: CAMERA_ROTATIONAL_SENSOR, MANUAL_UPLOAD
 *   Accepted alias: MANUAL_PHOTO_UPLOAD (normalized to MANUAL_UPLOAD)
 *
 * CANCEL SEMANTICS (§P5.0-B):
 *   JOB_CANCEL_ENDPOINT: UNRESOLVED (No backend server cancellation endpoint)
 *   cancelGeneration() terminates client polling locally:
 *   cancelScope = 'CLIENT_POLLING_ONLY', remoteJobCanceled = false.
 *
 * HARD NETWORK LOCK ENFORCED (§P5.2):
 *   remoteEnabled = false by default.
 *   createGenerationRequest() strictly returns GENERATION_TRANSPORT_DISABLED
 *   without contacting any remote network endpoints when locked.
 *
 * Discovered Endpoints (§P5.1):
 *   CREATE PRIMARY:        POST /api/projects/:id/spatial/start
 *   CREATE ALIAS:          POST /api/projects/:id/spatial/generate
 *   STATUS:                GET  /api/spatial-jobs/:jobId
 *   ACTIVE JOB RECOVERY:   GET  /api/projects/:id/spatial/job
 *   CANDIDATE STATUS:      GET  /api/projects/:id/spatial/candidate/:candidateId
 *   APPLY:                 POST /api/projects/:id/spatial/apply
 *   DISCARD:               POST /api/projects/:id/spatial/discard
 *   REMOTE CANCEL:         UNRESOLVED
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = typeof require !== 'undefined' ? require('crypto') : null;

// ─── Source Type Normalization Policy (§P5.0-A) ──────────────────────────────
const CANONICAL_SOURCE_TYPES = Object.freeze({
  CAMERA_ROTATIONAL_SENSOR: 'CAMERA_ROTATIONAL_SENSOR',
  MANUAL_UPLOAD:            'MANUAL_UPLOAD',
});

const SOURCE_TYPE_ALIASES = Object.freeze({
  'MANUAL_PHOTO_UPLOAD': CANONICAL_SOURCE_TYPES.MANUAL_UPLOAD,
  'MANUAL_UPLOAD':       CANONICAL_SOURCE_TYPES.MANUAL_UPLOAD,
  'CAMERA_ROTATIONAL_SENSOR': CANONICAL_SOURCE_TYPES.CAMERA_ROTATIONAL_SENSOR,
});

function normalizeSourceType(rawType) {
  if (!rawType) return 'UNKNOWN';
  const clean = String(rawType).trim();
  return SOURCE_TYPE_ALIASES[clean] || clean;
}

// ─── Constants & Discovered Endpoints (§P5.1) ────────────────────────────────
const DISCOVERED_ENDPOINTS = Object.freeze({
  JOB_CREATE_ENDPOINT:    '/api/projects/:id/spatial/start',
  JOB_CREATE_ALIAS:       '/api/projects/:id/spatial/generate',
  JOB_STATUS_ENDPOINT:    '/api/spatial-jobs/:jobId',
  JOB_PROJECT_STATUS:     '/api/projects/:id/spatial/job',
  JOB_CANDIDATE_ENDPOINT: '/api/projects/:id/spatial/candidate/:candidateId',
  JOB_APPLY_ENDPOINT:     '/api/projects/:id/spatial/apply',
  JOB_DISCARD_ENDPOINT:   '/api/projects/:id/spatial/discard',
  JOB_CANCEL_ENDPOINT:    'UNRESOLVED', // No backend route; client AbortController only
});

const JOB_STATES = Object.freeze({
  NOT_SUBMITTED: 'NOT_SUBMITTED',
  SUBMITTING:    'SUBMITTING',
  QUEUED:        'QUEUED',
  PROCESSING:    'PROCESSING',
  SUCCEEDED:     'SUCCEEDED',
  FAILED:        'FAILED',
  CANCELED:      'CANCELED',
});

const POLLING_STATES = Object.freeze({
  IDLE:               'IDLE',
  POLLING:            'POLLING',
  STOPPED_BY_CLIENT:  'STOPPED_BY_CLIENT',
  COMPLETED:          'COMPLETED',
  TIMED_OUT:          'TIMED_OUT',
  ERROR:              'ERROR',
});

const PHASE_LABELS = Object.freeze({
  UPLOADING:  'Uploading',
  QUEUED:     'Queued',
  PROCESSING: 'Processing',
  FINALIZING: 'Finalizing',
  COMPLETED:  'Completed',
});

const ERROR_CODES = Object.freeze({
  TRANSPORT_LOCKED:     'GENERATION_TRANSPORT_DISABLED',
  MISSING_PROJECT_ID:   'MISSING_PROJECT_ID',
  INVALID_MANIFEST:     'INVALID_MANIFEST',
  NETWORK_ERROR:        'NETWORK_ERROR',
  TIMEOUT_ERROR:        'TIMEOUT_ERROR',
  SERVER_ERROR:         'SERVER_ERROR',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  CANCELED:             'JOB_CANCELED',
  MALFORMED_RESPONSE:   'MALFORMED_RESPONSE',
  POLLING_STOPPED_LOCAL:'POLLING_STOPPED_LOCAL',
});

// ─── Stage2GenerationAdapter Class ───────────────────────────────────────────
class Stage2GenerationAdapter {
  constructor(config = {}) {
    // Hard Network Lock: strictly false by default (§P5.2)
    this.remoteEnabled = config.remoteEnabled === true;
    this.projectId = config.projectId || null;
    this.baseUrl = config.baseUrl || '';
    this.authToken = config.authToken || null;
    this.customerEmail = config.customerEmail || null;
    this.maxRetries = typeof config.maxRetries === 'number' ? config.maxRetries : 3;
    this.timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 10000;
    this.pollIntervalMs = typeof config.pollIntervalMs === 'number' ? config.pollIntervalMs : 1500;

    // Transport layer: null uses native fetch; or injected mock/stub
    this.transport = config.transport || null;

    // Local state registries
    this.activeJobs = new Map();               // jobId -> JobRecord
    this.idempotencyMap = new Map();           // idempotencyKey -> jobId
    this.abortControllers = new Map();         // jobId -> AbortController (request)
    this.pollingAbortControllers = new Map();  // jobId -> AbortController (polling loop)

    // Real network call monitoring (§P5.12)
    this.realNetworkStats = {
      createCalls: 0,
      statusCalls: 0,
      cancelCalls: 0,
      candidateCalls: 0,
      applyCalls: 0,
      discardCalls: 0,
      activeJobCalls: 0,
    };
  }

  // ─── Idempotency Key Computation (§P5.5) ──────────────────────────────────
  computeIdempotencyKey(projectId, manifest) {
    if (!projectId || !manifest || typeof manifest !== 'object') return null;
    const captureId = manifest.captureId || 'unknown-capture';
    const canonicalType = normalizeSourceType(manifest.sourceType);
    const frameCount = manifest.frameCount || (manifest.frames ? manifest.frames.length : 0);
    const frameFingerprints = Array.isArray(manifest.frames)
      ? manifest.frames.map(f => f.imageHash || f.frameId || '').join(',')
      : '';

    const rawKey = `${projectId}:${captureId}:${canonicalType}:${frameCount}:${frameFingerprints}`;

    if (crypto && typeof crypto.createHash === 'function') {
      return 'idem-' + crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 32);
    }

    // Browser hash fallback
    let hash = 0;
    for (let i = 0; i < rawKey.length; i++) {
      hash = ((hash << 5) - hash) + rawKey.charCodeAt(i);
      hash |= 0;
    }
    return 'idem-' + Math.abs(hash).toString(16).padStart(16, '0');
  }

  // ─── Request Contract Builder (§P5.3, §P5.4) ──────────────────────────────
  buildGenerationPayload(manifest, projectId) {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest is required');
    }
    if (manifest.schemaVersion !== 5) {
      throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}. Required: 5`);
    }
    if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
      throw new Error('Manifest frames array must not be empty');
    }

    const resolvedProjectId = projectId || this.projectId;
    if (!resolvedProjectId) {
      throw new Error('projectId is required for generation payload serialization');
    }

    const canonicalSourceType = normalizeSourceType(manifest.sourceType);
    const idempotencyKey = this.computeIdempotencyKey(resolvedProjectId, manifest);
    const isCamera = canonicalSourceType === CANONICAL_SOURCE_TYPES.CAMERA_ROTATIONAL_SENSOR;

    // Deep preservation of frame contracts
    const normalizedFrames = manifest.frames.map((frame, idx) => {
      return {
        frameId: frame.frameId,
        order: frame.order || idx + 1,
        source: canonicalSourceType,
        imageHash: frame.imageHash,
        timestamp: frame.timestamp,
        width: frame.width || 1920,
        height: frame.height || 1080,
        qualityScore: typeof frame.qualityScore === 'number' ? frame.qualityScore : 0.85,
        // Preservation rule: Camera retains sensors; Upload strictly UNKNOWN/null
        orientationStatus: isCamera ? (frame.orientationStatus || 'SENSOR_DERIVED') : 'UNKNOWN',
        yawDeg: isCamera ? (frame.yawDeg !== undefined ? frame.yawDeg : null) : null,
        pitchDeg: isCamera ? (frame.pitchDeg !== undefined ? frame.pitchDeg : null) : null,
        rollDeg: isCamera ? (frame.rollDeg !== undefined ? frame.rollDeg : null) : null,
        angularVelocityDegSec: isCamera ? (frame.angularVelocityDegSec || null) : null,
        targetIndex: isCamera ? (frame.targetIndex !== undefined ? frame.targetIndex : idx) : null,
        targetYawDeg: isCamera ? (frame.targetYawDeg !== undefined ? frame.targetYawDeg : idx * 30.0) : null,
        yawErrorDeg: isCamera ? (frame.yawErrorDeg !== undefined ? frame.yawErrorDeg : 0.0) : null,
        adjacency: frame.adjacency ? {
          prevFrameId: frame.adjacency.prevFrameId,
          nextFrameId: frame.adjacency.nextFrameId,
          sequentialOrder: frame.adjacency.sequentialOrder || idx + 1,
        } : null,
      };
    });

    return {
      schemaVersion: 5,
      projectId: resolvedProjectId,
      idempotencyKey,
      captureId: manifest.captureId,
      sourceType: canonicalSourceType,
      frameCount: manifest.frameCount || normalizedFrames.length,
      c12_7_ringConstraintPreserved: Boolean(manifest.c12_7_ringConstraintPreserved),
      captureOrder: manifest.captureOrder || normalizedFrames.map(f => f.frameId),
      createdAt: manifest.createdAt || new Date().toISOString(),
      frames: normalizedFrames,
    };
  }

  // ─── Create Generation Request with Hard Network Lock (§P5.2, §P5.4) ───────
  async createGenerationRequest(args, options = {}) {
    // Parameter normalization: support ({ projectId, manifest }) or (manifest, { projectId })
    const resolvedProjectId = (args && args.projectId) || (options && options.projectId) || this.projectId;
    const resolvedManifest = (args && args.manifest) ? args.manifest : args;

    // 1. PROJECT ID VALIDATION (§P5.4)
    if (!resolvedProjectId) {
      return {
        ok: false,
        status: JOB_STATES.FAILED,
        code: ERROR_CODES.MISSING_PROJECT_ID,
        message: 'projectId is required for spatial generation',
        jobId: null,
        networkCallsMade: 0,
      };
    }

    // 2. HARD NETWORK LOCK CHECK (§P5.2)
    if (!this.remoteEnabled) {
      return {
        ok: false,
        status: ERROR_CODES.TRANSPORT_LOCKED,
        code: ERROR_CODES.TRANSPORT_LOCKED,
        message: 'Remote generation transport is locked. External network calls remain disabled.',
        jobId: null,
        networkCallsMade: 0,
      };
    }

    // 3. VALIDATE AND SERIALIZE PAYLOAD (§P5.3)
    let payload;
    try {
      payload = this.buildGenerationPayload(resolvedManifest, resolvedProjectId);
    } catch (err) {
      return {
        ok: false,
        status: JOB_STATES.FAILED,
        code: ERROR_CODES.INVALID_MANIFEST,
        message: err.message,
        jobId: null,
      };
    }

    // 4. IDEMPOTENCY CHECK (§P5.5)
    const idempotencyKey = payload.idempotencyKey;
    if (this.idempotencyMap.has(idempotencyKey)) {
      const existingJobId = this.idempotencyMap.get(idempotencyKey);
      const existingJob = this.activeJobs.get(existingJobId);
      if (existingJob) {
        return {
          ok: true,
          status: existingJob.status,
          jobId: existingJob.jobId,
          isDuplicate: true,
          idempotentReplay: true,
          phaseLabel: existingJob.phaseLabel,
          progress: existingJob.progress,
        };
      }
    }

    // 5. TRANSPORT EXECUTION (Mock, Stub, or Real)
    const endpointPath = DISCOVERED_ENDPOINTS.JOB_CREATE_ENDPOINT.replace(':id', encodeURIComponent(resolvedProjectId));
    const fullUrl = this.baseUrl + endpointPath;
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    let attempt = 0;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        let resData;

        if (this.transport && typeof this.transport.create === 'function') {
          resData = await this.transport.create(payload, {
            url: fullUrl,
            projectId: resolvedProjectId,
            headers: this.getAuthHeaders(),
            signal: abortController ? abortController.signal : null,
            timeout: this.timeoutMs,
          });
        } else {
          this.realNetworkStats.createCalls++;
          const timeoutId = setTimeout(() => { if (abortController) abortController.abort(); }, this.timeoutMs);

          const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
              ...this.getAuthHeaders(),
              'Content-Type': 'application/json',
              'x-idempotency-key': idempotencyKey,
            },
            body: JSON.stringify(payload),
            signal: abortController ? abortController.signal : null,
          });
          clearTimeout(timeoutId);

          if (!response.ok && response.status !== 202) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          resData = await response.json();
        }

        if (!resData || (!resData.jobId && !resData.id)) {
          throw new Error('Malformed response: missing jobId');
        }

        const jobId = resData.jobId || resData.id;
        const jobRecord = {
          jobId,
          projectId: resolvedProjectId,
          idempotencyKey,
          status: (resData.status || JOB_STATES.QUEUED).toUpperCase(),
          phaseLabel: PHASE_LABELS.QUEUED,
          progress: typeof resData.progress === 'number' ? resData.progress : null,
          pollingState: POLLING_STATES.IDLE,
          cancelScope: null,
          remoteJobCanceled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          candidateId: resData.candidateId || null,
          errorCode: null,
          attempts: attempt,
        };

        this.activeJobs.set(jobId, jobRecord);
        this.idempotencyMap.set(idempotencyKey, jobId);
        if (abortController) this.abortControllers.set(jobId, abortController);

        return {
          ok: true,
          status: jobRecord.status,
          jobId,
          isDuplicate: false,
          phaseLabel: jobRecord.phaseLabel,
          progress: jobRecord.progress,
          attempts: attempt,
        };

      } catch (err) {
        lastError = err;
        const isAbort = err.name === 'AbortError' || err.code === 'ABORT_ERR';
        if (isAbort) {
          return {
            ok: false,
            status: JOB_STATES.FAILED,
            code: ERROR_CODES.TIMEOUT_ERROR,
            message: `Request timed out after ${this.timeoutMs}ms`,
            attempts: attempt,
          };
        }

        if (attempt <= this.maxRetries) {
          const backoffMs = Math.min(100 * Math.pow(2, attempt), 2000);
          await new Promise(r => setTimeout(r, backoffMs));
        }
      }
    }

    return {
      ok: false,
      status: JOB_STATES.FAILED,
      code: ERROR_CODES.NETWORK_ERROR,
      message: lastError ? lastError.message : 'Maximum retry attempts exceeded',
      attempts: attempt,
    };
  }

  // ─── Status Query (§P5.7) ──────────────────────────────────────────────────
  async getGenerationStatus(jobId) {
    if (!jobId) {
      return { ok: false, code: ERROR_CODES.INVALID_MANIFEST, message: 'jobId is required' };
    }

    // Preservation of local CANCELED / STOPPED_BY_CLIENT status (§P5.0-B)
    const existingRecord = this.activeJobs.get(jobId);
    if (existingRecord && existingRecord.status === JOB_STATES.CANCELED) {
      return {
        ok: true,
        status: JOB_STATES.CANCELED,
        job: existingRecord,
        cancelScope: existingRecord.cancelScope || 'CLIENT_POLLING_ONLY',
        remoteJobCanceled: false,
        phaseLabel: 'Cancelled',
        progress: null,
      };
    }

    // Hard Network Lock Check (§P5.2)
    if (!this.remoteEnabled) {
      if (existingRecord) {
        return { ok: true, job: existingRecord, locked: true };
      }
      return {
        ok: false,
        status: ERROR_CODES.TRANSPORT_LOCKED,
        code: ERROR_CODES.TRANSPORT_LOCKED,
        message: 'Remote generation transport is locked.',
      };
    }

    const endpointPath = DISCOVERED_ENDPOINTS.JOB_STATUS_ENDPOINT.replace(':jobId', encodeURIComponent(jobId));
    const fullUrl = this.baseUrl + endpointPath;

    try {
      let resData;
      if (this.transport && typeof this.transport.status === 'function') {
        resData = await this.transport.status(jobId, { url: fullUrl });
      } else {
        this.realNetworkStats.statusCalls++;
        const response = await fetch(fullUrl, { headers: this.getAuthHeaders() });
        if (!response.ok) {
          return { ok: false, code: ERROR_CODES.SERVER_ERROR, status: JOB_STATES.FAILED, httpStatus: response.status };
        }
        resData = await response.json();
      }

      if (!resData || (!resData.job && !resData.status)) {
        return { ok: false, code: ERROR_CODES.MALFORMED_RESPONSE, message: 'Missing job data in status response' };
      }

      const remoteJob = resData.job || resData;
      const normalizedStatus = (remoteJob.status || '').toUpperCase();

      let localRecord = this.activeJobs.get(jobId) || { jobId };
      localRecord.status = normalizedStatus;
      localRecord.progress = typeof remoteJob.progress === 'number' ? remoteJob.progress : null;
      localRecord.phaseLabel = this.mapPhaseLabel(normalizedStatus, remoteJob.currentStage);
      localRecord.candidateId = remoteJob.candidateId || null;
      localRecord.updatedAt = new Date().toISOString();
      this.activeJobs.set(jobId, localRecord);

      return {
        ok: true,
        status: normalizedStatus,
        job: localRecord,
        phaseLabel: localRecord.phaseLabel,
        progress: localRecord.progress,
      };

    } catch (err) {
      return {
        ok: false,
        status: JOB_STATES.FAILED,
        code: ERROR_CODES.NETWORK_ERROR,
        message: err.message,
      };
    }
  }

  // ─── Status Polling Loop (§P5.7) ───────────────────────────────────────────
  async pollGenerationJob(jobId, options = {}) {
    const onProgress = options.onProgress || null;
    const interval = options.pollIntervalMs || this.pollIntervalMs;
    const timeout = options.timeoutMs || 60000;

    const pollController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (pollController) this.pollingAbortControllers.set(jobId, pollController);

    const startTime = Date.now();
    let currentJob = this.activeJobs.get(jobId);
    if (currentJob) currentJob.pollingState = POLLING_STATES.POLLING;

    while (!pollController || !pollController.signal.aborted) {
      if (Date.now() - startTime > timeout) {
        if (currentJob) currentJob.pollingState = POLLING_STATES.TIMED_OUT;
        return { ok: false, code: ERROR_CODES.TIMEOUT_ERROR, status: JOB_STATES.FAILED, message: 'Polling timeout exceeded' };
      }

      const statusRes = await this.getGenerationStatus(jobId);
      if (!statusRes.ok) {
        if (currentJob) currentJob.pollingState = POLLING_STATES.ERROR;
        return statusRes;
      }

      const currentStatus = statusRes.status;
      if (typeof onProgress === 'function') {
        onProgress(statusRes.progress, statusRes.phaseLabel, currentStatus);
      }

      // Terminal state check (§P5.7)
      if (currentStatus === JOB_STATES.SUCCEEDED || currentStatus === JOB_STATES.FAILED || currentStatus === JOB_STATES.CANCELED) {
        if (currentJob) {
          currentJob.pollingState = currentStatus === JOB_STATES.CANCELED
            ? POLLING_STATES.STOPPED_BY_CLIENT
            : POLLING_STATES.COMPLETED;
        }
        if (pollController) this.pollingAbortControllers.delete(jobId);
        return statusRes;
      }

      await new Promise(r => setTimeout(r, interval));
    }

    if (currentJob) currentJob.pollingState = POLLING_STATES.STOPPED_BY_CLIENT;
    return { ok: true, status: JOB_STATES.CANCELED, cancelScope: 'CLIENT_POLLING_ONLY', pollingState: POLLING_STATES.STOPPED_BY_CLIENT };
  }

  // ─── Client Polling Cancellation (§P5.0-B) ─────────────────────────────────
  async cancelGeneration(jobId) {
    if (!jobId) {
      return { ok: false, code: ERROR_CODES.INVALID_MANIFEST, message: 'jobId is required' };
    }

    // Abort request and polling flights locally
    if (this.abortControllers.has(jobId)) {
      try { this.abortControllers.get(jobId).abort(); } catch (e) {}
      this.abortControllers.delete(jobId);
    }
    if (this.pollingAbortControllers.has(jobId)) {
      try { this.pollingAbortControllers.get(jobId).abort(); } catch (e) {}
      this.pollingAbortControllers.delete(jobId);
    }

    // Explicit client-only cancellation record (§P5.0-B)
    let localJob = this.activeJobs.get(jobId);
    if (!localJob) {
      localJob = { jobId, status: JOB_STATES.CANCELED };
      this.activeJobs.set(jobId, localJob);
    }
    localJob.status = JOB_STATES.CANCELED;
    localJob.cancelScope = 'CLIENT_POLLING_ONLY';
    localJob.pollingState = POLLING_STATES.STOPPED_BY_CLIENT;
    localJob.remoteJobCanceled = false; // Must NEVER claim remote server cancellation
    localJob.updatedAt = new Date().toISOString();

    if (this.transport && typeof this.transport.cancel === 'function') {
      try { await this.transport.cancel(jobId); } catch (e) {}
    }

    return {
      ok: true,
      status: JOB_STATES.CANCELED,
      cancelScope: 'CLIENT_POLLING_ONLY',
      remoteJobCanceled: false,
      jobId,
      message: 'Polling stopped locally by client. Server job cancellation is unresolved.',
    };
  }

  // ─── Active Job Recovery (§P5.8) ───────────────────────────────────────────
  async getActiveJobForProject(projectId) {
    const resolvedProjectId = projectId || this.projectId;
    if (!resolvedProjectId) {
      return { ok: false, code: ERROR_CODES.MISSING_PROJECT_ID, message: 'projectId is required' };
    }

    if (!this.remoteEnabled) {
      return {
        ok: false,
        status: ERROR_CODES.TRANSPORT_LOCKED,
        code: ERROR_CODES.TRANSPORT_LOCKED,
        message: 'Remote generation transport is locked.',
      };
    }

    const endpointPath = DISCOVERED_ENDPOINTS.JOB_PROJECT_STATUS.replace(':id', encodeURIComponent(resolvedProjectId));
    const fullUrl = this.baseUrl + endpointPath;

    try {
      let resData;
      if (this.transport && typeof this.transport.getActiveJob === 'function') {
        resData = await this.transport.getActiveJob(resolvedProjectId, { url: fullUrl });
      } else {
        this.realNetworkStats.activeJobCalls++;
        const response = await fetch(fullUrl, { headers: this.getAuthHeaders() });
        if (!response.ok) {
          return { ok: false, code: ERROR_CODES.SERVER_ERROR, httpStatus: response.status };
        }
        resData = await response.json();
      }

      return {
        ok: true,
        job: resData.job || null,
      };
    } catch (err) {
      return { ok: false, code: ERROR_CODES.NETWORK_ERROR, message: err.message };
    }
  }

  // ─── Candidate Apply / Discard Contract (§P5.9) ────────────────────────────
  async getCandidate(projectId, candidateId) {
    const pId = projectId || this.projectId;
    if (!pId || !candidateId) return { ok: false, code: ERROR_CODES.INVALID_MANIFEST };
    if (!this.remoteEnabled) return { ok: false, status: ERROR_CODES.TRANSPORT_LOCKED };

    const url = this.baseUrl + DISCOVERED_ENDPOINTS.JOB_CANDIDATE_ENDPOINT
      .replace(':id', encodeURIComponent(pId))
      .replace(':candidateId', encodeURIComponent(candidateId));

    try {
      let resData;
      if (this.transport && typeof this.transport.getCandidate === 'function') {
        resData = await this.transport.getCandidate(pId, candidateId, { url });
      } else {
        this.realNetworkStats.candidateCalls++;
        const res = await fetch(url, { headers: this.getAuthHeaders() });
        resData = await res.json();
      }
      return { ok: true, candidate: resData.candidate || null };
    } catch (e) {
      return { ok: false, code: ERROR_CODES.NETWORK_ERROR, message: e.message };
    }
  }

  async applyCandidate(projectId, candidateId) {
    const pId = projectId || this.projectId;
    if (!pId || !candidateId) return { ok: false, code: ERROR_CODES.INVALID_MANIFEST };
    if (!this.remoteEnabled) return { ok: false, status: ERROR_CODES.TRANSPORT_LOCKED };

    const url = this.baseUrl + DISCOVERED_ENDPOINTS.JOB_APPLY_ENDPOINT.replace(':id', encodeURIComponent(pId));
    try {
      let resData;
      if (this.transport && typeof this.transport.applyCandidate === 'function') {
        resData = await this.transport.applyCandidate(pId, candidateId, { url });
      } else {
        this.realNetworkStats.applyCalls++;
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId }),
        });
        resData = await res.json();
      }
      return { ok: true, result: resData };
    } catch (e) {
      return { ok: false, code: ERROR_CODES.NETWORK_ERROR, message: e.message };
    }
  }

  async discardCandidate(projectId, candidateId) {
    const pId = projectId || this.projectId;
    if (!pId || !candidateId) return { ok: false, code: ERROR_CODES.INVALID_MANIFEST };
    if (!this.remoteEnabled) return { ok: false, status: ERROR_CODES.TRANSPORT_LOCKED };

    const url = this.baseUrl + DISCOVERED_ENDPOINTS.JOB_DISCARD_ENDPOINT.replace(':id', encodeURIComponent(pId));
    try {
      let resData;
      if (this.transport && typeof this.transport.discardCandidate === 'function') {
        resData = await this.transport.discardCandidate(pId, candidateId, { url });
      } else {
        this.realNetworkStats.discardCalls++;
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId }),
        });
        resData = await res.json();
      }
      return { ok: true, result: resData };
    } catch (e) {
      return { ok: false, code: ERROR_CODES.NETWORK_ERROR, message: e.message };
    }
  }

  mapPhaseLabel(status, stage) {
    if (stage) {
      const stageNorm = String(stage).toUpperCase();
      if (stageNorm.includes('PREPAR') || stageNorm.includes('UPLOAD')) return PHASE_LABELS.UPLOADING;
      if (stageNorm.includes('QUEU')) return PHASE_LABELS.QUEUED;
      if (stageNorm.includes('SAV') || stageNorm.includes('FINAL')) return PHASE_LABELS.FINALIZING;
      if (stageNorm.includes('COMPLET') || stageNorm.includes('DONE')) return PHASE_LABELS.COMPLETED;
      return PHASE_LABELS.PROCESSING;
    }

    switch (status) {
      case JOB_STATES.SUBMITTING: return PHASE_LABELS.UPLOADING;
      case JOB_STATES.QUEUED:     return PHASE_LABELS.QUEUED;
      case JOB_STATES.PROCESSING: return PHASE_LABELS.PROCESSING;
      case JOB_STATES.SUCCEEDED:  return PHASE_LABELS.COMPLETED;
      default:                    return status;
    }
  }

  getAuthHeaders() {
    const headers = {};
    if (this.authToken) {
      headers['Authorization'] = 'Bearer ' + this.authToken;
      headers['x-booth-edit-token'] = this.authToken;
    }
    if (this.customerEmail) {
      headers['x-customer-email'] = this.customerEmail;
    }
    return headers;
  }

  reset() {
    for (const [id, ctrl] of this.abortControllers.entries()) {
      try { ctrl.abort(); } catch (e) {}
    }
    for (const [id, ctrl] of this.pollingAbortControllers.entries()) {
      try { ctrl.abort(); } catch (e) {}
    }
    this.abortControllers.clear();
    this.pollingAbortControllers.clear();
    this.activeJobs.clear();
    this.idempotencyMap.clear();
    this.realNetworkStats = {
      createCalls: 0,
      statusCalls: 0,
      cancelCalls: 0,
      candidateCalls: 0,
      applyCalls: 0,
      discardCalls: 0,
      activeJobCalls: 0,
    };
  }
}

// ─── Module & Window Exports ─────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.Stage2GenerationAdapter = Stage2GenerationAdapter;
  window.STAGE2_CANONICAL_SOURCE_TYPES = CANONICAL_SOURCE_TYPES;
  window.STAGE2_JOB_STATES = JOB_STATES;
  window.STAGE2_POLLING_STATES = POLLING_STATES;
  window.STAGE2_PHASE_LABELS = PHASE_LABELS;
  window.STAGE2_DISCOVERED_ENDPOINTS = DISCOVERED_ENDPOINTS;
  window.STAGE2_ERROR_CODES = ERROR_CODES;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Stage2GenerationAdapter,
    CANONICAL_SOURCE_TYPES,
    JOB_STATES,
    POLLING_STATES,
    PHASE_LABELS,
    DISCOVERED_ENDPOINTS,
    ERROR_CODES,
    normalizeSourceType,
  };
}
