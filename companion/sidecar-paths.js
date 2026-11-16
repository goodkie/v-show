'use strict';
const path = require('node:path');
const os = require('node:os');

function getSidecarStateDir(overrideDir) {
  if (overrideDir && typeof overrideDir === 'string') {
    return path.resolve(overrideDir);
  }
  if (process.env.XPIDER_SIDECAR_STATE_DIR && process.env.XPIDER_SIDECAR_STATE_DIR.trim()) {
    return path.resolve(process.env.XPIDER_SIDECAR_STATE_DIR.trim());
  }
  if (process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.trim()) {
    return path.join(process.env.LOCALAPPDATA.trim(), 'XPIDER', 'Sidecar');
  }
  return path.join(os.homedir(), '.xpider', 'sidecar');
}

function getSidecarPaths(overrideDir) {
  const stateDir = getSidecarStateDir(overrideDir);
  return {
    stateDir,
    tokenFile: path.join(stateDir, '.email_sidecar_token'),
    pidFile: path.join(stateDir, '.email_sidecar.pid'),
    ledgerFile: path.join(stateDir, '.email_simulator_ledger.jsonl'),
    keyFile: path.join(stateDir, '.resend_api_key')
  };
}

module.exports = { getSidecarStateDir, getSidecarPaths };
