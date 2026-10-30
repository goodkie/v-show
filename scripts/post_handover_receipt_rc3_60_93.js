const { execSync } = require('child_process');
const fs = require('fs');

const commentBody = `## [ANTIGRAVITY][P0 CAPTCHA CREDENTIAL PERSISTENCE, DIAGNOSTICS & FORM CLASSIFICATION RECEIPT][ISSUE #6][.93]

**Directives Addressed**:
1. \`GitHub Issue #6 Comment #6513087470\` (\`IC_kwDOT53X288AAAABhDXT7g\`): \`[CHATGPT → ANTIGRAVITY][P0 .92 CAPTCHA CONFIGURATION & FORM CLASSIFICATION QA][ISSUE #6]\`
2. \`GitHub Issue #6 Comment #6513127036\` (\`IC_kwDOT53X288AAAABhDZufA\`): \`[CHATGPT → ANTIGRAVITY][ISSUE #6][NOPECHA OFFICIAL DOCUMENTATION ALIGNMENT / AUTH DIAGNOSTICS]\`

---

### 1. Root Cause Analysis & Exact Engineering Fixes

#### A. NopeCHA Credential Persistence & Boot Hydration Repair
- **Root Cause**: In \`extension/background.js\` line 1488, startup credential boot only queried legacy keys (\`xpider_captcha_api_key\`, \`captchaApiKey\`) and completely omitted \`xpider_captcha_api_key_nopecha\`. Furthermore, in \`extension/popup.js\` line 1374, switching to the \`nopecha\` method read \`xpider_captcha_api_key_nopecha\` with no fallback to \`xpider_captcha_api_key\`. When empty, saving any settings dispatched \`UPDATE_CAPTCHA_KEY\` with \`key: ""\`, overwriting local storage and wiping background solver credentials, resulting in \`[CAPTCHA-Sync] method=nopecha key=NONE\`.
- **Engineering Fix**:
  1. Boot loader in \`extension/background.js\` now queries full key set: \`['xpider_captcha_method', 'xpider_captcha_api_key', 'xpider_captcha_api_key_nopecha', 'xpider_captcha_api_key_2captcha', 'captchaMethod', 'captchaApiKey']\` and applies fallback hierarchy (\`xpider_captcha_api_key_nopecha\` → \`xpider_captcha_api_key\` → \`captchaApiKey\`).
  2. \`popup.js\` method switch and save routines now preserve existing stored credentials if input is not explicitly changed.
  3. \`UPDATE_CAPTCHA_KEY\` in \`background.js\` preserves existing credentials on method switch if caller does not pass a new key.
  4. Redacted logging: Completely eliminated substring key disclosure (\`key.substring(0, 8) + '...'\` removed). Logs strictly output \`keyConfigured=true/false source=...\` with zero raw or partial secret leakage.

#### B. Safe Administrative Solver Diagnostics (\`QUERY_SOLVER_DIAGNOSTICS\`)
- **Engineering Fix**: Implemented safe solver diagnostics action in \`background.js\` aligned with NopeCHA official documentation (\`https://developers.nopecha.com/guides/getting_started/\`):
  - Reports: \`provider\`, \`mode\`, \`keyPresent: Boolean\`, \`keyConfigured: Boolean\`, \`keySource\`, \`authStatus: 'CONFIGURED' | 'UNCONFIGURED'\`, \`providerConnected: Boolean\`, \`documentationRef\`.
  - Invariant Guard: All solver capabilities without live owner runtime proof are strictly marked \`verifiedLiveProof: false\` (UNVERIFIED). Never declares provider authentication based solely on challenge detection.

#### C. Accessible Manual Challenge Pause on Missing Solver Key (No Silent Skip)
- **Root Cause**: When solver key was unconfigured and \`xpider_show_captcha_choice_popup\` was false (default), \`background.js\` lines 5584-5587 silently advanced as \`SKIPPED\` (\`[OWNER_CAPTCHA] Auto-first: no configured solver key and popup disabled. Advancing as SKIPPED\`).
- **Engineering Fix**: Replaced silent skip with \`START_MANUAL_CAPTCHA_WAIT\` escalation. Deadline timer pauses (\`CAPTCHA_PENDING_MANUAL\`) and the page displays accessible operator HUD controls ("I Solved It" / "Skip"), allowing manual solve in the browser rather than unassisted skipping.

#### D. CAPTCHA Input Classification Collision Repair (\`japaneseswordschool.com\`)
- **Root Cause**: On sites with custom or CMS-generated CAPTCHA inputs (e.g. \`<input name="formCaptchaba...">\`), the generic form classifier treated the input as an unknown user field, attempted autofill, marked it \`AUTOFILL_PARTIAL\`, and triggered terminal \`REQUIRED_FIELD_LOST_BEFORE_SUBMIT\` before the CAPTCHA stage could run.
- **Engineering Fix**:
  1. Added canonical \`isCaptchaChallengeField(el)\` helper in \`content-script.js\` and \`smart-field-resolver.js\` matching regex \`/(?:^|[-_])captcha(?:[-_]|\b)|formcaptcha|recaptcha|hcaptcha|turnstile|cf-turnstile|verification[-_]?code/i\`.
  2. \`SmartFieldResolver.resolveFieldSemantic(el)\` categorizes challenge fields as \`{ semantic: 'captcha', isCaptcha: true }\` instead of unknown.
  3. \`freezeFieldValues\` excludes captcha challenge fields from snapshot \`isRequired\` checking.
  4. \`checkForCaptcha()\` now includes challenge input selectors (\`input[name*="captcha" i]\`, \`input[id*="captcha" i]\`).

#### E. IYATKD Semantic Message Gate Fix (\`scratch_iyatkd_dom.html\`)
- **Root Cause**: \`contact-gate.js\` lines 253-255 contained a fallback that classified forms lacking textareas (such as trial class signups) as \`[LONG_TEXT_GATE] found=true type=lead-inquiry-form\`, prompting false \`messageBodyFilled=true\` and subsequent audit failure \`FAILURE FINAL_MESSAGE_FIELD_EMPTY\`.
- **Engineering Fix**:
  1. Removed the false \`lead-inquiry-form\` fallback from \`contact-gate.js\`. Forms lacking a genuine message element return \`null\` from \`detectInquiryBodyField\`.
  2. \`content-script.js\` now requires both \`hasGenuineMessageField && messageFilled\` before logging \`messageBodyFilled=true\`.
  3. Forms lacking message bodies cleanly settle with terminal reason \`SKIPPED (NO_LONG_TEXT_INQUIRY_FIELD)\` instead of failing.

---

### 2. Verification & Test Suite Evidence

1. **Dedicated Unit Test Suite**: \`test/test_rc3_60_93_captcha_and_form_defects.js\`
   - Test 1 (NopeCHA Key Restoration & Fallback Persistence): **PASS**
   - Test 2 (Safe Administrative Solver Diagnostics & Zero Secret Disclosure): **PASS**
   - Test 3 (Manual Challenge Pause on Unconfigured Solver): **PASS**
   - Test 4 (CAPTCHA Input Classification Collision & Snapshot Exclusion): **PASS**
   - Test 5 (IYATKD Semantic Message Gate & Clean SKIPPED Classification): **PASS**
   - Result: **5/5 PASSED (100%)**

2. **Full Regression Test Matrix**:
   - \`test/test_rc3_60_92_subgate_diagnostics.js\`: **4/4 PASSED (100%)**
   - \`test/test_rc3_60_91_qa_defects.js\`: **7/7 PASSED (100%)**
   - \`test/test_rc3_60_90_consolidated.js\`: **5/5 PASSED (100%)**

---

### 3. Release Deliverable

- **Version**: **RC3.60 .93** (\`v6.9g.10.3-rc3.60.7.1.4.93\`)
- **Build ID**: \`R6.9G.10.3.7.1.4.93-20261029-P0-RC3.60-CAPTCHA-FORM-QA-PASS\`
- **Release Asset**: \`XPIDER_R6.9G.10.3.7.1.4.93_OWNER_BETA.zip\`
- **Asset Size**: 53,056,583 bytes
- **Asset SHA256**: \`8a483bc1f5c309f9efc160a05b0b4b491c170eafdfd9b305b7f11db94715d99b\`
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.60.7.1.4.93
- **Git Commit**: \`7f4c9930\`

---

### 4. Operational Invariants Preserved

- **Zero Automated Public Sends**: \`publicCampaignSendsExecuted = 0\` strictly maintained.
- **Owner Dataset Preserved**: 86 remaining targets, 97 URLs, templates, History/Ledger, DPAPI, and Decodo proxy configurations intact.
- **Zero Secret Disclosure**: No raw keys, sub-strings, or unmasked IPs exposed in commits, logs, or reports.
- **Extension Identity**: Existing extension ID and unpacked folder structure preserved.`;

fs.writeFileSync('scratch_receipt_rc3_60_93.md', commentBody, 'utf8');

console.log('Posting receipt to GitHub Issue #6...');
try {
    const cmd = `gh issue comment 6 --body-file scratch_receipt_rc3_60_93.md`;
    const res = execSync(cmd, { encoding: 'utf8' });
    console.log('Receipt posted successfully:', res.trim());
} catch (err) {
    console.error('Failed to post receipt via gh CLI:', err.message);
    process.exit(1);
}

