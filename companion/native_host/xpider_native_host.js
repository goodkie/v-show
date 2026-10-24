/**
 * xpider_native_host.js
 * 
 * Native Messaging Host for Chrome / Microsoft Edge MV3 (Issue #6 R6.9G.10.1)
 * Provides Zero-Manual-Launch UX:
 * Allows the XPIDER Extension to probe, start, stop, recover, and retrieve the control token
 * for the Companion Privacy Relay without requiring the Owner to open terminal windows.
 */

const { exec, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const RELAY_DIR = path.resolve(__dirname, '..');
const { PrivateEgressProvisioner, TIERS } = require(path.join(RELAY_DIR, 'private-egress-provisioner'));
const SILENT_RUNNER_VBS = path.join(RELAY_DIR, 'start_relay_silent.vbs');
const RELAY_SCRIPT = path.join(RELAY_DIR, 'privacy-relay-service.js');
const TOKEN_FILE = path.join(RELAY_DIR, '.control_token');
const EXPOSED_RC3_6_TOKEN_SHA256 = '597a70b99c11c7f4d13a075204ac240bb08a7a1d6c08c78268328e0bb59daeda';
const COMPANION_BUILD_ID = 'R6.9G.10.3.7.1.4.66-20261024-P0-RC3.50';
const CONTROL_PORT = 18989;
const PROXY_PORT = 18988;

function isCompatibleExtensionBuild(extBuildId, companionBuildId) {
  if (!extBuildId || typeof extBuildId !== 'string') return false;
  if (!companionBuildId || typeof companionBuildId !== 'string') return false;
  return extBuildId.split('-')[0] === companionBuildId.split('-')[0];
}

function getControlToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
        try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
        return null;
      }
      return token;
    }
  } catch (_) {}
  return null;
}

function sendNativeMessage(msg) {
  const jsonStr = JSON.stringify(msg);
  const len = Buffer.byteLength(jsonStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(len, 0);
  process.stdout.write(header);
  process.stdout.write(jsonStr, 'utf8');
}

// [Defect P Fix] Strict Node.js supported LTS allowlist (explicitly 22 or 24 only; rejects odd/EOL/non-LTS majors)
const SUPPORTED_LTS_MAJORS = [22, 24];
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (!SUPPORTED_LTS_MAJORS.includes(nodeMajor)) {
  sendNativeMessage({ success: false, error: `Unsupported Node.js runtime detected (${process.version}). XPIDER requires an official supported LTS runtime (explicitly v24 or v22 LTS). Major ${nodeMajor} is strictly rejected.` });
  process.exit(1);
}

async function checkRelayStatus() {
  const token = getControlToken();
  return new Promise((resolve) => {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const req = http.get({
      hostname: '127.0.0.1',
      port: CONTROL_PORT,
      path: '/status',
      headers
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ running: res.statusCode === 200, status: parsed, statusCode: res.statusCode });
        } catch (_) {
          resolve({ running: res.statusCode === 200, raw: body, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', () => {
      resolve({ running: false, status: null });
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve({ running: false, reason: 'TIMEOUT' });
    });
  });
}

async function checkRelayHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CONTROL_PORT}/health`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve({ running: res.statusCode === 200, health: JSON.parse(body) });
        } catch (_) {
          resolve({ running: res.statusCode === 200, raw: body });
        }
      });
    });
    req.on('error', () => {
      resolve({ running: false });
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve({ running: false });
    });
  });
}

async function startRelay() {
  // [Issue #6 Comment #6261136757 DD3] Migrate active egress state from previous installation if needed
  try {
    const { migrateActiveEgressState } = require(path.join(RELAY_DIR, 'state-migrator'));
    migrateActiveEgressState(RELAY_DIR);
  } catch (_) {}

  const health = await checkRelayHealth();
  const token = getControlToken();
  const authStatus = await checkRelayStatus();
  if (health.running && token && authStatus.running && authStatus.statusCode === 200) {
    const d = health.health || {};
    const caps = Array.isArray(d.apiCapabilities) ? d.apiCapabilities : [];
    const isCurrentBuild = (d.companionBuildId === COMPANION_BUILD_ID);
    if (caps.includes('verify-plan') && isCurrentBuild) {
      return { success: true, message: 'ALREADY_RUNNING', controlToken: token };
    }
  }

  const ensureScript = path.join(RELAY_DIR, 'ensure_companion_service.js');
  if (fs.existsSync(ensureScript)) {
    return new Promise((resolve) => {
      exec(`"${process.execPath}" "${ensureScript}"`, { cwd: path.resolve(RELAY_DIR, '..') }, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, error: (stderr || err.message).trim(), stdout: stdout ? stdout.trim() : '' });
        } else {
          resolve({ success: true, message: 'UPGRADED_AND_STARTED', controlToken: getControlToken(), stdout: stdout ? stdout.trim() : '' });
        }
      });
    });
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32' && fs.existsSync(SILENT_RUNNER_VBS)) {
      exec(`wscript.exe "${SILENT_RUNNER_VBS}"`, (err) => {
        if (err) {
          try {
            const child = spawn(process.execPath, [RELAY_SCRIPT], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
              env: process.env
            });
            child.unref();
            resolve({ success: true, message: 'SPAWNED_DETACHED', controlToken: getControlToken() });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        } else {
          resolve({ success: true, message: 'STARTED_VIA_VBS', controlToken: getControlToken() });
        }
      });
    } else {
      try {
        const child = spawn(process.execPath, [RELAY_SCRIPT], {
          detached: true,
          stdio: 'ignore',
          env: process.env
        });
        child.unref();
        resolve({ success: true, message: 'SPAWNED_DETACHED', controlToken: getControlToken() });
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    }
  });
}

async function stopRelay() {
  const token = getControlToken();
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: CONTROL_PORT,
      path: '/stop',
      method: 'POST',
      headers
    }, (res) => {
      resolve({ success: true, statusCode: res.statusCode });
    });
    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ success: false, error: 'TIMEOUT' });
    });
    req.end();
  });
}

async function handleMessage(msg) {
  const action = msg && msg.action;
  switch (action) {
    case 'PING':
      return { action: 'PONG', timestamp: Date.now() };

    case 'GET_TOKEN': {
      const token = getControlToken();
      const health = await checkRelayHealth();
      return {
        action: 'TOKEN_RESPONSE',
        success: !!token,
        controlToken: token,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT,
        nativeHostPath: __filename,
        isRunning: health.running,
        companionBuildId: health.health ? health.health.companionBuildId : null,
        failureReason: !token ? 'CONTROL_TOKEN_FILE_MISSING' : null
      };
    }

    case 'STATUS': {
      const st = await checkRelayStatus();
      const token = getControlToken();
      const health = await checkRelayHealth();
      return {
        action: 'STATUS_RESPONSE',
        ...st,
        controlToken: token,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT,
        nativeHostPath: __filename,
        companionBuildId: health.health ? health.health.companionBuildId : null,
        expectedBuildId: COMPANION_BUILD_ID,
        failureReason: !st.running ? (st.reason || (st.statusCode ? `HTTP_${st.statusCode}` : 'PORT_UNREACHABLE')) : (!token ? 'AUTH_TOKEN_MISSING' : null)
      };
    }

    case 'START': {
      // 1. Ensure state is migrated first
      try {
        const { migrateActiveEgressState } = require(path.join(RELAY_DIR, 'state-migrator'));
        migrateActiveEgressState(RELAY_DIR);
      } catch (_) {}

      const res = await startRelay();
      // Poll up to 10 times (up to 4s) for relay to become responsive AND have a valid authenticated token
      let verify = await checkRelayHealth();
      let token = getControlToken();
      let authStatus = await checkRelayStatus();
      for (let i = 0; i < 10 && (!verify.running || !token || !authStatus.running); i++) {
        await new Promise(r => setTimeout(r, 400));
        verify = await checkRelayHealth();
        token = getControlToken();
        authStatus = await checkRelayStatus();
      }

      const isRunning = verify.running;
      const isCurrentBuild = verify.health && verify.health.companionBuildId === COMPANION_BUILD_ID;
      const hasToken = !!token;
      const isAuthenticated = authStatus.running && authStatus.statusCode === 200;
      const isReady = isRunning && isCurrentBuild && hasToken && isAuthenticated;

      let failureReason = null;
      if (!isRunning) failureReason = 'COMPANION_PORT_UNREACHABLE';
      else if (!isCurrentBuild) failureReason = 'STALE_COMPANION_BUILD_NOT_UPGRADED';
      else if (!hasToken) failureReason = 'AUTH_TOKEN_MISSING';
      else if (!isAuthenticated) failureReason = (authStatus.statusCode === 401 ? 'TOKEN_DESYNC_401' : (authStatus.reason || 'UNAUTHENTICATED'));

      return {
        action: 'START_RESPONSE',
        success: isReady,
        result: res,
        isRunningNow: isRunning,
        isCurrentBuild,
        isAuthenticated,
        companionBuildId: verify.health ? verify.health.companionBuildId : null,
        expectedBuildId: COMPANION_BUILD_ID,
        controlToken: token,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT,
        nativeHostPath: __filename,
        failureReason
      };
    }

    case 'DIAGNOSTICS': {
      const health = await checkRelayHealth();
      const token = getControlToken();
      const authStatus = await checkRelayStatus();
      const poolConfigPath = path.join(RELAY_DIR, 'egress_pool_config.json');
      const txPath = path.join(RELAY_DIR, '.private_egress_transaction.json');

      let poolNodesCount = 0;
      let selectedEgressId = null;
      let poolConfigExists = false;
      try {
        if (fs.existsSync(poolConfigPath)) {
          poolConfigExists = true;
          const p = JSON.parse(fs.readFileSync(poolConfigPath, 'utf8'));
          poolNodesCount = Array.isArray(p.nodes) ? p.nodes.length : 0;
          selectedEgressId = p.selectedEgressId || null;
        }
      } catch (_) {}

      let txExists = false;
      let txStatus = null;
      let txStage = null;
      let txPublicIp = null;
      try {
        if (fs.existsSync(txPath)) {
          txExists = true;
          const t = JSON.parse(fs.readFileSync(txPath, 'utf8'));
          txStatus = t.status || null;
          txStage = t.stage || null;
          txPublicIp = t.publicIp || null;
        }
      } catch (_) {}

      let tokenValidity = 'UNKNOWN';
      let tokenDesync = false;
      if (!token) {
        tokenValidity = 'TOKEN_MISSING';
      } else if (health.running && authStatus.running && authStatus.statusCode === 200) {
        tokenValidity = 'TOKEN_PRESENT_VALID';
      } else if (health.running && authStatus.statusCode === 401) {
        tokenValidity = 'TOKEN_PRESENT_REJECTED';
        tokenDesync = true;
      } else if (!health.running) {
        tokenValidity = 'PORT_OFFLINE';
      }

      let failureReason = null;
      if (!health.running) failureReason = 'PORT_18989_OFFLINE';
      else if (tokenDesync) failureReason = 'TOKEN_DESYNC_401';
      else if (!token) failureReason = 'AUTH_TOKEN_MISSING';
      else if (!authStatus.running) failureReason = (authStatus.reason || 'STATUS_ERROR');

      return {
        action: 'DIAGNOSTICS_RESPONSE',
        success: true,
        nativeHostPath: __filename,
        relayDir: RELAY_DIR,
        companionBuildId: health.health ? health.health.companionBuildId : null,
        expectedBuildId: COMPANION_BUILD_ID,
        isCurrentBuild: health.health ? (health.health.companionBuildId === COMPANION_BUILD_ID) : false,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT,
        port18989Health: health.running ? 'LISTENING_HTTP_200' : 'UNREACHABLE',
        hasControlToken: !!token,
        tokenLength: token ? token.length : 0,
        tokenValidity,
        tokenDesync,
        authenticatedStatus: authStatus.running,
        authenticatedStatusCode: authStatus.statusCode,
        poolConfigExists,
        poolNodesCount,
        selectedEgressId,
        txExists,
        txStatus,
        txStage,
        txPublicIp,
        nodeVersion: process.version,
        lifecycleState: (authStatus.status && authStatus.status.lifecycleState) || (health.health && health.health.lifecycleState) || (health.running ? 'READY' : 'OFFLINE'),
        reconnectAttempt: (authStatus.status && authStatus.status.reconnectAttempt) || (health.health && health.health.reconnectAttempt) || 0,
        diagnostics: (authStatus.status && authStatus.status.diagnostics) || null,
        failureReason
      };
    }

    case 'STOP': {
      const res = await stopRelay();
      return { action: 'STOP_RESPONSE', result: res };
    }

    case 'RESTART': {
      await stopRelay();
      await new Promise(r => setTimeout(r, 800));
      await startRelay();
      let verify = await checkRelayHealth();
      for (let i = 0; i < 6 && !verify.running; i++) {
        await new Promise(r => setTimeout(r, 400));
        verify = await checkRelayHealth();
      }
      return {
        action: 'RESTART_RESPONSE',
        isRunningNow: verify.running,
        controlToken: getControlToken()
      };
    }

    case 'OWNER_TEST_SERVER_STATUS': {
      const probe = await probeOwnerTestServerHealth(1500);
      return {
        action: 'OWNER_TEST_SERVER_STATUS_RESPONSE',
        ...probe,
        timestamp: Date.now()
      };
    }

    case 'START_OWNER_TEST_SERVER': {
      const startRes = await startOwnerTestServer();
      return {
        action: 'START_OWNER_TEST_SERVER_RESPONSE',
        ...startRes,
        timestamp: Date.now()
      };
    }

    case 'STOP_OWNER_TEST_SERVER': {
      const stopRes = await stopOwnerTestServer();
      return {
        action: 'STOP_OWNER_TEST_SERVER_RESPONSE',
        ...stopRes,
        timestamp: Date.now()
      };
    }

    case 'VERIFY_PRIVATE_EGRESS_PLAN': {
      const payload = msg.payload || {};
      const token = payload.token;
      if (!token) {
        return { action: 'VERIFY_PRIVATE_EGRESS_PLAN_RESPONSE', success: false, error: 'MISSING_API_TOKEN' };
      }
      if (payload.extensionBuildId && typeof payload.extensionBuildId === 'string') {
        if (!isCompatibleExtensionBuild(payload.extensionBuildId, COMPANION_BUILD_ID)) {
          return {
            action: 'VERIFY_PRIVATE_EGRESS_PLAN_RESPONSE',
            success: false,
            error: `EXTENSION_COMPANION_VERSION_MISMATCH: Extension build (${payload.extensionBuildId}) does not match Companion service build (${COMPANION_BUILD_ID}). Please reload the extension at chrome://extensions or edge://extensions.`
          };
        }
      }
      const provisioner = new PrivateEgressProvisioner({
        token,
        controlPort: CONTROL_PORT,
        controlToken: getControlToken(),
        mockMode: Boolean(payload.mockMode)
      });
      try {
        const result = await provisioner.verifyPlanAndPrice({
          tier: payload.tier || 'ULTRA_ECONOMY',
          region: payload.region || 'nyc3'
        });
        return { action: 'VERIFY_PRIVATE_EGRESS_PLAN_RESPONSE', success: true, result };
      } catch (err) {
        return { action: 'VERIFY_PRIVATE_EGRESS_PLAN_RESPONSE', success: false, error: err.message };
      }
    }

    case 'PROVISION_PRIVATE_EGRESS': {
      const payload = msg.payload || {};
      const token = payload.token;
      if (!token) {
        return { action: 'PROVISION_PRIVATE_EGRESS_RESPONSE', success: false, error: 'MISSING_API_TOKEN' };
      }
      if (payload.extensionBuildId && typeof payload.extensionBuildId === 'string') {
        if (!isCompatibleExtensionBuild(payload.extensionBuildId, COMPANION_BUILD_ID)) {
          return {
            action: 'PROVISION_PRIVATE_EGRESS_RESPONSE',
            success: false,
            error: `EXTENSION_COMPANION_VERSION_MISMATCH: Extension build (${payload.extensionBuildId}) does not match Companion service build (${COMPANION_BUILD_ID}). Please reload the extension at chrome://extensions or edge://extensions.`
          };
        }
      }
      const provisioner = new PrivateEgressProvisioner({
        token,
        controlPort: CONTROL_PORT,
        controlToken: getControlToken(),
        mockMode: Boolean(payload.mockMode),
        onProgress: (ev) => {
          sendNativeMessage({ action: 'PROVISION_PROGRESS', ...ev });
        }
      });
      try {
        const result = await provisioner.provisionPrivateEgress(payload);
        return { action: 'PROVISION_PRIVATE_EGRESS_RESPONSE', success: true, result };
      } catch (err) {
        return { action: 'PROVISION_PRIVATE_EGRESS_RESPONSE', success: false, error: err.message };
      }
    }

    case 'DESTROY_PRIVATE_EGRESS': {
      const payload = msg.payload || {};
      const token = payload.token;
      if (!token) {
        return { action: 'DESTROY_PRIVATE_EGRESS_RESPONSE', success: false, error: 'MISSING_API_TOKEN' };
      }
      const provisioner = new PrivateEgressProvisioner({
        token,
        controlPort: CONTROL_PORT,
        controlToken: getControlToken(),
        mockMode: Boolean(payload.mockMode)
      });
      try {
        const result = await provisioner.destroyPrivateEgress(payload);
        return { action: 'DESTROY_PRIVATE_EGRESS_RESPONSE', success: true, result };
      } catch (err) {
        return { action: 'DESTROY_PRIVATE_EGRESS_RESPONSE', success: false, error: err.message };
      }
    }

    case 'GET_EGRESS_TELEMETRY': {
      const payload = msg.payload || {};
      const provisioner = new PrivateEgressProvisioner({
        mockMode: Boolean(payload.mockMode)
      });
      try {
        const statusRes = await checkRelayStatus();
        const activeNode = statusRes.status?.nodes?.find(n => n.id === statusRes.status.selectedEgressId) || statusRes.status?.nodes?.[0];
        if (!activeNode) {
          return { action: 'GET_EGRESS_TELEMETRY_RESPONSE', success: false, error: 'NO_ACTIVE_NODE' };
        }
        const telemetry = await provisioner.fetchNodeTelemetry(activeNode);
        return { action: 'GET_EGRESS_TELEMETRY_RESPONSE', success: true, telemetry };
      } catch (err) {
        return { action: 'GET_EGRESS_TELEMETRY_RESPONSE', success: false, error: err.message };
      }
    }

    default:
      return { error: 'UNKNOWN_ACTION', action };
  }
}

const TEST_SERVER_PORT = 8088;
let spawnedOwnerTestServerPid = null;

function resolveTestServerScript() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'owner-extension-test-site', 'server.js'),
    path.resolve(__dirname, '..', 'owner-extension-test-site', 'server.js'),
    path.resolve(process.cwd(), 'owner-extension-test-site', 'server.js')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function probeOwnerTestServerHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port: TEST_SERVER_PORT,
      path: '/__xpider_health',
      headers: { 'Cache-Control': 'no-cache' }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.service === 'XPIDER_OWNER_TEST_SERVER' && parsed.ok === true) {
            resolve({ ok: true, running: true, health: parsed, port: TEST_SERVER_PORT });
          } else {
            resolve({ ok: false, running: true, error: 'OWNER_TEST_PORT_COLLISION', details: parsed });
          }
        } catch (_) {
          resolve({ ok: false, running: true, error: 'OWNER_TEST_PORT_COLLISION', raw: body });
        }
      });
    });
    req.on('error', () => {
      resolve({ ok: false, running: false, error: 'NOT_RUNNING' });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, running: false, error: 'TIMEOUT' });
    });
  });
}

async function startOwnerTestServer() {
  // 1. Check if already running
  const currentHealth = await probeOwnerTestServerHealth(1000);
  if (currentHealth.ok) {
    return {
      success: true,
      message: 'ALREADY_RUNNING',
      serverReady: true,
      port: TEST_SERVER_PORT,
      fixtureSet: 'OWNER_7_V1',
      health: currentHealth.health
    };
  }
  if (currentHealth.running && currentHealth.error === 'OWNER_TEST_PORT_COLLISION') {
    return {
      success: false,
      error: 'OWNER_TEST_PORT_COLLISION',
      message: 'Port 8088 is occupied by a foreign process.'
    };
  }

  // 2. Resolve server.js
  const scriptPath = resolveTestServerScript();
  if (!scriptPath) {
    return {
      success: false,
      error: 'SERVER_SCRIPT_NOT_FOUND',
      message: 'owner-extension-test-site/server.js could not be found.'
    };
  }

  // 3. Spawn detached server (prefer VBS runner on Windows to break out of Chromium Job Object)
  const vbsPath = path.join(path.dirname(scriptPath), 'start_test_server_silent.vbs');
  if (process.platform === 'win32' && fs.existsSync(vbsPath)) {
    try {
      exec(`wscript.exe "${vbsPath}"`, (err) => {
        if (err) console.error('[NATIVE_HOST_TEST_SERVER_VBS_ERR]', err);
      });
    } catch (_) {}
  } else {
    try {
      const child = spawn(process.execPath, [scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, PORT: String(TEST_SERVER_PORT) }
      });
      child.unref();
      spawnedOwnerTestServerPid = child.pid;
    } catch (err) {
      return { success: false, error: 'SPAWN_ERROR', details: err.message };
    }
  }

  // 4. Poll /__xpider_health until verified
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    const h = await probeOwnerTestServerHealth(800);
    if (h.ok) {
      if (h.health && h.health.pid) {
        spawnedOwnerTestServerPid = h.health.pid;
      }
      return {
        success: true,
        serverReady: true,
        pid: spawnedOwnerTestServerPid,
        port: TEST_SERVER_PORT,
        fixtureSet: 'OWNER_7_V1',
        health: h.health
      };
    }
    if (h.running && h.error === 'OWNER_TEST_PORT_COLLISION') {
      return {
        success: false,
        error: 'OWNER_TEST_PORT_COLLISION',
        message: 'Port 8088 collided with foreign service.'
      };
    }
  }

  return {
    success: false,
    error: 'START_TIMEOUT',
    message: 'Test server failed to respond on 127.0.0.1:8088 within 3s.'
  };
}

async function stopOwnerTestServer() {
  const currentHealth = await probeOwnerTestServerHealth(800);
  if (!currentHealth.running) {
    spawnedOwnerTestServerPid = null;
    return { success: true, message: 'ALREADY_STOPPED' };
  }
  // Only stop if verified as XPIDER_OWNER_TEST_SERVER
  if (!currentHealth.ok) {
    return { success: false, error: 'REFUSED_FOREIGN_KILL', message: 'Will not kill foreign process on port 8088.' };
  }

  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_SERVER_PORT,
      path: '/__xpider_shutdown',
      method: 'POST'
    }, (res) => {
      spawnedOwnerTestServerPid = null;
      resolve({ success: true, message: 'SHUTDOWN_REQUESTED' });
    });
    req.on('error', () => {
      if (spawnedOwnerTestServerPid) {
        try { process.kill(spawnedOwnerTestServerPid); } catch (_) {}
      }
      spawnedOwnerTestServerPid = null;
      resolve({ success: true, message: 'STOPPED' });
    });
    req.setTimeout(1500, () => {
      req.destroy();
      if (spawnedOwnerTestServerPid) {
        try { process.kill(spawnedOwnerTestServerPid); } catch (_) {}
      }
      spawnedOwnerTestServerPid = null;
      resolve({ success: true, message: 'TERMINATED' });
    });
    req.end();
  });
}

// Native messaging stdio frame parser
let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', async (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);

  while (inputBuffer.length >= 4) {
    const msgLen = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + msgLen) {
      break;
    }

    const msgBytes = inputBuffer.subarray(4, 4 + msgLen);
    inputBuffer = inputBuffer.subarray(4 + msgLen);

    try {
      const msg = JSON.parse(msgBytes.toString('utf8'));
      const response = await handleMessage(msg);
      sendNativeMessage(response);
    } catch (err) {
      sendNativeMessage({ error: 'PARSE_ERROR', details: err.message });
    }
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleMessage,
    COMPANION_BUILD_ID,
    isCompatibleExtensionBuild,
    getControlToken
  };
}
