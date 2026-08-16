# LIVE ACTIVATION LOG
**Virtual Trade Show Commercial V1 — Production Deployment & Billing Audit Log**

---

## 1. 개요 및 원칙 (Safety First)
- **현재 모드**: **`STRIPE_MODE=test`** (Live Mode 전환 전 안전 상태).
- **원칙**: 본 로그는 플랫폼의 실제 프로덕션 활성화 이력, 스키마 버전, 정책 버전, 백업 상태를 기록하며, 어떠한 경우에도 API Secret Key나 신용카드 번호는 기록하지 않습니다.

---

## 2. 배포 및 활성화 이력 (Activation Records)

### [RECORD 01] Phase 10.5 Pre-Live Configuration (Invite-Only Pilot Readiness)
- **일시 (Timestamp)**: 2026-08-16T20:25:00Z
- **Git Commit Baseline**: `710b3400a4ea0946828596a13b4b9e77880229be`
- **Railway Online Target**: `https://v-show-commercial-v1-production.up.railway.app/`
- **Schema Version**: `5`
- **Billing Engine State**: `STRIPE_MODE=test` ($0.00 cash cost policy)
- **Live Pilot Customer Cap**: `1` (`LIVE_PILOT_MAX_CUSTOMERS = 1`)
- **Live Billing Allowed Orgs**: `[]` (대기 중)
- **Pricing Policy Status**: `draft` (잠정: PRO $299/월, Business $799/월)
- **Legal Review Status**: `pending` (이용약관, 개인정보, 환불정책 초안 배포)
- **Owner Live Authorization**: `BLOCKED` (`liveBillingApprovedByOwner = false`)
- **Emergency Kill Switches**:
  - `billingKillSwitch`: `OFF` (정상 작동 테스트 통과)
  - `reconstructionKillSwitch`: `OFF` (정상 작동 테스트 통과)
  - `maintenanceMode`: `OFF`
- **최신 런타임 백업 상태**: `PASS` (무결성 검증 완료)
- **다음 단계**: 인간 운영진의 고객 정보 입력 및 3중 승인 후 통제된 1개사 실결제 개시.
