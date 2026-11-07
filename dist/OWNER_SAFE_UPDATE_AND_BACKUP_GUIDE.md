# XPIDER V7 Candidate — Owner-Facing Backup, Update & Rollback Guide (Windows 10)

Status: **CANDIDATE / RELEASE HOLD**. Do not apply to your live installation until the Owner explicitly approves.
Functional source: commit `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93` — 100% byte-identical at the latest documentation/tooling HEAD of branch `candidate/p0-core-regressions-v7`).
Single Handoff Manifest: `dist/OWNER_HANDOFF_MANIFEST_REV14.json`
Extension Runtime Archive (50 extension runtime files ONLY — NOT the complete update kit by itself): `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` — `4,467,833 bytes` — SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
Extension ID (pinned by manifest `key`): `ldlijlaccfeelfdhgnjbibniocefckjj`
Companion UAT Checklist: `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`

---

## 0. Correction to Earlier Guidance
- `"EXPORT OWNER DEBUG BUNDLE"` is **NOT a backup**. Tested result: it is a redacted diagnostic export (not equal to `storage.local`, e.g. Email Collector entries and sensitive fields are omitted/redacted) and the extension has **no restore function**. Do not rely on it for backup/restore.

---

## 1. Single Handoff Set (`dist/OWNER_HANDOFF_MANIFEST_REV14.json`): Extension ZIP vs Host Updater Toolkit

> [!IMPORTANT]
> **Why the Extension ZIP (`dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`, SHA-256 `b3f39bec...`) is NOT the complete update kit by itself:**
> - `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` contains **only the 50 Chrome MV3 extension runtime files** (`manifest.json`, `background.js`, `popup.js`, `content-script.js`, `modules/*`, etc. from `extension/`, tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`).
> - The transactional updater, dry-run preflight (`preflight-uat`), in-memory backup verifier (`verify-storage-backup`), and UAT isolation auditor (`scripts/xpider_safe_update.js`), file manifests (`dist/PACKAGE_INVENTORY_SHA256.json`, `dist/rc11_baseline_manifest.json`), localhost fixture/sink server (`owner-extension-test-site/server.js`), and guides (`dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`, `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`) are **host-side support files delivered outside the extension ZIP** (and indexed in `dist/OWNER_HANDOFF_MANIFEST_REV14.json`) so they never pollute the browser extension directory.

### Complete Single Handoff Set (`dist/OWNER_HANDOFF_MANIFEST_REV14.json` on Branch `candidate/p0-core-regressions-v7`)
| Resource Role | Repository Path | Direct Raw URL (`https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/...`) |
| :--- | :--- | :--- |
| **Consolidated Handoff Manifest (REV14)** | `dist/OWNER_HANDOFF_MANIFEST_REV14.json` | `.../dist/OWNER_HANDOFF_MANIFEST_REV14.json` |
| **Extension Runtime Archive (50 runtime files ONLY)** | `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` | `.../dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`4,467,833 B`, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`) |
| **Transactional Updater, Preflight, Backup & UAT Auditor CLI** | `scripts/xpider_safe_update.js` | `.../scripts/xpider_safe_update.js` |
| **50-File Candidate SHA-256 Inventory** | `dist/PACKAGE_INVENTORY_SHA256.json` | `.../dist/PACKAGE_INVENTORY_SHA256.json` |
| **Frozen RC11 Baseline Manifest** | `dist/rc11_baseline_manifest.json` | `.../dist/rc11_baseline_manifest.json` |
| **Windows 10 Owner UAT Checklist (Synthetic-Only)** | `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` | `.../dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` |
| **Owner Safe Update & Backup Guide** | `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md` | `.../dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md` |
| **Local Fixture (`127.0.0.1:8088`) & Fail-Closed Sink Proxy (`127.0.0.1:8090`)** | `owner-extension-test-site/server.js` (+ 4 HTML fixtures) | `.../owner-extension-test-site/server.js` |
| **Network-Isolated UAT & Synthetic Profile Preflight Harness** | `test/run_uat_synthetic_profile_isolation_check.js` (+ `test/lib/browser_cdp.js`) | `.../test/run_uat_synthetic_profile_isolation_check.js` |

### Operator Environment Capability: With Node.js (`>= 18`) vs Without Node.js
- **With Node.js (`>= 18`)**: Full support for `preflight-uat` (read-only dry-run preflight), `backup-storage` (AES-256-GCM encrypted `.xpider-enc`), `verify-storage-backup` (in-memory verification, `writtenToDisk: false`), `plan` / `apply` / `rollback` / `recover`, and `owner-extension-test-site/server.js` (`127.0.0.1:8088` fixtures + `127.0.0.1:8090` fail-closed sink proxy).
- **Without Node.js (PowerShell 5.1 Only)**:
  1. You **can** verify the extension ZIP SHA-256 (`Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256`),
  2. You **can** manually back up your profile's `Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` folder and your unpacked extension folder via `Copy-Item` while Chrome is completely closed, and extract `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`Expand-Archive`) into a disposable folder for static popup UI inspection,
  3. You **CANNOT** run the localhost fixture server (`127.0.0.1:8088`), the fail-closed sink proxy (`127.0.0.1:8090`), `preflight-uat`, encrypted `.xpider-enc` backups, or the journaled transactional updater — **Phase B campaign UAT is `BLOCKED` without Node.js (`>= 18`)**.

### Mandatory Preflight Steps Before Touching Anything
1. **Verify Exact Extension ZIP SHA-256 on Windows PowerShell before doing anything else**:
   ```powershell
   Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256
   ```
   Must output: `B3F39BEC4AB0711BBE348614BE6BBD1F8D0657987059EC7CD3538565C2C0227E` (`4,467,833 bytes`). If it does not match, **STOP**.
2. **Run Executable Read-Only Dry-Run Preflight (`preflight-uat`)**:
   Requires explicit `--target` and `--profile-dir` (never guessed; fails closed with `MISSING_EXPLICIT_PATH` if omitted) and modifies zero files (`modifiedTarget: false`, `modifiedProfile: false`):
   ```powershell
   node scripts\xpider_safe_update.js preflight-uat --target "C:\path\to\your\xpider" --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default"
   ```
   Checks Node `>= 18`, archive SHA-256, 50-file inventory, baseline manifest, extension ID (`ldlijlaccfeelfdhgnjbibniocefckjj`), symlink/overlap safety, local sink status (`127.0.0.1:8088` / `127.0.0.1:8090`), and OS firewall privilege status (`osFirewallIsolationStatus: "BLOCKED_NO_SAFE_ELEVATED_TEST_VM"` when run without a safe elevated test VM).
3. **Mandatory UAT Network Isolation Gate & Scope Qualification (`BLOCKED` -> `STOP` Rule)**:
   - `--host-resolver-rules` alone is **NOT** a verified network egress firewall (literal IPv4/IPv6 URLs, redirects, or proxy paths can bypass hostname mapping).
   - Disposable UAT in `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` (Phase B) **must** only be executed behind the verified local fail-closed sink proxy (`127.0.0.1:8090`) started by `node owner-extension-test-site\server.js` and verified **before** browser start via:
     ```powershell
     node scripts\xpider_safe_update.js verify-uat-firewall --fixture-port 8088 --sink-port 8090
     ```
   - Launch UAT Chrome with `--proxy-server="127.0.0.1:8090" --proxy-bypass-list="127.0.0.1:8088;localhost:8088;[::1]:8088" --disable-quic --host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost"`, localhost-only URLs (`http://127.0.0.1:8088/*`), explicit no external proxy setting, no saved production data, and no auto-start.
   - **Scope Qualification (Local Sink Proxy vs Host OS Firewall)**: The local sink proxy (`127.0.0.1:8090`) + browser proxy/DNR/CDP controls verify that zero requests are forwarded through the configured browser sink path (`transmittedViaSinkProxy === 0`), but **do not by themselves guarantee host-wide `"zero external network traffic"`** against out-of-band processes, proxy-bypass direct sockets, or raw OS UDP sockets. Process/OS-level default-deny (`Windows Defender Firewall` outbound block rule on a disposable test `chrome.exe` binary or isolated VM) requires Administrator elevation and is `BLOCKED` (`BLOCKED_NO_SAFE_ELEVATED_TEST_VM`) in unprivileged developer runs.
   - **If required network isolation is unavailable or fails preflight on Windows 10, the UAT step is `BLOCKED` and the Owner must `STOP` immediately rather than claiming "fully isolated" or fail-closed.**
4. **Note on Secret Audit Scope**: `scripts/audit_public_repo_and_zip_secrets.js` (`dist/report_public_repo_secret_audit.json`) reported `ALL_CLEAN` across tracked files and the 50 candidate files, but automated pattern scanning has finite coverage and is not a proof of absence of secrets. Never commit or upload raw profile folders, `.xpider-enc` backups, or passphrases.

---

## 2. Verified Storage Backup, In-Memory Verification & Recovery-Only Restore (Browser Fully Closed)
Tested and verified on both **Google Chrome `157.0.8103.38`** (`dist/report_chrome_migration_parity.json`, 37/37 PASS; `dist/report_uat_synthetic_profile_isolation.json`, 19/19 PASS) and **Microsoft Edge `146.0.3856.59`**. The extension uses `chrome.storage.local` only (verified: zero extension IndexedDB directories on disk).

> [!CAUTION]
> **Real Backups Are Offline & Recovery-Only (`REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN`)**: Never restore your real profile backup (`pre_v7.xpider-enc`) into a disposable UAT test browser. `restore-storage` automatically refuses to restore into any UAT profile directory (`REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN`) unless `--allow-synthetic-uat-restore` is explicitly passed for a verified synthetic UAT archive.

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
   - Wrong passphrase, mismatched extension ID, UAT target path (`REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN`), path traversal, or 1-byte tampering fails closed before touching your profile.
   - If a prior restore was interrupted between folder rename steps (`.pre-restore-bak`), the next run automatically recovers `.pre-restore-bak` before proceeding so pre-restore data is never lost.

### Option B (Manual Offline Folder Copy Fallback — Works Without Node.js)
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

## 5. Consolidated Owner Acceptance Matrix (`DEV_PASS` vs `INDEPENDENT_NOT_RUN` vs `BLOCKED` vs `OWNER_ACTION_REQUIRED`)
See `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` (Phase C) for the full 10-gate table:
- **`DEV_PASS`**:
  1. Frozen 50-file candidate runtime ZIP (`b3f39bec...`) + `dist/OWNER_HANDOFF_MANIFEST_REV14.json` integrity,
  2. Chrome `157.0.8103.38` (`37/37`) + Edge `146.0.3856.59` (`37/37`) migration/backup/restore parity,
  3. Chrome `157.0.8103.38` (`18/18`) UI/3-mode/reset/CSV/consent suite,
  4. Transactional updater (`57/57`) fault-injection/rollback suite,
  5. Browser-sink network isolation (`127.0.0.1:8090`), `--disable-quic`, DNR & `preflight-uat` (`19/19`, `transmittedViaSinkProxy: 0`).
- **`BLOCKED`**:
  6. Host OS / kernel default-deny firewall policy (`netsh advfirewall`) on disposable test Chrome / VM (`BLOCKED_NO_SAFE_ELEVATED_TEST_VM` in non-elevated session).
- **`OWNER_ACTION_REQUIRED` / `INDEPENDENT_NOT_RUN`**:
  7. Live Owner Windows 10 desktop manual smoke (`OWNER_ACTION_REQUIRED` / `INDEPENDENT_NOT_RUN`),
  8. Real external NopeCHA extension live cross-extension DOM solving (`INDEPENDENT_NOT_RUN` / `OWNER_ACTION_REQUIRED`),
  9. Authorized live DigitalOcean / Decodo relay egress (exit IP, DNS, IPv6, WebRTC stun/turn) (`INDEPENDENT_NOT_RUN` / `OWNER_ACTION_REQUIRED`),
  10. Owner final release / live update approval (`OWNER_ACTION_REQUIRED`).
