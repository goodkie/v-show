# dn'a-C07.18 — Live Billing Readiness Checklist

## Live Readiness Gate Matrix

| Requirement | Status | Owner |
| :--- | :---: | :--- |
| Stripe Test Mode fully operational | ✅ | Engineering |
| Stripe Live API Keys configured in Railway | ⬜ Pending | Product Owner |
| Stripe Live Webhook Secret configured | ⬜ Pending | Product Owner |
| Live Price IDs (PRO / BUSINESS) created in Stripe Dashboard | ⬜ Pending | Product Owner |
| Stripe Billing Portal activated | ⬜ Pending | Product Owner |
| Legal / Terms Review approved | ⬜ Pending | Legal |
| Pricing approval confirmed | ⬜ Pending | Product Owner |
| E2E Test Suite all PASS | ✅ | Engineering |
| `LIVE_BILLING_ENABLED = true` flag set | ⬜ BLOCKED | Product Owner authorization only |
| `liveBillingApprovedByOwner = true` flag set | ⬜ BLOCKED | Product Owner authorization only |
| `FIRST_LIVE_PAYMENT_EXECUTED` manually approved | ⬜ BLOCKED | Product Owner verbal approval required |

## ABSOLUTE STOP RULE
**`LIVE_BILLING_ENABLED = false` until Product Owner explicitly issues the command: `"첫 실제 Stripe 결제를 실행해."`**
