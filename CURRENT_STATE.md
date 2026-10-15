# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (ChatGPT Independent Audit #6182660984)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-14.06
- Last Directive: ChatGPT P0 Directive Comment #6172226686 (`[R6.9G.10.3.7.1.4.6 — DEAD START GATE + NEW TEST BUTTONS NO-OP + STALE VISITED STATE]`)
- Last Receipt: #6182329949 (`https://github.com/goodkie/v-show/issues/6#issuecomment-6182329949`)
- Last Accepted Audit: #6182660984 (`https://github.com/goodkie/v-show/issues/6#issuecomment-6182660984`)
- Current Release Tag: `v6.9g.10.3-audit.7.1.4.7`

## Current Gate
- Formal Gate: R6.9G.10.3.7.1.4.7 START CONTROL-PLANE RECOVERY PASS / OWNER RETEST ALLOWED (#6182660984).
- Engineering Acceptance Status: **PASS (100% PRESERVED & ENHANCED)**.

- Pre-Hardware Real Software Acceptance: **AVAILABLE-SCOPE SOFTWARE PASS (#6134283065)**.
- **Defect 1: Build Provenance Omission Handshake Lock (P0 Remediation)**:
  - Canonical provenance fields restored in `BuildProvenance`: `implementationHead`, `implementationHeadShort`, `head`, `headShort`.
  - Confirmed match between popup and background automatically removes `data-build-locked` and enables `#start-btn`.
  - UI badge renders exact short SHA `51110c99` (`TEST-ONLY R6.9G.10.3.7.1.4.7 [51110c99]`), never `[dev]`.
  - Observable diagnostics instrumented: `[BUTTON_CLICK]`, `[START_GATE]`, `[START_DISPATCH]`.
- **Defect 2: Owner Test Pre-Launch Stale Visited/Suppression Reset (P0 Remediation)**:
  - `PREPARE_OWNER_FUNCTIONAL_TEST_RUN` atomically clears localhost fixture URLs from `campaignState.visitedUrls`, `xpider_visited_urls`, `xpider_visited`, in-memory suppression caches, and paused checkpoints without touching Owner public history or settings.
  - Invariant strictly enforced: 7/7 executable fixtures on every test run with 0 skipped targets at launch.
- **Defect 3: Authoritative Single launchCampaign Engine**:
  - Eliminated fragile synthetic `.click()` chaining on `#start-btn`.
  - Direct invocations: `launchCampaign({ source: 'OWNER_CORE_TEST' })`, `launchCampaign({ source: 'OWNER_CAPTCHA_LAB' })`, `launchCampaign({ source: 'OWNER_FULL_TEST' })`, `launchCampaign({ source: 'USER_START_BUTTON' })`.
- **Real Microsoft Edge Acceptance (10/10 Criteria PASS)**:
  - Validated via `test/run_edge_control_plane_recovery_suite.js` (trace log `edge_control_plane_recovery_trace.log`, 283,931 bytes):
    1. Fresh SW Build Provenance verified (51110c99).
    2. Badge renders exact short SHA `51110c99`, never `[dev]`.
    3. AUTO SETUP reaches READY with local test server verified.
    4. RUN FUNCTION TEST (Run 1): Exactly 7 executable targets, 0 skipped at launch.
    5. Repeat RUN FUNCTION TEST (Run 2): Atomic scope re-arm verified, 7/7 executable, 0 stale suppression.
    6. RUN CAPTCHA LAB: Real extension campaign path dispatched successfully.
    7. RUN FULL TEST: Real extension campaign path dispatched successfully (15 fixtures).
    8. Direct Start Sending: Normal queue launch succeeds when gate is READY.
    9. SW restart & popup rebind: 100% controls functional across reopen.
    10. Zero destruction of Owner public list/history (100 URLs and visited entries intact).
- **Control-Plane Button Binding & Observability (8/8 Checks PASS)**:
  - Validated via `test/test_control_plane_button_binding.js`.
- **50-Cycle Anti-Stampede & Stress Suite (PASS)**:
  - Validated via `test/test_captcha_lab_stress.js`.
- **Zero-Secret Invariant**: Zero credentials or tokens leaked across workspace or package.
- Next Action: Owner functional retest on R6.9G.10.3.7.1.4.7 (Start / Core / CAPTCHA Lab / Full Test controls).

## Lineage & Remote Git SHAs
- `ROLLBACK_ANCHOR`: `dc0740a0c69e2f7fa96b6989841acf0831b3619e` (immutable baseline anchor)
- `PREVIOUS_FUNCTIONAL_RESTORE_POINT`: `55dc6d69a25b4ea27283d3b40ba1c5fea730914b`
- `IMPLEMENTATION_HEAD`: `51110c997b8063d52b8224c9af8d42b353defde0`
- `HEAD`: `88add7bacc8c132eafaf5414d9033f1b83ddf333`
- Diagnostic Package: `XPIDER_R6.9G.10.3.7.1.4.7_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
- Package SHA-256: `b1e1485573e80a0701cfa2c19e2596868fb72c085ed34ad29849bced74f28f23`

