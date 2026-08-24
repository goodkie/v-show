# dn’a-C07.10 — Custom Plan Qualification & Workflow

```mermaid
flowchart TD
    A[Customer Selects CUSTOM Plan] --> B[Intake / Custom Requirement Form]
    B --> C[Status: CUSTOM_QUOTE_REQUESTED]
    C --> D[No Fixed Instant Checkout Created]
    D --> E[Sales / Product Owner Commercial Review]
    E --> F[Owner Approves Custom Terms]
    F --> G[Custom Stripe Invoice or Manual Commercial Entitlement]
    G --> H[Status: CUSTOM_PAYMENT_APPROVED]
```

- **Zero \$0 Checkouts**: Custom plan never generates a synthetic $0 fixed checkout.
- **Enterprise Capabilities**: Upon owner approval, custom production capacity (50+ views, 500+ products, 3D twins) is unlocked.
