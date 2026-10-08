/**
 * install_native_host.js
 * 
 * Registers the XPIDER Privacy Relay Native Messaging Host in Windows Registry for Chrome & Edge (Issue #6 R6.9G.10.1).
 * Generates portable manifests at install time using exact installed paths and exact extension IDs.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_EXT_IDS = [
  'pjohcallgmjmbfckiaogjokelhobfceg' // Default unpacked dev extension ID
];

function generateManifests(baseDir = __dirname, extIds = DEFAULT_EXT_IDS) {
  const hostBatPath = path.resolve(baseDir, 'native_host', 'xpider_native_host.bat');
  const allowedOrigins = extIds.map(id => `chrome-extension://${id}/`);

  const manifestContent = {
    name: 'com.xpider.privacy_relay',
    description: 'XPIDER Companion Privacy Relay Native Controller',
    path: hostBatPath,
    type: 'stdio',
    allowed_origins: allowedOrigins
  };

  const chromeManifestPath = path.resolve(baseDir, 'native_host', 'com.xpider.privacy_relay.chrome.json');
  const edgeManifestPath = path.resolve(baseDir, 'native_host', 'com.xpider.privacy_relay.edge.json');

  fs.writeFileSync(chromeManifestPath, JSON.stringify(manifestContent, null, 2), 'utf8');
  fs.writeFileSync(edgeManifestPath, JSON.stringify(manifestContent, null, 2), 'utf8');

  return { chromeManifestPath, edgeManifestPath, hostBatPath, allowedOrigins };
}

function registerInRegistry(baseDir = __dirname, extIds = DEFAULT_EXT_IDS) {
  const { chromeManifestPath, edgeManifestPath } = generateManifests(baseDir, extIds);

  if (process.platform !== 'win32') {
    console.log('[NATIVE_HOST] Non-Windows platform detected; skipping registry registration.');
    return true;
  }

  try {
    // 1. Google Chrome
    const chromeKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay';
    execSync(`reg add "${chromeKey}" /ve /t REG_SZ /d "${chromeManifestPath}" /f`, { stdio: 'ignore' });
    console.log('[NATIVE_HOST] Registered for Chrome:', chromeManifestPath);

    // 2. Microsoft Edge
    const edgeKey = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay';
    execSync(`reg add "${edgeKey}" /ve /t REG_SZ /d "${edgeManifestPath}" /f`, { stdio: 'ignore' });
    console.log('[NATIVE_HOST] Registered for Edge:', edgeManifestPath);

    return true;
  } catch (err) {
    console.error('[NATIVE_HOST_ERROR] Registration failed:', err.message);
    return false;
  }
}

function unregisterFromRegistry() {
  if (process.platform !== 'win32') return true;

  try {
    const chromeKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay';
    execSync(`reg delete "${chromeKey}" /f`, { stdio: 'ignore' });
  } catch (_) {}

  try {
    const edgeKey = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay';
    execSync(`reg delete "${edgeKey}" /f`, { stdio: 'ignore' });
  } catch (_) {}

  console.log('[NATIVE_HOST] Unregistered from Chrome & Edge.');
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--uninstall')) {
    unregisterFromRegistry();
  } else {
    let customExtIds = [...DEFAULT_EXT_IDS];
    const extIdIdx = args.indexOf('--ext-id');
    if (extIdIdx !== -1 && args[extIdIdx + 1]) {
      customExtIds = [args[extIdIdx + 1]];
    }
    registerInRegistry(__dirname, customExtIds);
  }
}

module.exports = { registerInRegistry, unregisterFromRegistry, generateManifests };
