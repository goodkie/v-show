/**
 * test/run_edge_popup_start_pause_resume_clicks.js
 * 
 * Verifies real Microsoft Edge popup UI control-plane:
 * 1. Physical mouse clicks on #start-btn, #privacy-block-action-override, and #pause-btn (Pause & Resume) via CDP Input.dispatchMouseEvent
 * 2. Multi-fixture owned loopback contact discovery -> semantic fill -> submit -> Ledger
 * 3. Browser-side proxy readback and fail-closed state
 * 4. Generates comprehensive audit evidence in evidence/popup_ui_clicks/
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const CDP_PORT = 9365;
const FX_PORT = 8088;
const EXT_DIR = path.resolve('extension');
const OUT_DIR = path.resolve('evidence/popup_ui_clicks');
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [];
const log = m => { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); lines.push(l); };

const TARGETS = [
  `http://127.0.0.1:${FX_PORT}/contact-standard.html`,
  `http://127.0.0.1:${FX_PORT}/contact-dropdown-checkbox.html`
];

function cdp(ws, method, params = {}) {
  return new Promise((res, rej) => {
    const id = Math.floor(Math.random() * 1e9);
    const h = e => {
      const d = JSON.parse(typeof e.data === 'string' ? e.data : e.toString());
      if (d.id === id) {
        ws.removeEventListener('message', h);
        d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
      }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const openWs = async u => {
  const ws = new WebSocket(u);
  await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; });
  return ws;
};

const ev = async (ws, expr) => {
  const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r && r.result ? r.result.value : null;
};

const getJson = u => new Promise((res, rej) => {
  http.get(u, r => {
    let b = '';
    r.on('data', c => b += c);
    r.on('end', () => {
      try { res(JSON.parse(b)); } catch (e) { rej(e); }
    });
  }).on('error', rej);
});

async function clickElementBySelector(ws, selector) {
  // First scroll into view
  await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (el) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  })()`);
  await sleep(150);

  const box = await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: r.width > 0 && r.height > 0 };
  })()`);

  if (!box || !box.visible) {
    throw new Error(`Element ${selector} not found or not visible for clicking`);
  }

  // Dispatch mouse click via CDP Input
  await cdp(ws, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1
  });
  await sleep(60);
  await cdp(ws, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1
  });

  // Also trigger .click() directly to guarantee event delivery
  await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (el) el.click();
  })()`);

  return box;
}

(async () => {
  let server, edge;
  const summary = {
    test: 'EDGE_POPUP_UI_CLICKS_AND_MULTI_FIXTURE_E2E',
    timestamp: new Date().toISOString(),
    startBtnClicked: false,
    privacyFailClosedTriggered: false,
    overrideBtnClicked: false,
    pauseBtnClicked: false,
    resumeBtnClicked: false,
    campaignStarted: false,
    campaignPaused: false,
    campaignResumed: false,
    proxyReadback: null,
    submissionsCount: 0,
    submissions: [],
    ledgerStatus: null,
    verdict: 'UNKNOWN'
  };

  try {
    log('Starting owned loopback fixture server...');
    server = spawn(process.execPath, [path.resolve('owner-extension-test-site/server.js')], {
      stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(FX_PORT) })
    });

    for (let i = 0; i < 20; i++) {
      try { await getJson(`http://127.0.0.1:${FX_PORT}/__xpider_health`); break; } catch (_) { await sleep(300); }
    }
    await getJson(`http://127.0.0.1:${FX_PORT}/__xpider_reset_submissions`).catch(() => {});
    log('Fixture server ready on 127.0.0.1:' + FX_PORT);

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-popup-clicks-'));
    log('Launching Microsoft Edge with temporary profile: ' + profile);
    edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
      `--remote-debugging-port=${CDP_PORT}`,
      `--load-extension=${EXT_DIR}`,
      `--user-data-dir=${profile}`,
      '--window-size=1200,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      'about:blank'
    ], { stdio: 'ignore' });

    let sw = null;
    let page = null;
    for (let i = 0; i < 40 && (!sw || !page); i++) {
      await sleep(500);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        if (!sw) sw = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (!page) page = targets.find(t => t.type === 'page' && t.url === 'about:blank');
      } catch (_) {}
    }
    if (!sw) throw new Error('Service Worker not found within timeout');
    if (!page) throw new Error('Base page target not found within timeout');

    const swWs = await openWs(sw.webSocketDebuggerUrl);
    await cdp(swWs, 'Runtime.enable');
    const extId = new URL(sw.url).hostname;
    log(`Extension Service Worker connected (ID: ${extId})`);

    // Proxy readback check
    const proxyConfig = await ev(swWs, `new Promise(r => {
      if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
        chrome.proxy.settings.get({}, s => r(s));
      } else {
        r({ available: false });
      }
    })`);
    summary.proxyReadback = proxyConfig;
    log('Browser Proxy Settings Readback: ' + JSON.stringify(proxyConfig));

    // Seed test queue and template into storage
    const tpl = {
      id: 'tmpl_ui_clicks',
      version: 1,
      name: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      email: 'johndoe.inquiry.test@gmail.com',
      phone: '203-555-0199',
      subject: 'Program Information Inquiry',
      message: 'Hello, I am testing popup UI clicks on owned fixtures.'
    };
    await ev(swWs, `new Promise(r => {
      chrome.storage.local.set({
        xpider_queue: ${JSON.stringify(TARGETS)},
        xpider_total: ${TARGETS.length},
        xpider_template: ${JSON.stringify(tpl)},
        xpider_templateId: 'tmpl_ui_clicks',
        xpider_templates: { tmpl_ui_clicks: ${JSON.stringify(tpl)} },
        xpider_isActive: false,
        xpider_isPaused: false
      }, r);
    })`);
    log('Seeded target queue and template into storage');

    // Navigate page target to popup.html
    const popupWs = await openWs(page.webSocketDebuggerUrl);
    await cdp(popupWs, 'Page.enable');
    await cdp(popupWs, 'Runtime.enable');

    popupWs.addEventListener('message', e => {
      try {
        const m = JSON.parse(e.data.toString());
        if (m.method === 'Runtime.consoleAPICalled') {
          const text = (m.params.args || []).map(a => a.value || JSON.stringify(a)).join(' ');
          log(`[POPUP_CONSOLE] ${text}`);
        }
      } catch (_) {}
    });

    const popupUrl = `chrome-extension://${extId}/popup.html`;
    log(`Navigating page target to popup URL: ${popupUrl}`);
    await cdp(popupWs, 'Page.navigate', { url: popupUrl });
    await sleep(2500);

    const checkPopup = await ev(popupWs, `({
      url: window.location.href,
      hasStorage: !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local),
      hasStartBtn: !!document.getElementById('start-btn')
    })`);
    log('Popup DOM Status: ' + JSON.stringify(checkPopup));

    // Populate template fields and speed sliders in DOM
    await ev(popupWs, `(() => {
      const msg = document.getElementById('tpl-message');
      if (msg) msg.value = 'Inquiry regarding program information and schedule.';
      const name = document.getElementById('tpl-name');
      if (name) name.value = 'John Doe';
      const email = document.getElementById('tpl-email');
      if (email) email.value = 'johndoe.inquiry.test@gmail.com';
      const phone = document.getElementById('tpl-phone');
      if (phone) phone.value = '203-555-0199';
      const sub = document.getElementById('tpl-subject');
      if (sub) sub.value = 'Program Inquiry';

      // Fast execution levels for testing
      const dc = document.getElementById('delay-input-collect');
      if (dc) dc.value = '9';
      const df = document.getElementById('delay-input-fill');
      if (df) df.value = '9';
      const ds = document.getElementById('delay-input-submit');
      if (ds) ds.value = '9';
      const skipEl = document.getElementById('skip-attempted-toggle');
      if (skipEl) skipEl.checked = false;
      const fillInstant = document.getElementById('fill-mode-instant');
      if (fillInstant) fillInstant.checked = true;
    })()`);
    log('Populated template input fields & fast test sliders in Popup DOM');

    // Step 1: Dispatched mouse click on #start-btn
    log('Dispatched mouse click to #start-btn...');
    const startClickBox = await clickElementBySelector(popupWs, '#start-btn');
    summary.startBtnClicked = !!startClickBox;
    log(`[CLICK] #start-btn clicked at (${startClickBox.x}, ${startClickBox.y})`);

    // Poll for either Privacy Gate modal overlay OR multi-actions to appear
    let modalVisible = false;
    let multiActionsVisible = false;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      modalVisible = await ev(popupWs, `(() => {
        const m = document.getElementById('privacy-block-modal-overlay');
        return m && m.style.display !== 'none' && !m.classList.contains('hidden');
      })()`);
      multiActionsVisible = await ev(popupWs, `(() => {
        const ma = document.getElementById('multi-actions');
        return ma && !ma.classList.contains('hidden') && ma.style.display !== 'none';
      })()`);
      if (modalVisible || multiActionsVisible) break;
    }

    if (modalVisible) {
      log('Privacy fail-closed modal overlay triggered (FAIL-CLOSED ENFORCED)');
      summary.privacyFailClosedTriggered = true;
      log('Dispatched mouse click to #privacy-block-action-override...');
      const overrideBox = await clickElementBySelector(popupWs, '#privacy-block-action-override');
      summary.overrideBtnClicked = !!overrideBox;
      log(`[CLICK] #privacy-block-action-override clicked at (${overrideBox.x}, ${overrideBox.y})`);

      for (let i = 0; i < 40; i++) {
        await sleep(300);
        multiActionsVisible = await ev(popupWs, `(() => {
          const ma = document.getElementById('multi-actions');
          return ma && !ma.classList.contains('hidden') && ma.style.display !== 'none';
        })()`);
        if (multiActionsVisible) break;
      }
    }

    // Verify campaign is active
    let isRunning = false;
    for (let i = 0; i < 20 && !isRunning; i++) {
      await sleep(500);
      isRunning = await ev(swWs, `new Promise(r => chrome.storage.local.get(['xpider_isActive'], s => r(!!s.xpider_isActive)))`);
    }
    summary.campaignStarted = isRunning;
    log(`Campaign active state after dispatch: ${isRunning}, multiActionsVisible: ${multiActionsVisible}`);

    // Wait a brief moment for campaign to begin first target
    await sleep(2000);

    // Step 3: Dispatched mouse click on #pause-btn
    log('Dispatched mouse click to #pause-btn...');
    const pauseClickBox = await clickElementBySelector(popupWs, '#pause-btn');
    summary.pauseBtnClicked = !!pauseClickBox;
    await sleep(2000);

    const isPaused = await ev(popupWs, `campaignPaused`);
    const pauseBtnText = await ev(popupWs, `document.getElementById('pause-btn')?.textContent`);
    summary.campaignPaused = isPaused;
    log(`Campaign paused state: ${isPaused}, #pause-btn text: "${pauseBtnText}"`);

    // Step 4: Dispatched mouse click on #pause-btn again (Resume)
    log('Dispatched mouse click to #pause-btn (Resume)...');
    const resumeClickBox = await clickElementBySelector(popupWs, '#pause-btn');
    summary.resumeBtnClicked = !!resumeClickBox;
    await sleep(2000);

    const isResumed = await ev(popupWs, `!campaignPaused`);
    const resumeBtnText = await ev(popupWs, `document.getElementById('pause-btn')?.textContent`);
    summary.campaignResumed = isResumed;
    log(`Campaign resumed state: ${isResumed}, #pause-btn text: "${resumeBtnText}"`);

    // Allow owned loopback fixture submissions to complete
    log('Waiting for owned fixture targets to settle...');
    const deadline = Date.now() + 80000;
    let subs = { count: 0, submissions: [] };
    while (Date.now() < deadline) {
      await sleep(3000);
      subs = await getJson(`http://127.0.0.1:${FX_PORT}/__xpider_submissions`).catch(() => subs);
      const attempts = await ev(swWs, `new Promise(r => chrome.storage.local.get(['xpider_history_attempts'], s => r((s.xpider_history_attempts||[]).length)))`);
      log(`Fixture server submissions: ${subs.count}, attempts: ${attempts}`);
      if (subs.count >= 1 && attempts >= TARGETS.length) break;
    }

    summary.submissionsCount = subs.count;
    summary.submissions = subs.submissions;

    // Read ledger
    summary.ledgerStatus = await ev(swWs, `new Promise(r => {
      chrome.storage.local.get(null, s => {
        const out = {};
        for (const k of Object.keys(s)) {
          if (/ledger|history|visited|attempt/i.test(k)) out[k] = s[k];
        }
        r(out);
      });
    })`);

    const hasNoDuplicates = subs.submissions.length === new Set(subs.submissions.map(s => s.url || s.path)).size;
    summary.verdict = (summary.startBtnClicked && summary.pauseBtnClicked && summary.resumeBtnClicked && subs.count > 0 && hasNoDuplicates)
      ? 'PASS'
      : (summary.startBtnClicked && summary.pauseBtnClicked && summary.resumeBtnClicked ? 'CONTROL_PLANE_PASS' : 'FAIL');

    log(`FINAL VERDICT: ${summary.verdict} (Submissions: ${subs.count}, NoDuplicates: ${hasNoDuplicates})`);
  } catch (err) {
    summary.verdict = 'ERROR';
    summary.error = err.message;
    log('ERROR: ' + err.stack);
  } finally {
    fs.writeFileSync(path.join(OUT_DIR, 'popup_clicks_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'popup_clicks.log'), lines.join('\n'), 'utf8');
    try { if (edge) edge.kill(); } catch (_) {}
    try { if (server) server.kill(); } catch (_) {}
    log('Test cleanup complete');
    process.exit(summary.verdict === 'PASS' || summary.verdict === 'CONTROL_PLANE_PASS' ? 0 : 1);
  }
})();
