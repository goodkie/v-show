# 08_RESEND_VERIFICATION — RESEND CONTROLS & RATE LIMITING

- **Button**: `#btn-resend-otp` ("RESEND CODE").
- **Cooldown**: 60-second enforced client cooldown timer + server-side 15-minute sliding window rate limiter (max 8 requests).
- **Status Feedback**: Live status toast `#otp-status-msg` confirming "New confirmation code sent to your email."
