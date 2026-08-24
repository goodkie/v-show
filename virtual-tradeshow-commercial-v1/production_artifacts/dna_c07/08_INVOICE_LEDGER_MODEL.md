# dn’a-C07.08 — Immutable Financial Ledger & Invoice Model

## 1. Financial Ledger Entry
```typescript
interface FinancialLedgerRecord {
  ledgerId: string;           // "ledg-evt-..."
  provider: 'STRIPE';
  environment: 'TEST' | 'LIVE';
  customerId: string;
  projectId: string;
  organizationId: string;
  subscriptionId: string;
  stripeInvoiceId: string | null;
  providerEventId: string;    // Unique deduplication key
  eventType: 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED' | 'REFUND_PROCESSED' | 'SUBSCRIPTION_CANCELLED';
  amountCents: number;
  currency: 'USD';
  timestamp: string;
  metadata: Record<string, any>;
}
```

## 2. Invariants
- `TEST` rows are completely segregated from `LIVE` rows.
- No sensitive credit card numbers or raw tokens are recorded.
- Duplicate webhooks with identical `providerEventId` produce exactly 0 additional ledger rows (`WEBHOOK_DUPLICATE_EFFECT = 0`).
