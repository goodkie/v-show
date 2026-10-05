/**
 * Round 123 P0 Patch: Repair Viewer Handoff, Mobile Landscape Default & Telemetry Retention
 *
 * 1. Retain Measured Camera Dimensions across capture teardown so diagnostic JSON doesn't revert to 0x0.
 * 2. Add Bounded Post-Capture Diagnostics to RILiveDiagnosticHelper:
 *    - recordMilestone(type, details)
 *    - recordUploadStatus(candidateId, status, error)
 *    - recordPanoramaJob(jobId, status, progress, url, error)
 *    - recordViewerOutcome(surface, status, url, error)
 *    - Export in getFullDiagnosticDump()
 * 3. URL Router: Support guided=1 as direct wizard intent routing to Step 6.
 * 4. Pipeline Repair:
 *    - SetupWizard onComplete, startPanoramaFromGuidedCapture, and job polling record milestones.
 *    - When panorama reaches READY, propagate candidate to activeProjectData.panoramaVersions and activePanoramaVersionId.
 *    - On closing wizard or completing Step 12, explicitly call mountActivePanoramicBoothViewer(activeProjectData, bg)
 *      so #viewer-container renders the stitched 360 panorama immediately.
 * 5. Mobile Landscape Default on BOTH Viewer Surfaces:
 *    - 16:9 container default on preview (Step 7/11) and official active viewer (#viewer-container).
 *    - Add [ ⛶ Landscape ] button requesting fullscreen + orientation lock.
 *    - Add non-intrusive rotate prompt when in portrait mode on mobile with dismiss & enter actions.
 *    - Scope boundary: Upright portrait capture in Step 6 is completely preserved.
 */

const fs = require('fs');
const path = require('path');

const targetFiles = [
  'virtual-tradeshow-commercial-v1/client/index.html',
  'virtual-tradeshow-commercial-v1/index.html',
  'virtual-tradeshow-commercial-v1/app_build/client/index.html',
  'virtual-tradeshow-commercial-v1/app_build/index.html',
  'virtual-tradeshow-commercial-v1/_railway_deploy/client/index.html',
  'virtual-tradeshow-commercial-v1/_railway_deploy/index.html',
  'virtual-tradeshow-commercial-v1/_clean_deploy/client/index.html',
  'virtual-tradeshow-commercial-v1/_clean_deploy/index.html'
];

let successCount = 0;

for (const relPath of targetFiles) {
  const fullPath = path.resolve('c:/Users/server4/ai/v-show-stage2-fast-track', relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn('File not found:', fullPath);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let patchApplied = false;

  // ── 1. RILiveDiagnosticHelper: Add post-capture diagnostic methods & retain measured capture dimensions ──
  if (!content.includes('recordMeasuredCameraDimensions(width, height)')) {
    const target1 = `  initSession(sessionEpoch = 0) {`;
    const replace1 = `  recordMeasuredCameraDimensions(width, height) {
    if (width > 0 && height > 0) {
      this.measuredCaptureDimensions = { width, height };
    }
  }

  recordMilestone(type, details = {}) {
    if (!this.isEnabled) return;
    const entry = { type, details, timestamp: Date.now(), elapsedMs: Date.now() - this.startTime };
    if (!this.milestones) this.milestones = [];
    if (this.milestones.length < 500) this.milestones.push(entry);
  }

  recordUploadStatus(candidateId, status, error = null) {
    if (!this.isEnabled) return;
    if (!this.uploadStatuses) this.uploadStatuses = [];
    if (this.uploadStatuses.length < 200) {
      this.uploadStatuses.push({
        candidateId,
        status,
        error: error ? (error.message || String(error)) : null,
        timestamp: Date.now()
      });
    }
  }

  recordPanoramaJob(jobId, status, progress, url = null, error = null) {
    if (!this.isEnabled) return;
    if (!this.panoramaJobs) this.panoramaJobs = [];
    if (this.panoramaJobs.length < 200) {
      this.panoramaJobs.push({
        jobId,
        status,
        progress,
        url,
        error: error ? (error.message || String(error)) : null,
        timestamp: Date.now()
      });
    }
  }

  recordViewerOutcome(surface, status, url = null, error = null) {
    if (!this.isEnabled) return;
    if (!this.viewerOutcomes) this.viewerOutcomes = [];
    if (this.viewerOutcomes.length < 100) {
      this.viewerOutcomes.push({
        surface,
        status,
        url,
        error: error ? (error.message || String(error)) : null,
        timestamp: Date.now()
      });
    }
  }

  initSession(sessionEpoch = 0) {`;
    content = content.replace(target1, replace1);
    patchApplied = true;
  }

  // 1b. In initSession, initialize new tracking buffers
  if (!content.includes('this.measuredCaptureDimensions = null;')) {
    const target1b = `    this.allClosures = [];\n    this.sessionEpoch = sessionEpoch;`;
    const replace1b = `    this.allClosures = [];
    this.sessionEpoch = sessionEpoch;
    this.milestones = [];
    this.uploadStatuses = [];
    this.panoramaJobs = [];
    this.viewerOutcomes = [];
    this.measuredCaptureDimensions = null;`;
    content = content.replace(target1b, replace1b);
    patchApplied = true;
  }

  // 1c. In getCameraDimensions, record measured dimensions if live
  if (!content.includes('this.recordMeasuredCameraDimensions(ctrl.videoElement.videoWidth')) {
    const target1c = `if (ctrl.videoElement.videoWidth > 0 && ctrl.videoElement.videoHeight > 0) {
              return { width: ctrl.videoElement.videoWidth, height: ctrl.videoElement.videoHeight };
            }`;
    const replace1c = `if (ctrl.videoElement.videoWidth > 0 && ctrl.videoElement.videoHeight > 0) {
              this.recordMeasuredCameraDimensions(ctrl.videoElement.videoWidth, ctrl.videoElement.videoHeight);
              return { width: ctrl.videoElement.videoWidth, height: ctrl.videoElement.videoHeight };
            }`;
    content = content.replace(target1c, replace1c);
    patchApplied = true;
  }

  // 1d. In getFullDiagnosticDump, resolve final cameraDimensions from live OR measured dimensions, and include post-capture arrays
  if (!content.includes('postCaptureMilestones: this.milestones || [],')) {
    const target1d = `  getFullDiagnosticDump() {
    return {
      sessionId: this.sessionId,
      commitSha: (typeof window !== 'undefined' && window.__3DZ_BUILD_INFO__?.gitCommit) ? window.__3DZ_BUILD_INFO__.gitCommit : 'UNKNOWN',
      startedAt: new Date(this.startTime).toISOString(),
      environment: {
        userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : '',
        viewport: (typeof window !== 'undefined') ? { width: window.innerWidth, height: window.innerHeight } : {},
        devicePixelRatio: (typeof window !== 'undefined') ? (window.devicePixelRatio || 1) : 1,
        cameraDimensions: this.getCameraDimensions()
      },`;
    const replace1d = `  getFullDiagnosticDump() {
    const liveDims = this.getCameraDimensions();
    const ctrl = (typeof window !== 'undefined') ? (window.setupWizard?.guidedCaptureController || window.guidedCaptureController) : null;
    const measuredDims = this.measuredCaptureDimensions || (ctrl && ctrl.measuredCameraDimensions) || null;
    const finalDims = (liveDims && liveDims.width > 0 && liveDims.height > 0) ? liveDims : (measuredDims || liveDims);

    return {
      sessionId: this.sessionId,
      commitSha: (typeof window !== 'undefined' && window.__3DZ_BUILD_INFO__?.gitCommit) ? window.__3DZ_BUILD_INFO__.gitCommit : 'UNKNOWN',
      startedAt: new Date(this.startTime).toISOString(),
      environment: {
        userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : '',
        viewport: (typeof window !== 'undefined') ? { width: window.innerWidth, height: window.innerHeight } : {},
        devicePixelRatio: (typeof window !== 'undefined') ? (window.devicePixelRatio || 1) : 1,
        cameraDimensions: finalDims,
        measuredCaptureDimensions: measuredDims
      },
      postCaptureMilestones: this.milestones || [],
      candidateUploads: this.uploadStatuses || [],
      panoramaJobs: this.panoramaJobs || [],
      viewerViews: this.viewerOutcomes || [],`;
    content = content.replace(target1d, replace1d);
    patchApplied = true;
  }

  // ── 2. GuidedCaptureController: Record measured dimensions during active frames ──
  if (!content.includes('this.measuredCameraDimensions = { width: vw, height: vh };\n    if (this.riDiagnosticHelper')) {
    const target2 = `    // C12.9-P2: Preserve aspect ratio: scale long side to 320
    const vw = this.videoElement.videoWidth;
    const vh = this.videoElement.videoHeight;
    let targetW, targetH;`;
    const replace2 = `    // C12.9-P2: Preserve aspect ratio: scale long side to 320
    const vw = this.videoElement.videoWidth;
    const vh = this.videoElement.videoHeight;
    if (vw > 0 && vh > 0) {
      this.measuredCameraDimensions = { width: vw, height: vh };
      if (this.riDiagnosticHelper && typeof this.riDiagnosticHelper.recordMeasuredCameraDimensions === 'function') {
        this.riDiagnosticHelper.recordMeasuredCameraDimensions(vw, vh);
      }
    }
    let targetW, targetH;`;
    content = content.replace(target2, replace2);
    patchApplied = true;
  }

  // 2b. In extractCandidateFrame, update measuredCameraDimensions and record milestone
  if (!content.includes('this.measuredCameraDimensions = { width: vw, height: vh };\n    if (this.fullCaptureCanvas.width !== vw')) {
    const target2b = `    const vw = this.videoElement.videoWidth || 1920;
    const vh = this.videoElement.videoHeight || 1080;
    if (vw === 0 || vh === 0) return null;

    if (this.fullCaptureCanvas.width !== vw || this.fullCaptureCanvas.height !== vh) {`;
    const replace2b = `    const vw = this.videoElement.videoWidth || 1920;
    const vh = this.videoElement.videoHeight || 1080;
    if (vw === 0 || vh === 0) return null;
    this.measuredCameraDimensions = { width: vw, height: vh };
    if (this.riDiagnosticHelper && typeof this.riDiagnosticHelper.recordMeasuredCameraDimensions === 'function') {
      this.riDiagnosticHelper.recordMeasuredCameraDimensions(vw, vh);
    }

    if (this.fullCaptureCanvas.width !== vw || this.fullCaptureCanvas.height !== vh) {`;
    content = content.replace(target2b, replace2b);
    patchApplied = true;
  }

  // 2c. In resetCaptureForRetry, clear measuredCameraDimensions
  if (!content.includes('this.measuredCameraDimensions = null;\n    this._referenceFrames = {};')) {
    const target2c = `    this._referenceFrames = {};`;
    const replace2c = `    this.measuredCameraDimensions = null;
    this._referenceFrames = {};`;
    content = content.replace(target2c, replace2c);
    patchApplied = true;
  }

  // 2d. In uploadSingleCandidate, record upload status to RI helper
  if (!content.includes('this.riDiagnosticHelper.recordUploadStatus(cand.candidateId, \'PERSISTED\')')) {
    const target2d = `      if (res.ok) {
        cand.uploadStatus = 'PERSISTED';`;
    const replace2d = `      if (res.ok) {
        cand.uploadStatus = 'PERSISTED';
        if (this.riDiagnosticHelper && typeof this.riDiagnosticHelper.recordUploadStatus === 'function') {
          this.riDiagnosticHelper.recordUploadStatus(cand.candidateId, 'PERSISTED');
        }`;
    content = content.replace(target2d, replace2d);
    patchApplied = true;
  }

  // 2e. In persistCaptureOutput, record milestones
  if (!content.includes('recordMilestone(\'PERSIST_OUTPUT_START\'')) {
    const target2e = `  async persistCaptureOutput() {
    try {`;
    const replace2e = `  async persistCaptureOutput() {
    try {
      if (this.riDiagnosticHelper && typeof this.riDiagnosticHelper.recordMilestone === 'function') {
        this.riDiagnosticHelper.recordMilestone('PERSIST_OUTPUT_START', {
          candidateCount: this.candidateFrames ? this.candidateFrames.length : 0,
          canonicalCount: this.canonicalKeyframes ? this.canonicalKeyframes.length : 0
        });
      }`;
    content = content.replace(target2e, replace2e);
    patchApplied = true;
  }

  // ── 3. PanoramicBoothViewer: Record outcome in loadPanoTexture ──
  if (!content.includes('recordViewerOutcome(this.hostMode, \'SUCCESS\'')) {
    const target3 = `    img.onload = () => {
      if (this.isDestroyed) return;
      const tex = new THREE.Texture(img);`;
    const replace3 = `    img.onload = () => {
      if (this.isDestroyed) return;
      const helper = window.setupWizard?.guidedCaptureController?.riDiagnosticHelper || window.riDiagnosticHelper;
      if (helper && typeof helper.recordViewerOutcome === 'function') {
        helper.recordViewerOutcome(this.hostMode, 'SUCCESS', textureUrl, null);
      }
      const tex = new THREE.Texture(img);`;
    content = content.replace(target3, replace3);

    const target3b = `    img.onerror = () => {
      console.warn('[Panoramic Texture Load Error]', textureUrl);`;
    const replace3b = `    img.onerror = (err) => {
      console.warn('[Panoramic Texture Load Error]', textureUrl);
      const helper = window.setupWizard?.guidedCaptureController?.riDiagnosticHelper || window.riDiagnosticHelper;
      if (helper && typeof helper.recordViewerOutcome === 'function') {
        helper.recordViewerOutcome(this.hostMode, 'FAILED', textureUrl, err?.message || 'Texture failed to load');
      }`;
    content = content.replace(target3b, replace3b);
    patchApplied = true;
  }

  // ── 4. Global Landscape Helpers & mountActivePanoramicBoothViewer ──
  if (!content.includes('window.requestViewerLandscape =')) {
    const target4 = `    function mountActivePanoramicBoothViewer(projectData, activeBg) {`;
    const replace4 = `    window.requestViewerLandscape = async function(containerElement, triggerLabel = 'VIEWER') {
      const helper = window.setupWizard?.guidedCaptureController?.riDiagnosticHelper || window.riDiagnosticHelper;
      if (helper && typeof helper.recordMilestone === 'function') {
        helper.recordMilestone('LANDSCAPE_REQUESTED', { trigger: triggerLabel, w: window.innerWidth, h: window.innerHeight });
      }
      const target = containerElement || document.getElementById('viewer-container') || document.documentElement;
      if (!document.fullscreenElement && target.requestFullscreen) {
        try { await target.requestFullscreen(); } catch (fsErr) {
          console.warn('[Landscape] Fullscreen request note:', fsErr.message);
        }
      }
      if (screen && screen.orientation && typeof screen.orientation.lock === 'function') {
        try {
          await screen.orientation.lock('landscape');
          if (helper && typeof helper.recordMilestone === 'function') {
            helper.recordMilestone('LANDSCAPE_LOCK_SUCCESS', { trigger: triggerLabel });
          }
        } catch (lockErr) {
          console.warn('[Landscape] Orientation lock note:', lockErr.message);
          if (helper && typeof helper.recordMilestone === 'function') {
            helper.recordMilestone('LANDSCAPE_LOCK_REJECTED', { trigger: triggerLabel, error: lockErr.message });
          }
        }
      }
    };

    window.setupViewerLandscapeSupport = function(container, canvas, viewerInstance, surfaceName = 'VIEWER') {
      if (!container) return;
      const isMobile = (typeof window !== 'undefined') && (
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.innerWidth < 850)
      );

      // Enforce wide 16:9 landscape aspect ratio
      container.style.aspectRatio = '16 / 9';
      container.style.width = '100%';
      container.style.height = 'auto';
      container.style.maxHeight = '80vh';

      let lsBtn = container.querySelector('.viewer-landscape-btn');
      if (!lsBtn) {
        lsBtn = document.createElement('button');
        lsBtn.className = 'viewer-landscape-btn';
        lsBtn.type = 'button';
        lsBtn.style.cssText = [
          'position: absolute', 'top: 10px', 'right: 10px', 'z-index: 25',
          'background: rgba(10, 18, 30, 0.85)', 'border: 1px solid #38bdf8',
          'color: #38bdf8', 'border-radius: 6px', 'padding: 4px 8px',
          'font-size: 11px', 'font-weight: 700', 'cursor: pointer',
          'display: flex', 'align-items: center', 'gap: 5px',
          'backdrop-filter: blur(4px)', 'touch-action: manipulation'
        ].join(';');
        lsBtn.innerHTML = '<i class=\"fa-solid fa-expand\"></i> <span>Landscape</span>';
        container.appendChild(lsBtn);
      }
      lsBtn.onclick = (e) => {
        e.stopPropagation();
        window.requestViewerLandscape(container, surfaceName);
      };

      let promptEl = container.querySelector('.viewer-rotate-prompt');
      if (!promptEl && isMobile && window.innerHeight > window.innerWidth) {
        promptEl = document.createElement('div');
        promptEl.className = 'viewer-rotate-prompt';
        promptEl.style.cssText = [
          'position: absolute', 'bottom: 12px', 'left: 50%',
          'transform: translateX(-50%)', 'z-index: 30',
          'background: rgba(15, 23, 42, 0.94)', 'border: 1px solid #38bdf8',
          'border-radius: 20px', 'padding: 6px 12px', 'font-size: 11px',
          'color: #e2e8f0', 'display: flex', 'align-items: center', 'gap: 8px',
          'box-shadow: 0 4px 14px rgba(0,0,0,0.5)', 'pointer-events: auto',
          'max-width: 90%'
        ].join(';');
        promptEl.innerHTML = \`
          <i class=\"fa-solid fa-mobile-screen-button\" style=\"color: #38bdf8; transform: rotate(90deg);\"></i>
          <span style=\"white-space: nowrap;\">Rotate phone for 360° view</span>
          <button type=\"button\" class=\"btn-lock-ls\" style=\"background: #38bdf8; color: #020617; border: none; border-radius: 12px; padding: 2px 8px; font-size: 10px; font-weight: 800; cursor: pointer;\">⛶ Enter</button>
          <button type=\"button\" class=\"btn-dismiss-ls\" style=\"background: none; border: none; color: #94a3b8; font-size: 14px; line-height: 1; cursor: pointer; padding: 0 2px;\">×</button>
        \`;
        container.appendChild(promptEl);

        const lockBtn = promptEl.querySelector('.btn-lock-ls');
        if (lockBtn) {
          lockBtn.onclick = (e) => {
            e.stopPropagation();
            window.requestViewerLandscape(container, surfaceName);
          };
        }
        const dismissBtn = promptEl.querySelector('.btn-dismiss-ls');
        if (dismissBtn) {
          dismissBtn.onclick = (e) => {
            e.stopPropagation();
            promptEl.style.display = 'none';
          };
        }
      }

      const checkOrientation = () => {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (promptEl) promptEl.style.display = isLandscape ? 'none' : 'flex';
        if (viewerInstance && typeof viewerInstance.handleResize === 'function') {
          viewerInstance.handleResize();
        }
      };

      window.addEventListener('resize', checkOrientation, { passive: true });
      window.addEventListener('orientationchange', checkOrientation, { passive: true });
    };

    function mountActivePanoramicBoothViewer(projectData, activeBg) {`;
    content = content.replace(target4, replace4);
    patchApplied = true;
  }

  // 4b. In mountActivePanoramicBoothViewer, resolve candidate texture if missing and setup landscape support
  if (!content.includes('wizardJobCand = window.setupWizard?.state?.currentPanoramaJob?.candidate')) {
    const target4b = `      if (!activeBg) activeBg = {};
      const previewCand = window.currentSpatialCandidate || window.previewCandidateSnapshot;
      if (previewCand && previewCand.stitchedPanoramaUrl && !activeBg.stitchedPanoramaUrl) {
        activeBg.stitchedPanoramaUrl = previewCand.stitchedPanoramaUrl;
        activeBg.angularAnchors = previewCand.angularAnchors;
      }`;
    const replace4b = `      if (!activeBg) activeBg = {};
      const previewCand = window.currentSpatialCandidate || window.previewCandidateSnapshot;
      const wizardJobCand = window.setupWizard?.state?.currentPanoramaJob?.candidate;
      const wizardVp = window.setupWizard?.state?.viewpoints?.[0];

      if (!activeBg.stitchedPanoramaUrl) {
        if (wizardJobCand && (wizardJobCand.stitchedPanoramaUrl || wizardJobCand.masterUrl)) {
          activeBg.stitchedPanoramaUrl = wizardJobCand.stitchedPanoramaUrl || wizardJobCand.masterUrl;
          activeBg.candidateId = wizardJobCand.candidateId || 'cand-wizard-stitched';
          activeBg.viewerMode = 'PANORAMIC_IMMERSIVE';
          activeBg.sourceType = 'PANORAMIC_IMMERSIVE';
          activeBg.horizontalCoverageDeg = wizardJobCand.horizontalCoverageDeg || 360;
        } else if (wizardVp && wizardVp.panoramaUrl) {
          activeBg.stitchedPanoramaUrl = wizardVp.panoramaUrl;
          activeBg.candidateId = 'cand-wizard-vp1';
          activeBg.viewerMode = 'PANORAMIC_IMMERSIVE';
          activeBg.sourceType = 'PANORAMIC_IMMERSIVE';
        } else if (previewCand && previewCand.stitchedPanoramaUrl) {
          activeBg.stitchedPanoramaUrl = previewCand.stitchedPanoramaUrl;
          activeBg.angularAnchors = previewCand.angularAnchors;
        }
      }`;
    content = content.replace(target4b, replace4b);

    const target4c = `          if (typeof emitSpatialTextureLifecycle === 'function') {
            emitSpatialTextureLifecycle('SPATIAL_APPLY_UI_COMMIT_COMPLETE', {
              activePanoramaVersionId: projectData?.activePanoramaVersionId || projectData?.activeSpatialVersionId,
              timestamp: Date.now()
            });
          }
        }
      });`;
    const replace4c = `          if (typeof emitSpatialTextureLifecycle === 'function') {
            emitSpatialTextureLifecycle('SPATIAL_APPLY_UI_COMMIT_COMPLETE', {
              activePanoramaVersionId: projectData?.activePanoramaVersionId || projectData?.activeSpatialVersionId,
              timestamp: Date.now()
            });
          }
        }
      });

      if (typeof window.setupViewerLandscapeSupport === 'function') {
        window.setupViewerLandscapeSupport(container, canvas, window.activeSpatialBoothRenderer, 'OFFICIAL_ACTIVE');
      }`;
    content = content.replace(target4c, replace4c);
    patchApplied = true;
  }

  // ── 5. SetupWizard Handshake & Pipeline Repair ──
  // 5a. Record onComplete milestone
  if (!content.includes('recordMilestone(\'CONTROLLER_ON_COMPLETE\'')) {
    const target5a = `    controller.onComplete = async (result) => {
      if (this._captureSessionEpoch !== sessionEpoch) {`;
    const replace5a = `    controller.onComplete = async (result) => {
      const helper = controller.riDiagnosticHelper || window.riDiagnosticHelper;
      if (helper && typeof helper.recordMilestone === 'function') {
        helper.recordMilestone('CONTROLLER_ON_COMPLETE', {
          canonicalKeyframeCount: result?.canonicalKeyframeCount,
          closureConfirmed: result?.closureConfirmed
        });
      }
      if (this._captureSessionEpoch !== sessionEpoch) {`;
    content = content.replace(target5a, replace5a);
    patchApplied = true;
  }

  // 5b. In startPanoramaFromGuidedCapture, record start milestones
  if (!content.includes('recordMilestone(\'PANORAMA_START_REQUEST\'')) {
    const target5b = `    console.log('[SetupWizard] startPanoramaFromGuidedCapture called for session:', captureResult?.captureSessionId);
    this.state.activeCaptureSessionId = captureResult?.captureSessionId;`;
    const replace5b = `    console.log('[SetupWizard] startPanoramaFromGuidedCapture called for session:', captureResult?.captureSessionId);
    const helper = this.guidedCaptureController?.riDiagnosticHelper || window.riDiagnosticHelper;
    if (helper && typeof helper.recordMilestone === 'function') {
      helper.recordMilestone('PANORAMA_START_REQUEST', {
        captureSessionId: captureResult?.captureSessionId,
        canonicalKeyframeCount: captureResult?.canonicalKeyframeCount || (captureResult?.keyframes ? captureResult.keyframes.length : 0)
      });
    }
    this.state.activeCaptureSessionId = captureResult?.captureSessionId;`;
    content = content.replace(target5b, replace5b);

    const target5b2 = `    console.log('[SetupWizard] Panorama job successfully created:', data.jobId);
    this.state.currentPanoramaJobId = data.jobId;`;
    const replace5b2 = `    console.log('[SetupWizard] Panorama job successfully created:', data.jobId);
    if (helper && typeof helper.recordMilestone === 'function') {
      helper.recordMilestone('PANORAMA_START_ACCEPTED', { jobId: data.jobId, status: data.status });
    }
    this.state.currentPanoramaJobId = data.jobId;`;
    content = content.replace(target5b2, replace5b2);
    patchApplied = true;
  }

  // 5c. In startPanoramaJobPolling, propagate candidate to activeProjectData and record job status
  if (!content.includes('window.activeProjectData.viewerMode = \'PANORAMIC_IMMERSIVE\';')) {
    const target5c = `        if (job.status === 'READY') {
          clearInterval(this._panoPollInterval);
          this.state.panoramaJobStatus = 'READY';
          this.state.currentPanoramaJob = job;
          const vp = this.state.viewpoints[0];
          if (vp) {
            vp.status = 'STITCHED';
            if (job.candidate?.stitchedPanoramaUrl) vp.panoramaUrl = job.candidate.stitchedPanoramaUrl;
          }
          this.renderStep7ViewpointReady();
        } else if (job.status === 'FAILED') {`;
    const replace5c = `        if (job.status === 'READY') {
          clearInterval(this._panoPollInterval);
          this.state.panoramaJobStatus = 'READY';
          this.state.currentPanoramaJob = job;
          const panoUrl = job.candidate?.stitchedPanoramaUrl || job.candidate?.masterUrl;
          const vp = this.state.viewpoints[0];
          if (vp) {
            vp.status = 'STITCHED';
            if (panoUrl) vp.panoramaUrl = panoUrl;
          }
          if (window.activeProjectData) {
            window.activeProjectData.viewerMode = 'PANORAMIC_IMMERSIVE';
            const versionId = 'pano-ver-' + (job.candidate?.candidateId || Date.now());
            window.activeProjectData.activePanoramaVersionId = versionId;
            if (!Array.isArray(window.activeProjectData.panoramaVersions)) {
              window.activeProjectData.panoramaVersions = [];
            }
            const panoVersionObj = {
              id: versionId,
              versionId: versionId,
              candidateId: job.candidate?.candidateId || 'cand-stitched',
              stitchedPanoramaUrl: panoUrl,
              activeBackgroundUrl: panoUrl,
              textureUrl: panoUrl,
              sourceType: 'PANORAMIC_IMMERSIVE',
              viewerMode: 'PANORAMIC_IMMERSIVE',
              horizontalCoverageDeg: job.candidate?.horizontalCoverageDeg || 360,
              full360Qualified: true,
              angularAnchors: job.candidate?.angularAnchors || []
            };
            window.activeProjectData.panoramaVersions.unshift(panoVersionObj);
          }
          const helper = this.guidedCaptureController?.riDiagnosticHelper || window.riDiagnosticHelper;
          if (helper && typeof helper.recordPanoramaJob === 'function') {
            helper.recordPanoramaJob(jobId, 'READY', 100, panoUrl, null);
          }
          this.renderStep7ViewpointReady();
        } else if (job.status === 'FAILED') {
          const helper = this.guidedCaptureController?.riDiagnosticHelper || window.riDiagnosticHelper;
          if (helper && typeof helper.recordPanoramaJob === 'function') {
            helper.recordPanoramaJob(jobId, 'FAILED', job.progress || 0, null, job.userMessage || job.error);
          }`;
    content = content.replace(target5c, replace5c);
    patchApplied = true;
  }

  // 5d. In renderStep7ViewpointReady, attach landscape support to Step 7 preview viewer
  if (!content.includes('setupViewerLandscapeSupport(container, canvas, this.step7Viewer, \'PREVIEW_STEP7\')')) {
    const target5d = `      this.step7Viewer = new window.PanoramicBoothViewer({
        container,
        canvas,
        candidate: candObj,
        hostMode: 'PREVIEW'
      });
    }`;
    const replace5d = `      this.step7Viewer = new window.PanoramicBoothViewer({
        container,
        canvas,
        candidate: candObj,
        hostMode: 'PREVIEW'
      });
      if (typeof window.setupViewerLandscapeSupport === 'function') {
        window.setupViewerLandscapeSupport(container, canvas, this.step7Viewer, 'PREVIEW_STEP7');
      }
    }`;
    content = content.replace(target5d, replace5d);
    patchApplied = true;
  }

  // 5e. In renderStep11TourPreview, update container style to 16:9 landscape and attach landscape support
  if (!content.includes('setupViewerLandscapeSupport(s11Container, s11Canvas, this.step11Viewer, \'PREVIEW_STEP11\')')) {
    const target5e = `<div id="step11ViewerContainer" style="width: 100%; height: 260px; background: #020617; border-radius: 10px; border: 1.5px solid #38bdf8; overflow: hidden; position: relative; margin-bottom: 12px;">`;
    const replace5e = `<div id="step11ViewerContainer" style="width: 100%; aspect-ratio: 16 / 9; max-height: 80vh; height: auto; background: #020617; border-radius: 10px; border: 1.5px solid #38bdf8; overflow: hidden; position: relative; margin-bottom: 12px;">`;
    content = content.replace(target5e, replace5e);

    const target5e2 = `      this.step11Viewer = new window.PanoramicBoothViewer({
        container: s11Container,
        canvas: s11Canvas,
        candidate: candObj,
        hostMode: 'PREVIEW'
      });
    }`;
    const replace5e2 = `      this.step11Viewer = new window.PanoramicBoothViewer({
        container: s11Container,
        canvas: s11Canvas,
        candidate: candObj,
        hostMode: 'PREVIEW'
      });
      if (typeof window.setupViewerLandscapeSupport === 'function') {
        window.setupViewerLandscapeSupport(s11Container, s11Canvas, this.step11Viewer, 'PREVIEW_STEP11');
      }
    }`;
    content = content.replace(target5e2, replace5e2);
    patchApplied = true;
  }

  // 5f. In renderStep12Complete, explicitly call mountActivePanoramicBoothViewer upon View Live Booth
  if (!content.includes('mountActivePanoramicBoothViewer(window.activeProjectData, bg);')) {
    const target5f = `    this.btnPrimary.onclick = () => {
      this.close();
      if (typeof window.togglePreviewMode === 'function') {
        window.togglePreviewMode(true);
      }
    };`;
    const replace5f = `    this.btnPrimary.onclick = () => {
      this.close();
      if (typeof window.togglePreviewMode === 'function') {
        window.togglePreviewMode(true);
      }
      if (typeof window.mountActivePanoramicBoothViewer === 'function' && window.activeProjectData) {
        const bg = (typeof getActiveBoothBackground === 'function') ? getActiveBoothBackground(window.activeProjectData) : null;
        window.mountActivePanoramicBoothViewer(window.activeProjectData, bg);
      }
    };`;
    content = content.replace(target5f, replace5f);
    patchApplied = true;
  }

  // 5g. In close(), if panorama is READY, mount official viewer
  if (!content.includes('mountActivePanoramicBoothViewer(window.activeProjectData, bg);\n      }\n    }\n    this.saveState();')) {
    const target5g = `  close() {
    document.body.style.overflow = '';
    if (this.modal) this.modal.style.display = 'none';
    this.saveState();
  }`;
    const replace5g = `  close() {
    document.body.style.overflow = '';
    if (this.modal) this.modal.style.display = 'none';
    if (this.state && this.state.panoramaJobStatus === 'READY' && window.activeProjectData) {
      if (typeof window.mountActivePanoramicBoothViewer === 'function') {
        const bg = (typeof getActiveBoothBackground === 'function') ? getActiveBoothBackground(window.activeProjectData) : null;
        window.mountActivePanoramicBoothViewer(window.activeProjectData, bg);
      }
    }
    this.saveState();
  }`;
    content = content.replace(target5g, replace5g);
    patchApplied = true;
  }

  // ── 6. URL Router for guided=1 ──
  if (!content.includes("urlParams.get('guided') === '1'")) {
    const target6a = `    const urlParams = new URLSearchParams(window.location.search);
    const hasWizardIntent = urlParams.get('step') !== null || urlParams.get('openWizard') === '1' || urlParams.get('mode') === 'booth-tour-wizard';
    if (hasWizardIntent) {
      const stepParam = urlParams.get('step');
      let targetStep = stepParam ? parseInt(stepParam, 10) : 1;
      // If coming from landing capture CTA with step=1 or step=6, route to Step 6 real capture
      if (urlParams.get('source') === 'landing' && (targetStep === 1 || targetStep === 6)) {
        targetStep = 6;
      }
      openMultiPointTourWizard(targetStep);`;

    const target6b = `    const urlParams = new URLSearchParams(window.location.search);
    const hasWizardIntent = urlParams.get('step') !== null || urlParams.get('openWizard') === '1' || urlParams.get('mode') === 'booth-tour-wizard';
    if (hasWizardIntent) {
      const stepParam = urlParams.get('step');
      const targetStep = stepParam ? parseInt(stepParam, 10) : 1;
      openMultiPointTourWizard(targetStep);`;

    const replace6 = `    const urlParams = new URLSearchParams(window.location.search);
    const hasWizardIntent = urlParams.get('step') !== null || urlParams.get('openWizard') === '1' || urlParams.get('mode') === 'booth-tour-wizard' || urlParams.get('guided') === '1';
    if (hasWizardIntent) {
      const stepParam = urlParams.get('step');
      let targetStep = stepParam ? parseInt(stepParam, 10) : (urlParams.get('guided') === '1' ? 6 : 1);
      // If coming from landing capture CTA with step=1 or step=6, or guided=1, route to Step 6 real capture
      if ((urlParams.get('source') === 'landing' && (targetStep === 1 || targetStep === 6)) || urlParams.get('guided') === '1') {
        targetStep = 6;
      }
      openMultiPointTourWizard(targetStep);`;

    if (content.includes(target6a)) {
      content = content.replace(target6a, replace6);
      patchApplied = true;
    } else if (content.includes(target6b)) {
      content = content.replace(target6b, replace6);
      patchApplied = true;
    }
  }

  if (patchApplied) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`[PASS] Patched: ${relPath}`);
    successCount++;
  } else {
    console.log(`[INFO] No changes needed (already patched): ${relPath}`);
    successCount++;
  }
}

console.log(`\nRound 123 P0 Patch complete: ${successCount}/${targetFiles.length} files successfully processed.`);
