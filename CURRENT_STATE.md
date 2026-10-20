# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to ChatGPT Directive & Owner Evidence [POST-REBOOT-E2E-PASS-AND-PACKAGE-PARITY-HOLD] Comment #6287399145)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-20.55
- Authority Cursor: 6287399145
- Last Directive / Audit: `[CHATGPT][OWNER-EVIDENCE][extension-form-sender][POST-REBOOT-E2E-PASS-AND-PACKAGE-PARITY-HOLD] Comment #6287399145`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.20-PACKAGE-PARITY-AND-RELEASE-PROVENANCE]`
- Build ID: `R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.20.7.1.4.34`
- Functional Head Commit: `dfaecf60458d72c0c53a5fe26821093a81d93ea9`
- State Documentation Commit: `aab832652f6c2cb2020fec2099a8cf5078d04c3d`
- Branch Head Commit: `800eca67119ff3d85743dbce701620c5d6c5c701`
- Provenance Commit: `800eca67119ff3d85743dbce701620c5d6c5c701`
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20.zip`
- Release Asset Size: `45,363,267` bytes
- Release Asset SHA-256: `f490706fc8d5ed068914811d6bcd318a3f61b9624429cc03501b16ce1bdaa3f5`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.20.7.1.4.34`

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
  - Release tag `v6.9g.10.3-rc3.19.7.1.4.33` placed on HOLD / OBSOLETE SNAPSHOT per Audit #6287399145.
- RC3.20 Release Packaging & Packaged-Source Parity Verification (Resolving Audit #6287399145):
  * **1. Canonical Package Generation**: Produced clean `XPIDER_R6.9G.10.3.7.1.4.34_PRIVATE_EGRESS_RC3.20.zip` directly from verified canonical workspace.
  * **2. Release Asset Metrics**: Size: `45,363,267` bytes, SHA-256: `f490706fc8d5ed068914811d6bcd318a3f61b9624429cc03501b16ce1bdaa3f5`.
  * **3. Denylist & Zero-Leakage Scan**: 339 archive entries inspected; strictly 0 `.control_token`, 0 `*.log`, 0 `*.tmp`, 0 `*.lock`, 0 `.private_*`.
  * **4. Deep Secret & Credential Scan (Gate 1B)**: 100% clean; zero DPAPI blobs, zero non-empty `credentialRef`, zero private keys, zero plaintext passwords, zero API tokens.
  * **5. Packaged-Source SHA-256 Byte Parity (Gate 7)**: 100% byte-for-byte SHA256 match between canonical Workspace and extracted package across all 10 critical components (`privacy-relay-service.js`, `companion-watchdog.js`, `ensure_companion_service.js`, `winsec.js`, `start_relay_silent.vbs`, `background.js`, `content-script.js`, `popup.js`, `build-provenance.js`, `privacy-gateway.js`).
  * **6. Live Companion Build Upgrade**: Live companion updated to `R6.9G.10.3.7.1.4.34-20261020-PRIVATE-EGRESS-RC3.20` (PID 11844, watchdog PID 18104, `relayReady=true`, `rootParity=true`).
  * **7. E2E Egress Verification**: PowerShell proxy probe through `http://127.0.0.1:18988` verified returning `159.203.28.198` (HTTP 200).

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned in TOR1 remains 100% active and untouched. Zero cloud VPS mutations.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - Zero credentials, tokens, or runtime files inside released ZIP. Verified by deep content scan.
