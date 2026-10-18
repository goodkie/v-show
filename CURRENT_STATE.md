# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Owner Real Acceptance Comment #6253598514)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.28
- Authority Cursor: 6253598514
- Last Directive / Audit: Owner Real Acceptance Comment #6253598514 (`[OWNER REAL ACCEPTANCE][RC3.7][STEP B FIREWALL API SCHEMA FAILURE — PORTS='all' INVALID][NO DROPLET CREATED]`)
- Last Receipt: Receipt #6251024133 (https://github.com/goodkie/v-show/issues/6#issuecomment-6251024133 — `[ANTIGRAVITY][RC3.7 PACKAGE-SECRET HYGIENE + TOKEN-ROTATION CLOSURE RECEIPT]`)
- Current Target Receipt: `[ANTIGRAVITY][RC3.8 DIGITALOCEAN FIREWALL PORT-SCHEMA CLOSURE RECEIPT]`
- Build ID: `R6.9G.10.3.7.1.4.22-20261018-PRIVATE-EGRESS-RC3.8`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.8.7.1.4.22`
- Functional Head Commit: `6491dd93b7fe8eb848b7f5591675aa1e7a203a80` (short: `6491dd93`)
- Provenance/Packaging Head Commit: `16d4c7dcae794c641c381c5be7969a0b9e24db24` (short: `16d4c7dc`)
- Tag Object SHA: `3d197312501c0393e4ef9f2c33013d7461ba5a76`
- Tag Target Commit SHA: `16d4c7dcae794c641c381c5be7969a0b9e24db24`
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **RC3.8 CANDIDATE RELEASED — DIGITALOCEAN FIREWALL PORT-SCHEMA CONTRACT CLOSURE (W1 - W3)**.
- Release Status: **RC3.8 PUBLISHED ON GITHUB; ALL W1 - W3 CLOSURES VERIFIED (100% SUITE PASS + CLEAN HOSTED ASSET DOWNLOAD); REAL STEP B AUTHORIZED UNDER SINGLE-RUN ACCEPTANCE PROTOCOL ON RC3.8 ONLY; PRODUCTION CAMPAIGN/TARGET-PUMP ON HOLD UNTIL SINGLE REAL ACCEPTANCE RUN COMPLETES**.
- DigitalOcean Port-Schema & Parity Hardening Status:
  * **W1 (Port Schema Fix)**: **PASS** (Replaced literal `ports: 'all'` with `ports: '0'` across TCP, UDP, and ICMP protocols; centralized into shared constant `DIGITALOCEAN_FIREWALL_DEFAULT_OUTBOUND_RULES` and helper `getDigitalOceanDefaultOutboundRules()`)
  * **W2 (Provider Contract Verification)**: **PASS** (Strict API-shaped validator `validateDigitalOceanFirewallRule` / `validateDigitalOceanFirewallPayload` enforced; all 3 mutation paths verified: initial POST, pre-billable `firewall:update` PUT, and final proxy PUT)
  * **W3 (Provider 422 Rollback Regression)**: **PASS** (Live-style 422 error triggers bounded rollback: deletes SSH key and transaction tag, zero Droplet calls, leaves journal clean)
  * **Non-Blocking Parity Hardening**: **PASS** (`isCompatibleExtensionBuild` checking build prefix; wizard side-by-side build status indicator in extension popup)
  * Dedicated RC3.8 W1 - W3 Suite: `test/test_rc3_8_firewall_port_schema_w1_w3.js` — **7/7 (100%) PASS**.
  * Dedicated V1 - V5 Hygiene & Rotation Suite: `test/test_rc3_7_package_secret_hygiene_v1_v5.js` — **6/6 (100%) PASS**.
  * Dedicated U1 - U3 Recovery Gate Suite: `test/test_rc3_6_recovery_gate_u1_u3.js` — **7/7 (100%) PASS**.
  * RC3.5 T1 - T7 Security Suite: `test/test_rc3_5_step_b_security_t1_t7.js` — **7/7 (100%) PASS**.
  * RC3.4 S1 - S6 Security Suite: `test/test_rc3_4_step_b_security_s1_s6.js` — **6/6 (100%) PASS**.
  * RC3.3 R1 - R6 Security Suite: `test/test_rc3_3_step_b_security_r1_r6.js` — **6/6 (100%) PASS**.
  * Full Security Hardening Suite: `test/test_private_egress_security_hardening.js` — **20/20 (100%) PASS**.
  * Full Defect Q1, Q2, Q3 & UI Suite: `test/test_rc3_2_defects_q1_q2_q3_ui.js` — **33/33 (100%) PASS**.
  * Full Allowlist Suite: `test/test_runtime_lts_allowlist.js` — **6/6 (100%) PASS**.
  * Local Asset Clean-Room Smoke Suite: `scratch/verify_local_rc3_8.js` — **PASS (100%)**.
  * GitHub-Downloaded RC3.8 Asset Smoke Suite: `scratch/verify_downloaded_rc3_8.js` — **PASS (100%)**.

### Operating Guidelines & Invariants:
1. **Ultra Economy Production Tier**:
   - Ultra Economy (~$6/month, 1 vCPU / 1 GiB RAM) remains the locked production default.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
   - Owner daily use continues without disruption.
3. **Acceptance Invariant**:
   - Step B real cloud VPS creation executes strictly on RC3.8 candidate. RC3.7 must NOT be retried.
   - Zero billable resources remain on cloud account prior to acceptance.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Previous Functional Restore Point: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `6491dd93b7fe8eb848b7f5591675aa1e7a203a80` (short: `6491dd93`)
- Provenance/Packaging Head: `16d4c7dcae794c641c381c5be7969a0b9e24db24` (short: `16d4c7dc`)
- Release Candidate Tag: `v6.9g.10.3-rc3.8.7.1.4.22`
- Release Candidate Asset: `XPIDER_R6.9G.10.3.7.1.4.22_PRIVATE_EGRESS_RC3.8.zip` (45,326,546 bytes, SHA-256: `c92d2a577100c55e5c05e566d6caba7c19e0a0e543c87111ec34d279009de629`)
- GitHub Release URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.8.7.1.4.22`
