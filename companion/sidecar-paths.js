'use strict';
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function assertSafeStateLocation(stateDir, options = {}) {
  const resolved = path.resolve(stateDir);
  if (/^\\\\/.test(resolved) || /^\/\//.test(resolved)) {
    const err = new Error(`UNSAFE_STATE_FILESYSTEM_REJECTED: UNC network path not permitted (${resolved})`);
    err.code = 'UNSAFE_STATE_FILESYSTEM_REJECTED';
    throw err;
  }
  const platform = options.platform || process.platform;
  if (platform === 'win32') {
    const driveMatch = resolved.match(/^([A-Za-z]):[\\/]/);
    if (!driveMatch) {
      const err = new Error(`UNSAFE_STATE_FILESYSTEM_REJECTED: Non-local Windows path (${resolved})`);
      err.code = 'UNSAFE_STATE_FILESYSTEM_REJECTED';
      throw err;
    }
    const driveLetter = driveMatch[1].toUpperCase();
    const execSyncFn = options.execSyncFn || execFileSync;
    try {
      const fmt = String(execSyncFn('powershell', [
        '-NoProfile', '-Command', `[System.IO.DriveInfo]::new('${driveLetter}').DriveFormat`
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim().toUpperCase();
      if (fmt && fmt !== 'NTFS') {
        const err = new Error(`UNSAFE_STATE_FILESYSTEM_REJECTED: Drive ${driveLetter}: filesystem is ${fmt}; NTFS required`);
        err.code = 'UNSAFE_STATE_FILESYSTEM_REJECTED';
        throw err;
      }
    } catch (e) {
      if (e && e.code === 'UNSAFE_STATE_FILESYSTEM_REJECTED') throw e;
      const err = new Error(`UNSAFE_STATE_FILESYSTEM_REJECTED: Unable to verify NTFS filesystem on ${driveLetter}: (${e.message})`);
      err.code = 'UNSAFE_STATE_FILESYSTEM_REJECTED';
      throw err;
    }
  }
  return resolved;
}

function getSidecarStateDir(overrideDir, options = {}) {
  const trustedTestMode = Boolean(options && options.trustedTestMode === true);
  if (overrideDir && typeof overrideDir === 'string') {
    if (!trustedTestMode) {
      const err = new Error('PACKAGED_MODE_TEST_INJECTION_REJECTED: stateDir override requires trustedTestMode');
      err.code = 'PACKAGED_MODE_TEST_INJECTION_REJECTED';
      throw err;
    }
    return path.resolve(overrideDir);
  }
  if (process.env.XPIDER_SIDECAR_STATE_DIR && process.env.XPIDER_SIDECAR_STATE_DIR.trim()) {
    if (!trustedTestMode) {
      const err = new Error('UNSAFE_STATE_DIR_OVERRIDE_REJECTED: XPIDER_SIDECAR_STATE_DIR is forbidden in packaged/owner mode');
      err.code = 'UNSAFE_STATE_DIR_OVERRIDE_REJECTED';
      throw err;
    }
    return path.resolve(process.env.XPIDER_SIDECAR_STATE_DIR.trim());
  }
  const canonical = (process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.trim())
    ? path.join(process.env.LOCALAPPDATA.trim(), 'XPIDER', 'Sidecar')
    : path.join(os.homedir(), '.xpider', 'sidecar');
  if (!trustedTestMode) {
    return assertSafeStateLocation(canonical, options);
  }
  return canonical;
}

function getSidecarPaths(overrideDir, options = {}) {
  const stateDir = getSidecarStateDir(overrideDir, options);
  return {
    stateDir,
    tokenFile: path.join(stateDir, '.email_sidecar_token'),
    pidFile: path.join(stateDir, '.email_sidecar.pid'),
    ledgerFile: path.join(stateDir, '.email_simulator_ledger.jsonl'),
    keyFile: path.join(stateDir, '.resend_api_key')
  };
}

module.exports = { getSidecarStateDir, getSidecarPaths, assertSafeStateLocation };
