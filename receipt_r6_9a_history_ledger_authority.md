# [ANTIGRAVITY][RECEIPT][extension-form-sender][R6.9A HISTORY LEDGER AUTHORITY + OUTCOME ACCURACY]

## 1. Executive Summary & Owner Decision Fulfillment
Per the owner directive for **R6.9A**, the persistent `HistoryStore` attempt ledger (`xpider_history_attempts`) is officially promoted to the **SINGLE SOURCE OF TRUTH** across the entire extension architecture. The previous architectural flaw where duplicate volatile in-memory counters (`campaignState.successCount`, `xpider_campaign_counters_v1`) reset to 1 during lifecycle events while persistent `HistoryStore` recorded 20 has been permanently eliminated. All UI counters, History panels, live monitors, and CSV exports are strictly derived from `getLedgerStats('currentRun')`.

---

## 2. Implementation HEAD & Parity Verification
- **Git Commit HEAD**: `343111e23c1ca23a7eb11e42d4b5c18b28300b75`
- **Branch**: `upgrade/phase-0-1`
- **100% SHA256 Build Parity Verified**:
  - `modules/history-store.js`: `0213BAFB6052F9E745FDE9826071314F3D3498BAFFB3C88D8E85CBA2056E303D` (MATCH)
  - `content-script.js`: `A1BB79750E537730F3EA38E8DF4B11B07C7DBF35F73A5915231BA0463931A8CA` (MATCH)
  - `background.js`: `1C23AA1B04B36755B8D1C1BA4CBDCBECD46F77282A93B053DECD39BEAC94BC87` (MATCH)
  - `popup.js`: `276AD69BB58DC69198DB4324BCE37A83A6C6DF6989CF00FF574879D2AF3419E8` (MATCH)
  - `popup.html`: `482CB03874731FB80F4AFE918E63F8C4E840CCE56B02D4BFCEE16F9E0D543004` (MATCH)

---

## 3. Deprecation of Duplicate Counter Sources & Ledger Authority
1. **Banned Manual Increments**: Removed standalone `campaignState.successCount++` and manual counter mutators in background orchestrator.
2. **Durable Scoping via `campaignRunId`**: Generated once on fresh campaign start (`run_<timestamp>_<random>`) and persisted to `xpider_active_campaign_run_id` and checkpoint snapshots. Preserved across pause, resume, and Service Worker restarts.
3. **Ledger-Derived Counters**: `getLedgerStats(scope, campaignRunId)` derives exact counts (`success`, `failure`, `unknown`, `timeout`, `skipped`, `paused`, `completed`).
4. **Startup Migration & Counter Reconciliation**: `hs.reconcileLegacyCounters()` evaluates persistent ledger attempts vs cached legacy counts. If a discrepancy exists, the ledger forcefully overwrites the stale cache and logs:
   `[COUNTER_RECONCILE] legacySuccess=X ledgerSuccess=Y action=LEDGER_WINS`
5. **Canonical Log Line**:
   `[LEDGER_STATS] scope=currentRun success=... failure=... unknown=... timeout=... skipped=...`

---

## 4. HistoryStore Schema & Settlement Decision Table
### Canonical Attempt Terminal Statuses:
- `CONFIRMED_SUCCESS`
- `DELIVERY_UNKNOWN`
- `FAILURE` (with `failureClass`: `PRE_SUBMIT`, `SUBMISSION_REJECTED`, `DISCOVERY_EXHAUSTED`, `SECURITY_BLOCKED`, `RUNTIME_ERROR`)
- `TIMEOUT_LOCAL`
- `TIMEOUT_GLOBAL`
- `SKIPPED` (Non-inquiry forms: newsletter, search, booking, login)
- `PAUSED_UNKNOWN` (In-flight submissions interrupted by user pause)

### Settlement Path:
`settleCanonicalAttempt(attemptId, terminalStatus, reason, evidence, extra)` is the atomic gateway. It records 18-field structured `outcomeEvidence` (`submitAttempted`, `submitEventSeen`, `physicalClickDispatched`, `networkCommitObserved`, `networkStatus`, `successNodeVisibleTransition`, `successTextTransition`, `ariaLiveSuccessTransition`, `formReset`, `formHidden`, `formReplaced`, `buttonSuccessState`, `thankYouUrlTransition`, `frameworkSuccessState`, `validationErrorTransition`, `serverErrorTransition`, `captchaRejected`, `confirmationStrength`, `evidenceTimestamp`).

---

## 5. Outcome Accuracy Upgrade: Dynamic Observation & Positive Signals
- Continuous `MutationObserver` on `document.body` tracking real-time DOM changes.
- **Dynamic Observation Window**:
  - Base: 8s
  - Extended: 20s if `submitEventSeen`, pending transport, button busy/loading, or active mutations
  - Max: 30s only while real transport/network pending
- **Pre-submit vs Post-submit Snapshot Comparison**: Verifies hidden-to-visible transitions, text mutations, aria-live notifications, and form replacement.
- Fail-closed boundary: Targets where `submitEvent` never fired (e.g. `khaskarate.com`) can never be upgraded to `DELIVERY_UNKNOWN` or `CONFIRMED_SUCCESS`.

---

## 6. Operator Visual Reconciliation
For retained uncertain tabs (`DELIVERY_UNKNOWN` / `PAUSED_UNKNOWN`):
- Action buttons in UI: `[Mark as Success]` / `[Mark as Failed]`
- Dispatches `RECONCILE_ATTEMPT_VISUAL` IPC to background.
- Atomically mutates the **same** attempt record in-place:
  - `priorStatus = 'DELIVERY_UNKNOWN'`
  - `status = 'CONFIRMED_SUCCESS'`
  - `confirmationStrength = 'OWNER_VISUAL'`
- No second attempt record created; no double-counting; UI immediately re-renders from ledger.

---

## 7. Automated Test Suite Results (20 / 20 PASS)
Suite file: `send_message_backup/test_history_ledger_authority_and_outcome_accuracy_r6_9a.js`
- Test 1: ledger Succeeded count is source of UI SUCCESS — **PASS**
- Test 2: legacy success cache mismatch -> ledger wins — **PASS**
- Test 3: pause/resume preserves campaignRunId and counts — **PASS**
- Test 4: service worker restart rebuilds counters from ledger — **PASS**
- Test 5: exactly one terminal attempt per started target — **PASS**
- Test 6: no direct success increment outside ledger settlement — **PASS**
- Test 7: delayed hidden success transition at 12s -> CONFIRMED_SUCCESS — **PASS**
- Test 8: aria-live success mutation -> CONFIRMED_SUCCESS — **PASS**
- Test 9: form replacement + positive confirmation -> CONFIRMED_SUCCESS — **PASS**
- Test 10: submitEvent-only after 20s -> DELIVERY_UNKNOWN — **PASS**
- Test 11: network commit without outcome -> DELIVERY_UNKNOWN — **PASS**
- Test 12: explicit validation error -> FAILURE — **PASS**
- Test 13: explicit server rejection -> FAILURE — **PASS**
- Test 14: non-inquiry -> SKIPPED, not FAILURE — **PASS**
- Test 15: owner visual UNKNOWN->SUCCESS updates same attempt exactly once — **PASS**
- Test 16: UI/History/CSV success counts identical — **PASS**
- Test 17: completed reconciliation (started = sum of all canonical outcomes) — **PASS**
- Test 18: five owner false-negative fixtures exercise delayed observer — **PASS**
- Test 19: khaskarate submitEvent=false cannot be upgraded merely by timeout — **PASS**
- Test 20: old valid HistoryStore attempts survive migration — **PASS**

**Result**: 20 / 20 PASSED (0 FAILED).
Regression suites (`test_owner_4h_runtime_remediation_r6_8.js`, `test_vision_submit_and_long_text_gate_r6_7.js`, `test_2captcha_pittsburghkarate_upgrade.js`): 100% PASS.

---

## 8. 3-Way Count Equality & Reconciliation Proof
```
HistoryStore currentRun CONFIRMED_SUCCESS === Live Progress SUCCESS === CSV CONFIRMED_SUCCESS
```
All three metrics strictly read `HistoryStore.getLedgerStats('currentRun').success`. Standalone volatile increments have been eliminated.

---

## 9. Evidence Artifacts
- **Package**: `evidence_r6_9a_history_ledger_authority.zip`
- **File Size**: `167,192 bytes`
- **SHA256**: `063E693DB65FAA1F65F776DBA2886E7225BFF8173D21A7401B0FD5ECD74F679C`
