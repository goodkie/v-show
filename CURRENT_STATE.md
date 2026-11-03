# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode remains 100% frozen RC11)
- State Rev: 2026-11-03.500
- Authority Cursor: IC_kwDOT53X288AAAABiTkjVg (Responding to ChatGPT Source Audit & Immediate P0 Patch Target Comment #903)
- Canonical Schedule Revision: 5
- Collaboration Mode: Manual ChatGPT ↔ Antigravity Collaboration restored per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit). Release HOLD maintained. Zero external public submissions.

---

## 1. P0 Core Recovery & Immediate Patch Target Implementation

### A. Root Cause Resolution in `extension/content-script.js`
1. **Non-Empty Stale/Mutated Value Detection in `verifyFieldIntegrity()`**:
   - **Diagnosis**: Integrity repair previously executed only if the field was empty (`(!currentVal || currentVal.trim() === '')`). In controlled components (React, Vue, Angular) where internal state reverted a filled textarea to a nonempty stale or truncated draft on blur or before submit, the check returned `intact: true` despite mismatching the frozen authoritative value.
   - **Fix**: Replaced empty-only check with value mismatch detection:
     `const isMismatched = expectedVal && expectedVal.trim() !== '' && (currentVal.trim() !== expectedVal.trim());`
     Correctly classifies `FIELD_VALUE_MUTATED_BEFORE_SUBMIT` and executes targeted authoritative same-value repair.
2. **Safe Dynamic Active Root Lookup & Selector Token Escaping**:
   - **Diagnosis**: Dynamic SPAs unmount and replace `<form>` DOM nodes during user interaction. Locating replacement fields solely via `originalForm.querySelector(...)` caused failures on detached nodes. Special characters in IDs/names could also invalidate query selector strings.
   - **Fix**: Implemented active root fallback lookup:
     `const activeRoot = (form && form.isConnected && form.querySelector) ? form : (document.querySelector('form') || document);`
     Applied safe selector escaping using `CSS.escape(expected.id)` and `CSS.escape(expected.name)`.
3. **Full Controlled Component Event & Blur Lifecycle**:
   - **Diagnosis**: DOM property setters alone do not commit state to React's synthetic event tracker (`_valueTracker`), leading to transient value rollbacks on subsequent events.
   - **Fix**: Reset `el._valueTracker.setValue('')` before setting values, dispatching full event sequence (`focus`, `input`, `change`, `blur`) to ensure framework state commits and survives pre-submit gates.
4. **SubmitExecutorR5 Pre-Submit Readiness**:
   - Refreshes form reference if `this.form && !this.form.isConnected`. Fails pre-submit readiness on any unrecoverable integrity fault (`PRE_SUBMIT_READINESS_FAILED`).

### B. Core Durability & Recovery in `extension/background.js`
1. **Preserving Run-Scoped Direct Privacy across Stop & Save**:
   - Removed premature zeroing of `campaignState.runScopedDirectPrivacy = false` in `STOP_AND_SAVE_CAMPAIGN` prior to snapshot creation.
   - Ensures `runScopedDirectPrivacy: true` is safely serialized into `xpider_paused_checkpoint`, preserving the user's direct transport mode across SW termination and resume.
2. **Race Guard in `restoreCampaignState()`**:
   - Added guard: `if (campaignState.isActive) { return resolve(); }`.
   - Prevents async storage hydration on boot from clobbering a campaign that has already been actively resumed/started by an incoming message.

### C. Deterministic Test Fixtures (`owner-extension-test-site/`)
1. `dynamic-react-controlled-stale-revert.html`: Controlled textarea initialized with stale draft `STALE_DRAFT_VALUE_NON_EMPTY`. On blur, simulates transient framework rollback to stale draft. Submit gate strictly blocks submission if message equals stale draft.
2. `dynamic-spa-replaced-form.html`: Component that unmounts `<form id="contact-form-1">` on message focusout and remounts `<form id="contact-form-2">` with a fresh empty textarea, verifying dynamic active root repair.
3. `phone-only-no-message.html`: Form containing phone and name but strictly NO long-text inquiry field, settling as `SKIPPED: NO_LONG_TEXT_INQUIRY_FIELD` with 0 submissions delta.
4. `homepage-with-dead-contact-link.html`: Formless homepage linking to 404/dead target, settling honestly as `FAILURE: NO_ACCESSIBLE_INQUIRY_FORM` with 0 submissions delta.

---

## 2. Comprehensive Test Execution & Evidence

### Test Suite Results Summary
| Test Suite / Harness | Command | Assertions | Status | Exit Code | Evidence Report |
|---|---|:---:|:---:|:---:|---|
| **Item C & Dynamic React E2E Suite** | `node test/run_chromium_v7_item_c_contact_and_dynamic_message.js` | 22 / 22 | **100% PASS** | **0** | `owner-extension-test-site/evidence/evidence_v7_item_c_contact_and_dynamic_message_report.json` |
| **Real Mutant Sensitivity Harness** | `node test/run_v7_real_mutant_sensitivity.js` | 4 / 4 Mutants Killed | **100% SENSITIVE** | **0** | `owner-extension-test-site/evidence/evidence_v7_real_mutants_report.json` |
| **Unified SC-03 & SC-04 Suite** | `node test/run_chromium_v7_task3_and_task4_suite.js` | All Invariants Pass | **100% PASS** | **0** | `owner-extension-test-site/evidence/evidence_v7_task3_and_task4_report.json` |
| **P0 UI & Mode Coherence Suite** | `node test/run_chromium_v7_p0_ui_and_mode_coherence.js` | 30 / 30 | **100% PASS** | **0** | `owner-extension-test-site/evidence/evidence_v7_p0_ui_and_mode_coherence_report.json` |

### Item C 5-Target Reconciliation
1. **Target 1 (Homepage Discovery -> Standard Form)**: `CONFIRMED_SUCCESS` (1 HTTP POST recorded, receipt captured).
2. **Target 2 (Dynamic React Stale Revert)**: `CONFIRMED_SUCCESS` (1 HTTP POST recorded, authoritative message submitted).
3. **Target 3 (Dynamically Replaced Form SPA)**: `CONFIRMED_SUCCESS` (1 HTTP POST recorded, active root replacement repaired).
4. **Target 4 (Phone-Only Negative Control)**: `SKIPPED: NO_LONG_TEXT_INQUIRY_FIELD` (0 HTTP POSTs, strictly skipped).
5. **Target 5 (Dead Contact Route Negative Control)**: `FAILURE: NO_ACCESSIBLE_INQUIRY_FORM` (0 HTTP POSTs, honest failure).
- **Server Submissions**: Strictly 3 POSTs recorded for the 3 positive targets. Negative targets delta: strictly 0.
- **7-Bucket Reconciliation**: Total started: 5 = 3 Success + 1 Skipped + 1 Failure (0 discrepancy).

### Real Implementation Mutation Sensitivity (4/4 Mutants Killed)
1. **Mutant A (`extension/content-script.js`)**: Classified phone-only as FAILURE -> Runner Exit Code 1 (`Target 2 must be strictly SKIPPED (observed: FAILURE)`).
2. **Mutant B (`extension/popup.html`)**: Hidden `#stop-save-btn` -> Runner Exit Code 1 (`#stop-save-btn must be visibly rendered`).
3. **Mutant C (`extension/modules/history-store.js`)**: Omitted skipped bucket -> Runner Exit Code 1 (`completed must equal 3 (observed: 2)`).
4. **Mutant D (`extension/background.js`)**: Wiped post-restart queue -> Runner Exit Code 1 (`Restored remaining queue must be >= 2 across true SW restart (observed: 0)`).
- **Restoration**: All 4 mutated files restored byte-identically in `try...finally` blocks.

---

## 3. Baselines & Guardrails
- **Base Baseline**: `major/v7-dual-mode` (`20678ada`, RC11, 100% frozen).
- **IVCS Changes**: strictly 0 changes (ChatGPT owns IVCS exclusively).
- **External Requests**: strictly 0 external requests (all tests conducted on isolated `127.0.0.1:8088`).
- **Release Status**: RELEASE HOLD maintained.
