/**
 * Runtime Inspector V1.1 — Content Script
 * Module: extension/content-script.js
 *
 * Connects page lifecycle to extension canonical session controller.
 */

(function () {
  console.log('[Runtime Inspector V1.1] Content script active on:', window.location.href);

  let activeSessionMeta = null;
  let eventQueue = [];
  let flushTimeout = null;

  function flushEvents() {
    if (eventQueue.length === 0) return;
    const batch = [...eventQueue];
    eventQueue = [];

    chrome.runtime.sendMessage({
      action: 'RI_INGEST_EVENTS',
      events: batch
    }, (res) => {
      if (chrome.runtime.lastError) {
        // If worker suspended, events will be retried
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
      }, 500);
    }
  }

  function injectPageBridge(sessionInfo) {
    if (document.getElementById('ri-page-bridge-script')) return;

    const script = document.createElement('script');
    script.id = 'ri-page-bridge-script';
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.dataset.sessionId = sessionInfo?.sessionId || '';
    script.dataset.pageSegmentId = sessionInfo?.pageSegmentId || '';
    script.dataset.recording = sessionInfo?.recording ? 'true' : 'false';

    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // 1. Initial handshake with Service Worker
  chrome.runtime.sendMessage({
    action: 'RI_PAGE_CONNECTED',
    url: window.location.href,
    title: document.title
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[Runtime Inspector] Handshake failed:', chrome.runtime.lastError.message);
      return;
    }

    if (response && response.connected) {
      activeSessionMeta = response;
      if (response.recording) {
        console.log('[Runtime Inspector V1.1] Auto-resuming persistent recording for session:', response.sessionId);
        injectPageBridge(response);
      }
    }
  });

  // 2. Listen to Page Bridge messages
  window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'RI_EMIT_EVENT') {
      queueEvent(event.data.event);
    } else if (event.data.type === 'RI_SPA_ROUTE_CHANGE') {
      queueEvent({
        category: 'NAVIGATION',
        type: 'SPA_ROUTE_CHANGE',
        timestamp: Date.now(),
        payload: event.data.payload
      });
    }
  });

  // 3. Flush on unload / navigation
  window.addEventListener('beforeunload', () => {
    if (eventQueue.length > 0) {
      chrome.runtime.sendMessage({
        action: 'RI_INGEST_EVENTS',
        events: eventQueue
      });
      eventQueue = [];
    }
  });

  // 4. Runtime messages from service worker / popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RECORDING_STARTED') {
      activeSessionMeta = {
        recording: true,
        sessionId: request.sessionId,
        pageSegmentId: request.pageSegmentId
      };
      injectPageBridge(activeSessionMeta);
      window.postMessage({ type: 'RI_COMMAND_START', sessionId: request.sessionId }, '*');
      sendResponse({ status: 'started' });
      return;
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
      return true; // async
    }
  });
})();
