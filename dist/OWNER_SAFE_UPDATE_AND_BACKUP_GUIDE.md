# XPIDER V7 Candidate — Owner-Facing Backup, Update & Rollback Guide (Windows 10)

Status: CANDIDATE / RELEASE HOLD. Do not apply to your live install until the Owner explicitly approves.
Functional source: commit `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree is byte-identical at the documentation HEAD of the same branch).
Archive: `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` — 4,467,833 bytes — SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
Extension ID (fixed by manifest key): `ldlijlaccfeelfdhgnjbibniocefckjj`

## 0. Correction to earlier guidance
"EXPORT OWNER DEBUG BUNDLE" is **NOT a backup**. Tested result: it is a redacted diagnostic export (not equal to storage.local, e.g. Email Collector entries are not retained) and the extension has **no restore function**. Do not rely on it.

## 1. Where to get the file (verified)
The repository `goodkie/v-show` is currently **PUBLIC**; the URL below was downloaded anonymously (no credentials) and the SHA-256 matched:
`https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
Check on Windows: `Get-FileHash .\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256` must print the hash above. If it does not, stop.
Fallback (reproducible build): `git checkout candidate/p0-core-regressions-v7` then `node scripts/package_owner_safe_candidate_v7.js` (the ZIP embeds timestamps, so compare the **per-file** hashes in `dist/PACKAGE_INVENTORY_SHA256.json`, not the ZIP hash).

## 2. Verified backup (do this first, browser fully closed)
Tested: copy the extension's storage folder, restore it into a fresh profile, all storage.local data came back identical.
1. Close ALL Chrome/Edge windows (check Task Manager).
2. Copy the folder `%LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` (Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj`) to a private location.
3. Also copy your unpacked extension folder.
This copy contains your data in **plain text including proxy credentials**. Keep it private; never upload it (GitHub, chat, email).
Validated on Microsoft Edge only; Chrome uses the same layout but is NOT_TESTED. The extension uses no IndexedDB (verified: none on disk).

## 3. Transactional update (preview first, then separate approval)
Requires Node.js 18+ on the PC (if not installed this self-service path is BLOCKED; then use the manual copy-backup in §2 and stop for support — do not overlay the ZIP by hand).
```
node scripts\xpider_safe_update.js plan  --target "C:\path\to\your\xpider" --archive .\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json
```
`plan` is a dry run: it changes nothing and prints what would be added/replaced/removed and a `PLAN_TOKEN`. Only after the Owner approves, run the same command with `apply --approve <PLAN_TOKEN> --backup-root "D:\xpider_update_backup_1"`.
The tool: verifies archive hash + ZIP entry names + manifest ID + full 50-file inventory in a staging folder; backs up and hash-verifies the whole folder; writes with temp-file+rename; auto-rolls back on any error; never touches files it does not know; refuses `--skip-backup`, symlinks, wrong/missing extension ID.
After apply, open `chrome://extensions` and press **Reload** (never Remove). Nothing starts automatically.

## 4. Rollback / crash recovery
`node scripts\xpider_safe_update.js rollback --target "<folder>" --backup-root "<same backup root>"` restores the folder byte-for-byte.
If the PC crashed or the tool was killed mid-update: `recover` with the same arguments. Then Reload the extension.
Never click **Remove** on the extension (deletes its storage) and never load a second copy with the same key.

## 5. Not covered
Selective/global reset flows, real Windows 10 desktop smoke, real NopeCHA interaction, live Decodo/DO egress (IP/DNS/IPv6/WebRTC): NOT_TESTED.
