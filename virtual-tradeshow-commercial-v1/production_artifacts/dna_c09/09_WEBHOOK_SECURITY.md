# dn’a-C09.09 — Webhook Security & Idempotency

## Security Controls
1. **Raw Body Signature Verification**: `stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)`.
2. **Idempotency Store**: Deduplicates events by `event.id`. Duplicate webhook deliveries return `200 OK` with `{ duplicate: true }` without repeating financial side effects (`WEBHOOK_DUPLICATE_EFFECT = 0`).
3. **Out-of-Order Protection**: Older events cannot overwrite newer canonical subscription statuses.
