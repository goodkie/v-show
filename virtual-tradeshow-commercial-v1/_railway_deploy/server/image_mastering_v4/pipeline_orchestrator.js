/**
 * ³DNa AI BOOTH IMAGE MASTERING V4 — MASTER PIPELINE ORCHESTRATOR
 * Module: pipeline_orchestrator.js
 * Directive: Section 3 (Source Lineage), Section 55 (Fail-Closed Enhancement), Section 66 (Async Orchestration), Section 74 (Final Acceptance)
 */

const fs = require('fs');
const path = require('path');
const SourceForensics = require('./forensics');
const CommercialContentLock = require('./commercial_lock');
const SafeBystanderRemover = require('./person_remover');
const { TightCropper, RealAIRestoration, RealAISuperResolution } = require('./ai_restoration');
const { DetailAndColorEnhancer, MasterNormalizer, CommercialFidelityQA } = require('./fidelity_qa');

class PipelineOrchestrator {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Process a customer booth photo through the complete V4 Absolute Fidelity pipeline
   * @param {string} sourcePath Path to raw source image
   * @param {Object} options Execution parameters and metadata
   * @returns {Object} Complete production report and artifacts
   */
  async processBoothImage(sourcePath, options = {}) {
    const jobId = options.jobId || `master_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();
    const planTier = options.planTier || 'PRO'; // FREE | PRO | BUSINESS | CUSTOM

    const jobRecord = {
      jobId,
      pipelineVersion: '3DNA_AI_IMAGE_MASTERING_V4_ABSOLUTE_FIDELITY',
      planTier,
      status: 'PROCESSING',
      stages: [],
      createdAt: new Date().toISOString()
    };
    this.jobs.set(jobId, jobRecord);

    const logStage = (stageName, stageData) => {
      jobRecord.stages.push({ stage: stageName, timestamp: new Date().toISOString(), ...stageData });
    };

    try {
      // ── STAGE 1: SOURCE FORENSICS & QUALITY AUDIT ──
      const sourceInfo = SourceForensics.auditSource(sourcePath, options.sourceMetadata || {});
      logStage('SOURCE_FORENSICS', { quality: sourceInfo.qualityClassification, score: sourceInfo.sourceQualityScore });

      if (sourceInfo.isRejected) {
        jobRecord.status = 'SOURCE_REJECTED';
        jobRecord.rejectionReason = sourceInfo.rejectionReason;
        jobRecord.badImageConsumesFreeAllowance = false;
        return { success: false, jobRecord, masterStatus: 'SOURCE_REJECTED' };
      }

      // ── STAGE 2: SEMANTIC SCENE & COMMERCIAL CONTENT LOCK ──
      const lockData = CommercialContentLock.analyzeAndLock(sourceInfo, options.annotations || {});
      logStage('COMMERCIAL_CONTENT_LOCK', { entitiesProtected: lockData.immutableEntityCounts });

      // ── STAGE 3: PERSON DETECTION & RISK CLASSIFICATION ──
      const personAnalysis = SafeBystanderRemover.detectAndClassifyPeople(sourceInfo, lockData, options.peopleDetections || []);
      logStage('PERSON_DETECTION', { total: personAnalysis.peopleDetectedTotal, safe: personAnalysis.safeToRemoveCount, manual: personAnalysis.manualReviewCount });

      // ── STAGE 4: SAFE BYSTANDER REMOVAL ──
      const outputDir = options.outputDir || path.dirname(sourcePath);
      const baseName = options.baseName || `booth_master_v4_${jobId}`;
      const humanRemovalResult = SafeBystanderRemover.executeSafeRemoval(sourcePath, personAnalysis, lockData, outputDir, baseName);
      logStage('SAFE_HUMAN_REMOVAL', { removed: humanRemovalResult.removedCount, pass: humanRemovalResult.humanRemovalQaPass });

      // ── STAGE 5: TIGHT 16:9 CROPPING (85-90% OCCUPANCY) ──
      const cropInfo = TightCropper.calculateTightCrop(sourceInfo, lockData);
      logStage('TIGHT_CROPPING', { ratio: cropInfo.targetAspectRatio, occupancyBefore: cropInfo.occupancyBefore, occupancyAfter: cropInfo.occupancyAfter });

      // ── STAGE 6: REAL AI RESTORATION ──
      const restorationResult = RealAIRestoration.restore(sourcePath, sourceInfo);
      logStage('AI_RESTORATION', { engine: restorationResult.restorationEngine, model: restorationResult.restorationModel });

      // ── STAGE 7: REAL AI SUPER-RESOLUTION ──
      const srResult = await RealAISuperResolution.upscale(sourceInfo, cropInfo, 7680, 4320);
      logStage('AI_SUPER_RESOLUTION', { engine: srResult.aiSrEngine, scale: srResult.aiSrScaleFactor, tier: srResult.aiSrTier });

      // ── STAGE 8: DETAIL RECOVERY & COLOR ENHANCEMENT ──
      const enhancerResult = DetailAndColorEnhancer.enhance(srResult, lockData);
      logStage('DETAIL_COLOR_ENHANCEMENT', { deltaE: enhancerResult.brandColorDeltaE });

      // ── STAGE 9: 8K UHD PNG NORMALIZATION & DERIVATIVES ──
      const masterData = MasterNormalizer.normalize8K(srResult, enhancerResult, outputDir, options.baseName || `booth_master_v4_${jobId}`, sourcePath);
      logStage('8K_MASTER_NORMALIZATION', { masterResolution: `${masterData.masterWidth}x${masterData.masterHeight}`, format: masterData.masterFormat });

      // ── STAGE 10: FORENSIC FIDELITY QA & BENCHMARK AUDIT ──
      const qaResult = CommercialFidelityQA.executeFidelityAudit(sourceInfo, lockData, personAnalysis, masterData);
      logStage('COMMERCIAL_FIDELITY_QA', { status: qaResult.masterStatus, allPassed: qaResult.allGatesPassed });

      jobRecord.status = qaResult.masterStatus;
      jobRecord.masterStatus = qaResult.masterStatus;
      jobRecord.completedAt = new Date().toISOString();
      jobRecord.totalProcessingTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(2));

      const finalReport = {
        jobId,
        pipelineVersion: '3DNA_AI_IMAGE_MASTERING_V4_ABSOLUTE_FIDELITY',
        planTier,
        masterStatus: qaResult.masterStatus,
        sourceLineage: {
          originalSourceId: sourceInfo.sourceId,
          originalSourcePreserved: true,
          originalSourceMutated: false,
          originalResolution: `${sourceInfo.sourceWidth}x${sourceInfo.sourceHeight}`,
          originalFormat: sourceInfo.sourceFormat
        },
        boothOccupancy: {
          before: cropInfo.occupancyBefore,
          after: cropInfo.occupancyAfter,
          targetRatio: cropInfo.targetAspectRatio
        },
        aiEngines: {
          restorationEngine: restorationResult.restorationEngine,
          restorationModel: restorationResult.restorationModel,
          srEngine: srResult.aiSrEngine,
          srModel: srResult.aiSrModel,
          srScaleFactor: srResult.aiSrScaleFactor,
          srTier: srResult.aiSrTier,
          runtime: srResult.aiSrRuntime,
          device: srResult.aiSrDevice
        },
        commercialFidelityGates: qaResult.gates,
        mutations: qaResult.mutations,
        abBenchmark: qaResult.abBenchmark,
        canonicalMaster: masterData,
        processingTimeSec: jobRecord.totalProcessingTimeSec,
        decoupledPipelines: {
          photoImmersiveVisualSource: 'AI_ENHANCED_FIDELITY_VERIFIED_8K_PNG_MASTER',
          authentic3dGeometrySource: 'ORIGINAL_RECONSTRUCTION_SAFE_SOURCE'
        }
      };

      return {
        success: qaResult.masterStatus === 'APPROVED',
        finalReport,
        jobRecord
      };
    } catch (err) {
      jobRecord.status = 'ERROR';
      jobRecord.error = err.message;
      return { success: false, error: err.message, jobRecord };
    }
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }
}

const defaultOrchestrator = new PipelineOrchestrator();
module.exports = { PipelineOrchestrator, defaultOrchestrator };