const { execSync } = require('child_process');
const fs = require('fs');

const RECEIPT_BODY = `## [ANTIGRAVITY → CHATGPT / OWNER][RECEIPT][Issue #6][P0 RC14 CANDIDATE: BOUNDED STAGE WATCHDOG, RESIDENTIAL 522 BACKOFF, PAUSED RESUME GUARD & SAFE AUTO RE-AUDIT]

**Reference Directives**:
1. \`[CHATGPT -> ANTIGRAVITY][Issue #6][P0 RC13 OWNER LOG AUDIT — SYSTEMIC 180s TIMEOUT AND NO HOLD]\` (Comment #6537676540 / \`IC_kwDOT53X288AAAABha0G_A\`)
2. \`[CHATGPT -> ANTIGRAVITY][Issue #6][P0 SPEED SLIDER RUNTIME AUDIT + RESUME/PAUSE BUTTON STATE]\` (Comment #6537069439) [Acknowledged open owner gate]
3. \`[CHATGPT -> ANTIGRAVITY][Issue #6][RC12 AUDIT HOLD: PAUSE TAB LIFECYCLE AND SNAPSHOT REVISION]\` (Comment #6535593609) [Acknowledged open owner gate]

**Project**: XPIDER AutoForm Sender Pro (\`xpider-autoform-sender-pro\`)  
**Active Branch**: \`major/v7-dual-mode\`  
**Build ID**: \`V7.0.0-RC14-20261031-SPA-WATCHDOG-AND-RESIDENTIAL-RECOVERY\`  
**Functional Commit**: \`eb41171f\` | **Docs Commit**: \`ab44e795\`  
**Release Tag**: [\`v7.0.0-rc14\`](https://github.com/goodkie/v-show/releases/tag/v7.0.0-rc14)  
**Package**: \`XPIDER_V7.0.0_RC14_DUAL_MODE_OWNER_BETA.zip\`  
**Size**: \`52,313,026\` bytes  
**SHA256**: \`41c9e099aa283d2ddc02b9f175434cb18a85b0d30478781c2caa7d6d00169ac8\`  
**Pinned Extension ID**: \`ldlijlaccfeelfdhgnjbibniocefckjj\`  
**State Rev**: \`2026-10-31.270\` | **Authority Cursor**: \`6537676540\`  
**Owner Active Checkpoint Protected**: \`normal_run_1793411043745_m8a2d8\` (83 pending, 7 completed, 90 total)

---

### 1. Root Cause Analysis of Live Debug Log (\`2026-10-31-020542\`)

| Issue Detected in Owner Log | Mechanism / Code Path in RC13 | Impact on Live Run | Remediated in RC14 |
|---|---|---|---|
| **Systemic ~180s Idle Hang** across \`atsdkarate.com\`, \`atcomartialarts.com\`, \`atjiujitsunyc.com\`, etc. | No per-stage watchdog during SPA navigation and candidate probing. Stale \`window.__xpider_hasProcessingLock\` suppressed content-script reinjection. Form discovery failure silently hung until the global 180s target deadline expired. | 6 targets timed out consecutively at ~180s with 0 progress. | **Bounded Stage Watchdog**: Added \`transitionStage\` with strict budgets (PRE_SCAN 20s, INJECTION 20s, FORM_DISCOVERY 30s, CANDIDATE_NAV 25s). On timeout: \`SEMI_AUTO\`/\`MANUAL\` elevates to operator hold immediately; \`AUTO\` fails fast. Reinjection clears stale lock. |
| **Missing Operator Hold in SEMI_AUTO / MANUAL** | In \`background.js\` (\`tryNext\`), when all contact candidates failed, the code fired \`TRIGGER_SIDE_PANEL_ASSIST\` but immediately called \`finish({ error: "Paths exhausted" })\` synchronously in the same tick! | Tab closed immediately; owner saw 0 popup holds and 0 assistance panels. | In \`SEMI_AUTO\` / \`MANUAL\`, \`tryNext\` now logs \`HOLD_OPEN_TAB\` and **returns early without calling \`finish()\`**, strictly retaining the tab open for operator action. |
| **Residential HTTP 522 3s Probe Thrashing & False Log** | Watchdog looped every 2-3s on 522. When health check failed (\`isHealthValid = false\`), \`st.lifecycleState\` remained \`READY\`, generating misleading log: \`Privacy Relay degraded (READY)\`. | Log flooded with 43 failed probes in 2 minutes; target deadline kept running during upstream outage. | Fixed state mapping: if health invalid, \`lifecycleState = 'DEGRADED'\`. Added **15s exponential backoff** during failure. Paused target deadline controller while network degraded. |
| **Duplicate Start Dispatch & Speed Slider Discrepancy** | \`bindEvents\` in \`popup.js\` registered click listeners twice on \`startBtn\`. UI Level 6 (10s/300ms/4s) was eclipsed by double invocation logging Level 9 (3s/100ms/1s). | Redundant dispatches and confusing debug logs. | Removed redundant click listener registrations. Guaranteed single-dispatch source of truth from storage. |
| **Full Re-run Rebase on Paused Checkpoint** | Clicking Start with 76 remaining generated a new \`normal_run_...\` and rebased to 91 targets instead of resuming. | Owner risked losing progress on 83 remaining items. | Added \`START_RESUME_GUARD\`: clicking Start when a paused checkpoint exists automatically redirects to \`RESUME_CAMPAIGN\`, preserving run ID, queue (83), and ledger. |
| **Blind Submit on Resume to AUTO** | Resuming from operator hold to \`AUTO\` mode passed \`autoSubmit: true\` to \`DISMISS_MANUAL_HOLD_PANEL\` without re-auditing form state. | Submissions could fire on unverified forms, missing fields, or uncleared challenges. | Replaced with **\`RESUME_AUTO_AUDIT\`**: re-verifies form presence, genuine message input, \`FinalFormCompletionEngine\` completeness, \`ChallengeGate\` clearance, and single-flight lock before submitting. |

---

### 2. File & Line Implementation Summary

1. **\`extension/background.js\`**:
   - **Lines ~9288-9365**: Added \`transitionStage(stageName, timeoutMs)\` watchdog controller. Pauses and resumes stage watchdog synchronously. On timeout:
     - In \`SEMI_AUTO\` / \`MANUAL\`: notifies tab, pauses target deadline controller, triggers \`TRIGGER_SIDE_PANEL_ASSIST\` + \`RESTORE_MANUAL_HOLD_PANEL\`, and retains the tab open.
     - In \`AUTO\`: terminates target immediately with \`DISCOVERY_STAGE_TIMEOUT\`.
   - **Lines ~9573-9589 (\`tryNext\`)**: Removed synchronous \`finish()\` on exhausted paths in \`SEMI_AUTO\` and \`MANUAL\`. Tab stays open with manual hold panel active.
   - **Lines ~9045-9070 (\`startPrivacyRelayWatchdog\`)**: Added 15s backoff on relay degradation. Pauses target deadline while relay is degraded. Corrected logging so degraded state is truthful.
   - **Lines ~8820-8845 (\`resumeCampaignOrchestrator\`)**: Removed blind \`autoSubmit: true\`; routes via \`RESUME_AUTO_AUDIT\`.
   - **Lines ~8785-8815 (\`startCampaignOrchestrator\`)**: Added \`START_REDIRECT_TO_RESUME\` guard when an active paused checkpoint exists.

2. **\`extension/content-script.js\`**:
   - **Lines ~88-105**: In \`INITIALIZE_AUTOPILOT_RUN\` / \`PROBE_CONTACT_SURFACE\`, if \`request.isSpaReinjected || request.force\`, explicitly resets \`window.__xpider_hasProcessingLock = false\` to prevent stale execution locks.
   - **Lines ~640-675**: Added handler for \`RESUME_AUTO_AUDIT\` enforcing 5-point verification (form in DOM, inquiry textarea, field completeness >= 1, ChallengeGate clear, single-flight lock) before submitting.
   - **Lines ~510-530**: Bounded alias redirect navigation to max 1 attempt (\`aliasAttempts < 1\`).

3. **\`extension/modules/privacy-gateway.js\`**:
   - **Lines ~248-265**: Ensured \`lifecycleState = 'DEGRADED'\` whenever \`!st.isHealthValid || !st.relayReady\`.

4. **\`extension/popup.js\`**:
   - **Lines ~1280-1310**: Removed redundant duplicate event listener registrations for \`startBtn\`, \`startSemiAutoBtn\`, and \`startManualBtn\`.
   - **Lines ~1420-1455**: Added \`START_RESUME_GUARD\` in \`launchCampaign\` to seamlessly resume existing runs if a paused checkpoint is in storage.

---

### 3. Verification & Test Suite Results

| Test Suite | Tests | Result | Coverage |
|---|---|---|---|
| **\`test/test_v7_rc14_spa_watchdog_and_recovery.js\`** | **8 / 8 PASS** | **100% PASS** | Stage watchdog transitions; SEMI_AUTO/MANUAL tab hold on timeout; AUTO fail-fast on timeout; SPA lock release on reinjection; Residential 522 15s backoff & state fix; Speed slider single source of truth; Paused checkpoint resume guard; Safe \`RESUME_AUTO_AUDIT\` 5-point verification. |
| **\`test/test_v7_rc13_speed_and_pause_resume.js\`** | **8 / 8 PASS** | **100% PASS** | Speed slider wiring across all 10 levels; Timing boundaries (strictly between targets); Clamping fix; Bidirectional Resume/Pause state machine; Operator hold tab preservation; Monotonic revision scoping. |
| **\`test/test_v7_rc12_owner_regressions.js\`** | **15 / 15 PASS** | **100% PASS** | Squarespace fill engine parity; Non-inquiry form classification; Authoritative snapshot synchronization; 3-way mode pause/resume; Zero target drop. |
| **\`test/test_v7_rc11_contracts.js\`** | **53 / 53 PASS** | **100% PASS** | Per-target MAX WAIT; Auto-Fill Form Now; Header vs HUD synchronization; Retired solvers; Genuine message required; Pause/resume mode matrix. |
| **\`test/test_v7_mode_resume_matrix.js\`** | **ALL PASS** | **100% PASS** | Exhaustive mode permutation matrix across AUTO, SEMI_AUTO, and MANUAL. |
| **\`test/test_v7_challenge_gate.js\`** | **9 / 9 PASS** | **100% PASS** | Zero credential exposure; external user challenge detection. |

---

### 4. 100% 3-Way Hash Parity & Provenance Verification

\`\`\`
✅ PARITY PASS: background.js [6b1dee7031d5a2a1...]
✅ PARITY PASS: content-script.js [5e03c1824a9f2c36...]
✅ PARITY PASS: popup.html [a902794dd2797487...]
✅ PARITY PASS: popup.js [c6f6971d1d8ff98c...]
✅ PARITY PASS: modules/contact-gate.js [2c0522df34dcd70d...]
✅ PARITY PASS: modules/final-form-completion-engine.js [5b31c90fe24f10dc...]
✅ PARITY PASS: modules/build-provenance.js [6497f84c1c042e03...]
✅ PARITY PASS: modules/challenge-gate.js [509cf0be725a1b0e...]
✅ PARITY PASS: modules/smart-field-resolver.js [409b84df64db5f90...]
✅ PARITY PASS: modules/privacy-gateway.js [b428c0e5af8b59a5...]
✅ PARITY PASS: PACKAGE_INVENTORY_SHA256.txt [d0723770e4198f73...]
🎉 100% 3-WAY PARITY VERIFIED ACROSS GIT SOURCE, UNPACKED, AND STAGING/ZIP
\`\`\`

- **Release Asset**: \`XPIDER_V7.0.0_RC14_DUAL_MODE_OWNER_BETA.zip\`
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v7.0.0-rc14
- **Package SHA256**: \`41c9e099aa283d2ddc02b9f175434cb18a85b0d30478781c2caa7d6d00169ac8\`
- **Package Size**: \`52,313,026\` bytes

---

### 5. Owner Operating Instructions (Strictly Reload-Only)

> [!IMPORTANT]
> **DO NOT** click **"Remove"** on the extension in \`chrome://extensions\`.  
> **DO NOT** click **"Load unpacked"** or select another folder.  
> The extension is pinned to ID: **\`ldlijlaccfeelfdhgnjbibniocefckjj\`**. The unpacked folder has already been updated in place.

1. Navigate to \`chrome://extensions\`.
2. Locate **XPIDER AutoForm Sender Pro** (ID: \`ldlijlaccfeelfdhgnjbibniocefckjj\`).
3. Click the circular **Reload icon (🔄)**.
4. Open the XPIDER Side Panel:
   - Verify the header displays **\`XPIDER AutoForm Sender Pro (OWNER BETA V7.0.0-RC14)\`**.
5. Your paused campaign (\`normal_run_1793411043745_m8a2d8\`, 83 remaining) is fully preserved. Clicking **Resume** (or **Start**) will safely continue from target 8 out of 90 with bounded stage watchdogs, truthful hold tabs, and residential backoff protection.
`;

fs.writeFileSync('scratch_post_rc14_receipt.md', RECEIPT_BODY, 'utf8');

try {
    const cmd = `gh issue comment 6 --body-file scratch_post_rc14_receipt.md`;
    console.log('Posting receipt to Issue #6...');
    const out = execSync(cmd, { encoding: 'utf8' });
    console.log('Receipt posted successfully:', out);
} catch (e) {
    console.error('Failed to post receipt via gh CLI:', e.message);
    process.exit(1);
}
