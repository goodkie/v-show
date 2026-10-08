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

const RELAY_DIR = path.resolve(__dirname, '..');
const SILENT_RUNNER_VBS = path.join(RELAY_DIR, 'start_relay_silent.vbs');
const RELAY_SCRIPT = path.join(RELAY_DIR, 'privacy-relay-service.js');
const TOKEN_FILE = path.join(RELAY_DIR, '.control_token');
const CONTROL_PORT = 18989;
const PROXY_PORT = 18988;

function getControlToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
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
  const health = await checkRelayHealth();
  if (health.running) {
    return { success: true, message: 'ALREADY_RUNNING', controlToken: getControlToken() };
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
            resolve({ success: true, message: 'SPAWNED_DETACHED' });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        } else {
          resolve({ success: true, message: 'STARTED_VIA_VBS' });
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
        resolve({ success: true, message: 'SPAWNED_DETACHED' });
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
      return {
        action: 'TOKEN_RESPONSE',
        controlToken: token,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT
      };
    }

    case 'STATUS': {
      const st = await checkRelayStatus();
      const token = getControlToken();
      return {
        action: 'STATUS_RESPONSE',
        ...st,
        controlToken: token,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT
      };
    }

    case 'START': {
      const res = await startRelay();
      // Poll up to 5 times for relay to become responsive
      let verify = await checkRelayHealth();
      for (let i = 0; i < 6 && !verify.running; i++) {
        await new Promise(r => setTimeout(r, 400));
        verify = await checkRelayHealth();
      }
      const token = getControlToken();
      return {
        action: 'START_RESPONSE',
        result: res,
        isRunningNow: verify.running,
        controlToken: token,
        controlPort: CONTROL_PORT,
        proxyPort: PROXY_PORT
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

    default:
      return { error: 'UNKNOWN_ACTION', action };
  }
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
