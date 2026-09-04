/**
 * Runtime Inspector — 3DZ Custom Probes
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

    // Strict pixel inspection for canvasValid (derive from pixel stats, NOT merely width > 0)
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
        } else {
          // Offscreen 2D context sampling fallback
          if (typeof document.createElement === 'function') {
            const offscreen = document.createElement('canvas');
            offscreen.width = 32;
            offscreen.height = 32;
            const ctx = offscreen.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(canvas, 0, 0, 32, 32);
              const imgData = ctx.getImageData(0, 0, 32, 32).data;
              let nonZero = 0;
              for (let i = 0; i < imgData.length; i += 4) {
                if (imgData[i] > 10 || imgData[i+1] > 10 || imgData[i+2] > 10) nonZero++;
              }
              validContentRatio = Number((nonZero / (32 * 32)).toFixed(3));
              blackRatio = Number((1.0 - validContentRatio).toFixed(3));
              isUniformlyBackground = validContentRatio < 0.02;
              canvasValid = validContentRatio > 0.05 && !isUniformlyBackground;
            }
          }
        }
      } catch (err) {
        console.warn('[ThreeDZProbes] Pixel probe error:', err);
      }
    }

    const viewerRenderer = typeof window !== 'undefined'
      ? (window.__3DZ_VIEWER_RENDERER || (window.spatialRenderer ? 'THREE_WEBGL' : (window.threeRenderer ? 'Three.WebGLRenderer' : (window.isThreeInitialized ? 'Initialized' : 'UNAVAILABLE'))))
      : 'UNAVAILABLE';

    const textureReady = typeof window !== 'undefined'
      ? (Boolean(window.spatialMatCurrent && window.spatialMatCurrent.map && window.spatialMatCurrent.visible) || (typeof window.isTextureReady !== 'undefined' ? Boolean(window.isTextureReady) : false))
      : false;

    let currentViewpoint = 'UNAVAILABLE';
    let textureUrlSelected = 'UNAVAILABLE';
    if (typeof window !== 'undefined') {
      if (window.spatialViewpoints && window.spatialViewpoints[window.spatialActiveIdx]) {
        const activeVp = window.spatialViewpoints[window.spatialActiveIdx];
        currentViewpoint = activeVp.slot;
        textureUrlSelected = activeVp.url || (activeVp.resolved && activeVp.resolved.url) || 'UNAVAILABLE';
      } else {
        currentViewpoint = window.currentSpatialViewpoint || window.currentSpatialCandidate?.entryViewId || 'UNAVAILABLE';
        textureUrlSelected = window.activeTextureUrl || 'UNAVAILABLE';
      }
    }

    const renderCount = typeof window !== 'undefined' ? (window.__3DZ_RENDER_COUNT || 0) : 0;
    const applyTrace = typeof window !== 'undefined' ? (window.__3DZ_LAST_APPLY_TRACE__ || 'UNAVAILABLE') : 'UNAVAILABLE';

    return {
      hasActiveCanvas: Boolean(canvas),
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
      hasContainer: Boolean(container),
      hasSpatialRail: Boolean(rail),
      railButtonsCount: rail && typeof rail.querySelectorAll === 'function' ? rail.querySelectorAll('button').length : 0,
      canvasValid,
      validContentRatio,
      blackRatio,
      isUniformlyBackground,
      viewerRenderer,
      textureReady,
      currentViewpoint,
      textureUrlSelected,
      renderCount,
      applyTrace
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
      applyTrace: act.applyTrace
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThreeDZProbes };
} else {
  window.ThreeDZProbes = ThreeDZProbes;
}
