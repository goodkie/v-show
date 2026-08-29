# 03. PROJECT STATUS MODEL

## 1. Canonical Status State Machine
- `DRAFT` -> Initial creation
- `AWAITING_SOURCE` -> Waiting for customer image upload
- `PROCESSING` -> Active AI Super-Resolution / Experience build
- `MANUAL_REVIEW_REQUIRED` -> Commercial occlusion or edge blur flagged
- `READY_FOR_QA` -> Internal team quality check
- `CUSTOMER_REVIEW` -> Customer preview & sign-off
- `READY_TO_PUBLISH` -> Approved and ready for live cutover
- `PUBLISHED` -> Publicly accessible on `/booth/:id`
- `PAUSED` -> Temporarily unlisted by customer/admin
- `ARCHIVED` -> Post-event historical preservation
- `FAILED` -> Terminal error with re-upload prompt
