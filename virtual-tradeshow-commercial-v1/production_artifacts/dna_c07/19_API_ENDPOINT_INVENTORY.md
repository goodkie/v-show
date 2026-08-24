# dn'a-C07.19 — Billing API Endpoint Inventory

## Public Billing API Endpoints

| Method | Path | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/billing/plans` | None | Returns PRO & BUSINESS canonical plan registry |
| `GET` | `/api/billing/subscription` | JWT | Current subscription state for org |
| `POST` | `/api/billing/create-checkout-session` | JWT | Create Stripe Checkout Session (PRO or BUSINESS only) |
| `POST` | `/api/billing/portal` | JWT | Create Stripe Customer Portal session |
| `POST` | `/api/billing/subscription/cancel` | JWT | Cancel subscription at period end |
| `POST` | `/api/billing/subscription/reactivate` | JWT | Reactivate cancelled subscription |
| `POST` | `/api/billing/subscription/upgrade` | JWT | Upgrade PRO → BUSINESS |
| `POST` | `/api/billing/subscription/downgrade` | JWT | Downgrade BUSINESS → PRO |
| `POST` | `/api/billing/stripe-webhook` | Stripe Signature | Webhook reconciliation handler |

## Developer Lab Billing Sandbox Endpoints (Internal Only)
| Method | Path | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/dev-lab/billing/ledger` | devLabToken | Inspect full financial ledger |
| `POST` | `/api/dev-lab/billing/simulate-failure` | devLabToken | Simulate payment failure & PAST_DUE |
| `POST` | `/api/dev-lab/billing/replay-webhook` | devLabToken | Replay last webhook event |
