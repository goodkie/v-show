# PHASE 10.6B EXHAUSTIVE TEST MATRIX (65-ITEM AUDIT)
**Virtual Trade Show Commercial V1 — Pre-Live Verification Matrix**

---

## Group 1: Business Identity & Configuration (8 Items)
1. Business identity centralized in `server/db.js`
2. Legal business name is `vivPR`
3. Legal business address is `1633 Center Ave, Fort Lee, NJ 07024, United States`
4. Legal contact email is `info@vivpr.pro`
5. Legal support email is `info@vivpr.pro`
6. Governing law is `State of New Jersey, United States`
7. Stripe statement descriptor is `VIVPR V-SHOW`
8. Grand Control displays Business Identity status as `COMPLETE` (`READY`)

## Group 2: Pilot Pricing & Entitlements (8 Items)
9. Pricing version is `pilot-2026.1`
10. Pricing status is `approved_for_pilot`
11. FREE plan monthly price is `$0` (0 reconstruction credits)
12. PRO plan monthly price is `$299` (1 reconstruction credit, Spark 3DGS)
13. BUSINESS plan monthly price is `$799` (3 reconstruction credits, priority GPU)
14. Pricing currency is `USD`
15. Billing interval is `Monthly Recurring`
16. Permanent pricing remains unapproved pending empirical live pilot data

## Group 3: Canonical Healthcheck & API Safety (6 Items)
17. Canonical route `/health` returns HTTP 200
18. Healthcheck payload contains `ok: true`
19. Healthcheck payload contains `schemaVersion: 5`
20. Healthcheck payload contains `stripeMode: test`
21. Healthcheck does NOT leak private paths or secrets
22. Legacy alias `/api/health` returns identical minimal response

## Group 4: Legal & Policy Drafts Integrity (8 Items)
23. Terms of Service (`/terms.html`) displays DRAFT banner
24. Privacy Policy (`/privacy.html`) displays DRAFT banner
25. Refund Policy (`/refund-policy.html`) displays DRAFT banner
26. Terms references legal name `vivPR` and NJ governing law
27. Privacy policy references `vivPR Privacy Desk` and Stripe Level 1 PCI
28. Refund policy specifies 7-day pre-GPU refund window
29. Zero AI foundational model training disclosure verified in terms
30. Legal review status in Grand Control remains `PENDING` (`BLOCKED`)

## Group 5: Tax & Accounting Governance (6 Items)
31. Tax readiness status in Grand Control is `REVIEW_REQUIRED`
32. Stripe Tax automated calculation remains NOT enabled
33. Multi-state US economic nexus review documented in handoff
34. International EU VAT reverse charge disclosures documented
35. NJ state sales tax characterization review documented
36. Tax blocker in Grand Control prevents automated live activation

## Group 6: Stripe Test Billing Lifecycle & First Customer Rehearsal (10 Items)
37. Test customer organization created in `TEST` environment (Never `REAL`)
38. Mandatory un-checked checkout consent required before Stripe Checkout
39. Immutable consent audit event logged in `db.billingEvents` with policy versions
40. Simulated PRO Stripe Checkout session created with test price `$299`
41. Simulated webhook event transitions account from FREE to PRO
42. PRO entitlements activated (1 credit, 25 products, 15 hotspots)
43. Reconstruction request created under Double-Gate guard
44. Simulated cancellation at period end updates subscription status
45. Customer Portal link returns valid session URL
46. REAL KPI remains un-contaminated (`REAL Customers = 0`, `REAL MRR = $0`)

## Group 7: Downgrade & Data Preservation (5 Items)
47. PRO to FREE downgrade preserves existing products (no destructive delete)
48. Downgrade preserves existing hotspots and leads
49. Generated 3D SPZ/PLY models remain intact
50. Over-limit product creations blocked on Free tier
51. Past due grace period (7 days) preserves booth availability

## Group 8: Multi-Tenant Security & Password Policy (8 Items)
52. Exhibitor cannot access other exhibitors' leads (403 Forbidden)
53. Organizer cannot modify platform owner feature flags (403 Forbidden)
54. Platform Owner endpoints protected by RBAC
55. Server enforces minimum 12-character passwords
56. Server rejects weak passwords with structured `code: 'WEAK_PASSWORD'`
57. Temporary passwords generated with 16+ cryptographic characters
58. First login forces password change for all roles
59. Old temporary password invalidated immediately upon update

## Group 9: Localization, Mobile Landscape & 3D Rendering (6 Items)
60. Client UI regex scan confirms 0 Hangul characters across all client files
61. Mobile Landscape 3D Player handles `matchMedia('(orientation: landscape)')`
62. Safe-area insets (`env(safe-area-inset-*)`) and `100dvh` applied
63. Genuine SPZ Gaussian Splat model loads via Three.js SplatMesh
64. WebGL context loss recovery handlers registered
65. Disaster recovery backup & restore drill achieves 100% data integrity
