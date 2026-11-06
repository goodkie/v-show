# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode remains 100% frozen RC11 20678ada)
- Candidate Functional Commit: 76fab093bdfbc13f17cae9652a2339d675eb9a8f (short: 76fab093)
- Authoritative Candidate Remote Ref: refs/heads/candidate/p0-core-regressions-v7
- State Rev: 2026-11-06.709
- Authority Cursor: 6696002156 (Responding to ChatGPT Directive Comment #6696002156 / Node IC_kwDOT53X288AAAABjxzibA: Revision 8 6H Sprint Alignment, Fresh Verification Confirmation, Decodo/DO & NopeCHA UNKNOWN Ledger, Frozen Baseline Protection)
- Canonical Schedule Revision: 8
- Collaboration Mode: Manual ChatGPT ↔ Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit of Directive #6696002156). Release HOLD maintained. Zero external public submissions.

---

## 1. Directive #6696002156 Implementation & Defect Resolution

### A. Authoritative Remote Ref Provenance & Revision 8 Alignment
- Authoritative candidate remote ref: `refs/heads/candidate/p0-core-regressions-v7` at commit `416e733aca84ddd1cfd7d862c2dbceb2fa93514f`.
- Functional implementation base: `76fab093bdfbc13f17cae9652a2339d675eb9a8f` (`76fab093`).
- Canonical Schedule Revision updated to **8** per ChatGPT confirmed schedule.
- Frozen base branch: `major/v7-dual-mode` remains 100% frozen at RC11 commit `20678ada6491bf842ec7e996a88108152c76007f`.
- All user profiles, templates, CSV, History/Ledger, Email Collector, and relay configurations remain completely preserved.

### B. Manifest & In-App Solver Code Retirement
- `manifest.json`: Verified MV3 compliant; 0 retired solver permissions, 0 audio STT APIs.
- In-app solvers: All internal solvers (Wit.ai, Whisper, NopeCHA, 2Captcha, audio STT) remain 100% retired stubs throwing `IN_APP_SOLVER_RETIRED` or `INTERNAL_SOLVER_RETIRED_V7`. Math captcha solver in `smart-field-resolver.js` is verified retired. Zero internal solving calls permitted under any conditions.

### C. AUTO Mode No-Intervention Invariant & Bounded External Waiting (<= 3)
1. **No Intervention Popup in AUTO Mode**:
   - `handleV7ManualModeHold`: Suppressed in AUTO mode (`curMode === 'AUTO' -> Suppressing manual hold panel and failing safe`).
   - `waitForExternalOrUserChallengeV7`: When `curMode === 'AUTO'`, renders only an unobtrusive status HUD (`pointer-events: none`, 0 buttons) with `data-wait-count` and `data-mode="AUTO"`.
2. **Strictly Bounded External Extension Waiting/Retries (<= 3)**:
   - `content-script.js`: Tracks `window.__xpider_external_challenge_wait_count`.
   - If count exceeds 3, halts immediately with `❌ [CAPTCHA_EXTERNAL_MAX_RETRIES]` and fails closed with `CAPTCHA_EXTERNAL_MAX_RETRIES_EXCEEDED`.
3. **Zero Duplicate POST**:
   - `window.__xpider_submitBoundaryReached` and background `QUERY_SUBMIT_BOUNDARY` strictly guarantee exactly 1 POST per valid target, and 0 duplicate POSTs can ever be dispatched.

---

## 2. Exhaustive Localhost Verification Evidence (100% Pass)

1. **Directive #6688411313 + #6692390922 + #6694288964 Comprehensive E2E Suite** (`test/run_chromium_v7_directive_6688411313_no_message_suite.js`):
   - **36 / 36 assertions passed (100%)**
   - Section 1: Checkbox rendering & persistent storage (`true`/`false`) — PASS
   - Section 2: Flag OFF strict skip & 0 submissions (`NON_INQUIRY_SUBSCRIBE_FORM`) — PASS
   - Section 2B: Stale ambient window global immunity — PASS
   - Section 3: Flag ON submissions (4 targets submitted successfully) — PASS
   - Section 3B: Consecutive ON -> OFF reversion (zero residual leakage, skips no-message form, 4 total submissions maintained) — PASS
   - Section 4: Selection priority & deduplication — PASS
   - Section 5: Strict negative controls & safety audit (Generic name/email fails closed; unauthorized consent checkbox settles `SKIPPED` with 0 POSTs) — PASS
   - Section 6: Missing required input fails closed as `AUTOMATION_FAILED` (STRICT NOT SKIPPED) — PASS
   - Section 7: External CAPTCHA on no-message form — PASS
     - `EXTERNAL_CAPTCHA_AUTO_NO_INTERVENTION_POPUP`: PASS (0 buttons, pointerEvents=none, holdPanel=false)
     - `EXTERNAL_CAPTCHA_WAIT_BOUNDED_LE_3`: PASS (waitCount=1 <= 3)
     - `EXTERNAL_CAPTCHA_NO_MESSAGE_SUCCESS_SIXTH_POST`: PASS (submissions strictly incremented to 6, 0 duplicate POST)
   - Section 8: Triple modes (AUTO / SEMI_AUTO / MANUAL) — PASS
   - Section 9: Campaign durability & frozen option preservation across true Service Worker kill/restart and checkpoint hydration — PASS
   - Section 10: Ledger 7 buckets & run ID scoping reconciliation — PASS
2. **Directive #6657464425 Full Chromium E2E Suite** (`test/run_chromium_v7_directive_6657464425_e2e_suite.js`):
   - **38 / 38 assertions passed (100%)**
3. **V7 Modes & Visible Controls Suite** (`test/run_chromium_v7_modes_and_visible_controls_suite.js`):
   - **32 / 32 assertions passed (100%)**
4. **Real Mutant Sensitivity Harness** (`test/run_v7_real_mutant_sensitivity.js`):
   - **4 / 4 mutants killed (100% sensitivity confirmed, raw exit code 1 verified)**

---

## 3. Explicit UNKNOWNs & Strict Invariants

Per Directive Items (3) & (4):
1. **Real NopeCHA Live API**: **UNKNOWN** (All internal NopeCHA/2Captcha API solvers retired in v7; external extension simulation used on localhost).
2. **Real Decodo / DigitalOcean Residential Proxy Egress**: **UNKNOWN** (Zero public egress authorized without Owner credential/billing approval; local fail-closed architecture confirmed in source and unit tests).
3. **Owner Windows Desktop Live Smoke**: **UNKNOWN** (Developer automated tests executed in clean isolated Chromium/Edge instances; awaiting Owner final local smoke test).

**Hard Invariants Maintained**:
- Base branch `major/v7-dual-mode` remains 100% frozen at RC11 `20678ada6491bf842ec7e996a88108152c76007f`.
- IVCS Manager remains untouched and strictly ChatGPT-owned.
- Zero public contact form submissions dispatched (100% isolated localhost `127.0.0.1:8088` fixtures).
- Status remains **RELEASE HOLD** pending independent ChatGPT Code Audit and Owner smoke approval.
