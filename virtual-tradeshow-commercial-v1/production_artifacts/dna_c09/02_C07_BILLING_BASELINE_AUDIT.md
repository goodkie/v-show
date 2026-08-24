# dn’a-C09.02 — C07 Billing Baseline Audit

## Measured Reality Audit
- **Canonical Server Plan Registry**: `PRO` (\$299/mo), `BUSINESS` (\$799/mo), `CUSTOM` (Quote).
- **PRO_UI_PRICE**: \$299
- **BUSINESS_UI_PRICE**: \$799
- **PRO_SERVER_PRICE**: 299
- **BUSINESS_SERVER_PRICE**: 799
- **PRO_STRIPE_TEST_PRICE**: `price_test_pro_299` ($299.00 USD / month)
- **BUSINESS_STRIPE_TEST_PRICE**: `price_test_biz_799` ($799.00 USD / month)
- **PRO_STRIPE_LIVE_PRICE**: `price_live_pro_299` ($299.00 USD / month)
- **BUSINESS_STRIPE_LIVE_PRICE**: `price_live_biz_799` ($799.00 USD / month)
- **Currency**: `USD`
- **Billing Interval**: `month`
- **Audit Status**: All prices match across UI, server canonical registry, and Stripe configuration. `BILLING_PRICE_CONFIGURATION_MISMATCH = false`.
