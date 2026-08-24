# dn’a-C07.06 — Webhook Reconciliation Matrix & Signatures

## 1. Webhook Signature Verification
- Endpoint: `POST /api/billing/webhooks/stripe`
- Body: `express.raw({ type: 'application/json' })`
- Signature Header: `stripe-signature`
- SDK Verification: `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`
- Failure: Returns `HTTP 400 Bad Request` with audit log.

## 2. Reconciled Event Handlers

| Stripe Event Name | dn’a System Action | Canonical State Update |
| :--- | :--- | :--- |
| `checkout.session.completed` | Link `stripeSubscriptionId` & `stripeCustomerId` | `billingStatus: 'ACTIVE'` |
| `invoice.payment_succeeded` | Record invoice in ledger, grant full entitlements | `billingStatus: 'ACTIVE'` |
| `invoice.payment_failed` | Record failure in ledger, initiate grace period | `billingStatus: 'PAST_DUE'` |
| `customer.subscription.updated` | Update billing cycle dates, proration, plan changes | Sync `currentPeriodEnd`, planKey |
| `customer.subscription.deleted` | Subscription terminated at period end | `billingStatus: 'CANCELLED'` |
| `charge.refunded` | Record refund in immutable ledger, revoke entitlement | Reconcile ledger & status |
