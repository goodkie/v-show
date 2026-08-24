# dn'a-C07.20 — Refund Handling & Charge Reconciliation

## Refund Policy
- Refunds are processed exclusively through the Stripe Dashboard by the Product Owner.
- dn'a backend receives `charge.refunded` or `charge.dispute.created` webhook.
- On refund webhook:
  1. Immutable ledger row appended with `eventType: 'REFUND_PROCESSED'`.
  2. Subscription reviewed — if fully refunded, `billingStatus` is updated to `CANCELLED`.
  3. Project data is NOT deleted (`PROJECT_DATA_DELETION_ON_PAYMENT_FAILURE = 0`).
  4. Incident logged to audit trail with refund details.

## Dispute Handling
```javascript
case 'charge.dispute.created': {
  db.logIncident('BILLING', 'high', `Stripe dispute opened: ${dispute.id}`, {
    customerId: dispute.charge,
    amount: dispute.amount,
    reason: dispute.reason
  });
  // Notify Product Owner and suspend publish access pending review
  break;
}
```
