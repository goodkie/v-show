# XPIDER AutoForm Sender Pro — Release Notes R6.9G.10.3.5.1
**Phase**: `R6.9G.10.3.5.1 TRUE SUBMIT PRIVACY BARRIER + END-TO-END CALL-SITE ACCEPTANCE`  
**Tag**: `v6.9g.10.3-audit.5`  
**Authority Directive**: ChatGPT Audit [#6064594150](https://github.com/goodkie/v-show/issues/6#issuecomment-6064594150)  
**Date**: 2026-10-08  

---

### 1. Release Commits & Lineage
- **Functional Commit**: `b8d1fab8190bb991c69d67c44a3ab1c1a5b766dd` (`b8d1fab8`)
- **Provenance Commit**: `273bb0ca1ba64b7fe3a41091ce56c8667e38dd8d` (`273bb0ca`)
- **Build ID**: `R6.9G.10.3.5.1-20261008-SUBMIT-PRIVACY-BARRIER-END-TO-END`
- **Previous Functional Restore Point**: `4ef7def9689cdf4c508651e2f6bee6b320e7ab8e`
- **Immutable Rollback Base**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`

---

### 2. Verified Release Assets & Digests
1. **Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: `4,346,879` bytes
   - SHA-256: `06a5adfa522362ff3f64fbc25a436b9ada933ccacf90aa79ed1f369e6b378cac`

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_5_1_real_runtime_traces.log`
   - Size: `9,596` bytes
   - SHA-256: `04084472f1e003454096c3f6ef4e60ac5310102b488140af77f6dddb367ffd70`

---

### 3. Key Remediations & Technical Implementation

#### A. Authoritative Fail-Closed SUBMIT Privacy Barrier (Blocker 3)
- Implemented `ASSERT_PRIVACY_TRANSPORT_READY` handler in `background.js` validated via `validateActiveExecution(request, sender, 'ASSERT_PRIVACY_TRANSPORT_READY', { checkEpoch: true, allowBodyTabId: true })`.
- Wired synchronous check in `content-script.js` immediately following `SUBMIT_ATTEMPT_STARTED` ACK and before verifier preparation or state touching.
- Added defense-in-depth barrier inside `SubmitExecutorR5.execute()` guarding native button, custom ARIA submit, `form.requestSubmit()`, `form.submit()`, and keyboard Enter.
- Prevented vision fallback when submit outcome is `PRIVACY_GATEWAY_BLOCKED_BEFORE_SUBMIT`.
- Preserved pre-submit certainty in `background.js` `finish()`: classified as `isPreSubmitFailure=true` (never `DELIVERY_UNKNOWN`), logged `[PRIVACY_SUBMIT_BLOCK]`, and auto-paused campaign fail-closed.

#### B. Real Edge Gate 5 Real Protected Operation Halt (Blocker 4)
- Post-proxy drop test now invokes actual protected runtime operation `scanContactPaths('http://127.0.0.1:8980/test-proxy-drop-sniper', 99999)` in background.
- Proved `scanContactPaths` returns `[]`, records privacy block, and target server receives zero new requests (2 before, 2 after).

#### C. Real Edge Gate 6 Child-Frame Execution & Exact captchaEpoch (Blocker 6)
- Injected and executed delivered `solver-content.js` in a real Edge child frame.
- Verified live `GET_ACTIVE_EXECUTION_IDENTITY` resolution of canonical identity before detector triggers.
- Verified exact `captchaEpoch: 1` matching, single request latch per attempt/epoch, suppression of repeated detector ticks, idempotent counters (`detected=1, pendingOwner=1`), and terminal freeze on stale epoch.

#### D. Real Edge Gate 7 Real Call-Site Coverage (Blocker 5)
- Exercised the 5 actual integrated execution paths when gate is unready:
  1. `PRE_TARGET_BARRIER`: pre-target scheduler halts without queue advance
  2. `SNIPER_FETCH`: `scanContactPaths` returns `[]` with zero fetch probes
  3. `TARGET_TAB_CREATION`: `processNextCampaignTarget` blocks before tab create
  4. `CANDIDATE_NAVIGATION`: `tryNext` candidate navigation blocks
  5. `SUBMIT_BARRIER`: `ASSERT_PRIVACY_TRANSPORT_READY` blocks, withholding submit activation

#### E. SHA Discrepancy Corrections for Prior Records (Blocker 2)
- Corrected prior R6.9G.10.3.5 full SHAs:
  - FUNCTIONAL: `bc7cf341509abed93bcb6c85bcc375b3a28b3c1e`
  - PROVENANCE: `744eba392c68b08392a4ed2afb92b473ce7948b1`
  - RELEASE-METADATA/TAG TARGET: `f5a9df12fd1c0df8f03f3084875f1b512cc16b1c`
  - STATE ADVANCE: `62994cde56e559c880c0b9876d5f82abf85d3a6a`
  - AUTHORITY CURSOR: `30ce9c48b83f4daf67c136080c1a7835b8ab883a`
