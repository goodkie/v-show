# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Owner Directives & Real Acceptance #6258545033, #6258610246, #6258668961)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.37
- Authority Cursor: 6258668961
- Last Directive / Audit: [OWNER REAL ACCEPTANCE][RC3.12][LAYER-2 PREFLIGHT BLOCKED] #6258545033, [OWNER CLEANUP FAILURE][RC3.12][HTTP_502] #6258610246, [OWNER MANUAL CLOUD CLEANUP][RC3.12] #6258668961
- Last Receipt: `[ANTIGRAVITY][RC3.13 LAYER2-PREFLIGHT DIAGNOSTIC CLOSURE RECEIPT]`
- Current Target Receipt: `[ANTIGRAVITY][REAL RC3.13 ULTRA ECONOMY ACCEPTANCE RECEIPT]` (Or `[OWNER REAL RC3.13 ACCEPTANCE RESULT]`)
- Build ID: `R6.9G.10.3.7.1.4.27-20261018-PRIVATE-EGRESS-RC3.13`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.13.7.1.4.27`
- Functional Head Commit: `5860689a07a7dce899d578edaba29503fa11ef9f` (short: `5860689a`)
- Provenance/Packaging Head Commit: `aa5aed2b48aa9221124d770c0c6cbf7906d48259` (short: `aa5aed2b`)
- Tag Object SHA: `6f2e0e11d037dab4f0e024e95de55076e92f0f58`
- Tag Target Commit SHA: `aa5aed2b48aa9221124d770c0c6cbf7906d48259`
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **RC3.13 CODE/PACKAGE AUDIT READY (REAL STEP B HOLD PENDING CHATGPT GATE AUDIT & CLOUD-CLEAN RE-VERIFICATION)**.
- Audit & Gate Summary:
  * In live Step B run for RC3.12, Companion Stages 1/8 to 7/8 all passed; Stage 8/8 halted at post-provision Extension Layer-2 Preflight with `DIRECT_FALLBACK_NOT_BLOCKED`.
  * In teardown dispatch, Owner encountered `Destroy failed: [HTTP_502]` and popup showed `Companion: NOT RUNNING`.
  * **Root Cause 1 Eliminated (BB1 - BB3)**: In `applyManagedProxy()`, placing explicit bypass rules before `<-loopback>` caused Chromium to route Companion control plane calls (`http://127.0.0.1:18989`) through the local relay proxy, which fail-closed with HTTP 502 (`LOOPBACK_127_0_0_0`). Fixed by guaranteeing `<-loopback>` is FIRST in `rules.bypassList`, followed by control-plane rules, verified via readback assertion (`ctrlIdx > loopbackIdx`) and live `/health` 502 check.
  * **Root Cause 2 Eliminated (BB4 - BB6)**: Teardown transport independence: `destroyPrivateEgress()` clears proxy settings before dispatch; preserves structured error payloads without 502 collapse; `getRecoveryStatus()` auto-clears proxy on 502.
  * **Root Cause 3 Eliminated (BB7)**: In `popup.js`, surfaces `pfResult.failureReason || pfResult.reason`; strictly enforces enum `directFallbackBlocked !== 'BLOCKED'`; logs sanitized fields for both Layer-2 steps.
  * **BB8 PASS**: Dedicated regression test `test_rc3_13_layer2_preflight_and_control_bypass.js` passes 8/8 tests (100%).
- Retained Guarantees:
  * **AA1 - AA3**: Unified verified contract across /select, /select/:id, /probe, /rotate (`test_rc3_12_select_verification_contract_aa1_aa3.js` — 9/9 PASS).
  * **Z1 - Z5**: Pinned private CA registration, certificate validation, fail-closed missing CA, peer SPKI fingerprint pinning, expected egress IP verification (`test_rc3_11_pinned_proxy_ca_registration_z1_z5.js` — 12/12 PASS).
  * **Y1 - Y5**: Side-panel clickability resilience, static overlay triple fail-safe, click interception diagnostics (`test_rc3_10_side_panel_clickability_y1_y5.js` — 7/7 PASS).
  * **X1 - X6**: Two-layer TLS separation, eventual consistency bounded deletion, structured error propagation (`test_rc3_9_canary_tls_and_eventual_delete_x1_x6.js` — 7/7 PASS).
  * Control Plane Button Binding: `test_control_plane_button_binding.js` — 8/8 PASS.
  * Full Security Hardening: `test_private_egress_security_hardening.js` — 20/20 PASS.
  * Local Archive Verification: `scratch/verify_local_rc3_13.js` — 13/13 PASS.
  * Hosted Download Verification: `scratch/verify_downloaded_rc3_13.js` — 15/15 PASS.

### Operating Guidelines & Invariants:
1. **Ultra Economy Production Tier**:
   - Ultra Economy (~$6/month, 1 vCPU / 1 GiB RAM) remains the locked production default.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
   - Owner daily use continues without disruption.
3. **Acceptance Invariant**:
   - Step B real cloud VPS creation remains strictly on **HOLD** pending ChatGPT Independent Audit of RC3.13 and Owner confirmation that DigitalOcean console has zero lingering droplets and zero firewalls.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `5860689a07a7dce899d578edaba29503fa11ef9f` (short: `5860689a`)
- Provenance/Packaging Head: `aa5aed2b48aa9221124d770c0c6cbf7906d48259` (short: `aa5aed2b`)
- Release Candidate Tag: `v6.9g.10.3-rc3.13.7.1.4.27`
- Hosted Release Asset: `XPIDER_R6.9G.10.3.7.1.4.27_PRIVATE_EGRESS_RC3.13.zip`
- Asset SHA-256: `fc85609f87a26ac6b917f2ed8e49e639c70296a78d2d8b31f8571433f8b6ed9e`
- Asset Byte Size: `45335937` bytes
