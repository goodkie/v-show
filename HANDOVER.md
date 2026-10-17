# XPIDER AutoForm Sender Pro — Handover & Continuity Capsule

## 1. Quick Continuity Overview
- **Project**: XPIDER AutoForm Sender Pro
- **Project ID**: `xpider-autoform-sender-pro`
- **Protocol**: OCA-DEV-1.4
- **Authority**: GitHub Issue `goodkie/v-show#6`
- **Active Branch**: `upgrade/phase-0-1`
- **State Revision**: `2026-10-17.20`
- **Authority Cursor**: `6230074010`
- **Current Gate**: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**. Real VPS Provisioning on **HOLD** pending ChatGPT audit of RC3.1 Release-Asset Closure Receipt [#6230074010](https://github.com/goodkie/v-show/issues/6#issuecomment-6230074010).

---

## 2. Commit & Provenance Lineage
- **Functional Head Commit**: `3cad7043a0077e77bb2981669d4a584da08cde1b` (short: `3cad7043`)
  * Enforces strict Node.js supported LTS allowlist `[22, 24]` across batch setup, relay service, and native host; eliminates EOL odd major leak (resolves Defect P).
- **Provenance/Packaging Head Commit**: `e236f092f4884f7b5396fdd1a080e6e8c55f779c` (short: `e236f092`)
  * Synchronizes exact 40-character functional commit SHA into `build-provenance.js` and package inventory with 100% SHA256 mirror parity across all 26 files in SRC, BLD, and EXT.
- **Immutable Daily-Use Rollback Baseline**: `50aee3538806d7b5227fcd929e27979d1e5a3419`
  * Package: `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip`
  * Invariant: Owner daily production use runs on this build. Never overwrite or break this baseline.

---

## 3. Published Release Candidate 3.1 & Verification
- **GitHub Release Tag**: `v6.9g.10.3-rc3.1.7.1.4.15` (Pre-release)
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.1.7.1.4.15
- **Candidate Asset**: `XPIDER_R6.9G.10.3.7.1.4.15_PRIVATE_EGRESS_RC3.1.zip`
  * Size: `45,503,092` bytes
  * SHA-256: `7354b429551d046cdd1bc5b40a6d177649421b33b4caf694dcb3d0df921547cd`
- **Release Inventory Asset**: `PACKAGE_INVENTORY_SHA256.txt`
  * SHA-256: `0d9f4f41ab55d4d572996ef2f3af484441affac59628e605f1f83e61a2e8847c`
- **Bundled Node.js LTS**:
  * Node.js v24.22.0 Windows x64 binary (`runtime/node/node.exe`, 93,882,184 bytes, SHA-256: `ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c`)
- **Verification Status**:
  * `node test/test_private_egress_security_hardening.js` -> **20/20 (100%) PASS**
  * `node test/test_runtime_lts_allowlist.js` -> **6/6 (100%) PASS**
  * `node scratch/verify_downloaded_rc3_1.js` -> **10/10 (100%) PASS** (Isolated clean-room verification of fresh GitHub-downloaded asset under restricted `PATH=C:\Windows\System32;C:\Windows` with zero system Node/npm)

---

## 4. Current State & Immediate Invariants
1. **Production Tier Locked**:
   * DigitalOcean Ultra Economy ($6.00/month, 1 vCPU / 1 GiB RAM, `s-1vcpu-1gb`) is the authoritative default production tier.
2. **Hold Invariant**:
   * Do NOT ask the Owner for a real DigitalOcean API token.
   * Zero real cloud droplets, firewalls, or keys exist.
   * Real cloud VPS provisioning remains on **HOLD** until ChatGPT reviews RC3.1 Closure Receipt and issues an explicit gate authorization.
3. **Next Action**:
   * Await ChatGPT Final Pre-Live Audit and Gate decision on RC3.1 Release Asset.
   * When ChatGPT posts the audit decision:
     - If PASS & Provisioning Authorized: Request Owner token or execute authorized live test according to directive.
     - If HOLD / REMEDIATION: Implement requested adjustments autonomously without bothering the Owner.

---

## 5. Verification Commands for New Agent
```bash
# 1. Verify Git Lineage
git status
git log -n 3 --oneline

# 2. Run Comprehensive Security & Hardening Suite (20 tests)
node test/test_private_egress_security_hardening.js

# 3. Run Allowlist Test Suite (6 tests)
node test/test_runtime_lts_allowlist.js

# 4. Run Clean-Room Downloaded RC3.1 Asset Verification (10 tests)
node scratch/verify_downloaded_rc3_1.js

# 5. Check for New Directives/Audits on Issue #6
node scratch/check_newer.js
```
