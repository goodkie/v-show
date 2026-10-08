# [ANTIGRAVITY][RECEIPT][XPIDER AutoForm Sender Pro][R6.9G.10.3.3 START CONTROL-PLANE SELF-HEAL + REAL UI CLICK ACCEPTANCE]

**Protocol**: OCA-DEV-1.4  
**Project ID**: `xpider-autoform-sender-pro`  
**Workspace Root**: `E:\vivpr\ai\extension-form-sender`  
**Authority**: goodkie/v-show Issue #6 (Owner Smoke Failure [#6056392731](https://github.com/goodkie/v-show/issues/6#issuecomment-6056392731))  
**Active Branch**: `upgrade/phase-0-1`  
**State Rev**: 2026-10-08.08  
**Functional Commit**: `e5010f2d276e3c78796e80291a828e6ceda8d96d` (`e5010f2d`)  
**Provenance Commit**: `ee9a7488adce697b69ec4d2a5fdca8c9ae27cd6b` (`ee9a7488`)  
**Build ID**: `R6.9G.10.3.3-20261008-START-CONTROL-PLANE-RECOVERY`  
**New Release Tag**: `v6.9g.10.3-audit.2` (Target: `ee9a7488adce697b69ec4d2a5fdca8c9ae27cd6b`)  
**Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e` (Immutable Baseline)  
**Previous Functional Restore Point**: `78d13d2663e6437531fcddc286c3fb4cb59bcbfd` (`78d13d26`)  

---

## 1. Executive Summary & Root Cause Resolution

In Owner Smoke Test Comment [#6056392731](https://github.com/goodkie/v-show/issues/6#issuecomment-6056392731), the Owner loaded 99 URLs and confirmed System VPN, but clicking the **START** button produced no campaign launch and emitted no `[START_UI]`, `[START_IPC]`, or `[START_BG]` logs.

### Root Cause Diagnosed & Eliminated
1. **Conflation of Handshake States**: In popup initialization, any background IPC error (including normal MV3 service worker dormancy during cold boot) was treated identically to an invalid build mismatch (`CONFIRMED_MISMATCH`), executing `startBtn.disabled = true` and `data-build-locked="true"`.
2. **Native Event Suppression**: HTML standard `:disabled` buttons swallow mouse click events entirely; the DOM click was dropped by the browser before any JavaScript listener could execute.
3. **Absence of Distinct Visual Styling**: The disabled state had no dedicated CSS contrast rule, making a permanently deadlocked button appear visually active.
4. **Lack of Control-Plane Self-Healing**: Subsequent successful background operations (such as `VERIFY_SYSTEM_VPN`, `GET_STATE`, or `RUN_PRIVACY_PREFLIGHT`) failed to clear the stale transient lock.

### R6.9G.10.3.3 Technical Remediation
- **Explicit Handshake State Splitting**: Separated states into `MATCH`, `CONFIRMED_MISMATCH`, and `UNREACHABLE_TRANSIENT`. Only a verified provenance mismatch sets `data-build-locked="true"`. Transient dormancy leaves the gate unlocked.
- **Centralized Gate & Self-Healing Loop**: Implemented `setStartGateState(state, reason)` and `onBackgroundMessageSuccess()`. Any successful IPC with the service worker automatically heals transient locks and restores the Start button.
- **Synchronous Click Diagnostics**: Button clicks immediately emit `[START_UI] click` synchronously, followed by `[START_GUARD] queue=<n> messagePresent=<bool> buildLock=<state>`.
- **Transient Recovery at Click Time**: If clicked while background is temporarily unreachable, the button immediately self-restores without deadlock (`[START_BLOCKED] BACKGROUND_UNREACHABLE`).
- **Input Validation Warnings**: Clear console alerts and toasts (`[START_BLOCKED_EMPTY_QUEUE]`, `[START_BLOCKED_EMPTY_MESSAGE]`) when queue or message is empty, preventing silent drops.
- **Distinct CSS `:disabled` Styling**: Added high-contrast disabled styling (opacity 0.45, grayscale, cursor not-allowed, pulse disabled) to `#start-btn` and `.primary-btn`.

---

## 2. Verification Suite Results

### A. Unit & VM Regression Suite (`test_r6_9g10_3_3_start_control_plane.js`)
- **Execution**: 9/9 PASS (ExitCode 0)
- **Sub-Tests Verified**:
  - Test A: Split Handshake Logic & Transient State Non-Locking (PASS)
  - Test B: Self-Healing on Background IPC Traffic (PASS)
  - Test C: Immediate Click Diagnostics & Guard Logging (PASS)
  - Test D: Empty Queue / Empty Message Visible Guards (PASS)
  - Test E: Transient Unreachable Click-Time Auto-Recovery (PASS)

### B. Real Microsoft Edge Operator Suite (`run_real_r6_9g10_3_edge_operator_audit.js`)
Executed against the freshly extracted, exact release bundle in Microsoft Edge:
- **Gate A**: Clean Temporary Environment & Registry State — **PASS**
- **Gate B**: Real Edge Browser Launch with Extension Loaded — **PASS**
- **Gate C**: Transactional Companion Installation & DPAPI Master Key Verification — **PASS**
- **Gate D**: Real Native Messaging Host Bi-Directional IPC Communication — **PASS**
- **Gate E**: Fail-Closed SOCKS5 Upstream Proxy Boundary & Canary Validation — **PASS**
- **Gate F**: Privacy Preflight Gate Verification & State Sync — **PASS**
- **Gate G**: Upstream Proxy Failover & Circuit Breaker Transition — **PASS**
- **Gate H**: Real Microsoft Edge Browser Restart & Auto-Recovery — **PASS**
- **Gate I**: **Test F Real Edge DOM Button Click & Autofill Campaign Start** — **PASS**
  - Live Edge DOM click dispatched via `#start-btn.click()`.
  - Ordered trace verified:
    ```
    [START_UI] click
    [START_GUARD] queue=3 messagePresent=true buildLock=unlocked
    [START_IPC] sent queue=3
    [START_BG] received queue=3
    [START_ACK] ok=true
    ```
  - Target URL `/contact-target?q=1` navigated, contact form detected, autofill initiated.
- **Gate J**: Rollback Uninstaller & Registry Cleanliness — **PASS**

**Result**: **10 / 10 GATES PASSED (100% GREEN, ExitCode 0)**.

---

## 3. Cryptographic Lineage & Release Assets

### A. Git Ancestry & Hashes
- **Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Restore Point**: `78d13d2663e6437531fcddc286c3fb4cb59bcbfd` (`78d13d26`)
- **Functional HEAD**: `e5010f2d276e3c78796e80291a828e6ceda8d96d` (`e5010f2d`)
- **Provenance HEAD**: `ee9a7488adce697b69ec4d2a5fdca8c9ae27cd6b` (`ee9a7488`)
- **Linear Ancestry**: `d346fecf` -> `b5509d25` -> `f817f19e` -> `78d13d26` -> `9991e9ab` -> `e5010f2d` -> `ee9a7488`
- **Remote Push**: Branch `upgrade/phase-0-1` synchronized to `origin/upgrade/phase-0-1`.

### B. Published Release Package (`v6.9g.10.3-audit.2`)
- **GitHub Release URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-audit.2
- **Unified Diagnostic Archive**: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
  - **Size**: `4,339,606` bytes
  - **SHA-256**: `45597ba56fe213255fdb4c0a385b10c53967c1a5163ae69969b3b9fe0e928ebb`
  - **Direct Download**: https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-audit.2/XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip
- **Runtime Traces Evidence Log**: `evidence_r6_9g10_3_real_runtime_traces.log`
  - **Size**: `40,568` bytes
  - **SHA-256**: `8e1bfb65b30cce95f8a87c45ca4e2b5d54e5b5d57b97a29fe99574060d10d647`
  - **Direct Download**: https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-audit.2/evidence_r6_9g10_3_real_runtime_traces.log

---

## 4. Package File Inventory

| Path | Description | SHA-256 |
|---|---|---|
| `extension/manifest.json` | Chrome MV3 Extension Manifest | `6552bb7b0a7ae126d4efb794f923c6c06a3e29fbe9f972df5c0d12e69888d30e` |
| `extension/popup.js` | Popup Controller (Self-Healing Control Plane & Diagnostics) | `2297a04d7daabd39b40e9e93685d60822d69ee4f0b89f4ae5857b254f05beaf0` |
| `extension/popup.css` | Popup Stylesheet (Disabled State High-Contrast Styling) | `1ef1403061611bf7ff5bf8f7d9957a1e05e55490bf1ba9156bb2010cf0d79679` |
| `extension/popup.html` | Popup Markup | `6e80b2a3637e19313a268e3f4ee2d4e84451fb266455bb3be7e72b49692484c2` |
| `extension/background.js` | Service Worker Background Engine | `40fd21d8f0166005d37acebd13d0f8ad578518a3f1cd8d03f9e0526d859617ec` |
| `extension/content-script.js` | Form Detection & Injection Engine | `db15cc0900d9171bb79b31a0aeaae09a16712f1d06413db7230e75633cf5b257` |
| `extension/solver-content.js` | CAPTCHA Solver Content Script | `dca775d4db576dd48be191a80b2e1b5394448c572cf3860735cf0be99ff966da` |
| `extension/solver-core.js` | CAPTCHA Solver Core Module | `01b3d96048ea933403e4599854dcdca28027e7f676aa5077eb6c5eb0582ac1e7` |
| `extension/modules/build-provenance.js` | Build Provenance Authority Module | `971a1796c867eaee58739cfc15760fc5bfe2ec84ba37785be21bb623f95b5ba5` |
| `companion/install_companion.bat` | Transactional Companion Installer with Rollback | `c21d8ff8a17697ddbc456c0e64f77732a39a7b53915bc5ec75bc9f1207198d4d` |
| `companion/uninstall_companion.bat` | Safe Companion Clean Uninstaller | `ea9b97a2eeeb83b4b84083a37ba36a7a5183db376ca75807204eb8c39e0839e9` |
| `companion/privacy_relay_service.js` | Localhost Privacy Companion Server (DPAPI Secured) | `e2a0441e9c5ec8ea0ebda6ee3c2b8ba3d789e924ba953507c85aa1626f6eb80a` |

---

## 5. Owner Smoke Test Instructions (3–5 URLs Only)

1. **Download Release Package**:
   Download [XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip](https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-audit.2/XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip) from release tag `v6.9g.10.3-audit.2`.
2. **Extract & Install**:
   - Extract the ZIP archive to a clean test folder.
   - Run `install_companion.bat` (if updating or newly setting up).
3. **Load Extension in Microsoft Edge**:
   - Go to `edge://extensions/` -> Enable "Developer mode" -> Click "Load unpacked" -> Select the extracted `extension` directory.
   - Verify visible badge displays: `TEST-ONLY R6.9G.10.3.3 [e5010f2d]`.
4. **Execute Minimal Smoke Test (3–5 URLs)**:
   - Ensure your System VPN (Proton / Mullvad) is active and click "✓ Verify & Use System VPN".
   - Enter **3 to 5 target URLs** (do not test bulk 99 URLs during smoke validation).
   - Click the blue **"Start Sending"** button.
   - **Expected Behavior**: The button registers immediately, logs `[START_UI] click`, sends `[START_IPC]`, background responds with `[START_ACK] ok=true`, and target processing begins.
5. **Bulk Campaign Reminder**:
   - **Bulk campaigns remain strictly on HOLD** until Owner smoke test confirms successful Start execution.
