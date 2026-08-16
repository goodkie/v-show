# UPGRADE INTENT GOVERNANCE & REVENUE SAFETY
**vivPR V-Show — Pipeline vs Revenue Accounting Standards**

---

## 1. Upgrade Intent Lifecycle
When a customer clicks "Upgrade to PRO":
1. API Endpoint: `POST /api/customer/upgrade-intent`.
2. Record State: `status: "awaiting_live_billing_clearance"`.
3. Financial Impact: Strictly $0.00 cash charged.
4. Grand Control Reporting: Displayed as **Pipeline Value / Potential Revenue**, NEVER as recognized MRR or ARR.

---

## 2. Invariants
- `REAL Paid Customers = 0`
- `REAL MRR = $0.00`
- `REAL ARR = $0.00`
- `Actual Cash Charged = $0.00`
