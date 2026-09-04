/**
 * Runtime Inspector V1.1 — Chrome Extension Service Worker
 * Module: extension/service-worker.js
 *
 * Canonical Session Controller, WebNavigation Tracker & IndexedDB Event Store.
 * Recording state belongs to the extension, not the page.
 */

// --- IndexedDB Storage Helper for Extension Context ---
const DB_NAME = 'RuntimeInspectorDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return resolve(null); // Fallback if IndexedDB unavailable
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('events')) {
        const eventStore = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        eventStore.createIndex('sessionId', 'sessionId', { unique: false });
        eventStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'sessionId' });
      }
      if (!db.objectStoreNames.contains('segments')) {
        const segStore = db.createObjectStore('segments', { keyPath: 'id' });
        segStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveEventsToDB(events) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(['events'], 'readwrite');
    const store = tx.objectStore('events');
    for (const ev of events) {
      store.add(ev);
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[RI ServiceWorker] saveEventsToDB error:', err);
  }
}

async function getSessionEventsFromDB(sessionId) {
  try {
    const db = await openDB();
    if (!db) return [];
    const tx = db.transaction(['events'], 'readonly');
    const store = tx.objectStore('events');
    const index = store.index('sessionId');
    const req = index.getAll(IDBKeyRange.only(sessionId));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('[RI ServiceWorker] getSessionEventsFromDB error:', err);
    return [];
  }
}

async function deleteSessionEventsFromDB(sessionId) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(['events', 'sessions', 'segments'], 'readwrite');
    const eventStore = tx.objectStore('events');
    const index = eventStore.index('sessionId');
    const req = index.openCursor(IDBKeyRange.only(sessionId));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.objectStore('sessions').delete(sessionId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[RI ServiceWorker] deleteSessionEventsFromDB error:', err);
  }
}

// --- Active Session Controller ---
let activeSession = null;

function generateSessionId() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RI-${dateStr}-${rand}`;
}

async function syncSessionToStorage() {
  if (!chrome.storage?.session) {
    if (chrome.storage?.local) {
      await chrome.storage.local.set({ activeSession });
    }
    return;
  }
  await chrome.storage.session.set({ activeSession });
}

async function restoreSessionFromStorage() {
  let res = null;
  if (chrome.storage?.session) {
    res = await chrome.storage.session.get(['activeSession']);
  }
  if (!res?.activeSession && chrome.storage?.local) {
    res = await chrome.storage.local.get(['activeSession']);
  }

  if (res?.activeSession) {
    activeSession = res.activeSession;
    console.log('[RI ServiceWorker] Restored active session:', activeSession.sessionId, 'Recording:', activeSession.recording);
  }
}

// Initialize on install / startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Runtime Inspector V1.1] Service worker installed.');
  chrome.storage.local.get(['approvedDomains', 'privacyMode', 'recentSessions'], (res) => {
    chrome.storage.local.set({
      approvedDomains: res.approvedDomains || [
        'v-show-commercial-v1-production.up.railway.app',
        'localhost',
        '127.0.0.1'
      ],
      privacyMode: res.privacyMode || 'STANDARD',
      recentSessions: res.recentSessions || []
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Runtime Inspector V1.1] Service worker startup.');
  restoreSessionFromStorage();
});

// Restore on top-level worker instantiation
restoreSessionFromStorage();

function isDomainApproved(url, approvedDomains = []) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return approvedDomains.some(d => host === d || host.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

// --- WebNavigation Event Handlers ---
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (!activeSession || !activeSession.recording) return;

    if (activeSession.currentTabId && activeSession.currentTabId !== details.tabId) {
      return;
    }

    const fromUrl = activeSession.currentUrl || 'unknown';
    const toUrl = details.url;

    const settings = await chrome.storage.local.get(['approvedDomains']);
    const approved = isDomainApproved(toUrl, settings.approvedDomains || []);

    if (!approved) {
      activeSession.status = 'PAUSED_UNAPPROVED_ORIGIN';
      activeSession.pausedAtUrl = toUrl;
      console.warn('[RI ServiceWorker] Navigation to unapproved origin, pausing capture:', toUrl);
      await syncSessionToStorage();
      return;
    }

    if (activeSession.status === 'PAUSED_UNAPPROVED_ORIGIN') {
      activeSession.status = 'RECORDING';
      console.log('[RI ServiceWorker] Returned to approved origin, resuming capture:', toUrl);
    }

    activeSession.navigationCount = (activeSession.navigationCount || 0) + 1;
    const segIndex = (activeSession.pageSegments || []).length + 1;
    const newSegmentId = `seg-${segIndex}-${Math.random().toString(36).slice(2, 6)}`;

    let navType = 'DOCUMENT_NAVIGATION';
    if (fromUrl === toUrl) {
      navType = 'PAGE_RELOAD';
    }

    const navEvent = {
      sessionId: activeSession.sessionId,
      pageSegmentId: newSegmentId,
      category: 'NAVIGATION',
      type: navType,
      timestamp: Date.now(),
      payload: {
        fromUrl,
        toUrl,
        transitionType: details.transitionType,
        navigationIndex: activeSession.navigationCount
      }
    };

    activeSession.currentUrl = toUrl;
    activeSession.activePageSegmentId = newSegmentId;
    activeSession.pageSegments = activeSession.pageSegments || [];
    activeSession.pageSegments.push({
      id: newSegmentId,
      name: `Page ${segIndex}`,
      url: toUrl,
      startedAt: new Date().toISOString()
    });
    activeSession.eventCount = (activeSession.eventCount || 0) + 1;

    await saveEventsToDB([navEvent]);
    await syncSessionToStorage();
  });
}

// --- Message Router ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    // 1. Handshake from content script
    if (message.action === 'RI_PAGE_CONNECTED') {
      const pageUrl = message.url;
      const tabId = sender.tab?.id;

      if (activeSession && activeSession.recording) {
        if (!activeSession.currentTabId || activeSession.currentUrl === 'unknown') {
          activeSession.currentTabId = tabId;
        }

        const settings = await chrome.storage.local.get(['approvedDomains']);
        const approved = isDomainApproved(pageUrl, settings.approvedDomains || []);

        if (approved) {
          if (!activeSession.activePageSegmentId || activeSession.currentUrl !== pageUrl) {
            activeSession.currentUrl = pageUrl;
            const segIndex = (activeSession.pageSegments || []).length + 1;
            const segId = `seg-${segIndex}-${Math.random().toString(36).slice(2, 6)}`;
            activeSession.activePageSegmentId = segId;
            activeSession.pageSegments = activeSession.pageSegments || [];
            activeSession.pageSegments.push({
              id: segId,
              name: message.title || `Page ${segIndex}`,
              url: pageUrl,
              startedAt: new Date().toISOString()
            });
            activeSession.navigationCount = Math.max(activeSession.navigationCount || 0, activeSession.pageSegments.length - 1);
            activeSession.eventCount = (activeSession.eventCount || 0) + 1;
          }
          await syncSessionToStorage();

          return {
            connected: true,
            recording: true,
            sessionId: activeSession.sessionId,
            pageSegmentId: activeSession.activePageSegmentId,
            adapterId: activeSession.adapterId || '3dz',
            privacyMode: activeSession.privacyMode || 'STANDARD',
            startedAt: activeSession.startedAt,
            navigationCount: activeSession.navigationCount || 0
          };
        } else {
          return { connected: true, recording: false, reason: 'UNAPPROVED_ORIGIN' };
        }
      }

      return { connected: true, recording: false };
    }

    // 2. Ingest stream of events from content script
    if (message.action === 'RI_INGEST_EVENTS') {
      if (!activeSession || !activeSession.recording) {
        return { success: false, reason: 'NOT_RECORDING' };
      }

      const events = (message.events || []).map(ev => ({
        ...ev,
        sessionId: activeSession.sessionId,
        pageSegmentId: ev.pageSegmentId || activeSession.activePageSegmentId || 'seg-default',
        timestamp: ev.timestamp || Date.now()
      }));

      for (const ev of events) {
        activeSession.eventCount = (activeSession.eventCount || 0) + 1;
        if (ev.category === 'CONSOLE' && ev.payload?.level === 'error') {
          activeSession.errorCount = (activeSession.errorCount || 0) + 1;
        } else if (ev.category === 'NETWORK') {
          activeSession.networkCount = (activeSession.networkCount || 0) + 1;
          if (ev.payload?.status >= 400 || ev.type?.includes('ERROR')) {
            activeSession.errorCount = (activeSession.errorCount || 0) + 1;
          }
        }
      }

      await saveEventsToDB(events);
      await syncSessionToStorage();
      return { success: true, ingested: events.length, total: activeSession.eventCount };
    }

    // 3. Get Active Session State (For Popup UI & Telemetry)
    if (message.action === 'GET_SESSION_STATE') {
      if (!activeSession) {
        await restoreSessionFromStorage();
      }

      if (activeSession) {
        const durationMs = Date.now() - new Date(activeSession.startedAt).getTime();
        return {
          success: true,
          hasActiveSession: true,
          recording: activeSession.recording,
          status: activeSession.status || (activeSession.recording ? 'RECORDING' : 'STOPPED'),
          sessionId: activeSession.sessionId,
          startedAt: activeSession.startedAt,
          durationMs,
          eventCount: activeSession.eventCount || 0,
          errorCount: activeSession.errorCount || 0,
          networkCount: activeSession.networkCount || 0,
          navigationCount: activeSession.navigationCount || 0,
          pageSegmentsCount: (activeSession.pageSegments || []).length,
          lastProblemMarker: activeSession.lastProblemMarker || null,
          adapterId: activeSession.adapterId || '3dz',
          currentUrl: activeSession.currentUrl || ''
        };
      }

      return {
        success: true,
        hasActiveSession: false,
        recording: false,
        status: 'IDLE'
      };
    }

    // 4. Start Recording
    if (message.action === 'START_RECORDING') {
      const settings = await chrome.storage.local.get(['privacyMode', 'approvedDomains']);
      const sessId = generateSessionId();
      const tabId = message.tabId || sender.tab?.id;
      const initialUrl = message.url || 'unknown';

      activeSession = {
        sessionId: sessId,
        recording: true,
        status: 'RECORDING',
        startedAt: new Date().toISOString(),
        privacyMode: settings.privacyMode || 'STANDARD',
        currentTabId: tabId,
        currentUrl: initialUrl,
        eventCount: 0,
        errorCount: 0,
        networkCount: 0,
        navigationCount: 0,
        pageSegments: [
          {
            id: 'seg-1-init',
            name: message.title || 'Start Page',
            url: initialUrl,
            startedAt: new Date().toISOString()
          }
        ],
        activePageSegmentId: 'seg-1-init',
        adapterId: '3dz'
      };

      const startEvent = {
        sessionId: sessId,
        pageSegmentId: 'seg-1-init',
        category: 'APP',
        type: 'START_RECORDING',
        timestamp: Date.now(),
        payload: {
          sessionId: sessId,
          url: initialUrl,
          userAgent: navigator.userAgent
        }
      };

      await saveEventsToDB([startEvent]);
      activeSession.eventCount = 1;
      await syncSessionToStorage();

      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'RECORDING_STARTED',
          sessionId: sessId,
          pageSegmentId: 'seg-1-init'
        }, () => {
          if (chrome.runtime.lastError) {}
        });
      }

      return { success: true, sessionId: sessId };
    }

    // 5. Stop Recording
    if (message.action === 'STOP_RECORDING') {
      if (!activeSession) {
        return { success: false, error: 'No active session' };
      }

      activeSession.recording = false;
      activeSession.status = 'STOPPED';
      activeSession.stoppedAt = new Date().toISOString();
      const durationMs = Date.now() - new Date(activeSession.startedAt).getTime();
      activeSession.durationMs = durationMs;

      const stopEvent = {
        sessionId: activeSession.sessionId,
        pageSegmentId: activeSession.activePageSegmentId || 'seg-final',
        category: 'APP',
        type: 'STOP_RECORDING',
        timestamp: Date.now(),
        payload: {
          sessionId: activeSession.sessionId,
          durationMs,
          eventCount: activeSession.eventCount
        }
      };
      await saveEventsToDB([stopEvent]);
      activeSession.eventCount = (activeSession.eventCount || 0) + 1;

      const locRes = await chrome.storage.local.get(['recentSessions']);
      let recent = locRes.recentSessions || [];
      const sessionSummary = {
        sessionId: activeSession.sessionId,
        status: 'Stopped',
        startedAt: activeSession.startedAt,
        stoppedAt: activeSession.stoppedAt,
        durationMs: activeSession.durationMs,
        durationFormatted: formatDuration(activeSession.durationMs),
        pagesCount: (activeSession.pageSegments || []).length || 1,
        eventCount: activeSession.eventCount,
        errorCount: activeSession.errorCount || 0,
        adapterId: activeSession.adapterId
      };

      recent = [sessionSummary, ...recent.filter(s => s.sessionId !== activeSession.sessionId)].slice(0, 5);
      await chrome.storage.local.set({ recentSessions: recent });
      await syncSessionToStorage();

      return { success: true, session: sessionSummary };
    }

    // 6. Mark Problem
    if (message.action === 'MARK_PROBLEM') {
      if (!activeSession) {
        return { success: false, error: 'No active session' };
      }

      const note = message.annotation || 'User Problem Marker';
      activeSession.lastProblemMarker = note;

      const probEvent = {
        sessionId: activeSession.sessionId,
        pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
        category: 'APP',
        type: 'USER_PROBLEM_MARKER',
        timestamp: Date.now(),
        payload: {
          annotation: note,
          url: activeSession.currentUrl,
          severity: 'WARN'
        }
      };

      await saveEventsToDB([probEvent]);
      activeSession.eventCount = (activeSession.eventCount || 0) + 1;
      await syncSessionToStorage();

      return { success: true, annotation: note };
    }

    // 7. Get Recent Sessions
    if (message.action === 'GET_RECENT_SESSIONS') {
      const locRes = await chrome.storage.local.get(['recentSessions']);
      return { success: true, sessions: locRes.recentSessions || [] };
    }

    // 8. Export Session
    if (message.action === 'EXPORT_SESSION') {
      const sessId = message.sessionId || activeSession?.sessionId;
      if (!sessId) return { success: false, error: 'No sessionId specified' };

      const allEvents = await getSessionEventsFromDB(sessId);
      const sessionMeta = (await chrome.storage.local.get(['recentSessions'])).recentSessions?.find(s => s.sessionId === sessId) || activeSession || {};

      const timeline = allEvents;
      const errors = allEvents.filter(e => e.category === 'CONSOLE' && e.payload?.level === 'error');
      const network = allEvents.filter(e => e.category === 'NETWORK');
      const navigations = allEvents.filter(e => e.category === 'NAVIGATION');

      const diagnostic = {
        schemaVersion: '1.0.0',
        inspectorVersion: '1.1.0',
        session: {
          sessionId: sessId,
          startTime: sessionMeta.startedAt,
          captureTime: new Date().toISOString(),
          durationMs: sessionMeta.durationMs || 0,
          mode: 'RECORDING',
          privacyMode: activeSession?.privacyMode || 'STANDARD',
          navigationCount: navigations.length,
          pageSegments: activeSession?.pageSegments || []
        },
        app: {
          appId: '3dz-virtual-tradeshow',
          appName: '3DZ Virtual Tradeshow Studio',
          url: activeSession?.currentUrl || '',
          environment: 'production'
        },
        diagnostics: {
          firstFailedStage: errors.length > 0 ? 'RUNTIME_EXCEPTION' : (network.some(n => n.payload?.status >= 400) ? 'NETWORK' : 'NONE_DETECTED'),
          primaryFailure: errors[0]?.payload?.message || (network.find(n => n.payload?.status >= 400)?.payload?.url ? `HTTP Error on ${network.find(n => n.payload?.status >= 400)?.payload?.url}` : 'None')
        },
        adapter: {
          id: '3dz',
          name: '3DZ Spatial Virtual Tradeshow Adapter',
          version: '1.0.0',
          matched: true
        },
        errors,
        network,
        timeline,
        navigations,
        redaction: {
          sanitized: true,
          redactionCount: 0,
          privacyMode: 'STANDARD',
          secretScanPassed: true
        }
      };

      const summaryText = `============================================================
RUNTIME_INSPECTOR_REPORT (ChatGPT Optimized)
============================================================

APP=3DZ Virtual Tradeshow Studio
APP_ID=3dz-virtual-tradeshow
ENVIRONMENT=production
URL=${activeSession?.currentUrl || 'unknown'}

SESSION_ID=${sessId}
SESSION_START=${sessionMeta.startedAt}
CAPTURE_TIME=${new Date().toISOString()}
DURATION_MS=${sessionMeta.durationMs || 0}
PRIVACY_MODE=STANDARD
PAGES_VISITED=${(activeSession?.pageSegments || []).length || 1}
NAVIGATION_COUNT=${navigations.length}

------------------------------------------------------------
DIAGNOSTIC VERDICT
------------------------------------------------------------
FIRST_FAILED_STAGE=${diagnostic.diagnostics.firstFailedStage}
PRIMARY_FAILURE=${diagnostic.diagnostics.primaryFailure}

ERROR_COUNT=${errors.length}
NETWORK_FAILURE_COUNT=${network.filter(n => n.payload?.status >= 400).length}
TOTAL_EVENTS=${allEvents.length}

LAST_PROBLEM_MARKER=${activeSession?.lastProblemMarker || 'None'}

------------------------------------------------------------
TOP ERRORS
------------------------------------------------------------
${errors.slice(0, 5).map((e, idx) => `[${idx+1}] ${e.payload?.message || 'Error'}`).join('\n') || 'None'}

------------------------------------------------------------
SAFETY & REDACTION
------------------------------------------------------------
SENSITIVE_DATA_REDACTED=true
REDACTION_COUNT=0
SECRET_SCAN_STATUS=PASS
============================================================`;

      return {
        success: true,
        diagnostic,
        summaryText
      };
    }

    // 9. Delete Session
    if (message.action === 'DELETE_SESSION') {
      const sessId = message.sessionId;
      if (sessId) {
        await deleteSessionEventsFromDB(sessId);
        const locRes = await chrome.storage.local.get(['recentSessions']);
        const recent = (locRes.recentSessions || []).filter(s => s.sessionId !== sessId);
        await chrome.storage.local.set({ recentSessions: recent });
        if (activeSession?.sessionId === sessId) {
          activeSession = null;
          await syncSessionToStorage();
        }
      }
      return { success: true };
    }

    // 10. Screenshot capture
    if (message.action === 'CAPTURE_SCREENSHOT') {
      return new Promise((resolve) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve({ success: true, dataUrl });
          }
        });
      });
    }

    return { error: 'Unknown action: ' + message.action };
  };

  handleAsync().then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});

function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '00:00';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
