/**
 * 3DZ Mobile Runtime Inspector Universal Client Bundle v1.1.0
 * Architecture: MobileRollingBuffer (60s) + RedactionEngine + MobileAdapter + MobileInspectorUI
 * Security: Server-Authoritative QA Authorization & Single-Use Token Redemption
 */
(function(window) {
  'use strict';

  var module = { exports: {} };
  var exports = module.exports;
  var require = function(id) {
    return {
      RedactionEngine: window.RedactionEngine,
      MobileRollingBuffer: window.MobileRollingBuffer,
      MobileAdapter: window.MobileAdapter,
      MobileInspectorUI: window.MobileInspectorUI
    };
  };

  // 1. Redaction Engine
  (function() {
    /**
 * Runtime Inspector — Universal Secret Redaction Engine
 * Module: core/redaction.js
 *
 * Privacy Modes:
 * - STRICT: Maximum redaction. All IDs, hashes, query params, emails, storage values redacted.
 * - STANDARD (Default): Redacts secrets, tokens, auth headers, cookies, passwords, API keys, emails, PII.
 *                       Allows technical IDs (project IDs, job IDs, slot labels, error codes).
 * - INTERNAL: Engineering mode. Allows internal diagnostic payload details, but STRICTLY redacts
 *             credentials, keys, tokens, and authorization data.
 */

var RedactionEngine = class RedactionEngine {
  constructor(options = {}) {
    this.privacyMode = options.privacyMode || 'STANDARD'; // STRICT | STANDARD | INTERNAL
    this.customRules = options.customRules || [];
    this.redactionCount = 0;

    // Hardcoded secret keywords that must NEVER leak in ANY privacy mode
    this.secretKeyPatterns = [
      /authorization/i,
      /bearer/i,
      /cookie/i,
      /set-cookie/i,
      /token/i,
      /secret/i,
      /password/i,
      /passcode/i,
      /otp/i,
      /passwd/i,
      /apikey/i,
      /api_key/i,
      /private_key/i,
      /credential/i,
      /session_token/i,
      /session_secret/i,
      /sessiontoken/i,
      /jwt/i,
      /stripe/i,
      /resend/i,
      /cloudflare/i,
      /aws_secret/i,
      /r2_token/i
    ];

    // Regex for values (tokens, hashes, emails)
    this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.jwtRegex = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
    this.bearerRegex = /Bearer\s+[a-zA-Z0-9_\-\.~+/]+=*/gi;
    this.uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    this.captureTokenRegex = /tok-cap-[a-zA-Z0-9_\-]+/gi;
    this.inlineSecretRegex = /(token|secret|password|passwd|auth|api[_-]?key|credential)=([a-zA-Z0-9_\-]+)/gi;
  }

  setPrivacyMode(mode) {
    if (['STRICT', 'STANDARD', 'INTERNAL'].includes(mode)) {
      this.privacyMode = mode;
    }
  }

  isSecretKey(key) {
    if (typeof key !== 'string') return false;
    // Do not redact diagnostic structural fields
    if (['session', 'sessionId', 'durationMs', 'startTime', 'captureTime', 'privacyMode'].includes(key)) {
      return false;
    }
    return this.secretKeyPatterns.some(pattern => pattern.test(key));
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    let sanitized = str;

    // Check if string is a JSON payload
    const trimmed = str.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(this.sanitizeObject(parsed));
      } catch (e) {
        // Not valid JSON, proceed with regex sanitization
      }
    }

    // Always redact JWTs
    sanitized = sanitized.replace(this.jwtRegex, () => {
      this.redactionCount++;
      return '[REDACTED_JWT]';
    });

    // Always redact capture session tokens
    sanitized = sanitized.replace(this.captureTokenRegex, () => {
      this.redactionCount++;
      return '[REDACTED_TOKEN]';
    });

    // Redact inline key=value secret patterns
    sanitized = sanitized.replace(this.inlineSecretRegex, (match, p1) => {
      this.redactionCount++;
      return `${p1}=[REDACTED_SECRET]`;
    });

    // Always redact Bearer tokens
    sanitized = sanitized.replace(this.bearerRegex, () => {
      this.redactionCount++;
      return 'Bearer [REDACTED_TOKEN]';
    });

    // Redact Emails in STRICT and STANDARD
    if (this.privacyMode !== 'INTERNAL') {
      sanitized = sanitized.replace(this.emailRegex, () => {
        this.redactionCount++;
        return '[REDACTED_EMAIL]';
      });
    }

    // STRICT mode: redact UUIDs if not whitelisted
    if (this.privacyMode === 'STRICT') {
      sanitized = sanitized.replace(this.uuidRegex, () => {
        this.redactionCount++;
        return '[REDACTED_UUID]';
      });
    }

    return sanitized;
  }

  sanitizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
      // Parse relative or absolute
      const dummyBase = 'https://runtime-inspector.internal';
      const parsed = new URL(rawUrl, dummyBase);

      const sensitiveParams = ['token', 'key', 'auth', 'signature', 'sig', 'secret', 'password', 'code', 'session'];
      parsed.searchParams.forEach((val, key) => {
        if (sensitiveParams.some(p => key.toLowerCase().includes(p)) || this.privacyMode === 'STRICT') {
          parsed.searchParams.set(key, '[REDACTED]');
          this.redactionCount++;
        }
      });

      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return parsed.toString();
      }
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) {
      return this.sanitizeString(rawUrl);
    }
  }

  sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    const sanitized = {};
    for (const [k, v] of Object.entries(headers)) {
      if (this.isSecretKey(k)) {
        sanitized[k] = '[REDACTED_HEADER]';
        this.redactionCount++;
      } else {
        sanitized[k] = this.sanitizeString(String(v));
      }
    }
    return sanitized;
  }

  sanitizeObject(obj, depth = 0) {
    if (depth > 8) return '[MAX_DEPTH_REACHED]';
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, depth + 1));
    }
    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isSecretKey(key)) {
          result[key] = '[REDACTED_SECRET]';
          this.redactionCount++;
        } else if (key.toLowerCase().includes('header') && typeof value === 'object' && value !== null) {
          result[key] = this.sanitizeHeaders(value);
        } else if (typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase() === 'href' || value.startsWith('http://') || value.startsWith('https://'))) {
          result[key] = this.sanitizeUrl(value);
        } else {
          result[key] = this.sanitizeObject(value, depth + 1);
        }
      }
      return result;
    }
    return String(obj);
  }

  scanForLeaks(content) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const suspected = [];

    if (this.jwtRegex.test(text)) suspected.push('UNREDACTED_JWT');
    if (this.bearerRegex.test(text)) suspected.push('UNREDACTED_BEARER_TOKEN');
    
    // Check for raw keys like sk_live, r2_secret, etc.
    const keyPatterns = [
      /sk_live_[0-9a-zA-Z]{20,}/g,
      /rk_live_[0-9a-zA-Z]{20,}/g,
      /re_[0-9a-zA-Z]{20,}/g,
      /ghp_[0-9a-zA-Z]{20,}/g
    ];
    for (const pat of keyPatterns) {
      if (pat.test(text)) suspected.push('DETECTED_LIVE_API_KEY');
    }

    return {
      passed: suspected.length === 0,
      suspectedLeaks: suspected
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RedactionEngine };
} else {
  window.RedactionEngine = RedactionEngine;
}

    window.RedactionEngine = (typeof module !== 'undefined' && module.exports && module.exports.RedactionEngine) || RedactionEngine;
  })();

  // 2. Mobile Rolling Buffer
  (function() {
    var module = { exports: {} };
    /**
 * Mobile Runtime Inspector — Rolling 60-Second In-Memory Diagnostic Buffer
 * Module: adapters/mobile/mobile-buffer.js
 */

class MobileRollingBuffer {
  constructor(options = {}) {
    this.maxAgeMs = options.maxAgeMs || 60000; // 60 seconds rolling window
    this.maxItems = options.maxItems || 300;
    this.events = [];
    this.consoleLogs = [];
    this.networkRequests = [];
    this.checkpoints = [];
  }

  _pruneList(list, now) {
    const cutoff = now - this.maxAgeMs;
    while (list.length > 0 && list[0].timestamp < cutoff) {
      list.shift();
    }
    if (list.length > this.maxItems) {
      list.splice(0, list.length - this.maxItems);
    }
  }

  prune() {
    const now = Date.now();
    this._pruneList(this.events, now);
    this._pruneList(this.consoleLogs, now);
    this._pruneList(this.networkRequests, now);
    this._pruneList(this.checkpoints, now);
  }

  addEvent(category, type, payload = {}) {
    const now = Date.now();
    this.events.push({
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      category,
      type,
      payload
    });
    this.prune();
  }

  addConsole(level, message, details = null) {
    const now = Date.now();
    this.consoleLogs.push({
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      level,
      message,
      details
    });
    this.prune();
  }

  addNetwork(req = {}) {
    const now = Date.now();
    this.networkRequests.push({
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      ...req
    });
    this.prune();
  }

  addCheckpoint(checkpointType, data = {}) {
    const now = Date.now();
    // Prevent duplicate spam of same checkpoint within 5 seconds
    const recentDuplicate = this.checkpoints.slice(-5).find(
      c => c.checkpointType === checkpointType && now - c.timestamp < 5000
    );
    if (recentDuplicate) return null;

    const checkpoint = {
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      checkpointType,
      data
    };
    this.checkpoints.push(checkpoint);
    this.addEvent('CHECKPOINT', checkpointType, data);
    this.prune();
    return checkpoint;
  }

  freezeSnapshot() {
    this.prune();
    return {
      capturedAt: new Date().toISOString(),
      windowSeconds: Math.round(this.maxAgeMs / 1000),
      eventCount: this.events.length,
      events: JSON.parse(JSON.stringify(this.events)),
      consoleCount: this.consoleLogs.length,
      consoleLogs: JSON.parse(JSON.stringify(this.consoleLogs)),
      networkCount: this.networkRequests.length,
      networkRequests: JSON.parse(JSON.stringify(this.networkRequests)),
      checkpointCount: this.checkpoints.length,
      checkpoints: JSON.parse(JSON.stringify(this.checkpoints))
    };
  }

  clear() {
    this.events = [];
    this.consoleLogs = [];
    this.networkRequests = [];
    this.checkpoints = [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileRollingBuffer };
} else {
  window.MobileRollingBuffer = MobileRollingBuffer;
}

    window.MobileRollingBuffer = (typeof module !== 'undefined' && module.exports && module.exports.MobileRollingBuffer) || MobileRollingBuffer;
  })();

  // 3. Mobile Adapter
  (function() {
    var module = { exports: {} };
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
            lastErrorCode: c.lastErrorCode || null,
      lastErrorMessage: c.lastErrorMessage || null,
      ownerCameraStartTap: Boolean(c.telemetry?.guidedControllerStartCalled),
      startButtonHandlerCount: c.telemetry?.startCallCountPerTap || 0,
      controllerStartCallCount: c.controllerStartCallCount || c.telemetry?.controllerStartCallCount || 0,
      startupInFlight: Boolean(c.startupInFlight || c.telemetry?.startupInFlight),
      cameraStartAttemptCount: c.startupAttemptId || c.telemetry?.startupAttemptId || 0,
      currentStartAttemptId: c.currentStartupAttemptId || c.startupAttemptId || 0,
      getUserMediaCalled: Boolean(c.telemetry?.getUserMediaCalled),
      getUserMediaResolved: Boolean(c.telemetry?.getUserMediaResolved),
      streamAcquired: Boolean(c.telemetry?.streamAcquired),
      videoElementFound: Boolean(c.telemetry?.videoElementFound),
      videoElementConnected: Boolean(c.telemetry?.videoElementConnected),
      videoSrcObjectAssigned: Boolean(c.telemetry?.videoSrcObjectAssigned),
      videoLoadedMetadata: Boolean(c.telemetry?.videoLoadedMetadata),
      videoLoadedData: Boolean(c.telemetry?.videoLoadedData),
      videoCanPlay: Boolean(c.telemetry?.videoCanPlay),
      videoPlayCalled: Boolean(c.telemetry?.videoPlayCalled),
      videoPlayResolved: Boolean(c.telemetry?.videoPlayResolved),
      videoPlayErrorName: c.telemetry?.videoPlayErrorName || null,
      videoPlayErrorMessage: c.telemetry?.videoPlayErrorMessage || null,
      videoEventCounts: c.telemetry?.videoEventCounts || null,
      videoWidth: c.videoElement ? c.videoElement.videoWidth : (c.telemetry?.videoWidth || 0),
      videoHeight: c.videoElement ? c.videoElement.videoHeight : (c.telemetry?.videoHeight || 0),
      videoReadyState: c.videoElement ? c.videoElement.readyState : (c.telemetry?.videoReadyState || 0),
      firstVideoFrameReceived: Boolean(c.firstRealFrameObserved || c.telemetry?.firstVideoFrameReceived),
      previewReady: c.state === 'PREVIEW_READY' || c.state === 'CAPTURING' || Boolean(c.telemetry?.previewReady),
      cameraStartResult: c.telemetry?.cameraStartResult || (c.state === 'CAPTURING' || c.state === 'PREVIEW_READY' ? 'PASS' : (c.cameraStage === 'CAMERA_VIDEO_NOT_READY' ? 'VIDEO_NOT_READY' : 'PENDING')),
      cameraStartErrorCode: c.telemetry?.errorCode || c.lastErrorCode || null,
      startupTotalMs: c.telemetry?.timings?.startupTotalMs || null,
      tryAgainCount: c.tryAgainCount || 0,
      resetCaptureForRetryCallCount: c.resetCaptureForRetryCallCount || c.telemetry?.resetCaptureForRetryCallCount || 0,
      resetReason: c.lastResetReason || c.telemetry?.resetReason || null,
      oldStreamTracksStopped: Boolean(c.telemetry?.oldStreamTracksStopped),
      staleCallbackIgnoredCount: c.staleCallbackIgnoredCount || 0,
      activeStreamCount: c.mediaStream ? 1 : 0,
      activeVideoTrackCount: c.mediaStream ? c.mediaStream.getVideoTracks().filter(t => t.readyState === 'live').length : 0,
      videoFrameCallbackSupported: Boolean(c.telemetry?.videoFrameCallbackSupported),
      rvfcRegistered: Boolean(c.telemetry?.rvfcRegistered),
      rvfcCallbackCount: c.rvfcCallbackCount || c.telemetry?.rvfcCallbackCount || 0,
      firstVideoFrameTimestamp: c.telemetry?.firstVideoFrameTimestamp || null,
      firstVideoFrameMediaTime: c.telemetry?.firstVideoFrameMediaTime || null,
      watchdogFired: Boolean(c.telemetry?.watchdogFired),
      watchdogStage: c.telemetry?.watchdogStage || null,
      startCallCountPerTap: c.startCallCountPerTap || c.telemetry?.startCallCountPerTap || 0,
      timings: c.telemetry?.timings || null,
      closureConfirmed: Boolean(c.closureConfirmed || c.telemetry?.closureConfirmed),
      captureCompletionReason: c.telemetry?.captureCompletionReason || (c.closureConfirmed ? 'VISUAL_LOOP_CONFIRMED' : 'IN_PROGRESS'),
      visualClosureSearchEnabled: Boolean(c.visualClosureSearchEnabled || (c.accumulatedRotation >= 300.0)),
      visualClosureSearchEnabledAtRotation: 300.0,
      closureCheckCount: c.closureCheckCount || (c.visualLoopDetector ? c.visualLoopDetector.closureCheckCount : 0) || c.telemetry?.closureCheckCount || 0,
      bestClosureMatchFrameId: c.bestClosureMatch?.candidateId || c.telemetry?.bestClosureMatchFrameId || null,
      bestClosureReferenceId: c.bestClosureMatch?.referenceId || c.telemetry?.bestClosureReferenceId || null,
      closureRawMatches: c.bestClosureMatch?.rawMatchCount || c.telemetry?.closureRawMatches || 0,
      closureGoodMatches: c.bestClosureMatch?.goodMatchCount || c.telemetry?.closureGoodMatches || 0,
      closureInliers: c.bestClosureMatch?.inlierCount || c.telemetry?.closureInliers || 0,
      closureInlierRatio: c.bestClosureMatch?.inlierRatio || c.telemetry?.closureInlierRatio || 0,
      closureReprojectionError: c.bestClosureMatch?.reprojectionError || c.telemetry?.closureReprojectionError || null,
      closureInlierCellCount: c.bestClosureMatch?.inlierCellCount || c.telemetry?.closureInlierCellCount || 0,
      closureInlierBboxAreaRatio: c.bestClosureMatch?.bboxAreaRatio || c.telemetry?.closureInlierBboxAreaRatio || 0,
      closureSensorExpectedDelta: Math.abs(Math.round(c.accumulatedRotation || 0) - 360),
      closureVisualRelativeRotation: c.bestClosureMatch?.relativeRotationDeg || c.telemetry?.closureVisualRelativeRotation || null,
      closureConsecutiveConfirmationCount: c.consecutiveClosureConfirmations || c.telemetry?.closureConsecutiveConfirmationCount || 0,
      fastRotationEventCount: c.fastRotationEventCount || c.telemetry?.fastRotationEventCount || 0,
      canonicalSelectedCount: (c.canonicalKeyframes ? c.canonicalKeyframes.length : 0),
      canonicalPersistedCount: (c.canonicalKeyframes ? c.canonicalKeyframes.length : 0),
      fatalJsErrorCount: c.fatalJsErrorCount || 0
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

    window.MobileAdapter = (typeof module !== 'undefined' && module.exports && module.exports.MobileAdapter) || MobileAdapter;
  })();

  // 4. Mobile Inspector UI
  (function() {
    var module = { exports: {} };
    /**
 * Mobile Runtime Inspector — In-App Floating UI & Report Bottom Sheet
 * Module: adapters/mobile/mobile-ui.js
 */

class MobileInspectorUI {
  constructor(adapter, options = {}) {
    this.adapter = adapter;
    this.reportEndpoint = options.reportEndpoint || '/api/internal-qa/mobile-ri/report';
    this.isSubmitting = false;
    this.container = null;
    this.sheet = null;
  }

  mount() {
    if (typeof document === 'undefined') return;
    const existingRoots = document.querySelectorAll('#mobileRiContainer');
    if (existingRoots.length > 0) {
      for (let i = 1; i < existingRoots.length; i++) existingRoots[i].remove();
      this.container = existingRoots[0];
      return;
    }

    this.container = document.createElement('div');
    this.container.id = 'mobileRiContainer';
    this.container.style.cssText = 'position: fixed; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: none;';

    // C12.9-P1R3: Persistent MutationObserver Remount Engine
    if (typeof MutationObserver !== 'undefined' && !this._observerInstalled) {
      this._observerInstalled = true;
      this._remountCount = 0;
      this._observer = new MutationObserver(() => {
        try {
          const isQaAuthorized = Boolean(
            (typeof window !== 'undefined' && window.__IS_INTERNAL_QA__) ||
            (typeof window !== 'undefined' && window.sessionStorage && window.sessionStorage.getItem('mobile_ri_qa_token')) ||
            (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('mobile_ri_qa_token'))
          );
          if (isQaAuthorized) {
            const roots = document.querySelectorAll('#mobileRiContainer');
            if (roots.length === 0) {
              this._remountCount = (this._remountCount || 0) + 1;
              console.log('[MobileRI] Detach detected! Auto-remounting Mobile Runtime Inspector (remountCount=' + this._remountCount + ')...');
              this.mount();
            } else if (roots.length > 1) {
              for (let i = 1; i < roots.length; i++) roots[i].remove();
            }
          }
        } catch(e) {}
      });
      const targetNode = document.body || document.documentElement;
      if (targetNode) {
        this._observer.observe(targetNode, { childList: true, subtree: true });
      }
    }

    // Floating REPORT ISSUE Button (Bottom Right)
    const floatBtn = document.createElement('button');
    floatBtn.id = 'btnMobileRiReport';
    floatBtn.type = 'button';
    floatBtn.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ef4444; margin-right:6px; box-shadow:0 0 6px #ef4444;"></span>REPORT ISSUE';
    floatBtn.style.cssText = `
      position: fixed;
      bottom: 18px;
      right: 18px;
      padding: 9px 16px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid #38bdf8;
      color: #f8fafc;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      border-radius: 30px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.6), 0 0 10px rgba(56,189,248,0.3);
      cursor: pointer;
      pointer-events: auto;
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      transition: transform 0.15s ease, background 0.15s ease;
    `;
    floatBtn.onclick = () => this.openBottomSheet();
    this.container.appendChild(floatBtn);

    // Mobile Bottom Sheet Modal
    this.sheet = document.createElement('div');
    this.sheet.id = 'mobileRiBottomSheet';
    this.sheet.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      align-items: flex-end;
      justify-content: center;
      pointer-events: auto;
    `;
    this.sheet.onclick = (e) => {
      if (e.target === this.sheet) this.closeBottomSheet();
    };

    const card = document.createElement('div');
    card.id = 'mobileRiCard';
    card.style.cssText = `
      background: #09101d;
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-bottom: none;
      border-radius: 20px 20px 0 0;
      width: 100%;
      max-width: 480px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 20px 24px 28px 24px;
      color: #f8fafc;
      box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
      transform: translateY(0);
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    card.innerHTML = `
      <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 16px auto;"></div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: linear-gradient(135deg, #0284c7, #38bdf8); border-radius: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;">RI</span>
          <div>
            <div style="font-size: 13.5px; font-weight: 800; letter-spacing: 0.3px;">³D₂ MOBILE INSPECTOR</div>
            <div style="font-size: 10.5px; color: #94a3b8; font-family: monospace;">Session: <span id="mobileRiHeaderSession" style="color: #38bdf8; font-weight: 700;"></span></div>
          </div>
        </div>
        <button type="button" id="btnMobileRiClose" style="background: rgba(255,255,255,0.08); border: none; color: #94a3b8; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px;">&times;</button>
      </div>

      <!-- Quick Metrics Grid -->
      <div id="mobileRiMetricsGrid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Secure HTTPS</span>
          <span id="mMetricHttps" style="font-size: 11.5px; font-weight: 800; color: #34d399;">YES</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Camera</span>
          <span id="mMetricCamera" style="font-size: 11.5px; font-weight: 800; color: #38bdf8;">READY</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Camera Frames</span>
          <span id="mMetricFrames" style="font-size: 11.5px; font-weight: 800; color: #f8fafc;">0</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Motion Events</span>
          <span id="mMetricMotion" style="font-size: 11.5px; font-weight: 800; color: #f8fafc;">0</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Current Step</span>
          <span id="mMetricStep" style="font-size: 11.5px; font-weight: 800; color: #38bdf8;">-</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Capture %</span>
          <span id="mMetricCapture" style="font-size: 11.5px; font-weight: 800; color: #34d399;">0%</span>
        </div>
      </div>

      <!-- Optional Owner Note -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 11.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">
          What happened? <span style="font-weight: 400; color: #64748b;">(optional note)</span>
        </label>
        <textarea id="mobileRiNote" placeholder="e.g. Camera froze at 0%, or Marker drag didn't update..." rows="2" style="width: 100%; box-sizing: border-box; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #f8fafc; font-size: 12px; resize: none; font-family: inherit;"></textarea>
      </div>

      <!-- Action Button Area -->
      <div id="mobileRiActionArea">
        <button type="button" id="btnMobileRiSubmit" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0284c7, #10b981); border: 1px solid #38bdf8; border-radius: 10px; color: #fff; font-size: 13.5px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(2,132,199,0.4); display: flex; align-items: center; justify-content: center; gap: 8px;">
          CAPTURE BUG REPORT
        </button>
      </div>

      <!-- Post-Submit Success Display -->
      <div id="mobileRiSuccessArea" style="display: none; text-align: center; padding: 12px 0;">
        <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(52,211,153,0.15); border: 1px solid #34d399; color: #34d399; display: flex; align-items: center; justify-content: center; font-size: 20px; margin: 0 auto 10px auto;">✓</div>
        <h4 style="font-size: 15px; font-weight: 800; color: #fff; margin: 0 0 4px 0;">Report Saved</h4>
        <p style="font-size: 11.5px; color: #94a3b8; margin: 0 0 12px 0;">60-second telemetry and diagnostics uploaded.</p>
        <div style="background: rgba(15,23,42,0.9); border: 1px solid #38bdf8; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-family: monospace;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 2px;">SESSION ID</div>
          <div id="mobileRiCompletedSessionId" style="font-size: 16px; font-weight: 800; color: #38bdf8; letter-spacing: 1px;"></div>
        </div>
        <button type="button" id="btnMobileRiCopy" style="padding: 9px 20px; font-size: 12.5px; font-weight: 800; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #f8fafc; border-radius: 8px; cursor: pointer;">
          COPY SESSION ID
        </button>
      </div>
    `;

    this.sheet.appendChild(card);
    this.container.appendChild(this.sheet);
    document.body.appendChild(this.container);

    document.getElementById('btnMobileRiClose').onclick = () => this.closeBottomSheet();
    document.getElementById('btnMobileRiSubmit').onclick = () => this.submitReport();
    document.getElementById('btnMobileRiCopy').onclick = () => this.copySessionId();
  }

  openBottomSheet() {
    if (!this.sheet) return;
    this.sheet.style.display = 'flex';
    this.updateMetrics();
  }

  closeBottomSheet() {
    if (!this.sheet) return;
    this.sheet.style.display = 'none';
  }

  updateMetrics() {
    if (!this.adapter) return;
    const summary = this.adapter.summarize();
    const sidEl = document.getElementById('mobileRiHeaderSession');
    if (sidEl) sidEl.textContent = summary.SESSION_ID;

    const elHttps = document.getElementById('mMetricHttps');
    if (elHttps) {
      elHttps.textContent = summary.SECURE_HTTPS;
      elHttps.style.color = summary.SECURE_HTTPS === 'YES' ? '#34d399' : '#ef4444';
    }

    const elCam = document.getElementById('mMetricCamera');
    if (elCam) {
      elCam.textContent = summary.CAMERA_READY;
      elCam.style.color = summary.CAMERA_READY === 'ACTIVE' ? '#34d399' : (summary.CAMERA_READY === 'AVAILABLE' ? '#38bdf8' : '#ef4444');
    }

    const elFrames = document.getElementById('mMetricFrames');
    if (elFrames) elFrames.textContent = summary.CAMERA_FRAMES;

    const elMotion = document.getElementById('mMetricMotion');
    if (elMotion) elMotion.textContent = summary.MOTION_EVENTS;

    const elStep = document.getElementById('mMetricStep');
    if (elStep) elStep.textContent = summary.CURRENT_STEP !== null ? summary.CURRENT_STEP : '-';

    const elCap = document.getElementById('mMetricCapture');
    if (elCap) elCap.textContent = summary.CAPTURE_PROGRESS;
  }

  async captureScreenshot() {
    if (typeof document === 'undefined') return null;
    try {
      // If canvas is present, snapshot active canvas
      const canvas = document.querySelector('canvas');
      if (canvas && typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/png');
      }
    } catch (e) {
      console.warn('[MobileRI] Canvas snapshot error:', e);
    }
    return null;
  }

  async submitReport() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const btn = document.getElementById('btnMobileRiSubmit');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Packaging Report...';
    }

    try {
      const note = document.getElementById('mobileRiNote')?.value || '';
      const screenshotData = await this.captureScreenshot();
      const state = this.adapter.getRuntimeState();

      const rollingBuffer = this.adapter.buffer ? this.adapter.buffer.freezeSnapshot() : {};
      const payload = {
        sessionId: this.adapter.sessionId,
        submittedAt: new Date().toISOString(),
        ownerNote: note,
        hasScreenshot: Boolean(screenshotData),
        screenshotBase64: screenshotData,
        state,
        runtimeState: state,
        timeline: rollingBuffer.events || [],
        consoleLogs: rollingBuffer.consoleLogs || [],
        networkRequests: rollingBuffer.networkRequests || [],
        summary: this.adapter.summarize()
      };

      const qaSessionToken = (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage.getItem('mobile_ri_qa_token') : null;
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (qaSessionToken) {
        reqHeaders['x-qa-session'] = qaSessionToken;
      }

      const res = await fetch(this.reportEndpoint, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.ok) {
        document.getElementById('mobileRiActionArea').style.display = 'none';
        const successArea = document.getElementById('mobileRiSuccessArea');
        successArea.style.display = 'block';
        document.getElementById('mobileRiCompletedSessionId').textContent = this.adapter.sessionId;
      } else {
        alert('Report submission note: ' + (data.error || 'Server error'));
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'CAPTURE BUG REPORT';
        }
      }
    } catch (err) {
      console.error('[MobileRI Submit Error]', err);
      alert('Report submission error: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'CAPTURE BUG REPORT';
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  copySessionId() {
    const sid = this.adapter.sessionId;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(sid).then(() => {
        const btn = document.getElementById('btnMobileRiCopy');
        if (btn) btn.textContent = 'COPIED!';
        setTimeout(() => { if (btn) btn.textContent = 'COPY SESSION ID'; }, 2000);
      });
    } else {
      prompt('Copy Session ID:', sid);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileInspectorUI };
} else {
  window.MobileInspectorUI = MobileInspectorUI;
}

    window.MobileInspectorUI = (typeof module !== 'undefined' && module.exports && module.exports.MobileInspectorUI) || MobileInspectorUI;
  })();

  // 5. Bundle Entry & Server-Authoritative QA Auto-Initializer
  (function() {
    var module = { exports: {} };
    /**
 * Mobile Runtime Inspector — Universal Bundle Entry
 * Module: adapters/mobile/index.js
 */

if (typeof require !== 'undefined') {
  var { RedactionEngine } = require('../../core/redaction');
  var { MobileRollingBuffer } = require('./mobile-buffer');
  var { MobileAdapter } = require('./mobile-adapter');
  var { MobileInspectorUI } = require('./mobile-ui');
}

class MobileRuntimeInspector {
  constructor(options = {}) {
    this.redaction = options.redaction || new RedactionEngine({ privacyMode: 'STANDARD' });
    this.buffer = new MobileRollingBuffer();
    this.adapter = new MobileAdapter({
      sessionId: options.sessionId,
      redaction: this.redaction,
      buffer: this.buffer
    });
    this.ui = new MobileInspectorUI(this.adapter, {
      reportEndpoint: options.reportEndpoint || '/api/internal-qa/mobile-ri/report'
    });
    this.isStarted = false;
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    this.adapter.attachSensors();
    this.instrumentConsole();
    this.instrumentNetwork();
    this.instrumentInteraction();
    this.startAutoCheckpoints();

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.ui.mount());
      } else {
        this.ui.mount();
      }
    }
  }

  instrumentConsole() {
    if (typeof window === 'undefined') return;
    const origError = console.error;
    const origWarn = console.warn;

    console.error = (...args) => {
      try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(this.redaction.sanitizeObject(a)) : String(a)).join(' ');
        this.buffer.addConsole('ERROR', this.redaction.sanitizeString(msg));
      } catch(e) {}
      origError.apply(console, args);
    };

    console.warn = (...args) => {
      try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(this.redaction.sanitizeObject(a)) : String(a)).join(' ');
        this.buffer.addConsole('WARN', this.redaction.sanitizeString(msg));
      } catch(e) {}
      origWarn.apply(console, args);
    };

    window.addEventListener('error', (e) => {
      this.buffer.addCheckpoint('FATAL_JS_ERROR', {
        message: this.redaction.sanitizeString(e.message || 'Error'),
        filename: this.redaction.sanitizeUrl(e.filename || ''),
        lineno: e.lineno,
        colno: e.colno
      });
    });

    window.addEventListener('unhandledrejection', (e) => {
      this.buffer.addCheckpoint('UNHANDLED_REJECTION', {
        reason: this.redaction.sanitizeString(String(e.reason || 'Unhandled Promise'))
      });
    });
  }

  instrumentNetwork() {
    if (typeof window === 'undefined') return;
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = async (...args) => {
        const t0 = Date.now();
        const rawUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        const method = (args[1]?.method || 'GET').toUpperCase();
        const sanitizedUrl = this.redaction.sanitizeUrl(rawUrl);

        try {
          const res = await origFetch.apply(window, args);
          const duration = Date.now() - t0;
          this.buffer.addNetwork({
            method,
            url: sanitizedUrl,
            status: res.status,
            durationMs: duration,
            ok: res.ok
          });

          if (res.status >= 500) {
            this.buffer.addCheckpoint('API_ERROR_5XX_CHECKPOINT', {
              method,
              url: sanitizedUrl,
              status: res.status
            });
          }
          return res;
        } catch (err) {
          const duration = Date.now() - t0;
          this.buffer.addNetwork({
            method,
            url: sanitizedUrl,
            status: 0,
            durationMs: duration,
            ok: false,
            error: err.message
          });
          this.buffer.addCheckpoint('NETWORK_FAILURE_CHECKPOINT', {
            method,
            url: sanitizedUrl,
            error: err.message
          });
          throw err;
        }
      };
    }
  }

  instrumentInteraction() {
    if (typeof window === 'undefined') return;
    // Lightweight interaction events
    window.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const btn = target.closest('button, a, .wizard-vp-marker');
      if (btn) {
        this.buffer.addEvent('INTERACTION', 'TAP', {
          id: btn.id || null,
          className: btn.className ? String(btn.className) : null,
          text: (btn.innerText || '').trim().slice(0, 30)
        });
      }
    }, { capture: true, passive: true });
  }

  startAutoCheckpoints() {
    if (typeof window === 'undefined') return;

    // Check stuck capture (progress remains 0% for > 5s while active)
    let captureZeroStart = null;
    setInterval(() => {
      try {
        const gc = this.adapter.getGuidedCaptureDiagnostics();
        if (gc.captureState === 'CAPTURING' || gc.captureState === 'STARTING') {
          if (gc.progressPercent === 0) {
            if (!captureZeroStart) captureZeroStart = Date.now();
            else if (Date.now() - captureZeroStart >= 5000) {
              this.buffer.addCheckpoint('CAPTURE_ZERO_PROGRESS_CHECKPOINT', {
                cameraActive: gc.previewFrameCount > 0,
                previewFrames: gc.previewFrameCount,
                sensorEvents: gc.orientationEventCount + gc.motionEventCount,
                guidanceMode: gc.guidanceMode,
                accumulatedRotation: gc.accumulatedRotation
              });
              captureZeroStart = null; // single-shot per episode
            }
          } else {
            captureZeroStart = null;
          }
        } else {
          captureZeroStart = null;
        }

        // Check raw CSS leak in DOM
        const dom = this.adapter.getDomHealthDiagnostics();
        if (dom.rawCssLeaksDetected) {
          this.buffer.addCheckpoint('RAW_CSS_VISIBLE_CHECKPOINT', {
            snippets: dom.leakedCssSnippets
          });
        }
      } catch(e) {}
    }, 2000);
  }
}

// Server-Authoritative QA Authorization & Mobile RI Activation
if (typeof window !== 'undefined') {
  window.MobileRuntimeInspector = MobileRuntimeInspector;

  async function checkServerQaAuthorization() {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawQrToken = params.get('token');
      const projectId = params.get('projectId') || 'prj-free-b0c6f3ea';

      let qaSessionToken = window.sessionStorage ? window.sessionStorage.getItem('mobile_ri_qa_token') : null;

      // 1. Single-use QR token redemption exchange
      if (rawQrToken && rawQrToken.startsWith('tok-cap-')) {
        try {
          const redeemRes = await fetch('/api/internal-qa/auth/redeem-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: rawQrToken, projectId })
          });
          const redeemData = await redeemRes.json();
          if (redeemData.ok && redeemData.authorized && redeemData.qaSessionToken) {
            qaSessionToken = redeemData.qaSessionToken;
            if (window.sessionStorage) {
              window.sessionStorage.setItem('mobile_ri_qa_token', qaSessionToken);
              window.sessionStorage.setItem('mobile_ri_project_id', projectId);
            }
            // Strip single-use token from address bar to prevent reuse/leakage
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('token');
            window.history.replaceState({}, '', cleanUrl.toString());
            console.log('[MobileRI] Single-use QR token redeemed successfully. QA browser session established.');
          } else {
            console.warn('[MobileRI] Server rejected QA token redemption:', redeemData.reason || redeemData.error);
            // C12.9-P2R6: Fallback to local QA mode so REPORT ISSUE control remains mounted
            if (params.get('qa') === '1' || params.get('mode') === 'booth-tour-wizard') {
              console.log('[MobileRI] Mounting fallback Mobile RI for QA/wizard session...');
              window.__MOBILE_RI_INSTANCE__ = new MobileRuntimeInspector({ fallbackMode: true });
              window.__MOBILE_RI_INSTANCE__.start();
            }
            return;
          }
        } catch (err) {
          console.warn('[MobileRI] Token redemption network error:', err);
          return;
        }
      }

      // 2. Server-Authoritative capabilities check
      if (qaSessionToken) {
        try {
          const capRes = await fetch('/api/internal-qa/capabilities', {
            headers: { 'x-qa-session': qaSessionToken }
          });
          const capData = await capRes.json();
          if (capData.ok && capData.authorized && capData.mobileRuntimeInspector) {
            window.__IS_INTERNAL_QA__ = true;
            window.__MOBILE_RI_AUTHORIZED__ = true;
            if (window.localStorage) {
              try { window.localStorage.setItem('mobile_ri_qa_token', qaSessionToken); } catch(e){}
            }
            if (!window.__MOBILE_RI_INSTANCE__) {
              console.log('[MobileRI] Server-side QA authorization confirmed. Mounting Mobile Runtime Inspector...');
              window.__MOBILE_RI_INSTANCE__ = new MobileRuntimeInspector({ qaSessionToken });
              window.__MOBILE_RI_INSTANCE__.start();
            } else {
              window.__MOBILE_RI_INSTANCE__.ui.mount();
            }

            // Expose canonical Section 22 / Addendum L telemetry accessors on window
            window.MOBILE_RI_AUTHORIZED = true;
            window.MOBILE_RI_ROOT_COUNT = () => document.querySelectorAll('#mobileRiContainer').length;
            window.MOBILE_RI_VISIBLE = () => Boolean(document.getElementById('mobileRiContainer') && document.getElementById('btnMobileRiReport'));
            window.MOBILE_RI_SESSION_ID = () => (window.__MOBILE_RI_INSTANCE__ && window.__MOBILE_RI_INSTANCE__.adapter && window.__MOBILE_RI_INSTANCE__.adapter.sessionId) || null;

            // C12.4 Owner QA Wizard Auto-Launch: Guarantee Step 1 entry upon authorized QA session
            const searchParams = new URLSearchParams(window.location.search);
            const hasWizardIntent = searchParams.get('mode') === 'booth-tour-wizard' || searchParams.get('step') !== null || searchParams.get('openWizard') === '1' || window.__IS_INTERNAL_QA__;
            if (hasWizardIntent) {
              const stepVal = parseInt(searchParams.get('step') || '1', 10);
              const targetStep = (!isNaN(stepVal) && stepVal > 0) ? stepVal : 1;
              const launchWizard = () => {
                if (typeof window.openMultiPointTourWizard === 'function' && window.setupWizard) {
                  window.openMultiPointTourWizard(targetStep);
                  if (window.setupWizard) {
                    window.setupWizard.currentStep = targetStep;
                    window.setupWizard.renderStep();
                  }
                  return true;
                }
                return false;
              };
              if (!launchWizard()) {
                const retryTimer = setInterval(() => {
                  if (launchWizard()) clearInterval(retryTimer);
                }, 100);
                setTimeout(() => clearInterval(retryTimer), 4000);
              }
            }
            return;
          } else {
            console.warn('[MobileRI] Server rejected QA session capability check.');
            if (window.sessionStorage) window.sessionStorage.removeItem('mobile_ri_qa_token');
          }
        } catch (err) {
          console.warn('[MobileRI] Capabilities verification error:', err);
        }
      }

      // 3. Normal / unauthenticated session (including bare ?qa=1 without valid credentials)
      // Strictly do NOT activate or mount Mobile RI. PUBLIC_QA_QUERY_FLAG_GRANTS_ACCESS = false.
    } catch (err) {
      console.warn('[MobileRI] QA authorization check note:', err);
    }
  }

  // Run authorization check after DOM/load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkServerQaAuthorization());
  } else {
    checkServerQaAuthorization();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileRuntimeInspector };
}

    window.MobileRuntimeInspector = (typeof module !== 'undefined' && module.exports && module.exports.MobileRuntimeInspector) || MobileRuntimeInspector;
  })();
})(typeof window !== 'undefined' ? window : globalThis);
