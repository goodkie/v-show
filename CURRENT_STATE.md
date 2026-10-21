# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Defect Report & Directive [RC3.32-REFERENCEERROR-CAPTCHA-TOKEN-FLAG-UNDECLARED-AND-HANG] Comment #6308024751)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-21.73
- Authority Cursor: 6308194275
- Last Directive / Audit: `[CHATGPT][OWNER-SMOKE][extension-form-sender][RC3.32-REFERENCEERROR-CAPTCHA-TOKEN-FLAG-UNDECLARED-AND-HANG] Comment #6308024751`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.33-CAPTCHA-FLAG-DECLARATION-AND-EXCEPTION-CONTAINMENT]`
- Build ID: `R6.9G.10.3.7.1.4.47-20261021-PRIVATE-EGRESS-RC3.33`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.33.7.1.4.47`
- Functional Snapshot Head Commit (F): `15ef47920555e4d0a506d007329d265dc78825c4` (short: `15ef4792`)
- Provenance Commit (P): `9fdc410316647fd77efb00959befaf62a98a95fd` (short: `9fdc4103`)
- Rollback Anchor: `980d16624780c1b30e310dc4fe45df5bd3e4d96e` (RC3.30)
- Previous Functional Restore Point: `14e73aec74721823d26417026c4a161397fefd32` (RC3.32)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.47_PRIVATE_EGRESS_RC3.33.zip`
- Release Asset Size: `45,381,976` bytes
- Release Asset SHA-256: `56a86cbbbd372dcee97f82f72339022155cc53e053327e19e3277057d7d8c085`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.33.7.1.4.47`
- Unpacked Convenience Folder: `XPIDER_R6.9G.10.3.7.1.4.47_PRIVATE_EGRESS_RC3.33`

## Current Gate: [RC3.33-CAPTCHA-FLAG-DECLARATION-AND-EXCEPTION-CONTAINMENT]
- **P0-A — Top-Level Flag Declaration: PASS**
  * Lexically declared `let _captchaTokenInjected = false;` adjacent to `let _isCaptchaSolved = false;` at the top level of `content-script.js`.
  * `waitForCaptchaSolved()` never throws `ReferenceError` during clean attempts.
- **P0-B — Attempt-Scoped State Reset: PASS**
  * Centralized `resetCaptchaRuntimeState(attemptId, epoch)` enforced across all attempt boundaries:
    1. `fillAndSubmit` entry
    2. `processCampaign` entry
    3. `TRIGGER_CAPTCHA_DETECTION` runtime message trigger/epoch change
    4. Terminal settlement `finishCampaign`
  * State invariant verified: Token integration state from target A never leaks into target B.
- **P0-C — Immediate Runtime Exception Settlement (Zero Hang / Zero TIMEOUT_LOCAL): PASS**
  * Guarded execution around `checkForCaptcha()` and `waitForCaptchaSolved()`.
  * On uncaught runtime exception inside CAPTCHA stage:
    1. Content emits `CAPTCHA_RUNTIME_EXCEPTION` message with `errorClass` and sanitized `safeMessage`.
    2. Content calls `finishCampaign(false, ..., 'CAPTCHA_RUNTIME_EXCEPTION', { errorClass, safeMessage })`.
    3. Background handles `CAPTCHA_RUNTIME_EXCEPTION`: cancels `targetDeadlineController`, clears watchdog and timeout alarms, resets `captchaPendingAcceptance = null`, sets stage to `SETTLED`, and immediately resolves `targetResolve` once.
    4. Eliminates the 3-minute watchdog hang; deterministic code exceptions settle immediately as `CAPTCHA_RUNTIME_EXCEPTION` without becoming `TIMEOUT_LOCAL`.
- **P0-D — Executable Behavioral Regression Test Suite: PASS (5/5)**
  * `test_rc3_33_captcha_flag_and_exception_containment.js`:
    - Test 1: Fresh attempt flag hygiene (`_captchaTokenInjected` starts false, no throw) — PASS
    - Test 2: `READY_TO_SUBMIT` flow (provider token injected -> resumes sequence) — PASS
    - Test 3: Attempt reset across sequential targets (zero leakage from Target A to B) — PASS
    - Test 4: Runtime exception containment (forced ReferenceError settles immediately, zero hang) — PASS
    - Test 5: Existing RC3.32 site rejection behavioral suite remains 100% green — PASS
- **Regression Suite Parity: PASS**
  * `test_rc3_32_site_rejection_behavioral.js`: 4/4 PASS
  * `test_rc3_31_acceptance.js`: 23/23 PASS
  * `test_rc3_27_isolated_boot_chain.js`: 10/10 PASS
  * `test_rc3_25_live_provider_gate.js`: 13/13 PASS
- **Package Parity & Provenance: PASS**
  * 100% SHA256 byte parity across all 26 components in `extension/`, `send_message_backup/`, and `send_message_backup/build/extension/`.
  * Unpacked convenience folder: `XPIDER_R6.9G.10.3.7.1.4.47_PRIVATE_EGRESS_RC3.33`.
  * Syntax compilation (`node --check`) verified across all unpacked JS files.

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned in TOR1 remains 100% active and untouched. Zero cloud VPS mutations.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - All secret scanning, pre-zip denylist scans, and runtime artifact purging passed with 0 violations.
