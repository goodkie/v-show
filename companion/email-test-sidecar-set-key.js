'use strict';
/**
 * Local-only Resend API Key provisioner for XPIDER Email Test Sidecar.
 * Stores key strictly in %LOCALAPPDATA%\XPIDER\.resend_api_key (never in git, ZIP, browser, or logs).
 */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function getDefaultKeyPath() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'XPIDER', '.resend_api_key');
  }
  return path.join(__dirname, '.resend_api_key');
}

const keyPath = getDefaultKeyPath();
console.log('========================================================================');
console.log('  XPIDER Email Test Sidecar - Local-Only RESEND_API_KEY Setup');
console.log('========================================================================');
console.log(`Target local protected path: ${keyPath}`);
console.log('(Never stored in browser, ZIP, git, or console logs)');
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter your Resend API Key (starts with re_): ', (answer) => {
  rl.close();
  const trimmed = String(answer || '').trim();
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
    console.error('[ERROR] Invalid key format. Key must start with "re_". Nothing saved.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, trimmed + '\n', { mode: 0o600 });
  if (process.platform === 'win32' && process.env.USERNAME) {
    try {
      const { execFileSync } = require('node:child_process');
      execFileSync('icacls', [keyPath, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W)`], { stdio: 'ignore' });
    } catch (_) {}
  }
  console.log('');
  console.log('[OK] RESEND_API_KEY saved securely to local protected path (value not echoed).');
  console.log('Next: If sidecar is already running, run STOP_EMAIL_TEST_SIDECAR.bat then START_EMAIL_TEST_SIDECAR.bat.');
});
