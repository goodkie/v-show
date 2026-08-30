# 06_EMAIL_STATE_MACHINE — VERIFICATION STATE MACHINE

- **States Supported**:
  - `UNVERIFIED`
  - `VERIFICATION_SENDING`
  - `VERIFICATION_SENT`
  - `VERIFIED`
  - `VERIFICATION_FAILED`
  - `VERIFICATION_EXPIRED`
- **UI Elements**:
  - Masked target email display (`#verify-target-email`).
  - 6-digit OTP inputs with auto-advance, backspace navigation, paste support, and auto-submit on 6th digit.
  - 10-minute expiration countdown timer.
  - 60-second resend cooldown timer.
