# dn’a-C09.17 — Subscription Upgrade & Downgrade Flows

## PRO → BUSINESS Upgrade
- Calls Stripe Subscription Update with immediate proration.
- Unlocks 10 spaces and 100 pinpoints instantly on webhook reconciliation.

## BUSINESS → PRO Downgrade
- Downgrades take effect at the end of the billing period (`CANCEL_AT_PERIOD_END` or schedule).
- Existing spaces and pinpoints are preserved read-only if above PRO limits (`PLAN_LIMIT_CONFLICT` check without deleting customer data).
