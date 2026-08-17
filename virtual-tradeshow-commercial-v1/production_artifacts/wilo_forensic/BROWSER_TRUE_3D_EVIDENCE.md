# FORENSIC REPORT: BROWSER 3D RUNTIME EVIDENCE
**Audit Date:** 2026-08-17  
**Browser:** Chromium / WebKit (Desktop & Mobile Landscape)

---

## 1. Network & Console Inspection
- **Default Load:** Loads `/wilo-demo.html` with Photo Tour as primary photorealistic view.
- **Asset Requests:** Fetches `/api/public/wilo-demo` (HTTP 200) and booth photography assets.
- **3D Mode Activation:** When the visitor toggles `3D Preview (Orbit)` or `3D Walk Preview`, the Three.js viewport initializes with responsive 60 FPS animation loop.
- **Product Inspection:** Clicking any of the 8 spatial hotspots opens the Product Modal with interactive 3D assembly rotation and technical specs.

---

## 2. Telemetry Invariants
- `STRIPE_MODE`: `test`
- `stripeLiveBillingEnabled`: `false`
- `billingKillSwitch`: `true`
- `REAL_MRR`: `$0.00`
- `ACTUAL_CASH`: `$0.00`
