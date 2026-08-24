# dn'a-C07.12 — Cancellation, Upgrade, Downgrade & Reactivation

## Cancellation (Cancel at Period End)
- `POST /api/billing/subscription/cancel`
- Calls `stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })`
- `billingStatus` → **CANCELLED** with `cancelAtPeriodEnd: true`
- Access continues until `currentPeriodEnd`.
- **PROJECT DATA NOT DELETED** (`PROJECT_DATA_DELETION_ON_PAYMENT_FAILURE = 0`)

## Reactivation
- `POST /api/billing/subscription/reactivate`
- Calls `stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })`
- `billingStatus` → **ACTIVE** — access fully restored.

## Upgrade (PRO → BUSINESS)
- `POST /api/billing/subscription/upgrade`
- Calls `stripe.subscriptions.update(subscriptionId, { items: [{ id: itemId, price: newPriceId }], proration_behavior: 'always_invoice' })`
- Proration charged immediately.
- Webhook `customer.subscription.updated` → Canonical state update.

## Downgrade (BUSINESS → PRO)
- `POST /api/billing/subscription/downgrade`
- Calls `stripe.subscriptions.update` with `proration_behavior: 'none'`
- New rate effective from next billing period.
- Webhook `customer.subscription.updated` → Canonical state update.
