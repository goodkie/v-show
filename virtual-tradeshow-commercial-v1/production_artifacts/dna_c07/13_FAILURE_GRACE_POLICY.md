# dn'a-C07.13 — Payment Failure Grace Policy

## Grace Policy Matrix

| Status | Access Allowed | Publish Allowed | Project Data Deleted | Grace Period |
| :--- | :---: | :---: | :---: | :---: |
| `ACTIVE` | ✅ Full | ✅ Yes | Never | — |
| `PAST_DUE` | ✅ Read + Staging | ❌ Blocked | **Never** | 7 days |
| `SUSPENDED` | ✅ Read-only | ❌ Blocked | **Never** | Indefinite |
| `CANCELLED` | ✅ Read-only | ❌ Blocked | **Never** | Until Period End |
| `EXPIRED` | ✅ Read-only | ❌ Blocked | **Never** | — |

## Key Invariant: `PROJECT_DATA_DELETION_ON_PAYMENT_FAILURE = 0`
No project data (booths, products, media, pinpoints, leads, analytics revisions) is destroyed due to payment failure. Projects are retained indefinitely in a read-only state. Customers can always export and recover their data.

## Recovery Notification
When `PAST_DUE` or `SUSPENDED` is detected, the UI shows a non-destructive banner pointing to the Customer Portal to update the payment method and restore access.
