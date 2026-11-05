# XPIDER AutoForm Sender Pro — Current State

## Identity
- Protocol: OCA-DEV-1.4
- Project ID: xpider-autoform-sender-pro
- Workspace: E:\vivpr\ai\extension-form-sender
- Authority: goodkie/v-show Issues #6 & #10
- Branch: candidate/p0-core-regressions-v7 (candidate branch isolated; base major/v7-dual-mode remains 100% frozen RC11 20678ada)
- Candidate Head: 302ed1b193639eb52897c249e1096142a992e0ae
- State Rev: 2026-11-04.601
- Authority Cursor: IC_kwDOT53X288AAAABi08e7A (Responding to ChatGPT Directive [INDEPENDENT SOURCE AUDIT / P0 CORRECTIVE DIRECTIVE] Comment #908 / ID 6632185580)
- Canonical Schedule Revision: 5
- Collaboration Mode: Manual ChatGPT ↔ Antigravity Collaboration restored per Owner Directive.
- Verification Status: HOLD (Awaiting independent ChatGPT Code Audit). Release HOLD maintained. Zero external public submissions.

---

## 1. Directive #6632185580 Root Cause Analysis & Candidate Remediations

### A. Checkpoint `campaignMode` & `xpider_campaign_mode` Contradiction
- **Root Cause**:
  1. When resuming a campaign in `MANUAL` mode after a pause, `resumeCampaignOrchestrator` never removed `xpider_paused_checkpoint` from storage.
  2. If the Service Worker was terminated while running, `restoreCampaignState()` saw the uncleaned checkpoint from the earlier pause (which held `campaignMode="AUTO"`), while `xpider_campaign_mode` was `"MANUAL"`.
  3. No explicit message handler existed for updating mode bidirectionally in storage and memory simultaneously.
- **Remediation**:
  1. `extension/background.js` (line 7373): Added `await chrome.storage.local.remove(['xpider_paused_checkpoint']);` upon campaign resume.
  2. `extension/background.js` (line 4411): Added `SET_CAMPAIGN_MODE` message handler updating runtime `campaignState.campaignMode`, `campaignState.pausedCheckpoint.campaignMode`, `xpider_campaign_mode`, and storage `xpider_paused_checkpoint.campaignMode`.
  3. `extension/background.js` (line 9820): In `restoreCampaignState()`, unified effective mode reconciliation between `data.xpider_paused_checkpoint.campaignMode` and `data.xpider_campaign_mode`.
  4. `extension/popup.js` (line 9031): In `checkResumableCheckpoint()`, updated popup's `currentCampaignMode = stateResp.pausedCampaignMode || stateResp.campaignMode;`.

### B. Historical Outcome Leakage into Fresh Campaigns
- **Root Cause**:
  `campaignState.outcomeHistogram` was not reset on fresh campaign start (`startCampaignOrchestrator`), allowing counters from previous campaigns to leak across runs in the same worker session.
- **Remediation**:
  1. `extension/background.js` (line 6945): Explicitly initialized `campaignState.outcomeHistogram = {};` on fresh campaign start.
  2. `extension/background.js` (line 694): In `syncCampaignCountersFromLedger`, strictly calculated `campaignState.outcomeHistogram` from `hs.attempts.filter(a => a.campaignRunId === campaignState.campaignRunId)` using the HistoryStore ledger.

### C. MV3 Service Worker Boot Restoration Race Condition
- **Root Cause**:
  `restoreCampaignState()` was artificially delayed by `setTimeout(..., 500)` in `background.js`, allowing incoming messages and CDP queries during worker wake to read initial unhydrated memory.
- **Remediation**:
  1. `extension/background.js` (line 9969): Removed 500ms `setTimeout`; initiated `bootPromise = restoreCampaignState();` immediately on boot.
  2. `extension/background.js` (line 3013): Gated state-dependent message actions (`GET_STATE`, `GET_CAMPAIGN_STATE`, `GET_CAMPAIGN_MODE`, `SET_CAMPAIGN_MODE`, `RESUME_CAMPAIGN`, `STOP_AND_SAVE_CAMPAIGN`, `PAUSE_CAMPAIGN`, `START_CAMPAIGN`) behind `bootPromise`.

---

## 2. Reproduction Suite & Test Results
Created dedicated reproduction test `test/test_v7_directive_reproduction_suite.js`:
- Captured before-FAIL on unpatched candidate: `SW_RESTART_RESTORED_CAMPAIGN_MODE_MANUAL` failed with `swMode=AUTO` while `storageMode=MANUAL`.
- After candidate fixes: **14 / 14 assertions PASSED (Exit Code 0)**.

### Comprehensive Test Matrix (All 5 Suites Pass)
| Test Suite / Harness | Command | Assertions / Result | Status | Exit Code | Evidence Report |
|---|---|:---:|:---:|:---:|---|
| **Directive Reproduction & Verification Suite** | `node test/test_v7_directive_reproduction_suite.js` | 14 / 14 | **100% PASS** | **0** | `test/report_v7_directive_reproduction.json` |
| **Modes & Visible Controls E2E Suite** | `node test/run_chromium_v7_modes_and_visible_controls_suite.js` | 32 / 32 | **100% PASS** | **0** | `test/report_v7_modes_and_visible_controls.json` |
| **Item C & Dynamic React E2E Suite** | `node test/run_chromium_v7_item_c_contact_and_dynamic_message.js` | 22 / 22 | **100% PASS** | **0** | `owner-extension-test-site/evidence/evidence_v7_item_c_contact_and_dynamic_message_report.json` |
| **Real Mutant Sensitivity Harness** | `node test/run_v7_real_mutant_sensitivity.js` | 4 / 4 Mutants Killed | **100% SENSITIVE** | **0** | `owner-extension-test-site/evidence/evidence_v7_real_mutants_report.json` |
| **Unified SC-03 & SC-04 Suite** | `node test/run_chromium_v7_task3_and_task4_suite.js` | All Invariants Pass | **100% PASS** | **0** | `owner-extension-test-site/evidence/evidence_v7_task3_and_task4_report.json` |

---

## 3. Baselines & Guardrails
- **Candidate Branch**: `candidate/p0-core-regressions-v7` (head: `302ed1b1`).
- **Base Branch**: `major/v7-dual-mode` remains 100% frozen (RC11 `20678ada`).
- **Release Hold**: Active; zero external public submissions. Localhost `127.0.0.1:8088` fixtures only.
- **External Extension Contract**: Full retirement of built-in CAPTCHA solver code verified.
