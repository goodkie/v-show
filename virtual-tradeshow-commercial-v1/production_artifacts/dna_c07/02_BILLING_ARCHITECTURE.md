# dn’a-C07.02 — Billing Architecture & Division of Responsibility

```mermaid
flowchart TD
    subgraph Stripe Responsibility
        A[Stripe Checkout Session] --> B[Card Processing & 3DS Authentication]
        B --> C[Recurring Subscription Collection]
        C --> D[Customer Portal & Invoice Receipts]
        D --> E[Signed Webhook Dispatch]
    end

    subgraph dn’a Commercial Platform Responsibility
        E --> F[Webhook HMAC Signature Verification]
        F --> G[Deduplication & Idempotency Engine]
        G --> H[Canonical Financial Ledger]
        H --> I[Subscription & Entitlement Reconciliation]
        I --> J[Production Orchestrator Publish Gate]
    end
```

## Security & Card Data Invariants
- **Zero Card Storage**: dn’a NEVER stores full card numbers, CVCs, or raw bank credentials.
- **Financial Truth**: Browser redirect URLs are NEVER trusted for entitlement activation. Signed webhook events are the sole source of financial truth.
