# dn’a-C09.08 — Webhook as Absolute Financial Truth

## Critical Invariant: Redirect vs. Webhook
- **Stripe Success Redirect**: Places the client in a temporary `PAYMENT_PROCESSING` holding screen with message: `WE'RE CONFIRMING YOUR PAYMENT`. It does **NOT** activate paid entitlement directly (`SUCCESS_RETURN_ACTIVATES_ENTITLEMENT = false`).
- **Verified Webhook**: Only an authenticated, HMAC-signed `checkout.session.completed` or `customer.subscription.created` webhook can transition project state to `ACTIVE_PRO` or `ACTIVE_BUSINESS` (`WEBHOOK_ACTIVATES_ENTITLEMENT = true`).
