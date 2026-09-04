/**
 * Runtime Inspector V1.1 — Page Bridge
 * Module: extension/page-bridge.js
 *
 * Runs directly in Web Application execution context.
 * Streams real-time events to Content Script.
 */

(function () {
  if (window.__RI_BRIDGE_V1_1_INITIALIZED__) return;
  window.__RI_BRIDGE_V1_1_INITIALIZED__ = true;

  console.log('[Runtime Inspector V1.1] Page Bridge loaded in page context.');

  // Initialize universal core if present
  if (typeof window.RuntimeInspectorCore !== 'undefined' && !window.RI_CORE) {
    window.RI_CORE = new window.RuntimeInspectorCore();
    if (typeof window.ThreeDZAdapter !== 'undefined') {
      window.RI_CORE.registerAdapter(new window.ThreeDZAdapter());
    }
    window.RI_CORE.init();
    window.RI_CORE.startRecording();
  }

  // Intercept and stream events to content script
  if (window.__RUNTIME_INSPECTOR__ && window.__RUNTIME_INSPECTOR__.eventBus) {
    const originalEmit = window.__RUNTIME_INSPECTOR__.eventBus.emit.bind(window.__RUNTIME_INSPECTOR__.eventBus);
    window.__RUNTIME_INSPECTOR__.eventBus.emit = function (category, type, payload, options) {
      const ev = originalEmit(category, type, payload, options);
      window.postMessage({ type: 'RI_EMIT_EVENT', event: ev }, '*');
      return ev;
    };
  }

  // Monitor SPA History navigation (pushState, replaceState, popstate)
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

  // Listen to messages from content script
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'RI_COMMAND_START') {
      if (window.RI_CORE) window.RI_CORE.startRecording();
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
  });
})();
