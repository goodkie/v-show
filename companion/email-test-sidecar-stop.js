'use strict';
const fs = require('node:fs');
const http = require('node:http');
const { getSidecarPaths } = require('./sidecar-paths');

function probeHealth(port) {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/health' }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ alive: true, status: res.statusCode, json: JSON.parse(body) }); }
        catch (_) { resolve({ alive: true, status: res.statusCode, json: null }); }
      });
    });
    req.setTimeout(1500, () => { req.destroy(); resolve({ alive: false }); });
    req.on('error', () => resolve({ alive: false }));
    req.end();
  });
}

(async () => {
  const paths = getSidecarPaths();
  if (!fs.existsSync(paths.pidFile)) {
    console.log(`[INFO] No .email_sidecar.pid found at ${paths.pidFile}. Email Test Sidecar is not running.`);
    process.exit(0);
  }

  try {
    const info = JSON.parse(fs.readFileSync(paths.pidFile, 'utf8'));
    const pid = Number(info.pid);
    const port = Number(info.port) || 18990;
    if (!Number.isInteger(pid) || pid <= 0) {
      fs.unlinkSync(paths.pidFile);
      console.log('[WARN] Invalid PID record removed.');
      process.exit(0);
    }

    const h = await probeHealth(port);
    if (h.alive && h.json && (h.json.service !== 'XPIDER Email Test Sidecar' || Number(h.json.pid) !== pid)) {
      console.error(`[REFUSED] Process on 127.0.0.1:${port} (service=${h.json.service || 'unknown'}, pid=${h.json.pid}) does not match pidfile PID ${pid}. Refusing to kill unrelated process.`);
      process.exit(2);
    }
    if (!h.alive) {
      console.log(`[INFO] Sidecar on 127.0.0.1:${port} is not responding; refusing blind kill of PID ${pid} and removing stale pidfile.`);
      if (fs.existsSync(paths.pidFile)) fs.unlinkSync(paths.pidFile);
      process.exit(0);
    }

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[OK] Sent SIGTERM to Email Test Sidecar PID ${pid} (port ${port}). Legacy 18989 untouched.`);
    } catch (e) {
      console.log(`[INFO] Process PID ${pid} already exited (${e.code || e.message}).`);
    }
    if (fs.existsSync(paths.pidFile)) fs.unlinkSync(paths.pidFile);
  } catch (err) {
    console.error('[ERROR] Could not stop sidecar:', err.message);
    process.exit(1);
  }
})();
