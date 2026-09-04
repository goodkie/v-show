/**
 * Runtime Inspector — Chrome Extension Service Worker
 * Module: extension/service-worker.js
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Runtime Inspector] Service worker installed.');
  chrome.storage.local.get(['approvedDomains', 'privacyMode'], (res) => {
    if (!res.approvedDomains) {
      chrome.storage.local.set({
        approvedDomains: [
          'v-show-commercial-v1-production.up.railway.app',
          'localhost',
          '127.0.0.1'
        ],
        privacyMode: 'STANDARD'
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true; // Asynchronous response
  }

  if (message.action === 'GET_INSPECTOR_STATE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ success: false, error: 'No active tab' });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'PROBE_PAGE' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, data: response });
        }
      });
    });
    return true;
  }
});
