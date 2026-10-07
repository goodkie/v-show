# XPIDER AutoForm Sender Pro — Owner Diagnostic Test Guide (TEST-ONLY)

> [!WARNING]
> **BUILD STATUS: TEST-ONLY / NOT RELEASE ACCEPTANCE / BULK = HOLD**  
> This build is explicitly for diagnostic verification of target serialization, form filling, and CAPTCHA state mechanics.  
> **DO NOT** run large/bulk campaigns (max 3–5 URLs only).

---

## 1. Package Inventory & Verification
- **Build ID:** `R6.9G.7-20261007-ATOMIC-PUMP-QUIESCENT-CAPTCHA`
- **Implementation HEAD:** `db15feb4cd86e08774bd0c0e5b4724c0af418e44`
- **Visible Badge in UI:** `TEST-ONLY R6.9G.7 [db15feb]`
- **Unpacked Extension Path:** `send_message_backup/build/extension`
- **ZIP Package:** `XPIDER_R6.9G.7_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
- **ZIP SHA-256:** `39f272105a8e096d299375d0c0ed568343a5869e492c2cc3408ff0415cc86f97`
- **File Manifest:** See [PACKAGE_INVENTORY_SHA256.txt](file:///E:/vivpr/ai/extension-form-sender/PACKAGE_INVENTORY_SHA256.txt)

---

## 2. Recommended 3–5 URL Diagnostic Scope
Run a small test of **3 to 5 URLs only**. If testing locally or against live endpoints:
1. `Target 1`: Simple Contact Form (verify form detection, field fill, and serialization).
2. `Target 2`: Form with CAPTCHA (verify Owner decision modal, responsiveness, and safe accounting).
3. `Target 3`: Secondary Contact Form (verify clean transition without leftover state).

---

## 3. What to Observe During the Test
1. **Target Serialization:**
   - Exactly **one** active target tab at a time (`maxConcurrent === 1`).
   - No next target starts before the prior target finishes its final cleanup.
2. **Form Discovery & Autofill:**
   - Contact form fields (Name, Email, Message) fill accurately.
   - Zero `TypeError` on clobbered DOM IDs (e.g. `formEl.id`).
3. **CAPTCHA Owner State:**
   - If CAPTCHA is detected, the Owner Decision modal appears.
   - Modal options ("Auto", "Manual", "Skip") respond cleanly without stale session drops.
4. **Provider Diagnostics:**
   - Provider failures are safely categorized (e.g., `ERROR_WRONG_USER_KEY`, `RATE_LIMIT`).
   - Fallback handoff never counts as false success.
5. **Counter Truth:**
   - Formula holds at all times:
     $$\text{COMPLETED} = \text{SUCCESS} + \text{FAILURE} + \text{TIMEOUT} + \text{UNKNOWN} + \text{SKIPPED}$$
     $$\text{TOTAL} = \text{COMPLETED} + \text{REMAINING}$$
6. **Stop / Pause Test:**
   - Press **Stop / Pause** during execution.
   - Verify that the target quiesces, checkpoint is saved, and **zero** late `TARGET FINAL` logs appear after summary.

---

## 4. One-Click Diagnostic Log Export Instructions
1. Open the XPIDER Extension Popup.
2. Ensure the top badge displays: `TEST-ONLY R6.9G.7 [db15feb]`.
3. In the diagnostic action bar at the top or bottom of the popup, click either:
   - **📋 Copy Diagnostic Report**: Copies the complete sanitized diagnostic JSON/text to clipboard.
   - **💾 Download Diagnostic TXT**: Downloads `xpider-diagnostic-report-<timestamp>.txt` directly.
4. The exported report contains:
   - `buildInfo` (buildId, implementationHead, module SHAs)
   - `campaignRunId`
   - Target start/final timestamps & URLs
   - Sanitized `attemptId` / `targetToken` (NO secrets or API keys)
   - Stage transitions & CAPTCHA ledger
   - Reconciled counters (`counters`, `outcomeHistogram`)
   - `maxConcurrentObserved`
