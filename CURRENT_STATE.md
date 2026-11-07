# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode preserves frozen RC11 code 20678ada with schedule-only updates at tip 7dc47ba2)
- Candidate Functional Base Commit: 76fab0933276ae163c377d39d9dca5169a33063c (short: 76fab093; verified commit object — extension/ tree SHA 1d1bac897f70df6fa107cde85b00de591d5dea93 100% untouched and byte-identical)
- Authoritative Candidate Branch Ref: refs/heads/candidate/p0-core-regressions-v7 (live tip resolved dynamically via git ls-remote / git rev-parse HEAD)
- State Rev: 2026-11-07.719
- Authority Cursor: 6703609650 (Responding to ChatGPT Rev 13 Targeted UAT Network-Isolation Gate Directive #6703609650: mandatory local fail-closed sink proxy firewall `127.0.0.1:8090` + `verify-uat-firewall` preflight gate before browser start + CDP `Network.enable`/`Fetch.enable` + extension DNR `installOwnerTestNetworkGuard` + 5 dual-layer outbound-denial negative controls + 50-file candidate package host-networking inspection [`15/15 PASS`, `transmittedExternalRequests: 0`] + checklist/guide `BLOCKED`/`STOP` gate)
- Canonical Schedule Revision: 13 (verified canonical GitHub schedule at commit 7dc47ba2ba92bbbefd89a58d25cef3951af80d1b on major/v7-dual-mode; IVCS Manager/schedule strictly ChatGPT-only)
- Collaboration Mode: Manual ChatGPT <-> Antigravity Collaboration per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit & Owner UAT Gate Decision). Release HOLD strictly maintained. Zero external public submissions.

---

## 0. Directive #6703609650 (State Rev .719) — REV13 TARGETED UAT NETWORK-ISOLATION & EGRESS-DENIAL GATE

1. **Action 1 — Fail-Closed Preflight Gate Before Browser Start & Multi-Layer Local Sink Firewall (`owner-extension-test-site/server.js`, `scripts/xpider_safe_update.js`, `test/lib/browser_cdp.js`)**:
   - `owner-extension-test-site/server.js` now binds a mandatory **Local Fail-Closed Sink Proxy Firewall** on `127.0.0.1:8090` (`SINK_PROXY_PORT`) alongside the fixture server on `127.0.0.1:8088` (failing closed with `process.exit(1)` if `127.0.0.1:8090` cannot bind). The sink proxy actively denies (`HTTP 403` + `X-XPIDER-UAT-Firewall: BLOCKED_FAIL_CLOSED` + socket close) and logs all HTTP, HTTPS `CONNECT`, and WebSocket `upgrade` requests without ever opening an outbound socket (`transmittedExternalRequests === 0`). Also gated `/cf-turnstile/verify` to deterministic offline verification by default (`XPIDER_ALLOW_LIVE_CF_SITEVERIFY` unset) and added `/redirect-external`, `/__xpider_firewall_status`, and `/__xpider_reset_firewall_log`.
   - `scripts/xpider_safe_update.js` adds `verify-uat-firewall --fixture-port 8088 --sink-port 8090`, which queries `/__xpider_firewall_status` and sends active HTTP + HTTPS `CONNECT` negative-control probes (`198.51.100.42`) through `127.0.0.1:8090`, exiting nonzero (`ABORTED: UAT_NETWORK_FIREWALL_UNAVAILABLE` / `UAT_NETWORK_FIREWALL_EGRESS_NOT_BLOCKED`) **before** Chrome starts if network egress cannot be denied/observed.
   - Chrome UAT runs combine 4 layers (never relying on `--host-resolver-rules` alone): (1) `--proxy-server=127.0.0.1:8090 --proxy-bypass-list=127.0.0.1:8088;localhost:8088;[::1]:8088`, (2) CDP `Network.enable` + `Fetch.enable` interception, (3) extension `declarativeNetRequest` session rules (`installOwnerTestNetworkGuard`: `990001-990005`), and (4) `--host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost"`.
2. **Action 2 — Dual-Layer Outbound-Denial Negative Controls (`test/run_uat_synthetic_profile_isolation_check.js` -> `dist/report_uat_network_isolation_and_egress_denial.json`)**:
   - Command: `node test/run_uat_synthetic_profile_isolation_check.js` -> **15 / 15 PASS** (Exit 0).
   - Egress Telemetry Summary: `attemptedExternalRequests: 18`, `blockedByBrowserDnrOrCdp: 9`, `blockedByLocalSinkFirewall: 9`, `blockedExternalRequests: 18`, **`transmittedExternalRequests: 0`**, `allowedLoopbackRequests: 3`.
   - Negative Controls (each verified at both the Extension DNR/CDP layer AND the independent Local Sink Proxy Firewall layer):
     1. `NEG_CONTROL_1_DUMMY_PUBLIC_HOSTNAME_HTTP_AND_HTTPS_BLOCKED`: `http://dummy-public-target.example.com/contact` & `https://dummy-public-target.example.com/contact` (`PASS`).
     2. `NEG_CONTROL_2_LITERAL_EXTERNAL_IPV4_AND_IPV6_BLOCKED`: `http://198.51.100.42:8080/leak-check` (RFC 5737) & `http://[2001:db8::42]:8080/leak-check` (RFC 3849) — proves literal IPs that bypass `--host-resolver-rules` are caught and denied (`PASS`).
     3. `NEG_CONTROL_3_HTTP_302_REDIRECT_FROM_LOOPBACK_TO_EXTERNAL_BLOCKED`: `http://127.0.0.1:8088/redirect-external` -> `302` to `http://198.51.100.42:8080/redirected-leak` (`PASS`).
     4. `NEG_CONTROL_4_WEBSOCKET_PAGE_FETCH_AND_SW_BACKGROUND_FETCH_BLOCKED`: `ws://198.51.100.42:8080/ws`, page `fetch('http://198.51.100.42:8080/page-fetch-leak')`, and Service Worker background `fetch('http://198.51.100.42:8080/sw-bg-fetch-leak')` + `fetch('https://dummy-public-target.example.com/sw-bg-https-leak')` (`PASS`).
     5. `NEG_CONTROL_5_PROXY_LOCK_AND_CAMPAIGN_PREFLIGHT_GATES_FAIL_CLOSED`: verifies active Chrome proxy rules point to `127.0.0.1:8090` (`mode: "fixed_servers"`), `START_CAMPAIGN` in test mode rejects unauthorized/non-loopback runs, and normal `START_CAMPAIGN` without verified relay/proxy fails closed with `PRIVACY_GATEWAY_BLOCKED` (`reason: "PROXY_NOT_CONFIGURED"`) (`PASS`).
3. **Action 3 — Checklist & Guide Gating (`dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md`, `dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md`)**:
   - Updated both documents so Phase B UAT is gated behind `verify-uat-firewall` + `--proxy-server="127.0.0.1:8090" --proxy-bypass-list="127.0.0.1:8088;localhost:8088;[::1]:8088"`, localhost-only allowlist, explicit no external proxy setting, no saved production data, and no auto-start, with explicit rule: **if robust network isolation is unavailable on Windows 10, the UAT step is `BLOCKED` and the Owner must `STOP` rather than claiming fail-closed**.
4. **Action 4 — Candidate Package (`dist/clean_room_unpacked_v7`) Host-Networking Inspection**:
   - Static audit across all 50 files (`STATIC_PACKAGE_HOST_NETWORKING_AUDIT_50_FILES: PASS`): `0` `XMLHttpRequest`, `0` `WebSocket`, `0` `navigator.sendBeacon`, and `13` total `fetch(` call sites (`5` in `popup.js` strictly targeting `http://127.0.0.1:8088/*`; `6` in `background.js`/`modules/privacy-gateway.js` targeting local companion relay control plane `http://127.0.0.1:18989/*`; `1` in `background.js:7779` scanning the active campaign's `baseUrl` during an operator-started campaign; and `1` in `modules/privacy-gateway.js:341` gated behind `isManagedTransport && proxyEnforced`).
   - Runtime boot + popup load + 2000ms idle observation (`RUNTIME_EXTENSION_BOOT_AND_POPUP_IDLE_ZERO_EXTERNAL_HOST_NETWORKING: PASS`): `swBootExternalRequestsCount: 0`, `unexpectedExtensionExternalHitsCount: 0`, `transmittedExternalRequests: 0`. Live Privacy Relay egress remains a separate `NOT_TESTED / UNKNOWN` gate.

---

## 1. Prior Verified Suites Summary
- **Safe Update + Encrypted Storage Backup/Restore Suite**: `dist/report_safe_update_transaction.json` (`57/57 PASS`).
- **Google Chrome `157.0.8103.38` Migration Parity Suite**: `dist/report_chrome_migration_parity.json` (`37/37 PASS`).
- **Google Chrome `157.0.8103.38` UI, Reset, CSV, Email Collector & Consent Suite**: `dist/report_chrome_ui_reset_collector_regressions.json` (`18/18 PASS`).
- **Clean-Room Package Suite**: `dist/report_clean_room_package_suite.json` (`22/22 PASS`).
- **Deep Content-Level Secret Audit**: `dist/report_public_repo_secret_audit.json` (`ALL_CLEAN`, finite pattern scanner coverage noted).

---

## 2. Active Gate Status & Separate External Boundaries (`NOT_TESTED / UNKNOWN`)
- **RELEASE HOLD strictly maintained**.
- External gates held separately as `NOT_TESTED / UNKNOWN`:
  1. Live Owner Windows 10 PC desktop smoke: `NOT_TESTED / UNKNOWN`.
  2. Real external NopeCHA extension interoperability: `NOT_TESTED / UNKNOWN`.
  3. Live DigitalOcean / Decodo VPN/Proxy egress (IP / DNS / IPv6 / WebRTC): `UNKNOWN`.
- Base branch `major/v7-dual-mode` remains 100% frozen RC11 (`20678ada`), schedule tip `9029b45a` (Revision 12).
- Zero public form submissions (localhost `127.0.0.1:8088` only).
- IVCS Manager and canonical schedule completely untouched (strictly ChatGPT-owned).
