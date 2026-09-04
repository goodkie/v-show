/**
 * Runtime Inspector — 3DZ Custom Probes
 * Module: adapters/3dz/probes.js
 */

class ThreeDZProbes {
  static getProjectState() {
    if (typeof window === 'undefined') return {};
    const p = window.activeProjectData || {};
    return {
      projectId: p.id || null,
      businessName: p.businessName || null,
      viewerMode: p.viewerMode || null,
      activeSpatialVersionId: p.activeSpatialVersionId || null,
      activeBackgroundVersionId: p.activeBackgroundVersionId || null,
      spatialBoothVersionsCount: (p.spatialBoothVersions || []).length,
      backgroundVersionsCount: (p.backgroundVersions || []).length
    };
  }

  static getSpatialCandidateState() {
    if (typeof window === 'undefined') return null;
    const c = window.currentSpatialCandidate;
    if (!c) return null;
    return {
      candidateId: c.candidateId || null,
      engine: c.engine || c.viewerEngineVersion || null,
      entryViewId: c.entryViewId || null,
      viewpointCount: (c.viewpoints || []).length,
      anchorsCount: (c.anchors || []).length,
      whiteFrameCount: c.whiteFrameCount !== undefined ? c.whiteFrameCount : null,
      registrationConfidence: c.registrationConfidence || null,
      status: c.status || null
    };
  }

  static getActiveViewerState() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return {};
    const canvas = document.getElementById('three-canvas');
    const container = document.getElementById('viewer-container');
    const rail = document.getElementById('activeBoothSpatialRail');

    return {
      hasActiveCanvas: Boolean(canvas),
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
      hasContainer: Boolean(container),
      hasSpatialRail: Boolean(rail),
      railButtonsCount: rail && typeof rail.querySelectorAll === 'function' ? rail.querySelectorAll('button').length : 0
    };
  }

  static getPreviewModalState() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return {};
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
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThreeDZProbes };
} else {
  window.ThreeDZProbes = ThreeDZProbes;
}
