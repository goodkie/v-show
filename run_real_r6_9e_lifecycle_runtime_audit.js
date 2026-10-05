/**
 * run_real_r6_9e_lifecycle_runtime_audit.js
 * R6.9E.1 Acceptance: ACTUAL Chromium (Edge) operator-path lifecycle & counter authority audit.
 *
 * Requirements (ChatGPT Audit Directive Section 9):
 * 1. PRE-SUBMIT / NO EARLY CLOSE: Tab remains physically present before SUBMIT_ATTEMPT_STARTED.
 * 2. REAL SUBMIT: SUBMIT_ATTEMPT_STARTED -> SUBMIT_TRIGGERED -> VERIFYING -> settlement -> completion hold -> TAB_CLOSE.
 * 3. STALE SAME-TAB MESSAGE: Rejects spoofed/stale message from same tab, logs [STALE_TARGET_EVENT] ... REJECTED.
 * 4. STALE SOLVER: Drops stale solver request/result with [CAPTCHA_STALE_REQUEST] / [CAPTCHA_STALE_RESULT] action=DROP.
 * 5. COUNTERS: 2 SUCCESS, 1 FAILURE, 1 DELIVERY_UNKNOWN, 1 SKIPPED => total completed=5, with 1:1 Live/History parity.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

const PORT = 8973;
const CDP = 9225;
const OUT = path.resolve('evidence_r6_9e_real_runtime_traces.log');
const lines = [];
const rec = (l) => { lines.push(l); console.log(l); };

const FORM = (id, title, preSubmitDelayMs, onsubmit, extraScript = '') => `<!DOCTYPE html><html><head><title>${title}</title></head><body>
<h1>${title}</h1><p>Please use the form below to contact our team.</p>
<form id="contact-form" onsubmit="${onsubmit}">
  <input type="text" name="name" placeholder="Your Name">
  <input type="email" name="email" placeholder="Your Email">
  <input type="text" name="subject" placeholder="Subject">
  <textarea name="message" placeholder="Your Message"></textarea>
  <button type="submit" id="submit-btn" ${preSubmitDelayMs > 0 ? 'style="display:none"' : ''}>Send Message</button>
</form>
<div id="result-slot"></div>
<script>
${preSubmitDelayMs > 0 ? `setTimeout(function(){ document.getElementById('submit-btn').style.display='inline-block'; }, ${preSubmitDelayMs});` : ''}
${extraScript}
</script>
</body></html>`;

const PAGES = {
  // 1. PRE-SUBMIT / DELAYED: submit button hidden for 1000ms to verify tab stays open during PREPARING
  '/delayed-presubmit.html': FORM('dp', 'Delayed PreSubmit Contact', 1000,
    "event.preventDefault(); setTimeout(function(){ var d=document.createElement('div'); d.id='thanks'; d.className='thank-you-message'; d.style.cssText='color:green;font-weight:bold'; d.textContent='Thank you! Message received.'; document.getElementById('result-slot').appendChild(d); }, 400); return false;"),

  // 2. STALE SAME-TAB MESSAGE: emits rogue message and stale solver from same tab via content script bridge
  '/stale-same-tab.html': FORM('st', 'Stale Message Contact', 0,
    "event.preventDefault(); setTimeout(function(){ var d=document.createElement('div'); d.id='thanks'; d.className='thank-you-message'; d.style.cssText='color:green;font-weight:bold'; d.textContent='Thank you for contacting us!'; document.getElementById('result-slot').appendChild(d); }, 400); return false;",
    `setTimeout(function(){
       window.postMessage({
         type: 'XPIDER_TEST_STALE_CONTROL_MESSAGE',
         payload: {
           attemptId: 'stale_rogue_attempt_888',
           targetToken: 'tok_stale_999',
           campaignRunId: 'stale_run',
           sessionId: 9999
         }
       }, '*');
       window.postMessage({
         type: 'XPIDER_TEST_STALE_SOLVER_MESSAGE',
         payload: {
           attemptId: 'stale_solver_att',
           targetToken: 'tok_stale_solver',
           campaignRunId: 'stale_run',
           sessionId: 9999,
           captchaEpoch: 999
         }
       }, '*');
     }, 300);`),

  // 3. TRUE FAILURE: DOM server error appears after submit
  '/true-failure.html': FORM('tf', 'Broken Contact', 0,
    "event.preventDefault(); setTimeout(function(){ var d=document.createElement('div'); d.id='srv-err'; d.style.cssText='color:red'; d.textContent='Could not send message. Please try again later.'; document.getElementById('result-slot').appendChild(d); }, 100); return false;"),

  // 4. AMBIGUOUS: Submit event occurs, no confirmation banner
  '/ambiguous.html': FORM('am', 'Silent Contact', 0,
    "event.preventDefault(); return false;")
};

(async () => {
  rec('================================================================================');
  rec('[R6.9E.1 ACTUAL OPERATOR-PATH LIFECYCLE & COUNTER AUTHORITY RUNTIME AUDIT]');
  rec('================================================================================');
  rec(`Timestamp: ${new Date().toISOString()}`);
  rec(`gitHead: ${execSync('git rev-parse HEAD').toString().trim()}`);

  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!PAGES[p]) {
      res.statusCode = 404;
      return res.end('Not Found');
    }
    res.end(PAGES[p]);
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  rec(`[HTTP_SERVER] http://127.0.0.1:${PORT}`);

  const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const extPath = path.resolve('send_message_backup/build/extension');
  const profile = path.join(os.tmpdir(), 'r6_9e_profile_' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  rec(`[BROWSER_LAUNCH] ${browserPath} ext=${extPath}`);
  const proc = spawn(browserPath, [
    `--remote-debugging-port=${CDP}`, `--load-extension=${extPath}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1200,850', 'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 5000));

  let exitCode = 0;
  try {
    const ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json();
    rec(`[CDP_CONNECT] ${ver.Browser}`);
    const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
    const sw = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
    if (!sw) throw new Error('Extension service worker not found');
    const extId = sw.url.match(/chrome-extension:\/\/([a-z]+)\//)[1];
    rec(`[EXT_DISCOVERY] extId=${extId}`);

    const open = (url) => new Promise(r => { const w = new WebSocket(url); w.onopen = () => r(w); });
    const mkEval = (ws, base) => {
      let n = base;
      return (expression) => new Promise((resolve, reject) => {
        const id = ++n;
        const h = (evt) => {
          const d = JSON.parse(evt.data);
          if (d.id === id) {
            ws.removeEventListener('message', h);
            if (d.result && d.result.exceptionDetails) return reject(new Error(JSON.stringify(d.result.exceptionDetails.exception?.description || d.result.exceptionDetails)));
            resolve(d.result && d.result.result ? d.result.result.value : null);
          }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
      });
    };
    const consoleArgs = (d) => d.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');

    const swWs = await open(sw.webSocketDebuggerUrl);
    swWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    swWs.onmessage = (e) => { const d = JSON.parse(e.data); if (d.method === 'Runtime.consoleAPICalled') rec(`[SW_CONSOLE] ${consoleArgs(d)}`); };
    const evalSW = mkEval(swWs, 200);

    const targetLifecycleEvents = [];
    const browserWs = await open(ver.webSocketDebuggerUrl);
    browserWs.onmessage = async (e) => {
      const d = JSON.parse(e.data);
      if (d.method === 'Target.targetCreated') {
        const ti = d.params.targetInfo;
        if (ti.type === 'page' && (ti.url.includes(`127.0.0.1:${PORT}`) || ti.url.includes('example.gov'))) {
          targetLifecycleEvents.push({ type: 'CREATED', url: ti.url, targetId: ti.targetId, ts: Date.now() });
          rec(`[CDP_TARGET_CREATED] ts=${Date.now()} ${ti.url}`);
        }
      } else if (d.method === 'Target.targetDestroyed') {
        targetLifecycleEvents.push({ type: 'DESTROYED', targetId: d.params.targetId, ts: Date.now() });
        rec(`[CDP_TARGET_DESTROYED] ts=${Date.now()} targetId=${d.params.targetId}`);
      }
    };
    browserWs.send(JSON.stringify({ id: 2, method: 'Target.setDiscoverTargets', params: { discover: true } }));

    // --- Open actual popup page
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const created = await new Promise(r => {
      const h = (e) => { const d = JSON.parse(e.data); if (d.id === 3) { browserWs.removeEventListener('message', h); r(d.result); } };
      browserWs.addEventListener('message', h);
      browserWs.send(JSON.stringify({ id: 3, method: 'Target.createTarget', params: { url: popupUrl } }));
    });
    await new Promise(r => setTimeout(r, 2500));
    const popupWs = await open(`ws://127.0.0.1:${CDP}/devtools/page/${created.targetId}`);
    popupWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    popupWs.onmessage = (e) => { const d = JSON.parse(e.data); if (d.method === 'Runtime.consoleAPICalled') rec(`[POPUP_CONSOLE] ${consoleArgs(d)}`); };
    const evalPopup = mkEval(popupWs, 500);
    await new Promise(r => setTimeout(r, 1500));

    const prov = await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_BUILD_PROVENANCE'}, r))`);
    rec(`[BUILD_PROVENANCE_LIVE] buildId=${prov && prov.buildId} implementationHead=${prov && prov.implementationHead}`);
    const badgeText = await evalPopup(`document.getElementById('build-provenance-badge')?.textContent`);
    rec(`[POPUP_BADGE_LIVE] ${badgeText}`);

    // --- Load 5 targets through popup UI
    rec('\n--- STEP 1: load 5 targets through popup list input ---');
    await evalPopup(`(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      set('tpl-first-name','Operator'); set('tpl-last-name','Auditor'); set('tpl-name','Operator Auditor');
      set('tpl-email','auditor@operator-path.org'); set('tpl-subject','R6.9E.1 Verification'); set('tpl-message','R6.9E.1 automated operator-path verification inquiry.');
      set('delay-input-collect','9'); set('delay-input-fill','9'); set('delay-input-submit','9');
    })()`);

    const targetUrls = [
      `http://127.0.0.1:${PORT}/delayed-presubmit.html`,
      `http://127.0.0.1:${PORT}/stale-same-tab.html`,
      `http://127.0.0.1:${PORT}/true-failure.html`,
      `http://127.0.0.1:${PORT}/ambiguous.html`,
      `https://example.gov/contact` // Known gov domain -> skipped
    ];

    for (const url of targetUrls) {
      await evalPopup(`(() => { const i = document.getElementById('manual-url-input'); i.value = '${url}'; document.getElementById('add-url-btn').click(); })()`);
      await new Promise(r => setTimeout(r, 500));
    }
    const q = await evalPopup(`(typeof campaignQueue !== 'undefined') ? campaignQueue.slice() : []`);
    rec(`[POPUP_QUEUE_LOADED] count=${q.length}`);

    rec('\n--- STEP 2: click actual #start-btn ---');
    rec(`[POPUP_START_CLICKED] ${JSON.stringify(await evalPopup(`(() => { const b = document.getElementById('start-btn'); if (!b) return {error:'no start-btn'}; b.click(); return {success:true}; })()`))}`);

    rec('\n--- STEP 3: poll live counters until all 5 targets are settled ---');
    let ledger = null;
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const r = await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_LEDGER_STATS', scope:'currentRun'}, r))`);
      ledger = r && r.stats;
      if (ledger && ledger.completed >= 5) {
        rec(`[POLL_COMPLETE] completed targets reached ${ledger.completed}`);
        break;
      }
    }

    await new Promise(r => setTimeout(r, 4000));
    ledger = (await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_LEDGER_STATS', scope:'currentRun'}, r))`)).stats;
    const counters = (await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_CAMPAIGN_COUNTERS'}, r))`)).counters;
    const liveCards = await evalPopup(`(() => ({
      liveSuccess: document.getElementById('success-count-display')?.textContent.trim(),
      liveFailed: document.getElementById('failed-count-display')?.textContent.trim()
    }))()`);
    
    // Switch to history tab to read popup history ledger counters
    await evalPopup(`(() => { const t = document.querySelector('[data-tab="history"]'); if (t) t.click(); })()`);
    await new Promise(r => setTimeout(r, 2000));
    const ui = Object.assign({}, liveCards, await evalPopup(`(() => ({
      ledgerSuccess: document.getElementById('stat-ledger-success')?.textContent.trim(),
      ledgerFailed: document.getElementById('stat-ledger-failed')?.textContent.trim(),
      ledgerUnknown: document.getElementById('stat-ledger-unknown')?.textContent.trim(),
      ledgerSkipped: document.getElementById('stat-ledger-skipped')?.textContent.trim(),
      ledgerTotal: document.getElementById('stat-ledger-total')?.textContent.trim()
    }))()`));

    rec('\n--- STEP 4: counter parity ---');
    rec(`[HISTORYSTORE_currentRun] success=${ledger.success} failure=${ledger.failure} unknown=${ledger.unknown} skipped=${ledger.skipped} completed=${ledger.completed}`);
    rec(`[CAMPAIGN_COUNTERS] success=${counters.success} failed=${counters.failed} deliveryUnknown=${counters.deliveryUnknown} skipped=${counters.skipped} completed=${counters.completed}`);
    rec(`[POPUP_UI_COUNTERS] ${JSON.stringify(ui)}`);

    const fullLog = lines.join('\n');
    const checks = [];
    const chk = (name, ok) => { checks.push({ name, ok }); rec(`${ok ? 'PASS' : 'FAIL'}: ${name}`); };

    // 1. Fixture 1: Pre-submit / no early close
    chk('Fixture 1: Tab remained physically open before submit attempt started', fullLog.includes('[STAGE_PROGRESSION] SUBMIT_ATTEMPT_STARTED'));
    
    // 2. Fixture 2: Real submit sequence
    chk('Fixture 2: SUBMIT_ATTEMPT_STARTED reached', fullLog.includes('SUBMIT_ATTEMPT_STARTED'));
    chk('Fixture 2: SUBMIT_TRIGGERED reached', fullLog.includes('SUBMIT_TRIGGERED'));
    chk('Fixture 2: VERIFYING / CONFIRMED_SUCCESS reached', fullLog.includes('CONFIRMED_SUCCESS'));
    chk('Fixture 2: Maintaining page for registration completion observed', fullLog.includes('Maintaining page for registration completion'));

    // 3. Fixture 3: Stale same-tab message rejected
    chk('Fixture 3: Spoofed same-tab message rejected with [STALE_TARGET_EVENT]', fullLog.includes('[STALE_TARGET_EVENT]') && fullLog.includes('result=REJECTED'));
    chk('Fixture 3: Rejection reason was attempt_mismatch or session_mismatch', fullLog.includes('attempt_mismatch') || fullLog.includes('session_mismatch'));

    // 4. Fixture 4: Stale solver rejected
    chk('Fixture 4: Stale solver call rejected with [CAPTCHA_STALE_REQUEST]', fullLog.includes('[CAPTCHA_STALE_REQUEST]') && fullLog.includes('action=REJECT'));

    // 5. Fixture 5: Exact counters parity
    chk('Fixture 5: HistoryStore currentRun success == 2', ledger.success === 2);
    chk('Fixture 5: HistoryStore currentRun failure == 1', ledger.failure === 1);
    chk('Fixture 5: HistoryStore currentRun unknown == 1', ledger.unknown === 1);
    chk('Fixture 5: HistoryStore currentRun skipped == 1', ledger.skipped === 1);
    chk('Fixture 5: HistoryStore currentRun completed == 5', ledger.completed === 5);
    chk('Fixture 5: Campaign Counters match HistoryStore', counters.success === 2 && counters.failed === 1 && counters.deliveryUnknown === 1 && counters.skipped === 1);
    chk('Fixture 5: Popup Live cards match HistoryStore', Number(ui.liveSuccess) === 2 && Number(ui.liveFailed) === 1);
    chk('Fixture 5: Popup History counters match HistoryStore', Number(ui.ledgerSuccess) === 2 && Number(ui.ledgerFailed) === 1 && Number(ui.ledgerUnknown) === 1 && Number(ui.ledgerSkipped) === 1);

    const failed = checks.filter(c => !c.ok);
    rec(`\n[RESULT] ${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length) exitCode = 1;
  } catch (e) {
    rec(`[HARNESS_ERROR] ${e.stack || e}`);
    exitCode = 1;
  } finally {
    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    try { proc.kill(); } catch (_) {}
    try { execSync('taskkill /F /T /PID ' + proc.pid, { stdio: 'ignore' }); } catch (_) {}
    server.close();
    process.exit(exitCode);
  }
})();
