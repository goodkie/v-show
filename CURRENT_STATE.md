# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip e360270d)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object — extension/ tree SHA 1d1bac897f70df6fa107cde85b00de591d5dea93 100% untouched and byte-identical)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-07.724
- Authority Cursor: CHATGPT_AUDIT_REV16_SIZE_RESOLUTION (Responding to ChatGPT Audit regarding REV16 handoff size contradiction: Reconciled clerical receipt typo; proved that actual binary ZIP on disk [4,569,570 bytes], remote GitHub raw download [4,569,570 bytes], committed OWNER_HANDOFF_MANIFEST_REV16.json [4,569,570 bytes], and dist/report_clean_extracted_handoff_kit_e2e.json [4,569,570 bytes] are 100% byte-identical with SHA-256 0ad5ff7bada90cc870a22beb43f838b6592ab1d3aa0c9b6fa7a11536a4dabaa9; verified via scripts/verify_handoff_archive_integrity.js and recorded in dist/report_handoff_archive_integrity.json)
- Canonical Schedule Revision: 16 (verified canonical GitHub schedule; IVCS Manager/schedule strictly ChatGPT-only)
- Collaboration Mode: Manual ChatGPT <-> Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Owner UAT Gate Decision). Release HOLD strictly maintained. Zero external public submissions.

---

## 0. Directive #6707178560 (State Rev .723) — REV16 HARNESS-SEEDED DISPOSABLE UAT PROFILE, CHROME API READBACK ATTESTATION, NEGATIVE CONTROLS, FROZEN REV15 PRESERVATION & DUAL-VERIFIED REV16 COMPLETE HANDOFF KIT

1. **Item 1 — Disposable UAT Profile Harness Initialization, Strict Key Allowlisting & Chrome Extension API Readback Attestation (`scripts/xpider_safe_update.js`)**:
   - Added `init-uat-profile --profile-dir <dir>` which verifies `<dir>` is brand-new or empty (`UAT_PROFILE_NOT_CLEAN_ON_INIT`), generates a cryptographically secure 256-bit `uatSessionNonce`, and writes `.xpider-uat-disposable-profile.json`.
   - Upgraded `auditUatStateObj`: enforces strict top-level key allowlisting (`ALLOWLISTED_UAT_TOP_KEYS`, failing closed on any unknown/unrecognized key with `UNRECOGNIZED_STORAGE_KEY_IN_UAT_PROFILE`), verifies `state.xpider_uat_session_nonce === expectedUatNonce` (`UAT_SESSION_NONCE_MISMATCH`), strictly validates every queued URL in `savedUrlLists_v2` and `xpider_paused_checkpoint` via `new URL(u)` requiring loopback hostnames (`127.0.0.1`, `localhost`, `[::1]`), and inspects decoded/unescaped/base64/zlib-decompressed/JSON-deserialized text for non-loopback URLs, non-synthetic emails, and proxy credential sentinels.
   - Upgraded `backup-storage` / `backup-uat-synthetic`: requires `.xpider-uat-disposable-profile.json` (`MISSING_DISPOSABLE_UAT_PROFILE_IDENTITY`) AND explicit `chrome.storage.local.get(null)` JSON readback (`--storage-readback <readback.json>` or auto `.xpider-uat-storage-readback.json`, `MISSING_CHROME_API_READBACK_FOR_SYNTHETIC_BACKUP`), binding `uatSessionNonce`, `chromeApiReadbackSha256`, and `expectedSnapshotManifestSha256` inside the AES-256-GCM payload.
   - Documented explicit qualification note (`ATTESTATION_QUALIFICATION_NOTE`): AES-256-GCM authenticates asserted backup scope, disposable session nonce, Chrome storage API readback hash, and LevelDB file manifest SHA-256; it does NOT mathematically prove provenance of arbitrary uninspected LevelDB binaries.
2. **Item 2 — Comprehensive Negative Controls (`test/run_uat_synthetic_profile_isolation_check.js`, `test/run_clean_extracted_handoff_kit_e2e.js`)**:
   - Tested DUMMY compressed (zlib/base64), UTF-8/Unicode (`https://더미실제고객도메인.kr/contact`, `더미고객@실제회사.kr`), escaped URLs (`https:\/\/...`, `\u0068\u0074\u0074\u0070\u0073://...`), split/serialized JSON storage values, unrecognized storage keys (`unrecognized_production_stash_key` -> `UNRECOGNIZED_STORAGE_KEY_IN_UAT_PROFILE`), proxy credential sentinels, and restoring with `--allow-synthetic-uat-restore` into a non-`uat` path lacking `.xpider-uat-disposable-profile.json` (`MISSING_DISPOSABLE_UAT_PROFILE_IDENTITY` before touching disk). All failed closed as required.
3. **Item 3 — Restoring Real Backups Allowed on Real Folders Containing 'uat' Substring (`scripts/xpider_safe_update.js`)**:
   - Reworked restore decision to not rely on folder name alone: `restore-storage --confirm-offline-owner-recovery` allows legitimate emergency recovery on real folders whose path happens to contain `'uat'` (`real_owner_stuart_uat_folder`), while still strictly refusing any disposable UAT profile containing `.xpider-uat-disposable-profile.json` (`REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN`).
4. **Item 4 — Preserved Frozen REV15 Archive & Built Dual-Verified REV16 Complete Handoff Kit (`scripts/build_owner_complete_handoff_kit.js`)**:
   - Verified that prior REV15 archive `dist/XPIDER_V7.0.0_CANDIDATE_REV15_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip` (`4,560,445 bytes`, SHA-256 `43a9bcdfff9651b8f31644d31dc8eba0463e8b5ee1163f198096b0d2a99959cd`) and `dist/OWNER_HANDOFF_MANIFEST_REV15.json` remain untouched and frozen on disk.
   - Assembled newly versioned `dist/XPIDER_V7.0.0_CANDIDATE_REV16_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip` (`4,569,570 bytes`, SHA-256 `0ad5ff7bada90cc870a22beb43f838b6592ab1d3aa0c9b6fa7a11536a4dabaa9`) and `dist/OWNER_HANDOFF_MANIFEST_REV16.json` verified via two independent methods (`Node.js crypto` + Windows PowerShell `Get-FileHash` & `.NET ZipFile`). Note: Earlier receipt #6707514638 prose text contained a clerical typo citing 4,563,892 bytes; the physical binary was never replaced or mutated and remains immutable at 4,569,570 bytes.
5. **Item 5 — Clean-Room Extracted E2E Verification (`test/run_clean_extracted_handoff_kit_e2e.js`, `16/16 PASS`)**:
   - Verified newly versioned REV16 handoff kit from a brand-new temp extraction directory outside the repository tree across all 16 assertions.

---

## 1. Verified Suites Summary (Developer-Executed)
- **Clean-Extracted Handoff Kit E2E Suite**: `dist/report_clean_extracted_handoff_kit_e2e.json` (`16/16 PASS`).
- **UAT Isolation, Preflight, Synthetic Restore Guard & Handoff Manifest Suite**: `dist/report_uat_synthetic_profile_isolation.json` (`23/23 PASS`, `transmittedExternalRequests: 0`).
- **Safe Update + Encrypted Storage Backup/Restore Suite**: `dist/report_safe_update_transaction.json` (`57/57 PASS`).
- **Google Chrome `157.0.8103.38` Migration Parity Suite**: `dist/report_chrome_migration_parity.json` (`37/37 PASS`).
- **Google Chrome `157.0.8103.38` UI, Reset, CSV, Email Collector & Consent Suite**: `dist/report_chrome_ui_and_reset_verification.json` (`18/18 PASS`).
- **Clean-Room Package Suite**: `dist/report_clean_room_package_suite.json` (`22/22 PASS`).
- **Deep Content-Level Secret Audit**: `dist/report_public_repo_secret_audit.json` (`ALL_CLEAN`, finite pattern scanner coverage noted).

---

## 2. Active Gate Status & Separate External Boundaries
- **RELEASE HOLD strictly maintained**.
- Permissioned / Blocked Gates:
  1. Host OS-level Windows Defender Firewall default-deny (`netsh advfirewall`): `BLOCKED` (`BLOCKED_NO_SAFE_ELEVATED_TEST_VM`).
  2. Live Owner Windows 10 PC desktop smoke: `NOT_TESTED` (`OWNER_ACTION_REQUIRED`).
  3. Real external NopeCHA extension interoperability: `NOT_TESTED` (`OWNER_ACTION_REQUIRED`).
  4. Authorized DigitalOcean / Decodo VPN/Proxy egress (IP / DNS / IPv6 / WebRTC): `NOT_TESTED` (`OWNER_ACTION_REQUIRED`).
  5. Owner final release / live update approval: `NOT_TESTED` (`OWNER_ACTION_REQUIRED`).
- Base branch `major/v7-dual-mode` remains 100% frozen RC11 (`20678ada`), schedule tip `e360270d` (Revision 15).
- Zero public form submissions (localhost `127.0.0.1:8088` only).
- IVCS Manager and canonical schedule completely untouched (strictly ChatGPT-owned).
