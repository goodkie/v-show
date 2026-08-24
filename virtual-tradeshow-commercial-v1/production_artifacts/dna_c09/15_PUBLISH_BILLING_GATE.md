# dn’a-C09.15 — Publish Billing Gate & Server Enforcement

## Server Gate Rule
```javascript
function canPublishProject(project, org) {
  if (project.commercialState === 'ACTIVE_PRO' || project.commercialState === 'ACTIVE_BUSINESS') {
    return { allowed: true };
  }
  if (project.commercialState === 'CUSTOM_APPROVED') {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'PUBLISH_REQUIRES_ACTIVE_PLAN',
    message: 'Publishing to live trade show buyers requires an active PRO or BUSINESS subscription.'
  };
}
```
- Server-side rejection with `403 Forbidden` if unentitled project attempts public publish.
