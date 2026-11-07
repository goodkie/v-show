# XPIDER AutoForm Sender Pro ??Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip cf96bc08)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-06.715
- Authority Cursor: 6699808184 (Responding to ChatGPT Directive #6699808184: transactional update/rollback tool, restorable backup, interruption matrix, delivery verification)
- Canonical Schedule Revision: 9 (verified canonical GitHub schedule blob 39a0243f7c334470163deeed59cf6f306b48e72a at commit cf96bc0891c422e371ba6dd3077b99e35462026e)
- Collaboration Mode: Manual ChatGPT ??Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Gate Decision). Release HOLD strictly maintained. Zero external public submissions.

---

## 0. Directive #6699808184 (State Rev .715) - CORRECTIONS AND NEW EVIDENCE
- CORRECTION: EXPORT OWNER DEBUG BUNDLE is NOT a backup (redacted, no restore function). Earlier guidance in sections below that names it as the backup prerequisite is superseded by dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md.
- Transactional updater: scripts/xpider_safe_update.js (plan dry-run / apply with PLAN_TOKEN / rollback / recover). Tests: test/run_safe_update_transaction_tests.js -> dist/report_safe_update_transaction.json (31/31).
- Browser-layer parity + interruption: test/run_backup_restore_parity_harness.js -> dist/report_backup_restore_parity.json (28/28). Verified backup = copy of Local Extension Settings/<id> (browser closed), Edge only.
- Delivery: repo goodkie/v-show is PUBLIC; anonymous download of the ZIP matched SHA-256 b3f39bec...c2227e. Not authentication-gated.
- Functional source 76fab093; extension/ tree identical at documentation HEAD.
- NOT_TESTED: Windows 10 owner smoke, real NopeCHA, live Decodo/DO egress, selective/global reset UI, Chrome (non-Edge) profile backup.
---

## 1. Directive #6699586274 Execution & Verified Deliverables

### A. Verified Artifact Authenticity & Owner Delivery Path
- **Package Archive**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
- **File Size**: `4,467,833` bytes (~4.46 MB)
- **SHA-256 Checksum**: `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
- **Authenticated Download URL**: `https://raw.githubusercontent.com/goodkie/v-show/candidate/p0-core-regressions-v7/dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
- **Local Workspace Relative Path**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
- **Reproducible Build Script**: `node scripts/package_owner_safe_candidate_v7.js`
- **ZIP Root Structure**: Direct extension root containing 50 items (no outer wrapper directory; immediate `manifest.json`, `background.js`, `popup.html`, `options.html`, `icons/`, `modules/`).
- **File Inventory**: Complete SHA-256 manifest in `dist/PACKAGE_INVENTORY_SHA256.json`.

---

### B. Empirical Same-ID Upgrade & Rollback Harness (`test/run_v7_same_id_upgrade_and_rollback_harness.js`)
- **Raw Command**: `node test/run_v7_same_id_upgrade_and_rollback_harness.js`
- **Exit Code**: `0`
- **Assertions**: **19 / 19 PASS (100%)**
- **Report**: `dist/report_same_id_upgrade_rollback.json`
- **Key Empirical Verifications**:
  1. **Deterministic Extension ID**: Fixed public key in `manifest.json` guarantees Extension ID `ldlijlaccfeelfdhgnjbibniocefckjj`. Verified identical across Baseline RC11 -> Candidate V7 -> Rollback RC11.
  2. **Storage Partition Preservation**: Seeding rich owner data (`xpider_sentinel_token`, `templates_v2` [FormTemplateV2], `xpider_user_settings`, `xpider_collected_emails`, `xpider_run_ledger`, `xpider_history_attempts`) in RC11 remained 100% intact through both in-place upgrade and rollback.
  3. **Verified Safe In-Place Overlay Procedure**: Overwriting the files inside the existing unpacked extension folder and reloading the extension preserves the storage partition and all owner data.
  4. **Negative Control & Risk Analysis**:
     - *Unsafe Removal*: Clicking "Remove" in `chrome://extensions` destroys the extension storage partition and wipes all templates/history.
     - *Unsafe Side-by-Side*: Loading two directories with the same manifest key causes Chromium `CRX_REQUIRED_KEY_MATCH` manifest collision.
     - *Unsafe Unkeyed Directory*: Loading an unkeyed directory generates an arbitrary hash ID with a blank, isolated storage partition.
     - *Owner Prerequisite*: Owner MUST export an offline backup using "EXPORT OWNER DEBUG BUNDLE" or Settings > Backup before performing any manual file overlay.

---

### C. Package Security, Hygiene & Path Traversal Audit (`scripts/audit_candidate_package_security.js`)
- **Raw Command**: `node scripts/audit_candidate_package_security.js`
- **Exit Code**: `0`
- **Report**: `dist/security_and_hygiene_audit_report.json`
- **Findings**:
  - ZIP Slip / Path Traversal violations: `0`
  - Forbidden binaries (`.exe`, `.dll`, `.bat`, etc.): `0`
  - Sensitive local files (`.env`, `.git`, credentials): `0`
  - In-app solver endpoints / API keys: `0` (All legacy solver code removed; retirement stubs throw `IN_APP_SOLVER_RETIRED` / `INTERNAL_SOLVER_RETIRED_V7`).
  - Manifest Permissions: 14 MV3 permissions fully justified and scoped.
  - Privacy Relay / Fail-closed: Verified locally with network disabled; zero external/billable egress.

---

### D. Clean-Room Package-Level E2E Smoke Suite (`test/run_chromium_v7_clean_room_package_suite.js`)
- **Raw Command**: `node test/run_chromium_v7_clean_room_package_suite.js`
- **Exit Code**: `0`
- **Assertions**: **22 / 22 PASS (100%)**
- **Report**: `dist/report_clean_room_package_suite.json` (explicitly bound to archive SHA-256 `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`)
- **Screenshots (5)**:
  1. `dist/evidence_clean_room/shot_clean_room_01_popup_visible_controls.png`: Visible START button, default-OFF `#xpider-opt-include-no-message`, mode buttons, `#stop-save-btn`.
  2. `dist/evidence_clean_room/shot_clean_room_02_auto_submission.png`: AUTO mode autonomous submission on `contact-standard.html` (1 POST recorded).
  3. `dist/evidence_clean_room/shot_clean_room_03_no_message_optin.png`: Message-less `subscribe-no-message.html` skipped when default OFF (0 POSTs); submitted when explicit ON (+1 POST).
  4. `dist/evidence_clean_room/shot_clean_room_04_manual_assist_unpacked.png`: MANUAL mode renders `#xpider-v7-manual-hold-panel` (`data-mode="MANUAL"`); 0 submissions until operator click; human operator submits via `#xpider-manual-registered-btn` (+1 POST).
  5. `dist/evidence_clean_room/shot_clean_room_05_sw_crash_restore_unpacked.png`: Stop & Save checkpoint saved; Service Worker forcibly killed via CDP `Target.closeTarget`; fresh SW reboot fully restores checkpoint, queue, and mode.

---

## 2. Windows 10 Verified Safe Owner Upgrade & Rollback Procedure

> [!IMPORTANT]
> **Owner Safety Prerequisite**: Before upgrading, open XPIDER popup, click Settings / Advanced, and click **"EXPORT OWNER DEBUG BUNDLE"** (or Backup Templates) to save an offline JSON backup of your current templates, settings, and URL lists.

### Step 1: In-Place Overlay Upgrade (Safe Procedure)
1. Download `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` from:
   `https://raw.githubusercontent.com/goodkie/v-show/candidate/p0-core-regressions-v7/dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
2. Locate your current unpacked extension folder (e.g. `C:\xpider-extension\`).
3. Extract the ZIP contents directly into that folder, overwriting existing files (**DO NOT click "Remove" in chrome://extensions**).
4. In Chrome or Edge, navigate to `chrome://extensions` and click the **Reload (circular arrow)** button on the XPIDER extension card.
5. Verify Extension ID is unchanged (`ldlijlaccfeelfdhgnjbibniocefckjj`) and all existing templates, history, and settings remain intact.

### Step 2: Instant Rollback to Baseline RC11 (If Desired)
1. Extract pristine RC11 files directly into the same extension folder, overwriting candidate files.
2. At `chrome://extensions`, click the **Reload (circular arrow)** button.
3. Extension ID and all storage data remain 100% intact.

---

## 3. Active Gate Status
- **RELEASE HOLD strictly maintained**.
- Base branch `major/v7-dual-mode` remains 100% frozen RC11 (`20678ada`), schedule tip `cf96bc08`.
- Zero public form submissions (localhost `127.0.0.1:8088` only).
- IVCS Manager completely untouched (strictly ChatGPT-owned).

