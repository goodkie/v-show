/**
 * Runtime Inspector — 3DZ Custom Probes (C11.25-P0)
 * Module: adapters/3dz/probes.js
 *
 * Gathers 3DZ specific runtime state. Uses 'UNAVAILABLE' when a field cannot be resolved.
 */

var ThreeDZProbes = class ThreeDZProbes {
  static getProjectState() {
    if (typeof window === 'undefined') {
      return {
        projectId: 'UNAVAILABLE',
        businessName: 'UNAVAILABLE',
        viewerMode: 'UNAVAILABLE',
        activeSpatialVersionId: 'UNAVAILABLE',
        activeBackgroundVersionId: 'UNAVAILABLE',
        spatialBoothVersionsCount: 0,
        backgroundVersionsCount: 0
      };
    }
    const p = window.activeProjectData;
    if (!p) {
      return {
        projectId: 'UNAVAILABLE',
        businessName: 'UNAVAILABLE',
        viewerMode: 'UNAVAILABLE',
        activeSpatialVersionId: 'UNAVAILABLE',
        activeBackgroundVersionId: 'UNAVAILABLE',
        spatialBoothVersionsCount: 0,
        backgroundVersionsCount: 0
      };
    }
    return {
      projectId: p.id !== undefined && p.id !== null ? p.id : 'UNAVAILABLE',
      businessName: p.businessName || 'UNAVAILABLE',
      viewerMode: p.viewerMode || 'UNAVAILABLE',
      activeSpatialVersionId: p.activeSpatialVersionId || 'UNAVAILABLE',
      activeBackgroundVersionId: p.activeBackgroundVersionId || 'UNAVAILABLE',
      spatialBoothVersionsCount: (p.spatialBoothVersions || []).length,
      backgroundVersionsCount: (p.backgroundVersions || []).length
    };
  }

  static getSpatialCandidateState() {
    if (typeof window === 'undefined') {
      return {
        candidateId: 'UNAVAILABLE',
        candidateStatus: 'UNAVAILABLE',
        candidateEngine: 'UNAVAILABLE',
        entryViewId: 'UNAVAILABLE',
        viewpointCount: 0,
        anchorsCount: 0,
        whiteFrameCount: 'UNAVAILABLE',
        registrationConfidence: 'UNAVAILABLE'
      };
    }
    const c = window.currentSpatialCandidate;
    if (!c) {
      return {
        candidateId: 'UNAVAILABLE',
        candidateStatus: 'UNAVAILABLE',
        candidateEngine: 'UNAVAILABLE',
        entryViewId: 'UNAVAILABLE',
        viewpointCount: 0,
        anchorsCount: 0,
        whiteFrameCount: 'UNAVAILABLE',
        registrationConfidence: 'UNAVAILABLE'
      };
    }
    return {
      candidateId: c.candidateId || 'UNAVAILABLE',
      candidateStatus: c.status || 'UNAVAILABLE',
      candidateEngine: c.engine || c.viewerEngineVersion || 'UNAVAILABLE',
      entryViewId: c.entryViewId || 'UNAVAILABLE',
      viewpointCount: (c.viewpoints || []).length,
      anchorsCount: (c.anchors || []).length,
      whiteFrameCount: c.whiteFrameCount !== undefined && c.whiteFrameCount !== null ? c.whiteFrameCount : 'UNAVAILABLE',
      registrationConfidence: c.registrationConfidence !== undefined && c.registrationConfidence !== null ? c.registrationConfidence : 'UNAVAILABLE'
    };
  }

  static getTransitionState() {
    if (typeof window === 'undefined') {
      return {
        transitionOscillationDetected: false,
        maxSimultaneousTransitions: 1,
        activeTransitionCount: 0,
        historyCount: 0
      };
    }
    const history = window.__3DZ_TRANSITION_HISTORY || [];
    const now = Date.now();
    const recent = history.filter(h => (now - h.time) <= 1000);

    let oscillation = false;
    if (recent.length >= 2) {
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].sourceViewId === recent[i-1].targetViewId && recent[i].targetViewId === recent[i-1].sourceViewId) {
          oscillation = true;
          break;
        }
      }
    }

    const renderer = window.activeSpatialPreviewRenderer || window.activeSpatialBoothRenderer;
    const activeCount = renderer ? (renderer.activeTransitionCount || 0) : 0;

    return {
      transitionOscillationDetected: oscillation,
      maxSimultaneousTransitions: 1,
      activeTransitionCount: activeCount,
      historyCount: history.length
    };
  }

  static getApplyPostServerStages() {
    if (typeof window === 'undefined') return {};
    const events = (window.__3DZ_TEXTURE_LIFECYCLE || []).map(e => e.name);
    return {
      canonicalProjectSet: events.includes('SPATIAL_APPLY_CANONICAL_PROJECT_SET'),
      oldViewerDestroyed: events.includes('SPATIAL_OLD_VIEWER_DESTROYED'),
      activeResolverEnter: events.includes('SPATIAL_ACTIVE_RESOLVER_ENTER'),
      activeVersionResolved: events.includes('SPATIAL_ACTIVE_VERSION_RESOLVED'),
      activeRendererCreated: events.includes('SPATIAL_ACTIVE_RENDERER_CREATE'),
      activeTextureReady: events.includes('SPATIAL_ACTIVE_TEXTURE_READY'),
      activeFirstFrame: events.includes('SPATIAL_ACTIVE_FIRST_FRAME'),
      uiCommitComplete: events.includes('SPATIAL_APPLY_UI_COMMIT_COMPLETE')
    };
  }

  static getActiveViewerState() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
      return {
        hasActiveCanvas: false,
        canvasWidth: 0,
        canvasHeight: 0,
        hasContainer: false,
        hasSpatialRail: false,
        railButtonsCount: 0,
        canvasValid: false,
        viewerRenderer: 'UNAVAILABLE',
        textureReady: 'UNAVAILABLE',
        currentViewpoint: 'UNAVAILABLE',
        textureUrlSelected: 'UNAVAILABLE',
        renderCount: 0,
        applyTrace: 'UNAVAILABLE'
      };
    }

    const hasComputedStyle = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function';
    const previewModal = document.getElementById('proSpatialPreviewModal');
    const isModalOpen = previewModal ? (hasComputedStyle ? window.getComputedStyle(previewModal).display !== 'none' : true) : false;

    // Active canvas: preview canvas if modal open, else three-canvas
    const canvas = (isModalOpen && document.getElementById('spatialPreviewCanvas'))
      ? document.getElementById('spatialPreviewCanvas')
      : document.getElementById('three-canvas');

    const container = isModalOpen
      ? document.getElementById('spatialPreviewCanvasContainer')
      : document.getElementById('viewer-container');

    const rail = isModalOpen
      ? document.getElementById('spatialPreviewRailButtons')
      : document.getElementById('activeBoothSpatialRail');

    let canvasValid = false;
    let validContentRatio = 0.0;
    let blackRatio = 1.0;
    let isUniformlyBackground = true;

    if (canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl && typeof gl.readPixels === 'function') {
          const w = Math.min(32, gl.drawingBufferWidth || canvas.width || 32);
          const h = Math.min(32, gl.drawingBufferHeight || canvas.height || 32);
          const pixels = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          let nonZero = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 10 || pixels[i+1] > 10 || pixels[i+2] > 10) nonZero++;
          }
          validContentRatio = Number((nonZero / (w * h)).toFixed(3));
          blackRatio = Number((1.0 - validContentRatio).toFixed(3));
          isUniformlyBackground = validContentRatio < 0.02;
          canvasValid = validContentRatio > 0.05 && !isUniformlyBackground;
        }
      } catch (err) {
        console.warn('[ThreeDZProbes] Pixel probe error:', err);
      }
    }

    const viewerRenderer = typeof window !== 'undefined'
      ? (window.activeSpatialBoothRenderer ? 'SpatialViewpointRenderer(ACTIVE)' : (window.activeSpatialPreviewRenderer ? 'SpatialViewpointRenderer(PREVIEW)' : (window.threeRenderer ? 'Three.WebGLRenderer' : (window.isThreeInitialized ? 'Initialized' : 'UNAVAILABLE'))))
      : 'UNAVAILABLE';

    const textureReady = typeof window !== 'undefined'
      ? (Boolean(window.spatialMatCurrent && window.spatialMatCurrent.map && window.spatialMatCurrent.visible) || (typeof window.isTextureReady !== 'undefined' ? Boolean(window.isTextureReady) : false))
      : false;

    let currentViewpoint = 'UNAVAILABLE';
    let textureUrlSelected = 'UNAVAILABLE';
    if (typeof window !== 'undefined') {
      const activeRenderer = window.activeSpatialPreviewRenderer || window.activeSpatialBoothRenderer;
      if (activeRenderer && activeRenderer.viewpoints && activeRenderer.viewpoints[activeRenderer.activeIdx]) {
        const activeVp = activeRenderer.viewpoints[activeRenderer.activeIdx];
        currentViewpoint = activeVp.slot;
        textureUrlSelected = activeVp.url || (activeVp.resolved && activeVp.resolved.url) || 'UNAVAILABLE';
      } else if (window.spatialViewpoints && window.spatialViewpoints[window.spatialActiveIdx]) {
        const activeVp = window.spatialViewpoints[window.spatialActiveIdx];
        currentViewpoint = activeVp.slot;
        textureUrlSelected = activeVp.url || (activeVp.resolved && activeVp.resolved.url) || 'UNAVAILABLE';
      }
    }

    const renderCount = typeof window !== 'undefined' ? (window.__3DZ_RENDER_COUNT || 0) : 0;
    const applyTrace = typeof window !== 'undefined' ? (window.__3DZ_LAST_APPLY_TRACE__ || {}) : {};
    const applyBtn = document.getElementById('btnApplySpatialBooth') || document.getElementById('applySpatialCandidateBtn');
    const applyButtonExists = Boolean(applyBtn);
    const applyClickCaptured = Boolean(applyTrace.clickCaptured);
    const applyHandlerEntered = Boolean(applyTrace.handlerEntered);
    const applyFetchStarted = Boolean(applyTrace.fetchStarted);

    const webglBufferPixelProbe = {
      sampled: true,
      validContentRatio,
      blackRatio,
      isUniformlyBackground
    };

    const visibleScreenshotPixelProbe = (typeof window !== 'undefined' && window.__3DZ_LATEST_SCREENSHOT_PROBE__)
      ? window.__3DZ_LATEST_SCREENSHOT_PROBE__
      : null;

    let visualProbeDisagreement = false;
    let authoritativeValidRatio = validContentRatio;
    let authoritativeBlackRatio = blackRatio;

    if (visibleScreenshotPixelProbe && visibleScreenshotPixelProbe.validContentRatio > 0.05) {
      if (validContentRatio < 0.05) {
        visualProbeDisagreement = true;
      }
      authoritativeValidRatio = visibleScreenshotPixelProbe.validContentRatio;
      authoritativeBlackRatio = visibleScreenshotPixelProbe.blackRatio;
      canvasValid = true;
    }

    const transitionState = this.getTransitionState();
    const postServerStages = this.getApplyPostServerStages();
    const legacyRenderLoopAfterSpatialMount = typeof window !== 'undefined' ? (window.__LEGACY_RENDER_LOOP_ACTIVE__ || 0) : 0;

    return {
      hasActiveCanvas: Boolean(canvas),
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
      hasContainer: Boolean(container),
      hasSpatialRail: Boolean(rail),
      railButtonsCount: rail && typeof rail.querySelectorAll === 'function' ? rail.querySelectorAll('button').length : 0,
      canvasValid,
      validContentRatio: authoritativeValidRatio,
      blackRatio: authoritativeBlackRatio,
      isUniformlyBackground: authoritativeValidRatio < 0.02,
      webglBufferPixelProbe,
      visibleScreenshotPixelProbe,
      visualProbeDisagreement,
      viewerRenderer,
      textureReady,
      currentViewpoint,
      textureUrlSelected,
      renderCount,
      applyTrace,
      applyButtonExists,
      applyClickCaptured,
      applyHandlerEntered,
      applyFetchStarted,
      transitionState,
      postServerStages,
      legacyRenderLoopAfterSpatialMount,
      activeRenderResolutionOrder: 'PANORAMIC_IMMERSIVE -> MULTI_VIEW_SPATIAL -> PHOTO_IMMERSIVE -> PANORAMA -> LEGACY_BACKGROUND -> DEFAULT_IMAGE'
    };
  }

  static getPreviewModalState() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
      return {
        isModalOpen: false,
        hasPreviewCanvas: false,
        isLoadingOverlayVisible: false,
        canvasWidth: 0,
        canvasHeight: 0
      };
    }
    const modal = document.getElementById('proSpatialPreviewModal');
    const canvas = document.getElementById('spatialPreviewCanvas');
    const loadingOverlay = document.getElementById('spatialPreviewLoadingOverlay');

    const hasComputedStyle = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function';
    const isModalOpen = modal ? (hasComputedStyle ? window.getComputedStyle(modal).display !== 'none' : true) : false;
    const isLoadingOverlayVisible = loadingOverlay ? (hasComputedStyle ? window.getComputedStyle(loadingOverlay).display !== 'none' : false) : false;

    return {
      isModalOpen,
      hasPreviewCanvas: Boolean(canvas),
      isLoadingOverlayVisible,
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0
    };
  }


  static getPanoramaState() {
    if (typeof window === 'undefined') return { isPanoramaActive: false };
    const mounted = window.ActiveBoothViewerController?.getMountedViewer ? window.ActiveBoothViewerController.getMountedViewer() : { type: 'NONE' };
    const inst = mounted.instance;
    const isPano = mounted.type === 'PANORAMIC_IMMERSIVE' || (inst instanceof window.PanoramicBoothViewer);
    const viewState = inst?.getViewState ? inst.getViewState() : null;

    const leftArrow = document.querySelector('.pano-arrow-left');
    const rightArrow = document.querySelector('.pano-arrow-right');

    return {
      isPanoramaActive: isPano,
      rendererType: mounted.type,
      yaw: viewState?.yaw || 0,
      pitch: viewState?.pitch || 0,
      fov: viewState?.fov || 55,
      zoom: viewState?.zoom || 1.0,
      horizontalCoverageDeg: inst?.candidate?.horizontalCoverageDeg || 360,
      full360Qualified: inst?.candidate?.full360Qualified !== false,
      captureRingValid: inst?.candidate?.captureRingValid !== false,
      angularAnchors: inst?.angularAnchors || [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
      floatingArrowsVisible: Boolean(leftArrow && rightArrow)
    };
  }

  static getZoomState() {
    if (typeof window === 'undefined') return { currentFov: 55, targetFov: 55 };
    const mounted = window.ActiveBoothViewerController?.getMountedViewer ? window.ActiveBoothViewerController.getMountedViewer() : { type: 'NONE' };
    const inst = mounted.instance;
    return {
      currentFov: inst?.currentFov || 55,
      targetFov: inst?.targetFov || inst?.currentFov || 55,
      minFov: inst?.MIN_FOV || 30,
      maxFov: inst?.MAX_FOV || 82
    };
  }

  static getViewerControlState() {
    if (typeof window === 'undefined') return { controllerExists: false };
    const hasController = Boolean(window.ActiveBoothViewerController);
    const mounted = window.ActiveBoothViewerController?.getMountedViewer ? window.ActiveBoothViewerController.getMountedViewer() : { type: 'NONE' };
    const viewState = mounted.instance?.getViewState ? mounted.instance.getViewState() : null;
    return {
      controllerExists: hasController,
      mountedType: mounted.type,
      viewState
    };
  }

  static getComplete3DZState() {
    const proj = this.getProjectState();
    const cand = this.getSpatialCandidateState();
    const act = this.getActiveViewerState();
    const prev = this.getPreviewModalState();

    return {
      projectId: proj.projectId,
      viewerMode: proj.viewerMode,
      activeSpatialVersionId: proj.activeSpatialVersionId,
      activeBackgroundVersionId: proj.activeBackgroundVersionId,
      candidateId: cand.candidateId,
      candidateStatus: cand.candidateStatus,
      candidateEngine: cand.candidateEngine,
      previewModalOpen: prev.isModalOpen,
      currentViewpoint: act.currentViewpoint,
      viewerRenderer: act.viewerRenderer,
      textureReady: act.textureReady,
      canvasValid: act.canvasValid,
      webglBufferPixelProbe: act.webglBufferPixelProbe,
      visibleScreenshotPixelProbe: act.visibleScreenshotPixelProbe,
      visualProbeDisagreement: act.visualProbeDisagreement,
      applyButtonExists: act.applyButtonExists,
      applyClickCaptured: act.applyClickCaptured,
      applyHandlerEntered: act.applyHandlerEntered,
      applyFetchStarted: act.applyFetchStarted,
      applyTrace: act.applyTrace,
      transitionState: act.transitionState,
      postServerStages: act.postServerStages,
      legacyRenderLoopAfterSpatialMount: act.legacyRenderLoopAfterSpatialMount,
      activeRenderResolutionOrder: act.activeRenderResolutionOrder,
      viewerControlState: this.getViewerControlState()
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThreeDZProbes };
} else {
  window.ThreeDZProbes = ThreeDZProbes;
}
