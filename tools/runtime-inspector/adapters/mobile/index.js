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
    if (typeof window !== 'undefined' && (!window.__IS_INTERNAL_QA__ || !window.__MOBILE_RI_AUTHORIZED__)) {
      console.warn('[MobileRI] MobileRuntimeInspector.start() blocked: unauthorized session.');
      return;
    }
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

  function clearAuthorizationState() {
    window.__IS_INTERNAL_QA__ = false;
    window.__MOBILE_RI_AUTHORIZED__ = false;
    window.MOBILE_RI_AUTHORIZED = false;
    if (window.__MOBILE_RI_INSTANCE__) {
      try {
        if (window.__MOBILE_RI_INSTANCE__.ui && typeof window.__MOBILE_RI_INSTANCE__.ui.unmount === 'function') {
          window.__MOBILE_RI_INSTANCE__.ui.unmount();
        }
      } catch (e) {}
      window.__MOBILE_RI_INSTANCE__ = null;
    }
    const roots = document.querySelectorAll('#mobileRiContainer, #btnMobileRiReport, #mobileRiSheet, #mobileRiBottomSheet');
    roots.forEach(el => el.remove());

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('mobile_ri_qa_token');
        window.sessionStorage.removeItem('mobile_ri_project_id');
      }
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('mobile_ri_qa_token');
        window.localStorage.removeItem('mobile_ri_project_id');
      }
    } catch (e) {}
  }

  async function checkServerQaAuthorization() {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawQrToken = params.get('token');
      const projectId = params.get('projectId') || 'prj-free-b0c6f3ea';

      // 1. Immediately remove the token query parameter from address bar on all paths (success, invalid, replay, error)
      if (rawQrToken !== null) {
        try {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('token');
          window.history.replaceState({}, '', cleanUrl.toString());
        } catch (e) {}
      }

      let qaSessionToken = (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage.getItem('mobile_ri_qa_token') : null;

      // 2. Single-use QR token redemption exchange (if token was present)
      if (rawQrToken !== null) {
        if (!rawQrToken || !rawQrToken.startsWith('tok-cap-')) {
          console.warn('[MobileRI] Malformed or invalid QA token format rejected.');
          clearAuthorizationState();
          return;
        }

        try {
          const redeemRes = await fetch('/api/internal-qa/auth/redeem-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: rawQrToken, projectId })
          });

          if (!redeemRes.ok) {
            console.warn('[MobileRI] Server rejected QA token redemption (HTTP ' + redeemRes.status + ')');
            clearAuthorizationState();
            return;
          }

          const redeemData = await redeemRes.json();
          if (redeemData.ok && redeemData.authorized && redeemData.qaSessionToken) {
            qaSessionToken = redeemData.qaSessionToken;
            if (window.sessionStorage) {
              window.sessionStorage.setItem('mobile_ri_qa_token', qaSessionToken);
              window.sessionStorage.setItem('mobile_ri_project_id', projectId);
            }
            console.log('[MobileRI] Single-use QR token redeemed successfully. QA browser session established.');
          } else {
            console.warn('[MobileRI] Server rejected QA token redemption payload:', redeemData.reason || redeemData.error);
            clearAuthorizationState();
            return;
          }
        } catch (err) {
          console.warn('[MobileRI] Token redemption network error:', err);
          clearAuthorizationState();
          return;
        }
      }

      // 3. Server-Authoritative capabilities check (sessionStorage only)
      if (qaSessionToken) {
        try {
          const capRes = await fetch('/api/internal-qa/capabilities', {
            headers: { 'x-qa-session': qaSessionToken }
          });

          if (!capRes.ok) {
            console.warn('[MobileRI] Capabilities verification endpoint HTTP error ' + capRes.status);
            clearAuthorizationState();
            return;
          }

          const capData = await capRes.json();
          const targetProjectId = (window.sessionStorage && window.sessionStorage.getItem('mobile_ri_project_id')) || projectId;
          const projectMatches = Boolean(!capData.projectId || capData.projectId === targetProjectId);

          if (
            capData.ok === true &&
            capData.authorized === true &&
            capData.mobileRuntimeInspector === true &&
            capData.role === 'OWNER_QA' &&
            projectMatches
          ) {
            window.__IS_INTERNAL_QA__ = true;
            window.__MOBILE_RI_AUTHORIZED__ = true;
            window.MOBILE_RI_AUTHORIZED = true;

            if (!window.__MOBILE_RI_INSTANCE__) {
              console.log('[MobileRI] Server-side QA authorization confirmed. Mounting Mobile Runtime Inspector...');
              window.__MOBILE_RI_INSTANCE__ = new MobileRuntimeInspector({ qaSessionToken });
              window.__MOBILE_RI_INSTANCE__.start();
            } else {
              window.__MOBILE_RI_INSTANCE__.ui.mount();
            }

            // Expose canonical Section 22 / Addendum L telemetry accessors on window
            window.MOBILE_RI_ROOT_COUNT = () => document.querySelectorAll('#mobileRiContainer').length;
            window.MOBILE_RI_VISIBLE = () => Boolean(document.getElementById('mobileRiContainer') && document.getElementById('btnMobileRiReport'));
            window.MOBILE_RI_SESSION_ID = () => (window.__MOBILE_RI_INSTANCE__ && window.__MOBILE_RI_INSTANCE__.adapter && window.__MOBILE_RI_INSTANCE__.adapter.sessionId) || null;

            // Auto-launch wizard if intended
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
            clearAuthorizationState();
            return;
          }
        } catch (err) {
          console.warn('[MobileRI] Capabilities verification error:', err);
          clearAuthorizationState();
          return;
        }
      }

      // 4. Default unauthorized path (including bare ?qa=1, ?debug=1, ?admin=1, ?mode=booth-tour-wizard)
      clearAuthorizationState();
    } catch (err) {
      console.warn('[MobileRI] QA authorization check exception:', err);
      clearAuthorizationState();
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
