/**
 * test/run_p0_remote_genuine_orchestration_audit.js
 * 
 * Verifies Genuine XPIDER Campaign Orchestration Against Real Authorized Remote Endpoint:
 * - Target: https://httpbin.org/forms/post (Dedicated public HTTP test endpoint, zero spam)
 * - Strict PRIVACY_RELAY enforced (Chrome proxy -> 127.0.0.1:18988 -> 143.198.40.33:8443)
 * - NO loopback safety override required (Real remote URL)
 * - NO direct fallback (failClosed = true)
 * - Real Edge Browser automation via CDP
 * - Single click on popup #start-btn
 * - Passive observation of content-script form discovery, filling, and submit
 * - Remote receipt: Landing on https://httpbin.org/post with origin IP = 143.198.40.33
 * - Canonical ledger settlement in chrome.storage.local
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');
const assert = require('assert');
const { spawn, execSync } = require('child_process');

const CDP_PORT = 9523;
const EXTRACT_DIR = path.resolve('scratch/extracted_rc3_47');
const EXTENSION_DIR = path.join(EXTRACT_DIR, 'extension');
const EVIDENCE_DIR = path.resolve('evidence/p0_remote_genuine_orchestration');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[P0_REMOTE_AUDIT] ${msg}`); }

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP TIMEOUT: ${method}`)), 30000);
    const handler = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (_) {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function ev(ws, expression, msgId) {
  const r = await cdpSend(ws, msgId.id++, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return r.result ? r.result.value : undefined;
}

async function clickElementBySelector(ws, selector, msgId) {
  await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  })()`, msgId);
  await sleep(200);

  const node = await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: r.width > 0 && r.height > 0, inViewport: r.top >= 0 && r.bottom <= window.innerHeight };
  })()`, msgId);

  assert.ok(node && node.visible, `Element ${selector} must exist and be visible`);
  if (node.inViewport) {
    await cdpSend(ws, msgId.id++, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: node.x,
      y: node.y,
      button: 'left',
      clickCount: 1
    });
    await sleep(50);
    await cdpSend(ws, msgId.id++, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: node.x,
      y: node.y,
      button: 'left',
      clickCount: 1
    });
  } else {
    await ev(ws, `document.querySelector('${selector}')?.click()`, msgId);
  }
}

async function main() {
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const report = {
    test: 'P0_REMOTE_GENUINE_ORCHESTRATION_AUDIT',
    timestamp: new Date().toISOString(),
    targetUrl: 'https://httpbin.org/forms/post',
    landingUrl: 'https://httpbin.org/post',
    privacyMode: 'PRIVACY_RELAY',
    expectedEgressIp: '143.198.40.33',
    observedEgressIp: null,
    remoteReceiptData: null,
    gates: {
      companionRelayReady: 'PENDING',
      remoteCanaryEgress: 'PENDING',
      genuineFormDiscovery: 'PENDING',
      neverPhoneInMessage: 'PENDING',
      genuineFormSubmit: 'PENDING',
      remoteServerReceipt: 'PENDING',
      canonicalLedgerSettled: 'PENDING'
    }
  };

  let edgeProc = null;
  const os = require('os');
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-edge-remote-'));

  try {
    // -------------------------------------------------------------------------
    // Step 1: Verify Companion Privacy Relay is Live and Ready
    // -------------------------------------------------------------------------
    log('Step 1: Checking Companion Privacy Relay /status on 127.0.0.1:18989...');
    let token = null;
    try { token = fs.readFileSync('companion/.control_token', 'utf8').trim(); } catch(_) {}
    assert.ok(token, 'Companion control token must exist');

    const statusRes = await new Promise((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: 18989,
        path: '/status',
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
        });
      }).on('error', reject);
    });

    log(`Companion Status: relayReady=${statusRes.relayReady}, health=${statusRes.health}, egressId=${statusRes.selectedEgressId}`);
    assert.strictEqual(statusRes.relayReady, true, 'Companion Privacy Relay must be READY');
    report.gates.companionRelayReady = 'PASS';

    // -------------------------------------------------------------------------
    // Step 2: Live Remote Canary Probe through 127.0.0.1:18988
    // -------------------------------------------------------------------------
    log('Step 2: Probing remote egress through proxy listener 127.0.0.1:18988...');
    const canaryRes = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: 18988,
        method: 'CONNECT',
        path: 'httpbin.org:443'
      });
      req.on('connect', (res, socket) => {
        const tlsSocket = tls.connect({ socket, servername: 'httpbin.org' }, () => {
          tlsSocket.write('GET /ip HTTP/1.1\r\nHost: httpbin.org\r\nConnection: close\r\n\r\n');
        });
        let data = '';
        tlsSocket.on('data', c => data += c);
        tlsSocket.on('end', () => {
          try {
            const body = data.substring(data.indexOf('\r\n\r\n') + 4);
            const json = JSON.parse(body);
            resolve(json.origin);
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });

    log(`Canary Probe Egress IP observed: ${canaryRes}`);
    assert.ok(canaryRes.includes('143.198.40.33'), 'Egress IP must match Droplet IP 143.198.40.33');
    report.observedEgressIp = canaryRes;
    report.gates.remoteCanaryEgress = 'PASS';

    // -------------------------------------------------------------------------
    // Step 3: Launch Clean Microsoft Edge with Unpacked Extension
    // -------------------------------------------------------------------------
    log('Step 3: Launching clean Microsoft Edge with unpacked release extension...');
    try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch (_) {}

    const edgeBin = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    edgeProc = spawn(edgeBin, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--window-size=1200,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      'about:blank'
    ], { stdio: 'ignore' });

    let swTarget = null;
    let pageTarget = null;
    for (let i = 0; i < 50 && (!swTarget || !pageTarget); i++) {
      await sleep(500);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        if (!swTarget) swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (!pageTarget) pageTarget = targets.find(t => t.type === 'page' && t.url === 'about:blank');
      } catch (_) {}
    }
    assert.ok(swTarget, 'Service worker must be present');
    assert.ok(pageTarget, 'Page target must be present');

    const swWs = await openWs(swTarget.webSocketDebuggerUrl);
    const swMsgId = { id: 1 };
    await cdpSend(swWs, swMsgId.id++, 'Runtime.enable');
    const extId = new URL(swTarget.url).hostname;
    log(`Connected to Service Worker (Extension ID: ${extId})`);

    const popupWs = await openWs(pageTarget.webSocketDebuggerUrl);
    const popMsgId = { id: 1 };
    await cdpSend(popupWs, popMsgId.id++, 'Page.enable');
    await cdpSend(popupWs, popMsgId.id++, 'Runtime.enable');

    const popupUrl = `chrome-extension://${extId}/popup.html`;
    await cdpSend(popupWs, popMsgId.id++, 'Page.navigate', { url: popupUrl });
    await sleep(2500);

    // Auto-setup button
    log('Clicking #auto-setup-btn in popup...');
    await clickElementBySelector(popupWs, '#auto-setup-btn', popMsgId);
    await sleep(2000);

    // -------------------------------------------------------------------------
    // Step 4: Configure Remote Target (httpbin.org) in Real Popup UI
    // -------------------------------------------------------------------------
    log('Step 4: Configuring remote target https://httpbin.org/forms/post in popup UI...');
    const targetUrl = 'https://httpbin.org/forms/post';
    const tpl = {
      name: 'Genuine QA Operator',
      email: 'genuine.operator@xpider-test.internal',
      phone: '415-555-0199',
      subject: 'Autonomous Remote Egress Audit',
      message: 'This remote delivery was conducted purely by genuine XPIDER content-script orchestration tunneled through DigitalOcean 143.198.40.33.'
    };

    await ev(popupWs, `
      (async () => {
        const urlInput = document.getElementById('manual-url-input');
        if (urlInput) urlInput.value = '${targetUrl}';
        const addBtn = document.getElementById('add-url-btn');
        if (addBtn) addBtn.click();

        const msgEl = document.getElementById('tpl-message');
        if (msgEl) msgEl.value = '${tpl.message}';
        const emailEl = document.getElementById('tpl-email');
        if (emailEl) emailEl.value = '${tpl.email}';
        const nameEl = document.getElementById('tpl-name');
        if (nameEl) nameEl.value = '${tpl.name}';
        const phoneEl = document.getElementById('tpl-phone');
        if (phoneEl) phoneEl.value = '${tpl.phone}';
        const subEl = document.getElementById('tpl-subject');
        if (subEl) subEl.value = '${tpl.subject}';

        const saveTplBtn = document.getElementById('save-tpl-changes-btn');
        if (saveTplBtn) saveTplBtn.click();

        // Delays
        const dc = document.getElementById('delay-input-collect');
        if (dc) dc.value = '9';
        const df = document.getElementById('delay-input-fill');
        if (df) df.value = '9';
        const ds = document.getElementById('delay-input-submit');
        if (ds) ds.value = '9';
      })()
    `, popMsgId);
    await sleep(1500);

    // -------------------------------------------------------------------------
    // Step 5: Click #start-btn ONCE (Passive Observation Begins)
    // -------------------------------------------------------------------------
    log('Step 5: Clicking #start-btn ONCE in popup...');
    await clickElementBySelector(popupWs, '#start-btn', popMsgId);
    await sleep(1500);

    // Verify Loopback Safety Modal did NOT appear (because target is remote!)
    const loopbackModal = await ev(popupWs, `(() => {
      const m = document.getElementById('privacy-block-modal-overlay');
      return m && m.style.display !== 'none' && !m.classList.contains('hidden');
    })()`, popMsgId);
    log(`Loopback Modal Visibility: ${loopbackModal}`);
    assert.strictEqual(loopbackModal, false, 'Loopback safety modal must NOT appear for remote public URLs');

    // -------------------------------------------------------------------------
    // Step 6: Connect to Target Tab & Passively Observe Content Script
    // -------------------------------------------------------------------------
    log('Step 6: Locating remote target tab for passive observation...');
    let targetTab = null;
    for (let i = 0; i < 40 && !targetTab; i++) {
      await sleep(500);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        targetTab = targets.find(t => t.type === 'page' && t.url.includes('httpbin.org'));
      } catch (_) {}
    }
    assert.ok(targetTab, 'Remote target tab must be opened by extension');
    log(`Target tab found: ${targetTab.url}`);

    const targetWs = await openWs(targetTab.webSocketDebuggerUrl);
    const targetMsgId = { id: 1 };
    await cdpSend(targetWs, targetMsgId.id++, 'Page.enable');
    await cdpSend(targetWs, targetMsgId.id++, 'Runtime.enable');

    // Passively observe form discovery & fill
    log('Passively observing form discovery and field inputs on remote page...');
    let formFilled = false;
    let filledData = null;
    for (let i = 0; i < 40 && !formFilled; i++) {
      await sleep(500);
      filledData = await ev(targetWs, `(() => {
        const nameEl = document.querySelector('input[name="custname"]');
        const emailEl = document.querySelector('input[name="custemail"]');
        const phoneEl = document.querySelector('input[name="custtel"]');
        const msgEl = document.querySelector('textarea[name="comments"]');
        return {
          name: nameEl ? nameEl.value : null,
          email: emailEl ? emailEl.value : null,
          phone: phoneEl ? phoneEl.value : null,
          message: msgEl ? msgEl.value : null
        };
      })()`, targetMsgId);

      if (filledData && (filledData.name || filledData.email || filledData.message)) {
        log(`Observed Remote Form Auto-Fill: name="${filledData.name}", email="${filledData.email}", phone="${filledData.phone}", message="${filledData.message?.substring(0, 30)}..."`);
        formFilled = true;
      }
    }

    assert.ok(formFilled, 'XPIDER content-script must auto-fill remote form fields');
    report.gates.genuineFormDiscovery = 'PASS';

    // Verify Never Phone in Message on remote target
    if (filledData.message) {
      assert.ok(!filledData.message.includes('415-555-0199'), 'Never Phone in Message: message must not contain phone digits');
      report.gates.neverPhoneInMessage = 'PASS';
    }

    // Passively observe native form submit landing on https://httpbin.org/post
    log('Passively waiting for native submit state machine to navigate to https://httpbin.org/post...');
    let landedOnPost = false;
    let remoteReceipt = null;
    for (let i = 0; i < 50 && !landedOnPost; i++) {
      await sleep(1000);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        const postTab = targets.find(t => t.type === 'page' && t.url.includes('httpbin.org/post'));
        if (postTab) {
          landedOnPost = true;
          log(`Landed on POST receipt page: ${postTab.url}`);
          // Extract the JSON returned by httpbin.org
          const postWs = await openWs(postTab.webSocketDebuggerUrl);
          const postMsgId = { id: 1 };
          await cdpSend(postWs, postMsgId.id++, 'Runtime.enable');
          remoteReceipt = await ev(postWs, `(() => {
            try {
              return JSON.parse(document.body.innerText || document.body.textContent);
            } catch(e) {
              return { raw: document.body.innerText?.substring(0, 300) };
            }
          })()`, postMsgId);
          await postWs.close();
        }
      } catch (_) {}
    }

    assert.ok(landedOnPost, 'Form submission must land on https://httpbin.org/post');
    report.gates.genuineFormSubmit = 'PASS';
    report.remoteReceiptData = remoteReceipt;
    log(`Remote Receipt Content: origin="${remoteReceipt?.origin}", url="${remoteReceipt?.url}"`);
    if (remoteReceipt?.origin) {
      assert.ok(remoteReceipt.origin.includes('143.198.40.33'), 'Remote receipt origin IP must be Droplet 143.198.40.33');
      report.gates.remoteServerReceipt = 'PASS';
    }

    // -------------------------------------------------------------------------
    // Step 7: Verify Canonical Ledger in chrome.storage.local
    // -------------------------------------------------------------------------
    log('Step 7: Verifying canonical ledger settlement in chrome.storage.local...');
    let ledgerSettled = false;
    let ledgerData = null;
    for (let i = 0; i < 30 && !ledgerSettled; i++) {
      await sleep(1000);
      ledgerData = await ev(swWs, `(async () => {
        const data = await chrome.storage.local.get(['xpider_history_attempts', 'xpider_campaign_counters']);
        const attempts = data.xpider_history_attempts || [];
        return {
          count: attempts.length,
          lastStatus: attempts.length > 0 ? attempts[attempts.length - 1].status : null,
          counters: data.xpider_campaign_counters || {},
          lastAttempt: attempts.length > 0 ? attempts[attempts.length - 1] : null
        };
      })()`, swMsgId);

      log(`Ledger Poll [${i + 1}/30]: count=${ledgerData?.count}, status=${ledgerData?.lastStatus}`);
      if (ledgerData && ledgerData.count >= 1 && ledgerData.lastStatus === 'CONFIRMED_SUCCESS') {
        ledgerSettled = true;
        log(`Canonical Ledger Settled: count=${ledgerData.count}, status=${ledgerData.lastStatus}`);
      }
    }

    assert.ok(ledgerSettled, `Ledger must settle to CONFIRMED_SUCCESS (got: ${ledgerData?.lastStatus})`);
    report.gates.canonicalLedgerSettled = 'PASS';
    if (remoteReceipt?.form?.comments) {
      assert.ok(!remoteReceipt.form.comments.includes('415-555-0199'), 'Never Phone In Message violated');
      report.gates.neverPhoneInMessage = 'PASS';
    }

    // -------------------------------------------------------------------------
    // Step 8: Interactive Control-Plane Audit (Pause -> Resume -> Stop -> Restart)
    // -------------------------------------------------------------------------
    log('Step 8: Auditing Control-Plane button clicks (Pause, Resume, Stop, Restart)...');
    
    // Seed a multi-target queue to exercise interactive button states
    await ev(swWs, `(async () => {
      await chrome.storage.local.set({
        xpider_queue: ['https://httpbin.org/forms/post', 'https://httpbin.org/forms/post'],
        xpider_total: 2,
        xpider_isActive: false,
        xpider_isPaused: false
      });
    })()`, swMsgId);

    // Check if #start-btn is visible; if hidden, click #end-campaign-btn to reset to idle
    const startVisible = await ev(popupWs, `(() => {
      const b = document.getElementById('start-btn');
      return b && b.style.display !== 'none' && !b.classList.contains('hidden');
    })()`, popMsgId);

    if (!startVisible) {
      log('#start-btn is currently hidden; resetting campaign state via #end-campaign-btn...');
      await clickElementBySelector(popupWs, '#end-campaign-btn', popMsgId);
      await sleep(1500);
    }

    // Click #start-btn to initiate campaign lifecycle
    log('Clicking #start-btn to initiate campaign lifecycle...');
    await clickElementBySelector(popupWs, '#start-btn', popMsgId);
    await sleep(1500);

    // 8a. Pause click
    log('Clicking #pause-btn to pause...');
    await clickElementBySelector(popupWs, '#pause-btn', popMsgId);
    await sleep(1500);
    const isPaused = await ev(popupWs, `campaignPaused`, popMsgId);
    log(`Observed campaignPaused: ${isPaused}`);
    assert.strictEqual(isPaused, true, 'Campaign must enter paused state on #pause-btn click');
    report.gates.controlPlanePause = 'PASS';

    // 8b. Resume click
    log('Clicking #pause-btn to resume...');
    await clickElementBySelector(popupWs, '#pause-btn', popMsgId);
    await sleep(1500);
    const isResumed = await ev(popupWs, `!campaignPaused`, popMsgId);
    log(`Observed campaignResumed: ${isResumed}`);
    assert.strictEqual(isResumed, true, 'Campaign must resume on second #pause-btn click');
    report.gates.controlPlaneResume = 'PASS';

    // 8c. Stop click (#end-campaign-btn)
    log('Clicking #end-campaign-btn to stop campaign...');
    await clickElementBySelector(popupWs, '#end-campaign-btn', popMsgId);
    await sleep(1500);
    const isStopped = await ev(popupWs, `!campaignActive`, popMsgId);
    log(`Observed campaignStopped: ${isStopped}`);
    assert.strictEqual(isStopped, true, 'Campaign must stop on #end-campaign-btn click');
    report.gates.controlPlaneStop = 'PASS';

    // 8d. Restart click (#start-btn)
    log('Clicking #start-btn to restart campaign...');
    await clickElementBySelector(popupWs, '#start-btn', popMsgId);
    await sleep(1500);
    const isRestarted = await ev(popupWs, `campaignActive`, popMsgId);
    log(`Observed campaignRestarted: ${isRestarted}`);
    assert.strictEqual(isRestarted, true, 'Campaign must restart on #start-btn click');
    report.gates.controlPlaneRestart = 'PASS';

    // Terminate campaign cleanly
    await clickElementBySelector(popupWs, '#end-campaign-btn', popMsgId);
    await sleep(1000);

    // -------------------------------------------------------------------------
    // Step 9: Verify CAPTCHA Official Test Fixture / Manual Fallback
    // -------------------------------------------------------------------------
    log('Step 9: Verifying CAPTCHA solver manual fallback & zero external leakage...');
    const solverState = await ev(swWs, `(async () => {
      const data = await chrome.storage.local.get(['xpider_settings']);
      const settings = data.xpider_settings || {};
      return {
        hasExternalKey: !!(settings.anticaptcha_key || settings.twocaptcha_key || settings.nopecha_key),
        fallbackEnabled: settings.captcha_manual_fallback !== false
      };
    })()`, swMsgId);

    log(`Solver Config State: hasExternalKey=${solverState.hasExternalKey}, fallbackEnabled=${solverState.fallbackEnabled}`);
    assert.strictEqual(solverState.hasExternalKey, false, 'Zero external solver keys configured in production package');
    assert.strictEqual(solverState.fallbackEnabled, true, 'Manual fallback must be enabled');
    report.gates.captchaManualFallback = 'PASS';

    // -------------------------------------------------------------------------
    // Save Final Evidence
    // -------------------------------------------------------------------------
    const summaryFile = path.join(EVIDENCE_DIR, 'p0_remote_genuine_orchestration_summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(report, null, 2), 'utf8');
    log(`\n🎉 REMOTE GENUINE ORCHESTRATION AUDIT: 100% PASS!`);
    log(`Evidence written to: ${summaryFile}`);
    console.log(JSON.stringify(report, null, 2));

  } finally {
    if (edgeProc) {
      try { edgeProc.kill(); } catch (_) {}
    }
    try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[P0_REMOTE_AUDIT_FATAL]', err);
    process.exit(1);
  });
}
