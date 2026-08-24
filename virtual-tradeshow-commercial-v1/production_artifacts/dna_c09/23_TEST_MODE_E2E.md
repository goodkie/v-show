# dn’a-C09.23 — Test Mode E2E Test Suite Specification

## Automated Test Coverage (`test_dna_c09_e2e.js`)
- **Test A**: Free project → PRO test checkout → webhook → `ACTIVE_PRO` → publish unlocked.
- **Test B**: Free project → BUSINESS test checkout → webhook → `ACTIVE_BUSINESS` → 10 views / 100 pinpoints unlocked.
- **Test C**: Free project → CUSTOM quote requested → sales ticket created, project preserved.
- **Test D**: Price / amount tampering rejected by server.
- **Test E**: Cross-tenant project ID checkout attempt rejected with `403/404`.
- **Test F**: 10 identical webhook deliveries produce 1 financial effect (`WEBHOOK_DUPLICATE_EFFECT = 0`).
- **Test G**: Payment failure sets `PAST_DUE` with 0 project data loss.
- **Test H**: PRO → BUSINESS subscription update with proration.
- **Test I**: Cancellation at period end and reactivation verification.
- **Test J**: Stripe success redirect arrives before webhook → remains `PAYMENT_PROCESSING`, webhook arrives → transitions to `ACTIVE`.
