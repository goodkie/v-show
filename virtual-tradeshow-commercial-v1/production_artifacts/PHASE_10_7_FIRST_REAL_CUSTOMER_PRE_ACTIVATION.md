# PHASE 10.7 — FIRST REAL CUSTOMER PRE-ACTIVATION SPECIFICATION
**Virtual Trade Show Commercial V1 / vivPR — Commercial Readiness Specification**

---

## 1. Executive Summary
Phase 10.7 establishes complete operational readiness to onboard the first real commercial customer into an explicitly isolated `REAL` environment in **`PRE-ACTIVATION`** state.

- **Operating Entity:** `vivPR` (1633 Center Ave, Fort Lee, NJ 07024, United States, `info@vivpr.pro`)
- **Governing Law:** State of New Jersey, United States
- **Stripe Mode:** `TEST` (`stripeLiveBillingEnabled: false`, `billingKillSwitch: true`, Cash Charged: `$0.00`)
- **Pilot Customer Quota:** `LIVE_PILOT_MAX_CUSTOMERS = 1` (Server-side enforced with HTTP 409)
- **Overall Status:** **`FIRST_REAL_CUSTOMER_PRE_ACTIVATION_READY`** / **`NO-GO FOR LIVE BILLING`**

---

## 2. Architecture & Subsystems Implemented

1. **5-Step First Real Customer Onboarding Wizard (`/grand-control.html`):**
   - Step 1: Company Profile (Name, Admin Email, Website, Industry, Country/State)
   - Step 2: Event Association (Event Name, Start/End Dates, Booth #, Category)
   - Step 3: Booth Specs & Capture Intake (Expected Products, Hotspots, 60–100 Photos)
   - Step 4: Commercial Plan Selection (`pilot-2026.1`: Free $0 / Pro $299 / Biz $799 Monthly)
   - Step 5: Pre-Activation Review & Governance Safety Checks
2. **Strict REAL Customer Data Classification:**
   - Explicit `dataEnvironment: "REAL"`, `commercialStatus: "pre_activation"`, `billingStatus: "not_activated"`, `pilotCustomer: true`, `liveBillingAllowed: false`.
3. **Pilot Customer Quota & Server-Side Guard:**
   - Hard enforcement of 1 customer limit (`LIVE_PILOT_CUSTOMER_LIMIT_REACHED` -> 409 Conflict).
4. **13-Item Pre-Activation Checklist & 9-Card Launch Board:**
   - Grand Control visibility across Legal, Tax, Profile, Dataset, Plan, Stripe, Security, and Backup.
5. **Stripe Live Pre-Flight Panel (Read-Only):**
   - Deterministic status calculation (`BLOCKED` until all human attorney and CPA approvals are recorded).
6. **Pre-flight Capture QA & GPU Double-Gate:**
   - 60–100 multi-view validation, resolution summary, duplicate estimator, and double approval before GPU queue.
