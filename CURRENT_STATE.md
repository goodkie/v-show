# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Directives #6310936412, #6311145870, #6313213003, #6313430588, #6314200711, and Independent Audit #6314729749)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-21.80
- Authority Cursor: 6314729749
- Last Directive / Audit: `[CHATGPT][INDEPENDENT-AUDIT][extension-form-sender][RC3.35-STILL-HOLD-REPAIR-CONTRACT-BUG-AND-E2E-ASSERTION-GAPS] Comment #6314729749`
- Last Receipt: `[ANTIGRAVITY][CORRECTIVE-RECEIPT][extension-form-sender][RC3.36-FINAL-SPRINT-REPAIR-CONTRACT-AND-SINGLE-WRITER-PASS] Comment #6315445566`
- Build ID: `R6.9G.10.3.7.1.4.50-20261021-FINAL-SPRINT-RC3.36`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.36.7.1.4.50`
- Functional Snapshot Head Commit (F): `a37aee3d0317e6c8901dc5cb95a393a117ef513a` (`a37aee3d`)
- Provenance Commit (P): `add1401e25dd0b38b0118a6c35dfdf8eaa290d05` (`add1401e`)
- Rollback Anchor: `44ab031d23614aebe0e9dae580e0c904fa1e2b4f` (RC3.35)
- Previous Functional Restore Point: `44ab031d23614aebe0e9dae580e0c904fa1e2b4f` (RC3.35)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.50_PRIVATE_EGRESS_RC3.36.zip`
- Release Asset Size: `45,388,063` bytes
- Release Asset SHA-256: `045c65e224c35a6ca28202d137ec3ed6b4a6250d6496a73b98af38883646604f`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.36.7.1.4.50`
- Unpacked Convenience Folder: `XPIDER_R6.9G.10.3.7.1.4.50_PRIVATE_EGRESS_RC3.36`

## Sprint Finalization Audit Remediations: [RC3.36-FINALIZATION-VERIFICATION-COMPLETE]

### 1. Preflight & Repair Contract Fix (`companion/private-egress-provisioner.js`) — 100% PASS
- Remedied critical mismatch identified in Audit #6314729749: `runAuthoritativePreflight()` previously returned `{ ready: true }` without `ok: true`, causing `repairExistingEgress()` to fail when evaluating `!preflight.ok`.
- Normalized `runAuthoritativePreflight()` across mock and real modes to return `{ ready: true, ok: true, success: true }` on success, and `{ ready: false, ok: false, success: false, reason, error }` on failure.
- Normalized `probeCompanionNode()` to return `{ success: true, ok: true, verified: true }`.
- In `repairExistingEgress()`:
  - Step 4: `tlsHealthy = Boolean(probeRes && (probeRes.ok === true || probeRes.verified === true || probeRes.success === true));`
  - Step 5: `isPreflightOk = Boolean(preflight && (preflight.ready === true || preflight.ok === true || preflight.success === true));`
  - Preserved droplet reboot indicator: `this.dropletRebootTriggered`.
- Added regression tests in `test_sprint_track_a_egress_repair.js`:
  - Test 4A: Healthy TLS without reboot -> preflight -> `REPAIRED_READY` (PASS).
  - Test 4B: Unresponsive TLS triggers reboot -> preflight -> `REPAIRED_READY` (PASS).
  - Test 4C: Preflight failure -> `EGRESS_PROBE_TIMEOUT` with surfaced reason (PASS).
  - Full suite outcome: **5 / 5 PASS (100% Green)**.

### 2. Single-Writer Invariant & Duplicate Token Rejection (`extension/background.js` & Rehearsal) — 100% PASS
- Hardened `verifyAndRecordCaptchaSuccess` and `handleSolveCaptchaInternal` with attempt-scoped single-writer guards:
  - If a token was already written to the MAIN world for the attempt, any second token injection or solve attempt is rejected immediately with `[CAPTCHA_DUPLICATE_TOKEN_REJECTED]` and `{ success: false, error: 'DUPLICATE_TOKEN_REJECTED', duplicateIgnored: true }`.
  - Added deterministic test hook `globalThis.__xpider_testDuplicateTokenInjection`.
- In `run_edge_sprint_full_captcha_e2e_rehearsal.js`:
  - Strengthened Invariant 7: Enforced strict equality `assert.strictEqual(observedInvariants.mainWorldWriteCount, 1)`.
  - Explicitly tested that duplicate token injection is rejected: dispatched duplicate injection request, asserted duplicate rejection event in logs (`duplicateRejections >= 1`), and verified `mainWorldWriteCount` remained strictly 1.
  - Strengthened Invariant 6: Captured `frameInventory`, `selectedFrameId`, and `appliedFrameId`; asserted that `selectedFrameId` came from inventory (`inventoryCount=1`), matched the widget-bearing frame, and the MAIN-world token write occurred in that exact frame (`selectedFrameId === 0`, `appliedFrameId === 0`).
  - Rehearsal executed live in real Microsoft Edge via CDP: **16/16 PASS 100%**.

### 3. Real Companion Kill Watchdog Recovery & Security Hardening — 100% PASS
- Fixed recursive loop in `companion/ensure_companion_service.js`: `launchCompanionProcess()` spawns `privacy-relay-service.js` directly with `spawn` instead of calling `start_relay_silent.vbs`.
- Executed `test/test_real_companion_kill_watchdog_recovery.js`:
  - Real process kill: Terminated Companion PID 22404.
  - Fail-closed: Verified ports 18988 and 18989 immediately refused connections (zero direct leak).
  - Autonomous healing: Watchdog supervisor detected outage and spawned replacement Companion (PID 33276) in 7.7 seconds.
  - Result: **PASS 100%**.
- Executed `test/test_private_egress_security_hardening.js`:
  - Verified all 20/20 checks: **PASS 100%**.

### 4. Expanded Real Manifest Runner (`test_manifest.json`) — 41/41 ACTIVE SUITES PASS
- Expanded `scripts/run_exhaustive_manifest_runner.js` to execute representative blocker suites:
  - `test/test_real_companion_kill_watchdog_recovery.js`
  - `test/test_private_egress_security_hardening.js`
  - `test_rc3_29_single_authority_and_writer.js`
  - `run_edge_sprint_full_captcha_e2e_rehearsal.js`
  - All 41 active suites spawned as real subprocesses with real wall-clock timing:
    - **41 / 41 PASS, 0 FAIL, 113 SKIPPED (Total Wall Time: 94.1s)**.
    - Full stdout/stderr logs saved in `scratch/test_logs/` with authentic SHA-256 digests in `test_manifest.json`.

### 5. Lineage & Packaging (RC3.36) — 100% IMMUTABLE F -> P
- Functional Snapshot Commit (F): `a37aee3d0317e6c8901dc5cb95a393a117ef513a`
- Provenance Commit (P): `add1401e25dd0b38b0118a6c35dfdf8eaa290d05` (Direct child of F)
- Release Tag: `v6.9g.10.3-rc3.36.7.1.4.50` pointing directly to P
- Packaged `XPIDER_R6.9G.10.3.7.1.4.50_PRIVATE_EGRESS_RC3.36.zip` (45,388,063 bytes, SHA-256: `045c65e224c35a6ca28202d137ec3ed6b4a6250d6496a73b98af38883646604f`)
- Unpacked into `XPIDER_R6.9G.10.3.7.1.4.50_PRIVATE_EGRESS_RC3.36/` and verified 100% syntax clean via `node --check`
- Release created on GitHub and ZIP attached
