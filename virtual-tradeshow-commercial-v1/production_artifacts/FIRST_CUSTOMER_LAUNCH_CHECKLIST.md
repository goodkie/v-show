# FIRST CUSTOMER LAUNCH CHECKLIST (13-POINT GATE)
**Virtual Trade Show Commercial V1 — Pre-Activation Gate Matrix**

---

## 1. 13-Point Deterministic Gate Table

| Gate ID | Gate Name | Current Status | Required Operational Milestone |
| :--- | :--- | :---: | :--- |
| `business_identity` | Business Identity | **`READY`** | vivPR (1633 Center Ave, Fort Lee, NJ, USA, info@vivpr.pro) |
| `pricing_approval` | Pilot Pricing Approval | **`READY`** | pilot-2026.1 ($0 / $299 / $799 USD Monthly) |
| `terms_legal` | Terms of Service Legal Review | **`BLOCKED`** | Human Attorney review of Terms draft |
| `privacy_legal` | Privacy Policy Legal Review | **`BLOCKED`** | Human Attorney review of Privacy draft |
| `refund_legal` | Refund Policy Legal Review | **`BLOCKED`** | Human Attorney review of Refund draft |
| `tax_review` | Tax / Accounting Nexus Review | **`BLOCKED`** | CPA review of NJ & US multi-state nexus |
| `customer_profile` | Customer Profile Verification | **`READY`** | Customer company profile submitted via Wizard |
| `customer_email` | Customer Admin Verification | **`READY`** | Valid exhibitor admin email & credential created |
| `booth_dataset` | Booth Dataset & Capture QA | **`PENDING`** | 60–100 photos submitted and QA passed |
| `plan_selection` | Commercial Plan Entitlement | **`READY`** | Pilot plan selection (FREE / PRO / BUSINESS) |
| `stripe_customer` | Stripe Customer Tokenization | **`PENDING`** | Tokenized via Stripe Test Checkout |
| `live_allowlist` | Live Billing Allowlist Gate | **`BLOCKED`** | Customer added to `liveBillingAllowedOrgs` |
| `owner_approval` | Platform Owner Live Sign-off | **`BLOCKED`** | Explicit sign-off by Platform Owner |

---

## 2. Overall Gate Logic
The platform calculates `overallStatus`:
- `BLOCKED_CUSTOMER_DATA`: No customer created yet.
- `BLOCKED_LEGAL`: Legal review incomplete.
- `BLOCKED_TAX`: Tax review incomplete.
- `READY_FOR_CONTROLLED_LIVE_ACTIVATION`: All 13 items `READY`.
