const { execSync } = require('child_process');
const fs = require('fs');

const receiptBody = `## [ANTIGRAVITY → OWNER / CHATGPT][RECEIPT][Issue #6][ROLLBACK COMPLETE — CODE RESTORED TO EXACT IMMUTABLE PRE-RC12 RC11 (20678ada)]

**Authority Directive Reference**:
- \`[OWNER DIRECTIVE — EXECUTE CODE ROLLBACK TO EXACT PRE-RC12 RC11][Issue #6][2026-10-31]\` (Comment #876 / \`IC_kwDOT53X288AAAABhet9-w\`)

---

### 1. Execution Summary
Per explicit Owner Directive, all RC12–RC16 development has been halted, and XPIDER application code has been rolled back byte-for-byte to the exact, immutable **v7.0.0-rc11** baseline.

| Item | Rollback Specification | Verified Value |
|---|---|---|
| **Target Version** | \`v7.0.0-rc11\` | \`v7.0.0-rc11\` |
| **Functional Commit** | \`20678ada\` | \`20678ada6491bf842ec7e996a88108152c76007f\` |
| **Release ZIP** | \`XPIDER_V7.0.0_RC11_DUAL_MODE_OWNER_BETA.zip\` | SHA256: \`46a1470c80249466f79a3a4fe5599976593d99fd52f945b87add876f1b787a54\` (51,693,297 bytes) |
| **Pinned Chrome Extension ID** | \`ldlijlaccfeelfdhgnjbibniocefckjj\` | Preserved strictly |
| **Chrome Loaded Unpacked Path** | \`XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA\\extension\` | In-place overwritten with pure RC11 files |
| **Git Working Tree Path** | \`extension/\` | Synchronized with pure RC11 files |
| **RC16 Code Backup Path** | \`backups/PRE_ROLLBACK_RC16_CODE_BACKUP_2026-10-31T09-39-25-904Z/extension\` | Full backup preserved (28 root items) |
| **Chrome Profile / LevelDB** | **Untouched** | 0 deletes, 0 migrations, 0 schema mutations |
| **Infrastructure & Proxies** | Companion, Native Host, Proxy Relay, DigitalOcean, Decodo | Untouched |

---

### 2. Hash Parity Verification (50 / 50 Files Matching)
Every file in the Owner-loaded folder and git repository was verified against the pristine extracted release package \`XPIDER_V7.0.0_RC11_DUAL_MODE_OWNER_BETA.zip\`:
- \`manifest.json\`: \`40b86e4776f52f7f1bdb48cbc92cb9a90ae9c184d78ad2915e413cf6bfb23c7d\` (MATCH)
- \`popup.html\`: \`5ee236618d36371720ee289f6bbfe7bb064c502579dfd9627e3660341bfe1204\` (MATCH)
- \`popup.js\`: \`756f7ef5bf3b3c378e907d72e7a177264871e4cb8ca281fe9c9519ae7e33e46c\` (MATCH)
- \`background.js\`: \`f9f63f15b03d7c7641650d61f723bcef532825704ac66039cda6c98b0cb3b4a0\` (MATCH)
- \`content-script.js\`: \`3df12cdff54dc4556553d523e4f060b06183caf33a7ca2493d7e3c83505d95b8\` (MATCH)
- \`modules/build-provenance.js\`: \`7f58b04b1a5bc60c29eb47d6c2defdd8e7289d767a0be018cb7dfc4d8f9fc3ad\` (MATCH)
- Total extension files checked: **50 / 50 (100% SHA256 parity)**.

---

### 3. Provenance & Contract Assertions
- **Manifest Version**: \`7.0.0\`
- **Build ID**: \`V7.0.0-RC11-20261030-THREE-MODE-CONTRACTS-PASS\`
- **Implementation Head**: \`20678ada\`
- **Channel**: \`OWNER_BETA_V7_DUAL_MODE\`
- **Tag**: \`v7.0.0-rc11\`
- **Test Suite Results**:
  - \`node test/test_v7_rc11_contracts.js\`: **53 / 53 Assertions Passed (100% PASS)**
    - Target Max Wait Setting & Hold Timer Suspension: PASS
    - Auto-Fill Form Now Action (Never Submits): PASS
    - Header vs HUD Mode Synchronization: PASS
    - Complete In-App CAPTCHA Solver Retirement: PASS
    - Genuine Message Field Requirement: PASS
    - Pause -> Resume Mode Adoption & Target Preservation: PASS
    - Template Tab Per-Field Copy Buttons: PASS
    - Canonical Ledger 7-Bucket Reconciliation: PASS

---

### 4. Git Synchronization
- **Branch**: \`major/v7-dual-mode\`
- **Commit**: \`7aebe005\` (\`revert: rollback application code to exact immutable v7.0.0-rc11 per Owner Directive #876\`)
- **Remote Push**: \`origin/major/v7-dual-mode\` up to date.

---

### 5. Next Action for Owner
1. Open \`chrome://extensions\`.
2. Locate **XPIDER AutoForm Sender Pro** (Pinned ID: \`ldlijlaccfeelfdhgnjbibniocefckjj\`).
3. Click the circular **Reload (🔄)** icon once.
   *(Do NOT click Remove, do NOT click Load unpacked — the exact installed path \`XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA\\extension\` has already been overwritten in-place).*
4. Open the side panel and confirm the header badge reads:
   **\`OWNER BETA V7.0.0-RC11 [20678ada]\`**

🟪
`;

fs.writeFileSync('scratch_rollback_rc11_receipt.md', receiptBody, 'utf8');

console.log('Posting receipt to Issue #6...');
try {
    const cmd = `gh issue comment 6 --body-file scratch_rollback_rc11_receipt.md --repo goodkie/v-show`;
    const res = execSync(cmd, { encoding: 'utf8' });
    console.log('Successfully posted receipt:', res);
} catch (e) {
    console.error('Failed to post receipt:', e.message);
    process.exit(1);
}
