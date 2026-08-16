# STRIPE BILLING ARCHITECTURE SPECIFICATION
**Virtual Trade Show Commercial V1 — Subscription & Entitlements Engine**

---

## 1. 아키텍처 개요 (Overview)
- **결제 엔진**: Stripe Billing (Official `stripe@22.5.0` SDK)
- **운영 모드**: **`TEST MODE ONLY`** (`stripeMode: test`) — 실제 카드 결제 및 현금 과금 발생 0건 ($0.00).
- **역할 분리**: 플랫폼 오너(`platform_owner`) 전용 그랜드 컨트롤 콘솔과 참가사(`exhibitor_admin`) 전용 셀프서브 빌링 포털.

---

## 2. 구독 티어 및 엔타이틀먼트 (Plan Limits & Entitlements)

| 티어 (Plan) | 월간 구독료 (USD) | 최대 등록 제품 | 최대 3D 핫스팟 | 최대 3D 사진 | Spark 3DGS 재구성 권한 | 커스텀 브랜딩 | 바이어 분석 CSV | 전담 지원 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **FREE** | **$0** | 5개 | 3개 | 5장 | ❌ 미지원 (사진 프리뷰만) | ❌ | ❌ | ❌ |
| **PRO** | **$299 / 월** | 25개 | 15개 | 60장 | ✅ 전체 지원 (Nerfstudio 3DGS) | ✅ | ✅ | ❌ |
| **BUSINESS** | **$799 / 월** | 100개 | 50개 | 120장 | ✅ 전체 지원 (우선 GPU 처리) | ✅ | ✅ | ✅ |

---

## 3. Stripe Checkout & Webhook 흐름도 (Lifecycle Flow)

```
[Exhibitor Admin]
       │
       ▼ (1) POST /api/billing/create-checkout-session (plan: 'pro' | 'business')
[Node.js Backend]
       │
       ▼ (2) stripe.checkout.sessions.create ({ customer, line_items, mode: 'subscription' })
[Stripe Checkout Page (Test Mode)]
       │
       ▼ (3) Buyer inputs 4242... test card & completes checkout
[Stripe Webhook Dispatcher]
       │
       ▼ (4) POST /api/billing/stripe-webhook (Express raw body verification)
[Webhook Handler]
       ├─► (4.1) Verify Stripe-Signature with STRIPE_WEBHOOK_SECRET
       ├─► (4.2) Check Idempotency in db.stripeEvents (prevent duplicate processing)
       ├─► (4.3) Handle checkout.session.completed -> updateOrganizationSubscription (plan: 'pro', status: 'active')
       ├─► (4.4) Handle customer.subscription.updated -> sync period & cancellation flags
       ├─► (4.5) Handle invoice.payment_failed -> update status to 'past_due' (grace period, no data loss)
       └─► (4.6) Handle customer.subscription.deleted -> downgrade to 'free' (preserve all data)
```

---

## 4. 정밀 3D 재구성 2중 게이트 (Billing + GPU Double-Gate)
1. **Gate 1 (Plan Entitlement)**: `POST /api/booths/:id/reconstruction` 요청 시 자사 구독이 `PRO` 또는 `BUSINESS`인지 검사. `FREE` 계정은 즉시 `HTTP 402 Upgrade Required`로 차단.
2. **Gate 2 (Approval Status)**: 자격이 승인된 요청은 즉시 유료 GPU를 구동하지 않고 `pending_approval` 상태로 큐에 대기. 플랫폼 오너 또는 오거나이저가 정밀 QA 및 승인을 완료해야 GPU Worker가 작업을 클레임.

---

## 5. 보안 및 멱등성 보증 (Security & Idempotency)
- **카드 번호 비저장**: 서버는 일체의 신용카드 번호(PAN)나 CVC를 수집/저장하지 않음.
- **서명 검증**: Webhook 엔드포인트는 `express.raw({ type: 'application/json' })`를 사용하여 원본 바이트 버퍼 서명 검증.
- **멱등성 (`stripeEvents`)**: 처리된 Stripe Event ID를 기록하여 네트워크 재전송 시 중복 활성화 방지.
