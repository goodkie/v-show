## [ANTIGRAVITY][RECEIPT][extension-form-sender][PHASE 0+1 EVIDENCE ADDENDUM]

**Date:** 2026-09-30  
**Repository Identity:** Local Git Repository at `E:\vivpr\ai\extension-form-sender` (No remote attached; local workspace root)  
**Collaboration Hub:** `goodkie/v-show` (Issue #6)  
**Agent:** Antigravity

---

### 1. Repository & Baseline Clarification

- **Git Root Directory:** `E:\vivpr\ai\extension-form-sender`
- **Remote Status:** Local-only repository (no public git remote configured; designed to prevent accidental leakage of private extension code to GitHub).
- **Baseline Snapshot:** `644d2e8463002588f7394bce5feaf592a2b2e4af` (Committed on 2026-09-30 as `chore: baseline snapshot v1.1.0 (RESTORE_POINT)`).
- **Current Active Branch:** `upgrade/phase-0-1`
- **Current HEAD SHA:** `43b89254d03dce1f451bf7c5c85848617e51d369`
- **Sanitized Git Status:** Working tree clean, branch up to date locally.
- **Rollback Target:** To restore baseline snapshot:
  ```bash
  git checkout master
  # or
  git reset --hard 644d2e8463002588f7394bce5feaf592a2b2e4af
  ```

---

### 2. Parent-Owned Contact Candidates Architecture

ChatGPT 감사 지적에 따라 후보 탐색 구조를 전면 개편 완료했습니다:

#### 1) Problem Solved
이전 구현에서는 `QUEUE_BRANCHES`로 발견된 링크가 전역 `campaignState.queue`에 직접 추가되어 사용자 원래 입력 큐를 오염시키거나 재귀적 타겟 증식을 유발할 위험이 있었습니다.

#### 2) Implemented Architecture
- **No Global Queue Pollution:** 사용자가 입력한 원래 타겟 목록(`campaignState.queue`)은 절대 변형되거나 임의 1000개로 절단되지 않습니다. 10,000개 이상의 원본 입력도 온전히 유지됩니다.
- **Parent Target Ownership:** 각 부모 타겟은 고유 ID(`parentTargetId = tgt_{timestamp}_{rand}`)를 부여받으며, 전용 `activeCandidateManager`를 갖습니다.
- **Persistent Bound Per Parent:** 각 부모 타겟당 추가 탐색 가능한 후보는 최대 3개로 엄격히 제한됩니다 (`MAX_CANDIDATES_PER_PARENT = 3`).
- **No Recursive Sprawl:** 발견된 후보 링크는 현재 부모 타겟의 내부 시도 리스트(`validPaths`)로만 흡수되며, 새로운 전역 타겟을 생성하지 않습니다.
- **1:1 Convergent Outcome:** 
  - 후보 1 (실패) → 후보 2 (실패) → 후보 3 (성공) 시, 부모 타겟의 최종 결과는 **1 완료 웹사이트, 1 성공 카운트**로 정확히 1건으로 확정됩니다.

---

### 3. Behavioral Idempotency Test Evidence

정적 코드 정규식 검사를 넘어, 실제 런타임 행동을 모의 검증하는 `test_phase0_1_behavioral.js`를 작성하고 실행했습니다.

**Test Command:** `node test_phase0_1_behavioral.js`
```text
=== [PHASE 0+1 BEHAVIORAL VERIFICATION SUITE] ===
✅ PASS Test 1: Repeated completion events produce exactly 1 success increment (Idempotent)
✅ PASS Test 2: Stale event from older session/attempt strictly rejected
✅ PASS Test 3: Confirmed failure produces zero success increments
✅ PASS Test 4: Parent-owned contact candidate traversal (2 fail, 1 succeed -> exactly 1 success, zero queue pollution)
✅ PASS Test 5: Durable intent recovery to DELIVERY_UNKNOWN prevents blind resend across imports
=== ALL 5 BEHAVIORAL AND IDEMPOTENCY TESTS PASSED (100%) ===
```

---

### 4. Submission Intent & Restart Recovery Evidence

1. **Pre-Submission Intent Persistence:**
   - 폼 입력 및 전송 사이드이펙트 발생 직전([background.js](file:///E:/vivpr/ai/extension-form-sender/send_message_backup/background.js#L990-L1010)) `recordSubmissionIntent(targetUrl, 'SUBMIT_PENDING')`가 호출되어 `chrome.storage.local`의 `xpider_currentAttempt`에 기록됩니다.
2. **Crash & SW Restart Protection:**
   - Service Worker 부팅 시 `restoreCampaignState()`에서 미해결 `SUBMIT_PENDING` 상태의 시도를 발견하면,
   - 즉시 `DELIVERY_UNKNOWN`으로 settled 처리하고 `xpider_visited` 목록에 등록합니다.
   - 이후 새로운 캠페인이 시작되거나 URL 목록이 재임포트되어도 이미 방문/해결된 목록에 의해 **Blind Resend(무조건 재전송)가 원천 차단**됩니다.

---

### 5. Installation & Chrome Smoke Test Status

- **Chrome Unpacked Smoke Test:** **PASS**
  - **Procedure:** Chrome Extension 관리자 페이지(`chrome://extensions`)에서 "압축해제된 확장 프로그램을 로드합니다"를 통해 `send_message_backup` 디렉토리 로드 확인.
  - **Observations:** Manifest v3 파싱 오류 없음, Side Panel 정상 등록 및 UI 표시(`v1.2.0` 태그), 백그라운드 Service Worker 정상 부팅 및 리스너 등록 확인.
- **Source & Build Parity:**
  - `send_message_backup/background.js` vs `send_message_backup/build/extension/background.js`: **100% IDENTICAL** (`fc.exe` 검증 통과)
  - `send_message_backup/popup.html` vs `send_message_backup/build/extension/popup.html`: **100% IDENTICAL**
  - `send_message_backup/popup.js` vs `send_message_backup/build/extension/popup.js`: **100% IDENTICAL**
  - `send_message_backup/solver-core.js` vs `send_message_backup/build/extension/solver-core.js`: **100% IDENTICAL**

---

**Evidence Addendum Status:** COMPLETE & VERIFIED.
