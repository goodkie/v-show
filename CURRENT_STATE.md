# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to ChatGPT Audit [CREDENTIAL-ROTATION-UTILITY-PREEXECUTION] Comment IC_kwDOT53X288AAAABdoJaqQ)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-19.51
- Authority Cursor: 6283329073
- Last Directive / Audit: `[CHATGPT][AUDIT][extension-form-sender][CREDENTIAL-ROTATION-UTILITY-PREEXECUTION] Comment IC_kwDOT53X288AAAABdoJaqQ`
- Last Receipt: `[ANTIGRAVITY][ROTATION UTILITY HARDENING & DRY-RUN RECEIPT: VALID REMOTE JSON, PERMISSION RESTORATION, DPAPI-ONLY PERSISTENCE, 4-PHASE PROOF SEQUENCE, STRICT WATCHDOG HEAL, AND POST-ROTATION PRIVACY] #6283329073`
- Build ID: `R6.9G.10.3.7.1.4.33-20261019-PRIVATE-EGRESS-RC3.19`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.19.7.1.4.33`
- Functional Head Commit: `8a67632672d7df2f6ad66ab1ad77524afc51d2ee`
- State Documentation Commit: `86522bbfc3a0bd4f83b5d063a7bf5f761b109da3`
- Branch Head Commit: `0a782d74d1fd3d67d190b2b3902eb13f972f7d34`
- Provenance Commit: `8bbc905a6857915c5982513b878046907cc21f94`
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.33_PRIVATE_EGRESS_RC3.19.zip`
- Release Asset Size: `45,361,779` bytes
- Release Asset SHA-256: `eadeb5153f053da6914121e900f3c90877a0fdda3b5b620343cdf2868fd5841f`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.19.7.1.4.33`

## Current Gate
- Formal Gates Evaluated by ChatGPT Audit (#6282907439 & #6283221673):
  * **1. Network Privacy Gate: PASS**
  * **2. Automatic Relay Recovery / Campaign Continuity Gate: PASS**
  * **3. Current Release Artifact Hygiene Gate: PASS**
  * **4. Owner Smoke Gate: AUTHORIZED (3–5 controlled/authorized URLs only)**
  * **5. Historical Credential Exposure Remediation: IN PROGRESS (Utility Hardened & Dry-Run PASS)**
- Credential Rotation Utility Hardening (Resolving all 6 P0 Blockers):
  * Blocker 1 (Valid Remote JSON): Numeric `updatedAt` timestamp embedded directly as a number literal.
  * Blocker 2 (Permission Restoration): Remote command explicitly includes `chmod 600`, `chown xpider:xpider`, and reload.
  * Blocker 3 (DPAPI-only Persistence): Zero plaintext secrets persisted on disk. `.pending_credential_rotation.json` stores ONLY `newCipher` (`dpapi:...`).
  * Blocker 4 (4-Phase Proof Sequence): Pre-check asserts OLD credential authenticates with HTTP 200 before rotation is allowed; post-check asserts OLD returns HTTP 407 and NEW returns HTTP 200.
  * Blocker 5 (Strict Watchdog Heal): Autonomous watchdog supervisor must respawn replacement process (distinct PID, READY); zero manual fallback to `ensure_companion_service`.
  * Blocker 6 (Post-rotation Privacy Acceptance): Post-rotation verifies Companion status (`relayReady=true`), remote reachability (`ok=true`), and DNS privacy path (`ok=true`).
  * Non-destructive Dry-Run: 100% PASS (`node scripts/rotate_egress_proxy_credential.js --dry-run`).
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
