# GRAND CONTROL CENTER SPECIFICATION & USER MANUAL
**Virtual Trade Show Commercial V1 — Platform Operations, Revenue & Customer Intelligence**

---

## 1. 개요 및 권한 통제 (Overview & Access Control)
- **URL**: `/grand-control.html`
- **전용 권한**: **`platform_owner`** (최고 운영자 전용)
- **접근 보호**: 미들웨어 `requirePlatformOwner`를 통해 모든 `/api/platform/*` API를 일반 전시자 및 오거나이저로부터 완벽 차단 (HTTP 403 반환).
- **글로벌 환경 격리 필터**:
  - `REAL`: 실제 프로덕션 고객 데이터
  - `TEST`: 3개 전시자 내부 리허설 데이터 (Nova, Helix, Orbit)
  - `SYNTHETIC_TEST`: 결정론적 3D 합성 데이터 (AUREX)
  - `ALL`: 전체 통합 데이터

---

## 2. 주요 기능 탭 구성 (Module Architecture)

### A. Overview & KPIs
- **핵심 지표**: Total Customers, Test MRR / Test ARR, Active Events & Booths, Buyer Leads & RFQs, 3DGS Reconstructions, GPU Spend, System Incidents.
- **실시간 트래픽 차트**: HTML5 Canvas 기반의 무과금 세션 트렌드 그래프.
- **수익화 퍼널 (Monetization Funnel)**: Free Signup → Booth Published → First Lead → PRO Upgrade → Business Upgrade.
- **라이브 액티비티 스트림**: 조직 생성, 제품 등록, 견적 접수, 플랜 변경 등 실시간 이벤트 피드.

### B. Customer 360 View
- **단일 고객 상세 모달**:
  - 기업 프로필, 담당자 이메일, 활성 부스, 제품 수, 수신 리드 및 견적(RFQ) 현황.
  - **운영 헬스 스코어 (Health Score)**: 활동 빈도 및 부스 퍼블리시 기반 투명한 0~100점 지수 (ACTIVE / GROWING / AT_RISK).
  - **수동 플랜 오버라이드 (Manual Plan Override)**: 결제 없이 Beta PRO / Business Test 권한 부여 및 감사 로그 기록.
  - **내부 오너 메모 (Owner Notes)**: 고객에게 노출되지 않는 비공개 운영 노트 저장.
  - **계정 일시정지 (Suspension)**: 규정 위반 계정의 어드민 접근 차단 및 복구 기능.

### C. Subscriptions & Test MRR
- Stripe Test Mode 구독 테이블 (Stripe Customer ID, Subscription ID, 갱신일, 취소 예약 상태).
- 플랜별 실시간 Test MRR 계산.

### D. 3DGS Reconstruction Control
- 3D 가우스 스플래팅 재구성 큐 실시간 모니터링.
- Double-Gate 최종 GPU 구동 승인 버튼.
- PLY/SPZ 파일 크기 및 추정 GPU 비용 추적.

### E. Communications Hub
- 플랫폼 본부 ↔ 고객 2-way 메시징 시스템.
- 공지, 결제 안내, 재구성 완료 통보 카테고리.
- **안전 브로드캐스트 모달**: 전사 공지 발송 전 대상 조직 수 확인 배너 제공.

### F. Settings & CSV Export
- 중앙 피처 플래그 실시간 토글 (Stripe Billing, Precision 3D, Communications 등).
- 4종 보고서 CSV 즉시 다운로드: `organizations`, `subscriptions`, `leads`, `reconstructions`.
