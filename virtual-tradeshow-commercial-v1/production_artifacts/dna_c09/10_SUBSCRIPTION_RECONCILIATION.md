# dn’a-C09.10 — Subscription Reconciliation

## Canonical Data Mapping
```text
Customer Account (User)
  ↕
Organization (Exhibitor)
  ↕
Stripe Customer ID (cus_...)
  ↕
Stripe Subscription ID (sub_...)
  ↕
Project (prj-free-... retained throughout)
```

- When Stripe subscription updates (`customer.subscription.updated`), the organization and linked project states synchronize automatically.
