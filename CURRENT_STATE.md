# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Owner Egress Verification & ChatGPT Directive #6278507134)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-19.45
- Authority Cursor: 6278507134
- Last Directive / Audit: [CHATGPT][DIRECTIVE][extension-form-sender][PRIVATE-EGRESS-RELAY-STABILITY] #6278507134
- Last Receipt: `[ANTIGRAVITY][RC3.18 PERSISTENT-RELAY-LIFECYCLE AND CAMPAIGN-CONTINUITY CLOSURE RECEIPT]`
- Build ID: `R6.9G.10.3.7.1.4.32-20261019-PRIVATE-EGRESS-RC3.18`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.18.7.1.4.32`
- Functional Head Commit: `3dcbbaad0761e3d368e73070445d47e5ec0d3ff7` (short: `3dcbbaad`)
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)

## Current Gate
- Formal Gate: **RC3.18 LOCAL & REMOTE AUDIT PASS (AWAITING CHATGPT INDEPENDENT AUDIT)**.
- Verified Owner Evidence (Directive #6278507134):
  * **NETWORK PRIVACY GATE: PASS**.
  * Public browser egress IPv4: `159.203.28.198` (DigitalOcean / Toronto).
  * IPv6 leak: 0 exposed.
  * WebRTC leak: 0 exposed.
  * DNS leak: PASS (8 resolvers, 100% DigitalOcean, 0 ISP fallback).
  * Fail-closed behavior: PASS (`ERR_PROXY_CONNECTION_FAILED`, 0 DIRECT fallback).
- P0 Hotfix Mandate & Resolution:
  * **HH1: Companion Process Immortality & Exception Traps**:
    - Wrapped `privacy-relay-service.js` with global `uncaughtException` and `unhandledRejection` guards.
    - Prevents sudden process termination on transient socket aborts, client tab closures, or `ECONNRESET`.
  * **HH2: Companion Watchdog Supervisor (`companion-watchdog.js`)**:
    - Background supervisor monitoring port 18989 `/health` at 2500ms intervals with PID-locked single-instance safety (`.watchdog.lock`).
    - Automatically invokes `ensure_companion_service.js` to self-heal companion on consecutive probe failures without requiring manual `Start / Repair`.
  * **HH3: Structured Lifecycle State Machine & Bounded Backoff**:
    - Exposes deterministic transitions: `READY -> DEGRADED -> RECONNECTING -> READY` (and terminal `FAILED` after bounded exponential backoff exhaustion).
    - Exposes multi-vector health diagnostics: `companionProcess`, `localProxyListener`, `nativeMessagingChannel`, `upstreamTunnelState`, `remoteEgressReachability`, `dnsPath`.
  * **HH4: Fail-Closed Protection Throughout Degraded/Reconnecting States**:
    - Local proxy listener strictly returns `HTTP 502 Bad Gateway` whenever relay is not verified READY. Zero DIRECT fallback.
  * **HH5: P0 Campaign Continuity — Pause / Checkpoint / Replay**:
    - Automatic form jobs freeze immediately upon relay degradation (`freezeActiveCampaignJob`) before mutation or submit.
    - Atomic checkpoint persisted to `xpider_active_network_checkpoint` in storage.
    - Campaign state transitions to `PAUSED_NETWORK_RECOVERY` without advancing queue/counters or writing false failures.
    - Upon relay recovery to READY, re-verifies privacy transport preflight first, restores job from last safe checkpoint, and enforces idempotency (checks submit outcome first before re-submitting to prevent duplicate sends).
  * **HH6: Mandatory Acceptance Tests (Test A, Test B, Test C)**:
    - `run_rc3_18_fault_injection_acceptance.js`: 9/9 assertions PASSED (100%).
    - `test_rc3_18_relay_self_heal_and_campaign_continuity.js`: 5/5 assertions PASSED (100%).
    - Full regression suites (RC3.14 - RC3.17): 100% PASS.
  * **HH7: Zero Cloud VPS Mutation Invariant**:
    - Active cloud node Droplet ID `610408684` / IP `159.203.28.198` in TOR1 remains 100% active and untouched. Zero cloud mutations.

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned by Owner in RC3.13 remains active and untouched.
   - Owner does NOT need to run Step B or incur any new cloud expense.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - Zero credentials, tokens, or runtime files inside released ZIP.
