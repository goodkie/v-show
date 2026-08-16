# Phase 10.7N — Synthetic Owner Rehearsal

Launch-day interface/database rehearsal using synthetic records only.

## Golden demo
Use `syn-wilo-001` as the fully dressed demonstration booth. The visual source is the user-supplied Wilo booth reference. Generated visuals are demo/reference assets, not official Wilo assets, endorsement, or a real customer deployment.

## Fixtures
Load `app_build/seed/demo_businesses_phase10_7n.json` only into `SYNTHETIC_TEST`. Ten records cover pipeline states from READY_TO_CONTACT through PILOT_PROPOSED.

## Hard invariants
- Never import fixtures into REAL.
- Never send email to fixture addresses; all use `.example.invalid`.
- Never increment REAL prospects, pilot quota, paid customers, MRR, ARR, conversion or acquisition metrics.
- Stripe stays TEST; Live Billing OFF; Billing Kill Switch ON.

## Owner test flow
1. Select `SYNTHETIC_TEST` in Grand Control.
2. Confirm exactly 10 fixture businesses.
3. Open Wilo Demo Booth and test viewer, products, catalog/resources, consultation ticket, lead/RFQ, analytics and Customer 360.
4. Edit one synthetic company as owner: profile, booth, products, contact, notes and pipeline stage.
5. Exercise outreach, follow-up, demo and pilot states without external email.
6. Return to REAL and verify all REAL commercial metrics are unchanged.
7. Verify Stripe remains TEST and cash charged is $0.00.

PASS only if synthetic data is isolated and REAL metrics remain unchanged.
