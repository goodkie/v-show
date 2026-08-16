# DO NOT CONTACT (DNC) & COMPLIANCE POLICY
**vivPR V-Show — Privacy & Outreach Governance**

---

## 1. Do-Not-Contact Standard
- Whenever a recipient replies with an opt-out request or rejection, the Platform Owner immediately marks the prospect as `DNC`.
- The system automatically:
  1. Sets `doNotContact: true`.
  2. Cancels any scheduled `nextFollowUpAt`.
  3. Hard-blocks future `contacted` actions with `HTTP 400 PROSPECT_DO_NOT_CONTACT`.
- Bounced email addresses must never be retried.
