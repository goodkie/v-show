# XPIDER V7 Candidate — Concise Windows 10 Owner UAT Checklist (Synthetic-Only UAT, Zero Public Submissions)

- **Status**: `CANDIDATE / RELEASE HOLD` (Execute ONLY when Owner chooses to review; all UAT runs use an isolated clean Chrome profile with synthetic `http://127.0.0.1:8088` fixtures — **never restore real production backups into the UAT browser, zero public form POSTs, and zero billable proxy traffic**).
- **Functional Candidate Commit**: `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`)
- **Extension Archive (50 extension runtime files ONLY)**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
  - **Exact Byte Size**: `4,467,833 bytes`
  - **Exact SHA-256**: `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
- **Separate Host-Side Updater, Manifests & Handoff Files (outside the extension ZIP)**:
  - Transactional Updater, Encrypted Backup & UAT Isolation CLI: `scripts/xpider_safe_update.js`
  - Synthetic UAT Profile Isolation & In-Memory Backup Verification Harness: `test/run_uat_synthetic_profile_isolation_check.js`
  - 50-File Candidate SHA-256 Inventory: `dist/PACKAGE_INVENTORY_SHA256.json`
  - Frozen RC11 Baseline Manifest: `dist/rc11_baseline_manifest.json`
  - Safe Update & Backup Guide: `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`
  - Localhost Test Fixture Server: `owner-extension-test-site/server.js`

---

## Global STOP Criteria (Abort Immediately & Do Not Proceed If Any Occur)
1. `Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256` does **not** equal `B3F39BEC4AB0711BBE348614BE6BBD1F8D0657987059EC7CD3538565C2C0227E`.
2. Extension ID in `chrome://extensions` changes from `ldlijlaccfeelfdhgnjbibniocefckjj`.
3. `backup-storage`, `verify-storage-backup`, `audit-uat-state`, or `plan` reports `ABORTED` (e.g., `BROWSER_RUNNING_LOCK_HELD`, `SYMLINK_FOUND`, `BACKUP_OVERLAPS_TARGET`, `NON_LOOPBACK_TARGET_IN_UAT_PROFILE`, `SENSITIVE_CREDENTIALS_IN_UAT_PROFILE`, `NON_SYNTHETIC_EMAIL_IN_UAT_PROFILE`).
4. Real production data (`pre_v7.xpider-enc` or real `Local Extension Settings`) is ever loaded into the disposable UAT profile.
5. Any campaign auto-starts after extension reload without clicking **Start**.

---

## Phase A — Offline Encrypted Real Backup & In-Memory Verification (Strictly Recovery-Only; NEVER Restored Into UAT)

| Step | Action | Expected Outcome | STOP Criterion |
| :--- | :--- | :--- | :--- |
| **A1. Record Existing Inventory** | Open `chrome://extensions` (Developer mode ON) and `chrome://version`. Record: (1) Extension ID (`ldlijlaccfeelfdhgnjbibniocefckjj`), (2) Unpacked folder path (`<TARGET_DIR>`), (3) Profile Path (`<PROFILE_DIR>`, e.g. `%LOCALAPPDATA%\Google\Chrome\User Data\Default`). | ID is `ldlijlaccfeelfdhgnjbibniocefckjj` and both paths exist on disk. | ID differs or paths are symlinks/junctions. |
| **A2. Create Offline Encrypted Backup (Browser Closed)** | Close **all** Chrome/Edge windows. In PowerShell:<br>`$env:XPIDER_BACKUP_PASS="Your-Local-Passphrase"`<br>`node scripts\xpider_safe_update.js backup-storage --profile-dir "<PROFILE_DIR>" --out "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS` | Prints `"result": "BACKUP_ENCRYPTED"` with `fileCount`, `manifestSha256`, and `backupSha256`. Keep `pre_v7.xpider-enc` strictly offline for emergency recovery only. | Prints `BROWSER_RUNNING_LOCK_HELD` or `ABORTED`. |
| **A3. Verify Encrypted Backup Integrity In-Memory (Zero Disk Decryption)** | Verify the encrypted archive **without** decrypting or extracting any personal data to disk:<br>`node scripts\xpider_safe_update.js verify-storage-backup --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS` | Prints `"result": "BACKUP_INTEGRITY_VERIFIED_IN_MEMORY"`, `"writtenToDisk": false`, `"decryptedFilesWritten": 0`. **Do NOT restore `pre_v7.xpider-enc` into the Phase B test profile.** | Any `ABORTED` code (`WRONG_PASSPHRASE_OR_CORRUPT_BACKUP`, `MANIFEST_HASH_MISMATCH`, `FILE_INTEGRITY_MISMATCH`). |
| **A4. Dry-Run Update Plan on Copy/Target** | Run read-only preview:<br>`node scripts\xpider_safe_update.js plan --target "<TARGET_DIR>" --archive dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json` | Prints `"mode": "DRY_RUN"`, `"modifiedTarget": false`, and a 16-char `PLAN_TOKEN`. | Any `ABORTED` code or unexpected file removal. |

---

## Phase B — Isolated Synthetic-Only Disposable-Profile UAT (Zero Production Data, Localhost `127.0.0.1:8088` Only)

> [!CAUTION]
> **Strict Privacy Separation**: Never copy or restore `pre_v7.xpider-enc` (or your real Chrome profile) into `D:\xpider_uat_synthetic_profile`. Phase B uses **only** synthetic `.test` contacts, dummy templates, and `http://127.0.0.1:8088` URLs with host-resolver loopback restrictions.

Start local fixture server: `node owner-extension-test-site/server.js` (listens on `http://127.0.0.1:8088` only).

| Step | Action | Expected Outcome | STOP Criterion |
| :--- | :--- | :--- | :--- |
| **B1. Automated Synthetic UAT Isolation Preflight** | Run:<br>`node test\run_uat_synthetic_profile_isolation_check.js` | Prints `10/10 PASS`: confirms `verify-storage-backup` writes 0 bytes to disk, boots an isolated clean Chrome UAT profile with synthetic-only state, and verifies `audit-uat-state` (`nonLoopbackUrls: 0`, `sensitiveCredentials: 0`, `nonSyntheticEmails: 0`, no active campaign). | Any assertion fails or any non-loopback URL / real email / credential is detected. |
| **B2. Launch Isolated Clean Chrome UAT Profile (Loopback-Restricted)** | Copy `<TARGET_DIR>` to `D:\xpider_uat_ext`, run `plan` then `apply --approve <PLAN_TOKEN> --backup-root "D:\xpider_uat_code_bk"`. Launch Chrome on a brand-new empty directory with loopback-only DNS restriction:<br>`chrome.exe --user-data-dir="D:\xpider_uat_synthetic_profile" --host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost" --no-first-run` and load `D:\xpider_uat_ext`. Seed only dummy template (`operator@uat-local.test`) and `http://127.0.0.1:8088/*` URLs. | Extension loads with ID `ldlijlaccfeelfdhgnjbibniocefckjj`; zero production templates, emails, queues, or proxy credentials exist in the profile; **nothing auto-starts**. | Any production data is present or any tab auto-launches. |
| **B3. Default-OFF No-Message & OFF -> ON -> OFF Toggle** | Open popup. Verify **Include forms without message field** (`#xpider-opt-include-no-message`) is **UNCHECKED (OFF)** by default. Run synthetic localhost queue (`http://127.0.0.1:8088/contact-standard.html`, `http://127.0.0.1:8088/subscribe-no-message.html`, `http://127.0.0.1:8088/consent-required-no-message.html`) with checkbox **OFF**, then **ON**, then **OFF** again. | **OFF**: `contact-standard.html` -> `CONFIRMED_SUCCESS`; `subscribe-no-message.html` -> `SKIPPED` (`NON_INQUIRY_SUBSCRIBE_FORM`).<br>**ON**: `subscribe-no-message.html` -> `CONFIRMED_SUCCESS`; `consent-required-no-message.html` -> `SKIPPED` (`NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM` when consent unauthorized).<br>**OFF again**: message-less forms return to `SKIPPED`. | Checkbox defaults to ON, newsletter submits while OFF, or mandatory consent form submits without authorization. |
| **B4. 3-Mode Execution (`AUTO`, `SEMI_AUTO`, `MANUAL`)** | Run `http://127.0.0.1:8088/contact-standard.html` (after selective reset) in each mode: `AUTO`, `SEMI_AUTO` (`#start-semi-auto-btn`), and `MANUAL` (`#start-manual-btn`). | `AUTO` fills & submits; `SEMI_AUTO` pauses only when human checkpoint/review is required; `MANUAL` fills fields, displays `#xpider-v7-manual-hold-panel`, and **never** auto-clicks submit (`0` POSTs until operator clicks `#xpider-manual-registered-btn` or Skip). | `MANUAL` mode auto-submits without operator click. |
| **B5. Pause / Resume / Stop & Save / Browser Restart** | Start a 3-URL synthetic localhost queue, click **Pause**, then **Resume**, then **Stop & Save** (`#stop-save-btn`). Close and reopen Chrome on `D:\xpider_uat_synthetic_profile`. | Remaining synthetic queue and campaign mode are saved in `xpider_paused_checkpoint`; after browser restart, queue remains **Paused** (no auto-launch) and resumes cleanly when clicked. | Browser restart auto-launches campaign or loses remaining queue. |
| **B6. Selective vs Global Reset (Synthetic Dataset)** | Enter `http://127.0.0.1:8088/contact-standard.html` in `#selective-reset-url-input` and click **Selective Reset**. Then click **Reset All Suppression** (`#reset-all-history-btn`). | Selective reset unsuppresses **only** `contact-standard.html` (`subscribe-no-message.html` stays suppressed). Global reset increments generation (`1 -> 2`) and unsuppresses all targets while **preserving** synthetic audit attempts, dummy templates, settings, and synthetic collected emails (`@uat-local.test`). | Either reset deletes templates, settings, collected emails, or audit attempts. |
| **B7. Synthetic CSV Import & Email Collector UI / Export** | Upload a synthetic CSV (`"http://127.0.0.1:8088/contact-standard.html","Acme, Inc."`). Open **Email Collector** tab (seeded only with `@uat-local.test` emails), toggle `Current` vs `All`, test **Export CSV / TXT**, and click **Clear** in `Current` view. | CSV import shows exact URL count and 1:1 row linkage (`INVALID_INPUT` header + `PENDING` rows). Email Collector exports valid CSV/TXT; clearing `Current` zeroes current site count while preserving `All` global store. | CSV drops quoted rows or `Clear Current` wipes global emails. |
| **B8. Privacy Fail-Closed Preflight (No External Traffic)** | With normal strict privacy mode enabled (`runScopedDirectPrivacy` OFF) and no proxy configured, click **Start** on a dummy target (`https://example.invalid/contact`). | Preflight blocks immediately with `PRIVACY_GATEWAY_BLOCKED` before opening any target tab; `0` direct fallback requests. | Target tab opens or falls back to direct connection. |
| **B9. Synthetic Backup-Restore & Transactional Code Rollback** | Close UAT Chrome. Test `backup-storage` and `restore-storage` using **only** `D:\xpider_uat_synthetic_profile\Default` -> `D:\xpider_uat_synthetic.xpider-enc` -> `D:\xpider_uat_synthetic_profile_2\Default`. Then run `node scripts\xpider_safe_update.js rollback --target "D:\xpider_uat_ext" --backup-root "D:\xpider_uat_code_bk"`. | Synthetic UAT backup restores identically into `D:\xpider_uat_synthetic_profile_2`; `D:\xpider_uat_ext` rolls back byte-for-byte to RC11 (`background.js` SHA `776b734a...`). Delete `D:\xpider_uat_*` disposable folders when UAT is complete. | Rollback leaves extra files or corrupts `storage.local`. |

---

## Phase C — Separate Permissioned Gates & External Dependency Observations (`NOT_TESTED / UNKNOWN`)
Do **not** mark these items `PASS` until the Owner explicitly authorizes and executes them on the live environment:

| External Dependency | Non-Invasive Diagnostic Observation in Candidate Codebase | Current Gate Status |
| :--- | :--- | :--- |
| **1. Owner Windows 10 PC Live Desktop Smoke** | Automated Chrome `157.0.8103.38` (`37/37` + `18/18` + `10/10` PASS) and Edge `146.0.3856.59` (`37/37` PASS) suites were executed on the developer Windows 11 Pro host (`Build 26100`). No live Owner Windows 10 profile or installation has been touched. | `NOT_TESTED / UNKNOWN` |
| **2. Real External NopeCHA Extension Interoperability** | Non-invasive inspection of `extension/background.js` and `extension/content-script.js` confirms all in-app solver endpoints/keys are retired (`IN_APP_SOLVER_RETIRED` / `INTERNAL_SOLVER_RETIRED_V7`), and CAPTCHA frames yield passively to an external browser extension solver or operator hold panel. Actual third-party NopeCHA CRX live DOM solving is outside the unpacked repository sandbox. | `NOT_TESTED / UNKNOWN` |
| **3. Live DigitalOcean / Decodo Egress (IP / DNS / IPv6 / WebRTC)** | Non-invasive inspection of `extension/modules/privacy-gateway.js` confirms `webRTCIPHandlingPolicy: 'disable_non_proxied_udp'` and fail-closed `PRIVACY_GATEWAY_BLOCKED` when relay/proxy preflight fails. Live external exit IP, DNS resolver, IPv6 routing, and WebRTC stun/turn behavior over paid Decodo/DO endpoints were intentionally not probed to avoid external network traffic and proxy billing. | `UNKNOWN` |

---

## Phase D — Emergency Recovery-Only Procedure for Real Profile (NEVER Run During UAT)
Only if the Owner later authorizes a live update on `<TARGET_DIR>` and wishes to restore the offline `pre_v7.xpider-enc` backup to the real `<PROFILE_DIR>`:
1. Close **all** Chrome/Edge windows completely.
2. Verify archive integrity in memory first:
   `node scripts\xpider_safe_update.js verify-storage-backup --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS`
3. Run atomic recovery restore into `<PROFILE_DIR>`:
   `node scripts\xpider_safe_update.js restore-storage --profile-dir "<PROFILE_DIR>" --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS`
