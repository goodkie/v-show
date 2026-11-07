# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip 9029b45a)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object — extension/ tree SHA 1d1bac897f70df6fa107cde85b00de591d5dea93 100% untouched and byte-identical)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-07.717
- Authority Cursor: 6703093387 (Responding to ChatGPT Rev 12 Final Candidate Readiness Directive #6703093387: frozen candidate fingerprint & ZIP-vs-updater delivery table, encrypted backup/restore edge-case hardening & 9 new negative tests [57/57 PASS], concise Windows 10 Owner UAT checklist, and non-invasive external dependency UNKNOWN observations)
- Canonical Schedule Revision: 12 (verified canonical GitHub schedule at commit 9029b45a9ae4eb02993dcfc77b9a8f6ad8db8f5f on major/v7-dual-mode; IVCS Manager/schedule strictly ChatGPT-only)
- Collaboration Mode: Manual ChatGPT <-> Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Owner UAT Gate Decision). Release HOLD strictly maintained. Zero external public submissions.

---

## 0. Directive #6703093387 (State Rev .717) — REV12 FINAL CANDIDATE READINESS & ENCRYPTED BACKUP/RESTORE HARDENING

1. **Frozen Owner-Review Candidate Fingerprint & Extension ZIP vs Host Updater Distinction**:
   - **Functional Source Commit**: `76fab0933276ae163c377d39d9dca5169a33063c` (`76fab093`)
   - **Full `extension/` Tree SHA**: `1d1bac897f70df6fa107cde85b00de591d5dea93` (100% byte-identical at current branch HEAD)
   - **Extension Runtime Archive (50 extension files ONLY)**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`4,467,833 bytes`, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`)
   - **Why ZIP SHA-256 Is Unchanged While Updater/Guides Changed**: The ZIP contains ONLY the 50 unpacked Chrome MV3 runtime files from `extension/`. Host-side tools (`scripts/xpider_safe_update.js`), manifests (`dist/PACKAGE_INVENTORY_SHA256.json`, `dist/rc11_baseline_manifest.json`), and guides (`dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`, `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`) live outside the extension ZIP so they never pollute the browser extension folder, and are directly downloadable from `candidate/p0-core-regressions-v7`.
2. **Independent Audit & Hardening of Encrypted Storage Backup/Restore (`scripts/xpider_safe_update.js`)**:
   - Command: `node test/run_safe_update_transaction_tests.js` -> **57 / 57 PASS** (Exit 0), `dist/report_safe_update_transaction.json`.
   - Uncovered and remediated 6 real edge-case gaps in `backupStorageEncrypted` / `restoreStorageEncrypted` with 9 new reproducible tests (`48 -> 57 PASS`):
     1. **Symlink / Junction on Profile Path or `Local Extension Settings\<id>` (`assertNoSymlinkChain`)**: Walks every path segment from `--profile-dir` to `Local Extension Settings\<id>` and refuses symlinks/junctions (`SYMLINK_FOUND`) on both backup and restore (`STORAGE_BACKUP_AND_RESTORE_REFUSED_ON_JUNCTION_LES_DIR: PASS`).
     2. **`--out` / `--in` Overlapping `Local Extension Settings\<id>`**: Calls `assertNoOverlap(lesDir, outPath/inPath)` and refuses with `BACKUP_OVERLAPS_TARGET` (`STORAGE_BACKUP_OUT_OVERLAPPING_LES_DIR_REFUSED: PASS`).
     3. **Path Traversal, Unmanifested File Keys & Duplicate Case-Colliding Paths in Decrypted Archive**: Hardened `safeRel` (rejecting empty/dot/dot-dot/drive/leading-or-trailing slash segments), enforced strict 1:1 bijection between `plain.manifest` and `Object.keys(plain.files)` (`MANIFEST_FILES_MISMATCH`), and rejected case-colliding duplicate paths (`DUPLICATE_MANIFEST_PATH`) before touching the profile (`STORAGE_RESTORE_PATH_TRAVERSAL_IN_DECRYPTED_MANIFEST_REFUSED`, `STORAGE_RESTORE_EXTRA_UNMANIFESTED_FILE_KEY_REFUSED`, `STORAGE_RESTORE_DUPLICATE_CASE_COLLIDING_PATH_REFUSED`: all `PASS`).
     4. **Strict 32-Char Chromium Extension ID Validation & Inner Payload ID Binding (`assertValidExtId`)**: Rejects `--ext-id` traversal/invalid strings (`INVALID_EXT_ID`) and verifies both outer `env.extId === extId` and decrypted inner `plain.extId === extId` (`BACKUP_ID_MISMATCH`) (`STORAGE_RESTORE_INVALID_OR_MISMATCHED_EXT_ID_REFUSED: PASS`).
     5. **Full LevelDB File Lock Probing (`assertBrowserClosedForStorage`)**: Probes `r+` open + rename across every file inside `Local Extension Settings\<id>` (not only `LOCK`) so any locked `.ldb`/`LOG`/`MANIFEST` file fails closed with `BROWSER_RUNNING_LOCK_HELD`.
     6. **Interrupted Restore Between Folder Rename Steps (`recoverInterruptedStorageRestore`)**: Previously, if a restore crashed after `renameSync(lesDir, lesDir + '.pre-restore-bak')`, a subsequent run deleted `.pre-restore-bak` before validating the new restore. Fixed so `.pre-restore-bak` is automatically restored back to `lesDir` before any new attempt; verified with fault injection `XPIDER_UPDATE_FAULT=restore-after-bak-rename` that a subsequent failed retry (wrong passphrase) preserves the original pre-restore data and a valid retry completes cleanly (`STORAGE_RESTORE_INTERRUPTED_BETWEEN_RENAME_STEPS_PRESERVES_PRE_RESTORE_ON_FAILURE: PASS`, `STORAGE_RESTORE_INTERRUPTED_BETWEEN_RENAME_STEPS_COMPLETES_ON_RETRY: PASS`).
3. **Concise Windows 10 Owner UAT Checklist (`dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`)**:
   - Covers pre-update inventory & encrypted storage backup, disposable-profile restore, default-OFF no-message verification & OFF->ON->OFF toggle, `AUTO`/`SEMI_AUTO`/`MANUAL` 3-mode checks, Pause/Resume/Stop&Save/browser restart, selective vs global reset on disposable dataset, CSV import & Email Collector UI/export, privacy fail-closed preflight (`PRIVACY_GATEWAY_BLOCKED`), transactional rollback, clear expected outcomes and STOP criteria, and separate permissioned gates for NopeCHA and live egress.
4. **Non-Invasive Diagnostic Observations for External Dependencies (`NOT_TESTED / UNKNOWN`)**:
   - Live Owner Windows 10 PC desktop smoke: `NOT_TESTED / UNKNOWN`.
   - Real external NopeCHA extension live cross-extension DOM solving: `NOT_TESTED / UNKNOWN`.
   - Live DigitalOcean / Decodo VPN/Proxy egress (IP / DNS / IPv6 / WebRTC): `UNKNOWN`.

---

## 1. Prior Directives Summary (#6699947182, #6699964616, #6699808184 & #6699586274)
- **Google Chrome `157.0.8103.38` Migration, Encrypted Backup/Restore & Interruption Suite**: `dist/report_chrome_migration_parity.json` (`37/37 PASS`).
- **Google Chrome `157.0.8103.38` UI, Reset, CSV Import, Email Collector & Consent Suite**: `dist/report_chrome_ui_reset_collector_regressions.json` (`18/18 PASS`).
- **Microsoft Edge `146.0.3856.59` Migration Parity Suite**: `dist/report_backup_restore_parity.json` (`37/37 PASS`).
- **Clean-Room Package Suite**: `dist/report_clean_room_package_suite.json` (`22/22 PASS`).
- **Deep Content-Level Secret Audit**: `dist/report_public_repo_secret_audit.json` (`ALL_CLEAN`, finite pattern scanner coverage noted).

---

## 2. Active Gate Status
- **RELEASE HOLD strictly maintained**.
- Base branch `major/v7-dual-mode` remains 100% frozen RC11 (`20678ada`), schedule tip `9029b45a` (Revision 12).
- Zero public form submissions (localhost `127.0.0.1:8088` only).
- IVCS Manager and canonical schedule completely untouched (strictly ChatGPT-owned).
