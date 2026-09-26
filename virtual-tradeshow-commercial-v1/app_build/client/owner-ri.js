/**
 * owner-ri.js — Persistent Mobile Runtime Inspector for Authorized Owner QA
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a persistent floating entry point [ 🛠️ RI ] across all screens
 * and states (How To, Camera Denied, Sensor Failure, 12 Checkpoints, Review,
 * Generation, and 3D Viewer) for verified Owner QA sessions.
 *
 * Governed strictly by server-side ENABLE_OWNER_RI flag and verified QA
 * authorization via HttpOnly session cookies. Fails closed for ordinary visitors
 * (zero DOM presence, zero public leakage).
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // Prevent duplicate initialization
  if (window.MobileRI && window.MobileRI.isMounted && window.MobileRI.isMounted()) {
    return;
  }

  let isDrawerOpen = false;
  let riCapabilities = null;
  let eventLog = [];

  function logEvent(name, details = {}) {
    const entry = {
      timestamp: new Date().toISOString().substring(11, 23),
      name,
      details
    };
    eventLog.unshift(entry);
    if (eventLog.length > 25) eventLog.pop();
    updateTimelineUI();
  }

  // Record window errors
  window.addEventListener('error', function (err) {
    logEvent('UNCAUGHT_ERROR', { message: err.message, file: err.filename });
  });

  async function checkCapabilities() {
    try {
      const res = await fetch('/api/internal-qa/capabilities', {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return { authorized: false, mobileRuntimeInspector: false };
      return await res.json();
    } catch (e) {
      return { authorized: false, mobileRuntimeInspector: false, error: e.message };
    }
  }

  function getTelemetrySnapshot() {
    const engine = window.stage2Engine;
    const nav = window.navigator || {};

    // Camera subsystem
    let cameraState = 'NOT_INITIALIZED';
    let cameraRes = 'N/A';
    const videoElem = document.getElementById('guidedCaptureVideo') || document.querySelector('video#guidedCameraPreview') || document.querySelector('video');
    const stream = (videoElem && videoElem.srcObject) || (engine && engine.activeStream);
    if (stream) {
      const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        const s = tracks[0].getSettings ? tracks[0].getSettings() : {};
        cameraState = 'ACTIVE (TRACK_LIVE)';
        const w = s.width || (videoElem ? videoElem.videoWidth : 0) || 1920;
        const h = s.height || (videoElem ? videoElem.videoHeight : 0) || 1080;
        cameraRes = `${w}x${h}`;
      } else {
        cameraState = 'STREAM_STOPPED';
      }
    } else if (document.getElementById('cameraPermissionDeniedNotice') || document.querySelector('.camera-error')) {
      cameraState = 'PERMISSION_DENIED';
    }

    // Sensor subsystem using real Stage2CaptureEngine fields
    let sensorState = 'NOT_INITIALIZED';
    let sampleCount = 0;
    let yaw = '0.0°';
    let pitch = '0.0°';
    let roll = '0.0°';
    let uprightValid = false;

    if (engine) {
      sampleCount = typeof engine.sensorSampleCount === 'number' ? engine.sensorSampleCount : (engine.telemetry?.samples?.length || 0);
      sensorState = engine.sensorSource || (sampleCount > 0 ? 'ACTIVE_SENSOR' : (engine.sensorAvailable ? 'LISTENING' : 'NOT_AVAILABLE'));
      if (typeof engine.normalizedYaw === 'number') {
        yaw = `${engine.normalizedYaw.toFixed(1)}°`;
      }
      if (typeof engine.currentPitch === 'number') {
        pitch = `${engine.currentPitch.toFixed(1)}°`;
        // Upright pitch check: within pitchLimitDeg (15°)
        const pitchLimit = engine.config?.pitchLimitDeg || 15.0;
        uprightValid = Math.abs(engine.currentPitch) <= pitchLimit;
      }
      if (typeof engine.currentRoll === 'number') {
        roll = `${engine.currentRoll.toFixed(1)}°`;
      }
    }

    // FSM & Checkpoint subsystem
    let fsmState = 'IDLE';
    let activeCp = '0 / 12';
    let photoCount = 0;
    if (engine) {
      fsmState = engine.state || 'IDLE';
      const targetIdx = typeof engine.currentTargetIndex === 'number' ? engine.currentTargetIndex : 0;
      activeCp = `${targetIdx + 1} / ${engine.config?.targetCheckpoints || 12}`;
      photoCount = Array.isArray(engine.canonicalFrames) ? engine.canonicalFrames.length : 0;
    }

    return {
      uiVersion: riCapabilities?.uiVersion || '3D2-C12.9-P2R17-DEV11',
      buildSha: riCapabilities?.buildSha || '9196e0b',
      environment: riCapabilities?.environment || 'development',
      url: window.location.href,
      userAgent: nav.userAgent || 'UNKNOWN',
      camera: { state: cameraState, resolution: cameraRes },
      sensor: { state: sensorState, sampleCount, yaw, pitch, roll, uprightValid },
      fsm: { state: fsmState, checkpoint: activeCp, photosCaptured: photoCount },
      role: riCapabilities?.role || 'OWNER_QA'
    };
  }

  function injectStyles() {
    if (document.getElementById('vshow-owner-ri-styles')) return;
    const style = document.createElement('style');
    style.id = 'vshow-owner-ri-styles';
    style.textContent = `
      #vshow-owner-ri-badge {
        position: fixed;
        bottom: 24px;
        right: 18px;
        z-index: 999999;
        background: linear-gradient(135deg, #1e1b4b, #312e81);
        border: 1.5px solid #818cf8;
        color: #e0e7ff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 700;
        padding: 10px 16px;
        border-radius: 9999px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 12px rgba(129, 140, 248, 0.4);
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      #vshow-owner-ri-badge:hover {
        transform: scale(1.05);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 16px rgba(129, 140, 248, 0.6);
      }
      #vshow-owner-ri-badge .badge-dot {
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        box-shadow: 0 0 8px #22c55e;
      }
      #vshow-owner-ri-drawer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-height: 85vh;
        z-index: 1000000;
        background: #0f172a;
        color: #f8fafc;
        border-top: 2px solid #6366f1;
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.7);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        display: flex;
        flex-direction: column;
        transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      #vshow-owner-ri-drawer.open {
        transform: translateY(0);
      }
      .ri-header {
        padding: 14px 20px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ri-title {
        font-size: 15px;
        font-weight: 700;
        color: #38bdf8;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ri-close {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
      }
      .ri-content {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
        font-size: 12px;
      }
      .ri-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 16px;
      }
      .ri-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 10px;
      }
      .ri-card-label {
        font-size: 11px;
        color: #94a3b8;
        text-transform: uppercase;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .ri-card-val {
        font-size: 13px;
        font-weight: 700;
        color: #f1f5f9;
        word-break: break-all;
      }
      .ri-timeline {
        background: #090d16;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 10px;
        max-height: 120px;
        overflow-y: auto;
        margin-bottom: 16px;
      }
      .ri-timeline-item {
        font-size: 11px;
        color: #cbd5e1;
        padding: 3px 0;
        border-bottom: 1px dashed #1e293b;
        display: flex;
        justify-content: space-between;
      }
      .ri-actions {
        padding: 14px 20px;
        background: #1e293b;
        border-top: 1px solid #334155;
        display: flex;
        gap: 10px;
      }
      .ri-btn-report {
        flex: 2;
        background: #dc2626;
        border: none;
        color: white;
        font-weight: 700;
        font-size: 13px;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .ri-btn-report:hover { background: #ef4444; }
      .ri-btn-report:disabled { background: #64748b; cursor: not-allowed; }
      .ri-btn-refresh {
        flex: 1;
        background: #334155;
        border: 1px solid #475569;
        color: #f1f5f9;
        font-weight: 600;
        font-size: 12px;
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function renderDrawerUI() {
    if (document.getElementById('vshow-owner-ri-root')) return;

    injectStyles();

    const root = document.createElement('div');
    root.id = 'vshow-owner-ri-root';

    // Floating Badge Button
    const badge = document.createElement('div');
    badge.id = 'vshow-owner-ri-badge';
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', 'Open Mobile Runtime Inspector');
    badge.innerHTML = `
      <span class="badge-dot"></span>
      <span>🛠️ RI</span>
    `;
    badge.onclick = toggleDrawer;

    // Sliding Drawer
    const drawer = document.createElement('div');
    drawer.id = 'vshow-owner-ri-drawer';
    drawer.innerHTML = `
      <div class="ri-header">
        <div class="ri-title">
          <span>🛠️ Mobile Runtime Inspector</span>
          <span style="font-size: 11px; background: #3730a3; color: #c7d2fe; padding: 2px 8px; border-radius: 12px;">OWNER QA</span>
        </div>
        <button class="ri-close" id="btnRiClose">&times;</button>
      </div>
      <div class="ri-content">
        <div class="ri-grid">
          <div class="ri-card">
            <div class="ri-card-label">Build SHA / Version</div>
            <div class="ri-card-val" id="riValBuild">${riCapabilities?.buildSha || '9196e0b'} (${riCapabilities?.environment || 'dev'})</div>
          </div>
          <div class="ri-card">
            <div class="ri-card-label">QA Auth Status</div>
            <div class="ri-card-val" id="riValAuth" style="color: #4ade80;">AUTHORIZED (${riCapabilities?.role || 'OWNER_QA'})</div>
          </div>
          <div class="ri-card">
            <div class="ri-card-label">Camera Status</div>
            <div class="ri-card-val" id="riValCamera">CHECKING...</div>
          </div>
          <div class="ri-card">
            <div class="ri-card-label">Orientation Sensor</div>
            <div class="ri-card-val" id="riValSensor">CHECKING...</div>
          </div>
          <div class="ri-card">
            <div class="ri-card-label">Euler (Pitch / Yaw)</div>
            <div class="ri-card-val" id="riValEuler">0° / 0°</div>
          </div>
          <div class="ri-card">
            <div class="ri-card-label">FSM Checkpoints</div>
            <div class="ri-card-val" id="riValFsm">IDLE (0 / 12)</div>
          </div>
        </div>
        <div class="ri-card-label" style="margin-bottom: 6px;">Telemetry Event Timeline (Redacted)</div>
        <div class="ri-timeline" id="riTimeline">
          <div class="ri-timeline-item"><span>Initializing inspector...</span></div>
        </div>
      </div>
      <div class="ri-actions">
        <button class="ri-btn-report" id="btnRiSendReport">
          <span>🚀 SEND BUG REPORT / TELEMETRY</span>
        </button>
        <button class="ri-btn-refresh" id="btnRiRefresh">🔄 REFRESH</button>
      </div>
    `;

    root.appendChild(badge);
    root.appendChild(drawer);
    document.body.appendChild(root);

    document.getElementById('btnRiClose').onclick = closeDrawer;
    document.getElementById('btnRiRefresh').onclick = updateMetricsUI;
    document.getElementById('btnRiSendReport').onclick = submitTelemetryReport;

    logEvent('RI_MOUNTED', { buildSha: riCapabilities?.buildSha, role: riCapabilities?.role });
    updateMetricsUI();
  }

  function toggleDrawer() {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    const drawer = document.getElementById('vshow-owner-ri-drawer');
    if (drawer) {
      drawer.classList.add('open');
      isDrawerOpen = true;
      updateMetricsUI();
      logEvent('DRAWER_OPENED');
    }
  }

  function closeDrawer() {
    const drawer = document.getElementById('vshow-owner-ri-drawer');
    if (drawer) {
      drawer.classList.remove('open');
      isDrawerOpen = false;
      logEvent('DRAWER_CLOSED');
    }
  }

  function updateMetricsUI() {
    const snap = getTelemetrySnapshot();
    const elCamera = document.getElementById('riValCamera');
    const elSensor = document.getElementById('riValSensor');
    const elEuler = document.getElementById('riValEuler');
    const elFsm = document.getElementById('riValFsm');
    const elAuth = document.getElementById('riValAuth');

    if (elCamera) elCamera.textContent = `${snap.camera.state} (${snap.camera.resolution})`;
    if (elSensor) elSensor.textContent = `${snap.sensor.state} (${snap.sensor.sampleCount} smp)`;
    if (elEuler) {
      elEuler.textContent = `P: ${snap.sensor.pitch} | Y: ${snap.sensor.yaw} ${snap.sensor.uprightValid ? '✓' : '✗'}`;
      elEuler.style.color = snap.sensor.uprightValid ? '#4ade80' : '#f87171';
    }
    if (elFsm) elFsm.textContent = `${snap.fsm.state} (${snap.fsm.checkpoint}) [${snap.fsm.photosCaptured} pics]`;
    if (elAuth) {
      elAuth.textContent = `AUTHORIZED (${snap.role})`;
      elAuth.style.color = '#4ade80';
    }
  }

  function updateTimelineUI() {
    const el = document.getElementById('riTimeline');
    if (!el) return;
    el.innerHTML = eventLog.map(e => `
      <div class="ri-timeline-item">
        <span style="color: #38bdf8;">[${e.timestamp}] ${e.name}</span>
        <span style="color: #94a3b8; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${JSON.stringify(e.details || {})}
        </span>
      </div>
    `).join('');
  }

  async function submitTelemetryReport() {
    const btn = document.getElementById('btnRiSendReport');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ PERSISTING TO VOLUME...</span>';
    }

    try {
      const snap = getTelemetrySnapshot();
      const sessionId = (window.stage2Engine && window.stage2Engine.telemetry && window.stage2Engine.telemetry.sessionId)
        || ('RI-M-' + Date.now().toString(36).toUpperCase());

      const payload = {
        sessionId,
        projectId: 'prj-free-b0c6f3ea',
        uiVersion: snap.uiVersion,
        buildSha: snap.buildSha,
        source: 'OWNER_MOBILE_RI_PANEL',
        clientTimestamp: new Date().toISOString(),
        snapshot: snap,
        recentEvents: eventLog.slice(0, 15)
      };

      const res = await fetch('/api/internal-qa/mobile-ri/report', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const body = await res.json();
        logEvent('REPORT_SUBMITTED', { sessionId: body.sessionId, status: body.status });
        alert(`✅ [Mobile RI Report Persisted!]\nSession ID: ${body.sessionId}\nStatus: ${body.status || 'PERSISTED'}\nArtifacts saved securely on volume.`);
      } else {
        logEvent('REPORT_ERROR', { status: res.status });
        alert(`❌ Report submission failed (HTTP ${res.status}). Server QA authorization required.`);
      }
    } catch (err) {
      logEvent('REPORT_NETWORK_ERROR', { error: err.message });
      alert(`❌ Network error: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🚀 SEND BUG REPORT / TELEMETRY</span>';
      }
      updateMetricsUI();
    }
  }

  // Initialization Orchestration
  async function init() {
    const cap = await checkCapabilities();
    riCapabilities = cap;

    // Strict Double Gate: Requires BOTH server-verified QA authorization AND mobileRuntimeInspector capability
    const isAuthorizedOwner = !!(cap && cap.authorized === true && cap.mobileRuntimeInspector === true);

    if (isAuthorizedOwner) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderDrawerUI);
      } else {
        renderDrawerUI();
      }
    } else {
      // Ordinary visitor or unauthorized session: fail closed, zero DOM footprint
      console.debug('[Mobile RI] Inactive for current unauthenticated session.');
    }
  }

  // Public API
  window.MobileRI = {
    version: '1.1.0',
    isMounted: () => !!document.getElementById('vshow-owner-ri-root'),
    openDrawer,
    closeDrawer,
    submitTelemetryReport,
    getTelemetrySnapshot,
    logEvent
  };

  init();
})();
