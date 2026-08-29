# 07. PAYMENT & STRIPE GOVERNANCE

## 1. Owner Safety Lock
- **PAYMENT_PILOT_ARMED**: `false`
- **REAL_CHARGE_COUNT**: 0
- **STRIPE_MODE**: `test`
- **WEBHOOK_AUTHORITY**: All entitlement activations require signature-verified server webhook events; client redirects are never trusted.
