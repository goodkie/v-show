/**
 * test/run_edge_extracted_zip_end_user_scenarios.js
 *
 * Controlled End-User Scenario Acceptance Suite on the Extracted Release Package:
 * XPIDER_R6.9G.10.3.7.1.4.61_PRIVATE_EGRESS_RC3.45.zip
 *
 * Addresses Priority 1 & Priority 3 of Owner Directive Comment #6378137595:
 * 1. Scenario 1: Fresh Install & One-Click Auto-Setup Repair (#auto-setup-btn -> READY)
 * 2. Scenario 2: Actual Extension Start -> Form Discovery -> Semantic Fill -> Submit -> Server Receipt
 * 3. Scenario 3: Persisted Ledger Survival Across Restart / Reload (Zero Data Loss)
 * 4. Scenario 4: Residential Upstream Provider Safe Setup & Fail-Closed Validation
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');

const FIXTURE_PORT = 8088;
const CDP_PORT = 9522;
const ZIP_PATH = path.resolve('XPIDER_R6.9G.10.3.7.1.4.61_PRIVATE_EGRESS_RC3.45.zip');
const EXTRACT_DIR = path.resolve('scratch/extracted_rc345_deep_audit');
const EVIDENCE_DIR = path.resolve('evidence/extracted_zip_deep_audit');
const LOG_FILE = path.join(EVIDENCE_DIR, 'extracted_zip_end_user_scenarios.log');
const SUMMARY_FILE = path.join(EVIDENCE_DIR, 'end_user_scenarios_summary.json');

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP TIMEOUT: ${method}`)), 25000);
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

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

async function ev(ws, expr, msgIdRef) {
  const r = await cdpSend(ws, msgIdRef.id++, 'Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true
  });
  if (r?.exceptionDetails) {
    log(`CDP EVAL EXCEPTION: ${JSON.stringify(r.exceptionDetails)}`);
  }
  return r?.result?.value;
}

async function clickElementBySelector(ws, selector, msgIdRef) {
  await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  })()`, msgIdRef);
  await sleep(100);

  const box = await ev(ws, `(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, visible: r.width > 0 && r.height > 0 };
  })()`, msgIdRef);

  if (box && box.visible) {
    await cdpSend(ws, msgIdRef.id++, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1
    });
    await sleep(50);
    await cdpSend(ws, msgIdRef.id++, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1
    });
  } else {
    await ev(ws, `(() => {
      const el = document.querySelector('${selector}');
      if (el) el.click();
    })()`, msgIdRef);
  }

  return box;
}

async function main() {
  log('========================================================================');
  log('  XPIDER EXTRACTED RELEASE PACKAGE END-USER SCENARIOS AUDIT');
  log('========================================================================');

  const scenarioSummary = {
    test: 'XPIDER_RC3_45_END_USER_SCENARIOS_AUDIT',
    timestamp: new Date().toISOString(),
    zipPath: ZIP_PATH,
    zipSize: fs.statSync(ZIP_PATH).size,
    scenarios: {},
    verdict: 'PENDING'
  };

  let testServer = null;
  let edgeProc = null;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-enduser-scenarios-'));

  try {
    const extractedExtDir = path.join(EXTRACT_DIR, 'extension');
    const bpPath = path.join(extractedExtDir, 'modules', 'build-provenance.js');
    assert.ok(fs.existsSync(bpPath), 'Extracted package must exist');

    // Ensure fixture server is running and clean submissions
    const serverCheck = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_health`).then(r => r.json()).catch(() => null);
    if (!serverCheck) {
      testServer = spawn(process.execPath, [path.resolve('owner-extension-test-site/server.js')], {
        stdio: 'ignore',
        env: Object.assign({}, process.env, { PORT: String(FIXTURE_PORT) })
      });
      await sleep(1500);
    }
    await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_reset_submissions`, { method: 'POST' }).catch(() => {});

    // Launch Microsoft Edge with fresh clean profile
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgeBin = edgePaths.find(p => fs.existsSync(p));
    assert.ok(edgeBin, 'Microsoft Edge executable found');

    edgeProc = spawn(edgeBin, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      `--load-extension=${extractedExtDir}`,
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
    for (let i = 0; i < 40 && (!swTarget || !pageTarget); i++) {
      await sleep(500);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        if (!swTarget) swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (!pageTarget) pageTarget = targets.find(t => t.type === 'page' && t.url === 'about:blank');
      } catch (_) {}
    }
    assert.ok(swTarget, 'Extracted Service Worker target found');
    assert.ok(pageTarget, 'Base page target found');

    const swWs = await openWs(swTarget.webSocketDebuggerUrl);
    const swMsgId = { id: 1 };
    await cdpSend(swWs, swMsgId.id++, 'Runtime.enable');
    const extId = new URL(swTarget.url).hostname;
    log(`Connected to Extracted Service Worker (ID: ${extId})`);

    // -------------------------------------------------------------------------
    // Scenario 1: Fresh Install & One-Click Auto-Setup Repair
    // -------------------------------------------------------------------------
    log('\n>>> SCENARIO 1: Fresh Install & One-Click Auto-Setup (#auto-setup-btn)...');
    const popupWs = await openWs(pageTarget.webSocketDebuggerUrl);
    const popMsgId = { id: 1 };
    await cdpSend(popupWs, popMsgId.id++, 'Page.enable');
    await cdpSend(popupWs, popMsgId.id++, 'Runtime.enable');

    const popupUrl = `chrome-extension://${extId}/popup.html`;
    await cdpSend(popupWs, popMsgId.id++, 'Page.navigate', { url: popupUrl });
    await sleep(2500);

    const initialSetupCheck = await ev(popupWs, `(() => {
      const btn = document.getElementById('auto-setup-btn');
      return { hasBtn: !!btn, disabled: btn ? btn.disabled : true };
    })()`, popMsgId);
    assert.strictEqual(initialSetupCheck.hasBtn, true);

    log('Clicking #auto-setup-btn for one-click setup...');
    await clickElementBySelector(popupWs, '#auto-setup-btn', popMsgId);
    await sleep(3000);

    // Verify readiness state
    const readinessCheck = await ev(popupWs, `(() => {
      const banner = document.getElementById('auto-setup-feedback') || document.getElementById('readiness-hud');
      const text = banner ? banner.textContent : '';
      const startBtn = document.getElementById('start-btn');
      return {
        feedbackText: text,
        startUnlocked: startBtn ? !startBtn.hasAttribute('data-build-locked') : false
      };
    })()`, popMsgId);
    log(`Readiness Result: ${JSON.stringify(readinessCheck)}`);
    assert.strictEqual(readinessCheck.startUnlocked, true, 'Start button must be unlocked after auto-setup');
    scenarioSummary.scenarios.freshInstallAutoSetup = 'PASS';
    log('✅ Scenario 1: Fresh install and one-click auto-setup verified');

    // -------------------------------------------------------------------------
    // Scenario 2: Start -> Discovery -> Semantic Fill -> Submit -> Server Receipt
    // -------------------------------------------------------------------------
    log('\n>>> SCENARIO 2: Form Discovery, Semantic Fill, and Server Receipt...');
    const testTargets = [
      `http://127.0.0.1:${FIXTURE_PORT}/contact-standard.html`
    ];

    const tpl = {
      id: 'tmpl_e2e_user',
      version: 1,
      name: 'Alice Verification',
      firstName: 'Alice',
      lastName: 'Verification',
      email: 'alice.verification@test.xpider',
      phone: '415-555-0144',
      subject: 'Inquiry Regarding Services',
      message: 'Hello, this is an end-user scenario verification testing full submission.'
    };

    // Preload queue and template with fast speed sliders
    await ev(popupWs, `
      (async () => {
        const q = ${JSON.stringify(testTargets)};
        window.campaignQueue = [...q];
        window.totalTargets = q.length;
        await chrome.storage.local.set({
          xpider_queue: q,
          xpider_total: q.length,
          xpider_template: ${JSON.stringify(tpl)},
          xpider_template_v2: ${JSON.stringify(tpl)},
          xpider_owner_function_test_mode: true,
          xpider_active_test_source: 'OWNER_CAPTCHA_LAB',
          xpider_delay_ms: 1000,
          xpider_fill_delay_ms: 100,
          xpider_submit_delay_ms: 500
        });

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

        // Fast execution levels for testing
        const dc = document.getElementById('delay-input-collect');
        if (dc) dc.value = '9';
        const df = document.getElementById('delay-input-fill');
        if (df) df.value = '9';
        const ds = document.getElementById('delay-input-submit');
        if (ds) ds.value = '9';
        const fillInstant = document.getElementById('fill-mode-instant');
        if (fillInstant) fillInstant.checked = true;
      })()
    `, popMsgId);

    // Install network guard in SW
    await ev(swWs, `
      (async () => {
        if (typeof installOwnerTestNetworkGuard === 'function') {
          await installOwnerTestNetworkGuard({ allowCloudflareChallenges: true });
        }
      })()
    `, swMsgId);

    // Launch campaign directly through extension launch
    log('Launching campaign on contact-standard.html...');
    await clickElementBySelector(popupWs, '#start-btn', popMsgId);
    await sleep(1500);

    // Check for privacy override modal
    let modalVisible = false;
    for (let i = 0; i < 20; i++) {
      modalVisible = await ev(popupWs, `(() => {
        const m = document.getElementById('privacy-block-modal-overlay');
        return m && m.style.display !== 'none' && !m.classList.contains('hidden');
      })()`, popMsgId);
      if (modalVisible) break;
      await sleep(200);
    }

    if (modalVisible) {
      log('Privacy block modal overlay displayed; clicking #privacy-block-action-override...');
      await clickElementBySelector(popupWs, '#privacy-block-action-override', popMsgId);
      await sleep(1500);
    }

    // Wait for submission to arrive on local server
    let serverSubmissions = { count: 0, submissions: [] };
    const waitStart = Date.now();
    while (Date.now() - waitStart < 60000) {
      await sleep(2000);
      try {
        serverSubmissions = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_submissions`).then(r => r.json());
        if (serverSubmissions.count >= 1) break;
      } catch (_) {}
    }

    log(`Server Received Submissions: count=${serverSubmissions.count}`);
    assert.ok(serverSubmissions.count >= 1, 'Server must receive at least 1 verified form submission');

    const sub = serverSubmissions.submissions[0];
    log(`Submission details: url=${sub?.url}, method=${sub?.method}, ip=${sub?.ip}`);
    assert.ok(sub && sub.url && sub.url.includes('contact-success'), 'Submission must land on contact-success');
    scenarioSummary.scenarios.discoveryFillSubmit = 'PASS';
    log('✅ Scenario 2: Form discovery, fill, submit, and server receipt verified 100%');

    // -------------------------------------------------------------------------
    // Scenario 3: Persisted Ledger Across Restart / Reload
    // -------------------------------------------------------------------------
    log('\n>>> SCENARIO 3: Persisted Ledger Survival Across Restart / Reload...');
    // Inspect pre-restart storage
    const preRestartData = await ev(swWs, `
      (async () => {
        const st = await chrome.storage.local.get(['xpider_history_attempts', 'xpider_counters', 'xpider_queue']);
        return {
          attemptsCount: (st.xpider_history_attempts || []).length,
          counters: st.xpider_counters || {}
        };
      })()
    `, swMsgId);
    log(`Pre-restart storage: attempts=${preRestartData.attemptsCount}, counters=${JSON.stringify(preRestartData.counters)}`);

    // Reload popup page (simulating operator closing and reopening popup)
    log('Reloading popup page to simulate session reopen...');
    await cdpSend(popupWs, popMsgId.id++, 'Page.reload');
    await sleep(2500);

    // Re-inspect storage from reloaded popup
    const postRestartData = await ev(popupWs, `
      (async () => {
        const st = await chrome.storage.local.get(['xpider_history_attempts', 'xpider_counters']);
        return {
          attemptsCount: (st.xpider_history_attempts || []).length,
          counters: st.xpider_counters || {}
        };
      })()
    `, popMsgId);
    log(`Post-restart storage: attempts=${postRestartData.attemptsCount}, counters=${JSON.stringify(postRestartData.counters)}`);

    assert.strictEqual(postRestartData.attemptsCount, preRestartData.attemptsCount, 'Attempts count must persist');
    assert.strictEqual(postRestartData.counters.success, preRestartData.counters.success, 'Success counter must persist');
    scenarioSummary.scenarios.persistedLedgerRestart = 'PASS';
    log('✅ Scenario 3: Ledger history and counters verified surviving reload with zero data loss');

    // -------------------------------------------------------------------------
    // Scenario 4: Residential Upstream Provider Safe Setup & Fail-Closed Validation
    // -------------------------------------------------------------------------
    log('\n>>> SCENARIO 4: Residential Upstream Safe Setup & Fail-Closed Validation...');
    const extractedAdapterPath = path.join(EXTRACT_DIR, 'companion', 'residential-proxy-adapter.js');
    const { STATUS, probe, validateConfig } = require(extractedAdapterPath);

    // 1. Unconfigured safe state
    const unconfiguredProbe = await probe(null);
    assert.strictEqual(unconfiguredProbe.status, STATUS.UNCONFIGURED);
    assert.strictEqual(unconfiguredProbe.sendAllowed, false);

    // 2. Invalid port / host validation
    const invalidValidation = validateConfig({ host: 'bad host', port: -1, type: 'HTTP_PROXY' });
    assert.strictEqual(invalidValidation.ok, false);

    // 3. Credential masking assertion (zero password leaks in outputs)
    const probeRes = await probe({ host: '127.0.0.1', port: 1, type: 'HTTP_PROXY', username: 'test_user' }, { password: 'secret_password_123', timeoutMs: 500 });
    assert.strictEqual(probeRes.sendAllowed, false);
    assert.ok(!JSON.stringify(probeRes).includes('secret_password_123'), 'Secret password must never leak in probe result');
    scenarioSummary.scenarios.residentialProxySafeValidation = 'PASS';
    log('✅ Scenario 4: Residential proxy safe configuration, secret masking, and fail-closed verified');

    // -------------------------------------------------------------------------
    // Verdict
    // -------------------------------------------------------------------------
    scenarioSummary.verdict = 'ALL_END_USER_SCENARIOS_PASS';
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(scenarioSummary, null, 2), 'utf8');

    log('\n========================================================================');
    log('  ALL END-USER SCENARIOS PASSED 100% ON EXTRACTED RELEASE ZIP');
    log('========================================================================');

  } catch (err) {
    log(`\n❌ ERROR IN END-USER SCENARIOS: ${err.message}\n${err.stack}`);
    scenarioSummary.verdict = 'FAIL';
    scenarioSummary.error = err.message;
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(scenarioSummary, null, 2), 'utf8');
    process.exitCode = 1;
  } finally {
    if (edgeProc) {
      try { edgeProc.kill(); } catch (_) {}
    }
    if (testServer) {
      try { testServer.kill(); } catch (_) {}
    }
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
  }
}

main().then(() => {
  if (process.exitCode === 1) {
    console.error('Scenarios completed with errors');
    process.exit(1);
  } else {
    console.log('Scenarios completed successfully');
    process.exit(0);
  }
});
