# dn'a-C07.17 — Security Threat Model

## Threats & Mitigations

| Threat | Mitigation |
| :--- | :--- |
| Price Tampering (client sends altered amount) | Server derives all amounts & Price IDs from canonical registry. Client price inputs are ignored. |
| Fake Webhook Injection | HMAC signature verification via `stripe.webhooks.constructEvent`. Any invalid signature → `HTTP 400` |
| Replay Attack (same event) | Deduplication via `providerEventId` — zero duplicate effect. |
| Cross-Customer Access | Stripe Customer ID resolved from authenticated session, not from client payload. |
| Card Data Exfiltration | Zero card storage. Stripe handles all card data. |
| Live Mode Activation Abuse | `LIVE_BILLING_ENABLED = false` kill-switch. Requires explicit Product Owner authorization. |
| Arbitrary Plan Injection (e.g., free or internal_dev) | Server validates `requestedPlan` is strictly `'pro'` or `'business'`. |
| Session Token Leakage | `devLabToken` is server-generated, never sent over insecure channels. |

## Kill-Switch Enforcement
`LIVE_BILLING_ENABLED = false` is enforced at 3 layers:
1. Environment variable check at server startup.
2. Feature flag check at checkout endpoint.
3. Feature flag check at webhook event processing.
