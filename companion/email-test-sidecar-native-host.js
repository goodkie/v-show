'use strict';
/**
 * Isolated Windows Native Messaging Host for XPIDER Email Test Sidecar (`com.xpider.email_sidecar`).
 * - Strictly restricted to extension origin chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj/ via manifest.
 * - Verifies Windows NTFS DACL on .email_sidecar_token before returning token over stdin/stdout pipe.
 * - Zero secrets written to disk/stderr/logs; never touches legacy 18988/18989 hosts.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { getSidecarPaths } = require('./sidecar-paths');
const { verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const { SIDECAR_BUILD_ID } = require('./email-test-sidecar');

function launchDetachedSidecarProcess(nodeExe, sidecarScript, port) {
  const safePort = Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 18990;
  // On Windows, Chrome wraps Native Messaging hosts in a KILL_ON_JOB_CLOSE Job Object.
  // Launching via WMI Win32_Process.Create places the Sidecar under WmiPrvSE.exe (outside Chrome's Job Object),
  // hidden (ShowWindow=0), with zero admin privileges, so it survives native host exit and browser restarts.
  if (process.platform === 'win32' && !process.env.XPIDER_DISABLE_WMI_LAUNCH) {
    try {
      const psEsc = (s) => String(s).replace(/'/g, "''");
      const cmdLine = `"${nodeExe}" "${sidecarScript}" --port ${safePort} --skip-native-host-reg`;
      const psScript = [
        "$ErrorActionPreference = 'Stop'",
        "$startup = New-CimInstance -ClassName Win32_ProcessStartup -Property @{ ShowWindow = [uint16]0 } -ClientOnly",
        `$res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${psEsc(cmdLine)}'; ProcessStartupInformation = $startup }`,
        'Write-Output ("WMI_RC=" + $res.ReturnValue + ";PID=" + $res.ProcessId)'
      ].join('; ');
      const ps = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript], {
        timeout: 4500,
        windowsHide: true,
        encoding: 'utf8'
      });
      if (ps.status === 0 && /WMI_RC=0;PID=(\d+)/.test(String(ps.stdout || ''))) {
        const m = String(ps.stdout).match(/WMI_RC=0;PID=(\d+)/);
        return { launched: true, mode: 'wmi_detached', pid: m ? Number(m[1]) : null };
      }
    } catch (_) {}
  }
  const child = spawn(nodeExe, [sidecarScript, '--port', String(safePort), '--skip-native-host-reg'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      XPIDER_EMAIL_SIDECAR_PORT: String(safePort),
      XPIDER_SKIP_NATIVE_HOST_REG: '1'
    }
  });
  child.unref();
  return { launched: true, mode: 'spawn_detached', pid: child.pid || null };
}

function probeLocalHealth(port) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: '/health', timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve({ alive: res.statusCode === 200, json: JSON.parse(body) }); }
        catch (_) { resolve({ alive: false, json: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ alive: false, json: null }); });
    req.on('error', () => resolve({ alive: false, json: null }));
    req.end();
  });
}

async function ensureLocalSidecarRunning(msg = {}, options = {}) {
  if (!msg || (msg.action !== 'GET_SIDECAR_TOKEN' && msg.action !== 'ENSURE_SIDECAR_RUNNING')) return { ensured: false };
  const rawPort = Number(msg.port);
  const port = (Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535) ? rawPort : 18990;
  const h = await probeLocalHealth(port);
  if (h.alive && h.json && h.json.service === 'XPIDER Email Test Sidecar' && h.json.companionBuildId === SIDECAR_BUILD_ID) {
    return { ensured: true, alreadyRunning: true, pid: h.json.pid || null, companionBuildId: h.json.companionBuildId };
  }
  if (h.alive && h.json && h.json.service === 'XPIDER Email Test Sidecar' && Number.isInteger(Number(h.json.pid))) {
    try { process.kill(Number(h.json.pid), 'SIGTERM'); } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  } else if (h.alive) {
    return { ensured: false, reason: 'PORT_IN_USE_BY_OTHER_SERVICE' };
  }
  const sidecarScript = options.sidecarScript || path.join(__dirname, 'email-test-sidecar-cli.js');
  if (!fs.existsSync(sidecarScript)) {
    return { ensured: false, reason: 'SIDECAR_CLI_NOT_FOUND' };
  }
  const launch = launchDetachedSidecarProcess(process.execPath, sidecarScript, port);
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    const check = await probeLocalHealth(port);
    if (check.alive && check.json && check.json.companionBuildId === SIDECAR_BUILD_ID) {
      return {
        ensured: true,
        autoStarted: true,
        launchMode: launch.mode,
        pid: check.json.pid || launch.pid || null,
        companionBuildId: check.json.companionBuildId
      };
    }
  }
  return { ensured: false, reason: 'START_TIMEOUT', launchMode: launch.mode };
}

function readNativeMessage(stdin = process.stdin) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let expectedLen = null;

    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (expectedLen === null && buf.length >= 4) {
        expectedLen = buf.readUInt32LE(0);
        if (expectedLen === 0 || expectedLen > 1048576) {
          cleanup();
          return reject(new Error(`INVALID_NATIVE_MESSAGE_LENGTH:${expectedLen}`));
        }
      }
      if (expectedLen !== null && buf.length >= 4 + expectedLen) {
        const body = buf.subarray(4, 4 + expectedLen).toString('utf8');
        cleanup();
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      }
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    const onErr = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onErr);
    };
    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onErr);
    stdin.resume();
  });
}

function encodeNativeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

function handleNativeRequest(msg, options = {}) {
  if (!msg || typeof msg !== 'object') {
    return { ok: false, error: 'INVALID_REQUEST' };
  }
  if (msg.action === 'PING') {
    return { ok: true, service: 'com.xpider.email_sidecar' };
  }
  if (msg.action === 'ENSURE_SIDECAR_RUNNING') {
    return { ok: true, service: 'com.xpider.email_sidecar', ensured: true };
  }
  if (msg.action !== 'GET_SIDECAR_TOKEN') {
    return { ok: false, error: 'UNSUPPORTED_ACTION' };
  }
  try {
    const paths = getSidecarPaths(options.stateDir, { trustedTestMode: Boolean(options.trustedTestMode) });
    if (!fs.existsSync(paths.tokenFile)) {
      return { ok: false, error: 'TOKEN_MISSING', message: 'Sidecar token file not found; start sidecar first.' };
    }
    const platform = options.platform || process.platform;
    const username = options.username || process.env.USERNAME;
    if (platform === 'win32' && username) {
      try {
        verifyWindowsDacl(paths.tokenFile, username);
      } catch (aclErr) {
        return { ok: false, error: 'TOKEN_ACL_INVALID', message: aclErr.message };
      }
    }
    const token = fs.readFileSync(paths.tokenFile, 'utf8').trim();
    if (token.length < 16) {
      return { ok: false, error: 'TOKEN_INVALID', message: 'Sidecar token file is shorter than 16 chars.' };
    }
    return { ok: true, token };
  } catch (err) {
    return { ok: false, error: err.code || 'NATIVE_HOST_ERROR', message: err.message };
  }
}

async function main() {
  const msg = await readNativeMessage(process.stdin);
  let ensureInfo = null;
  if (msg && (msg.action === 'GET_SIDECAR_TOKEN' || msg.action === 'ENSURE_SIDECAR_RUNNING') && msg.ensureRunning !== false) {
    try { ensureInfo = await ensureLocalSidecarRunning(msg); } catch (e) { ensureInfo = { ensured: false, reason: e?.message || 'ENSURE_ERR' }; }
  }
  const resp = handleNativeRequest(msg);
  if (ensureInfo && resp && typeof resp === 'object') {
    resp.sidecarEnsure = ensureInfo;
  }
  const outBuf = encodeNativeMessage(resp);
  process.stdout.write(outBuf, () => {
    try { process.stdin.pause(); } catch (_) {}
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(err => {
    try {
      process.stdout.write(encodeNativeMessage({ ok: false, error: 'NATIVE_HOST_FATAL', message: err.message }));
    } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  readNativeMessage,
  encodeNativeMessage,
  handleNativeRequest,
  ensureLocalSidecarRunning
};
