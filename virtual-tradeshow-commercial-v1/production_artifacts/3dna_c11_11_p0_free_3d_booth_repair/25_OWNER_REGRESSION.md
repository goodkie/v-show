# 25_OWNER_REGRESSION — DIRECT OWNER REGRESSION TEST

- **Regression Condition**: Business Name filled + Work Email filled + Booth Photo selected + "Photo Ready!".
- **CTA Click**: "CREATE 3D BOOTH" clicked.
- **Result**: Successfully transitions to `#inline-verify-panel`, dispatches email verification, and proceeds to 3D booth creation upon OTP entry.
- **Status**: `OWNER_REPORTED_NOOP_FIXED=true`.
