# FIRST CUSTOMER FUNNEL DEFINITION
**vivPR V-Show — Stage Definitions & Conversion Invariants**

---

## 1. Funnel Stages
1. `new`: Application received via `/pilot-apply.html` or `/start.html`.
2. `contacted`: Initial outreach or confirmation email sent.
3. `qualified`: Qualification score $\ge 40$ with verified trade show event.
4. `demo_scheduled`: 15-minute 3D walkthrough booked.
5. `demo_completed`: Walkthrough delivered.
6. `pilot_invited`: Free pilot terms sent to exhibitor.
7. `pilot_accepted`: Exhibitor confirmed participation.
8. `onboarding`: Account credentials created (`mustChangePassword: true`).
9. `capture_pending`: Awaiting 60–100 booth photographs.
10. `capture_received`: Photos submitted and passed pre-flight QA.
11. `booth_building`: 3DGS radiance field reconstruction active.
12. `booth_published`: Virtual showroom active in Exhibition Lobby.
13. `pilot_active`: Active buyer traffic and lead generation.
14. `success_review`: Pilot performance report generated.
15. `upgrade_intent`: Customer requested PRO ($299/mo).
16. `closed_won_pending_billing`: Awaiting legal/tax/Stripe live clearance.
17. `closed_lost`: Opportunity closed.
