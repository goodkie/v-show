# dn’a-C09.03 — Free-to-Paid Architecture & Lifecycle

```mermaid
flowchart TD
    A[FREE VIRTUAL BOOTH: FREE_PREVIEW] --> B[First Product Pinpoint + Detail]
    B --> C[Value Moment: Customer sees interactive booth]
    C --> D[Upgrade Trigger: Add 2nd Product / Publish]
    D --> E[Email Capture / Account Claim]
    E --> F[Stripe Checkout Session: CHECKOUT_PENDING]
    F --> G[Stripe Payment Form]
    G --> H[Return to App: PAYMENT_PROCESSING]
    G --> I[Verified Stripe Webhook: checkout.session.completed]
    I --> J[Financial State Reconciled: ACTIVE_PRO / ACTIVE_BUSINESS]
    J --> K[Same Project Unlocked: FREE_TO_PAID_DATA_REENTRY = 0]
```

## Commercial State Invariants
- `FREE_PREVIEW` → `UPGRADE_PENDING` → `CHECKOUT_PENDING` → `PAYMENT_PROCESSING` → `ACTIVE_PRO` / `ACTIVE_BUSINESS` / `CUSTOM_QUOTE_REQUESTED`.
- Project continuity: `FREE_PROJECT_ID_PRESERVED = true`.
- Zero Data Re-entry: `FREE_TO_PAID_DATA_REENTRY = 0`.
