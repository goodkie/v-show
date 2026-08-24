# dn’a-C06.16 — Failure Recovery & Safe States

## Error State Matrix

| Error Class | Trigger | Resulting State | System Action |
| :--- | :--- | :--- | :--- |
| **Q0 Source Reject** | Resolution $< 1280\times720$ or corrupt image | `BLOCKED_CUSTOMER_INPUT` | Task: `UPLOAD_BETTER_SOURCE`, customer notified. |
| **Transient Render Stall** | WebGL canvas context loss | `FAILED_RETRYABLE` | Auto-retry up to 3 times with backoff. |
| **Missing Product Data** | Optional spec fields missing | `WARNING (Non-blocking)` | Allow preview in `BASIC` completion tier. |
| **Unplaced Pinpoints** | Products added without coordinates | `PINPOINT_SETUP_REQUIRED` | Operator/Customer work queue assigned. |
| **Critical QA Failure** | Broken asset link or route mismatch | `BLOCKED_OPERATOR_REVIEW` | Publish gate locked; operator review triggered. |
