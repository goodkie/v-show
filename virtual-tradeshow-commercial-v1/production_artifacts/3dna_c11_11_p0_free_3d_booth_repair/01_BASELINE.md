# 01_BASELINE — OPERATIONAL BASELINE & INCIDENT CONTEXT

- **Phase**: ³DNa-C11.11-P0
- **Incident Priority**: P0 (Production Acquisition Funnel Functional Repair)
- **Starting Commit**: 8dbad73
- **Baseline Release Tag**: v11.10-first-customer-pre-onboarding-ready
- **Payment Invariants Preserved**:
  - `PAYMENT_PILOT_ARMED=false`
  - `REAL_CHARGE_COUNT=0`
  - `STRIPE_LIVE_MODE_CONFIGURED=false`
  - `REAL_BILLING_USED=false`
- **Precedence Rule**: Live Owner observation overrides prior synthetic reports. The free acquisition funnel is repaired end-to-end and verified with Puppeteer browser automation.
