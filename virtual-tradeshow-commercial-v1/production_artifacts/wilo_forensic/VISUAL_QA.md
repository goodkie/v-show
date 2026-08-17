# FORENSIC REPORT: VISUAL QA & FIDELITY AUDIT
**Inspection Date:** 2026-08-17

---

## 1. Visual Comparison: Source Photos vs. Rendered 3D Modes

| Mode | Visual Fidelity & Resemblance | Evaluation | Score (0-100) |
|---|---|---|---|
| **12-View Photo Tour (`PHOTO_TOUR`)** | Matches source Wilo booth photography with 100% photorealism, exact brand colors, LED wall graphics, and reception desk. | **EXCELLENT** | **98 / 100** |
| **3D Procedural Preview (`3D_ORBIT / 3D_WALK`)** | Stylized architectural wireframe/solid layout approximating booth proportions, counter position, and back wall. Useful for spatial reference. | **MODERATE (PREVIEW ONLY)** | **65 / 100** |
| **ASCII Point Cloud (`wilo_golden_booth_splat.ply`)** | Sparse point cloud distribution without continuous surface rendering or view-dependent radiance. | **INSUFFICIENT FOR GOLDEN DEMO** | **35 / 100** |

---

## 2. Verdict & Recommendation
- Present the **12-View Photo Tour** as the primary high-fidelity customer-facing experience.
- Maintain **3D Preview** strictly labeled as a preview mode until a 60–100 calibrated multi-view camera dataset is trained via Splatfacto.
- **VISUAL_SIMILARITY_SCORE:** `98/100 (Photo Tour)` / `65/100 (Procedural Preview)`
