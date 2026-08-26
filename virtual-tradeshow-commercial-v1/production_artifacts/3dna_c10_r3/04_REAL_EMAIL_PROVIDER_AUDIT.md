# 04. Real Email Provider Audit
- **Active Provider**: `RESEND` (Resend API v1).
- **Sender Domain**: `onboarding@resend.dev`
- **Fail-Closed Policy**: `SANDBOX_SIMULATED_ALLOWED_IN_PRODUCTION=false`.
- **Behavior**: Real provider delivers OTP; returns error immediately if unconfigured or rejected without creating fake success.