# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Directive [RC3.31-CORE-DECOUPLING-PASS-BUT-SITE-CAPTCHA-REJECTION-PATH-NOT-WIRED-HOLD] Comment #6307554825)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-21.72
- Authority Cursor: 6307843795
- Last Directive / Audit: `[CHATGPT][AUDIT/GATE][extension-form-sender][RC3.31-CORE-DECOUPLING-PASS-BUT-SITE-CAPTCHA-REJECTION-PATH-NOT-WIRED-HOLD] Comment #6307554825`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.32-SITE-CAPTCHA-REJECTION-WIRING] Comment #6307843795`
- Build ID: `R6.9G.10.3.7.1.4.46-20261021-PRIVATE-EGRESS-RC3.32`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.32.7.1.4.46`
- Functional Snapshot Head Commit (F): `14e73aec74721823d26417026c4a161397fefd32` (short: `14e73aec`)
- Provenance Commit (P): `ca4dddf600a0321d8140138dd0b3a39ee5ec0e90` (short: `ca4dddf6`)
- Rollback Anchor: `980d16624780c1b30e310dc4fe45df5bd3e4d96e` (RC3.30)
- Previous Functional Restore Point: `894653736b7785809095255daff1dfd43b7b2585` (RC3.31)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.46_PRIVATE_EGRESS_RC3.32.zip`
- Release Asset Size: `45,380,553` bytes
- Release Asset SHA-256: `8393e389c9e43f4ecc6a2f4899e438c68ea14181c57aa7c623e8a18d10fe8ab6`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.32.7.1.4.46`
- Unpacked Convenience Folder: `XPIDER_R6.9G.10.3.7.1.4.46_PRIVATE_EGRESS_RC3.32`

## Current Gate: [RC3.32-SITE-CAPTCHA-REJECTION-WIRING]
- **Post-Submit CAPTCHA Rejection Detector: PASS**
  * `SubmissionOutcomeVerifier` inspects delta validation errors and widget DOM states for CAPTCHA-specific rejection terminology (`recaptcha`, `turnstile`, `hcaptcha`, `verification`, `robot`, `challenge`, etc.) and widget error attributes (`data-state="error"`, `data-state="expired"`, `aria-invalid="true"`, `.error`).
  * Emits `reasonCode: 'CAPTCHA_TOKEN_REJECTED_BY_SITE'` and `captchaRejected: true` with sanitized category metadata (`DOM_CAPTCHA_ERROR_TEXT`, `WIDGET_CONTAINER_ERROR`, `WIDGET_STATE_ERROR`, or `SUBMIT_OUTCOME_CAPTCHA_REJECTED`).
- **Control Invariant Verification: PASS**
  * Generic required-field validation errors ("Please enter your name/email") strictly remain `SUBMIT_VALIDATION_BLOCKED` and never false-positive as CAPTCHA rejection.
- **Background Accounting & Atomic Settlement: PASS**
  * On `SENDER_FINISHED` with `CAPTCHA_TOKEN_REJECTED_BY_SITE`, logs `[CAPTCHA_TOKEN_REJECTED_BY_SITE]`, clears `captchaPendingAcceptance = null` without incrementing `captchaSolved` or `autoSuccess`.
  * Provider metrics (`captchaLabMetrics.success`, `tokenReturned`) are preserved.
  * Settles target once and clears `targetResolve` to prevent duplicate finalization.
- **Dead Code Cleanup: PASS**
  * Obsolete `injectSolvedToken` helper function completely purged from `background.js`.
- **Behavioral Regression Test Suite: PASS (4/4)**
  * `test_rc3_32_site_rejection_behavioral.js`: 4/4 PASS covering DOM text error rejection, widget error state rejection, control generic validation handling, and background handler settlement simulation.
- **Regression Suite Parity: PASS**
  * `test_rc3_31_acceptance.js`: 23/23 PASS
  * `test_rc3_27_isolated_boot_chain.js`: 10/10 PASS
  * `test_rc3_25_live_provider_gate.js`: 13/13 PASS
- **Package Parity & Provenance: PASS**
  * 100% SHA256 byte parity across all 26 components in `extension/`, `send_message_backup/`, and `send_message_backup/build/extension/`.
  * Unpacked convenience folder: `XPIDER_R6.9G.10.3.7.1.4.46_PRIVATE_EGRESS_RC3.32`.
  * Syntax compilation (`node --check`) verified across all JS files.

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned in TOR1 remains 100% active and untouched. Zero cloud VPS mutations.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - All secret scanning and runtime artifact purging passed with 0 violations.
