# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Real Windows Defect #6229391413)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-17.17
- Authority Cursor: 6229391413
- Last Audit: ChatGPT Audit Decision #6227651132 (`[CHATGPT][FINAL PRE-LIVE GATE][XPIDER PRIVATE EGRESS][PASS — AUTHORIZE ONE REAL ULTRA ECONOMY VPS ACCEPTANCE RUN]`)
- Last Defect Report: Owner Defect #6229391413 (`[OWNER REAL WINDOWS DEFECT][XPIDER PRIVATE EGRESS][RC1 AUTO SETUP BROKEN — CMD LINE-ENDINGS + MISSING NODE DEPENDENCY]`)
- Last Receipt: Receipt #6227489580 (RC1) -> Pending RC2 Closure Receipt
- Build ID: `R6.9G.10.3.7.1.4.13-20261017-PRIVATE-EGRESS-RC2`
- Current Candidate Release Tag: `v6.9g.10.3-rc2.7.1.4.13`
- Functional Head Commit: `d117048a1d7c34d3d865c3bb83b0eb6896e06b99` (short: `d117048a`)
- Provenance/Packaging Head Commit: `9ebff1a052ff897669bb372a08d27a192aa73426` (short: `9ebff1a0`)
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**.
- Release Status: **APPROVED FOR OWNER DAILY USE; PRIVATE EGRESS RC2 ZERO-PREREQUISITE RELEASE-ASSET CLOSURE COMPLETE (TAG v6.9g.10.3-rc2.7.1.4.13) AWAITING CHATGPT PRE-LIVE AUDIT; REAL VPS PROVISIONING ON STRICT HOLD**.
- Defect Resolution & Zero-Prerequisite Packaged-Runtime Status:
  * Windows CMD Batch Line-Endings: **PASS** (`.gitattributes` added with `*.bat text eol=crlf` and `*.cmd text eol=crlf`; 100% pure ASCII; strict CRLF; zero BOM; parser errors eliminated)
  * Bundled Official Node.js LTS Runtime: **PASS** (`runtime/node/node.exe` official v20.18.0 LTS Windows x64 binary, 69,804,184 bytes, SHA-256: `35b7c95a379beb606f5798ed83081690df13190077630b234163c6607aa4cc94`; official LICENSE included)
  * Zero System Dependency Prerequisite: **PASS** (`XPIDER_AUTO_SETUP.bat` resolves `%~dp0runtime\node\node.exe` first; zero system Node/npm required in PATH)
  * Native Host & VBScript Relays: **PASS** (`companion/native_host/xpider_native_host.bat` and `.vbs` launchers resolve bundled Node.js with explicit working directory)
  * Blocker A (Owner IP Discovery Fail-Closed & /32 /128 Scoping): **PASS** (zero 0.0.0.0/0 fallback rule; fail-closed abort verified; IPv4 /32 and IPv6 /128 verified)
  * Blocker B (SFTP Descriptor Transfer & Zero-Secret-Stdout): **PASS** (streamed exclusively via SFTP createReadStream; shell stdout/stderr contain zero secrets)
  * Blocker C (Two-Layer Authoritative Privacy Gate): **PASS** (Layer 1 Companion loopback CONNECT + Layer 2 Extension PrivacyGateway preflight enforced; directFallbackBlocked verified)
  * Blocker D (Stages 2-8 Rollback Matrix): **PASS** (failure injection across stages 2-8 confirms zero billable cloud resources remain)
  * Blocker E (Self-Contained Windows Dependency): **PASS** (XPIDER_AUTO_SETUP.bat verifies and uses pre-bundled ssh2; zero npm install needed)
  * Blocker F (Catalog Availability Check & No Silent Upscale): **PASS** (derived from /sizes catalog at $6/mo; unavailable region aborts fail-closed with same-cost fallback regions)
  * Blocker G (Production Dependency & Locked Setup): **PASS** (`ssh2` in `dependencies`; pre-bundled `node_modules/ssh2`; `require('ssh2')` verified offline)
  * Blocker H (Packaged Server Files & Extracted Resolution): **PASS** (`private-egress/` in package; all files tracked in `PACKAGE_INVENTORY_SHA256.txt`)
  * Blocker I (Provider Price Two-Step Authorization UX): **PASS** (Step A verifies catalog price with zero resource creation; Step B requires verified state + explicit acknowledgment; state invalidates on option changes)
  * Blocker J (Comprehensive 4-Way Rollback Verification): **PASS** (Droplet 404, Firewall 404, Ephemeral Key 404, Companion Node absent; failures report `CLEANUP_REQUIRED` and are never swallowed)
  * Blocker K (Fresh Extracted-Package Release Candidate): **PASS** (Candidate package extracts and runs in isolated directory without modifying `50aee353` baseline)
  * Blocker L (Provenance Synchronization): **PASS** (Runtime implementationHead synchronized to functional commit `d117048a1d7c34d3d865c3bb83b0eb6896e06b99`, rollbackBase `50aee3538806d7b5227fcd929e27979d1e5a3419`, 100% SHA256 mirror parity)
  * Blocker M (GitHub Pre-Release Asset & Clean-Room Smoke): **PASS** (Pre-release published at `v6.9g.10.3-rc2.7.1.4.13`, downloaded fresh from GitHub API, SHA-256 verified 100% identical, clean-room smoke passed 10/10)
  * Full Verification Suite: `test/test_private_egress_security_hardening.js` — **20/20 (100%) PASS**.
  * Downloaded RC2 Asset Smoke Suite (Clean PATH, zero system Node/npm): `scratch/verify_downloaded_rc2.js` — **10/10 (100%) PASS**.

### Operating Guidelines & Invariants:
1. **Ultra Economy Production Tier**:
   - Ultra Economy (~$6/month, 1 vCPU / 1 GiB RAM) remains the locked production default.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
   - Owner daily use continues without disruption.
3. **Hold Invariant**:
   - Do NOT ask Owner to input DigitalOcean API token until ChatGPT reviews and formally audits RC2 Closure Receipt.
   - Zero real cloud VPS billable resources created; real cloud VPS provisioning remains on strict HOLD.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Previous Functional Restore Point: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `d117048a1d7c34d3d865c3bb83b0eb6896e06b99` (short: `d117048a`)
- Provenance/Packaging Head: `9ebff1a052ff897669bb372a08d27a192aa73426` (short: `9ebff1a0`)
- Release Candidate Tag: `v6.9g.10.3-rc2.7.1.4.13`
- Release Candidate Asset: `XPIDER_R6.9G.10.3.7.1.4.13_PRIVATE_EGRESS_RC2.zip` (37,526,141 bytes, SHA-256: `0781ffb0461638a4c836572331adf881e66fff59c6ccfcada72b42eebed664e6`)
- GitHub Release URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc2.7.1.4.13`
