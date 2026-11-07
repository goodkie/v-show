# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip cf96bc08)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-06.713
- Authority Cursor: 6699377538 (Responding to ChatGPT Directive #6699377538: Owner-Safe Installable Candidate Package, Clean-Room Package Chromium Load Test, 50-File Code Tree Audit, Windows 10 Acceptance Procedure, Release Hold)
- Canonical Schedule Revision: 9 (verified canonical GitHub schedule blob 39a0243f7c334470163deeed59cf6f306b48e72a at commit cf96bc0891c422e371ba6dd3077b99e35462026e)
- Collaboration Mode: Manual ChatGPT ↔ Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Gate Decision). Release HOLD maintained. Zero external public submissions.

---

## 1. Directive #6699377538 Execution & Deliverables

### A. Owner-Safe Installable Candidate Artifact
- **Package Archive**: `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`
- **File Size**: `4,467,833` bytes (~4.46 MB)
- **SHA-256 Checksum**: `b3f39bec4ab0711bbe348614be6bbd1f8d0657987059ec7cd3538565c2c0227e`
- **Total Files**: 50 files (100% complete extension bundle)
- **File Inventory**: Recorded in `dist/PACKAGE_INVENTORY_SHA256.json`
- **Secret Hygiene & Manifest Permissions**:
  - Hardcoded credentials, private tokens, API keys: **0 VIOLATIONS (PASS)**
  - Manifest Version: 3 | Extension Version: 7.0.0
  - In-app solver permissions: 0 (No audio STT, No external solver API endpoints)
  - Manifest Permissions (14): `storage`, `tabs`, `scripting`, `activeTab`, `sidePanel`, `alarms`, `downloads`, `debugger`, `privacy`, `proxy`, `webRequest`, `webRequestAuthProvider`, `nativeMessaging`, `declarativeNetRequest`
  - Clean-room unpacked directory: `dist/clean_room_unpacked_v7` (100% byte-matched to archive)

### B. Clean-Room Package-Level Chromium Load Test (`test/run_chromium_v7_clean_room_package_suite.js`)
- **Loaded Extension**: Strictly from clean-room unpacked package `dist/clean_room_unpacked_v7` (NOT source `extension/`)
- **Profile**: Fresh isolated disposable Chromium profile
- **Raw Command**: `node test/run_chromium_v7_clean_room_package_suite.js`
- **Exit Code**: `0`
- **Execution Window**: `2026-11-07T00:22:58Z` to `2026-11-07T00:24:20Z`
- **Assertions**: **21 / 21 PASS (100%)**
- **Report**: `dist/report_clean_room_package_suite.json`
- **Screenshots**:
  1. `dist/evidence_clean_room/shot_clean_room_01_popup_visible_controls.png`: Visible START button, default-OFF `#xpider-opt-include-no-message`, mode buttons, `#stop-save-btn`.
  2. `dist/evidence_clean_room/shot_clean_room_02_auto_submission.png`: AUTO mode autonomous submission on `contact-standard.html` (1 POST recorded).
  3. `dist/evidence_clean_room/shot_clean_room_03_no_message_optin.png`: Message-less `subscribe-no-message.html` skipped when default OFF (0 POSTs); accepted and submitted when explicit ON (+1 POST).
  4. `dist/evidence_clean_room/shot_clean_room_04_manual_assist_unpacked.png`: MANUAL mode renders `#xpider-v7-manual-hold-panel` (`data-mode="MANUAL"`); 0 submissions until operator click; human operator submits via `#xpider-manual-registered-btn` (+1 POST).
  5. `dist/evidence_clean_room/shot_clean_room_05_sw_crash_restore_unpacked.png`: Stop & Save checkpoint saved; Service Worker forcibly killed via CDP `Target.closeTarget`; fresh SW reboot fully restores checkpoint, queue, and mode.

---

## 2. Complete 50-File Code Tree Audit vs Frozen RC11 (`20678ada`)

### A. 38 Unchanged Baseline Files (100% Byte-Identical, 0 Diff)
- `extension/manifest.json`: 100% BYTE-IDENTICAL
- `extension/modules/template-store.js`: 100% BYTE-IDENTICAL
- `extension/modules/history-store.js`: 100% BYTE-IDENTICAL
- `extension/modules/email-collector.js`: 100% BYTE-IDENTICAL
- `extension/modules/privacy-gateway.js`: 100% BYTE-IDENTICAL
- `extension/modules/operation-queue.js`: 100% BYTE-IDENTICAL
- `extension/modules/vision-submit-executor.js`: 100% BYTE-IDENTICAL
- `extension/modules/mock-captcha-provider-adapter.js`: 100% BYTE-IDENTICAL
- `extension/popup.css`: 100% BYTE-IDENTICAL
- `extension/options.html`: 100% BYTE-IDENTICAL
- `extension/options.js`: 100% BYTE-IDENTICAL
- `extension/translations.js`: 100% BYTE-IDENTICAL
- `extension/blacklist.json`: 100% BYTE-IDENTICAL
- 25 image/icon assets (`icons/`, `images/`): 100% BYTE-IDENTICAL

### B. 12 Files with Deltas (All Classified as Intended P0 Fixes, 0 Regressions)
1. `modules/build-provenance.js`: Intended alignment of `implementationHead` to frozen RC11 `20678ada`. Zero risk.
2. `modules/challenge-gate.js`: Intended exclusion of `.cf-turnstile` / `.h-captcha` from `recaptchaWidget` selector. Zero risk.
3. `modules/smart-field-resolver.js`: Intended retirement of in-app math equation solver in Section H. Zero risk.
4. `modules/math-captcha-solver.js`: Intended retirement stub throwing `INTERNAL_SOLVER_RETIRED_V7`. Zero risk.
5. `solver-core.js`: Intended retirement stub throwing `IN_APP_SOLVER_RETIRED` (-905 lines of legacy solver code removed). Zero risk.
6. `modules/contact-gate.js`: Intended newsletter opt-in intent recognition when `includeFormsWithoutMessage` is explicitly ON; tri-state precedence (`typeof === 'boolean'`); unauthorized consent guard. Low risk (tested).
7. `modules/final-form-completion-engine.js`: Intended marketing consent guard (`UNAUTHORIZED_CONSENT_SKIPPED`); tri-state precedence; unfillable required fields settle as `AUTOMATION_FAILED`. Low risk (tested).
8. `background.js`: Intended consent-qualified skip mapping; strict operational failure settlement; solver retirement stubs; storage persistence. Low risk (tested).
9. `content-script.js`: Intended external CAPTCHA retry bounded `<= 3`; AUTO mode renders 0 intervention buttons; single POST boundary enforcement. Low risk (tested).
10. `popup.html`: Intended UI restoration: `#xpider-opt-include-no-message` checkbox (default OFF), `#stop-save-btn`, `#resume-mode-modal`. Zero risk.
11. `popup.js`: Intended UI event binding for checkbox, stop-save, and resume modal. Zero risk.
12. `PACKAGE_INVENTORY_SHA256.txt`: Intended inventory hashes update. Zero risk.

---

## 3. Windows 10 Owner Acceptance & Rollback Procedure

### A. Candidate Installation / Update
1. Download or locate `dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip`.
2. Extract to a dedicated local directory, e.g. `C:\xpider-v7-candidate\`.
3. Open Google Chrome or Microsoft Edge and navigate to `chrome://extensions` or `edge://extensions`.
4. Enable "Developer mode" in the top-right corner.
5. If updating existing unpacked extension: click "Reload" icon on the XPIDER extension card.
   If fresh install: click "Load unpacked" and select `C:\xpider-v7-candidate\`.
6. Confirm Extension ID and Version (7.0.0). Pin icon to toolbar.

### B. Instant Rollback Procedure
1. Extract frozen RC11 release zip `XPIDER_V7.0.0_RC11_DUAL_MODE_OWNER_BETA.zip` to `C:\xpider-rc11\`.
2. At `chrome://extensions`, click "Load unpacked" and select `C:\xpider-rc11\`.
3. All user settings, templates, CSV data, history records, and Email Collector data remain intact in `chrome.storage.local`.

### C. Non-Sensitive Local Observations (Owner Testing)
1. **External NopeCHA Interoperability**:
   - Install official NopeCHA extension from Chrome Web Store.
   - Run local fixture test `http://127.0.0.1:8088/captcha-turnstile-dom.html`.
   - Observe XPIDER unobtrusive status banner (`External CAPTCHA solver active... waiting <= 3 attempts`).
   - Confirm NopeCHA solves challenge and XPIDER submits form autonomously upon solution.
2. **Privacy Relay & Fail-Closed**:
   - With Privacy Relay offline, start campaign in STRICT mode: observe `PRIVACY GATE BLOCKED START` overlay.
   - Start Privacy Relay (`node companion/privacy-relay-service.js`): observe green "PROTECTED" status.
3. **No Public POST Invariant**: Never submit to public/external websites during acceptance testing.

---

## 4. Acceptance Checklist

| Item | Classification | Verification / Evidence |
|---|---|---|
| Owner-Safe Artifact Packaging | **PASS** | `XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip` (SHA256: `b3f39bec4ab0...`, 50 files) |
| Clean-Room Package Chromium Load Test | **PASS** | 21 / 21 Assertions PASS (100%), Exit 0, 5 screenshots captured |
| Code Tree & Manifest Audit (50 files) | **PASS** | 38 files 100% byte-identical, 12 files intended P0 changes, 0 regressions |
| Secret Hygiene & Manifest Permissions | **PASS** | 0 hardcoded credentials, 0 in-app solver permissions, MV3 compliant |
| Preserved User Data / Stores | **PASS** | TemplateStore, HistoryStore, EmailCollector, PrivacyGateway 100% identical |
| External NopeCHA Real Extension Interop | **NOT_TESTED / UNKNOWN** | All internal solvers retired; external extension simulation used on localhost |
| Live Decodo / DigitalOcean Billable Egress | **NOT_TESTED / UNKNOWN** | Zero unauthorized public proxy egress; local fail-closed architecture confirmed |
| Owner Windows 10 Live Desktop Smoke | **NOT_TESTED / UNKNOWN** | Automated tests executed in isolated Chromium instances; awaiting Owner smoke |
| Production Release Gate | **RELEASE HOLD** | Strict release hold maintained pending independent ChatGPT audit & Owner smoke |
