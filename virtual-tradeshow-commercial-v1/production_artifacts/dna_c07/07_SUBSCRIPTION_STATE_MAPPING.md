# dn’a-C07.07 — Canonical Subscription State Mapping

| Stripe Raw Status | dn’a Canonical State | Production Access | Action Required |
| :--- | :--- | :---: | :--- |
| `active` | `ACTIVE` | Allowed | Normal renewal active |
| `trialing` | `TRIALING` | Allowed | Trial period active |
| `incomplete` | `INCOMPLETE` | Staging Only | Complete 3DS payment |
| `past_due` | `PAST_DUE` | Grace Period | Update payment method |
| `unpaid` | `SUSPENDED` | Read Only | Payment required |
| `canceled` | `CANCELLED` | Read Only | Reactivate / re-subscribe |
| `incomplete_expired` | `EXPIRED` | Read Only | Session expired |
