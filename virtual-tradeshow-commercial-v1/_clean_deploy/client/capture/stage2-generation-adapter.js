/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3DZ / ³D₂ STAGE 2 — GENERATION ADAPTER (DARK INTEGRATION)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single generation adapter consuming Schema 5 normalized capture manifests
 * from both CAMERA_ROTATIONAL_SENSOR and MANUAL_PHOTO_UPLOAD sources.
 *
 * HARD NETWORK LOCK ENFORCED:
 *   remoteEnabled = false by default.
 *   createGenerationRequest() strictly returns GENERATION_TRANSPORT_DISABLED
 *   without contacting any remote network endpoints when locked.
 *
 * Discovered Endpoints:
 *   JOB_CREATE_ENDPOINT: /api/projects/:id/spatial/start (alias: /spatial/generate)
 *   JOB_STATUS_ENDPOINT: /api/spatial-jobs/:jobId
 *   JOB_CANCEL_ENDPOINT: UNRESOLVED (Client AbortController only; no backend endpoint)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = typeof require !== 'undefined' ? require('crypto') : null;

// ─── Constants & Discovered Endpoints ────────────────────────────────────────
const DISCOVERED_ENDPOINTS = Object.freeze({
  JOB_CREATE_ENDPOINT: '/api/projects/:id/spatial/start',
  JOB_CREATE_ALIAS:    '/api/projects/:id/spatial/generate',
  JOB_STATUS_ENDPOINT: '/api/spatial-jobs/:jobId',
  JOB_PROJECT_STATUS:  '/api/projects/:id/spatial/job',
  JOB_CANCEL_ENDPOINT: 'UNRESOLVED', // No backend endpoint exists; local AbortController
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

const PHASE_LABELS = Object.freeze({
  UPLOADING:  'Uploading',
  QUEUED:     'Queued',
  PROCESSING: 'Processing',
  FINALIZING: 'Finalizing',
  COMPLETED:  'Completed',
});

const ERROR_CODES = Object.freeze({
  TRANSPORT_LOCKED:    'GENERATION_TRANSPORT_DISABLED',
  INVALID_MANIFEST:    'INVALID_MANIFEST',
  NETWORK_ERROR:       'NETWORK_ERROR',
  TIMEOUT_ERROR:       'TIMEOUT_ERROR',
  SERVER_ERROR:        'SERVER_ERROR',
  IDEMPOTENCY_CONFLICT:'IDEMPOTENCY_CONFLICT',
  CANCELED:            'JOB_CANCELED',
  MALFORMED_RESPONSE:  'MALFORMED_RESPONSE',
});

// ─── Single Generation Adapter Class ────────────────────────────────────────
class Stage2GenerationAdapter {
  constructor(config = {}) {
    // Hard Network Lock: strictly false by default (§P4.2)
    this.remoteEnabled = config.remoteEnabled === true;
    this.projectId = config.projectId || 'default-stage2-project';
    this.authToken = config.authToken || null;
    this.customerEmail = config.customerEmail || null;
    this.maxRetries = typeof config.maxRetries === 'number' ? config.maxRetries : 3;
    this.timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 10000;

    // Transport layer: null uses fetch in browser/node when unlocked; or injected mock
    this.transport = config.transport || null;

    // Local state and idempotency registries
    this.activeJobs = new Map();         // jobId -> JobRecord
    this.idempotencyMap = new Map();     // idempotencyKey -> jobId
    this.abortControllers = new Map();   // jobId -> AbortController

    // Real network call monitoring (§P4.8)
    this.realNetworkStats = {
      createCalls: 0,
      statusCalls: 0,
      cancelCalls: 0,
    };
  }

  // ─── Idempotency Key Computation (§P4.5) ──────────────────────────────────
  computeIdempotencyKey(manifest) {
    if (!manifest || typeof manifest !== 'object') return null;
    const captureId = manifest.captureId || 'unknown-capture';
    const sourceType = manifest.sourceType || 'UNKNOWN';
    const frameCount = manifest.frameCount || (manifest.frames ? manifest.frames.length : 0);
    const frameFingerprints = Array.isArray(manifest.frames)
      ? manifest.frames.map(f => f.imageHash || f.frameId || '').join(',')
      : '';

    const rawKey = `${captureId}:${sourceType}:${frameCount}:${frameFingerprints}`;

    if (crypto && typeof crypto.createHash === 'function') {
      return 'idem-' + crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 32);
    }

    // Browser fallback hash
    let hash = 0;
    for (let i = 0; i < rawKey.length; i++) {
      hash = ((hash << 5) - hash) + rawKey.charCodeAt(i);
      hash |= 0;
    }
    return 'idem-' + Math.abs(hash).toString(16).padStart(16, '0');
  }

  // ─── Request Contract Builder (§P4.4) ─────────────────────────────────────
  buildGenerationPayload(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest is required');
    }
    if (manifest.schemaVersion !== 5) {
      throw new Error(`Unsupported manifest schemaVersion: ${manifest.schemaVersion}. Required: 5`);
    }
    if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
      throw new Error('Manifest frames array must not be empty');
    }

    const idempotencyKey = this.computeIdempotencyKey(manifest);

    // Deep preservation of frame contracts
    const normalizedFrames = manifest.frames.map((frame, idx) => {
      const isSensorDerived = manifest.sourceType === 'CAMERA_ROTATIONAL_SENSOR';

      return {
        frameId: frame.frameId,
        order: frame.order || idx + 1,
        imageHash: frame.imageHash,
        timestamp: frame.timestamp,
        width: frame.width || 1920,
        height: frame.height || 1080,
        qualityScore: typeof frame.qualityScore === 'number' ? frame.qualityScore : 0.85,
        // Preservation rule: Camera frames retain valid sensors; Upload frames remain UNKNOWN/null
        orientationStatus: isSensorDerived ? (frame.orientationStatus || 'SENSOR_DERIVED') : 'UNKNOWN',
        yawDeg: isSensorDerived ? (frame.yawDeg !== undefined ? frame.yawDeg : null) : null,
        pitchDeg: isSensorDerived ? (frame.pitchDeg !== undefined ? frame.pitchDeg : null) : null,
        rollDeg: isSensorDerived ? (frame.rollDeg !== undefined ? frame.rollDeg : null) : null,
        angularVelocityDegSec: isSensorDerived ? (frame.angularVelocityDegSec || null) : null,
        targetIndex: isSensorDerived ? (frame.targetIndex !== undefined ? frame.targetIndex : idx) : null,
        targetYawDeg: isSensorDerived ? (frame.targetYawDeg !== undefined ? frame.targetYawDeg : idx * 30.0) : null,
        yawErrorDeg: isSensorDerived ? (frame.yawErrorDeg !== undefined ? frame.yawErrorDeg : 0.0) : null,
        adjacency: frame.adjacency ? {
          prevFrameId: frame.adjacency.prevFrameId,
          nextFrameId: frame.adjacency.nextFrameId,
          sequentialOrder: frame.adjacency.sequentialOrder || idx + 1,
        } : null,
      };
    });

    return {
      schemaVersion: 5,
      idempotencyKey,
      captureId: manifest.captureId,
      sourceType: manifest.sourceType,
      frameCount: manifest.frameCount || normalizedFrames.length,
      c12_7_ringConstraintPreserved: Boolean(manifest.c12_7_ringConstraintPreserved),
      captureOrder: manifest.captureOrder || normalizedFrames.map(f => f.frameId),
      createdAt: manifest.createdAt || new Date().toISOString(),
      frames: normalizedFrames,
    };
  }

  // ─── P4.1 & P4.2: Create Generation Request with Hard Network Lock ──────────
  async createGenerationRequest(manifest) {
    // 1. HARD NETWORK LOCK CHECK (§P4.2)
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

    // 2. Validate and build payload (§P4.4)
    let payload;
    try {
      payload = this.buildGenerationPayload(manifest);
    } catch (err) {
      return {
        ok: false,
        status: JOB_STATES.FAILED,
        code: ERROR_CODES.INVALID_MANIFEST,
        message: err.message,
        jobId: null,
      };
    }

    // 3. IDEMPOTENCY CHECK (§P4.5)
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

    // 4. Transport Execution (Mock or Real)
    const url = DISCOVERED_ENDPOINTS.JOB_CREATE_ENDPOINT.replace(':id', this.projectId);
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    let attempt = 0;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        let resData;

        if (this.transport && typeof this.transport.create === 'function') {
          // Use configured transport mock
          resData = await this.transport.create(payload, {
            url,
            projectId: this.projectId,
            headers: this.getAuthHeaders(),
            signal: abortController ? abortController.signal : null,
            timeout: this.timeoutMs,
          });
        } else {
          // Real network execution (only reachable if remoteEnabled = true)
          this.realNetworkStats.createCalls++;
          const timeoutId = setTimeout(() => { if (abortController) abortController.abort(); }, this.timeoutMs);

          const response = await fetch(url, {
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
          idempotencyKey,
          status: resData.status || JOB_STATES.QUEUED,
          phaseLabel: PHASE_LABELS.QUEUED,
          progress: typeof resData.progress === 'number' ? resData.progress : null,
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

        // Retry on transient errors if attempts remain
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

  // ─── P4.1 & P4.6: Get Generation Status ────────────────────────────────────
  async getGenerationStatus(jobId) {
    if (!jobId) {
      return { ok: false, code: ERROR_CODES.INVALID_MANIFEST, message: 'jobId is required' };
    }

    // If local record is already CANCELED, preserve client-authoritative cancellation
    const existingRecord = this.activeJobs.get(jobId);
    if (existingRecord && existingRecord.status === JOB_STATES.CANCELED) {
      return {
        ok: true,
        status: JOB_STATES.CANCELED,
        job: existingRecord,
        phaseLabel: 'Cancelled',
        progress: null,
      };
    }

    // If remote transport is locked and we have local record, return local state
    if (!this.remoteEnabled) {
      const localJob = this.activeJobs.get(jobId);
      if (localJob) {
        return { ok: true, job: localJob, locked: true };
      }
      return {
        ok: false,
        status: ERROR_CODES.TRANSPORT_LOCKED,
        code: ERROR_CODES.TRANSPORT_LOCKED,
        message: 'Remote generation transport is locked.',
      };
    }

    const url = DISCOVERED_ENDPOINTS.JOB_STATUS_ENDPOINT.replace(':jobId', jobId);

    try {
      let resData;
      if (this.transport && typeof this.transport.status === 'function') {
        resData = await this.transport.status(jobId, { url });
      } else {
        this.realNetworkStats.statusCalls++;
        const response = await fetch(url, { headers: this.getAuthHeaders() });
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

      // Update local record
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

  // ─── P4.1 & P4.6: Cancel Generation ───────────────────────────────────────
  async cancelGeneration(jobId) {
    if (!jobId) {
      return { ok: false, code: ERROR_CODES.INVALID_MANIFEST, message: 'jobId is required' };
    }

    // Abort local flight if in flight
    if (this.abortControllers.has(jobId)) {
      try {
        this.abortControllers.get(jobId).abort();
      } catch (e) {}
      this.abortControllers.delete(jobId);
    }

    // Transition local job state to CANCELED
    const localJob = this.activeJobs.get(jobId);
    if (localJob) {
      localJob.status = JOB_STATES.CANCELED;
      localJob.phaseLabel = 'Cancelled';
      localJob.updatedAt = new Date().toISOString();
      this.activeJobs.set(jobId, localJob);
    }

    // If transport has cancel handler, invoke mock cancel
    if (this.transport && typeof this.transport.cancel === 'function') {
      try {
        await this.transport.cancel(jobId);
      } catch (e) {}
    }

    // Backend has no server-side cancel endpoint (UNRESOLVED); cancellation is client-authoritative
    return {
      ok: true,
      status: JOB_STATES.CANCELED,
      jobId,
      message: 'Generation job cancelled locally (client-authoritative).',
    };
  }

  // ─── Phase Label Mapping (No Fake Backend Progress §P4.6) ──────────────────
  mapPhaseLabel(status, stage) {
    if (stage) {
      const stageNorm = String(stage).toUpperCase();
      if (stageNorm.includes('PREPAR') || stageNorm.includes('UPLOAD')) return PHASE_LABELS.UPLOADING;
      if (stageNorm.includes('QUEU')) return PHASE_LABELS.QUEUED;
      if (stageNorm.includes('SAVE') || stageNorm.includes('FINAL')) return PHASE_LABELS.FINALIZING;
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
    this.abortControllers.clear();
    this.activeJobs.clear();
    this.idempotencyMap.clear();
    this.realNetworkStats = { createCalls: 0, statusCalls: 0, cancelCalls: 0 };
  }
}

// ─── Module & Window Exports ─────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.Stage2GenerationAdapter = Stage2GenerationAdapter;
  window.STAGE2_JOB_STATES = JOB_STATES;
  window.STAGE2_PHASE_LABELS = PHASE_LABELS;
  window.STAGE2_DISCOVERED_ENDPOINTS = DISCOVERED_ENDPOINTS;
  window.STAGE2_ERROR_CODES = ERROR_CODES;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Stage2GenerationAdapter,
    JOB_STATES,
    PHASE_LABELS,
    DISCOVERED_ENDPOINTS,
    ERROR_CODES,
  };
}
