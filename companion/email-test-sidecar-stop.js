'use strict';
const fs = require('node:fs');
const { getSidecarPaths } = require('./sidecar-paths');

const paths = getSidecarPaths();
if (!fs.existsSync(paths.pidFile)) {
  console.log(`[INFO] No .email_sidecar.pid found at ${paths.pidFile}. Email Test Sidecar is not running.`);
  process.exit(0);
}

try {
  const info = JSON.parse(fs.readFileSync(paths.pidFile, 'utf8'));
  const pid = Number(info.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.unlinkSync(paths.pidFile);
    console.log('[WARN] Invalid PID record removed.');
    process.exit(0);
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[OK] Sent SIGTERM to Email Test Sidecar PID ${pid} (port ${info.port}). Legacy 18989 untouched.`);
  } catch (e) {
    console.log(`[INFO] Process PID ${pid} already exited (${e.code || e.message}).`);
  }
  if (fs.existsSync(paths.pidFile)) fs.unlinkSync(paths.pidFile);
} catch (err) {
  console.error('[ERROR] Could not stop sidecar:', err.message);
  process.exit(1);
}
