# dn’a-C09.20 — Invoice Reconciliation & Financial Ledger

## Immutable Financial Ledger
- Data: `db.getFinancialLedger()`.
- Records: `provider`, `environment` (`TEST` vs `LIVE`), `event`, `customerId`, `organizationId`, `projectId`, `subscriptionId`, `amount`, `currency`, `providerEventId`, `timestamp`.
- Zero Card Contamination: Raw PAN/CVC is never stored in application database.
- Zero Revenue Contamination: `TEST_TO_LIVE_REVENUE_CONTAMINATION = 0`.
