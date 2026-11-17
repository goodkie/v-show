'use strict';
/**
 * Local-only Resend API Key provisioner for XPIDER Email Test Sidecar (Directive #6918564594).
 * - Windows native masked PasswordBox GUI (supports Ctrl+V paste natively without raw-mode ASCII 22 bug).
 * - Stores key strictly in NTFS %LOCALAPPDATA%\XPIDER\Sidecar\.resend_api_key (independent of exFAT package drive).
 * - Fail-closed Windows NTFS ACL application & effective DACL verification (no inherited/broad ACEs).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getSidecarPaths } = require('./sidecar-paths');

function getDefaultKeyPath() {
  return getSidecarPaths().keyFile;
}

function readSecretWindowsGui() {
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    'Add-Type -AssemblyName System.Drawing;',
    '$f = New-Object System.Windows.Forms.Form;',
    '$f.Text = "XPIDER Resend API Key Setup";',
    '$f.Width = 440; $f.Height = 175; $f.StartPosition = "CenterScreen";',
    '$f.FormBorderStyle = "FixedDialog"; $f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.TopMost = $true;',
    '$lbl = New-Object System.Windows.Forms.Label;',
    '$lbl.Text = "Resend API Key (re_...) - Ctrl+V paste supported (masked):";',
    '$lbl.Location = New-Object System.Drawing.Point(16, 16); $lbl.AutoSize = $true;',
    '$tb = New-Object System.Windows.Forms.TextBox;',
    '$tb.UseSystemPasswordChar = $true;',
    '$tb.Location = New-Object System.Drawing.Point(16, 44); $tb.Width = 392;',
    '$ok = New-Object System.Windows.Forms.Button; $ok.Text = "Save";',
    '$ok.Location = New-Object System.Drawing.Point(242, 86); $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK;',
    '$cancel = New-Object System.Windows.Forms.Button; $cancel.Text = "Cancel";',
    '$cancel.Location = New-Object System.Drawing.Point(328, 86); $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel;',
    '$f.AcceptButton = $ok; $f.CancelButton = $cancel;',
    '$f.Controls.AddRange(@($lbl, $tb, $ok, $cancel));',
    '$f.Add_Shown({ $tb.Focus() });',
    '$res = $f.ShowDialog();',
    'if ($res -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }',
    '$val = $tb.Text; $tb.Text = "";',
    '[Console]::Out.Write($val)'
  ].join(' ');

  try {
    const out = execFileSync('powershell', ['-NoProfile', '-STA', '-Command', psScript], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return String(out || '').trim();
  } catch (err) {
    if (err && err.status === 2) {
      throw new Error('ABORTED_BY_OPERATOR');
    }
    throw err;
  }
}

function readSecretNoEcho(promptText, inputStream = process.stdin) {
  return new Promise((resolve, reject) => {
    if (promptText) process.stdout.write(promptText);
    if (!inputStream.isTTY || typeof inputStream.setRawMode !== 'function') {
      let data = '';
      inputStream.setEncoding('utf8');
      inputStream.on('data', chunk => {
        data += chunk;
        const nl = data.search(/\r?\n/);
        if (nl !== -1) {
          inputStream.pause();
          resolve(data.slice(0, nl).replace(/[\x00-\x1f\x7f]/g, ''));
        }
      });
      inputStream.on('error', reject);
      inputStream.on('end', () => resolve(data.replace(/[\x00-\x1f\x7f]/g, '').trim()));
      inputStream.resume();
      return;
    }

    const wasRaw = inputStream.isRaw;
    inputStream.setRawMode(true);
    inputStream.resume();
    inputStream.setEncoding('utf8');
    let buf = '';

    const cleanup = () => {
      inputStream.removeListener('data', onData);
      try { inputStream.setRawMode(Boolean(wasRaw)); } catch (_) {}
      inputStream.pause();
    };

    const onData = (ch) => {
      for (const c of ch) {
        const code = c.charCodeAt(0);
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
        // Ignore control chars like Ctrl+V (ASCII 22 / 0x16) instead of corrupting buffer
        if (code < 0x20 || code === 0x7f) {
          continue;
        }
        buf += c;
      }
    };
    inputStream.on('data', onData);
  });
}

let cachedCurrentUserSid = undefined;
function getCurrentUserSid(execSyncFn = execFileSync) {
  if (cachedCurrentUserSid !== undefined) return cachedCurrentUserSid;
  try {
    const out = execSyncFn('whoami', ['/user'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/(S-1-5-[0-9-]+)/i);
    cachedCurrentUserSid = m ? m[1].toLowerCase() : null;
  } catch (_) {
    cachedCurrentUserSid = null;
  }
  return cachedCurrentUserSid;
}

function verifyWindowsDacl(targetPath, username, execSyncFn = execFileSync) {
  const out = execSyncFn('icacls', [targetPath], { encoding: 'utf8' });
  const rawLines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const pathLower = String(targetPath || '').toLowerCase();
  const aceLines = [];
  for (const line of rawLines) {
    if (line.toLowerCase().startsWith('successfully processed')) continue;
    let trimmed = line;
    if (pathLower && trimmed.toLowerCase().startsWith(pathLower)) {
      trimmed = trimmed.slice(targetPath.length).trim();
    }
    if (trimmed.includes(':')) aceLines.push(trimmed);
  }
  if (aceLines.length === 0) {
    throw new Error('DACL_VERIFICATION_FAILED: No ACE lines found (non-NTFS or unsupported filesystem)');
  }

  const allowedPrincipals = new Set(['nt authority\\system', 'builtin\\administrators']);
  if (username) {
    const u = String(username).trim().toLowerCase();
    allowedPrincipals.add(u);
    if (process.env.USERDOMAIN) allowedPrincipals.add(`${process.env.USERDOMAIN.trim().toLowerCase()}\\${u}`);
    if (process.env.COMPUTERNAME) allowedPrincipals.add(`${process.env.COMPUTERNAME.trim().toLowerCase()}\\${u}`);
  }
  if (execSyncFn === execFileSync) {
    const sid = getCurrentUserSid(execSyncFn);
    if (sid) allowedPrincipals.add(sid);
  }

  let hasOwnerRw = false;
  for (const ace of aceLines) {
    const colonIdx = ace.indexOf(':');
    if (colonIdx <= 0) {
      throw new Error(`DACL_VERIFICATION_FAILED: Malformed ACE (${ace})`);
    }
    const principal = ace.slice(0, colonIdx).trim().toLowerCase();
    const perms = ace.slice(colonIdx + 1).trim();

    if (/\(I\)/i.test(perms)) {
      throw new Error(`DACL_VERIFICATION_FAILED: Inherited ACE detected (${ace})`);
    }
    if (/\((DENY|N)\)/i.test(perms)) {
      throw new Error(`DACL_VERIFICATION_FAILED: Deny/No-access ACE detected (${ace})`);
    }
    if (!allowedPrincipals.has(principal)) {
      throw new Error(`DACL_VERIFICATION_FAILED: Non-owner or broad principal ACE detected (${principal})`);
    }
    if (principal === 'nt authority\\system' || principal === 'builtin\\administrators') {
      continue;
    }
    const grantsRw = /\(F\)/i.test(perms) || /\(M\)/i.test(perms) || (/\bR\b/i.test(perms) && /\bW\b/i.test(perms)) || /\(R,W\)/i.test(perms);
    if (!grantsRw) {
      throw new Error(`DACL_VERIFICATION_FAILED: Owner ACE lacks read/write permission (${ace})`);
    }
    hasOwnerRw = true;
  }
  if (!hasOwnerRw) {
    throw new Error(`DACL_VERIFICATION_FAILED: Current user (${username}) R/W ACE not verified`);
  }
  return true;
}

function writeProtectedSecretFile(targetPath, content, options = {}) {
  const platform = options.platform || process.platform;
  const username = options.username || process.env.USERNAME || '';
  const execSyncFn = options.execSyncFn || execFileSync;

  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(targetPath)}.tmp.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(tmpPath, content, { mode: 0o600 });
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
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    throw err;
  }
}

function writeKeySecurely(keyPath, rawKey, options = {}) {
  const trimmed = String(rawKey || '').trim();
  if (!trimmed) {
    throw new Error('EMPTY_KEY: No Resend API Key entered');
  }
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(trimmed)) {
    throw new Error('INVALID_KEY_FORMAT: Key must match /^re_[A-Za-z0-9_-]{8,}$/');
  }
  return writeProtectedSecretFile(keyPath, trimmed + '\n', options);
}

async function main() {
  const keyPath = getDefaultKeyPath();
  console.log('========================================================================');
  console.log('  XPIDER Email Test Sidecar - Local-Only RESEND_API_KEY Setup');
  console.log('========================================================================');
  console.log(`Target NTFS protected path: ${keyPath}`);
  console.log('(Masked input; protected NTFS ACL; never in browser, ZIP, git, or logs)');
  console.log('');

  let answer = '';
  if (process.platform === 'win32' && process.stdin.isTTY && !process.env.XPIDER_FORCE_TTY_SECRET_PROMPT) {
    console.log('Opening masked Windows password dialog (Ctrl+V paste supported)...');
    answer = readSecretWindowsGui();
  } else {
    answer = await readSecretNoEcho('Enter your Resend API Key (input hidden, starts with re_): ');
  }
  writeKeySecurely(keyPath, answer);
  console.log('[OK] RESEND_API_KEY saved and NTFS DACL verified securely (value never echoed).');
  console.log('Next: If sidecar is already running, run STOP_EMAIL_TEST_SIDECAR.bat then START_EMAIL_TEST_SIDECAR.bat.');
}

if (require.main === module) {
  main().catch(err => {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { getDefaultKeyPath, readSecretWindowsGui, readSecretNoEcho, verifyWindowsDacl, writeProtectedSecretFile, writeKeySecurely };
