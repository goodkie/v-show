# STRIPE TEST MODE SETUP GUIDE
**Virtual Trade Show Commercial V1 — Zero-Cost Sandbox Guide**

---

## 1. 필수 환경 변수 (Required Environment Variable Names)
Railway 또는 로컬 `.env`에 설정할 환경 변수 목록 (값은 절대 Git에 커밋하지 않음):

```bash
# Stripe Test Mode API Keys (From Stripe Dashboard > Developers > API keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Configured Test Price IDs (From Stripe Dashboard > Products)
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
```

---

## 2. Stripe 대시보드 제품 및 가격 생성 절차 (Products & Prices Setup)
1. [Stripe Dashboard](https://dashboard.stripe.com) 로그인 후 우측 상단의 **Test Mode** 토글 활성화.
2. **Product Catalog** 이동 → **Add Product**:
   - **PRO Plan**: Name `V-Show PRO Exhibitor`, Price `$299.00 USD / month` (Recurring) → 생성된 `price_...` ID를 `STRIPE_PRICE_PRO_MONTHLY`에 복사.
   - **BUSINESS Plan**: Name `V-Show Business Exhibitor`, Price `$799.00 USD / month` (Recurring) → 생성된 `price_...` ID를 `STRIPE_PRICE_BUSINESS_MONTHLY`에 복사.

---

## 3. Webhook 엔드포인트 설정 (Stripe Webhook Configuration)
1. **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**: `https://<your-railway-domain>.up.railway.app/api/billing/stripe-webhook`
3. **Listen to events**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. **Signing secret** 복사 → `STRIPE_WEBHOOK_SECRET`에 설정.

---

## 4. Stripe Customer Portal 활성화 (Customer Portal Configuration)
1. **Settings** → **Customer portal** 이동.
2. **Features enabled**:
   - Cancel subscriptions: 활성화 (At period end 권장)
   - Update payment methods: 활성화
   - View invoice history: 활성화
3. **Save changes**.

---

## 5. Stripe CLI를 이용한 로컬 테스트 (Local Webhook Forwarding)
```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/stripe-webhook
```

---

## 6. 테스트 결제 카드 정보 (Stripe Official Test Cards)
- **카드 번호**: `4242 4242 4242 4242`
- **만료일**: 미래의 임의 날짜 (예: `12/28`)
- **CVC**: 임의의 3자리 숫자 (예: `123`)
- **우편번호**: 임의의 5자리 숫자 (예: `90210`)
