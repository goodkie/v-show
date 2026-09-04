/**
 * Runtime Inspector — Page Bridge (Executes in Web Application context)
 * Module: extension/page-bridge.js
 */

(function () {
  if (window.__RI_BRIDGE_INITIALIZED__) return;
  window.__RI_BRIDGE_INITIALIZED__ = true;

  console.log('[Runtime Inspector] Page Bridge initialized in web context.');

  // Check if Core is loaded or instantiate bundled fallback
  if (typeof window.RuntimeInspectorCore !== 'undefined') {
    window.RI_CORE = new window.RuntimeInspectorCore();
    if (typeof window.ThreeDZAdapter !== 'undefined') {
      window.RI_CORE.registerAdapter(new window.ThreeDZAdapter());
    }
    window.RI_CORE.init();
  }

  // Listen to content-script requests
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'RI_QUERY_STATE') {
      const state = {
        hasCore: Boolean(window.RI_CORE),
        sessionId: window.__RUNTIME_INSPECTOR__?.sessionId || 'NOT_INITIALIZED',
        isRecording: window.__RUNTIME_INSPECTOR__?.isRecording ? window.__RUNTIME_INSPECTOR__.isRecording() : false,
        eventCount: window.__RUNTIME_INSPECTOR__?.getEvents().length || 0,
        errorCount: window.__RUNTIME_INSPECTOR__?.getErrors().length || 0,
        networkCount: window.__RUNTIME_INSPECTOR__?.getNetwork().length || 0,
        adapter: window.RI_CORE?.activeAdapter?.id || 'GENERIC',
        url: window.location.href,
        title: document.title
      };
      window.postMessage({ type: 'RI_STATE_RESPONSE', payload: state }, '*');
    }

    if (event.data.type === 'RI_EXECUTE_ACTION') {
      const action = event.data.action;
      if (action === 'START_RECORDING' && window.RI_CORE) {
        window.RI_CORE.startRecording();
      } else if (action === 'STOP_RECORDING' && window.RI_CORE) {
        window.RI_CORE.stopRecording();
      } else if (action === 'MARK_PROBLEM' && window.RI_CORE) {
        window.RI_CORE.markProblem(event.data.payload?.annotation || 'User Problem Marker');
      }
    }
  });
})();
