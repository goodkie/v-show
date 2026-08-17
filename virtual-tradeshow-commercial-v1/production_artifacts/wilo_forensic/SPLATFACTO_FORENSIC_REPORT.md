# FORENSIC REPORT: SPLATFACTO / NERFSTUDIO TRAINING AUDIT
**Inspection Date:** 2026-08-17  
**Model Under Audit:** `WILO-GOLDEN-RECON-01`

---

## 1. Physical Training Evidence Inspection

A forensic scan for Nerfstudio / Splatfacto GPU training checkpoints, config files, and export logs was performed.

| Required Splatfacto Artifact | Physical Presence on Disk | Status |
|---|---|---|
| `config.yml` (Nerfstudio pipeline config) | **`NOT FOUND`** | MISSING |
| `step-000030000.ckpt` (Model checkpoint) | **`NOT FOUND`** | MISSING |
| `transforms.json` (Camera poses dataparser) | **`NOT FOUND`** | MISSING |
| `ns-train` execution logs | **`NOT FOUND`** | MISSING |
| `ns-export gaussian-splat` export log | **`NOT FOUND`** | MISSING |

---

## 2. Comparison with Verified Phase 6 Pilot
- In Phase 6, Nerfstudio Splatfacto was physically executed on Modal L4 GPU for `phase6_test_booth` (producing the 60.78 MB `REAL-RECON-PILOT-01_splat.ply`).
- For `WILO-GOLDEN-RECON-01`, no Modal GPU training run was executed.

---

## 3. Forensic Classification
- **NERFSTUDIO_TRAINING_EVIDENCE:** **`NO_TRAINING_EVIDENCE`**
- **SPLATFACTO_EXPORT_EVIDENCE:** **`NONE`**
- **Classification:** **`NO_TRAINING_EVIDENCE`**
