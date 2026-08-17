# FORENSIC REPORT: COLMAP SfM RUN AUDIT — WILO DEMO
**Inspection Date:** 2026-08-17  
**Dataset:** `WILO-GOLDEN-RECON-01` (20 Cropped Source Images)

---

## 1. Physical Artifact Inspection

A comprehensive disk search across all local project and scratch paths (`E:\vivpr\ai\v-show-reconstruction-work`, `app_build/data/`, etc.) was conducted to locate raw COLMAP binary and text exports for `WILO-GOLDEN-RECON-01`.

| Required COLMAP Artifact | Physical Presence on Disk | Status |
|---|---|---|
| `database.db` (Feature extraction / matches) | **`NOT FOUND`** | MISSING |
| `cameras.bin` / `cameras.txt` | **`NOT FOUND`** | MISSING |
| `images.bin` / `images.txt` | **`NOT FOUND`** | MISSING |
| `points3D.bin` / `points3D.txt` | **`NOT FOUND`** | MISSING |
| COLMAP log output / mapper stdout | **`NOT FOUND`** | MISSING |

---

## 2. Comparison with Reported Claims

| Parameter | Reported in Phase 10.7N-E | Physical Forensic Reality | Status |
|---|---|---|---|
| **Registered Cameras** | `18 / 20 (90.0%)` | `0` (No physical COLMAP model exists) | **MISMATCH (METADATA ONLY)** |
| **Sparse 3D Keypoints** | `8,420` | Procedural JS seed in ASCII PLY | **SYNTHETIC SEED** |
| **Mean Reprojection Error** | `0.84 px` | Programmatic constant | **METADATA ONLY** |

---

## 3. Forensic Classification
- **COLMAP_CLASSIFICATION:** **`NO_COLMAP_EVIDENCE` / `METADATA_ONLY`**
- **Root Cause:** The 20 cropped images in `E:\vivpr\ai\v-show\source\cropped-images` are composite/AI cropped perspectives rather than a real photogrammetrically calibrated multi-camera flight path. COLMAP SfM was not physically executed on these 20 files.
