# XPIDER AutoForm Sender Pro — Release Notes
## Version: `v6.9g.10.3-audit.6.2.1`
### Directive: `R6.9G.10.3.6.2.1 EXACT-RELEASE COMPANION LIFECYCLE + ROTATION READY + STICKY RESTART RESTORE`

---

### 1. Authority, Lineage & Cryptographic Integrity

- **Authority Source**: `goodkie/v-show` Issue #6 (Directive Comment #6097508789)
- **Active Branch**: `upgrade/phase-0-1`
- **Functional Commit**: `47ee3ba29f055f86a889bac11ecad82db1558725`
- **Provenance Commit**: `5fad5c3f980fce303b2e7d8ecc4232fb4d21e91b`
- **Rollback Base**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `32e384d1f7ac0292308011f60bd6c1ef2bb86654`
- **Build ID**: `R6.9G.10.3.6.2.1-20261010-EXACT-RELEASE-COMPANION-LIFECYCLE`
- **Release Archive**: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
- **Archive Size**: `4,352,177 bytes`
- **Archive SHA-256**: `6bff4a9ebd540bf1d8ea8874f9a53b3f3d69bce305d74247af1d8b69320482fa`

---

### 2. Remediated Blockers & Engineering Enhancements

1. **Blocker 1 — Exact-Release Companion Lifecycle Isolation**:
   - The Companion Relay service is verified and executed strictly from the extracted release archive (`<tempExtractDir>/companion/install_companion.bat`).
   - Native Messaging Host registration points directly to `<tempExtractDir>/companion/native_host/xpider_native_host.bat`.
   - Verified clean automated uninstallation and registry unregistration via `<tempExtractDir>/companion/uninstall_companion.bat --silent`.

2. **Blocker 2 — Genuine OFFLINE Start/Repair Verification**:
   - Verified that when Companion is killed and port 18989 is dead, the popup truthfully renders `OFFLINE`, active node `—`, fingerprint `Offline`, and rotation disabled.
   - Clicking `Start / Repair` dispatches Native Messaging `START`, starts the detached companion process, polls boundedly, and transitions popup status badge to `ONLINE / NO NODES`.
   - Missing Native Messaging Host returns explicit `NO HOST` / actionable error immediately without 8-second polling freeze.

3. **Blocker 3 — Rotation Authoritative Status Fix**:
   - Fixed `popup.js` rotation handler to invoke authoritative `refreshRelayStatus()` and `refreshRelayNodes()`.
   - Prevents premature fall-through to `ONLINE / UNVERIFIED`.
   - Verified in real Edge browser that rotation ends in `ONLINE / READY` badge with `relayReady === true` and `health === 'HEALTHY'`.

4. **Blocker 4 — Sticky Active Node Restoration Across Restart**:
   - `selectedEgressId` is persisted in `egress_pool_config.json`.
   - On Companion restart, active node index resolves to `selectedEgressId`, resets health to UNKNOWN, re-probes candidate, and sets `relayReady = true` upon verification pass.
   - Preserves fail-closed semantics for `FIXED` and `MANUAL` modes without silent switching.
   - Verified multi-node selection of Node 2 under `FIXED` mode survives Companion process restart and Edge reload.

5. **Blocker 5 — 40-Character Commit SHA Integrity**:
   - All references across release documentation, receipts, and state capsules use full 40-character commit hashes from `git rev-parse HEAD`.

---

### 3. Verification Evidence

- Real Microsoft Edge operator audit: `run_real_r6_9g10_3_6_2_1_edge_operator_audit.js`
- Evidence log: `evidence_r6_9g10_3_6_2_1_real_runtime_traces.log` (88 lines, 100% PASS)
- Target release tag: `v6.9g.10.3-audit.6.2.1` targeting Provenance commit `5fad5c3f980fce303b2e7d8ecc4232fb4d21e91b`.
