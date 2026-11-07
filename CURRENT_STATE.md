# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip 9029b45a)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object — extension/ tree SHA 1d1bac897f70df6fa107cde85b00de591d5dea93 100% untouched and byte-identical)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-07.718
- Authority Cursor: 6703224519 (Responding to ChatGPT Rev 12 UAT Safety Correction + Final Handoff Gate Directive #6703224519: strict separation of offline recovery-only real backup from synthetic-only UAT profile, in-memory `verify-storage-backup`, `audit-uat-state` + `test/run_uat_synthetic_profile_isolation_check.js` [10/10 PASS], and single handoff set)
- Canonical Schedule Revision: 12 (verified canonical GitHub schedule at commit 9029b45a9ae4eb02993dcfc77b9a8f6ad8db8f5f on major/v7-dual-mode; IVCS Manager/schedule strictly ChatGPT-only)
- Collaboration Mode: Manual ChatGPT <-> Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Owner UAT Gate Decision). Release HOLD strictly maintained. Zero external public submissions.

---

## 0. Directive #6703224519 (State Rev .718) — REV12 UAT SAFETY CORRECTION & SYNTHETIC PROFILE ISOLATION

1. **Strict Separation of Real Backup Preservation vs Synthetic UAT Fixture Preparation (`dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md` & `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`)**:
   - **Phase A (`pre_v7.xpider-enc`)**: Strictly offline and **RECOVERY-ONLY** — never restored into the disposable UAT test browser.
   - **In-Memory Backup Verification (`verify-storage-backup`)**: Added `verify-storage-backup --in <file.xpider-enc> --passphrase-env <ENV>` to `scripts/xpider_safe_update.js` so the Owner can verify the AES-256-GCM authTag, `manifestSha256`, and all per-file SHA-256 hashes strictly in memory (`writtenToDisk: false`, `decryptedFilesWritten: 0`) without decrypting personal data to any folder.
   - **Phase B (Disposable UAT)**: Uses a brand-new, isolated Chrome profile (`--user-data-dir="D:\xpider_uat_synthetic_profile"` with `--host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost"`) seeded **exclusively** with synthetic/dummy localhost-only (`127.0.0.1:8088`) contacts, dummy templates (`operator@uat-local.test`), synthetic history/ledger/Email Collector records (`@uat-local.test`), no real CSV URLs, no real proxy credentials, and no imported production state.
   - **Phase D (Emergency Recovery-Only)**: `restore-storage` of `pre_v7.xpider-enc` is isolated to a dedicated recovery-only section requiring closed browser and explicit Owner approval.
2. **Reproducible Synthetic UAT Profile Isolation & In-Memory Backup Verification Harness (`test/run_uat_synthetic_profile_isolation_check.js`)**:
   - Command: `node test/run_uat_synthetic_profile_isolation_check.js` -> **10 / 10 PASS** (Exit 0).
   - Report: `dist/report_uat_synthetic_profile_isolation.json`.
   - Verifies:
     - `OFFLINE_ENCRYPTED_BACKUP_CREATED` & `IN_MEMORY_BACKUP_VERIFY_SUCCEEDS_WITHOUT_WRITING_TO_DISK` (`writtenToDisk: false`, `decryptedFilesWritten: 0`) & `IN_MEMORY_BACKUP_VERIFY_WRONG_PASSPHRASE_FAILS_CLOSED`.
     - Real Google Chrome (`Chrome/157.0.8103.38`) disposable UAT profile boots with zero auto-resumed campaigns (`UAT_STARTUP_NO_AUTO_RESUMED_CAMPAIGN_OR_EXTERNAL_TABS: PASS`) and passes `audit-uat-state` (`UAT_SYNTHETIC_STATE_PASSES_ISOLATION_AUDIT: PASS`, `nonLoopbackUrls: 0`, `sensitiveCredentials: 0`, `nonSyntheticEmails: 0`).
     - Reproducible negative controls on `audit-uat-state` fail closed without logging raw secrets or email local-parts (`AUDIT_UAT_REJECTS_NON_LOOPBACK_TARGET_URL`, `AUDIT_UAT_REJECTS_PROXY_CREDENTIALS_WITHOUT_LOGGING_SECRET`, `AUDIT_UAT_REJECTS_NON_SYNTHETIC_EMAIL_WITHOUT_LOGGING_LOCALPART`, `AUDIT_UAT_REJECTS_ACTIVE_CAMPAIGN_ON_STARTUP`: all `PASS`).
3. **Single Handoff Set**:
   - Extension Runtime Archive (50 extension files only): `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (`4,467,833 bytes`, SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`).
   - Standalone Host Updater, In-Memory Verifier & UAT Isolation CLI: `scripts/xpider_safe_update.js`.
   - Candidate & Baseline Manifests: `dist/PACKAGE_INVENTORY_SHA256.json`, `dist/rc11_baseline_manifest.json`.
   - Owner Guides: `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`, `dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`.

---

## 1. Prior Verified Suites Summary
- **Safe Update + Encrypted Storage Backup/Restore Suite**: `dist/report_safe_update_transaction.json` (`57/57 PASS`).
- **Google Chrome `157.0.8103.38` Migration Parity Suite**: `dist/report_chrome_migration_parity.json` (`37/37 PASS`).
- **Google Chrome `157.0.8103.38` UI, Reset, CSV, Email Collector & Consent Suite**: `dist/report_chrome_ui_reset_collector_regressions.json` (`18/18 PASS`).
- **Clean-Room Package Suite**: `dist/report_clean_room_package_suite.json` (`22/22 PASS`).
- **Deep Content-Level Secret Audit**: `dist/report_public_repo_secret_audit.json` (`ALL_CLEAN`, finite pattern scanner coverage noted).

---

## 2. Active Gate Status & Separate External Boundaries (`NOT_TESTED / UNKNOWN`)
- **RELEASE HOLD strictly maintained**.
- External gates held separately as `NOT_TESTED / UNKNOWN`:
  1. Live Owner Windows 10 PC desktop smoke: `NOT_TESTED / UNKNOWN`.
  2. Real external NopeCHA extension interoperability: `NOT_TESTED / UNKNOWN`.
  3. Live DigitalOcean / Decodo VPN/Proxy egress (IP / DNS / IPv6 / WebRTC): `UNKNOWN`.
- Base branch `major/v7-dual-mode` remains 100% frozen RC11 (`20678ada`), schedule tip `9029b45a` (Revision 12).
- Zero public form submissions (localhost `127.0.0.1:8088` only).
- IVCS Manager and canonical schedule completely untouched (strictly ChatGPT-owned).
