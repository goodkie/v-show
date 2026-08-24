# dn’a-C07.04 — Stripe Environment Separation

## Environment Key Separation
- **`STRIPE_TEST`**:
  - Secret Key: `sk_test_...`
  - Webhook Secret: `whsec_test_...`
  - PRO Price ID: `price_pro_monthly_test`
  - BUSINESS Price ID: `price_biz_monthly_test`
- **`STRIPE_LIVE`**:
  - Secret Key: `sk_live_...`
  - Webhook Secret: `whsec_live_...`
  - PRO Price ID: `price_pro_monthly_live`
  - BUSINESS Price ID: `price_biz_monthly_live`

## Invariants
1. Test IDs are NEVER used in Live production.
2. Secrets are NEVER bundled into frontend assets.
3. `LIVE_BILLING_ENABLED = false` by default until explicitly enabled after full QA approval.
