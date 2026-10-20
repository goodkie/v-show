[ANTIGRAVITY][RECEIPT][extension-form-sender][RC3.23-AUTOFILL-ACCOUNTING-COMMITTED-FORM-404-OVERLAY-AND-PRIVACY-RESTORE]

Authority Directive: [CHATGPT][OWNER-SMOKE][extension-form-sender][RC3.22-AUTOFILL-STATE-ACCOUNTING-FALSE-FAILURE-404-OVERLAY-FORM-PRIVACY-RESTORE] Comment #6299638525
Protocol: OCA-DEV-1.4
Workspace: `E:\vivpr\ai\extension-form-sender`
Active Branch: `upgrade/phase-0-1`
Build ID: `R6.9G.10.3.7.1.4.37-20261020-PRIVATE-EGRESS-RC3.23`
Channel: `OWNER_BETA_PRIVATE_EGRESS_RC3.23`
Functional Head Commit: `63e97460` (pushed to `origin/upgrade/phase-0-1`)
Release Tag: `v6.9g.10.3-rc3.23.7.1.4.37`
Release Asset Zip: `XPIDER_R6.9G.10.3.7.1.4.37_PRIVATE_EGRESS_RC3.23.zip` (45,369,876 bytes)
Release Asset SHA-256: `8bae59c34b476f88f70993caf2f02b8d4aaeacba822702d34a42a907cc613722`

---

### 1. Defect Remediations & Technical Evidence

#### P0-A — Autofill State Accounting False Failure Resolved
- **Root Cause**: `fillFormIntelligent` classified already populated inquiry fields with `FIELD_SKIP ... reason=ALREADY_FILLED`, but did not register them into `__xpider_current_field_mapping` or count them toward resolved fields. Consequently, `fieldsDetected - fieldsFilled` evaluated to `3 - 0 = 3` unresolved, and an unconditional fallback inserted `['message_body', 'name', 'email']` whenever `filledCount === 0`, raising a false-positive `AUTOFILL_PARTIAL` manual assist modal.
- **Fix Implemented**:
  1. Separated metrics in `extension/content-script.js`:
     - `fieldsNewlyFilled` (fields typed during current execution)
     - `fieldsAlreadyValid` (fields confirmed valid & pre-populated)
     - `fieldsResolvedTotal` (`fieldsNewlyFilled + fieldsAlreadyValid`)
     - `unresolvedFields` (mandatory inquiry fields genuinely missing/unresolved)
  2. `ALREADY_FILLED` fields with non-empty values are recorded into `__xpider_current_field_mapping` and `__xpider_current_filled_fields` and counted as RESOLVED.
  3. Removed the fallback injecting inquiry fields when `filledCount === 0`.
  4. Form autofill evaluates to `isAutofillSuccess = true` whenever `resolvedCount > 0 && unresolvedCount === 0`, preventing false-positive Owner Assist.

#### P0-B — Committed Form Escape to 404 Alias Guarded
- **Root Cause**: When autofill returned false, the engine dropped the committed form container and fell back to contact alias discovery (`https://www.kempomaa.com/contact`), which is a 404 page.
- **Fix Implemented**:
  1. Bound retry routines strictly to the active `formPageUrl` and committed form container in `content-script.js`.
  2. Suppressed alias discovery navigation on retry if the committed form container remains present and valid in the DOM.
  3. Added HTTP/404 error page detection (`isPageErrorOr404(doc)`) checking document title, headings (`h1`–`h3`), and body error signals, terminating alias navigation immediately if an error page is detected.

#### P0-C — Browser/Extension Overlay DOM Exclusion & 404 Rejection
- **Root Cause**: On the 404 page, injected translation extension UI (`...-translate-tab`, `...-inputText`) containing raw textareas was mistaken for an inquiry contact form, and a button labeled `"translate"` was selected as a submit button.
- **Fix Implemented**:
  1. Added `isExcludedOverlayElement(el)` across `content-script.js` and `form-discovery-engine-r2.js`, rejecting any element whose ID, class, role, or ancestry contains overlay patterns (`translate-`, `overlay`, `extension`, `gtx-`, `trans-`, `dictionary`, `dict-`, `tooltip`, `popup-bubble`, `toast-`).
  2. Enforced form container context: raw textareas alone without a valid form container, logical container, or external form candidate can never classify a page as `CONTACT_FORM_PAGE`.
  3. Added `'translate'`, `'translation'`, `'번역'` to submit rejection keywords in `inspectContainerControls` and `vision-submit-executor.js`.
  4. Added visibility check: if `formVisible === false`, submit candidate activation is aborted with `FORM_NOT_VISIBLE`.

#### P0-D — Persistent Privacy Relay Between Campaigns
- **Root Cause**: Campaign completion invoked `restoreOriginalSettings()`, which reverted proxy configurations to direct ISP defaults and logged `[PRIVACY_SETTINGS_RESTORED] gateReady=false`.
- **Fix Implemented**:
  1. Added `keepPrivacyRelayEnforcedBetweenCampaigns: true` (default **ON**) to `DEFAULT_CONFIG` in `extension/modules/privacy-gateway.js`.
  2. In `restoreOriginalSettings(options)`: preserved `isGateReady = true`, `isGateActive = true`, and maintained the active relay proxy connection unless `options.forceDirect === true` (used only for run-scoped test overrides).
  3. Updated `pauseCampaign` and campaign completion handlers in `background.js` to preserve the configured Private Relay transport.

#### Requested UX Changes — Automatic-First Decision Handling
- Added settings toggles in `extension/popup.html` and `extension/popup.js`:
  - **Form Assist Automation**:
    - `Automatic Recovery First` (default **ON**): automatically performs bounded retry/re-detection first.
    - `Show Manual Form Assist Popup` (default **OFF**): only displays assist modal if recovery is exhausted AND popup toggle is ON. If OFF, settles cleanly with structured status `SKIPPED`.
  - **CAPTCHA Decision Handling**:
    - `Default CAPTCHA Handling`: **AUTO FIRST** (default).
    - `Show Auto / Manual CAPTCHA Choice Popup` (default **OFF**): executes automatic solver directly without blocking automation when configured. Normal form autofill never requires CAPTCHA setup.

---

### 2. Verification & Acceptance Gates

| Gate | Status | Evidence / Metrics |
| :--- | :---: | :--- |
| **P0-A Autofill Accounting** | **PASS** | Pre-filled inquiry fields register as `fieldsAlreadyValid`, `fieldsResolvedTotal=3`, `unresolved=0`, `isAutofillSuccess=true`. Zero Owner Assist modal triggered. |
| **P0-B Committed Form Guard** | **PASS** | Retry remains bound to committed container; alias navigation suppressed when form is present in DOM. |
| **P0-C Overlay DOM & 404 Exclusion** | **PASS** | 404 pages rejected from classification; extension translation textareas and "translate" buttons filtered out. |
| **P0-D Privacy Relay Persistence** | **PASS** | `keepPrivacyRelayEnforcedBetweenCampaigns: true` default; proxy and `gateReady=true` preserved post-campaign. |
| **UX Decision Automation** | **PASS** | Automatic recovery first; choice popups default OFF; non-blocking structured settlement. |
| **Regression Suite** | **PASS** | `test_r6_9g10_3_7_1_4_35_decision_serialization.js`: **23/23 tests passed** (including Suite 6 RC3.23 defect tests). |
| **Local Package Acceptance** | **PASS** | `scratch/verify_local_rc3_23.js`: Passed all 7 gates; 100% SHA256 byte parity across all 11 critical components. |
| **OS Environment Isolation** | **PASS** | Packaging smoke tests verified zero mutations to Host OS registry, Startup VBS, or companion background PID. |
| **Live Companion & Egress Status** | **PASS** | Companion PID 7888 / 20904, Watchdog PID 18104 (`rootParity=true`). Proxy probe via `http://127.0.0.1:18988` returned TOR1 Droplet IP `159.203.28.198` (HTTP 200). |

---

### 3. Release Artifacts & SHA-256 Parity

- **Archive File**: `XPIDER_R6.9G.10.3.7.1.4.37_PRIVATE_EGRESS_RC3.23.zip`
- **Archive Size**: `45,369,876` bytes
- **Archive SHA-256**: `8bae59c34b476f88f70993caf2f02b8d4aaeacba822702d34a42a907cc613722`
- **Hosted GitHub Release**: `https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.23.7.1.4.37`
- **Critical Components SHA-256 (100% Parity Workspace vs Zip)**:
  - `privacy-relay-service.js`: `7cb1e82012f8658f859bc9941bc812bc97a4bb133ac4f5e2a5943fae5b5190df`
  - `companion-watchdog.js`: `6bb3f25382952bf5a23a35df37f90e0fde02bdaa1cb35ad6801015ec99bdeca5`
  - `ensure_companion_service.js`: `5fa41a354c0dcac595065e283255d3b123c441e6635e8ad4dbc6866d79a95399`
  - `winsec.js`: `346d63780f45938b64478163c55beea0907c11fb2c65a92a72091cf0f66375f5`
  - `start_relay_silent.vbs`: `69ce823c5a2344d80d951e79fd6c6992023b202e66ad62a17ee429d7f14ac700`
  - `xpider_native_host.js`: `5b88adafea2b02932dc1f0bed91494f67bf89b5a494c268460b70b9d80a05b2a`
  - `background.js`: `babcd71b57e874f259b3a80d00066d5e2e248d4663bc7f020949012ce9c384d2`
  - `content-script.js`: `99086a93b647a3a583b8e27d86b752624e91050aa7ac5ff931042684ab69c67e`
  - `popup.js`: `40068a20e7480383ae0c19e08b69966170b7a25f86dd0ee0c69266882b574fb3`
  - `build-provenance.js`: `5353e6c1e2e90694ad87ed6614f0ae32cb740963ae14dc9ba4f7ccc3ba281b46`
  - `privacy-gateway.js`: `59bdaf23809a58a1b201d843279eb1a9455bc2a8bbbb8312ef5b47ddaa814a50`

---

### 4. Owner Smoke Instructions

1. Unpack `XPIDER_R6.9G.10.3.7.1.4.37_PRIVATE_EGRESS_RC3.23.zip` or point Edge/Chrome unpacked extension to `XPIDER_R6.9G.10.3.7.1.4.37_PRIVATE_EGRESS_RC3.23\extension`.
2. Inspect extension popup:
   - Verify Main HUD shows `🟢 PRIVACY: READY (PRIVACY_RELAY)`.
   - Verify Settings show `Keep Privacy Relay Enforced Between Campaigns` checked.
   - Verify Form Assist Automation shows `Automatic Recovery First` checked, `Show Manual Form Assist Popup` unchecked.
   - Verify CAPTCHA Decision Handling shows `Default CAPTCHA Handling: AUTO FIRST`, `Show Auto / Manual Choice Popup` unchecked.
3. Run smoke test on target URL:
   - Target: `https://www.kempomaa.com/contact-us.html`
   - Expected Result: Form discovered -> pre-filled fields recognized as valid -> `AUTOFILL_RESULT status=SUCCESS fieldsResolved=3 unresolved=0` -> zero manual assist popup -> submit activation eligible.
