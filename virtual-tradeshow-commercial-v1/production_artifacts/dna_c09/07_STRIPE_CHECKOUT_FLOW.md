# dn’a-C09.07 — Stripe Checkout Server Authority Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Frontend as Studio UI
    participant Backend as Express Server
    participant Stripe as Stripe API

    Customer->>Frontend: Click "CONTINUE WITH PRO" ($299)
    Frontend->>Backend: POST /api/billing/create-checkout-session { projectId, requestedPlan: "pro" }
    Note over Backend: 1. Server resolves authoritative price ID<br/>2. Reuses existing Stripe Customer ID<br/>3. Sets metadata: { projectId, orgId, requestedPlan }
    Backend->>Stripe: stripe.checkout.sessions.create(...)
    Stripe-->>Backend: { url: "https://checkout.stripe.com/c/pay/..." }
    Backend-->>Frontend: { checkoutUrl: "..." }
    Frontend->>Stripe: Redirect to Hosted Checkout
```

## Security Invariants
- **Client Amounts Rejected**: The frontend cannot pass custom cent amounts or arbitrary price overrides (`CLIENT_ARBITRARY_AMOUNT_ALLOWED = false`).
- **Server-Controlled Price ID**: Server matches `requestedPlan` strictly against its canonical registry.
- **Stripe Customer Reuse**: Reuses customer record (`DUPLICATE_STRIPE_CUSTOMER_FOR_SAME_ACCOUNT = 0`).
