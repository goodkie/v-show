# dn’a-C01 — 11 PRODUCTION BROWSER E2E TEST REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Production URL**: `https://v-show-commercial-v1-production.up.railway.app`  
**Railway Deployment ID**: `8a87ff7d-942c-4d8f-a5bb-ea62c746c9d0`  

---

## 1. Commercial User Journeys Verification

### Journey A: Visitor → Landing → View Demo → Booth → Product → Catalog → RFQ
- **Flow**: Visitor navigates to `/` -> clicks `View Live 3D Demo` -> opens `/demo.html` -> clicks 3D product plinth hotspot -> inspects 3D model & specs -> clicks `Request Wholesale Pricing / RFQ` -> submits form.
- **Result**: `POST /api/rfqs` returns `201 Created` with unique RFQ reference ID.
- **Status**: **PASS**

### Journey B: Visitor → Landing → Smart Exhibitor Card → Product → Lead Capture
- **Flow**: Visitor clicks `Smart Exhibitor Card` -> opens `/card.html` -> downloads `.vcf` contact file -> fills out `Exchange Digital Business Card` form.
- **Result**: `POST /api/leads` returns `201 Created` and stores buyer contact in `db.leads`.
- **Status**: **PASS**

### Journey C: Visitor → Start My Booth → DIY → Early Access Preview → Managed CTA
- **Flow**: Visitor clicks `Start My Booth` -> explores `CREATE IT YOURSELF` -> views `/builder.html` 9-step pipeline (Badged `EARLY ACCESS / BETA`) -> clicks fallback banner `Request Managed Production Now` -> routes to `/start.html`.
- **Status**: **PASS**

### Journey D: Visitor → Start My Booth → Build It For Me → Production Request → Persistent Record → Internal Production Inbox
- **Flow**: Visitor fills out Managed Production Order Intake at `/start.html` with company, contact, trade show name, and show date -> submits order -> receives confirmation with computed `daysUntilShow` -> order appears in `/production.html` queue.
- **Result**: `POST /api/production-requests` returns `201 Created` and record is visible in `GET /api/production-requests`.
- **Status**: **PASS**

---

## 2. Production Screenshot Artifacts

- [`DNA_C01_PROD_LANDING.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_LANDING.png): Commercial Landing Page
- [`DNA_C01_PROD_DEMO.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_DEMO.png): Live 3D Showroom Demo
- [`DNA_C01_PROD_SMART_CARD.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_SMART_CARD.png): Mobile Smart Exhibitor Card
- [`DNA_C01_PROD_ORDER_FORM.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_ORDER_FORM.png): Managed Production Order Intake
- [`DNA_C01_PROD_INBOX.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_INBOX.png): Internal Production Queue
- [`DNA_C01_PROD_BUILDER.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_BUILDER.png): DIY Builder Preview
- [`DNA_C01_PROD_QR.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C01_PROD_QR.png): Product QR Waypoint
