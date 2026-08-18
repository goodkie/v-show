# WILO RECONSTRUCTION EXPERIMENT HISTORY
**Last Updated:** 2026-08-17

---

## 1. Phase History Matrix
| Phase | Reconstruction ID | Dataset ID | Source Description | Registered / Total | Registration Rate | Sparse Points | Result Classification | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 10.7N-G** | `WILO-REAL-RECON-01` | `WILO-AI-CROPS-20` | 20 AI Crop Perspectives | 0 / 20 | 0.0% | 0 | `COLMAP_FAILED` | `WILO_SOURCE_DATA_INSUFFICIENT` |
| **Phase 10.7N-H** | `WILO-REAL-RECON-02` | `WILO-GEOMETRY-60-01` | 60-View Fixed 3D Studio (Rings A/B/C) | 60 / 60 | 100.0% | 54,800 | `COLMAP_QUALIFICATION_GOLD` | **`WILO_60VIEW_COLMAP_GOLD`** |

---

## 2. Key Learnings
1. Independent AI-generated crop images lack parallax continuity and geometric epipolar constraints, leading to total SfM failure (0/20 registered).
2. Deterministic multi-ring orbit trajectories with persistent visual texture landmarks achieve 100.0% (60/60) registration with 54,800 sparse points on Modal L4 GPU.
