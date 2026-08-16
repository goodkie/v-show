# Virtual Trade Show Commercial V1 — Precision 3D Reconstruction Worker

## Overview
This standalone worker polls the Virtual Trade Show server for pending 3D reconstruction jobs, runs the Structure-from-Motion (COLMAP) and Gaussian Splatting (Nerfstudio Splatfacto) pipeline on local or cloud NVIDIA GPUs, and uploads web-optimized 3D spatial models (PLY/SPLAT) back to the server.

---

## 1. Operating Modes

### 1.1 Dry Run Mode (Default / Zero-Cost Trial)
- **`DRY_RUN=true`**:
  - Requires **zero GPU**, zero CUDA, and zero external binary installations.
  - Automatically simulates full photogrammetry & Gaussian Splatting lifecycle (`preparing` → `colmap_feature_extraction` → `colmap_matching` → `colmap_mapping` → `splat_training` → `splat_export` → `uploading_result` → `completed`).
  - Generates valid demo output metadata and sparse point metrics for $0 testing.

### 1.2 Real GPU Execution Mode
- **`DRY_RUN=false`**:
  - Automatically detects local `colmap`, `ns-process-data`, `ns-train splatfacto`, and `ns-export gaussian-splat`.
  - If binaries are missing, reports graceful failure diagnostics with exact installation instructions.

---

## 2. Quickstart

### Setup Virtual Environment
```bash
cd virtual-tradeshow-commercial-v1/reconstruction_worker
python -m venv venv
source venv/bin/activate  # Or on Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Configure Environment
```bash
cp config.example.env .env
# Edit .env to set SERVER_URL and WORKER_SECRET
```

### Run Worker in Dry Run Mode ($0)
```bash
python worker.py
```
