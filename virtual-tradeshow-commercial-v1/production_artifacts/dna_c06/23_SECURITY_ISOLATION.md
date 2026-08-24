# dn’a-C06.23 — Security & Cross-Project Isolation

## Isolation Verification
1. **Tenant Isolation**: Project A cannot read or modify Project B (`CROSS_PROJECT_LEAK = 0`).
2. **Preview Security**: Preview tokens are project-scoped and cryptographically verified.
3. **No Dev Bypass for Customer Production**: `CUSTOMER_PRODUCTION_QA_BYPASS = false`. All live customer publish requests must pass QA and client approval.
4. **Billing Protection**: `PAYMENT_EXECUTION = false`, `REAL_CHARGE_COUNT = 0`.
