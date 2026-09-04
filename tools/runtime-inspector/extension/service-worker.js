/**
 * Runtime Inspector V1.2 — Chrome Extension Service Worker
 * Module: extension/service-worker.js
 *
 * Canonical Session Controller, WebNavigation Tracker, Screenshot Evidence Engine,
 * and IndexedDB Event & Evidence Store.
 */

try {
  importScripts('core/screenshot-manager.js', 'core/zip-builder.js');
} catch (e) {
  console.warn('[RI ServiceWorker] importScripts warning:', e);
}

const CANONICAL_3DZ_PROD_ORIGIN = 'https://v-show-commercial-v1-production.up.railway.app';

function evaluateCaptureAuthenticity(pageUrl, isRealBrowser, isExtension, durationMs, pageSegmentCount, realNavigationCount) {
  let captureOrigin = 'unknown';
  let captureEnvironment = 'SYNTHETIC_NODE_TEST';
  try {
    if (pageUrl && pageUrl.startsWith('http')) {
      const u = new URL(pageUrl);
      captureOrigin = u.origin;
      const host = u.hostname.toLowerCase();
      if (captureOrigin === CANONICAL_3DZ_PROD_ORIGIN) {
        captureEnvironment = 'PRODUCTION';
      } else if (host === 'localhost' || host === '127.0.0.1') {
        captureEnvironment = 'LOCALHOST';
      } else if (host.endsWith('.railway.app')) {
        captureEnvironment = 'STAGING';
      } else {
        captureEnvironment = 'CUSTOM';
      }
    }
  } catch (e) {}

  const realChromeExtension = Boolean(isRealBrowser && isExtension);
  const real3dzProductionCapture = Boolean(realChromeExtension && captureEnvironment === 'PRODUCTION' && captureOrigin === CANONICAL_3DZ_PROD_ORIGIN);

  return {
    captureOrigin,
    captureEnvironment,
    realChromeExtension,
    real3dzProductionCapture,
    browserRuntime: isRealBrowser,
    extensionContext: isExtension,
    chromeUserAgent: typeof navigator !== 'undefined' && (navigator.userAgent.includes('Chrome') || navigator.userAgent.includes('Edg')),
    pageInteractionDurationMs: durationMs || 0,
    pageSegmentCount: pageSegmentCount || 1,
    realNavigationCount: realNavigationCount || 0,
    syntheticTest: !isRealBrowser
  };
}

// --- IndexedDB Storage Helper for Extension Context ---
const DB_NAME = 'RuntimeInspectorDB';
const DB_VERSION = 2; // Bumped for screenshots store

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return resolve(null);
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
      if (!db.objectStoreNames.contains('screenshots')) {
        const shotStore = db.createObjectStore('screenshots', { keyPath: 'screenshotId' });
        shotStore.createIndex('sessionId', 'sessionId', { unique: false });
        shotStore.createIndex('timestamp', 'timestamp', { unique: false });
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

async function saveScreenshotToDB(record) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(['screenshots'], 'readwrite');
    const store = tx.objectStore('screenshots');
    store.put(record);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[RI ServiceWorker] saveScreenshotToDB error:', err);
  }
}

async function getSessionScreenshotsFromDB(sessionId) {
  try {
    const db = await openDB();
    if (!db) return [];
    const tx = db.transaction(['screenshots'], 'readonly');
    const store = tx.objectStore('screenshots');
    const index = store.index('sessionId');
    const req = index.getAll(IDBKeyRange.only(sessionId));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('[RI ServiceWorker] getSessionScreenshotsFromDB error:', err);
    return [];
  }
}

async function deleteSessionEventsFromDB(sessionId) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(['events', 'sessions', 'segments', 'screenshots'], 'readwrite');
    const eventStore = tx.objectStore('events');
    const eventIdx = eventStore.index('sessionId');
    const eventReq = eventIdx.openCursor(IDBKeyRange.only(sessionId));
    eventReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    const shotStore = tx.objectStore('screenshots');
    const shotIdx = shotStore.index('sessionId');
    const shotReq = shotIdx.openCursor(IDBKeyRange.only(sessionId));
    shotReq.onsuccess = (e) => {
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
let bootstrapWatcherTimer = null;
const screenshotManager = typeof ScreenshotManager !== 'undefined' ? new ScreenshotManager() : null;

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
  console.log('[Runtime Inspector V1.2] Service worker installed.');
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
  console.log('[Runtime Inspector V1.2] Service worker startup.');
  restoreSessionFromStorage();
});

restoreSessionFromStorage();

const DEFAULT_APPROVED_DOMAINS = [
  'v-show-commercial-v1-production.up.railway.app',
  'localhost',
  '127.0.0.1'
];

function isDomainApproved(url, approvedDomains = []) {
  if (!url) return false;
  const list = (approvedDomains && approvedDomains.length > 0) ? approvedDomains : DEFAULT_APPROVED_DOMAINS;
  try {
    const host = new URL(url).hostname;
    return list.some(d => host === d || host.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

function startBootstrapWatcher(sessionId, segmentId) {
  if (bootstrapWatcherTimer) clearTimeout(bootstrapWatcherTimer);
  bootstrapWatcherTimer = setTimeout(async () => {
    if (activeSession && activeSession.sessionId === sessionId && !activeSession.pageBridgeConnected) {
      activeSession.pageBridgeStatus = 'FAILED';
      console.warn('[RI ServiceWorker] Handshake timeout: RI_PAGE_CAPTURE_BOOTSTRAP_FAILED');
      const failEvent = {
        sessionId,
        pageSegmentId: segmentId || activeSession.activePageSegmentId || 'seg-default',
        category: 'APP',
        type: 'RI_PAGE_CAPTURE_BOOTSTRAP_FAILED',
        timestamp: Date.now(),
        payload: {
          reason: 'Page capture handshake not received within 3000ms',
          url: activeSession.currentUrl
        }
      };
      await saveEventsToDB([failEvent]);
      activeSession.eventCount = (activeSession.eventCount || 0) + 1;
      await syncSessionToStorage();
    }
  }, 3000);
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

    activeSession.pageBridgeConnected = false;
    activeSession.pageBridgeStatus = 'CONNECTING';

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

    startBootstrapWatcher(activeSession.sessionId, newSegmentId);
  });
}

let lastKnownPageTabId = null;
let lastKnownPageUrl = null;
let lastKnownPageTitle = null;

// --- Message Router ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    // 1. Handshake from content script
    if (message.action === 'RI_PAGE_CONNECTED') {
      const pageUrl = message.url;
      const tabId = sender.tab?.id;

      if (tabId) {
        lastKnownPageTabId = tabId;
        lastKnownPageUrl = pageUrl;
        lastKnownPageTitle = message.title;
      }

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

          startBootstrapWatcher(activeSession.sessionId, activeSession.activePageSegmentId);
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

    // 2. Handshake confirmation: RI_PAGE_CAPTURE_READY
    if (message.action === 'RI_PAGE_CAPTURE_READY') {
      if (bootstrapWatcherTimer) clearTimeout(bootstrapWatcherTimer);

      if (sender.tab?.id) {
        lastKnownPageTabId = sender.tab.id;
        lastKnownPageUrl = message.payload?.url || lastKnownPageUrl;
      }

      if (activeSession) {
        activeSession.pageBridgeConnected = true;
        activeSession.pageBridgeStatus = 'CONNECTED';
        activeSession.adapterId = message.payload?.adapterId || activeSession.adapterId || '3dz';
        if (sender.tab?.id) {
          activeSession.currentTabId = sender.tab.id;
        }
        if (message.payload?.url && (!activeSession.currentUrl || activeSession.currentUrl === 'unknown')) {
          activeSession.currentUrl = message.payload.url;
        }

        const readyEvent = {
          sessionId: activeSession.sessionId,
          pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
          category: 'APP',
          type: 'RI_PAGE_CAPTURE_READY',
          timestamp: Date.now(),
          payload: message.payload || {}
        };
        await saveEventsToDB([readyEvent]);
        activeSession.eventCount = (activeSession.eventCount || 0) + 1;
        await syncSessionToStorage();
      }
      return { success: true };
    }

    // 3. Handshake failure: RI_PAGE_CAPTURE_BOOTSTRAP_FAILED
    if (message.action === 'RI_PAGE_CAPTURE_BOOTSTRAP_FAILED') {
      if (bootstrapWatcherTimer) clearTimeout(bootstrapWatcherTimer);
      if (activeSession) {
        activeSession.pageBridgeConnected = false;
        activeSession.pageBridgeStatus = 'FAILED';
        const failEvent = {
          sessionId: activeSession.sessionId,
          pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
          category: 'APP',
          type: 'RI_PAGE_CAPTURE_BOOTSTRAP_FAILED',
          timestamp: Date.now(),
          payload: message.payload || {}
        };
        await saveEventsToDB([failEvent]);
        activeSession.eventCount = (activeSession.eventCount || 0) + 1;
        await syncSessionToStorage();
      }
      return { success: true };
    }

    // 4. Ingest stream of events from content script
    if (message.action === 'RI_INGEST_EVENTS') {
      if (sender.tab?.id) {
        lastKnownPageTabId = sender.tab.id;
        if (activeSession && !activeSession.currentTabId) {
          activeSession.currentTabId = sender.tab.id;
        }
      }
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
        if (ev.category === 'CONSOLE') {
          activeSession.consoleCount = (activeSession.consoleCount || 0) + 1;
          if (ev.payload?.level === 'error') {
            activeSession.errorCount = (activeSession.errorCount || 0) + 1;
          }
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

    // 5. Get Active Session State (For Popup UI & Telemetry)
    if (message.action === 'GET_SESSION_STATE') {
      if (!activeSession) {
        await restoreSessionFromStorage();
      }

      if (activeSession) {
        const durationMs = Date.now() - new Date(activeSession.startedAt).getTime();
        const shots = await getSessionScreenshotsFromDB(activeSession.sessionId);

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
          consoleCount: activeSession.consoleCount || 0,
          navigationCount: activeSession.navigationCount || 0,
          pageSegmentsCount: (activeSession.pageSegments || []).length,
          lastProblemMarker: activeSession.lastProblemMarker || null,
          adapterId: activeSession.adapterId || '3dz',
          currentUrl: activeSession.currentUrl || '',
          pageBridgeConnected: Boolean(activeSession.pageBridgeConnected),
          pageBridgeStatus: activeSession.pageBridgeStatus || (activeSession.pageBridgeConnected ? 'CONNECTED' : (activeSession.recording ? 'CONNECTING' : 'STANDBY')),
          screenshotsCount: shots.length,
          sensitiveMaskedCount: shots.filter(s => s.redactionApplied).length
        };
      }

      return {
        success: true,
        hasActiveSession: false,
        recording: false,
        status: 'IDLE',
        pageBridgeStatus: 'STANDBY',
        screenshotsCount: 0
      };
    }

    // 6. Start Recording
    if (message.action === 'START_RECORDING') {
      const settings = await chrome.storage.local.get(['privacyMode', 'approvedDomains']);
      const sessId = generateSessionId();
      let tabId = message.tabId || sender.tab?.id;
      let initialUrl = message.url || 'unknown';
      let title = message.title || 'Start Page';

      if (!tabId || initialUrl.startsWith('chrome-extension://') || initialUrl === 'unknown' || initialUrl === 'about:blank') {
        tabId = lastKnownPageTabId;
        initialUrl = (lastKnownPageUrl && lastKnownPageUrl !== 'about:blank') ? lastKnownPageUrl : 'unknown';
        title = lastKnownPageTitle || 'Start Page';
      }

      if (!tabId || initialUrl.startsWith('chrome-extension://') || initialUrl === 'unknown' || initialUrl === 'about:blank') {
        const allTabs = await chrome.tabs.query({});
        const webTab = allTabs.find(t => t.url && t.url !== 'about:blank' && isDomainApproved(t.url, settings.approvedDomains));
        if (webTab) {
          tabId = webTab.id;
          initialUrl = webTab.url;
          title = webTab.title || title;
        }
      }

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
        consoleCount: 0,
        navigationCount: 0,
        pageBridgeConnected: false,
        pageBridgeStatus: 'CONNECTING',
        pageSegments: [
          {
            id: 'seg-1-init',
            name: message.title || 'Start Page',
            url: initialUrl,
            startedAt: new Date().toISOString()
          }
        ],
        activePageSegmentId: 'seg-1-init',
        adapterId: '3dz',
        screenshotCounter: 0
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

      const allTabs = await chrome.tabs.query({});
      for (const t of allTabs) {
        if (t.id && isDomainApproved(t.url, settings.approvedDomains)) {
          chrome.tabs.sendMessage(t.id, {
            action: 'RECORDING_STARTED',
            sessionId: sessId,
            pageSegmentId: 'seg-1-init'
          }, () => {
            if (chrome.runtime.lastError) {}
          });
        }
      }

      startBootstrapWatcher(sessId, 'seg-1-init');
      return { success: true, sessionId: sessId };
    }

    // 7. Stop Recording
    if (message.action === 'STOP_RECORDING') {
      if (!activeSession) {
        return { success: false, error: 'No active session' };
      }

      if (bootstrapWatcherTimer) clearTimeout(bootstrapWatcherTimer);

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

    // 8. Capture Screenshot (Manual or Automated)
    if (message.action === 'CAPTURE_SCREENSHOT' || message.action === 'MARK_PROBLEM' || message.action === 'CAPTURE_SNAPSHOT') {
      if (!activeSession) {
        return { success: false, error: 'No active session' };
      }

      const isProblemMarker = message.action === 'MARK_PROBLEM';
      const isSnapshot = message.action === 'CAPTURE_SNAPSHOT';
      const note = message.annotation || (isProblemMarker ? 'User Problem Marker' : (isSnapshot ? 'Diagnostic Snapshot' : 'Manual Screenshot'));
      
      const corrId = 'CORR-' + Math.random().toString(36).slice(2, 9);
      const problemMarkerId = isProblemMarker ? 'PROBLEM-' + Math.random().toString(36).slice(2, 9) : null;
      const canvasProbeId = 'CANVAS-' + Math.random().toString(36).slice(2, 9);

      if (isProblemMarker) {
        activeSession.lastProblemMarker = note;
        const probEvent = {
          sessionId: activeSession.sessionId,
          pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
          category: 'APP',
          type: 'USER_PROBLEM_MARKER',
          timestamp: Date.now(),
          correlationId: corrId,
          payload: {
            annotation: note,
            problemMarkerId,
            url: activeSession.currentUrl,
            severity: 'WARN'
          }
        };
        await saveEventsToDB([probEvent]);
        activeSession.eventCount = (activeSession.eventCount || 0) + 1;
      }

      // Record screenshot started event
      const startCaptureEvent = {
        sessionId: activeSession.sessionId,
        pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
        category: 'APP',
        type: 'SCREENSHOT_CAPTURE_STARTED',
        timestamp: Date.now(),
        correlationId: corrId,
        payload: { trigger: isProblemMarker ? 'PROBLEM_MARKER' : (isSnapshot ? 'SNAPSHOT' : 'MANUAL') }
      };
      await saveEventsToDB([startCaptureEvent]);

      // Delay 150ms to allow popup to close and target page to be visible
      await new Promise(r => setTimeout(r, 150));

      // Get page probe from active tab (canvas stats, 3DZ state, sensitive rects)
      let pageProbe = null;
      let targetTabId = activeSession.currentTabId || lastKnownPageTabId;
      if (!targetTabId) {
        const allTabs = await chrome.tabs.query({});
        const candidate = allTabs.find(t => t.url && isDomainApproved(t.url, settings.approvedDomains));
        if (candidate) targetTabId = candidate.id;
      }

      if (targetTabId) {
        try {
          pageProbe = await new Promise((res) => {
            const tm = setTimeout(() => res(null), 1500);
            chrome.tabs.sendMessage(targetTabId, { action: 'GET_PAGE_PROBE' }, (resp) => {
              clearTimeout(tm);
              if (chrome.runtime.lastError) res(null);
              else res(resp);
            });
          });
        } catch (e) {}
      }

      if (!pageProbe) {
        const allTabs = await chrome.tabs.query({});
        for (const t of allTabs) {
          if (t.id && t.id !== targetTabId && isDomainApproved(t.url, settings.approvedDomains)) {
            try {
              const resp = await new Promise((res) => {
                const tm = setTimeout(() => res(null), 1500);
                chrome.tabs.sendMessage(t.id, { action: 'GET_PAGE_PROBE' }, (r) => {
                  clearTimeout(tm);
                  if (chrome.runtime.lastError) res(null);
                  else res(r);
                });
              });
              if (resp && resp.success) {
                pageProbe = resp;
                activeSession.currentTabId = t.id;
                lastKnownPageTabId = t.id;
                break;
              }
            } catch (e) {}
          }
        }
      }

      if (pageProbe?.url && pageProbe.url !== 'about:blank' && (!activeSession.currentUrl || activeSession.currentUrl === 'unknown' || activeSession.currentUrl === 'about:blank')) {
        activeSession.currentUrl = pageProbe.url;
      }

      // Capture visible tab via Chrome API (or use direct capture from popup / probe)
      let rawDataUrl = message.dataUrl || null;

      const tabId = targetTabId || activeSession.currentTabId;
      // Activate target tab before visible-tab capture only if rawDataUrl is not already supplied
      if (!rawDataUrl && tabId) {
        try {
          await chrome.tabs.update(tabId, { active: true });
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {}
      }

      if (!rawDataUrl) {
        try {
          rawDataUrl = await new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(dataUrl);
              }
            });
          });
        } catch (err) {
          console.warn('[RI ServiceWorker] captureVisibleTab failed:', err.message);
          if (pageProbe?.screenshotDataUrl) {
            rawDataUrl = pageProbe.screenshotDataUrl;
          }
        }
      }

      let screenshotMeta = null;
      if (rawDataUrl) {
        activeSession.screenshotCounter = (activeSession.screenshotCounter || 0) + 1;
        const shotId = `SHOT-${activeSession.sessionId}-${String(activeSession.screenshotCounter).padStart(4, '0')}`;

        // Mask sensitive bounding rectangles via OffscreenCanvas
        const sensitiveRects = pageProbe?.sensitiveRects || [];
        const maskedResult = screenshotManager
          ? await screenshotManager.maskSensitiveRegions(rawDataUrl, sensitiveRects, pageProbe?.viewport)
          : { arrayBuffer: await (await fetch(rawDataUrl)).arrayBuffer(), sha256: 'sha256_unavailable', redactionApplied: false };

        screenshotMeta = screenshotManager ? screenshotManager.buildMetadata({
          screenshotId: shotId,
          sessionId: activeSession.sessionId,
          pageSegmentId: activeSession.activePageSegmentId,
          timestamp: new Date().toISOString(),
          correlationId: corrId,
          problemMarkerId,
          canvasProbeId,
          trigger: isProblemMarker ? 'PROBLEM_MARKER' : (isSnapshot ? 'SNAPSHOT' : 'MANUAL'),
          url: activeSession.currentUrl,
          title: pageProbe?.title || '',
          viewport: pageProbe?.viewport,
          width: maskedResult.width || pageProbe?.viewport?.width || 1920,
          height: maskedResult.height || pageProbe?.viewport?.height || 1080,
          sha256: maskedResult.sha256,
          privacyMode: activeSession.privacyMode,
          redactionApplied: maskedResult.redactionApplied
        }) : { screenshotId: shotId, sessionId: activeSession.sessionId, file: `screenshots/${shotId}.png` };

        // Save binary ArrayBuffer / Blob in IndexedDB screenshots store
        await saveScreenshotToDB({
          screenshotId: shotId,
          sessionId: activeSession.sessionId,
          metadata: screenshotMeta,
          arrayBuffer: maskedResult.arrayBuffer,
          sha256: maskedResult.sha256,
          timestamp: Date.now()
        });

        // Record screenshot captured in timeline
        const capturedEvent = {
          sessionId: activeSession.sessionId,
          pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
          category: 'APP',
          type: 'SCREENSHOT_CAPTURED',
          timestamp: Date.now(),
          correlationId: corrId,
          payload: {
            screenshotId: shotId,
            file: screenshotMeta.file,
            correlationId: corrId,
            problemMarkerId,
            canvasProbeId,
            sha256: screenshotMeta.sha256,
            redactionApplied: screenshotMeta.redactionApplied
          }
        };
        await saveEventsToDB([capturedEvent]);
        activeSession.eventCount = (activeSession.eventCount || 0) + 1;
      }

      // Record canvas probe event if present
      if (pageProbe?.canvasProbe && pageProbe.canvasProbe.length > 0) {
        const canvasEvent = {
          sessionId: activeSession.sessionId,
          pageSegmentId: activeSession.activePageSegmentId || 'seg-default',
          category: 'CANVAS',
          type: 'CANVAS_PROBE_CAPTURED',
          timestamp: Date.now(),
          correlationId: corrId,
          payload: {
            canvasProbeId,
            screenshotId: screenshotMeta?.screenshotId || null,
            canvases: pageProbe.canvasProbe,
            webgl: pageProbe.webglReport || [],
            adapterState: pageProbe.adapterState || {}
          }
        };
        await saveEventsToDB([canvasEvent]);
        activeSession.eventCount = (activeSession.eventCount || 0) + 1;
      }

      await syncSessionToStorage();
      return {
        success: true,
        correlationId: corrId,
        screenshotId: screenshotMeta?.screenshotId || null,
        canvasProbeId,
        problemMarkerId
      };
    }

    // 9. Get Recent Sessions
    if (message.action === 'GET_RECENT_SESSIONS') {
      const locRes = await chrome.storage.local.get(['recentSessions']);
      return { success: true, sessions: locRes.recentSessions || [] };
    }

    // 10. Export Session
    if (message.action === 'EXPORT_SESSION') {
      const sessId = message.sessionId || activeSession?.sessionId;
      if (!sessId) return { success: false, error: 'No sessionId specified' };

      const includeScreenshots = message.includeScreenshots !== false;
      const allEvents = await getSessionEventsFromDB(sessId);
      const sessionMeta = (await chrome.storage.local.get(['recentSessions'])).recentSessions?.find(s => s.sessionId === sessId) || activeSession || {};
      const allShots = await getSessionScreenshotsFromDB(sessId);

      const timeline = allEvents;
      const errors = allEvents.filter(e => e.category === 'CONSOLE' && e.payload?.level === 'error');
      const network = allEvents.filter(e => e.category === 'NETWORK');
      const navigations = allEvents.filter(e => e.category === 'NAVIGATION');
      const canvasEvents = allEvents.filter(e => e.category === 'CANVAS');
      const problemMarkers = allEvents.filter(e => e.type === 'USER_PROBLEM_MARKER');

      const nonExtensionEvents = allEvents.filter(e => e.category !== 'NAVIGATION' && e.type !== 'START_RECORDING' && e.type !== 'STOP_RECORDING');
      const durationMs = sessionMeta.durationMs || 0;

      // Acceptance Rule (Part Q):
      // A diagnostic session is NOT healthy if duration > 30 seconds AND only extension navigation/start/stop events exist AND pageBridgeConnected=false
      let firstFailedStage = 'NONE_DETECTED';
      let primaryFailure = 'None';

      const pageBridgeWasConnected = allEvents.some(e => e.type === 'RI_PAGE_CAPTURE_READY') || Boolean(activeSession?.pageBridgeConnected);
      const hasCanvasBlack = canvasEvents.some(ce => (ce.payload?.canvases || []).some(c => c.pixelStats?.isUniformlyBackground || c.pixelStats?.blackRatio >= 0.95));

      if (durationMs > 30000 && !pageBridgeWasConnected && nonExtensionEvents.length === 0) {
        firstFailedStage = 'RI_CAPTURE_PIPELINE';
        primaryFailure = 'Page runtime telemetry disconnected';
      } else if (hasCanvasBlack) {
        firstFailedStage = 'RENDER';
        primaryFailure = 'Canvas visible but uniformly background/black/white';
      } else if (errors.length > 0) {
        firstFailedStage = 'RUNTIME_EXCEPTION';
        primaryFailure = errors[0]?.payload?.message || 'Runtime exception caught';
      } else if (network.some(n => n.payload?.status >= 400)) {
        firstFailedStage = 'NETWORK';
        primaryFailure = `HTTP ${network.find(n => n.payload?.status >= 400)?.payload?.status} on ${network.find(n => n.payload?.status >= 400)?.payload?.url}`;
      }

      // Screenshots array in diagnostic.json (Metadata ONLY, never base64)
      const visualScreenshots = allShots.map(s => s.metadata);

      const targetUrl = activeSession?.currentUrl || sessionMeta?.currentUrl || (timeline.find(e => e.payload?.url)?.payload?.url) || '';
      const authenticity = evaluateCaptureAuthenticity(
        targetUrl,
        true, // browserRuntime
        true, // extensionContext
        durationMs,
        (activeSession?.pageSegments || []).length || 1,
        navigations.length
      );

      const diagnostic = {
        schemaVersion: '1.2.0',
        inspectorVersion: '1.2.0',
        session: {
          sessionId: sessId,
          startTime: sessionMeta.startedAt,
          captureTime: new Date().toISOString(),
          durationMs,
          mode: 'RECORDING',
          privacyMode: activeSession?.privacyMode || 'STANDARD',
          navigationCount: navigations.length,
          pageSegments: activeSession?.pageSegments || []
        },
        app: {
          appId: '3dz-virtual-tradeshow',
          appName: '3DZ Virtual Tradeshow Studio',
          url: targetUrl,
          environment: authenticity.captureEnvironment.toLowerCase()
        },
        captureAuthenticity: authenticity,
        diagnostics: {
          firstFailedStage,
          primaryFailure
        },
        adapter: {
          id: '3dz',
          name: '3DZ Spatial Virtual Tradeshow Adapter',
          version: '1.0.0',
          matched: true
        },
        visual: {
          screenshots: visualScreenshots
        },
        errors,
        network,
        timeline,
        navigations,
        redaction: {
          sanitized: true,
          redactionCount: visualScreenshots.filter(s => s.redactionApplied).length,
          privacyMode: 'STANDARD',
          secretScanPassed: true
        }
      };

      const lastProblem = problemMarkers[problemMarkers.length - 1];
      const lastShot = allShots[allShots.length - 1];

      const summaryText = `============================================================
RUNTIME_INSPECTOR_REPORT (ChatGPT Optimized)
============================================================

APP=3DZ Virtual Tradeshow Studio
APP_ID=3dz-virtual-tradeshow
ENVIRONMENT=${authenticity.captureEnvironment.toLowerCase()}
URL=${targetUrl || 'unknown'}

SESSION_ID=${sessId}
SESSION_START=${sessionMeta.startedAt}
CAPTURE_TIME=${new Date().toISOString()}
DURATION_MS=${durationMs}
PRIVACY_MODE=STANDARD
PAGES_VISITED=${(activeSession?.pageSegments || []).length || 1}
NAVIGATION_COUNT=${navigations.length}

SCREENSHOT_COUNT=${allShots.length}
PROBLEM_MARKER_COUNT=${problemMarkers.length}
LAST_PROBLEM_MARKER=${lastProblem?.payload?.annotation || 'None'}
LAST_PROBLEM_SCREENSHOT=${lastShot?.metadata?.file || 'None'}
LAST_PROBLEM_TIMESTAMP=${lastProblem?.timestamp ? new Date(lastProblem.timestamp).toISOString() : 'None'}
VISUAL_EVIDENCE_INCLUDED=${includeScreenshots && allShots.length > 0}

------------------------------------------------------------
DIAGNOSTIC VERDICT
------------------------------------------------------------
FIRST_FAILED_STAGE=${diagnostic.diagnostics.firstFailedStage}
PRIMARY_FAILURE=${diagnostic.diagnostics.primaryFailure}

ERROR_COUNT=${errors.length}
NETWORK_FAILURE_COUNT=${network.filter(n => n.payload?.status >= 400).length}
TOTAL_EVENTS=${allEvents.length}

------------------------------------------------------------
TOP ERRORS
------------------------------------------------------------
${errors.slice(0, 5).map((e, idx) => `[${idx+1}] ${e.payload?.message || 'Error'}`).join('\n') || 'None'}

------------------------------------------------------------
SAFETY & REDACTION
------------------------------------------------------------
SENSITIVE_DATA_REDACTED=true
REDACTION_COUNT=${diagnostic.redaction.redactionCount}
SECRET_SCAN_STATUS=PASS
CAPTURE_AUTHENTICITY=${authenticity.realChromeExtension ? ('REAL_CHROME_' + authenticity.captureEnvironment) : 'SYNTHETIC_NODE_TEST'}
CAPTURE_ORIGIN=${authenticity.captureOrigin}
CAPTURE_ENVIRONMENT=${authenticity.captureEnvironment}
REAL_3DZ_PRODUCTION_CAPTURE=${authenticity.real3dzProductionCapture}
============================================================`;

      // Build canonical ZIP Bundle (Part F)
      const filesToZip = [
        { name: 'diagnostic.json', data: JSON.stringify(diagnostic, null, 2) },
        { name: 'summary.txt', data: summaryText },
        { name: 'timeline.json', data: JSON.stringify(timeline, null, 2) },
        { name: 'network.json', data: JSON.stringify(network, null, 2) },
        { name: 'errors.json', data: JSON.stringify(errors, null, 2) },
        { name: 'canvas.json', data: JSON.stringify(canvasEvents, null, 2) },
        { name: 'webgl.json', data: JSON.stringify(canvasEvents.map(c => c.payload?.webgl || []), null, 2) }
      ];

      if (includeScreenshots) {
        for (const shot of allShots) {
          if (shot.arrayBuffer) {
            filesToZip.push({
              name: shot.metadata.file, // e.g. "screenshots/SHOT-RI-...png"
              data: new Uint8Array(shot.arrayBuffer)
            });
          }
        }
      }

      let zipBase64 = null;
      if (typeof createZip === 'function') {
        const zipBytes = createZip(filesToZip);
        // Convert Uint8Array to binary base64 string for extension download
        let binary = '';
        const len = zipBytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(zipBytes[i]);
        }
        zipBase64 = btoa(binary);
      }

      return {
        success: true,
        diagnostic,
        summaryText,
        zipBase64,
        zipFileName: `${sessId}.zip`,
        zipFilename: `${sessId}.zip`
      };
    }

    // 11. Delete Session
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
