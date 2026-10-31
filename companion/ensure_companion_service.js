/**
 * ensure_companion_service.js
 * 
 * [Issue #6 Comment #6244711545 Defect Q2 Hardening]
 * Authoritatively verifies, upgrades, and starts the Privacy Relay Companion.
 * 
 * Flow:
 * 1. Checks http://127.0.0.1:18989/health
 * 2. If running, checks companionBuildId and apiCapabilities (must include 'verify-plan').
 * 3. If stale or missing capabilities, performs owned graceful shutdown via /shutdown (or /stop).
 * 4. Ensures ports 18988 and 18989 are released.
 * 5. Launches bundled companion.
 * 6. Polls and authoritatively verifies /health returns 200 and expected capabilities.
 * 7. Exits 0 on success, strictly exits 1 on failure.
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');

const EXPECTED_BUILD_ID = 'V7.0.0-RC13-20261031-SPEED-SLIDER-AND-PAUSE-RESUME-FIX';
const REQUIRED_CAPABILITIES = ['verify-plan', 'provision-egress', 'provision-progress', 'recovery-status'];

const COMPANION_DIR = __dirname;
const ROOT_DIR = path.resolve(COMPANION_DIR, '..');
const RELAY_SCRIPT = path.join(COMPANION_DIR, 'privacy-relay-service.js');
const TOKEN_FILE = path.join(COMPANION_DIR, '.control_token');
const VBS_SCRIPT = path.join(COMPANION_DIR, 'start_relay_silent.vbs');

const EXPOSED_RC3_6_TOKEN_SHA256 = '597a70b99c11c7f4d13a075204ac240bb08a7a1d6c08c78268328e0bb59daeda';

const CONTROL_PORT = 18989;
const PROXY_PORT = 18988;

function getControlToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
        console.log('[SECURITY_ROTATION] ensure_companion_service detected exposed RC3.6 token; removing stale token file.');
        try { fs.unlinkSync(TOKEN_FILE); } catch (_) {}
        return null;
      }
      return token;
    }
  } catch (_) {}
  return null;
}

function probeHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CONTROL_PORT}/health`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, data: json });
        } catch (_) {
          resolve({ ok: false, statusCode: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.code }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

function probeAuthenticatedStatus(token, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!token) return resolve({ ok: false, statusCode: 401, error: 'NO_TOKEN' });
    const req = http.get({
      hostname: '127.0.0.1',
      port: CONTROL_PORT,
      path: '/status',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, data: json });
        } catch (_) {
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.code }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.on('connect', () => {
      s.destroy();
      resolve(true); // Port is in use / connected
    });
    s.on('error', () => resolve(false));
    s.on('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.connect(port, '127.0.0.1');
  });
}

async function requestShutdown(token) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: CONTROL_PORT,
      path: '/shutdown',
      method: 'POST',
      headers
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ ok: res.statusCode === 200 }));
    });
    req.on('error', () => {
      // Fallback try /stop if older companion
      const req2 = http.request({
        hostname: '127.0.0.1',
        port: CONTROL_PORT,
        path: '/stop',
        method: 'POST',
        headers
      }, (res2) => resolve({ ok: res2.statusCode === 200 }));
      req2.on('error', () => resolve({ ok: false }));
      req2.end();
    });
    req.end();
  });
}

function launchCompanionProcess() {
  const bundledNode = path.join(ROOT_DIR, 'runtime', 'node', 'node.exe');
  const nodeBinary = fs.existsSync(bundledNode) ? bundledNode : process.execPath;

  const child = spawn(nodeBinary, [RELAY_SCRIPT], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env
  });
  child.unref();
}

function findListeningPid(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && !isNaN(pid)) return pid;
        }
      }
    }
  } catch (_) {}
  return null;
}

function verifyPidIsNode(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /nh`, { encoding: 'utf8' });
      return out.toLowerCase().includes('node.exe');
    }
  } catch (_) {}
  return false;
}

async function terminateStaleCompanion(reportedPid) {
  const token = getControlToken();
  const shutRes = await requestShutdown(token);

  if (shutRes && shutRes.ok) {
    // Poll for up to 2s for graceful shutdown
    for (let i = 0; i < 8; i++) {
      const p1 = await isPortOpen(CONTROL_PORT);
      const p2 = await isPortOpen(PROXY_PORT);
      if (!p1 && !p2) return true;
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // If still open or token was rejected, iteratively discover and kill listening PIDs on both ports
  for (let attempt = 0; attempt < 5; attempt++) {
    const pid1 = findListeningPid(CONTROL_PORT);
    const pid2 = findListeningPid(PROXY_PORT);
    const targetPids = new Set([reportedPid, pid1, pid2].filter(Boolean));

    for (const pid of targetPids) {
      if (verifyPidIsNode(pid)) {
        console.log(`   [UPGRADE] Terminating stale XPIDER node process (PID ${pid})...`);
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          } else {
            process.kill(pid, 'SIGKILL');
          }
        } catch (_) {}
      }
    }

    await new Promise(r => setTimeout(r, 300));
    const p1After = await isPortOpen(CONTROL_PORT);
    const p2After = await isPortOpen(PROXY_PORT);
    if (!p1After && !p2After) return true;
  }

  const p1Final = await isPortOpen(CONTROL_PORT);
  const p2Final = await isPortOpen(PROXY_PORT);
  return !p1Final && !p2Final;
}

function isWatchdogActiveAndFresh() {
  try {
    const watchdogLock = path.join(COMPANION_DIR, '.watchdog.lock');
    if (!fs.existsSync(watchdogLock)) return false;
    const raw = fs.readFileSync(watchdogLock, 'utf8').trim();
    if (!raw) return false;
    let lockData = null;
    try { lockData = JSON.parse(raw); } catch (_) {}
    const pid = lockData && lockData.pid ? lockData.pid : parseInt(raw, 10);
    if (!pid) return false;
    try { process.kill(pid, 0); } catch (_) { return false; }
    if (lockData && lockData.heartbeat) {
      if (Date.now() - lockData.heartbeat > 15000) return false;
    }
    if (lockData && lockData.companionDir) {
      if (path.resolve(lockData.companionDir) !== path.resolve(COMPANION_DIR)) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function ensureWatchdogSupervisor() {
  try {
    if (!isWatchdogActiveAndFresh()) {
      const watchdogLock = path.join(COMPANION_DIR, '.watchdog.lock');
      try {
        if (fs.existsSync(watchdogLock)) {
          const raw = fs.readFileSync(watchdogLock, 'utf8').trim();
          let pid = null;
          try { pid = JSON.parse(raw).pid; } catch (_) { pid = parseInt(raw, 10); }
          if (pid) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
          fs.unlinkSync(watchdogLock);
        }
      } catch (_) {}

      const watchdogScript = path.join(COMPANION_DIR, 'companion-watchdog.js');
      const bundledNode = path.join(ROOT_DIR, 'runtime', 'node', 'node.exe');
      const nodeBin = fs.existsSync(bundledNode) ? bundledNode : (fs.existsSync(process.execPath) ? process.execPath : 'node');
      const child = spawn(nodeBin, [watchdogScript], {
        cwd: ROOT_DIR,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
      console.log('   [OK] Companion Watchdog supervisor active in background.');
    } else {
      console.log('   [OK] Companion Watchdog supervisor verified active and fresh.');
    }
  } catch (e) {
    console.warn('   [WATCHDOG_NOTICE] Watchdog verification notice:', e.message);
  }
}

async function main() {
  if (process.env.XPIDER_ISOLATED_TEST === '1' || (process.argv && process.argv.includes('--dry-run'))) {
    console.log('   [ISOLATED_TEST] Dry run mode active: skipping Companion service and Watchdog start.');
    process.exit(0);
  }
  console.log('   [COMPANION_CHECK] Checking Privacy Relay Companion status on 127.0.0.1:18989...');

  // [Issue #6 Comment #6261136757 DD3] Migrate active egress state from previous installation if needed
  try {
    const { migrateActiveEgressState } = require('./state-migrator');
    const migResult = migrateActiveEgressState(COMPANION_DIR);
    if (migResult && migResult.migrated) {
      console.log(`   [STATE_MIGRATION] Migrated active private egress state from: ${migResult.sourceDir}`);
      console.log(`                     Nodes: ${migResult.nodesMigrated}, Public IP: ${migResult.publicIp}, Tx: ${migResult.transactionTag}`);
    }
  } catch (migErr) {
    console.warn(`   [STATE_MIGRATION] State migration notice: ${migErr.message}`);
  }

  const health = await probeHealth(1500);

  if (health.ok && health.data && health.data.service === 'XPIDER Privacy Relay') {
    const d = health.data;
    const caps = Array.isArray(d.apiCapabilities) ? d.apiCapabilities : [];
    const hasRequiredCaps = REQUIRED_CAPABILITIES.every(c => caps.includes(c));
    const isCurrentBuild = (d.companionBuildId === EXPECTED_BUILD_ID);
    const isCurrentRoot = !d.runtimeRoot || (path.resolve(d.runtimeRoot) === path.resolve(ROOT_DIR));
    const currentToken = getControlToken();
    const authStatus = await probeAuthenticatedStatus(currentToken, 1500);

    if (hasRequiredCaps && isCurrentBuild && isCurrentRoot && currentToken && authStatus.ok) {
      console.log(`   [OK] Privacy Relay Companion is ALREADY RUNNING and verified current and authenticated (Build: ${d.companionBuildId}, PID: ${d.pid || 'unknown'}).`);
      if (d.recovery && d.recovery.recoveryRequired) {
        console.warn(`   [RECOVERY_ALERT] Incomplete private-egress transaction found in journal (${d.recovery.transactionTag}, stage: ${d.recovery.stage}). Cleanup/recovery required.`);
      }
      ensureWatchdogSupervisor();
      process.exit(0);
    }

    if (isCurrentBuild && isCurrentRoot && currentToken && authStatus.statusCode === 401) {
      console.log(`   [TOKEN_DESYNC] Running companion (PID ${d.pid || 'unknown'}) rejected package .control_token (HTTP 401).`);
      console.log(`   [TOKEN_DESYNC] Restarting local companion to synchronize in-memory control token with package state...`);
    } else {
      console.log(`   [UPGRADE] Stale, divergent or unauthenticated Companion detected on port 18989:`);
      console.log(`             Current: ${d.companionBuildId || 'legacy-unversioned'} (Expected: ${EXPECTED_BUILD_ID})`);
      console.log(`             Root Parity: ${isCurrentRoot ? 'CANONICAL' : `DIVERGENT (${d.runtimeRoot || 'unknown'})`}`);
      console.log(`             Capabilities: [${caps.join(', ') || 'none'}] (Required: [${REQUIRED_CAPABILITIES.join(', ')}])`);
      console.log(`             Local Control Token: ${currentToken ? (authStatus.ok ? 'AUTHENTICATED' : `REJECTED (${authStatus.statusCode || authStatus.error})`) : 'MISSING (Unauthenticated)'}`);
      console.log(`   [UPGRADE] Upgrading to canonical current build...`);
    }

    const released = await terminateStaleCompanion(d.pid);
    if (!released) {
      console.error(`   [FATAL] Unable to release port ${CONTROL_PORT} / ${PROXY_PORT} from stale process.`);
      process.exit(1);
    }
  }

  // Ensure ports are free before launch
  const port1Busy = await isPortOpen(CONTROL_PORT);
  const port2Busy = await isPortOpen(PROXY_PORT);
  if (port1Busy || port2Busy) {
    const conflictingPid = findListeningPid(CONTROL_PORT) || findListeningPid(PROXY_PORT);
    console.error(`   [FATAL] Ports ${CONTROL_PORT} / ${PROXY_PORT} in use by PID ${conflictingPid || 'unknown'}. Cannot bind.`);
    process.exit(1);
  }

  console.log('   [COMPANION_START] Launching bundled Privacy Relay Companion...');
  launchCompanionProcess();

  // Authoritatively poll health and verify capabilities and authenticated token parity
  const maxAttempts = 30; // 30 * 300ms = 9s
  let verified = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 300));
    const check = await probeHealth(800);
    if (check.ok && check.data && check.data.service === 'XPIDER Privacy Relay') {
      const d = check.data;
      const caps = Array.isArray(d.apiCapabilities) ? d.apiCapabilities : [];
      const hasCaps = REQUIRED_CAPABILITIES.every(c => caps.includes(c));
      const isCurrent = (d.companionBuildId === EXPECTED_BUILD_ID);
      const isCurrentRoot = !d.runtimeRoot || (path.resolve(d.runtimeRoot) === path.resolve(ROOT_DIR));
      const token = getControlToken();
      const authStatus = token ? await probeAuthenticatedStatus(token, 800) : { ok: false };

      if (hasCaps && isCurrent && isCurrentRoot && token && authStatus.ok) {
        console.log(`   [OK] Privacy Relay Companion successfully bound ports and verified healthy (PID: ${d.pid || 'unknown'}, Build: ${d.companionBuildId || EXPECTED_BUILD_ID}).`);
        console.log(`   [OK] Verified API Capabilities: [${caps.join(', ')}]`);
        console.log(`   [OK] Local control token verified (${token.length} chars, authenticated /status HTTP 200).`);
        if (d.recovery && d.recovery.recoveryRequired) {
          console.warn(`   [RECOVERY_ALERT] Incomplete private-egress transaction found in journal (${d.recovery.transactionTag}, stage: ${d.recovery.stage}). Cleanup/recovery required.`);
        }
        verified = true;
        break;
      }
    }
  }

  if (!verified) {
    console.error('   [FATAL] Privacy Relay Companion failed to start and verify capabilities and authenticated status within 9 seconds.');
    process.exit(1);
  }

  // [RC3.18 / Post-Rotation Hardening] Ensure background supervisor watchdog is active from canonical root
  ensureWatchdogSupervisor();

  process.exit(0);
}

main().catch(err => {
  console.error('   [FATAL] Error in ensure_companion_service:', err.message);
  process.exit(1);
});
