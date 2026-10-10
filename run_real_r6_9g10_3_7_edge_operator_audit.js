/**
 * run_real_r6_9g10_3_7_edge_operator_audit.js
 * 
 * [Issue #6 R6.9G.10.3.7 PHYSICAL ROUTER SECURITY GATE + WIREGUARD PRIMARY / OPENVPN FALLBACK + PRIVATE HTTP CONNECT EGRESS]
 * Real Microsoft Edge Operator Audit Suite
 * 
 * Cryptographically verifies extracted ZIP bytes and executes in real Microsoft Edge:
 * 1. Exact-Release ZIP Verification (size & SHA-256) and extraction.
 * 2. Companion Lifecycle: install via install_companion.bat from extracted release bytes.
 * 3. Edge MV3 Background & Popup UI integration:
 *    - Scenario 1: Initial/Default state -> Physical Gate DISABLED -> legacy transport allowed.
 *    - Scenario 2: Enable Physical Gate -> Router unverified/disconnected -> immediate FAIL-CLOSED (badge red, network blocked).
 *    - Scenario 3: Reject public proxy in Physical Gate mode (PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE).
 *    - Scenario 4: Router pairing & WireGuard primary telemetry -> all 10 layers pass -> READY (ENFORCED) (badge green, pre-flight pass).
 *    - Scenario 5: WireGuard failover to OpenVPN fallback (tun0, TCP/443) -> remains READY (ENFORCED) with OpenVPN tunnel.
 *    - Scenario 6: Kill-Switch tampered / DISABLED -> immediate FAIL-CLOSED (badge red, traffic dropped).
 *    - Scenario 7: Full uninstall via extracted uninstall_companion.bat --silent -> registry cleaned, daemon stopped.
 */

const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const WebSocket = globalThis.WebSocket;

const TARGET_PORT = 8980;
const PRIVATE_PROXY_PORT = 8982;
const PUBLIC_PROXY_PORT = 8983;
const MOCK_ROUTER_PORT = 8985;
const CDP_PORT = 9255;
const OUT = path.resolve('evidence_r6_9g10_3_7_real_runtime_traces.log');
const ZIP_PATH = path.resolve('XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip');

const EXPECTED_ZIP_SIZE = 4376748;
const EXPECTED_ZIP_SHA = 'ce5b2aa7ad423c08b0b818c23d66b49687364e9a36228f8da520ebf862234803';

const FUNCTIONAL_SHA = 'd9701fcf8121948dd163f1e56110e5f2a9f917c3';
const PROVENANCE_SHA = '683ae948d2bcb8b1795d8e7919f26a2ae2b1810e';

const lines = [];
function rec(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  lines.push(line);
}

process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return;
  }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// 1. Mock Target Server (Port 8980)
const targetRequests = [];
const targetServer = http.createServer((req, res) => {
  rec(`[TARGET_REQ] ${req.method} ${req.url} Host=${req.headers.host || 'unknown'}`);
  targetRequests.push({ method: req.method, url: req.url, time: Date.now() });

  if (req.url.startsWith('/privacy-canary')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ip=10.66.66.1\r\nloc=VPS_PRIVATE_EGRESS_OK\r\n');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!DOCTYPE html><html><body><h1>Physical Gate Target</h1></body></html>');
});

// 2. Mock Forward HTTP Proxy
function createMockProxy(port, simulatedIp, name) {
  let active = true;
  const srv = http.createServer((req, res) => {
    if (!active) {
      rec(`[${name}_DROPPED] Rejecting request ${req.url} (active=false)`);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy dropped');
      return;
    }

    const parsedUrl = new URL(req.url);
    const targetReq = http.request({
      hostname: parsedUrl.hostname || '127.0.0.1',
      port: parsedUrl.port || TARGET_PORT,
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: req.headers
    }, (targetRes) => {
      res.writeHead(targetRes.statusCode, targetRes.headers);
      targetRes.pipe(res);
    });

    targetReq.on('error', (err) => {
      res.writeHead(502);
      res.end(`Target Error: ${err.message}`);
    });
    req.pipe(targetReq);
  });

  srv.on('connect', (req, clientSocket, head) => {
    clientSocket.on('error', () => {});
    if (!active) {
      rec(`[${name}_CONNECT_DROPPED] Rejecting CONNECT ${req.url}`);
      try {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
      } catch (_) {}
      return;
    }

    const [host, targetPort] = req.url.split(':');
    const targetSocket = net.connect(parseInt(targetPort, 10) || 80, host, () => {
      try {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        targetSocket.write(head);
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      } catch (_) {}
    });

    targetSocket.on('error', () => {
      try {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
      } catch (_) {}
    });
  });

  return {
    server: srv,
    port,
    setActive: (val) => { active = val; }
  };
}

const mockPrivateProxy = createMockProxy(PRIVATE_PROXY_PORT, '10.66.66.1', 'MOCK_PRIVATE_PROXY');
const mockPublicProxy = createMockProxy(PUBLIC_PROXY_PORT, '198.51.100.101', 'MOCK_PUBLIC_PROXY');

// 3. Mock GL.iNet Opal Router Attestation Server (Port 8985)
let mockRouterState = {
  model: 'GL-SFT1200',
  boardId: 'sft1200',
  publicKey: 'opal-key-abc12345',
  firmwareVersion: '4.3.7-release',
  lanGateway: '10.66.66.1',
  lanInterface: 'br-lan',
  wireguard: {
    state: 'UP',
    interfaceName: 'wgclient',
    lastHandshakeAgeSec: 12,
    tunnelPrivateAddress: '10.66.66.2'
  },
  openvpn: {
    state: 'DOWN',
    interfaceName: 'tun0',
    tunnelPrivateAddress: '10.67.67.2'
  },
  killSwitch: {
    state: 'ENFORCED',
    evidence: ['iptables -C FORWARD -o eth0 -j REJECT']
  },
  dns: {
    state: 'VPN_BOUND'
  },
  ipv6Disabled: true
};

const mockRouterServer = http.createServer((req, res) => {
  rec(`[MOCK_ROUTER_REQ] ${req.method} ${req.url}`);
  if (req.url === '/api/xpider/attest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockRouterState));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', reject);
  });
}

function mkEval(ws, timeout = 15000) {
  let callId = 100;
  return function(expression) {
    return new Promise((resolve, reject) => {
      const id = ++callId;
      const timer = setTimeout(() => {
        ws.removeEventListener('message', handler);
        reject(new Error(`Eval timed out after ${timeout}ms: ${expression.substring(0, 100)}`));
      }, timeout);

      const handler = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.id === id) {
            clearTimeout(timer);
            ws.removeEventListener('message', handler);
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else if (msg.result && msg.result.exceptionDetails) {
              const ex = msg.result.exceptionDetails;
              const text = ex.exception ? (ex.exception.description || ex.exception.value) : ex.text;
              reject(new Error(text || 'Runtime.evaluate exception'));
            } else {
              resolve(msg.result && msg.result.result ? msg.result.result.value : undefined);
            }
          }
        } catch (_) {}
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true
        }
      }));
    });
  };
}

function isPortListening(port = 18989) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
    sock.setTimeout(500, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function killRelayProcesses() {
  try {
    execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 18989 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \\"CommandLine LIKE \'%privacy-relay-service.js%\'\\" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
  } catch (_) {}
}

async function runRealEdgeAudit() {
  rec('========================================================================');
  rec('  XPIDER AUTOFORM SENDER PRO - REAL MS EDGE OPERATOR AUDIT (R6.9G.10.3.7)');
  rec('  PHYSICAL ROUTER SECURITY GATE + WIREGUARD / OPENVPN + PRIVATE HTTP CONNECT');
  rec('========================================================================');
  rec(`[PROVENANCE_RECORD] functionalSha=${FUNCTIONAL_SHA}`);
  rec(`[PROVENANCE_RECORD] provenanceSha=${PROVENANCE_SHA}`);

  let edgeProcess = null;
  let swWs = null;
  let popupWs = null;
  const tempProfileDir = path.join(os.tmpdir(), `xpider_edge_profile_r6_9g10_3_7_${Date.now()}`);
  const tempExtractDir = path.join(os.tmpdir(), `xpider_exact_release_r6_9g10_3_7_${Date.now()}`);

  try {
    // -------------------------------------------------------------
    // PREREQUISITE: EXACT RELEASE ZIP VERIFICATION & EXTRACTION
    // -------------------------------------------------------------
    rec('\n>>> PREREQUISITE: CRYPTOGRAPHIC VERIFICATION OF EXACT RELEASE ZIP <<<');
    if (!fs.existsSync(ZIP_PATH)) {
      throw new Error(`Exact release ZIP not found: ${ZIP_PATH}`);
    }

    const zipBuffer = fs.readFileSync(ZIP_PATH);
    const observedZipSize = zipBuffer.length;
    const observedZipSha = crypto.createHash('sha256').update(zipBuffer).digest('hex');

    rec(`[EXACT_RELEASE_ZIP] expectedSha=${EXPECTED_ZIP_SHA} observedSha=${observedZipSha} size=${observedZipSize}`);

    if (observedZipSize !== EXPECTED_ZIP_SIZE) {
      throw new Error(`ZIP size mismatch: expected ${EXPECTED_ZIP_SIZE}, observed ${observedZipSize}`);
    }
    if (observedZipSha !== EXPECTED_ZIP_SHA) {
      throw new Error(`ZIP SHA mismatch: expected ${EXPECTED_ZIP_SHA}, observed ${observedZipSha}`);
    }

    fs.mkdirSync(tempExtractDir, { recursive: true });
    rec(`[EXACT_RELEASE_EXTRACTION] Extracting to ${tempExtractDir}...`);
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${tempExtractDir}' -Force"`);

    const extractedExtDir = path.join(tempExtractDir, 'extension');
    const extractedCompDir = path.join(tempExtractDir, 'companion');
    const extractedRouterDir = path.join(tempExtractDir, 'router');
    const extractedInfraDir = path.join(tempExtractDir, 'infra');

    if (!fs.existsSync(extractedExtDir) || !fs.existsSync(path.join(extractedExtDir, 'manifest.json'))) {
      throw new Error(`Extracted extension directory invalid: ${extractedExtDir}`);
    }
    if (!fs.existsSync(extractedCompDir) || !fs.existsSync(path.join(extractedCompDir, 'privacy-relay-service.js'))) {
      throw new Error(`Extracted companion directory invalid: ${extractedCompDir}`);
    }
    if (!fs.existsSync(path.join(extractedCompDir, 'physical-gate.js'))) {
      throw new Error('physical-gate.js missing from extracted companion');
    }
    if (!fs.existsSync(path.join(extractedCompDir, 'router-attestation.js'))) {
      throw new Error('router-attestation.js missing from extracted companion');
    }
    if (!fs.existsSync(path.join(extractedCompDir, 'windows-network-attestation.js'))) {
      throw new Error('windows-network-attestation.js missing from extracted companion');
    }

    rec(`[EXACT_RELEASE_EXTENSION_PATH] ${extractedExtDir}`);
    rec(`[EXACT_RELEASE_COMPANION_PATH] ${extractedCompDir}`);
    rec(`[EXACT_RELEASE_ROUTER_PATH] ${extractedRouterDir}`);
    rec(`[EXACT_RELEASE_INFRA_PATH] ${extractedInfraDir}`);

    const winsec = require(path.join(extractedCompDir, 'winsec.js'));
    const extractedConfigFile = path.join(extractedCompDir, 'egress_pool_config.json');

    const getExtractedToken = () => {
      const tokenPath = path.join(extractedCompDir, '.control_token');
      try {
        if (fs.existsSync(tokenPath)) return fs.readFileSync(tokenPath, 'utf8').trim();
      } catch (_) {}
      return null;
    };

    const queryExtractedStatus = async () => {
      const token = getExtractedToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('http://127.0.0.1:18989/status', { headers });
      if (res.ok) return await res.json();
      throw new Error(`Relay /status error HTTP ${res.status}`);
    };

    const queryExtractedPhysicalGate = async () => {
      const token = getExtractedToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('http://127.0.0.1:18989/physical-gate/status', { headers });
      if (res.ok) return await res.json();
      throw new Error(`Relay /physical-gate/status error HTTP ${res.status}`);
    };

    // -------------------------------------------------------------
    // START LOCAL TEST SERVERS
    // -------------------------------------------------------------
    rec('\n>>> STARTING LOCAL AUDIT TEST FIXTURE SERVERS <<<');
    killRelayProcesses();
    await new Promise(r => setTimeout(r, 600));

    await new Promise((r) => targetServer.listen(TARGET_PORT, '127.0.0.1', r));
    rec(`[TARGET_SERVER] Running on http://127.0.0.1:${TARGET_PORT}`);
    await new Promise((r) => mockPrivateProxy.server.listen(PRIVATE_PROXY_PORT, '127.0.0.1', r));
    rec(`[MOCK_PRIVATE_PROXY] Running on http://127.0.0.1:${PRIVATE_PROXY_PORT}`);
    await new Promise((r) => mockPublicProxy.server.listen(PUBLIC_PROXY_PORT, '127.0.0.1', r));
    rec(`[MOCK_PUBLIC_PROXY] Running on http://127.0.0.1:${PUBLIC_PROXY_PORT}`);
    await new Promise((r) => mockRouterServer.listen(MOCK_ROUTER_PORT, '127.0.0.1', r));
    rec(`[MOCK_ROUTER_SERVER] Running on http://127.0.0.1:${MOCK_ROUTER_PORT}`);

    // Pre-configure extracted companion pool config with default settings & canary URL
    fs.writeFileSync(extractedConfigFile, JSON.stringify({
      version: '1.0.4',
      rotationMode: 'FIXED',
      healthCheckTimeoutMs: 5000,
      healthTtlMs: 60000,
      canaryUrl: `http://127.0.0.1:${TARGET_PORT}/privacy-canary`,
      selectedEgressId: null,
      physicalGate: { enabled: false },
      nodes: []
    }, null, 2), 'utf8');

    // -------------------------------------------------------------
    // INSTALL COMPANION FROM EXTRACTED RELEASE ZIP
    // -------------------------------------------------------------
    rec('\n>>> INSTALL COMPANION VIA EXTRACTED install_companion.bat <<<');
    const installBat = path.join(extractedCompDir, 'install_companion.bat');
    rec(`[INSTALL_BAT] Executing: ${installBat}`);
    execSync(`cmd.exe /c "${installBat}"`, { stdio: 'inherit' });

    // Wait for installed companion to initialize
    let installedLive = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      if (await isPortListening(18989) && getExtractedToken()) {
        installedLive = true;
        break;
      }
    }
    const token = getExtractedToken();
    rec(`[COMPANION_INITIAL_INSTALL_LIVE] port18989=${installedLive} token=${token ? token.substring(0, 8) + '...' : 'NONE'}`);
    if (!installedLive || !token) throw new Error('Companion service did not start successfully on port 18989');

    // -------------------------------------------------------------
    // LAUNCH REAL MICROSOFT EDGE WITH EXTRACTED EXTENSION
    // -------------------------------------------------------------
    rec('\n>>> LAUNCHING MICROSOFT EDGE WITH EXTRACTED MV3 EXTENSION <<<');
    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    const edgeBinary = edgePaths.find((p) => fs.existsSync(p));
    if (!edgeBinary) throw new Error('Microsoft Edge executable not found');
    rec(`[EDGE_BINARY] Found: ${edgeBinary}`);

    edgeProcess = spawn(edgeBinary, [
      `--user-data-dir=${tempProfileDir}`,
      `--load-extension=${extractedExtDir}`,
      `--disable-extensions-except=${extractedExtDir}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ], { stdio: 'ignore' });

    // Wait for CDP service worker target
    let targets = null;
    let swTarget = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (res.ok) {
          targets = await res.json();
          swTarget = targets.find((t) => t.type === 'service_worker' && t.url && t.url.includes('background.js'));
          if (swTarget) break;
        }
      } catch (_) {}
    }

    if (!targets) throw new Error('CDP port did not respond in time');
    if (!swTarget) throw new Error('XPIDER background service worker target not found in Edge');
    rec(`[SW_TARGET_FOUND] ws=${swTarget.webSocketDebuggerUrl}`);

    swWs = await openWs(swTarget.webSocketDebuggerUrl);
    const evalSw = mkEval(swWs);

    const extId = (new URL(swTarget.url)).hostname;
    rec(`[RESOLVED_EXTENSION_ID] ${extId}`);

    // Wait for SW boot and verify BuildProvenance in real Edge
    let buildInfo = null;
    for (let i = 0; i < 25; i++) {
      try {
        buildInfo = await evalSw('(typeof BuildProvenance !== "undefined" && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : (typeof self !== "undefined" && self.BuildProvenance ? self.BuildProvenance.BUILD_INFO : null)');
        if (buildInfo) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 400));
    }
    if (!buildInfo) throw new Error('BuildProvenance not defined in service worker after 10s');

    rec(`[BUILD_PROVENANCE_CHECK] buildId=${buildInfo.buildId} headShort=${buildInfo.headShort} implementationHead=${buildInfo.implementationHead}`);

    if (buildInfo.buildId !== 'R6.9G.10.3.7-20261010-PHYSICAL-GATE-WIREGUARD-FALLBACK-OPAL-READY') {
      throw new Error(`BuildId mismatch: expected R6.9G.10.3.7-20261010-PHYSICAL-GATE-WIREGUARD-FALLBACK-OPAL-READY, got ${buildInfo.buildId}`);
    }
    if (buildInfo.headShort !== 'd9701fcf') {
      throw new Error(`headShort mismatch: expected d9701fcf, got ${buildInfo.headShort}`);
    }

    // Configure PrivacyGateway in background to use local canary URL and authenticate with Companion
    await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.init();
      pg.config.canaryUrl = 'http://127.0.0.1:${TARGET_PORT}/privacy-canary';
      await pg.saveConfig({ canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary' });
      await pg.ensureRelayActive(true);
    })()`);

    // Open popup.html in a new tab via CDP
    const popupUrl = `chrome-extension://${extId}/popup.html`;
    rec(`[POPUP_OPEN] Opening ${popupUrl} via CDP...`);
    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' });
    const popupTarget = await newTabRes.json();
    rec(`[POPUP_TARGET_CREATED] ws=${popupTarget.webSocketDebuggerUrl}`);

    popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
    const evalPopup = mkEval(popupWs);

    // Wait for popup DOM hydration
    await new Promise(r => setTimeout(r, 1000));
    await evalPopup(`refreshRelayStatus()`);
    await new Promise(r => setTimeout(r, 800));

    // =========================================================================
    // SCENARIO 1: INITIAL STATE -> PHYSICAL GATE DISABLED -> LEGACY TRANSPORT PASS
    // =========================================================================
    rec('\n>>> SCENARIO 1: VERIFY INITIAL STATE (PHYSICAL GATE DISABLED) <<<');
    const s1Popup = await evalPopup(`({
      hasCard: Boolean(document.getElementById('physical-gate-card')),
      toggleChecked: document.getElementById('physical-gate-toggle')?.checked,
      gateReadyText: document.getElementById('phys-gate-ready')?.textContent?.trim()
    })`);
    rec(`[SCENARIO_1_POPUP] hasCard=${s1Popup.hasCard} toggle=${s1Popup.toggleChecked} readyText="${s1Popup.gateReadyText}"`);

    if (!s1Popup.hasCard) throw new Error('Scenario 1 Failed: physical-gate-card not found in popup.html');
    if (s1Popup.toggleChecked !== false) throw new Error('Scenario 1 Failed: Physical Gate toggle should be initially unchecked');
    if (s1Popup.gateReadyText !== 'DISABLED') throw new Error(`Scenario 1 Failed: Expected readyText "DISABLED", got "${s1Popup.gateReadyText}"`);

    // Pre-flight check in background: when disabled, physical gate passes through
    const s1Preflight = await evalSw(`assertPhysicalGateReady('TEST_SCENARIO_1')`);
    rec(`[SCENARIO_1_PREFLIGHT] ready=${s1Preflight.ready}`);
    if (!s1Preflight.ready) {
      throw new Error('Scenario 1 Failed: assertPhysicalGateReady did not pass through when disabled');
    }
    rec('✅ SCENARIO 1: INITIAL DISABLED STATE VERIFIED PASS');

    // =========================================================================
    // SCENARIO 2: ENABLE PHYSICAL GATE -> FAIL-CLOSED (UNVERIFIED / DISCONNECTED)
    // =========================================================================
    rec('\n>>> SCENARIO 2: ENABLE PHYSICAL GATE -> FAIL-CLOSED WHEN UNVERIFIED <<<');

    // Toggle ON via popup UI
    const s2Toggle = await evalPopup(`(async () => {
      const toggle = document.getElementById('physical-gate-toggle');
      toggle.click();
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 200));
        const readyText = document.getElementById('phys-gate-ready')?.textContent?.trim();
        if (readyText === 'FAIL-CLOSED (BLOCKED)') break;
      }
      return {
        checked: toggle.checked,
        gateReady: document.getElementById('phys-gate-ready')?.textContent?.trim(),
        reasons: document.getElementById('phys-gate-reasons')?.textContent?.trim()
      };
    })()`);

    rec(`[SCENARIO_2_POPUP_STATE] checked=${s2Toggle.checked} gateReady="${s2Toggle.gateReady}" reasons="${s2Toggle.reasons}"`);
    if (!s2Toggle.checked) throw new Error('Scenario 2 Failed: Toggle could not be enabled');
    if (s2Toggle.gateReady !== 'FAIL-CLOSED (BLOCKED)') {
      throw new Error(`Scenario 2 Failed: Expected "FAIL-CLOSED (BLOCKED)", got "${s2Toggle.gateReady}"`);
    }

    // Edge service worker assertPhysicalGateReady must fail closed
    const s2Preflight = await evalSw(`assertPhysicalGateReady('TEST_SCENARIO_2')`);
    rec(`[SCENARIO_2_PREFLIGHT] ready=${s2Preflight.ready} reason=${s2Preflight.reason}`);
    if (s2Preflight.ready) {
      throw new Error('Scenario 2 Failed: assertPhysicalGateReady allowed traffic while gate was unverified!');
    }

    // Companion HTTP proxy drops traffic when Physical Gate is enabled but not ready
    rec('[SCENARIO_2_COMPANION_DROP] Testing traffic drop through Companion proxy port 18988...');
    const dropTest = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 18988,
        path: `http://127.0.0.1:${TARGET_PORT}/`,
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.end();
    });

    rec(`[SCENARIO_2_COMPANION_DROP_RES] statusCode=${dropTest.statusCode} body="${dropTest.body}"`);
    if (dropTest.statusCode !== 502 || !dropTest.body.includes('PHYSICAL_GATE_FAIL_CLOSED')) {
      throw new Error(`Scenario 2 Failed: Companion did not drop with 502 PHYSICAL_GATE_FAIL_CLOSED (status=${dropTest.statusCode})`);
    }
    rec('✅ SCENARIO 2: FAIL-CLOSED DISCONNECTED VERIFIED PASS');

    // =========================================================================
    // SCENARIO 3: PUBLIC PROXY DISALLOWED IN PHYSICAL GATE MODE
    // =========================================================================
    rec('\n>>> SCENARIO 3: PUBLIC PROXY DISALLOWED IN PHYSICAL GATE MODE <<<');
    // Add a public IP proxy to the pool
    await fetch('http://127.0.0.1:18989/add-node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        id: 'Public-Proxy-WAN',
        type: 'HTTP_PROXY',
        host: '198.51.100.101',
        port: PUBLIC_PROXY_PORT,
        active: true
      })
    });

    // Select the public proxy
    await fetch('http://127.0.0.1:18989/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ egressId: 'Public-Proxy-WAN', canaryUrl: `http://127.0.0.1:${TARGET_PORT}/privacy-canary` })
    });

    // Verify Physical Gate evaluation rejects the public proxy
    const pubVerifyRes = await fetch('http://127.0.0.1:18989/physical-gate/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const pubVerifyData = await pubVerifyRes.json();
    rec(`[SCENARIO_3_PUBLIC_PROXY_REJECTED] ready=${pubVerifyData.status.ready} reasons=${JSON.stringify(pubVerifyData.status.reasons)}`);

    if (pubVerifyData.status.ready) {
      throw new Error('Scenario 3 Failed: Public proxy was allowed in Physical Gate mode!');
    }
    if (!pubVerifyData.status.reasons.includes('PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE')) {
      throw new Error(`Scenario 3 Failed: Missing PUBLIC_PROXY_FORBIDDEN_IN_PHYSICAL_GATE_MODE reason`);
    }
    rec('✅ SCENARIO 3: PUBLIC PROXY DISALLOWED VERIFIED PASS');

    // =========================================================================
    // SCENARIO 4: ALL 10 LAYERS PASS -> AUTHORITATIVE READY (ENFORCED)
    // =========================================================================
    rec('\n>>> SCENARIO 4: ALL 10 LAYERS PASS -> AUTHORITATIVE READY (ENFORCED) <<<');

    // Set up mock routes fixture in companion directory so Windows route attestation passes
    const mockRoutesFile = path.join(extractedCompDir, 'mock_routes.json');
    fs.writeFileSync(mockRoutesFile, JSON.stringify([
      {
        nextHop: '10.66.66.1',
        metric: 25,
        interfaceAlias: 'Ethernet 2'
      }
    ], null, 2), 'utf8');
    rec(`[SCENARIO_4_ROUTES_CONFIGURED] mock_routes.json written to ${mockRoutesFile}`);

    // Add private RFC1918 Squid proxy node (127.0.0.1:8982, privateOnly: true)
    rec('[SCENARIO_4_ADD_PRIVATE_NODE] Adding private egress node...');
    await fetch('http://127.0.0.1:18989/add-node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        id: 'Private-WireGuard-Egress',
        type: 'HTTP_PROXY',
        host: '127.0.0.1',
        port: PRIVATE_PROXY_PORT,
        privateOnly: true,
        active: true
      })
    });

    // Select private egress node
    await fetch('http://127.0.0.1:18989/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ egressId: 'Private-WireGuard-Egress', canaryUrl: `http://127.0.0.1:${TARGET_PORT}/privacy-canary` })
    });

    // Configure router pairing config pointing to our local mock router port
    const routerPairingFile = path.join(extractedCompDir, 'router_pairing_config.json');
    fs.writeFileSync(routerPairingFile, JSON.stringify({
      enabled: true,
      routerType: 'GL.iNet GL-SFT1200',
      routerIp: '127.0.0.1',
      routerPort: MOCK_ROUTER_PORT,
      expectedFingerprint: null,
      agentTokenRef: null
    }, null, 2), 'utf8');

    // Pair router via POST /physical-gate/pair
    rec('[SCENARIO_4_PAIRING] Pairing router with mock Opal...');
    const pairRes = await fetch('http://127.0.0.1:18989/physical-gate/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        routerIp: '127.0.0.1',
        routerPort: MOCK_ROUTER_PORT,
        agentToken: 'secret-opal-agent-token'
      })
    });
    const pairData = await pairRes.json();
    rec(`[SCENARIO_4_PAIR_RESULT] ${JSON.stringify(pairData)}`);

    // Click Re-Verify Gate button in real Edge popup
    rec('[SCENARIO_4_POPUP_VERIFY] Clicking Re-Verify Gate in real Edge popup...');
    const s4PopupVerify = await evalPopup(`(async () => {
      document.getElementById('phys-gate-verify-btn').click();
      await new Promise(r => setTimeout(r, 800));
      return {
        gateReady: document.getElementById('phys-gate-ready')?.textContent?.trim(),
        routerId: document.getElementById('phys-router-id')?.textContent?.trim(),
        opalPath: document.getElementById('phys-opal-path')?.textContent?.trim(),
        vpnTunnel: document.getElementById('phys-vpn-tunnel')?.textContent?.trim(),
        killSwitch: document.getElementById('phys-kill-switch')?.textContent?.trim(),
        privateProxy: document.getElementById('phys-private-proxy')?.textContent?.trim(),
        bypassBlocked: document.getElementById('phys-bypass-blocked')?.textContent?.trim(),
        reasons: document.getElementById('phys-gate-reasons')?.textContent?.trim()
      };
    })()`);

    rec(`[SCENARIO_4_VERIFIED_STATE] gateReady="${s4PopupVerify.gateReady}" routerId="${s4PopupVerify.routerId}" opalPath="${s4PopupVerify.opalPath}" vpnTunnel="${s4PopupVerify.vpnTunnel}" killSwitch="${s4PopupVerify.killSwitch}" privateProxy="${s4PopupVerify.privateProxy}" bypassBlocked="${s4PopupVerify.bypassBlocked}" reasons="${s4PopupVerify.reasons}"`);

    if (s4PopupVerify.gateReady !== 'READY (ENFORCED)') {
      throw new Error(`Scenario 4 Failed: Expected "READY (ENFORCED)", got "${s4PopupVerify.gateReady}" (reasons: ${s4PopupVerify.reasons})`);
    }
    if (s4PopupVerify.routerId !== 'PASS (VERIFIED)') {
      throw new Error(`Scenario 4 Failed: routerId is "${s4PopupVerify.routerId}"`);
    }
    if (s4PopupVerify.opalPath !== 'PASS (DEFAULT GW)') {
      throw new Error(`Scenario 4 Failed: opalPath is "${s4PopupVerify.opalPath}"`);
    }
    if (!s4PopupVerify.vpnTunnel.includes('UP (WIREGUARD)')) {
      throw new Error(`Scenario 4 Failed: vpnTunnel is "${s4PopupVerify.vpnTunnel}"`);
    }
    if (s4PopupVerify.killSwitch !== 'ENFORCED') {
      throw new Error(`Scenario 4 Failed: killSwitch is "${s4PopupVerify.killSwitch}"`);
    }
    if (s4PopupVerify.privateProxy !== 'PASS (PRIVATE RFC1918)') {
      throw new Error(`Scenario 4 Failed: privateProxy is "${s4PopupVerify.privateProxy}"`);
    }
    if (s4PopupVerify.bypassBlocked !== 'BLOCKED') {
      throw new Error(`Scenario 4 Failed: bypassBlocked is "${s4PopupVerify.bypassBlocked}"`);
    }
    if (s4PopupVerify.reasons !== 'NONE') {
      throw new Error(`Scenario 4 Failed: reasons is "${s4PopupVerify.reasons}"`);
    }

    // Pre-flight check in background service worker must PASS
    const s4Preflight = await evalSw(`assertPhysicalGateReady('TEST_SCENARIO_4')`);
    rec(`[SCENARIO_4_PREFLIGHT] ready=${s4Preflight.ready}`);
    if (!s4Preflight.ready) {
      throw new Error('Scenario 4 Failed: Background assertPhysicalGateReady returned ready=false');
    }

    rec('✅ SCENARIO 4: ALL 10 LAYERS PASS -> READY (ENFORCED) VERIFIED PASS');

    // =========================================================================
    // SCENARIO 5: WIREGUARD FAILOVER TO OPENVPN FALLBACK
    // =========================================================================
    rec('\n>>> SCENARIO 5: WIREGUARD FAILOVER TO OPENVPN FALLBACK <<<');

    // Simulate WireGuard tunnel failure: wgclient down, OpenVPN tun0 up
    mockRouterState.wireguard.state = 'DOWN';
    mockRouterState.openvpn.state = 'UP';
    mockRouterState.lanGateway = '10.67.67.1';
    rec('[SCENARIO_5_SIMULATED_FAILOVER] Router state updated: WireGuard DOWN, OpenVPN UP');

    // Update mock routes to OpenVPN nextHop
    fs.writeFileSync(mockRoutesFile, JSON.stringify([
      {
        nextHop: '10.67.67.1',
        metric: 25,
        interfaceAlias: 'Ethernet 2'
      }
    ], null, 2), 'utf8');

    // Add & select OpenVPN private proxy node
    await fetch('http://127.0.0.1:18989/add-node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        id: 'Private-OpenVPN-Egress',
        type: 'HTTP_PROXY',
        host: '127.0.0.1',
        port: PRIVATE_PROXY_PORT,
        privateOnly: true,
        active: true
      })
    });
    await fetch('http://127.0.0.1:18989/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ egressId: 'Private-OpenVPN-Egress', canaryUrl: `http://127.0.0.1:${TARGET_PORT}/privacy-canary` })
    });

    // Re-verify in Edge popup
    const s5PopupVerify = await evalPopup(`(async () => {
      document.getElementById('phys-gate-verify-btn').click();
      await new Promise(r => setTimeout(r, 800));
      return {
        gateReady: document.getElementById('phys-gate-ready')?.textContent?.trim(),
        vpnTunnel: document.getElementById('phys-vpn-tunnel')?.textContent?.trim(),
        killSwitch: document.getElementById('phys-kill-switch')?.textContent?.trim(),
        reasons: document.getElementById('phys-gate-reasons')?.textContent?.trim()
      };
    })()`);

    rec(`[SCENARIO_5_VERIFIED_STATE] gateReady="${s5PopupVerify.gateReady}" vpnTunnel="${s5PopupVerify.vpnTunnel}" killSwitch="${s5PopupVerify.killSwitch}" reasons="${s5PopupVerify.reasons}"`);

    if (s5PopupVerify.gateReady !== 'READY (ENFORCED)') {
      throw new Error(`Scenario 5 Failed: Expected "READY (ENFORCED)", got "${s5PopupVerify.gateReady}"`);
    }
    if (!s5PopupVerify.vpnTunnel.includes('UP (OPENVPN)')) {
      throw new Error(`Scenario 5 Failed: Expected OpenVPN tunnel, got "${s5PopupVerify.vpnTunnel}"`);
    }
    if (s5PopupVerify.killSwitch !== 'ENFORCED') {
      throw new Error(`Scenario 5 Failed: Kill-switch not enforced under fallback: "${s5PopupVerify.killSwitch}"`);
    }

    rec('✅ SCENARIO 5: OPENVPN FALLBACK VERIFIED PASS');

    // =========================================================================
    // SCENARIO 6: KILL-SWITCH DISABLED / TAMPERED -> IMMEDIATE FAIL-CLOSED
    // =========================================================================
    rec('\n>>> SCENARIO 6: KILL-SWITCH DISABLED / TAMPERED -> IMMEDIATE FAIL-CLOSED <<<');

    // Simulate Kill-Switch tampering on router
    mockRouterState.killSwitch.state = 'DISABLED';
    rec('[SCENARIO_6_TAMPER] Router Kill-Switch state set to DISABLED');

    // Re-verify in Edge popup
    const s6PopupVerify = await evalPopup(`(async () => {
      document.getElementById('phys-gate-verify-btn').click();
      await new Promise(r => setTimeout(r, 800));
      return {
        gateReady: document.getElementById('phys-gate-ready')?.textContent?.trim(),
        killSwitch: document.getElementById('phys-kill-switch')?.textContent?.trim(),
        reasons: document.getElementById('phys-gate-reasons')?.textContent?.trim()
      };
    })()`);

    rec(`[SCENARIO_6_VERIFIED_STATE] gateReady="${s6PopupVerify.gateReady}" killSwitch="${s6PopupVerify.killSwitch}" reasons="${s6PopupVerify.reasons}"`);

    if (s6PopupVerify.gateReady !== 'FAIL-CLOSED (BLOCKED)') {
      throw new Error(`Scenario 6 Failed: Expected "FAIL-CLOSED (BLOCKED)", got "${s6PopupVerify.gateReady}"`);
    }
    if (s6PopupVerify.killSwitch !== 'NOT ENFORCED') {
      throw new Error(`Scenario 6 Failed: Expected killSwitch "NOT ENFORCED", got "${s6PopupVerify.killSwitch}"`);
    }
    if (!s6PopupVerify.reasons.includes('KILL_SWITCH_DISABLED')) {
      throw new Error(`Scenario 6 Failed: Expected KILL_SWITCH_DISABLED in reasons: "${s6PopupVerify.reasons}"`);
    }

    // Companion HTTP proxy must immediately drop traffic
    const s6DropTest = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: 18988,
        path: `http://127.0.0.1:${TARGET_PORT}/`,
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.end();
    });

    rec(`[SCENARIO_6_COMPANION_DROP] status=${s6DropTest.statusCode} body="${s6DropTest.body}"`);
    if (s6DropTest.statusCode !== 502 || !s6DropTest.body.includes('PHYSICAL_GATE_FAIL_CLOSED')) {
      throw new Error('Scenario 6 Failed: Companion did not drop traffic when Kill-Switch was disabled');
    }
    rec('✅ SCENARIO 6: KILL-SWITCH TAMPER FAIL-CLOSED VERIFIED PASS');

    // =========================================================================
    // SCENARIO 7: CLEAN UNINSTALL & DEREGISTRATION
    // =========================================================================
    rec('\n>>> SCENARIO 7: CLEAN UNINSTALL VIA EXTRACTED uninstall_companion.bat <<<');
    const uninstallBat = path.join(extractedCompDir, 'uninstall_companion.bat');
    rec(`[UNINSTALL_BAT] Executing: ${uninstallBat} --silent`);
    execSync(`cmd.exe /c "${uninstallBat}" --silent`, { stdio: 'inherit' });

    await new Promise(r => setTimeout(r, 600));
    const isPortDead = !(await isPortListening(18989));
    rec(`[UNINSTALL_CONFIRMATION] Port 18989 unreachable (STOPPED)=${isPortDead}`);

    let regGone = false;
    try {
      execSync('reg query "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay"', { stdio: 'ignore' });
    } catch (_) {
      regGone = true;
    }
    rec(`[UNINSTALL_REGISTRY_REMOVED] Host key removed=${regGone}`);

    if (!isPortDead) throw new Error('Scenario 7 Failed: Port 18989 still open after uninstall');
    if (!regGone) throw new Error('Scenario 7 Failed: Registry key not removed after uninstall');
    rec('✅ SCENARIO 7: CLEAN UNINSTALL VERIFIED PASS');

    rec('\n========================================================================');
    rec('  ALL SCENARIOS VERIFIED 100% PASS IN REAL MICROSOFT EDGE BROWSER');
    rec('========================================================================');
    return true;

  } finally {
    if (popupWs) {
      try { popupWs.close(); } catch (_) {}
    }
    if (swWs) {
      try { swWs.close(); } catch (_) {}
    }
    if (edgeProcess) {
      rec('[EDGE_CLEANUP] Terminating Edge browser process...');
      try { edgeProcess.kill(); } catch (_) {}
    }
    try { targetServer.close(); } catch (_) {}
    try { mockPrivateProxy.server.close(); } catch (_) {}
    try { mockPublicProxy.server.close(); } catch (_) {}
    try { mockRouterServer.close(); } catch (_) {}
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (_) {}

    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    rec(`[EVIDENCE_SAVED] Written ${lines.length} log lines to ${OUT}`);
  }
}

runRealEdgeAudit().then(() => {
  rec('\n[AUDIT_SUCCESS] Real Edge Browser Operator Audit completed with 100% PASS.');
  process.exit(0);
}).catch((err) => {
  rec(`\n[FATAL_AUDIT_ERROR] ${err.stack || err.message}`);
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  process.exit(1);
});
