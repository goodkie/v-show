# LEGAL COUNSEL HANDOFF MEMORANDUM
**Virtual Trade Show Commercial V1 — Pre-Live Commercial SaaS Review**

---

## 1. Engagement Overview
- **Client / Operator:** vivPR
- **Business Address:** 1633 Center Ave, Fort Lee, NJ 07024, United States
- **Contact:** info@vivpr.pro
- **Jurisdiction:** State of New Jersey, United States
- **Platform:** Virtual Trade Show Commercial V1 (B2B SaaS Virtual Exhibition & 3D Gaussian Splatting Booth System)
- **Current Billing State:** Stripe Test Mode ($0.00 cash charged, Live Billing OFF)

---

## 2. Review Documents Index

The following clean draft policies are ready for external legal counsel review:

1. **Terms of Service Draft (`2026.1-draft`):** Located at `/terms.html`
2. **Privacy Policy Draft (`2026.1-draft`):** Located at `/privacy.html`
3. **Refund Policy Draft (`2026.1-draft`):** Located at `/refund-policy.html`
4. **Checkout Consent Architecture:** Exhibitor Admin mandatory pre-checkout checkboxes with immutable consent logging (`pricingVersion`, `termsVersion`, `privacyVersion`, `acceptedAt`).

---

## 3. Core Commercial Mechanisms Requiring Formal Legal Review

### A. 3D Gaussian Splatting (3DGS) Neural Reconstruction Disclosures
- The platform ingests 50–100 booth photos from exhibitors and executes cloud GPU reconstruction to generate 3D Gaussian splat models.
- *Legal Question:* Does the disclaimer in Section 4 of the Terms adequately limit warranty regarding mathematical/spatial variance from physical reality?

### B. Customer IP Ownership & AI Training Non-Use
- Exhibitors retain full intellectual property ownership of catalog photos, trademarks, and CAD/3D models.
- The platform warrants that customer uploads are **not** used to train public or foundational AI models.
- *Legal Question:* Is the limited license scope sufficient to cover distributed spatial rendering via WebGL2/SPZ without triggering unauthorized sublicensing disputes?

### C. Recurring Subscription & Refund Boundaries
- Monthly recurring billing at $299/mo (PRO) and $799/mo (BUSINESS).
- Proposes a 7-day refund window provided cloud GPU compute (3D reconstruction) has not commenced.
- *Legal Question:* Does this policy comply with New Jersey consumer/commercial protections, FTC negative option guidance, and EU/UK statutory withdrawal rules for digital B2B services?

### D. Data Privacy & Subprocessor Structure
- No credit card Primary Account Numbers (PAN) or security codes touch platform servers (100% tokenized via Stripe).
- Leads and digital business cards exchanged between buyers and exhibitors are transferred based on affirmative buyer action.
- Subprocessors: Railway.app (USA), Stripe (Global), Modal Labs (USA).
- *Legal Question:* Are there any required cross-border data transfer clauses (Standard Contractual Clauses) needed for international exhibitors?

---

## 4. Counsel Review Decision Record (Template)

```json
{
  "legalReviewStatus": "pending",
  "reviewedBy": null,
  "reviewedAt": null,
  "barNumberOrFirm": null,
  "approvedTermsVersion": null,
  "approvedPrivacyVersion": null,
  "approvedRefundVersion": null,
  "counselNotes": "Pending attorney formal signature."
}
```
