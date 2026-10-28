/**
 * ensure_owner_test_server.js
 * 
 * Authoritatively verifies, upgrades, and starts the Local Owner Test Server (127.0.0.1:8088).
 * Ensures the fresh 8-fixture suite (OWNER_8_V1) is active with /ai-required-fields.html returning 200 OK.
 * Gracefully upgrades legacy 7-fixture servers using controlled PID verification.
 * Strictly guards foreign processes from arbitrary termination.
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const TEST_SERVER_PORT = 8088;
const COMPANION_DIR = __dirname;
const ROOT_DIR = path.resolve(COMPANION_DIR, '..');
const SCRIPT_PATH = path.join(ROOT_DIR, 'owner-extension-test-site', 'server.js');
const VBS_PATH = path.join(ROOT_DIR, 'owner-extension-test-site', 'start_test_server_silent.vbs');

function probeHealth(timeoutMs = 1200) {
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
          const json = JSON.parse(body);
          if (json && json.service === 'XPIDER_OWNER_TEST_SERVER' && json.ok === true) {
            const is8Set = (json.fixtureSet === 'OWNER_8_V1' || json.hasAiRequiredFields === true);
            resolve({ ok: true, is8Set, health: json, port: TEST_SERVER_PORT });
          } else {
            resolve({ ok: false, error: 'FOREIGN_OCCUPANT', details: json });
          }
        } catch (_) {
          resolve({ ok: false, error: 'PORT_COLLISION', raw: body });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'NOT_RUNNING' }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

function probeAiFixture(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_SERVER_PORT,
      path: '/ai-required-fields.html',
      method: 'HEAD',
      headers: { 'Cache-Control': 'no-cache' }
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function isPortFree(timeoutMs = 300) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.on('connect', () => {
      s.destroy();
      resolve(false);
    });
    s.on('error', () => {
      s.destroy();
      resolve(true);
    });
    s.on('timeout', () => {
      s.destroy();
      resolve(true);
    });
    s.connect(TEST_SERVER_PORT, '127.0.0.1');
  });
}

function verifyPidCommandLine(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  if (process.platform === 'win32') {
    try {
      const out = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine"`, { timeout: 2000 }).toString();
      const lower = out.toLowerCase();
      return lower.includes('server.js') || lower.includes('owner-extension-test-site');
    } catch (_) {
      try {
        const out = execSync(`wmic process where "ProcessId=${pid}" get CommandLine /format:list`, { timeout: 2000 }).toString();
        const lower = out.toLowerCase();
        return lower.includes('server.js') || lower.includes('owner-extension-test-site');
      } catch (_) {
        return false;
      }
    }
  } else {
    try {
      const out = execSync(`ps -p ${pid} -o args=`, { timeout: 2000 }).toString();
      const lower = out.toLowerCase();
      return lower.includes('server.js') || lower.includes('owner-extension-test-site');
    } catch (_) {
      return false;
    }
  }
}

async function stopServerSafely(serverPid) {
  // 1. Try POST /__xpider_shutdown
  try {
    await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: TEST_SERVER_PORT,
        path: '/__xpider_shutdown',
        method: 'POST'
      }, (res) => resolve(res.statusCode === 200));
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => { req.destroy(); resolve(false); });
      req.end();
    });
  } catch (_) {}

  // Poll port release
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (await isPortFree(200)) return true;
  }

  // 2. Controlled PID verification
  if (serverPid && verifyPidCommandLine(serverPid)) {
    console.log(`[TEST_SERVER_ENSURE] Terminating verified legacy XPIDER test server PID ${serverPid}...`);
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${serverPid}`, { stdio: 'ignore' });
      } else {
        process.kill(serverPid, 'SIGKILL');
      }
    } catch (_) {}

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (await isPortFree(200)) return true;
    }
  }

  return await isPortFree(300);
}

function spawnServer() {
  if (process.platform === 'win32' && fs.existsSync(VBS_PATH)) {
    try {
      execSync(`wscript.exe "${VBS_PATH}"`, { stdio: 'ignore' });
      return;
    } catch (_) {}
  }

  const child = spawn(process.execPath, [SCRIPT_PATH], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(TEST_SERVER_PORT) }
  });
  child.unref();
}

async function main() {
  console.log('[TEST_SERVER_ENSURE] Probing local test server on 127.0.0.1:8088...');
  const health = await probeHealth(1000);
  if (health.ok) {
    if (health.is8Set) {
      const aiOk = await probeAiFixture(800);
      if (aiOk) {
        console.log('   [OK] Owner Test Server is ALREADY RUNNING and verified healthy with 8 fixtures (OWNER_8_V1).');
        process.exit(0);
      }
    }

    console.log('   [INFO] Stale test server detected on 8088 (missing 8 fixtures). Upgrading...');
    const freed = await stopServerSafely(health.health ? health.health.pid : null);
    if (!freed) {
      console.error('   [ERROR] Could not free port 8088 from stale test server.');
      process.exit(1);
    }
  } else if (health.error === 'FOREIGN_OCCUPANT' || health.error === 'PORT_COLLISION') {
    console.error('   [ERROR] Port 8088 is occupied by a foreign process. Refusing to terminate foreign process.');
    process.exit(1);
  }

  console.log('   [INFO] Starting fresh 8-fixture Owner Test Server...');
  spawnServer();

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    const h = await probeHealth(800);
    if (h.ok && h.is8Set) {
      const aiOk = await probeAiFixture(800);
      if (aiOk) {
        console.log(`   [OK] Owner Test Server started and verified healthy on port 8088 (PID: ${h.health.pid}, 8 fixtures, AI fixture 200 OK).`);
        process.exit(0);
      }
    }
  }

  console.error('   [ERROR] Test server failed to respond with verified 8-fixture suite within 5s.');
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[TEST_SERVER_ENSURE_EXCEPTION]', err);
    process.exit(1);
  });
}

module.exports = { probeHealth, probeAiFixture, stopServerSafely, verifyPidCommandLine };
