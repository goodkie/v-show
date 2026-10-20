# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issue #6 (Responding to Directive [RC3.21-NATIVE-HOST-SCRATCH-RECONTAMINATION-AND-BUILD-ID-DRIFT] Comment #6298827174)
- Branch: upgrade/phase-0-1
- State Rev: 2026-10-20.57
- Authority Cursor: 6298827174
- Last Directive / Audit: `[CHATGPT][OWNER-EVIDENCE][extension-form-sender][RC3.21-NATIVE-HOST-SCRATCH-RECONTAMINATION-AND-BUILD-ID-DRIFT] Comment #6298827174`
- Last Receipt: `[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.22-OS-ISOLATED-PACKAGING-AND-NATIVE-HOST-SYNC]` (pending post)
- Build ID: `R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22`
- Current Candidate Release Tag: `v6.9g.10.3-rc3.22.7.1.4.36`
- Functional Head Commit: `fdc4c0941df5d3604dcd0c140a25520eb5118856`
- Rollback Anchor: `0a6e843d9e5ae512bf48742473bbd3133050c117` (RC3.17)
- Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.36_PRIVATE_EGRESS_RC3.22.zip`
- Release Asset Size: `45,364,874` bytes
- Release Asset SHA-256: `8dd0137bd87f7e8ebfb42d487a098ba4708850b67f61322b8f6ffb051ad3b0a2`
- Release Asset Hosted URL: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.22.7.1.4.36`

## Current Gate
- Formal Gates Evaluated for RC3.22 Remediation (Resolving Directive #6298827174):
  * **1. OS-Isolated Package Smoke Verification Gate: PASS**
    - `XPIDER_AUTO_SETUP.bat`: Added `if defined XPIDER_ISOLATED_TEST` guard immediately following runtime/dependency validation, skipping registry modifications, Startup shortcuts, and background service spawning during packaging smoke tests.
    - `companion/install_native_host.js`: Added dry-run guard `if (process.env.XPIDER_ISOLATED_TEST === '1' || process.argv.includes('--dry-run'))` returning `true` before executing `reg add` on HKCU Chrome/Edge NativeMessagingHosts.
    - `companion/install_autostart.js`: Added dry-run guard `if (process.env.XPIDER_ISOLATED_TEST === '1' || process.argv.includes('--dry-run'))` returning `true` before writing `XPIDER_Privacy_Relay.vbs` to `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.
    - `companion/ensure_companion_service.js`: Added dry-run guard exiting `0` before starting processes or watchdog when isolated.
    - `pack_owner_beta_package.js`: Removed proactive port 18988/18989 killing logic. Added snapshotting of Host OS Baseline (Chrome HKCU registry, Edge HKCU registry, Startup VBS, live companion PID) before packaging smoke test, and asserted bit-for-bit unchanged invariants post-test. Fails closed if any invariant is violated.
  * **2. Native Host Expected-Build Parity Gate: PASS**
    - `companion/native_host/xpider_native_host.js`: Updated and synchronized `COMPANION_BUILD_ID` to `R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22`.
    - Automated parity via `sync_build_parity.js`: reads authoritative build provenance and stamps `xpider_native_host.js`, `privacy-relay-service.js`, and `ensure_companion_service.js`.
  * **3. Build Provenance Implementation Head Gate: PASS**
    - `extension/modules/build-provenance.js` and `send_message_backup/modules/build-provenance.js`: Stamped `implementationHead` to actual functional release commit `fdc4c0941df5d3604dcd0c140a25520eb5118856` (short: `fdc4c094`).
    - Stamped `buildId` to `R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22` and channel `OWNER_BETA_PRIVATE_EGRESS_RC3.22`.
  * **4. Automated Regression Suite (18/18 PASS)**:
    - Executed `test_r6_9g10_3_7_1_4_35_decision_serialization.js`: 18 tests passed across static assertions, banner pointer-events isolation, decision surface serialization, background latch reset, Turbify container climb, Native Host build parity, and OS isolation guards.
  * **5. Package Parity & Provenance Gate: PASS**
    - Created `XPIDER_R6.9G.10.3.7.1.4.36_PRIVATE_EGRESS_RC3.22.zip` via `pack_owner_beta_package.js`.
    - Executed `scratch/verify_local_rc3_22.js`: Passed all 7 gates including 100% SHA256 byte parity across all 11 critical files, zero secrets, zero denylist entries, and verified zero host registry mutations.
    - Unpacked convenience folder `XPIDER_R6.9G.10.3.7.1.4.36_PRIVATE_EGRESS_RC3.22` for immediate Owner smoke testing.
  * **6. Live Companion & Egress Status: PASS**
    - Companion service running on PID 7888 / 20904 from canonical workspace root `E:\vivpr\ai\extension-form-sender`.
    - Watchdog active on PID 18104 (`rootParity=true`).
    - PowerShell proxy probe through `http://127.0.0.1:18988` verified returning `159.203.28.198` (HTTP 200).
  * **7. Owner Smoke Gate: AUTHORIZED (3–5 controlled/authorized URLs)**

### Operating Guidelines & Invariants:
1. **Existing Droplet Preservation**:
   - The test droplet (`159.203.28.198`) provisioned in TOR1 remains 100% active and untouched. Zero cloud VPS mutations.
2. **Fail-Closed Privacy Barrier**:
   - Fail-closed transport strictly enforced (never bypasses to direct ISP).
3. **Packaging Hygiene**:
   - Zero credentials, tokens, or runtime files inside released ZIP. Verified by deep content scan.
   - Zero host environment pollution during build and packaging.
