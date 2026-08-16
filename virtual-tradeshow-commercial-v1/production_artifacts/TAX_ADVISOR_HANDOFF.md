# TAX ADVISOR & ACCOUNTING HANDOFF MEMORANDUM
**Virtual Trade Show Commercial V1 — Pre-Live Commercial SaaS Tax Matrix**

---

## 1. Business Profile & Operations Summary
- **Entity / Trading Name:** vivPR
- **Business Address:** 1633 Center Ave, Fort Lee, NJ 07024, United States
- **Contact:** info@vivpr.pro
- **Primary Service:** B2B Software-as-a-Service (SaaS) — Cloud-hosted 3D virtual trade show exhibition, product showcases, and neural 3D booth reconstruction.
- **Billing Currency:** USD ($)
- **Payment Gateway:** Stripe, Inc. (Credit Card & Corporate Billing)
- **Current Tax Configuration Status:** **`REVIEW_REQUIRED`** (Stripe Tax currently NOT enabled)

---

## 2. Revenue Streams & Product Catalog

| Subscription Plan | Monthly Price | Service Description | Delivery Mechanism |
| :--- | :--- | :--- | :--- |
| **FREE Tier** | $0.00 | Digital catalog hosting & basic photo viewer | Pure Cloud SaaS |
| **PRO Tier** | $299.00 | Spark 3DGS Gaussian Splatting + 1 reconstruction credit + buyer analytics | Cloud SaaS + GPU Neural Compute |
| **BUSINESS Tier** | $799.00 | Spark 3DGS + 3 reconstruction credits + priority GPU processing | Enterprise Cloud SaaS + Priority Compute |

---

## 3. Tax Nexus & Accounting Review Checklist

### A. New Jersey State Tax Characterization
- **Physical Nexus:** Operational presence in Fort Lee, Bergen County, New Jersey.
- **SaaS Taxability in NJ:** Under NJ Sales and Use Tax (N.J.S.A. 54:32B-1 et seq.), prewritten software accessed via cloud/remote SaaS may be subject to standard NJ Sales Tax (6.625%) unless specific statutory exemptions apply.
- *Advisor Action:* Confirm taxability classification code for B2B cloud software subscriptions in NJ.

### B. US Multi-State Interstate Commerce (Economic Nexus)
- Exhibitors and event organizers may be located across other US states (e.g., California, New York, Texas).
- *Advisor Action:* Advise on monitoring economic nexus thresholds (e.g., $100,000 in gross revenue or 200 separate transactions per state) prior to scaling beyond the 1-customer pilot.

### C. International / Cross-Border Customers
- Exhibitors from the European Union (EU VAT reverse charge B2B rules), United Kingdom (HMRC VAT), Canada (GST/HST), and APAC.
- *Advisor Action:* Determine mandatory invoice line-item disclosures (e.g., customer Tax ID/VAT number validation, reverse charge notation).

### D. Stripe Tax Automated Calculation Integration Decision
- Stripe offers automated sales tax calculation (`Stripe Tax`).
- *Advisor Action:* Determine whether to activate Stripe Tax in live mode or handle sales tax filings via quarterly manual reconciliation.

---

## 4. Tax Advisor Review Record (Template)

```json
{
  "taxReviewStatus": "review_required",
  "reviewedBy": null,
  "reviewedAt": null,
  "cpaOrFirm": null,
  "njSalesTaxRegistered": false,
  "stripeTaxRecommended": false,
  "notes": "Pending formal CPA / Tax Advisor nexus determination."
}
```
