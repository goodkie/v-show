/**
 * Runtime Inspector V1.1 — Popup Controller
 * Connects directly to Service Worker Canonical Session Store
 */

document.addEventListener('DOMContentLoaded', () => {
  const sessionStatusBadge = document.getElementById('sessionStatusBadge');
  const sessionId = document.getElementById('sessionId');
  const sessionDuration = document.getElementById('sessionDuration');
  const adapterName = document.getElementById('adapterName');

  const pageCount = document.getElementById('pageCount');
  const eventCount = document.getElementById('eventCount');
  const errCount = document.getElementById('errCount');
  const netCount = document.getElementById('netCount');

  const btnToggleRecord = document.getElementById('btnToggleRecord');
  const recordExplanation = document.getElementById('recordExplanation');
  const btnMarkProblem = document.getElementById('btnMarkProblem');
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
      adapterName.textContent = (session.adapterId || '3dz').toUpperCase();

      pageCount.textContent = session.pageSegmentsCount || session.navigationCount + 1 || 1;
      eventCount.textContent = session.eventCount || 0;
      errCount.textContent = session.errorCount || 0;
      netCount.textContent = session.networkCount || 0;

      btnToggleRecord.textContent = 'Stop Recording';
      btnToggleRecord.className = 'btn btn-stop';
      recordExplanation.style.display = 'none';

      btnMarkProblem.style.display = 'block';
      btnExport.style.display = 'none';
      recoveryBanner.style.display = 'none';

      startDurationTimer(session.startedAt);
    } else {
      stopDurationTimer();

      if (session && session.sessionId) {
        sessionStatusBadge.textContent = 'STOPPED';
        sessionStatusBadge.className = 'badge-status badge-idle';
        sessionId.textContent = session.sessionId;
        sessionDuration.textContent = formatDuration(session.durationMs);
        btnExport.style.display = 'block';
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
      btnMarkProblem.style.display = 'none';
    }

    loadRecentSessions();
  }

  function fetchSessionState() {
    chrome.runtime.sendMessage({ action: 'GET_SESSION_STATE' }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[Popup] Error fetching session state:', chrome.runtime.lastError.message);
        return;
      }
      if (res && res.hasActiveSession) {
        updateUI(res);
      } else {
        updateUI(null);
      }
    });
  }

  function loadRecentSessions() {
    chrome.runtime.sendMessage({ action: 'GET_RECENT_SESSIONS' }, (res) => {
      if (!res || !res.sessions || res.sessions.length === 0) {
        recentSessionsList.innerHTML = '<div class="empty-state">No recent sessions recorded yet.</div>';
        return;
      }

      recentSessionsList.innerHTML = '';
      res.sessions.slice(0, 5).forEach(sess => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerHTML = `
          <div class="recent-info">
            <div class="recent-id">${sess.sessionId}</div>
            <div class="recent-meta">${sess.durationFormatted} • ${sess.pagesCount} pages • ${sess.eventCount} events</div>
          </div>
          <div class="recent-actions">
            <button class="btn-xs btn-primary btn-export-recent" data-id="${sess.sessionId}">Export</button>
            <button class="btn-xs btn-secondary btn-delete-recent" data-id="${sess.sessionId}">Delete</button>
          </div>
        `;
        recentSessionsList.appendChild(item);
      });

      // Bind export and delete buttons
      document.querySelectorAll('.btn-export-recent').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.getAttribute('data-id');
          exportSession(id);
        });
      });

      document.querySelectorAll('.btn-delete-recent').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.getAttribute('data-id');
          deleteSession(id);
        });
      });
    });
  }

  function exportSession(sessId) {
    chrome.runtime.sendMessage({ action: 'EXPORT_SESSION', sessionId: sessId }, (res) => {
      if (!res || !res.success) {
        alert('Export failed: ' + (res?.error || 'Unknown error'));
        return;
      }

      // Download diagnostic.json
      const diagBlob = new Blob([JSON.stringify(res.diagnostic, null, 2)], { type: 'application/json' });
      const diagUrl = URL.createObjectURL(diagBlob);
      const a1 = document.createElement('a');
      a1.href = diagUrl;
      a1.download = `${sessId}_diagnostic.json`;
      a1.click();

      // Download summary.txt
      const sumBlob = new Blob([res.summaryText], { type: 'text/plain' });
      const sumUrl = URL.createObjectURL(sumBlob);
      const a2 = document.createElement('a');
      a2.href = sumUrl;
      a2.download = `${sessId}_summary.txt`;
      a2.click();
    });
  }

  function deleteSession(sessId) {
    if (!confirm(`Delete session ${sessId}?`)) return;
    chrome.runtime.sendMessage({ action: 'DELETE_SESSION', sessionId: sessId }, () => {
      fetchSessionState();
    });
  }

  // Toggle Recording Handler
  btnToggleRecord.addEventListener('click', () => {
    const isRecording = Boolean(activeSessionData && activeSessionData.recording);

    if (!isRecording) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        chrome.runtime.sendMessage({
          action: 'START_RECORDING',
          tabId: tab?.id,
          url: tab?.url,
          title: tab?.title
        }, () => {
          fetchSessionState();
        });
      });
    } else {
      chrome.runtime.sendMessage({ action: 'STOP_RECORDING' }, () => {
        fetchSessionState();
      });
    }
  });

  // Mark Problem Handler
  btnMarkProblem.addEventListener('click', () => {
    const note = prompt('Describe what went wrong:', 'UI / 3D Render defect observed');
    if (note !== null) {
      chrome.runtime.sendMessage({ action: 'MARK_PROBLEM', annotation: note }, () => {
        alert('Problem marker recorded in active diagnostic timeline!');
        fetchSessionState();
      });
    }
  });

  // Export Active Session Handler
  btnExport.addEventListener('click', () => {
    if (activeSessionData && activeSessionData.sessionId) {
      exportSession(activeSessionData.sessionId);
    }
  });

  // Links
  if (linkOptions) {
    linkOptions.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  if (linkInspector) {
    linkInspector.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('inspector.html') });
    });
  }

  // Initial Fetch
  fetchSessionState();
});
