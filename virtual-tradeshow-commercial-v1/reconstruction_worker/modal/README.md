# Modal L4 Precision 3D Reconstruction Worker

## Overview
This module provisions a zero cash-cost ($0) cloud GPU reconstruction worker powered by Modal Starter Free Compute credits. It coordinates COLMAP Structure from Motion (SfM) feature extraction, matching, point cloud mapping, and Nerfstudio Splatfacto (3D Gaussian Splatting) training on an NVIDIA L4 (24GB VRAM) cloud instance.

---

## 1. Architecture
```
Local Commercial V1 Server (Railway / Localhost)
    │  (Reconstruction Job Queued: pending)
    ▼
Modal Worker Pipeline (app.py)
    ├─ 1. Image Ingestion (36 synthetic multi-view photos)
    ├─ 2. COLMAP (Exhaustive Feature Extraction & Mapper) -> Camera Registration Verification
    ├─ 3. Nerfstudio Processing (ns-process-data -> transforms.json)
    ├─ 4. Splatfacto Training (ns-train splatfacto on NVIDIA L4 GPU)
    └─ 5. Gaussian Splat Export (ns-export gaussian-splat -> .ply)
    ▼
Local / Railway Server Result Registration
    └─ Worker API (/api/worker/jobs/:id/complete) -> Admin Precision Preview & Verification
```

---

## 2. Prerequisites & Authentication
1. Modal account with active Starter free compute credits.
2. Setup token authentication:
   ```bash
   modal setup
   ```
3. Run Environment & GPU Capability Test:
   ```bash
   modal run virtual-tradeshow-commercial-v1/reconstruction_worker/modal/app.py::validate_environment
   ```

---

## 3. Cost & Safety Guardrails
- **Authorized GPU**: NVIDIA L4 (24GB VRAM, ~ $0.80/hr deducted from free Starter credits).
- **Prohibited GPUs**: A100, H100, H200, B200.
- **Registration Gate**: If COLMAP camera registration rate is `< 60%`, the pipeline halts immediately to prevent wasteful compute consumption.
