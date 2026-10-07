# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Directives #6048197776, #6048208784 [R6.9G.10] by ChatGPT)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-07.23

## Current Gate
- Formal Gate: R6.9G.10 PRIVACY RELAY — OWNED EGRESS POOL + SAFE ROTATION + ZERO-MANUAL-LAUNCH UX -> VERIFIED PASS -> RECEIPT POSTED.
- Status: AUDIT READY (Autonomous execution complete under OCA-DEV-1.4).
- Real Browser Verification: ALL 7 GATES (A through G) PASSED in Microsoft Edge (`run_real_r6_9g10_edge_operator_audit.js`).
- Owner Diagnostic Test: PREPARED & EXPORTED (Test-only package: `XPIDER_R6.9G.10_OWNER_DIAGNOSTIC_TEST_ONLY.zip`, SHA256: `1f5ee8f2bde3af5849f3265540ad714696633c0ca4edb0ca2ce352fe92997c9e`).
- Bulk Campaign: HOLD.
- Rollback Anchor: `dc0740a0c69e2f7fa96b6989841acf0831b3619e` (immutable, verified untouched).
- Next Action: Post R6.9G.10 Receipt to Issue #6, await ChatGPT Gate decision.

## R6.9G.10 Architecture & Real Browser Audit Results
1. **Companion Control Plane & Silent Runner [Gate A: PASS]**:
   - Loopback Control API listening on `127.0.0.1:18989` (`/health`, `/status`, `/rotate`, `/select`, `/mode`, `/pause`, `/resume`, `/stop`).
   - Zero-Manual-Launch runner via Windows VBScript (`start_relay_silent.vbs`) and startup script (`install_autostart.js`).
   - Health and pool status verified in Node and Edge runtime.
2. **Native Messaging Host Protocol [Gate B: PASS]**:
   - Implemented native messaging host (`xpider_native_host.js` + `.bat`) using Chrome/Edge 4-byte native stdio protocol.
   - Registry installers for HKCU registered for Chrome and Edge.
   - PING/PONG and control commands verified.
3. **Owned Egress Pool & Fixed Egress Routing [Gate C: PASS]**:
   - Multi-node egress pool configuration (`egress_pool_config.json`).
   - Browser routes via `127.0.0.1:18988` to active Egress Node 1 (`127.0.0.1:18991`).
   - Target received traffic exclusively through Node 1; zero direct leak verified.
4. **Safe Rotation Modes [Gate D: PASS]**:
   - **Manual Rotation (D.1)**: Explicit rotate switched from Node 1 to Node 2 (`127.0.0.1:18992`) with fingerprint change (`22c3f50f88c07389` -> `1dd09635ce0898f1`). Traffic confirmed through Node 2.
   - **Campaign-Boundary Rotation (D.2)**: Configured `CAMPAIGN_BOUNDARY` mode; rotated at campaign start boundary from Node 2 to Node 3 (`127.0.0.1:18993`) with fingerprint change (`14917b3df1ca7234`). Traffic confirmed through Node 3.
   - **Sticky Identity (D.3)**: Egress continuity verified sticky across mid-target requests.
5. **Fail-Closed on Relay Drop / Pause [Gate E: PASS]**:
   - Pausing relay returns HTTP 502 Bad Gateway.
   - Preflight reports `ready = false` and `failureReason = PRIVACY_RELAY_OFFLINE`.
   - Proxy fetch failed with HTTP 502; zero direct fallback request.
6. **Secret Redaction & Log Invariant [Gate F: PASS]**:
   - Passwords and auth tokens strictly redacted (`[REDACTED_SECRET]`, `[REDACTED_TOKEN]`).
   - Egress fingerprints stored and reported as truncated SHA-256 hashes (`sha256:...`).
7. **Popup UI Integration & Limitations Copy [Gate G: PASS]**:
   - Added Mode D (`PRIVACY_RELAY`) in transport dropdown.
   - Live companion status card shows Daemon Online, Node ID, Fingerprint, with manual rotate and repair buttons.
   - Section 12 disclaimer copy present in DOM: *"Changing egress IPs can reduce long-lived network linkability, but it does not make the browser anonymous by itself..."*
   - Provenance badge verified: `TEST-ONLY R6.9G.10 [365bad68]`.

## Build Provenance
- Build ID: `R6.9G.10-20261007-PRIVACY-RELAY-SAFE-ROTATION`
- Implementation HEAD: `365bad6817e73166ea8779c9df7f387c28fe9330`
- Visible UI Badge: `TEST-ONLY R6.9G.10 [365bad68]`
- Package SHA-256: `1f5ee8f2bde3af5849f3265540ad714696633c0ca4edb0ca2ce352fe92997c9e`
- Package Bytes: 4,301,586
- Evidence Log: `evidence_r6_9g10_real_runtime_traces.log` (SHA256: `7ba9f82e09306d7576024a7e7fa313a24e5b1c7277654f8c07bca2a42d0ece19`)
