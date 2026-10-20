# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Directive [RC3.25-LIVE-PROVIDER-GATE-FAIL-RECOVERY])
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-20.61
- Authority Cursor: 6301402996
- Last Directive / Audit: `[CHATGPT][DIRECTIVE][extension-form-sender][RC3.25-LIVE-PROVIDER-GATE-FAIL-RECOVERY]`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.25-LIVE-PROVIDER-GATE-FAIL-RECOVERY]`
- Build ID: `R6.9G.10.3.7.1.4.39-20261020-PRIVATE-EGRESS-RC3.25`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.25.7.1.4.39`
- Functional Head Commit: `63e97460c860464eb094c920d94a7ca6a97e7eb5` (short: `63e97460`)
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.39_PRIVATE_EGRESS_RC3.25.zip`
- Release Asset Size: `45,373,531` bytes
- Release Asset SHA-256: `a8cb89a88f36aa1b47b7317b5b3b7173282ce4dde15b3a05b3b69de4bc5e50b2`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.25.7.1.4.39`

## Current Gate: [RC3.25-LIVE-PROVIDER-GATE-FAIL-RECOVERY]
- **Directive A: Visual Confirmation Non-Sensitive & Toggle Governed: PASS**
  * `Show Autofill Visual Confirmation` toggle added (`xpider_show_autofill_visual_confirm`, default: `true`).
  * When ON: Outlines committed form fields with `#10b981` (2.5s) and displays generic category tokens in HUD (`Autofill OK — Name ✓ Email ✓ Message ✓`). Zero raw email, phone, or message body content exposed.
  * When OFF: Silent DOM commit without banner or outlines.
- **Directive B: Terminal Settlement without Deadlock on Provider Failure: PASS**
  * `recordTerminalCaptchaFailure(attemptId, reason, safeErrorClass)` refactored to enforce popup policy.
  * When popup OFF: Provider failure/timeout never enters `CAPTCHA_PENDING_OWNER`. Transitions to `CAPTCHA_AUTO_FAILURE`, cancels target deadline controller, clears alarms, dispatches `CAPTCHA_SKIP_DECISION`, and atomically consumes `campaignState.targetResolve` with structured `CAPTCHA_SOLVER_TIMEOUT` / `CAPTCHA_SOLVER_CONFIG_ERROR` / `CAPTCHA_SOLVER_PROVIDER_ERROR`.
  * Increments `captchaLedger.autoFailure` and `captchaLedger.manualSkip`.
  * When popup ON: Retains manual assist fallback modal path.
- **Directive C: Content Script Top Solver HUD State Synchronization: PASS**
  * Service worker dispatches `CAPTCHA_UI_STATE_UPDATE` runtime message to the active target tab:
    - On solver start: `Auto-solving (recaptcha) via NopeCHA...` (ACTIVE)
    - On solver success: `CAPTCHA solved ✓` (SUCCESS)
    - On provider failure/skip: `Auto-solve failed (<reason>). Skipping target.` (FAIL) -> HUD cleanly auto-dismisses on skip decision.
- **Directive D: Hard Wall-Clock Cap & Sanitized Telemetry: PASS**
  * `solveNopeCha` and `solve2Captcha` enforce hard wall-clock bounds via `AbortController` (`(maxWaitSec * 1000) + 10000ms`).
  * Eliminates indefinite polling drift from repeated backoff/network retries.
  * Emits sanitized telemetry logs: `[CAPTCHA_TELEMETRY] provider=nopecha step=... elapsedMs=... jobTag=...` with zero credential or token leakage.
- **Directive E: Optional Automatic Provider Fallback: PASS**
  * Added `Automatic Provider Fallback` toggle (`xpider_automatic_provider_fallback`, default: `false`).
  * When enabled and a secondary solver key is configured: If primary provider (NopeCHA) times out, automatically attempts bounded fallback to secondary provider (2Captcha) before terminal skip settlement.
- **Automated Verification Suites (40/40 PASS)**:
  * `test_rc3_25_live_provider_gate.js`: 13/13 tests passed across all 5 directives.
  * `test_r6_9g10_3_7_1_4_35_decision_serialization.js`: 27/27 tests passed across all 7 suites.

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned in TOR1 remains 100% active and untouched. Zero cloud VPS mutations.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - Zero credentials, tokens, or runtime files inside released ZIP. Verified by deep content scan.
   - Zero host environment pollution during build and packaging.
