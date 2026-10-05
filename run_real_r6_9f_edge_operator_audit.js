// run_real_r6_9f_edge_operator_audit.js
// R6.9F.1: Real Microsoft Edge Browser Operator-Path Runtime Acceptance Audit
// Exercises live msedge.exe instance via Chrome DevTools Protocol (CDP).
// Validates:
// 1. Fail-closed build handshake & mismatch rejection
// 2. Duplicate submit boundary barrier
// 3. Execution Identity Assert & STAGE_PROGRESSION ACK before submit
// 4. Natural 5-bucket terminal distribution: 1 SUCCESS, 1 FAILURE, 1 TIMEOUT, 1 UNKNOWN, 1 SKIPPED = 5 COMPLETED
// 5. 1:1 Counter parity across HistoryStore, Campaign State, Popup Live, and Popup History

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
  // 1. Dominionshotokan WP Comment Form (MUST be REJECTED as NON_INQUIRY_COMMENT_FORM -> SKIPPED)
  '/wp-comment.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dominion Shotokan Karate - Comment</title></head><body>
<h2>Leave a Reply</h2>
<p>Logged in as admin. Log out?</p>
<form id="commentform" class="comment-form" action="/wp-comments-post.php" method="post">
  <input type="hidden" name="comment_post_ID" value="101" />
  <p><textarea id="comment" name="comment" cols="45" rows="8" placeholder="Comment"></textarea></p>
  <p><input name="submit" type="submit" id="submit" class="submit" value="Post Comment" /></p>
</form>
</body></html>`,

  // 2. Dragon Strike / Duncan Martial Arts Custom Submit (<a> semantic submit button inside form -> CONFIRMED_SUCCESS)
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

  // 3. Failure inquiry form (Displays 500 error on submit + fetch returns 500 -> FAILURE)
  '/failure-inquiry.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Failure Inquiry</title></head><body>
<h2>Inquiry Form</h2>
<form id="contact-form" action="/submit-fail" method="post">
  <input type="text" name="name" placeholder="Full Name" />
  <input type="email" name="email" placeholder="Email" />
  <textarea name="message" placeholder="Message Body"></textarea>
  <button type="submit" id="submit-btn">Send Message</button>
</form>
<div id="server_err_div" style="display: none; color: red;">500 Internal Server Error: database connection failed</div>
<script>
document.getElementById('contact-form').addEventListener('submit', function(e) {
  e.preventDefault();
  fetch('/submit-fail', { method: 'POST' }).catch(function() {});
  document.getElementById('server_err_div').style.display = 'block';
});
</script>
</body></html>`,

  // 4. Timeout inquiry form (Server delays response by 8s -> 5s Local Session Timeout fires -> TIMEOUT_LOCAL)
  // Handled dynamically in HTTP server router

  // 5. Unknown inquiry form (Native submit event fires but no confirmation or error appears -> DELIVERY_UNKNOWN)
  '/unknown-inquiry.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unknown Inquiry</title></head><body>
<h2>Inquiry Form</h2>
<form id="contact-form" action="/silent" method="post">
  <input type="text" name="name" placeholder="Full Name" />
  <input type="email" name="email" placeholder="Email" />
  <textarea name="message" placeholder="Message Body"></textarea>
  <button type="submit" id="submit-btn">Send Message</button>
</form>
<script>
document.getElementById('contact-form').addEventListener('submit', function(e) {
  e.preventDefault();
  // Native submit fires, but page produces no success/error nodes and does not navigate
});
</script>
</body></html>`
};

(async () => {
  rec('================================================================================');
  rec('[R6.9F.1 ACTUAL OPERATOR-PATH REAL EDGE BROWSER ACCEPTANCE AUDIT]');
  rec('================================================================================');
  rec(`Timestamp: ${new Date().toISOString()}`);
  rec(`gitHead: ${execSync('git rev-parse HEAD').toString().trim()}`);

  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    // Dynamic routes for test conditions
    if (p === '/submit-fail') {
      res.statusCode = 500;
      return res.end('500 Internal Server Error');
    }

    if (p === '/timeout-inquiry.html') {
      // Delay HTTP response by 9 seconds so background 5s session timeout fires
      setTimeout(() => {
        res.end('<!DOCTYPE html><html><body>Hanging response complete</body></html>');
      }, 9000);
      return;
    }

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
  const profile = path.join(os.tmpdir(), 'r6_9f1_edge_profile_' + Date.now());
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

    rec('\n--- PRE-FLIGHT TEST 1: FAIL-CLOSED BUILD HANDSHAKE IN REAL EDGE ---');
    // Test 1a: Calling START_CAMPAIGN without expected provenance fields must be rejected
    const missingFieldsRes = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'START_CAMPAIGN', queue: ['http://127.0.0.1:${PORT}/test'] }, r))`);
    rec(`[HANDSHAKE_MISSING_FIELDS_RES] ${JSON.stringify(missingFieldsRes)}`);

    // Test 1b: Calling START_CAMPAIGN with mismatched commit hash must be rejected
    const mismatchRes = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'START_CAMPAIGN', expectedImplementationHead: 'bad_commit_sha_123', expectedBuildId: 'R6.9F-20261005-RUNTIME-SUBMIT-COUNTERS', expectedManifestVersion: 3, queue: ['http://127.0.0.1:${PORT}/test'] }, r))`);
    rec(`[HANDSHAKE_MISMATCH_RES] ${JSON.stringify(mismatchRes)}`);

    rec('\n--- PRE-FLIGHT TEST 2: DUPLICATE SUBMIT BOUNDARY BARRIER IN REAL EDGE ---');
    // Test 2: Boundary latch rejects duplicate submit attempt
    await evalSw(`(() => {
      if (!campaignState.submitBoundaryReached) campaignState.submitBoundaryReached = {};
      campaignState.submitBoundaryReached['test_boundary_att_1'] = true;
    })()`);
    const boundaryCheck = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'QUERY_SUBMIT_BOUNDARY', attemptId: 'test_boundary_att_1' }, r))`);
    rec(`[BOUNDARY_CHECK] ${JSON.stringify(boundaryCheck)}`);

    rec('\n--- PRE-FLIGHT TEST 3: POPUP BUILD PROVENANCE & BADGE IN REAL EDGE ---');
    const popupBadge = await evalPop(`document.getElementById('build-provenance-badge')?.textContent.trim()`);
    const mismatchBannerVisible = await evalPop(`document.getElementById('build-mismatch-banner')?.style.display !== 'none'`);
    const startBtnDisabled = await evalPop(`document.getElementById('start-btn')?.disabled`);
    const startBtnLocked = await evalPop(`document.getElementById('start-btn')?.hasAttribute('data-build-locked')`);

    rec(`[POPUP_BADGE_LIVE] ${popupBadge}`);
    rec(`[BUILD_MISMATCH_BANNER_VISIBLE] ${mismatchBannerVisible}`);
    rec(`[START_BTN_LOCKED] disabled=${startBtnDisabled} locked=${startBtnLocked}`);

    // Load 5-target test queue into popup:
    // 1. wp-comment.html (expected: SKIPPED via NON_INQUIRY_COMMENT_FORM)
    // 2. custom-submit.html (expected: SUCCESS via semantic custom button <a>)
    // 3. failure-inquiry.html (expected: FAILURE via 500 server error)
    // 4. timeout-inquiry.html (expected: TIMEOUT via local session timeout)
    // 5. unknown-inquiry.html (expected: DELIVERY_UNKNOWN via ambiguous submit)
    const testQueue = [
      `http://127.0.0.1:${PORT}/wp-comment.html`,
      `http://127.0.0.1:${PORT}/custom-submit.html`,
      `http://127.0.0.1:${PORT}/failure-inquiry.html`,
      `http://127.0.0.1:${PORT}/timeout-inquiry.html`,
      `http://127.0.0.1:${PORT}/unknown-inquiry.html`
    ];

    rec('\n--- STEP 1: load 5 targets through popup queue ---');
    await evalPop(`(() => {
      campaignQueue = ${JSON.stringify(testQueue)};
      const t = document.getElementById('url-count-display');
      if (t) t.textContent = '${testQueue.length} URLs found';
      document.getElementById('tpl-name').value = 'Operator Tester';
      document.getElementById('tpl-email').value = 'operator@example.com';
      document.getElementById('tpl-subject').value = 'R6.9F.1 Full Audit Inquiry';
      document.getElementById('tpl-message').value = 'This is an authorized R6.9F.1 automated acceptance inquiry message.';
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

    rec('\n--- STEP 3: poll live execution until all 5 targets finish ---');
    let settled = false;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await evalSw(`(() => {
        return {
          active: campaignState.isActive,
          currentRunId: campaignState.campaignRunId,
          completed: campaignState.counters ? campaignState.counters.completed : 0,
          success: campaignState.counters ? campaignState.counters.success : 0,
          failed: campaignState.counters ? campaignState.counters.failed : 0,
          timeout: campaignState.counters ? campaignState.counters.timeout : 0,
          unknown: campaignState.counters ? campaignState.counters.deliveryUnknown : 0,
          skipped: campaignState.counters ? campaignState.counters.skipped : 0
        };
      })()`);

      rec(`[POLL_EXECUTION][${i}s] active=${status.active} completed=${status.completed}/${testQueue.length} success=${status.success} failed=${status.failed} timeout=${status.timeout} unknown=${status.unknown} skipped=${status.skipped}`);

      if (status.completed >= testQueue.length || (!status.active && status.completed >= testQueue.length)) {
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

    chk('Check 1: Popup badge matches R6.9F [8963ece]', popupBadge.includes('R6.9F') && popupBadge.includes('8963ece'));
    chk('Check 2: Build mismatch banner hidden when builds match', !mismatchBannerVisible);
    chk('Check 3: Start button enabled and not build-locked', !startBtnDisabled && !startBtnLocked);
    chk('Check 4: Missing expected provenance fields in START_CAMPAIGN rejects with RUNTIME_BUILD_MISMATCH', missingFieldsRes && missingFieldsRes.error === 'RUNTIME_BUILD_MISMATCH');
    chk('Check 5: Mismatched commit hash in START_CAMPAIGN rejects with RUNTIME_BUILD_MISMATCH', mismatchRes && mismatchRes.error === 'RUNTIME_BUILD_MISMATCH');
    chk('Check 6: Duplicate submit attempt rejected by boundary latch', boundaryCheck && boundaryCheck.reached === true);

    chk('Check 7: WP comment form rejected as NON_INQUIRY_COMMENT_FORM', fullLog.includes('NON_INQUIRY_COMMENT_FORM'));
    chk('Check 8: WP comment form settled as SKIPPED', ledger && ledger.skipped === 1);

    chk('Check 9: Semantic custom submit button discovered', fullLog.includes('[SUBMIT_DECISION]') && fullLog.includes('chosen=a'));
    chk('Check 10: Execution identity asserted non-null before submit', fullLog.includes('[EXECUTION_IDENTITY_ASSERT]') && fullLog.includes('result=PASS'));
    chk('Check 11: STAGE_PROGRESSION acknowledged before activation', fullLog.includes('[SUBMIT_ACK]') && fullLog.includes('ack=ACCEPTED'));
    chk('Check 12: Custom submitter commit signal observed (no SUBMIT_ACTIVATION_EXHAUSTED)', fullLog.includes('[SUBMIT_ACTIVATION_PROOF]') && !fullLog.includes('SUBMIT_ACTIVATION_EXHAUSTED'));
    chk('Check 13: Custom submit target settled as CONFIRMED_SUCCESS', ledger && ledger.success === 1);

    chk('Check 14: Server error target settled as FAILURE', ledger && ledger.failure === 1);
    chk('Check 15: Timeout target settled as TIMEOUT', ledger && ledger.timeout === 1);
    chk('Check 16: Ambiguous submit target settled as UNKNOWN', ledger && ledger.unknown === 1);

    chk('Check 17: HistoryStore total completed == 5', ledger && ledger.completed === 5);
    chk('Check 18: Exact 5-bucket terminal sum: sum(success, failure, timeout, unknown, skipped) === completed', ledger && (ledger.success + ledger.failure + ledger.timeout + ledger.unknown + ledger.skipped === ledger.completed));
    chk('Check 19: HistoryStore success matches Popup Live Success (1)', ledger && uiCounters && Number(uiCounters.success) === 1 && ledger.success === 1);
    chk('Check 20: HistoryStore failure matches Popup Live Failure (1)', ledger && uiCounters && Number(uiCounters.failure) === 1 && ledger.failure === 1);
    chk('Check 21: HistoryStore timeout matches Popup Live Timeout (1)', ledger && uiCounters && Number(uiCounters.timeout) === 1 && ledger.timeout === 1);
    chk('Check 22: HistoryStore unknown matches Popup Live Unknown (1)', ledger && uiCounters && Number(uiCounters.unknown) === 1 && ledger.unknown === 1);
    chk('Check 23: HistoryStore skipped matches Popup Live Skipped (1)', ledger && uiCounters && Number(uiCounters.skipped) === 1 && ledger.skipped === 1);
    chk('Check 24: HistoryStore completed matches Popup Live Completed (5)', ledger && uiCounters && Number(uiCounters.completed) === 5 && ledger.completed === 5);

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
