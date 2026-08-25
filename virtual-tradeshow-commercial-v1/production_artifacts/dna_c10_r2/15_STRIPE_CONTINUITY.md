# 15. Stripe Upgrade & Data Continuity

- **Continuity Guarantee**: Verified customer email flows directly into Stripe Checkout metadata (`customer_email`, `projectId`, `requestedPlan`).
- **Webhook Reconciliation**: On payment completion, project is transitioned to `ACTIVE_PRO` while preserving all uploaded photos, product pins, and AI descriptions.
- **Metric**: `FREE_TO_PAID_DATA_REENTRY = 0`.
