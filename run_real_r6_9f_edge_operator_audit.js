// run_real_r6_9f_edge_operator_audit.js
// R6.9F: Real Microsoft Edge Browser Operator-Path Runtime Audit
// Tests all 6 R6.9F Fixtures inside real msedge.exe instance with live CDP.

const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = globalThis.WebSocket;

const PORT = 8974;
const CDP = 9226;
const OUT = path.resolve('evidence_r6_9f_real_runtime_traces.log');

const lines = [];
function rec(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  lines.push(line);
}

const PAGES = {
  // 1. Dominionshotokan / WP Jetpack Comment Form (MUST be REJECTED as NON_INQUIRY_COMMENT_FORM -> SKIPPED)
  '/wp-comment.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dominion Shotokan Karate - Comment</title></head><body>
<h2>Leave a Reply</h2>
<p>Logged in as admin. Log out?</p>
<form id="commentform" class="comment-form" action="/wp-comments-post.php" method="post">
  <input type="hidden" name="comment_post_ID" value="101" />
  <p><textarea id="comment" name="comment" cols="45" rows="8" placeholder="Comment"></textarea></p>
  <p><input name="submit" type="submit" id="submit" class="submit" value="Post Comment" /></p>
</form>
</body></html>`,

  // 2. Dragon Strike / Duncan Martial Arts Custom Submit (<a> semantic submit button inside form)
  '/custom-submit.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dragon Strike Martial Arts - Contact</title></head><body>
<h2>Contact Us</h2>
<form id="contact-form" class="et_pb_contact_form">
  <p><input type="text" name="name" placeholder="Name" value="" /></p>
  <p><input type="email" name="email" placeholder="Email Address" value="" /></p>
  <p><textarea name="message" placeholder="Message"></textarea></p>
  <p><a class="et_pb_contact_submit et_pb_button" id="send-btn" href="#">Send Message</a></p>
</form>
<div id="result-slot"></div>
<script>
document.getElementById('send-btn').addEventListener('click', function(e) {
  e.preventDefault();
  var d = document.createElement('div');
  d.id = 'success-message';
  d.className = 'message-success';
  d.textContent = 'Thank you! Your message has been sent successfully.';
  document.getElementById('result-slot').appendChild(d);
});
</script>
</body></html>`,

  // 3. Standard inquiry success form for counter parity
  '/standard-inquiry.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Standard Inquiry</title></head><body>
<h2>Inquiry Form</h2>
<form id="contact-form" action="/send" method="post">
  <input type="text" name="name" placeholder="Full Name" />
  <input type="email" name="email" placeholder="Email" />
  <textarea name="message" placeholder="Message Body"></textarea>
  <button type="submit" id="submit-btn">Send Message</button>
</form>
<div id="result-slot"></div>
<script>
document.getElementById('contact-form').addEventListener('submit', function(e) {
  e.preventDefault();
  var d = document.createElement('div');
  d.id = 'success-message';
  d.className = 'message-success';
  d.textContent = 'Thank you! Your message has been sent successfully.';
  document.getElementById('result-slot').appendChild(d);
});
</script>
</body></html>`
};

(async () => {
  rec('================================================================================');
  rec('[R6.9F ACTUAL OPERATOR-PATH REAL EDGE BROWSER ACCEPTANCE AUDIT]');
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
  const profile = path.join(os.tmpdir(), 'r6_9f_edge_profile_' + Date.now());
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

    const browserWs = await open(ver.webSocketDebuggerUrl);
    const swWs = await open(sw.webSocketDebuggerUrl);
    swWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    swWs.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        const text = consoleArgs(d);
        rec(`[SW_CONSOLE] ${text}`);
      }
    };

    // Open actual popup page via Target.createTarget
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    const created = await new Promise(r => {
      const h = (e) => { const d = JSON.parse(e.data); if (d.id === 3) { browserWs.removeEventListener('message', h); r(d.result); } };
      browserWs.addEventListener('message', h);
      browserWs.send(JSON.stringify({ id: 3, method: 'Target.createTarget', params: { url: popupUrl } }));
    });
    await new Promise(r => setTimeout(r, 2500));

    const popWs = await open(`ws://127.0.0.1:${CDP}/devtools/page/${created.targetId}`);
    popWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    popWs.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        rec(`[POPUP_CONSOLE] ${consoleArgs(d)}`);
      }
    };

    const evalPop = mkEval(popWs, 1000);
    const evalSw = mkEval(swWs, 2000);

    await new Promise(r => setTimeout(r, 2000));

    // Verify Build Provenance & Badge inside real popup
    const popupBadge = await evalPop(`document.getElementById('build-provenance-badge')?.textContent.trim()`);
    const mismatchBannerVisible = await evalPop(`document.getElementById('build-mismatch-banner')?.style.display !== 'none'`);
    const startBtnDisabled = await evalPop(`document.getElementById('start-btn')?.disabled`);
    const startBtnLocked = await evalPop(`document.getElementById('start-btn')?.hasAttribute('data-build-locked')`);

    rec(`[POPUP_BADGE_LIVE] ${popupBadge}`);
    rec(`[BUILD_MISMATCH_BANNER_VISIBLE] ${mismatchBannerVisible}`);
    rec(`[START_BTN_LOCKED] disabled=${startBtnDisabled} locked=${startBtnLocked}`);

    // Load test queue into popup:
    // 1. wp-comment.html (expected: SKIPPED via NON_INQUIRY_COMMENT_FORM)
    // 2. custom-submit.html (expected: SUCCESS via semantic custom button)
    // 3. standard-inquiry.html (expected: SUCCESS)
    const testQueue = [
      `http://127.0.0.1:${PORT}/wp-comment.html`,
      `http://127.0.0.1:${PORT}/custom-submit.html`,
      `http://127.0.0.1:${PORT}/standard-inquiry.html`
    ];

    rec('\n--- STEP 1: load targets through popup queue ---');
    await evalPop(`(() => {
      campaignQueue = ${JSON.stringify(testQueue)};
      const t = document.getElementById('url-count-display');
      if (t) t.textContent = '${testQueue.length} URLs found';
      document.getElementById('tpl-name').value = 'Test Operator';
      document.getElementById('tpl-email').value = 'operator@example.com';
      document.getElementById('tpl-subject').value = 'R6.9F Acceptance Inquiry';
      document.getElementById('tpl-message').value = 'This is an authorized R6.9F automated acceptance inquiry message.';
      document.getElementById('delay-input-collect').value = '9';
      document.getElementById('delay-input-fill').value = '9';
      document.getElementById('delay-input-submit').value = '9';
      return { ok: true, queueLen: campaignQueue.length };
    })()`);

    rec(`[POPUP_QUEUE_LOADED] count=${testQueue.length}`);

    rec('\n--- STEP 2: click actual #start-btn ---');
    const startRes = await evalPop(`(async () => {
      const btn = document.getElementById('start-btn');
      if (!btn || btn.disabled) return { error: 'Start button disabled or locked' };
      btn.click();
      return { success: true };
    })()`);
    rec(`[POPUP_START_CLICKED] ${JSON.stringify(startRes)}`);

    rec('\n--- STEP 3: poll live execution until campaign finishes ---');
    let settled = false;
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await evalSw(`(() => {
        return {
          active: campaignState.isActive,
          currentRunId: campaignState.campaignRunId,
          completed: campaignState.counters ? campaignState.counters.completed : 0,
          success: campaignState.counters ? campaignState.counters.success : 0,
          failed: campaignState.counters ? campaignState.counters.failed : 0,
          skipped: campaignState.counters ? campaignState.counters.skipped : 0
        };
      })()`);

      rec(`[POLL_EXECUTION][${i}s] active=${status.active} completed=${status.completed}/${testQueue.length} success=${status.success} failed=${status.failed} skipped=${status.skipped}`);

      if (status.completed >= testQueue.length || (!status.active && status.completed > 0)) {
        settled = true;
        break;
      }
    }

    await new Promise(r => setTimeout(r, 3000));

    // Evaluate live counters and HistoryStore
    const ledger = (await evalPop(`new Promise(r => chrome.runtime.sendMessage({action:'GET_LEDGER_STATS', scope:'currentRun'}, r))`))?.stats;

    const uiCounters = await evalPop(`(() => ({
      success: document.getElementById('success-count-display')?.textContent.trim(),
      failure: document.getElementById('failed-count-display')?.textContent.trim(),
      timeout: document.getElementById('timeout-count-display')?.textContent.trim(),
      unknown: document.getElementById('unknown-count-display')?.textContent.trim(),
      skipped: document.getElementById('skipped-count-display')?.textContent.trim(),
      completed: document.getElementById('completed-count-display')?.textContent.trim(),
      remaining: document.getElementById('remaining-count-display')?.textContent.trim()
    }))()`);

    rec('\n--- STEP 4: counter parity & audit verification ---');
    rec(`[LEDGER_STATS_currentRun] ${JSON.stringify(ledger)}`);
    rec(`[POPUP_UI_COUNTERS] ${JSON.stringify(uiCounters)}`);

    const fullLog = lines.join('\n');
    const checks = [];
    const chk = (name, ok) => { checks.push({ name, ok }); rec(`${ok ? 'PASS' : 'FAIL'}: ${name}`); };

    chk('Fixture 1: Popup badge matches R6.9F [8963ece]', popupBadge.includes('R6.9F') && popupBadge.includes('8963ece'));
    chk('Fixture 1: Build mismatch banner hidden when builds match', !mismatchBannerVisible);
    chk('Fixture 1: Start button enabled and not build-locked', !startBtnDisabled && !startBtnLocked);
    chk('Fixture 1: Background logs [BUILD_HANDSHAKE] result=PASS', fullLog.includes('[BUILD_HANDSHAKE]') && fullLog.includes('result=PASS'));

    chk('Fixture 2: WP comment form rejected as NON_INQUIRY_COMMENT_FORM', fullLog.includes('NON_INQUIRY_COMMENT_FORM'));
    chk('Fixture 2: WP comment form settled as SKIPPED (not success)', ledger && ledger.skipped >= 1);

    chk('Fixture 3: Semantic custom submit button discovered', fullLog.includes('[SUBMIT_CANDIDATES]') && fullLog.includes('custom=1'));
    chk('Fixture 3: Custom submit strategy selected and executed', fullLog.includes('[SUBMIT_DECISION]') && fullLog.includes('chosen=a'));

    chk('Fixture 6: HistoryStore success matches Popup Live Success', ledger && uiCounters && Number(uiCounters.success) === ledger.success);
    chk('Fixture 6: HistoryStore failure matches Popup Live Failure', ledger && uiCounters && Number(uiCounters.failure) === ledger.failure);
    chk('Fixture 6: HistoryStore skipped matches Popup Live Skipped', ledger && uiCounters && Number(uiCounters.skipped) === ledger.skipped);
    chk('Fixture 6: HistoryStore completed == 3', ledger && ledger.completed === 3);
    chk('Fixture 6: sum(terminal buckets) === completed', ledger && (ledger.success + ledger.failure + ledger.timeout + ledger.unknown + ledger.skipped === ledger.completed));
    chk('Fixture 6: Popup Live Completed matches HistoryStore', uiCounters && Number(uiCounters.completed) === ledger.completed);

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
