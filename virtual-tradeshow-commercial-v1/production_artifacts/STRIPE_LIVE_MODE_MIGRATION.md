# STRIPE LIVE MODE MIGRATION RUNBOOK
**Virtual Trade Show Commercial V1 — Production Billing Transition Guide**

---

## 1. 개요 및 사전 주의사항 (Critical Notice)
- **현재 상태**: **`STRIPE_MODE=test`** (실제 현금 과금 0원 유지).
- **원칙**: 최고 운영자의 명시적 지시 및 서명 승인 없이 절대 Live Mode를 가동하지 않습니다.

---

## 2. 라이브 모드 전환 절차 (Step-by-Step Migration Plan)

```
[Phase 1: Stripe Live Dashboard Setup]
  1.1 Stripe Dashboard 우측 상단 'Test Mode' 토글 OFF (Live Mode 진입)
  1.2 Business Profile 및 은행 계좌 정산 정보 등록
  1.3 Live Product & Recurring Prices 생성:
      - V-Show PRO: $299.00 / month -> price_live_...
      - V-Show Business: $799.00 / month -> price_live_...
  1.4 Live Customer Portal 활성화 (구독 취소, 카드 업데이트)
  1.5 Live Webhook Endpoint 등록:
      URL: https://<domain>/api/billing/stripe-webhook
      Events: checkout.session.completed, customer.subscription.*, invoice.*
      Signing Secret 획득 -> whsec_live_...

[Phase 2: Railway Environment Variables Configuration]
  2.1 Railway 대시보드 Variables 탭 이동
  2.2 라이브 환경 변수 주입:
      STRIPE_MODE=live
      STRIPE_SECRET_KEY=sk_live_...
      STRIPE_PUBLISHABLE_KEY=pk_live_...
      STRIPE_WEBHOOK_SECRET=whsec_live_...
      STRIPE_PRICE_PRO_MONTHLY=price_live_...
      STRIPE_PRICE_BUSINESS_MONTHLY=price_live_...

[Phase 3: Platform Owner Live Authorization]
  3.1 Grand Control Center (/grand-control.html) 로그인
  3.2 Settings -> Global Feature Flags 이동
  3.3 stripeLiveBillingEnabled=true 및 liveBillingApprovedByOwner=true 활성화
  3.4 Save Feature Flags

[Phase 4: Controlled First Live Transaction]
  4.1 테스트용 내부 유료 조직 1개 등록
  4.2 소액 결제 또는 Pro 플랜 1건 실제 카드로 결제
  4.3 Webhook 수신, DB 플랜 반영(pro active), Grand Control Live MRR 증가 검증
  4.4 Customer Portal에서 결제 영수증 및 정상 취소/환불 테스트 완료
```

---

## 3. 긴급 롤백 절차 (Emergency Rollback Protocol)
라이브 결제 중 오작동, 웹훅 불일치, 중복 과금 발생 시:
1. 즉시 Grand Control의 **`Billing Kill Switch`** 활성화 (모든 신규 체크아웃 즉시 차단, HTTP 503 반환).
2. Railway에서 `STRIPE_MODE=test`로 원복 재배포.
3. Stripe Dashboard에서 해당 결제 건 즉시 수동 Refund(전액 환불) 처리.
