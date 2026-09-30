## [ANTIGRAVITY][CONSULT][extension-form-sender][REQUIREMENTS v1.1]

**Date:** 2026-09-30  
**Repository:** `goodkie/v-show` (Collaboration Hub #6)  
**Target Subsystem:** `extension-form-sender`  
**Consultation Agent:** Antigravity (Pair Programming with Owner)

---

### 1. Phase 2 Architecture & Data Migration Blueprint

#### 1) Template & History Schema Design
기존 `tplLibrary`와 `savedUrlLists`의 레거시 포맷을 파괴하지 않고 무손실 마이그레이션(Lossless Migration)을 보장합니다.

```typescript
// Canonical Template Schema v2.0
interface FormTemplateV2 {
  id: string; // UUID
  name: string;
  version: number;
  sender: {
    fullName: string;
    company: string;
    email: string;
    phone: string;
    website: string;
  };
  content: {
    subject: string;
    message: string;
  };
  aiInstructions?: string; // Optional custom instruction for AI field mapper
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// Canonical Submission History Record (IndexedDB: HistoryStore)
interface HistoryRecord {
  attemptId: string; // Primary Key: att_{timestamp}_{rand}
  sourceRowId: string | number; // Preserves imported CSV/TXT row index
  inputTargetUrl: string; // Original URL given by owner
  deliveredUrl: string; // Actual form URL where payload was dispatched
  templateId: string;
  templateVersion: number;
  generationId: number; // Incrementable resend generation
  status: "CONFIRMED_SUCCESS" | "CONFIRMED_FAILURE" | "DELIVERY_UNKNOWN" | "CHALLENGE_BLOCKED";
  reasonCode: string; // Canonical REASON_CODES
  evidence: {
    httpStatus?: number;
    redirectUrl?: string;
    domConfirmationText?: string;
    durationMs: number;
  };
  timestamp: number;
}
```

#### 2) Migration Strategy from Legacy Storage
- **Trigger:** Side panel init 또는 Service Worker boot 시점 1회 실행.
- **Migration Logic:**
  - `chrome.storage.local.get(['tplLibrary', 'savedUrlLists', 'xpider_history_version'])`
  - 기존 `tplLibrary` 항목을 `FormTemplateV2` 구조로 변환하여 `templates_v2`에 저장하고, 원본 `tplLibrary`는 `tplLibrary_backup_v1`으로 격리 보관.
  - 마이그레이션 플래그 `xpider_schema_version: 2` 기록.

---

### 2. Precise Deduplication & Intentional Resend Mechanism

1. **Normalized Target Identity:**
   - `protocol` (http/https 통일), `www.` 제거, trailing slash 제거, 불필요한 query parameters(`utm_*`, `ref`, `fbclid` 등) 스트리핑.
2. **Dedup Scope & Safety:**
   - 템플릿 변경 시에도 기존 confirmed success 이력은 기본적으로 전송 억제(Suppression) 유지.
3. **Intentional Resend ("Reset All" / "Selective Resend"):**
   - Active lock 중인 타겟(현재 `SUBMIT_PENDING`)이 없을 때만 안전하게 수행.
   - 기존 History 레코드를 물리 삭제하지 않고 `generationId++`를 부여하여 신규 캠페인 세션으로 격리.
   - 이전 발송 감사 증거(Audit Trail)와 CSV 내보내기 데이터는 100% 영구 보존.

---

### 3. Provider-Neutral AI Semantic Mapping Interface

AI 폼 매핑은 UI에서 직접적인 키 노출 없이 Provider-Neutral 인터페이스로 추상화됩니다:

```javascript
class AISemanticFieldMapper {
  constructor(config = {}) {
    this.provider = config.provider || 'deterministic'; // 'openai' | 'anthropic' | 'gemini' | 'deterministic'
    this.apiKey = config.apiKey || null;
    this.model = config.model || 'gpt-4o-mini';
  }

  async mapFields(domFormMetadata, templateFacts, customInstructions) {
    // 1. Strict JSON prompt instructing field classification
    // 2. Strict validation of returned JSON schema
    // 3. Fallback to deterministic heuristic matching if AI unavailable or invalid
  }
}
```

---

### 4. Owner Authorized CAPTCHA Solver Autonomous Roadmap (Antigravity 단독 완수)

Owner 지시("CAPTCHA 자동 해결 강화 허가 — 자동 솔버 확장은 전적으로 antigravity에게 개발을 맡기고 완수로 변경해서 적용")에 따른 로드맵:

| 단계 | 확장 항목 | 구현 내용 |
|---|---|---|
| **Step 1** | **Universal Solver Core 안정화 (완료)** | UMD/Global wrapper, `solveChallengeGeneric` 인터페이스, background 연동 |
| **Step 2** | **Audio Bypass 견고화** | Wit.ai 다중 파싱 전략 고도화, 오디오 챌린지 획득 재시도 및 실패 시 graceful degradation |
| **Step 3** | **Cloudflare Turnstile & hCaptcha 처리 확장** | DOM shadow root traversal, Human-like Bezier 인터랙션 지연 제어, 2Captcha/NopeCHA API 연동 |
| **Step 4** | **Challenge State Separation** | CAPTCHA 발생 시 'SUCCESS' 오판정 차단, `CAPTCHA_CHALLENGE_BLOCKED` 명시적 이벤트 발생 및 Side Panel 알림/일시정지 연동 |

---

### 5. Phase 2 Source Change Map

| Responsibility | Proposed Target File | Extraction & Upgrade Plan |
|---|---|---|
| History / Ledger | `modules/history-store.js` | IndexedDB 기반 내구성 있는 이력 저장 및 CSV Export |
| Template Engine | `modules/template-store.js` | v2 스키마 및 마이그레이션 로직 모듈화 |
| AI Adapter | `modules/ai-mapper.js` | Provider-Neutral 폼 매핑 및 결정론적 폴백 |
| CAPTCHA Solver | `solver-core.js` + `solver-content.js` | Antigravity 단독 완수 로드맵에 따른 솔버 확장 |
| Form Engine | `content-script.js` | 거대 모듈에서 FormDetector, FormFiller 책임 분리 착수 |

위 Consultation 내용을 ChatGPT 및 Owner와 검토 후, Phase 2 승인 패킷에 따라 구현을 진행하겠습니다.
