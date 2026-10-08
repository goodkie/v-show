/**
 * install_autostart.js
 * Configures XPIDER Privacy Relay to start automatically on Windows logon (Zero-Manual-Launch UX)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const vbsSource = path.join(__dirname, 'start_relay_silent.vbs');
const startupDir = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup'
);
const startupTarget = path.join(startupDir, 'XPIDER_Privacy_Relay.vbs');

function installAutostart() {
  if (!fs.existsSync(startupDir)) {
    console.error('[AUTOSTART_INSTALL_FAIL] Windows Startup directory not found:', startupDir);
    return false;
  }

  // Generate wrapper VBS that points to the exact repository location
  const wrapperContent = `Set WshShell = CreateObject("WScript.Shell")\r\ncmd = "wscript.exe """ & "${vbsSource.replace(/\\/g, '\\\\')}" & """"\r\nWshShell.Run cmd, 0, False\r\n`;
  try {
    fs.writeFileSync(startupTarget, wrapperContent, 'utf8');
    console.log('[AUTOSTART_INSTALLED] Successfully registered in Windows Startup:', startupTarget);
    return true;
  } catch (err) {
    console.error('[AUTOSTART_INSTALL_ERROR]', err.message);
    return false;
  }
}

function uninstallAutostart() {
  try {
    if (fs.existsSync(startupTarget)) {
      fs.unlinkSync(startupTarget);
      console.log('[AUTOSTART_UNINSTALLED] Removed:', startupTarget);
    }
    return true;
  } catch (err) {
    console.error('[AUTOSTART_UNINSTALL_ERROR]', err.message);
    return false;
  }
}

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--uninstall') {
    const ok = uninstallAutostart();
    if (!ok) process.exit(1);
  } else {
    const ok = installAutostart();
    if (!ok) process.exit(1);
  }
}

module.exports = { installAutostart, uninstallAutostart };
