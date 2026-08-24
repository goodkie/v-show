# dn'a-C07.14 — Production Orchestrator Publish Gate

## Gate Enforcement
`PUBLISH_BILLING_GATE_SERVER_SIDE = true`

## Server-Side Gate Logic
```javascript
function canPublishToLive(project, subscription, org) {
  // INTERNAL_DEV bypass (developer lab only)
  if (org.entitlement === 'INTERNAL_DEV') return { allowed: true };

  // Custom plan with manual approval
  if (org.subscription?.plan === 'custom' && org.subscription?.customApproved) return { allowed: true };

  // Active subscription required
  if (!subscription || subscription.status !== 'active') {
    return {
      allowed: false,
      reason: 'SUBSCRIPTION_REQUIRED',
      message: 'An active PRO or BUSINESS subscription is required to publish to the live showroom.'
    };
  }

  return { allowed: true };
}
```

## Publish Endpoint Gate
Applied at `POST /api/production/jobs/:id/publish` and `POST /api/stages/:id/execute` stage 23.
