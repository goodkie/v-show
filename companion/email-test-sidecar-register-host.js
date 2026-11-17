'use strict';
/**
 * Registers the isolated Native Messaging Host (`com.xpider.email_sidecar`) under HKCU
 * for Microsoft Edge and Google Chrome (zero admin rights, zero PowerShell).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getSidecarPaths } = require('./sidecar-paths');

const NATIVE_HOST_NAME = 'com.xpider.email_sidecar';
const ALLOWED_EXTENSION_ORIGIN = 'chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj/';

function registerNativeMessagingHost(options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return { registered: false, reason: 'NON_WIN32' };

  const paths = getSidecarPaths(options.stateDir, { trustedTestMode: Boolean(options.trustedTestMode) });
  const nhDir = path.join(paths.stateDir, 'native_host');
  fs.mkdirSync(nhDir, { recursive: true });

  const hostScript = path.resolve(options.hostScript || path.join(__dirname, 'email-test-sidecar-native-host.js'));
  const batPath = path.join(nhDir, 'xpider_email_sidecar_host.bat');
  const manifestPath = path.join(nhDir, `${NATIVE_HOST_NAME}.json`);
  const bundledNode = path.resolve(__dirname, '..', 'runtime', 'node.exe');
  const nodeExe = options.nodeExe || (fs.existsSync(bundledNode) ? bundledNode : (process.execPath || 'node'));

  fs.writeFileSync(batPath, `@echo off\r\n"${nodeExe}" "${hostScript}"\r\n`, 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify({
    name: NATIVE_HOST_NAME,
    description: 'XPIDER Isolated Email Test Sidecar Pairing Host',
    path: batPath,
    type: 'stdio',
    allowed_origins: [ALLOWED_EXTENSION_ORIGIN]
  }, null, 2), 'utf8');

  const regKeys = [
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`
  ];
  const execFn = options.execSyncFn || execFileSync;
  for (const key of regKeys) {
    execFn('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { stdio: 'pipe' });
  }
  return { registered: true, hostName: NATIVE_HOST_NAME, manifestPath, batPath };
}

if (require.main === module) {
  try {
    const res = registerNativeMessagingHost();
    console.log('[OK] Registered isolated Native Messaging Host:', JSON.stringify(res));
  } catch (err) {
    console.error('[ERROR] Failed to register Native Messaging Host:', err.message);
    process.exit(1);
  }
}

module.exports = {
  NATIVE_HOST_NAME,
  ALLOWED_EXTENSION_ORIGIN,
  registerNativeMessagingHost
};
