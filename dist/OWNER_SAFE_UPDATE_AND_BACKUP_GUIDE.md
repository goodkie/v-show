# XPIDER V7 Candidate — Owner-Facing Backup, Update & Rollback Guide (Windows 10)

Status: **CANDIDATE / RELEASE HOLD**. Do not apply to your live installation until the Owner explicitly approves.
Functional source: commit `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93` — 100% byte-identical at the latest documentation/tooling HEAD of branch `candidate/p0-core-regressions-v7`).
Single Complete Owner-Usable Handoff Archive (REV15): `dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip` (Direct Raw URL: `https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip`, reproducible via `node scripts\build_owner_complete_handoff_kit.js`)
Single Handoff Manifest: `dist/OWNER_HANDOFF_MANIFEST_REV15.json` (and backward-compatible `dist/OWNER_HANDOFF_MANIFEST_REV14.json`)
Frozen Extension Runtime Archive Inside `dist\` (50 extension runtime files ONLY — NOT the complete handoff kit by itself): `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` — `4,467,833 bytes` — SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
Extension ID (pinned by manifest `key`): `ldlijlaccfeelfdhgnjbibniocefckjj`
Companion UAT Checklist: `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`

---

## 0. Correction to Earlier Guidance
- `"EXPORT OWNER DEBUG BUNDLE"` is **NOT a backup**. Tested result: it is a redacted diagnostic export (not equal to `storage.local`, e.g. Email Collector entries and sensitive fields are omitted/redacted) and the extension has **no restore function**. Do not rely on it for backup/restore.

---

## 1. Single Complete Owner-Usable Handoff Archive (`XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip`) vs Runtime Extension ZIP

> [!IMPORTANT]
> **Why the Runtime Extension ZIP (`dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`, SHA-256 `b3f39bec...`) is NOT the complete handoff kit by itself:**
> - `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` contains **only the 50 Chrome MV3 extension runtime files** (`manifest.json`, `background.js`, `popup.js`, `content-script.js`, `modules/*`, etc. from `extension/`, tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`).
> - To give the Owner **one single complete downloadable archive** that works cleanly from any new extraction directory outside the git repository, `dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip` bundles the untouched frozen runtime ZIP (`dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`) **together with** the standalone updater/backup CLI (`scripts/xpider_safe_update.js`), both SHA-256 inventories (`dist/PACKAGE_INVENTORY_SHA256.json`, `dist/rc11_baseline_manifest.json`), both guides (`dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`, `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`), the localhost fixture + fail-closed sink server (`owner-extension-test-site/server.js` + HTML fixtures), and the automated verification helpers (`test/run_uat_synthetic_profile_isolation_check.js`, `test/run_safe_update_transaction_tests.js`, `test/lib/browser_cdp.js`).

### Unambiguous Extraction Root & Exact File Tree Inside `XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip`
Extract the complete handoff archive into a clean directory (e.g. `D:\xpider_handoff_rev15`) and `Set-Location "D:\xpider_handoff_rev15"`:
```powershell
Expand-Archive -Path ".\XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip" -DestinationPath "D:\xpider_handoff_rev15" -Force
Set-Location "D:\xpider_handoff_rev15"
```
Extracting into `D:\xpider_handoff_rev15` produces this exact relative tree:
- `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (Frozen 50-file runtime extension ZIP, `4,467,833 B`, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`)
- `dist/PACKAGE_INVENTORY_SHA256.json` (50-file candidate SHA-256 inventory)
- `dist/rc11_baseline_manifest.json` (Frozen RC11 baseline manifest)
- `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` (Step-by-step Windows 10 UAT checklist)
- `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md` (This backup, update & rollback guide)
- `dist/OWNER_HANDOFF_MANIFEST_REV15.json` & `dist/OWNER_HANDOFF_MANIFEST_REV14.json` (Complete file/size/SHA-256 manifests)
- `scripts/xpider_safe_update.js` (Standalone transactional updater, `preflight-uat`, encrypted backup/restore & UAT auditor CLI)
- `scripts/build_owner_complete_handoff_kit.js` (Deterministic local assembly script for the complete handoff kit)
- `owner-extension-test-site/server.js` + `contact-standard.html`, `subscribe-no-message.html`, `consent-required-no-message.html`, `contact-success.html`, `index.html` (Localhost `127.0.0.1:8088` fixtures + `127.0.0.1:8090` fail-closed sink proxy)
- `test/run_uat_synthetic_profile_isolation_check.js`, `test/run_safe_update_transaction_tests.js`, `test/lib/browser_cdp.js` (Automated verification harnesses)

### Operator Environment Capability: With Node.js (`>= 18`) vs Without Node.js
- **With Node.js (`>= 18`)**: Full support for `preflight-uat` (read-only dry-run preflight), `backup-storage` (AES-256-GCM encrypted `.xpider-enc`), `verify-storage-backup` (in-memory verification, `writtenToDisk: false`), `plan` / `apply` / `rollback` / `recover`, and `owner-extension-test-site/server.js` (`127.0.0.1:8088` fixtures + `127.0.0.1:8090` fail-closed sink proxy).
- **Without Node.js (PowerShell 5.1 Only)**:
  1. You **can** extract the handoff archive (`Expand-Archive`) and verify the inner runtime ZIP SHA-256 (`Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256`),
  2. You **can** manually back up your profile's `Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` folder and your unpacked extension folder via `Copy-Item` while Chrome is completely closed, and extract `dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` into a disposable folder for static popup UI inspection (never overlay live files without backup + approval),
  3. You **CANNOT** run the localhost fixture server (`127.0.0.1:8088`), the fail-closed sink proxy (`127.0.0.1:8090`), `preflight-uat`, encrypted `.xpider-enc` backups, or the journaled transactional updater — **Phase B campaign UAT is `BLOCKED` without Node.js (`>= 18`)**.

### Mandatory Preflight Steps Before Touching Anything
1. **Verify Exact Runtime Extension ZIP SHA-256 on Windows PowerShell before doing anything else**:
   ```powershell
   Get-FileHash ".\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip" -Algorithm SHA256
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
   - **Scope Qualification (Local Sink Proxy vs Host OS Firewall)**: `0` forwarded requests at the local sink proxy (`transmittedViaSinkProxy === 0`) verifies only that requests routed through the browser's configured proxy/DNR path were denied; **it is NOT proof of total host egress default-deny** against out-of-band processes, proxy-bypass direct sockets, or raw OS UDP sockets. Process/OS-kernel default-deny (`Windows Defender Firewall` outbound block rule on a disposable test `chrome.exe` binary or isolated VM) requires Administrator elevation and remains `BLOCKED` (`BLOCKED_NO_SAFE_ELEVATED_TEST_VM`) in unprivileged runs.
   - **If required network isolation is unavailable or fails preflight on Windows 10, the UAT step is `BLOCKED` and the Owner must `STOP` immediately rather than claiming "fully isolated" or fail-closed.**
4. **Note on Secret Audit Scope**: `scripts/audit_public_repo_and_zip_secrets.js` (`dist/report_public_repo_secret_audit.json`) reported `ALL_CLEAN` across tracked files and the 50 candidate files, but automated pattern scanning has finite coverage and is not a proof of absence of secrets. Never commit or upload raw profile folders, `.xpider-enc` backups, or passphrases.

---

## 2. Verified Storage Backup, In-Memory Verification & Bidirectional Origin-Verified Restore (Browser Fully Closed)
Developer-tested on **Google Chrome `157.0.8103.38`** (`dist/report_chrome_migration_parity.json`, 37/37; `dist/report_uat_synthetic_profile_isolation.json`, 21/21) and **Microsoft Edge `146.0.3856.59`**. The extension uses `chrome.storage.local` only (verified: zero extension IndexedDB directories on disk).

> [!CAUTION]
> **Cryptographic + Content-Inspected Boundary Between Offline Real Backups and Synthetic UAT (`NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE`)**:
> 1. Normal offline backups created without `--synthetic-uat-origin` are stamped inside the AES-256-GCM authenticated payload with `"backupOrigin": "OFFLINE_REAL_RECOVERY_ONLY"`.
> 2. **Passing `--allow-synthetic-uat-restore` CANNOT override a real or unmarked backup into a UAT profile**: `restore-storage` inspects the decrypted `backupOrigin` and raw LevelDB buffers in memory before touching disk, and fails closed with `NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE` / `NON_SYNTHETIC_BACKUP_CONTENT_FORBIDDEN` if the archive was not created with `--synthetic-uat-origin` or contains any non-loopback URL, non-`@uat-local.test` email, or credential marker.
> 3. Conversely, a backup stamped `"backupOrigin": "SYNTHETIC_UAT_ONLY"` is refused by `restore-storage` if pointed at a non-UAT real profile (`SYNTHETIC_BACKUP_RESTORE_INTO_REAL_PROFILE_FORBIDDEN`).

### Option A (Recommended): Local Passphrase-Encrypted Storage Backup (`aes-256-gcm` + `scrypt`)
1. **Close ALL Chrome/Edge windows completely** (the tool probes every LevelDB file in `Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` and fails closed with `BROWSER_RUNNING_LOCK_HELD` if Chrome/Edge or another process holds any lock).
2. **Create Offline Encrypted Real Backup** (passphrase stays in your local PowerShell session; `--out` must be outside the profile storage directory):
   ```powershell
   $env:XPIDER_BACKUP_PASS = "Your-Strong-Local-Passphrase-Here"
   node scripts\xpider_safe_update.js backup-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --out "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   Prints `"result": "BACKUP_ENCRYPTED"`, `"backupOrigin": "OFFLINE_REAL_RECOVERY_ONLY"`.
3. **Verify Archive Integrity In-Memory (Writes 0 Bytes to Disk)**:
   ```powershell
   node scripts\xpider_safe_update.js verify-storage-backup --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   Verifies the AES-256-GCM authentication tag, `backupOrigin`, `manifestSha256`, and every LevelDB file hash strictly in memory (`"writtenToDisk": false`, `"decryptedFilesWritten": 0`) and zeroes the buffer immediately without extracting personal data to any folder.
4. **Recovery-Only Atomic Restore** (ONLY if emergency recovery of your real profile is ever needed, with Chrome closed and explicit Owner approval):
   ```powershell
   node scripts\xpider_safe_update.js restore-storage --profile-dir "$env:LOCALAPPDATA\Google\Chrome\User Data\Default" --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS
   ```
   - Wrong passphrase, mismatched extension ID, UAT target path (`REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN` / `NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE`), path traversal, or 1-byte tampering fails closed before touching your profile.
   - If a prior restore was interrupted between folder rename steps (`.pre-restore-bak`), the next run automatically recovers `.pre-restore-bak` before proceeding so pre-restore data is never lost.

### Option B (Manual Offline Folder Copy Fallback — Works Without Node.js)
1. Close ALL Chrome/Edge windows completely.
2. Copy `%LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Local Extension Settings\ldlijlaccfeelfdhgnjbibniocefckjj` to a private offline folder outside the repository (recovery-only; never load into UAT).
3. **Privacy Warning**: Raw `Local Extension Settings` contains plaintext `storage.local` data (including proxy credentials and collected emails). Keep it strictly offline and never upload it.

---

## 3. Transactional Code Update (`plan` Preview First, Then Separate `apply` Approval)
Requires Node.js 18+ on the PC. **During UAT, run `apply` only on a disposable copy (`D:\xpider_uat_ext`), never on your live installation (`<TARGET_DIR>`) until UAT is complete and approved.**
1. **Dry-Run Plan (Read-Only)**:
   ```powershell
   node scripts\xpider_safe_update.js plan --target "D:\xpider_uat_ext" --archive .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json
   ```
   Changes nothing on disk; prints exact files to add/replace/remove, any preserved unknown user files, and a `PLAN_TOKEN`.
2. **Apply (On Disposable UAT Copy First; Only On Live `<TARGET_DIR>` After Offline Backup + Separate Owner Approval)**:
   ```powershell
   node scripts\xpider_safe_update.js apply --target "D:\xpider_uat_ext" --archive .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json --backup-root "D:\xpider_uat_code_bk" --approve <PLAN_TOKEN>
   ```
   **Note**: `--backup-root` must be a **separate** directory outside `--target` (the updater resolves Windows canonical realpaths/junctions and rejects any overlapping or nested `--backup-root`).
3. **Reload in Browser**:
   Open `chrome://extensions` and click **Reload** (`⟳`) on XPIDER. **Never click Remove** (clicking Remove deletes `storage.local`). Nothing auto-starts on reload.

---

## 4. Rollback & Crash Recovery
- **Rollback to Exact Pre-Update Code**:
  ```powershell
  node scripts\xpider_safe_update.js rollback --target "D:\xpider_uat_ext" --backup-root "D:\xpider_uat_code_bk"
  ```
- **Recover From Interrupted Update / Power Loss**:
  ```powershell
  node scripts\xpider_safe_update.js recover --target "D:\xpider_uat_ext" --backup-root "D:\xpider_uat_code_bk"
  ```
- Then click **Reload** (`⟳`) in `chrome://extensions`.

---

## 5. Consolidated Acceptance & Verification Status Matrix (`SOURCE_METADATA_VERIFIED` vs `DEV_PASS` vs `BLOCKED` vs `NOT_TESTED`)
See `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` (Phase C) for the full 10-gate table:
- **`SOURCE_METADATA_VERIFIED` (Separately Verifiable File/Hash Provenance)**:
  - Frozen 50-file candidate runtime ZIP (`dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`, SHA-256 `b3f39bec...`, `extension/` tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`) and complete 15-file handoff archive (`dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip`, indexed in `dist/OWNER_HANDOFF_MANIFEST_REV15.json`) verified by two independent hash invocations (`Node crypto` + `PowerShell Get-FileHash / .NET ZipFile`).
- **`DEV_PASS` (Developer-Executed Automated Suites Only; Not Independently Verified by ChatGPT or Owner on Windows 10)**:
  1. Clean-room extracted handoff E2E test outside repository working tree (`dist/report_clean_extracted_handoff_kit_e2e.json`, `14/14`),
  2. Chrome `157.0.8103.38` (`37/37`) + Edge `146.0.3856.59` (`37/37`) migration/backup/restore parity,
  3. Chrome `157.0.8103.38` (`18/18`) UI/3-mode/reset/CSV/consent suite,
  4. Transactional updater (`57/57`) fault-injection/rollback suite,
  5. Browser-sink network isolation (`127.0.0.1:8090`), `--disable-quic`, DNR, `preflight-uat`, and cryptographic `NON_SYNTHETIC_BACKUP_ORIGIN_IN_UAT_RESTORE` guard (`21/21`, `transmittedViaSinkProxy: 0` — scoped strictly to browser proxy/DNR/CDP path, **not** proof of total host egress default-deny).
- **`BLOCKED`**:
  6. Host OS / kernel default-deny firewall policy (`netsh advfirewall`) on disposable test Chrome / VM (`BLOCKED_NO_SAFE_ELEVATED_TEST_VM` in non-elevated session; no Admin/UAC escalation or Owner firewall modifications).
- **`NOT_TESTED` (`OWNER_ACTION_REQUIRED`)**:
  7. Live Owner Windows 10 desktop manual smoke (`NOT_TESTED` / `OWNER_ACTION_REQUIRED`),
  8. Real external NopeCHA extension live cross-extension DOM solving (`NOT_TESTED` / `OWNER_ACTION_REQUIRED`),
  9. Authorized live DigitalOcean / Decodo relay egress (exit IP, DNS, IPv6, WebRTC stun/turn) (`NOT_TESTED` / `OWNER_ACTION_REQUIRED`),
  10. Owner final release / live update approval (`NOT_TESTED` / `OWNER_ACTION_REQUIRED`).
