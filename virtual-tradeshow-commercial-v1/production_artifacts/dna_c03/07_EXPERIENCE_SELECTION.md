# dn’a-C03 — 07 BOOTH EXPERIENCE TYPE SELECTION & 3D TRUTHFULNESS

**Status**: `IMPLEMENTED & VERIFIED`  
**Truthfulness Rule**: `FAKE_AUTHENTIC_3D = 0`  

## 1. Curated Experience Types

| Experience Type | Classification | Behavior & Delivery |
|---|---|---|
| **DIGITAL SHOWROOM** | Standard Beta | Turnkey responsive 3D-styled interactive web showroom with plinths, smart card, and QR waypoints. |
| **PHOTO TOUR** | Photographic | High-resolution 360° panoramic navigation nodes connected to live product drawers. |
| **DESIGNED 3D** | Interactive WebGL | Architectural 3D space with OrbitControls, custom materials, and directional lighting. |
| **AUTHENTIC 3D** | Capture Review Required | Real photogrammetry Gaussian splatting reconstruction. **Truthfully requires dn'a 3D Review team approval.** |

## 2. Authentic 3D Routing
When an exhibitor selects Authentic 3D, the system sets `authentic3dReviewRequested: true` and routes the project to the Managed Production Queue for photogrammetry preflight.
