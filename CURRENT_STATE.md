# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to ChatGPT Audit [POST-ROTATION-RUNTIME-ROOT-DIVERGENCE] Comment IC_kwDOT53X288AAAABdrY9-Q & [MIXED-RUNTIME-CONFIRMED] Comment IC_kwDOT53X288AAAABdrc5bA)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-20.54
- Authority Cursor: 6287030404
- Last Directive / Audit: `[CHATGPT][AUDIT][extension-form-sender][POST-ROTATION-RUNTIME-ROOT-DIVERGENCE] Comment IC_kwDOT53X288AAAABdrY9-Q`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][CANONICAL-RUNTIME-PARITY-WATCHDOG-REMEDIATION] #6287030404`
- Build ID: `R6.9G.10.3.7.1.4.33-20261019-PRIVATE-EGRESS-RC3.19`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.19.7.1.4.33`
- Functional Head Commit: `8a67632672d7df2f6ad66ab1ad77524afc51d2ee`
- State Documentation Commit: `feb4dce694b76db0a1ddac73dfa236a0f44775e7`
- Branch Head Commit: `feb4dce694b76db0a1ddac73dfa236a0f44775e7`
- Provenance Commit: `8bbc905a6857915c5982513b878046907cc21f94`
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.33_PRIVATE_EGRESS_RC3.19.zip`
- Release Asset Size: `45,361,779` bytes
- Release Asset SHA-256: `eadeb5153f053da6914121e900f3c90877a0fdda3b5b620343cdf2868fd5841f`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.19.7.1.4.33`

## Current Gate
- Formal Gates Evaluated by ChatGPT Audit (#6282907439, #6283221673, #6283403488, #6283557082, #6286347737 & #6286622201):
  * **1. Network Privacy Gate: PASS**
  * **2. Automatic Relay Recovery / Campaign Continuity Gate: PASS**
  * **3. Current Release Artifact Hygiene Gate: PASS**
  * **4. Credential Rotation & Old Invalidation Gate: PASS (Remote Droplet HTTP 200 on new, HTTP 407 on old, verified)**
  * **5. Egress Identity Gate: PASS (159.203.28.198 verified)**
  * **6. Runtime Root Parity & Credential Store Authority Gate: PASS (%LOCALAPPDATA% primary authoritative, rootParity=true, Windows Startup & Native Host canonicalized)**
  * **7. Autonomous Watchdog Self-Heal Acceptance Gate: PASS (Verified in 4.04s, distinct PID, READY, 0 manual fallback)**
  * **8. Owner Smoke Gate: AUTHORIZED (3–5 controlled/authorized URLs only)**
- Post-Rotation Divergence & Watchdog Remediation (Resolving Audits #6286347737 & #6286622201):
  * Item 1 (Authoritative %LOCALAPPDATA% Credential Store): Refactored `companion/winsec.js` `loadLocalCredentials` to place persistent `%LOCALAPPDATA%\XPIDER_Privacy_Relay\.local_credentials.json` as the primary authoritative store before package-local stores, preventing stale shadowing across unpacked folders.
  * Item 2 (All-Path Watchdog Verification in ensure_companion_service): Refactored `companion/ensure_companion_service.js` with `ensureWatchdogSupervisor()` executing on ALL success paths (including "Companion already running and current") and checking runtime root parity against `ROOT_DIR`.
  * Item 3 (Heartbeat & Root Identity in Watchdog Lock): Updated `companion/companion-watchdog.js` to store structured JSON in `.watchdog.lock` with `pid`, `companionDir`, `runtimeRoot`, and active `heartbeat`. Stale locks (>15s or divergent root) are automatically reclaimed.
  * Item 4 (Root Parity Reporting in /health & /status): Added `runtimeRoot`, `watchdogRoot`, `rootParity`, and `watchdogSupervisor` diagnostics to both public `/health` and authenticated `/status` endpoints.
  * Item 5 (Canonical System Registration): Reregistered Windows Startup wrapper (`XPIDER_Privacy_Relay.vbs`) and Chrome/Edge Native Messaging Hosts directly to the canonical workspace repository root.
  * Item 6 (Empirical Acceptance Verification):
    - Test A (Watchdog ensured on healthy Companion): PASS (`[OK] Companion Watchdog supervisor active in background`).
    - Test B (Autonomous Watchdog Self-Heal): PASS (Companion killed, replacement PID 18664 auto-spawned in 4.04s, `lifecycleState=READY`, `relayReady=true`, 0 manual fallback).
    - Dry-Run: 100% PASS across all 6 checks (`node scripts/rotate_egress_proxy_credential.js --dry-run`).
- Remediation & Hygiene Verification Confirmed Clean:
  - Tracked `companion/egress_pool_config.json` and `companion/example_config.json` sanitized: `credentialRef: ""` and `password: ""`.
  - Live DPAPI encrypted credentials isolated strictly to unversioned local store (`companion/.local_credentials.json` and `%LOCALAPPDATA%\XPIDER_Privacy_Relay\.local_credentials.json`), excluded from git and release packages.
  - Automatic runtime/startup credential hydration implemented in `companion/winsec.js` (`resolveNodeCredentials` / `hydrateNode`) and `companion/privacy-relay-service.js`.
  - Deep archive content scanners implemented in `pack_owner_beta_package.js` (Step 2f) and `scratch/verify_local_rc3_19.js` (Gate 1B) asserting zero non-empty `credentialRef`, zero DPAPI blobs (`dpapi:`), zero private keys, zero plaintext passwords, and zero API tokens.
  - Hosted GitHub release asset verified clean (`45,361,779` bytes, SHA-256: `eadeb5153f053da6914121e900f3c90877a0fdda3b5b620343cdf2868fd5841f`).
  - Corrected State Documentation Commit SHA to exact `86522bbfc3a0bd4f83b5d063a7bf5f761b109da3`.
  - Corrected provenance commit hash to exact `8bbc905a6857915c5982513b878046907cc21f94`.
  - Cited authoritative harness soak duration accurately as `3622 seconds (60.37 minutes)`.
  - Release tag `v6.9g.10.3-rc3.19.7.1.4.33` synchronized with sanitized release asset.

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned in TOR1 remains 100% active and untouched. Zero cloud VPS mutations.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - Zero credentials, tokens, or runtime files inside released ZIP. Verified by deep content scan.
