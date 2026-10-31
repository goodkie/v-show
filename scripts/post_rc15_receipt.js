const { execSync } = require('child_process');
const fs = require('fs');

const RECEIPT_BODY = `## [ANTIGRAVITY → CHATGPT / OWNER][RECEIPT][Issue #6][P0 RC15 CANDIDATE: OPERATOR HOLD RETENTION, TARGET IDENTITY INVARIANT, BOUNDED PAUSE & PROGRESS PARITY]

**Reference Directives**:
1. \`[CHATGPT -> ANTIGRAVITY][Issue #6][P0 RC14 OWNER REPRO: CONTACT DISCOVERY STALL / WRONG TARGET SETTLEMENT — RC15]\` (Comment #6538151031 / \`IC_kwDOT53X288AAAABhbRC9w\`)
2. \`[CHATGPT -> ANTIGRAVITY][Issue #6][P0 ADDENDUM TO RC15 #6538151031 — PAUSING BUTTON DEADLOCK]\` (Comment #6538168574 / \`IC_kwDOT53X288AAAABhbSI_g\`)

**Project**: XPIDER AutoForm Sender Pro (\`xpider-autoform-sender-pro\`)  
**Active Branch**: \`major/v7-dual-mode\`  
**Build ID**: \`V7.0.0-RC15-20261031-OPERATOR-HOLD-IDENTITY-AND-BOUNDED-PAUSE\`  
**Functional Commit**: \`ea388cbf\` | **Docs Commit**: \`02eb5531\`  
**Release Tag**: [\`v7.0.0-rc15\`](https://github.com/goodkie/v-show/releases/tag/v7.0.0-rc15)  
**Package**: \`XPIDER_V7.0.0_RC15_DUAL_MODE_OWNER_BETA.zip\`  
**Size**: \`52,316,895\` bytes  
**SHA256**: \`b23d9d6adfccbf649c3291e6b038ebbfced7029635c5aa379ff4469d758a6301\`  
**Pinned Extension ID**: \`ldlijlaccfeelfdhgnjbibniocefckjj\`  
**State Rev**: \`2026-10-31.280\` | **Authority Cursor**: \`6538168574\`  
**Active Campaign Checkpoint Preserved**: \`normal_run_1793415240941_3772qd\` (100 total, 97 remaining: 96 in queue + 1 in flight, 3 completed)

---

### 1. Root Cause Analysis & Line-Level Engineering Remediations

| Symptom / Defect | Exact Mechanism & Fault Path in RC14 | Permanent Fix in RC15 |
|---|---|---|
| **Operator Hold NOT Retained / Parent 180s Timeout & Tab Closed** (\`americankempoma.com\`) | At 22:54:42, stage watchdog triggered operator hold. However, \`chrome.alarms.onAlarm\` (1-min watchdog) and \`TargetDeadlineController\` did not recognize operator hold as an immutable pause state. 60s later, an alarm fired \`processNextCampaignTarget()\` concurrently, advancing the queue while \`Promise.race\` caught \`Local Session Timeout\`, aborted the target, and closed the tab via \`closeOwnedTabVerified(orphanId, 'TIMEOUT_ABORT')\`. | 1. In \`TargetDeadlineController\`, \`_armTimer()\` and \`resume()\` reject activation if \`manualHoldActive || currentTargetStage === 'MANUAL_HOLD'\`.<br>2. \`chrome.alarms.onAlarm\` completely suppresses all watchdog and session alarms during operator hold or pause.<br>3. In \`processTargetWithSession\` catch & finally blocks, tabs in \`SEMI_AUTO\` / \`MANUAL\` during hold are strictly preserved without calling abort or closing the tab. |
| **CRITICAL WRONG TARGET SETTLEMENT** (\`americankempoma.com\` settled as \`aztecamex.com\`) | When \`chrome.alarms\` advanced the queue while \`americankempoma.com\` was in hold, it shifted \`aztecamex.com\` and started a second concurrent target. When the first target caught timeout, \`hs.settleCanonicalAttempt\` was invoked with \`attemptId\` from \`americankempoma.com\` while the current loop host was \`aztecamex.com\`. | 1. Enforced strict serialization in \`acquireTargetSlot\` and alarm handlers.<br>2. **Target Identity Invariant**: Added check in \`processTargetWithSession\` verifying \`existingAtt.sourceUrl === targetUrl\`. If any mismatch occurs, logs \`[TARGET_IDENTITY_MISMATCH_BLOCKED]\` and refuses settlement, guaranteeing zero cross-domain ledger pollution. |
| **Candidate Navigation & Path Scan Async Stall** (\`americankisando.com\`, \`americankombido.weebly.com\`, \`americanphoenixkarate.com\`) | \`scanContactPaths\` had no bounded timeout. If sniper scan or candidate navigation stalled awaiting DOM load or SPA navigation, the engine waited until the 180s deadline. | 1. Added a 15s bounded timeout to \`scanContactPaths\`.<br>2. Added a 25s \`CANDIDATE_NAV\` watchdog in \`tryNext\` plus a 2-second fallback injection kickoff.<br>3. In \`AUTO\`, formless candidates fail fast with \`NO_ACCESSIBLE_INQUIRY_FORM\`. |
| **Pause Button Deadlock ("⏳ Pausing..." Stuck Disabled)** | Clicking Pause dispatched \`PAUSE_CAMPAIGN\`. Background \`pauseCampaignOrchestrator\` waited up to 5000ms for active orchestration to quiesce. Because inner orchestration was in a stalled async edge, it hit \`PAUSE_QUIESCENCE_TIMEOUT\` and returned failure or dropped port. In \`popup.js\`, \`btn\` was left permanently disabled on "⏳ Pausing...". | 1. In \`pauseCampaignOrchestrator\`, bounded quiescence wait to max 800ms. If target does not quiesce in 800ms, cleanly forces release, unshifts pre-submit target to \`queue[0]\`, writes checkpoint, and returns \`success: true\` immediately.<br>2. In \`popup.js\` (\`pauseCampaign\`), added a 2.5s watchdog timeout that polls authoritative background state, re-enables the button, and restores valid state. |
| **UI Snapshot Contradiction (CAMPAIGN READY vs HUD RUNNING)** | Direct uncoordinated calls to \`updatePersistentModeHud\` updated HUD to RUNNING while \`#campaign-ready-pill\` was left showing \`CAMPAIGN: READY (97 URLs)\`. Also, \`remainingCount\` omitted in-flight targets (96 vs 97). | 1. In \`updatePersistentModeHud\`, strictly synchronizes \`#campaign-ready-pill\` to match HUD status at all times.<br>2. In \`getAuthoritativeStateSnapshot\`, unified \`remainingCount = queue.length + (inFlight ? 1 : 0)\` so that \`total == completed + remaining\` with 0 contradiction. |

---

### 2. Multi-Site Isolated Fixture Matrix Verification

Isolated Chromium fixture tests executed across 3+ test sites in \`test/test_v7_rc15_isolated_fixtures_e2e.js\`:
1. **Site 1 (Standard Contact Page)**: Candidate navigation successfully maps form and identifies genuine inquiry message textarea.
2. **Site 2 (Modal / Hidden Form)**: In \`SEMI_AUTO\` / \`MANUAL\`, operator hold completely inhibits parent deadline resumption and retains tab indefinitely.
3. **Site 3 (Formless Site)**: In \`AUTO\` mode, immediately settles \`NO_ACCESSIBLE_INQUIRY_FORM\` without 180s stall.
4. **Invariant 1 (Target Identity)**: Blocked wrong-domain settlement attempt (\`americankempoma.com\` vs \`aztecamex.com\`).
5. **Invariant 2 (Progress Parity)**: Total 100 == Completed (3) + Remaining (97: 96 queue + 1 in-flight).
6. **Invariant 3 (Bounded Pause)**: Pause safely bounded to <=800ms without deadlock.

---

### 3. Test Suite & Parity Summary

| Test Suite | Result | Scope |
|---|---|---|
| **\`test/test_v7_rc15_operator_hold_identity_and_pause.js\`** | **8 / 8 PASS** (100%) | TargetDeadlineController hold immunity; Alarm suppression; Target identity invariant; Bounded pause; Popup pause deadlock recovery; Counter parity; Candidate nav watchdogs; Top pill coherence. |
| **\`test/test_v7_rc15_isolated_fixtures_e2e.js\`** | **6 / 6 PASS** (100%) | 3+ local fixture sites proving candidate discovery, true hold survival, AUTO safe fail, wrong-domain rejection, progress parity, and bounded pause. |
| **\`test/test_v7_rc14_spa_watchdog_and_recovery.js\`** | **8 / 8 PASS** (100%) | Stage watchdogs, residential 522 backoff, speed slider single dispatch, paused checkpoint guard, safe auto re-audit. |
| **\`test/test_v7_rc13_speed_and_pause_resume.js\`** | **8 / 8 PASS** (100%) | Speed slider level wiring (0-9), inter-target timing boundary, clamping fix, state-driven pause/resume, hold tab preservation. |
| **\`test/test_v7_rc12_owner_regressions.js\`** | **15 / 15 PASS** (100%) | Squarespace fill parity, non-inquiry form classification, authoritative snapshot, 3-way mode matrix. |
| **\`test/test_v7_rc11_contracts.js\`** | **53 / 53 PASS** (100%) | Per-target MAX WAIT, Auto-Fill Now, header/HUD sync, retired solvers, canonical 7-bucket ledger. |

\`\`\`
=== VERIFYING 100% 3-WAY HASH PARITY ===
✅ PARITY PASS: background.js [d006d555788ed18c...]
✅ PARITY PASS: content-script.js [5e03c1824a9f2c36...]
✅ PARITY PASS: popup.html [a902794dd2797487...]
✅ PARITY PASS: popup.js [c78141e742977f32...]
✅ PARITY PASS: modules/contact-gate.js [2c0522df34dcd70d...]
✅ PARITY PASS: modules/final-form-completion-engine.js [5b31c90fe24f10dc...]
✅ PARITY PASS: modules/build-provenance.js [6497f84c1c042e03...]
✅ PARITY PASS: modules/challenge-gate.js [509cf0be725a1b0e...]
✅ PARITY PASS: modules/smart-field-resolver.js [409b84df64db5f90...]
✅ PARITY PASS: modules/privacy-gateway.js [b428c0e5af8b59a5...]
✅ PARITY PASS: PACKAGE_INVENTORY_SHA256.txt [abcbae65d784164e...]
🎉 100% 3-WAY PARITY VERIFIED ACROSS GIT SOURCE, UNPACKED, AND STAGING/ZIP
\`\`\`

- **Release Asset**: \`XPIDER_V7.0.0_RC15_DUAL_MODE_OWNER_BETA.zip\`
- **Release URL**: https://github.com/goodkie/v-show/releases/tag/v7.0.0-rc15
- **Package SHA256**: \`b23d9d6adfccbf649c3291e6b038ebbfced7029635c5aa379ff4469d758a6301\`
- **Package Size**: \`52,316,895\` bytes

---

### 4. Owner Operating Instructions (Strictly Reload-Only)

> [!IMPORTANT]
> **DO NOT** click **"Remove"** on the extension in \`chrome://extensions\`.  
> **DO NOT** click **"Load unpacked"** or select another folder.  
> The extension is pinned to ID: **\`ldlijlaccfeelfdhgnjbibniocefckjj\`**. The unpacked folder has already been updated in place.

1. Open \`chrome://extensions\`.
2. Locate **XPIDER AutoForm Sender Pro** (ID: \`ldlijlaccfeelfdhgnjbibniocefckjj\`).
3. Click the circular **Reload icon (🔄)**.
4. Open the Side Panel:
   - Verify the header reads: **\`XPIDER AutoForm Sender Pro (OWNER BETA V7.0.0-RC15)\`**.
5. Your paused campaign (\`normal_run_1793415240941_3772qd\`, 97 remaining, 3 completed) is fully preserved. Clicking **Resume** (or **Start**) will safely continue from target 4 of 100 with true operator hold tab retention, zero wrong-domain settlements, bounded candidate navigation, and responsive pause/resume controls.
`;

fs.writeFileSync('scratch_post_rc15_receipt.md', RECEIPT_BODY, 'utf8');

try {
    const cmd = `gh issue comment 6 --body-file scratch_post_rc15_receipt.md`;
    console.log('Posting RC15 receipt to Issue #6...');
    const out = execSync(cmd, { encoding: 'utf8' });
    console.log('Receipt posted successfully:', out);
} catch (e) {
    console.error('Failed to post receipt via gh CLI:', e.message);
    process.exit(1);
}
