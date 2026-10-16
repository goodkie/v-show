# Changelog

All notable changes to **XPIDER AutoForm Sender Pro** are documented in this file.

## [R6.9G.10.3.7.1.4.11-OWNER-BETA] - 2026-10-16

### Added
- **One-Click Owner Debug Bundle (`📦 EXPORT OWNER DEBUG BUNDLE`):**
  - Generates comprehensive `XPIDER_DEBUG_<buildId>_<timestamp>.zip` containing human-readable diagnostic report, raw event logs, sanitized settings snapshot, live counters, error/retry summaries, History/Ledger records, and build provenance.
  - Zero external dependency pure-JS ZIP creation engine with CRC-32 integrity.
  - Automatic deep redaction of passwords, tokens, API keys, cookies, and sensitive credentials.
- **Ultra-Diagnostic Mode (Default-ON):**
  - Persistent telemetry recording across all required trace domains: `[BOOT]`, `[SW_RESTART]`, `[BUILD_HANDSHAKE]`, `[CAMPAIGN_START]`, `[CAMPAIGN_STOP]`, `[PAUSE]`, `[RESUME]`, `[TARGET_START]`, `[TARGET_END]`, `[TARGET_PAGE]`, `[CONTACT_DISCOVERY]`, `[CONTACT_COMMIT]`, `[FORM_COMMIT]`, `[FORM_SCAN]`, `[FORM_GATE]`, `[FIELD_CLASSIFY]`, `[FIELD_ASSIGN]`, `[FIELD_SKIP]`, `[FIELD_VALIDITY]`, `[FINAL_FILL]`, `[FINAL_AUDIT]`, `[CAPTCHA_DETECTED]`, `[CAPTCHA_PROVIDER_SELECT]`, `[CAPTCHA_STAGE_TRANSITION]`, `[CAPTCHA_TOKEN_RECEIVED]`, `[CAPTCHA_TOKEN_APPLIED]`, `[TURNSTILE_*]`, `[SUBMIT_CANDIDATES]`, `[SUBMIT_DECISION]`, `[SUBMIT_TRIGGERED]`, `[SUBMIT_VERIFY]`, `[FINAL_CANONICAL]`, `[HISTORY_FINAL]`, `[LEDGER_STATS]`, `[TIMEOUT]`, `[RECOVERY]`, `[CHECKPOINT]`, `[PRIVACY_GATE]`.
- **Private Owner Beta Branding:**
  - Top navigation bar channel tag: `● PRIVATE OWNER BETA — DEBUG TELEMETRY ENABLED`.
  - Provenance badge: `OWNER BETA R6.9G.10.3.7.1.4.11 [5a0e9830]`.
- **Documentation:**
  - `OWNER_BETA_README.md`: Complete operating guide, install/reload instructions, normal campaign flow, pause/resume/stop, debug export, and bug reporting instructions.
  - `KNOWN_ISSUES.md`: Explicit list of accepted non-blockers tracked for post-beta hardening.

### Changed
- `BuildProvenance.BUILD_INFO.channel` set to `OWNER_BETA`.
- `isTestOnlyBuild()` updated to authorize both `TEST_ONLY` and `OWNER_BETA` channels.
- Full 100% SHA256 parity synchronized across `send_message_backup/`, `extension/`, and `send_message_backup/build/extension/`.

---

## [R6.9G.10.3.7.1.4.10] - 2026-10-16

### Added
- **Real Cloudflare Turnstile Owner Validation Suite:**
  - Dual operational modes: Mode A (`CLOUDFLARE_LIVE_OWNER`) and Mode B (`CLOUDFLARE_TESTKEY_LAB`).
  - Preflight validation rejecting unconfigured live credentials (`CLOUDFLARE_LIVE_CONFIG_REQUIRED`) and refusing loopback live runs (`CLOUDFLARE_LIVE_LOOPBACK_REFUSED`).
  - Real Cloudflare Siteverify bridge with fail-closed 3-attempt retry loop.
  - Automated real Edge suite (`test/run_edge_cloudflare_turnstile_lab.js`) passing 100% across all 5 official fixtures (`visible-pass`, `visible-fail`, `invisible-pass`, `invisible-fail`, `interactive`).
  - Zero mock or external solver calls during official Turnstile testing.
