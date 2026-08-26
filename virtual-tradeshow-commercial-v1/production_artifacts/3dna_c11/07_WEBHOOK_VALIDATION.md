# 07. Webhook Validation
- **Event**: `checkout.session.completed`.
- **Signature**: Verified using `STRIPE_WEBHOOK_SECRET` (`WEBHOOK_SIGNATURE_REQUIRED=true`).
- **Source of Truth**: `WEBHOOK_SOURCE_OF_TRUTH=true`, `CLIENT_REDIRECT_CAN_ACTIVATE_PLAN=false`.