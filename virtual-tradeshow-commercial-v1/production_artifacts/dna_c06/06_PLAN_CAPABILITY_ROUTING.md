# dn’a-C06.06 — Plan Capability Routing

## Server-Side Capability Map

```javascript
const PLAN_CAPABILITY_MAP = {
  PRO: {
    maxViews: 1,
    maxProducts: 25,
    multiView: false,
    photoImmersive: true,
    interactive3D: false,
    advancedAnalytics: false,
    managedSupport: false,
    priorityQueue: false,
    customCapture: false,
    customIntegration: false
  },
  BUSINESS: {
    maxViews: 10,
    maxProducts: 100,
    multiView: true,
    photoImmersive: true,
    interactive3D: false,
    advancedAnalytics: true,
    managedSupport: true,
    priorityQueue: true,
    customCapture: false,
    customIntegration: false
  },
  CUSTOM: {
    maxViews: 50,
    maxProducts: 500,
    multiView: true,
    photoImmersive: true,
    interactive3D: true,
    advancedAnalytics: true,
    managedSupport: true,
    priorityQueue: true,
    customCapture: true,
    customIntegration: true
  },
  INTERNAL_DEV: {
    maxViews: 999,
    maxProducts: 999,
    multiView: true,
    photoImmersive: true,
    interactive3D: true,
    advancedAnalytics: true,
    managedSupport: true,
    priorityQueue: true,
    customCapture: true,
    customIntegration: true
  }
};
```

Capabilities are evaluated strictly on the backend and cannot be overridden by client request parameters.
