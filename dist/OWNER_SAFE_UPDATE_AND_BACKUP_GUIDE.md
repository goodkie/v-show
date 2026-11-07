# XPIDER V7 Candidate — Owner-Facing Backup, Update & Rollback Guide (Windows 10)

Status: **CANDIDATE / RELEASE HOLD**. Do not apply to your live installation until the Owner explicitly approves.
Functional source: commit `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree is 100% byte-identical at the latest documentation/tooling HEAD of branch `candidate/p0-core-regressions-v7`).
Archive: `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` — `4,467,833 bytes` — SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
Extension ID (pinned by manifest `key`): `ldlijlaccfeelfdhgnjbibniocefckjj`

---

## 0. Correction to Earlier Guidance
- `"EXPORT OWNER DEBUG BUNDLE"` is **NOT a backup**. Tested result: it is a redacted diagnostic export (not equal to `storage.local`, e.g. Email Collector entries and sensitive fields are omitted/redacted) and the extension has **no restore function**. Do not rely on it for backup/restore.

---

## 1. Where to Get the Candidate Package (Verified & Audited)
The repository `goodkie/v-show` is currently **PUBLIC**. A deep content-level secret audit (`scripts/audit_public_repo_and_zip_secrets.js` -> `dist/report_public_repo_secret_audit.json`) scanned all `1,362` tracked files (`932` text files) and all `50` files in `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`: **0 private keys, 0 tokens, 0 live credentials, and 0 private workspace artifacts (`ALL_CLEAN`)**.

1. **Direct Anonymous Download URL (Verified HTTP 200)**:
   `https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
2. **Verify Exact SHA-256 on Windows PowerShell before doing anything else**:
   ```powershell
   Get-FileHash .\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256
   ```
   Must output: `B3F39BEC4AB0711BBE348614BE6BBD1F8D0657987059EC7CD3538565C2C0227E` (`4,467,833 bytes`). If it does not match, **STOP**.
3. **Reproducible Source Fallback**:
   `git checkout candidate/p0-core-regressions-v7` then `node scripts/package_owner_safe_candidate_v7.js` (PowerShell `Compress-Archive` embeds current timestamps, so verify the **50 per-file SHA-256 hashes** in `dist/PACKAGE_INVENTORY_SHA256.json`).

---

## 2. Verified Storage Backup & Restore (Run BEFORE Updating, Browser Fully Closed)
Tested and verified on both **Google Chrome `157.0.8103.38`** (`dist/report_chrome_migration_parity.json`, 37/37 PASS) and **Microsoft Edge `146.0.3856.59`**. The extension uses `chrome.storage.local` only (verified: zero extension IndexedDB directories on disk).

### Option A (Recommended): Local Passphrase-Encrypted Storage Backup (`aes-256-gcm` + `scrypt`)
Produces a single authenticated encrypted file (`.xpider-enc`) with SHA-256 manifest verification so proxy credentials and collected emails are never stored in plaintext in the backup file.
1. **Close ALL Chrome/Edge windows completely** (verify no `chrome.exe` / `msedge.exe` holds the LevelDB `LOCK` — the tool checks `LOCK` and fails closed with `BROWSER_RUNNING_LOCK_HELD` if the browser is still open).
2. **Create Encrypted Backup** (passphrase stays in your local PowerShell session; **never** paste passphrases or backup files into GitHub/chat):
   ```powershell
   $env:XPIDER_BACKUP_PASS = "Your-Strong-Local-Passphrase-Here"
   node scripts\xpider_safe_update.js backup-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --out "D:\xpider_private_backups\storage_backup.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
3. **Verified Atomic Restore** (if ever needed, with Chrome closed):
   ```powershell
   $env:XPIDER_BACKUP_PASS = "Your-Strong-Local-Passphrase-Here"
   node scripts\xpider_safe_update.js restore-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --in "D:\xpider_private_backups\storage_backup.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   - Wrong passphrase or 1-byte tampering fails closed (`WRONG_PASSPHRASE_OR_CORRUPT_BACKUP`) in a temporary staging folder before touching your profile.

### Option B (Manual Offline Folder Copy Fallback)
1. Close ALL Chrome/Edge windows completely.
2. Copy `%LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` (or Edge `%LOCALAPPDATA%\Microsoft\Edge\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj`) to a private offline folder outside the repository.
3. **Privacy Warning**: Raw `Local Extension Settings` contains plaintext `storage.local` data (including proxy credentials and collected emails). Keep it strictly offline and never upload it.

---

## 3. Transactional Code Update (`plan` Preview First, Then Separate `apply` Approval)
Requires Node.js 18+ on the PC.
1. **Dry-Run Plan (Read-Only)**:
   ```powershell
   node scripts\xpider_safe_update.js plan --target "C:\path\to\your\xpider" --archive .\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json
   ```
   Changes nothing on disk; prints exact files to add/replace/remove, any preserved unknown user files, and a `PLAN_TOKEN`.
2. **Apply (Only After Owner Reviews Plan)**:
   ```powershell
   node scripts\xpider_safe_update.js apply --target "C:\path\to\your\xpider" --archive .\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json --backup-root "D:\xpider_update_backup_1" --approve <PLAN_TOKEN>
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
- Then click **Reload** (`⟳`) in `chrome://extensions`. Verified on Google Chrome `157.0.8103.38`: rolling back from V7 candidate to RC11 keeps all `storage.local` keys (`xpider_schema_version: 2`, `HistorySkip` suppression, paused checkpoints, templates, CSV queues) 100% intact and compatible.

---

## 5. Verified Destructive Edge-Case Safeguards (`48/48 PASS` in `test/run_safe_update_transaction_tests.js`)
| Edge Case | Enforced Behavior in `scripts/xpider_safe_update.js` |
| :--- | :--- |
| **Browser still open during storage backup/restore** | Probes LevelDB `LOCK` file; fails closed with `BROWSER_RUNNING_LOCK_HELD` before reading or writing. |
| **`--backup-root` overlaps `--target`** (same path, inside target, parent of target, case alias, or Windows junction) | Canonical `fs.realpathSync.native` + lowercase check rejects with `BACKUP_OVERLAPS_TARGET` before touching disk. |
| **`rollback` / `recover` pointed at wrong `--target` or tampered backup/journal** | Verifies `canonKey(journal.target) === canonKey(target)` (`ROLLBACK_TARGET_MISMATCH`), full `backupManifest` SHA-256 (`BACKUP_INTEGRITY_FAILED`), relative path safety (`UNSAFE_JOURNAL_PATH`), and manifest key/ID before modifying a single byte. |
| **Concurrent `apply` while an update/rollback is unfinished** | `.xpider-update.lock` + unfinished journal blocks concurrent `apply` (`UPDATE_IN_PROGRESS`) until `recover` completes. |
| **Power loss mid-write (`.xpider-new` left on disk) or mid-commit** | Every `.xpider-new` temp file is cleaned up and `recover` restores the exact pre-update tree byte-for-byte. |
| **Non-empty modified legacy file (`privacy-content.js`) or unknown user file** | Classified as `preserveUnknown` (never deleted); reported in `plan`, `apply`, and `rollback`. |
| **Windows junctions / symlinks in target or ZIP traversal** | Rejected during preflight (`SYMLINK_OR_JUNCTION` / `ZIP_PATH_TRAVERSAL`). |
| **Disk full (`ENOSPC`) or AV/read-only file lock (`EBUSY` / `EPERM`) during commit** | Automatically triggers `doRollback()` from verified backup, leaving the original installation byte-identical. |

---

## 6. Remaining Untested / External Boundary Items
- **Verified in Google Chrome `157.0.8103.38` on Windows 11 host**: Same-ID migration, encrypted backup/restore, rollback, interrupted update recovery (`37/37 PASS`), and UI/reset/CSV import/Email Collector/no-message/consent boundary regressions.
- **Still `NOT_TESTED / UNKNOWN`**:
  1. Live Owner Windows 10 desktop manual smoke (`NOT_TESTED` — requires Owner machine).
  2. Real external NopeCHA extension live cross-extension solver interaction (`NOT_TESTED` — external extension boundary).
  3. Live Decodo / DigitalOcean VPN/Proxy egress (IP / DNS / IPv6 / WebRTC leak verification) (`UNKNOWN` — external network/hardware boundary).
