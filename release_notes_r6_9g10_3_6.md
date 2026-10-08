# XPIDER AutoForm Sender Pro — R6.9G.10.3.6 Auto-Enforced Privacy Start Prep + Legacy VPN Self-Heal Acceptance Package

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive #6066074779)
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `b970eb5e695020e91ee9f376930e3f6233013cff` (`b970eb5e`)
- **Provenance HEAD**: `6aeb81e5fa79e83b5b2a49dc8c818416467c3bac` (`6aeb81e5`)
- **Build ID**: `R6.9G.10.3.6-20261008-AUTO-ENFORCED-PRIVACY-START-PREP`
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `b8d1fab8190bb991c69d67c44a3ab1c1a5b766dd`
- **Release Tag Lineage**: Directly bound to commit `6aeb81e5` on `upgrade/phase-0-1`.

### Release Package Assets & Verification Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,350,121 bytes
   - SHA-256: `a49a243409366e3944146598bd86c43514e318e24937ad61465d8920a0577824`
   - Contents:
     - `extension/`: Chrome/Edge MV3 Extension build
     - `companion/`: Windows Privacy Relay companion service (`install_companion.bat`, `uninstall_companion.bat`, etc.)
     - `PACKAGE_INVENTORY_SHA256.txt`: SHA-256 digest of every file in the package (exact match verified)

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_6_real_runtime_traces.log`
   - Size: 21,526 bytes
   - SHA-256: `f320aa9211c2ad342df1fb27762188b1371e11b45de6dca7e76d5eb821596ebc`

### Operator Audit Verification (Gates 1 - 7: 100% PASS in Real Microsoft Edge)
- **Blocker 1**: Cryptographic verification of exact release ZIP bytes (`4,350,121` bytes, SHA-256: `a49a2434...`) extracted to fresh temp dir; Edge launched ONLY with extracted extension — **PASS**
- **Gate 1**: Build Provenance & Module Parity in Real Edge Background Worker (`R6.9G.10.3.6-20261008-AUTO-ENFORCED-PRIVACY-START-PREP`, `b970eb5e`) — **PASS**
- **Gate 2**: Truthful Restore State & Inverted Log Remediation (`isGateReady=false`, `isGateActive=false`) — **PASS**
- **Gate 3**: Real Edge Scenario C: Zero nodes fail-closed UX (`NO_HEALTHY_EGRESS`, actionSection `privacy-relay-add-form`, human-readable guidance, zero raw enums) — **PASS**
- **Gate 4**: Real Edge Scenario D: Managed Proxy Auto-Recovery (`HTTPS_PROXY` auto-switch, chrome.proxy readback verified, canary PASS) — **PASS**
- **Gate 5**: Real Edge Scenario A: Owner exact scenario (`SYSTEM_VPN` legacy self-heals to `PRIVACY_RELAY`, companion relay active, chrome.proxy readback 127.0.0.1:18988, canary PASS, storedMode updated) — **PASS**
- **Gate 6**: Deterministic 1-Click START Flow in Popup UI (`[START_UI] -> [PRIVACY_START_PREP] -> [PRIVACY_AUTO_RECOVERY] -> [PRIVACY_TRANSPORT_APPLIED] -> [PRIVACY_CANARY] PASS -> [PRIVACY_START_READY] -> [START_IPC] -> [START_BG] -> [START_ACK]`) — **PASS**
- **Gate 7**: Clean-up and Zero Direct Fallback Invariant — **PASS**

### Operational Invariants
- Strict fail-closed privacy is strictly preserved (`failClosed` is never disabled automatically).
- Direct internet fallback is strictly blocked.
- Fixed egress mode is utilized for Owner smoke testing.
- Bulk campaign remains strictly on **HOLD**.
