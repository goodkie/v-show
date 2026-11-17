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
const { spawn } = require('node:child_process');
const { getSidecarPaths } = require('./sidecar-paths');
const { verifyWindowsDacl } = require('./email-test-sidecar-set-key');
const { SIDECAR_BUILD_ID } = require('./email-test-sidecar');

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
  if (!msg || msg.action !== 'GET_SIDECAR_TOKEN') return { ensured: false };
  const port = Number(msg.port) || 18990;
  const h = await probeLocalHealth(port);
  if (h.alive && h.json && h.json.service === 'XPIDER Email Test Sidecar' && h.json.companionBuildId === SIDECAR_BUILD_ID) {
    return { ensured: true, alreadyRunning: true, companionBuildId: h.json.companionBuildId };
  }
  if (h.alive && h.json && h.json.service === 'XPIDER Email Test Sidecar' && Number.isInteger(Number(h.json.pid))) {
    try { process.kill(Number(h.json.pid), 'SIGTERM'); } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  } else if (h.alive) {
    return { ensured: false, reason: 'PORT_IN_USE_BY_OTHER_SERVICE' };
  }
  const sidecarScript = options.sidecarScript || path.join(__dirname, 'email-test-sidecar.js');
  const child = spawn(process.execPath, [sidecarScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, XPIDER_EMAIL_SIDECAR_PORT: String(port) }
  });
  child.unref();
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 120));
    const check = await probeLocalHealth(port);
    if (check.alive && check.json && check.json.companionBuildId === SIDECAR_BUILD_ID) {
      return { ensured: true, autoStarted: true, companionBuildId: check.json.companionBuildId };
    }
  }
  return { ensured: false, reason: 'START_TIMEOUT' };
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
  if (msg && msg.action === 'GET_SIDECAR_TOKEN' && msg.ensureRunning !== false) {
    try { await ensureLocalSidecarRunning(msg); } catch (_) {}
  }
  const resp = handleNativeRequest(msg);
  process.stdout.write(encodeNativeMessage(resp));
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
