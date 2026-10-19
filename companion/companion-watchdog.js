/**
 * companion-watchdog.js
 * 
 * Background supervisor watchdog for XPIDER Companion Privacy Relay (Issue #6 RC3.18).
 * Continuously monitors Companion process and port 18988/18989 health.
 * If Companion terminates or becomes unresponsive, automatically self-heals by invoking
 * ensure_companion_service.js to restore proxy listener and authenticated control plane.
 */

const http = require('http');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const COMPANION_DIR = __dirname;
const ROOT_DIR = path.resolve(COMPANION_DIR, '..');
const LOG_FILE = path.join(COMPANION_DIR, 'watchdog.log');
const LOCK_FILE = path.join(COMPANION_DIR, '.watchdog.lock');
const ENSURE_SCRIPT = path.join(COMPANION_DIR, 'ensure_companion_service.js');
const HEALTH_URL = 'http://127.0.0.1:18989/health';
const PROBE_INTERVAL_MS = 2500;
const FAILURE_THRESHOLD = 2;

function log(msg) {
  const line = `[WATCHDOG][${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (_) {}
  console.log(line.trim());
}

function probeHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data: json });
        } catch (_) {
          resolve({ ok: res.statusCode === 200, status: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.code || err.message });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const prevPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (prevPid && prevPid !== process.pid) {
        try {
          // Check if previous PID is alive
          process.kill(prevPid, 0);
          log(`Existing watchdog PID ${prevPid} is already active. Exiting duplicate instance.`);
          process.exit(0);
        } catch (_) {
          // Stale lock
          log(`Cleaning up stale watchdog lock (PID ${prevPid}).`);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch (e) {
    log(`Failed to acquire lock: ${e.message}`);
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (_) {}
}

async function triggerSelfHeal(reason) {
  log(`[SELF_HEAL_TRIGGERED] Reason: ${reason}. Launching ensure_companion_service.js...`);
  try {
    // Find node executable
    const bundledNode = path.join(ROOT_DIR, 'runtime', 'node', 'node.exe');
    const nodeBin = fs.existsSync(bundledNode) ? bundledNode : process.execPath;

    // Run ensure_companion_service.js synchronously
    const out = execSync(`"${nodeBin}" "${ENSURE_SCRIPT}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 30000
    });
    log(`[SELF_HEAL_COMPLETED] ensure_companion_service output:\n${out.trim()}`);
    return true;
  } catch (err) {
    log(`[SELF_HEAL_ERROR] ${err.message}`);
    return false;
  }
}

async function runWatchdogLoop() {
  acquireLock();
  log(`Watchdog supervisor started (PID ${process.pid}). Monitoring port 18989 every ${PROBE_INTERVAL_MS}ms...`);

  process.on('SIGINT', () => {
    log('Watchdog received SIGINT. Exiting...');
    releaseLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log('Watchdog received SIGTERM. Exiting...');
    releaseLock();
    process.exit(0);
  });

  let consecutiveFailures = 0;
  let isHealInProgress = false;

  while (true) {
    await new Promise(r => setTimeout(r, PROBE_INTERVAL_MS));

    if (isHealInProgress) continue;

    const probe = await probeHealth();
    if (probe.ok) {
      if (consecutiveFailures > 0) {
        log(`Companion service returned to HEALTHY (pid=${probe.data?.pid}, build=${probe.data?.companionBuildId}). Failures reset.`);
      }
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      log(`Companion health probe failed (${consecutiveFailures}/${FAILURE_THRESHOLD}): ${probe.error || `HTTP_${probe.status}`}`);

      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        isHealInProgress = true;
        await triggerSelfHeal(`CONSECUTIVE_PROBE_FAILURES (${consecutiveFailures}): ${probe.error || `HTTP_${probe.status}`}`);
        consecutiveFailures = 0;
        isHealInProgress = false;
      }
    }
  }
}

if (require.main === module) {
  runWatchdogLoop().catch((e) => {
    log(`Fatal watchdog exception: ${e && e.stack ? e.stack : e}`);
    releaseLock();
    process.exit(1);
  });
}

module.exports = {
  probeHealth,
  triggerSelfHeal,
  runWatchdogLoop
};
