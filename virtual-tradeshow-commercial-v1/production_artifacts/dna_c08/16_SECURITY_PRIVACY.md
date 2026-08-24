# dn’a-C08.16 — Security & Privacy Controls

## Privacy Principles
- **HMAC IP Hashing**: Raw client IP addresses are never permanently exposed in client-facing payloads or public tables.
- **Strict Payload Sanitization**: Product names and descriptions are sanitized to prevent XSS.
- **C07 Payment Isolation**: No raw card handling, Stripe-only customer billing.
- **Fail-Closed Entitlements**: Free previews cannot publish to live commercial exhibition showcases without paid plan activation.
