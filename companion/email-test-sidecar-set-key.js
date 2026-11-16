'use strict';
/**
 * Local-only Resend API Key provisioner for XPIDER Email Test Sidecar (Directive #6909086536).
 * - True no-echo terminal entry (raw mode in TTY; never echoes secret characters).
 * - Fail-closed Windows NTFS ACL application & effective DACL verification (no inherited/broad ACEs).
 * - Atomic temp-file write + cleanup on ACL failure (never modifies parent folder ACLs).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function getDefaultKeyPath() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'XPIDER', '.resend_api_key');
  }
  return path.join(__dirname, '.resend_api_key');
}

function readSecretNoEcho(promptText) {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => {
        data += chunk;
        const nl = data.search(/\r?\n/);
        if (nl !== -1) {
          process.stdin.pause();
          resolve(data.slice(0, nl));
        }
      });
      process.stdin.on('error', reject);
      process.stdin.on('end', () => resolve(data.trim()));
      process.stdin.resume();
      return;
    }

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(Boolean(wasRaw)); } catch (_) {}
      stdin.pause();
    };

    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          cleanup();
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\x03') { // Ctrl+C
          cleanup();
          process.stdout.write('\n');
          return reject(new Error('ABORTED_BY_OPERATOR'));
        }
        if (c === '\x7f' || c === '\b') { // Backspace
          if (buf.length > 0) buf = buf.slice(0, -1);
          continue;
        }
        buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

function verifyWindowsDacl(targetPath, username, execSyncFn = execFileSync) {
  const out = execSyncFn('icacls', [targetPath], { encoding: 'utf8' });
  const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const aceLines = lines.filter(l => !l.toLowerCase().startsWith('successfully processed') && l.includes(':'));
  if (aceLines.length === 0) {
    throw new Error('DACL_VERIFICATION_FAILED: No ACE lines found in icacls output');
  }
  const forbiddenPrincipals = ['everyone', 'builtin\\users', 'nt authority\\authenticated users', 'users'];
  const userLower = String(username || '').toLowerCase();
  let hasOwnerGrant = false;
  for (const line of aceLines) {
    if (/\(I\)/.test(line)) {
      throw new Error(`DACL_VERIFICATION_FAILED: Inherited ACE detected (${line})`);
    }
    const lower = line.toLowerCase();
    for (const fp of forbiddenPrincipals) {
      if (lower.includes(fp + ':')) {
        throw new Error(`DACL_VERIFICATION_FAILED: Broad principal ACE detected (${fp})`);
      }
    }
    if (userLower && lower.includes(userLower + ':')) {
      hasOwnerGrant = true;
    }
  }
  if (!hasOwnerGrant) {
    throw new Error(`DACL_VERIFICATION_FAILED: Current user (${username}) ACE not verified`);
  }
  return true;
}

function writeKeySecurely(keyPath, rawKey, options = {}) {
  const trimmed = String(rawKey || '').trim();
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
    throw new Error('INVALID_KEY_FORMAT: Key must match /^re_[A-Za-z0-9_-]{8,}$/');
  }
  const platform = options.platform || process.platform;
  const username = options.username || process.env.USERNAME || '';
  const execSyncFn = options.execSyncFn || execFileSync;

  const dir = path.dirname(keyPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.resend_api_key.tmp.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(tmpPath, trimmed + '\n', { mode: 0o600 });
    if (platform === 'win32') {
      if (!username) {
        throw new Error('ACL_FAILED: USERNAME environment variable missing for icacls');
      }
      execSyncFn('icacls', [tmpPath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], { stdio: 'pipe' });
      verifyWindowsDacl(tmpPath, username, execSyncFn);
    } else {
      const st = fs.statSync(tmpPath);
      if ((st.mode & 0o077) !== 0) {
        throw new Error(`POSIX_MODE_FAILED: mode=${(st.mode & 0o777).toString(8)}`);
      }
    }
    fs.renameSync(tmpPath, keyPath);
  } catch (err) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    throw err;
  }
}

async function main() {
  const keyPath = getDefaultKeyPath();
  console.log('========================================================================');
  console.log('  XPIDER Email Test Sidecar - Local-Only RESEND_API_KEY Setup');
  console.log('========================================================================');
  console.log(`Target local protected path: ${keyPath}`);
  console.log('(No-echo input; protected NTFS ACL; never in browser, ZIP, git, or logs)');
  console.log('');

  const answer = await readSecretNoEcho('Enter your Resend API Key (input hidden, starts with re_): ');
  writeKeySecurely(keyPath, answer);
  console.log('[OK] RESEND_API_KEY saved and ACL/DACL verified securely (value never echoed).');
  console.log('Next: If sidecar is already running, run STOP_EMAIL_TEST_SIDECAR.bat then START_EMAIL_TEST_SIDECAR.bat.');
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { getDefaultKeyPath, readSecretNoEcho, verifyWindowsDacl, writeKeySecurely };
