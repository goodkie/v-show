/**
 * Runtime Inspector — 3DZ Application Adapter
 * Module: adapters/3dz/adapter.js
 */

if (typeof require !== 'undefined') {
  var { ThreeDZProbes } = require('./probes');
  var { ThreeDZActionTracker } = require('./actions');
  var config = require('./config.json');
}

var ThreeDZAdapter = class ThreeDZAdapter {
  constructor() {
    this.id = '3dz';
    this.name = '3DZ Spatial Virtual Tradeshow Adapter';
    this.version = '1.0.0';
    this.config = typeof config !== 'undefined' ? config : {
      domains: ['v-show', 'localhost', '127.0.0.1']
    };
  }

  match(location) {
    if (!location || !location.hostname) return false;
    const host = location.hostname.toLowerCase();
    return this.config.domains.some(d => host.includes(d));
  }

  getAppInfo() {
    return {
      appId: '3dz-virtual-tradeshow',
      appName: '3DZ Virtual Tradeshow Studio',
      url: typeof window !== 'undefined' ? window.location.href : '',
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      environment: (typeof location !== 'undefined' && location.hostname.includes('railway.app')) ? 'production' : 'localhost'
    };
  }

  getRuntimeState() {
    return {
      project: ThreeDZProbes.getProjectState(),
      spatialCandidate: ThreeDZProbes.getSpatialCandidateState(),
      activeViewer: ThreeDZProbes.getActiveViewerState(),
      previewModal: ThreeDZProbes.getPreviewModalState()
    };
  }

  getCustomProbes() {
    return {
      threeJsVersion: typeof THREE !== 'undefined' ? THREE.REVISION : 'not_loaded',
      isThreeInitialized: typeof window !== 'undefined' ? Boolean(window.isThreeInitialized) : false,
      activeBoothBackgroundUrl: typeof window !== 'undefined' && typeof getActiveBoothBackground === 'function' && window.activeProjectData
        ? getActiveBoothBackground(window.activeProjectData)?.url
        : null
    };
  }

  getActions(eventBus) {
    return new ThreeDZActionTracker(eventBus);
  }

  sanitize(data, redactionEngine) {
    return redactionEngine.sanitizeObject(data);
  }

  summarize() {
    const proj = ThreeDZProbes.getProjectState();
    const cand = ThreeDZProbes.getSpatialCandidateState();
    const prev = ThreeDZProbes.getPreviewModalState();
    const act = ThreeDZProbes.getActiveViewerState();

    return {
      PROJECT_ID: proj.projectId,
      VIEWER_MODE: proj.viewerMode,
      ACTIVE_SPATIAL_VERSION: proj.activeSpatialVersionId,
      CANDIDATE_ID: cand ? cand.candidateId : 'NONE',
      CANDIDATE_ENGINE: cand ? cand.engine : 'NONE',
      PREVIEW_MODAL_OPEN: prev.isModalOpen,
      ACTIVE_SPATIAL_RAIL_PRESENT: act.hasSpatialRail
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThreeDZAdapter };
} else {
  window.ThreeDZAdapter = ThreeDZAdapter;
}
