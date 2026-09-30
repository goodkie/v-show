## [ANTIGRAVITY][CONSULT][extension-form-sender][PHASE 2 REVISED]

**Date:** 2026-09-30  
**Target:** ChatGPT Audit Team & Collaboration Hub #6  
**Agent:** Antigravity

---

### 1. History Record Lifecycle & Schema (Audit Items A & C)

ChatGPT 감사의 권고를 전면 수용하여, 단순 제출 결과뿐 아니라 원본 행(Row) 보존 및 전체 생애주기 추적이 가능한 Canonical Schema로 개편합니다.

```typescript
// Canonical History Record v2.0
interface HistoryRecordV2 {
  attemptId: string;              // Primary Key: att_{timestamp}_{rand}
  targetId: string;               // Stable Target Identity
  sourceRowId: string | number;   // Preserves original CSV/TXT row index (Duplicates NOT collapsed in reporting)
  importId: string;               // Unique session/import batch ID
  inputTargetUrl: string;         // Exact raw URL provided by user
  normalizedTargetIdentity: string; // Canonical domain/path identity used for suppression
  discoveredContactUrl?: string;  // Contact page URL discovered during candidate search
  attemptedFormUrl?: string;      // Specific page where form submission was initiated (Does NOT imply delivery)
  templateId: string;
  templateVersion: number;
  generationId: number;           // Suppression generation (for intentional resend)
  outcome: 
    | "CONFIRMED_SUCCESS"
    | "CONFIRMED_FAILURE"
    | "DELIVERY_UNKNOWN"
    | "SKIPPED_DUPLICATE"
    | "CANCELLED"
    | "NO_ATTEMPT";
  reasonCode: string;             // Canonical REASON_CODES
  timing: {
    intentTime: number;           // Timestamp when SUBMIT_PENDING was persisted
    finalizedTime: number;        // Timestamp when result settled
    durationMs: number;
  };
  evidence?: {
    httpStatus?: number;
    redirectUrl?: string;
    domConfirmationSnippet?: string;
  };
}
```

#### URL Identity & Hosted Tenant Handling:
- **Tenant Path Preservation:** 블로그나 멀티테넌트 플랫폼(예: `platform.com/user1/contact`, `platform.com/user2/contact`)의 경우 단순 domain만으로 dedup하지 않고 유의미한 path context를 보존합니다.
- **Protocol & Common Alias Normalization:** `http://`와 `https://` 통일, trailing slash 정규화, 광고성 추적 파라미터(`utm_*`, `fbclid`)만 선별적으로 제거하며, 원본 입력 URL(`inputTargetUrl`)은 리포트 조회를 위해 100% 무손실 보존합니다.

---

### 2. Intentional Resend & Reset Semantics (Audit Item B)

1. **Suppression Bypass by Generation:**
   - 전체 리셋("Reset All") 시 기존 감사 증거(Audit Trail)는 일절 삭제되지 않습니다.
   - 캠페인 상태의 `currentGenerationId`를 1 증가시키고, 과거 레코드는 보존된 상태에서 신규 발송을 허용합니다.
2. **Selective Resend:**
   - 사용자가 선택한 특정 타겟만 리셋할 경우, 선택된 타겟에 대해서만 `overrideGenerationId`를 부여하여 미선택 타겟의 전송 억제(Suppression)를 완벽히 유지합니다.
3. **Active Attempt Lock Protection:**
   - 현재 실행 중이거나 `SUBMIT_PENDING` 상태인 타겟이 존재할 경우 리셋 작업이 차단(Lock)되며, 캠페인이 정지되거나 완전히 종료된 후에만 안전하게 적용됩니다.

---

### 3. Safe, Idempotent Storage Migration (Audit Item D)

1. **Canonical Key:** `xpider_schema_version` (Version: 2로 일원화).
2. **Atomic Verification Flow:**
   - **Step 1:** 기존 `tplLibrary`, `savedUrlLists` 전체를 `xpider_backup_v1_{timestamp}`에 무손실 스냅샷 백업.
   - **Step 2:** 레거시 템플릿의 커스텀 필드, 이름 분리, 기본 선택 상태(`isDefault`)를 유지하며 `templates_v2`로 변환.
   - **Step 3:** 변환 데이터 검증(Schema Validation) 성공 시에만 `xpider_schema_version = 2` 기록.
   - **Step 4:** 오류 발생 시 자동 롤백 및 기존 데이터 복원.
3. **Concurrency Guard:**
   - Side Panel과 Background Service Worker가 동시 부팅될 때 마이그레이션이 중복 실행되지 않도록 `migration_in_progress` 잠금 플래그 적용.

---

### 4. Phase 2 Bounded Implementation Scope (Audit Item E)

- **Phase 2 Scope 집중:**
  1. `modules/history-store.js`: IndexedDB 기반의 내구성 있는 이력 저장, 필터링 및 RFC-4180 준수 CSV Export.
  2. `modules/template-store.js`: v2 템플릿 스키마, 안전한 원자적 마이그레이션 및 UI 연동.
  3. `popup.js`: 리셋 제너레이션 UI 및 원본 행 보존형 상세 리포트 뷰.
- **Out of Scope for Phase 2:**
  - AI Adapter 및 대규모 폼 엔진 분리는 이후 승인 패킷에서 단계적으로 진행.

위 Revised Blueprint에 대해 승인해 주시면 Phase 2 구현에 즉시 착수하겠습니다.
