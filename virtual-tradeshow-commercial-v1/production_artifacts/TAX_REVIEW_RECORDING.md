# TAX REVIEW RECORDING SPECIFICATION
**Virtual Trade Show Commercial V1 — CPA / Tax Nexus Audit Protocol**

---

## 1. Protocol Overview
Tax readiness determinations are recorded via `/api/platform/governance/tax-review`.

---

## 2. 5-Point Professional Tax Questionnaire
1. **New Jersey Sales Tax Treatment:** Has digital SaaS / virtual booth hosting been analyzed under NJ Sales & Use Tax Act?
2. **US Interstate Economic Nexus:** Are state sales thresholds (e.g. Wayfair standards) tracked?
3. **International VAT / GST:** Are B2B cross-border reverse charge rules documented?
4. **Stripe Tax Activation:** Is Stripe automated tax calculation recommended?
5. **Tax Registration:** Are state registration certificates required?

---

## 3. Data Structure
```json
{
  "status": "review_required | approved | changes_required",
  "reviewedBy": "CPA / Accounting Firm",
  "notes": "Formal memorandum summary",
  "answers": {
    "njTaxReviewed": true,
    "usInterstateNexusReviewed": true,
    "internationalVatReviewed": true,
    "stripeTaxRequired": false,
    "taxRegistrationRequired": true
  }
}
```
