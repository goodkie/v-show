# dn’a-C07.25 — Production Deployment Verification & Status

## Production URL
`https://v-show-commercial-v1-production.up.railway.app/`

## Deployment Checklist
- [x] Server raw body webhook parser active (`POST /api/billing/stripe-webhook`).
- [x] Idempotency & deduplication cache operational (`WEBHOOK_DUPLICATE_EFFECT = 0`).
- [x] Immutable financial ledger initialized.
- [x] Plan registry strictly serves PRO (\$299/mo) and BUSINESS (\$799/mo).
- [x] Developer Lab Tab 9 Billing Sandbox mounted and shielded.
- [x] Live Kill-Switch active: `LIVE_BILLING_ENABLED = false`.
- [x] Real charge count verified: `REAL_CHARGE_COUNT = 0`.
- [x] Stripe ONLY provider enforcement active (`EPIPAY_DEPENDENCY = 0`).
