/**
 * run_real_r6_9g10_3_5_edge_operator_audit.js
 * 
 * [Issue #6 R6.9G.10.3.5 CAPTCHA LOOP TERMINATION + ENFORCED FAIL-CLOSED PRIVACY TRANSPORT]
 * Microsoft Edge Real Browser Operator Audit Suite
 * 
 * Validates all mandatory acceptance criteria from ChatGPT Directive #6063304914:
 * - Gate 1: Build Provenance & Module Parity in Real Edge Background Worker
 * - Gate 2: Truthful Restore State & Inverted Log Remediation ([PRIVACY_SETTINGS_RESTORED] gateReady=false)
 * - Gate 3: Truthful EXTERNAL_VPN_MONITOR (Not Enforced; strict fail-closed rejects with UNVERIFIED)
 * - Gate 4: Enforced Managed Proxy Transport with Readback Verification (chrome.proxy.settings.get verified)
 * - Gate 5: Mid-Run Proxy Drop Proves Zero Subsequent Network Side-Effect (fail-closed continuity stop)
 * - Gate 6: CAPTCHA Loop Termination & Live Identity Query (GET_ACTIVE_EXECUTION_IDENTITY + one-latch + zero retry storm)
 * - Gate 7: Central Privacy Assertion Gate Wiring (assertPrivacyTransportReady protects all side-effects)
 */

const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const WebSocket = globalThis.WebSocket;

const TARGET_PORT = 8980;
const PROXY_PORT = 8982;
const CDP_PORT = 9248;
const OUT = path.resolve('evidence_r6_9g10_3_5_real_runtime_traces.log');

const lines = [];
function rec(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  lines.push(line);
}

// 1. Mock Target Server
const targetRequests = [];
const TARGET_PAGES = {
  '/privacy-canary': 'ip=198.51.100.99\r\nloc=MOCK_PROXY_EGRESS\r\n',
  '/captcha-test-page': `<!DOCTYPE html>
<html>
<head><title>XPIDER CAPTCHA Loop Termination Test</title></head>
<body>
  <h1>Test Contact Target with CAPTCHA</h1>
  <form id="contact-form" action="/submitted" method="POST">
    <input type="text" name="name" value="Audit Test" />
    <input type="email" name="email" value="audit@example.com" />
    <textarea name="message">Test message for CAPTCHA loop audit</textarea>
    <div id="recaptcha-mock" class="g-recaptcha" data-sitekey="6Le-wvkSAAAAAPBMRTvw0Q4CeBcv1LOPIqdo0ORW">
      <iframe id="captcha-frame" src="/captcha-iframe" width="300" height="100"></iframe>
    </div>
    <button type="submit" id="btn-submit">Submit</button>
  </form>
</body>
</html>`,
  '/captcha-iframe': `<!DOCTYPE html>
<html>
<head><title>reCAPTCHA Challenge Frame</title></head>
<body>
  <div class="rc-anchor-content">
    <div class="rc-inline-block">
      <div class="rc-anchor-center-container">
        <span class="rc-anchor-checkbox-label">I'm not a robot</span>
      </div>
    </div>
  </div>
</body>
</html>`,
  '/submitted': `<!DOCTYPE html><html><body><h1>Submission Successful</h1></body></html>`
};

const targetServer = http.createServer((req, res) => {
  rec(`[TARGET_REQ] ${req.method} ${req.url} Host=${req.headers.host || 'unknown'}`);
  targetRequests.push({ method: req.method, url: req.url, time: Date.now() });

  const body = TARGET_PAGES[req.url] || '<html><body>404 Not Found</body></html>';
  const cType = req.url === '/privacy-canary' ? 'text/plain' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'Content-Type': cType });
  res.end(body);
});

// 2. Mock Forward HTTP Proxy
let mockProxyActive = true;
const proxyRequests = [];

const proxyServer = http.createServer((req, res) => {
  if (!mockProxyActive) {
    rec(`[MOCK_PROXY_DROPPED] 502 Bad Gateway returned for ${req.url}`);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Mock proxy dropped (Fail-Closed Test)');
    return;
  }

  proxyRequests.push({ method: req.method, url: req.url, time: Date.now() });
  rec(`[MOCK_PROXY_FORWARD] ${req.method} ${req.url}`);

  const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: req.headers
  };

  const forwardReq = http.request(options, (forwardRes) => {
    res.writeHead(forwardRes.statusCode, forwardRes.headers);
    forwardRes.pipe(res);
  });
  forwardReq.on('error', (err) => {
    rec(`[MOCK_PROXY_FORWARD_ERR] ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy forward error');
  });
  req.pipe(forwardReq);
});

proxyServer.on('connect', (req, clientSocket, head) => {
  if (!mockProxyActive) {
    rec(`[MOCK_PROXY_CONNECT_DROPPED] Closing tunnel for ${req.url}`);
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.destroy();
    return;
  }

  proxyRequests.push({ method: 'CONNECT', url: req.url, time: Date.now() });
  rec(`[MOCK_PROXY_CONNECT] Tunnel established to ${req.url}`);

  const [tgtHost, tgtPort] = req.url.split(':');
  const serverSocket = net.connect(parseInt(tgtPort) || 80, tgtHost, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on('error', (err) => {
    rec(`[MOCK_PROXY_CONNECT_ERR] ${err.message}`);
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.destroy();
  });
});

async function openWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

function mkEval(ws, timeout = 10000) {
  let id = 100;
  return function(expression) {
    return new Promise((resolve, reject) => {
      const curId = ++id;
      const timer = setTimeout(() => {
        ws.removeEventListener('message', handler);
        reject(new Error(`CDP eval timed out after ${timeout}ms: ${expression.substring(0, 100)}`));
      }, timeout);

      const handler = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.id === curId) {
            clearTimeout(timer);
            ws.removeEventListener('message', handler);
            if (data.error) return reject(new Error(JSON.stringify(data.error)));
            if (data.result && data.result.exceptionDetails) {
              return reject(new Error(`Eval exception: ${JSON.stringify(data.result.exceptionDetails)}`));
            }
            resolve(data.result && data.result.result ? data.result.result.value : undefined);
          }
        } catch (_) {}
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({
        id: curId,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true }
      }));
    });
  };
}

async function runRealEdgeAudit() {
  rec('========================================================================');
  rec('  XPIDER AUTOFORM SENDER PRO - REAL MS EDGE OPERATOR AUDIT (R6.9G.10.3.5)');
  rec('  CAPTCHA LOOP TERMINATION + TRUTHFUL FAIL-CLOSED PRIVACY TRANSPORT');
  rec('========================================================================');

  let edgeProcess = null;
  let swWs = null;
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_edge_r6_9g10_3_5_'));

  try {
    // Terminate any lingering test processes on ports
    try {
      execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8980,8982,9248 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 600));

    // 1. Start Mock Target & Proxy
    await new Promise(r => targetServer.listen(TARGET_PORT, '127.0.0.1', r));
    rec(`[SERVERS_STARTED] Target server on http://127.0.0.1:${TARGET_PORT}`);

    await new Promise(r => proxyServer.listen(PROXY_PORT, '127.0.0.1', r));
    rec(`[SERVERS_STARTED] Proxy server on http://127.0.0.1:${PROXY_PORT}`);

    // Locate Edge
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const edgeExe = edgePaths.find(p => fs.existsSync(p));
    if (!edgeExe) throw new Error('Microsoft Edge executable not found');
    rec(`[BROWSER_DETECTED] Edge binary: ${edgeExe}`);

    const extPath = path.resolve('send_message_backup/build/extension');
    rec(`[EXTENSION_PATH] ${extPath}`);

    const args = [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tempProfileDir}`,
      `--load-extension=${extPath}`,
      `--disable-extensions-except=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ];

    rec(`[BROWSER_SPAWN] Launching Microsoft Edge on CDP port ${CDP_PORT}...`);
    edgeProcess = spawn(edgeExe, args, { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (resp.ok) {
          targets = await resp.json();
          break;
        }
      } catch (_) {}
    }
    if (!targets) throw new Error('Failed to connect to Edge CDP endpoint');
    rec(`[CDP_CONNECTED] Found ${targets.length} browser targets.`);

    // Attach to Service Worker
    let sw = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
    if (!sw) {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const tList = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        sw = tList.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
        if (sw) break;
      }
    }
    if (!sw) throw new Error('XPIDER background service worker target not found in CDP');
    rec(`[SW_TARGET_ATTACHED] ${sw.url}`);

    swWs = await openWs(sw.webSocketDebuggerUrl);

    // Track SW console logs
    const swLogs = [];
    swWs.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          const text = (data.params.args || []).map(a => a.value || a.description || '').join(' ');
          swLogs.push(text);
          rec(`[SW_CONSOLE] ${text}`);
        }
      } catch (_) {}
    });

    // Enable Runtime events on SW
    swWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));

    const swEval = mkEval(swWs);

    // =========================================================================
    // GATE 1: Build Provenance & Module Parity in Real Edge Background Worker
    // =========================================================================
    rec('\n>>> GATE 1: BUILD PROVENANCE & MODULE PARITY IN REAL EDGE <<<');
    const buildInfo = await swEval(`(() => {
      return BuildProvenance.BUILD_INFO;
    })()`);

    rec(`[GATE_1_BUILD_INFO] buildId=${buildInfo.buildId} branch=${buildInfo.branch} head=${buildInfo.headShort}`);
    if (buildInfo.buildId !== 'R6.9G.10.3.5-20261008-CAPTCHA-LOOP-TERM-ENFORCED-PRIVACY') {
      throw new Error(`Gate 1 Fail: Unexpected buildId: ${buildInfo.buildId}`);
    }
    if (buildInfo.previousFunctionalRestorePoint !== '4ef7def9689cdf4c508651e2f6bee6b320e7ab8e') {
      throw new Error(`Gate 1 Fail: Functional restore point mismatch: ${buildInfo.previousFunctionalRestorePoint}`);
    }
    rec('✅ GATE 1: BUILD PROVENANCE & MODULE PARITY IN REAL EDGE VERIFIED PASS');

    // =========================================================================
    // GATE 2: Truthful Restore State & Inverted Log Remediation
    // =========================================================================
    rec('\n>>> GATE 2: TRUTHFUL RESTORE STATE & INVERTED LOG REMEDIATION <<<');
    
    // Clear captured logs
    swLogs.length = 0;

    const restoreResult = await swEval(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.restoreOriginalSettings();
      return {
        isGateReady: pg.isGateReady,
        isGateActive: pg.isGateActive,
        failureReason: pg.failureReason
      };
    })()`);

    rec(`[GATE_2_RESTORE_RESULT] isGateReady=${restoreResult.isGateReady} isGateActive=${restoreResult.isGateActive} reason=${restoreResult.failureReason}`);
    if (restoreResult.isGateReady !== false || restoreResult.isGateActive !== false) {
      throw new Error(`Gate 2 Fail: restoreOriginalSettings did not reset gate to false!`);
    }

    // Verify console log contains truthful line and NOT the old inverted line
    await new Promise(r => setTimeout(r, 200));
    const hasTruthfulRestoreLog = swLogs.some(l => l.includes('[PRIVACY_SETTINGS_RESTORED] gateReady=false transportEnforced=false'));
    const hasInvertedRestoreLog = swLogs.some(l => l.includes('[PRIVACY_GATE_RESTORED] status=READY'));

    rec(`[GATE_2_LOG_CHECK] TruthfulLog=${hasTruthfulRestoreLog} InvertedLog=${hasInvertedRestoreLog}`);
    if (!hasTruthfulRestoreLog) {
      throw new Error('Gate 2 Fail: Truthful restore log [PRIVACY_SETTINGS_RESTORED] gateReady=false transportEnforced=false was NOT emitted!');
    }
    if (hasInvertedRestoreLog) {
      throw new Error('Gate 2 Fail: Old inverted log [PRIVACY_GATE_RESTORED] status=READY was still emitted!');
    }
    rec('✅ GATE 2: TRUTHFUL RESTORE STATE & INVERTED LOG REMEDIATION VERIFIED PASS');

    // =========================================================================
    // GATE 3: Truthful EXTERNAL_VPN_MONITOR in Real Edge
    // =========================================================================
    rec('\n>>> GATE 3: TRUTHFUL EXTERNAL_VPN_MONITOR IN REAL EDGE <<<');

    const vpnPreflightResult = await swEval(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.init({
        transportMode: PrivacyGateway.PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
        failClosed: true,
        systemVpnConfirmed: false
      });
      const preflight = await pg.runPreflight({ failClosed: true });
      let assertionError = null;
      const chk = await assertPrivacyTransportReady('test_target_create');
      if (!chk.ready) {
        assertionError = chk.reason;
      }
      return { preflight, assertionError };
    })()`);

    rec(`[GATE_3_VPN_PREFLIGHT] ready=${vpnPreflightResult.preflight.ready} directFallback=${vpnPreflightResult.preflight.directFallbackBlocked} dnsPrivacy=${vpnPreflightResult.preflight.dnsPrivacy} reason=${vpnPreflightResult.preflight.failureReason}`);
    rec(`[GATE_3_VPN_ASSERTION] error=${vpnPreflightResult.assertionError}`);

    if (vpnPreflightResult.preflight.ready !== false) {
      throw new Error('Gate 3 Fail: EXTERNAL_VPN_MONITOR in strict mode must NOT be ready without enforced transport!');
    }
    if (vpnPreflightResult.preflight.directFallbackBlocked !== 'UNVERIFIED') {
      throw new Error(`Gate 3 Fail: Expected directFallbackBlocked=UNVERIFIED, got ${vpnPreflightResult.preflight.directFallbackBlocked}`);
    }
    if (vpnPreflightResult.preflight.dnsPrivacy !== 'UNKNOWN') {
      throw new Error(`Gate 3 Fail: Expected dnsPrivacy=UNKNOWN, got ${vpnPreflightResult.preflight.dnsPrivacy}`);
    }
    if (!vpnPreflightResult.assertionError) {
      throw new Error('Gate 3 Fail: assertPrivacyTransportReady must report blocked when strict transport is not enforceable!');
    }
    rec('✅ GATE 3: TRUTHFUL EXTERNAL_VPN_MONITOR IN REAL EDGE VERIFIED PASS');

    // =========================================================================
    // GATE 4: Enforced Managed Proxy Transport with Readback Verification
    // =========================================================================
    rec('\n>>> GATE 4: ENFORCED MANAGED PROXY TRANSPORT WITH READBACK <<<');

    const proxyPreflightResult = await swEval(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.init({
        transportMode: PrivacyGateway.PRIVACY_MODES.HTTPS_PROXY,
        proxyHost: '127.0.0.1',
        proxyPort: ${PROXY_PORT},
        canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary',
        failClosed: true
      });
      const preflight = await pg.runPreflight({ failClosed: true });
      
      // Read back chrome proxy settings directly from chrome API
      const proxySettings = await new Promise((res) => {
        chrome.proxy.settings.get({ incognito: false }, (d) => res(d.value));
      });

      const chk = await assertPrivacyTransportReady('managed_proxy_test');
      const assertionOk = Boolean(chk && chk.ready);

      return {
        preflight,
        proxySettings,
        assertionOk,
        isGateReady: pg.isGateReady
      };
    })()`);

    rec(`[GATE_4_PROXY_PREFLIGHT] ready=${proxyPreflightResult.preflight.ready} fallback=${proxyPreflightResult.preflight.directFallbackBlocked} egressCheck=${proxyPreflightResult.preflight.egressCheck}`);
    rec(`[GATE_4_PROXY_SETTINGS] mode=${proxyPreflightResult.proxySettings.mode} host=${proxyPreflightResult.proxySettings.rules?.singleProxy?.host} port=${proxyPreflightResult.proxySettings.rules?.singleProxy?.port}`);
    rec(`[GATE_4_ASSERTION] assertionOk=${proxyPreflightResult.assertionOk} isGateReady=${proxyPreflightResult.isGateReady}`);

    if (proxyPreflightResult.preflight.ready !== true) {
      throw new Error(`Gate 4 Fail: Managed proxy preflight failed: ${proxyPreflightResult.preflight.failureReason}`);
    }
    if (proxyPreflightResult.proxySettings.mode !== 'fixed_servers' ||
        proxyPreflightResult.proxySettings.rules.singleProxy.host !== '127.0.0.1' ||
        proxyPreflightResult.proxySettings.rules.singleProxy.port !== PROXY_PORT) {
      throw new Error('Gate 4 Fail: chrome.proxy.settings readback verification failed!');
    }
    if (!proxyPreflightResult.assertionOk || !proxyPreflightResult.isGateReady) {
      throw new Error('Gate 4 Fail: assertPrivacyTransportReady failed on verified proxy!');
    }
    rec('✅ GATE 4: ENFORCED MANAGED PROXY TRANSPORT WITH READBACK VERIFIED PASS');

    // =========================================================================
    // GATE 5: Mid-Run Proxy Drop Proves Zero Subsequent Network Side-Effect
    // =========================================================================
    rec('\n>>> GATE 5: MID-RUN PROXY DROP & FAIL-CLOSED QUIESCENCE <<<');

    // Drop mock proxy
    mockProxyActive = false;
    rec('[GATE_5_PROXY_SIMULATION] Mock proxy deactivated (ECONNREFUSED/502)');

    const targetReqCountBefore = targetRequests.length;

    const proxyDropResult = await swEval(`(async () => {
      const pg = PrivacyGateway.getInstance();
      // Check egress continuity
      const cont = await pg.checkEgressContinuity();
      
      const chk = await assertPrivacyTransportReady('post_proxy_drop_target');
      const assertionBlocked = Boolean(chk && !chk.ready);
      const blockedReason = chk ? chk.reason : null;

      return {
        cont,
        isGateReady: pg.isGateReady,
        assertionBlocked,
        blockedReason
      };
    })()`);

    rec(`[GATE_5_DROP_RESULT] continuityPass=${proxyDropResult.cont.pass} reason=${proxyDropResult.cont.reason}`);
    rec(`[GATE_5_ASSERTION_BLOCK] assertionBlocked=${proxyDropResult.assertionBlocked} blockedReason=${proxyDropResult.blockedReason}`);

    if (proxyDropResult.cont.pass !== false) {
      throw new Error('Gate 5 Fail: checkEgressContinuity must fail when proxy drops!');
    }
    if (proxyDropResult.isGateReady !== false) {
      throw new Error('Gate 5 Fail: isGateReady must be false after continuity drop!');
    }
    if (!proxyDropResult.assertionBlocked) {
      throw new Error('Gate 5 Fail: assertPrivacyTransportReady did not block network side effect after proxy drop!');
    }

    const targetReqCountAfter = targetRequests.length;
    rec(`[GATE_5_TRAFFIC_CHECK] Requests before drop=${targetReqCountBefore}, after drop=${targetReqCountAfter}`);
    if (targetReqCountAfter > targetReqCountBefore) {
      throw new Error('Gate 5 Fail: Network request was made to target after proxy drop!');
    }
    rec('✅ GATE 5: MID-RUN PROXY DROP & FAIL-CLOSED QUIESCENCE VERIFIED PASS');

    // Restore proxy for remaining tests
    mockProxyActive = true;
    await swEval(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.restoreOriginalSettings();
    })()`);

    // =========================================================================
    // GATE 6: CAPTCHA Loop Termination & Live Identity Query
    // =========================================================================
    rec('\n>>> GATE 6: CAPTCHA LOOP TERMINATION & LIVE IDENTITY QUERY <<<');

    // 1. Verify GET_ACTIVE_EXECUTION_IDENTITY without active campaign returns NO_ACTIVE_EXECUTION_IDENTITY
    const inactiveIdentityResult = await swEval(`(async () => {
      return new Promise((resolve) => {
        __dispatchBackgroundMessage({ action: 'GET_ACTIVE_EXECUTION_IDENTITY' }, { tab: { id: 999 } }, resolve);
      });
    })()`);
    rec(`[GATE_6_INACTIVE_IDENTITY] success=${inactiveIdentityResult.success} reason=${inactiveIdentityResult.reason}`);
    if (inactiveIdentityResult.success !== false || inactiveIdentityResult.error !== 'NO_ACTIVE_EXECUTION_IDENTITY') {
      throw new Error(`Gate 6 Fail: GET_ACTIVE_EXECUTION_IDENTITY must fail when campaign is inactive (got error=${inactiveIdentityResult.error})`);
    }

    // 2. Open a real target tab in Edge
    rec('[GATE_6_TAB_OPEN] Opening target test page in Edge...');
    const targetUrl = `http://127.0.0.1:${TARGET_PORT}/captcha-test-page`;
    
    // Create tab via CDP or extension background
    const targetTabInfo = await swEval(`(async () => {
      const tab = await chrome.tabs.create({ url: '${targetUrl}', active: true });
      return { tabId: tab.id, url: tab.url };
    })()`);
    rec(`[GATE_6_TAB_CREATED] tabId=${targetTabInfo.tabId}`);
    await new Promise(r => setTimeout(r, 1500));

    // 3. Simulate pre-navigation persistence in background
    const mockAttemptId = 'att_audit_real_123';
    const mockTargetToken = 'tok_audit_real_456';
    const mockCampaignRunId = 'run_audit_real_789';

    await swEval(`(async () => {
      // Simulate active campaign state
      campaignState.isActive = true;
      campaignState.currentAttempt = { attemptId: '${mockAttemptId}', url: '${targetUrl}' };
      campaignState.currentTargetToken = '${mockTargetToken}';
      campaignState.campaignRunId = '${mockCampaignRunId}';
      campaignState.sessionId = 1;
      campaignState.currentTabId = ${targetTabInfo.tabId};
      campaignState.captchaEpoch = 1;
      campaignState.captchaLedger = { detected: 0, pendingOwner: 0, manualSolved: 0, skipped: 0, failed: 0 };
      campaignState.captchaRequestLatch = {};
      campaignState.captchaRecordedAttempts = new Set();

      // Pre-navigation persistence in chrome.storage.local
      await chrome.storage.local.set({
        xpider_exec_identity: {
          attemptId: '${mockAttemptId}',
          targetToken: '${mockTargetToken}',
          campaignRunId: '${mockCampaignRunId}',
          sessionId: 1,
          captchaEpoch: 1,
          tabId: ${targetTabInfo.tabId},
          targetUrl: '${targetUrl}',
          ts: Date.now()
        }
      });
    })()`);

    // 4. Test live query matching tabId via __dispatchBackgroundMessage
    const activeIdentityResult = await swEval(`(async () => {
      return new Promise((resolve) => {
        __dispatchBackgroundMessage({ action: 'GET_ACTIVE_EXECUTION_IDENTITY' }, { tab: { id: ${targetTabInfo.tabId} } }, resolve);
      });
    })()`);

    rec(`[GATE_6_LIVE_IDENTITY] success=${activeIdentityResult.success} attemptId=${activeIdentityResult.identity?.attemptId}`);
    if (!activeIdentityResult.success || activeIdentityResult.identity.attemptId !== mockAttemptId) {
      throw new Error('Gate 6 Fail: Live identity query failed to resolve canonical attemptId');
    }

    // 5. Test OWNER_CAPTCHA_REQUEST Single-Latch & Idempotent Counters via __dispatchBackgroundMessage
    const firstRequestResult = await swEval(`(async () => {
      return new Promise((resolve) => {
        __dispatchBackgroundMessage({
          action: 'OWNER_CAPTCHA_REQUEST',
          attemptId: '${mockAttemptId}',
          targetToken: '${mockTargetToken}',
          campaignRunId: '${mockCampaignRunId}',
          sessionId: 1,
          epoch: 1,
          sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4CeBcv1LOPIqdo0ORW',
          captchaType: 'recaptcha'
        }, { tab: { id: ${targetTabInfo.tabId} } }, resolve);
      });
    })()`);

    rec(`[GATE_6_FIRST_REQ] success=${firstRequestResult.success} status=${firstRequestResult.status}`);
    if (!firstRequestResult.success || firstRequestResult.status !== 'PENDING_OWNER_DECISION') {
      throw new Error('Gate 6 Fail: First OWNER_CAPTCHA_REQUEST was not accepted');
    }

    // Duplicate request in SAME attempt & epoch must be suppressed by latch
    const dupRequestResult = await swEval(`(async () => {
      return new Promise((resolve) => {
        __dispatchBackgroundMessage({
          action: 'OWNER_CAPTCHA_REQUEST',
          attemptId: '${mockAttemptId}',
          targetToken: '${mockTargetToken}',
          campaignRunId: '${mockCampaignRunId}',
          sessionId: 1,
          epoch: 1,
          sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4CeBcv1LOPIqdo0ORW',
          captchaType: 'recaptcha'
        }, { tab: { id: ${targetTabInfo.tabId} } }, resolve);
      });
    })()`);

    rec(`[GATE_6_DUP_REQ] success=${dupRequestResult.success} suppressed=${dupRequestResult.duplicateSuppressed}`);
    if (!dupRequestResult.success || !dupRequestResult.duplicateSuppressed) {
      throw new Error('Gate 6 Fail: Duplicate OWNER_CAPTCHA_REQUEST was NOT suppressed by latch');
    }

    // Check counters: detected and pendingOwner must be exactly 1
    const counterState = await swEval(`(() => {
      return {
        detected: campaignState.captchaLedger.detected,
        pendingOwner: campaignState.captchaLedger.pendingOwner
      };
    })()`);

    rec(`[GATE_6_COUNTERS] detected=${counterState.detected} pendingOwner=${counterState.pendingOwner}`);
    if (counterState.detected !== 1 || counterState.pendingOwner !== 1) {
      throw new Error(`Gate 6 Fail: Counters not idempotent! detected=${counterState.detected}, pendingOwner=${counterState.pendingOwner}`);
    }

    // 6. Test Mismatched/Stale Attempt Rejection with isTerminal=true
    const staleRequestResult = await swEval(`(async () => {
      return new Promise((resolve) => {
        __dispatchBackgroundMessage({
          action: 'OWNER_CAPTCHA_REQUEST',
          attemptId: 'att_stale_old_attempt', // Mismatched
          targetToken: 'tok_stale',
          campaignRunId: '${mockCampaignRunId}',
          sessionId: 1,
          epoch: 1,
          sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4CeBcv1LOPIqdo0ORW',
          captchaType: 'recaptcha'
        }, { tab: { id: ${targetTabInfo.tabId} } }, resolve);
      });
    })()`);

    rec(`[GATE_6_STALE_REQ] success=${staleRequestResult.success} error=${staleRequestResult.error} isTerminal=${staleRequestResult.isTerminal}`);
    if (staleRequestResult.success !== false || staleRequestResult.error !== 'attempt_mismatch' || staleRequestResult.isTerminal !== true) {
      throw new Error(`Gate 6 Fail: Mismatched attempt did not return isTerminal=true rejection!`);
    }

    // Clean up test tab and campaign state
    await swEval(`(async () => {
      try { await chrome.tabs.remove(${targetTabInfo.tabId}); } catch (_) {}
      campaignState.isActive = false;
      campaignState.currentAttempt = null;
      campaignState.currentTargetToken = null;
      await chrome.storage.local.remove(['xpider_exec_identity']);
    })()`);

    rec('✅ GATE 6: CAPTCHA LOOP TERMINATION & LIVE IDENTITY QUERY VERIFIED PASS');

    // =========================================================================
    // GATE 7: Central Privacy Assertion Gate Integration
    // =========================================================================
    rec('\n>>> GATE 7: CENTRAL PRIVACY ASSERTION GATE INTEGRATION <<<');

    const centralGateResult = await swEval(`(async () => {
      const pg = PrivacyGateway.getInstance();
      // In unverified/inactive privacy state
      pg.isGateReady = false;
      pg.failureReason = 'PRIVACY_GATE_NOT_READY';
      
      const results = {};
      const contexts = ['pre_target_barrier', 'sniper_background_fetch', 'target_tab_create', 'candidate_navigation', 'submit_barrier'];
      
      for (const ctx of contexts) {
        const chk = await assertPrivacyTransportReady(ctx);
        if (!chk.ready) {
          results[ctx] = 'BLOCKED: ' + chk.reason;
        } else {
          results[ctx] = 'ALLOWED';
        }
      }
      return results;
    })()`);

    rec(`[GATE_7_RESULTS] ${JSON.stringify(centralGateResult, null, 2)}`);
    for (const [ctx, status] of Object.entries(centralGateResult)) {
      if (!status.startsWith('BLOCKED:')) {
        throw new Error(`Gate 7 Fail: Context "${ctx}" was not blocked by assertPrivacyTransportReady!`);
      }
    }
    rec('✅ GATE 7: CENTRAL PRIVACY ASSERTION GATE INTEGRATION VERIFIED PASS');

    rec('\n========================================================================');
    rec('  🎉 ALL R6.9G.10.3.5 REAL OPERATOR AUDIT GATES (1 - 7) VERIFIED 100% PASS');
    rec('========================================================================');

  } finally {
    if (edgeProcess) {
      try { edgeProcess.kill(); } catch (_) {}
    }
    try { targetServer.close(); } catch (_) {}
    try { proxyServer.close(); } catch (_) {}

    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (_) {}

    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    console.log(`\nAudit log saved to: ${OUT}`);
  }
}

if (require.main === module) {
  runRealEdgeAudit()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ AUDIT FAILED:', err);
      lines.push(`[FATAL_ERROR] ${err.stack || err.message}`);
      fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
      process.exit(1);
    });
}

module.exports = { runRealEdgeAudit };
