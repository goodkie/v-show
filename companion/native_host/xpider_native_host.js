/**
 * xpider_native_host.js
 * 
 * Native Messaging Host for Chrome / Microsoft Edge MV3 (Issue #6 R6.9G.10)
 * Provides Zero-Manual-Launch UX:
 * Allows the XPIDER Extension to probe, start, stop, or recover the Companion Privacy Relay
 * without requiring the Owner to open a terminal or launch manual proxy processes.
 */

const { exec, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const RELAY_DIR = path.resolve(__dirname, '..');
const SILENT_RUNNER_VBS = path.join(RELAY_DIR, 'start_relay_silent.vbs');
const RELAY_SCRIPT = path.join(RELAY_DIR, 'privacy-relay-service.js');
const CONTROL_PORT = 18989;

function sendNativeMessage(msg) {
  const jsonStr = JSON.stringify(msg);
  const len = Buffer.byteLength(jsonStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(len, 0);
  process.stdout.write(header);
  process.stdout.write(jsonStr, 'utf8');
}

async function checkRelayStatus() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CONTROL_PORT}/status`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ running: true, status: parsed });
        } catch (_) {
          resolve({ running: true, raw: body });
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

async function startRelay() {
  const status = await checkRelayStatus();
  if (status.running) {
    return { success: true, message: 'ALREADY_RUNNING', status: status.status };
  }

  return new Promise((resolve) => {
    // Launch silently on Windows via wscript or detached child_process
    if (process.platform === 'win32' && fs.existsSync(SILENT_RUNNER_VBS)) {
      exec(`wscript.exe "${SILENT_RUNNER_VBS}"`, (err) => {
        if (err) {
          // Fallback to detached node spawn
          try {
            const child = spawn(process.execPath, [RELAY_SCRIPT], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true
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
          stdio: 'ignore'
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
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: CONTROL_PORT,
      path: '/stop',
      method: 'POST'
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

    case 'STATUS': {
      const st = await checkRelayStatus();
      return { action: 'STATUS_RESPONSE', ...st };
    }

    case 'START': {
      const res = await startRelay();
      // Wait 600ms and probe again
      await new Promise(r => setTimeout(r, 600));
      const verify = await checkRelayStatus();
      return { action: 'START_RESPONSE', result: res, isRunningNow: verify.running, status: verify.status };
    }

    case 'STOP': {
      const res = await stopRelay();
      return { action: 'STOP_RESPONSE', result: res };
    }

    case 'RESTART': {
      await stopRelay();
      await new Promise(r => setTimeout(r, 1000));
      const startRes = await startRelay();
      await new Promise(r => setTimeout(r, 600));
      const verify = await checkRelayStatus();
      return { action: 'RESTART_RESPONSE', startRes, isRunningNow: verify.running, status: verify.status };
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
      // Need more data
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
