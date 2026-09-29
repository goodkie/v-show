# 3D2 / 3D2R PANORAMA FAST-TRACK RELEASE RUNBOOK
Date: 2026-09-28
Mode: PANORAMA_FAST_TRACK
Primary objective: Finish and confirm the stable PANORAMA_360 release as fast as possible without letting TRUE SPATIAL 3D block release.

---

## 0. Canonical Coordinates

### Stable / Release line
- Repository: `goodkie/v-show`
- Stable master baseline: `5218235b8dbe1cd3b401bbbdef0b1c8ba3483d6e`
- Customer default: `P2R13`
- Landing implementation: `2a003a1696368899cbb184528afffa797d1eb0b0`
- Official release candidate: `ab7c13f62aee54ab6f55dd4ffae08857db695949`
- `release/3d2r-landing-integration` = `ab7c13f...`
- `release/3d2r-official-live` = `ab7c13f...`
- `restore/3d2-official-release-2026-09-15` = `5218235...`
- `restore/3d2r-official-release-live-2026-09-18` = `ab7c13f...`

### Stage 2 / R&D line
- PR #5: OPEN / unmerged / base `master`
- PR #5 branch: `feature/3d2r-stage2-12point-capture`
- Current reviewed PR HEAD: `eea55d16519d3366b8e85df8f9adfd00460a7931`
- PR #5 is approximately 243 commits ahead of master with ~300 changed files.
- PR #5 MUST NOT be treated as the panorama release branch.

### Historical production evidence
- Historical Railway production deployment ID: `e7e7b0d1-6726-4cf9-ae9e-8d58dd82f0de`
- Historical deployed RC: `ab7c13f...`
- Historical release state recorded:
  - `PUBLIC_CUTOVER_EXECUTED=true`
  - `PUBLIC_RELEASE_STATUS=OFFICIALLY_RELEASED`
  - `CUSTOMER_DEFAULT=P2R13`

### Current unknown that must be revalidated
- Current live Railway deployed SHA
- Current live `CUSTOMER_DEFAULT`
- Current camera/capture/upload/panorama/viewer/share health
- Current auth / tenant-isolation health

---

# 1. Product / Scope Constitution

## Release target
`RELEASE_TARGET=PANORAMA_360`

## Explicitly NOT required for panorama release
- TRUE SPATIAL 3D positive fixture
- SPZ / PLY / mesh / splat promotion
- multi-position reconstruction
- Stage 2 spatial dataset adequacy
- WILO positive-fixture success
- Round 89–101 reconstruction evidence extensions
- new geometry algorithm
- 7C.3 / Perfection Track
- new seam tuning
- new neural model
- new capture engine unless a real P0 bug proves it necessary

## Core rule
`TRUE_SPATIAL_BLOCKER_IS_PANORAMA_RELEASE_BLOCKER=false`

## Release safety
- Do not merge PR #5 wholesale.
- Do not change `CUSTOMER_DEFAULT=P2R13`.
- Do not modify master merely to “clean up”.
- Do not change billing/customer data.
- Do not introduce unrelated refactors.
- Do not weaken security / tenant isolation.
- Do not call a panorama a spatial 3D model.

---

# 2. Roles

## ChatGPT / Codex
Responsible for:
- release scope and acceptance criteria
- evidence audit
- independent GitHub state comparison
- Gate decision: `PASS / FAIL / HOLD`
- approving whether a change is `RELEASE_REQUIRED`
- rejecting R&D leakage into the release cut
- final fast-track release decision

ChatGPT does NOT accept:
- Antigravity narrative PASS by itself
- synthetic device proof as physical proof
- code presence as runtime proof
- historical runtime proof as current runtime proof

## Antigravity
Responsible for:
- actual repository / runtime inspection
- exact SHA reporting
- executing tests
- collecting current runtime evidence
- physical-device E2E where required
- implementing only approved P0/P1 release fixes
- preparing minimal diffs
- rollback execution if a release-critical failure appears
- reporting raw evidence without self-approving the Gate

---

# 3. Fastest Possible Release Path

If ALL of the following are true:

1. Current live SHA = `ab7c13f...`
2. Current default = `P2R13`
3. Current panorama E2E passes
4. Auth + tenant isolation pass
5. No P0 / P1 blocker
6. Rollback references remain valid

Then:

**NO NEW RELEASE CODE IS REQUIRED.**

Action:
- mark release line `GREEN`
- preserve PR #5 as post-release/R&D
- continue monitoring stable panorama release

If current live SHA differs:
- identify exact diff
- determine whether current runtime is newer known-good or unintended drift
- do NOT automatically merge PR #5
- only use an approved narrow release fix/cut

---

# 4. Six-Step Execution Plan

## STEP ① — Verify Current P2R13 Production Baseline

### Current status
`STATUS=COMPLETE_AT_GIT_LEVEL / CURRENT_RUNTIME_REVALIDATION_REQUIRED`

### Already complete
- [x] `master` verified identical to `5218235...`
- [x] pre-release restore branch verified identical to `5218235...`
- [x] official release branch exists at `ab7c13f...`
- [x] post-release restore branch exists at `ab7c13f...`
- [x] stable customer default historically recorded as `P2R13`

### Antigravity tasks
- [ ] Read actual current production runtime SHA.
- [ ] Read actual current UI/server/worker version.
- [ ] Confirm actual `CUSTOMER_DEFAULT=P2R13`.
- [ ] Confirm production entrypoint.
- [ ] Confirm persistent storage path is mounted and writable.
- [ ] Confirm restore refs still resolve remotely.
- [ ] Record current deployment ID.

### Required evidence
```text
CURRENT_DEPLOYMENT_ID=
CURRENT_DEPLOYED_SHA=
CURRENT_UI_VERSION=
CURRENT_SERVER_VERSION=
CURRENT_WORKER_VERSION=
CURRENT_CUSTOMER_DEFAULT=
PRODUCTION_ENTRYPOINT=
PERSISTENT_STORAGE_STATUS=
PRE_RELEASE_RESTORE_REF_OK=true/false
POST_RELEASE_RESTORE_REF_OK=true/false
```

### PASS
- deployed SHA is an approved release-line SHA
- `CUSTOMER_DEFAULT=P2R13`
- runtime identity is internally consistent
- restore paths are valid

### FAIL / STOP
- unknown/deleted deployment
- customer default changed
- unexpected Stage2/experimental path exposed
- rollback refs broken

---

## STEP ② — Identify Only Panorama-Release-Required Diff From PR #5

### Current status
`STATUS=PARTIAL`

### Already complete
- [x] PR #5 identified as unsuitable for wholesale release merge
- [x] PR #5 is isolated from official release line
- [x] true-spatial work classified as post-release
- [x] release branch already exists independently

### Antigravity tasks
Classify PR #5 changes into exactly 3 buckets:

#### A. RELEASE_REQUIRED
Only defects that can currently break:
- landing/start
- camera startup
- capture completion
- upload
- durable persistence
- panorama processing
- panorama viewer
- share/reload
- auth
- tenant isolation
- rollback/observability

#### B. POST_RELEASE_HARDENING
Useful but non-blocking:
- additional sensor telemetry
- extra RI diagnostics
- usability polish
- retry instrumentation
- non-critical mobile compatibility improvements

#### C. SPATIAL_R&D
Exclude from panorama release:
- reconstruction engine
- PLY/SPZ/splat
- positive fixture evaluator
- multi-position dataset work
- geometry tuning
- spatial viewer work
- Round 89–101 evidence machinery
- sync utilities not required for runtime

### Required output
`PANORAMA_RELEASE_DIFF_TRIAGE.md`

Minimum table:
| path/commit | bucket | reason | current runtime affected? | release action |
|---|---|---|---|---|

### PASS
- every proposed release diff is traceable to a current P0/P1 failure
- no spatial/R&D change leaks into release branch

### Default action
If no current P0/P1 defect exists:
`RELEASE_REQUIRED_COUNT=0`

---

## STEP ③ — Confirm / Freeze Separate Fast-Track Release Cut

### Current status
`STATUS=COMPLETE`

### Existing release cut
`ab7c13f62aee54ab6f55dd4ffae08857db695949`

### Already complete
- [x] release branch exists
- [x] landing integration branch exists
- [x] post-release restore branch exists
- [x] cut is only 2 commits ahead of stable baseline
- [x] PR #5 full merge not required

### Antigravity tasks
- [ ] Recompute current release-cut diff against `5218235...`
- [ ] Verify no Stage2 spatial engine is customer-default routed.
- [ ] Verify customer route still resolves to P2R13.
- [ ] Verify no billing/customer-data mutation in cut.
- [ ] Freeze SHA used for current revalidation.

### Required evidence
```text
FAST_TRACK_RC_SHA=
RC_BASE_SHA=5218235...
RC_CUSTOMER_DEFAULT=P2R13
RC_EXPERIMENTAL_ROUTE_EXPOSED=false
RC_BILLING_MUTATION=false
RC_CUSTOMER_DATA_MUTATION=false
```

### Rule
Do NOT create a new RC merely for documentation changes.

---

## STEP ④ — Run Current Production-Equivalent PANORAMA E2E

### Current status
`STATUS=HISTORICALLY_PASS / CURRENT_REVALIDATION_REQUIRED`

### Required current path
```text
LANDING
→ START
→ CAMERA
→ CAPTURE
→ UPLOAD
→ DURABLE STORAGE
→ PANORAMA PROCESSING
→ PANORAMA_360 RESULT
→ VIEWER
→ MOBILE INTERACTION
→ SHARE URL
→ CLEAN SESSION RELOAD
→ AUTH / TENANT ISOLATION
```

### Minimum physical proof
Priority device:
- Samsung Galaxy S23 Ultra / Android Chrome

If immediately available, add:
- one additional Android
- one iPhone/Safari

Do not delay release solely to obtain secondary devices if the existing stable product history plus primary physical E2E is sufficient and no device-specific P0/P1 defect is observed.

### Checklist
- [ ] Landing 200 / usable
- [ ] START reaches real capture
- [ ] Camera permission
- [ ] Rear camera ready
- [ ] Live preview
- [ ] Capture completes
- [ ] Source image count retained
- [ ] Upload completes
- [ ] Durable persistence confirmed
- [ ] Panorama job accepted
- [ ] Panorama job reaches terminal success
- [ ] Panorama artifact exists
- [ ] Viewer loads artifact
- [ ] Drag/zoom/navigation works
- [ ] Share link created
- [ ] Clean-browser share reload works
- [ ] Unauthorized cross-tenant access denied
- [ ] No fatal JS error
- [ ] No server 5xx in critical path

### Required result
```text
PANORAMA_E2E_GATE=PASS/FAIL
CAMERA_GATE=PASS/FAIL
CAPTURE_GATE=PASS/FAIL
UPLOAD_GATE=PASS/FAIL
PERSISTENCE_GATE=PASS/FAIL
PROCESSING_GATE=PASS/FAIL
PANORAMA_ARTIFACT_GATE=PASS/FAIL
VIEWER_GATE=PASS/FAIL
SHARE_RELOAD_GATE=PASS/FAIL
AUTH_GATE=PASS/FAIL
TENANT_ISOLATION_GATE=PASS/FAIL
FATAL_ERROR_COUNT=
SERVER_5XX_COUNT=
```

### Explicit non-gates
Do NOT fail STEP ④ because of:
- no positive spatial fixture
- no SPZ
- no PLY
- no true 3D navigation
- reconstruction quality

---

## STEP ⑤ — Preview / Canary Revalidation

### Current status
`STATUS=HISTORICALLY_PASS / CURRENT_RECHECK_REQUIRED`

### Historical proof
- Stage 0 production canary recorded PASS
- Stage 1 trusted users recorded PASS
- Stage 2 invited cohort recorded PASS
- historical deployment: `e7e7b0d1-...`

### Fastest current strategy
If current production is already the approved official release SHA:
- do NOT create a redundant new preview
- run internal smoke + limited canary against current runtime

If current production is not the approved release line:
- use isolated preview/canary before public cutover

### Canary checklist
- [ ] exact deployed SHA confirmed
- [ ] exact customer default confirmed
- [ ] root/landing health
- [ ] camera health
- [ ] capture/upload health
- [ ] panorama processing health
- [ ] viewer/share health
- [ ] auth/tenant isolation
- [ ] no 5xx spike
- [ ] no fatal frontend regression
- [ ] rollback command/target ready

### PASS
`OPEN_P0_BLOCKERS=0`
`OPEN_P1_BLOCKERS=0`

---

## STEP ⑥ — Release / Current Public State Confirmation

### Current status
`STATUS=HISTORICALLY_RELEASED / CURRENT_LIVE_STATE_RECONFIRM_REQUIRED`

### Historical release truth
- `PUBLIC_CUTOVER_EXECUTED=true`
- `PUBLIC_RELEASE_STATUS=OFFICIALLY_RELEASED`
- stable release SHA = `ab7c13f...`
- `CUSTOMER_DEFAULT=P2R13`

### If current runtime is already healthy
Set:
```text
PANORAMA_RELEASE_STATUS=GREEN
CURRENT_PUBLIC_RUNTIME_CONFIRMED=true
PUBLIC_RELEASE_ACTION=NO_CODE_CHANGE_REQUIRED
```

### If redeployment/cutover is required
Only proceed after:
```text
STEP1=PASS
STEP2=PASS
STEP3=PASS
STEP4=PASS
STEP5=PASS
OPEN_P0_BLOCKERS=0
OPEN_P1_BLOCKERS=0
ROLLBACK_READY=true
```

### Post-release lock
- preserve `5218235...`
- preserve `ab7c13f...`
- do not merge PR #5 into release
- hotfix from official release line only
- spatial R&D resumes separately

---

# 5. P0 / P1 Definitions

## P0 — Release must stop / rollback
- camera cannot start
- capture cannot complete
- captured source bytes are lost
- upload cannot complete
- processing permanently stuck
- panorama output missing
- viewer cannot load
- share URL broken
- auth bypass
- cross-tenant data exposure
- production crash loop
- database corruption
- rollback unavailable
- customer default unintentionally changed

## P1 — Must fix before expansion
Repeatable customer-blocking failure with no safe workaround, including:
- major device compatibility failure
- major mobile performance defect
- repeatable job timeout affecting normal users
- major landing/capture usability blocker

## NOT release blockers
- true spatial fixture unavailable
- PLY/SPZ unavailable
- reconstruction quality research incomplete
- 7C.3 incomplete
- minor visual polish
- internal evidence tooling polish
- multi-PC sync tooling
- non-critical diagnostics

---

# 6. Evidence Priority

Highest to lowest:
1. actual current production runtime identity
2. raw Git output / exact SHA
3. physical-device runtime evidence
4. server/job/artifact evidence
5. current browser viewer evidence
6. committed receipts/manifests
7. automated tests
8. Antigravity narrative report

Historical PASS never substitutes for current runtime revalidation.

---

# 7. ChatGPT Gate Review Template

For each Antigravity package, ChatGPT returns:

```text
[CHATGPT][PANORAMA FAST TRACK][STEP N AUDIT]

CURRENT_SHA=
EXPECTED_SHA=

ACCEPTED:
- ...

FAILED / NOT VERIFIED:
- ...

P0_BLOCKERS=
P1_BLOCKERS=

TRUE_SPATIAL_FINDINGS_IGNORED_FOR_PANORAMA_RELEASE=
true

GATE=
PASS | FAIL | HOLD

NEXT_ACTION=
...
```

---

# 8. Antigravity Reporting Template

Antigravity must return only observed values:

```text
[ANTIGRAVITY][PANORAMA FAST TRACK][STEP N REPORT]

REPO=
BRANCH=
LOCAL_HEAD=
REMOTE_HEAD=
WORKTREE_CLEAN=

CURRENT_DEPLOYMENT_ID=
CURRENT_DEPLOYED_SHA=
CURRENT_CUSTOMER_DEFAULT=

EXECUTED:
- ...

RAW_EVIDENCE:
- ...

PASS:
- ...

FAIL:
- ...

NOT_VERIFIED:
- ...

FILES_CHANGED:
- ...

COMMITS_CREATED:
- ...

P0_BLOCKERS=
P1_BLOCKERS=

SPATIAL_R&D_TOUCHED=false

AWAITING_CHATGPT_GATE=true
```

---

# 9. Speed Rules

1. No new evidence-version loops unless a release gate actually fails.
2. No new spatial research while panorama release is being closed.
3. No documentation-only commit to create a “new RC”.
4. Reuse verified `ab7c13f...` unless a current P0/P1 defect proves a change is necessary.
5. One milestone report per step, not dozens of micro-updates.
6. Parallelize safe read-only work:
   - runtime identity
   - PR triage
   - rollback-ref verification
7. Serialize mutation work:
   - patch
   - deploy
   - canary
   - cutover
8. Any failed P0 immediately stops expansion.
9. Owner is not asked to recapture for true spatial 3D.
10. Panorama release and true spatial R&D remain permanently separated.

---

# 10. Current Status Board

| Item | Status |
|---|---|
| Stable master baseline | PASS |
| Pre-release restore ref | PASS |
| Official release branch | PASS |
| Post-release restore branch | PASS |
| PR #5 full merge needed | NO |
| Fast-track release cut exists | YES |
| Historical production canary | PASS |
| Historical official cutover | PASS |
| Current production SHA | REVALIDATE |
| Current P2R13 default | REVALIDATE |
| Current panorama E2E | REVALIDATE |
| Current auth/tenant isolation | REVALIDATE |
| True spatial positive fixture | BLOCKED, POST-RELEASE ONLY |
| True spatial blocker affects panorama release | NO |

---

# 11. Immediate Next Package

Antigravity should execute **STEP ① + read-only portion of STEP ② + STEP ③ verification in parallel** and return one consolidated report.

Do NOT change code yet.

Required consolidated first package:

```text
CURRENT_DEPLOYMENT_ID=
CURRENT_DEPLOYED_SHA=
CURRENT_UI_VERSION=
CURRENT_SERVER_VERSION=
CURRENT_WORKER_VERSION=
CURRENT_CUSTOMER_DEFAULT=
PRODUCTION_ENTRYPOINT=
PERSISTENT_STORAGE_STATUS=
PRE_RELEASE_RESTORE_REF_OK=
POST_RELEASE_RESTORE_REF_OK=

PR5_RELEASE_REQUIRED_CANDIDATE_COUNT=
PR5_POST_RELEASE_HARDENING_COUNT=
PR5_SPATIAL_RND_COUNT=

FAST_TRACK_RC_SHA=
RC_BASE_SHA=
RC_EXPERIMENTAL_ROUTE_EXPOSED=
RC_BILLING_MUTATION=
RC_CUSTOMER_DATA_MUTATION=

P0_BLOCKERS=
P1_BLOCKERS=
```

After ChatGPT audits that package:
- if clean → immediately run STEP ④
- if a real P0/P1 defect exists → authorize only the smallest targeted fix
