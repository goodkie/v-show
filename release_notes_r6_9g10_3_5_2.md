# XPIDER AutoForm Sender Pro — R6.9G.10.3.5.2 Exact-Release Child-Frame + Actual Call-Site Acceptance

### Authority & Governance
- **Issue**: goodkie/v-show Issue #6 (Addressing ChatGPT Directive [#6065381739](https://github.com/goodkie/v-show/issues/6#issuecomment-6065381739))
- **Branch**: `upgrade/phase-0-1`
- **Functional HEAD**: `b8d1fab8190bb991c69d67c44a3ab1c1a5b766dd` (`b8d1fab8`)
- **Provenance HEAD**: `273bb0ca1ba64b7fe3a41091ce56c8667e38dd8d` (`273bb0ca`)
- **Release Metadata HEAD (v6.9g.10.3-audit.5)**: `6b325d26fd753df4f51194979551e99e61d8de97` (`6b325d26`)
- **Immutable Rollback Anchor**: `dc0740a0c69e2f7fa96b6989841acf0831b3619e`
- **Previous Functional Restore Point**: `4ef7def9689cdf4c508651e2f6bee6b320e7ab8e`

### Release Package Assets & Verification Digests
1. **Preserved Unified Diagnostic Package (ZIP)**:
   - File: `XPIDER_R6.9G.10.3_OWNER_DIAGNOSTIC_TEST_ONLY.zip`
   - Size: 4,346,879 bytes
   - SHA-256: `06a5adfa522362ff3f64fbc25a436b9ada933ccacf90aa79ed1f369e6b378cac`
   - Exact bytes preserved untouched across audit.5 and audit.5.1 releases.

2. **Real Microsoft Edge Runtime Evidence Traces (LOG)**:
   - File: `evidence_r6_9g10_3_5_2_real_runtime_traces.log`
   - Size: 15,481 bytes
   - SHA-256: `fa3db33f515e4a76163d39eb7d6482fb002b2e808d78a511cbee59c97e4fd638`

### Acceptance & Verification Summary (100% PASS)
1. **Blocker 1 (Exact Release ZIP Binding)**:
   - Exact ZIP bytes (4,346,879 bytes, SHA-256: `06a5adfa...`) verified before test.
   - Extracted to fresh temp directory.
   - Microsoft Edge loaded ONLY from extracted extension path.
   - Live service worker asserted `buildId === 'R6.9G.10.3.5.1-20261008-SUBMIT-PRIVACY-BARRIER-END-TO-END'` and `headShort === 'b8d1fab8'`.
2. **Blocker 2 (Delivered Child-Frame Solver Execution)**:
   - Delivered `solver-content.js` executed inside child iframe.
   - `XpiderSolverContent` instantiated in child frame.
   - Solver loop autonomously queried `GET_ACTIVE_EXECUTION_IDENTITY`, resolved `attemptId: 'att_audit_exact_release_999'`, `captchaEpoch: 1`.
   - Extracted sitekey `6Le-wvkSAAAAAPBMRTvw0Q4CeBcv1LOPIqdo0ORW` and autonomously emitted `OWNER_CAPTCHA_REQUEST`.
   - 1-request latch suppression verified across 6 detector intervals (`recordedCount=1`, `ledgerDetected=1`, `ledgerPending=1`).
   - Stale epoch test (`captchaEpoch: 99`) returned `epoch_mismatch` with `isTerminal=true` terminal freeze.
3. **Blocker 3 (5 Actual Execution Path Call-Sites Exercised)**:
   - Pre-target scheduler (`processNextCampaignTarget` with queued target): queue did not advance (`queueLength=1`), `isFaulted=true`, 0 network requests.
   - Sniper fetch (`scanContactPaths`): returned `[]` (0 candidates), 0 network requests.
   - Target tab creation (`orchestrateSending` tab create): `safeTabs.create` blocked, tab count delta = 0, 0 network requests.
   - Candidate navigation (`CANDIDATE_NAVIGATION` barrier): candidate navigation blocked, tab not navigated, 0 network requests.
   - Submit barrier (`ASSERT_PRIVACY_TRANSPORT_READY`): fail-closed submit block, logged `[PRIVACY_SUBMIT_BLOCK]`, campaign paused fail-closed.
4. **Blocker 4 (State Capsule SHA Correction)**:
   - Recorded exact 40-character commit hashes from `git rev-parse`.
