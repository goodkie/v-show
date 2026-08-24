# dn’a-C09.16 — Payment Failure & Grace Policy

## Non-Destructive Grace Policy
- When payment fails (`invoice.payment_failed`):
  - State becomes `PAST_DUE`.
  - Email notification dispatched with retry link.
  - **Zero Data Deletion Guarantee**:
    - `PROJECT_DATA_DELETION_ON_PAYMENT_FAILURE = 0`
    - `PRODUCT_DATA_DELETION_ON_PAYMENT_FAILURE = 0`
    - `PINPOINT_DATA_DELETION_ON_PAYMENT_FAILURE = 0`
