# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip cf96bc08)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object — extension/ tree 100% untouched and byte-identical)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-06.716
- Authority Cursor: 6699964616 (Responding to ChatGPT Directives #6699947182 & #6699964616: Google Chrome 157 same-ID migration/rollback/interruption parity, Chrome UI/reset/CSV/Email Collector/consent regressions, scrypt+AES-256-GCM encrypted storage backup/restore, updater overlap/target-identity/lock hardening, deep content-level public repo & ZIP secret audit)
- Canonical Schedule Revision: 9 (verified canonical GitHub schedule blob 39a0243f7c334470163deeed59cf6f306b48e72a at commit cf96bc0891c422e371ba6dd3077b99e35462026e)
- Collaboration Mode: Manual ChatGPT <-> Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Gate Decision). Release HOLD strictly maintained. Zero external public submissions.

---

## 0. Directives #6699947182 & #6699964616 (State Rev .716) — CHROME ACCEPTANCE READINESS & UPDATER HARDENING
1. **Google Chrome (`157.0.8103.38`) Clean-Profile Same-ID Migration, Encrypted Backup/Restore & Interruption Suite**:
   - Command: `$env:XPIDER_BROWSER='chrome'; node test/run_backup_restore_parity_harness.js` -> **37 / 37 PASS** (Exit 0).
   - Report: `dist/report_chrome_migration_parity.json` (plus Edge parity report `dist/report_backup_restore_parity.json`).
   - Screenshots: `dist/evidence_chrome/chrome_after_upgrade_popup.png`, `dist/evidence_chrome/chrome_after_rollback_popup.png`.
   - Verified on real Google Chrome `157.0.8103.38` (`C:\Program Files\Google\Chrome\Application\chrome.exe`): fixed ID `ldlijlaccfeelfdhgnjbibniocefckjj`, `storage.local` full parity across restore, upgrade, rollback, and crash-mid-commit recovery, `HistorySkip` (`isSuppressed`) parity, zero extension IndexedDB directories, paused checkpoint preserved (`isPaused: true`), zero auto-start, and `0` localhost/public form POSTs during migration/rollback.
2. **Google Chrome (`157.0.8103.38`) UI, Selective/Global Reset, CSV Import, Email Collector & Consent Boundary Regression Suite**:
   - Command: `node test/run_chrome_ui_reset_collector_regressions.js` -> **18 / 18 PASS** (Exit 0).
   - Report: `dist/report_chrome_ui_reset_collector_regressions.json`.
   - Screenshot: `dist/evidence_chrome/chrome_ui_regressions_tally.png`.
   - Verified RFC-4180 CSV import UI & 1:1 row linkage, Email Collector current vs global view/export/clear isolation, dynamic `#xpider-opt-include-no-message` default-OFF (`NON_INQUIRY_SUBSCRIBE_FORM` skip) vs explicit-ON submission, consent boundary (`NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM` / `UNAUTHORIZED_CONSENT_SKIPPED` when `ownerAuthorizedConsent: false`), visible popup tally (`Succeeded: 2`, `Skipped: 3`), active submit lock guard (`CANNOT_RESET_WITH_ACTIVE_SUBMIT_LOCK`), selective reset unsuppressing only the chosen URL, and global suppression reset advancing generation while preserving audit attempts, templates, settings, and collected emails.
3. **Passphrase-Encrypted Local Storage Backup & Verified Atomic Restore (`scripts/xpider_safe_update.js`)**:
   - Subcommands `backup-storage` and `restore-storage` using `scrypt(16384,8,1)` + `aes-256-gcm` (`XPIDER_ENCRYPTED_STORAGE_BACKUP_V1`).
   - Checks LevelDB `LOCK` file and fails closed (`BROWSER_RUNNING_LOCK_HELD`) if Chrome/Edge is open; verifies GCM authentication tag and per-file SHA-256 manifest in staging before atomic swap (`WRONG_PASSPHRASE_OR_CORRUPT_BACKUP` on wrong passphrase leaves profile untouched).
4. **Supplemental Source-Audit P0 Hardening (`scripts/xpider_safe_update.js` & `test/run_safe_update_transaction_tests.js`)**:
   - Command: `node test/run_safe_update_transaction_tests.js` -> **48 / 48 PASS** (Exit 0), `dist/report_safe_update_transaction.json`.
   - Gap 1 fixed: `assertNoOverlap(target, backupRoot)` resolves Windows canonical realpaths (`fs.realpathSync.native`) + case folding, rejecting same path, ancestor, descendant, case alias, and Windows junction alias (`BACKUP_OVERLAPS_TARGET`).
   - Gap 2 fixed: `doRollback` fails closed on `canonKey(journal.target) !== canonKey(target)` (`ROLLBACK_TARGET_MISMATCH`), `assertNoOverlap`, `cmpTree(backupDir, journal.backupManifest)` (`BACKUP_INTEGRITY_FAILED`), `safeRel` path traversal (`UNSAFE_JOURNAL_PATH`), or wrong manifest ID (`ROLLBACK_WRONG_ID`), and verifies complete-tree identity post-rollback (removing candidate-added stale files while preserving unknown user files).
   - Concurrency lock `.xpider-update.lock` blocks concurrent `apply` (`UPDATE_IN_PROGRESS`) while an update is unfinished; `powerloss-before-rename` cleans `.xpider-new` temp files; `ebusy-lock` auto-rolls back cleanly.
5. **Deep Content-Level Public Repo & ZIP Secret Audit (`scripts/audit_public_repo_and_zip_secrets.js`)**:
   - Command: `node scripts/audit_public_repo_and_zip_secrets.js` -> **ALL_CLEAN** (Exit 0), `dist/report_public_repo_secret_audit.json`.
   - Scanned all `1,362` tracked files (`932` text files) and all `50` candidate package files: `0` violations, `.private_egress_transaction.json` confirmed untracked/excluded.
6. **Remaining `NOT_TESTED / UNKNOWN` Boundaries**:
   - Live Owner Windows 10 desktop manual smoke: `NOT_TESTED`.
   - Real external NopeCHA extension live cross-extension solver interaction: `NOT_TESTED`.
   - Live Decodo / DigitalOcean VPN/Proxy egress (IP / DNS / IPv6 / WebRTC): `UNKNOWN`.

---

## 1. Prior Directives Summary (#6699808184 & #6699586274)
- **Package Archive**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`4,467,833` bytes, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`).
- **Owner Guide**: `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md` (supersedes any legacy reference to `"EXPORT OWNER DEBUG BUNDLE"`, which is a redacted diagnostic export with no restore path).
- **Clean-Room Package Suite**: `node test/run_chromium_v7_clean_room_package_suite.js` -> `22/22 PASS` (`dist/report_clean_room_package_suite.json`).
- **Package Security Audit**: `node scripts/audit_candidate_package_security.js` -> `0` violations (`dist/security_and_hygiene_audit_report.json`).

---

## 2. Active Gate Status
- **RELEASE HOLD strictly maintained**.
- Base branch `major/v7-dual-mode` remains 100% frozen RC11 (`20678ada`), schedule tip `cf96bc08`.
- Zero public form submissions (localhost `127.0.0.1:8088` only).
- IVCS Manager completely untouched (strictly ChatGPT-owned).
