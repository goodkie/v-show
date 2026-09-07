/**
 * Mobile Runtime Inspector — Mobile Diagnostic Adapter
 * Module: adapters/mobile/mobile-adapter.js
 *
 * Implements canonical Runtime Inspector Adapter interface tailored for
 * physical smartphone testing (Samsung Galaxy S23 Ultra / Android Chrome, iOS Safari).
 */

if (typeof require !== 'undefined') {
  var { RedactionEngine } = require('../../core/redaction');
  var { MobileRollingBuffer } = require('./mobile-buffer');
}

class MobileAdapter {
  constructor(options = {}) {
    this.id = 'mobile-3dz';
    this.name = '3DZ Mobile Runtime Inspector Adapter';
    this.version = '1.0.0';
    this.redaction = options.redaction || new RedactionEngine({ privacyMode: 'STANDARD' });
    this.buffer = options.buffer || new MobileRollingBuffer();

    this.sessionId = this._resolveSessionId(options.sessionId);
    this.deviceOrientationCount = 0;
    this.deviceMotionCount = 0;
    this.lastOrientation = null;
    this.lastMotion = null;
    this.lastOrientationTs = null;
    this.lastMotionTs = null;

    this.isInstrumented = false;
    this._stuckTimer = null;
    this._lastZeroProgressLogged = 0;
  }

  _resolveSessionId(overrideId) {
    if (overrideId) return overrideId;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const stored = window.sessionStorage.getItem('mobile_ri_session_id');
        if (stored) return stored;
      } catch (e) {}
    }
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sid = 'RI-M-' + rand;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try { window.sessionStorage.setItem('mobile_ri_session_id', sid); } catch (e) {}
    }
    return sid;
  }

  match(location) {
    if (!location) return false;
    const isMobileUa = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const isMobileWidth = typeof window !== 'undefined' && window.innerWidth <= 768;
    return isMobileUa || isMobileWidth || Boolean(location.search && location.search.includes('qa=1'));
  }

  attachSensors() {
    if (typeof window === 'undefined') return;
    if (this._sensorsAttached) return;
    this._sensorsAttached = true;

    try {
      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (e) => {
          this.deviceOrientationCount++;
          this.lastOrientationTs = Date.now();
          this.lastOrientation = {
            alpha: e.alpha !== null ? Math.round(e.alpha * 10) / 10 : null,
            beta: e.beta !== null ? Math.round(e.beta * 10) / 10 : null,
            gamma: e.gamma !== null ? Math.round(e.gamma * 10) / 10 : null,
            absolute: e.absolute || false
          };
        }, { passive: true });
      }
    } catch (err) {
      console.warn('[MobileRI] Sensor orientation attach note:', err);
    }

    try {
      if (window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', (e) => {
          this.deviceMotionCount++;
          this.lastMotionTs = Date.now();
          const acc = e.acceleration || e.accelerationIncludingGravity || null;
          const rot = e.rotationRate || null;
          this.lastMotion = {
            accX: acc && acc.x !== null ? Math.round(acc.x * 100) / 100 : null,
            accY: acc && acc.y !== null ? Math.round(acc.y * 100) / 100 : null,
            accZ: acc && acc.z !== null ? Math.round(acc.z * 100) / 100 : null,
            rotAlpha: rot && rot.alpha !== null ? Math.round(rot.alpha * 10) / 10 : null,
            rotBeta: rot && rot.beta !== null ? Math.round(rot.beta * 10) / 10 : null,
            rotGamma: rot && rot.gamma !== null ? Math.round(rot.gamma * 10) / 10 : null
          };
        }, { passive: true });
      }
    } catch (err) {
      console.warn('[MobileRI] Sensor motion attach note:', err);
    }
  }

  getAppInfo() {
    const isBrowser = typeof window !== 'undefined';
    const loc = isBrowser ? window.location : { href: '', origin: '', protocol: '', host: '' };
    const nav = isBrowser ? window.navigator : { userAgent: '', platform: '' };
    const scr = isBrowser ? window.screen : { width: 0, height: 0 };

    let platform = 'Unknown';
    if (/Android/i.test(nav.userAgent)) platform = 'Android Chrome';
    else if (/iPhone|iPad|iPod/i.test(nav.userAgent)) platform = 'iOS Safari';
    else platform = 'Desktop / Emulation';

    return {
      appId: '3dz-virtual-tradeshow-mobile',
      appName: '3DZ Virtual Tradeshow Studio (Mobile)',
      mobileRiSessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      platform,
      userAgent: nav.userAgent,
      protocol: loc.protocol,
      host: loc.host,
      url: this.redaction.sanitizeUrl(loc.href),
      isSecureContext: isBrowser ? Boolean(window.isSecureContext) : false,
      screenWidth: scr.width,
      screenHeight: scr.height,
      devicePixelRatio: isBrowser ? (window.devicePixelRatio || 1) : 1,
      orientation: isBrowser && scr.orientation ? scr.orientation.type : 'unknown',
      environment: (loc.hostname && loc.hostname.includes('railway.app')) ? 'production' : 'localhost'
    };
  }

  getCameraDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    const nav = isBrowser ? window.navigator : {};
    const hasMediaDevices = isBrowser && Boolean(nav && nav.mediaDevices);
    const hasGetUserMedia = hasMediaDevices && typeof nav.mediaDevices.getUserMedia === 'function';

    const videoEl = isBrowser ? (
      document.querySelector('#guidedCaptureVideo') ||
      document.querySelector('video')
    ) : null;

    let streamActive = false;
    let videoTrackState = 'NO_TRACK';
    let videoWidth = 0;
    let videoHeight = 0;
    let videoReadyState = 0;
    let facingMode = 'unknown';

    if (videoEl) {
      videoWidth = videoEl.videoWidth || 0;
      videoHeight = videoEl.videoHeight || 0;
      videoReadyState = videoEl.readyState || 0;
      if (videoEl.srcObject && typeof videoEl.srcObject.getVideoTracks === 'function') {
        const tracks = videoEl.srcObject.getVideoTracks();
        if (tracks.length > 0) {
          const t = tracks[0];
          streamActive = t.readyState === 'live' && t.enabled;
          videoTrackState = t.readyState;
          try {
            const settings = t.getSettings ? t.getSettings() : {};
            facingMode = settings.facingMode || facingMode;
          } catch(e) {}
        }
      }
    }

    // Also check global controller stream
    if (!streamActive && isBrowser && window.guidedCaptureController && window.guidedCaptureController.activeStream) {
      const tracks = window.guidedCaptureController.activeStream.getVideoTracks();
      if (tracks.length > 0) {
        streamActive = tracks[0].readyState === 'live';
        videoTrackState = tracks[0].readyState;
      }
    }

    return {
      hasMediaDevices,
      hasGetUserMedia,
      isSecureContext: isBrowser ? Boolean(window.isSecureContext) : false,
      cameraPermissionState: 'prompt', // default
      getUserMediaCalled: Boolean(window.__getUserMediaCalled),
      getUserMediaResolved: Boolean(window.__getUserMediaResolved),
      cameraStreamActive: streamActive,
      videoTrackState,
      videoWidth,
      videoHeight,
      videoReadyState,
      facingMode,
      cameraModule: 'UNKNOWN',
      lastErrorCode: window.__lastCameraError?.code || null,
      lastErrorMessage: window.__lastCameraError?.message || null
    };
  }

  getSensorDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    return {
      hasDeviceOrientation: isBrowser && Boolean(window.DeviceOrientationEvent),
      hasDeviceMotion: isBrowser && Boolean(window.DeviceMotionEvent),
      deviceOrientationEventCount: this.deviceOrientationCount,
      deviceMotionEventCount: this.deviceMotionCount,
      lastOrientationTimestamp: this.lastOrientationTs,
      lastMotionTimestamp: this.lastMotionTs,
      lastOrientation: this.lastOrientation,
      lastMotion: this.lastMotion,
      sensorGuidanceMode: (isBrowser && window.guidedCaptureController)
        ? (window.guidedCaptureController.guidanceMode || window.guidedCaptureController.telemetry?.guidanceMode || 'UNKNOWN')
        : (this.deviceOrientationCount > 0 ? 'ORIENTATION' : 'VISUAL_ONLY')
    };
  }

  getGuidedCaptureDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    const c = isBrowser ? window.guidedCaptureController : null;
    if (!c) {
      return {
        controllerPresent: false,
        controllerId: null,
        captureState: 'NOT_MOUNTED',
        progressPercent: 0,
        accumulatedRotation: 0,
        previewFrameCount: 0,
        guidanceMode: 'UNKNOWN'
      };
    }

    return {
      controllerPresent: true,
      controllerId: c.instanceId || 'guided_capture_0',
      captureState: c.state || (c.isCapturing ? 'CAPTURING' : 'READY'),
      progressPercent: Math.min(100, Math.round(c.progressPercent || 0)),
      accumulatedRotation: Math.round(c.integratedYawDeg || c.accumulatedRotation || 0),
      previewFrameCount: c.frameCount || c.previewFrameCount || (c.telemetry && c.telemetry.previewFrameCount) || 0,
      candidateFrameCount: c.candidateFrameCount || (c.candidateFrames ? c.candidateFrames.length : 0) || (c.telemetry && c.telemetry.candidateFrameCount) || 0,
      acceptedCandidateCount: c.acceptedCandidateCount || (c.telemetry && c.telemetry.acceptedCandidateCount) || (c.candidateFrames ? c.candidateFrames.length : 0) || 0,
      rejectedCandidateCount: c.rejectedCandidateCount || (c.telemetry && c.telemetry.rejectedCandidateCount) || 0,
      canonicalKeyframeCount: c.keyframeCount || c.canonicalKeyframeCount || (c.canonicalKeyframes ? c.canonicalKeyframes.length : 0) || (c.telemetry && c.telemetry.canonicalKeyframeCount) || 0,
      candidateRejectionReasons: c.candidateRejectionReasons || (c.telemetry && c.telemetry.candidateRejectionReasons) || [],
      persistedCandidateCount: c.persistedCandidateCount || (c.telemetry && c.telemetry.persistedCandidateCount) || 0,
      candidateUploadFailures: c.candidateUploadFailures || (c.telemetry && c.telemetry.candidateUploadFailures) || 0,
      candidatePoolId: c.diagnosticSessionId || null,
      stitchAwareCanonicalCount: c.stitchAwareCanonicalCount || c.canonicalKeyframeCount || 0,
      bridgeFrameCount: c.bridgeFrameCount || 0,
      panoramaInputCount: c.panoramaInputCount || 0,
      graphConnected: c.graphConnected !== undefined ? c.graphConnected : null,
      connectedComponentCount: c.connectedComponentCount || 0,
      weakestEdge: c.weakestEdge || null,
      closureEdgeConfidence: c.closureEdgeConfidence || null,
      guidanceMode: c.guidanceMode || 'UNKNOWN',
      visualMotionFallbackActive: Boolean(c.isVisualFallback),
      orientationEventCount: c.orientationCount || this.deviceOrientationCount,
      motionEventCount: c.motionCount || this.deviceMotionCount,
      lastErrorCode: c.lastErrorCode || null,
      lastErrorMessage: c.lastErrorMessage || null
    };
  }

  getWizardDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    const w = isBrowser ? window.setupWizard : null;
    if (!w) {
      return {
        wizardPresent: false,
        controllerInstanceCount: 0,
        wizardRootCount: 0,
        currentWizardStep: null,
        wizardStepName: 'None'
      };
    }

    const titles = [
      'Welcome', 'Booth Size', 'Viewpoint Count', 'Viewpoint 1 Name',
      'Stand Guide', 'Guided 360° Capture', 'Viewpoint 1 Ready',
      'All Viewpoints Ready', 'Map Setup', 'Connections', 'Tour Preview', 'Live Tour Complete'
    ];
    const s = w.currentStep || 1;

    return {
      wizardPresent: true,
      controllerInstanceCount: 1,
      wizardRootCount: isBrowser ? document.querySelectorAll('#setupWizardModal').length : 0,
      currentWizardStep: s,
      wizardStepName: titles[s - 1] || 'Step ' + s,
      projectId: typeof w.getProjectId === 'function' ? w.getProjectId() : 'prj-free-b0c6f3ea',
      tourId: w.state?.tourId || null,
      viewpointCount: Array.isArray(w.state?.viewpoints) ? w.state.viewpoints.length : 0,
      currentViewpointId: w.state?.viewpoints?.[0]?.id || 'vp_entrance',
      isModalOpen: isBrowser && w.modal && w.modal.style.display === 'flex'
    };
  }

  getViewpointMapDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    const svgWizard = isBrowser ? document.getElementById('wizardMapSetupSvg') : null;
    const svgEdit = isBrowser ? document.getElementById('editBoothMapSvg') : null;
    const activeSvg = svgWizard || svgEdit;

    const markersCount = activeSvg ? activeSvg.querySelectorAll('.wizard-vp-marker').length : 0;
    const w = isBrowser ? window.setupWizard : null;
    const vps = (w && w.state && w.state.viewpoints) || (window._editingMapPositions) || [];

    return {
      mapMounted: Boolean(activeSvg),
      activeSvgId: activeSvg ? activeSvg.id : null,
      viewpointCount: vps.length,
      renderedMarkerCount: markersCount,
      viewpoints: vps.map(v => ({ id: v.id, name: v.name, x: v.x, y: v.y }))
    };
  }

  getMultiPointViewerDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    const c = isBrowser ? window.multiPointTourController : null;
    if (!c) {
      return {
        controllerPresent: false,
        tourId: null,
        activeViewpointId: null,
        viewerMode: 'STANDARD'
      };
    }

    return {
      controllerPresent: true,
      tourId: c.tour?.id || null,
      activeViewpointId: c.activeViewpointId || null,
      activePanoramaUrl: c.tour?.viewpoints?.find(v => v.id === c.activeViewpointId)?.panoramaUrl || null,
      hotspotsCount: isBrowser ? document.querySelectorAll('.streetview-nav-hotspot').length : 0,
      hasBoothMap: isBrowser && Boolean(document.getElementById('tourBoothMapSvg')),
      renderer: 'Panoramic360Viewer',
      webglContext: isBrowser && window.viewer3D?.gl ? 'ACTIVE' : 'CANVAS_2D'
    };
  }

  getDomHealthDiagnostics() {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return { fatalJsErrors: 0, rawCssLeaksDetected: false };

    const bodyText = (document.body && typeof document.body.innerText === 'string') ? document.body.innerText : '';
    const rawCssPatterns = ['streetview-nav-hotspot', '/* C12.0-P0', '/* END C12.0-P0', '.vp-marker-pulse'];
    const leakedPatterns = rawCssPatterns.filter(p => bodyText.includes(p));

    const brandLogos = document.querySelectorAll('.brand-logo');
    const brandTextDups = (bodyText.match(/³D₂\s+³D₂/g) || []).length;

    return {
      duplicateWizardRoots: document.querySelectorAll('#setupWizardModal').length,
      brandLogoCount: brandLogos.length,
      brandDuplicateTextCount: brandTextDups,
      rawCssLeaksDetected: leakedPatterns.length > 0,
      leakedCssSnippets: leakedPatterns
    };
  }

  getRuntimeState() {
    return {
      appInfo: this.getAppInfo(),
      camera: this.getCameraDiagnostics(),
      sensor: this.getSensorDiagnostics(),
      guidedCapture: this.getGuidedCaptureDiagnostics(),
      wizard: this.getWizardDiagnostics(),
      viewpointMap: this.getViewpointMapDiagnostics(),
      viewer: this.getMultiPointViewerDiagnostics(),
      domHealth: this.getDomHealthDiagnostics(),
      rollingBufferSnapshot: this.buffer.freezeSnapshot()
    };
  }

  summarize() {
    const app = this.getAppInfo();
    const cam = this.getCameraDiagnostics();
    const sens = this.getSensorDiagnostics();
    const gc = this.getGuidedCaptureDiagnostics();
    const wiz = this.getWizardDiagnostics();
    const dom = this.getDomHealthDiagnostics();

    return {
      SESSION_ID: this.sessionId,
      sessionId: this.sessionId,
      PLATFORM: app.platform,
      platform: app.platform,
      SECURE_HTTPS: app.isSecureContext ? 'YES' : 'NO',
      CAMERA_READY: cam.cameraStreamActive ? 'ACTIVE' : (cam.hasGetUserMedia ? 'AVAILABLE' : 'BLOCKED'),
      CAMERA_FRAMES: gc.previewFrameCount,
      MOTION_EVENTS: sens.deviceMotionEventCount + sens.deviceOrientationEventCount,
      CURRENT_STEP: wiz.currentWizardStep,
      STEP_NAME: wiz.wizardStepName,
      CAPTURE_PROGRESS: gc.progressPercent + '%',
      RAW_CSS_LEAK: dom.rawCssLeaksDetected ? 'DETECTED' : 'CLEAN',
      CHECKPOINT_COUNT: this.buffer.checkpoints.length,
      environment: 'INTERNAL_DEV',
      isTest: true
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileAdapter };
} else {
  window.MobileAdapter = MobileAdapter;
}
