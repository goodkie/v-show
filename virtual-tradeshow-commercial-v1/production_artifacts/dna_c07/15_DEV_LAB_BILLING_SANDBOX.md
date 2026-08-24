# dn'a-C07.15 — Developer Lab Billing Sandbox (Tab 9)

## Tab 9: Billing Sandbox Capabilities
| Feature | Capability |
| :--- | :--- |
| Simulate Checkout | POST /api/billing/create-checkout-session → Instant Test Simulation |
| Simulate Payment Failure | POST /api/dev-lab/billing/simulate-failure |
| Simulate Webhook Retry | POST /api/dev-lab/billing/replay-webhook |
| View Financial Ledger | GET /api/dev-lab/billing/ledger |
| Inspect Subscription State | GET /api/dev-lab/billing/subscription |
| Test Upgrade/Downgrade | POST /api/dev-lab/billing/simulate-plan-change |
| Test Cancel/Reactivate | POST /api/dev-lab/billing/simulate-cancel |
| Test Price Tampering | POST /api/billing/create-checkout-session (with invalid priceId → expect 400) |

## Sandbox Invariants
- All sandbox actions are strictly TEST environment — `environment: 'TEST'` in ledger.
- All sandbox actions require `devLabToken` header (C05.3 auth).
- `LIVE_BILLING_ENABLED = false` enforced in sandbox.
- Zero effect on live Stripe customer records.
