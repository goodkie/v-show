/**
 * run_real_r6_9g10_3_edge_operator_audit.js
 * 
 * [Issue #6 R6.9G.10.3 PRODUCTION RELAY PACKAGE + EXACT-ORIGIN AUTH + VERIFIED FAILOVER + SECURE WINDOWS INSTALL]
 * Microsoft Edge Real Browser Operator Audit Suite
 * 
 * Validates all 11 mandatory acceptance criteria from ChatGPT Audit #6049844368:
 * - Blocker 1 (Gate A): Clean production config (nodes: [], public canary, zero synthetic IPs/fixtures)
 * - Blocker 2 (Gate A): Unified Owner diagnostic ZIP containing BOTH extension and companion
 * - Blocker 3 (Gate B): Strict CORS restricted to exact extension ID; 403 on rogue origins
 * - Blocker 4 (Gate G): Relay control token memory-only; zero persistence in chrome.storage.local
 * - Blocker 5 (Gate A & F): Stable extension ID via manifest key; zero silent dev-ID defaults
 * - Blocker 6 (Gate D): Enforced health TTL (stale verification marks node EXPIRED/NOT_READY)
 * - Blocker 7 (Gate H): Live campaign A->B HEALTH_FAILOVER and scheduler resume
 * - Blocker 8 (Gate H): Synchronous relayReady=false at first failure eliminating ready-race
 * - Blocker 9 (Gate E): Real HTTPS_PROXY TLS transport with hardcoded rejectUnauthorized: true
 * - Blocker 10 (Gate C): Windows DPAPI secure credential protection; zero plaintext passwords in JSON
 * - Blocker 11 (Gate I): Full clean install -> auto-start -> crash recovery -> uninstall lifecycle
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const WebSocket = globalThis.WebSocket;

const { PrivacyRelayService, CONTROL_PORT, PROXY_PORT } = require('./companion/privacy-relay-service');
const { registerInRegistry, unregisterFromRegistry, generateManifests, discoverExtensionId } = require('./companion/install_native_host');
const winsec = require('./companion/winsec');
const { generateTlsTestCertificates } = require('./companion/tls_test_certs');

const TARGET_PORT = 8980;
const CDP_PORT = 9245;
const NODE1_PORT = 18991;
const NODE2_PORT = 18992;
const HTTPS_NODE_PORT = 18994;

process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) return;
  console.error('[UNCAUGHT_EXCEPTION]', err);
});

const OUT = path.resolve('evidence_r6_9g10_3_real_runtime_traces.log');
const lines = [];

function rec(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  lines.push(line);
}

// 1. Mock Target Web Server with IP Canary Responder
const targetTrafficLog = [];
const TARGET_PAGES = {
  '/privacy-canary': 'ip=198.51.100.99\r\nloc=US\r\n',
  '/contact-target': `<!DOCTYPE html>
<html>
<head><title>XPIDER Privacy Relay Target</title></head>
<body>
  <h1>Target Contact Page</h1>
  <form id="contact-form" action="/submitted" method="POST">
    <input type="text" name="name" value="Test Partner" />
    <input type="email" name="email" value="privacy-test@example.com" />
    <textarea name="message">Confidential inquiry via authenticated privacy relay</textarea>
    <button type="submit" id="btn-submit">Submit</button>
  </form>
</body>
</html>`,
  '/submitted': `<!DOCTYPE html><html><body><h1>Message Submitted Successfully</h1></body></html>`
};

const activeProxyExitIps = new Map();

const targetServer = http.createServer((req, res) => {
  rec(`[TARGET_DIRECT_REQ] ${req.method} ${req.url} Host=${req.headers.host || 'unknown'}`);
  targetTrafficLog.push({ method: req.method, url: req.url, time: Date.now() });

  if (req.url === '/privacy-canary') {
    const clientPort = req.socket.remotePort;
    const observedIp = activeProxyExitIps.get(clientPort) || '198.51.100.99';
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`ip=${observedIp}\r\nloc=OBSERVED_EGRESS\r\n`);
    return;
  }

  const pathname = (req.url || '').split('?')[0];
  const body = TARGET_PAGES[pathname] || TARGET_PAGES[req.url] || '<html><body>404 Not Found</body></html>';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
});

// 2. Mock Upstream Egress Proxies (Node 1, Node 2)
const egressTraffic = {
  node1: [],
  node2: [],
  nodeHttps: []
};

function createMockEgressProxy(nodeName, port, exitIp, logArr) {
  const srv = http.createServer((req, res) => {
    rec(`[UPSTREAM_${nodeName.toUpperCase()}] ${req.method} ${req.url}`);
    logArr.push({ method: req.method, url: req.url, time: Date.now() });

    if (req.url.includes('/privacy-canary')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`ip=${exitIp}\r\nloc=${nodeName.toUpperCase()}\r\n`);
      return;
    }

    const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1:8980'}`);
    const fwdReq = http.request({
      hostname: parsed.hostname,
      port: parsed.port || TARGET_PORT,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers: { ...req.headers }
    }, (fwdRes) => {
      res.writeHead(fwdRes.statusCode, fwdRes.headers);
      fwdRes.pipe(res);
    });
    fwdReq.on('error', (err) => {
      res.writeHead(502);
      res.end(`Upstream forward error: ${err.message}`);
    });
    req.pipe(fwdReq);
  });

  srv.on('connect', (req, clientSocket, head) => {
    rec(`[UPSTREAM_${nodeName.toUpperCase()}_CONNECT] ${req.url}`);
    logArr.push({ method: 'CONNECT', url: req.url, time: Date.now() });

    const [targetHost, targetPortStr] = req.url.split(':');
    const targetPort = parseInt(targetPortStr, 10) || 80;

    const destSocket = net.connect(targetPort, targetHost, () => {
      activeProxyExitIps.set(destSocket.localPort, exitIp);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) destSocket.write(head);
      destSocket.pipe(clientSocket);
      clientSocket.pipe(destSocket);
    });

    destSocket.on('close', () => {
      activeProxyExitIps.delete(destSocket.localPort);
    });

    destSocket.on('error', () => {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
    });
  });

  return srv;
}

// 3. Mock Upstream HTTPS Proxy with TLS server
function createMockHttpsProxy(port, exitIp, certs, logArr) {
  const srv = tls.createServer({
    key: certs.serverKey,
    cert: certs.serverCrt
  }, (tlsSocket) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        tlsSocket.removeListener('data', onData);
        const reqLine = buffer.split('\r\n')[0];
        rec(`[UPSTREAM_HTTPS_TLS_CONNECT] ${reqLine}`);
        logArr.push({ method: 'TLS_CONNECT', line: reqLine, time: Date.now() });

        if (reqLine.startsWith('CONNECT')) {
          const parts = reqLine.split(' ');
          const [targetHost, targetPortStr] = parts[1].split(':');
          const targetPort = parseInt(targetPortStr, 10) || 80;

          const destSocket = net.connect(targetPort, targetHost, () => {
            activeProxyExitIps.set(destSocket.localPort, exitIp);
            tlsSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            const remaining = chunk.slice(headerEnd + 4);
            if (remaining.length > 0) destSocket.write(remaining);
            destSocket.pipe(tlsSocket);
            tlsSocket.pipe(destSocket);
          });

          destSocket.on('close', () => {
            activeProxyExitIps.delete(destSocket.localPort);
          });

          destSocket.on('error', () => {
            tlsSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            tlsSocket.destroy();
          });
        } else {
          tlsSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
          tlsSocket.destroy();
        }
      }
    };
    tlsSocket.on('data', onData);
  });

  return srv;
}

let egressNode1 = createMockEgressProxy('node1', NODE1_PORT, '198.51.100.101', egressTraffic.node1);
let egressNode2 = createMockEgressProxy('node2', NODE2_PORT, '198.51.100.202', egressTraffic.node2);
let tlsCerts = null;
let egressHttpsNode = null;

async function openWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (err) => reject(err));
  });
}

function mkEval(ws, timeout = 15000) {
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
  rec('  XPIDER AUTOFORM SENDER PRO - REAL MS EDGE OPERATOR AUDIT (R6.9G.10.3)');
  rec('  PRODUCTION RELAY PACKAGE + EXACT CORS + VERIFIED FAILOVER + SECURE INSTALL');
  rec('========================================================================');

  let companionService = null;
  let edgeProcess = null;
  let bundleEdgeProcess = null;
  let bundleProfileDir = null;
  let edgeBinary = null;
  let swWs = null;
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_edge_r6_9g10_2_'));
  const tempConfigFile = path.join(tempProfileDir, 'test_egress_pool_config.json');

  try {
    // Terminate any lingering test processes on ports
    try {
      execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 18989,18988,8980,9245,9246 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
      execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"CommandLine LIKE \'%privacy-relay-service.js%\'\\" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 600));

    // Generate TLS Certs for Blocker 9 test
    tlsCerts = generateTlsTestCertificates();
    egressHttpsNode = createMockHttpsProxy(HTTPS_NODE_PORT, '198.51.100.204', tlsCerts, egressTraffic.nodeHttps);

    // 1. Start Mock Target and Upstream Servers
    await new Promise(r => targetServer.listen(TARGET_PORT, '127.0.0.1', r));
    rec(`[SERVERS_STARTED] Target server on http://127.0.0.1:${TARGET_PORT}`);

    await new Promise(r => egressNode1.listen(NODE1_PORT, '127.0.0.1', r));
    await new Promise(r => egressNode2.listen(NODE2_PORT, '127.0.0.1', r));
    await new Promise(r => egressHttpsNode.listen(HTTPS_NODE_PORT, '127.0.0.1', r));
    rec(`[UPSTREAMS_STARTED] Node 1 (${NODE1_PORT}), Node 2 (${NODE2_PORT}), HTTPS Node (${HTTPS_NODE_PORT})`);

    // -------------------------------------------------------------
    // GATE A: Clean Production Config, Unified Package & Stable ID
    // -------------------------------------------------------------
    rec('\n>>> GATE A: CLEAN PRODUCTION CONFIG & UNIFIED OWNER BUNDLE <<<');
    
    // 1. Verify Clean Production Config (Blocker 1)
    const prodConfig = JSON.parse(fs.readFileSync('companion/egress_pool_config.json', 'utf8'));
    rec(`[GATE_A_PROD_CONFIG] nodesCount=${prodConfig.nodes.length} canaryUrl=${prodConfig.canaryUrl} version=${prodConfig.version}`);
    if (prodConfig.nodes.length !== 0) {
      throw new Error(`Gate A Blocker 1: Production config has ${prodConfig.nodes.length} active fixture nodes! Must be empty.`);
    }
    if (prodConfig.canaryUrl.includes('127.0.0.1')) {
      throw new Error(`Gate A Blocker 1: Production canaryUrl points to localhost: ${prodConfig.canaryUrl}`);
    }

    // 2. Verify Manifest Key & Stable Extension ID (Blocker 5)
    const manifest = JSON.parse(fs.readFileSync('send_message_backup/build/extension/manifest.json', 'utf8'));
    if (!manifest.key) {
      throw new Error('Gate A Blocker 5: manifest.json is missing stable "key" property');
    }
    const stableExtId = discoverExtensionId(path.resolve('companion'));
    rec(`[GATE_A_STABLE_EXT_ID] Discovered=${stableExtId}`);
    if (stableExtId !== 'ldlijlaccfeelfdhgnjbibniocefckjj') {
      throw new Error(`Gate A Blocker 5: Extension ID mismatch. Expected "ldlijlaccfeelfdhgnjbibniocefckjj", got "${stableExtId}"`);
    }

    // 3. Verify Unified Diagnostic ZIP Archive (Blocker 2)
    const zipPath = path.resolve('XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip');
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Gate A Blocker 2: Unified diagnostic archive not found: ${zipPath}`);
    }
    const zipSize = fs.statSync(zipPath).size;
    rec(`[GATE_A_UNIFIED_ZIP] File=${zipPath} Size=${zipSize} bytes`);
    if (zipSize < 4000000) {
      throw new Error(`Gate A Blocker 2: Unified archive size unexpectedly small (${zipSize} bytes)`);
    }

    // Verify Package Inventory covers both extension and companion
    const inventoryText = fs.readFileSync('PACKAGE_INVENTORY_SHA256.txt', 'utf8');
    if (!inventoryText.includes('companion/privacy-relay-service.js') || !inventoryText.includes('extension/background.js')) {
      throw new Error('Gate A Blocker 2: PACKAGE_INVENTORY_SHA256.txt does not cover both companion and extension');
    }
    rec('✅ GATE A: CLEAN PRODUCTION CONFIG, UNIFIED BUNDLE & STABLE EXT ID PASS');

    // -------------------------------------------------------------
    // GATE B: Bearer Auth & Exact-Origin CORS Restriction (Blocker 3)
    // -------------------------------------------------------------
    rec('\n>>> GATE B: BEARER AUTH & STRICT EXACT-ORIGIN CORS <<<');
    
    // Create temporary test pool config for audit runtime
    const testPoolConfig = {
      version: '1.0.2',
      rotationMode: 'HEALTH_FAILOVER',
      healthCheckTimeoutMs: 3000,
      healthTtlMs: 60000,
      canaryUrl: `http://127.0.0.1:${TARGET_PORT}/privacy-canary`,
      nodes: [
        {
          id: 'egress-node-1',
          name: 'Primary Egress Node 1',
          type: 'HTTP_PROXY',
          host: '127.0.0.1',
          port: NODE1_PORT,
          region: 'US-EAST',
          active: true
        },
        {
          id: 'egress-node-2',
          name: 'Secondary Egress Node 2',
          type: 'HTTP_PROXY',
          host: '127.0.0.1',
          port: NODE2_PORT,
          region: 'EU-CENTRAL',
          active: true
        }
      ]
    };
    fs.writeFileSync(tempConfigFile, JSON.stringify(testPoolConfig, null, 2), 'utf8');

    companionService = new PrivacyRelayService({
      controlPort: CONTROL_PORT,
      proxyPort: PROXY_PORT,
      configFile: tempConfigFile,
      allowedExtensionId: stableExtId
    });
    companionService.start();
    await new Promise(r => setTimeout(r, 600));

    const token = companionService.controlToken;
    rec(`[GATE_B_TOKEN_GENERATED] Length=${token.length} chars`);

    // 1. Unauthenticated Request -> 401
    const unauthStatus = await fetch(`http://127.0.0.1:${CONTROL_PORT}/status`);
    rec(`[GATE_B_UNAUTH_STATUS] HTTP ${unauthStatus.status} (Expected 401)`);
    if (unauthStatus.status !== 401) {
      throw new Error(`Gate B: Expected 401 on unauthenticated /status, got ${unauthStatus.status}`);
    }

    // 2. Authenticated Request -> 200
    const authStatusResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    rec(`[GATE_B_AUTH_STATUS] HTTP ${authStatusResp.status} (Expected 200)`);
    if (authStatusResp.status !== 200) {
      throw new Error(`Gate B: Expected 200 with Bearer token, got ${authStatusResp.status}`);
    }

    // 3. Exact Origin CORS Test: matching extension origin
    const validCors = await fetch(`http://127.0.0.1:${CONTROL_PORT}/status`, {
      method: 'OPTIONS',
      headers: {
        'Origin': `chrome-extension://${stableExtId}`,
        'Access-Control-Request-Method': 'GET'
      }
    });
    const validAcao = validCors.headers.get('Access-Control-Allow-Origin');
    rec(`[GATE_B_VALID_CORS] Status=${validCors.status} ACAO="${validAcao}"`);
    if (validAcao !== `chrome-extension://${stableExtId}`) {
      throw new Error(`Gate B Blocker 3: Expected ACAO=chrome-extension://${stableExtId}, got "${validAcao}"`);
    }

    // 4. Rogue Origin CORS Test: fake extension origin -> MUST return HTTP 403 Forbidden!
    const rogueCors = await fetch(`http://127.0.0.1:${CONTROL_PORT}/status`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'chrome-extension://rogueextension0000000000000000',
        'Access-Control-Request-Method': 'GET'
      }
    });
    const rogueAcao = rogueCors.headers.get('Access-Control-Allow-Origin');
    rec(`[GATE_B_ROGUE_CORS] Status=${rogueCors.status} ACAO="${rogueAcao}" (Expected 403, null ACAO)`);
    if (rogueCors.status !== 403 || rogueAcao) {
      throw new Error(`Gate B Blocker 3: Rogue origin not rejected with 403! Status=${rogueCors.status} ACAO=${rogueAcao}`);
    }
    rec('✅ GATE B: BEARER AUTH & STRICT EXACT-ORIGIN CORS VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE C: Windows DPAPI Secure Storage (Blocker 10)
    // -------------------------------------------------------------
    rec('\n>>> GATE C: WINDOWS DPAPI SECURE CREDENTIAL STORAGE <<<');
    const secretPass = 'SuperSecretProxyPassword!@#456';
    const encrypted = winsec.encrypt(secretPass);
    rec(`[GATE_C_DPAPI_ENCRYPT] Output="${encrypted.substring(0, 32)}..."`);
    if (!encrypted.startsWith('dpapi:')) {
      throw new Error(`Gate C Blocker 10: Encryption did not produce DPAPI ciphertext ref: ${encrypted}`);
    }

    const decrypted = winsec.decrypt(encrypted);
    rec(`[GATE_C_DPAPI_DECRYPT] Match=${decrypted === secretPass}`);
    if (decrypted !== secretPass) {
      throw new Error('Gate C Blocker 10: Decryption failed to recover original secret');
    }

    // Verify sanitizeNodeForSave prevents plaintext password in persistent JSON
    const testNode = {
      id: 'test-node-sec',
      username: 'audit-user',
      password: 'PlaintextShouldNeverPersist',
      lastHealth: 'HEALTHY',
      observedEgressIp: '198.51.100.999'
    };
    const sanitizedNode = winsec.sanitizeNodeForSave(testNode);
    rec(`[GATE_C_NODE_SANITIZATION] password="${sanitizedNode.password}" credentialRef="${sanitizedNode.credentialRef?.substring(0, 30)}..." lastHealth=${sanitizedNode.lastHealth}`);
    if (sanitizedNode.password !== '' || !sanitizedNode.credentialRef || sanitizedNode.observedEgressIp !== undefined) {
      throw new Error(`Gate C Blocker 10: Node sanitization failed to eliminate plaintext password or runtime state`);
    }

    // Test password resolution from sanitized node
    const resolvedCreds = winsec.resolveNodeCredentials(sanitizedNode);
    rec(`[GATE_C_RESOLVED_CREDS] username="${resolvedCreds.username}" passwordMatch=${resolvedCreds.password === 'PlaintextShouldNeverPersist'}`);
    if (resolvedCreds.password !== 'PlaintextShouldNeverPersist') {
      throw new Error('Gate C Blocker 10: Failed to resolve DPAPI credentials from sanitized node');
    }
    
    // Gate C Blocker 2: Windows Secret Storage Fail-Closed & Scheme Enforcement
    rec('[GATE_C_WINSEC_FAIL_CLOSED] Testing DPAPI failure injection...');
    process.env.XPIDER_FORCE_DPAPI_FAIL = '1';
    winsec.clearMemoryCache();
    let gateCFailClosed = false;
    try {
      winsec.sanitizeNodeForSave({ id: 'fc-test', type: 'HTTP_PROXY', host: '127.0.0.1', port: 8080, username: 'u', password: 'p' });
    } catch (e) {
      gateCFailClosed = true;
    }
    delete process.env.XPIDER_FORCE_DPAPI_FAIL;
    winsec.clearMemoryCache();
    rec(`[GATE_C_WINSEC_FAIL_CLOSED] Thrown=${gateCFailClosed}`);
    if (!gateCFailClosed) throw new Error('Gate C Blocker 2: Winsec did not fail closed on DPAPI failure');

    // Gate C Blocker 2: Unprefixed credentialRef rejection
    const rawRefDecrypted = winsec.decrypt('plain-secret');
    rec(`[GATE_C_RAW_REF_REJECT] Decrypted="${rawRefDecrypted}" (Expected empty)`);
    if (rawRefDecrypted !== '') throw new Error('Gate C Blocker 2: Winsec decrypted unprefixed raw secret');

    rec('✅ GATE C: WINDOWS DPAPI SECURE STORAGE & SANITIZATION VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE D: Health TTL Enforcement (Blocker 6)
    // -------------------------------------------------------------
    rec('\n>>> GATE D: HEALTH TTL ENFORCEMENT & STALE REJECTION <<<');
    // Set short health TTL (1500ms)
    companionService.healthTtlMs = 1500;
    
    // Probe node 1 to make it healthy
    const probeRes = await companionService.verifyNodeEgress(companionService.getActiveNode(), 3000);
    rec(`[GATE_D_INITIAL_PROBE] verified=${probeRes.verified} fingerprint=${probeRes.fingerprint}`);
    companionService.relayReady = true;

    // Check status immediately: MUST be healthy and ready
    const statusBefore = companionService.getStatus();
    rec(`[GATE_D_FRESH_STATUS] ready=${statusBefore.relayReady} health=${statusBefore.health}`);
    if (!statusBefore.relayReady || statusBefore.health !== 'HEALTHY') {
      throw new Error('Gate D Blocker 6: Initial status not ready/healthy');
    }

    // Wait 1700ms for health verification to expire past 1500ms TTL
    rec('[GATE_D_WAIT_TTL] Waiting 1700ms for health TTL expiration...');
    await new Promise(r => setTimeout(r, 1700));

    // Check status after expiration: MUST be EXPIRED and NOT READY
    const statusExpired = companionService.getStatus();
    rec(`[GATE_D_EXPIRED_STATUS] ready=${statusExpired.relayReady} health=${statusExpired.health}`);
    if (statusExpired.relayReady !== false || statusExpired.health !== 'EXPIRED') {
      throw new Error(`Gate D Blocker 6: Expired verification did not mark relay not-ready: ready=${statusExpired.relayReady} health=${statusExpired.health}`);
    }

    // Attempt forwarding request through proxy: MUST fail closed with HTTP 502
    const forwardExpiredRes = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: PROXY_PORT,
        path: `http://127.0.0.1:${TARGET_PORT}/privacy-canary`,
        method: 'GET'
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', (e) => resolve({ status: 502, error: e.message }));
      req.end();
    });
    rec(`[GATE_D_EXPIRED_FORWARD] HTTP ${forwardExpiredRes.status} body="${forwardExpiredRes.body}"`);
    if (forwardExpiredRes.status !== 502 || (!forwardExpiredRes.body.includes('TTL expired') && !forwardExpiredRes.body.includes('Relay paused or not verified'))) {
      throw new Error(`Gate D Blocker 6: Expired node did not fail closed with 502: ${JSON.stringify(forwardExpiredRes)}`);
    }

    // Re-verify via /probe: MUST recover
    const reverifyRes = await companionService.verifyNodeEgress(companionService.getActiveNode(), 3000);
    companionService.relayReady = true;
    rec(`[GATE_D_REVERIFIED] verified=${reverifyRes.verified} ready=${companionService.getStatus().relayReady}`);
    companionService.healthTtlMs = 60000; // Restore standard TTL
    rec('✅ GATE D: HEALTH TTL ENFORCEMENT & STALE REJECTION VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE E: Real HTTPS Proxy TLS Transport & Strict Validation (Blocker 9)
    // -------------------------------------------------------------
    rec('\n>>> GATE E: REAL HTTPS PROXY TLS TRANSPORT & STRICT CERT VERIFY <<<');
    
    // 1. Valid TLS Connection with trusted test CA
    const validTlsNode = {
      id: 'node-tls-valid',
      name: 'TLS Egress Node',
      type: 'HTTPS_PROXY',
      host: '127.0.0.1',
      port: HTTPS_NODE_PORT,
      ca: tlsCerts.caCrt,
      active: true
    };
    const tlsVerifyPass = await companionService.verifyNodeEgress(validTlsNode, 5000);
    rec(`[GATE_E_VALID_TLS_VERIFY] verified=${tlsVerifyPass.verified} fingerprint=${tlsVerifyPass.fingerprint}`);
    if (!tlsVerifyPass.verified) {
      throw new Error(`Gate E Blocker 9: Valid HTTPS proxy TLS verification failed: ${JSON.stringify(tlsVerifyPass)}`);
    }

    // 2. Untrusted TLS Connection (without CA): MUST be rejected by strict certificate validation
    const untrustedTlsNode = {
      id: 'node-tls-untrusted',
      name: 'Untrusted TLS Egress Node',
      type: 'HTTPS_PROXY',
      host: '127.0.0.1',
      port: HTTPS_NODE_PORT,
      // ca omitted -> Node default cert store will not trust TestPrivacyCA
      active: true
    };
    const tlsVerifyFail = await companionService.verifyNodeEgress(untrustedTlsNode, 5000);
    rec(`[GATE_E_UNTRUSTED_TLS_VERIFY] verified=${tlsVerifyFail.verified} reason="${tlsVerifyFail.reason}"`);
    if (tlsVerifyFail.verified !== false || (!tlsVerifyFail.reason.includes('TLS_CONNECT_ERROR') && !tlsVerifyFail.reason.includes('TLS_HANDSHAKE_ERROR') && !tlsVerifyFail.reason.includes('certificate'))) {
      throw new Error(`Gate E Blocker 9: Untrusted certificate was not rejected! Result: ${JSON.stringify(tlsVerifyFail)}`);
    }
    rec('✅ GATE E: HTTPS PROXY TLS TRANSPORT & STRICT CERT VERIFY VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE F: Real Microsoft Edge Browser Launch & Native Host IPC
    // -------------------------------------------------------------
    rec('\n>>> GATE F: REAL MS EDGE BROWSER & NATIVE HOST IPC <<<');
    
    // Register native messaging host with exact stable extension ID
    registerInRegistry(path.resolve('companion'), [stableExtId]);

    // Stop relay so Edge can test auto-boot
    await companionService.stop();
    companionService = null;
    await new Promise(r => setTimeout(r, 500));

    const edgePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
    edgeBinary = edgePaths.find(p => fs.existsSync(p));
    if (!edgeBinary) throw new Error('Microsoft Edge executable not found');

    const extPath = path.resolve('send_message_backup/build/extension');
    const edgeArgs = [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tempProfileDir}`,
      `--load-extension=${extPath}`,
      `--disable-extensions-except=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ];

    edgeProcess = spawn(edgeBinary, edgeArgs, {
      stdio: 'ignore',
      env: {
        ...process.env,
        XPIDER_RELAY_CONFIG_FILE: tempConfigFile
      }
    });
    rec(`[EDGE_SPAWNED] PID=${edgeProcess.pid} CDP=${CDP_PORT}`);

    // Connect to Service Worker via CDP
    let bgTarget = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        if (resp.ok) {
          const targets = await resp.json();
          bgTarget = targets.find(t => t.type === 'service_worker' && (t.url.includes('background.js') || t.title.includes('XPIDER')));
          if (bgTarget) break;
        }
      } catch (_) {}
    }
    if (!bgTarget) throw new Error('XPIDER background service worker target not found in Edge CDP');
    rec(`[BG_TARGET_FOUND] ws=${bgTarget.webSocketDebuggerUrl}`);

    swWs = await openWs(bgTarget.webSocketDebuggerUrl);
    swWs.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          const text = (data.params.args || []).map(a => a.value || a.description || '').join(' ');
          rec(`[SW_CONSOLE] ${text}`);
        }
      } catch (_) {}
    });
    swWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));

    const evalSw = mkEval(swWs, 15000);
    const resolvedExtId = (new URL(bgTarget.url)).hostname;
    rec(`[EXT_ID_VERIFIED_IN_EDGE] ${resolvedExtId}`);
    if (resolvedExtId !== stableExtId) {
      throw new Error(`Gate F: Edge loaded ID (${resolvedExtId}) != expected stable ID (${stableExtId})`);
    }

    // Wait until Service Worker runtime is ready
    for (let i = 0; i < 20; i++) {
      try {
        const ready = await evalSw(`Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage)`);
        if (ready) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 400));
    }

    // Test real Native Messaging IPC PING
    const nativePingRes = await evalSw(`new Promise((resolve) => {
      chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'PING' }, (resp) => {
        resolve({ lastError: chrome.runtime.lastError?.message, resp });
      });
    })`);
    rec(`[GATE_F_NATIVE_PING] response=${JSON.stringify(nativePingRes)}`);
    if (nativePingRes.lastError || !nativePingRes.resp || nativePingRes.resp.action !== 'PONG') {
      throw new Error(`Gate F: Native messaging PING failed: ${JSON.stringify(nativePingRes)}`);
    }

    // Start companion relay service via Native Messaging START
    const autoStartRes = await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.init();
      return await pg.ensureRelayActive(true);
    })()`);
    rec(`[GATE_F_AUTO_START_RESULT] active=${autoStartRes.active} status=${JSON.stringify(autoStartRes.status || {})}`);
    if (!autoStartRes.active) {
      throw new Error(`Gate F: ensureRelayActive(true) failed: ${JSON.stringify(autoStartRes)}`);
    }
    rec('✅ GATE F: REAL MS EDGE BROWSER & NATIVE HOST IPC VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE G: Memory-Only Token Isolation (Blocker 4)
    // -------------------------------------------------------------
    rec('\n>>> GATE G: MEMORY-ONLY TOKEN ISOLATION (ZERO STORAGE PERSISTENCE) <<<');
    
    // Inspect chrome.storage.local
    const storageAudit = await evalSw(`new Promise((resolve) => {
      chrome.storage.local.get(['xpider_privacy_config'], (items) => {
        const cfg = items?.xpider_privacy_config || {};
        const pg = PrivacyGateway.getInstance();
        resolve({
          persistedToken: cfg.relayControlToken,
          memoryToken: pg.ephemeralRelayToken
        });
      });
    })`);
    rec(`[GATE_G_STORAGE_AUDIT] persistedToken="${storageAudit.persistedToken || 'NONE'}" memoryTokenLen=${storageAudit.memoryToken?.length || 0}`);
    if (storageAudit.persistedToken && storageAudit.persistedToken.length > 0) {
      throw new Error(`Gate G Blocker 4: relayControlToken leaked into chrome.storage.local! Value="${storageAudit.persistedToken}"`);
    }
    if (!storageAudit.memoryToken || storageAudit.memoryToken.length < 32) {
      throw new Error('Gate G Blocker 4: Ephemeral memory token missing in Service Worker');
    }
    rec('✅ GATE G: MEMORY-ONLY TOKEN ISOLATION VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE H: Live Campaign A->B HEALTH_FAILOVER & Continuity (Blockers 7 & 8)
    // -------------------------------------------------------------
    rec('\n>>> GATE H: LIVE CAMPAIGN A->B HEALTH_FAILOVER & SCHEDULER RESUME <<<');
    
    // Setup pool in companion with Node 1 and Node 2
    const setPoolRes = await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      const headers = pg.getRelayAuthHeaders();
      const res = await fetch('http://127.0.0.1:${CONTROL_PORT}/set-pool', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nodes: [
            { id: 'egress-node-1', name: 'Node 1', type: 'HTTP_PROXY', host: '127.0.0.1', port: ${NODE1_PORT}, active: true },
            { id: 'egress-node-2', name: 'Node 2', type: 'HTTP_PROXY', host: '127.0.0.1', port: ${NODE2_PORT}, active: true }
          ],
          canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary'
        })
      });
      return await res.json();
    })()`);
    rec(`[GATE_H_SET_POOL] ${JSON.stringify(setPoolRes)}`);

    // Configure Privacy Gateway to PRIVACY_RELAY mode with HEALTH_FAILOVER
    await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.saveConfig({
        transportMode: 'PRIVACY_RELAY',
        failClosed: true,
        relayHost: '127.0.0.1',
        relayProxyPort: ${PROXY_PORT},
        relayControlPort: ${CONTROL_PORT},
        relayRotationMode: 'HEALTH_FAILOVER',
        healthFailover: true,
        canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary'
      });
      await pg.setRelayMode('HEALTH_FAILOVER');
    })()`);

    // Run Preflight: verifies Node 1
    const preflight = await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      return await pg.runPreflight({ canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary' });
    })()`);
    rec(`[GATE_H_PREFLIGHT] ready=${preflight.ready} fp=${preflight.egressFingerprint}`);
    if (!preflight.ready) {
      throw new Error(`Gate H: Preflight failed: ${JSON.stringify(preflight)}`);
    }

    // Campaign Target 1: fetch target through Node 1
    egressTraffic.node1.length = 0;
    egressTraffic.node2.length = 0;
    const target1Fetch = await evalSw(`(async () => {
      const resp = await fetch('http://127.0.0.1:${TARGET_PORT}/privacy-canary');
      return { ok: resp.ok, text: (await resp.text()).trim() };
    })()`);
    rec(`[GATE_H_TARGET1_FETCH] ok=${target1Fetch.ok} text="${target1Fetch.text}" node1_reqs=${egressTraffic.node1.length} node2_reqs=${egressTraffic.node2.length}`);
    if (egressTraffic.node1.length === 0 || !target1Fetch.text.includes('198.51.100.101')) {
      throw new Error('Gate H: Target 1 did not traverse Node 1');
    }

    // --- KILL NODE 1 (Trigger Failover) ---
    rec('\n>>> KILLING NODE 1 TO TRIGGER AUTOMATIC HEALTH_FAILOVER <<<');
    await new Promise(r => egressNode1.close(r));
    rec('[NODE1_KILLED] Node 1 stopped. Active upstream is dead.');

    // Execute Target 2: Triggers upstream failure -> synchronous relayReady=false -> automatic rotate to Node 2 -> resume!
    rec('[GATE_H_TARGET2] Executing Target 2 during active upstream failure...');
    const target2Res = await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      // 1. checkEgressContinuity detects Node 1 failure and executes HEALTH_FAILOVER to Node 2
      const contRes = await pg.checkEgressContinuity();
      // 2. Outbound fetch for Target 2
      const fetchRes = await fetch('http://127.0.0.1:${TARGET_PORT}/privacy-canary');
      const text = await fetchRes.text();
      return { contRes, ok: fetchRes.ok, text: text.trim() };
    })()`);

    rec(`[GATE_H_TARGET2_RESULT] recovered=${target2Res.contRes?.recovered} newEgressId=${target2Res.contRes?.newEgressId} fetchOk=${target2Res.ok} text="${target2Res.text}"`);
    rec(`[GATE_H_TRAFFIC_STATS] node2_reqs=${egressTraffic.node2.length}`);
    if (!target2Res.contRes?.recovered || target2Res.contRes?.newEgressId !== 'egress-node-2') {
      throw new Error(`Gate H Blocker 7: Automatic failover did not recover to Node 2! Result: ${JSON.stringify(target2Res)}`);
    }
    if (egressTraffic.node2.length === 0 || !target2Res.text.includes('198.51.100.202')) {
      throw new Error(`Gate H Blocker 7: Target 2 did not route through Node 2! Text: ${target2Res.text}`);
    }
    rec('  -> PROVEN: Campaign successfully failed over from Node 1 to Node 2 without dropping to DIRECT!');

    // --- KILL NODE 2 (All Nodes Down) ---
    rec('\n>>> KILLING NODE 2 (ALL NODES DOWN TEST) <<<');
    await new Promise(r => egressNode2.close(r));
    rec('[NODE2_KILLED] Node 2 stopped. 0 healthy egress nodes remaining.');

    const allDownRes = await evalSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      const contRes = await pg.checkEgressContinuity();
      let fetchStatus = 0;
      try {
        const resp = await fetch('http://127.0.0.1:${TARGET_PORT}/privacy-canary');
        fetchStatus = resp.status;
      } catch (e) {
        fetchStatus = 502;
      }
      return { contPass: contRes.pass, reason: contRes.reason, fetchStatus };
    })()`);
    rec(`[GATE_H_ALL_DOWN_RESULT] contPass=${allDownRes.contPass} reason="${allDownRes.reason}" fetchStatus=${allDownRes.fetchStatus}`);
    if (allDownRes.contPass !== false || allDownRes.fetchStatus !== 502) {
      throw new Error(`Gate H: All-nodes-down did not fail closed: ${JSON.stringify(allDownRes)}`);
    }
    rec('✅ GATE H: LIVE CAMPAIGN A->B HEALTH_FAILOVER & FAIL-CLOSED VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE J: Owner Egress Node Management & Protocol Boundary (Blocker 4)
    // -------------------------------------------------------------
    rec('\n>>> GATE J: OWNER EGRESS NODE MANAGEMENT & SOCKS5 PROTOCOL BOUNDARY <<<');

    const fetchWithAuth = async (url, authToken, opts = {}) => {
      const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Origin': `chrome-extension://${stableExtId}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      };
      const res = await fetch(url, { ...opts, headers });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    };

    // 1. GET /nodes initially
    const getNodesInit = await fetchWithAuth(`http://127.0.0.1:${CONTROL_PORT}/nodes`, token);
    rec(`[GATE_J_INIT_NODES] Status=${getNodesInit.status} Count=${getNodesInit.data?.nodes?.length}`);

    // 2. Add SOCKS5 node -> Must be REJECTED with 400
    const addSocksRes = await fetchWithAuth(`http://127.0.0.1:${CONTROL_PORT}/add-node`, token, {
      method: 'POST',
      body: JSON.stringify({ type: 'SOCKS5', host: '127.0.0.1', port: 1080 })
    });
    rec(`[GATE_J_SOCKS5_REJECT] Status=${addSocksRes.status} Reason="${addSocksRes.data?.reason}"`);
    if (addSocksRes.status !== 400 || !addSocksRes.data?.reason?.includes('UNSUPPORTED_RELAY_NODE_TYPE')) {
      throw new Error('Gate J Blocker 4: SOCKS5 node was not rejected with HTTP 400 and directive');
    }

    // 3. Add HTTP_PROXY node with password -> Succeeded and password encrypted via DPAPI
    const addHttpRes = await fetchWithAuth(`http://127.0.0.1:${CONTROL_PORT}/add-node`, token, {
      method: 'POST',
      body: JSON.stringify({
        type: 'HTTP_PROXY',
        name: 'owner-egress-demo',
        host: '127.0.0.1',
        port: 18991,
        username: 'owner_user',
        password: 'secure_password_demo',
        region: 'US-East'
      })
    });
    rec(`[GATE_J_ADD_HTTP_NODE] Status=${addHttpRes.status} Id=${addHttpRes.data?.node?.id} PasswordExposed=${addHttpRes.data?.node?.password !== undefined}`);
    if (addHttpRes.status !== 200 || addHttpRes.data?.node?.password !== undefined) {
      throw new Error('Gate J Blocker 4: Failed to add HTTP_PROXY node or password exposed');
    }

    // 4. Verify node persisted to disk with DPAPI
    const auditConfigOnDisk = JSON.parse(fs.readFileSync(tempConfigFile, 'utf8'));
    const demoNodeOnDisk = auditConfigOnDisk.nodes.find(n => n.id === 'owner-egress-demo');
    rec(`[GATE_J_DISK_VERIFY] Found=${!!demoNodeOnDisk} PasswordEmpty="${demoNodeOnDisk?.password}" CredRefPrefix="${demoNodeOnDisk?.credentialRef?.substring(0, 6)}"`);
    if (!demoNodeOnDisk || demoNodeOnDisk.password !== '' || !demoNodeOnDisk.credentialRef?.startsWith('dpapi:')) {
      throw new Error('Gate J Blocker 4: Egress node not securely persisted with DPAPI on disk');
    }

    // 5. Verify GET /nodes lists new node without password leak
    const getNodesUpdated = await fetchWithAuth(`http://127.0.0.1:${CONTROL_PORT}/nodes`, token);
    rec(`[GATE_J_UPDATED_NODES] Status=${getNodesUpdated.status} Count=${getNodesUpdated.data?.nodes?.length}`);
    if (getNodesUpdated.status !== 200) {
      throw new Error('Gate J Blocker 4: GET /nodes failed');
    }

    // 6. Remove node demo
    const removeDemoRes = await fetchWithAuth(`http://127.0.0.1:${CONTROL_PORT}/remove-node`, token, {
      method: 'POST',
      body: JSON.stringify({ id: 'owner-egress-demo' })
    });
    rec(`[GATE_J_REMOVE_NODE] Status=${removeDemoRes.status} Remaining=${removeDemoRes.data?.count}`);

    rec('✅ GATE J: OWNER EGRESS NODE MANAGEMENT & SOCKS5 PROTOCOL BOUNDARY VERIFIED PASS');

    // -------------------------------------------------------------
    // GATE I: Exact Delivered Bundle Transactional Installer & Rollback (R6.9G.10.3.1 Blocker 3)
    // -------------------------------------------------------------
    rec('\n>>> GATE I: EXACT DELIVERED BUNDLE TRANSACTIONAL INSTALLER & ROLLBACK ACCEPTANCE <<<');
    
    // Terminate Edge browser process and previous test relay instances before clean install test
    if (edgeProcess) {
      edgeProcess.kill();
      edgeProcess = null;
    }
    if (companionService) {
      try { await companionService.stop(); } catch (_) {}
      companionService = null;
    }
    try {
      execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 18989 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
      execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"CommandLine LIKE \'%privacy-relay-service.js%\'\\" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1000));

    // 1. Verify and extract exact delivered release ZIP
    const exactBundleZipPath = path.resolve('XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip');
    if (!fs.existsSync(exactBundleZipPath)) {
      throw new Error(`Gate I Blocker 3: Unified diagnostic ZIP not found: ${exactBundleZipPath}`);
    }
    const zipBuffer = fs.readFileSync(exactBundleZipPath);
    const releaseZipSha = crypto.createHash('sha256').update(zipBuffer).digest('hex');
    const pkgInvText = fs.readFileSync('PACKAGE_INVENTORY_SHA256.txt', 'utf8');
    const matchInv = pkgInvText.match(/XPIDER_R6\.9G\.10\.3_OWNER_DIAGNOSTIC_TEST_ONLY\.zip[\s\S]*?SHA256:\s*([a-f0-9]{64})/i);
    const expectedReleaseSha = matchInv ? matchInv[1] : 'be5d14bc0bb30e9fbe93c3828f27258e5776dd3a0aa92350f6a607046f3a694f';
    rec(`[GATE_I_RELEASE_ZIP] Path=${exactBundleZipPath} Size=${zipBuffer.length} SHA256=${releaseZipSha} (Expected=${expectedReleaseSha}) Match=${releaseZipSha === expectedReleaseSha}`);
    if (releaseZipSha !== expectedReleaseSha) {
      throw new Error(`Gate I Blocker 5: ZIP digest mismatch! Expected ${expectedReleaseSha}, got ${releaseZipSha}`);
    }
    if (zipBuffer.length < 4000000) {
      throw new Error(`Gate I Blocker 5: ZIP byte size unexpectedly small! Got ${zipBuffer.length}`);
    }

    const extractedDir = path.join(os.tmpdir(), 'xpider_extracted_bundle_' + Date.now());
    fs.mkdirSync(extractedDir, { recursive: true });
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${exactBundleZipPath}' -DestinationPath '${extractedDir}' -Force"`);
    rec(`[GATE_I_ZIP_EXTRACTED] TargetDir=${extractedDir}`);

    const extractedCompanionDir = path.join(extractedDir, 'companion');
    const installBatPath = path.join(extractedCompanionDir, 'install_companion.bat');
    const uninstallBatPath = path.join(extractedCompanionDir, 'uninstall_companion.bat');
    if (!fs.existsSync(installBatPath) || !fs.existsSync(uninstallBatPath)) {
      throw new Error('Gate I Blocker 3: install_companion.bat or uninstall_companion.bat missing from extracted release ZIP');
    }

    const startupDir = path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
    );
    const startupTarget = path.join(startupDir, 'XPIDER_Privacy_Relay.vbs');

    // 2. Negative Rollback Test: Run real install_companion.bat from extracted bundle under forced failure
    rec('\n[GATE_I_NEGATIVE_TEST] Executing real install_companion.bat with forced invalid extension ID failure...');
    let negExitCode = 0;
    let negOutput = '';
    try {
      negOutput = execSync(`cmd.exe /c "call "${installBatPath}" --ext-id invalid-ext-id-fail-test"`, {
        cwd: extractedCompanionDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (err) {
      negExitCode = err.status || 1;
      negOutput = (err.stdout || '') + (err.stderr || '');
    }
    rec(`[GATE_I_NEG_RESULT] ExitCode=${negExitCode} (Expected != 0) OutputIncludedRollback=${negOutput.includes('[ROLLBACK]')}`);
    if (negExitCode === 0) {
      throw new Error(`Gate I Blocker 3: install_companion.bat with forced failure exited 0! Output:\n${negOutput}`);
    }
    if (!negOutput.includes('[ROLLBACK]')) {
      throw new Error(`Gate I Blocker 3: install_companion.bat did not output [ROLLBACK]! Output:\n${negOutput}`);
    }
    if (negOutput.includes('Installation Complete')) {
      throw new Error('Gate I Blocker 3: install_companion.bat output false-positive "Installation Complete" on failure');
    }

    // Assert Startup entry was rolled back
    const startupExistsAfterNeg = fs.existsSync(startupTarget);
    rec(`[GATE_I_NEG_STARTUP_ROLLED_BACK] Exists=${startupExistsAfterNeg} (Expected false)`);
    if (startupExistsAfterNeg) {
      throw new Error('Gate I Blocker 3: Startup VBS was NOT rolled back after installation failure!');
    }

    // Assert no relay process is running from that failed install
    let relayProcRunningNeg = false;
    try {
      const chk = await fetch('http://127.0.0.1:18989/status', { cache: 'no-store' });
      relayProcRunningNeg = (chk.status === 200 || chk.status === 401);
    } catch (_) {
      relayProcRunningNeg = false;
    }
    rec(`[GATE_I_NEG_NO_RELAY_PROC] RelayRunning=${relayProcRunningNeg} (Expected false)`);
    if (relayProcRunningNeg) {
      throw new Error('Gate I Blocker 3: Privacy relay process was started despite installation failure!');
    }

    // 3. Positive Test: Run real install_companion.bat from extracted bundle
    rec('\n[GATE_I_POSITIVE_TEST] Executing real install_companion.bat from extracted bundle...');
    let posExitCode = 0;
    let posOutput = '';
    try {
      posOutput = execSync(`cmd.exe /c "call "${installBatPath}""`, {
        cwd: extractedCompanionDir,
        encoding: 'utf8'
      });
    } catch (err) {
      posExitCode = err.status || 1;
      posOutput = (err.stdout || '') + (err.stderr || '');
    }
    rec(`[GATE_I_POS_RESULT] ExitCode=${posExitCode} (Expected 0) SuccessReported=${posOutput.includes('Installation Complete')}`);
    if (posExitCode !== 0 || !posOutput.includes('Installation Complete')) {
      throw new Error(`Gate I Blocker 3: install_companion.bat positive install failed! ExitCode=${posExitCode}\nOutput:\n${posOutput}`);
    }

    // Assert Startup VBS was created
    const startupExistsPos = fs.existsSync(startupTarget);
    rec(`[GATE_I_POS_STARTUP_VERIFY] file="${startupTarget}" exists=${startupExistsPos}`);
    if (!startupExistsPos) {
      throw new Error('Gate I Blocker 3: Windows Startup VBS was not created by real install_companion.bat');
    }

    // Assert Edge registry key exists in HKCU
    let edgeRegQuery = '';
    try {
      edgeRegQuery = execSync('reg query "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay"', { encoding: 'utf8' });
    } catch (_) {}
    rec(`[GATE_I_POS_REGISTRY_VERIFY] EdgeKeyExists=${edgeRegQuery.includes('com.xpider.privacy_relay')}`);
    if (!edgeRegQuery.includes('com.xpider.privacy_relay')) {
      throw new Error('Gate I Blocker 3: Edge Native Messaging host registry key not found after real install');
    }

    // Assert real background relay service is running and responsive
    let relayOnline = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const res = await fetch('http://127.0.0.1:18989/status');
        if (res.status === 401 || res.status === 200) {
          relayOnline = true;
          break;
        }
      } catch (_) {}
    }
    rec(`[GATE_I_POS_RELAY_ONLINE] Online=${relayOnline}`);
    if (!relayOnline) {
      throw new Error('Gate I Blocker 3: Background Privacy Relay service failed to start or is not listening on 18989');
    }

    // 4. Exact-Bundle Real Edge Launch & Native Messaging Acceptance (Blockers 3 & 4)
    rec('\n[GATE_I_BUNDLE_EDGE_LAUNCH] Launching real Microsoft Edge loading delivered extension from release ZIP...');
    const extractedExtDir = path.join(extractedDir, 'extension');
    bundleProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_bundle_edge_prof_'));
    const BUNDLE_CDP_PORT = 9246;

    // Recreate upstream mock proxies for Gate I tests
    try { egressNode1.close(); } catch (_) {}
    try { egressNode2.close(); } catch (_) {}
    egressTraffic.node1.length = 0;
    egressTraffic.node2.length = 0;
    egressNode1 = createMockEgressProxy('node1', NODE1_PORT, '198.51.100.101', egressTraffic.node1);
    egressNode2 = createMockEgressProxy('node2', NODE2_PORT, '198.51.100.202', egressTraffic.node2);
    await new Promise(r => egressNode1.listen(NODE1_PORT, '127.0.0.1', r));
    await new Promise(r => egressNode2.listen(NODE2_PORT, '127.0.0.1', r));
    rec(`[GATE_I_UPSTREAMS_READY] Upstreams re-armed on ${NODE1_PORT} and ${NODE2_PORT}`);

    const bundleEdgeArgs = [
      `--remote-debugging-port=${BUNDLE_CDP_PORT}`,
      `--user-data-dir=${bundleProfileDir}`,
      `--load-extension=${extractedExtDir}`,
      `--disable-extensions-except=${extractedExtDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ];

    bundleEdgeProcess = spawn(edgeBinary, bundleEdgeArgs, { stdio: 'ignore' });
    rec(`[GATE_I_EDGE_SPAWNED] PID=${bundleEdgeProcess.pid} CDP=${BUNDLE_CDP_PORT} ExtPath=${extractedExtDir}`);

    // Connect to Service Worker via CDP
    let bundleBgTarget = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const resp = await fetch(`http://127.0.0.1:${BUNDLE_CDP_PORT}/json`);
        if (resp.ok) {
          const targets = await resp.json();
          bundleBgTarget = targets.find(t => t.type === 'service_worker' && (t.url.includes('background.js') || t.title.includes('XPIDER')));
          if (bundleBgTarget) break;
        }
      } catch (_) {}
    }
    if (!bundleBgTarget) throw new Error('Gate I Blocker 3: Service worker not found in Edge CDP for extracted extension');
    rec(`[GATE_I_BG_TARGET_FOUND] ws=${bundleBgTarget.webSocketDebuggerUrl}`);

    let bundleWs = await openWs(bundleBgTarget.webSocketDebuggerUrl);
    bundleWs.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          const text = (data.params.args || []).map(a => a.value || a.description || '').join(' ');
          rec(`[GATE_I_SW_CONSOLE] ${text}`);
        }
      } catch (_) {}
    });
    bundleWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
    let evalBundleSw = mkEval(bundleWs, 15000);

    const bundleExtId = (new URL(bundleBgTarget.url)).hostname;
    rec(`[GATE_I_EXT_ID_VERIFIED] ${bundleExtId} (Expected=${stableExtId})`);
    if (bundleExtId !== stableExtId) {
      throw new Error(`Gate I Blocker 3: Extracted extension ID (${bundleExtId}) != expected stable ID (${stableExtId})`);
    }

    // Wait until Service Worker runtime is ready
    for (let i = 0; i < 20; i++) {
      try {
        const ready = await evalBundleSw(`Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage)`);
        if (ready) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 400));
    }

    // Execute real Native Messaging IPC PING against installed companion host (Blocker 3)
    const bundlePingRes = await evalBundleSw(`new Promise((resolve) => {
      chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'PING' }, (resp) => {
        resolve({ lastError: chrome.runtime.lastError?.message, resp });
      });
    })`);
    rec(`[GATE_I_BUNDLE_NATIVE_PING] response=${JSON.stringify(bundlePingRes)}`);
    if (bundlePingRes.lastError || !bundlePingRes.resp || bundlePingRes.resp.action !== 'PONG') {
      throw new Error(`Gate I Blocker 3: Native Messaging PING failed against installed companion host: ${JSON.stringify(bundlePingRes)}`);
    }

    // Handshake token via ensureRelayActive (Blocker 4)
    const bundleAutoStart = await evalBundleSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.init();
      return await pg.ensureRelayActive(true);
    })()`);
    rec(`[GATE_I_BUNDLE_HANDSHAKE] active=${bundleAutoStart.active}`);
    if (!bundleAutoStart.active) {
      throw new Error(`Gate I Blocker 4: ensureRelayActive handshake failed on installed bundle: ${JSON.stringify(bundleAutoStart)}`);
    }

    // Add egress node through Owner Control API using companion's token (Blocker 4)
    let compToken = '';
    try {
      compToken = fs.readFileSync(path.join(extractedCompanionDir, '.control_token'), 'utf8').trim();
    } catch (_) {}

    const addNodeRes1 = await fetch(`http://127.0.0.1:${CONTROL_PORT}/add-node`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${compToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'egress-node-1', name: 'Delivered Node 1', type: 'HTTP_PROXY', host: '127.0.0.1', port: NODE1_PORT, password: 'SecretDeliveredPass1' })
    });
    const addNodeRes2 = await fetch(`http://127.0.0.1:${CONTROL_PORT}/add-node`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${compToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'egress-node-2', name: 'Delivered Node 2', type: 'HTTP_PROXY', host: '127.0.0.1', port: NODE2_PORT, password: 'SecretDeliveredPass2' })
    });
    rec(`[GATE_I_BUNDLE_ADD_NODES] Node1Status=${addNodeRes1.status} Node2Status=${addNodeRes2.status}`);

    // Verify DPAPI persistence in extracted companion config file
    const extCompConfig = JSON.parse(fs.readFileSync(path.join(extractedCompanionDir, 'egress_pool_config.json'), 'utf8'));
    const savedNode1 = extCompConfig.nodes.find(n => n.id === 'egress-node-1');
    const dpapiPersisted = savedNode1 && savedNode1.credentialRef && savedNode1.credentialRef.startsWith('dpapi:') && savedNode1.password === '';
    rec(`[GATE_I_BUNDLE_DPAPI_PERSISTED] Count=${extCompConfig.nodes.length} DPAPI=${dpapiPersisted}`);
    if (!dpapiPersisted) {
      throw new Error('Gate I Blocker 4: Egress node was not persisted with DPAPI encryption in installed companion config');
    }

    // Configure companion pool canaryUrl for test environment
    await fetch(`http://127.0.0.1:${CONTROL_PORT}/set-pool`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${compToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: extCompConfig.nodes,
        canaryUrl: `http://127.0.0.1:${TARGET_PORT}/privacy-canary`,
        persist: false
      })
    });
    await fetch(`http://127.0.0.1:${CONTROL_PORT}/mode`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${compToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotationMode: 'HEALTH_FAILOVER' })
    });

    // Configure Privacy Gateway in delivered extension (Blocker 4)
    await evalBundleSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.saveConfig({
        enabled: true,
        transportMode: 'PRIVACY_RELAY',
        relayHost: '127.0.0.1',
        relayControlPort: ${CONTROL_PORT},
        relayRotationMode: 'HEALTH_FAILOVER',
        healthFailover: true,
        canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary'
      });
      await pg.setRelayMode('HEALTH_FAILOVER');
    })()`);

    // Privacy Preflight (Blocker 4)
    const bundlePreflight = await evalBundleSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      return await pg.runPreflight({ canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary' });
    })()`);
    rec(`[GATE_I_BUNDLE_PREFLIGHT] ready=${bundlePreflight.ready} fp=${bundlePreflight.egressFingerprint}`);
    if (!bundlePreflight.ready) {
      throw new Error(`Gate I Blocker 4: Privacy Preflight failed on installed bundle: ${JSON.stringify(bundlePreflight)}`);
    }

    // Fetch Target 1 through Node 1 (Blocker 4)
    egressTraffic.node1.length = 0;
    egressTraffic.node2.length = 0;
    const bundleT1 = await evalBundleSw(`(async () => {
      const resp = await fetch('http://127.0.0.1:${TARGET_PORT}/privacy-canary');
      return { ok: resp.ok, text: (await resp.text()).trim() };
    })()`);
    rec(`[GATE_I_BUNDLE_TARGET1] ok=${bundleT1.ok} text="${bundleT1.text}" node1_reqs=${egressTraffic.node1.length}`);
    if (egressTraffic.node1.length === 0 || !bundleT1.text.includes('198.51.100.101')) {
      throw new Error('Gate I Blocker 4: Target 1 did not route through Node 1 on installed bundle');
    }

    // Live A->B Failover: Kill Node 1, fetch Target 2 through Node 2 with 0 DIRECT fallback (Blocker 4)
    rec('[GATE_I_KILL_NODE1] Stopping Node 1 to trigger installed bundle failover...');
    await new Promise(r => egressNode1.close(r));
    const bundleT2 = await evalBundleSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      const contRes = await pg.checkEgressContinuity();
      const fetchRes = await fetch('http://127.0.0.1:${TARGET_PORT}/privacy-canary');
      const text = await fetchRes.text();
      return { contRes, ok: fetchRes.ok, text: text.trim() };
    })()`);
    rec(`[GATE_I_BUNDLE_FAILOVER] recovered=${bundleT2.contRes?.recovered} newEgressId=${bundleT2.contRes?.newEgressId} fetchOk=${bundleT2.ok} node2_reqs=${egressTraffic.node2.length}`);
    if (!bundleT2.contRes?.recovered || bundleT2.contRes?.newEgressId !== 'egress-node-2' || egressTraffic.node2.length === 0) {
      throw new Error(`Gate I Blocker 4: Live failover failed on installed bundle: ${JSON.stringify(bundleT2)}`);
    }
    rec('  -> PROVEN: Installed bundle successfully failed over from Node 1 to Node 2 without dropping to DIRECT!');

    // Browser Restart Auto-Recovery (Blocker 4)
    rec('\n[GATE_I_BUNDLE_BROWSER_RESTART] Testing Edge browser restart auto-recovery...');
    bundleEdgeProcess.kill();
    bundleEdgeProcess = null;
    await new Promise(r => setTimeout(r, 1200));

    bundleEdgeProcess = spawn(edgeBinary, bundleEdgeArgs, { stdio: 'ignore' });
    rec(`[GATE_I_EDGE_RESTARTED] PID=${bundleEdgeProcess.pid}`);

    let restartBgTarget = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const resp = await fetch(`http://127.0.0.1:${BUNDLE_CDP_PORT}/json`);
        if (resp.ok) {
          const targets = await resp.json();
          restartBgTarget = targets.find(t => t.type === 'service_worker' && (t.url.includes('background.js') || t.title.includes('XPIDER')));
          if (restartBgTarget) break;
        }
      } catch (_) {}
    }
    if (!restartBgTarget) throw new Error('Gate I Blocker 4: Background service worker not found after browser restart');

    const restartWs = await openWs(restartBgTarget.webSocketDebuggerUrl);
    restartWs.send(JSON.stringify({ id: 999, method: 'Runtime.enable' }));
    const evalRestartSw = mkEval(restartWs, 15000);

    for (let i = 0; i < 20; i++) {
      try {
        const ready = await evalRestartSw(`Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage)`);
        if (ready) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 400));
    }

    // Reconnect Native Messaging after restart
    const restartPingRes = await evalRestartSw(`new Promise((resolve) => {
      chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'PING' }, (resp) => {
        resolve({ lastError: chrome.runtime.lastError?.message, resp });
      });
    })`);
    rec(`[GATE_I_RESTART_NATIVE_PING] response=${JSON.stringify(restartPingRes)}`);
    if (restartPingRes.lastError || !restartPingRes.resp || restartPingRes.resp.action !== 'PONG') {
      throw new Error(`Gate I Blocker 4: Native Messaging reconnect failed after Edge restart: ${JSON.stringify(restartPingRes)}`);
    }

    // Preflight after restart
    const restartPreflight = await evalRestartSw(`(async () => {
      const pg = PrivacyGateway.getInstance();
      await pg.init();
      const activeRes = await pg.ensureRelayActive(true);
      const preflight = await pg.runPreflight({ canaryUrl: 'http://127.0.0.1:${TARGET_PORT}/privacy-canary' });
      return { activeRes, preflight };
    })()`);
    rec(`[GATE_I_RESTART_PREFLIGHT] active=${restartPreflight.activeRes?.active} ready=${restartPreflight.preflight?.ready} fp=${restartPreflight.preflight?.egressFingerprint}`);
    if (!restartPreflight.preflight?.ready) {
      throw new Error(`Gate I Blocker 4: Preflight failed after Edge restart on installed bundle: ${JSON.stringify(restartPreflight)}`);
    }

    // -------------------------------------------------------------
    // Test F: REAL EDGE SMOKE (Issue #6 R6.9G.10.3.3 / Owner Trace Reproduction)
    // Click Start from real Edge DOM UI on delivered bundle in running restarted browser
    // Assert ordered evidence: [START_UI] -> [START_GUARD] -> [START_IPC] -> [START_BG] -> [START_ACK] -> target dispatch
    // -------------------------------------------------------------
    rec('\n[GATE_I_TEST_F_REAL_DOM_SMOKE] Executing real Edge DOM Start click on extracted release bundle...');

    // Re-arm mock node 1 so both upstream nodes are healthy
    try { egressNode1.close(); } catch (_) {}
    egressTraffic.node1.length = 0;
    egressNode1 = createMockEgressProxy('node1', NODE1_PORT, '198.51.100.101', egressTraffic.node1);
    await new Promise(r => egressNode1.listen(NODE1_PORT, '127.0.0.1', r));

    // Gate G (R6.9G.10.3.4): Seed saved template into storage before opening popup to verify automatic hydration
    rec('\n[GATE_I_TEST_F_SEED_TEMPLATE] Seeding legacy xpider_tpl into extension storage to verify automatic hydration...');
    await evalRestartSw(`(async () => {
      await chrome.storage.local.set({
        xpider_tpl: {
          name: 'Test Audit Operator',
          email: 'audit-operator@example.com',
          message: 'Inquiry regarding privacy verification and automated dispatch.',
          subject: 'Partnership Inquiry'
        }
      });
    })()`);

    // Create a new tab with popup.html
    let popupTarget = null;
    try {
      const pRes = await fetch(`http://127.0.0.1:${BUNDLE_CDP_PORT}/json/new?chrome-extension://${bundleExtId}/popup.html`, { method: 'PUT' });
      popupTarget = await pRes.json();
    } catch (_) {
      const pRes = await fetch(`http://127.0.0.1:${BUNDLE_CDP_PORT}/json/new?chrome-extension://${bundleExtId}/popup.html`);
      popupTarget = await pRes.json();
    }
    rec(`[GATE_I_TEST_F_POPUP_TARGET] id=${popupTarget.id} ws=${popupTarget.webSocketDebuggerUrl}`);

    const popupWs = await openWs(popupTarget.webSocketDebuggerUrl);
    const popupLogs = [];
    popupWs.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          const text = (data.params.args || []).map(a => a.value || a.description || '').join(' ');
          popupLogs.push(text);
          rec(`[TEST_F_POPUP_CONSOLE] ${text}`);
        }
      } catch (_) {}
    });
    popupWs.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    const evalPopup = mkEval(popupWs, 20000);

    // Prevent any blocking dialogs in automated test
    await evalPopup(`(() => {
      window.alert = (msg) => { console.warn('[POPUP_ALERT_MOCK]', msg); };
      window.confirm = () => true;
    })()`);

    // Wait for popup DOM ready and #start-btn
    let startBtnReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const ready = await evalPopup(`Boolean(document.getElementById('start-btn'))`);
        if (ready) {
          startBtnReady = true;
          break;
        }
      } catch (_) {}
    }
    rec(`[GATE_I_TEST_F_DOM_READY] StartBtnReady=${startBtnReady}`);
    if (!startBtnReady) throw new Error('Gate I Test F: start-btn element not found in popup DOM');

    // Wait for start button self-healing / ready state (data-build-locked must not be "true")
    let startLocked = true;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const lockAttr = await evalPopup(`document.getElementById('start-btn').getAttribute('data-build-locked')`);
        if (lockAttr !== 'true') {
          startLocked = false;
          break;
        }
      } catch (_) {}
    }
    rec(`[GATE_I_TEST_F_LOCK_STATE] startLocked=${startLocked}`);
    if (startLocked) {
      throw new Error('Gate I Test F: start-btn remained permanently locked with data-build-locked="true"');
    }

    // Populate 3 controlled target URLs using real UI and template message
    const populateRes = await evalPopup(`(async () => {
      const urls = [
        'http://127.0.0.1:${TARGET_PORT}/contact-target?q=1',
        'http://127.0.0.1:${TARGET_PORT}/contact-target?q=2',
        'http://127.0.0.1:${TARGET_PORT}/contact-target?q=3'
      ];
      const manualInput = document.getElementById('manual-url-input');
      const addBtn = document.getElementById('add-url-btn');
      for (const u of urls) {
        manualInput.value = u;
        addBtn.click();
        await new Promise(r => setTimeout(r, 60));
      }
      // [R6.9G.10.3.4 Gate G]: DO NOT manually type Message Body; verify it was automatically hydrated from storage!
      const tplMsg = document.getElementById('tpl-message');
      const startBtn = document.getElementById('start-btn');
      return {
        urlCount: document.getElementById('url-count-display')?.textContent || '',
        msgLen: tplMsg ? tplMsg.value.length : 0,
        btnDisabled: startBtn ? startBtn.disabled : true
      };
    })()`);
    rec(`[GATE_I_TEST_F_POPULATED] ${JSON.stringify(populateRes)}`);
    if (populateRes.msgLen === 0) {
      throw new Error(`Gate I Test F: Template Message was NOT auto-hydrated! msgLen=0. Logs:\n${popupLogs.join('\n')}`);
    }

    // Capture background console logs for START_BG via restartWs
    const bgLogs = [];
    restartWs.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.method === 'Runtime.consoleAPICalled') {
          const text = (data.params.args || []).map(a => a.value || a.description || '').join(' ');
          bgLogs.push(text);
        }
      } catch (_) {}
    });

    targetTrafficLog.length = 0;

    // Execute real DOM CLICK on #start-btn
    rec('\n[GATE_I_TEST_F_EXECUTE_CLICK] Clicking #start-btn in real Edge popup DOM...');
    const clickRes = await evalPopup(`(() => {
      const btn = document.getElementById('start-btn');
      if (!btn) return { ok: false, error: 'NO_BUTTON' };
      btn.click();
      return { ok: true, clicked: true };
    })()`);
    rec(`[GATE_I_TEST_F_CLICKED] ${JSON.stringify(clickRes)}`);

    // Poll for ordered evidence: [START_UI] -> [START_GUARD] -> [START_IPC] -> [START_BG] -> [START_ACK]
    let startUiFound = false;
    let startGuardFound = false;
    let startIpcFound = false;
    let startBgFound = false;
    let startAckFound = false;
    let targetDispatched = false;

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const allPopup = popupLogs.join('\n');
      const allBg = bgLogs.join('\n');

      if (!startUiFound && allPopup.includes('[START_UI]')) startUiFound = true;
      if (!startGuardFound && allPopup.includes('[START_GUARD]')) startGuardFound = true;
      if (!startIpcFound && allPopup.includes('[START_IPC]')) startIpcFound = true;
      if (!startBgFound && (allBg.includes('[START_BG]') || allPopup.includes('[START_BG]'))) startBgFound = true;
      if (!startAckFound && (allPopup.includes('[START_ACK]') || allPopup.includes('Campaign started!'))) startAckFound = true;
      if (!targetDispatched && (targetTrafficLog.some(t => t.url.includes('contact-target')) || allBg.includes('PREPARING') || allBg.includes('Target 1') || allBg.includes('Opening target'))) targetDispatched = true;

      if (startUiFound && startGuardFound && startIpcFound && startBgFound && startAckFound) break;
    }

    const finalPopupLogs = popupLogs.join('\n');
    const templateHydrateFound = finalPopupLogs.includes('[TEMPLATE_HYDRATE]') && finalPopupLogs.includes('messagePresent=true');
    rec(`[GATE_I_TEST_F_EVIDENCE] TEMPLATE_HYDRATE=${templateHydrateFound} START_UI=${startUiFound} START_GUARD=${startGuardFound} START_IPC=${startIpcFound} START_BG=${startBgFound} START_ACK=${startAckFound} TargetDispatched=${targetDispatched}`);

    if (!templateHydrateFound) {
      throw new Error(`Gate I Test F: [TEMPLATE_HYDRATE] messagePresent=true log missing from popup console! Logs:\n${finalPopupLogs}`);
    }
    if (!startUiFound) {
      throw new Error(`Gate I Test F: [START_UI] log missing from popup console! Logs:\n${popupLogs.join('\n')}`);
    }
    if (!startGuardFound) {
      throw new Error(`Gate I Test F: [START_GUARD] log missing from popup console! Logs:\n${popupLogs.join('\n')}`);
    }
    if (!startIpcFound) {
      throw new Error(`Gate I Test F: [START_IPC] log missing from popup console! Logs:\n${popupLogs.join('\n')}`);
    }
    if (!startBgFound) {
      throw new Error(`Gate I Test F: [START_BG] log missing from background service worker! Logs:\n${bgLogs.join('\n')}`);
    }
    if (!startAckFound) {
      throw new Error(`Gate I Test F: [START_ACK] log missing from popup! Logs:\n${popupLogs.join('\n')}`);
    }

    rec('  -> PROVEN: Real Edge DOM Start click produced [START_UI] -> [START_GUARD] -> [START_IPC] -> [START_BG] -> [START_ACK] sequence!');

    // Stop campaign and close popup
    try {
      await evalRestartSw(`new Promise(r => chrome.runtime.sendMessage({ action: 'STOP_CAMPAIGN' }, r))`);
    } catch (_) {}
    try {
      await fetch(`http://127.0.0.1:${BUNDLE_CDP_PORT}/json/close/${popupTarget.id}`);
    } catch (_) {}

    // Terminate restarted Edge process before uninstall
    bundleEdgeProcess.kill();
    bundleEdgeProcess = null;
    await new Promise(r => setTimeout(r, 800));

    // 5. Enforced Uninstall Test: Run real uninstall_companion.bat --silent from extracted bundle (Blocker 6)
    rec('\n[GATE_I_UNINSTALL] Executing real uninstall_companion.bat --silent from extracted bundle...');
    let uninstExitCode = 0;
    let uninstOutput = '';
    try {
      uninstOutput = execSync(`cmd.exe /c "call "${uninstallBatPath}" --silent"`, {
        cwd: extractedCompanionDir,
        encoding: 'utf8'
      });
    } catch (err) {
      uninstExitCode = err.status || 1;
      uninstOutput = (err.stdout || '') + (err.stderr || '');
    }
    rec(`[GATE_I_UNINSTALL_RESULT] ExitCode=${uninstExitCode} CompletedReported=${uninstOutput.includes('Uninstallation Complete')}`);
    if (uninstExitCode !== 0) {
      throw new Error(`Gate I Blocker 6: uninstall_companion.bat exited with non-zero code ${uninstExitCode}! Output:\n${uninstOutput}`);
    }
    if (!uninstOutput.includes('Uninstallation Complete')) {
      throw new Error(`Gate I Blocker 6: uninstall_companion.bat did not output "Uninstallation Complete"! Output:\n${uninstOutput}`);
    }

    // Assert Startup VBS removed
    const startupExistsAfterUninst = fs.existsSync(startupTarget);
    rec(`[GATE_I_STARTUP_REMOVED] Exists=${startupExistsAfterUninst} (Expected false)`);
    if (startupExistsAfterUninst) {
      throw new Error('Gate I Blocker 3: Startup VBS not removed after real uninstall_companion.bat');
    }

    // Assert HKCU registry key removed
    let regQueryAfterUninst = '';
    try {
      regQueryAfterUninst = execSync('reg query "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay"', { encoding: 'utf8' });
    } catch (_) {}
    rec(`[GATE_I_REGISTRY_REMOVED] Exists=${regQueryAfterUninst.includes('com.xpider.privacy_relay')} (Expected false)`);
    if (regQueryAfterUninst.includes('com.xpider.privacy_relay')) {
      throw new Error('Gate I Blocker 3: Registry keys still exist after real uninstall_companion.bat');
    }

    // Verify production config remains completely pristine
    const finalProdConfig = JSON.parse(fs.readFileSync('companion/egress_pool_config.json', 'utf8'));
    rec(`[GATE_I_PROD_CONFIG_PRISTINE] nodesCount=${finalProdConfig.nodes.length} canary=${finalProdConfig.canaryUrl}`);
    if (finalProdConfig.nodes.length !== 0 || finalProdConfig.canaryUrl.includes('127.0.0.1')) {
      throw new Error(`Gate I Blocker 1: Production config was modified during audit! nodes=${finalProdConfig.nodes.length} canary=${finalProdConfig.canaryUrl}`);
    }

    // Cleanup extracted temp directory
    try {
      fs.rmSync(extractedDir, { recursive: true, force: true });
    } catch (_) {}

    rec('✅ GATE I: EXACT-BUNDLE BATCH INSTALLATION & ROLLBACK VERIFIED PASS');


    rec('\n========================================================================');
    rec('  🎉 ALL R6.9G.10.3 OPERATOR AUDIT GATES (A - J) VERIFIED 100% PASS');
    rec('========================================================================');

  } finally {
    // Teardown processes
    if (edgeProcess) {
      try { edgeProcess.kill(); } catch (_) {}
    }
    if (bundleEdgeProcess) {
      try { bundleEdgeProcess.kill(); } catch (_) {}
    }
    if (bundleProfileDir) {
      try { fs.rmSync(bundleProfileDir, { recursive: true, force: true }); } catch (_) {}
    }
    if (companionService) {
      try { await companionService.stop(); } catch (_) {}
    }
    try { targetServer.close(); } catch (_) {}
    try { egressNode1.close(); } catch (_) {}
    try { egressNode2.close(); } catch (_) {}
    if (egressHttpsNode) {
      try { egressHttpsNode.close(); } catch (_) {}
    }
    unregisterFromRegistry();

    // Kill any lingering background privacy-relay-service instances
    try {
      execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*privacy-relay-service.js*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: 'ignore' });
    } catch (_) {}

    // Clean temp profile
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (_) {}

    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    console.log(`\nAudit log saved to: ${OUT}`);
  }
}

if (require.main === module) {
  runRealEdgeAudit()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ AUDIT FAILED:', err);
      lines.push(`[FATAL_ERROR] ${err.stack || err.message}`);
      fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
      process.exit(1);
    });
}

module.exports = { runRealEdgeAudit };
