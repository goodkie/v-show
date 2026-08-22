# dn’a-C01 — 01 BASELINE VERIFICATION REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Execution Timestamp**: 2026-08-22  
**Project Root**: `E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1`  
**Git Repository**: `https://github.com/goodkie/v-show.git`  
**Starting Commit**: `62b400bf35f390317dc25746d8aa61a748e95567`  
**Branch**: `master`  

---

## 1. Repository & System State

| Component | Target / Current Path | Verified State |
|---|---|---|
| **Local Project Root** | `E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1` | Verified Active |
| **Python Environment** | `e:\vivpr\ai\v-show-reconstruction-work\python_env\python.exe` | Python 3.10.11 Verified |
| **Node.js Server** | `app_build/server/index.js` | Express.js / WebSockets / JSON DB |
| **Live Production** | `https://v-show-commercial-v1-production.up.railway.app` | Active on Railway |
| **Wilo Status** | `R10.5 — WAITING_FOR_RECAPTURE_UPLOAD` | Intact & Isolated |

---

## 2. Reusable Implementations & Assets Inventory

We inspected `app_build/client/`, `app_build/server/`, `data/`, and `production_artifacts/`. The following verified capabilities are identified for reuse:

1. **Interactive 3D Engine (`demo.html`, `viewer.js`, `booth-engine.js`)**:
   - Three.js (r128) + OrbitControls based 3D scene builder.
   - Hotspot raycasting, camera smooth transition, focus zones, auto tour.
2. **B2B Engagement Endpoints (`server/index.js`, `db.js`)**:
   - `/api/leads`: Lead capture with rate limiting and JSON DB persistence.
   - `/api/rfqs`: RFQ quotation submission with validation and persistence.
   - `/api/samples`: Sample evaluation requests with persistence.
   - `/api/appointments`: Meeting booking requests with persistence.
   - `/api/analytics`: Event telemetry and aggregation.
3. **Multi-Tenant / Organization Isolation (`db.js`)**:
   - Tenant separation via `organizationId` and `boothId`.
4. **Wilo Hard Boundary Verification**:
   - `wilo-demo.html` is strictly separated as Photo Tour Primary + 3D Pending.
   - Failed experimental partial Gaussian model is strictly restricted to `/diagnostics/`.

---

## 3. Scope & Commercial Strategy for C01

- **Primary Commercial Mission**: Build a high-converting, professional commercial landing page and sales demo for **dn’a** that can take production orders from trade show exhibitors today.
- **Two Distinct Paths**:
  - **DIY Booth Builder** (*Early Access / Beta Preview*)
  - **Managed Production** (*Available Now — Primary Commercial CTA*)
- **First-Class Show Date Awareness**: Show dates and days-until-show tracked in production request intake.
- **Payment Hard Stop**: `PAYMENT_EXECUTION = false`, `REAL_CHARGE_COUNT = 0`, `EPIPAY_DEPENDENCY = 0`.
