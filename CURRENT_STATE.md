# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Owner Reports #6274768432, #6274925093 and ChatGPT Directive #6274997843)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.44
- Authority Cursor: 6275434194
- Last Directive / Audit: [CHATGPT][RC3.16 ROOT CAUSE CONFIRMED][TOKEN PRESENT BUT REJECTED — PRESENCE-ONLY START/ENSURE BUG] #6274997843
- Last Receipt: `[ANTIGRAVITY][RC3.17 AUTHENTICATED-TOKEN-PARITY AND DESYNC-RECOVERY CLOSURE RECEIPT]` #6275434194
- Build ID: `R6.9G.10.3.7.1.4.31-20261019-PRIVATE-EGRESS-RC3.17`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.17.7.1.4.31`
- Annotated Tag Object: `765990c24b771282e12c0b328c00bfd495a68bbe`
- Functional Head Commit: `0a6e843d9e5ae512bf48742473bbd3133050c117` (short: `0a6e843d`)
- Provenance/Packaging Head Commit: `9292ddd5be25b635e0517a6394db8587f486d1b4` (short: `9292ddd5`)
- Tag Target Commit SHA: `1f13986ecda10fa56439d3f55e26f425b7a0d404` (short: `1f13986e`)
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **RC3.17 LOCAL & REMOTE AUDIT PASS (AWAITING CHATGPT INDEPENDENT AUDIT)**.
- Incident Context & Root Cause (Comments #6274768432, #6274925093, #6274997843):
  * Owner ran RC3.16 `XPIDER_AUTO_SETUP.bat`: Companion, state migration, and preflight ran cleanly, with port 18989 healthy and token present in Extension memory.
  * **Failure Observed**: Settings UI displayed `PRIVACY RELAY COMPANION: UNAUTH (401)`, `EGRESS NODES POOL (0)`.
  * **Root Cause (Confirmed by ChatGPT #6274997843)**: `ensure_companion_service.js` and `native_host/xpider_native_host.js` only checked unauthenticated `/health` (HTTP 200) + presence of `.control_token` on disk. When a running process had in-memory Token A, but disk had Token B, both Auto Setup and Start/Repair evaluated `ALREADY_RUNNING` and skipped restarting the process. Extension queried `/status` with Token B and received 401 permanently. Diagnostics also falsely labeled the state as `HEALTHY`.
- Core Closures (GG1 – GG6):
  * **GG1: Authenticated Token Parity Probe against `GET /status`**:
    - Added `probeAuthenticatedStatus(token, timeoutMs)` in `ensure_companion_service.js` and `checkRelayStatus(token)` in `xpider_native_host.js`.
    - Proves cryptographic Bearer token acceptance (`HTTP 200 OK`) on `/status` before considering companion running or ready.
  * **GG2: `ensure_companion_service.js` TOKEN_DESYNC Detection & Recovery**:
    - If `/health` returns 200 but `/status` returns 401 with the package `.control_token`, classifies `TOKEN_DESYNC`.
    - Forcefully terminates stale process, starts bundled current build, verifies authenticated `/status` HTTP 200.
    - Preserves active node (`159.203.28.198`) and transaction state.
  * **GG3: Native Host `startRelay()` Refusal of Fake `ALREADY_RUNNING`**:
    - `startRelay()` validates both `/health` and authenticated `checkRelayStatus()`.
    - Refuses `ALREADY_RUNNING` on 401, immediately invoking `ensure_companion_service.js` to perform bounded desync recovery and return a fresh validated token.
  * **GG4: Truthful Diagnostics Contract**:
    - Actively probes `/status` with presented token:
      * `TOKEN_PRESENT_VALID`: `/status` HTTP 200 (green `#4ade80`).
      * `REJECTED (401 / TOKEN_DESYNC)`: `/health` 200 but `/status` 401 (red `#f87171`).
      * `TOKEN_MISSING`: token file absent.
    - Failure reason strictly displays `TOKEN_DESYNC_401` on 401; **NEVER** labels a 401/desynced state as `HEALTHY`.
  * **GG5: Regression Verification Suite**:
    - `test/test_rc3_17_token_parity_and_desync_recovery_gg1_gg6.js`: 6/6 tests passed (100%).
    - Live local `XPIDER_AUTO_SETUP.bat` verified: detected `TOKEN_DESYNC`, terminated PID 21040, launched PID 20496, authenticated `/status` HTTP 200 verified.
  * **GG6: Zero Cloud VPS Mutation Invariant**:
    - Active cloud node Droplet ID `610408684` / IP `159.203.28.198` in TOR1 remains 100% active and untouched. No Step B rerun, no rotate, no destroy.
- Retained Guarantees:
  * **FF1 - FF5**: Background message handler for `GET_PRIVACY_GATEWAY_STATE`, truthful main campaign HUD readiness, preflight sync (`test_rc3_16_main_hud_messaging_and_preflight_sync.js` — 6/6 PASS).
  * **DD1 - DD5**: Stale Companion auto-upgrade, structured error reporting, cross-package egress state migration, owner diagnostics box (`test_rc3_15_upgrade_migration_and_start_repair_dd1_dd5.js` — 5/5 PASS).
  * **CC1 - CC3**: Continuous health refresh loop (`startContinuousHealthMonitor`), `<= TTL/3` proactive cadence, dynamic live status UI reflection (`test_rc3_14_health_ttl_continuous_refresh_cc1_cc3.js` — 7/7 PASS).
  * **BB1 - BB8**: Proxy bypass list ordering, readback verification, live control plane 502 interception detection (`test_rc3_13_layer2_preflight_and_control_bypass.js` — 8/8 PASS).
  * **AA1 - AA3**: Unified verified contract across /select, /probe, /rotate (`test_rc3_12_select_verification_contract_aa1_aa3.js` — 9/9 PASS).
  * **Z1 - Z5**: Pinned private CA registration, certificate validation, peer SPKI fingerprint pinning (`test_rc3_11_pinned_proxy_ca_registration_z1_z5.js` — 12/12 PASS).

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned by Owner in RC3.13 remains active and untouched.
   - Owner does NOT need to run Step B or incur any new cloud expense.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
3. **Fail-Closed Invariant**:
   - Strict fail-closed proxy operation: unverified or expired nodes reject all traffic (HTTP 502) and NEVER fall back to DIRECT.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `0a6e843d9e5ae512bf48742473bbd3133050c117` (short: `0a6e843d`)
- Provenance/Packaging Head: `9292ddd5be25b635e0517a6394db8587f486d1b4` (short: `9292ddd5`)
- Tag Target Head: `1f13986ecda10fa56439d3f55e26f425b7a0d404` (short: `1f13986e`)
- Annotated Tag Object: `765990c24b771282e12c0b328c00bfd495a68bbe`
- Release Candidate Tag: `v6.9g.10.3-rc3.17.7.1.4.31`
- Hosted Release Asset: `XPIDER_R6.9G.10.3.7.1.4.31_PRIVATE_EGRESS_RC3.17.zip`
- Asset SHA-256: `2728512b8a0969350926a3ee3643902cc8efa624eac83f6f3b10278cf117c69b`
- Asset Byte Size: `45347376` bytes
- Extracted Deployment Directory: `E:\vivpr\ai\extension-form-sender\XPIDER_R6.9G.10.3.7.1.4.31_PRIVATE_EGRESS_RC3.17`
