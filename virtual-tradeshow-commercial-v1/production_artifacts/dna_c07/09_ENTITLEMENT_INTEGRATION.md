# dn’a-C07.09 — Entitlement Integration & Enforcement

## Server-Side Entitlement Resolution
```javascript
function resolveProjectEntitlements(project, subscription) {
  // If INTERNAL_DEV, full capabilities granted with zero billing
  if (project.environment === 'INTERNAL_DEV' || subscription.environment === 'INTERNAL_DEV') {
    return { canPublish: true, maxViews: 999, maxProducts: 999, buyerTools: true };
  }

  // Active paid subscription
  if (subscription && subscription.status === 'ACTIVE') {
    const isBusiness = subscription.planKey === 'business';
    return {
      canPublish: true,
      maxViews: isBusiness ? 10 : 1,
      maxProducts: isBusiness ? 100 : 25,
      multiView: isBusiness,
      buyerTools: true,
      advancedAnalytics: isBusiness,
      managedSupport: isBusiness
    };
  }

  // Grace Period (PAST_DUE): Read-only & Staging allowed, Publish blocked
  if (subscription && subscription.status === 'PAST_DUE') {
    return { canPublish: false, maxViews: 1, maxProducts: 25, buyerTools: true, inGracePeriod: true };
  }

  // Unpaid / Reserved: Intake & Preview staging allowed, Final publish blocked
  return { canPublish: false, maxViews: 1, maxProducts: 25, stagingPreviewOnly: true };
}
```
