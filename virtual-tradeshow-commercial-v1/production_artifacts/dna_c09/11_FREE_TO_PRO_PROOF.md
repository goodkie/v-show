# dn’a-C09.11 — FREE → PRO Conversion Proof

## Verification Proof
1. Free Project Created: `prj-free-001` (1 booth photo, 1 product, 1 pinpoint).
2. Customer selects PRO (\$299/mo) and completes Stripe Checkout.
3. Webhook received: `checkout.session.completed` for `prj-free-001`.
4. State updated: `commercialState = "ACTIVE_PRO"`.
5. **Project Continuity**:
   - `projectId`: `prj-free-001` (Strictly identical)
   - `boothPhotoUrl`: Unchanged
   - `products`: Exact product preserved
   - `pinpoints`: Exact pinpoint at `(u, v)` preserved
   - `FREE_TO_PRO_DATA_REENTRY = 0`.
