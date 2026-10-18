# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Defect Directives #6231022137 and #6244711545)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.21
- Authority Cursor: 6244711545
- Last Defect Directives: Owner Defect Directives #6231022137 (P0 UI Fix: Modal Stack & Z-Index) and #6244711545 (Defects Q1, Q2, Q3)
- Build ID: `R6.9G.10.3.7.1.4.16-20261017-PRIVATE-EGRESS-RC3.2`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.2.7.1.4.16`
- Functional Head Commit: `4919d0c4c8bf180fb967f8125f186350b3c5edf3` (short: `4919d0c4`)
- Provenance/Packaging Head Commit: `82d2d567a04720fa94b93a5be5ef9aedb95049e9` (short: `82d2d567`)
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **OWNER PRIVATE BETA DAILY USE OPEN (APPROVED — AUDIT GATE #6220825890)**.
- Release Status: **APPROVED FOR OWNER DAILY USE; PRIVATE EGRESS RC3.2 CLOSURE COMPLETE (TAG v6.9g.10.3-rc3.2.7.1.4.16); ALL DEFECTS Q1, Q2, Q3 & UI MODAL STACK DEFECT RESOLVED; REAL CLOUD VPS STEP B ON STRICT HOLD**.
- Defect Q1, Q2, Q3 & UI Fix Status:
  * **P0 UI Fix (Modal Stack & Z-Index)**: **PASS** (Settings overlay automatically closed before wizard open; explicit z-index hierarchy `#settings-overlay` 1000, `.modal-overlay` 1100, `#private-egress-modal-overlay` 1200 !important, `#privacy-block-modal-overlay` 1200 !important)
  * **Defect Q1 (/verify-plan Scoping Crash & Secret Redaction)**: **PASS** (Request variables safely scoped outside try block; zero ReferenceError crash; safe secret token redaction; deterministic HTTP status codes and error classifications: `TOKEN_INVALID` 401, `TOKEN_SCOPE_MISSING` 403, `MALFORMED_JSON` 400, `MISSING_API_TOKEN` 400, `PROVIDER_CATALOG_ERROR`, `PROVIDER_PRICE_UNAVAILABLE`, `COMPANION_VERSION_MISMATCH`)
  * **Defect Q2 (Authoritative Companion Auto-Upgrade & Port Conflict Handlers)**: **PASS** (`/health` advertises `companionBuildId`, `companionImplementationHead`, and `apiCapabilities`; graceful `/shutdown` endpoint implemented; `companion/ensure_companion_service.js` automatically probes, detects stale companions, terminates stale Node PIDs on Windows, launches bundled companion, and verifies capabilities before declaring setup complete; `XPIDER_AUTO_SETUP.bat` fails closed on upgrade failure; explicit `EADDRINUSE` listeners prevent silent hangs)
  * **Defect Q3 (Strict Provider Live Price Validation)**: **PASS** (Completely removed all hardcoded `$6` and `0.00893` fallbacks across `popup.js` and `private-egress-provisioner.js`; strictly requires finite positive numbers derived live from provider catalog; unavailable or non-positive price fails closed with `PROVIDER_PRICE_UNAVAILABLE`)
  * Defect P (Strict Supported LTS Allowlist): **PASS** (Explicit allowlist `[22, 24]` enforced across batch, relay, and native host)
  * Blocker N (Supported Node.js LTS Runtime): **PASS** (`runtime/node/node.exe` official Node.js v24.22.0 LTS Windows x64 binary)
  * Full Defect Q1, Q2, Q3 & UI Suite: `test/test_rc3_2_defects_q1_q2_q3_ui.js` — **33/33 (100%) PASS**.
  * Full Allowlist Suite: `test/test_runtime_lts_allowlist.js` — **6/6 (100%) PASS**.
  * Full Security Hardening Suite: `test/test_private_egress_security_hardening.js` — **20/20 (100%) PASS**.
  * Downloaded RC3.2 Asset Clean-Room Smoke Suite (Clean PATH, zero system Node/npm): `scratch/verify_downloaded_rc3_2.js` — **10/10 (100%) PASS**.

### Operating Guidelines & Invariants:
1. **Ultra Economy Production Tier**:
   - Ultra Economy (~$6/month, 1 vCPU / 1 GiB RAM) remains the locked production default.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
   - Owner daily use continues without disruption.
3. **Hold Invariant**:
   - Do NOT ask Owner to input DigitalOcean API token until Step A plan verification is confirmed working.
   - Zero real cloud VPS billable resources created; real cloud VPS provisioning (Step B) remains on strict HOLD.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Previous Functional Restore Point: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `4919d0c4c8bf180fb967f8125f186350b3c5edf3` (short: `4919d0c4`)
- Provenance/Packaging Head: `82d2d567a04720fa94b93a5be5ef9aedb95049e9` (short: `82d2d567`)
- Release Candidate Tag: `v6.9g.10.3-rc3.2.7.1.4.16`
- Release Candidate Asset: `XPIDER_R6.9G.10.3.7.1.4.16_PRIVATE_EGRESS_RC3.2.zip` (45,509,583 bytes, SHA-256: `f5e561c5c28a88c778deab12158d96958207f9d7f7aec1c0bc7d12028f14e764`)
- GitHub Release URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.2.7.1.4.16`
