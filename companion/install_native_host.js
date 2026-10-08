/**
 * install_native_host.js
 * 
 * Registers the XPIDER Privacy Relay Native Messaging Host in Windows Registry for Chrome & Edge (Issue #6 R6.9G.10.2).
 * Strictly requires exact verified extension ID (discovered from manifest key or explicitly supplied via --ext-id).
 * Zero silent dev-ID defaults (Blocker 5).
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function deriveExtensionIdFromKey(b64Key) {
  try {
    const derBuffer = Buffer.from(b64Key, 'base64');
    const hash = crypto.createHash('sha256').update(derBuffer).digest();
    let extId = '';
    for (let i = 0; i < 16; i++) {
      const b = hash[i];
      extId += String.fromCharCode(97 + ((b >> 4) & 0x0f));
      extId += String.fromCharCode(97 + (b & 0x0f));
    }
    return extId;
  } catch (_) {
    return null;
  }
}

function discoverExtensionId(baseDir = __dirname) {
  const candidates = [
    path.resolve(baseDir, 'extension_key.json'),
    path.resolve(baseDir, '..', 'manifest.json'),
    path.resolve(baseDir, '..', 'extension', 'manifest.json'),
    path.resolve(baseDir, '..', 'send_message_backup', 'manifest.json'),
    path.resolve(baseDir, '..', 'send_message_backup', 'build', 'extension', 'manifest.json')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const data = JSON.parse(fs.readFileSync(c, 'utf8'));
        if (data.extId && typeof data.extId === 'string' && /^[a-p]{32}$/.test(data.extId)) {
          return data.extId;
        }
        if (data.key && typeof data.key === 'string') {
          const derived = deriveExtensionIdFromKey(data.key);
          if (derived && /^[a-p]{32}$/.test(derived)) return derived;
        }
      } catch (_) {}
    }
  }
  return null;
}

function generateManifests(baseDir = __dirname, extIds = []) {
  if (!Array.isArray(extIds) || extIds.length === 0) {
    throw new Error('No valid extension IDs provided for native messaging manifest');
  }

  // Validate all extension IDs
  for (const id of extIds) {
    if (!/^[a-p]{32}$/.test(id)) {
      throw new Error(`Invalid Chrome/Edge extension ID format: "${id}". Must be 32 characters [a-p].`);
    }
  }

  const nativeHostDir = path.resolve(baseDir, 'native_host');
  if (!fs.existsSync(nativeHostDir)) {
    fs.mkdirSync(nativeHostDir, { recursive: true });
  }

  const hostBatPath = path.resolve(nativeHostDir, 'xpider_native_host.bat');
  const allowedOrigins = extIds.map(id => `chrome-extension://${id}/`);

  const manifestContent = {
    name: 'com.xpider.privacy_relay',
    description: 'XPIDER Companion Privacy Relay Native Controller',
    path: hostBatPath,
    type: 'stdio',
    allowed_origins: allowedOrigins
  };

  const chromeManifestPath = path.resolve(nativeHostDir, 'com.xpider.privacy_relay.chrome.json');
  const edgeManifestPath = path.resolve(nativeHostDir, 'com.xpider.privacy_relay.edge.json');

  fs.writeFileSync(chromeManifestPath, JSON.stringify(manifestContent, null, 2), 'utf8');
  fs.writeFileSync(edgeManifestPath, JSON.stringify(manifestContent, null, 2), 'utf8');

  return { chromeManifestPath, edgeManifestPath, hostBatPath, allowedOrigins };
}

function registerInRegistry(baseDir = __dirname, extIds = []) {
  let resolvedIds = extIds;
  if (!resolvedIds || resolvedIds.length === 0) {
    const discovered = discoverExtensionId(baseDir);
    if (discovered) {
      resolvedIds = [discovered];
      console.log(`[NATIVE_HOST] Auto-discovered stable extension ID from manifest key: ${discovered}`);
    } else {
      console.error('[NATIVE_HOST_ERROR] No valid extension ID supplied via --ext-id and discovery from manifest key failed.');
      process.exit(1);
    }
  }

  const { chromeManifestPath, edgeManifestPath } = generateManifests(baseDir, resolvedIds);

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
    const ok = unregisterFromRegistry();
    if (!ok) process.exit(1);
  } else {
    let customExtIds = [];
    const extIdIdx = args.indexOf('--ext-id');
    if (extIdIdx !== -1 && args[extIdIdx + 1]) {
      customExtIds = [args[extIdIdx + 1].trim()];
    }
    const ok = registerInRegistry(__dirname, customExtIds);
    if (!ok) process.exit(1);
  }
}

module.exports = { registerInRegistry, unregisterFromRegistry, generateManifests, discoverExtensionId };
