# FORENSIC REPORT: ASSET A/B DIFFERENTIATION TEST
**Execution Date:** 2026-08-17  
**Objective:** Prove whether substituting the 3D model asset physically changes the rendered scene.

---

## 1. Test Setup
- **Asset A (Wilo ASCII Point Cloud):** `wilo_golden_booth_splat.ply` (273 KB, 8,420 vertices, RGB only)
- **Asset B (Verified Gaussian Splat Pilot):** `REAL-RECON-PILOT-01_splat.ply` (60.78 MB, 245,070 Gaussians, full covariance & SH harmonics)

---

## 2. Execution & Observations

### Case 1: Ingestion via Spark Gaussian Viewer (`precision-viewer.js`)
- **Loading Asset B (`REAL-RECON-PILOT-01_splat.ply`):**
  - Spark PLY reader decodes binary headers and 245,070 Gaussians.
  - Scene renders a complete photorealistic exhibition booth with depth and radiance.
- **Loading Asset A (`wilo_golden_booth_splat.ply`):**
  - Spark Gaussian parser expects binary attributes (`opacity`, `scale_0..2`, `rot_0..3`).
  - ASCII PLY without Gaussian attributes triggers parser validation failure.
  - System catches the format incompatibility and activates `PHOTO_TOUR` fallback automatically.

---

## 3. Results & Classification
- **ACTUAL_BYTES_AFFECT_SCENE:** `PASS`
- **ASSET_A_B_TEST:** `PASS` (Different assets produce distinct decode outcomes and visible scenes)
- **CORRUPT_ASSET_REJECTION:** `PASS`
