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

// Auto-initialize if running in QA mode in browser
if (typeof window !== 'undefined') {
  window.MobileRuntimeInspector = MobileRuntimeInspector;
  try {
    const params = new URLSearchParams(window.location.search);
    const isQA = params.get('qa') === '1' ||
                 params.get('token') !== null ||
                 window.__IS_INTERNAL_QA__ === true ||
                 Boolean(window.sessionStorage && window.sessionStorage.getItem('mobile_ri_session_id'));

    if (isQA && !window.__MOBILE_RI_INSTANCE__) {
      console.log('[MobileRI] Initializing Mobile Runtime Inspector for QA session...');
      window.__MOBILE_RI_INSTANCE__ = new MobileRuntimeInspector();
      window.__MOBILE_RI_INSTANCE__.start();
    }
  } catch (err) {
    console.warn('[MobileRI] Auto-start check note:', err);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileRuntimeInspector };
}
