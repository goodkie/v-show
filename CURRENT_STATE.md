# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to ChatGPT Directive #6260945430 & Owner Incident Report #6261136757)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-18.40
- Authority Cursor: 6261136757
- Last Directive / Audit: [CHATGPT AUDIT & GATE DECISION][RC3.14 APPROVED — RC3.15 UPGRADE/START DIRECTIVE] #6260945430 & Owner Report #6261136757
- Last Receipt: `[ANTIGRAVITY][RC3.15 UPGRADE-STATE-MIGRATION AND START/REPAIR RECOVERY CLOSURE RECEIPT]` #6263121277
- Build ID: `R6.9G.10.3.7.1.4.29-20261019-PRIVATE-EGRESS-RC3.15`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.15.7.1.4.29`
- Functional Head Commit: `b7cc5981370796dbaebf7e78f3818d682b4d0bdd` (short: `b7cc5981`)
- Provenance/Packaging Head Commit: `90bd40084ee955944a4132a0d17af0cc703df6d7` (short: `90bd4008`)
- Tag Target Commit SHA: `90bd40084ee955944a4132a0d17af0cc703df6d7`
- Rollback Anchor: `50aee3538806d7b5227fcd929e27979d1e5a3419`

## Current Gate
- Formal Gate: **RC3.15 LOCAL & REMOTE AUDIT PASS (AWAITING CHATGPT INDEPENDENT AUDIT)**.
- Incident Context & Root Cause (Comments #6260945430, #6261136757):
  * Owner unpacked RC3.14 (`.28`). Prior to Start/Repair, UI showed `PRIVACY RELAY COMPANION: UNAUTH`, `EGRESS NODES POOL: 0`.
  * Owner clicked `⚡ Start / Repair` once; companion badge flipped to `OFFLINE`.
  * **Root Causes**:
    1. **Stale Running Companion & Token Decoupling**: Companion running on port 18989 belonged to prior RC3.13 session. Its `.control_token` was in RC3.13 directory. Native host in RC3.14 checked `18989/health`, saw `verify-plan`, and returned `ALREADY_RUNNING` while `getControlToken()` returned `null` (since RC3.14 `.control_token` did not exist). Extension polled `/status` receiving HTTP 401 Unauthorized, and popup collapsed `HTTP_401` into generic `OFFLINE`.
    2. **Cross-Directory State Segregation**: Active egress nodes (`egress_pool_config.json` containing Droplet `159.203.28.198:8443` and DPAPI credentials) and transaction ownership (`.private_egress_transaction.json`) remained isolated in prior `XPIDER_..._RC3.13/companion/` folder.
- Core Closures (DD1 – DD5):
  * **DD1: Stale Running Companion Auto-Termination & Upgrade**:
    - Native Host `xpider_native_host.js` and `ensure_companion_service.js` strictly verify that any process on 18989 has `isCurrentBuild === true` AND local `.control_token` exists and is non-empty.
    - If stale build or token missing, terminates process and launches fresh bundled RC3.15 companion.
  * **DD2: Structured Error Reporting**:
    - Propagates explicit machine-readable failure reasons end-to-end (`HTTP_401_UNAUTHORIZED`, `STALE_COMPANION_BUILD_NOT_UPGRADED`, `NATIVE_HOST_NOT_REGISTERED`, `AUTH_TOKEN_MISSING`, `PORT_18989_REFUSED_OR_OFFLINE`).
    - Extension popup renders explicit status badges: `UNAUTH (401)`, `STALE BUILD`, `NO HOST`, `OFFLINE` instead of collapsing into generic OFFLINE.
  * **DD3: Automatic Cross-Package Egress State & Credential Migration**:
    - Implemented `companion/state-migrator.js`: auto-discovers active egress state from Windows Registry native host manifest path, sibling `XPIDER_*` folders, and `%LOCALAPPDATA%\XPIDER_Privacy_Relay`.
    - Migrates `egress_pool_config.json`, `.private_egress_transaction.json`, and `.control_token`.
    - Windows DPAPI credentials decrypt 100% cleanly across package folders under the same user session.
    - Integrated into `XPIDER_AUTO_SETUP.bat` Step [2.5/4], `ensure_companion_service.js`, `privacy-relay-service.js`, and `private-egress-provisioner.js`.
  * **DD4: Owner-Visible Diagnostics Box**:
    - Added `#priv-relay-diagnostics-box` and `🔍 Diag` toggle in `extension/popup.html`.
    - Displays: Native Host binary path, Companion build version, Port 18989 health, Control Token status, Egress Pool node count, and exact Status/Fault reason.
    - Clicking `⚡ Start / Repair` automatically refreshes diagnostics and unhides the diagnostics box.
  * **DD5: Regression Verification Suite**:
    - `test/test_rc3_15_upgrade_migration_and_start_repair_dd1_dd5.js`: 5/5 tests passed (100%).
    - Verified: state migration fidelity, stale build rejection, companion startup with migrated node and continuous health refresh, diagnostics contract, and zero cloud VPS mutations.
- Retained Guarantees:
  * **CC1 - CC3**: Continuous health refresh loop (`startContinuousHealthMonitor`), `<= TTL/3` proactive cadence, dynamic live status UI reflection (`test_rc3_14_health_ttl_continuous_refresh_cc1_cc3.js` — 7/7 PASS).
  * **BB1 - BB8**: Proxy bypass list ordering, readback verification, live control plane 502 interception detection (`test_rc3_13_layer2_preflight_and_control_bypass.js` — 8/8 PASS).
  * **AA1 - AA3**: Unified verified contract across /select, /probe, /rotate (`test_rc3_12_select_verification_contract_aa1_aa3.js` — 9/9 PASS).
  * **Z1 - Z5**: Pinned private CA registration, certificate validation, peer SPKI fingerprint pinning (`test_rc3_11_pinned_proxy_ca_registration_z1_z5.js` — 12/12 PASS).
  * Local Archive Verification: `scratch/verify_local_rc3_15.js` — 8/8 PASS.
  * Hosted Download Verification: `scratch/verify_downloaded_rc3_15.js` — 11/11 PASS.

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
- Functional Head: `b7cc5981370796dbaebf7e78f3818d682b4d0bdd` (short: `b7cc5981`)
- Provenance/Packaging Head: `90bd40084ee955944a4132a0d17af0cc703df6d7` (short: `90bd4008`)
- Release Candidate Tag: `v6.9g.10.3-rc3.15.7.1.4.29`
- Hosted Release Asset: `XPIDER_R6.9G.10.3.7.1.4.29_PRIVATE_EGRESS_RC3.15.zip`
- Asset SHA-256: `acab018b863a420792dcbea1b71b7cab7429460bf0787d9d0766723487d64776`
- Asset Byte Size: `45345673` bytes
- Extracted Deployment Directory: `E:\vivpr\ai\extension-form-sender\XPIDER_R6.9G.10.3.7.1.4.29_PRIVATE_EGRESS_RC3.15`
