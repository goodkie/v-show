# dn’a-C06.13 — Client Review & Revision Automation

## 1. Client Review Flow
When QA passes, the orchestrator automatically generates a secure client preview link and prompts the customer:
- **[APPROVE SHOWROOM]** $\rightarrow$ Transitions job to `17_APPROVED` $\rightarrow$ `18_PUBLISH_QUEUED`.
- **[REQUEST CHANGES]** $\rightarrow$ Prompts feedback modal, creates revision record, transitions job to `16_REVISION_REQUIRED`.

## 2. Revision Safety
- Change requests never overwrite approved or live published revisions.
- Creates a new isolated `DRAFT` revision with full change-request tracking.
