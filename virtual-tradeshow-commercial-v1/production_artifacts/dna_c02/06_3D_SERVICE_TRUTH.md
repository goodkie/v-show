# dn’a-C02 — 06 3D SERVICE CLASSIFICATION & TRUTHFULNESS REPORT

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  
**Rule**: Strict Separation between Designed 3D and Authentic Captured 3D  

---

## 1. 3D Service Type Taxonomy

| 3D Service Type | Description | Requirements |
|---|---|---|
| `DESIGNED_DEMO_3D` | Canonical slot-bound 3D demo booth | WebGL Three.js geometry |
| `DESIGNED_CUSTOM_3D` | Custom branded 3D architectural stand | CAD / 3D model upload |
| `PHOTO_TOUR_ONLY` | High-resolution 360° photographic tour | 12+ real camera views |
| `AUTHENTIC_CAPTURED_3D` | Real-world Gaussian photogrammetry | Verified COLMAP SfM + Gaussian training |
| `AUTHENTIC_3D_PENDING` | Real-capture awaiting additional coverage | Physical photo tour fallback |

---

## 2. Integrity Verification

- `FAKE_AUTHENTIC_3D = 0`: No AI-generated or interpolated fake capture views.
- Wilo dataset remains truthful: Photo Tour Primary with 3D Pending.
