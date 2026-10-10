# XPIDER AutoForm Sender Pro — R6.9G.10.3.6.1 Single-Authority Privacy Prep + True START_ACK Acceptance Package

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive #6066792224)
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `65c3fd81087216b71e825fd6641c2404016b9e61` (`65c3fd81`)
- **Provenance HEAD**: `5e725a1231a90cf63f6ae325e7523f2db611d836` (`5e725a12`)
- **Build ID**: `R6.9G.10.3.6.1-20261010-SINGLE-AUTHORITY-PRIVACY-PREP`
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `b970eb5e695020e91ee9f376930e3f6233013cff` (`b970eb5e`)
- **Release Tag Lineage**: Directly bound to commit `5e725a12` on `upgrade/phase-0-1`.

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,350,456 bytes
   - SHA-256: `e9f9e9bdfc55839621f0d4430461c9b48df9c7da0fb088a1f97c6e8934e4b5b7`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build
     - `companion/`: Windows Privacy Relay companion service (`install_companion.bat`, `uninstall_companion.bat`, etc.)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_6_1_real_runtime_traces.log`
   - Size: 39,150 bytes
   - SHA-256: `b38a1e370da552f232aa8440e7c255ac0e769d9b46ee10e7c64265c0a34cc990`

### Operator Audit Verification (Gates 1 - 7: 100% PASS in Real Microsoft Edge)
- **Blocker 1**: Cryptographic verification of exact release ZIP bytes (`4,350,456` bytes, SHA-256: `e9f9e9bdfc55839621f0d4430461c9b48df9c7da0fb088a1f97c6e8934e4b5b7`) extracted to fresh temp dir; Edge launched ONLY with extracted extension — **PASS**
- **Gate 1**: Build Provenance & Module Parity in Real Edge Background Worker (`R6.9G.10.3.6.1-20261010-SINGLE-AUTHORITY-PRIVACY-PREP`, `65c3fd81`) — **PASS**
- **Gate 2**: Truthful Restore State & Inverted Log Remediation (`isGateReady=false`, `isGateActive=false`) — **PASS**
- **Gate 3**: Real Edge Scenario C: Zero nodes fail-closed UX (`NO_HEALTHY_EGRESS`, actionSection `privacy-relay-add-form`, human-readable guidance, zero raw enums) — **PASS**
- **Gate 4**: Real Edge Scenario D: Managed Proxy Auto-Recovery (`HTTPS_PROXY` auto-switch, chrome.proxy readback verified, canary PASS) — **PASS**
- **Gate 5**: Real Edge Scenario A: Owner exact scenario (`SYSTEM_VPN` legacy self-heals to `PRIVACY_RELAY`, companion relay active, chrome.proxy readback 127.0.0.1:18988, canary PASS, storedMode updated) — **PASS**
- **Gate 6**: Deterministic 1-Click START Flow with Single-Authority Background Privacy Prep:
  - Exact ordered evidence verified in real Edge:
    `[START_UI] -> [PRIVACY_START_PREP] -> [PRIVACY_AUTO_RECOVERY] -> [PRIVACY_TRANSPORT_APPLIED] -> [PRIVACY_CANARY] PASS -> [PRIVACY_START_READY] -> [START_IPC] -> [START_BG] -> [START_BG_READY] -> [START_ACK]`
  - Hard assert ALL signals observed with AND logic — **PASS**
  - Popup remains open until START_ACK — **PASS**
  - `campaignActive === true` asserted in popup — **PASS**
  - Zero duplicate privacy prep in background (`swPrepCount === 1`) — **PASS**
  - Popup does not mutate transport locally (`popupPrepCount === 0`) — **PASS**
- **Gate 7**: Clean-up and Zero Direct Fallback Invariant — **PASS**

### Operational Invariants
- Background is sole authoritative privacy-prep state owner; popup orchestrates UI only.
- Strict fail-closed privacy is strictly preserved (`failClosed` is never disabled automatically).
- Direct internet fallback is strictly blocked.
- Fixed egress mode is utilized for Owner smoke testing.
- Bulk campaign remains strictly on **HOLD**.
