# dn’a-C09.19 — Customer Portal & Self-Service Billing

## Stripe Customer Portal Integration
- Endpoint: `POST /api/billing/portal` (Authenticated).
- Returns Stripe-hosted portal URL allowing customers to:
  - Update payment methods / credit cards.
  - View invoices and download PDF receipts.
  - Cancel or update subscription tiers.
- Cross-customer isolation strictly enforced on backend session mapping.
