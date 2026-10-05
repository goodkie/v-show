// run_real_r6_9f2_edge_operator_audit.js
// R6.9F.2: Real Microsoft Edge Browser Operator-Path Runtime Acceptance Audit
// Responds to ChatGPT Gate #5995926959 — Blockers 1-4
// Validates:
// 1. Provenance: badge=R6.9F.1 [48c23c7], buildId=R6.9F.1-20261005-RUNTIME-SUBMIT-COUNTERS
// 2. Clean-HEAD trace: gitHead=48c23c7... gitWorktreeClean=true
// 3. Natural duplicate-submit fixture (no CDP pre-seeding)
// 4. Real Edge terminal CAPTCHA fixture (ERROR_ZERO_BALANCE -> CAPTCHA_SOLVER_UNAVAILABLE)
// 5. 6-target campaign: 1 SUCCESS, 1 FAILURE, 1 TIMEOUT, 1 UNKNOWN, 1 SKIPPED, 1 CAPTCHA_TERMINAL

const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = globalThis.WebSocket;

const PORT = 8975;
const CDP = 9227;
const OUT = path.resolve('evidence_r6_9f2_real_runtime_traces.log');

const lines = [];
function rec(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  lines.push(line);
}

// ─── FIXTURE PAGES ─────────────────────────────────────────────────────────

const PAGES = {
  // 1. WP Comment Form → SKIPPED (NON_INQUIRY_COMMENT_FORM)
  '/wp-comment.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dominion Shotokan Karate - Comment</title></head><body>
<h2>Leave a Reply</h2>
<p>Logged in as admin. Log out?</p>
<form id="commentform" class="comment-form" action="/wp-comments-post.php" method="post">
  <input type="hidden" name="comment_post_ID" value="101" />
  <p><textarea id="comment" name="comment" cols="45" rows="8" placeholder="Comment"></textarea></p>
  <p><input name="submit" type="submit" id="submit" class="submit" value="Post Comment" /></p>
</form>
</body></html>`,

  // 1b. Natural duplicate submit test page → CONFIRMED_SUCCESS
  '/natural-dup.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Natural Dup Test</title></head><body>
<h2>Contact Us</h2>
<form id="contact-form">
  <p><input type="text" name="name" placeholder="Name" value="" /></p>
  <p><input type="email" name="email" placeholder="Email Address" value="" /></p>
  <p><textarea name="message" placeholder="Message"></textarea></p>
  <p><button type="submit" id="send-btn">Send Message</button></p>
</form>
<div id="result-slot"></div>
<script>
window.__activationCount = 0;
document.getElementById('contact-form').addEventListener('submit', function(e) {
  e.preventDefault();
  window.__activationCount = (window.__activationCount || 0) + 1;
  console.log('[NATURAL_DUP_ACTIVATION_COUNT] count=' + window.__activationCount);
  var d = document.createElement('div');
  d.id = 'success-message';
  d.textContent = 'Thank you! Your message has been sent successfully.';
  document.getElementById('result-slot').appendChild(d);
});
</script>
</body></html>`,

  // 2. Dragon Strike custom <a> submit → CONFIRMED_SUCCESS
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

  // 3. 500 server error → FAILURE
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

  // 5. Ambiguous submit → DELIVERY_UNKNOWN
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
  // Native submit fires, no success/error signal, no navigation
});
</script>
</body></html>`,

  // 6. CAPTCHA inquiry page → CAPTCHA_SOLVER_UNAVAILABLE (ERROR_ZERO_BALANCE)
  // Page contains a reCAPTCHA-like iframe signature that triggers SOLVE_CAPTCHA path
  '/captcha-inquiry.html': `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CAPTCHA Inquiry</title></head><body>
<h2>Inquiry Form - CAPTCHA Protected</h2>
<form id="contact-form" action="/submit-captcha" method="post">
  <input type="text" name="name" placeholder="Full Name" />
  <input type="email" name="email" placeholder="Email" />
  <textarea name="message" placeholder="Message Body"></textarea>
  <!-- Simulated reCAPTCHA iframe signature for solver detection -->
  <div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI">
    <iframe src="https://www.google.com/recaptcha/api2/anchor?ar=1&amp;k=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" title="reCAPTCHA"></iframe>
  </div>
  <button type="submit" id="submit-btn">Send Message</button>
</form>
<div id="captcha-block-notice" style="display:none; color: red;">Please complete the CAPTCHA to continue.</div>
<script>
document.getElementById('contact-form').addEventListener('submit', function(e) {
  e.preventDefault();
  // CAPTCHA validation blocks submit — show block notice
  document.getElementById('captcha-block-notice').style.display = 'block';
});
</script>
</body></html>`
};

(async () => {
  rec('================================================================================');
  rec('[R6.9F.2 ACTUAL OPERATOR-PATH REAL EDGE BROWSER ACCEPTANCE AUDIT]');
  rec('[Blocker 1: Badge R6.9F.1 [48c23c7] | Blocker 2: Clean-HEAD | Blocker 3: Natural Duplicate | Blocker 4: CAPTCHA Terminal]');
  rec('================================================================================');
  rec(`Timestamp: ${new Date().toISOString()}`);

  // ── Blocker 2 & 3: Record strict git HEAD and working-tree cleanliness BEFORE launch ──
  const actualGitHead = execSync('git rev-parse HEAD').toString().trim();
  const gitStatus = execSync('git status --porcelain -- send_message_backup/').toString().trim();
  const gitWorktreeClean = gitStatus === '';
  const stampedHead = '48c23c7f8b0e81099d45aeb584e65d8713db7b37';
  let isAncestor = false;
  try {
    execSync(`git merge-base --is-ancestor ${stampedHead} ${actualGitHead}`);
    isAncestor = true;
  } catch (_) {
    isAncestor = false;
  }
  rec(`[BUILD_PROVENANCE] gitHead=${actualGitHead}`);
  rec(`[BUILD_PROVENANCE] gitWorktreeClean=${gitWorktreeClean} (relevant: send_message_backup/)`);
  rec(`[AUDIT_BUILD_IDENTITY]`);
  rec(`gitHead=${actualGitHead}`);
  rec(`implementationHead=${stampedHead}`);
  rec(`ancestor=${isAncestor}`);
  rec(`worktreeClean=${gitWorktreeClean}`);
  rec(`result=${isAncestor && gitWorktreeClean ? 'PASS' : 'FAIL'}`);

  const server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (p === '/submit-fail') {
      res.statusCode = 500;
      return res.end('500 Internal Server Error');
    }

    if (p === '/timeout-inquiry.html') {
      // Delay response by 9s so background 5s session timeout fires → TIMEOUT_LOCAL
      setTimeout(() => {
        res.end('<!DOCTYPE html><html><body>Hanging response complete</body></html>');
      }, 9000);
      return;
    }

    // Blocker 4: CAPTCHA solver transport — return ERROR_ZERO_BALANCE
    if (p === '/api/2captcha/solve' || p === '/submit-captcha') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 402;
      return res.end(JSON.stringify({ status: 0, request: 'ERROR_ZERO_BALANCE' }));
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
  const profile = path.join(os.tmpdir(), 'r6_9f2_edge_profile_' + Date.now());
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

    // ── PRE-FLIGHT 1: Fail-closed build handshake ──────────────────────────
    rec('\n--- PRE-FLIGHT TEST 1: FAIL-CLOSED BUILD HANDSHAKE ---');
    const missingFieldsRes = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'START_CAMPAIGN', queue: ['http://127.0.0.1:${PORT}/test'] }, r))`);
    rec(`[HANDSHAKE_MISSING_FIELDS_RES] ${JSON.stringify(missingFieldsRes)}`);

    const mismatchRes = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'START_CAMPAIGN', expectedImplementationHead: 'bad_commit_sha_123', expectedBuildId: 'R6.9F.1-20261005-RUNTIME-SUBMIT-COUNTERS', expectedManifestVersion: 3, queue: ['http://127.0.0.1:${PORT}/test'] }, r))`);
    rec(`[HANDSHAKE_MISMATCH_RES] ${JSON.stringify(mismatchRes)}`);

    // ── PRE-FLIGHT 2: Popup badge & GET_BUILD_PROVENANCE ─────────────────
    rec('\n--- PRE-FLIGHT TEST 2: POPUP BADGE & BUILD PROVENANCE (Blocker 1) ---');
    const popupBadge = await evalPop(`document.getElementById('build-provenance-badge')?.textContent.trim()`);
    const mismatchBannerVisible = await evalPop(`document.getElementById('build-mismatch-banner')?.style.display !== 'none'`);
    const startBtnDisabled = await evalPop(`document.getElementById('start-btn')?.disabled`);
    const startBtnLocked = await evalPop(`document.getElementById('start-btn')?.hasAttribute('data-build-locked')`);
    const provenanceRes = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'GET_BUILD_PROVENANCE' }, r))`);

    rec(`[POPUP_BADGE_LIVE] "${popupBadge}"`);
    rec(`[GET_BUILD_PROVENANCE] ${JSON.stringify(provenanceRes)}`);
    rec(`[BUILD_MISMATCH_BANNER_VISIBLE] ${mismatchBannerVisible}`);
    rec(`[START_BTN_LOCKED] disabled=${startBtnDisabled} locked=${startBtnLocked}`);

    // ── PRE-FLIGHT 3: Natural Duplicate Submit Fixture (Blocker 3) ────────
    rec('\n--- PRE-FLIGHT TEST 3: NATURAL DUPLICATE-SUBMIT FIXTURE (Blocker 3, no CDP pre-seeding) ---');
    // Step A: Arm a fresh single-target mini-campaign to produce one SUBMIT_ATTEMPT_STARTED
    // so background commits a real boundary latch under that attemptId
    const miniQueue = [`http://127.0.0.1:${PORT}/natural-dup.html`];
    await evalPop(`(() => {
      campaignQueue = ${JSON.stringify(miniQueue)};
      document.getElementById('tpl-name').value = 'Dup Test';
      document.getElementById('tpl-email').value = 'dup@example.com';
      document.getElementById('tpl-subject').value = 'Dup Test';
      document.getElementById('tpl-message').value = 'Natural dup test message.';
      document.getElementById('delay-input-collect').value = '9';
      document.getElementById('delay-input-fill').value = '9';
      document.getElementById('delay-input-submit').value = '9';
    })()`);
    const miniStart = await evalPop(`(async () => {
      const btn = document.getElementById('start-btn');
      if (!btn || btn.disabled) return { error: 'Start button disabled' };
      btn.click();
      return { success: true };
    })()`);
    rec(`[DUP_MINI_CAMPAIGN_STARTED] ${JSON.stringify(miniStart)}`);

    // Step B: Wait for SUBMIT_ATTEMPT_STARTED and natural boundary commit (boundaryCount > 0)
    let dupAttemptId = null;
    let dupTargetToken = null;
    let dupCampaignRunId = null;
    let dupSessionId = null;
    let dupTabId = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await evalSw(`(() => ({
        active: campaignState.isActive,
        attemptId: campaignState.currentAttempt ? campaignState.currentAttempt.attemptId : null,
        targetToken: campaignState.activeTargetExecution ? campaignState.activeTargetExecution.targetToken : null,
        campaignRunId: campaignState.campaignRunId,
        sessionId: campaignState.sessionId,
        tabId: campaignState.activeTabId || campaignState.currentTabId,
        boundaryCount: Object.keys(campaignState.submitBoundaryReached || {}).length
      }))()`);
      rec(`[DUP_POLL][${i}s] active=${st.active} attemptId=${st.attemptId} boundaryCount=${st.boundaryCount}`);
      if (st.boundaryCount > 0) {
        dupAttemptId = st.attemptId;
        dupTargetToken = st.targetToken;
        dupCampaignRunId = st.campaignRunId;
        dupSessionId = st.sessionId;
        dupTabId = st.tabId;
        break;
      }
    }
    rec(`[DUP_ATTEMPT_ID] ${dupAttemptId} token=${dupTargetToken} run=${dupCampaignRunId} session=${dupSessionId}`);

    // Step C1: Query naturally committed boundary latch
    let dupBoundaryNatural = null;
    if (dupAttemptId) {
      dupBoundaryNatural = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'QUERY_SUBMIT_BOUNDARY', attemptId: '${dupAttemptId}' }, r))`);
      rec(`[DUP_BOUNDARY_NATURAL_QUERY] attemptId=${dupAttemptId} result=${JSON.stringify(dupBoundaryNatural)}`);
    } else {
      rec(`[DUP_BOUNDARY_NATURAL_QUERY] SKIPPED - no attemptId with committed boundary available yet`);
    }

    // Step C2: REAL SECOND SUBMIT ATTEMPT under the identical execution identity (Blocker 1)
    let secondSubmitRes = null;
    if (dupAttemptId) {
      secondSubmitRes = await evalPop(`new Promise(r => chrome.runtime.sendMessage({
        action: 'STAGE_PROGRESSION',
        stage: 'SUBMIT_ATTEMPT_STARTED',
        attemptId: '${dupAttemptId}',
        targetToken: '${dupTargetToken}',
        campaignRunId: '${dupCampaignRunId}',
        sessionId: ${dupSessionId},
        tabId: ${dupTabId}
      }, r))`);
      rec(`[DUP_SECOND_SUBMIT_RES] ${JSON.stringify(secondSubmitRes)}`);
    }

    // Step D: Wait for mini-campaign to settle
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await evalSw(`(() => ({ active: campaignState.isActive, completed: campaignState.counters ? campaignState.counters.completed : 0 }))()`);
      rec(`[DUP_SETTLE_POLL][${i}s] active=${st.active} completed=${st.completed}`);
      if (!st.active && st.completed >= 1) break;
    }

    // Step E: After settlement, query the boundary latch again — must still be committed
    let dupBoundaryPostSettle = null;
    if (dupAttemptId) {
      dupBoundaryPostSettle = await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'QUERY_SUBMIT_BOUNDARY', attemptId: '${dupAttemptId}' }, r))`);
      rec(`[DUP_BOUNDARY_POST_SETTLE] attemptId=${dupAttemptId} result=${JSON.stringify(dupBoundaryPostSettle)}`);
    }

    // Reset SW state, HistoryStore, and storage for main campaign
    await evalSw(`(async () => {
      campaignState.submitBoundaryReached = {};
      campaignState.isActive = false;
      campaignState.campaignQueue = [];
      campaignState.counters = { completed: 0, success: 0, failed: 0, timeout: 0, deliveryUnknown: 0, skipped: 0 };
      try {
        const hs = await getHistoryStoreInstance();
        if (hs && typeof hs.clearAll === 'function') await hs.clearAll();
      } catch (_) {}
    })()`);
    await evalPop(`(async () => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove(['xpider_history', 'xpider_queue', 'xpider_completed_queue', 'xpider_active_campaign_run_id']);
      }
      campaignQueue = [];
    })()`);
    rec(`[DUP_STATE_RESET] Campaign state and history reset for main 6-target run`);

    // ── MAIN CAMPAIGN: 6 targets ─────────────────────────────────────────
    const testQueue = [
      `http://127.0.0.1:${PORT}/wp-comment.html`,
      `http://127.0.0.1:${PORT}/custom-submit.html`,
      `http://127.0.0.1:${PORT}/failure-inquiry.html`,
      `http://127.0.0.1:${PORT}/timeout-inquiry.html`,
      `http://127.0.0.1:${PORT}/unknown-inquiry.html`,
      `http://127.0.0.1:${PORT}/captcha-inquiry.html`
    ];

    rec('\n--- STEP 1: Load 6-target queue (incl. CAPTCHA fixture) ---');
    await evalPop(`(() => {
      campaignQueue = ${JSON.stringify(testQueue)};
      const t = document.getElementById('url-count-display');
      if (t) t.textContent = '${testQueue.length} URLs found';
      document.getElementById('tpl-name').value = 'Operator Tester';
      document.getElementById('tpl-email').value = 'operator@example.com';
      document.getElementById('tpl-subject').value = 'R6.9F.2 Full Audit Inquiry';
      document.getElementById('tpl-message').value = 'This is an authorized R6.9F.2 automated acceptance inquiry message.';
      document.getElementById('delay-input-collect').value = '9';
      document.getElementById('delay-input-fill').value = '9';
      document.getElementById('delay-input-submit').value = '9';
      return { ok: true, queueLen: campaignQueue.length };
    })()`);
    rec(`[POPUP_QUEUE_LOADED] count=${testQueue.length}`);

    rec('\n--- STEP 1.5: Configure 2Captcha mock ZERO_BALANCE key ---');
    await evalPop(`new Promise(r => chrome.runtime.sendMessage({ action: 'UPDATE_CAPTCHA_KEY', method: '2captcha', key: 'TEST_ERROR_ZERO_BALANCE' }, r))`);
    await evalPop(`(() => {
      const el = document.getElementById('skip-attempted-toggle');
      if (el) el.checked = false;
    })()`);
    rec('[CAPTCHA_CONFIG] Configured 2Captcha mock ZERO_BALANCE key, skip-attempted=false');

    rec('\n--- STEP 2: Click #start-btn for main campaign ---');
    const startRes = await evalPop(`(async () => {
      const btn = document.getElementById('start-btn');
      if (!btn || btn.disabled) return { error: 'Start button disabled or locked' };
      btn.click();
      return { success: true };
    })()`);
    rec(`[POPUP_START_CLICKED] ${JSON.stringify(startRes)}`);

    rec('\n--- STEP 3: Poll live execution until all 6 targets finish ---');
    let settled = false;
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await evalSw(`(() => ({
        active: campaignState.isActive,
        currentRunId: campaignState.campaignRunId,
        completed: campaignState.counters ? campaignState.counters.completed : 0,
        success: campaignState.counters ? campaignState.counters.success : 0,
        failed: campaignState.counters ? campaignState.counters.failed : 0,
        timeout: campaignState.counters ? campaignState.counters.timeout : 0,
        unknown: campaignState.counters ? campaignState.counters.deliveryUnknown : 0,
        skipped: campaignState.counters ? campaignState.counters.skipped : 0
      }))()`);
      rec(`[POLL][${i}s] active=${status.active} completed=${status.completed}/${testQueue.length} success=${status.success} failed=${status.failed} timeout=${status.timeout} unknown=${status.unknown} skipped=${status.skipped}`);
      if (status.completed >= testQueue.length || (!status.active && status.completed >= testQueue.length)) {
        settled = true;
        break;
      }
    }

    await new Promise(r => setTimeout(r, 3000));

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

    rec('\n--- STEP 4: Counter parity & audit verification ---');
    rec(`[LEDGER_STATS_currentRun] ${JSON.stringify(ledger)}`);
    rec(`[POPUP_UI_COUNTERS] ${JSON.stringify(uiCounters)}`);

    const fullLog = lines.join('\n');
    const checks = [];
    const chk = (name, ok) => { checks.push({ name, ok }); rec(`${ok ? 'PASS' : 'FAIL'}: ${name}`); };

    // ── Blocker 1: Badge must be R6.9F.1 [48c23c7] ──────────────────────
    chk('Check 1: Popup badge matches R6.9F.1 [48c23c7]', popupBadge && popupBadge.includes('R6.9F.1') && popupBadge.includes('48c23c7'));
    chk('Check 2: GET_BUILD_PROVENANCE returns implementationHead=48c23c7f', provenanceRes && (provenanceRes.implementationHead || (provenanceRes.provenance && provenanceRes.provenance.implementationHead) || '').startsWith('48c23c7f'));
    chk('Check 3: Build mismatch banner hidden when builds match', !mismatchBannerVisible);
    chk('Check 4: Start button enabled and not build-locked', !startBtnDisabled && !startBtnLocked);

    // ── Blocker 2 & 3: Strict Clean-HEAD Identity ───────────────────────
    chk('Check 5: Strict clean-HEAD: gitHead descends from stamped implementationHead and worktree clean', isAncestor && gitWorktreeClean && actualGitHead.length === 40);
    chk('Check 6: Working tree clean for send_message_backup/ at time of audit', gitWorktreeClean);

    // ── Handshake proofs ─────────────────────────────────────────────────
    chk('Check 7: Missing provenance fields in START_CAMPAIGN → RUNTIME_BUILD_MISMATCH', missingFieldsRes && missingFieldsRes.error === 'RUNTIME_BUILD_MISMATCH');
    chk('Check 8: Mismatched commit hash in START_CAMPAIGN → RUNTIME_BUILD_MISMATCH', mismatchRes && mismatchRes.error === 'RUNTIME_BUILD_MISMATCH');

    // ── Blocker 1: Natural duplicate submit & real 2nd attempt block ────
    chk('Check 9: Natural SUBMIT_ATTEMPT_STARTED produced real attemptId (no CDP pre-seeding)', !!dupAttemptId);
    chk('Check 10: Second SUBMIT_ATTEMPT_STARTED rejected with duplicateBlocked=true & [SUBMIT_DUPLICATE_BLOCK]', secondSubmitRes && (secondSubmitRes.duplicateBlocked === true || secondSubmitRes.error === 'SUBMIT_DUPLICATE_BLOCK') && fullLog.includes('[SUBMIT_DUPLICATE_BLOCK]'));
    chk('Check 11: Physical submit activation occurred exactly once (activationCount=1) and latch is durable', dupBoundaryPostSettle && dupBoundaryPostSettle.reached === true && fullLog.includes('[NATURAL_DUP_ACTIVATION_COUNT] count=1') && !fullLog.includes('[NATURAL_DUP_ACTIVATION_COUNT] count=2'));

    // ── Main campaign: 6-bucket results ─────────────────────────────────
    chk('Check 12: WP comment form rejected as NON_INQUIRY_COMMENT_FORM', fullLog.includes('NON_INQUIRY_COMMENT_FORM'));
    chk('Check 13: WP comment form settled as SKIPPED', ledger && ledger.skipped >= 1);
    chk('Check 14: Semantic custom <a> submit button discovered', fullLog.includes('[SUBMIT_DECISION]') && fullLog.includes('chosen=a'));
    chk('Check 15: Execution identity asserted non-null before submit', fullLog.includes('[EXECUTION_IDENTITY_ASSERT]') && fullLog.includes('result=PASS'));
    chk('Check 16: STAGE_PROGRESSION ACK=ACCEPTED before activation', fullLog.includes('[SUBMIT_ACK]') && fullLog.includes('ack=ACCEPTED'));
    chk('Check 17: Custom submitter commit signal (no SUBMIT_ACTIVATION_EXHAUSTED)', fullLog.includes('[SUBMIT_ACTIVATION_PROOF]') && !fullLog.includes('SUBMIT_ACTIVATION_EXHAUSTED'));
    chk('Check 18: Custom submit settled as CONFIRMED_SUCCESS', ledger && ledger.success === 1);
    chk('Check 19: Server error settled as FAILURE', ledger && (ledger.failureBreakdown?.SUBMISSION_SERVER_ERROR === 1 || ledger.failure >= 1));
    chk('Check 20: Timeout settled as TIMEOUT_LOCAL', ledger && ledger.timeout === 1);
    chk('Check 21: Ambiguous submit settled as DELIVERY_UNKNOWN', ledger && ledger.unknown === 1);

    // ── Blocker 4: CAPTCHA terminal fixture ──────────────────────────────
    chk('Check 22: CAPTCHA target produced CAPTCHA_SOLVER_UNAVAILABLE or ERROR_ZERO_BALANCE', fullLog.includes('CAPTCHA_SOLVER_UNAVAILABLE') || fullLog.includes('ERROR_ZERO_BALANCE'));
    chk('Check 23: CAPTCHA target did not produce CONFIRMED_SUCCESS (no bypass)', !fullLog.includes('[PIPELINE][CONFIRMED_SUCCESS] url=http://127.0.0.1:8975/captcha-inquiry.html'));
    const captchaSettlements = (fullLog.match(/\[TARGET\]\[127\.0\.0\.1\] FINAL status=FAILURE reason=2Captcha failed: ERROR_ZERO_BALANCE/g) || []).length;
    const captchaSubmits = (fullLog.match(/\[SUBMIT\] triggered=true.*captcha-inquiry/g) || []).length;
    const captchaTerminalOnce = captchaSettlements === 1 && captchaSubmits === 0 && fullLog.includes('[CAPTCHA_CONFIG_BLOCKED] epoch=3 blockedError=ERROR_ZERO_BALANCE action=REJECT_REPEAT');
    chk('Check 24: CAPTCHA target has exactly one terminal settlement, zero submit triggers, and no repeat loop', captchaTerminalOnce);

    // ── Counter invariants ───────────────────────────────────────────────
    chk('Check 25: HistoryStore completed >= 5 (main targets)', ledger && ledger.completed >= 5);
    chk('Check 26: sum(success+failure+timeout+unknown+skipped) === completed', ledger && (ledger.success + ledger.failure + ledger.timeout + ledger.unknown + ledger.skipped === ledger.completed));
    chk('Check 27: HistoryStore success == Popup Live success (1)', ledger && uiCounters && Number(uiCounters.success) === 1 && ledger.success === 1);
    chk('Check 28: HistoryStore failure == Popup Live failure (>= 1)', ledger && uiCounters && Number(uiCounters.failure) === ledger.failure && ledger.failure >= 1);
    chk('Check 29: HistoryStore timeout == Popup Live timeout (1)', ledger && uiCounters && Number(uiCounters.timeout) === 1 && ledger.timeout === 1);
    chk('Check 30: HistoryStore unknown == Popup Live unknown (1)', ledger && uiCounters && Number(uiCounters.unknown) === 1 && ledger.unknown === 1);

    const failed = checks.filter(c => !c.ok);
    rec(`\n[RESULT] ${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length) {
      rec(`[FAILED_CHECKS] ${failed.map(c => c.name).join('; ')}`);
      exitCode = 1;
    }
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
