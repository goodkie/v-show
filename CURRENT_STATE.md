# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Audit #6229966368)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-17.20
- Authority Cursor: 6230074010
- Last Audit: ChatGPT Audit Decision #6229966368 (`[CHATGPT][RC3 FINAL AUDIT][XPIDER PRIVATE EGRESS][NORMAL PATH PASS — ONE FALLBACK GUARD DEFECT REMAINS]`)
- Last Receipt: Receipt #6230074010 (https://github.com/goodkie/v-show/issues/6#issuecomment-6230074010 — `[ANTIGRAVITY][RC3.1 LTS-ALLOWLIST FALLBACK CLOSURE RECEIPT]`)
- Build ID: `R6.9G.10.3.7.1.4.15-20261017-PRIVATE-EGRESS-RC3.1`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.1.7.1.4.15`
- Functional Head Commit: `3cad7043a0077e77bb2981669d4a584da08cde1b` (short: `3cad7043`)
- Provenance/Packaging Head Commit: `e236f092f4884f7b5396fdd1a080e6e8c55f779c` (short: `e236f092`)
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**.
- Release Status: **APPROVED FOR OWNER DAILY USE; PRIVATE EGRESS RC3.1 LTS-ALLOWLIST RELEASE-ASSET CLOSURE COMPLETE (TAG v6.9g.10.3-rc3.1.7.1.4.15 / RECEIPT #6230074010) AWAITING CHATGPT FINAL PRE-LIVE AUDIT; REAL VPS PROVISIONING ON STRICT HOLD**.
- Defect P & Packaged-Runtime Status:
  * Defect P (Strict Supported LTS Allowlist): **PASS** (Explicit allowlist `[22, 24]` enforced across batch, relay, and native host; non-allowlisted odd/EOL majors strictly rejected; unit tests 6/6 PASS in `test/test_runtime_lts_allowlist.js`)
  * Blocker N (Supported Node.js LTS Runtime): **PASS** (`runtime/node/node.exe` official Node.js v24.22.0 LTS Windows x64 binary, 93,882,184 bytes, SHA-256: `ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c`; official LICENSE included)
  * Blocker O (Runtime Provenance Full SHA & Parity): **PASS** (Runtime implementationHead synchronized to exact functional commit `3cad7043a0077e77bb2981669d4a584da08cde1b`, rollbackBase `50aee3538806d7b5227fcd929e27979d1e5a3419`, 100% SHA256 mirror parity across all 26 files in SRC, BLD, EXT)
  * Windows CMD Batch Line-Endings: **PASS** (`.gitattributes` added with `*.bat text eol=crlf` and `*.cmd text eol=crlf`; 100% pure ASCII; strict CRLF; zero BOM; parser errors eliminated)
  * Zero System Dependency Prerequisite: **PASS** (`XPIDER_AUTO_SETUP.bat` resolves `%~dp0runtime\node\node.exe` first; zero system Node/npm required in PATH)
  * Native Host & VBScript Relays: **PASS** (`companion/native_host/xpider_native_host.bat` and `.vbs` launchers resolve bundled Node.js with explicit working directory)
  * Full Security Suite: `test/test_private_egress_security_hardening.js` — **20/20 (100%) PASS**.
  * Allowlist Test Suite: `test/test_runtime_lts_allowlist.js` — **6/6 (100%) PASS**.
  * Downloaded RC3.1 Asset Smoke Suite (Clean PATH, zero system Node/npm): `scratch/verify_downloaded_rc3_1.js` — **10/10 (100%) PASS**.

### Operating Guidelines & Invariants:
1. **Ultra Economy Production Tier**:
   - Ultra Economy (~$6/month, 1 vCPU / 1 GiB RAM) remains the locked production default.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
   - Owner daily use continues without disruption.
3. **Hold Invariant**:
   - Do NOT ask Owner to input DigitalOcean API token until ChatGPT reviews and formally audits RC3.1 Closure Receipt.
   - Zero real cloud VPS billable resources created; real cloud VPS provisioning remains on strict HOLD.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Previous Functional Restore Point: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `3cad7043a0077e77bb2981669d4a584da08cde1b` (short: `3cad7043`)
- Provenance/Packaging Head: `e236f092f4884f7b5396fdd1a080e6e8c55f779c` (short: `e236f092`)
- Release Candidate Tag: `v6.9g.10.3-rc3.1.7.1.4.15`
- Release Candidate Asset: `XPIDER_R6.9G.10.3.7.1.4.15_PRIVATE_EGRESS_RC3.1.zip` (45,503,092 bytes, SHA-256: `7354b429551d046cdd1bc5b40a6d177649421b33b4caf694dcb3d0df921547cd`)
- GitHub Release URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.1.7.1.4.15`
