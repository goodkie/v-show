# dn’a-C08.02 — Free Funnel Architecture

```mermaid
flowchart TD
    A[Landing Page: Upload 1 Photo + Business Name] --> B[Server-Side Free Usage & Quality Check]
    B -->|Passed| C[Fast-Path Photo Showroom Generation]
    B -->|Limit Exceeded| D[Offer Resume / Upgrade to PRO]
    B -->|Bad Image| E[Quality Rejection - Allowance Preserved]
    C --> F[Interactive Free Virtual Booth Ready]
    F --> G[Step 2: Click Product in Booth Image]
    G --> H[Product Name + Image Input]
    H --> I[AI Product Description Draft Assist]
    I --> J[Live Pinpoint & Product Drawer Rendered]
    J --> K[Action: Add 2nd Product / Save / Publish]
    K --> L[Commercial Plan Conversion: PRO / BUSINESS / CUSTOM]
    L --> M[Stripe Checkout or Enterprise Quote]
```

## Architectural Invariants
- **No Public Free Plan**: Free usage is strictly a **1-time preview generation entitlement**, not a recurring tier.
- **Value First**: No credit card, email, or lengthy forms required before experiencing the live interactive booth.
- **Truthful Labeling**: Single 2D photos are labeled as `FREE VIRTUAL BOOTH PREVIEW` (`PHOTO_SHOWROOM`), never fabricating false 360° or hallucinated geometry.
