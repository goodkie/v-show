/**
 * install_native_host.js
 * Registers the XPIDER Privacy Relay Native Messaging Host in Windows Registry for Chrome & Edge.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromeManifest = path.join(__dirname, 'native_host', 'com.xpider.privacy_relay.chrome.json');
const edgeManifest = path.join(__dirname, 'native_host', 'com.xpider.privacy_relay.edge.json');

function registerInRegistry() {
  if (process.platform !== 'win32') {
    console.log('[NATIVE_HOST] Non-Windows platform detected; skipping registry registration.');
    return true;
  }

  try {
    // 1. Chrome
    const chromeKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay';
    execSync(`reg add "${chromeKey}" /ve /t REG_SZ /d "${chromeManifest}" /f`, { stdio: 'ignore' });
    console.log('[NATIVE_HOST] Registered for Chrome:', chromeManifest);

    // 2. Microsoft Edge
    const edgeKey = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay';
    execSync(`reg add "${edgeKey}" /ve /t REG_SZ /d "${edgeManifest}" /f`, { stdio: 'ignore' });
    console.log('[NATIVE_HOST] Registered for Edge:', edgeManifest);

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
  if (process.argv[2] === '--uninstall') {
    unregisterFromRegistry();
  } else {
    registerInRegistry();
  }
}

module.exports = { registerInRegistry, unregisterFromRegistry };
