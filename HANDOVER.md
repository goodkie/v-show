# XPIDER AutoForm Sender Pro — Handover & Continuity Capsule

## 1. Quick Continuity Overview
- **Project**: XPIDER AutoForm Sender Pro
- **Project ID**: `xpider-autoform-sender-pro`
- **Protocol**: OCA-DEV-1.4
- **Authority**: GitHub Issue `goodkie/v-show#6`
- **Active Branch**: `upgrade/phase-0-1`
- **State Revision**: `2026-10-17.18`
- **Authority Cursor**: `6229814606`
- **Current Gate**: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**. Real VPS Provisioning on **HOLD** pending ChatGPT audit of RC2 Release-Asset Closure Receipt [#6229814606](https://github.com/goodkie/v-show/issues/6#issuecomment-6229814606).

---

## 2. Commit & Provenance Lineage
- **Functional Head Commit**: `d117048a1d7c34d3d865c3bb83b0eb6896e06b99` (short: `d117048a`)
  * Resolves Windows CMD line-endings/batch corruption and bundles zero-prerequisite Node.js LTS runtime (defect #6229391413).
- **Provenance/Packaging Head Commit**: `9ebff1a052ff897669bb372a08d27a192aa73426` (short: `9ebff1a0`)
  * Synchronizes build-provenance in `extension/`, `send_message_backup/build/extension/`, and package inventory to `d117048a`.
- **Immutable Daily-Use Rollback Baseline**: `50aee3538806d7b5227fcd929e27979d1e5a3419`
  * Package: `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip`
  * Invariant: Owner daily production use runs on this build. Never overwrite or break this baseline.

---

## 3. Published Release Candidate & Verification
- **GitHub Release Tag**: `v6.9g.10.3-rc2.7.1.4.13` (Pre-release)
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc2.7.1.4.13
- **Candidate Asset**: `XPIDER_R6.9G.10.3.7.1.4.13_PRIVATE_EGRESS_RC2.zip`
  * Size: `37,526,141` bytes
  * SHA-256: `0781ffb0461638a4c836572331adf881e66fff59c6ccfcada72b42eebed664e6`
- **Release Inventory Asset**: `PACKAGE_INVENTORY_SHA256.txt`
  * SHA-256: `97fc28df2f3ee49257d07997972ba755b46e3e5bc41b0db6a394ec57c79e6587`
- **Bundled Node.js LTS**:
  * Node.js v20.18.0 Windows x64 binary (`runtime/node/node.exe`, 69,804,184 bytes, SHA-256: `35b7c95a379beb606f5798ed83081690df13190077630b234163c6607aa4cc94`)
  * Upstream verification matches official `SHASUMS256.txt`.
- **Verification Status**:
  * `node test/test_private_egress_security_hardening.js` -> **20/20 (100%) PASS**
  * `node scratch/verify_downloaded_rc2.js` -> **10/10 (100%) PASS** (Isolated clean-room verification of fresh GitHub-downloaded asset under restricted `PATH=C:\Windows\System32;C:\Windows` with zero system Node/npm)

---

## 4. Current State & Immediate Invariants
1. **Production Tier Locked**:
   * DigitalOcean Ultra Economy ($6.00/month, 1 vCPU / 1 GiB RAM, `s-1vcpu-1gb`) is the authoritative default production tier.
2. **Hold Invariant**:
   * Do NOT ask the Owner for a real DigitalOcean API token.
   * Zero real cloud droplets, firewalls, or keys exist.
   * Real cloud VPS provisioning remains on **HOLD** until ChatGPT reviews RC2 Closure Receipt and issues an explicit gate authorization.
3. **Next Action**:
   * Post RC2 Closure Receipt to Issue #6.
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

# 3. Run Clean-Room Downloaded Asset Verification (10 tests)
node scratch/verify_downloaded_rc2.js

# 4. Check for New Directives/Audits on Issue #6
node scratch/check_newer.js
```
