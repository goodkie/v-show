# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to ChatGPT Audit [ROTATION-UTILITY-HARDENING-REVIEW] Comment IC_kwDOT53X288AAAABdoUg4A)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-20.52
- Authority Cursor: 6283403488
- Last Directive / Audit: `[CHATGPT][AUDIT][extension-form-sender][ROTATION-UTILITY-HARDENING-REVIEW] Comment IC_kwDOT53X288AAAABdoUg4A`
- Last Receipt: `[ANTIGRAVITY][ROTATION UTILITY TERMINAL HYGIENE & DRY-RUN RECEIPT: ZERO TERMINAL LEAKS, READ -S HIDDEN INPUT, OLD FINGERPRINT CHECK, AND DELINEATED ACCEPTANCE] #6283510714`
- Build ID: `R6.9G.10.3.7.1.4.33-20261019-PRIVATE-EGRESS-RC3.19`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.19.7.1.4.33`
- Functional Head Commit: `8a67632672d7df2f6ad66ab1ad77524afc51d2ee`
- State Documentation Commit: `86522bbfc3a0bd4f83b5d063a7bf5f761b109da3`
- Branch Head Commit: `6328def9`
- Provenance Commit: `8bbc905a6857915c5982513b878046907cc21f94`
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.33_PRIVATE_EGRESS_RC3.19.zip`
- Release Asset Size: `45,361,779` bytes
- Release Asset SHA-256: `eadeb5153f053da6914121e900f3c90877a0fdda3b5b620343cdf2868fd5841f`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.19.7.1.4.33`

## Current Gate
- Formal Gates Evaluated by ChatGPT Audit (#6282907439, #6283221673 & #6283403488):
  * **1. Network Privacy Gate: PASS**
  * **2. Automatic Relay Recovery / Campaign Continuity Gate: PASS**
  * **3. Current Release Artifact Hygiene Gate: PASS**
  * **4. Owner Smoke Gate: AUTHORIZED (3–5 controlled/authorized URLs only)**
  * **5. Rotation Utility Code: PROVISIONAL PASS (pending terminal hygiene & old fingerprint check resolved)**
  * **6. Historical Credential Exposure Remediation: OPEN (Awaiting utility execution)**
- Credential Rotation Utility Terminal Hygiene & Hardening (Resolving Audit #6283403488):
  * Item 1 (Terminal Secret Hygiene): High-entropy password copied silently to Windows clipboard via native `clip.exe`. Remote snippet uses `read -s` hidden input; `cat credentials.json` removed; prints only sanitized `ls -l` and `systemctl status`. Clipboard cleared after verification.
  * Item 2 (Integrity Fingerprint Guard): Strict SHA-256 `oldCredentialFingerprint` assertion before Phase 3 invalidation, aborting with `OLD_CREDENTIAL_STATE_CHANGED` if local state shifted.
  * Item 3 (Acceptance Scope Delineation): Automated utility acceptance covers Companion relay rotation + egress IP + watchdog self-heal; Operator acceptance covers real extension Privacy Preflight + BrowserLeaks IP/DNS + no-direct-fallback in Edge.
  * Item 4 (Empirical Dry-Run Verification): 100% PASS across all 6 dry-run checks (`node scripts/rotate_egress_proxy_credential.js --dry-run`).
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
