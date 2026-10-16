# XPIDER AutoForm Sender Pro — OWNER BETA

**Release Version:** `R6.9G.10.3.7.1.4.11-20261016-OWNER-BETA`  
**Channel:** `PRIVATE OWNER BETA — DEBUG TELEMETRY ENABLED`  
**Operating Model:** Private / Personal daily use. Rapid iterative defect fixes based on real execution logs.

---

## 1. Installation & Reloading

### For Google Chrome or Microsoft Edge:
1. Open the Extensions management page:
   - Chrome: Navigate to `chrome://extensions`
   - Edge: Navigate to `edge://extensions`
2. Enable **Developer mode** (toggle in the top-right corner on Chrome, left sidebar on Edge).
3. If previously installed:
   - Click the **Reload (🔄)** icon on the XPIDER AutoForm Sender Pro card.
4. If installing fresh:
   - Extract `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip`.
   - Click **Load unpacked** and select the `extension` folder.
5. Verify header badge:
   - Top Bar: `● PRIVATE OWNER BETA — DEBUG TELEMETRY ENABLED`
   - Subtitle Tag: `OWNER BETA R6.9G.10.3.7.1.4.11 [5a0e9830]`

---

## 2. How to Start a Normal Campaign

1. Open the XPIDER side panel or popup.
2. In the **Target URLs** input area:
   - Paste your target URLs (one URL per line, e.g. `https://example.com/contact`).
3. In the **Template** tab:
   - Enter your Sender Name, Email, Phone, Subject, and Inquiry Message.
   - Click **Save Template**.
4. Configure Execution Timing (optional):
   - Target Interval (default: 3000ms - 6000ms).
   - Form Fill Delay (default: 300ms).
   - Submit Delay (default: 1500ms).
5. Click **🚀 START CAMPAIGN**.
   - The engine will automatically open tabs, discover contact forms, classify fields, autofill data, solve CAPTCHAs, verify submissions, and record ledger outcomes.

---

## 3. How to Pause, Resume, or Stop

- **Pause Campaign:**
  - Click **⏸️ Pause** anytime.
  - The engine immediately pauses at a clean quiescent barrier, captures an exact checkpoint, and preserves remaining targets.
- **Resume Campaign:**
  - Click **▶️ Resume**.
  - The engine verifies network guards and resumes directly from the saved checkpoint without restarting from scratch.
- **Stop Campaign:**
  - Click **⏹️ Stop**.
  - Closes active campaign tabs safely, flushes the final History/Ledger, and resets in-flight timers.

---

## 4. How to Export the Owner Debug Bundle (One-Click)

When running a campaign or after encountering an unexpected behavior:
1. Locate the **Diagnostic Actions Bar** above the live log container in the popup.
2. Click **📦 EXPORT OWNER DEBUG BUNDLE**.
3. A complete ZIP archive will download automatically:
   - Filename: `XPIDER_DEBUG_<buildId>_<timestamp>.zip`
4. The bundle automatically includes:
   - `XPIDER_DEBUG_REPORT.txt` (Full human-readable timeline and event trace)
   - `runtime_logs.json` (Complete array of raw diagnostic events)
   - `sanitized_settings.json` (Sanitized settings snapshot with zero leaked secrets)
   - `campaign_state.json` (Live campaign counters, targets, and CAPTCHA state)
   - `error_and_retry_summary.json` (Summary of errors and retries)
   - `history_ledger.json` (Exact historical execution records)
   - `build_provenance.json` (Build ID, Git SHA, and module integrity hashes)
   - `owner_debug_bundle.json` (Master consolidated JSON report)

---

## 5. What to Send Back When a Defect Occurs

If a form fails to submit, a CAPTCHA gets stuck, or unexpected behavior occurs:
1. **Click `📦 EXPORT OWNER DEBUG BUNDLE`** immediately.
2. Provide:
   - The exported `XPIDER_DEBUG_*.zip` file.
   - The specific target URL where the failure occurred.
   - A brief note on what happened (e.g. "form reported required field missing" or "Turnstile timed out").
3. Because **Ultra-Diagnostic Mode is DEFAULT-ON**, the bundle contains all required trace domains (`[BOOT]`, `[BUILD_HANDSHAKE]`, `[CAMPAIGN_START]`, `[FIELD_CLASSIFY]`, `[TURNSTILE_*]`, `[SUBMIT_TRIGGERED]`, `[HISTORY_FINAL]`, `[LEDGER_STATS]`) with all secrets, passwords, and tokens 100% sanitized.

---

## 6. Rollback Guarantee

If critical regressions are encountered, the extension can be rolled back to:
- **Rollback Anchor:** `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point:** `31b929c35eb52aba782181ba83e79a7196c51337`
