# XPIDER AutoForm Sender Pro — R6.9G.10.3.5 CAPTCHA Loop Termination + Enforced Fail-Closed Privacy Transport

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive [#6063304914](https://github.com/goodkie/v-show/issues/6#issuecomment-6063304914))
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `bc7cf341509abed93bcb6c85bcc375b3a28b3c1e` (`bc7cf341`)
- **Provenance HEAD**: `744eba397444c929a5a415ffaa8693c373a62886` (`744eba39`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `4ef7def9689cdf4c508651e2f6bee6b320e7ab8e`
- **Previous Release (Rollback Reference)**: `v6.9g.10.3-audit.3` (R6.9G.10.3.4, preserved untouched)
- **New Release Tag**: `v6.9g.10.3-audit.4`

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,345,732 bytes
   - SHA-256: `b06eb04f2a90156d982e624079a4ca79ed4af5aa9f671a76106f4ed08f904912`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build with CAPTCHA loop termination, live background identity query, truthful privacy mode reporting, and central network-side-effect gate
     - `companion/`: Windows Privacy Relay companion service (`install_companion.bat`, `uninstall_companion.bat`, `winsec.js`, etc.)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_5_real_runtime_traces.log`
   - Size: 8,823 bytes
   - SHA-256: `3dfd47359ac36a8fb816012d54d011c40fd4e3bd526071821e86bc2e6c4886ff`

### Problem Solved & Implementation Details (Directive #6063304914)

#### Part A: CAPTCHA Loop Termination & Identity Resolution
1. **Root Cause Resolved**: In R6.9G.10.3.4, solver running in an early-loading iframe executed before `STAGE_PROGRESSION`, reading empty identity from storage and sending `OWNER_CAPTCHA_REQUEST` with `attemptId: null`. Background `validateActiveExecution` rejected with `attempt_mismatch`, resetting `solving = false` in the solver, which immediately retried every few seconds until local session timeout.
2. **Pre-Navigation Persistence**: Immediately after `recordAttempt()` returns `attemptId`, canonical execution identity (`attemptId`, `targetToken`, `campaignRunId`, `sessionId`, `captchaEpoch`, `ts`) is persisted to `chrome.storage.local` before opening or updating the target tab.
3. **Live Background Identity Query**: Added `GET_ACTIVE_EXECUTION_IDENTITY` message handler in `background.js`. Evaluates sender tab equality (`sender.tab.id === targetTabId`) and returns canonical identity only to the active campaign target tab. `solver-content.js` queries this live background endpoint first before falling back to storage.
4. **Guaranteed Bounded Non-Spam**: If canonical identity cannot be acquired, `solver-content.js` logs `[CAPTCHA_IDENTITY_UNAVAILABLE]` exactly once, freezes the frame solver (`isTerminalStale = true`), and NEVER sends `OWNER_CAPTCHA_REQUEST`.
5. **Single Request Latch & Idempotent Counters**: Background maintains `captchaRequestLatch[attemptId:epoch:sitekey]`. Duplicate requests during `PENDING_OWNER` are suppressed without inflating counters. Rejection with `attempt_mismatch` returns `isTerminal: true` and permanently freezes solver for that frame without retry storm.

#### Part B: Truthful Fail-Closed Privacy Transport
1. **Truthful Semantics & UI**: Renamed `SYSTEM_VPN` to `EXTERNAL_VPN_MONITOR (Not Enforced)`. In strict fail-closed mode, `EXTERNAL_VPN_MONITOR` preflight returns `ready: false, failureReason: 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE'`. Direct fallback is marked `UNVERIFIED`, DNS privacy is `UNKNOWN`, and transport is `transportEnforced = false`.
2. **Readback Verification**: `applyManagedProxy()` reads back proxy settings via `chrome.proxy.settings.get` verifying `mode === 'fixed_servers'` and host/port match before resolving.
3. **Inverted Log Remediation**: `restoreOriginalSettings()` correctly resets `isGateReady = false`, `isGateActive = false`, and logs `[PRIVACY_SETTINGS_RESTORED] gateReady=false transportEnforced=false` (permanently eliminating the confusing `[PRIVACY_GATE_RESTORED] status=READY`).
4. **Central Network-Side-Effect Gate**: Created authoritative `assertPrivacyTransportReady(context)` wired before pre-target barrier, Sniper background fetch probes, target tab create/update, candidate navigation (`tryNext`), and form submission. Drops/failures block any subsequent navigation or request.

### Verification & Acceptance (100% PASS)
- **Unit & Invariant Regression Suite** (`test_r6_9g10_3_5_captcha_and_privacy.js`): 13/13 PASS (Tests A-G and 1-6).
- **Real Microsoft Edge Operator Audit** (`run_real_r6_9g10_3_5_edge_operator_audit.js`):
  - **Gate 1**: Build Provenance & Module Parity in Real Edge (`buildId=R6.9G.10.3.5-20261008-CAPTCHA-LOOP-TERM-ENFORCED-PRIVACY`, head=`bc7cf341`) — PASS
  - **Gate 2**: Truthful Restore State & Inverted Log Remediation (`isGateReady=false`, `[PRIVACY_SETTINGS_RESTORED] gateReady=false transportEnforced=false`, inverted log zero occurrence) — PASS
  - **Gate 3**: Truthful EXTERNAL_VPN_MONITOR in Real Edge (`ready=false`, `directFallback=UNVERIFIED`, `dnsPrivacy=UNKNOWN`, assertion blocked) — PASS
  - **Gate 4**: Enforced Managed Proxy Transport with Readback (`fixed_servers` readback verified on `127.0.0.1:8982`, canary pass, `assertionOk=true`, `isGateReady=true`) — PASS
  - **Gate 5**: Mid-Run Proxy Drop & Fail-Closed Quiescence (continuity fail, zero subsequent request to target, quiescence retained) — PASS
  - **Gate 6**: CAPTCHA Loop Termination & Live Identity Query (inactive query rejected, active query resolved, latch suppresses duplicate events, counters detected=1 and pendingOwner=1 idempotent, stale mismatch rejected with `isTerminal=true`) — PASS
  - **Gate 7**: Central Privacy Assertion Gate Integration (all 5 network side-effect contexts blocked when gate not ready) — PASS
