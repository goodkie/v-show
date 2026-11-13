'use strict';
const fs = require('node:fs');
const path = require('node:path');

const pidFile = path.join(__dirname, '.email_sidecar.pid');
if (!fs.existsSync(pidFile)) {
  console.log('[INFO] No .email_sidecar.pid found. Email Test Sidecar is not running from this folder.');
  process.exit(0);
}

try {
  const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  const pid = Number(info.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.unlinkSync(pidFile);
    console.log('[WARN] Invalid PID record removed.');
    process.exit(0);
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[OK] Sent SIGTERM to Email Test Sidecar PID ${pid} (port ${info.port}). Legacy 18989 untouched.`);
  } catch (e) {
    console.log(`[INFO] Process PID ${pid} already exited (${e.code || e.message}).`);
  }
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
} catch (err) {
  console.error('[ERROR] Could not stop sidecar:', err.message);
  process.exit(1);
}
