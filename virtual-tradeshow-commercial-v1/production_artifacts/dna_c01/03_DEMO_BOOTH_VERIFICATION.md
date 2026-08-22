# dn’a-C01 — 03 DEMO BOOTH VERIFICATION REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Page Route**: `/demo.html`  
**Truthful Classification**: `DEMO_3D` / `DESIGNED_3D`  
**Render Engine**: Three.js (r128) WebGL Renderer + OrbitControls  

---

## 1. Environment & Architectural Composition

The commercial demo showroom represents a modern B2B industrial robotics and automation pavilion:
- **Dimensions**: 15m x 10m exhibition stand.
- **Components**:
  - Main floor plinth and architectural rear wall partition.
  - Overhead curved brand canopy with integrated LED glow ribbons.
  - Digital Media Screen on back wall (4m x 2.2m).
  - Front Reception Desk with attendant proxy station.
  - Meeting Lounge with 4 consultation chairs and circular glass table.
  - 8 Interactive Product Plinths with glowing cyan hologram rotation rings.

---

## 2. Interactive Verification Matrix

| Feature | Action / Trigger | Verified Result |
|---|---|---|
| **Hotspot Raycasting** | Click glowing torus marker in 3D scene | Opens Product Detail Drawer with specifications |
| **Camera Zone Navigation** | Click `◉ Products Zone` or `◎ Meeting Lounge` | Smoothly translates camera target to zone |
| **Auto Tour** | Click `↻ Auto Tour` | Orbit camera smoothly revolves 360° around booth |
| **Digital Catalog Hub** | Click `▤ Catalog` on Top/Rail | Opens PDF literature download center |
| **Smart Exhibitor Card** | Click `📱 Smart Card` | Displays sales rep profile + vCard download button |
| **Wholesale RFQ Intake** | Submit quote form in Drawer | Sends `POST /api/rfqs`, persists in `db.json`, returns ID |
| **Sample Evaluation** | Submit sample form in Drawer | Sends `POST /api/samples`, persists in `db.json`, returns ID |
| **Engineering Meeting** | Submit booking in Drawer | Sends `POST /api/appointments`, persists in `db.json`, returns ID |
| **Virtual Briefcase** | Add spec sheet / catalog to briefcase | Increments briefcase counter, persists in session |
| **Showroom Analytics** | Click `📊 Analytics` | Opens drawer with simulated metrics (labeled `DEMO DATA`) |

---

## 3. Truthful Labeling & Wilo Isolation

- The demo booth is explicitly labeled `DESIGNED_3D SHOWROOM DEMO` in the top navigation bar.
- No claims of authentic photogrammetry reconstruction are made for this demo.
- The Wilo authentic dataset and rejected partial model remain 100% isolated.
