# MODEL_ASSET_PROVENANCE.md
# dn'a Commercial Showcase — 3D Asset Provenance & License Registry
# Generated: 2026-08-22

---

## Approved Hero Image

| Field | Value |
|---|---|
| Asset Name | `dna_showcase_photoreal_hero.jpg` |
| Path | `app_build/client/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg` |
| Origin | **Commercial 3D Architectural Render** — Approved by Product Owner |
| Author | dn'a Design Team (via Product Owner / ChatGPT direction) |
| License | **Proprietary — dn'a Commercial Use Only** |
| Reuse Rights | Restricted to dn'a commercial platform presentation |
| Modifications | None — APPROVED COMMERCIAL VISUAL, never to be replaced or regenerated |
| Truthful Label | "DESIGNED 3D SHOWCASE — VISUAL PREVIEW" |
| False Claims | NONE — NOT described as photogrammetry, CAPTURE, or authentic real booth |

---

## 3D Interactive Showroom Architecture

| Asset | Origin | License | Notes |
|---|---|---|---|
| Showroom Floor Platform | Original dn'a parametric code (Three.js BoxGeometry) | **Proprietary** | Exhibition infrastructure — collider/visual dual purpose |
| Floor Cyan LED Edge Trim | Original dn'a procedural | **Proprietary** | Emissive accent strip |
| Overhead Truss Canopy | Original dn'a procedural | **Proprietary** | Structural exhibition canopy |
| Suspended Column Supports | Original dn'a procedural | **Proprietary** | CylinderGeometry — structural element |
| Main Brand Fascia Canvas | Original dn'a CanvasTexture | **Proprietary** | "dn'a INDUSTRIAL INNOVATION" brand sign |
| LED Backlit Media Wall | Original dn'a procedural | **Proprietary** | Emissive screen surface |
| Front Reception Desk | Original dn'a procedural | **Proprietary** | BoxGeometry — architectural desk |
| Meeting Lounge Table | Original dn'a procedural | **Proprietary** | CylinderGeometry — round meeting table |
| Lounge Stools (×4) | Original dn'a procedural | **Proprietary** | CylinderGeometry — ergonomic seating |
| Product Pedestals/Plinths | Original dn'a procedural | **Proprietary** | BoxGeometry — product display plinths |

---

## 8 Fictional Demo Product Models

All 8 products are **FICTIONAL DEMONSTRATION PRODUCTS** created exclusively for the dn'a Virtual Trade Show commercial demo.

They **do not impersonate or replicate** any real product from: ABB, KUKA, FANUC, Siemens, Wilo, Bosch Rexroth, Yaskawa, Mitsubishi, Omron, Cognex, or any other real manufacturer.

| # | Product | Model ID | Origin | License | Geometry Type |
|---|---|---|---|---|---|
| 01 | **Apex Cobot X16** | `APX-CB-16` | Original dn'a 3D Assembly | Proprietary | Multi-part robot arm (CylinderGeometry base + SphereGeometry joints + TorusGeometry flange) |
| 02 | **Vector AMR 600** | `VCT-AMR-600` | Original dn'a 3D Assembly | Proprietary | BoxGeometry chassis + CylinderGeometry LiDAR + TorusGeometry scanner ring |
| 03 | **OptiScan V3** | `OPT-SCN-V3` | Original dn'a 3D Assembly | Proprietary | BoxGeometry body + CylinderGeometry lenses + BoxGeometry projector |
| 04 | **FlexGrip E80** | `FLX-GRP-80` | Original dn'a 3D Assembly | Proprietary | BoxGeometry housing + BoxGeometry adaptive fingers |
| 05 | **FlowDrive P500** | `FLW-DRV-500` | Original dn'a 3D Assembly | Proprietary | CylinderGeometry pump casing + BoxGeometry VFD + CylinderGeometry flanges |
| 06 | **SynchroDrive VFD** | `SNC-VFD-90` | Original dn'a 3D Assembly | Proprietary | BoxGeometry enclosure + PlaneGeometry OLED panel |
| 07 | **EdgeCore IPC** | `EDG-IPC-30` | Original dn'a 3D Assembly | Proprietary | BoxGeometry chassis + SphereGeometry LED status indicators |
| 08 | **LaserCell LX** | `LSR-CEL-LX` | Original dn'a 3D Assembly | Proprietary | BoxGeometry cabinet + PlaneGeometry safety glass + CylinderGeometry tower light |

---

## PBR Material System

All materials use Three.js `MeshStandardMaterial` with the following physically based properties:

| Surface Type | color | metalness | roughness | emissive |
|---|---|---|---|---|
| Powder-coated black metal | `0x0f172a` | 0.8 | 0.3 | none |
| Brushed architectural white | `0xf8fafc` | 0.1 | 0.3 | none |
| Dark exhibition floor | `0x1e293b` | 0.3 | 0.6 | none |
| Cyan LED accent | `0x0284c7` | — | — | `0x0284c7` @ 0.8 |
| Brushed aluminum | `0x94a3b8` | 0.9 | 0.15 | none |
| LED media screen | `0x0369a1` | — | — | `0x0284c7` @ 0.6 |
| Product-specific body | per-product | 0.6 | 0.3 | none |
| Accent emissive ring | per-product accent | — | — | per-product @ 0.9 |

---

## External Assets

| Asset | Source | License |
|---|---|---|
| Three.js r128 | `cdnjs.cloudflare.com` | MIT License |
| OrbitControls.js | `cdn.jsdelivr.net/npm/three@0.128.0` | MIT License |
| Plus Jakarta Sans (font) | Google Fonts | SIL Open Font License |
| JetBrains Mono (font) | Google Fonts | SIL Open Font License |
| AI Catalog Before image | Unsplash (photo-1581092335397) | Unsplash License (free commercial use) |
| AI Catalog After image | Unsplash (photo-1581092160607) | Unsplash License (free commercial use) |

---

## Wilo Separation Compliance

```
WILO_FAILED_MODEL_USED = false
WILO_FALSE_3D_CLAIM = false
PUBLIC_FULL_WILO_3D_ENABLED = false
WILO_R10_5_STATUS = WAITING_FOR_RECAPTURE_UPLOAD
```

The dn'a commercial showcase uses **original dn'a procedural geometry ONLY**.
No Wilo Gaussian splat or failed partial reconstruction is present anywhere in the commercial demo.

---

## Commercial Hard Stops

```
PAYMENT_EXECUTION = false
REAL_CHARGE_COUNT = 0
EPIPAY_DEPENDENCY = 0
FAKE_REAL_ANALYTICS = 0
DEMO_ANALYTICS_LABEL_PRESENT = true
```
