# dn’a-C07.01 — C06 Baseline & Invariants

## 1. Baseline Status
- **dn’a-C05.1**: PASS (Photo Immersive Pipeline & Spherical Coordinate Model).
- **dn’a-C05.2**: PASS (Smart Source-to-Immersive Gate & Quality Router).
- **dn’a-C05.3**: DEVELOPER_LAB_READY (Privileged Developer Lab & Audit Shield).
- **dn’a-C06**: AUTOMATED_PRODUCTION_ORCHESTRATOR_READY (23-stage state machine, atomic publish, idempotency).

## 2. Commercial Pricing & Billing Invariants
- **Public Plans**: Exactly 3 plans (`PRO`, `BUSINESS`, `CUSTOM`).
- **Public Free Plan**: `NONE` (Zero public free plan).
- **Payment Provider**: Stripe as the ONLY customer payment provider (`STRIPE_ONLY_BILLING = true`).
- **Legacy Gateways**: `EPIPAY_DEPENDENCY = 0`, zero PayPal, zero Square, zero raw card storage.
- **Live Payment Execution**: `PAYMENT_EXECUTION = false`, `REAL_CHARGE_COUNT = 0`, `FIRST_LIVE_PAYMENT_OWNER_APPROVAL = pending`.
