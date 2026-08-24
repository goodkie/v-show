# dn'a-C07.23 — Billing Governance & Policy Registry

## Governance Version
`billing-governance-v1.0`

## Plan Pricing Policy
| Plan | Monthly Price (USD) | Price Version | Effective Date |
| :--- | :---: | :--- | :--- |
| PRO | \$299 | v1.0 | 2026-01-01 |
| BUSINESS | \$799 | v1.0 | 2026-01-01 |
| CUSTOM | By Quote | v1.0 | 2026-01-01 |

## Policy Documents
- **Terms of Service**: `termsVersion: "v1.0"`
- **Privacy Policy**: `privacyVersion: "v1.0"`
- **Refund Policy**: `refundPolicyVersion: "v1.0"` — 7-day refund window for first subscription payment only, at discretion of Product Owner.

## Consent Requirements for Checkout
Before a Stripe Checkout Session is created, the server verifies:
1. `consentTerms: true` — Customer consented to Terms of Service and Privacy Policy.
2. `consentRecurring: true` — Customer consented to recurring monthly billing.

Consent record is written to immutable `billingEvents` with `userId`, `plan`, `amount`, `acceptedAt`.
