/**
 * Runtime Inspector V1.2 — Page Bridge
 * Module: extension/page-bridge.js
 *
 * Runs directly in Web Application execution context.
 * Coordinates Core, Monitors, Probes, and streams real-time events to Content Script.
 */

(function () {
  if (window.__RI_BRIDGE_V1_2_INITIALIZED__) return;
  window.__RI_BRIDGE_V1_2_INITIALIZED__ = true;

  console.log('[Runtime Inspector V1.2] Page Bridge active in page execution context.');

  // 1. Read session info passed from content script / bootstrap
  let sessionInfo = {};
  try {
    const raw = (document.documentElement || document.body)?.dataset?.riSessionInfo;
    if (raw) sessionInfo = JSON.parse(raw);
  } catch (e) {
    console.warn('[RI PageBridge] Failed parsing riSessionInfo dataset:', e);
  }

  // 2. Initialize universal core
  if (typeof window.RuntimeInspectorCore !== 'undefined' && !window.RI_CORE) {
    window.RI_CORE = new window.RuntimeInspectorCore({
      sessionId: sessionInfo.sessionId || '',
      privacyMode: sessionInfo.privacyMode || 'STANDARD'
    });

    window.postMessage({
      type: 'RI_CORE_LOADED',
      sessionId: sessionInfo.sessionId,
      timestamp: Date.now()
    }, '*');

    // Register 3DZ Adapter if present
    if (typeof window.ThreeDZAdapter !== 'undefined') {
      window.RI_CORE.registerAdapter(new window.ThreeDZAdapter());
      window.postMessage({
        type: 'RI_ADAPTER_LOADED',
        adapterId: '3dz',
        timestamp: Date.now()
      }, '*');
    }

    // Initialize core monitors
    window.RI_CORE.init();
    window.postMessage({
      type: 'RI_MONITORS_STARTED',
      timestamp: Date.now()
    }, '*');

    if (sessionInfo.recording) {
      window.RI_CORE.startRecording();
    }
  }

  // 3. Intercept and stream all EventBus events to Content Script
  const bus = window.RI_CORE?.eventBus || window.__RUNTIME_INSPECTOR__?.eventBus;
  if (bus && !bus.__riBridgeHooked) {
    bus.__riBridgeHooked = true;
    const originalEmit = bus.emit.bind(bus);
    bus.emit = function (category, type, payload, options) {
      const ev = originalEmit(category, type, payload, options);
      try {
        window.postMessage({ type: 'RI_EMIT_EVENT', event: ev }, '*');
      } catch (e) {}
      return ev;
    };
  }

  // 4. Emit Bridge Ready & Page Capture Ready Handshake
  window.postMessage({
    type: 'RI_PAGE_BRIDGE_READY',
    timestamp: Date.now()
  }, '*');

  window.postMessage({
    type: 'RI_PAGE_CAPTURE_READY',
    payload: {
      sessionId: sessionInfo.sessionId || window.__RUNTIME_INSPECTOR__?.sessionId || '',
      pageSegmentId: sessionInfo.pageSegmentId || '',
      url: window.location.href,
      adapterId: window.RI_CORE?.activeAdapter?.id || (typeof window.ThreeDZAdapter !== 'undefined' ? '3dz' : 'generic'),
      coreVersion: '1.2.0',
      status: 'READY'
    }
  }, '*');

  // 5. Sensitive DOM region detection (pixel coordinates scaled by devicePixelRatio)
  function getSensitiveRects() {
    if (typeof document === 'undefined') return [];
    const selectors = [
      'input[type="password"]',
      'input[autocomplete*="password"]',
      'input[autocomplete*="one-time-code"]',
      'input[name*="card" i]',
      'input[id*="card" i]',
      'input[name*="cvv" i]',
      'input[name*="cvc" i]',
      '[data-ri-private]'
    ];

    const rects = [];
    const dpr = window.devicePixelRatio || 1;

    for (const sel of selectors) {
      try {
        const elements = document.querySelectorAll(sel);
        elements.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            rects.push({
              x: Math.round(r.left * dpr),
              y: Math.round(r.top * dpr),
              width: Math.round(r.width * dpr),
              height: Math.round(r.height * dpr),
              type: sel
            });
          }
        });
      } catch (e) {}
    }
    return rects;
  }

  // 6. Monitor SPA History navigation
  let lastHref = window.location.href;
  const notifySpaNav = (type, state) => {
    const currentHref = window.location.href;
    if (currentHref !== lastHref) {
      window.postMessage({
        type: 'RI_SPA_ROUTE_CHANGE',
        payload: {
          fromUrl: lastHref,
          toUrl: currentHref,
          action: type,
          state
        }
      }, '*');
      lastHref = currentHref;
    }
  };

  const origPushState = history.pushState;
  history.pushState = function (state, title, url) {
    origPushState.apply(this, arguments);
    notifySpaNav('pushState', state);
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (state, title, url) {
    origReplaceState.apply(this, arguments);
    notifySpaNav('replaceState', state);
  };

  window.addEventListener('popstate', (e) => {
    notifySpaNav('popstate', e.state);
  });

  // 7. Message Router from Content Script
  window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'RI_COMMAND_START') {
      if (window.RI_CORE) {
        if (event.data.sessionId) {
          window.RI_CORE.eventBus.sessionId = event.data.sessionId;
        }
        window.RI_CORE.startRecording();
        const b = window.RI_CORE.eventBus;
        if (b && !b.__riBridgeHooked) {
          b.__riBridgeHooked = true;
          const orig = b.emit.bind(b);
          b.emit = function (cat, typ, pay, opt) {
            const ev = orig(cat, typ, pay, opt);
            try { window.postMessage({ type: 'RI_EMIT_EVENT', event: ev }, '*'); } catch (e) {}
            return ev;
          };
        }
        window.postMessage({
          type: 'RI_PAGE_CAPTURE_READY',
          payload: {
            sessionId: event.data.sessionId || window.RI_CORE.eventBus.sessionId,
            pageSegmentId: event.data.pageSegmentId || '',
            url: window.location.href,
            adapterId: window.RI_CORE?.activeAdapter?.id || '3dz',
            coreVersion: '1.2.0',
            status: 'READY'
          }
        }, '*');
      }
    }

    if (event.data.type === 'RI_QUERY_STATE') {
      const state = {
        hasCore: Boolean(window.RI_CORE),
        sessionId: window.__RUNTIME_INSPECTOR__?.sessionId || 'NOT_INITIALIZED',
        isRecording: window.__RUNTIME_INSPECTOR__?.isRecording ? window.__RUNTIME_INSPECTOR__.isRecording() : false,
        eventCount: window.__RUNTIME_INSPECTOR__?.getEvents().length || 0,
        adapter: window.RI_CORE?.activeAdapter?.id || 'GENERIC',
        url: window.location.href,
        title: document.title
      };
      window.postMessage({ type: 'RI_STATE_RESPONSE', payload: state }, '*');
    }

    if (event.data.type === 'RI_REQUEST_SNAPSHOT_PROBE') {
      const canvasProbe = window.RI_CORE?.canvasMonitor ? window.RI_CORE.canvasMonitor.probeAllCanvases() : [];
      const webglReport = window.RI_CORE?.webglMonitor ? window.RI_CORE.webglMonitor.getReport() : [];
      const adapterState = typeof window.ThreeDZProbes !== 'undefined'
        ? window.ThreeDZProbes.getComplete3DZState()
        : {};
      const sensitiveRects = getSensitiveRects();

      window.postMessage({
        type: 'RI_SNAPSHOT_PROBE_RESPONSE',
        correlationId: event.data.correlationId,
        probeData: {
          canvasProbe,
          webglReport,
          adapterState,
          sensitiveRects,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        }
      }, '*');
    }
  });
})();
