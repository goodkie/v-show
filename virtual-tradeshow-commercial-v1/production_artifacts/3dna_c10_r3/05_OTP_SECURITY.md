# 05. OTP Security Architecture
- **Format**: 6 numeric digits (cryptographically secure).
- **Expiration**: 10 minutes (600 seconds).
- **Single-Issue Guarantee**: 5-second idempotency cooldown (`OTP_DUPLICATE_ISSUE_ON_SINGLE_ACTION=0`).
- **Single-Use**: Invalidation on first successful verification.
- **Attempt Limit**: Max 5 invalid attempts before session lockout.