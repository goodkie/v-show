/**
 * Runtime Inspector V1.2 — Content Script
 * Module: extension/content-script.js
 *
 * Runs in Content Script isolated world. Connects page lifecycle to Service Worker,
 * runs deterministic bootstrap loader, and bridges probes & sensitive regions.
 */

(function () {
  console.log('[Runtime Inspector V1.2] Content script initialized on:', window.location.href);

  let activeSessionMeta = null;
  let eventQueue = [];
  let flushTimeout = null;
  let pendingProbeResolvers = new Map();

  function flushEvents() {
    if (eventQueue.length === 0) return;
    const batch = [...eventQueue];
    eventQueue = [];

    chrome.runtime.sendMessage({
      action: 'RI_INGEST_EVENTS',
      events: batch
    }, (res) => {
      if (chrome.runtime.lastError) {
        // Retry if service worker was waking up
      }
    });
  }

  function queueEvent(ev) {
    eventQueue.push({
      ...ev,
      pageSegmentId: activeSessionMeta?.pageSegmentId,
      url: window.location.href
    });

    if (eventQueue.length >= 10) {
      if (flushTimeout) clearTimeout(flushTimeout);
      flushEvents();
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushTimeout = null;
        flushEvents();
      }, 300);
    }
  }

  function triggerBootstrap(sessionInfo) {
    if (window.RuntimeInspectorBootstrap) {
      window.RuntimeInspectorBootstrap.run(sessionInfo);
    }
  }

  // 1. Initial handshake with Service Worker
  chrome.runtime.sendMessage({
    action: 'RI_PAGE_CONNECTED',
    url: window.location.href,
    title: document.title
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[Runtime Inspector V1.2] Initial handshake warning:', chrome.runtime.lastError.message);
      return;
    }

    if (response && response.connected) {
      activeSessionMeta = response;
      // Always bootstrap if origin is approved so that probes and network/console monitors are ready
      triggerBootstrap(response);
    }
  });

  // 2. Listen to Page Bridge messages
  window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    const { type, payload, event: riEvent, correlationId, probeData } = event.data;

    if (type === 'RI_EMIT_EVENT' && riEvent) {
      queueEvent(riEvent);
    } else if (type === 'RI_SPA_ROUTE_CHANGE') {
      queueEvent({
        category: 'NAVIGATION',
        type: 'SPA_ROUTE_CHANGE',
        timestamp: Date.now(),
        payload: event.data.payload
      });
    } else if (type === 'RI_PAGE_CAPTURE_READY') {
      chrome.runtime.sendMessage({
        action: 'RI_PAGE_CAPTURE_READY',
        payload: {
          ...payload,
          url: window.location.href,
          title: document.title
        }
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    } else if (type === 'RI_PAGE_CAPTURE_BOOTSTRAP_FAILED') {
      chrome.runtime.sendMessage({
        action: 'RI_PAGE_CAPTURE_BOOTSTRAP_FAILED',
        payload: event.data
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    } else if (type === 'RI_SNAPSHOT_PROBE_RESPONSE' && correlationId) {
      const resolver = pendingProbeResolvers.get(correlationId);
      if (resolver) {
        pendingProbeResolvers.delete(correlationId);
        resolver(probeData);
      }
    }
  });

  // 3. Flush on page unload
  window.addEventListener('beforeunload', () => {
    if (eventQueue.length > 0) {
      chrome.runtime.sendMessage({
        action: 'RI_INGEST_EVENTS',
        events: eventQueue
      });
      eventQueue = [];
    }
  });

  // 4. Runtime message listener from Service Worker & Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RECORDING_STARTED') {
      activeSessionMeta = {
        recording: true,
        sessionId: request.sessionId,
        pageSegmentId: request.pageSegmentId
      };
      triggerBootstrap(activeSessionMeta);
      window.postMessage({
        type: 'RI_COMMAND_START',
        sessionId: request.sessionId,
        pageSegmentId: request.pageSegmentId
      }, '*');
      sendResponse({ status: 'started' });
      return;
    }

    if (request.action === 'GET_PAGE_PROBE') {
      const corrId = 'PROBE-' + Math.random().toString(36).slice(2, 9);
      const timeout = setTimeout(() => {
        if (pendingProbeResolvers.has(corrId)) {
          pendingProbeResolvers.delete(corrId);
          sendResponse({
            success: false,
            error: 'Probe timed out',
            canvasProbe: [],
            sensitiveRects: [],
            adapterState: {},
            viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 }
          });
        }
      }, 2000);

      pendingProbeResolvers.set(corrId, (probeData) => {
        clearTimeout(timeout);
        sendResponse({ success: true, ...probeData });
      });

      window.postMessage({ type: 'RI_REQUEST_SNAPSHOT_PROBE', correlationId: corrId }, '*');
      return true; // async sendResponse
    }

    if (request.action === 'PROBE_PAGE') {
      window.postMessage({ type: 'RI_QUERY_STATE' }, '*');
      const handler = (e) => {
        if (e.data && e.data.type === 'RI_STATE_RESPONSE') {
          window.removeEventListener('message', handler);
          sendResponse(e.data.payload);
        }
      };
      window.addEventListener('message', handler);
      return true; // async sendResponse
    }
  });
})();
