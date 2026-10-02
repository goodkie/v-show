# [ANTIGRAVITY][RECEIPT][extension-form-sender][R4.1 ROOT URL + TRUE LIST RESET]

## 1. Executive Summary & Root Cause Analysis

### Incident Overview
Following the deployment of R4 candidate path hygiene, root URLs (such as `https://seichoukarate.com/` or `https://example.com/`) were rejected upfront by the internal URL validator before candidate discovery could execute, producing errors:
```text
[DISC] Invalid candidate ignored: https://seichoukarate.com/ EMPTY_SLUG_PATH: /
```
This regression halted queue processing on all root domains because candidate discovery assumed the target root domain itself was an empty slug path. Furthermore, per-tab list clear operations suffered from UI-only resets that left background stores intact or lacked an authoritative centralized registry. Polling / `GET_STATE` cycles also repeatedly emitted checkpoint restore logs.

### Root Cause Analysis & Resolutions Implemented

1. **Root URL Regression (`isMeaningfulContactPath`):**
   - **Root Cause:** In [contact-discovery-engine.js](file:///e:/vivpr/ai/extension-form-sender/send_message_backup/modules/contact-discovery-engine.js) and [background.js](file:///e:/vivpr/ai/extension-form-sender/send_message_backup/background.js), `isMeaningfulContactPath(url)` evaluated `clean === '/' || clean === ''` as invalid candidate paths (`EMPTY_SLUG_PATH`). This prevented the extension from ever opening the initial target root URL.
   - **Fix:** Restored root homepage paths (`/` and `""`) as valid navigation targets:
     ```javascript
     if (!clean || clean === '/' || clean === '') {
       return true; // Root URLs are valid targets for initial load & discovery
     }
     ```
     Strict rejection is preserved exclusively for synthetic extension-only generated paths (`/(^|\/)\.(html?|php|asp|aspx)$/i`).

2. **Circuit Breaker on Internal Validator Rejection:**
   - **Design:** If an internal navigation validator trips on a source URL (`isSourceUrl(targetUrl)`), the campaign must **not** silently drop or burn through targets.
   - **Fix:** In [background.js](file:///e:/vivpr/ai/extension-form-sender/send_message_backup/background.js), tripping on the source URL immediately triggers the `CORE_NAVIGATION_VALIDATOR_BROKEN` circuit breaker, pauses the campaign, updates state, and logs an alert.

3. **Authoritative Per-Tab Clear & Storage Erasure:**
   - **Design:** Implemented the centralized `LIST_DATA_KEYS` schema across both [background.js](file:///e:/vivpr/ai/extension-form-sender/send_message_backup/background.js) and [popup.js](file:///e:/vivpr/ai/extension-form-sender/send_message_backup/popup.js):
     - **Auto-Form Queue:** `campaignQueue`, `campaignActive`, `campaignState`, `campaignTargetUrl`, `savedQueue`
     - **History & Ledger:** `form_submission_history`, `form_submission_index`, `form_submission_generations`, `form_history_ledger`, `xpider_current_generation`
     - **Diagnostics:** `diagnosticLogs`, `xpider_system_logs`, `crash_dump_register`
     - **Email Collector:** `collected_emails`, `email_export_cache`
   - **Physical Erasure:** Each tab's clear button (`clearCampaignQueue`, `ledger-clear-btn`, `clearDiagnosticLog`, etc.) sends an authoritative message to background (`CLEAR_AUTOFORM_DATA`, `CLEAR_HISTORY_DATA`, `CLEAR_DIAGNOSTICS_DATA`, `CLEAR_EMAIL_COLLECTOR_DATA`), physically wiping persistent storage (`chrome.storage.local.remove`), resetting `HistoryStore.clearAll()`, and updating UI counters to `0`.

4. **Dedicated "RESET ALL LIST DATA" Emergency Action:**
   - **UI Integration:** Added a high-visibility control in [popup.html](file:///e:/vivpr/ai/extension-form-sender/send_message_backup/popup.html) (Header Action + Settings Emergency section) with a safety confirmation modal.
   - **Owner Confirmation Copy:** Exactly prompts:
     > *"This will permanently erase all queued targets, submission history, diagnostic logs, and collected emails. Your message templates and API keys will NOT be deleted. Do you want to proceed?"*
   - **Key Preservation Guarantee:** Message templates (`xpider_template*`, `templates`), API keys (`xpider_stt_api_key`, `captchaApiKey`), and UI configuration (`xpider_lang`, `theme`, etc.) are strictly excluded and never wiped.

5. **Checkpoint Restore Spam Fix:**
   - **Fix:** Added hydration idempotency guards (`restorationLogged` and `checkpointHydratedForGeneration`) to `restoreCampaignState()`. Routine polling and `GET_STATE` calls no longer trigger redundant `Restored paused campaign checkpoint` log spam.

---

## 2. Git Checkpoint & Commit Record

- **Commit SHA:** `49b7786`
- **Branch:** `upgrade/phase-0-1`
- **Commit Message:** `fix(core): restore root url validity, implement circuit breaker and true per-tab list reset [Issue #6 R4.1]`

---

## 3. Byte & SHA-256 Parity Proof (100% Binary Match)

| File | Source Size | Build Size | Source SHA-256 | Build SHA-256 | Parity Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `background.js` | 149337 bytes | 149337 bytes | `0f275dcbdc545d1bdbdb374678928f08bbe4991ed0c08af60f364a7d320e8d91` | `0f275dcbdc545d1bdbdb374678928f08bbe4991ed0c08af60f364a7d320e8d91` | **EXACT MATCH** |
| `popup.js` | 170794 bytes | 170794 bytes | `7561466d3732be62edac999403a4ecd52d85ccf8aed3d67d880566d66aebd01f` | `7561466d3732be62edac999403a4ecd52d85ccf8aed3d67d880566d66aebd01f` | **EXACT MATCH** |
| `popup.html` | 40114 bytes | 40114 bytes | `fdcb5eadc576154b10f2c3931734ef48020e472c36a2f7cd118be6bd17ac72a1` | `fdcb5eadc576154b10f2c3931734ef48020e472c36a2f7cd118be6bd17ac72a1` | **EXACT MATCH** |
| `content-script.js` | 188672 bytes | 188672 bytes | `007aed428a11d5b367c76beb336040c8d43aaa8bb6afbcb6250102c239e64014` | `007aed428a11d5b367c76beb336040c8d43aaa8bb6afbcb6250102c239e64014` | **EXACT MATCH** |
| `manifest.json` | 1534 bytes | 1534 bytes | `a5997023c62fbf1d5a041e53888739e39c4df8236801c1b85464e5e3cdca9eb3` | `a5997023c62fbf1d5a041e53888739e39c4df8236801c1b85464e5e3cdca9eb3` | **EXACT MATCH** |
| `modules/contact-discovery-engine.js` | 47635 bytes | 47635 bytes | `caa1c41a3372980a5d5f58b653fb498eac564c027cbb0a33cccddd95e5b897cc` | `caa1c41a3372980a5d5f58b653fb498eac564c027cbb0a33cccddd95e5b897cc` | **EXACT MATCH** |
| `modules/history-store.js` | 45606 bytes | 45606 bytes | `90eb5c64524419f23dcd9c2d309890ed1a101a4ec5a6b6e1f023d5568f2653fc` | `90eb5c64524419f23dcd9c2d309890ed1a101a4ec5a6b6e1f023d5568f2653fc` | **EXACT MATCH** |
| `modules/email-collector.js` | 11228 bytes | 11228 bytes | `b5b3156679b532bf124a021b6a636073f119db2189ba41d498933447f3325c42` | `b5b3156679b532bf124a021b6a636073f119db2189ba41d498933447f3325c42` | **EXACT MATCH** |
| `modules/template-store.js` | 23045 bytes | 23045 bytes | `d6e04e18cd6673d09380fa4983f0e696d837b16d73f62ca3e32bfe49034d1b64` | `d6e04e18cd6673d09380fa4983f0e696d837b16d73f62ca3e32bfe49034d1b64` | **EXACT MATCH** |
| `modules/operation-queue.js` | 1470 bytes | 1470 bytes | `e1f5f540a714b200176980cda6c28a5062e8d3011d52f0aefede86bbb31530ab` | `e1f5f540a714b200176980cda6c28a5062e8d3011d52f0aefede86bbb31530ab` | **EXACT MATCH** |
| `solver-content.js` | 29228 bytes | 29228 bytes | `a44ef0dad5989c59956132329cadb800eaf2c450d921e381cfbb152420d172c5` | `a44ef0dad5989c59956132329cadb800eaf2c450d921e381cfbb152420d172c5` | **EXACT MATCH** |

---

## 4. Acceptance Test Results

### Suite: `test_root_url_and_clear_r4_1.js` — 22 / 22 PASS (100%)
```text
=== [R4.1 ROOT URL & TRUE LIST RESET ACCEPTANCE SUITE] ===

  ✅ PASS: R4.1-1: Root URL with trailing slash is recognized as valid
  ✅ PASS: R4.1-2: Root URL without trailing slash is recognized as valid
  ✅ PASS: R4.1-3: Root URL relative path '/' is recognized as valid
  ✅ PASS: R4.1-4: Synthetic empty extension slug '/.html' is rejected
  ✅ PASS: R4.1-5: Synthetic empty extension slug '/.php' is rejected
  ✅ PASS: R4.1-6: Valid deep page path '/contact' is recognized as valid
  ✅ PASS: R4.1-7: Valid deep page path '/about/contact.html' is recognized as valid
  ✅ PASS: R4.1-8: validateCandidateUrl permits valid root target
  ✅ PASS: R4.1-9: Circuit breaker triggers if source URL is rejected by validator
  ✅ PASS: R4.1-10: LIST_DATA_KEYS registry is complete across all four list domains
  ✅ PASS: R4.1-11: History clear empties storage, resets index, and zeros generations
  ✅ PASS: R4.1-12: Auto-form queue clear empties queue, active flag, and campaign state
  ✅ PASS: R4.1-13: Diagnostics clear empties logs and dumps
  ✅ PASS: R4.1-14: Email collector clear empties collected emails and export cache
  ✅ PASS: R4.1-15: RESET ALL LIST DATA clears all four list stores atomically
  ✅ PASS: R4.1-16: RESET ALL LIST DATA preserves templates and API settings
  ✅ PASS: R4.1-17: Checkpoint restoration is idempotent and logs only once per generation
  ✅ PASS: R4.1-18: UI Auto-Form clear button triggers CLEAR_AUTOFORM_DATA
  ✅ PASS: R4.1-19: UI History clear button triggers CLEAR_HISTORY_DATA
  ✅ PASS: R4.1-20: UI Diagnostics clear button triggers CLEAR_DIAGNOSTICS_DATA
  ✅ PASS: R4.1-21: UI Reset All Lists modal confirms with exact copy and triggers RESET_ALL_LIST_DATA
  ✅ PASS: R4.1-22: 100% byte-for-byte binary parity between source and build

=== SUITE COMPLETE: 22 PASSED, 0 FAILED ===
```

### Full Regression Verification Across Prior Suites:
- **`test_runtime_recovery_r4.js`**: 25 / 25 PASSED (100%)
- **`test_runtime_correctness_r3.js`**: 21 / 21 PASSED (100%)

---

## 5. Deliverable Artifact Details

- **Unpacked Chrome Extension Path:**
  `E:\vivpr\ai\extension-form-sender\send_message_backup\build\extension\`
- **Evidence Archive File:**
  `evidence_root_url_and_clear_r4_1.zip`
- **Archive Size:**
  `158,940 bytes`
- **SHA-256 Digest:**
  `fd887f6306cfef4a898320ea626e0830c659430d25cd2e4b7ed5ba81b9a3c313`
