# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to ChatGPT Directives #6256256038, #6256565851 and Owner RC3.10 Acceptance Evidence)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.32
- Authority Cursor: 6256565851
- Last Directive / Audit: [CHATGPT][RC3.10 STEP B DEFECT AUDIT & RC3.11 PINNED-PROXY-CA DIRECTIVE] #6256256038 / #6256565851
- Last Receipt: Receipt #6256100756 (https://github.com/goodkie/v-show/issues/6#issuecomment-6256100756 — `[ANTIGRAVITY][SIDE-PANEL CLICKABILITY P0 CLOSURE RECEIPT][RC3.10 DELIVERED]`)
- Current Target Receipt: `[ANTIGRAVITY][RC3.11 PINNED-PROXY-CA REGISTRATION CLOSURE RECEIPT]`
- Build ID: `R6.9G.10.3.7.1.4.25-20261018-PRIVATE-EGRESS-RC3.11`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.11.7.1.4.25`
- Functional Head Commit: `a9b028ca7a9b89035b27886945f48182dcde899e` (short: `a9b028ca`)
- Provenance/Packaging Head Commit: `cdfa049639d1d1453f99cba3295641241524291b` (short: `cdfa0496`)
- Tag Object SHA: `bde5eaff79a15fd5cf27b4f11d1ab02ba9343ef9`
- Tag Target Commit SHA: `cdfa049639d1d1453f99cba3295641241524291b`
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **RC3.11 PINNED PRIVATE-PROXY CA REGISTRATION & SPKI RESILIENCE DELIVERED — STEP B ON HOLD PENDING OWNER CLOUD-CLEANUP VERIFICATION & RETRY AUTHORIZATION**.
- Defect Root Cause & Code Remedy:
  1. **Owner RC3.10 Live Run Finding**: UI side-panel clickability was 100% operational; plan & price selection succeeded; VPS connect completed. Provisioning halted at step 2/8 (Server Prep -> Egress canary verification) with: `Provisioning failed: Egress canary verification failed: UPSTREAM_TLS_CONNECT_ERROR: unable to verify the first certificate; if the root CA is installed locally, try running Node.js with --use-system-ca`.
  2. **Codebase Root Cause Traced & Remediated**:
     - `POST /add-node` in `companion/privacy-relay-service.js` reconstructed `newNode` by explicitly enumerating fields, but completely omitted `ca`, `tlsCaFingerprint`, `tlsSpkiFingerprint`, and `expectedEgressIp`.
     - When `verifyNodeEgress()` executed Layer A TLS connect, `node.ca` was `undefined`. Node.js fell back to the system/public CA store and rejected the XPIDER private proxy certificate.
     - Per ChatGPT directive, system CA fallback (`--use-system-ca`) was strictly refused. Private cloud proxies must authenticate only against the XPIDER private CA.
  3. **Z1 - Z5 Private-Proxy CA Registration Delivered**:
     * **Z1 (Preserve & Cryptographically Validate Private TLS Trust Fields)**: **PASS** (`POST /add-node` validates `ca` with `new crypto.X509Certificate(caPem)`, checks validity window, checks CA fingerprint, preserves `tlsSpkiFingerprint` and `expectedEgressIp`, and exposes them on `GET /nodes`)
     * **Z2 (Refuse System/Public CA Fallback for Private HTTPS_PROXY)**: **PASS** (`verifyNodeEgress()` and live proxy CONNECT handling fail closed with `MISSING_PINNED_PROXY_CA` if private node lacks pinned CA)
     * **Z3 (Server Certificate SPKI Fingerprint Pinning)**: **PASS** (Extracts peer SPKI DER and verifies SHA-256 fingerprint against `node.tlsSpkiFingerprint` on Layer A canary connect and live proxying with `PEER_SPKI_PIN_MISMATCH`)
     * **Z4 (Expected Egress IP Verification)**: **PASS** (Canary probe validates observed IP matches `node.expectedEgressIp` with `EGRESS_IP_MISMATCH`)
     * **Z5 (Dedicated Test Suite & Zero Cloud Mutation)**: `test/test_rc3_11_pinned_proxy_ca_registration_z1_z5.js` — **12/12 (100%) PASS**; zero billable cloud VPS resources created.
- Retained Side-Panel Clickability Guarantees (Y1 - Y5):
  * **Y1 (Click-Interception Diagnostic Probe)**: **PASS** (`checkClickInterceptionDiagnostic` probes top controls via `elementsFromPoint` and displays banner if intercepted)
  * **Y2 (Stale Dynamic Modal Sanitization)**: **PASS** (Purges orphaned dynamic modals on `DOMContentLoaded`)
  * **Y3 (Static Overlay Triple Fail-Safe)**: **PASS** (`pointer-events: none !important; display: none !important;` for `.hidden`)
  * **Y4 (Isolated Event Binding Resilience)**: **PASS** (Discrete `try/catch` per group with `dataset.bound` guards)
  * **Y5 (Dedicated Regression Suite)**: `test/test_rc3_10_side_panel_clickability_y1_y5.js` — **7/7 (100%) PASS**.
- Retained Private Egress Guarantees (X1 - X6):
  * **X1 (Canary TLS Layer Separation)**: **PASS** (Layer A pinned to `proxyTlsCa = node.ca`; Layer B validates public canary target using default WebPKI roots with `rejectUnauthorized: true`)
  * **X2 (Bounded Eventual Deletion Polling)**: **PASS** (`waitForExactResourceAbsence` polling exact GET until 404 with bounded timeout and backoff)
  * **X3 (Exact Recovery UX)**: **PASS** (Exact-ID only journaled recovery; no broad prefix/tag deletion)
  * **X4 (Idempotent 404-as-Absent Teardown)**: **PASS** (`deleteExactResource` treats 404 as `ALREADY_ABSENT` clean success)
  * **X5 (Structured Destroy Error Propagation)**: **PASS** (Preserves `{ status, errors, verifications, reason }` end-to-end; zero HTTP 500 collapse)
  * **X6 (Provider State Reconciliation Before Cleanup)**: **PASS** (Reconciles provider state first; marks clean if already 404; clears journal only on absence)
  * Dedicated RC3.9 X1 - X6 Suite: `test/test_rc3_9_canary_tls_and_eventual_delete_x1_x6.js` — **7/7 (100%) PASS**.
  * Control Plane Button Binding Suite: `test/test_control_plane_button_binding.js` — **8/8 (100%) PASS**.
  * Full Security Hardening Suite: `test/test_private_egress_security_hardening.js` — **20/20 (100%) PASS**.
  * Local Archive Smoke Suite: `scratch/verify_local_rc3_11.js` — **16/16 (100%) PASS**.
  * Hosted GitHub Download Smoke Suite: `scratch/verify_downloaded_rc3_11.js` — **16/16 (100%) PASS**.

### Operating Guidelines & Invariants:
1. **Ultra Economy Production Tier**:
   - Ultra Economy (~$6/month, 1 vCPU / 1 GiB RAM) remains the locked production default.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
   - Owner daily use continues without disruption.
3. **Acceptance Invariant**:
   - Step B real cloud VPS creation remains strictly on **HOLD** pending Owner explicit authorization after verifying zero lingering cloud resources in DigitalOcean console and confirming the RC3.11 candidate build badge (`OWNER BETA R6.9G.10.3.7.1.4.25`) is visibly loaded in the browser.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `a9b028ca7a9b89035b27886945f48182dcde899e` (short: `a9b028ca`)
- Provenance/Packaging Head: `cdfa049639d1d1453f99cba3295641241524291b` (short: `cdfa0496`)
- Release Candidate Tag: `v6.9g.10.3-rc3.11.7.1.4.25`
- Hosted Release Asset: `XPIDER_R6.9G.10.3.7.1.4.25_PRIVATE_EGRESS_RC3.11.zip`
- Asset SHA-256: `98c915b2459ca1cc98da5e6089bd136a24585eb8b431bfbfaa1bc26364dc1f12`
- Asset Byte Size: `45333967` bytes
