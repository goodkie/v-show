# FIRST 10 PROSPECT SPRINT RUNBOOK
**vivPR V-Show — Step-by-Step Outreach Operations Runbook**

---

## 1. Operator Workflow
1. **Prepare Prospects:** Fill out `/prospect-import-template.csv` with 10 real trade show exhibitors.
2. **Import Data:** Open `/grand-control.html` -> First 10 Outreach -> Click "Import Prospects".
3. **Dispatch Initial Outreach (Day 0):**
   - Click "Copy Email" -> Paste Subject & Body into your email client (e.g. Gmail / Outlook).
   - Send email manually to the exhibitor contact.
   - Click "Mark Sent" -> System automatically sets stage to `CONTACTED` and schedules next follow-up in 3–4 days.
4. **Monitor Responses:**
   - **Positive Reply:** Update stage to `INTERESTED` or `DEMO_PROPOSED`. Offer 15-minute 3D walkthrough.
   - **Question / Concern:** Answer technical/photo questions using `/capture-guide.html`.
   - **Do-Not-Contact / Rejection:** Click `DNC` button. System blocks all future outreach.
5. **Follow-Up #1 (Day 3–4):**
   - Check "Follow-Ups Due" section.
   - If no reply, send Follow-Up #1 template and mark sent.
6. **Follow-Up #2 (Day 8–11):**
   - Send final "Close the loop" template. If still no response, mark `NO_RESPONSE`.
7. **Free Pilot Onboarding:**
   - If exhibitor accepts Free Pilot, set stage to `PILOT_ACCEPTED`.
   - Use existing Grand Control Pre-Activation wizard to create the single REAL Pilot Customer (Quota: 1).
