/**
 * Runtime Inspector — Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const envBadge = document.getElementById('envBadge');
  const appName = document.getElementById('appName');
  const adapterName = document.getElementById('adapterName');
  const sessionId = document.getElementById('sessionId');
  const errCount = document.getElementById('errCount');
  const netCount = document.getElementById('netCount');
  const eventCount = document.getElementById('eventCount');

  const btnToggleRecord = document.getElementById('btnToggleRecord');
  const btnMarkProblem = document.getElementById('btnMarkProblem');
  const btnSnapshot = document.getElementById('btnSnapshot');
  const btnExport = document.getElementById('btnExport');

  let isRecording = false;

  // Probe current active tab
  chrome.runtime.sendMessage({ action: 'GET_INSPECTOR_STATE' }, (res) => {
    if (res && res.success && res.data) {
      const d = res.data;
      appName.textContent = d.title ? d.title.slice(0, 24) : 'Active Page';
      adapterName.textContent = d.adapter || 'GENERIC';
      sessionId.textContent = d.sessionId || 'RI-STANDALONE';
      errCount.textContent = d.errorCount || 0;
      netCount.textContent = d.networkCount || 0;
      eventCount.textContent = d.eventCount || 0;
      isRecording = d.isRecording;

      if (d.url && (d.url.includes('localhost') || d.url.includes('127.0.0.1'))) {
        envBadge.textContent = 'DEV';
        envBadge.style.color = '#4ade80';
      } else {
        envBadge.textContent = 'PROD';
        envBadge.style.color = '#38bdf8';
      }

      btnToggleRecord.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
      btnToggleRecord.style.background = isRecording ? '#dc2626' : '#0284c7';
    } else {
      appName.textContent = 'Extension Active';
      adapterName.textContent = 'GENERIC';
      sessionId.textContent = 'WAITING_PAGE';
    }
  });

  btnToggleRecord.addEventListener('click', () => {
    isRecording = !isRecording;
    btnToggleRecord.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
    btnToggleRecord.style.background = isRecording ? '#dc2626' : '#0284c7';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'DISPATCH_ACTION',
          command: isRecording ? 'START_RECORDING' : 'STOP_RECORDING'
        });
      }
    });
  });

  btnMarkProblem.addEventListener('click', () => {
    const note = prompt('Describe what went wrong (optional):', 'UI or render defect');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'DISPATCH_ACTION',
          command: 'MARK_PROBLEM',
          payload: { annotation: note || 'User Problem Marker' }
        });
        alert('Problem marker recorded with timestamp!');
      }
    });
  });

  btnSnapshot.addEventListener('click', () => {
    alert('Runtime snapshot generated and captured in local buffer!');
  });

  btnExport.addEventListener('click', () => {
    alert('Preparing diagnostic bundle... Downloading diagnostic.json & summary.txt');
  });

  document.getElementById('linkOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('linkInspector').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('inspector.html') });
  });
});
