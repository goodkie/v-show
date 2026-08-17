# FORENSIC REPORT: WILO PLY ASSET AUDIT
**Inspection Date:** 2026-08-17  
**File Under Audit:** `app_build/data/uploads/organizations/org-wilo-golden-demo/booths/booth-wilo-golden-demo/models/WILO-GOLDEN-RECON-01/wilo_golden_booth_splat.ply`

---

## 1. Physical Byte-Level Inspection

| Property | Measured Value |
|---|---|
| **Absolute File Path** | `E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\data\uploads\organizations\org-wilo-golden-demo\booths\booth-wilo-golden-demo\models\WILO-GOLDEN-RECON-01\wilo_golden_booth_splat.ply` |
| **Physical File Exists** | `true` |
| **Exact File Size** | `273,061 bytes` (~266.66 KB) |
| **SHA-256 Checksum** | `e12e181233cb4f16bb8397188c1c15dfbe8a79d99045128acf249ff3934dbf66` |
| **PLY Format** | `format ascii 1.0` (Text) |
| **Vertex / Element Count** | `8,420` |
| **Properties Count** | `6` (`x`, `y`, `z`, `red`, `green`, `blue`) |
| **Gaussian Splat Attributes** | **`NONE`** (No `rot_0..3`, `scale_0..2`, `opacity`, `f_dc`, `f_rest`) |

---

## 2. Header Content
```
ply
format ascii 1.0
comment Wilo ISH Frankfurt 2026 Golden Demo 3D Reconstruction
comment Produced by Antigravity Precision 3D Engine
element vertex 8420
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
```

---

## 3. Comparison with Verified Gaussian Splat (`REAL-RECON-PILOT-01_splat.ply`)

| Metric | `wilo_golden_booth_splat.ply` | `REAL-RECON-PILOT-01_splat.ply` (Phase 6/7.5) |
|---|---|---|
| **File Format** | ASCII 1.0 | `binary_little_endian 1.0` |
| **File Size** | 273,061 bytes (0.27 MB) | **60,778,917 bytes (60.78 MB)** |
| **Vertex Count** | 8,420 vertices | **245,070 Gaussians** |
| **Properties** | 6 properties (RGB only) | **62 properties** (Covariance, Opacity, 45 SH harmonics) |
| **Classification** | **`NOT_GAUSSIAN_SPLAT`** (Ordinary colored point cloud) | **`GENUINE_3D_GAUSSIAN_SPLAT`** |

---

## 4. Forensic Determination
- **PLY_PHYSICAL_EXISTS:** `yes`
- **PLY_HEADER_VALID:** `yes (ASCII PLY)`
- **PLY_VERTEX_COUNT:** `8,420`
- **PLY_PROPERTY_COUNT:** `6`
- **GAUSSIAN_ATTRIBUTES_PRESENT:** `NO`
- **PLY_CLASSIFICATION:** **`SYNTHETIC_POINT_CLOUD_PLACEHOLDER` / `NOT_GAUSSIAN_SPLAT`**
