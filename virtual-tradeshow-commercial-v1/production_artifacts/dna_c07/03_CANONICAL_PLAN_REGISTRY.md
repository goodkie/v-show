# dn’a-C07.03 — Server-Side Canonical Plan Registry

## Canonical Plan Matrix

```typescript
interface CanonicalPlan {
  planKey: 'pro' | 'business' | 'custom';
  displayName: string;
  billingType: 'SUBSCRIPTION' | 'QUOTE';
  currency: 'USD';
  amountCents: number | null;
  interval: 'month' | 'custom';
  stripeTestPriceId: string;
  stripeLivePriceId: string;
  capabilities: {
    maxViews: number;
    maxProducts: number;
    multiView: boolean;
    photoImmersive: boolean;
    digitalCatalog: boolean;
    smartCard: boolean;
    buyerTools: boolean;
    advancedAnalytics: boolean;
    managedSupport: boolean;
    priorityProduction: boolean;
  };
  active: boolean;
}
```

| Plan Key | Display Name | Monthly Price | Type | Views | Products | Support |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `pro` | **PRO** | \$299 / mo (29,900¢) | Recurring Sub | 1 View (360°/2D) | 25 Products | Standard Email |
| `business` | **BUSINESS** | \$799 / mo (79,900¢) | Recurring Sub | 10 Views (Multi-View) | 100 Products | Priority Dedicated |
| `custom` | **CUSTOM** | Custom Quote | Quote-based | 50+ Views | 500+ Products | Enterprise SLA |

*No FREE plan is selectable for new exhibitors. INTERNAL_DEV is strictly restricted to internal engineering.*
