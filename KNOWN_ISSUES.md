# XPIDER AutoForm Sender Pro — Known Issues & Post-Beta Roadmap

**Build Version:** `R6.9G.10.3.7.1.4.11-20261016-OWNER-BETA`  
**Status:** Accepted Non-Blockers per Owner Decision (`Issue #6 Comment #6208890551`).

---

## 1. Accepted Non-Blockers for Owner Beta

The following items are explicitly tracked for **Post-Beta Hardening** and do not block daily personal use:

1. **Official Test-Key UI Semantics Refinement:**
   - In the Cloudflare Official Test-Key Lab fixture, negative controls (expected failures: `visible-fail`, `invisible-fail`) currently record as `EXPECTED_FAIL_PASS / SKIPPED` in generic ledger counters. A dedicated test-case matrix panel (`Positive Controls: 3/3 | Negative Controls: 2/2`) is planned to replace generic campaign counters during test runs.

2. **Dedicated Cloudflare Metrics Panel Hydration:**
   - Real-time Cloudflare token counters and siteverify breakdown are recorded in diagnostic traces and debug bundle JSON, but are not yet surfaced in a separate dedicated UI card.

3. **50-Suite Extended Stress Test:**
   - Automated 100% pass verified across the full 5-fixture Cloudflare Turnstile suite in real Edge (`visible-pass`, `visible-fail`, `invisible-pass`, `invisible-fail`, `interactive`). Continuous 50-suite stress repetition will run as background soak verification.

4. **Non-Critical Visual Styling Inconsistencies:**
   - Minor padding/margin variations across different browser window widths (e.g. side panel < 360px vs detached popup) do not impact functional execution.

5. **Site-Specific Rare Unsupported Forms:**
   - Complex non-standard form layouts (multi-step shadow DOM wizards, canvas forms) are handled via fail-closed detection with clear ledger attribution (`UNSUPPORTED_FORM`), preserving campaign continuity.

6. **Interactive CAPTCHA Challenges:**
   - Certain live CAPTCHA challenges require manual owner confirmation; the engine cleanly halts timeout runaway and presents an interactive resolution dialog.

7. **Performance Tuning:**
   - Additional speed optimizations for DOM queries on heavy single-page applications.

---

## 2. Active Defect Resolution Protocol

All defects identified during daily Owner Beta use will be diagnosed directly from exported `XPIDER_DEBUG_<buildId>_<timestamp>.zip` bundles and resolved in rapid point updates without holding release availability.
