/**
 * Runtime Inspector — 3DZ Workflow Action Tracker
 * Module: adapters/3dz/actions.js
 */

var ThreeDZActionTracker = class ThreeDZActionTracker {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  attach() {
    if (typeof document === 'undefined') return;

    // Track 3DZ specific button actions
    document.addEventListener('click', (e) => {
      const applyBtn = e.target.closest('#btnApplySpatialBooth, #btnApplySpatialCandidate');
      if (applyBtn) {
        const corrId = this.eventBus.createCorrelationId('SPATIAL_APPLY');
        this.eventBus.emit('APP', '3DZ_APPLY_CLICKED', {
          candidateId: window.currentSpatialCandidate?.candidateId || null,
          projectId: window.activeProjectData?.id || null,
          timestamp: Date.now()
        }, { correlationId: corrId, severity: 'INFO' });
      }

      const genBtn = e.target.closest('#btnGenerateSpatial');
      if (genBtn) {
        const corrId = this.eventBus.createCorrelationId('SPATIAL_GENERATE');
        this.eventBus.emit('APP', '3DZ_GENERATE_CLICKED', {
          readySlotsCount: (window.proSpatialSlots || []).filter(s => s && (s.file || s.previewUrl)).length,
          timestamp: Date.now()
        }, { correlationId: corrId, severity: 'INFO' });
      }
    }, true);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ThreeDZActionTracker };
} else {
  window.ThreeDZActionTracker = ThreeDZActionTracker;
}
