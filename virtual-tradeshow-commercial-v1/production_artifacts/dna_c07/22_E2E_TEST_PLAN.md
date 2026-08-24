# dn'a-C07.22 — E2E Test Plan

## Phase A — Stripe Test Mode

| Test | Scenario | Expected Result |
| :--- | :--- | :--- |
| A-01 | PRO Checkout Simulation | billingStatus: ACTIVE, plan: pro, canPublish: true |
| A-02 | BUSINESS Checkout Simulation | billingStatus: ACTIVE, plan: business, maxViews: 10 |
| A-03 | Payment Failure Simulation | billingStatus: PAST_DUE, canPublish: false, project intact |
| A-04 | Cancel at Period End | billingStatus: CANCELLED, cancelAtPeriodEnd: true, access until period end |
| A-05 | Reactivation | billingStatus: ACTIVE, cancelAtPeriodEnd: false |
| A-06 | Upgrade PRO→BUSINESS | plan: business, proration applied |
| A-07 | Downgrade BUSINESS→PRO | plan: pro, effective next period |
| A-08 | Webhook Idempotency (×10 same event) | Exactly 1 ledger row, WEBHOOK_DUPLICATE_EFFECT = 0 |
| A-09 | Out-of-Order Webhook Sequence | Stale webhook ignored, state unchanged |
| A-10 | Customer Portal creation | Portal URL returned |
| A-11 | Price Tampering Rejection | HTTP 400, no session created |
| A-12 | Publish Gate (PAST_DUE) | Publish blocked, project data intact |

## Phase B — Live Readiness Verification

| Check | Expected Value |
| :--- | :--- |
| `LIVE_BILLING_ENABLED` | `false` |
| `FIRST_LIVE_PAYMENT_EXECUTED` | `false` |
| `REAL_CHARGE_COUNT` | `0` |
| `stripeLiveBillingEnabled` feature flag | `false` |
| `liveBillingApprovedByOwner` feature flag | `false` |
