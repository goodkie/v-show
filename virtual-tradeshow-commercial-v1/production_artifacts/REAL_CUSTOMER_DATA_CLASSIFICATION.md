# REAL CUSTOMER DATA CLASSIFICATION SPECIFICATION
**Virtual Trade Show Commercial V1 — Tenant Isolation & Classification Standard**

---

## 1. Mandatory Data Attributes
Every real customer must explicitly contain:

```json
{
  "dataEnvironment": "REAL",
  "commercialStatus": "pre_activation",
  "billingStatus": "not_activated",
  "pilotCustomer": true,
  "pricingVersion": "pilot-2026.1",
  "liveBillingAllowed": false,
  "preApprovedForBilling": false
}
```

---

## 2. Invariants & Guardrails
- **Fail-Closed Rule:** Never infer `REAL` from missing values. Default is `TEST`.
- **Zero Silent Conversion:** `TEST` or `SYNTHETIC_TEST` records can never be converted into `REAL`.
- **Zero KPI Contamination:** `REAL Paid Customers = 0`, `REAL MRR = $0` until live Stripe webhooks occur.
