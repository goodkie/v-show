# XPIDER V7 Candidate — Concise Windows 10 Owner UAT Checklist (Zero Public Submissions)

- **Status**: `CANDIDATE / RELEASE HOLD` (Execute ONLY when Owner chooses to review; all campaign tests use local `http://127.0.0.1:8088` fixtures — **zero public form POSTs and zero billable proxy traffic**).
- **Functional Candidate Commit**: `76fab0933276ae163c377d39d9dca5169a33063c` (`extension/` tree SHA `1d1bac897f70df6fa107cde85b00de591d5dea93`)
- **Extension Archive (50 runtime files only)**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
  - **Exact Byte Size**: `4,467,833 bytes`
  - **Exact SHA-256**: `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
- **Separate Updater & Manifest Files (outside the extension ZIP)**:
  - Transactional Updater & Encrypted Backup CLI: `scripts/xpider_safe_update.js`
  - 50-File Candidate SHA-256 Inventory: `dist/PACKAGE_INVENTORY_SHA256.json`
  - Frozen RC11 Baseline Manifest: `dist/rc11_baseline_manifest.json`
  - Localhost Test Fixture Server: `owner-extension-test-site/server.js`

---

## Global STOP Criteria (Abort Immediately & Roll Back If Any Occur)
1. `Get-FileHash .\dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256` does **not** equal `B3F39BEC4AB0711BBE348614BE6BBD1F8D0657987059EC7CD3538565C2C0227E`.
2. Extension ID in `chrome://extensions` changes from `ldlijlaccfeelfdhgnjbibniocefckjj`.
3. `backup-storage` or `plan` reports `ABORTED` (e.g., `BROWSER_RUNNING_LOCK_HELD`, `SYMLINK_FOUND`, `BACKUP_OVERLAPS_TARGET`, `INVENTORY_MISMATCH`).
4. Any campaign auto-starts after extension reload without clicking **Start**.
5. Any existing template, saved URL list, user setting, history record, or collected email is missing after update or rollback.

---

## Phase A — Pre-Update Inventory & Encrypted Storage Backup (No Live Mutation Yet)

| Step | Action | Expected Outcome | STOP Criterion |
| :--- | :--- | :--- | :--- |
| **A1. Record Existing Inventory** | Open `chrome://extensions` (Developer mode ON) and `chrome://version`. Record: (1) Extension ID (`ldlijlaccfeelfdhgnjbibniocefckjj`), (2) Unpacked folder path (`<TARGET_DIR>`), (3) Profile Path (`<PROFILE_DIR>`, e.g. `%LOCALAPPDATA%\Google\Chrome\User Data\Default`). | ID is `ldlijlaccfeelfdhgnjbibniocefckjj` and both paths exist on disk. | ID differs or paths are symlinks/junctions. |
| **A2. Encrypted Storage Backup (Browser Closed)** | Close **all** Chrome/Edge windows. In PowerShell:<br>`$env:XPIDER_BACKUP_PASS="Your-Local-Passphrase"`<br>`node scripts\xpider_safe_update.js backup-storage --profile-dir "<PROFILE_DIR>" --out "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS` | Prints `"result": "BACKUP_ENCRYPTED"` with `fileCount`, `manifestSha256`, and `backupSha256`. | Prints `BROWSER_RUNNING_LOCK_HELD` or `ABORTED`. |
| **A3. Dry-Run Update Plan** | Run:<br>`node scripts\xpider_safe_update.js plan --target "<TARGET_DIR>" --archive dist\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip --expected-sha b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e --inventory dist\PACKAGE_INVENTORY_SHA256.json --baseline dist\rc11_baseline_manifest.json` | Prints `"mode": "DRY_RUN"`, `"modifiedTarget": false`, and a 16-char `PLAN_TOKEN`. | Any `ABORTED` code or unexpected file removal. |

---

## Phase B — Disposable-Profile UAT (Recommended Before Touching Daily Profile)
Start local fixture server: `node owner-extension-test-site/server.js` (listens on `http://127.0.0.1:8088` only).

| Step | Action | Expected Outcome | STOP Criterion |
| :--- | :--- | :--- | :--- |
| **B1. Restore Backup into Disposable Profile** | Create `D:\xpider_uat_profile\Default` and run `restore-storage --profile-dir "D:\xpider_uat_profile\Default" --in "D:\xpider_private_backups\pre_v7.xpider-enc" --passphrase-env XPIDER_BACKUP_PASS`. | Prints `"result": "RESTORED_VERIFIED"`. Wrong passphrase test on a dummy folder fails closed (`WRONG_PASSPHRASE_OR_CORRUPT_BACKUP`). | Restore fails or modifies source profile. |
| **B2. Apply Candidate to Disposable Copy & Reload** | Copy `<TARGET_DIR>` to `D:\xpider_uat_ext`, run `plan` then `apply --approve <PLAN_TOKEN> --backup-root "D:\xpider_uat_code_bk"`. Launch Chrome with `--user-data-dir="D:\xpider_uat_profile"` and load `D:\xpider_uat_ext`. | Extension loads with ID `ldlijlaccfeelfdhgnjbibniocefckjj`; all restored templates, queues, settings, history, and emails are intact; **nothing auto-starts**. | Missing storage keys or auto-started tabs. |
| **B3. Default-OFF No-Message & OFF -> ON -> OFF Toggle** | Open popup. Verify **Include forms without message field** (`#xpider-opt-include-no-message`) is **UNCHECKED (OFF)** by default. Run localhost queue (`http://127.0.0.1:8088/contact-standard.html`, `http://127.0.0.1:8088/subscribe-no-message.html`, `http://127.0.0.1:8088/consent-required-no-message.html`) with checkbox **OFF**, then **ON**, then **OFF** again. | **OFF**: `contact-standard.html` -> `CONFIRMED_SUCCESS`; `subscribe-no-message.html` -> `SKIPPED` (`NON_INQUIRY_SUBSCRIBE_FORM`).<br>**ON**: `subscribe-no-message.html` -> `CONFIRMED_SUCCESS`; `consent-required-no-message.html` -> `SKIPPED` (`NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM` when consent unauthorized).<br>**OFF again**: message-less forms return to `SKIPPED`. | Checkbox defaults to ON, newsletter submits while OFF, or mandatory consent form submits without authorization. |
| **B4. 3-Mode Execution (`AUTO`, `SEMI_AUTO`, `MANUAL`)** | Run `http://127.0.0.1:8088/contact-standard.html` (after selective reset) in each mode: `AUTO`, `SEMI_AUTO` (`#start-semi-auto-btn`), and `MANUAL` (`#start-manual-btn`). | `AUTO` fills & submits; `SEMI_AUTO` pauses only when human checkpoint/review is required; `MANUAL` fills fields, displays `#xpider-v7-manual-hold-panel`, and **never** auto-clicks submit (`0` POSTs until operator clicks `#xpider-manual-registered-btn` or Skip). | `MANUAL` mode auto-submits without operator click. |
| **B5. Pause / Resume / Stop & Save / Browser Restart** | Start a 3-URL localhost queue, click **Pause**, then **Resume**, then **Stop & Save** (`#stop-save-btn`). Close and reopen Chrome on `D:\xpider_uat_profile`. | Remaining queue and campaign mode are saved in `xpider_paused_checkpoint`; after browser restart, queue remains **Paused** (no auto-launch) and resumes cleanly when clicked. | Browser restart auto-launches campaign or loses remaining queue. |
| **B6. Selective vs Global Reset (Disposable Dataset)** | Enter `http://127.0.0.1:8088/contact-standard.html` in `#selective-reset-url-input` and click **Selective Reset**. Then click **Reset All Suppression** (`#reset-all-history-btn`). | Selective reset unsuppresses **only** `contact-standard.html` (`subscribe-no-message.html` stays suppressed). Global reset increments generation (`1 -> 2`) and unsuppresses all targets while **preserving** historical audit attempts, templates, settings, and collected emails. | Either reset deletes templates, settings, collected emails, or audit attempts. |
| **B7. CSV Import & Email Collector UI / Export** | Upload a test CSV with quoted commas (`"http://127.0.0.1:8088/contact-standard.html","Acme, Inc."`). Open **Email Collector** tab, toggle `Current` vs `All`, test **Export CSV / TXT**, and click **Clear** in `Current` view. | CSV import shows exact URL count and 1:1 row linkage (`INVALID_INPUT` header + `PENDING` rows). Email Collector exports valid CSV/TXT; clearing `Current` zeroes current site count while preserving `All` global store. | CSV drops quoted rows or `Clear Current` wipes global emails. |
| **B8. Privacy Fail-Closed Preflight (No External Traffic)** | With normal strict privacy mode enabled (`runScopedDirectPrivacy` OFF) and proxy/relay unreachable, click **Start** on a non-loopback dummy target (`https://example.invalid/contact`). | Preflight blocks immediately with `PRIVACY_GATEWAY_BLOCKED` before opening any target tab; `0` direct fallback requests. | Target tab opens or falls back to direct connection. |
| **B9. Transactional Rollback & Recovery Check** | Close disposable Chrome, run `node scripts\xpider_safe_update.js rollback --target "D:\xpider_uat_ext" --backup-root "D:\xpider_uat_code_bk"`, reopen Chrome and click **Reload**. | `D:\xpider_uat_ext` returns byte-for-byte to RC11 (`background.js` SHA `776b734a...`); all `storage.local` data and `HistorySkip` suppression remain 100% intact. | Rollback leaves extra files or corrupts `storage.local`. |

---

## Phase C — Separate Permissioned Gates & External Dependency Observations (`NOT_TESTED / UNKNOWN`)
Do **not** mark these items `PASS` until the Owner explicitly authorizes and executes them on the live environment:

| External Dependency | Non-Invasive Diagnostic Observation in Candidate Codebase | Current Gate Status |
| :--- | :--- | :--- |
| **1. Owner Windows 10 PC Live Desktop Smoke** | Automated Chrome `157.0.8103.38` (`37/37` + `18/18` PASS) and Edge `146.0.3856.59` (`37/37` PASS) suites were executed on the developer Windows 11 Pro host (`Build 26100`). No live Owner Windows 10 profile or installation has been touched. | `NOT_TESTED / UNKNOWN` |
| **2. Real External NopeCHA Extension Interoperability** | Static/runtime inspection of `extension/background.js` and `extension/content-script.js` confirms all in-app solver endpoints/keys are retired (`IN_APP_SOLVER_RETIRED` / `INTERNAL_SOLVER_RETIRED_V7`), and CAPTCHA frames yield passively to an external browser extension solver or operator hold panel. Actual third-party NopeCHA CRX live DOM solving is outside the unpacked repository sandbox. | `NOT_TESTED / UNKNOWN` |
| **3. Live DigitalOcean / Decodo Egress (IP / DNS / IPv6 / WebRTC)** | Static/runtime inspection of `extension/modules/privacy-gateway.js` confirms `webRTCIPHandlingPolicy: 'disable_non_proxied_udp'` and fail-closed `PRIVACY_GATEWAY_BLOCKED` when relay/proxy preflight fails. Live external exit IP, DNS resolver, IPv6 routing, and WebRTC stun/turn behavior over paid Decodo/DO endpoints were intentionally not probed to avoid external network traffic and proxy billing. | `UNKNOWN` |
