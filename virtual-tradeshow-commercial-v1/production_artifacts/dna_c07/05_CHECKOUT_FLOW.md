# dn’a-C07.05 — Checkout Session Flow & Validation

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Frontend as dn’a Web Client
    participant Server as dn’a Backend
    participant Stripe as Stripe API

    Customer->>Frontend: Select PRO / BUSINESS ($299 or $799)
    Frontend->>Server: POST /api/billing/checkout (projectId, planKey)
    Note over Server: Server checks canonical plan, amount,<br/>and resolves Stripe Customer & Price ID
    Server->>Stripe: stripe.checkout.sessions.create({ mode: 'subscription', ... })
    Stripe-->>Server: session.url
    Server-->>Frontend: { checkoutUrl: session.url }
    Frontend->>Customer: Redirect to Stripe Hosted Checkout
```

## Anti-Tampering Rules
1. Server strictly derives `amountCents` and `PriceId` from canonical backend registry.
2. Any client payload containing custom price, currency, or cents is rejected (`HTTP 400`).
3. Reservation ID is validated against authenticated project/user ownership.
