# 3D RECONSTRUCTION & QUALITY GATE REPORT — WILO GOLDEN DEMO

**Model ID:** `WILO-GOLDEN-RECON-01`
**Source Capture:** `WILO-GOLDEN-RECON-01`
**Quality Gate State:** **`GOLDEN_DEMO`**

## 1. Camera Registration & Preflight Diagnostics

| Parameter | Measured Value | Threshold / Target | Status |
|---|---|---|---|
| **Input Images** | 20 | >= 15 for Good | PASS |
| **Registered Cameras** | 18 / 20 | >= 75% | **90.0% (PASS)** |
| **Matched Image Pairs** | 142 | >= 50 | PASS |
| **Sparse 3D Keypoints** | 8,420 | >= 2,000 | PASS |
| **Mean Reprojection Error** | 0.84 px | < 1.5 px | PASS (Sub-pixel) |
| **Preflight Determination** | **RECONSTRUCTION_READY** | RECONSTRUCTION_READY | **APPROVED** |

## 2. Generated 3D Physical Assets

| Filename | Format | Size (Bytes) | SHA-256 | Storage Path |
|---|---|---|---|---|
| `wilo_golden_booth_splat.ply` | PLY | 273,061 | `e12e181233cb4f16...` | `/uploads/organizations/org-wilo-golden-demo/booths/booth-wilo-golden-demo/models/WILO-GOLDEN-RECON-01/wilo_golden_booth_splat.ply` |
| `wilo_golden_booth_proxy.glb` | GLB | 48 | `c35d0f4c2c6c2c87...` | `/uploads/organizations/org-wilo-golden-demo/booths/booth-wilo-golden-demo/models/WILO-GOLDEN-RECON-01/wilo_golden_booth_proxy.glb` |
