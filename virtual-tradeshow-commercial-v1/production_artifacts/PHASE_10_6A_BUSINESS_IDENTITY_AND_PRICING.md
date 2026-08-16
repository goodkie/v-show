# PHASE 10.6A — Business Identity & Pilot Pricing Approval Specification

**Platform:** Virtual Trade Show Commercial V1  
**Phase:** 10.6A (Business Identity + Pilot Pricing Approval)  
**Status:** Approved for Pilot (`pricingStatus: 'approved_for_pilot'`)  
**Stripe Live Mode:** OFF (`STRIPE_MODE=test`, `stripeLiveBillingEnabled=false`, `billingKillSwitch=true`)  
**Real Cash Charged:** $0.00  

---

## 1. Executive Summary

Phase 10.6A establishes the governance infrastructure for Business Identity configuration and formally approves the **Pilot Pricing Architecture** (v2026.1) for controlled customer pilots. It ensures that while pricing structure and plan entitlements are ready for pilot validation, no real monetary charges occur until the platform owner supplies verified legal business information and explicitly approves Stripe Live billing.

---

## 2. Business Identity Configuration Architecture

Business identity details are centralized in `server/db.js` and exposed via `/api/platform/launch-readiness` for deterministic verification.

| Configuration Field | Runtime Value / Configured | Status | Purpose |
| :--- | :--- | :--- | :--- |
| `LEGAL_BUSINESS_NAME` | `vivPR` | `COMPLETE` | Statutory commercial vendor identity on invoices & terms |
| `LEGAL_BUSINESS_ADDRESS` | `1633 Center Ave, Fort Lee, NJ 07024, United States` | `COMPLETE` | Corporate postal address for tax nexus and legal service |
| `LEGAL_CONTACT_EMAIL` | `info@vivpr.pro` | `COMPLETE` | Commercial and legal inquiry inbox |
| `LEGAL_SUPPORT_EMAIL` | `info@vivpr.pro` | `COMPLETE` | Customer service & technical support contact |
| `GOVERNING_LAW` | `State of New Jersey, United States` | `COMPLETE` | Jurisdiction clause for Terms of Service |

### Safety Invariant
With all fields populated, Grand Control marks `businessIdentity` as **`COMPLETE`** (`READY`).
Stripe Live remains **`OFF`** (`STRIPE_MODE=test`, `stripeLiveBillingEnabled=false`, `billingKillSwitch=true`) with $0.00 actual cash charged pending legal review (`legalReviewStatus=PENDING`) and owner approval.


---

## 3. Pilot Pricing Approval Architecture

### Approved Pilot Tier Structure
- **FREE Tier:** $0.00 / month
  - 5 Products, 3 Hotspots, Standard Photo Preview, Core Lead Capture
- **PRO Tier (Pilot Approved):** $299.00 / month (Monthly Recurring)
  - 25 Products, 15 Hotspots, Full Spark 3DGS Neural Reconstruction (SPZ/PLY), Buyer Analytics CSV Export
- **BUSINESS Tier (Pilot Approved):** $799.00 / month (Monthly Recurring)
  - 100 Products, 50 Hotspots, Priority GPU Reconstruction, Dedicated Showhost WebRTC Stream, Priority Operations

### Governance State
- `pricingVersion`: `'pilot-2026.1'`
- `pricingStatus`: `'approved_for_pilot'`
- `permanentPricingStatus`: `'NOT_APPROVED'` (Permanent post-pilot pricing requires empirical conversion & GPU cost audit)

---

## 4. Checkout Consent Version Auditing

Every subscription checkout creation logs full deterministic consent metadata to `db.billingEvents`:
```json
{
  "id": "bill-evt-...",
  "type": "checkout_session_created",
  "orgId": "org-apex-01",
  "plan": "pro",
  "amountUsd": 299,
  "currency": "usd",
  "interval": "month",
  "pricingVersion": "pilot-2026.1",
  "termsVersion": "2026.1-draft",
  "privacyVersion": "2026.1-draft",
  "refundPolicyVersion": "2026.1-draft",
  "acceptedAt": "2026-08-16T20:45:00.000Z",
  "stripeMode": "test"
}
```
