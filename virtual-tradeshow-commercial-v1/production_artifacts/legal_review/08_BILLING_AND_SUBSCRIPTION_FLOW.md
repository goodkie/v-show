# 08. BILLING & SUBSCRIPTION FLOW
**vivPR V-Show — Payment Compliance Architecture**

---

## 1. Pre-Payment State (Phase 10.7L)
- **Stripe Mode:** `TEST`
- **Live Billing Enabled:** `false`
- **Billing Kill Switch:** `true`
- **Actual Cash Charged:** `$0.00`

---

## 2. Customer Upgrade Intent Workflow
When a free pilot customer expresses interest in PRO or BUSINESS:
1. Customer clicks "Upgrade to PRO" in Admin Console.
2. System calls `POST /api/customer/upgrade-intent`.
3. Server logs `upgrade_intent` with status `awaiting_live_billing_clearance`.
4. Grand Control notifies commercial team.
5. **No charge is attempted until full legal, tax, and operator approvals are satisfied.**
