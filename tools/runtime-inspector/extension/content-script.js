/**
 * Runtime Inspector — Content Script Bridge
 * Module: extension/content-script.js
 */

(function () {
  console.log('[Runtime Inspector] Injecting page bridge into page context...');

  // Inject page-bridge.js into main execution context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-bridge.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // Relay messages between popup and page
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PROBE_PAGE') {
      window.postMessage({ type: 'RI_QUERY_STATE' }, '*');
      const handler = (e) => {
        if (e.data && e.data.type === 'RI_STATE_RESPONSE') {
          window.removeEventListener('message', handler);
          sendResponse(e.data.payload);
        }
      };
      window.addEventListener('message', handler);
      return true;
    }

    if (request.action === 'DISPATCH_ACTION') {
      window.postMessage({ type: 'RI_EXECUTE_ACTION', action: request.command, payload: request.payload }, '*');
      sendResponse({ status: 'dispatched' });
    }
  });
})();
