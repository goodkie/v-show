/**
 * Runtime Inspector V1.2 — Popup Controller
 * Module: extension/popup.js
 *
 * Connects directly to Service Worker Canonical Session Controller,
 * renders Subsystem Health, Screenshot controls, and exports canonical ZIP bundle.
 */

document.addEventListener('DOMContentLoaded', () => {
  const sessionStatusBadge = document.getElementById('sessionStatusBadge');
  const sessionId = document.getElementById('sessionId');
  const sessionDuration = document.getElementById('sessionDuration');
  const targetUrl = document.getElementById('targetUrl');

  const badgeSession = document.getElementById('badgeSession');
  const badgePageBridge = document.getElementById('badgePageBridge');
  const badgeNetwork = document.getElementById('badgeNetwork');
  const badgeConsole = document.getElementById('badgeConsole');
  const badgeAdapter = document.getElementById('badgeAdapter');
  const badgeScreenshot = document.getElementById('badgeScreenshot');
  const bridgeWarningBanner = document.getElementById('bridgeWarningBanner');

  const pageCount = document.getElementById('pageCount');
  const eventCount = document.getElementById('eventCount');
  const errCount = document.getElementById('errCount');
  const shotCount = document.getElementById('shotCount');
  const shotCountDetail = document.getElementById('shotCountDetail');
  const maskedCountDetail = document.getElementById('maskedCountDetail');
  const chkIncludeScreenshots = document.getElementById('chkIncludeScreenshots');

  const btnToggleRecord = document.getElementById('btnToggleRecord');
  const recordExplanation = document.getElementById('recordExplanation');
  const activeActionButtons = document.getElementById('activeActionButtons');
  const btnMarkProblem = document.getElementById('btnMarkProblem');
  const btnCaptureScreenshot = document.getElementById('btnCaptureScreenshot');
  const btnCaptureSnapshot = document.getElementById('btnCaptureSnapshot');
  const btnExport = document.getElementById('btnExport');

  const recoveryBanner = document.getElementById('recoveryBanner');
  const recoveryText = document.getElementById('recoveryText');
  const btnResumeSession = document.getElementById('btnResumeSession');
  const btnStopSaveSession = document.getElementById('btnStopSaveSession');
  const btnDiscardSession = document.getElementById('btnDiscardSession');

  const recentSessionsList = document.getElementById('recentSessionsList');
  const linkOptions = document.getElementById('linkOptions');
  const linkInspector = document.getElementById('linkInspector');

  let activeSessionData = null;
  let timerInterval = null;

  function formatDuration(ms) {
    if (!ms || isNaN(ms)) return '00:00';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startDurationTimer(startedAt) {
    if (timerInterval) clearInterval(timerInterval);
    const start = new Date(startedAt).getTime();
    const update = () => {
      const elapsed = Date.now() - start;
      sessionDuration.textContent = formatDuration(elapsed);
    };
    update();
    timerInterval = setInterval(update, 1000);
  }

  function stopDurationTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateUI(session) {
    activeSessionData = session;
    const isRecording = Boolean(session && session.recording);

    if (isRecording) {
      sessionStatusBadge.textContent = '● RECORDING';
      sessionStatusBadge.className = 'badge-status badge-recording';
      sessionId.textContent = session.sessionId;
      targetUrl.textContent = session.currentUrl || 'Tracking active tab';

      badgeSession.textContent = '● RECORDING';
      badgeSession.className = 'subsystem-val status-recording';

      const bridgeStatus = session.pageBridgeStatus || (session.pageBridgeConnected ? 'CONNECTED' : 'CONNECTING');
      if (bridgeStatus === 'CONNECTED') {
        badgePageBridge.textContent = '● CONNECTED';
        badgePageBridge.className = 'subsystem-val status-connected';
        bridgeWarningBanner.style.display = 'none';
      } else if (bridgeStatus === 'FAILED') {
        badgePageBridge.textContent = '● FAILED';
        badgePageBridge.className = 'subsystem-val status-failed';
        bridgeWarningBanner.style.display = 'block';
      } else {
        badgePageBridge.textContent = '● CONNECTING';
        badgePageBridge.className = 'subsystem-val status-info';
        bridgeWarningBanner.style.display = 'none';
      }

      badgeNetwork.textContent = '● CAPTURING';
      badgeNetwork.className = 'subsystem-val status-capturing';

      badgeConsole.textContent = '● CAPTURING';
      badgeConsole.className = 'subsystem-val status-capturing';

      badgeAdapter.textContent = `● ${(session.adapterId || '3dz').toUpperCase()}`;
      badgeAdapter.className = 'subsystem-val status-info';

      badgeScreenshot.textContent = '● READY';
      badgeScreenshot.className = 'subsystem-val status-ready';

      pageCount.textContent = session.pageSegmentsCount || session.navigationCount + 1 || 1;
      eventCount.textContent = session.eventCount || 0;
      errCount.textContent = session.errorCount || 0;
      shotCount.textContent = session.screenshotsCount || 0;
      shotCountDetail.textContent = session.screenshotsCount || 0;
      maskedCountDetail.textContent = session.sensitiveMaskedCount || 0;

      btnToggleRecord.textContent = 'Stop Recording';
      btnToggleRecord.className = 'btn btn-stop';
      recordExplanation.style.display = 'none';

      activeActionButtons.style.display = 'flex';
      btnExport.style.display = 'none';
      recoveryBanner.style.display = 'none';

      startDurationTimer(session.startedAt);
    } else {
      stopDurationTimer();

      badgeSession.textContent = '● IDLE';
      badgeSession.className = 'subsystem-val status-idle';

      badgePageBridge.textContent = '● STANDBY';
      badgePageBridge.className = 'subsystem-val status-standby';
      bridgeWarningBanner.style.display = 'none';

      badgeNetwork.textContent = '● STANDBY';
      badgeNetwork.className = 'subsystem-val status-standby';

      badgeConsole.textContent = '● STANDBY';
      badgeConsole.className = 'subsystem-val status-standby';

      badgeScreenshot.textContent = '● READY';
      badgeScreenshot.className = 'subsystem-val status-ready';

      if (session && session.sessionId) {
        sessionStatusBadge.textContent = 'STOPPED';
        sessionStatusBadge.className = 'badge-status badge-idle';
        sessionId.textContent = session.sessionId;
        sessionDuration.textContent = formatDuration(session.durationMs);
        btnExport.style.display = 'block';
        shotCountDetail.textContent = session.screenshotsCount || 0;
        maskedCountDetail.textContent = session.sensitiveMaskedCount || 0;
      } else {
        sessionStatusBadge.textContent = 'IDLE';
        sessionStatusBadge.className = 'badge-status badge-idle';
        sessionId.textContent = '--';
        sessionDuration.textContent = '00:00';
        btnExport.style.display = 'none';
      }

      btnToggleRecord.textContent = 'Start Recording';
      btnToggleRecord.className = 'btn btn-primary';
      recordExplanation.style.display = 'block';
      activeActionButtons.style.display = 'none';
    }
  }

  function fetchState() {
    chrome.runtime.sendMessage({ action: 'GET_SESSION_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        updateUI(response.hasActiveSession ? response : null);
      }
    });

    chrome.runtime.sendMessage({ action: 'GET_RECENT_SESSIONS' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        renderRecentSessions(response.sessions);
      }
    });
  }

  function renderRecentSessions(sessions) {
    if (!sessions || sessions.length === 0) {
      recentSessionsList.innerHTML = '<div class="empty-state">No recent sessions recorded yet.</div>';
      return;
    }

    recentSessionsList.innerHTML = sessions.map(s => `
      <div class="recent-item">
        <div class="recent-info">
          <span class="recent-id">${s.sessionId}</span>
          <span class="recent-meta">${s.durationFormatted || '00:00'} • ${s.pagesCount || 1} pages • ${s.eventCount || 0} events</span>
        </div>
        <div class="recent-actions">
          <button class="btn-xs btn-primary btn-export-recent" data-session-id="${s.sessionId}">Export</button>
          <button class="btn-xs btn-secondary btn-delete-recent" data-session-id="${s.sessionId}">Delete</button>
        </div>
      </div>
    `).join('');

    recentSessionsList.querySelectorAll('.btn-export-recent').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-session-id');
        exportSession(id);
      });
    });

    recentSessionsList.querySelectorAll('.btn-delete-recent').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-session-id');
        deleteSession(id);
      });
    });
  }

  // --- Actions ---
  btnToggleRecord.addEventListener('click', async () => {
    if (activeSessionData && activeSessionData.recording) {
      btnToggleRecord.disabled = true;
      btnToggleRecord.textContent = 'Stopping...';
      chrome.runtime.sendMessage({ action: 'STOP_RECORDING' }, (res) => {
        btnToggleRecord.disabled = false;
        fetchState();
      });
    } else {
      btnToggleRecord.disabled = true;
      btnToggleRecord.textContent = 'Starting...';
      const allTabs = await chrome.tabs.query({});
      let targetTab = allTabs.find(t => t.active && !t.url?.startsWith('chrome-extension://') && !t.url?.startsWith('edge://') && !t.url?.startsWith('chrome://'));
      if (!targetTab) {
        targetTab = allTabs.find(t => !t.url?.startsWith('chrome-extension://') && !t.url?.startsWith('edge://') && !t.url?.startsWith('chrome://'));
      }
      chrome.runtime.sendMessage({
        action: 'START_RECORDING',
        tabId: targetTab?.id,
        url: targetTab?.url,
        title: targetTab?.title
      }, (res) => {
        btnToggleRecord.disabled = false;
        fetchState();
      });
    }
  });

  btnMarkProblem.addEventListener('click', async () => {
    btnMarkProblem.textContent = 'Capturing Problem & Screenshot...';
    btnMarkProblem.disabled = true;

    let directDataUrl = null;
    try {
      directDataUrl = await new Promise(r => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, res => {
          if (chrome.runtime.lastError) r(null); else r(res);
        });
      });
    } catch(e) {}
    directDataUrl = directDataUrl || window.__TEST_SHOT_URL__;

    chrome.runtime.sendMessage({
      action: 'MARK_PROBLEM',
      annotation: 'User Problem Marker from Popup',
      dataUrl: directDataUrl
    }, (res) => {
      btnMarkProblem.textContent = 'Problem & Screenshot Captured!';
      setTimeout(() => {
        btnMarkProblem.textContent = 'Mark Problem Here';
        btnMarkProblem.disabled = false;
        fetchState();
      }, 1200);
    });
  });

  btnCaptureScreenshot.addEventListener('click', async () => {
    btnCaptureScreenshot.textContent = 'Capturing...';
    btnCaptureScreenshot.disabled = true;

    let directDataUrl = null;
    try {
      directDataUrl = await new Promise(r => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, res => {
          if (chrome.runtime.lastError) r(null); else r(res);
        });
      });
    } catch(e) {}
    directDataUrl = directDataUrl || window.__TEST_SHOT_URL__;

    chrome.runtime.sendMessage({ action: 'CAPTURE_SCREENSHOT', dataUrl: directDataUrl }, () => {
      btnCaptureScreenshot.textContent = 'Captured!';
      setTimeout(() => {
        btnCaptureScreenshot.textContent = 'Capture Screenshot';
        btnCaptureScreenshot.disabled = false;
        fetchState();
      }, 1000);
    });
  });

  btnCaptureSnapshot.addEventListener('click', async () => {
    btnCaptureSnapshot.textContent = 'Capturing Snapshot...';
    btnCaptureSnapshot.disabled = true;

    let directDataUrl = null;
    try {
      directDataUrl = await new Promise(r => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, res => {
          if (chrome.runtime.lastError) r(null); else r(res);
        });
      });
    } catch(e) {}
    directDataUrl = directDataUrl || window.__TEST_SHOT_URL__;

    chrome.runtime.sendMessage({ action: 'CAPTURE_SNAPSHOT', dataUrl: directDataUrl }, () => {
      btnCaptureSnapshot.textContent = 'Snapshot Saved!';
      setTimeout(() => {
        btnCaptureSnapshot.textContent = 'Capture Snapshot';
        btnCaptureSnapshot.disabled = false;
        fetchState();
      }, 1000);
    });
  });

  function exportSession(sessId) {
    const id = sessId || activeSessionData?.sessionId;
    if (!id) return;

    btnExport.textContent = 'Building ZIP Bundle...';
    btnExport.disabled = true;

    chrome.runtime.sendMessage({
      action: 'EXPORT_SESSION',
      sessionId: id,
      includeScreenshots: chkIncludeScreenshots.checked
    }, (res) => {
      btnExport.textContent = 'Export Diagnostic ZIP';
      btnExport.disabled = false;

      if (res && res.success) {
        if (res.zipBase64) {
          const byteCharacters = atob(res.zipBase64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.zipFileName || `RI-${id}.zip`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // Fallback JSON download
          const blob = new Blob([JSON.stringify(res.diagnostic, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `RI-${id}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        alert('Failed to export session: ' + (res?.error || 'Unknown error'));
      }
    });
  }

  btnExport.addEventListener('click', () => exportSession());

  function deleteSession(sessId) {
    if (!confirm(`Delete session ${sessId}?`)) return;
    chrome.runtime.sendMessage({ action: 'DELETE_SESSION', sessionId: sessId }, () => {
      fetchState();
    });
  }

  if (linkOptions) {
    linkOptions.addEventListener('click', (e) => {
      e.preventDefault();
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });
  }

  if (linkInspector) {
    linkInspector.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('inspector.html') });
    });
  }

  window.fetchState = fetchState;
  fetchState();
  setInterval(fetchState, 3000);
});
