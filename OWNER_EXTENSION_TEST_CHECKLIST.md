# XPIDER AutoForm Sender Pro — Owner Extension Functional Test Checklist

**Release Baseline**: `v6.9g.10.3-audit.7.1.4.1`  
**Functional HEAD**: `97aa7dfa0647f221e248da963987241d41196568`  
**ZIP SHA-256**: `c2ab9f049b9784e023db10811043c496548c2741d0b3424911bcf7d336b3a44d`  
**Test Mode**: Local Controlled Extension Functional Test (Pre-Opal Hardware)  
**Test Site Server**: `http://127.0.0.1:8088` (Launched via `START_TEST_SITE.bat`)  
**Input Test URL List**: `OWNER_EXTENSION_TEST_URLS.csv`

---

## 1. Quick Start Instructions for Owner

1. **Start Local Test Site**: Double-click `START_TEST_SITE.bat` in the project root. A black console window will open showing `XPIDER CONTROLLED TEST SITE SERVER RUNNING AT http://127.0.0.1:8088`. Keep it open during testing.
2. **Open Extensions in Microsoft Edge or Google Chrome**:
   - In Edge: Navigate to `edge://extensions`
   - In Chrome: Navigate to `chrome://extensions`
   - Turn **Developer mode** toggle **ON** (top-right or bottom-left).
3. **Load Unpacked Extension**:
   - Click **[Load unpacked]**.
   - Select the exact folder: `E:\vivpr\ai\extension-form-sender\extension`
   - Verify extension card appears: `XPIDER AutoForm Sender Pro v1.2.0` with badge `TEST-ONLY R6.9G.10.3`.
4. **Open XPIDER Extension UI**:
   - Click the extension icon in browser toolbar or sidebar to open the XPIDER panel.
5. **Import Test URLs & Execute**:
   - Click the upload area and select `OWNER_EXTENSION_TEST_URLS.csv`.
   - Verify 7 URLs are parsed and loaded.
   - Click **[Start Sending]**.
   - Observe automated execution across tabs.

---

## 2. Functional Test Checklist (Mark [x] on PASS)

### A. Lifecycle & UI Initialization
- [ ] **Extension loads**: Unpacked extension loads into Edge/Chrome without manifest or syntax errors.
- [ ] **Popup opens**: Side panel / popup UI renders cleanly with premium dark theme and active tabs (Campaign, Message Template, History & Ledger, Email Collector).
- [ ] **Settings save**: Opening ⚙️ Settings, modifying a field (e.g. Language or Delay), and clicking [Save Settings] persists properly.
- [ ] **Email Extractor tab works**: Switching to "Email Collector" tab renders counters (Current Site, All Emails) and action buttons (Copy, Export CSV/TXT, Clear).

### B. Campaign Import & Control Flow
- [ ] **CSV loads**: Dropping or selecting `OWNER_EXTENSION_TEST_URLS.csv` displays `7 URLs found` in file-info badge.
- [ ] **Start works**: Clicking [Start Sending] transitions state to running and reveals Pause, Stop & Save, End Campaign buttons.
- [ ] **Tabs open**: Browser opens controlled test tab sequentially for each URL without crashing.
- [ ] **Pause works**: Clicking [Pause] halts execution gracefully on current target boundary.
- [ ] **Resume works**: Clicking [Resume] continues campaign from the paused index without duplicating targets.
- [ ] **Stop works**: Clicking [End Campaign] stops campaign immediately and finalizes batch status.
- [ ] **Reset clears state**: Clicking [⚠️ Reset All Lists] or [Clear List] resets loaded URLs and queue back to clean 0 state.
- [ ] **Re-run works**: Importing CSV a second time allows starting a clean new campaign from scratch.

### C. Form Recognition & Auto-Fill Fidelity
- [ ] **Contact page discovery works**: Navigating to `index.html` autonomously discovers `/contact-standard.html` via semantic nav/footer links and redirects to the form.
- [ ] **Standard form auto-fill works**: `contact-standard.html` fields (Name, Email, Phone, Subject, Message) are recognized and filled accurately.
- [ ] **Submit click works**: Primary submit button is identified and clicked natively.
- [ ] **Success detected**: Success confirmation banner (`Thank you! Your message has been sent successfully.`) is detected and commits SUCCESS.
- [ ] **Dropdown works**: `contact-dropdown-checkbox.html` department dropdown `<select>` is populated with a valid option choice.
- [ ] **Checkbox/TOS works**: `contact-dropdown-checkbox.html` mandatory terms checkbox is checked before submission.
- [ ] **Numeric field works**: `contact-numeric.html` numeric seat input is populated with a valid generated integer.

### D. Intent Filtering & Negative Boundary Protection
- [ ] **Subscribe without message is skipped**: `subscribe-no-message.html` (pure newsletter capture) is identified as non-inquiry form and skipped (`SKIPPED`), NOT false SUCCESS.
- [ ] **Booking without message is skipped**: `booking-no-message.html` (table booking without inquiry textarea) is identified and skipped (`SKIPPED`), NOT false SUCCESS.
- [ ] **No-contact page fails cleanly**: `no-contact-page.html` (informational article without forms) exhausts candidate paths and commits clean failure (`FAILED`), NOT false SUCCESS.

### E. Authority Counters & Audit Ledger
- [ ] **Counters update correctly**: Status area increments SUCCESS, SKIPPED, FAILED, and COMPLETED matching actual results.
- [ ] **No negative REMAINING**: REMAINING counter strictly decrements and stops at 0 (never negative).
- [ ] **No stuck PREPARING loop**: Every target transitions deterministically to terminal state (SUCCESS, SKIPPED, or FAILED).
- [ ] **No premature tab close**: Tab remains open until form submission and outcome settlement are committed.
- [ ] **History/Ledger records correct URLs/status**: "History & Ledger" tab lists every attempted URL with exact status badge and timestamp.

### F. Privacy / Physical Gate Safety (Pre-Opal Verification)
- [ ] **Physical Gate toggle displays FAIL-CLOSED/BLOCKED**: In ⚙️ Settings -> Physical Router Gate, toggling ENABLE while Opal hardware is absent immediately shows `GATE READY: BLOCKED / UNVERIFIED` with reason `NON_OPAL_GATEWAY` or `PHYSICAL_GATE_FAIL_CLOSED`, without breaking the local non-network campaign testing.

---

## 3. Results Summary Table

| Test Target URL | Form Characteristics | Expected Result | Actual Result (Owner) |
| :--- | :--- | :---: | :---: |
| `http://127.0.0.1:8088/contact-standard.html` | Standard contact fields | **SUCCESS** | [ ] PASS / [ ] FAIL |
| `http://127.0.0.1:8088/contact-dropdown-checkbox.html` | Select dropdown + TOS checkbox | **SUCCESS** | [ ] PASS / [ ] FAIL |
| `http://127.0.0.1:8088/contact-numeric.html` | Numeric field + Message | **SUCCESS** | [ ] PASS / [ ] FAIL |
| `http://127.0.0.1:8088/subscribe-no-message.html` | Email newsletter only (no message) | **SKIPPED** | [ ] PASS / [ ] FAIL |
| `http://127.0.0.1:8088/booking-no-message.html` | Date/time reservation (no message) | **SKIPPED** | [ ] PASS / [ ] FAIL |
| `http://127.0.0.1:8088/no-contact-page.html` | Blog article (zero forms) | **FAILED (Exhausted)** | [ ] PASS / [ ] FAIL |
| `http://127.0.0.1:8088/index.html` | Portal page with contact link | **SUCCESS (Discovered)** | [ ] PASS / [ ] FAIL |

**Final Verification Sign-Off**:
- All 7 Scenarios Verified: `[ ] PASS / [ ] FAIL`
- Ready for Real Opal Hardware Smoke: `[ ] READY / [ ] HOLD`
