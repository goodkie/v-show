# XPIDER AutoForm Sender Pro — Handover & Continuity Capsule

## 1. Quick Continuity Overview
- **Project**: XPIDER AutoForm Sender Pro
- **Project ID**: `xpider-autoform-sender-pro`
- **Protocol**: OCA-DEV-1.4
- **Authority**: GitHub Issue `goodkie/v-show#6`
- **Active Branch**: `upgrade/phase-0-1`
- **State Revision**: `2026-10-17.19`
- **Authority Cursor**: `6229944767`
- **Current Gate**: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**. Real VPS Provisioning on **HOLD** pending ChatGPT audit of RC3 Release-Asset Closure Receipt [#6229944767](https://github.com/goodkie/v-show/issues/6#issuecomment-6229944767).

---

## 2. Commit & Provenance Lineage
- **Functional Head Commit**: `920f69c16c3b09649b3da5044fbf3edc4153755f` (short: `920f69c1`)
  * Bundles supported Node.js v24.22.0 LTS (Krypton) runtime and enforces supported LTS startup guardrails (resolves Blocker N).
- **Provenance/Packaging Head Commit**: `2ffa8ec229ef1ba583d2bbb29afef034b1aa03c2` (short: `2ffa8ec2`)
  * Synchronizes exact 40-character functional commit SHA into `build-provenance.js` and package inventory with 100% SHA256 mirror parity across all 26 files in SRC, BLD, and EXT (resolves Blocker O).
- **Immutable Daily-Use Rollback Baseline**: `50aee3538806d7b5227fcd929e27979d1e5a3419`
  * Package: `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip`
  * Invariant: Owner daily production use runs on this build. Never overwrite or break this baseline.

---

## 3. Published Release Candidate 3 & Verification
- **GitHub Release Tag**: `v6.9g.10.3-rc3.7.1.4.14` (Pre-release)
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.7.1.4.14
- **Candidate Asset**: `XPIDER_R6.9G.10.3.7.1.4.14_PRIVATE_EGRESS_RC3.zip`
  * Size: `45,502,852` bytes
  * SHA-256: `12193a04c57ebb3dd0ab2543326410681f686a01f9032cf30d8dcd4394eec7b6`
- **Release Inventory Asset**: `PACKAGE_INVENTORY_SHA256.txt`
  * SHA-256: `a9de6314644f4f9d6ce70a56085a2881969bfdfbbcbc10ca9e1681185dcfade3`
- **Bundled Node.js LTS**:
  * Node.js v24.22.0 Windows x64 binary (`runtime/node/node.exe`, 93,882,184 bytes, SHA-256: `ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c`)
  * Upstream verification matches official `SHASUMS256.txt`.
- **Verification Status**:
  * `scratch\node_v24\node.exe test/test_private_egress_security_hardening.js` -> **20/20 (100%) PASS**
  * `node scratch/verify_downloaded_rc3.js` -> **10/10 (100%) PASS** (Isolated clean-room verification of fresh GitHub-downloaded asset under restricted `PATH=C:\Windows\System32;C:\Windows` with zero system Node/npm)

---

## 4. Current State & Immediate Invariants
1. **Production Tier Locked**:
   * DigitalOcean Ultra Economy ($6.00/month, 1 vCPU / 1 GiB RAM, `s-1vcpu-1gb`) is the authoritative default production tier.
2. **Hold Invariant**:
   * Do NOT ask the Owner for a real DigitalOcean API token.
   * Zero real cloud droplets, firewalls, or keys exist.
   * Real cloud VPS provisioning remains on **HOLD** until ChatGPT reviews RC3 Closure Receipt and issues an explicit gate authorization.
3. **Next Action**:
   * Await ChatGPT Pre-Live Audit and Gate decision on RC3 Release Asset.
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
scratch\node_v24\node.exe test/test_private_egress_security_hardening.js

# 3. Run Clean-Room Downloaded RC3 Asset Verification (10 tests)
node scratch/verify_downloaded_rc3.js

# 4. Check for New Directives/Audits on Issue #6
node scratch/check_newer.js
```
