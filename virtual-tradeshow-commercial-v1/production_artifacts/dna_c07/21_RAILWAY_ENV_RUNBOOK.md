# dn'a-C07.21 — Railway Environment Variable Runbook

## Required Environment Variables

| Variable | TEST Value | LIVE Value | Required? |
| :--- | :--- | :--- | :---: |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` | ✅ |
| `STRIPE_WEBHOOK_SECRET` | `whsec_test_...` | `whsec_live_...` | ✅ |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_pro_test_...` | `price_pro_live_...` | ✅ |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | `price_biz_test_...` | `price_biz_live_...` | ✅ |
| `STRIPE_MODE` | `test` | `live` | ✅ |
| `LIVE_BILLING_ENABLED` | `false` | `true` (Owner only) | ✅ |
| `DEV_LAB_TOKEN` | (internal secret) | (same) | ✅ |

## Railway Setup Steps (Test Mode)
1. Go to Railway → Project → Variables.
2. Add all `STRIPE_*` test variables from Stripe Dashboard.
3. Keep `LIVE_BILLING_ENABLED=false`.
4. Redeploy — server auto-detects Stripe and enables Test Mode.

## Live Activation (Product Owner Only)
1. Create Live Stripe Price IDs in dashboard.
2. Rotate `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to live values.
3. Set `STRIPE_MODE=live`.
4. Set `LIVE_BILLING_ENABLED=true`.
5. Set `liveBillingApprovedByOwner=true` in Feature Flags.
6. Redeploy.
