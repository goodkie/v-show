# XPIDER AutoForm Sender Pro — Restore Point / Handover

**Date:** 2026-10-06  
**Project:** XPIDER AutoForm Sender Pro  
**Workspace:** Independent Project Workspace  
**Repository:** goodkie/v-show  
**Project-local thread:** Issue #6  
**Active development branch:** `upgrade/phase-0-1`  
**Restore branch:** `restore/xpider-r6.9f2-owner-smoke-ready-2026-10-06`

---

## 1. Owner × ChatGPT × Antigravity operating model

- **Owner:** product authority and real-device/operator acceptance.
- **ChatGPT:** project-local planner, architect, QA auditor, release gatekeeper.
- **Antigravity:** implementation, testing, build, deploy/rollback, evidence executor.
- **Cross-posting:** disabled. Issue #6 is the only authoritative project-local workroom for XPIDER AutoForm Sender Pro.
- **Policy reference:** OCA-DEV-1.0 Independent Workspace Model (Issue #7 is policy reference only, not a project hub).

---

## 2. Restore-point identity

### Code baseline captured

```
upgrade/phase-0-1
1708618d64d44454849110ec31f7319d6e4b1974
```

This is the current remote branch HEAD at the moment this restore point was created.

### Runtime/evidence lineage

```
Stamped functional implementation:
48c23c7f8b0e81099d45aeb584e65d8713db7b37

Clean runtime audit commit:
e9cf22a39db924b92dbee2b6ce1038ce604b96f6

Evidence / final remote HEAD:
1708618d64d44454849110ec31f7319d6e4b1974
```

### Runtime identity expected in popup

```
R6.9F.1 [48c23c7]
```

Build ID:

```
R6.9F.1-20261005-RUNTIME-SUBMIT-COUNTERS
```

---

## 3. Current authoritative gate

From ChatGPT Final Gate in Issue #6 comment **#5997869525**:

```
R6.9F.2 = ACCEPTED
OWNER SMOKE = REQUIRED / AUTHORIZED
BULK CAMPAIGN = HOLD
RELEASE = HOLD pending Owner smoke
```

Owner action is limited to a **3–5 real target smoke test**. Do not run the full bulk campaign until that smoke passes.

---

## 4. Problems fixed and accepted

### Runtime-build mismatch
Previously popup and background could run different releases. Runtime handshake is now fail-closed.

### False success on comment/reply forms
WordPress-style comment forms are rejected as:

```
NON_INQUIRY_COMMENT_FORM
```

and counted as SKIPPED, not SUCCESS.

### Custom / non-native submit controls
Semantic custom submit controls such as `<a>` buttons are discovered and can be activated. Real Edge evidence confirmed custom submit completion.

### Submit execution identity
Critical control-plane events are bound to the exact:
- attemptId
- targetToken
- campaignRunId
- sessionId
- target tab

### Submit boundary / duplicate protection
Natural first submit boundary is committed. A second submit attempt under the same canonical identity is rejected:

```
SUBMIT_DUPLICATE_BLOCK
duplicateBlocked=true
```

Physical activation count was proven to remain exactly 1.

### Counter authority
Current-run terminal buckets are distinct:

- SUCCESS
- FAILURE
- TIMEOUT
- UNKNOWN
- SKIPPED
- COMPLETED
- REMAINING

Controlled run parity proved:

```
SUCCESS=1
FAILURE=2
TIMEOUT=1
UNKNOWN=1
SKIPPED=1
COMPLETED=6
```

Invariant:

```
success + failure + timeout + unknown + skipped = completed
```

Popup Live == HistoryStore currentRun.

### CAPTCHA terminal lifecycle
Controlled local Edge fixture proved:
- ERROR_ZERO_BALANCE becomes terminal configuration failure
- no successful bypass is claimed
- no submit occurs after the terminal error
- terminal settlement occurs once
- same-epoch retry storm is blocked

The test-only ZERO_BALANCE hook is restricted to the exact test key and localhost/127.0.0.1.

---

## 5. Final evidence accepted

Committed raw Edge evidence:

```
evidence_r6_9f2_real_runtime_traces.log
```

Recorded size:

```
249,755 bytes
```

Receipt SHA-256:

```
F4F7602D038C39F2DAA6B55572B8707491F2F1C92A46533F2093D398CDC196D1
```

Audit result:

```
30/30 checks passed
```

Key runtime identity evidence:

```
gitHead=e9cf22a39db924b92dbee2b6ce1038ce604b96f6
implementationHead=48c23c7f8b0e81099d45aeb584e65d8713db7b37
ancestor=true
worktreeClean=true
result=PASS
```

---

## 6. Owner smoke checklist

Reload the current unpacked extension and confirm popup badge:

```
R6.9F.1 [48c23c7]
```

Use only 3–5 real contact targets and verify:

1. A visibly successful inquiry increments SUCCESS exactly once.
2. A visibly failed submission does not increment SUCCESS.
3. TIMEOUT and UNKNOWN remain separate from FAILURE.
4. A custom/non-native registration button actually activates.
5. No target submits twice.
6. Comment/reply forms are SKIPPED, not SUCCESS.
7. Live Progress matches History currentRun.

If any mismatch is seen:
- stop the smoke test;
- keep Bulk HOLD;
- preserve Diagnostic Log and target URL;
- post the evidence only to Issue #6.

---

## 7. Safe restore methods

### Method A — safest: create a new recovery branch from this restore point

```bash
git fetch origin
git switch -c recovery/xpider-r6.9f2 origin/restore/xpider-r6.9f2-owner-smoke-ready-2026-10-06
```

This does not overwrite the current development branch.

### Method B — restore only XPIDER extension files into the current branch

First protect local work:

```bash
git status
git stash push -u -m "before XPIDER R6.9F.2 restore"
git fetch origin
```

Then restore only the XPIDER project tree:

```bash
git restore --source origin/restore/xpider-r6.9f2-owner-smoke-ready-2026-10-06 -- send_message_backup
```

Review and commit:

```bash
git status
git diff
git add send_message_backup
git commit -m "restore: XPIDER R6.9F.2 owner-smoke-ready restore point"
```

### Method C — hard reset active branch to the restore point

**Destructive. Use only when intentionally discarding newer work.**

Protect current changes first:

```bash
git status
git stash push -u -m "before hard XPIDER restore"
git fetch origin
```

Then:

```bash
git switch upgrade/phase-0-1
git reset --hard origin/restore/xpider-r6.9f2-owner-smoke-ready-2026-10-06
```

If this branch must become the remote development branch too, inspect it first and only then push with lease:

```bash
git log --oneline -10
git status
git push --force-with-lease origin upgrade/phase-0-1
```

Do not force-push without Owner authorization if newer valid work exists.

---

## 8. Post-restore validation

After any restore:

```bash
git rev-parse HEAD
git status
```

Reload the unpacked extension in Chrome/Edge and verify:

```
R6.9F.1 [48c23c7]
```

Then run only the 3–5 target Owner smoke before considering a bulk run.

---

## 9. Do not regress

Do not reintroduce:

- mixed popup/background builds
- pre-submit SUBMIT_PENDING
- missing canonical execution identity
- stale SENDER_FINISHED authority
- stale CAPTCHA task crossing targets
- manual counter patches outside HistoryStore
- generation totals masquerading as currentRun
- comment forms counted as SUCCESS
- duplicate submit activation
- custom submit activation relying only on native submit event
- unrestricted ZERO_BALANCE test hooks

---

## 10. Recovery reference

**Issue #6 authoritative final accepted gate:** comment #5997869525  
**Restore branch:** `restore/xpider-r6.9f2-owner-smoke-ready-2026-10-06`  
**Captured code baseline:** `1708618d64d44454849110ec31f7319d6e4b1974`

This restore point is intended to return XPIDER AutoForm Sender Pro to the exact **R6.9F.2 accepted / Owner Smoke Ready / Bulk HOLD** state.
