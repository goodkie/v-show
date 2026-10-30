/**
 * MAJOR_BACKUP Stage 0 (Directive #6514763285): immutable snapshot + sandbox restore proof.
 * - Secrets never leave the machine and are never printed; they are DPAPI(CurrentUser)-encrypted.
 * - No network sends, no router/proxy change, live Chrome profile is only READ (copy).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STAMP = '20261030';
const NAME = `MAJOR_BACKUP_${STAMP}_from_93_4be780b4`;
const OUT = path.join(ROOT, 'backups', NAME);
const SANDBOX = path.join(ROOT, 'backups', `_sandbox_restore_${STAMP}`);
const EXT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const CHROME_DEFAULT = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default');

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const ps = (script) => execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });

rm(OUT); rm(SANDBOX);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SANDBOX, { recursive: true });

const manifest = { name: NAME, createdAt: new Date().toISOString(), items: [], results: {} };
const add = (kind, file, extra = {}) => {
  const rel = path.relative(OUT, file).replace(/\\/g, '/');
  manifest.items.push({ kind, file: rel, bytes: fs.statSync(file).size, sha256: sha(file), ...extra });
};

// (a) git state ------------------------------------------------------------
manifest.git = {
  branch: git('branch', '--show-current'),
  head: git('rev-parse', 'HEAD'),
  headSubject: git('log', '-1', '--format=%s'),
  tag93: git('rev-parse', 'v6.9g.10.3-rc3.60.7.1.4.93^{commit}'),
};
const srcZip = path.join(OUT, 'source_HEAD.zip');
git('archive', '--format=zip', '-o', srcZip, 'HEAD');
add('source_tracked_tree_HEAD', srcZip);
const dirtyPatch = path.join(OUT, 'uncommitted_tracked_changes.patch');
fs.writeFileSync(dirtyPatch, git('diff', 'HEAD'));
add('uncommitted_tracked_diff', dirtyPatch);
const untracked = path.join(OUT, 'untracked_file_list.txt');
fs.writeFileSync(untracked, git('ls-files', '--others', '--exclude-standard'));
add('untracked_file_list', untracked);

// (b) release assets, preserved independently ------------------------------
for (const v of ['92', '93']) {
  const z = path.join(ROOT, `XPIDER_R6.9G.10.3.7.1.4.${v}_OWNER_BETA.zip`);
  const dst = path.join(OUT, 'releases', path.basename(z));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(z, dst);
  add(`release_asset_${v}`, dst);
}

// (c) secrets + runtime state, DPAPI-encrypted -----------------------------
const secretCandidates = [
  'companion/.local_credentials.json', 'companion/.control_token', 'companion/.private_egress_transaction.json',
  'companion/.do_firewall_pat.dpapi', 'companion/.firewall_guardian.json', 'companion/.firewall_guardian_state.json',
  'companion/egress_pool_config.json', 'companion/extension_key.json',
  '.local_credentials.json', '.control_token', '.private_egress_transaction.json', '.pending_credential_rotation.json',
  'companion/.pending_credential_rotation.json',
];
const stage = path.join(SANDBOX, '_stage_plain');
fs.mkdirSync(stage, { recursive: true });
const included = [];
for (const rel of secretCandidates) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) continue;
  const d = path.join(stage, 'workspace', rel);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(f, d);
  included.push({ rel, sha256: sha(f) });
}
// Chrome extension storage (live profile: read-only copy; Chrome keeps running)
const lesSrc = path.join(CHROME_DEFAULT, 'Local Extension Settings', EXT_ID);
const lesDst = path.join(stage, 'chrome', 'Local Extension Settings', EXT_ID);
const lesFiles = [];
if (fs.existsSync(lesSrc)) {
  fs.mkdirSync(lesDst, { recursive: true });
  for (const f of fs.readdirSync(lesSrc)) {
    if (f === 'LOCK') continue;
    try {
      fs.copyFileSync(path.join(lesSrc, f), path.join(lesDst, f));
      lesFiles.push({ rel: f, sha256: sha(path.join(lesDst, f)) });
    } catch (e) { lesFiles.push({ rel: f, error: e.code || e.message }); }
  }
}
manifest.secretBundle = { files: included.map((i) => i.rel), count: included.length };
manifest.chromeExtensionStorage = { extId: EXT_ID, files: lesFiles.length, errors: lesFiles.filter((x) => x.error).length };
fs.writeFileSync(path.join(stage, 'inner_manifest.json'), JSON.stringify({ included, lesFiles }, null, 2));

const bundleZip = path.join(SANDBOX, '_bundle.zip');
ps(`Compress-Archive -Path '${stage}\\*' -DestinationPath '${bundleZip}' -Force`);
const enc = path.join(OUT, 'secrets_and_runtime_state.dpapi');
ps(`Add-Type -AssemblyName System.Security; $b=[IO.File]::ReadAllBytes('${bundleZip}'); ` +
   `$e=[Security.Cryptography.ProtectedData]::Protect($b,[Text.Encoding]::UTF8.GetBytes('xpider-major-backup'),'CurrentUser'); ` +
   `[IO.File]::WriteAllBytes('${enc}',$e)`);
add('encrypted_secrets_and_runtime_state_DPAPI_CurrentUser', enc, { note: 'decryptable only by this Windows user on this PC' });
const plainBundleSha = sha(bundleZip);
rm(stage); rm(bundleZip);

// annotated tag ------------------------------------------------------------
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(OUT, 'RESTORE_README.txt'),
`Restore: 1) git checkout <head in MANIFEST.json> (or unzip source_HEAD.zip)
2) PowerShell (same Windows user): decrypt secrets_and_runtime_state.dpapi with
   [Security.Cryptography.ProtectedData]::Unprotect(bytes, UTF8("xpider-major-backup"), 'CurrentUser') -> zip -> extract.
3) Chrome storage: close Chrome fully, copy chrome/Local Extension Settings/${EXT_ID} back into
   %LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Local Extension Settings\\ (back up the current one first).
4) Rollback release: releases/XPIDER_R6.9G.10.3.7.1.4.92_OWNER_BETA.zip or ...93_OWNER_BETA.zip (SHA in MANIFEST.json).
`);

// (d) sandbox restore verification ----------------------------------------
const res = manifest.results;
const sbSrc = path.join(SANDBOX, 'src');
ps(`Expand-Archive -Path '${srcZip}' -DestinationPath '${sbSrc}' -Force`);
const bad = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') && p.includes(`${path.sep}extension${path.sep}`)) {
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); } catch { bad.push(path.relative(sbSrc, p)); }
    }
  }
})(path.join(sbSrc, 'extension'));
res.sandboxExtensionSyntaxFailures = bad;
res.sandboxManifestValid = (() => { try { JSON.parse(fs.readFileSync(path.join(sbSrc, 'extension', 'manifest.json'), 'utf8')); return true; } catch { return false; } })();

const dec = path.join(SANDBOX, '_dec.zip');
ps(`Add-Type -AssemblyName System.Security; $e=[IO.File]::ReadAllBytes('${enc}'); ` +
   `$b=[Security.Cryptography.ProtectedData]::Unprotect($e,[Text.Encoding]::UTF8.GetBytes('xpider-major-backup'),'CurrentUser'); ` +
   `[IO.File]::WriteAllBytes('${dec}',$b)`);
res.decryptedBundleShaMatchesPlain = sha(dec) === plainBundleSha;
const decDir = path.join(SANDBOX, 'dec');
ps(`Expand-Archive -Path '${dec}' -DestinationPath '${decDir}' -Force`);
const inner = JSON.parse(fs.readFileSync(path.join(decDir, 'inner_manifest.json'), 'utf8'));
res.secretFilesRestoredHashOk = inner.included.every((i) => sha(path.join(decDir, 'workspace', i.rel)) === i.sha256);
res.chromeStorageFilesRestoredHashOk = inner.lesFiles.filter((f) => !f.error)
  .every((f) => sha(path.join(decDir, 'chrome', 'Local Extension Settings', EXT_ID, f.rel)) === f.sha256);
res.releaseAssetShasMatchRemoteDigests = {
  '92': sha(path.join(OUT, 'releases', 'XPIDER_R6.9G.10.3.7.1.4.92_OWNER_BETA.zip')) === 'd71ec43305cf461ea9ecdb6d28d024a2c20655fbbbbcdc011dbe25b4165dacdb',
  '93': sha(path.join(OUT, 'releases', 'XPIDER_R6.9G.10.3.7.1.4.93_OWNER_BETA.zip')) === '5714dd98fdb54fd4d3ed15ad2cb8af8d7eeccade1cd7e64708670a241c58fa2b',
};
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
rm(dec);
console.log(JSON.stringify({ out: OUT, sandbox: SANDBOX, results: res, secretFileCount: included.length, chromeStorage: manifest.chromeExtensionStorage }, null, 2));

