# XPIDER AutoForm Sender Pro — Handover & Continuity Capsule

## 1. Quick Continuity Overview
- **Project**: XPIDER AutoForm Sender Pro
- **Project ID**: `xpider-autoform-sender-pro`
- **Protocol**: OCA-DEV-1.4
- **Authority**: GitHub Issue `goodkie/v-show#6` (Responding to Directives #6231022137 and #6244711545)
- **Active Branch**: `upgrade/phase-0-1`
- **State Revision**: `2026-10-18.21`
- **Authority Cursor**: `6244711545`
- **Current Gate**: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**. Real VPS Provisioning Step B on **HOLD**.

---

## 2. Commit & Provenance Lineage
- **Functional Head Commit**: `4919d0c4c8bf180fb967f8125f186350b3c5edf3` (short: `4919d0c4`)
  * Resolves P0 UI modal stack defect (Settings closed before wizard open, explicit z-index hierarchy 1000/1100/1200).
  * Resolves Defect Q1: `/verify-plan` safe request scoping outside try, secret token redaction, deterministic error codes & statuses (400, 401, 403, 500).
  * Resolves Defect Q2: Authoritative companion upgrade via `ensure_companion_service.js`, `/health` capabilities advertising, `/shutdown` endpoint, stale PID discovery and termination, fail-closed setup check, EADDRINUSE listeners.
  * Resolves Defect Q3: Strict live provider price validation, elimination of all hardcoded `$6` and `0.00893` fallbacks.
- **Provenance/Packaging Head Commit**: `82d2d567a04720fa94b93a5be5ef9aedb95049e9` (short: `82d2d567`)
  * Synchronizes exact 40-character functional commit SHA into `build-provenance.js`, `companion/privacy-relay-service.js`, and package inventory with 100% SHA256 mirror parity across all 26 files in SRC, BLD, and EXT.
- **Immutable Daily-Use Rollback Baseline**: `50aee3538806d7b5227fcd929e27979d1e5a3419`
  * Package: `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip`
  * Invariant: Owner daily production use runs on this build. Never overwrite or break this baseline.

---

## 3. Published Release Candidate 3.2 & Verification
- **GitHub Release Tag**: `v6.9g.10.3-rc3.2.7.1.4.16` (Pre-release)
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.2.7.1.4.16
- **Candidate Asset**: `XPIDER_R6.9G.10.3.7.1.4.16_PRIVATE_EGRESS_RC3.2.zip`
  * Size: `45,509,583` bytes
  * SHA-256: `f5e561c5c28a88c778deab12158d96958207f9d7f7aec1c0bc7d12028f14e764`
- **Verification Status**:
  * `node test/test_rc3_2_defects_q1_q2_q3_ui.js` -> **33/33 (100%) PASS**
  * `node test/test_runtime_lts_allowlist.js` -> **6/6 (100%) PASS**
  * `node test/test_private_egress_security_hardening.js` -> **20/20 (100%) PASS**
  * `node scratch/verify_downloaded_rc3_2.js` -> **10/10 (100%) PASS** (Isolated clean-room verification of fresh GitHub-downloaded asset under restricted `PATH=C:\Windows\System32;C:\Windows` with zero system Node/npm)

---

## 4. Current State & Immediate Invariants
1. **Production Tier Locked**:
   * DigitalOcean Ultra Economy ($6.00/month, 1 vCPU / 1 GiB RAM, `s-1vcpu-1gb`) is the authoritative default production tier.
2. **Hold Invariant**:
   * Zero real cloud droplets, firewalls, or keys exist.
   * Real cloud VPS provisioning Step B remains on **HOLD** until Owner verifies Step A locally.
3. **Next Action**:
   * Post Closure Receipt to Issue #6.

---

## 5. Verification Commands for New Agent
```bash
# 1. Verify Git Lineage
git status
git log -3 --oneline

# 2. Run All Verification Suites
node test/test_rc3_2_defects_q1_q2_q3_ui.js
node test/test_runtime_lts_allowlist.js
node test/test_private_egress_security_hardening.js

# 3. Clean-Room Downloaded Release Smoke
node scratch/verify_downloaded_rc3_2.js
```
