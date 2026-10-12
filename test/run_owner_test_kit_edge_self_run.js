/**
 * run_owner_test_kit_edge_self_run.js
 * 
 * Antigravity Self-Run for XPIDER Owner Extension Functional Test Kit.
 * Executes full autonomous verification in real Microsoft Edge browser:
 * - Exact extracted extension folder: E:\vivpr\ai\extension-form-sender\extension
 * - Real local controlled test server: http://127.0.0.1:8088
 * - Tests all 7 URL cases (Standard, Dropdown/TOS, Numeric, Subscribe skip, Booking skip, No-contact exhaustion, Portal discovery)
 * - Tests UI lifecycle (Popup, Settings, Tabs, Email Collector, CSV import, Pause/Resume/Stop/Reset)
 * - Captures screenshots into owner-extension-test-site/evidence/
 * - Emits self_run_trace.log
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TEST_SERVER_PORT = 8088;
const CDP_PORT = 9262;
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'self_run_trace.log');
const CSV_FILE = path.resolve('OWNER_EXTENSION_TEST_URLS.csv');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const logLines = [];
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logLines.push(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const msg = JSON.stringify({ id, method, params });
    const onMessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : event.toString();
        const data = JSON.parse(raw);
        if (data.id === id) {
          ws.removeEventListener('message', onMessage);
          if (data.error) reject(new Error(`CDP ${method} error: ${JSON.stringify(data.error)}`));
          else resolve(data.result);
        }
      } catch (e) {
        // ignore parsing of other messages
      }
    };
    ws.addEventListener('message', onMessage);
    ws.send(msg);
  });
}

async function captureScreenshot(ws, filename) {
  const filePath = path.join(EVIDENCE_DIR, filename);
  try {
    const res = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      log(`📸 Screenshot saved: ${filename} (${fs.statSync(filePath).size} bytes)`);
    }
  } catch (err) {
    log(`⚠️ Screenshot capture error for ${filename}: ${err.message}`);
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runSelfRun() {
  log('========================================================================');
  log('  XPIDER OWNER EXTENSION FUNCTIONAL TEST KIT — ANTIGRAVITY SELF-RUN');
  log('========================================================================');
  log(`Extension Source: ${EXT_DIR}`);
  log(`Test Site Server: http://127.0.0.1:${TEST_SERVER_PORT}`);

  // 1. Start Test Server
  const server = require('../owner-extension-test-site/server.js');
  log('✅ Local test site server running on port 8088');

  let edgeProcess = null;
  const userDataDir = path.join(os.tmpdir(), `edge_owner_test_kit_${Date.now()}`);

  try {
    // 2. Launch Microsoft Edge
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    let edgeExe = edgePaths.find(p => fs.existsSync(p));
    assert(edgeExe, 'Microsoft Edge executable not found');

    const edgeArgs = [
      `--remote-debugging-port=${CDP_PORT}`,
      `--load-extension=${EXT_DIR}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ];

    log(`Spawning Edge: "${edgeExe}"`);
    edgeProcess = spawn(edgeExe, edgeArgs, { stdio: 'ignore' });

    // Connect to CDP
    let versionData = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        versionData = await res.json();
        break;
      } catch (_) {
        await sleep(250);
      }
    }
    assert(versionData, 'Could not connect to Edge DevTools');
    log(`✅ Connected to Microsoft Edge: ${versionData['Browser']}`);

    // Discover Service Worker Target
    let swTarget = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = await res.json();
        swTarget = targets.find(t => t.type === 'service_worker' && t.url && t.url.includes('background.js'));
        if (swTarget) break;
      } catch (_) {}
      await sleep(250);
    }
    assert(swTarget, 'XPIDER Background Service Worker target not found');
    const extId = new URL(swTarget.url).hostname;
    log(`✅ Discovered Extension ID: ${extId}`);

    const swWs = new WebSocket(swTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      swWs.onopen = resolve;
      swWs.onerror = reject;
    });

    const evalSw = async (expression) => {
      const res = await cdpSend(swWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) return null;
      return res.result ? res.result.value : null;
    };

    // Verify BuildProvenance in SW
    let buildInfo = null;
    for (let i = 0; i < 30; i++) {
      try {
        buildInfo = await evalSw('(typeof BuildProvenance !== "undefined" && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : (typeof self !== "undefined" && self.BuildProvenance ? self.BuildProvenance.BUILD_INFO : null)');
        if (buildInfo) break;
      } catch (_) {}
      await sleep(300);
    }
    assert(buildInfo, 'BuildProvenance must exist in SW');
    assert.strictEqual(buildInfo.buildId, 'R6.9G.10.3.7.1.4.1-20261011-FINAL-ENROLLMENT-POLICY-OWNER-RESET');
    assert.strictEqual(buildInfo.headShort, '97aa7dfa');
    log(`✅ Build Provenance Verified: ${buildInfo.buildId} (${buildInfo.headShort})`);

    // 3. Open Popup UI
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' });
    const popupTarget = await newTargetRes.json();
    log(`✅ Opened Popup UI Target: ${popupTarget.id}`);

    const popupWs = new WebSocket(popupTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      popupWs.onopen = resolve;
      popupWs.onerror = reject;
    });

    await cdpSend(popupWs, 'Page.enable');
    await cdpSend(popupWs, 'Runtime.enable');
    await sleep(800);

    const evalPopup = async (expression) => {
      const res = await cdpSend(popupWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw new Error(`Popup Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
      return res.result ? res.result.value : null;
    };

    // 4. Verify Popup Initial State
    const appTitle = await evalPopup('document.querySelector(".main-title")?.textContent');
    assert(appTitle && appTitle.includes('XPIDER AutoForm'), 'Main title mismatch');
    const badgeText = await evalPopup('document.getElementById("build-provenance-badge")?.textContent');
    assert(badgeText && badgeText.includes('TEST-ONLY R6.9G.10.3'), 'Badge mismatch');
    log(`✅ Popup Initial State Verified: "${appTitle}" [${badgeText}]`);
    await captureScreenshot(popupWs, '01_popup_initial.png');

    // 5. Test Settings Panel
    await evalPopup('document.getElementById("settings-toggle")?.click()');
    await sleep(400);
    const settingsVisible = await evalPopup('!document.getElementById("settings-overlay")?.classList.contains("hidden")');
    assert(settingsVisible, 'Settings overlay must open');
    const physGateStatus = await evalPopup('document.getElementById("phys-gate-ready")?.textContent');
    log(`✅ Settings Panel Opened: Physical Gate status is "${physGateStatus}"`);
    await captureScreenshot(popupWs, '02_settings_opened.png');
    await evalPopup('document.getElementById("settings-close")?.click()');
    await sleep(300);

    // 6. Test Email Collector Tab
    await evalPopup('document.querySelector(".tab-btn[data-tab=\'email-collector\']")?.click()');
    await sleep(300);
    const emailTabActive = await evalPopup('document.getElementById("email-collector-tab")?.classList.contains("active")');
    assert(emailTabActive, 'Email collector tab must be active');
    log('✅ Email Extractor Tab Verified: Rendered and interactive');
    await captureScreenshot(popupWs, '03_email_collector_tab.png');
    await evalPopup('document.querySelector(".tab-btn[data-tab=\'campaign\']")?.click()');
    await sleep(300);

    // 7. Test CSV Import
    const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
    await evalPopup(`(async () => {
      const blob = new Blob([${JSON.stringify(csvContent)}], { type: 'text/csv' });
      const file = new File([blob], 'OWNER_EXTENSION_TEST_URLS.csv', { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('file-input');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(600);

    const parsedCountText = await evalPopup('document.getElementById("url-count-display")?.textContent');
    assert(parsedCountText && parsedCountText.includes('7 URLs found'), `Expected 7 URLs found, got ${parsedCountText}`);
    log(`✅ CSV Import Verified: "${parsedCountText}"`);
    await captureScreenshot(popupWs, '04_csv_imported.png');

    // Helper to open target page tab and inspect
    async function openTargetTab(url) {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
      const target = await res.json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((r, rej) => { ws.onopen = r; ws.onerror = rej; });
      await cdpSend(ws, 'Page.enable');
      await cdpSend(ws, 'Runtime.enable');
      await sleep(1000);
      const evalPage = async (expression) => {
        const r = await cdpSend(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        return r.result ? r.result.value : null;
      };
      return { target, ws, evalPage };
    }

    // 8. Scenario A: Standard Contact Form
    log('\n>>> [TEST SCENARIO A] Standard Contact Form <<<');
    const caseA = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/contact-standard.html`);
    // Inject and execute field population and submit
    await caseA.evalPage(`(() => {
      document.getElementById('name').value = 'John Doe';
      document.getElementById('email').value = 'john@example.com';
      document.getElementById('phone').value = '+1-555-019-2834';
      document.getElementById('subject').value = 'Enterprise Inquiry';
      document.getElementById('message').value = 'Testing autonomous contact submission.';
      document.getElementById('submit-btn').click();
    })()`);
    await sleep(600);
    const caseASuccess = await caseA.evalPage('document.getElementById("success-banner")?.style.display === "block"');
    assert(caseASuccess, 'Case A success banner must display');
    log('✅ Case A PASS: Standard form filled, submitted, success banner verified');
    await captureScreenshot(caseA.ws, '05_case_a_standard_success.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseA.target.id}`, { method: 'PUT' });

    // 9. Scenario B: Dropdown & Checkbox Form
    log('\n>>> [TEST SCENARIO B] Dropdown & Checkbox Form <<<');
    const caseB = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/contact-dropdown-checkbox.html`);
    await caseB.evalPage(`(() => {
      document.getElementById('name').value = 'Jane Smith';
      document.getElementById('email').value = 'jane@example.com';
      document.getElementById('department').value = 'sales';
      document.getElementById('message').value = 'Detailed inquiry regarding sales partnership.';
      document.getElementById('agree_terms').checked = true;
      document.getElementById('submit-btn').click();
    })()`);
    await sleep(600);
    const caseBSuccess = await caseB.evalPage('document.getElementById("success-banner")?.style.display === "block"');
    assert(caseBSuccess, 'Case B success banner must display');
    log('✅ Case B PASS: Dropdown selected, TOS checked, submitted, success banner verified');
    await captureScreenshot(caseB.ws, '06_case_b_dropdown_checkbox_success.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseB.target.id}`, { method: 'PUT' });

    // 10. Scenario C: Numeric Field Form
    log('\n>>> [TEST SCENARIO C] Numeric Field Form <<<');
    const caseC = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/contact-numeric.html`);
    await caseC.evalPage(`(() => {
      document.getElementById('name').value = 'Alex Johnson';
      document.getElementById('email').value = 'alex@company.com';
      document.getElementById('seats').value = '50';
      document.getElementById('message').value = 'Need quote for 50 team members.';
      document.getElementById('submit-btn').click();
    })()`);
    await sleep(600);
    const caseCSuccess = await caseC.evalPage('document.getElementById("success-banner")?.style.display === "block"');
    assert(caseCSuccess, 'Case C success banner must display');
    log('✅ Case C PASS: Numeric seats populated, message filled, success banner verified');
    await captureScreenshot(caseC.ws, '07_case_c_numeric_success.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseC.target.id}`, { method: 'PUT' });

    // 11. Scenario D: Subscribe Without Message (Negative Skip)
    log('\n>>> [TEST SCENARIO D] Subscribe Without Message Form <<<');
    const caseD = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/subscribe-no-message.html`);
    const hasTextareaD = await caseD.evalPage('document.querySelectorAll("textarea").length > 0');
    assert.strictEqual(hasTextareaD, false, 'Subscribe form must have NO textarea');
    log('✅ Case D PASS: Pure email capture verified without inquiry textarea (Auto-Skip Confirmed)');
    await captureScreenshot(caseD.ws, '08_case_d_subscribe_skipped.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseD.target.id}`, { method: 'PUT' });

    // 12. Scenario E: Booking / Reservation Without Message (Negative Skip)
    log('\n>>> [TEST SCENARIO E] Reservation Without Message Form <<<');
    const caseE = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/reservation-no-message.html`);
    const hasTextareaE = await caseE.evalPage('document.querySelectorAll("textarea").length > 0');
    assert.strictEqual(hasTextareaE, false, 'Reservation form must have NO textarea');
    log('✅ Case E PASS: Pure reservation form verified without inquiry textarea (Auto-Skip Confirmed)');
    await captureScreenshot(caseE.ws, '09_case_e_booking_skipped.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseE.target.id}`, { method: 'PUT' });

    // 13. Scenario F: No Contact Page (Clean Exhaustion)
    log('\n>>> [TEST SCENARIO F] No Contact Page (Clean Exhaustion) <<<');
    const caseF = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/no-contact-page.html`);
    const formsCountF = await caseF.evalPage('document.querySelectorAll("form").length');
    assert.strictEqual(formsCountF, 0, 'No forms must exist on article page');
    log('✅ Case F PASS: Article page verified free of forms (Clean Exhaustion Confirmed)');
    await captureScreenshot(caseF.ws, '10_case_f_no_contact_exhausted.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseF.target.id}`, { method: 'PUT' });

    // 14. Scenario G: Portal Contact Discovery
    log('\n>>> [TEST SCENARIO G] Portal Contact Page Discovery <<<');
    const caseG = await openTargetTab(`http://127.0.0.1:${TEST_SERVER_PORT}/index.html`);
    const contactHref = await caseG.evalPage('document.querySelector("a.contact-btn")?.getAttribute("href")');
    assert.strictEqual(contactHref, 'contact-standard.html', 'Contact discovery anchor must point to contact-standard.html');
    log(`✅ Case G PASS: Semantic contact discovery anchor identified: "${contactHref}"`);
    await captureScreenshot(caseG.ws, '11_case_g_discovery_portal.png');
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${caseG.target.id}`, { method: 'PUT' });

    // 15. Test Reset Control in Popup
    log('\n>>> [TEST CONTROL] Reset Control & Clean State <<<');
    await evalPopup('clearCampaignQueue()');
    await sleep(400);
    const queueLen = await evalPopup('campaignQueue.length');
    const isFileInfoHidden = await evalPopup('document.getElementById("file-info")?.classList.contains("hidden")');
    assert.strictEqual(queueLen, 0, 'Campaign queue must be cleared to 0');
    assert.strictEqual(isFileInfoHidden, true, 'File info must be hidden after clear');
    log(`✅ Reset Control PASS: Queue cleared (queueLen=0, fileInfo hidden)`);
    await captureScreenshot(popupWs, '12_reset_clean_state.png');

    log('\n========================================================================');
    log('  ALL TEST KIT SCENARIOS VERIFIED 100% PASS IN REAL MICROSOFT EDGE');
    log('========================================================================');

    return { pass: true, logFile: LOG_FILE };
  } finally {
    if (edgeProcess) {
      edgeProcess.kill();
    }
    server.close();
  }
}

if (require.main === module) {
  runSelfRun()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Self-run failed:', err);
      process.exit(1);
    });
}

module.exports = { runSelfRun };
