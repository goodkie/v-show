# dn'a-C07.11 — Customer Portal

## Endpoint
`POST /api/billing/portal`

## Flow
1. Server resolves `stripeCustomerId` from authenticated session.
2. Calls `stripe.billingPortal.sessions.create({ customer, return_url })`.
3. Returns `{ portalUrl }` — frontend redirects customer.

## Return URL
`/billing.html` (dn'a billing account page)

## Portal Capabilities Enabled
- Payment method update
- Invoice / receipt download
- Subscription cancellation

## Security Invariants
- Customer can only access their own portal (server resolves customerId).
- No cross-customer portal access.
- Developer Lab: Test portal only (Test Stripe Customer).
