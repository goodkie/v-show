/**
 * Mobile Runtime Inspector — In-App Floating UI & Report Bottom Sheet
 * Module: adapters/mobile/mobile-ui.js
 */

class MobileInspectorUI {
  constructor(adapter, options = {}) {
    this.adapter = adapter;
    this.reportEndpoint = options.reportEndpoint || '/api/internal-qa/mobile-ri/report';
    this.isSubmitting = false;
    this.container = null;
    this.sheet = null;
  }

  mount() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('mobileRiContainer')) return;

    this.container = document.createElement('div');
    this.container.id = 'mobileRiContainer';
    this.container.style.cssText = 'position: fixed; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: none;';

    // Floating REPORT ISSUE Button (Bottom Right)
    const floatBtn = document.createElement('button');
    floatBtn.id = 'btnMobileRiReport';
    floatBtn.type = 'button';
    floatBtn.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ef4444; margin-right:6px; box-shadow:0 0 6px #ef4444;"></span>REPORT ISSUE';
    floatBtn.style.cssText = `
      position: fixed;
      bottom: 18px;
      right: 18px;
      padding: 9px 16px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid #38bdf8;
      color: #f8fafc;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      border-radius: 30px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.6), 0 0 10px rgba(56,189,248,0.3);
      cursor: pointer;
      pointer-events: auto;
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      transition: transform 0.15s ease, background 0.15s ease;
    `;
    floatBtn.onclick = () => this.openBottomSheet();
    this.container.appendChild(floatBtn);

    // Mobile Bottom Sheet Modal
    this.sheet = document.createElement('div');
    this.sheet.id = 'mobileRiBottomSheet';
    this.sheet.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      align-items: flex-end;
      justify-content: center;
      pointer-events: auto;
    `;
    this.sheet.onclick = (e) => {
      if (e.target === this.sheet) this.closeBottomSheet();
    };

    const card = document.createElement('div');
    card.id = 'mobileRiCard';
    card.style.cssText = `
      background: #09101d;
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-bottom: none;
      border-radius: 20px 20px 0 0;
      width: 100%;
      max-width: 480px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 20px 24px 28px 24px;
      color: #f8fafc;
      box-shadow: 0 -10px 40px rgba(0,0,0,0.8);
      transform: translateY(0);
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    card.innerHTML = `
      <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 16px auto;"></div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: linear-gradient(135deg, #0284c7, #38bdf8); border-radius: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;">RI</span>
          <div>
            <div style="font-size: 13.5px; font-weight: 800; letter-spacing: 0.3px;">³D₂ MOBILE INSPECTOR</div>
            <div style="font-size: 10.5px; color: #94a3b8; font-family: monospace;">Session: <span id="mobileRiHeaderSession" style="color: #38bdf8; font-weight: 700;"></span></div>
          </div>
        </div>
        <button type="button" id="btnMobileRiClose" style="background: rgba(255,255,255,0.08); border: none; color: #94a3b8; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px;">&times;</button>
      </div>

      <!-- Quick Metrics Grid -->
      <div id="mobileRiMetricsGrid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Secure HTTPS</span>
          <span id="mMetricHttps" style="font-size: 11.5px; font-weight: 800; color: #34d399;">YES</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Camera</span>
          <span id="mMetricCamera" style="font-size: 11.5px; font-weight: 800; color: #38bdf8;">READY</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Camera Frames</span>
          <span id="mMetricFrames" style="font-size: 11.5px; font-weight: 800; color: #f8fafc;">0</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Motion Events</span>
          <span id="mMetricMotion" style="font-size: 11.5px; font-weight: 800; color: #f8fafc;">0</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Current Step</span>
          <span id="mMetricStep" style="font-size: 11.5px; font-weight: 800; color: #38bdf8;">-</span>
        </div>
        <div style="background: rgba(15,23,42,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #94a3b8;">Capture %</span>
          <span id="mMetricCapture" style="font-size: 11.5px; font-weight: 800; color: #34d399;">0%</span>
        </div>
      </div>

      <!-- Optional Owner Note -->
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 11.5px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">
          What happened? <span style="font-weight: 400; color: #64748b;">(optional note)</span>
        </label>
        <textarea id="mobileRiNote" placeholder="e.g. Camera froze at 0%, or Marker drag didn't update..." rows="2" style="width: 100%; box-sizing: border-box; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #f8fafc; font-size: 12px; resize: none; font-family: inherit;"></textarea>
      </div>

      <!-- Action Button Area -->
      <div id="mobileRiActionArea">
        <button type="button" id="btnMobileRiSubmit" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0284c7, #10b981); border: 1px solid #38bdf8; border-radius: 10px; color: #fff; font-size: 13.5px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(2,132,199,0.4); display: flex; align-items: center; justify-content: center; gap: 8px;">
          CAPTURE BUG REPORT
        </button>
      </div>

      <!-- Post-Submit Success Display -->
      <div id="mobileRiSuccessArea" style="display: none; text-align: center; padding: 12px 0;">
        <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(52,211,153,0.15); border: 1px solid #34d399; color: #34d399; display: flex; align-items: center; justify-content: center; font-size: 20px; margin: 0 auto 10px auto;">✓</div>
        <h4 style="font-size: 15px; font-weight: 800; color: #fff; margin: 0 0 4px 0;">Report Saved</h4>
        <p style="font-size: 11.5px; color: #94a3b8; margin: 0 0 12px 0;">60-second telemetry and diagnostics uploaded.</p>
        <div style="background: rgba(15,23,42,0.9); border: 1px solid #38bdf8; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-family: monospace;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 2px;">SESSION ID</div>
          <div id="mobileRiCompletedSessionId" style="font-size: 16px; font-weight: 800; color: #38bdf8; letter-spacing: 1px;"></div>
        </div>
        <button type="button" id="btnMobileRiCopy" style="padding: 9px 20px; font-size: 12.5px; font-weight: 800; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #f8fafc; border-radius: 8px; cursor: pointer;">
          COPY SESSION ID
        </button>
      </div>
    `;

    this.sheet.appendChild(card);
    this.container.appendChild(this.sheet);
    document.body.appendChild(this.container);

    document.getElementById('btnMobileRiClose').onclick = () => this.closeBottomSheet();
    document.getElementById('btnMobileRiSubmit').onclick = () => this.submitReport();
    document.getElementById('btnMobileRiCopy').onclick = () => this.copySessionId();
  }

  openBottomSheet() {
    if (!this.sheet) return;
    this.sheet.style.display = 'flex';
    this.updateMetrics();
  }

  closeBottomSheet() {
    if (!this.sheet) return;
    this.sheet.style.display = 'none';
  }

  updateMetrics() {
    if (!this.adapter) return;
    const summary = this.adapter.summarize();
    const sidEl = document.getElementById('mobileRiHeaderSession');
    if (sidEl) sidEl.textContent = summary.SESSION_ID;

    const elHttps = document.getElementById('mMetricHttps');
    if (elHttps) {
      elHttps.textContent = summary.SECURE_HTTPS;
      elHttps.style.color = summary.SECURE_HTTPS === 'YES' ? '#34d399' : '#ef4444';
    }

    const elCam = document.getElementById('mMetricCamera');
    if (elCam) {
      elCam.textContent = summary.CAMERA_READY;
      elCam.style.color = summary.CAMERA_READY === 'ACTIVE' ? '#34d399' : (summary.CAMERA_READY === 'AVAILABLE' ? '#38bdf8' : '#ef4444');
    }

    const elFrames = document.getElementById('mMetricFrames');
    if (elFrames) elFrames.textContent = summary.CAMERA_FRAMES;

    const elMotion = document.getElementById('mMetricMotion');
    if (elMotion) elMotion.textContent = summary.MOTION_EVENTS;

    const elStep = document.getElementById('mMetricStep');
    if (elStep) elStep.textContent = summary.CURRENT_STEP !== null ? summary.CURRENT_STEP : '-';

    const elCap = document.getElementById('mMetricCapture');
    if (elCap) elCap.textContent = summary.CAPTURE_PROGRESS;
  }

  async captureScreenshot() {
    if (typeof document === 'undefined') return null;
    try {
      // If canvas is present, snapshot active canvas
      const canvas = document.querySelector('canvas');
      if (canvas && typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/png');
      }
    } catch (e) {
      console.warn('[MobileRI] Canvas snapshot error:', e);
    }
    return null;
  }

  async submitReport() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const btn = document.getElementById('btnMobileRiSubmit');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Packaging Report...';
    }

    try {
      const note = document.getElementById('mobileRiNote')?.value || '';
      const screenshotData = await this.captureScreenshot();
      const state = this.adapter.getRuntimeState();

      const rollingBuffer = this.adapter.buffer ? this.adapter.buffer.freezeSnapshot() : {};
      const payload = {
        sessionId: this.adapter.sessionId,
        submittedAt: new Date().toISOString(),
        ownerNote: note,
        hasScreenshot: Boolean(screenshotData),
        screenshotBase64: screenshotData,
        state,
        runtimeState: state,
        timeline: rollingBuffer.events || [],
        consoleLogs: rollingBuffer.consoleLogs || [],
        networkRequests: rollingBuffer.networkRequests || [],
        summary: this.adapter.summarize()
      };

      const res = await fetch(this.reportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.ok) {
        document.getElementById('mobileRiActionArea').style.display = 'none';
        const successArea = document.getElementById('mobileRiSuccessArea');
        successArea.style.display = 'block';
        document.getElementById('mobileRiCompletedSessionId').textContent = this.adapter.sessionId;
      } else {
        alert('Report submission note: ' + (data.error || 'Server error'));
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'CAPTURE BUG REPORT';
        }
      }
    } catch (err) {
      console.error('[MobileRI Submit Error]', err);
      alert('Report submission error: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'CAPTURE BUG REPORT';
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  copySessionId() {
    const sid = this.adapter.sessionId;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(sid).then(() => {
        const btn = document.getElementById('btnMobileRiCopy');
        if (btn) btn.textContent = 'COPIED!';
        setTimeout(() => { if (btn) btn.textContent = 'COPY SESSION ID'; }, 2000);
      });
    } else {
      prompt('Copy Session ID:', sid);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileInspectorUI };
} else {
  window.MobileInspectorUI = MobileInspectorUI;
}
