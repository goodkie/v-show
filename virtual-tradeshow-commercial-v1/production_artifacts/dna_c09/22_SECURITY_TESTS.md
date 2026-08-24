# dn’a-C09.22 — Security Tests & Defense Matrix

## Security Test Specifications
1. **Price Tampering**: Client passing arbitrary cent amounts or manipulated price IDs is strictly rejected.
2. **Cross-Tenant Project Hijack**: Upgrading a project owned by another organization returns `403 Forbidden`.
3. **Webhook HMAC Spoofing**: Webhook payloads with missing/invalid signatures return `400 Bad Request`.
4. **Duplicate Webhooks**: 10 concurrent identical webhook deliveries produce exactly 1 financial effect (`WEBHOOK_DUPLICATE_EFFECT = 0`).
