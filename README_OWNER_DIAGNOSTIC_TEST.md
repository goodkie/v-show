# XPIDER AutoForm Sender Pro — Owner Diagnostic Test Guide (TEST-ONLY)

> [!WARNING]
> **BUILD STATUS: TEST-ONLY / NOT RELEASE ACCEPTANCE / BULK = HOLD**  
> This build is explicitly for diagnostic verification of target serialization, form filling, and CAPTCHA state mechanics.  
> **DO NOT** run large/bulk campaigns (max 3–5 URLs only).

---

## 1. Package Inventory & Verification
- **Build ID:** `R6.9G.9.2-20261007-STRICT-EGRESS-PROXY-AUTH`
- **Implementation HEAD:** `0730794dfa6908a4cf9bafb4705f1e16c410bc8d`
- **Visible Badge in UI:** `TEST-ONLY R6.9G.9.2 [0730794d]`
- **Unpacked Extension Path:** `send_message_backup/build/extension`
- **ZIP Package:** `XPIDER_R6.9G.9.2_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
- **ZIP SHA-256:** `56dae801d8154640b43b5b2be23729d67cfd09642ab007aecaae9c0c9d542cd2`
- **File Manifest:** See [PACKAGE_INVENTORY_SHA256.txt](file:///E:/vivpr\ai\extension-form-sender\PACKAGE_INVENTORY_SHA256.txt)

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
