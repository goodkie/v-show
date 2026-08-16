# GPU Provider Adapters Specification — Virtual Trade Show V1

## Overview
This document specifies the integration interface for external GPU workers (RunPod, Modal, Lambda Labs, AWS EC2, or dedicated on-premise NVIDIA rigs) to process precision 3D Gaussian Splatting and Structure-from-Motion (SfM) reconstruction jobs.

---

## 1. Zero-Cost Dry Run vs Paid Cloud GPU

| Environment | Mode | Trigger Condition | Cost Impact |
| :--- | :--- | :--- | :--- |
| **Local / Dev Trial** | `DRY_RUN=true` | Zero GPU required, simulated pipeline | **$0** |
| **Local NVIDIA GPU** | `DRY_RUN=false` | Local RTX 3080/4090 with CUDA 11.8+ | **$0** (Hardware owned) |
| **RunPod Serverless** | Container Worker | On-demand webhook or job claim polling | ~$0.20–$0.40 / reconstruction |
| **Modal Labs** | Serverless Function | Python `@app.function(gpu="T4"|"A10G")` | ~$0.15–$0.30 / reconstruction |

---

## 2. Worker Protocol & REST Endpoints

### 2.1 Worker Authentication
- All worker endpoints require `Authorization: Bearer <RECONSTRUCTION_WORKER_SECRET>`.

### 2.2 Job Claim Flow (`POST /api/worker/jobs/claim`)
- **Request**:
```json
{
  "workerId": "runpod-worker-instance-01"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "jobId": "recon-job-7a8f9c12",
  "boothId": "booth-demo-01",
  "qualityPreset": "standard",
  "engine": "colmap_nerfstudio_splatfacto",
  "photos": [
    "/uploads/photo-1.jpg",
    "/uploads/photo-2.jpg"
  ],
  "sourcePhotoCount": 35
}
```

### 2.3 Progress Update (`POST /api/worker/jobs/:id/progress`)
- **Stages**:
  - `preparing`
  - `colmap_feature_extraction`
  - `colmap_matching`
  - `colmap_mapping`
  - `nerfstudio_processing`
  - `splat_training`
  - `splat_export`
  - `uploading_result`
  - `completed`

### 2.4 Job Completion (`POST /api/worker/jobs/:id/complete`)
- Submits output model metadata (`.ply` format Gaussian Splat) and diagnostic point counts.

### 2.5 Job Failure Reporting (`POST /api/worker/jobs/:id/fail`)
- Reports safe sanitized error summary without exposing filesystem credentials.
