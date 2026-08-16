# PHASE 10.7R — FIRST REAL CUSTOMER ACQUISITION & ACTIVATION REHEARSAL
**Virtual Trade Show Commercial V1 / vivPR — Commercial Operations Specification**

---

## 1. Executive Summary
Phase 10.7R establishes the end-to-end commercial funnel to acquire, qualify, onboard, activate, and rehearse conversion with vivPR's first real paying customer.

- **Entity:** `vivPR` (1633 Center Ave, Fort Lee, NJ 07024, United States, `info@vivpr.pro`)
- **Governing Law:** State of New Jersey, United States
- **Stripe Mode:** `TEST` (`stripeLiveBillingEnabled: false`, `billingKillSwitch: true`, Cash Charged: `$0.00`)
- **Pilot Customer Quota:** `LIVE_PILOT_MAX_CUSTOMERS = 1` (Server-side enforced with HTTP 409)
- **Status:** **`PHASE_10_7R_ENGINEERING_COMPLETE`** / **`FIRST_REAL_CUSTOMER_ACQUISITION_READY`** / **`NO-GO FOR LIVE BILLING`**

---

## 2. Integrated Subsystems Built in Phase 10.7R
1. **Public Commercial SaaS Landing Page (`/` / `index.html`):**
   - Value Proposition: "Turn Your Real Trade Show Booth Into an Interactive Virtual Showroom".
   - Pilot Pricing: Free $0 / Pro $299 / Business $799 USD Monthly.
   - 100% English-only copy, OpenGraph tags, zero deceptive overclaiming.
2. **Interactive 3D Demo (`/demo.html`):**
   - Synthetic 3D Gaussian Splatting showroom with touch gestures and safe-area insets.
3. **Free Pilot Application Form (`/start.html`):**
   - 5-step form capturing Company, Event, Photo readiness (60+), Product tier, Commercial goal, and explicit Privacy Policy acknowledgement.
4. **Sales Pipeline & Lead CRM in Grand Control (`/grand-control.html`):**
   - Stages: `NEW`, `CONTACTED`, `QUALIFIED`, `DEMO_SCHEDULED`, `DEMO_COMPLETED`, `PILOT_OFFERED`, `PRE_ACTIVATION`, `ACTIVATED`, `NOT_NOW`, `LOST`.
   - Single-click lead to pre-activation conversion with quota protection.
5. **Value Milestone Engine & Contextual PRO Recommendations:**
   - 10 server-side value milestones (`booth_published`, `first_buyer_view`, `10_views`, `first_hotspot`, `first_lead`, `first_rfq`).
   - Contextual upgrade moments when hitting Free limits (product #6, hotspot #4, 3DGS request).
6. **Customer Activation Score & Pro Upgrade Readiness:**
   - Algorithmic scoring (0–100) and structured qualification reasons.
7. **Acquisition Analytics & First Customer Playbook:**
   - 16-step playbook tracking funnel progression with zero real MRR contamination ($0.00).
8. **Booth Photo Capture Guide (`/capture-guide.html`):**
   - 60–100 photo multi-angle perimeter orbit guide.
