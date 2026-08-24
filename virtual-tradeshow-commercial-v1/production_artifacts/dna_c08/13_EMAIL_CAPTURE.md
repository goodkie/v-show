# dn’a-C08.13 — Progressive Email Capture

## Non-Intrusive Capture Timing
- **Never upfront**: Email is NOT asked prior to viewing the generated booth.
- **Triggered on Value Retention**:
  - `SAVE YOUR BOOTH`
  - `Enter your work email so you can return anytime.`
- **API**: `POST /api/free-funnel/projects/:id/save-email`
  - Stores email in project draft and returns secure resume token.
