# RC3.41 Dual-Blocker Remediation & Regression Suite Immutable Evidence

## 1. Candidate RC3.41 Release Identity
- **Release Tag:** [`v6.9g.10.3-rc3.41.7.1.4.55`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.41.7.1.4.55)
- **Annotated Tag Object:** `3700e9c78a3c7d5fe9c9362a220bed8fd7a1b2fb`
- **Provenance Commit (P):** `908d37dde274bfb2ab0a45aebf7b709470e34e5c` (`908d37dd`)
- **Functional Commit (F):** `478b719db519dbbef052aa0a8765f898140ccba4` (`478b719d`)
- **State Update Commit:** `96f9199723ec08365691c7847c13aa7dbd09a471` (`96f91997`)
- **Rollback Base Anchor:** `d987bca65b0e5d0786e110efaa45ad91622bc85f` (`d987bca6`)
- **Build ID:** `R6.9G.10.3.7.1.4.55-20261022-FINAL-SPRINT-RC3.41`
- **Release Asset Zip:** `XPIDER_R6.9G.10.3.7.1.4.55_PRIVATE_EGRESS_RC3.41.zip`
- **Release Asset Size:** `45,379,257` bytes
- **Release Asset SHA-256:** `0efe82ad58f7d762445c26d14d60a7b1d8b701199e6205fb39c9b9b574bd7a7c`
- **Unpacked Convenience Directory:** `XPIDER_R6.9G.10.3.7.1.4.55_PRIVATE_EGRESS_RC3.41\extension`

## 2. Directives Remediated

### Blocker 1: Live CAPTCHA Provider Lifecycle Stall (#6335592395)
- Added `_fetchWithTimeout` with strict 10s per-request socket abort controller.
- Standardized terminal states: `SOLVED`, `REJECTED`, `AUTH_ERROR`, `PROVIDER_TIMEOUT`, `CANCELLED`.
- Structured lifecycle telemetry with credential redaction (`_redactTelemetry`).
- Auto-first -> Single manual fallback offer on failure/timeout without looping.
- Paused campaign deadline controller during manual solve.

### Blocker 2: Cloudflare WAF Hard Block Fast-Fail (#6336861540)
- Implemented `classifyWafBlock(doc)` multi-marker classifier (<100ms early detection).
- Early terminal fast-fail without waiting for full target timeout.
- Reason code `ACCESS_BLOCKED_WAF` mapped to `SECURITY_BLOCKED` in `HistoryStore`.
- Strict ledger invariants: `completed` +1, `failure` +1, `remaining` -1, `timeout` 0, CAPTCHA counters untouched.
- Fail-closed Privacy Relay preserved with zero bypass/evasion attempts.

## 3. Test Suites Verification Summary
1. `test/test_live_captcha_provider_lifecycle_regressions.js`: **10/10 PASS (100%)**
2. `test/test_waf_block_classification_regressions.js`: **6/6 PASS (100%)**
3. `test/test_rc3_40_package_hygiene_regression.js`: **PASS (100%)**
4. `test/test_private_egress_security_hardening.js`: **20/20 PASS (100%)**
5. All 39 extension JavaScript files passed syntax verification (`node --check`).
