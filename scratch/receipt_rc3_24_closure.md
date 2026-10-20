[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.24-CAPTCHA-SKIP-TERMINAL-SETTLEMENT-AND-LIFECYCLE-ATOMICITY]

Authority Directive: [CHATGPT][OWNER-SMOKE][extension-form-sender][RC3.23-CAPTCHA-SKIP-TERMINAL-SETTLEMENT-RACE] Comment #6300788298
Protocol: OCA-DEV-1.4
Workspace: `E:\vivpr\ai\extension-form-sender`
Active Branch: `upgrade/phase-0-1`
Build ID: `R6.9G.10.3.7.1.4.38-20261020-PRIVATE-EGRESS-RC3.24`
Channel: `OWNER_BETA_PRIVATE_EGRESS_RC3.24`
Functional Head Commit: `f9d78409` (pushed to `origin/upgrade/phase-0-1`)
Release Tag: `v6.9g.10.3-rc3.24.7.1.4.38`
Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.38_PRIVATE_EGRESS_RC3.24.zip` (45,370,232 bytes)
Release Asset SHA-256: `72708aa5cd49bd48d8f3b5625656aea2fa0f07b6283f39d4eefec8e94615d0dd`

---

### 1. Defect Remediations & Technical Evidence

#### P0 — CAPTCHA AUTO_FIRST + No Solver Key + Popup OFF Terminal Settlement Resolved
- **Root Cause**:
  1. In `content-script.js`, `tryAutoSolveCaptcha` handled `CAPTCHA_SKIP_DECISION` by resolving plain `false` for non-lab runs instead of a structured terminal settlement object.
  2. `waitForCaptchaSolved()` recorded `autoSolveFinishedTs = Date.now()` regardless of whether a solver actually ran, and 15 seconds later threw `CAPTCHA_TOKEN_NOT_ACCEPTED`.
  3. In `background.js`, the no-solver AUTO_FIRST branch set stage to `CAPTCHA_SKIPPED` and sent `CAPTCHA_SKIP_DECISION`, but resumed the deadline controller and did NOT invoke or consume `campaignState.targetResolve`, leaving target execution hanging until outer `Local Session Timeout` fired ~3 minutes later.
- **Fix Implemented**:
  1. **Content Script Terminal Object (Section A)**:
     - In `content-script.js`, `tryAutoSolveCaptcha` returns structured terminal object across all normal runs:
       ```javascript
       resolve({
           terminalSettled: true,
           result: msg.result || 'SKIPPED',
           reason: msg.reason || 'CAPTCHA_SKIPPED_NO_SOLVER'
       });
       ```
     - Log path renamed from `[CAPTCHA_LAB_CASE]` to `[CAPTCHA_TERMINAL_SETTLED]`.
  2. **Background Atomic Target Lifecycle Resolution (Section B)**:
     - In `background.js`:
       - `campaignState.captchaLedger.pendingOwner = Math.max(0, campaignState.captchaLedger.pendingOwner - 1);`
       - Transitions stage to `CAPTCHA_SKIPPED` and latches failure into `campaignState.captchaFailuresRecorded`.
       - Calls `campaignState.targetDeadlineController.cancel('CAPTCHA_SKIPPED_NO_SOLVER')` (strictly avoided resuming).
       - Clears `xpider_watchdog_${tabId}_${sessionId}` alarms.
       - Sends `CAPTCHA_SKIP_DECISION` with canonical identity, `result: 'SKIPPED'`, and `reason: 'CAPTCHA_SKIPPED_NO_SOLVER'`.
       - Atomically consumes and clears `campaignState.targetResolve` with structured result:
         ```javascript
         resolveTarget({
             success: false,
             reasonCode: 'CAPTCHA_SKIPPED_NO_SOLVER',
             metadata: {
                 captchaStatus: 'SKIPPED_NO_SOLVER',
                 autoFirst: true,
                 popupShown: false
             }
         });
         ```
  3. **Content Wait Loop & Token-Acceptance Fast-Fail Isolation (Section C & D)**:
     - In `waitForCaptchaSolved()`:
       - If `solveResult.terminalSettled === true`, immediately removes HUD, sets `currentTargetLifecycleState = TargetLifecycleState.SETTLED`, and returns `false` without setting `autoSolveFinishedTs`.
       - Separated solver attempt state with explicit flags: `providerSolveAttempted`, `providerTokenInjected`, and `terminalCaptchaDecision`.
       - Fast-fail `CAPTCHA_TOKEN_NOT_ACCEPTED` is strictly gated on:
         `!terminalCaptchaDecision && providerSolveAttempted && providerTokenInjected && autoSolveFinishedTs > 0 && (Date.now() - autoSolveFinishedTs > 15000)`.

---

### 2. Verification & Acceptance Gates

| Gate | Status | Evidence / Metrics |
| :--- | :---: | :--- |
| **P0-A AUTO_FIRST Skip Terminal Settlement** | **PASS** | Immediate structured `CAPTCHA_SKIPPED_NO_SOLVER` settlement; zero hanging, zero local session timeout. |
| **P0-B Background Atomic Target Lifecycle** | **PASS** | Target deadline cancelled, alarms cleared, `targetResolve` consumed and cleared atomically. |
| **P0-C Token-Acceptance Fast-Fail Isolation** | **PASS** | `providerSolveAttempted` and `providerTokenInjected` isolated; zero false `CAPTCHA_TOKEN_NOT_ACCEPTED` on skip. |
| **P0-D Privacy Relay Persistence** | **PASS** | `keepPrivacyRelayEnforcedBetweenCampaigns: true`; proxy and `gateReady=true` preserved post-skip and post-campaign. |
| **Regression Suite** | **PASS** | `test_r6_9g10_3_7_1_4_35_decision_serialization.js`: **27/27 tests passed** (including Suite 7 RC3.24 defect tests). |
| **Local Package Acceptance** | **PASS** | `scratch/verify_local_rc3_24.js`: Passed all 7 gates; 100% SHA256 byte parity across all 11 critical components. |
| **OS Environment Isolation** | **PASS** | Packaging smoke tests verified zero mutations to Host OS registry, Startup VBS, or companion background PID. |
| **Live Companion & Egress Status** | **PASS** | Companion PID 7888 / 20904, Watchdog PID 18104 (`rootParity=true`). Proxy probe via `http://127.0.0.1:18988` returned TOR1 Droplet IP `159.203.28.198` (HTTP 200). |

---

### 3. Release Artifacts & SHA-256 Parity

- **Archive File**: `XPIDER_R6.9G.10.3.7.1.4.38_PRIVATE_EGRESS_RC3.24.zip`
- **Archive Size**: `45,370,232` bytes
- **Archive SHA-256**: `72708aa5cd49bd48d8f3b5625656aea2fa0f07b6283f39d4eefec8e94615d0dd`
- **Hosted GitHub Release**: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.24.7.1.4.38`
- **Critical Components SHA-256 (100% Parity Workspace vs Zip)**:
  - `privacy-relay-service.js`: `0844e7bc033f29633265863f9e3fe6addd60b65b553b0f5a377cb93d9cf1c040`
  - `companion-watchdog.js`: `6bb3f25382952bf5a23a35df37f90e0fde02bdaa1cb35ad6801015ec99bdeca5`
  - `ensure_companion_service.js`: `c35c7244467c028ba8727fd592f8fa8b7b007f9c95135729da1424e2d1edc2c2`
  - `winsec.js`: `346d63780f45938b64478163c55beea0907c11fb2c65a92a72091cf0f66375f5`
  - `start_relay_silent.vbs`: `69ce823c5a2344d80d951e79fd6c6992023b202e66ad62a17ee429d7f14ac700`
  - `xpider_native_host.js`: `e17dd100b18be42ebe1f0964dba7a832a8126d19e71b30008e4ca8ab735b5d7b`
  - `background.js`: `84e626b965748d919e865532e8e7694ae065c03e258d3cad17e4b07824d9eed1`
  - `content-script.js`: `7aaa94174c85e3c968da48cd56ef510698c43f1dabb9deec014465c3f8919e60`
  - `popup.js`: `40068a20e7480383ae0c19e08b69966170b7a25f86dd0ee0c69266882b574fb3`
  - `build-provenance.js`: `9e1994429b6b16ae9ff0ebb3b807d9f7177d4dc0a91b926ddb16fc3dbbe0eed5`
  - `privacy-gateway.js`: `59bdaf23809a58a1b201d843279eb1a9455bc2a8bbbb8312ef5b47ddaa814a50`

---

### 4. Owner Smoke Instructions

1. Unpack `XPIDER_R6.9G.10.3.7.1.4.38_PRIVATE_EGRESS_RC3.24.zip` or point Edge/Chrome unpacked extension to `XPIDER_R6.9G.10.3.7.1.4.38_PRIVATE_EGRESS_RC3.24\extension`.
2. Inspect extension popup:
   - Verify Main HUD shows `🟢 PRIVACY: READY (PRIVACY_RELAY)`.
   - Settings: `Keep Privacy Relay Enforced Between Campaigns` is checked.
   - Form Assist Automation: `Automatic Recovery First` is checked, `Show Manual Form Assist Popup` is unchecked.
   - CAPTCHA Decision Handling: `Default CAPTCHA Handling: AUTO FIRST`, `Show Auto / Manual Choice Popup` is unchecked.
3. Run smoke test on target URL:
   - Target: `https://www.kempomaa.com/contact-us.html`
   - Expected Result: Form discovered -> pre-filled fields recognized as valid -> `AUTOFILL_RESULT status=SUCCESS` -> CAPTCHA detected -> AUTO_FIRST with no key immediately logs `Advancing as SKIPPED` -> target resolves immediately as `CAPTCHA_SKIPPED_NO_SOLVER` without 15s error or 3min timeout -> Privacy Relay remains active (`gateReady=true`, `transportEnforced=true`).
