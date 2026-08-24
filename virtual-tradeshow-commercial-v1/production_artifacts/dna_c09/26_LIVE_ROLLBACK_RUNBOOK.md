# dn’a-C09.26 — Live Rollback Runbook

## Rollback Procedure
1. **Trigger Kill Switch**: Set `stripeLiveBillingEnabled = false` via Developer Lab or `/api/internal/dev/feature-flags`.
2. **Cancel Subscriptions**: Immediate cancellation via Stripe Dashboard or API with `cancel_at_period_end = false`.
3. **Refund Real Charges**: Issue Stripe refund via `stripe.refunds.create({ charge: chargeId })`.
4. **Data Protection**: All project assets, booths, products, and pinpoints remain 100% intact.
