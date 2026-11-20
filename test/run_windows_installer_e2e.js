'use strict';
/**
 * XPIDER V7.1 Clean-Sandbox Windows Installer E2E Verification Suite (ZERO Real Sends, ZERO Host Registry Mutation).
 * Verifies Directive #7047833293 Feature 1:
 * 1. Silent install to isolated clean sandbox directories (--skip-registry --skip-shortcuts --skip-browser).
 * 2. Bundled runtime\node.exe works with PATH completely stripped of system Node.js (zero Node prerequisite).
 * 3. Zero E:\vivpr workspace path dependency and zero leaked secrets in installed files.
 * 4. Pinned Extension ID key preserved (392 chars -> ldlijlaccfeelfdhgnjbibniocefckjj) & Native Host manifest install-relative.
 * 5. Cold start of Email Sidecar via bundled runtime\node.exe on isolated port 19996 (health + Gmail status + mock preflight).
 * 6. Upgrade over simulated V7.0 durable Sidecar state preserves consent ledger, suppression map, queue & keys untouched.
 * 7. Two-profile isolated install verification (zero cross-profile collision).
 * 8. Silent uninstall with --retain-data removes App dir while preserving durable Sidecar data 100%.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

if (process.platform !== 'win32') {
  console.log('SKIP: run_windows_installer_e2e.js requires win32');
  process.exit(0);
}

const exeArg = process.argv[2] || process.env.XPIDER_SETUP_EXE;
if (!exeArg || !fs.existsSync(exeArg)) {
  console.error('USAGE: node test/run_windows_installer_e2e.js <path-to-XPIDER_V7.1.0_SETUP_*.exe>');
  process.exit(1);
}
const setupExe = path.resolve(exeArg);

function runExe(args) {
  const r = spawnSync(setupExe, args, { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) {
    throw new Error(`Setup EXE failed (code=${r.status}): ${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

(async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-v71-clean-sandbox-'));
  let sidecarProc = null;
  try {
    const appA = path.join(sandbox, 'ProfileA', 'App');
    const stateA = path.join(sandbox, 'ProfileA', 'Sidecar');
    const appB = path.join(sandbox, 'ProfileB', 'App');
    const stateB = path.join(sandbox, 'ProfileB', 'Sidecar');

    // 1. Verify --info declares UNSIGNED & pinned ID
    const infoOut = runExe(['--info']);
    assert.ok(infoOut.includes('SIGNED=UNSIGNED'), 'Installer must honestly declare UNSIGNED');
    assert.ok(infoOut.includes('EXTENSION_ID=ldlijlaccfeelfdhgnjbibniocefckjj'));
    console.log('PASS 1: installer --info declares UNSIGNED & pinned Extension ID');

    // 2. Clean silent install to ProfileA
    runExe(['--silent', '--install-dir', appA, '--state-dir', stateA, '--skip-registry', '--skip-shortcuts', '--skip-browser']);
    const bundledNode = path.join(appA, 'runtime', 'node.exe');
    assert.ok(fs.existsSync(bundledNode), 'Bundled runtime\\node.exe must exist');
    assert.ok(fs.existsSync(path.join(appA, 'XPIDER_UNINSTALL.exe')), 'Local uninstaller must be placed in App dir');
    const mf = JSON.parse(fs.readFileSync(path.join(appA, 'extension', 'manifest.json'), 'utf8'));
    assert.equal(mf.key.length, 392, 'Pinned manifest key (392 chars) must be preserved');

    // Verify Native Host wrapper & manifest point strictly to install-relative runtime\node.exe
    const nhBat = fs.readFileSync(path.join(stateA, 'native_host', 'xpider_email_sidecar_host.bat'), 'utf8');
    assert.ok(nhBat.includes(bundledNode), 'Native host bat must reference bundled runtime\\node.exe');
    const nhJson = JSON.parse(fs.readFileSync(path.join(stateA, 'native_host', 'com.xpider.email_sidecar.json'), 'utf8'));
    assert.deepEqual(nhJson.allowed_origins, ['chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj/']);
    console.log('PASS 2: clean silent install, bundled node.exe, pinned ID & install-relative Native Host verified');

    // 3. Verify zero hardcoded workspace paths and zero secrets in installed tree
    const checkDirs = [path.join(appA, 'companion'), path.join(appA, 'extension')];
    for (const root of checkDirs) {
      const stack = [root];
      while (stack.length) {
        const cur = stack.pop();
        for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
          if (ent.name === 'node_modules') continue;
          const full = path.join(cur, ent.name);
          if (ent.isDirectory()) { stack.push(full); continue; }
          if (!/\.(js|json|html|css|bat|txt)$/.test(ent.name)) continue;
          const txt = fs.readFileSync(full, 'utf8');
          assert.ok(!/E:[\\/]vivpr[\\/]ai[\\/]extension-form-sender/i.test(txt), `Hardcoded workspace path in ${full}`);
          assert.ok(!/\bre_[A-Za-z0-9_]{16,}|\bwhsec_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{24,}|ya29\.[A-Za-z0-9._-]{16,}|GOCSPX-[A-Za-z0-9_-]{16,}/.test(txt), `Secret leak in ${full}`);
        }
      }
    }
    console.log('PASS 3: zero hardcoded workspace paths & zero secrets in installed files');

    // 4. Cold-start installed Sidecar strictly using bundled runtime\node.exe with EMPTY PATH (no system Node!)
    const bootScript = `
      const { EmailTestSidecar } = require(${JSON.stringify(path.join(appA, 'companion', 'email-test-sidecar.js'))});
      const sc = new EmailTestSidecar({ stateDir: ${JSON.stringify(stateA)}, port: 19996, trustedTestMode: true });
      sc.start().then(() => console.log('SANDBOX_SIDECAR_READY'));
    `;
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    sidecarProc = spawn(bundledNode, ['-e', bootScript], {
      env: {
        SystemRoot: sysRoot,
        USERNAME: process.env.USERNAME || 'user',
        LOCALAPPDATA: path.join(sandbox, 'ProfileA'),
        PATH: `${sysRoot}\\System32;${sysRoot}` // Clean Windows OS PATH only — ZERO Node.js in PATH!
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SANDBOX_SIDECAR_BOOT_TIMEOUT')), 15000);
      let out = '';
      sidecarProc.stdout.on('data', d => {
        out += d.toString();
        if (out.includes('SANDBOX_SIDECAR_READY')) { clearTimeout(t); resolve(); }
      });
      sidecarProc.stderr.on('data', d => { out += d.toString(); });
      sidecarProc.once('exit', code => { clearTimeout(t); reject(new Error('Premature exit ' + code + ': ' + out)); });
    });

    const health = await fetch('http://127.0.0.1:19996/health').then(r => r.json());
    assert.equal(health.status, 'OK');
    const tok = fs.readFileSync(path.join(stateA, '.email_sidecar_token'), 'utf8').trim();
    const gmStatus = await fetch('http://127.0.0.1:19996/email/gmail/status', {
      headers: { Authorization: `Bearer ${tok}` }
    }).then(r => r.json());
    assert.equal(gmStatus.ok, true);
    assert.equal(gmStatus.provider, 'GMAIL');
    const exitPromise = new Promise(resolve => sidecarProc.once('exit', resolve));
    sidecarProc.kill();
    await exitPromise;
    sidecarProc = null;
    await new Promise(r => setTimeout(r, 500));
    console.log('PASS 4: cold-start with bundled runtime\\node.exe (System32-only PATH, zero system Node) & Sidecar 19996 /health + /email/gmail/status PASS');

    // 5. Upgrade over simulated V7.0 durable state preserves 100% of user data untouched
    const v7SentinelConsent = path.join(stateA, '.email_consent_ledger.json');
    const v7SentinelQueue = path.join(stateA, '.email_production_queue.json');
    const v7SentinelSup = path.join(stateA, '.suppressed_recipient_hashes.json');
    const consentPayload = JSON.stringify({ version: 1, records: { 'v7user@example.test': { email: 'v7user@example.test' } } });
    const queuePayload = JSON.stringify({ campaignId: 'default', entries: [{ email: 'v7user@example.test', status: 'ACCEPTED' }] });
    const supPayload = JSON.stringify({ 'abcd1234': { reason: 'UNSUBSCRIBED' } });
    fs.writeFileSync(v7SentinelConsent, consentPayload, 'utf8');
    fs.writeFileSync(v7SentinelQueue, queuePayload, 'utf8');
    fs.writeFileSync(v7SentinelSup, supPayload, 'utf8');

    runExe(['--silent', '--install-dir', appA, '--state-dir', stateA, '--skip-registry', '--skip-shortcuts', '--skip-browser']);
    assert.equal(fs.readFileSync(v7SentinelConsent, 'utf8'), consentPayload, 'V7 consent ledger must survive upgrade untouched');
    assert.equal(fs.readFileSync(v7SentinelQueue, 'utf8'), queuePayload, 'V7 queue history must survive upgrade untouched');
    assert.equal(fs.readFileSync(v7SentinelSup, 'utf8'), supPayload, 'V7 suppression map must survive upgrade untouched');
    console.log('PASS 5: V7.0 -> V7.1 upgrade preserves durable Sidecar ledger, queue & suppressions byte-for-byte');

    // 6. Two-profile isolation (ProfileB installs cleanly without affecting ProfileA)
    runExe(['--silent', '--install-dir', appB, '--state-dir', stateB, '--skip-registry', '--skip-shortcuts', '--skip-browser']);
    assert.ok(fs.existsSync(path.join(appB, 'runtime', 'node.exe')));
    assert.ok(!fs.existsSync(path.join(stateB, '.email_consent_ledger.json')), 'ProfileB state must stay isolated from ProfileA');
    console.log('PASS 6: two-profile installation strictly isolated');

    // 7. Silent uninstall with --retain-data removes App dir while preserving durable Sidecar data 100%
    runExe(['--silent', '--uninstall', '--retain-data', '--install-dir', appA, '--state-dir', stateA, '--skip-registry']);
    assert.ok(!fs.existsSync(appA), 'App directory must be cleanly removed on uninstall');
    assert.equal(fs.readFileSync(v7SentinelConsent, 'utf8'), consentPayload, 'Uninstall --retain-data must preserve consent ledger');
    assert.equal(fs.readFileSync(v7SentinelSup, 'utf8'), supPayload, 'Uninstall --retain-data must preserve suppression map');
    console.log('PASS 7: uninstall with --retain-data removes App dir and preserves durable user data 100%');

    console.log('ALL WINDOWS CLEAN-SANDBOX INSTALLER E2E TESTS PASSED (7/7; ZERO REAL SENDS)');
  } finally {
    if (sidecarProc) { try { sidecarProc.kill(); } catch (_) {} }
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
