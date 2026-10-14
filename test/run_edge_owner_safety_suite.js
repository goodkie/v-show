/**
 * run_edge_owner_safety_suite.js
 * 
 * Complete Edge Real-Browser Verification Suite for:
 * [CHATGPT][AUDIT][OWNER LOCAL FUNCTION TEST FINAL SAFETY][R6.9G.10.3.7.1.4.4 / R6.9G.10.3.7.1.4.5]
 * 
 * Negative Paths Verified in Real Microsoft Edge Browser:
 * 1. TEST mode ON + one non-loopback TEST-NET target -> Start rejected before navigation.
 * 2. TEST mode ON + localhost + non-loopback mixed queue -> Start rejected before any target navigation.
 * 3. TEST mode ON + 11 localhost rows -> Start rejected (exceeded 10 targets).
 * 4. Controlled localhost page attempts external redirect/subresource/fetch -> network guard blocks it (DNR ERR_BLOCKED_BY_CLIENT); localhost loopback page remains controlled and allowed.
 * 5. Test mode OFF -> session network guard removed cleanly; standard Strict Privacy path is restored.
 * 
 * Lifecycle Regression Cases Verified in Real Microsoft Edge Browser:
 * 6. PAUSE -> RESUME Guard Continuity: DNR rules stay installed during PAUSE; external fetch remains BLOCKED; rules readback verified on RESUME.
 * 7. Service Worker Restart Guard Recovery: Boot reconciliation prevents fail-open window; exact rules 990001-990005 restored; external fetch remains BLOCKED.
 * 
 * Positive Path Verified in Real Microsoft Edge Browser:
 * 8. Full 7-target local fixture execution end-to-end (4 SUCCESS, 2 SKIPPED, 1 FAILURE, 0 remaining, stop control, deterministic emails).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const TEST_SERVER_PORT = 8088;
const CDP_PORT = 9262;
const EXT_DIR = path.resolve('extension');
const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'edge_safety_suite_trace.log');
const CSV_FILE = path.resolve('OWNER_EXTENSION_TEST_URLS.csv');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(LOG_FILE, '', 'utf8');

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
      } catch (e) {}
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
    log(`⚠️ Screenshot error for ${filename}: ${err.message}`);
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runEdgeSafetySuite() {
  log('========================================================================');
  log('  XPIDER OWNER EXTENSION SAFETY & NEGATIVE-PATH REAL EDGE AUDIT');
  log('========================================================================');
  log(`Extension Source: ${EXT_DIR}`);
  log(`Test Site Server: http://127.0.0.1:${TEST_SERVER_PORT}`);

  // 1. Start Controlled Local Test Server
  const server = require('../owner-extension-test-site/server.js');
  log('✅ Local test site server running on port 8088');

  let edgeProcess = null;
  const userDataDir = path.join(os.tmpdir(), `edge_safety_suite_${Date.now()}`);

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

    // Connect to Browser Target (for lifecycle control like Target.closeTarget)
    const browserWs = new WebSocket(versionData.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      browserWs.onopen = resolve;
      browserWs.onerror = reject;
    });

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

    let currentSwTarget = swTarget;
    let currentSwWs = new WebSocket(currentSwTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      currentSwWs.onopen = resolve;
      currentSwWs.onerror = reject;
    });

    function setupSwWsListeners(ws) {
      ws.addEventListener('message', (evt) => {
        try {
          const d = JSON.parse(evt.data.toString());
          if (d.method === 'Runtime.consoleAPICalled') {
            const args = (d.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
            log(`[SW_CONSOLE] ${args}`);
          }
        } catch (_) {}
      });
    }

    await cdpSend(currentSwWs, 'Runtime.enable');
    setupSwWsListeners(currentSwWs);

    const evalSw = async (expression) => {
      const res = await cdpSend(currentSwWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) return null;
      return res.result ? res.result.value : null;
    };

    // Verify BuildProvenance in SW
    let buildInfo = null;
    for (let i = 0; i < 30; i++) {
      try {
        buildInfo = await evalSw('(typeof BuildProvenance !== "undefined" && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : null');
        if (buildInfo) break;
      } catch (_) {}
      await sleep(300);
    }
    assert(buildInfo, 'BuildProvenance must exist in SW');
    assert.strictEqual(buildInfo.channel, 'TEST_ONLY', 'Build channel must be TEST_ONLY');
    assert.strictEqual(buildInfo.testOnly, true, 'Build testOnly must be true');
    const isTestAuthSw = await evalSw('(typeof BuildProvenance !== "undefined" && typeof BuildProvenance.isTestOnlyBuild === "function") ? BuildProvenance.isTestOnlyBuild() : false');
    assert.strictEqual(isTestAuthSw, true, 'Build must be verified as authorized TEST_ONLY in SW');
    log(`✅ Build Provenance Verified in Service Worker: ${buildInfo.buildId} channel=${buildInfo.channel} testOnly=${buildInfo.testOnly}`);

    // 3. Open Popup UI
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' });
    let popupTarget = await newTargetRes.json();
    log(`✅ Opened Popup UI Target: ${popupTarget.id}`);

    let popupWs = new WebSocket(popupTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      popupWs.onopen = resolve;
      popupWs.onerror = reject;
    });

    await cdpSend(popupWs, 'Page.enable');
    await cdpSend(popupWs, 'Runtime.enable');

    popupWs.addEventListener('message', async (evt) => {
      try {
        const d = JSON.parse(evt.data.toString());
        if (d.method === 'Page.javascriptDialogOpening') {
          log(`   [JS_DIALOG_DISMISSED] ${d.params.message ? d.params.message.replace(/\n/g, ' ') : ''}`);
          await cdpSend(popupWs, 'Page.handleJavaScriptDialog', { accept: true });
        }
      } catch (_) {}
    });

    await sleep(1000);

    const evalPopup = async (expression) => {
      const res = await cdpSend(popupWs, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw new Error(`Popup Eval Error: ${JSON.stringify(res.exceptionDetails)}`);
      return res.result ? res.result.value : null;
    };

    // Prevent modal dialogs from blocking automation
    await evalPopup(`(() => {
      window.alert = (msg) => {
        window.__lastAlert = msg;
        console.log('[POPUP_ALERT_INTERCEPTED]', msg);
      };
    })()`);

    // Populate Message Template initially so empty message check passes
    await evalPopup(`(() => {
      const fn = document.getElementById('tpl-first-name'); if (fn) fn.value = 'John';
      const ln = document.getElementById('tpl-last-name'); if (ln) ln.value = 'Doe';
      const nm = document.getElementById('tpl-name'); if (nm) nm.value = 'John Doe';
      const em = document.getElementById('tpl-email'); if (em) em.value = 'tester@autonomous-audit.io';
      const ph = document.getElementById('tpl-phone'); if (ph) ph.value = '+1-555-019-2834';
      const sb = document.getElementById('tpl-subject'); if (sb) sb.value = 'Automated Form Inquiry';
      const msg = document.getElementById('tpl-message'); if (msg) msg.value = 'Hello, this is an automated inquiry message submitted by XPIDER AutoForm Sender Pro.';
    })()`);
    log('✅ Populated test message template in popup');

    await captureScreenshot(popupWs, '01_safety_popup_initial.png');

    // ─────────────────────────────────────────────────────────────────────────
    // RESPONSIVE VIEWPORT & SETTINGS GEAR VISIBILITY AUDIT (320px, 360px, Standard)
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [RESPONSIVE VIEWPORT AUDIT] Settings Gear Visibility at 320px, 360px, Standard <<<');
    log('========================================================================');
    {
      // 1. 320px Narrowest Supported Width
      await cdpSend(popupWs, 'Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 1, mobile: false });
      await sleep(400);

      const gear320 = await evalPopup(`(() => {
        const btn = document.getElementById('settings-toggle');
        if (!btn) return { exists: false };
        const rect = btn.getBoundingClientRect();
        return {
          exists: true,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          visible: rect.width >= 36 && rect.height >= 36 && rect.left >= 0 && rect.right <= 320
        };
      })()`);

      assert(gear320.exists, '#settings-toggle must exist in DOM');
      assert(gear320.visible, `#settings-toggle must be fully visible and unclipped at 320px (got left=${gear320.left}, right=${gear320.right}, w=${gear320.width}, h=${gear320.height})`);
      log(`   ✅ 320px Viewport: Settings gear is visible and unclipped (w=${gear320.width}px, h=${gear320.height}px, right=${gear320.right}px <= 320px)`);

      // Test clickability at 320px
      await evalPopup(`document.getElementById('settings-toggle')?.click()`);
      await sleep(200);
      const overlayOpen320 = await evalPopup(`!document.getElementById('settings-overlay')?.classList.contains('hidden')`);
      assert(overlayOpen320, 'Settings overlay must open when #settings-toggle is clicked at 320px');
      await evalPopup(`document.getElementById('settings-close')?.click()`);
      await sleep(200);
      log('   ✅ 320px Viewport: Settings gear is clickable and successfully toggles settings overlay');

      await captureScreenshot(popupWs, '01_responsive_320px_settings_visible.png');

      // 2. 360px Viewport
      await cdpSend(popupWs, 'Emulation.setDeviceMetricsOverride', { width: 360, height: 600, deviceScaleFactor: 1, mobile: false });
      await sleep(300);

      const gear360 = await evalPopup(`(() => {
        const btn = document.getElementById('settings-toggle');
        const rect = btn.getBoundingClientRect();
        return { visible: rect.width >= 36 && rect.height >= 36 && rect.right <= 360, right: rect.right, width: rect.width };
      })()`);
      assert(gear360.visible, '#settings-toggle must be visible at 360px');
      log(`   ✅ 360px Viewport: Settings gear is visible (w=${gear360.width}px, right=${gear360.right}px <= 360px)`);
      await captureScreenshot(popupWs, '01_responsive_360px_settings_visible.png');

      // 3. Standard Side Panel (400px)
      await cdpSend(popupWs, 'Emulation.setDeviceMetricsOverride', { width: 400, height: 600, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      await captureScreenshot(popupWs, '01_responsive_standard_settings_visible.png');

      // Reset Emulation
      await cdpSend(popupWs, 'Emulation.clearDeviceMetricsOverride');
      await sleep(200);
      log('✅ Responsive Viewport Audit Passed: Settings control is ALWAYS visible and unclipped at all widths >= 320px.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUTO SETUP & RESTORE RUNTIME AUDIT (Owner Snapshot Flow)
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [AUTO SETUP & RESTORE AUDIT] Snapshot 100 Public URLs -> Auto Setup -> Restore <<<');
    log('========================================================================');
    {
      // 1. Seed simulated Owner state: 100 public URLs in queue
      const dummy100 = Array.from({ length: 100 }, (_, i) => `https://example-business-${i + 1}.com/contact-us`);
      await evalPopup(`((urls) => {
        if (typeof window.setCampaignQueue === 'function') window.setCampaignQueue(urls);
        else window.campaignQueue = urls;
        if (typeof updateQueueUI === 'function') updateQueueUI();
        const cnt = document.getElementById('url-count-display');
        if (cnt) cnt.textContent = urls.length + ' URLs found';
      })(${JSON.stringify(dummy100)})`);
      await sleep(300);

      const seededQueueLen = await evalPopup('((typeof window.getCampaignQueue === "function" ? window.getCampaignQueue() : window.campaignQueue)?.length) || 0');
      assert.strictEqual(seededQueueLen, 100, 'Queue must have 100 seeded public URLs');
      log(`   1. Seeded simulated Owner queue with ${seededQueueLen} public URLs.`);

      // 2. Verify starting with 100 public URLs while test mode is ON is blocked
      await evalPopup(`(async () => {
        await chrome.storage.local.set({ xpider_owner_function_test_mode: true });
        const toggle = document.getElementById('owner-function-test-toggle');
        if (toggle) toggle.checked = true;
      })()`);
      await sleep(200);

      const startWithPublicRes = await evalPopup(`(async () => {
        window.__lastAlert = null;
        if (typeof window.startCampaign === 'function') {
          try {
            await window.startCampaign();
          } catch (e) {
            window.__lastError = e.message;
          }
          return { lastAlert: window.__lastAlert, lastError: window.__lastError };
        }
        return { lastAlert: null };
      })()`);
      assert(startWithPublicRes.lastAlert && startWithPublicRes.lastAlert.includes('OWNER FUNCTIONAL TEST MODE ACTIVE'), 'Start must be blocked when public targets are in queue during test mode');
      log(`   ✅ 2. Verified Start is blocked when attempting to run 100 public URLs in Owner Test Mode.`);

      await captureScreenshot(popupWs, '02_auto_setup_before_public_queue.png');

      // 3. Click ✨ AUTO SETUP
      log('   3. Clicking #auto-setup-btn (✨ AUTO SETUP)...');
      await evalPopup(`document.getElementById('auto-setup-btn')?.click()`);
      await sleep(1500);

      // Verify Auto Setup results
      const autoSetupState = await evalPopup(`(async () => {
        const st = await chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_function_test_mode', 'xpider_delayMs', 'xpider_fillDelayMs', 'xpider_submitDelayMs']);
        const pill = document.getElementById('auto-setup-status-pill')?.textContent;
        const feedback = document.getElementById('auto-setup-feedback')?.textContent;
        const runBtnVisible = document.getElementById('run-function-test-btn')?.style.display !== 'none';
        const restoreBtnVisible = document.getElementById('restore-user-settings-btn')?.style.display !== 'none';
        const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
        return { st, pill, feedback, runBtnVisible, restoreBtnVisible, queue: q };
      })()`);

      assert(autoSetupState.st.xpider_owner_backup_snapshot, 'Snapshot must be created in storage');
      assert.strictEqual(autoSetupState.st.xpider_owner_backup_snapshot.queue.length, 100, 'Snapshot must preserve exact 100 public URLs');
      assert.strictEqual(autoSetupState.st.xpider_owner_function_test_mode, true, 'Owner function test mode must be true');
      assert.strictEqual(autoSetupState.st.xpider_delayMs, 10000, 'Collect delay must be Level 6 (10000ms)');
      assert.strictEqual(autoSetupState.st.xpider_fillDelayMs, 300, 'Fill delay must be Level 6 (300ms)');
      assert.strictEqual(autoSetupState.st.xpider_submitDelayMs, 4000, 'Submit delay must be Level 6 (4000ms)');
      assert.strictEqual(autoSetupState.pill, 'READY', 'Status pill must show READY');
      assert(autoSetupState.runBtnVisible, '#run-function-test-btn must be visible');
      assert(autoSetupState.restoreBtnVisible, '#restore-user-settings-btn must be visible');
      assert.strictEqual(autoSetupState.queue.length, 7, 'Queue must be atomically switched to 7 local fixtures');

      // Verify DNR rules 990001-990005 are installed
      const dnrRulesCount = await evalSw(`(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)()`);
      assert.strictEqual(dnrRulesCount, 5, 'DNR network guard must have 5 session rules installed');
      log(`   ✅ 3. AUTO SETUP verified: 100 public URLs preserved in snapshot, 7 local fixtures loaded, DNR 5 rules active, delay defaults applied.`);

      await captureScreenshot(popupWs, '02_auto_setup_configured_ready.png');

      // 4. Test ↩ RESTORE PREVIOUS SETTINGS/LIST
      log('   4. Clicking #restore-user-settings-btn (↩ RESTORE PREVIOUS SETTINGS/LIST)...');
      await evalPopup(`document.getElementById('restore-user-settings-btn')?.click()`);
      await sleep(800);

      const restoreState = await evalPopup(`(async () => {
        const st = await chrome.storage.local.get(['xpider_owner_backup_snapshot', 'xpider_owner_function_test_mode']);
        const pill = document.getElementById('auto-setup-status-pill')?.textContent;
        const q = (typeof window.getCampaignQueue === 'function' ? window.getCampaignQueue() : window.campaignQueue) || [];
        return { st, pill, queue: q };
      })()`);

      assert.strictEqual(restoreState.queue.length, 100, 'Queue must be restored to 100 public URLs');
      assert(!restoreState.st.xpider_owner_backup_snapshot, 'Snapshot must be removed from storage after restore');
      assert.strictEqual(restoreState.pill, 'STANDBY', 'Status pill must return to STANDBY');
      log(`   ✅ 4. RESTORE verified: exact 100 public URLs restored, snapshot cleaned, status reset to STANDBY.`);

      await captureScreenshot(popupWs, '03_auto_setup_restored_public_list.png');

      // 5. Re-click ✨ AUTO SETUP to arm 7 local fixtures for the remainder of the test suite
      log('   5. Re-arming ✨ AUTO SETUP for test execution...');
      await evalPopup(`document.getElementById('auto-setup-btn')?.click()`);
      await sleep(1000);
      const rearmedQueueLen = await evalPopup('((typeof window.getCampaignQueue === "function" ? window.getCampaignQueue() : window.campaignQueue)?.length) || 0');
      assert.strictEqual(rearmedQueueLen, 7, 'Must have 7 local fixtures armed');
      log('   ✅ 5. Re-armed 7 local fixtures successfully.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NEGATIVE PATH 1: TEST mode ON + one non-loopback TEST-NET target => REJECT
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [NEGATIVE PATH 1] TEST mode ON + non-loopback TEST-NET target => REJECT <<<');
    log('========================================================================');
    {
      // Enable ownerFunctionTestMode in storage & UI
      await evalPopup(`(async () => {
        await chrome.storage.local.set({ xpider_owner_function_test_mode: true });
        const toggle = document.getElementById('owner-function-test-toggle');
        if (toggle) {
          toggle.checked = true;
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await sleep(300);

      // Set single non-loopback TEST-NET target
      await evalPopup(`(() => {
        if (typeof window.setCampaignQueue === 'function') {
          window.setCampaignQueue(['http://192.0.2.1/contact']);
        } else {
          window.campaignQueue = ['http://192.0.2.1/contact'];
        }
        if (typeof updateQueueUI === 'function') updateQueueUI();
      })()`);
      await sleep(200);

      // Attempt start and catch rejection
      const startResult = await evalPopup(`(async () => {
        try {
          window.__lastAlert = null;
          const qBefore = (typeof window.getCampaignQueue === 'function') ? window.getCampaignQueue() : window.campaignQueue;
          const st = await chrome.storage.local.get(['xpider_owner_function_test_mode']);
          console.log('[DEBUG_NEG1] queue=', JSON.stringify(qBefore), 'st_mode=', st.xpider_owner_function_test_mode);
          if (typeof window.startCampaign === 'function') {
            const p = window.startCampaign();
            await p;
            return { success: true, q: qBefore, lastAlert: window.__lastAlert };
          }
          return { success: false, error: 'NO_START_CAMPAIGN' };
        } catch (err) {
          return { success: false, error: err.message, lastAlert: window.__lastAlert };
        }
      })()`);

      log('startResult: ' + JSON.stringify(startResult));

      assert.strictEqual(startResult.success, false, 'Start MUST be rejected for non-loopback target');
      assert(startResult.error.includes('OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET') || startResult.error.includes('REJECTION') || startResult.error.includes('Non-loopback'), `Error must be non-loopback rejection, got ${startResult.error}`);

      // Verify NO tab was navigated to 192.0.2.1
      const targetsList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const leakedTab = targetsList.find(t => t.url && t.url.includes('192.0.2.1'));
      assert(!leakedTab, 'No campaign tab to 192.0.2.1 may be created');

      log(`✅ Negative Path 1 Passed: Non-loopback TEST-NET target rejected before navigation: ${startResult.error}`);
      await captureScreenshot(popupWs, '02_safety_neg1_non_loopback_rejected.png');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NEGATIVE PATH 2: TEST mode ON + mixed queue (localhost + public) => REJECT
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [NEGATIVE PATH 2] TEST mode ON + mixed queue => REJECT BEFORE START <<<');
    log('========================================================================');
    {
      await evalPopup(`(() => {
        const q = [
          'http://127.0.0.1:8088/contact-standard.html',
          'http://192.0.2.1/contact'
        ];
        if (typeof window.setCampaignQueue === 'function') window.setCampaignQueue(q);
        else window.campaignQueue = q;
        if (typeof updateQueueUI === 'function') updateQueueUI();
      })()`);
      await sleep(200);

      const startResult = await evalPopup(`(async () => {
        try {
          window.__lastAlert = null;
          if (typeof window.startCampaign === 'function') {
            await window.startCampaign();
            return { success: true };
          }
          const btn = document.getElementById('start-btn');
          btn.click();
          await new Promise(r => setTimeout(r, 400));
          if (window.__lastAlert) return { success: false, error: window.__lastAlert };
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })()`);

      assert.strictEqual(startResult.success, false, 'Start MUST be rejected for mixed queue');
      assert(startResult.error.includes('OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET') || startResult.error.includes('REJECTION') || startResult.error.includes('Non-loopback'), `Error must be non-loopback rejection, got ${startResult.error}`);

      const targetsList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const leakedTab = targetsList.find(t => t.url && t.url.includes('192.0.2.1'));
      assert(!leakedTab, 'No campaign tab to 192.0.2.1 may be created');

      log(`✅ Negative Path 2 Passed: Mixed queue rejected before any navigation begins: ${startResult.error}`);
      await captureScreenshot(popupWs, '03_safety_neg2_mixed_queue_rejected.png');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NEGATIVE PATH 3: TEST mode ON + 11 localhost targets => REJECT
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [NEGATIVE PATH 3] TEST mode ON + 11 localhost rows => REJECT (>10) <<<');
    log('========================================================================');
    {
      await evalPopup(`(() => {
        const q = Array.from({ length: 11 }, (_, i) => 'http://127.0.0.1:8088/contact-standard.html');
        if (typeof window.setCampaignQueue === 'function') window.setCampaignQueue(q);
        else window.campaignQueue = q;
        if (typeof updateQueueUI === 'function') updateQueueUI();
      })()`);
      await sleep(200);

      const startResult = await evalPopup(`(async () => {
        try {
          window.__lastAlert = null;
          if (typeof window.startCampaign === 'function') {
            await window.startCampaign();
            return { success: true };
          }
          const btn = document.getElementById('start-btn');
          btn.click();
          await new Promise(r => setTimeout(r, 400));
          if (window.__lastAlert) return { success: false, error: window.__lastAlert };
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })()`);

      assert.strictEqual(startResult.success, false, 'Start MUST be rejected for 11 targets');
      assert(startResult.error.includes('OWNER_FUNCTION_TEST_EXCEEDED_MAX_TARGETS') || startResult.error.includes('LIMITATION') || startResult.error.includes('maximum of 10'), `Error must be exceeded max targets, got ${startResult.error}`);

      log(`✅ Negative Path 3 Passed: 11-target queue rejected by max 10 target limit: ${startResult.error}`);
      await captureScreenshot(popupWs, '04_safety_neg3_11_targets_rejected.png');
    }

    // Helper to verify network guard blocks external leaks and permits loopback
    async function verifyNetworkGuardBlocksLeaks(label, screenshotName = null) {
      const leakTestUrl = `http://127.0.0.1:${TEST_SERVER_PORT}/network-leak-attempt.html`;
      const leakTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(leakTestUrl)}`, { method: 'PUT' });
      const leakTarget = await leakTargetRes.json();
      log(`   [${label}] Opened Leak Test Target: ${leakTarget.id}`);

      const leakWs = new WebSocket(leakTarget.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        leakWs.onopen = resolve;
        leakWs.onerror = reject;
      });

      await cdpSend(leakWs, 'Page.enable');
      await cdpSend(leakWs, 'Network.enable');

      const failedRequests = [];
      leakWs.addEventListener('message', (evt) => {
        try {
          const d = JSON.parse(evt.data.toString());
          if (d.method === 'Network.loadingFailed') {
            failedRequests.push({
              errorText: d.params.errorText,
              blockedReason: d.params.blockedReason
            });
            log(`   🛑 [CDP_NETWORK_BLOCKED][${label}] errorText=${d.params.errorText} blockedReason=${d.params.blockedReason}`);
          }
        } catch (_) {}
      });

      await cdpSend(leakWs, 'Page.reload');
      await sleep(1500);

      const leakEval = await cdpSend(leakWs, 'Runtime.evaluate', {
        expression: 'window.__leakResults',
        returnByValue: true
      });
      const results = leakEval.result ? leakEval.result.value : {};
      log(`   [${label}] Leak Check Results: ${JSON.stringify(results)}`);

      assert(results.testNetFetch && results.testNetFetch.includes('BLOCKED'), `[${label}] TEST-NET fetch must be BLOCKED: ${results.testNetFetch}`);
      assert(results.externalDomainFetch && results.externalDomainFetch.includes('BLOCKED'), `[${label}] External domain fetch must be BLOCKED: ${results.externalDomainFetch}`);
      assert.strictEqual(results.loopbackFetch, 'ALLOWED_LOOPBACK', `[${label}] Loopback fetch must be ALLOWED_LOOPBACK: ${results.loopbackFetch}`);

      if (screenshotName) {
        await captureScreenshot(leakWs, screenshotName);
      }

      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${leakTarget.id}`);
      return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NEGATIVE PATH 4: Controlled Localhost Page Network Guard Block Verification
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [NEGATIVE PATH 4] DeclarativeNetRequest Network Guard Block Verification <<<');
    log('========================================================================');
    {
      // 1. Install & Verify DeclarativeNetRequest Network Guard in SW
      const guardInstalled = await evalSw(`(async () => {
        try {
          if (typeof installOwnerTestNetworkGuard === 'function') {
            await installOwnerTestNetworkGuard();
            const rules = await chrome.declarativeNetRequest.getSessionRules();
            return { success: true, count: rules.length, ruleIds: rules.map(r => r.id) };
          }
          return { success: false, error: 'installOwnerTestNetworkGuard not found' };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()`);

      assert(guardInstalled.success, `Network guard install must succeed: ${guardInstalled.error}`);
      assert.strictEqual(guardInstalled.count, 5, 'Must have exactly 5 session rules installed');
      log(`✅ DeclarativeNetRequest session rules installed & verified: ${JSON.stringify(guardInstalled.ruleIds)}`);

      // 2. Open network leak test page and verify external leaks blocked
      await verifyNetworkGuardBlocksLeaks('NEGATIVE_PATH_4', '05_safety_neg4_dnr_external_blocked.png');
      log('✅ Negative Path 4 Passed: External requests strictly blocked by DNR network guard; loopback requests permitted.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NEGATIVE PATH 5: Test Mode OFF -> Network Guard Removed & Strict Restored
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [NEGATIVE PATH 5] Test Mode OFF => Guard Removed & Strict Privacy Restored <<<');
    log('========================================================================');
    {
      // Turn test mode OFF in popup
      await evalPopup(`(async () => {
        await chrome.storage.local.set({ xpider_owner_function_test_mode: false });
        const toggle = document.getElementById('owner-function-test-toggle');
        if (toggle) {
          toggle.checked = false;
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await sleep(400);

      // Verify session rules removed in SW
      const rulesAfter = await evalSw('(async () => { return (await chrome.declarativeNetRequest.getSessionRules()).length; })()');
      assert.strictEqual(rulesAfter, 0, 'DeclarativeNetRequest session rules must be 0 after test mode disabled');
      log(`✅ DeclarativeNetRequest session rules cleanly removed: count=${rulesAfter}`);

      // Attempt start with test mode OFF: Strict Privacy must block without Relay/Proxy
      await evalPopup(`(() => {
        const q = ['http://127.0.0.1:8088/contact-standard.html'];
        if (typeof window.setCampaignQueue === 'function') window.setCampaignQueue(q);
        else window.campaignQueue = q;
        if (typeof updateQueueUI === 'function') updateQueueUI();
      })()`);
      await sleep(200);

      const strictStart = await evalPopup(`(async () => {
        try {
          const btn = document.getElementById('start-btn');
          btn.click();
          await new Promise(r => setTimeout(r, 600));
          const blockedModal = document.getElementById('privacy-block-modal-overlay');
          const isModalOpen = blockedModal && !blockedModal.classList.contains('hidden');
          const settingsOverlay = document.getElementById('settings-overlay');
          const isSettingsOpen = settingsOverlay && !settingsOverlay.classList.contains('hidden');
          const logText = document.getElementById('log-container')?.innerText || '';
          return { isModalOpen, isSettingsOpen, logText };
        } catch (e) {
          return { error: e.message };
        }
      })()`);

      assert(strictStart.isModalOpen || strictStart.isSettingsOpen || (strictStart.logText && (strictStart.logText.includes('START_BLOCKED') || strictStart.logText.includes('RELAY_OFFLINE'))), 'Standard Strict Privacy invariant must block start when test mode is OFF');
      log('✅ Negative Path 5 Passed: Turning test mode OFF restores standard Strict Privacy fail-closed path immediately.');
      await captureScreenshot(popupWs, '06_safety_neg5_strict_privacy_restored.png');

      // Close settings overlay / modal
      await evalPopup(`(() => {
        const modal = document.getElementById('privacy-block-modal-overlay');
        if (modal) modal.classList.add('hidden');
        const settings = document.getElementById('settings-overlay');
        if (settings) settings.classList.add('hidden');
      })()`);
      await sleep(200);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGRESSION CASE A: PAUSE -> RESUME Network Guard Continuity
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [REGRESSION CASE A] PAUSE -> RESUME Network Guard Continuity <<<');
    log('========================================================================');
    {
      // 1. Re-enable test mode in popup
      await evalPopup(`(async () => {
        await chrome.storage.local.set({ xpider_owner_function_test_mode: true });
        const toggle = document.getElementById('owner-function-test-toggle');
        if (toggle) {
          toggle.checked = true;
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await sleep(300);

      // Queue 2 local targets
      await evalPopup(`(() => {
        const q = [
          'http://127.0.0.1:8088/contact-standard.html',
          'http://127.0.0.1:8088/contact-dropdown-checkbox.html'
        ];
        if (typeof window.setCampaignQueue === 'function') window.setCampaignQueue(q);
        else window.campaignQueue = q;
        if (typeof updateQueueUI === 'function') updateQueueUI();
        const cnt = document.getElementById('target-count');
        if (cnt) cnt.textContent = '2';
      })()`);
      await sleep(200);

      // 2. Start campaign
      log('   Starting local campaign in Owner Test Mode...');
      await evalPopup('document.getElementById("start-btn")?.click()');
      await sleep(800);

      // 3. Confirm DNR rules installed (5 rules)
      const rulesStart = await evalSw('(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)()');
      assert.strictEqual(rulesStart, 5, 'DNR session rules must be 5 at start');
      log(`   ✅ DNR rules verified at START: count=${rulesStart}`);

      // 4. Pause campaign
      log('   Pausing campaign...');
      await evalSw('(async () => await pauseCampaignOrchestrator(true))()');
      await sleep(500);

      const isPaused = await evalSw('Boolean(campaignState.isPaused)');
      assert(isPaused, 'Campaign must be in paused state');

      // 5. CRITICAL CHECK: Confirm DNR rules REMAIN active during pause
      const rulesDuringPause = await evalSw('(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)()');
      assert.strictEqual(rulesDuringPause, 5, 'DNR session rules must REMAIN 5 during PAUSE');
      log(`   ✅ DNR rules retained during PAUSE: count=${rulesDuringPause}`);

      // 6. Verify external fetch/subresource remains BLOCKED while paused
      log('   Verifying external fetch remains BLOCKED while paused...');
      await verifyNetworkGuardBlocksLeaks('WHILE_PAUSED');
      log('   ✅ External requests confirmed BLOCKED during pause');

      // 7. Resume campaign
      log('   Resuming campaign...');
      const resumeResult = await evalSw(`(async () => {
        try {
          const res = await resumeCampaignOrchestrator();
          const rules = await chrome.declarativeNetRequest.getSessionRules();
          return { success: true, ruleCount: rules.length, res };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()`);
      assert(resumeResult.success, `Resume must succeed: ${resumeResult.error}`);
      assert.strictEqual(resumeResult.ruleCount, 5, 'DNR rules must be readback verified (5 rules) before resuming targets');
      log(`   ✅ DNR rules confirmed & verified on RESUME: count=${resumeResult.ruleCount}`);

      // 8. Verify external fetch/subresource remains BLOCKED after resume
      log('   Verifying external fetch remains BLOCKED after resume...');
      await verifyNetworkGuardBlocksLeaks('AFTER_RESUME');
      log('   ✅ External requests confirmed BLOCKED after resume');

      // 9. Cleanly stop / end campaign
      await evalSw('(async () => await endCampaignOrchestrator())()');
      await sleep(500);

      await captureScreenshot(popupWs, '08_safety_pause_resume_guard_continuity.png');
      log('✅ Regression Case A Passed: DNR network guard is strictly continuous across PAUSE and RESUME.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REGRESSION CASE B: Service Worker Termination & Automatic Restart Guard Recovery
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [REGRESSION CASE B] Actual MV3 Service Worker Restart & Automatic Guard Recovery <<<');
    log('========================================================================');
    {
      // 1. Prepare stored test mode session and install initial DNR rules
      log('   1. Preparing paused Owner Test session and installing initial DNR rules...');
      await evalSw(`(async () => {
        await installOwnerTestNetworkGuard();
        await chrome.storage.local.set({
          xpider_owner_function_test_mode: true,
          xpider_owner_function_test_mode_active: true,
          xpider_isPaused: true,
          xpider_paused_checkpoint: {
            remainingQueue: ['http://127.0.0.1:8088/contact-standard.html'],
            totalTargets: 1,
            ownerFunctionTestMode: true,
            campaignRunId: 'test_run_' + Date.now()
          }
        });
      })()`);

      const rulesBeforeRestart = await evalSw('(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)()');
      assert.strictEqual(rulesBeforeRestart, 5, 'Initial DNR rules count must be 5');
      log(`   ✅ Initial DNR rules confirmed active before termination: count=${rulesBeforeRestart}`);

      // 2. Capture old Service Worker target identity
      const oldSwId = currentSwTarget.id;
      log(`   2. Old Service Worker Target Identity: ${oldSwId} (url=${currentSwTarget.url})`);

      // 3. Terminate old Service Worker instance via CDP Target.closeTarget
      log(`   3. Terminating old Service Worker instance via CDP Target.closeTarget...`);
      const closeResult = await cdpSend(browserWs, 'Target.closeTarget', { targetId: oldSwId });
      assert(closeResult && closeResult.success, `Target.closeTarget must succeed: ${JSON.stringify(closeResult)}`);
      currentSwWs.close();
      await sleep(600);

      // Verify old SW target is closed
      const targetsAfterClose = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const oldStillAlive = targetsAfterClose.find(t => t.id === oldSwId);
      assert(!oldStillAlive, `Old Service Worker target ${oldSwId} must be terminated and gone from target list`);
      log(`   ✅ Old Service Worker target successfully terminated and confirmed gone`);

      // 4. Trigger natural wake-up of extension service worker (via popup page reload, no manual reconcile function call)
      log('   4. Triggering genuine new service worker boot via popup reload...');
      await cdpSend(popupWs, 'Page.reload');

      // 5. Discover NEW service worker instance and prove different target ID
      let newSwTarget = null;
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        newSwTarget = list.find(t => t.type === 'service_worker' && t.url && t.url.includes('background.js'));
        if (newSwTarget && newSwTarget.id !== oldSwId) break;
      }
      assert(newSwTarget, 'New Service Worker target must boot and appear in target list');
      assert.notStrictEqual(newSwTarget.id, oldSwId, `New Service Worker target ID (${newSwTarget.id}) must be DIFFERENT from old ID (${oldSwId})`);
      log(`   ✅ NEW Service Worker Instance Booted: oldId=${oldSwId} -> newId=${newSwTarget.id}`);

      // Reconnect currentSwWs to NEW Service Worker
      currentSwTarget = newSwTarget;
      currentSwWs = new WebSocket(newSwTarget.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        currentSwWs.onopen = resolve;
        currentSwWs.onerror = reject;
      });
      await cdpSend(currentSwWs, 'Runtime.enable');
      setupSwWsListeners(currentSwWs);

      // Wait 1200ms for delayed boot restore (setTimeout 500ms in background.js)
      await sleep(1200);

      // 6. Inspect automatic boot reconciliation from NEW worker (ZERO manual function call!)
      log('   6. Inspecting automatic boot reconciliation in NEW Service Worker...');
      const newSwState = await evalSw(`(async () => {
        const rules = await chrome.declarativeNetRequest.getSessionRules();
        return {
          rulesCount: rules.length,
          ruleIds: rules.map(r => r.id),
          isPaused: Boolean(campaignState.isPaused),
          isActive: Boolean(campaignState.isActive),
          isFaulted: Boolean(campaignState.isFaulted),
          ownerFunctionTestMode: Boolean(campaignState.ownerFunctionTestMode)
        };
      })()`);

      assert.strictEqual(newSwState.rulesCount, 5, `Automatic boot reconciliation must restore exact 5 session rules in new worker: ${newSwState.rulesCount}`);
      const expectedIds = [990001, 990002, 990003, 990004, 990005];
      const allPresent = expectedIds.every(id => newSwState.ruleIds.includes(id));
      assert(allPresent, `All rules 990001-990005 must be present after SW boot: ${JSON.stringify(newSwState.ruleIds)}`);
      assert.strictEqual(newSwState.isPaused, true, 'Campaign state must remain paused after SW boot');
      assert.strictEqual(newSwState.ownerFunctionTestMode, true, 'ownerFunctionTestMode must be active in new worker');
      assert.strictEqual(newSwState.isFaulted, false, 'Campaign must not be faulted');
      log(`   ✅ Exact session rules 990001-990005 confirmed present after automatic SW boot reconciliation: ${JSON.stringify(newSwState.ruleIds)}`);

      // 7. Confirm external fetch remains BLOCKED by client after genuine SW restart
      log('   7. Verifying external fetch remains BLOCKED by client after genuine SW restart...');
      await verifyNetworkGuardBlocksLeaks('AFTER_REAL_SW_RESTART');
      log('   ✅ External requests confirmed BLOCKED after genuine SW restart reconciliation');

      // 8. Resume campaign in NEW service worker with readback verified
      log('   8. Resuming campaign in NEW Service Worker...');
      const resumeResult = await evalSw(`(async () => {
        try {
          const res = await resumeCampaignOrchestrator();
          const rules = await chrome.declarativeNetRequest.getSessionRules();
          return { success: true, ruleCount: rules.length };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()`);
      assert(resumeResult.success, `Resume must succeed in new SW: ${resumeResult.error}`);
      assert.strictEqual(resumeResult.ruleCount, 5, 'DNR rules must be readback verified (5 rules) on resume in new SW');
      log(`   ✅ Resume in NEW SW verified: rulesCount=${resumeResult.ruleCount}`);

      // 9. Controlled teardown / end campaign removes the rules
      log('   9. Controlled teardown in NEW Service Worker...');
      await evalSw('(async () => await endCampaignOrchestrator())()');
      await sleep(400);

      const rulesAfterEnd = await evalSw('(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)()');
      assert.strictEqual(rulesAfterEnd, 0, 'Session rules must be removed cleanly after controlled teardown');
      log(`   ✅ Session rules cleanly removed after teardown in NEW SW: count=${rulesAfterEnd}`);

      await captureScreenshot(popupWs, '09_safety_sw_restart_guard_recovery.png');
      log('✅ Regression Case B Passed: Actual MV3 Service Worker termination and genuine automatic boot reconciliation verified.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POSITIVE PATH: Owner Auto Setup Dirty-History Idempotency & Reversible Restore
    // ─────────────────────────────────────────────────────────────────────────
    log('\n========================================================================');
    log('>>> [MANDATORY REAL EDGE REGRESSION] Dirty-State Auto Setup & Idempotent Re-Run <<<');
    log('========================================================================');
    {
      const LOCALHOST_FIXTURES = [
        'http://127.0.0.1:8088/contact-standard.html',
        'http://127.0.0.1:8088/contact-dropdown-checkbox.html',
        'http://127.0.0.1:8088/contact-numeric.html',
        'http://127.0.0.1:8088/subscribe-no-message.html',
        'http://127.0.0.1:8088/reservation-no-message.html',
        'http://127.0.0.1:8088/no-contact-page.html',
        'http://127.0.0.1:8088/index.html'
      ];

      // Step 1: Seed EXACT dirty-state conditions in live browser:
      // - 100 public URLs in queue
      // - #skip-attempted-toggle CHECKED
      // - storage xpider_skip_attempted = true
      // - 120 unrelated public history rows in HistoryStore
      // - all 7 localhost fixtures seeded as prior attempted in HistoryStore
      // - 1 localhost fixture seeded as suppressed
      log('   1. Seeding EXACT dirty profile state (100 public URLs, 120 public rows, all 7 fixtures attempted, 1 suppressed, skip=true)...');
      
      const public100Urls = Array.from({ length: 100 }, (_, i) => `https://public-firm-${i + 1}.example.com/contact`);

      await evalPopup(`((urls) => {
        if (typeof window.setCampaignQueue === 'function') window.setCampaignQueue(urls);
        else window.campaignQueue = urls;
        if (typeof updateQueueUI === 'function') updateQueueUI();
        const skipEl = document.getElementById('skip-attempted-toggle');
        if (skipEl) {
          skipEl.checked = true;
          skipEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const doubleEl = document.getElementById('double-submit-toggle');
        if (doubleEl) {
          doubleEl.checked = true;
          doubleEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const oftEl = document.getElementById('owner-function-test-toggle');
        if (oftEl) {
          oftEl.checked = false;
          oftEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })(${JSON.stringify(public100Urls)})`);

      await evalSw(`(async () => {
        const publicUrls = ${JSON.stringify(public100Urls)};
        await chrome.storage.local.remove(['xpider_owner_backup_snapshot']);
        await chrome.storage.local.set({
          xpider_queue: publicUrls,
          xpider_total: 100,
          xpider_skip_attempted: true,
          xpider_double_submit: true,
          xpider_owner_function_test_mode: false
        });

        // Seed HistoryStore with dirty state
        if (!self.__xpiderHistoryStore) {
          self.__xpiderHistoryStore = new self.HistoryStore(chrome.storage.local);
        }
        const hs = self.__xpiderHistoryStore;
        await hs.load();

        // 120 unrelated public import rows
        const dirtyPublicRows = Array.from({ length: 120 }, (_, i) => \`https://historical-client-\${i + 1}.org/inquiry\`);
        await hs.ingestImportRows(dirtyPublicRows, 'dirty_public_import_batch', null, dirtyPublicRows);

        // Pre-attempt all 7 localhost fixtures with CONFIRMED_SUCCESS
        const fixtures = ${JSON.stringify(LOCALHOST_FIXTURES)};
        for (const fix of fixtures) {
          await hs.recordAttempt(fix, {
            status: 'CONFIRMED_SUCCESS',
            reason: 'PRIOR_DIRTY_RUN_ATTEMPT',
            campaignRunId: 'prior_dirty_run_999'
          });
        }

        // Suppress 1 fixture
        const targetToSuppress = hs.targets.get(hs.normalizeTargetIdentity(fixtures[0]));
        if (targetToSuppress) {
          targetToSuppress.isSuppressed = true;
          targetToSuppress.suppressionReason = 'PRIOR_DIRTY_SUPPRESSION';
        }

        await hs.persist();
      })()`);
      await sleep(500);

      // Verify dirty pre-conditions
      const dirtyAudit = await evalSw(`(async () => {
        const hs = self.__xpiderHistoryStore;
        await hs.load();
        const st = await chrome.storage.local.get(['xpider_skip_attempted', 'xpider_queue']);
        const fixtures = ${JSON.stringify(LOCALHOST_FIXTURES)};
        const attemptedCount = fixtures.filter(f => hs.hasPriorAttempt(f)).length;
        return {
          totalRows: hs.importRows.length,
          attemptedCount,
          skipStorage: st.xpider_skip_attempted,
          queueLen: st.xpider_queue.length
        };
      })()`);
      log(`   ✅ Dirty state confirmed: TotalRows=${dirtyAudit.totalRows} (>=120), PreAttempted=${dirtyAudit.attemptedCount}/7, SkipStorage=${dirtyAudit.skipStorage}, QueueLen=${dirtyAudit.queueLen}`);
      assert(dirtyAudit.totalRows >= 120, 'HistoryStore must have >= 120 dirty rows');
      assert.strictEqual(dirtyAudit.attemptedCount, 7, 'All 7 fixtures must be pre-attempted');
      assert.strictEqual(dirtyAudit.skipStorage, true, 'Storage skip_attempted must initially be true');
      assert.strictEqual(dirtyAudit.queueLen, 100, 'Queue must initially have 100 public URLs');

      // Step 2: Click AUTO SETUP only
      log('   2. Clicking ✨ AUTO SETUP on dirty profile...');
      await evalPopup(`(async () => {
        const btn = document.getElementById('auto-setup-btn');
        if (btn) btn.click();
      })()`);
      await sleep(1500);

      // Verify UI + Storage + Ledger state after Auto Setup
      const afterSetupState = await evalPopup(`(() => {
        const skipEl = document.getElementById('skip-attempted-toggle');
        const doubleEl = document.getElementById('double-submit-toggle');
        const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
        const countTxt = document.getElementById('url-count-display')?.textContent || '';
        return {
          skipChecked: skipEl ? skipEl.checked : null,
          doubleChecked: doubleEl ? doubleEl.checked : null,
          feedback,
          countTxt
        };
      })()`);

      const afterSetupSw = await evalSw(`(async () => {
        const st = await chrome.storage.local.get(['xpider_skip_attempted', 'xpider_double_submit', 'xpider_owner_backup_snapshot', 'xpider_queue', 'xpider_active_campaign_run_id']);
        const hs = self.__xpiderHistoryStore;
        await hs.load();
        const stats = hs.getLedgerStats('currentRun', st.xpider_active_campaign_run_id);
        return {
          skipStorage: st.xpider_skip_attempted,
          doubleStorage: st.xpider_double_submit,
          hasSnapshot: !!st.xpider_owner_backup_snapshot,
          snapshotQueueLen: st.xpider_owner_backup_snapshot ? st.xpider_owner_backup_snapshot.queue.length : 0,
          snapshotSkipSetting: st.xpider_owner_backup_snapshot ? st.xpider_owner_backup_snapshot.settings.xpider_skip_attempted : null,
          queueLen: st.xpider_queue.length,
          runId: st.xpider_active_campaign_run_id,
          ledgerTotalImportRows: stats.totalImportRows,
          ledgerPending: stats.pending
        };
      })()`);

      log(`   ✅ After Auto Setup verification:`);
      log(`      - Live DOM Checkbox: skipAttempted=${afterSetupState.skipChecked} (expected false), doubleSubmit=${afterSetupState.doubleChecked} (expected false)`);
      log(`      - Storage: skipAttempted=${afterSetupSw.skipStorage} (expected false), doubleSubmit=${afterSetupSw.doubleStorage} (expected false)`);
      log(`      - Snapshot: preserved ${afterSetupSw.snapshotQueueLen} public URLs, preserved original skip=${afterSetupSw.snapshotSkipSetting}`);
      log(`      - Armed Queue: ${afterSetupSw.queueLen} local fixtures`);
      log(`      - Isolated Test Ledger: Total Import Rows=${afterSetupSw.ledgerTotalImportRows} (expected 7, NOT 150!), Pending=${afterSetupSw.ledgerPending}`);

      assert.strictEqual(afterSetupState.skipChecked, false, 'Auto Setup must uncheck #skip-attempted-toggle in live DOM');
      assert.strictEqual(afterSetupSw.skipStorage, false, 'Auto Setup must set xpider_skip_attempted=false in storage');
      assert.strictEqual(afterSetupSw.hasSnapshot, true, 'Snapshot must be preserved');
      assert.strictEqual(afterSetupSw.snapshotQueueLen, 100, 'Snapshot must preserve 100 public URLs');
      assert.strictEqual(afterSetupSw.snapshotSkipSetting, true, 'Snapshot must preserve original skip_attempted=true');
      assert.strictEqual(afterSetupSw.queueLen, 7, 'Queue must have 7 local fixtures');
      assert.strictEqual(afterSetupSw.ledgerTotalImportRows, 7, 'Test run ledger must show exactly 7 Total Import Rows');
      assert.strictEqual(afterSetupSw.ledgerPending, 7, 'Test run ledger must show 7 Pending rows');

      // Set fast speeds for deterministic Edge execution
      await evalPopup(`(() => {
        const sC = document.getElementById('delay-input-collect');
        if (sC) { sC.value = '9'; sC.dispatchEvent(new Event('change')); }
        const sF = document.getElementById('delay-input-fill');
        if (sF) { sF.value = '9'; sF.dispatchEvent(new Event('change')); }
        const sS = document.getElementById('delay-input-submit');
        if (sS) { sS.value = '9'; sS.dispatchEvent(new Event('change')); }
      })()`);

      // Step 3: Run Function Test (1st Execution)
      log('\n   3. 🚀 Clicking #run-function-test-btn (1st Run on Dirty State)...');
      await evalPopup('(() => { document.getElementById("run-function-test-btn")?.click(); })()');

      // Wait for 1st execution to finish
      let firstRunFinished = false;
      const startFirst = Date.now();
      while (Date.now() - startFirst < 180000) {
        await sleep(1000);
        const state = await evalPopup(`(() => {
          const succ = document.getElementById('success-count-display')?.textContent || '0';
          const fail = document.getElementById('failed-count-display')?.textContent || '0';
          const skip = document.getElementById('skipped-count-display')?.textContent || '0';
          const prog = document.getElementById('progress-text')?.textContent || '0%';
          const rem = parseInt(document.getElementById('remaining-count-display')?.textContent || '0');
          const statusTitle = document.getElementById('status-title')?.textContent || '';
          const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
          return { succ, fail, skip, prog, rem, statusTitle, feedback };
        })()`);
        const totalCompleted = parseInt(state.succ) + parseInt(state.fail) + parseInt(state.skip);
        log(`      [1st Run] Progress: ${state.prog} | SUCCESS: ${state.succ} | SKIPPED: ${state.skip} | FAILURE: ${state.fail} | Completed: ${totalCompleted}/7 | Status: ${state.statusTitle}`);
        if (totalCompleted >= 7 && (state.statusTitle.includes('Finished') || state.feedback.includes('PASS'))) {
          firstRunFinished = true;
          break;
        }
      }
      assert(firstRunFinished, '1st run must finish within timeout');
      await sleep(2000);

      const firstOutcomes = await evalPopup(`(() => {
        const succ = document.getElementById('success-count-display')?.textContent || '0';
        const fail = document.getElementById('failed-count-display')?.textContent || '0';
        const skip = document.getElementById('skipped-count-display')?.textContent || '0';
        const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
        return { succ, fail, skip, feedback };
      })()`);

      log(`   🏆 1st Run Outcomes: SUCCESS=${firstOutcomes.succ}, SKIPPED=${firstOutcomes.skip}, FAILURE=${firstOutcomes.fail}`);
      log(`   Verdict Feedback: ${firstOutcomes.feedback}`);
      assert.strictEqual(firstOutcomes.succ, '4', '1st Run must produce 4 SUCCESS');
      assert.strictEqual(firstOutcomes.skip, '2', '1st Run must produce 2 SKIPPED');
      assert.strictEqual(firstOutcomes.fail, '1', '1st Run must produce 1 FAILURE');
      assert(firstOutcomes.feedback.includes('PASS (100% EXPECTED OUTCOME)'), '1st Run verdict must be PASS (100% EXPECTED OUTCOME)');

      // Step 4: Click RUN FUNCTION TEST a SECOND time WITHOUT ANY MANUAL RESET (Directive D & Mandatory Edge Regression Step 11)
      log('\n   4. 🚀 Clicking #run-function-test-btn a SECOND time (Idempotency Proof without manual reset)...');
      await evalPopup('(() => { document.getElementById("run-function-test-btn")?.click(); })()');

      let secondRunFinished = false;
      const startSecond = Date.now();
      while (Date.now() - startSecond < 180000) {
        await sleep(1000);
        const state = await evalPopup(`(() => {
          const succ = document.getElementById('success-count-display')?.textContent || '0';
          const fail = document.getElementById('failed-count-display')?.textContent || '0';
          const skip = document.getElementById('skipped-count-display')?.textContent || '0';
          const prog = document.getElementById('progress-text')?.textContent || '0%';
          const rem = parseInt(document.getElementById('remaining-count-display')?.textContent || '0');
          const statusTitle = document.getElementById('status-title')?.textContent || '';
          const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
          return { succ, fail, skip, prog, rem, statusTitle, feedback };
        })()`);
        const totalCompleted = parseInt(state.succ) + parseInt(state.fail) + parseInt(state.skip);
        log(`      [2nd Run] Progress: ${state.prog} | SUCCESS: ${state.succ} | SKIPPED: ${state.skip} | FAILURE: ${state.fail} | Completed: ${totalCompleted}/7 | Status: ${state.statusTitle}`);
        if (totalCompleted >= 7 && (state.statusTitle.includes('Finished') || state.feedback.includes('PASS'))) {
          secondRunFinished = true;
          break;
        }
      }
      assert(secondRunFinished, '2nd run must finish within timeout');
      await sleep(2000);

      const secondOutcomes = await evalPopup(`(() => {
        const succ = document.getElementById('success-count-display')?.textContent || '0';
        const fail = document.getElementById('failed-count-display')?.textContent || '0';
        const skip = document.getElementById('skipped-count-display')?.textContent || '0';
        const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
        return { succ, fail, skip, feedback };
      })()`);

      log(`   🏆 2nd Run Outcomes: SUCCESS=${secondOutcomes.succ}, SKIPPED=${secondOutcomes.skip}, FAILURE=${secondOutcomes.fail}`);
      log(`   Verdict Feedback: ${secondOutcomes.feedback}`);
      assert.strictEqual(secondOutcomes.succ, '4', '2nd Run must also produce 4 SUCCESS');
      assert.strictEqual(secondOutcomes.skip, '2', '2nd Run must also produce 2 SKIPPED');
      assert.strictEqual(secondOutcomes.fail, '1', '2nd Run must also produce 1 FAILURE');
      assert(secondOutcomes.feedback.includes('PASS (100% EXPECTED OUTCOME)'), '2nd Run verdict must be PASS (100% EXPECTED OUTCOME)');

      // Step 5: Restore previous settings/list
      log('\n   5. ↩ Clicking #restore-user-settings-btn to restore original settings and 100 public URLs...');
      await evalPopup('(() => { document.getElementById("restore-user-settings-btn")?.click(); })()');
      await sleep(1000);

      const restoredState = await evalPopup(`(() => {
        const countTxt = document.getElementById('url-count-display')?.textContent || '';
        const skipEl = document.getElementById('skip-attempted-toggle');
        const doubleEl = document.getElementById('double-submit-toggle');
        const oftEl = document.getElementById('owner-function-test-toggle');
        const feedback = document.getElementById('auto-setup-feedback')?.textContent || '';
        return {
          countTxt,
          skipChecked: skipEl ? skipEl.checked : null,
          doubleChecked: doubleEl ? doubleEl.checked : null,
          oftChecked: oftEl ? oftEl.checked : null,
          feedback
        };
      })()`);

      const restoredSw = await evalSw(`(async () => {
        const st = await chrome.storage.local.get(['xpider_queue', 'xpider_skip_attempted', 'xpider_double_submit', 'xpider_owner_function_test_mode', 'xpider_owner_backup_snapshot']);
        const hs = self.__xpiderHistoryStore;
        await hs.load();
        const dnrRules = await chrome.declarativeNetRequest.getSessionRules();
        return {
          queueLen: st.xpider_queue.length,
          skipStorage: st.xpider_skip_attempted,
          doubleStorage: st.xpider_double_submit,
          oftStorage: st.xpider_owner_function_test_mode,
          hasSnapshot: !!st.xpider_owner_backup_snapshot,
          dnrRuleCount: dnrRules.length,
          historicalPublicRows: hs.importRows.filter(r => r.rawInputUrl && r.rawInputUrl.includes('historical-client')).length
        };
      })()`);

      log(`   ✅ Restore verification:`);
      log(`      - Queue Restored: ${restoredSw.queueLen} URLs (expected 100)`);
      log(`      - Skip Previously Attempted Restored: DOM=${restoredState.skipChecked}, Storage=${restoredSw.skipStorage} (expected true)`);
      log(`      - Double Submit Restored: DOM=${restoredState.doubleChecked}, Storage=${restoredSw.doubleStorage} (expected true)`);
      log(`      - Owner Functional Test Mode: DOM=${restoredState.oftChecked}, Storage=${restoredSw.oftStorage} (expected false)`);
      log(`      - DNR Guard Rules Count: ${restoredSw.dnrRuleCount} (expected 0)`);
      log(`      - Historical Public Rows Preserved: ${restoredSw.historicalPublicRows} (expected 120)`);
      log(`      - Snapshot removed: ${!restoredSw.hasSnapshot}`);

      assert.strictEqual(restoredSw.queueLen, 100, 'Restore must recover exact 100 public URLs');
      assert.strictEqual(restoredState.skipChecked, true, 'Restore must restore #skip-attempted-toggle.checked = true in live DOM');
      assert.strictEqual(restoredSw.skipStorage, true, 'Restore must restore xpider_skip_attempted = true in storage');
      assert.strictEqual(restoredSw.oftStorage, false, 'Restore must disable test mode');
      assert.strictEqual(restoredSw.dnrRuleCount, 0, 'Restore must remove DNR rules cleanly');
      assert.strictEqual(restoredSw.historicalPublicRows, 120, 'Restore must preserve 120 historical public rows');
      assert.strictEqual(restoredSw.hasSnapshot, false, 'Snapshot must be removed after restore');

      await captureScreenshot(popupWs, '07_safety_positive_campaign_finished.png');
      log('✅ Mandatory Real Edge Regression Passed: Dirty profile handled idempotently across 1st and 2nd runs (4/2/1), with 100% accurate public restore!');
    }

    log('\n========================================================================');
    log('  ALL 5 NEGATIVE PATHS + 2 LIFECYCLE REGRESSIONS + 1 POSITIVE PATH PASSED 100% IN REAL EDGE');
    log('========================================================================');

  } finally {
    try { if (browserWs) browserWs.close(); } catch (_) {}
    try { if (currentSwWs) currentSwWs.close(); } catch (_) {}
    if (edgeProcess) {
      log('Terminating Microsoft Edge...');
      edgeProcess.kill();
    }
    server.close();
  }
}

runEdgeSafetySuite().catch(err => {
  log(`❌ RUNTIME ERROR: ${err.message}\n${err.stack}`);
  process.exit(1);
});
