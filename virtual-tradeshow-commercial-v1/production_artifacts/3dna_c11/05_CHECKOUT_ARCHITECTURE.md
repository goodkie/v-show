# 05. Checkout Session Architecture
- **Creation Source**: Server-Side Endpoint (`POST /api/free-funnel/projects/:id/create-checkout-session`).
- **Metadata**: `projectId`, `businessName`, `verifiedEmail`, `requestedPlan`, `paymentCorrelationId`.