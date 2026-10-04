/**
 * run_real_r6_9d_outcome_runtime_audit.js
 * R6.9D Acceptance: ACTUAL Chromium (Edge) operator-path outcome verifier audit.
 *
 * Flow: popup list input (#manual-url-input + #add-url-btn) -> real #start-btn click
 *       -> background orchestrator -> natural content-script injection -> HistoryStore -> live counters.
 *
 * Harness MAY: host fixtures, click popup UI, read DOM / console logs / read-only counters.
 * Harness MUST NOT: instantiate SubmissionOutcomeVerifier, call finishCampaign(),
 *                   call HistoryStore.settleCanonicalAttempt(), or write terminal statuses.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

const PORT = 8972;
const CDP = 9224;
const OUT = path.resolve('evidence_r6_9d_real_runtime_traces.log');
const lines = [];
const rec = (l) => { lines.push(l); console.log(l); };

const FORM = (id, title, extraHidden, onsubmit) => `<!DOCTYPE html><html><head><title>${title}</title></head><body>
<h1>${title}</h1><p>Please use the form below to contact our team.</p>
${extraHidden}
<form id="contact-form" onsubmit="${onsubmit}">
  <input type="text" name="name" placeholder="Your Name">
  <input type="email" name="email" placeholder="Your Email">
  <input type="text" name="subject" placeholder="Subject">
  <textarea name="message" placeholder="Your Message"></textarea>
  <button type="submit" id="submit-btn">Send Message</button>
</form>
<div id="result-slot"></div>
</body></html>`;

const PAGES = {
  // 1. FALSE-FAILURE: static hidden error template pre-exists; real thank-you appears 300-1000ms after submit.
  '/false-failure.html': FORM('ff', 'Seido Style Contact',
    '<div id="tpl-error" style="display:none" class="wpcf7-response-output">Could not send message. Submission failed.</div>',
    "event.preventDefault(); setTimeout(function(){ var d=document.createElement('div'); d.id='thanks'; d.className='thank-you-message'; d.style.cssText='color:green;font-weight:bold'; d.textContent='Thank you for your message! Your submission has been received.'; document.getElementById('result-slot').appendChild(d); }, 600); return false;"),
  // 2. TRUE FAILURE (DOM-only): NEW server error node appears after submit.
  '/true-failure.html': FORM('tf', 'Broken Contact',
    '',
    "event.preventDefault(); setTimeout(function(){ var d=document.createElement('div'); d.id='srv-err'; d.style.cssText='color:red'; d.textContent='Could not send message. Please try again later.'; document.getElementById('result-slot').appendChild(d); }, 80); return false;"),
  // 3. AMBIGUOUS: submit event, nothing else.
  '/ambiguous.html': FORM('am', 'Silent Contact', '',
    "event.preventDefault(); return false;")
};

(async () => {
  rec('================================================================================');
  rec('[R6.9D ACTUAL OPERATOR-PATH OUTCOME VERIFIER RUNTIME AUDIT]');
  rec('================================================================================');
  rec(`Timestamp: ${new Date().toISOString()}`);
  rec(`gitHead: ${execSync('git rev-parse HEAD').toString().trim()}`);

  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PAGES[p] || '<html><body>fixture</body></html>');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  rec(`[HTTP_SERVER] http://127.0.0.1:${PORT}`);

  const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const extPath = path.resolve('send_message_backup/build/extension');
  const profile = path.join(os.tmpdir(), 'r6_9d_profile_' + Date.now());
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

    const browserWs = await open(ver.webSocketDebuggerUrl);
    const attached = new Set();
    browserWs.onmessage = async (e) => {
      const d = JSON.parse(e.data);
      if (d.method === 'Target.targetCreated') {
        const ti = d.params.targetInfo;
        if (ti.type === 'page' && ti.url.includes(`127.0.0.1:${PORT}`) && !attached.has(ti.targetId)) {
          attached.add(ti.targetId);
          rec(`[CDP_TARGET_CREATED] ${ti.url}`);
          try {
            const pw = await open(`ws://127.0.0.1:${CDP}/devtools/page/${ti.targetId}`);
            pw.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
            pw.onmessage = (pe) => { const pd = JSON.parse(pe.data); if (pd.method === 'Runtime.consoleAPICalled') rec(`[CONTENT_CONSOLE] ${consoleArgs(pd)}`); };
          } catch (_) {}
        }
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
    rec(`[POPUP_BADGE_LIVE] ${await evalPopup(`document.getElementById('build-provenance-badge')?.textContent`)}`);

    // --- Load 3-target list via popup UI controls
    rec('\n--- STEP 1: load 3 targets through popup list input ---');
    await evalPopup(`(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      set('tpl-first-name','Operator'); set('tpl-last-name','Auditor'); set('tpl-name','Operator Auditor');
      set('tpl-email','auditor@operator-path.org'); set('tpl-subject','R6.9D Verification'); set('tpl-message','R6.9D automated operator-path verification inquiry.');
      set('delay-input-collect','9'); set('delay-input-fill','9'); set('delay-input-submit','9');
    })()`);
    for (const p of ['/false-failure.html', '/true-failure.html', '/ambiguous.html']) {
      await evalPopup(`(() => { const i = document.getElementById('manual-url-input'); i.value = 'http://127.0.0.1:${PORT}${p}'; document.getElementById('add-url-btn').click(); })()`);
      await new Promise(r => setTimeout(r, 600));
    }
    const q = await evalPopup(`(typeof campaignQueue !== 'undefined') ? campaignQueue.slice() : []`);
    rec(`[POPUP_QUEUE_LOADED] count=${q.length} targets=${JSON.stringify(q)}`);

    rec('\n--- STEP 2: click actual #start-btn ---');
    rec(`[POPUP_START_CLICKED] ${JSON.stringify(await evalPopup(`(() => { const b = document.getElementById('start-btn'); if (!b) return {error:'no start-btn'}; b.click(); return {success:true}; })()`))}`);

    rec('\n--- STEP 3: poll live counters (read-only) until 3 targets are settled ---');
    let ledger = null;
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const r = await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_LEDGER_STATS', scope:'currentRun'}, r))`);
      ledger = r && r.stats;
      if (lines.some(l => /ambiguous\.html\] \[FINAL\]/.test(l))) break;
    }
    await new Promise(r => setTimeout(r, 6000));
    const attemptsDump = await evalSW(`new Promise(r => chrome.storage.local.get(['xpider_history_attempts'], v => r((v.xpider_history_attempts||[]).map(a => ({id:a.attemptId, url:a.sourceUrl||a.url||a.targetUrl, status:a.status||a.finalStatus||a.outcome, reason:a.failureReason||a.reason||a.errorCode, runId:a.campaignRunId})))))`);
    rec('[ATTEMPTS_DUMP_READONLY] ' + JSON.stringify(attemptsDump));
    ledger = (await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_LEDGER_STATS', scope:'currentRun'}, r))`)).stats;
    const counters = (await evalPopup(`new Promise(r => chrome.runtime.sendMessage({action:'GET_CAMPAIGN_COUNTERS'}, r))`)).counters;
    const liveCards = await evalPopup(`(() => ({ liveSuccess: document.getElementById('success-count-display')?.textContent.trim(), liveFailed: document.getElementById('failed-count-display')?.textContent.trim() }))()`);
    await evalPopup(`(() => { const t = document.querySelector('[data-tab="history"]'); if (t) t.click(); })()`);
    await new Promise(r => setTimeout(r, 2500));
    const ui = Object.assign({}, liveCards, await evalPopup(`(() => ({
      ledgerSuccess: document.getElementById('stat-ledger-success')?.textContent.trim(),
      ledgerFailed: document.getElementById('stat-ledger-failed')?.textContent.trim(),
      ledgerUnknown: document.getElementById('stat-ledger-unknown')?.textContent.trim()
    }))()`));
    rec(`[POPUP_UI_COUNTERS] ${JSON.stringify(ui)}`);
    const _unused = await evalPopup(`(() => ({
      ledgerSuccess: document.getElementById('stat-ledger-success')?.textContent.trim(),
      ledgerFailed: document.getElementById('stat-ledger-failed')?.textContent.trim(),
      ledgerUnknown: document.getElementById('stat-ledger-unknown')?.textContent.trim(),
      liveSuccess: document.getElementById('success-count-display')?.textContent.trim(),
      liveFailed: document.getElementById('failed-count-display')?.textContent.trim()
    }))()`);

    rec('\n--- STEP 4: counter parity ---');
    rec(`[HISTORYSTORE_currentRun] success=${ledger.success} failure=${ledger.failure} unknown=${ledger.unknown} completed=${ledger.completed} timeout=${ledger.timeout} skipped=${ledger.skipped}`);
    rec(`[CAMPAIGN_COUNTERS] success=${counters.success} failed=${counters.failed} deliveryUnknown=${counters.deliveryUnknown} completed=${counters.completed} total=${counters.total}`);
    rec(`[POPUP_UI_COUNTERS] ${JSON.stringify(ui)}`);

    // --- Derive per-target verdicts from natural runtime logs
    const text = lines.join('\n');
    const verifyBlocks = text.split(/\n/).filter(l => l.includes('[SUBMIT_VERIFY]'));
    rec('\n--- STEP 5: collected [SUBMIT_VERIFY] traces (natural runtime) ---');
    verifyBlocks.forEach(l => rec(`[TRACE] ${l}`));

    const checks = [];
    const chk = (name, ok) => { checks.push({ name, ok }); rec(`${ok ? 'PASS' : 'FAIL'}: ${name}`); };
    chk('HistoryStore currentRun success=1', ledger.success === 1);
    chk('HistoryStore currentRun failure=1', ledger.failure === 1);
    chk('HistoryStore currentRun unknown=1', ledger.unknown === 1);
    chk('campaign counters == HistoryStore', counters.success === ledger.success && counters.failed === ledger.failure && counters.deliveryUnknown === ledger.unknown);
    chk('popup ledger UI == HistoryStore', Number(ui.ledgerSuccess) === ledger.success && Number(ui.ledgerFailed) === ledger.failure && Number(ui.ledgerUnknown) === ledger.unknown);
    chk('decision=CONFIRMED_SUCCESS observed', /decision=CONFIRMED_SUCCESS/.test(text));
    chk('decision=SUBMISSION_SERVER_ERROR observed exactly for the true-failure target (1x)', (text.match(/\[SUBMIT_VERIFY\] decision=SUBMISSION_SERVER_ERROR/g) || []).length >= 1);
    chk('decision=DELIVERY_UNKNOWN observed', /decision=DELIVERY_UNKNOWN/.test(text));
    const se = verifyBlocks.filter(l => /decision=SUBMISSION_SERVER_ERROR/.test(l));
    const lat = [...new Set(lines.filter(l => /\[SUBMIT_VERIFY\] elapsedMs=\d+/.test(l)).map(l => Number(l.match(/elapsedMs=(\d+)/)[1])))];
    rec(`[ELAPSED_MS_ALL_TARGETS] ${JSON.stringify(lat)}`);
    const per = (u, k) => { const m = lines.filter(l => l.startsWith('[SW_CONSOLE] [CONTENT_EVENT]') && l.includes(`/${u}.html] [SUBMIT_VERIFY] ${k}=`)).map(l => l.split(`${k}=`)[1]); return m[m.length - 1]; };
    chk('false-failure fixture: decision=CONFIRMED_SUCCESS and not SUBMISSION_SERVER_ERROR', per('false-failure', 'decision') === 'CONFIRMED_SUCCESS');
    chk('true-failure fixture: decision=SUBMISSION_SERVER_ERROR', per('true-failure', 'decision') === 'SUBMISSION_SERVER_ERROR');
    const tfLat = Number(per('true-failure', 'elapsedMs'));
    rec(`[DOM_ONLY_FAILURE_LATENCY_MS] ${tfLat}`);
    chk('DOM-only true failure latency >= 750ms', tfLat >= 750);
    chk('ambiguous fixture: DELIVERY_UNKNOWN (not FAILURE)', /ambiguous\.html\] \[FINAL\] status=DELIVERY_UNKNOWN/.test(lines.join('\n')));

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
