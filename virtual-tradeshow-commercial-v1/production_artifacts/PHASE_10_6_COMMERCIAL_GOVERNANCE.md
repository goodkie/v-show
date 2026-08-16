# PHASE 10.6 COMMERCIAL GOVERNANCE REPORT
**Virtual Trade Show Commercial V1 — Legal, Pricing & Commercial Safety Matrix**

---

## 1. 개요 및 운영 상태 (Executive Status)
- **거버넌스 상태 (Overall Status)**: **`COMMERCIAL_POLICY_READY_FOR_HUMAN_APPROVAL`**
- **Stripe Mode**: **`TEST`** (`stripeMode: test`) — 실제 현금 과금 $0.00 유지.
- **Stripe Live Mode**: **`OFF`** (최고 운영자 라이브 승인 전까지 비활성화).
- **긴급 결제 킬 스위치 (Billing Kill Switch)**: **`ON`** (사전 승인 전까지 신규 체크아웃 잠금).
- **상용 요금제 분류 (Pricing Classification)**: **`PILOT PRICING`** (Free $0, Pro $299/월, Business $799/월).
- **법률 문서 상태 (Legal Policy Status)**: **`DRAFT (Version: 2026.1-draft)`**

---

## 2. 10대 결정론적 런치 블로커 게이트 (Deterministic Launch Gate)

| 게이트 항목 (Gate Item) | 현재 상태 (State) | 운영 세부 내용 및 해결 요건 |
| :--- | :---: | :--- |
| **1. 법률 검토 승인 (Legal Review)** | **`BLOCKED`** | Terms / Privacy / Refund 문서에 대한 법률 전문가의 최종 검토 및 승인 대기 |
| **2. 사업자 신원 정보 (Business Identity)** | **`BLOCKED`** | 상호명, 사업장 주소, 대표 지원 이메일, 준거법 플레이스홀더 확정 대기 |
| **3. 세무/넥서스 검토 (Tax Readiness)** | **`REVIEW_REQUIRED`** | 판매세(Sales Tax) 과세 여부 및 Stripe Tax 도입 여부 결정 필요 |
| **4. 파일럿 요금제 오너 승인 (Pilot Pricing)** | **`READY`** | $299 / $799 파일럿 요금제 설정 완료 (오너 승인 시 `approved_for_pilot`) |
| **5. 최초 실제 고객 정보 (First Customer)** | **`WAITING`** | 실제 참가사 회사명, 이메일, 부스 촬영 사진 폴더 입력 대기 |
| **6. Stripe Live 활성화 (Stripe Live Mode)** | **`OFF`** | 2단계 라이브 가드 작동 중 ($0.00 안전 정책 유지) |
| **7. 결제 킬 스위치 (Billing Kill Switch)** | **`READY`** | 긴급 503 차단 및 정상 재개 파이프라인 검증 통과 |
| **8. 멀티 테넌트 격리 (Tenant Isolation)** | **`READY`** | 3개 전시자 간 교차 수정 100% 차단 검증 |
| **9. 데이터 백업/복구 무결성 (Backup Drill)** | **`READY`** | 샌드박스 100% 무손실 복구 훈련 통과 |
| **10. 보안/XSS/업로드 감사 (Security Audit)** | **`READY`** | 프론트엔드 살균, MIME 화이트리스트, 경로 순회 방어 완료 |

---

## 3. 정책 버전 체계 (Policy Versioning)
- **Terms Version**: `2026.1-draft`
- **Privacy Version**: `2026.1-draft`
- **Refund Policy Version**: `2026.1-draft`
- **체크아웃 동의 로깅**: 고객이 구독 결제 진행 시 동의한 이용약관 및 정책 버전이 `db.billingEvents`에 불변 기록으로 저장됩니다.

---

## 4. 면책 사항 (Disclaimer)
본 거버넌스 보고서 및 관련 정책 문서는 상용 런칭 준비를 위해 엔지니어링 관점에서 작성된 초안이며, 전문 변호사의 법률 자문을 대체할 수 없습니다. 실제 유료 결제 개시 전 반드시 법무 전문가의 최종 승인을 거쳐야 합니다.
