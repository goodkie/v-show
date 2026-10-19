# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Owner Incident Report #6260180536)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.39
- Authority Cursor: 6260180536
- Last Directive / Audit: [OWNER REAL ACCEPTANCE][RC3.13][POST-SUCCESS BROWSING FAIL — HEALTH TTL EXPIRES WITHOUT REFRESH] #6260180536
- Last Receipt: `[ANTIGRAVITY][RC3.14 HEALTH-TTL-REFRESH-AND-LIVE-STATUS CLOSURE RECEIPT]` #6260763593
- Build ID: `R6.9G.10.3.7.1.4.28-20261019-PRIVATE-EGRESS-RC3.14`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.14.7.1.4.28`
- Functional Head Commit: `0e0d6522c3f9093a1ae90eb36cca40f2cf4cf8e1` (short: `0e0d6522`)
- Provenance/Packaging Head Commit: `ab22767a2fa145bce253f32ae8372e1cccec0c53` (short: `ab22767a`)
- Tag Object SHA: `3f71ddfef31d27ebe2ac8ae4c8920a0cbd9c9b82`
- Tag Target Commit SHA: `ab22767a2fa145bce253f32ae8372e1cccec0c53`
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **RC3.14 LOCAL & REMOTE AUDIT PASS (AWAITING CHATGPT INDEPENDENT AUDIT)**.
- Incident Context & Root Cause:
  * Owner Step B real run succeeded (8/8 stages PASSED, IP `159.203.28.198` deployed in NYC3, Ultra Economy ~$6/mo).
  * Runtime browsing failure occurred several minutes later: Chrome reported `ERR_TUNNEL_CONNECTION_FAILED`, while static Wizard UI remained frozen on `8/8 STRICT PRIVACY READY — 100%`.
  * **Root Cause**: `companion/privacy-relay-service.js` enforced 60s health TTL (`Date.now() - node.lastVerifiedAt <= 60000`), but lacked any recurring background health refresh scheduler. Exactly 60s after provisioning, the active node health expired, causing both HTTP and HTTPS CONNECT forwarding to fail-close with HTTP 502 (`HEALTH_TTL_EXPIRED_CONNECT`), destroying the client socket.
- Core Closures (CC1 – CC3):
  * **CC1: Continuous Health Refresh**:
    - Implemented `startContinuousHealthMonitor()`, `stopContinuousHealthMonitor()`, `refreshActiveNodeHealth()`, and `getHealthRefreshIntervalMs()`.
    - Proactive refresh cadence bounded to `<= TTL / 3` (20s for 60s TTL, minimum 100ms, maximum 20000ms).
    - Single-flight concurrency guard (`this.isRefreshingHealth`) eliminates probe stampedes.
    - Successful canary probe refreshes `node.lastVerifiedAt = Date.now()` and maintains `relayReady = true`.
    - Upstream probe failure immediately revokes `relayReady = false`, marks node `UNREACHABLE`, increments `failClosedDrops`, and attempts bounded failover; strictly ZERO silent fallback to DIRECT.
    - Lifecycle integrated into `start()`, `selectEgress()`, `rotateEgress()`, `POST /resume`, `stop()`, and `POST /pause`.
    - Preserved `canaryUrl` property in `newNode` during `/add-node` endpoint handling.
    - `getStatus()` exposes dynamic health metrics: `healthAgeMs`, `healthRefreshIntervalMs`, `isHealthValid`, `isExpired`, and `lastVerifiedAt`.
  * **CC2: Dynamic Live Status UI Reflection**:
    - In `extension/popup.html`, added `#wizard-live-status-container` (live status badge, health age text, operational details) and `#wizard-active-live-indicator`.
    - In `extension/popup.js`, implemented `updateLiveRelayStatusUi()`, `pollLiveRelayStatus()`, and `startLiveRelayPolling()` polling `/status` every 5 seconds.
    - If health expires or relay degrades, operational banner dynamically displays `⚠️ OPERATIONAL: NOT READY / DEGRADED (HEALTH_TTL_EXPIRED)` and `8/8 PROVISIONED — ⚠️ LIVE STATUS: DEGRADED`, accurately separating historical 8/8 provisioning receipt from live operational degradation.
  * **CC3: Regression Verification Suite**:
    - `test/test_rc3_14_health_ttl_continuous_refresh_cc1_cc3.js`: 7/7 tests passed (100%).
    - Proves sustained browsing across >2.7x TTL, immediate fail-close on upstream outage with zero DIRECT fallback, single-flight probe serialization, clean teardown, and zero cloud VPS mutations.
- Retained Guarantees:
  * **RC3.13 Layer-2 Preflight & Control Plane Bypass**: Loopback ordering, live 502 self-interception probe, teardown proxy clearing, recovery-status auto-healing.
  * **AA1 - AA3**: Unified verified contract across /select, /select/:id, /probe, /rotate (`test_rc3_12_select_verification_contract_aa1_aa3.js` — 9/9 PASS).
  * **Z1 - Z5**: Pinned private CA registration, certificate validation, fail-closed missing CA, peer SPKI fingerprint pinning, expected egress IP verification (`test_rc3_11_pinned_proxy_ca_registration_z1_z5.js` — 12/12 PASS).
  * **Y1 - Y5**: Side-panel clickability resilience, static overlay triple fail-safe, click interception diagnostics (`test_rc3_10_side_panel_clickability_y1_y5.js` — 7/7 PASS).
  * **X1 - X6**: Two-layer TLS separation, eventual consistency bounded deletion, structured error propagation (`test_rc3_9_canary_tls_and_eventual_delete_x1_x6.js` — 7/7 PASS).
  * Control Plane Button Binding: `test_control_plane_button_binding.js` — 8/8 PASS.
  * Full Security Hardening: `test_private_egress_security_hardening.js` — 20/20 PASS.
  * Local Archive Verification: `scratch/verify_local_rc3_14.js` — 8/8 PASS.
  * Hosted Download Verification: `scratch/verify_downloaded_rc3_14.js` — 11/11 PASS.

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned by Owner in RC3.13 remains active and untouched.
   - Owner does NOT need to run Step B or incur any new cloud expense.
2. **Approved Build Preservation**:
   - Approved package `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` on functional commit `50aee353` remains immutable.
3. **Fail-Closed Invariant**:
   - Strict fail-closed proxy operation: unverified or expired nodes reject all traffic (HTTP 502) and NEVER fall back to DIRECT.

## Lineage & Verification Anchors
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`
- Functional Head: `0e0d6522c3f9093a1ae90eb36cca40f2cf4cf8e1` (short: `0e0d6522`)
- Provenance/Packaging Head: `ab22767a2fa145bce253f32ae8372e1cccec0c53` (short: `ab22767a`)
- Release Candidate Tag: `v6.9g.10.3-rc3.14.7.1.4.28`
- Hosted Release Asset: `XPIDER_R6.9G.10.3.7.1.4.28_PRIVATE_EGRESS_RC3.14.zip`
- Asset SHA-256: `9017d78aabf8031f189d50aa8440d505636cce98671a7c0c23a2ae1814c2b0dc`
- Asset Byte Size: `45338417` bytes
- Extracted Deployment Directory: `E:\vivpr\ai\extension-form-sender\XPIDER_R6.9G.10.3.7.1.4.28_PRIVATE_EGRESS_RC3.14`

