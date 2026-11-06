# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip d96cd1c3)
- Candidate Functional Base Commit: 76fab093bdfbc13f17cae9652a2339d675eb9a8f (short: 76fab093)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-06.711
- Authority Cursor: 6697198706 (Responding to ChatGPT Audit Comment #6697198706 / Node IC_kwDOT53X288AAAABjy8kcg: Live Ref Audit Confirmed, Baseline Ref Clarified, Localhost Verification Rigor Maintained)
- Canonical Schedule Revision: 8
- Collaboration Mode: Manual ChatGPT ↔ Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Gate Decision). Release HOLD maintained. Zero external public submissions.

---

## 1. Directive #6697198706 Implementation & Provenance Reconciliation

### A. Non-Self-Referential Provenance & Baseline Clarification
- Authoritative Candidate Branch Ref: `refs/heads/candidate/p0-core-regressions-v7`.
- Functional Base: `76fab093bdfbc13f17cae9652a2339d675eb9a8f` (`76fab093`).
- Base Branch Status: `major/v7-dual-mode` code remains 100% identical to frozen RC11 (`20678ada6491bf842ec7e996a88108152c76007f`), with branch tip `d96cd1c363c895451c10d08254e186596770d0c2` containing schedule-only metadata (`.ivcs/schedules/XPIDER_FORM_SENDER.json`).
- Documentation commits on candidate branch are metadata wrappers tracking the candidate branch tip above the functional base. No self-referential commit SHAs are embedded in tracked text, eliminating recursive HEAD drift.
- Preserved Assets: All user profiles, templates, CSV, History/Ledger, Email Collector, and relay configurations remain completely preserved.

### B. Independent Source Audit Confirmations
- `background.js`: Consent-qualified `OWNER_ACTION_REQUIRED` mapping, strict operational failure categories (`REQUIRED_FIELDS_UNRESOLVED`, `UNRESOLVED_REQUIRED_FACT`, `FINAL_FORM_COMPLETION_FAILED` settle as `AUTOMATION_FAILED` / `FAILURE`, never benign `SKIPPED`), immediate storage persistence on start/resume, default-OFF.
- `contact-gate.js`: Explicit boolean precedence (`typeof === 'boolean'`) over ambient window, newsletter/subscribe intent classification.
- `content-script.js`: External CAPTCHA wait strictly bounded to `<= 3` attempts (`window.__xpider_external_challenge_wait_count`), AUTO mode renders 0 intervention buttons (`pointer-events: none`), 0 duplicate POSTs enforced via `__xpider_submitBoundaryReached` and `QUERY_SUBMIT_BOUNDARY`.
- In-app solvers: All internal solvers (Wit.ai, Whisper, NopeCHA, 2Captcha, audio STT, math solver) remain 100% retired stubs throwing `IN_APP_SOLVER_RETIRED` or `INTERNAL_SOLVER_RETIRED_V7`.

---

## 2. Verification Classification Ledger

### A. Developer Self-Test Automated Reports (Localhost Isolated Fixtures)
- **Comprehensive No-Message Suite** (`test/run_chromium_v7_directive_6688411313_no_message_suite.js`): 36 / 36 PASS (100%), raw exit 0.
- **Full E2E Suite** (`test/run_chromium_v7_directive_6657464425_e2e_suite.js`): 38 / 38 PASS (100%), raw exit 0.
- **Triple Modes & Visible Controls Suite** (`test/run_chromium_v7_modes_and_visible_controls_suite.js`): 32 / 32 PASS (100%), raw exit 0.
- **Real Mutant Sensitivity Harness** (`test/run_v7_real_mutant_sensitivity.js`): 4 / 4 mutants killed (100% sensitivity, raw exit 1 verified per mutant).

### B. Independent Source Inspection (ChatGPT Remote Verification)
- Verified: `background.js` consent-qualified skip mapping and default OFF.
- Verified: `contact-gate.js` boolean precedence and opt-in intent classification.
- Verified: Manifest MV3 compliance with zero solver permissions.

### C. Formal UNKNOWNs Ledger (Pending Independent / Owner Verification)
1. **Real NopeCHA Extension Live API Ingestion**: **UNKNOWN** (All internal 2Captcha/NopeCHA APIs are retired in v7; external extension simulation used on localhost).
2. **Live Decodo / DigitalOcean Residential Proxy Egress**: **UNKNOWN** (Zero public egress authorized without Owner credential/billing approval; local fail-closed architecture confirmed in source and unit tests).
3. **Owner Windows Desktop Live Chrome Smoke & Final Acceptance**: **UNKNOWN** (Developer automated tests executed in clean isolated Chromium/Edge instances; awaiting Owner final local smoke test).

---

## 3. Strict Safety Invariants

- Base branch `major/v7-dual-mode` code remains 100% frozen at RC11 `20678ada6491bf842ec7e996a88108152c76007f`.
- IVCS Manager remains untouched and strictly ChatGPT-owned.
- Zero public contact form submissions dispatched (100% isolated localhost `127.0.0.1:8088` fixtures).
- Gate: **RELEASE HOLD** maintained pending independent ChatGPT Code Audit and Owner smoke approval.
