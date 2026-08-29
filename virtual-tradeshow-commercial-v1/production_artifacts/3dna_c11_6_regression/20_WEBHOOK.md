# 20. STRIPE WEBHOOK SECURITY & IDEMPOTENCY

## 1. Webhook Validation
- **ENDPOINT**: `/api/billing/stripe-webhook`
- **SIGNATURE_VALIDATION**: Verified via `stripe.webhooks.constructEvent`.
- **IDEMPOTENCY**: Event ID deduplication in database.
- **CLIENT_REDIRECT_CAN_ACTIVATE_PLAN**: `false` (Webhook is sole authority).
