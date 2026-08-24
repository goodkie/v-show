# dn'a-C07.24 — Billing Monitoring & Incident Runbook

## Monitoring Signals

| Signal | Threshold | Alert Level | Runbook Action |
| :--- | :--- | :--- | :--- |
| `invoice.payment_failed` events | ≥1 in 24h | MEDIUM | Review customer in Stripe Dashboard, notify via email |
| `charge.dispute.created` events | Any | HIGH | Immediately review dispute, preserve evidence, respond within 7 days |
| Webhook signature failures | ≥3 in 1h | HIGH | Rotate webhook secret, investigate potential replay attack |
| Checkout errors (500s) | ≥5 in 5m | HIGH | Check Stripe API status, review error logs, verify Price IDs |
| `LIVE_BILLING_ENABLED` flag change | Any | CRITICAL | Immediate Product Owner notification required |

## Incident Response Runbook
1. **Payment Failure**: Check `db.billingEvents` ledger → Email customer → Wait for Stripe retry (3 attempts) → If unresolved, Customer Portal link sent.
2. **Webhook Signature Failure**: Block source IP temporarily → Rotate `STRIPE_WEBHOOK_SECRET` → Verify Stripe endpoint registration → Replay missed events from Stripe Dashboard.
3. **Dispute**: Preserve checkout consent record, invoice record, and delivery evidence → Submit via Stripe Dashboard → Pause disputed subscription.
4. **Live Mode Accidental Enable**: Set `LIVE_BILLING_ENABLED=false` → Redeploy → Audit who changed flag → Product Owner review.
