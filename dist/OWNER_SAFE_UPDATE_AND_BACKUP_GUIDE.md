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

## 1. Frozen Candidate Fingerprint & Important Distinction: Extension ZIP vs Host Updater Toolkit

> [!IMPORTANT]
> **Why the Extension ZIP SHA-256 (`b3f39bec...`) is unchanged while `scripts/xpider_safe_update.js` was updated:**
> - `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` contains **only the 50 Chrome MV3 extension runtime files** (`manifest.json`, `background.js`, `popup.js`, `content-script.js`, `modules/*`, etc. from `extension/`, tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`).
> - The transactional updater and encrypted storage backup CLI (`scripts/xpider_safe_update.js`), file manifests (`dist/PACKAGE_INVENTORY_SHA256.json`, `dist/rc11_baseline_manifest.json`), and guides (`dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`, `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`) are **host-side support files delivered outside the extension ZIP** so they never pollute the browser extension directory.

### Direct Download Table (All Resources Accessible on Branch `candidate/p0-core-regressions-v7`)
| Resource Role | Repository Path | Direct Raw URL (`https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/...`) |
| :--- | :--- | :--- |
| **Extension Runtime Archive (50 files)** | `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` | `.../dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`4,467,833 B`, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`) |
| **Transactional Updater & Encrypted Backup CLI** | `scripts/xpider_safe_update.js` | `.../scripts/xpider_safe_update.js` |
| **50-File Candidate SHA-256 Inventory** | `dist/PACKAGE_INVENTORY_SHA256.json` | `.../dist/PACKAGE_INVENTORY_SHA256.json` |
| **Frozen RC11 Baseline Manifest** | `dist/rc11_baseline_manifest.json` | `.../dist/rc11_baseline_manifest.json` |
| **Windows 10 Owner UAT Checklist** | `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` | `.../dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` |

1. **Verify Exact Extension ZIP SHA-256 on Windows PowerShell before doing anything else**:
   ```powershell
   Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256
   ```
   Must output: `B3F39BEC4AB0711BBE348614BE6BBD1F8D0657987059EC7CD3538565c2c0227e` (case-insensitive, `4,467,833 bytes`). If it does not match, **STOP**.
2. **Note on Secret Audit Scope**: `scripts/audit_public_repo_and_zip_secrets.js` (`dist/report_public_repo_secret_audit.json`) reported `ALL_CLEAN` across tracked files and the 50 candidate files, but automated pattern scanning has finite coverage and is not a proof of absence of secrets. Never commit or upload raw profile folders, `.xpider-enc` backups, or passphrases.

---

## 2. Verified Storage Backup & Restore (Run BEFORE Updating, Browser Fully Closed)
Tested and verified on both **Google Chrome `157.0.8103.38`** (`dist/report_chrome_migration_parity.json`, 37/37 PASS) and **Microsoft Edge `146.0.3856.59`**. The extension uses `chrome.storage.local` only (verified: zero extension IndexedDB directories on disk).

### Option A (Recommended): Local Passphrase-Encrypted Storage Backup (`aes-256-gcm` + `scrypt`)
Produces a single authenticated encrypted file (`.xpider-enc`) with SHA-256 manifest verification so proxy credentials and collected emails are never stored in plaintext in the backup file.
1. **Close ALL Chrome/Edge windows completely** (the tool probes every LevelDB file in `Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` and fails closed with `BROWSER_RUNNING_LOCK_HELD` if Chrome/Edge or another process holds any lock).
2. **Create Encrypted Backup** (passphrase stays in your local PowerShell session; `--out` must be outside the profile storage directory):
   ```powershell
   $env:XPIDER_BACKUP_PASS = "Your-Strong-Local-Passphrase-Here"
   node scripts\xpider_safe_update.js backup-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --out "D:\xpider_private_backups\storage_backup.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
3. **Verified Atomic Restore** (if ever needed, with Chrome closed):
   ```powershell
   $env:XPIDER_BACKUP_PASS = "Your-Strong-Local-Passphrase-Here"
   node scripts\xpider_safe_update.js restore-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --in "D:\xpider_private_backups\storage_backup.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   - Wrong passphrase, mismatched extension ID, path traversal, or 1-byte tampering fails closed (`WRONG_PASSPHRASE_OR_CORRUPT_BACKUP` / `BACKUP_ID_MISMATCH` / `UNSAFE_JOURNAL_PATH`) in a temporary staging folder before touching your profile.
   - If a prior restore was interrupted between folder rename steps (`.pre-restore-bak`), the next run automatically recovers `.pre-restore-bak` before proceeding so pre-restore data is never lost.

### Option B (Manual Offline Folder Copy Fallback)
1. Close ALL Chrome/Edge windows completely.
2. Copy `%LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` (or Edge `%LOCALAPPDATA%\Microsoft\Edge\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj`) to a private offline folder outside the repository.
3. **Privacy Warning**: Raw `Local Extension Settings` contains plaintext `storage.local` data (including proxy credentials and collected emails). Keep it strictly offline and never upload it.

---

## 3. Transactional Code Update (`plan` Preview First, Then Separate `apply` Approval)
Requires Node.js 18+ on the PC.
1. **Dry-Run Plan (Read-Only)**:
   ```powershell
   node scripts\xpider_safe_update.js plan --target "C:\path\to\your\xpider" --archive .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json
   ```
   Changes nothing on disk; prints exact files to add/replace/remove, any preserved unknown user files, and a `PLAN_TOKEN`.
2. **Apply (Only After Owner Reviews Plan)**:
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
- Then click **Reload** (`⟳`) in `chrome://extensions`. Verified on Google Chrome `157.0.8103.38`: rolling back from V7 candidate to RC11 keeps all `storage.local` keys (`xpider_schema_version: 2`, `HistorySkip` suppression, paused checkpoints, templates, CSV queues) 100% intact and compatible.

---

## 5. Verified Destructive Edge-Case Safeguards (`56/56 PASS` in `test/run_safe_update_transaction_tests.js`)
| Edge Case | Enforced Behavior in `scripts/xpider_safe_update.js` |
| :--- | :--- |
| **Browser still open or any LevelDB file locked during storage backup/restore** | Probes `r+` open + rename across every file in `Local Extension Settings\<id>`; fails closed with `BROWSER_RUNNING_LOCK_HELD` before reading or writing. |
| **Symlink/junction on profile path, `Local Extension Settings\<id>`, or inside storage/target** | Refused on both `backup-storage`/`restore-storage` and `plan`/`apply`/`rollback` (`SYMLINK_FOUND`). |
| **`--backup-root` or `--out`/`--in` overlaps target/storage directory** (same path, inside, parent, case alias, or Windows junction) | Canonical `fs.realpathSync.native` + lowercase check rejects with `BACKUP_OVERLAPS_TARGET` before touching disk. |
| **Path traversal, extra unmanifested file keys, or duplicate case-colliding paths in decrypted backup** | Validated in memory/staging (`UNSAFE_JOURNAL_PATH`, `MANIFEST_FILES_MISMATCH`, `DUPLICATE_MANIFEST_PATH`) before touching profile. |
| **Invalid/traversal `--ext-id` or mismatched inner `plain.extId` / `env.extId`** | Enforces `/^[a-p]{32}$/` (`INVALID_EXT_ID`) and exact match (`BACKUP_ID_MISMATCH`). |
| **Interrupted storage restore between folder rename steps (`lesDir -> .pre-restore-bak`)** | `recoverInterruptedStorageRestore` automatically restores `.pre-restore-bak -> lesDir` before any new attempt so pre-restore data is never deleted on retry failure. |
| **`rollback` / `recover` pointed at wrong `--target` or tampered backup/journal** | Verifies `canonKey(journal.target) === canonKey(target)` (`ROLLBACK_TARGET_MISMATCH`), full `backupManifest` SHA-256 (`BACKUP_INTEGRITY_FAILED`), relative path safety (`UNSAFE_JOURNAL_PATH`), and manifest key/ID before modifying a single byte. |
| **Concurrent `apply` while an update/rollback is unfinished** | `.xpider-update.lock` + unfinished journal blocks concurrent `apply` (`UPDATE_IN_PROGRESS`) until `recover` completes. |
| **Power loss mid-write (`.xpider-new` left on disk) or mid-commit** | Every `.xpider-new` temp file is cleaned up and `recover` restores the exact pre-update tree byte-for-byte. |
| **Non-empty modified legacy file (`privacy-content.js`) or unknown user file** | Classified as `preserveUnknown` (never deleted); reported in `plan`, `apply`, and `rollback`. |
| **Disk full (`ENOSPC`) or AV/read-only file lock (`EBUSY` / `EPERM`) during commit** | Automatically triggers `doRollback()` from verified backup, leaving the original installation byte-identical. |

---

## 6. Remaining Untested / External Boundary Items
- **Verified in Google Chrome `157.0.8103.38` on Windows 11 host**: Same-ID migration, encrypted backup/restore, rollback, interrupted update recovery (`37/37 PASS`), and UI/reset/CSV import/Email Collector/no-message/consent boundary regressions (`18/18 PASS`).
- **Still `NOT_TESTED / UNKNOWN`**:
  1. Live Owner Windows 10 desktop manual smoke (`NOT_TESTED` — requires Owner machine; see `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`).
  2. Real external NopeCHA extension live cross-extension solver interaction (`NOT_TESTED` — external extension boundary).
  3. Live Decodo / DigitalOcean VPN/Proxy egress (IP / DNS / IPv6 / WebRTC leak verification) (`UNKNOWN` — external network/hardware boundary).
