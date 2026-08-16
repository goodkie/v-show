# TAX AND BILLING READINESS SPECIFICATION
**Virtual Trade Show Commercial V1 — Pre-Live Commercial Review**

---

## 1. Executive Status
- **Tax Readiness Status:** **`REVIEW_REQUIRED`**
- **Stripe Tax Mode:** **`NOT_ENABLED`**
- **Legal Entity:** `vivPR` (1633 Center Ave, Fort Lee, NJ 07024, United States)
- **Jurisdiction:** State of New Jersey, United States
- **Billing Engine:** Stripe Test Mode (API Version 2023-10-16 / SDK 22.5.0)

---

## 2. Tax Determination Areas for CPA / Accounting Counsel

1. **New Jersey Sales Tax (N.J.S.A. 54:32B-1 et seq.):**
   - Determination of whether cloud-hosted 3D virtual trade show booths constitute taxable digital property/SaaS in New Jersey (6.625% state rate).
2. **Interstate US Commerce:**
   - Tracking economic nexus thresholds across California, New York, Texas, and other attendee states.
3. **Cross-Border International Taxation:**
   - EU VAT Reverse Charge rules for B2B exhibitors.
   - UK HMRC VAT compliance.
4. **Stripe Tax Automated Calculation:**
   - Evaluated as an optional turn-key integration once live Stripe keys are configured and formal CPA nexus determination is established.

---

## 3. Launch Blocker Integration
The Grand Control Center actively enforces `taxReadiness: 'review_required'`, which keeps the Tax Review blocker in state **`REVIEW_REQUIRED`**, preventing live Stripe activation until signed off by the platform owner.
