# dn'a-C07.16 — Webhook Idempotency & Out-of-Order Protection

## Deduplication Key
`provider + '::' + providerEventId` (e.g., `STRIPE::evt_abc123`)

## Database Lookup Before Processing
```javascript
async function isEventAlreadyProcessed(providerEventId) {
  const existing = db.data.billingWebhookEvents.find(e => e.providerEventId === providerEventId);
  return !!existing;
}
```

## Idempotency Guarantee
`WEBHOOK_DUPLICATE_EFFECT = 0`: If the same event is received twice (Stripe retry), the second processing is short-circuited after the deduplication lookup. Zero additional ledger rows created.

## Out-of-Order Protection
Webhook events with `created` timestamp older than the latest reconciled `currentPeriodEnd` are flagged as stale and silently acknowledged without re-applying stale state:
```javascript
if (sub.status === 'canceled' && inboundCreated < sub.cancelledAtTimestamp) {
  // Out-of-order: already processed a newer event — skip state transition
  return res.json({ received: true, stale: true });
}
```
