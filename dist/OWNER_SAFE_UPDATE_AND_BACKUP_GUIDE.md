# XPIDER V7 Candidate — Owner-Facing Backup, Update & Rollback Guide (Windows 10)

Status: **CANDIDATE / RELEASE HOLD**. Do not apply to your live installation until the Owner explicitly approves.
Functional source: commit `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93` — 100% byte-identical at the latest documentation/tooling HEAD of branch `candidate/p0-core-regressions-v7`).
Extension Archive (50 extension runtime files ONLY): `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` — `4,467,833 bytes` — SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
Extension ID (pinned by manifest `key`): `ldlijlaccfeelfdhgnjbibniocefckjj`
Companion UAT Checklist: `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`

---

## 0. Correction to Earlier Guidance
- `"EXPORT OWNER DEBUG BUNDLE"` is **NOT a backup**. Tested result: it is a redacted diagnostic export (not equal to `storage.local`, e.g. Email Collector entries and sensitive fields are omitted/redacted) and the extension has **no restore function**. Do not rely on it for backup/restore.

---

## 1. Single Handoff Set: Frozen Candidate Fingerprint & Extension ZIP vs Host Updater Toolkit

> [!IMPORTANT]
> **Why the Extension ZIP SHA-256 (`b3f39bec...`) contains only runtime files while `scripts/xpider_safe_update.js` is separate:**
> - `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` contains **only the 50 Chrome MV3 extension runtime files** (`manifest.json`, `background.js`, `popup.js`, `content-script.js`, `modules/*`, etc. from `extension/`, tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`).
> - The transactional updater, in-memory backup verifier, and UAT isolation auditor (`scripts/xpider_safe_update.js`), file manifests (`dist/PACKAGE_INVENTORY_SHA256.json`, `dist/rc11_baseline_manifest.json`), and guides (`dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`, `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`) are **host-side support files delivered outside the extension ZIP** so they never pollute the browser extension directory.

### Complete Single Handoff Set (All Resources on Branch `candidate/p0-core-regressions-v7`)
| Resource Role | Repository Path | Direct Raw URL (`https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/...`) |
| :--- | :--- | :--- |
| **Extension Runtime Archive (50 files)** | `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` | `.../dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`4,467,833 B`, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`) |
| **Transactional Updater, Backup & UAT Auditor CLI** | `scripts/xpider_safe_update.js` | `.../scripts/xpider_safe_update.js` |
| **50-File Candidate SHA-256 Inventory** | `dist/PACKAGE_INVENTORY_SHA256.json` | `.../dist/PACKAGE_INVENTORY_SHA256.json` |
| **Frozen RC11 Baseline Manifest** | `dist/rc11_baseline_manifest.json` | `.../dist/rc11_baseline_manifest.json` |
| **Windows 10 Owner UAT Checklist (Network-Isolated & Synthetic-Only)** | `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` | `.../dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` |
| **Network-Isolated UAT & Synthetic Profile Preflight Harness** | `test/run_uat_synthetic_profile_isolation_check.js` | `.../test/run_uat_synthetic_profile_isolation_check.js` |
| **Local Fixture (`127.0.0.1:8088`) & Fail-Closed Sink Firewall (`127.0.0.1:8090`)** | `owner-extension-test-site/server.js` | `.../owner-extension-test-site/server.js` |

1. **Verify Exact Extension ZIP SHA-256 on Windows PowerShell before doing anything else**:
   ```powershell
   Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256
   ```
   Must output: `B3F39BEC4AB0711BBE348614BE6BBD1F8D0657987059EC7CD3538565C2C0227E` (`4,467,833 bytes`). If it does not match, **STOP**.
2. **Mandatory UAT Network Isolation Gate & Scope Qualification (`BLOCKED` -> `STOP` Rule)**:
   - `--host-resolver-rules` alone is **NOT** a verified network egress firewall (literal IPv4/IPv6 URLs, redirects, or proxy paths can bypass hostname mapping).
   - Disposable UAT in `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` (Phase B) **must** only be executed behind the verified local fail-closed sink proxy (`127.0.0.1:8090`) started by `node owner-extension-test-site\server.js` and verified **before** browser start via:
     ```powershell
     node scripts\xpider_safe_update.js verify-uat-firewall --fixture-port 8088 --sink-port 8090
     ```
   - Launch UAT Chrome with `--proxy-server="127.0.0.1:8090" --proxy-bypass-list="127.0.0.1:8088;localhost:8088;[::1]:8088" --disable-quic --host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost"`, localhost-only URLs (`http://127.0.0.1:8088/*`), explicit no external proxy setting, no saved production data, and no auto-start.
   - **Scope Qualification (Local Sink Proxy vs Host OS Firewall)**: The local sink proxy (`127.0.0.1:8090`) + browser proxy/DNR/CDP controls verify that zero requests are forwarded through the configured browser sink path (`transmittedViaSinkProxy === 0`), but **do not by themselves guarantee host-wide `"zero external network traffic"`** against out-of-band processes, proxy-bypass direct sockets, or raw OS UDP sockets. Process/OS-level default-deny (`Windows Defender Firewall` outbound block rule on a disposable test `chrome.exe` binary or isolated VM) requires Administrator elevation and is `BLOCKED / NOT_TESTED` in unprivileged developer runs.
   - **If required network isolation is unavailable or fails preflight on Windows 10, the UAT step is `BLOCKED` and the Owner must `STOP` immediately rather than claiming "fully isolated" or fail-closed.**
3. **Note on Secret Audit Scope**: `scripts/audit_public_repo_and_zip_secrets.js` (`dist/report_public_repo_secret_audit.json`) reported `ALL_CLEAN` across tracked files and the 50 candidate files, but automated pattern scanning has finite coverage and is not a proof of absence of secrets. Never commit or upload raw profile folders, `.xpider-enc` backups, or passphrases.

---

## 2. Verified Storage Backup, In-Memory Verification & Recovery-Only Restore (Browser Fully Closed)
Tested and verified on both **Google Chrome `157.0.8103.38`** (`dist/report_chrome_migration_parity.json`, 37/37 PASS; `dist/report_uat_synthetic_profile_isolation.json`, 10/10 PASS) and **Microsoft Edge `146.0.3856.59`**. The extension uses `chrome.storage.local` only (verified: zero extension IndexedDB directories on disk).

> [!CAUTION]
> **Real Backups Are Offline & Recovery-Only**: Never restore your real profile backup (`pre_v7.xpider-enc`) into a disposable UAT test browser. Disposable UAT must use an isolated clean profile with synthetic localhost-only (`127.0.0.1:8088`) fixtures (`dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` Phase B).

### Option A (Recommended): Local Passphrase-Encrypted Storage Backup (`aes-256-gcm` + `scrypt`)
1. **Close ALL Chrome/Edge windows completely** (the tool probes every LevelDB file in `Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` and fails closed with `BROWSER_RUNNING_LOCK_HELD` if Chrome/Edge or another process holds any lock).
2. **Create Offline Encrypted Backup** (passphrase stays in your local PowerShell session; `--out` must be outside the profile storage directory):
   ```powershell
   $env:XPIDER_BACKUP_PASS = "Your-Strong-Local-Passphrase-Here"
   node scripts\xpider_safe_update.js backup-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --out "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
3. **Verify Archive Integrity In-Memory (Writes 0 Bytes to Disk)**:
   ```powershell
   node scripts\xpider_safe_update.js verify-storage-backup --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   Verifies the AES-256-GCM authentication tag, `manifestSha256`, and every LevelDB file hash strictly in memory (`"writtenToDisk": false`, `"decryptedFilesWritten": 0`) and zeroes the buffer immediately without extracting personal data to any folder.
4. **Recovery-Only Atomic Restore** (ONLY if emergency recovery of your real profile is ever needed, with Chrome closed and explicit Owner approval):
   ```powershell
   node scripts\xpider_safe_update.js restore-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   - Wrong passphrase, mismatched extension ID, path traversal, or 1-byte tampering fails closed (`WRONG_PASSPHRASE_OR_CORRUPT_BACKUP` / `BACKUP_ID_MISMATCH` / `UNSAFE_JOURNAL_PATH`) before touching your profile.
   - If a prior restore was interrupted between folder rename steps (`.pre-restore-bak`), the next run automatically recovers `.pre-restore-bak` before proceeding so pre-restore data is never lost.

### Option B (Manual Offline Folder Copy Fallback)
1. Close ALL Chrome/Edge windows completely.
2. Copy `%LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` to a private offline folder outside the repository (recovery-only; never load into UAT).
3. **Privacy Warning**: Raw `Local Extension Settings` contains plaintext `storage.local` data (including proxy credentials and collected emails). Keep it strictly offline and never upload it.

---

## 3. Transactional Code Update (`plan` Preview First, Then Separate `apply` Approval)
Requires Node.js 18+ on the PC.
1. **Dry-Run Plan (Read-Only)**:
   ```powershell
   node scripts\xpider_safe_update.js plan --target "C:\path\to\your\xpider" --archive .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json
   ```
   Changes nothing on disk; prints exact files to add/replace/remove, any preserved unknown user files, and a `PLAN_TOKEN`.
2. **Apply (Only After Owner Reviews Plan & Completes Synthetic UAT)**:
   ```powershell
   node scripts\xpider_safe_update.js apply --target "C:\path\to\your\xpider" --archive .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json --backup-root "D:\xpider_update_backup_1" --approve <PLAN_TOKEN>
   ```
   **Note**: `--backup-root` must be a **separate** directory outside `--target` (the updater resolves Windows canonical realpaths/junctions and rejects any overlapping or nested `--backup-root`).
3. **Reload in Browser**:
   Open `chrome://extensions` and click **Reload** (`⟳`) on XPIDER. **Never click Remove** (clicking Remove deletes `storage.local`). Nothing auto-starts on reload.

---

## 4. Rollback & Crash Recovery
- **Rollback to Exact Pre-Update Code**:
  ```powershell
  node scripts\xpider_safe_update.js rollback --target "C:\path\to\your\xpider" --backup-root "D:\xpider_update_backup_1"
  ```
- **Recover From Interrupted Update / Power Loss**:
  ```powershell
  node scripts\xpider_safe_update.js recover --target "C:\path\to\your\xpider" --backup-root "D:\xpider_update_backup_1"
  ```
- Then click **Reload** (`⟳`) in `chrome://extensions`.

---

## 5. Remaining Untested / External Boundary Items
- **Still `NOT_TESTED / UNKNOWN`**:
  1. Live Owner Windows 10 desktop manual smoke (`NOT_TESTED` — requires Owner machine; see `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`).
  2. Real external NopeCHA extension live cross-extension solver interaction (`NOT_TESTED` — external extension boundary).
  3. Live Decodo / DigitalOcean VPN/Proxy egress (IP / DNS / IPv6 / WebRTC leak verification) (`UNKNOWN` — external network/hardware boundary).
